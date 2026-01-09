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
import { initializeMatchRequestForm, loadPlayerMatchRequests } from './player-matches.js';
import { initializeDoublesPlayerUI, populateDoublesPlayerDropdowns } from './doubles-player-ui.js';
import { confirmDoublesMatchRequest, rejectDoublesMatchRequest } from './doubles-matches.js';
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

let currentUserData = null;
let clubPlayers = [];
let unsubscribes = [];
let currentDisplayDate = new Date();
let currentSubgroupFilter = 'club';
let matchSuggestionsUnsubscribes = [];
let rivalListener = null;
let calendarListener = null;
let subgroupFilterListener = null;
let streaksListener = null;

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
            window.location.replace('/index.html');
        }
    });
});

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

async function initializeDashboard(userData) {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');
    const welcomeMessage = document.getElementById('welcome-message');
    const logoutButton = document.getElementById('logout-button');

    welcomeMessage.textContent = `Willkommen, ${userData.firstName || userData.email}!`;

    renderLeaderboardHTML('leaderboard-content-wrapper', {
        showToggle: false,
    });

    await populatePlayerSubgroupFilter(userData, db);
    loadOverviewData(userData, db, unsubscribes, null, loadChallenges, loadPointsHistory);
    initializeWidgetSystem(db, userData.id);
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

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

    setExerciseContext(db, userData.id, userData.role);
    loadExercises(db, unsubscribes);

    import('./leaderboard.js').then(({ setLeaderboardSubgroupFilter }) => {
        setLeaderboardSubgroupFilter('all');
    });
    loadLeaderboard(userData, db, unsubscribes);
    loadGlobalLeaderboard(userData, db, unsubscribes);
    loadTodaysMatches(userData, db, unsubscribes);

    loadTopXPPlayers(userData.clubId, db);
    loadTopWinsPlayers(userData.clubId, db);

    await loadClubPlayers(userData, db);

    initializeMatchRequestForm(userData, db, clubPlayers);

    initializeDoublesPlayerUI();
    populateDoublesPlayerDropdowns(clubPlayers, userData.id);

    loadPlayerMatchRequests(userData, db, unsubscribes);
    loadOverviewMatchRequests(userData, db, unsubscribes);

    loadMatchHistory(db, userData, 'singles');

    window.reloadMatchHistory = matchType => {
        loadMatchHistory(db, userData, matchType);
    };

    loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);

    updateSeasonCountdown('season-countdown', true, db);
    setInterval(() => updateSeasonCountdown('season-countdown', true, db), 1000);

    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            if (window.spaEnhancer) {
                window.spaEnhancer.clearCache();
            }
            window.location.replace('/index.html');
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
    setupTabs('overview');
    setupLeaderboardTabs();

    initializeLeaderboardPreferences(userData, db);
    applyPreferences();

    const subgroupFilterDropdown = document.getElementById('player-subgroup-filter');
    if (subgroupFilterDropdown) {
        subgroupFilterDropdown.addEventListener('change', () => {
            handlePlayerSubgroupFilterChange(userData, db, unsubscribes);
        });
    }

    document.getElementById('exercises-list').addEventListener('click', handleExerciseClick);
    document.getElementById('close-exercise-modal').addEventListener('click', closeExerciseModal);
    document.getElementById('exercise-modal').addEventListener('click', e => {
        if (e.target === document.getElementById('exercise-modal')) closeExerciseModal();
    });

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

    document.getElementById('prev-month').addEventListener('click', () => {
        currentDisplayDate.setMonth(currentDisplayDate.getMonth() - 1);
        if (calendarListener && typeof calendarListener === 'function') {
            try {
                calendarListener();
            } catch (e) {
                console.error('Error unsubscribing calendar listener:', e);
            }
        }
        calendarListener = renderCalendar(
            currentDisplayDate,
            currentUserData,
            db,
            currentSubgroupFilter
        );
    });
    document.getElementById('next-month').addEventListener('click', () => {
        currentDisplayDate.setMonth(currentDisplayDate.getMonth() + 1);
        if (calendarListener && typeof calendarListener === 'function') {
            try {
                calendarListener();
            } catch (e) {
                console.error('Error unsubscribing calendar listener:', e);
            }
        }
        calendarListener = renderCalendar(
            currentDisplayDate,
            currentUserData,
            db,
            currentSubgroupFilter
        );
    });

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

    checkAndStartTutorial(userData);
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

    populatePlayerSubgroupFilter(userData, db);


}







function populatePlayerSubgroupFilter(userData, db) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const subgroupIDs = userData.subgroupIDs || [];

    const currentSelection = dropdown.value;

    if (subgroupFilterListener && typeof subgroupFilterListener === 'function') {
        try {
            subgroupFilterListener();
        } catch (e) {
            console.error('Error unsubscribing subgroup filter listener:', e);
        }
    }

    if (subgroupIDs.length === 0) {
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

                const userSubgroups = allSubgroups.filter(
                    sg => subgroupIDs.includes(sg.id) && !sg.isDefault
                );

                const clubOption = createOption('club', '🏠 Mein Verein');
                const globalOption = createOption('global', '🌍 Global');
                dropdown.innerHTML = '';

                if (userSubgroups.length > 0) {
                    userSubgroups.forEach(subgroup => {
                        const option = createOption(
                            `subgroup:${subgroup.id}`,
                            `👥 ${subgroup.name}`
                        );
                        dropdown.appendChild(option);
                    });
                }

                dropdown.appendChild(clubOption);
                dropdown.appendChild(globalOption);

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


function createOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}


function handlePlayerSubgroupFilterChange(userData, db, unsubscribes) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const selectedValue = dropdown.value;

    if (selectedValue === 'club') {
        currentSubgroupFilter = 'club';
    } else if (selectedValue === 'global') {
        currentSubgroupFilter = 'global';
    } else if (selectedValue.startsWith('subgroup:')) {
        currentSubgroupFilter = selectedValue.replace('subgroup:', '');
    }

    console.log(`[Player] Subgroup filter changed to: ${currentSubgroupFilter}`);

    if (rivalListener && typeof rivalListener === 'function') {
        try {
            rivalListener();
        } catch (e) {
            console.error('Error unsubscribing rival listener:', e);
        }
    }
    rivalListener = loadRivalData(userData, db, currentSubgroupFilter);

    import('./leaderboard.js').then(
        ({
            setLeaderboardSubgroupFilter,
            loadLeaderboard: loadLB,
            loadGlobalLeaderboard: loadGlobalLB,
        }) => {
            if (currentSubgroupFilter === 'club') {
                setLeaderboardSubgroupFilter('all');
                loadLB(userData, db, unsubscribes);
            } else if (currentSubgroupFilter === 'global') {
                loadGlobalLB(userData, db, unsubscribes);
            } else {
                setLeaderboardSubgroupFilter(currentSubgroupFilter);
                loadLB(userData, db, unsubscribes);
            }
        }
    );

    if (calendarListener && typeof calendarListener === 'function') {
        try {
            calendarListener();
        } catch (e) {
            console.error('Error unsubscribing calendar listener:', e);
        }
    }
    calendarListener = renderCalendar(currentDisplayDate, userData, db, currentSubgroupFilter);

    matchSuggestionsUnsubscribes.forEach(unsub => {
        try {
            if (typeof unsub === 'function') unsub();
        } catch (e) {
            console.error('Error unsubscribing match suggestions listener:', e);
        }
    });
    matchSuggestionsUnsubscribes = [];

    loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);
}


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


function loadOverviewMatchRequests(userData, db, unsubscribes) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    let allItems = [];
    let showAll = false;

    const incomingRequestsQuery = query(
        collection(db, 'matchRequests'),
        where('playerBId', '==', userData.id),
        where('status', '==', 'pending_player')
    );

    const doublesRequestsQuery = query(
        collection(db, 'doublesMatchRequests'),
        where('clubId', '==', userData.clubId),
        where('status', '==', 'pending_opponent')
    );

    let singlesData = [];
    let doublesData = [];

    const unsubSingles = onSnapshot(incomingRequestsQuery, async singlesSnapshot => {
        singlesData = [];

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

        combineAndRender();
    });

    const unsubDoubles = onSnapshot(doublesRequestsQuery, async doublesSnapshot => {
        doublesData = [];

        for (const docSnap of doublesSnapshot.docs) {
            const data = docSnap.data();

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

        combineAndRender();
    });

    function combineAndRender() {
        allItems = [...singlesData, ...doublesData];

        allItems.sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
        });

        renderCombinedOverview(allItems, userData, db, showAll);
        updateMatchRequestBadge(allItems.length);
    }

    unsubscribes.push(unsubSingles, unsubDoubles);
}


function renderCombinedOverview(items, userData, db, showAll) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML =
            '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
        return;
    }

    const itemsToShow = showAll ? items : items.slice(0, 3);

    itemsToShow.forEach(item => {
        const card = document.createElement('div');
        card.className = 'bg-white border-2 border-blue-300 bg-blue-50 rounded-lg p-3 shadow-sm';

        if (item.matchType === 'doubles') {
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

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-green-700 bg-green-200 px-2 py-1 rounded"><i class="fas fa-users mr-1"></i>Doppel</span>
                </div>
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 text-sm">${teamAName1} & ${teamAName2} vs ${teamBName1} & ${teamBName2}</p>
                        <p class="text-xs text-gray-600">${setsDisplay}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button class="approve-overview-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="doubles">
                        <i class="fas fa-check"></i> Bestätigen
                    </button>
                    <button class="reject-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="doubles">
                        <i class="fas fa-times"></i> Ablehnen
                    </button>
                </div>
            `;
        } else {
            const setsDisplay = formatSetsDisplaySimple(item.data.sets);
            const playerName = item.playerAData?.firstName || 'Unbekannt';

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded"><i class="fas fa-user mr-1"></i>Einzel</span>
                </div>
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 text-sm">${playerName} vs ${userData.firstName}</p>
                        <p class="text-xs text-gray-600">${setsDisplay}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button class="approve-overview-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="singles">
                        <i class="fas fa-check"></i> Akzeptieren
                    </button>
                    <button class="reject-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}" data-match-type="singles">
                        <i class="fas fa-times"></i> Ablehnen
                    </button>
                </div>
            `;
        }

        const approveBtn = card.querySelector('.approve-overview-btn');
        const rejectBtn = card.querySelector('.reject-overview-btn');

        approveBtn.addEventListener('click', async () => {
            const matchType = approveBtn.getAttribute('data-match-type');
            if (matchType === 'doubles') {
                await approveDoublesOverviewRequest(item.id, userData.id, db);
            } else {
                await approveOverviewRequest(item.id, db);
            }
        });

        rejectBtn.addEventListener('click', async () => {
            const matchType = rejectBtn.getAttribute('data-match-type');
            if (matchType === 'doubles') {
                await rejectDoublesOverviewRequest(item.id, db);
            } else {
                await rejectOverviewRequest(item.id, db);
            }
        });

        container.appendChild(card);
    });

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


function formatSetsDisplaySimple(sets) {
    if (!sets || sets.length === 0) return 'Kein Ergebnis';

    const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
    const winsA = sets.filter(s => s.playerA > s.playerB && s.playerA >= 11).length;
    const winsB = sets.filter(s => s.playerB > s.playerA && s.playerB >= 11).length;

    return `${winsA}:${winsB} (${setsStr})`;
}


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


async function approveDoublesOverviewRequest(requestId, playerId, db) {
    try {
        await confirmDoublesMatchRequest(requestId, playerId, db);
    } catch (error) {
        console.error('Error approving doubles request:', error);
        alert('Fehler beim Bestätigen der Doppel-Anfrage.');
    }
}


async function rejectDoublesOverviewRequest(requestId, db) {
    try {
        await rejectDoublesMatchRequest(requestId, db);
    } catch (error) {
        console.error('Error rejecting doubles request:', error);
        alert('Fehler beim Ablehnen der Doppel-Anfrage.');
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
