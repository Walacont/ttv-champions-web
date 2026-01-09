import {
    collection,
    getDocs,
    getDoc,
    onSnapshot,
    query,
    where,
    doc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
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
export function loadOverviewData(
    userData,
    db,
    unsubscribes,
    loadRivalDataCallback,
    loadChallengesCallback,
    loadPointsHistoryCallback
) {

    const playerPointsEl = document.getElementById('player-points');
    const playerXpEl = document.getElementById('player-xp');
    const playerEloEl = document.getElementById('player-elo');

    if (playerPointsEl) playerPointsEl.textContent = userData.points || 0;
    if (playerXpEl) playerXpEl.textContent = userData.xp || 0;
    if (playerEloEl) playerEloEl.textContent = userData.eloRating || 0;

    updateRankDisplay(userData);


    if (typeof loadRivalDataCallback === 'function') {
        loadRivalDataCallback(userData, db, unsubscribes);
    }

    loadPointsHistoryCallback(userData, db, unsubscribes);
    loadChallengesCallback(userData, db, unsubscribes);
}

/**
 * Updates the rank display in the overview section
 * ⚠️ Diese Funktion wird von dashboard.js aufgerufen, wenn sich userData ändert!
 * @param {Object} userData - User data with eloRating and xp
 */
export function updateRankDisplay(userData) {
    const rankInfoEl = document.getElementById('rank-info');
    const eloDisplayEl = document.getElementById('elo-display');
    const xpDisplayEl = document.getElementById('xp-display');

    if (!rankInfoEl) return;

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
                    ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ Elo-Anforderung erfüllt</p>`}
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
                    ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ XP-Anforderung erfüllt</p>`}
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
                        ${grundlagenNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''} bis du Wettkämpfe spielen kannst</p>` : `<p class="text-xs text-green-600 mt-1">✓ Grundlagen abgeschlossen - du kannst Wettkämpfe spielen!</p>`}
                    </div>
                `
                        : ''
                }
            </div>
        `
                : '<p class="text-sm text-green-600 font-medium mt-2">🏆 Höchster Rang erreicht!</p>'
        }
    `;

    if (eloDisplayEl) eloDisplayEl.textContent = userData.eloRating || 0;

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
        el.innerHTML = `
            <p class="text-lg text-green-600 font-semibold">
                🎉 Glückwunsch!
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

/**
 * Lädt Rivalen-Daten für Skill (Elo) und Effort (XP)
 * *** JETZT MIT onSnapshot FÜR ECHTZEIT-UPDATES ***
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 * @param {string} currentSubgroupFilter - Current subgroup filter ("club", "global", or subgroupId)
 * @returns {Function} Unsubscribe function for the listener
 */
export function loadRivalData(userData, db, currentSubgroupFilter = 'club') {
    const rivalSkillEl = document.getElementById('rival-skill-info');
    const rivalEffortEl = document.getElementById('rival-effort-info');

    let q;
    if (currentSubgroupFilter === 'club') {
        q = query(
            collection(db, 'users'),
            where('clubId', '==', userData.clubId),
            where('role', '==', 'player')
        );
    } else if (currentSubgroupFilter === 'global') {
        q = query(collection(db, 'users'), where('role', '==', 'player'));
    } else {
        q = query(
            collection(db, 'users'),
            where('clubId', '==', userData.clubId),
            where('role', '==', 'player'),
            where('subgroupIDs', 'array-contains', currentSubgroupFilter)
        );
    }

    const rivalListener = onSnapshot(q, querySnapshot => {
        const players = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));


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
    });

    return rivalListener;
}

/**
 * Updates the Grundlagen progress display
 * ⚠️ DEPRECATED: Diese Funktion wird nicht mehr verwendet, da Grundlagen jetzt in updateRankDisplay() angezeigt werden
 * @param {Object} userData - User data with grundlagenCompleted
 */
export function updateGrundlagenDisplay(userData) {
    const grundlagenCard = document.getElementById('grundlagen-card');
    const grundlagenProgressBar = document.getElementById('grundlagen-progress-bar');
    const grundlagenStatus = document.getElementById('grundlagen-status');

    if (!grundlagenCard) return;

    const grundlagenCount = userData.grundlagenCompleted || 0;
    const grundlagenRequired = 5;

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
 * @param {Object} db - Firestore database instance
 * @returns {Function} Unsubscribe function for the streaks listener
 */
export function loadProfileData(userData, renderCalendarCallback, currentDisplayDate, db) {
    const streakEl = document.getElementById('stats-current-streak');

    if (streakEl && userData.id && db) {
        const streaksQuery = collection(db, `users/${userData.id}/streaks`);

        const streaksListener = onSnapshot(
            streaksQuery,
            async snapshot => {
                if (snapshot.empty) {
                    streakEl.innerHTML = `<p class="text-sm text-gray-400">Noch keine Streaks</p>`;
                } else {
                    const streaksWithNames = [];

                    for (const streakDoc of snapshot.docs) {
                        const streakData = streakDoc.data();
                        const subgroupId = streakDoc.id;
                        const count = streakData.count || 0;

                        let subgroupName = 'Unbekannte Gruppe';
                        try {
                            const subgroupDocRef = doc(db, 'subgroups', subgroupId);
                            const subgroupDocSnap = await getDoc(subgroupDocRef);
                            if (subgroupDocSnap.exists()) {
                                subgroupName = subgroupDocSnap.data().name;
                            }
                        } catch (error) {
                            console.error(`Error loading subgroup name for ${subgroupId}:`, error);
                        }

                        streaksWithNames.push({
                            subgroupId,
                            subgroupName,
                            count,
                        });
                    }

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
                                <span class="${iconSize} ${textColor} font-bold">${streak.count} 🔥</span>
                            </div>
                        `;
                        })
                        .join('');
                }
            },
            error => {
                console.error('Error loading streaks:', error);
                streakEl.innerHTML = `<p class="text-sm text-red-500">Fehler beim Laden</p>`;
            }
        );

        renderCalendarCallback(currentDisplayDate);

        return streaksListener;
    } else if (streakEl) {
        streakEl.innerHTML = `<p class="text-sm text-gray-400">Keine Daten verfügbar</p>`;
    }

    renderCalendarCallback(currentDisplayDate);
    return () => {};
}
