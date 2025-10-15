import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
// NEU: Zusätzliche Imports für die Emulatoren
import { getAuth, onAuthStateChanged, signOut, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, onSnapshot, query, deleteDoc, serverTimestamp, orderBy, updateDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, deleteObject, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
// NEU: Functions-Dienst initialisieren
const functions = getFunctions(app);

// NEU: Der Emulator-Block
// Dieser Code verbindet sich nur dann mit den Emulatoren,
// wenn die Seite lokal (z.B. über Live Server) ausgeführt wird.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Admin.js: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);
    
    // Functions Emulator
    connectFunctionsEmulator(functions, "localhost", 5001);

    // Storage Emulator
    connectStorageEmulator(storage, "localhost", 9199);
}


const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
// ... (der Rest deines Codes bleibt unverändert) ...
const authErrorContainer = document.getElementById('auth-error-container');
const authErrorMessage = document.getElementById('auth-error-message');
const errorLogoutButton = document.getElementById('error-logout-button');
const welcomeMessage = document.getElementById('welcome-message');
const logoutButton = document.getElementById('logout-button');
const inviteCoachForm = document.getElementById('invite-coach-form');
const inviteLinkContainer = document.getElementById('invite-link-container');
const inviteLinkInput = document.getElementById('invite-link-input');
const copyLinkButton = document.getElementById('copy-link-button');
const clubsListEl = document.getElementById('clubs-list');
const createExerciseForm = document.getElementById('create-exercise-form');
const exercisesListAdminEl = document.getElementById('exercises-list-admin');

// Modals
const playerModal = document.getElementById('player-modal');
const closePlayerModalButton = document.getElementById('close-player-modal-button');
const modalClubIdEl = document.getElementById('modal-club-id');
const modalPlayerListEl = document.getElementById('modal-player-list');

const exerciseModal = document.getElementById('exercise-modal');
const closeExerciseModalButton = document.getElementById('close-exercise-modal-button');
const modalExerciseTitle = document.getElementById('modal-exercise-title');
const modalExerciseImage = document.getElementById('modal-exercise-image');
const modalExerciseDescription = document.getElementById('modal-exercise-description');
const modalExercisePoints = document.getElementById('modal-exercise-points');
const modalDeleteExerciseButton = document.getElementById('modal-delete-exercise-button');
const modalEditExerciseButton = document.getElementById('modal-edit-exercise-button');

const editExerciseModal = document.getElementById('edit-exercise-modal');
const editExerciseForm = document.getElementById('edit-exercise-form');
const closeEditExerciseModalButton = document.getElementById('close-edit-exercise-modal-button');

let genderChartInstance = null;
let attendanceChartInstance = null;

function showAuthError(message) {
    pageLoader.style.display = 'none';
    mainContent.style.display = 'none';
    authErrorMessage.textContent = message;
    authErrorContainer.style.display = 'flex';
    console.error("Auth-Fehler auf Admin-Seite:", message);
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                 const userData = userDocSnap.data();
                if (userData.role === 'admin') {
                    initializeAdminPage(userData, user);
                } else {
                     showAuthError(`Ihre Rolle ('${userData.role}') hat keine Admin-Berechtigung.`);
                }
            } else {
                 showAuthError("Ihr Benutzerprofil wurde nicht in der Datenbank gefunden.");
            }
        } catch (error) {
            showAuthError(`Datenbankfehler: ${error.message}`);
        }
    } else {
        window.location.href = '/index.html';
    }
});

function initializeAdminPage(userData, user) {
    try {
        welcomeMessage.textContent = `Willkommen, ${userData.firstName || user.email}!`;
        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

        logoutButton.addEventListener('click', () => signOut(auth));
        errorLogoutButton.addEventListener('click', () => signOut(auth));
        inviteCoachForm.addEventListener('submit', handleInviteCoach);
        copyLinkButton.addEventListener('click', copyInviteLink);
        createExerciseForm.addEventListener('submit', handleCreateExercise);

        // Modal Listeners
        closePlayerModalButton.addEventListener('click', () => playerModal.classList.add('hidden'));
        closeExerciseModalButton.addEventListener('click', () => exerciseModal.classList.add('hidden'));
        closeEditExerciseModalButton.addEventListener('click', () => editExerciseModal.classList.add('hidden'));
        
        modalPlayerListEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-player-btn')) {
                handleDeletePlayer(e.target.dataset.id);
            }
        });

        exercisesListAdminEl.addEventListener('click', (e) => {
            const card = e.target.closest('[data-id]');
            if(card) {
                openExerciseModal(card.dataset);
            }
        });
        
        // *** HIER WURDE DER FEHLENDE LISTENER HINZUGEFÜGT ***
        modalEditExerciseButton.addEventListener('click', (e) => {
            openEditExerciseModal(e.target.dataset);
        });

        modalDeleteExerciseButton.addEventListener('click', (e) => {
            handleDeleteExercise(e.target.dataset.id, e.target.dataset.imageUrl);
        });

        editExerciseForm.addEventListener('submit', handleUpdateExercise);

        loadClubsAndPlayers();
        loadAllExercises();
        loadStatistics();
    } catch (error) {
        showAuthError(`Initialisierungsfehler: ${error.message}`);
    }
}

async function handleInviteCoach(e) {
    e.preventDefault();
    const clubId = document.getElementById('clubId').value;
    if (!clubId) return alert("Bitte eine Vereins-ID angeben.");
    
    try {
        const tokenDoc = await addDoc(collection(db, "invitationTokens"), {
            clubId: clubId,
            role: 'coach',
            isUsed: false,
            createdAt: new Date(),
            targetUserId: null
        });
        const link = `${window.location.origin}/register.html?token=${tokenDoc.id}`;
        inviteLinkInput.value = link;
        inviteLinkContainer.classList.remove('hidden');
    } catch (error) {
        console.error("Fehler beim Erstellen des Tokens:", error);
        alert("Fehler: Der Einladungslink konnte nicht erstellt werden.");
    }
}

function copyInviteLink() {
    inviteLinkInput.select();
    document.execCommand('copy');
    alert('Link in die Zwischenablage kopiert!');
}

function openExerciseModal(dataset) {
    const { id, title, description, imageUrl, points, tags } = dataset;
    modalExerciseTitle.textContent = title;
    modalExerciseImage.src = imageUrl;
    modalExerciseDescription.textContent = description;
    modalExerciseDescription.style.whiteSpace = 'pre-wrap'; // Stellt Zeilenumbrüche sicher dar
    modalExercisePoints.textContent = `+${points} P.`;

    // Set data for both buttons
    modalDeleteExerciseButton.dataset.id = id;
    modalDeleteExerciseButton.dataset.imageUrl = imageUrl;
    modalEditExerciseButton.dataset.id = id;
    modalEditExerciseButton.dataset.title = title;
    modalEditExerciseButton.dataset.description = description;
    modalEditExerciseButton.dataset.points = points;
    modalEditExerciseButton.dataset.tags = tags;

    const tagsContainer = document.getElementById('modal-exercise-tags');
    const tagsArray = JSON.parse(tags || '[]');
    if (tagsArray && tagsArray.length > 0) {
        tagsContainer.innerHTML = tagsArray.map(tag => `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`).join('');
    } else {
        tagsContainer.innerHTML = '';
    }
    
    exerciseModal.classList.remove('hidden');
}

function openEditExerciseModal(dataset) {
    const { id, title, description, points, tags } = dataset;
    
    // Populate form fields
    document.getElementById('edit-exercise-id').value = id;
    document.getElementById('edit-exercise-title').value = title;
    document.getElementById('edit-exercise-description').value = description;
    document.getElementById('edit-exercise-points').value = points;
    const tagsArray = JSON.parse(tags || '[]');
    document.getElementById('edit-exercise-tags').value = tagsArray.join(', ');

    // Show the edit modal and hide the view modal
    exerciseModal.classList.add('hidden');
    editExerciseModal.classList.remove('hidden');
}

async function handleUpdateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('edit-exercise-feedback');
    const exerciseId = document.getElementById('edit-exercise-id').value;
    
    const updatedData = {
        title: document.getElementById('edit-exercise-title').value,
        description: document.getElementById('edit-exercise-description').value,
        points: parseInt(document.getElementById('edit-exercise-points').value),
        tags: document.getElementById('edit-exercise-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag)
    };

    if (!updatedData.title || isNaN(updatedData.points)) {
        feedbackEl.textContent = 'Titel und Punkte sind Pflichtfelder.';
        feedbackEl.className = 'mt-2 text-sm text-center text-red-600';
        return;
    }

    try {
        const exerciseRef = doc(db, 'exercises', exerciseId);
        await updateDoc(exerciseRef, updatedData);
        
        feedbackEl.textContent = 'Erfolgreich gespeichert!';
        feedbackEl.className = 'mt-2 text-sm text-center text-green-600';

        setTimeout(() => {
            editExerciseModal.classList.add('hidden');
            feedbackEl.textContent = '';
        }, 1500);

    } catch (error) {
        console.error('Fehler beim Speichern der Übung:', error);
        feedbackEl.textContent = 'Ein Fehler ist aufgetreten.';
        feedbackEl.className = 'mt-2 text-sm text-center text-red-600';
    }
}


async function loadStatistics() {
    try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        const users = usersSnapshot.docs.map(doc => doc.data());
        
        const attendanceSnapshot = await getDocs(collection(db, "attendance"));
        const attendances = attendanceSnapshot.docs.map(doc => doc.data());

        document.getElementById('stats-total-users').textContent = users.length;
        document.getElementById('stats-total-clubs').textContent = new Set(users.map(u => u.clubId).filter(Boolean)).size;
        document.getElementById('stats-total-points').textContent = users.reduce((sum, u) => sum + (u.points || 0), 0);
        document.getElementById('stats-total-attendance').textContent = attendances.reduce((sum, a) => sum + (a.presentPlayerIds?.length || 0), 0);

        const genderCounts = users.reduce((acc, user) => {
            const gender = user.gender || 'unknown';
            acc[gender] = (acc[gender] || 0) + 1;
            return acc;
        }, {});

        const attendanceByMonth = attendances.reduce((acc, record) => {
            if (record.date) {
                const month = new Date(record.date).toLocaleString('de-DE', { month: 'short', year: '2-digit' });
                acc[month] = (acc[month] || 0) + (record.presentPlayerIds?.length || 0);
            }
            return acc;
        }, {});
        const sortedMonths = Object.keys(attendanceByMonth).sort((a,b) => {
            const [m1, y1] = a.split(' '); const [m2, y2] = b.split(' ');
            return new Date(`01 ${m1} 20${y1}`) - new Date(`01 ${m2} 20${y2}`);
        });

        renderGenderChart(genderCounts);
        renderAttendanceChart(sortedMonths, attendanceByMonth);

    } catch (error) {
        console.error("Fehler beim Laden der Statistiken:", error);
        document.getElementById('statistics-section').innerHTML = '<p class="text-red-500">Statistiken konnten nicht geladen werden.</p>';
    }
}

function renderGenderChart(data) {
    const ctx = document.getElementById('gender-chart').getContext('2d');
    if(genderChartInstance) genderChartInstance.destroy();
    genderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Männlich', 'Weiblich', 'Divers', 'Unbekannt'],
            datasets: [{
                data: [data.male || 0, data.female || 0, data.diverse || 0, data.unknown || 0],
                backgroundColor: ['#3b82f6', '#ec4899', '#8b5cf6', '#a1a1aa'],
            }]
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
}

function renderAttendanceChart(labels, data) {
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    const chartData = labels.map(label => data[label]);
     if(attendanceChartInstance) attendanceChartInstance.destroy();
    attendanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Anwesenheiten',
                data: chartData,
                backgroundColor: 'rgba(79, 70, 229, 0.8)',
                borderColor: 'rgba(79, 70, 229, 1)',
                borderWidth: 1
            }]
        },
        options: { scales: { y: { beginAtZero: true } }, responsive: true, plugins: { legend: { display: false } } }
    });
}

function loadClubsAndPlayers() {
    onSnapshot(query(collection(db, "users")), 
    (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const clubs = users.reduce((acc, user) => {
            if (user.clubId) {
                if (!acc[user.clubId]) { acc[user.clubId] = []; }
                acc[user.clubId].push(user);
            }
            return acc;
        }, {});

        clubsListEl.innerHTML = Object.keys(clubs).length === 0 ? '<p class="text-gray-500">Keine Vereine gefunden.</p>' : '';
        for (const clubId in clubs) {
            const clubDiv = document.createElement('div');
            clubDiv.className = 'p-4 bg-gray-50 rounded-lg flex justify-between items-center';
            clubDiv.innerHTML = `<p class="font-semibold">${clubId}</p><button data-club-id="${clubId}" class="view-players-button bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600">Mitglieder anzeigen (${clubs[clubId].length})</button>`;
            clubsListEl.appendChild(clubDiv);
        }

        document.querySelectorAll('.view-players-button').forEach(button => {
            button.addEventListener('click', () => {
                const clubId = button.dataset.clubId;
                modalClubIdEl.textContent = `Mitglieder von: ${clubId}`;
                modalPlayerListEl.innerHTML = '';
                clubs[clubId].sort((a,b) => (a.lastName || '').localeCompare(b.lastName || '')).forEach(player => {
                    const playerEl = document.createElement('div');
                    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                    playerEl.className = 'p-2 border-b flex justify-between items-center';
                    playerEl.innerHTML = `<div class="flex items-center"><img src="${avatarSrc}" alt="Avatar" class="h-10 w-10 rounded-full object-cover mr-4"><div><p class="font-medium">${player.firstName} ${player.lastName} (${player.role})</p><p class="text-sm text-gray-500">${player.email || 'Offline'}</p></div></div><button data-id="${player.id}" class="delete-player-btn text-red-500 hover:text-red-700 font-semibold text-sm">Löschen</button>`;
                    modalPlayerListEl.appendChild(playerEl);
                });
                playerModal.classList.remove('hidden');
            });
        });
    },
    (error) => {
        console.error("Fehler beim Laden der Vereinsübersicht:", error);
        clubsListEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Vereine.</p>';
    });
}

async function handleDeletePlayer(playerId) {
    if (confirm("Sind Sie sicher, dass Sie diesen Benutzer endgültig löschen möchten?")) {
        try {
            await deleteDoc(doc(db, "users", playerId));
            alert("Benutzer erfolgreich gelöscht.");
        } catch (error) {
            console.error("Fehler beim Löschen des Benutzers:", error);
            alert("Fehler: Der Benutzer konnte nicht gelöscht werden.");
        }
    }
}

async function handleCreateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title').value;
    const description = document.getElementById('exercise-description').value;
    const points = parseInt(document.getElementById('exercise-points').value);
    const file = document.getElementById('exercise-image').files[0];
    const tagsInput = document.getElementById('exercise-tags').value;
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
        createExerciseForm.reset();

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

function loadAllExercises() {
    const q = query(collection(db, "exercises"), orderBy("createdAt", "desc"));
    onSnapshot(q, 
    (snapshot) => {
        exercisesListAdminEl.innerHTML = snapshot.empty ? '<p class="text-gray-500 col-span-full">Keine Übungen gefunden.</p>' : '';
        
        const exercises = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        exercises.forEach(exercise => {
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
            exercisesListAdminEl.appendChild(card);
        });
    },
    (error) => {
        console.error("Fehler beim Laden des Übungskatalogs:", error);
        exercisesListAdminEl.innerHTML = '<p class="text-red-500 col-span-full">Fehler beim Laden der Übungen.</p>';
    });
}

async function handleDeleteExercise(exerciseId, imageUrl) {
     if (confirm("Sind Sie sicher, dass Sie diese Übung endgültig löschen möchten?")) {
        try {
            await deleteDoc(doc(db, "exercises", exerciseId));
            const imageRef = ref(storage, imageUrl);
            await deleteObject(imageRef);
            alert("Übung erfolgreich gelöscht.");
            exerciseModal.classList.add('hidden');
        } catch (error) {
            console.error("Fehler beim Löschen der Übung:", error);
            alert("Fehler: Die Übung konnte nicht vollständig gelöscht werden.");
        }
    }
}