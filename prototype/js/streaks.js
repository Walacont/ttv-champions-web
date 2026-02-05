/**
 * Streak-System für TTV Champions Prototyp
 * Verwaltet Trainingsstreaks pro Untergruppe
 */

import { supabase } from './supabase-client.js';
import { awardXP, awardSeasonPoints, XP_REASONS, POINTS_REASONS } from './points.js';

// Streak-basierte Punktevergabe
export const STREAK_POINTS = {
    BASE: 3,           // 1-2 Trainings in Folge
    MEDIUM: 5,         // 3-4 Trainings in Folge
    HIGH: 6            // 5+ Trainings in Folge
};

// Abnehmende Erträge für mehrere Trainings am Tag
export const SECOND_SESSION_MULTIPLIER = 0.5;

/**
 * Berechnet die Punkte basierend auf dem Streak
 *
 * @param {number} streakCount - Aktuelle Streak-Länge
 * @param {boolean} isSecondSession - Zweites Training am selben Tag?
 * @returns {number} Zu vergebende Punkte
 */
export function calculateStreakPoints(streakCount, isSecondSession = false) {
    let basePoints;

    if (streakCount <= 2) {
        basePoints = STREAK_POINTS.BASE;  // 3 Punkte
    } else if (streakCount <= 4) {
        basePoints = STREAK_POINTS.MEDIUM;  // 5 Punkte
    } else {
        basePoints = STREAK_POINTS.HIGH;  // 6 Punkte
    }

    // Zweites Training am Tag: halbe Punkte (aufgerundet)
    if (isSecondSession) {
        return Math.ceil(basePoints * SECOND_SESSION_MULTIPLIER);
    }

    return basePoints;
}

/**
 * Holt den aktuellen Streak eines Spielers für eine Untergruppe
 *
 * @param {string} userId - Spieler-ID
 * @param {string|null} subgroupId - Untergruppen-ID (null = Hauptgruppe)
 * @returns {Promise<Object>} Streak-Daten
 */
export async function getStreak(userId, subgroupId = null) {
    const query = supabase
        .from('streaks')
        .select('*')
        .eq('user_id', userId);

    if (subgroupId) {
        query.eq('subgroup_id', subgroupId);
    } else {
        query.is('subgroup_id', null);
    }

    const { data, error } = await query.single();

    if (error) {
        // Kein Streak vorhanden
        return {
            current_streak: 0,
            longest_streak: 0,
            last_attendance_date: null
        };
    }

    return data;
}

/**
 * Holt alle Streaks eines Spielers
 *
 * @param {string} userId - Spieler-ID
 * @returns {Promise<Array>} Liste aller Streaks mit Untergruppen-Info
 */
export async function getAllStreaks(userId) {
    const { data, error } = await supabase
        .from('streaks')
        .select(`
            *,
            subgroup:subgroups(id, name)
        `)
        .eq('user_id', userId)
        .order('current_streak', { ascending: false });

    if (error) {
        console.error('Fehler beim Laden der Streaks:', error);
        return [];
    }

    return data;
}

/**
 * Aktualisiert den Streak nach einer Trainingsteilnahme
 *
 * @param {string} userId - Spieler-ID
 * @param {string|null} subgroupId - Untergruppen-ID
 * @param {string} sessionDate - Datum der Session (YYYY-MM-DD)
 * @returns {Promise<Object>} Aktualisierte Streak-Daten
 */
export async function updateStreak(userId, subgroupId, sessionDate) {
    const currentStreak = await getStreak(userId, subgroupId);
    const sessionDateObj = new Date(sessionDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStreakCount = 1;
    let isStreakContinued = false;

    if (currentStreak.last_attendance_date) {
        const lastDate = new Date(currentStreak.last_attendance_date);
        const daysDiff = Math.floor((sessionDateObj - lastDate) / (1000 * 60 * 60 * 24));

        if (daysDiff === 0) {
            // Selber Tag - Streak bleibt gleich
            newStreakCount = currentStreak.current_streak;
        } else if (daysDiff <= 7) {
            // Innerhalb einer Woche - Streak erhöhen
            // (Annahme: Training findet nicht täglich statt)
            newStreakCount = currentStreak.current_streak + 1;
            isStreakContinued = true;
        }
        // Sonst: Streak zurücksetzen auf 1
    }

    // Längsten Streak aktualisieren
    const longestStreak = Math.max(currentStreak.longest_streak, newStreakCount);

    // Streak speichern/aktualisieren
    const streakData = {
        user_id: userId,
        subgroup_id: subgroupId,
        current_streak: newStreakCount,
        longest_streak: longestStreak,
        last_attendance_date: sessionDate,
        updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from('streaks')
        .upsert(streakData, {
            onConflict: 'user_id,subgroup_id'
        })
        .select()
        .single();

    if (error) {
        console.error('Fehler beim Aktualisieren des Streaks:', error);
        return currentStreak;
    }

    return {
        ...data,
        isStreakContinued,
        previousStreak: currentStreak.current_streak
    };
}

/**
 * Setzt einen Streak zurück (bei verpasstem Training)
 *
 * @param {string} userId - Spieler-ID
 * @param {string|null} subgroupId - Untergruppen-ID
 * @returns {Promise<boolean>} Erfolg
 */
export async function resetStreak(userId, subgroupId = null) {
    const query = supabase
        .from('streaks')
        .update({
            current_streak: 0,
            updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

    if (subgroupId) {
        query.eq('subgroup_id', subgroupId);
    } else {
        query.is('subgroup_id', null);
    }

    const { error } = await query;

    if (error) {
        console.error('Fehler beim Zurücksetzen des Streaks:', error);
        return false;
    }

    return true;
}

/**
 * Prüft, ob ein Spieler heute schon an einem Training teilgenommen hat
 *
 * @param {string} userId - Spieler-ID
 * @param {string} date - Datum (YYYY-MM-DD)
 * @returns {Promise<boolean>} true wenn bereits teilgenommen
 */
export async function hasAttendedToday(userId, date) {
    const { data, error } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', userId)
        .eq('date', date)
        .eq('present', true)
        .limit(1);

    if (error) {
        console.error('Fehler beim Prüfen der Anwesenheit:', error);
        return false;
    }

    return data.length > 0;
}

/**
 * Erfasst Anwesenheit und vergibt Punkte
 *
 * @param {string} userId - Spieler-ID
 * @param {string} sessionId - Training-Session-ID
 * @param {string} subgroupId - Untergruppen-ID
 * @param {string} date - Datum
 * @param {string} recordedBy - Coach-ID
 * @returns {Promise<Object>} Ergebnis mit vergebenen Punkten
 */
export async function recordAttendance(userId, sessionId, subgroupId, date, recordedBy) {
    try {
        // Prüfen, ob bereits erfasst
        const { data: existing } = await supabase
            .from('attendance')
            .select('id')
            .eq('user_id', userId)
            .eq('session_id', sessionId)
            .single();

        if (existing) {
            return { success: false, error: 'Anwesenheit bereits erfasst' };
        }

        // Prüfen, ob zweites Training heute
        const isSecondSession = await hasAttendedToday(userId, date);

        // Streak aktualisieren
        const streakResult = await updateStreak(userId, subgroupId, date);

        // Punkte berechnen
        const points = calculateStreakPoints(streakResult.current_streak, isSecondSession);

        // Anwesenheit speichern
        const { error: attendanceError } = await supabase
            .from('attendance')
            .insert({
                user_id: userId,
                session_id: sessionId,
                subgroup_id: subgroupId,
                date,
                present: true,
                xp_awarded: points,
                points_awarded: points,
                is_second_session: isSecondSession,
                recorded_by: recordedBy
            });

        if (attendanceError) throw attendanceError;

        // XP vergeben
        await awardXP(userId, points, XP_REASONS.TRAINING, sessionId, recordedBy);

        // Season Points vergeben
        await awardSeasonPoints(userId, points, POINTS_REASONS.TRAINING, sessionId, recordedBy);

        return {
            success: true,
            streak: streakResult.current_streak,
            points,
            isSecondSession,
            streakContinued: streakResult.isStreakContinued
        };
    } catch (error) {
        console.error('Fehler bei der Anwesenheitserfassung:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Entfernt Anwesenheit (z.B. bei Fehler)
 *
 * @param {string} userId - Spieler-ID
 * @param {string} sessionId - Session-ID
 * @returns {Promise<boolean>} Erfolg
 */
export async function removeAttendance(userId, sessionId) {
    // Punkte holen, die vergeben wurden
    const { data: attendance } = await supabase
        .from('attendance')
        .select('xp_awarded, points_awarded')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .single();

    if (!attendance) return true;

    // Punkte abziehen
    if (attendance.xp_awarded > 0) {
        await awardXP(userId, -attendance.xp_awarded, XP_REASONS.TRAINING, sessionId);
    }
    if (attendance.points_awarded > 0) {
        await awardSeasonPoints(userId, -attendance.points_awarded, POINTS_REASONS.TRAINING, sessionId);
    }

    // Anwesenheit löschen
    const { error } = await supabase
        .from('attendance')
        .delete()
        .eq('user_id', userId)
        .eq('session_id', sessionId);

    return !error;
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Erstellt HTML für Streak-Anzeige
 *
 * @param {number} streak - Streak-Länge
 * @param {string|null} subgroupName - Name der Untergruppe
 * @returns {string} HTML
 */
export function createStreakBadge(streak, subgroupName = null) {
    let emoji = '🔥';
    let colorClass = 'bg-orange-100 text-orange-700';

    if (streak >= 10) {
        emoji = '🏆';
        colorClass = 'bg-yellow-100 text-yellow-700';
    } else if (streak >= 5) {
        emoji = '⚡';
        colorClass = 'bg-purple-100 text-purple-700';
    }

    const groupLabel = subgroupName ? `<span class="text-xs opacity-75">${subgroupName}</span>` : '';

    return `
        <div class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm ${colorClass}">
            <span>${emoji}</span>
            <span class="font-bold">${streak}</span>
            ${groupLabel}
        </div>
    `;
}

/**
 * Formatiert Streak-Punkte für die Anzeige
 *
 * @param {number} points - Punkte
 * @param {boolean} isSecondSession - Zweites Training?
 * @returns {string} Formatierte Beschreibung
 */
export function formatStreakPointsAwarded(points, isSecondSession) {
    if (isSecondSession) {
        return `+${points} Punkte (2. Training heute, halbe Punkte)`;
    }
    return `+${points} Punkte`;
}
