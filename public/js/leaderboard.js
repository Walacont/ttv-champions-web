import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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

    if (!toggleClubBtn || !toggleGlobalBtn) return;

    toggleClubBtn.classList.add('toggle-btn-active');
    toggleClubBtn.addEventListener('click', () => {
        toggleClubBtn.classList.add('toggle-btn-active');
        toggleGlobalBtn.classList.remove('toggle-btn-active');
        leaderboardClubContainer.classList.remove('hidden');
        leaderboardGlobalContainer.classList.add('hidden');
    });
    toggleGlobalBtn.addEventListener('click', () => {
        toggleGlobalBtn.classList.add('toggle-btn-active');
        toggleClubBtn.classList.remove('toggle-btn-active');
        leaderboardGlobalContainer.classList.remove('hidden');
        leaderboardClubContainer.classList.add('hidden');
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
 * Renders a single player row in the leaderboard
 * @param {Object} player - Player data
 * @param {number} index - Player's index in the sorted list
 * @param {string} currentUserId - Current user's ID
 * @param {HTMLElement} container - Container element to append the row to
 * @param {number} totalPlayers - Total number of players in the leaderboard
 * @param {boolean} isGlobal - Whether this is for the global leaderboard
 */
export function renderPlayerRow(player, index, currentUserId, container, totalPlayers, isGlobal = false) {
    const isCurrentUser = player.id === currentUserId;
    const rank = index + 1;

    const playerDiv = document.createElement('div');

    let rankDisplay = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : rank));
    const initials = (player.firstName?.[0] || '') + (player.lastName?.[0] || '');
    const avatarSrc = player.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;

    const clubInfo = isGlobal ? `<p class="text-xs text-gray-400">${player.clubId}</p>` : '';

    let zoneClass = '';
    if (isGlobal) {
        zoneClass = isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-white';
    } else {
         if (rank <= PROMOTION_COUNT) zoneClass = 'bg-green-50';
         else if (rank > totalPlayers - DEMOTION_COUNT && totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) zoneClass = 'bg-red-50';
         if(isCurrentUser) zoneClass += ' font-bold bg-indigo-100';
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
