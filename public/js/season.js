// Saison-Verwaltung (Firebase-Version)

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

// Saison-Resets werden durch Cloud Function gesteuert (6-Wochen-Zyklus)
export async function checkAndResetClubSeason(clubId, db) {
    console.log('Saison-Check: Cloud Function übernimmt alle Resets (6-Wochen-Zyklus)');
    return;
}

// Veraltet: Saison-Reset-Logik jetzt in Cloud Function `autoSeasonReset`
export async function handleSeasonReset(userId, userData, db) {
    console.warn(
        'handleSeasonReset aufgerufen - veraltet. Cloud Function übernimmt Resets.'
    );
    return;
}

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
