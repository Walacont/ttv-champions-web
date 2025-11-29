import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    signOut,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getAnalytics,
    logEvent,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js';
import {
    getFirestore,
    doc,
    getDoc,
    collection,
    onSnapshot,
    query,
    where,
    orderBy,
    getDocs,
    updateDoc,
    writeBatch,
    serverTimestamp,
    limit,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import {
    LEAGUES,
    PROMOTION_COUNT,
    DEMOTION_COUNT,
    setupLeaderboardTabs,
    setupLeaderboardToggle,
    loadLeaderboard,
    loadGlobalLeaderboard,
    renderLeaderboardHTML,
} from './leaderboard.js';
import {
    loadExercises,
    handleExerciseClick,
    closeExerciseModal,
    setExerciseContext,
} from './exercises.js';
import { setupTabs, updateSeasonCountdown } from './ui-utils.js';
import { loadPointsHistory } from './points-management.js';
import {
    loadOverviewData,
    loadRivalData,
    loadProfileData,
    updateRankDisplay,
    updateGrundlagenDisplay,
} from './profile.js';
import { loadTopXPPlayers, loadTopWinsPlayers } from './season-stats.js';
import { renderCalendar, loadTodaysMatches } from './calendar.js';
import { loadChallenges, openChallengeModal } from './challenges-dashboard.js';
// Season reset import removed - now handled by Cloud Function
import { initializeMatchRequestForm, loadPlayerMatchRequests } from './player-matches.js';
import { initializeDoublesPlayerUI, initializeDoublesPlayerSearch } from './doubles-player-ui.js';
import { confirmDoublesMatchRequest, rejectDoublesMatchRequest, approveDoublesMatchRequest } from './doubles-matches.js';
import { loadMatchSuggestions } from './match-suggestions.js';
import { loadMatchHistory } from './match-history.js';
import { initializeLeaderboardPreferences, applyPreferences } from './leaderboard-preferences.js';
import { initializeWidgetSystem } from './dashboard-widgets.js';
import TutorialManager from './tutorial.js';
import { playerTutorialSteps } from './tutorial-player.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// --- State ---
let currentUserData = null;
let clubPlayers = []; // Store club players for match request form
let unsubscribes = [];
let currentDisplayDate = new Date();
let currentSubgroupFilter = 'club'; // Default: show club view
let matchSuggestionsUnsubscribes = []; // Array to store match suggestions listeners
let rivalListener = null; // Separate listener for rivals (needs to be updated on filter change)
let calendarListener = null; // Separate listener for calendar (needs to be updated on filter change)
let subgroupFilterListener = null; // Listener for subgroup filter dropdown
let streaksListener = null; // Listener for player streaks (real-time updates)

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async user => {
        if (user) {
            await user.getIdToken(true);
            unsubscribes.forEach(unsub => unsub());
            unsubscribes = [];
            matchSuggestionsUnsubscribes.forEach(unsub => {
                if (typeof unsub === 'function') unsub();
            });
            matchSuggestionsUnsubscribes = [];
            try {
                const userDocRef = doc(db, 'users', user.uid);
                const initialDocSnap = await getDoc(userDocRef);
                if (!initialDocSnap.exists()) {
                    signOut(auth);
                    return;
                }

                // Season resets are now handled by Cloud Function (every 6 weeks)
                // No frontend reset logic needed anymore

                const userListener = onSnapshot(userDocRef, docSnap => {
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
                            window.location.href =
                                userData.role === 'admin' ? '/admin.html' : '/coach.html';
                        }
                    } else {
                        signOut(auth);
                    }
                });
                unsubscribes.push(userListener);
            } catch (error) {
                console.error('Initialer Ladefehler:', error);
                signOut(auth);
            }
        } else {
            // User logged out - use replace() to prevent back-button access
            window.location.replace('/index.html');
        }
    });
});

/**
 * Checks if user has access to a specific feature
 * @param {string} feature - Feature name to check
 * @param {Object} userData - Current user data
 * @returns {Object} { allowed: boolean, message: string }
 */
function checkFeatureAccess(feature, userData) {
    const hasClub = userData.clubId !== null && userData.clubId !== undefined;

    const clubOnlyFeatures = ['challenges', 'attendance', 'subgroups'];

    if (clubOnlyFeatures.includes(feature) && !hasClub) {
        return {
            allowed: false,
            message: 'Diese Funktion ist nur für Vereinsmitglieder verfügbar. Tritt einem Verein bei, um diese Funktion zu nutzen.',
        };
    }

    return { allowed: true };
}

/**
 * Shows info box for players without club
 */
function showNoClubInfoIfNeeded(userData) {
    const noClubInfoBox = document.getElementById('no-club-info-box');
    const closeBtn = document.getElementById('close-no-club-info');

    if (!noClubInfoBox) return;

    // Check if user has no club and hasn't dismissed the info box
    const hasClub = userData.clubId && userData.clubId !== null;
    const hasDismissed = localStorage.getItem('noClubInfoDismissed') === 'true';

    if (!hasClub && !hasDismissed) {
        noClubInfoBox.classList.remove('hidden');
    }

    // Close button handler
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            noClubInfoBox.classList.add('hidden');
            localStorage.setItem('noClubInfoDismissed', 'true');
        });
    }
}

/**
 * Check and start player tutorial if not completed
 */
async function checkAndStartTutorial(userData) {
    // Check sessionStorage flag first (from settings page restart)
    const startTutorialFlag = sessionStorage.getItem('startTutorial');
    if (startTutorialFlag === 'player') {
        sessionStorage.removeItem('startTutorial');
        setTimeout(() => window.startPlayerTutorial(), 1000);
        return;
    }

    // Check if tutorial was already completed
    const tutorialCompleted = userData.tutorialCompleted?.player || false;

    if (!tutorialCompleted) {
        // Start tutorial after a short delay to let page fully load
        setTimeout(() => {
            const tutorial = new TutorialManager(playerTutorialSteps, {
                tutorialKey: 'player',
                autoScroll: true,
                scrollOffset: 100,
            });
            tutorial.start();
        }, 1000);
    }
}

/**
 * Global function to start player tutorial (callable from settings)
 */
window.startPlayerTutorial = function () {
    const tutorial = new TutorialManager(playerTutorialSteps, {
        tutorialKey: 'player',
        autoScroll: true,
        scrollOffset: 100,
    });
    tutorial.start();
};

/**
 * Sets the header profile picture and club information
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
async function setHeaderProfileAndClub(userData, db) {
    const headerProfilePic = document.getElementById('header-profile-pic');
    const headerClubName = document.getElementById('header-club-name');

    // Set profile picture
    if (userData.photoURL) {
        headerProfilePic.src = userData.photoURL;
    } else {
        // Generate initials
        const initials = `${userData.firstName?.[0] || ''}${userData.lastName?.[0] || ''}` || 'U';
        headerProfilePic.src = `https://placehold.co/80x80/e2e8f0/64748b?text=${initials}`;
    }

    // Set club information
    if (userData.clubId) {
        try {
            const clubDoc = await getDoc(doc(db, 'clubs', userData.clubId));
            if (clubDoc.exists()) {
                headerClubName.textContent = clubDoc.data().name || userData.clubId;
            } else {
                headerClubName.textContent = userData.clubId;
            }
        } catch (error) {
            console.error('Error loading club info:', error);
            headerClubName.textContent = 'Fehler beim Laden';
        }
    } else {
        headerClubName.textContent = 'Kein Verein';
        // Hide icon for "no club" state
        const headerClubInfo = document.getElementById('header-club-info');
        if (headerClubInfo) {
            const icon = headerClubInfo.querySelector('i');
            if (icon) {
                icon.style.display = 'none';
            }
        }
    }
}

async function initializeDashboard(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    welcomeMessage.textContent = `Willkommen, ${userData.firstName || userData.email}!`;

    // Set header profile picture and club info
    await setHeaderProfileAndClub(userData, db);

    // Render leaderboard HTML (new 3-tab system) into wrapper
    renderLeaderboardHTML('leaderboard-content-wrapper', {
        showToggle: true, // Show Club/Global toggle for Skill, Doubles, etc.
        userData: userData, // Pass user data for tab visibility preferences
    });

    // Populate subgroup options in global filter dropdown
    await populatePlayerSubgroupFilter(userData, db);

    // Check if user has access to challenges feature
    const challengesAccess = checkFeatureAccess('challenges', userData);
    const challengesLoader = challengesAccess.allowed ? loadChallenges : null;

    // Diese Funktionen richten ALLE Echtzeit-Listener (onSnapshot) ein
    loadOverviewData(userData, db, unsubscribes, null, challengesLoader, loadPointsHistory);

    // If challenges not allowed, show blocked message
    if (!challengesAccess.allowed) {
        const challengesList = document.getElementById('challenges-list');
        if (challengesList) {
            challengesList.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                    <i class="fas fa-lock text-yellow-600 text-3xl mb-3"></i>
                    <p class="text-yellow-800 font-medium">${challengesAccess.message}</p>
                    <a href="/settings.html#club-management" class="mt-4 inline-block bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                        Verein suchen
                    </a>
                </div>
            `;
        }
    }

    // Initialize widget system (customizable dashboard)
    initializeWidgetSystem(db, userData.id, userData);

    // Load rivals with current subgroup filter and store listener separately
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

    // Check if user has access to attendance/calendar feature
    const attendanceAccess = checkFeatureAccess('attendance', userData);

    // Load profile data and setup calendar with real-time listener
    if (attendanceAccess.allowed) {
        streaksListener = loadProfileData(
            userData,
            date => {
                // Unsubscribe old calendar listener if exists
                if (calendarListener && typeof calendarListener === 'function') {
                    try {
                        calendarListener();
                    } catch (e) {
                        console.error('Error unsubscribing calendar listener:', e);
                    }
                }
                // Setup new calendar listener
                calendarListener = renderCalendar(date, userData, db, currentSubgroupFilter);
            },
            currentDisplayDate,
            db
        );
    } else {
        // Show blocked message for attendance
        const calendarGrid = document.getElementById('calendar-grid');
        if (calendarGrid) {
            calendarGrid.innerHTML = `
                <div class="col-span-7 bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                    <i class="fas fa-lock text-yellow-600 text-3xl mb-3"></i>
                    <p class="text-yellow-800 font-medium">${attendanceAccess.message}</p>
                    <a href="/settings.html#club-management" class="mt-4 inline-block bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
                        Verein suchen
                    </a>
                </div>
            `;
        }

        // Also hide calendar navigation and stats
        const monthYearDisplay = document.getElementById('calendar-month-year');
        const prevMonthBtn = document.getElementById('prev-month');
        const nextMonthBtn = document.getElementById('next-month');
        const statsSection = document.querySelector('#tab-content-profile .mt-6.pt-6.border-t');

        if (monthYearDisplay) monthYearDisplay.style.display = 'none';
        if (prevMonthBtn) prevMonthBtn.style.display = 'none';
        if (nextMonthBtn) nextMonthBtn.style.display = 'none';
        if (statsSection) statsSection.style.display = 'none';
    }

    setExerciseContext(db, userData.id, userData.role);
    loadExercises(db, unsubscribes);

    // Setup tabs and toggle BEFORE loading data
    setupTabs('overview'); // 'overview' is default tab for dashboard
    setupLeaderboardTabs(userData); // Setup 3-tab navigation
    setupLeaderboardToggle(userData); // Setup Club/Global toggle - MUST be before loadLeaderboard

    // Initialize leaderboard preferences
    initializeLeaderboardPreferences(userData, db);
    applyPreferences();

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

    // Load club players for match requests
    await loadClubPlayers(userData, db);

    // Initialize match request functionality
    initializeMatchRequestForm(userData, db, clubPlayers, unsubscribes);

    // Initialize doubles match UI
    initializeDoublesPlayerUI();
    initializeDoublesPlayerSearch(db, userData);

    loadPlayerMatchRequests(userData, db, unsubscribes);
    loadOverviewMatchRequests(userData, db, unsubscribes);

    // Load match history (competition results) - initially show singles
    loadMatchHistory(db, userData, 'singles');

    // Create a global function to reload match history with different filter
    window.reloadMatchHistory = matchType => {
        loadMatchHistory(db, userData, matchType);
    };

    // Initialize match suggestions (Gegnervorschläge)
    loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);

    // Start season countdown timer
    updateSeasonCountdown('season-countdown', true, db);
    setInterval(() => updateSeasonCountdown('season-countdown', true, db), 1000);

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
    document.getElementById('exercise-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('exercise-modal')) closeExerciseModal();
    });

    // Toggle abbreviations in exercise modal
    const toggleAbbreviations = document.getElementById('toggle-abbreviations');
    const abbreviationsContent = document.getElementById('abbreviations-content');
    const abbreviationsIcon = document.getElementById('abbreviations-icon');
    if (toggleAbbreviations && abbreviationsContent && abbreviationsIcon) {
        toggleAbbreviations.addEventListener('click', () => {
            const isHidden = abbreviationsContent.classList.contains('hidden');
            if (isHidden) {
                abbreviationsContent.classList.remove('hidden');
                abbreviationsIcon.style.transform = 'rotate(180deg)';
                toggleAbbreviations.innerHTML =
                    '<svg id="abbreviations-icon" class="w-4 h-4 transform transition-transform" style="transform: rotate(180deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen ausblenden';
            } else {
                abbreviationsContent.classList.add('hidden');
                abbreviationsIcon.style.transform = 'rotate(0deg)';
                toggleAbbreviations.innerHTML =
                    '<svg id="abbreviations-icon" class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen anzeigen';
            }
        });
    }

    document.getElementById('challenges-list').addEventListener('click', e => {
        const card = e.target.closest('.challenge-card');
        if (card) {
            openChallengeModal(card.dataset);
        }
    });
    document
        .getElementById('close-challenge-modal')
        .addEventListener('click', () =>
            document.getElementById('challenge-modal').classList.add('hidden')
        );

    // Toggle match suggestions
    document.getElementById('toggle-match-suggestions').addEventListener('click', () => {
        const content = document.getElementById('match-suggestions-content');
        const chevron = document.getElementById('suggestions-chevron');
        const isHidden = content.classList.contains('hidden');

        if (isHidden) {
            content.classList.remove('hidden');
            chevron.style.transform = 'rotate(180deg)';
        } else {
            content.classList.add('hidden');
            chevron.style.transform = 'rotate(0deg)';
        }
    });

    // Toggle leaderboard preferences
    const togglePreferencesBtn = document.getElementById('toggle-leaderboard-preferences');
    if (togglePreferencesBtn) {
        togglePreferencesBtn.addEventListener('click', () => {
            const content = document.getElementById('leaderboard-preferences-content');
            const chevron = document.getElementById('preferences-chevron');
            const isHidden = content.classList.contains('hidden');

            if (isHidden) {
                content.classList.remove('hidden');
                chevron.style.transform = 'rotate(180deg)';
            } else {
                content.classList.add('hidden');
                chevron.style.transform = 'rotate(0deg)';
            }
        });
    }

    // Calendar listeners with proper listener management
    // Only add listeners if user has a club (attendance feature is allowed)
    const hasClubForCalendar = currentUserData.clubId !== null && currentUserData.clubId !== undefined;
    if (hasClubForCalendar) {
        document.getElementById('prev-month').addEventListener('click', () => {
            currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
            // Unsubscribe old listener
            if (calendarListener && typeof calendarListener === 'function') {
                try {
                    calendarListener();
                } catch (e) {
                    console.error('Error unsubscribing calendar listener:', e);
                }
            }
            // Setup new listener
            calendarListener = renderCalendar(
                currentDisplayDate,
                currentUserData,
                db,
                currentSubgroupFilter
            );
        });
        document.getElementById('next-month').addEventListener('click', () => {
            currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
            // Unsubscribe old listener
            if (calendarListener && typeof calendarListener === 'function') {
                try {
                    calendarListener();
                } catch (e) {
                    console.error('Error unsubscribing calendar listener:', e);
                }
            }
            // Setup new listener
            calendarListener = renderCalendar(
                currentDisplayDate,
                currentUserData,
                db,
                currentSubgroupFilter
            );
        });
    }

    // Track page view in Google Analytics
    logEvent(analytics, 'page_view', {
        page_title: 'Player Dashboard',
        page_location: window.location.href,
        page_path: '/dashboard',
        user_role: 'player',
        club_id: currentUserData.clubId,
    });
    console.log('[Analytics] Dashboard page view tracked');

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';

    // Check and show no-club info box if needed
    showNoClubInfoIfNeeded(userData);

    // Check and start tutorial if needed
    checkAndStartTutorial(userData);
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

    updateRankDisplay(userData); // Aktualisiert die Rang-Karte
    updateGrundlagenDisplay(userData); // Aktualisiert die Grundlagen-Karte (falls noch sichtbar)

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

    const hasClub = userData.clubId !== null && userData.clubId !== undefined;
    const subgroupIDs = userData.subgroupIDs || [];

    // Save current selection
    const currentSelection = dropdown.value;

    // Unsubscribe old listener if exists
    if (subgroupFilterListener && typeof subgroupFilterListener === 'function') {
        try {
            subgroupFilterListener();
        } catch (e) {
            console.error('Error unsubscribing subgroup filter listener:', e);
        }
    }

    // If user has no club, show only Global option
    if (!hasClub) {
        const globalOption = createOption('global', '🌍 Global');
        dropdown.innerHTML = '';
        dropdown.appendChild(globalOption);
        dropdown.value = 'global';
        return;
    }

    if (subgroupIDs.length === 0) {
        // User not in any subgroups, keep just club and global
        const clubOption =
            dropdown.querySelector('option[value="club"]') ||
            createOption('club', '🏠 Mein Verein');
        const globalOption =
            dropdown.querySelector('option[value="global"]') || createOption('global', '🌍 Global');
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

        subgroupFilterListener = onSnapshot(
            q,
            snapshot => {
                const allSubgroups = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }));

                // Filter to only user's subgroups and exclude default
                const userSubgroups = allSubgroups.filter(
                    sg => subgroupIDs.includes(sg.id) && !sg.isDefault
                );

                // Update dropdown
                const clubOption = createOption('club', '🏠 Mein Verein');
                const globalOption = createOption('global', '🌍 Global');
                dropdown.innerHTML = '';

                // Add subgroup options first (if any)
                if (userSubgroups.length > 0) {
                    userSubgroups.forEach(subgroup => {
                        const option = createOption(
                            `subgroup:${subgroup.id}`,
                            `👥 ${subgroup.name}`
                        );
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
            },
            error => {
                console.error('Error in subgroup filter listener:', error);
            }
        );
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
            console.error('Error unsubscribing rival listener:', e);
        }
    }
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

    // Reload leaderboard with correct filter
    import('./leaderboard.js').then(
        ({
            setLeaderboardSubgroupFilter,
            loadLeaderboard: loadLB,
            loadGlobalLeaderboard: loadGlobalLB,
        }) => {
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
        }
    );

    // Reload calendar with new filter and proper listener management
    if (calendarListener && typeof calendarListener === 'function') {
        try {
            calendarListener();
        } catch (e) {
            console.error('Error unsubscribing calendar listener:', e);
        }
    }
    calendarListener = renderCalendar(currentDisplayDate, userData, db, currentSubgroupFilter);

    // Reload match suggestions with new filter
    // Unsubscribe old listeners
    matchSuggestionsUnsubscribes.forEach(unsub => {
        try {
            if (typeof unsub === 'function') unsub();
        } catch (e) {
            console.error('Error unsubscribing match suggestions listener:', e);
        }
    });
    matchSuggestionsUnsubscribes = [];

    // Reload with new filter
    loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);
}

/**
 * Loads club players for match request form
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
async function loadClubPlayers(userData, db) {
    try {
        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', userData.clubId),
            where('role', '==', 'player')
        );
        const snapshot = await getDocs(playersQuery);
        clubPlayers = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
    } catch (error) {
        console.error('Error loading club players:', error);
    }
}

/**
 * Loads match requests (result requests) for overview card
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadOverviewMatchRequests(userData, db, unsubscribes) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    let allItems = [];
    let showAll = false;

    // Query for SINGLES match result requests (incoming, need my approval)
    const incomingRequestsQuery = query(
        collection(db, 'matchRequests'),
        where('playerBId', '==', userData.id),
        where('status', '==', 'pending_player')
    );

    // Query for SINGLES pending coach approval (own club)
    const singlesCoachQuery = userData.clubId ? query(
        collection(db, 'matchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_coach')
    ) : null;

    // Query for DOUBLES requests where user is opponent (teamB)
    const doublesRequestsQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_opponent')
    );

    // Query for DOUBLES pending coach approval (own club)
    const doublesCoachQuery = userData.clubId ? query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_coach')
    ) : null;

    // Query for DOUBLES pending coach approval (cross-club, clubId = null)
    const doublesCrossClubQuery = userData.clubId ? query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', null),
        where('status', '==', 'pending_coach')
    ) : null;

    // Store data from all listeners
    let singlesData = [];
    let singlesCoachData = [];
    let doublesData = [];
    let doublesCoachData = [];

    // Real-time listener for singles requests
    const unsubSingles = onSnapshot(incomingRequestsQuery, async singlesSnapshot => {
        singlesData = [];

        // Add singles match result requests
        for (const docSnap of singlesSnapshot.docs) {
            const data = docSnap.data();
            const playerADoc = await getDoc(doc(db, 'users', data.playerAId));
            const playerAData = playerADoc.exists() ? playerADoc.data() : null;
            singlesData.push({
                type: 'match-request',
                matchType: 'singles',
                id: docSnap.id,
                data,
                playerAData,
                createdAt: data.createdAt,
            });
        }

        // Combine and render
        combineAndRender();
    });

    // Real-time listener for singles coach approvals
    const unsubSinglesCoach = singlesCoachQuery ? onSnapshot(singlesCoachQuery, async snapshot => {
        singlesCoachData = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const [playerADoc, playerBDoc] = await Promise.all([
                getDoc(doc(db, 'users', data.playerAId)),
                getDoc(doc(db, 'users', data.playerBId))
            ]);

            singlesCoachData.push({
                type: 'coach-approval',
                matchType: 'singles',
                id: docSnap.id,
                data,
                playerAData: playerADoc.exists() ? playerADoc.data() : null,
                playerBData: playerBDoc.exists() ? playerBDoc.data() : null,
                createdAt: data.createdAt,
            });
        }

        combineAndRender();
    }) : null;

    // Real-time listener for doubles requests (PARALLEL, not nested!)
    const unsubDoubles = onSnapshot(doublesRequestsQuery, async doublesSnapshot => {
        doublesData = [];

        // Add doubles match requests (only where current user is opponent)
        for (const docSnap of doublesSnapshot.docs) {
            const data = docSnap.data();

            // Check if current user is one of the opponents (teamB)
            if (data.teamB.player1Id === userData.id || data.teamB.player2Id === userData.id) {
                const [p1Doc, p2Doc, p3Doc, p4Doc] = await Promise.all([
                    getDoc(doc(db, 'users', data.teamA.player1Id)),
                    getDoc(doc(db, 'users', data.teamA.player2Id)),
                    getDoc(doc(db, 'users', data.teamB.player1Id)),
                    getDoc(doc(db, 'users', data.teamB.player2Id)),
                ]);

                doublesData.push({
                    type: 'match-request',
                    matchType: 'doubles',
                    id: docSnap.id,
                    data,
                    teamAPlayer1: p1Doc.exists() ? p1Doc.data() : null,
                    teamAPlayer2: p2Doc.exists() ? p2Doc.data() : null,
                    teamBPlayer1: p3Doc.exists() ? p3Doc.data() : null,
                    teamBPlayer2: p4Doc.exists() ? p4Doc.data() : null,
                    createdAt: data.createdAt,
                });
            }
        }

        // Combine and render
        combineAndRender();
    });

    // Real-time listener for doubles coach approvals (own club + cross-club)
    const unsubDoublesCoach = doublesCoachQuery ? onSnapshot(doublesCoachQuery, async snapshot => {
        doublesCoachData = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const [p1Doc, p2Doc, p3Doc, p4Doc] = await Promise.all([
                getDoc(doc(db, 'users', data.teamA.player1Id)),
                getDoc(doc(db, 'users', data.teamA.player2Id)),
                getDoc(doc(db, 'users', data.teamB.player1Id)),
                getDoc(doc(db, 'users', data.teamB.player2Id)),
            ]);

            doublesCoachData.push({
                type: 'coach-approval',
                matchType: 'doubles',
                id: docSnap.id,
                data,
                teamAPlayer1: p1Doc.exists() ? p1Doc.data() : null,
                teamAPlayer2: p2Doc.exists() ? p2Doc.data() : null,
                teamBPlayer1: p3Doc.exists() ? p3Doc.data() : null,
                teamBPlayer2: p4Doc.exists() ? p4Doc.data() : null,
                createdAt: data.createdAt,
            });
        }

        combineAndRender();
    }) : null;

    // Real-time listener for cross-club doubles coach approvals
    const unsubCrossClub = doublesCrossClubQuery ? onSnapshot(doublesCrossClubQuery, async snapshot => {
        const crossClubData = [];

        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const [p1Doc, p2Doc, p3Doc, p4Doc] = await Promise.all([
                getDoc(doc(db, 'users', data.teamA.player1Id)),
                getDoc(doc(db, 'users', data.teamA.player2Id)),
                getDoc(doc(db, 'users', data.teamB.player1Id)),
                getDoc(doc(db, 'users', data.teamB.player2Id)),
            ]);

            const p1Data = p1Doc.exists() ? p1Doc.data() : null;
            const p2Data = p2Doc.exists() ? p2Doc.data() : null;
            const p3Data = p3Doc.exists() ? p3Doc.data() : null;
            const p4Data = p4Doc.exists() ? p4Doc.data() : null;

            // Only show if at least one of the 4 players is in the coach's club
            const isRelevant =
                p1Data?.clubId === userData.clubId ||
                p2Data?.clubId === userData.clubId ||
                p3Data?.clubId === userData.clubId ||
                p4Data?.clubId === userData.clubId;

            if (isRelevant) {
                crossClubData.push({
                    type: 'coach-approval',
                    matchType: 'doubles',
                    id: docSnap.id,
                    data,
                    teamAPlayer1: p1Data,
                    teamAPlayer2: p2Data,
                    teamBPlayer1: p3Data,
                    teamBPlayer2: p4Data,
                    createdAt: data.createdAt,
                    isCrossClub: true,
                });
            }
        }

        // Merge cross-club data into doublesCoachData
        doublesCoachData = [...doublesCoachData.filter(item => !item.isCrossClub), ...crossClubData];
        combineAndRender();
    }) : null;

    // Function to combine all data sources and render
    function combineAndRender() {
        allItems = [...singlesData, ...singlesCoachData, ...doublesData, ...doublesCoachData];

        // Sort by creation date (newest first)
        allItems.sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
        });

        renderCombinedOverview(allItems, userData, db, showAll);
        updateMatchRequestBadge(allItems.length);
    }

    const unsubs = [unsubSingles, unsubDoubles];
    if (unsubSinglesCoach) unsubs.push(unsubSinglesCoach);
    if (unsubDoublesCoach) unsubs.push(unsubDoublesCoach);
    if (unsubCrossClub) unsubs.push(unsubCrossClub);

    if (Array.isArray(unsubscribes)) {
        unsubscribes.push(...unsubs);
    }
}

/**
 * Renders match requests in overview
 */
function renderCombinedOverview(items, userData, db, showAll) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML =
            '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
        return;
    }

    // Show only first 3 unless showAll is true
    const itemsToShow = showAll ? items : items.slice(0, 3);

    itemsToShow.forEach(item => {
        const card = document.createElement('div');

        // Different styling for coach-approval vs match-request
        const isCoachApproval = item.type === 'coach-approval';
        card.className = isCoachApproval
            ? 'bg-white border-2 border-yellow-300 bg-yellow-50 rounded-lg p-3 shadow-sm'
            : 'bg-white border-2 border-blue-300 bg-blue-50 rounded-lg p-3 shadow-sm';

        if (item.matchType === 'doubles') {
            // Doubles match request or coach approval
            const convertedSets = item.data.sets
                ? item.data.sets.map(s => ({
                      playerA: s.teamA !== undefined ? s.teamA : s.playerA,
                      playerB: s.teamB !== undefined ? s.teamB : s.playerB,
                  }))
                : [];
            const setsDisplay = formatSetsDisplaySimple(convertedSets);
            const teamAName1 = item.teamAPlayer1?.firstName || 'Unbekannt';
            const teamAName2 = item.teamAPlayer2?.firstName || 'Unbekannt';
            const teamBName1 = item.teamBPlayer1?.firstName || 'Unbekannt';
            const teamBName2 = item.teamBPlayer2?.firstName || 'Unbekannt';

            const badgeColor = isCoachApproval ? 'yellow' : 'green';
            const badgeText = isCoachApproval ? 'Coach-Genehmigung' : 'Doppel';
            const approveText = isCoachApproval ? 'Genehmigen' : 'Bestätigen';

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-${badgeColor}-700 bg-${badgeColor}-200 px-2 py-1 rounded"><i class="fas fa-users mr-1"></i>${badgeText}</span>
                </div>
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 text-sm">${teamAName1} & ${teamAName2} vs ${teamBName1} & ${teamBName2}</p>
                        <p class="text-xs text-gray-600">${setsDisplay}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button class="approve-overview-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="doubles" data-item-type="${item.type}">
                        <i class="fas fa-check"></i> ${approveText}
                    </button>
                    <button class="reject-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="doubles" data-item-type="${item.type}">
                        <i class="fas fa-times"></i> Ablehnen
                    </button>
                </div>
            `;
        } else {
            // Singles match request or coach approval
            const setsDisplay = formatSetsDisplaySimple(item.data.sets);
            const playerAName = item.playerAData?.firstName || 'Unbekannt';
            const playerBName = item.playerBData?.firstName || userData.firstName || 'Unbekannt';

            const badgeColor = isCoachApproval ? 'yellow' : 'blue';
            const badgeText = isCoachApproval ? 'Coach-Genehmigung' : 'Einzel';
            const approveText = isCoachApproval ? 'Genehmigen' : 'Akzeptieren';

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-${badgeColor}-700 bg-${badgeColor}-200 px-2 py-1 rounded"><i class="fas fa-user mr-1"></i>${badgeText}</span>
                </div>
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 text-sm">${playerAName} vs ${playerBName}</p>
                        <p class="text-xs text-gray-600">${setsDisplay}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button class="approve-overview-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="singles" data-item-type="${item.type}">
                        <i class="fas fa-check"></i> ${approveText}
                    </button>
                    <button class="reject-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="singles" data-item-type="${item.type}">
                        <i class="fas fa-times"></i> Ablehnen
                    </button>
                </div>
            `;
        }

        const approveBtn = card.querySelector('.approve-overview-btn');
        const rejectBtn = card.querySelector('.reject-overview-btn');

        approveBtn.addEventListener('click', async () => {
            const matchType = approveBtn.getAttribute('data-match-type');
            const itemType = approveBtn.getAttribute('data-item-type');

            if (itemType === 'coach-approval') {
                // Coach approving a match
                if (matchType === 'doubles') {
                    await approveDoublesCoachRequest(item.id, db, userData);
                } else {
                    await approveSinglesCoachRequest(item.id, db);
                }
            } else {
                // Player confirming a match request
                if (matchType === 'doubles') {
                    await approveDoublesOverviewRequest(item.id, userData.id, db);
                } else {
                    await approveOverviewRequest(item.id, db);
                }
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const matchType = rejectBtn.getAttribute('data-match-type');
            const itemType = rejectBtn.getAttribute('data-item-type');

            if (itemType === 'coach-approval') {
                // Coach rejecting a match
                if (matchType === 'doubles') {
                    await rejectDoublesCoachRequest(item.id, db, userData);
                } else {
                    await rejectSinglesCoachRequest(item.id, db);
                }
            } else {
                // Player rejecting a match request
                if (matchType === 'doubles') {
                    await rejectDoublesOverviewRequest(item.id, db);
                } else {
                    await rejectOverviewRequest(item.id, db);
                }
            }
        });

        container.appendChild(card);
    });

    // Add "Show more" button if there are more than 3 items
    if (items.length > 3 && !showAll) {
        const showMoreBtn = document.createElement('button');
        showMoreBtn.className =
            'w-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm py-2 px-4 rounded-md transition mt-2';
        showMoreBtn.innerHTML = `<i class="fas fa-chevron-down mr-1"></i> ${items.length - 3} weitere anzeigen`;
        showMoreBtn.addEventListener('click', () => {
            renderCombinedOverview(items, userData, db, true);
        });
        container.appendChild(showMoreBtn);
    } else if (showAll && items.length > 3) {
        const showLessBtn = document.createElement('button');
        showLessBtn.className =
            'w-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm py-2 px-4 rounded-md transition mt-2';
        showLessBtn.innerHTML = `<i class="fas fa-chevron-up mr-1"></i> Weniger anzeigen`;
        showLessBtn.addEventListener('click', () => {
            renderCombinedOverview(items, userData, db, false);
        });
        container.appendChild(showLessBtn);
    }
}

/**
 * Formats sets display (simple version)
 */
function formatSetsDisplaySimple(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    return `${winsA}:${winsB} (${setsStr})`;
}

/**
 * Approves request from overview
 */
async function approveOverviewRequest(requestId, db) {
    try {
        await updateDoc(doc(db, 'matchRequests', requestId), {
            'approvals.playerB': {
                status: 'approved',
                timestamp: serverTimestamp(),
            },
            status: 'pending_coach',
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('Error approving request:', error);
        alert('Fehler beim Akzeptieren der Anfrage.');
    }
}

/**
 * Rejects request from overview
 */
async function rejectOverviewRequest(requestId, db) {
    try {
        await updateDoc(doc(db, 'matchRequests', requestId), {
            'approvals.playerB': {
                status: 'rejected',
                timestamp: serverTimestamp(),
            },
            status: 'rejected',
            rejectedBy: 'playerB',
            updatedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error('Error rejecting request:', error);
        alert('Fehler beim Ablehnen der Anfrage.');
    }
}

/**
 * Approves doubles request from overview
 */
async function approveDoublesOverviewRequest(requestId, playerId, db) {
    try {
        await confirmDoublesMatchRequest(requestId, playerId, db);
    } catch (error) {
        console.error('Error approving doubles request:', error);
        alert('Fehler beim Bestätigen der Doppel-Anfrage.');
    }
}

/**
 * Rejects doubles request from overview
 */
async function rejectDoublesOverviewRequest(requestId, db) {
    try {
        await rejectDoublesMatchRequest(requestId, db);
    } catch (error) {
        console.error('Error rejecting doubles request:', error);
        alert('Fehler beim Ablehnen der Doppel-Anfrage.');
    }
}

/**
 * Updates match request badge count (reused from player-matches.js)
 */
function updateMatchRequestBadge(count) {
    const badge = document.getElementById('match-request-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Approves singles coach request from overview
 */
async function approveSinglesCoachRequest(requestId, db) {
    try {
        await updateDoc(doc(db, 'matchRequests', requestId), {
            'approvals.coach': {
                status: 'approved',
                timestamp: serverTimestamp(),
            },
            status: 'approved',
            updatedAt: serverTimestamp(),
        });
        console.log('Singles match request approved by coach');
    } catch (error) {
        console.error('Error approving singles request:', error);
        alert('Fehler beim Genehmigen der Anfrage.');
    }
}

/**
 * Rejects singles coach request from overview
 */
async function rejectSinglesCoachRequest(requestId, db) {
    try {
        await updateDoc(doc(db, 'matchRequests', requestId), {
            'approvals.coach': {
                status: 'rejected',
                timestamp: serverTimestamp(),
            },
            status: 'rejected',
            rejectedBy: 'coach',
            updatedAt: serverTimestamp(),
        });
        console.log('Singles match request rejected by coach');
    } catch (error) {
        console.error('Error rejecting singles request:', error);
        alert('Fehler beim Ablehnen der Anfrage.');
    }
}

/**
 * Approves doubles coach request from overview
 */
async function approveDoublesCoachRequest(requestId, db, userData) {
    try {
        await approveDoublesMatchRequest(requestId, db, userData);
        console.log('Doubles match request approved by coach');
    } catch (error) {
        console.error('Error approving doubles request:', error);
        alert('Fehler beim Genehmigen der Doppel-Anfrage.');
    }
}

/**
 * Rejects doubles coach request from overview
 */
async function rejectDoublesCoachRequest(requestId, db, userData) {
    try {
        const reason = prompt('Grund für die Ablehnung (optional):');
        if (reason === null) return; // User cancelled

        await rejectDoublesMatchRequest(requestId, reason || 'Keine Angabe', db, userData);
        console.log('Doubles match request rejected by coach');
    } catch (error) {
        console.error('Error rejecting doubles request:', error);
        alert('Fehler beim Ablehnen der Doppel-Anfrage.');
    }
}
