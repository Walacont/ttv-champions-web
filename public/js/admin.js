import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
// NEU: Zusätzliche Imports für die Emulatoren
import { getAuth, onAuthStateChanged, signOut, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, onSnapshot, query, deleteDoc, serverTimestamp, orderBy, updateDoc, where, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, deleteObject, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from './firebase-config.js';
import { generateInvitationCode, getExpirationDate } from './invitation-code-utils.js';
import { setupDescriptionEditor, renderTableForDisplay } from './tableEditor.js';
import { initializeExerciseMilestones, getExerciseMilestones, isExerciseTieredPointsEnabled } from './milestone-management.js';

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
let descriptionEditor = null;
let editDescriptionEditor = null;

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

        // Initialize description editors
        descriptionEditor = setupDescriptionEditor({
            textAreaId: 'exercise-description',
            toggleContainerId: 'description-toggle-container',
            tableEditorContainerId: 'description-table-editor'
        });

        editDescriptionEditor = setupDescriptionEditor({
            textAreaId: 'edit-exercise-description',
            toggleContainerId: 'edit-description-toggle-container',
            tableEditorContainerId: 'edit-description-table-editor'
        });

        // Initialize milestone management
        initializeExerciseMilestones();

        // Modal Listeners
        closePlayerModalButton.addEventListener('click', () => playerModal.classList.add('hidden'));
        closeExerciseModalButton.addEventListener('click', () => exerciseModal.classList.add('hidden'));
        closeEditExerciseModalButton.addEventListener('click', () => editExerciseModal.classList.add('hidden'));

        // Toggle abbreviations in exercise modal
        const toggleAbbreviationsAdmin = document.getElementById('toggle-abbreviations-admin');
        const abbreviationsContentAdmin = document.getElementById('abbreviations-content-admin');
        const abbreviationsIconAdmin = document.getElementById('abbreviations-icon-admin');
        if (toggleAbbreviationsAdmin && abbreviationsContentAdmin && abbreviationsIconAdmin) {
            toggleAbbreviationsAdmin.addEventListener('click', () => {
                const isHidden = abbreviationsContentAdmin.classList.contains('hidden');
                if (isHidden) {
                    abbreviationsContentAdmin.classList.remove('hidden');
                    abbreviationsIconAdmin.style.transform = 'rotate(180deg)';
                    toggleAbbreviationsAdmin.innerHTML = '<svg id="abbreviations-icon-admin" class="w-4 h-4 transform transition-transform" style="transform: rotate(180deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen ausblenden';
                } else {
                    abbreviationsContentAdmin.classList.add('hidden');
                    abbreviationsIconAdmin.style.transform = 'rotate(0deg)';
                    toggleAbbreviationsAdmin.innerHTML = '<svg id="abbreviations-icon-admin" class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen anzeigen';
                }
            });
        }
        
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
        // Generate unique code
        let code = generateInvitationCode();
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
            const q = query(collection(db, 'invitationCodes'), where('code', '==', code));
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                isUnique = true;
            } else {
                code = generateInvitationCode();
                attempts++;
            }
        }

        if (!isUnique) {
            throw new Error('Konnte keinen eindeutigen Code generieren.');
        }

        // Create code document
        const expiresAt = getExpirationDate();
        await addDoc(collection(db, "invitationCodes"), {
            code,
            clubId: clubId,
            createdBy: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            expiresAt,
            maxUses: 1,
            used: false,
            usedBy: null,
            usedAt: null,
            firstName: '',
            lastName: '',
            subgroupIds: [],
            // WICHTIG: Für Coach-Registrierung speichern
            role: 'coach'
        });

        // Display code
        inviteLinkInput.value = code;
        inviteLinkContainer.classList.remove('hidden');
    } catch (error) {
        console.error("Fehler beim Erstellen des Codes:", error);
        alert("Fehler: Der Einladungscode konnte nicht erstellt werden.");
    }
}

function copyInviteLink() {
    inviteLinkInput.select();
    document.execCommand('copy');
    alert('Link in die Zwischenablage kopiert!');
}

function openExerciseModal(dataset) {
    const { id, title, descriptionContent, imageUrl, points, tags, tieredPoints } = dataset;
    modalExerciseTitle.textContent = title;
    modalExerciseImage.src = imageUrl;

    // Render description content
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
        modalExerciseDescription.innerHTML = tableHtml + (additionalText ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>` : '');
    } else {
        modalExerciseDescription.textContent = descriptionData.text || '';
        modalExerciseDescription.style.whiteSpace = 'pre-wrap';
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

    const milestonesContainer = document.getElementById('modal-exercise-milestones-admin');
    const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;

    if (hasTieredPoints) {
        modalExercisePoints.textContent = `🎯 Bis zu ${points} P.`;

        // Display milestones if container exists
        if (milestonesContainer) {
            const milestonesHtml = tieredPointsData.milestones
                .sort((a, b) => a.count - b.count)
                .map((milestone, index) => {
                    const isFirst = index === 0;
                    const displayPoints = isFirst ? milestone.points : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;
                    return `<div class="flex justify-between items-center py-1">
                        <span class="text-sm text-gray-700">${milestone.count}× abgeschlossen:</span>
                        <span class="font-semibold text-indigo-600">${displayPoints} P. (gesamt: ${milestone.points} P.)</span>
                    </div>`;
                })
                .join('');

            milestonesContainer.innerHTML = `
                <div class="mt-3 mb-3 border-t border-gray-200 pt-3">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">📊 Meilensteine:</h4>
                    ${milestonesHtml}
                </div>`;
            milestonesContainer.classList.remove('hidden');
        }
    } else {
        modalExercisePoints.textContent = `+${points} P.`;
        if (milestonesContainer) {
            milestonesContainer.innerHTML = '';
            milestonesContainer.classList.add('hidden');
        }
    }

    // Set data for both buttons
    modalDeleteExerciseButton.dataset.id = id;
    modalDeleteExerciseButton.dataset.imageUrl = imageUrl;
    modalEditExerciseButton.dataset.id = id;
    modalEditExerciseButton.dataset.title = title;
    modalEditExerciseButton.dataset.descriptionContent = descriptionContent;
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openEditExerciseModal(dataset) {
    const { id, title, descriptionContent, points, tags } = dataset;

    // Populate form fields
    document.getElementById('edit-exercise-id').value = id;
    document.getElementById('edit-exercise-title').value = title;
    document.getElementById('edit-exercise-points').value = points;
    const tagsArray = JSON.parse(tags || '[]');
    document.getElementById('edit-exercise-tags').value = tagsArray.join(', ');

    // Load description content into editor
    let descriptionData;
    try {
        descriptionData = JSON.parse(descriptionContent);
    } catch (e) {
        // Fallback for old format
        descriptionData = { type: 'text', text: descriptionContent || '' };
    }
    editDescriptionEditor.setContent(descriptionData);

    // Show the edit modal and hide the view modal
    exerciseModal.classList.add('hidden');
    editExerciseModal.classList.remove('hidden');
}

async function handleUpdateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('edit-exercise-feedback');
    const exerciseId = document.getElementById('edit-exercise-id').value;

    const descriptionContent = editDescriptionEditor.getContent();

    const updatedData = {
        title: document.getElementById('edit-exercise-title').value,
        descriptionContent: JSON.stringify(descriptionContent),
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
    const descriptionContent = descriptionEditor.getContent();
    const points = parseInt(document.getElementById('exercise-points').value);
    const file = document.getElementById('exercise-image').files[0];
    const tagsInput = document.getElementById('exercise-tags').value;
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);

    // Get milestone data
    const tieredPoints = isExerciseTieredPointsEnabled();
    const milestones = tieredPoints ? getExerciseMilestones() : [];

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

        const exerciseData = {
            title,
            descriptionContent: JSON.stringify(descriptionContent),
            points,
            imageUrl,
            createdAt: serverTimestamp(),
            tags
        };

        // Add milestone data if tiered points are enabled
        if (tieredPoints) {
            exerciseData.tieredPoints = true;
            exerciseData.milestones = milestones;
        }

        await addDoc(collection(db, "exercises"), exerciseData);

        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        createExerciseForm.reset();
        descriptionEditor.clear();

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