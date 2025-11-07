import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, onSnapshot, query, where, orderBy, getDocs, updateDoc, writeBatch, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT, setupLeaderboardTabs, setupLeaderboardToggle, loadLeaderboard, loadGlobalLeaderboard, renderLeaderboardHTML } from './leaderboard.js';
import { loadExercises, handleExerciseClick, closeExerciseModal } from './exercises.js';
import { setupTabs, updateSeasonCountdown } from './ui-utils.js';
import { loadPointsHistory } from './points-management.js';
import { loadOverviewData, loadRivalData, loadProfileData, updateRankDisplay, updateGrundlagenDisplay } from './profile.js';
import { loadTopXPPlayers, loadTopWinsPlayers } from './season-stats.js';
import { renderCalendar, loadTodaysMatches } from './calendar.js';
import { loadChallenges, openChallengeModal } from './challenges-dashboard.js';
import { handleSeasonReset } from './season.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- State ---
let currentUserData = null;
let unsubscribes = [];
let currentDisplayDate = new Date();
let currentSubgroupFilter = 'club'; // Default: show club view
let rivalListener = null; // Separate listener for rivals (needs to be updated on filter change)
let calendarListener = null; // Separate listener for calendar (needs to be updated on filter change)
let subgroupFilterListener = null; // Listener for subgroup filter dropdown
let streaksListener = null; // Listener for player streaks (real-time updates)

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await user.getIdToken(true);
            unsubscribes.forEach(unsub => unsub());
            unsubscribes = [];
            try {
                const userDocRef = doc(db, "users", user.uid);
                const initialDocSnap = await getDoc(userDocRef);
                if (!initialDocSnap.exists()) { signOut(auth); return; }
                
                await handleSeasonReset(initialDocSnap.id, initialDocSnap.data(), db);

                const userListener = onSnapshot(userDocRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const userData = docSnap.data();
                        if (userData.role === 'player') {
                            const isFirstLoad = !currentUserData;
                            currentUserData = { id: docSnap.id, ...userData };
                            if (isFirstLoad) {
                                initializeDashboard(currentUserData);
                            } else {
                                updateDashboard(currentUserData);
                            }
                        } else {
                            window.location.href = userData.role === 'admin' ? '/admin.html' : '/coach.html';
                        }
                    } else { signOut(auth); }
                });
                unsubscribes.push(userListener);
            } catch (error) {
                console.error("Initialer Ladefehler:", error);
                signOut(auth);
            }
        } else {
            window.location.href = '/index.html';
        }
    });
});

async function initializeDashboard(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    welcomeMessage.textContent = `Willkommen, ${userData.firstName || userData.email}!`;

    // Render leaderboard HTML (new 3-tab system) into wrapper
    renderLeaderboardHTML('leaderboard-content-wrapper', {
        showToggle: false  // No toggle needed, global filter controls everything
    });

    // Populate subgroup options in global filter dropdown
    await populatePlayerSubgroupFilter(userData, db);

    // Diese Funktionen richten ALLE Echtzeit-Listener (onSnapshot) ein
    loadOverviewData(userData, db, unsubscribes, null, loadChallenges, loadPointsHistory);

    // Load rivals with current subgroup filter and store listener separately
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

    // Load profile data and setup calendar with real-time listener
    streaksListener = loadProfileData(userData, (date) => {
        // Unsubscribe old calendar listener if exists
        if (calendarListener && typeof calendarListener === 'function') {
            try {
                calendarListener();
            } catch (e) {
                console.error("Error unsubscribing calendar listener:", e);
            }
        }
        // Setup new calendar listener
        calendarListener = renderCalendar(date, userData, db, currentSubgroupFilter);
    }, currentDisplayDate, db);

    loadExercises(db, unsubscribes);

    // Set leaderboard filter to 'all' for initial load (club view)
    import('./leaderboard.js').then(({ setLeaderboardSubgroupFilter }) => {
        setLeaderboardSubgroupFilter('all');
    });
    loadLeaderboard(userData, db, unsubscribes);
    loadGlobalLeaderboard(userData, db, unsubscribes);
    loadTodaysMatches(userData, db, unsubscribes);

    // Load season statistics
    loadTopXPPlayers(userData.clubId, db);
    loadTopWinsPlayers(userData.clubId, db);

    // Start season countdown timer
    updateSeasonCountdown(true);
    setInterval(() => updateSeasonCountdown(true), 1000);

    logoutButton.addEventListener('click', () => signOut(auth));
    setupTabs('overview');  // 'overview' is default tab for dashboard
    setupLeaderboardTabs();  // Setup 3-tab navigation

    // Setup global subgroup filter change handler
    const subgroupFilterDropdown = document.getElementById('player-subgroup-filter');
    if (subgroupFilterDropdown) {
        subgroupFilterDropdown.addEventListener('change', () => {
            handlePlayerSubgroupFilterChange(userData, db, unsubscribes);
        });
    }

    // Event Listeners for Modals
    document.getElementById('exercises-list').addEventListener('click', handleExerciseClick);
    document.getElementById('close-exercise-modal').addEventListener('click', closeExerciseModal);
    document.getElementById('exercise-modal').addEventListener('click', (e) => { if (e.target === document.getElementById('exercise-modal')) closeExerciseModal(); });
    
    document.getElementById('challenges-list').addEventListener('click', (e) => {
        const card = e.target.closest('.challenge-card');
        if (card) {
            openChallengeModal(card.dataset);
        }
    });
    document.getElementById('close-challenge-modal').addEventListener('click', () => document.getElementById('challenge-modal').classList.add('hidden'));

    // Calendar listeners with proper listener management
    document.getElementById('prev-month').addEventListener('click', () => {
        currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
        // Unsubscribe old listener
        if (calendarListener && typeof calendarListener === 'function') {
            try {
                calendarListener();
            } catch (e) {
                console.error("Error unsubscribing calendar listener:", e);
            }
        }
        // Setup new listener
        calendarListener = renderCalendar(currentDisplayDate, currentUserData, db, currentSubgroupFilter);
    });
    document.getElementById('next-month').addEventListener('click', () => {
        currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
        // Unsubscribe old listener
        if (calendarListener && typeof calendarListener === 'function') {
            try {
                calendarListener();
            } catch (e) {
                console.error("Error unsubscribing calendar listener:", e);
            }
        }
        // Setup new listener
        calendarListener = renderCalendar(currentDisplayDate, currentUserData, db, currentSubgroupFilter);
    });

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';
}

function updateDashboard(userData) {
    const playerPointsEl = document.getElementById('player-points');
    const playerXpEl = document.getElementById('player-xp');
    const playerEloEl = document.getElementById('player-elo');

    // Diese Elemente werden direkt aus dem userData-Objekt aktualisiert
    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;

    // Note: Streak is now loaded via real-time listener in loadProfileData()
    // and displays all subgroup streaks instead of a single global streak

    updateRankDisplay(userData);  // Aktualisiert die Rang-Karte
    updateGrundlagenDisplay(userData);  // Aktualisiert die Grundlagen-Karte (falls noch sichtbar)

    // Update subgroup filter dropdown when user's subgroups change
    populatePlayerSubgroupFilter(userData, db);

    // *** KORREKTUR: ***
    // Die folgenden Zeilen wurden entfernt.
    // Sie sind nicht nötig, da 'initializeDashboard' bereits 'onSnapshot'-Listener
    // (Echtzeit-Updates) für Rivalen und Ranglisten eingerichtet hat.
    // Ein erneuter Aufruf hier würde unnötig neue Listener erstellen (Memory Leak).

    // loadRivalData(userData, db); <-- ENTFERNT
    // loadLeaderboard(userData, db, unsubscribes); <-- ENTFERNT
    // loadGlobalLeaderboard(userData, db, unsubscribes); <-- ENTFERNT
}

// --- Navigation ---
// setupTabs now in ui-utils.js


// --- Season reset & countdown now in season.js and ui-utils.js ---

// --- Profile, Overview, Calendar, Challenges now in separate modules ---


// --- Übungs-Tab Funktionen ---

// =============================================================
// ===== EXERCISE FUNCTIONS - NOW IN exercises.js =====
// =============================================================
// --- Player Global Subgroup Filter Functions ---

/**
 * Populates the global player subgroup filter with user's subgroups using real-time listener
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
function populatePlayerSubgroupFilter(userData, db) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const subgroupIDs = userData.subgroupIDs || [];

    // Save current selection
    const currentSelection = dropdown.value;

    // Unsubscribe old listener if exists
    if (subgroupFilterListener && typeof subgroupFilterListener === 'function') {
        try {
            subgroupFilterListener();
        } catch (e) {
            console.error("Error unsubscribing subgroup filter listener:", e);
        }
    }

    if (subgroupIDs.length === 0) {
        // User not in any subgroups, keep just club and global
        const clubOption = dropdown.querySelector('option[value="club"]') || createOption('club', '🏠 Mein Verein');
        const globalOption = dropdown.querySelector('option[value="global"]') || createOption('global', '🌍 Global');
        dropdown.innerHTML = '';
        dropdown.appendChild(clubOption);
        dropdown.appendChild(globalOption);
        dropdown.value = currentSelection || 'club';
        return;
    }

    try {
        // Setup real-time listener for all club subgroups
        const q = query(
            collection(db, 'subgroups'),
            where('clubId', '==', userData.clubId),
            orderBy('createdAt', 'asc')
        );

        subgroupFilterListener = onSnapshot(q, (snapshot) => {
            const allSubgroups = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Filter to only user's subgroups and exclude default
            const userSubgroups = allSubgroups
                .filter(sg => subgroupIDs.includes(sg.id) && !sg.isDefault);

            // Update dropdown
            const clubOption = createOption('club', '🏠 Mein Verein');
            const globalOption = createOption('global', '🌍 Global');
            dropdown.innerHTML = '';

            // Add subgroup options first (if any)
            if (userSubgroups.length > 0) {
                userSubgroups.forEach(subgroup => {
                    const option = createOption(`subgroup:${subgroup.id}`, `👥 ${subgroup.name}`);
                    dropdown.appendChild(option);
                });
            }

            // Add club and global options
            dropdown.appendChild(clubOption);
            dropdown.appendChild(globalOption);

            // Restore selection if still valid
            const validValues = Array.from(dropdown.options).map(opt => opt.value);
            if (validValues.includes(currentSelection)) {
                dropdown.value = currentSelection;
            } else {
                dropdown.value = 'club';
            }
        }, (error) => {
            console.error('Error in subgroup filter listener:', error);
        });

    } catch (error) {
        console.error('Error setting up subgroup filter listener:', error);
    }
}

/**
 * Helper function to create option elements
 */
function createOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

/**
 * Handles global subgroup filter change - reloads all filtered content
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array of unsubscribe functions
 */
function handlePlayerSubgroupFilterChange(userData, db, unsubscribes) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const selectedValue = dropdown.value;

    // Update current filter
    if (selectedValue === 'club') {
        currentSubgroupFilter = 'club';
    } else if (selectedValue === 'global') {
        currentSubgroupFilter = 'global';
    } else if (selectedValue.startsWith('subgroup:')) {
        currentSubgroupFilter = selectedValue.replace('subgroup:', '');
    }

    console.log(`[Player] Subgroup filter changed to: ${currentSubgroupFilter}`);

    // Unsubscribe old rival listener and reload with new filter
    if (rivalListener && typeof rivalListener === 'function') {
        try {
            rivalListener();
        } catch (e) {
            console.error("Error unsubscribing rival listener:", e);
        }
    }
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

    // Reload leaderboard with correct filter
    import('./leaderboard.js').then(({ setLeaderboardSubgroupFilter, loadLeaderboard: loadLB, loadGlobalLeaderboard: loadGlobalLB }) => {
        if (currentSubgroupFilter === 'club') {
            // Reset to 'all' for club view
            setLeaderboardSubgroupFilter('all');
            loadLB(userData, db, unsubscribes);
        } else if (currentSubgroupFilter === 'global') {
            // Global view doesn't use subgroup filter
            loadGlobalLB(userData, db, unsubscribes);
        } else {
            // Specific subgroup - set the filter
            setLeaderboardSubgroupFilter(currentSubgroupFilter);
            loadLB(userData, db, unsubscribes);
        }
    });

    // Reload calendar with new filter and proper listener management
    if (calendarListener && typeof calendarListener === 'function') {
        try {
            calendarListener();
        } catch (e) {
            console.error("Error unsubscribing calendar listener:", e);
        }
    }
    calendarListener = renderCalendar(currentDisplayDate, userData, db, currentSubgroupFilter);
}
