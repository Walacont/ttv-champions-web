import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Coach Match History Module
 * Displays competition history for selected player
 */

// ========================================================================
// ===== POPULATE PLAYER DROPDOWN =====
// ========================================================================

/**
 * Populate the player filter dropdown for match history
 * @param {Array} clubPlayers - Array of club players
 * @param {Object} db - Firestore database instance
 */
export function populateMatchHistoryPlayerDropdown(clubPlayers, db) {
  const select = document.getElementById('match-history-player-filter');
  if (!select) return;

  select.innerHTML = '<option value="">Bitte Spieler wählen...</option>';

  clubPlayers.forEach(player => {
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = `${player.firstName} ${player.lastName}`;
    select.appendChild(option);
  });

  // Add event listener for when player is selected
  select.addEventListener('change', (e) => {
    const playerId = e.target.value;
    if (playerId) {
      loadCoachMatchHistory(playerId, db);
    } else {
      const container = document.getElementById("coach-match-history-list");
      if (container) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Wähle einen Spieler aus...</p>';
      }
    }
  });
}

// ========================================================================
// ===== LOAD AND DISPLAY PLAYER MATCH HISTORY =====
// ========================================================================

// Store the unsubscribe function globally so we can clean up
let coachMatchHistoryUnsubscribe = null;

/**
 * Load and display match history for a specific player with real-time updates
 * @param {string} playerId - Player ID to load history for
 * @param {Object} db - Firestore database instance
 * @returns {Function} Unsubscribe function to stop listening
 */
export async function loadCoachMatchHistory(playerId, db) {
  const container = document.getElementById("coach-match-history-list");
  if (!container) {
    console.error("Coach match history container not found");
    return;
  }

  // Clean up existing listener if any
  if (coachMatchHistoryUnsubscribe) {
    coachMatchHistoryUnsubscribe();
  }

  container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Lade Wettkampf-Historie...</p>';

  try {
    // Get player data first
    const playerDoc = await getDoc(doc(db, "users", playerId));
    if (!playerDoc.exists()) {
      container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Spieler nicht gefunden</p>';
      return;
    }

    const playerData = playerDoc.data();
    const playerName = `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim();

    console.log("[Coach Match History] 🔄 Setting up real-time listener for:", playerName, "clubId:", playerData.clubId);

    // Query SINGLES matches for this club
    const singlesMatchesRef = collection(db, "matches");
    const singlesQuery = query(
      singlesMatchesRef,
      where("clubId", "==", playerData.clubId),
      where("processed", "==", true),
      limit(100)
    );

    // Query DOUBLES matches for this club
    const doublesMatchesRef = collection(db, "doublesMatches");
    const doublesQuery = query(
      doublesMatchesRef,
      where("clubId", "==", playerData.clubId),
      where("processed", "==", true),
      limit(100)
    );

    // Set up real-time listeners for BOTH singles and doubles
    const unsubscribeSingles = onSnapshot(
      singlesQuery,
      async (singlesSnapshot) => {
        const unsubscribeDoubles = onSnapshot(
          doublesQuery,
          async (doublesSnapshot) => {
            console.log("[Coach Match History] 📥 Real-time update received:",
              singlesSnapshot.docs.length, "singles,",
              doublesSnapshot.docs.length, "doubles");

            // Filter singles matches where player is involved
            const singlesMatches = singlesSnapshot.docs
              .map(doc => ({ id: doc.id, type: 'singles', ...doc.data() }))
              .filter(match => {
                return (
                  match.playerAId === playerId ||
                  match.playerBId === playerId ||
                  match.winnerId === playerId ||
                  match.loserId === playerId ||
                  (match.playerIds && match.playerIds.includes(playerId))
                );
              });

            // Filter doubles matches where player is involved
            const doublesMatches = doublesSnapshot.docs
              .map(doc => ({ id: doc.id, type: 'doubles', ...doc.data() }))
              .filter(match => {
                return (
                  match.teamA?.player1Id === playerId ||
                  match.teamA?.player2Id === playerId ||
                  match.teamB?.player1Id === playerId ||
                  match.teamB?.player2Id === playerId
                );
              });

            // Combine all matches
            const allMatches = [...singlesMatches, ...doublesMatches].slice(0, 50);

            console.log("[Coach Match History] Player matches found:",
              singlesMatches.length, "singles,",
              doublesMatches.length, "doubles");

            if (allMatches.length === 0) {
              container.innerHTML = `<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe für ${playerName} gefunden</p>`;
              return;
            }

            // Sort by timestamp descending
            allMatches.sort((a, b) => {
              const timeA = a.timestamp?.toMillis() || a.createdAt?.toMillis() || 0;
              const timeB = b.timestamp?.toMillis() || b.createdAt?.toMillis() || 0;
              return timeB - timeA;
            });

            // Get opponent names and points for all matches
            const matchesWithDetails = await Promise.all(
              allMatches.map(match => enrichCoachMatchData(db, match, playerId, playerData))
            );

            // Render matches
            renderCoachMatchHistory(container, matchesWithDetails, playerName);
          },
          (error) => {
            console.error("[Coach Match History] ❌ Doubles listener error:", error);
            container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Doppel-Historie</p>';
          }
        );

        // Store the doubles unsubscribe function
        coachMatchHistoryUnsubscribe = unsubscribeDoubles;
      },
      (error) => {
        console.error("[Coach Match History] ❌ Singles listener error:", error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Singles-Historie</p>';
      }
    );

    // Return cleanup function that unsubscribes from both listeners
    return () => {
      if (coachMatchHistoryUnsubscribe) {
        coachMatchHistoryUnsubscribe();
      }
      unsubscribeSingles();
    };

  } catch (error) {
    console.error("Error loading coach match history:", error);
    container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Historie</p>';
  }
}

/**
 * Enrich match data with opponent name and ELO changes
 * @param {Object} db - Firestore database instance
 * @param {Object} match - Match data
 * @param {string} playerId - The player we're viewing history for
 * @param {Object} playerData - Player data
 * @returns {Object} Enriched match data
 */
async function enrichCoachMatchData(db, match, playerId, playerData) {
  const enriched = { ...match };

  try {
    // Handle DOUBLES matches differently
    if (match.type === 'doubles') {
      // Determine user's team and opponent team
      const isTeamA = match.teamA?.player1Id === playerId || match.teamA?.player2Id === playerId;
      const userTeam = isTeamA ? match.teamA : match.teamB;
      const opponentTeam = isTeamA ? match.teamB : match.teamA;

      // Get partner ID (the other player on user's team)
      const partnerId = userTeam.player1Id === playerId ? userTeam.player2Id : userTeam.player1Id;

      // Fetch all player names
      try {
        const [partnerDoc, opp1Doc, opp2Doc] = await Promise.all([
          getDoc(doc(db, "users", partnerId)),
          getDoc(doc(db, "users", opponentTeam.player1Id)),
          getDoc(doc(db, "users", opponentTeam.player2Id))
        ]);

        const partnerName = partnerDoc.exists()
          ? `${partnerDoc.data().firstName || ''} ${partnerDoc.data().lastName || ''}`.trim()
          : 'Unbekannt';
        const opp1Name = opp1Doc.exists()
          ? opp1Doc.data().firstName || 'Unbekannt'
          : 'Unbekannt';
        const opp2Name = opp2Doc.exists()
          ? opp2Doc.data().firstName || 'Unbekannt'
          : 'Unbekannt';

        enriched.partnerName = partnerName;
        enriched.opponentName = `${opp1Name} & ${opp2Name}`;
      } catch (error) {
        console.warn("Could not fetch doubles player data:", error);
        enriched.partnerName = 'Partner';
        enriched.opponentName = 'Gegner-Team';
      }

      // Determine if user's team won
      enriched.isWinner = (isTeamA && match.winningTeam === 'A') || (!isTeamA && match.winningTeam === 'B');

      // For doubles, isPlayerA means isTeamA (for set formatting)
      enriched.isPlayerA = isTeamA;

    } else {
      // Handle SINGLES matches
      // Determine opponent ID
      const opponentId = match.winnerId === playerId ? match.loserId : match.winnerId;

      // Get opponent data
      const opponentDoc = await getDoc(doc(db, "users", opponentId));
      if (opponentDoc.exists()) {
        const opponentData = opponentDoc.data();
        enriched.opponentName = `${opponentData.firstName || ''} ${opponentData.lastName || ''}`.trim() || 'Unbekannt';
      } else {
        enriched.opponentName = 'Unbekannt';
      }

      // Determine if this player won
      enriched.isWinner = match.winnerId === playerId;

      // Determine if this player is playerA
      enriched.isPlayerA = match.playerAId === playerId;
    }

    // Get ELO change from pointsHistory
    let eloChange = null;
    let pointsGained = null;

    try {
      const pointsHistoryRef = collection(db, "users", playerId, "pointsHistory");
      const historyQuery = query(
        pointsHistoryRef,
        orderBy("timestamp", "desc"),
        limit(200)
      );

      const historySnapshot = await getDocs(historyQuery);
      const matchTime = match.timestamp?.toMillis() || match.playedAt?.toMillis() || 0;
      const opponentName = enriched.opponentName;

      for (const historyDoc of historySnapshot.docs) {
        const historyData = historyDoc.data();
        const historyTime = historyData.timestamp?.toMillis() || 0;

        const isMatchHistory = historyData.awardedBy === "System (Wettkampf)" ||
                              (historyData.reason && (
                                historyData.reason.includes("Sieg im") ||
                                historyData.reason.includes("Niederlage im")
                              ));

        if (isMatchHistory && Math.abs(historyTime - matchTime) < 30000) {
          if (historyData.reason && historyData.reason.includes(opponentName.split(' ')[0])) {
            eloChange = historyData.eloChange || 0;
            pointsGained = historyData.points || 0;
            break;
          } else if (Math.abs(historyTime - matchTime) < 10000) {
            eloChange = historyData.eloChange || 0;
            pointsGained = historyData.points || 0;
            break;
          }
        }
      }
    } catch (historyError) {
      console.warn("Could not fetch points history:", historyError);
    }

    // If we couldn't find it in history, estimate from match data
    if (eloChange === null) {
      if (match.pointsExchanged !== undefined) {
        if (enriched.isWinner) {
          eloChange = match.handicapUsed ? 8 : Math.round(match.pointsExchanged / 0.2);
          pointsGained = match.pointsExchanged;
        } else {
          eloChange = match.handicapUsed ? -8 : -Math.round(match.pointsExchanged / 0.2);
          pointsGained = 0;
        }
      } else {
        eloChange = match.handicapUsed ?
          (enriched.isWinner ? 8 : -8) :
          null;
      }
    }

    enriched.eloChange = eloChange;
    enriched.pointsGained = pointsGained;

  } catch (error) {
    console.error("Error enriching coach match data:", error);
    enriched.opponentName = 'Fehler';
    enriched.eloChange = null;
    enriched.pointsGained = 0;
  }

  return enriched;
}

/**
 * Render match history in the container (coach view)
 * @param {HTMLElement} container - Container element
 * @param {Array} matches - Array of match data
 * @param {string} playerName - Name of the player whose history is being viewed
 */
function renderCoachMatchHistory(container, matches, playerName) {
  container.innerHTML = "";

  matches.forEach(match => {
    const matchDiv = document.createElement("div");
    matchDiv.className = "bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition";

    const isDoubles = match.type === 'doubles';

    const matchTime = match.timestamp?.toDate() || match.playedAt?.toDate() || match.createdAt?.toDate() || new Date();
    const formattedTime = formatMatchTime(matchTime);
    const formattedDate = formatMatchDate(matchTime);

    // Format sets from player's perspective
    const setsDisplay = formatCoachSets(match.sets, match.isPlayerA, isDoubles);

    // ELO change display
    const eloChangeDisplay = match.eloChange !== null
      ? `${match.eloChange > 0 ? '+' : ''}${match.eloChange} ELO`
      : 'N/A';

    const eloChangeClass = match.eloChange > 0
      ? 'text-green-600 font-semibold'
      : match.eloChange < 0
        ? 'text-red-600 font-semibold'
        : 'text-gray-600';

    matchDiv.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs text-gray-500">${formattedDate}</span>
            <span class="text-xs text-gray-400">•</span>
            <span class="text-xs font-medium text-gray-600">${formattedTime}</span>
            ${match.handicapUsed ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Handicap</span>' : ''}
          </div>

          <div class="flex items-center gap-3 mb-2">
            ${isDoubles
              ? (match.isWinner
                  ? `<span class="text-2xl">🏆</span>
                     <div>
                       <p class="text-sm font-semibold text-green-700">
                         <span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded mr-1">Doppel</span>
                         Sieg mit ${match.partnerName}
                       </p>
                       <p class="text-xs text-gray-600 mt-0.5">gegen ${match.opponentName}</p>
                     </div>`
                  : `<span class="text-2xl">😔</span>
                     <div>
                       <p class="text-sm font-semibold text-red-700">
                         <span class="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded mr-1">Doppel</span>
                         Niederlage mit ${match.partnerName}
                       </p>
                       <p class="text-xs text-gray-600 mt-0.5">gegen ${match.opponentName}</p>
                     </div>`)
              : (match.isWinner
                  ? `<span class="text-2xl">🏆</span>
                     <div>
                       <p class="text-sm font-semibold text-green-700">Sieg gegen ${match.opponentName}</p>
                     </div>`
                  : `<span class="text-2xl">😔</span>
                     <div>
                       <p class="text-sm font-semibold text-red-700">Niederlage gegen ${match.opponentName}</p>
                     </div>`)
            }
          </div>

          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-gray-600">Sätze:</span>
              <span class="font-mono font-medium text-gray-800">${setsDisplay}</span>
            </div>
          </div>
        </div>

        <div class="text-right">
          <div class="${eloChangeClass} text-lg">
            ${eloChangeDisplay}
          </div>
          ${match.pointsGained > 0 ? `<div class="text-xs text-gray-600 mt-1">+${match.pointsGained} Punkte</div>` : ''}
        </div>
      </div>
    `;

    container.appendChild(matchDiv);
  });
}

/**
 * Format sets for display (coach view - from player's perspective)
 * @param {Array} sets - Array of set objects with playerA/playerB or teamA/teamB scores
 * @param {boolean} isPlayerA - Whether the viewed player is playerA (for singles) or teamA (for doubles)
 * @param {boolean} isDoubles - Whether this is a doubles match
 * @returns {string} Formatted sets string
 */
function formatCoachSets(sets, isPlayerA, isDoubles) {
  if (!sets || sets.length === 0) return 'N/A';

  return sets.map(set => {
    // Check if it's a doubles match (has teamA/teamB) or singles (has playerA/playerB)
    if (isDoubles || (set.teamA !== undefined && set.teamB !== undefined)) {
      // Doubles match
      const myScore = isPlayerA ? set.teamA : set.teamB;
      const oppScore = isPlayerA ? set.teamB : set.teamA;
      return `${myScore}:${oppScore}`;
    } else {
      // Singles match
      const myScore = isPlayerA ? set.playerA : set.playerB;
      const oppScore = isPlayerA ? set.playerB : set.playerA;
      return `${myScore}:${oppScore}`;
    }
  }).join(', ');
}

/**
 * Format match time (HH:MM)
 * @param {Date} date - Date object
 * @returns {string} Formatted time
 */
function formatMatchTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Format match date
 * @param {Date} date - Date object
 * @returns {string} Formatted date
 */
function formatMatchDate(date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Reset time parts for comparison
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return 'Heute';
  } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
    return 'Gestern';
  } else {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  }
}
