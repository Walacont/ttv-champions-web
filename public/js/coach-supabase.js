// Coach Dashboard - Supabase Version

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
import { initEventsModule, openEventDayModal, loadUpcomingEventsForCoach } from './events-supabase.js';
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

const supabase = getSupabase();

// Wird dynamisch geladen, um initiales Laden nicht zu blockieren
let notificationsModule = null;

// --- Zustand ---
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

// --- Initialisierung ---
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

    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        const user = { uid: session.user.id, email: session.user.email };

        try {
            const { data: supabaseProfile, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.uid)
                .single();

            if (profileError || !supabaseProfile) {
                showAuthError('Benutzerprofil nicht gefunden.');
                return;
            }

            // Single Sport Model: Club und Sport direkt aus Profil
            const effectiveClubId = supabaseProfile.club_id || null;
            const effectiveSportId = supabaseProfile.active_sport_id || null;

            // Sportname für Handicap-Berechnungen
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
            setCurrentSport(sportName);

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
                // Coaches ohne Club (außer Admins) werden zu Spielern herabgestuft
                if (!userData.clubId && userData.role !== 'admin') {
                    console.warn('[COACH] Coach without club detected, downgrading to player');

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

                await checkAndResetClubSeason(userData.clubId, supabase);

                initializeCoachPage(currentUserData);
            } else {
                showAuthError(`Ihre Rolle ('${userData.role}') ist nicht berechtigt.`);
            }
        } catch (error) {
            showAuthError(`DB-Fehler: ${error.message}`);
        }
    } else {
        window.location.replace('/index.html');
    }

    // Auth State Changes: Nur bei explizitem Sign-Out umleiten
    supabaseAuthStateChange((event, session) => {
        console.log('[COACH] Auth state changed:', event);
        if (event === 'SIGNED_OUT') {
            window.location.replace('/index.html');
        }
    });
});

/**
 * Setzt Header-Profilbild und Vereinsinformation
 */
async function setHeaderProfileAndClub(userData) {
    const headerProfilePic = document.getElementById('header-profile-pic');
    const headerClubName = document.getElementById('header-club-name');

    if (userData.photoURL) {
        headerProfilePic.src = userData.photoURL;
    } else {
        const initials = `${userData.firstName?.[0] || ''}${userData.lastName?.[0] || ''}` || 'U';
        headerProfilePic.src = `https://placehold.co/80x80/e2e8f0/64748b?text=${initials}`;
    }

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
        // Icon bei "Kein Verein" ausblenden
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

    // Vollständig auf Supabase - keine Migration mehr nötig
    if (loaderText) loaderText.textContent = 'Lade Dashboard...';

    pageLoader.style.display = 'none';
    mainContent.style.display = 'block';

    document.getElementById('welcome-message').textContent =
        `Willkommen, ${userData.firstName || userData.email}!`;

    await setHeaderProfileAndClub(userData);

    // Analytics per Console statt Firebase
    console.log('[Analytics] Coach page view tracked', {
        page_title: 'Coach Dashboard',
        page_location: window.location.href,
        page_path: '/coach',
        user_role: 'coach',
        club_id: userData.clubId,
    });

    await initClubRequestsManager(userData, supabase);
    console.log('[Coach] Club requests manager initialized');

    initEventsModule(userData);
    console.log('[Coach] Events module initialized');

    loadUpcomingEventsForCoach('coach-upcoming-events', userData);
    console.log('[Coach] Upcoming events widget loaded');

    renderLeaderboardHTML('tab-content-dashboard', {
        showToggle: true,
        userData: userData, // Für Tab-Sichtbarkeits-Präferenzen
    });

    setupTabs('statistics');
    setupLeaderboardTabs(userData);
    setupLeaderboardToggle(userData);

    // Gespeicherte Paarungen laden, wenn Wettkampf-Tab geöffnet wird
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            if (tabName === 'matches') {
                loadSavedPairings(supabase, userData.clubId);
            }
        });
    });

    initInvitationCodeManagement(supabase, userData.clubId, userData.id);

    // Supabase-Instanz statt auth/functions übergeben
    initPlayerInvitationManagement(supabase, null, null, userData.clubId, userData.id, userData.activeSportId);

    // Für intelligente Punkteverteilung
    initializeTrainingCompletion(supabase, userData);

    // Bridge-Funktion: Verbindet Trainingsplan mit Anwesenheits-Modul
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

    // Statistik initial laden (Standard-Tab)
    loadStatistics(userData, supabase, currentSubgroupFilter);

    const statisticsTabButton = document.querySelector('.tab-button[data-tab="statistics"]');
    if (statisticsTabButton) {
        statisticsTabButton.addEventListener('click', () => {
            loadStatistics(userData, supabase, currentSubgroupFilter);
        });
    }

    const subgroupsTabButton = document.querySelector('.tab-button[data-tab="subgroups"]');
    if (subgroupsTabButton) {
        subgroupsTabButton.addEventListener('click', () => {
            loadSubgroupsList(userData.clubId, supabase, unsub => {
                if (unsubscribeSubgroups) unsubscribeSubgroups();
                unsubscribeSubgroups = unsub;
            });
        });
    }

    loadPlayersForDropdown(userData.clubId, supabase, userData.activeSportId);
    loadChallengesForDropdown(userData.clubId, supabase, currentSubgroupFilter);
    loadExercisesForDropdown(supabase);
    loadActiveChallenges(userData.clubId, supabase, currentSubgroupFilter);
    loadExpiredChallenges(userData.clubId, supabase);
    setExerciseContext(supabase, userData.id, userData.role, userData.clubId, userData.activeSportId);
    loadAllExercises(supabase);

    populateSubgroupDropdown(userData.clubId, 'challenge-subgroup', supabase);
    populateSubgroupDropdown(userData.clubId, 'reactivate-challenge-subgroup', supabase);
    loadPlayersForAttendance(userData.clubId, supabase, players => {
        clubPlayers = players; // WICHTIG: clubPlayers wird hier global befüllt
        populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter, true); // inkl. Offline-Spieler
        populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
        populateHistoryFilterDropdown(clubPlayers);
        updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter, userData.id); // Coach ausschließen
    });

    // Set-Eingabe für Singles und Doubles
    const setScoreInput = await initializeCoachSetScoreInput(userData.id);

    initializeDoublesCoachUI();
    setDoublesUserId(userData.id); // Für Sport-Kontext in Doubles
    if (setScoreInput) {
        setDoublesSetScoreInput(setScoreInput);
    }

    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);

    // Kalender neu laden bei Training-Absage
    window.addEventListener('trainingCancelled', () => {
        console.log('[Coach] Training cancelled, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Kalender neu laden bei Training-Erstellung
    window.addEventListener('trainingCreated', () => {
        console.log('[Coach] Training created, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Kalender neu laden bei Event-Erstellung
    window.addEventListener('event-created', () => {
        console.log('[Coach] Event created, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Kalender neu laden bei Event-Änderung/Löschung
    window.addEventListener('event-changed', () => {
        console.log('[Coach] Event changed/deleted, reloading calendar...');
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Bei Änderung der Spieler-Untergruppen: clubPlayers neu laden
    window.addEventListener('playerSubgroupsChanged', () => {
        console.log('[Coach] Player subgroups changed, reloading clubPlayers...');
        loadPlayersForAttendance(userData.clubId, supabase, players => {
            clubPlayers = players;
            console.log('[Coach] clubPlayers refreshed with', players.length, 'players');
            populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter, true); // inkl. Offline-Spieler
            populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
            updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter, userData.id);
            updatePairingsButtonState(clubPlayers, currentSubgroupFilter);
        });
    });

    // Bei Änderung von Untergruppen: Filter-Dropdown aktualisieren
    window.addEventListener('subgroupsChanged', () => {
        console.log('[Coach] Subgroups changed, refreshing filter dropdown...');
        populateSubgroupFilter(userData.clubId, supabase);
    });

    // Benachrichtigungen dynamisch und non-blocking laden
    try {
        notificationsModule = await import('./notifications-supabase.js');
        if (notificationsModule.initNotifications) {
            notificationsModule.initNotifications(userData.id);
        }
    } catch (e) {
        console.warn('Notifications not available:', e);
    }

    // Push-Benachrichtigungen dynamisch und non-blocking laden
    try {
        const pushModule = await import('./push-notifications-manager.js');
        if (pushModule.initPushNotifications) {
            pushModule.initPushNotifications(userData.id);
        }

        // Push-Berechtigung nach Verzögerung anzeigen (nur falls nicht bereits aktiviert)
        setTimeout(async () => {
            if (pushModule.shouldShowPushPrompt && await pushModule.shouldShowPushPrompt()) {
                await pushModule.showPushPermissionPrompt();
            }
        }, 3000);
    } catch (e) {
        console.warn('Push notifications not available:', e);
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
                // SPA-Cache leeren um Zurück-Navigation zu verhindern
                if (window.spaEnhancer) {
                    window.spaEnhancer.clearCache();
                }
                // replace() statt href um History zu löschen
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

    // Spieler-Modal
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

    // Offline-Spieler hinzufügen Modal
    document.getElementById('add-offline-player-button').addEventListener('click', async () => {
        document.getElementById('add-offline-player-modal').classList.remove('hidden');
        document.getElementById('add-offline-player-modal').classList.add('flex');

        initOfflinePlayerBirthdateSelects();

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
        // Reset inklusive Checkboxen
        document.getElementById('add-offline-player-form').reset();
    });

    // Spieler bearbeiten Modal
    document
        .getElementById('close-edit-player-modal-button')
        .addEventListener('click', () =>
            document.getElementById('edit-player-modal').classList.add('hidden')
        );
    document
        .getElementById('save-player-subgroups-button')
        .addEventListener('click', () => handleSavePlayerSubgroups(supabase));

    // Anwesenheits-Modal
    document.getElementById('close-attendance-modal-button').addEventListener('click', () => {
        document.getElementById('attendance-modal').classList.add('hidden');
        // Kalender neu laden, um neu erstellte Sessions anzuzeigen (auch ohne gespeicherte Anwesenheit)
        if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
            calendarUnsubscribe();
        }
        calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);
    });

    // Beschreibungs-Editor VOR Event-Handler initialisieren
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

    // Auto-Berechnung basierend auf Level + Schwierigkeit
    setupExercisePointsCalculation();

    setupExerciseMilestones();

    initializeExercisePartnerSystemCoach();

    // Empfehlungen basierend auf Dauer
    setupChallengePointRecommendations();

    setupChallengeMilestones();

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

    document.getElementById('reason-select').addEventListener('change', handleReasonChange);

    // Für Übungen/Challenges bei Punktevergabe
    setupMilestoneSelectors(supabase);

    // Für manuelle Punktevergabe
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

    // Anwesenheits-Export
    document.getElementById('export-attendance-btn').addEventListener('click', async () => {
        await exportAttendanceToExcel(supabase, userData.clubId, currentCalendarDate, currentSubgroupFilter);
    });
    document.getElementById('export-attendance-summary-btn').addEventListener('click', async () => {
        await exportAttendanceSummary(supabase, userData.clubId, currentCalendarDate, currentSubgroupFilter);
    });

    document
        .getElementById('calendar-grid')
        .addEventListener('click', async (e) => {
            const dayCell = e.target.closest('.calendar-day');
            if (!dayCell || dayCell.classList.contains('disabled')) return;

            const dateString = dayCell.dataset.date;
            if (!dateString) return;

            try {
                const { data: singleEvents, error: singleError } = await supabase
                    .from('events')
                    .select('id, title, start_time, end_time, location, target_type, target_subgroup_ids, event_type')
                    .eq('club_id', userData.clubId)
                    .eq('start_date', dateString)
                    .eq('cancelled', false)
                    .or('event_type.eq.single,event_type.is.null')
                    .order('start_time');

                if (singleError) throw singleError;

                const clickedDate = new Date(dateString + 'T12:00:00');
                const clickedDayOfWeek = clickedDate.getDay();
                const clickedDayOfMonth = clickedDate.getDate();

                const { data: recurringEvents, error: recurringError } = await supabase
                    .from('events')
                    .select('id, title, start_time, end_time, location, target_type, target_subgroup_ids, event_type, repeat_type, repeat_end_date, start_date')
                    .eq('club_id', userData.clubId)
                    .eq('cancelled', false)
                    .eq('event_type', 'recurring')
                    .lte('start_date', dateString)
                    .or(`repeat_end_date.gte.${dateString},repeat_end_date.is.null`);

                if (recurringError) throw recurringError;

                const matchingRecurringEvents = (recurringEvents || []).filter(event => {
                    const eventStartDate = new Date(event.start_date + 'T12:00:00');
                    const eventDayOfWeek = eventStartDate.getDay();
                    const eventDayOfMonth = eventStartDate.getDate();

                    if (event.repeat_type === 'weekly') {
                        return clickedDayOfWeek === eventDayOfWeek;
                    } else if (event.repeat_type === 'daily') {
                        return true;
                    } else if (event.repeat_type === 'monthly') {
                        return clickedDayOfMonth === eventDayOfMonth;
                    }
                    return false;
                });

                const allEvents = [...(singleEvents || []), ...matchingRecurringEvents];

                const eventsWithInfo = await Promise.all(allEvents.map(async (event) => {
                    let subgroupNames = [];
                    let subgroupColor = '#6366f1';

                    if (event.target_type === 'subgroups' && event.target_subgroup_ids && event.target_subgroup_ids.length > 0) {
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
                        subgroupColor,
                        isRecurring: event.event_type === 'recurring'
                    };
                }));

                eventsWithInfo.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

                openEventDayModal(dateString, eventsWithInfo);

            } catch (error) {
                console.error('[Coach] Error loading events for day:', error);
                alert('Fehler beim Laden der Veranstaltungen. Bitte versuche es erneut.');
            }
        });

    // Global verfügbar für Event-Day-Modal
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

    // Event Delegation: Listener am Container, nicht an einzelnen Checkboxen
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
    initializeHandicapToggle(); // Für automatische Score-Setzung
    document
        .getElementById('subgroups-list')
        .addEventListener('click', e => handleSubgroupActions(e, supabase, userData.clubId));

    // Event-Handler für Aktions-Buttons (Desktop)
    const handleActionClick = async e => {
        const button = e.target.closest('button');
        if (!button) return;

        await handlePlayerListActions(e, supabase, userData);

        if (button.classList.contains('edit-subgroups-btn')) {
            const playerId = button.dataset.id;
            let player = clubPlayers.find(p => p.id === playerId);

            // Falls nicht im Cache, aus DB laden
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

    const actionsDesktop = document.getElementById('player-detail-actions-desktop');
    if (actionsDesktop) {
        actionsDesktop.addEventListener('click', handleActionClick);
    }

    const actionsMobile = document.getElementById('player-detail-actions-mobile');
    if (actionsMobile) {
        actionsMobile.addEventListener('click', handleActionClick);
    }

    const closeMobileBtn = document.getElementById('close-player-detail-mobile');
    if (closeMobileBtn) {
        closeMobileBtn.addEventListener('click', () => {
            document.getElementById('player-detail-mobile-modal').classList.add('hidden');
        });
    }

    // Suchleiste im Spieler-Modal
    document.getElementById('player-search-input').addEventListener('keyup', e => {
        const searchTerm = e.target.value.toLowerCase();
        const items = document.querySelectorAll('#modal-player-list .player-list-item');
        items.forEach(item => {
            const name = item.dataset.playerName;
            if (name.includes(searchTerm)) {
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Filter
    document.getElementById('history-player-filter').addEventListener('change', e => {
        loadPointsHistoryForCoach(e.target.value, supabase, unsub => {
            if (unsubscribePointsHistory) unsubscribePointsHistory();
            unsubscribePointsHistory = unsub;
        });
    });

    document.getElementById('player-select').addEventListener('change', e => {
        updateCoachGrundlagenDisplay(e.target.value, supabase);
    });

    populateSubgroupFilter(userData.clubId, supabase);
    document.getElementById('subgroup-filter').addEventListener('change', e => {
        currentSubgroupFilter = e.target.value;
        handleSubgroupFilterChange(userData);
    });

    const genderFilterDropdown = document.getElementById('coach-gender-filter');
    if (genderFilterDropdown) {
        genderFilterDropdown.addEventListener('change', e => {
            currentGenderFilter = e.target.value;
            handleGenderFilterChange(userData);
        });
    }

    // Sport-ID für sportspezifischen Countdown übergeben
    const activeSportId = userData.activeSportId || null;
    updateSeasonCountdown('season-countdown-coach', false, supabase, activeSportId);
    setInterval(() => updateSeasonCountdown('season-countdown-coach', false, supabase, activeSportId), 1000);
    setInterval(updateAllCountdowns, 1000);
}

/**
 * Füllt Untergruppen-Filter mit Altersgruppen und benutzerdefinierten Untergruppen
 */
function populateSubgroupFilter(clubId, db) {
    const select = document.getElementById('subgroup-filter');
    if (!select) return;

    loadSubgroupsForFilter();

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

            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = 'Alle (Gesamtverein)';
            select.appendChild(allOption);

            const youthGroup = document.createElement('optgroup');
            youthGroup.label = 'Jugend (nach Alter)';
            AGE_GROUPS.youth.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                youthGroup.appendChild(option);
            });
            select.appendChild(youthGroup);

            AGE_GROUPS.adults.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                select.appendChild(option);
            });

            const seniorGroup = document.createElement('optgroup');
            seniorGroup.label = 'Senioren (nach Alter)';
            AGE_GROUPS.seniors.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.label;
                seniorGroup.appendChild(option);
            });
            select.appendChild(seniorGroup);

            // Geschlecht wird von separatem coach-gender-filter Dropdown behandelt

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

            // Vorherige Auswahl wiederherstellen falls noch vorhanden
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
 * Behandelt Untergruppen-Filteränderungen
 */
function handleSubgroupFilterChange(userData) {
    console.log(`[Coach] Subgroup filter changed to: ${currentSubgroupFilter}`);

    setAttendanceSubgroupFilter(currentSubgroupFilter);

    // Beide Filter übergeben
    setLeaderboardSubgroupFilter(currentSubgroupFilter);
    setLeaderboardGenderFilter(currentGenderFilter);

    if (calendarUnsubscribe && typeof calendarUnsubscribe === 'function') {
        calendarUnsubscribe();
    }
    calendarUnsubscribe = renderCalendar(currentCalendarDate, userData);

    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    loadActiveChallenges(userData.clubId, supabase, currentSubgroupFilter);
    loadChallengesForDropdown(userData.clubId, supabase, currentSubgroupFilter);

    // Coach aus Dropdown ausschließen, beide Filter anwenden
    populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter, true); // inkl. Offline-Spieler
    populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);

    // Coach aus Dropdown ausschließen
    updatePointsPlayerDropdown(clubPlayers, currentSubgroupFilter, userData.id);

    updatePairingsButtonState(clubPlayers, currentSubgroupFilter);

    // Statistik neu laden falls Tab aktiv
    const statisticsTab = document.getElementById('tab-content-statistics');
    if (statisticsTab && !statisticsTab.classList.contains('hidden')) {
        loadStatistics(userData, supabase, currentSubgroupFilter);
    }
}

/**
 * Behandelt Geschlechts-Filteränderungen
 */
function handleGenderFilterChange(userData) {
    console.log(`[Coach] Gender filter changed to: ${currentGenderFilter}`);

    setLeaderboardGenderFilter(currentGenderFilter);

    loadLeaderboard(userData, supabase, []);
    loadGlobalLeaderboard(userData, supabase, []);

    // Mit aktuellem Untergruppen-Filter kombinieren
    populateMatchDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter, true); // inkl. Offline-Spieler
    populateDoublesDropdowns(clubPlayers, currentSubgroupFilter, userData.id, currentGenderFilter);
}

// Global verfügbar (aufgerufen via onclick in HTML)
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

document.getElementById('close-reactivate-modal')?.addEventListener('click', () => {
    document.getElementById('reactivate-challenge-modal').classList.add('hidden');
    document.getElementById('reactivate-challenge-modal').classList.remove('flex');
});
