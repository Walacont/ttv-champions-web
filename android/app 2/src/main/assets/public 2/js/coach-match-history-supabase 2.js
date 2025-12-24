/**
 * Coach Match History Module (Supabase Version)
 * Displays competition history for selected player
 */

// ========================================================================
// ===== POPULATE PLAYER DROPDOWN =====
// ========================================================================

// Store the subscription for cleanup
let coachMatchHistorySubscriptions = [];

/**
 * Populate the player filter dropdown for match history
 * @param {Array} clubPlayers - Array of club players
 * @param {Object} supabase - Supabase client instance
 */
export function populateMatchHistoryPlayerDropdown(clubPlayers, supabase) {
    const select = document.getElementById('match-history-player-filter');
    if (!select) return;

    select.innerHTML = '<option value="">Bitte Spieler wählen...</option>';

    clubPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.firstName} ${player.lastName}`;
        select.appendChild(option);
    });

    // Add event listener for when player is selected
    select.addEventListener('change', e => {
        const playerId = e.target.value;
        if (playerId) {
            loadCoachMatchHistory(playerId, supabase);
        } else {
            const container = document.getElementById('coach-match-history-list');
            if (container) {
                container.innerHTML =
                    '<p class="text-gray-400 text-center py-4 text-sm">Wähle einen Spieler aus...</p>';
            }
        }
    });
}

// ========================================================================
// ===== LOAD AND DISPLAY PLAYER MATCH HISTORY =====
// ========================================================================

/**
 * Clean up subscriptions
 */
function cleanupSubscriptions() {
    coachMatchHistorySubscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
            sub.unsubscribe();
        }
    });
    coachMatchHistorySubscriptions = [];
}

/**
 * Maps singles match from Supabase (snake_case) to app format (camelCase)
 */
function mapSinglesMatchFromSupabase(match) {
    return {
        id: match.id,
        type: 'singles',
        playerAId: match.player_a_id,
        playerBId: match.player_b_id,
        winnerId: match.winner_id,
        loserId: match.loser_id,
        sets: match.sets,
        processed: match.processed,
        handicapUsed: match.handicap_used,
        pointsExchanged: match.points_exchanged,
        timestamp: match.timestamp,
        playedAt: match.played_at,
        createdAt: match.created_at,
        clubId: match.club_id,
        playerIds: match.player_ids
    };
}

/**
 * Maps doubles match from Supabase (snake_case) to app format (camelCase)
 */
function mapDoublesMatchFromSupabase(match) {
    return {
        id: match.id,
        type: 'doubles',
        teamA: {
            player1Id: match.team_a_player1_id,
            player2Id: match.team_a_player2_id
        },
        teamB: {
            player1Id: match.team_b_player1_id,
            player2Id: match.team_b_player2_id
        },
        winningTeam: match.winning_team,
        sets: match.sets,
        processed: match.processed,
        handicapUsed: match.handicap_used,
        timestamp: match.timestamp,
        playedAt: match.played_at,
        createdAt: match.created_at,
        clubId: match.club_id
    };
}

/**
 * Load and display match history for a specific player with real-time updates
 * @param {string} playerId - Player ID to load history for
 * @param {Object} supabase - Supabase client instance
 * @returns {Function} Unsubscribe function to stop listening
 */
export async function loadCoachMatchHistory(playerId, supabase) {
    const container = document.getElementById('coach-match-history-list');
    if (!container) {
        console.error('Coach match history container not found');
        return;
    }

    // Clean up existing subscriptions
    cleanupSubscriptions();

    container.innerHTML =
        '<p class="text-gray-400 text-center py-4 text-sm">Lade Wettkampf-Historie...</p>';

    try {
        // Get player data first
        const { data: playerDoc, error: playerError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', playerId)
            .single();

        if (playerError || !playerDoc) {
            container.innerHTML =
                '<p class="text-red-500 text-center py-4 text-sm">Spieler nicht gefunden</p>';
            return;
        }

        const playerData = {
            id: playerDoc.id,
            firstName: playerDoc.first_name,
            lastName: playerDoc.last_name,
            clubId: playerDoc.club_id,
            eloRating: playerDoc.elo_rating
        };
        const playerName = `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim();

        console.log(
            '[Coach Match History] Setting up real-time listener for:',
            playerName,
            'clubId:',
            playerData.clubId
        );

        // Function to fetch and render matches
        async function fetchAndRenderMatches() {
            try {
                // Fetch SINGLES matches for this club
                const { data: singlesData, error: singlesError } = await supabase
                    .from('matches')
                    .select('*')
                    .eq('club_id', playerData.clubId)
                    .eq('processed', true)
                    .limit(100);

                if (singlesError) console.error('Error fetching singles:', singlesError);

                // Fetch DOUBLES matches for this club
                const { data: doublesData, error: doublesError } = await supabase
                    .from('doubles_matches')
                    .select('*')
                    .eq('club_id', playerData.clubId)
                    .eq('processed', true)
                    .limit(100);

                if (doublesError) console.error('Error fetching doubles:', doublesError);

                console.log(
                    '[Coach Match History] Real-time update received:',
                    (singlesData || []).length, 'singles,',
                    (doublesData || []).length, 'doubles'
                );

                // Filter singles matches where player is involved
                const singlesMatches = (singlesData || [])
                    .map(m => mapSinglesMatchFromSupabase(m))
                    .filter(match => {
                        return (
                            match.playerAId === playerId ||
                            match.playerBId === playerId ||
                            match.winnerId === playerId ||
                            match.loserId === playerId ||
                            (match.playerIds && match.playerIds.includes(playerId))
                        );
                    });

                // Filter doubles matches where player is involved
                const doublesMatches = (doublesData || [])
                    .map(m => mapDoublesMatchFromSupabase(m))
                    .filter(match => {
                        return (
                            match.teamA?.player1Id === playerId ||
                            match.teamA?.player2Id === playerId ||
                            match.teamB?.player1Id === playerId ||
                            match.teamB?.player2Id === playerId
                        );
                    });

                // Combine all matches
                const allMatches = [...singlesMatches, ...doublesMatches].slice(0, 50);

                console.log(
                    '[Coach Match History] Player matches found:',
                    singlesMatches.length, 'singles,',
                    doublesMatches.length, 'doubles'
                );

                if (allMatches.length === 0) {
                    container.innerHTML = `<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe für ${playerName} gefunden</p>`;
                    return;
                }

                // Sort by timestamp descending
                allMatches.sort((a, b) => {
                    const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
                    const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
                    return timeB - timeA;
                });

                // Get opponent names and points for all matches
                const matchesWithDetails = await Promise.all(
                    allMatches.map(match =>
                        enrichCoachMatchData(supabase, match, playerId, playerData)
                    )
                );

                // Render matches
                renderCoachMatchHistory(container, matchesWithDetails, playerName);

            } catch (error) {
                console.error('[Coach Match History] Error fetching matches:', error);
                container.innerHTML =
                    '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Historie</p>';
            }
        }

        // Initial fetch
        await fetchAndRenderMatches();

        // Set up real-time subscriptions
        const singlesSubscription = supabase
            .channel('coach-match-history-singles')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'matches',
                    filter: `club_id=eq.${playerData.clubId}`
                },
                async () => {
                    await fetchAndRenderMatches();
                }
            )
            .subscribe();

        coachMatchHistorySubscriptions.push(singlesSubscription);

        const doublesSubscription = supabase
            .channel('coach-match-history-doubles')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'doubles_matches',
                    filter: `club_id=eq.${playerData.clubId}`
                },
                async () => {
                    await fetchAndRenderMatches();
                }
            )
            .subscribe();

        coachMatchHistorySubscriptions.push(doublesSubscription);

        // Return cleanup function
        return () => cleanupSubscriptions();

    } catch (error) {
        console.error('Error loading coach match history:', error);
        container.innerHTML =
            '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Historie</p>';
    }
}

/**
 * Enrich match data with opponent name and ELO changes
 * @param {Object} supabase - Supabase client instance
 * @param {Object} match - Match data
 * @param {string} playerId - The player we're viewing history for
 * @param {Object} playerData - Player data
 * @returns {Object} Enriched match data
 */
async function enrichCoachMatchData(supabase, match, playerId, playerData) {
    const enriched = { ...match };

    try {
        // Handle DOUBLES matches differently
        if (match.type === 'doubles') {
            // Determine user's team and opponent team
            const isTeamA =
                match.teamA?.player1Id === playerId || match.teamA?.player2Id === playerId;
            const userTeam = isTeamA ? match.teamA : match.teamB;
            const opponentTeam = isTeamA ? match.teamB : match.teamA;

            // Get partner ID (the other player on user's team)
            const partnerId =
                userTeam.player1Id === playerId ? userTeam.player2Id : userTeam.player1Id;

            // Fetch all player names
            try {
                const playerIds = [partnerId, opponentTeam.player1Id, opponentTeam.player2Id].filter(Boolean);

                const { data: players, error } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name')
                    .in('id', playerIds);

                if (error) throw error;

                const playerMap = new Map();
                (players || []).forEach(p => {
                    playerMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unbekannt');
                });

                enriched.partnerName = playerMap.get(partnerId) || 'Partner';
                const opp1Name = playerMap.get(opponentTeam.player1Id)?.split(' ')[0] || 'Unbekannt';
                const opp2Name = playerMap.get(opponentTeam.player2Id)?.split(' ')[0] || 'Unbekannt';
                enriched.opponentName = `${opp1Name} & ${opp2Name}`;
            } catch (error) {
                console.warn('Could not fetch doubles player data:', error);
                enriched.partnerName = 'Partner';
                enriched.opponentName = 'Gegner-Team';
            }

            // Determine if user's team won
            enriched.isWinner =
                (isTeamA && match.winningTeam === 'A') || (!isTeamA && match.winningTeam === 'B');

            // For doubles, isPlayerA means isTeamA (for set formatting)
            enriched.isPlayerA = isTeamA;
        } else {
            // Handle SINGLES matches
            // Determine opponent ID
            const opponentId = match.winnerId === playerId ? match.loserId : match.winnerId;

            // Get opponent data
            const { data: opponentData, error } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', opponentId)
                .single();

            if (!error && opponentData) {
                enriched.opponentName =
                    `${opponentData.first_name || ''} ${opponentData.last_name || ''}`.trim() ||
                    'Unbekannt';
            } else {
                enriched.opponentName = 'Unbekannt';
            }

            // Determine if this player won
            enriched.isWinner = match.winnerId === playerId;

            // Determine if this player is playerA
            enriched.isPlayerA = match.playerAId === playerId;
        }

        // Get ELO change from pointsHistory
        let eloChange = null;
        let pointsGained = null;

        try {
            const { data: historyData, error: historyError } = await supabase
                .from('points_history')
                .select('*')
                .eq('user_id', playerId)
                .order('timestamp', { ascending: false })
                .limit(200);

            if (historyError) throw historyError;

            const matchTime = new Date(match.timestamp || match.playedAt || 0).getTime();
            const opponentName = enriched.opponentName;

            for (const historyEntry of historyData || []) {
                const historyTime = new Date(historyEntry.timestamp || 0).getTime();

                const isMatchHistory =
                    historyEntry.awarded_by === 'System (Wettkampf)' ||
                    (historyEntry.reason &&
                        (historyEntry.reason.includes('Sieg im') ||
                            historyEntry.reason.includes('Niederlage im')));

                if (isMatchHistory && Math.abs(historyTime - matchTime) < 30000) {
                    if (
                        historyEntry.reason &&
                        historyEntry.reason.includes(opponentName.split(' ')[0])
                    ) {
                        eloChange = historyEntry.elo_change || 0;
                        pointsGained = historyEntry.points || 0;
                        break;
                    } else if (Math.abs(historyTime - matchTime) < 10000) {
                        eloChange = historyEntry.elo_change || 0;
                        pointsGained = historyEntry.points || 0;
                        break;
                    }
                }
            }
        } catch (historyError) {
            console.warn('Could not fetch points history:', historyError);
        }

        // If we couldn't find it in history, estimate from match data
        if (eloChange === null) {
            if (match.pointsExchanged !== undefined) {
                if (enriched.isWinner) {
                    eloChange = match.handicapUsed ? 8 : Math.round(match.pointsExchanged / 0.2);
                    pointsGained = match.pointsExchanged;
                } else {
                    eloChange = match.handicapUsed ? -8 : -Math.round(match.pointsExchanged / 0.2);
                    pointsGained = 0;
                }
            } else {
                eloChange = match.handicapUsed ? (enriched.isWinner ? 8 : -8) : null;
            }
        }

        enriched.eloChange = eloChange;
        enriched.pointsGained = pointsGained;
    } catch (error) {
        console.error('Error enriching coach match data:', error);
        enriched.opponentName = 'Fehler';
        enriched.eloChange = null;
        enriched.pointsGained = 0;
    }

    return enriched;
}

/**
 * Render match history in the container (coach view)
 * @param {HTMLElement} container - Container element
 * @param {Array} matches - Array of match data
 * @param {string} playerName - Name of the player whose history is being viewed
 */
function renderCoachMatchHistory(container, matches, playerName) {
    container.innerHTML = '';

    matches.forEach(match => {
        const matchDiv = document.createElement('div');
        matchDiv.className =
            'bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition';

        const isDoubles = match.type === 'doubles';

        const matchTime = new Date(match.timestamp || match.playedAt || match.createdAt || Date.now());
        const formattedTime = formatMatchTime(matchTime);
        const formattedDate = formatMatchDate(matchTime);

        // Format sets from player's perspective
        const setsDisplay = formatCoachSets(match.sets, match.isPlayerA, isDoubles);

        // ELO change display
        const eloChangeDisplay =
            match.eloChange !== null
                ? `${match.eloChange > 0 ? '+' : ''}${match.eloChange} ELO`
                : 'N/A';

        const eloChangeClass =
            match.eloChange > 0
                ? 'text-green-600 font-semibold'
                : match.eloChange < 0
                  ? 'text-red-600 font-semibold'
                  : 'text-gray-600';

        matchDiv.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs text-gray-500">${formattedDate}</span>
            <span class="text-xs text-gray-400">•</span>
            <span class="text-xs font-medium text-gray-600">${formattedTime}</span>
            ${match.handicapUsed ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Handicap</span>' : ''}
          </div>

          <div class="flex items-center gap-3 mb-2">
            ${
                isDoubles
                    ? match.isWinner
                        ? `<span class="text-2xl">🏆</span>
                     <div>
                       <p class="text-sm font-semibold text-green-700">
                         <span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded mr-1">Doppel</span>
                         Sieg mit ${match.partnerName}
                       </p>
                       <p class="text-xs text-gray-600 mt-0.5">gegen ${match.opponentName}</p>
                     </div>`
                        : `<span class="text-2xl">😔</span>
                     <div>
                       <p class="text-sm font-semibold text-red-700">
                         <span class="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded mr-1">Doppel</span>
                         Niederlage mit ${match.partnerName}
                       </p>
                       <p class="text-xs text-gray-600 mt-0.5">gegen ${match.opponentName}</p>
                     </div>`
                    : match.isWinner
                      ? `<span class="text-2xl">🏆</span>
                     <div>
                       <p class="text-sm font-semibold text-green-700">Sieg gegen ${match.opponentName}</p>
                     </div>`
                      : `<span class="text-2xl">😔</span>
                     <div>
                       <p class="text-sm font-semibold text-red-700">Niederlage gegen ${match.opponentName}</p>
                     </div>`
            }
          </div>

          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-gray-600">Sätze:</span>
              <span class="font-mono font-medium text-gray-800">${setsDisplay}</span>
            </div>
          </div>
        </div>

        <div class="text-right">
          <div class="${eloChangeClass} text-lg">
            ${eloChangeDisplay}
          </div>
          ${match.pointsGained > 0 ? `<div class="text-xs text-gray-600 mt-1">+${match.pointsGained} Punkte</div>` : ''}
        </div>
      </div>
    `;

        container.appendChild(matchDiv);
    });
}

/**
 * Format sets for display (coach view - from player's perspective)
 * @param {Array} sets - Array of set objects with playerA/playerB or teamA/teamB scores
 * @param {boolean} isPlayerA - Whether the viewed player is playerA (for singles) or teamA (for doubles)
 * @param {boolean} isDoubles - Whether this is a doubles match
 * @returns {string} Formatted sets string
 */
function formatCoachSets(sets, isPlayerA, isDoubles) {
    if (!sets || sets.length === 0) return 'N/A';

    return sets
        .map(set => {
            // Check if it's a doubles match (has teamA/teamB) or singles (has playerA/playerB)
            if (isDoubles || (set.teamA !== undefined && set.teamB !== undefined)) {
                // Doubles match
                const myScore = isPlayerA ? set.teamA : set.teamB;
                const oppScore = isPlayerA ? set.teamB : set.teamA;
                return `${myScore}:${oppScore}`;
            } else {
                // Singles match
                const myScore = isPlayerA ? set.playerA : set.playerB;
                const oppScore = isPlayerA ? set.playerB : set.playerA;
                return `${myScore}:${oppScore}`;
            }
        })
        .join(', ');
}

/**
 * Format match time (HH:MM)
 * @param {Date} date - Date object
 * @returns {string} Formatted time
 */
function formatMatchTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Format match date
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
function formatMatchDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Reset time parts for comparison
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate()
    );

    if (dateOnly.getTime() === todayOnly.getTime()) {
        return 'Heute';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
        return 'Gestern';
    } else {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }
}
