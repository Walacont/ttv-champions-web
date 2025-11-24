/**
 * Doubles Match Processing Module
 * Handles processing of doubles match results
 */

const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { CONFIG } = require('./config');
const { calculateElo, applyEloGate } = require('./elo');

const db = admin.firestore();

/**
 * Processes doubles match results
 * - Updates separate doublesEloRating for all 4 players
 * - Awards season points × 0.5 to each player
 * - Awards XP × 0.5 to each winner
 * - Updates doublesPairings collection with team stats
 */
const processDoublesMatchResult = onDocumentCreated(
  {
    region: CONFIG.REGION,
    document: 'doublesMatches/{matchId}',
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
      logger.log(`ℹ️ Doubles match ${matchId} wurde bereits verarbeitet.`);
      return;
    }

    const { teamA, teamB, winningTeam, handicapUsed } = matchData;
    if (!teamA || !teamB || !winningTeam) {
      logger.error(`❌ Ungültige Daten: Teams in Doubles Match ${matchId} fehlen.`);
      return;
    }

    const winningPairingId = winningTeam === 'A' ? teamA.pairingId : teamB.pairingId;
    const losingPairingId = winningTeam === 'A' ? teamB.pairingId : teamA.pairingId;

    const winningPlayerIds =
      winningTeam === 'A' ? [teamA.player1Id, teamA.player2Id] : [teamB.player1Id, teamB.player2Id];
    const losingPlayerIds =
      winningTeam === 'A' ? [teamB.player1Id, teamB.player2Id] : [teamA.player1Id, teamA.player2Id];

    try {
      const [winner1Doc, winner2Doc, loser1Doc, loser2Doc] = await Promise.all([
        db.collection(CONFIG.COLLECTIONS.USERS).doc(winningPlayerIds[0]).get(),
        db.collection(CONFIG.COLLECTIONS.USERS).doc(winningPlayerIds[1]).get(),
        db.collection(CONFIG.COLLECTIONS.USERS).doc(losingPlayerIds[0]).get(),
        db.collection(CONFIG.COLLECTIONS.USERS).doc(losingPlayerIds[1]).get(),
      ]);

      if (!winner1Doc.exists || !winner2Doc.exists || !loser1Doc.exists || !loser2Doc.exists) {
        throw new Error('Nicht alle Spieler gefunden');
      }

      const winner1Data = winner1Doc.data();
      const winner2Data = winner2Doc.data();
      const loser1Data = loser1Doc.data();
      const loser2Data = loser2Doc.data();

      const winner1Elo = winner1Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
      const winner2Elo = winner2Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
      const loser1Elo = loser1Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
      const loser2Elo = loser2Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;

      const winningTeamElo = Math.round((winner1Elo + winner2Elo) / 2);
      const losingTeamElo = Math.round((loser1Elo + loser2Elo) / 2);

      logger.info(
        `Doubles match ${matchId}: Team Elos - Winners: ${winningTeamElo}, Losers: ${losingTeamElo}`
      );

      let winner1NewElo, winner2NewElo, loser1NewElo, loser2NewElo;
      let seasonPointChange;
      let winnerXPGain = 0;
      let matchTypeReason = 'Doppel-Wettkampf';

      if (handicapUsed) {
        seasonPointChange = CONFIG.ELO.HANDICAP_SEASON_POINTS;
        const eloChangePerPlayer = CONFIG.ELO.HANDICAP_SEASON_POINTS / 2;

        winner1NewElo = winner1Elo + eloChangePerPlayer;
        winner2NewElo = winner2Elo + eloChangePerPlayer;
        loser1NewElo = loser1Elo - eloChangePerPlayer;
        loser2NewElo = loser2Elo - eloChangePerPlayer;

        winnerXPGain = 0;

        logger.info(`Handicap Doubles Match: Fixed ±${eloChangePerPlayer} Elo per player`);
      } else {
        const {
          newWinnerElo: calculatedWinningTeamElo,
          newLoserElo: calculatedLosingTeamElo,
          eloDelta,
        } = calculateElo(winningTeamElo, losingTeamElo, CONFIG.ELO.K_FACTOR);

        const winningEloChange = calculatedWinningTeamElo - winningTeamElo;
        const losingEloChange = calculatedLosingTeamElo - losingTeamElo;

        winner1NewElo = Math.round(winner1Elo + winningEloChange / 2);
        winner2NewElo = Math.round(winner2Elo + winningEloChange / 2);
        loser1NewElo = Math.round(loser1Elo + losingEloChange / 2);
        loser2NewElo = Math.round(loser2Elo + losingEloChange / 2);

        const fullPoints = Math.round(eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR);
        seasonPointChange = Math.max(1, Math.round(fullPoints / 2));

        winnerXPGain = seasonPointChange;

        logger.info(
          `Standard Doubles Match: Season points per player: ${seasonPointChange}, XP: ${winnerXPGain}`
        );
      }

      // Apply Elo gates for losers
      const loser1HighestDoublesElo = loser1Data.highestDoublesElo || loser1Elo;
      const loser2HighestDoublesElo = loser2Data.highestDoublesElo || loser2Elo;

      loser1NewElo = applyEloGate(loser1NewElo, loser1Elo, loser1HighestDoublesElo);
      loser2NewElo = applyEloGate(loser2NewElo, loser2Elo, loser2HighestDoublesElo);

      const winner1HighestDoublesElo = Math.max(
        winner1NewElo,
        winner1Data.highestDoublesElo || winner1Elo
      );
      const winner2HighestDoublesElo = Math.max(
        winner2NewElo,
        winner2Data.highestDoublesElo || winner2Elo
      );
      const loser1HighestDoublesEloNew = Math.max(loser1NewElo, loser1HighestDoublesElo);
      const loser2HighestDoublesEloNew = Math.max(loser2NewElo, loser2HighestDoublesElo);

      const batch = db.batch();

      // Update winner 1
      const winner1Update = {
        doublesEloRating: winner1NewElo,
        highestDoublesElo: winner1HighestDoublesElo,
        doublesMatchesPlayed: admin.firestore.FieldValue.increment(1),
        doublesMatchesWon: admin.firestore.FieldValue.increment(1),
        points: admin.firestore.FieldValue.increment(seasonPointChange),
      };
      if (winnerXPGain > 0) {
        winner1Update.xp = admin.firestore.FieldValue.increment(winnerXPGain);
      }
      batch.update(winner1Doc.ref, winner1Update);

      // Update winner 2
      const winner2Update = {
        doublesEloRating: winner2NewElo,
        highestDoublesElo: winner2HighestDoublesElo,
        doublesMatchesPlayed: admin.firestore.FieldValue.increment(1),
        doublesMatchesWon: admin.firestore.FieldValue.increment(1),
        points: admin.firestore.FieldValue.increment(seasonPointChange),
      };
      if (winnerXPGain > 0) {
        winner2Update.xp = admin.firestore.FieldValue.increment(winnerXPGain);
      }
      batch.update(winner2Doc.ref, winner2Update);

      // Update losers
      batch.update(loser1Doc.ref, {
        doublesEloRating: loser1NewElo,
        highestDoublesElo: loser1HighestDoublesEloNew,
        doublesMatchesPlayed: admin.firestore.FieldValue.increment(1),
        doublesMatchesLost: admin.firestore.FieldValue.increment(1),
      });

      batch.update(loser2Doc.ref, {
        doublesEloRating: loser2NewElo,
        highestDoublesElo: loser2HighestDoublesEloNew,
        doublesMatchesPlayed: admin.firestore.FieldValue.increment(1),
        doublesMatchesLost: admin.firestore.FieldValue.increment(1),
      });

      // Create history entries
      const winner1HistoryRef = winner1Doc.ref.collection(CONFIG.COLLECTIONS.POINTS_HISTORY).doc();
      batch.set(winner1HistoryRef, {
        points: seasonPointChange,
        xp: winnerXPGain,
        eloChange: winner1NewElo - winner1Elo,
        reason: `Sieg im ${matchTypeReason} (Partner: ${winner2Data.firstName})`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: 'System (Doppel)',
        isPartner: true,
      });

      const winner2HistoryRef = winner2Doc.ref.collection(CONFIG.COLLECTIONS.POINTS_HISTORY).doc();
      batch.set(winner2HistoryRef, {
        points: seasonPointChange,
        xp: winnerXPGain,
        eloChange: winner2NewElo - winner2Elo,
        reason: `Sieg im ${matchTypeReason} (Partner: ${winner1Data.firstName})`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: 'System (Doppel)',
        isPartner: true,
      });

      const loser1HistoryRef = loser1Doc.ref.collection(CONFIG.COLLECTIONS.POINTS_HISTORY).doc();
      batch.set(loser1HistoryRef, {
        points: 0,
        xp: 0,
        eloChange: loser1NewElo - loser1Elo,
        reason: `Niederlage im ${matchTypeReason} (Partner: ${loser2Data.firstName})`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: 'System (Doppel)',
        isPartner: true,
      });

      const loser2HistoryRef = loser2Doc.ref.collection(CONFIG.COLLECTIONS.POINTS_HISTORY).doc();
      batch.set(loser2HistoryRef, {
        points: 0,
        xp: 0,
        eloChange: loser2NewElo - loser2Elo,
        reason: `Niederlage im ${matchTypeReason} (Partner: ${loser1Data.firstName})`,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        awardedBy: 'System (Doppel)',
        isPartner: true,
      });

      // Update doublesPairings collection
      const winningPairingRef = db.collection('doublesPairings').doc(winningPairingId);
      const losingPairingRef = db.collection('doublesPairings').doc(losingPairingId);

      const [winningPairingDoc, losingPairingDoc] = await Promise.all([
        winningPairingRef.get(),
        losingPairingRef.get(),
      ]);

      const newWinningTeamElo = Math.round((winner1NewElo + winner2NewElo) / 2);
      const newLosingTeamElo = Math.round((loser1NewElo + loser2NewElo) / 2);

      if (!winningPairingDoc.exists) {
        batch.set(winningPairingRef, {
          player1Id: winningPlayerIds[0],
          player2Id: winningPlayerIds[1],
          player1Name: `${winner1Data.firstName} ${winner1Data.lastName}`,
          player2Name: `${winner2Data.firstName} ${winner2Data.lastName}`,
          pairingId: winningPairingId,
          matchesPlayed: 1,
          matchesWon: 1,
          matchesLost: 0,
          winRate: 1.0,
          currentEloRating: newWinningTeamElo,
          clubId: matchData.clubId,
          lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const winningPairingData = winningPairingDoc.data();
        const newMatchesPlayed = (winningPairingData.matchesPlayed || 0) + 1;
        const newMatchesWon = (winningPairingData.matchesWon || 0) + 1;
        batch.update(winningPairingRef, {
          player1Name: `${winner1Data.firstName} ${winner1Data.lastName}`,
          player2Name: `${winner2Data.firstName} ${winner2Data.lastName}`,
          matchesPlayed: newMatchesPlayed,
          matchesWon: newMatchesWon,
          winRate: newMatchesWon / newMatchesPlayed,
          currentEloRating: newWinningTeamElo,
          lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (!losingPairingDoc.exists) {
        batch.set(losingPairingRef, {
          player1Id: losingPlayerIds[0],
          player2Id: losingPlayerIds[1],
          player1Name: `${loser1Data.firstName} ${loser1Data.lastName}`,
          player2Name: `${loser2Data.firstName} ${loser2Data.lastName}`,
          pairingId: losingPairingId,
          matchesPlayed: 1,
          matchesWon: 0,
          matchesLost: 1,
          winRate: 0.0,
          currentEloRating: newLosingTeamElo,
          clubId: matchData.clubId,
          lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const losingPairingData = losingPairingDoc.data();
        const newMatchesPlayed = (losingPairingData.matchesPlayed || 0) + 1;
        const newMatchesWon = losingPairingData.matchesWon || 0;
        const newMatchesLost = (losingPairingData.matchesLost || 0) + 1;
        batch.update(losingPairingRef, {
          player1Name: `${loser1Data.firstName} ${loser1Data.lastName}`,
          player2Name: `${loser2Data.firstName} ${loser2Data.lastName}`,
          matchesPlayed: newMatchesPlayed,
          matchesLost: newMatchesLost,
          winRate: newMatchesPlayed > 0 ? newMatchesWon / newMatchesPlayed : 0,
          currentEloRating: newLosingTeamElo,
          lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      batch.update(snap.ref, {
        processed: true,
        pointsExchanged: seasonPointChange,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      logger.info(`✅ Doubles match ${matchId} verarbeitet.`, {
        handicapUsed,
        pointsPerPlayer: seasonPointChange,
        winningPairingId,
        losingPairingId,
      });
    } catch (error) {
      logger.error(`💥 Fehler bei Verarbeitung von Doubles Match ${matchId}:`, error);
    }
  }
);

/**
 * Processes approved doubles match requests
 */
const processApprovedDoublesMatchRequest = onDocumentWritten(
  {
    region: CONFIG.REGION,
    document: 'doublesMatchRequests/{requestId}',
  },
  async (event) => {
    const { requestId } = event.params;
    const beforeData = event.data.before?.data();
    const afterData = event.data.after?.data();

    if (!afterData || afterData.status !== 'approved') {
      return null;
    }

    if (beforeData && beforeData.status === 'approved') {
      logger.info(`ℹ️ Doubles match request ${requestId} already processed.`);
      return null;
    }

    if (afterData.processedMatchId) {
      logger.info(`ℹ️ Doubles match request ${requestId} already has processedMatchId.`);
      return null;
    }

    logger.info(`✅ Processing approved doubles match request ${requestId}`);

    try {
      const {
        teamA,
        teamB,
        winningTeam,
        winningPairingId,
        losingPairingId,
        handicapUsed,
        clubId,
        sets,
        initiatedBy,
        matchMode,
      } = afterData;

      const matchRef = await db.collection('doublesMatches').add({
        teamA,
        teamB,
        winningTeam,
        winningPairingId,
        losingPairingId,
        handicapUsed: handicapUsed || false,
        matchMode: matchMode || 'best-of-5',
        sets: sets || [],
        reportedBy: initiatedBy,
        clubId,
        playerIds: [teamA.player1Id, teamA.player2Id, teamB.player1Id, teamB.player2Id],
        status: 'approved',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
        source: 'player_request',
      });

      await db.collection('doublesMatchRequests').doc(requestId).update({
        processedMatchId: matchRef.id,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`✅ Doubles match ${matchRef.id} created from request ${requestId}`);

      return { success: true, matchId: matchRef.id };
    } catch (error) {
      logger.error(`💥 Error processing doubles match request ${requestId}:`, error);
      return { success: false, error: error.message };
    }
  }
);

module.exports = {
  processDoublesMatchResult,
  processApprovedDoublesMatchRequest,
};
