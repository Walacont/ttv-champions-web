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
        showToggle: false  // We use dropdown instead
    });

    // Populate subgroup options in dropdown
    await populatePlayerLeaderboardDropdown(userData, db);

    // Diese Funktionen richten ALLE Echtzeit-Listener (onSnapshot) ein
    loadOverviewData(userData, db, unsubscribes, loadRivalData, loadChallenges, loadPointsHistory);
    loadProfileData(userData, (date) => renderCalendar(date, userData, db), currentDisplayDate);
    loadExercises(db, unsubscribes);
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

    // Setup dropdown change handler for player leaderboard view
    const leaderboardViewDropdown = document.getElementById('player-leaderboard-view');
    if (leaderboardViewDropdown) {
        leaderboardViewDropdown.addEventListener('change', () => {
            handlePlayerLeaderboardViewChange(userData, db, unsubscribes);
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

    // Calendar listeners
    document.getElementById('prev-month').addEventListener('click', () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1); renderCalendar(currentDisplayDate, currentUserData, db); });
    document.getElementById('next-month').addEventListener('click', () => { currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1); renderCalendar(currentDisplayDate, currentUserData, db); });

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';
}

function updateDashboard(userData) {
    const playerPointsEl = document.getElementById('player-points');
    const playerXpEl = document.getElementById('player-xp');
    const playerEloEl = document.getElementById('player-elo');
    const statsCurrentStreak = document.getElementById('stats-current-streak');

    // Diese Elemente werden direkt aus dem userData-Objekt aktualisiert
    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;
    if (statsCurrentStreak) statsCurrentStreak.innerHTML = `${userData.streak || 0} 🔥`;

    updateRankDisplay(userData);  // Aktualisiert die Rang-Karte
    updateGrundlagenDisplay(userData);  // Aktualisiert die Grundlagen-Karte (falls noch sichtbar)

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
// --- Player Leaderboard View Dropdown Functions ---

/**
 * Populates the player leaderboard dropdown with user's subgroups
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
async function populatePlayerLeaderboardDropdown(userData, db) {
    const dropdown = document.getElementById('player-leaderboard-view');
    if (!dropdown) return;

    const subgroupIDs = userData.subgroupIDs || [];
    
    if (subgroupIDs.length === 0) {
        // User not in any subgroups, keep just club and global
        return;
    }

    try {
        // Load subgroup names
        const subgroupPromises = subgroupIDs.map(async (subgroupId) => {
            try {
                const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
                if (subgroupDoc.exists()) {
                    const data = subgroupDoc.data();
                    return {
                        id: subgroupId,
                        name: data.name,
                        isDefault: data.isDefault || false
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error loading subgroup ${subgroupId}:`, error);
                return null;
            }
        });

        // Filter out null values and default "Hauptgruppe" to avoid confusion
        // Only show specialized subgroups (U10, U13, etc.)
        const subgroups = (await Promise.all(subgroupPromises))
            .filter(sg => sg !== null && !sg.isDefault);

        // Clear existing options except club and global
        const clubOption = dropdown.querySelector('option[value="club"]');
        const globalOption = dropdown.querySelector('option[value="global"]');
        dropdown.innerHTML = '';

        // Add subgroup options first
        if (subgroups.length > 0) {
            subgroups.forEach(subgroup => {
                const option = document.createElement('option');
                option.value = `subgroup:${subgroup.id}`;
                option.textContent = `👥 ${subgroup.name}`;
                dropdown.appendChild(option);
            });
        }

        // Re-add club and global options
        dropdown.appendChild(clubOption);
        dropdown.appendChild(globalOption);

    } catch (error) {
        console.error('Error populating leaderboard dropdown:', error);
    }
}

/**
 * Handles leaderboard view change from dropdown
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array of unsubscribe functions
 */
function handlePlayerLeaderboardViewChange(userData, db, unsubscribes) {
    const dropdown = document.getElementById('player-leaderboard-view');
    if (!dropdown) return;

    const selectedValue = dropdown.value;

    // Unsubscribe from existing leaderboard listeners
    unsubscribes.forEach(unsub => {
        if (unsub && typeof unsub === 'function') {
            try {
                unsub();
            } catch (e) {
                // Ignore errors
            }
        }
    });
    unsubscribes.length = 0;

    if (selectedValue === 'club') {
        // Show club leaderboard
        loadLeaderboard(userData, db, unsubscribes);
    } else if (selectedValue === 'global') {
        // Show global leaderboard
        loadGlobalLeaderboard(userData, db, unsubscribes);
    } else if (selectedValue.startsWith('subgroup:')) {
        // Show subgroup leaderboard
        const subgroupId = selectedValue.replace('subgroup:', '');
        loadSubgroupLeaderboard(userData, db, unsubscribes, subgroupId);
    }
}

/**
 * Loads leaderboard for a specific subgroup
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 * @param {string} subgroupId - Subgroup ID to filter by
 */
function loadSubgroupLeaderboard(userData, db, unsubscribes, subgroupId) {
    // Import and use existing leaderboard functions with subgroup filter
    import('./leaderboard.js').then(({ setLeaderboardSubgroupFilter, loadLeaderboard: loadLB }) => {
        setLeaderboardSubgroupFilter(subgroupId);
        loadLB(userData, db, unsubscribes);
    });
}
