// Ranglisten-Modul - Supabase-Version
// Verwaltet Ranglisten: Skill (ELO), Fleiß (XP), Season (Punkte)

import { getSupabase } from './supabase-init.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils-supabase.js';
import { RANK_ORDER, groupPlayersByRank } from './ranks.js';
import { loadDoublesLeaderboard } from './doubles-matches-supabase.js';
import { getSportContext, getUsersInSport } from './sport-context-supabase.js';

/**
 * Leaderboard Modul mit Multi-Sport-Unterstützung
 * Zeigt nur Spieler der aktiven Sportart
 */

const supabase = getSupabase();

export const LEAGUES = {
    diamond: { name: 'Diamant', minElo: 1400, color: 'text-cyan-400', bgColor: 'bg-cyan-100', icon: '💎' },
    platinum: { name: 'Platin', minElo: 1200, color: 'text-gray-300', bgColor: 'bg-gray-100', icon: '🏆' },
    gold: { name: 'Gold', minElo: 1000, color: 'text-yellow-500', bgColor: 'bg-yellow-100', icon: '🥇' },
    silver: { name: 'Silber', minElo: 800, color: 'text-gray-400', bgColor: 'bg-gray-50', icon: '🥈' },
    bronze: { name: 'Bronze', minElo: 0, color: 'text-amber-600', bgColor: 'bg-amber-50', icon: '🥉' },
};

export const PROMOTION_COUNT = 4;
export const DEMOTION_COUNT = 4;

let currentLeaderboardSubgroupFilter = 'all';
let currentLeaderboardGenderFilter = 'all';
let currentLeaderboardSportId = null;
let leaderboardSubscriptions = [];
let currentActiveTab = 'effort';

// Cache um wiederholte Datenbankabfragen zu vermeiden
let testClubIdsCache = null;
let currentUserDataCache = null;

/**
 * Filtert Spieler basierend auf Datenschutzeinstellungen
 * @returns {Object} { filteredPlayers, currentUserHidden }
 */
function filterPlayersByPrivacy(players, currentUserId, currentUserClubId) {
    let currentUserHidden = false;

    const filteredPlayers = players.filter(player => {
        const privacySettings = player.privacySettings || {};
        const showInLeaderboards = privacySettings.showInLeaderboards !== false;
        const searchable = privacySettings.searchable || 'global';

        const isCurrentUser = player.id === currentUserId;

        if (!showInLeaderboards) {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true;
            }
            return false;
        }

        if (searchable === 'club_only') {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true;
            }
            if (currentUserClubId && player.clubId === currentUserClubId) {
                return true;
            }
            return false;
        }

        return true;
    });

    return { filteredPlayers, currentUserHidden };
}

/** Lädt Test-Verein IDs für Filterung */
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

/** Lädt aktuelle Benutzerdaten für Test-Verein-Filterung */
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
 * Filtert Spieler aus Test-Vereinen
 * Ausnahme: Coaches desselben Test-Vereins sehen alle Spieler
 */
async function filterTestClubPlayers(players, currentUserId) {
    const testClubIds = await loadTestClubIds();

    if (testClubIds.length === 0) {
        console.log('[Leaderboard] No test clubs found, showing all players');
        return players;
    }

    const currentUser = currentUserId ? await loadCurrentUserData(currentUserId) : null;
    const isCoach = currentUser && (currentUser.role === 'coach' || currentUser.role === 'head_coach');
    const currentUserClubId = currentUser?.club_id;
    const isCurrentUserInTestClub = currentUserClubId && testClubIds.includes(currentUserClubId);

    const filteredPlayers = players.filter(player => {
        const playerClubId = player.clubId || player.club_id;

        if (!playerClubId || !testClubIds.includes(playerClubId)) {
            return true;
        }

        // Coach desselben Test-Vereins kann Spieler sehen
        if (isCoach && isCurrentUserInTestClub && currentUserClubId === playerClubId) {
            return true;
        }

        return false;
    });

    return filteredPlayers;
}

/** Cache löschen bei Benutzerwechsel */
export function clearTestClubCache() {
    testClubIdsCache = null;
    currentUserDataCache = null;
}

export function setLeaderboardSubgroupFilter(subgroupId) {
    currentLeaderboardSubgroupFilter = subgroupId;
}

export function setLeaderboardGenderFilter(genderId) {
    currentLeaderboardGenderFilter = genderId;
}

/**
 * Setzt Sport-Filter für Rangliste
 * Zeigt nur Spieler dieser Sportart
 */
export function setLeaderboardSportFilter(sportId) {
    currentLeaderboardSportId = sportId;
    console.log('[Leaderboard] Sport filter set:', sportId);
}

export function getLeaderboardSportFilter() {
    return currentLeaderboardSportId;
}

/** Ermittelt Liga basierend auf ELO-Rating */
export function getLeague(eloRating) {
    const elo = eloRating || 1000;
    if (elo >= LEAGUES.diamond.minElo) return LEAGUES.diamond;
    if (elo >= LEAGUES.platinum.minElo) return LEAGUES.platinum;
    if (elo >= LEAGUES.gold.minElo) return LEAGUES.gold;
    if (elo >= LEAGUES.silver.minElo) return LEAGUES.silver;
    return LEAGUES.bronze;
}

/**
 * Lädt Skill-Rangliste (ELO-basiert)
 * Multi-Sport: Zeigt nur Spieler der aktiven Sportart
 */
export async function loadSkillLeaderboard(clubId, currentUserId, containerId = 'skill-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, elo_rating, highest_elo, avatar_url, role, subgroup_ids, xp, points, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('elo_rating', { ascending: false });

        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
            console.log('[Leaderboard] Sport filter active:', currentLeaderboardSportId);
        }

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin') // Sicherheit: Admins ausschließen
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

        players = await filterTestClubPlayers(players, currentUserId);

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
 * Lädt Fleiß-Rangliste (XP-basiert)
 * Multi-Sport: Zeigt nur Spieler der aktiven Sportart
 */
export async function loadEffortLeaderboard(clubId, currentUserId, containerId = 'effort-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, xp, avatar_url, role, subgroup_ids, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('xp', { ascending: false });

        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
        }

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin')
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

        players = await filterTestClubPlayers(players, currentUserId);

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
 * Lädt Season-Rangliste (Punkte-basiert)
 * Multi-Sport: Zeigt nur Spieler der aktiven Sportart
 */
export async function loadSeasonLeaderboard(clubId, currentUserId, containerId = 'season-list-club') {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, points, avatar_url, role, subgroup_ids, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('points', { ascending: false });

        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
        }

        if (clubId) {
            query = query.eq('club_id', clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin')
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

        players = await filterTestClubPlayers(players, currentUserId);

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
 * Lädt globale Rangliste (alle Vereine)
 * Unterstützt alte und neue Funktionssignatur
 */
export async function loadGlobalLeaderboard(userDataOrId, supabaseClientOrContainerId = 'skill-list-global', unsubscribesOrLimit = 100) {
    let currentUserId;
    let containerId = 'skill-list-global';
    let limit = 100;
    let userData = null;

    if (typeof userDataOrId === 'object' && userDataOrId !== null && userDataOrId.id) {
        currentUserId = userDataOrId.id;
        userData = userDataOrId;
    } else {
        currentUserId = userDataOrId;
        if (typeof supabaseClientOrContainerId === 'string') {
            containerId = supabaseClientOrContainerId;
        }
        if (typeof unsubscribesOrLimit === 'number') {
            limit = unsubscribesOrLimit;
        }
    }

    await loadGlobalSkillLeaderboardInternal(currentUserId, containerId, limit);

    if (userData) {
        loadGlobalDoublesLeaderboard(userData);
    }
}

/**
 * Lädt globale Skill-Rangliste
 * Multi-Sport: Nutzt user_sport_stats für sport-spezifisches ELO
 * Zeigt nur Spieler mit matches_played > 0
 */
async function loadGlobalSkillLeaderboardInternal(currentUserId, containerId = 'skill-list-global', limit = 100) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Laden...</div>';

    try {
        let allPlayers = [];

        if (currentLeaderboardSportId) {
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
                .gt('matches_played', 0)
                .order('elo_rating', { ascending: false });

            if (!statsError && sportStats && sportStats.length > 0) {
                console.log('[Leaderboard] Using sport-specific stats, players:', sportStats.length);

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
                console.log('[Leaderboard] Falling back to profiles query');
                allPlayers = await loadLeaderboardFallback(currentLeaderboardSportId);
            }
        } else {
            allPlayers = await loadLeaderboardFallback(null);
        }

        if (allPlayers.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Sportart gefunden.</div>';
            return [];
        }

        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                allPlayers = filterPlayersByAgeGroup(allPlayers, currentLeaderboardSubgroupFilter);
            } else if (!isGenderFilter(currentLeaderboardSubgroupFilter)) {
                allPlayers = allPlayers.filter(p => p.subgroupIDs.includes(currentLeaderboardSubgroupFilter));
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            allPlayers = filterPlayersByGender(allPlayers, currentLeaderboardGenderFilter);
        }

        allPlayers = await filterTestClubPlayers(allPlayers, currentUserId);

        const currentUserProfile = allPlayers.find(p => p.id === currentUserId);
        const currentUserClubId = currentUserProfile?.clubId;

        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(allPlayers, currentUserId, currentUserClubId);
        allPlayers = filteredPlayers;

        if (allPlayers.length === 0) {
            container.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>';
            return [];
        }

        const currentUserRank = allPlayers.findIndex(p => p.id === currentUserId) + 1;
        const currentUserData = allPlayers.find(p => p.id === currentUserId);

        const top100 = allPlayers.slice(0, limit);

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
 * Fallback für Rangliste aus profiles-Tabelle
 * Wird verwendet wenn user_sport_stats nicht existiert
 */
async function loadLeaderboardFallback(sportId) {
    let query = supabase
        .from('profiles')
        .select(`
            id, first_name, last_name, elo_rating, highest_elo, avatar_url, role,
            club_id, clubs:club_id(name), subgroup_ids, birthdate, gender, privacy_settings
        `)
        .in('role', ['player', 'coach', 'head_coach'])
        .order('elo_rating', { ascending: false });

    if (sportId) {
        query = query.eq('active_sport_id', sportId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || [])
        .filter(p => p.role !== 'admin')
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

/** Lädt globale Doppel-Rangliste */
function loadGlobalDoublesLeaderboard(userData) {
    const listEl = document.getElementById('doubles-list-global');
    if (!listEl) return;

    try {
        loadDoublesLeaderboard(null, supabase, listEl, [], userData.id, true, currentLeaderboardSportId);
    } catch (error) {
        console.error('[Leaderboard] Error loading global doubles leaderboard:', error);
        listEl.innerHTML = '<p class="text-center text-red-500 py-8">Fehler beim Laden der globalen Doppel-Rangliste.</p>';
    }
}

/** Rendert Ranglisten-Liste */
function renderLeaderboardList(container, players, currentUserId, type = 'elo', currentUserHidden = false) {
    container.innerHTML = '';

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
 * Rendert globale Rangliste mit Vereinsnamen
 * Zeigt Top-Spieler + Position des aktuellen Benutzers
 */
function renderGlobalLeaderboardList(container, players, currentUserId, currentUserRank = 0, currentUserData = null, isCurrentUserInTop = true, currentUserHidden = false) {
    container.innerHTML = '';

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

    // Zeigt Benutzerposition am Ende wenn nicht in Top-Liste
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

/** Abonniert Echtzeit-Änderungen der Rangliste */
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

/** Beendet alle Ranglisten-Abonnements */
export function unsubscribeFromLeaderboards() {
    leaderboardSubscriptions.forEach(channel => {
        supabase.removeChannel(channel);
    });
    leaderboardSubscriptions = [];
}

/** Lädt alle Ranglisten für einen Verein */
export async function loadAllLeaderboards(userData) {
    if (!userData.clubId) return;

    await Promise.all([
        loadSkillLeaderboard(userData.clubId, userData.id, 'skill-list-club'),
        loadEffortLeaderboard(userData.clubId, userData.id, 'effort-list-club'),
        loadSeasonLeaderboard(userData.clubId, userData.id, 'season-list-club'),
        loadGlobalLeaderboard(userData.id, 'skill-list-global')
    ]);
}

/** Rendert Ranglisten-HTML-Struktur */
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

/** Richtet Tab-Click-Handler ein */
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

/** Richtet Verein/Global-Umschalter ein */
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

/** Lädt alle Ranglisten (Wrapper für Kompatibilität) */
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
 * Lädt Ränge-Ansicht gruppiert nach Rang
 * Multi-Sport: Zeigt nur Spieler der aktiven Sportart
 */
async function loadRanksView(userData) {
    const listEl = document.getElementById('ranks-list');
    if (!listEl) return;

    try {
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, elo_rating, xp, avatar_url, role, subgroup_ids, birthdate, gender, privacy_settings, club_id')
            .in('role', ['player', 'coach', 'head_coach']);

        if (currentLeaderboardSportId) {
            query = query.eq('active_sport_id', currentLeaderboardSportId);
        }

        if (userData.clubId) {
            query = query.eq('club_id', userData.clubId);
        }

        const { data, error } = await query;

        if (error) throw error;

        let players = (data || [])
            .filter(p => p.role !== 'admin')
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

        players = await filterTestClubPlayers(players, userData.id);

        const currentUserClubId = userData.clubId;
        const { filteredPlayers, currentUserHidden } = filterPlayersByPrivacy(players, userData.id, currentUserClubId);
        players = filteredPlayers;

        if (players.length === 0) {
            listEl.innerHTML = '<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>';
            return;
        }

        const grouped = groupPlayersByRank(players);
        listEl.innerHTML = '';

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

        for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
            const rank = RANK_ORDER[i];
            const playersInRank = grouped[rank.id] || [];

            if (playersInRank.length === 0) continue;

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

/** Lädt Doppel-Rangliste Tab */
function loadDoublesLeaderboardTab(userData) {
    const listEl = document.getElementById('doubles-list-club');
    if (!listEl) return;

    try {
        loadDoublesLeaderboard(userData.clubId, supabase, listEl, [], userData.id, false, currentLeaderboardSportId);
    } catch (error) {
        console.error('[Leaderboard] Error loading doubles leaderboard:', error);
        listEl.innerHTML = '<p class="text-center text-red-500 py-8">Fehler beim Laden der Doppel-Rangliste.</p>';
    }
}

/** @deprecated Veraltete Funktion - Wird in zukünftigen Versionen entfernt */
export function loadLeaderboardForCoach(clubId, leagueToShow, supabase, unsubscribeCallback) {
    console.warn(
        'loadLeaderboardForCoach is deprecated. Please update to use the new 3-tab leaderboard system.'
    );
}
