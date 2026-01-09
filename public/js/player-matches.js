import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    query,
    where,
    onSnapshot,
    getDocs,
    orderBy,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';




export function createSetScoreInput(container, existingSets = [], mode = 'best-of-5') {
    container.innerHTML = '';

    const sets = existingSets.length > 0 ? [...existingSets] : [];

    let minSets, maxSets, setsToWin;
    switch (mode) {
        case 'single-set':
            minSets = 1;
            maxSets = 1;
            setsToWin = 1;
            break;
        case 'best-of-3':
            minSets = 2;
            maxSets = 3;
            setsToWin = 2;
            break;
        case 'best-of-5':
            minSets = 3;
            maxSets = 5;
            setsToWin = 3;
            break;
        case 'best-of-7':
            minSets = 4;
            maxSets = 7;
            setsToWin = 4;
            break;
        default:
            minSets = 3;
            maxSets = 5;
            setsToWin = 3;
    }

    while (sets.length < minSets) {
        sets.push({ playerA: '', playerB: '' });
    }

    function renderSets() {
        container.innerHTML = '';

        sets.forEach((set, index) => {
            const setDiv = document.createElement('div');
            setDiv.className = 'flex items-center gap-3 mb-3';
            setDiv.innerHTML = `
        <label class="text-sm font-medium text-gray-700 w-16">Satz ${index + 1}:</label>
        <input
          type="number"
          min="0"
          max="99"
          class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          data-set="${index}"
          data-player="A"
          placeholder="0"
          value="${set.playerA}"
        />
        <span class="text-gray-500">:</span>
        <input
          type="number"
          min="0"
          max="99"
          class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          data-set="${index}"
          data-player="B"
          placeholder="0"
          value="${set.playerB}"
        />
      `;
            container.appendChild(setDiv);
        });

        const inputs = container.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', handleSetInput);
        });
    }

    function isValidSet(scoreA, scoreB) {
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;

        if (a < 11 && b < 11) return false;

        if (a === b) return false;

        if (a >= 10 && b >= 10) {
            return Math.abs(a - b) === 2;
        }

        return (a >= 11 && a > b) || (b >= 11 && b > a);
    }

    function getSetWinner(scoreA, scoreB) {
        if (!isValidSet(scoreA, scoreB)) return null;

        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;

        if (a > b) return 'A';
        if (b > a) return 'B';
        return null;
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        const value = parseInt(e.target.value) || 0;

        sets[setIndex][`player${player}`] = value;

        let playerAWins = 0;
        let playerBWins = 0;

        for (let i = 0; i < sets.length; i++) {
            const setA = parseInt(sets[i].playerA) || 0;
            const setB = parseInt(sets[i].playerB) || 0;

            if (setA > setB && setA >= 11) playerAWins++;
            if (setB > setA && setB >= 11) playerBWins++;
        }

        //
        //
        const totalSetsPlayed = playerAWins + playerBWins;
        const maxWins = Math.max(playerAWins, playerBWins);
        const fieldsNeeded = totalSetsPlayed + (setsToWin - maxWins);

        if (mode === 'single-set') {
            if (sets.length > 1) {
                sets.length = 1;
                renderSets();
            }
            return;
        }

        const matchIsWon = playerAWins >= setsToWin || playerBWins >= setsToWin;

        if (matchIsWon) {
            if (sets.length > totalSetsPlayed) {
                sets.length = Math.max(totalSetsPlayed, minSets);
                renderSets();
            }
        } else {
            if (sets.length < fieldsNeeded && sets.length < maxSets) {
                sets.push({ playerA: '', playerB: '' });
                renderSets();
            } else if (sets.length > fieldsNeeded && sets.length > minSets) {
                const newLength = Math.max(fieldsNeeded, minSets);
                if (sets.length > newLength) {
                    let canTrim = true;
                    for (let i = newLength; i < sets.length; i++) {
                        if (sets[i].playerA !== '' || sets[i].playerB !== '') {
                            canTrim = false;
                            break;
                        }
                    }
                    if (canTrim) {
                        sets.length = newLength;
                        renderSets();
                    }
                }
            }
        }
    }

    function getSets() {
        return sets.filter(set => set.playerA !== '' && set.playerB !== '');
    }

    function validate() {
        const filledSets = getSets();

        if (filledSets.length < minSets) {
            return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
        }

        for (let i = 0; i < filledSets.length; i++) {
            const set = filledSets[i];
            const scoreA = parseInt(set.playerA) || 0;
            const scoreB = parseInt(set.playerB) || 0;

            if (!isValidSet(scoreA, scoreB)) {
                if (scoreA < 11 && scoreB < 11) {
                    return {
                        valid: false,
                        error: `Satz ${i + 1}: Mindestens eine Seite muss 11 Punkte haben.`,
                    };
                }
                if (scoreA === scoreB) {
                    return {
                        valid: false,
                        error: `Satz ${i + 1}: Unentschieden ist nicht erlaubt.`,
                    };
                }
                if (scoreA >= 10 && scoreB >= 10 && Math.abs(scoreA - scoreB) !== 2) {
                    return {
                        valid: false,
                        error: `Satz ${i + 1}: Ab 10:10 muss eine Seite 2 Punkte Vorsprung haben (z.B. 12:10, 14:12).`,
                    };
                }
                return {
                    valid: false,
                    error: `Satz ${i + 1}: Ungültiges Satzergebnis (${scoreA}:${scoreB}).`,
                };
            }
        }

        let playerAWins = 0;
        let playerBWins = 0;

        filledSets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins < setsToWin && playerBWins < setsToWin) {
            const errorMsg =
                mode === 'single-set'
                    ? 'Der Satz muss ausgefüllt sein.'
                    : `Ein Spieler muss ${setsToWin} Sätze gewinnen.`;
            return { valid: false, error: errorMsg };
        }

        if (playerAWins === setsToWin || playerBWins === setsToWin) {
            return {
                valid: true,
                winnerId: playerAWins === setsToWin ? 'A' : 'B',
                playerAWins,
                playerBWins,
            };
        }

        return { valid: false, error: 'Ungültiges Spielergebnis.' };
    }

    function reset() {
        sets.length = 0;
        for (let i = 0; i < minSets; i++) {
            sets.push({ playerA: '', playerB: '' });
        }
        renderSets();
    }

    function setHandicap(player, points) {
        sets.forEach((set, index) => {
            if (player === 'A') {
                const currentValue = parseInt(set.playerA) || 0;
                sets[index].playerA = Math.max(currentValue, points);
            } else if (player === 'B') {
                const currentValue = parseInt(set.playerB) || 0;
                sets[index].playerB = Math.max(currentValue, points);
            }
        });
        renderSets();
    }

    function clearHandicap(player) {
        sets.forEach((set, index) => {
            if (player === 'A') {
                sets[index].playerA = '';
            } else if (player === 'B') {
                sets[index].playerB = '';
            }
        });
        renderSets();
    }

    renderSets();

    return {
        getSets,
        validate,
        refresh: renderSets,
        reset,
        setHandicap,
        clearHandicap,
    };
}


export function loadPlayerMatchRequests(userData, db, unsubscribes) {
    const pendingRequestsList = document.getElementById('pending-result-requests-list');
    const historyRequestsList = document.getElementById('history-result-requests-list');

    if (!pendingRequestsList && !historyRequestsList) {
        return;
    }

    const myRequestsQuery = query(
        collection(db, 'matchRequests'),
        where('playerAId', '==', userData.id),
        orderBy('createdAt', 'desc')
    );

    const incomingRequestsQuery = query(
        collection(db, 'matchRequests'),
        where('playerBId', '==', userData.id),
        where('status', '==', 'pending_player'),
        orderBy('createdAt', 'desc')
    );

    const processedRequestsQuery = query(
        collection(db, 'matchRequests'),
        where('playerBId', '==', userData.id),
        orderBy('createdAt', 'desc')
    );

    const myDoublesRequestsQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('initiatedBy', '==', userData.id),
        orderBy('createdAt', 'desc')
    );

    const doublesInvolvedQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        orderBy('createdAt', 'desc')
    );

    let myRequests = [];
    let incomingRequests = [];
    let processedRequests = [];
    let myDoublesRequests = [];
    let doublesInvolvedRequests = [];
    let renderTimeout = null;

    const debouncedRenderAll = () => {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(async () => {
            const pendingMyRequests = myRequests.filter(
                r => r.status === 'pending_player' || r.status === 'pending_coach'
            );

            const pendingMyDoublesRequests = myDoublesRequests
                .filter(r => r.status === 'pending_opponent' || r.status === 'pending_coach')
                .map(r => ({ ...r, matchType: 'doubles' }));

            const pendingDoublesIncoming = doublesInvolvedRequests
                .filter(r => {
                    const isInTeamB =
                        r.teamB.player1Id === userData.id || r.teamB.player2Id === userData.id;
                    const isInitiator = r.initiatedBy === userData.id;
                    return isInTeamB && r.status === 'pending_opponent' && !isInitiator;
                })
                .map(r => ({ ...r, matchType: 'doubles' }));

            const pendingRequests = [
                ...incomingRequests,
                ...pendingMyRequests,
                ...pendingMyDoublesRequests,
                ...pendingDoublesIncoming,
            ].sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            });

            const completedMyRequests = myRequests.filter(
                r => r.status === 'approved' || r.status === 'rejected'
            );
            const completedProcessedRequests = processedRequests.filter(
                r =>
                    r.status === 'approved' ||
                    r.status === 'rejected' ||
                    r.status === 'pending_coach'
            );

            const completedMyDoublesRequests = myDoublesRequests
                .filter(r => r.status === 'approved' || r.status === 'rejected')
                .map(r => ({ ...r, matchType: 'doubles' }));

            const completedDoublesInvolved = doublesInvolvedRequests
                .filter(r => {
                    const isInTeamA =
                        r.teamA.player1Id === userData.id || r.teamA.player2Id === userData.id;
                    const isInTeamB =
                        r.teamB.player1Id === userData.id || r.teamB.player2Id === userData.id;
                    const isInvolved = isInTeamA || isInTeamB;
                    const isInitiator = r.initiatedBy === userData.id;
                    return (
                        isInvolved &&
                        !isInitiator &&
                        (r.status === 'approved' ||
                            r.status === 'rejected' ||
                            r.status === 'pending_coach')
                    );
                })
                .map(r => ({ ...r, matchType: 'doubles' }));

            const historyRequests = [
                ...completedMyRequests,
                ...completedProcessedRequests,
                ...completedMyDoublesRequests,
                ...completedDoublesInvolved,
            ].sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            });

            await renderPendingRequests(pendingRequests, userData, db);
            await renderHistoryRequests(historyRequests, userData, db);

            const actionRequiredCount = incomingRequests.length + pendingDoublesIncoming.length;
            updateMatchRequestBadge(actionRequiredCount);
        }, 100);
    };

    const myRequestsUnsubscribe = onSnapshot(myRequestsQuery, async snapshot => {
        myRequests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            myRequests.push({ id: docSnap.id, ...data });
        }
        debouncedRenderAll();
    });

    const incomingRequestsUnsubscribe = onSnapshot(incomingRequestsQuery, async snapshot => {
        incomingRequests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            incomingRequests.push({ id: docSnap.id, ...data });
        }
        debouncedRenderAll();
    });

    const processedRequestsUnsubscribe = onSnapshot(processedRequestsQuery, async snapshot => {
        processedRequests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (data.status !== 'pending_player') {
                processedRequests.push({ id: docSnap.id, ...data });
            }
        }
        debouncedRenderAll();
    });

    const myDoublesUnsubscribe = onSnapshot(myDoublesRequestsQuery, async snapshot => {
        myDoublesRequests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            myDoublesRequests.push({ id: docSnap.id, ...data });
        }
        debouncedRenderAll();
    });

    const doublesInvolvedUnsubscribe = onSnapshot(doublesInvolvedQuery, async snapshot => {
        doublesInvolvedRequests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            doublesInvolvedRequests.push({ id: docSnap.id, ...data });
        }
        debouncedRenderAll();
    });

    unsubscribes.push(
        myRequestsUnsubscribe,
        incomingRequestsUnsubscribe,
        processedRequestsUnsubscribe,
        myDoublesUnsubscribe,
        doublesInvolvedUnsubscribe
    );
}


let showAllMyRequests = false;

async function renderMyRequests(requests, userData, db) {
    const container = document.getElementById('my-result-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 text-center py-4 text-sm">Keine Ergebnis-Anfragen</p>';
        showAllMyRequests = false;
        return;
    }

    container.innerHTML = '';

    const maxInitial = 3;
    const requestsToShow = showAllMyRequests ? requests : requests.slice(0, maxInitial);

    for (const request of requestsToShow) {
        const playerBData = {
            id: request.playerBId,
            firstName: request.playerBName ? request.playerBName.split(' ')[0] : 'Unbekannt',
            lastName: request.playerBName ? request.playerBName.split(' ').slice(1).join(' ') : '',
        };
        const card = createMyRequestCard(request, playerBData, userData, db);
        container.appendChild(card);
    }

    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllMyRequests
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllMyRequests = !showAllMyRequests;
            renderMyRequests(requests, userData, db);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}


let showAllIncomingRequests = false;

async function renderIncomingRequests(requests, userData, db) {
    const container = document.getElementById('incoming-result-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 text-center py-4 text-sm">Keine Ergebnis-Anfragen</p>';
        showAllIncomingRequests = false;
        return;
    }

    container.innerHTML = '';

    const maxInitial = 3;
    const requestsToShow = showAllIncomingRequests ? requests : requests.slice(0, maxInitial);

    for (const request of requestsToShow) {
        const playerAData = {
            id: request.playerAId,
            firstName: request.playerAName ? request.playerAName.split(' ')[0] : 'Unbekannt',
            lastName: request.playerAName ? request.playerAName.split(' ').slice(1).join(' ') : '',
        };
        const card = createIncomingRequestCard(request, playerAData, userData, db);
        container.appendChild(card);
    }

    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllIncomingRequests
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllIncomingRequests = !showAllIncomingRequests;
            renderIncomingRequests(requests, userData, db);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}


let showAllProcessedRequests = false;

async function renderProcessedRequests(requests, userData, db) {
    const container = document.getElementById('processed-result-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 text-center py-4 text-sm">Keine Ergebnis-Anfragen</p>';
        showAllProcessedRequests = false;
        return;
    }

    container.innerHTML = '';

    const maxInitial = 3;
    const requestsToShow = showAllProcessedRequests ? requests : requests.slice(0, maxInitial);

    for (const request of requestsToShow) {
        const playerAData = {
            id: request.playerAId,
            firstName: request.playerAName ? request.playerAName.split(' ')[0] : 'Unbekannt',
            lastName: request.playerAName ? request.playerAName.split(' ').slice(1).join(' ') : '',
        };
        const card = createProcessedRequestCard(request, playerAData, userData, db);
        container.appendChild(card);
    }

    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllProcessedRequests
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllProcessedRequests = !showAllProcessedRequests;
            renderProcessedRequests(requests, userData, db);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}


function createMyRequestCard(request, playerB, userData, db) {
    const div = document.createElement('div');
    div.className = 'bg-white border border-gray-200 rounded-lg p-4 shadow-sm';

    const setsDisplay = formatSetsDisplay(request.sets);
    const winner = getWinner(request.sets, userData, playerB, request.matchMode);
    const statusBadge = getStatusBadge(request.status, request.approvals);
    const timeAgo = formatTimestamp(request.createdAt);

    div.innerHTML = `
    <div class="mb-2">
      <div class="flex justify-between items-center mb-2">
        <p class="font-semibold text-gray-800">
          ${userData.firstName} vs ${playerB?.firstName || 'Unbekannt'}
        </p>
        ${timeAgo ? `<span class="text-xs text-gray-500"><i class="far fa-clock mr-1"></i>${timeAgo}</span>` : ''}
      </div>
      <div class="flex justify-between items-start">
        <div class="flex-1">
          <p class="text-sm text-gray-600">${setsDisplay}</p>
          <p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>
          ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ''}
        </div>
        ${statusBadge}
      </div>
    </div>
    <div class="flex gap-2 mt-3">
      ${
          (request.status === 'pending_player' || request.status === 'pending_coach') &&
          (!request.approvals?.playerB?.status || request.approvals?.playerB?.status === null)
              ? `
        <button class="edit-request-btn flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-edit"></i> Bearbeiten
        </button>
        <button class="delete-request-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-trash"></i> Zurückziehen
        </button>
        `
              : ''
      }
    </div>
  `;

    const editBtn = div.querySelector('.edit-request-btn');
    const deleteBtn = div.querySelector('.delete-request-btn');

    if (editBtn) {
        editBtn.addEventListener('click', () => openEditRequestModal(request, userData, db));
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteMatchRequest(request.id, db));
    }

    return div;
}


function createIncomingRequestCard(request, playerA, userData, db) {
    const div = document.createElement('div');
    div.className = 'bg-white border border-indigo-200 rounded-lg p-4 shadow-md';

    const setsDisplay = formatSetsDisplay(request.sets);
    const winner = getWinner(request.sets, playerA, userData, request.matchMode);
    const timeAgo = formatTimestamp(request.createdAt);

    div.innerHTML = `
    <div class="mb-3">
      <div class="flex justify-between items-start mb-2">
        <p class="font-semibold text-gray-800">
          ${playerA?.firstName || 'Unbekannt'} vs ${userData.firstName}
        </p>
        ${timeAgo ? `<span class="text-xs text-gray-500"><i class="far fa-clock mr-1"></i>${timeAgo}</span>` : ''}
      </div>
      <p class="text-sm text-gray-600">${setsDisplay}</p>
      <p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>
      ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ''}
    </div>
    <div class="flex gap-2">
      <button class="approve-request-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
        <i class="fas fa-check"></i> Akzeptieren
      </button>
      <button class="reject-request-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
        <i class="fas fa-times"></i> Ablehnen
      </button>
    </div>
  `;

    const approveBtn = div.querySelector('.approve-request-btn');
    const rejectBtn = div.querySelector('.reject-request-btn');

    if (approveBtn) {
        approveBtn.addEventListener('click', () => approveMatchRequest(request.id, db, 'playerB'));
    }

    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => rejectMatchRequest(request.id, db, 'playerB'));
    }

    return div;
}


function createProcessedRequestCard(request, playerA, userData, db) {
    const div = document.createElement('div');

    let borderColor = 'border-gray-200';
    if (request.status === 'approved' || request.status === 'pending_coach') {
        borderColor = 'border-green-200 bg-green-50';
    } else if (request.status === 'rejected') {
        borderColor = 'border-red-200 bg-red-50';
    }

    div.className = `bg-white border ${borderColor} rounded-lg p-4 shadow-sm`;

    const setsDisplay = formatSetsDisplay(request.sets);
    const winner = getWinner(request.sets, playerA, userData, request.matchMode);
    const statusBadge = getProcessedStatusBadge(request.status, request.approvals);
    const timeAgo = formatTimestamp(request.createdAt);

    div.innerHTML = `
    <div class="mb-3">
      <div class="flex justify-between items-center mb-2">
        <p class="font-semibold text-gray-800">
          ${playerA?.firstName || 'Unbekannt'} vs ${userData.firstName}
        </p>
        ${timeAgo ? `<span class="text-xs text-gray-500"><i class="far fa-clock mr-1"></i>${timeAgo}</span>` : ''}
      </div>
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <p class="text-sm text-gray-600">${setsDisplay}</p>
          <p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>
          ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ''}
        </div>
        ${statusBadge}
      </div>
      ${getStatusDescription(request.status, request.approvals)}
    </div>
  `;

    return div;
}


function getProcessedStatusBadge(status, approvals) {
    if (status === 'pending_coach') {
        return '<span class="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">⏳ Wartet auf Coach</span>';
    }

    if (status === 'approved') {
        const coachName = approvals?.coach?.coachName || 'Coach';
        return `<span class="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">✓ Genehmigt von ${coachName}</span>`;
    }

    if (status === 'rejected') {
        if (approvals?.playerB?.status === 'rejected') {
            return '<span class="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">✗ Von dir abgelehnt</span>';
        } else {
            const coachName = approvals?.coach?.coachName || 'Coach';
            return `<span class="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">✗ Abgelehnt von ${coachName}</span>`;
        }
    }

    return '';
}


function getStatusDescription(status, approvals) {
    if (status === 'pending_coach') {
        return '<p class="text-xs text-blue-700 mt-2"><i class="fas fa-info-circle mr-1"></i> Du hast diese Anfrage akzeptiert. Wartet jetzt auf Coach-Genehmigung.</p>';
    }

    if (status === 'approved') {
        const coachName = approvals?.coach?.coachName || 'Coach';
        return `<p class="text-xs text-green-700 mt-2"><i class="fas fa-check-circle mr-1"></i> Diese Anfrage wurde von ${coachName} genehmigt und das Match wurde erstellt.</p>`;
    }

    if (status === 'rejected') {
        if (approvals?.playerB?.status === 'rejected') {
            return '<p class="text-xs text-red-700 mt-2"><i class="fas fa-times-circle mr-1"></i> Du hast diese Anfrage abgelehnt.</p>';
        } else {
            const coachName = approvals?.coach?.coachName || 'Coach';
            return `<p class="text-xs text-red-700 mt-2"><i class="fas fa-times-circle mr-1"></i> Diese Anfrage wurde von ${coachName} abgelehnt.</p>`;
        }
    }

    return '';
}


function createDoublesHistoryCard(request, playersData, userData, db) {
    const div = document.createElement('div');

    let borderColor = 'border-gray-200';
    let bgColor = 'bg-white';

    if (request.status === 'pending_coach') {
        borderColor = 'border-blue-200';
        bgColor = 'bg-blue-50';
    } else if (request.status === 'approved') {
        borderColor = 'border-green-200';
        bgColor = 'bg-green-50';
    } else if (request.status === 'rejected') {
        borderColor = 'border-red-200';
        bgColor = 'bg-red-50';
    }

    div.className = `${bgColor} border ${borderColor} rounded-lg p-4 shadow-sm`;

    const teamAPlayer1Name = playersData.teamAPlayer1
        ? `${playersData.teamAPlayer1.firstName}`
        : 'Unbekannt';
    const teamAPlayer2Name = playersData.teamAPlayer2
        ? `${playersData.teamAPlayer2.firstName}`
        : 'Unbekannt';
    const teamBPlayer1Name = playersData.teamBPlayer1
        ? `${playersData.teamBPlayer1.firstName}`
        : 'Unbekannt';
    const teamBPlayer2Name = playersData.teamBPlayer2
        ? `${playersData.teamBPlayer2.firstName}`
        : 'Unbekannt';

    const setsDisplay = formatDoublesSetDisplay(request.sets);

    const winner = getDoublesWinner(
        request.sets,
        teamAPlayer1Name,
        teamAPlayer2Name,
        teamBPlayer1Name,
        teamBPlayer2Name,
        request.matchMode
    );

    const timeAgo = formatTimestamp(request.createdAt);

    const statusBadge = getDoublesStatusBadge(request.status);

    div.innerHTML = `
    <div class="mb-3">
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">🎾 Doppel</span>
          </div>
          <p class="font-semibold text-gray-800">
            ${teamAPlayer1Name} & ${teamAPlayer2Name} <span class="text-gray-500">vs</span> ${teamBPlayer1Name} & ${teamBPlayer2Name}
          </p>
        </div>
        ${timeAgo ? `<span class="text-xs text-gray-500"><i class="far fa-clock mr-1"></i>${timeAgo}</span>` : ''}
      </div>

      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <p class="text-sm text-gray-600">${setsDisplay}</p>
          ${winner ? `<p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>` : ''}
          ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ''}
        </div>
        ${statusBadge}
      </div>

      ${getDoublesStatusDescription(request.status)}
    </div>
  `;

    return div;
}


function createPendingDoublesCard(request, playersData, userData, db) {
    const div = document.createElement('div');

    const isInTeamB =
        request.teamB.player1Id === userData.id || request.teamB.player2Id === userData.id;
    const needsMyResponse =
        isInTeamB && request.status === 'pending_opponent' && request.initiatedBy !== userData.id;

    const isMyRequest = request.initiatedBy === userData.id;

    let borderColor = needsMyResponse ? 'border-indigo-200' : 'border-yellow-200';
    let bgColor = needsMyResponse ? 'bg-white' : 'bg-yellow-50';

    div.className = `${bgColor} border ${borderColor} rounded-lg p-4 shadow-md`;

    const teamAPlayer1Name = playersData.teamAPlayer1
        ? `${playersData.teamAPlayer1.firstName}`
        : 'Unbekannt';
    const teamAPlayer2Name = playersData.teamAPlayer2
        ? `${playersData.teamAPlayer2.firstName}`
        : 'Unbekannt';
    const teamBPlayer1Name = playersData.teamBPlayer1
        ? `${playersData.teamBPlayer1.firstName}`
        : 'Unbekannt';
    const teamBPlayer2Name = playersData.teamBPlayer2
        ? `${playersData.teamBPlayer2.firstName}`
        : 'Unbekannt';

    const setsDisplay = formatDoublesSetDisplay(request.sets);

    const winner = getDoublesWinner(
        request.sets,
        teamAPlayer1Name,
        teamAPlayer2Name,
        teamBPlayer1Name,
        teamBPlayer2Name,
        request.matchMode
    );

    const timeAgo = formatTimestamp(request.createdAt);

    let statusMessage = '';
    if (request.status === 'pending_opponent') {
        if (needsMyResponse) {
            statusMessage =
                '<p class="text-xs text-indigo-700 mt-2"><i class="fas fa-info-circle mr-1"></i> Bitte bestätige oder lehne diese Doppel-Anfrage ab.</p>';
        } else {
            statusMessage =
                '<p class="text-xs text-yellow-700 mt-2"><i class="fas fa-clock mr-1"></i> Wartet auf Bestätigung des Gegner-Teams.</p>';
        }
    } else if (request.status === 'pending_coach') {
        statusMessage =
            '<p class="text-xs text-blue-700 mt-2"><i class="fas fa-hourglass-half mr-1"></i> Wartet auf Coach-Genehmigung.</p>';
    }

    div.innerHTML = `
    <div class="mb-3">
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded font-medium">🎾 Doppel</span>
          </div>
          <p class="font-semibold text-gray-800">
            ${teamAPlayer1Name} & ${teamAPlayer2Name} <span class="text-gray-500">vs</span> ${teamBPlayer1Name} & ${teamBPlayer2Name}
          </p>
        </div>
        ${timeAgo ? `<span class="text-xs text-gray-500"><i class="far fa-clock mr-1"></i>${timeAgo}</span>` : ''}
      </div>

      <p class="text-sm text-gray-600">${setsDisplay}</p>
      ${winner ? `<p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>` : ''}
      ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ''}
      ${statusMessage}
    </div>
    ${
        needsMyResponse
            ? `
      <div class="flex gap-2">
        <button class="approve-doubles-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-check"></i> Akzeptieren
        </button>
        <button class="reject-doubles-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-times"></i> Ablehnen
        </button>
      </div>
    `
            : ''
    }
    ${
        isMyRequest && request.status === 'pending_opponent'
            ? `
      <div class="flex gap-2 mt-3">
        <button class="delete-doubles-request-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-trash"></i> Zurückziehen
        </button>
      </div>
    `
            : ''
    }
  `;

    if (needsMyResponse) {
        const approveBtn = div.querySelector('.approve-doubles-btn');
        const rejectBtn = div.querySelector('.reject-doubles-btn');

        if (approveBtn) {
            approveBtn.addEventListener('click', async () => {
                const { confirmDoublesMatchRequest } = await import('./doubles-matches.js');
                try {
                    await confirmDoublesMatchRequest(request.id, userData.id, db);
                    showFeedback(
                        'Doppel-Match bestätigt! Wartet auf Coach-Genehmigung.',
                        'success'
                    );
                } catch (error) {
                    console.error('Error confirming doubles request:', error);
                    showFeedback(`Fehler: ${error.message}`, 'error');
                }
            });
        }

        if (rejectBtn) {
            rejectBtn.addEventListener('click', async () => {
                const { rejectDoublesMatchRequest } = await import('./doubles-matches.js');
                const reason = prompt('Grund für Ablehnung (optional):');
                if (reason !== null) {
                    try {
                        await rejectDoublesMatchRequest(
                            request.id,
                            reason || 'Kein Grund angegeben',
                            db,
                            userData
                        );
                        showFeedback('Doppel-Match abgelehnt.', 'success');
                    } catch (error) {
                        console.error('Error rejecting doubles request:', error);
                        showFeedback(`Fehler: ${error.message}`, 'error');
                    }
                }
            });
        }
    }

    if (isMyRequest && request.status === 'pending_opponent') {
        const deleteBtn = div.querySelector('.delete-doubles-request-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteDoublesMatchRequest(request.id, db));
        }
    }

    return div;
}


function formatDoublesSetDisplay(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');
    const winsA = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const winsB = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

    return `${winsA}:${winsB} (${setsStr})`;
}


function getDoublesWinner(sets, p1Name, p2Name, p3Name, p4Name, matchMode = 'best-of-5') {
    if (!sets || sets.length === 0) return null;

    const winsA = sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
    const winsB = sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;

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

    if (winsA >= setsToWin) return `${p1Name} & ${p2Name}`;
    if (winsB >= setsToWin) return `${p3Name} & ${p4Name}`;
    return null;
}


function getDoublesStatusBadge(status) {
    if (status === 'pending_opponent') {
        return '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">⏳ Wartet auf Gegner</span>';
    }

    if (status === 'pending_coach') {
        return '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">⏳ Wartet auf Coach</span>';
    }

    if (status === 'approved') {
        return '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">✓ Genehmigt</span>';
    }

    if (status === 'rejected') {
        return '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">✗ Abgelehnt</span>';
    }

    return '';
}


function getDoublesStatusDescription(status) {
    if (status === 'pending_coach') {
        return '<p class="text-xs text-blue-700 mt-2"><i class="fas fa-info-circle mr-1"></i> Wartet auf Coach-Genehmigung.</p>';
    }

    if (status === 'approved') {
        return '<p class="text-xs text-green-700 mt-2"><i class="fas fa-check-circle mr-1"></i> Diese Doppel-Anfrage wurde genehmigt und das Match wurde erstellt.</p>';
    }

    if (status === 'rejected') {
        return '<p class="text-xs text-red-700 mt-2"><i class="fas fa-times-circle mr-1"></i> Diese Doppel-Anfrage wurde abgelehnt.</p>';
    }

    return '';
}


function formatSetsDisplay(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    return `${winsA}:${winsB} (${setsStr})`;
}


function getWinner(sets, playerA, playerB, matchMode = 'best-of-5') {
    if (!sets || sets.length === 0) return 'Unbekannt';

    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

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

    if (winsA >= setsToWin) return playerA?.firstName || 'Spieler A';
    if (winsB >= setsToWin) return playerB?.firstName || 'Spieler B';
    return 'Unbekannt';
}


function getStatusBadge(status, approvals) {
    if (status === 'pending_player') {
        if (approvals?.playerB?.status === 'approved') {
            return '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Wartet auf Coach</span>';
        }
        return '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Wartet auf Gegner</span>';
    }

    if (status === 'pending_coach') {
        return '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Wartet auf Coach</span>';
    }

    if (status === 'approved') {
        return '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">✓ Genehmigt</span>';
    }

    if (status === 'rejected') {
        return '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">✗ Abgelehnt</span>';
    }

    return '';
}


async function approveMatchRequest(requestId, db, role) {
    try {
        const requestRef = doc(db, 'matchRequests', requestId);
        const updateData = {};

        if (role === 'playerB') {
            updateData['approvals.playerB'] = {
                status: 'approved',
                timestamp: serverTimestamp(),
            };
            updateData.status = 'pending_coach';
        } else if (role === 'coach') {
            updateData['approvals.coach'] = {
                status: 'approved',
                timestamp: serverTimestamp(),
            };
            updateData.status = 'approved';
        }

        updateData.updatedAt = serverTimestamp();

        await updateDoc(requestRef, updateData);

        showFeedback('Anfrage akzeptiert!', 'success');
    } catch (error) {
        console.error('Error approving request:', error);
        showFeedback('Fehler beim Akzeptieren der Anfrage.', 'error');
    }
}


async function rejectMatchRequest(requestId, db, role) {
    try {
        const requestRef = doc(db, 'matchRequests', requestId);
        const updateData = {};

        if (role === 'playerB') {
            updateData['approvals.playerB'] = {
                status: 'rejected',
                timestamp: serverTimestamp(),
            };
        } else if (role === 'coach') {
            updateData['approvals.coach'] = {
                status: 'rejected',
                timestamp: serverTimestamp(),
            };
        }

        updateData.status = 'rejected';
        updateData.rejectedBy = role;
        updateData.updatedAt = serverTimestamp();

        await updateDoc(requestRef, updateData);

        showFeedback('Anfrage abgelehnt.', 'success');
    } catch (error) {
        console.error('Error rejecting request:', error);
        showFeedback('Fehler beim Ablehnen der Anfrage.', 'error');
    }
}


async function deleteMatchRequest(requestId, db) {
    if (!confirm('Möchtest du diese Anfrage wirklich löschen?')) return;

    try {
        await deleteDoc(doc(db, 'matchRequests', requestId));
        showFeedback('Anfrage gelöscht.', 'success');
    } catch (error) {
        console.error('Error deleting request:', error);
        showFeedback('Fehler beim Löschen der Anfrage.', 'error');
    }
}


async function deleteDoublesMatchRequest(requestId, db) {
    if (!confirm('Möchtest du diese Doppel-Anfrage wirklich zurückziehen?')) return;

    try {
        await deleteDoc(doc(db, 'doublesMatchRequests', requestId));
        showFeedback('Doppel-Anfrage zurückgezogen.', 'success');
    } catch (error) {
        console.error('Error deleting doubles request:', error);
        showFeedback('Fehler beim Zurückziehen der Doppel-Anfrage.', 'error');
    }
}


function openEditRequestModal(request, userData, db) {
    showFeedback('Bearbeiten-Funktion wird bald verfügbar sein.', 'info');
}


function formatTimestamp(timestamp) {
    if (!timestamp) return '';

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
        if (diffMins < 1) return 'gerade eben';
        return `vor ${diffMins} Min.`;
    }

    if (diffHours < 24) {
        return `vor ${diffHours} Std.`;
    }

    if (diffDays < 7) {
        return `vor ${diffDays} ${diffDays === 1 ? 'Tag' : 'Tagen'}`;
    }

    return new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}


async function getUserData(userId, db) {
    try {
        const userDoc = await getDocs(
            query(collection(db, 'users'), where('__name__', '==', userId))
        );
        if (!userDoc.empty) {
            return { id: userDoc.docs[0].id, ...userDoc.docs[0].data() };
        }
        return null;
    } catch (error) {
        console.error('Error fetching user:', error);
        return null;
    }
}


function updateMatchRequestBadge(count) {
    const badge = document.getElementById('match-request-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}


function showFeedback(message, type = 'success') {
    const feedbackEl = document.getElementById('match-request-feedback');
    if (!feedbackEl) {
        alert(message);
        return;
    }

    feedbackEl.textContent = message;
    feedbackEl.className = `mt-3 p-3 rounded-md text-sm font-medium ${
        type === 'success'
            ? 'bg-green-100 text-green-800'
            : type === 'error'
              ? 'bg-red-100 text-red-800'
              : 'bg-blue-100 text-blue-800'
    }`;

    feedbackEl.classList.remove('hidden');

    setTimeout(() => {
        feedbackEl.classList.add('hidden');
    }, 3000);
}


export function initializeMatchRequestForm(userData, db, clubPlayers) {
    const form = document.getElementById('match-request-form');
    if (!form) return;

    const opponentSelect = document.getElementById('opponent-select');
    const handicapToggle = document.getElementById('match-handicap-toggle');
    const handicapInfo = document.getElementById('match-handicap-info');
    const setScoreContainer = document.getElementById('set-score-container');
    const matchModeSelect = document.getElementById('match-mode-select');
    const setScoreLabel = document.getElementById('set-score-label');

    const playersMap = new Map();
    clubPlayers.forEach(player => {
        playersMap.set(player.id, player);
    });

    const grundlagenCompleted = userData.grundlagenCompleted || 0;
    const isMatchReady = grundlagenCompleted >= 5;

    if (!isMatchReady) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4';
        warningDiv.innerHTML = `
      <div class="flex">
        <div class="flex-shrink-0">
          <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
          </svg>
        </div>
        <div class="ml-3">
          <p class="text-sm text-yellow-700">
            <strong>🔒 Wettkämpfe gesperrt!</strong><br>
            Du musst zuerst <strong>5 Grundlagen-Übungen</strong> absolvieren, um Matches spielen zu können.<br>
            Fortschritt: <strong>${grundlagenCompleted}/5</strong> Grundlagen-Übungen abgeschlossen.
            ${grundlagenCompleted > 0 ? `<br>Noch <strong>${5 - grundlagenCompleted}</strong> Übung${5 - grundlagenCompleted === 1 ? '' : 'en'} bis zur Freischaltung!` : ''}
          </p>
        </div>
      </div>
    `;

        form.insertBefore(warningDiv, form.firstChild);

        form.querySelectorAll('input, select, button[type="submit"]').forEach(el => {
            el.disabled = true;
            el.classList.add('opacity-50', 'cursor-not-allowed');
        });

        return;
    }

    opponentSelect.innerHTML = '<option value="">Gegner wählen...</option>';
    clubPlayers
        .filter(p => {
            const playerGrundlagen = p.grundlagenCompleted || 0;
            return p.id !== userData.id && p.role === 'player' && playerGrundlagen >= 5;
        })
        .forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.firstName} ${player.lastName} (Elo: ${Math.round(player.eloRating || 0)})`;
            option.dataset.elo = player.eloRating || 0;
            opponentSelect.appendChild(option);
        });

    let currentMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';
    let setScoreInput = createSetScoreInput(setScoreContainer, [], currentMode);

    function updateSetScoreLabel(mode) {
        if (!setScoreLabel) return;
        switch (mode) {
            case 'single-set':
                setScoreLabel.textContent = 'Spielergebnis eingeben (1 Satz)';
                break;
            case 'best-of-3':
                setScoreLabel.textContent = 'Spielergebnis eingeben (Best of 3)';
                break;
            case 'best-of-5':
                setScoreLabel.textContent = 'Spielergebnis eingeben (Best of 5)';
                break;
            case 'best-of-7':
                setScoreLabel.textContent = 'Spielergebnis eingeben (Best of 7)';
                break;
            default:
                setScoreLabel.textContent = 'Spielergebnis eingeben (mind. 3 Sätze)';
        }
    }

    updateSetScoreLabel(currentMode);

    if (matchModeSelect) {
        matchModeSelect.addEventListener('change', () => {
            currentMode = matchModeSelect.value;
            setScoreInput = createSetScoreInput(setScoreContainer, [], currentMode);
            updateSetScoreLabel(currentMode);

            window.playerSetScoreInput = setScoreInput;

            if (currentHandicapData && handicapToggle && handicapToggle.checked) {
                setScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
            }
        });
    }

    let currentHandicapData = null;

    opponentSelect.addEventListener('change', () => {
        const selectedOption = opponentSelect.selectedOptions[0];
        if (!selectedOption || !selectedOption.value) {
            handicapInfo.classList.add('hidden');
            currentHandicapData = null;
            return;
        }

        const opponentElo = parseFloat(selectedOption.dataset.elo) || 0;
        const myElo = userData.eloRating || 0;
        const eloDiff = Math.abs(myElo - opponentElo);

        if (eloDiff >= 25) {
            const handicapPoints = Math.min(Math.round(eloDiff / 50), 10);
            const weakerPlayer =
                myElo < opponentElo ? 'Du' : selectedOption.textContent.split(' (')[0];
            const weakerPlayerSide = myElo < opponentElo ? 'A' : 'B';

            currentHandicapData = {
                player: weakerPlayerSide,
                points: handicapPoints,
            };

            document.getElementById('match-handicap-text').textContent =
                `${weakerPlayer} startet mit ${handicapPoints} Punkten Vorsprung pro Satz.`;
            handicapInfo.classList.remove('hidden');

            if (handicapToggle && handicapToggle.checked) {
                setScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
            }
        } else {
            handicapInfo.classList.add('hidden');
            currentHandicapData = null;
        }
    });

    handicapToggle.addEventListener('change', () => {
        if (!currentHandicapData) return;

        if (handicapToggle.checked) {
            setScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
        } else {
            setScoreInput.clearHandicap(currentHandicapData.player);
        }
    });

    window.playerSetScoreInput = setScoreInput;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const matchType = window.getCurrentPlayerMatchType
            ? window.getCurrentPlayerMatchType()
            : 'singles';

        if (matchType === 'doubles') {
            const { handleDoublesPlayerMatchRequest } = await import('./doubles-player-ui.js');
            await handleDoublesPlayerMatchRequest(e, db, userData);
            return;
        }


        const opponentId = opponentSelect.value;
        const handicapUsed = handicapToggle.checked;

        if (!opponentId) {
            showFeedback('Bitte wähle einen Gegner aus.', 'error');
            return;
        }

        const validation = setScoreInput.validate();
        if (!validation.valid) {
            showFeedback(validation.error, 'error');
            return;
        }

        const sets = setScoreInput.getSets();
        const winnerId = validation.winnerId === 'A' ? userData.id : opponentId;
        const loserId = validation.winnerId === 'A' ? opponentId : userData.id;

        const opponentData = playersMap.get(opponentId);

        try {
            await addDoc(collection(db, 'matchRequests'), {
                status: 'pending_player',
                playerAId: userData.id,
                playerBId: opponentId,
                playerAName: `${userData.firstName} ${userData.lastName}`,
                playerBName: opponentData
                    ? `${opponentData.firstName} ${opponentData.lastName}`
                    : 'Unbekannt',
                winnerId,
                loserId,
                handicapUsed,
                matchMode: currentMode || 'best-of-5',
                clubId: userData.clubId,
                sets,
                approvals: {
                    playerB: { status: null, timestamp: null },
                    coach: { status: null, timestamp: null },
                },
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                requestedBy: userData.id,
            });

            showFeedback('Anfrage erfolgreich erstellt! Warte auf Bestätigung.', 'success');
            form.reset();

            if (matchModeSelect) {
                matchModeSelect.value = 'best-of-5';
            }

            currentMode = 'best-of-5';
            setScoreInput = createSetScoreInput(setScoreContainer, [], currentMode);
            updateSetScoreLabel(currentMode);

            window.playerSetScoreInput = setScoreInput;

            handicapInfo.classList.add('hidden');
        } catch (error) {
            console.error('Error creating match request:', error);
            showFeedback('Fehler beim Erstellen der Anfrage.', 'error');
        }
    });
}


let showAllPendingRequests = false;

async function renderPendingRequests(requests, userData, db) {
    const container = document.getElementById('pending-result-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 text-center py-4 text-sm">Keine Ergebnis-Anfragen</p>';
        showAllPendingRequests = false;
        return;
    }

    container.innerHTML = '';

    const maxInitial = 3;
    const requestsToShow = showAllPendingRequests ? requests : requests.slice(0, maxInitial);

    for (const request of requestsToShow) {
        let card;

        if (request.matchType === 'doubles') {
            const playersData = {
                teamAPlayer1: {
                    id: request.teamA.player1Id,
                    firstName: request.teamA.player1Name
                        ? request.teamA.player1Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamA.player1Name
                        ? request.teamA.player1Name.split(' ').slice(1).join(' ')
                        : '',
                },
                teamAPlayer2: {
                    id: request.teamA.player2Id,
                    firstName: request.teamA.player2Name
                        ? request.teamA.player2Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamA.player2Name
                        ? request.teamA.player2Name.split(' ').slice(1).join(' ')
                        : '',
                },
                teamBPlayer1: {
                    id: request.teamB.player1Id,
                    firstName: request.teamB.player1Name
                        ? request.teamB.player1Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamB.player1Name
                        ? request.teamB.player1Name.split(' ').slice(1).join(' ')
                        : '',
                },
                teamBPlayer2: {
                    id: request.teamB.player2Id,
                    firstName: request.teamB.player2Name
                        ? request.teamB.player2Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamB.player2Name
                        ? request.teamB.player2Name.split(' ').slice(1).join(' ')
                        : '',
                },
            };

            card = createPendingDoublesCard(request, playersData, userData, db);
        } else {
            if (request.playerBId === userData.id) {
                const playerAData = {
                    id: request.playerAId,
                    firstName: request.playerAName
                        ? request.playerAName.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.playerAName
                        ? request.playerAName.split(' ').slice(1).join(' ')
                        : '',
                };
                card = createIncomingRequestCard(request, playerAData, userData, db);
            } else {
                const playerBData = {
                    id: request.playerBId,
                    firstName: request.playerBName
                        ? request.playerBName.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.playerBName
                        ? request.playerBName.split(' ').slice(1).join(' ')
                        : '',
                };
                card = createMyRequestCard(request, playerBData, userData, db);
            }
        }

        container.appendChild(card);
    }

    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllPendingRequests
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllPendingRequests = !showAllPendingRequests;
            renderPendingRequests(requests, userData, db);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}


let showAllHistoryRequests = false;

async function renderHistoryRequests(requests, userData, db) {
    const container = document.getElementById('history-result-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-400 text-center py-4 text-sm">Keine Ergebnis-Anfragen</p>';
        showAllHistoryRequests = false;
        return;
    }

    container.innerHTML = '';

    const maxInitial = 3;
    const requestsToShow = showAllHistoryRequests ? requests : requests.slice(0, maxInitial);

    for (const request of requestsToShow) {
        let card;

        if (request.matchType === 'doubles') {
            const playersData = {
                teamAPlayer1: {
                    id: request.teamA.player1Id,
                    firstName: request.teamA.player1Name
                        ? request.teamA.player1Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamA.player1Name
                        ? request.teamA.player1Name.split(' ').slice(1).join(' ')
                        : '',
                },
                teamAPlayer2: {
                    id: request.teamA.player2Id,
                    firstName: request.teamA.player2Name
                        ? request.teamA.player2Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamA.player2Name
                        ? request.teamA.player2Name.split(' ').slice(1).join(' ')
                        : '',
                },
                teamBPlayer1: {
                    id: request.teamB.player1Id,
                    firstName: request.teamB.player1Name
                        ? request.teamB.player1Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamB.player1Name
                        ? request.teamB.player1Name.split(' ').slice(1).join(' ')
                        : '',
                },
                teamBPlayer2: {
                    id: request.teamB.player2Id,
                    firstName: request.teamB.player2Name
                        ? request.teamB.player2Name.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.teamB.player2Name
                        ? request.teamB.player2Name.split(' ').slice(1).join(' ')
                        : '',
                },
            };

            card = createDoublesHistoryCard(request, playersData, userData, db);
        } else {
            if (request.playerAId === userData.id) {
                const playerBData = {
                    id: request.playerBId,
                    firstName: request.playerBName
                        ? request.playerBName.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.playerBName
                        ? request.playerBName.split(' ').slice(1).join(' ')
                        : '',
                };
                card = createMyRequestCard(request, playerBData, userData, db);
            } else {
                const playerAData = {
                    id: request.playerAId,
                    firstName: request.playerAName
                        ? request.playerAName.split(' ')[0]
                        : 'Unbekannt',
                    lastName: request.playerAName
                        ? request.playerAName.split(' ').slice(1).join(' ')
                        : '',
                };
                card = createProcessedRequestCard(request, playerAData, userData, db);
            }
        }
        container.appendChild(card);
    }

    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllHistoryRequests
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllHistoryRequests = !showAllHistoryRequests;
            renderHistoryRequests(requests, userData, db);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}


export async function loadCombinedPendingRequests(userData, db) {
    const container = document.getElementById('pending-requests-list');
    if (!container) return;

    const singlesQuery = query(
        collection(db, 'matchRequests'),
        where('playerBId', '==', userData.id),
        where('status', '==', 'pending_player'),
        orderBy('createdAt', 'desc')
    );

    const doublesQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_opponent'),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe1 = onSnapshot(singlesQuery, async singlesSnapshot => {
        const unsubscribe2 = onSnapshot(doublesQuery, async doublesSnapshot => {
            const allRequests = [];

            for (const docSnap of singlesSnapshot.docs) {
                const data = docSnap.data();
                const playerAData = {
                    id: data.playerAId,
                    firstName: data.playerAName ? data.playerAName.split(' ')[0] : 'Unbekannt',
                    lastName: data.playerAName
                        ? data.playerAName.split(' ').slice(1).join(' ')
                        : '',
                };

                allRequests.push({
                    id: docSnap.id,
                    type: 'singles',
                    ...data,
                    playerAData,
                });
            }


            for (const docSnap of doublesSnapshot.docs) {
                const data = docSnap.data();

                allRequests.push({
                    id: docSnap.id,
                    type: 'doubles',
                    ...data,
                    teamAPlayer1: {
                        id: data.teamA.player1Id,
                        firstName: data.teamA.player1Name
                            ? data.teamA.player1Name.split(' ')[0]
                            : 'Unbekannt',
                        lastName: data.teamA.player1Name
                            ? data.teamA.player1Name.split(' ').slice(1).join(' ')
                            : '',
                    },
                    teamAPlayer2: {
                        id: data.teamA.player2Id,
                        firstName: data.teamA.player2Name
                            ? data.teamA.player2Name.split(' ')[0]
                            : 'Unbekannt',
                        lastName: data.teamA.player2Name
                            ? data.teamA.player2Name.split(' ').slice(1).join(' ')
                            : '',
                    },
                    teamBPlayer1: {
                        id: data.teamB.player1Id,
                        firstName: data.teamB.player1Name
                            ? data.teamB.player1Name.split(' ')[0]
                            : 'Unbekannt',
                        lastName: data.teamB.player1Name
                            ? data.teamB.player1Name.split(' ').slice(1).join(' ')
                            : '',
                    },
                    teamBPlayer2: {
                        id: data.teamB.player2Id,
                        firstName: data.teamB.player2Name
                            ? data.teamB.player2Name.split(' ')[0]
                            : 'Unbekannt',
                        lastName: data.teamB.player2Name
                            ? data.teamB.player2Name.split(' ').slice(1).join(' ')
                            : '',
                    },
                });
            }

            allRequests.sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            });

            if (allRequests.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-400 text-center py-4 text-sm">Keine Anfragen</p>';
                return;
            }

            renderCombinedPendingRequests(allRequests, container, db, userData);
        });
    });

    return unsubscribe1;
}


function renderCombinedPendingRequests(requests, container, db, userData) {
    container.innerHTML = '';

    requests.forEach(request => {
        const card = document.createElement('div');
        card.className = 'border border-gray-200 rounded-lg p-4 bg-gray-50';

        const createdDate = request.createdAt?.toDate
            ? request.createdAt.toDate().toLocaleDateString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
              })
            : 'Unbekannt';

        if (request.type === 'doubles') {
            const teamAName1 = request.teamAPlayer1?.firstName || '?';
            const teamAName2 = request.teamAPlayer2?.firstName || '?';
            const teamBName1 = request.teamBPlayer1?.firstName || '?';
            const teamBName2 = request.teamBPlayer2?.firstName || '?';

            const setsStr = request.sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');
            const winsA = request.sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
            const winsB = request.sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;
            const setsDisplay = `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;

            const winnerTeamName =
                request.winningTeam === 'A'
                    ? `${teamAName1} & ${teamAName2}`
                    : `${teamBName1} & ${teamBName2}`;

            card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
          <div>
            <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full"><i class="fas fa-users mr-1"></i>Doppel</span>
            <div class="text-sm font-semibold text-gray-800 mt-2">🎾 Doppel-Match bestätigen</div>
            <div class="text-xs text-gray-500 mt-1">${createdDate}</div>
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
                    const { confirmDoublesMatchRequest } = await import('./doubles-matches.js');
                    await confirmDoublesMatchRequest(request.id, userData.id, db);
                    alert('Doppel-Match bestätigt! Wartet nun auf Coach-Genehmigung.');
                } catch (error) {
                    console.error('Error confirming doubles request:', error);
                    alert('Fehler beim Bestätigen: ' + error.message);
                }
            });

            rejectBtn.addEventListener('click', async () => {
                const reason = prompt('Grund für die Ablehnung (optional):');
                if (reason === null) return;
                try {
                    const { rejectDoublesMatchRequest } = await import('./doubles-matches.js');
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
        } else {
            const playerAName = request.playerAData?.firstName || 'Unbekannt';
            const setsDisplay = formatSets(request.sets);

            card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
          <div>
            <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full"><i class="fas fa-user mr-1"></i>Einzel</span>
            <div class="text-sm font-semibold text-gray-800 mt-2">${playerAName} möchte ein Match mit dir bestätigen</div>
            <div class="text-xs text-gray-500 mt-1">${createdDate}</div>
          </div>
          <span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full font-semibold">
            Wartet
          </span>
        </div>

        <div class="bg-white rounded p-2 mb-3">
          <div class="text-xs text-gray-600 mb-1">Ergebnis:</div>
          <div class="text-sm">${setsDisplay}</div>
        </div>

        <div class="flex gap-2">
          <button
            class="player-approve-btn flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded transition"
            data-request-id="${request.id}"
          >
            ✓ Bestätigen
          </button>
          <button
            class="player-reject-btn flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded transition"
            data-request-id="${request.id}"
          >
            ✗ Ablehnen
          </button>
        </div>
      `;

            const approveBtn = card.querySelector('.player-approve-btn');
            const rejectBtn = card.querySelector('.player-reject-btn');

            approveBtn.addEventListener('click', async () => {
                await approveMatchRequest(request.id, userData, db);
            });

            rejectBtn.addEventListener('click', async () => {
                await rejectMatchRequest(request.id, userData, db);
            });
        }

        container.appendChild(card);
    });
}
