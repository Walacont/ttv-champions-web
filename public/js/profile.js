import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Profile Module
 * Handles player overview data, rival information, and profile statistics
 */

/**
 * Loads overview data for the player (points, rivals, challenges)
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 * @param {Function} loadRivalDataCallback - Callback to load rival data
 * @param {Function} loadChallengesCallback - Callback to load challenges
 * @param {Function} loadPointsHistoryCallback - Callback to load points history
 */
export function loadOverviewData(userData, db, unsubscribes, loadRivalDataCallback, loadChallengesCallback, loadPointsHistoryCallback) {
    const playerPointsEl = document.getElementById('player-points');
    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    loadRivalDataCallback(userData, db);
    loadPointsHistoryCallback(userData, db, unsubscribes);
    loadChallengesCallback(userData, db, unsubscribes);
}

/**
 * Loads rival data (player ahead or behind in the leaderboard)
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 */
export async function loadRivalData(userData, db) {
    const rivalInfoEl = document.getElementById('rival-info');
    if (!rivalInfoEl) return;

    const q = query(
        collection(db, "users"),
        where("clubId", "==", userData.clubId),
        where("role", "==", "player"),
        where("league", "==", userData.league || 'Bronze')
    );

    const querySnapshot = await getDocs(q);
    const players = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const sortedPlayers = players.sort((a, b) => (b.points || 0) - (a.points || 0));
    const myRankIndex = sortedPlayers.findIndex(p => p.id === userData.id);

    if (myRankIndex === 0) {
        // Player is in first place
        if (sortedPlayers.length > 1) {
            const rival = sortedPlayers[1];
            const pointsDiff = (userData.points || 0) - (rival.points || 0);
            rivalInfoEl.innerHTML = `
                <p class="font-semibold text-lg">${rival.firstName} ${rival.lastName}</p>
                <p class="text-sm">Punkte: ${rival.points || 0}</p>
                <p class="text-sm text-green-600 font-medium">Du hast einen Vorsprung von ${pointsDiff} Punkten!</p>
            `;
        } else {
            rivalInfoEl.innerHTML = `<p class="text-green-600 font-semibold">🎉 Du bist alleiniger Herrscher dieser Liga!</p>`;
        }
    } else if (myRankIndex > 0) {
        // Player is not in first place
        const rival = sortedPlayers[myRankIndex - 1];
        const pointsDiff = (rival.points || 0) - (userData.points || 0);
        rivalInfoEl.innerHTML = `
            <p class="font-semibold text-lg">${rival.firstName} ${rival.lastName}</p>
            <p class="text-sm">Punkte: ${rival.points || 0}</p>
            <p class="text-sm text-red-500 font-medium">Du benötigst ${pointsDiff} Punkte, um aufzuholen!</p>
        `;
    } else {
        rivalInfoEl.innerHTML = `<p>Keine Ranglistendaten gefunden.</p>`;
    }
}

/**
 * Loads profile data (streak and renders calendar)
 * @param {Object} userData - User data
 * @param {Function} renderCalendarCallback - Callback to render calendar
 * @param {Date} currentDisplayDate - Current display date for calendar
 */
export function loadProfileData(userData, renderCalendarCallback, currentDisplayDate) {
    const streakEl = document.getElementById('stats-current-streak');
    if (streakEl) streakEl.innerHTML = `${userData.streak || 0} 🔥`;
    renderCalendarCallback(currentDisplayDate);
}
