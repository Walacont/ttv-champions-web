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
 * Displays competition history for all club members
 */

// ========================================================================
// ===== LOAD AND DISPLAY CLUB MATCH HISTORY =====
// ========================================================================

/**
 * Load and display match history for the entire club
 * @param {Object} db - Firestore database instance
 * @param {Object} userData - Current user (coach) data
 */
export async function loadCoachMatchHistory(db, userData) {
  const container = document.getElementById("coach-match-history-list");
  if (!container) {
    console.error("Coach match history container not found");
    return;
  }

  container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Lade Wettkampf-Historie...</p>';

  try {
    // Query all processed matches for the club
    const matchesRef = collection(db, "matches");
    const baseQuery = query(
      matchesRef,
      where("clubId", "==", userData.clubId),
      where("processed", "==", true),
      orderBy("timestamp", "desc"),
      limit(100) // Get last 100 matches from club
    );

    const snapshot = await getDocs(baseQuery);

    const matches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (matches.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe gespielt</p>';
      return;
    }

    // Get player names for all matches
    const matchesWithDetails = await Promise.all(
      matches.map(match => enrichCoachMatchData(db, match))
    );

    // Render matches
    renderCoachMatchHistory(container, matchesWithDetails);

  } catch (error) {
    console.error("Error loading coach match history:", error);
    container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Historie</p>';
  }
}

/**
 * Enrich match data with player names
 * @param {Object} db - Firestore database instance
 * @param {Object} match - Match data
 * @returns {Object} Enriched match data
 */
async function enrichCoachMatchData(db, match) {
  const enriched = { ...match };

  try {
    // Get both player names
    const [winnerDoc, loserDoc] = await Promise.all([
      getDoc(doc(db, "users", match.winnerId)),
      getDoc(doc(db, "users", match.loserId))
    ]);

    if (winnerDoc.exists()) {
      const winnerData = winnerDoc.data();
      enriched.winnerName = `${winnerData.firstName || ''} ${winnerData.lastName || ''}`.trim() || 'Unbekannt';
    } else {
      enriched.winnerName = 'Unbekannt';
    }

    if (loserDoc.exists()) {
      const loserData = loserDoc.data();
      enriched.loserName = `${loserData.firstName || ''} ${loserData.lastName || ''}`.trim() || 'Unbekannt';
    } else {
      enriched.loserName = 'Unbekannt';
    }

    // Get the points exchanged from match data
    enriched.pointsExchanged = match.pointsExchanged || 0;

  } catch (error) {
    console.error("Error enriching coach match data:", error);
    enriched.winnerName = 'Fehler';
    enriched.loserName = 'Fehler';
    enriched.pointsExchanged = 0;
  }

  return enriched;
}

/**
 * Render match history in the container (coach view)
 * @param {HTMLElement} container - Container element
 * @param {Array} matches - Array of match data
 */
function renderCoachMatchHistory(container, matches) {
  container.innerHTML = "";

  matches.forEach(match => {
    const matchDiv = document.createElement("div");
    matchDiv.className = "bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition";

    const matchTime = match.timestamp?.toDate() || match.playedAt?.toDate() || new Date();
    const formattedTime = formatMatchTime(matchTime);
    const formattedDate = formatMatchDate(matchTime);

    // Format sets - show from winner's perspective
    const setsDisplay = formatCoachSets(match.sets, match.playerAId === match.winnerId);

    // Calculate ELO estimate (since we don't have individual history here)
    const eloEstimate = match.handicapUsed ? 8 : Math.round((match.pointsExchanged || 0) / 0.2);

    matchDiv.innerHTML = `
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-xs text-gray-500">${formattedDate}</span>
            <span class="text-xs text-gray-400">•</span>
            <span class="text-xs font-medium text-gray-600">${formattedTime}</span>
            ${match.handicapUsed ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Handicap</span>' : ''}
          </div>

          <div class="mb-2">
            <p class="text-sm">
              <span class="font-semibold text-green-700">🏆 ${match.winnerName}</span>
              <span class="text-gray-500"> vs. </span>
              <span class="font-medium text-red-600">${match.loserName}</span>
            </p>
          </div>

          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-gray-600">Sätze:</span>
              <span class="font-mono font-medium text-gray-800">${setsDisplay}</span>
            </div>
          </div>
        </div>

        <div class="text-right">
          <div class="text-green-600 font-semibold text-lg">
            +${eloEstimate} ELO
          </div>
          <div class="text-red-600 text-sm">
            -${eloEstimate} ELO
          </div>
          ${match.pointsExchanged > 0 ? `<div class="text-xs text-gray-600 mt-1">+${match.pointsExchanged} Punkte</div>` : ''}
        </div>
      </div>
    `;

    container.appendChild(matchDiv);
  });
}

/**
 * Format sets for display (coach view)
 * @param {Array} sets - Array of set objects with playerA and playerB scores
 * @param {boolean} winnerIsPlayerA - Whether winner is playerA
 * @returns {string} Formatted sets string
 */
function formatCoachSets(sets, winnerIsPlayerA) {
  if (!sets || sets.length === 0) return 'N/A';

  return sets.map(set => {
    const winnerScore = winnerIsPlayerA ? set.playerA : set.playerB;
    const loserScore = winnerIsPlayerA ? set.playerB : set.playerA;
    return `${winnerScore}:${loserScore}`;
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
