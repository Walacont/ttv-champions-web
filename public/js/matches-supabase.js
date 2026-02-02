// Match-Modul (Supabase-Version)

import { getSupabase } from './supabase-init.js';
import { escapeHtml } from './utils/security.js';
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
import { formatDate, isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils-supabase.js';

/**
 * @param {string} userId - Benutzer-ID
 * @param {string} type - Benachrichtigungstyp
 * @param {string} title - Titel
 * @param {string} message - Nachricht
 * @param {Object} data - Zusätzliche Daten
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

const supabase = getSupabase();

let coachSetScoreInput = null;
let currentPairingsSession = null;
let currentPairingSessionId = null;
let currentPairingPlayerAId = null;
let currentPairingPlayerBId = null;
let currentHandicapData = null;
let currentSportName = 'table_tennis';
let coachPendingTournamentMatches = [];

/**
 * @param {string} sportName - Sportart (table_tennis, tennis, badminton, padel)
 */
export function setCurrentSport(sportName) {
    currentSportName = sportName?.toLowerCase() || 'table_tennis';
    console.log('[Matches] Sport set to:', currentSportName);
}

/**
 * @param {Object} setScoreInput - Set-Score-Input Instanz
 */
export function updateCoachWinnerDisplay(setScoreInput = null) {
    const matchWinnerInfo = document.getElementById('coach-match-winner-info');
    const matchWinnerText = document.getElementById('coach-match-winner-text');

    const inputInstance = setScoreInput || coachSetScoreInput;
    if (!inputInstance || !matchWinnerInfo || !matchWinnerText) return;

    if (typeof inputInstance.getMatchWinner !== 'function') return;

    const winnerData = inputInstance.getMatchWinner();

    if (winnerData && winnerData.winner) {
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
        matchWinnerText.textContent = `Aktueller Stand: ${winnerData.setsA}:${winnerData.setsB} Sätze`;
        matchWinnerInfo.classList.remove('hidden');
    } else {
        matchWinnerInfo.classList.add('hidden');
    }
}

export async function initializeCoachSetScoreInput(currentUserId) {
    const container = document.getElementById('coach-set-score-container');
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const setScoreLabel = document.getElementById('coach-set-score-label');
    const goldenPointCheckbox = document.getElementById('coach-golden-point-checkbox');
    const matchTieBreakCheckbox = document.getElementById('coach-match-tiebreak-checkbox');

    if (!container) return null;

    const sportContext = await getSportContext(currentUserId);
    const sportName = sportContext?.sportName;
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';

    const tennisOptionsContainer = document.getElementById('coach-tennis-options-container');
    if (tennisOptionsContainer) {
        if (isTennisOrPadel) {
            tennisOptionsContainer.classList.remove('hidden');
        } else {
            tennisOptionsContainer.classList.add('hidden');
        }
    }

    if (matchModeSelect) {
        if (isTennisOrPadel || isBadminton) {
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
            const options = {
                mode: mode || 'best-of-3',
                goldenPoint: goldenPointCheckbox?.checked || false,
                matchTieBreak: matchTieBreakCheckbox?.checked || false
            };
            return createTennisScoreInput(container, [], options);
        } else if (isBadminton) {
            return createBadmintonScoreInput(container, [], 'best-of-3');
        } else {
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

export function handleGeneratePairings(clubPlayers, currentSubgroupFilter = 'all', sessionId = null) {
    if (sessionId) {
        currentPairingsSession = sessionId;
    }

    const presentPlayerCheckboxes = document.querySelectorAll('#attendance-player-list input:checked');
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);

    // Nur Spieler paaren, die Grundlagen abgeschlossen haben (Fairness)
    let matchReadyAndPresentPlayers = clubPlayers.filter(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        return presentPlayerIds.includes(player.id) && grundlagen >= 5;
    });

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

    matchReadyAndPresentPlayers.sort((a, b) => (a.eloRating || 0) - (b.eloRating || 0));

    const pairingsByGroup = {};
    const groupSize = 4;

    for (let i = 0; i < matchReadyAndPresentPlayers.length; i += groupSize) {
        const groupNumber = Math.floor(i / groupSize) + 1;
        pairingsByGroup[`Gruppe ${groupNumber}`] = matchReadyAndPresentPlayers.slice(i, i + groupSize);
    }

    const finalPairings = {};
    let leftoverPlayer = null;

    for (const groupName in pairingsByGroup) {
        let playersInGroup = pairingsByGroup[groupName];

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
                    <i class="fas fa-balance-scale-right"></i> ${escapeHtml(handicap.player.firstName)} startet mit
                    <strong>${handicap.points}</strong> ${escapeHtml(unitText)} Vorsprung.
                </p>`;
            }

            const listItem = document.createElement('li');
            listItem.className = 'bg-white p-3 rounded-md shadow-sm border';
            listItem.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <span class="font-semibold">${escapeHtml(playerA.firstName)} ${escapeHtml(playerA.lastName)}</span>
                        <span class="text-gray-400 mx-2">vs</span>
                        <span class="font-semibold">${escapeHtml(playerB.firstName)} ${escapeHtml(playerB.lastName)}</span>
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
 * Speichert Match in Datenbank (ELO-Berechnung erfolgt automatisch durch DB-Trigger)
 */
export async function saveMatchResult(matchData, currentUserData) {
    try {
        const { playerAId, playerBId, winnerId, loserId, sets, handicapUsed, matchMode } = matchData;

        // Sets müssen gezählt werden, da verschiedene Formate möglich sind
        let playerASetsWon = 0;
        let playerBSetsWon = 0;

        if (sets && sets.length > 0) {
            sets.forEach(set => {
                const scoreA = set.playerA ?? set.player_a ?? 0;
                const scoreB = set.playerB ?? set.player_b ?? 0;
                if (scoreA > scoreB) playerASetsWon++;
                else if (scoreB > scoreA) playerBSetsWon++;
            });
        }

        const playedAt = new Date().toISOString();

        // ELO-Berechnung erfolgt automatisch durch DB-Trigger
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
                played_at: playedAt,
                sport_id: currentUserData.activeSportId || currentUserData.active_sport_id || null,
                handicap_used: handicapUsed || false,
                match_mode: matchMode || 'best-of-5'
            })
            .select()
            .single();

        if (error) throw error;

        console.log('[Matches] Match saved successfully:', data.id);

        try {
            const { data: playersData } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', [playerAId, playerBId]);

            const playerMap = {};
            (playersData || []).forEach(p => {
                playerMap[p.id] = `${p.first_name} ${p.last_name}`;
            });

            const winnerName = playerMap[winnerId] || 'Gegner';
            const loserName = playerMap[loserId] || 'Gegner';

            const winnerEloChange = winnerId === playerAId
                ? (data.player_a_elo_after - data.player_a_elo_before)
                : (data.player_b_elo_after - data.player_b_elo_before);
            const loserEloChange = loserId === playerAId
                ? (data.player_a_elo_after - data.player_a_elo_before)
                : (data.player_b_elo_after - data.player_b_elo_before);

            const winnerPoints = Math.max(10, Math.abs(winnerEloChange) || 10);
            const loserPoints = 0;

            const matchType = handicapUsed ? 'Handicap-Einzel' : 'Einzel';
            const setsDisplay = `${playerASetsWon}:${playerBSetsWon}`;

            const { error: winnerHistoryError } = await supabase
                .from('points_history')
                .insert({
                    user_id: winnerId,
                    points: winnerPoints,
                    xp: winnerPoints,
                    elo_change: winnerEloChange || 0,
                    reason: `Sieg im ${matchType} gegen ${loserName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (winnerHistoryError) {
                console.warn('[Matches] Error creating winner points history:', winnerHistoryError);
            }

            const { error: loserHistoryError } = await supabase
                .from('points_history')
                .insert({
                    user_id: loserId,
                    points: loserPoints,
                    xp: loserPoints,
                    elo_change: loserEloChange || 0,
                    reason: `Niederlage im ${matchType} gegen ${winnerName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (loserHistoryError) {
                console.warn('[Matches] Error creating loser points history:', loserHistoryError);
            }

            if (!winnerHistoryError) {
                await supabase.rpc('add_player_points', {
                    p_user_id: winnerId,
                    p_points: winnerPoints,
                    p_xp: winnerPoints
                });
            }
            if (!loserHistoryError) {
                await supabase.rpc('add_player_points', {
                    p_user_id: loserId,
                    p_points: loserPoints,
                    p_xp: loserPoints
                });
            }

        } catch (historyError) {
            // Fehler bei History-Erstellung soll Match-Speicherung nicht verhindern
            console.warn('[Matches] Error creating points history entries:', historyError);
        }

        return { success: true, match: data };

    } catch (error) {
        console.error('[Matches] Error saving match:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lädt Matches mit Real-time Updates
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

    fetchClubMatches(clubId, limit).then(callback);

    return () => supabase.removeChannel(channel);
}

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

    // Konvertierung zu camelCase für Kompatibilität
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

    // Check for tournament matches between selected players
    checkCoachTournamentMatches(playerAId, playerBId);
}

async function checkCoachTournamentMatches(playerAId, playerBId) {
    const tournamentInfo = document.getElementById('coach-tournament-match-info');
    const tournamentOptions = document.getElementById('coach-tournament-match-options');
    if (!tournamentInfo || !tournamentOptions) return;

    if (!playerAId || !playerBId || playerAId === playerBId) {
        tournamentInfo.classList.add('hidden');
        coachPendingTournamentMatches = [];
        return;
    }

    try {
        const { data: matches, error } = await supabase
            .from('tournament_matches')
            .select(`
                id, round_number, status, player_a_id, player_b_id,
                tournament:tournament_id(id, name, status, match_mode)
            `)
            .in('status', ['pending', 'in_progress'])
            .or(`and(player_a_id.eq.${playerAId},player_b_id.eq.${playerBId}),and(player_a_id.eq.${playerBId},player_b_id.eq.${playerAId})`);

        if (error) throw error;

        const activeMatches = (matches || []).filter(m =>
            m.tournament?.status === 'in_progress'
        );

        coachPendingTournamentMatches = activeMatches;

        if (activeMatches.length > 0) {
            tournamentOptions.innerHTML = activeMatches.map((m, idx) => {
                const tournamentName = escapeHtml(m.tournament?.name || 'Turnier');
                return `
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="coach-tournament-match-${idx}"
                            class="coach-tournament-match-checkbox h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            data-tournament-match-id="${m.id}"
                            ${activeMatches.length === 1 ? 'checked' : ''}
                        />
                        <label for="coach-tournament-match-${idx}" class="text-sm text-indigo-700">
                            Für <strong>${tournamentName}</strong> (Runde ${m.round_number}) werten
                        </label>
                    </div>
                `;
            }).join('');

            tournamentOptions.querySelectorAll('.coach-tournament-match-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        tournamentOptions.querySelectorAll('.coach-tournament-match-checkbox').forEach(other => {
                            if (other !== e.target) other.checked = false;
                        });
                    }
                });
            });

            tournamentInfo.classList.remove('hidden');
        } else {
            tournamentInfo.classList.add('hidden');
        }
    } catch (err) {
        console.error('[Matches] Error checking coach tournament matches:', err);
        coachPendingTournamentMatches = [];
        tournamentInfo.classList.add('hidden');
    }
}

function getCoachSelectedTournamentMatchId() {
    const checked = document.querySelector('.coach-tournament-match-checkbox:checked');
    return checked ? checked.dataset.tournamentMatchId : null;
}

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

export { calculateHandicap };

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

    // Sets müssen gezählt werden, da verschiedene Formate möglich sind
    let setsA = 0;
    let setsB = 0;
    if (sets && sets.length > 0) {
        sets.forEach(set => {
            const scoreA = set.playerA ?? set.player_a ?? 0;
            const scoreB = set.playerB ?? set.player_b ?? 0;
            if (scoreA > scoreB) setsA++;
            else if (scoreB > scoreA) setsB++;
        });
    }

    const winnerId = setsA > setsB ? playerAId : playerBId;
    const playerA = clubPlayers.find(p => p.id === playerAId);
    const playerB = clubPlayers.find(p => p.id === playerBId);

    if (!playerA || !playerB) {
        if (feedbackEl) feedbackEl.textContent = 'Spielerdaten nicht gefunden.';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';

    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const matchMode = matchModeSelect?.value || 'best-of-5';
    const handicapToggle = document.getElementById('handicap-toggle');
    const handicapUsed = handicapToggle?.checked || false;

    try {
        const supabase = getSupabase();

        const coachTournamentMatchId = getCoachSelectedTournamentMatchId();

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

        if (coachTournamentMatchId) {
            matchData.tournament_match_id = coachTournamentMatchId;
        }

        console.log('[Matches] Saving match with data:', matchData);
        console.log('[Matches] Player A:', playerA);
        console.log('[Matches] Player B:', playerB);

        // ELO-Berechnung erfolgt automatisch durch DB-Trigger
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

        // Turnier-Match verknüpfen, falls vorhanden
        if (coachTournamentMatchId && match) {
            try {
                const { recordTournamentMatchResult } = await import('./tournaments-supabase.js');
                await recordTournamentMatchResult(coachTournamentMatchId, match.id);
                console.log('[Matches] Tournament match result recorded for:', coachTournamentMatchId);
            } catch (tournamentErr) {
                console.error('[Matches] Error recording tournament match result:', tournamentErr);
            }
        }

        if (feedbackEl) {
            feedbackEl.textContent = 'Match erfolgreich gespeichert!';
            feedbackEl.classList.remove('text-red-600');
            feedbackEl.classList.add('text-green-600');
        }

        try {
            const loserId = winnerId === playerAId ? playerBId : playerAId;

            const { data: playersData } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', [playerAId, playerBId]);

            const playerNameMap = {};
            (playersData || []).forEach(p => {
                playerNameMap[p.id] = `${p.first_name} ${p.last_name}`;
            });

            const displayWinnerName = playerNameMap[winnerId] || 'Gegner';
            const displayLoserName = playerNameMap[loserId] || 'Gegner';

            const winnerEloChange = winnerId === playerAId
                ? (match.player_a_elo_after - match.player_a_elo_before)
                : (match.player_b_elo_after - match.player_b_elo_before);
            const loserEloChange = loserId === playerAId
                ? (match.player_a_elo_after - match.player_a_elo_before)
                : (match.player_b_elo_after - match.player_b_elo_before);

            const winnerPoints = Math.max(10, Math.abs(winnerEloChange) || 10);
            const loserPoints = 0;

            const matchType = handicapUsed ? 'Handicap-Einzel' : 'Einzel';
            const setsDisplay = `${setsA}:${setsB}`;
            const playedAt = match.played_at || new Date().toISOString();

            const { error: winnerHistoryError } = await supabase
                .from('points_history')
                .insert({
                    user_id: winnerId,
                    points: winnerPoints,
                    xp: winnerPoints,
                    elo_change: winnerEloChange || 0,
                    reason: `Sieg im ${matchType} gegen ${displayLoserName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (winnerHistoryError) {
                console.warn('[Matches] Error creating winner points history:', winnerHistoryError);
            }

            const { error: loserHistoryError } = await supabase
                .from('points_history')
                .insert({
                    user_id: loserId,
                    points: loserPoints,
                    xp: loserPoints,
                    elo_change: loserEloChange || 0,
                    reason: `Niederlage im ${matchType} gegen ${displayWinnerName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (loserHistoryError) {
                console.warn('[Matches] Error creating loser points history:', loserHistoryError);
            }

            console.log('[Matches] Points history entries created for match');
        } catch (historyError) {
            console.warn('[Matches] Error creating points history entries:', historyError);
        }

        document.getElementById('player-a-select').value = '';
        document.getElementById('player-b-select').value = '';
        if (coachSetScoreInput && typeof coachSetScoreInput.reset === 'function') {
            coachSetScoreInput.reset();
        }
        // Reset tournament match state
        coachPendingTournamentMatches = [];
        const tournamentInfo = document.getElementById('coach-tournament-match-info');
        if (tournamentInfo) tournamentInfo.classList.add('hidden');

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
 * @param {boolean} includeOfflinePlayers - Für Coach-Dashboard: auch Offline-Spieler
 */
export function populateMatchDropdowns(clubPlayers, currentSubgroupFilter = 'all', excludePlayerId = null, currentGenderFilter = 'all', includeOfflinePlayers = false) {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    if (!playerASelect || !playerBSelect) return;

    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';

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
        // Coach-Dashboard: Offline-Spieler einbeziehen
        // Spieler-Dashboard: Offline-Spieler ausschließen (nur Doppel)
        if (includeOfflinePlayers) {
            return isMatchReady === true;
        }
        return isMatchReady === true && !isOffline;
    });

    const lockedPlayers = clubPlayers.filter(p => {
        const isMatchReady = p.isMatchReady || p.is_match_ready;
        return isMatchReady !== true;
    });

    console.log('[Matches] populateMatchDropdowns:', {
        totalPlayers: clubPlayers.length,
        matchReadyBefore: matchReadyPlayers.length,
        matchReadyPlayers: matchReadyPlayers.map(p => `${p.firstName || p.first_name} ${p.lastName || p.last_name}`),
        lockedPlayers: lockedPlayers.map(p => `${p.firstName || p.first_name} ${p.lastName || p.last_name}`),
        subgroupFilter: currentSubgroupFilter,
        genderFilter: currentGenderFilter,
        excludePlayerId
    });

    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            console.log('[Matches] Filtering by age group:', currentSubgroupFilter);
            matchReadyPlayers = filterPlayersByAgeGroup(matchReadyPlayers, currentSubgroupFilter);
            console.log('[Matches] After age filter:', matchReadyPlayers.length);
        } else if (!isGenderFilter(currentSubgroupFilter)) {
            console.log('[Matches] Filtering by custom subgroup:', currentSubgroupFilter);
            matchReadyPlayers = matchReadyPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
            console.log('[Matches] After custom subgroup filter:', matchReadyPlayers.length);
        }
    }

    if (currentGenderFilter && currentGenderFilter !== 'all' && currentGenderFilter !== 'gender_all') {
        console.log('[Matches] Filtering by gender:', currentGenderFilter);
        matchReadyPlayers = filterPlayersByGender(matchReadyPlayers, currentGenderFilter);
        console.log('[Matches] After gender filter:', matchReadyPlayers.length);
    }

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
 * Multi-Sport: Zeigt Sport-Badge und vereinsübergreifende Matches
 * Beide Coaches können vereinsübergreifende Anfragen sehen und genehmigen
 */
export async function loadCoachMatchRequests(userData, supabaseClient) {
    const container = document.getElementById('coach-pending-requests-list');
    const badge = document.getElementById('coach-match-request-badge');
    if (!container) return;

    const supabase = getSupabase();

    try {
        const { data: clubMembers } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', userData.clubId);

        const clubMemberIds = (clubMembers || []).map(m => m.id);

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

        // Nur Anfragen zeigen, bei denen mindestens ein Spieler in unserem Verein ist
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

        container.innerHTML = allRequests.map(req => {
            const playerA = req.playerAData;
            const playerB = req.playerBData;
            const sportBadge = req.sportName ? `<span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full ml-2">${req.sportName}</span>` : '';
            const crossClubBadge = req.is_cross_club ? `<span class="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full ml-1">Vereinsübergreifend</span>` : '';

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

        // Event-Delegation vermeidet Duplikate
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
 * Erstellt Match bei Genehmigung, aktualisiert Status bei Ablehnung
 */
async function handleCoachApproval(requestId, approve, userData) {
    const supabase = getSupabase();

    try {
        if (!approve) {
            const { data: rejectedRequest } = await supabase
                .from('match_requests')
                .select('player_a_id, player_b_id')
                .eq('id', requestId)
                .single();

            const { error } = await supabase
                .from('match_requests')
                .update({
                    status: 'rejected',
                    updated_at: new Date().toISOString()
                })
                .eq('id', requestId);

            if (error) throw error;

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

        const { data: request, error: fetchError } = await supabase
            .from('match_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }

        // Vereinsübergreifend: beide Coaches müssen genehmigen
        // Erster Coach gibt Match frei
        if (request.is_cross_club) {
            const { data: playerAProfile } = await supabase
                .from('profiles')
                .select('club_id')
                .eq('id', request.player_a_id)
                .single();

            if (playerAProfile?.club_id === userData.clubId) {
                approvals.coach_a = true;
            } else {
                approvals.coach_b = true;
            }
        } else {
            approvals.coach_a = true;
        }

        const { data: match, error: matchError } = await supabase
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
            })
            .select()
            .single();

        if (matchError) throw matchError;

        try {
            const winnerId = request.winner_id;
            const loserId = request.loser_id;
            const playerAId = request.player_a_id;

            const { data: playersData } = await supabase
                .from('profiles')
                .select('id, first_name, last_name')
                .in('id', [request.player_a_id, request.player_b_id]);

            const playerNameMap = {};
            (playersData || []).forEach(p => {
                playerNameMap[p.id] = `${p.first_name} ${p.last_name}`;
            });

            const displayWinnerName = playerNameMap[winnerId] || 'Gegner';
            const displayLoserName = playerNameMap[loserId] || 'Gegner';

            const winnerEloChange = winnerId === playerAId
                ? (match.player_a_elo_after - match.player_a_elo_before)
                : (match.player_b_elo_after - match.player_b_elo_before);
            const loserEloChange = loserId === playerAId
                ? (match.player_a_elo_after - match.player_a_elo_before)
                : (match.player_b_elo_after - match.player_b_elo_before);

            const winnerPoints = Math.max(10, Math.abs(winnerEloChange) || 10);
            const loserPoints = 0;

            let setsA = 0, setsB = 0;
            if (request.sets && request.sets.length > 0) {
                request.sets.forEach(set => {
                    const scoreA = set.playerA ?? set.player_a ?? 0;
                    const scoreB = set.playerB ?? set.player_b ?? 0;
                    if (scoreA > scoreB) setsA++;
                    else if (scoreB > scoreA) setsB++;
                });
            }

            const matchType = request.handicap_used ? 'Handicap-Einzel' : 'Einzel';
            const setsDisplay = `${setsA}:${setsB}`;
            const playedAt = match.played_at || match.created_at || new Date().toISOString();

            const { error: winnerHistoryError } = await supabase
                .from('points_history')
                .insert({
                    user_id: winnerId,
                    points: winnerPoints,
                    xp: winnerPoints,
                    elo_change: winnerEloChange || 0,
                    reason: `Sieg im ${matchType} gegen ${displayLoserName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (winnerHistoryError) {
                console.warn('[Coach] Error creating winner points history:', winnerHistoryError);
            }

            const { error: loserHistoryError } = await supabase
                .from('points_history')
                .insert({
                    user_id: loserId,
                    points: loserPoints,
                    xp: loserPoints,
                    elo_change: loserEloChange || 0,
                    reason: `Niederlage im ${matchType} gegen ${displayWinnerName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (loserHistoryError) {
                console.warn('[Coach] Error creating loser points history:', loserHistoryError);
            }

            console.log('[Coach] Points history entries created for approved match');
        } catch (historyError) {
            console.warn('[Coach] Error creating points history entries:', historyError);
        }

        const { error: updateError } = await supabase
            .from('match_requests')
            .update({
                status: 'approved',
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

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

        loadCoachMatchRequests(userData, supabase);
        loadCoachProcessedRequests(userData, supabase);

    } catch (error) {
        console.error('Error handling coach approval:', error);
        alert('Fehler beim Verarbeiten: ' + error.message);
    }
}

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
 * Paarungen werden während Trainings generiert, nicht in DB gespeichert
 */
export async function loadSavedPairings(supabaseClient, clubId) {
    return [];
}

export async function loadPendingPlayerConfirmations(userId) {
    const supabase = getSupabase();

    try {
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select(`
                *,
                player_a:player_a_id(id, first_name, last_name, display_name, elo_rating),
                player_b:player_b_id(id, first_name, last_name, display_name, elo_rating),
                sports(id, display_name),
                tournament_match:tournament_match_id(id, round_number, tournament:tournament_id(id, name))
            `)
            .eq('status', 'pending_player')
            .eq('player_b_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log('[Matches] Loaded pending player confirmations:', requests?.length || 0);
        return requests || [];
    } catch (error) {
        console.error('[Matches] Error loading pending confirmations:', error);
        return [];
    }
}

export async function loadPendingDoublesConfirmations(userId) {
    const supabase = getSupabase();

    try {
        const { data: requests, error } = await supabase
            .from('doubles_match_requests')
            .select(`
                *,
                sports(id, display_name)
            `)
            .eq('status', 'pending_opponent')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const filtered = (requests || []).filter(req => {
            const teamB = req.team_b || {};
            return teamB.player1_id === userId || teamB.player2_id === userId;
        });

        console.log('[Matches] Loaded pending doubles confirmations:', filtered.length);
        return filtered.map(req => ({
            ...req,
            isDoubles: true
        }));
    } catch (error) {
        console.error('[Matches] Error loading pending doubles confirmations:', error);
        return [];
    }
}

export async function loadAllPendingConfirmations(userId) {
    const [singlesRequests, doublesRequests] = await Promise.all([
        loadPendingPlayerConfirmations(userId),
        loadPendingDoublesConfirmations(userId)
    ]);

    const allRequests = [...singlesRequests, ...doublesRequests]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    console.log('[Matches] Total pending confirmations:', allRequests.length,
        `(${singlesRequests.length} singles, ${doublesRequests.length} doubles)`);

    return allRequests;
}

let bottomSheetSubscriptions = [];

export function showMatchConfirmationBottomSheet(requests) {
    if (!requests || requests.length === 0) return;

    const supabase = getSupabase();
    let currentIndex = 0;

    cleanupBottomSheetSubscriptions();

    setupBottomSheetRealtimeSubscriptions(requests, () => currentIndex);

    const renderBottomSheet = (index) => {
        const request = requests[index];

        let playerA, playerB, winnerName, setsA, setsB, playerAElo, playerBElo;

        if (request.isDoubles) {
            const teamA = request.team_a || {};
            const teamB = request.team_b || {};

            playerA = 'Team A';
            playerB = 'Team B (Du)';

            winnerName = request.winning_team === 'A' ? 'Team A' : 'Team B';

            setsA = 0;
            setsB = 0;
            if (request.sets && request.sets.length > 0) {
                request.sets.forEach(set => {
                    const teamAScore = set.teamA || set.team_a || set.a || 0;
                    const teamBScore = set.teamB || set.team_b || set.b || 0;
                    if (teamAScore > teamBScore) setsA++;
                    else if (teamBScore > teamAScore) setsB++;
                });
            }

            playerAElo = '-';
            playerBElo = '-';
        } else {
            playerA = request.player_a?.display_name ||
                           `${request.player_a?.first_name || ''} ${request.player_a?.last_name || ''}`.trim() ||
                           'Spieler A';
            playerB = request.player_b?.display_name ||
                           `${request.player_b?.first_name || ''} ${request.player_b?.last_name || ''}`.trim() ||
                           'Du';

            const winnerId = request.winner_id;
            winnerName = winnerId === request.player_a_id ? playerA : playerB;

            // Sets zählen ist zuverlässiger als gespeicherte Werte
            setsA = 0;
            setsB = 0;
            if (request.sets && request.sets.length > 0) {
                request.sets.forEach(set => {
                    const scoreA = set.playerA ?? set.player_a ?? set.a ?? 0;
                    const scoreB = set.playerB ?? set.player_b ?? set.b ?? 0;
                    if (scoreA > scoreB) setsA++;
                    else if (scoreB > scoreA) setsB++;
                });
            }
            if (setsA === 0 && setsB === 0) {
                setsA = request.player_a_sets_won || 0;
                setsB = request.player_b_sets_won || 0;
            }

            playerAElo = request.player_a?.elo_rating || 800;
            playerBElo = request.player_b?.elo_rating || 800;
        }

        let setsDetails = '';
        if (request.sets && request.sets.length > 0) {
            setsDetails = request.sets.map(s => {
                if (s.playerA !== undefined && s.playerB !== undefined) {
                    return `${s.playerA}:${s.playerB}`;
                } else if (s.player_a !== undefined && s.player_b !== undefined) {
                    return `${s.player_a}:${s.player_b}`;
                }
                else if (s.teamA !== undefined && s.teamB !== undefined) {
                    return `${s.teamA}:${s.teamB}`;
                } else if (s.team_a !== undefined && s.team_b !== undefined) {
                    return `${s.team_a}:${s.team_b}`;
                }
                else if (s.a !== undefined && s.b !== undefined) {
                    return `${s.a}:${s.b}`;
                } else if (Array.isArray(s) && s.length === 2) {
                    return `${s[0]}:${s[1]}`;
                }
                return JSON.stringify(s);
            }).join(', ');
        }
        // Fallback: show set ratio when individual scores not available
        if (!setsDetails) {
            setsDetails = `${setsA}:${setsB} (Schnelleingabe)`;
        }

        console.log('[Matches] Sets data:', request.sets, '→', setsDetails);

        const handicapText = request.handicap_used
            ? '✓ Verwendet'
            : '✗ Nicht verwendet';

        const matchMode = request.match_mode || 'best-of-5';
        const modeDisplay = matchMode === 'best-of-5' ? 'Best of 5' :
                           matchMode === 'best-of-3' ? 'Best of 3' :
                           matchMode === 'best-of-7' ? 'Best of 7' : matchMode;

        const createdBy = playerA;

        const createdAt = request.created_at ? new Date(request.created_at).toLocaleString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Unbekannt';

        const modalHTML = `
            <div id="match-confirmation-bottomsheet" class="fixed inset-0 bg-black/50 flex items-end justify-center z-50 animate-fade-in" style="animation: fadeIn 0.2s ease-out; padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));">
                <div class="bg-white rounded-t-3xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto animate-slide-up" style="animation: slideUp 0.3s ease-out;">
                    <div class="p-6 pb-4">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-bold text-gray-800">
                                Match-Ergebnis bestätigen
                            </h3>
                            <button id="close-bottomsheet" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">
                                ×
                            </button>
                        </div>

                        ${requests.length > 1 ? `
                            <div class="text-sm text-gray-500 text-center mb-4">
                                ${index + 1} von ${requests.length} Einträgen
                            </div>
                        ` : ''}

                        ${request.tournament_match ? `
                            <div class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                                <i class="fas fa-trophy text-indigo-600"></i>
                                <div>
                                    <div class="text-sm font-semibold text-indigo-800">Turnierspiel</div>
                                    <div class="text-xs text-indigo-600">${request.tournament_match.tournament?.name || 'Turnier'} – Runde ${request.tournament_match.round_number}</div>
                                </div>
                            </div>
                        ` : ''}

                        <div class="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 mb-4 border border-indigo-100">
                            <div class="text-sm text-gray-600 mb-2">Spieler:</div>
                            <div class="flex items-center justify-between mb-3">
                                <div class="text-center flex-1">
                                    <div class="font-semibold text-gray-800">${playerA}</div>
                                    <div class="text-xs text-gray-500">Elo: ${playerAElo}</div>
                                </div>
                                <div class="px-4">
                                    <div class="text-2xl font-bold text-gray-700">${setsA} : ${setsB}</div>
                                </div>
                                <div class="text-center flex-1">
                                    <div class="font-semibold text-gray-800">${playerB}</div>
                                    <div class="text-xs text-gray-500">Elo: ${playerBElo}</div>
                                </div>
                            </div>
                            <div class="flex items-center justify-center gap-2 bg-white rounded-lg py-2 px-3">
                                <span class="font-semibold text-indigo-700">${winnerName} gewinnt</span>
                            </div>
                        </div>

                        <div class="space-y-3 mb-6">
                            <div class="flex items-start gap-3">
                                <div class="flex-1">
                                    <div class="text-sm font-medium text-gray-700">Sätze:</div>
                                    <div class="text-sm text-gray-600">${setsDetails}</div>
                                </div>
                            </div>
                            <div class="flex items-start gap-3">
                                <div class="flex-1">
                                    <div class="text-sm font-medium text-gray-700">Handicap:</div>
                                    <div class="text-sm text-gray-600">${handicapText}</div>
                                </div>
                            </div>
                            <div class="flex items-start gap-3">
                                <div class="flex-1">
                                    <div class="text-sm font-medium text-gray-700">Modus:</div>
                                    <div class="text-sm text-gray-600">${modeDisplay}</div>
                                </div>
                            </div>
                            <div class="flex items-start gap-3">
                                <div class="flex-1">
                                    <div class="text-sm font-medium text-gray-700">Gespielt:</div>
                                    <div class="text-sm text-gray-600">${createdAt}</div>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-3 mb-4">
                            <button id="confirm-accept" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
                                <span>Bestätigen</span>
                            </button>
                            <button id="confirm-decline" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors">
                                <span>Ablehnen</span>
                            </button>
                        </div>

                        ${requests.length > 1 ? `
                            <div class="flex items-center justify-center gap-4 pt-2">
                                <button id="prev-request" class="text-indigo-600 hover:text-indigo-700 disabled:text-gray-300 disabled:cursor-not-allowed" ${index === 0 ? 'disabled' : ''}>
                                    <i class="fas fa-chevron-left"></i> Vorherige
                                </button>
                                <button id="next-request" class="text-indigo-600 hover:text-indigo-700 disabled:text-gray-300 disabled:cursor-not-allowed" ${index === requests.length - 1 ? 'disabled' : ''}>
                                    Nächste <i class="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        ` : ''}

                        <div class="text-xs text-center text-gray-400 mt-4">
                            Eingetragen von: ${createdBy}
                        </div>
                    </div>
                </div>
            </div>

            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
            </style>
        `;

        return modalHTML;
    };

    const existingSheet = document.getElementById('match-confirmation-bottomsheet');
    if (existingSheet) {
        existingSheet.remove();
    }

    document.body.insertAdjacentHTML('beforeend', renderBottomSheet(currentIndex));

    const setupListeners = () => {
        const modal = document.getElementById('match-confirmation-bottomsheet');
        const closeBtn = document.getElementById('close-bottomsheet');
        const acceptBtn = document.getElementById('confirm-accept');
        const declineBtn = document.getElementById('confirm-decline');
        const prevBtn = document.getElementById('prev-request');
        const nextBtn = document.getElementById('next-request');

        const closeModal = () => {
            cleanupBottomSheetSubscriptions();
            modal?.remove();
        };

        closeBtn?.addEventListener('click', closeModal);
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        modal?.addEventListener('requestRemoved', (e) => {
            const newIndex = e.detail?.newIndex ?? 0;
            currentIndex = newIndex;
            modal.outerHTML = renderBottomSheet(currentIndex);
            setupListeners();
        });

        acceptBtn?.addEventListener('click', async () => {
            await handlePlayerConfirmation(requests[currentIndex].id, true, null, requests[currentIndex].isDoubles);
            requests.splice(currentIndex, 1);
            if (requests.length > 0) {
                if (currentIndex >= requests.length) currentIndex = requests.length - 1;
                modal.outerHTML = renderBottomSheet(currentIndex);
                setupListeners();
            } else {
                closeModal();
            }
        });

        declineBtn?.addEventListener('click', async () => {
            const reason = prompt('Warum möchtest du dieses Ergebnis ablehnen? (Optional)');
            await handlePlayerConfirmation(requests[currentIndex].id, false, reason, requests[currentIndex].isDoubles);
            requests.splice(currentIndex, 1);
            if (requests.length > 0) {
                if (currentIndex >= requests.length) currentIndex = requests.length - 1;
                modal.outerHTML = renderBottomSheet(currentIndex);
                setupListeners();
            } else {
                closeModal();
            }
        });

        prevBtn?.addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
                modal.outerHTML = renderBottomSheet(currentIndex);
                setupListeners();
            }
        });

        nextBtn?.addEventListener('click', () => {
            if (currentIndex < requests.length - 1) {
                currentIndex++;
                modal.outerHTML = renderBottomSheet(currentIndex);
                setupListeners();
            }
        });
    };

    setupListeners();
}

/**
 * Real-time Updates für Bottom Sheet - überwacht Änderungen/Löschungen
 */
function setupBottomSheetRealtimeSubscriptions(requests, getCurrentIndex) {
    const supabase = getSupabase();

    const singlesIds = requests.filter(r => !r.isDoubles).map(r => r.id);
    const doublesIds = requests.filter(r => r.isDoubles).map(r => r.id);

    if (singlesIds.length > 0) {
        const singlesChannel = supabase
            .channel('bottomsheet-singles-' + Date.now())
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'match_requests',
                    filter: `id=in.(${singlesIds.join(',')})`
                },
                (payload) => {
                    console.log('[BottomSheet] Singles request change:', payload.eventType, payload);
                    handleRequestChange(payload, requests, getCurrentIndex, false);
                }
            )
            .subscribe();

        bottomSheetSubscriptions.push(singlesChannel);
    }

    if (doublesIds.length > 0) {
        const doublesChannel = supabase
            .channel('bottomsheet-doubles-' + Date.now())
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'doubles_match_requests',
                    filter: `id=in.(${doublesIds.join(',')})`
                },
                (payload) => {
                    console.log('[BottomSheet] Doubles request change:', payload.eventType, payload);
                    handleRequestChange(payload, requests, getCurrentIndex, true);
                }
            )
            .subscribe();

        bottomSheetSubscriptions.push(doublesChannel);
    }

    console.log('[BottomSheet] Real-time subscriptions active for', singlesIds.length, 'singles,', doublesIds.length, 'doubles');
}

function handleRequestChange(payload, requests, getCurrentIndex, isDoubles) {
    const { eventType, old: oldRecord, new: newRecord } = payload;

    const requestId = oldRecord?.id || newRecord?.id;
    const requestIndex = requests.findIndex(r => r.id === requestId && r.isDoubles === isDoubles);

    if (requestIndex === -1) return;

    let shouldRemove = false;
    let toastMessage = '';

    if (eventType === 'DELETE') {
        shouldRemove = true;
        toastMessage = 'Anfrage wurde zurückgezogen';
    } else if (eventType === 'UPDATE') {
        const newStatus = newRecord?.status;
        if (newStatus && newStatus !== 'pending_player' && newStatus !== 'pending_opponent') {
            shouldRemove = true;
            if (newStatus === 'withdrawn' || newStatus === 'cancelled') {
                toastMessage = 'Anfrage wurde zurückgezogen';
            }
        }
    }

    if (shouldRemove) {
        requests.splice(requestIndex, 1);

        if (toastMessage) {
            showToast(toastMessage, 'info');
        }

        const modal = document.getElementById('match-confirmation-bottomsheet');
        if (!modal) return;

        if (requests.length === 0) {
            cleanupBottomSheetSubscriptions();
            modal.remove();
        } else {
            let currentIndex = getCurrentIndex();
            if (currentIndex >= requests.length) {
                currentIndex = requests.length - 1;
            }
            modal.dispatchEvent(new CustomEvent('requestRemoved', { detail: { newIndex: currentIndex } }));
        }
    }
}

function cleanupBottomSheetSubscriptions() {
    const supabase = getSupabase();
    bottomSheetSubscriptions.forEach(channel => {
        try {
            supabase.removeChannel(channel);
        } catch (e) {
            console.warn('[BottomSheet] Error removing channel:', e);
        }
    });
    bottomSheetSubscriptions = [];
    console.log('[BottomSheet] Subscriptions cleaned up');
}

async function handlePlayerConfirmation(requestId, approved, declineReason = null, isDoubles = false) {
    const supabase = getSupabase();

    try {
        if (approved) {
            if (isDoubles) {
                const { data: request } = await supabase
                    .from('doubles_match_requests')
                    .select('*')
                    .eq('id', requestId)
                    .single();

                if (!request) throw new Error('Doubles match request not found');

                // Prüfen ob Anfrage bereits bearbeitet wurde (verhindert Duplikate)
                if (request.status === 'approved') {
                    console.warn('[Matches] Doubles request already approved, skipping');
                    showToast('Match wurde bereits bestätigt!', 'info');
                    return;
                }
                if (request.status === 'rejected') {
                    console.warn('[Matches] Doubles request already rejected, skipping');
                    showToast('Match wurde bereits abgelehnt!', 'info');
                    return;
                }

                const { data: match, error: matchError } = await supabase
                    .from('doubles_matches')
                    .insert({
                        team_a: request.team_a,
                        team_b: request.team_b,
                        winning_team: request.winning_team,
                        sets: request.sets || [],
                        club_id: request.club_id,
                        initiated_by: request.initiated_by,
                        sport_id: request.sport_id,
                        match_mode: request.match_mode || 'best-of-5',
                        handicap_used: request.handicap_used || false,
                        played_at: request.created_at || new Date().toISOString()
                    })
                    .select()
                    .single();

                if (matchError) {
                    console.error('[Matches] Doubles match creation error:', matchError);
                    throw new Error(`Fehler beim Erstellen des Doppel-Matches: ${matchError.message || matchError.code}`);
                }

                const { error: statusError } = await supabase
                    .from('doubles_match_requests')
                    .update({ status: 'approved' })
                    .eq('id', requestId);

                if (statusError) {
                    console.error('[Matches] Error updating doubles request status:', statusError);
                    // Match wurde bereits erstellt - Status-Update kritisch
                    throw new Error(`Match erstellt, aber Status-Update fehlgeschlagen: ${statusError.message}`);
                }

                console.log('[Matches] Doubles match confirmed and created');
                showToast('Doppel-Match bestätigt!', 'success');
            } else {
                const { data: request } = await supabase
                    .from('match_requests')
                    .select('*')
                    .eq('id', requestId)
                    .single();

                if (!request) throw new Error('Match request not found');

                // Prüfen ob Anfrage bereits bearbeitet wurde (verhindert Duplikate)
                if (request.status === 'approved') {
                    console.warn('[Matches] Request already approved, skipping');
                    showToast('Match wurde bereits bestätigt!', 'info');
                    return;
                }
                if (request.status === 'rejected') {
                    console.warn('[Matches] Request already rejected, skipping');
                    showToast('Match wurde bereits abgelehnt!', 'info');
                    return;
                }

                const matchInsertData = {
                    player_a_id: request.player_a_id,
                    player_b_id: request.player_b_id,
                    winner_id: request.winner_id,
                    loser_id: request.winner_id === request.player_a_id ? request.player_b_id : request.player_a_id,
                    player_a_sets_won: request.player_a_sets_won,
                    player_b_sets_won: request.player_b_sets_won,
                    sets: request.sets || [],
                    club_id: request.club_id,
                    created_by: request.created_by,
                    sport_id: request.sport_id,
                    match_mode: request.match_mode || 'best-of-5',
                    handicap_used: request.handicap_used || false,
                    played_at: request.created_at || new Date().toISOString()
                };

                // Link tournament match if present
                if (request.tournament_match_id) {
                    matchInsertData.tournament_match_id = request.tournament_match_id;
                }

                const { data: match, error: matchError } = await supabase
                    .from('matches')
                    .insert(matchInsertData)
                    .select()
                    .single();

                if (matchError) {
                    console.error('[Matches] Match creation error:', matchError);
                    console.error('[Matches] Request data:', request);
                    throw new Error(`Fehler beim Erstellen des Matches: ${matchError.message || matchError.code}`);
                }

                const { error: statusError } = await supabase
                    .from('match_requests')
                    .update({ status: 'approved' })
                    .eq('id', requestId);

                if (statusError) {
                    console.error('[Matches] Error updating request status:', statusError);
                    // Match wurde bereits erstellt - Status-Update kritisch
                    throw new Error(`Match erstellt, aber Status-Update fehlgeschlagen: ${statusError.message}`);
                }

                try {
                    const winnerId = request.winner_id;
                    const loserId = winnerId === request.player_a_id ? request.player_b_id : request.player_a_id;
                    const playerAId = request.player_a_id;

                    const { data: playersData } = await supabase
                        .from('profiles')
                        .select('id, first_name, last_name')
                        .in('id', [request.player_a_id, request.player_b_id]);

                    const playerNameMap = {};
                    (playersData || []).forEach(p => {
                        playerNameMap[p.id] = `${p.first_name} ${p.last_name}`;
                    });

                    const displayWinnerName = playerNameMap[winnerId] || 'Gegner';
                    const displayLoserName = playerNameMap[loserId] || 'Gegner';

                    const winnerEloChange = winnerId === playerAId
                        ? (match.player_a_elo_after - match.player_a_elo_before)
                        : (match.player_b_elo_after - match.player_b_elo_before);
                    const loserEloChange = loserId === playerAId
                        ? (match.player_a_elo_after - match.player_a_elo_before)
                        : (match.player_b_elo_after - match.player_b_elo_before);

                    const winnerPoints = Math.max(10, Math.abs(winnerEloChange) || 10);
                    const loserPoints = 0;

                    const matchType = request.handicap_used ? 'Handicap-Einzel' : 'Einzel';

                    // Sets müssen gezählt werden, da verschiedene Formate möglich sind
                    let setsA = 0, setsB = 0;
                    if (request.sets && request.sets.length > 0) {
                        request.sets.forEach(set => {
                            const scoreA = set.playerA ?? set.player_a ?? 0;
                            const scoreB = set.playerB ?? set.player_b ?? 0;
                            if (scoreA > scoreB) setsA++;
                            else if (scoreB > scoreA) setsB++;
                        });
                    }
                    const setsDisplay = `${setsA}:${setsB}`;
                    const playedAt = match.played_at || new Date().toISOString();

                    const { error: winnerHistoryError } = await supabase
                        .from('points_history')
                        .insert({
                            user_id: winnerId,
                            points: winnerPoints,
                            xp: winnerPoints,
                            elo_change: winnerEloChange || 0,
                            reason: `Sieg im ${matchType} gegen ${displayLoserName} (${setsDisplay})`,
                            timestamp: playedAt,
                            awarded_by: 'System (Wettkampf)'
                        });

                    if (winnerHistoryError) {
                        console.warn('[Matches] Error creating winner points history:', winnerHistoryError);
                    }

                    const { error: loserHistoryError } = await supabase
                        .from('points_history')
                        .insert({
                            user_id: loserId,
                            points: loserPoints,
                            xp: loserPoints,
                            elo_change: loserEloChange || 0,
                            reason: `Niederlage im ${matchType} gegen ${displayWinnerName} (${setsDisplay})`,
                            timestamp: playedAt,
                            awarded_by: 'System (Wettkampf)'
                        });

                    if (loserHistoryError) {
                        console.warn('[Matches] Error creating loser points history:', loserHistoryError);
                    }

                    console.log('[Matches] Points history entries created for confirmed match');
                } catch (historyError) {
                    console.warn('[Matches] Error creating points history entries:', historyError);
                }

                // Turnier-Match verknüpfen, falls vorhanden
                if (request.tournament_match_id && match) {
                    const { recordTournamentMatchResult } = await import('./tournaments-supabase.js');
                    await recordTournamentMatchResult(request.tournament_match_id, match.id);
                }

                console.log('[Matches] Match confirmed and created');
                showToast('Match bestätigt!', 'success');
            }
        } else {
            const table = isDoubles ? 'doubles_match_requests' : 'match_requests';
            await supabase
                .from(table)
                .update({
                    status: 'rejected',
                    decline_reason: declineReason
                })
                .eq('id', requestId);

            console.log(`[Matches] ${isDoubles ? 'Doubles ' : ''}Match declined`);
            showToast('Match abgelehnt', 'info');
        }
    } catch (error) {
        console.error('[Matches] Error handling confirmation:', error);
        showToast('Fehler: ' + error.message, 'error');
        throw error;
    }
}

function showToast(message, type = 'info') {
    const colors = {
        info: 'bg-indigo-600',
        success: 'bg-green-600',
        error: 'bg-red-600'
    };

    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
