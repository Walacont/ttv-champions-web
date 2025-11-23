/**
 * Invitation Module
 * Handles invitation codes and tokens for user registration
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { CONFIG } = require('./config');

const db = admin.firestore();

/**
 * Sets Custom Claims bei User-Änderung
 */
const setCustomUserClaims = onDocumentWritten(
  {
    region: CONFIG.REGION,
    document: 'users/{userId}',
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

/**
 * Claim Invitation Code (Code-basierte Registrierung)
 */
const claimInvitationCode = onCall({ region: CONFIG.REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du musst angemeldet sein, um einen Code einzulösen.');
  }

  const userId = request.auth.uid;
  const { code, codeId } = request.data;

  if (!code || !codeId) {
    throw new HttpsError('invalid-argument', 'Code und Code-ID sind erforderlich.');
  }

  try {
    const codeRef = db.collection(CONFIG.COLLECTIONS.INVITATION_CODES).doc(codeId);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) {
      throw new HttpsError('not-found', 'Dieser Code existiert nicht.');
    }

    const codeData = codeDoc.data();
    logger.info(
      `Code-Daten geladen: ${JSON.stringify({
        code: codeData.code,
        playerId: codeData.playerId || 'NICHT VORHANDEN',
        used: codeData.used,
        superseded: codeData.superseded,
        firstName: codeData.firstName,
        lastName: codeData.lastName,
      })}`
    );

    if (codeData.code !== code) {
      throw new HttpsError('invalid-argument', 'Code stimmt nicht überein.');
    }

    if (codeData.used) {
      throw new HttpsError('already-exists', 'Dieser Code wurde bereits verwendet.');
    }

    if (codeData.superseded) {
      throw new HttpsError(
        'failed-precondition',
        'Dieser Code wurde durch einen neueren Code ersetzt und ist nicht mehr gültig.'
      );
    }

    const now = admin.firestore.Timestamp.now();
    if (codeData.expiresAt.toMillis() < now.toMillis()) {
      throw new HttpsError('failed-precondition', 'Dieser Code ist abgelaufen.');
    }

    const userRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      throw new HttpsError('already-exists', 'Ein Profil für diesen Benutzer existiert bereits.');
    }

    // Check if this code is for an existing offline player (migration scenario)
    if (codeData.playerId) {
      logger.info(
        `Code ${code} ist für existierenden Offline-Spieler ${codeData.playerId}. Starte Migration...`
      );

      const oldUserRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(codeData.playerId);
      const oldUserDoc = await oldUserRef.get();

      if (!oldUserDoc.exists) {
        throw new HttpsError('not-found', 'Der verknüpfte Offline-Spieler wurde nicht gefunden.');
      }

      const oldUserData = oldUserDoc.data();

      const migratedUserData = {
        ...oldUserData,
        email: request.auth.token.email || oldUserData.email || '',
        onboardingComplete: false,
        isOffline: true,
        migratedFrom: codeData.playerId,
        migratedAt: now,
      };

      await userRef.set(migratedUserData);
      logger.info(`Migriertes User-Dokument für ${userId} erstellt (von ${codeData.playerId})`);

      // Migrate subcollections
      const subcollections = ['pointsHistory', 'xpHistory', 'attendance'];
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

            if (batchCount >= 500) {
              await batch.commit();
              batch = db.batch();
              batchCount = 0;
            }
          }

          if (batchCount > 0) {
            await batch.commit();
          }

          logger.info(`Migriert: ${snapshot.size} Dokumente aus ${subcollectionName}`);
        }
      }

      await oldUserRef.delete();
      logger.info(`Altes Offline-User-Dokument ${codeData.playerId} gelöscht`);
    } else {
      // Create NEW user document (not a migration)
      logger.info(`⚠️ KEIN playerId im Code - erstelle NEUEN Spieler statt Migration!`);
      logger.info(`Code enthält: firstName=${codeData.firstName}, lastName=${codeData.lastName}`);

      const userData = {
        email: request.auth.token.email || '',
        firstName: codeData.firstName || '',
        lastName: codeData.lastName || '',
        clubId: codeData.clubId,
        role: codeData.role || 'player',
        subgroupIds: codeData.subgroupIds || [],
        points: 0,
        xp: 0,
        eloRating: CONFIG.ELO.DEFAULT_RATING,
        highestElo: CONFIG.ELO.DEFAULT_RATING,
        wins: 0,
        losses: 0,
        grundlagenCompleted: 0,
        onboardingComplete: false,
        isOffline: true,
        createdAt: now,
        photoURL: '',
      };

      await userRef.set(userData);
      logger.info(`Neues User-Dokument für ${userId} erstellt via Code ${code}`);
    }

    // Mark code as used
    await codeRef.update({
      used: true,
      usedBy: userId,
      usedAt: now,
    });

    logger.info(`Code ${code} als verwendet markiert von User ${userId}`);

    return {
      success: true,
      message: 'Code erfolgreich eingelöst!',
    };
  } catch (error) {
    logger.error(`Fehler beim Einlösen des Codes ${code}:`, error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Ein unerwarteter Fehler ist aufgetreten.');
  }
});

/**
 * Claim Invitation Token (Email-basierte Registrierung)
 */
const claimInvitationToken = onCall({ region: CONFIG.REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Du musst angemeldet sein, um einen Token einzulösen.');
  }

  const userId = request.auth.uid;
  const { tokenId } = request.data;

  if (!tokenId) {
    throw new HttpsError('invalid-argument', 'Token-ID ist erforderlich.');
  }

  try {
    const tokenRef = db.collection(CONFIG.COLLECTIONS.INVITATION_TOKENS).doc(tokenId);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      throw new HttpsError('not-found', 'Dieser Token existiert nicht.');
    }

    const tokenData = tokenDoc.data();

    if (tokenData.isUsed) {
      throw new HttpsError('already-exists', 'Dieser Token wurde bereits verwendet.');
    }

    const userRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      throw new HttpsError('already-exists', 'Ein Profil für diesen Benutzer existiert bereits.');
    }

    const now = admin.firestore.Timestamp.now();

    const userData = {
      email: request.auth.token.email || '',
      firstName: tokenData.firstName || '',
      lastName: tokenData.lastName || '',
      clubId: tokenData.clubId,
      role: tokenData.role || 'player',
      subgroupIds: tokenData.subgroupIds || [],
      points: 0,
      xp: 0,
      eloRating: CONFIG.ELO.DEFAULT_RATING,
      highestElo: CONFIG.ELO.DEFAULT_RATING,
      wins: 0,
      losses: 0,
      grundlagenCompleted: 0,
      onboardingComplete: false,
      isOffline: true,
      createdAt: now,
      photoURL: '',
    };

    await userRef.set(userData);
    logger.info(`User-Dokument für ${userId} erstellt via Token ${tokenId}`);

    await tokenRef.update({
      isUsed: true,
      usedBy: userId,
      usedAt: now,
    });

    logger.info(`Token ${tokenId} als verwendet markiert von User ${userId}`);

    return {
      success: true,
      message: 'Token erfolgreich eingelöst!',
    };
  } catch (error) {
    logger.error(`Fehler beim Einlösen des Tokens ${tokenId}:`, error);

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError('internal', 'Ein unerwarteter Fehler ist aufgetreten.');
  }
});

module.exports = {
  setCustomUserClaims,
  claimInvitationCode,
  claimInvitationToken,
};
