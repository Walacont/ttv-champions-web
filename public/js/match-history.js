import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    doc,
    getDoc,
    onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Match History Module
 * Displays competition history with match results and ELO changes
 */

// ========================================================================
// ===== LOAD AND DISPLAY MATCH HISTORY =====
// ========================================================================

// Store the unsubscribe function globally so we can clean up
let matchHistoryUnsubscribe = null;

/**
 * Load and display match history for the current player with real-time updates
 * @param {Object} db - Firestore database instance
 * @param {Object} userData - Current user data
 * @param {string} matchType - Type of matches to show: 'all', 'singles', or 'doubles'
 * @returns {Function} Unsubscribe function to stop listening
 */
export function loadMatchHistory(db, userData, matchType = 'all') {
    const container = document.getElementById('match-history-list');
    if (!container) {
        console.error('Match history container not found');
        return;
    }

    // Clean up existing listener if any
    if (matchHistoryUnsubscribe) {
        matchHistoryUnsubscribe();
    }

    container.innerHTML =
        '<p class="text-gray-400 text-center py-4 text-sm">Lade Wettkampf-Historie...</p>';

    // Query by playerA/playerB for ALL players (with or without club)
    // This ensures we find:
    // - Same club matches (clubId = club)
    // - Cross-club matches (clubId = null)
    // - Club vs no-club matches (clubId = club)
    // - No-club vs no-club matches (clubId = null)
    {
        // Query by playerA/playerB
        // Since we can't do OR queries, we need separate queries for playerA and playerB
        const singlesMatchesRef = collection(db, 'matches');

        const singlesAsPlayerAQuery = query(
            singlesMatchesRef,
            where('playerAId', '==', userData.id),
            where('processed', '==', true),
            limit(100)
        );

        const singlesAsPlayerBQuery = query(
            singlesMatchesRef,
            where('playerBId', '==', userData.id),
            where('processed', '==', true),
            limit(100)
        );

        // For doubles: Query matches from own club AND null clubId (cross-club/mixed)
        const doublesMatchesRef = collection(db, 'doublesMatches');
        const hasClub = userData.clubId !== null && userData.clubId !== undefined && userData.clubId !== '';

        const doublesOwnClubQuery = hasClub ? query(
            doublesMatchesRef,
            where('clubId', '==', userData.clubId),
            where('processed', '==', true),
            limit(100)
        ) : null;

        const doublesNullClubQuery = query(
            doublesMatchesRef,
            where('clubId', '==', null),
            where('processed', '==', true),
            limit(100)
        );

        // Set up real-time listeners
        const unsubscribeSinglesA = onSnapshot(
            singlesAsPlayerAQuery,
            async singlesASnapshot => {
                const unsubscribeSinglesB = onSnapshot(
                    singlesAsPlayerBQuery,
                    async singlesBSnapshot => {
                        // Set up doubles listeners (one or two queries depending on club status)
                        const processDoublesData = async (doublesOwnClubSnapshot, doublesNullClubSnapshot) => {
                            // Combine singles matches from both queries
                            const singlesAMatches = singlesASnapshot.docs.map(doc => ({
                                id: doc.id,
                                type: 'singles',
                                ...doc.data()
                            }));
                            const singlesBMatches = singlesBSnapshot.docs.map(doc => ({
                                id: doc.id,
                                type: 'singles',
                                ...doc.data()
                            }));

                            // Remove duplicates (shouldn't happen, but just in case)
                            const singlesMatchesMap = new Map();
                            [...singlesAMatches, ...singlesBMatches].forEach(match => {
                                singlesMatchesMap.set(match.id, match);
                            });
                            const singlesMatches = Array.from(singlesMatchesMap.values());

                            // Combine doubles matches from both queries (if applicable)
                            const doublesMatchesMap = new Map();
                            if (doublesOwnClubSnapshot) {
                                doublesOwnClubSnapshot.docs.forEach(doc => {
                                    doublesMatchesMap.set(doc.id, { id: doc.id, type: 'doubles', ...doc.data() });
                                });
                            }
                            doublesNullClubSnapshot.docs.forEach(doc => {
                                doublesMatchesMap.set(doc.id, { id: doc.id, type: 'doubles', ...doc.data() });
                            });

                            // Filter doubles matches where user is involved
                            const doublesMatches = Array.from(doublesMatchesMap.values()).filter(match => {
                                return (
                                    match.teamA?.player1Id === userData.id ||
                                    match.teamA?.player2Id === userData.id ||
                                    match.teamB?.player1Id === userData.id ||
                                    match.teamB?.player2Id === userData.id
                                );
                            });

                            // Filter matches based on matchType parameter
                            let filteredMatches = [];
                            if (matchType === 'singles') {
                                filteredMatches = singlesMatches;
                            } else if (matchType === 'doubles') {
                                filteredMatches = doublesMatches;
                            } else {
                                // 'all' - combine both
                                filteredMatches = [...singlesMatches, ...doublesMatches];
                            }

                            // Limit to 50 matches
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

                            // Sort by timestamp descending
                            allMatches.sort((a, b) => {
                                const timeA = a.timestamp?.toMillis() || a.createdAt?.toMillis() || 0;
                                const timeB = b.timestamp?.toMillis() || b.createdAt?.toMillis() || 0;
                                return timeB - timeA;
                            });

                            // Get player names and ELO changes for all matches
                            const matchesWithDetails = await Promise.all(
                                allMatches.map(match => enrichMatchData(db, match, userData))
                            );

                            // Render matches with toggle button
                            renderMatchesWithToggle(container, matchesWithDetails, userData);
                        };

                        // Set up doubles listeners based on club status
                        if (hasClub && doublesOwnClubQuery) {
                            // Player has club: listen to both own club and null club matches
                            const unsubscribeDoublesOwn = onSnapshot(
                                doublesOwnClubQuery,
                                async doublesOwnSnapshot => {
                                    const unsubscribeDoublesNull = onSnapshot(
                                        doublesNullClubQuery,
                                        async doublesNullSnapshot => {
                                            await processDoublesData(doublesOwnSnapshot, doublesNullSnapshot);
                                        },
                                        error => {
                                            console.error('[Match History] Error loading cross-club doubles:', error);
                                        }
                                    );

                                    // Store cleanup function
                                    matchHistoryUnsubscribe = () => {
                                        unsubscribeDoublesNull();
                                        unsubscribeDoublesOwn();
                                    };
                                },
                                error => {
                                    console.error('[Match History] Error loading own club doubles:', error);
                                }
                            );
                        } else {
                            // Player has no club: only listen to null club matches
                            const unsubscribeDoublesNull = onSnapshot(
                                doublesNullClubQuery,
                                async doublesNullSnapshot => {
                                    await processDoublesData(null, doublesNullSnapshot);
                                },
                                error => {
                                    console.error('[Match History] Error loading doubles (no club):', error);
                                    container.innerHTML = `<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Doppel-Historie</p>`;
                                }
                            );

                            // Store cleanup function
                            matchHistoryUnsubscribe = () => {
                                unsubscribeDoublesNull();
                            };
                        }
                    },
                    error => {
                        console.error('[Match History] Error loading singles history as playerB:', error);
                        container.innerHTML = `<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Singles-Historie</p>`;
                    }
                );
            },
            error => {
                console.error('[Match History] Error loading singles history as playerA:', error);
                container.innerHTML = `<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Singles-Historie</p>`;
            }
        );

        // Return cleanup function
        return () => {
            if (matchHistoryUnsubscribe) {
                matchHistoryUnsubscribe();
            }
            unsubscribeSinglesA();
        };
    }
}

/**
 * Enrich match data with player names and ELO changes
 * @param {Object} db - Firestore database instance
 * @param {Object} match - Match data
 * @param {Object} userData - Current user data
 * @returns {Object} Enriched match data
 */
async function enrichMatchData(db, match, userData) {
    const enriched = { ...match };

    try {
        // Handle DOUBLES matches differently
        if (match.type === 'doubles') {
            // Determine user's team and opponent team
            const isTeamA =
                match.teamA?.player1Id === userData.id || match.teamA?.player2Id === userData.id;
            const userTeam = isTeamA ? match.teamA : match.teamB;
            const opponentTeam = isTeamA ? match.teamB : match.teamA;

            // Get partner ID (the other player on user's team)
            const partnerId =
                userTeam.player1Id === userData.id ? userTeam.player2Id : userTeam.player1Id;

            // Fetch all player names
            try {
                const [partnerDoc, opp1Doc, opp2Doc] = await Promise.all([
                    getDoc(doc(db, 'users', partnerId)),
                    getDoc(doc(db, 'users', opponentTeam.player1Id)),
                    getDoc(doc(db, 'users', opponentTeam.player2Id)),
                ]);

                const partnerName = partnerDoc.exists()
                    ? `${partnerDoc.data().firstName || ''} ${partnerDoc.data().lastName || ''}`.trim()
                    : 'Unbekannt';
                const opp1Name = opp1Doc.exists()
                    ? opp1Doc.data().firstName || 'Unbekannt'
                    : 'Unbekannt';
                const opp2Name = opp2Doc.exists()
                    ? opp2Doc.data().firstName || 'Unbekannt'
                    : 'Unbekannt';

                enriched.partnerName = partnerName;
                enriched.opponentName = `${opp1Name} & ${opp2Name}`;
            } catch (error) {
                // Only log non-permission errors (permission-denied is expected for offline players)
                if (error.code !== 'permission-denied') {
                    console.warn('Could not fetch doubles player data:', error);
                }
                enriched.partnerName = 'Partner';
                enriched.opponentName = 'Gegner-Team';
            }

            // Determine if user's team won
            enriched.isWinner =
                (isTeamA && match.winningTeam === 'A') || (!isTeamA && match.winningTeam === 'B');
        } else {
            // Handle SINGLES matches
            // Determine opponent ID
            const opponentId = match.winnerId === userData.id ? match.loserId : match.winnerId;

            // Check if opponentId is valid before attempting to fetch
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

            // Get opponent data
            try {
                const opponentDoc = await getDoc(doc(db, 'users', opponentId));
                if (opponentDoc.exists()) {
                    const opponentData = opponentDoc.data();
                    enriched.opponentName =
                        `${opponentData.firstName || ''} ${opponentData.lastName || ''}`.trim() ||
                        'Unbekannt';
                } else {
                    enriched.opponentName = 'Unbekannt';
                }
            } catch (opponentError) {
                // Failed to fetch opponent (probably from different club or deleted)
                // Only log if it's not a permission-denied error (which is expected for cross-club matches)
                if (opponentError.code !== 'permission-denied') {
                    console.warn(
                        'Could not fetch opponent data:',
                        opponentError.code || opponentError.message
                    );
                }
                enriched.opponentName = 'Gegner';
            }

            enriched.isWinner = match.winnerId === userData.id;
        }

        // Get ELO change from pointsHistory
        let eloChange = null;
        let pointsGained = null;

        try {
            const pointsHistoryRef = collection(db, 'users', userData.id, 'pointsHistory');
            const historyQuery = query(
                pointsHistoryRef,
                orderBy('timestamp', 'desc'),
                limit(200) // Get recent history to find this match
            );

            const historySnapshot = await getDocs(historyQuery);

            // Find the history entry that corresponds to this match
            // Match by timestamp proximity (within 30 seconds) and check reason
            const matchTime = match.timestamp?.toMillis() || match.playedAt?.toMillis() || 0;

            const opponentName = enriched.opponentName;

            for (const historyDoc of historySnapshot.docs) {
                const historyData = historyDoc.data();
                const historyTime = historyData.timestamp?.toMillis() || 0;

                // Check if this history entry is from a match
                const isMatchHistory =
                    historyData.awardedBy === 'System (Wettkampf)' ||
                    (historyData.reason &&
                        (historyData.reason.includes('Sieg im') ||
                            historyData.reason.includes('Niederlage im')));

                // If timestamps are within 30 seconds and it's a match history, consider it a match
                if (isMatchHistory && Math.abs(historyTime - matchTime) < 30000) {
                    // Additionally check if opponent name matches (if available)
                    if (
                        historyData.reason &&
                        historyData.reason.includes(opponentName.split(' ')[0])
                    ) {
                        eloChange = historyData.eloChange || 0;
                        pointsGained = historyData.points || 0;
                        break;
                    } else if (Math.abs(historyTime - matchTime) < 10000) {
                        // If very close in time (within 10s), use it even without name match
                        eloChange = historyData.eloChange || 0;
                        pointsGained = historyData.points || 0;
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
                // Estimate based on whether user won or lost
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

        // Add toggle button if there are more than 4 matches
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

        const matchTime =
            match.timestamp?.toDate() ||
            match.playedAt?.toDate() ||
            match.createdAt?.toDate() ||
            new Date();
        const formattedTime = formatMatchTime(matchTime);
        const formattedDate = formatMatchDate(matchTime);

        // Format sets
        let isPlayerA;
        if (isDoubles) {
            // For doubles, check if user is in teamA
            isPlayerA =
                match.teamA?.player1Id === userData.id || match.teamA?.player2Id === userData.id;
        } else {
            // For singles, check if user is playerA
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
 * Format sets for display
 * @param {Array} sets - Array of set objects with playerA/playerB or teamA/teamB scores
 * @param {boolean} isPlayerA - Whether current user is playerA (for singles) or teamA (for doubles)
 * @returns {string} Formatted sets string
 */
function formatSets(sets, isPlayerA) {
    if (!sets || sets.length === 0) return 'N/A';

    return sets
        .map(set => {
            // Check if it's a doubles match (has teamA/teamB) or singles (has playerA/playerB)
            if (set.teamA !== undefined && set.teamB !== undefined) {
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
