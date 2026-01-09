import {
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Match Suggestions Module
 * Provides opponent suggestions based on match history and player ratings
 */

/** Berechnet Gegner-Vorschlaege basierend auf Spielhistorie */
export async function calculateMatchSuggestions(userData, allPlayers, db) {
    try {
        const eligiblePlayers = allPlayers.filter(p => {
            const isNotSelf = p.id !== userData.id;
            const isMatchReady = (p.grundlagenCompleted || 0) >= 5;
            const isPlayer = p.role === 'player';
            return isNotSelf && isMatchReady && isPlayer;
        });

        const matchesWithPlayerIds = query(
            collection(db, 'matches'),
            where('playerIds', 'array-contains', userData.id)
        );
        const matchesAsPlayerA = query(
            collection(db, 'matches'),
            where('playerAId', '==', userData.id)
        );
        const matchesAsPlayerB = query(
            collection(db, 'matches'),
            where('playerBId', '==', userData.id)
        );

        const [matchesSnapshot1, matchesSnapshot2, matchesSnapshot3] = await Promise.all([
            getDocs(matchesWithPlayerIds),
            getDocs(matchesAsPlayerA),
            getDocs(matchesAsPlayerB),
        ]);

        const allMatchDocs = new Map();
        [matchesSnapshot1, matchesSnapshot2, matchesSnapshot3].forEach(snapshot => {
            snapshot.forEach(doc => {
                allMatchDocs.set(doc.id, doc);
            });
        });

        const opponentHistory = {};
        allMatchDocs.forEach(doc => {
            const match = doc.data();
            const opponentId = match.playerAId === userData.id ? match.playerBId : match.playerAId;

            if (!opponentHistory[opponentId]) {
                opponentHistory[opponentId] = {
                    matchCount: 0,
                    lastMatchDate: null,
                };
            }

            opponentHistory[opponentId].matchCount++;

            const matchDate = match.playedAt?.toDate?.() || match.createdAt?.toDate?.();
            if (
                matchDate &&
                (!opponentHistory[opponentId].lastMatchDate ||
                    matchDate > opponentHistory[opponentId].lastMatchDate)
            ) {
                opponentHistory[opponentId].lastMatchDate = matchDate;
            }
        });

        const now = new Date();

        const suggestions = eligiblePlayers.map(player => {
            const history = opponentHistory[player.id] || { matchCount: 0, lastMatchDate: null };
            const playerElo = player.eloRating || 1000;
            const myElo = userData.eloRating || 1000;
            const eloDiff = Math.abs(myElo - playerElo);

            let score = 100; // Base score

            if (history.matchCount === 0) {
                score += 50;
            } else {
                score -= history.matchCount * 5;
            }

            if (history.lastMatchDate) {
                const daysSinceLastMatch = (now - history.lastMatchDate) / (1000 * 60 * 60 * 24);
                score += Math.min(daysSinceLastMatch / 7, 30); // Up to +30 for 30+ weeks
            }


            return {
                ...player,
                suggestionScore: Math.max(0, score),
                history: history,
                eloDiff: eloDiff,
            };
        });

        suggestions.sort((a, b) => b.suggestionScore - a.suggestionScore);

        const neverPlayedPlayers = suggestions.filter(s => s.history.matchCount === 0);

        if (neverPlayedPlayers.length > 0) {
            return neverPlayedPlayers.slice(0, 4);
        } else {
            const randomSuggestions = [...suggestions].sort(() => Math.random() - 0.5);
            return randomSuggestions.slice(0, 4);
        }
    } catch (error) {
        console.error('Error calculating match suggestions:', error);
        return [];
    }
}

/** Laedt und rendert Gegner-Vorschlaege */
export async function loadMatchSuggestions(
    userData,
    db,
    unsubscribes = [],
    subgroupFilter = 'club'
) {
    const container = document.getElementById('match-suggestions-list');
    if (!container) return;

    const grundlagenCompleted = userData.grundlagenCompleted || 0;
    const isMatchReady = grundlagenCompleted >= 5;

    if (!isMatchReady) {
        container.innerHTML = `
      <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm text-yellow-700">
              <strong>🔒 Match-Vorschläge gesperrt!</strong><br>
              Du musst zuerst <strong>5 Grundlagen-Übungen</strong> absolvieren.<br>
              Fortschritt: <strong>${grundlagenCompleted}/5</strong> abgeschlossen.
              ${grundlagenCompleted > 0 ? `<br>Noch <strong>${5 - grundlagenCompleted}</strong> Übung${5 - grundlagenCompleted === 1 ? '' : 'en'} bis zur Freischaltung!` : ''}
            </p>
          </div>
        </div>
      </div>
    `;
        return; // Exit early
    }

    container.innerHTML =
        '<p class="text-gray-500 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Lade Vorschläge...</p>';

    console.log('[Match Suggestions] Loading with filter:', subgroupFilter);

    try {
        if (subgroupFilter === 'global') {
            container.innerHTML = `
        <div class="bg-blue-50 border-l-4 border-blue-400 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-blue-700">
                <strong>ℹ️ Hinweis</strong><br>
                Gegnervorschläge sind nur in der Club-Ansicht verfügbar.
              </p>
            </div>
          </div>
        </div>
      `;
            return;
        }

        let playersQuery;
        playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', userData.clubId),
            where('role', '==', 'player')
        );

        const snapshot = await getDocs(playersQuery);
        let allPlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log('[Match Suggestions] Players before filter:', allPlayers.length);
        console.log(
            '[Match Suggestions] Sample player subgroups:',
            allPlayers.slice(0, 3).map(p => ({ name: p.firstName, subgroupIDs: p.subgroupIDs }))
        );

        if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
            console.log('[Match Suggestions] Applying subgroup filter:', subgroupFilter);
            allPlayers = allPlayers.filter(player =>
                (player.subgroupIDs || []).includes(subgroupFilter)
            );
            console.log('[Match Suggestions] Players after filter:', allPlayers.length);
        }

        const renderSuggestions = async () => {
            const suggestions = await calculateMatchSuggestions(userData, allPlayers, db);

            if (suggestions.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-500 text-center py-4">Keine Vorschläge verfügbar</p>';
                return;
            }

            container.innerHTML = '';

            suggestions.forEach(player => {
                const card = createSuggestionCard(player, userData, db);
                container.appendChild(card);
            });
        };

        await renderSuggestions();

        const matchesQueryNew = query(
            collection(db, 'matches'),
            where('playerIds', 'array-contains', userData.id)
        );
        const matchesQueryA = query(
            collection(db, 'matches'),
            where('playerAId', '==', userData.id)
        );
        const matchesQueryB = query(
            collection(db, 'matches'),
            where('playerBId', '==', userData.id)
        );

        const unsubscribe1 = onSnapshot(matchesQueryNew, async () => {
            await renderSuggestions();
        });
        const unsubscribe2 = onSnapshot(matchesQueryA, async () => {
            await renderSuggestions();
        });
        const unsubscribe3 = onSnapshot(matchesQueryB, async () => {
            await renderSuggestions();
        });

        if (unsubscribes) {
            unsubscribes.push(unsubscribe1, unsubscribe2, unsubscribe3);
        }
    } catch (error) {
        console.error('Error loading match suggestions:', error);
        container.innerHTML =
            '<p class="text-red-500 text-center py-4">Fehler beim Laden der Vorschläge</p>';
    }
}

/**
 * Creates a suggestion card (view only, no actions)
 */
function createSuggestionCard(player, userData, db) {
    const div = document.createElement('div');
    div.className = 'bg-white border border-indigo-200 rounded-md p-2 shadow-sm';

    const myElo = userData.eloRating || 1000;
    const playerElo = player.eloRating || 1000;
    const eloDiff = Math.abs(myElo - playerElo);
    const neverPlayed = player.history.matchCount === 0;
    const lastPlayedStr = player.history.lastMatchDate
        ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' }).format(
              player.history.lastMatchDate
          )
        : null;

    let handicapHTML = '';
    if (eloDiff >= 25) {
        const handicapPoints = Math.min(Math.round(eloDiff / 50), 10);
        const weakerPlayerIsMe = myElo < playerElo;
        const weakerPlayerName = weakerPlayerIsMe ? 'Du' : player.firstName;

        handicapHTML = `
      <div class="text-xs text-blue-600 mt-1">
        <i class="fas fa-balance-scale-right mr-1"></i>
        Handicap: ${weakerPlayerName} ${handicapPoints} Punkt${handicapPoints === 1 ? '' : 'e'}/Satz
      </div>
    `;
    }

    div.innerHTML = `
    <div class="flex justify-between items-center mb-1">
      <div class="flex-1">
        <p class="font-semibold text-gray-800 text-sm">${player.firstName} ${player.lastName}</p>
        <p class="text-xs text-gray-600">ELO: ${Math.round(playerElo)}</p>
      </div>
    </div>

    <div class="text-xs text-gray-600">
      ${
          neverPlayed
              ? '<span class="text-purple-700 font-medium"><i class="fas fa-star mr-1"></i>Noch nie gespielt</span>'
              : `${player.history.matchCount} Match${player.history.matchCount === 1 ? '' : 'es'}${lastPlayedStr ? `, zuletzt ${lastPlayedStr}` : ''}`
      }
    </div>
    ${handicapHTML}
  `;

    return div;
}
