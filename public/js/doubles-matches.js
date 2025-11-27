import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    onSnapshot,
    getDoc,
    doc,
    updateDoc,
    setDoc,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Doubles Matches Module
 * Handles doubles match functionality, pairing management, and rankings
 */

// ========================================================================
// ===== HELPER FUNCTIONS =====
// ========================================================================

/**
 * Checks if a player has no club
 * @param {string|null|undefined} clubId - The club ID to check
 * @returns {boolean} True if player has no club (null, undefined, or empty string)
 */
function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

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
        handicapUsed,
        matchMode = 'best-of-5',
    } = matchData;

    // Validate all players are different
    const allPlayerIds = [teamA_player1Id, teamA_player2Id, teamB_player1Id, teamB_player2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

    // Load all 4 players to check their clubIds
    const [player1Doc, player2Doc, player3Doc, player4Doc] = await Promise.all([
        getDoc(doc(db, 'users', teamA_player1Id)),
        getDoc(doc(db, 'users', teamA_player2Id)),
        getDoc(doc(db, 'users', teamB_player1Id)),
        getDoc(doc(db, 'users', teamB_player2Id)),
    ]);

    const player1ClubId = player1Doc.exists() ? player1Doc.data().clubId : null;
    const player2ClubId = player2Doc.exists() ? player2Doc.data().clubId : null;
    const player3ClubId = player3Doc.exists() ? player3Doc.data().clubId : null;
    const player4ClubId = player4Doc.exists() ? player4Doc.data().clubId : null;

    // Determine clubId: Only set if all 4 players are from the same club
    let matchClubId = null;
    if (
        player1ClubId &&
        player1ClubId === player2ClubId &&
        player1ClubId === player3ClubId &&
        player1ClubId === player4ClubId
    ) {
        matchClubId = player1ClubId;
    }

    // Create pairing IDs
    const teamAPairingId = createPairingId(teamA_player1Id, teamA_player2Id);
    const teamBPairingId = createPairingId(teamB_player1Id, teamB_player2Id);

    // Create match document
    const doublesMatchRef = await addDoc(collection(db, 'doublesMatches'), {
        teamA: {
            player1Id: teamA_player1Id,
            player2Id: teamA_player2Id,
            pairingId: teamAPairingId,
        },
        teamB: {
            player1Id: teamB_player1Id,
            player2Id: teamB_player2Id,
            pairingId: teamBPairingId,
        },
        winningTeam: winningTeam,
        winningPairingId: winningTeam === 'A' ? teamAPairingId : teamBPairingId,
        losingPairingId: winningTeam === 'A' ? teamBPairingId : teamAPairingId,
        sets: sets,
        handicapUsed: handicapUsed || false,
        matchMode: matchMode,
        reportedBy: currentUserData.id,
        clubId: matchClubId, // null if players are from different clubs
        isCrossClub: matchClubId === null, // Flag to indicate cross-club team
        createdAt: serverTimestamp(),
        processed: false,
        source: 'coach',
    });

    console.log('Doubles match saved:', doublesMatchRef.id, 'clubId:', matchClubId, 'isCrossClub:', matchClubId === null);
    return { success: true, matchId: doublesMatchRef.id, isCrossClub: matchClubId === null };
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
        handicapUsed,
        matchMode = 'best-of-5',
    } = requestData;

    const initiatorId = currentUserData.id;

    // Validate all players are different
    const allPlayerIds = [initiatorId, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

    // Load all 4 players to check their clubIds
    const [initiatorDoc, partnerDoc, opponent1Doc, opponent2Doc] = await Promise.all([
        getDoc(doc(db, 'users', initiatorId)),
        getDoc(doc(db, 'users', partnerId)),
        getDoc(doc(db, 'users', opponent1Id)),
        getDoc(doc(db, 'users', opponent2Id)),
    ]);

    const initiatorClubId = initiatorDoc.exists() ? initiatorDoc.data().clubId : null;
    const partnerClubId = partnerDoc.exists() ? partnerDoc.data().clubId : null;
    const opponent1ClubId = opponent1Doc.exists() ? opponent1Doc.data().clubId : null;
    const opponent2ClubId = opponent2Doc.exists() ? opponent2Doc.data().clubId : null;

    // Determine clubId: Only set if all 4 players are from the same club
    let matchClubId = null;
    if (
        initiatorClubId &&
        initiatorClubId === partnerClubId &&
        initiatorClubId === opponent1ClubId &&
        initiatorClubId === opponent2ClubId
    ) {
        matchClubId = initiatorClubId;
    }

    // Determine required sets to win based on match mode
    let setsToWin;
    switch (matchMode) {
        case 'single-set':
            setsToWin = 1;
            break;
        case 'best-of-3':
            setsToWin = 2;
            break;
        case 'best-of-5':
            setsToWin = 3;
            break;
        case 'best-of-7':
            setsToWin = 4;
            break;
        default:
            setsToWin = 3;
    }

    // Determine winner
    const setsWonByInitiatorTeam = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const setsWonByOpponentTeam = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    let winningTeam;
    if (setsWonByInitiatorTeam >= setsToWin) {
        winningTeam = 'A'; // Initiator's team won
    } else if (setsWonByOpponentTeam >= setsToWin) {
        winningTeam = 'B'; // Opponent team won
    } else {
        throw new Error(`Ungültiges Ergebnis: Kein Team hat ${setsToWin} Sätze gewonnen`);
    }

    // Create pairing IDs
    const initiatorPairingId = createPairingId(initiatorId, partnerId);
    const opponentPairingId = createPairingId(opponent1Id, opponent2Id);

    // Get player names from requestData if provided, otherwise use userData
    const playerNames = requestData.playerNames || {};

    // Build the request document data
    const doublesRequestData = {
        teamA: {
            player1Id: initiatorId,
            player2Id: partnerId,
            player1Name:
                playerNames.player1 || `${currentUserData.firstName} ${currentUserData.lastName}`,
            player2Name: playerNames.player2 || 'Unbekannt',
            pairingId: initiatorPairingId,
        },
        teamB: {
            player1Id: opponent1Id,
            player2Id: opponent2Id,
            player1Name: playerNames.opponent1 || 'Unbekannt',
            player2Name: playerNames.opponent2 || 'Unbekannt',
            pairingId: opponentPairingId,
        },
        winningTeam: winningTeam,
        winningPairingId: winningTeam === 'A' ? initiatorPairingId : opponentPairingId,
        losingPairingId: winningTeam === 'A' ? opponentPairingId : initiatorPairingId,
        sets: sets,
        handicapUsed: handicapUsed || false,
        matchMode: matchMode,
        initiatedBy: initiatorId,
        confirmations: {
            [partnerId]: false, // Partner notified
            [opponent1Id]: false, // Needs confirmation
            [opponent2Id]: false, // Needs confirmation
        },
        status: 'pending_opponent', // pending_opponent → pending_coach → approved
        clubId: matchClubId, // null if players are from different clubs
        isCrossClub: matchClubId === null, // Flag to indicate cross-club team
        createdAt: serverTimestamp(),
    };

    console.log('📤 Creating doubles match request:', {
        initiator: initiatorId,
        partner: partnerId,
        opponents: [opponent1Id, opponent2Id],
        winningTeam,
        status: 'pending_opponent',
        clubId: matchClubId,
        isCrossClub: matchClubId === null,
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
    const isOpponent =
        requestData.teamB.player1Id === playerId || requestData.teamB.player2Id === playerId;
    if (!isOpponent) {
        throw new Error('Du bist kein Gegner in diesem Match');
    }

    // Load all 4 players to check club status
    const [player1Doc, player2Doc, player3Doc, player4Doc] = await Promise.all([
        getDoc(doc(db, 'users', requestData.teamA.player1Id)),
        getDoc(doc(db, 'users', requestData.teamA.player2Id)),
        getDoc(doc(db, 'users', requestData.teamB.player1Id)),
        getDoc(doc(db, 'users', requestData.teamB.player2Id)),
    ]);

    const player1Data = player1Doc.data();
    const player2Data = player2Doc.data();
    const player3Data = player3Doc.data();
    const player4Data = player4Doc.data();

    // Check if at least one team has no club → auto-approve
    const teamANoClub = hasNoClub(player1Data?.clubId) && hasNoClub(player2Data?.clubId);
    const teamBNoClub = hasNoClub(player3Data?.clubId) && hasNoClub(player4Data?.clubId);
    const shouldAutoApprove = teamANoClub || teamBNoClub;

    const updateData = {
        [`confirmations.${playerId}`]: true,
        confirmedBy: playerId,
        confirmedAt: serverTimestamp(),
    };

    if (shouldAutoApprove) {
        // Auto-approve if at least one team has no club
        updateData.status = 'approved';
        updateData.approvedBy = 'auto_approved';
        updateData.approvedAt = serverTimestamp();
        updateData.approvalReason = teamANoClub && teamBNoClub
            ? 'Both teams have no club'
            : 'One team has no club';
    } else {
        // Move to coach approval
        updateData.status = 'pending_coach';
    }

    await updateDoc(requestRef, updateData);

    console.log('Doubles match request confirmed by opponent:', playerId, 'Auto-approved:', shouldAutoApprove);
    return { success: true, autoApproved: shouldAutoApprove };
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
        approvedAt: serverTimestamp(),
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
        rejectedAt: serverTimestamp(),
    });

    console.log('Doubles match request rejected by coach');
    return { success: true };
}

// ========================================================================
// ===== DOUBLES LEADERBOARD =====
// ========================================================================

/**
 * Loads doubles pairings leaderboard with real-time updates
 * @param {string} clubId - Club ID (null for global leaderboard)
 * @param {Object} db - Firestore database instance
 * @param {HTMLElement} container - Container element to render leaderboard
 * @param {Array} unsubscribes - Array to store unsubscribe functions for cleanup
 * @param {string} currentUserId - Current user's ID (for privacy filtering)
 * @param {boolean} isGlobal - Whether this is the global leaderboard (default: false)
 */
export function loadDoublesLeaderboard(clubId, db, container, unsubscribes, currentUserId, isGlobal = false) {
    if (!container) return;

    // Build query based on whether it's global or club-specific
    let pairingsQuery;
    if (isGlobal || clubId === null) {
        // Global leaderboard: no clubId filter
        pairingsQuery = query(
            collection(db, 'doublesPairings'),
            orderBy('matchesWon', 'desc')
        );
    } else {
        // Club leaderboard: filter by clubId
        pairingsQuery = query(
            collection(db, 'doublesPairings'),
            where('clubId', '==', clubId),
            orderBy('matchesWon', 'desc')
        );
    }

    const listener = onSnapshot(pairingsQuery, async snapshot => {
        const pairings = [];

        // Load clubs map (needed for test club filtering and global leaderboard)
        let clubsMap = new Map();
        try {
            const clubsSnapshot = await getDocs(collection(db, 'clubs'));
            clubsSnapshot.forEach(doc => {
                clubsMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error('Error loading clubs:', error);
        }

        // Load current user data (for test club filtering)
        let currentUserData = null;
        if (currentUserId) {
            try {
                const currentUserDoc = await getDoc(doc(db, 'users', currentUserId));
                if (currentUserDoc.exists()) {
                    currentUserData = { id: currentUserId, ...currentUserDoc.data() };
                }
            } catch (error) {
                console.error('Error loading current user:', error);
            }
        }

        // Check if current user is from a test club
        const currentUserClub = currentUserData ? clubsMap.get(currentUserData.clubId) : null;
        const isCurrentUserFromTestClub = currentUserClub && currentUserClub.isTestClub;

        // Fetch player data for each pairing
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            // Try to fetch player data for profile pictures and privacy settings
            let player1Data = null;
            let player2Data = null;

            try {
                if (data.player1Id) {
                    const p1Doc = await getDoc(doc(db, 'users', data.player1Id));
                    if (p1Doc.exists()) {
                        player1Data = p1Doc.data();
                    }
                }
            } catch (error) {
                // Silently handle permission errors
                if (error.code !== 'permission-denied') {
                    console.warn('Could not fetch player1 data:', error);
                }
            }

            try {
                if (data.player2Id) {
                    const p2Doc = await getDoc(doc(db, 'users', data.player2Id));
                    if (p2Doc.exists()) {
                        player2Data = p2Doc.data();
                    }
                }
            } catch (error) {
                // Silently handle permission errors
                if (error.code !== 'permission-denied') {
                    console.warn('Could not fetch player2 data:', error);
                }
            }

            // Privacy filtering: Check if either player has disabled leaderboard visibility
            // If current user is one of the players, always show the team
            const isCurrentUserInTeam = (currentUserId && (data.player1Id === currentUserId || data.player2Id === currentUserId));

            if (!isCurrentUserInTeam) {
                // Check privacy settings for both players
                const player1ShowInLeaderboards = player1Data?.privacySettings?.showInLeaderboards !== false;
                const player2ShowInLeaderboards = player2Data?.privacySettings?.showInLeaderboards !== false;

                // If either player has disabled leaderboard visibility, skip this pairing
                if (!player1ShowInLeaderboards || !player2ShowInLeaderboards) {
                    continue;
                }
            }

            // Test club filtering: Hide test club teams from non-test club users
            // If current user is NOT from a test club, filter out test club teams
            if (!isCurrentUserFromTestClub && !isCurrentUserInTeam) {
                // Check if this team's club is a test club
                if (data.clubId) {
                    const teamClub = clubsMap.get(data.clubId);
                    if (teamClub && teamClub.isTestClub) {
                        // Skip this pairing - it's from a test club
                        continue;
                    }
                }
            }

            // Check if players are deleted
            const player1Deleted = player1Data?.deleted || !player1Data?.firstName || !player1Data?.lastName;
            const player2Deleted = player2Data?.deleted || !player2Data?.firstName || !player2Data?.lastName;

            // Get club name if this is a global leaderboard
            let clubName = data.clubId || 'Kein Verein';
            if (isGlobal && data.clubId && clubsMap.has(data.clubId)) {
                clubName = clubsMap.get(data.clubId).name || data.clubId;
            }

            pairings.push({
                id: docSnap.id,
                player1Name: player1Deleted
                    ? (player1Data?.displayName || 'Gelöschter Nutzer')
                    : (data.player1Name || 'Unbekannt'),
                player2Name: player2Deleted
                    ? (player2Data?.displayName || 'Gelöschter Nutzer')
                    : (data.player2Name || 'Unbekannt'),
                player1PhotoURL: player1Data?.photoURL || null,
                player2PhotoURL: player2Data?.photoURL || null,
                player1FirstName: player1Deleted
                    ? (player1Data?.displayName?.substring(0, 2) || 'GN')
                    : (player1Data?.firstName || data.player1Name?.split(' ')[0] || 'U'),
                player1LastName: player1Deleted
                    ? ''
                    : (player1Data?.lastName || data.player1Name?.split(' ')[1] || 'N'),
                player2FirstName: player2Deleted
                    ? (player2Data?.displayName?.substring(0, 2) || 'GN')
                    : (player2Data?.firstName || data.player2Name?.split(' ')[0] || 'U'),
                player2LastName: player2Deleted
                    ? ''
                    : (player2Data?.lastName || data.player2Name?.split(' ')[1] || 'N'),
                clubName: clubName, // Add club name for display
                ...data,
            });
        }

        // Render the leaderboard with updated data
        renderDoublesLeaderboard(pairings, container, isGlobal);
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Renders the doubles leaderboard in the UI
 * @param {Array} pairings - Array of pairing objects
 * @param {HTMLElement} container - Container element
 * @param {boolean} isGlobal - Whether this is the global leaderboard (shows club info)
 */
export function renderDoublesLeaderboard(pairings, container, isGlobal = false) {
    if (!container) return;

    if (pairings.length === 0) {
        container.innerHTML =
            '<p class="text-center text-gray-500 py-8">Noch keine Doppel-Matches gespielt</p>';
        return;
    }

    // Desktop: Table view, Mobile: Card view
    let html = `
        <!-- Desktop Table View (hidden on mobile) -->
        <div class="hidden md:block overflow-x-auto">
            <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Rang</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Team</th>
                        ${isGlobal ? '<th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Verein</th>' : ''}
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
        const winRate =
            pairing.matchesPlayed > 0
                ? ((pairing.matchesWon / pairing.matchesPlayed) * 100).toFixed(1)
                : 0;

        // Generate initials for player 1
        const p1Initials = `${pairing.player1FirstName?.[0] || 'U'}${pairing.player1LastName?.[0] || 'N'}`;
        const p1Avatar =
            pairing.player1PhotoURL ||
            `https://placehold.co/40x40/e2e8f0/64748b?text=${p1Initials}`;

        // Generate initials for player 2
        const p2Initials = `${pairing.player2FirstName?.[0] || 'U'}${pairing.player2LastName?.[0] || 'N'}`;
        const p2Avatar =
            pairing.player2PhotoURL ||
            `https://placehold.co/40x40/e2e8f0/64748b?text=${p2Initials}`;

        // Desktop Table Row
        html += `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-bold text-gray-900">#${rank}</td>
                <td class="px-4 py-3">
                    <div class="flex items-center gap-3">
                        <div class="flex -space-x-2">
                            <img src="${p1Avatar}" alt="${pairing.player1Name}"
                                 class="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
                                 title="${pairing.player1Name}">
                            <img src="${p2Avatar}" alt="${pairing.player2Name}"
                                 class="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
                                 title="${pairing.player2Name}">
                        </div>
                        <div class="flex flex-col">
                            <span class="font-semibold text-indigo-700 text-sm">${pairing.player1Name}</span>
                            <span class="font-semibold text-indigo-700 text-sm">${pairing.player2Name}</span>
                        </div>
                    </div>
                </td>
                ${isGlobal ? `<td class="px-4 py-3 text-sm ${pairing.clubId ? 'text-gray-600' : 'text-amber-600 italic'}">${pairing.clubName || '⚡ Vereins-übergreifend'}</td>` : ''}
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

        <!-- Mobile Card View (shown only on mobile) -->
        <div class="md:hidden space-y-3">
    `;

    // Mobile Cards
    pairings.forEach((pairing, index) => {
        const rank = index + 1;
        const winRate =
            pairing.matchesPlayed > 0
                ? ((pairing.matchesWon / pairing.matchesPlayed) * 100).toFixed(1)
                : 0;

        // Generate initials and avatars
        const p1Initials = `${pairing.player1FirstName?.[0] || 'U'}${pairing.player1LastName?.[0] || 'N'}`;
        const p1Avatar =
            pairing.player1PhotoURL ||
            `https://placehold.co/32x32/e2e8f0/64748b?text=${p1Initials}`;

        const p2Initials = `${pairing.player2FirstName?.[0] || 'U'}${pairing.player2LastName?.[0] || 'N'}`;
        const p2Avatar =
            pairing.player2PhotoURL ||
            `https://placehold.co/32x32/e2e8f0/64748b?text=${p2Initials}`;

        const rankDisplay = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

        html += `
            <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <!-- Rank Badge -->
                <div class="flex items-center justify-between mb-3">
                    <span class="text-lg font-bold text-gray-900">${rankDisplay}</span>
                    <span class="text-sm font-bold text-indigo-600">${Math.round(pairing.currentEloRating)} Elo</span>
                </div>

                <!-- Team Players -->
                <div class="mb-3">
                    <!-- Player 1 -->
                    <div class="flex items-center gap-2 mb-2">
                        <img src="${p1Avatar}" alt="${pairing.player1Name}"
                             class="h-8 w-8 rounded-full object-cover border-2 border-indigo-200 shadow-sm flex-shrink-0">
                        <span class="font-semibold text-indigo-700 text-sm">${pairing.player1Name}</span>
                    </div>
                    <!-- Player 2 -->
                    <div class="flex items-center gap-2">
                        <img src="${p2Avatar}" alt="${pairing.player2Name}"
                             class="h-8 w-8 rounded-full object-cover border-2 border-indigo-200 shadow-sm flex-shrink-0">
                        <span class="font-semibold text-indigo-700 text-sm">${pairing.player2Name}</span>
                    </div>
                </div>

                ${isGlobal ? `
                <!-- Club Info -->
                <div class="mb-3 text-xs ${pairing.clubId ? 'text-gray-500' : 'text-amber-600 font-medium'}">
                    <i class="fas fa-${pairing.clubId ? 'building' : 'bolt'} mr-1"></i>${pairing.clubName || '⚡ Vereins-übergreifend'}
                </div>
                ` : ''}

                <!-- Stats Grid -->
                <div class="grid grid-cols-3 gap-2 text-center pt-3 border-t border-gray-200">
                    <div>
                        <div class="text-xs text-gray-500">Siege</div>
                        <div class="text-sm font-bold text-green-600">${pairing.matchesWon}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500">Niederlagen</div>
                        <div class="text-sm font-bold text-red-600">${pairing.matchesLost}</div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-500">Siegrate</div>
                        <div class="text-sm font-bold text-gray-900">${winRate}%</div>
                    </div>
                </div>
            </div>
        `;
    });

    html += `
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

    const unsubscribe = onSnapshot(requestsQuery, async snapshot => {
        if (snapshot.empty) {
            container.innerHTML =
                '<p class="text-gray-500 text-center py-4">Keine ausstehenden Doppel-Anfragen</p>';
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
                    getDoc(doc(db, 'users', data.teamB.player2Id)),
                ]);

                requests.push({
                    id: docSnap.id,
                    ...data,
                    teamAPlayer1: p1Doc.exists() ? p1Doc.data() : null,
                    teamAPlayer2: p2Doc.exists() ? p2Doc.data() : null,
                    teamBPlayer1: p3Doc.exists() ? p3Doc.data() : null,
                    teamBPlayer2: p4Doc.exists() ? p4Doc.data() : null,
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
                    teamBPlayer2: null,
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
        const winnerTeamName =
            request.winningTeam === 'A'
                ? `${teamAName1} & ${teamAName2}`
                : `${teamBName1} & ${teamBName2}`;

        const createdDate = request.createdAt?.toDate
            ? request.createdAt.toDate().toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
              })
            : 'Unbekannt';

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

    onSnapshot(q, async snapshot => {
        if (snapshot.empty) {
            container.innerHTML =
                '<p class="text-gray-400 text-center py-4 text-sm">Keine Doppel-Anfragen</p>';
            return;
        }

        const requests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            // Check if current user is one of the opponents (teamB)
            if (data.teamB.player1Id === userData.id || data.teamB.player2Id === userData.id) {
                try {
                    // Fetch player names
                    const [teamAPlayer1, teamAPlayer2, teamBPlayer1, teamBPlayer2] =
                        await Promise.all([
                            getDoc(doc(db, 'users', data.teamA.player1Id)),
                            getDoc(doc(db, 'users', data.teamA.player2Id)),
                            getDoc(doc(db, 'users', data.teamB.player1Id)),
                            getDoc(doc(db, 'users', data.teamB.player2Id)),
                        ]);

                    requests.push({
                        id: docSnap.id,
                        ...data,
                        teamAPlayer1: teamAPlayer1.exists() ? teamAPlayer1.data() : null,
                        teamAPlayer2: teamAPlayer2.exists() ? teamAPlayer2.data() : null,
                        teamBPlayer1: teamBPlayer1.exists() ? teamBPlayer1.data() : null,
                        teamBPlayer2: teamBPlayer2.exists() ? teamBPlayer2.data() : null,
                    });
                } catch (error) {
                    console.error(
                        `Error loading players for doubles opponent request ${docSnap.id}:`,
                        error
                    );
                    // Still add request with null player data
                    requests.push({
                        id: docSnap.id,
                        ...data,
                        teamAPlayer1: null,
                        teamAPlayer2: null,
                        teamBPlayer1: null,
                        teamBPlayer2: null,
                    });
                }
            }
        }

        if (requests.length === 0) {
            container.innerHTML =
                '<p class="text-gray-400 text-center py-4 text-sm">Keine Doppel-Anfragen</p>';
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
        const winnerTeamName =
            request.winningTeam === 'A'
                ? `${teamAName1} & ${teamAName2}`
                : `${teamBName1} & ${teamBName2}`;

        const createdDate = request.createdAt?.toDate
            ? request.createdAt.toDate().toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
              })
            : 'Unbekannt';

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
                const result = await confirmDoublesMatchRequest(request.id, userData.id, db);
                if (result.autoApproved) {
                    alert('✅ Doppel-Match bestätigt und automatisch genehmigt! Da alle 4 Spieler keinem Verein angehören, wurde das Match direkt freigegeben.');
                } else {
                    alert('Doppel-Match bestätigt! Wartet nun auf Coach-Genehmigung.');
                }
            } catch (error) {
                console.error('Error confirming doubles request:', error);
                alert('Fehler beim Bestätigen: ' + error.message);
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const reason = prompt('Grund für die Ablehnung (optional):');
            if (reason === null) return; // User cancelled

            try {
                await rejectDoublesMatchRequest(
                    request.id,
                    reason || 'Abgelehnt vom Gegner',
                    db,
                    userData
                );
                alert('Doppel-Match abgelehnt.');
            } catch (error) {
                console.error('Error rejecting doubles request:', error);
                alert('Fehler beim Ablehnen: ' + error.message);
            }
        });

        container.appendChild(card);
    });
}
