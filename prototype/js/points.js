/**
 * Punktesystem für SC Champions Prototyp
 * XP (dauerhaft) und Season Points (resetbar)
 */

import { supabase } from './supabase-client.js';

// ============================================
// XP-SYSTEM (Experience Points - dauerhaft)
// ============================================

// XP-Werte für verschiedene Aktivitäten
export const XP_VALUES = {
    MATCH_WIN: 25,           // Sieg in einem Spiel
    EXERCISE_BASE: 30,       // Basis-XP für Übungen (variiert)
    CHALLENGE_MIN: 5,        // Minimum für Challenges
    CHALLENGE_MAX: 100       // Maximum für Challenges
};

// XP-Gründe für Historie
export const XP_REASONS = {
    TRAINING: 'training',
    MATCH_WIN: 'match_win',
    EXERCISE: 'exercise',
    CHALLENGE: 'challenge',
    PENALTY: 'penalty'       // Strafe (negativ)
};

/**
 * Vergibt XP an einen Spieler
 *
 * @param {string} userId - Spieler-ID
 * @param {number} amount - XP-Menge (kann negativ sein für Strafen)
 * @param {string} reason - Grund (aus XP_REASONS)
 * @param {string|null} sourceId - Referenz auf Quelle (Match-ID, etc.)
 * @param {string|null} awardedBy - ID des Vergebenden (Coach)
 * @returns {Promise<Object>} Ergebnis
 */
export async function awardXP(userId, amount, reason, sourceId = null, awardedBy = null) {
    try {
        // XP-Historie eintragen
        const { error: historyError } = await supabase
            .from('xp_history')
            .insert({
                user_id: userId,
                amount,
                reason,
                source_id: sourceId,
                awarded_by: awardedBy
            });

        if (historyError) throw historyError;

        // Profil aktualisieren
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('xp')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        const newXP = Math.max(0, profile.xp + amount);  // XP kann nicht unter 0 fallen

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ xp: newXP, updated_at: new Date().toISOString() })
            .eq('id', userId);

        if (updateError) throw updateError;

        return {
            success: true,
            previousXP: profile.xp,
            newXP,
            change: amount
        };
    } catch (error) {
        console.error('Fehler beim XP-Vergeben:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Holt die XP-Historie eines Spielers
 *
 * @param {string} userId - Spieler-ID
 * @param {number} limit - Maximale Anzahl Einträge
 * @returns {Promise<Array>} XP-Historie
 */
export async function getXPHistory(userId, limit = 20) {
    const { data, error } = await supabase
        .from('xp_history')
        .select(`
            *,
            awarded_by_profile:awarded_by(first_name, last_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Fehler beim Laden der XP-Historie:', error);
        return [];
    }

    return data;
}

// ============================================
// SEASON POINTS (Saisonpunkte - resetbar)
// ============================================

// Season Points Gründe
export const POINTS_REASONS = {
    TRAINING: 'training',
    MATCH_WIN: 'match_win',
    EXERCISE: 'exercise',
    CHALLENGE: 'challenge',
    PENALTY: 'penalty',
    SEASON_RESET: 'season_reset'
};

/**
 * Vergibt Season Points an einen Spieler
 *
 * @param {string} userId - Spieler-ID
 * @param {number} amount - Punkte-Menge
 * @param {string} reason - Grund
 * @param {string|null} sourceId - Referenz
 * @param {string|null} awardedBy - Vergeber
 * @param {string|null} seasonId - Saison-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function awardSeasonPoints(userId, amount, reason, sourceId = null, awardedBy = null, seasonId = null) {
    try {
        // Punkte-Historie eintragen
        const { error: historyError } = await supabase
            .from('points_history')
            .insert({
                user_id: userId,
                amount,
                reason,
                source_id: sourceId,
                awarded_by: awardedBy,
                season_id: seasonId
            });

        if (historyError) throw historyError;

        // Profil aktualisieren
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('season_points')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        // Season Points können negativ werden (durch Strafen)
        const newPoints = profile.season_points + amount;

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ season_points: newPoints, updated_at: new Date().toISOString() })
            .eq('id', userId);

        if (updateError) throw updateError;

        return {
            success: true,
            previousPoints: profile.season_points,
            newPoints,
            change: amount
        };
    } catch (error) {
        console.error('Fehler beim Punktevergeben:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Holt die Season Points Historie eines Spielers
 *
 * @param {string} userId - Spieler-ID
 * @param {number} limit - Maximale Anzahl
 * @returns {Promise<Array>} Punkte-Historie
 */
export async function getPointsHistory(userId, limit = 20) {
    const { data, error } = await supabase
        .from('points_history')
        .select(`
            *,
            awarded_by_profile:awarded_by(first_name, last_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Fehler beim Laden der Punkte-Historie:', error);
        return [];
    }

    return data;
}

// ============================================
// SAISON-VERWALTUNG
// ============================================

/**
 * Startet eine neue Saison für einen Verein
 * Setzt alle Season Points auf 0 zurück
 *
 * @param {string} clubId - Verein-ID
 * @param {string} name - Name der Saison
 * @param {string} createdBy - Coach-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function startNewSeason(clubId, name, createdBy) {
    try {
        // Alte Saison beenden (falls vorhanden)
        await supabase
            .from('seasons')
            .update({ is_active: false, ended_at: new Date().toISOString() })
            .eq('club_id', clubId)
            .eq('is_active', true);

        // Neue Saison erstellen
        const { data: season, error: seasonError } = await supabase
            .from('seasons')
            .insert({
                club_id: clubId,
                name,
                created_by: createdBy,
                is_active: true
            })
            .select()
            .single();

        if (seasonError) throw seasonError;

        // Alle Spieler des Vereins holen
        const { data: players, error: playersError } = await supabase
            .from('profiles')
            .select('id, season_points')
            .eq('club_id', clubId);

        if (playersError) throw playersError;

        // Season Points auf 0 setzen für alle Spieler
        for (const player of players) {
            if (player.season_points !== 0) {
                // Historie-Eintrag für Reset
                await supabase
                    .from('points_history')
                    .insert({
                        user_id: player.id,
                        amount: -player.season_points,
                        reason: POINTS_REASONS.SEASON_RESET,
                        season_id: season.id
                    });
            }
        }

        // Alle Punkte auf 0 setzen
        const { error: resetError } = await supabase
            .from('profiles')
            .update({ season_points: 0 })
            .eq('club_id', clubId);

        if (resetError) throw resetError;

        // Aktivitätsfeed-Eintrag
        await supabase
            .from('activity_feed')
            .insert({
                club_id: clubId,
                user_id: createdBy,
                type: 'season_start',
                data: { season_name: name, season_id: season.id }
            });

        return { success: true, season };
    } catch (error) {
        console.error('Fehler beim Starten der Saison:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Beendet die aktuelle Saison
 *
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function endCurrentSeason(clubId) {
    try {
        const { data, error } = await supabase
            .from('seasons')
            .update({ is_active: false, ended_at: new Date().toISOString() })
            .eq('club_id', clubId)
            .eq('is_active', true)
            .select()
            .single();

        if (error) throw error;

        // Aktivitätsfeed-Eintrag
        await supabase
            .from('activity_feed')
            .insert({
                club_id: clubId,
                type: 'season_end',
                data: { season_name: data.name, season_id: data.id }
            });

        return { success: true, season: data };
    } catch (error) {
        console.error('Fehler beim Beenden der Saison:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Holt die aktuelle aktive Saison eines Vereins
 *
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Object|null>} Aktive Saison oder null
 */
export async function getCurrentSeason(clubId) {
    const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .single();

    if (error) {
        return null;
    }

    return data;
}

// ============================================
// STRAFEN
// ============================================

// Strafkategorien
export const PENALTY_TYPES = {
    LIGHT: { points: -10, xp: -5, name: 'Leicht' },
    MEDIUM: { points: -20, xp: -10, name: 'Mittel' },
    HEAVY: { points: -30, xp: -20, name: 'Schwer' }
};

/**
 * Verhängt eine Strafe gegen einen Spieler
 *
 * @param {string} userId - Spieler-ID
 * @param {string} penaltyType - Typ aus PENALTY_TYPES
 * @param {string} reason - Begründung
 * @param {string} awardedBy - Coach-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function issuePenalty(userId, penaltyType, reason, awardedBy) {
    const penalty = PENALTY_TYPES[penaltyType];
    if (!penalty) {
        return { success: false, error: 'Ungültiger Straftyp' };
    }

    try {
        // XP abziehen
        const xpResult = await awardXP(userId, penalty.xp, XP_REASONS.PENALTY, null, awardedBy);
        if (!xpResult.success) throw new Error(xpResult.error);

        // Season Points abziehen
        const pointsResult = await awardSeasonPoints(userId, penalty.points, POINTS_REASONS.PENALTY, null, awardedBy);
        if (!pointsResult.success) throw new Error(pointsResult.error);

        return {
            success: true,
            penalty: {
                type: penaltyType,
                xpDeducted: Math.abs(penalty.xp),
                pointsDeducted: Math.abs(penalty.points),
                reason
            }
        };
    } catch (error) {
        console.error('Fehler beim Verhängen der Strafe:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Formatiert einen XP-Grund für die Anzeige
 *
 * @param {string} reason - Grund aus XP_REASONS
 * @returns {string} Formatierte Beschreibung
 */
export function formatXPReason(reason) {
    const descriptions = {
        training: 'Trainingsteilnahme',
        match_win: 'Spielsieg',
        exercise: 'Übung abgeschlossen',
        challenge: 'Challenge abgeschlossen',
        penalty: 'Strafe'
    };
    return descriptions[reason] || reason;
}

/**
 * Formatiert eine Punkteänderung für die Anzeige
 *
 * @param {number} amount - Punkte
 * @param {string} type - 'xp' oder 'points'
 * @returns {string} HTML-formatierte Zeichenkette
 */
export function formatPointsChange(amount, type = 'points') {
    const label = type === 'xp' ? 'XP' : 'Punkte';

    if (amount > 0) {
        return `<span class="text-green-600">+${amount} ${label}</span>`;
    } else if (amount < 0) {
        return `<span class="text-red-600">${amount} ${label}</span>`;
    } else {
        return `<span class="text-gray-500">±0 ${label}</span>`;
    }
}
