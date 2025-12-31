// Trainingsplan-Modul (Supabase-Version)

import { getSupabase } from './supabase-init.js';

/**
 * Trainingsplan-Modul für wiederkehrende Trainingsvorlagen und Trainingssessions
 */

const supabase = getSupabase();

// ============================================================================
// WIEDERKEHRENDE TRAININGSVORLAGEN
// ============================================================================

/**
 * Erstellt eine wiederkehrende Trainingsvorlage
 * @param {Object} templateData - Vorlagenkonfiguration
 * @param {string} userId - Benutzer-ID
 * @returns {Promise<string>} Vorlagen-ID
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
 * Lädt alle wiederkehrenden Vorlagen eines Vereins
 * @param {string} clubId - Vereins-ID
 * @returns {Promise<Array>} Vorlagen
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
 * Aktualisiert eine wiederkehrende Vorlage
 * @param {string} templateId - Vorlagen-ID
 * @param {Object} updates - Zu aktualisierende Felder
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
 * Deaktiviert eine Vorlage (Soft Delete - Daten bleiben erhalten)
 * @param {string} templateId - Vorlagen-ID
 */
export async function deactivateRecurringTemplate(templateId) {
    await updateRecurringTemplate(templateId, { active: false });
}

/**
 * Löscht eine Vorlage unwiderruflich (Hard Delete)
 * @param {string} templateId - Vorlagen-ID
 */
export async function deleteRecurringTemplate(templateId) {
    const { error } = await supabase
        .from('recurring_training_templates')
        .delete()
        .eq('id', templateId);

    if (error) throw error;
}

/**
 * Prüft auf Überschneidungen mit existierenden Vorlagen
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

        if (timeRangesOverlap(startTime, endTime, template.startTime, template.endTime)) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// TRAININGSSESSIONS
// ============================================================================

/**
 * Erstellt eine Trainingssession
 * @param {Object} sessionData - Session-Konfiguration
 * @param {string} userId - Benutzer-ID
 * @returns {Promise<string>} Session-ID
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
 * Lädt alle Sessions in einem Datumsbereich
 * @param {string} clubId - Vereins-ID
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
 * Lädt alle Sessions für ein bestimmtes Datum
 * @param {string} clubId - Vereins-ID
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
 * Lädt eine einzelne Session anhand der ID
 * @param {string} sessionId - Session-ID
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
 * Aktualisiert eine Trainingssession
 * @param {string} sessionId - Session-ID
 * @param {Object} updates - Zu aktualisierende Felder
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
 * Storniert eine Session (Soft Delete) und macht vergebene Punkte rückgängig
 * @param {string} sessionId - Session-ID
 */
export async function cancelTrainingSession(sessionId) {
    console.log(`[Cancel Training] Cancelling session ${sessionId} and correcting player points...`);

    const { data: attendanceRecords, error: attendanceError } = await supabase
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

    if (attendanceError) throw attendanceError;

    for (const attendanceData of attendanceRecords || []) {
        const { present_player_ids, date, subgroup_id } = attendanceData;

        if (!present_player_ids || present_player_ids.length === 0) continue;

        // Subgroup-Namen für History-Einträge laden
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

        for (const playerId of present_player_ids) {
            try {
                const { data: historyEntries } = await supabase
                    .from('points_history')
                    .select('*')
                    .eq('user_id', playerId)
                    .eq('date', date)
                    .eq('subgroup_id', subgroup_id)
                    .eq('awarded_by', 'System (Anwesenheit)');

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

                    await supabase.rpc('deduct_player_points', {
                        p_user_id: playerId,
                        p_points: pointsToDeduct,
                        p_xp: xpToDeduct
                    });

                    await supabase.from('points_history').insert({
                        user_id: playerId,
                        points: -pointsToDeduct,
                        xp: -xpToDeduct,
                        elo_change: 0,
                        reason: `Training abgesagt am ${formattedDate} (${pointsToDeduct} Punkte zurueckgegeben) - ${subgroupName}`,
                        timestamp: new Date().toISOString(),
                        awarded_by: 'System (Training abgesagt)',
                    });

                    await supabase.from('xp_history').insert({
                        player_id: playerId,
                        xp: -xpToDeduct,
                        reason: `Training abgesagt am ${formattedDate} (${xpToDeduct} XP zurueckgegeben) - ${subgroupName}`,
                        timestamp: new Date().toISOString(),
                        awarded_by: 'System (Training abgesagt)',
                    });

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

    await supabase
        .from('attendance')
        .delete()
        .eq('session_id', sessionId);

    await updateTrainingSession(sessionId, { cancelled: true });

    console.log(`[Cancel Training] Session ${sessionId} cancelled successfully`);
}

/**
 * Löscht eine Session unwiderruflich (Hard Delete)
 * @param {string} sessionId - Session-ID
 */
export async function deleteTrainingSession(sessionId) {
    console.log(`[Delete Training] Deleting session ${sessionId}...`);

    // Zuerst Punkte zurücksetzen
    await cancelTrainingSession(sessionId);

    const { error } = await supabase
        .from('training_sessions')
        .delete()
        .eq('id', sessionId);

    if (error) throw error;

    console.log(`[Delete Training] Session ${sessionId} deleted successfully`);
}

/**
 * Prüft auf Überschneidungen mit existierenden Sessions
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

        if (timeRangesOverlap(startTime, endTime, session.startTime, session.endTime)) {
            return true;
        }
    }

    return false;
}

// ============================================================================
// AUTO-GENERIERUNG VON SESSIONS AUS VORLAGEN
// ============================================================================

/**
 * Generiert Sessions aus wiederkehrenden Vorlagen
 * @param {string} clubId - Vereins-ID
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<number>} Anzahl erstellter Sessions
 */
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

/**
 * Prüft ob eine Session bereits existiert
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
// HILFSFUNKTIONEN
// ============================================================================

/**
 * Konvertiert Supabase-Session zu camelCase-Objekt
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
 * Prüft Zeitformat (HH:MM)
 */
function isValidTimeFormat(time) {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

/**
 * Prüft Datumsformat (YYYY-MM-DD)
 */
function isValidDateFormat(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Prüft ob sich zwei Zeitbereiche überschneiden
 */
function timeRangesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
}

/**
 * Liefert alle Daten in einem Bereich
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array<string>} Daten im YYYY-MM-DD Format
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
 * Formatiert Datum zu YYYY-MM-DD
 */
function formatDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Liefert deutschen Wochentagsnamen
 * @param {number} dayOfWeek - 0=Sonntag, 6=Samstag
 * @returns {string}
 */
export function getDayOfWeekName(dayOfWeek) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return days[dayOfWeek];
}

/**
 * Formatiert Zeitbereich für Anzeige
 * @param {string} startTime - HH:MM
 * @param {string} endTime - HH:MM
 * @returns {string} "16:00-17:00"
 */
export function formatTimeRange(startTime, endTime) {
    return `${startTime}-${endTime}`;
}

/**
 * Abonniert Echtzeit-Änderungen von Trainingssessions
 * @param {string} clubId - Vereins-ID
 * @param {Function} callback - Callback bei Änderungen
 * @returns {Function} Unsubscribe-Funktion
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
