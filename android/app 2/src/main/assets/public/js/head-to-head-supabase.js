/**
 * Head-to-Head Statistics Module (Supabase Version)
 * Shows match history and win/loss statistics between two players
 */

// ========================================================================
// ===== MODAL MANAGEMENT =====
// ========================================================================

let currentModal = null;

/**
 * Show head-to-head statistics modal for two players
 * @param {Object} supabase - Supabase client instance
 * @param {string} currentUserId - Current user's ID
 * @param {string} opponentId - Opponent player's ID
 */
export async function showHeadToHeadModal(supabase, currentUserId, opponentId) {
    // Close existing modal if any
    closeHeadToHeadModal();

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'head-to-head-modal';
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center p-4';
    modal.style.cssText = 'z-index: 100001;'; // Higher than header (9999) and bottom nav (99999)
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-y-auto" style="max-height: calc(100vh - 140px); margin-top: 60px; margin-bottom: 80px;">
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold text-gray-900">Head-to-Head</h2>
                    <button id="close-h2h-modal" class="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                        ×
                    </button>
                </div>
                <div id="h2h-content" class="text-center py-8">
                    <p class="text-gray-400">Lade Statistiken...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    currentModal = modal;

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeHeadToHeadModal();
        }
    });

    // Close button
    document.getElementById('close-h2h-modal').addEventListener('click', closeHeadToHeadModal);

    // Load and display statistics
    await loadHeadToHeadStats(supabase, currentUserId, opponentId);
}

/**
 * Close the head-to-head modal
 */
export function closeHeadToHeadModal() {
    if (currentModal) {
        currentModal.remove();
        currentModal = null;
    }
}

// ========================================================================
// ===== STATISTICS LOADING =====
// ========================================================================

/**
 * Load and display head-to-head statistics
 * @param {Object} supabase - Supabase client instance
 * @param {string} currentUserId - Current user's ID
 * @param {string} opponentId - Opponent player's ID
 */
async function loadHeadToHeadStats(supabase, currentUserId, opponentId) {
    const contentEl = document.getElementById('h2h-content');

    try {
        // Fetch opponent data
        const { data: opponentDoc, error: opponentError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', opponentId)
            .single();

        if (opponentError || !opponentDoc) {
            contentEl.innerHTML = '<p class="text-red-500">Spieler nicht gefunden.</p>';
            return;
        }

        const opponentData = {
            firstName: opponentDoc.first_name,
            lastName: opponentDoc.last_name,
            eloRating: opponentDoc.elo_rating,
            clubId: opponentDoc.club_id,
            photoURL: opponentDoc.avatar_url
        };
        const opponentName = `${opponentData.firstName || ''} ${opponentData.lastName || ''}`.trim();

        // Fetch opponent's club info if they have a club
        let opponentClubName = null;
        if (opponentData.clubId) {
            try {
                const { data: clubDoc, error: clubError } = await supabase
                    .from('clubs')
                    .select('name')
                    .eq('id', opponentData.clubId)
                    .single();

                if (!clubError && clubDoc) {
                    opponentClubName = clubDoc.name || opponentData.clubId;
                } else {
                    opponentClubName = opponentData.clubId;
                }
            } catch (error) {
                console.warn('Could not fetch club info:', error);
                opponentClubName = opponentData.clubId;
            }
        }

        // Query all matches between these two players
        // Query where current user is playerA and opponent is playerB
        const { data: matchesAB, error: errorAB } = await supabase
            .from('matches')
            .select('*')
            .eq('player_a_id', currentUserId)
            .eq('player_b_id', opponentId);

        if (errorAB) console.error('Error fetching matches AB:', errorAB);

        // Query where opponent is playerA and current user is playerB
        const { data: matchesBA, error: errorBA } = await supabase
            .from('matches')
            .select('*')
            .eq('player_a_id', opponentId)
            .eq('player_b_id', currentUserId);

        if (errorBA) console.error('Error fetching matches BA:', errorBA);

        // Combine all matches and map to app format
        const allMatches = [
            ...(matchesAB || []).map(m => mapMatchFromSupabase(m)),
            ...(matchesBA || []).map(m => mapMatchFromSupabase(m)),
        ];

        // Sort by timestamp descending
        allMatches.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
            const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        // Calculate statistics
        const stats = calculateStats(allMatches, currentUserId);

        // Render the modal content
        renderHeadToHeadContent(contentEl, opponentData, opponentName, opponentClubName, stats, allMatches, currentUserId);

    } catch (error) {
        console.error('Error loading head-to-head stats:', error);
        contentEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Statistiken.</p>';
    }
}

/**
 * Maps match from Supabase (snake_case) to app format (camelCase)
 */
function mapMatchFromSupabase(match) {
    return {
        id: match.id,
        playerAId: match.player_a_id,
        playerBId: match.player_b_id,
        winnerId: match.winner_id,
        loserId: match.loser_id,
        sets: match.sets,
        handicapUsed: match.handicap_used,
        timestamp: match.played_at || match.timestamp || match.created_at,
        createdAt: match.created_at
    };
}

/**
 * Calculate win/loss statistics
 * @param {Array} matches - Array of match objects
 * @param {string} currentUserId - Current user's ID
 * @returns {Object} Statistics object
 */
function calculateStats(matches, currentUserId) {
    let wins = 0;
    let losses = 0;
    let winsWithHandicap = 0;
    let lossesWithHandicap = 0;
    let winsWithoutHandicap = 0;
    let lossesWithoutHandicap = 0;
    let setsWon = 0;
    let setsLost = 0;

    matches.forEach(match => {
        const isWinner = match.winnerId === currentUserId || match.winner_id === currentUserId;
        const handicapUsed = match.handicapUsed || match.handicap_used || false;
        const isPlayerA = match.playerAId === currentUserId || match.player_a_id === currentUserId;

        // Count sets won and lost
        if (match.sets && Array.isArray(match.sets)) {
            match.sets.forEach(set => {
                // Handle both camelCase and snake_case
                const playerAScore = parseInt(set.playerA ?? set.player_a) || 0;
                const playerBScore = parseInt(set.playerB ?? set.player_b) || 0;
                const myScore = isPlayerA ? playerAScore : playerBScore;
                const oppScore = isPlayerA ? playerBScore : playerAScore;

                if (myScore > oppScore) {
                    setsWon++;
                } else if (oppScore > myScore) {
                    setsLost++;
                }
            });
        }

        if (isWinner) {
            wins++;
            if (handicapUsed) {
                winsWithHandicap++;
            } else {
                winsWithoutHandicap++;
            }
        } else {
            losses++;
            if (handicapUsed) {
                lossesWithHandicap++;
            } else {
                lossesWithoutHandicap++;
            }
        }
    });

    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    const totalWithHandicap = winsWithHandicap + lossesWithHandicap;
    const winRateWithHandicap = totalWithHandicap > 0 ? Math.round((winsWithHandicap / totalWithHandicap) * 100) : 0;

    const totalWithoutHandicap = winsWithoutHandicap + lossesWithoutHandicap;
    const winRateWithoutHandicap = totalWithoutHandicap > 0 ? Math.round((winsWithoutHandicap / totalWithoutHandicap) * 100) : 0;

    return {
        wins,
        losses,
        totalMatches,
        winRate,
        setsWon,
        setsLost,
        handicap: {
            wins: winsWithHandicap,
            losses: lossesWithHandicap,
            total: totalWithHandicap,
            winRate: winRateWithHandicap,
        },
        regular: {
            wins: winsWithoutHandicap,
            losses: lossesWithoutHandicap,
            total: totalWithoutHandicap,
            winRate: winRateWithoutHandicap,
        },
    };
}

/**
 * Render the head-to-head modal content
 * @param {HTMLElement} container - Container element
 * @param {Object} opponentData - Opponent's user data
 * @param {string} opponentName - Opponent's display name
 * @param {string} opponentClubName - Opponent's club name (or null)
 * @param {Object} stats - Statistics object
 * @param {Array} matches - Array of matches
 * @param {string} currentUserId - Current user's ID
 */
function renderHeadToHeadContent(container, opponentData, opponentName, opponentClubName, stats, matches, currentUserId) {
    const initials = `${opponentData.firstName?.[0] || ''}${opponentData.lastName?.[0] || ''}` || 'U';
    const avatarSrc = opponentData.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${initials}`;

    // Determine win rate color
    let winRateColor = 'text-gray-600';
    if (stats.winRate >= 60) {
        winRateColor = 'text-green-600';
    } else if (stats.winRate <= 40) {
        winRateColor = 'text-red-600';
    }

    container.innerHTML = `
        <!-- Opponent Info -->
        <div class="text-center mb-6">
            <img src="${avatarSrc}" alt="${opponentName}"
                 class="h-20 w-20 rounded-full object-cover border-4 border-indigo-200 shadow-md mx-auto mb-3">
            <h3 class="text-xl font-bold text-gray-900">${opponentName}</h3>
            <p class="text-sm text-gray-500">Skill: ${opponentData.eloRating || 0} ELO</p>
            ${opponentClubName ? `<p class="text-sm text-gray-500 mt-1">${opponentClubName}</p>` : `<p class="text-sm text-gray-400 mt-1">Kein Verein</p>`}
        </div>

        ${stats.totalMatches === 0 ? `
            <!-- No Matches Yet -->
            <div class="bg-gray-50 rounded-lg p-6 text-center">
                <p class="text-gray-500">Noch keine Matches gegen ${opponentName.split(' ')[0]} gespielt.</p>
            </div>
        ` : `
            <!-- Statistics -->
            <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-6 mb-6">
                <h4 class="text-lg font-semibold text-gray-900 mb-4 text-center">Deine Bilanz</h4>

                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-white rounded-lg p-4 text-center shadow">
                        <p class="text-3xl font-bold text-green-600">${stats.wins}</p>
                        <p class="text-sm text-gray-600">Siege</p>
                    </div>
                    <div class="bg-white rounded-lg p-4 text-center shadow">
                        <p class="text-3xl font-bold text-red-600">${stats.losses}</p>
                        <p class="text-sm text-gray-600">Niederlagen</p>
                    </div>
                </div>

                <div class="bg-white rounded-lg p-4 text-center shadow">
                    <p class="text-4xl font-bold ${winRateColor}">${stats.winRate}%</p>
                    <p class="text-sm text-gray-600">Siegrate</p>
                </div>
            </div>

            ${(stats.handicap.total > 0 || stats.regular.total > 0) ? `
                <!-- Handicap Split -->
                <div class="mb-6">
                    <h4 class="text-lg font-semibold text-gray-900 mb-3 text-center">Handicap-Split</h4>
                    <div class="grid grid-cols-2 gap-4">
                        <!-- Regular Matches -->
                        <div class="bg-gray-50 rounded-lg p-4 border-2 ${stats.regular.total > 0 ? 'border-gray-300' : 'border-gray-200 opacity-60'}">
                            <div class="text-center mb-2">
                                <p class="text-xs font-semibold text-gray-700 uppercase">Normal</p>
                            </div>
                            ${stats.regular.total > 0 ? `
                                <div class="flex justify-between text-sm mb-2">
                                    <span class="text-green-600 font-semibold">${stats.regular.wins}S</span>
                                    <span class="text-gray-400">-</span>
                                    <span class="text-red-600 font-semibold">${stats.regular.losses}N</span>
                                </div>
                                <div class="text-center">
                                    <p class="text-2xl font-bold ${stats.regular.winRate >= 60 ? 'text-green-600' : stats.regular.winRate <= 40 ? 'text-red-600' : 'text-gray-600'}">${stats.regular.winRate}%</p>
                                    <p class="text-xs text-gray-500">${stats.regular.total} Match${stats.regular.total !== 1 ? 'es' : ''}</p>
                                </div>
                            ` : `
                                <p class="text-xs text-gray-400 text-center">Keine Matches</p>
                            `}
                        </div>

                        <!-- Handicap Matches -->
                        <div class="bg-blue-50 rounded-lg p-4 border-2 ${stats.handicap.total > 0 ? 'border-blue-300' : 'border-blue-200 opacity-60'}">
                            <div class="text-center mb-2">
                                <p class="text-xs font-semibold text-blue-700 uppercase">Handicap</p>
                            </div>
                            ${stats.handicap.total > 0 ? `
                                <div class="flex justify-between text-sm mb-2">
                                    <span class="text-green-600 font-semibold">${stats.handicap.wins}S</span>
                                    <span class="text-gray-400">-</span>
                                    <span class="text-red-600 font-semibold">${stats.handicap.losses}N</span>
                                </div>
                                <div class="text-center">
                                    <p class="text-2xl font-bold ${stats.handicap.winRate >= 60 ? 'text-green-600' : stats.handicap.winRate <= 40 ? 'text-red-600' : 'text-gray-600'}">${stats.handicap.winRate}%</p>
                                    <p class="text-xs text-gray-500">${stats.handicap.total} Match${stats.handicap.total !== 1 ? 'es' : ''}</p>
                                </div>
                            ` : `
                                <p class="text-xs text-gray-400 text-center">Keine Matches</p>
                            `}
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Match History -->
            <div class="mb-4">
                <h4 class="text-lg font-semibold text-gray-900 mb-3">Match-Historie</h4>
                <div id="h2h-match-list" class="space-y-2">
                    ${renderMatchHistory(matches.slice(0, 3), currentUserId)}
                </div>
                ${matches.length > 3 ? `
                    <div class="text-center mt-4">
                        <button id="h2h-toggle-btn" class="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors">
                            + ${matches.length - 3} weitere Match${matches.length - 3 !== 1 ? 'es' : ''} anzeigen
                        </button>
                    </div>
                ` : ''}
            </div>
        `}
    `;

    // Add toggle functionality for match history
    if (matches.length > 3) {
        let showingAll = false;
        const toggleBtn = document.getElementById('h2h-toggle-btn');
        const matchList = document.getElementById('h2h-match-list');

        if (toggleBtn && matchList) {
            toggleBtn.addEventListener('click', () => {
                showingAll = !showingAll;
                if (showingAll) {
                    matchList.innerHTML = renderMatchHistory(matches, currentUserId);
                    toggleBtn.innerHTML = '− Weniger anzeigen';
                } else {
                    matchList.innerHTML = renderMatchHistory(matches.slice(0, 3), currentUserId);
                    toggleBtn.innerHTML = `+ ${matches.length - 3} weitere Match${matches.length - 3 !== 1 ? 'es' : ''} anzeigen`;
                }
            });
        }
    }
}

/**
 * Render match history list
 * @param {Array} matches - Array of matches (max 10)
 * @param {string} currentUserId - Current user's ID
 * @returns {string} HTML string
 */
function renderMatchHistory(matches, currentUserId) {
    if (matches.length === 0) {
        return '<p class="text-gray-400 text-center py-4">Keine Matches gefunden</p>';
    }

    return matches.map(match => {
        const isWinner = match.winnerId === currentUserId;
        const matchDate = new Date(match.timestamp || match.createdAt || Date.now());
        const formattedDate = formatMatchDate(matchDate);

        // Format sets
        const isPlayerA = match.playerAId === currentUserId;
        const setsDisplay = formatSets(match.sets, isPlayerA);

        return `
            <div class="flex items-center justify-between p-3 ${isWinner ? 'bg-green-50 border-l-4 border-green-500' : 'bg-red-50 border-l-4 border-red-500'} rounded-lg">
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <p class="text-sm font-semibold ${isWinner ? 'text-green-700' : 'text-red-700'}">
                            ${isWinner ? 'Sieg' : 'Niederlage'}
                        </p>
                        <p class="text-sm font-mono font-medium text-gray-800">${setsDisplay}</p>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                        <p class="text-xs text-gray-500">${formattedDate}</p>
                        ${match.handicapUsed ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Handicap</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format sets for display
 * @param {Array} sets - Array of set objects with playerA/playerB scores
 * @param {boolean} isPlayerA - Whether current user is playerA
 * @returns {string} Formatted sets string
 */
function formatSets(sets, isPlayerA) {
    if (!sets || sets.length === 0) return 'N/A';

    return sets
        .map(set => {
            const myScore = isPlayerA ? set.playerA : set.playerB;
            const oppScore = isPlayerA ? set.playerB : set.playerA;
            return `${myScore}:${oppScore}`;
        })
        .join(', ');
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
