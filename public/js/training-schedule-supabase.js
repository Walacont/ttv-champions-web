/** Trainingsplanung (Supabase-Version) - Wiederkehrende Vorlagen und Sessions */

let supabaseClient = null;

/** Initialisiert das Modul mit Supabase-Instanz */
export function initializeTrainingSchedule(supabaseInstance) {
    supabaseClient = supabaseInstance;
}

// ============================================================================
// WIEDERKEHRENDE TRAININGSVORLAGEN
// ============================================================================

/** Erstellt eine wiederkehrende Trainingsvorlage */
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

/** Holt alle wiederkehrenden Vorlagen für einen Verein */
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

/** Aktualisiert eine wiederkehrende Vorlage */
export async function updateRecurringTemplate(templateId, updates) {
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

/** Deaktiviert eine wiederkehrende Vorlage (Soft-Delete) */
export async function deactivateRecurringTemplate(templateId) {
    await updateRecurringTemplate(templateId, { active: false });
}

/** Löscht eine wiederkehrende Vorlage (Hard-Delete) */
export async function deleteRecurringTemplate(templateId) {
    const { error } = await supabaseClient
        .from('recurring_training_templates')
        .delete()
        .eq('id', templateId);

    if (error) throw error;
}

/** Prüft auf Überschneidung mit bestehenden Vorlagen */
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
// TRAINING-SESSIONS
// ============================================================================

/** Erstellt eine Trainingssession */
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

/** Mappt Session von Supabase auf App-Format */
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

/** Holt alle Sessions für einen Zeitraum */
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

/** Holt alle Sessions für ein bestimmtes Datum */
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

/** Holt eine einzelne Session per ID */
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

/** Aktualisiert eine Trainingssession */
export async function updateTrainingSession(sessionId, updates) {
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

/** Storniert eine Trainingssession (Soft-Delete) und korrigiert Spielerpunkte */
export async function cancelTrainingSession(sessionId) {
    console.log(
        `[Cancel Training] Cancelling session ${sessionId} and correcting player points...`
    );

    const { data: attendanceRecords, error: attendanceError } = await supabaseClient
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

    if (attendanceError) throw attendanceError;

    for (const attendanceData of attendanceRecords || []) {
        const { present_player_ids: presentPlayerIds, date, subgroup_id: subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

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

        for (const playerId of presentPlayerIds) {
            try {
                const { data: historyEntries, error: historyError } = await supabaseClient
                    .from('points_history')
                    .select('*')
                    .eq('player_id', playerId)
                    .eq('date', date)
                    .eq('subgroup_id', subgroupId)
                    .eq('awarded_by', 'System (Anwesenheit)');

                if (historyError) throw historyError;

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

                    const { data: playerData } = await supabaseClient
                        .from('profiles')
                        .select('points, xp')
                        .eq('id', playerId)
                        .single();

                    await supabaseClient
                        .from('profiles')
                        .update({
                            points: (playerData?.points || 0) - pointsToDeduct,
                            xp: (playerData?.xp || 0) - xpToDeduct
                        })
                        .eq('id', playerId);

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

    await supabaseClient
        .from('attendance')
        .delete()
        .eq('session_id', sessionId);

    await updateTrainingSession(sessionId, { cancelled: true });

    console.log(`[Cancel Training] Session ${sessionId} cancelled successfully`);
}

/** Löscht eine Trainingssession (Hard-Delete) und korrigiert Spielerpunkte */
export async function deleteTrainingSession(sessionId) {
    const { data: attendanceRecords, error: attendanceError } = await supabaseClient
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId);

    if (attendanceError) throw attendanceError;

    for (const attendanceData of attendanceRecords || []) {
        const { present_player_ids: presentPlayerIds, date, subgroup_id: subgroupId } = attendanceData;

        if (!presentPlayerIds || presentPlayerIds.length === 0) continue;

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

        for (const playerId of presentPlayerIds) {
            try {
                const { data: historyEntries, error: historyError } = await supabaseClient
                    .from('points_history')
                    .select('*')
                    .eq('player_id', playerId)
                    .eq('date', date)
                    .eq('subgroup_id', subgroupId)
                    .eq('awarded_by', 'System (Anwesenheit)');

                if (historyError) throw historyError;

                const historyEntry = historyEntries?.find(entry => {
                    return entry.points > 0 && entry.reason && !entry.reason.includes('korrigiert');
                });

                if (historyEntry) {
                    const pointsToDeduct = historyEntry.points || 0;
                    const xpToDeduct = historyEntry.xp || 0;

                    console.log(
                        `[Delete Training] Player ${playerId}: Deducting ${pointsToDeduct} points and ${xpToDeduct} XP`
                    );

                    // Aktuelle Spielerdaten abrufen
                    const { data: playerData } = await supabaseClient
                        .from('profiles')
                        .select('points, xp')
                        .eq('id', playerId)
                        .single();

                    await supabaseClient
                        .from('profiles')
                        .update({
                            points: (playerData?.points || 0) - pointsToDeduct,
                            xp: (playerData?.xp || 0) - xpToDeduct
                        })
                        .eq('id', playerId);

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

    await supabaseClient
        .from('attendance')
        .delete()
        .eq('session_id', sessionId);

    const { error } = await supabaseClient
        .from('training_sessions')
        .delete()
        .eq('id', sessionId);

    if (error) throw error;

}

/** Prüft auf Session-Überschneidung */
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

/** Generiert Trainingssessions aus wiederkehrenden Vorlagen */
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

/** Prüft ob eine Session bereits existiert */
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
// HILFSFUNKTIONEN
// ============================================================================

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

/** Gibt deutschen Wochentagnamen zurück (0=Sonntag, 6=Samstag) */
export function getDayOfWeekName(dayOfWeek) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return days[dayOfWeek];
}

/** Formatiert Zeitspanne für Anzeige */
export function formatTimeRange(startTime, endTime) {
    return `${startTime}-${endTime}`;
}
