

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    getDocsFromServer,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    serverTimestamp,
    writeBatch,
    increment,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

let db = null;


export function initializeTrainingSchedule(firestoreInstance) {
    db = firestoreInstance;
}


export async function createRecurringTemplate(templateData, userId = 'system') {
    const {
        dayOfWeek,
        startTime,
        endTime,
        subgroupId,
        clubId,
        startDate,
        endDate = null,
    } = templateData;

    if (dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
    }

    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        throw new Error('Time must be in HH:MM format');
    }

    if (startTime >= endTime) {
        throw new Error('Start time must be before end time');
    }

    const overlapping = await checkTemplateOverlap(
        dayOfWeek,
        startTime,
        endTime,
        subgroupId,
        clubId
    );
    if (overlapping) {
        throw new Error(
            'Ein wiederkehrendes Training mit überschneidenden Zeiten existiert bereits'
        );
    }

    const template = {
        dayOfWeek,
        startTime,
        endTime,
        subgroupId,
        clubId,
        active: true,
        startDate,
        endDate,
        createdAt: serverTimestamp(),
        createdBy: userId,
    };

    const docRef = await addDoc(collection(db, 'recurringTrainingTemplates'), template);
    return docRef.id;
}


export async function getRecurringTemplates(clubId) {
    const q = query(
        collection(db, 'recurringTrainingTemplates'),
        where('clubId', '==', clubId),
        where('active', '==', true),
        orderBy('dayOfWeek', 'asc'),
        orderBy('startTime', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    }));
}


export async function updateRecurringTemplate(templateId, updates) {
    const docRef = doc(db, 'recurringTrainingTemplates', templateId);
    await updateDoc(docRef, updates);
}


export async function deactivateRecurringTemplate(templateId) {
    await updateRecurringTemplate(templateId, { active: false });
}


export async function deleteRecurringTemplate(templateId) {
    const docRef = doc(db, 'recurringTrainingTemplates', templateId);
    await deleteDoc(docRef);
}


async function checkTemplateOverlap(
    dayOfWeek,
    startTime,
    endTime,
    subgroupId,
    clubId,
    excludeTemplateId = null
) {
    const templates = await getRecurringTemplates(clubId);

    for (const template of templates) {
        if (excludeTemplateId && template.id === excludeTemplateId) continue;
        if (template.dayOfWeek !== dayOfWeek) continue;
        if (template.subgroupId !== subgroupId) continue;

        if (timeRangesOverlap(startTime, endTime, template.startTime, template.endTime)) {
            return true;
        }
    }

    return false;
}


export async function createTrainingSession(sessionData, userId = 'system') {
    const {
        date,
        startTime,
        endTime,
        subgroupId,
        clubId,
        recurringTemplateId = null,
        plannedExercises = [],
    } = sessionData;

    if (!isValidDateFormat(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
    }

    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        throw new Error('Time must be in HH:MM format');
    }

    if (startTime >= endTime) {
        throw new Error('Start time must be before end time');
    }

    const overlapping = await checkSessionOverlap(date, startTime, endTime, subgroupId, clubId);
    if (overlapping) {
        throw new Error(
            'Eine Trainingsession mit überschneidenden Zeiten existiert bereits an diesem Tag'
        );
    }

    const session = {
        date,
        startTime,
        endTime,
        subgroupId,
        clubId,
        recurringTemplateId,
        cancelled: false,
        plannedExercises: plannedExercises || [],
        completed: false,
        completedAt: null,
        createdAt: serverTimestamp(),
        createdBy: userId,
    };

    const docRef = await addDoc(collection(db, 'trainingSessions'), session);
    return docRef.id;
}


export async function getTrainingSessions(clubId, startDate, endDate) {
    const q = query(
        collection(db, 'trainingSessions'),
        where('clubId', '==', clubId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        where('cancelled', '==', false),
        orderBy('date', 'asc'),
        orderBy('startTime', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    }));
}


export async function getSessionsForDate(clubId, date, forceServerFetch = false) {
    const q = query(
        collection(db, 'trainingSessions'),
        where('clubId', '==', clubId),
        where('date', '==', date),
        where('cancelled', '==', false),
        orderBy('startTime', 'asc')
    );

    const snapshot = forceServerFetch ? await getDocsFromServer(q) : await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
    }));
}


export async function getSession(sessionId) {
    const docRef = doc(db, 'trainingSessions', sessionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        throw new Error('Session not found');
    }

    return {
        id: docSnap.id,
        ...docSnap.data(),
    };
}


export async function updateTrainingSession(sessionId, updates) {
    const docRef = doc(db, 'trainingSessions', sessionId);
    await updateDoc(docRef, updates);
}


export async function cancelTrainingSession(sessionId) {
    console.log(
        `[Cancel Training] Cancelling session ${sessionId} and correcting player points...`
    );

    const attendanceQuery = query(
        collection(db, 'attendance'),
        where('sessionId', '==', sessionId)
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);

    for (const attendanceDoc of attendanceSnapshot.docs) {
        const attendanceData = attendanceDoc.data();
        const { presentPlayerIds, date, subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

        let subgroupName = subgroupId;
        try {
            const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
            if (subgroupDoc.exists()) {
                subgroupName = subgroupDoc.data().name;
            }
        } catch (error) {
            console.error(`[Cancel Training] Error loading subgroup ${subgroupId}:`, error);
        }

        const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

        console.log(
            `[Cancel Training] Correcting points for ${presentPlayerIds.length} players on ${date}`
        );

        const batch = writeBatch(db);

        for (const playerId of presentPlayerIds) {
            try {
                const pointsHistoryQuery = query(
                    collection(db, `users/${playerId}/pointsHistory`),
                    where('date', '==', date),
                    where('subgroupId', '==', subgroupId),
                    where('awardedBy', '==', 'System (Anwesenheit)')
                );

                const historySnapshot = await getDocs(pointsHistoryQuery);

                const historyEntry = historySnapshot.docs.find(doc => {
                    const data = doc.data();
                    return (
                        data.points > 0 &&
                        data.reason &&
                        !data.reason.includes('korrigiert') &&
                        !data.reason.includes('gelöscht')
                    );
                });

                if (historyEntry) {
                    const historyData = historyEntry.data();
                    const pointsToDeduct = historyData.points || 0;
                    const xpToDeduct = historyData.xp || 0;

                    console.log(
                        `[Cancel Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`
                    );

                    const playerRef = doc(db, 'users', playerId);
                    batch.update(playerRef, {
                        points: increment(-pointsToDeduct),
                        xp: increment(-xpToDeduct),
                    });

                    const correctionHistoryRef = doc(
                        collection(db, `users/${playerId}/pointsHistory`)
                    );
                    batch.set(correctionHistoryRef, {
                        points: -pointsToDeduct,
                        xp: -xpToDeduct,
                        eloChange: 0,
                        reason: `Training abgesagt am ${formattedDate} (${pointsToDeduct} Punkte zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training abgesagt)',
                    });

                    const correctionXpHistoryRef = doc(
                        collection(db, `users/${playerId}/xpHistory`)
                    );
                    batch.set(correctionXpHistoryRef, {
                        xp: -xpToDeduct,
                        reason: `Training abgesagt am ${formattedDate} (${xpToDeduct} XP zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training abgesagt)',
                    });

                    batch.delete(historyEntry.ref);
                } else {
                    console.warn(
                        `[Cancel Training] No points history found for player ${playerId} on ${date}`
                    );
                }
            } catch (error) {
                console.error(`[Cancel Training] Error processing player ${playerId}:`, error);
            }
        }

        await batch.commit();
    }

    const deletePromises = attendanceSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    await updateTrainingSession(sessionId, { cancelled: true });

    console.log(`[Cancel Training] Session ${sessionId} cancelled successfully`);
}


export async function deleteTrainingSession(sessionId) {
    console.log(`[Delete Training] Deleting session ${sessionId} and correcting player points...`);

    const attendanceQuery = query(
        collection(db, 'attendance'),
        where('sessionId', '==', sessionId)
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);

    for (const attendanceDoc of attendanceSnapshot.docs) {
        const attendanceData = attendanceDoc.data();
        const { presentPlayerIds, date, subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

        let subgroupName = subgroupId;
        try {
            const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
            if (subgroupDoc.exists()) {
                subgroupName = subgroupDoc.data().name;
            }
        } catch (error) {
            console.error(`[Delete Training] Error loading subgroup ${subgroupId}:`, error);
        }

        const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

        console.log(
            `[Delete Training] Correcting points for ${presentPlayerIds.length} players on ${date}`
        );

        const batch = writeBatch(db);

        for (const playerId of presentPlayerIds) {
            try {
                const pointsHistoryQuery = query(
                    collection(db, `users/${playerId}/pointsHistory`),
                    where('date', '==', date),
                    where('subgroupId', '==', subgroupId),
                    where('awardedBy', '==', 'System (Anwesenheit)')
                );

                const historySnapshot = await getDocs(pointsHistoryQuery);

                const historyEntry = historySnapshot.docs.find(doc => {
                    const data = doc.data();
                    return data.points > 0 && data.reason && !data.reason.includes('korrigiert');
                });

                if (historyEntry) {
                    const historyData = historyEntry.data();
                    const pointsToDeduct = historyData.points || 0;
                    const xpToDeduct = historyData.xp || 0;

                    console.log(
                        `[Delete Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`
                    );

                    const playerRef = doc(db, 'users', playerId);
                    batch.update(playerRef, {
                        points: increment(-pointsToDeduct),
                        xp: increment(-xpToDeduct),
                    });

                    const correctionHistoryRef = doc(
                        collection(db, `users/${playerId}/pointsHistory`)
                    );
                    batch.set(correctionHistoryRef, {
                        points: -pointsToDeduct,
                        xp: -xpToDeduct,
                        eloChange: 0,
                        reason: `Training gelöscht am ${formattedDate} (${pointsToDeduct} Punkte zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training gelöscht)',
                    });

                    const correctionXpHistoryRef = doc(
                        collection(db, `users/${playerId}/xpHistory`)
                    );
                    batch.set(correctionXpHistoryRef, {
                        xp: -xpToDeduct,
                        reason: `Training gelöscht am ${formattedDate} (${xpToDeduct} XP zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training gelöscht)',
                    });

                    batch.delete(historyEntry.ref);
                } else {
                    console.warn(
                        `[Delete Training] No points history found for player ${playerId} on ${date}`
                    );
                }
            } catch (error) {
                console.error(`[Delete Training] Error processing player ${playerId}:`, error);
            }
        }

        await batch.commit();
    }

    const deletePromises = attendanceSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    const docRef = doc(db, 'trainingSessions', sessionId);
    await deleteDoc(docRef);

    console.log(`[Delete Training] Session ${sessionId} deleted successfully`);
}


async function checkSessionOverlap(
    date,
    startTime,
    endTime,
    subgroupId,
    clubId,
    excludeSessionId = null
) {
    const sessions = await getSessionsForDate(clubId, date);

    for (const session of sessions) {
        if (excludeSessionId && session.id === excludeSessionId) continue;
        if (session.subgroupId !== subgroupId) continue;

        if (timeRangesOverlap(startTime, endTime, session.startTime, session.endTime)) {
            return true;
        }
    }

    return false;
}


export async function generateSessionsFromTemplates(clubId, startDate, endDate) {
    const templates = await getRecurringTemplates(clubId);
    let createdCount = 0;

    const dates = getDatesInRange(startDate, endDate);

    for (const date of dates) {
        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.getDay();

        const templatesForDay = templates.filter(t => {
            if (t.dayOfWeek !== dayOfWeek) return false;
            if (t.startDate && date < t.startDate) return false;
            if (t.endDate && date > t.endDate) return false;
            return true;
        });

        for (const template of templatesForDay) {
            const existingSession = await checkExistingSession(
                clubId,
                date,
                template.startTime,
                template.subgroupId
            );

            if (!existingSession) {
                await createTrainingSession({
                    date,
                    startTime: template.startTime,
                    endTime: template.endTime,
                    subgroupId: template.subgroupId,
                    clubId,
                    recurringTemplateId: template.id,
                });
                createdCount++;
            }
        }
    }

    return createdCount;
}


async function checkExistingSession(clubId, date, startTime, subgroupId) {
    const q = query(
        collection(db, 'trainingSessions'),
        where('clubId', '==', clubId),
        where('date', '==', date),
        where('startTime', '==', startTime),
        where('subgroupId', '==', subgroupId)
    );

    const snapshot = await getDocs(q);
    return !snapshot.empty;
}


function isValidTimeFormat(time) {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}


function isValidDateFormat(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}


function timeRangesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
}


function getDatesInRange(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    while (currentDate <= end) {
        dates.push(formatDate(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}


function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}


export function getDayOfWeekName(dayOfWeek) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return days[dayOfWeek];
}


export function formatTimeRange(startTime, endTime) {
    return `${startTime}-${endTime}`;
}
