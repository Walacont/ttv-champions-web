// Doppel-Matches Modul (Firebase-Version)

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
import { formatDate } from './ui-utils.js';
import { showDoublesHeadToHeadModal } from './doubles-head-to-head.js';

function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

/** Erzeugt sortierte Pairing-ID aus zwei Spieler-IDs */
export function createPairingId(player1Id, player2Id) {
    const ids = [player1Id, player2Id].sort();
    return `${ids[0]}_${ids[1]}`;
}

/** Berechnet Team-Elo als Durchschnitt beider Spieler */
export function calculateTeamElo(player1, player2) {
    const elo1 = player1.doublesEloRating || 800;
    const elo2 = player2.doublesEloRating || 800;
    return Math.round((elo1 + elo2) / 2);
}

/** Speichert ein Doppel-Match-Ergebnis (nur Coach) */
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

    const allPlayerIds = [teamA_player1Id, teamA_player2Id, teamB_player1Id, teamB_player2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

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

    // clubId nur setzen wenn alle 4 Spieler vom selben Verein sind
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

    return { success: true, matchId: doublesMatchRef.id, isCrossClub: matchClubId === null };
}

/** Erstellt eine Doppel-Match-Anfrage (vom Spieler initiiert) */
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

    const allPlayerIds = [initiatorId, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        throw new Error('Alle 4 Spieler müssen unterschiedlich sein!');
    }

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
            [partnerId]: false,
            [opponent1Id]: false,
            [opponent2Id]: false,
        },
        status: 'pending_opponent',
        clubId: matchClubId,
        isCrossClub: matchClubId === null,
        createdAt: serverTimestamp(),
    };

    const requestRef = await addDoc(collection(db, 'doublesMatchRequests'), doublesRequestData);
    return { success: true, requestId: requestRef.id };
}

/** Bestätigt eine Doppel-Match-Anfrage (Gegner-Bestätigung) */
export async function confirmDoublesMatchRequest(requestId, playerId, db) {
    const requestRef = doc(db, 'doublesMatchRequests', requestId);
    const requestDoc = await getDoc(requestRef);

    if (!requestDoc.exists()) {
        throw new Error('Anfrage nicht gefunden');
    }

    const requestData = requestDoc.data();

    const isOpponent =
        requestData.teamB.player1Id === playerId || requestData.teamB.player2Id === playerId;
    if (!isOpponent) {
        throw new Error('Du bist kein Gegner in diesem Match');
    }

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

    // Auto-Genehmigung wenn mindestens ein Team keinen Verein hat
    const teamANoClub = hasNoClub(player1Data?.clubId) && hasNoClub(player2Data?.clubId);
    const teamBNoClub = hasNoClub(player3Data?.clubId) && hasNoClub(player4Data?.clubId);
    const shouldAutoApprove = teamANoClub || teamBNoClub;

    const updateData = {
        [`confirmations.${playerId}`]: true,
        confirmedBy: playerId,
        confirmedAt: serverTimestamp(),
    };

    if (shouldAutoApprove) {
        updateData.status = 'approved';
        updateData.approvedBy = 'auto_approved';
        updateData.approvedAt = serverTimestamp();
        updateData.approvalReason = teamANoClub && teamBNoClub
            ? 'Both teams have no club'
            : 'One team has no club';
    } else {
        updateData.status = 'pending_coach';
    }

    await updateDoc(requestRef, updateData);
    return { success: true, autoApproved: shouldAutoApprove };
}

/** Genehmigt eine Doppel-Match-Anfrage (nur Coach) */
export async function approveDoublesMatchRequest(requestId, db, currentUserData) {
    const requestRef = doc(db, 'doublesMatchRequests', requestId);

    await updateDoc(requestRef, {
        status: 'approved',
        approvedBy: currentUserData.id,
        approvedAt: serverTimestamp(),
    });
    return { success: true };
}

/** Lehnt eine Doppel-Match-Anfrage ab (nur Coach) */
export async function rejectDoublesMatchRequest(requestId, reason, db, currentUserData) {
    const requestRef = doc(db, 'doublesMatchRequests', requestId);

    await updateDoc(requestRef, {
        status: 'rejected',
        rejectedBy: currentUserData.id,
        rejectionReason: reason || 'Keine Angabe',
        rejectedAt: serverTimestamp(),
    });
    return { success: true };
}

/** Lädt die Doppel-Rangliste mit Echtzeit-Updates */
export function loadDoublesLeaderboard(clubId, db, container, unsubscribes, currentUserId, isGlobal = false) {
    if (!container) return;

    let pairingsQuery;
    if (isGlobal || clubId === null) {
        pairingsQuery = query(
            collection(db, 'doublesPairings'),
            orderBy('matchesWon', 'desc')
        );
    } else {
        pairingsQuery = query(
            collection(db, 'doublesPairings'),
            where('clubId', '==', clubId),
            orderBy('matchesWon', 'desc')
        );
    }

    const listener = onSnapshot(pairingsQuery, async snapshot => {
        const pairings = [];

        let clubsMap = new Map();
        try {
            const clubsSnapshot = await getDocs(collection(db, 'clubs'));
            clubsSnapshot.forEach(doc => {
                clubsMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
        } catch (error) {
            console.error('Error loading clubs:', error);
        }

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

        const currentUserClub = currentUserData ? clubsMap.get(currentUserData.clubId) : null;
        const isCurrentUserFromTestClub = currentUserClub && currentUserClub.isTestClub;
        const isCoachOrAdmin = currentUserData && (currentUserData.role === 'coach' || currentUserData.role === 'admin');

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
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
                if (error.code !== 'permission-denied') {
                    console.warn('Could not fetch player2 data:', error);
                }
            }

            // Datenschutz-Filterung
            const isCurrentUserInTeam = (currentUserId && (data.player1Id === currentUserId || data.player2Id === currentUserId));

            if (!isCurrentUserInTeam) {
                const player1ShowInLeaderboards = player1Data?.privacySettings?.showInLeaderboards !== false;
                const player2ShowInLeaderboards = player2Data?.privacySettings?.showInLeaderboards !== false;

                if (!player1ShowInLeaderboards || !player2ShowInLeaderboards) {
                    continue;
                }

                if (isGlobal) {
                    const player1Searchable = player1Data?.privacySettings?.searchable || 'global';
                    const player2Searchable = player2Data?.privacySettings?.searchable || 'global';

                    if (player1Searchable === 'club_only' || player2Searchable === 'club_only') {
                        continue;
                    }
                }
            }

            // Test-Club-Filterung
            if (!isCurrentUserInTeam) {
                if (data.clubId) {
                    const teamClub = clubsMap.get(data.clubId);
                    if (teamClub && teamClub.isTestClub) {
                        if (!isCurrentUserFromTestClub || (isCoachOrAdmin && data.clubId !== currentUserData.clubId)) {
                            continue;
                        }
                    }
                }
            }

            const player1Deleted = player1Data?.deleted || !player1Data?.firstName || !player1Data?.lastName;
            const player2Deleted = player2Data?.deleted || !player2Data?.firstName || !player2Data?.lastName;

            let clubDisplay = 'Kein Verein';
            let clubType = 'none';

            if (isGlobal) {
                const p1ClubId = data.player1ClubIdAtMatch !== undefined
                    ? data.player1ClubIdAtMatch
                    : player1Data?.clubId;
                const p2ClubId = data.player2ClubIdAtMatch !== undefined
                    ? data.player2ClubIdAtMatch
                    : player2Data?.clubId;

                if (p1ClubId && p2ClubId && p1ClubId === p2ClubId) {
                    clubType = 'same';
                    clubDisplay = clubsMap.has(p1ClubId)
                        ? clubsMap.get(p1ClubId).name
                        : p1ClubId;
                } else if (!p1ClubId && !p2ClubId) {
                    clubType = 'none';
                    clubDisplay = 'Kein Verein';
                } else {
                    clubType = 'mix';
                    clubDisplay = 'Mix';
                }
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
                clubDisplay: clubDisplay,
                clubType: clubType,
                ...data,
            });
        }

        renderDoublesLeaderboard(pairings, container, isGlobal, db, currentUserId);
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/** Rendert die Doppel-Rangliste */
export function renderDoublesLeaderboard(pairings, container, isGlobal = false, db = null, currentUserId = null) {
    if (!container) return;

    if (pairings.length === 0) {
        container.innerHTML =
            '<p class="text-center text-gray-500 py-8">Noch keine Doppel-Matches gespielt</p>';
        return;
    }

    let html = `
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

        html += `
            <tr class="hover:bg-gray-100 ${db && currentUserId && (pairing.player1Id !== currentUserId && pairing.player2Id !== currentUserId) ? 'cursor-pointer' : ''}"
                ${db && currentUserId && (pairing.player1Id !== currentUserId && pairing.player2Id !== currentUserId) ? `data-doubles-team='${JSON.stringify({player1Id: pairing.player1Id, player2Id: pairing.player2Id, player1Name: pairing.player1Name, player2Name: pairing.player2Name})}'` : ''}>
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

        const rankDisplay = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

        html += `
            <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm ${db && currentUserId && (pairing.player1Id !== currentUserId && pairing.player2Id !== currentUserId) ? 'cursor-pointer hover:bg-gray-50' : ''}"
                 ${db && currentUserId && (pairing.player1Id !== currentUserId && pairing.player2Id !== currentUserId) ? `data-doubles-team='${JSON.stringify({player1Id: pairing.player1Id, player2Id: pairing.player2Id, player1Name: pairing.player1Name, player2Name: pairing.player2Name})}'` : ''}>
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

    if (db && currentUserId) {
        const clickableElements = container.querySelectorAll('[data-doubles-team]');
        clickableElements.forEach(el => {
            el.addEventListener('click', () => {
                const teamData = JSON.parse(el.getAttribute('data-doubles-team'));
                showDoublesHeadToHeadModal(db, currentUserId, teamData);
            });
        });
    }
}

/** Lädt ausstehende Doppel-Match-Anfragen für Coach-Genehmigung */
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
                console.error(`Error loading players for doubles request ${docSnap.id}:`, error);
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

/** Rendert Doppel-Match-Anfragen für Coach */
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

/** Formatiert Sätze für Doppel-Matches */
function formatDoublesSets(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');
    const winsA = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const winsB = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    return `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;
}

/** Lädt ausstehende Doppel-Anfragen wo aktueller Nutzer Gegner ist */
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

            if (data.teamB.player1Id === userData.id || data.teamB.player2Id === userData.id) {
                try {
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

/** Rendert ausstehende Doppel-Anfragen für Gegner-Bestätigung */
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

        const createdDate = formatDate(request.createdAt) || 'Unbekannt';

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

        const confirmBtn = card.querySelector('.confirm-doubles-btn');
        const rejectBtn = card.querySelector('.reject-doubles-btn');

        confirmBtn.addEventListener('click', async () => {
            if (!confirm('Möchtest du dieses Doppel-Match bestätigen?')) return;

            try {
                const result = await confirmDoublesMatchRequest(request.id, userData.id, db);
                if (result.autoApproved) {
                    alert('✅ Doppel-Match bestätigt und automatisch genehmigt! Da mindestens ein Team keinem Verein angehört, wurde das Match direkt freigegeben.');
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
