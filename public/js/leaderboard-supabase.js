// Leaderboard Module - Supabase Version
// SC Champions - Migration von Firebase zu Supabase

import { getSupabase } from './supabase-init.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

/**
 * Leaderboard Module - Supabase Version
 * Handles leaderboards: Skill (ELO), Effort (XP), Season (Points)
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
let leaderboardSubscriptions = [];

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
 */
export async function loadSkillLeaderboard(clubId, currentUserId, containerId = 'skill-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, elo_rating, highest_elo, photo_url, role, subgroup_ids, xp, points')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach'])
            .order('elo_rating', { ascending: false });

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            eloRating: p.elo_rating || 1000,
            highestElo: p.highest_elo,
            photoURL: p.photo_url,
            role: p.role,
            subgroupIDs: p.subgroup_ids || [],
            xp: p.xp || 0,
            points: p.points || 0
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

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderLeaderboardList(container, players, currentUserId, 'elo');
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading skill leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Load club leaderboard (Effort - XP based)
 */
export async function loadEffortLeaderboard(clubId, currentUserId, containerId = 'effort-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, xp, photo_url, role, subgroup_ids')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach'])
            .order('xp', { ascending: false });

        if (error) throw error;

        let players = (data || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            xp: p.xp || 0,
            photoURL: p.photo_url,
            role: p.role,
            subgroupIDs: p.subgroup_ids || []
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

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderLeaderboardList(container, players, currentUserId, 'xp');
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading effort leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Load season leaderboard (Points based)
 */
export async function loadSeasonLeaderboard(clubId, currentUserId, containerId = 'season-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, points, photo_url, role, subgroup_ids')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach'])
            .order('points', { ascending: false });

        if (error) throw error;

        let players = (data || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            points: p.points || 0,
            photoURL: p.photo_url,
            role: p.role,
            subgroupIDs: p.subgroup_ids || []
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

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderLeaderboardList(container, players, currentUserId, 'points');
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading season leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Load global leaderboard (all clubs)
 */
export async function loadGlobalLeaderboard(currentUserId, containerId = 'skill-list-global', limit = 100) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                id, first_name, last_name, elo_rating, highest_elo, photo_url, role,
                club_id, clubs(name)
            `)
            .in('role', ['player', 'coach'])
            .order('elo_rating', { ascending: false })
            .limit(limit);

        if (error) throw error;

        const players = (data || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            eloRating: p.elo_rating || 1000,
            highestElo: p.highest_elo,
            photoURL: p.photo_url,
            role: p.role,
            clubId: p.club_id,
            clubName: p.clubs?.name || 'Kein Verein'
        }));

        if (players.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        renderGlobalLeaderboardList(container, players, currentUserId);
        return players;

    } catch (error) {
        console.error('[Leaderboard] Error loading global leaderboard:', error);
        container.innerHTML = '<div class="text-center py-8 text-red-500">Fehler beim Laden.</div>';
        return [];
    }
}

/**
 * Render leaderboard list
 */
function renderLeaderboardList(container, players, currentUserId, type = 'elo') {
    container.innerHTML = '';

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
                    </p>
                    ${league ? `<p class="text-xs ${league.color}">${league.icon} ${league.name}</p>` : ''}
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold ${type === 'elo' ? league?.color || 'text-gray-800' : 'text-gray-800'}">${Math.round(value)}</p>
                <p class="text-xs text-gray-500">${label}</p>
            </div>
        `;

        container.appendChild(row);
    });
}

/**
 * Render global leaderboard list (with club names)
 */
function renderGlobalLeaderboardList(container, players, currentUserId) {
    container.innerHTML = '';

    players.forEach((player, index) => {
        const rank = index + 1;
        const isCurrentUser = player.id === currentUserId;
        const league = getLeague(player.eloRating);

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
                    </p>
                    <p class="text-xs text-gray-500">${player.clubName}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold ${league.color}">${Math.round(player.eloRating)}</p>
                <p class="text-xs ${league.color}">${league.icon} ${league.name}</p>
            </div>
        `;

        container.appendChild(row);
    });
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
