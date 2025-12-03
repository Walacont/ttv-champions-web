import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Doubles Head-to-Head Statistics Module
 * Shows match history and statistics between two doubles teams
 */

let currentModal = null;

/**
 * Show head-to-head statistics modal for two doubles teams
 * @param {Object} db - Firestore database instance
 * @param {string} currentUserId - Current user's ID
 * @param {Object} opponentTeam - Opponent team object with player1Id and player2Id
 */
export async function showDoublesHeadToHeadModal(db, currentUserId, opponentTeam) {
    // Close existing modal if any
    closeDoublesHeadToHeadModal();

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'doubles-h2h-modal';
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold text-gray-900">Doppel Head-to-Head</h2>
                    <button id="close-doubles-h2h-modal" class="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                        ×
                    </button>
                </div>
                <div id="doubles-h2h-content" class="text-center py-8">
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
            closeDoublesHeadToHeadModal();
        }
    });

    // Close button
    document.getElementById('close-doubles-h2h-modal').addEventListener('click', closeDoublesHeadToHeadModal);

    // Load and display statistics
    await loadDoublesHeadToHeadStats(db, currentUserId, opponentTeam);
}

/**
 * Close the doubles head-to-head modal
 */
export function closeDoublesHeadToHeadModal() {
    if (currentModal) {
        currentModal.remove();
        currentModal = null;
    }
}

/**
 * Load and display doubles head-to-head statistics
 * @param {Object} db - Firestore database instance
 * @param {string} currentUserId - Current user's ID
 * @param {Object} opponentTeam - Opponent team with player1Id, player2Id, player1Name, player2Name
 */
async function loadDoublesHeadToHeadStats(db, currentUserId, opponentTeam) {
    const contentEl = document.getElementById('doubles-h2h-content');

    try {
        const opponentPlayer1Id = opponentTeam.player1Id;
        const opponentPlayer2Id = opponentTeam.player2Id;
        const opponentTeamName = `${opponentTeam.player1Name} & ${opponentTeam.player2Name}`;

        // Query all doubles matches where current user played against this opponent team
        // We need to check all combinations where:
        // - Current user is in team A or B
        // - Opponent team (both players) is in the other team
        const matchesRef = collection(db, 'doublesMatches');

        // Get all processed doubles matches
        const allMatchesQuery = query(
            matchesRef,
            where('processed', '==', true)
        );

        const snapshot = await getDocs(allMatchesQuery);

        // Filter matches where current user played against this specific opponent team
        const relevantMatches = [];
        const pairingHistory = new Map(); // Track which pairings I used

        snapshot.docs.forEach(docSnap => {
            const match = { id: docSnap.id, ...docSnap.data() };

            // Check if this match involves current user and the opponent team
            const teamAPlayers = [match.teamAPlayer1Id, match.teamAPlayer2Id].sort();
            const teamBPlayers = [match.teamBPlayer1Id, match.teamBPlayer2Id].sort();
            const opponentPlayers = [opponentPlayer1Id, opponentPlayer2Id].sort();

            const currentUserInTeamA = teamAPlayers.includes(currentUserId);
            const currentUserInTeamB = teamBPlayers.includes(currentUserId);
            const opponentTeamInTeamA = teamAPlayers.every(p => opponentPlayers.includes(p));
            const opponentTeamInTeamB = teamBPlayers.every(p => opponentPlayers.includes(p));

            // Match is relevant if:
            // - Current user is in one team AND opponent team is in the other team
            if ((currentUserInTeamA && opponentTeamInTeamB) || (currentUserInTeamB && opponentTeamInTeamA)) {
                relevantMatches.push(match);

                // Track pairing
                const myPartnerId = currentUserInTeamA
                    ? teamAPlayers.find(p => p !== currentUserId)
                    : teamBPlayers.find(p => p !== currentUserId);

                if (myPartnerId) {
                    const count = pairingHistory.get(myPartnerId) || 0;
                    pairingHistory.set(myPartnerId, count + 1);
                }
            }
        });

        // Sort by timestamp descending
        relevantMatches.sort((a, b) => {
            const timeA = a.timestamp?.toMillis() || a.createdAt?.toMillis() || 0;
            const timeB = b.timestamp?.toMillis() || b.createdAt?.toMillis() || 0;
            return timeB - timeA;
        });

        // Calculate statistics
        const stats = calculateDoublesStats(relevantMatches, currentUserId, [opponentPlayer1Id, opponentPlayer2Id]);

        // Get partner names for pairings
        const partnerNames = await getPartnerNames(db, Array.from(pairingHistory.keys()));

        // Render the modal content
        renderDoublesHeadToHeadContent(
            contentEl,
            opponentTeamName,
            stats,
            relevantMatches,
            currentUserId,
            pairingHistory,
            partnerNames
        );

    } catch (error) {
        console.error('Error loading doubles head-to-head stats:', error);
        contentEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Statistiken.</p>';
    }
}

/**
 * Get partner names from their IDs
 */
async function getPartnerNames(db, partnerIds) {
    const names = new Map();

    for (const partnerId of partnerIds) {
        try {
            const partnerDoc = await getDoc(doc(db, 'users', partnerId));
            if (partnerDoc.exists()) {
                const data = partnerDoc.data();
                names.set(partnerId, `${data.firstName || ''} ${data.lastName || ''}`.trim());
            }
        } catch (error) {
            console.error('Error fetching partner name:', error);
        }
    }

    return names;
}

/**
 * Calculate doubles statistics
 */
function calculateDoublesStats(matches, currentUserId, opponentPlayerIds) {
    let wins = 0;
    let losses = 0;
    let setsWon = 0;
    let setsLost = 0;

    matches.forEach(match => {
        // Determine if current user was in team A or B
        const teamAPlayers = [match.teamAPlayer1Id, match.teamAPlayer2Id];
        const currentUserInTeamA = teamAPlayers.includes(currentUserId);

        const isWinner = currentUserInTeamA
            ? match.winnerId === 'A'
            : match.winnerId === 'B';

        if (isWinner) {
            wins++;
        } else {
            losses++;
        }

        // Count sets
        if (match.sets && Array.isArray(match.sets)) {
            match.sets.forEach(set => {
                const myScore = currentUserInTeamA ? parseInt(set.teamA) || 0 : parseInt(set.teamB) || 0;
                const oppScore = currentUserInTeamA ? parseInt(set.teamB) || 0 : parseInt(set.teamA) || 0;

                if (myScore > oppScore) {
                    setsWon++;
                } else if (oppScore > myScore) {
                    setsLost++;
                }
            });
        }
    });

    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    return {
        wins,
        losses,
        totalMatches,
        winRate,
        setsWon,
        setsLost,
    };
}

/**
 * Render doubles head-to-head content
 */
function renderDoublesHeadToHeadContent(container, opponentTeamName, stats, matches, currentUserId, pairingHistory, partnerNames) {
    let winRateColor = 'text-gray-600';
    if (stats.winRate >= 60) {
        winRateColor = 'text-green-600';
    } else if (stats.winRate <= 40) {
        winRateColor = 'text-red-600';
    }

    // Build pairings list HTML
    let pairingsHTML = '';
    if (pairingHistory.size > 0) {
        pairingsHTML = '<div class="mb-6"><h4 class="text-md font-semibold text-gray-900 mb-2">Deine Paarungen</h4><div class="space-y-1">';
        pairingHistory.forEach((count, partnerId) => {
            const partnerName = partnerNames.get(partnerId) || 'Unbekannt';
            pairingsHTML += `<p class="text-sm text-gray-700">• Mit <span class="font-semibold">${partnerName}</span>: ${count} Match${count !== 1 ? 'es' : ''}</p>`;
        });
        pairingsHTML += '</div></div>';
    }

    container.innerHTML = `
        <!-- Opponent Team Info -->
        <div class="text-center mb-6">
            <h3 class="text-xl font-bold text-gray-900">${opponentTeamName}</h3>
        </div>

        ${stats.totalMatches === 0 ? `
            <!-- No Matches Yet -->
            <div class="bg-gray-50 rounded-lg p-6 text-center">
                <p class="text-gray-500">Noch keine Matches gegen dieses Team gespielt.</p>
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

                <div class="bg-white rounded-lg p-4 text-center shadow mb-4">
                    <p class="text-4xl font-bold ${winRateColor}">${stats.winRate}%</p>
                    <p class="text-sm text-gray-600">Siegrate</p>
                </div>

                <!-- Sets Ratio -->
                <div class="bg-white rounded-lg p-4 text-center shadow">
                    <div class="flex items-center justify-center gap-2">
                        <p class="text-3xl font-bold text-indigo-600">${stats.setsWon}</p>
                        <p class="text-2xl text-gray-400">:</p>
                        <p class="text-3xl font-bold text-purple-600">${stats.setsLost}</p>
                    </div>
                    <p class="text-sm text-gray-600 mt-2">Satzverhältnis</p>
                </div>
            </div>

            ${pairingsHTML}

            <!-- Match History -->
            <div class="mb-4">
                <h4 class="text-lg font-semibold text-gray-900 mb-3">Match-Historie</h4>
                <div id="doubles-h2h-match-list" class="space-y-2">
                    ${renderDoublesMatchHistory(matches.slice(0, 3), currentUserId)}
                </div>
                ${matches.length > 3 ? `
                    <div class="text-center mt-4">
                        <button id="doubles-h2h-toggle-btn" class="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors">
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
        const toggleBtn = document.getElementById('doubles-h2h-toggle-btn');
        const matchList = document.getElementById('doubles-h2h-match-list');

        if (toggleBtn && matchList) {
            toggleBtn.addEventListener('click', () => {
                showingAll = !showingAll;
                if (showingAll) {
                    matchList.innerHTML = renderDoublesMatchHistory(matches, currentUserId);
                    toggleBtn.innerHTML = '− Weniger anzeigen';
                } else {
                    matchList.innerHTML = renderDoublesMatchHistory(matches.slice(0, 3), currentUserId);
                    toggleBtn.innerHTML = `+ ${matches.length - 3} weitere Match${matches.length - 3 !== 1 ? 'es' : ''} anzeigen`;
                }
            });
        }
    }
}

/**
 * Render doubles match history list
 */
function renderDoublesMatchHistory(matches, currentUserId) {
    if (matches.length === 0) {
        return '<p class="text-gray-400 text-center py-4">Keine Matches gefunden</p>';
    }

    return matches.map(match => {
        const teamAPlayers = [match.teamAPlayer1Id, match.teamAPlayer2Id];
        const currentUserInTeamA = teamAPlayers.includes(currentUserId);

        const isWinner = currentUserInTeamA
            ? match.winnerId === 'A'
            : match.winnerId === 'B';

        const matchDate = match.timestamp?.toDate() || match.createdAt?.toDate() || new Date();
        const formattedDate = formatMatchDate(matchDate);

        // Format sets
        const setsDisplay = formatDoublesS(match.sets, currentUserInTeamA);

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
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Format sets for display
 */
function formatDoublesS(sets, isTeamA) {
    if (!sets || sets.length === 0) return 'N/A';

    return sets
        .map(set => {
            const myScore = isTeamA ? set.teamA : set.teamB;
            const oppScore = isTeamA ? set.teamB : set.teamA;
            return `${myScore}:${oppScore}`;
        })
        .join(', ');
}

/**
 * Format match date
 */
function formatMatchDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

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
