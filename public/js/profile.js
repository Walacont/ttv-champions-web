import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { calculateRank, getRankProgress, formatRank } from './ranks.js';

/**
 * Profile Module
 * Handles player overview data, rival information, and profile statistics
 */

/**
 * Loads overview data for the player (points, rivals, challenges, rank)
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

    // Display current rank
    updateRankDisplay(userData);

    loadRivalDataCallback(userData, db);
    loadPointsHistoryCallback(userData, db, unsubscribes);
    loadChallengesCallback(userData, db, unsubscribes);
}

/**
 * Updates the rank display in the overview section
 * @param {Object} userData - User data with eloRating and xp
 */
export function updateRankDisplay(userData) {
    const rankInfoEl = document.getElementById('rank-info');
    const eloDisplayEl = document.getElementById('elo-display');
    const xpDisplayEl = document.getElementById('xp-display');

    if (!rankInfoEl) return;

    const progress = getRankProgress(userData.eloRating, userData.xp);
    const { currentRank, nextRank, eloProgress, xpProgress, eloNeeded, xpNeeded, isMaxRank } = progress;

    // Update rank badge
    rankInfoEl.innerHTML = `
        <div class="flex items-center justify-center space-x-2 mb-2">
            <span class="text-4xl">${currentRank.emoji}</span>
            <div>
                <p class="font-bold text-xl" style="color: ${currentRank.color};">${currentRank.name}</p>
                <p class="text-xs text-gray-500">${currentRank.description}</p>
            </div>
        </div>
        ${!isMaxRank ? `
            <div class="mt-3 text-sm">
                <p class="text-gray-600 font-medium mb-2">Fortschritt zu ${nextRank.emoji} ${nextRank.name}:</p>

                <!-- Elo Progress -->
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Elo: ${userData.eloRating || 1200}/${nextRank.minElo}</span>
                        <span>${eloProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                    </div>
                    ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ Elo-Anforderung erfüllt</p>`}
                </div>

                <!-- XP Progress -->
                <div>
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>XP: ${userData.xp || 0}/${nextRank.minXP}</span>
                        <span>${xpProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-purple-600 h-2 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                    </div>
                    ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ XP-Anforderung erfüllt</p>`}
                </div>
            </div>
        ` : '<p class="text-sm text-green-600 font-medium mt-2">🏆 Höchster Rang erreicht!</p>'}
    `;

    // Update Elo display if element exists
    if (eloDisplayEl) eloDisplayEl.textContent = userData.eloRating || 1200;

    // Update XP display if element exists
    if (xpDisplayEl) xpDisplayEl.textContent = userData.xp || 0;
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
