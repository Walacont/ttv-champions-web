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
    POINTS_HISTORY: "pointsHistory",
  },
  ELO: {
    DEFAULT_RATING: 1200,
    K_FACTOR: 32,
    SEASON_POINT_FACTOR: 0.5,
    HANDICAP_SEASON_POINTS: 8, // Feste Punktzahl für Handicap-Spiele
  },
  REGION: "europe-west3",
};

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

      const winnerElo = winnerData.eloRating || CONFIG.ELO.DEFAULT_RATING;
      const loserElo = loserData.eloRating || CONFIG.ELO.DEFAULT_RATING;

      const {newWinnerElo, newLoserElo, eloDelta} = calculateElo(
        winnerElo,
        loserElo,
        CONFIG.ELO.K_FACTOR
      );

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

      const batch = db.batch();

      batch.update(winnerRef, {
        eloRating: newWinnerElo,
        points: admin.firestore.FieldValue.increment(seasonPointChange),
      });

      batch.update(loserRef, {
        eloRating: newLoserElo,
        points: admin.firestore.FieldValue.increment(-seasonPointChange),
      });

      const winnerHistoryRef = winnerRef
        .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
        .doc();
      batch.set(winnerHistoryRef, {
        points: seasonPointChange,
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
        points: -seasonPointChange,
        reason: `Niederlage im ${matchTypeReason} gegen ${
          winnerData.firstName || "Gegner"
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