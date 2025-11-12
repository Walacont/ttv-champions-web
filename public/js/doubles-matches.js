import { collection, addDoc, serverTimestamp, query, where, orderBy, onSnapshot, getDoc, doc, updateDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Doubles Matches Module
 * Handles doubles match functionality, pairing management, and rankings
 */

// ========================================================================
// ===== HELPER FUNCTIONS =====
// ========================================================================

/**
 * Creates a sorted pairing ID from two player IDs
 * Ensures that playerA + playerB = playerB + playerA
 * @param {string} player1Id - First player ID
 * @param {string} player2Id - Second player ID
 * @returns {string} Sorted pairing ID (e.g., "abc123_xyz789")
 */
export function createPairingId(player1Id, player2Id) {
    const ids = [player1Id, player2Id].sort();
    return `${ids[0]}_${ids[1]}`;
}

/**
 * Calculates team Elo as average of both players' doubles Elo
 * @param {Object} player1 - First player object with doublesEloRating
 * @param {Object} player2 - Second player object with doublesEloRating
 * @returns {number} Team Elo (average)
 */
export function calculateTeamElo(player1, player2) {
    const elo1 = player1.doublesEloRating || 800;
    const elo2 = player2.doublesEloRating || 800;
    return Math.round((elo1 + elo2) / 2);
}

// ========================================================================
// ===== COACH: DOUBLES MATCH SAVE =====
// ========================================================================

/**
 * Saves a doubles match result (Coach only)
 * @param {Object} matchData - Match data object
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveDoublesMatch(matchData, db, currentUserData) {
    const {
        teamA_player1Id,
        teamA_player2Id,
        teamB_player1Id,
        teamB_player2Id,
        winningTeam, // "A" or "B"
        sets,
        handicapUsed
    } = matchData;

    // Validate all players are different
    const allPlayerIds = [teamA_player1Id, teamA_player2Id, teamB_player1Id, teamB_player2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

    // Create pairing IDs
    const teamAPairingId = createPairingId(teamA_player1Id, teamA_player2Id);
    const teamBPairingId = createPairingId(teamB_player1Id, teamB_player2Id);

    // Create match document
    const doublesMatchRef = await addDoc(collection(db, 'doublesMatches'), {
        teamA: {
            player1Id: teamA_player1Id,
            player2Id: teamA_player2Id,
            pairingId: teamAPairingId
        },
        teamB: {
            player1Id: teamB_player1Id,
            player2Id: teamB_player2Id,
            pairingId: teamBPairingId
        },
        winningTeam: winningTeam,
        winningPairingId: winningTeam === 'A' ? teamAPairingId : teamBPairingId,
        losingPairingId: winningTeam === 'A' ? teamBPairingId : teamAPairingId,
        sets: sets,
        handicapUsed: handicapUsed || false,
        reportedBy: currentUserData.id,
        clubId: currentUserData.clubId,
        createdAt: serverTimestamp(),
        processed: false,
        source: 'coach'
    });

    console.log('Doubles match saved:', doublesMatchRef.id);
    return { success: true, matchId: doublesMatchRef.id };
}

// ========================================================================
// ===== PLAYER: DOUBLES MATCH REQUEST =====
// ========================================================================

/**
 * Creates a doubles match request (Player initiated)
 * @param {Object} requestData - Request data object
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function createDoublesMatchRequest(requestData, db, currentUserData) {
    const {
        partnerId,
        opponent1Id,
        opponent2Id,
        sets,
        handicapUsed
    } = requestData;

    const initiatorId = currentUserData.id;

    // Validate all players are different
    const allPlayerIds = [initiatorId, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

    // Determine winner
    const setsWonByInitiatorTeam = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const setsWonByOpponentTeam = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    let winningTeam;
    if (setsWonByInitiatorTeam >= 3) {
        winningTeam = 'A'; // Initiator's team won
    } else if (setsWonByOpponentTeam >= 3) {
        winningTeam = 'B'; // Opponent team won
    } else {
        throw new Error('Ungültiges Ergebnis: Kein Team hat 3 Sätze gewonnen');
    }

    // Create pairing IDs
    const initiatorPairingId = createPairingId(initiatorId, partnerId);
    const opponentPairingId = createPairingId(opponent1Id, opponent2Id);

    // Build the request document data
    const doublesRequestData = {
        teamA: {
            player1Id: initiatorId,
            player2Id: partnerId,
            pairingId: initiatorPairingId
        },
        teamB: {
            player1Id: opponent1Id,
            player2Id: opponent2Id,
            pairingId: opponentPairingId
        },
        winningTeam: winningTeam,
        winningPairingId: winningTeam === 'A' ? initiatorPairingId : opponentPairingId,
        losingPairingId: winningTeam === 'A' ? opponentPairingId : initiatorPairingId,
        sets: sets,
        handicapUsed: handicapUsed || false,
        initiatedBy: initiatorId,
        confirmations: {
            [partnerId]: false, // Partner notified
            [opponent1Id]: false, // Needs confirmation
            [opponent2Id]: false  // Needs confirmation
        },
        status: 'pending_opponent', // pending_opponent → pending_coach → approved
        clubId: currentUserData.clubId,
        createdAt: serverTimestamp()
    };

    console.log('📤 Creating doubles match request:', {
        initiator: initiatorId,
        partner: partnerId,
        opponents: [opponent1Id, opponent2Id],
        winningTeam,
        status: 'pending_opponent',
        clubId: currentUserData.clubId
    });

    const requestRef = await addDoc(collection(db, 'doublesMatchRequests'), doublesRequestData);

    console.log('✅ Doubles match request created successfully! ID:', requestRef.id);
    return { success: true, requestId: requestRef.id };
}

/**
 * Confirms a doubles match request (Opponent acceptance)
 * @param {string} requestId - Request document ID
 * @param {string} playerId - Player ID who is confirming
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Object>} Result object with success status
 */
export async function confirmDoublesMatchRequest(requestId, playerId, db) {
    const requestRef = doc(db, 'doublesMatchRequests', requestId);
    const requestDoc = await getDoc(requestRef);

    if (!requestDoc.exists()) {
        throw new Error('Anfrage nicht gefunden');
    }

    const requestData = requestDoc.data();

    // Check if player is one of the opponents
    const isOpponent = requestData.teamB.player1Id === playerId || requestData.teamB.player2Id === playerId;
    if (!isOpponent) {
        throw new Error('Du bist kein Gegner in diesem Match');
    }

    // Update confirmation
    await updateDoc(requestRef, {
        [`confirmations.${playerId}`]: true,
        status: 'pending_coach', // Move to coach approval
        confirmedBy: playerId,
        confirmedAt: serverTimestamp()
    });

    console.log('Doubles match request confirmed by opponent:', playerId);
    return { success: true };
}

/**
 * Approves a doubles match request (Coach only)
 * @param {string} requestId - Request document ID
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Coach user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function approveDoublesMatchRequest(requestId, db, currentUserData) {
    const requestRef = doc(db, 'doublesMatchRequests', requestId);

    await updateDoc(requestRef, {
        status: 'approved',
        approvedBy: currentUserData.id,
        approvedAt: serverTimestamp()
    });

    console.log('Doubles match request approved by coach');
    return { success: true };
}

/**
 * Rejects a doubles match request (Coach only)
 * @param {string} requestId - Request document ID
 * @param {string} reason - Rejection reason
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Coach user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function rejectDoublesMatchRequest(requestId, reason, db, currentUserData) {
    const requestRef = doc(db, 'doublesMatchRequests', requestId);

    await updateDoc(requestRef, {
        status: 'rejected',
        rejectedBy: currentUserData.id,
        rejectionReason: reason || 'Keine Angabe',
        rejectedAt: serverTimestamp()
    });

    console.log('Doubles match request rejected by coach');
    return { success: true };
}

// ========================================================================
// ===== DOUBLES LEADERBOARD =====
// ========================================================================

/**
 * Loads doubles pairings leaderboard for a club with real-time updates
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {HTMLElement} container - Container element to render leaderboard
 * @param {Array} unsubscribes - Array to store unsubscribe functions for cleanup
 */
export function loadDoublesLeaderboard(clubId, db, container, unsubscribes) {
    if (!container) return;

    const pairingsQuery = query(
        collection(db, 'doublesPairings'),
        where('clubId', '==', clubId),
        orderBy('matchesWon', 'desc')
    );

    const listener = onSnapshot(pairingsQuery, async (snapshot) => {
        const pairings = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            try {
                // Fetch player names
                const player1Doc = await getDoc(doc(db, 'users', data.player1Id));
                const player2Doc = await getDoc(doc(db, 'users', data.player2Id));

                if (player1Doc.exists() && player2Doc.exists()) {
                    const player1 = player1Doc.data();
                    const player2 = player2Doc.data();

                    pairings.push({
                        id: docSnap.id,
                        player1Name: `${player1.firstName} ${player1.lastName}`,
                        player2Name: `${player2.firstName} ${player2.lastName}`,
                        ...data
                    });
                } else {
                    // Skip pairings with missing player documents (e.g., deleted or migrated offline players)
                    console.warn(`Skipping pairing ${docSnap.id}: Player documents not found`, {
                        player1Exists: player1Doc.exists(),
                        player2Exists: player2Doc.exists(),
                        player1Id: data.player1Id,
                        player2Id: data.player2Id
                    });
                }
            } catch (error) {
                // Handle permission errors or missing documents gracefully
                console.error(`Error loading pairing ${docSnap.id}:`, error);
                console.warn(`Skipping pairing ${docSnap.id} due to error`);
            }
        }

        // Render the leaderboard with updated data
        renderDoublesLeaderboard(pairings, container);
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Renders the doubles leaderboard in the UI
 * @param {Array} pairings - Array of pairing objects
 * @param {HTMLElement} container - Container element
 */
export function renderDoublesLeaderboard(pairings, container) {
    if (!container) return;

    if (pairings.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Noch keine Doppel-Matches gespielt</p>';
        return;
    }

    let html = `
        <div class="overflow-x-auto">
            <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rang</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Team</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Matches</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Siege</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Niederlagen</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Siegrate</th>
                        <th class="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Elo</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
    `;

    pairings.forEach((pairing, index) => {
        const rank = index + 1;
        const winRate = pairing.matchesPlayed > 0
            ? ((pairing.matchesWon / pairing.matchesPlayed) * 100).toFixed(1)
            : 0;

        html += `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-bold text-gray-900">#${rank}</td>
                <td class="px-4 py-3 text-sm">
                    <span class="font-semibold text-indigo-700">${pairing.player1Name}</span>
                    <span class="text-gray-400 mx-1">&</span>
                    <span class="font-semibold text-indigo-700">${pairing.player2Name}</span>
                </td>
                <td class="px-4 py-3 text-sm text-center">${pairing.matchesPlayed}</td>
                <td class="px-4 py-3 text-sm text-center text-green-600 font-medium">${pairing.matchesWon}</td>
                <td class="px-4 py-3 text-sm text-center text-red-600">${pairing.matchesLost}</td>
                <td class="px-4 py-3 text-sm text-center font-medium">${winRate}%</td>
                <td class="px-4 py-3 text-sm text-center font-bold">${Math.round(pairing.currentEloRating)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    container.innerHTML = html;
}

// ========================================================================
// ===== LOAD COACH DOUBLES MATCH REQUESTS =====
// ========================================================================

/**
 * Loads pending doubles match requests for coach approval
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {HTMLElement} container - Container element for rendering
 * @returns {Function} Unsubscribe function
 */
export async function loadCoachDoublesMatchRequests(userData, db, container) {
    if (!container) return;

    const requestsQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_coach'),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(requestsQuery, async (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Doppel-Anfragen</p>';
            return;
        }

        const requests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            try {
                // Fetch all 4 player names
                const [p1Doc, p2Doc, p3Doc, p4Doc] = await Promise.all([
                    getDoc(doc(db, 'users', data.teamA.player1Id)),
                    getDoc(doc(db, 'users', data.teamA.player2Id)),
                    getDoc(doc(db, 'users', data.teamB.player1Id)),
                    getDoc(doc(db, 'users', data.teamB.player2Id))
                ]);

                requests.push({
                    id: docSnap.id,
                    ...data,
                    teamAPlayer1: p1Doc.exists() ? p1Doc.data() : null,
                    teamAPlayer2: p2Doc.exists() ? p2Doc.data() : null,
                    teamBPlayer1: p3Doc.exists() ? p3Doc.data() : null,
                    teamBPlayer2: p4Doc.exists() ? p4Doc.data() : null
                });
            } catch (error) {
                // Handle permission errors for migrated offline players
                console.error(`Error loading players for doubles request ${docSnap.id}:`, error);
                // Still add the request but with null player data
                requests.push({
                    id: docSnap.id,
                    ...data,
                    teamAPlayer1: null,
                    teamAPlayer2: null,
                    teamBPlayer1: null,
                    teamBPlayer2: null
                });
            }
        }

        renderCoachDoublesRequestCards(requests, db, userData, container);
    });

    return unsubscribe;
}

/**
 * Renders doubles match request cards for coach
 */
function renderCoachDoublesRequestCards(requests, db, userData, container) {
    if (!container) return;

    container.innerHTML = '';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-3';

        const teamAName1 = request.teamAPlayer1?.firstName || 'Unbekannt';
        const teamAName2 = request.teamAPlayer2?.firstName || 'Unbekannt';
        const teamBName1 = request.teamBPlayer1?.firstName || 'Unbekannt';
        const teamBName2 = request.teamBPlayer2?.firstName || 'Unbekannt';

        const setsDisplay = formatDoublesSets(request.sets);
        const winnerTeamName = request.winningTeam === 'A'
            ? `${teamAName1} & ${teamAName2}`
            : `${teamBName1} & ${teamBName2}`;

        const createdDate = request.createdAt?.toDate ?
            request.createdAt.toDate().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) :
            'Unbekannt';

        card.innerHTML = `
            <div class="mb-3">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 mb-1">
                            <span class="text-indigo-700">${teamAName1} & ${teamAName2}</span>
                            <span class="text-gray-500 mx-2">vs</span>
                            <span class="text-indigo-700">${teamBName1} & ${teamBName2}</span>
                        </p>
                        <p class="text-sm text-gray-600 mt-1">${setsDisplay}</p>
                        <p class="text-sm font-medium text-green-700 mt-1">
                            <i class="fas fa-trophy mr-1"></i> Gewinner: ${winnerTeamName}
                        </p>
                        <p class="text-xs text-blue-600 mt-1">
                            <i class="fas fa-users mr-1"></i> Doppel-Match
                        </p>
                    </div>
                    <div class="text-right">
                        <span class="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
                            <i class="fas fa-clock"></i> Wartet
                        </span>
                        <p class="text-xs text-gray-500 mt-1">${createdDate}</p>
                    </div>
                </div>
            </div>
            <div class="flex gap-2 mt-3">
                <button class="doubles-approve-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
                    <i class="fas fa-check"></i> Genehmigen
                </button>
                <button class="doubles-reject-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
                    <i class="fas fa-times"></i> Ablehnen
                </button>
            </div>
        `;

        const approveBtn = card.querySelector('.doubles-approve-btn');
        const rejectBtn = card.querySelector('.doubles-reject-btn');

        approveBtn.addEventListener('click', async () => {
            try {
                await approveDoublesMatchRequest(request.id, db, userData);
                alert('Doppel-Match genehmigt!');
            } catch (error) {
                console.error('Error approving doubles request:', error);
                alert('Fehler beim Genehmigen: ' + error.message);
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const reason = prompt('Grund für die Ablehnung (optional):');
            try {
                await rejectDoublesMatchRequest(request.id, reason, db, userData);
                alert('Doppel-Match abgelehnt.');
            } catch (error) {
                console.error('Error rejecting doubles request:', error);
                alert('Fehler beim Ablehnen: ' + error.message);
            }
        });

        container.appendChild(card);
    });
}

/**
 * Formats sets display for doubles matches
 */
function formatDoublesSets(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');
    const winsA = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const winsB = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    return `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;
}

// ========================================================================
// ===== OPPONENT CONFIRMATION WORKFLOW =====
// ========================================================================

/**
 * Loads pending doubles match requests where current user is an opponent
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {HTMLElement} container - Container element to render requests
 */
export function loadPendingDoublesRequestsForOpponent(userData, db, container) {
    const q = query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_opponent'),
        orderBy('createdAt', 'desc')
    );

    onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine Doppel-Anfragen</p>';
            return;
        }

        const requests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            // Check if current user is one of the opponents (teamB)
            if (data.teamB.player1Id === userData.id || data.teamB.player2Id === userData.id) {
                try {
                    // Fetch player names
                    const [teamAPlayer1, teamAPlayer2, teamBPlayer1, teamBPlayer2] = await Promise.all([
                        getDoc(doc(db, 'users', data.teamA.player1Id)),
                        getDoc(doc(db, 'users', data.teamA.player2Id)),
                        getDoc(doc(db, 'users', data.teamB.player1Id)),
                        getDoc(doc(db, 'users', data.teamB.player2Id))
                    ]);

                    requests.push({
                        id: docSnap.id,
                        ...data,
                        teamAPlayer1: teamAPlayer1.exists() ? teamAPlayer1.data() : null,
                        teamAPlayer2: teamAPlayer2.exists() ? teamAPlayer2.data() : null,
                        teamBPlayer1: teamBPlayer1.exists() ? teamBPlayer1.data() : null,
                        teamBPlayer2: teamBPlayer2.exists() ? teamBPlayer2.data() : null
                    });
                } catch (error) {
                    console.error(`Error loading players for doubles opponent request ${docSnap.id}:`, error);
                    // Still add request with null player data
                    requests.push({
                        id: docSnap.id,
                        ...data,
                        teamAPlayer1: null,
                        teamAPlayer2: null,
                        teamBPlayer1: null,
                        teamBPlayer2: null
                    });
                }
            }
        }

        if (requests.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine Doppel-Anfragen</p>';
            return;
        }

        renderPendingDoublesRequestsForOpponent(requests, container, db, userData);
    });
}

/**
 * Renders pending doubles requests cards for opponent confirmation
 * @param {Array} requests - Array of request objects
 * @param {HTMLElement} container - Container element
 * @param {Object} db - Firestore database instance
 * @param {Object} userData - Current user data
 */
function renderPendingDoublesRequestsForOpponent(requests, container, db, userData) {
    container.innerHTML = '';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'border border-green-200 bg-green-50 rounded-lg p-4';

        const teamAName1 = request.teamAPlayer1?.firstName || 'Unbekannt';
        const teamAName2 = request.teamAPlayer2?.firstName || 'Unbekannt';
        const teamBName1 = request.teamBPlayer1?.firstName || 'Unbekannt';
        const teamBName2 = request.teamBPlayer2?.firstName || 'Unbekannt';

        const setsDisplay = formatDoublesSets(request.sets);
        const winnerTeamName = request.winningTeam === 'A'
            ? `${teamAName1} & ${teamAName2}`
            : `${teamBName1} & ${teamBName2}`;

        const createdDate = request.createdAt?.toDate ?
            request.createdAt.toDate().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) :
            'Unbekannt';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="text-sm font-semibold text-gray-800 mb-1">🎾 Doppel-Match bestätigen</div>
                    <div class="text-xs text-gray-500">${createdDate}</div>
                </div>
                <span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-semibold">
                    Warte auf deine Bestätigung
                </span>
            </div>

            <div class="space-y-2 mb-3">
                <div class="text-sm">
                    <span class="font-semibold text-indigo-700">Team A:</span>
                    ${teamAName1} & ${teamAName2}
                </div>
                <div class="text-sm">
                    <span class="font-semibold text-orange-700">Team B (dein Team):</span>
                    ${teamBName1} & ${teamBName2}
                </div>
            </div>

            <div class="bg-white rounded p-2 mb-3">
                <div class="text-xs text-gray-600 mb-1">Ergebnis:</div>
                <div class="text-sm">${setsDisplay}</div>
                <div class="text-xs text-green-600 mt-1">🏆 Gewinner: ${winnerTeamName}</div>
            </div>

            <div class="flex gap-2">
                <button
                    class="confirm-doubles-btn flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded transition"
                    data-request-id="${request.id}"
                >
                    ✓ Bestätigen
                </button>
                <button
                    class="reject-doubles-btn flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded transition"
                    data-request-id="${request.id}"
                >
                    ✗ Ablehnen
                </button>
            </div>
        `;

        // Add event listeners
        const confirmBtn = card.querySelector('.confirm-doubles-btn');
        const rejectBtn = card.querySelector('.reject-doubles-btn');

        confirmBtn.addEventListener('click', async () => {
            if (!confirm('Möchtest du dieses Doppel-Match bestätigen?')) return;

            try {
                await confirmDoublesMatchRequest(request.id, userData.id, db);
                alert('Doppel-Match bestätigt! Wartet nun auf Coach-Genehmigung.');
            } catch (error) {
                console.error('Error confirming doubles request:', error);
                alert('Fehler beim Bestätigen: ' + error.message);
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const reason = prompt('Grund für die Ablehnung (optional):');
            if (reason === null) return; // User cancelled

            try {
                await rejectDoublesMatchRequest(request.id, reason || 'Abgelehnt vom Gegner', db, userData);
                alert('Doppel-Match abgelehnt.');
            } catch (error) {
                console.error('Error rejecting doubles request:', error);
                alert('Fehler beim Ablehnen: ' + error.message);
            }
        });

        container.appendChild(card);
    });
}
