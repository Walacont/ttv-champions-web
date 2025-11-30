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
import { formatDate } from './ui-utils.js';

/**
 * Matches Module
 * Handles match pairings, handicap calculation, and match result reporting
 */

// Global variable to store set score input instance for coach match form
let coachSetScoreInput = null;

// Global variable to store current session for pairings
let currentPairingsSession = null;

// Global variables to track pairing being entered from saved pairings
let currentPairingSessionId = null;
let currentPairingPlayerAId = null;
let currentPairingPlayerBId = null;

/**
 * Initializes the set score input for coach match form
 * @returns {Object|null} The set score input instance
 */
export function initializeCoachSetScoreInput() {
    const container = document.getElementById('coach-set-score-container');
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const setScoreLabel = document.getElementById('coach-set-score-label');

    if (!container) return null;

    // Function to update label text based on mode
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

    // Initialize with current mode
    const currentMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';
    coachSetScoreInput = createSetScoreInput(container, [], currentMode);
    updateSetScoreLabel(currentMode);

    // Handle match mode changes
    if (matchModeSelect) {
        matchModeSelect.addEventListener('change', () => {
            const newMode = matchModeSelect.value;
            // Recreate the set score input with new mode
            coachSetScoreInput = createSetScoreInput(container, [], newMode);
            updateSetScoreLabel(newMode);

            // Update doubles reference if doubles-coach-ui is loaded
            if (window.setDoublesSetScoreInput) {
                window.setDoublesSetScoreInput(coachSetScoreInput);
            }
        });
    }

    return coachSetScoreInput;
}

/**
 * Sets the current session for pairings generation
 * @param {string} sessionId - Session ID
 */
export function setCurrentPairingsSession(sessionId) {
    currentPairingsSession = sessionId;
}

/**
 * Generates match pairings from present and match-ready players
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 * @param {string} sessionId - Optional session ID for session-based pairings
 */
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
    // Only pair players who have completed Grundlagen (5 exercises)
    let matchReadyAndPresentPlayers = clubPlayers.filter(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        return presentPlayerIds.includes(player.id) && grundlagen >= 5;
    });

    // Filter by subgroup if not "all"
    if (currentSubgroupFilter !== 'all') {
        matchReadyAndPresentPlayers = matchReadyAndPresentPlayers.filter(
            player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );
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

/**
 * Renders generated pairings in the modal
 * @param {Object} pairings - Object containing groups and their pairings
 * @param {Object|null} leftoverPlayer - Player without a match, if any
 */
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

    // Add save button if session-based pairings are enabled
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

/**
 * Saves match pairings to Firestore for a specific session
 * @param {Object} pairings - Pairings object
 * @param {Object|null} leftoverPlayer - Player without a match (no longer saved, parameter kept for compatibility)
 */
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
        // Get session data from Firestore
        const { getFirestore } = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        );
        const db = getFirestore();
        const sessionDoc = await getDoc(doc(db, 'trainingSessions', currentPairingsSession));

        if (!sessionDoc.exists()) {
            throw new Error('Session nicht gefunden');
        }

        const sessionData = sessionDoc.data();

        // Transform pairings to saveable format
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
            // leftoverPlayer should NOT be saved - only actual pairings
            createdAt: serverTimestamp(),
        };

        // Save to trainingMatches collection with sessionId as document ID
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

/**
 * Loads match pairings for a specific session
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Pairings data or null
 */
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

/**
 * Updates the state of the pairings button based on eligible players
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function updatePairingsButtonState(clubPlayers, currentSubgroupFilter = 'all') {
    const pairingsButton = document.getElementById('generate-pairings-button');
    const presentPlayerCheckboxes = document.querySelectorAll(
        '#attendance-player-list input:checked'
    );
    const presentPlayerIds = Array.from(presentPlayerCheckboxes).map(cb => cb.value);
    // Only count players who have completed Grundlagen (5 exercises)
    let eligiblePlayers = clubPlayers.filter(player => {
        const grundlagen = player.grundlagenCompleted || 0;
        return presentPlayerIds.includes(player.id) && grundlagen >= 5;
    });

    // Filter by subgroup if not "all"
    if (currentSubgroupFilter !== 'all') {
        eligiblePlayers = eligiblePlayers.filter(
            player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );
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

/**
 * Handles match result submission
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data
 * @param {Array} clubPlayers - Array of all club players
 */
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

    // Validate set scores
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

    // Determine winner automatically from set scores
    const winnerId = setValidation.winnerId === 'A' ? playerAId : playerBId;
    const loserId = winnerId === playerAId ? playerBId : playerAId;
    feedbackEl.textContent = 'Speichere Match-Ergebnis...';

    // Get current match mode
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const matchMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';

    try {
        await addDoc(collection(db, 'matches'), {
            playerAId,
            playerBId,
            playerIds: [playerAId, playerBId], // For match history queries
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

        // Reset match mode dropdown to default and recreate set score input
        const matchModeSelect = document.getElementById('coach-match-mode-select');
        const setScoreLabel = document.getElementById('coach-set-score-label');
        const container = document.getElementById('coach-set-score-container');

        if (matchModeSelect) {
            matchModeSelect.value = 'best-of-5';
        }

        // Recreate set score input with default mode to keep fields and dropdown in sync
        if (container) {
            coachSetScoreInput = createSetScoreInput(container, [], 'best-of-5');
            if (setScoreLabel) {
                setScoreLabel.textContent = 'Satzergebnisse (Best of 5)';
            }
        }

        updateMatchUI(clubPlayers);

        // If this match was entered from a saved pairing, remove that pairing
        if (currentPairingSessionId && currentPairingPlayerAId && currentPairingPlayerBId) {
            // STEP 1: Immediately remove the pairing from DOM (optimistic update - instant visual feedback)
            removePairingFromDOM(
                currentPairingSessionId,
                currentPairingPlayerAId,
                currentPairingPlayerBId
            );

            const userData = JSON.parse(localStorage.getItem('userData'));

            // STEP 2: Remove from Firestore in the background
            try {
                await removePairingFromSession(
                    currentPairingSessionId,
                    currentPairingPlayerAId,
                    currentPairingPlayerBId,
                    db
                );
                console.log('Pairing removed from Firestore');

                // Reset tracking variables
                currentPairingSessionId = null;
                currentPairingPlayerAId = null;
                currentPairingPlayerBId = null;
            } catch (error) {
                console.error('Error removing pairing from Firestore:', error);
                // Even if Firestore fails, the DOM update already happened
                // Reload to show the correct state
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

// Store current handicap data globally for the toggle handler
let currentHandicapData = null;

/**
 * Initializes handicap toggle event listener
 */
export function initializeHandicapToggle() {
    const handicapToggle = document.getElementById('handicap-toggle');
    if (!handicapToggle) return;

    handicapToggle.addEventListener('change', () => {
        if (!coachSetScoreInput || !currentHandicapData) return;

        if (handicapToggle.checked) {
            // Apply handicap
            coachSetScoreInput.setHandicap(currentHandicapData.player, currentHandicapData.points);
        } else {
            // Clear handicap
            coachSetScoreInput.clearHandicap(currentHandicapData.player);
        }
    });
}

/**
 * Updates the match form UI based on selected players
 * @param {Array} clubPlayers - Array of all club players
 */
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
            // Store handicap data for toggle handler
            currentHandicapData = {
                player: handicap.player.id === playerAId ? 'A' : 'B',
                points: handicap.points,
            };

            document.getElementById('handicap-text').textContent =
                `${handicap.player.firstName} startet mit ${handicap.points} Punkten Vorsprung pro Satz.`;
            handicapContainer.classList.remove('hidden');
            handicapToggleContainer.classList.remove('hidden');
            handicapToggleContainer.classList.add('flex');

            // Apply handicap if toggle is checked
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

/**
 * Populates match dropdowns with match-ready players
 * @param {Array} clubPlayers - Array of all club players
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export function populateMatchDropdowns(clubPlayers, currentSubgroupFilter = 'all') {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';

    // Filter by match-ready status (grundlagenCompleted >= 5)
    let matchReadyPlayers = clubPlayers.filter(p => {
        const grundlagen = p.grundlagenCompleted || 0;
        return grundlagen >= 5;
    });

    // Count locked players for warning message
    const lockedPlayers = clubPlayers.filter(p => {
        const grundlagen = p.grundlagenCompleted || 0;
        return grundlagen < 5;
    });

    // Filter by subgroup if not "all"
    if (currentSubgroupFilter !== 'all') {
        matchReadyPlayers = matchReadyPlayers.filter(
            player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );
    }

    // Show warning if not enough match-ready players
    const handicapSuggestion = document.getElementById('handicap-suggestion');
    if (handicapSuggestion) {
        if (matchReadyPlayers.length < 2) {
            let message =
                currentSubgroupFilter !== 'all'
                    ? '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler in dieser Untergruppe müssen Match-bereit sein.</p>'
                    : '<p class="text-sm font-medium text-orange-800">Mindestens zwei Spieler müssen Match-bereit sein.</p>';

            // Add info about locked players
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

/**
 * Loads pending match requests for coach approval
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
export async function loadCoachMatchRequests(userData, db) {
    const container = document.getElementById('coach-pending-requests-list');
    const badge = document.getElementById('coach-match-request-badge');
    if (!container) return;

    console.log('[COACH MATCH REQUESTS] Loading match requests for coach clubId:', userData.clubId);

    // Query for SINGLES requests awaiting coach approval
    const singlesQuery = query(
        collection(db, 'matchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_coach'),
        orderBy('createdAt', 'desc')
    );

    // Query for ALL DOUBLES requests awaiting coach approval
    // We load ALL pending_coach doubles and filter by club in code
    const doublesQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('status', '==', 'pending_coach'),
        orderBy('createdAt', 'desc')
    );

    // Listen to singles and doubles requests
    const unsubscribe1 = onSnapshot(singlesQuery, async singlesSnapshot => {
        const unsubscribe2 = onSnapshot(doublesQuery, async doublesSnapshot => {
            console.log('[COACH MATCH REQUESTS] Snapshots received:');
            console.log('  - Singles:', singlesSnapshot.docs.length);
            console.log('  - Doubles (all pending_coach, before filtering):', doublesSnapshot.docs.length);

            const allRequests = [];

            // Process singles requests
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

            // Process ALL doubles requests and filter by coach's club
            for (const docSnap of doublesSnapshot.docs) {
                const data = docSnap.data();
                console.log('[DOUBLES] Processing request:', docSnap.id);
                console.log('  - clubId:', data.clubId);
                console.log('  - isCrossClub:', data.isCrossClub);
                console.log('  - status:', data.status);

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

                // Check if at least one player is from the coach's club
                const playerClubIds = [
                    p1Data?.clubId,
                    p2Data?.clubId,
                    p3Data?.clubId,
                    p4Data?.clubId,
                ];

                console.log('  - Player club IDs:', playerClubIds);
                console.log('  - Coach club ID:', userData.clubId);
                console.log('  - Match:', playerClubIds.includes(userData.clubId) ? 'YES - Adding to requests' : 'NO - Skipping');

                // Only show to coach if at least one player is from their club
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

            // Sort by createdAt
            allRequests.sort((a, b) => {
                const aTime = a.createdAt?.toMillis?.() || 0;
                const bTime = b.createdAt?.toMillis?.() || 0;
                return bTime - aTime;
            });

            console.log('[COACH MATCH REQUESTS] Total requests to display:', allRequests.length);
            console.log('  - Breakdown by type:', {
                singles: allRequests.filter(r => r.type === 'singles').length,
                doubles: allRequests.filter(r => r.type === 'doubles').length
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

/**
 * Loads and renders processed match requests for coach (approved/rejected)
 */
export async function loadCoachProcessedRequests(userData, db) {
    const container = document.getElementById('coach-processed-requests-list');
    if (!container) return;

    // Query for all requests that are no longer pending_coach
    const requestsQuery = query(
        collection(db, 'matchRequests'),
        where('clubId', '==', userData.clubId),
        orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(requestsQuery, async snapshot => {
        const requests = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();

            // Only include requests that coach has processed (approved or rejected)
            if (data.status === 'approved' || data.status === 'rejected') {
                // Fetch player names
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

/**
 * Renders processed match request cards for coach with "show more" functionality
 */
let showAllCoachProcessed = false; // State for showing all or limited

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

    // Render request cards
    requestsToShow.forEach(request => {
        const card = document.createElement('div');

        // Different styling based on status
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

        // Get coach name who processed the request
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

/**
 * Renders match request cards for coach with "show more" functionality
 */
let showAllCoachRequests = false; // State for showing all or limited

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

    // Render request cards
    requestsToShow.forEach(request => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-gray-200 rounded-lg p-4 shadow-sm';

        const createdDate = formatDate(request.createdAt) || 'Unbekannt';

        let matchTypeTag, playersDisplay, setsDisplay, winnerDisplay, buttonsHtml;

        if (request.type === 'doubles') {
            // Doubles match
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
            // Singles match
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

        // Add event listeners based on type
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

/**
 * Formats sets display for coach
 */
function formatSetsForCoach(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    return `<strong>${winsA}:${winsB}</strong> Sätze (${setsStr})`;
}

/**
 * Gets winner name from set scores
 * Works for all match modes (Best of 3, 5, 7, single set)
 */
function getWinnerName(sets, playerA, playerB) {
    if (!sets || sets.length === 0) return 'Unbekannt';

    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    // Determine winner by who won more sets (works for all match modes)
    if (winsA > winsB) return playerA?.firstName || 'Spieler A';
    if (winsB > winsA) return playerB?.firstName || 'Spieler B';

    // If equal sets won, it's a draw (shouldn't happen in normal matches)
    return 'Unentschieden';
}

/**
 * Approves match request as coach
 */
async function approveCoachRequest(requestId, db, userData) {
    try {
        // First, fetch the request to check its current status
        const requestRef = doc(db, 'matchRequests', requestId);
        const requestSnap = await getDoc(requestRef);

        if (!requestSnap.exists()) {
            console.error('Request not found:', requestId);
            alert('Anfrage nicht gefunden.');
            return;
        }

        const requestData = requestSnap.data();
        console.log('Current request status:', requestData.status);
        console.log('Coach data:', userData);

        if (requestData.status !== 'pending_coach') {
            console.error('Request status is not pending_coach:', requestData.status);
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

/**
 * Rejects match request as coach
 */
async function rejectCoachRequest(requestId, db, userData) {
    const reason = prompt('Grund für die Ablehnung (optional):');

    try {
        // First, fetch the request to check its current status
        const requestRef = doc(db, 'matchRequests', requestId);
        const requestSnap = await getDoc(requestRef);

        if (!requestSnap.exists()) {
            console.error('Request not found:', requestId);
            alert('Anfrage nicht gefunden.');
            return;
        }

        const requestData = requestSnap.data();
        console.log('Current request status:', requestData.status);

        if (requestData.status !== 'pending_coach') {
            console.error('Request status is not pending_coach:', requestData.status);
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

/**
 * Loads and displays all saved pairings from trainingSessions
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 */
export async function loadSavedPairings(db, clubId) {
    const container = document.getElementById('saved-pairings-container');
    if (!container) return;

    try {
        container.innerHTML =
            '<p class="text-center text-gray-500 py-8">Lade gespeicherte Paarungen...</p>';

        // Get all trainingMatches for this club
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

            // Check if there are any pairings in this session
            let hasPairings = false;
            for (const groupName in groups) {
                if (groups[groupName] && groups[groupName].length > 0) {
                    hasPairings = true;
                    break;
                }
            }

            // Skip this session if it has no pairings
            if (!hasPairings) {
                continue;
            }

            // Get session details
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

            // Render all pairings
            for (const groupName in groups) {
                const matches = groups[groupName];

                // Skip empty groups
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

            // Leftover player is no longer displayed (only actual pairings are saved)

            html += `
                    </div>
                </div>
            `;
        }

        // If no pairings were added after filtering, show "no pairings" message
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

/**
 * Formats date from YYYY-MM-DD to DD.MM.YYYY
 */
function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

/**
 * Opens match form with pre-selected players
 */
window.handleEnterResultForPairing = function (
    sessionId,
    playerAId,
    playerBId,
    playerAName,
    playerBName,
    handicapPlayerId,
    handicapPoints
) {
    // Store pairing information to delete after successful match save
    currentPairingSessionId = sessionId;
    currentPairingPlayerAId = playerAId;
    currentPairingPlayerBId = playerBId;

    // Pre-select players in the form
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    if (playerASelect) playerASelect.value = playerAId;
    if (playerBSelect) playerBSelect.value = playerBId;

    // Trigger change events to update handicap
    if (playerASelect) playerASelect.dispatchEvent(new Event('change'));
    if (playerBSelect) playerBSelect.dispatchEvent(new Event('change'));

    // If handicap was used, check the toggle
    if (handicapPlayerId && handicapPoints > 0) {
        const handicapToggle = document.getElementById('handicap-toggle');
        if (handicapToggle) {
            handicapToggle.checked = true;
        }
    }

    // Scroll to match form
    const matchForm = document.getElementById('match-form');
    if (matchForm) {
        matchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    alert('Spieler wurden im Formular vorausgewählt. Bitte gib jetzt das Ergebnis ein.');
};

/**
 * Removes a specific pairing from the DOM immediately (optimistic update)
 * @param {string} sessionId - Session ID
 * @param {string} playerAId - Player A ID
 * @param {string} playerBId - Player B ID
 */
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
                    // Remove this match div
                    matchDiv.remove();

                    // Check if this was the last pairing in the card
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

/**
 * Removes a specific pairing from a training session
 * @param {string} sessionId - Session ID
 * @param {string} playerAId - Player A ID
 * @param {string} playerBId - Player B ID
 * @param {Object} db - Firestore database instance
 */
async function removePairingFromSession(sessionId, playerAId, playerBId, db) {
    try {
        const pairingDoc = await getDoc(doc(db, 'trainingMatches', sessionId));

        if (!pairingDoc.exists()) {
            return;
        }

        const pairingData = pairingDoc.data();
        const groups = pairingData.groups || {};
        let pairingRemoved = false;

        // Find and remove the matching pairing
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

                // If group is now empty, remove it
                if (matches.length === 0) {
                    delete groups[groupName];
                }
                break;
            }
        }

        if (pairingRemoved) {
            // If no groups left, delete the entire document
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

/**
 * Removes a discarded pairing from the DOM immediately
 * @param {string} sessionId - Session ID
 * @param {number} matchIndex - Match index in group
 * @param {string} groupName - Group name
 */
function removeDiscardedPairingFromDOM(sessionId, matchIndex, groupName) {
    const container = document.getElementById('saved-pairings-container');
    if (!container) return;

    // Find all pairing cards
    const pairingCards = container.querySelectorAll('.border.border-gray-200.rounded-lg');

    pairingCards.forEach(card => {
        // Find all match divs within this card
        const matchDivs = card.querySelectorAll('.bg-gray-50.border.border-gray-200.rounded');

        matchDivs.forEach(matchDiv => {
            const discardButton = matchDiv.querySelector('button.bg-red-600');
            if (discardButton) {
                const onclickAttr = discardButton.getAttribute('onclick');
                // Check if this is the right pairing to remove
                if (
                    onclickAttr &&
                    onclickAttr.includes(`'${sessionId}'`) &&
                    onclickAttr.includes(`${matchIndex},`) &&
                    onclickAttr.includes(`'${groupName}'`)
                ) {
                    // Remove this match div
                    matchDiv.remove();

                    // Check if this was the last pairing in the card
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

/**
 * Discards a pairing
 */
window.handleDiscardPairing = async function (sessionId, matchIndex, groupName) {
    if (!confirm('Möchtest du diese Paarung wirklich verwerfen?')) {
        return;
    }

    // STEP 1: Immediately remove from DOM (optimistic update - instant visual feedback)
    removeDiscardedPairingFromDOM(sessionId, matchIndex, groupName);

    // STEP 2: Remove from Firestore in background
    try {
        const { getFirestore } = await import(
            'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js'
        );
        const db = getFirestore();

        // Get current pairings
        const pairingDoc = await getDoc(doc(db, 'trainingMatches', sessionId));

        if (!pairingDoc.exists()) {
            console.log('Pairing document not found in Firestore');
            return;
        }

        const pairingData = pairingDoc.data();
        const groups = pairingData.groups || {};

        // Remove the match from the group
        if (groups[groupName] && groups[groupName][matchIndex]) {
            groups[groupName].splice(matchIndex, 1);

            // If group is now empty, remove it
            if (groups[groupName].length === 0) {
                delete groups[groupName];
            }

            // Update Firestore
            await updateDoc(doc(db, 'trainingMatches', sessionId), {
                groups: groups,
            });

            console.log('Pairing removed from Firestore');
            alert('Paarung wurde verworfen.');
        }
    } catch (error) {
        console.error('Error discarding pairing from Firestore:', error);
        // Even if Firestore fails, the DOM update already happened
        // Reload to show the correct state
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
