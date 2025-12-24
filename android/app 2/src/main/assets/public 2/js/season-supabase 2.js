import { LEAGUES, PROMOTION_COUNT, DEMOTION_COUNT } from './leaderboard-supabase.js';
import { loadLeaderboardForCoach } from './leaderboard-supabase.js';
import { getSeasonEndDate } from './ui-utils.js';

/**
 * Season Management Module (Supabase Version)
 * Handles season resets, league promotions/demotions, and league selector management
 */

/**
 * Checks and resets season for entire club (called by coach)
 * NOTE: Season resets are now handled by Edge Function (every 6 weeks)
 * This function only checks if a reset has occurred and is no longer needed for testing
 * @param {string} clubId - Club ID
 * @param {Object} supabase - Supabase client instance
 */
export async function checkAndResetClubSeason(clubId, supabase) {
    // DISABLED: Season resets are now fully handled by Edge Function
    // This function is kept for backwards compatibility but does nothing
    console.log('Season check: Edge Function handles all resets (6-week cycle)');
    return;
}

/**
 * DEPRECATED: Season reset logic (now handled by Edge Function)
 * This function is kept for reference but is no longer called
 * Edge Function `autoSeasonReset` handles all resets every 6 weeks
 * @param {string} userId - User ID
 * @param {Object} userData - User data
 * @param {Object} supabase - Supabase client instance
 */
export async function handleSeasonReset(userId, userData, supabase) {
    console.warn(
        'handleSeasonReset called - this is deprecated. Edge Function handles resets.'
    );
    // Function body kept for reference but does nothing
    return;

    /* ORIGINAL LOGIC - NOW IN EDGE FUNCTION
    const now = new Date();
    const lastReset = userData.lastSeasonReset;

    if (!lastReset) {
        await supabase
            .from('profiles')
            .update({
                last_season_reset: new Date().toISOString(),
                league: userData.league || 'Bronze'
            })
            .eq('id', userId);
        return;
    }

    // ... rest of logic moved to Edge Function autoSeasonReset
    */
}

/**
 * Loads available leagues for the league selector (coach view)
 * @param {string} clubId - Club ID
 * @param {Object} supabase - Supabase client instance
 * @param {Function} setUnsubscribeCallback - Callback to manage leaderboard unsubscribe
 */
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
