// Sport Context Helper - Supabase Version
// Provides centralized sport context management (single sport per user)

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

// Cache for sport context
let cachedSportContext = null;
let cachedUserId = null;

/**
 * Sport context object structure:
 * {
 *   sportId: UUID,
 *   sportName: string,
 *   displayName: string,
 *   config: object (scoring rules, icon, etc.),
 *   clubId: UUID,
 *   clubName: string,
 *   role: 'player' | 'coach' | 'head_coach'
 * }
 */

/**
 * Get the full sport context for the current user.
 * Simplified: Each user has one sport, one club, one role (stored directly in profiles).
 *
 * @param {string} userId - The user's ID
 * @param {boolean} forceRefresh - Force refresh the cache
 * @returns {Promise<Object|null>} Sport context or null if not found
 */
export async function getSportContext(userId, forceRefresh = false) {
    if (!userId) return null;

    // Return cached context if available and not forcing refresh
    if (!forceRefresh && cachedSportContext && cachedUserId === userId) {
        return cachedSportContext;
    }

    try {
        // Direct query from profiles with sport and club joins
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

/**
 * Clear the cached sport context
 */
export function clearSportContextCache() {
    cachedSportContext = null;
    cachedUserId = null;
    console.log('[SportContext] Cache cleared');
}

/**
 * Get all users in the same sport (for leaderboards, match suggestions, etc.)
 * Simplified: Uses profiles.active_sport_id directly
 *
 * @param {string} sportId - The sport ID to filter by
 * @param {string} clubId - Optional club ID to filter within a club
 * @returns {Promise<string[]>} Array of user IDs in the sport
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
 * Get all user IDs with their club for a specific sport
 * Useful for leaderboards that need to show club names
 *
 * @param {string} sportId - The sport ID to filter by
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
 * Check if user is coach in their sport
 * Simplified: Just checks profiles.role
 *
 * @param {string} userId - The user ID
 * @param {string} sportId - Ignored (kept for API compatibility)
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
 * Get the club ID for a user
 * Simplified: Just returns profiles.club_id
 *
 * @param {string} userId - The user ID
 * @param {string} sportId - Ignored (kept for API compatibility)
 * @returns {Promise<string|null>} Club ID or null
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
 * Reload sport context
 *
 * @param {string} userId - The user ID
 * @returns {Promise<Object|null>} New sport context
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
