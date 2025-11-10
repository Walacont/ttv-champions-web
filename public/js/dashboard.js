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
import { initializeMatchRequestForm, loadPlayerMatchRequests } from './player-matches.js';
import { initializeMatchProposalForm, loadMatchProposals, loadMatchSuggestions } from './match-proposals.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await user.getIdToken(true);
            unsubscribes.forEach(unsub => unsub());
            unsubscribes = [];
            matchSuggestionsUnsubscribes.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
            matchSuggestionsUnsubscribes = [];
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

    // Load club players for match requests
    await loadClubPlayers(userData, db);

    // Initialize match request functionality
    initializeMatchRequestForm(userData, db, clubPlayers);
    loadPlayerMatchRequests(userData, db, unsubscribes);
    loadOverviewMatchRequests(userData, db, unsubscribes);

    // Initialize match proposals functionality
    initializeMatchProposalForm(userData, db);
    loadMatchProposals(userData, db, unsubscribes);
    loadMatchSuggestions(userData, db, matchSuggestionsUnsubscribes, currentSubgroupFilter);

    // Setup match proposal modal handlers
    const createProposalBtn = document.getElementById('create-match-proposal-btn');
    const proposalModal = document.getElementById('match-proposal-modal');
    const closeProposalModal = document.getElementById('close-match-proposal-modal');

    if (createProposalBtn && proposalModal && closeProposalModal) {
        createProposalBtn.addEventListener('click', () => {
            proposalModal.classList.remove('hidden');
        });

        closeProposalModal.addEventListener('click', () => {
            proposalModal.classList.add('hidden');
        });

        // Close on outside click
        proposalModal.addEventListener('click', (e) => {
            if (e.target === proposalModal) {
                proposalModal.classList.add('hidden');
            }
        });
    }

    // Start season countdown timer
    updateSeasonCountdown('season-countdown', true);
    setInterval(() => updateSeasonCountdown('season-countdown', true), 1000);

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
                toggleAbbreviations.innerHTML = '<svg id="abbreviations-icon" class="w-4 h-4 transform transition-transform" style="transform: rotate(180deg);" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen ausblenden';
            } else {
                abbreviationsContent.classList.add('hidden');
                abbreviationsIcon.style.transform = 'rotate(0deg)';
                toggleAbbreviations.innerHTML = '<svg id="abbreviations-icon" class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> 📖 Abkürzungen anzeigen';
            }
        });
    }
    
    document.getElementById('challenges-list').addEventListener('click', (e) => {
        const card = e.target.closest('.challenge-card');
        if (card) {
            openChallengeModal(card.dataset);
        }
    });
    document.getElementById('close-challenge-modal').addEventListener('click', () => document.getElementById('challenge-modal').classList.add('hidden'));

    // Counter-proposal modal close handlers
    const closeCounterProposal = () => document.getElementById('counter-proposal-modal').classList.add('hidden');
    document.getElementById('close-counter-proposal-modal').addEventListener('click', closeCounterProposal);
    document.getElementById('cancel-counter-proposal').addEventListener('click', closeCounterProposal);
    document.getElementById('counter-proposal-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('counter-proposal-modal')) closeCounterProposal();
    });

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

    // Reload match suggestions with new filter
    // Unsubscribe old listeners
    matchSuggestionsUnsubscribes.forEach(unsub => {
        try {
            if (typeof unsub === 'function') unsub();
        } catch (e) {
            console.error("Error unsubscribing match suggestions listener:", e);
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
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error loading club players:', error);
    }
}

/**
 * Loads both match requests and proposals for overview card
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadOverviewMatchRequests(userData, db, unsubscribes) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    let allItems = [];
    let showAll = false;

    // Query for match result requests (incoming, need my approval)
    // Remove orderBy to avoid composite index requirement - will sort in JavaScript
    const incomingRequestsQuery = query(
        collection(db, 'matchRequests'),
        where('playerBId', '==', userData.id),
        where('status', '==', 'pending_player')
    );

    // Query for match proposals (received) - without orderBy to avoid index requirement
    const receivedProposalsPendingQuery = query(
        collection(db, 'matchProposals'),
        where('recipientId', '==', userData.id),
        where('status', '==', 'pending')
    );

    const receivedProposalsCounterQuery = query(
        collection(db, 'matchProposals'),
        where('recipientId', '==', userData.id),
        where('status', '==', 'counter_proposed')
    );

    // Query for match proposals (sent) - without orderBy to avoid index requirement
    const sentProposalsPendingQuery = query(
        collection(db, 'matchProposals'),
        where('requesterId', '==', userData.id),
        where('status', '==', 'pending')
    );

    const sentProposalsCounterQuery = query(
        collection(db, 'matchProposals'),
        where('requesterId', '==', userData.id),
        where('status', '==', 'counter_proposed')
    );

    // Listen to all queries with debouncing to prevent race conditions
    let refreshTimeout = null;
    const debouncedRefresh = () => {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(() => refreshOverview(), 100);
    };

    const unsubRequests = onSnapshot(incomingRequestsQuery, debouncedRefresh);
    const unsubReceivedPending = onSnapshot(receivedProposalsPendingQuery, debouncedRefresh);
    const unsubReceivedCounter = onSnapshot(receivedProposalsCounterQuery, debouncedRefresh);
    const unsubSentPending = onSnapshot(sentProposalsPendingQuery, debouncedRefresh);
    const unsubSentCounter = onSnapshot(sentProposalsCounterQuery, debouncedRefresh);

    unsubscribes.push(unsubRequests, unsubReceivedPending, unsubReceivedCounter, unsubSentPending, unsubSentCounter);

    async function refreshOverview() {
        const [requestsSnap, receivedPendingSnap, receivedCounterSnap, sentPendingSnap, sentCounterSnap] = await Promise.all([
            getDocs(incomingRequestsQuery),
            getDocs(receivedProposalsPendingQuery),
            getDocs(receivedProposalsCounterQuery),
            getDocs(sentProposalsPendingQuery),
            getDocs(sentProposalsCounterQuery)
        ]);

        allItems = [];

        // Add match result requests (blue border)
        for (const docSnap of requestsSnap.docs) {
            const data = docSnap.data();
            const playerADoc = await getDoc(doc(db, 'users', data.playerAId));
            const playerAData = playerADoc.exists() ? playerADoc.data() : null;
            allItems.push({
                type: 'match-request',
                id: docSnap.id,
                data,
                playerAData,
                createdAt: data.createdAt
            });
        }

        // Add received match proposals (green border, my turn) - combine both status queries
        const receivedProposalsDocs = [...receivedPendingSnap.docs, ...receivedCounterSnap.docs];
        for (const docSnap of receivedProposalsDocs) {
            const data = docSnap.data();
            // Check if it's my turn
            const myTurn = whoseTurnProposal(data) === 'recipient';
            if (myTurn) {
                const requesterDoc = await getDoc(doc(db, 'users', data.requesterId));
                const requesterData = requesterDoc.exists() ? requesterDoc.data() : null;
                allItems.push({
                    type: 'received-proposal',
                    id: docSnap.id,
                    data,
                    requesterData,
                    createdAt: data.createdAt
                });
            }
        }

        // Add sent match proposals (green border, waiting for response) - combine both status queries
        const sentProposalsDocs = [...sentPendingSnap.docs, ...sentCounterSnap.docs];
        for (const docSnap of sentProposalsDocs) {
            const data = docSnap.data();
            // Check if it's their turn (not my turn)
            const myTurn = whoseTurnProposal(data) === 'requester';
            if (!myTurn) {
                const recipientDoc = await getDoc(doc(db, 'users', data.recipientId));
                const recipientData = recipientDoc.exists() ? recipientDoc.data() : null;
                allItems.push({
                    type: 'sent-proposal',
                    id: docSnap.id,
                    data,
                    recipientData,
                    createdAt: data.createdAt
                });
            }
        }

        // Sort by creation date (newest first)
        allItems.sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeB - timeA;
        });

        renderCombinedOverview(allItems, userData, db, showAll);
        updateMatchRequestBadge(allItems.length);
    }

    // Initial load
    refreshOverview();
}

/**
 * Helper function to determine whose turn it is (copied from match-proposals.js logic)
 */
function whoseTurnProposal(proposal) {
    if (proposal.status === 'pending') {
        return 'recipient';
    }

    if (proposal.status === 'counter_proposed' && proposal.counterProposals && proposal.counterProposals.length > 0) {
        const lastCounterProposal = proposal.counterProposals[proposal.counterProposals.length - 1];
        if (lastCounterProposal.proposedBy === proposal.recipientId) {
            return 'requester';
        } else {
            return 'recipient';
        }
    }

    return null;
}

/**
 * Renders combined view of match requests and proposals with color coding
 */
function renderCombinedOverview(items, userData, db, showAll) {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
        return;
    }

    // Show only first 3 unless showAll is true
    const itemsToShow = showAll ? items : items.slice(0, 3);

    itemsToShow.forEach(item => {
        const card = document.createElement('div');

        // Color coding: blue for match-request (result), green for proposals (future match)
        const borderColor = item.type === 'match-request' ? 'border-blue-300' : 'border-green-300';
        const bgColor = item.type === 'match-request' ? 'bg-blue-50' : 'bg-green-50';

        card.className = `bg-white border-2 ${borderColor} ${bgColor} rounded-lg p-3 shadow-sm`;

        if (item.type === 'match-request') {
            // Match result request (blue)
            const setsDisplay = formatSetsDisplaySimple(item.data.sets);
            const playerName = item.playerAData?.firstName || 'Unbekannt';

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded">📊 Ergebnis</span>
                </div>
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <p class="font-semibold text-gray-800 text-sm">${playerName} vs ${userData.firstName}</p>
                        <p class="text-xs text-gray-600">${setsDisplay}</p>
                    </div>
                </div>
                <div class="flex gap-2 mt-2">
                    <button class="approve-overview-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}">
                        <i class="fas fa-check"></i> Akzeptieren
                    </button>
                    <button class="reject-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-request-id="${item.id}">
                        <i class="fas fa-times"></i> Ablehnen
                    </button>
                </div>
            `;

            const approveBtn = card.querySelector('.approve-overview-btn');
            const rejectBtn = card.querySelector('.reject-overview-btn');

            approveBtn.addEventListener('click', async () => {
                await approveOverviewRequest(item.id, db);
            });

            rejectBtn.addEventListener('click', async () => {
                await rejectOverviewRequest(item.id, db);
            });

        } else if (item.type === 'received-proposal') {
            // Received proposal (green, my turn to respond)
            const opponent = item.requesterData?.firstName || 'Unbekannt';
            const latestProposal = getLatestProposalData(item.data);

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">📅 Match-Anfrage</span>
                </div>
                <div class="mb-2">
                    <p class="font-semibold text-gray-800 text-sm">${opponent} <i class="fas fa-arrow-right text-gray-400 mx-1"></i> ${userData.firstName}</p>
                    ${latestProposal.dateTime ? `<p class="text-xs text-gray-600"><i class="fas fa-calendar mr-1"></i>${latestProposal.dateTime}</p>` : ''}
                    ${latestProposal.location ? `<p class="text-xs text-gray-600"><i class="fas fa-map-marker-alt mr-1"></i>${latestProposal.location}</p>` : ''}
                </div>
                <div class="flex gap-1 mt-2">
                    <button class="accept-proposal-overview-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-proposal-id="${item.id}">
                        <i class="fas fa-check"></i> OK
                    </button>
                    <button class="decline-proposal-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-proposal-id="${item.id}">
                        <i class="fas fa-times"></i> Nein
                    </button>
                    <button class="counter-proposal-overview-btn flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-proposal-id="${item.id}">
                        <i class="fas fa-reply"></i> Gegen
                    </button>
                </div>
            `;

            // Import from match-proposals.js
            import('./match-proposals.js').then(module => {
                const acceptBtn = card.querySelector('.accept-proposal-overview-btn');
                const declineBtn = card.querySelector('.decline-proposal-overview-btn');
                const counterBtn = card.querySelector('.counter-proposal-overview-btn');

                if (acceptBtn) acceptBtn.addEventListener('click', () => module.acceptProposal(item.id, db));
                if (declineBtn) declineBtn.addEventListener('click', () => module.declineProposal(item.id, db));
                if (counterBtn) counterBtn.addEventListener('click', () => module.openCounterProposalModal(item.data, item.requesterData, db));
            });

        } else if (item.type === 'sent-proposal') {
            // Sent proposal (green, waiting for response)
            const opponent = item.recipientData?.firstName || 'Unbekannt';
            const latestProposal = getLatestProposalData(item.data);

            card.innerHTML = `
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-xs font-semibold text-green-700 bg-green-200 px-2 py-1 rounded">📅 Match-Anfrage</span>
                    <span class="text-xs text-gray-500">(wartet...)</span>
                </div>
                <div class="mb-2">
                    <p class="font-semibold text-gray-800 text-sm">${userData.firstName} <i class="fas fa-arrow-right text-gray-400 mx-1"></i> ${opponent}</p>
                    ${latestProposal.dateTime ? `<p class="text-xs text-gray-600"><i class="fas fa-calendar mr-1"></i>${latestProposal.dateTime}</p>` : ''}
                    ${latestProposal.location ? `<p class="text-xs text-gray-600"><i class="fas fa-map-marker-alt mr-1"></i>${latestProposal.location}</p>` : ''}
                </div>
                <div class="flex gap-2 mt-2">
                    <button class="cancel-proposal-overview-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1.5 px-2 rounded-md transition" data-proposal-id="${item.id}">
                        <i class="fas fa-times"></i> Zurückziehen
                    </button>
                </div>
            `;

            import('./match-proposals.js').then(module => {
                const cancelBtn = card.querySelector('.cancel-proposal-overview-btn');
                if (cancelBtn) cancelBtn.addEventListener('click', () => module.cancelProposal(item.id, db));
            });
        }

        container.appendChild(card);
    });

    // Add "Show more" button if there are more than 3 items
    if (items.length > 3 && !showAll) {
        const showMoreBtn = document.createElement('button');
        showMoreBtn.className = 'w-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm py-2 px-4 rounded-md transition mt-2';
        showMoreBtn.innerHTML = `<i class="fas fa-chevron-down mr-1"></i> ${items.length - 3} weitere anzeigen`;
        showMoreBtn.addEventListener('click', () => {
            renderCombinedOverview(items, userData, db, true);
        });
        container.appendChild(showMoreBtn);
    } else if (showAll && items.length > 3) {
        const showLessBtn = document.createElement('button');
        showLessBtn.className = 'w-full bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm py-2 px-4 rounded-md transition mt-2';
        showLessBtn.innerHTML = `<i class="fas fa-chevron-up mr-1"></i> Weniger anzeigen`;
        showLessBtn.addEventListener('click', () => {
            renderCombinedOverview(items, userData, db, false);
        });
        container.appendChild(showLessBtn);
    }
}

/**
 * Helper to get latest proposal data
 */
function getLatestProposalData(proposal) {
    if (proposal.counterProposals && proposal.counterProposals.length > 0) {
        const latest = proposal.counterProposals[proposal.counterProposals.length - 1];
        return {
            dateTime: latest.dateTime ? formatDateTime(latest.dateTime) : null,
            location: latest.location,
            handicap: latest.handicap !== undefined ? latest.handicap : proposal.handicap,
        };
    }

    return {
        dateTime: proposal.proposedDateTime ? formatDateTime(proposal.proposedDateTime) : null,
        location: proposal.proposedLocation,
        handicap: proposal.handicap,
    };
}

/**
 * Formats date/time for display
 */
function formatDateTime(dateValue) {
    if (!dateValue) return null;

    const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
    return new Intl.DateTimeFormat('de-DE', {
        dateStyle: 'short',
        timeStyle: 'short'
    }).format(date);
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
                timestamp: serverTimestamp()
            },
            status: 'pending_coach',
            updatedAt: serverTimestamp()
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
                timestamp: serverTimestamp()
            },
            status: 'rejected',
            rejectedBy: 'playerB',
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error rejecting request:', error);
        alert('Fehler beim Ablehnen der Anfrage.');
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
