// ========================================================================
// ===== IMPORTS =====
// ========================================================================
const {
  onDocumentCreated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ========================================================================
// ===== CONFIG =====
// ========================================================================
const CONFIG = {
  COLLECTIONS: {
    USERS: "users",
    MATCHES: "matches",
    INVITATION_TOKENS: "invitationTokens",
    INVITATION_CODES: "invitationCodes",
    POINTS_HISTORY: "pointsHistory",
  },
  ELO: {
    DEFAULT_RATING: 0, // Start at 0 Elo for 8-week study
    K_FACTOR: 32,
    SEASON_POINT_FACTOR: 0.5,
    HANDICAP_SEASON_POINTS: 8, // Feste Punktzahl für Handicap-Spiele
    // Elo Gates: Once reached, Elo can never fall below these thresholds (adjusted for study)
    GATES: [50, 100, 250, 500, 1000, 2000],
  },
  REGION: "europe-west3",
};

// ========================================================================
// ===== FUNKTION: Elo-Gates =====
// ========================================================================
/**
 * Find the highest Elo gate a player has reached
 * @param {number} currentElo - Player's current Elo
 * @param {number} highestElo - Player's highest Elo ever
 * @return {number} The highest gate reached (or 0 if none)
 */
function getHighestEloGate(currentElo, highestElo) {
  const maxReached = Math.max(currentElo, highestElo || 0);
  const gates = CONFIG.ELO.GATES;

  for (let i = gates.length - 1; i >= 0; i--) {
    if (maxReached >= gates[i]) {
      return gates[i];
    }
  }
  return 0; // No gate reached
}

/**
 * Apply Elo gate protection: Elo can never fall below the highest gate reached
 * @param {number} newElo - The calculated new Elo
 * @param {number} currentElo - Player's current Elo
 * @param {number} highestElo - Player's highest Elo ever
 * @return {number} Protected Elo (at least as high as the gate)
 */
function applyEloGate(newElo, currentElo, highestElo) {
  const gate = getHighestEloGate(currentElo, highestElo);
  return Math.max(newElo, gate);
}

// ========================================================================
// ===== FUNKTION: Elo-Berechnung =====
// ========================================================================
/**
 * Berechnet neue Elo-Ratings für Gewinner und Verlierer.
 * @param {number} winnerElo - Aktuelles Elo-Rating des Gewinners.
 * @param {number} loserElo - Aktuelles Elo-Rating des Verlierers.
 * @param {number} [kFactor=32] - Einflussfaktor für die Berechnung.
 * @return {{newWinnerElo: number, newLoserElo: number, eloDelta: number}}
 */
function calculateElo(winnerElo, loserElo, kFactor = 32) {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerElo = Math.round(winnerElo + kFactor * (1 - expectedWinner));
  const newLoserElo = Math.round(loserElo + kFactor * (0 - expectedLoser));
  const eloDelta = Math.abs(newWinnerElo - winnerElo);

  return {newWinnerElo, newLoserElo, eloDelta};
}

// ========================================================================
// ===== FUNKTION 1: Verarbeitet ein gemeldetes Match =====
// ========================================================================
exports.processMatchResult = onDocumentCreated(
  {
    region: CONFIG.REGION,
    document: `${CONFIG.COLLECTIONS.MATCHES}/{matchId}`,
  },
  async (event) => {
    const {matchId} = event.params;
    const snap = event.data;

    if (!snap) {
      logger.error("❌ Keine Daten im Event-Snapshot gefunden.", {event});
      return;
    }

    const matchData = snap.data();
    if (matchData.processed) {
      logger.log(`ℹ️ Match ${matchId} wurde bereits verarbeitet.`);
      return;
    }

    const {winnerId, loserId, handicapUsed} = matchData;
    if (!winnerId || !loserId) {
      logger.error(`❌ Ungültige Daten: Spieler-IDs in Match ${matchId} fehlen.`);
      return;
    }

    const winnerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(winnerId);
    const loserRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(loserId);

    try {
      const [winnerDoc, loserDoc] = await Promise.all([
        winnerRef.get(),
        loserRef.get(),
      ]);

      if (!winnerDoc.exists || !loserDoc.exists) {
        throw new Error(
          `Spieler nicht gefunden: winnerId=${winnerId}, loserId=${loserId}`
        );
      }

      const winnerData = winnerDoc.data();
      const loserData = loserDoc.data();

      // *** HIER IST DIE KORREKTUR ***
      // Wir verwenden '??' (Nullish Coalescing Operator) statt '||' (Logisches ODER).
      // '??' behandelt 0 als gültigen Wert und greift nur auf 0 zurück, 
      // wenn 'eloRating' null oder undefined ist.
      const winnerElo = winnerData.eloRating ?? CONFIG.ELO.DEFAULT_RATING;
      const loserElo = loserData.eloRating ?? CONFIG.ELO.DEFAULT_RATING;
      
      const winnerHighestElo = winnerData.highestElo || winnerElo;
      const loserHighestElo = loserData.highestElo || loserElo;

      const {newWinnerElo, newLoserElo, eloDelta} = calculateElo(
        winnerElo,
        loserElo,
        CONFIG.ELO.K_FACTOR
      );

      // Apply Elo gate protection for loser
      const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserHighestElo);

      // Update highest Elo if new records are set
      const newWinnerHighestElo = Math.max(newWinnerElo, winnerHighestElo);
      const newLoserHighestElo = Math.max(protectedLoserElo, loserHighestElo);

      let seasonPointChange;
      let matchTypeReason = "Wettkampf";

      if (handicapUsed) {
        seasonPointChange = CONFIG.ELO.HANDICAP_SEASON_POINTS;
        matchTypeReason = "Handicap-Wettkampf";
        logger.info(
          `ℹ️ Handicap-Match ${matchId}: Feste Punktevergabe von ${seasonPointChange}.`
        );
      } else {
        const pointFactor = eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR;
        seasonPointChange = Math.round(pointFactor);
        logger.info(
          `ℹ️ Standard-Match ${matchId}: Dynamische Punktevergabe von ${seasonPointChange}.`
        );
      }

      // Calculate actual points changes (considering floor at 0)
      const winnerCurrentPoints = winnerData.points || 0;
      const loserCurrentPoints = loserData.points || 0;
      const loserActualPointsChange = Math.max(-loserCurrentPoints, -seasonPointChange); // Can't go below 0

      const batch = db.batch();

      // Update winner with XP tracking and highest Elo
      batch.update(winnerRef, {
        eloRating: newWinnerElo,
        highestElo: newWinnerHighestElo,
        points: admin.firestore.FieldValue.increment(seasonPointChange),
        xp: admin.firestore.FieldValue.increment(seasonPointChange), // XP = points for matches
        lastXPUpdate: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update loser (Elo protected by gates, XP never decreases!)
      batch.update(loserRef, {
        eloRating: protectedLoserElo,
        highestElo: newLoserHighestElo,
        points: admin.firestore.FieldValue.increment(-seasonPointChange),
        // Note: XP is NOT decremented - it only goes up!
      });

      // Calculate Elo changes
      const winnerEloChange = newWinnerElo - winnerElo;
      const loserEloChange = protectedLoserElo - loserElo;

      const winnerHistoryRef = winnerRef
        .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
        .doc();
      batch.set(winnerHistoryRef, {
        points: seasonPointChange,
        xp: seasonPointChange, // Winner gains XP equal to points
        eloChange: winnerEloChange,
        reason: `Sieg im ${matchTypeReason} gegen ${
          loserData.firstName || "Gegner"
        }`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: "System (Wettkampf)",
      });

      const loserHistoryRef = loserRef
        .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
        .doc();
      batch.set(loserHistoryRef, {
        points: loserActualPointsChange, // Use actual change (floored at 0)
        xp: 0, // Loser doesn't lose XP
        eloChange: loserEloChange,
        reason: `Niederlage im ${matchTypeReason} gegen ${
          winnerData.firstName || "Gegner"
        }`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: "System (Wettkampf)",
      });

      // Track XP in separate history for winner only (losers don't lose XP)
      const winnerXPHistoryRef = winnerRef.collection("xpHistory").doc();
      batch.set(winnerXPHistoryRef, {
        xp: seasonPointChange,
        reason: `Sieg im ${matchTypeReason} gegen ${
          loserData.firstName || "Gegner"
        }`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: "System (Wettkampf)",
      });

      batch.update(snap.ref, {
        processed: true,
        pointsExchanged: seasonPointChange,
      });

      await batch.commit();

      logger.info(`✅ Match ${matchId} verarbeitet.`, {
        handicapUsed,
        pointsExchanged: seasonPointChange,
        winnerId,
        loserId,
      });
    } catch (error) {
      logger.error(`💥 Fehler bei Verarbeitung von Match ${matchId}:`, error);
    }
  }
);

// ========================================================================
// ===== FUNKTION 2: Erstellt Auth User für einen Spieler =====
// ========================================================================
exports.createAuthUserForPlayer = onCall(
  {region: CONFIG.REGION},
  async (request) => {
    const callerUid = request.auth.uid;
    const callerDoc = await db
      .collection(CONFIG.COLLECTIONS.USERS)
      .doc(callerUid)
      .get();

    if (
      !callerDoc.exists ||
      !["admin", "coach"].includes(callerDoc.data().role)
    ) {
      throw new HttpsError(
        "permission-denied",
        "Nur Coaches oder Admins dürfen diese Aktion ausführen."
      );
    }

    const {playerId, playerEmail} = request.data;
    if (!playerId || !playerEmail) {
      throw new HttpsError(
        "invalid-argument",
        "Spieler-ID und E-Mail sind erforderlich."
      );
    }

    try {
      await admin.auth().createUser({
        uid: playerId,
        email: playerEmail,
      });

      const playerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(playerId);
      await playerRef.update({
        isOffline: false,
        email: playerEmail,
      });

      logger.info(`Auth-Benutzer für Spieler ${playerId} wurde erstellt.`);
      return {success: true};
    } catch (error) {
      logger.error(`Fehler beim Erstellen des Auth-Users für ${playerId}:`, error);

      if (error.code === "auth/email-already-exists") {
        const user = await admin.auth().getUserByEmail(playerEmail);
        if (user.uid === playerId) {
          logger.info(
            `Auth-Benutzer ${playerId} existiert bereits. Überspringe.`
          );
          return {success: true};
        }
        throw new HttpsError(
          "already-exists",
          "Diese E-Mail wird bereits von einem anderen Account verwendet."
        );
      }
      throw new HttpsError(
        "internal",
        "Der Auth-Benutzer konnte nicht erstellt werden."
      );
    }
  }
);

// ========================================================================
// ===== FUNKTION 3: Alte Invitation-Tokens automatisch löschen =====
// ========================================================================
exports.cleanupInvitationTokens = onSchedule(
  {
    schedule: "every 24 hours",
    region: CONFIG.REGION,
  },
  async () => {
    const retentionDays = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`Suche Tokens älter als ${cutoffDate.toISOString()}...`);

    const oldTokensQuery = db
      .collection(CONFIG.COLLECTIONS.INVITATION_TOKENS)
      .where(
        "createdAt",
        "<",
        admin.firestore.Timestamp.fromDate(cutoffDate)
      );

    const snapshot = await oldTokensQuery.get();

    if (snapshot.empty) {
      logger.info("Keine alten Tokens zum Löschen gefunden.");
      return null;
    }

    const batch = db.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    logger.info(`🧹 ${snapshot.size} alte Invitation-Tokens gelöscht.`);
    return null;
  }
);

// ========================================================================
// ===== FUNKTION 4: Setzt Custom Claims bei User-Änderung =====
// ========================================================================
exports.setCustomUserClaims = onDocumentWritten(
  {
    region: CONFIG.REGION,
    document: "users/{userId}",
  },
  async (event) => {
    const userDocAfter = event.data.after.data();
    const userId = event.params.userId;

    if (!userDocAfter) {
      logger.info(`Benutzer ${userId} wurde gelöscht, Claims entfernt.`);
      return null;
    }

    const role = userDocAfter.role;
    const clubId = userDocAfter.clubId;

    const claims = {};
    if (role) claims.role = role;
    if (clubId) claims.clubId = clubId;

    if (Object.keys(claims).length > 0) {
      try {
        await admin.auth().setCustomUserClaims(userId, claims);
        logger.info(`Claims für ${userId} gesetzt:`, claims);
      } catch (error) {
        logger.error(`Fehler beim Setzen der Claims für ${userId}:`, error);
      }
    }
  }
);

// ========================================================================
// ===== FUNKTION 5: Claim Invitation Code (Code-basierte Registrierung) =====
// ========================================================================
exports.claimInvitationCode = onCall(
  {region: CONFIG.REGION},
  async (request) => {
    // 1. Check if user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Du musst angemeldet sein, um einen Code einzulösen."
      );
    }

    const userId = request.auth.uid;
    const {code, codeId} = request.data;

    if (!code || !codeId) {
      throw new HttpsError(
        "invalid-argument",
        "Code und Code-ID sind erforderlich."
      );
    }

    try {
      // 2. Get code document
      const codeRef = db.collection(CONFIG.COLLECTIONS.INVITATION_CODES).doc(codeId);
      const codeDoc = await codeRef.get();

      if (!codeDoc.exists) {
        throw new HttpsError("not-found", "Dieser Code existiert nicht.");
      }

      const codeData = codeDoc.data();

      // 3. Validate code
      if (codeData.code !== code) {
        throw new HttpsError("invalid-argument", "Code stimmt nicht überein.");
      }

      if (codeData.used) {
        throw new HttpsError("already-exists", "Dieser Code wurde bereits verwendet.");
      }

      const now = admin.firestore.Timestamp.now();
      if (codeData.expiresAt.toMillis() < now.toMillis()) {
        throw new HttpsError("failed-precondition", "Dieser Code ist abgelaufen.");
      }

      // 4. Check if user document already exists
      const userRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(userId);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        throw new HttpsError(
          "already-exists",
          "Ein Profil für diesen Benutzer existiert bereits."
        );
      }

      // 5. Create user document with data from code
      const userData = {
        email: request.auth.token.email || "",
        firstName: codeData.firstName || "",
        lastName: codeData.lastName || "",
        clubId: codeData.clubId,
        role: "player",
        subgroupIds: codeData.subgroupIds || [],
        points: 0,
        xp: 0,
        eloRating: CONFIG.ELO.DEFAULT_RATING,
        highestElo: CONFIG.ELO.DEFAULT_RATING,
        wins: 0,
        losses: 0,
        onboardingComplete: false,
        isOffline: false,
        createdAt: now,
        photoURL: "",
      };

      await userRef.set(userData);
      logger.info(`User-Dokument für ${userId} erstellt via Code ${code}`);

      // 6. Mark code as used
      await codeRef.update({
        used: true,
        usedBy: userId,
        usedAt: now,
      });

      logger.info(`Code ${code} als verwendet markiert von User ${userId}`);

      return {
        success: true,
        message: "Code erfolgreich eingelöst!",
      };
    } catch (error) {
      logger.error(`Fehler beim Einlösen des Codes ${code}:`, error);

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Ein unerwarteter Fehler ist aufgetreten."
      );
    }
  }
);

// ========================================================================
// ===== FUNKTION 6: Cleanup Expired Invitation Codes (Scheduled) =====
// ========================================================================
exports.cleanupExpiredInvitationCodes = onSchedule(
  {
    schedule: "every 24 hours",
    region: CONFIG.REGION,
    timeZone: "Europe/Berlin",
  },
  async (event) => {
    const now = admin.firestore.Timestamp.now();
    const codesRef = db.collection(CONFIG.COLLECTIONS.INVITATION_CODES);

    try {
      const expiredCodesSnapshot = await codesRef
        .where("expiresAt", "<", now)
        .get();

      if (expiredCodesSnapshot.empty) {
        logger.info("Keine abgelaufenen Einladungscodes gefunden.");
        return null;
      }

      const batch = db.batch();
      let deleteCount = 0;

      expiredCodesSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        deleteCount++;
      });

      await batch.commit();
      logger.info(`${deleteCount} abgelaufene Einladungscodes gelöscht.`);

      return {success: true, deletedCount: deleteCount};
    } catch (error) {
      logger.error("Fehler beim Bereinigen der Einladungscodes:", error);
      return {success: false, error: error.message};
    }
  }
);