/**
 * Match Processing Module
 * Handles processing of singles and doubles match results
 */

const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { CONFIG } = require('./config');
const { calculateElo, applyEloGate } = require('./elo');

const db = admin.firestore();

/**
 * Processes a reported singles match
 * Triggered when a new match document is created
 */
const processMatchResult = onDocumentCreated(
  {
    region: CONFIG.REGION,
    document: `${CONFIG.COLLECTIONS.MATCHES}/{matchId}`,
  },
  async (event) => {
    const { matchId } = event.params;
    const snap = event.data;

    if (!snap) {
      logger.error('❌ Keine Daten im Event-Snapshot gefunden.', { event });
      return;
    }

    const matchData = snap.data();
    if (matchData.processed) {
      logger.log(`ℹ️ Match ${matchId} wurde bereits verarbeitet.`);
      return;
    }

    const { winnerId, loserId, handicapUsed } = matchData;
    if (!winnerId || !loserId) {
      logger.error(`❌ Ungültige Daten: Spieler-IDs in Match ${matchId} fehlen.`);
      return;
    }

    const winnerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(winnerId);
    const loserRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(loserId);

    try {
      const [winnerDoc, loserDoc] = await Promise.all([winnerRef.get(), loserRef.get()]);

      if (!winnerDoc.exists || !loserDoc.exists) {
        throw new Error(`Spieler nicht gefunden: winnerId=${winnerId}, loserId=${loserId}`);
      }

      const winnerData = winnerDoc.data();
      const loserData = loserDoc.data();

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
      let winnerXPGain = 0;
      let matchTypeReason = 'Wettkampf';

      if (handicapUsed) {
        // Handicap matches: Fixed Elo changes (+8/-8), no XP
        seasonPointChange = CONFIG.ELO.HANDICAP_SEASON_POINTS;
        matchTypeReason = 'Handicap-Wettkampf';

        newWinnerElo = winnerElo + CONFIG.ELO.HANDICAP_SEASON_POINTS;
        newLoserElo = loserElo - CONFIG.ELO.HANDICAP_SEASON_POINTS;

        protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserHighestElo);

        newWinnerHighestElo = Math.max(newWinnerElo, winnerHighestElo);
        newLoserHighestElo = Math.max(protectedLoserElo, loserHighestElo);

        winnerEloChange = newWinnerElo - winnerElo;
        loserEloChange = protectedLoserElo - loserElo;

        logger.info(
          `ℹ️ Handicap-Match ${matchId}: Feste Punktevergabe ${seasonPointChange}, feste Elo-Änderung ±${CONFIG.ELO.HANDICAP_SEASON_POINTS}.`
        );
      } else {
        // Standard matches: Calculate Elo dynamically and award XP
        const {
          newWinnerElo: calculatedWinnerElo,
          newLoserElo: calculatedLoserElo,
          eloDelta,
        } = calculateElo(winnerElo, loserElo, CONFIG.ELO.K_FACTOR);
        newWinnerElo = calculatedWinnerElo;
        newLoserElo = calculatedLoserElo;

        protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserHighestElo);

        newWinnerHighestElo = Math.max(newWinnerElo, winnerHighestElo);
        newLoserHighestElo = Math.max(protectedLoserElo, loserHighestElo);

        winnerEloChange = newWinnerElo - winnerElo;
        loserEloChange = protectedLoserElo - loserElo;

        const pointFactor = eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR;
        seasonPointChange = Math.round(pointFactor);

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

      if (winnerXPGain > 0) {
        winnerUpdate.xp = admin.firestore.FieldValue.increment(winnerXPGain);
        winnerUpdate.lastXPUpdate = admin.firestore.FieldValue.serverTimestamp();
      }

      batch.update(winnerRef, winnerUpdate);

      // Update loser (ONLY Elo changes, NO points decrease, NO XP change)
      batch.update(loserRef, {
        eloRating: protectedLoserElo,
        highestElo: newLoserHighestElo,
      });

      // Create history entries
      const winnerHistoryRef = winnerRef.collection(CONFIG.COLLECTIONS.POINTS_HISTORY).doc();
      batch.set(winnerHistoryRef, {
        points: seasonPointChange,
        xp: winnerXPGain,
        eloChange: winnerEloChange,
        reason: `Sieg im ${matchTypeReason} gegen ${loserData.firstName || 'Gegner'}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: 'System (Wettkampf)',
      });

      const loserHistoryRef = loserRef.collection(CONFIG.COLLECTIONS.POINTS_HISTORY).doc();
      batch.set(loserHistoryRef, {
        points: 0,
        xp: 0,
        eloChange: loserEloChange,
        reason: `Niederlage im ${matchTypeReason} gegen ${winnerData.firstName || 'Gegner'}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: 'System (Wettkampf)',
      });

      // Track XP in separate history for winner only (only for standard matches)
      if (winnerXPGain > 0) {
        const winnerXPHistoryRef = winnerRef.collection('xpHistory').doc();
        batch.set(winnerXPHistoryRef, {
          xp: winnerXPGain,
          reason: `Sieg im ${matchTypeReason} gegen ${loserData.firstName || 'Gegner'}`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          awardedBy: 'System (Wettkampf)',
        });
      }

      batch.update(snap.ref, {
        processed: true,
        pointsExchanged: seasonPointChange,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
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

/**
 * Processes approved match requests by creating a match document
 * Triggered when a matchRequest document is updated to status='approved'
 */
const processApprovedMatchRequest = onDocumentWritten(
  {
    region: CONFIG.REGION,
    document: `${CONFIG.COLLECTIONS.MATCH_REQUESTS}/{requestId}`,
  },
  async (event) => {
    const { requestId } = event.params;
    const beforeData = event.data.before?.data();
    const afterData = event.data.after?.data();

    if (!afterData || afterData.status !== 'approved') {
      return null;
    }

    if (beforeData && beforeData.status === 'approved') {
      logger.info(`ℹ️ Match request ${requestId} already processed.`);
      return null;
    }

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
        matchMode,
      } = afterData;

      const matchRef = await db.collection(CONFIG.COLLECTIONS.MATCHES).add({
        playerAId,
        playerBId,
        playerIds: [playerAId, playerBId],
        winnerId,
        loserId,
        handicapUsed: handicapUsed || false,
        matchMode: matchMode || 'best-of-5',
        sets: sets || [],
        reportedBy: requestedBy,
        clubId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
        source: 'player_request',
      });

      await db.collection(CONFIG.COLLECTIONS.MATCH_REQUESTS).doc(requestId).update({
        processedMatchId: matchRef.id,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`✅ Match ${matchRef.id} created from request ${requestId}`);

      return { success: true, matchId: matchRef.id };
    } catch (error) {
      logger.error(`💥 Error processing match request ${requestId}:`, error);
      return { success: false, error: error.message };
    }
  }
);

module.exports = {
  processMatchResult,
  processApprovedMatchRequest,
};
