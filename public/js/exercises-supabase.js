// Übungen-Modul - Supabase-Version
// 1:1 Migration von exercises.js - Firebase → Supabase

import { getSupabase } from './supabase-init.js';
import { renderTableForDisplay } from './tableEditor.js';
import { escapeHtml } from './utils/security.js';

let exerciseContext = {
    db: null,
    userId: null,
    userRole: null,
    clubId: null,
    sportId: null,
    descriptionEditor: null,
};

/**
 * Setzt den Kontext für Übungs-Fortschrittsverfolgung
 */
export function setExerciseContext(db, userId, userRole, clubId = null, sportId = null, descriptionEditor = null) {
    exerciseContext.db = db;
    exerciseContext.userId = userId;
    exerciseContext.userRole = userRole;
    exerciseContext.clubId = clubId;
    exerciseContext.sportId = sportId;
    exerciseContext.descriptionEditor = descriptionEditor;
}

/**
 * Setzt den Beschreibungs-Editor für Übungen (nachträglich)
 */
export function setExerciseDescriptionEditor(editor) {
    exerciseContext.descriptionEditor = editor;
}

/**
 * Lädt Übungen für das Dashboard mit Tag-Filterung
 */
export async function loadExercises(db, unsubscribes) {
    const exercisesListEl = document.getElementById('exercises-list');
    if (!exercisesListEl) return;

    let exercisesData = [];
    let allExerciseItems = []; // Speichert alle Übungs-Items für die Suche

    await loadExercisesList();

    const subscription = db
        .channel('exercises-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'exercises'
        }, () => {
            loadExercisesList();
        })
        .subscribe();

    if (unsubscribes) {
        unsubscribes.push(() => subscription.unsubscribe());
    }

    // Suchfunktion einrichten
    setupExerciseSearch();

    async function loadExercisesList() {
        let query = db
            .from('exercises')
            .select('*')
            .order('created_at', { ascending: false });

        const activeSportId = exerciseContext.sportId;
        if (activeSportId) {
            // Zeige Übungen für die aktive Sportart ODER globale Übungen (ohne Sportart)
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: exercisesRaw, error } = await query;

        if (error || !exercisesRaw || exercisesRaw.length === 0) {
            exercisesListEl.innerHTML = `<p class="p-4 text-gray-500 text-center">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        exercisesListEl.innerHTML = '';
        const allTags = new Set();
        const exercises = [];
        exercisesData = [];
        allExerciseItems = [];

        const userClubId = exerciseContext.clubId;
        const visibleDocs = exercisesRaw.filter(exercise => {
            if (!exercise.visibility || exercise.visibility === 'global') {
                return true;
            }
            if (exercise.visibility === 'club') {
                return userClubId && exercise.club_id === userClubId;
            }
            return false;
        });

        if (visibleDocs.length === 0) {
            exercisesListEl.innerHTML = `<p class="p-4 text-gray-500 text-center">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        for (const exerciseRow of visibleDocs) {
            const exercise = mapExerciseFromSupabase(exerciseRow);
            const exerciseId = exerciseRow.id;

            exercisesData.push({ exercise, exerciseId });

            const item = createExerciseCard({ id: exerciseId }, exercise);
            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            exercises.push({ card: item, tags: exerciseTags });
            allExerciseItems.push({ item, title: exercise.title || '', tags: exerciseTags });
            exercisesListEl.appendChild(item);
        }

        renderTagFilters(allTags, exercises);
    }

    function setupExerciseSearch() {
        const searchInput = document.getElementById('exercise-search-input');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();

            allExerciseItems.forEach(({ item, title }) => {
                const matchesSearch = !searchTerm || title.toLowerCase().includes(searchTerm);
                const isTagHidden = item.classList.contains('tag-hidden');

                if (matchesSearch) {
                    item.classList.remove('search-hidden');
                    if (!isTagHidden) {
                        item.style.display = '';
                    }
                } else {
                    item.classList.add('search-hidden');
                    item.style.display = 'none';
                }
            });
        });
    }
}

/**
 * Konvertiert Supabase-Übungszeile ins erwartete Format
 * Hinweis: DB verwendet 'name', App erwartet 'title' - wir mappen beide für Kompatibilität
 */
function mapExerciseFromSupabase(row) {
    // JSONB aus DB kann Objekt oder String sein, stelle sicher dass es ein String ist
    let descriptionContent = row.description_content;
    if (descriptionContent && typeof descriptionContent === 'object') {
        descriptionContent = JSON.stringify(descriptionContent);
    }

    return {
        id: row.id,
        title: row.name || row.title,
        name: row.name,
        description: row.description,
        descriptionContent: descriptionContent,
        imageUrl: row.image_url,
        points: row.xp_reward || row.points || 10,
        level: row.category || row.difficulty || row.level,  // category wird in handleCreateExercise verwendet
        difficulty: row.difficulty,
        category: row.category,
        tags: row.tags || [],
        visibility: row.visibility || 'global',
        clubId: row.club_id,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        tieredPoints: row.tiered_points,
        recordHolderName: row.record_holder_name,
        recordHolderClub: row.record_holder_club,
        recordCount: row.record_count,
        procedure: row.procedure,
        unit: row.unit || 'Wiederholungen',
        animationSteps: row.animation_steps,
    };
}

/**
 * Berechnet die maximalen Punkte einer Übung
 * Bei Meilensteinen werden alle Punkte zusammengerechnet
 */
function calculateMaxPoints(exercise) {
    if (exercise.tieredPoints && exercise.tieredPoints.enabled && exercise.tieredPoints.milestones) {
        const milestones = exercise.tieredPoints.milestones;
        return milestones.reduce((sum, m) => sum + (m.points || 0), 0);
    }
    return exercise.points || 0;
}

/**
 * Erstellt HTML für ein Übungs-Listenelement (neue Listen-Ansicht)
 */
function createExerciseCard(docSnap, exercise) {
    const item = document.createElement('div');
    item.className =
        'exercise-item flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors';
    item.dataset.id = docSnap.id;
    item.dataset.title = exercise.title;

    if (exercise.descriptionContent) {
        item.dataset.descriptionContent = typeof exercise.descriptionContent === 'string'
            ? exercise.descriptionContent
            : JSON.stringify(exercise.descriptionContent);
    } else {
        item.dataset.descriptionContent = JSON.stringify({
            type: 'text',
            text: exercise.description || '',
        });
    }
    if (exercise.imageUrl) {
        item.dataset.imageUrl = exercise.imageUrl;
    }
    item.dataset.points = exercise.points;
    item.dataset.tags = JSON.stringify(exercise.tags || []);

    if (exercise.tieredPoints) {
        item.dataset.tieredPoints = JSON.stringify(exercise.tieredPoints);
    }

    if (exercise.animationSteps) {
        item.dataset.animationSteps = typeof exercise.animationSteps === 'string'
            ? exercise.animationSteps
            : JSON.stringify(exercise.animationSteps);
    }

    const maxPoints = calculateMaxPoints(exercise);
    const safeTitle = escapeHtml(exercise.title || '');

    item.innerHTML = `
        <span class="text-gray-900 font-medium truncate pr-4">${safeTitle}</span>
        <div class="flex items-center gap-3 flex-shrink-0">
            <span class="text-sm text-gray-500 border border-gray-300 rounded-full px-3 py-1">${maxPoints} XP</span>
            <i class="fas fa-chevron-right text-gray-400"></i>
        </div>`;

    return item;
}

/**
 * Rendert Tag-Filter-Buttons für die Übungsliste
 */
export function renderTagFilters(tags, exercises) {
    const oldContainer = document.getElementById('tags-filter-container');
    if (!oldContainer) {
        console.warn('[Exercises] tags-filter-container not found');
        return;
    }

    // Container klonen um alte Event Listener zu entfernen
    const filterContainer = oldContainer.cloneNode(false);
    oldContainer.parentNode.replaceChild(filterContainer, oldContainer);

    const allButton = document.createElement('button');
    allButton.className =
        'tag-filter-btn active-filter bg-indigo-600 text-white px-3 py-1 text-sm font-semibold rounded-full';
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    filterContainer.appendChild(allButton);

    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className =
            'tag-filter-btn bg-gray-200 text-gray-700 px-3 py-1 text-sm font-semibold rounded-full hover:bg-gray-300';
        button.textContent = tag;
        button.dataset.tag = tag;
        filterContainer.appendChild(button);
    });

    setupTagFilterToggle('player');
    setupTagSearch('player');

    filterContainer.addEventListener('click', e => {
        if (e.target.classList.contains('tag-filter-btn')) {
            const selectedTag = e.target.dataset.tag;

            filterContainer.querySelectorAll('.tag-filter-btn').forEach(btn => {
                btn.classList.remove('active-filter', 'bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.target.classList.add('active-filter', 'bg-indigo-600', 'text-white');
            e.target.classList.remove('bg-gray-200', 'text-gray-700');

            exercises.forEach(({ card, tags }) => {
                if (selectedTag === 'all' || tags.includes(selectedTag)) {
                    card.classList.remove('tag-hidden');
                    // Nur anzeigen wenn auch nicht durch Suche versteckt
                    if (!card.classList.contains('search-hidden')) {
                        card.style.display = '';
                    }
                } else {
                    card.classList.add('tag-hidden');
                    card.style.display = 'none';
                }
            });
        }
    });
}

/**
 * Lädt alle Übungen für Coach-Ansicht
 */
export function loadAllExercises(db) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    let allExerciseItems = []; // Für die Suchfunktion

    loadCoachExercisesList();

    db.channel('coach-exercises-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'exercises'
        }, () => {
            loadCoachExercisesList();
        })
        .subscribe();

    // Suchfunktion einrichten
    setupCoachExerciseSearch();

    async function loadCoachExercisesList() {
        let query = db
            .from('exercises')
            .select('*')
            .order('created_at', { ascending: false });

        const activeSportId = exerciseContext.sportId;
        if (activeSportId) {
            // Zeige Übungen für die aktive Sportart ODER globale Übungen (ohne Sportart)
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: exercisesRaw, error } = await query;

        if (error) {
            console.error('[Exercises] Error loading exercises:', error.message);
            exercisesListCoachEl.innerHTML =
                '<p class="p-4 text-gray-500 text-center">Keine Übungen verfügbar</p>';
            return;
        }

        const allExercises = (exercisesRaw || []).map(row => ({
            id: row.id,
            ...mapExerciseFromSupabase(row)
        }));
        const allTags = new Set();

        const userClubId = exerciseContext.clubId;
        const exercises = allExercises.filter(exercise => {
            if (!exercise.visibility || exercise.visibility === 'global') {
                return true;
            }
            if (exercise.visibility === 'club') {
                return userClubId && exercise.clubId === userClubId;
            }
            return false;
        });

        exercises.forEach(exercise => {
            (exercise.tags || []).forEach(tag => allTags.add(tag));
        });

        allExerciseItems = renderCoachExercises(exercises, 'all');
        renderTagFiltersCoach(allTags, exercises, allExerciseItems);
    }

    function setupCoachExerciseSearch() {
        const searchInput = document.getElementById('exercise-search-input-coach');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();

            allExerciseItems.forEach(({ item, title }) => {
                const matchesSearch = !searchTerm || title.toLowerCase().includes(searchTerm);
                const isTagHidden = item.classList.contains('tag-hidden');

                if (matchesSearch) {
                    item.classList.remove('search-hidden');
                    if (!isTagHidden) {
                        item.style.display = '';
                    }
                } else {
                    item.classList.add('search-hidden');
                    item.style.display = 'none';
                }
            });
        });
    }
}

/**
 * Rendert Tag-Filter-Buttons für Coach-Übungsliste
 */
function renderTagFiltersCoach(tags, exercises, allExerciseItems) {
    const oldContainer = document.getElementById('tags-filter-container-coach');
    if (!oldContainer) return;

    // Container klonen um alte Event Listener zu entfernen
    const filterContainer = oldContainer.cloneNode(false);
    oldContainer.parentNode.replaceChild(filterContainer, oldContainer);

    const allButton = document.createElement('button');
    allButton.className =
        'tag-filter-btn active-filter bg-indigo-600 text-white px-3 py-1 text-sm font-semibold rounded-full';
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    filterContainer.appendChild(allButton);

    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className =
            'tag-filter-btn bg-gray-200 text-gray-700 px-3 py-1 text-sm font-semibold rounded-full hover:bg-gray-300';
        button.textContent = tag;
        button.dataset.tag = tag;
        filterContainer.appendChild(button);
    });

    setupTagFilterToggle('coach');
    setupTagSearch('coach');

    filterContainer.addEventListener('click', e => {
        if (e.target.classList.contains('tag-filter-btn')) {
            const selectedTag = e.target.dataset.tag;

            filterContainer.querySelectorAll('.tag-filter-btn').forEach(btn => {
                btn.classList.remove('active-filter', 'bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.target.classList.add('active-filter', 'bg-indigo-600', 'text-white');
            e.target.classList.remove('bg-gray-200', 'text-gray-700');

            // Filter Items basierend auf Tag (mit Berücksichtigung der Suche)
            allExerciseItems.forEach(({ item, tags }) => {
                const matchesTag = selectedTag === 'all' || tags.includes(selectedTag);
                const isSearchHidden = item.classList.contains('search-hidden');

                if (matchesTag) {
                    item.classList.remove('tag-hidden');
                    if (!isSearchHidden) {
                        item.style.display = '';
                    }
                } else {
                    item.classList.add('tag-hidden');
                    item.style.display = 'none';
                }
            });
        }
    });
}

/**
 * Richtet Toggle-Funktionalität für Tag-Filter ein
 */
function setupTagFilterToggle(context) {
    const toggleButton = document.getElementById(`toggle-tags-filter-${context}`);
    const filterSection = document.getElementById(`tags-filter-section-${context}`);

    if (!toggleButton || !filterSection) {
        console.warn(`[Exercises] Toggle elements not found for context: ${context}`);
        return;
    }

    // Event Listener direkt hinzufügen (ohne Klonen, da Button einfach ist)
    toggleButton.onclick = () => {
        filterSection.classList.toggle('hidden');
    };
}

/**
 * Richtet Suchfunktionalität für Tag-Filter ein
 */
function setupTagSearch(context) {
    const searchInput = document.getElementById(`tag-search-${context}`);
    const filterContainer = document.getElementById(`tags-filter-container-${context}`);

    if (!searchInput || !filterContainer) return;

    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', e => {
        const searchTerm = e.target.value.toLowerCase();
        const buttons = filterContainer.querySelectorAll('.tag-filter-btn');

        buttons.forEach(button => {
            const tagText = button.textContent.toLowerCase();
            if (tagText.includes(searchTerm)) {
                button.classList.remove('hidden');
            } else {
                button.classList.add('hidden');
            }
        });
    });
}

/**
 * Rendert Coach-Übungskarten mit optionaler Tag-Filterung
 */
function renderCoachExercises(exercises, filterTag) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return [];

    exercisesListCoachEl.innerHTML = '';
    const allExerciseItems = [];

    const filteredExercises =
        filterTag === 'all'
            ? exercises
            : exercises.filter(ex => (ex.tags || []).includes(filterTag));

    if (filteredExercises.length === 0) {
        exercisesListCoachEl.innerHTML =
            '<p class="p-4 text-gray-500 text-center">Keine Übungen für diesen Filter gefunden.</p>';
        return allExerciseItems;
    }

    filteredExercises.forEach(exercise => {
        const currentUserId = exerciseContext.userId;
        const isCreator = currentUserId && exercise.createdBy === currentUserId;
        const isAdmin = exerciseContext.userRole === 'admin';
        const canEdit = isCreator || isAdmin;

        const maxPoints = calculateMaxPoints(exercise);
        const safeTitle = escapeHtml(exercise.title || '');
        const exerciseTags = exercise.tags || [];

        const item = document.createElement('div');
        item.className = 'exercise-item flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors';
        item.dataset.id = exercise.id;
        item.dataset.tags = JSON.stringify(exerciseTags);

        // Visibility Badge
        const visibilityIcon = exercise.visibility === 'club' ? '🏠' : '🌍';

        item.innerHTML = `
            <div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="window.location.href='/exercise-detail.html?id=${exercise.id}'">
                <span class="text-gray-900 font-medium truncate">${safeTitle}</span>
                <span class="text-xs flex-shrink-0">${visibilityIcon}</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-sm text-gray-500 border border-gray-300 rounded-full px-3 py-1">${maxPoints} XP</span>
                ${canEdit ? `
                <button onclick="event.stopPropagation(); editExercise('${exercise.id}')" class="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Bearbeiten">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="event.stopPropagation(); deleteExercise('${exercise.id}')" class="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Löschen">
                    <i class="fas fa-trash"></i>
                </button>
                ` : `
                <i class="fas fa-chevron-right text-gray-400 cursor-pointer" onclick="window.location.href='/exercise-detail.html?id=${exercise.id}'"></i>
                `}
            </div>`;

        exercisesListCoachEl.appendChild(item);
        allExerciseItems.push({ item, title: exercise.title || '', tags: exerciseTags });
    });

    return allExerciseItems;
}

/**
 * Lädt Übungen in ein Dropdown für Punktevergabe
 */
export function loadExercisesForDropdown(db) {
    const select = document.getElementById('exercise-select');
    if (!select) return;

    loadDropdown();

    db.channel('exercises-dropdown-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'exercises'
        }, () => {
            loadDropdown();
        })
        .subscribe();

    async function loadDropdown() {
        const { data: exercisesRaw, error } = await db
            .from('exercises')
            .select('*')
            .order('name', { ascending: true });

        if (error || !exercisesRaw || exercisesRaw.length === 0) {
            select.innerHTML = '<option value="">Keine Übungen in DB</option>';
            return;
        }

        select.innerHTML = '<option value="">Übung wählen...</option>';

        exercisesRaw.forEach(row => {
            const e = mapExerciseFromSupabase(row);
            const option = document.createElement('option');
            option.value = row.id;

            const hasTieredPoints =
                e.tieredPoints?.enabled && e.tieredPoints?.milestones?.length > 0;
            const displayText = hasTieredPoints
                ? `${e.title} (bis zu ${e.points} P. - Meilensteine)`
                : `${e.title} (+${e.points} P.)`;

            option.textContent = displayText;
            option.dataset.points = e.points;
            option.dataset.title = e.title;
            option.dataset.hasMilestones = hasTieredPoints;
            option.dataset.unit = e.unit || 'Wiederholungen';

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(e.tieredPoints.milestones);
            }

            select.appendChild(option);
        });
    }
}

/**
 * Behandelt Übungs-Klick-Event (für Dashboard)
 */
export function handleExerciseClick(event) {
    const card = event.target.closest('[data-title]');
    if (card) {
        const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints, animationSteps } =
            card.dataset;
        openExerciseModal(id, title, descriptionContent, imageUrl, points, tags, tieredPoints, animationSteps);
    }
}

/**
 * Öffnet das Übungs-Modal mit Übungsdetails
 */
export async function openExerciseModal(
    exerciseId,
    title,
    descriptionContent,
    imageUrl,
    points,
    tags,
    tieredPoints,
    animationSteps = null
) {
    const modal = document.getElementById('exercise-modal');
    if (!modal) return;

    document.getElementById('modal-exercise-title').textContent = title;

    const modalImage = document.getElementById('modal-exercise-image');
    if (imageUrl) {
        modalImage.src = imageUrl;
        modalImage.alt = title;
        modalImage.style.display = 'block';
    } else {
        modalImage.style.display = 'none';
    }

    // Animation-Container handling
    const animationContainer = document.getElementById('modal-exercise-animation');
    const animationCanvas = document.getElementById('modal-animation-canvas');
    if (animationContainer && animationCanvas) {
        let animationData = null;

        // Parse animation steps from argument or from DB data
        if (animationSteps) {
            try {
                animationData = typeof animationSteps === 'string'
                    ? JSON.parse(animationSteps)
                    : animationSteps;
            } catch (e) {
                console.log('Could not parse animation steps:', e);
            }
        }

        if (animationData && animationData.steps && animationData.steps.length > 0) {
            animationContainer.classList.remove('hidden');

            // Initialize the exercise builder for the modal if TableTennisExerciseBuilder is available
            if (typeof window.TableTennisExerciseBuilder !== 'undefined') {
                // Clean up any existing player
                if (window.modalExerciseBuilder) {
                    window.modalExerciseBuilder.stopAnimation();
                }

                // Initialize new player
                window.modalExerciseBuilder = new window.TableTennisExerciseBuilder('modal-animation-canvas');

                // Load the steps
                animationData.steps.forEach(step => {
                    window.modalExerciseBuilder.addStep(
                        step.player,
                        step.strokeType,
                        step.side,
                        step.fromPosition,
                        step.toPosition,
                        step.isShort,
                        step.variants,
                        step.repetitions,
                        step.playerDecides
                    );
                });

                // Auto-play the animation
                window.modalExerciseBuilder.loopAnimation = true;
                window.modalExerciseBuilder.play();

                // Setup play/pause button
                const playPauseBtn = document.getElementById('modal-animation-play-pause');
                if (playPauseBtn) {
                    playPauseBtn.onclick = () => {
                        if (window.modalExerciseBuilder.isPlaying) {
                            window.modalExerciseBuilder.pause();
                            playPauseBtn.innerHTML = '<i class="fas fa-play mr-1"></i>Play';
                        } else {
                            window.modalExerciseBuilder.play();
                            playPauseBtn.innerHTML = '<i class="fas fa-pause mr-1"></i>Pause';
                        }
                    };
                    playPauseBtn.innerHTML = '<i class="fas fa-pause mr-1"></i>Pause';
                }
            }
        } else {
            animationContainer.classList.add('hidden');
            if (window.modalExerciseBuilder) {
                window.modalExerciseBuilder.stopAnimation();
            }
        }
    }

    // Lade Übungsdaten ZUERST (benötigt für Ablauf und Rekorde)
    let exerciseData = null;
    if (exerciseContext.db && exerciseId) {
        try {
            const { data } = await exerciseContext.db
                .from('exercises')
                .select('*')
                .eq('id', exerciseId)
                .single();

            if (data) {
                exerciseData = mapExerciseFromSupabase(data);
            }
        } catch (error) {
            console.log('Could not load exercise data:', error);
        }
    }

    const modalDescription = document.getElementById('modal-exercise-description');
    let descriptionData;
    try {
        descriptionData = JSON.parse(descriptionContent);
    } catch (e) {
        descriptionData = { type: 'text', text: descriptionContent || '' };
    }

    if (descriptionData.type === 'table') {
        const tableHtml = renderTableForDisplay(descriptionData.tableData);
        const additionalText = descriptionData.additionalText || '';
        modalDescription.innerHTML =
            tableHtml +
            (additionalText
                ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>`
                : '');
    } else {
        modalDescription.textContent = descriptionData.text || '';
        modalDescription.style.whiteSpace = 'pre-wrap';
    }

    const procedureContainer = document.getElementById('modal-exercise-procedure');
    if (procedureContainer && exerciseData?.procedure) {
        try {
            const procedureSteps = typeof exerciseData.procedure === 'string'
                ? JSON.parse(exerciseData.procedure)
                : exerciseData.procedure;

            if (Array.isArray(procedureSteps) && procedureSteps.length > 0) {
                const stepsHtml = procedureSteps.map((step, index) => {
                    const stepText = typeof step === 'string' ? step : step.text;
                    return `
                        <div class="flex gap-3 mb-2">
                            <span class="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">${index + 1}</span>
                            <p class="text-sm text-gray-700 flex-1">${escapeHtml(stepText)}</p>
                        </div>
                    `;
                }).join('');

                procedureContainer.innerHTML = `
                    <div class="mb-4 border-t border-gray-200 pt-3">
                        <h4 class="text-md font-bold text-gray-800 mb-3">Ablauf:</h4>
                        <div class="space-y-2">${stepsHtml}</div>
                    </div>
                `;
                procedureContainer.classList.remove('hidden');
            } else {
                procedureContainer.innerHTML = '';
                procedureContainer.classList.add('hidden');
            }
        } catch (e) {
            console.error('Error parsing procedure:', e);
            procedureContainer.innerHTML = '';
            procedureContainer.classList.add('hidden');
        }
    } else if (procedureContainer) {
        procedureContainer.innerHTML = '';
        procedureContainer.classList.add('hidden');
    }

    let tieredPointsData = null;
    try {
        if (tieredPoints) {
            tieredPointsData = JSON.parse(tieredPoints);
        }
    } catch (e) {
    }

    const pointsContainer = document.getElementById('modal-exercise-points');
    const milestonesContainer = document.getElementById('modal-exercise-milestones');

    const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;

    // Lade Spieler-Fortschritt für ALLE Übungen (nicht nur Meilenstein-Übungen)
    let playerProgress = null;
    if (
        exerciseContext.userRole === 'player' &&
        exerciseContext.db &&
        exerciseContext.userId &&
        exerciseId
    ) {
        try {
            if (hasTieredPoints) {
                // Für Meilenstein-Übungen: Verwende exercise_milestones
                const { data } = await exerciseContext.db
                    .from('exercise_milestones')
                    .select('*')
                    .eq('user_id', exerciseContext.userId)
                    .eq('exercise_id', exerciseId)
                    .maybeSingle();

                if (data) {
                    playerProgress = { currentCount: data.current_count || 0 };
                }
            } else {
                // Für normale Übungen: Verwende completed_exercises
                const { data } = await exerciseContext.db
                    .from('completed_exercises')
                    .select('*')
                    .eq('user_id', exerciseContext.userId)
                    .eq('exercise_id', exerciseId)
                    .maybeSingle();

                if (data) {
                    playerProgress = {
                        currentCount: data.current_count || data.count || 0,
                        bestScore: data.best_score
                    };
                }
            }
        } catch (error) {
            console.log('Could not load player progress:', error);
        }
    }

    const currentCount = playerProgress?.currentCount || 0;

    if (hasTieredPoints) {
        pointsContainer.textContent = `Bis zu ${points} P.`;

        if (milestonesContainer) {
            // Support both 'count' and 'completions' for backward compatibility
            const getMilestoneCount = (m) => m.count || m.completions;

            let progressHtml = '';
            if (exerciseContext.userRole === 'player') {
                const nextMilestone = tieredPointsData.milestones.find(m => getMilestoneCount(m) > currentCount);
                const remaining = nextMilestone ? getMilestoneCount(nextMilestone) - currentCount : 0;

                let globalRecordHtml = '';
                if (exerciseData && exerciseData.recordHolderName && exerciseData.recordCount) {
                    const clubInfo = exerciseData.recordHolderClub ? ` (${exerciseData.recordHolderClub})` : '';
                    globalRecordHtml = `
                        <div class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="font-bold text-gray-800">Globaler Rekordhalter</span>
                            </div>
                            <p class="text-base text-gray-700">
                                <span class="font-bold text-amber-600">${exerciseData.recordHolderName}${clubInfo}</span> mit <span class="font-bold text-amber-700">${exerciseData.recordCount} ${exerciseData.unit || 'Wiederholungen'}</span>
                            </p>
                        </div>
                    `;
                }

                progressHtml = `
                    <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="font-bold text-gray-800">Deine beste Leistung</span>
                        </div>
                        <p class="text-base text-gray-700 mb-2">
                            Persönlicher Rekord: <span class="font-bold text-blue-600">${currentCount} ${exerciseData?.unit || 'Wiederholungen'}</span>
                        </p>
                        ${
                            nextMilestone
                                ? `
                            <p class="text-sm text-gray-600">
                                Noch <span class="font-semibold text-orange-600">${remaining} ${exerciseData?.unit || 'Wiederholungen'}</span> bis zum nächsten Meilenstein
                            </p>
                        `
                                : `
                            <p class="text-sm text-green-600 font-semibold">
                                ✓ Alle Meilensteine erreicht!
                            </p>
                        `
                        }
                    </div>
                    ${globalRecordHtml}
                `;
            }

            const sortedMilestones = tieredPointsData.milestones.sort((a, b) => getMilestoneCount(a) - getMilestoneCount(b));

            // Kumulative Summe berechnen
            let cumulativePoints = 0;
            const milestonesHtml = sortedMilestones
                .map((milestone, index) => {
                    const milestoneCount = getMilestoneCount(milestone);
                    cumulativePoints += milestone.points;
                    const isFirst = index === 0;
                    const displayPoints = isFirst
                        ? milestone.points
                        : `+${milestone.points}`;

                    let bgColor, borderColor, iconColor, textColor;
                    if (exerciseContext.userRole === 'player') {
                        if (currentCount >= milestoneCount) {
                            bgColor = 'bg-gradient-to-r from-green-50 to-emerald-50';
                            borderColor = 'border-green-300';
                            iconColor = 'text-green-600';
                            textColor = 'text-green-700';
                        } else if (
                            index === 0 ||
                            currentCount >= getMilestoneCount(sortedMilestones[index - 1])
                        ) {
                            bgColor = 'bg-gradient-to-r from-orange-50 to-amber-50';
                            borderColor = 'border-orange-300';
                            iconColor = 'text-orange-600';
                            textColor = 'text-orange-700';
                        } else {
                            bgColor = 'bg-gradient-to-r from-gray-50 to-slate-50';
                            borderColor = 'border-gray-300';
                            iconColor = 'text-gray-500';
                            textColor = 'text-gray-600';
                        }
                    } else {
                        bgColor = 'bg-gradient-to-r from-indigo-50 to-purple-50';
                        borderColor = 'border-indigo-100';
                        iconColor = 'text-indigo-600';
                        textColor = 'text-gray-800';
                    }

                    return `<div class="flex justify-between items-center py-3 px-4 ${bgColor} rounded-lg mb-2 border ${borderColor}">
                        <div class="flex items-center gap-3">
                            <span class="text-base font-semibold ${textColor}">${milestoneCount} ${exerciseData?.unit || 'Wiederholungen'}</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold ${iconColor}">${displayPoints} P.</div>
                            <div class="text-xs text-gray-500 font-medium">Gesamt: ${cumulativePoints} P.</div>
                        </div>
                    </div>`;
                })
                .join('');

            milestonesContainer.innerHTML = `
                <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                    <h4 class="text-lg font-bold text-gray-800 mb-3">Meilensteine</h4>
                    ${progressHtml}
                    ${milestonesHtml}
                </div>`;
            milestonesContainer.classList.remove('hidden');
        }
    } else {
        // Normale Übung (keine Meilensteine) - aber zeige trotzdem Rekorde!
        pointsContainer.textContent = `+${points} P.`;
        if (milestonesContainer) {
            let recordsHtml = '';

            if (exerciseContext.userRole === 'player') {
                let globalRecordHtml = '';
                if (exerciseData && exerciseData.recordHolderName && exerciseData.recordCount) {
                    const clubInfo = exerciseData.recordHolderClub ? ` (${exerciseData.recordHolderClub})` : '';
                    globalRecordHtml = `
                        <div class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="font-bold text-gray-800">Globaler Rekordhalter</span>
                            </div>
                            <p class="text-base text-gray-700">
                                <span class="font-bold text-amber-600">${exerciseData.recordHolderName}${clubInfo}</span> mit <span class="font-bold text-amber-700">${exerciseData.recordCount} ${exerciseData.unit || 'Wiederholungen'}</span>
                            </p>
                        </div>
                    `;
                }

                let personalRecordHtml = '';
                if (currentCount > 0) {
                    personalRecordHtml = `
                        <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="font-bold text-gray-800">Deine beste Leistung</span>
                            </div>
                            <p class="text-base text-gray-700">
                                Persönlicher Rekord: <span class="font-bold text-blue-600">${currentCount} ${exerciseData?.unit || 'Wiederholungen'}</span>
                            </p>
                        </div>
                    `;
                }

                recordsHtml = `
                    <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                        <h4 class="text-lg font-bold text-gray-800 mb-3">Rekorde</h4>
                        ${personalRecordHtml || '<p class="text-sm text-gray-500 italic">Du hast diese Übung noch nicht absolviert.</p>'}
                        ${globalRecordHtml}
                    </div>
                `;
            }

            milestonesContainer.innerHTML = recordsHtml;
            milestonesContainer.classList.remove('hidden');
        }
    }

    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray
            .map(
                tag =>
                    `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`
            )
            .join('');
    } else {
        tagsContainer.innerHTML = '';
    }

    modal.classList.remove('hidden');
}

/**
 * Öffnet das Übungs-Modal aus Dataset (für Coach)
 */
export function openExerciseModalFromDataset(dataset) {
    const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints, animationSteps } = dataset;
    openExerciseModal(id, title, descriptionContent, imageUrl, points, tags, tieredPoints, animationSteps);
}

/**
 * Schließt das Übungs-Modal
 */
export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Berechnet Übungspunkte basierend auf Level und Schwierigkeit
 */
export function calculateExercisePoints(level, difficulty) {
    const pointsMatrix = {
        grundlagen: { easy: 5, normal: 6, hard: 8 },
        standard: { easy: 8, normal: 10, hard: 12 },
        fortgeschritten: { normal: 14, hard: 18 },
    };

    if (level === 'fortgeschritten' && difficulty === 'easy') {
        return pointsMatrix.fortgeschritten.normal;
    }

    return pointsMatrix[level]?.[difficulty] || 10;
}

/**
 * Aktualisiert Übungspunkte-Feld bei Änderung von Level oder Schwierigkeit
 */
export function setupExercisePointsCalculation() {
    const levelSelect = document.getElementById('exercise-level-form');
    const difficultySelect = document.getElementById('exercise-difficulty-form');
    const pointsInput = document.getElementById('exercise-points-form');

    if (!levelSelect || !difficultySelect || !pointsInput) return;

    const updatePoints = () => {
        const level = levelSelect.value;
        const difficulty = difficultySelect.value;

        if (level && difficulty) {
            const points = calculateExercisePoints(level, difficulty);
            pointsInput.value = points;

            const easyOption = difficultySelect.querySelector('option[value="easy"]');
            if (level === 'fortgeschritten') {
                easyOption.disabled = true;
                if (difficulty === 'easy') {
                    difficultySelect.value = 'normal';
                    updatePoints();
                }
            } else {
                easyOption.disabled = false;
            }
        }
    };

    levelSelect.addEventListener('change', updatePoints);
    difficultySelect.addEventListener('change', updatePoints);
}

/**
 * Richtet Meilenstein-System für Übungen ein
 */
export function setupExerciseMilestones() {
    const milestonesEnabled = document.getElementById('exercise-milestones-enabled');
    const standardContainer = document.getElementById('exercise-standard-points-container');
    const milestonesContainer = document.getElementById('exercise-milestones-container');
    const pointsInput = document.getElementById('exercise-points-form');

    if (!milestonesEnabled || !standardContainer || !milestonesContainer) {
        return;
    }

    const updateUI = () => {
        if (milestonesEnabled.checked) {
            standardContainer.classList.add('hidden');
            milestonesContainer.classList.remove('hidden');
            if (pointsInput) pointsInput.removeAttribute('required');
            if (getExerciseMilestones().length === 0) {
                addExerciseMilestone();
            }
        } else {
            standardContainer.classList.remove('hidden');
            milestonesContainer.classList.add('hidden');
            if (pointsInput) pointsInput.setAttribute('required', 'required');
        }
    };

    updateUI();
    milestonesEnabled.addEventListener('change', updateUI);

    const addBtn = document.getElementById('add-exercise-milestone-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addExerciseMilestone);
    }

    const form = document.getElementById('create-exercise-form');
    if (form) {
        form.addEventListener('reset', () => {
            setTimeout(() => {
                milestonesEnabled.checked = false;
                updateUI();
            }, 0);
        });
    }
}

/**
 * Fügt neue Meilenstein-Eingabezeile hinzu
 */
function addExerciseMilestone() {
    const list = document.getElementById('exercise-milestones-list');
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center bg-gray-50 p-2 rounded';
    row.innerHTML = `
        <input type="number"
               class="exercise-milestone-count w-16 px-2 py-1 border border-gray-300 rounded text-sm"
               placeholder="z.B. 1"
               min="1"
               required>
        <span class="text-gray-600 text-xs whitespace-nowrap">× →</span>
        <input type="number"
               class="exercise-milestone-points w-16 px-2 py-1 border border-gray-300 rounded text-sm"
               placeholder="Punkte"
               min="1"
               required>
        <span class="text-gray-600 text-xs">P.</span>
        <button type="button" class="remove-exercise-milestone text-red-600 hover:text-red-800 px-1 text-sm flex-shrink-0">
            🗑️
        </button>
    `;

    row.querySelector('.remove-exercise-milestone').addEventListener('click', () => {
        row.remove();
        updateExerciseTotalPoints();
    });

    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateExerciseTotalPoints);
    });

    list.appendChild(row);
    updateExerciseTotalPoints();
}

/**
 * Holt alle Meilensteine aus dem Formular
 */
function getExerciseMilestones() {
    const list = document.getElementById('exercise-milestones-list');
    if (!list) return [];

    const milestones = [];
    list.querySelectorAll('.flex').forEach(row => {
        const count = parseInt(row.querySelector('.exercise-milestone-count')?.value || 0);
        const points = parseInt(row.querySelector('.exercise-milestone-points')?.value || 0);
        if (count > 0 && points > 0) {
            milestones.push({ count, points });
        }
    });

    milestones.sort((a, b) => a.count - b.count);
    return milestones;
}

/**
 * Aktualisiert Anzeige der Gesamt-Meilenstein-Punkte
 */
function updateExerciseTotalPoints() {
    const milestones = getExerciseMilestones();
    const total = milestones.reduce((sum, m) => sum + m.points, 0);
    const totalEl = document.getElementById('exercise-total-milestone-points');
    if (totalEl) {
        totalEl.textContent = total;
    }
}

/**
 * Behandelt Übungserstellungs-Formular-Submit (für Coach)
 */
export async function handleCreateExercise(e, db, storage, descriptionEditor = null, userData = null) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const form = e.target;
    const isEditing = form.dataset.editingId;
    const title = document.getElementById('exercise-title-form').value;
    const level = document.getElementById('exercise-level-form').value;
    const difficulty = document.getElementById('exercise-difficulty-form').value;
    const file = document.getElementById('exercise-image-form').files[0];
    const tagsInput = document.getElementById('exercise-tags-form').value;
    const tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

    const visibilityRadio = document.querySelector('input[name="exercise-visibility"]:checked');
    const visibility = visibilityRadio?.value || 'global';

    const unitSelect = document.getElementById('exercise-unit-form');
    const unit = unitSelect?.value || 'Wiederholungen';

    const milestonesEnabled =
        document.getElementById('exercise-milestones-enabled')?.checked || false;
    let points = 0;
    let milestones = null;

    if (milestonesEnabled) {
        milestones = getExerciseMilestones();
        if (milestones.length === 0) {
            feedbackEl.textContent = 'Bitte mindestens einen Meilenstein hinzufügen.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
        points = milestones.reduce((sum, m) => sum + m.points, 0);
    } else {
        points = parseInt(document.getElementById('exercise-points-form').value);
        if (isNaN(points) || points <= 0) {
            feedbackEl.textContent = 'Bitte gültige Punkte angeben.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
    }

    let descriptionContent;
    if (descriptionEditor) {
        descriptionContent = descriptionEditor.getContent();
    } else {
        const description = document.getElementById('exercise-description-form').value;
        descriptionContent = { type: 'text', text: description };
    }

    feedbackEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';

    if (!title || !level || !difficulty) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        return;
    }

    try {
        let imageUrl = null;

        // Bild hochladen nur wenn vorhanden (nutzt Supabase Storage)
        if (file) {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
            if (!allowedTypes.includes(file.type)) {
                feedbackEl.textContent = 'Nur Bilddateien sind erlaubt (JPG, PNG, GIF, WebP, SVG).';
                feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Übung speichern';
                return;
            }

            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                feedbackEl.textContent = 'Die Bilddatei darf maximal 5MB groß sein.';
                feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Übung speichern';
                return;
            }

            const fileName = `${Date.now()}_${file.name}`;
            const { data: uploadData, error: uploadError } = await db.storage
                .from('exercises')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = db.storage
                .from('exercises')
                .getPublicUrl(fileName);

            imageUrl = urlData.publicUrl;
        }

        // Difficulty String zu Integer konvertieren (DB erwartet INTEGER)
        const difficultyMap = { 'easy': 1, 'normal': 2, 'hard': 3 };
        const difficultyInt = difficultyMap[difficulty] || 1;

        const exerciseData = {
            name: title,  // DB-Spalte ist 'name', nicht 'title'
            description_content: JSON.stringify(descriptionContent),
            category: level,  // Speichere Level-Text in 'category'
            difficulty: difficultyInt,  // DB erwartet Integer: 1=easy, 2=normal, 3=hard
            points,
            xp_reward: points,  // Setze auch xp_reward für Kompatibilität
            tags,
            visibility,
            unit,  // Einheit für Meilensteine (z.B. "Sterne", "Wiederholungen")
            tiered_points: milestonesEnabled && milestones
                ? { enabled: true, milestones }
                : { enabled: false, milestones: [] },
        };

        if (!isEditing) {
            exerciseData.created_at = new Date().toISOString();
            exerciseData.created_by = userData?.id || null;
            exerciseData.created_by_name = userData ? `${userData.firstName} ${userData.lastName}` : 'Unbekannt';
            if (visibility === 'club' && userData?.clubId) {
                exerciseData.club_id = userData.clubId;
            }
            // Setze sport_id aus Kontext (aktive Sportart des Users)
            if (exerciseContext.sportId) {
                exerciseData.sport_id = exerciseContext.sportId;
            }
        }

        if (imageUrl) {
            exerciseData.image_url = imageUrl;
        }

        if (isEditing) {
            const { error } = await db
                .from('exercises')
                .update(exerciseData)
                .eq('id', isEditing);

            if (error) throw error;
            feedbackEl.textContent = 'Übung erfolgreich aktualisiert!';
        } else {
            const { error } = await db
                .from('exercises')
                .insert(exerciseData);

            if (error) throw error;
            feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        }

        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();

        delete form.dataset.editingId;
        submitBtn.textContent = 'Übung speichern';

        document.getElementById('exercise-points-form').value = '';
        document.getElementById('exercise-milestones-list').innerHTML = '';
        document.getElementById('exercise-milestones-enabled').checked = false;
        document.getElementById('exercise-standard-points-container').classList.remove('hidden');
        document.getElementById('exercise-milestones-container').classList.add('hidden');

        if (descriptionEditor) {
            descriptionEditor.clear();
        }
    } catch (error) {
        console.error('Fehler beim Speichern der Übung:', error);
        feedbackEl.textContent = isEditing
            ? 'Fehler: Übung konnte nicht aktualisiert werden.'
            : 'Fehler: Übung konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        setTimeout(() => {
            feedbackEl.textContent = '';
        }, 4000);
    }
}

/**
 * Löscht eine Übung (nur vom Ersteller)
 */
window.deleteExercise = async function(exerciseId) {
    if (!exerciseContext.db) {
        alert('Fehler: Datenbank nicht verfügbar');
        return;
    }

    const confirmed = confirm('Möchtest du diese Übung wirklich löschen?');
    if (!confirmed) return;

    try {
        const { error } = await exerciseContext.db
            .from('exercises')
            .delete()
            .eq('id', exerciseId);

        if (error) throw error;
        alert('Übung erfolgreich gelöscht!');
    } catch (error) {
        console.error('Error deleting exercise:', error);
        alert('Fehler beim Löschen der Übung: ' + error.message);
    }
};

/**
 * Bearbeitet eine Übung (nur vom Ersteller)
 */
window.editExercise = async function(exerciseId) {
    if (!exerciseContext.db) {
        alert('Fehler: Datenbank nicht verfügbar');
        return;
    }

    try {
        const { data: exerciseRow, error } = await exerciseContext.db
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (error || !exerciseRow) {
            alert('Übung nicht gefunden');
            return;
        }

        const exerciseData = mapExerciseFromSupabase(exerciseRow);

        // Difficulty Integer zu String konvertieren für das Select-Feld
        const difficultyIntToString = { 1: 'easy', 2: 'normal', 3: 'hard' };
        const difficultyValue = typeof exerciseData.difficulty === 'number'
            ? difficultyIntToString[exerciseData.difficulty] || ''
            : exerciseData.difficulty || '';

        document.getElementById('exercise-title-form').value = exerciseData.title || '';
        document.getElementById('exercise-level-form').value = exerciseData.level || '';
        document.getElementById('exercise-difficulty-form').value = difficultyValue;
        document.getElementById('exercise-tags-form').value = (exerciseData.tags || []).join(', ');

        // Einheit setzen
        const unitSelect = document.getElementById('exercise-unit-form');
        if (unitSelect) {
            unitSelect.value = exerciseData.unit || 'Wiederholungen';
        }

        // Sichtbarkeit setzen
        const visibilityValue = exerciseData.visibility || 'global';
        const visibilityRadio = document.querySelector(`input[name="exercise-visibility"][value="${visibilityValue}"]`);
        if (visibilityRadio) {
            visibilityRadio.checked = true;
        }

        // Beschreibungs-Editor mit vorhandenen Daten füllen
        try {
            const descContent = JSON.parse(exerciseData.descriptionContent || '{}');
            if (exerciseContext.descriptionEditor) {
                // Verwende den Editor um Tabellen korrekt zu laden
                exerciseContext.descriptionEditor.setContent(descContent);
            } else {
                // Fallback: Nur Text-Feld setzen
                let descriptionText = '';
                if (descContent.type === 'text') {
                    descriptionText = descContent.text || '';
                } else if (descContent.type === 'table') {
                    descriptionText = descContent.additionalText || '';
                }
                document.getElementById('exercise-description-form').value = descriptionText;
            }
        } catch (e) {
            const descriptionText = exerciseData.description || '';
            if (exerciseContext.descriptionEditor) {
                exerciseContext.descriptionEditor.setContent({ type: 'text', text: descriptionText });
            } else {
                document.getElementById('exercise-description-form').value = descriptionText;
            }
        }

        const hasMilestones = exerciseData.tieredPoints?.enabled && exerciseData.tieredPoints?.milestones?.length > 0;
        const milestonesCheckbox = document.getElementById('exercise-milestones-enabled');

        if (hasMilestones) {
            milestonesCheckbox.checked = true;
            document.getElementById('exercise-standard-points-container').classList.add('hidden');
            document.getElementById('exercise-milestones-container').classList.remove('hidden');

            const milestonesList = document.getElementById('exercise-milestones-list');
            milestonesList.innerHTML = '';

            exerciseData.tieredPoints.milestones.forEach(milestone => {
                const row = document.createElement('div');
                row.className = 'flex gap-2 items-center bg-gray-50 p-2 rounded';
                row.innerHTML = `
                    <input type="number" class="exercise-milestone-count w-16 px-2 py-1 border border-gray-300 rounded text-sm" value="${milestone.count}" min="1" required>
                    <span class="text-gray-600 text-xs whitespace-nowrap">× →</span>
                    <input type="number" class="exercise-milestone-points w-16 px-2 py-1 border border-gray-300 rounded text-sm" value="${milestone.points}" min="1" required>
                    <span class="text-gray-600 text-xs">P.</span>
                    <button type="button" class="remove-exercise-milestone text-red-600 hover:text-red-800 px-1 text-sm flex-shrink-0">🗑️</button>
                `;

                row.querySelector('.remove-exercise-milestone').addEventListener('click', () => row.remove());
                milestonesList.appendChild(row);
            });
        } else {
            milestonesCheckbox.checked = false;
            document.getElementById('exercise-standard-points-container').classList.remove('hidden');
            document.getElementById('exercise-milestones-container').classList.add('hidden');
            document.getElementById('exercise-points-form').value = exerciseData.points || 0;
        }

        document.getElementById('create-exercise-form').dataset.editingId = exerciseId;
        document.getElementById('create-exercise-submit').textContent = 'Übung aktualisieren';

        // Formular aufklappen falls zugeklappt
        const formContainer = document.getElementById('exercise-form-container');
        const formIcon = document.getElementById('exercise-form-icon');
        if (formContainer?.classList.contains('hidden')) {
            formContainer.classList.remove('hidden');
            if (formIcon) formIcon.style.transform = 'rotate(180deg)';
        }

        document.getElementById('create-exercise-form').scrollIntoView({ behavior: 'smooth' });

        const feedbackEl = document.getElementById('exercise-feedback');
        feedbackEl.textContent = 'Bearbeitungsmodus: Übung wird aktualisiert statt neu erstellt';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-blue-600';

    } catch (error) {
        console.error('Error loading exercise for edit:', error);
        alert('Fehler beim Laden der Übung: ' + error.message);
    }
};
