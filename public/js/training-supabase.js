// Training Schedule Module - Supabase Version
// SC Champions - Migration von Firebase zu Supabase

import { getSupabase } from './supabase-init.js';

/**
 * Training Schedule Module - Supabase Version
 * Handles recurring training templates and training sessions
 */

const supabase = getSupabase();

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
            'Ein wiederkehrendes Training mit ueberschneidenden Zeiten existiert bereits'
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

    const { data, error } = await supabase
        .from('recurring_training_templates')
        .insert(template)
        .select()
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
    const { data, error } = await supabase
        .from('recurring_training_templates')
        .select('*')
        .eq('club_id', clubId)
        .eq('active', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(t => ({
        id: t.id,
        dayOfWeek: t.day_of_week,
        startTime: t.start_time,
        endTime: t.end_time,
        subgroupId: t.subgroup_id,
        clubId: t.club_id,
        active: t.active,
        startDate: t.start_date,
        endDate: t.end_date,
        createdAt: t.created_at,
        createdBy: t.created_by
    }));
}

/**
 * Update a recurring template
 * @param {string} templateId
 * @param {Object} updates
 */
export async function updateRecurringTemplate(templateId, updates) {
    const snakeUpdates = {};
    if (updates.dayOfWeek !== undefined) snakeUpdates.day_of_week = updates.dayOfWeek;
    if (updates.startTime !== undefined) snakeUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) snakeUpdates.end_time = updates.endTime;
    if (updates.subgroupId !== undefined) snakeUpdates.subgroup_id = updates.subgroupId;
    if (updates.active !== undefined) snakeUpdates.active = updates.active;
    if (updates.startDate !== undefined) snakeUpdates.start_date = updates.startDate;
    if (updates.endDate !== undefined) snakeUpdates.end_date = updates.endDate;

    const { error } = await supabase
        .from('recurring_training_templates')
        .update(snakeUpdates)
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
    const { error } = await supabase
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
            'Eine Trainingsession mit ueberschneidenden Zeiten existiert bereits an diesem Tag'
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

    const { data, error } = await supabase
        .from('training_sessions')
        .insert(session)
        .select()
        .single();

    if (error) throw error;
    return data.id;
}

/**
 * Get all sessions for a date range
 * @param {string} clubId
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>} Sessions
 */
export async function getTrainingSessions(clubId, startDate, endDate) {
    const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('club_id', clubId)
        .gte('date', startDate)
        .lte('date', endDate)
        .eq('cancelled', false)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(mapSessionToJS);
}

/**
 * Get all sessions for a specific date
 * @param {string} clubId
 * @param {string} date - YYYY-MM-DD
 * @returns {Promise<Array>} Sessions
 */
export async function getSessionsForDate(clubId, date) {
    const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('club_id', clubId)
        .eq('date', date)
        .eq('cancelled', false)
        .order('start_time', { ascending: true });

    if (error) throw error;

    return (data || []).map(mapSessionToJS);
}

/**
 * Get a single session by ID
 * @param {string} sessionId
 * @returns {Promise<Object>} Session
 */
export async function getSession(sessionId) {
    const { data, error } = await supabase
        .from('training_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            throw new Error('Session not found');
        }
        throw error;
    }

    return mapSessionToJS(data);
}

/**
 * Update a training session
 * @param {string} sessionId
 * @param {Object} updates
 */
export async function updateTrainingSession(sessionId, updates) {
    const snakeUpdates = {};
    if (updates.date !== undefined) snakeUpdates.date = updates.date;
    if (updates.startTime !== undefined) snakeUpdates.start_time = updates.startTime;
    if (updates.endTime !== undefined) snakeUpdates.end_time = updates.endTime;
    if (updates.subgroupId !== undefined) snakeUpdates.subgroup_id = updates.subgroupId;
    if (updates.cancelled !== undefined) snakeUpdates.cancelled = updates.cancelled;
    if (updates.plannedExercises !== undefined) snakeUpdates.planned_exercises = updates.plannedExercises;
    if (updates.completed !== undefined) snakeUpdates.completed = updates.completed;
    if (updates.completedAt !== undefined) snakeUpdates.completed_at = updates.completedAt;

    const { error } = await supabase
        .from('training_sessions')
        .update(snakeUpdates)
        .eq('id', sessionId);

    if (error) throw error;
}

/**
 * Cancel a training session (soft delete)
 * Also reverses points awarded to players
 * @param {string} sessionId
 */
export async function cancelTrainingSession(sessionId) {
    console.log(`[Cancel Training] Cancelling session ${sessionId} and correcting player points...`);

    // Find associated attendance records
    const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

    if (attendanceError) throw attendanceError;

    // For each attendance record, reverse the points awarded to players
    for (const attendanceData of attendanceRecords || []) {
        const { present_player_ids, date, subgroup_id } = attendanceData;

        if (!present_player_ids || present_player_ids.length === 0) continue;

        // Get subgroup name for history entries
        let subgroupName = subgroup_id;
        try {
            const { data: subgroup } = await supabase
                .from('subgroups')
                .select('name')
                .eq('id', subgroup_id)
                .single();

            if (subgroup) {
                subgroupName = subgroup.name;
            }
        } catch (error) {
            console.error(`[Cancel Training] Error loading subgroup ${subgroup_id}:`, error);
        }

        const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

        console.log(
            `[Cancel Training] Correcting points for ${present_player_ids.length} players on ${date}`
        );

        // For each player who attended, find and reverse their points
        for (const playerId of present_player_ids) {
            try {
                // Find the original points awarded for this training
                const { data: historyEntries } = await supabase
                    .from('points_history')
                    .select('*')
                    .eq('user_id', playerId)
                    .eq('date', date)
                    .eq('subgroup_id', subgroup_id)
                    .eq('awarded_by', 'System (Anwesenheit)');

                // Find the specific history entry for this training
                const historyEntry = (historyEntries || []).find(entry => {
                    return (
                        entry.points > 0 &&
                        entry.reason &&
                        !entry.reason.includes('korrigiert') &&
                        !entry.reason.includes('geloescht')
                    );
                });

                if (historyEntry) {
                    const pointsToDeduct = historyEntry.points || 0;
                    const xpToDeduct = historyEntry.xp || 0;

                    console.log(
                        `[Cancel Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`
                    );

                    // Deduct points and XP from player
                    await supabase.rpc('deduct_player_points', {
                        p_user_id: playerId,
                        p_points: pointsToDeduct,
                        p_xp: xpToDeduct
                    });

                    // Create negative entry in points history
                    await supabase.from('points_history').insert({
                        user_id: playerId,
                        points: -pointsToDeduct,
                        xp: -xpToDeduct,
                        elo_change: 0,
                        reason: `Training abgesagt am ${formattedDate} (${pointsToDeduct} Punkte zurueckgegeben) - ${subgroupName}`,
                        timestamp: new Date().toISOString(),
                        awarded_by: 'System (Training abgesagt)',
                    });

                    // Create negative entry in XP history
                    await supabase.from('xp_history').insert({
                        player_id: playerId,
                        xp: -xpToDeduct,
                        reason: `Training abgesagt am ${formattedDate} (${xpToDeduct} XP zurueckgegeben) - ${subgroupName}`,
                        timestamp: new Date().toISOString(),
                        awarded_by: 'System (Training abgesagt)',
                    });

                    // Delete the original history entry
                    await supabase
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
    await supabase
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
    console.log(`[Delete Training] Deleting session ${sessionId}...`);

    // First cancel and reverse points
    await cancelTrainingSession(sessionId);

    // Then delete the session
    const { error } = await supabase
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
    const { data, error } = await supabase
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
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map Supabase session to JS object with camelCase
 */
function mapSessionToJS(s) {
    return {
        id: s.id,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        subgroupId: s.subgroup_id,
        clubId: s.club_id,
        recurringTemplateId: s.recurring_template_id,
        cancelled: s.cancelled,
        plannedExercises: s.planned_exercises || [],
        completed: s.completed,
        completedAt: s.completed_at,
        createdAt: s.created_at,
        createdBy: s.created_by
    };
}

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
        dates.push(formatDateToISO(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

/**
 * Format date to YYYY-MM-DD
 */
function formatDateToISO(date) {
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

/**
 * Subscribe to training session changes (real-time)
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback to run on changes
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTrainingSessions(clubId, callback) {
    const channel = supabase
        .channel(`training_sessions_${clubId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'training_sessions',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                callback();
            }
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}
