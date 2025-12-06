// Exercises Module - Supabase Version
// 1:1 Migration von exercises.js - Firebase → Supabase

import { getSupabase } from './supabase-init.js';
import { renderTableForDisplay } from './tableEditor.js';

/**
 * Exercises Module
 * Handles exercise display, creation, and management for both dashboard and coach
 */

// Module-level context for player progress
let exerciseContext = {
    db: null,
    userId: null,
    userRole: null,
    clubId: null,
    sportId: null,
};

/**
 * Sets the context for exercise progress tracking
 * @param {Object} db - Supabase client instance
 * @param {string} userId - Current user ID
 * @param {string} userRole - Current user role (player, coach, admin)
 * @param {string} clubId - Current user's club ID (optional)
 * @param {string} sportId - Current user's active sport ID (optional)
 */
export function setExerciseContext(db, userId, userRole, clubId = null, sportId = null) {
    exerciseContext.db = db;
    exerciseContext.userId = userId;
    exerciseContext.userRole = userRole;
    exerciseContext.clubId = clubId;
    exerciseContext.sportId = sportId;
}

/**
 * Loads exercises for the dashboard with tag filtering
 * @param {Object} db - Supabase client instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export async function loadExercises(db, unsubscribes) {
    const exercisesListEl = document.getElementById('exercises-list');
    if (!exercisesListEl) return;

    // Store exercises data for real-time updates
    let exercisesData = [];

    // Initial load
    await loadExercisesList();

    // Set up real-time subscription
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

    async function loadExercisesList() {
        // Build query with optional sport filter
        let query = db
            .from('exercises')
            .select('*')
            .order('created_at', { ascending: false });

        // Filter by active sport if set
        const activeSportId = exerciseContext.sportId;
        if (activeSportId) {
            // Show exercises that match the sport OR have no sport (global exercises)
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: exercisesRaw, error } = await query;

        if (error || !exercisesRaw || exercisesRaw.length === 0) {
            exercisesListEl.innerHTML = `<p class="text-gray-400 col-span-full">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        exercisesListEl.innerHTML = '';
        const allTags = new Set();
        const exercises = [];
        exercisesData = [];

        // Filter by visibility
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
            exercisesListEl.innerHTML = `<p class="text-gray-400 col-span-full">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        // Process each visible exercise
        for (const exerciseRow of visibleDocs) {
            const exercise = mapExerciseFromSupabase(exerciseRow);
            const exerciseId = exerciseRow.id;

            exercisesData.push({ exercise, exerciseId });

            // Create exercise card (progress is now only shown in modal, not on cards)
            const card = createExerciseCard({ id: exerciseId }, exercise);
            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            exercises.push({ card, tags: exerciseTags });
            exercisesListEl.appendChild(card);
        }

        renderTagFilters(allTags, exercises);
    }

    // Note: Progress is no longer shown on cards, only in the modal
    // Real-time updates for card progress have been removed
}

/**
 * Maps Supabase exercise row to expected format
 * Note: Database uses 'name' but app uses 'title' - we map both for compatibility
 */
function mapExerciseFromSupabase(row) {
    // Ensure description_content is always a string (JSONB from DB can be object or string)
    let descriptionContent = row.description_content;
    if (descriptionContent && typeof descriptionContent === 'object') {
        descriptionContent = JSON.stringify(descriptionContent);
    }

    return {
        id: row.id,
        title: row.name || row.title, // DB uses 'name', app expects 'title'
        name: row.name,
        description: row.description,
        descriptionContent: descriptionContent,
        imageUrl: row.image_url,
        points: row.xp_reward || row.points || 10, // DB uses 'xp_reward'
        level: row.difficulty || row.level,
        difficulty: row.difficulty,
        tags: row.category ? [row.category] : (row.tags || []), // DB uses 'category'
        visibility: row.visibility || 'global',
        clubId: row.club_id,
        createdBy: row.created_by,
        createdByName: row.created_by_name,
        createdAt: row.created_at,
        tieredPoints: row.tiered_points,
        recordHolderName: row.record_holder_name,
        recordHolderClub: row.record_holder_club,
        recordCount: row.record_count,
        procedure: row.procedure, // Array of steps for the exercise
    };
}

/**
 * Creates the HTML for an exercise card
 */
function createExerciseCard(docSnap, exercise) {
    const card = document.createElement('div');
    card.className =
        'exercise-card bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-xl transition-shadow duration-300 relative';
    card.dataset.id = docSnap.id;
    card.dataset.title = exercise.title;

    if (exercise.descriptionContent) {
        // Ensure descriptionContent is always a JSON string, not an object
        card.dataset.descriptionContent = typeof exercise.descriptionContent === 'string'
            ? exercise.descriptionContent
            : JSON.stringify(exercise.descriptionContent);
    } else {
        card.dataset.descriptionContent = JSON.stringify({
            type: 'text',
            text: exercise.description || '',
        });
    }
    if (exercise.imageUrl) {
        card.dataset.imageUrl = exercise.imageUrl;
    }
    card.dataset.points = exercise.points;
    card.dataset.tags = JSON.stringify(exercise.tags || []);

    if (exercise.tieredPoints) {
        card.dataset.tieredPoints = JSON.stringify(exercise.tieredPoints);
    }

    const exerciseTags = exercise.tags || [];
    const tagsHtml = exerciseTags
        .map(
            tag =>
                `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`
        )
        .join('');

    card.innerHTML = `
        <div class="p-5 flex flex-col flex-grow relative">
            <!-- XP Badge in top-right corner -->
            <span class="absolute top-3 right-3 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold">${exercise.points} XP</span>

            <!-- Title -->
            <h3 class="font-bold text-lg mb-3 text-gray-900 pr-20">${exercise.title}</h3>

            <!-- Tags -->
            <div class="mb-3">${tagsHtml}</div>

            <!-- Description -->
            <p class="text-sm text-gray-600 mb-4 flex-grow">${exercise.description || ''}</p>

            <!-- Footer -->
            <div class="flex items-center text-xs text-gray-500">
                <svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
                    <path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
                </svg>
                Wiederholbar mit Meilensteinen
            </div>
        </div>`;

    return card;
}

/**
 * Renders tag filter buttons for the exercise list
 */
export function renderTagFilters(tags, exercises) {
    const filterContainer = document.getElementById('tags-filter-container');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

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

            document.querySelectorAll('.tag-filter-btn').forEach(btn => {
                btn.classList.remove('active-filter', 'bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.target.classList.add('active-filter', 'bg-indigo-600', 'text-white');
            e.target.classList.remove('bg-gray-200', 'text-gray-700');

            exercises.forEach(({ card, tags }) => {
                if (selectedTag === 'all' || tags.includes(selectedTag)) {
                    card.classList.remove('hidden');
                } else {
                    card.classList.add('hidden');
                }
            });
        }
    });
}

/**
 * Loads all exercises for coach view
 */
export function loadAllExercises(db) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    // Initial load
    loadCoachExercisesList();

    // Real-time subscription
    db.channel('coach-exercises-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'exercises'
        }, () => {
            loadCoachExercisesList();
        })
        .subscribe();

    async function loadCoachExercisesList() {
        // Build query with optional sport filter
        let query = db
            .from('exercises')
            .select('*')
            .order('created_at', { ascending: false });

        // Filter by active sport if set
        const activeSportId = exerciseContext.sportId;
        if (activeSportId) {
            // Show exercises that match the sport OR have no sport (global exercises)
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: exercisesRaw, error } = await query;

        if (error) {
            console.error('[Exercises] Error loading exercises:', error.message);
            exercisesListCoachEl.innerHTML =
                '<p class="text-gray-400 col-span-full">Keine Übungen verfügbar</p>';
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

        renderTagFiltersCoach(allTags, exercises);
        renderCoachExercises(exercises, 'all');
    }
}

/**
 * Renders tag filter buttons for the coach exercise list
 */
function renderTagFiltersCoach(tags, exercises) {
    const filterContainer = document.getElementById('tags-filter-container-coach');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

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

            renderCoachExercises(exercises, selectedTag);
        }
    });
}

/**
 * Sets up toggle functionality for tag filter section
 */
function setupTagFilterToggle(context) {
    const toggleButton = document.getElementById(`toggle-tags-filter-${context}`);
    const filterSection = document.getElementById(`tags-filter-section-${context}`);
    const filterIcon = document.getElementById(`filter-icon-${context}`);

    if (!toggleButton || !filterSection || !filterIcon) return;

    const newToggleButton = toggleButton.cloneNode(true);
    toggleButton.parentNode.replaceChild(newToggleButton, toggleButton);

    newToggleButton.addEventListener('click', () => {
        const isHidden = filterSection.classList.contains('hidden');

        if (isHidden) {
            filterSection.classList.remove('hidden');
            filterIcon.style.transform = 'rotate(180deg)';
        } else {
            filterSection.classList.add('hidden');
            filterIcon.style.transform = 'rotate(0deg)';
        }
    });
}

/**
 * Sets up search functionality for tag filter
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
 * Renders coach exercise cards with optional tag filtering
 */
function renderCoachExercises(exercises, filterTag) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    exercisesListCoachEl.innerHTML = '';

    const filteredExercises =
        filterTag === 'all'
            ? exercises
            : exercises.filter(ex => (ex.tags || []).includes(filterTag));

    if (filteredExercises.length === 0) {
        exercisesListCoachEl.innerHTML =
            '<p class="text-gray-500 col-span-full">Keine Übungen für diesen Filter gefunden.</p>';
        return;
    }

    filteredExercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className =
            'bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow';
        card.dataset.id = exercise.id;
        card.dataset.title = exercise.title;
        if (exercise.descriptionContent) {
            // Ensure descriptionContent is always a JSON string, not an object
            card.dataset.descriptionContent = typeof exercise.descriptionContent === 'string'
                ? exercise.descriptionContent
                : JSON.stringify(exercise.descriptionContent);
        } else {
            card.dataset.descriptionContent = JSON.stringify({
                type: 'text',
                text: exercise.description || '',
            });
        }
        if (exercise.imageUrl) {
            card.dataset.imageUrl = exercise.imageUrl;
        }
        card.dataset.points = exercise.points;
        card.dataset.tags = JSON.stringify(exercise.tags || []);

        if (exercise.tieredPoints) {
            card.dataset.tieredPoints = JSON.stringify(exercise.tieredPoints);
        }

        const tagsHtml = (exercise.tags || [])
            .map(
                tag =>
                    `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`
            )
            .join('');

        const currentUserId = exerciseContext.userId;
        const isCreator = currentUserId && exercise.createdBy === currentUserId;
        const isAdmin = exerciseContext.userRole === 'admin';
        const canEdit = isCreator || isAdmin;

        const coachBadge = isCreator
            ? ' Von dir erstellt'
            : exercise.createdByName
              ? `👤 ${exercise.createdByName}`
              : 'System';

        const visibilityBadge = exercise.visibility === 'club'
            ? '<span class="inline-block bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium">🏠 Nur Verein</span>'
            : '<span class="inline-block bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-medium">🌍 Global</span>';

        card.innerHTML = `
            <div class="p-5 flex flex-col flex-grow relative">
                <!-- XP Badge in top-right corner -->
                <span class="absolute top-3 right-3 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-bold pointer-events-none">${exercise.points} XP</span>

                <!-- Title -->
                <h3 class="font-bold text-lg mb-3 text-gray-900 pr-20 pointer-events-none">${exercise.title}</h3>

                <!-- Visibility & Creator Info -->
                <div class="flex items-center gap-2 mb-3 pointer-events-none">
                    ${visibilityBadge}
                    <span class="text-xs text-gray-600">${coachBadge}</span>
                </div>

                <!-- Tags -->
                <div class="mb-3 pointer-events-none">${tagsHtml}</div>

                <!-- Description -->
                <p class="text-sm text-gray-600 mb-4 flex-grow pointer-events-none">${exercise.description || ''}</p>

                <!-- Delete Button (only if can edit) -->
                ${canEdit ? `
                <div class="mt-auto pointer-events-auto">
                    <button onclick="deleteExercise('${exercise.id}')" class="w-full bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors">
                        🗑️ Löschen
                    </button>
                </div>
                ` : ''}
            </div>`;
        exercisesListCoachEl.appendChild(card);
    });
}

/**
 * Loads exercises into a dropdown for points awarding
 */
export function loadExercisesForDropdown(db) {
    const select = document.getElementById('exercise-select');
    if (!select) return;

    // Initial load
    loadDropdown();

    // Real-time subscription
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

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(e.tieredPoints.milestones);
            }

            select.appendChild(option);
        });
    }
}

/**
 * Handles exercise click event (for dashboard)
 */
export function handleExerciseClick(event) {
    const card = event.target.closest('[data-title]');
    if (card) {
        const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints } =
            card.dataset;
        openExerciseModal(id, title, descriptionContent, imageUrl, points, tags, tieredPoints);
    }
}

/**
 * Opens the exercise modal with exercise details
 */
export async function openExerciseModal(
    exerciseId,
    title,
    descriptionContent,
    imageUrl,
    points,
    tags,
    tieredPoints
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

    // Load exercise data FIRST (needed for procedure and records)
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

    // Display procedure/steps if available
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
        // Invalid JSON, ignore
    }

    const pointsContainer = document.getElementById('modal-exercise-points');
    const milestonesContainer = document.getElementById('modal-exercise-milestones');

    const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;

    // Load player progress for ALL exercises (not just tiered ones)
    let playerProgress = null;
    if (
        exerciseContext.userRole === 'player' &&
        exerciseContext.db &&
        exerciseContext.userId &&
        exerciseId
    ) {
        try {
            if (hasTieredPoints) {
                // For milestone exercises, use exercise_milestones
                const { data } = await exerciseContext.db
                    .from('exercise_milestones')
                    .select('*')
                    .eq('user_id', exerciseContext.userId)
                    .eq('exercise_id', exerciseId)
                    .single();

                if (data) {
                    playerProgress = { currentCount: data.current_count || 0 };
                }
            } else {
                // For regular exercises, use completed_exercises
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

    // exerciseData is already loaded at the beginning of this function

    if (hasTieredPoints) {
        pointsContainer.textContent = `🎯 Bis zu ${points} P.`;

        if (milestonesContainer) {
            let progressHtml = '';
            if (exerciseContext.userRole === 'player') {
                const nextMilestone = tieredPointsData.milestones.find(m => m.count > currentCount);
                const remaining = nextMilestone ? nextMilestone.count - currentCount : 0;

                let globalRecordHtml = '';
                if (exerciseData && exerciseData.recordHolderName && exerciseData.recordCount) {
                    const clubInfo = exerciseData.recordHolderClub ? ` (${exerciseData.recordHolderClub})` : '';
                    globalRecordHtml = `
                        <div class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-lg">🏆</span>
                                <span class="font-bold text-gray-800">Globaler Rekordhalter</span>
                            </div>
                            <p class="text-base text-gray-700">
                                <span class="font-bold text-amber-600">${exerciseData.recordHolderName}${clubInfo}</span> mit <span class="font-bold text-amber-700">${exerciseData.recordCount} Wiederholungen</span>
                            </p>
                        </div>
                    `;
                }

                progressHtml = `
                    <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">📈</span>
                            <span class="font-bold text-gray-800">Deine beste Leistung</span>
                        </div>
                        <p class="text-base text-gray-700 mb-2">
                            Persönlicher Rekord: <span class="font-bold text-blue-600">${currentCount} Wiederholungen</span>
                        </p>
                        ${
                            nextMilestone
                                ? `
                            <p class="text-sm text-gray-600">
                                Noch <span class="font-semibold text-orange-600">${remaining} Wiederholungen</span> bis zum nächsten Meilenstein
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

            const milestonesHtml = tieredPointsData.milestones
                .sort((a, b) => a.count - b.count)
                .map((milestone, index) => {
                    const isFirst = index === 0;
                    const displayPoints = isFirst
                        ? milestone.points
                        : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;

                    let bgColor, borderColor, iconColor, textColor, statusIcon;
                    if (exerciseContext.userRole === 'player') {
                        if (currentCount >= milestone.count) {
                            bgColor = 'bg-gradient-to-r from-green-50 to-emerald-50';
                            borderColor = 'border-green-300';
                            iconColor = 'text-green-600';
                            textColor = 'text-green-700';
                            statusIcon = '✓';
                        } else if (
                            index === 0 ||
                            currentCount >= tieredPointsData.milestones[index - 1].count
                        ) {
                            bgColor = 'bg-gradient-to-r from-orange-50 to-amber-50';
                            borderColor = 'border-orange-300';
                            iconColor = 'text-orange-600';
                            textColor = 'text-orange-700';
                            statusIcon = '🎯';
                        } else {
                            bgColor = 'bg-gradient-to-r from-gray-50 to-slate-50';
                            borderColor = 'border-gray-300';
                            iconColor = 'text-gray-500';
                            textColor = 'text-gray-600';
                            statusIcon = '⚪';
                        }
                    } else {
                        bgColor = 'bg-gradient-to-r from-indigo-50 to-purple-50';
                        borderColor = 'border-indigo-100';
                        iconColor = 'text-indigo-600';
                        textColor = 'text-gray-800';
                        statusIcon = '🎯';
                    }

                    return `<div class="flex justify-between items-center py-3 px-4 ${bgColor} rounded-lg mb-2 border ${borderColor}">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">${statusIcon}</span>
                            <span class="text-base font-semibold ${textColor}">${milestone.count} Wiederholungen</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold ${iconColor}">${displayPoints} P.</div>
                            <div class="text-xs text-gray-500 font-medium">Gesamt: ${milestone.points} P.</div>
                        </div>
                    </div>`;
                })
                .join('');

            milestonesContainer.innerHTML = `
                <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                    <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <span class="text-2xl">📊</span>
                        <span>Meilensteine</span>
                    </h4>
                    ${progressHtml}
                    ${milestonesHtml}
                </div>`;
            milestonesContainer.classList.remove('hidden');
        }
    } else {
        // Regular exercise (no milestones) - but still show records!
        pointsContainer.textContent = `+${points} P.`;
        if (milestonesContainer) {
            let recordsHtml = '';

            if (exerciseContext.userRole === 'player') {
                // Show global record holder
                let globalRecordHtml = '';
                if (exerciseData && exerciseData.recordHolderName && exerciseData.recordCount) {
                    const clubInfo = exerciseData.recordHolderClub ? ` (${exerciseData.recordHolderClub})` : '';
                    globalRecordHtml = `
                        <div class="mb-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-lg">🏆</span>
                                <span class="font-bold text-gray-800">Globaler Rekordhalter</span>
                            </div>
                            <p class="text-base text-gray-700">
                                <span class="font-bold text-amber-600">${exerciseData.recordHolderName}${clubInfo}</span> mit <span class="font-bold text-amber-700">${exerciseData.recordCount} Wiederholungen</span>
                            </p>
                        </div>
                    `;
                }

                // Show personal record
                let personalRecordHtml = '';
                if (currentCount > 0) {
                    personalRecordHtml = `
                        <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-lg">📈</span>
                                <span class="font-bold text-gray-800">Deine beste Leistung</span>
                            </div>
                            <p class="text-base text-gray-700">
                                Persönlicher Rekord: <span class="font-bold text-blue-600">${currentCount} Wiederholungen</span>
                            </p>
                        </div>
                    `;
                }

                recordsHtml = `
                    <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                        <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-2xl">🏅</span>
                            <span>Rekorde</span>
                        </h4>
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Opens the exercise modal from dataset (for coach)
 */
export function openExerciseModalFromDataset(dataset) {
    const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints } = dataset;
    openExerciseModal(id, title, descriptionContent, imageUrl, points, tags, tieredPoints);
}

/**
 * Closes the exercise modal
 */
export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Calculates exercise points based on level and difficulty
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
 * Updates exercise points field when level or difficulty changes
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
 * Sets up milestone system for exercises
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
 * Adds a new milestone input row for exercises
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
 * Gets all milestones from the form
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
 * Updates the total milestone points display
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
 * Handles exercise creation form submission (for coach)
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

        // Upload image only if provided (using Supabase Storage)
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

        const exerciseData = {
            name: title,  // DB column is 'name', not 'title'
            description_content: JSON.stringify(descriptionContent),
            // Store level text in 'category' column (level/difficulty are INTEGER in DB)
            category: level,
            // Store difficulty text in description or skip it
            // difficulty is INTEGER in DB, so we can't use text values
            points,
            xp_reward: points,  // Also set xp_reward for compatibility
            tags,
            visibility,
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
            // Set sport_id from context (user's active sport)
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
 * Deletes an exercise (only by creator)
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
 * Edits an exercise (only by creator)
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

        document.getElementById('exercise-title-form').value = exerciseData.title || '';
        document.getElementById('exercise-level-form').value = exerciseData.level || '';
        document.getElementById('exercise-difficulty-form').value = exerciseData.difficulty || '';
        document.getElementById('exercise-tags-form').value = (exerciseData.tags || []).join(', ');

        let descriptionText = '';
        try {
            const descContent = JSON.parse(exerciseData.descriptionContent || '{}');
            if (descContent.type === 'text') {
                descriptionText = descContent.text || '';
            } else if (descContent.type === 'table') {
                descriptionText = descContent.additionalText || '';
            }
        } catch (e) {
            descriptionText = exerciseData.description || '';
        }
        document.getElementById('exercise-description-form').value = descriptionText;

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

        document.getElementById('create-exercise-form').scrollIntoView({ behavior: 'smooth' });

        const feedbackEl = document.getElementById('exercise-feedback');
        feedbackEl.textContent = 'Bearbeitungsmodus: Übung wird aktualisiert statt neu erstellt';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-blue-600';

    } catch (error) {
        console.error('Error loading exercise for edit:', error);
        alert('Fehler beim Laden der Übung: ' + error.message);
    }
};
