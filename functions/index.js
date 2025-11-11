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
    MATCH_REQUESTS: "matchRequests",
    INVITATION_TOKENS: "invitationTokens",
    INVITATION_CODES: "invitationCodes",
    POINTS_HISTORY: "pointsHistory",
  },
  ELO: {
    DEFAULT_RATING: 800, // Start at 800 Elo (new system)
    K_FACTOR: 32,
    SEASON_POINT_FACTOR: 0.2, // Season Points = Elo-Gewinn × 0.2
    HANDICAP_SEASON_POINTS: 8, // Feste Punktzahl für Handicap-Spiele
    // Elo Gates: Once reached, Elo can never fall below these thresholds
    GATES: [850, 900, 1000, 1100, 1300, 1600],
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

// Export functions for testing
exports._testOnly = {
  calculateElo,
  getHighestEloGate,
  applyEloGate,
  CONFIG,
};

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

      let newWinnerElo;
      let newLoserElo;
      let protectedLoserElo;
      let newWinnerHighestElo;
      let newLoserHighestElo;
      let winnerEloChange;
      let loserEloChange;
      let seasonPointChange;
      let winnerXPGain = 0; // XP only for standard matches
      let matchTypeReason = "Wettkampf";

      if (handicapUsed) {
        // Handicap matches: Fixed Elo changes (+8/-8), no XP
        seasonPointChange = CONFIG.ELO.HANDICAP_SEASON_POINTS; // 8
        matchTypeReason = "Handicap-Wettkampf";

        // Fixed Elo changes for handicap matches
        newWinnerElo = winnerElo + CONFIG.ELO.HANDICAP_SEASON_POINTS; // +8
        newLoserElo = loserElo - CONFIG.ELO.HANDICAP_SEASON_POINTS; // -8

        // Apply Elo gate protection for loser
        protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserHighestElo);

        // Update highest Elo if new records are set
        newWinnerHighestElo = Math.max(newWinnerElo, winnerHighestElo);
        newLoserHighestElo = Math.max(protectedLoserElo, loserHighestElo);

        // Calculate actual Elo changes
        winnerEloChange = newWinnerElo - winnerElo;
        loserEloChange = protectedLoserElo - loserElo;

        logger.info(
          `ℹ️ Handicap-Match ${matchId}: Feste Punktevergabe ${seasonPointChange}, feste Elo-Änderung ±${CONFIG.ELO.HANDICAP_SEASON_POINTS}.`
        );
      } else {
        // Standard matches: Calculate Elo dynamically and award XP
        const {newWinnerElo: calculatedWinnerElo, newLoserElo: calculatedLoserElo, eloDelta} = calculateElo(
          winnerElo,
          loserElo,
          CONFIG.ELO.K_FACTOR
        );
        newWinnerElo = calculatedWinnerElo;
        newLoserElo = calculatedLoserElo;

        // Apply Elo gate protection for loser
        protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserHighestElo);

        // Update highest Elo if new records are set
        newWinnerHighestElo = Math.max(newWinnerElo, winnerHighestElo);
        newLoserHighestElo = Math.max(protectedLoserElo, loserHighestElo);

        // Calculate Elo changes
        winnerEloChange = newWinnerElo - winnerElo;
        loserEloChange = protectedLoserElo - loserElo;

        // Dynamic points based on Elo delta
        const pointFactor = eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR;
        seasonPointChange = Math.round(pointFactor);

        // XP only for standard matches (equals points)
        winnerXPGain = seasonPointChange;

        logger.info(
          `ℹ️ Standard-Match ${matchId}: Dynamische Punktevergabe ${seasonPointChange}, XP ${winnerXPGain}.`
        );
      }

      const batch = db.batch();

      // Build winner update object
      const winnerUpdate = {
        eloRating: newWinnerElo,
        highestElo: newWinnerHighestElo,
        points: admin.firestore.FieldValue.increment(seasonPointChange),
      };

      // Only add XP for standard matches
      if (winnerXPGain > 0) {
        winnerUpdate.xp = admin.firestore.FieldValue.increment(winnerXPGain);
        winnerUpdate.lastXPUpdate = admin.firestore.FieldValue.serverTimestamp();
      }

      batch.update(winnerRef, winnerUpdate);

      // Update loser (ONLY Elo changes, NO points decrease, NO XP change)
      // Points are NEVER deducted from losers - only Elo is reduced
      batch.update(loserRef, {
        eloRating: protectedLoserElo,
        highestElo: newLoserHighestElo,
        // Note: points are NOT decremented - losers don't lose points!
        // Note: XP is NOT decremented - it only goes up!
      });

      // Create history entries
      const winnerHistoryRef = winnerRef
        .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
        .doc();
      batch.set(winnerHistoryRef, {
        points: seasonPointChange,
        xp: winnerXPGain, // XP only for standard matches, 0 for handicap
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
        points: 0, // Losers don't lose points - only Elo
        xp: 0, // Loser doesn't gain XP
        eloChange: loserEloChange,
        reason: `Niederlage im ${matchTypeReason} gegen ${
          winnerData.firstName || "Gegner"
        }`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: "System (Wettkampf)",
      });

      // Track XP in separate history for winner only (only for standard matches)
      if (winnerXPGain > 0) {
        const winnerXPHistoryRef = winnerRef.collection("xpHistory").doc();
        batch.set(winnerXPHistoryRef, {
          xp: winnerXPGain,
          reason: `Sieg im ${matchTypeReason} gegen ${
            loserData.firstName || "Gegner"
          }`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          awardedBy: "System (Wettkampf)",
        });
      }

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
// ===== FUNKTION 2: Alte Invitation-Tokens automatisch löschen =====
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
// ===== FUNKTION 3: Setzt Custom Claims bei User-Änderung =====
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
// ===== FUNKTION 4: Claim Invitation Code (Code-basierte Registrierung) =====
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
      logger.info(`Code-Daten geladen: ${JSON.stringify({
        code: codeData.code,
        playerId: codeData.playerId || 'NICHT VORHANDEN',
        used: codeData.used,
        superseded: codeData.superseded,
        firstName: codeData.firstName,
        lastName: codeData.lastName
      })}`);

      // 3. Validate code
      if (codeData.code !== code) {
        throw new HttpsError("invalid-argument", "Code stimmt nicht überein.");
      }

      if (codeData.used) {
        throw new HttpsError("already-exists", "Dieser Code wurde bereits verwendet.");
      }

      if (codeData.superseded) {
        throw new HttpsError(
          "failed-precondition",
          "Dieser Code wurde durch einen neueren Code ersetzt und ist nicht mehr gültig."
        );
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

      // 5. Check if this code is for an existing offline player (migration scenario)
      if (codeData.playerId) {
        logger.info(`Code ${code} ist für existierenden Offline-Spieler ${codeData.playerId}. Starte Migration...`);

        const oldUserRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(codeData.playerId);
        const oldUserDoc = await oldUserRef.get();

        if (!oldUserDoc.exists) {
          throw new HttpsError(
            "not-found",
            "Der verknüpfte Offline-Spieler wurde nicht gefunden."
          );
        }

        const oldUserData = oldUserDoc.data();

        // Create new user document with auth UID, keeping all existing data
        const migratedUserData = {
          ...oldUserData,
          email: request.auth.token.email || oldUserData.email || "",
          onboardingComplete: false, // User needs to complete onboarding
          isOffline: true, // Will be set to false after onboarding
          migratedFrom: codeData.playerId, // Track migration for debugging
          migratedAt: now,
        };

        await userRef.set(migratedUserData);
        logger.info(`Migriertes User-Dokument für ${userId} erstellt (von ${codeData.playerId})`);

        // Migrate subcollections
        const subcollections = ["pointsHistory", "xpHistory", "attendance"];
        for (const subcollectionName of subcollections) {
          const oldSubcollectionRef = oldUserRef.collection(subcollectionName);
          const snapshot = await oldSubcollectionRef.get();

          if (!snapshot.empty) {
            let batch = db.batch();
            let batchCount = 0;

            for (const doc of snapshot.docs) {
              const newDocRef = userRef.collection(subcollectionName).doc(doc.id);
              batch.set(newDocRef, doc.data());
              batchCount++;

              // Firestore batch limit is 500 operations
              if (batchCount >= 500) {
                await batch.commit();
                batch = db.batch(); // Create new batch
                batchCount = 0;
              }
            }

            if (batchCount > 0) {
              await batch.commit();
            }

            logger.info(`Migriert: ${snapshot.size} Dokumente aus ${subcollectionName}`);
          }
        }

        // Delete old offline user document
        await oldUserRef.delete();
        logger.info(`Altes Offline-User-Dokument ${codeData.playerId} gelöscht`);
      } else {
        // 5b. Create NEW user document (not a migration)
        logger.info(`⚠️ KEIN playerId im Code - erstelle NEUEN Spieler statt Migration!`);
        logger.info(`Code enthält: firstName=${codeData.firstName}, lastName=${codeData.lastName}`);

        const userData = {
          email: request.auth.token.email || "",
          firstName: codeData.firstName || "",
          lastName: codeData.lastName || "",
          clubId: codeData.clubId,
          role: codeData.role || "player",
          subgroupIds: codeData.subgroupIds || [],
          points: 0,
          xp: 0,
          eloRating: CONFIG.ELO.DEFAULT_RATING,
          highestElo: CONFIG.ELO.DEFAULT_RATING,
          wins: 0,
          losses: 0,
          grundlagenCompleted: 0,
          onboardingComplete: false,
          isOffline: true, // User is offline until they complete onboarding
          createdAt: now,
          photoURL: "",
        };

        await userRef.set(userData);
        logger.info(`Neues User-Dokument für ${userId} erstellt via Code ${code}`);
      }

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
// ===== FUNKTION 5: Claim Invitation Token (Email-basierte Registrierung) =====
// ========================================================================
exports.claimInvitationToken = onCall(
  {region: CONFIG.REGION},
  async (request) => {
    // 1. Check if user is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Du musst angemeldet sein, um einen Token einzulösen."
      );
    }

    const userId = request.auth.uid;
    const {tokenId} = request.data;

    if (!tokenId) {
      throw new HttpsError(
        "invalid-argument",
        "Token-ID ist erforderlich."
      );
    }

    try {
      // 2. Get token document
      const tokenRef = db.collection(CONFIG.COLLECTIONS.INVITATION_TOKENS).doc(tokenId);
      const tokenDoc = await tokenRef.get();

      if (!tokenDoc.exists) {
        throw new HttpsError("not-found", "Dieser Token existiert nicht.");
      }

      const tokenData = tokenDoc.data();

      // 3. Validate token
      if (tokenData.isUsed) {
        throw new HttpsError("already-exists", "Dieser Token wurde bereits verwendet.");
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

      const now = admin.firestore.Timestamp.now();

      // 5. Create user document with data from token
      const userData = {
        email: request.auth.token.email || "",
        firstName: tokenData.firstName || "",
        lastName: tokenData.lastName || "",
        clubId: tokenData.clubId,
        role: tokenData.role || "player",
        subgroupIds: tokenData.subgroupIds || [],
        points: 0,
        xp: 0,
        eloRating: CONFIG.ELO.DEFAULT_RATING,
        highestElo: CONFIG.ELO.DEFAULT_RATING,
        wins: 0,
        losses: 0,
        grundlagenCompleted: 0,
        onboardingComplete: false,
        isOffline: true, // User is offline until they complete onboarding
        createdAt: now,
        photoURL: "",
      };

      await userRef.set(userData);
      logger.info(`User-Dokument für ${userId} erstellt via Token ${tokenId}`);

      // 6. Mark token as used
      await tokenRef.update({
        isUsed: true,
        usedBy: userId,
        usedAt: now,
      });

      logger.info(`Token ${tokenId} als verwendet markiert von User ${userId}`);

      return {
        success: true,
        message: "Token erfolgreich eingelöst!",
      };
    } catch (error) {
      logger.error(`Fehler beim Einlösen des Tokens ${tokenId}:`, error);

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

// ========================================================================
// ===== FUNKTION 7: Process Approved Match Request =====
// ========================================================================
/**
 * Processes approved match requests by creating a match document
 * Triggered when a matchRequest document is updated to status='approved'
 */
exports.processApprovedMatchRequest = onDocumentWritten(
  {
    region: CONFIG.REGION,
    document: `${CONFIG.COLLECTIONS.MATCH_REQUESTS}/{requestId}`,
  },
  async (event) => {
    const {requestId} = event.params;
    const beforeData = event.data.before?.data();
    const afterData = event.data.after?.data();

    // Only process if status changed to 'approved'
    if (!afterData || afterData.status !== "approved") {
      return null;
    }

    // Skip if already processed
    if (beforeData && beforeData.status === "approved") {
      logger.info(`ℹ️ Match request ${requestId} already processed.`);
      return null;
    }

    // Skip if match already created
    if (afterData.processedMatchId) {
      logger.info(`ℹ️ Match request ${requestId} already has processedMatchId.`);
      return null;
    }

    logger.info(`✅ Processing approved match request ${requestId}`);

    try {
      const {
        playerAId,
        playerBId,
        winnerId,
        loserId,
        handicapUsed,
        clubId,
        sets,
        requestedBy,
      } = afterData;

      // Create match document
      const matchRef = await db.collection(CONFIG.COLLECTIONS.MATCHES).add({
        playerAId,
        playerBId,
        winnerId,
        loserId,
        handicapUsed: handicapUsed || false,
        sets: sets || [],
        reportedBy: requestedBy,
        clubId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
        source: "player_request", // Mark as player-initiated
      });

      // Update match request with processedMatchId
      await db
        .collection(CONFIG.COLLECTIONS.MATCH_REQUESTS)
        .doc(requestId)
        .update({
          processedMatchId: matchRef.id,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      logger.info(
        `✅ Match ${matchRef.id} created from request ${requestId}`
      );

      return {success: true, matchId: matchRef.id};
    } catch (error) {
      logger.error(`💥 Error processing match request ${requestId}:`, error);
      return {success: false, error: error.message};
    }
  }
);

// ========================================================================
// ===== SCHEDULED FUNCTION: Auto-Generate Training Sessions =====
// ========================================================================
/**
 * Scheduled function that runs daily at 00:00 UTC
 * Generates training sessions for the next 14 days from recurring templates
 */
exports.autoGenerateTrainingSessions = onSchedule(
  {
    schedule: "0 0 * * *", // Every day at midnight UTC
    timeZone: "Europe/Berlin",
    region: CONFIG.REGION,
  },
  async (event) => {
    logger.info("🔄 Starting auto-generation of training sessions...");

    try {
      // Get all active recurring training templates
      const templatesSnapshot = await db
        .collection("recurringTrainingTemplates")
        .where("active", "==", true)
        .get();

      if (templatesSnapshot.empty) {
        logger.info("No active recurring templates found");
        return {success: true, sessionsCreated: 0};
      }

      logger.info(`Found ${templatesSnapshot.size} active templates`);

      // Calculate date range: today to +14 days
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 14);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
      };

      let totalCreated = 0;
      const batch = db.batch();
      let batchCount = 0;

      // Iterate through all dates in range
      const currentDate = new Date(today);
      while (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        const dayOfWeek = currentDate.getDay();

        // Find templates for this day of week
        for (const templateDoc of templatesSnapshot.docs) {
          const template = templateDoc.data();

          // Check if template applies to this day
          if (template.dayOfWeek !== dayOfWeek) continue;

          // Check date range
          if (template.startDate && dateStr < template.startDate) continue;
          if (template.endDate && dateStr > template.endDate) continue;

          // Check if session already exists
          const existingSession = await db
            .collection("trainingSessions")
            .where("clubId", "==", template.clubId)
            .where("date", "==", dateStr)
            .where("startTime", "==", template.startTime)
            .where("subgroupId", "==", template.subgroupId)
            .limit(1)
            .get();

          if (!existingSession.empty) {
            logger.info(
              `Session already exists: ${dateStr} ${template.startTime}`
            );
            continue;
          }

          // Create new session
          const sessionRef = db.collection("trainingSessions").doc();
          batch.set(sessionRef, {
            date: dateStr,
            startTime: template.startTime,
            endTime: template.endTime,
            subgroupId: template.subgroupId,
            clubId: template.clubId,
            recurringTemplateId: templateDoc.id,
            cancelled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: "system",
          });

          totalCreated++;
          batchCount++;

          // Commit batch every 500 operations (Firestore limit)
          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
            logger.info(`Committed batch, ${totalCreated} sessions created so far`);
          }
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Commit remaining operations
      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info(`✅ Auto-generation complete: ${totalCreated} sessions created`);
      return {success: true, sessionsCreated: totalCreated};
    } catch (error) {
      logger.error("💥 Error auto-generating training sessions:", error);
      return {success: false, error: error.message};
    }
  }
);

// ========================================================================
// ===== CALLABLE FUNCTION: Migrate Attendance to Sessions =====
// ========================================================================
/**
 * One-time migration function to convert existing attendance data
 * to the new session-based system
 * Creates a generic training session for each attendance record that lacks a sessionId
 */
exports.migrateAttendanceToSessions = onCall(
  {
    region: CONFIG.REGION,
    enforceAppCheck: false, // Set to true in production
  },
  async (request) => {
    logger.info("🔄 Starting attendance migration to sessions...");

    try {
      // Get all attendance records without sessionId
      const attendanceSnapshot = await db
        .collection("attendance")
        .get();

      if (attendanceSnapshot.empty) {
        logger.info("No attendance records found");
        return {success: true, migrated: 0, skipped: 0};
      }

      logger.info(`Found ${attendanceSnapshot.size} attendance records`);

      let migrated = 0;
      let skipped = 0;
      const batch = db.batch();
      let batchCount = 0;

      for (const attendanceDoc of attendanceSnapshot.docs) {
        const attendance = attendanceDoc.data();

        // Skip if already has sessionId
        if (attendance.sessionId) {
          skipped++;
          continue;
        }

        // Check if a session already exists for this date/subgroup/club
        const existingSessionQuery = await db
          .collection("trainingSessions")
          .where("clubId", "==", attendance.clubId)
          .where("subgroupId", "==", attendance.subgroupId)
          .where("date", "==", attendance.date)
          .limit(1)
          .get();

        let sessionId;

        if (!existingSessionQuery.empty) {
          // Use existing session
          sessionId = existingSessionQuery.docs[0].id;
          logger.info(`Using existing session ${sessionId} for attendance ${attendanceDoc.id}`);
        } else {
          // Create a generic session (18:00-20:00 default time)
          const sessionRef = db.collection("trainingSessions").doc();
          sessionId = sessionRef.id;

          batch.set(sessionRef, {
            date: attendance.date,
            startTime: "18:00", // Default time for migrated sessions
            endTime: "20:00",
            subgroupId: attendance.subgroupId,
            clubId: attendance.clubId,
            recurringTemplateId: null,
            cancelled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: "migration",
          });

          batchCount++;
          logger.info(`Created session ${sessionId} for attendance ${attendanceDoc.id}`);
        }

        // Update attendance with sessionId
        batch.update(attendanceDoc.ref, {
          sessionId: sessionId,
        });

        batchCount++;
        migrated++;

        // Commit batch every 500 operations (Firestore limit)
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
          logger.info(`Committed batch, ${migrated} records migrated so far`);
        }
      }

      // Commit remaining operations
      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped`);
      return {
        success: true,
        migrated,
        skipped,
        total: attendanceSnapshot.size,
      };
    } catch (error) {
      logger.error("💥 Error migrating attendance:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

// ========================================================================
// ===== SCHEDULED FUNCTION: Auto Season Reset (Every 6 Weeks) =====
// ========================================================================
/**
 * Scheduled function that runs every 6 weeks to reset seasons
 * - Resets season points to 0
 * - Handles league promotions/demotions
 * - Deletes milestone progress and completion status
 */
exports.autoSeasonReset = onSchedule(
  {
    // Run daily at 00:00 CET to check if 6 weeks have passed
    schedule: "0 0 * * *", // Every day at midnight
    timeZone: "Europe/Berlin",
    region: CONFIG.REGION,
  },
  async (event) => {
    logger.info("🔄 Checking if 6-week season reset is needed...");

    try {
      const now = admin.firestore.Timestamp.now();

      // Check last reset date from config document
      const configRef = db.collection("config").doc("seasonReset");
      const configDoc = await configRef.get();

      const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000; // 6 weeks in milliseconds

      if (configDoc.exists) {
        const lastReset = configDoc.data().lastResetDate;
        const timeSinceLastReset = now.toMillis() - lastReset.toMillis();

        if (timeSinceLastReset < sixWeeksInMs) {
          const daysRemaining = Math.ceil(
            (sixWeeksInMs - timeSinceLastReset) / (24 * 60 * 60 * 1000)
          );
          logger.info(
            `Not yet time for season reset. ${daysRemaining} days remaining.`
          );
          return {
            success: true,
            message: `${daysRemaining} days until next reset`,
            daysRemaining,
          };
        }
      }

      logger.info(
        "✅ 6 weeks have passed (or first run). Starting season reset..."
      );

      // Get all clubs
      const clubsSnapshot = await db.collection("clubs").get();

      if (clubsSnapshot.empty) {
        logger.info("No clubs found");
        return {success: true, clubsReset: 0};
      }

      logger.info(`Found ${clubsSnapshot.size} clubs to process`);

      let totalClubsReset = 0;
      let totalPlayersReset = 0;

      // Define league structure (same as frontend)
      const LEAGUES = {
        Bronze: {name: "Bronze", color: "#CD7F32", icon: "🥉"},
        Silber: {name: "Silber", color: "#C0C0C0", icon: "🥈"},
        Gold: {name: "Gold", color: "#FFD700", icon: "🥇"},
        Platin: {name: "Platin", color: "#E5E4E2", icon: "💎"},
        Diamant: {name: "Diamant", color: "#B9F2FF", icon: "💠"},
        Champion: {name: "Champion", color: "#FF4500", icon: "👑"},
      };
      const PROMOTION_COUNT = 2; // Top 2 players get promoted
      const DEMOTION_COUNT = 2; // Bottom 2 players get demoted

      // Process each club
      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        logger.info(`Processing club: ${clubId}`);

        try {
          // Get all players in this club
          const playersQuery = await db
            .collection(CONFIG.COLLECTIONS.USERS)
            .where("clubId", "==", clubId)
            .where("role", "==", "player")
            .get();

          if (playersQuery.empty) {
            logger.info(`No players found in club ${clubId}`);
            continue;
          }

          const allPlayers = playersQuery.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

          logger.info(`Found ${allPlayers.length} players in club ${clubId}`);

          // Group players by league
          const playersByLeague = allPlayers.reduce((acc, player) => {
            const league = player.league || "Bronze";
            if (!acc[league]) acc[league] = [];
            acc[league].push(player);
            return acc;
          }, {});

          // Calculate promotions/demotions
          const batch = db.batch();
          const leagueKeys = Object.keys(LEAGUES);

          for (const leagueName in playersByLeague) {
            const playersInLeague = playersByLeague[leagueName];
            const sortedPlayers = playersInLeague.sort(
              (a, b) => (b.points || 0) - (a.points || 0)
            );
            const totalPlayers = sortedPlayers.length;

            sortedPlayers.forEach((player, index) => {
              const rank = index + 1;
              const playerRef = db
                .collection(CONFIG.COLLECTIONS.USERS)
                .doc(player.id);
              let newLeague = leagueName;

              // Promotion logic
              if (rank <= PROMOTION_COUNT) {
                const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                if (currentLeagueIndex < leagueKeys.length - 1) {
                  newLeague = leagueKeys[currentLeagueIndex + 1];
                  logger.info(
                    `Promoting ${player.firstName} ${player.lastName} from ${leagueName} to ${newLeague}`
                  );
                }
              }
              // Demotion logic
              else if (
                rank > totalPlayers - DEMOTION_COUNT &&
                totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT
              ) {
                const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                if (currentLeagueIndex > 0) {
                  newLeague = leagueKeys[currentLeagueIndex - 1];
                  logger.info(
                    `Demoting ${player.firstName} ${player.lastName} from ${leagueName} to ${newLeague}`
                  );
                }
              }

              // Reset season points and update league
              batch.update(playerRef, {
                points: 0,
                league: newLeague,
                lastSeasonReset: now,
              });
            });
          }

          // Commit batch updates
          await batch.commit();
          logger.info(`✅ Batch updates committed for club ${clubId}`);

          // Delete milestone progress and completion status for all players
          for (const player of allPlayers) {
            try {
              // Delete exercise milestones
              const exerciseMilestones = await db
                .collection(`users/${player.id}/exerciseMilestones`)
                .get();
              for (const milestone of exerciseMilestones.docs) {
                await milestone.ref.delete();
              }

              // Delete challenge milestones
              const challengeMilestones = await db
                .collection(`users/${player.id}/challengeMilestones`)
                .get();
              for (const milestone of challengeMilestones.docs) {
                await milestone.ref.delete();
              }

              // Delete completed exercises
              const completedExercises = await db
                .collection(`users/${player.id}/completedExercises`)
                .get();
              for (const completed of completedExercises.docs) {
                await completed.ref.delete();
              }

              // Delete completed challenges
              const completedChallenges = await db
                .collection(`users/${player.id}/completedChallenges`)
                .get();
              for (const completed of completedChallenges.docs) {
                await completed.ref.delete();
              }

              logger.info(
                `✅ Reset milestones for player: ${player.firstName} ${player.lastName}`
              );
              totalPlayersReset++;
            } catch (subError) {
              logger.error(
                `Error resetting milestones for player ${player.id}:`,
                subError
              );
            }
          }

          totalClubsReset++;
          logger.info(`✅ Season reset complete for club: ${clubId}`);
        } catch (clubError) {
          logger.error(`💥 Error processing club ${clubId}:`, clubError);
        }
      }

      // Update config with new reset date
      await configRef.set(
        {
          lastResetDate: now,
          lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true}
      );

      logger.info(
        `✅ Automatic season reset complete: ${totalClubsReset} clubs, ${totalPlayersReset} players`
      );
      return {
        success: true,
        clubsReset: totalClubsReset,
        playersReset: totalPlayersReset,
        nextResetDate: new Date(
          now.toMillis() + sixWeeksInMs
        ).toISOString(),
      };
    } catch (error) {
      logger.error("💥 Error during automatic season reset:", error);
      return {success: false, error: error.message};
    }
  }
);

// ========================================================================
// ===== TODO: Email Notifications =====
// ========================================================================
// Future enhancement: Send email notifications when:
// 1. Match request created → notify playerB
// 2. PlayerB approves → notify coach
// 3. Coach approves/rejects → notify both players
// 4. PlayerB rejects → notify playerA