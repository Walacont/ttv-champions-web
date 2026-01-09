const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const CONFIG = {
    COLLECTIONS: {
        USERS: 'users',
        MATCHES: 'matches',
        MATCH_REQUESTS: 'matchRequests',
        INVITATION_TOKENS: 'invitationTokens',
        INVITATION_CODES: 'invitationCodes',
        POINTS_HISTORY: 'pointsHistory',
        CLUBS: 'clubs',
    },
    ELO: {
        DEFAULT_RATING: 800,
        K_FACTOR: 32,
        SEASON_POINT_FACTOR: 0.2,
        HANDICAP_SEASON_POINTS: 8,
        // Elo-Gates: Einmal erreicht, kann das Elo nie unter diese Schwellen fallen
        GATES: [800, 850, 900, 1000, 1100, 1300, 1600],
    },
    REGION: 'europe-west3',
};

function getHighestEloGate(currentElo, highestElo) {
    const maxReached = Math.max(currentElo, highestElo || 0);
    const gates = CONFIG.ELO.GATES;

    for (let i = gates.length - 1; i >= 0; i--) {
        if (maxReached >= gates[i]) {
            return gates[i];
        }
    }
    return 0;
}

function applyEloGate(newElo, currentElo, highestElo) {
    const gate = getHighestEloGate(currentElo, highestElo);
    return Math.max(newElo, gate);
}

function calculateElo(winnerElo, loserElo, kFactor = 32) {
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
    const expectedLoser = 1 - expectedWinner;

    const newWinnerElo = Math.round(winnerElo + kFactor * (1 - expectedWinner));
    const newLoserElo = Math.round(loserElo + kFactor * (0 - expectedLoser));
    const eloDelta = Math.abs(newWinnerElo - winnerElo);

    return { newWinnerElo, newLoserElo, eloDelta };
}

exports._testOnly = {
    calculateElo,
    getHighestEloGate,
    applyEloGate,
    CONFIG,
};

exports.processMatchResult = onDocumentCreated(
    {
        region: CONFIG.REGION,
        document: `${CONFIG.COLLECTIONS.MATCHES}/{matchId}`,
    },
    async event => {
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

            // 0 ist ein gültiger Wert
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

            // Verlierer: Nur Elo-Änderungen, keine Punktabzüge
            batch.update(loserRef, {
                eloRating: protectedLoserElo,
                highestElo: newLoserHighestElo,
            });

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
                reason: `Niederlage im ${matchTypeReason} gegen ${
                    winnerData.firstName || 'Gegner'
                }`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                awardedBy: 'System (Wettkampf)',
            });

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

exports.cleanupInvitationTokens = onSchedule(
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
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        logger.info(`🧹 ${snapshot.size} alte Invitation-Tokens gelöscht.`);
        return null;
    }
);

exports.setCustomUserClaims = onDocumentWritten(
    {
        region: CONFIG.REGION,
        document: 'users/{userId}',
    },
    async event => {
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

exports.claimInvitationCode = onCall({ region: CONFIG.REGION }, async request => {
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'Du musst angemeldet sein, um einen Code einzulösen.'
        );
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
            throw new HttpsError(
                'already-exists',
                'Ein Profil für diesen Benutzer existiert bereits.'
            );
        }

        if (codeData.playerId) {
            logger.info(
                `Code ${code} ist für existierenden Offline-Spieler ${codeData.playerId}. Starte Migration...`
            );

            const oldUserRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(codeData.playerId);
            const oldUserDoc = await oldUserRef.get();

            if (!oldUserDoc.exists) {
                throw new HttpsError(
                    'not-found',
                    'Der verknüpfte Offline-Spieler wurde nicht gefunden.'
                );
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
            logger.info(
                `Migriertes User-Dokument für ${userId} erstellt (von ${codeData.playerId})`
            );

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
            logger.info(`⚠️ KEIN playerId im Code - erstelle NEUEN Spieler statt Migration!`);
            logger.info(
                `Code enthält: firstName=${codeData.firstName}, lastName=${codeData.lastName}`
            );

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
                grundlagenCompleted: 0,
                onboardingComplete: false,
                isOffline: true,
                createdAt: now,
                photoURL: '',
                clubRequestStatus: null,
                clubRequestId: null,
                privacySettings: {
                    searchable: 'global',
                    showInLeaderboards: true,
                },
                clubJoinedAt: now,
            };

            await userRef.set(userData);
            logger.info(`Neues User-Dokument für ${userId} erstellt via Code ${code}`);
        }

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

exports.claimInvitationToken = onCall({ region: CONFIG.REGION }, async request => {
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'Du musst angemeldet sein, um einen Token einzulösen.'
        );
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
            throw new HttpsError(
                'already-exists',
                'Ein Profil für diesen Benutzer existiert bereits.'
            );
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

exports.cleanupExpiredInvitationCodes = onSchedule(
    {
        schedule: 'every 24 hours',
        region: CONFIG.REGION,
        timeZone: 'Europe/Berlin',
    },
    async event => {
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

            expiredCodesSnapshot.forEach(doc => {
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


exports.processApprovedMatchRequest = onDocumentWritten(
    {
        region: CONFIG.REGION,
        document: `${CONFIG.COLLECTIONS.MATCH_REQUESTS}/{requestId}`,
    },
    async event => {
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


exports.autoGenerateTrainingSessions = onSchedule(
    {
        schedule: '0 0 * * *',
        timeZone: 'Europe/Berlin',
        region: CONFIG.REGION,
    },
    async event => {
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

            const formatDate = date => {
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


exports.migrateAttendanceToSessions = onCall(
    {
        region: CONFIG.REGION,
        enforceAppCheck: false,
    },
    async request => {
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
                    logger.info(
                        `Using existing session ${sessionId} for attendance ${attendanceDoc.id}`
                    );
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


exports.migrateDoublesPairingsNames = onCall({ region: CONFIG.REGION }, async request => {
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


exports.autoSeasonReset = onSchedule(
    {
        schedule: '0 0 * * *',
        timeZone: 'Europe/Berlin',
        region: CONFIG.REGION,
    },
    async event => {
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
                    const daysRemaining = Math.ceil(
                        (sixWeeksInMs - timeSinceLastReset) / (24 * 60 * 60 * 1000)
                    );
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

                    const allPlayers = playersQuery.docs.map(doc => ({
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

                            if (rank <= PROMOTION_COUNT) {
                                const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                                if (currentLeagueIndex < leagueKeys.length - 1) {
                                    newLeague = leagueKeys[currentLeagueIndex + 1];
                                    logger.info(
                                        `Promoting ${player.firstName} ${player.lastName} from ${leagueName} to ${newLeague}`
                                    );
                                }
                            }
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

                            batch.update(playerRef, {
                                points: 0,
                                league: newLeague,
                                lastSeasonReset: now,
                            });
                        });
                    }

                    await batch.commit();
                    logger.info(`✅ Batch updates committed for club ${clubId}`);

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


exports.processDoublesMatchResult = onDocumentCreated(
    {
        region: CONFIG.REGION,
        document: 'doublesMatches/{matchId}',
    },
    async event => {
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
            winningTeam === 'A'
                ? [teamA.player1Id, teamA.player2Id]
                : [teamB.player1Id, teamB.player2Id];
        const losingPlayerIds =
            winningTeam === 'A'
                ? [teamB.player1Id, teamB.player2Id]
                : [teamA.player1Id, teamA.player2Id];

        try {
            const [
                winner1Doc,
                winner2Doc,
                loser1Doc,
                loser2Doc,
                winningPairingDoc,
                losingPairingDoc,
            ] = await Promise.all([
            const [winner1Doc, winner2Doc, loser1Doc, loser2Doc] = await Promise.all([
                db.collection(CONFIG.COLLECTIONS.USERS).doc(winningPlayerIds[0]).get(),
                db.collection(CONFIG.COLLECTIONS.USERS).doc(winningPlayerIds[1]).get(),
                db.collection(CONFIG.COLLECTIONS.USERS).doc(losingPlayerIds[0]).get(),
                db.collection(CONFIG.COLLECTIONS.USERS).doc(losingPlayerIds[1]).get(),
                db.collection('doublesPairings').doc(winningPairingId).get(),
                db.collection('doublesPairings').doc(losingPairingId).get(),
            ]);

            if (
                !winner1Doc.exists ||
                !winner2Doc.exists ||
                !loser1Doc.exists ||
                !loser2Doc.exists
            ) {
                throw new Error('Nicht alle Spieler gefunden');
            }

            const winner1Data = winner1Doc.data();
            const winner2Data = winner2Doc.data();
            const loser1Data = loser1Doc.data();
            const loser2Data = loser2Doc.data();

            const winner1IndividualElo = winner1Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
            const winner2IndividualElo = winner2Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
            const loser1IndividualElo = loser1Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
            const loser2IndividualElo = loser2Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;

            let winningTeamElo;
            let losingTeamElo;

            if (winningPairingDoc.exists && winningPairingDoc.data().pairingEloRating) {
                winningTeamElo = winningPairingDoc.data().pairingEloRating;
                logger.info(
                    `Using existing pairing ELO for winners: ${winningTeamElo}`
                );
            } else {
                winningTeamElo = Math.round((winner1IndividualElo + winner2IndividualElo) / 2);
                logger.info(
                    `New winning pairing, using average of individual ELOs: ${winningTeamElo}`
                );
            }

            if (losingPairingDoc.exists && losingPairingDoc.data().pairingEloRating) {
                losingTeamElo = losingPairingDoc.data().pairingEloRating;
                logger.info(`Using existing pairing ELO for losers: ${losingTeamElo}`);
            } else {
                losingTeamElo = Math.round((loser1IndividualElo + loser2IndividualElo) / 2);
                logger.info(
                    `New losing pairing, using average of individual ELOs: ${losingTeamElo}`
                );
            }
            const winner1Elo = winner1Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
            const winner2Elo = winner2Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
            const loser1Elo = loser1Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;
            const loser2Elo = loser2Data.doublesEloRating ?? CONFIG.ELO.DEFAULT_RATING;

            const winningTeamElo = Math.round((winner1Elo + winner2Elo) / 2);
            const losingTeamElo = Math.round((loser1Elo + loser2Elo) / 2);

            logger.info(
                `Doubles match ${matchId}: Team Elos - Winners: ${winningTeamElo}, Losers: ${losingTeamElo}`
            );

            let newWinningTeamElo;
            let newLosingTeamElo;
            let winner1NewElo, winner2NewElo, loser1NewElo, loser2NewElo;
            let seasonPointChange;
            let winnerXPGain = 0;
            let matchTypeReason = 'Doppel-Wettkampf';

            if (handicapUsed) {
                seasonPointChange = CONFIG.ELO.HANDICAP_SEASON_POINTS;

                const pairingEloChange = CONFIG.ELO.HANDICAP_SEASON_POINTS / 2;

                newWinningTeamElo = winningTeamElo + pairingEloChange;
                newLosingTeamElo = losingTeamElo - pairingEloChange;
                seasonPointChange = CONFIG.ELO.HANDICAP_SEASON_POINTS;

                const eloChangePerPlayer = CONFIG.ELO.HANDICAP_SEASON_POINTS / 2;

                winner1NewElo = winner1Elo + eloChangePerPlayer;
                winner2NewElo = winner2Elo + eloChangePerPlayer;
                loser1NewElo = loser1Elo - eloChangePerPlayer;
                loser2NewElo = loser2Elo - eloChangePerPlayer;

                winnerXPGain = 0;

                logger.info(
                    `Handicap Doubles Match: Fixed ±${pairingEloChange} Pairing ELO change`
                );
            } else {
                const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                    winningTeamElo,
                    losingTeamElo,
                    CONFIG.ELO.K_FACTOR
                );

                newWinningTeamElo = newWinnerElo;
                newLosingTeamElo = newLoserElo;
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
                    `Standard Doubles Match: Pairing ELO change - Winners: ${newWinningTeamElo - winningTeamElo}, Losers: ${newLosingTeamElo - losingTeamElo}`
                );
                logger.info(
                    `Season points per player: ${seasonPointChange}, XP: ${winnerXPGain}`
                );
            }

            const winningPairingHighestElo = winningPairingDoc.exists
                ? winningPairingDoc.data().highestPairingElo || winningTeamElo
                : winningTeamElo;
            const losingPairingHighestElo = losingPairingDoc.exists
                ? losingPairingDoc.data().highestPairingElo || losingTeamElo
                : losingTeamElo;

            newLosingTeamElo = applyEloGate(
                newLosingTeamElo,
                losingTeamElo,
                losingPairingHighestElo
            );

            const newWinningPairingHighestElo = Math.max(newWinningTeamElo, winningPairingHighestElo);
            const newLosingPairingHighestElo = Math.max(newLosingTeamElo, losingPairingHighestElo);

            const batch = db.batch();

            const winner1Update = {
                    `Standard Doubles Match: Season points per player: ${seasonPointChange}, XP: ${winnerXPGain}`
                );
            }

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

            const winner2Update = {
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

            batch.update(loser1Doc.ref, {
            batch.update(loser1Doc.ref, {
                doublesEloRating: loser1NewElo,
                highestDoublesElo: loser1HighestDoublesEloNew,
                doublesMatchesPlayed: admin.firestore.FieldValue.increment(1),
                doublesMatchesLost: admin.firestore.FieldValue.increment(1),
            });

            batch.update(loser2Doc.ref, {
            batch.update(loser2Doc.ref, {
                doublesEloRating: loser2NewElo,
                highestDoublesElo: loser2HighestDoublesEloNew,
                doublesMatchesPlayed: admin.firestore.FieldValue.increment(1),
                doublesMatchesLost: admin.firestore.FieldValue.increment(1),
            });

            const pairingEloChange = newWinningTeamElo - winningTeamElo;
            const winner1HistoryRef = winner1Doc.ref
                .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
                .doc();
            batch.set(winner1HistoryRef, {
                points: seasonPointChange,
                xp: winnerXPGain,
                pairingEloChange: pairingEloChange,
                eloChange: winner1NewElo - winner1Elo,
                reason: `Sieg im ${matchTypeReason} (Partner: ${winner2Data.firstName})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                awardedBy: 'System (Doppel)',
                isPartner: true,
            });

            const winner2HistoryRef = winner2Doc.ref
                .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
                .doc();
            batch.set(winner2HistoryRef, {
                points: seasonPointChange,
                xp: winnerXPGain,
                pairingEloChange: pairingEloChange,
                eloChange: winner2NewElo - winner2Elo,
                reason: `Sieg im ${matchTypeReason} (Partner: ${winner1Data.firstName})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                awardedBy: 'System (Doppel)',
                isPartner: true,
            });

            const losingPairingEloChange = newLosingTeamElo - losingTeamElo;
            const loser1HistoryRef = loser1Doc.ref
                .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
                .doc();
            batch.set(loser1HistoryRef, {
                points: 0,
                xp: 0,
                pairingEloChange: losingPairingEloChange,
                eloChange: loser1NewElo - loser1Elo,
                reason: `Niederlage im ${matchTypeReason} (Partner: ${loser2Data.firstName})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                awardedBy: 'System (Doppel)',
                isPartner: true,
            });

            const loser2HistoryRef = loser2Doc.ref
                .collection(CONFIG.COLLECTIONS.POINTS_HISTORY)
                .doc();
            batch.set(loser2HistoryRef, {
                points: 0,
                xp: 0,
                pairingEloChange: losingPairingEloChange,
                eloChange: loser2NewElo - loser2Elo,
                reason: `Niederlage im ${matchTypeReason} (Partner: ${loser1Data.firstName})`,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                awardedBy: 'System (Doppel)',
                isPartner: true,
            });

            const winningPairingRef = db.collection('doublesPairings').doc(winningPairingId);
            const losingPairingRef = db.collection('doublesPairings').doc(losingPairingId);

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
                    player1ClubIdAtMatch: winner1Data.clubId || null,
                    player2ClubIdAtMatch: winner2Data.clubId || null,
                    pairingId: winningPairingId,
                    matchesPlayed: 1,
                    matchesWon: 1,
                    matchesLost: 0,
                    winRate: 1.0,
                    pairingEloRating: newWinningTeamElo,
                    highestPairingElo: newWinningTeamElo,
                    currentEloRating: newWinningTeamElo,
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
                    pairingEloRating: newWinningTeamElo,
                    highestPairingElo: newWinningPairingHighestElo,
                    currentEloRating: newWinningTeamElo,
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
                    player1ClubIdAtMatch: loser1Data.clubId || null,
                    player2ClubIdAtMatch: loser2Data.clubId || null,
                    pairingId: losingPairingId,
                    matchesPlayed: 1,
                    matchesWon: 0,
                    matchesLost: 1,
                    winRate: 0.0,
                    pairingEloRating: newLosingTeamElo,
                    highestPairingElo: newLosingTeamElo,
                    currentEloRating: newLosingTeamElo,
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
                    pairingEloRating: newLosingTeamElo,
                    highestPairingElo: newLosingPairingHighestElo,
                    currentEloRating: newLosingTeamElo,
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


exports.processApprovedDoublesMatchRequest = onDocumentWritten(
    {
        region: CONFIG.REGION,
        document: 'doublesMatchRequests/{requestId}',
    },
    async event => {
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


const nodemailer = require('nodemailer');


exports.notifyCoachesDoublesRequest = onDocumentWritten(
    {
        region: CONFIG.REGION,
        document: 'doublesMatchRequests/{requestId}',
    },
    async event => {
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

            logger.info(
                `📧 Sending coach notification for doubles request ${event.params.requestId}`
            );

            const clubId = afterData.clubId;

            const coachesSnapshot = await db
                .collection('users')
                .where('clubId', '==', clubId)
                .where('role', 'in', ['coach', 'admin'])
                .get();

            if (coachesSnapshot.empty) {
                logger.warn(`⚠️ No coaches found for club ${clubId}`);
                return null;
            }

            const [teamAPlayer1Doc, teamAPlayer2Doc, teamBPlayer1Doc, teamBPlayer2Doc] =
                await Promise.all([
                    db.collection('users').doc(afterData.teamA.player1Id).get(),
                    db.collection('users').doc(afterData.teamA.player2Id).get(),
                    db.collection('users').doc(afterData.teamB.player1Id).get(),
                    db.collection('users').doc(afterData.teamB.player2Id).get(),
                ]);

            const teamAPlayer1 = teamAPlayer1Doc.data();
            const teamAPlayer2 = teamAPlayer2Doc.data();
            const teamBPlayer1 = teamBPlayer1Doc.data();
            const teamBPlayer2 = teamBPlayer2Doc.data();

            const teamANames = `${teamAPlayer1?.firstName || '?'} ${teamAPlayer1?.lastName || '?'} & ${teamAPlayer2?.firstName || '?'} ${teamAPlayer2?.lastName || '?'}`;
            const teamBNames = `${teamBPlayer1?.firstName || '?'} ${teamBPlayer1?.lastName || '?'} & ${teamBPlayer2?.firstName || '?'} ${teamBPlayer2?.lastName || '?'}`;

            const setsStr = afterData.sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');

            const smtpConfig = {
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER || process.env.EMAIL_USER,
                    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
                },
            };

            if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
                logger.warn(
                    '⚠️ SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.'
                );
                return null;
            }

            const transporter = nodemailer.createTransporter(smtpConfig);

            const emailPromises = coachesSnapshot.docs.map(async coachDoc => {
                const coach = coachDoc.data();
                if (!coach.email) {
                    logger.warn(`⚠️ Coach ${coachDoc.id} has no email address`);
                    return null;
                }

                const mailOptions = {
                    from: `"TTV Champions" <${smtpConfig.auth.user}>`,
                    to: coach.email,
                    subject: '🎾 Neue Doppel-Match Anfrage wartet auf Genehmigung',
                    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4f46e5;">Neue Doppel-Match Anfrage</h2>
              <p>Hallo ${coach.firstName || 'Coach'},</p>
              <p>Es wartet eine neue Doppel-Match Anfrage auf deine Genehmigung:</p>

              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Team A:</strong> ${teamANames}</p>
                <p style="margin: 5px 0;"><strong>Team B:</strong> ${teamBNames}</p>
                <p style="margin: 5px 0;"><strong>Ergebnis:</strong> ${setsStr}</p>
                <p style="margin: 5px 0;"><strong>Gewinner:</strong> Team ${afterData.winningTeam}</p>
                ${afterData.handicapUsed ? '<p style="margin: 5px 0; color: #f59e0b;"><strong>⚖️ Handicap verwendet</strong></p>' : ''}
              </div>

              <p>Bitte logge dich in die TTV Champions App ein, um die Anfrage zu genehmigen oder abzulehnen.</p>

              <a href="${process.env.APP_URL || 'https://ttv-champions.web.app'}/coach.html"
                 style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">
                Zur App
              </a>

              <p style="margin-top: 30px; color: #6b7280; font-size: 12px;">
                Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
              </p>
            </div>
          `,
                };

                try {
                    await transporter.sendMail(mailOptions);
                    logger.info(`✅ Email sent to coach ${coach.email}`);
                    return { success: true, email: coach.email };
                } catch (error) {
                    logger.error(`❌ Failed to send email to ${coach.email}:`, error);
                    return { success: false, email: coach.email, error: error.message };
                }
            });

            const results = await Promise.all(emailPromises);
            const successCount = results.filter(r => r?.success).length;

            logger.info(
                `📧 Email notification complete: ${successCount}/${coachesSnapshot.size} coaches notified`
            );

            return { success: true, notified: successCount };
        } catch (error) {
            logger.error('💥 Error in notifyCoachesDoublesRequest:', error);
            return { success: false, error: error.message };
        }
    }
);


exports.notifyCoachesSinglesRequest = onDocumentWritten(
    {
        region: CONFIG.REGION,
        document: 'matchRequests/{requestId}',
    },
    async event => {
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

            logger.info(
                `📧 Sending coach notification for singles match request ${event.params.requestId}`
            );

            const clubId = afterData.clubId;

            const coachesSnapshot = await db
                .collection('users')
                .where('clubId', '==', clubId)
                .where('role', 'in', ['coach', 'admin'])
                .get();

            if (coachesSnapshot.empty) {
                logger.warn(`⚠️ No coaches found for club ${clubId}`);
                return null;
            }

            const [playerADoc, playerBDoc] = await Promise.all([
                db.collection('users').doc(afterData.playerAId).get(),
                db.collection('users').doc(afterData.playerBId).get(),
            ]);

            const playerA = playerADoc.data();
            const playerB = playerBDoc.data();

            const playerAName = `${playerA?.firstName || '?'} ${playerA?.lastName || '?'}`;
            const playerBName = `${playerB?.firstName || '?'} ${playerB?.lastName || '?'}`;

            const setsStr = afterData.sets?.map(s => `${s.playerA}:${s.playerB}`).join(', ') || 'N/A';

            const winnerName = afterData.winnerId === afterData.playerAId ? playerAName : playerBName;

            const smtpConfig = {
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER || process.env.EMAIL_USER,
                    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
                },
            };

            if (!smtpConfig.auth.user || !smtpConfig.auth.pass) {
                logger.warn(
                    '⚠️ SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS environment variables.'
                );
                return null;
            }

            const transporter = nodemailer.createTransporter(smtpConfig);

            const emailPromises = coachesSnapshot.docs.map(async coachDoc => {
                const coach = coachDoc.data();
                if (!coach.email) {
                    logger.warn(`⚠️ Coach ${coachDoc.id} has no email address`);
                    return null;
                }

                const mailOptions = {
                    from: `"TTV Champions" <${smtpConfig.auth.user}>`,
                    to: coach.email,
                    subject: '🏓 Neue Match-Anfrage wartet auf Genehmigung',
                    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #4f46e5;">Neue Match-Anfrage</h2>
              <p>Hallo ${coach.firstName || 'Coach'},</p>
              <p>Es wartet eine neue Match-Anfrage auf deine Genehmigung:</p>

              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Spieler A:</strong> ${playerAName}</p>
                <p style="margin: 5px 0;"><strong>Spieler B:</strong> ${playerBName}</p>
                <p style="margin: 5px 0;"><strong>Ergebnis:</strong> ${setsStr}</p>
                <p style="margin: 5px 0;"><strong>Gewinner:</strong> ${winnerName}</p>
                ${afterData.handicapUsed ? '<p style="margin: 5px 0; color: #f59e0b;"><strong>⚖️ Handicap verwendet</strong></p>' : ''}
              </div>

              <p>Bitte logge dich in die TTV Champions App ein, um die Anfrage zu genehmigen oder abzulehnen.</p>

              <a href="${process.env.APP_URL || 'https://ttv-champions.web.app'}/coach.html"
                 style="display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 6px;">
                Zur App
              </a>

              <p style="margin-top: 30px; color: #6b7280; font-size: 12px;">
                Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
              </p>
            </div>
          `,
                };

                try {
                    await transporter.sendMail(mailOptions);
                    logger.info(`✅ Email sent to coach ${coach.email}`);
                    return { success: true, email: coach.email };
                } catch (error) {
                    logger.error(`❌ Failed to send email to ${coach.email}:`, error);
                    return { success: false, email: coach.email, error: error.message };
                }
            });

            const results = await Promise.all(emailPromises);
            const successCount = results.filter(r => r?.success).length;

            logger.info(
                `📧 Email notification complete: ${successCount}/${coachesSnapshot.size} coaches notified`
            );

            return { success: true, notified: successCount };
        } catch (error) {
            logger.error('💥 Error in notifyCoachesSinglesRequest:', error);
            return { success: false, error: error.message };
        }
    }
);



exports.anonymizeAccount = onCall({ region: CONFIG.REGION }, async request => {
    const requestingUserId = request.auth?.uid;
    const { userId } = request.data;

    if (!requestingUserId || requestingUserId !== userId) {
        throw new HttpsError(
            'permission-denied',
            'You can only delete your own account'
        );
    }

    try {
        logger.info(`Starting account anonymization for user: ${userId}`);

        const userRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            throw new HttpsError('not-found', 'User not found');
        }

        const userData = userDoc.data();

        const userIdHash = userId.substring(0, 8);
        const anonymizedName = `Gelöschter Nutzer #${userIdHash}`;

        await userRef.update({
            deleted: true,
            deletedAt: admin.firestore.FieldValue.serverTimestamp(),

            firstName: null,
            lastName: null,
            displayName: anonymizedName,
            email: null,
            birthdate: null,
            gender: null,
            photoURL: null,
            phoneNumber: null,

        });

        logger.info(`User data anonymized: ${userId}`);

        try {
            await db
                .collection('fcmTokens')
                .where('userId', '==', userId)
                .get()
                .then(snapshot => {
                    const batch = db.batch();
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));
                    return batch.commit();
                });
            logger.info(`FCM tokens deleted for user: ${userId}`);
        } catch (error) {
            logger.warn(`Error deleting FCM tokens: ${error.message}`);
        }

        try {
            await db
                .collection(CONFIG.COLLECTIONS.INVITATION_TOKENS)
                .where('createdBy', '==', userId)
                .get()
                .then(snapshot => {
                    const batch = db.batch();
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));
                    return batch.commit();
                });
            logger.info(`Invitation tokens deleted for user: ${userId}`);
        } catch (error) {
            logger.warn(`Error deleting invitation tokens: ${error.message}`);
        }

        try {
            await db
                .collection('notificationPreferences')
                .doc(userId)
                .delete();
            logger.info(`Notification preferences deleted for user: ${userId}`);
        } catch (error) {
            logger.warn(`Error deleting notification preferences: ${error.message}`);
        }

        try {
            await admin.auth().deleteUser(userId);
            logger.info(`Firebase Auth account deleted: ${userId}`);
        } catch (error) {
            logger.error(`Error deleting Firebase Auth account: ${error.message}`);
        }

        logger.info(`Account anonymization completed successfully for: ${userId}`);

        return {
            success: true,
            message: 'Account successfully anonymized',
        };
    } catch (error) {
        logger.error('Error anonymizing account:', error);
        throw new HttpsError(
            'internal',
            `Error anonymizing account: ${error.message}`
        );
    }
});

exports.registerWithoutCode = onCall({ region: CONFIG.REGION }, async request => {
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'Du musst angemeldet sein, um dich zu registrieren.'
        );
    }

    const userId = request.auth.uid;
    const { firstName, lastName } = request.data;

    if (!firstName || !lastName) {
        throw new HttpsError('invalid-argument', 'Vor- und Nachname sind erforderlich.');
    }

    try {
        const userRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            throw new HttpsError(
                'already-exists',
                'Ein Profil für diesen Benutzer existiert bereits.'
            );
        }

        const now = admin.firestore.Timestamp.now();
        const userData = {
            email: request.auth.token.email || '',
            firstName: firstName,
            lastName: lastName,
            clubId: null,
            role: 'player',
            subgroupIds: [],
            points: 0,
            xp: 0,
            eloRating: CONFIG.ELO.DEFAULT_RATING,
            highestElo: CONFIG.ELO.DEFAULT_RATING,
            wins: 0,
            losses: 0,
            grundlagenCompleted: 5,
            onboardingComplete: false,
            isOffline: true,
            createdAt: now,
            photoURL: '',
            clubRequestStatus: null,
            clubRequestId: null,
            privacySettings: {
                searchable: 'global',
                showInLeaderboards: true,
            },
        };

        await userRef.set(userData);
        logger.info(`New user created without club: ${userId} (${firstName} ${lastName})`);

        return {
            success: true,
            message: 'Registrierung erfolgreich!',
        };
    } catch (error) {
        logger.error(`Error registering user ${userId}:`, error);

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'Ein unerwarteter Fehler ist aufgetreten.');
    }
});

exports.handleClubRequest = onCall({ region: CONFIG.REGION }, async request => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Du musst angemeldet sein.');
    }

    const coachId = request.auth.uid;
    const { requestId, action } = request.data;

    if (!requestId || !action) {
        throw new HttpsError('invalid-argument', 'Request-ID und Aktion sind erforderlich.');
    }

    if (!['approve', 'reject'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Ungültige Aktion. Verwende "approve" oder "reject".');
    }

    try {
        const coachRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(coachId);
        const coachDoc = await coachRef.get();

        if (!coachDoc.exists) {
            throw new HttpsError('not-found', 'Coach nicht gefunden.');
        }

        const coachData = coachDoc.data();

        if (!['coach', 'admin'].includes(coachData.role)) {
            throw new HttpsError('permission-denied', 'Nur Coaches und Admins können Anfragen bearbeiten.');
        }

        const requestRef = db.collection('clubRequests').doc(requestId);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            throw new HttpsError('not-found', 'Anfrage nicht gefunden.');
        }

        const requestData = requestDoc.data();

        if (coachData.clubId !== requestData.clubId) {
            throw new HttpsError('permission-denied', 'Du kannst nur Anfragen für deinen eigenen Verein bearbeiten.');
        }

        if (requestData.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'Diese Anfrage wurde bereits bearbeitet.');
        }

        const playerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(requestData.playerId);
        const playerDoc = await playerRef.get();

        if (!playerDoc.exists) {
            throw new HttpsError('not-found', 'Spieler nicht gefunden.');
        }

        const now = admin.firestore.Timestamp.now();
        const batch = db.batch();

        if (action === 'approve') {
            const playerData = playerDoc.data();
            const wasWithoutClub = !playerData.clubId || playerData.clubId === '' || playerData.clubId === 'null';

            const updateData = {
                clubId: requestData.clubId,
                clubRequestStatus: 'approved',
                clubRequestId: null,
                clubJoinedAt: now,
            };

            if (wasWithoutClub) {
                updateData['leaderboardPreferences.showEffortTab'] = false;
                updateData['leaderboardPreferences.showRanksTab'] = false;
                updateData['leaderboardPreferences.showSeasonTab'] = false;
                logger.info(`Player ${requestData.playerId} was without club - hiding Fleiß, Ränge, and Season tabs by default`);
            }

            batch.update(playerRef, updateData);

            batch.update(requestRef, {
                status: 'approved',
                processedBy: coachId,
                processedAt: now,
            });

            logger.info(`Club request approved: ${requestId} by coach ${coachId}`);
        } else {
            batch.update(playerRef, {
                clubRequestStatus: null,
                clubRequestId: null,
            });

            batch.update(requestRef, {
                status: 'rejected',
                processedBy: coachId,
                processedAt: now,
            });

            logger.info(`Club request rejected: ${requestId} by coach ${coachId}`);
        }

        await batch.commit();

        return {
            success: true,
            message: action === 'approve' ? 'Spieler erfolgreich genehmigt!' : 'Anfrage abgelehnt.',
        };
    } catch (error) {
        logger.error(`Error handling club request ${requestId}:`, error);

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'Ein unerwarteter Fehler ist aufgetreten.');
    }
});

exports.handleLeaveRequest = onCall({ region: CONFIG.REGION }, async request => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Du musst angemeldet sein.');
    }

    const coachId = request.auth.uid;
    const { requestId, action } = request.data;

    if (!requestId || !action) {
        throw new HttpsError('invalid-argument', 'Request-ID und Aktion sind erforderlich.');
    }

    if (!['approve', 'reject'].includes(action)) {
        throw new HttpsError('invalid-argument', 'Ungültige Aktion. Verwende "approve" oder "reject".');
    }

    try {
        const coachRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(coachId);
        const coachDoc = await coachRef.get();

        if (!coachDoc.exists) {
            throw new HttpsError('not-found', 'Coach nicht gefunden.');
        }

        const coachData = coachDoc.data();

        if (!['coach', 'admin'].includes(coachData.role)) {
            throw new HttpsError('permission-denied', 'Nur Coaches und Admins können Anfragen bearbeiten.');
        }

        const requestRef = db.collection('leaveClubRequests').doc(requestId);
        const requestDoc = await requestRef.get();

        if (!requestDoc.exists) {
            throw new HttpsError('not-found', 'Anfrage nicht gefunden.');
        }

        const requestData = requestDoc.data();

        if (coachData.clubId !== requestData.clubId) {
            throw new HttpsError('permission-denied', 'Du kannst nur Anfragen für deinen eigenen Verein bearbeiten.');
        }

        if (requestData.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'Diese Anfrage wurde bereits bearbeitet.');
        }

        const playerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(requestData.playerId);
        const playerDoc = await playerRef.get();

        if (!playerDoc.exists) {
            throw new HttpsError('not-found', 'Spieler nicht gefunden.');
        }

        const playerData = playerDoc.data();
        const now = admin.firestore.Timestamp.now();
        const batch = db.batch();

        if (action === 'approve') {
            batch.update(playerRef, {
                previousClubId: playerData.clubId,
                clubId: null,
                points: 0,
                subgroupIds: [],
            });

            batch.update(requestRef, {
                status: 'approved',
                processedBy: coachId,
                processedAt: now,
            });

            logger.info(`Leave request approved: ${requestId} by coach ${coachId}`);
        } else {
            batch.update(requestRef, {
                status: 'rejected',
                processedBy: coachId,
                processedAt: now,
            });

            logger.info(`Leave request rejected: ${requestId} by coach ${coachId}`);
        }

        await batch.commit();

        return {
            success: true,
            message: action === 'approve' ? 'Spieler hat den Verein verlassen.' : 'Austrittsanfrage abgelehnt.',
        };
    } catch (error) {
        logger.error(`Error handling leave request ${requestId}:`, error);

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'Ein unerwarteter Fehler ist aufgetreten.');
    }
});

exports.migrateClubsCollection = onCall({ region: CONFIG.REGION }, async request => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Du musst angemeldet sein.');
    }

    const callerRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(request.auth.uid);
    const callerDoc = await callerRef.get();

    if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
        throw new HttpsError('permission-denied', 'Nur Admins können diese Migration ausführen.');
    }

    try {
        logger.info('Starting clubs collection migration...');

        const usersSnapshot = await db
            .collection(CONFIG.COLLECTIONS.USERS)
            .where('clubId', '!=', null)
            .get();

        if (usersSnapshot.empty) {
            return {
                success: true,
                message: 'Keine Spieler mit Vereinszugehörigkeit gefunden.',
                clubsCreated: 0,
            };
        }

        const clubsMap = new Map();

        usersSnapshot.docs.forEach(doc => {
            const userData = doc.data();
            const clubId = userData.clubId;

            if (!clubId) return;

            if (!clubsMap.has(clubId)) {
                clubsMap.set(clubId, {
                    id: clubId,
                    name: clubId,
                    members: [],
                    coaches: [],
                    createdAt: admin.firestore.Timestamp.now(),
                    isTestClub: false,
                });
            }

            const club = clubsMap.get(clubId);
            club.members.push({
                userId: doc.id,
                firstName: userData.firstName,
                lastName: userData.lastName,
                role: userData.role,
            });

            if (userData.role === 'coach' || userData.role === 'admin') {
                club.coaches.push(doc.id);
            }
        });

        const batch = db.batch();
        let clubsCreated = 0;

        clubsMap.forEach((clubData, clubId) => {
            const clubRef = db.collection(CONFIG.COLLECTIONS.CLUBS).doc(clubId);

            const clubDocument = {
                name: clubData.name,
                createdAt: clubData.createdAt,
                isTestClub: clubData.isTestClub,
                memberCount: clubData.members.length,
                ownerId: clubData.coaches.length > 0 ? clubData.coaches[0] : null,
            };

            batch.set(clubRef, clubDocument);
            clubsCreated++;

            logger.info(
                `Creating club: ${clubId} with ${clubData.members.length} members, ${clubData.coaches.length} coaches`
            );
        });

        await batch.commit();

        logger.info(`Migration complete. Created ${clubsCreated} clubs.`);

        return {
            success: true,
            message: `Migration erfolgreich! ${clubsCreated} Vereine erstellt.`,
            clubsCreated: clubsCreated,
            clubs: Array.from(clubsMap.keys()),
        };
    } catch (error) {
        logger.error('Error during clubs migration:', error);

        if (error instanceof HttpsError) {
            throw error;
        }

        throw new HttpsError('internal', 'Fehler bei der Migration: ' + error.message);
    }
});

exports.autoCreateClubOnInvitation = onDocumentCreated(
    { document: 'invitationCodes/{codeId}', region: CONFIG.REGION },
    async event => {
        const codeData = event.data.data();
        const clubId = codeData.clubId;
        const createdBy = codeData.createdBy;

        if (!clubId) {
            logger.info('Invitation code created without clubId, skipping club creation');
            return;
        }

        if (!createdBy) {
            logger.info('Invitation code created without createdBy, skipping club creation');
            return;
        }

        try {
            const creatorRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(createdBy);
            const creatorDoc = await creatorRef.get();

            if (!creatorDoc.exists) {
                logger.info(`Creator ${createdBy} does not exist, skipping club creation`);
                return;
            }

            const creatorData = creatorDoc.data();
            if (creatorData.role !== 'admin') {
                logger.info(`Creator ${createdBy} is not an admin (role: ${creatorData.role}), skipping club creation`);
                return;
            }

            logger.info(`Admin ${createdBy} creating invitation for club ${clubId}`);

            const clubRef = db.collection(CONFIG.COLLECTIONS.CLUBS).doc(clubId);
            const clubDoc = await clubRef.get();

            if (clubDoc.exists) {
                logger.info(`Club ${clubId} already exists, no need to create`);
                return;
            }

            logger.info(`Creating new club: ${clubId}`);

            const coachQuery = await db
                .collection(CONFIG.COLLECTIONS.USERS)
                .where('clubId', '==', clubId)
                .where('role', 'in', ['coach', 'admin'])
                .limit(1)
                .get();

            let ownerId = null;
            if (!coachQuery.empty) {
                ownerId = coachQuery.docs[0].id;
            }

            const newClub = {
                name: clubId,
                createdAt: admin.firestore.Timestamp.now(),
                isTestClub: false,
                memberCount: 0,
                ownerId: ownerId,
            };

            await clubRef.set(newClub);
            logger.info(`Successfully created club: ${clubId} with owner: ${ownerId || 'none'}`);
        } catch (error) {
            logger.error(`Error auto-creating club ${clubId}:`, error);
        }
    }
);

exports.autoCreateClubOnToken = onDocumentCreated(
    { document: 'invitationTokens/{tokenId}', region: CONFIG.REGION },
    async event => {
        const tokenData = event.data.data();
        const clubId = tokenData.clubId;
        const createdBy = tokenData.createdBy;

        if (!clubId) {
            logger.info('Invitation token created without clubId, skipping club creation');
            return;
        }

        if (!createdBy) {
            logger.info('Invitation token created without createdBy, skipping club creation');
            return;
        }

        try {
            const creatorRef = db.collection(CONFIG.COLLECTIONS.USERS).doc(createdBy);
            const creatorDoc = await creatorRef.get();

            if (!creatorDoc.exists) {
                logger.info(`Creator ${createdBy} does not exist, skipping club creation`);
                return;
            }

            const creatorData = creatorDoc.data();
            if (creatorData.role !== 'admin') {
                logger.info(`Creator ${createdBy} is not an admin (role: ${creatorData.role}), skipping club creation`);
                return;
            }

            logger.info(`Admin ${createdBy} creating invitation token for club ${clubId}`);

            const clubRef = db.collection(CONFIG.COLLECTIONS.CLUBS).doc(clubId);
            const clubDoc = await clubRef.get();

            if (clubDoc.exists) {
                logger.info(`Club ${clubId} already exists, no need to create`);
                return;
            }

            logger.info(`Creating new club from token: ${clubId}`);

            const coachQuery = await db
                .collection(CONFIG.COLLECTIONS.USERS)
                .where('clubId', '==', clubId)
                .where('role', 'in', ['coach', 'admin'])
                .limit(1)
                .get();

            let ownerId = null;
            if (!coachQuery.empty) {
                ownerId = coachQuery.docs[0].id;
            }

            const newClub = {
                name: clubId,
                createdAt: admin.firestore.Timestamp.now(),
                isTestClub: false,
                memberCount: 0,
                ownerId: ownerId,
            };

            await clubRef.set(newClub);
            logger.info(`Successfully created club from token: ${clubId} with owner: ${ownerId || 'none'}`);
        } catch (error) {
            logger.error(`Error auto-creating club from token ${clubId}:`, error);
        }
    }
);
