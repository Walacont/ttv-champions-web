import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";

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
            card.dataset.description = exercise.description || '';
            card.dataset.imageUrl = exercise.imageUrl;
            card.dataset.points = exercise.points;
            card.dataset.tags = JSON.stringify(exercise.tags || []);

            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            const tagsHtml = exerciseTags.map(tag => `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`).join('');

            card.innerHTML = `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover">
                              <div class="p-4 flex flex-col flex-grow">
                                  <h3 class="font-bold text-md mb-2">${exercise.title}</h3>
                                  <div class="mb-2">${tagsHtml}</div>
                                  <p class="text-sm text-gray-600 flex-grow truncate">${exercise.description || ''}</p>
                                  <div class="mt-4 text-right">
                                      <span class="font-bold text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full text-sm">+${exercise.points} P.</span>
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
 * Loads all exercises for coach view (without filtering)
 * @param {Object} db - Firestore database instance
 */
export function loadAllExercises(db) {
    const exercisesListCoachEl = document.getElementById('exercises-list-coach');
    if (!exercisesListCoachEl) return;

    onSnapshot(query(collection(db, "exercises"), orderBy("createdAt", "desc")), (snapshot) => {
        exercisesListCoachEl.innerHTML = snapshot.empty ? '<p class="text-gray-500 col-span-full">Keine Übungen gefunden.</p>' : '';
        snapshot.forEach(doc => {
            const exercise = { id: doc.id, ...doc.data() };
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow';
            card.dataset.id = exercise.id;
            card.dataset.title = exercise.title;
            card.dataset.description = exercise.description || '';
            card.dataset.imageUrl = exercise.imageUrl;
            card.dataset.points = exercise.points;
            card.dataset.tags = JSON.stringify(exercise.tags || []);
            const tagsHtml = (exercise.tags || []).map(tag => `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`).join('');
            card.innerHTML = `<img src="${exercise.imageUrl}" alt="${exercise.title}" class="w-full h-56 object-cover pointer-events-none">
                              <div class="p-4 flex flex-col flex-grow pointer-events-none">
                                  <h3 class="font-bold text-md mb-2 flex-grow">${exercise.title}</h3>
                                  <div class="pt-2">${tagsHtml}</div>
                              </div>`;
            exercisesListCoachEl.appendChild(card);
        });
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
            option.textContent = `${e.title} (+${e.points} P.)`;
            option.dataset.points = e.points;
            option.dataset.title = e.title;
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
        const { title, description, imageUrl, points, tags } = card.dataset;
        openExerciseModal(title, description, imageUrl, points, tags);
    }
}

/**
 * Opens the exercise modal with exercise details
 * @param {string} title - Exercise title
 * @param {string} description - Exercise description
 * @param {string} imageUrl - Exercise image URL
 * @param {string} points - Exercise points
 * @param {string} tags - Exercise tags (JSON string)
 */
export function openExerciseModal(title, description, imageUrl, points, tags) {
    const modal = document.getElementById('exercise-modal');
    if (!modal) return;

    document.getElementById('modal-exercise-title').textContent = title;
    document.getElementById('modal-exercise-image').src = imageUrl;
    document.getElementById('modal-exercise-image').alt = title;
    document.getElementById('modal-exercise-description').textContent = description;
    document.getElementById('modal-exercise-points').textContent = `+${points} P.`;

    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray.map(tag => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`).join('');
    } else {
        tagsContainer.innerHTML = '';
    }

    modal.classList.remove('hidden');
}

/**
 * Opens the exercise modal from dataset (for coach)
 * @param {Object} dataset - Dataset object containing exercise details
 */
export function openExerciseModalFromDataset(dataset) {
    const { title, description, imageUrl, points, tags } = dataset;
    openExerciseModal(title, description, imageUrl, points, tags);
}

/**
 * Closes the exercise modal
 */
export function closeExerciseModal() {
    const modal = document.getElementById('exercise-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Handles exercise creation form submission (for coach)
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} storage - Firebase storage instance
 */
export async function handleCreateExercise(e, db, storage) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title-form').value;
    const description = document.getElementById('exercise-description-form').value;
    const points = parseInt(document.getElementById('exercise-points-form').value);
    const file = document.getElementById('exercise-image-form').files[0];
    const tagsInput = document.getElementById('exercise-tags-form').value;
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);

    feedbackEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';

    if (!title || !file || isNaN(points) || points <= 0) {
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
        await addDoc(collection(db, "exercises"), {
            title, description, points, imageUrl, createdAt: serverTimestamp(), tags
        });
        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        e.target.reset();
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
