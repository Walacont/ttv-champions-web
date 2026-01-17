import { formatDate } from './ui-utils-supabase.js';
import { showDoublesHeadToHeadModal } from './doubles-head-to-head-supabase.js';

/**
 * Doppel-Matches Modul
 * Verwaltet Doppel-Matches, Paarungen und Rankings
 */

// ========================================================================
// BENACHRICHTIGUNGEN
// ========================================================================

/**
 * Erstellt eine Benachrichtigung für einen Benutzer
 * @param {Object} supabase - Supabase Client
 * @param {string} userId - Benutzer-ID
 * @param {string} type - Benachrichtigungstyp
 * @param {string} title - Titel
 * @param {string} message - Nachricht
 * @param {Object} data - Zusätzliche Daten (optional)
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
// HILFSFUNKTIONEN
// ========================================================================

/**
 * @param {string|null|undefined} clubId
 * @returns {boolean} True wenn Spieler keinen Verein hat
 */
function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

/**
 * Erstellt sortierte Paarungs-ID aus zwei Spieler-IDs
 * Stellt sicher, dass Reihenfolge keine Rolle spielt (A+B = B+A)
 * @param {string} player1Id
 * @param {string} player2Id
 * @returns {string} Sortierte Paarungs-ID
 */
export function createPairingId(player1Id, player2Id) {
    const ids = [player1Id, player2Id].sort();
    return `${ids[0]}_${ids[1]}`;
}

/**
 * Berechnet Team-Elo als Durchschnitt beider Spieler
 * @param {Object} player1
 * @param {Object} player2
 * @returns {number} Team Elo
 */
export function calculateTeamElo(player1, player2) {
    const elo1 = player1.doubles_elo_rating || player1.doublesEloRating || 800;
    const elo2 = player2.doubles_elo_rating || player2.doublesEloRating || 800;
    return Math.round((elo1 + elo2) / 2);
}

// ========================================================================
// TRAINER: DOPPEL-MATCH SPEICHERN
// ========================================================================

/**
 * Speichert ein Doppel-Match (nur Trainer)
 * @param {Object} matchData
 * @param {Object} supabase
 * @param {Object} currentUserData
 * @returns {Promise<Object>}
 */
export async function saveDoublesMatch(matchData, supabase, currentUserData) {
    const {
        teamA_player1Id,
        teamA_player2Id,
        teamB_player1Id,
        teamB_player2Id,
        winningTeam,
        sets,
        handicapUsed,
        handicap,
        matchMode = 'best-of-5',
    } = matchData;

    const allPlayerIds = [teamA_player1Id, teamA_player2Id, teamB_player1Id, teamB_player2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

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

    // clubId nur setzen wenn ALLE 4 Spieler im selben Verein sind
    let matchClubId = null;
    if (
        player1ClubId &&
        player1ClubId === player2ClubId &&
        player1ClubId === player3ClubId &&
        player1ClubId === player4ClubId
    ) {
        matchClubId = player1ClubId;
    }

    const teamAPairingId = createPairingId(teamA_player1Id, teamA_player2Id);
    const teamBPairingId = createPairingId(teamB_player1Id, teamB_player2Id);

    // Hinweis: Der Trigger berechnet Paarungs-Infos aus den Team-Daten
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

    // Punktehistorie für alle 4 Spieler erstellen
    try {
        const { data: playersData } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', allPlayerIds);

        const playerNameMap = {};
        (playersData || []).forEach(p => {
            playerNameMap[p.id] = `${p.first_name} ${p.last_name}`;
        });

        const winningTeamIds = winningTeam === 'A'
            ? [teamA_player1Id, teamA_player2Id]
            : [teamB_player1Id, teamB_player2Id];
        const losingTeamIds = winningTeam === 'A'
            ? [teamB_player1Id, teamB_player2Id]
            : [teamA_player1Id, teamA_player2Id];

        let teamASetsWon = 0;
        let teamBSetsWon = 0;
        (sets || []).forEach(set => {
            if (set.teamA > set.teamB) teamASetsWon++;
            else if (set.teamB > set.teamA) teamBSetsWon++;
        });
        const setsDisplay = winningTeam === 'A'
            ? `${teamASetsWon}:${teamBSetsWon}`
            : `${teamBSetsWon}:${teamASetsWon}`;

        const winnerPoints = 15;
        const loserPoints = 5;
        const matchType = handicapUsed ? 'Handicap-Doppel' : 'Doppel';
        const playedAt = doublesMatch.created_at || new Date().toISOString();

        for (const winnerId of winningTeamIds) {
            const partnerId = winningTeamIds.find(id => id !== winnerId);
            const partnerName = playerNameMap[partnerId] || 'Partner';
            const opponentNames = losingTeamIds.map(id => playerNameMap[id] || 'Gegner').join(' & ');

            const { error } = await supabase
                .from('points_history')
                .insert({
                    user_id: winnerId,
                    points: winnerPoints,
                    xp: winnerPoints,
                    elo_change: 0,
                    reason: `Sieg im ${matchType} mit ${partnerName} gegen ${opponentNames} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (error) {
                console.warn('[DoublesMatches] Error creating winner points history:', error);
            } else {
                await supabase.rpc('add_player_points', {
                    p_user_id: winnerId,
                    p_points: winnerPoints,
                    p_xp: winnerPoints
                });
            }
        }

        for (const loserId of losingTeamIds) {
            const partnerId = losingTeamIds.find(id => id !== loserId);
            const partnerName = playerNameMap[partnerId] || 'Partner';
            const opponentNames = winningTeamIds.map(id => playerNameMap[id] || 'Gegner').join(' & ');

            const { error } = await supabase
                .from('points_history')
                .insert({
                    user_id: loserId,
                    points: loserPoints,
                    xp: loserPoints,
                    elo_change: 0,
                    reason: `Niederlage im ${matchType} mit ${partnerName} gegen ${opponentNames} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (error) {
                console.warn('[DoublesMatches] Error creating loser points history:', error);
            } else {
                await supabase.rpc('add_player_points', {
                    p_user_id: loserId,
                    p_points: loserPoints,
                    p_xp: loserPoints
                });
            }
        }

    } catch (historyError) {
        console.warn('[DoublesMatches] Error creating points history entries:', historyError);
        // Match-Speicherung soll nicht fehlschlagen wenn Punktehistorie-Erstellung fehlschlägt
    }

    return { success: true, matchId: doublesMatch.id, isCrossClub: matchClubId === null };
}

// ========================================================================
// SPIELER: DOPPEL-MATCH ANFRAGE
// ========================================================================

/**
 * Erstellt eine Doppel-Match Anfrage (Spieler-initiiert)
 * @param {Object} requestData
 * @param {Object} supabase
 * @param {Object} currentUserData
 * @returns {Promise<Object>}
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

    const allPlayerIds = [initiatorId, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

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

    // clubId nur setzen wenn ALLE 4 Spieler im selben Verein sind
    let matchClubId = null;
    if (
        initiatorClubId &&
        initiatorClubId === partnerClubId &&
        initiatorClubId === opponent1ClubId &&
        initiatorClubId === opponent2ClubId
    ) {
        matchClubId = initiatorClubId;
    }

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

    const setsWonByInitiatorTeam = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const setsWonByOpponentTeam = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    // Match muss enden sobald jemand gewinnt
    if (setsWonByInitiatorTeam > setsToWin || setsWonByOpponentTeam > setsToWin) {
        throw new Error(`Ungültiges Ergebnis: Bei diesem Modus kann kein Team mehr als ${setsToWin} Sätze gewinnen.`);
    }

    let winningTeam;
    if (setsWonByInitiatorTeam >= setsToWin) {
        winningTeam = 'A';
    } else if (setsWonByOpponentTeam >= setsToWin) {
        winningTeam = 'B';
    } else {
        throw new Error(`Ungültiges Ergebnis: Kein Team hat ${setsToWin} Sätze gewonnen`);
    }

    const initiatorPairingId = createPairingId(initiatorId, partnerId);
    const opponentPairingId = createPairingId(opponent1Id, opponent2Id);

    const playerNames = requestData.playerNames || {};

    const userFirstName = currentUserData.firstName || currentUserData.first_name || '';
    const userLastName = currentUserData.lastName || currentUserData.last_name || '';
    const defaultUserName = `${userFirstName} ${userLastName}`.trim() || 'Unbekannt';

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

    const initiatorName = playerNames.player1 || 'Ein Spieler';
    const teamANames = `${playerNames.player1 || '?'} & ${playerNames.player2 || '?'}`;
    const teamBNames = `${playerNames.opponent1 || '?'} & ${playerNames.opponent2 || '?'}`;

    const setsString = sets.map(s => {
        const scoreA = s.teamA ?? s.playerA ?? 0;
        const scoreB = s.teamB ?? s.playerB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ');

    let teamAWins = 0, teamBWins = 0;
    sets.forEach(s => {
        const scoreA = s.teamA ?? s.playerA ?? 0;
        const scoreB = s.teamB ?? s.playerB ?? 0;
        if (scoreA > scoreB) teamAWins++;
        else if (scoreB > scoreA) teamBWins++;
    });
    const setScore = `${teamAWins}:${teamBWins}`;

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

    await createNotification(
        supabase,
        partnerId,
        'doubles_match_request',
        'Neue Doppel-Spielanfrage',
        notificationMessage,
        notificationData
    );

    await createNotification(
        supabase,
        opponent1Id,
        'doubles_match_request',
        'Neue Doppel-Spielanfrage',
        notificationMessage,
        notificationData
    );

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
 * Bestätigt eine Doppel-Match Anfrage (Gegner-Bestätigung)
 * @param {string} requestId
 * @param {string} playerId
 * @param {Object} supabase
 * @returns {Promise<Object>}
 */
export async function confirmDoublesMatchRequest(requestId, playerId, supabase) {
    const { data: request, error: fetchError } = await supabase
        .from('doubles_match_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (fetchError) throw fetchError;
    if (!request) throw new Error('Anfrage nicht gefunden');

    const teamB = request.team_b || {};
    const isOpponent = teamB.player1_id === playerId || teamB.player2_id === playerId;
    if (!isOpponent) {
        throw new Error('Du bist kein Gegner in diesem Match');
    }

    // Auto-Genehmigung wenn Gegner bestätigt (keine Trainer-Genehmigung nötig)
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

    window.dispatchEvent(new CustomEvent('matchRequestUpdated', {
        detail: { type: 'doubles', action: 'approved', requestId }
    }));

    const teamA = request.team_a || {};
    const allPlayerIds = [
        teamA.player1_id,
        teamA.player2_id,
        teamB.player1_id,
        teamB.player2_id
    ].filter(id => id);

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
 * Genehmigt eine Doppel-Match Anfrage (nur Trainer)
 * @param {string} requestId
 * @param {Object} supabase
 * @param {Object} currentUserData
 * @returns {Promise<Object>}
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
 * Lehnt eine Doppel-Match Anfrage ab (Gegner oder Trainer)
 * @param {string} requestId
 * @param {string} reason
 * @param {Object} supabase
 * @param {Object} currentUserData
 * @returns {Promise<Object>}
 */
export async function rejectDoublesMatchRequest(requestId, reason, supabase, currentUserData) {
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
// DOPPEL BESTENLISTE
// ========================================================================

/**
 * Lädt Doppel-Paarungen Bestenliste mit Echtzeit-Updates
 * @param {string} clubId - Vereins-ID (null für globale Bestenliste)
 * @param {Object} supabase
 * @param {HTMLElement} container
 * @param {Array} unsubscribes
 * @param {string} currentUserId
 * @param {boolean} isGlobal
 * @param {string} sportId
 */
export function loadDoublesLeaderboard(clubId, supabase, container, unsubscribes, currentUserId, isGlobal = false, sportId = null) {
    if (!container) return;

    async function loadData() {
        try {
            // Hier NICHT nach club_id filtern, da diese NULL oder falsch sein kann
            // Filterung erfolgt später nach Spieler-Vereinszugehörigkeit
            let query = supabase
                .from('doubles_pairings')
                .select('*')
                .order('matches_won', { ascending: false });

            const { data: pairingsData, error: pairingsError } = await query;
            if (pairingsError) throw pairingsError;

            const { data: clubsData } = await supabase.from('clubs').select('*');
            const clubsMap = new Map();
            (clubsData || []).forEach(club => clubsMap.set(club.id, club));

            // Alle Spieler-IDs sammeln und in einer Abfrage laden
            const allPlayerIds = new Set();
            if (currentUserId) allPlayerIds.add(currentUserId);
            (pairingsData || []).forEach(data => {
                if (data.player1_id) allPlayerIds.add(data.player1_id);
                if (data.player2_id) allPlayerIds.add(data.player2_id);
            });

            // Alle Profile auf einmal laden
            const profilesMap = new Map();
            if (allPlayerIds.size > 0) {
                const { data: profilesData } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', [...allPlayerIds]);
                (profilesData || []).forEach(p => profilesMap.set(p.id, p));
            }

            const currentUserData = currentUserId ? profilesMap.get(currentUserId) : null;
            const currentUserClub = currentUserData ? clubsMap.get(currentUserData.club_id) : null;
            const isCurrentUserFromTestClub = currentUserClub && currentUserClub.is_test_club;
            const isCoachOrAdmin = currentUserData && (currentUserData.role === 'coach' || currentUserData.role === 'head_coach' || currentUserData.role === 'admin');

            const pairings = [];

            for (const data of pairingsData || []) {
                const player1Data = data.player1_id ? profilesMap.get(data.player1_id) : null;
                const player2Data = data.player2_id ? profilesMap.get(data.player2_id) : null;

                // Sport-Filterung: Paarung muss für die angegebene Sportart sein
                // sport_id der Paarung verwenden, NICHT active_sport_id der Spieler
                if (sportId) {
                    if (data.sport_id && data.sport_id !== sportId) {
                        continue;
                    }
                    // Fallback: Wenn keine sport_id gespeichert, beide Spieler prüfen
                    if (!data.sport_id) {
                        const player1Sport = player1Data?.active_sport_id;
                        const player2Sport = player2Data?.active_sport_id;
                        if (player1Sport !== sportId || player2Sport !== sportId) {
                            continue;
                        }
                    }
                }

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

                if (!isCurrentUserInTeam && data.club_id) {
                    const teamClub = clubsMap.get(data.club_id);
                    if (teamClub && teamClub.is_test_club) {
                        if (!isCurrentUserFromTestClub || (isCoachOrAdmin && data.club_id !== currentUserData.club_id)) {
                            continue;
                        }
                    }
                }

                const player1Deleted = player1Data?.deleted || !player1Data?.first_name || !player1Data?.last_name;
                const player2Deleted = player2Data?.deleted || !player2Data?.first_name || !player2Data?.last_name;

                let clubDisplay = 'Kein Verein';
                let clubType = 'none';

                // Bevorzuge gespeicherte club_id_at_match, Fallback auf aktuelle club_id
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

                // Für Vereins-Bestenlisten: BEIDE Spieler müssen aktuell im Verein sein
                // Dynamisch - wenn Spieler später dem Verein beitritt, erscheint die Paarung
                if (!isGlobal && clubId) {
                    const player1InClub = player1Data?.club_id === clubId;
                    const player2InClub = player2Data?.club_id === clubId;
                    if (!player1InClub || !player2InClub) {
                        continue;
                    }
                }

                // Namen aus Profil-Daten holen (nicht aus doubles_pairings) damit Fotos zu Namen passen
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

    loadData();

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
 * Rendert die Doppel-Bestenliste
 * @param {Array} pairings
 * @param {HTMLElement} container
 * @param {boolean} isGlobal
 * @param {Object} supabase
 * @param {string} currentUserId
 */
export function renderDoublesLeaderboard(pairings, container, isGlobal = false, supabase = null, currentUserId = null) {
    if (!container) return;

    if (pairings.length === 0) {
        container.innerHTML =
            '<p class="text-center text-gray-500 py-8">Noch keine Doppel-Matches gespielt</p>';
        return;
    }

    let html = `
        <!-- Desktop-Tabellenansicht (ausgeblendet auf Mobilgeräten) -->
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

        <!-- Mobile-Kartenansicht (nur auf Mobilgeräten angezeigt) -->
        <div class="md:hidden space-y-3">
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
            `https://placehold.co/32x32/e2e8f0/64748b?text=${p1Initials}`;

        const p2Initials = `${pairing.player2FirstName?.[0] || 'U'}${pairing.player2LastName?.[0] || 'N'}`;
        const p2Avatar =
            pairing.player2PhotoURL ||
            `https://placehold.co/32x32/e2e8f0/64748b?text=${p2Initials}`;

        const rankDisplay = rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : `#${rank}`;

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
// TRAINER: DOPPEL-MATCH ANFRAGEN LADEN
// ========================================================================

/**
 * Lädt ausstehende Doppel-Match Anfragen für Trainer-Genehmigung
 * @param {Object} userData
 * @param {Object} supabase
 * @param {HTMLElement} container
 * @returns {Function} Unsubscribe-Funktion
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
 * Rendert Doppel-Match Anfragekarten für Trainer
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
 * Formatiert Satz-Anzeige für Doppel-Matches
 */
function formatDoublesSets(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');
    const winsA = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const winsB = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    return `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;
}

// ========================================================================
// GEGNER-BESTÄTIGUNG
// ========================================================================

/**
 * Lädt ausstehende Doppel-Match Anfragen wo der aktuelle Benutzer Gegner ist
 * @param {Object} userData
 * @param {Object} supabase
 * @param {HTMLElement} container
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

            // Nur Anfragen anzeigen wo aktueller Benutzer Gegner ist
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
 * Rendert ausstehende Doppel-Anfragen für Gegner-Bestätigung
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
