import {
    collection,
    doc,
    getDocs,
    query,
    where,
    updateDoc,
    writeBatch,
    serverTimestamp,
    deleteDoc,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT } from './leaderboard.js';
import { loadLeaderboardForCoach } from './leaderboard.js';
import { getSeasonEndDate } from './ui-utils.js';

/**
 * Season Management Module
 * Handles season resets, league promotions/demotions, and league selector management
 */

/**
 * Checks and resets season for entire club (called by coach)
 * NOTE: Season resets are now handled by Cloud Function (every 6 weeks)
 * This function only checks if a reset has occurred and is no longer needed for testing
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 */
export async function checkAndResetClubSeason(clubId, db) {
    // DISABLED: Season resets are now fully handled by Cloud Function
    // This function is kept for backwards compatibility but does nothing
    console.log('✅ Season check: Cloud Function handles all resets (6-week cycle)');
    return;
}

/**
 * DEPRECATED: Season reset logic (now handled by Cloud Function)
 * This function is kept for reference but is no longer called
 * Cloud Function `autoSeasonReset` handles all resets every 6 weeks
 * @param {string} userId - User ID
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 */
export async function handleSeasonReset(userId, userData, db) {
    console.warn(
        '⚠️ handleSeasonReset called - this is deprecated. Cloud Function handles resets.'
    );
    // Function body kept for reference but does nothing
    return;

    /* ORIGINAL LOGIC - NOW IN CLOUD FUNCTION
    const now = new Date();
    const lastReset = userData.lastSeasonReset?.toDate();

    if (!lastReset) {
        await updateDoc(doc(db, 'users', userId), {
            lastSeasonReset: serverTimestamp(),
            league: userData.league || 'Bronze'
        });
        return;
    }

    // ... rest of logic moved to Cloud Function autoSeasonReset
    */
}

/**
 * Loads available leagues for the league selector (coach view)
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Function} setUnsubscribeCallback - Callback to manage leaderboard unsubscribe
 */
export async function loadLeaguesForSelector(clubId, db, setUnsubscribeCallback) {
    const coachLeagueSelect = document.getElementById('coach-league-select');
    if (!coachLeagueSelect) return;

    const q = query(
        collection(db, 'users'),
        where('clubId', '==', clubId),
        where('role', '==', 'player')
    );

    try {
        const querySnapshot = await getDocs(q);
        const players = querySnapshot.docs.map(doc => doc.data());
        const leagues = [...new Set(players.map(p => p.league || 'Bronze'))].sort();

        coachLeagueSelect.innerHTML = '';
        leagues.forEach(league => {
            const button = document.createElement('button');
            button.className =
                'league-select-btn border-2 border-gray-300 rounded-full px-4 py-1 text-sm font-medium hover:bg-gray-200';
            button.textContent = league;
            button.dataset.league = league;
            button.addEventListener('click', () => {
                document
                    .querySelectorAll('.league-select-btn')
                    .forEach(btn => btn.classList.remove('league-select-btn-active'));
                button.classList.add('league-select-btn-active');
                loadLeaderboardForCoach(clubId, league, db, setUnsubscribeCallback);
            });
            coachLeagueSelect.appendChild(button);
        });

        if (leagues.length > 0) {
            const firstButton = coachLeagueSelect.querySelector('button');
            if (firstButton) firstButton.click();
        } else {
            loadLeaderboardForCoach(clubId, 'Bronze', db, setUnsubscribeCallback);
        }
    } catch (error) {
        console.error('Fehler beim Laden der Ligen:', error);
    }
}
