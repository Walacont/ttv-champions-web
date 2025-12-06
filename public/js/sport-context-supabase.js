// Sport Context Helper - Supabase Version
// Provides centralized sport context management for multi-sport support
// A user can be in different clubs for different sports (e.g., Tennis in Club A, Table Tennis in Club B)

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
 *   role: 'player' | 'coach'
 * }
 */

/**
 * Get the full sport context for the current user's active sport.
 * This returns the sport_id, club_id, and role for the active sport.
 * Important: A user can be in different clubs for different sports!
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
        // Try RPC function first (more efficient)
        const { data: contextData, error: rpcError } = await supabase.rpc('get_user_sport_context', {
            p_user_id: userId
        });

        if (!rpcError && contextData && contextData.length > 0) {
            const ctx = contextData[0];
            cachedSportContext = {
                sportId: ctx.sport_id,
                sportName: ctx.sport_name,
                displayName: ctx.display_name,
                config: ctx.config,
                clubId: ctx.club_id,
                clubName: ctx.club_name,
                role: ctx.role
            };
            cachedUserId = userId;
            console.log('[SportContext] Loaded via RPC:', cachedSportContext);
            return cachedSportContext;
        }

        // Fallback: Direct query
        console.log('[SportContext] RPC not available, using fallback query');
        return await getSportContextFallback(userId);

    } catch (error) {
        console.error('[SportContext] Error loading context:', error);
        // Try fallback
        return await getSportContextFallback(userId);
    }
}

/**
 * Fallback method to get sport context via direct queries
 */
async function getSportContextFallback(userId) {
    try {
        // Get user's active sport from profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('active_sport_id')
            .eq('id', userId)
            .maybeSingle();

        let activeSportId = profile?.active_sport_id;

        // If no active sport set, get first sport from profile_club_sports
        if (!activeSportId) {
            const { data: pcsData } = await supabase
                .from('profile_club_sports')
                .select('sport_id')
                .eq('user_id', userId)
                .order('created_at', { ascending: true })
                .limit(1);

            // User might not have any profile_club_sports records yet
            if (pcsData && pcsData.length > 0) {
                activeSportId = pcsData[0].sport_id;
            }
        }

        if (!activeSportId) {
            console.log('[SportContext] No sport found for user');
            return null;
        }

        // Get full context from profile_club_sports
        const { data: contextData, error } = await supabase
            .from('profile_club_sports')
            .select(`
                sport_id,
                club_id,
                role,
                sports(name, display_name, config),
                clubs(name)
            `)
            .eq('user_id', userId)
            .eq('sport_id', activeSportId)
            .maybeSingle();

        if (error) {
            console.error('[SportContext] Error in fallback:', error);
            return null;
        }

        // User might not have a club/sport assignment yet
        if (!contextData) {
            console.log('[SportContext] No club/sport assignment found for user');
            return null;
        }

        cachedSportContext = {
            sportId: contextData.sport_id,
            sportName: contextData.sports?.name,
            displayName: contextData.sports?.display_name,
            config: contextData.sports?.config,
            clubId: contextData.club_id,
            clubName: contextData.clubs?.name,
            role: contextData.role
        };
        cachedUserId = userId;

        console.log('[SportContext] Loaded via fallback:', cachedSportContext);
        return cachedSportContext;

    } catch (error) {
        console.error('[SportContext] Fallback error:', error);
        return null;
    }
}

/**
 * Clear the cached sport context (call when user switches sport)
 */
export function clearSportContextCache() {
    cachedSportContext = null;
    cachedUserId = null;
    console.log('[SportContext] Cache cleared');
}

/**
 * Get all users in the same sport (for leaderboards, match suggestions, etc.)
 * This returns users who are in the same sport, regardless of club.
 *
 * @param {string} sportId - The sport ID to filter by
 * @param {string} clubId - Optional club ID to filter within a club
 * @returns {Promise<string[]>} Array of user IDs in the sport
 */
export async function getUsersInSport(sportId, clubId = null) {
    if (!sportId) return [];

    try {
        let query = supabase
            .from('profile_club_sports')
            .select('user_id')
            .eq('sport_id', sportId);

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[SportContext] Error getting users in sport:', error);
            return [];
        }

        return (data || []).map(row => row.user_id);

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
            .from('profile_club_sports')
            .select('user_id, club_id')
            .eq('sport_id', sportId);

        if (error) {
            console.error('[SportContext] Error getting users with clubs:', error);
            return [];
        }

        return (data || []).map(row => ({
            userId: row.user_id,
            clubId: row.club_id
        }));

    } catch (error) {
        console.error('[SportContext] Error:', error);
        return [];
    }
}

/**
 * Check if user is coach in the specified sport
 *
 * @param {string} userId - The user ID
 * @param {string} sportId - The sport ID (optional, uses active sport if not provided)
 * @returns {Promise<boolean>}
 */
export async function isCoachInSport(userId, sportId = null) {
    if (!userId) return false;

    try {
        // If no sport ID provided, use active sport
        if (!sportId) {
            const context = await getSportContext(userId);
            sportId = context?.sportId;
        }

        if (!sportId) return false;

        const { data, error } = await supabase
            .from('profile_club_sports')
            .select('role')
            .eq('user_id', userId)
            .eq('sport_id', sportId)
            .maybeSingle();

        if (error || !data) return false;

        return data?.role === 'coach' || data?.role === 'head_coach';

    } catch (error) {
        return false;
    }
}

/**
 * Get the club ID for a user in a specific sport
 * This is important because a user can be in different clubs for different sports
 *
 * @param {string} userId - The user ID
 * @param {string} sportId - The sport ID
 * @returns {Promise<string|null>} Club ID or null
 */
export async function getClubIdForSport(userId, sportId) {
    if (!userId || !sportId) return null;

    try {
        const { data, error } = await supabase
            .from('profile_club_sports')
            .select('club_id')
            .eq('user_id', userId)
            .eq('sport_id', sportId)
            .maybeSingle();

        if (error || !data) return null;

        return data?.club_id || null;

    } catch (error) {
        return null;
    }
}

/**
 * Reload sport context after switching sport
 * Call this from settings when user changes their active sport
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
