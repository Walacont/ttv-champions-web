/**
 * Scheduled Tasks Module
 * Contains all scheduled/cron-based Cloud Functions
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { CONFIG } = require('./config');

const db = admin.firestore();

/**
 * Alte Invitation-Tokens automatisch löschen (täglich)
 */
const cleanupInvitationTokens = onSchedule(
  {
    schedule: 'every 24 hours',
    region: CONFIG.REGION,
  },
  async () => {
    const retentionDays = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    logger.info(`Suche Tokens älter als ${cutoffDate.toISOString()}...`);

    const oldTokensQuery = db
      .collection(CONFIG.COLLECTIONS.INVITATION_TOKENS)
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(cutoffDate));

    const snapshot = await oldTokensQuery.get();

    if (snapshot.empty) {
      logger.info('Keine alten Tokens zum Löschen gefunden.');
      return null;
    }

    const batch = db.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    logger.info(`🧹 ${snapshot.size} alte Invitation-Tokens gelöscht.`);
    return null;
  }
);

/**
 * Cleanup Expired Invitation Codes (täglich)
 */
const cleanupExpiredInvitationCodes = onSchedule(
  {
    schedule: 'every 24 hours',
    region: CONFIG.REGION,
    timeZone: 'Europe/Berlin',
  },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const codesRef = db.collection(CONFIG.COLLECTIONS.INVITATION_CODES);

    try {
      const expiredCodesSnapshot = await codesRef.where('expiresAt', '<', now).get();

      if (expiredCodesSnapshot.empty) {
        logger.info('Keine abgelaufenen Einladungscodes gefunden.');
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

      return { success: true, deletedCount: deleteCount };
    } catch (error) {
      logger.error('Fehler beim Bereinigen der Einladungscodes:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Auto-Generate Training Sessions (täglich um Mitternacht)
 */
const autoGenerateTrainingSessions = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Europe/Berlin',
    region: CONFIG.REGION,
  },
  async () => {
    logger.info('🔄 Starting auto-generation of training sessions...');

    try {
      const templatesSnapshot = await db
        .collection('recurringTrainingTemplates')
        .where('active', '==', true)
        .get();

      if (templatesSnapshot.empty) {
        logger.info('No active recurring templates found');
        return { success: true, sessionsCreated: 0 };
      }

      logger.info(`Found ${templatesSnapshot.size} active templates`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 14);

      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      let totalCreated = 0;
      const batch = db.batch();
      let batchCount = 0;

      const currentDate = new Date(today);
      while (currentDate <= endDate) {
        const dateStr = formatDate(currentDate);
        const dayOfWeek = currentDate.getDay();

        for (const templateDoc of templatesSnapshot.docs) {
          const template = templateDoc.data();

          if (template.dayOfWeek !== dayOfWeek) continue;
          if (template.startDate && dateStr < template.startDate) continue;
          if (template.endDate && dateStr > template.endDate) continue;

          const existingSession = await db
            .collection('trainingSessions')
            .where('clubId', '==', template.clubId)
            .where('date', '==', dateStr)
            .where('startTime', '==', template.startTime)
            .where('subgroupId', '==', template.subgroupId)
            .limit(1)
            .get();

          if (!existingSession.empty) {
            logger.info(`Session already exists: ${dateStr} ${template.startTime}`);
            continue;
          }

          const sessionRef = db.collection('trainingSessions').doc();
          batch.set(sessionRef, {
            date: dateStr,
            startTime: template.startTime,
            endTime: template.endTime,
            subgroupId: template.subgroupId,
            clubId: template.clubId,
            recurringTemplateId: templateDoc.id,
            cancelled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'system',
          });

          totalCreated++;
          batchCount++;

          if (batchCount >= 500) {
            await batch.commit();
            batchCount = 0;
            logger.info(`Committed batch, ${totalCreated} sessions created so far`);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (batchCount > 0) {
        await batch.commit();
      }

      logger.info(`✅ Auto-generation complete: ${totalCreated} sessions created`);
      return { success: true, sessionsCreated: totalCreated };
    } catch (error) {
      logger.error('💥 Error auto-generating training sessions:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Auto Season Reset (alle 6 Wochen)
 */
const autoSeasonReset = onSchedule(
  {
    schedule: '0 0 * * *',
    timeZone: 'Europe/Berlin',
    region: CONFIG.REGION,
  },
  async () => {
    logger.info('🔄 Checking if 6-week season reset is needed...');

    try {
      const now = admin.firestore.Timestamp.now();
      const configRef = db.collection('config').doc('seasonReset');
      const configDoc = await configRef.get();

      const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;

      if (configDoc.exists) {
        const lastReset = configDoc.data().lastResetDate;
        const timeSinceLastReset = now.toMillis() - lastReset.toMillis();

        if (timeSinceLastReset < sixWeeksInMs) {
          const daysRemaining = Math.ceil((sixWeeksInMs - timeSinceLastReset) / (24 * 60 * 60 * 1000));
          logger.info(`Not yet time for season reset. ${daysRemaining} days remaining.`);
          return {
            success: true,
            message: `${daysRemaining} days until next reset`,
            daysRemaining,
          };
        }
      }

      logger.info('✅ 6 weeks have passed (or first run). Starting season reset...');

      const clubsSnapshot = await db.collection('clubs').get();

      if (clubsSnapshot.empty) {
        logger.info('No clubs found');
        return { success: true, clubsReset: 0 };
      }

      logger.info(`Found ${clubsSnapshot.size} clubs to process`);

      let totalClubsReset = 0;
      let totalPlayersReset = 0;

      const LEAGUES = {
        Bronze: { name: 'Bronze', color: '#CD7F32', icon: '🥉' },
        Silber: { name: 'Silber', color: '#C0C0C0', icon: '🥈' },
        Gold: { name: 'Gold', color: '#FFD700', icon: '🥇' },
        Platin: { name: 'Platin', color: '#E5E4E2', icon: '💎' },
        Diamant: { name: 'Diamant', color: '#B9F2FF', icon: '💠' },
        Champion: { name: 'Champion', color: '#FF4500', icon: '👑' },
      };
      const PROMOTION_COUNT = 2;
      const DEMOTION_COUNT = 2;

      for (const clubDoc of clubsSnapshot.docs) {
        const clubId = clubDoc.id;
        logger.info(`Processing club: ${clubId}`);

        try {
          const playersQuery = await db
            .collection(CONFIG.COLLECTIONS.USERS)
            .where('clubId', '==', clubId)
            .where('role', '==', 'player')
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

          const playersByLeague = allPlayers.reduce((acc, player) => {
            const league = player.league || 'Bronze';
            if (!acc[league]) acc[league] = [];
            acc[league].push(player);
            return acc;
          }, {});

          const batch = db.batch();
          const leagueKeys = Object.keys(LEAGUES);

          for (const leagueName in playersByLeague) {
            const playersInLeague = playersByLeague[leagueName];
            const sortedPlayers = playersInLeague.sort((a, b) => (b.points || 0) - (a.points || 0));
            const totalPlayers = sortedPlayers.length;

            sortedPlayers.forEach((player, index) => {
              const rank = index + 1;
              const playerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(player.id);
              let newLeague = leagueName;

              if (rank <= PROMOTION_COUNT) {
                const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                if (currentLeagueIndex < leagueKeys.length - 1) {
                  newLeague = leagueKeys[currentLeagueIndex + 1];
                  logger.info(
                    `Promoting ${player.firstName} ${player.lastName} from ${leagueName} to ${newLeague}`
                  );
                }
              } else if (
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

              batch.update(playerRef, {
                points: 0,
                league: newLeague,
                lastSeasonReset: now,
              });
            });
          }

          await batch.commit();
          logger.info(`✅ Batch updates committed for club ${clubId}`);

          // Delete milestone progress
          for (const player of allPlayers) {
            try {
              const exerciseMilestones = await db
                .collection(`users/${player.id}/exerciseMilestones`)
                .get();
              for (const milestone of exerciseMilestones.docs) {
                await milestone.ref.delete();
              }

              const challengeMilestones = await db
                .collection(`users/${player.id}/challengeMilestones`)
                .get();
              for (const milestone of challengeMilestones.docs) {
                await milestone.ref.delete();
              }

              const completedExercises = await db
                .collection(`users/${player.id}/completedExercises`)
                .get();
              for (const completed of completedExercises.docs) {
                await completed.ref.delete();
              }

              const completedChallenges = await db
                .collection(`users/${player.id}/completedChallenges`)
                .get();
              for (const completed of completedChallenges.docs) {
                await completed.ref.delete();
              }

              logger.info(`✅ Reset milestones for player: ${player.firstName} ${player.lastName}`);
              totalPlayersReset++;
            } catch (subError) {
              logger.error(`Error resetting milestones for player ${player.id}:`, subError);
            }
          }

          totalClubsReset++;
          logger.info(`✅ Season reset complete for club: ${clubId}`);
        } catch (clubError) {
          logger.error(`💥 Error processing club ${clubId}:`, clubError);
        }
      }

      await configRef.set(
        {
          lastResetDate: now,
          lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      logger.info(
        `✅ Automatic season reset complete: ${totalClubsReset} clubs, ${totalPlayersReset} players`
      );
      return {
        success: true,
        clubsReset: totalClubsReset,
        playersReset: totalPlayersReset,
        nextResetDate: new Date(now.toMillis() + sixWeeksInMs).toISOString(),
      };
    } catch (error) {
      logger.error('💥 Error during automatic season reset:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Migrate Attendance to Sessions (callable)
 */
const migrateAttendanceToSessions = onCall(
  {
    region: CONFIG.REGION,
    enforceAppCheck: false,
  },
  async () => {
    logger.info('🔄 Starting attendance migration to sessions...');

    try {
      const attendanceSnapshot = await db.collection('attendance').get();

      if (attendanceSnapshot.empty) {
        logger.info('No attendance records found');
        return { success: true, migrated: 0, skipped: 0 };
      }

      logger.info(`Found ${attendanceSnapshot.size} attendance records`);

      let migrated = 0;
      let skipped = 0;
      const batch = db.batch();
      let batchCount = 0;

      for (const attendanceDoc of attendanceSnapshot.docs) {
        const attendance = attendanceDoc.data();

        if (attendance.sessionId) {
          skipped++;
          continue;
        }

        const existingSessionQuery = await db
          .collection('trainingSessions')
          .where('clubId', '==', attendance.clubId)
          .where('subgroupId', '==', attendance.subgroupId)
          .where('date', '==', attendance.date)
          .limit(1)
          .get();

        let sessionId;

        if (!existingSessionQuery.empty) {
          sessionId = existingSessionQuery.docs[0].id;
          logger.info(`Using existing session ${sessionId} for attendance ${attendanceDoc.id}`);
        } else {
          const sessionRef = db.collection('trainingSessions').doc();
          sessionId = sessionRef.id;

          batch.set(sessionRef, {
            date: attendance.date,
            startTime: '18:00',
            endTime: '20:00',
            subgroupId: attendance.subgroupId,
            clubId: attendance.clubId,
            recurringTemplateId: null,
            cancelled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'migration',
          });

          batchCount++;
          logger.info(`Created session ${sessionId} for attendance ${attendanceDoc.id}`);
        }

        batch.update(attendanceDoc.ref, {
          sessionId: sessionId,
        });

        batchCount++;
        migrated++;

        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
          logger.info(`Committed batch, ${migrated} records migrated so far`);
        }
      }

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
      logger.error('💥 Error migrating attendance:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * Migrate Doubles Pairings Names (callable)
 */
const migrateDoublesPairingsNames = onCall({ region: CONFIG.REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can run migrations');
  }

  logger.info('🔄 Starting doublesPairings names migration...');

  try {
    const pairingsSnapshot = await db.collection('doublesPairings').get();

    if (pairingsSnapshot.empty) {
      logger.info('No doublesPairings found');
      return { success: true, migrated: 0, skipped: 0 };
    }

    logger.info(`Found ${pairingsSnapshot.size} doublesPairings`);

    let migrated = 0;
    let skipped = 0;
    const batch = db.batch();
    let batchCount = 0;

    for (const pairingDoc of pairingsSnapshot.docs) {
      const pairing = pairingDoc.data();

      if (pairing.player1Name && pairing.player2Name) {
        skipped++;
        continue;
      }

      const [player1Doc, player2Doc] = await Promise.all([
        db.collection('users').doc(pairing.player1Id).get(),
        db.collection('users').doc(pairing.player2Id).get(),
      ]);

      if (!player1Doc.exists || !player2Doc.exists) {
        logger.warn(`⚠️ Players not found for pairing ${pairingDoc.id}`);
        skipped++;
        continue;
      }

      const player1Data = player1Doc.data();
      const player2Data = player2Doc.data();

      batch.update(pairingDoc.ref, {
        player1Name: `${player1Data.firstName} ${player1Data.lastName}`,
        player2Name: `${player2Data.firstName} ${player2Data.lastName}`,
      });

      batchCount++;
      migrated++;

      if (batchCount >= 500) {
        await batch.commit();
        batchCount = 0;
        logger.info(`Committed batch, ${migrated} pairings migrated so far`);
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info(`✅ Migration complete: ${migrated} migrated, ${skipped} skipped`);
    return {
      success: true,
      migrated,
      skipped,
      total: pairingsSnapshot.size,
    };
  } catch (error) {
    logger.error('💥 Error migrating doublesPairings:', error);
    throw new HttpsError('internal', error.message);
  }
});

/**
 * Migrate Doubles Matches Points History (callable)
 * Creates pointsHistory entries for all processed doubles matches
 * that don't already have history entries
 */
const migrateDoublesMatchesPointsHistory = onCall(
  {
    region: CONFIG.REGION,
    enforceAppCheck: false,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || !['admin', 'coach'].includes(callerDoc.data().role)) {
      throw new HttpsError('permission-denied', 'Only admins and coaches can run migrations');
    }

    logger.info('🔄 Starting doubles matches points history migration...');

    try {
      // Get all processed doubles matches
      const matchesSnapshot = await db
        .collection('doublesMatches')
        .where('processed', '==', true)
        .get();

      if (matchesSnapshot.empty) {
        logger.info('No processed doubles matches found');
        return { success: true, migrated: 0, skipped: 0 };
      }

      logger.info(`Found ${matchesSnapshot.size} processed doubles matches`);

      let migrated = 0;
      let skipped = 0;
      let errors = 0;

      for (const matchDoc of matchesSnapshot.docs) {
        const matchData = matchDoc.data();
        const matchId = matchDoc.id;

        const { teamA, teamB, winningTeam, handicapUsed } = matchData;

        if (!teamA || !teamB || !winningTeam) {
          logger.warn(`⚠️ Invalid match data for ${matchId}`);
          skipped++;
          continue;
        }

        const winningPlayerIds =
          winningTeam === 'A'
            ? [teamA.player1Id, teamA.player2Id]
            : [teamB.player1Id, teamB.player2Id];
        const losingPlayerIds =
          winningTeam === 'A'
            ? [teamB.player1Id, teamB.player2Id]
            : [teamA.player1Id, teamA.player2Id];

        const allPlayerIds = [...winningPlayerIds, ...losingPlayerIds];

        // Check if any player already has a history entry for this match
        let alreadyMigrated = false;
        for (const playerId of allPlayerIds) {
          const existingHistory = await db
            .collection('users')
            .doc(playerId)
            .collection('pointsHistory')
            .where('matchId', '==', matchId)
            .limit(1)
            .get();

          if (!existingHistory.empty) {
            alreadyMigrated = true;
            break;
          }
        }

        if (alreadyMigrated) {
          skipped++;
          continue;
        }

        try {
          // Get all player documents
          const [winner1Doc, winner2Doc, loser1Doc, loser2Doc] = await Promise.all([
            db.collection('users').doc(winningPlayerIds[0]).get(),
            db.collection('users').doc(winningPlayerIds[1]).get(),
            db.collection('users').doc(losingPlayerIds[0]).get(),
            db.collection('users').doc(losingPlayerIds[1]).get(),
          ]);

          if (!winner1Doc.exists || !winner2Doc.exists || !loser1Doc.exists || !loser2Doc.exists) {
            logger.warn(`⚠️ Not all players found for match ${matchId}`);
            skipped++;
            continue;
          }

          const winner1Data = winner1Doc.data();
          const winner2Data = winner2Doc.data();
          const loser1Data = loser1Doc.data();
          const loser2Data = loser2Doc.data();

          // Calculate points (similar to doublesProcessor logic)
          const seasonPointChange = matchData.pointsExchanged || (handicapUsed ? 4 : 3);
          const winnerXPGain = handicapUsed ? 0 : seasonPointChange;
          const matchTypeReason = handicapUsed ? 'Doppel-Wettkampf (Handicap)' : 'Doppel-Wettkampf';

          // Use match timestamp or current time
          const timestamp = matchData.timestamp || matchData.createdAt || admin.firestore.FieldValue.serverTimestamp();

          const batch = db.batch();

          // Create history entries for winners
          const winner1HistoryRef = winner1Doc.ref.collection('pointsHistory').doc();
          batch.set(winner1HistoryRef, {
            points: seasonPointChange,
            xp: winnerXPGain,
            eloChange: 0, // We don't have the original elo change, set to 0
            reason: `Sieg im ${matchTypeReason} (Partner: ${winner2Data.firstName})`,
            timestamp: timestamp,
            awardedBy: 'System (Doppel-Migration)',
            isPartner: true,
            matchId: matchId,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const winner2HistoryRef = winner2Doc.ref.collection('pointsHistory').doc();
          batch.set(winner2HistoryRef, {
            points: seasonPointChange,
            xp: winnerXPGain,
            eloChange: 0,
            reason: `Sieg im ${matchTypeReason} (Partner: ${winner1Data.firstName})`,
            timestamp: timestamp,
            awardedBy: 'System (Doppel-Migration)',
            isPartner: true,
            matchId: matchId,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Create history entries for losers
          const loser1HistoryRef = loser1Doc.ref.collection('pointsHistory').doc();
          batch.set(loser1HistoryRef, {
            points: 0,
            xp: 0,
            eloChange: 0,
            reason: `Niederlage im ${matchTypeReason} (Partner: ${loser2Data.firstName})`,
            timestamp: timestamp,
            awardedBy: 'System (Doppel-Migration)',
            isPartner: true,
            matchId: matchId,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const loser2HistoryRef = loser2Doc.ref.collection('pointsHistory').doc();
          batch.set(loser2HistoryRef, {
            points: 0,
            xp: 0,
            eloChange: 0,
            reason: `Niederlage im ${matchTypeReason} (Partner: ${loser1Data.firstName})`,
            timestamp: timestamp,
            awardedBy: 'System (Doppel-Migration)',
            isPartner: true,
            matchId: matchId,
            migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          await batch.commit();
          migrated++;

          logger.info(`✅ Migrated points history for match ${matchId}`);
        } catch (matchError) {
          logger.error(`💥 Error migrating match ${matchId}:`, matchError);
          errors++;
        }
      }

      logger.info(
        `✅ Migration complete: ${migrated} matches migrated, ${skipped} skipped, ${errors} errors`
      );
      return {
        success: true,
        migrated,
        skipped,
        errors,
        total: matchesSnapshot.size,
      };
    } catch (error) {
      logger.error('💥 Error migrating doubles matches points history:', error);
      throw new HttpsError('internal', error.message);
    }
  }
);

module.exports = {
  cleanupInvitationTokens,
  cleanupExpiredInvitationCodes,
  autoGenerateTrainingSessions,
  autoSeasonReset,
  migrateAttendanceToSessions,
  migrateDoublesPairingsNames,
  migrateDoublesMatchesPointsHistory,
};
