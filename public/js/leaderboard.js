import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Renders the leaderboard HTML into a container
 * @param {string} containerId - ID of the container element
 * @param {Object} options - Configuration options
 * @param {boolean} options.showToggle - Show Club/Global toggle (default: true)
 * @param {boolean} options.showLeagueSelect - Show league selector buttons for coaches (default: false)
 * @param {boolean} options.showLeagueIcons - Show league icons (default: true)
 * @param {boolean} options.showSeasonCountdown - Show season countdown (default: true)
 */
export function renderLeaderboardHTML(containerId, options = {}) {
    const {
        showToggle = true,
        showLeagueSelect = false,
        showLeagueIcons = true,
        showSeasonCountdown = true
    } = options;

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Container with ID "${containerId}" not found`);
        return;
    }

    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            ${showLeagueSelect ? `
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold text-gray-900">Vereins-Leaderboard</h2>
                    <div id="coach-league-select" class="flex items-center space-x-2"></div>
                </div>
            ` : ''}

            ${showLeagueIcons ? '<div id="league-icons-container" class="flex justify-center items-end space-x-4 mb-4"></div>' : ''}

            <h2 id="league-name" class="text-2xl font-bold text-gray-900 text-center">Leaderboard</h2>

            ${showSeasonCountdown ? `
                <div class="mt-4 p-4 bg-gray-50 rounded-lg flex justify-between items-center">
                    <div class="text-center flex-1">
                        <p class="text-sm text-gray-500">Saison endet in:</p>
                        <p id="season-countdown" class="font-mono font-semibold text-indigo-600"></p>
                    </div>
                </div>
            ` : ''}

            ${showToggle ? `
                <div class="mt-6 flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100">
                    <button id="toggle-club" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Mein Verein</button>
                    <button id="toggle-global" class="leaderboard-toggle-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md">Global</button>
                </div>
            ` : ''}

            <div id="leaderboard-club-container" ${!showToggle ? '' : ''}>
                <div id="leaderboard-list-club" class="mt-6 space-y-2">
                    <p class="text-center text-gray-500 py-8">Leaderboard wird geladen...</p>
                </div>
            </div>

            ${showToggle ? `
                <div id="leaderboard-global-container" class="hidden">
                    <div id="leaderboard-list-global" class="mt-6 space-y-2">
                        <p class="text-center text-gray-500 py-8">Globales Leaderboard wird geladen...</p>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// --- Leaderboard Constants ---
export const LEAGUES = {
    'Bronze': { color: 'text-orange-500', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>'},
    'Silver': { color: 'text-gray-400', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>'},
    'Gold': { color: 'text-yellow-500', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'},
    'Diamond': { color: 'text-blue-400', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"></path>'}
};

export const PROMOTION_COUNT = 4;
export const DEMOTION_COUNT = 4;

/**
 * Sets up the toggle buttons to switch between club and global leaderboards
 */
export function setupLeaderboardToggle() {
    const toggleClubBtn = document.getElementById('toggle-club');
    const toggleGlobalBtn = document.getElementById('toggle-global');
    const leaderboardClubContainer = document.getElementById('leaderboard-club-container');
    const leaderboardGlobalContainer = document.getElementById('leaderboard-global-container');
    const coachLeagueSelect = document.getElementById('coach-league-select');
    const leagueIconsContainer = document.getElementById('league-icons-container');
    const leagueNameEl = document.getElementById('league-name');

    if (!toggleClubBtn || !toggleGlobalBtn) return;

    toggleClubBtn.classList.add('toggle-btn-active');
    toggleClubBtn.addEventListener('click', () => {
        toggleClubBtn.classList.add('toggle-btn-active');
        toggleGlobalBtn.classList.remove('toggle-btn-active');
        leaderboardClubContainer.classList.remove('hidden');
        leaderboardGlobalContainer.classList.add('hidden');

        // Zeige Liga-Auswahl und Icons für Club-Ansicht
        if (coachLeagueSelect) coachLeagueSelect.classList.remove('hidden');
        if (leagueIconsContainer) leagueIconsContainer.classList.remove('hidden');
    });
    toggleGlobalBtn.addEventListener('click', () => {
        toggleGlobalBtn.classList.add('toggle-btn-active');
        toggleClubBtn.classList.remove('toggle-btn-active');
        leaderboardGlobalContainer.classList.remove('hidden');
        leaderboardClubContainer.classList.add('hidden');

        // Verstecke Liga-Auswahl und Icons für Global-Ansicht
        if (coachLeagueSelect) coachLeagueSelect.classList.add('hidden');
        if (leagueIconsContainer) leagueIconsContainer.classList.add('hidden');

        // Ändere Titel zu "Globales Leaderboard"
        if (leagueNameEl) leagueNameEl.textContent = 'Globales Leaderboard';
    });
}

/**
 * Loads and displays the club leaderboard for the user's league
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadLeaderboard(userData, db, unsubscribes) {
    const leaderboardListClubEl = document.getElementById('leaderboard-list-club');
    const leagueNameEl = document.getElementById('league-name');
    const leagueIconsContainer = document.getElementById('league-icons-container');
    const userLeague = userData.league || 'Bronze';

    if (leagueNameEl) leagueNameEl.textContent = `${userLeague}-Liga`;

    if (leagueIconsContainer) {
        leagueIconsContainer.innerHTML = '';
        for (const leagueKey in LEAGUES) {
            const isActive = leagueKey === userLeague;
            const iconDiv = document.createElement('div');
            iconDiv.className = `p-2 border-2 rounded-lg transition-transform transform ${isActive ? 'league-icon-active bg-indigo-100' : 'bg-gray-200 opacity-50'}`;
            iconDiv.innerHTML = `<svg class="h-8 w-8 ${LEAGUES[leagueKey].color}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${LEAGUES[leagueKey].icon}</svg>`;
            leagueIconsContainer.appendChild(iconDiv);
        }
    }

    const q = query(collection(db, "users"), where("clubId", "==", userData.clubId), where("role", "==", "player"));
    const leaderboardListener = onSnapshot(q, (snapshot) => {
        if (!leaderboardListClubEl) return;

        if (snapshot.empty) {
            leaderboardListClubEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler im Verein.</div>`;
            return;
        }

        const playersInLeague = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(player => (player.league || 'Bronze') === userLeague);
        if (playersInLeague.length === 0) {
            leaderboardListClubEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Liga.</div>`;
            return;
        }
        const sortedPlayers = playersInLeague.sort((a, b) => (b.points || 0) - (a.points || 0));
        const totalPlayers = sortedPlayers.length;

        leaderboardListClubEl.innerHTML = '';
        if (totalPlayers > PROMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-green-100 text-green-800 font-bold text-sm rounded-t-lg">Aufstiegszone</div>`;
        }
        sortedPlayers.slice(0, PROMOTION_COUNT).forEach((player, index) => renderPlayerRow(player, index, userData.id, leaderboardListClubEl, totalPlayers));

        if (totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-gray-100 text-gray-800 font-bold text-sm">Sicherheitszone</div>`;
            sortedPlayers.slice(PROMOTION_COUNT, totalPlayers - DEMOTION_COUNT).forEach((player, index) => renderPlayerRow(player, index + PROMOTION_COUNT, userData.id, leaderboardListClubEl, totalPlayers));
        } else if (totalPlayers > PROMOTION_COUNT) {
             leaderboardListClubEl.innerHTML += `<div class="p-2 bg-gray-100 text-gray-800 font-bold text-sm">Sicherheitszone</div>`;
             sortedPlayers.slice(PROMOTION_COUNT).forEach((player, index) => renderPlayerRow(player, index + PROMOTION_COUNT, userData.id, leaderboardListClubEl, totalPlayers));
        }

        if (totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-red-100 text-red-800 font-bold text-sm">Abstiegszone</div>`;
            sortedPlayers.slice(totalPlayers - DEMOTION_COUNT).forEach((player, index) => renderPlayerRow(player, index + totalPlayers - DEMOTION_COUNT, userData.id, leaderboardListClubEl, totalPlayers));
        }
    });

    if (unsubscribes) unsubscribes.push(leaderboardListener);
}

/**
 * Loads and displays the global leaderboard with all players
 * @param {Object} userData - The current user's data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadGlobalLeaderboard(userData, db, unsubscribes) {
    const leaderboardListGlobalEl = document.getElementById('leaderboard-list-global');
    const q = query(collection(db, "users"), where("role", "==", "player"), orderBy("points", "desc"));

    const globalListener = onSnapshot(q, (snapshot) => {
        if (!leaderboardListGlobalEl) return;

        if (snapshot.empty) {
            leaderboardListGlobalEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler gefunden.</div>`;
            return;
        }
        const allPlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        leaderboardListGlobalEl.innerHTML = '';
        allPlayers.forEach((player, index) => {
            renderPlayerRow(player, index, userData.id, leaderboardListGlobalEl, allPlayers.length, true);
        });
    });

    if (unsubscribes) unsubscribes.push(globalListener);
}

/**
 * Loads and displays the club leaderboard for coaches (allows selecting specific league)
 * @param {string} clubId - The club ID to filter players
 * @param {string} leagueToShow - The specific league to display
 * @param {Object} db - Firestore database instance
 * @param {Function} unsubscribeCallback - Callback to handle the unsubscribe function
 */
export function loadLeaderboardForCoach(clubId, leagueToShow, db, unsubscribeCallback) {
    const leaderboardListClubEl = document.getElementById('leaderboard-list-club');
    const leagueNameEl = document.getElementById('league-name');
    const leagueIconsContainer = document.getElementById('league-icons-container');

    if (!leaderboardListClubEl) return;

    if (leagueNameEl) leagueNameEl.textContent = `${leagueToShow}-Liga`;

    if (leagueIconsContainer) {
        leagueIconsContainer.innerHTML = '';
        for (const leagueKey in LEAGUES) {
            const isActive = leagueKey === leagueToShow;
            const iconDiv = document.createElement('div');
            iconDiv.className = `p-2 border-2 rounded-lg transition-transform transform ${isActive ? 'league-icon-active bg-indigo-100' : 'bg-gray-200 opacity-50'}`;
            iconDiv.innerHTML = `<svg class="h-8 w-8 ${LEAGUES[leagueKey].color}" fill="none" viewBox="0 0 24 24" stroke="currentColor">${LEAGUES[leagueKey].icon}</svg>`;
            leagueIconsContainer.appendChild(iconDiv);
        }
    }

    const q = query(
        collection(db, "users"),
        where("clubId", "==", clubId),
        where("league", "==", leagueToShow),
        where("role", "==", "player"),
        orderBy("points", "desc")
    );

    const leaderboardListener = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            leaderboardListClubEl.innerHTML = `<div class="text-center py-8 text-gray-500">Keine Spieler in dieser Liga gefunden.</div>`;
            return;
        }

        const sortedPlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const totalPlayers = sortedPlayers.length;

        leaderboardListClubEl.innerHTML = '';
        if (totalPlayers > PROMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-green-100 text-green-800 font-bold text-sm rounded-t-lg">Aufstiegszone</div>`;
        }
        sortedPlayers.slice(0, PROMOTION_COUNT).forEach((player, index) =>
            renderPlayerRow(player, index, null, leaderboardListClubEl, totalPlayers)
        );

        if (totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-gray-100 text-gray-800 font-bold text-sm">Sicherheitszone</div>`;
            sortedPlayers.slice(PROMOTION_COUNT, totalPlayers - DEMOTION_COUNT).forEach((player, index) =>
                renderPlayerRow(player, index + PROMOTION_COUNT, null, leaderboardListClubEl, totalPlayers)
            );
        } else if (totalPlayers > PROMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-gray-100 text-gray-800 font-bold text-sm">Sicherheitszone</div>`;
            sortedPlayers.slice(PROMOTION_COUNT).forEach((player, index) =>
                renderPlayerRow(player, index + PROMOTION_COUNT, null, leaderboardListClubEl, totalPlayers)
            );
        }

        if (totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) {
            leaderboardListClubEl.innerHTML += `<div class="p-2 bg-red-100 text-red-800 font-bold text-sm">Abstiegszone</div>`;
            sortedPlayers.slice(totalPlayers - DEMOTION_COUNT).forEach((player, index) =>
                renderPlayerRow(player, index + totalPlayers - DEMOTION_COUNT, null, leaderboardListClubEl, totalPlayers)
            );
        }
    }, (error) => {
        console.error("Fehler beim Laden des Leaderboards:", error);
        leaderboardListClubEl.innerHTML = `<div class="text-center py-8 text-red-500">Fehler beim Laden des Leaderboards.</div>`;
    });

    if (unsubscribeCallback) unsubscribeCallback(leaderboardListener);
}

/**
 * Renders a single player row in the leaderboard
 * @param {Object} player - Player data
 * @param {number} index - Player's index in the sorted list
 * @param {string|null} currentUserId - Current user's ID (null for coach view, no highlighting)
 * @param {HTMLElement} container - Container element to append the row to
 * @param {number} totalPlayers - Total number of players in the leaderboard
 * @param {boolean} isGlobal - Whether this is for the global leaderboard
 */
export function renderPlayerRow(player, index, currentUserId = null, container, totalPlayers = 0, isGlobal = false) {
    const isCurrentUser = currentUserId ? player.id === currentUserId : false;
    const rank = index + 1;

    const playerDiv = document.createElement('div');

    let rankDisplay = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;

    const clubInfo = isGlobal ? `<p class="text-xs text-gray-400">${player.clubId}</p>` : '';

    let zoneClass = '';
    if (isGlobal) {
        zoneClass = isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-white';
    } else if (currentUserId === null) {
        // Coach view: simple background, no user highlighting
        zoneClass = 'bg-gray-50';
    } else {
        // Player view: zone colors and user highlighting
        if (rank <= PROMOTION_COUNT) zoneClass = 'bg-green-50';
        else if (rank > totalPlayers - DEMOTION_COUNT && totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) zoneClass = 'bg-red-50';
        if (isCurrentUser) zoneClass += ' font-bold bg-indigo-100';
    }

    playerDiv.className = `flex items-center p-3 rounded-lg ${zoneClass}`;

    playerDiv.innerHTML = `
        <div class="w-10 text-center font-bold text-lg">${rankDisplay || rank}</div>
        <img src="${avatarSrc}" alt="Avatar" class="flex-shrink-0 h-10 w-10 rounded-full object-cover mr-4">
        <div class="flex-grow">
            <p class="text-sm font-medium text-gray-900">${player.firstName} ${player.lastName}</p>
            ${clubInfo}
        </div>
        <div class="text-sm font-bold text-gray-900">${player.points || 0} P.</div>
    `;
    container.appendChild(playerDiv);
}
