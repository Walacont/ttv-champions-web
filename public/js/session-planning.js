/**
 * Session Planning Module
 * Handles the planning of training activities and exercises for sessions
 */

import { STANDARD_ACTIVITIES, getActivityById } from './training-activities.js';
import {
    collection,
    getDocs,
    query,
    orderBy
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

let db = null;
let selectedExercises = []; // Array of {exerciseId, name, points, tieredPoints, partnerSystem}

/**
 * Initialize the session planning module
 * @param {Object} firestoreInstance - Firestore database instance
 */
export function initializeSessionPlanning(firestoreInstance) {
    db = firestoreInstance;
}

/**
 * Load standard activities into the modal
 */
export function loadStandardActivities() {
    const container = document.getElementById('standard-activities-list');
    if (!container) return;

    container.innerHTML = '';

    STANDARD_ACTIVITIES.forEach(activity => {
        const div = document.createElement('div');
        div.className = 'flex items-center p-2 hover:bg-gray-100 rounded';
        div.innerHTML = `
            <input
                type="checkbox"
                id="activity-${activity.id}"
                value="${activity.id}"
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 standard-activity-checkbox"
            >
            <label for="activity-${activity.id}" class="ml-3 flex-1 cursor-pointer">
                <span class="text-sm font-medium text-gray-700">
                    ${activity.icon} ${activity.name}
                </span>
                <span class="ml-2 text-xs text-gray-500">(+${activity.points} Pkt)</span>
            </label>
        `;
        container.appendChild(div);
    });
}

/**
 * Load exercises into the dropdown
 * @param {Object} db - Firestore database instance
 */
export async function loadExercisesIntoDropdown(db) {
    const select = document.getElementById('exercise-select');
    if (!select) return;

    try {
        const exercisesQuery = query(
            collection(db, 'exercises'),
            orderBy('title', 'asc')
        );
        const snapshot = await getDocs(exercisesQuery);

        // Clear existing options (except first one)
        select.innerHTML = '<option value="">Übung auswählen...</option>';

        snapshot.docs.forEach(doc => {
            const exercise = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = exercise.title;
            option.dataset.points = exercise.points || 0;
            option.dataset.tieredPoints = exercise.tieredPoints?.enabled || false;
            option.dataset.partnerSystem = exercise.partnerSystem?.enabled || false;
            select.appendChild(option);
        });

        console.log(`[Session Planning] Loaded ${snapshot.docs.length} exercises into dropdown`);
    } catch (error) {
        console.error('[Session Planning] Error loading exercises:', error);
    }
}

/**
 * Add selected exercise to the list
 */
export function addExerciseToList() {
    const select = document.getElementById('exercise-select');
    if (!select || !select.value) return;

    const selectedOption = select.options[select.selectedIndex];
    const exerciseId = select.value;
    const exerciseName = selectedOption.textContent;
    const points = parseInt(selectedOption.dataset.points) || 0;
    const hasTieredPoints = selectedOption.dataset.tieredPoints === 'true';
    const hasPartnerSystem = selectedOption.dataset.partnerSystem === 'true';

    // Check if already added
    if (selectedExercises.find(ex => ex.exerciseId === exerciseId)) {
        alert('Diese Übung wurde bereits hinzugefügt.');
        return;
    }

    // Add to array
    selectedExercises.push({
        exerciseId,
        name: exerciseName,
        points,
        tieredPoints: hasTieredPoints,
        partnerSystem: hasPartnerSystem
    });

    // Re-render list
    renderSelectedExercises();

    // Reset dropdown
    select.value = '';
}

/**
 * Remove exercise from the list
 * @param {string} exerciseId - Exercise ID to remove
 */
export function removeExerciseFromList(exerciseId) {
    selectedExercises = selectedExercises.filter(ex => ex.exerciseId !== exerciseId);
    renderSelectedExercises();
}

/**
 * Render the list of selected exercises
 */
function renderSelectedExercises() {
    const container = document.getElementById('selected-exercises-list');
    if (!container) return;

    if (selectedExercises.length === 0) {
        container.innerHTML = '<p class="text-xs text-gray-500 text-center py-2">Keine Übungen ausgewählt</p>';
        return;
    }

    container.innerHTML = '';

    selectedExercises.forEach(exercise => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 bg-white border rounded';

        let badges = '';
        if (exercise.tieredPoints) {
            badges += '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }
        if (exercise.partnerSystem) {
            badges += '<span class="text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded ml-2" title="Partner-System">👥</span>';
        }

        div.innerHTML = `
            <span class="text-sm font-medium text-gray-700">
                📋 ${exercise.name}
                ${badges}
            </span>
            <button type="button" class="text-red-600 hover:text-red-800 text-sm font-bold" onclick="window.removeExerciseFromSessionPlan('${exercise.exerciseId}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

/**
 * Get all selected activities (standard + exercises)
 * Returns array in the format required for trainingSessions.plannedActivities
 * @returns {Array} Planned activities
 */
export function getPlannedActivities() {
    const activities = [];

    // Get checked standard activities
    const checkboxes = document.querySelectorAll('.standard-activity-checkbox:checked');
    checkboxes.forEach(checkbox => {
        const activity = getActivityById(checkbox.value);
        if (activity) {
            activities.push({
                type: 'standard',
                id: activity.id,
                name: activity.name,
                points: activity.points,
                icon: activity.icon
            });
        }
    });

    // Get selected exercises
    selectedExercises.forEach(exercise => {
        activities.push({
            type: 'exercise',
            exerciseId: exercise.exerciseId,
            name: exercise.name,
            points: exercise.points,
            tieredPoints: exercise.tieredPoints,
            partnerSystem: exercise.partnerSystem
        });
    });

    return activities;
}

/**
 * Reset the session planning UI
 */
export function resetSessionPlanning() {
    // Uncheck all standard activities
    const checkboxes = document.querySelectorAll('.standard-activity-checkbox');
    checkboxes.forEach(checkbox => checkbox.checked = false);

    // Clear selected exercises
    selectedExercises = [];
    renderSelectedExercises();

    // Reset dropdown
    const select = document.getElementById('exercise-select');
    if (select) select.value = '';
}

/**
 * Initialize event listeners for session planning
 */
export function initializeSessionPlanningListeners() {
    // Add exercise button
    const addButton = document.getElementById('add-exercise-button');
    if (addButton) {
        addButton.addEventListener('click', addExerciseToList);
    }

    // Make remove function globally available
    window.removeExerciseFromSessionPlan = removeExerciseFromList;
}
