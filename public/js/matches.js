// Matches-Modul (Firebase-Version)
// Match-Paarungen, Handicap-Berechnung und Match-Ergebnis-Meldung

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
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { createSetScoreInput } from './player-matches.js';
import { calculateHandicap } from './validation-utils.js';
import { formatDate, isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

let coachSetScoreInput = null;
let currentPairingsSession = null;
let currentPairingSessionId = null;
let currentPairingPlayerAId = null;
let currentPairingPlayerBId = null;

/** Aktualisiert die Gewinner-Anzeige basierend auf Satzergebnissen */
export function updateCoachWinnerDisplay(setScoreInput = null) {
    const matchWinnerInfo = document.getElementById('coach-match-winner-info');
    const matchWinnerText = document.getElementById('coach-match-winner-text');

    const inputInstance = setScoreInput || coachSetScoreInput;
    if (!inputInstance || !matchWinnerInfo || !matchWinnerText) return;

    const winnerData = inputInstance.getMatchWinner();

    if (winnerData && winnerData.winner) {
        const playerASelect = document.getElementById('player-a-select');
        const playerBSelect = document.getElementById('player-b-select');

        let winnerName;
        if (winnerData.winner === 'A') {
            winnerName = playerASelect?.selectedOptions[0]?.text || 'Spieler A';
        } else {
            winnerName = playerBSelect?.selectedOptions[0]?.text || 'Spieler B';
        }

        matchWinnerText.textContent = `${winnerName} gewinnt mit ${winnerData.setsA}:${winnerData.setsB} Sätzen`;
        matchWinnerInfo.classList.remove('hidden');
    } else if (winnerData && !winnerData.winner && (winnerData.setsA > 0 || winnerData.setsB > 0)) {
        matchWinnerText.textContent = `Aktueller Stand: ${winnerData.setsA}:${winnerData.setsB} Sätze`;
        matchWinnerInfo.classList.remove('hidden');
    } else {
        matchWinnerInfo.classList.add('hidden');
    }
}

/** Initialisiert die Satzergebnis-Eingabe für Coach-Match-Formular */
export function initializeCoachSetScoreInput() {
    const container = document.getElementById('coach-set-score-container');
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const setScoreLabel = document.getElementById('coach-set-score-label');

    if (!container) return null;

    function updateSetScoreLabel(mode) {
        if (!setScoreLabel) return;
        switch (mode) {
            case 'single-set':
                setScoreLabel.textContent = 'Satzergebnisse (1 Satz)';
                break;
            case 'best-of-3':
                setScoreLabel.textContent = 'Satzergebnisse (Best of 3)';
                break;
            case 'best-of-5':
                setScoreLabel.textContent = 'Satzergebnisse (Best of 5)';
                break;
            case 'best-of-7':
                setScoreLabel.textContent = 'Satzergebnisse (Best of 7)';
                break;
            default:
                setScoreLabel.textContent = 'Satzergebnisse';
        }
    }

    const currentMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';
    coachSetScoreInput = createSetScoreInput(container, [], currentMode, updateCoachWinnerDisplay);
    updateSetScoreLabel(currentMode);

    if (matchModeSelect) {
        matchModeSelect.addEventListener('change', () => {
            const newMode = matchModeSelect.value;
            coachSetScoreInput = createSetScoreInput(container, [], newMode, updateCoachWinnerDisplay);
            updateSetScoreLabel(newMode);

            if (window.setDoublesSetScoreInput) {
                window.setDoublesSetScoreInput(coachSetScoreInput);
            }
        });
    }

    return coachSetScoreInput;
}

/** Setzt die aktuelle Session für Paarungsgenerierung */
export function setCurrentPairingsSession(sessionId) {
    currentPairingsSession = sessionId;
}

/** Generiert Match-Paarungen aus anwesenden und match-bereiten Spielern */
export function handleGeneratePairings(
    clubPlayers,
    currentSubgroupFilter = 'all',
    sessionId = null
) {
    if (sessionId) {
        currentPairingsSession = sessionId;
    }
    const presentPlayerCheckboxes = document.querySelectorAll(
        '#attendance-player-list input:checked'
    );
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    // Nur Spieler paaren die Grundlagen abgeschlossen haben (5 Übungen)
    let matchReadyAndPresentPlayers = clubPlayers.filter(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        return presentPlayerIds.includes(player.id) && grundlagen >= 5;
    });

    // Filter by subgroup, age group, or gender if not "all"
    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            matchReadyAndPresentPlayers = filterPlayersByAgeGroup(matchReadyAndPresentPlayers, currentSubgroupFilter);
        } else if (isGenderFilter(currentSubgroupFilter)) {
            matchReadyAndPresentPlayers = filterPlayersByGender(matchReadyAndPresentPlayers, currentSubgroupFilter);
        } else {
            matchReadyAndPresentPlayers = matchReadyAndPresentPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
        }
    }

    matchReadyAndPresentPlayers.sort((a, b) => (a.eloRating || 0) - (b.eloRating || 0));

    const pairingsByGroup = {};
    const groupSize = 4;

    for (let i = 0; i < matchReadyAndPresentPlayers.length; i += groupSize) {
        const groupNumber = Math.floor(i / groupSize) + 1;
        pairingsByGroup[`Gruppe ${groupNumber}`] = matchReadyAndPresentPlayers.slice(
            i,
            i + groupSize
        );
    }

    const finalPairings = {};
    let leftoverPlayer = null;

    for (const groupName in pairingsByGroup) {
        let playersInGroup = pairingsByGroup[groupName];
        for (let i = playersInGroup.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [playersInGroup[i], playersInGroup[j]] = [playersInGroup[j], playersInGroup[i]];
        }
        finalPairings[groupName] = [];
        for (let i = 0; i < playersInGroup.length - 1; i += 2) {
            finalPairings[groupName].push([playersInGroup[i], playersInGroup[i + 1]]);
        }
        if (playersInGroup.length % 2 !== 0) {
            leftoverPlayer = playersInGroup[playersInGroup.length - 1];
        }
    }
    renderPairingsInModal(finalPairings, leftoverPlayer);
}

/** Rendert generierte Paarungen im Modal */
export function renderPairingsInModal(pairings, leftoverPlayer) {
    const modal = document.getElementById('pairings-modal');
    const container = document.getElementById('modal-pairings-content');
    container.innerHTML = '';

    const hasPairings = Object.values(pairings).some(group => group.length > 0);
    if (!hasPairings && !leftoverPlayer) {
        container.innerHTML =
            '<p class="text-center text-gray-500">Keine möglichen Paarungen gefunden.</p>';
        modal.classList.remove('hidden');
        return;
    }

    for (const groupName in pairings) {
        if (pairings[groupName].length === 0) continue;
        const groupDiv = document.createElement('div');
        groupDiv.className = 'mb-3';
        groupDiv.innerHTML = `<h5 class="font-bold text-gray-800 bg-gray-100 p-2 rounded-t-md">${groupName}</h5>`;
        const list = document.createElement('ul');
        list.className = 'space-y-2 p-2 border-l border-r border-b rounded-b-md';

        pairings[groupName].forEach(pair => {
            const [playerA, playerB] = pair;
            const handicap = calculateHandicap(playerA, playerB);
            let handicapHTML = '<p class="text-xs text-gray-400 mt-1">Kein Handicap</p>';
            if (handicap) {
                handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold"><i class="fas fa-balance-scale-right"></i> ${handicap.player.firstName} startet mit <strong>${handicap.points}</strong> Pkt. Vorsprung.</p>`;
            }
            const listItem = document.createElement('li');
            listItem.className = 'text-sm p-3 bg-white rounded shadow-sm border';
            listItem.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-bold text-indigo-700">${playerA.firstName} ${playerA.lastName}</span>
                        <span class="text-gray-500 mx-2">vs.</span>
                        <span class="font-bold text-indigo-700">${playerB.firstName} ${playerB.lastName}</span>
                    </div>
                    <div class="text-xs text-gray-400">(${Math.round(playerA.eloRating || 0)} vs ${Math.round(playerB.eloRating || 0)})</div>
                </div>
                ${handicapHTML}
            `;
            list.appendChild(listItem);
        });
        groupDiv.appendChild(list);
        container.appendChild(groupDiv);
    }

    if (leftoverPlayer) {
        const leftoverEl = document.createElement('p');
        leftoverEl.className =
            'text-sm text-center text-orange-600 bg-orange-100 p-2 rounded-md mt-4';
        leftoverEl.innerHTML = `<strong>${leftoverPlayer.firstName} ${leftoverPlayer.lastName}</strong> (sitzt diese Runde aus)`;
        container.appendChild(leftoverEl);
    }

    if (currentPairingsSession) {
        const saveButtonContainer = document.createElement('div');
        saveButtonContainer.className = 'mt-6 text-center';

        const saveButton = document.createElement('button');
        saveButton.id = 'save-pairings-button';
        saveButton.className =
            'bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-md transition';
        saveButton.innerHTML = '<i class="fas fa-save mr-2"></i>Paarungen speichern';
        saveButton.onclick = () => savePairings(pairings, leftoverPlayer);

        saveButtonContainer.appendChild(saveButton);
        container.appendChild(saveButtonContainer);
    }

    modal.classList.remove('hidden');
}

/** Speichert Match-Paarungen in Firestore für eine Session */
async function savePairings(pairings, leftoverPlayer) {
    if (!currentPairingsSession) {
        alert('Fehler: Keine Session ausgewählt');
        return;
    }

    const saveButton = document.getElementById('save-pairings-button');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Speichere...';
    }

    try {
        const { getFirestore } = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        );
        const db = getFirestore();
        const sessionDoc = await getDoc(doc(db, 'trainingSessions', currentPairingsSession));

        if (!sessionDoc.exists()) {
            throw new Error('Session nicht gefunden');
        }

        const sessionData = sessionDoc.data();

        const groups = {};
        for (const groupName in pairings) {
            groups[groupName] = pairings[groupName].map(pair => {
                const [playerA, playerB] = pair;
                const handicap = calculateHandicap(playerA, playerB);

                return {
                    playerA: {
                        id: playerA.id,
                        name: `${playerA.firstName} ${playerA.lastName}`,
                        eloRating: playerA.eloRating || 0,
                    },
                    playerB: {
                        id: playerB.id,
                        name: `${playerB.firstName} ${playerB.lastName}`,
                        eloRating: playerB.eloRating || 0,
                    },
                    handicap: handicap
                        ? {
                              player: {
                                  id: handicap.player.id,
                                  name: `${handicap.player.firstName} ${handicap.player.lastName}`,
                              },
                              points: handicap.points,
                          }
                        : null,
                };
            });
        }

        const pairingsData = {
            sessionId: currentPairingsSession,
            clubId: sessionData.clubId,
            date: sessionData.date,
            subgroupId: sessionData.subgroupId,
            startTime: sessionData.startTime,
            endTime: sessionData.endTime,
            groups: groups,
            createdAt: serverTimestamp(),
        };

        await setDoc(doc(db, 'trainingMatches', currentPairingsSession), pairingsData);

        if (saveButton) {
            saveButton.innerHTML = '<i class="fas fa-check mr-2"></i>Gespeichert!';
            saveButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
            saveButton.classList.add('bg-green-600');
        }

        setTimeout(() => {
            document.getElementById('pairings-modal').classList.add('hidden');
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="fas fa-save mr-2"></i>Paarungen speichern';
                saveButton.classList.remove('bg-green-600');
                saveButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
            }
        }, 1500);
    } catch (error) {
        console.error('Error saving pairings:', error);
        alert('Fehler beim Speichern der Paarungen: ' + error.message);

        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fas fa-save mr-2"></i>Paarungen speichern';
        }
    }
}

/** Lädt Match-Paarungen für eine Session */
export async function loadSessionPairings(sessionId) {
    try {
        const { getFirestore } = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        );
        const db = getFirestore();

        const pairingsDoc = await getDoc(doc(db, 'trainingMatches', sessionId));

        if (!pairingsDoc.exists()) {
            return null;
        }

        return pairingsDoc.data();
    } catch (error) {
        console.error('Error loading session pairings:', error);
        return null;
    }
}

/** Aktualisiert den Paarungs-Button basierend auf berechtigten Spielern */
export function updatePairingsButtonState(clubPlayers, currentSubgroupFilter = 'all') {
    const pairingsButton = document.getElementById('generate-pairings-button');
    const presentPlayerCheckboxes = document.querySelectorAll(
        '#attendance-player-list input:checked'
    );
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    let eligiblePlayers = clubPlayers.filter(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        return presentPlayerIds.includes(player.id) && grundlagen >= 5;
    });

    // Filter by subgroup, age group, or gender if not "all"
    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            eligiblePlayers = filterPlayersByAgeGroup(eligiblePlayers, currentSubgroupFilter);
        } else if (isGenderFilter(currentSubgroupFilter)) {
            eligiblePlayers = filterPlayersByGender(eligiblePlayers, currentSubgroupFilter);
        } else {
            eligiblePlayers = eligiblePlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
        }
    }

    const eligiblePlayerCount = eligiblePlayers.length;

    if (eligiblePlayerCount >= 2) {
        pairingsButton.disabled = false;
        pairingsButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.add('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = '<i class="fas fa-random mr-2"></i> Paarungen erstellen';
    } else {
        pairingsButton.disabled = true;
        pairingsButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        pairingsButton.classList.remove('bg-green-600', 'hover:bg-green-700');
        pairingsButton.innerHTML = `(${eligiblePlayerCount}/2 Spieler bereit)`;
    }
}

/** Verarbeitet Match-Ergebnis-Eintragung */
export async function handleMatchSave(e, db, currentUserData, clubPlayers) {
    e.preventDefault();
    const feedbackEl = document.getElementById('match-feedback');
    const playerAId = document.getElementById('player-a-select').value;
    const playerBId = document.getElementById('player-b-select').value;
    const handicapUsed = document.getElementById('handicap-toggle').checked;

    if (!playerAId || !playerBId || playerAId === playerBId) {
        feedbackEl.textContent = 'Bitte zwei unterschiedliche Spieler auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    if (!coachSetScoreInput) {
        feedbackEl.textContent = 'Fehler: Set-Score-Input nicht initialisiert.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const setValidation = coachSetScoreInput.validate();
    if (!setValidation.valid) {
        feedbackEl.textContent = setValidation.error;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const sets = coachSetScoreInput.getSets();
    const winnerId = setValidation.winnerId === 'A' ? playerAId : playerBId;
    const loserId = winnerId === playerAId ? playerBId : playerAId;
    feedbackEl.textContent = 'Speichere Match-Ergebnis...';

    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const matchMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';

    try {
        await addDoc(collection(db, 'matches'), {
            playerAId,
            playerBId,
            playerIds: [playerAId, playerBId],
            winnerId,
            loserId,
            handicapUsed: handicapUsed,
            matchMode: matchMode,
            sets: sets,
            reportedBy: currentUserData.id,
            clubId: currentUserData.clubId,
            createdAt: serverTimestamp(),
            processed: false,
        });
        feedbackEl.textContent = 'Match gemeldet! Punkte werden in Kürze aktualisiert.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();

        const matchModeSelect = document.getElementById('coach-match-mode-select');
        const setScoreLabel = document.getElementById('coach-set-score-label');
        const container = document.getElementById('coach-set-score-container');

        if (matchModeSelect) {
            matchModeSelect.value = 'best-of-5';
        }

        if (container) {
            coachSetScoreInput = createSetScoreInput(container, [], 'best-of-5', updateCoachWinnerDisplay);
            if (setScoreLabel) {
                setScoreLabel.textContent = 'Satzergebnisse (Best of 5)';
            }
        }

        updateMatchUI(clubPlayers);

        // Falls dieses Match von einer gespeicherten Paarung eingegeben wurde, diese entfernen
        if (currentPairingSessionId && currentPairingPlayerAId && currentPairingPlayerBId) {
            removePairingFromDOM(
                currentPairingSessionId,
                currentPairingPlayerAId,
                currentPairingPlayerBId
            );

            const userData = JSON.parse(localStorage.getItem('userData'));

            try {
                await removePairingFromSession(
                    currentPairingSessionId,
                    currentPairingPlayerAId,
                    currentPairingPlayerBId,
                    db
                );

                currentPairingSessionId = null;
                currentPairingPlayerAId = null;
                currentPairingPlayerBId = null;
            } catch (error) {
                console.error('Error removing pairing from Firestore:', error);
                if (userData && userData.clubId) {
                    setTimeout(async () => {
                        await loadSavedPairings(db, userData.clubId);
                    }, 500);
                }
            }
        }
    } catch (error) {
        console.error('Fehler beim Melden des Matches:', error);
        feedbackEl.textContent = 'Fehler: Das Match konnte nicht gemeldet werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
}

let currentHandicapData = null;

/** Initialisiert den Handicap-Toggle Event Listener */
export function initializeHandicapToggle() {
    const handicapToggle = document.getElementById('handicap-toggle');
    if (!handicapToggle) return;

    handicapToggle.addEventListener('change', () => {
        if (!coachSetScoreInput || !currentHandicapData) return;

        if (handicapToggle.checked) {
            coachSetScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
        } else {
            coachSetScoreInput.clearHandicap(currentHandicapData.player);
        }
    });
}

/** Aktualisiert das Match-Formular UI basierend auf ausgewählten Spielern */
export function updateMatchUI(clubPlayers) {
    const playerAId = document.getElementById('player-a-select').value;
    const playerBId = document.getElementById('player-b-select').value;
    const handicapContainer = document.getElementById('handicap-suggestion');
    const handicapToggleContainer = document.getElementById('handicap-toggle-container');
    const handicapToggle = document.getElementById('handicap-toggle');

    const playerA = clubPlayers.find(p => p.id === playerAId);
    const playerB = clubPlayers.find(p => p.id === playerBId);

    if (playerA && playerB && playerAId !== playerBId) {
        const handicap = calculateHandicap(playerA, playerB);

        if (handicap && handicap.points > 0) {
            currentHandicapData = {
                player: handicap.player.id === playerAId ? 'A' : 'B',
                points: handicap.points,
            };

            document.getElementById('handicap-text').textContent =
                `${handicap.player.firstName} startet mit ${handicap.points} Punkten Vorsprung pro Satz.`;
            handicapContainer.classList.remove('hidden');
            handicapToggleContainer.classList.remove('hidden');
            handicapToggleContainer.classList.add('flex');

            if (handicapToggle && handicapToggle.checked && coachSetScoreInput) {
                coachSetScoreInput.setHandicap(
                    currentHandicapData.player,
                    currentHandicapData.points
                );
            }
        } else {
            currentHandicapData = null;
            handicapContainer.classList.add('hidden');
            handicapToggleContainer.classList.add('hidden');
            handicapToggleContainer.classList.remove('flex');
        }
    } else {
        currentHandicapData = null;
        if (handicapContainer) handicapContainer.classList.add('hidden');
        if (handicapToggleContainer) {
            handicapToggleContainer.classList.add('hidden');
            handicapToggleContainer.classList.remove('flex');
        }
    }
}

/** Befüllt Match-Dropdowns mit match-bereiten Spielern */
export function populateMatchDropdowns(clubPlayers, currentSubgroupFilter = 'all') {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';

    let matchReadyPlayers = clubPlayers.filter(p => {
        const grundlagen = p.grundlagenCompleted || 0;
        return grundlagen >= 5;
    });

    const lockedPlayers = clubPlayers.filter(p => {
        const grundlagen = p.grundlagenCompleted || 0;
        return grundlagen < 5;
    });

    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            matchReadyPlayers = filterPlayersByAgeGroup(matchReadyPlayers, currentSubgroupFilter);
        } else if (isGenderFilter(currentSubgroupFilter)) {
            matchReadyPlayers = filterPlayersByGender(matchReadyPlayers, currentSubgroupFilter);
        } else {
            matchReadyPlayers = matchReadyPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
        }
    }

    const handicapSuggestion = document.getElementById('handicap-suggestion');
    if (handicapSuggestion) {
        if (matchReadyPlayers.length < 2) {
            let message =
                currentSubgroupFilter !== 'all'
                    ? '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler in dieser Untergruppe müssen Match-bereit sein.</p>'
                    : '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler müssen Match-bereit sein.</p>';

            if (lockedPlayers.length > 0) {
                const lockedNames = lockedPlayers
                    .map(p => {
                        const grundlagen = p.grundlagenCompleted || 0;
                        return `${p.firstName} (${grundlagen}/5 Grundlagen)`;
                    })
                    .join(', ');
                message += `<p class="text-xs text-gray-600 mt-2">🔒 Gesperrt: ${lockedNames}</p>`;
            }

            handicapSuggestion.innerHTML = message;
            handicapSuggestion.classList.remove('hidden');
        } else {
            handicapSuggestion.classList.add('hidden');
        }
    }

    matchReadyPlayers.forEach(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.firstName} ${player.lastName} (Elo: ${Math.round(player.eloRating || 0)})`;
        playerASelect.appendChild(option.cloneNode(true));
        playerBSelect.appendChild(option);
    });
}

/** Lädt ausstehende Match-Anfragen für Coach-Genehmigung */
export async function loadCoachMatchRequests(userData, db) {
    const container = document.getElementById('coach-pending-requests-list');
    const badge = document.getElementById('coach-match-request-badge');
    if (!container) return;

    const singlesQuery = query(
        collection(db, 'matchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_coach'),
        orderBy('createdAt', 'desc')
    );

    const doublesQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('status', '==', 'pending_coach'),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe1 = onSnapshot(singlesQuery, async singlesSnapshot => {
        const unsubscribe2 = onSnapshot(doublesQuery, async doublesSnapshot => {
            const allRequests = [];

            for (const docSnap of singlesSnapshot.docs) {
                const data = docSnap.data();
                const playerADoc = await getDoc(doc(db, 'users', data.playerAId));
                const playerBDoc = await getDoc(doc(db, 'users', data.playerBId));

                allRequests.push({
                    id: docSnap.id,
                    type: 'singles',
                    ...data,
                    playerAData: playerADoc.exists() ? playerADoc.data() : null,
                    playerBData: playerBDoc.exists() ? playerBDoc.data() : null,
                });
            }

            for (const docSnap of doublesSnapshot.docs) {
                const data = docSnap.data();

                const [p1Doc, p2Doc, p3Doc, p4Doc] = await Promise.all([
                    getDoc(doc(db, 'users', data.teamA.player1Id)),
                    getDoc(doc(db, 'users', data.teamA.player2Id)),
                    getDoc(doc(db, 'users', data.teamB.player1Id)),
                    getDoc(doc(db, 'users', data.teamB.player2Id)),
                ]);

                const p1Data = p1Doc.exists() ? p1Doc.data() : null;
                const p2Data = p2Doc.exists() ? p2Doc.data() : null;
                const p3Data = p3Doc.exists() ? p3Doc.data() : null;
                const p4Data = p4Doc.exists() ? p4Doc.data() : null;

                const playerClubIds = [
                    p1Data?.clubId,
                    p2Data?.clubId,
                    p3Data?.clubId,
                    p4Data?.clubId,
                ];

                if (playerClubIds.includes(userData.clubId)) {
                    allRequests.push({
                        id: docSnap.id,
                        type: 'doubles',
                        ...data,
                        teamAPlayer1: p1Data,
                        teamAPlayer2: p2Data,
                        teamBPlayer1: p3Data,
                        teamBPlayer2: p4Data,
                    });
                }
            }

            allRequests.sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            });

            if (allRequests.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
                if (badge) badge.classList.add('hidden');
                return;
            }

            renderCoachRequestCards(allRequests, db, userData);

            if (badge) {
                badge.textContent = allRequests.length;
                badge.classList.remove('hidden');
            }
        });
    });

    return unsubscribe1;
}

/** Lädt bearbeitete Match-Anfragen (genehmigt/abgelehnt) */
export async function loadCoachProcessedRequests(userData, db) {
    const container = document.getElementById('coach-processed-requests-list');
    if (!container) return;

    const requestsQuery = query(
        collection(db, 'matchRequests'),
        where('clubId', '==', userData.clubId),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(requestsQuery, async snapshot => {
        const requests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            if (data.status === 'approved' || data.status === 'rejected') {
                const playerADoc = await getDoc(doc(db, 'users', data.playerAId));
                const playerBDoc = await getDoc(doc(db, 'users', data.playerBId));

                requests.push({
                    id: docSnap.id,
                    ...data,
                    playerAData: playerADoc.exists() ? playerADoc.data() : null,
                    playerBData: playerBDoc.exists() ? playerBDoc.data() : null,
                });
            }
        }

        renderCoachProcessedCards(requests, db);
    });

    return unsubscribe;
}

/** Rendert bearbeitete Match-Anfragen-Karten für Coach */
let showAllCoachProcessed = false;

function renderCoachProcessedCards(requests, db) {
    const container = document.getElementById('coach-processed-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-500 text-center py-4">Keine bearbeiteten Anfragen</p>';
        showAllCoachProcessed = false;
        return;
    }

    container.innerHTML = '';

    // Determine how many to show
    const maxInitial = 3;
    const requestsToShow = showAllCoachProcessed ? requests : requests.slice(0, maxInitial);

    requestsToShow.forEach(request => {
        const card = document.createElement('div');

        let borderColor = 'border-gray-200';
        if (request.status === 'approved') {
            borderColor = 'border-green-200 bg-green-50';
        } else if (request.status === 'rejected') {
            borderColor = 'border-red-200 bg-red-50';
        }

        card.className = `bg-white border ${borderColor} rounded-lg p-4 shadow-sm`;

        const playerAName = request.playerAData?.firstName || 'Unbekannt';
        const playerBName = request.playerBData?.firstName || 'Unbekannt';
        const setsDisplay = formatSetsForCoach(request.sets);
        const winner = getWinnerName(request.sets, request.playerAData, request.playerBData);

        const createdDate = formatDate(request.createdAt) || 'Unbekannt';
        const coachName = request.approvals?.coach?.coachName || 'Ein Coach';

        const statusBadge =
            request.status === 'approved'
                ? `<span class="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">✓ Von ${coachName} genehmigt</span>`
                : `<span class="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">✗ Von ${coachName} abgelehnt</span>`;

        const statusDescription =
            request.status === 'approved'
                ? `<p class="text-xs text-green-700 mt-2"><i class="fas fa-check-circle mr-1"></i> ${coachName} hat diese Anfrage genehmigt. Das Match wurde erstellt und verarbeitet.</p>`
                : `<p class="text-xs text-red-700 mt-2"><i class="fas fa-times-circle mr-1"></i> ${coachName} hat diese Anfrage abgelehnt.</p>`;

        card.innerHTML = `
            <div class="mb-3">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800">
                            ${playerAName} <span class="text-gray-500">vs</span> ${playerBName}
                        </p>
                        <p class="text-sm text-gray-600 mt-1">${setsDisplay}</p>
                        <p class="text-sm font-medium text-indigo-700 mt-1">
                            <i class="fas fa-trophy mr-1"></i> Gewinner: ${winner}
                        </p>
                        ${
                            request.handicapUsed
                                ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>'
                                : ''
                        }
                    </div>
                    <div class="text-right">
                        ${statusBadge}
                        <p class="text-xs text-gray-500 mt-1">${createdDate}</p>
                    </div>
                </div>
                ${statusDescription}
            </div>
        `;

        container.appendChild(card);
    });

    // Add "Show more" / "Show less" button if needed
    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllCoachProcessed
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllCoachProcessed = !showAllCoachProcessed;
            renderCoachProcessedCards(requests, db);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}

/** Rendert ausstehende Match-Anfragen-Karten für Coach */
let showAllCoachRequests = false;

function renderCoachRequestCards(requests, db, userData) {
    const container = document.getElementById('coach-pending-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML =
            '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
        showAllCoachRequests = false;
        return;
    }

    container.innerHTML = '';

    // Determine how many to show
    const maxInitial = 3;
    const requestsToShow = showAllCoachRequests ? requests : requests.slice(0, maxInitial);

    requestsToShow.forEach(request => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-gray-200 rounded-lg p-4 shadow-sm';

        const createdDate = formatDate(request.createdAt) || 'Unbekannt';

        let matchTypeTag, playersDisplay, setsDisplay, winnerDisplay, buttonsHtml;

        if (request.type === 'doubles') {
            matchTypeTag =
                '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full mr-2"><i class="fas fa-users mr-1"></i>Doppel</span>';

            const teamAName1 = request.teamAPlayer1?.firstName || '?';
            const teamAName2 = request.teamAPlayer2?.firstName || '?';
            const teamBName1 = request.teamBPlayer1?.firstName || '?';
            const teamBName2 = request.teamBPlayer2?.firstName || '?';

            playersDisplay = `
                <span class="text-indigo-700">${teamAName1} & ${teamAName2}</span>
                <span class="text-gray-500 mx-2">vs</span>
                <span class="text-indigo-700">${teamBName1} & ${teamBName2}</span>
            `;

            const setsStr = request.sets.map(s => `${s.teamA}:${s.teamB}`).join(', ');
            const winsA = request.sets.filter(s => s.teamA > s.teamB && s.teamA >= 11).length;
            const winsB = request.sets.filter(s => s.teamB > s.teamA && s.teamB >= 11).length;
            setsDisplay = `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;

            const winnerTeamName =
                request.winningTeam === 'A'
                    ? `${teamAName1} & ${teamAName2}`
                    : `${teamBName1} & ${teamBName2}`;
            winnerDisplay = `<i class="fas fa-trophy mr-1"></i> Gewinner: ${winnerTeamName}`;

            buttonsHtml = `
                <button class="doubles-approve-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
                    <i class="fas fa-check"></i> Genehmigen
                </button>
                <button class="doubles-reject-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
                    <i class="fas fa-times"></i> Ablehnen
                </button>
            `;
        } else {
            matchTypeTag =
                '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full mr-2"><i class="fas fa-user mr-1"></i>Einzel</span>';

            const playerAName = request.playerAData?.firstName || 'Unbekannt';
            const playerBName = request.playerBData?.firstName || 'Unbekannt';

            playersDisplay = `${playerAName} <span class="text-gray-500">vs</span> ${playerBName}`;
            setsDisplay = formatSetsForCoach(request.sets);
            const winner = getWinnerName(request.sets, request.playerAData, request.playerBData);
            winnerDisplay = `<i class="fas fa-trophy mr-1"></i> Gewinner: ${winner}`;

            buttonsHtml = `
                <button class="coach-approve-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
                    <i class="fas fa-check"></i> Genehmigen
                </button>
                <button class="coach-reject-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
                    <i class="fas fa-times"></i> Ablehnen
                </button>
            `;
        }

        card.innerHTML = `
            <div class="mb-3">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <div class="mb-2">${matchTypeTag}</div>
                        <p class="font-semibold text-gray-800">
                            ${playersDisplay}
                        </p>
                        <p class="text-sm text-gray-600 mt-1">${setsDisplay}</p>
                        <p class="text-sm font-medium text-indigo-700 mt-1">
                            ${winnerDisplay}
                        </p>
                        ${
                            request.handicapUsed
                                ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>'
                                : ''
                        }
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
                ${buttonsHtml}
            </div>
        `;

        if (request.type === 'doubles') {
            const approveBtn = card.querySelector('.doubles-approve-btn');
            const rejectBtn = card.querySelector('.doubles-reject-btn');

            approveBtn.addEventListener('click', async () => {
                const { approveDoublesMatchRequest } = await import('./doubles-matches.js');
                await approveDoublesMatchRequest(request.id, db, userData);
                alert('Doppel-Match genehmigt!');
            });
            rejectBtn.addEventListener('click', async () => {
                const reason = prompt('Grund für die Ablehnung (optional):');
                const { rejectDoublesMatchRequest } = await import('./doubles-matches.js');
                await rejectDoublesMatchRequest(request.id, reason, db, userData);
                alert('Doppel-Match abgelehnt.');
            });
        } else {
            const approveBtn = card.querySelector('.coach-approve-btn');
            const rejectBtn = card.querySelector('.coach-reject-btn');

            approveBtn.addEventListener('click', () =>
                approveCoachRequest(request.id, db, userData)
            );
            rejectBtn.addEventListener('click', () => rejectCoachRequest(request.id, db, userData));
        }

        container.appendChild(card);
    });

    // Add "Show more" / "Show less" button if needed
    if (requests.length > maxInitial) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'text-center mt-4';

        const button = document.createElement('button');
        button.className = 'text-indigo-600 hover:text-indigo-800 font-medium text-sm transition';
        button.innerHTML = showAllCoachRequests
            ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
            : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

        button.addEventListener('click', () => {
            showAllCoachRequests = !showAllCoachRequests;
            renderCoachRequestCards(requests, db, userData);
        });

        buttonContainer.appendChild(button);
        container.appendChild(buttonContainer);
    }
}

/** Formatiert Sätze für Coach-Anzeige */
function formatSetsForCoach(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    return `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;
}

/** Ermittelt Gewinnernamen aus Satzergebnissen */
function getWinnerName(sets, playerA, playerB) {
    if (!sets || sets.length === 0) return 'Unbekannt';

    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    if (winsA > winsB) return playerA?.firstName || 'Spieler A';
    if (winsB > winsA) return playerB?.firstName || 'Spieler B';
    return 'Unentschieden';
}

/** Genehmigt Match-Anfrage als Coach */
async function approveCoachRequest(requestId, db, userData) {
    try {
        const requestRef = doc(db, 'matchRequests', requestId);
        const requestSnap = await getDoc(requestRef);

        if (!requestSnap.exists()) {
            console.error('Request not found:', requestId);
            alert('Anfrage nicht gefunden.');
            return;
        }

        const requestData = requestSnap.data();

        if (requestData.status !== 'pending_coach') {
            alert(`Fehler: Anfrage hat den Status "${requestData.status}" statt "pending_coach"`);
            return;
        }

        await updateDoc(requestRef, {
            'approvals.coach': {
                status: 'approved',
                timestamp: serverTimestamp(),
                coachId: userData.id,
                coachName: userData.firstName,
            },
            status: 'approved',
            updatedAt: serverTimestamp(),
        });

        alert('Match wurde genehmigt! Es wird automatisch verarbeitet.');
    } catch (error) {
        console.error('Error approving request:', error);
        alert('Fehler beim Genehmigen der Anfrage: ' + error.message);
    }
}

/** Lehnt Match-Anfrage als Coach ab */
async function rejectCoachRequest(requestId, db, userData) {
    const reason = prompt('Grund für die Ablehnung (optional):');

    try {
        const requestRef = doc(db, 'matchRequests', requestId);
        const requestSnap = await getDoc(requestRef);

        if (!requestSnap.exists()) {
            console.error('Request not found:', requestId);
            alert('Anfrage nicht gefunden.');
            return;
        }

        const requestData = requestSnap.data();

        if (requestData.status !== 'pending_coach') {
            alert(`Fehler: Anfrage hat den Status "${requestData.status}" statt "pending_coach"`);
            return;
        }

        await updateDoc(requestRef, {
            'approvals.coach': {
                status: 'rejected',
                timestamp: serverTimestamp(),
                coachId: userData.id,
                coachName: userData.firstName,
            },
            status: 'rejected',
            rejectedBy: 'coach',
            rejectionReason: reason || 'Keine Angabe',
            updatedAt: serverTimestamp(),
        });

        alert('Match-Anfrage wurde abgelehnt.');
    } catch (error) {
        console.error('Error rejecting request:', error);
        alert('Fehler beim Ablehnen der Anfrage: ' + error.message);
    }
}

/** Lädt und zeigt alle gespeicherten Paarungen */
export async function loadSavedPairings(db, clubId) {
    const container = document.getElementById('saved-pairings-container');
    if (!container) return;

    try {
        container.innerHTML =
            '<p class="text-center text-gray-500 py-8">Lade gespeicherte Paarungen...</p>';

        const { getDocs } = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        );

        const pairingsQuery = query(
            collection(db, 'trainingMatches'),
            where('clubId', '==', clubId),
            orderBy('date', 'desc')
        );

        const pairingsSnapshot = await getDocs(pairingsQuery);

        if (pairingsSnapshot.empty) {
            container.innerHTML =
                '<p class="text-center text-gray-500 py-8">Keine gespeicherten Paarungen vorhanden.</p>';
            return;
        }

        let html = '';

        for (const pairingDoc of pairingsSnapshot.docs) {
            const pairingData = pairingDoc.data();
            const sessionId = pairingDoc.id;
            const groups = pairingData.groups || {};
            const date = pairingData.date || 'Unbekannt';

            let hasPairings = false;
            for (const groupName in groups) {
                if (groups[groupName] && groups[groupName].length > 0) {
                    hasPairings = true;
                    break;
                }
            }

            if (!hasPairings) {
                continue;
            }

            let sessionInfo = '';
            try {
                const sessionDoc = await getDoc(doc(db, 'trainingSessions', sessionId));
                if (sessionDoc.exists()) {
                    const sessionData = sessionDoc.data();
                    sessionInfo = `${sessionData.startTime} - ${sessionData.endTime}`;

                    // Get subgroup name
                    const subgroupDoc = await getDoc(doc(db, 'subgroups', sessionData.subgroupId));
                    if (subgroupDoc.exists()) {
                        sessionInfo += ` (${subgroupDoc.data().name})`;
                    }
                }
            } catch (error) {
                console.error('Error loading session info:', error);
            }

            html += `
                <div class="border border-gray-200 rounded-lg p-4">
                    <div class="mb-3">
                        <h3 class="font-semibold text-gray-900">${formatDateGerman(date)} ${sessionInfo}</h3>
                    </div>
                    <div class="space-y-2">
            `;

            for (const groupName in groups) {
                const matches = groups[groupName];

                if (!matches || matches.length === 0) {
                    continue;
                }

                matches.forEach((match, index) => {
                    const handicapInfo = match.handicap
                        ? `<span class="text-xs text-blue-600 ml-2">Handicap: ${match.handicap.player.name.split(' ')[0]} +${match.handicap.points}</span>`
                        : '';

                    html += `
                        <div class="bg-gray-50 border border-gray-200 rounded p-3 flex justify-between items-center">
                            <div>
                                <span class="font-semibold">${match.playerA.name}</span>
                                <span class="text-gray-400 mx-2">vs</span>
                                <span class="font-semibold">${match.playerB.name}</span>
                                ${handicapInfo}
                            </div>
                            <div class="flex gap-2">
                                <button
                                    onclick="window.handleEnterResultForPairing('${sessionId}', '${match.playerA.id}', '${match.playerB.id}', '${match.playerA.name}', '${match.playerB.name}', ${match.handicap ? `'${match.handicap.player.id}'` : 'null'}, ${match.handicap ? match.handicap.points : 0})"
                                    class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-1 px-3 rounded"
                                >
                                    Ergebnis eingeben
                                </button>
                                <button
                                    onclick="window.handleDiscardPairing('${sessionId}', ${index}, '${groupName}')"
                                    class="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-1 px-3 rounded"
                                >
                                    Verwerfen
                                </button>
                            </div>
                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;
        }

        if (html === '') {
            container.innerHTML =
                '<p class="text-center text-gray-500 py-8">Keine gespeicherten Paarungen vorhanden.</p>';
        } else {
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading saved pairings:', error);
        container.innerHTML =
            '<p class="text-center text-red-500 py-8">Fehler beim Laden der Paarungen.</p>';
    }
}

/** Formatiert Datum von YYYY-MM-DD zu DD.MM.YYYY */
function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

/** Öffnet Match-Formular mit vorausgewählten Spielern */
window.handleEnterResultForPairing = function (
    sessionId,
    playerAId,
    playerBId,
    playerAName,
    playerBName,
    handicapPlayerId,
    handicapPoints
) {
    currentPairingSessionId = sessionId;
    currentPairingPlayerAId = playerAId;
    currentPairingPlayerBId = playerBId;

    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    if (playerASelect) playerASelect.value = playerAId;
    if (playerBSelect) playerBSelect.value = playerBId;

    if (playerASelect) playerASelect.dispatchEvent(new Event('change'));
    if (playerBSelect) playerBSelect.dispatchEvent(new Event('change'));

    if (handicapPlayerId && handicapPoints > 0) {
        const handicapToggle = document.getElementById('handicap-toggle');
        if (handicapToggle) {
            handicapToggle.checked = true;
        }
    }

    const matchForm = document.getElementById('match-form');
    if (matchForm) {
        matchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    alert('Spieler wurden im Formular vorausgewählt. Bitte gib jetzt das Ergebnis ein.');
};

/** Entfernt eine Paarung aus dem DOM (optimistisches Update) */
function removePairingFromDOM(sessionId, playerAId, playerBId) {
    const container = document.getElementById('saved-pairings-container');
    if (!container) return;

    // Find all pairing cards
    const pairingCards = container.querySelectorAll('.border.border-gray-200.rounded-lg');

    pairingCards.forEach(card => {
        // Find all match divs within this card
        const matchDivs = card.querySelectorAll('.bg-gray-50.border.border-gray-200.rounded');

        matchDivs.forEach(matchDiv => {
            const buttons = matchDiv.querySelectorAll('button');
            buttons.forEach(button => {
                const onclickAttr = button.getAttribute('onclick');
                if (
                    onclickAttr &&
                    onclickAttr.includes(sessionId) &&
                    onclickAttr.includes(playerAId) &&
                    onclickAttr.includes(playerBId)
                ) {
                    matchDiv.remove();

                    const remainingMatches = card.querySelectorAll(
                        '.bg-gray-50.border.border-gray-200.rounded'
                    );
                    if (remainingMatches.length === 0) {
                        // Check if there's a leftover player
                        const hasLeftover = card.querySelector('.bg-orange-50');
                        if (!hasLeftover) {
                            // Remove the entire card if no matches and no leftover
                            card.remove();

                            // Check if container is now empty
                            const remainingCards = container.querySelectorAll(
                                '.border.border-gray-200.rounded-lg'
                            );
                            if (remainingCards.length === 0) {
                                container.innerHTML =
                                    '<p class="text-center text-gray-500 py-8">Keine gespeicherten Paarungen vorhanden.</p>';
                            }
                        }
                    }
                }
            });
        });
    });
}

/** Entfernt eine Paarung aus einer Trainings-Session */
async function removePairingFromSession(sessionId, playerAId, playerBId, db) {
    try {
        const pairingDoc = await getDoc(doc(db, 'trainingMatches', sessionId));

        if (!pairingDoc.exists()) {
            return;
        }

        const pairingData = pairingDoc.data();
        const groups = pairingData.groups || {};
        let pairingRemoved = false;

        for (const groupName in groups) {
            const matches = groups[groupName];
            const matchIndex = matches.findIndex(
                match =>
                    (match.playerA.id === playerAId && match.playerB.id === playerBId) ||
                    (match.playerA.id === playerBId && match.playerB.id === playerAId)
            );

            if (matchIndex !== -1) {
                matches.splice(matchIndex, 1);
                pairingRemoved = true;

                if (matches.length === 0) {
                    delete groups[groupName];
                }
                break;
            }
        }

        if (pairingRemoved) {
            if (Object.keys(groups).length === 0 && !pairingData.leftoverPlayer) {
                await updateDoc(doc(db, 'trainingMatches', sessionId), {
                    groups: {},
                });
            } else {
                await updateDoc(doc(db, 'trainingMatches', sessionId), {
                    groups: groups,
                });
            }
        }
    } catch (error) {
        console.error('Error removing pairing from session:', error);
        throw error;
    }
}

/** Entfernt eine verworfene Paarung aus dem DOM */
function removeDiscardedPairingFromDOM(sessionId, matchIndex, groupName) {
    const container = document.getElementById('saved-pairings-container');
    if (!container) return;

    const pairingCards = container.querySelectorAll('.border.border-gray-200.rounded-lg');

    pairingCards.forEach(card => {
        const matchDivs = card.querySelectorAll('.bg-gray-50.border.border-gray-200.rounded');

        matchDivs.forEach(matchDiv => {
            const discardButton = matchDiv.querySelector('button.bg-red-600');
            if (discardButton) {
                const onclickAttr = discardButton.getAttribute('onclick');
                if (
                    onclickAttr &&
                    onclickAttr.includes(`'${sessionId}'`) &&
                    onclickAttr.includes(`${matchIndex},`) &&
                    onclickAttr.includes(`'${groupName}'`)
                ) {
                    matchDiv.remove();

                    const remainingMatches = card.querySelectorAll(
                        '.bg-gray-50.border.border-gray-200.rounded'
                    );
                    if (remainingMatches.length === 0) {
                        // Check if there's a leftover player
                        const hasLeftover = card.querySelector('.bg-orange-50');
                        if (!hasLeftover) {
                            // Remove the entire card if no matches and no leftover
                            card.remove();

                            // Check if container is now empty
                            const remainingCards = container.querySelectorAll(
                                '.border.border-gray-200.rounded-lg'
                            );
                            if (remainingCards.length === 0) {
                                container.innerHTML =
                                    '<p class="text-center text-gray-500 py-8">Keine gespeicherten Paarungen vorhanden.</p>';
                            }
                        }
                    }
                }
            }
        });
    });
}

/** Verwirft eine Paarung */
window.handleDiscardPairing = async function (sessionId, matchIndex, groupName) {
    if (!confirm('Möchtest du diese Paarung wirklich verwerfen?')) {
        return;
    }

    removeDiscardedPairingFromDOM(sessionId, matchIndex, groupName);

    try {
        const { getFirestore } = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        );
        const db = getFirestore();

        const pairingDoc = await getDoc(doc(db, 'trainingMatches', sessionId));

        if (!pairingDoc.exists()) {
            console.log('Pairing document not found in Firestore');
            return;
        }

        const pairingData = pairingDoc.data();
        const groups = pairingData.groups || {};

        if (groups[groupName] && groups[groupName][matchIndex]) {
            groups[groupName].splice(matchIndex, 1);

            if (groups[groupName].length === 0) {
                delete groups[groupName];
            }

            await updateDoc(doc(db, 'trainingMatches', sessionId), {
                groups: groups,
            });

            alert('Paarung wurde verworfen.');
        }
    } catch (error) {
        console.error('Error discarding pairing from Firestore:', error);
        const userData = JSON.parse(localStorage.getItem('userData'));
        if (userData && userData.clubId) {
            const { getFirestore } = await import(
                'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
            );
            const db = getFirestore();
            setTimeout(async () => {
                await loadSavedPairings(db, userData.clubId);
            }, 500);
        }
        alert('Fehler beim Verwerfen der Paarung: ' + error.message);
    }
};
