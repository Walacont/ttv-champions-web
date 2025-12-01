import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
// NEU: Zusätzliche Imports für die Emulatoren
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getAnalytics,
    logEvent,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js';
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    onSnapshot,
    query,
    deleteDoc,
    serverTimestamp,
    orderBy,
    updateDoc,
    where,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    getStorage,
    ref,
    deleteObject,
    uploadBytes,
    getDownloadURL,
    connectStorageEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';
import {
    getFunctions,
    connectFunctionsEmulator,
    httpsCallable,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';
import { generateInvitationCode, getExpirationDate } from './invitation-code-utils.js';
import { setupDescriptionEditor, renderTableForDisplay } from './tableEditor.js';
import {
    initializeExerciseMilestones,
    getExerciseMilestones,
    isExerciseTieredPointsEnabled,
    initializeExercisePartnerSystem,
    getExercisePartnerSettings,
} from './milestone-management.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);
// NEU: Functions-Dienst initialisieren
const functions = getFunctions(app);

// NEU: Der Emulator-Block
// Dieser Code verbindet sich nur dann mit den Emulatoren,
// wenn die Seite lokal (z.B. über Live Server) ausgeführt wird.
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Admin.js: Verbinde mit lokalen Firebase Emulatoren...');

    // Auth Emulator
    connectAuthEmulator(auth, 'http://localhost:9099');

    // Firestore Emulator
    connectFirestoreEmulator(db, 'localhost', 8080);

    // Functions Emulator
    connectFunctionsEmulator(functions, 'localhost', 5001);

    // Storage Emulator
    connectStorageEmulator(storage, 'localhost', 9199);
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
let competitionChartInstance = null;

// Competition statistics state
let competitionMatchData = [];
let competitionPeriod = 'month';
let competitionTypeFilter = 'all';
let descriptionEditor = null;
let editDescriptionEditor = null;

function showAuthError(message) {
    pageLoader.style.display = 'none';
    mainContent.style.display = 'none';
    authErrorMessage.textContent = message;
    authErrorContainer.style.display = 'flex';
    console.error('Auth-Fehler auf Admin-Seite:', message);
}

onAuthStateChanged(auth, async user => {
    if (user) {
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                if (userData.role === 'admin') {
                    initializeAdminPage(userData, user);
                } else {
                    showAuthError(`Ihre Rolle ('${userData.role}') hat keine Admin-Berechtigung.`);
                }
            } else {
                showAuthError('Ihr Benutzerprofil wurde nicht in der Datenbank gefunden.');
            }
        } catch (error) {
            showAuthError(`Datenbankfehler: ${error.message}`);
        }
    } else {
        // User logged out - use replace() to prevent back-button access
        window.location.replace('/index.html');
    }
});

function initializeAdminPage(userData, user) {
    try {
        welcomeMessage.textContent = `Willkommen, ${userData.firstName || user.email}!`;

        // Track page view in Google Analytics
        logEvent(analytics, 'page_view', {
            page_title: 'Admin Dashboard',
            page_location: window.location.href,
            page_path: '/admin',
            user_role: 'admin',
        });
        console.log('[Analytics] Admin page view tracked');

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // Clear SPA cache to prevent back-button access to authenticated pages
                if (window.spaEnhancer) {
                    window.spaEnhancer.clearCache();
                }
                // Use replace() instead of href to clear history and prevent back navigation
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
        errorLogoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                if (window.spaEnhancer) {
                    window.spaEnhancer.clearCache();
                }
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
        inviteCoachForm.addEventListener('submit', handleInviteCoach);
        copyLinkButton.addEventListener('click', copyInviteLink);
        createExerciseForm.addEventListener('submit', handleCreateExercise);

        // Initialize description editors
        descriptionEditor = setupDescriptionEditor({
            textAreaId: 'exercise-description',
            toggleContainerId: 'description-toggle-container',
            tableEditorContainerId: 'description-table-editor',
        });

        editDescriptionEditor = setupDescriptionEditor({
            textAreaId: 'edit-exercise-description',
            toggleContainerId: 'edit-description-toggle-container',
            tableEditorContainerId: 'edit-description-table-editor',
        });

        // Initialize milestone management
        initializeExerciseMilestones();

        // Initialize partner system
        initializeExercisePartnerSystem();

        // Modal Listeners
        closePlayerModalButton.addEventListener('click', () => playerModal.classList.add('hidden'));
        closeExerciseModalButton.addEventListener('click', () =>
            exerciseModal.classList.add('hidden')
        );
        closeEditExerciseModalButton.addEventListener('click', () =>
            editExerciseModal.classList.add('hidden')
        );

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
                    toggleAbbreviationsAdmin.innerHTML =
                        '<svg id="abbreviations-icon-admin" class="w-4 h-4 transform transition-transform" style="transform: rotate(180deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen ausblenden';
                } else {
                    abbreviationsContentAdmin.classList.add('hidden');
                    abbreviationsIconAdmin.style.transform = 'rotate(0deg)';
                    toggleAbbreviationsAdmin.innerHTML =
                        '<svg id="abbreviations-icon-admin" class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen anzeigen';
                }
            });
        }

        modalPlayerListEl.addEventListener('click', e => {
            if (e.target.classList.contains('delete-player-btn')) {
                handleDeletePlayer(e.target.dataset.id);
            }
        });

        exercisesListAdminEl.addEventListener('click', e => {
            const card = e.target.closest('[data-id]');
            if (card) {
                openExerciseModal(card.dataset);
            }
        });

        // *** HIER WURDE DER FEHLENDE LISTENER HINZUGEFÜGT ***
        modalEditExerciseButton.addEventListener('click', e => {
            openEditExerciseModal(e.target.dataset);
        });

        modalDeleteExerciseButton.addEventListener('click', e => {
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
    if (!clubId) return alert('Bitte eine Vereins-ID angeben.');

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
        await addDoc(collection(db, 'invitationCodes'), {
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
            role: 'coach',
        });

        // Display code
        inviteLinkInput.value = code;
        inviteLinkContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Fehler beim Erstellen des Codes:', error);
        alert('Fehler: Der Einladungscode konnte nicht erstellt werden.');
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
        modalExerciseDescription.innerHTML =
            tableHtml +
            (additionalText
                ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>`
                : '');
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
                    const displayPoints = isFirst
                        ? milestone.points
                        : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;
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
        tagsContainer.innerHTML = tagsArray
            .map(
                tag =>
                    `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${tag}</span>`
            )
            .join('');
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
        tags: document
            .getElementById('edit-exercise-tags')
            .value.split(',')
            .map(tag => tag.trim())
            .filter(tag => tag),
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
        // Load clubs to identify test clubs
        const clubsSnapshot = await getDocs(collection(db, 'clubs'));
        const testClubIds = new Set();
        clubsSnapshot.forEach(doc => {
            const club = doc.data();
            if (club.isTestClub === true) {
                testClubIds.add(doc.id);
            }
        });

        const usersSnapshot = await getDocs(collection(db, 'users'));
        // Filter out users from test clubs
        const users = usersSnapshot.docs
            .map(doc => doc.data())
            .filter(u => !u.clubId || !testClubIds.has(u.clubId));

        const attendanceSnapshot = await getDocs(collection(db, 'attendance'));
        // Filter out attendance from test clubs
        const attendances = attendanceSnapshot.docs
            .map(doc => doc.data())
            .filter(a => !a.clubId || !testClubIds.has(a.clubId));

        // Count non-test clubs
        const realClubIds = new Set(
            users.map(u => u.clubId).filter(id => id && !testClubIds.has(id))
        );

        document.getElementById('stats-total-users').textContent = users.length;
        document.getElementById('stats-total-clubs').textContent = realClubIds.size;
        document.getElementById('stats-total-points').textContent = users.reduce(
            (sum, u) => sum + (u.points || 0),
            0
        );
        document.getElementById('stats-total-attendance').textContent = attendances.reduce(
            (sum, a) => sum + (a.presentPlayerIds?.length || 0),
            0
        );

        const genderCounts = users.reduce((acc, user) => {
            const gender = user.gender || 'unknown';
            acc[gender] = (acc[gender] || 0) + 1;
            return acc;
        }, {});

        const attendanceByMonth = attendances.reduce((acc, record) => {
            if (record.date) {
                const month = new Date(record.date).toLocaleString('de-DE', {
                    month: 'short',
                    year: '2-digit',
                });
                acc[month] = (acc[month] || 0) + (record.presentPlayerIds?.length || 0);
            }
            return acc;
        }, {});
        const sortedMonths = Object.keys(attendanceByMonth).sort((a, b) => {
            const [m1, y1] = a.split(' ');
            const [m2, y2] = b.split(' ');
            return new Date(`01 ${m1} 20${y1}`) - new Date(`01 ${m2} 20${y2}`);
        });

        renderGenderChart(genderCounts);
        renderAttendanceChart(sortedMonths, attendanceByMonth);

        // Load global competition statistics (pass test club IDs to exclude)
        await loadGlobalCompetitionStatistics(testClubIds);
    } catch (error) {
        console.error('Fehler beim Laden der Statistiken:', error);
        document.getElementById('statistics-section').innerHTML =
            '<p class="text-red-500">Statistiken konnten nicht geladen werden.</p>';
    }
}

function renderGenderChart(data) {
    const ctx = document.getElementById('gender-chart').getContext('2d');
    if (genderChartInstance) genderChartInstance.destroy();
    genderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Männlich', 'Weiblich', 'Divers', 'Unbekannt'],
            datasets: [
                {
                    data: [data.male || 0, data.female || 0, data.diverse || 0, data.unknown || 0],
                    backgroundColor: ['#3b82f6', '#ec4899', '#8b5cf6', '#a1a1aa'],
                },
            ],
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });
}

function renderAttendanceChart(labels, data) {
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    const chartData = labels.map(label => data[label]);
    if (attendanceChartInstance) attendanceChartInstance.destroy();
    attendanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Anwesenheiten',
                    data: chartData,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            plugins: { legend: { display: false } },
        },
    });
}

/**
 * Load global competition statistics (all matches from all clubs, excluding test clubs)
 * @param {Set} testClubIds - Set of test club IDs to exclude
 */
async function loadGlobalCompetitionStatistics(testClubIds = new Set()) {
    try {
        // Fetch all singles matches
        const matchesRef = collection(db, 'matches');
        const singlesSnapshot = await getDocs(matchesRef);

        // Fetch all doubles matches
        const doublesMatchesRef = collection(db, 'doublesMatches');
        const doublesSnapshot = await getDocs(doublesMatchesRef);

        // Process all matches (exclude test clubs)
        competitionMatchData = [];

        singlesSnapshot.forEach(doc => {
            const data = doc.data();
            // Skip matches from test clubs
            if (data.clubId && testClubIds.has(data.clubId)) return;
            competitionMatchData.push({
                date: data.createdAt?.toDate() || new Date(data.createdAt),
                type: 'singles',
            });
        });

        doublesSnapshot.forEach(doc => {
            const data = doc.data();
            // Skip matches from test clubs
            if (data.clubId && testClubIds.has(data.clubId)) return;
            competitionMatchData.push({
                date: data.createdAt?.toDate() || new Date(data.createdAt),
                type: 'doubles',
            });
        });

        // Initial render with current filters
        renderCompetitionStatistics();

        // Setup filter button event listeners
        setupCompetitionFilterListeners();
    } catch (error) {
        console.error('Error loading global competition statistics:', error);
    }
}

/**
 * Setup event listeners for competition filter buttons
 */
function setupCompetitionFilterListeners() {
    // Period filters
    const periodWeek = document.getElementById('admin-competition-period-week');
    const periodMonth = document.getElementById('admin-competition-period-month');
    const periodYear = document.getElementById('admin-competition-period-year');

    if (periodWeek) {
        periodWeek.addEventListener('click', () => {
            competitionPeriod = 'week';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (periodMonth) {
        periodMonth.addEventListener('click', () => {
            competitionPeriod = 'month';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (periodYear) {
        periodYear.addEventListener('click', () => {
            competitionPeriod = 'year';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }

    // Type filters
    const filterAll = document.getElementById('admin-competition-filter-all');
    const filterSingles = document.getElementById('admin-competition-filter-singles');
    const filterDoubles = document.getElementById('admin-competition-filter-doubles');

    if (filterAll) {
        filterAll.addEventListener('click', () => {
            competitionTypeFilter = 'all';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (filterSingles) {
        filterSingles.addEventListener('click', () => {
            competitionTypeFilter = 'singles';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (filterDoubles) {
        filterDoubles.addEventListener('click', () => {
            competitionTypeFilter = 'doubles';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
}

/**
 * Update period button styles based on current selection
 */
function updatePeriodButtonStyles() {
    const buttons = {
        week: document.getElementById('admin-competition-period-week'),
        month: document.getElementById('admin-competition-period-month'),
        year: document.getElementById('admin-competition-period-year'),
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) {
            if (key === competitionPeriod) {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white';
            } else {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700';
            }
        }
    });
}

/**
 * Update type button styles based on current selection
 */
function updateTypeButtonStyles() {
    const buttons = {
        all: document.getElementById('admin-competition-filter-all'),
        singles: document.getElementById('admin-competition-filter-singles'),
        doubles: document.getElementById('admin-competition-filter-doubles'),
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) {
            if (key === competitionTypeFilter) {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-indigo-600 text-white';
            } else {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700';
            }
        }
    });
}

/**
 * Render competition statistics based on current filters
 */
function renderCompetitionStatistics() {
    // Filter matches by type
    let filteredMatches = competitionMatchData;
    if (competitionTypeFilter === 'singles') {
        filteredMatches = competitionMatchData.filter(m => m.type === 'singles');
    } else if (competitionTypeFilter === 'doubles') {
        filteredMatches = competitionMatchData.filter(m => m.type === 'doubles');
    }

    // Group by period
    const now = new Date();
    const periodData = {};
    let periodFormat, periodCount, periodLabel;

    if (competitionPeriod === 'week') {
        periodCount = 12; // Last 12 weeks
        periodLabel = 'Wochen';
        for (let i = periodCount - 1; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(weekStart.getDate() - (i * 7));
            const weekKey = `KW ${getWeekNumber(weekStart)}`;
            periodData[weekKey] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const weeksSince = Math.floor((now - matchDate) / (7 * 24 * 60 * 60 * 1000));
                if (weeksSince >= 0 && weeksSince < periodCount) {
                    const weekKey = `KW ${getWeekNumber(matchDate)}`;
                    if (periodData[weekKey] !== undefined) {
                        periodData[weekKey]++;
                    }
                }
            }
        });
    } else if (competitionPeriod === 'month') {
        periodCount = 12; // Last 12 months
        periodLabel = 'Monate';
        for (let i = periodCount - 1; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = monthDate.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
            periodData[monthKey] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const monthKey = matchDate.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
                if (periodData[monthKey] !== undefined) {
                    periodData[monthKey]++;
                }
            }
        });
    } else {
        periodCount = 3; // Last 3 years
        periodLabel = 'Jahre';
        for (let i = periodCount - 1; i >= 0; i--) {
            const year = now.getFullYear() - i;
            periodData[year.toString()] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const yearKey = matchDate.getFullYear().toString();
                if (periodData[yearKey] !== undefined) {
                    periodData[yearKey]++;
                }
            }
        });
    }

    // Calculate statistics
    const values = Object.values(periodData);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? (total / values.length).toFixed(1) : 0;

    // Find most active period
    let maxPeriod = '-';
    let maxCount = 0;
    Object.entries(periodData).forEach(([period, count]) => {
        if (count > maxCount) {
            maxCount = count;
            maxPeriod = period;
        }
    });

    // Calculate trend (compare last period to previous)
    const periodsArray = Object.values(periodData);
    let trend = '-';
    if (periodsArray.length >= 2) {
        const current = periodsArray[periodsArray.length - 1];
        const previous = periodsArray[periodsArray.length - 2];
        if (previous > 0) {
            const change = ((current - previous) / previous * 100).toFixed(0);
            trend = change >= 0 ? `+${change}%` : `${change}%`;
        } else if (current > 0) {
            trend = '+∞';
        }
    }

    // Update DOM
    const totalLabel = document.getElementById('admin-stats-competition-total-label');
    const totalEl = document.getElementById('admin-stats-competition-total');
    const avgLabel = document.getElementById('admin-stats-competition-avg-label');
    const avgEl = document.getElementById('admin-stats-competition-avg');
    const activePeriodLabel = document.getElementById('admin-stats-competition-active-period-label');
    const activePeriodEl = document.getElementById('admin-stats-competition-active-period');
    const trendEl = document.getElementById('admin-stats-competition-trend');

    if (totalLabel) totalLabel.textContent = `Gesamt (${periodCount} ${periodLabel})`;
    if (totalEl) totalEl.textContent = total;
    if (avgLabel) avgLabel.textContent = `Ø pro ${competitionPeriod === 'week' ? 'Woche' : competitionPeriod === 'month' ? 'Monat' : 'Jahr'}`;
    if (avgEl) avgEl.textContent = avg;
    if (activePeriodLabel) activePeriodLabel.textContent = `Aktivster ${competitionPeriod === 'week' ? 'Woche' : competitionPeriod === 'month' ? 'Monat' : 'Jahr'}`;
    if (activePeriodEl) activePeriodEl.textContent = maxCount > 0 ? `${maxPeriod} (${maxCount})` : '-';
    if (trendEl) trendEl.textContent = trend;

    // Render chart
    renderCompetitionChart(Object.keys(periodData), Object.values(periodData));
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Calculate smart step size for Y-axis based on max value
 * @param {number} maxValue - Maximum value in the data
 * @returns {number} - Appropriate step size
 */
function calculateSmartStepSize(maxValue) {
    if (maxValue <= 10) return 1;
    if (maxValue <= 25) return 5;
    if (maxValue <= 50) return 10;
    if (maxValue <= 100) return 20;
    if (maxValue <= 250) return 50;
    if (maxValue <= 500) return 100;
    if (maxValue <= 1000) return 200;
    return Math.ceil(maxValue / 10 / 50) * 50; // Round to nearest 50
}

/**
 * Render competition activity chart
 */
function renderCompetitionChart(labels, data) {
    const canvas = document.getElementById('admin-competition-activity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (competitionChartInstance) competitionChartInstance.destroy();

    // Calculate smart step size based on max value
    const maxValue = Math.max(...data, 0);
    const stepSize = calculateSmartStepSize(maxValue);

    competitionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Wettkämpfe',
                data: data,
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: stepSize,
                        callback: function(value) {
                            // Only show whole numbers
                            if (Math.floor(value) === value) {
                                return value;
                            }
                        }
                    },
                },
            },
            plugins: {
                legend: { display: false },
            },
        },
    });
}

function loadClubsAndPlayers() {
    onSnapshot(
        query(collection(db, 'users')),
        snapshot => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const clubs = users.reduce((acc, user) => {
                if (user.clubId) {
                    if (!acc[user.clubId]) {
                        acc[user.clubId] = [];
                    }
                    acc[user.clubId].push(user);
                }
                return acc;
            }, {});

            clubsListEl.innerHTML =
                Object.keys(clubs).length === 0
                    ? '<p class="text-gray-500">Keine Vereine gefunden.</p>'
                    : '';
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
                    clubs[clubId]
                        .sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
                        .forEach(player => {
                            const playerEl = document.createElement('div');
                            const initials =
                                (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                            const avatarSrc =
                                player.photoURL ||
                                `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
                            playerEl.className = 'p-2 border-b flex justify-between items-center';
                            playerEl.innerHTML = `<div class="flex items-center"><img src="${avatarSrc}" alt="Avatar" class="h-10 w-10 rounded-full object-cover mr-4"><div><p class="font-medium">${player.firstName} ${player.lastName} (${player.role})</p><p class="text-sm text-gray-500">${player.email || 'Offline'}</p></div></div><button data-id="${player.id}" class="delete-player-btn text-red-500 hover:text-red-700 font-semibold text-sm">Löschen</button>`;
                            modalPlayerListEl.appendChild(playerEl);
                        });
                    playerModal.classList.remove('hidden');
                });
            });
        },
        error => {
            console.error('Fehler beim Laden der Vereinsübersicht:', error);
            clubsListEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Vereine.</p>';
        }
    );
}

async function handleDeletePlayer(playerId) {
    if (confirm('Sind Sie sicher, dass Sie diesen Benutzer endgültig löschen möchten?')) {
        try {
            await deleteDoc(doc(db, 'users', playerId));
            alert('Benutzer erfolgreich gelöscht.');
        } catch (error) {
            console.error('Fehler beim Löschen des Benutzers:', error);
            alert('Fehler: Der Benutzer konnte nicht gelöscht werden.');
        }
    }
}

async function handleCreateExercise(e) {
    e.preventDefault();
    const feedbackEl = document.getElementById('exercise-feedback');
    const submitBtn = document.getElementById('create-exercise-submit');
    const title = document.getElementById('exercise-title').value;
    const descriptionContent = descriptionEditor.getContent();
    const file = document.getElementById('exercise-image').files[0];
    const tagsInput = document.getElementById('exercise-tags').value;
    const tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

    // Get milestone data and calculate points
    const tieredPoints = isExerciseTieredPointsEnabled();
    const milestones = tieredPoints ? getExerciseMilestones() : [];

    let points = 0;
    if (tieredPoints) {
        if (milestones.length === 0) {
            feedbackEl.textContent = 'Bitte mindestens einen Meilenstein hinzufügen.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Übung speichern';
            return;
        }
        // Total points is sum of all milestones
        points = milestones.reduce((sum, m) => sum + m.points, 0);
    } else {
        points = parseInt(document.getElementById('exercise-points').value);
        if (isNaN(points) || points <= 0) {
            feedbackEl.textContent = 'Bitte gültige Punkte angeben.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Übung speichern';
            return;
        }
    }

    feedbackEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichere...';

    if (!title) {
        feedbackEl.textContent = 'Bitte alle Felder korrekt ausfüllen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Übung speichern';
        return;
    }

    try {
        let imageUrl = null;

        // Upload image only if provided
        if (file) {
            const storageRef = ref(storage, `exercises/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snapshot.ref);
        }

        const exerciseData = {
            title,
            descriptionContent: JSON.stringify(descriptionContent),
            points,
            createdAt: serverTimestamp(),
            tags,
        };

        // Add imageUrl only if provided
        if (imageUrl) {
            exerciseData.imageUrl = imageUrl;
        }

        // Add tieredPoints if enabled
        if (tieredPoints && milestones) {
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

        // Add partner system settings if enabled
        const partnerSettings = getExercisePartnerSettings();
        if (partnerSettings) {
            exerciseData.partnerSystem = {
                enabled: true,
                partnerPercentage: partnerSettings.partnerPercentage,
            };
        } else {
            exerciseData.partnerSystem = {
                enabled: false,
                partnerPercentage: 50,
            };
        }

        await addDoc(collection(db, 'exercises'), exerciseData);

        feedbackEl.textContent = 'Übung erfolgreich erstellt!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        createExerciseForm.reset();

        // Reset points field
        document.getElementById('exercise-points').value = '';

        // Reset milestones
        document.getElementById('exercise-milestones-list').innerHTML = '';
        document.getElementById('exercise-tiered-points-toggle').checked = false;
        document.getElementById('exercise-points-container-admin').classList.remove('hidden');
        document.getElementById('exercise-milestones-container').classList.add('hidden');

        // Reset partner system
        const partnerToggle = document.getElementById('exercise-partner-system-toggle');
        const partnerContainer = document.getElementById('exercise-partner-container');
        const partnerPercentageInput = document.getElementById('exercise-partner-percentage');
        if (partnerToggle) partnerToggle.checked = false;
        if (partnerContainer) partnerContainer.classList.add('hidden');
        if (partnerPercentageInput) partnerPercentageInput.value = 50;

        // Clear description editor
        descriptionEditor.clear();
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

function loadAllExercises() {
    const q = query(collection(db, 'exercises'), orderBy('createdAt', 'desc'));
    onSnapshot(
        q,
        snapshot => {
            exercisesListAdminEl.innerHTML = snapshot.empty
                ? '<p class="text-gray-500 col-span-full">Keine Übungen gefunden.</p>'
                : '';

            const exercises = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            exercises.forEach(exercise => {
                const card = document.createElement('div');
                card.className =
                    'bg-white rounded-lg shadow-md overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow';
                card.dataset.id = exercise.id;
                card.dataset.title = exercise.title;
                // Support both old and new format
                if (exercise.descriptionContent) {
                    card.dataset.descriptionContent = exercise.descriptionContent;
                } else {
                    // Backwards compatibility: convert old description to new format
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

                // Add tieredPoints data
                if (exercise.tieredPoints) {
                    card.dataset.tieredPoints = JSON.stringify(exercise.tieredPoints);
                }

                const tagsHtml = (exercise.tags || [])
                    .map(
                        tag =>
                            `<span class="inline-block bg-gray-200 rounded-full px-2 py-1 text-xs font-semibold text-gray-700 mr-2 mb-2">${tag}</span>`
                    )
                    .join('');

                // Image or subtle placeholder
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

                card.innerHTML = `${imageHtml}
                              <div class="p-4 flex flex-col flex-grow pointer-events-none">
                                  <h3 class="font-bold text-md mb-2 flex-grow">${exercise.title}</h3>
                                  <div class="pt-2">${tagsHtml}</div>
                              </div>`;
                exercisesListAdminEl.appendChild(card);
            });
        },
        error => {
            console.error('Fehler beim Laden des Übungskatalogs:', error);
            exercisesListAdminEl.innerHTML =
                '<p class="text-red-500 col-span-full">Fehler beim Laden der Übungen.</p>';
        }
    );
}

async function handleDeleteExercise(exerciseId, imageUrl) {
    if (confirm('Sind Sie sicher, dass Sie diese Übung endgültig löschen möchten?')) {
        try {
            await deleteDoc(doc(db, 'exercises', exerciseId));

            // Only delete image if it exists and is a valid URL
            if (imageUrl && imageUrl !== 'undefined' && imageUrl.trim() !== '') {
                try {
                    const imageRef = ref(storage, imageUrl);
                    await deleteObject(imageRef);
                } catch (storageError) {
                    console.warn(
                        'Image could not be deleted, but exercise was removed:',
                        storageError
                    );
                }
            }

            alert('Übung erfolgreich gelöscht.');
            exerciseModal.classList.add('hidden');
        } catch (error) {
            console.error('Fehler beim Löschen der Übung:', error);
            alert('Fehler: Die Übung konnte nicht vollständig gelöscht werden.');
        }
    }
}

// ========================================================================
// ===== MIGRATIONS =====
// ========================================================================

const migrateDoublesNamesBtn = document.getElementById('migrate-doubles-names-btn');
const migrationStatus = document.getElementById('migration-status');

if (migrateDoublesNamesBtn) {
    migrateDoublesNamesBtn.addEventListener('click', async () => {
        if (
            !confirm(
                'Möchtest du die Migration starten? Dies aktualisiert alle doublesPairings-Dokumente mit Spielernamen.'
            )
        ) {
            return;
        }

        migrateDoublesNamesBtn.disabled = true;
        migrateDoublesNamesBtn.innerHTML =
            '<i class="fas fa-spinner fa-spin mr-2"></i>Migration läuft...';
        migrationStatus.textContent = 'Migration wird ausgeführt...';
        migrationStatus.className = 'text-sm font-medium text-blue-600';

        try {
            const migrateFunction = httpsCallable(functions, 'migrateDoublesPairingsNames');
            const result = await migrateFunction();

            console.log('Migration result:', result);

            if (result.data.success) {
                migrationStatus.textContent = `✅ Erfolgreich! ${result.data.migrated} Paarungen aktualisiert, ${result.data.skipped} übersprungen.`;
                migrationStatus.className = 'text-sm font-medium text-green-600';
                alert(
                    `Migration erfolgreich!\n\n${result.data.migrated} Paarungen wurden aktualisiert.\n${result.data.skipped} wurden übersprungen (hatten bereits Namen).`
                );
            } else {
                throw new Error('Migration fehlgeschlagen');
            }
        } catch (error) {
            console.error('Migration error:', error);
            migrationStatus.textContent = '❌ Fehler: ' + error.message;
            migrationStatus.className = 'text-sm font-medium text-red-600';
            alert('Fehler bei der Migration: ' + error.message);
        } finally {
            migrateDoublesNamesBtn.disabled = false;
            migrateDoublesNamesBtn.innerHTML = '<i class="fas fa-play mr-2"></i>Migration starten';
        }
    });
}
