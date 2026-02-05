/**
 * Ranglisten für SC Champions Prototyp
 * 5 Ranglisten: Fleiß (XP), Saison, Skill (Elo), Rang-Übersicht, Doppel
 */

import { supabase, getCurrentProfile } from './supabase-client.js';
import { calculateRank, groupByRank, createRankBadge, RANKS, RANK_ORDER } from './ranks.js';

// Ranglisten-Typen
export const LEADERBOARD_TYPES = {
    EFFORT: 'effort',     // Fleiß (XP)
    SEASON: 'season',     // Saison-Punkte
    SKILL: 'skill',       // Elo-Wertung
    RANKS: 'ranks',       // Rang-Übersicht
    DOUBLES: 'doubles'    // Doppel-Elo
};

// ============================================
// RANGLISTEN LADEN
// ============================================

/**
 * Lädt die Fleiß-Rangliste (sortiert nach XP)
 *
 * @param {string} clubId - Verein-ID
 * @param {Object} filters - Filter
 * @returns {Promise<Array>} Spieler sortiert nach XP
 */
export async function getEffortLeaderboard(clubId, filters = {}) {
    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, xp, elo_rating, season_points, grundlagen_completed')
        .eq('club_id', clubId)
        .eq('role', 'player')
        .order('xp', { ascending: false });

    query = applyFilters(query, filters);

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden der Fleiß-Rangliste:', error);
        return [];
    }

    return addRankInfo(data);
}

/**
 * Lädt die Saison-Rangliste (sortiert nach Season Points)
 *
 * @param {string} clubId - Verein-ID
 * @param {Object} filters - Filter
 * @returns {Promise<Array>} Spieler sortiert nach Saison-Punkten
 */
export async function getSeasonLeaderboard(clubId, filters = {}) {
    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, xp, elo_rating, season_points, grundlagen_completed')
        .eq('club_id', clubId)
        .eq('role', 'player')
        .order('season_points', { ascending: false });

    query = applyFilters(query, filters);

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden der Saison-Rangliste:', error);
        return [];
    }

    return addRankInfo(data);
}

/**
 * Lädt die Skill-Rangliste (sortiert nach Elo)
 *
 * @param {string} clubId - Verein-ID
 * @param {Object} filters - Filter
 * @returns {Promise<Array>} Spieler sortiert nach Elo
 */
export async function getSkillLeaderboard(clubId, filters = {}) {
    let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, xp, elo_rating, season_points, singles_wins, singles_losses, grundlagen_completed')
        .eq('club_id', clubId)
        .eq('role', 'player')
        .order('elo_rating', { ascending: false });

    query = applyFilters(query, filters);

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden der Skill-Rangliste:', error);
        return [];
    }

    return addRankInfo(data);
}

/**
 * Lädt die Rang-Übersicht (gruppiert nach Rang)
 *
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Object>} Spieler gruppiert nach Rang
 */
export async function getRanksOverview(clubId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, xp, elo_rating, grundlagen_completed')
        .eq('club_id', clubId)
        .eq('role', 'player');

    if (error) {
        console.error('Fehler beim Laden der Rang-Übersicht:', error);
        return {};
    }

    return groupByRank(data);
}

/**
 * Lädt die Doppel-Rangliste
 *
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Array>} Doppel-Teams sortiert nach Elo
 */
export async function getDoublesLeaderboard(clubId) {
    const { data, error } = await supabase
        .from('doubles_teams')
        .select(`
            *,
            player1:player1_id(id, first_name, last_name, club_id),
            player2:player2_id(id, first_name, last_name, club_id)
        `)
        .order('elo_rating', { ascending: false });

    if (error) {
        console.error('Fehler beim Laden der Doppel-Rangliste:', error);
        return [];
    }

    // Nach Verein filtern (mindestens ein Spieler im Verein)
    return data.filter(team =>
        team.player1?.club_id === clubId || team.player2?.club_id === clubId
    );
}

// ============================================
// RIVALEN FINDEN
// ============================================

/**
 * Findet den nächsten Rivalen in der Elo-Rangliste
 *
 * @param {string} clubId - Verein-ID
 * @param {string} userId - Spieler-ID
 * @returns {Promise<Object|null>} Rivale oder null
 */
export async function findEloRival(clubId, userId) {
    const leaderboard = await getSkillLeaderboard(clubId);
    const currentIndex = leaderboard.findIndex(p => p.id === userId);

    if (currentIndex <= 0) {
        return null;  // Bereits auf Platz 1 oder nicht gefunden
    }

    const rival = leaderboard[currentIndex - 1];
    const current = leaderboard[currentIndex];

    return {
        rival,
        position: currentIndex,  // 0-basiert
        eloDifference: rival.elo_rating - current.elo_rating
    };
}

/**
 * Findet den nächsten Rivalen in der XP-Rangliste
 *
 * @param {string} clubId - Verein-ID
 * @param {string} userId - Spieler-ID
 * @returns {Promise<Object|null>} Rivale oder null
 */
export async function findXpRival(clubId, userId) {
    const leaderboard = await getEffortLeaderboard(clubId);
    const currentIndex = leaderboard.findIndex(p => p.id === userId);

    if (currentIndex <= 0) {
        return null;
    }

    const rival = leaderboard[currentIndex - 1];
    const current = leaderboard[currentIndex];

    return {
        rival,
        position: currentIndex,
        xpDifference: rival.xp - current.xp
    };
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Wendet Filter auf Query an
 */
function applyFilters(query, filters) {
    if (filters.gender) {
        query = query.eq('gender', filters.gender);
    }

    if (filters.subgroupId) {
        query = query.contains('subgroup_ids', [filters.subgroupId]);
    }

    if (filters.limit) {
        query = query.limit(filters.limit);
    }

    return query;
}

/**
 * Fügt Rang-Informationen zu Spielern hinzu
 */
function addRankInfo(players) {
    return players.map(player => ({
        ...player,
        rank: calculateRank(player.elo_rating, player.xp, player.grundlagen_completed || 0)
    }));
}

// ============================================
// HTML RENDERING
// ============================================

/**
 * Erstellt HTML für Ranglisten-Tabs
 *
 * @param {string} activeTab - Aktiver Tab
 * @returns {string} HTML
 */
export function createLeaderboardTabs(activeTab = LEADERBOARD_TYPES.SKILL) {
    const tabs = [
        { id: LEADERBOARD_TYPES.SKILL, label: 'Skill', icon: '🎯' },
        { id: LEADERBOARD_TYPES.EFFORT, label: 'Fleiß', icon: '💪' },
        { id: LEADERBOARD_TYPES.SEASON, label: 'Saison', icon: '📊' },
        { id: LEADERBOARD_TYPES.RANKS, label: 'Ränge', icon: '🏆' },
        { id: LEADERBOARD_TYPES.DOUBLES, label: 'Doppel', icon: '👥' }
    ];

    return `
        <div class="flex border-b border-gray-200 mb-4 overflow-x-auto">
            ${tabs.map(tab => `
                <button class="leaderboard-tab px-4 py-2 text-sm font-medium whitespace-nowrap
                               ${tab.id === activeTab
                                   ? 'text-blue-600 border-b-2 border-blue-600'
                                   : 'text-gray-500 hover:text-gray-700'}"
                        data-tab="${tab.id}">
                    <span class="mr-1">${tab.icon}</span>
                    ${tab.label}
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Erstellt HTML für Spieler-Zeile in der Rangliste
 *
 * @param {Object} player - Spieler
 * @param {number} position - Position (1-basiert)
 * @param {string} type - Ranglisten-Typ
 * @param {boolean} isCurrentUser - Ist aktueller Benutzer?
 * @returns {string} HTML
 */
export function createLeaderboardRow(player, position, type, isCurrentUser = false) {
    const highlightClass = isCurrentUser ? 'bg-blue-50 border-l-4 border-l-blue-500' : '';

    // Medaillen für Top 3
    let positionDisplay = position.toString();
    if (position === 1) positionDisplay = '🥇';
    else if (position === 2) positionDisplay = '🥈';
    else if (position === 3) positionDisplay = '🥉';

    // Wert je nach Typ
    let valueDisplay;
    switch (type) {
        case LEADERBOARD_TYPES.SKILL:
            valueDisplay = `<span class="font-bold text-blue-600">${player.elo_rating}</span> Elo`;
            break;
        case LEADERBOARD_TYPES.EFFORT:
            valueDisplay = `<span class="font-bold text-purple-600">${player.xp}</span> XP`;
            break;
        case LEADERBOARD_TYPES.SEASON:
            valueDisplay = `<span class="font-bold text-green-600">${player.season_points}</span> Punkte`;
            break;
        default:
            valueDisplay = '';
    }

    // Win/Loss für Skill-Rangliste
    const statsDisplay = type === LEADERBOARD_TYPES.SKILL && player.singles_wins !== undefined
        ? `<span class="text-xs text-gray-500">${player.singles_wins}W/${player.singles_losses}L</span>`
        : '';

    return `
        <div class="flex items-center p-3 ${highlightClass} hover:bg-gray-50 transition-colors">
            <div class="w-8 text-center font-bold text-gray-500">${positionDisplay}</div>
            <div class="flex-1 ml-3">
                <div class="font-medium">${player.first_name} ${player.last_name}</div>
                ${statsDisplay}
            </div>
            <div class="text-right">
                ${createRankBadge(player.rank, 'sm')}
            </div>
            <div class="w-24 text-right ml-4">
                ${valueDisplay}
            </div>
        </div>
    `;
}

/**
 * Erstellt HTML für Rang-Übersicht
 *
 * @param {Object} groups - Spieler gruppiert nach Rang
 * @returns {string} HTML
 */
export function createRanksOverviewDisplay(groups) {
    let html = '';

    // Von Champion abwärts
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rankKey = RANK_ORDER[i];
        const group = groups[rankKey];

        if (!group || group.players.length === 0) continue;

        const rank = group.rank;

        html += `
            <div class="mb-6">
                <div class="flex items-center gap-2 mb-3 pb-2 border-b"
                     style="border-color: ${rank.color}">
                    <span class="text-2xl">${rank.emoji}</span>
                    <span class="font-bold text-lg" style="color: ${rank.color}">${rank.name}</span>
                    <span class="text-gray-500 text-sm">(${group.players.length} Spieler)</span>
                </div>
                <div class="grid gap-2">
                    ${group.players.map(player => `
                        <div class="flex items-center p-2 bg-gray-50 rounded">
                            <span class="flex-1">${player.first_name} ${player.last_name}</span>
                            <span class="text-sm text-gray-500">${player.elo_rating} Elo | ${player.xp} XP</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    return html || '<p class="text-gray-500 text-center">Keine Spieler gefunden</p>';
}

/**
 * Erstellt HTML für Doppel-Rangliste
 *
 * @param {Array} teams - Doppel-Teams
 * @returns {string} HTML
 */
export function createDoublesLeaderboardDisplay(teams) {
    if (!teams || teams.length === 0) {
        return '<p class="text-gray-500 text-center">Keine Doppel-Teams gefunden</p>';
    }

    return teams.map((team, index) => {
        const position = index + 1;
        let positionDisplay = position.toString();
        if (position === 1) positionDisplay = '🥇';
        else if (position === 2) positionDisplay = '🥈';
        else if (position === 3) positionDisplay = '🥉';

        const winRate = team.matches_played > 0
            ? Math.round((team.wins / team.matches_played) * 100)
            : 0;

        return `
            <div class="flex items-center p-3 hover:bg-gray-50 transition-colors border-b">
                <div class="w-8 text-center font-bold text-gray-500">${positionDisplay}</div>
                <div class="flex-1 ml-3">
                    <div class="font-medium">
                        ${team.player1?.first_name} ${team.player1?.last_name} &
                        ${team.player2?.first_name} ${team.player2?.last_name}
                    </div>
                    <div class="text-xs text-gray-500">
                        ${team.wins}W/${team.losses}L (${winRate}%)
                    </div>
                </div>
                <div class="w-24 text-right">
                    <span class="font-bold text-blue-600">${team.elo_rating}</span> Elo
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Erstellt HTML für Rivalen-Anzeige
 *
 * @param {Object} eloRival - Elo-Rivale
 * @param {Object} xpRival - XP-Rivale
 * @returns {string} HTML
 */
export function createRivalsDisplay(eloRival, xpRival) {
    let html = '<div class="space-y-4">';

    if (eloRival) {
        html += `
            <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 class="font-medium text-blue-800 mb-2">🎯 Nächster Skill-Rivale</h4>
                <div class="flex items-center justify-between">
                    <span>${eloRival.rival.first_name} ${eloRival.rival.last_name}</span>
                    <span class="text-blue-600 font-bold">${eloRival.rival.elo_rating} Elo</span>
                </div>
                <p class="text-sm text-blue-600 mt-1">
                    Noch ${eloRival.eloDifference} Elo-Punkte bis zur Überholung
                </p>
            </div>
        `;
    }

    if (xpRival) {
        html += `
            <div class="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <h4 class="font-medium text-purple-800 mb-2">💪 Nächster Fleiß-Rivale</h4>
                <div class="flex items-center justify-between">
                    <span>${xpRival.rival.first_name} ${xpRival.rival.last_name}</span>
                    <span class="text-purple-600 font-bold">${xpRival.rival.xp} XP</span>
                </div>
                <p class="text-sm text-purple-600 mt-1">
                    Noch ${xpRival.xpDifference} XP bis zur Überholung
                </p>
            </div>
        `;
    }

    if (!eloRival && !xpRival) {
        html += '<p class="text-gray-500 text-center">Du bist bereits an der Spitze! 🏆</p>';
    }

    html += '</div>';
    return html;
}
