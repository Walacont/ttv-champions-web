// Profil-Modul (Supabase-Version)

import { calculateRank, getRankProgress, formatRank } from './ranks.js';

/** Lädt Übersichtsdaten für den Spieler (Punkte, Rivalen, Challenges, Rang) */
export function loadOverviewData(
    userData,
    supabase,
    unsubscribes,
    loadRivalDataCallback,
    loadChallengesCallback,
    loadPointsHistoryCallback
) {
    // Kein Listener hier - wird bereits in dashboard.js gesetzt
    const playerPointsEl = document.getElementById('player-points');
    const playerXpEl = document.getElementById('player-xp');
    const playerEloEl = document.getElementById('player-elo');

    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;

    updateRankDisplay(userData);

    if (typeof loadRivalDataCallback === 'function') {
        loadRivalDataCallback(userData, supabase, unsubscribes);
    }

    if (typeof loadPointsHistoryCallback === 'function') {
        loadPointsHistoryCallback(userData, supabase, unsubscribes);
    }

    if (typeof loadChallengesCallback === 'function') {
        loadChallengesCallback(userData, supabase, unsubscribes);
    }
}

/** Aktualisiert die Rang-Anzeige */
export function updateRankDisplay(userData) {
    const rankInfoEl = document.getElementById('rank-info');
    const eloDisplayEl = document.getElementById('elo-display');
    const xpDisplayEl = document.getElementById('xp-display');

    if (!rankInfoEl) return;

    const progress = getRankProgress(userData.eloRating, userData.xp);
    const {
        currentRank,
        nextRank,
        eloProgress,
        xpProgress,
        eloNeeded,
        xpNeeded,
        isMaxRank,
    } = progress;

    rankInfoEl.innerHTML = `
        <div class="flex items-center justify-center space-x-2 mb-2">
            <span class="text-4xl">${currentRank.emoji}</span>
            <div>
                <p class="font-bold text-xl" style="color: ${currentRank.color};">${currentRank.name}</p>
                <p class="text-xs text-gray-500">${currentRank.description}</p>
            </div>
        </div>
        ${
            !isMaxRank
                ? `
            <div class="mt-3 text-sm">
                <p class="text-gray-600 font-medium mb-2">Fortschritt zu ${nextRank.emoji} ${nextRank.name}:</p>

                ${
                    nextRank.minElo > 0
                        ? `
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Elo: ${userData.eloRating || 0}/${nextRank.minElo}</span>
                        <span>${eloProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                    </div>
                    ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo benötigt</p>` : `<p class="text-xs text-green-600 mt-1">Elo-Anforderung erfüllt</p>`}
                </div>
                `
                        : ''
                }
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>XP: ${userData.xp || 0}/${nextRank.minXP}</span>
                        <span>${xpProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-purple-600 h-2 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                    </div>
                    ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP benötigt</p>` : `<p class="text-xs text-green-600 mt-1">XP-Anforderung erfüllt</p>`}
                </div>

            </div>
        `
                : '<p class="text-sm text-green-600 font-medium mt-2">Höchster Rang erreicht!</p>'
        }
    `;

    if (eloDisplayEl) eloDisplayEl.textContent = userData.eloRating || 0;
    if (xpDisplayEl) xpDisplayEl.textContent = userData.xp || 0;
}

/** Zeigt Rivalen-Information für Skill oder Fleiß an */
function displayRivalInfo(metric, ranking, myRankIndex, el, myValue, unit) {
    if (!el) return;

    if (myRankIndex === 0) {
        el.innerHTML = `
            <p class="text-lg text-green-600 font-semibold">
                Glückwunsch!
            </p>
            <p class="text-sm">Du bist auf dem 1. Platz in ${metric}!</p>
        `;
    } else if (myRankIndex > 0) {
        const rival = ranking[myRankIndex - 1];
        const rivalValue = (unit === 'Elo' ? rival.eloRating : rival.xp) || 0;
        const pointsDiff = rivalValue - myValue;

        el.innerHTML = `
            <p class="font-semibold text-lg">${rival.firstName} ${rival.lastName}</p>
            <p class="text-sm">${unit}: ${rivalValue}</p>
            <p class="text-sm text-red-500 font-medium">
                Du benötigst ${pointsDiff} ${unit}, um aufzuholen!
            </p>
        `;
    } else {
        el.innerHTML = `<p>Keine Ranglistendaten gefunden.</p>`;
    }
}

/** Lädt Rivalen-Daten für Skill (Elo) und Effort (XP) mit Echtzeit-Updates */
export function loadRivalData(userData, supabase, currentSubgroupFilter = 'club') {
    const rivalSkillEl = document.getElementById('rival-skill-info');
    const rivalEffortEl = document.getElementById('rival-effort-info');

    async function loadData() {
        try {
            let query = supabase
                .from('profiles')
                .select('id, first_name, last_name, elo_rating, xp, subgroup_ids')
                .in('role', ['player', 'coach', 'head_coach']);

            if (currentSubgroupFilter === 'club') {
                query = query.eq('club_id', userData.clubId);
            } else if (currentSubgroupFilter !== 'global') {
                query = query
                    .eq('club_id', userData.clubId)
                    .contains('subgroup_ids', [currentSubgroupFilter]);
            }

            const { data, error } = await query;
            if (error) throw error;

            const players = (data || []).map(p => ({
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                eloRating: p.elo_rating,
                xp: p.xp,
                subgroupIDs: p.subgroup_ids,
            }));

            // Skill-Rangliste (sortiert nach Elo)
            const skillRanking = [...players].sort((a, b) => (b.eloRating || 0) - (a.eloRating || 0));
            const currentUserInList = players.find(p => p.id === userData.id) || userData;
            const mySkillIndex = skillRanking.findIndex(p => p.id === userData.id);
            displayRivalInfo(
                'Skill',
                skillRanking,
                mySkillIndex,
                rivalSkillEl,
                currentUserInList.eloRating || 0,
                'Elo'
            );

            // Fleiß-Rangliste (sortiert nach XP)
            const effortRanking = [...players].sort((a, b) => (b.xp || 0) - (a.xp || 0));
            const myEffortIndex = effortRanking.findIndex(p => p.id === userData.id);
            displayRivalInfo(
                'Fleiß',
                effortRanking,
                myEffortIndex,
                rivalEffortEl,
                currentUserInList.xp || 0,
                'XP'
            );
        } catch (error) {
            console.error('Error loading rival data:', error);
        }
    }

    loadData();

    const subscription = supabase
        .channel('rival-data-updates')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'profiles'
            },
            () => {
                loadData();
            }
        )
        .subscribe();

    return () => subscription.unsubscribe();
}

/** Lädt Profildaten (Streaks mit Echtzeit-Updates und rendert Kalender) */
export function loadProfileData(userData, renderCalendarCallback, currentDisplayDate, supabase) {
    const streakEl = document.getElementById('stats-current-streak');

    if (streakEl && userData.id && supabase) {
        async function loadStreaks() {
            try {
                const { data: streaksData, error: streaksError } = await supabase
                    .from('player_streaks')
                    .select('*')
                    .eq('player_id', userData.id);

                if (streaksError) throw streaksError;

                if (!streaksData || streaksData.length === 0) {
                    streakEl.innerHTML = `<p class="text-sm text-gray-400">Noch keine Streaks</p>`;
                } else {
                    const subgroupIds = streaksData.map(s => s.subgroup_id).filter(Boolean);

                    let subgroupsMap = new Map();
                    if (subgroupIds.length > 0) {
                        const { data: subgroupsData } = await supabase
                            .from('subgroups')
                            .select('id, name')
                            .in('id', subgroupIds);

                        (subgroupsData || []).forEach(s => subgroupsMap.set(s.id, s.name));
                    }

                    const streaksWithNames = streaksData.map(streak => ({
                        subgroupId: streak.subgroup_id,
                        subgroupName: subgroupsMap.get(streak.subgroup_id) || 'Unbekannte Gruppe',
                        count: streak.count || 0,
                    }));

                    streaksWithNames.sort((a, b) => b.count - a.count);
                    streakEl.innerHTML = streaksWithNames
                        .map(streak => {
                            const iconSize =
                                streak.count >= 10
                                    ? 'text-xl'
                                    : streak.count >= 5
                                      ? 'text-lg'
                                      : 'text-base';
                            const textColor =
                                streak.count >= 10
                                    ? 'text-orange-600'
                                    : streak.count >= 5
                                      ? 'text-pink-600'
                                      : 'text-gray-700';
                            return `
                            <div class="flex items-center justify-between">
                                <span class="text-xs text-gray-600 truncate" title="${streak.subgroupName}">${streak.subgroupName}</span>
                                <span class="${iconSize} ${textColor} font-bold">${streak.count}</span>
                            </div>
                        `;
                        })
                        .join('');
                }
            } catch (error) {
                console.error('Error loading streaks:', error);
                streakEl.innerHTML = `<p class="text-sm text-red-500">Fehler beim Laden</p>`;
            }
        }

        loadStreaks();

        const subscription = supabase
            .channel('player-streaks-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'player_streaks',
                    filter: `player_id=eq.${userData.id}`
                },
                () => {
                    loadStreaks();
                }
            )
            .subscribe();

        renderCalendarCallback(currentDisplayDate);

        return () => subscription.unsubscribe();
    } else if (streakEl) {
        streakEl.innerHTML = `<p class="text-sm text-gray-400">Keine Daten verfügbar</p>`;
    }

    renderCalendarCallback(currentDisplayDate);
    return () => {};
}
