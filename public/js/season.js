import { collection, doc, getDocs, query, where, updateDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT } from './leaderboard.js';
import { loadLeaderboardForCoach } from './leaderboard.js';

/**
 * Season Management Module
 * Handles season resets, league promotions/demotions, and league selector management
 */

/**
 * Handles season reset logic for players
 * Checks if a new season has started and processes league changes
 * @param {string} userId - User ID
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 */
export async function handleSeasonReset(userId, userData, db) {
    const now = new Date();
    const lastReset = userData.lastSeasonReset?.toDate();

    if (!lastReset) {
        await updateDoc(doc(db, 'users', userId), {
            lastSeasonReset: serverTimestamp(),
            league: userData.league || 'Bronze'
        });
        return;
    }

    const lastResetDay = lastReset.getDate();
    const lastResetMonth = lastReset.getMonth();
    const lastResetYear = lastReset.getFullYear();

    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const needsReset = (currentYear > lastResetYear) ||
                       (currentMonth > lastResetMonth) ||
                       (lastResetDay < 15 && currentDay >= 15);

    if (!needsReset) return;

    const loaderText = document.getElementById('loader-text');
    const pageLoader = document.getElementById('page-loader');
    if (loaderText) loaderText.textContent = "Neue Saison startet! Berechne Ergebnisse...";
    if (pageLoader) pageLoader.style.display = 'flex';

    try {
        const clubId = userData.clubId;
        const batch = writeBatch(db);
        const allPlayersQuery = query(collection(db, "users"), where("clubId", "==", clubId), where("role", "==", "player"));
        const allPlayersSnapshot = await getDocs(allPlayersQuery);
        const allPlayers = allPlayersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const playersByLeague = allPlayers.reduce((acc, player) => {
            const league = player.league || 'Bronze';
            if (!acc[league]) acc[league] = [];
            acc[league].push(player);
            return acc;
        }, {});

        for (const leagueName in playersByLeague) {
            const playersInLeague = playersByLeague[leagueName];
            const sortedPlayers = playersInLeague.sort((a, b) => (b.points || 0) - (a.points || 0));
            const totalPlayers = sortedPlayers.length;
            const leagueKeys = Object.keys(LEAGUES);

            sortedPlayers.forEach((player, index) => {
                const rank = index + 1;
                const playerRef = doc(db, 'users', player.id);
                let newLeague = leagueName;

                if (rank <= PROMOTION_COUNT) {
                    const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                    if (currentLeagueIndex < leagueKeys.length - 1) newLeague = leagueKeys[currentLeagueIndex + 1];
                } else if (rank > totalPlayers - DEMOTION_COUNT && totalPlayers > PROMOTION_COUNT + DEMOTION_COUNT) {
                    const currentLeagueIndex = leagueKeys.indexOf(leagueName);
                    if (currentLeagueIndex > 0) newLeague = leagueKeys[currentLeagueIndex - 1];
                }
                batch.update(playerRef, { points: 0, league: newLeague });
            });
        }

        allPlayers.forEach(player => {
            batch.update(doc(db, 'users', player.id), { lastSeasonReset: serverTimestamp() });
        });

        await batch.commit();
    } catch (error) {
        console.error("Fehler beim Saison-Reset:", error);
    }
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

    const q = query(collection(db, "users"), where("clubId", "==", clubId), where("role", "==", "player"));

    try {
        const querySnapshot = await getDocs(q);
        const players = querySnapshot.docs.map(doc => doc.data());
        const leagues = [...new Set(players.map(p => p.league || 'Bronze'))].sort();

        coachLeagueSelect.innerHTML = '';
        leagues.forEach(league => {
            const button = document.createElement('button');
            button.className = 'league-select-btn border-2 border-gray-300 rounded-full px-4 py-1 text-sm font-medium hover:bg-gray-200';
            button.textContent = league;
            button.dataset.league = league;
            button.addEventListener('click', () => {
                document.querySelectorAll('.league-select-btn').forEach(btn => btn.classList.remove('league-select-btn-active'));
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
        console.error("Fehler beim Laden der Ligen:", error);
    }
}
