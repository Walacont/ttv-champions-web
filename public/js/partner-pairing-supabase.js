/**
 * Exercise Pairing Module (Supabase Version)
 * Handles player pairing for all table tennis exercises and points distribution
 * All exercises require pairing since table tennis is always played with a partner
 */

import { openExerciseSelectionModal } from './session-planning-supabase.js';

let supabaseClient = null;
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
export function initializePartnerPairing(supabaseInstance, userData) {
    supabaseClient = supabaseInstance;
    currentUserData = userData;
    setupEventListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Event-Listener werden gesetzt wenn Modal öffnet
    // to ensure elements are in DOM
}

/**
 * Open partner pairing modal
 * @param {Object} exercise - Übungs-Objekt
 * @param {Array} playerIds - Array anwesender Spieler-IDs
 * @param {Object} sessionData - Session-Daten
 * @param {Object} existingPairings - Bestehende Paarungs-Daten (optional, zum Bearbeiten)
 * @returns {Promise} - Resolves when pairing is complete
 */
export function openPartnerPairingModal(exercise, playerIds, sessionData, existingPairings = null) {
    return new Promise(async resolve => {
        resolveCallback = resolve;
        currentExercise = exercise;
        currentSessionData = sessionData;
        selectedPlayers = [];
        formedPairs = [];
        singlePlayers = [];

        // Spielerdaten laden
        availablePlayers = [];
        for (const playerId of playerIds) {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('id, first_name, last_name, role, xp, points, elo_rating')
                .eq('id', playerId)
                .single();

            if (!error && data) {
                availablePlayers.push({
                    id: data.id,
                    firstName: data.first_name,
                    lastName: data.last_name,
                    role: data.role,
                    xp: data.xp,
                    points: data.points,
                    eloRating: data.elo_rating
                });
            }
        }

        // Bestehende Paarungen laden falls vorhanden (zum Bearbeiten)
        if (existingPairings) {
            console.log('[Exercise Pairing] Loading existing pairings:', existingPairings);

            // Gebildete Paare laden
            if (existingPairings.pairs && existingPairings.pairs.length > 0) {
                existingPairings.pairs.forEach(pairData => {
                    const player1 = availablePlayers.find(p => p.id === pairData.player1Id);
                    const player2 = availablePlayers.find(p => p.id === pairData.player2Id);

                    if (player1 && player2) {
                        formedPairs.push({
                            player1: player1,
                            player2: player2,
                            result: pairData.result,
                        });
                    }
                });
            }

            // Einzelspieler laden
            if (existingPairings.singlePlayers && existingPairings.singlePlayers.length > 0) {
                existingPairings.singlePlayers.forEach(singleData => {
                    const player = availablePlayers.find(p => p.id === singleData.playerId);

                    if (player) {
                        singlePlayers.push({
                            ...player,
                            result: singleData.result,
                            customExercise: singleData.customExercise || null, // Benutzerdefinierte Übung laden falls vorhanden
                        });
                    }
                });
            }

            console.log('[Exercise Pairing] Loaded pairs:', formedPairs);
            console.log('[Exercise Pairing] Loaded singles:', singlePlayers);
        }

        // Übungsname setzen
        document.getElementById('pairing-exercise-name').textContent = exercise.name;

        // Verfügbare Spieler rendern
        renderAvailablePlayers();
        renderFormedPairs();
        renderSinglePlayers();
        renderSinglePlayerOption();

        // Modal anzeigen
        const modal = document.getElementById('partner-pairing-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        // Event-Listener einrichten jetzt da Modal im DOM ist
        const closeBtn = document.getElementById('close-partner-pairing-modal-button');
        if (closeBtn) {
            // Alten Listener entfernen falls vorhanden
            closeBtn.replaceWith(closeBtn.cloneNode(true));
            const newCloseBtn = document.getElementById('close-partner-pairing-modal-button');
            newCloseBtn.addEventListener('click', closePairingModal);
        }

        const confirmBtn = document.getElementById('confirm-pairing-button');
        if (confirmBtn) {
            console.log('[Exercise Pairing] Setting up confirm button listener');
            // Alten Listener entfernen falls vorhanden
            confirmBtn.replaceWith(confirmBtn.cloneNode(true));
            const newConfirmBtn = document.getElementById('confirm-pairing-button');
            newConfirmBtn.addEventListener('click', confirmPairingAndDistributePoints);
        } else {
            console.error('[Exercise Pairing] Confirm button not found in DOM!');
        }

        // Button-Status initial aktualisieren
        updateConfirmButtonState();
    });
}

/**
 * Render available players
 */
function renderAvailablePlayers() {
    const container = document.getElementById('available-players-list');
    if (!container) return;

    // Spieler herausfiltern die bereits gepaart oder einzeln sind
    const pairedPlayerIds = formedPairs.flatMap(p => [p.player1.id, p.player2.id]);
    const singlePlayerIds = singlePlayers.map(p => p.id);
    const available = availablePlayers.filter(
        p => !pairedPlayerIds.includes(p.id) && !singlePlayerIds.includes(p.id)
    );

    console.log(
        '[Exercise Pairing] Rendering available players:',
        available.length,
        'Current single players:',
        singlePlayers.length
    );

    if (available.length === 0) {
        container.innerHTML =
            '<p class="col-span-full text-xs text-gray-400 text-center py-4">Alle Spieler zugewiesen</p>';
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
    console.log('[Exercise Pairing] Player clicked:', player.firstName, player.lastName);

    const isSelected = selectedPlayers.find(p => p.id === player.id);

    if (isSelected) {
        // Deselect
        console.log('[Exercise Pairing] Deselecting player');
        selectedPlayers = selectedPlayers.filter(p => p.id !== player.id);
    } else {
        // Select
        console.log('[Exercise Pairing] Selecting player');
        selectedPlayers.push(player);

        // Falls 2 Spieler ausgewählt, Paar bilden
        if (selectedPlayers.length === 2) {
            console.log('[Exercise Pairing] Forming pair automatically');
            formedPairs.push({
                player1: selectedPlayers[0],
                player2: selectedPlayers[1],
                result: 'both_success', // Standard
            });
            selectedPlayers = [];
        }
    }

    console.log('[Exercise Pairing] Selected players count:', selectedPlayers.length);
    renderAvailablePlayers();
    renderFormedPairs();
    renderSinglePlayerOption();
    checkSinglePlayers();
    updateConfirmButtonState();
}

/**
 * Add selected player as single player (training alone)
 */
window.addAsSinglePlayer = function () {
    if (selectedPlayers.length !== 1) return;

    const player = selectedPlayers[0];

    // Übungsauswahl-Optionen anzeigen
    showSinglePlayerExerciseSelection(player);
};

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
window.confirmSinglePlayerWithExercise = function (customExercise) {
    if (selectedPlayers.length !== 1) return;

    const player = selectedPlayers[0];
    singlePlayers.push({
        ...player,
        result: 'success', // Standard
        customExercise: customExercise, // null = same exercise, otherwise custom exercise object
    });
    selectedPlayers = [];

    renderAvailablePlayers();
    renderSinglePlayers();
    renderSinglePlayerOption();
    checkSinglePlayers();
    updateConfirmButtonState();
};

/**
 * Cancel single player selection
 */
window.cancelSinglePlayerSelection = function () {
    renderSinglePlayerOption();
};

/**
 * Select different exercise for single player
 */
window.selectDifferentExerciseForSinglePlayer = function () {
    // Spieler-Referenz vor Modal-Öffnung speichern
    const playerToAdd = selectedPlayers[0];
    if (!playerToAdd) {
        console.log('[Exercise Pairing] No player selected');
        return;
    }

    console.log(
        '[Exercise Pairing] Opening exercise modal for player:',
        playerToAdd.firstName,
        playerToAdd.lastName
    );

    // Verfolgen ob Spieler bereits hinzugefügt wurde (Callback wird für JEDE ausgewählte Übung aufgerufen)
    let playerAlreadyAdded = false;

    // Übungsauswahl-Modal mit Callback öffnen
    // NOTE: The callback is called ONCE PER SELECTED EXERCISE (can be called multiple times!)
    // Wir wollen nur die ERSTE Übung verwenden und den Spieler nur EINMAL hinzufügen
    openExerciseSelectionModal(exercise => {
        console.log('[Exercise Pairing] Modal callback triggered with exercise:', exercise);

        // Nur erste Übung verarbeiten, nachfolgende Aufrufe ignorieren
        if (exercise && !playerAlreadyAdded) {
            playerAlreadyAdded = true; // Als hinzugefügt markieren um Duplikate zu verhindern

            console.log(
                '[Exercise Pairing] Selected exercise:',
                exercise.name,
                'Points:',
                exercise.points
            );

            // Übung ist bereits im korrekten Format von toggleExerciseSelection
            const customExercise = {
                exerciseId: exercise.exerciseId,
                name: exercise.name,
                points: exercise.points || 0,
                tieredPoints: exercise.tieredPoints || false,
            };

            // Spieler zu Einzelspielern mit benutzerdefinierter Übung hinzufügen
            singlePlayers.push({
                ...playerToAdd,
                result: 'success', // Standard
                customExercise: customExercise,
            });

            console.log('[Exercise Pairing] Single players after adding:', singlePlayers.length);
            console.log('[Exercise Pairing] Custom exercise:', customExercise);

            // Aus ausgewählten Spielern entfernen
            const index = selectedPlayers.indexOf(playerToAdd);
            if (index > -1) {
                selectedPlayers.splice(index, 1);
            }

            // UI aktualisieren
            console.log('[Exercise Pairing] Updating UI...');
            renderAvailablePlayers();
            renderSinglePlayers();
            renderSinglePlayerOption();
            checkSinglePlayers();
            updateConfirmButtonState();
            console.log('[Exercise Pairing] UI updated');
        } else if (playerAlreadyAdded) {
            console.log(
                '[Exercise Pairing] Ignoring additional exercise callback - player already added'
            );
        }
    });
};

/**
 * Render single player option button (when exactly 1 player is selected)
 */
function renderSinglePlayerOption() {
    const container = document.getElementById('single-player-option-container');
    if (!container) {
        console.log('[Exercise Pairing] single-player-option-container not found!');
        return;
    }

    console.log(
        '[Exercise Pairing] renderSinglePlayerOption - selectedPlayers:',
        selectedPlayers.length
    );

    if (selectedPlayers.length === 1) {
        const player = selectedPlayers[0];
        console.log(
            '[Exercise Pairing] Showing "Alleine trainieren" option for:',
            player.firstName,
            player.lastName
        );
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
        console.log('[Exercise Pairing] Hiding "Alleine trainieren" option');
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
        container.innerHTML =
            '<p class="text-xs text-gray-400 text-center py-4">Noch keine Paare gebildet</p>';
        return;
    }

    const isMilestoneExercise = currentExercise?.tieredPoints;

    container.innerHTML = '';
    formedPairs.forEach((pair, index) => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-gray-50 border border-gray-200 rounded-lg';

        // Meilenstein-Auswahl (für Meilenstein-Übungen und erfolgreiche Ergebnisse)
        const showMilestoneSelect =
            isMilestoneExercise &&
            (pair.result === 'both_success' || pair.result === 'one_success');
        let milestoneSelect = '';

        if (showMilestoneSelect && currentExercise.tieredPoints?.milestones) {
            const milestones = currentExercise.tieredPoints.milestones.sort(
                (a, b) => a.completions - b.completions
            );
            const selectedMilestone = pair.milestoneIndex ?? 0;

            milestoneSelect = `
                <div class="mt-3 pt-3 border-t border-gray-300">
                    <label class="block text-xs font-medium text-gray-700 mb-2">📊 Erreichter Meilenstein:</label>
                    <select
                        onchange="window.setPairMilestone(${index}, parseInt(this.value))"
                        class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        ${milestones
                            .map((milestone, mIndex) => {
                                const cumulativePoints = milestones
                                    .slice(0, mIndex + 1)
                                    .reduce((sum, m) => sum + m.points, 0);
                                return `<option value="${mIndex}" ${mIndex === selectedMilestone ? 'selected' : ''}>
                                ${milestone.completions}× erreicht → ${milestone.points} Pkt (gesamt: ${cumulativePoints} Pkt)
                            </option>`;
                            })
                            .join('')}
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Wähle den höchsten erreichten Meilenstein aus</p>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="font-medium text-gray-900">${pair.player1.firstName} ${pair.player1.lastName}</span>
                    <span class="text-gray-400">↔</span>
                    <span class="font-medium text-gray-900">${pair.player2.firstName} ${pair.player2.lastName}</span>
                    ${isMilestoneExercise ? '<span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-2">📊 Meilenstein</span>' : ''}
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
            ${milestoneSelect}
        `;
        container.appendChild(div);
    });
}

/**
 * Check if there's a single player left
 */
function checkSinglePlayers() {
    const pairedPlayerIds = formedPairs.flatMap(p => [p.player1.id, p.player2.id]);
    const available = availablePlayers.filter(
        p => !pairedPlayerIds.includes(p.id) && !singlePlayers.find(sp => sp.id === p.id)
    );

    // Einzelnen Spieler automatisch zuweisen wenn nur noch einer übrig
    if (available.length === 1 && selectedPlayers.length === 0) {
        singlePlayers.push({
            ...available[0],
            result: 'success', // Standard
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

        // Prüfen ob Spieler benutzerdefinierte Übung hat
        const exerciseInfo = player.customExercise
            ? `<span class="text-xs text-blue-700 block mt-1">📝 Übung: ${player.customExercise.name} (+${player.customExercise.points} Pkt)</span>`
            : `<span class="text-xs text-gray-600 block mt-1">📝 Gleiche Übung wie alle</span>`;

        // Bestimmen ob diese spezifische Spieler-Übung ein Meilenstein ist
        const playerExerciseMilestone =
            player.customExercise?.tieredPoints || currentExercise?.tieredPoints;

        // Meilensteine für Spieler-Übung abrufen
        let milestoneSelect = '';
        if (playerExerciseMilestone && player.result === 'success') {
            const exerciseMilestones =
                player.customExercise?.tieredPoints?.milestones ||
                currentExercise?.tieredPoints?.milestones;

            if (exerciseMilestones && exerciseMilestones.length > 0) {
                const milestones = exerciseMilestones.sort((a, b) => a.completions - b.completions);
                const selectedMilestone = player.milestoneIndex ?? 0;

                milestoneSelect = `
                    <div class="mt-3 pt-3 border-t border-yellow-300">
                        <label class="block text-xs font-medium text-gray-700 mb-2">📊 Erreichter Meilenstein:</label>
                        <select
                            onchange="window.setSinglePlayerMilestone(${index}, parseInt(this.value))"
                            class="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            ${milestones
                                .map((milestone, mIndex) => {
                                    const cumulativePoints = milestones
                                        .slice(0, mIndex + 1)
                                        .reduce((sum, m) => sum + m.points, 0);
                                    return `<option value="${mIndex}" ${mIndex === selectedMilestone ? 'selected' : ''}>
                                    ${milestone.completions}× erreicht → ${milestone.points} Pkt (gesamt: ${cumulativePoints} Pkt)
                                </option>`;
                                })
                                .join('')}
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Wähle den höchsten erreichten Meilenstein aus</p>
                    </div>
                `;
            }
        }

        div.innerHTML = `
            <div class="flex items-center justify-between mb-3">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="text-yellow-700">👤</span>
                        <span class="font-medium text-gray-900">${player.firstName} ${player.lastName}</span>
                        <span class="text-xs text-yellow-700">(alleine)</span>
                        ${playerExerciseMilestone ? '<span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-2">📊 Meilenstein</span>' : ''}
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
            ${milestoneSelect}
        `;
        container.appendChild(div);
    });
}

/**
 * Set pair result
 */
window.setPairResult = function (index, result) {
    formedPairs[index].result = result;
    // Meilenstein-Index auf 0 (erster Meilenstein) initialisieren bei Erfolgsmarkierung für Meilenstein-Übungen
    if (
        (result === 'both_success' || result === 'one_success') &&
        currentExercise?.tieredPoints &&
        formedPairs[index].milestoneIndex === undefined
    ) {
        formedPairs[index].milestoneIndex = 0;
    }
    renderFormedPairs();
};

/**
 * Set pair milestone (for milestone exercises)
 */
window.setPairMilestone = function (index, milestoneIndex) {
    formedPairs[index].milestoneIndex = milestoneIndex;
};

/**
 * Remove pair
 */
window.removePair = function (index) {
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
window.setSinglePlayerResult = function (index, result) {
    singlePlayers[index].result = result;
    // Meilenstein-Index auf 0 (erster Meilenstein) initialisieren bei Erfolgsmarkierung für Meilenstein-Übungen
    const playerExerciseMilestone =
        singlePlayers[index].customExercise?.tieredPoints || currentExercise?.tieredPoints;
    if (
        result === 'success' &&
        playerExerciseMilestone &&
        singlePlayers[index].milestoneIndex === undefined
    ) {
        singlePlayers[index].milestoneIndex = 0;
    }
    renderSinglePlayers();
};

/**
 * Set single player milestone (for milestone exercises)
 */
window.setSinglePlayerMilestone = function (index, milestoneIndex) {
    singlePlayers[index].milestoneIndex = milestoneIndex;
};

/**
 * Remove single player
 */
window.removeSinglePlayer = function (index) {
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

    // Zugewiesene Spieler zählen
    const pairedPlayersCount = formedPairs.length * 2;
    const singlePlayersCount = singlePlayers.length;
    const assignedPlayersCount = pairedPlayersCount + singlePlayersCount;

    // Gesamte Spieler zählen
    const totalPlayers = availablePlayers.length;
    const remainingPlayers = totalPlayers - assignedPlayersCount;

    console.log('[Exercise Pairing] Total players:', totalPlayers);
    console.log('[Exercise Pairing] Assigned players:', assignedPlayersCount);
    console.log('[Exercise Pairing] Remaining players:', remainingPlayers);

    // Button-Status aktualisieren
    if (remainingPlayers === 0 && assignedPlayersCount > 0) {
        // Alle Spieler zugewiesen - Button aktivieren
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        confirmBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        confirmBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Paarungen bestätigen';
    } else {
        // Nicht alle Spieler zugewiesen - Button deaktivieren
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

    // Prüfen ob alle Spieler zugewiesen sind
    const pairedPlayersCount = formedPairs.length * 2;
    const singlePlayersCount = singlePlayers.length;
    const assignedPlayersCount = pairedPlayersCount + singlePlayersCount;
    const totalPlayers = availablePlayers.length;

    if (assignedPlayersCount !== totalPlayers) {
        showPairingFeedback(`Bitte alle ${totalPlayers} Spieler zuordnen!`, 'error');
        return;
    }

    confirmBtn.disabled = true;

    // Paarungs-Daten zurückgeben ohne Punkte sofort zu verteilen
    const pairingData = {
        pairs: formedPairs.map(pair => {
            const data = {
                player1Id: pair.player1.id,
                player2Id: pair.player2.id,
                result: pair.result,
            };

            // Für Meilenstein-Übungen completionCount aus ausgewähltem Meilenstein berechnen
            if (currentExercise?.tieredPoints?.milestones && pair.milestoneIndex !== undefined) {
                const milestones = currentExercise.tieredPoints.milestones.sort(
                    (a, b) => a.completions - b.completions
                );
                data.completionCount = milestones[pair.milestoneIndex]?.completions || 1;
                data.milestoneIndex = pair.milestoneIndex;
            } else {
                data.completionCount = 1;
            }

            return data;
        }),
        singlePlayers: singlePlayers.map(sp => {
            const data = {
                playerId: sp.id,
                result: sp.result,
                customExercise: sp.customExercise || null,
            };

            // Für Meilenstein-Übungen completionCount aus ausgewähltem Meilenstein berechnen
            const exerciseMilestones =
                sp.customExercise?.tieredPoints?.milestones ||
                currentExercise?.tieredPoints?.milestones;
            if (exerciseMilestones && sp.milestoneIndex !== undefined) {
                const milestones = exerciseMilestones.sort((a, b) => a.completions - b.completions);
                data.completionCount = milestones[sp.milestoneIndex]?.completions || 1;
                data.milestoneIndex = sp.milestoneIndex;
            } else {
                data.completionCount = 1;
            }

            return data;
        }),
        exercise: currentExercise,
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
 * @param {Array} pairs - Array gepaarter Spieler mit Ergebnissen
 * @param {Array} singles - Array einzelner Spieler (mit Trainer) mit Ergebnissen
 * @param {Object} exercise - Übungs-Objekt
 * @param {Object} sessionData - Session-Daten
 */
export async function distributeExercisePoints(pairs, singles, exercise, sessionData) {
    const date = sessionData.date;
    const subgroupId = sessionData.subgroupId;

    // Untergruppen-Namen abrufen
    const { data: subgroupData } = await supabaseClient
        .from('subgroups')
        .select('name')
        .eq('id', subgroupId)
        .single();
    const subgroupName = subgroupData?.name || subgroupId;

    const maxPoints = exercise.points || 0;

    // Paarungen verarbeiten
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

        // Spieler-IDs extrahieren (beide Formate: {player1: {id}} und {player1Id})
        const player1Id = pair.player1?.id || pair.player1Id;
        const player2Id = pair.player2?.id || pair.player2Id;

        // Erfolgsrate für Verlauf bestimmen (nur für vergebene Punkte)
        const successRate = pair.result === 'both_success' ? '100%' : '50%';

        // An Spieler 1 vergeben
        if (points1 > 0 && player1Id) {
            await awardPointsToPlayer(
                player1Id,
                points1,
                exercise.name,
                date,
                subgroupId,
                subgroupName,
                successRate
            );
        }

        // An Spieler 2 vergeben
        if (points2 > 0 && player2Id) {
            await awardPointsToPlayer(
                player2Id,
                points2,
                exercise.name,
                date,
                subgroupId,
                subgroupName,
                successRate
            );
        }
    }

    // Einzelspieler verarbeiten
    for (const single of singles) {
        const points = single.result === 'success' ? maxPoints : 0;
        // Spieler-ID extrahieren (beide Formate: {id} und {playerId})
        const playerId = single.id || single.playerId;

        // Prüfen ob Spieler benutzerdefinierte Übung hat
        const customExercise = single.customExercise;
        const exerciseToUse = customExercise || exercise;
        const customPoints = customExercise
            ? single.result === 'success'
                ? customExercise.points
                : 0
            : points;

        if (customPoints > 0 && playerId) {
            // Einzelspieler bekommen immer 100% bei Erfolg (sie bekommen nur Punkte bei Erfolg)
            await awardPointsToPlayer(
                playerId,
                customPoints,
                exerciseToUse.name,
                date,
                subgroupId,
                subgroupName,
                '100%'
            );
        }
    }

    console.log(
        `[Exercise Pairing] Distributed points for ${pairs.length} pairs and ${singles.length} single players`
    );
}

/**
 * Distribute milestone points for tiered exercises
 * @param {Array} pairs - Array gepaarter Spieler mit Ergebnissen
 * @param {Array} singles - Array einzelner Spieler mit Ergebnissen
 * @param {Object} exercise - Übungs-Objekt with tieredPoints data
 * @param {Object} sessionData - Session-Daten
 */
export async function distributeMilestonePoints(pairs, singles, exercise, sessionData) {
    const date = sessionData.date;
    const subgroupId = sessionData.subgroupId;

    // Untergruppen-Namen abrufen
    const { data: subgroupData } = await supabaseClient
        .from('subgroups')
        .select('name')
        .eq('id', subgroupId)
        .single();
    const subgroupName = subgroupData?.name || subgroupId;

    // Meilensteine aus Übung abrufen
    const milestones = exercise.tieredPoints?.milestones || [];
    if (milestones.length === 0) {
        console.warn('[Milestone Points] No milestones found for exercise:', exercise.name);
        return;
    }

    // Meilensteine nach Abschlüssen sortieren (aufsteigend)
    const sortedMilestones = [...milestones].sort((a, b) => a.completions - b.completions);

    // Aktuellen Saison-Schlüssel abrufen
    const currentSeasonKey = await getCurrentSeasonKey();

    // Alle Spieler sammeln die abgeschlossen haben mit Abschlusszählung und Erfolgsrate
    const successfulPlayers = [];

    // Paarungen verarbeiten
    for (const pair of pairs) {
        const player1Id = pair.player1?.id || pair.player1Id;
        const player2Id = pair.player2?.id || pair.player2Id;
        const count = pair.completionCount || 1;

        if (pair.result === 'both_success') {
            if (player1Id)
                successfulPlayers.push({
                    playerId: player1Id,
                    count,
                    pointsMultiplier: 1.0,
                    successRate: '100%',
                });
            if (player2Id)
                successfulPlayers.push({
                    playerId: player2Id,
                    count,
                    pointsMultiplier: 1.0,
                    successRate: '100%',
                });
        } else if (pair.result === 'one_success') {
            // Beide bekommen Fortschritt, aber nur 50% der Punkte
            if (player1Id)
                successfulPlayers.push({
                    playerId: player1Id,
                    count,
                    pointsMultiplier: 0.5,
                    successRate: '50%',
                });
            if (player2Id)
                successfulPlayers.push({
                    playerId: player2Id,
                    count,
                    pointsMultiplier: 0.5,
                    successRate: '50%',
                });
        }
    }

    // Einzelspieler verarbeiten
    for (const single of singles) {
        const playerId = single.id || single.playerId;
        const count = single.completionCount || 1;
        if (single.result === 'success' && playerId) {
            successfulPlayers.push({ playerId, count, pointsMultiplier: 1.0, successRate: '100%' });
        }
    }

    // Jeden erfolgreichen Spieler verarbeiten
    for (const playerInfo of successfulPlayers) {
        const { playerId, count, pointsMultiplier, successRate } = playerInfo;

        // Meilenstein-Fortschritt abrufen oder erstellen
        const { data: milestoneData, error: milestoneError } = await supabaseClient
            .from('exercise_milestones')
            .select('*')
            .eq('user_id', playerId)
            .eq('exercise_id', exercise.exerciseId)
            .single();

        let currentCount = 0;
        let previousMilestoneIndex = -1;

        if (!milestoneError && milestoneData) {
            // Nur Fortschritt aus aktueller Saison verwenden
            if (milestoneData.last_season_updated === currentSeasonKey) {
                currentCount = milestoneData.current_count || 0;
                previousMilestoneIndex = milestoneData.last_milestone_index ?? -1;
            }
        }

        // Zähler um Anzahl der Abschlüsse erhöhen
        const newCount = currentCount + count;

        // Neuen erreichten Meilenstein finden (falls vorhanden)
        let newMilestoneIndex = previousMilestoneIndex;
        let pointsToAward = 0;

        for (let i = previousMilestoneIndex + 1; i < sortedMilestones.length; i++) {
            if (newCount >= sortedMilestones[i].completions) {
                newMilestoneIndex = i;
                // Inkrementelle Punkte vergeben (Differenz zum vorherigen Meilenstein)
                if (i === 0) {
                    pointsToAward += sortedMilestones[i].points;
                } else {
                    pointsToAward += sortedMilestones[i].points - sortedMilestones[i - 1].points;
                }
            } else {
                break;
            }
        }

        // Meilenstein-Fortschritt aktualisieren
        const { error: upsertError } = await supabaseClient
            .from('exercise_milestones')
            .upsert({
                user_id: playerId,
                exercise_id: exercise.exerciseId,
                current_count: newCount,
                last_milestone_index: newMilestoneIndex,
                last_season_updated: currentSeasonKey,
                exercise_name: exercise.name,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id,exercise_id'
            });

        if (upsertError) {
            console.error('[Milestone Points] Error updating milestone:', upsertError);
        }

        // Punkte vergeben falls Meilenstein erreicht
        if (pointsToAward > 0) {
            const milestoneInfo = sortedMilestones[newMilestoneIndex];
            const milestoneName = `${exercise.name} (Meilenstein ${milestoneInfo.completions}×)`;

            // Punkte-Multiplikator für Teilerfolg anwenden (z.B. 50% für one_success)
            const finalPoints = Math.floor(pointsToAward * pointsMultiplier);

            await awardPointsToPlayer(
                playerId,
                finalPoints,
                milestoneName,
                date,
                subgroupId,
                subgroupName,
                successRate
            );

            console.log(
                `[Milestone Points] Player ${playerId} reached milestone ${milestoneInfo.completions}× for ${exercise.name}, awarded ${finalPoints} points (${successRate}, completed ${count}× this session, total: ${newCount})`
            );
        } else {
            console.log(
                `[Milestone Points] Player ${playerId} progress: ${newCount}/${sortedMilestones[0].completions} (completed ${count}× this session, no milestone reached yet)`
            );
        }
    }

    console.log(
        `[Milestone Points] Processed milestones for ${successfulPlayers.length} successful players`
    );
}

/**
 * Get current season key
 * @returns {string} Season key in format "YYYY-MM-DD"
 */
async function getCurrentSeasonKey() {
    try {
        const { data, error } = await supabaseClient
            .from('settings')
            .select('value')
            .eq('key', 'currentSeason')
            .single();

        if (!error && data && data.value) {
            return data.value.startDate || new Date().toISOString().split('T')[0];
        }
    } catch (error) {
        console.error('[Season] Error getting current season:', error);
    }
    return new Date().toISOString().split('T')[0];
}

/**
 * Award points to a player
 * @param {string} successRate - Erfolgsquoten-Indikator (z.B. "100%", "50%")
 */
async function awardPointsToPlayer(
    playerId,
    points,
    exerciseName,
    date,
    subgroupId,
    subgroupName,
    successRate
) {
    // Spieler-Punkte und XP aktualisieren
    const { data: currentPlayer, error: fetchError } = await supabaseClient
        .from('profiles')
        .select('points, xp')
        .eq('id', playerId)
        .single();

    if (fetchError) {
        console.error('[Award Points] Error fetching player:', fetchError);
        return;
    }

    const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({
            points: (currentPlayer.points || 0) + points,
            xp: (currentPlayer.xp || 0) + points
        })
        .eq('id', playerId);

    if (updateError) {
        console.error('[Award Points] Error updating player:', updateError);
        return;
    }

    // Begründungstext mit Erfolgsrate erstellen
    const reason = `Training am ${formatDateGerman(date)} - ${subgroupName}: ${exerciseName} (${successRate})`;

    // Punkte-Verlauf-Eintrag erstellen
    const { error: pointsHistoryError } = await supabaseClient
        .from('points_history')
        .insert({
            user_id: playerId,
            points,
            xp: points,
            elo_change: 0,
            reason,
            date,
            subgroup_id: subgroupId,
            awarded_by: `Coach: ${currentUserData.firstName} ${currentUserData.lastName}`,
            session_id: currentSessionData.id
        });

    if (pointsHistoryError) {
        console.error('[Award Points] Error creating points history:', pointsHistoryError);
    }

    // XP-Historieneintrag erstellen
    const { error: xpHistoryError } = await supabaseClient
        .from('xp_history')
        .insert({
            user_id: playerId,
            xp: points,
            reason,
            date,
            subgroup_id: subgroupId,
            awarded_by: `Coach: ${currentUserData.firstName} ${currentUserData.lastName}`,
            session_id: currentSessionData.id
        });

    if (xpHistoryError) {
        console.error('[Award Points] Error creating xp history:', xpHistoryError);
    }
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

    // Zustand zurücksetzen
    selectedPlayers = [];
    formedPairs = [];
    singlePlayers = [];
    currentExercise = null;

    // Feedback zurücksetzen
    const feedbackElement = document.getElementById('pairing-feedback');
    if (feedbackElement) feedbackElement.textContent = '';
}
