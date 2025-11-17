/**
 * Partner Pairing Module
 * Handles partner pairing for exercises and points distribution
 */

import {
    collection,
    doc,
    getDoc,
    writeBatch,
    serverTimestamp,
    increment
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

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
 * @returns {Promise} - Resolves when pairing is complete
 */
export function openPartnerPairingModal(exercise, playerIds, sessionData) {
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

        // Set exercise name
        document.getElementById('pairing-exercise-name').textContent = exercise.name;

        // Render available players
        renderAvailablePlayers();
        renderFormedPairs();
        renderSinglePlayers();

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
            console.log('[Partner Pairing] Setting up confirm button listener');
            // Remove old listener if exists
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            const newConfirmBtn = document.getElementById('confirm-pairing-button');
            newConfirmBtn.addEventListener('click', confirmPairingAndDistributePoints);
        } else {
            console.error('[Partner Pairing] Confirm button not found in DOM!');
        }
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
    checkSinglePlayers();
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

        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="text-yellow-700">👤</span>
                    <span class="font-medium text-gray-900">${player.firstName} ${player.lastName}</span>
                    <span class="text-xs text-yellow-700">(mit Trainer)</span>
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
    checkSinglePlayers();
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
};

/**
 * Confirm pairing and distribute points
 */
async function confirmPairingAndDistributePoints() {
    console.log('[Partner Pairing] Confirm button clicked');
    console.log('[Partner Pairing] Formed pairs:', formedPairs);
    console.log('[Partner Pairing] Single players:', singlePlayers);

    const confirmBtn = document.getElementById('confirm-pairing-button');
    if (!confirmBtn) {
        console.error('[Partner Pairing] Confirm button not found!');
        return;
    }

    confirmBtn.disabled = true;

    // Return pairing data without distributing points immediately
    const pairingData = {
        pairs: formedPairs.map(pair => ({
            player1Id: pair.player1Id,
            player2Id: pair.player2Id,
            result: pair.result
        })),
        singlePlayers: singlePlayers.map(sp => ({
            playerId: sp.playerId,
            result: sp.result
        })),
        exercise: currentExercise
    };

    console.log('[Partner Pairing] Pairing data:', pairingData);
    showPairingFeedback('Paarungen gespeichert!', 'success');

    setTimeout(() => {
        closePairingModal();
        if (resolveCallback) {
            console.log('[Partner Pairing] Calling resolve callback');
            resolveCallback(pairingData);
        }
    }, 500);
}

/**
 * Distribute points for partner exercise
 * @param {Array} pairs - Array of paired players with results
 * @param {Array} singles - Array of single players with results
 * @param {Object} exercise - Exercise object
 * @param {Object} sessionData - Session data
 */
export async function distributePartnerExercisePoints(pairs, singles, exercise, sessionData) {
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

        // Award to player 1
        if (points1 > 0) {
            await awardPointsToPlayer(batch, pair.player1.id, points1, exercise.name, date, subgroupId, subgroupName);
        }

        // Award to player 2
        if (points2 > 0) {
            await awardPointsToPlayer(batch, pair.player2.id, points2, exercise.name, date, subgroupId, subgroupName);
        }
    }

    // Process single players
    for (const single of singles) {
        const points = single.result === 'success' ? maxPoints : 0;
        if (points > 0) {
            await awardPointsToPlayer(batch, single.id, points, exercise.name, date, subgroupId, subgroupName);
        }
    }

    await batch.commit();
    console.log(`[Partner Pairing] Distributed points for ${pairs.length} pairs and ${singles.length} single players`);
}

/**
 * Award points to a player
 */
async function awardPointsToPlayer(batch, playerId, points, exerciseName, date, subgroupId, subgroupName) {
    const playerRef = doc(db, 'users', playerId);

    // Update player points and XP
    batch.update(playerRef, {
        points: increment(points),
        xp: increment(points)
    });

    // Create points history entry
    const pointsHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
    batch.set(pointsHistoryRef, {
        points,
        xp: points,
        eloChange: 0,
        reason: `Training am ${formatDateGerman(date)} - ${subgroupName}: ${exerciseName}`,
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
        reason: `Training am ${formatDateGerman(date)} - ${subgroupName}: ${exerciseName}`,
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
