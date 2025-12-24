/**
 * Training Schedule Management (Supabase Version)
 * Handles recurring training templates and training sessions
 */

// Supabase instance will be passed to functions
let supabaseClient = null;

/**
 * Initialize the module with Supabase instance
 * @param {Object} supabaseInstance - Supabase client instance
 */
export function initializeTrainingSchedule(supabaseInstance) {
    supabaseClient = supabaseInstance;
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
    const {
        dayOfWeek,
        startTime,
        endTime,
        subgroupId,
        clubId,
        startDate,
        endDate = null,
    } = templateData;

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
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        subgroup_id: subgroupId,
        club_id: clubId,
        active: true,
        start_date: startDate,
        end_date: endDate,
        created_at: new Date().toISOString(),
        created_by: userId,
    };

    const { data, error } = await supabaseClient
        .from('recurring_training_templates')
        .insert(template)
        .select('id')
        .single();

    if (error) throw error;

    return data.id;
}

/**
 * Get all recurring templates for a club
 * @param {string} clubId
 * @returns {Promise<Array>} Templates
 */
export async function getRecurringTemplates(clubId) {
    const { data, error } = await supabaseClient
        .from('recurring_training_templates')
        .select('*')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(template => ({
        id: template.id,
        dayOfWeek: template.day_of_week,
        startTime: template.start_time,
        endTime: template.end_time,
        subgroupId: template.subgroup_id,
        clubId: template.club_id,
        active: template.active,
        startDate: template.start_date,
        endDate: template.end_date,
        createdAt: template.created_at,
        createdBy: template.created_by
    }));
}

/**
 * Update a recurring template
 * @param {string} templateId
 * @param {Object} updates
 */
export async function updateRecurringTemplate(templateId, updates) {
    // Map camelCase to snake_case
    const mappedUpdates = {};
    if (updates.dayOfWeek !== undefined) mappedUpdates.day_of_week = updates.dayOfWeek;
    if (updates.startTime !== undefined) mappedUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) mappedUpdates.end_time = updates.endTime;
    if (updates.subgroupId !== undefined) mappedUpdates.subgroup_id = updates.subgroupId;
    if (updates.active !== undefined) mappedUpdates.active = updates.active;
    if (updates.startDate !== undefined) mappedUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) mappedUpdates.end_date = updates.endDate;

    const { error } = await supabaseClient
        .from('recurring_training_templates')
        .update(mappedUpdates)
        .eq('id', templateId);

    if (error) throw error;
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
    const { error } = await supabaseClient
        .from('recurring_training_templates')
        .delete()
        .eq('id', templateId);

    if (error) throw error;
}

/**
 * Check if template would overlap with existing ones
 * @private
 */
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
    const {
        date,
        startTime,
        endTime,
        subgroupId,
        clubId,
        recurringTemplateId = null,
        plannedExercises = [],
    } = sessionData;

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
        throw new Error(
            'Eine Trainingsession mit überschneidenden Zeiten existiert bereits an diesem Tag'
        );
    }

    const session = {
        date,
        start_time: startTime,
        end_time: endTime,
        subgroup_id: subgroupId,
        club_id: clubId,
        recurring_template_id: recurringTemplateId,
        cancelled: false,
        planned_exercises: plannedExercises || [],
        completed: false,
        completed_at: null,
        created_at: new Date().toISOString(),
        created_by: userId,
    };

    const { data, error } = await supabaseClient
        .from('training_sessions')
        .insert(session)
        .select('id')
        .single();

    if (error) throw error;

    return data.id;
}

/**
 * Maps session from Supabase to app format
 */
function mapSessionFromSupabase(session) {
    return {
        id: session.id,
        date: session.date,
        startTime: session.start_time,
        endTime: session.end_time,
        subgroupId: session.subgroup_id,
        clubId: session.club_id,
        recurringTemplateId: session.recurring_template_id,
        cancelled: session.cancelled,
        plannedExercises: session.planned_exercises || [],
        completed: session.completed,
        completedAt: session.completed_at,
        createdAt: session.created_at,
        createdBy: session.created_by
    };
}

/**
 * Get all sessions for a date range
 * @param {string} clubId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>} Sessions
 */
export async function getTrainingSessions(clubId, startDate, endDate) {
    const { data, error } = await supabaseClient
        .from('training_sessions')
        .select('*')
        .eq('club_id', clubId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('cancelled', false)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(s => mapSessionFromSupabase(s));
}

/**
 * Get all sessions for a specific date
 * @param {string} clubId
 * @param {string} date - YYYY-MM-DD
 * @param {boolean} forceServerFetch - Not needed for Supabase, kept for API compatibility
 * @returns {Promise<Array>} Sessions
 */
export async function getSessionsForDate(clubId, date, forceServerFetch = false) {
    const { data, error } = await supabaseClient
        .from('training_sessions')
        .select('*')
        .eq('club_id', clubId)
        .eq('date', date)
        .eq('cancelled', false)
        .order('start_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(s => mapSessionFromSupabase(s));
}

/**
 * Get a single session by ID
 * @param {string} sessionId
 * @returns {Promise<Object>} Session
 */
export async function getSession(sessionId) {
    const { data, error } = await supabaseClient
        .from('training_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (error) throw error;

    if (!data) {
        throw new Error('Session not found');
    }

    return mapSessionFromSupabase(data);
}

/**
 * Update a training session
 * @param {string} sessionId
 * @param {Object} updates
 */
export async function updateTrainingSession(sessionId, updates) {
    // Map camelCase to snake_case
    const mappedUpdates = {};
    if (updates.date !== undefined) mappedUpdates.date = updates.date;
    if (updates.startTime !== undefined) mappedUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) mappedUpdates.end_time = updates.endTime;
    if (updates.subgroupId !== undefined) mappedUpdates.subgroup_id = updates.subgroupId;
    if (updates.cancelled !== undefined) mappedUpdates.cancelled = updates.cancelled;
    if (updates.plannedExercises !== undefined) mappedUpdates.planned_exercises = updates.plannedExercises;
    if (updates.completed !== undefined) mappedUpdates.completed = updates.completed;
    if (updates.completedAt !== undefined) mappedUpdates.completed_at = updates.completedAt;

    const { error } = await supabaseClient
        .from('training_sessions')
        .update(mappedUpdates)
        .eq('id', sessionId);

    if (error) throw error;
}

/**
 * Cancel a training session (soft delete)
 * @param {string} sessionId
 */
export async function cancelTrainingSession(sessionId) {
    console.log(
        `[Cancel Training] Cancelling session ${sessionId} and correcting player points...`
    );

    // Find associated attendance records
    const { data: attendanceRecords, error: attendanceError } = await supabaseClient
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

    if (attendanceError) throw attendanceError;

    // For each attendance record, reverse the points awarded to players
    for (const attendanceData of attendanceRecords || []) {
        const { present_player_ids: presentPlayerIds, date, subgroup_id: subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

        // Get subgroup name for history entries
        let subgroupName = subgroupId;
        try {
            const { data: subgroupDoc } = await supabaseClient
                .from('subgroups')
                .select('name')
                .eq('id', subgroupId)
                .single();
            if (subgroupDoc) {
                subgroupName = subgroupDoc.name;
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

        // For each player who attended, find and reverse their points
        for (const playerId of presentPlayerIds) {
            try {
                // Find the original points awarded for this training
                const { data: historyEntries, error: historyError } = await supabaseClient
                    .from('points_history')
                    .select('*')
                    .eq('player_id', playerId)
                    .eq('date', date)
                    .eq('subgroup_id', subgroupId)
                    .eq('awarded_by', 'System (Anwesenheit)');

                if (historyError) throw historyError;

                // Find the specific history entry for this training
                const historyEntry = historyEntries?.find(entry => {
                    return (
                        entry.points > 0 &&
                        entry.reason &&
                        !entry.reason.includes('korrigiert') &&
                        !entry.reason.includes('gelöscht')
                    );
                });

                if (historyEntry) {
                    const pointsToDeduct = historyEntry.points || 0;
                    const xpToDeduct = historyEntry.xp || 0;

                    console.log(
                        `[Cancel Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`
                    );

                    // Get current player data
                    const { data: playerData } = await supabaseClient
                        .from('profiles')
                        .select('points, xp')
                        .eq('id', playerId)
                        .single();

                    // Deduct points and XP from player
                    await supabaseClient
                        .from('profiles')
                        .update({
                            points: (playerData?.points || 0) - pointsToDeduct,
                            xp: (playerData?.xp || 0) - xpToDeduct
                        })
                        .eq('id', playerId);

                    // Create negative entry in points history
                    await supabaseClient
                        .from('points_history')
                        .insert({
                            player_id: playerId,
                            points: -pointsToDeduct,
                            xp: -xpToDeduct,
                            elo_change: 0,
                            reason: `Training abgesagt am ${formattedDate} (${pointsToDeduct} Punkte zurückgegeben) - ${subgroupName}`,
                            date: date,
                            subgroup_id: subgroupId,
                            timestamp: new Date().toISOString(),
                            awarded_by: 'System (Training abgesagt)',
                        });

                    // Create negative entry in XP history
                    await supabaseClient
                        .from('xp_history')
                        .insert({
                            player_id: playerId,
                            xp: -xpToDeduct,
                            reason: `Training abgesagt am ${formattedDate} (${xpToDeduct} XP zurückgegeben) - ${subgroupName}`,
                            date: date,
                            subgroup_id: subgroupId,
                            timestamp: new Date().toISOString(),
                            awarded_by: 'System (Training abgesagt)',
                        });

                    // Delete the original history entry
                    await supabaseClient
                        .from('points_history')
                        .delete()
                        .eq('id', historyEntry.id);
                } else {
                    console.warn(
                        `[Cancel Training] No points history found for player ${playerId} on ${date}`
                    );
                }
            } catch (error) {
                console.error(`[Cancel Training] Error processing player ${playerId}:`, error);
            }
        }
    }

    // Delete all attendance records for this session
    await supabaseClient
        .from('attendance')
        .delete()
        .eq('session_id', sessionId);

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
    const { data: attendanceRecords, error: attendanceError } = await supabaseClient
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

    if (attendanceError) throw attendanceError;

    // For each attendance record, reverse the points awarded to players
    for (const attendanceData of attendanceRecords || []) {
        const { present_player_ids: presentPlayerIds, date, subgroup_id: subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

        // Get subgroup name for history entries
        let subgroupName = subgroupId;
        try {
            const { data: subgroupDoc } = await supabaseClient
                .from('subgroups')
                .select('name')
                .eq('id', subgroupId)
                .single();
            if (subgroupDoc) {
                subgroupName = subgroupDoc.name;
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

        // For each player who attended, find and reverse their points
        for (const playerId of presentPlayerIds) {
            try {
                // Find the original points awarded for this training
                const { data: historyEntries, error: historyError } = await supabaseClient
                    .from('points_history')
                    .select('*')
                    .eq('player_id', playerId)
                    .eq('date', date)
                    .eq('subgroup_id', subgroupId)
                    .eq('awarded_by', 'System (Anwesenheit)');

                if (historyError) throw historyError;

                // Find the specific history entry for this training
                const historyEntry = historyEntries?.find(entry => {
                    return entry.points > 0 && entry.reason && !entry.reason.includes('korrigiert');
                });

                if (historyEntry) {
                    const pointsToDeduct = historyEntry.points || 0;
                    const xpToDeduct = historyEntry.xp || 0;

                    console.log(
                        `[Delete Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`
                    );

                    // Get current player data
                    const { data: playerData } = await supabaseClient
                        .from('profiles')
                        .select('points, xp')
                        .eq('id', playerId)
                        .single();

                    // Deduct points and XP from player
                    await supabaseClient
                        .from('profiles')
                        .update({
                            points: (playerData?.points || 0) - pointsToDeduct,
                            xp: (playerData?.xp || 0) - xpToDeduct
                        })
                        .eq('id', playerId);

                    // Create negative entry in points history
                    await supabaseClient
                        .from('points_history')
                        .insert({
                            player_id: playerId,
                            points: -pointsToDeduct,
                            xp: -xpToDeduct,
                            elo_change: 0,
                            reason: `Training gelöscht am ${formattedDate} (${pointsToDeduct} Punkte zurückgegeben) - ${subgroupName}`,
                            date: date,
                            subgroup_id: subgroupId,
                            timestamp: new Date().toISOString(),
                            awarded_by: 'System (Training gelöscht)',
                        });

                    // Create negative entry in XP history
                    await supabaseClient
                        .from('xp_history')
                        .insert({
                            player_id: playerId,
                            xp: -xpToDeduct,
                            reason: `Training gelöscht am ${formattedDate} (${xpToDeduct} XP zurückgegeben) - ${subgroupName}`,
                            date: date,
                            subgroup_id: subgroupId,
                            timestamp: new Date().toISOString(),
                            awarded_by: 'System (Training gelöscht)',
                        });

                    // Delete the original history entry
                    await supabaseClient
                        .from('points_history')
                        .delete()
                        .eq('id', historyEntry.id);
                } else {
                    console.warn(
                        `[Delete Training] No points history found for player ${playerId} on ${date}`
                    );
                }
            } catch (error) {
                console.error(`[Delete Training] Error processing player ${playerId}:`, error);
            }
        }
    }

    // Delete all attendance records
    await supabaseClient
        .from('attendance')
        .delete()
        .eq('session_id', sessionId);

    // Delete the session
    const { error } = await supabaseClient
        .from('training_sessions')
        .delete()
        .eq('id', sessionId);

    if (error) throw error;

    console.log(`[Delete Training] Session ${sessionId} deleted successfully`);
}

/**
 * Check if session would overlap with existing ones
 * @private
 */
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
                    recurringTemplateId: template.id,
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
    const { data, error } = await supabaseClient
        .from('training_sessions')
        .select('id')
        .eq('club_id', clubId)
        .eq('date', date)
        .eq('start_time', startTime)
        .eq('subgroup_id', subgroupId)
        .limit(1);

    if (error) throw error;

    return data && data.length > 0;
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
