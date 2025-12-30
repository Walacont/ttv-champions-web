// Sport-Kontext-Verwaltung - ein Sport pro Benutzer

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let cachedSportContext = null;
let cachedUserId = null;

/**
 * Sport-Kontext Struktur:
 * { sportId, sportName, displayName, config, clubId, clubName, role }
 */

/**
 * Lädt den Sport-Kontext für einen Benutzer.
 * Vereinfacht: Jeder Benutzer hat einen Sport, einen Verein und eine Rolle (direkt in profiles gespeichert).
 *
 * @param {string} userId - Benutzer-ID
 * @param {boolean} forceRefresh - Cache-Aktualisierung erzwingen
 * @returns {Promise<Object|null>}
 */
export async function getSportContext(userId, forceRefresh = false) {
    if (!userId) return null;

    if (!forceRefresh && cachedSportContext && cachedUserId === userId) {
        return cachedSportContext;
    }

    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                active_sport_id,
                club_id,
                role,
                sports:active_sport_id(name, display_name, config),
                clubs:club_id(name)
            `)
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error('[SportContext] Error loading context:', error);
            return null;
        }

        if (!profile || !profile.active_sport_id) {
            console.log('[SportContext] No sport found for user');
            return null;
        }

        cachedSportContext = {
            sportId: profile.active_sport_id,
            sportName: profile.sports?.name,
            displayName: profile.sports?.display_name,
            config: profile.sports?.config,
            clubId: profile.club_id,
            clubName: profile.clubs?.name,
            role: profile.role
        };
        cachedUserId = userId;

        console.log('[SportContext] Loaded:', cachedSportContext);
        return cachedSportContext;

    } catch (error) {
        console.error('[SportContext] Error:', error);
        return null;
    }
}

export function clearSportContextCache() {
    cachedSportContext = null;
    cachedUserId = null;
    console.log('[SportContext] Cache cleared');
}

/**
 * Gibt alle Benutzer in einer Sportart zurück (für Bestenlisten, Match-Vorschläge, etc.).
 *
 * @param {string} sportId - Sport-ID
 * @param {string} clubId - Optional: Vereins-ID zum Filtern
 * @returns {Promise<string[]>}
 */
export async function getUsersInSport(sportId, clubId = null) {
    if (!sportId) return [];

    try {
        let query = supabase
            .from('profiles')
            .select('id')
            .eq('active_sport_id', sportId);

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[SportContext] Error getting users in sport:', error);
            return [];
        }

        return (data || []).map(row => row.id);

    } catch (error) {
        console.error('[SportContext] Error:', error);
        return [];
    }
}

/**
 * Gibt alle Benutzer mit ihren Vereinen für eine Sportart zurück.
 * Nützlich für Bestenlisten, die Vereinsnamen anzeigen müssen.
 *
 * @param {string} sportId - Sport-ID
 * @returns {Promise<Array<{userId: string, clubId: string}>>}
 */
export async function getUsersWithClubsInSport(sportId) {
    if (!sportId) return [];

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, club_id')
            .eq('active_sport_id', sportId);

        if (error) {
            console.error('[SportContext] Error getting users with clubs:', error);
            return [];
        }

        return (data || []).map(row => ({
            userId: row.id,
            clubId: row.club_id
        }));

    } catch (error) {
        console.error('[SportContext] Error:', error);
        return [];
    }
}

/**
 * Prüft, ob ein Benutzer Trainer ist.
 *
 * @param {string} userId - Benutzer-ID
 * @param {string} sportId - Wird ignoriert (für API-Kompatibilität beibehalten)
 * @returns {Promise<boolean>}
 */
export async function isCoachInSport(userId, sportId = null) {
    if (!userId) return false;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .maybeSingle();

        if (error || !data) return false;

        return data?.role === 'coach' || data?.role === 'head_coach';

    } catch (error) {
        return false;
    }
}

/**
 * Gibt die Vereins-ID eines Benutzers zurück.
 *
 * @param {string} userId - Benutzer-ID
 * @param {string} sportId - Wird ignoriert (für API-Kompatibilität beibehalten)
 * @returns {Promise<string|null>}
 */
export async function getClubIdForSport(userId, sportId) {
    if (!userId) return null;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', userId)
            .maybeSingle();

        if (error || !data) return null;

        return data?.club_id || null;

    } catch (error) {
        return null;
    }
}

/**
 * Lädt den Sport-Kontext neu.
 *
 * @param {string} userId - Benutzer-ID
 * @returns {Promise<Object|null>}
 */
export async function reloadSportContext(userId) {
    clearSportContextCache();
    return await getSportContext(userId, true);
}

export default {
    getSportContext,
    clearSportContextCache,
    getUsersInSport,
    getUsersWithClubsInSport,
    isCoachInSport,
    getClubIdForSport,
    reloadSportContext
};
