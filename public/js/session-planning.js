/**
 * Session Planning Module
 * Handles the planning of exercises for training sessions
 */

import {
    collection,
    getDocs,
    query,
    orderBy
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

let db = null;
let selectedExercises = []; // Array of {exerciseId, name, points, tieredPoints, partnerSystem}
let allExercisesForSelection = []; // All exercises loaded from database
let currentTagFilter = 'all'; // Current active tag filter
let modalCallback = null; // Callback function for when an exercise is selected

/**
 * Initialize the session planning module
 * @param {Object} firestoreInstance - Firestore database instance
 */
export function initializeSessionPlanning(firestoreInstance) {
    db = firestoreInstance;
}

/**
 * Load all exercises from database (for selection modal)
 * @param {Object} db - Firestore database instance
 */
export async function loadExercisesForSelection(db) {
    try {
        const exercisesQuery = query(
            collection(db, 'exercises'),
            orderBy('title', 'asc')
        );
        const snapshot = await getDocs(exercisesQuery);

        allExercisesForSelection = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`[Session Planning] Loaded ${allExercisesForSelection.length} exercises for selection`);
    } catch (error) {
        console.error('[Session Planning] Error loading exercises:', error);
    }
}

/**
 * Open exercise selection modal
 * @param {Function} callback - Optional callback function to call when exercise is selected (instead of default behavior)
 */
export function openExerciseSelectionModal(callback = null) {
    const modal = document.getElementById('exercise-selection-modal');
    if (!modal) return;

    // Set callback (null means use default session planning behavior)
    modalCallback = callback;

    // Reset filter
    currentTagFilter = 'all';

    // Generate tag filter buttons
    renderTagFilters();

    // Render exercises
    renderExerciseSelectionGrid();

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Focus search input
    const searchInput = document.getElementById('exercise-selection-search');
    if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 100);
    }
}

/**
 * Render tag filter buttons
 */
function renderTagFilters() {
    const container = document.getElementById('exercise-tag-filters');
    if (!container) return;

    // Collect all unique tags from exercises
    const allTags = new Set();
    allExercisesForSelection.forEach(ex => {
        if (ex.tags && Array.isArray(ex.tags)) {
            ex.tags.forEach(tag => allTags.add(tag));
        }
    });

    // Keep "Alle" button and clear the rest
    const labelSpan = container.querySelector('.text-gray-500');
    const alleButton = container.querySelector('[data-tag="all"]');
    container.innerHTML = '';
    if (labelSpan) container.appendChild(labelSpan);
    if (alleButton) container.appendChild(alleButton);

    // Add tag filter buttons
    Array.from(allTags).sort().forEach(tag => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tag-filter-btn px-3 py-1 text-xs rounded-full border border-gray-300 hover:bg-gray-100 transition';
        btn.dataset.tag = tag;
        btn.textContent = tag;
        btn.addEventListener('click', () => handleTagFilterClick(tag));
        container.appendChild(btn);
    });

    // Add click handler to "Alle" button
    if (alleButton) {
        alleButton.addEventListener('click', () => handleTagFilterClick('all'));
    }
}

/**
 * Handle tag filter click
 * @param {string} tag - Tag to filter by (or 'all')
 */
function handleTagFilterClick(tag) {
    currentTagFilter = tag;

    // Update button states
    document.querySelectorAll('.tag-filter-btn').forEach(btn => {
        if (btn.dataset.tag === tag) {
            btn.classList.add('active', 'bg-indigo-100', 'text-indigo-700');
            btn.classList.remove('hover:bg-gray-100');
        } else {
            btn.classList.remove('active', 'bg-indigo-100', 'text-indigo-700');
            btn.classList.add('hover:bg-gray-100');
        }
    });

    // Re-render grid with filter
    const searchInput = document.getElementById('exercise-selection-search');
    renderExerciseSelectionGrid(searchInput ? searchInput.value : '');
}

/**
 * Close exercise selection modal
 */
export function closeExerciseSelectionModal() {
    const modal = document.getElementById('exercise-selection-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    currentTagFilter = 'all';
}

/**
 * Render exercise selection grid
 * @param {string} searchTerm - Optional search term to filter exercises
 */
function renderExerciseSelectionGrid(searchTerm = '') {
    const grid = document.getElementById('exercise-selection-grid');
    if (!grid) return;

    // Filter exercises by tag filter
    let exercises = allExercisesForSelection;
    if (currentTagFilter !== 'all') {
        exercises = exercises.filter(ex =>
            ex.tags && ex.tags.includes(currentTagFilter)
        );
    }

    // Filter by search term
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        exercises = exercises.filter(ex =>
            ex.title.toLowerCase().includes(term) ||
            (ex.tags && ex.tags.some(tag => tag.toLowerCase().includes(term)))
        );
    }

    if (exercises.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-8 text-gray-500">Keine Übungen gefunden.</div>';
        return;
    }

    grid.innerHTML = '';

    exercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className = 'relative border rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer';
        card.onclick = () => addExerciseFromModal(exercise.id);

        // System badges (top corners)
        let systemBadges = '';
        if (exercise.tieredPoints?.enabled) {
            systemBadges += '<span class="absolute top-2 right-2 text-xs bg-blue-500 text-white px-2 py-1 rounded-full" title="Meilenstein-System">📊</span>';
        }
        if (exercise.partnerSystem?.enabled) {
            systemBadges += '<span class="absolute top-2 left-2 text-xs bg-purple-500 text-white px-2 py-1 rounded-full" title="Partner-System">👥</span>';
        }

        // Tags display
        let tagsHtml = '';
        if (exercise.tags && exercise.tags.length > 0) {
            tagsHtml = '<div class="flex flex-wrap gap-1 mt-2">';
            exercise.tags.slice(0, 3).forEach(tag => {
                tagsHtml += `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">${tag}</span>`;
            });
            if (exercise.tags.length > 3) {
                tagsHtml += `<span class="text-xs text-gray-500">+${exercise.tags.length - 3}</span>`;
            }
            tagsHtml += '</div>';
        }

        card.innerHTML = `
            ${systemBadges}
            <img src="${exercise.imageUrl || '/images/placeholder.png'}" alt="${exercise.title}" class="w-full h-40 object-cover">
            <div class="p-3">
                <h4 class="font-semibold text-gray-900 text-sm mb-1">${exercise.title}</h4>
                <div class="flex justify-between items-center text-xs text-gray-600">
                    <span class="capitalize">${exercise.level || 'standard'}</span>
                    <span class="font-bold text-indigo-600">+${exercise.points || 0} Pkt</span>
                </div>
                ${tagsHtml}
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * Add exercise from modal
 * @param {string} exerciseId - Exercise ID
 */
function addExerciseFromModal(exerciseId) {
    const exercise = allExercisesForSelection.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    // If callback is set, use it instead of default behavior
    if (modalCallback) {
        modalCallback(exercise);
        return;
    }

    // Default behavior: add to session planning (allow duplicates for multiple rounds)
    selectedExercises.push({
        exerciseId: exercise.id,
        name: exercise.title,
        points: exercise.points || 0,
        tieredPoints: exercise.tieredPoints?.enabled || false,
        partnerSystem: exercise.partnerSystem?.enabled || false
    });

    // Re-render list
    renderSelectedExercises();
}

/**
 * Remove exercise from the list by index
 * @param {number} index - Index in selectedExercises array
 */
export function removeExerciseFromList(index) {
    selectedExercises.splice(index, 1);
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

    selectedExercises.forEach((exercise, index) => {
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
            <button type="button" class="text-red-600 hover:text-red-800 text-sm font-bold" onclick="window.removeExerciseFromSessionPlan(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

/**
 * Get all selected exercises
 * Returns array in the format required for trainingSessions.plannedExercises
 * @returns {Array} Planned exercises
 */
export function getPlannedExercises() {
    return selectedExercises.map(exercise => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        points: exercise.points,
        tieredPoints: exercise.tieredPoints,
        partnerSystem: exercise.partnerSystem
    }));
}

/**
 * Load planned exercises into the UI (for editing existing sessions)
 * @param {Array} plannedExercises - Array of planned exercises
 */
export function loadPlannedExercises(plannedExercises) {
    if (!plannedExercises || !Array.isArray(plannedExercises)) {
        selectedExercises = [];
    } else {
        selectedExercises = plannedExercises.map(ex => ({
            exerciseId: ex.exerciseId,
            name: ex.name,
            points: ex.points || 0,
            tieredPoints: ex.tieredPoints || false,
            partnerSystem: ex.partnerSystem || false
        }));
    }
    renderSelectedExercises();
}

/**
 * Reset the session planning UI
 */
export function resetSessionPlanning() {
    selectedExercises = [];
    renderSelectedExercises();
}

/**
 * Initialize event listeners for session planning
 */
export function initializeSessionPlanningListeners() {
    // Open exercise selection modal button
    const openModalButton = document.getElementById('open-exercise-selection-button');
    if (openModalButton) {
        openModalButton.addEventListener('click', openExerciseSelectionModal);
        console.log('[Session Planning] Event listener attached to open-exercise-selection-button');
    } else {
        console.warn('[Session Planning] Button "open-exercise-selection-button" not found');
    }

    // Close exercise selection modal button
    const closeModalButton = document.getElementById('close-exercise-selection-modal-button');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeExerciseSelectionModal);
    }

    // Done selecting exercises button
    const doneButton = document.getElementById('done-selecting-exercises-button');
    if (doneButton) {
        doneButton.addEventListener('click', closeExerciseSelectionModal);
    }

    // Search input in exercise selection modal
    const searchInput = document.getElementById('exercise-selection-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderExerciseSelectionGrid(e.target.value);
        });
    }

    // Create new exercise button
    const createButton = document.getElementById('create-new-exercise-from-session-button');
    if (createButton) {
        createButton.addEventListener('click', openCreateExerciseModal);
        console.log('[Session Planning] Event listener attached to create-new-exercise-from-session-button');
    } else {
        console.warn('[Session Planning] Button "create-new-exercise-from-session-button" not found');
    }

    // Make remove function globally available
    window.removeExerciseFromSessionPlan = removeExerciseFromList;
}

/**
 * Open the exercise modal to create a new exercise
 */
function openCreateExerciseModal() {
    // Close the spontaneous session modal first
    const sessionModal = document.getElementById('spontaneous-session-modal');
    if (sessionModal) {
        sessionModal.classList.add('hidden');
        sessionModal.classList.remove('flex');
    }

    // Switch to "Übungen verwalten" tab
    const exercisesTab = document.querySelector('[data-tab="exercises"]');
    if (exercisesTab) {
        exercisesTab.click();

        // Scroll to the create exercise form
        setTimeout(() => {
            const createForm = document.getElementById('create-exercise-form');
            if (createForm) {
                createForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Focus on the title input
                const titleInput = document.getElementById('exercise-title-form');
                if (titleInput) titleInput.focus();
            }
        }, 300);
    } else {
        alert('Konnte nicht zum Übungen-Tab wechseln. Bitte öffne manuell den "Übungen verwalten"-Tab.');
    }
}
