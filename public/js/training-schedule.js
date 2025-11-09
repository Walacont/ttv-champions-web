/**
 * Training Schedule Management
 * Handles recurring training templates and training sessions
 */

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    Timestamp,
    serverTimestamp,
    writeBatch,
    increment
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

// DB instance will be passed to functions instead of module-level initialization
let db = null;

/**
 * Initialize the module with Firestore instance
 * @param {Object} firestoreInstance - Firestore database instance
 */
export function initializeTrainingSchedule(firestoreInstance) {
    db = firestoreInstance;
}

// ============================================================================
// RECURRING TRAINING TEMPLATES
// ============================================================================

/**
 * Create a recurring training template
 * @param {Object} templateData - Template configuration
 * @param {string} userId - ID of user creating the template
 * @returns {Promise<string>} Template ID
 */
export async function createRecurringTemplate(templateData, userId = 'system') {
    const { dayOfWeek, startTime, endTime, subgroupId, clubId, startDate, endDate = null } = templateData;

    // Validation
    if (dayOfWeek < 0 || dayOfWeek > 6) {
        throw new Error('dayOfWeek must be between 0 (Sunday) and 6 (Saturday)');
    }

    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        throw new Error('Time must be in HH:MM format');
    }

    if (startTime >= endTime) {
        throw new Error('Start time must be before end time');
    }

    // Check for overlapping templates
    const overlapping = await checkTemplateOverlap(dayOfWeek, startTime, endTime, subgroupId, clubId);
    if (overlapping) {
        throw new Error('Ein wiederkehrendes Training mit überschneidenden Zeiten existiert bereits');
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
        createdBy: userId
    };

    const docRef = await addDoc(collection(db, 'recurringTrainingTemplates'), template);
    return docRef.id;
}

/**
 * Get all recurring templates for a club
 * @param {string} clubId
 * @returns {Promise<Array>} Templates
 */
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
        ...doc.data()
    }));
}

/**
 * Update a recurring template
 * @param {string} templateId
 * @param {Object} updates
 */
export async function updateRecurringTemplate(templateId, updates) {
    const docRef = doc(db, 'recurringTrainingTemplates', templateId);
    await updateDoc(docRef, updates);
}

/**
 * Deactivate a recurring template (soft delete)
 * @param {string} templateId
 */
export async function deactivateRecurringTemplate(templateId) {
    await updateRecurringTemplate(templateId, { active: false });
}

/**
 * Delete a recurring template (hard delete)
 * @param {string} templateId
 */
export async function deleteRecurringTemplate(templateId) {
    const docRef = doc(db, 'recurringTrainingTemplates', templateId);
    await deleteDoc(docRef);
}

/**
 * Check if template would overlap with existing ones
 * @private
 */
async function checkTemplateOverlap(dayOfWeek, startTime, endTime, subgroupId, clubId, excludeTemplateId = null) {
    const templates = await getRecurringTemplates(clubId);

    for (const template of templates) {
        if (excludeTemplateId && template.id === excludeTemplateId) continue;
        if (template.dayOfWeek !== dayOfWeek) continue;
        if (template.subgroupId !== subgroupId) continue;

        // Check time overlap
        if (timeRangesOverlap(startTime, endTime, template.startTime, template.endTime)) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// TRAINING SESSIONS
// ============================================================================

/**
 * Create a training session
 * @param {Object} sessionData - Session configuration
 * @param {string} userId - ID of user creating the session
 * @returns {Promise<string>} Session ID
 */
export async function createTrainingSession(sessionData, userId = 'system') {
    const { date, startTime, endTime, subgroupId, clubId, recurringTemplateId = null } = sessionData;

    // Validation
    if (!isValidDateFormat(date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
    }

    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
        throw new Error('Time must be in HH:MM format');
    }

    if (startTime >= endTime) {
        throw new Error('Start time must be before end time');
    }

    // Check for overlapping sessions on same date
    const overlapping = await checkSessionOverlap(date, startTime, endTime, subgroupId, clubId);
    if (overlapping) {
        throw new Error('Eine Trainingsession mit überschneidenden Zeiten existiert bereits an diesem Tag');
    }

    const session = {
        date,
        startTime,
        endTime,
        subgroupId,
        clubId,
        recurringTemplateId,
        cancelled: false,
        createdAt: serverTimestamp(),
        createdBy: userId
    };

    const docRef = await addDoc(collection(db, 'trainingSessions'), session);
    return docRef.id;
}

/**
 * Get all sessions for a date range
 * @param {string} clubId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>} Sessions
 */
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
        ...doc.data()
    }));
}

/**
 * Get all sessions for a specific date
 * @param {string} clubId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Array>} Sessions
 */
export async function getSessionsForDate(clubId, date) {
    const q = query(
        collection(db, 'trainingSessions'),
        where('clubId', '==', clubId),
        where('date', '==', date),
        where('cancelled', '==', false),
        orderBy('startTime', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
}

/**
 * Get a single session by ID
 * @param {string} sessionId
 * @returns {Promise<Object>} Session
 */
export async function getSession(sessionId) {
    const docRef = doc(db, 'trainingSessions', sessionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        throw new Error('Session not found');
    }

    return {
        id: docSnap.id,
        ...docSnap.data()
    };
}

/**
 * Update a training session
 * @param {string} sessionId
 * @param {Object} updates
 */
export async function updateTrainingSession(sessionId, updates) {
    const docRef = doc(db, 'trainingSessions', sessionId);
    await updateDoc(docRef, updates);
}

/**
 * Cancel a training session (soft delete)
 * @param {string} sessionId
 */
export async function cancelTrainingSession(sessionId) {
    console.log(`[Cancel Training] Cancelling session ${sessionId} and correcting player points...`);

    // Find associated attendance records
    const attendanceQuery = query(
        collection(db, 'attendance'),
        where('sessionId', '==', sessionId)
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);

    // For each attendance record, reverse the points awarded to players
    for (const attendanceDoc of attendanceSnapshot.docs) {
        const attendanceData = attendanceDoc.data();
        const { presentPlayerIds, date, subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

        // Get subgroup name for history entries
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
            year: 'numeric'
        });

        console.log(`[Cancel Training] Correcting points for ${presentPlayerIds.length} players on ${date}`);

        // Use a batch for atomic updates
        const batch = writeBatch(db);

        // For each player who attended, find and reverse their points
        for (const playerId of presentPlayerIds) {
            try {
                // Find the original points awarded for this training
                const pointsHistoryQuery = query(
                    collection(db, `users/${playerId}/pointsHistory`),
                    where('date', '==', date),
                    where('subgroupId', '==', subgroupId),
                    where('awardedBy', '==', 'System (Anwesenheit)')
                );

                const historySnapshot = await getDocs(pointsHistoryQuery);

                // Find the specific history entry for this training
                const historyEntry = historySnapshot.docs.find(doc => {
                    const data = doc.data();
                    // Match by date and subgroup, and it should be a positive entry (not a correction)
                    return data.points > 0 && data.reason && !data.reason.includes('korrigiert') && !data.reason.includes('gelöscht');
                });

                if (historyEntry) {
                    const historyData = historyEntry.data();
                    const pointsToDeduct = historyData.points || 0;
                    const xpToDeduct = historyData.xp || 0;

                    console.log(`[Cancel Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`);

                    // Deduct points and XP from player
                    const playerRef = doc(db, 'users', playerId);
                    batch.update(playerRef, {
                        points: increment(-pointsToDeduct),
                        xp: increment(-xpToDeduct)
                    });

                    // Create negative entry in points history
                    const correctionHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
                    batch.set(correctionHistoryRef, {
                        points: -pointsToDeduct,
                        xp: -xpToDeduct,
                        eloChange: 0,
                        reason: `Training abgesagt am ${formattedDate} (${pointsToDeduct} Punkte zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training abgesagt)'
                    });

                    // Create negative entry in XP history
                    const correctionXpHistoryRef = doc(collection(db, `users/${playerId}/xpHistory`));
                    batch.set(correctionXpHistoryRef, {
                        xp: -xpToDeduct,
                        reason: `Training abgesagt am ${formattedDate} (${xpToDeduct} XP zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training abgesagt)'
                    });

                    // Delete the original history entry
                    batch.delete(historyEntry.ref);
                } else {
                    console.warn(`[Cancel Training] No points history found for player ${playerId} on ${date}`);
                }
            } catch (error) {
                console.error(`[Cancel Training] Error processing player ${playerId}:`, error);
            }
        }

        // Commit all player updates
        await batch.commit();
    }

    // Delete all attendance records for this session
    const deletePromises = attendanceSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    // Mark the session as cancelled
    await updateTrainingSession(sessionId, { cancelled: true });

    console.log(`[Cancel Training] Session ${sessionId} cancelled successfully`);
}

/**
 * Delete a training session (hard delete)
 * @param {string} sessionId
 */
export async function deleteTrainingSession(sessionId) {
    console.log(`[Delete Training] Deleting session ${sessionId} and correcting player points...`);

    // Find associated attendance records
    const attendanceQuery = query(
        collection(db, 'attendance'),
        where('sessionId', '==', sessionId)
    );
    const attendanceSnapshot = await getDocs(attendanceQuery);

    // For each attendance record, reverse the points awarded to players
    for (const attendanceDoc of attendanceSnapshot.docs) {
        const attendanceData = attendanceDoc.data();
        const { presentPlayerIds, date, subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

        // Get subgroup name for history entries
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
            year: 'numeric'
        });

        console.log(`[Delete Training] Correcting points for ${presentPlayerIds.length} players on ${date}`);

        // Use a batch for atomic updates
        const batch = writeBatch(db);

        // For each player who attended, find and reverse their points
        for (const playerId of presentPlayerIds) {
            try {
                // Find the original points awarded for this training
                const pointsHistoryQuery = query(
                    collection(db, `users/${playerId}/pointsHistory`),
                    where('date', '==', date),
                    where('subgroupId', '==', subgroupId),
                    where('awardedBy', '==', 'System (Anwesenheit)')
                );

                const historySnapshot = await getDocs(pointsHistoryQuery);

                // Find the specific history entry for this training
                // There might be multiple entries if player attended multiple trainings
                const historyEntry = historySnapshot.docs.find(doc => {
                    const data = doc.data();
                    // Match by date and subgroup, and it should be a positive entry (not a correction)
                    return data.points > 0 && data.reason && !data.reason.includes('korrigiert');
                });

                if (historyEntry) {
                    const historyData = historyEntry.data();
                    const pointsToDeduct = historyData.points || 0;
                    const xpToDeduct = historyData.xp || 0;

                    console.log(`[Delete Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`);

                    // Deduct points and XP from player
                    const playerRef = doc(db, 'users', playerId);
                    batch.update(playerRef, {
                        points: increment(-pointsToDeduct),
                        xp: increment(-xpToDeduct)
                    });

                    // Create negative entry in points history
                    const correctionHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
                    batch.set(correctionHistoryRef, {
                        points: -pointsToDeduct,
                        xp: -xpToDeduct,
                        eloChange: 0,
                        reason: `Training gelöscht am ${formattedDate} (${pointsToDeduct} Punkte zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training gelöscht)'
                    });

                    // Create negative entry in XP history
                    const correctionXpHistoryRef = doc(collection(db, `users/${playerId}/xpHistory`));
                    batch.set(correctionXpHistoryRef, {
                        xp: -xpToDeduct,
                        reason: `Training gelöscht am ${formattedDate} (${xpToDeduct} XP zurückgegeben) - ${subgroupName}`,
                        date: date,
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Training gelöscht)'
                    });

                    // Delete the original history entry
                    batch.delete(historyEntry.ref);
                } else {
                    console.warn(`[Delete Training] No points history found for player ${playerId} on ${date}`);
                }
            } catch (error) {
                console.error(`[Delete Training] Error processing player ${playerId}:`, error);
            }
        }

        // Commit all player updates
        await batch.commit();
    }

    // Delete all attendance records
    const deletePromises = attendanceSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    // Delete the session
    const docRef = doc(db, 'trainingSessions', sessionId);
    await deleteDoc(docRef);

    console.log(`[Delete Training] Session ${sessionId} deleted successfully`);
}

/**
 * Check if session would overlap with existing ones
 * @private
 */
async function checkSessionOverlap(date, startTime, endTime, subgroupId, clubId, excludeSessionId = null) {
    const sessions = await getSessionsForDate(clubId, date);

    for (const session of sessions) {
        if (excludeSessionId && session.id === excludeSessionId) continue;
        if (session.subgroupId !== subgroupId) continue;

        // Check time overlap
        if (timeRangesOverlap(startTime, endTime, session.startTime, session.endTime)) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// AUTO-GENERATION OF SESSIONS FROM TEMPLATES
// ============================================================================

/**
 * Generate training sessions from recurring templates
 * @param {string} clubId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<number>} Number of sessions created
 */
export async function generateSessionsFromTemplates(clubId, startDate, endDate) {
    const templates = await getRecurringTemplates(clubId);
    let createdCount = 0;

    // Get all dates in range
    const dates = getDatesInRange(startDate, endDate);

    for (const date of dates) {
        const dateObj = new Date(date + 'T00:00:00');
        const dayOfWeek = dateObj.getDay();

        // Find templates for this day of week
        const templatesForDay = templates.filter(t => {
            if (t.dayOfWeek !== dayOfWeek) return false;
            if (t.startDate && date < t.startDate) return false;
            if (t.endDate && date > t.endDate) return false;
            return true;
        });

        // Create sessions from templates
        for (const template of templatesForDay) {
            // Check if session already exists
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
                    recurringTemplateId: template.id
                });
                createdCount++;
            }
        }
    }

    return createdCount;
}

/**
 * Check if a session already exists
 * @private
 */
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if time format is valid (HH:MM)
 */
function isValidTimeFormat(time) {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

/**
 * Check if date format is valid (YYYY-MM-DD)
 */
function isValidDateFormat(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Check if two time ranges overlap
 */
function timeRangesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
}

/**
 * Get all dates in a range
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array<string>} Array of dates in YYYY-MM-DD format
 */
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

/**
 * Format date to YYYY-MM-DD
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get day of week name in German
 * @param {number} dayOfWeek - 0=Sunday, 6=Saturday
 * @returns {string}
 */
export function getDayOfWeekName(dayOfWeek) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return days[dayOfWeek];
}

/**
 * Format time range for display
 * @param {string} startTime - HH:MM
 * @param {string} endTime - HH:MM
 * @returns {string} "16:00-17:00"
 */
export function formatTimeRange(startTime, endTime) {
    return `${startTime}-${endTime}`;
}
