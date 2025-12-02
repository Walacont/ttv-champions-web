// Dashboard - Supabase Version
// SC Champions - Migration von Firebase zu Supabase

import { getSupabase, onAuthStateChange, signOut } from './supabase-init.js';
import {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    updateDoc,
    writeBatch,
    serverTimestamp
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
} from './leaderboard.js';
import {
    loadExercises,
    handleExerciseClick,
    closeExerciseModal,
    setExerciseContext,
} from './exercises.js';
import { setupTabs, updateSeasonCountdown, AGE_GROUPS, GENDER_GROUPS } from './ui-utils.js';
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
import { initializeMatchRequestForm, loadPlayerMatchRequests } from './player-matches.js';
import { initializeDoublesPlayerUI, initializeDoublesPlayerSearch } from './doubles-player-ui.js';
import { confirmDoublesMatchRequest, rejectDoublesMatchRequest, approveDoublesMatchRequest } from './doubles-matches.js';
import { loadMatchSuggestions } from './match-suggestions.js';
import { loadMatchHistory } from './match-history.js';
import { initializeLeaderboardPreferences, applyPreferences } from './leaderboard-preferences.js';
import { initializeWidgetSystem } from './dashboard-widgets.js';
import TutorialManager from './tutorial.js';
import { playerTutorialSteps } from './tutorial-player.js';

// Initialize Supabase
const supabase = getSupabase();

// Fake db object for compatibility with existing modules
// They expect a Firestore db instance
const db = {
    _supabase: true,
    // This allows existing code that passes db to still work
    // The individual modules will need to be updated gradually
};

// --- State ---
let currentUserData = null;
let clubPlayers = [];
let unsubscribes = [];
let currentDisplayDate = new Date();
let currentSubgroupFilter = 'club';
let currentGenderFilter = 'all';
let matchSuggestionsUnsubscribes = [];
let rivalListener = null;
let calendarListener = null;
let subgroupFilterListener = null;
let streaksListener = null;

// --- Main App Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // Use Supabase auth state change
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
            const user = session.user;

            // Clean up old listeners
            unsubscribes.forEach(unsub => {
                if (typeof unsub === 'function') unsub();
            });
            unsubscribes = [];
            matchSuggestionsUnsubscribes.forEach(unsub => {
                if (typeof unsub === 'function') unsub();
            });
            matchSuggestionsUnsubscribes = [];

            try {
                // Get user profile from Supabase
                const userDocRef = doc('profiles', user.id);
                const initialDocSnap = await getDoc(userDocRef);

                if (!initialDocSnap.exists()) {
                    await signOut();
                    return;
                }

                // Setup real-time listener for user profile
                const userListener = onSnapshot(userDocRef, docSnap => {
                    if (docSnap.exists()) {
                        const userData = docSnap.data();
                        if (userData.role === 'player' || userData.role === 'coach') {
                            const isFirstLoad = !currentUserData;
                            currentUserData = { id: docSnap.id, ...userData };
                            if (isFirstLoad) {
                                initializeDashboard(currentUserData);
                            } else {
                                updateDashboard(currentUserData);
                            }
                        } else if (userData.role === 'admin') {
                            window.location.href = '/admin.html';
                        }
                    } else {
                        signOut();
                    }
                });
                unsubscribes.push(userListener);
            } catch (error) {
                console.error('Initial load error:', error);
                await signOut();
            }
        } else {
            window.location.replace('/index.html');
        }
    });
});

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

function showNoClubInfoIfNeeded(userData) {
    const noClubInfoBox = document.getElementById('no-club-info-box');
    const closeBtn = document.getElementById('close-no-club-info');

    if (!noClubInfoBox) return;

    const hasClub = userData.clubId && userData.clubId !== null;
    const hasDismissed = localStorage.getItem('noClubInfoDismissed') === 'true';

    if (!hasClub && !hasDismissed) {
        noClubInfoBox.classList.remove('hidden');
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            noClubInfoBox.classList.add('hidden');
            localStorage.setItem('noClubInfoDismissed', 'true');
        });
    }
}

async function checkAndStartTutorial(userData) {
    const startTutorialFlag = sessionStorage.getItem('startTutorial');
    if (startTutorialFlag === 'player') {
        sessionStorage.removeItem('startTutorial');
        setTimeout(() => window.startPlayerTutorial(), 1000);
        return;
    }

    const tutorialCompleted = userData.tutorialCompleted?.player || false;

    if (!tutorialCompleted) {
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

window.startPlayerTutorial = function () {
    const tutorial = new TutorialManager(playerTutorialSteps, {
        tutorialKey: 'player',
        autoScroll: true,
        scrollOffset: 100,
    });
    tutorial.start();
};

async function setHeaderProfileAndClub(userData) {
    const headerProfilePic = document.getElementById('header-profile-pic');
    const headerClubName = document.getElementById('header-club-name');

    if (userData.photoURL || userData.avatarUrl) {
        headerProfilePic.src = userData.photoURL || userData.avatarUrl;
    } else {
        const initials = `${userData.firstName?.[0] || ''}${userData.lastName?.[0] || ''}` || 'U';
        headerProfilePic.src = `https://placehold.co/80x80/e2e8f0/64748b?text=${initials}`;
    }

    if (userData.clubId) {
        try {
            const clubDoc = await getDoc(doc('clubs', userData.clubId));
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

    try {
        welcomeMessage.textContent = `Willkommen, ${userData.firstName || userData.email}!`;

        const switchToCoachBtn = document.getElementById('switch-to-coach-btn');
        if (switchToCoachBtn && userData.role === 'coach') {
            switchToCoachBtn.classList.remove('hidden');
        }

        await setHeaderProfileAndClub(userData);

        renderLeaderboardHTML('leaderboard-content-wrapper', {
            showToggle: true,
            userData: userData,
        });

        await populatePlayerSubgroupFilter(userData);

        const challengesAccess = checkFeatureAccess('challenges', userData);
        const challengesLoader = challengesAccess.allowed ? loadChallenges : null;

        // Note: These functions still expect Firebase db
        // They will need to be updated to use Supabase directly
        loadOverviewData(userData, db, unsubscribes, null, challengesLoader, loadPointsHistory);

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

        initializeWidgetSystem(db, userData.id, userData);

        rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

        const attendanceAccess = checkFeatureAccess('attendance', userData);

        if (attendanceAccess.allowed) {
            streaksListener = loadProfileData(
                userData,
                date => {
                    if (calendarListener && typeof calendarListener === 'function') {
                        try {
                            calendarListener();
                        } catch (e) {
                            console.error('Error unsubscribing calendar listener:', e);
                        }
                    }
                    calendarListener = renderCalendar(date, userData, db, currentSubgroupFilter);
                },
                currentDisplayDate,
                db
            );
        } else {
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
        }

        setExerciseContext(db, userData.id, userData.role, userData.clubId);
        loadExercises(db, unsubscribes);

        setupTabs('overview');
        setupLeaderboardTabs(userData);
        setupLeaderboardToggle(userData);

        initializeLeaderboardPreferences(userData, db);
        applyPreferences();

        import('./leaderboard.js').then(({ setLeaderboardSubgroupFilter, setLeaderboardGenderFilter }) => {
            setLeaderboardSubgroupFilter('all');
            setLeaderboardGenderFilter('all');
        });

        loadLeaderboard(userData, db, unsubscribes);
        loadGlobalLeaderboard(userData, db, unsubscribes);
        loadTodaysMatches(userData, db, unsubscribes);

        loadTopXPPlayers(userData.clubId, db);
        loadTopWinsPlayers(userData.clubId, db);

        await loadClubPlayers(userData);

        initializeMatchRequestForm(userData, db, clubPlayers, unsubscribes);
        initializeDoublesPlayerUI();
        initializeDoublesPlayerSearch(db, userData);

        loadPlayerMatchRequests(userData, db, unsubscribes);
        loadOverviewMatchRequests(userData, unsubscribes);

        loadMatchHistory(db, userData, 'singles');

        window.reloadMatchHistory = matchType => {
            loadMatchHistory(db, userData, matchType);
        };

        loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);

        updateSeasonCountdown('season-countdown', true, db);
        setInterval(() => updateSeasonCountdown('season-countdown', true, db), 1000);

        logoutButton.addEventListener('click', async () => {
            try {
                await signOut();
                if (window.spaEnhancer) {
                    window.spaEnhancer.clearCache();
                }
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });

        const subgroupFilterDropdown = document.getElementById('player-subgroup-filter');
        if (subgroupFilterDropdown) {
            subgroupFilterDropdown.addEventListener('change', () => {
                handlePlayerSubgroupFilterChange(userData, unsubscribes);
            });
        }

        const genderFilterDropdown = document.getElementById('player-gender-filter');
        if (genderFilterDropdown) {
            genderFilterDropdown.addEventListener('change', () => {
                handleGenderFilterChange(userData, unsubscribes);
            });
        }

        document.getElementById('exercises-list').addEventListener('click', handleExerciseClick);
        document.getElementById('close-exercise-modal').addEventListener('click', closeExerciseModal);
        document.getElementById('exercise-modal').addEventListener('click', e => {
            if (e.target === document.getElementById('exercise-modal')) closeExerciseModal();
        });

        const toggleAbbreviations = document.getElementById('toggle-abbreviations');
        const abbreviationsContent = document.getElementById('abbreviations-content');
        if (toggleAbbreviations && abbreviationsContent) {
            toggleAbbreviations.addEventListener('click', () => {
                const isHidden = abbreviationsContent.classList.contains('hidden');
                abbreviationsContent.classList.toggle('hidden');
            });
        }

        document.getElementById('challenges-list').addEventListener('click', e => {
            const card = e.target.closest('.challenge-card');
            if (card) {
                openChallengeModal(card.dataset);
            }
        });

        document.getElementById('close-challenge-modal').addEventListener('click', () =>
            document.getElementById('challenge-modal').classList.add('hidden')
        );

        document.getElementById('toggle-match-suggestions').addEventListener('click', () => {
            const content = document.getElementById('match-suggestions-content');
            const chevron = document.getElementById('suggestions-chevron');
            const isHidden = content.classList.contains('hidden');

            content.classList.toggle('hidden');
            chevron.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        const togglePreferencesBtn = document.getElementById('toggle-leaderboard-preferences');
        if (togglePreferencesBtn) {
            togglePreferencesBtn.addEventListener('click', () => {
                const content = document.getElementById('leaderboard-preferences-content');
                const chevron = document.getElementById('preferences-chevron');
                content.classList.toggle('hidden');
                chevron.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            });
        }

        const hasClubForCalendar = currentUserData.clubId !== null && currentUserData.clubId !== undefined;
        if (hasClubForCalendar) {
            document.getElementById('prev-month').addEventListener('click', () => {
                currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
                if (calendarListener && typeof calendarListener === 'function') {
                    try { calendarListener(); } catch (e) {}
                }
                calendarListener = renderCalendar(currentDisplayDate, currentUserData, db, currentSubgroupFilter);
            });
            document.getElementById('next-month').addEventListener('click', () => {
                currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
                if (calendarListener && typeof calendarListener === 'function') {
                    try { calendarListener(); } catch (e) {}
                }
                calendarListener = renderCalendar(currentDisplayDate, currentUserData, db, currentSubgroupFilter);
            });
        }

        console.log('[Dashboard] Supabase version initialized');

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

        showNoClubInfoIfNeeded(userData);
        checkAndStartTutorial(userData);

    } catch (error) {
        console.error('[Dashboard] Initialization error:', error);
        const errorContainer = document.createElement('div');
        errorContainer.className = 'fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-50';
        errorContainer.innerHTML = `
            <strong>Fehler beim Laden</strong>
            <p class="text-sm">Bitte lade die Seite neu.</p>
            <button onclick="location.reload()" class="mt-2 bg-red-600 text-white px-3 py-1 rounded text-sm">Neu laden</button>
        `;
        document.body.appendChild(errorContainer);

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    }
}

function updateDashboard(userData) {
    const playerPointsEl = document.getElementById('player-points');
    const playerXpEl = document.getElementById('player-xp');
    const playerEloEl = document.getElementById('player-elo');

    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;

    updateRankDisplay(userData);
    updateGrundlagenDisplay(userData);
    populatePlayerSubgroupFilter(userData);
}

async function populatePlayerSubgroupFilter(userData) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const hasClub = userData.clubId !== null && userData.clubId !== undefined;
    const subgroupIDs = userData.subgroupIDs || [];
    const currentSelection = dropdown.value;

    if (subgroupFilterListener && typeof subgroupFilterListener === 'function') {
        try { subgroupFilterListener(); } catch (e) {}
    }

    if (!hasClub) {
        dropdown.innerHTML = '';
        dropdown.appendChild(createOption('global', 'Global'));
        dropdown.value = 'global';
        return;
    }

    if (subgroupIDs.length === 0) {
        dropdown.innerHTML = '';
        dropdown.appendChild(createOption('club', 'Mein Verein'));
        dropdown.appendChild(createOption('global', 'Global'));
        dropdown.value = currentSelection || 'club';
        return;
    }

    try {
        // Query subgroups using Supabase directly
        const { data: allSubgroups, error } = await supabase
            .from('subgroups')
            .select('*')
            .eq('club_id', userData.clubId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        const userSubgroups = (allSubgroups || []).filter(
            sg => subgroupIDs.includes(sg.id) && !sg.is_default
        );

        dropdown.innerHTML = '';
        dropdown.appendChild(createOption('club', 'Mein Verein'));
        dropdown.appendChild(createOption('global', 'Global'));

        const youthGroup = document.createElement('optgroup');
        youthGroup.label = 'Jugend (nach Alter)';
        AGE_GROUPS.youth.forEach(group => {
            youthGroup.appendChild(createOption(group.id, group.label));
        });
        dropdown.appendChild(youthGroup);

        AGE_GROUPS.adults.forEach(group => {
            dropdown.appendChild(createOption(group.id, group.label));
        });

        const seniorGroup = document.createElement('optgroup');
        seniorGroup.label = 'Senioren (nach Alter)';
        AGE_GROUPS.seniors.forEach(group => {
            seniorGroup.appendChild(createOption(group.id, group.label));
        });
        dropdown.appendChild(seniorGroup);

        if (userSubgroups.length > 0) {
            const customGroup = document.createElement('optgroup');
            customGroup.label = 'Meine Untergruppen im Verein';
            userSubgroups.forEach(subgroup => {
                customGroup.appendChild(createOption(`subgroup:${subgroup.id}`, subgroup.name));
            });
            dropdown.appendChild(customGroup);
        }

        const validValues = Array.from(dropdown.options).map(opt => opt.value);
        dropdown.value = validValues.includes(currentSelection) ? currentSelection : 'club';

    } catch (error) {
        console.error('Error populating subgroup filter:', error);
    }
}

function createOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

function handlePlayerSubgroupFilterChange(userData, unsubscribes) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const selectedValue = dropdown.value;

    if (selectedValue === 'club') {
        currentSubgroupFilter = 'club';
    } else if (selectedValue === 'global') {
        currentSubgroupFilter = 'global';
    } else if (selectedValue.startsWith('subgroup:')) {
        currentSubgroupFilter = selectedValue.replace('subgroup:', '');
    } else {
        currentSubgroupFilter = selectedValue;
    }

    console.log(`[Player] Subgroup filter changed to: ${currentSubgroupFilter}`);

    if (rivalListener && typeof rivalListener === 'function') {
        try { rivalListener(); } catch (e) {}
    }
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

    import('./leaderboard.js').then(({
        setLeaderboardSubgroupFilter,
        setLeaderboardGenderFilter,
        loadLeaderboard: loadLB,
        loadGlobalLeaderboard: loadGlobalLB,
    }) => {
        setLeaderboardGenderFilter(currentGenderFilter);

        if (currentSubgroupFilter === 'club') {
            setLeaderboardSubgroupFilter('all');
            loadLB(userData, db, unsubscribes);
        } else if (currentSubgroupFilter === 'global') {
            setLeaderboardSubgroupFilter('all');
            loadGlobalLB(userData, db, unsubscribes);
        } else {
            setLeaderboardSubgroupFilter(currentSubgroupFilter);
            loadLB(userData, db, unsubscribes);
            loadGlobalLB(userData, db, unsubscribes);
        }
    });

    if (calendarListener && typeof calendarListener === 'function') {
        try { calendarListener(); } catch (e) {}
    }
    calendarListener = renderCalendar(currentDisplayDate, userData, db, currentSubgroupFilter);

    matchSuggestionsUnsubscribes.forEach(unsub => {
        try { if (typeof unsub === 'function') unsub(); } catch (e) {}
    });
    matchSuggestionsUnsubscribes = [];
    loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);
}

function handleGenderFilterChange(userData, unsubscribes) {
    const dropdown = document.getElementById('player-gender-filter');
    if (!dropdown) return;

    currentGenderFilter = dropdown.value;
    console.log(`[Player] Gender filter changed to: ${currentGenderFilter}`);

    import('./leaderboard.js').then(({
        setLeaderboardSubgroupFilter,
        setLeaderboardGenderFilter,
        loadLeaderboard: loadLB,
        loadGlobalLeaderboard: loadGlobalLB,
    }) => {
        setLeaderboardGenderFilter(currentGenderFilter);

        if (currentSubgroupFilter === 'club') {
            setLeaderboardSubgroupFilter('all');
            loadLB(userData, db, unsubscribes);
        } else if (currentSubgroupFilter === 'global') {
            setLeaderboardSubgroupFilter('all');
            loadGlobalLB(userData, db, unsubscribes);
        } else {
            setLeaderboardSubgroupFilter(currentSubgroupFilter);
            loadLB(userData, db, unsubscribes);
            loadGlobalLB(userData, db, unsubscribes);
        }
    });
}

async function loadClubPlayers(userData) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('club_id', userData.clubId)
            .in('role', ['player', 'coach']);

        if (error) throw error;

        clubPlayers = (data || []).map(p => ({
            id: p.id,
            ...p,
            // Map snake_case to camelCase for compatibility
            firstName: p.first_name,
            lastName: p.last_name,
            displayName: p.display_name,
            clubId: p.club_id,
            eloRating: p.elo_rating
        }));
    } catch (error) {
        console.error('Error loading club players:', error);
    }
}

async function loadOverviewMatchRequests(userData, unsubscribes) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    // Simplified version - just show a message for now
    // Full implementation requires updating all match request logic
    try {
        const { data: matchRequests, error } = await supabase
            .from('match_requests')
            .select('*')
            .eq('player_b_id', userData.id)
            .eq('status', 'pending_player');

        if (error) throw error;

        if (!matchRequests || matchRequests.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            return;
        }

        container.innerHTML = `<p class="text-gray-700 text-center py-4">${matchRequests.length} Anfrage(n) ausstehend</p>`;
        updateMatchRequestBadge(matchRequests.length);

    } catch (error) {
        console.error('Error loading match requests:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden</p>';
    }
}

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
