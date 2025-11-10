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
 * Match History Module
 * Displays competition history with match results and ELO changes
 */

// ========================================================================
// ===== LOAD AND DISPLAY MATCH HISTORY =====
// ========================================================================

/**
 * Load and display match history for the current player
 * @param {Object} db - Firestore database instance
 * @param {Object} userData - Current user data
 */
export async function loadMatchHistory(db, userData) {
  const container = document.getElementById("match-history-list");
  if (!container) {
    console.error("Match history container not found");
    return;
  }

  container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Lade Wettkampf-Historie...</p>';

  try {
    // Query matches where user is a participant
    const matchesRef = collection(db, "matches");

    // Use a simpler query strategy: get processed matches and filter client-side
    // This avoids complex index requirements
    const baseQuery = query(
      matchesRef,
      where("clubId", "==", userData.clubId),
      where("processed", "==", true),
      orderBy("timestamp", "desc"),
      limit(100) // Get last 100 matches from club
    );

    const snapshot = await getDocs(baseQuery);

    // Filter matches where user is involved (client-side filtering)
    const matches = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(match => {
        // Check if user is involved in this match
        return (
          match.playerAId === userData.id ||
          match.playerBId === userData.id ||
          match.winnerId === userData.id ||
          match.loserId === userData.id ||
          (match.playerIds && match.playerIds.includes(userData.id))
        );
      })
      .slice(0, 50); // Limit to 50 matches for performance

    // Sort by timestamp descending
    matches.sort((a, b) => {
      const timeA = a.timestamp?.toMillis() || a.playedAt?.toMillis() || 0;
      const timeB = b.timestamp?.toMillis() || b.playedAt?.toMillis() || 0;
      return timeB - timeA;
    });

    if (matches.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe gespielt</p>';
      return;
    }

    // Get player names and ELO changes for all matches
    const matchesWithDetails = await Promise.all(
      matches.map(match => enrichMatchData(db, match, userData))
    );

    // Render matches
    renderMatchHistory(container, matchesWithDetails, userData);

  } catch (error) {
    console.error("Error loading match history:", error);
    container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Historie</p>';
  }
}

/**
 * Enrich match data with player names and ELO changes
 * @param {Object} db - Firestore database instance
 * @param {Object} match - Match data
 * @param {Object} userData - Current user data
 * @returns {Object} Enriched match data
 */
async function enrichMatchData(db, match, userData) {
  const enriched = { ...match };

  try {
    // Determine opponent ID
    const opponentId = match.winnerId === userData.id ? match.loserId : match.winnerId;

    // Get opponent data
    const opponentDoc = await getDoc(doc(db, "users", opponentId));
    if (opponentDoc.exists()) {
      const opponentData = opponentDoc.data();
      enriched.opponentName = `${opponentData.firstName || ''} ${opponentData.lastName || ''}`.trim() || 'Unbekannt';
    } else {
      enriched.opponentName = 'Unbekannt';
    }

    // Get ELO change from pointsHistory
    let eloChange = null;
    let pointsGained = null;

    try {
      const pointsHistoryRef = collection(db, "users", userData.id, "pointsHistory");
      const historyQuery = query(
        pointsHistoryRef,
        orderBy("timestamp", "desc"),
        limit(200) // Get recent history to find this match
      );

      const historySnapshot = await getDocs(historyQuery);

      // Find the history entry that corresponds to this match
      // Match by timestamp proximity (within 30 seconds) and check reason
      const matchTime = match.timestamp?.toMillis() || match.playedAt?.toMillis() || 0;

      const opponentName = enriched.opponentName;

      for (const historyDoc of historySnapshot.docs) {
        const historyData = historyDoc.data();
        const historyTime = historyData.timestamp?.toMillis() || 0;

        // Check if this history entry is from a match
        const isMatchHistory = historyData.awardedBy === "System (Wettkampf)" ||
                              (historyData.reason && (
                                historyData.reason.includes("Sieg im") ||
                                historyData.reason.includes("Niederlage im")
                              ));

        // If timestamps are within 30 seconds and it's a match history, consider it a match
        if (isMatchHistory && Math.abs(historyTime - matchTime) < 30000) {
          // Additionally check if opponent name matches (if available)
          if (historyData.reason && historyData.reason.includes(opponentName.split(' ')[0])) {
            eloChange = historyData.eloChange || 0;
            pointsGained = historyData.points || 0;
            break;
          } else if (Math.abs(historyTime - matchTime) < 10000) {
            // If very close in time (within 10s), use it even without name match
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
        // Estimate based on whether user won or lost
        if (match.winnerId === userData.id) {
          eloChange = match.handicapUsed ? 8 : Math.round(match.pointsExchanged / 0.2);
          pointsGained = match.pointsExchanged;
        } else {
          eloChange = match.handicapUsed ? -8 : -Math.round(match.pointsExchanged / 0.2);
          pointsGained = 0;
        }
      } else {
        // Fallback: use standard handicap values if match type is known
        eloChange = match.handicapUsed ?
          (match.winnerId === userData.id ? 8 : -8) :
          null;
      }
    }

    enriched.eloChange = eloChange;
    enriched.pointsGained = pointsGained;

  } catch (error) {
    console.error("Error enriching match data:", error);
    enriched.opponentName = 'Fehler';
    enriched.eloChange = null;
  }

  return enriched;
}

/**
 * Render match history in the container
 * @param {HTMLElement} container - Container element
 * @param {Array} matches - Array of match data
 * @param {Object} userData - Current user data
 */
function renderMatchHistory(container, matches, userData) {
  container.innerHTML = "";

  matches.forEach(match => {
    const matchDiv = document.createElement("div");
    matchDiv.className = "bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition";

    const isWinner = match.winnerId === userData.id;
    const matchTime = match.timestamp?.toDate() || match.playedAt?.toDate() || new Date();
    const formattedTime = formatMatchTime(matchTime);
    const formattedDate = formatMatchDate(matchTime);

    // Format sets
    const setsDisplay = formatSets(match.sets, match.playerAId === userData.id);

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
            ${isWinner
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
 * Format sets for display
 * @param {Array} sets - Array of set objects with playerA and playerB scores
 * @param {boolean} isPlayerA - Whether current user is playerA
 * @returns {string} Formatted sets string
 */
function formatSets(sets, isPlayerA) {
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
