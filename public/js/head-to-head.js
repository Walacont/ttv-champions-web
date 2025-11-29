import {
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Head-to-Head Statistics Module
 * Shows match history and win/loss statistics between two players
 */

// ========================================================================
// ===== MODAL MANAGEMENT =====
// ========================================================================

let currentModal = null;

/**
 * Show head-to-head statistics modal for two players
 * @param {Object} db - Firestore database instance
 * @param {string} currentUserId - Current user's ID
 * @param {string} opponentId - Opponent player's ID
 */
export async function showHeadToHeadModal(db, currentUserId, opponentId) {
    // Close existing modal if any
    closeHeadToHeadModal();

    // Create modal container
    const modal = document.createElement('div');
    modal.id = 'head-to-head-modal';
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
    await loadHeadToHeadStats(db, currentUserId, opponentId);
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
 * @param {Object} db - Firestore database instance
 * @param {string} currentUserId - Current user's ID
 * @param {string} opponentId - Opponent player's ID
 */
async function loadHeadToHeadStats(db, currentUserId, opponentId) {
    const contentEl = document.getElementById('h2h-content');

    try {
        // Fetch opponent data
        const opponentDoc = await getDoc(doc(db, 'users', opponentId));
        if (!opponentDoc.exists()) {
            contentEl.innerHTML = '<p class="text-red-500">Spieler nicht gefunden.</p>';
            return;
        }

        const opponentData = opponentDoc.data();
        const opponentName = `${opponentData.firstName || ''} ${opponentData.lastName || ''}`.trim();

        // Query all matches between these two players
        const matchesRef = collection(db, 'matches');

        // Query where current user is playerA and opponent is playerB
        const queryAB = query(
            matchesRef,
            where('playerAId', '==', currentUserId),
            where('playerBId', '==', opponentId),
            where('processed', '==', true)
        );

        // Query where opponent is playerA and current user is playerB
        const queryBA = query(
            matchesRef,
            where('playerAId', '==', opponentId),
            where('playerBId', '==', currentUserId),
            where('processed', '==', true)
        );

        // Execute both queries
        const [snapshotAB, snapshotBA] = await Promise.all([
            getDocs(queryAB),
            getDocs(queryBA),
        ]);

        // Combine all matches
        const allMatches = [
            ...snapshotAB.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            ...snapshotBA.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ];

        // Sort by timestamp descending
        allMatches.sort((a, b) => {
            const timeA = a.timestamp?.toMillis() || a.createdAt?.toMillis() || 0;
            const timeB = b.timestamp?.toMillis() || b.createdAt?.toMillis() || 0;
            return timeB - timeA;
        });

        // Calculate statistics
        const stats = calculateStats(allMatches, currentUserId);

        // Render the modal content
        renderHeadToHeadContent(contentEl, opponentData, opponentName, stats, allMatches, currentUserId);

    } catch (error) {
        console.error('Error loading head-to-head stats:', error);
        contentEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Statistiken.</p>';
    }
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

    matches.forEach(match => {
        if (match.winnerId === currentUserId) {
            wins++;
        } else {
            losses++;
        }
    });

    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    return {
        wins,
        losses,
        totalMatches,
        winRate,
    };
}

/**
 * Render the head-to-head modal content
 * @param {HTMLElement} container - Container element
 * @param {Object} opponentData - Opponent's user data
 * @param {string} opponentName - Opponent's display name
 * @param {Object} stats - Statistics object
 * @param {Array} matches - Array of matches
 * @param {string} currentUserId - Current user's ID
 */
function renderHeadToHeadContent(container, opponentData, opponentName, stats, matches, currentUserId) {
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
        </div>

        ${stats.totalMatches === 0 ? `
            <!-- No Matches Yet -->
            <div class="bg-gray-50 rounded-lg p-6 text-center">
                <p class="text-gray-500">Noch keine Matches gegen ${opponentName.split(' ')[0]} gespielt.</p>
            </div>
        ` : `
            <!-- Statistics -->
            <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-6 mb-6">
                <h4 class="text-lg font-semibold text-gray-900 mb-4 text-center">🏆 Deine Bilanz</h4>

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

            <!-- Match History -->
            <div class="mb-4">
                <h4 class="text-lg font-semibold text-gray-900 mb-3">📊 Match-Historie</h4>
                <div class="space-y-2">
                    ${renderMatchHistory(matches.slice(0, 10), currentUserId)}
                </div>
                ${matches.length > 10 ? `
                    <p class="text-xs text-gray-500 text-center mt-3">
                        ... und ${matches.length - 10} weitere Match${matches.length - 10 !== 1 ? 'es' : ''}
                    </p>
                ` : ''}
            </div>
        `}
    `;
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
        const matchDate = match.timestamp?.toDate() || match.createdAt?.toDate() || new Date();
        const formattedDate = formatMatchDate(matchDate);

        // Format sets
        const isPlayerA = match.playerAId === currentUserId;
        const setsDisplay = formatSets(match.sets, isPlayerA);

        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-3">
                    <span class="text-2xl">${isWinner ? '🏆' : '😔'}</span>
                    <div>
                        <p class="text-sm font-semibold ${isWinner ? 'text-green-700' : 'text-red-700'}">
                            ${isWinner ? 'Sieg' : 'Niederlage'}
                        </p>
                        <p class="text-xs text-gray-500">${formattedDate}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-mono font-medium text-gray-800">${setsDisplay}</p>
                    ${match.handicapUsed ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Handicap</span>' : ''}
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
