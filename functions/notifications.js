/**
 * Notifications Module
 * Handles push notifications and email notifications
 */

const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { CONFIG } = require('./config');
const { sendEmail, matchRequestEmail } = require('./emailService');

const db = admin.firestore();

/**
 * Send push notification to a user
 * @param {string} userId - User ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data
 * @return {Promise<boolean>} Success status
 */
async function sendPushNotification(userId, title, body, data = {}) {
  try {
    const userDoc = await db.collection(CONFIG.COLLECTIONS.USERS).doc(userId).get();

    if (!userDoc.exists) {
      logger.warn(`User ${userId} not found`);
      return false;
    }

    const userData = userDoc.data();

    if (!userData.fcmToken || !userData.notificationsEnabled) {
      logger.info(`User ${userId} does not have notifications enabled`);
      return false;
    }

    const preferences = userData.notificationPreferences || {};
    const notificationType = data.type;

    if (notificationType && preferences[notificationType] === false) {
      logger.info(`User ${userId} has disabled ${notificationType} notifications`);
      return false;
    }

    const message = {
      token: userData.fcmToken,
      notification: { title, body },
      data: { ...data, url: data.url || '/dashboard.html' },
      webpush: {
        fcmOptions: { link: data.url || '/dashboard.html' },
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          vibrate: [200, 100, 200],
          requireInteraction: false,
        },
      },
    };

    await admin.messaging().send(message);
    logger.info(` Push notification sent to user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error sending push notification to ${userId}:`, error);

    if (
      error.code === 'messaging/invalid-registration-token' ||
      error.code === 'messaging/registration-token-not-registered'
    ) {
      await db.collection(CONFIG.COLLECTIONS.USERS).doc(userId).update({
        fcmToken: null,
        notificationsEnabled: false,
      });
      logger.info(`Cleared invalid FCM token for user ${userId}`);
    }

    return false;
  }
}

/**
 * Sends email notification to coaches when a doubles match request is pending
 */
const notifyCoachesDoublesRequest = onDocumentWritten(
  {
    region: CONFIG.REGION,
    document: 'doublesMatchRequests/{requestId}',
  },
  async (event) => {
    try {
      const afterData = event.data?.after?.data();
      const beforeData = event.data?.before?.data();

      if (
        !afterData ||
        afterData.status !== 'pending_coach' ||
        (beforeData && beforeData.status === 'pending_coach')
      ) {
        return null;
      }

      logger.info(`=ç Sending coach notification for doubles request ${event.params.requestId}`);

      const clubId = afterData.clubId;

      const coachesSnapshot = await db
        .collection('users')
        .where('clubId', '==', clubId)
        .where('role', 'in', ['coach', 'admin'])
        .get();

      if (coachesSnapshot.empty) {
        logger.warn(`  No coaches found for club ${clubId}`);
        return null;
      }

      // Fetch player names
      const [teamAPlayer1Doc, teamAPlayer2Doc, teamBPlayer1Doc, teamBPlayer2Doc] = await Promise.all(
        [
          db.collection('users').doc(afterData.teamA.player1Id).get(),
          db.collection('users').doc(afterData.teamA.player2Id).get(),
          db.collection('users').doc(afterData.teamB.player1Id).get(),
          db.collection('users').doc(afterData.teamB.player2Id).get(),
        ]
      );

      const teamAPlayer1 = teamAPlayer1Doc.data();
      const teamAPlayer2 = teamAPlayer2Doc.data();
      const teamBPlayer1 = teamBPlayer1Doc.data();
      const teamBPlayer2 = teamBPlayer2Doc.data();

      const teamANames = `${teamAPlayer1?.firstName || '?'} ${teamAPlayer1?.lastName || '?'} & ${teamAPlayer2?.firstName || '?'} ${teamAPlayer2?.lastName || '?'}`;
      const teamBNames = `${teamBPlayer1?.firstName || '?'} ${teamBPlayer1?.lastName || '?'} & ${teamBPlayer2?.firstName || '?'} ${teamBPlayer2?.lastName || '?'}`;
      const setsStr = afterData.sets.map((s) => `${s.teamA}:${s.teamB}`).join(', ');

      // Send email to each coach using the new email service
      const emailPromises = coachesSnapshot.docs.map(async (coachDoc) => {
        const coach = coachDoc.data();
        if (!coach.email) {
          logger.warn(`  Coach ${coachDoc.id} has no email address`);
          return null;
        }

        const emailTemplate = matchRequestEmail({
          coachName: coach.firstName,
          teamANames,
          teamBNames,
          setsStr,
          winningTeam: afterData.winningTeam,
        });

        const success = await sendEmail({
          to: coach.email,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
        });

        return { success, email: coach.email };
      });

      const results = await Promise.all(emailPromises);
      const successCount = results.filter((r) => r?.success).length;

      logger.info(
        `=ç Email notification complete: ${successCount}/${coachesSnapshot.size} coaches notified`
      );

      return { success: true, notified: successCount };
    } catch (error) {
      logger.error('=¥ Error in notifyCoachesDoublesRequest:', error);
      return { success: false, error: error.message };
    }
  }
);

/**
 * Send push notification when match is approved by coach
 */
const sendMatchApprovedNotification = onDocumentWritten(
  {
    document: 'matches/{matchId}',
    region: CONFIG.REGION,
  },
  async (event) => {
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;

    if (!afterData || afterData.status !== 'approved') return null;
    if (beforeData && beforeData.status === 'approved') return null;

    logger.info(`Match ${event.params.matchId} approved, sending notifications...`);

    const playerADoc = await db.collection(CONFIG.COLLECTIONS.USERS).doc(afterData.playerA).get();
    const playerBDoc = await db.collection(CONFIG.COLLECTIONS.USERS).doc(afterData.playerB).get();

    const playerAName = playerADoc.exists ? playerADoc.data().firstName : 'Spieler';
    const playerBName = playerBDoc.exists ? playerBDoc.data().firstName : 'Gegner';

    await Promise.all([
      sendPushNotification(afterData.playerA, '<Ó Match genehmigt!', `Dein Match gegen ${playerBName} wurde genehmigt.`, {
        type: 'matchApproved',
        matchId: event.params.matchId,
        url: '/dashboard.html',
      }),
      sendPushNotification(afterData.playerB, '<Ó Match genehmigt!', `Dein Match gegen ${playerAName} wurde genehmigt.`, {
        type: 'matchApproved',
        matchId: event.params.matchId,
        url: '/dashboard.html',
      }),
    ]);

    return null;
  }
);

/**
 * Send push notification when match request is created
 */
const sendMatchRequestNotification = onDocumentCreated(
  {
    document: 'matchRequests/{requestId}',
    region: CONFIG.REGION,
  },
  async (event) => {
    const data = event.data.data();

    logger.info(`Match request ${event.params.requestId} created, sending notification...`);

    const requesterDoc = await db.collection(CONFIG.COLLECTIONS.USERS).doc(data.requester).get();
    const requesterName = requesterDoc.exists ? requesterDoc.data().firstName : 'Jemand';

    await sendPushNotification(data.playerB, '<Ó Neue Match-Anfrage', `${requesterName} möchte ein Match gegen dich spielen.`, {
      type: 'matchRequest',
      requestId: event.params.requestId,
      url: '/dashboard.html',
    });

    return null;
  }
);

/**
 * Send push notification when user ranks up
 */
const sendRankUpNotification = onDocumentWritten(
  {
    document: 'users/{userId}',
    region: CONFIG.REGION,
  },
  async (event) => {
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;

    if (!beforeData || !afterData) return null;

    const oldRank = beforeData.rank || 'Bronze';
    const newRank = afterData.rank || 'Bronze';

    if (oldRank === newRank) return null;

    const ranks = ['Bronze', 'Silber', 'Gold', 'Platin', 'Diamant', 'Meister', 'Legende'];
    const oldIndex = ranks.indexOf(oldRank);
    const newIndex = ranks.indexOf(newRank);

    if (newIndex <= oldIndex) return null;

    logger.info(`User ${event.params.userId} ranked up to ${newRank}, sending notification...`);

    await sendPushNotification(event.params.userId, `<‰ ${newRank} erreicht!`, `Glückwunsch! Du bist zu ${newRank} aufgestiegen!`, {
      type: 'rankUp',
      rank: newRank,
      url: '/dashboard.html',
    });

    return null;
  }
);

/**
 * Send push notification for training reminders (daily at 17:00)
 */
const sendTrainingReminders = onSchedule(
  {
    schedule: '0 17 * * *',
    timeZone: 'Europe/Berlin',
    region: CONFIG.REGION,
  },
  async () => {
    logger.info('Running training reminders...');

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const trainingsSnapshot = await db
        .collection('trainings')
        .where('date', '>=', admin.firestore.Timestamp.fromDate(today))
        .where('date', '<', admin.firestore.Timestamp.fromDate(tomorrow))
        .get();

      if (trainingsSnapshot.empty) {
        logger.info('No trainings tomorrow');
        return null;
      }

      logger.info(`Found ${trainingsSnapshot.size} trainings tomorrow`);

      const promises = [];

      for (const trainingDoc of trainingsSnapshot.docs) {
        const training = trainingDoc.data();

        const usersSnapshot = await db
          .collection(CONFIG.COLLECTIONS.USERS)
          .where('clubId', '==', training.clubId)
          .where('role', '==', 'player')
          .get();

        for (const userDoc of usersSnapshot.docs) {
          const time = training.time || '18:00';

          promises.push(
            sendPushNotification(userDoc.id, '<Ó Training morgen!', `Erinnerung: Training morgen um ${time} Uhr`, {
              type: 'trainingReminder',
              trainingId: trainingDoc.id,
              url: '/dashboard.html',
            })
          );
        }
      }

      const results = await Promise.allSettled(promises);
      const successCount = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

      logger.info(`Training reminders sent: ${successCount}/${promises.length}`);

      return null;
    } catch (error) {
      logger.error('Error sending training reminders:', error);
      return null;
    }
  }
);

/**
 * Test notification function
 */
const sendTestNotification = onCall({ region: CONFIG.REGION }, async (request) => {
  const userId = request.auth?.uid;

  if (!userId) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  await sendPushNotification(userId, '>ê Test-Benachrichtigung', 'Dies ist eine Test-Benachrichtigung von TTV Champions!', {
    type: 'test',
    url: '/dashboard.html',
  });

  return { success: true, message: 'Test notification sent' };
});

module.exports = {
  sendPushNotification,
  notifyCoachesDoublesRequest,
  sendMatchApprovedNotification,
  sendMatchRequestNotification,
  sendRankUpNotification,
  sendTrainingReminders,
  sendTestNotification,
};
