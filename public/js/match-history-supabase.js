/**
 * Match History Module (Supabase Version)
 * Displays competition history with match results and ELO changes
 */

// ========================================================================
// ===== LOAD AND DISPLAY MATCH HISTORY =====
// ========================================================================

// Subscription-Kanäle speichern für Aufräumen
let matchHistorySubscriptions = [];

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
        playerASetsWon: match.player_a_sets_won,
        playerBSetsWon: match.player_b_sets_won,
        processed: match.processed,
        handicapUsed: match.handicap_used,
        pointsExchanged: match.points_exchanged,
        timestamp: match.timestamp,
        playedAt: match.played_at,
        createdAt: match.created_at,
        clubId: match.club_id
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
 * Load and display match history for the current player with real-time updates
 * @param {Object} supabase - Supabase client instance
 * @param {Object} userData - Current user data
 * @param {string} matchType - Type of matches to show: 'all', 'singles', or 'doubles'
 * @returns {Function} Unsubscribe function to stop listening
 */
export function loadMatchHistory(supabase, userData, matchType = 'all') {
    const container = document.getElementById('match-history-list');
    if (!container) {
        console.error('Match history container not found');
        return;
    }

    // Bestehende Subscriptions aufräumen falls vorhanden
    cleanupSubscriptions();

    container.innerHTML =
        '<p class="text-gray-400 text-center py-4 text-sm">Lade Wettkampf-Historie...</p>';

    // Initiale Daten laden und Echtzeit-Listener einrichten
    loadAndSubscribe(supabase, userData, container, matchType);

    // Aufräum-Funktion zurückgeben
    return () => cleanupSubscriptions();
}

/**
 * Clean up all subscriptions
 */
function cleanupSubscriptions() {
    matchHistorySubscriptions.forEach(subscription => {
        if (subscription && typeof subscription.unsubscribe === 'function') {
            subscription.unsubscribe();
        }
    });
    matchHistorySubscriptions = [];
}

/**
 * Load initial data and set up real-time subscriptions
 */
async function loadAndSubscribe(supabase, userData, container, matchType) {
    try {
        // Initiale Daten abrufen
        await fetchAndRenderMatches(supabase, userData, container, matchType);

        // Echtzeit-Subscriptions für Einzel-Matches einrichten
        const singlesSubscription = supabase
            .channel('match-history-singles')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'matches',
                    filter: `processed=eq.true`
                },
                async (payload) => {
                    // Prüfen ob dieses Match den aktuellen Benutzer betrifft
                    const match = payload.new || payload.old;
                    if (match && (match.player_a_id === userData.id || match.player_b_id === userData.id)) {
                        await fetchAndRenderMatches(supabase, userData, container, matchType);
                    }
                }
            )
            .subscribe();

        matchHistorySubscriptions.push(singlesSubscription);

        // Echtzeit-Subscriptions für Doppel-Matches einrichten
        const doublesSubscription = supabase
            .channel('match-history-doubles')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'doubles_matches',
                    filter: `processed=eq.true`
                },
                async () => {
                    // Alle Matches neu abrufen wenn Doppel sich ändert
                    await fetchAndRenderMatches(supabase, userData, container, matchType);
                }
            )
            .subscribe();

        matchHistorySubscriptions.push(doublesSubscription);

    } catch (error) {
        console.error('[Match History] Error setting up subscriptions:', error);
        container.innerHTML = `<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Wettkampf-Historie</p>`;
    }
}

/**
 * Fetch and render all matches
 */
async function fetchAndRenderMatches(supabase, userData, container, matchType) {
    try {
        // Einzel-Matches abfragen wo Benutzer playerA ist
        const { data: singlesAsA, error: singlesAsAError } = await supabase
            .from('matches')
            .select('*')
            .eq('player_a_id', userData.id)
            .eq('processed', true)
            .limit(100);

        if (singlesAsAError) console.error('Error fetching singles as A:', singlesAsAError);

        // Einzel-Matches abfragen wo Benutzer playerB ist
        const { data: singlesAsB, error: singlesAsBError } = await supabase
            .from('matches')
            .select('*')
            .eq('player_b_id', userData.id)
            .eq('processed', true)
            .limit(100);

        if (singlesAsBError) console.error('Error fetching singles as B:', singlesAsBError);

        // Einzel-Matches kombinieren und deduplizieren
        const singlesMatchesMap = new Map();
        [...(singlesAsA || []), ...(singlesAsB || [])].forEach(match => {
            singlesMatchesMap.set(match.id, mapSinglesMatchFromSupabase(match));
        });
        const singlesMatches = Array.from(singlesMatchesMap.values());

        // Doppel-Matches abfragen
        const hasClub = userData.clubId !== null && userData.clubId !== undefined && userData.clubId !== '';

        let doublesMatches = [];

        if (hasClub) {
            // Eigene Vereins-Doppel-Matches abfragen
            const { data: doublesOwnClub, error: doublesOwnError } = await supabase
                .from('doubles_matches')
                .select('*')
                .eq('club_id', userData.clubId)
                .eq('processed', true)
                .limit(100);

            if (doublesOwnError) console.error('Error fetching own club doubles:', doublesOwnError);

            // Null-Vereins-Doppel-Matches abfragen (vereinsübergreifend)
            const { data: doublesNullClub, error: doublesNullError } = await supabase
                .from('doubles_matches')
                .select('*')
                .is('club_id', null)
                .eq('processed', true)
                .limit(100);

            if (doublesNullError) console.error('Error fetching null club doubles:', doublesNullError);

            // Doppel kombinieren
            const doublesMatchesMap = new Map();
            [...(doublesOwnClub || []), ...(doublesNullClub || [])].forEach(match => {
                doublesMatchesMap.set(match.id, mapDoublesMatchFromSupabase(match));
            });

            // Doppel filtern an denen Benutzer beteiligt ist
            doublesMatches = Array.from(doublesMatchesMap.values()).filter(match => {
                return (
                    match.teamA?.player1Id === userData.id ||
                    match.teamA?.player2Id === userData.id ||
                    match.teamB?.player1Id === userData.id ||
                    match.teamB?.player2Id === userData.id
                );
            });
        } else {
            // Nur Null-Vereins-Doppel-Matches abfragen
            const { data: doublesNullClub, error: doublesNullError } = await supabase
                .from('doubles_matches')
                .select('*')
                .is('club_id', null)
                .eq('processed', true)
                .limit(100);

            if (doublesNullError) console.error('Error fetching null club doubles:', doublesNullError);

            // Doppel filtern an denen Benutzer beteiligt ist
            doublesMatches = (doublesNullClub || [])
                .map(m => mapDoublesMatchFromSupabase(m))
                .filter(match => {
                    return (
                        match.teamA?.player1Id === userData.id ||
                        match.teamA?.player2Id === userData.id ||
                        match.teamB?.player1Id === userData.id ||
                        match.teamB?.player2Id === userData.id
                    );
                });
        }

        // Matches basierend auf matchType-Parameter filtern
        let filteredMatches = [];
        if (matchType === 'singles') {
            filteredMatches = singlesMatches;
        } else if (matchType === 'doubles') {
            filteredMatches = doublesMatches;
        } else {
            // 'all' - combine both
            filteredMatches = [...singlesMatches, ...doublesMatches];
        }

        // Auf 50 Matches begrenzen
        const allMatches = filteredMatches.slice(0, 50);

        if (allMatches.length === 0) {
            const emptyMessage =
                matchType === 'singles'
                    ? 'Noch keine Einzel-Wettkämpfe gespielt'
                    : matchType === 'doubles'
                      ? 'Noch keine Doppel-Wettkämpfe gespielt'
                      : 'Noch keine Wettkämpfe gespielt';
            container.innerHTML = `<p class="text-gray-400 text-center py-4 text-sm">${emptyMessage}</p>`;
            return;
        }

        // Nach Zeitstempel absteigend sortieren
        allMatches.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
            const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        // Spielernamen und ELO-Änderungen für alle Matches abrufen
        const matchesWithDetails = await Promise.all(
            allMatches.map(match => enrichMatchData(supabase, match, userData))
        );

        // Matches mit Toggle-Button rendern
        renderMatchesWithToggle(container, matchesWithDetails, userData);

    } catch (error) {
        console.error('[Match History] Error fetching matches:', error);
        container.innerHTML = `<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Wettkampf-Historie</p>`;
    }
}

/**
 * Enrich match data with player names and ELO changes
 * @param {Object} supabase - Supabase client instance
 * @param {Object} match - Match data
 * @param {Object} userData - Current user data
 * @returns {Object} Enriched match data
 */
async function enrichMatchData(supabase, match, userData) {
    const enriched = { ...match };

    try {
        // DOPPEL-Matches anders verarbeiten
        if (match.type === 'doubles') {
            // Benutzer-Team und Gegner-Team bestimmen
            const isTeamA =
                match.teamA?.player1Id === userData.id || match.teamA?.player2Id === userData.id;
            const userTeam = isTeamA ? match.teamA : match.teamB;
            const opponentTeam = isTeamA ? match.teamB : match.teamA;

            // Partner-ID abrufen (anderer Spieler im Team)
            const partnerId =
                userTeam.player1Id === userData.id ? userTeam.player2Id : userTeam.player1Id;

            // Alle Spielernamen abrufen
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

            // Bestimmen ob Benutzer-Team gewonnen hat
            enriched.isWinner =
                (isTeamA && match.winningTeam === 'A') || (!isTeamA && match.winningTeam === 'B');
        } else {
            // EINZEL-Matches verarbeiten
            // Determine opponent ID
            const opponentId = match.winnerId === userData.id ? match.loserId : match.winnerId;

            // Prüfen ob opponentId gültig ist vor Abruf
            if (
                !opponentId ||
                opponentId === '' ||
                opponentId === null ||
                opponentId === undefined
            ) {
                enriched.opponentName = 'Unbekannt';
                enriched.eloChange = null;
                enriched.pointsGained = null;
                return enriched;
            }

            // Gegnerdaten abrufen
            try {
                const { data: opponentData, error } = await supabase
                    .from('profiles')
                    .select('first_name, last_name')
                    .eq('id', opponentId)
                    .single();

                if (error) throw error;

                if (opponentData) {
                    enriched.opponentName =
                        `${opponentData.first_name || ''} ${opponentData.last_name || ''}`.trim() ||
                        'Unbekannt';
                } else {
                    enriched.opponentName = 'Unbekannt';
                }
            } catch (opponentError) {
                // Gegner abrufen fehlgeschlagen (vermutlich anderer Verein oder gelöscht)
                console.warn('Could not fetch opponent data:', opponentError.message);
                enriched.opponentName = 'Gegner';
            }

            enriched.isWinner = match.winnerId === userData.id;
        }

        // ELO-Änderung aus pointsHistory abrufen
        let eloChange = null;
        let pointsGained = null;

        try {
            const { data: historyData, error: historyError } = await supabase
                .from('points_history')
                .select('*')
                .eq('user_id', userData.id)
                .order('timestamp', { ascending: false })
                .limit(200);

            if (historyError) throw historyError;

            // Verlaufseintrag finden der zu diesem Match gehört
            // Nach Zeitstempel-Nähe matchen (innerhalb 30 Sekunden) und Grund prüfen
            const matchTime = new Date(match.timestamp || match.playedAt || 0).getTime();

            const opponentName = enriched.opponentName;

            for (const historyEntry of historyData || []) {
                const historyTime = new Date(historyEntry.timestamp || 0).getTime();

                // Prüfen ob Verlaufseintrag von Match stammt
                const isMatchHistory =
                    historyEntry.awarded_by === 'System (Wettkampf)' ||
                    (historyEntry.reason &&
                        (historyEntry.reason.includes('Sieg im') ||
                            historyEntry.reason.includes('Niederlage im')));

                // Falls Zeitstempel innerhalb 30 Sekunden und es Match-Verlauf ist, als Match betrachten
                if (isMatchHistory && Math.abs(historyTime - matchTime) < 30000) {
                    // Zusätzlich Gegnernamen prüfen (falls verfügbar)
                    if (
                        historyEntry.reason &&
                        historyEntry.reason.includes(opponentName.split(' ')[0])
                    ) {
                        eloChange = historyEntry.elo_change || 0;
                        pointsGained = historyEntry.points || 0;
                        break;
                    } else if (Math.abs(historyTime - matchTime) < 10000) {
                        // Falls sehr nah in Zeit (innerhalb 10s), auch ohne Namensübereinstimmung verwenden
                        eloChange = historyEntry.elo_change || 0;
                        pointsGained = historyEntry.points || 0;
                        break;
                    }
                }
            }
        } catch (historyError) {
            console.warn('Could not fetch points history:', historyError);
        }

        // Falls nicht im Verlauf gefunden, aus Match-Daten schätzen
        if (eloChange === null) {
            if (match.pointsExchanged !== undefined) {
                // Schätzung basierend ob Benutzer gewonnen oder verloren hat
                if (match.winnerId === userData.id) {
                    eloChange = match.handicapUsed ? 8 : Math.round(match.pointsExchanged / 0.2);
                    pointsGained = match.pointsExchanged;
                } else {
                    eloChange = match.handicapUsed ? -8 : -Math.round(match.pointsExchanged / 0.2);
                    pointsGained = 0;
                }
            } else {
                // Fallback: use standard handicap values if match type is known
                eloChange = match.handicapUsed ? (match.winnerId === userData.id ? 8 : -8) : null;
            }
        }

        enriched.eloChange = eloChange;
        enriched.pointsGained = pointsGained;
    } catch (error) {
        console.error('Error enriching match data:', error);
        enriched.opponentName = 'Fehler';
        enriched.eloChange = null;
    }

    return enriched;
}

/**
 * Render matches with toggle button for show more/less
 * @param {HTMLElement} container - Container element
 * @param {Array} allMatches - All matches to display
 * @param {Object} userData - Current user data
 */
function renderMatchesWithToggle(container, allMatches, userData) {
    let showingAll = false;

    function render() {
        const matchesToShow = showingAll ? allMatches : allMatches.slice(0, 4);
        renderMatchHistory(container, matchesToShow, userData);

        // Toggle-Button hinzufügen wenn mehr als 4 Matches
        if (allMatches.length > 4) {
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'text-center mt-4';

            const toggleBtn = document.createElement('button');
            toggleBtn.className =
                'text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors';

            if (showingAll) {
                toggleBtn.innerHTML = '− Weniger anzeigen';
            } else {
                toggleBtn.innerHTML = `+ ${allMatches.length - 4} weitere Wettkämpfe anzeigen`;
            }

            toggleBtn.addEventListener('click', () => {
                showingAll = !showingAll;
                render();
            });

            toggleContainer.appendChild(toggleBtn);
            container.appendChild(toggleContainer);
        }
    }

    render();
}

/**
 * Render match history in the container
 * @param {HTMLElement} container - Container element
 * @param {Array} matches - Array of match data
 * @param {Object} userData - Current user data
 */
function renderMatchHistory(container, matches, userData) {
    container.innerHTML = '';

    matches.forEach(match => {
        const matchDiv = document.createElement('div');
        matchDiv.className =
            'bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition';

        const isWinner =
            match.isWinner !== undefined ? match.isWinner : match.winnerId === userData.id;
        const isDoubles = match.type === 'doubles';

        const matchTime = new Date(match.timestamp || match.playedAt || match.createdAt || Date.now());
        const formattedTime = formatMatchTime(matchTime);
        const formattedDate = formatMatchDate(matchTime);

        // Sätze formatieren
        let isPlayerA;
        if (isDoubles) {
            // Für Doppel prüfen ob Benutzer in teamA ist
            isPlayerA =
                match.teamA?.player1Id === userData.id || match.teamA?.player2Id === userData.id;
        } else {
            // Für Einzel prüfen ob Benutzer playerA ist
            isPlayerA = match.playerAId === userData.id;
        }
        const setsDisplay = formatSets(match.sets, isPlayerA);

        // ELO change display
        const eloChangeDisplay =
            match.eloChange !== null
                ? `${match.eloChange > 0 ? '+' : match.eloChange < 0 ? '' : '±'}${match.eloChange} ELO`
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
                    ? isWinner
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
                    : isWinner
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
              <span class="font-mono font-medium text-gray-800">${formatSetRatio(match.sets, isPlayerA, match)}</span>
            </div>
          </div>
        </div>

        <div class="text-right">
          <div class="${eloChangeClass} text-lg">
            ${eloChangeDisplay}
          </div>
        </div>
      </div>
    `;

        container.appendChild(matchDiv);
    });
}

/**
 * Format set ratio for display (e.g., "2:1" for 2 sets won, 1 lost)
 * @param {Array} sets - Array of set objects with playerA/playerB or teamA/teamB scores
 * @param {boolean} isPlayerA - Whether current user is playerA (for singles) or teamA (for doubles)
 * @returns {string} Formatted set ratio string
 */
function formatSetRatio(sets, isPlayerA, match) {
    if (!sets || sets.length === 0) {
        // Fallback to player_a_sets_won / player_b_sets_won
        const aWins = match?.playerASetsWon ?? match?.player_a_sets_won ?? 0;
        const bWins = match?.playerBSetsWon ?? match?.player_b_sets_won ?? 0;
        if (aWins === 0 && bWins === 0) return 'N/A';
        const myWins = isPlayerA ? aWins : bWins;
        const oppWins = isPlayerA ? bWins : aWins;
        return `${myWins}:${oppWins}`;
    }

    let myWins = 0;
    let oppWins = 0;

    sets.forEach(set => {
        let myScore, oppScore;
        // Prüfen ob Doppel-Match (teamA/teamB) oder Einzel (playerA/playerB)
        if (set.teamA !== undefined && set.teamB !== undefined) {
            myScore = isPlayerA ? set.teamA : set.teamB;
            oppScore = isPlayerA ? set.teamB : set.teamA;
        } else {
            myScore = isPlayerA ? set.playerA : set.playerB;
            oppScore = isPlayerA ? set.playerB : set.playerA;
        }
        if (myScore > oppScore) myWins++;
        else if (oppScore > myScore) oppWins++;
    });

    return `${myWins}:${oppWins}`;
}

/**
 * Format sets for display (individual set scores - used in details view)
 * @param {Array} sets - Array of set objects with playerA/playerB or teamA/teamB scores
 * @param {boolean} isPlayerA - Whether current user is playerA (for singles) or teamA (for doubles)
 * @returns {string} Formatted sets string
 */
function formatSets(sets, isPlayerA) {
    if (!sets || sets.length === 0) return '';

    return sets
        .map(set => {
            // Prüfen ob Doppel-Match (teamA/teamB) oder Einzel (playerA/playerB)
            if (set.teamA !== undefined && set.teamB !== undefined) {
                // Doppel-Match
                const myScore = isPlayerA ? set.teamA : set.teamB;
                const oppScore = isPlayerA ? set.teamB : set.teamA;
                return `${myScore}:${oppScore}`;
            } else {
                // Einzel-Match
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

    // Zeitanteile für Vergleich zurücksetzen
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
