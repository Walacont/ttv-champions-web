import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, onSnapshot, query, where, orderBy, getDocs, updateDoc, writeBatch, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT, setupLeaderboardTabs, setupLeaderboardToggle, loadLeaderboard, loadGlobalLeaderboard, renderLeaderboardHTML } from './leaderboard.js';
import { loadExercises, handleExerciseClick, closeExerciseModal } from './exercises.js';
import { setupTabs, updateSeasonCountdown } from './ui-utils.js';
import { loadPointsHistory } from './points-management.js';
import { loadOverviewData, loadRivalData, loadProfileData, updateRankDisplay } from './profile.js';
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

function initializeDashboard(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    welcomeMessage.textContent = `Willkommen, ${userData.firstName || userData.email}!`;

    // Render leaderboard HTML (new 3-tab system)
    renderLeaderboardHTML('tab-content-leaderboard', {
        showToggle: true
    });

    loadOverviewData(userData, db, unsubscribes, loadRivalData, loadChallenges, loadPointsHistory);
    loadProfileData(userData, (date) => renderCalendar(date, userData, db), currentDisplayDate);
    loadExercises(db, unsubscribes);
    loadLeaderboard(userData, db, unsubscribes);
    loadGlobalLeaderboard(userData, db, unsubscribes);
    loadTodaysMatches(userData, db, unsubscribes);

    logoutButton.addEventListener('click', () => signOut(auth));
    setupTabs('overview');  // 'overview' is default tab for dashboard
    setupLeaderboardTabs();  // Setup 3-tab navigation
    setupLeaderboardToggle();  // Setup club/global toggle

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

    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;
    if (statsCurrentStreak) statsCurrentStreak.innerHTML = `${userData.streak || 0} 🔥`;

    updateRankDisplay(userData);  // Update rank display when data changes
    loadRivalData(userData, db);
    loadLeaderboard(userData, db, unsubscribes);
    loadGlobalLeaderboard(userData, db, unsubscribes);
}

// --- Navigation ---
// setupTabs now in ui-utils.js


// --- Season reset & countdown now in season.js and ui-utils.js ---

// --- Profile, Overview, Calendar, Challenges now in separate modules ---


// --- Übungs-Tab Funktionen ---

// =============================================================
// ===== EXERCISE FUNCTIONS - NOW IN exercises.js =====
// =============================================================