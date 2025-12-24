import { calculateRank, getRankProgress, formatRank } from './ranks.js';

/**
 * Profile Module (Supabase Version)
 * Handles player overview data, rival information, and profile statistics
 */

/**
 * Loads overview data for the player (points, rivals, challenges, rank)
 * @param {Object} userData - User data
 * @param {Object} supabase - Supabase client instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 * @param {Function|null} loadRivalDataCallback - Callback to load rival data (optional)
 * @param {Function|null} loadChallengesCallback - Callback to load challenges (optional)
 * @param {Function|null} loadPointsHistoryCallback - Callback to load points history (optional)
 */
export function loadOverviewData(
    userData,
    supabase,
    unsubscribes,
    loadRivalDataCallback,
    loadChallengesCallback,
    loadPointsHistoryCallback
) {
    // WICHTIG: Wir setzen KEINEN Listener für das User-Dokument hier auf,
    // da das bereits in dashboard.js passiert!
    // Wir zeigen nur die initialen Werte an:

    const playerPointsEl = document.getElementById('player-points');
    const playerXpEl = document.getElementById('player-xp');
    const playerEloEl = document.getElementById('player-elo');

    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;

    // Display current rank (wird automatisch durch dashboard.js aktualisiert)
    updateRankDisplay(userData);

    // Check if callback is provided before calling
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

/**
 * Updates the rank display in the overview section
 * Diese Funktion wird von dashboard.js aufgerufen, wenn sich userData ändert!
 * @param {Object} userData - User data with eloRating and xp
 */
export function updateRankDisplay(userData) {
    const rankInfoEl = document.getElementById('rank-info');
    const eloDisplayEl = document.getElementById('elo-display');
    const xpDisplayEl = document.getElementById('xp-display');

    if (!rankInfoEl) return;

    // Get Grundlagen count from user data (defaults to 0)
    const grundlagenCount = userData.grundlagenCompleted || 0;

    const progress = getRankProgress(userData.eloRating, userData.xp, grundlagenCount);
    const {
        currentRank,
        nextRank,
        eloProgress,
        xpProgress,
        eloNeeded,
        xpNeeded,
        grundlagenNeeded,
        grundlagenProgress,
        isMaxRank,
    } = progress;

    // Update rank badge
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

                ${
                    nextRank.requiresGrundlagen
                        ? `
                    <div>
                        <div class="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Grundlagen-Übungen: ${grundlagenCount}/${nextRank.grundlagenRequired || 5}</span>
                            <span>${grundlagenProgress}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-green-600 h-2 rounded-full transition-all" style="width: ${grundlagenProgress}%"></div>
                        </div>
                        ${grundlagenNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''} bis du Wettkämpfe spielen kannst</p>` : `<p class="text-xs text-green-600 mt-1">Grundlagen abgeschlossen - du kannst Wettkämpfe spielen!</p>`}
                    </div>
                `
                        : ''
                }
            </div>
        `
                : '<p class="text-sm text-green-600 font-medium mt-2">Höchster Rang erreicht!</p>'
        }
    `;

    // Update Elo display if element exists
    if (eloDisplayEl) eloDisplayEl.textContent = userData.eloRating || 0;

    // Update XP display if element exists
    if (xpDisplayEl) xpDisplayEl.textContent = userData.xp || 0;
}

/**
 * Zeigt die Rivalen-Information für einen bestimmten Metrik (Skill oder Effort) an.
 * @param {string} metric - 'Skill' or 'Fleiß'
 * @param {Array} ranking - Die sortierte Spielerliste
 * @param {number} myRankIndex - Der Index des aktuellen Spielers (0-basiert)
 * @param {HTMLElement} el - Das HTML-Element, das befüllt werden soll
 * @param {number} myValue - Der Wert des aktuellen Spielers (z.B. seine Elo-Zahl)
 * @param {string} unit - Die Einheit (z.B. "Elo" oder "XP")
 */
function displayRivalInfo(metric, ranking, myRankIndex, el, myValue, unit) {
    if (!el) return;

    if (myRankIndex === 0) {
        // Spieler ist auf Platz 1
        el.innerHTML = `
            <p class="text-lg text-green-600 font-semibold">
                Glückwunsch!
            </p>
            <p class="text-sm">Du bist auf dem 1. Platz in ${metric}!</p>
        `;
    } else if (myRankIndex > 0) {
        // Spieler ist nicht auf Platz 1
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
        // Spieler nicht gefunden (sollte nicht passieren)
        el.innerHTML = `<p>Keine Ranglistendaten gefunden.</p>`;
    }
}

/**
 * Lädt Rivalen-Daten für Skill (Elo) und Effort (XP)
 * @param {Object} userData - User data
 * @param {Object} supabase - Supabase client instance
 * @param {string} currentSubgroupFilter - Current subgroup filter ("club", "global", or subgroupId)
 * @returns {Function} Unsubscribe function for the listener
 */
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
                // Specific subgroup filter
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

            // Skill-Rangliste (sortiert nach eloRating)
            const skillRanking = [...players].sort((a, b) => (b.eloRating || 0) - (a.eloRating || 0));

            // Finde den aktuellen User in der Liste (für aktuelle Werte)
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

            // Effort-Rangliste (sortiert nach xp)
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

    // Initial load
    loadData();

    // Set up real-time subscription
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

    // Return the unsubscribe function
    return () => subscription.unsubscribe();
}

/**
 * Updates the Grundlagen progress display
 * DEPRECATED: Diese Funktion wird nicht mehr verwendet, da Grundlagen jetzt in updateRankDisplay() angezeigt werden
 * @param {Object} userData - User data with grundlagenCompleted
 */
export function updateGrundlagenDisplay(userData) {
    const grundlagenCard = document.getElementById('grundlagen-card');
    const grundlagenProgressBar = document.getElementById('grundlagen-progress-bar');
    const grundlagenStatus = document.getElementById('grundlagen-status');

    // Die 'grundlagen-card' existiert nicht mehr im neuen Design
    if (!grundlagenCard) return;

    const grundlagenCount = userData.grundlagenCompleted || 0;
    const grundlagenRequired = 5;

    // Only show card if player hasn't completed all Grundlagen
    if (grundlagenCount < grundlagenRequired) {
        grundlagenCard.classList.remove('hidden');
        const progress = (grundlagenCount / grundlagenRequired) * 100;

        if (grundlagenProgressBar) {
            grundlagenProgressBar.style.width = `${progress}%`;
        }

        if (grundlagenStatus) {
            grundlagenStatus.textContent = `${grundlagenCount}/${grundlagenRequired} Grundlagen-Übungen absolviert`;

            if (grundlagenCount > 0) {
                grundlagenStatus.classList.remove('text-gray-600');
                grundlagenStatus.classList.add('text-green-600', 'font-semibold');
            }
        }
    } else {
        grundlagenCard.classList.add('hidden');
    }
}

/**
 * Loads profile data (streaks with real-time updates and renders calendar)
 * @param {Object} userData - User data
 * @param {Function} renderCalendarCallback - Callback to render calendar
 * @param {Date} currentDisplayDate - Current display date for calendar
 * @param {Object} supabase - Supabase client instance
 * @returns {Function} Unsubscribe function for the streaks listener
 */
export function loadProfileData(userData, renderCalendarCallback, currentDisplayDate, supabase) {
    const streakEl = document.getElementById('stats-current-streak');

    // Setup real-time listener for all streaks
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
                    // Get subgroup names
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

                    // Sort by count (highest first)
                    streaksWithNames.sort((a, b) => b.count - a.count);

                    // Display all streaks
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

        // Initial load
        loadStreaks();

        // Set up real-time subscription
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
        // Fallback if no supabase provided
        streakEl.innerHTML = `<p class="text-sm text-gray-400">Keine Daten verfügbar</p>`;
    }

    renderCalendarCallback(currentDisplayDate);
    return () => {}; // Empty unsubscribe function
}
