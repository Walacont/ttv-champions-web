// Matches Module - Supabase Version
// SC Champions - Migration von Firebase zu Supabase

import { getSupabase } from './supabase-init.js';
import {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    updateDoc,
    serverTimestamp
} from './db-supabase.js';
import { createSetScoreInput } from './player-matches.js';
import { calculateHandicap } from './validation-utils.js';
import { formatDate, isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils-supabase.js';

/**
 * Matches Module - Supabase Version
 * Handles match pairings, handicap calculation, and match result reporting
 */

const supabase = getSupabase();

// Global variables
let coachSetScoreInput = null;
let currentPairingsSession = null;
let currentPairingSessionId = null;
let currentPairingPlayerAId = null;
let currentPairingPlayerBId = null;
let currentHandicapData = null;

/**
 * Initializes the set score input for coach match form
 */
export function initializeCoachSetScoreInput() {
    const container = document.getElementById('coach-set-score-container');
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const setScoreLabel = document.getElementById('coach-set-score-label');

    if (!container) return null;

    function updateSetScoreLabel(mode) {
        if (!setScoreLabel) return;
        const labels = {
            'single-set': 'Satzergebnisse (1 Satz)',
            'best-of-3': 'Satzergebnisse (Best of 3)',
            'best-of-5': 'Satzergebnisse (Best of 5)',
            'best-of-7': 'Satzergebnisse (Best of 7)'
        };
        setScoreLabel.textContent = labels[mode] || 'Satzergebnisse';
    }

    const currentMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';
    coachSetScoreInput = createSetScoreInput(container, [], currentMode);
    updateSetScoreLabel(currentMode);

    if (matchModeSelect) {
        matchModeSelect.addEventListener('change', () => {
            const newMode = matchModeSelect.value;
            coachSetScoreInput = createSetScoreInput(container, [], newMode);
            updateSetScoreLabel(newMode);

            if (window.setDoublesSetScoreInput) {
                window.setDoublesSetScoreInput(coachSetScoreInput);
            }
        });
    }

    return coachSetScoreInput;
}

export function setCurrentPairingsSession(sessionId) {
    currentPairingsSession = sessionId;
}

/**
 * Generates match pairings from present and match-ready players
 */
export function handleGeneratePairings(clubPlayers, currentSubgroupFilter = 'all', sessionId = null) {
    if (sessionId) {
        currentPairingsSession = sessionId;
    }

    const presentPlayerCheckboxes = document.querySelectorAll('#attendance-player-list input:checked');
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);

    // Only pair players who have completed Grundlagen (5 exercises)
    let matchReadyAndPresentPlayers = clubPlayers.filter(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        return presentPlayerIds.includes(player.id) && grundlagen >= 5;
    });

    // Filter by subgroup, age group, or gender
    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            matchReadyAndPresentPlayers = filterPlayersByAgeGroup(matchReadyAndPresentPlayers, currentSubgroupFilter);
        } else if (isGenderFilter(currentSubgroupFilter)) {
            matchReadyAndPresentPlayers = filterPlayersByGender(matchReadyAndPresentPlayers, currentSubgroupFilter);
        } else {
            matchReadyAndPresentPlayers = matchReadyAndPresentPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
        }
    }

    // Sort by ELO rating
    matchReadyAndPresentPlayers.sort((a, b) => (a.eloRating || 0) - (b.eloRating || 0));

    // Create groups of 4
    const pairingsByGroup = {};
    const groupSize = 4;

    for (let i = 0; i < matchReadyAndPresentPlayers.length; i += groupSize) {
        const groupNumber = Math.floor(i / groupSize) + 1;
        pairingsByGroup[`Gruppe ${groupNumber}`] = matchReadyAndPresentPlayers.slice(i, i + groupSize);
    }

    // Generate pairings within each group
    const finalPairings = {};
    let leftoverPlayer = null;

    for (const groupName in pairingsByGroup) {
        let playersInGroup = pairingsByGroup[groupName];

        // Shuffle players
        for (let i = playersInGroup.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playersInGroup[i], playersInGroup[j]] = [playersInGroup[j], playersInGroup[i]];
        }

        finalPairings[groupName] = [];
        for (let i = 0; i < playersInGroup.length - 1; i += 2) {
            finalPairings[groupName].push([playersInGroup[i], playersInGroup[i + 1]]);
        }

        if (playersInGroup.length % 2 !== 0) {
            leftoverPlayer = playersInGroup[playersInGroup.length - 1];
        }
    }

    renderPairingsInModal(finalPairings, leftoverPlayer);
}

/**
 * Renders pairings in the modal
 */
export function renderPairingsInModal(pairings, leftoverPlayer) {
    const modal = document.getElementById('pairings-modal');
    const container = document.getElementById('modal-pairings-content');
    container.innerHTML = '';

    const hasPairings = Object.values(pairings).some(group => group.length > 0);
    if (!hasPairings && !leftoverPlayer) {
        container.innerHTML = '<p class="text-center text-gray-500">Keine möglichen Paarungen gefunden.</p>';
        modal.classList.remove('hidden');
        return;
    }

    for (const groupName in pairings) {
        if (pairings[groupName].length === 0) continue;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-3';
        groupDiv.innerHTML = `<h5 class="font-bold text-gray-800 bg-gray-100 p-2 rounded-t-md">${groupName}</h5>`;

        const list = document.createElement('ul');
        list.className = 'space-y-2 p-2 border-l border-r border-b rounded-b-md';

        pairings[groupName].forEach(pair => {
            const [playerA, playerB] = pair;
            const handicap = calculateHandicap(playerA, playerB);

            let handicapHTML = '<p class="text-xs text-gray-400 mt-1">Kein Handicap</p>';
            if (handicap) {
                handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold">
                    <i class="fas fa-balance-scale-right"></i> ${handicap.player.firstName} startet mit
                    <strong>${handicap.points}</strong> Pkt. Vorsprung.
                </p>`;
            }

            const listItem = document.createElement('li');
            listItem.className = 'bg-white p-3 rounded-md shadow-sm border';
            listItem.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-semibold">${playerA.firstName} ${playerA.lastName}</span>
                        <span class="text-gray-400 mx-2">vs</span>
                        <span class="font-semibold">${playerB.firstName} ${playerB.lastName}</span>
                    </div>
                    <div class="text-xs text-gray-400">
                        (${Math.round(playerA.eloRating || 0)} vs ${Math.round(playerB.eloRating || 0)})
                    </div>
                </div>
                ${handicapHTML}
            `;
            list.appendChild(listItem);
        });

        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
    }

    if (leftoverPlayer) {
        const leftoverDiv = document.createElement('div');
        leftoverDiv.className = 'mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md';
        leftoverDiv.innerHTML = `
            <p class="text-yellow-700">
                <i class="fas fa-user-clock mr-2"></i>
                <strong>${leftoverPlayer.firstName} ${leftoverPlayer.lastName}</strong> wartet auf einen Partner.
            </p>
        `;
        container.appendChild(leftoverDiv);
    }

    modal.classList.remove('hidden');
}

/**
 * Saves a match result to Supabase
 * ELO calculation is handled automatically by the database trigger
 */
export async function saveMatchResult(matchData, currentUserData) {
    try {
        const { playerAId, playerBId, winnerId, loserId, sets, handicapUsed, matchMode } = matchData;

        // Calculate sets won
        let playerASetsWon = 0;
        let playerBSetsWon = 0;

        sets.forEach(set => {
            if (set.playerA > set.playerB) playerASetsWon++;
            else if (set.playerB > set.playerA) playerBSetsWon++;
        });

        // Insert match - ELO trigger will calculate ratings automatically
        const { data, error } = await supabase
            .from('matches')
            .insert({
                player_a_id: playerAId,
                player_b_id: playerBId,
                winner_id: winnerId,
                loser_id: loserId,
                sets: sets,
                player_a_sets_won: playerASetsWon,
                player_b_sets_won: playerBSetsWon,
                club_id: currentUserData.clubId,
                created_by: currentUserData.id,
                played_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        console.log('[Matches] Match saved successfully:', data.id);
        return { success: true, match: data };

    } catch (error) {
        console.error('[Matches] Error saving match:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Loads matches for a club with real-time updates
 */
export function loadClubMatches(clubId, callback, limit = 50) {
    const channel = supabase
        .channel(`matches_${clubId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'matches',
                filter: `club_id=eq.${clubId}`
            },
            async () => {
                const matches = await fetchClubMatches(clubId, limit);
                callback(matches);
            }
        )
        .subscribe();

    // Initial fetch
    fetchClubMatches(clubId, limit).then(callback);

    // Return unsubscribe function
    return () => supabase.removeChannel(channel);
}

/**
 * Fetches matches for a club
 */
async function fetchClubMatches(clubId, limit = 50) {
    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            player_a:profiles!matches_player_a_id_fkey(id, display_name, first_name, last_name, elo_rating, avatar_url),
            player_b:profiles!matches_player_b_id_fkey(id, display_name, first_name, last_name, elo_rating, avatar_url),
            winner:profiles!matches_winner_id_fkey(id, display_name, first_name, last_name)
        `)
        .eq('club_id', clubId)
        .order('played_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[Matches] Error fetching matches:', error);
        return [];
    }

    // Convert to camelCase for compatibility
    return (data || []).map(match => ({
        id: match.id,
        playerAId: match.player_a_id,
        playerBId: match.player_b_id,
        winnerId: match.winner_id,
        loserId: match.loser_id,
        sets: match.sets,
        playerASetsWon: match.player_a_sets_won,
        playerBSetsWon: match.player_b_sets_won,
        eloChange: match.elo_change,
        playerAEloBefore: match.player_a_elo_before,
        playerBEloBefore: match.player_b_elo_before,
        playerAEloAfter: match.player_a_elo_after,
        playerBEloAfter: match.player_b_elo_after,
        playedAt: match.played_at,
        clubId: match.club_id,
        playerA: match.player_a ? {
            id: match.player_a.id,
            firstName: match.player_a.first_name,
            lastName: match.player_a.last_name,
            displayName: match.player_a.display_name,
            eloRating: match.player_a.elo_rating,
            photoURL: match.player_a.avatar_url
        } : null,
        playerB: match.player_b ? {
            id: match.player_b.id,
            firstName: match.player_b.first_name,
            lastName: match.player_b.last_name,
            displayName: match.player_b.display_name,
            eloRating: match.player_b.elo_rating,
            photoURL: match.player_b.avatar_url
        } : null,
        winner: match.winner ? {
            id: match.winner.id,
            firstName: match.winner.first_name,
            lastName: match.winner.last_name,
            displayName: match.winner.display_name
        } : null
    }));
}

/**
 * Gets match history for a player
 */
export async function getPlayerMatchHistory(playerId, limit = 20) {
    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            player_a:profiles!matches_player_a_id_fkey(id, display_name, first_name, last_name),
            player_b:profiles!matches_player_b_id_fkey(id, display_name, first_name, last_name)
        `)
        .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
        .order('played_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[Matches] Error fetching player history:', error);
        return [];
    }

    return data || [];
}

/**
 * Gets head-to-head stats between two players
 */
export async function getHeadToHead(playerAId, playerBId) {
    const { data, error } = await supabase
        .from('matches')
        .select('*')
        .or(
            `and(player_a_id.eq.${playerAId},player_b_id.eq.${playerBId}),` +
            `and(player_a_id.eq.${playerBId},player_b_id.eq.${playerAId})`
        )
        .order('played_at', { ascending: false });

    if (error) {
        console.error('[Matches] Error fetching head-to-head:', error);
        return { matches: [], winsA: 0, winsB: 0 };
    }

    let winsA = 0;
    let winsB = 0;

    (data || []).forEach(match => {
        if (match.winner_id === playerAId) winsA++;
        else if (match.winner_id === playerBId) winsB++;
    });

    return {
        matches: data || [],
        winsA,
        winsB,
        total: (data || []).length
    };
}

/**
 * Updates the match form UI based on selected players
 */
export function updateMatchUI(clubPlayers) {
    const playerAId = document.getElementById('player-a-select')?.value;
    const playerBId = document.getElementById('player-b-select')?.value;
    const handicapContainer = document.getElementById('handicap-suggestion');
    const handicapToggleContainer = document.getElementById('handicap-toggle-container');
    const handicapToggle = document.getElementById('handicap-toggle');

    const playerA = clubPlayers.find(p => p.id === playerAId);
    const playerB = clubPlayers.find(p => p.id === playerBId);

    if (playerA && playerB && playerAId !== playerBId) {
        const handicap = calculateHandicap(playerA, playerB);

        if (handicap && handicap.points > 0) {
            currentHandicapData = {
                player: handicap.player.id === playerAId ? 'A' : 'B',
                points: handicap.points,
            };

            document.getElementById('handicap-text').textContent =
                `${handicap.player.firstName} startet mit ${handicap.points} Punkten Vorsprung pro Satz.`;
            handicapContainer?.classList.remove('hidden');
            handicapToggleContainer?.classList.remove('hidden');
            handicapToggleContainer?.classList.add('flex');

            if (handicapToggle?.checked && coachSetScoreInput) {
                coachSetScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
            }
        } else {
            currentHandicapData = null;
            handicapContainer?.classList.add('hidden');
            handicapToggleContainer?.classList.add('hidden');
            handicapToggleContainer?.classList.remove('flex');

            if (coachSetScoreInput) {
                coachSetScoreInput.clearHandicap('A');
                coachSetScoreInput.clearHandicap('B');
            }
        }
    } else {
        currentHandicapData = null;
        handicapContainer?.classList.add('hidden');
        handicapToggleContainer?.classList.add('hidden');
    }
}

/**
 * Initializes handicap toggle event listener
 */
export function initializeHandicapToggle() {
    const handicapToggle = document.getElementById('handicap-toggle');
    if (!handicapToggle) return;

    handicapToggle.addEventListener('change', () => {
        if (!coachSetScoreInput || !currentHandicapData) return;

        if (handicapToggle.checked) {
            coachSetScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
        } else {
            coachSetScoreInput.clearHandicap(currentHandicapData.player);
        }
    });
}

// Export for compatibility
export { calculateHandicap };
