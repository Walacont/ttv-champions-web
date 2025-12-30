// Ranglisten-Modul für Dashboard (Firebase-Version)
// Enthält Skill (Elo), Fleiß (XP), Season (Punkte), Ränge und Doppel-Ranglisten

import {
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    getDocs,
    limit,
    getDoc,
    doc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { calculateRank, formatRank, groupPlayersByRank, RANK_ORDER } from './ranks.js';
import { loadDoublesLeaderboard, renderDoublesLeaderboard } from './doubles-matches.js';
import { showHeadToHeadModal } from './head-to-head.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

// Filter-State (unterstützt kombinierte Alters- + Geschlechtsfilter)
let currentLeaderboardSubgroupFilter = 'all';
let currentLeaderboardGenderFilter = 'all';

// Cache für Vereinsdaten
let clubsCache = null;
let clubsCacheTimestamp = null;
const CLUBS_CACHE_TTL = 5 * 60 * 1000;

const DEFAULT_LIMIT = 15;
let showFullLeaderboards = {
    skillClub: false,
    skillGlobal: false,
    effortClub: false,
    effortGlobal: false,
    seasonClub: false,
    seasonGlobal: false,
};

/**
 * Lädt alle Vereine und gibt sie als Map zurück (mit Caching)
 */
async function loadClubsMap(db) {
    if (clubsCache && clubsCacheTimestamp && (Date.now() - clubsCacheTimestamp) < CLUBS_CACHE_TTL) {
        return clubsCache;
    }

    try {
        const clubsSnapshot = await getDocs(collection(db, 'clubs'));
        const clubsMap = new Map();

        clubsSnapshot.forEach(doc => {
            clubsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        clubsCache = clubsMap;
        clubsCacheTimestamp = Date.now();

        return clubsMap;
    } catch (error) {
        console.error('Error loading clubs:', error);
        return new Map();
    }
}

/**
 * Gibt Anzeigename für Spieler zurück (behandelt gelöschte Accounts)
 */
function getPlayerDisplayName(player) {
    if (player.deleted || !player.firstName || !player.lastName) {
        return player.displayName || 'Gelöschter Nutzer';
    }
    return `${player.firstName} ${player.lastName}`;
}

/**
 * Gibt Initialen für Spieler zurück (behandelt gelöschte Accounts)
 */
function getPlayerInitials(player) {
    if (player.deleted || !player.firstName || !player.lastName) {
        const displayName = player.displayName || 'GN';
        return displayName.substring(0, 2).toUpperCase();
    }
    return (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
}

/**
 * Filtert Spieler basierend auf Datenschutzeinstellungen
 */
function filterPlayersByPrivacy(players, currentUserData) {
    return players.filter(player => {
        if (player.id === currentUserData.id) return true;

        if ((currentUserData.role === 'coach' || currentUserData.role === 'admin') &&
            currentUserData.clubId && player.clubId === currentUserData.clubId) {
            return true;
        }

        return player.privacySettings?.showInLeaderboards !== false;
    });
}

/**
 * Filtert Spieler aus Test-Vereinen heraus
 */
function filterTestClubPlayers(players, currentUserData, clubsMap) {
    const isCoachOrAdmin = currentUserData.role === 'coach' || currentUserData.role === 'admin';
    const currentUserClub = clubsMap.get(currentUserData.clubId);

    if (!isCoachOrAdmin) {
        if (currentUserClub && currentUserClub.isTestClub) {
            return players;
        }
    }

    return players.filter(player => {
        if (player.id === currentUserData.id) return true;
        if (!player.clubId) return true;

        const club = clubsMap.get(player.clubId);
        if (!club || !club.isTestClub) return true;

        if (isCoachOrAdmin) {
            return player.clubId === currentUserData.clubId;
        }

        return false;
    });
}

export function setLeaderboardSubgroupFilter(subgroupId) {
    currentLeaderboardSubgroupFilter = subgroupId || 'all';
}

export function setLeaderboardGenderFilter(genderId) {
    currentLeaderboardGenderFilter = genderId || 'all';
}

/**
 * Rendert das Ranglisten-HTML in einen Container
 */
export function renderLeaderboardHTML(containerId, options = {}) {
    const { showToggle = true, userData = null } = options;

    const hasClub = userData?.clubId && userData.clubId !== '' && userData.clubId !== 'null';
    const showEffortTab = hasClub ? (userData?.leaderboardPreferences?.showEffortTab !== false) : true;
    const showRanksTab = hasClub ? (userData?.leaderboardPreferences?.showRanksTab !== false) : true;
    const showSeasonTab = hasClub ? (userData?.leaderboardPreferences?.showSeasonTab !== false) : true;

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID "${containerId}" not found`);
        return;
    }

    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

            <div class="overflow-x-auto border-b border-gray-200 mb-4 -mx-6 px-6 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                <div class="flex justify-center min-w-max">
                    ${showEffortTab ? `
                    <button id="tab-effort" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Erfahrungspunkten (XP) - permanenter Fortschritt">
                        <div>Fleiß</div>
                        <div class="text-xs text-gray-500 font-normal">(XP)</div>
                    </button>
                    ` : ''}
                    ${showSeasonTab ? `
                    <button id="tab-season" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Saisonpunkten - aktuelle 6-Wochen-Saison">
                        <div>Season</div>
                        <div class="text-xs text-gray-500 font-normal">(Punkte)</div>
                    </button>
                    ` : ''}
                    <button id="tab-skill" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Ranking nach Elo-Rating - Spielstärke aus Wettkämpfen">
                        <div>Skill</div>
                        <div class="text-xs text-gray-500 font-normal">(Elo)</div>
                    </button>
                    ${showRanksTab ? `
                    <button id="tab-ranks" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Verteilung der Spieler nach Rängen">
                        <div>Ränge</div>
                        <div class="text-xs text-gray-500 font-normal">(Level)</div>
                    </button>
                    ` : ''}
                    <button id="tab-doubles" class="leaderboard-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors" title="Doppel-Paarungen Rangliste">
                        <div>Doppel</div>
                        <div class="text-xs text-gray-500 font-normal">(Teams)</div>
                    </button>
                </div>
            </div>

            ${
                showToggle
                    ? `
                <div id="scope-toggle-container" class="mt-4 flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100">
                    <button id="toggle-club" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Mein Verein</button>
                    <button id="toggle-global" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Global</button>
                </div>
            `
                    : ''
            }

            <div id="content-skill" class="leaderboard-tab-content hidden">
                <div id="skill-club-container">
                    <div id="skill-list-club" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Lade Skill-Rangliste...</p>
                    </div>
                </div>
                ${
                    showToggle
                        ? `
                    <div id="skill-global-container" class="hidden">
                        <div id="skill-list-global" class="mt-6 space-y-2">
                            <p class="text-center text-gray-500 py-8">Lade globale Skill-Rangliste...</p>
                        </div>
                    </div>
                `
                        : ''
                }
            </div>

            <div id="content-effort" class="leaderboard-tab-content hidden">
                <div id="effort-list-club" class="mt-6 space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Fleiß-Rangliste...</p>
                </div>
            </div>

            <div id="content-season" class="leaderboard-tab-content hidden">
                <div id="season-list-club" class="mt-6 space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Season-Rangliste...</p>
                </div>
            </div>

            <div id="content-ranks" class="leaderboard-tab-content hidden">
                <div id="ranks-list" class="mt-6 space-y-4">
                    <p class="text-center text-gray-500 py-8">Lade Level-Übersicht...</p>
                </div>
            </div>

            <div id="content-doubles" class="leaderboard-tab-content hidden">
                <div id="doubles-club-container">
                    <div id="doubles-list-club" class="mt-6">
                        <p class="text-center text-gray-500 py-8">Lade Doppel-Rangliste...</p>
                    </div>
                </div>
                ${
                    showToggle
                        ? `
                    <div id="doubles-global-container" class="hidden">
                        <div id="doubles-list-global" class="mt-6">
                            <p class="text-center text-gray-500 py-8">Lade globale Doppel-Rangliste...</p>
                        </div>
                    </div>
                `
                        : ''
                }
            </div>
        </div>
    `;
}

// @deprecated - Wird für neues Rang-System nicht mehr verwendet
export const LEAGUES = {
    Bronze: {
        color: 'text-orange-500',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
    },
    Silver: {
        color: 'text-gray-400',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>',
    },
    Gold: {
        color: 'text-yellow-500',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>',
    },
    Diamond: {
        color: 'text-blue-400',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"></path>',
    },
};

export const PROMOTION_COUNT = 4;
export const DEMOTION_COUNT = 4;

let currentActiveTab = 'effort';

/**
 * Richtet die Tab-Navigation für die Rangliste ein
 */
export function setupLeaderboardTabs(userData = null) {
    const tabSkillBtn = document.getElementById('tab-skill');
    const tabEffortBtn = document.getElementById('tab-effort');
    const tabSeasonBtn = document.getElementById('tab-season');
    const tabRanksBtn = document.getElementById('tab-ranks');
    const tabDoublesBtn = document.getElementById('tab-doubles');
    const scopeToggleContainer = document.getElementById('scope-toggle-container');

    if (!tabSkillBtn || !tabEffortBtn || !tabSeasonBtn || !tabRanksBtn || !tabDoublesBtn) return;

    const hasClub = userData && userData.clubId !== null && userData.clubId !== undefined;

    const switchTab = tabName => {
        currentActiveTab = tabName;

        document
            .querySelectorAll('.leaderboard-tab-content')
            .forEach(el => el.classList.add('hidden'));

        document.querySelectorAll('.leaderboard-tab-btn').forEach(btn => {
            btn.classList.remove('border-indigo-600', 'text-indigo-600');
            btn.classList.add('border-transparent', 'text-gray-600');
        });

        const selectedContent = document.getElementById(`content-${tabName}`);
        if (selectedContent) selectedContent.classList.remove('hidden');

        const selectedTab = document.getElementById(`tab-${tabName}`);
        if (selectedTab) {
            selectedTab.classList.add('border-indigo-600', 'text-indigo-600');
            selectedTab.classList.remove('border-transparent', 'text-gray-600');
        }

        // Scope-Toggle nur für Skill und Doppel anzeigen
        if (scopeToggleContainer) {
            if (tabName === 'skill' || tabName === 'doubles') {
                scopeToggleContainer.classList.remove('hidden');
            } else {
                scopeToggleContainer.classList.add('hidden');
            }
        }

        // Für Spieler ohne Verein: Automatisch globale Ansicht zeigen
        if (!hasClub && (tabName === 'skill' || tabName === 'doubles')) {
            const clubContainer = document.getElementById(`${tabName}-club-container`);
            const globalContainer = document.getElementById(`${tabName}-global-container`);
            if (clubContainer) clubContainer.classList.add('hidden');
            if (globalContainer) globalContainer.classList.remove('hidden');

            // Update toggle button states
            const toggleClubBtn = document.getElementById('toggle-club');
            const toggleGlobalBtn = document.getElementById('toggle-global');
            if (toggleClubBtn) toggleClubBtn.classList.remove('toggle-btn-active');
            if (toggleGlobalBtn) toggleGlobalBtn.classList.add('toggle-btn-active');
        }
    };

    tabSkillBtn.addEventListener('click', () => switchTab('skill'));
    tabEffortBtn.addEventListener('click', () => switchTab('effort'));
    tabSeasonBtn.addEventListener('click', () => switchTab('season'));
    tabRanksBtn.addEventListener('click', () => switchTab('ranks'));
    tabDoublesBtn.addEventListener('click', () => switchTab('doubles'));

    const defaultTab = hasClub ? 'effort' : 'skill';
    switchTab(defaultTab);
}

/**
 * Richtet den Verein/Global-Toggle ein
 */
export function setupLeaderboardToggle(userData = null) {
    const toggleClubBtn = document.getElementById('toggle-club');
    const toggleGlobalBtn = document.getElementById('toggle-global');

    if (!toggleClubBtn || !toggleGlobalBtn) return;

    const hasClub = userData && userData.clubId !== null && userData.clubId !== undefined;

    if (!hasClub) {
        toggleClubBtn.style.display = 'none';
    }

    const switchScope = scope => {
        const tab = currentActiveTab;

        if (scope === 'club' && hasClub) {
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

    switchScope(hasClub ? 'club' : 'global');
}

/**
 * Lädt alle 5 Ranglisten-Tabs
 */
export async function loadLeaderboard(userData, db, unsubscribes) {
    await Promise.all([
        loadSkillLeaderboard(userData, db, unsubscribes),
        loadEffortLeaderboard(userData, db, unsubscribes),
        loadSeasonLeaderboard(userData, db, unsubscribes),
        loadRanksView(userData, db, unsubscribes),
    ]);
    loadDoublesLeaderboardTab(userData, db, unsubscribes);
}

function loadDoublesLeaderboardTab(userData, db, unsubscribes) {
    const listEl = document.getElementById('doubles-list-club');
    if (!listEl) return;

    try {
        loadDoublesLeaderboard(userData.clubId, db, listEl, unsubscribes, userData.id);
    } catch (error) {
        console.error('Error loading doubles leaderboard:', error);
        listEl.innerHTML =
            '<p class="text-center text-red-500 py-8">Fehler beim Laden der Doppel-Rangliste.</p>';
    }
}

// Skill-Rangliste (nach Elo sortiert) - Vereinsansicht
async function loadSkillLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('skill-list-club');
    if (!listEl) return;

    const clubsMap = await loadClubsMap(db);

    // Spieler und Trainer einbeziehen (Trainer können als Spieler teilnehmen)
    const q = query(
        collection(db, 'users'),
        where('clubId', '==', userData.clubId),
        where('role', 'in', ['player', 'coach']),
        orderBy('eloRating', 'desc')
    );

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup or age group if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(
                    p => p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
                );
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        players = filterPlayersByPrivacy(players, userData);
        players = filterTestClubPlayers(players, userData, clubsMap);

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.skillClub
            ? players
            : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSkillRow(player, index, userData.id, listEl, false, db);
        });

        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(
                listEl,
                'skillClub',
                players.length,
                () => {
                    showFullLeaderboards.skillClub = !showFullLeaderboards.skillClub;
                    loadSkillLeaderboard(userData, db, null);
                },
                showFullLeaderboards.skillClub
            );
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

// Fleiß-Rangliste (nach XP sortiert) - Vereinsansicht
async function loadEffortLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('effort-list-club');
    if (!listEl) return;

    const clubsMap = await loadClubsMap(db);

    const q = query(
        collection(db, 'users'),
        where('clubId', '==', userData.clubId),
        where('role', 'in', ['player', 'coach']),
        orderBy('xp', 'desc')
    );

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup or age group if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(
                    p => p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
                );
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        players = filterPlayersByPrivacy(players, userData);
        players = filterTestClubPlayers(players, userData, clubsMap);

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.effortClub
            ? players
            : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderEffortRow(player, index, userData.id, listEl);
        });

        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(
                listEl,
                'effortClub',
                players.length,
                () => {
                    showFullLeaderboards.effortClub = !showFullLeaderboards.effortClub;
                    loadEffortLeaderboard(userData, db, null);
                },
                showFullLeaderboards.effortClub
            );
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

// Season-Rangliste (nach Punkten sortiert) - Vereinsansicht
async function loadSeasonLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('season-list-club');
    if (!listEl) return;

    const clubsMap = await loadClubsMap(db);

    const q = query(
        collection(db, 'users'),
        where('clubId', '==', userData.clubId),
        where('role', 'in', ['player', 'coach']),
        orderBy('points', 'desc')
    );

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup or age group if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(
                    p => p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
                );
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        players = filterPlayersByPrivacy(players, userData);
        players = filterTestClubPlayers(players, userData, clubsMap);

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.seasonClub
            ? players
            : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSeasonRow(player, index, userData.id, listEl);
        });

        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(
                listEl,
                'seasonClub',
                players.length,
                () => {
                    showFullLeaderboards.seasonClub = !showFullLeaderboards.seasonClub;
                    loadSeasonLeaderboard(userData, db, null);
                },
                showFullLeaderboards.seasonClub
            );
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

// Ränge-Ansicht (nach Rang gruppiert) - nur Vereinsansicht
async function loadRanksView(userData, db, unsubscribes) {
    const listEl = document.getElementById('ranks-list');
    if (!listEl) return;

    const clubsMap = await loadClubsMap(db);

    const q = query(
        collection(db, 'users'),
        where('clubId', '==', userData.clubId),
        where('role', 'in', ['player', 'coach'])
    );

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by subgroup or age group if not "all"
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            } else {
                players = players.filter(
                    p => p.subgroupIDs && p.subgroupIDs.includes(currentLeaderboardSubgroupFilter)
                );
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        players = filterPlayersByPrivacy(players, userData);
        players = filterTestClubPlayers(players, userData, clubsMap);

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        const grouped = groupPlayersByRank(players);

        listEl.innerHTML = '';

        // Ränge von hoch nach niedrig anzeigen
        for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
            const rank = RANK_ORDER[i];
            const playersInRank = grouped[rank.id] || [];

            if (playersInRank.length === 0) continue;

            // Innerhalb des Rangs nach XP sortieren
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
                    ${playersInRank
                        .map((player, idx) => {
                            const isCurrentUser = player.id === userData.id;
                            const initials = getPlayerInitials(player);
                            const avatarSrc =
                                player.photoURL ||
                                `https://placehold.co/32x32/e2e8f0/64748b?text=${initials}`;

                            return `
                            <div class="flex items-center p-2 rounded ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}">
                                <img src="${avatarSrc}" alt="Avatar" class="h-8 w-8 rounded-full object-cover mr-3">
                                <div class="flex-grow">
                                    <p class="text-sm">${getPlayerDisplayName(player)}</p>
                                </div>
                                <div class="text-xs text-gray-600">
                                    ${player.eloRating || 0} Elo | ${player.xp || 0} XP
                                </div>
                            </div>
                        `;
                        })
                        .join('')}
                </div>
            `;
            listEl.appendChild(rankSection);
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

// Globale Ranglisten laden (nur Skill und Doppel)
export async function loadGlobalLeaderboard(userData, db, unsubscribes) {
    await Promise.all([
        loadGlobalSkillLeaderboard(userData, db, unsubscribes),
        loadGlobalDoublesLeaderboard(userData, db, unsubscribes),
    ]);
}

async function loadGlobalSkillLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('skill-list-global');
    if (!listEl) return;

    const clubsMap = await loadClubsMap(db);

    const q = query(
        collection(db, 'users'),
        where('role', 'in', ['player', 'coach']),
        orderBy('eloRating', 'desc')
    );

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Altersgruppen-Filter anwenden (Untergruppen sind vereinsspezifisch)
        if (currentLeaderboardSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentLeaderboardSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentLeaderboardSubgroupFilter);
            }
        }

        if (currentLeaderboardGenderFilter !== 'all') {
            players = filterPlayersByGender(players, currentLeaderboardGenderFilter);
        }

        players = filterPlayersByPrivacy(players, userData);
        players = filterTestClubPlayers(players, userData, clubsMap);

        if (players.length === 0) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Gruppe.</div>`;
            return;
        }

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.skillGlobal
            ? players
            : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSkillRow(player, index, userData.id, listEl, true, db);
        });

        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(
                listEl,
                'skillGlobal',
                players.length,
                () => {
                    showFullLeaderboards.skillGlobal = !showFullLeaderboards.skillGlobal;
                    loadGlobalSkillLeaderboard(userData, db, null);
                },
                showFullLeaderboards.skillGlobal
            );
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

function loadGlobalEffortLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('effort-list-global');
    if (!listEl) return;

    const q = query(collection(db, 'users'), where('role', 'in', ['player', 'coach']), orderBy('xp', 'desc'));

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        players = filterPlayersByPrivacy(players, userData);

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.effortGlobal
            ? players
            : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderEffortRow(player, index, userData.id, listEl, true);
        });

        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(
                listEl,
                'effortGlobal',
                players.length,
                () => {
                    showFullLeaderboards.effortGlobal = !showFullLeaderboards.effortGlobal;
                    loadGlobalEffortLeaderboard(userData, db, null);
                },
                showFullLeaderboards.effortGlobal
            );
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

function loadGlobalSeasonLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('season-list-global');
    if (!listEl) return;

    const q = query(
        collection(db, 'users'),
        where('role', 'in', ['player', 'coach']),
        orderBy('points', 'desc')
    );

    const listener = onSnapshot(q, snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }

        let players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        players = filterPlayersByPrivacy(players, userData);

        listEl.innerHTML = '';
        const playersToShow = showFullLeaderboards.seasonGlobal
            ? players
            : players.slice(0, DEFAULT_LIMIT);
        playersToShow.forEach((player, index) => {
            renderSeasonRow(player, index, userData.id, listEl, true);
        });

        if (players.length > DEFAULT_LIMIT) {
            renderShowMoreButton(
                listEl,
                'seasonGlobal',
                players.length,
                () => {
                    showFullLeaderboards.seasonGlobal = !showFullLeaderboards.seasonGlobal;
                    loadGlobalSeasonLeaderboard(userData, db, null);
                },
                showFullLeaderboards.seasonGlobal
            );
        }
    });

    if (unsubscribes) unsubscribes.push(listener);
}

function loadGlobalDoublesLeaderboard(userData, db, unsubscribes) {
    const listEl = document.getElementById('doubles-list-global');
    if (!listEl) return;

    import('./doubles-matches.js').then(module => {
        try {
            module.loadDoublesLeaderboard(null, db, listEl, unsubscribes, userData.id, true);
        } catch (error) {
            console.error('Error loading global doubles leaderboard:', error);
            listEl.innerHTML =
                '<p class="text-center text-red-500 py-8">Fehler beim Laden der globalen Doppel-Rangliste.</p>';
        }
    });
}

/** @deprecated */
export function loadLeaderboardForCoach(clubId, leagueToShow, db, unsubscribeCallback) {
    console.warn('loadLeaderboardForCoach is deprecated');
}

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

// Spieler-Zeile in der Skill-Rangliste
function renderSkillRow(player, index, currentUserId, container, isGlobal = false, db = null) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;
    const playerRank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

    const playerDiv = document.createElement('div');
    const rankDisplay = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const initials = getPlayerInitials(player);
    const avatarSrc =
        player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
    const clubInfo = isGlobal
        ? `<p class="text-xs text-gray-400">${player.clubId || 'Kein Verein'}</p>`
        : '';

    playerDiv.className = `flex items-center p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'} ${!isCurrentUser && db ? 'cursor-pointer hover:bg-indigo-50 transition-colors' : ''}`;
    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${getPlayerDisplayName(player)}</p>
            ${clubInfo}
        </div>
        <div class="text-right">
            <p class="text-sm font-bold text-gray-900">${player.eloRating || 0} Elo</p>
            <p class="text-xs text-gray-500">${playerRank.emoji} ${playerRank.name}</p>
        </div>
    `;

    // Head-to-Head Modal öffnen (nur für andere Spieler)
    if (!isCurrentUser && db) {
        playerDiv.addEventListener('click', () => {
            showHeadToHeadModal(db, currentUserId, player.id);
        });
    }

    container.appendChild(playerDiv);

    // Datenschutz-Hinweis wenn deaktiviert
    if (isCurrentUser && player.privacySettings?.showInLeaderboards === false) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2 text-xs text-amber-800';
        noticeDiv.innerHTML = `
            <i class="fas fa-eye-slash mr-1"></i>
            <strong>Privatsphäre:</strong> Andere Spieler können dich nicht in dieser Rangliste sehen.
        `;
        container.appendChild(noticeDiv);
    }
}

// Spieler-Zeile in der Fleiß-Rangliste
function renderEffortRow(player, index, currentUserId, container, isGlobal = false) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;
    const playerRank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

    const playerDiv = document.createElement('div');
    const rankDisplay = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const initials = getPlayerInitials(player);
    const avatarSrc =
        player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
    const clubInfo = isGlobal
        ? `<p class="text-xs text-gray-400">${player.clubId || 'Kein Verein'}</p>`
        : '';

    playerDiv.className = `flex items-center p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}`;
    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${getPlayerDisplayName(player)}</p>
            ${clubInfo}
        </div>
        <div class="text-right">
            <p class="text-sm font-bold text-gray-900">${player.xp || 0} XP</p>
            <p class="text-xs text-gray-500">${playerRank.emoji} ${playerRank.name}</p>
        </div>
    `;
    container.appendChild(playerDiv);

    // Datenschutz-Hinweis wenn deaktiviert
    if (isCurrentUser && player.privacySettings?.showInLeaderboards === false) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2 text-xs text-amber-800';
        noticeDiv.innerHTML = `
            <i class="fas fa-eye-slash mr-1"></i>
            <strong>Privatsphäre:</strong> Andere Spieler können dich nicht in dieser Rangliste sehen.
        `;
        container.appendChild(noticeDiv);
    }
}

// Spieler-Zeile in der Season-Rangliste
function renderSeasonRow(player, index, currentUserId, container, isGlobal = false) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;
    const playerRank = calculateRank(player.eloRating, player.xp, player.grundlagenCompleted || 0);

    const playerDiv = document.createElement('div');
    const rankDisplay = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const initials = getPlayerInitials(player);
    const avatarSrc =
        player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
    const clubInfo = isGlobal
        ? `<p class="text-xs text-gray-400">${player.clubId || 'Kein Verein'}</p>`
        : '';

    playerDiv.className = `flex items-center p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}`;
    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${getPlayerDisplayName(player)}</p>
            ${clubInfo}
        </div>
        <div class="text-right">
            <p class="text-sm font-bold text-gray-900">${player.points || 0} Pkt</p>
            <p class="text-xs text-gray-500">${playerRank.emoji} ${playerRank.name}</p>
        </div>
    `;
    container.appendChild(playerDiv);

    // Datenschutz-Hinweis wenn deaktiviert
    if (isCurrentUser && player.privacySettings?.showInLeaderboards === false) {
        const noticeDiv = document.createElement('div');
        noticeDiv.className = 'bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2 text-xs text-amber-800';
        noticeDiv.innerHTML = `
            <i class="fas fa-eye-slash mr-1"></i>
            <strong>Privatsphäre:</strong> Andere Spieler können dich nicht in dieser Rangliste sehen.
        `;
        container.appendChild(noticeDiv);
    }
}

/** @deprecated */
export function renderPlayerRow(
    player,
    index,
    currentUserId = null,
    container,
    totalPlayers = 0,
    isGlobal = false
) {
    console.warn('renderPlayerRow is deprecated. Use renderSkillRow or renderEffortRow instead.');
}
