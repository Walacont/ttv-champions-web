// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, sendPasswordResetEmail, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, onSnapshot, query, where, writeBatch, serverTimestamp, increment, deleteDoc, updateDoc, runTransaction, orderBy, limit, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { firebaseConfig } from './firebase-config.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT, loadLeaderboardForCoach, loadGlobalLeaderboard, renderLeaderboardHTML, setupLeaderboardToggle } from './leaderboard.js';
import { renderCalendar, fetchMonthlyAttendance, handleCalendarDayClick, handleAttendanceSave, loadPlayersForAttendance, updateAttendanceCount } from './attendance.js';
import { handleCreateChallenge, loadActiveChallenges, loadChallengesForDropdown, calculateExpiry, updateAllCountdowns } from './challenges.js';
import { loadAllExercises, loadExercisesForDropdown, openExerciseModalFromDataset, handleCreateExercise, closeExerciseModal } from './exercises.js';
import { calculateHandicap, handleGeneratePairings, renderPairingsInModal, updatePairingsButtonState, handleMatchSave, updateMatchUI, populateMatchDropdowns } from './matches.js';
import { setupTabs, updateSeasonCountdown } from './ui-utils.js';
import { handleAddOfflinePlayer, handlePlayerListActions, loadPlayerList, loadPlayersForDropdown } from './player-management.js';
import { loadPointsHistoryForCoach, populateHistoryFilterDropdown, handlePointsFormSubmit, handleReasonChange } from './points-management.js';
import { loadLeaguesForSelector } from './season.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west3');

// NEU: Der Emulator-Block
// Verbindet sich nur mit den lokalen Emulatoren, wenn die Seite über localhost läuft.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Coach.js: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);
    
    // Functions Emulator
    connectFunctionsEmulator(functions, "localhost", 5001);

    // Storage Emulator
    connectStorageEmulator(storage, "localhost", 9199);
}


// --- State ---
let currentUserData = null;
let unsubscribePlayerList = null;
let unsubscribeLeaderboard = null;
// NEU HINZUGEFÜGT
let unsubscribePointsHistory = null;
let currentCalendarDate = new Date();
let clubPlayers = [];

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

function initializeCoachPage(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';

    document.getElementById('welcome-message').textContent = `Willkommen, ${userData.firstName || userData.email}! (Verein: ${userData.clubId})`;

    // Render leaderboard HTML for coach
    renderLeaderboardHTML('tab-content-dashboard', {
        showToggle: true,  // Club/Global Toggle
        showLeagueSelect: true,  // Liga-Auswahl für Club-Ansicht
        showLeagueIcons: true,
        showSeasonCountdown: true
    });

    setupTabs('dashboard');  // Use 'dashboard' as default tab for coach
    setupLeaderboardToggle();  // Setup für Club/Global Toggle
    loadPlayersForDropdown(userData.clubId, db);
    loadChallengesForDropdown(userData.clubId, db);
    loadExercisesForDropdown(db);
    loadActiveChallenges(userData.clubId, db);
    loadAllExercises(db);
    loadLeaguesForSelector(userData.clubId, db, (unsub) => {
        if (unsubscribeLeaderboard) unsubscribeLeaderboard();
        unsubscribeLeaderboard = unsub;
    });  // Setup für Liga-Buttons
    loadPlayersForAttendance(userData.clubId, db, (players) => {
        clubPlayers = players;
        populateMatchDropdowns(clubPlayers);
        populateHistoryFilterDropdown(clubPlayers);
    });
    loadGlobalLeaderboard(userData, db, []); // Global leaderboard für Coach
    updateSeasonCountdown(false);  // No reload for coach
    renderCalendar(currentCalendarDate, db, userData);

    // --- Event Listeners ---
    document.getElementById('logout-button').addEventListener('click', () => signOut(auth));
    document.getElementById('error-logout-button').addEventListener('click', () => signOut(auth));
    document.getElementById('open-player-modal-button').addEventListener('click', () => {
        document.getElementById('player-list-modal').classList.remove('hidden');
        loadPlayerList(userData.clubId, db, (unsub) => {
            if (unsubscribePlayerList) unsubscribePlayerList();
            unsubscribePlayerList = unsub;
        });
    });
    document.getElementById('close-player-modal-button').addEventListener('click', () => { document.getElementById('player-list-modal').classList.add('hidden'); if (unsubscribePlayerList) unsubscribePlayerList(); });
    document.getElementById('add-offline-player-button').addEventListener('click', () => document.getElementById('add-offline-player-modal').classList.remove('hidden'));
    document.getElementById('close-add-player-modal-button').addEventListener('click', () => document.getElementById('add-offline-player-modal').classList.add('hidden'));
    document.getElementById('close-attendance-modal-button').addEventListener('click', () => document.getElementById('attendance-modal').classList.add('hidden'));
    document.getElementById('add-offline-player-form').addEventListener('submit', (e) => handleAddOfflinePlayer(e, db, userData));
    document.getElementById('reason-select').addEventListener('change', handleReasonChange);
    document.getElementById('points-form').addEventListener('submit', (e) => handlePointsFormSubmit(e, db, userData, handleReasonChange));
    document.getElementById('create-challenge-form').addEventListener('submit', (e) => handleCreateChallenge(e, db, userData));
    document.getElementById('attendance-form').addEventListener('submit', (e) => handleAttendanceSave(e, db, userData, clubPlayers, currentCalendarDate, (date) => renderCalendar(date, db, userData)));
    document.getElementById('create-exercise-form').addEventListener('submit', (e) => handleCreateExercise(e, db, storage));
    document.getElementById('match-form').addEventListener('submit', (e) => handleMatchSave(e, db, userData, clubPlayers));
    document.getElementById('generate-pairings-button').addEventListener('click', () => handleGeneratePairings(clubPlayers));
    document.getElementById('close-pairings-modal-button').addEventListener('click', () => { document.getElementById('pairings-modal').classList.add('hidden'); });
    document.getElementById('exercises-list-coach').addEventListener('click', (e) => { const card = e.target.closest('[data-id]'); if(card) { openExerciseModalFromDataset(card.dataset); } });
    document.getElementById('close-exercise-modal-button').addEventListener('click', closeExerciseModal);
    document.getElementById('modal-player-list').addEventListener('click', (e) => handlePlayerListActions(e, db, auth, functions));
    document.getElementById('prev-month-btn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); renderCalendar(currentCalendarDate, db, userData); });
    document.getElementById('next-month-btn').addEventListener('click', () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); renderCalendar(currentCalendarDate, db, userData); });
    document.getElementById('calendar-grid').addEventListener('click', (e) => handleCalendarDayClick(e, clubPlayers, updateAttendanceCount, () => updatePairingsButtonState(clubPlayers)));
    document.getElementById('player-a-select').addEventListener('change', () => updateMatchUI(clubPlayers));
    document.getElementById('player-b-select').addEventListener('change', () => updateMatchUI(clubPlayers));

    // NEU: Event listener für den Punkte-Historie-Filter HINZUGEFÜGT
    document.getElementById('history-player-filter').addEventListener('change', (e) => {
        loadPointsHistoryForCoach(e.target.value, db, (unsub) => {
            if (unsubscribePointsHistory) unsubscribePointsHistory();
            unsubscribePointsHistory = unsub;
        });
    });

    // Intervals
    setInterval(() => updateSeasonCountdown(false), 1000);
    setInterval(updateAllCountdowns, 1000);
}

// =============================================================
// ===== POINTS HISTORY - NOW IN points-management.js =====
// =============================================================


// =============================================================
// ===== MATCH & PAIRING FUNCTIONS - NOW IN matches.js =====
// =============================================================

// =============================================================
// ===== PLAYER MANAGEMENT, UI, SEASON - NOW IN SEPARATE MODULES =====
// =============================================================

// =============================================================
// ===== EXERCISE FUNCTIONS - NOW IN exercises.js =====
// =============================================================



// Points management and player dropdowns now in points-management.js and player-management.js