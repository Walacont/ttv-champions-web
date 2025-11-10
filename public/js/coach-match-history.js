import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc,
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

/**
 * Load and display match history for a specific player
 * @param {string} playerId - Player ID to load history for
 * @param {Object} db - Firestore database instance
 */
export async function loadCoachMatchHistory(playerId, db) {
  const container = document.getElementById("coach-match-history-list");
  if (!container) {
    console.error("Coach match history container not found");
    return;
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

    // Query all processed matches for this player
    const matchesRef = collection(db, "matches");
    const baseQuery = query(
      matchesRef,
      where("clubId", "==", playerData.clubId),
      where("processed", "==", true),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const snapshot = await getDocs(baseQuery);

    // Filter matches where this player is involved (client-side filtering)
    const matches = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(match => {
        return (
          match.playerAId === playerId ||
          match.playerBId === playerId ||
          match.winnerId === playerId ||
          match.loserId === playerId ||
          (match.playerIds && match.playerIds.includes(playerId))
        );
      })
      .slice(0, 50); // Limit to 50 matches

    if (matches.length === 0) {
      container.innerHTML = `<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe für ${playerName} gefunden</p>`;
      return;
    }

    // Get opponent names and points for all matches
    const matchesWithDetails = await Promise.all(
      matches.map(match => enrichCoachMatchData(db, match, playerId, playerData))
    );

    // Render matches
    renderCoachMatchHistory(container, matchesWithDetails, playerName);

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

    const matchTime = match.timestamp?.toDate() || match.playedAt?.toDate() || new Date();
    const formattedTime = formatMatchTime(matchTime);
    const formattedDate = formatMatchDate(matchTime);

    // Format sets from player's perspective
    const setsDisplay = formatCoachSets(match.sets, match.isPlayerA);

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
            ${match.isWinner
              ? `<span class="text-2xl">🏆</span>
                 <div>
                   <p class="text-sm font-semibold text-green-700">Sieg gegen ${match.opponentName}</p>
                 </div>`
              : `<span class="text-2xl">😔</span>
                 <div>
                   <p class="text-sm font-semibold text-red-700">Niederlage gegen ${match.opponentName}</p>
                 </div>`
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
 * @param {Array} sets - Array of set objects with playerA and playerB scores
 * @param {boolean} isPlayerA - Whether the viewed player is playerA
 * @returns {string} Formatted sets string
 */
function formatCoachSets(sets, isPlayerA) {
  if (!sets || sets.length === 0) return 'N/A';

  return sets.map(set => {
    const myScore = isPlayerA ? set.playerA : set.playerB;
    const oppScore = isPlayerA ? set.playerB : set.playerA;
    return `${myScore}:${oppScore}`;
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
