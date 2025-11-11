import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { renderTableForDisplay } from './tableEditor.js';

/**
 * Exercises Module
 * Handles exercise display, creation, and management for both dashboard and coach
 */

/**
 * Loads exercises for the dashboard with tag filtering
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadExercises(db, unsubscribes) {
    const exercisesListEl = document.getElementById('exercises-list');
    if (!exercisesListEl) return;

    const q = query(collection(db, "exercises"), orderBy("createdAt", "desc"));

    const exerciseListener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            exercisesListEl.innerHTML = `<p class="text-gray-400 col-span-full">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        exercisesListEl.innerHTML = '';
        const allTags = new Set();
        const exercises = [];

        snapshot.forEach(doc => {
            const exercise = doc.data();
            const card = document.createElement('div');
            card.className = 'exercise-card bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-xl transition-shadow duration-300';
            card.dataset.title = exercise.title;
            // Support both old and new format
            if (exercise.descriptionContent) {
                card.dataset.descriptionContent = exercise.descriptionContent;
            } else {
                // Backwards compatibility: convert old description to new format
                card.dataset.descriptionContent = JSON.stringify({
                    type: 'text',
                    text: exercise.description || ''
                });
            }
            card.dataset.imageUrl = exercise.imageUrl;
            card.dataset.points = exercise.points;
            card.dataset.tags = JSON.stringify(exercise.tags || []);

            // Add tieredPoints data
            if (exercise.tieredPoints) {
                card.dataset.tieredPoints = JSON.stringify(exercise.tieredPoints);
            }

            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            const tagsHtml = exerciseTags.map(tag => `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`).join('');

            // Check if exercise has tiered points
            const hasTieredPoints = exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0;
            const pointsBadge = hasTieredPoints
                ? `<span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">🎯 Bis zu ${exercise.points} P.</span>`
                : `<span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">+${exercise.points} P.</span>`;

            card.innerHTML = `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover">
                              <div class="p-4 flex flex-col flex-grow">
                                  <h3 class="font-bold text-md mb-2">${exercise.title}</h3>
                                  <div class="mb-2">${tagsHtml}</div>
                                  <p class="text-sm text-gray-600 flex-grow truncate">${exercise.description || ''}</p>
                                  <div class="mt-4 text-right">
                                      ${pointsBadge}
                                  </div>
                              </div>`;
            exercises.push({ card, tags: exerciseTags });
            exercisesListEl.appendChild(card);
        });

        renderTagFilters(allTags, exercises);
    });

    if (unsubscribes) unsubscribes.push(exerciseListener);
}

/**
 * Renders tag filter buttons for the exercise list
 * @param {Set} tags - Set of all available tags
 * @param {Array} exercises - Array of exercise objects with their tags
 */
export function renderTagFilters(tags, exercises) {
    const filterContainer = document.getElementById('tags-filter-container');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = 'tag-filter-btn active-filter bg-indigo-600 text-white px-3 py-1 text-sm font-semibold rounded-full';
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    filterContainer.appendChild(allButton);

    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className = 'tag-filter-btn bg-gray-200 text-gray-700 px-3 py-1 text-sm font-semibold rounded-full hover:bg-gray-300';
        button.textContent = tag;
        button.dataset.tag = tag;
        filterContainer.appendChild(button);
    });

    // Setup toggle button for player view
    setupTagFilterToggle('player');

    // Setup search functionality for player view
    setupTagSearch('player');

    filterContainer.addEventListener('click', (e) => {
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
 * Loads all exercises for coach view (with tag filtering and points display)
 * @param {Object} db - Firestore database instance
 */
export function loadAllExercises(db) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    onSnapshot(query(collection(db, "exercises"), orderBy("createdAt", "desc")), (snapshot) => {
        const exercises = [];
        const allTags = new Set();

        snapshot.forEach(doc => {
            const exercise = { id: doc.id, ...doc.data() };
            exercises.push(exercise);
            (exercise.tags || []).forEach(tag => allTags.add(tag));
        });

        // Render tag filters for coach
        renderTagFiltersCoach(allTags, exercises);

        // Render all exercises initially
        renderCoachExercises(exercises, 'all');
    });
}

/**
 * Renders tag filter buttons for the coach exercise list
 * @param {Set} tags - Set of all available tags
 * @param {Array} exercises - Array of exercise objects with their tags
 */
function renderTagFiltersCoach(tags, exercises) {
    const filterContainer = document.getElementById('tags-filter-container-coach');
    if (!filterContainer) return;

    filterContainer.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = 'tag-filter-btn active-filter bg-indigo-600 text-white px-3 py-1 text-sm font-semibold rounded-full';
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    filterContainer.appendChild(allButton);

    tags.forEach(tag => {
        const button = document.createElement('button');
        button.className = 'tag-filter-btn bg-gray-200 text-gray-700 px-3 py-1 text-sm font-semibold rounded-full hover:bg-gray-300';
        button.textContent = tag;
        button.dataset.tag = tag;
        filterContainer.appendChild(button);
    });

    // Setup toggle button
    setupTagFilterToggle('coach');

    // Setup search functionality
    setupTagSearch('coach');

    // Add click handlers for filtering
    filterContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-filter-btn')) {
            const selectedTag = e.target.dataset.tag;

            // Update active state
            filterContainer.querySelectorAll('.tag-filter-btn').forEach(btn => {
                btn.classList.remove('active-filter', 'bg-indigo-600', 'text-white');
                btn.classList.add('bg-gray-200', 'text-gray-700');
            });
            e.target.classList.add('active-filter', 'bg-indigo-600', 'text-white');
            e.target.classList.remove('bg-gray-200', 'text-gray-700');

            // Filter exercises
            renderCoachExercises(exercises, selectedTag);
        }
    });
}

/**
 * Sets up toggle functionality for tag filter section
 * @param {string} context - 'coach' or 'player'
 */
function setupTagFilterToggle(context) {
    const toggleButton = document.getElementById(`toggle-tags-filter-${context}`);
    const filterSection = document.getElementById(`tags-filter-section-${context}`);
    const filterIcon = document.getElementById(`filter-icon-${context}`);

    if (!toggleButton || !filterSection || !filterIcon) return;

    // Remove old listeners by cloning
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
 * @param {string} context - 'coach' or 'player'
 */
function setupTagSearch(context) {
    const searchInput = document.getElementById(`tag-search-${context}`);
    const filterContainer = document.getElementById(`tags-filter-container-${context}`);

    if (!searchInput || !filterContainer) return;

    // Remove old listeners
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);

    newSearchInput.addEventListener('input', (e) => {
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
 * @param {Array} exercises - Array of exercise objects
 * @param {string} filterTag - Tag to filter by ('all' for no filter)
 */
function renderCoachExercises(exercises, filterTag) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    exercisesListCoachEl.innerHTML = '';

    const filteredExercises = filterTag === 'all'
        ? exercises
        : exercises.filter(ex => (ex.tags || []).includes(filterTag));

    if (filteredExercises.length === 0) {
        exercisesListCoachEl.innerHTML = '<p class="text-gray-500 col-span-full">Keine Übungen für diesen Filter gefunden.</p>';
        return;
    }

    filteredExercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow';
        card.dataset.id = exercise.id;
        card.dataset.title = exercise.title;
        // Support both old and new format
        if (exercise.descriptionContent) {
            card.dataset.descriptionContent = exercise.descriptionContent;
        } else {
            // Backwards compatibility: convert old description to new format
            card.dataset.descriptionContent = JSON.stringify({
                type: 'text',
                text: exercise.description || ''
            });
        }
        card.dataset.imageUrl = exercise.imageUrl;
        card.dataset.points = exercise.points;
        card.dataset.tags = JSON.stringify(exercise.tags || []);

        // Add tieredPoints data
        if (exercise.tieredPoints) {
            card.dataset.tieredPoints = JSON.stringify(exercise.tieredPoints);
        }

        const tagsHtml = (exercise.tags || []).map(tag =>
            `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`
        ).join('');

        // Check if exercise has tiered points
        const hasTieredPoints = exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0;
        const pointsBadge = hasTieredPoints
            ? `🎯 Bis zu ${exercise.points} P.`
            : `${exercise.points} P.`;

        card.innerHTML = `
            <img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover pointer-events-none">
            <div class="p-4 flex flex-col flex-grow pointer-events-none">
                <div class="flex justify-between items-start mb-2">
                    <h3 class="font-bold text-md flex-grow">${exercise.title}</h3>
                    <span class="ml-2 bg-indigo-100 text-indigo-800 text-sm font-bold px-2 py-1 rounded">${pointsBadge}</span>
                </div>
                <div class="pt-2">${tagsHtml}</div>
            </div>`;
        exercisesListCoachEl.appendChild(card);
    });
}

/**
 * Loads exercises into a dropdown for points awarding
 * @param {Object} db - Firestore database instance
 */
export function loadExercisesForDropdown(db) {
    const select = document.getElementById('exercise-select');
    if (!select) return;

    const q = query(collection(db, 'exercises'), orderBy('title'));
    onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            select.innerHTML = '<option value="">Keine Übungen in DB</option>';
            return;
        }
        select.innerHTML = '<option value="">Übung wählen...</option>';
        snapshot.forEach(doc => {
            const e = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;

            // Check for tieredPoints format
            const hasTieredPoints = e.tieredPoints?.enabled && e.tieredPoints?.milestones?.length > 0;
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
    });
}

/**
 * Handles exercise click event (for dashboard)
 * @param {Event} event - Click event
 */
export function handleExerciseClick(event) {
    const card = event.target.closest('[data-title]');
    if (card) {
        const { title, descriptionContent, imageUrl, points, tags, tieredPoints } = card.dataset;
        openExerciseModal(title, descriptionContent, imageUrl, points, tags, tieredPoints);
    }
}

/**
 * Opens the exercise modal with exercise details
 * @param {string} title - Exercise title
 * @param {string} descriptionContent - Exercise description content (JSON string)
 * @param {string} imageUrl - Exercise image URL
 * @param {string} points - Exercise points
 * @param {string} tags - Exercise tags (JSON string)
 * @param {string} tieredPoints - Tiered points data (JSON string, optional)
 */
export function openExerciseModal(title, descriptionContent, imageUrl, points, tags, tieredPoints) {
    const modal = document.getElementById('exercise-modal');
    if (!modal) return;

    document.getElementById('modal-exercise-title').textContent = title;
    document.getElementById('modal-exercise-image').src = imageUrl;
    document.getElementById('modal-exercise-image').alt = title;

    // Render description content
    const modalDescription = document.getElementById('modal-exercise-description');
    let descriptionData;
    try {
        descriptionData = JSON.parse(descriptionContent);
    } catch (e) {
        // Fallback for old format
        descriptionData = { type: 'text', text: descriptionContent || '' };
    }

    if (descriptionData.type === 'table') {
        const tableHtml = renderTableForDisplay(descriptionData.tableData);
        const additionalText = descriptionData.additionalText || '';
        modalDescription.innerHTML = tableHtml + (additionalText ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>` : '');
    } else {
        modalDescription.textContent = descriptionData.text || '';
        modalDescription.style.whiteSpace = 'pre-wrap';
    }

    // Handle points display with milestones
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

    if (hasTieredPoints) {
        pointsContainer.textContent = `🎯 Bis zu ${points} P.`;

        // Display milestones if container exists
        if (milestonesContainer) {
            const milestonesHtml = tieredPointsData.milestones
                .sort((a, b) => a.count - b.count)
                .map((milestone, index) => {
                    const isFirst = index === 0;
                    const displayPoints = isFirst ? milestone.points : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;
                    return `<div class="flex justify-between items-center py-3 px-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg mb-2 border border-indigo-100">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">🎯</span>
                            <span class="text-base font-semibold text-gray-800">${milestone.count}× abgeschlossen</span>
                        </div>
                        <div class="text-right">
                            <div class="text-xl font-bold text-indigo-600">${displayPoints} P.</div>
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
                    ${milestonesHtml}
                </div>`;
            milestonesContainer.classList.remove('hidden');
        }
    } else {
        pointsContainer.textContent = `+${points} P.`;
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            milestonesContainer.classList.add('hidden');
        }
    }

    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray.map(tag => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`).join('');
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
 * @param {Object} dataset - Dataset object containing exercise details
 */
export function openExerciseModalFromDataset(dataset) {
    const { title, descriptionContent, imageUrl, points, tags, tieredPoints } = dataset;
    openExerciseModal(title, descriptionContent, imageUrl, points, tags, tieredPoints);
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
 * @param {string} level - Exercise level (grundlagen, standard, fortgeschritten)
 * @param {string} difficulty - Exercise difficulty (easy, normal, hard)
 * @returns {number} Calculated points
 */
export function calculateExercisePoints(level, difficulty) {
    // Point matrix according to new system
    const pointsMatrix = {
        grundlagen: {
            easy: 5,
            normal: 6,
            hard: 8
        },
        standard: {
            easy: 8,
            normal: 10,
            hard: 12
        },
        fortgeschritten: {
            normal: 14,
            hard: 18
        }
    };

    // Validate fortgeschritten doesn't have easy
    if (level === 'fortgeschritten' && difficulty === 'easy') {
        return pointsMatrix.fortgeschritten.normal; // Default to normal
    }

    return pointsMatrix[level]?.[difficulty] || 10; // Default fallback
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

            // Disable "easy" for fortgeschritten level
            const easyOption = difficultySelect.querySelector('option[value="easy"]');
            if (level === 'fortgeschritten') {
                easyOption.disabled = true;
                if (difficulty === 'easy') {
                    difficultySelect.value = 'normal';
                    updatePoints(); // Recalculate
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
        console.error('❌ Exercise milestone setup: Missing required elements', {
            milestonesEnabled: !!milestonesEnabled,
            standardContainer: !!standardContainer,
            milestonesContainer: !!milestonesContainer
        });
        return;
    }

    console.log('✅ Exercise milestone setup: All elements found');

    // Function to update UI based on checkbox state
    const updateUI = () => {
        console.log('🔄 Updating exercise UI, checkbox checked:', milestonesEnabled.checked);
        if (milestonesEnabled.checked) {
            standardContainer.classList.add('hidden');
            milestonesContainer.classList.remove('hidden');
            if (pointsInput) pointsInput.removeAttribute('required');
            // Add first milestone by default if none exist
            if (getExerciseMilestones().length === 0) {
                addExerciseMilestone();
            }
        } else {
            standardContainer.classList.remove('hidden');
            milestonesContainer.classList.add('hidden');
            if (pointsInput) pointsInput.setAttribute('required', 'required');
        }
    };

    // Set initial state
    updateUI();

    // Toggle between standard points and milestones
    milestonesEnabled.addEventListener('change', updateUI);

    // Add milestone button
    const addBtn = document.getElementById('add-exercise-milestone-btn');
    if (addBtn) {
        addBtn.addEventListener('click', addExerciseMilestone);
    }

    // When form is reset, ensure UI is reset too
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

    const index = list.children.length;
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

    // Add remove handler
    row.querySelector('.remove-exercise-milestone').addEventListener('click', () => {
        row.remove();
        updateExerciseTotalPoints();
    });

    // Add update handlers
    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', updateExerciseTotalPoints);
    });

    list.appendChild(row);
    updateExerciseTotalPoints();
}

/**
 * Gets all milestones from the form
 * @returns {Array} Array of {count, points} objects
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

    // Sort by count ascending
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
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} storage - Firebase storage instance
 * @param {Object} descriptionEditor - Description editor instance (optional)
 */
export async function handleCreateExercise(e, db, storage, descriptionEditor = null) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title-form').value;
    const level = document.getElementById('exercise-level-form').value;
    const difficulty = document.getElementById('exercise-difficulty-form').value;
    const file = document.getElementById('exercise-image-form').files[0];
    const tagsInput = document.getElementById('exercise-tags-form').value;
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);

    // Check if milestones are enabled
    const milestonesEnabled = document.getElementById('exercise-milestones-enabled')?.checked || false;
    let points = 0;
    let milestones = null;

    if (milestonesEnabled) {
        milestones = getExerciseMilestones();
        if (milestones.length === 0) {
            feedbackEl.textContent = 'Bitte mindestens einen Meilenstein hinzufügen.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
        // Total points is sum of all milestones
        points = milestones.reduce((sum, m) => sum + m.points, 0);
    } else {
        points = parseInt(document.getElementById('exercise-points-form').value);
        if (isNaN(points) || points <= 0) {
            feedbackEl.textContent = 'Bitte gültige Punkte angeben.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
    }

    // Get description content from editor or fallback to textarea
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

    if (!title || !file || !level || !difficulty) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        return;
    }

    try {
        const storageRef = ref(storage, `exercises/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(snapshot.ref);

        const exerciseData = {
            title,
            descriptionContent: JSON.stringify(descriptionContent),
            level,
            difficulty,
            points,
            imageUrl,
            createdAt: serverTimestamp(),
            tags
        };

        // Add tieredPoints if enabled
        if (milestonesEnabled && milestones) {
            exerciseData.tieredPoints = {
                enabled: true,
                milestones: milestones
            };
        } else {
            exerciseData.tieredPoints = {
                enabled: false,
                milestones: []
            };
        }

        await addDoc(collection(db, "exercises"), exerciseData);

        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();

        // Reset points field
        document.getElementById('exercise-points-form').value = '';

        // Reset milestones
        document.getElementById('exercise-milestones-list').innerHTML = '';
        document.getElementById('exercise-milestones-enabled').checked = false;
        document.getElementById('exercise-standard-points-container').classList.remove('hidden');
        document.getElementById('exercise-milestones-container').classList.add('hidden');

        // Clear description editor
        if (descriptionEditor) {
            descriptionEditor.clear();
        }
    } catch (error) {
        console.error("Fehler beim Erstellen der Übung:", error);
        feedbackEl.textContent = 'Fehler: Übung konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        setTimeout(() => { feedbackEl.textContent = ''; }, 4000);
    }
}
