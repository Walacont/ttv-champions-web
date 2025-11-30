import {
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

/**
 * Match Suggestions Module
 * Provides opponent suggestions based on match history and player ratings
 */

// Cache for clubs data
let clubsCache = null;
let clubsCacheTimestamp = null;
const CLUBS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load all clubs and return as Map (with caching)
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Map>} Map of clubId -> club data
 */
async function loadClubsMap(db) {
    // Return cached data if still valid
    if (clubsCache && clubsCacheTimestamp && (Date.now() - clubsCacheTimestamp) < CLUBS_CACHE_TTL) {
        return clubsCache;
    }

    try {
        const clubsSnapshot = await getDocs(collection(db, 'clubs'));
        const clubsMap = new Map();

        clubsSnapshot.forEach(doc => {
            clubsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // Update cache
        clubsCache = clubsMap;
        clubsCacheTimestamp = Date.now();

        return clubsMap;
    } catch (error) {
        console.error('Error loading clubs:', error);
        // Return empty map on error
        return new Map();
    }
}

/**
 * Filter players based on privacy settings (searchable)
 * @param {Array} players - Array of player objects
 * @param {Object} currentUserData - Current user's data (with id, role, clubId)
 * @returns {Array} Filtered players
 */
function filterPlayersByPrivacy(players, currentUserData) {
    return players.filter(player => {
        // Always show current user
        if (player.id === currentUserData.id) return true;

        // Show players who are searchable globally or within the same club
        const searchable = player.privacySettings?.searchable || 'global';

        if (searchable === 'global') return true;

        // club_only: only show to players in the same club
        if (searchable === 'club_only' && currentUserData.clubId === player.clubId) {
            return true;
        }

        return false;
    });
}

/**
 * Filter out players from test clubs (unless viewer is from a test club)
 * @param {Array} players - Array of player objects
 * @param {Object} currentUserData - Current user's data (with id, role, clubId)
 * @param {Map} clubsMap - Map of clubId -> club data
 * @returns {Array} Filtered players
 */
function filterTestClubPlayers(players, currentUserData, clubsMap) {
    // Check if current user is from a test club
    const currentUserClub = clubsMap.get(currentUserData.clubId);
    if (currentUserClub && currentUserClub.isTestClub) {
        // Test club members (players/coaches/admins) see everyone
        return players;
    }

    // Current user is NOT from a test club
    // Filter out all test club players
    return players.filter(player => {
        // Always show current user
        if (player.id === currentUserData.id) return true;

        // If player has no club, show them
        if (!player.clubId) return true;

        // Get player's club data
        const club = clubsMap.get(player.clubId);

        // If club doesn't exist or is not a test club, show player
        if (!club || !club.isTestClub) return true;

        // Player is from a test club - hide from non-test-club users
        return false;
    });
}

// ========================================================================
// ===== MATCH SUGGESTIONS ALGORITHM =====
// ========================================================================

/**
 * Calculates match suggestions for a player
 * Prioritizes players they haven't played against or haven't played in a while
 * @param {Object} userData - Current user data
 * @param {Array} allPlayers - All players in the club
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Array>} Array of suggested players with priority scores
 */
export async function calculateMatchSuggestions(userData, allPlayers, db) {
    try {
        // Filter eligible players (include both players and coaches)
        const eligiblePlayers = allPlayers.filter(p => {
            const isNotSelf = p.id !== userData.id;
            const isMatchReady = (p.grundlagenCompleted || 0) >= 5;
            const isPlayerOrCoach = p.role === 'player' || p.role === 'coach';
            return isNotSelf && isMatchReady && isPlayerOrCoach;
        });

        // Get all matches involving the current user
        // Query both new format (with playerIds array) and old format (playerAId/playerBId)
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

        // Execute all queries
        const [matchesSnapshot1, matchesSnapshot2, matchesSnapshot3] = await Promise.all([
            getDocs(matchesWithPlayerIds),
            getDocs(matchesAsPlayerA),
            getDocs(matchesAsPlayerB),
        ]);

        // Combine results and deduplicate by document ID
        const allMatchDocs = new Map();
        [matchesSnapshot1, matchesSnapshot2, matchesSnapshot3].forEach(snapshot => {
            snapshot.forEach(doc => {
                allMatchDocs.set(doc.id, doc);
            });
        });

        // Build opponent history
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

        // Calculate priority score for each eligible player
        const now = new Date();

        const suggestions = eligiblePlayers.map(player => {
            const history = opponentHistory[player.id] || { matchCount: 0, lastMatchDate: null };
            const playerElo = player.eloRating || 1000;
            const myElo = userData.eloRating || 1000;
            const eloDiff = Math.abs(myElo - playerElo);

            let score = 100; // Base score

            // Factor 1: Never played = highest priority
            if (history.matchCount === 0) {
                score += 50;
            } else {
                // Factor 2: Fewer matches = higher priority
                score -= history.matchCount * 5;
            }

            // Factor 3: Time since last match (if played before)
            if (history.lastMatchDate) {
                const daysSinceLastMatch = (now - history.lastMatchDate) / (1000 * 60 * 60 * 24);
                score += Math.min(daysSinceLastMatch / 7, 30); // Up to +30 for 30+ weeks
            }

            // NO ELO filtering - everyone should play against everyone

            return {
                ...player,
                suggestionScore: Math.max(0, score),
                history: history,
                eloDiff: eloDiff,
            };
        });

        // Sort by priority score (highest first)
        suggestions.sort((a, b) => b.suggestionScore - a.suggestionScore);

        // Check if there are players we've never played against
        const neverPlayedPlayers = suggestions.filter(s => s.history.matchCount === 0);

        if (neverPlayedPlayers.length > 0) {
            // Only show never-played players (3-4 of them)
            return neverPlayedPlayers.slice(0, 4);
        } else {
            // All players have been played against - show random 3-4 suggestions
            const randomSuggestions = [...suggestions].sort(() => Math.random() - 0.5);
            return randomSuggestions.slice(0, 4);
        }
    } catch (error) {
        console.error('Error calculating match suggestions:', error);
        return [];
    }
}

// ========================================================================
// ===== LOAD AND RENDER MATCH SUGGESTIONS =====
// ========================================================================

/**
 * Loads and renders match suggestions
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 * @param {String} subgroupFilter - Filter by subgroup ('club', 'global', or subgroup ID)
 */
export async function loadMatchSuggestions(
    userData,
    db,
    unsubscribes = [],
    subgroupFilter = 'club'
) {
    const container = document.getElementById('match-suggestions-list');
    if (!container) return;

    // Check if player is in a club
    const hasClub = userData.clubId !== null && userData.clubId !== undefined;

    if (!hasClub) {
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
              <strong>🔒 Match-Vorschläge nur für Vereinsmitglieder!</strong><br>
              Diese Funktion ist nur für Spieler verfügbar, die einem Verein angehören.
            </p>
          </div>
        </div>
      </div>
    `;
        return; // Exit early
    }

    // Check if player has completed Grundlagen requirement
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
        // Match suggestions only work for club view (not global)
        // This is because Firestore rules only allow players to read other players in their club
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

        // Load clubs map for test club filtering
        const clubsMap = await loadClubsMap(db);

        // Get all players based on filter (club only)
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

        // Apply subgroup, age group, or gender filter in JavaScript if needed
        // Note: Players can be in multiple subgroups, so we check if the array includes the filter
        if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
            console.log('[Match Suggestions] Applying filter:', subgroupFilter);
            if (isAgeGroupFilter(subgroupFilter)) {
                allPlayers = filterPlayersByAgeGroup(allPlayers, subgroupFilter);
            } else if (isGenderFilter(subgroupFilter)) {
                allPlayers = filterPlayersByGender(allPlayers, subgroupFilter);
            } else {
                allPlayers = allPlayers.filter(player =>
                    (player.subgroupIDs || []).includes(subgroupFilter)
                );
            }
            console.log('[Match Suggestions] Players after filter:', allPlayers.length);
        }

        // Filter by privacy settings (searchable)
        allPlayers = filterPlayersByPrivacy(allPlayers, userData);
        console.log('[Match Suggestions] Players after privacy filter:', allPlayers.length);

        // Filter test club players
        allPlayers = filterTestClubPlayers(allPlayers, userData, clubsMap);
        console.log('[Match Suggestions] Players after test club filter:', allPlayers.length);

        // Function to calculate and render suggestions
        const renderSuggestions = async () => {
            const suggestions = await calculateMatchSuggestions(userData, allPlayers, db);

            if (suggestions.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-500 text-center py-4">Keine Vorschläge verfügbar</p>';
                return;
            }

            container.innerHTML = '';

            // Render all suggestions (3-4 players)
            suggestions.forEach(player => {
                const card = createSuggestionCard(player, userData, db);
                container.appendChild(card);
            });
        };

        // Initial render
        await renderSuggestions();

        // Listen for changes to matches collection to update suggestions in real-time
        // Set up listeners for both new format (playerIds) and old format (playerAId/playerBId)
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

    // Calculate handicap (same logic as in player-matches.js)
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
