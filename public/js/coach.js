// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, sendPasswordResetEmail, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, onSnapshot, query, where, writeBatch, serverTimestamp, increment, deleteDoc, updateDoc, runTransaction, orderBy, limit, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from './firebase-config.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT, setupLeaderboardTabs, setupLeaderboardToggle, loadLeaderboard, loadGlobalLeaderboard, renderLeaderboardHTML, setLeaderboardSubgroupFilter } from './leaderboard.js';
import { renderCalendar, fetchMonthlyAttendance, handleCalendarDayClick, handleAttendanceSave, loadPlayersForAttendance, updateAttendanceCount, setAttendanceSubgroupFilter, openAttendanceModalForSession, getCurrentSessionId } from './attendance.js';
import { handleCreateChallenge, loadActiveChallenges, loadExpiredChallenges, loadChallengesForDropdown, calculateExpiry, updateAllCountdowns, reactivateChallenge, endChallenge, deleteChallenge, populateSubgroupDropdown, setupChallengePointRecommendations } from './challenges.js';
import { loadAllExercises, loadExercisesForDropdown, openExerciseModalFromDataset, handleCreateExercise, closeExerciseModal, setupExercisePointsCalculation } from './exercises.js';
import { calculateHandicap, handleGeneratePairings, renderPairingsInModal, updatePairingsButtonState, handleMatchSave, updateMatchUI, populateMatchDropdowns, loadCoachMatchRequests, loadCoachProcessedRequests, initializeCoachSetScoreInput, loadSavedPairings, initializeHandicapToggle } from './matches.js';
import { setupTabs, updateSeasonCountdown } from './ui-utils.js';
import { handleAddOfflinePlayer, handlePlayerListActions, loadPlayerList, loadPlayersForDropdown, updateCoachGrundlagenDisplay, loadSubgroupsForPlayerForm, openEditPlayerModal, handleSavePlayerSubgroups, updatePointsPlayerDropdown } from './player-management.js';
import { loadPointsHistoryForCoach, populateHistoryFilterDropdown, handlePointsFormSubmit, handleReasonChange } from './points-management.js';
import { loadLeaguesForSelector } from './season.js';
import { loadStatistics, cleanupStatistics } from './coach-statistics.js';
import { checkAndMigrate } from './migration.js';
import { loadSubgroupsList, handleCreateSubgroup, handleSubgroupActions, handleEditSubgroupSubmit, closeEditSubgroupModal } from './subgroups-management.js';
import { initInvitationCodeManagement } from './invitation-code-management.js';
import { initPlayerInvitationManagement, loadSubgroupsForOfflinePlayerForm, handlePostPlayerCreationInvitation, openSendInvitationModal } from './player-invitation-management.js';
import { initializeSpontaneousSessions, loadRecurringTemplates, openSessionSelectionModal } from './training-schedule-ui.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west3');

// NEU: Der Emulator-Block
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Coach.js: Verbinde mit lokalen Firebase Emulatoren...");
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, "localhost", 8080);
    connectFunctionsEmulator(functions, "localhost", 5001);
    connectStorageEmulator(storage, "localhost", 9199);
}


// --- State ---
let currentUserData = null;
let unsubscribePlayerList = null;
let unsubscribeLeaderboard = null;
let unsubscribePointsHistory = null;
let unsubscribeSubgroups = null;
let currentCalendarDate = new Date();
let clubPlayers = [];
let currentSubgroupFilter = 'all';
let calendarUnsubscribe = null; 

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        const pageLoader = document.getElementById('page-loader');
        const mainContent = document.getElementById('main-content');
        const authErrorContainer = document.getElementById('auth-error-container');
        const authErrorMessage = document.getElementById('auth-error-message');

        if (user) {
            try {
                await user.getIdToken(true);
                const userDocRef = doc(db, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    if (userData.role === 'coach' || userData.role === 'admin') {
                        currentUserData = {id: user.uid, ...userData};
                        initializeCoachPage(currentUserData);
                    } else {
                        showAuthError(`Ihre Rolle ('${userData.role}') ist nicht berechtigt.`);
                    }
                } else {
                    showAuthError("Ihr Benutzerprofil wurde nicht gefunden.");
                }
            } catch (error) {
                showAuthError(`DB-Fehler: ${error.message}`);
            }
        } else {
            window.location.href = '/index.html';
        }

        function showAuthError(message) {
            if (pageLoader) pageLoader.style.display = 'none';
            if (mainContent) mainContent.style.display = 'none';
            if (authErrorMessage) authErrorMessage.textContent = message;
            if (authErrorContainer) authErrorContainer.style.display = 'flex';
            console.error("Auth-Fehler:", message);
        }
    });
});

async function initializeCoachPage(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const loaderText = document.getElementById('loader-text');

    // Run migration if needed
    if (loaderText) loaderText.textContent = 'Prüfe Datenbank-Migration...';
    try {
        const migrationResult = await checkAndMigrate(userData.clubId, db);
        if (migrationResult.success && !migrationResult.skipped) {
            console.log('[Coach] Migration completed successfully:', migrationResult.stats);
            if (loaderText) loaderText.textContent = 'Migration abgeschlossen! Lade Dashboard...';
        } else if (migrationResult.success && migrationResult.skipped) {
            console.log('[Coach] Migration not needed');
        } else {
            console.error('[Coach] Migration failed:', migrationResult.error);
            alert(`Warnung: Datenbank-Migration fehlgeschlagen. Bitte kontaktiere den Support.\nFehler: ${migrationResult.error}`);
        }
    } catch (error) {
        console.error('[Coach] Error during migration check:', error);
        alert(`Warnung: Fehler beim Prüfen der Datenbank-Migration.\nFehler: ${error.message}`);
    }

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';

    document.getElementById('welcome-message').textContent = `Willkommen, ${userData.firstName || userData.email}! (Verein: ${userData.clubId})`;

    // Render leaderboard HTML
    renderLeaderboardHTML('tab-content-dashboard', {
        showToggle: true 
    });

    setupTabs('statistics');
    setupLeaderboardTabs();
    setupLeaderboardToggle();

    // Add event listener for tab changes to load saved pairings when Wettkampf tab is opened
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (tabName === 'matches') {
                // Load saved pairings when Wettkampf tab is opened
                loadSavedPairings(db, userData.clubId);
            }
        });
    });

    // Initialize Invitation Code Management
    initInvitationCodeManagement(db, userData.clubId, userData.id);

    // Initialize Player Invitation Management
    initPlayerInvitationManagement(db, auth, functions, userData.clubId, userData.id);

    // Initialize Spontaneous Sessions (for creating trainings from calendar)
    initializeSpontaneousSessions(userData, db);

    // Bridge function: Connect training-schedule-ui to attendance module
    window.openAttendanceForSessionFromSchedule = async function(sessionId, dateStr) {
        await openAttendanceModalForSession(
            sessionId,
            dateStr,
            clubPlayers,
            updateAttendanceCount,
            updatePairingsButtonState,
            db,
            userData.clubId
        );
    };

    // Load statistics initially (since it's the default tab)
    loadStatistics(userData, db, currentSubgroupFilter);

    // Setup Statistics Tab
    const statisticsTabButton = document.querySelector('.tab-button[data-tab="statistics"]');
    if (statisticsTabButton) {
        statisticsTabButton.addEventListener('click', () => {
            loadStatistics(userData, db, currentSubgroupFilter);
        });
    }

    // Setup Dashboard/Rangliste Tab
    const dashboardTabButton = document.querySelector('.tab-button[data-tab="dashboard"]');
    if (dashboardTabButton) {
        dashboardTabButton.addEventListener('click', () => {
            // Load leaderboards when dashboard tab is opened
            loadLeaderboard(userData, db, []);
            loadGlobalLeaderboard(userData, db, []);
        });
    }

    // Setup Subgroups Tab
    const subgroupsTabButton = document.querySelector('.tab-button[data-tab="subgroups"]');
    if (subgroupsTabButton) {
        subgroupsTabButton.addEventListener('click', () => {
            loadSubgroupsList(userData.clubId, db, (unsub) => {
                if (unsubscribeSubgroups) unsubscribeSubgroups();
                unsubscribeSubgroups = unsub;
            });
        });
    }

    // Load initial data
    loadPlayersForDropdown(userData.clubId, db);
    loadChallengesForDropdown(userData.clubId, db, currentSubgroupFilter);
    loadExercisesForDropdown(db);
    loadActiveChallenges(userData.clubId, db, currentSubgroupFilter);
    loadExpiredChallenges(userData.clubId, db);
    loadAllExercises(db);

    // Populate subgroup dropdowns for challenge forms
    populateSubgroupDropdown(userData.clubId, 'challenge-subgroup', db);
    populateSubgroupDropdown(userData.clubId, 'reactivate-challenge-subgroup', db);
    loadPlayersForAttendance(userData.clubId, db, (players) => {
        clubPlayers = players; // WICHTIG: clubPlayers wird hier global befüllt
        populateMatchDropdowns(clubPlayers, currentSubgroupFilter);
        populateHistoryFilterDropdown(clubPlayers);
        updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter);
    });

    // Initialize set score input for coach match form
    initializeCoachSetScoreInput();

    loadLeaderboard(userData, db, []);
    loadGlobalLeaderboard(userData, db, []);

    // Load coach match requests
    loadCoachMatchRequests(userData, db);
    loadCoachProcessedRequests(userData, db);

    calendarUnsubscribe = renderCalendar(currentCalendarDate, db, userData);

    // Listen for training cancellation events to reload calendar
    window.addEventListener('trainingCancelled', () => {
        console.log('[Coach] Training cancelled, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, db, userData);
    });

    // --- Event Listeners ---
    document.getElementById('logout-button').addEventListener('click', () => signOut(auth));
    document.getElementById('error-logout-button').addEventListener('click', () => signOut(auth));
    
    // Player Modal Listeners
    document.getElementById('open-player-modal-button').addEventListener('click', () => {
        document.getElementById('player-list-modal').classList.remove('hidden');
        loadPlayerList(userData.clubId, db, (unsub) => {
            if (unsubscribePlayerList) unsubscribePlayerList();
            unsubscribePlayerList = unsub;
        });
    });
    document.getElementById('close-player-modal-button').addEventListener('click', () => { document.getElementById('player-list-modal').classList.add('hidden'); if (unsubscribePlayerList) unsubscribePlayerList(); });
    
    // Add Player/Code Modal Listeners
    document.getElementById('add-offline-player-button').addEventListener('click', async () => {
        document.getElementById('add-offline-player-modal').classList.remove('hidden');
        document.getElementById('add-offline-player-modal').classList.add('flex');

        // Lade Subgroups
        const subgroupsQuery = query(collection(db, 'subgroups'), where('clubId', '==', userData.clubId));
        const subgroupsSnap = await getDocs(subgroupsQuery);
        const subgroups = subgroupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        loadSubgroupsForOfflinePlayerForm(subgroups);
    });
    document.getElementById('close-add-player-modal-button').addEventListener('click', () => {
        document.getElementById('add-offline-player-modal').classList.add('hidden');
        document.getElementById('add-offline-player-modal').classList.remove('flex');
        // Reset form to clear all inputs including checkboxes
        document.getElementById('add-offline-player-form').reset();
        // Hide QTTR input when modal closes
        document.getElementById('qttr-input-container').classList.add('hidden');
    });

    // Toggle QTTR input based on match-ready checkbox
    document.getElementById('is-match-ready-checkbox').addEventListener('change', (e) => {
        const qttrContainer = document.getElementById('qttr-input-container');
        if (e.target.checked) {
            qttrContainer.classList.remove('hidden');
        } else {
            qttrContainer.classList.add('hidden');
            // Clear QTTR input when unchecked
            document.getElementById('qttr-points').value = '';
        }
    });
    
    // Edit Player Modal Listeners
    document.getElementById('close-edit-player-modal-button').addEventListener('click', () => document.getElementById('edit-player-modal').classList.add('hidden'));
    document.getElementById('save-player-subgroups-button').addEventListener('click', () => handleSavePlayerSubgroups(db));
    
    // Attendance Modal Listeners
    document.getElementById('close-attendance-modal-button').addEventListener('click', () => document.getElementById('attendance-modal').classList.add('hidden'));

    // Form Submissions
    document.getElementById('add-offline-player-form').addEventListener('submit', (e) => handleAddOfflinePlayer(e, db, userData));
    document.getElementById('points-form').addEventListener('submit', (e) => handlePointsFormSubmit(e, db, userData, handleReasonChange));
    document.getElementById('create-challenge-form').addEventListener('submit', (e) => handleCreateChallenge(e, db, userData));
    document.getElementById('attendance-form').addEventListener('submit', (e) => handleAttendanceSave(e, db, userData, clubPlayers, currentCalendarDate, (date) => renderCalendar(date, db, userData)));
    document.getElementById('create-exercise-form').addEventListener('submit', (e) => handleCreateExercise(e, db, storage));
    document.getElementById('match-form').addEventListener('submit', (e) => handleMatchSave(e, db, userData, clubPlayers));

    // Setup exercise points auto-calculation (based on level + difficulty)
    setupExercisePointsCalculation();

    // Setup challenge point recommendations (based on duration)
    setupChallengePointRecommendations();

    document.getElementById('create-subgroup-form').addEventListener('submit', (e) => handleCreateSubgroup(e, db, userData.clubId));
    document.getElementById('edit-subgroup-form').addEventListener('submit', (e) => handleEditSubgroupSubmit(e, db));
    document.getElementById('close-edit-subgroup-modal-button').addEventListener('click', closeEditSubgroupModal);
    document.getElementById('cancel-edit-subgroup-button').addEventListener('click', closeEditSubgroupModal);

    // Other UI Listeners
    document.getElementById('reason-select').addEventListener('change', handleReasonChange);
    document.getElementById('generate-pairings-button').addEventListener('click', () => {
        const sessionId = getCurrentSessionId();
        handleGeneratePairings(clubPlayers, currentSubgroupFilter, sessionId);
    });
    document.getElementById('close-pairings-modal-button').addEventListener('click', () => { document.getElementById('pairings-modal').classList.add('hidden'); });
    document.getElementById('exercises-list-coach').addEventListener('click', (e) => { const card = e.target.closest('[data-id]'); if(card) { openExerciseModalFromDataset(card.dataset); } });
    document.getElementById('close-exercise-modal-button').addEventListener('click', closeExerciseModal);
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, db, userData);
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, db, userData);
    });
    document.getElementById('calendar-grid').addEventListener('click', (e) => handleCalendarDayClick(e, clubPlayers, updateAttendanceCount, () => updatePairingsButtonState(clubPlayers, currentSubgroupFilter), db, userData.clubId));

    // Event delegation for attendance checkboxes - listen on the container
    document.getElementById('attendance-player-list').addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            updateAttendanceCount();
            updatePairingsButtonState(clubPlayers, currentSubgroupFilter);
        }
    });

    document.getElementById('player-a-select').addEventListener('change', () => updateMatchUI(clubPlayers));
    document.getElementById('player-b-select').addEventListener('change', () => updateMatchUI(clubPlayers));
    initializeHandicapToggle(); // Initialize handicap toggle for automatic score setting
    document.getElementById('subgroups-list').addEventListener('click', (e) => handleSubgroupActions(e, db, userData.clubId));

    // === KORREKTUR 2: VERALTETEN LISTENER ERSETZEN ===
    // Diese Zeile hat auf Klicks in der *Liste* gelauscht, um Aktionen auszuführen.
    // document.getElementById('modal-player-list').addEventListener('click', (e) => handlePlayerListActions(e, db, auth, functions)); // <--- ALT & FALSCH
    
    // Event-Handler für Aktions-Buttons (Desktop)
    const handleActionClick = async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        // Führt bestehende Aktionen aus (Löschen, Einladen, Befördern)
        await handlePlayerListActions(e, db, auth, functions);

        // Logik für "Gruppen bearbeiten"-Button
        if (button.classList.contains('edit-subgroups-btn')) {
            const playerId = button.dataset.id;
            const player = clubPlayers.find(p => p.id === playerId);

            if (player) {
                openEditPlayerModal(player, db, userData.clubId);
            } else {
                console.error("Spieler nicht im lokalen Cache gefunden.");
                alert("Fehler: Spielerdaten konnten nicht geladen werden.");
            }
        }
    };

    // Listener für Desktop Aktions-Panel
    const actionsDesktop = document.getElementById('player-detail-actions-desktop');
    if (actionsDesktop) {
        actionsDesktop.addEventListener('click', handleActionClick);
    }

    // Listener für Mobile Aktions-Panel
    const actionsMobile = document.getElementById('player-detail-actions-mobile');
    if (actionsMobile) {
        actionsMobile.addEventListener('click', handleActionClick);
    }

    // Mobile Modal Close Button
    const closeMobileBtn = document.getElementById('close-player-detail-mobile');
    if (closeMobileBtn) {
        closeMobileBtn.addEventListener('click', () => {
            document.getElementById('player-detail-mobile-modal').classList.add('hidden');
        });
    }

    // NEU: Listener für die Suchleiste im Spieler-Modal
    document.getElementById('player-search-input').addEventListener('keyup', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const items = document.querySelectorAll('#modal-player-list .player-list-item');
        items.forEach(item => {
            const name = item.dataset.playerName; // Benutzt das data-Attribut
            if (name.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });
    // === KORREKTUR ENDE ===


    // Filter Listeners
    document.getElementById('history-player-filter').addEventListener('change', (e) => {
        loadPointsHistoryForCoach(e.target.value, db, (unsub) => {
            if (unsubscribePointsHistory) unsubscribePointsHistory();
            unsubscribePointsHistory = unsub;
        });
    });

    document.getElementById('player-select').addEventListener('change', (e) => {
        // === KORREKTUR 3: 'db' Instanz übergeben ===
        updateCoachGrundlagenDisplay(e.target.value, db);
    });

    // Subgroup Filter
    populateSubgroupFilter(userData.clubId, db);
    document.getElementById('subgroup-filter').addEventListener('change', (e) => {
        currentSubgroupFilter = e.target.value;
        handleSubgroupFilterChange(userData);
    });

    // Intervals
    updateSeasonCountdown('season-countdown-coach', false);
    setInterval(() => updateSeasonCountdown('season-countdown-coach', false), 1000);
    setInterval(updateAllCountdowns, 1000);

    // Setup Coach as Player UI
    setupCoachAsPlayerUI(userData, db);
}

/**
 * Checks if coach has player role
 * @param {Object} userData - User data
 * @returns {boolean} True if coach has player role
 */
function checkIfCoachHasPlayerRole(userData) {
    // Check if user has player role (either in roles array or old role field)
    const hasPlayerRole = (userData.roles && userData.roles.includes('player')) || userData.role === 'player';
    const hasPlayerFields = userData.eloRating !== undefined && userData.xp !== undefined;
    return hasPlayerRole && hasPlayerFields;
}

/**
 * Registers coach as player by adding player role and initializing player fields
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 */
async function registerCoachAsPlayer(userData, db) {
    const button = document.getElementById('register-as-player-button');
    const originalText = button.innerHTML;

    try {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Registriere...';

        const userRef = doc(db, 'users', userData.id);

        // Prepare update data
        const updateData = {
            roles: ['coach', 'player'], // Add both roles
            eloRating: 800,
            highestElo: 800,
            xp: 0,
            points: 0,
            grundlagenCompleted: 5, // Match-ready by default
            updatedAt: serverTimestamp()
        };

        await updateDoc(userRef, updateData);

        // Update local userData
        currentUserData = { ...userData, ...updateData };

        // Hide info box
        document.getElementById('coach-as-player-info').classList.add('hidden');

        // Show success message
        alert('✅ Erfolgreich! Du bist jetzt als Spieler registriert und erscheinst in den Ranglisten mit einem (Coach) Badge.');

        // Reload page to update UI
        window.location.reload();

    } catch (error) {
        console.error('Error registering coach as player:', error);
        alert(`❌ Fehler: ${error.message}\n\nBitte versuche es erneut oder kontaktiere den Support.`);
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

/**
 * Sets up UI for coach as player feature
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 */
function setupCoachAsPlayerUI(userData, db) {
    const infoBox = document.getElementById('coach-as-player-info');
    const registerButton = document.getElementById('register-as-player-button');
    const dismissButton = document.getElementById('dismiss-coach-player-info');

    if (!infoBox || !registerButton) {
        console.warn('Coach as player UI elements not found');
        return;
    }

    // Check if coach already has player role
    const hasPlayerRole = checkIfCoachHasPlayerRole(userData);

    if (!hasPlayerRole) {
        // Show info box if coach doesn't have player role
        infoBox.classList.remove('hidden');

        // Register button click
        registerButton.addEventListener('click', async () => {
            const confirmed = confirm(
                '🎯 Als Spieler registrieren?\n\n' +
                'Du wirst dann:\n' +
                '✅ In den Ranglisten angezeigt (mit Coach Badge)\n' +
                '✅ Matches spielen können\n' +
                '✅ Elo-Rating und XP sammeln\n\n' +
                'Startswerte:\n' +
                '• Elo: 800\n' +
                '• XP: 0\n' +
                '• Match-Ready: Ja\n\n' +
                'Fortfahren?'
            );

            if (confirmed) {
                await registerCoachAsPlayer(userData, db);
            }
        });

        // Dismiss button click
        dismissButton.addEventListener('click', () => {
            infoBox.classList.add('hidden');
            // Store dismissal in localStorage to not show again this session
            localStorage.setItem('coach-player-info-dismissed', 'true');
        });

        // Check if dismissed in this session
        if (localStorage.getItem('coach-player-info-dismissed') === 'true') {
            infoBox.classList.add('hidden');
        }
    } else {
        // Coach already has player role, hide info box
        infoBox.classList.add('hidden');
    }
}

/**
 * Populates the subgroup filter dropdown
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
function populateSubgroupFilter(clubId, db) {
    const select = document.getElementById('subgroup-filter');
    if (!select) return;

    const q = query(
        collection(db, 'subgroups'),
        where('clubId', '==', clubId),
        orderBy('createdAt', 'asc') // 'createdAt' muss existieren
    );

    onSnapshot(q, (snapshot) => {
        // Keep the "Alle" option
        const currentValue = select.value;
        select.innerHTML = '<option value="all">Alle (Gesamtverein)</option>';

        snapshot.forEach(doc => {
            const subgroup = doc.data();
            // Skip default/main subgroups (Hauptgruppe) as they're equivalent to "all"
            if (subgroup.isDefault) {
                return;
            }
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = subgroup.name;
            select.appendChild(option);
        });

        // Restore previous selection if it still exists
        if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
            select.value = currentValue;
        }
    }, (error) => {
        console.error("Error loading subgroups for filter:", error);
    });
}

/**
 * Handles subgroup filter changes - reloads all filtered modules
 * @param {Object} userData - Current user data
 */
function handleSubgroupFilterChange(userData) {
    console.log(`[Coach] Subgroup filter changed to: ${currentSubgroupFilter}`);

    // Update attendance module's filter
    setAttendanceSubgroupFilter(currentSubgroupFilter);

    // Update leaderboard module's filter
    setLeaderboardSubgroupFilter(currentSubgroupFilter);

    // Reload calendar/attendance view
    if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
        calendarUnsubscribe();
    }
    calendarUnsubscribe = renderCalendar(currentCalendarDate, db, userData);

    // Reload leaderboards
    loadLeaderboard(userData, db, []);
    loadGlobalLeaderboard(userData, db, []);

    // Reload challenges for current subgroup
    loadActiveChallenges(userData.clubId, db, currentSubgroupFilter);
    loadChallengesForDropdown(userData.clubId, db, currentSubgroupFilter);

    // Reload match dropdowns with new filter
    populateMatchDropdowns(clubPlayers, currentSubgroupFilter);

    // Update points player dropdown with new filter
    updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter);

    // Update pairings button state with new filter
    updatePairingsButtonState(clubPlayers, currentSubgroupFilter);

    // Reload statistics if the tab is active
    const statisticsTab = document.getElementById('tab-content-statistics');
    if (statisticsTab && !statisticsTab.classList.contains('hidden')) {
        loadStatistics(userData, db, currentSubgroupFilter);
    }
}



// Global challenge handlers (called from onclick in HTML)
let currentChallengeId = null;

window.showReactivateModal = function(challengeId, title) {
    currentChallengeId = challengeId;
    document.getElementById('reactivate-challenge-title').textContent = title;
    document.getElementById('reactivate-challenge-modal').classList.remove('hidden');
    document.getElementById('reactivate-challenge-modal').classList.add('flex');
};

window.handleReactivate = async function(duration) {
    if (!currentChallengeId) return;

    const subgroupId = document.getElementById('reactivate-challenge-subgroup').value;
    if (!subgroupId) {
        alert('Bitte wähle eine Untergruppe aus.');
        return;
    }

    const result = await reactivateChallenge(currentChallengeId, duration, subgroupId, db);
    if (result.success) {
        alert('Challenge erfolgreich reaktiviert!');
        document.getElementById('reactivate-challenge-modal').classList.add('hidden');
        document.getElementById('reactivate-challenge-modal').classList.remove('flex');
    } else {
        alert(`Fehler: ${result.error}`);
    }
};

window.confirmEndChallenge = async function(challengeId, title) {
    if (confirm(`Möchten Sie die Challenge "${title}" wirklich vorzeitig beenden?`)) {
        const result = await endChallenge(challengeId, db);
        if (result.success) {
            alert('Challenge wurde beendet.');
        } else {
            alert(`Fehler: ${result.error}`);
        }
    }
};

window.confirmDeleteChallenge = async function(challengeId, title) {
    if (confirm(`Möchten Sie die Challenge "${title}" wirklich PERMANENT löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!`)) {
        const result = await deleteChallenge(challengeId, db);
        if (result.success) {
            alert('Challenge wurde gelöscht.');
        } else {
            alert(`Fehler: ${result.error}`);
        }
    }
};

// Close reactivate modal
document.getElementById('close-reactivate-modal')?.addEventListener('click', () => {
    document.getElementById('reactivate-challenge-modal').classList.add('hidden');
    document.getElementById('reactivate-challenge-modal').classList.remove('flex');
});