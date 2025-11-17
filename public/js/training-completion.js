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

let db = null;
let currentUserData = null;
let currentSessionId = null;
let currentSessionData = null;
let currentAttendanceData = null;
let plannedExercises = [];
let spontaneousExercises = [];
let allExercises = []; // For dropdown

/**
 * Initialize the training completion module
 * @param {Object} firestoreInstance - Firestore database instance
 * @param {Object} userData - Current user data
 */
export function initializeTrainingCompletion(firestoreInstance, userData) {
    db = firestoreInstance;
    currentUserData = userData;
    setupEventListeners();
    loadExercisesForDropdown();
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
        addSpontBtn.addEventListener('click', showSpontaneousExerciseSelector);
    }

    // Confirm spontaneous exercise
    const confirmBtn = document.getElementById('confirm-spontaneous-exercise-button');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', addSpontaneousExercise);
    }

    // Cancel spontaneous exercise
    const cancelBtn = document.getElementById('cancel-spontaneous-exercise-button');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideSpontaneousExerciseSelector);
    }
}

/**
 * Load exercises for the dropdown
 */
async function loadExercisesForDropdown() {
    try {
        const snapshot = await getDocs(collection(db, 'exercises'));
        allExercises = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Populate dropdown
        const select = document.getElementById('completion-exercise-select');
        if (select) {
            select.innerHTML = '<option value="">Übung auswählen...</option>';
            allExercises.forEach(exercise => {
                const option = document.createElement('option');
                option.value = exercise.id;
                option.textContent = exercise.title;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('[Training Completion] Error loading exercises:', error);
    }
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
        div.className = 'flex items-center p-2 bg-white border rounded hover:bg-gray-50';

        let badges = '';
        if (exercise.tieredPoints) {
            badges += '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }
        if (exercise.partnerSystem) {
            badges += '<span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-2" title="Partner-System">👥</span>';
        }

        div.innerHTML = `
            <input
                type="checkbox"
                id="planned-${index}"
                class="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500 planned-exercise-checkbox"
                data-index="${index}"
                checked
            >
            <label for="planned-${index}" class="ml-3 flex-1 cursor-pointer text-sm text-gray-700">
                ${exercise.name}
                ${badges}
            </label>
            <span class="text-xs text-gray-500">+${exercise.points} Pkt</span>
        `;
        container.appendChild(div);
    });
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
        div.className = 'flex items-center p-2 bg-green-50 border border-green-200 rounded';

        let badges = '';
        if (exercise.tieredPoints) {
            badges += '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }
        if (exercise.partnerSystem) {
            badges += '<span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-2" title="Partner-System">👥</span>';
        }

        div.innerHTML = `
            <input
                type="checkbox"
                id="spontaneous-${index}"
                class="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500 spontaneous-exercise-checkbox"
                data-index="${index}"
                checked
            >
            <label for="spontaneous-${index}" class="ml-3 flex-1 cursor-pointer text-sm text-gray-700">
                ${exercise.name}
                ${badges}
            </label>
            <button type="button" class="text-red-600 hover:text-red-800 text-xs" onclick="window.removeSpontaneousExercise(${index})">
                <i class="fas fa-times"></i>
            </button>
            <span class="text-xs text-gray-500 ml-2">+${exercise.points} Pkt</span>
        `;
        container.appendChild(div);
    });
}

/**
 * Show spontaneous exercise selector
 */
function showSpontaneousExerciseSelector() {
    const selector = document.getElementById('spontaneous-exercise-selector');
    if (selector) {
        selector.classList.remove('hidden');
    }
}

/**
 * Hide spontaneous exercise selector
 */
function hideSpontaneousExerciseSelector() {
    const selector = document.getElementById('spontaneous-exercise-selector');
    const select = document.getElementById('completion-exercise-select');
    if (selector) selector.classList.add('hidden');
    if (select) select.value = '';
}

/**
 * Add spontaneous exercise
 */
function addSpontaneousExercise() {
    const select = document.getElementById('completion-exercise-select');
    if (!select || !select.value) {
        alert('Bitte wähle eine Übung aus.');
        return;
    }

    const exerciseId = select.value;
    const exercise = allExercises.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    // Check if already added
    if (spontaneousExercises.find(ex => ex.exerciseId === exerciseId)) {
        alert('Diese Übung wurde bereits hinzugefügt.');
        return;
    }

    spontaneousExercises.push({
        exerciseId: exercise.id,
        name: exercise.title,
        points: exercise.points || 0,
        tieredPoints: exercise.tieredPoints?.enabled || false,
        partnerSystem: exercise.partnerSystem?.enabled || false
    });

    renderSpontaneousExercises();
    hideSpontaneousExerciseSelector();
}

/**
 * Remove spontaneous exercise
 * @param {number} index - Index in spontaneousExercises array
 */
window.removeSpontaneousExercise = function(index) {
    spontaneousExercises.splice(index, 1);
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
        // Collect checked exercises
        const checkedExercises = [];

        // Planned exercises
        document.querySelectorAll('.planned-exercise-checkbox:checked').forEach(checkbox => {
            const index = parseInt(checkbox.dataset.index);
            checkedExercises.push(plannedExercises[index]);
        });

        // Spontaneous exercises
        document.querySelectorAll('.spontaneous-exercise-checkbox:checked').forEach(checkbox => {
            const index = parseInt(checkbox.dataset.index);
            checkedExercises.push(spontaneousExercises[index]);
        });

        if (checkedExercises.length === 0) {
            alert('Bitte wähle mindestens eine durchgeführte Übung aus.');
            submitBtn.disabled = false;
            clearFeedback();
            return;
        }

        // Process intelligent points distribution
        await processIntelligentPointsDistribution(checkedExercises);

        // Mark session as completed
        await updateDoc(doc(db, 'trainingSessions', currentSessionId), {
            completed: true,
            completedAt: serverTimestamp(),
            completedBy: currentUserData.id,
            completedExercises: checkedExercises.map(ex => ({
                exerciseId: ex.exerciseId,
                name: ex.name,
                points: ex.points
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
 * Process intelligent points distribution
 * @param {Array} exercises - Checked exercises
 */
async function processIntelligentPointsDistribution(exercises) {
    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        throw new Error('Keine Spieler anwesend');
    }

    // Separate exercises by type
    const standardExercises = [];
    const milestoneExercises = [];
    const partnerExercises = [];

    exercises.forEach(ex => {
        if (ex.partnerSystem) {
            partnerExercises.push(ex);
        } else if (ex.tieredPoints) {
            milestoneExercises.push(ex);
        } else {
            standardExercises.push(ex);
        }
    });

    // PHASE 1: Standard exercises (automatic distribution)
    if (standardExercises.length > 0) {
        await distributeStandardExercisePoints(standardExercises, presentPlayerIds);
    }

    // PHASE 2: Milestone exercises (requires input)
    if (milestoneExercises.length > 0) {
        // TODO: Show milestone input modal
        console.warn('[Training Completion] Milestone exercises found, but input not yet implemented:', milestoneExercises);
    }

    // PHASE 3: Partner exercises (manual handling required)
    if (partnerExercises.length > 0) {
        console.warn('[Training Completion] Partner exercises found, please handle manually:', partnerExercises);
        alert(`⚠️ ${partnerExercises.length} Partner-Übung(en) gefunden.\n\nBitte vergib diese manuell im "Punkte vergeben"-Tab.`);
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
}
