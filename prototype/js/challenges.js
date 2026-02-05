/**
 * Challenge-System für TTV Champions Prototyp
 * Trainer erstellen Challenges für ihren Verein
 */

import { supabase, getCurrentProfile, isCoach } from './supabase-client.js';
import { awardXP, awardSeasonPoints, XP_REASONS, POINTS_REASONS } from './points.js';

// ============================================
// CHALLENGES VERWALTEN
// ============================================

/**
 * Erstellt eine neue Challenge (nur Coach)
 *
 * @param {Object} challengeData - Challenge-Daten
 * @returns {Promise<Object>} Ergebnis
 */
export async function createChallenge(challengeData) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nur Trainer können Challenges erstellen' };
    }

    if (!profile.club_id) {
        return { success: false, error: 'Kein Verein zugeordnet' };
    }

    try {
        const { data, error } = await supabase
            .from('challenges')
            .insert({
                club_id: profile.club_id,
                title: challengeData.title,
                description: challengeData.description,
                xp_reward: challengeData.xpReward,
                points_reward: challengeData.pointsReward || 0,
                is_active: true,
                created_by: profile.id
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, challenge: data };
    } catch (error) {
        console.error('Fehler beim Erstellen der Challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Aktualisiert eine Challenge
 *
 * @param {string} challengeId - Challenge-ID
 * @param {Object} updates - Zu aktualisierende Felder
 * @returns {Promise<Object>} Ergebnis
 */
export async function updateChallenge(challengeId, updates) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nicht berechtigt' };
    }

    try {
        const { data, error } = await supabase
            .from('challenges')
            .update(updates)
            .eq('id', challengeId)
            .eq('club_id', profile.club_id)  // Nur eigene Challenges
            .select()
            .single();

        if (error) throw error;

        return { success: true, challenge: data };
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deaktiviert eine Challenge
 *
 * @param {string} challengeId - Challenge-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function deactivateChallenge(challengeId) {
    return updateChallenge(challengeId, { is_active: false });
}

/**
 * Löscht eine Challenge
 *
 * @param {string} challengeId - Challenge-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function deleteChallenge(challengeId) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nicht berechtigt' };
    }

    try {
        const { error } = await supabase
            .from('challenges')
            .delete()
            .eq('id', challengeId)
            .eq('club_id', profile.club_id);

        if (error) throw error;

        return { success: true };
    } catch (error) {
        console.error('Fehler beim Löschen der Challenge:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// CHALLENGES LADEN
// ============================================

/**
 * Lädt aktive Challenges eines Vereins
 *
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Array>} Challenges
 */
export async function getActiveChallenges(clubId) {
    const { data, error } = await supabase
        .from('challenges')
        .select(`
            *,
            created_by_profile:created_by(first_name, last_name)
        `)
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fehler beim Laden der Challenges:', error);
        return [];
    }

    return data;
}

/**
 * Lädt alle Challenges eines Vereins (auch inaktive)
 *
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Array>} Challenges
 */
export async function getAllChallenges(clubId) {
    const { data, error } = await supabase
        .from('challenges')
        .select(`
            *,
            created_by_profile:created_by(first_name, last_name)
        `)
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fehler beim Laden der Challenges:', error);
        return [];
    }

    return data;
}

/**
 * Lädt Challenges mit Abschlussstatus für einen Spieler
 *
 * @param {string} clubId - Verein-ID
 * @param {string} userId - Spieler-ID
 * @returns {Promise<Array>} Challenges mit Abschlussstatus
 */
export async function getChallengesWithStatus(clubId, userId) {
    // Aktive Challenges laden
    const challenges = await getActiveChallenges(clubId);

    // Abgeschlossene Challenges des Spielers laden
    const { data: completed } = await supabase
        .from('completed_challenges')
        .select('challenge_id, completed_at')
        .eq('user_id', userId);

    const completedIds = new Set(completed?.map(c => c.challenge_id) || []);
    const completedMap = new Map(completed?.map(c => [c.challenge_id, c.completed_at]) || []);

    // Status hinzufügen
    return challenges.map(challenge => ({
        ...challenge,
        isCompleted: completedIds.has(challenge.id),
        completedAt: completedMap.get(challenge.id) || null
    }));
}

// ============================================
// CHALLENGES ABSCHLIESSEN
// ============================================

/**
 * Schließt eine Challenge für einen Spieler ab
 *
 * @param {string} challengeId - Challenge-ID
 * @param {string} userId - Spieler-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function completeChallenge(challengeId, userId) {
    const profile = getCurrentProfile();
    if (!profile || !isCoach()) {
        return { success: false, error: 'Nur Trainer können Challenges bestätigen' };
    }

    try {
        // Challenge laden
        const { data: challenge, error: loadError } = await supabase
            .from('challenges')
            .select('*')
            .eq('id', challengeId)
            .single();

        if (loadError) throw loadError;

        // Prüfen, ob bereits abgeschlossen
        const { data: existing } = await supabase
            .from('completed_challenges')
            .select('id')
            .eq('user_id', userId)
            .eq('challenge_id', challengeId)
            .single();

        if (existing) {
            return { success: false, error: 'Challenge bereits abgeschlossen' };
        }

        // Abschluss speichern
        const { error: insertError } = await supabase
            .from('completed_challenges')
            .insert({
                user_id: userId,
                challenge_id: challengeId,
                xp_awarded: challenge.xp_reward,
                points_awarded: challenge.points_reward
            });

        if (insertError) throw insertError;

        // XP vergeben
        await awardXP(userId, challenge.xp_reward, XP_REASONS.CHALLENGE, challengeId, profile.id);

        // Season Points vergeben
        if (challenge.points_reward > 0) {
            await awardSeasonPoints(userId, challenge.points_reward, POINTS_REASONS.CHALLENGE, challengeId, profile.id);
        }

        // Aktivitätsfeed
        await supabase
            .from('activity_feed')
            .insert({
                club_id: challenge.club_id,
                user_id: userId,
                type: 'challenge_completed',
                data: {
                    challenge_id: challengeId,
                    challenge_title: challenge.title,
                    xp_awarded: challenge.xp_reward
                }
            });

        return {
            success: true,
            xpAwarded: challenge.xp_reward,
            pointsAwarded: challenge.points_reward
        };
    } catch (error) {
        console.error('Fehler beim Abschließen der Challenge:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lädt abgeschlossene Challenges eines Spielers
 *
 * @param {string} userId - Spieler-ID
 * @param {number} limit - Limit
 * @returns {Promise<Array>} Abgeschlossene Challenges
 */
export async function getCompletedChallenges(userId, limit = 20) {
    const { data, error } = await supabase
        .from('completed_challenges')
        .select(`
            *,
            challenge:challenges(id, title, description, xp_reward)
        `)
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Fehler beim Laden der abgeschlossenen Challenges:', error);
        return [];
    }

    return data;
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Erstellt HTML für Challenge-Karte
 *
 * @param {Object} challenge - Challenge
 * @param {boolean} isCompleted - Bereits abgeschlossen?
 * @returns {string} HTML
 */
export function createChallengeCard(challenge, isCompleted = false) {
    const statusClass = isCompleted
        ? 'border-green-200 bg-green-50'
        : 'border-gray-200 bg-white';

    const statusBadge = isCompleted
        ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Abgeschlossen</span>'
        : '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Aktiv</span>';

    const rewardsHtml = [];
    if (challenge.xp_reward > 0) {
        rewardsHtml.push(`<span class="text-purple-600">+${challenge.xp_reward} XP</span>`);
    }
    if (challenge.points_reward > 0) {
        rewardsHtml.push(`<span class="text-blue-600">+${challenge.points_reward} Punkte</span>`);
    }

    return `
        <div class="rounded-lg shadow p-4 border ${statusClass}">
            <div class="flex justify-between items-start mb-2">
                <h3 class="font-semibold text-lg">${challenge.title}</h3>
                ${statusBadge}
            </div>
            <p class="text-gray-600 text-sm mb-3">${challenge.description || ''}</p>
            <div class="flex items-center justify-between">
                <span class="text-xs text-gray-500">
                    Erstellt von ${challenge.created_by_profile?.first_name || 'Trainer'}
                </span>
                <div class="font-bold space-x-2">
                    ${rewardsHtml.join('')}
                </div>
            </div>
        </div>
    `;
}

/**
 * Erstellt HTML für Challenge-Formular
 *
 * @returns {string} HTML
 */
export function createChallengeForm() {
    return `
        <form id="challenge-form" class="space-y-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Titel</label>
                <input type="text" name="title" required
                       class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                       placeholder="z.B. Besiege 5 verschiedene Gegner">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <textarea name="description" rows="3"
                          class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Beschreibe die Challenge..."></textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">XP-Belohnung</label>
                    <input type="number" name="xpReward" required min="5" max="100" value="20"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Punkte-Belohnung</label>
                    <input type="number" name="pointsReward" min="0" max="100" value="0"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
            </div>
            <button type="submit"
                    class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                Challenge erstellen
            </button>
        </form>
    `;
}
