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
import { createSetScoreInput, createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';
import { getSportContext } from './sport-context-supabase.js';
import { calculateHandicap } from './validation-utils.js';
import { formatDate, isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

/**
 * Matches Module - Supabase Version
 * Handles match pairings, handicap calculation, and match result reporting
 */

const supabase = getSupabase();

/**
 * Helper function to create a notification for a user
 */
async function createNotification(userId, type, title, message, data = {}) {
    const db = getSupabase();
    if (!db) return;

    try {
        const { error } = await db
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                title: title,
                message: message,
                data: data,
                is_read: false
            });

        if (error) {
            console.error('[Matches] Error creating notification:', error);
        } else {
            console.log(`[Matches] Notification sent to ${userId}: ${type}`);
        }
    } catch (error) {
        console.error('[Matches] Error creating notification:', error);
    }
}

// Global variables
let coachSetScoreInput = null;
let currentPairingsSession = null;
let currentPairingSessionId = null;
let currentPairingPlayerAId = null;
let currentPairingPlayerBId = null;
let currentHandicapData = null;
let currentSportName = 'table_tennis'; // Default sport

/**
 * Sets the current sport name for handicap calculations
 * @param {string} sportName - The sport name (table_tennis, tennis, badminton, padel)
 */
export function setCurrentSport(sportName) {
    currentSportName = sportName?.toLowerCase() || 'table_tennis';
    console.log('[Matches] Sport set to:', currentSportName);
}

/**
 * Updates the coach match winner display based on current set scores
 * @param {Object} setScoreInput - Optional set score input instance (defaults to coachSetScoreInput)
 */
export function updateCoachWinnerDisplay(setScoreInput = null) {
    const matchWinnerInfo = document.getElementById('coach-match-winner-info');
    const matchWinnerText = document.getElementById('coach-match-winner-text');

    const inputInstance = setScoreInput || coachSetScoreInput;
    if (!inputInstance || !matchWinnerInfo || !matchWinnerText) return;

    // Check if getMatchWinner method exists
    if (typeof inputInstance.getMatchWinner !== 'function') return;

    const winnerData = inputInstance.getMatchWinner();

    if (winnerData && winnerData.winner) {
        // We have a winner
        // Get player names from the select elements
        const playerASelect = document.getElementById('player-a-select');
        const playerBSelect = document.getElementById('player-b-select');

        let winnerName;
        if (winnerData.winner === 'A') {
            winnerName = playerASelect?.selectedOptions[0]?.text || 'Spieler A';
        } else {
            winnerName = playerBSelect?.selectedOptions[0]?.text || 'Spieler B';
        }

        matchWinnerText.textContent = `${winnerName} gewinnt mit ${winnerData.setsA}:${winnerData.setsB} Sätzen`;
        matchWinnerInfo.classList.remove('hidden');
    } else if (winnerData && !winnerData.winner && (winnerData.setsA > 0 || winnerData.setsB > 0)) {
        // Match in progress, show current score
        matchWinnerText.textContent = `Aktueller Stand: ${winnerData.setsA}:${winnerData.setsB} Sätze`;
        matchWinnerInfo.classList.remove('hidden');
    } else {
        // No valid sets yet
        matchWinnerInfo.classList.add('hidden');
    }
}

/**
 * Initializes the set score input for coach match form
 */
export async function initializeCoachSetScoreInput(currentUserId) {
    const container = document.getElementById('coach-set-score-container');
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const setScoreLabel = document.getElementById('coach-set-score-label');
    const goldenPointCheckbox = document.getElementById('coach-golden-point-checkbox');
    const matchTieBreakCheckbox = document.getElementById('coach-match-tiebreak-checkbox');

    if (!container) return null;

    // Get sport context to determine scoring system
    const sportContext = await getSportContext(currentUserId);
    const sportName = sportContext?.sportName;
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';

    // Show/hide tennis options based on sport
    const tennisOptionsContainer = document.getElementById('coach-tennis-options-container');
    if (tennisOptionsContainer) {
        if (isTennisOrPadel) {
            tennisOptionsContainer.classList.remove('hidden');
        } else {
            tennisOptionsContainer.classList.add('hidden');
        }
    }

    // Adjust default match mode based on sport
    if (matchModeSelect) {
        if (isTennisOrPadel || isBadminton) {
            // For tennis/padel/badminton, default to Best of 3
            matchModeSelect.value = 'best-of-3';
        }
    }

    function updateSetScoreLabel(mode, sportType = 'table_tennis') {
        if (!setScoreLabel) return;

        if (sportType === 'tennis' || sportType === 'padel') {
            const labels = {
                'best-of-3': 'Satzergebnisse (Best of 3)',
                'best-of-5': 'Satzergebnisse (Best of 5)'
            };
            setScoreLabel.textContent = labels[mode] || 'Satzergebnisse';
        } else if (sportType === 'badminton') {
            setScoreLabel.textContent = 'Satzergebnisse (Best of 3, bis 21)';
        } else {
            const labels = {
                'single-set': 'Satzergebnisse (1 Satz)',
                'best-of-3': 'Satzergebnisse (Best of 3)',
                'best-of-5': 'Satzergebnisse (Best of 5)',
                'best-of-7': 'Satzergebnisse (Best of 7)'
            };
            setScoreLabel.textContent = labels[mode] || 'Satzergebnisse';
        }
    }

    function createScoreInputForSport(mode) {
        if (!container) return null;

        if (isTennisOrPadel) {
            // Tennis/Padel scoring
            const options = {
                mode: mode || 'best-of-3',
                goldenPoint: goldenPointCheckbox?.checked || false,
                matchTieBreak: matchTieBreakCheckbox?.checked || false
            };
            return createTennisScoreInput(container, [], options);
        } else if (isBadminton) {
            // Badminton scoring (always Best of 3)
            return createBadmintonScoreInput(container, [], 'best-of-3');
        } else {
            // Table Tennis scoring
            return createSetScoreInput(container, [], mode || 'best-of-5');
        }
    }

    const currentMode = matchModeSelect ? matchModeSelect.value : (isTennisOrPadel || isBadminton ? 'best-of-3' : 'best-of-5');
    coachSetScoreInput = createScoreInputForSport(currentMode);
    updateSetScoreLabel(currentMode, sportName);

    if (matchModeSelect) {
        matchModeSelect.addEventListener('change', () => {
            const newMode = matchModeSelect.value;
            coachSetScoreInput = createScoreInputForSport(newMode);
            updateSetScoreLabel(newMode, sportName);

            if (window.setDoublesSetScoreInput) {
                window.setDoublesSetScoreInput(coachSetScoreInput);
            }
        });
    }

    // Tennis-specific options
    goldenPointCheckbox?.addEventListener('change', () => {
        coachSetScoreInput = createScoreInputForSport(matchModeSelect?.value);
    });

    matchTieBreakCheckbox?.addEventListener('change', () => {
        coachSetScoreInput = createScoreInputForSport(matchModeSelect?.value);
    });

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
            const handicap = calculateHandicap(playerA, playerB, currentSportName);

            let handicapHTML = '<p class="text-xs text-gray-400 mt-1">Kein Handicap</p>';
            if (handicap) {
                const unitText = handicap.unit || 'Punkte';
                handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold">
                    <i class="fas fa-balance-scale-right"></i> ${handicap.player.firstName} startet mit
                    <strong>${handicap.points}</strong> ${unitText} Vorsprung.
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
                club_id: currentUserData.clubId || currentUserData.club_id,
                created_by: currentUserData.id,
                played_at: new Date().toISOString(),
                sport_id: currentUserData.activeSportId || currentUserData.active_sport_id || null,
                handicap_used: handicapUsed || false,
                match_mode: matchMode || 'best-of-5'
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
        const handicap = calculateHandicap(playerA, playerB, currentSportName);

        if (handicap && handicap.points > 0) {
            currentHandicapData = {
                player: handicap.player.id === playerAId ? 'A' : 'B',
                points: handicap.points,
            };

            const unitText = handicap.unit || 'Punkte';
            document.getElementById('handicap-text').textContent =
                `${handicap.player.firstName} startet mit ${handicap.points} ${unitText} Vorsprung pro Satz.`;
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

/**
 * Updates the state of the generate pairings button
 */
export function updatePairingsButtonState(clubPlayers, currentSubgroupFilter = 'all') {
    const pairingsButton = document.getElementById('generate-pairings-button');
    if (!pairingsButton) return;

    const presentPlayerCheckboxes = document.querySelectorAll(
        '#attendance-player-list input:checked'
    );
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);

    let eligiblePlayers = clubPlayers.filter(player => {
        const isMatchReady = player.isMatchReady || player.is_match_ready;
        return presentPlayerIds.includes(player.id) && isMatchReady === true;
    });

    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            eligiblePlayers = filterPlayersByAgeGroup(eligiblePlayers, currentSubgroupFilter);
        } else if (isGenderFilter(currentSubgroupFilter)) {
            eligiblePlayers = filterPlayersByGender(eligiblePlayers, currentSubgroupFilter);
        } else {
            eligiblePlayers = eligiblePlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
        }
    }

    const eligiblePlayerCount = eligiblePlayers.length;

    if (eligiblePlayerCount >= 2) {
        pairingsButton.disabled = false;
        pairingsButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.add('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = '<i class="fas fa-random mr-2"></i> Paarungen erstellen';
    } else {
        pairingsButton.disabled = true;
        pairingsButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = `(${eligiblePlayerCount}/2 Spieler bereit)`;
    }
}

/**
 * Handles match result submission
 */
export async function handleMatchSave(e, supabaseClient, currentUserData, clubPlayers) {
    e.preventDefault();
    const feedbackEl = document.getElementById('match-feedback');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const playerAId = document.getElementById('player-a-select')?.value;
    const playerBId = document.getElementById('player-b-select')?.value;

    if (!playerAId || !playerBId) {
        if (feedbackEl) feedbackEl.textContent = 'Bitte beide Spieler auswählen.';
        return;
    }

    if (playerAId === playerBId) {
        if (feedbackEl) feedbackEl.textContent = 'Spieler A und B müssen unterschiedlich sein.';
        return;
    }

    // Use coachSetScoreInput for validation and getting sets
    if (!coachSetScoreInput) {
        if (feedbackEl) feedbackEl.textContent = 'Fehler: Set-Score-Input nicht initialisiert.';
        return;
    }

    const validation = coachSetScoreInput.validate();
    if (!validation.valid) {
        if (feedbackEl) feedbackEl.textContent = validation.error || 'Bitte Satzergebnis eingeben.';
        return;
    }

    const sets = coachSetScoreInput.getSets();

    // Calculate sets won
    let setsA = 0;
    let setsB = 0;
    sets.forEach(set => {
        if (set.playerA > set.playerB) setsA++;
        else if (set.playerB > set.playerA) setsB++;
    });

    const winnerId = setsA > setsB ? playerAId : playerBId;
    const playerA = clubPlayers.find(p => p.id === playerAId);
    const playerB = clubPlayers.find(p => p.id === playerBId);

    if (!playerA || !playerB) {
        if (feedbackEl) feedbackEl.textContent = 'Spielerdaten nicht gefunden.';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';

    // Get match mode and handicap settings
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const matchMode = matchModeSelect?.value || 'best-of-5';
    const handicapToggle = document.getElementById('handicap-toggle');
    const handicapUsed = handicapToggle?.checked || false;

    try {
        const supabase = getSupabase();

        // Prepare match data
        const matchData = {
            player_a_id: playerAId,
            player_b_id: playerBId,
            winner_id: winnerId,
            loser_id: winnerId === playerAId ? playerBId : playerAId,
            player_a_sets_won: setsA,
            player_b_sets_won: setsB,
            sets: sets,
            club_id: currentUserData.clubId || currentUserData.club_id,
            created_by: currentUserData.id,
            sport_id: currentUserData.activeSportId || currentUserData.active_sport_id || null,
            match_mode: matchMode,
            handicap_used: handicapUsed,
            played_at: new Date().toISOString()
        };

        // Debug: Log match data being sent
        console.log('[Matches] Saving match with data:', matchData);
        console.log('[Matches] Player A:', playerA);
        console.log('[Matches] Player B:', playerB);

        // Save match result - ELO trigger handles calculation automatically
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .insert(matchData)
            .select()
            .single();

        if (matchError) {
            console.error('[Matches] Match insert error details:', {
                message: matchError.message,
                details: matchError.details,
                hint: matchError.hint,
                code: matchError.code
            });
            throw matchError;
        }

        if (feedbackEl) {
            feedbackEl.textContent = 'Match erfolgreich gespeichert!';
            feedbackEl.classList.remove('text-red-600');
            feedbackEl.classList.add('text-green-600');
        }

        // Reset form
        document.getElementById('player-a-select').value = '';
        document.getElementById('player-b-select').value = '';
        if (coachSetScoreInput && typeof coachSetScoreInput.reset === 'function') {
            coachSetScoreInput.reset();
        }

    } catch (error) {
        console.error('Error saving match:', error);
        if (feedbackEl) {
            feedbackEl.textContent = 'Fehler beim Speichern: ' + error.message;
            feedbackEl.classList.add('text-red-600');
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Match speichern';
    }
}

/**
 * Populates match dropdowns with match-ready players
 * @param {boolean} includeOfflinePlayers - If true, include offline players (for coach dashboard)
 */
export function populateMatchDropdowns(clubPlayers, currentSubgroupFilter = 'all', excludePlayerId = null, currentGenderFilter = 'all', includeOfflinePlayers = false) {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    if (!playerASelect || !playerBSelect) return;

    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';

    // Debug: Log all players including offline ones
    console.log('[Matches] All clubPlayers:', clubPlayers.map(p => ({
        id: p.id,
        name: `${p.firstName || p.first_name} ${p.lastName || p.last_name}`,
        isMatchReady: p.isMatchReady,
        is_match_ready: p.is_match_ready,
        isOffline: p.isOffline || p.is_offline
    })));

    let matchReadyPlayers = clubPlayers.filter(p => {
        const isMatchReady = p.isMatchReady || p.is_match_ready;
        const isOffline = p.isOffline || p.is_offline;
        // For coach dashboard: include offline players
        // For player dashboard: exclude offline players (they can only play doubles)
        if (includeOfflinePlayers) {
            return isMatchReady === true;
        }
        return isMatchReady === true && !isOffline;
    });

    const lockedPlayers = clubPlayers.filter(p => {
        const isMatchReady = p.isMatchReady || p.is_match_ready;
        return isMatchReady !== true;
    });

    // Debug logging for filters
    console.log('[Matches] populateMatchDropdowns:', {
        totalPlayers: clubPlayers.length,
        matchReadyBefore: matchReadyPlayers.length,
        matchReadyPlayers: matchReadyPlayers.map(p => `${p.firstName || p.first_name} ${p.lastName || p.last_name}`),
        lockedPlayers: lockedPlayers.map(p => `${p.firstName || p.first_name} ${p.lastName || p.last_name}`),
        subgroupFilter: currentSubgroupFilter,
        genderFilter: currentGenderFilter,
        excludePlayerId
    });

    // Apply subgroup/age filter first
    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            console.log('[Matches] Filtering by age group:', currentSubgroupFilter);
            matchReadyPlayers = filterPlayersByAgeGroup(matchReadyPlayers, currentSubgroupFilter);
            console.log('[Matches] After age filter:', matchReadyPlayers.length);
        } else if (!isGenderFilter(currentSubgroupFilter)) {
            // Custom subgroup filter (not gender - gender is handled separately)
            console.log('[Matches] Filtering by custom subgroup:', currentSubgroupFilter);
            matchReadyPlayers = matchReadyPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
            console.log('[Matches] After custom subgroup filter:', matchReadyPlayers.length);
        }
    }

    // Apply gender filter separately (can be combined with age/subgroup filter)
    if (currentGenderFilter && currentGenderFilter !== 'all' && currentGenderFilter !== 'gender_all') {
        console.log('[Matches] Filtering by gender:', currentGenderFilter);
        matchReadyPlayers = filterPlayersByGender(matchReadyPlayers, currentGenderFilter);
        console.log('[Matches] After gender filter:', matchReadyPlayers.length);
    }

    // Exclude the specified player (e.g., coach) from the dropdowns
    if (excludePlayerId) {
        matchReadyPlayers = matchReadyPlayers.filter(p => p.id !== excludePlayerId);
        console.log('[Matches] After excluding player:', matchReadyPlayers.length);
    }

    const handicapSuggestion = document.getElementById('handicap-suggestion');
    if (handicapSuggestion) {
        if (matchReadyPlayers.length < 2) {
            let message =
                currentSubgroupFilter !== 'all'
                    ? '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler in dieser Untergruppe müssen Match-bereit sein.</p>'
                    : '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler müssen Match-bereit sein.</p>';

            if (lockedPlayers.length > 0) {
                const lockedNames = lockedPlayers
                    .map(p => {
                        const grundlagen = p.grundlagenCompleted || p.grundlagen_completed || 0;
                        return `${p.firstName || p.first_name} (${grundlagen}/5 Grundlagen)`;
                    })
                    .join(', ');
                message += `<p class="text-xs text-gray-600 mt-2">🔒 Gesperrt: ${lockedNames}</p>`;
            }

            handicapSuggestion.innerHTML = message;
            handicapSuggestion.classList.remove('hidden');
        } else {
            handicapSuggestion.classList.add('hidden');
        }
    }

    matchReadyPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        const firstName = player.firstName || player.first_name || '';
        const lastName = player.lastName || player.last_name || '';
        const elo = player.eloRating || player.elo_rating || 0;
        option.textContent = `${firstName} ${lastName} (Elo: ${Math.round(elo)})`;
        playerASelect.appendChild(option.cloneNode(true));
        playerBSelect.appendChild(option);
    });
}

/**
 * Loads pending match requests for coach approval
 * Multi-sport: Shows sport badge and cross-club indicator
 * For cross-club matches, both coaches can see and approve the request
 */
export async function loadCoachMatchRequests(userData, supabaseClient) {
    const container = document.getElementById('coach-pending-requests-list');
    const badge = document.getElementById('coach-match-request-badge');
    if (!container) return;

    const supabase = getSupabase();

    try {
        // First, get all club members for the coach's club (single sport model)
        const { data: clubMembers } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', userData.clubId);

        const clubMemberIds = (clubMembers || []).map(m => m.id);

        // Query for singles requests awaiting coach approval
        // Include sport info for display
        const { data: singlesRequests, error: singlesError } = await supabase
            .from('match_requests')
            .select(`
                *,
                player_a:profiles!match_requests_player_a_id_fkey(id, first_name, last_name, elo_rating),
                player_b:profiles!match_requests_player_b_id_fkey(id, first_name, last_name, elo_rating),
                sports(id, display_name)
            `)
            .eq('status', 'pending_coach')
            .order('created_at', { ascending: false });

        if (singlesError) {
            console.error('Error loading singles requests:', singlesError);
        }

        // Filter requests: show only requests where at least one player is in our club
        const relevantRequests = (singlesRequests || []).filter(req => {
            return clubMemberIds.includes(req.player_a_id) || clubMemberIds.includes(req.player_b_id);
        });

        const allRequests = relevantRequests.map(req => ({
            id: req.id,
            type: 'singles',
            ...req,
            playerAData: req.player_a,
            playerBData: req.player_b,
            sportName: req.sports?.display_name || '',
        }));

        if (allRequests.length === 0) {
            container.innerHTML =
                '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            if (badge) badge.classList.add('hidden');
            return;
        }

        // Render requests with sport badge and cross-club indicator
        container.innerHTML = allRequests.map(req => {
            const playerA = req.playerAData;
            const playerB = req.playerBData;
            const sportBadge = req.sportName ? `<span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full ml-2">${req.sportName}</span>` : '';
            const crossClubBadge = req.is_cross_club ? `<span class="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full ml-1">Vereinsübergreifend</span>` : '';

            // Format sets if available
            const setsDisplay = req.sets && req.sets.length > 0
                ? req.sets.map(s => `${s.playerA}:${s.playerB}`).join(', ')
                : '';

            return `
                <div class="bg-white rounded-lg shadow p-4 mb-3" data-request-id="${req.id}">
                    <div class="flex flex-col gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <div class="flex items-center flex-wrap gap-1">
                                    <span class="font-medium">${playerA?.first_name || 'Spieler A'} ${playerA?.last_name || ''}</span>
                                    <span class="text-gray-500 mx-1">vs</span>
                                    <span class="font-medium">${playerB?.first_name || 'Spieler B'} ${playerB?.last_name || ''}</span>
                                    ${sportBadge}
                                    ${crossClubBadge}
                                </div>
                                ${setsDisplay ? `<p class="text-sm text-gray-500 mt-1">Ergebnis: ${setsDisplay}</p>` : ''}
                            </div>
                            <div class="flex gap-2">
                                <button class="approve-request bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600" data-id="${req.id}" title="Genehmigen">
                                    <i class="fas fa-check"></i>
                                </button>
                                <button class="reject-request bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600" data-id="${req.id}" title="Ablehnen">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Set up event delegation for approve/reject buttons
        // Remove any existing handler first to prevent duplicates
        const newContainer = container.cloneNode(false);
        newContainer.innerHTML = container.innerHTML;
        container.parentNode.replaceChild(newContainer, container);

        newContainer.addEventListener('click', async (e) => {
            const approveBtn = e.target.closest('.approve-request');
            const rejectBtn = e.target.closest('.reject-request');

            if (approveBtn) {
                const requestId = approveBtn.dataset.id;
                await handleCoachApproval(requestId, true, userData);
            } else if (rejectBtn) {
                const requestId = rejectBtn.dataset.id;
                await handleCoachApproval(requestId, false, userData);
            }
        });

        if (badge) {
            badge.textContent = allRequests.length;
            badge.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Error loading coach match requests:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden der Anfragen</p>';
    }
}

/**
 * Handle coach approval/rejection of match request
 * Creates the actual match if approved
 */
async function handleCoachApproval(requestId, approve, userData) {
    const supabase = getSupabase();

    try {
        if (!approve) {
            // Rejected - first get the request to notify players
            const { data: rejectedRequest } = await supabase
                .from('match_requests')
                .select('player_a_id, player_b_id')
                .eq('id', requestId)
                .single();

            // Update status
            const { error } = await supabase
                .from('match_requests')
                .update({
                    status: 'rejected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (error) throw error;

            // Notify both players that the match was rejected
            if (rejectedRequest) {
                await createNotification(
                    rejectedRequest.player_a_id,
                    'match_coach_rejected',
                    'Spiel abgelehnt',
                    'Der Coach hat euer Spiel abgelehnt.'
                );
                await createNotification(
                    rejectedRequest.player_b_id,
                    'match_coach_rejected',
                    'Spiel abgelehnt',
                    'Der Coach hat euer Spiel abgelehnt.'
                );
            }

            alert('Anfrage abgelehnt');
            loadCoachMatchRequests(userData, supabase);
            loadCoachProcessedRequests(userData, supabase);
            return;
        }

        // Approved - get the request details
        const { data: request, error: fetchError } = await supabase
            .from('match_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        // Update approvals JSON
        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }

        // Mark this coach as approved
        // For cross-club matches, we track which coach approved
        // The first coach to approve releases the match
        if (request.is_cross_club) {
            // Determine if this coach is for player A or player B (single sport model)
            const { data: playerAProfile } = await supabase
                .from('profiles')
                .select('club_id')
                .eq('id', request.player_a_id)
                .single();

            // Determine which side the approving coach is on
            if (playerAProfile?.club_id === userData.clubId) {
                approvals.coach_a = true;
            } else {
                approvals.coach_b = true;
            }
        } else {
            // Same club - single coach approval
            approvals.coach_a = true;
        }

        // Create the match (first coach to approve releases it)
        const { error: matchError } = await supabase
            .from('matches')
            .insert({
                player_a_id: request.player_a_id,
                player_b_id: request.player_b_id,
                club_id: request.club_id,
                sport_id: request.sport_id,
                winner_id: request.winner_id,
                loser_id: request.loser_id,
                sets: request.sets,
                match_mode: request.match_mode,
                handicap_used: request.handicap_used,
                handicap: request.handicap,
                is_cross_club: request.is_cross_club,
                match_request_id: request.id,
                created_at: new Date().toISOString()
            });

        if (matchError) throw matchError;

        // Update the request status to approved
        const { error: updateError } = await supabase
            .from('match_requests')
            .update({
                status: 'approved',
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Notify both players that the match was approved
        await createNotification(
            request.player_a_id,
            'match_approved',
            'Spiel freigegeben',
            'Euer Spiel wurde vom Coach freigegeben und eingetragen!'
        );
        await createNotification(
            request.player_b_id,
            'match_approved',
            'Spiel freigegeben',
            'Euer Spiel wurde vom Coach freigegeben und eingetragen!'
        );

        console.log('[Coach] Match approved and created:', requestId);
        alert('Match genehmigt und erstellt!');

        // Reload both lists
        loadCoachMatchRequests(userData, supabase);
        loadCoachProcessedRequests(userData, supabase);

    } catch (error) {
        console.error('Error handling coach approval:', error);
        alert('Fehler beim Verarbeiten: ' + error.message);
    }
}

/**
 * Loads and renders processed match requests for coach (approved/rejected)
 * Multi-sport: Shows sport badge
 */
export async function loadCoachProcessedRequests(userData, supabaseClient) {
    const container = document.getElementById('coach-processed-requests-list');
    if (!container) return;

    const supabase = getSupabase();

    try {
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select(`
                *,
                player_a:profiles!match_requests_player_a_id_fkey(id, first_name, last_name),
                player_b:profiles!match_requests_player_b_id_fkey(id, first_name, last_name),
                sports(display_name)
            `)
            .eq('club_id', userData.clubId)
            .neq('status', 'pending_coach')
            .neq('status', 'pending_player')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML =
                '<p class="text-gray-500 text-center py-4">Keine verarbeiteten Anfragen</p>';
            return;
        }

        container.innerHTML = requests.map(req => {
            const statusClass = req.status === 'approved' ? 'text-green-600' : 'text-red-600';
            const statusText = req.status === 'approved' ? 'Genehmigt' : req.status === 'rejected' ? 'Abgelehnt' : req.status;
            const sportBadge = req.sports?.display_name
                ? `<span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full ml-2">${req.sports.display_name}</span>`
                : '';
            return `
                <div class="bg-gray-50 rounded-lg p-3 mb-2">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center">
                            <span>${req.player_a?.first_name || 'Spieler A'} vs ${req.player_b?.first_name || 'Spieler B'}</span>
                            ${sportBadge}
                        </div>
                        <span class="${statusClass} text-sm font-medium">${statusText}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading processed requests:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden</p>';
    }
}

/**
 * Loads saved pairings for a training session
 * Note: Pairings are stored in-memory during sessions, not persisted in DB
 */
export async function loadSavedPairings(supabaseClient, clubId) {
    // Pairings are generated during training sessions and not persisted
    // Return empty array as there's no dedicated pairings table
    return [];
}
