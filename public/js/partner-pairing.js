/**
 * Exercise Pairing Module
 * Handles player pairing for all table tennis exercises and points distribution
 * All exercises require pairing since table tennis is always played with a partner
 */

import {
    collection,
    doc,
    getDoc,
    writeBatch,
    serverTimestamp,
    increment
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

import { openExerciseSelectionModal } from './session-planning.js';

let db = null;
let currentUserData = null;
let currentExercise = null;
let currentSessionData = null;
let availablePlayers = [];
let selectedPlayers = [];
let formedPairs = [];
let singlePlayers = [];
let resolveCallback = null;

/**
 * Initialize partner pairing module
 */
export function initializePartnerPairing(firestoreInstance, userData) {
    db = firestoreInstance;
    currentUserData = userData;
    setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Event listeners will be set when modal opens
    // to ensure elements are in DOM
}

/**
 * Open partner pairing modal
 * @param {Object} exercise - Exercise object
 * @param {Array} playerIds - Array of present player IDs
 * @param {Object} sessionData - Session data
 * @param {Object} existingPairings - Existing pairing data (optional, for editing)
 * @returns {Promise} - Resolves when pairing is complete
 */
export function openPartnerPairingModal(exercise, playerIds, sessionData, existingPairings = null) {
    return new Promise(async (resolve) => {
        resolveCallback = resolve;
        currentExercise = exercise;
        currentSessionData = sessionData;
        selectedPlayers = [];
        formedPairs = [];
        singlePlayers = [];

        // Load player data
        availablePlayers = [];
        for (const playerId of playerIds) {
            const playerDoc = await getDoc(doc(db, 'users', playerId));
            if (playerDoc.exists()) {
                availablePlayers.push({
                    id: playerId,
                    ...playerDoc.data()
                });
            }
        }

        // Load existing pairings if provided (for editing)
        if (existingPairings) {
            console.log('[Exercise Pairing] Loading existing pairings:', existingPairings);

            // Load formed pairs
            if (existingPairings.pairs && existingPairings.pairs.length > 0) {
                existingPairings.pairs.forEach(pairData => {
                    const player1 = availablePlayers.find(p => p.id === pairData.player1Id);
                    const player2 = availablePlayers.find(p => p.id === pairData.player2Id);

                    if (player1 && player2) {
                        formedPairs.push({
                            player1: player1,
                            player2: player2,
                            result: pairData.result
                        });
                    }
                });
            }

            // Load single players
            if (existingPairings.singlePlayers && existingPairings.singlePlayers.length > 0) {
                existingPairings.singlePlayers.forEach(singleData => {
                    const player = availablePlayers.find(p => p.id === singleData.playerId);

                    if (player) {
                        singlePlayers.push({
                            ...player,
                            result: singleData.result,
                            customExercise: singleData.customExercise || null // Load custom exercise if exists
                        });
                    }
                });
            }

            console.log('[Exercise Pairing] Loaded pairs:', formedPairs);
            console.log('[Exercise Pairing] Loaded singles:', singlePlayers);
        }

        // Set exercise name
        document.getElementById('pairing-exercise-name').textContent = exercise.name;

        // Render available players
        renderAvailablePlayers();
        renderFormedPairs();
        renderSinglePlayers();
        renderSinglePlayerOption();

        // Show modal
        const modal = document.getElementById('partner-pairing-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Setup event listeners now that modal is in DOM
        const closeBtn = document.getElementById('close-partner-pairing-modal-button');
        if (closeBtn) {
            // Remove old listener if exists
            closeBtn.replaceWith(closeBtn.cloneNode(true));
            const newCloseBtn = document.getElementById('close-partner-pairing-modal-button');
            newCloseBtn.addEventListener('click', closePairingModal);
        }

        const confirmBtn = document.getElementById('confirm-pairing-button');
        if (confirmBtn) {
            console.log('[Exercise Pairing] Setting up confirm button listener');
            // Remove old listener if exists
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            const newConfirmBtn = document.getElementById('confirm-pairing-button');
            newConfirmBtn.addEventListener('click', confirmPairingAndDistributePoints);
        } else {
            console.error('[Exercise Pairing] Confirm button not found in DOM!');
        }

        // Update button state initially
        updateConfirmButtonState();
    });
}

/**
 * Render available players
 */
function renderAvailablePlayers() {
    const container = document.getElementById('available-players-list');
    if (!container) return;

    // Filter out players that are already paired or single
    const pairedPlayerIds = formedPairs.flatMap(p => [p.player1.id, p.player2.id]);
    const singlePlayerIds = singlePlayers.map(p => p.id);
    const available = availablePlayers.filter(p =>
        !pairedPlayerIds.includes(p.id) && !singlePlayerIds.includes(p.id)
    );

    if (available.length === 0) {
        container.innerHTML = '<p class="col-span-full text-xs text-gray-400 text-center py-4">Alle Spieler zugewiesen</p>';
        return;
    }

    container.innerHTML = '';
    available.forEach(player => {
        const isSelected = selectedPlayers.find(p => p.id === player.id);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `p-3 rounded-lg border-2 text-sm font-medium transition ${
            isSelected
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-300 bg-white text-gray-700 hover:border-indigo-300'
        }`;
        button.textContent = `${player.firstName} ${player.lastName}`;
        button.onclick = () => handlePlayerClick(player);
        container.appendChild(button);
    });
}

/**
 * Handle player click
 */
function handlePlayerClick(player) {
    const isSelected = selectedPlayers.find(p => p.id === player.id);

    if (isSelected) {
        // Deselect
        selectedPlayers = selectedPlayers.filter(p => p.id !== player.id);
    } else {
        // Select
        selectedPlayers.push(player);

        // If 2 players selected, form a pair
        if (selectedPlayers.length === 2) {
            formedPairs.push({
                player1: selectedPlayers[0],
                player2: selectedPlayers[1],
                result: 'both_success' // Default
            });
            selectedPlayers = [];
        }
    }

    renderAvailablePlayers();
    renderFormedPairs();
    renderSinglePlayerOption();
    checkSinglePlayers();
    updateConfirmButtonState();
}

/**
 * Add selected player as single player (training alone)
 */
window.addAsSinglePlayer = function() {
    if (selectedPlayers.length !== 1) return;

    const player = selectedPlayers[0];

    // Show exercise selection options
    showSinglePlayerExerciseSelection(player);
}

/**
 * Show exercise selection for single player
 */
function showSinglePlayerExerciseSelection(player) {
    const container = document.getElementById('single-player-option-container');
    if (!container) return;

    container.innerHTML = `
        <div class="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-sm font-medium text-gray-900 mb-3">
                ${player.firstName} ${player.lastName} trainiert alleine
            </p>
            <p class="text-xs text-gray-600 mb-3">Welche Übung soll durchgeführt werden?</p>
            <div class="space-y-2">
                <button
                    type="button"
                    class="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white font-medium text-sm rounded"
                    onclick="window.confirmSinglePlayerWithExercise(null)"
                >
                    <i class="fas fa-check mr-2"></i> Gleiche Übung wie alle
                </button>
                <button
                    type="button"
                    class="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded"
                    onclick="window.selectDifferentExerciseForSinglePlayer()"
                >
                    <i class="fas fa-list mr-2"></i> Andere Übung auswählen
                </button>
                <button
                    type="button"
                    class="w-full px-3 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium text-sm rounded"
                    onclick="window.cancelSinglePlayerSelection()"
                >
                    <i class="fas fa-times mr-2"></i> Abbrechen
                </button>
            </div>
        </div>
    `;
}

/**
 * Confirm single player with exercise (null = same exercise)
 */
window.confirmSinglePlayerWithExercise = function(customExercise) {
    if (selectedPlayers.length !== 1) return;

    const player = selectedPlayers[0];
    singlePlayers.push({
        ...player,
        result: 'success', // Default
        customExercise: customExercise // null = same exercise, otherwise custom exercise object
    });
    selectedPlayers = [];

    renderAvailablePlayers();
    renderSinglePlayers();
    renderSinglePlayerOption();
    checkSinglePlayers();
    updateConfirmButtonState();
}

/**
 * Cancel single player selection
 */
window.cancelSinglePlayerSelection = function() {
    renderSinglePlayerOption();
}

/**
 * Select different exercise for single player
 */
window.selectDifferentExerciseForSinglePlayer = function() {
    // Save the player reference before opening modal
    const playerToAdd = selectedPlayers[0];
    if (!playerToAdd) {
        console.log('[Exercise Pairing] No player selected');
        return;
    }

    console.log('[Exercise Pairing] Opening exercise modal for player:', playerToAdd.firstName, playerToAdd.lastName);

    // Track if callback was called
    let exerciseSelected = false;

    // Open exercise selection modal with callback
    // NOTE: The callback receives already formatted exercise objects: {exerciseId, name, points, tieredPoints}
    openExerciseSelectionModal((exercise) => {
        console.log('[Exercise Pairing] Modal callback triggered with exercise:', exercise);

        if (exercise) {
            console.log('[Exercise Pairing] Selected exercise:', exercise.name, 'Points:', exercise.points);

            // Exercise is already in the correct format from toggleExerciseSelection
            const customExercise = {
                exerciseId: exercise.exerciseId,
                name: exercise.name,
                points: exercise.points || 0,
                tieredPoints: exercise.tieredPoints || false
            };

            // Add player to single players with custom exercise
            singlePlayers.push({
                ...playerToAdd,
                result: 'success', // Default
                customExercise: customExercise
            });

            console.log('[Exercise Pairing] Single players after adding:', singlePlayers.length);
            console.log('[Exercise Pairing] Custom exercise:', customExercise);

            // Remove from selected players
            const index = selectedPlayers.indexOf(playerToAdd);
            if (index > -1) {
                selectedPlayers.splice(index, 1);
            }

            // Update UI
            console.log('[Exercise Pairing] Updating UI...');
            renderAvailablePlayers();
            renderSinglePlayers();
            renderSinglePlayerOption();
            checkSinglePlayers();
            updateConfirmButtonState();
            console.log('[Exercise Pairing] UI updated');
        }
    });
}

/**
 * Render single player option button (when exactly 1 player is selected)
 */
function renderSinglePlayerOption() {
    const container = document.getElementById('single-player-option-container');
    if (!container) return;

    if (selectedPlayers.length === 1) {
        const player = selectedPlayers[0];
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p class="text-sm text-gray-700 mb-2">
                    <strong>${player.firstName} ${player.lastName}</strong> ausgewählt
                </p>
                <button
                    type="button"
                    class="w-full px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white font-medium text-sm rounded"
                    onclick="window.addAsSinglePlayer()"
                >
                    <i class="fas fa-user-check mr-2"></i> Alleine trainieren
                </button>
            </div>
        `;
    } else {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
}

/**
 * Render formed pairs
 */
function renderFormedPairs() {
    const container = document.getElementById('formed-pairs-list');
    if (!container) return;

    if (formedPairs.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Noch keine Paare gebildet</p>';
        return;
    }

    container.innerHTML = '';
    formedPairs.forEach((pair, index) => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-gray-50 border border-gray-200 rounded-lg';

        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900">${pair.player1.firstName} ${pair.player1.lastName}</span>
                    <span class="text-gray-400">↔</span>
                    <span class="font-medium text-gray-900">${pair.player2.firstName} ${pair.player2.lastName}</span>
                </div>
                <button type="button" class="text-red-600 hover:text-red-800 text-sm" onclick="window.removePair(${index})">
                    <i class="fas fa-times"></i> Aufheben
                </button>
            </div>
            <div class="flex gap-2">
                <button type="button" class="flex-1 px-3 py-2 text-xs rounded ${pair.result === 'both_success' ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}" onclick="window.setPairResult(${index}, 'both_success')">
                    ✓ Beide geschafft (100%)
                </button>
                <button type="button" class="flex-1 px-3 py-2 text-xs rounded ${pair.result === 'one_success' ? 'bg-yellow-500 text-white' : 'bg-white border border-gray-300 text-gray-700'}" onclick="window.setPairResult(${index}, 'one_success')">
                    ½ Nur einer (50%)
                </button>
                <button type="button" class="flex-1 px-3 py-2 text-xs rounded ${pair.result === 'both_fail' ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}" onclick="window.setPairResult(${index}, 'both_fail')">
                    ✗ Nicht geschafft (0%)
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

/**
 * Check if there's a single player left
 */
function checkSinglePlayers() {
    const pairedPlayerIds = formedPairs.flatMap(p => [p.player1.id, p.player2.id]);
    const available = availablePlayers.filter(p =>
        !pairedPlayerIds.includes(p.id) && !singlePlayers.find(sp => sp.id === p.id)
    );

    // Auto-assign single player if only one left
    if (available.length === 1 && selectedPlayers.length === 0) {
        singlePlayers.push({
            ...available[0],
            result: 'success' // Default
        });
        renderAvailablePlayers();
        renderSinglePlayers();
    }
}

/**
 * Render single players
 */
function renderSinglePlayers() {
    const container = document.getElementById('single-players-list');
    const wrapperContainer = document.getElementById('single-players-container');
    if (!container || !wrapperContainer) return;

    if (singlePlayers.length === 0) {
        wrapperContainer.classList.add('hidden');
        return;
    }

    wrapperContainer.classList.remove('hidden');
    container.innerHTML = '';

    singlePlayers.forEach((player, index) => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-yellow-50 border border-yellow-200 rounded-lg';

        // Check if player has custom exercise
        const exerciseInfo = player.customExercise
            ? `<span class="text-xs text-blue-700 block mt-1">📝 Übung: ${player.customExercise.name} (+${player.customExercise.points} Pkt)</span>`
            : `<span class="text-xs text-gray-600 block mt-1">📝 Gleiche Übung wie alle</span>`;

        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="text-yellow-700">👤</span>
                        <span class="font-medium text-gray-900">${player.firstName} ${player.lastName}</span>
                        <span class="text-xs text-yellow-700">(alleine)</span>
                    </div>
                    ${exerciseInfo}
                </div>
                <button type="button" class="text-red-600 hover:text-red-800 text-sm" onclick="window.removeSinglePlayer(${index})">
                    <i class="fas fa-times"></i> Entfernen
                </button>
            </div>
            <div class="flex gap-2">
                <button type="button" class="flex-1 px-3 py-2 text-xs rounded ${player.result === 'success' ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}" onclick="window.setSinglePlayerResult(${index}, 'success')">
                    ✓ Geschafft (100%)
                </button>
                <button type="button" class="flex-1 px-3 py-2 text-xs rounded ${player.result === 'fail' ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}" onclick="window.setSinglePlayerResult(${index}, 'fail')">
                    ✗ Nicht geschafft (0%)
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

/**
 * Set pair result
 */
window.setPairResult = function(index, result) {
    formedPairs[index].result = result;
    renderFormedPairs();
};

/**
 * Remove pair
 */
window.removePair = function(index) {
    formedPairs.splice(index, 1);
    renderAvailablePlayers();
    renderFormedPairs();
    renderSinglePlayerOption();
    checkSinglePlayers();
    updateConfirmButtonState();
};

/**
 * Set single player result
 */
window.setSinglePlayerResult = function(index, result) {
    singlePlayers[index].result = result;
    renderSinglePlayers();
};

/**
 * Remove single player
 */
window.removeSinglePlayer = function(index) {
    singlePlayers.splice(index, 1);
    renderAvailablePlayers();
    renderSinglePlayers();
    renderSinglePlayerOption();
    updateConfirmButtonState();
};

/**
 * Update confirm button state based on whether all players are assigned
 */
function updateConfirmButtonState() {
    const confirmBtn = document.getElementById('confirm-pairing-button');
    if (!confirmBtn) return;

    // Count assigned players
    const pairedPlayersCount = formedPairs.length * 2;
    const singlePlayersCount = singlePlayers.length;
    const assignedPlayersCount = pairedPlayersCount + singlePlayersCount;

    // Count total players
    const totalPlayers = availablePlayers.length;
    const remainingPlayers = totalPlayers - assignedPlayersCount;

    console.log('[Exercise Pairing] Total players:', totalPlayers);
    console.log('[Exercise Pairing] Assigned players:', assignedPlayersCount);
    console.log('[Exercise Pairing] Remaining players:', remainingPlayers);

    // Update button state
    if (remainingPlayers === 0 && assignedPlayersCount > 0) {
        // All players assigned - enable button
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        confirmBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        confirmBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Paarungen bestätigen';
    } else {
        // Not all players assigned - disable button
        confirmBtn.disabled = true;
        confirmBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        confirmBtn.classList.add('bg-gray-400', 'cursor-not-allowed');

        if (remainingPlayers > 0) {
            confirmBtn.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i> Noch ${remainingPlayers} Spieler nicht zugeordnet`;
        } else {
            confirmBtn.innerHTML = '<i class="fas fa-users mr-2"></i> Bitte Paarungen bilden';
        }
    }
}

/**
 * Confirm pairing and distribute points
 */
async function confirmPairingAndDistributePoints() {
    console.log('[Exercise Pairing] Confirm button clicked');
    console.log('[Exercise Pairing] Formed pairs:', formedPairs);
    console.log('[Exercise Pairing] Single players:', singlePlayers);

    const confirmBtn = document.getElementById('confirm-pairing-button');
    if (!confirmBtn) {
        console.error('[Exercise Pairing] Confirm button not found!');
        return;
    }

    // Validate all players are assigned
    const pairedPlayersCount = formedPairs.length * 2;
    const singlePlayersCount = singlePlayers.length;
    const assignedPlayersCount = pairedPlayersCount + singlePlayersCount;
    const totalPlayers = availablePlayers.length;

    if (assignedPlayersCount !== totalPlayers) {
        showPairingFeedback(`Bitte alle ${totalPlayers} Spieler zuordnen!`, 'error');
        return;
    }

    confirmBtn.disabled = true;

    // Return pairing data without distributing points immediately
    const pairingData = {
        pairs: formedPairs.map(pair => ({
            player1Id: pair.player1.id,
            player2Id: pair.player2.id,
            result: pair.result
        })),
        singlePlayers: singlePlayers.map(sp => ({
            playerId: sp.id,
            result: sp.result,
            customExercise: sp.customExercise || null // Save custom exercise if exists
        })),
        exercise: currentExercise
    };

    console.log('[Exercise Pairing] Pairing data:', pairingData);
    showPairingFeedback('Paarungen gespeichert!', 'success');

    setTimeout(() => {
        closePairingModal();
        if (resolveCallback) {
            console.log('[Exercise Pairing] Calling resolve callback');
            resolveCallback(pairingData);
        }
    }, 500);
}

/**
 * Distribute points for exercise based on pairing results
 * All table tennis exercises are played with partners
 * @param {Array} pairs - Array of paired players with results
 * @param {Array} singles - Array of single players (with trainer) with results
 * @param {Object} exercise - Exercise object
 * @param {Object} sessionData - Session data
 */
export async function distributeExercisePoints(pairs, singles, exercise, sessionData) {
    const batch = writeBatch(db);
    const date = sessionData.date;
    const subgroupId = sessionData.subgroupId;

    // Get subgroup name
    const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
    const subgroupName = subgroupDoc.exists() ? subgroupDoc.data().name : subgroupId;

    const maxPoints = exercise.points || 0;

    // Process pairs
    for (const pair of pairs) {
        let points1, points2;

        switch (pair.result) {
            case 'both_success':
                points1 = maxPoints;
                points2 = maxPoints;
                break;
            case 'one_success':
                points1 = Math.floor(maxPoints * 0.5);
                points2 = Math.floor(maxPoints * 0.5);
                break;
            case 'both_fail':
                points1 = 0;
                points2 = 0;
                break;
        }

        // Extract player IDs (handle both formats: {player1: {id}} and {player1Id})
        const player1Id = pair.player1?.id || pair.player1Id;
        const player2Id = pair.player2?.id || pair.player2Id;

        // Determine success rate for history (only for awarded points)
        const successRate = pair.result === 'both_success' ? '100%' : '50%';

        // Award to player 1
        if (points1 > 0 && player1Id) {
            await awardPointsToPlayer(batch, player1Id, points1, exercise.name, date, subgroupId, subgroupName, successRate);
        }

        // Award to player 2
        if (points2 > 0 && player2Id) {
            await awardPointsToPlayer(batch, player2Id, points2, exercise.name, date, subgroupId, subgroupName, successRate);
        }
    }

    // Process single players
    for (const single of singles) {
        const points = single.result === 'success' ? maxPoints : 0;
        // Extract player ID (handle both formats: {id} and {playerId})
        const playerId = single.id || single.playerId;

        // Check if player has custom exercise
        const customExercise = single.customExercise;
        const exerciseToUse = customExercise || exercise;
        const customPoints = customExercise ? (single.result === 'success' ? customExercise.points : 0) : points;

        if (customPoints > 0 && playerId) {
            // Single players always get 100% when successful (they only get points when they succeed)
            await awardPointsToPlayer(batch, playerId, customPoints, exerciseToUse.name, date, subgroupId, subgroupName, '100%');
        }
    }

    await batch.commit();
    console.log(`[Exercise Pairing] Distributed points for ${pairs.length} pairs and ${singles.length} single players`);
}

/**
 * Award points to a player
 * @param {string} successRate - Success rate indicator (e.g., "100%", "50%")
 */
async function awardPointsToPlayer(batch, playerId, points, exerciseName, date, subgroupId, subgroupName, successRate) {
    const playerRef = doc(db, 'users', playerId);

    // Update player points and XP
    batch.update(playerRef, {
        points: increment(points),
        xp: increment(points)
    });

    // Create reason string with success rate
    const reason = `Training am ${formatDateGerman(date)} - ${subgroupName}: ${exerciseName} (${successRate})`;

    // Create points history entry
    const pointsHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
    batch.set(pointsHistoryRef, {
        points,
        xp: points,
        eloChange: 0,
        reason,
        timestamp: serverTimestamp(),
        date,
        subgroupId,
        awardedBy: `Coach: ${currentUserData.firstName} ${currentUserData.lastName}`,
        sessionId: currentSessionData.id
    });

    // Create XP history entry
    const xpHistoryRef = doc(collection(db, `users/${playerId}/xpHistory`));
    batch.set(xpHistoryRef, {
        xp: points,
        reason,
        timestamp: serverTimestamp(),
        date,
        subgroupId,
        awardedBy: `Coach: ${currentUserData.firstName} ${currentUserData.lastName}`,
        sessionId: currentSessionData.id
    });
}

/**
 * Format date
 */
function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

/**
 * Show feedback
 */
function showPairingFeedback(message, type) {
    const feedbackElement = document.getElementById('pairing-feedback');
    if (!feedbackElement) return;

    feedbackElement.textContent = message;
    feedbackElement.className = 'mt-3 text-sm font-medium text-center';

    if (type === 'success') {
        feedbackElement.classList.add('text-green-600');
    } else if (type === 'error') {
        feedbackElement.classList.add('text-red-600');
    } else {
        feedbackElement.classList.add('text-gray-600');
    }
}

/**
 * Close pairing modal
 */
function closePairingModal() {
    const modal = document.getElementById('partner-pairing-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // Reset state
    selectedPlayers = [];
    formedPairs = [];
    singlePlayers = [];
    currentExercise = null;

    // Clear feedback
    const feedbackElement = document.getElementById('pairing-feedback');
    if (feedbackElement) feedbackElement.textContent = '';
}
