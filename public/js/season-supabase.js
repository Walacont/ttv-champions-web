// Saison-Verwaltung (Supabase-Version)

import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT } from './leaderboard-supabase.js';
import { loadLeaderboardForCoach } from './leaderboard-supabase.js';
import { getSeasonEndDate } from './ui-utils.js';

// Saison-Resets werden durch Edge Function gesteuert (6-Wochen-Zyklus)
export async function checkAndResetClubSeason(clubId, supabase) {
    console.log('Saison-Check: Edge Function übernimmt alle Resets (6-Wochen-Zyklus)');
    return;
}

// Veraltet: Saison-Reset-Logik jetzt in Edge Function `autoSeasonReset`
export async function handleSeasonReset(userId, userData, supabase) {
    console.warn(
        'handleSeasonReset aufgerufen - veraltet. Edge Function übernimmt Resets.'
    );
    return;
}

export async function loadLeaguesForSelector(clubId, supabase, setUnsubscribeCallback) {
    const coachLeagueSelect = document.getElementById('coach-league-select');
    if (!coachLeagueSelect) return;

    try {
        const { data: players, error } = await supabase
            .from('profiles')
            .select('league')
            .eq('club_id', clubId)
            .eq('role', 'player');

        if (error) throw error;

        const leagues = [...new Set((players || []).map(p => p.league || 'Bronze'))].sort();

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
                loadLeaderboardForCoach(clubId, league, supabase, setUnsubscribeCallback);
            });
            coachLeagueSelect.appendChild(button);
        });

        if (leagues.length > 0) {
            const firstButton = coachLeagueSelect.querySelector('button');
            if (firstButton) firstButton.click();
        } else {
            loadLeaderboardForCoach(clubId, 'Bronze', supabase, setUnsubscribeCallback);
        }
    } catch (error) {
        console.error('Fehler beim Laden der Ligen:', error);
    }
}
