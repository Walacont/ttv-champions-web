// Leaderboard Module - Supabase Version
// SC Champions - Migration von Firebase zu Supabase
// Updated for multi-sport support - leaderboards filter by active sport

import { getSupabase } from './supabase-init.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';
import { RANK_ORDER, groupPlayersByRank } from './ranks.js';
import { loadDoublesLeaderboard } from './doubles-matches-supabase.js';
import { getSportContext, getUsersInSport } from './sport-context-supabase.js';

/**
 * Leaderboard Module - Supabase Version
 * Handles leaderboards: Skill (ELO), Effort (XP), Season (Points)
 * Multi-sport support: Leaderboards show only players from the active sport
 */

const supabase = getSupabase();

// Constants
export const LEAGUES = {
    diamond: { name: 'Diamant', minElo: 1400, color: 'text-cyan-400', bgColor: 'bg-cyan-100', icon: '💎' },
    platinum: { name: 'Platin', minElo: 1200, color: 'text-gray-300', bgColor: 'bg-gray-100', icon: '🏆' },
    gold: { name: 'Gold', minElo: 1000, color: 'text-yellow-500', bgColor: 'bg-yellow-100', icon: '🥇' },
    silver: { name: 'Silber', minElo: 800, color: 'text-gray-400', bgColor: 'bg-gray-50', icon: '🥈' },
    bronze: { name: 'Bronze', minElo: 0, color: 'text-amber-600', bgColor: 'bg-amber-50', icon: '🥉' },
};

export const PROMOTION_COUNT = 4;
export const DEMOTION_COUNT = 4;

// State
let currentLeaderboardSubgroupFilter = 'all';
let currentLeaderboardGenderFilter = 'all';
let currentLeaderboardSportId = null; // Sport filter for multi-sport support
let leaderboardSubscriptions = [];
let currentActiveTab = 'effort';

// Cache for test club filtering
let testClubIdsCache = null;
let currentUserDataCache = null;

/**
 * Filter players based on privacy settings
 * @param {Array} players - Array of player objects
 * @param {string} currentUserId - Current user's ID
 * @param {string} currentUserClubId - Current user's club ID
 * @returns {Object} { filteredPlayers, currentUserHidden } - Filtered players and whether current user is hidden
 */
function filterPlayersByPrivacy(players, currentUserId, currentUserClubId) {
    let currentUserHidden = false;

    console.log('[Privacy Filter] Starting filter with', players.length, 'players');
    console.log('[Privacy Filter] Current user ID:', currentUserId);
    console.log('[Privacy Filter] Current user club ID:', currentUserClubId);

    const filteredPlayers = players.filter(player => {
        const privacySettings = player.privacySettings || {};
        const showInLeaderboards = privacySettings.showInLeaderboards !== false; // Default: true
        const searchable = privacySettings.searchable || 'global'; // Default: global

        // Check if this is the current user
        const isCurrentUser = player.id === currentUserId;

        // Debug log for each player
        console.log('[Privacy Filter] Player:', player.firstName, player.lastName,
            '| showInLeaderboards:', showInLeaderboards,
            '| searchable:', searchable,
            '| isCurrentUser:', isCurrentUser,
            '| raw privacySettings:', JSON.stringify(privacySettings));

        // If player has disabled leaderboard visibility
        if (!showInLeaderboards) {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true; // Still show current user to themselves
            }
            console.log('[Privacy Filter] HIDING', player.firstName, '- showInLeaderboards is false');
            return false; // Hide from others
        }

        // If player is only visible to club members
        if (searchable === 'club_only') {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true; // Still show current user to themselves
            }
            // Only show if viewer is in the same club
            if (currentUserClubId && player.clubId === currentUserClubId) {
                console.log('[Privacy Filter] SHOWING', player.firstName, '- same club');
                return true;
            }
            console.log('[Privacy Filter] HIDING', player.firstName, '- club_only and different club');
            return false; // Hide from non-club members
        }

        // Global visibility - show to everyone
        return true;
    });

    console.log('[Privacy Filter] Filtered from', players.length, 'to', filteredPlayers.length, 'players');
    return { filteredPlayers, currentUserHidden };
}

/**
 * Load test club IDs for filtering
 */
async function loadTestClubIds() {
    if (testClubIdsCache !== null) return testClubIdsCache;

    try {
        const { data: clubs, error } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        if (error) {
            console.error('[Leaderboard] Error loading test club IDs:', error);
            testClubIdsCache = [];
            return testClubIdsCache;
        }

        testClubIdsCache = (clubs || [])
            .filter(c => c.is_test_club === true)
            .map(c => c.id);

        console.log('[Leaderboard] Test club IDs loaded:', testClubIdsCache);
        return testClubIdsCache;
    } catch (error) {
        console.error('[Leaderboard] Exception loading test club IDs:', error);
        testClubIdsCache = [];
        return testClubIdsCache;
    }
}

/**
 * Load current user data for test club filtering
 */
async function loadCurrentUserData(userId) {
    if (currentUserDataCache && currentUserDataCache.id === userId) {
        return currentUserDataCache;
    }

    const { data } = await supabase
        .from('profiles')
        .select('id, club_id, role')
        .eq('id', userId)
        .single();

    currentUserDataCache = data;
    return data;
}

/**
 * Filter players from test clubs
 * - Players from test clubs are hidden from the leaderboard
 * - Exception: Coach of the same test club can see all players
 */
async function filterTestClubPlayers(players, currentUserId) {
    const testClubIds = await loadTestClubIds();

    // If no test clubs exist, return all players
    if (testClubIds.length === 0) {
        console.log('[Leaderboard] No test clubs found, showing all players');
        return players;
    }

    const currentUser = currentUserId ? await loadCurrentUserData(currentUserId) : null;
    const isCoach = currentUser && (currentUser.role === 'coach' || currentUser.role === 'head_coach');
    const currentUserClubId = currentUser?.club_id;
    const isCurrentUserInTestClub = currentUserClubId && testClubIds.includes(currentUserClubId);

    console.log('[Leaderboard] Filter context:', {
        currentUserId,
        currentUserClubId,
        isCoach,
        isCurrentUserInTestClub,
        testClubIds,
        totalPlayers: players.length
    });

    const filteredPlayers = players.filter(player => {
        const playerClubId = player.clubId || player.club_id;

        // If player is not in a test club, show them
        if (!playerClubId || !testClubIds.includes(playerClubId)) {
            return true;
        }

        // Player is in a test club
        // If current user is a coach of the same test club, show the player
        if (isCoach && isCurrentUserInTestClub && currentUserClubId === playerClubId) {
            return true;
        }

        // Hide players from test clubs for everyone else
        return false;
    });

    console.log('[Leaderboard] Filtered players:', filteredPlayers.length, 'from', players.length);
    return filteredPlayers;
}

/**
 * Clear test club cache (call when user changes)
 */
export function clearTestClubCache() {
    testClubIdsCache = null;
    currentUserDataCache = null;
}

/**
 * Set subgroup filter for leaderboard
 */
export function setLeaderboardSubgroupFilter(subgroupId) {
    currentLeaderboardSubgroupFilter = subgroupId;
}

/**
 * Set gender filter for leaderboard
 */
export function setLeaderboardGenderFilter(genderId) {
    currentLeaderboardGenderFilter = genderId;
}

/**
 * Set sport filter for leaderboard (multi-sport support)
 * When set, leaderboard only shows players from this sport
 */
export function setLeaderboardSportFilter(sportId) {
    currentLeaderboardSportId = sportId;
    console.log('[Leaderboard] Sport filter set:', sportId);
}

/**
 * Get current sport filter
 */
export function getLeaderboardSportFilter() {
    return currentLeaderboardSportId;
}

/**
 * Get league info based on ELO rating
 */
export function getLeague(eloRating) {
    const elo = eloRating || 1000;
    if (elo >= LEAGUES.diamond.minElo) return LEAGUES.diamond;
    if (elo >= LEAGUES.platinum.minElo) return LEAGUES.platinum;
    if (elo >= LEAGUES.gold.minElo) return LEAGUES.gold;
    if (elo >= LEAGUES.silver.minElo) return LEAGUES.silver;
    return LEAGUES.bronze;
}

/**
 * Load club leaderboard (Skill - ELO based)
 * Multi-sport: If sport filter is set, shows only players in that sport
 */
export async function loadSkillLeaderboard(clubId, currentUserId, containerId = 'skill-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        // Build query with direct sport and club filters (single sport model)
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, elo_rating, highest_elo, avatar_url, role, subgroup_ids, xp, points, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('elo_rating', { ascending: false });

        // Filter by sport if set
        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
            console.log('[Leaderboard] Sport filter active:', currentLeaderboardSportId);
        }

        // Filter by club if set
        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin') // Extra safety: exclude admins client-side
            .map(p => ({
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                eloRating: p.elo_rating || 800,
                highestElo: p.highest_elo,
                photoURL: p.avatar_url,
                role: p.role,
                subgroupIDs: p.subgroup_ids || [],
                xp: p.xp || 0,
                points: p.points || 0,
                birthdate: p.birthdate,
                gender: p.gender,
                clubId: p.club_id || clubId,
                privacySettings: p.privacy_settings || {}
            }));

        // Apply filters
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(p => p.subgroupIDs.includes(currentLeaderboardSubgroupFilter));
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        // Filter out players from test clubs (except for coaches of the same test club)
        players = await filterTestClubPlayers(players, currentUserId);

        // Filter by privacy settings (showInLeaderboards)
        const currentUserClubId = clubId;
        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(players, currentUserId, currentUserClubId);
        players = filteredPlayers;

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderLeaderboardList(container, players, currentUserId, 'elo', currentUserHidden);
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading skill leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Load club leaderboard (Effort - XP based)
 * Multi-sport: If sport filter is set, shows only players in that sport
 */
export async function loadEffortLeaderboard(clubId, currentUserId, containerId = 'effort-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        // Build query (single sport model)

        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, xp, avatar_url, role, subgroup_ids, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('xp', { ascending: false });

        // Filter by sport if set
        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
        }

        // Filter by club if set
        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin') // Extra safety: exclude admins client-side
            .map(p => ({
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                xp: p.xp || 0,
                photoURL: p.avatar_url,
                role: p.role,
                subgroupIDs: p.subgroup_ids || [],
                birthdate: p.birthdate,
                gender: p.gender,
                clubId: p.club_id || clubId,
                privacySettings: p.privacy_settings || {}
            }));

        // Apply filters
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(p => p.subgroupIDs.includes(currentLeaderboardSubgroupFilter));
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        // Filter out players from test clubs (except for coaches of the same test club)
        players = await filterTestClubPlayers(players, currentUserId);

        // Filter by privacy settings (showInLeaderboards)
        const currentUserClubId = clubId;
        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(players, currentUserId, currentUserClubId);
        players = filteredPlayers;

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderLeaderboardList(container, players, currentUserId, 'xp', currentUserHidden);
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading effort leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Load season leaderboard (Points based)
 * Multi-sport: If sport filter is set, shows only players in that sport
 */
export async function loadSeasonLeaderboard(clubId, currentUserId, containerId = 'season-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        // Build query (single sport model)

        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, points, avatar_url, role, subgroup_ids, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('points', { ascending: false });

        // Filter by sport if set
        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
        }

        // Filter by club if set
        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin') // Extra safety: exclude admins client-side
            .map(p => ({
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                points: p.points || 0,
                photoURL: p.avatar_url,
                role: p.role,
                subgroupIDs: p.subgroup_ids || [],
                birthdate: p.birthdate,
                gender: p.gender,
                clubId: p.club_id || clubId,
                privacySettings: p.privacy_settings || {}
            }));

        // Apply filters
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(p => p.subgroupIDs.includes(currentLeaderboardSubgroupFilter));
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        // Filter out players from test clubs (except for coaches of the same test club)
        players = await filterTestClubPlayers(players, currentUserId);

        // Filter by privacy settings (showInLeaderboards)
        const currentUserClubId = clubId;
        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(players, currentUserId, currentUserClubId);
        players = filteredPlayers;

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderLeaderboardList(container, players, currentUserId, 'points', currentUserHidden);
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading season leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Load global leaderboard (all clubs) - both Skill and Doubles
 * Supports both old signature (userData, supabaseClient, unsubscribes) and new signature (currentUserId, containerId, limit)
 */
export async function loadGlobalLeaderboard(userDataOrId, supabaseClientOrContainerId = 'skill-list-global', unsubscribesOrLimit = 100) {
    // Detect which signature is being used
    let currentUserId;
    let containerId = 'skill-list-global';
    let limit = 100;
    let userData = null;

    if (typeof userDataOrId === 'object' && userDataOrId !== null && userDataOrId.id) {
        // Old signature: (userData, supabaseClient, unsubscribes)
        currentUserId = userDataOrId.id;
        userData = userDataOrId;
    } else {
        // New signature: (currentUserId, containerId, limit)
        currentUserId = userDataOrId;
        if (typeof supabaseClientOrContainerId === 'string') {
            containerId = supabaseClientOrContainerId;
        }
        if (typeof unsubscribesOrLimit === 'number') {
            limit = unsubscribesOrLimit;
        }
    }

    // Load global skill leaderboard
    await loadGlobalSkillLeaderboardInternal(currentUserId, containerId, limit);

    // Also load global doubles leaderboard if called with userData (old signature)
    if (userData) {
        loadGlobalDoublesLeaderboard(userData);
    }
}

/**
 * Internal function to load global skill leaderboard
 * Shows top 100 players + current user's position if not in top 100
 * Multi-sport: Uses user_sport_stats for sport-specific ELO and filtering
 * Only shows players with matches_played > 0 (after first match in sport)
 */
async function loadGlobalSkillLeaderboardInternal(currentUserId, containerId = 'skill-list-global', limit = 100) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        let allPlayers = [];

        // Try to use sport-specific stats table first
        if (currentLeaderboardSportId) {
            // Get sport-specific stats (only players with matches_played > 0)
            const { data: sportStats, error: statsError } = await supabase
                .from('user_sport_stats')
                .select(`
                    user_id,
                    elo_rating,
                    highest_elo,
                    wins,
                    losses,
                    matches_played,
                    profiles!inner(
                        id, first_name, last_name, avatar_url, role,
                        club_id, clubs(name), subgroup_ids, birthdate, gender, privacy_settings
                    )
                `)
                .eq('sport_id', currentLeaderboardSportId)
                .gt('matches_played', 0)  // Only show after first match
                .order('elo_rating', { ascending: false });

            if (!statsError && sportStats && sportStats.length > 0) {
                console.log('[Leaderboard] Using sport-specific stats, players:', sportStats.length);

                // Single sport model: club info is already in profiles
                allPlayers = sportStats.map(ss => {
                    const p = ss.profiles;
                    return {
                        id: p.id,
                        firstName: p.first_name,
                        lastName: p.last_name,
                        eloRating: ss.elo_rating || 800,
                        highestElo: ss.highest_elo || 800,
                        photoURL: p.avatar_url,
                        role: p.role,
                        clubId: p.club_id,
                        clubName: p.clubs?.name || 'Kein Verein',
                        subgroupIDs: p.subgroup_ids || [],
                        birthdate: p.birthdate,
                        gender: p.gender,
                        privacySettings: p.privacy_settings || {},
                        matchesPlayed: ss.matches_played
                    };
                });
            } else {
                // Fallback: user_sport_stats table might not exist yet
                console.log('[Leaderboard] Falling back to profiles query');
                allPlayers = await loadLeaderboardFallback(currentLeaderboardSportId);
            }
        } else {
            // No sport filter - use fallback (all sports)
            allPlayers = await loadLeaderboardFallback(null);
        }

        if (allPlayers.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Sportart gefunden.</div>';
            return [];
        }

        // Apply filters
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                allPlayers = filterPlayersByAgeGroup(allPlayers, currentLeaderboardSubgroupFilter);
            } else if (!isGenderFilter(currentLeaderboardSubgroupFilter)) {
                // Custom subgroup filter (not age group, not gender)
                allPlayers = allPlayers.filter(p => p.subgroupIDs.includes(currentLeaderboardSubgroupFilter));
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            allPlayers = filterPlayersByGender(allPlayers, currentLeaderboardGenderFilter);
        }

        // Filter out players from test clubs (except for coaches of the same test club)
        allPlayers = await filterTestClubPlayers(allPlayers, currentUserId);

        // Get current user's club ID for privacy filtering
        const currentUserProfile = allPlayers.find(p => p.id === currentUserId);
        const currentUserClubId = currentUserProfile?.clubId;

        // Filter by privacy settings (showInLeaderboards and searchable)
        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(allPlayers, currentUserId, currentUserClubId);
        allPlayers = filteredPlayers;

        if (allPlayers.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        // Find current user's rank (after filtering)
        const currentUserRank = allPlayers.findIndex(p => p.id === currentUserId) + 1;
        const currentUserData = allPlayers.find(p => p.id === currentUserId);

        // Get top 100
        const top100 = allPlayers.slice(0, limit);

        // Check if current user is in top 100
        const isCurrentUserInTop = currentUserRank > 0 && currentUserRank <= limit;

        renderGlobalLeaderboardList(container, top100, currentUserId, currentUserRank, currentUserData, isCurrentUserInTop, currentUserHidden);
        return allPlayers;

    } catch (error) {
        console.error('[Leaderboard] Error loading global leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Fallback function to load leaderboard from profiles table
 * Used when user_sport_stats table doesn't exist or is empty
 * Single sport model: filter by profiles.active_sport_id directly
 */
async function loadLeaderboardFallback(sportId) {
    // Fetch all players from profiles
    let query = supabase
        .from('profiles')
        .select(`
            id, first_name, last_name, elo_rating, highest_elo, avatar_url, role,
            club_id, clubs:club_id(name), subgroup_ids, birthdate, gender, privacy_settings
        `)
        .in('role', ['player', 'coach', 'head_coach'])
        .order('elo_rating', { ascending: false });

    // Apply sport filter (single sport model)
    if (sportId) {
        query = query.eq('active_sport_id', sportId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || [])
        .filter(p => p.role !== 'admin') // Extra safety: exclude admins client-side
        .map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            eloRating: p.elo_rating || 800,
            highestElo: p.highest_elo,
            photoURL: p.avatar_url,
            role: p.role,
            clubId: p.club_id,
            clubName: p.clubs?.name || 'Kein Verein',
            subgroupIDs: p.subgroup_ids || [],
            birthdate: p.birthdate,
            gender: p.gender,
            privacySettings: p.privacy_settings || {}
        }));
}

/**
 * Loads the global Doubles leaderboard
 */
function loadGlobalDoublesLeaderboard(userData) {
    const listEl = document.getElementById('doubles-list-global');
    if (!listEl) return;

    try {
        // Load global doubles leaderboard (null clubId = global)
        // Pass sport filter to only show doubles from current sport
        loadDoublesLeaderboard(null, supabase, listEl, [], userData.id, true, currentLeaderboardSportId);
    } catch (error) {
        console.error('[Leaderboard] Error loading global doubles leaderboard:', error);
        listEl.innerHTML = '<p class="text-center text-red-500 py-8">Fehler beim Laden der globalen Doppel-Rangliste.</p>';
    }
}

/**
 * Render leaderboard list
 */
function renderLeaderboardList(container, players, currentUserId, type = 'elo', currentUserHidden = false) {
    container.innerHTML = '';

    // Show privacy notice if current user is hidden from others
    if (currentUserHidden) {
        const notice = document.createElement('div');
        notice.className = 'bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 rounded-r-lg';
        notice.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-eye-slash text-amber-500 mt-0.5 mr-2"></i>
                <div class="text-sm text-amber-700">
                    <strong>Du bist für andere nicht sichtbar.</strong><br>
                    Deine Datenschutz-Einstellungen verbergen dich in der Rangliste für andere Spieler.
                    <a href="/settings.html" class="text-amber-800 underline hover:text-amber-900">Einstellungen ändern</a>
                </div>
            </div>
        `;
        container.appendChild(notice);
    }

    players.forEach((player, index) => {
        const rank = index + 1;
        const isCurrentUser = player.id === currentUserId;
        const league = type === 'elo' ? getLeague(player.eloRating) : null;

        const row = document.createElement('div');
        row.className = `flex items-center justify-between p-3 ${isCurrentUser ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'bg-white'}
            ${index < players.length - 1 ? 'border-b' : ''} hover:bg-gray-50 transition-colors`;

        const value = type === 'elo' ? player.eloRating :
                      type === 'xp' ? player.xp :
                      player.points;

        const label = type === 'elo' ? 'ELO' :
                      type === 'xp' ? 'XP' :
                      'Punkte';

        // Show hidden icon if current user is hidden
        const hiddenIcon = isCurrentUser && currentUserHidden ? '<i class="fas fa-eye-slash text-amber-500 ml-1" title="Für andere nicht sichtbar"></i>' : '';

        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-8 text-center font-bold ${rank <= 3 ? 'text-lg' : 'text-sm text-gray-500'}">
                    ${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                </span>
                <img src="${player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${(player.firstName?.[0] || '?')}`}"
                     alt="${player.firstName || ''} ${player.lastName || ''}"
                     class="w-10 h-10 rounded-full object-cover">
                <div>
                    <p class="font-medium ${isCurrentUser ? 'text-indigo-700' : 'text-gray-800'}">
                        ${player.firstName || ''} ${player.lastName || ''}
                        ${isCurrentUser ? '<span class="text-xs text-indigo-500">(Du)</span>' : ''}
                        ${hiddenIcon}
                    </p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-gray-800">${Math.round(value)}</p>
                <p class="text-xs text-gray-500">${label}</p>
            </div>
        `;

        container.appendChild(row);
    });
}

/**
 * Render global leaderboard list (with club names)
 * Shows top players + current user's position at the bottom if not in top list
 */
function renderGlobalLeaderboardList(container, players, currentUserId, currentUserRank = 0, currentUserData = null, isCurrentUserInTop = true, currentUserHidden = false) {
    container.innerHTML = '';

    // Show privacy notice if current user is hidden from others
    if (currentUserHidden) {
        const notice = document.createElement('div');
        notice.className = 'bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 rounded-r-lg';
        notice.innerHTML = `
            <div class="flex items-start">
                <i class="fas fa-eye-slash text-amber-500 mt-0.5 mr-2"></i>
                <div class="text-sm text-amber-700">
                    <strong>Du bist für andere nicht sichtbar.</strong><br>
                    Deine Datenschutz-Einstellungen verbergen dich in der globalen Rangliste für andere Spieler.
                    <a href="/settings.html" class="text-amber-800 underline hover:text-amber-900">Einstellungen ändern</a>
                </div>
            </div>
        `;
        container.appendChild(notice);
    }

    players.forEach((player, index) => {
        const rank = index + 1;
        const isCurrentUser = player.id === currentUserId;

        // Show hidden icon if current user is hidden
        const hiddenIcon = isCurrentUser && currentUserHidden ? '<i class="fas fa-eye-slash text-amber-500 ml-1" title="Für andere nicht sichtbar"></i>' : '';

        const row = document.createElement('div');
        row.className = `flex items-center justify-between p-3 ${isCurrentUser ? 'bg-indigo-50 border-l-4 border-indigo-500' : 'bg-white'}
            ${index < players.length - 1 ? 'border-b' : ''} hover:bg-gray-50 transition-colors`;

        row.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-8 text-center font-bold ${rank <= 3 ? 'text-lg' : 'text-sm text-gray-500'}">
                    ${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                </span>
                <img src="${player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${(player.firstName?.[0] || '?')}`}"
                     alt="${player.firstName || ''} ${player.lastName || ''}"
                     class="w-10 h-10 rounded-full object-cover">
                <div>
                    <p class="font-medium ${isCurrentUser ? 'text-indigo-700' : 'text-gray-800'}">
                        ${player.firstName || ''} ${player.lastName || ''}
                        ${isCurrentUser ? '<span class="text-xs text-indigo-500">(Du)</span>' : ''}
                        ${hiddenIcon}
                    </p>
                    <p class="text-xs text-gray-500">${player.clubName}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-gray-800">${Math.round(player.eloRating)}</p>
                <p class="text-xs text-gray-500">ELO</p>
            </div>
        `;

        container.appendChild(row);
    });

    // Show current user's position at bottom if not in top list
    if (!isCurrentUserInTop && currentUserData && currentUserRank > 0) {
        const separator = document.createElement('div');
        separator.className = 'border-t-2 border-dashed border-gray-300 my-4';
        container.appendChild(separator);

        const hiddenIcon = currentUserHidden ? '<i class="fas fa-eye-slash text-amber-500 ml-1" title="Für andere nicht sichtbar"></i>' : '';

        const userRow = document.createElement('div');
        userRow.className = 'flex items-center justify-between p-3 bg-indigo-50 border-l-4 border-indigo-500 rounded-lg';
        userRow.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="w-8 text-center font-bold text-sm text-gray-500">${currentUserRank}</span>
                <img src="${currentUserData.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${(currentUserData.firstName?.[0] || '?')}`}"
                     alt="${currentUserData.firstName || ''} ${currentUserData.lastName || ''}"
                     class="w-10 h-10 rounded-full object-cover">
                <div>
                    <p class="font-medium text-indigo-700">
                        ${currentUserData.firstName || ''} ${currentUserData.lastName || ''}
                        <span class="text-xs text-indigo-500">(Du)</span>
                        ${hiddenIcon}
                    </p>
                    <p class="text-xs text-gray-500">${currentUserData.clubName || 'Kein Verein'}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-gray-800">${Math.round(currentUserData.eloRating)}</p>
                <p class="text-xs text-gray-500">ELO</p>
            </div>
        `;
        container.appendChild(userRow);
    }
}

/**
 * Subscribe to leaderboard changes (real-time)
 */
export function subscribeToLeaderboard(clubId, callback) {
    const channel = supabase
        .channel(`leaderboard_${clubId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                callback();
            }
        )
        .subscribe();

    leaderboardSubscriptions.push(channel);
    return () => supabase.removeChannel(channel);
}

/**
 * Unsubscribe from all leaderboard channels
 */
export function unsubscribeFromLeaderboards() {
    leaderboardSubscriptions.forEach(channel => {
        supabase.removeChannel(channel);
    });
    leaderboardSubscriptions = [];
}

/**
 * Load all leaderboards for a club
 */
export async function loadAllLeaderboards(userData) {
    if (!userData.clubId) return;

    await Promise.all([
        loadSkillLeaderboard(userData.clubId, userData.id, 'skill-list-club'),
        loadEffortLeaderboard(userData.clubId, userData.id, 'effort-list-club'),
        loadSeasonLeaderboard(userData.clubId, userData.id, 'season-list-club'),
        loadGlobalLeaderboard(userData.id, 'skill-list-global')
    ]);
}

/**
 * Renders the leaderboard HTML structure
 */
export function renderLeaderboardHTML(containerId, options = {}) {
    const { showToggle = true, userData = null } = options;

    const hasClub = userData?.clubId && userData.clubId !== '' && userData.clubId !== 'null';
    const showEffortTab = hasClub ? (userData?.leaderboardPreferences?.showEffortTab !== false) : true;
    const showRanksTab = hasClub ? (userData?.leaderboardPreferences?.showRanksTab !== false) : true;
    const showSeasonTab = hasClub ? (userData?.leaderboardPreferences?.showSeasonTab !== false) : true;

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID "${containerId}" not found`);
        return;
    }

    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

            <div class="overflow-x-auto border-b border-gray-200 mb-4 -mx-6 px-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                <div class="flex justify-center min-w-max">
                    ${showEffortTab ? `
                    <button id="tab-effort" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Erfahrungspunkten (XP) - permanenter Fortschritt">
                        <div>Fleiß</div>
                        <div class="text-xs text-gray-500 font-normal">(XP)</div>
                    </button>
                    ` : ''}
                    ${showSeasonTab ? `
                    <button id="tab-season" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Saisonpunkten - aktuelle 6-Wochen-Saison">
                        <div>Season</div>
                        <div class="text-xs text-gray-500 font-normal">(Punkte)</div>
                    </button>
                    ` : ''}
                    <button id="tab-skill" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Elo-Rating - Spielstärke aus Wettkämpfen">
                        <div>Skill</div>
                        <div class="text-xs text-gray-500 font-normal">(Elo)</div>
                    </button>
                    ${showRanksTab ? `
                    <button id="tab-ranks" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Verteilung der Spieler nach Rängen">
                        <div>Ränge</div>
                        <div class="text-xs text-gray-500 font-normal">(Level)</div>
                    </button>
                    ` : ''}
                    <button id="tab-doubles" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Doppel-Paarungen Rangliste">
                        <div>Doppel</div>
                        <div class="text-xs text-gray-500 font-normal">(Teams)</div>
                    </button>
                </div>
            </div>

            ${showToggle ? `
                <div id="scope-toggle-container" class="mt-4 flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100">
                    <button id="toggle-club" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Mein Verein</button>
                    <button id="toggle-global" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Global</button>
                </div>
            ` : ''}

            <div id="content-skill" class="leaderboard-tab-content hidden">
                <div id="skill-club-container">
                    <div id="skill-list-club" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Lade Skill-Rangliste...</p>
                    </div>
                </div>
                ${showToggle ? `
                    <div id="skill-global-container" class="hidden">
                        <div id="skill-list-global" class="mt-6 space-y-2">
                            <p class="text-center text-gray-500 py-8">Lade globale Skill-Rangliste...</p>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div id="content-effort" class="leaderboard-tab-content hidden">
                <div id="effort-list-club" class="mt-6 space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Fleiß-Rangliste...</p>
                </div>
            </div>

            <div id="content-season" class="leaderboard-tab-content hidden">
                <div id="season-list-club" class="mt-6 space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Season-Rangliste...</p>
                </div>
            </div>

            <div id="content-ranks" class="leaderboard-tab-content hidden">
                <div id="ranks-list" class="mt-6 space-y-4">
                    <p class="text-center text-gray-500 py-8">Lade Level-Übersicht...</p>
                </div>
            </div>

            <div id="content-doubles" class="leaderboard-tab-content hidden">
                <div id="doubles-club-container">
                    <div id="doubles-list-club" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Lade Doppel-Rangliste...</p>
                    </div>
                </div>
                ${showToggle ? `
                    <div id="doubles-global-container" class="hidden">
                        <div id="doubles-list-global" class="mt-6 space-y-2">
                            <p class="text-center text-gray-500 py-8">Lade globale Doppel-Rangliste...</p>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * Sets up the leaderboard tabs click handlers
 */
export function setupLeaderboardTabs(userData = null) {
    const tabSkillBtn = document.getElementById('tab-skill');
    const tabEffortBtn = document.getElementById('tab-effort');
    const tabSeasonBtn = document.getElementById('tab-season');
    const tabRanksBtn = document.getElementById('tab-ranks');
    const tabDoublesBtn = document.getElementById('tab-doubles');
    const scopeToggleContainer = document.getElementById('scope-toggle-container');

    if (!tabSkillBtn || !tabEffortBtn || !tabSeasonBtn || !tabRanksBtn || !tabDoublesBtn) return;

    const hasClub = userData && userData.clubId !== null && userData.clubId !== undefined;

    const switchTab = tabName => {
        currentActiveTab = tabName;

        document.querySelectorAll('.leaderboard-tab-content').forEach(el => el.classList.add('hidden'));

        document.querySelectorAll('.leaderboard-tab-btn').forEach(btn => {
            btn.classList.remove('border-indigo-600', 'text-indigo-600');
            btn.classList.add('border-transparent', 'text-gray-600');
        });

        const selectedContent = document.getElementById(`content-${tabName}`);
        if (selectedContent) selectedContent.classList.remove('hidden');

        const selectedTab = document.getElementById(`tab-${tabName}`);
        if (selectedTab) {
            selectedTab.classList.add('border-indigo-600', 'text-indigo-600');
            selectedTab.classList.remove('border-transparent', 'text-gray-600');
        }

        if (scopeToggleContainer) {
            if (tabName === 'skill' || tabName === 'doubles') {
                scopeToggleContainer.classList.remove('hidden');
            } else {
                scopeToggleContainer.classList.add('hidden');
            }
        }

        if (!hasClub && (tabName === 'skill' || tabName === 'doubles')) {
            const clubContainer = document.getElementById(`${tabName}-club-container`);
            const globalContainer = document.getElementById(`${tabName}-global-container`);
            if (clubContainer) clubContainer.classList.add('hidden');
            if (globalContainer) globalContainer.classList.remove('hidden');

            const toggleClubBtn = document.getElementById('toggle-club');
            const toggleGlobalBtn = document.getElementById('toggle-global');
            if (toggleClubBtn) toggleClubBtn.classList.remove('toggle-btn-active');
            if (toggleGlobalBtn) toggleGlobalBtn.classList.add('toggle-btn-active');
        }
    };

    tabSkillBtn.addEventListener('click', () => switchTab('skill'));
    tabEffortBtn.addEventListener('click', () => switchTab('effort'));
    tabSeasonBtn.addEventListener('click', () => switchTab('season'));
    tabRanksBtn.addEventListener('click', () => switchTab('ranks'));
    tabDoublesBtn.addEventListener('click', () => switchTab('doubles'));

    const defaultTab = hasClub ? 'effort' : 'skill';
    switchTab(defaultTab);
}

/**
 * Sets up the club/global toggle for Skill and Doubles tabs
 */
export function setupLeaderboardToggle(userData = null) {
    const toggleClubBtn = document.getElementById('toggle-club');
    const toggleGlobalBtn = document.getElementById('toggle-global');

    if (!toggleClubBtn || !toggleGlobalBtn) return;

    const hasClub = userData && userData.clubId !== null && userData.clubId !== undefined;

    if (!hasClub) {
        toggleClubBtn.style.display = 'none';
    }

    const switchScope = scope => {
        const tab = currentActiveTab;

        if (scope === 'club' && hasClub) {
            toggleClubBtn.classList.add('toggle-btn-active');
            toggleGlobalBtn.classList.remove('toggle-btn-active');

            const clubContainer = document.getElementById(`${tab}-club-container`);
            const globalContainer = document.getElementById(`${tab}-global-container`);
            if (clubContainer) clubContainer.classList.remove('hidden');
            if (globalContainer) globalContainer.classList.add('hidden');
        } else {
            toggleGlobalBtn.classList.add('toggle-btn-active');
            toggleClubBtn.classList.remove('toggle-btn-active');

            const clubContainer = document.getElementById(`${tab}-club-container`);
            const globalContainer = document.getElementById(`${tab}-global-container`);
            if (clubContainer) clubContainer.classList.add('hidden');
            if (globalContainer) globalContainer.classList.remove('hidden');
        }
    };

    toggleClubBtn.addEventListener('click', () => switchScope('club'));
    toggleGlobalBtn.addEventListener('click', () => switchScope('global'));

    switchScope(hasClub ? 'club' : 'global');
}

/**
 * Loads all leaderboards (wrapper for compatibility)
 */
export async function loadLeaderboard(userData, supabaseClient, unsubscribes) {
    if (!userData.clubId) return;

    await Promise.all([
        loadSkillLeaderboard(userData.clubId, userData.id, 'skill-list-club'),
        loadEffortLeaderboard(userData.clubId, userData.id, 'effort-list-club'),
        loadSeasonLeaderboard(userData.clubId, userData.id, 'season-list-club'),
        loadRanksView(userData),
    ]);
    loadDoublesLeaderboardTab(userData);
}

/**
 * Loads the Ranks view showing players grouped by rank
 * Multi-sport: If sport filter is set, shows only players in that sport
 */
async function loadRanksView(userData) {
    const listEl = document.getElementById('ranks-list');
    if (!listEl) return;

    try {
        // Build query (single sport model)
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, elo_rating, xp, avatar_url, role, subgroup_ids, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach']);

        // Filter by sport if set
        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
        }

        // Filter by club if set
        if (userData.clubId) {
            query = query.eq('club_id', userData.clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin') // Extra safety: exclude admins client-side
            .map(p => ({
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                eloRating: p.elo_rating || 800,
                xp: p.xp || 0,
                photoURL: p.avatar_url,
                role: p.role,
                subgroupIDs: p.subgroup_ids || [],
                birthdate: p.birthdate,
                gender: p.gender,
                clubId: p.club_id || userData.clubId,
                privacySettings: p.privacy_settings || {}
            }));

        // Apply filters
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(p => p.subgroupIDs.includes(currentLeaderboardSubgroupFilter));
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        // Filter out players from test clubs (except for coaches of the same test club)
        players = await filterTestClubPlayers(players, userData.id);

        // Filter by privacy settings (showInLeaderboards)
        const currentUserClubId = userData.clubId;
        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(players, userData.id, currentUserClubId);
        players = filteredPlayers;

        if (players.length === 0) {
            listEl.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>';
            return;
        }

        const grouped = groupPlayersByRank(players);
        listEl.innerHTML = '';

        // Show privacy notice if current user is hidden from others
        if (currentUserHidden) {
            const notice = document.createElement('div');
            notice.className = 'bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 rounded-r-lg';
            notice.innerHTML = `
                <div class="flex items-start">
                    <i class="fas fa-eye-slash text-amber-500 mt-0.5 mr-2"></i>
                    <div class="text-sm text-amber-700">
                        <strong>Du bist für andere nicht sichtbar.</strong><br>
                        Deine Datenschutz-Einstellungen verbergen dich in der Rangliste für andere Spieler.
                        <a href="/settings.html" class="text-amber-800 underline hover:text-amber-900">Einstellungen ändern</a>
                    </div>
                </div>
            `;
            listEl.appendChild(notice);
        }

        // Display ranks from highest to lowest
        for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
            const rank = RANK_ORDER[i];
            const playersInRank = grouped[rank.id] || [];

            if (playersInRank.length === 0) continue;

            // Sort by XP within rank
            playersInRank.sort((a, b) => (b.xp || 0) - (a.xp || 0));

            const rankSection = document.createElement('div');
            rankSection.className = 'rank-section';
            rankSection.innerHTML = `
                <div class="flex items-center justify-between p-3 rounded-lg" style="background-color: ${rank.color}20; border-left: 4px solid ${rank.color};">
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${rank.emoji}</span>
                        <span class="font-bold text-lg" style="color: ${rank.color};">${rank.name}</span>
                    </div>
                    <span class="text-sm text-gray-600">${playersInRank.length} Spieler</span>
                </div>
                <div class="mt-2 space-y-1 pl-4">
                    ${playersInRank.map(player => {
                        const isCurrentUser = player.id === userData.id;
                        const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                        const avatarSrc = player.photoURL || `https://placehold.co/32x32/e2e8f0/64748b?text=${initials}`;
                        const playerName = `${player.firstName || ''} ${player.lastName || ''}`.trim() || 'Unbekannt';
                        const hiddenIcon = isCurrentUser && currentUserHidden ? '<i class="fas fa-eye-slash text-amber-500 ml-1" title="Für andere nicht sichtbar"></i>' : '';

                        return `
                            <div class="flex items-center p-2 rounded ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}">
                                <img src="${avatarSrc}" alt="Avatar" class="h-8 w-8 rounded-full object-cover mr-3" onerror="this.src='https://placehold.co/32x32/e2e8f0/64748b?text=${initials}'">
                                <div class="flex-grow">
                                    <p class="text-sm">${playerName}${hiddenIcon}</p>
                                </div>
                                <div class="text-xs text-gray-600">
                                    ${player.eloRating || 0} Elo | ${player.xp || 0} XP
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            listEl.appendChild(rankSection);
        }

    } catch (error) {
        console.error('[Leaderboard] Error loading ranks view:', error);
        listEl.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
    }
}

/**
 * Loads the Doubles leaderboard tab
 */
function loadDoublesLeaderboardTab(userData) {
    const listEl = document.getElementById('doubles-list-club');
    if (!listEl) return;

    try {
        // Pass sport filter to only show doubles from current sport
        loadDoublesLeaderboard(userData.clubId, supabase, listEl, [], userData.id, false, currentLeaderboardSportId);
    } catch (error) {
        console.error('[Leaderboard] Error loading doubles leaderboard:', error);
        listEl.innerHTML = '<p class="text-center text-red-500 py-8">Fehler beim Laden der Doppel-Rangliste.</p>';
    }
}

/**
 * @deprecated This function is deprecated and will be removed in future versions.
 * Use the new 3-tab leaderboard system instead.
 */
export function loadLeaderboardForCoach(clubId, leagueToShow, supabase, unsubscribeCallback) {
    console.warn(
        'loadLeaderboardForCoach is deprecated. Please update to use the new 3-tab leaderboard system.'
    );
}
