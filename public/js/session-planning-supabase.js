/**
 * Session Planning Module (Supabase Version)
 * Handles the planning of exercises for training sessions
 */

let supabaseClient = null;
let selectedExercises = []; // Array of {exerciseId, name, points, tieredPoints}
let allExercisesForSelection = []; // All exercises loaded from database
let currentTagFilter = 'all'; // Current active tag filter
let modalCallback = null; // Callback function for when an exercise is selected
let tempModalSelection = []; // Temporary selection for modal (used in both modes)

/**
 * Initialize the session planning module
 * @param {Object} supabaseInstance - Supabase client instance
 */
export function initializeSessionPlanning(supabaseInstance) {
    supabaseClient = supabaseInstance;
}

/**
 * Load all exercises from database (for selection modal)
 * @param {Object} supabase - Supabase client instance
 */
export async function loadExercisesForSelection(supabase) {
    try {
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .order('name', { ascending: true });

        if (error) throw error;

        allExercisesForSelection = (data || []).map(ex => ({
            id: ex.id,
            title: ex.name || ex.title,
            name: ex.name,
            description: ex.description,
            points: ex.xp_reward || ex.points || 10,
            level: ex.difficulty || ex.level,
            tags: ex.category ? [ex.category] : (ex.tags || []),
            imageUrl: ex.image_url,
            tieredPoints: ex.tiered_points,
            clubId: ex.club_id,
            createdBy: ex.created_by,
            createdAt: ex.created_at
        }));

        console.log(
            `[Session Planning] Loaded ${allExercisesForSelection.length} exercises for selection`
        );
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

    // Callback setzen (null bedeutet Standard-Trainingsplanung)
    modalCallback = callback;

    // Temporäre Auswahl zurücksetzen
    tempModalSelection = [];

    // Filter zurücksetzen
    currentTagFilter = 'all';

    // Tag-Filter-Buttons generieren
    renderTagFilters();

    // Übungen rendern
    renderExerciseSelectionGrid();

    // Zähler aktualisieren
    updateSelectionCounter();

    // Modal anzeigen
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

    // Tag-Filter-Buttons hinzufügen
    Array.from(allTags)
        .sort()
        .forEach(tag => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className =
                'tag-filter-btn px-3 py-1 text-xs rounded-full border border-gray-300 hover:bg-gray-100 transition';
            btn.dataset.tag = tag;
            btn.textContent = tag;
            btn.addEventListener('click', () => handleTagFilterClick(tag));
            container.appendChild(btn);
        });

    // Klick-Handler für "Alle"-Button hinzufügen
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

    // Button-Zustände aktualisieren
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
    modalCallback = null; // Callback zurücksetzen
    tempModalSelection = []; // Temporäre Auswahl zurücksetzen
}

/**
 * Render exercise selection grid
 * @param {string} searchTerm - Optional search term to filter exercises
 */
function renderExerciseSelectionGrid(searchTerm = '') {
    const grid = document.getElementById('exercise-selection-grid');
    if (!grid) return;

    // Übungen nach Tag-Filter filtern
    let exercises = allExercisesForSelection;
    if (currentTagFilter !== 'all') {
        exercises = exercises.filter(ex => ex.tags && ex.tags.includes(currentTagFilter));
    }

    // Nach Suchbegriff filtern
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        exercises = exercises.filter(
            ex =>
                ex.title.toLowerCase().includes(term) ||
                (ex.tags && ex.tags.some(tag => tag.toLowerCase().includes(term)))
        );
    }

    if (exercises.length === 0) {
        grid.innerHTML =
            '<div class="col-span-full text-center py-8 text-gray-500">Keine Übungen gefunden.</div>';
        return;
    }

    grid.innerHTML = '';

    exercises.forEach(exercise => {
        // Prüfen ob diese Übung in temporärer Auswahl ist
        const isSelected = tempModalSelection.find(ex => ex.exerciseId === exercise.id);

        const card = document.createElement('div');
        card.className = `relative border-2 rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer ${
            isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-indigo-300'
        }`;
        card.onclick = () => toggleExerciseSelection(exercise);

        // System badges (top corners)
        let systemBadges = '';
        if (exercise.tieredPoints?.enabled) {
            systemBadges +=
                '<span class="absolute top-2 right-2 text-xs bg-blue-500 text-white px-2 py-1 rounded-full" title="Meilenstein-System">📊</span>';
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

        // Selection indicator
        let selectionIndicator = '';
        if (isSelected) {
            selectionIndicator =
                '<div class="absolute top-2 left-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"><i class="fas fa-check"></i></div>';
        }

        // Image or subtle placeholder (same style as global exercise catalog)
        let imageHtml = '';
        if (exercise.imageUrl) {
            imageHtml = `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-40 object-cover" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                         <div class="w-full h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border-b border-gray-200" style="display: none;">
                             <div class="text-center">
                                 <svg class="w-12 h-12 mx-auto text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                 </svg>
                                 <p class="text-xs text-gray-400">Kein Bild</p>
                             </div>
                         </div>`;
        } else {
            imageHtml = `<div class="w-full h-40 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border-b border-gray-200">
                             <div class="text-center">
                                 <svg class="w-12 h-12 mx-auto text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                     <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                 </svg>
                                 <p class="text-xs text-gray-400">Kein Bild</p>
                             </div>
                         </div>`;
        }

        card.innerHTML = `
            ${selectionIndicator}
            ${systemBadges}
            ${imageHtml}
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
 * Toggle exercise selection in modal
 * @param {Object} exercise - Exercise object
 */
function toggleExerciseSelection(exercise) {
    const existingIndex = tempModalSelection.findIndex(ex => ex.exerciseId === exercise.id);

    if (existingIndex >= 0) {
        // Deselect - remove from temp selection
        tempModalSelection.splice(existingIndex, 1);
    } else {
        // Select - add to temp selection
        tempModalSelection.push({
            exerciseId: exercise.id,
            name: exercise.title,
            points: exercise.points || 0,
            tieredPoints: exercise.tieredPoints?.enabled || false,
        });
    }

    // Re-render grid to show selection state
    const searchInput = document.getElementById('exercise-selection-search');
    renderExerciseSelectionGrid(searchInput ? searchInput.value : '');

    // Zähler aktualisieren
    updateSelectionCounter();
}

/**
 * Update selection counter display
 */
function updateSelectionCounter() {
    const counterElement = document.getElementById('exercise-selection-counter');
    const doneButton = document.getElementById('done-selecting-exercises-button');

    if (counterElement) {
        const count = tempModalSelection.length;
        if (count > 0) {
            counterElement.innerHTML = `<span class="text-green-600 font-semibold">${count} Übung${count > 1 ? 'en' : ''} ausgewählt</span>`;
        } else {
            counterElement.innerHTML =
                '<span class="text-gray-500">Keine Übungen ausgewählt</span>';
        }
    }

    if (doneButton) {
        const count = tempModalSelection.length;
        if (count > 0) {
            doneButton.innerHTML = `<i class="fas fa-check mr-2"></i> ${count} Übung${count > 1 ? 'en' : ''} hinzufügen`;
            doneButton.disabled = false;
            doneButton.classList.remove('bg-gray-400', 'cursor-not-allowed');
            doneButton.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
        } else {
            doneButton.innerHTML = '<i class="fas fa-check mr-2"></i> Übungen hinzufügen';
            doneButton.disabled = true;
            doneButton.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
            doneButton.classList.add('bg-gray-400', 'cursor-not-allowed');
        }
    }
}

/**
 * Confirm selection and close modal
 */
function confirmSelectionAndClose() {
    if (tempModalSelection.length === 0) {
        return; // Nothing to add
    }

    if (modalCallback) {
        // Callback mode: Pass each selected exercise to the callback
        tempModalSelection.forEach(exercise => {
            modalCallback(exercise);
        });
    } else {
        // Session planning mode: Add all to selectedExercises
        tempModalSelection.forEach(exercise => {
            selectedExercises.push(exercise);
        });
        renderSelectedExercises();
    }

    closeExerciseSelectionModal();
}

/**
 * Add exercise from modal (DEPRECATED - keeping for compatibility)
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
        container.innerHTML =
            '<p class="text-xs text-gray-500 text-center py-2">Keine Übungen ausgewählt</p>';
        return;
    }

    container.innerHTML = '';

    selectedExercises.forEach((exercise, index) => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-2 bg-white border rounded';

        let badges = '';
        if (exercise.tieredPoints) {
            badges +=
                '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
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
    // Übungsauswahl-Modal öffnen Button
    const openModalButton = document.getElementById('open-exercise-selection-button');
    if (openModalButton) {
        openModalButton.addEventListener('click', () => openExerciseSelectionModal());
        console.log('[Session Planning] Event listener attached to open-exercise-selection-button');
    } else {
        console.warn('[Session Planning] Button "open-exercise-selection-button" not found');
    }

    // Übungsauswahl-Modal schließen Button
    const closeModalButton = document.getElementById('close-exercise-selection-modal-button');
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeExerciseSelectionModal);
    }

    // Done selecting exercises button
    const doneButton = document.getElementById('done-selecting-exercises-button');
    if (doneButton) {
        doneButton.addEventListener('click', confirmSelectionAndClose);
    }

    // Sucheingabe im Übungsauswahl-Modal
    const searchInput = document.getElementById('exercise-selection-search');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            renderExerciseSelectionGrid(e.target.value);
        });
    }

    // Neue Übung erstellen Button
    const createButton = document.getElementById('create-new-exercise-from-session-button');
    if (createButton) {
        createButton.addEventListener('click', openCreateExerciseModal);
        console.log(
            '[Session Planning] Event listener attached to create-new-exercise-from-session-button'
        );
    } else {
        console.warn(
            '[Session Planning] Button "create-new-exercise-from-session-button" not found'
        );
    }

    // Make remove function globally available
    window.removeExerciseFromSessionPlan = removeExerciseFromList;
}

/**
 * Open the exercise modal to create a new exercise
 */
function openCreateExerciseModal() {
    // Erst das spontane Trainings-Modal schließen
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
        alert(
            'Konnte nicht zum Übungen-Tab wechseln. Bitte öffne manuell den "Übungen verwalten"-Tab.'
        );
    }
}
