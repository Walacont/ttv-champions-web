/**
 * Übungssystem für TTV Champions Prototyp
 * Einzelübungen, Paarübungen und Meilensteine
 */

import { supabase, getCurrentProfile, isCoach } from './supabase-client.js';
import { awardXP, awardSeasonPoints, XP_REASONS, POINTS_REASONS } from './points.js';

// Übungstypen
export const EXERCISE_TYPES = {
    SINGLE: 'single',    // Einzelübung
    PAIR: 'pair'         // Paarübung
};

// Paar-Modi
export const PAIR_MODES = {
    BOTH_ACTIVE: 'both_active',      // Beide aktiv: 100% für beide
    ACTIVE_PASSIVE: 'active_passive'  // Einer aktiv, einer passiv: 100%/50%
};

// ============================================
// ÜBUNGEN VERWALTEN
// ============================================

/**
 * Erstellt eine neue Übung (nur Admin/Coach)
 *
 * @param {Object} exerciseData - Übungsdaten
 * @returns {Promise<Object>} Ergebnis
 */
export async function createExercise(exerciseData) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nicht berechtigt' };
    }

    try {
        const { data, error } = await supabase
            .from('exercises')
            .insert({
                title: exerciseData.title,
                description: exerciseData.description,
                image_url: exerciseData.imageUrl || null,
                type: exerciseData.type || EXERCISE_TYPES.SINGLE,
                pair_mode: exerciseData.pairMode || null,
                xp_reward: exerciseData.xpReward,
                milestones: exerciseData.milestones || null,
                tags: exerciseData.tags || [],
                is_grundlage: exerciseData.isGrundlage || false,
                created_by: profile.id
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, exercise: data };
    } catch (error) {
        console.error('Fehler beim Erstellen der Übung:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lädt alle Übungen
 *
 * @param {Object} filters - Filter
 * @returns {Promise<Array>} Übungen
 */
export async function getExercises(filters = {}) {
    let query = supabase
        .from('exercises')
        .select('*')
        .order('title');

    if (filters.type) {
        query = query.eq('type', filters.type);
    }

    if (filters.isGrundlage !== undefined) {
        query = query.eq('is_grundlage', filters.isGrundlage);
    }

    if (filters.tag) {
        query = query.contains('tags', [filters.tag]);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden der Übungen:', error);
        return [];
    }

    return data;
}

/**
 * Lädt Grundlagen-Übungen
 *
 * @returns {Promise<Array>} Grundlagen-Übungen
 */
export async function getGrundlagenExercises() {
    return getExercises({ isGrundlage: true });
}

// ============================================
// ÜBUNGEN ABSCHLIESSEN
// ============================================

/**
 * Schließt eine Einzelübung ab
 *
 * @param {string} exerciseId - Übungs-ID
 * @param {string} userId - Spieler-ID
 * @param {number} score - Erreichter Wert (für Meilensteine)
 * @param {string} sessionId - Training-Session-ID (optional)
 * @returns {Promise<Object>} Ergebnis
 */
export async function completeExercise(exerciseId, userId, score = null, sessionId = null) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nur Trainer können Übungen bestätigen' };
    }

    try {
        // Übung laden
        const { data: exercise, error: loadError } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (loadError) throw loadError;

        // XP berechnen
        let xpAwarded = exercise.xp_reward;

        // Bei Meilensteinen: kumulative Punkte berechnen
        if (exercise.milestones && score !== null) {
            xpAwarded = calculateMilestonePoints(exercise.milestones, score);
        }

        // Abschluss speichern
        const { error: insertError } = await supabase
            .from('completed_exercises')
            .insert({
                user_id: userId,
                exercise_id: exerciseId,
                score,
                xp_awarded: xpAwarded,
                awarded_by: profile.id,
                session_id: sessionId
            });

        if (insertError) throw insertError;

        // XP vergeben
        await awardXP(userId, xpAwarded, XP_REASONS.EXERCISE, exerciseId, profile.id);

        // Season Points vergeben (gleiche Menge)
        await awardSeasonPoints(userId, xpAwarded, POINTS_REASONS.EXERCISE, exerciseId, profile.id);

        // Wenn Grundlagen-Übung: Zähler erhöhen
        if (exercise.is_grundlage) {
            await incrementGrundlagenCount(userId);
        }

        return {
            success: true,
            xpAwarded,
            isGrundlage: exercise.is_grundlage
        };
    } catch (error) {
        console.error('Fehler beim Abschließen der Übung:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Schließt eine Paarübung ab
 *
 * @param {string} exerciseId - Übungs-ID
 * @param {string} activePlayerId - Aktiver Spieler
 * @param {string} partnerId - Partner-ID
 * @param {boolean} partnerIsActive - Ist Partner auch aktiv?
 * @param {number} score - Erreichter Wert
 * @param {string} sessionId - Session-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function completePairExercise(
    exerciseId,
    activePlayerId,
    partnerId,
    partnerIsActive = true,
    score = null,
    sessionId = null
) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nur Trainer können Übungen bestätigen' };
    }

    try {
        // Übung laden
        const { data: exercise, error: loadError } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (loadError) throw loadError;

        if (exercise.type !== EXERCISE_TYPES.PAIR) {
            return { success: false, error: 'Keine Paarübung' };
        }

        // XP berechnen
        let baseXP = exercise.xp_reward;
        if (exercise.milestones && score !== null) {
            baseXP = calculateMilestonePoints(exercise.milestones, score);
        }

        // Punkte für aktiven Spieler (immer 100%)
        const activePlayerXP = baseXP;

        // Punkte für Partner
        let partnerXP;
        if (exercise.pair_mode === PAIR_MODES.BOTH_ACTIVE || partnerIsActive) {
            partnerXP = baseXP;  // 100%
        } else {
            partnerXP = Math.ceil(baseXP / 2);  // 50% (aufgerundet)
        }

        // Aktiven Spieler speichern
        await supabase
            .from('completed_exercises')
            .insert({
                user_id: activePlayerId,
                exercise_id: exerciseId,
                partner_id: partnerId,
                is_active_player: true,
                score,
                xp_awarded: activePlayerXP,
                awarded_by: profile.id,
                session_id: sessionId
            });

        // Partner speichern
        await supabase
            .from('completed_exercises')
            .insert({
                user_id: partnerId,
                exercise_id: exerciseId,
                partner_id: activePlayerId,
                is_active_player: partnerIsActive,
                score,
                xp_awarded: partnerXP,
                awarded_by: profile.id,
                session_id: sessionId
            });

        // XP vergeben
        await awardXP(activePlayerId, activePlayerXP, XP_REASONS.EXERCISE, exerciseId, profile.id);
        await awardXP(partnerId, partnerXP, XP_REASONS.EXERCISE, exerciseId, profile.id);

        // Season Points vergeben
        await awardSeasonPoints(activePlayerId, activePlayerXP, POINTS_REASONS.EXERCISE, exerciseId, profile.id);
        await awardSeasonPoints(partnerId, partnerXP, POINTS_REASONS.EXERCISE, exerciseId, profile.id);

        // Grundlagen-Zähler
        if (exercise.is_grundlage) {
            await incrementGrundlagenCount(activePlayerId);
            await incrementGrundlagenCount(partnerId);
        }

        return {
            success: true,
            activePlayerXP,
            partnerXP,
            isGrundlage: exercise.is_grundlage
        };
    } catch (error) {
        console.error('Fehler beim Abschließen der Paarübung:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Berechnet kumulative Meilenstein-Punkte
 *
 * @param {Array} milestones - Meilenstein-Definition [{count: 3, points: 3}, {count: 8, points: 6}, ...]
 * @param {number} achievedCount - Erreichter Wert
 * @returns {number} Gesamtpunkte
 */
export function calculateMilestonePoints(milestones, achievedCount) {
    if (!milestones || !Array.isArray(milestones)) {
        return 0;
    }

    // Meilensteine sortieren nach count
    const sorted = [...milestones].sort((a, b) => a.count - b.count);

    let totalPoints = 0;

    for (const milestone of sorted) {
        if (achievedCount >= milestone.count) {
            totalPoints = milestone.points;  // Kumulative Punkte
        } else {
            break;
        }
    }

    return totalPoints;
}

/**
 * Erhöht den Grundlagen-Zähler eines Spielers
 */
async function incrementGrundlagenCount(userId) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('grundlagen_completed')
        .eq('id', userId)
        .single();

    if (profile) {
        await supabase
            .from('profiles')
            .update({
                grundlagen_completed: (profile.grundlagen_completed || 0) + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', userId);
    }
}

// ============================================
// ABGESCHLOSSENE ÜBUNGEN
// ============================================

/**
 * Lädt abgeschlossene Übungen eines Spielers
 *
 * @param {string} userId - Spieler-ID
 * @param {number} limit - Limit
 * @returns {Promise<Array>} Abgeschlossene Übungen
 */
export async function getCompletedExercises(userId, limit = 20) {
    const { data, error } = await supabase
        .from('completed_exercises')
        .select(`
            *,
            exercise:exercises(id, title, description, type, xp_reward, is_grundlage),
            partner:partner_id(first_name, last_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Fehler beim Laden der abgeschlossenen Übungen:', error);
        return [];
    }

    return data;
}

/**
 * Prüft, ob ein Spieler eine bestimmte Übung bereits abgeschlossen hat
 *
 * @param {string} userId - Spieler-ID
 * @param {string} exerciseId - Übungs-ID
 * @returns {Promise<boolean>}
 */
export async function hasCompletedExercise(userId, exerciseId) {
    const { data } = await supabase
        .from('completed_exercises')
        .select('id')
        .eq('user_id', userId)
        .eq('exercise_id', exerciseId)
        .limit(1);

    return data && data.length > 0;
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Erstellt HTML für Übungskarte
 *
 * @param {Object} exercise - Übung
 * @returns {string} HTML
 */
export function createExerciseCard(exercise) {
    const typeLabel = exercise.type === EXERCISE_TYPES.PAIR ? 'Paarübung' : 'Einzelübung';
    const grundlageLabel = exercise.is_grundlage
        ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Grundlage</span>'
        : '';

    const tagsHtml = exercise.tags?.map(tag =>
        `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">${tag}</span>`
    ).join(' ') || '';

    return `
        <div class="bg-white rounded-lg shadow p-4 border border-gray-200">
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-semibold text-lg">${exercise.title}</h3>
                ${grundlageLabel}
            </div>
            <p class="text-gray-600 text-sm mb-3">${exercise.description || ''}</p>
            <div class="flex items-center justify-between">
                <div class="flex gap-2">
                    <span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">${typeLabel}</span>
                    ${tagsHtml}
                </div>
                <span class="text-purple-600 font-bold">+${exercise.xp_reward} XP</span>
            </div>
            ${exercise.milestones ? createMilestonesDisplay(exercise.milestones) : ''}
        </div>
    `;
}

/**
 * Erstellt HTML für Meilenstein-Anzeige
 *
 * @param {Array} milestones - Meilensteine
 * @returns {string} HTML
 */
export function createMilestonesDisplay(milestones) {
    if (!milestones || milestones.length === 0) return '';

    const sorted = [...milestones].sort((a, b) => a.count - b.count);

    const milestonesHtml = sorted.map(m =>
        `<span class="text-xs">${m.count}x → ${m.points} XP</span>`
    ).join(' | ');

    return `
        <div class="mt-3 pt-3 border-t border-gray-100">
            <p class="text-xs text-gray-500 mb-1">Meilensteine:</p>
            <div class="text-gray-600">${milestonesHtml}</div>
        </div>
    `;
}
