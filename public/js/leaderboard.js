import { collection, query, where, orderBy, onSnapshot, getDocs, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { calculateRank, formatRank, groupPlayersByRank, RANK_ORDER } from './ranks.js';
import { loadDoublesLeaderboard, renderDoublesLeaderboard } from './doubles-matches.js';

// Module state for subgroup filtering
let currentLeaderboardSubgroupFilter = 'all';

// Module state for leaderboard limits
const DEFAULT_LIMIT = 15;
let showFullLeaderboards = {
    skillClub: false,
    skillGlobal: false,
    effortClub: false,
    effortGlobal: false,
    seasonClub: false,
    seasonGlobal: false
};

/**
 * Sets the current subgroup filter for leaderboard
 * @param {string} subgroupId - Subgroup ID or 'all'
 */
export function setLeaderboardSubgroupFilter(subgroupId) {
    currentLeaderboardSubgroupFilter = subgroupId || 'all';
}

/**
 * Renders the new 3-tab leaderboard HTML into a container
 * @param {string} containerId - ID of the container element
 * @param {Object} options - Configuration options
 * @param {boolean} options.showToggle - Show Club/Global toggle (default: true)
 */
export function renderLeaderboardHTML(containerId, options = {}) {
    const { showToggle = true } = options;

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID "${containerId}" not found`);
        return;
    }

    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

            <div class="flex justify-center border-b border-gray-200 mb-4">
                <button id="tab-effort" class="leaderboard-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Erfahrungspunkten (XP) - permanenter Fortschritt">
                    <div>💪 Fleiß</div>
                    <div class="text-xs text-gray-500 font-normal">(XP)</div>
                </button>
                <button id="tab-season" class="leaderboard-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Saisonpunkten - aktuelle 6-Wochen-Saison">
                    <div>⭐ Season</div>
                    <div class="text-xs text-gray-500 font-normal">(Punkte)</div>
                </button>
                <button id="tab-skill" class="leaderboard-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Elo-Rating - Spielstärke aus Wettkämpfen">
                    <div>⚡ Skill</div>
                    <div class="text-xs text-gray-500 font-normal">(Elo)</div>
                </button>
                <button id="tab-ranks" class="leaderboard-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Verteilung der Spieler nach Rängen">
                    <div>🏆 Ränge</div>
                    <div class="text-xs text-gray-500 font-normal">(Level)</div>
                </button>
                <button id="tab-doubles" class="leaderboard-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Doppel-Paarungen Rangliste">
                    <div>🎾 Doppel</div>
                    <div class="text-xs text-gray-500 font-normal">(Teams)</div>
                </button>
            </div>

            ${showToggle ? `
                <div id="scope-toggle-container" class="mt-4 flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100">
                    <button id="toggle-club" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Mein Verein</button>
                    <button id="toggle-global" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Global</button>
                </div>
            ` : ''}

            <div id="content-skill" class="leaderboard-tab-content hidden">
                <div id="skill-club-container">
                    <div id="skill-list-club" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Lade Skill-Rangliste...</p>
                    </div>
                </div>
                ${showToggle ? `
                    <div id="skill-global-container" class="hidden">
                        <div id="skill-list-global" class="mt-6 space-y-2">
                            <p class="text-center text-gray-500 py-8">Lade globale Skill-Rangliste...</p>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div id="content-effort" class="leaderboard-tab-content hidden">
                <div id="effort-club-container">
                    <div id="effort-list-club" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Lade Fleiß-Rangliste...</p>
                    </div>
                </div>
                ${showToggle ? `
                    <div id="effort-global-container" class="hidden">
                        <div id="effort-list-global" class="mt-6 space-y-2">
                            <p class="text-center text-gray-500 py-8">Lade globale Fleiß-Rangliste...</p>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div id="content-season" class="leaderboard-tab-content hidden">
                <div id="season-club-container">
                    <div id="season-list-club" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Lade Season-Rangliste...</p>
                    </div>
                </div>
                ${showToggle ? `
                    <div id="season-global-container" class="hidden">
                        <div id="season-list-global" class="mt-6 space-y-2">
                            <p class="text-center text-gray-500 py-8">Lade globale Season-Rangliste...</p>
                        </div>
                    </div>
                ` : ''}
            </div>

            <div id="content-ranks" class="leaderboard-tab-content hidden">
                <div id="ranks-list" class="mt-6 space-y-4">
                    <p class="text-center text-gray-500 py-8">Lade Level-Übersicht...</p>
                </div>
            </div>

            <div id="content-doubles" class="leaderboard-tab-content hidden">
                <div id="doubles-list" class="mt-6">
                    <p class="text-center text-gray-500 py-8">Lade Doppel-Rangliste...</p>
                </div>
            </div>
        </div>
    `;
}

// --- Leaderboard Constants (deprecated for new rank system) ---
export const LEAGUES = {
    'Bronze': { color: 'text-orange-500', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'},
    'Silver': { color: 'text-gray-400', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>'},
    'Gold': { color: 'text-yellow-500', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'},
    'Diamond': { color: 'text-blue-400', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"></path>'}
};

export const PROMOTION_COUNT = 4;
export const DEMOTION_COUNT = 4;

let currentActiveTab = 'effort'; // GEÄNDERT: Standard-Tab ist jetzt 'effort'

/**
 * Sets up the tab navigation for the new 3-tab leaderboard
 */
export function setupLeaderboardTabs() {
    const tabSkillBtn = document.getElementById('tab-skill');
    const tabEffortBtn = document.getElementById('tab-effort');
    const tabSeasonBtn = document.getElementById('tab-season');
    const tabRanksBtn = document.getElementById('tab-ranks');
    const tabDoublesBtn = document.getElementById('tab-doubles');
    const scopeToggleContainer = document.getElementById('scope-toggle-container');

    if (!tabSkillBtn || !tabEffortBtn || !tabSeasonBtn || !tabRanksBtn || !tabDoublesBtn) return;

    const switchTab = (tabName) => {
        currentActiveTab = tabName;

        // Hide all tab contents
        document.querySelectorAll('.leaderboard-tab-content').forEach(el => el.classList.add('hidden'));

        // Remove active state from all tabs
        document.querySelectorAll('.leaderboard-tab-btn').forEach(btn => {
            btn.classList.remove('border-indigo-600', 'text-indigo-600');
            btn.classList.add('border-transparent', 'text-gray-600');
        });

        // Show selected tab content
        const selectedContent = document.getElementById(`content-${tabName}`);
        if (selectedContent) selectedContent.classList.remove('hidden');

        // Add active state to selected tab
        const selectedTab = document.getElementById(`tab-${tabName}`);
        if (selectedTab) {
            selectedTab.classList.add('border-indigo-600', 'text-indigo-600');
            selectedTab.classList.remove('border-transparent', 'text-gray-600');
        }

        // Show/hide scope toggle based on tab (Ranks and Doubles tabs don't have global view)
        if (scopeToggleContainer) {
            if (tabName === 'ranks' || tabName === 'doubles') {
                scopeToggleContainer.classList.add('hidden');
            } else {
                scopeToggleContainer.classList.remove('hidden');
            }
        }
    };

    tabSkillBtn.addEventListener('click', () => switchTab('skill'));
    tabEffortBtn.addEventListener('click', () => switchTab('effort'));
    tabSeasonBtn.addEventListener('click', () => switchTab('season'));
    tabRanksBtn.addEventListener('click', () => switchTab('ranks'));
    tabDoublesBtn.addEventListener('click', () => switchTab('doubles'));

    // Activate first tab by default
    switchTab('effort'); // GEÄNDERT: Standard-Tab ist jetzt 'effort'
}

/**
 * Sets up the club/global toggle for Skill and Effort tabs
 */
export function setupLeaderboardToggle() {
    const toggleClubBtn = document.getElementById('toggle-club');
    const toggleGlobalBtn = document.getElementById('toggle-global');

    if (!toggleClubBtn || !toggleGlobalBtn) return;

    const switchScope = (scope) => {
        const tab = currentActiveTab;

        if (scope === 'club') {
            toggleClubBtn.classList.add('toggle-btn-active');
            toggleGlobalBtn.classList.remove('toggle-btn-active');

            const clubContainer = document.getElementById(`${tab}-club-container`);
            const globalContainer = document.getElementById(`${tab}-global-container`);
            if (clubContainer) clubContainer.classList.remove('hidden');
            if (globalContainer) globalContainer.classList.add('hidden');
        } else {
            toggleGlobalBtn.classList.add('toggle-btn-active');
            toggleClubBtn.classList.remove('toggle-btn-active');

            const clubContainer = document.getElementById(`${tab}-club-container`);
            const globalContainer = document.getElementById(`${tab}-global-container`);
            if (clubContainer) clubContainer.classList.add('hidden');
            if (globalContainer) globalContainer.classList.remove('hidden');
        }
    };

    toggleClubBtn.addEventListener('click', () => switchScope('club'));
    toggleGlobalBtn.addEventListener('click', () => switchScope('global'));

    // Activate club view by default
    switchScope('club');
}

/**
 * Loads all 5 leaderboard tabs (Skill, Effort, Season, Ranks, Doubles)
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadLeaderboard(userData, db, unsubscribes) {
    loadSkillLeaderboard(userData, db, unsubscribes);
    loadEffortLeaderboard(userData, db, unsubscribes);
    loadSeasonLeaderboard(userData, db, unsubscribes);
    loadRanksView(userData, db, unsubscribes);
    loadDoublesLeaderboardTab(userData, db, unsubscribes);
}

/**
 * Loads the Doubles leaderboard with real-time updates
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadDoublesLeaderboardTab(userData, db, unsubscribes) {
    const listEl = document.getElementById('doubles-list');
    if (!listEl) return;

    try {
        loadDoublesLeaderboard(userData.clubId, db, listEl, unsubscribes);
    } catch (error) {
        console.error('Error loading doubles leaderboard:', error);
        listEl.innerHTML = '<p class="text-center text-red-500 py-8">Fehler beim Laden der Doppel-Rangliste.</p>';
    }
}

/**
 * Loads the Skill leaderboard (sorted by Elo) - Club view
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadSkillLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('skill-list-club');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("clubId", "==", userData.clubId),
        where("role", "==", "player"),
        orderBy("eloRating", "desc")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            players = players.filter(p =>
                p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
            );
        }

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.skillClub ? players : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSkillRow(player, index, userData.id, listEl);
        });

        // Add "Show more/less" button if needed
        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(listEl, 'skillClub', players.length, () => {
                showFullLeaderboards.skillClub = !showFullLeaderboards.skillClub;
                loadSkillLeaderboard(userData, db, null);
            }, showFullLeaderboards.skillClub);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Loads the Effort leaderboard (sorted by XP) - Club view
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadEffortLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('effort-list-club');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("clubId", "==", userData.clubId),
        where("role", "==", "player"),
        orderBy("xp", "desc")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            players = players.filter(p =>
                p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
            );
        }

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.effortClub ? players : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderEffortRow(player, index, userData.id, listEl);
        });

        // Add "Show more/less" button if needed
        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(listEl, 'effortClub', players.length, () => {
                showFullLeaderboards.effortClub = !showFullLeaderboards.effortClub;
                loadEffortLeaderboard(userData, db, null);
            }, showFullLeaderboards.effortClub);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Loads the Season leaderboard (sorted by points) - Club view
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadSeasonLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('season-list-club');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("clubId", "==", userData.clubId),
        where("role", "==", "player"),
        orderBy("points", "desc")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            players = players.filter(p =>
                p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
            );
        }

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.seasonClub ? players : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSeasonRow(player, index, userData.id, listEl);
        });

        // Add "Show more/less" button if needed
        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(listEl, 'seasonClub', players.length, () => {
                showFullLeaderboards.seasonClub = !showFullLeaderboards.seasonClub;
                loadSeasonLeaderboard(userData, db, null);
            }, showFullLeaderboards.seasonClub);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Loads the Ranks view (grouped by rank) - Club view only
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
function loadRanksView(userData, db, unsubscribes) {
    const listEl = document.getElementById('ranks-list');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("clubId", "==", userData.clubId),
        where("role", "==", "player")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            players = players.filter(p =>
                p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
            );
        }

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        const grouped = groupPlayersByRank(players);

        listEl.innerHTML = '';

        // Display ranks from highest to lowest
        for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
            const rank = RANK_ORDER[i];
            const playersInRank = grouped[rank.id] || [];

            if (playersInRank.length === 0) continue;

            // Sort by XP within rank
            playersInRank.sort((a, b) => (b.xp || 0) - (a.xp || 0));

            const rankSection = document.createElement('div');
            rankSection.className = 'rank-section';
            rankSection.innerHTML = `
                <div class="flex items-center justify-between p-3 rounded-lg" style="background-color: ${rank.color}20; border-left: 4px solid ${rank.color};">
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${rank.emoji}</span>
                        <span class="font-bold text-lg" style="color: ${rank.color};">${rank.name}</span>
                    </div>
                    <span class="text-sm text-gray-600">${playersInRank.length} Spieler</span>
                </div>
                <div class="mt-2 space-y-1 pl-4">
                    ${playersInRank.map((player, idx) => {
                        const isCurrentUser = player.id === userData.id;
                        const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
                        const avatarSrc = player.photoURL || `https://placehold.co/32x32/e2e8f0/64748b?text=${initials}`;

                        return `
                            <div class="flex items-center p-2 rounded ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}">
                                <img src="${avatarSrc}" alt="Avatar" class="h-8 w-8 rounded-full object-cover mr-3">
                                <div class="flex-grow">
                                    <p class="text-sm">${player.firstName} ${player.lastName}</p>
                                </div>
                                <div class="text-xs text-gray-600">
                                    ${player.eloRating || 0} Elo | ${player.xp || 0} XP
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            listEl.appendChild(rankSection);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Loads the global leaderboards (Skill, Effort, and Season)
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadGlobalLeaderboard(userData, db, unsubscribes) {
    loadGlobalSkillLeaderboard(userData, db, unsubscribes);
    loadGlobalEffortLeaderboard(userData, db, unsubscribes);
    loadGlobalSeasonLeaderboard(userData, db, unsubscribes);
}

/**
 * Loads the global Skill leaderboard (sorted by Elo)
 */
function loadGlobalSkillLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('skill-list-global');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("role", "==", "player"),
        orderBy("eloRating", "desc")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }

        const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.skillGlobal ? players : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSkillRow(player, index, userData.id, listEl, true);
        });

        // Add "Show more/less" button if needed
        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(listEl, 'skillGlobal', players.length, () => {
                showFullLeaderboards.skillGlobal = !showFullLeaderboards.skillGlobal;
                loadGlobalSkillLeaderboard(userData, db, null);
            }, showFullLeaderboards.skillGlobal);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Loads the global Effort leaderboard (sorted by XP)
 */
function loadGlobalEffortLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('effort-list-global');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("role", "==", "player"),
        orderBy("xp", "desc")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }

        const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.effortGlobal ? players : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderEffortRow(player, index, userData.id, listEl, true);
        });

        // Add "Show more/less" button if needed
        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(listEl, 'effortGlobal', players.length, () => {
                showFullLeaderboards.effortGlobal = !showFullLeaderboards.effortGlobal;
                loadGlobalEffortLeaderboard(userData, db, null);
            }, showFullLeaderboards.effortGlobal);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * Loads the global Season leaderboard (sorted by points)
 */
function loadGlobalSeasonLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('season-list-global');
    if (!listEl) return;

    const q = query(
        collection(db, "users"),
        where("role", "==", "player"),
        orderBy("points", "desc")
    );

    const listener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }

        const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.seasonGlobal ? players : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSeasonRow(player, index, userData.id, listEl, true);
        });

        // Add "Show more/less" button if needed
        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(listEl, 'seasonGlobal', players.length, () => {
                showFullLeaderboards.seasonGlobal = !showFullLeaderboards.seasonGlobal;
                loadGlobalSeasonLeaderboard(userData, db, null);
            }, showFullLeaderboards.seasonGlobal);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

/**
 * @deprecated This function is deprecated and will be removed in future versions.
 * Use the new 3-tab leaderboard system instead.
 */
export function loadLeaderboardForCoach(clubId, leagueToShow, db, unsubscribeCallback) {
    console.warn('loadLeaderboardForCoach is deprecated. Please update to use the new 3-tab leaderboard system.');
}

/**
 * Renders a "Show more/less" button to toggle leaderboard view
 * @param {HTMLElement} container - Container to append the button to
 * @param {string} leaderboardKey - Key for the leaderboard state
 * @param {number} totalCount - Total number of players
 * @param {Function} onClick - Callback when button is clicked
 * @param {boolean} isExpanded - Whether the list is currently expanded
 */
function renderShowMoreButton(container, leaderboardKey, totalCount, onClick, isExpanded) {
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'text-center mt-4';

    if (isExpanded) {
        buttonDiv.innerHTML = `
            <button class="show-more-btn px-6 py-3 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">
                <i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen
            </button>
        `;
    } else {
        buttonDiv.innerHTML = `
            <button class="show-more-btn px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
                <i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${totalCount - DEFAULT_LIMIT} weitere)
            </button>
        `;
    }

    const button = buttonDiv.querySelector('.show-more-btn');
    button.addEventListener('click', onClick);
    container.appendChild(buttonDiv);
}

/**
 * Renders a player row in the Skill leaderboard (shows Elo and Rank)
 */
function renderSkillRow(player, index, currentUserId, container, isGlobal = false) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;
    const playerRank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

    const playerDiv = document.createElement('div');
    const rankDisplay = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
    const clubInfo = isGlobal ? `<p class="text-xs text-gray-400">${player.clubId || 'Kein Verein'}</p>` : '';

    playerDiv.className = `flex items-center p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}`;
    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${player.firstName} ${player.lastName}</p>
            ${clubInfo}
        </div>
        <div class="text-right">
            <p class="text-sm font-bold text-gray-900">${player.eloRating || 0} Elo</p>
            <p class="text-xs text-gray-500">${playerRank.emoji} ${playerRank.name}</p>
        </div>
    `;
    container.appendChild(playerDiv);
}

/**
 * Renders a player row in the Effort leaderboard (shows XP and Rank)
 */
function renderEffortRow(player, index, currentUserId, container, isGlobal = false) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;
    const playerRank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

    const playerDiv = document.createElement('div');
    const rankDisplay = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
    const clubInfo = isGlobal ? `<p class="text-xs text-gray-400">${player.clubId || 'Kein Verein'}</p>` : '';

    playerDiv.className = `flex items-center p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}`;
    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${player.firstName} ${player.lastName}</p>
            ${clubInfo}
        </div>
        <div class="text-right">
            <p class="text-sm font-bold text-gray-900">${player.xp || 0} XP</p>
            <p class="text-xs text-gray-500">${playerRank.emoji} ${playerRank.name}</p>
        </div>
    `;
    container.appendChild(playerDiv);
}

/**
 * Renders a player row in the Season leaderboard (shows Points and Rank)
 */
function renderSeasonRow(player, index, currentUserId, container, isGlobal = false) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;
    const playerRank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

    const playerDiv = document.createElement('div');
    const rankDisplay = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
    const clubInfo = isGlobal ? `<p class="text-xs text-gray-400">${player.clubId || 'Kein Verein'}</p>` : '';

    playerDiv.className = `flex items-center p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}`;
    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${player.firstName} ${player.lastName}</p>
            ${clubInfo}
        </div>
        <div class="text-right">
            <p class="text-sm font-bold text-gray-900">${player.points || 0} Pkt</p>
            <p class="text-xs text-gray-500">${playerRank.emoji} ${playerRank.name}</p>
        </div>
    `;
    container.appendChild(playerDiv);
}

/**
 * @deprecated This function is deprecated and will be removed in future versions.
 * Use renderSkillRow or renderEffortRow instead.
 */
export function renderPlayerRow(player, index, currentUserId = null, container, totalPlayers = 0, isGlobal = false) {
    console.warn('renderPlayerRow is deprecated. Use renderSkillRow or renderEffortRow instead.');
}