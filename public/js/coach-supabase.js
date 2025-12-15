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
} from './leaderboard-supabase.js';
import {
    renderCalendar,
    fetchMonthlyAttendance,
    handleAttendanceSave,
    loadPlayersForAttendance,
    updateAttendanceCount,
    setAttendanceSubgroupFilter,
    openAttendanceModalForSession,
    getCurrentSessionId,
} from './attendance-supabase.js';
import {
    exportAttendanceToExcel,
    exportAttendanceSummary,
} from './attendance-export-supabase.js';
import { initClubRequestsManager } from './club-requests-manager-supabase.js';
import { initEventsModule, openEventDayModal } from './events-supabase.js';
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
} from './challenges-supabase.js';
import {
    loadAllExercises,
    loadExercisesForDropdown,
    openExerciseModalFromDataset,
    handleCreateExercise,
    closeExerciseModal,
    setupExercisePointsCalculation,
    setupExerciseMilestones,
    setExerciseContext,
} from './exercises-supabase.js';
import { setupDescriptionEditor, renderTableForDisplay } from './tableEditor.js';
import { calculateHandicap } from './validation-utils.js';
import {
    handleGeneratePairings,
    renderPairingsInModal,
    updatePairingsButtonState,
    handleMatchSave,
    updateMatchUI,
    populateMatchDropdowns,
    initializeCoachSetScoreInput,
    loadSavedPairings,
    initializeHandicapToggle,
    setCurrentSport,
} from './matches-supabase.js';
import {
    initializeDoublesCoachUI,
    populateDoublesDropdowns,
    handleDoublesMatchSave,
    getCurrentMatchType,
    setDoublesSetScoreInput,
    setDoublesUserId,
} from './doubles-coach-ui-supabase.js';
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
    initOfflinePlayerBirthdateSelects,
} from './player-management-supabase.js';
import {
    loadPointsHistoryForCoach,
    populateHistoryFilterDropdown,
    handlePointsFormSubmit,
    handleReasonChange,
    setupMilestoneSelectors,
    setupManualPartnerSystem,
} from './points-management-supabase.js';
import { loadLeaguesForSelector, checkAndResetClubSeason } from './season-supabase.js';
import {
    initializeExercisePartnerSystemCoach,
    initializeChallengePartnerSystemCoach,
} from './milestone-management.js';
import { loadStatistics, cleanupStatistics } from './coach-statistics-supabase.js';
// migration.js is no longer needed - we're fully on Supabase
import {
    loadSubgroupsList,
    handleCreateSubgroup,
    handleSubgroupActions,
    handleEditSubgroupSubmit,
    closeEditSubgroupModal,
} from './subgroups-management-supabase.js';
import { initInvitationCodeManagement } from './invitation-code-management-supabase.js';
import {
    initPlayerInvitationManagement,
    loadSubgroupsForOfflinePlayerForm,
    handlePostPlayerCreationInvitation,
    openSendInvitationModal,
} from './player-invitation-management-supabase.js';
import {
    loadRecurringTemplates,
} from './training-schedule-ui-supabase.js';
import { initializeTrainingCompletion } from './training-completion-supabase.js';
import TutorialManager from './tutorial-supabase.js';
import { coachTutorialSteps } from './tutorial-coach.js';

// Initialize Supabase
const supabase = getSupabase();

// Notifications module - loaded dynamically
let notificationsModule = null;

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

            // Get club and sport directly from profile (single sport model)
            const effectiveClubId = supabaseProfile.club_id || null;
            const effectiveSportId = supabaseProfile.active_sport_id || null;

            // Get sport name for handicap calculations
            let sportName = 'table_tennis';
            if (effectiveSportId) {
                const { data: sportData } = await supabase
                    .from('sports')
                    .select('name')
                    .eq('id', effectiveSportId)
                    .single();
                if (sportData?.name) {
                    sportName = sportData.name;
                }
            }
            // Set sport for handicap calculations
            setCurrentSport(sportName);

            // Map Supabase profile to expected format
            const userData = {
                id: user.uid,
                email: supabaseProfile.email || user.email,
                firstName: supabaseProfile.first_name || '',
                lastName: supabaseProfile.last_name || '',
                role: supabaseProfile.role || 'player',
                clubId: effectiveClubId,
                activeSportId: effectiveSportId,
                xp: supabaseProfile.xp || 0,
                points: supabaseProfile.points || 0,
                eloRating: supabaseProfile.elo_rating || 800,
                highestElo: supabaseProfile.highest_elo || 800,
                gender: supabaseProfile.gender || null,
                birthdate: supabaseProfile.birthdate || null,
                photoURL: supabaseProfile.avatar_url || null,
                onboardingComplete: supabaseProfile.onboarding_complete || false,
                isOffline: supabaseProfile.is_offline || false,
                tutorialCompleted: supabaseProfile.tutorial_completed || {},
            };

            if (userData.role === 'coach' || userData.role === 'head_coach' || userData.role === 'admin') {
                // Coaches must be in a club - if not, downgrade to player and redirect
                if (!userData.clubId && userData.role !== 'admin') {
                    console.warn('[COACH] Coach without club detected, downgrading to player');

                    // Update role in database
                    const { error: updateError } = await supabase
                        .from('profiles')
                        .update({ role: 'player' })
                        .eq('id', user.uid);

                    if (updateError) {
                        console.error('[COACH] Failed to downgrade role:', updateError);
                    } else {
                        console.log('[COACH] Role successfully downgraded to player');
                    }

                    window.location.replace('/dashboard.html');
                    return;
                }

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

    // No migration needed - fully on Supabase
    if (loaderText) loaderText.textContent = 'Lade Dashboard...';

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
    await initClubRequestsManager(userData, supabase);
    console.log('[Coach] Club requests manager initialized');

    // Initialize Events Module
    initEventsModule(userData);
    console.log('[Coach] Events module initialized');

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
    initPlayerInvitationManagement(supabase, null, null, userData.clubId, userData.id, userData.activeSportId);

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
    loadPlayersForDropdown(userData.clubId, supabase, userData.activeSportId);
    loadChallengesForDropdown(userData.clubId, supabase, currentSubgroupFilter);
    loadExercisesForDropdown(supabase);
    loadActiveChallenges(userData.clubId, supabase, currentSubgroupFilter);
    loadExpiredChallenges(userData.clubId, supabase);
    setExerciseContext(supabase, userData.id, userData.role, userData.clubId, userData.activeSportId);
    loadAllExercises(supabase);

    // Populate subgroup dropdowns for challenge forms
    populateSubgroupDropdown(userData.clubId, 'challenge-subgroup', supabase);
    populateSubgroupDropdown(userData.clubId, 'reactivate-challenge-subgroup', supabase);
    loadPlayersForAttendance(userData.clubId, supabase, players => {
        clubPlayers = players; // WICHTIG: clubPlayers wird hier global befüllt
        populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
        populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter); // Populate doubles dropdowns, exclude coach
        populateHistoryFilterDropdown(clubPlayers);
        updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter, userData.id); // Exclude coach from points dropdown
    });

    // Initialize set score input for coach match form (used by both singles and doubles)
    const setScoreInput = await initializeCoachSetScoreInput(userData.id);

    // Initialize doubles match UI and set the same set score input
    initializeDoublesCoachUI();
    setDoublesUserId(userData.id); // Set user ID for sport context in doubles
    if (setScoreInput) {
        setDoublesSetScoreInput(setScoreInput);
    }

    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);

    // Listen for training cancellation events to reload calendar
    window.addEventListener('trainingCancelled', () => {
        console.log('[Coach] Training cancelled, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Listen for training creation events to reload calendar
    window.addEventListener('trainingCreated', () => {
        console.log('[Coach] Training created, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Listen for player subgroup changes to reload clubPlayers and refresh filtered views
    window.addEventListener('playerSubgroupsChanged', () => {
        console.log('[Coach] Player subgroups changed, reloading clubPlayers...');
        loadPlayersForAttendance(userData.clubId, supabase, players => {
            clubPlayers = players;
            console.log('[Coach] clubPlayers refreshed with', players.length, 'players');
            // Refresh all filtered views with updated player data
            populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
            populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
            updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter, userData.id);
            updatePairingsButtonState(clubPlayers, currentSubgroupFilter);
        });
    });

    // Listen for subgroup changes to refresh the filter dropdown
    window.addEventListener('subgroupsChanged', () => {
        console.log('[Coach] Subgroups changed, refreshing filter dropdown...');
        populateSubgroupFilter(userData.clubId, supabase);
    });

    // Initialize notifications (loaded dynamically, non-blocking)
    try {
        notificationsModule = await import('./notifications-supabase.js');
        if (notificationsModule.initNotifications) {
            notificationsModule.initNotifications(userData.id);
        }
    } catch (e) {
        console.warn('Notifications not available:', e);
    }

    // --- Event Listeners ---
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                if (notificationsModule && notificationsModule.cleanupNotifications) {
                    notificationsModule.cleanupNotifications();
                }
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
    }
    document.getElementById('error-logout-button')?.addEventListener('click', async () => {
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
        }, userData);
    });
    document.getElementById('close-player-modal-button').addEventListener('click', () => {
        document.getElementById('player-list-modal').classList.add('hidden');
        if (unsubscribePlayerList) unsubscribePlayerList();
    });

    // Add Player/Code Modal Listeners
    document.getElementById('add-offline-player-button').addEventListener('click', async () => {
        document.getElementById('add-offline-player-modal').classList.remove('hidden');
        document.getElementById('add-offline-player-modal').classList.add('flex');

        // Initialize birthdate dropdowns
        initOfflinePlayerBirthdateSelects();

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
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
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
                renderCalendar(date, userData)
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
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Export buttons for attendance
    document.getElementById('export-attendance-btn').addEventListener('click', async () => {
        await exportAttendanceToExcel(supabase, userData.clubId, currentCalendarDate, currentSubgroupFilter);
    });
    document.getElementById('export-attendance-summary-btn').addEventListener('click', async () => {
        await exportAttendanceSummary(supabase, userData.clubId, currentCalendarDate, currentSubgroupFilter);
    });
    // Calendar day click - opens the new event day modal
    document
        .getElementById('calendar-grid')
        .addEventListener('click', async (e) => {
            const dayCell = e.target.closest('.calendar-day');
            if (!dayCell || dayCell.classList.contains('disabled')) return;

            const dateString = dayCell.dataset.date;
            if (!dateString) return;

            // Load events for this day
            try {
                const { data: events, error: eventsError } = await supabase
                    .from('events')
                    .select('id, title, start_time, end_time, location, target_type, target_subgroup_ids')
                    .eq('club_id', userData.clubId)
                    .eq('start_date', dateString)
                    .eq('cancelled', false)
                    .order('start_time');

                if (eventsError) throw eventsError;

                // Get subgroup info for events with subgroup targets
                const eventsWithInfo = await Promise.all((events || []).map(async (event) => {
                    let subgroupNames = [];
                    let subgroupColor = '#6366f1'; // Default indigo for club-wide

                    if (event.target_type === 'subgroups' && event.target_subgroup_ids && event.target_subgroup_ids.length > 0) {
                        // Load subgroup info for color and names
                        const { data: subgroups } = await supabase
                            .from('subgroups')
                            .select('id, name, color')
                            .in('id', event.target_subgroup_ids);

                        if (subgroups && subgroups.length > 0) {
                            subgroupNames = subgroups.map(s => s.name);
                            subgroupColor = subgroups[0].color || '#6366f1';
                        }
                    }

                    return {
                        id: event.id,
                        title: event.title,
                        startTime: event.start_time,
                        endTime: event.end_time,
                        location: event.location,
                        targetType: event.target_type,
                        subgroupNames,
                        subgroupColor
                    };
                }));

                // Open the event day modal
                openEventDayModal(dateString, eventsWithInfo);

            } catch (error) {
                console.error('[Coach] Error loading events for day:', error);
                alert('Fehler beim Laden der Veranstaltungen. Bitte versuche es erneut.');
            }
        });

    // Make openAttendanceForSession available globally for the event day modal
    window.openAttendanceForSession = async (sessionId, dateString) => {
        openAttendanceModalForSession(
            sessionId,
            dateString,
            clubPlayers,
            updateAttendanceCount,
            () => updatePairingsButtonState(clubPlayers, currentSubgroupFilter),
            userData.clubId
        );
    };

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

        // Führt bestehende Aktionen aus (Löschen, Einladen, Befördern, Wettkampfsbereit, etc.)
        await handlePlayerListActions(e, supabase, userData);

        // Logik für "Gruppen bearbeiten"-Button
        if (button.classList.contains('edit-subgroups-btn')) {
            const playerId = button.dataset.id;
            let player = clubPlayers.find(p => p.id === playerId);

            // If player not in cache, fetch from database
            if (!player) {
                console.log('[Coach] Player not in cache, fetching from database:', playerId);
                try {
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('id, first_name, last_name, subgroup_ids')
                        .eq('id', playerId)
                        .single();

                    if (error) throw error;
                    if (data) {
                        player = {
                            id: data.id,
                            firstName: data.first_name,
                            lastName: data.last_name,
                            subgroupIDs: data.subgroup_ids || []
                        };
                    }
                } catch (err) {
                    console.error('[Coach] Error fetching player:', err);
                }
            }

            if (player) {
                openEditPlayerModal(player, supabase, userData.clubId);
            } else {
                console.error('Spieler nicht gefunden.');
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

    // Intervals (pass user's active sport ID for sport-specific countdown)
    const activeSportId = userData.activeSportId || null;
    updateSeasonCountdown('season-countdown-coach', false, supabase, activeSportId);
    setInterval(() => updateSeasonCountdown('season-countdown-coach', false, supabase, activeSportId), 1000);
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
                supabaseClient: supabase,
                userId: userData.id,
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

            // Note: Gender is handled by separate coach-gender-filter dropdown

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
    calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);

    // Reload leaderboards
    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    // Reload challenges for current subgroup
    loadActiveChallenges(userData.clubId, supabase, currentSubgroupFilter);
    loadChallengesForDropdown(userData.clubId, supabase, currentSubgroupFilter);

    // Reload match dropdowns with new filter (exclude coach from dropdown, apply both subgroup and gender filters)
    populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
    populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);

    // Update points player dropdown with new filter (exclude coach)
    updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter, userData.id);

    // Update pairings button state with new filter
    updatePairingsButtonState(clubPlayers, currentSubgroupFilter);

    // Reload statistics if the tab is active
    const statisticsTab = document.getElementById('tab-content-statistics');
    if (statisticsTab && !statisticsTab.classList.contains('hidden')) {
        loadStatistics(userData, supabase, currentSubgroupFilter);
    }
}

/**
 * Handles gender filter changes - reloads leaderboards and match dropdowns with combined filters
 * @param {Object} userData - Current user data
 */
function handleGenderFilterChange(userData) {
    console.log(`[Coach] Gender filter changed to: ${currentGenderFilter}`);

    // Update leaderboard module's gender filter
    setLeaderboardGenderFilter(currentGenderFilter);

    // Reload leaderboards with updated gender filter
    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    // Reload match dropdowns with new gender filter (combine with current subgroup filter)
    populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
    populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
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
window.startCoachTutorial = async function () {
    // Get current user ID
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const tutorial = new TutorialManager(coachTutorialSteps, {
        tutorialKey: 'coach',
        autoScroll: true,
        scrollOffset: 100,
        supabaseClient: supabase,
        userId: userId,
        onComplete: () => {
            console.log('Coach Tutorial abgeschlossen!');
        },
        onSkip: () => {
            console.log('Coach Tutorial übersprungen');
        },
    });

    tutorial.start();
};
