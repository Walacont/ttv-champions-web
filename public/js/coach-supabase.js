// Coach Dashboard - Supabase Version
// 1:1 Migration von coach.js - Firebase → Supabase

import { getSupabase, onAuthStateChange as supabaseAuthStateChange } from './supabase-init.js';
import {
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    writeBatch,
    serverTimestamp,
    increment,
} from './db-supabase.js';
import {
    LEAGUES,
    PROMOTION_COUNT,
    DEMOTION_COUNT,
    setupLeaderboardTabs,
    setupLeaderboardToggle,
    loadLeaderboard,
    loadGlobalLeaderboard,
    renderLeaderboardHTML,
    setLeaderboardSubgroupFilter,
    setLeaderboardGenderFilter,
} from './leaderboard.js';
import {
    renderCalendar,
    fetchMonthlyAttendance,
    handleCalendarDayClick,
    handleAttendanceSave,
    loadPlayersForAttendance,
    updateAttendanceCount,
    setAttendanceSubgroupFilter,
    openAttendanceModalForSession,
    getCurrentSessionId,
} from './attendance.js';
import {
    exportAttendanceToExcel,
    exportAttendanceSummary,
} from './attendance-export.js';
import { initClubRequestsManager } from './club-requests-manager.js';
import {
    handleCreateChallenge,
    loadActiveChallenges,
    loadExpiredChallenges,
    loadChallengesForDropdown,
    calculateExpiry,
    updateAllCountdowns,
    reactivateChallenge,
    endChallenge,
    deleteChallenge,
    populateSubgroupDropdown,
    setupChallengePointRecommendations,
    setupChallengeMilestones,
} from './challenges.js';
import {
    loadAllExercises,
    loadExercisesForDropdown,
    openExerciseModalFromDataset,
    handleCreateExercise,
    closeExerciseModal,
    setupExercisePointsCalculation,
    setupExerciseMilestones,
    setExerciseContext,
} from './exercises.js';
import { setupDescriptionEditor, renderTableForDisplay } from './tableEditor.js';
import { calculateHandicap } from './validation-utils.js';
import {
    handleGeneratePairings,
    renderPairingsInModal,
    updatePairingsButtonState,
    handleMatchSave,
    updateMatchUI,
    populateMatchDropdowns,
    loadCoachMatchRequests,
    loadCoachProcessedRequests,
    initializeCoachSetScoreInput,
    loadSavedPairings,
    initializeHandicapToggle,
} from './matches.js';
import {
    initializeDoublesCoachUI,
    populateDoublesDropdowns,
    handleDoublesMatchSave,
    getCurrentMatchType,
    setDoublesSetScoreInput,
} from './doubles-coach-ui.js';
import { setupTabs, updateSeasonCountdown, AGE_GROUPS, GENDER_GROUPS } from './ui-utils-supabase.js';
import {
    handleAddOfflinePlayer,
    handlePlayerListActions,
    loadPlayerList,
    loadPlayersForDropdown,
    updateCoachGrundlagenDisplay,
    loadSubgroupsForPlayerForm,
    openEditPlayerModal,
    handleSavePlayerSubgroups,
    updatePointsPlayerDropdown,
} from './player-management.js';
import {
    loadPointsHistoryForCoach,
    populateHistoryFilterDropdown,
    handlePointsFormSubmit,
    handleReasonChange,
    setupMilestoneSelectors,
    setupManualPartnerSystem,
} from './points-management.js';
import { loadLeaguesForSelector, checkAndResetClubSeason } from './season.js';
import {
    initializeExercisePartnerSystemCoach,
    initializeChallengePartnerSystemCoach,
} from './milestone-management.js';
import { loadStatistics, cleanupStatistics } from './coach-statistics.js';
import { checkAndMigrate } from './migration.js';
import {
    loadSubgroupsList,
    handleCreateSubgroup,
    handleSubgroupActions,
    handleEditSubgroupSubmit,
    closeEditSubgroupModal,
} from './subgroups-management.js';
import { initInvitationCodeManagement } from './invitation-code-management.js';
import {
    initPlayerInvitationManagement,
    loadSubgroupsForOfflinePlayerForm,
    handlePostPlayerCreationInvitation,
    openSendInvitationModal,
} from './player-invitation-management.js';
import {
    initializeSpontaneousSessions,
    loadRecurringTemplates,
    openSessionSelectionModal,
} from './training-schedule-ui.js';
import { initializeTrainingCompletion } from './training-completion.js';
import TutorialManager from './tutorial.js';
import { coachTutorialSteps } from './tutorial-coach.js';

// Initialize Supabase
const supabase = getSupabase();

// --- State ---
let currentUserData = null;
let unsubscribePlayerList = null;
let unsubscribeLeaderboard = null;
let unsubscribePointsHistory = null;
let unsubscribeSubgroups = null;
let currentCalendarDate = new Date();
let clubPlayers = [];
let currentSubgroupFilter = 'all';
let currentGenderFilter = 'all';
let calendarUnsubscribe = null;
let descriptionEditor = null;

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const authErrorContainer = document.getElementById('auth-error-container');
    const authErrorMessage = document.getElementById('auth-error-message');

    function showAuthError(message) {
        if (pageLoader) pageLoader.style.display = 'none';
        if (mainContent) mainContent.style.display = 'none';
        if (authErrorMessage) authErrorMessage.textContent = message;
        if (authErrorContainer) authErrorContainer.style.display = 'flex';
        console.error('Auth-Fehler:', message);
    }

    // Check Supabase session
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        const user = { uid: session.user.id, email: session.user.email };

        try {
            // Get user profile from Supabase
            const { data: supabaseProfile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.uid)
                .single();

            if (profileError || !supabaseProfile) {
                showAuthError('Benutzerprofil nicht gefunden.');
                return;
            }

            // Map Supabase profile to expected format
            const userData = {
                id: user.uid,
                email: supabaseProfile.email || user.email,
                firstName: supabaseProfile.first_name || '',
                lastName: supabaseProfile.last_name || '',
                role: supabaseProfile.role || 'player',
                clubId: supabaseProfile.club_id || null,
                xp: supabaseProfile.xp || 0,
                points: supabaseProfile.points || 0,
                eloRating: supabaseProfile.elo_rating || 1000,
                highestElo: supabaseProfile.highest_elo || 1000,
                gender: supabaseProfile.gender || null,
                birthdate: supabaseProfile.birthdate || null,
                photoURL: supabaseProfile.photo_url || null,
                onboardingComplete: supabaseProfile.onboarding_complete || false,
                isOffline: supabaseProfile.is_offline || false,
                tutorialCompleted: supabaseProfile.tutorial_completed || {},
            };

            if (userData.role === 'coach' || userData.role === 'admin') {
                currentUserData = userData;

                // Check for season reset
                await checkAndResetClubSeason(userData.clubId, supabase);

                initializeCoachPage(currentUserData);
            } else {
                showAuthError(`Ihre Rolle ('${userData.role}') ist nicht berechtigt.`);
            }
        } catch (error) {
            showAuthError(`DB-Fehler: ${error.message}`);
        }
    } else {
        // No session, redirect to login
        window.location.replace('/index.html');
    }

    // Listen for auth state changes (logout, etc.)
    supabaseAuthStateChange((event, session) => {
        console.log('[COACH] Auth state changed:', event);
        if (event === 'SIGNED_OUT' || !session) {
            window.location.replace('/index.html');
        }
    });
});

/**
 * Sets the header profile picture and club information
 * @param {Object} userData - Current user data
 */
async function setHeaderProfileAndClub(userData) {
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
            const { data: clubData, error } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', userData.clubId)
                .single();

            if (!error && clubData) {
                headerClubName.textContent = clubData.name || userData.clubId;
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

async function initializeCoachPage(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const loaderText = document.getElementById('loader-text');

    // Run migration if needed
    if (loaderText) loaderText.textContent = 'Prüfe Datenbank-Migration...';
    try {
        const migrationResult = await checkAndMigrate(userData.clubId, supabase);
        if (migrationResult.success && !migrationResult.skipped) {
            console.log('[Coach] Migration completed successfully:', migrationResult.stats);
            if (loaderText) loaderText.textContent = 'Migration abgeschlossen! Lade Dashboard...';
        } else if (migrationResult.success && migrationResult.skipped) {
            console.log('[Coach] Migration not needed');
        } else {
            console.error('[Coach] Migration failed:', migrationResult.error);
            alert(
                `Warnung: Datenbank-Migration fehlgeschlagen. Bitte kontaktiere den Support.\nFehler: ${migrationResult.error}`
            );
        }
    } catch (error) {
        console.error('[Coach] Error during migration check:', error);
        alert(`Warnung: Fehler beim Prüfen der Datenbank-Migration.\nFehler: ${error.message}`);
    }

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';

    document.getElementById('welcome-message').textContent =
        `Willkommen, ${userData.firstName || userData.email}!`;

    // Set header profile picture and club info
    await setHeaderProfileAndClub(userData);

    // Track page view (console log instead of Firebase Analytics)
    console.log('[Analytics] Coach page view tracked', {
        page_title: 'Coach Dashboard',
        page_location: window.location.href,
        page_path: '/coach',
        user_role: 'coach',
        club_id: userData.clubId,
    });

    // Initialize Club Requests Manager
    await initClubRequestsManager(userData);
    console.log('[Coach] Club requests manager initialized');

    // Render leaderboard HTML
    renderLeaderboardHTML('tab-content-dashboard', {
        showToggle: true,
        userData: userData, // Pass user data for tab visibility preferences
    });

    setupTabs('statistics');
    setupLeaderboardTabs(userData);
    setupLeaderboardToggle(userData);

    // Add event listener for tab changes to load saved pairings when Wettkampf tab is opened
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (tabName === 'matches') {
                // Load saved pairings when Wettkampf tab is opened
                loadSavedPairings(supabase, userData.clubId);
            }
        });
    });

    // Initialize Invitation Code Management
    initInvitationCodeManagement(supabase, userData.clubId, userData.id);

    // Initialize Player Invitation Management (pass supabase instead of auth/functions)
    initPlayerInvitationManagement(supabase, null, null, userData.clubId, userData.id);

    // Initialize Spontaneous Sessions (for creating trainings from calendar)
    initializeSpontaneousSessions(userData, supabase);

    // Initialize Training Completion (for intelligent points distribution)
    initializeTrainingCompletion(supabase, userData);

    // Bridge function: Connect training-schedule-ui to attendance module
    window.openAttendanceForSessionFromSchedule = async function (sessionId, dateStr) {
        await openAttendanceModalForSession(
            sessionId,
            dateStr,
            clubPlayers,
            updateAttendanceCount,
            updatePairingsButtonState,
            supabase,
            userData.clubId
        );
    };

    // Load statistics initially (since it's the default tab)
    loadStatistics(userData, supabase, currentSubgroupFilter);

    // Setup Statistics Tab
    const statisticsTabButton = document.querySelector('.tab-button[data-tab="statistics"]');
    if (statisticsTabButton) {
        statisticsTabButton.addEventListener('click', () => {
            loadStatistics(userData, supabase, currentSubgroupFilter);
        });
    }

    // Setup Subgroups Tab
    const subgroupsTabButton = document.querySelector('.tab-button[data-tab="subgroups"]');
    if (subgroupsTabButton) {
        subgroupsTabButton.addEventListener('click', () => {
            loadSubgroupsList(userData.clubId, supabase, unsub => {
                if (unsubscribeSubgroups) unsubscribeSubgroups();
                unsubscribeSubgroups = unsub;
            });
        });
    }

    // Load initial data
    loadPlayersForDropdown(userData.clubId, supabase);
    loadChallengesForDropdown(userData.clubId, supabase, currentSubgroupFilter);
    loadExercisesForDropdown(supabase);
    loadActiveChallenges(userData.clubId, supabase, currentSubgroupFilter);
    loadExpiredChallenges(userData.clubId, supabase);
    setExerciseContext(supabase, userData.id, userData.role, userData.clubId);
    loadAllExercises(supabase);

    // Populate subgroup dropdowns for challenge forms
    populateSubgroupDropdown(userData.clubId, 'challenge-subgroup', supabase);
    populateSubgroupDropdown(userData.clubId, 'reactivate-challenge-subgroup', supabase);
    loadPlayersForAttendance(userData.clubId, supabase, players => {
        clubPlayers = players; // WICHTIG: clubPlayers wird hier global befüllt
        populateMatchDropdowns(clubPlayers, currentSubgroupFilter);
        populateDoublesDropdowns(clubPlayers, currentSubgroupFilter); // Populate doubles dropdowns
        populateHistoryFilterDropdown(clubPlayers);
        updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter);
    });

    // Initialize set score input for coach match form (used by both singles and doubles)
    const setScoreInput = initializeCoachSetScoreInput();

    // Initialize doubles match UI and set the same set score input
    initializeDoublesCoachUI();
    if (setScoreInput) {
        setDoublesSetScoreInput(setScoreInput);
    }

    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    // Load coach match requests (singles and doubles)
    // Load combined match requests (singles + doubles)
    loadCoachMatchRequests(userData, supabase);
    loadCoachProcessedRequests(userData, supabase);

    calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);

    // Listen for training cancellation events to reload calendar
    window.addEventListener('trainingCancelled', () => {
        console.log('[Coach] Training cancelled, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);
    });

    // Listen for training creation events to reload calendar
    window.addEventListener('trainingCreated', () => {
        console.log('[Coach] Training created, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);
    });

    // --- Event Listeners ---
    document.getElementById('logout-button').addEventListener('click', async () => {
        try {
            await supabase.auth.signOut();
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
    document.getElementById('error-logout-button').addEventListener('click', async () => {
        try {
            await supabase.auth.signOut();
            if (window.spaEnhancer) {
                window.spaEnhancer.clearCache();
            }
            window.location.replace('/index.html');
        } catch (error) {
            console.error('Logout error:', error);
        }
    });

    // Player Modal Listeners
    document.getElementById('open-player-modal-button').addEventListener('click', () => {
        document.getElementById('player-list-modal').classList.remove('hidden');
        loadPlayerList(userData.clubId, supabase, unsub => {
            if (unsubscribePlayerList) unsubscribePlayerList();
            unsubscribePlayerList = unsub;
        });
    });
    document.getElementById('close-player-modal-button').addEventListener('click', () => {
        document.getElementById('player-list-modal').classList.add('hidden');
        if (unsubscribePlayerList) unsubscribePlayerList();
    });

    // Add Player/Code Modal Listeners
    document.getElementById('add-offline-player-button').addEventListener('click', async () => {
        document.getElementById('add-offline-player-modal').classList.remove('hidden');
        document.getElementById('add-offline-player-modal').classList.add('flex');

        // Lade Subgroups from Supabase
        const { data: subgroupsData, error } = await supabase
            .from('subgroups')
            .select('*')
            .eq('club_id', userData.clubId);

        const subgroups = error ? [] : subgroupsData.map(sg => ({
            id: sg.id,
            name: sg.name,
            clubId: sg.club_id,
            ...sg
        }));

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
    document.getElementById('is-match-ready-checkbox').addEventListener('change', e => {
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
    document
        .getElementById('close-edit-player-modal-button')
        .addEventListener('click', () =>
            document.getElementById('edit-player-modal').classList.add('hidden')
        );
    document
        .getElementById('save-player-subgroups-button')
        .addEventListener('click', () => handleSavePlayerSubgroups(supabase));

    // Attendance Modal Listeners
    document.getElementById('close-attendance-modal-button').addEventListener('click', () => {
        document.getElementById('attendance-modal').classList.add('hidden');
        // Reload calendar when closing attendance modal without saving
        // This ensures newly created sessions are visible even if attendance wasn't recorded
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);
    });

    // Form Submissions
    // Initialize description editor for exercise creation BEFORE registering event handlers
    descriptionEditor = setupDescriptionEditor({
        textAreaId: 'exercise-description-form',
        toggleContainerId: 'description-toggle-container-coach',
        tableEditorContainerId: 'description-table-editor-coach',
    });

    document
        .getElementById('add-offline-player-form')
        .addEventListener('submit', e => handleAddOfflinePlayer(e, supabase, userData));
    document
        .getElementById('points-form')
        .addEventListener('submit', e =>
            handlePointsFormSubmit(e, supabase, userData, handleReasonChange)
        );
    document
        .getElementById('create-challenge-form')
        .addEventListener('submit', e => handleCreateChallenge(e, supabase, userData));
    document
        .getElementById('attendance-form')
        .addEventListener('submit', e =>
            handleAttendanceSave(e, supabase, userData, clubPlayers, currentCalendarDate, date =>
                renderCalendar(date, supabase, userData)
            )
        );
    document
        .getElementById('create-exercise-form')
        .addEventListener('submit', e => handleCreateExercise(e, supabase, supabase.storage, descriptionEditor, userData));
    document.getElementById('match-form').addEventListener('submit', async e => {
        const matchType = getCurrentMatchType();
        if (matchType === 'doubles') {
            await handleDoublesMatchSave(e, supabase, userData);
        } else {
            await handleMatchSave(e, supabase, userData, clubPlayers);
        }
    });

    // Setup exercise points auto-calculation (based on level + difficulty)
    setupExercisePointsCalculation();

    // Setup exercise milestones system
    setupExerciseMilestones();

    // Initialize partner system for exercises
    initializeExercisePartnerSystemCoach();

    // Setup challenge point recommendations (based on duration)
    setupChallengePointRecommendations();

    // Setup challenge milestones system
    setupChallengeMilestones();

    // Initialize partner system for challenges
    initializeChallengePartnerSystemCoach();

    document
        .getElementById('create-subgroup-form')
        .addEventListener('submit', e => handleCreateSubgroup(e, supabase, userData.clubId));
    document
        .getElementById('edit-subgroup-form')
        .addEventListener('submit', e => handleEditSubgroupSubmit(e, supabase));
    document
        .getElementById('close-edit-subgroup-modal-button')
        .addEventListener('click', closeEditSubgroupModal);
    document
        .getElementById('cancel-edit-subgroup-button')
        .addEventListener('click', closeEditSubgroupModal);

    // Other UI Listeners
    document.getElementById('reason-select').addEventListener('change', handleReasonChange);

    // Setup milestone selectors for exercise/challenge points awarding
    setupMilestoneSelectors(supabase);

    // Setup manual partner system for manual points awarding
    setupManualPartnerSystem(supabase);

    document.getElementById('generate-pairings-button').addEventListener('click', () => {
        const sessionId = getCurrentSessionId();
        handleGeneratePairings(clubPlayers, currentSubgroupFilter, sessionId);
    });
    document.getElementById('close-pairings-modal-button').addEventListener('click', () => {
        document.getElementById('pairings-modal').classList.add('hidden');
    });
    document.getElementById('exercises-list-coach').addEventListener('click', e => {
        const card = e.target.closest('[data-id]');
        if (card) {
            openExerciseModalFromDataset(card.dataset);
        }
    });
    document
        .getElementById('close-exercise-modal-button')
        .addEventListener('click', closeExerciseModal);

    // Toggle abbreviations in exercise modal (Coach)
    const toggleAbbreviationsCoach = document.getElementById('toggle-abbreviations-coach');
    const abbreviationsContentCoach = document.getElementById('abbreviations-content-coach');
    const abbreviationsIconCoach = document.getElementById('abbreviations-icon-coach');
    if (toggleAbbreviationsCoach && abbreviationsContentCoach && abbreviationsIconCoach) {
        toggleAbbreviationsCoach.addEventListener('click', () => {
            const isHidden = abbreviationsContentCoach.classList.contains('hidden');
            if (isHidden) {
                abbreviationsContentCoach.classList.remove('hidden');
                abbreviationsIconCoach.style.transform = 'rotate(180deg)';
                toggleAbbreviationsCoach.innerHTML =
                    '<svg id="abbreviations-icon-coach" class="w-4 h-4 transform transition-transform" style="transform: rotate(180deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen ausblenden';
            } else {
                abbreviationsContentCoach.classList.add('hidden');
                abbreviationsIconCoach.style.transform = 'rotate(0deg)';
                toggleAbbreviationsCoach.innerHTML =
                    '<svg id="abbreviations-icon-coach" class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen anzeigen';
            }
        });
    }

    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);
    });

    // Export buttons for attendance
    document.getElementById('export-attendance-btn').addEventListener('click', async () => {
        await exportAttendanceToExcel(supabase, userData.clubId, currentCalendarDate, currentSubgroupFilter);
    });
    document.getElementById('export-attendance-summary-btn').addEventListener('click', async () => {
        await exportAttendanceSummary(supabase, userData.clubId, currentCalendarDate, currentSubgroupFilter);
    });
    document
        .getElementById('calendar-grid')
        .addEventListener('click', e =>
            handleCalendarDayClick(
                e,
                clubPlayers,
                updateAttendanceCount,
                () => updatePairingsButtonState(clubPlayers, currentSubgroupFilter),
                supabase,
                userData.clubId
            )
        );

    // Event delegation for attendance checkboxes - listen on the container
    document.getElementById('attendance-player-list').addEventListener('change', e => {
        if (e.target.type === 'checkbox') {
            updateAttendanceCount();
            updatePairingsButtonState(clubPlayers, currentSubgroupFilter);
        }
    });

    document
        .getElementById('player-a-select')
        .addEventListener('change', () => updateMatchUI(clubPlayers));
    document
        .getElementById('player-b-select')
        .addEventListener('change', () => updateMatchUI(clubPlayers));
    initializeHandicapToggle(); // Initialize handicap toggle for automatic score setting
    document
        .getElementById('subgroups-list')
        .addEventListener('click', e => handleSubgroupActions(e, supabase, userData.clubId));

    // === KORREKTUR 2: VERALTETEN LISTENER ERSETZEN ===
    // Diese Zeile hat auf Klicks in der *Liste* gelauscht, um Aktionen auszuführen.
    // document.getElementById('modal-player-list').addEventListener('click', (e) => handlePlayerListActions(e, supabase, null, null)); // <--- ALT & FALSCH

    // Event-Handler für Aktions-Buttons (Desktop)
    const handleActionClick = async e => {
        const button = e.target.closest('button');
        if (!button) return;

        // Führt bestehende Aktionen aus (Löschen, Einladen, Befördern)
        await handlePlayerListActions(e, supabase, null, null);

        // Logik für "Gruppen bearbeiten"-Button
        if (button.classList.contains('edit-subgroups-btn')) {
            const playerId = button.dataset.id;
            const player = clubPlayers.find(p => p.id === playerId);

            if (player) {
                openEditPlayerModal(player, supabase, userData.clubId);
            } else {
                console.error('Spieler nicht im lokalen Cache gefunden.');
                alert('Fehler: Spielerdaten konnten nicht geladen werden.');
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
    document.getElementById('player-search-input').addEventListener('keyup', e => {
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
    document.getElementById('history-player-filter').addEventListener('change', e => {
        loadPointsHistoryForCoach(e.target.value, supabase, unsub => {
            if (unsubscribePointsHistory) unsubscribePointsHistory();
            unsubscribePointsHistory = unsub;
        });
    });

    document.getElementById('player-select').addEventListener('change', e => {
        // === KORREKTUR 3: 'supabase' Instanz übergeben ===
        updateCoachGrundlagenDisplay(e.target.value, supabase);
    });

    // Subgroup Filter
    populateSubgroupFilter(userData.clubId, supabase);
    document.getElementById('subgroup-filter').addEventListener('change', e => {
        currentSubgroupFilter = e.target.value;
        handleSubgroupFilterChange(userData);
    });

    // Gender Filter
    const genderFilterDropdown = document.getElementById('coach-gender-filter');
    if (genderFilterDropdown) {
        genderFilterDropdown.addEventListener('change', e => {
            currentGenderFilter = e.target.value;
            handleGenderFilterChange(userData);
        });
    }

    // Intervals
    updateSeasonCountdown('season-countdown-coach', false, supabase);
    setInterval(() => updateSeasonCountdown('season-countdown-coach', false, supabase), 1000);
    setInterval(updateAllCountdowns, 1000);

    // Check if tutorial should be shown (first time coach login)
    checkAndStartTutorial(userData);
}

/**
 * Check if tutorial should be shown and start it
 */
async function checkAndStartTutorial(userData) {
    // Check if tutorial should be started manually (from settings)
    const startTutorialFlag = sessionStorage.getItem('startTutorial');
    if (startTutorialFlag === 'coach') {
        sessionStorage.removeItem('startTutorial');
        // Start tutorial after a delay
        setTimeout(() => {
            window.startCoachTutorial();
        }, 1000);
        return;
    }

    // Check if tutorial was already completed
    const tutorialCompleted = userData.tutorialCompleted?.coach || false;

    if (!tutorialCompleted) {
        // Wait a bit to ensure all content is loaded
        setTimeout(() => {
            const tutorial = new TutorialManager(coachTutorialSteps, {
                tutorialKey: 'coach',
                autoScroll: true,
                scrollOffset: 100,
                onComplete: () => {
                    console.log('Coach Tutorial abgeschlossen!');
                },
                onSkip: () => {
                    console.log('Coach Tutorial übersprungen');
                },
            });

            tutorial.start();
        }, 1000);
    }
}

/**
 * Populates the subgroup filter dropdown with age groups and custom subgroups
 * @param {string} clubId - Club ID
 * @param {Object} db - Supabase client instance
 */
function populateSubgroupFilter(clubId, db) {
    const select = document.getElementById('subgroup-filter');
    if (!select) return;

    // Initial load
    loadSubgroupsForFilter();

    // Set up real-time subscription
    const subscription = supabase
        .channel('subgroups-filter-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'subgroups',
            filter: `club_id=eq.${clubId}`
        }, () => {
            loadSubgroupsForFilter();
        })
        .subscribe();

    async function loadSubgroupsForFilter() {
        try {
            const { data: subgroupsData, error } = await supabase
                .from('subgroups')
                .select('*')
                .eq('club_id', clubId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error loading subgroups for filter:', error);
                return;
            }

            const currentValue = select.value;
            select.innerHTML = '';

            // Add "Alle" option
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'Alle (Gesamtverein)';
            select.appendChild(allOption);

            // Add Youth Age Groups
            const youthGroup = document.createElement('optgroup');
            youthGroup.label = 'Jugend (nach Alter)';
            AGE_GROUPS.youth.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                youthGroup.appendChild(option);
            });
            select.appendChild(youthGroup);

            // Add Adults Age Group
            AGE_GROUPS.adults.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                select.appendChild(option);
            });

            // Add Senior Age Groups
            const seniorGroup = document.createElement('optgroup');
            seniorGroup.label = 'Senioren (nach Alter)';
            AGE_GROUPS.seniors.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                seniorGroup.appendChild(option);
            });
            select.appendChild(seniorGroup);

            // Add Gender Groups
            const genderGroup = document.createElement('optgroup');
            genderGroup.label = 'Geschlecht';
            GENDER_GROUPS.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                genderGroup.appendChild(option);
            });
            select.appendChild(genderGroup);

            // Add Custom Subgroups
            const customSubgroups = subgroupsData.filter(sg => !sg.is_default);

            if (customSubgroups.length > 0) {
                const customGroup = document.createElement('optgroup');
                customGroup.label = 'Untergruppen im Verein';
                customSubgroups.forEach(subgroup => {
                    const option = document.createElement('option');
                    option.value = subgroup.id;
                    option.textContent = subgroup.name;
                    customGroup.appendChild(option);
                });
                select.appendChild(customGroup);
            }

            // Restore previous selection if it still exists
            if (
                currentValue &&
                Array.from(select.options).some(opt => opt.value === currentValue)
            ) {
                select.value = currentValue;
            }
        } catch (error) {
            console.error('Error loading subgroups for filter:', error);
        }
    }
}

/**
 * Handles subgroup filter changes - reloads all filtered modules
 * @param {Object} userData - Current user data
 */
function handleSubgroupFilterChange(userData) {
    console.log(`[Coach] Subgroup filter changed to: ${currentSubgroupFilter}`);

    // Update attendance module's filter
    setAttendanceSubgroupFilter(currentSubgroupFilter);

    // Update leaderboard module's filters (both subgroup and gender)
    setLeaderboardSubgroupFilter(currentSubgroupFilter);
    setLeaderboardGenderFilter(currentGenderFilter);

    // Reload calendar/attendance view
    if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
        calendarUnsubscribe();
    }
    calendarUnsubscribe = renderCalendar(currentCalendarDate, supabase, userData);

    // Reload leaderboards
    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    // Reload challenges for current subgroup
    loadActiveChallenges(userData.clubId, supabase, currentSubgroupFilter);
    loadChallengesForDropdown(userData.clubId, supabase, currentSubgroupFilter);

    // Reload match dropdowns with new filter
    populateMatchDropdowns(clubPlayers, currentSubgroupFilter);

    // Update points player dropdown with new filter
    updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter);

    // Update pairings button state with new filter
    updatePairingsButtonState(clubPlayers, currentSubgroupFilter);

    // Reload statistics if the tab is active
    const statisticsTab = document.getElementById('tab-content-statistics');
    if (statisticsTab && !statisticsTab.classList.contains('hidden')) {
        loadStatistics(userData, supabase, currentSubgroupFilter);
    }
}

/**
 * Handles gender filter changes - reloads leaderboards with combined filters
 * @param {Object} userData - Current user data
 */
function handleGenderFilterChange(userData) {
    console.log(`[Coach] Gender filter changed to: ${currentGenderFilter}`);

    // Update leaderboard module's gender filter
    setLeaderboardGenderFilter(currentGenderFilter);

    // Reload leaderboards with updated gender filter
    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);
}

// Global challenge handlers (called from onclick in HTML)
let currentChallengeId = null;

window.showReactivateModal = function (challengeId, title) {
    currentChallengeId = challengeId;
    document.getElementById('reactivate-challenge-title').textContent = title;
    document.getElementById('reactivate-challenge-modal').classList.remove('hidden');
    document.getElementById('reactivate-challenge-modal').classList.add('flex');
};

window.handleReactivate = async function (duration) {
    if (!currentChallengeId) return;

    const subgroupId = document.getElementById('reactivate-challenge-subgroup').value;
    if (!subgroupId) {
        alert('Bitte wähle eine Untergruppe aus.');
        return;
    }

    const result = await reactivateChallenge(currentChallengeId, duration, subgroupId, supabase);
    if (result.success) {
        alert('Challenge erfolgreich reaktiviert!');
        document.getElementById('reactivate-challenge-modal').classList.add('hidden');
        document.getElementById('reactivate-challenge-modal').classList.remove('flex');
    } else {
        alert(`Fehler: ${result.error}`);
    }
};

window.confirmEndChallenge = async function (challengeId, title) {
    if (confirm(`Möchten Sie die Challenge "${title}" wirklich vorzeitig beenden?`)) {
        const result = await endChallenge(challengeId, supabase);
        if (result.success) {
            alert('Challenge wurde beendet.');
        } else {
            alert(`Fehler: ${result.error}`);
        }
    }
};

window.confirmDeleteChallenge = async function (challengeId, title) {
    if (
        confirm(
            `Möchten Sie die Challenge "${title}" wirklich PERMANENT löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden!`
        )
    ) {
        const result = await deleteChallenge(challengeId, supabase);
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

/**
 * Global function to manually start the coach tutorial (called from settings)
 */
window.startCoachTutorial = function () {
    const tutorial = new TutorialManager(coachTutorialSteps, {
        tutorialKey: 'coach',
        autoScroll: true,
        scrollOffset: 100,
        onComplete: () => {
            console.log('Coach Tutorial abgeschlossen!');
        },
        onSkip: () => {
            console.log('Coach Tutorial übersprungen');
        },
    });

    tutorial.start();
};
