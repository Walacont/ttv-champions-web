/**
 * Training Completion Module
 * Handles the intelligent training completion workflow with automatic points distribution
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    writeBatch,
    serverTimestamp,
    increment,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

import { openExerciseSelectionModal } from './session-planning.js';
import { initializePartnerPairing, openPartnerPairingModal, distributePartnerExercisePoints } from './partner-pairing.js';

let db = null;
let currentUserData = null;
let currentSessionId = null;
let currentSessionData = null;
let currentAttendanceData = null;
let plannedExercises = [];
let spontaneousExercises = [];
// Store partner pairings for each exercise: {planned: [{pairs, singlePlayers}], spontaneous: [{pairs, singlePlayers}]}
let exercisePairings = {
    planned: [],
    spontaneous: []
};

/**
 * Initialize the training completion module
 * @param {Object} firestoreInstance - Firestore database instance
 * @param {Object} userData - Current user data
 */
export function initializeTrainingCompletion(firestoreInstance, userData) {
    db = firestoreInstance;
    currentUserData = userData;
    setupEventListeners();
    initializePartnerPairing(firestoreInstance, userData);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Close modal button
    const closeBtn = document.getElementById('close-training-completion-modal-button');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCompletionModal);
    }

    // Form submit
    const form = document.getElementById('training-completion-form');
    if (form) {
        form.addEventListener('submit', handleCompletionSubmit);
    }

    // Add spontaneous exercise button
    const addSpontBtn = document.getElementById('add-spontaneous-exercise-button');
    if (addSpontBtn) {
        addSpontBtn.addEventListener('click', openSpontaneousExerciseModal);
    }
}

/**
 * Open exercise selection modal for spontaneous exercises
 */
function openSpontaneousExerciseModal() {
    // Open modal with callback to add spontaneous exercise
    openExerciseSelectionModal((exercise) => {
        addSpontaneousExerciseFromModal(exercise);
    });
}

/**
 * Add spontaneous exercise from modal
 * @param {Object} exercise - Exercise object from database
 */
function addSpontaneousExerciseFromModal(exercise) {
    // Allow duplicates - exercises can be done multiple times in a training
    spontaneousExercises.push({
        exerciseId: exercise.id,
        name: exercise.title,
        points: exercise.points || 0,
        tieredPoints: exercise.tieredPoints?.enabled || false
    });

    // Add placeholder for pairing data
    exercisePairings.spontaneous.push(null);

    renderSpontaneousExercises();
}

/**
 * Open training completion modal
 * @param {string} sessionId - Training session ID
 * @param {string} dateStr - Date string (YYYY-MM-DD)
 */
window.openTrainingCompletionModal = async function(sessionId, dateStr) {
    currentSessionId = sessionId;
    plannedExercises = [];
    spontaneousExercises = [];

    try {
        // Load session data
        const sessionDoc = await getDoc(doc(db, 'trainingSessions', sessionId));
        if (!sessionDoc.exists()) {
            alert('Training-Session nicht gefunden!');
            return;
        }

        currentSessionData = {
            id: sessionDoc.id,
            ...sessionDoc.data()
        };

        // Load attendance data
        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('sessionId', '==', sessionId)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);

        if (attendanceSnapshot.empty) {
            alert('Bitte erfasse zuerst die Anwesenheit für dieses Training!');
            return;
        }

        currentAttendanceData = {
            id: attendanceSnapshot.docs[0].id,
            ...attendanceSnapshot.docs[0].data()
        };

        // Load subgroup info
        const subgroupDoc = await getDoc(doc(db, 'subgroups', currentSessionData.subgroupId));
        const subgroupName = subgroupDoc.exists() ? subgroupDoc.data().name : 'Unbekannt';

        // Populate modal
        document.getElementById('completion-session-info').textContent =
            `${subgroupName} • ${currentSessionData.startTime}-${currentSessionData.endTime} • ${formatDateGerman(dateStr)}`;
        document.getElementById('completion-session-id').value = sessionId;
        document.getElementById('completion-session-date').value = dateStr;
        document.getElementById('completion-player-count').textContent = currentAttendanceData.presentPlayerIds?.length || 0;

        // Load planned exercises
        plannedExercises = currentSessionData.plannedExercises || [];
        document.getElementById('completion-planned-count').textContent = plannedExercises.length;

        // Initialize pairing arrays (will be filled as user sets pairings)
        exercisePairings.planned = new Array(plannedExercises.length).fill(null);
        exercisePairings.spontaneous = new Array(spontaneousExercises.length).fill(null);

        renderPlannedExercises();
        renderSpontaneousExercises();

        // Show modal
        const modal = document.getElementById('training-completion-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        console.error('[Training Completion] Error opening modal:', error);
        alert('Fehler beim Laden der Training-Daten: ' + error.message);
    }
};

/**
 * Render planned exercises checklist
 */
function renderPlannedExercises() {
    const container = document.getElementById('completion-planned-exercises');
    if (!container) return;

    if (plannedExercises.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Keine Übungen geplant</p>';
        return;
    }

    container.innerHTML = '';

    plannedExercises.forEach((exercise, index) => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 p-2 bg-white border rounded hover:bg-gray-50';

        let badges = '';
        if (exercise.tieredPoints) {
            badges += '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }

        // Check if pairings are already set for this exercise
        const hasPairings = exercisePairings.planned[index] !== undefined && exercisePairings.planned[index] !== null;
        const pairingStatus = hasPairings
            ? '<span class="text-xs text-green-600">✓ Paarungen gesetzt</span>'
            : '<span class="text-xs text-orange-600">⚠ Paarungen fehlen</span>';

        div.innerHTML = `
            <span class="flex-1 text-sm text-gray-700">
                📋 ${exercise.name}
                ${badges}
            </span>
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">+${exercise.points} Pkt</span>
                ${pairingStatus}
                <button
                    type="button"
                    class="text-xs px-2 py-1 rounded ${hasPairings ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}"
                    onclick="window.openPairingForPlannedExercise(${index})"
                >
                    ${hasPairings ? '✏️ Bearbeiten' : '👥 Partner wählen'}
                </button>
                <button
                    type="button"
                    class="text-red-600 hover:text-red-800 text-xs"
                    onclick="window.removePlannedExercise(${index})"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    updateSubmitButtonState();
}

/**
 * Render spontaneous exercises
 */
function renderSpontaneousExercises() {
    const container = document.getElementById('completion-spontaneous-exercises');
    if (!container) return;

    if (spontaneousExercises.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">Keine spontanen Übungen hinzugefügt</p>';
        return;
    }

    container.innerHTML = '';

    spontaneousExercises.forEach((exercise, index) => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded';

        let badges = '';
        if (exercise.tieredPoints) {
            badges += '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }

        // Check if pairings are already set for this exercise
        const hasPairings = exercisePairings.spontaneous[index] !== undefined && exercisePairings.spontaneous[index] !== null;
        const pairingStatus = hasPairings
            ? '<span class="text-xs text-green-600">✓ Paarungen gesetzt</span>'
            : '<span class="text-xs text-orange-600">⚠ Paarungen fehlen</span>';

        div.innerHTML = `
            <span class="flex-1 text-sm text-gray-700">
                ⚡ ${exercise.name}
                ${badges}
            </span>
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-500">+${exercise.points} Pkt</span>
                ${pairingStatus}
                <button
                    type="button"
                    class="text-xs px-2 py-1 rounded ${hasPairings ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}"
                    onclick="window.openPairingForSpontaneousExercise(${index})"
                >
                    ${hasPairings ? '✏️ Bearbeiten' : '👥 Partner wählen'}
                </button>
                <button type="button" class="text-red-600 hover:text-red-800 text-xs" onclick="window.removeSpontaneousExercise(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    updateSubmitButtonState();
}


/**
 * Remove planned exercise
 * @param {number} index - Index in plannedExercises array
 */
window.removePlannedExercise = function(index) {
    plannedExercises.splice(index, 1);
    exercisePairings.planned.splice(index, 1);
    document.getElementById('completion-planned-count').textContent = plannedExercises.length;
    renderPlannedExercises();
};

/**
 * Remove spontaneous exercise
 * @param {number} index - Index in spontaneousExercises array
 */
window.removeSpontaneousExercise = function(index) {
    spontaneousExercises.splice(index, 1);
    exercisePairings.spontaneous.splice(index, 1);
    renderSpontaneousExercises();
};

/**
 * Handle completion form submit
 */
async function handleCompletionSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    showFeedback('Verarbeite Training-Abschluss...', 'info');

    try {
        // Collect all exercises with their pairings
        const exercisesWithPairings = [];

        // Planned exercises
        plannedExercises.forEach((exercise, index) => {
            const pairingData = exercisePairings.planned[index];
            exercisesWithPairings.push({
                exercise,
                pairingData,
                type: 'planned',
                index
            });
        });

        // Spontaneous exercises
        spontaneousExercises.forEach((exercise, index) => {
            const pairingData = exercisePairings.spontaneous[index];
            exercisesWithPairings.push({
                exercise,
                pairingData,
                type: 'spontaneous',
                index
            });
        });

        if (exercisesWithPairings.length === 0) {
            alert('Keine Übungen vorhanden!');
            submitBtn.disabled = false;
            clearFeedback();
            return;
        }

        // Process points distribution with saved pairings
        await processPointsDistributionWithPairings(exercisesWithPairings);

        // Mark session as completed
        await updateDoc(doc(db, 'trainingSessions', currentSessionId), {
            completed: true,
            completedAt: serverTimestamp(),
            completedBy: currentUserData.id,
            completedExercises: exercisesWithPairings.map(item => ({
                exerciseId: item.exercise.exerciseId,
                name: item.exercise.name,
                points: item.exercise.points
            }))
        });

        showFeedback('Training erfolgreich abgeschlossen! Punkte wurden vergeben.', 'success');

        // Trigger calendar reload event
        window.dispatchEvent(new CustomEvent('trainingCompleted', {
            detail: {
                sessionId: currentSessionId,
                date: currentSessionData.date
            }
        }));

        setTimeout(() => {
            closeCompletionModal();
        }, 1500);
    } catch (error) {
        console.error('[Training Completion] Error:', error);
        showFeedback('Fehler: ' + error.message, 'error');
        submitBtn.disabled = false;
    }
}

/**
 * Process points distribution using saved pairing data
 * @param {Array} exercisesWithPairings - Array of exercises with their pairing data
 */
async function processPointsDistributionWithPairings(exercisesWithPairings) {
    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        throw new Error('Keine Spieler anwesend');
    }

    // Process each exercise with its saved pairing data
    for (const item of exercisesWithPairings) {
        const { exercise, pairingData } = item;

        if (exercise.tieredPoints) {
            // TODO: Milestone exercises (not yet implemented)
            console.warn('[Training Completion] Milestone exercises not yet implemented:', exercise);
            continue;
        }

        // Regular exercises: use saved pairing data to distribute points
        if (pairingData && pairingData.pairs && pairingData.singlePlayers) {
            await distributePartnerExercisePoints(
                pairingData.pairs,
                pairingData.singlePlayers,
                exercise,
                currentSessionData
            );
        } else {
            console.warn('[Training Completion] No pairing data for exercise:', exercise);
        }
    }
}

/**
 * Distribute points for standard exercises
 * @param {Array} exercises - Standard exercises
 * @param {Array} playerIds - Present player IDs
 */
async function distributeStandardExercisePoints(exercises, playerIds) {
    const batch = writeBatch(db);
    const date = currentSessionData.date;
    const subgroupId = currentSessionData.subgroupId;

    // Get subgroup name for history entries
    const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
    const subgroupName = subgroupDoc.exists() ? subgroupDoc.data().name : subgroupId;

    const totalPoints = exercises.reduce((sum, ex) => sum + (ex.points || 0), 0);
    const exerciseNames = exercises.map(ex => ex.name).join(', ');

    for (const playerId of playerIds) {
        const playerRef = doc(db, 'users', playerId);

        // Update player points and XP (1:1 mapping)
        batch.update(playerRef, {
            points: increment(totalPoints),
            xp: increment(totalPoints)  // XP = Points (1:1)
        });

        // Create points history entry
        const pointsHistoryRef = doc(collection(db, `users/${playerId}/pointsHistory`));
        batch.set(pointsHistoryRef, {
            points: totalPoints,
            xp: totalPoints,
            eloChange: 0,
            reason: `Training am ${formatDateGerman(date)} - ${subgroupName}: ${exerciseNames}`,
            timestamp: serverTimestamp(),
            date,
            subgroupId,
            awardedBy: `Coach: ${currentUserData.firstName} ${currentUserData.lastName}`,
            sessionId: currentSessionId
        });

        // Create XP history entry
        const xpHistoryRef = doc(collection(db, `users/${playerId}/xpHistory`));
        batch.set(xpHistoryRef, {
            xp: totalPoints,
            reason: `Training am ${formatDateGerman(date)} - ${subgroupName}: ${exerciseNames}`,
            timestamp: serverTimestamp(),
            date,
            subgroupId,
            awardedBy: `Coach: ${currentUserData.firstName} ${currentUserData.lastName}`,
            sessionId: currentSessionId
        });
    }

    await batch.commit();
    console.log(`[Training Completion] Distributed ${totalPoints} points to ${playerIds.length} players`);
}

/**
 * Format date for display (DD.MM.YYYY)
 */
function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

/**
 * Show feedback message
 */
function showFeedback(message, type) {
    const feedbackElement = document.getElementById('training-completion-feedback');
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
 * Clear feedback message
 */
function clearFeedback() {
    const feedbackElement = document.getElementById('training-completion-feedback');
    if (feedbackElement) {
        feedbackElement.textContent = '';
    }
}

/**
 * Close completion modal
 */
function closeCompletionModal() {
    const modal = document.getElementById('training-completion-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearFeedback();
    currentSessionId = null;
    currentSessionData = null;
    currentAttendanceData = null;
    plannedExercises = [];
    spontaneousExercises = [];
    exercisePairings = {
        planned: [],
        spontaneous: []
    };
}

/**
 * Open partner pairing modal for a planned exercise
 * @param {number} index - Index in plannedExercises array
 */
window.openPairingForPlannedExercise = async function(index) {
    const exercise = plannedExercises[index];
    if (!exercise) return;

    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        alert('Keine Spieler anwesend!');
        return;
    }

    try {
        // Open partner pairing modal and get the result
        const pairingData = await openPartnerPairingModal(exercise, presentPlayerIds, currentSessionData);

        // Store the pairing data
        exercisePairings.planned[index] = pairingData;

        // Re-render to show updated status
        renderPlannedExercises();
    } catch (error) {
        console.error('[Training Completion] Error setting pairings for planned exercise:', error);
    }
};

/**
 * Open partner pairing modal for a spontaneous exercise
 * @param {number} index - Index in spontaneousExercises array
 */
window.openPairingForSpontaneousExercise = async function(index) {
    const exercise = spontaneousExercises[index];
    if (!exercise) return;

    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        alert('Keine Spieler anwesend!');
        return;
    }

    try {
        // Open partner pairing modal and get the result
        const pairingData = await openPartnerPairingModal(exercise, presentPlayerIds, currentSessionData);

        // Store the pairing data
        exercisePairings.spontaneous[index] = pairingData;

        // Re-render to show updated status
        renderSpontaneousExercises();
    } catch (error) {
        console.error('[Training Completion] Error setting pairings for spontaneous exercise:', error);
    }
};

/**
 * Update submit button state based on whether all pairings are set
 */
function updateSubmitButtonState() {
    const submitBtn = document.getElementById('training-completion-submit');
    if (!submitBtn) return;

    // Check if all exercises have pairings
    const allPlannedHavePairings = plannedExercises.every((exercise, index) => {
        return exercisePairings.planned[index] !== undefined && exercisePairings.planned[index] !== null;
    });

    const allSpontaneousHavePairings = spontaneousExercises.every((exercise, index) => {
        return exercisePairings.spontaneous[index] !== undefined && exercisePairings.spontaneous[index] !== null;
    });

    const allPairingsSet = allPlannedHavePairings && allSpontaneousHavePairings;
    const hasAnyExercises = plannedExercises.length > 0 || spontaneousExercises.length > 0;

    // Enable button only if all pairings are set and there's at least one exercise
    if (allPairingsSet && hasAnyExercises) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    } else {
        submitBtn.disabled = true;
        submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        submitBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
    }
}
