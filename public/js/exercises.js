import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    ref,
    uploadBytes,
    getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';
import { renderTableForDisplay } from './tableEditor.js';



let exerciseContext = {
    db: null,
    userId: null,
    userRole: null,
};


export function setExerciseContext(db, userId, userRole) {
    exerciseContext.db = db;
    exerciseContext.userId = userId;
    exerciseContext.userRole = userRole;
}



export async function loadExercises(db, unsubscribes) {
    const exercisesListEl = document.getElementById('exercises-list');
    if (!exercisesListEl) return;

    let exercisesData = [];

    const q = query(collection(db, 'exercises'), orderBy('createdAt', 'desc'));

    const exerciseListener = onSnapshot(q, async snapshot => {
        if (snapshot.empty) {
            exercisesListEl.innerHTML = `<p class="text-gray-400 col-span-full">Keine Übungen in der Datenbank gefunden.</p>`;
            return;
        }

        exercisesListEl.innerHTML = '';
        const allTags = new Set();
        const exercises = [];
        exercisesData = [];

        for (const docSnap of snapshot.docs) {
            const exercise = docSnap.data();
            const exerciseId = docSnap.id;

            exercisesData.push({ docSnap, exercise, exerciseId });

            let progressPercent = 0;
            if (exerciseContext.userId && exerciseContext.userRole === 'player') {
                progressPercent = await calculateExerciseProgress(
                    db,
                    exerciseContext.userId,
                    exerciseId,
                    exercise
                );
            }

            const card = createExerciseCard(docSnap, exercise, progressPercent);
            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            exercises.push({ card, tags: exerciseTags });
            exercisesListEl.appendChild(card);
        }

        renderTagFilters(allTags, exercises);
    });

    if (unsubscribes) unsubscribes.push(exerciseListener);

    if (exerciseContext.userId && exerciseContext.userRole === 'player') {
        const completedListener = onSnapshot(
            collection(db, `users/${exerciseContext.userId}/completedExercises`),
            snapshot => {
                snapshot.docChanges().forEach(change => {
                    const exerciseId = change.doc.id;
                    updateExerciseCardProgress(db, exerciseId, exercisesData);
                });
            }
        );

        const milestonesListener = onSnapshot(
            collection(db, `users/${exerciseContext.userId}/exerciseMilestones`),
            snapshot => {
                snapshot.docChanges().forEach(change => {
                    const exerciseId = change.doc.id;
                    updateExerciseCardProgress(db, exerciseId, exercisesData);
                });
            }
        );

        if (unsubscribes) {
            unsubscribes.push(completedListener);
            unsubscribes.push(milestonesListener);
        }
    }
}


async function updateExerciseCardProgress(db, exerciseId, exercisesData) {
    const cardElement = document.querySelector(`.exercise-card[data-id="${exerciseId}"]`);
    if (!cardElement) return;

    const exerciseInfo = exercisesData.find(e => e.exerciseId === exerciseId);
    if (!exerciseInfo) return;

    const progressPercent = await calculateExerciseProgress(
        db,
        exerciseContext.userId,
        exerciseId,
        exerciseInfo.exercise
    );

    const progressContainer = cardElement.querySelector('.absolute.top-2.right-2');
    if (progressContainer) {
        progressContainer.outerHTML = generateProgressCircle(progressPercent);
    }

    console.log(`✅ Updated progress for exercise ${exerciseId}: ${progressPercent}%`);
}


async function calculateExerciseProgress(db, userId, exerciseId, exercise) {
    try {
        const hasMilestones =
            exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0;

        if (hasMilestones) {
            const progressDoc = await getDoc(
                doc(db, `users/${userId}/exerciseMilestones`, exerciseId)
            );
            if (!progressDoc.exists()) return 0;

            const progressData = progressDoc.data();
            const currentCount = progressData.currentCount || 0;
            const milestones = exercise.tieredPoints.milestones;
            const maxCount = Math.max(...milestones.map(m => m.count));

            const achievedMilestones = milestones.filter(m => currentCount >= m.count).length;
            const totalMilestones = milestones.length;

            return (achievedMilestones / totalMilestones) * 100;
        } else {
            const completedDoc = await getDoc(
                doc(db, `users/${userId}/completedExercises`, exerciseId)
            );
            return completedDoc.exists() ? 100 : 0;
        }
    } catch (error) {
        console.error('Error calculating progress:', error);
        return 0;
    }
}


function createExerciseCard(docSnap, exercise, progressPercent) {
    const card = document.createElement('div');
    card.className =
        'exercise-card bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-xl transition-shadow duration-300 relative';
    card.dataset.id = docSnap.id;
    card.dataset.title = exercise.title;

    if (exercise.descriptionContent) {
        card.dataset.descriptionContent = exercise.descriptionContent;
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

    const hasTieredPoints =
        exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0;
    const pointsBadge = hasTieredPoints
        ? `<span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">🎯 Bis zu ${exercise.points} P.</span>`
        : `<span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">+${exercise.points} P.</span>`;

    const progressCircle = generateProgressCircle(progressPercent);

    const imageHtml = exercise.imageUrl
        ? `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover">`
        : `<div class="w-full h-56 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border-b border-gray-200">
               <div class="text-center">
                   <svg class="w-16 h-16 mx-auto text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                   </svg>
                   <p class="text-xs text-gray-400">Kein Bild</p>
               </div>
           </div>`;

    card.innerHTML = `
        ${progressCircle}
        ${imageHtml}
        <div class="p-4 flex flex-col flex-grow">
            <h3 class="font-bold text-md mb-2">${exercise.title}</h3>
            <div class="mb-2">${tagsHtml}</div>
            <p class="text-sm text-gray-600 flex-grow truncate">${exercise.description || ''}</p>
            <div class="mt-4 text-right">
                ${pointsBadge}
            </div>
        </div>`;

    return card;
}


function generateProgressCircle(percent) {
    if (percent === 0) {
        return `
            <div class="absolute top-2 right-2 z-10">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" fill="white" stroke="#E5E7EB" stroke-width="3"/>
                </svg>
            </div>`;
    } else if (percent === 100) {
        return `
            <div class="absolute top-2 right-2 z-10">
                <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="18" fill="#10B981"/>
                    <path d="M12 20 L17 25 L28 14" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>`;
    } else {
        const radius = 16;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;

        return `
            <div class="absolute top-2 right-2 z-10">
                <svg width="40" height="40" viewBox="0 0 40 40" class="transform -rotate-90">
                    <circle cx="20" cy="20" r="${radius}" fill="white" stroke="#E5E7EB" stroke-width="3"/>
                    <circle cx="20" cy="20" r="${radius}" fill="none" stroke="#10B981" stroke-width="3"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                            stroke-linecap="round"/>
                </svg>
                <div class="absolute inset-0 flex items-center justify-center text-xs font-bold text-green-600">
                    ${Math.round(percent)}%
                </div>
            </div>`;
    }
}


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


export function loadAllExercises(db) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    onSnapshot(
        query(collection(db, 'exercises'), orderBy('createdAt', 'desc')),
        snapshot => {
            const exercises = [];
            const allTags = new Set();

            snapshot.forEach(doc => {
                const exercise = { id: doc.id, ...doc.data() };
                exercises.push(exercise);
                (exercise.tags || []).forEach(tag => allTags.add(tag));
            });

            renderTagFiltersCoach(allTags, exercises);

            renderCoachExercises(exercises, 'all');
        },
        error => {
            console.error('[Exercises] Error loading exercises:', error.code || error.message);
            if (exercisesListCoachEl) {
                exercisesListCoachEl.innerHTML =
                    '<p class="text-gray-400 col-span-full">Keine Übungen verfügbar</p>';
            }
        }
    );
}


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
            card.dataset.descriptionContent = exercise.descriptionContent;
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

        const hasTieredPoints =
            exercise.tieredPoints?.enabled && exercise.tieredPoints?.milestones?.length > 0;
        const pointsBadge = hasTieredPoints
            ? `🎯 Bis zu ${exercise.points} P.`
            : `${exercise.points} P.`;

        const imageHtml = exercise.imageUrl
            ? `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover pointer-events-none">`
            : `<div class="w-full h-56 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center border-b border-gray-200 pointer-events-none">
                   <div class="text-center">
                       <svg class="w-16 h-16 mx-auto text-gray-300 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                       </svg>
                       <p class="text-xs text-gray-400">Kein Bild</p>
                   </div>
               </div>`;

        card.innerHTML = `
            ${imageHtml}
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


export function loadExercisesForDropdown(db) {
    const select = document.getElementById('exercise-select');
    if (!select) return;

    const q = query(collection(db, 'exercises'), orderBy('title'));
    onSnapshot(
        q,
        snapshot => {
            if (snapshot.empty) {
                select.innerHTML = '<option value="">Keine Übungen in DB</option>';
                return;
            }
            select.innerHTML = '<option value="">Übung wählen...</option>';
            snapshot.forEach(doc => {
                const e = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;

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
        },
        error => {
            console.error(
                '[Exercises] Error loading exercises dropdown:',
                error.code || error.message
            );
            if (select) {
                select.innerHTML = '<option value="">Keine Übungen verfügbar</option>';
            }
        }
    );
}


export function handleExerciseClick(event) {
    const card = event.target.closest('[data-title]');
    if (card) {
        const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints } =
            card.dataset;
        openExerciseModal(id, title, descriptionContent, imageUrl, points, tags, tieredPoints);
    }
}


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

    let playerProgress = null;
    if (
        hasTieredPoints &&
        exerciseContext.userRole === 'player' &&
        exerciseContext.db &&
        exerciseContext.userId &&
        exerciseId
    ) {
        try {
            const progressRef = doc(
                exerciseContext.db,
                `users/${exerciseContext.userId}/exerciseMilestones`,
                exerciseId
            );
            const progressSnap = await getDoc(progressRef);
            if (progressSnap.exists()) {
                playerProgress = progressSnap.data();
            }
        } catch (error) {
            console.log('Could not load player progress:', error);
        }
    }

    const currentCount = playerProgress?.currentCount || 0;

    if (hasTieredPoints) {
        pointsContainer.textContent = `🎯 Bis zu ${points} P.`;

        if (milestonesContainer) {
            let progressHtml = '';
            if (exerciseContext.userRole === 'player') {
                const nextMilestone = tieredPointsData.milestones.find(m => m.count > currentCount);
                const remaining = nextMilestone ? nextMilestone.count - currentCount : 0;

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
        pointsContainer.textContent = `+${points} P.`;
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            milestonesContainer.classList.add('hidden');
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


export function openExerciseModalFromDataset(dataset) {
    const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints } = dataset;
    openExerciseModal(id, title, descriptionContent, imageUrl, points, tags, tieredPoints);
}


export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) modal.classList.add('hidden');
}


export function calculateExercisePoints(level, difficulty) {
    const pointsMatrix = {
        grundlagen: {
            easy: 5,
            normal: 6,
            hard: 8,
        },
        standard: {
            easy: 8,
            normal: 10,
            hard: 12,
        },
        fortgeschritten: {
            normal: 14,
            hard: 18,
        },
    };

    if (level === 'fortgeschritten' && difficulty === 'easy') {
        return pointsMatrix.fortgeschritten.normal;
    }

    return pointsMatrix[level]?.[difficulty] || 10;
}


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


export function setupExerciseMilestones() {
    const milestonesEnabled = document.getElementById('exercise-milestones-enabled');
    const standardContainer = document.getElementById('exercise-standard-points-container');
    const milestonesContainer = document.getElementById('exercise-milestones-container');
    const pointsInput = document.getElementById('exercise-points-form');

    if (!milestonesEnabled || !standardContainer || !milestonesContainer) {
        console.error('❌ Exercise milestone setup: Missing required elements', {
            milestonesEnabled: !!milestonesEnabled,
            standardContainer: !!standardContainer,
            milestonesContainer: !!milestonesContainer,
        });
        return;
    }

    console.log('✅ Exercise milestone setup: All elements found');

    const updateUI = () => {
        console.log('🔄 Updating exercise UI, checkbox checked:', milestonesEnabled.checked);
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


function updateExerciseTotalPoints() {
    const milestones = getExerciseMilestones();
    const total = milestones.reduce((sum, m) => sum + m.points, 0);
    const totalEl = document.getElementById('exercise-total-milestone-points');
    if (totalEl) {
        totalEl.textContent = total;
    }
}


export async function handleCreateExercise(e, db, storage, descriptionEditor = null) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title-form').value;
    const level = document.getElementById('exercise-level-form').value;
    const difficulty = document.getElementById('exercise-difficulty-form').value;
    const file = document.getElementById('exercise-image-form').files[0];
    const tagsInput = document.getElementById('exercise-tags-form').value;
    const tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

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

        if (file) {
            const storageRef = ref(storage, `exercises/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snapshot.ref);
        }

        const exerciseData = {
            title,
            descriptionContent: JSON.stringify(descriptionContent),
            level,
            difficulty,
            points,
            createdAt: serverTimestamp(),
            tags,
        };

        if (imageUrl) {
            exerciseData.imageUrl = imageUrl;
        }

        if (milestonesEnabled && milestones) {
            exerciseData.tieredPoints = {
                enabled: true,
                milestones: milestones,
            };
        } else {
            exerciseData.tieredPoints = {
                enabled: false,
                milestones: [],
            };
        }

        await addDoc(collection(db, 'exercises'), exerciseData);

        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();

        document.getElementById('exercise-points-form').value = '';

        document.getElementById('exercise-milestones-list').innerHTML = '';
        document.getElementById('exercise-milestones-enabled').checked = false;
        document.getElementById('exercise-standard-points-container').classList.remove('hidden');
        document.getElementById('exercise-milestones-container').classList.add('hidden');

        if (descriptionEditor) {
            descriptionEditor.clear();
        }
    } catch (error) {
        console.error('Fehler beim Erstellen der Übung:', error);
        feedbackEl.textContent = 'Fehler: Übung konnte nicht erstellt werden.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        setTimeout(() => {
            feedbackEl.textContent = '';
        }, 4000);
    }
}
