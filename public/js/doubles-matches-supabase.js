import { formatDate } from './ui-utils.js';
import { showDoublesHeadToHeadModal } from './doubles-head-to-head-supabase.js';

/**
 * Doubles Matches Module (Supabase Version)
 * Handles doubles match functionality, pairing management, and rankings
 */

// ========================================================================
// ===== NOTIFICATION HELPER =====
// ========================================================================

/**
 * Creates a notification for a user
 * @param {Object} supabase - Supabase client instance
 * @param {string} userId - User ID to notify
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data (optional)
 */
async function createNotification(supabase, userId, type, title, message, data = {}) {
    try {
        const { error } = await supabase
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
            console.error('Error creating notification:', error);
        } else {
            console.log(`[Doubles] Notification sent to ${userId}: ${type}`);
        }
    } catch (error) {
        console.error('Error creating notification:', error);
    }
}

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
    const elo1 = player1.doubles_elo_rating || player1.doublesEloRating || 800;
    const elo2 = player2.doubles_elo_rating || player2.doublesEloRating || 800;
    return Math.round((elo1 + elo2) / 2);
}

// ========================================================================
// ===== COACH: DOUBLES MATCH SAVE =====
// ========================================================================

/**
 * Saves a doubles match result (Coach only)
 * @param {Object} matchData - Match data object
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Current user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function saveDoublesMatch(matchData, supabase, currentUserData) {
    const {
        teamA_player1Id,
        teamA_player2Id,
        teamB_player1Id,
        teamB_player2Id,
        winningTeam, // "A" or "B"
        sets,
        handicapUsed,
        handicap,
        matchMode = 'best-of-5',
    } = matchData;

    // Validate all players are different
    const allPlayerIds = [teamA_player1Id, teamA_player2Id, teamB_player1Id, teamB_player2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

    // Load all 4 players to check their clubIds
    const { data: players, error: playersError } = await supabase
        .from('profiles')
        .select('id, club_id')
        .in('id', allPlayerIds);

    if (playersError) throw playersError;

    const playerMap = new Map();
    (players || []).forEach(p => playerMap.set(p.id, p));

    const player1ClubId = playerMap.get(teamA_player1Id)?.club_id;
    const player2ClubId = playerMap.get(teamA_player2Id)?.club_id;
    const player3ClubId = playerMap.get(teamB_player1Id)?.club_id;
    const player4ClubId = playerMap.get(teamB_player2Id)?.club_id;

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
    // Note: winning_pairing_id, losing_pairing_id, and source columns don't exist in table
    // The trigger will calculate pairing info from team data
    const { data: doublesMatch, error: insertError } = await supabase
        .from('doubles_matches')
        .insert([{
            team_a_player1_id: teamA_player1Id,
            team_a_player2_id: teamA_player2Id,
            team_a_pairing_id: teamAPairingId,
            team_b_player1_id: teamB_player1Id,
            team_b_player2_id: teamB_player2Id,
            team_b_pairing_id: teamBPairingId,
            winning_team: winningTeam,
            sets: sets,
            handicap_used: handicapUsed || false,
            handicap: handicap || null,
            match_mode: matchMode,
            created_by: currentUserData.id,
            club_id: matchClubId,
            is_cross_club: matchClubId === null,
            processed: false,
            sport_id: currentUserData.activeSportId || currentUserData.active_sport_id || null,
        }])
        .select()
        .single();

    if (insertError) throw insertError;

    console.log('Doubles match saved:', doublesMatch.id, 'clubId:', matchClubId, 'isCrossClub:', matchClubId === null);
    return { success: true, matchId: doublesMatch.id, isCrossClub: matchClubId === null };
}

// ========================================================================
// ===== PLAYER: DOUBLES MATCH REQUEST =====
// ========================================================================

/**
 * Creates a doubles match request (Player initiated)
 * @param {Object} requestData - Request data object
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Current user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function createDoublesMatchRequest(requestData, supabase, currentUserData) {
    const {
        partnerId,
        opponent1Id,
        opponent2Id,
        sets,
        handicapUsed,
        handicap,
        matchMode = 'best-of-5',
    } = requestData;

    const initiatorId = currentUserData.id;

    // Validate all players are different
    const allPlayerIds = [initiatorId, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

    // Load all 4 players to check their clubIds
    const { data: players, error: playersError } = await supabase
        .from('profiles')
        .select('id, club_id')
        .in('id', allPlayerIds);

    if (playersError) throw playersError;

    const playerMap = new Map();
    (players || []).forEach(p => playerMap.set(p.id, p));

    const initiatorClubId = playerMap.get(initiatorId)?.club_id;
    const partnerClubId = playerMap.get(partnerId)?.club_id;
    const opponent1ClubId = playerMap.get(opponent1Id)?.club_id;
    const opponent2ClubId = playerMap.get(opponent2Id)?.club_id;

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

    // Check that no team has MORE than setsToWin (match should end when someone wins)
    if (setsWonByInitiatorTeam > setsToWin || setsWonByOpponentTeam > setsToWin) {
        throw new Error(`Ungültiges Ergebnis: Bei diesem Modus kann kein Team mehr als ${setsToWin} Sätze gewinnen.`);
    }

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

    // Handle both camelCase and snake_case for user data
    const userFirstName = currentUserData.firstName || currentUserData.first_name || '';
    const userLastName = currentUserData.lastName || currentUserData.last_name || '';
    const defaultUserName = `${userFirstName} ${userLastName}`.trim() || 'Unbekannt';

    // Build the request document data using JSONB structure for teams
    const doublesRequestData = {
        team_a: {
            player1_id: initiatorId,
            player2_id: partnerId,
            player1_name: playerNames.player1 || defaultUserName,
            player2_name: playerNames.player2 || 'Unbekannt',
            pairing_id: initiatorPairingId,
        },
        team_b: {
            player1_id: opponent1Id,
            player2_id: opponent2Id,
            player1_name: playerNames.opponent1 || 'Unbekannt',
            player2_name: playerNames.opponent2 || 'Unbekannt',
            pairing_id: opponentPairingId,
        },
        winning_team: winningTeam,
        sets: sets,
        handicap_used: handicapUsed || false,
        handicap: handicap || null,
        match_mode: matchMode,
        initiated_by: initiatorId,
        approvals: {
            [partnerId]: false,
            [opponent1Id]: false,
            [opponent2Id]: false,
        },
        status: 'pending_opponent',
        club_id: matchClubId,
        is_cross_club: matchClubId === null,
        sport_id: currentUserData.activeSportId || currentUserData.active_sport_id || null,
    };

    console.log('Creating doubles match request:', {
        initiator: initiatorId,
        partner: partnerId,
        opponents: [opponent1Id, opponent2Id],
        winningTeam,
        status: 'pending_opponent',
        clubId: matchClubId,
        isCrossClub: matchClubId === null,
        fullData: doublesRequestData,
    });

    const { data: request, error: insertError } = await supabase
        .from('doubles_match_requests')
        .insert([doublesRequestData])
        .select()
        .single();

    if (insertError) throw insertError;

    console.log('Doubles match request created successfully! ID:', request.id);

    // Build notification with match details
    const initiatorName = playerNames.player1 || 'Ein Spieler';
    const teamANames = `${playerNames.player1 || '?'} & ${playerNames.player2 || '?'}`;
    const teamBNames = `${playerNames.opponent1 || '?'} & ${playerNames.opponent2 || '?'}`;

    // Build set score string
    const setsString = sets.map(s => {
        const scoreA = s.teamA ?? s.playerA ?? 0;
        const scoreB = s.teamB ?? s.playerB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ');

    // Count set wins
    let teamAWins = 0, teamBWins = 0;
    sets.forEach(s => {
        const scoreA = s.teamA ?? s.playerA ?? 0;
        const scoreB = s.teamB ?? s.playerB ?? 0;
        if (scoreA > scoreB) teamAWins++;
        else if (scoreB > scoreA) teamBWins++;
    });
    const setScore = `${teamAWins}:${teamBWins}`;

    // Build notification message with winner info
    const winnerNames = winningTeam === 'A' ? teamANames : teamBNames;
    let notificationMessage = `${initiatorName} trägt ein: ${winnerNames} hat ${setScore} gewonnen (${setsString})`;
    if (handicapUsed) {
        notificationMessage += ' [Handicap]';
    }

    const notificationData = {
        request_id: request.id,
        initiator_id: initiatorId,
        winning_team: winningTeam,
        sets: JSON.stringify(sets),
        set_score: setScore,
        handicap_used: handicapUsed ? 'true' : 'false'
    };

    // Notify partner
    await createNotification(
        supabase,
        partnerId,
        'doubles_match_request',
        'Neue Doppel-Spielanfrage',
        notificationMessage,
        notificationData
    );

    // Notify opponent 1
    await createNotification(
        supabase,
        opponent1Id,
        'doubles_match_request',
        'Neue Doppel-Spielanfrage',
        notificationMessage,
        notificationData
    );

    // Notify opponent 2
    await createNotification(
        supabase,
        opponent2Id,
        'doubles_match_request',
        'Neue Doppel-Spielanfrage',
        notificationMessage,
        notificationData
    );

    return { success: true, requestId: request.id };
}

/**
 * Confirms a doubles match request (Opponent acceptance)
 * @param {string} requestId - Request document ID
 * @param {string} playerId - Player ID who is confirming
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Result object with success status
 */
export async function confirmDoublesMatchRequest(requestId, playerId, supabase) {
    const { data: request, error: fetchError } = await supabase
        .from('doubles_match_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (fetchError) throw fetchError;
    if (!request) throw new Error('Anfrage nicht gefunden');

    // Check if player is one of the opponents (using JSONB structure)
    const teamB = request.team_b || {};
    const isOpponent = teamB.player1_id === playerId || teamB.player2_id === playerId;
    if (!isOpponent) {
        throw new Error('Du bist kein Gegner in diesem Match');
    }

    // Auto-approve when opponent confirms (no coach approval needed)
    const updatedApprovals = { ...request.approvals, [playerId]: true };

    const updateData = {
        approvals: updatedApprovals,
        status: 'approved',
    };

    const { error: updateError } = await supabase
        .from('doubles_match_requests')
        .update(updateData)
        .eq('id', requestId);

    if (updateError) throw updateError;

    console.log('Doubles match request confirmed and auto-approved by opponent:', playerId);

    // Dispatch event to notify other components (dashboard, etc.) to refresh
    window.dispatchEvent(new CustomEvent('matchRequestUpdated', {
        detail: { type: 'doubles', action: 'approved', requestId }
    }));

    // Notify all 4 players that the match is approved (using JSONB structure)
    const teamA = request.team_a || {};
    const allPlayerIds = [
        teamA.player1_id,
        teamA.player2_id,
        teamB.player1_id,
        teamB.player2_id
    ].filter(id => id); // Filter out undefined

    const teamANames = `${teamA.player1_name || 'Spieler'} & ${teamA.player2_name || 'Spieler'}`;
    const teamBNames = `${teamB.player1_name || 'Spieler'} & ${teamB.player2_name || 'Spieler'}`;
    const approvedMessage = `Das Doppel-Match ${teamANames} vs ${teamBNames} wurde bestätigt!`;

    for (const pId of allPlayerIds) {
        await createNotification(
            supabase,
            pId,
            'doubles_match_approved',
            'Doppel-Match bestätigt',
            approvedMessage,
            { request_id: requestId }
        );
    }

    return { success: true, autoApproved: true };
}

/**
 * Approves a doubles match request (Coach only)
 * @param {string} requestId - Request document ID
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Coach user data
 * @returns {Promise<Object>} Result object with success status
 */
export async function approveDoublesMatchRequest(requestId, supabase, currentUserData) {
    const { error } = await supabase
        .from('doubles_match_requests')
        .update({
            status: 'approved',
            approved_by: currentUserData.id,
            approved_at: new Date().toISOString(),
        })
        .eq('id', requestId);

    if (error) throw error;

    console.log('Doubles match request approved by coach');
    return { success: true };
}

/**
 * Rejects a doubles match request (by opponent or coach)
 * @param {string} requestId - Request document ID
 * @param {string} reason - Rejection reason
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - User data of person rejecting
 * @returns {Promise<Object>} Result object with success status
 */
export async function rejectDoublesMatchRequest(requestId, reason, supabase, currentUserData) {
    // First fetch the request to get player info for notifications
    const { data: request, error: fetchError } = await supabase
        .from('doubles_match_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (fetchError) throw fetchError;

    const { error } = await supabase
        .from('doubles_match_requests')
        .update({
            status: 'rejected',
            rejected_by: currentUserData.id,
            rejection_reason: reason || 'Keine Angabe',
            rejected_at: new Date().toISOString(),
        })
        .eq('id', requestId);

    if (error) throw error;

    console.log('Doubles match request rejected');

    // Notify the initiator that the match was rejected
    if (request && request.initiated_by) {
        const rejecterName = `${currentUserData.firstName || currentUserData.first_name || ''} ${currentUserData.lastName || currentUserData.last_name || ''}`.trim() || 'Ein Spieler';
        await createNotification(
            supabase,
            request.initiated_by,
            'doubles_match_rejected',
            'Doppel-Match abgelehnt',
            `${rejecterName} hat die Doppel-Spielanfrage abgelehnt.`,
            { request_id: requestId, reason: reason || 'Keine Angabe' }
        );
    }

    return { success: true };
}

// ========================================================================
// ===== DOUBLES LEADERBOARD =====
// ========================================================================

/**
 * Loads doubles pairings leaderboard with real-time updates
 * @param {string} clubId - Club ID (null for global leaderboard)
 * @param {Object} supabase - Supabase client instance
 * @param {HTMLElement} container - Container element to render leaderboard
 * @param {Array} unsubscribes - Array to store unsubscribe functions for cleanup
 * @param {string} currentUserId - Current user's ID (for privacy filtering)
 * @param {boolean} isGlobal - Whether this is the global leaderboard (default: false)
 * @param {string} sportId - Sport ID to filter by (optional, filters pairings by players' sport)
 */
export function loadDoublesLeaderboard(clubId, supabase, container, unsubscribes, currentUserId, isGlobal = false, sportId = null) {
    if (!container) return;

    async function loadData() {
        try {
            // Load all pairings (we'll filter by player club membership later)
            // Don't filter by club_id here as it may be NULL or incorrect
            let query = supabase
                .from('doubles_pairings')
                .select('*')
                .order('matches_won', { ascending: false });

            const { data: pairingsData, error: pairingsError } = await query;
            if (pairingsError) throw pairingsError;

            // Load clubs map
            const { data: clubsData } = await supabase.from('clubs').select('*');
            const clubsMap = new Map();
            (clubsData || []).forEach(club => clubsMap.set(club.id, club));

            // Load current user data
            let currentUserData = null;
            if (currentUserId) {
                const { data: userData } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', currentUserId)
                    .single();
                currentUserData = userData;
            }

            const currentUserClub = currentUserData ? clubsMap.get(currentUserData.club_id) : null;
            const isCurrentUserFromTestClub = currentUserClub && currentUserClub.is_test_club;
            const isCoachOrAdmin = currentUserData && (currentUserData.role === 'coach' || currentUserData.role === 'head_coach' || currentUserData.role === 'admin');

            const pairings = [];

            for (const data of pairingsData || []) {
                // Try to fetch player data
                let player1Data = null;
                let player2Data = null;

                if (data.player1_id) {
                    const { data: p1 } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', data.player1_id)
                        .single();
                    player1Data = p1;
                }

                if (data.player2_id) {
                    const { data: p2 } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', data.player2_id)
                        .single();
                    player2Data = p2;
                }

                // Sport filtering: The pairing must be for the specified sport
                // Use the pairing's sport_id, not the players' current active_sport_id
                if (sportId) {
                    // Check if the pairing has a sport_id stored
                    if (data.sport_id && data.sport_id !== sportId) {
                        continue; // Skip pairing - it's for a different sport
                    }
                    // Fallback: if no sport_id on pairing, check if both players are currently in the sport
                    if (!data.sport_id) {
                        const player1Sport = player1Data?.active_sport_id;
                        const player2Sport = player2Data?.active_sport_id;
                        if (player1Sport !== sportId || player2Sport !== sportId) {
                            continue;
                        }
                    }
                }

                // Privacy filtering
                const isCurrentUserInTeam = currentUserId && (data.player1_id === currentUserId || data.player2_id === currentUserId);

                if (!isCurrentUserInTeam) {
                    const player1ShowInLeaderboards = player1Data?.privacy_settings?.showInLeaderboards !== false;
                    const player2ShowInLeaderboards = player2Data?.privacy_settings?.showInLeaderboards !== false;

                    if (!player1ShowInLeaderboards || !player2ShowInLeaderboards) {
                        continue;
                    }

                    if (isGlobal) {
                        const player1Searchable = player1Data?.privacy_settings?.searchable || 'global';
                        const player2Searchable = player2Data?.privacy_settings?.searchable || 'global';

                        if (player1Searchable === 'club_only' || player2Searchable === 'club_only') {
                            continue;
                        }
                    }
                }

                // Test club filtering
                if (!isCurrentUserInTeam && data.club_id) {
                    const teamClub = clubsMap.get(data.club_id);
                    if (teamClub && teamClub.is_test_club) {
                        if (!isCurrentUserFromTestClub || (isCoachOrAdmin && data.club_id !== currentUserData.club_id)) {
                            continue;
                        }
                    }
                }

                // Check if players are deleted
                const player1Deleted = player1Data?.deleted || !player1Data?.first_name || !player1Data?.last_name;
                const player2Deleted = player2Data?.deleted || !player2Data?.first_name || !player2Data?.last_name;

                // Determine club display (always calculate, shown only in global but needed for data)
                let clubDisplay = 'Kein Verein';
                let clubType = 'none';

                // Use nullish coalescing (??) to handle both null and undefined
                // Prefer stored club_id_at_match, fallback to player's current club_id
                const p1ClubId = data.player1_club_id_at_match ?? player1Data?.club_id;
                const p2ClubId = data.player2_club_id_at_match ?? player2Data?.club_id;

                if (p1ClubId && p2ClubId && p1ClubId === p2ClubId) {
                    clubType = 'same';
                    clubDisplay = clubsMap.has(p1ClubId) ? clubsMap.get(p1ClubId).name : p1ClubId;
                } else if (!p1ClubId && !p2ClubId) {
                    clubType = 'none';
                    clubDisplay = 'Kein Verein';
                } else {
                    clubType = 'mix';
                    clubDisplay = 'Mix';
                }

                // Filter by club membership for club-specific leaderboards
                // BOTH players must currently be in the specified club
                // This is dynamic - if a player joins the club later, the pairing will appear
                if (!isGlobal && clubId) {
                    const player1InClub = player1Data?.club_id === clubId;
                    const player2InClub = player2Data?.club_id === clubId;
                    if (!player1InClub || !player2InClub) {
                        continue; // Skip this pairing - both players must be in the club
                    }
                }

                // Build names from profile data (not from doubles_pairings table) to ensure photos match names
                const player1FullName = player1Deleted
                    ? (player1Data?.display_name || 'Gelöschter Nutzer')
                    : `${player1Data?.first_name || ''} ${player1Data?.last_name || ''}`.trim() || data.player1_name || 'Unbekannt';
                const player2FullName = player2Deleted
                    ? (player2Data?.display_name || 'Gelöschter Nutzer')
                    : `${player2Data?.first_name || ''} ${player2Data?.last_name || ''}`.trim() || data.player2_name || 'Unbekannt';

                pairings.push({
                    id: data.id,
                    player1Id: data.player1_id,
                    player2Id: data.player2_id,
                    player1Name: player1FullName,
                    player2Name: player2FullName,
                    player1PhotoURL: player1Data?.avatar_url || null,
                    player2PhotoURL: player2Data?.avatar_url || null,
                    player1FirstName: player1Deleted
                        ? (player1Data?.display_name?.substring(0, 2) || 'GN')
                        : (player1Data?.first_name || 'U'),
                    player1LastName: player1Deleted
                        ? ''
                        : (player1Data?.last_name || 'N'),
                    player2FirstName: player2Deleted
                        ? (player2Data?.display_name?.substring(0, 2) || 'GN')
                        : (player2Data?.first_name || 'U'),
                    player2LastName: player2Deleted
                        ? ''
                        : (player2Data?.last_name || 'N'),
                    clubDisplay: clubDisplay,
                    clubType: clubType,
                    matchesWon: data.matches_won || 0,
                    matchesLost: data.matches_lost || 0,
                    matchesPlayed: data.matches_played || 0,
                    currentEloRating: data.current_elo_rating || 800,
                });
            }

            renderDoublesLeaderboard(pairings, container, isGlobal, supabase, currentUserId);
        } catch (error) {
            console.error('Error loading doubles leaderboard:', error);
            container.innerHTML = `<p class="text-center text-red-500 py-8">Fehler beim Laden: ${error.message}</p>`;
        }
    }

    // Initial load
    loadData();

    // Set up real-time subscription
    const channelName = isGlobal ? 'doubles-leaderboard-global' : `doubles-leaderboard-${clubId}`;
    const subscription = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'doubles_pairings'
            },
            () => {
                loadData();
            }
        )
        .subscribe();

    if (unsubscribes) {
        unsubscribes.push(() => subscription.unsubscribe());
    }
}

/**
 * Renders the doubles leaderboard in the UI
 * @param {Array} pairings - Array of pairing objects
 * @param {HTMLElement} container - Container element
 * @param {boolean} isGlobal - Whether this is the global leaderboard (shows club info)
 * @param {Object} supabase - Supabase client instance (optional, for head-to-head modal)
 * @param {string} currentUserId - Current user's ID (optional, for head-to-head modal)
 */
export function renderDoublesLeaderboard(pairings, container, isGlobal = false, supabase = null, currentUserId = null) {
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
                        <th class="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase w-16">Rang</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase ${isGlobal ? 'w-64' : 'w-80'}">Team</th>
                        ${isGlobal ? '<th class="px-3 py-3 text-left text-xs font-medium text-gray-600 uppercase w-40">Verein</th>' : ''}
                        <th class="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase w-20">Siege</th>
                        <th class="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase w-24">Niederl.</th>
                        <th class="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase w-24">Siegrate</th>
                        <th class="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase w-20">Elo</th>
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

        const p1Initials = `${pairing.player1FirstName?.[0] || 'U'}${pairing.player1LastName?.[0] || 'N'}`;
        const p1Avatar =
            pairing.player1PhotoURL ||
            `https://placehold.co/40x40/e2e8f0/64748b?text=${p1Initials}`;

        const p2Initials = `${pairing.player2FirstName?.[0] || 'U'}${pairing.player2LastName?.[0] || 'N'}`;
        const p2Avatar =
            pairing.player2PhotoURL ||
            `https://placehold.co/40x40/e2e8f0/64748b?text=${p2Initials}`;

        // Check if this team is clickable (not current user's own team)
        const isClickable = supabase && currentUserId &&
            pairing.player1Id !== currentUserId && pairing.player2Id !== currentUserId;
        const teamData = isClickable ? JSON.stringify({
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            player1Name: pairing.player1Name,
            player2Name: pairing.player2Name
        }) : null;

        html += `
            <tr class="hover:bg-gray-50 ${isClickable ? 'cursor-pointer' : ''}"
                ${isClickable ? `data-doubles-team='${teamData}'` : ''}>
                <td class="px-2 py-3 text-sm font-bold text-gray-900 w-16">#${rank}</td>
                <td class="px-4 py-3 ${isGlobal ? 'w-64' : 'w-80'}">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                            <img src="${p1Avatar}" alt="${pairing.player1Name}"
                                 class="h-8 w-8 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0"
                                 title="${pairing.player1Name}">
                            <span class="font-semibold text-indigo-700 text-sm">${pairing.player1Name}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <img src="${p2Avatar}" alt="${pairing.player2Name}"
                                 class="h-8 w-8 rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0"
                                 title="${pairing.player2Name}">
                            <span class="font-semibold text-indigo-700 text-sm">${pairing.player2Name}</span>
                        </div>
                    </div>
                </td>
                ${isGlobal ? `<td class="px-3 py-3 text-sm w-40 ${
                    pairing.clubType === 'same' ? 'text-gray-600' :
                    pairing.clubType === 'none' ? 'text-amber-600 italic' :
                    'text-blue-600 font-medium'
                }">${pairing.clubDisplay}</td>` : ''}
                <td class="px-3 py-3 text-sm text-center text-green-600 font-medium w-20">${pairing.matchesWon}</td>
                <td class="px-3 py-3 text-sm text-center text-red-600 w-24">${pairing.matchesLost}</td>
                <td class="px-3 py-3 text-sm text-center font-medium w-24">${winRate}%</td>
                <td class="px-3 py-3 text-sm text-center font-bold w-20">${Math.round(pairing.currentEloRating)}</td>
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

        const p1Initials = `${pairing.player1FirstName?.[0] || 'U'}${pairing.player1LastName?.[0] || 'N'}`;
        const p1Avatar =
            pairing.player1PhotoURL ||
            `https://placehold.co/32x32/e2e8f0/64748b?text=${p1Initials}`;

        const p2Initials = `${pairing.player2FirstName?.[0] || 'U'}${pairing.player2LastName?.[0] || 'N'}`;
        const p2Avatar =
            pairing.player2PhotoURL ||
            `https://placehold.co/32x32/e2e8f0/64748b?text=${p2Initials}`;

        const rankDisplay = rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : `#${rank}`;

        // Check if this team is clickable for mobile (not current user's own team)
        const isMobileClickable = supabase && currentUserId &&
            pairing.player1Id !== currentUserId && pairing.player2Id !== currentUserId;
        const mobileTeamData = isMobileClickable ? JSON.stringify({
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            player1Name: pairing.player1Name,
            player2Name: pairing.player2Name
        }) : null;

        html += `
            <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm ${isMobileClickable ? 'cursor-pointer' : ''}"
                ${isMobileClickable ? `data-doubles-team='${mobileTeamData}'` : ''}>
                <div class="flex items-center justify-between mb-3">
                    <span class="text-lg font-bold text-gray-900">${rankDisplay}</span>
                    <span class="text-sm font-bold text-indigo-600">${Math.round(pairing.currentEloRating)} Elo</span>
                </div>

                <div class="mb-3">
                    <div class="flex items-center gap-2 mb-2">
                        <img src="${p1Avatar}" alt="${pairing.player1Name}"
                             class="h-8 w-8 rounded-full object-cover border-2 border-indigo-200 shadow-sm flex-shrink-0">
                        <span class="font-semibold text-indigo-700 text-sm">${pairing.player1Name}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <img src="${p2Avatar}" alt="${pairing.player2Name}"
                             class="h-8 w-8 rounded-full object-cover border-2 border-indigo-200 shadow-sm flex-shrink-0">
                        <span class="font-semibold text-indigo-700 text-sm">${pairing.player2Name}</span>
                    </div>
                </div>

                ${isGlobal ? `
                <div class="mb-3 text-xs ${
                    pairing.clubType === 'same' ? 'text-gray-500' :
                    pairing.clubType === 'none' ? 'text-amber-600 font-medium' :
                    'text-blue-600 font-semibold'
                }">
                    <i class="fas fa-${
                        pairing.clubType === 'same' ? 'building' :
                        pairing.clubType === 'none' ? 'user-slash' :
                        'users'
                    } mr-1"></i>${pairing.clubDisplay}
                </div>
                ` : ''}

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

    // Add click handlers for head-to-head modal (only if supabase and currentUserId are provided)
    if (supabase && currentUserId) {
        const clickableElements = container.querySelectorAll('[data-doubles-team]');
        clickableElements.forEach(el => {
            el.addEventListener('click', () => {
                const teamData = JSON.parse(el.getAttribute('data-doubles-team'));
                showDoublesHeadToHeadModal(supabase, currentUserId, teamData);
            });
        });
    }
}

// ========================================================================
// ===== LOAD COACH DOUBLES MATCH REQUESTS =====
// ========================================================================

/**
 * Loads pending doubles match requests for coach approval
 * @param {Object} userData - Current user data
 * @param {Object} supabase - Supabase client instance
 * @param {HTMLElement} container - Container element for rendering
 * @returns {Function} Unsubscribe function
 */
export async function loadCoachDoublesMatchRequests(userData, supabase, container) {
    if (!container) return;

    async function loadRequests() {
        try {
            const { data: requestsData, error } = await supabase
                .from('doubles_match_requests')
                .select('*')
                .eq('club_id', userData.clubId)
                .eq('status', 'pending_coach')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!requestsData || requestsData.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-500 text-center py-4">Keine ausstehenden Doppel-Anfragen</p>';
                return;
            }

            const requests = [];
            for (const data of requestsData) {
                // Use JSONB structure for team data
                const teamA = data.team_a || {};
                const teamB = data.team_b || {};

                const playerIds = [
                    teamA.player1_id,
                    teamA.player2_id,
                    teamB.player1_id,
                    teamB.player2_id
                ].filter(id => id);

                const { data: players } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name')
                    .in('id', playerIds);

                const playerMap = new Map();
                (players || []).forEach(p => playerMap.set(p.id, p));

                requests.push({
                    id: data.id,
                    teamA: {
                        player1Id: teamA.player1_id,
                        player2Id: teamA.player2_id,
                    },
                    teamB: {
                        player1Id: teamB.player1_id,
                        player2Id: teamB.player2_id,
                    },
                    winningTeam: data.winning_team,
                    sets: data.sets,
                    createdAt: data.created_at,
                    teamAPlayer1: playerMap.get(teamA.player1_id),
                    teamAPlayer2: playerMap.get(teamA.player2_id),
                    teamBPlayer1: playerMap.get(teamB.player1_id),
                    teamBPlayer2: playerMap.get(teamB.player2_id),
                });
            }

            renderCoachDoublesRequestCards(requests, supabase, userData, container);
        } catch (error) {
            console.error('Error loading coach doubles requests:', error);
            container.innerHTML = `<p class="text-red-500 text-center py-4">Fehler: ${error.message}</p>`;
        }
    }

    loadRequests();

    // Set up real-time subscription
    const subscription = supabase
        .channel('coach-doubles-requests')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'doubles_match_requests',
                filter: `club_id=eq.${userData.clubId}`
            },
            () => {
                loadRequests();
            }
        )
        .subscribe();

    return () => subscription.unsubscribe();
}

/**
 * Renders doubles match request cards for coach
 */
function renderCoachDoublesRequestCards(requests, supabase, userData, container) {
    if (!container) return;

    container.innerHTML = '';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-3';

        const teamAName1 = request.teamAPlayer1?.first_name || 'Unbekannt';
        const teamAName2 = request.teamAPlayer2?.first_name || 'Unbekannt';
        const teamBName1 = request.teamBPlayer1?.first_name || 'Unbekannt';
        const teamBName2 = request.teamBPlayer2?.first_name || 'Unbekannt';

        const setsDisplay = formatDoublesSets(request.sets);
        const winnerTeamName =
            request.winningTeam === 'A'
                ? `${teamAName1} & ${teamAName2}`
                : `${teamBName1} & ${teamBName2}`;

        const createdDate = formatDate(request.createdAt) || 'Unbekannt';

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
                await approveDoublesMatchRequest(request.id, supabase, userData);
                alert('Doppel-Match genehmigt!');
            } catch (error) {
                console.error('Error approving doubles request:', error);
                alert('Fehler beim Genehmigen: ' + error.message);
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const reason = prompt('Grund für die Ablehnung (optional):');
            try {
                await rejectDoublesMatchRequest(request.id, reason, supabase, userData);
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
 * @param {Object} supabase - Supabase client instance
 * @param {HTMLElement} container - Container element to render requests
 */
export function loadPendingDoublesRequestsForOpponent(userData, supabase, container) {
    async function loadRequests() {
        try {
            const { data: requestsData, error } = await supabase
                .from('doubles_match_requests')
                .select('*')
                .eq('club_id', userData.clubId)
                .eq('status', 'pending_opponent')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!requestsData || requestsData.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-400 text-center py-4 text-sm">Keine Doppel-Anfragen</p>';
                return;
            }

            // Filter to only show requests where current user is an opponent (using JSONB structure)
            const relevantRequests = requestsData.filter(req => {
                const teamB = req.team_b || {};
                return teamB.player1_id === userData.id || teamB.player2_id === userData.id;
            });

            if (relevantRequests.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-400 text-center py-4 text-sm">Keine Doppel-Anfragen</p>';
                return;
            }

            const requests = [];
            for (const data of relevantRequests) {
                // Use JSONB structure for team data
                const teamA = data.team_a || {};
                const teamB = data.team_b || {};

                const playerIds = [
                    teamA.player1_id,
                    teamA.player2_id,
                    teamB.player1_id,
                    teamB.player2_id
                ].filter(id => id);

                const { data: players } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name')
                    .in('id', playerIds);

                const playerMap = new Map();
                (players || []).forEach(p => playerMap.set(p.id, p));

                requests.push({
                    id: data.id,
                    teamA: {
                        player1Id: teamA.player1_id,
                        player2Id: teamA.player2_id,
                    },
                    teamB: {
                        player1Id: teamB.player1_id,
                        player2Id: teamB.player2_id,
                    },
                    winningTeam: data.winning_team,
                    sets: data.sets,
                    createdAt: data.created_at,
                    teamAPlayer1: playerMap.get(teamA.player1_id),
                    teamAPlayer2: playerMap.get(teamA.player2_id),
                    teamBPlayer1: playerMap.get(teamB.player1_id),
                    teamBPlayer2: playerMap.get(teamB.player2_id),
                });
            }

            renderPendingDoublesRequestsForOpponent(requests, container, supabase, userData);
        } catch (error) {
            console.error('Error loading opponent doubles requests:', error);
            container.innerHTML = `<p class="text-red-500 text-center py-4 text-sm">Fehler: ${error.message}</p>`;
        }
    }

    loadRequests();

    // Set up real-time subscription
    const subscription = supabase
        .channel('opponent-doubles-requests')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'doubles_match_requests',
                filter: `club_id=eq.${userData.clubId}`
            },
            () => {
                loadRequests();
            }
        )
        .subscribe();

    return () => subscription.unsubscribe();
}

/**
 * Renders pending doubles requests cards for opponent confirmation
 */
function renderPendingDoublesRequestsForOpponent(requests, container, supabase, userData) {
    container.innerHTML = '';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'border border-green-200 bg-green-50 rounded-lg p-4';

        const teamAName1 = request.teamAPlayer1?.first_name || 'Unbekannt';
        const teamAName2 = request.teamAPlayer2?.first_name || 'Unbekannt';
        const teamBName1 = request.teamBPlayer1?.first_name || 'Unbekannt';
        const teamBName2 = request.teamBPlayer2?.first_name || 'Unbekannt';

        const setsDisplay = formatDoublesSets(request.sets);
        const winnerTeamName =
            request.winningTeam === 'A'
                ? `${teamAName1} & ${teamAName2}`
                : `${teamBName1} & ${teamBName2}`;

        const createdDate = formatDate(request.createdAt) || 'Unbekannt';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <div class="text-sm font-semibold text-gray-800 mb-1">Doppel-Match bestätigen</div>
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
                <div class="text-xs text-green-600 mt-1">Gewinner: ${winnerTeamName}</div>
            </div>

            <div class="flex gap-2">
                <button
                    class="confirm-doubles-btn flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded transition"
                    data-request-id="${request.id}"
                >
                    Bestätigen
                </button>
                <button
                    class="reject-doubles-btn flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded transition"
                    data-request-id="${request.id}"
                >
                    Ablehnen
                </button>
            </div>
        `;

        const confirmBtn = card.querySelector('.confirm-doubles-btn');
        const rejectBtn = card.querySelector('.reject-doubles-btn');

        confirmBtn.addEventListener('click', async () => {
            if (!confirm('Möchtest du dieses Doppel-Match bestätigen?')) return;

            try {
                await confirmDoublesMatchRequest(request.id, userData.id, supabase);
                alert('Doppel-Match bestätigt!');
            } catch (error) {
                console.error('Error confirming doubles request:', error);
                alert('Fehler beim Bestätigen: ' + error.message);
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const reason = prompt('Grund für die Ablehnung (optional):');
            if (reason === null) return;

            try {
                await rejectDoublesMatchRequest(
                    request.id,
                    reason || 'Abgelehnt vom Gegner',
                    supabase,
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
