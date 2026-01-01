/**
 * Trainingsplanung-Modul (Supabase-Version)
 * Verwaltet die Planung von Übungen für Trainingseinheiten
 */

let supabaseClient = null;
let selectedExercises = []; // Array von {exerciseId, name, points, tieredPoints}
let allExercisesForSelection = []; // Alle Übungen aus Datenbank geladen
let currentTagFilter = 'all'; // Aktueller aktiver Tag-Filter
let modalCallback = null; // Callback-Funktion wenn Übung ausgewählt wird
let tempModalSelection = []; // Temporäre Auswahl für Modal (in beiden Modi verwendet)

/**
 * Initialisiert das Trainingsplanung-Modul
 * @param {Object} supabaseInstance - Supabase-Client-Instanz
 */
export function initializeSessionPlanning(supabaseInstance) {
    supabaseClient = supabaseInstance;
}

/**
 * Lädt alle Übungen aus Datenbank (für Auswahl-Modal)
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
 * Öffnet das Übungsauswahl-Modal
 * @param {Function} callback - Optionale Callback-Funktion bei Übungsauswahl (statt Standardverhalten)
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

    // Sucheingabe fokussieren
    const searchInput = document.getElementById('exercise-selection-search');
    if (searchInput) {
        searchInput.value = '';
        setTimeout(() => searchInput.focus(), 100);
    }
}

/**
 * Rendert Tag-Filter-Buttons
 */
function renderTagFilters() {
    const container = document.getElementById('exercise-tag-filters');
    if (!container) return;

    // Alle eindeutigen Tags aus Übungen sammeln
    const allTags = new Set();
    allExercisesForSelection.forEach(ex => {
        if (ex.tags && Array.isArray(ex.tags)) {
            ex.tags.forEach(tag => allTags.add(tag));
        }
    });

    // "Alle"-Button behalten und Rest löschen
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
 * Verarbeitet Tag-Filter-Klick
 * @param {string} tag - Tag zum Filtern (oder 'all')
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

    // Grid mit Filter neu rendern
    const searchInput = document.getElementById('exercise-selection-search');
    renderExerciseSelectionGrid(searchInput ? searchInput.value : '');
}

/**
 * Schließt das Übungsauswahl-Modal
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
 * Rendert das Übungsauswahl-Grid
 * @param {string} searchTerm - Optionaler Suchbegriff zum Filtern
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

        // System-Badges (obere Ecken)
        let systemBadges = '';
        if (exercise.tieredPoints?.enabled) {
            systemBadges +=
                '<span class="absolute top-2 right-2 text-xs bg-blue-500 text-white px-2 py-1 rounded-full" title="Meilenstein-System">📊</span>';
        }

        // Tags-Anzeige
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

        // Auswahl-Indikator
        let selectionIndicator = '';
        if (isSelected) {
            selectionIndicator =
                '<div class="absolute top-2 left-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold"><i class="fas fa-check"></i></div>';
        }

        // Bild oder Platzhalter (gleicher Stil wie globaler Übungskatalog)
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
 * Schaltet Übungsauswahl im Modal um
 * @param {Object} exercise - Übungs-Objekt
 */
function toggleExerciseSelection(exercise) {
    const existingIndex = tempModalSelection.findIndex(ex => ex.exerciseId === exercise.id);

    if (existingIndex >= 0) {
        // Abwählen - aus temporärer Auswahl entfernen
        tempModalSelection.splice(existingIndex, 1);
    } else {
        // Auswählen - zu temporärer Auswahl hinzufügen
        tempModalSelection.push({
            exerciseId: exercise.id,
            name: exercise.title,
            points: exercise.points || 0,
            tieredPoints: exercise.tieredPoints?.enabled || false,
        });
    }

    // Grid neu rendern um Auswahlzustand zu zeigen
    const searchInput = document.getElementById('exercise-selection-search');
    renderExerciseSelectionGrid(searchInput ? searchInput.value : '');

    // Zähler aktualisieren
    updateSelectionCounter();
}

/**
 * Aktualisiert die Auswahl-Zähler-Anzeige
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
 * Bestätigt Auswahl und schließt Modal
 */
function confirmSelectionAndClose() {
    if (tempModalSelection.length === 0) {
        return; // Nichts hinzuzufügen
    }

    if (modalCallback) {
        // Callback-Modus: Jede ausgewählte Übung an Callback übergeben
        tempModalSelection.forEach(exercise => {
            modalCallback(exercise);
        });
    } else {
        // Trainingsplanung-Modus: Alle zu selectedExercises hinzufügen
        tempModalSelection.forEach(exercise => {
            selectedExercises.push(exercise);
        });
        renderSelectedExercises();
    }

    closeExerciseSelectionModal();
}

/**
 * Übung aus Modal hinzufügen (VERALTET - für Kompatibilität)
 * @param {string} exerciseId - Übungs-ID
 */
function addExerciseFromModal(exerciseId) {
    const exercise = allExercisesForSelection.find(ex => ex.id === exerciseId);
    if (!exercise) return;

    // Falls Callback gesetzt, diesen statt Standardverhalten nutzen
    if (modalCallback) {
        modalCallback(exercise);
        return;
    }

    // Standardverhalten: zu Trainingsplanung hinzufügen (Duplikate für mehrere Runden erlaubt)
    selectedExercises.push({
        exerciseId: exercise.id,
        name: exercise.title,
        points: exercise.points || 0,
        tieredPoints: exercise.tieredPoints?.enabled || false,
    });

    // Liste neu rendern
    renderSelectedExercises();
}

/**
 * Entfernt Übung aus Liste nach Index
 * @param {number} index - Index im selectedExercises-Array
 */
export function removeExerciseFromList(index) {
    selectedExercises.splice(index, 1);
    renderSelectedExercises();
}

/**
 * Rendert die Liste der ausgewählten Übungen
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
 * Gibt alle ausgewählten Übungen zurück
 * Gibt Array im Format für trainingSessions.plannedExercises zurück
 * @returns {Array} Geplante Übungen
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
 * Lädt geplante Übungen in die UI (zum Bearbeiten existierender Sessions)
 * @param {Array} plannedExercises - Array geplanter Übungen
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
 * Setzt die Trainingsplanung-UI zurück
 */
export function resetSessionPlanning() {
    selectedExercises = [];
    renderSelectedExercises();
}

/**
 * Initialisiert Event-Listener für Trainingsplanung
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

    // Zu "Übungen verwalten"-Tab wechseln
    const exercisesTab = document.querySelector('[data-tab="exercises"]');
    if (exercisesTab) {
        exercisesTab.click();

        // Zum Übung-erstellen-Formular scrollen
        setTimeout(() => {
            const createForm = document.getElementById('create-exercise-form');
            if (createForm) {
                createForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Titel-Eingabe fokussieren
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
