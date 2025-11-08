import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  getDocs,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Player Matches Module
 * Handles player-initiated match requests with approval workflow
 */

// ========================================================================
// ===== SET SCORE INPUT COMPONENT =====
// ========================================================================

/**
 * Creates dynamic set score input fields
 * @param {HTMLElement} container - Container element for set inputs
 * @param {Array} existingSets - Existing set scores (for edit mode)
 * @returns {Object} Object with getSets() and validate() methods
 */
export function createSetScoreInput(container, existingSets = []) {
  container.innerHTML = "";

  const sets = existingSets.length > 0 ? [...existingSets] : [];
  const minSets = 3;
  const maxSets = 5;

  // Ensure at least 3 sets
  while (sets.length < minSets) {
    sets.push({ playerA: "", playerB: "" });
  }

  function renderSets() {
    container.innerHTML = "";

    sets.forEach((set, index) => {
      const setDiv = document.createElement("div");
      setDiv.className = "flex items-center gap-3 mb-3";
      setDiv.innerHTML = `
        <label class="text-sm font-medium text-gray-700 w-16">Satz ${index + 1}:</label>
        <input
          type="number"
          min="0"
          max="99"
          class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          data-set="${index}"
          data-player="A"
          placeholder="0"
          value="${set.playerA}"
        />
        <span class="text-gray-500">:</span>
        <input
          type="number"
          min="0"
          max="99"
          class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
          data-set="${index}"
          data-player="B"
          placeholder="0"
          value="${set.playerB}"
        />
      `;
      container.appendChild(setDiv);
    });

    // Add event listeners for auto-adding 4th and 5th set
    const inputs = container.querySelectorAll("input");
    inputs.forEach((input) => {
      input.addEventListener("input", handleSetInput);
    });
  }

  // Helper function to validate a set according to official table tennis rules
  function isValidSet(scoreA, scoreB) {
    const a = parseInt(scoreA) || 0;
    const b = parseInt(scoreB) || 0;

    // At least one side must have 11+ points
    if (a < 11 && b < 11) return false;

    // No winner (tie)
    if (a === b) return false;

    // Determine if we're in deuce territory (both >= 10)
    if (a >= 10 && b >= 10) {
      // Require exactly 2-point difference
      return Math.abs(a - b) === 2;
    }

    // Below 10:10, just need 11+ on winning side and lead
    return (a >= 11 && a > b) || (b >= 11 && b > a);
  }

  // Helper function to determine set winner (returns 'A', 'B', or null)
  function getSetWinner(scoreA, scoreB) {
    if (!isValidSet(scoreA, scoreB)) return null;

    const a = parseInt(scoreA) || 0;
    const b = parseInt(scoreB) || 0;

    if (a > b) return 'A';
    if (b > a) return 'B';
    return null;
  }

  function handleSetInput(e) {
    const setIndex = parseInt(e.target.dataset.set);
    const player = e.target.dataset.player;
    const value = parseInt(e.target.value) || 0;

    sets[setIndex][`player${player}`] = value;

    // Calculate wins for auto-add logic (use lenient check during input)
    let playerAWins = 0;
    let playerBWins = 0;

    for (let i = 0; i < sets.length; i++) {
      const setA = parseInt(sets[i].playerA) || 0;
      const setB = parseInt(sets[i].playerB) || 0;

      // Lenient check for auto-add: just need 11+ and be ahead
      // This allows auto-add to work during input, even if final validation is stricter
      if (setA > setB && setA >= 11) playerAWins++;
      if (setB > setA && setB >= 11) playerBWins++;
    }

    // Auto-add 4th set if score is 2:1 or 1:2 and we only have 3 sets
    if (sets.length === 3 && (
      (playerAWins === 2 && playerBWins === 1) ||
      (playerAWins === 1 && playerBWins === 2)
    )) {
      sets.push({ playerA: "", playerB: "" });
      renderSets();
    }

    // Auto-add 5th set if score is 2:2 and we only have 4 sets
    if (sets.length === 4 && playerAWins === 2 && playerBWins === 2) {
      sets.push({ playerA: "", playerB: "" });
      renderSets();
    }
  }

  function getSets() {
    return sets.filter(set => set.playerA !== "" && set.playerB !== "");
  }

  function validate() {
    const filledSets = getSets();

    if (filledSets.length < minSets) {
      return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
    }

    // Validate each set according to official table tennis rules
    for (let i = 0; i < filledSets.length; i++) {
      const set = filledSets[i];
      const scoreA = parseInt(set.playerA) || 0;
      const scoreB = parseInt(set.playerB) || 0;

      if (!isValidSet(scoreA, scoreB)) {
        // Provide specific error message based on the issue
        if (scoreA < 11 && scoreB < 11) {
          return { valid: false, error: `Satz ${i + 1}: Mindestens eine Seite muss 11 Punkte haben.` };
        }
        if (scoreA === scoreB) {
          return { valid: false, error: `Satz ${i + 1}: Unentschieden ist nicht erlaubt.` };
        }
        if (scoreA >= 10 && scoreB >= 10 && Math.abs(scoreA - scoreB) !== 2) {
          return { valid: false, error: `Satz ${i + 1}: Ab 10:10 muss eine Seite 2 Punkte Vorsprung haben (z.B. 12:10, 14:12).` };
        }
        return { valid: false, error: `Satz ${i + 1}: Ungültiges Satzergebnis (${scoreA}:${scoreB}).` };
      }
    }

    // Calculate wins
    let playerAWins = 0;
    let playerBWins = 0;

    filledSets.forEach((set) => {
      const winner = getSetWinner(set.playerA, set.playerB);
      if (winner === 'A') playerAWins++;
      if (winner === 'B') playerBWins++;
    });

    // Check if someone won (3 sets)
    if (playerAWins < 3 && playerBWins < 3) {
      return { valid: false, error: "Ein Spieler muss 3 Sätze gewinnen." };
    }

    // Check if match is finished (no need for more sets)
    if (playerAWins === 3 || playerBWins === 3) {
      // Valid match result
      return {
        valid: true,
        winnerId: playerAWins === 3 ? "A" : "B",
        playerAWins,
        playerBWins,
      };
    }

    return { valid: false, error: "Ungültiges Spielergebnis." };
  }

  renderSets();

  return {
    getSets,
    validate,
    refresh: renderSets,
  };
}

// ========================================================================
// ===== MATCH REQUEST MANAGEMENT =====
// ========================================================================

/**
 * Loads and renders player match requests
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadPlayerMatchRequests(userData, db, unsubscribes) {
  const myRequestsList = document.getElementById("my-match-requests-list");
  const incomingRequestsList = document.getElementById("incoming-match-requests-list");
  const processedRequestsList = document.getElementById("processed-match-requests-list");

  if (!myRequestsList || !incomingRequestsList || !processedRequestsList) return;

  // Query for requests created by me (playerA)
  const myRequestsQuery = query(
    collection(db, "matchRequests"),
    where("playerAId", "==", userData.id),
    orderBy("createdAt", "desc")
  );

  // Query for requests sent to me (playerB) - still pending
  const incomingRequestsQuery = query(
    collection(db, "matchRequests"),
    where("playerBId", "==", userData.id),
    where("status", "==", "pending_player"),
    orderBy("createdAt", "desc")
  );

  // Query for requests I processed as playerB - no longer pending_player
  const processedRequestsQuery = query(
    collection(db, "matchRequests"),
    where("playerBId", "==", userData.id),
    orderBy("createdAt", "desc")
  );

  // Listen to my requests
  const myRequestsUnsubscribe = onSnapshot(myRequestsQuery, async (snapshot) => {
    const requests = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      requests.push({ id: docSnap.id, ...data });
    }

    await renderMyRequests(requests, userData, db);
  });

  // Listen to incoming requests
  const incomingRequestsUnsubscribe = onSnapshot(incomingRequestsQuery, async (snapshot) => {
    const requests = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      requests.push({ id: docSnap.id, ...data });
    }

    await renderIncomingRequests(requests, userData, db);

    // Update badge count
    updateMatchRequestBadge(requests.length);
  });

  // Listen to processed requests
  const processedRequestsUnsubscribe = onSnapshot(processedRequestsQuery, async (snapshot) => {
    const requests = [];
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      // Only include requests that are NOT pending_player (i.e., already processed)
      if (data.status !== "pending_player") {
        requests.push({ id: docSnap.id, ...data });
      }
    }

    await renderProcessedRequests(requests, userData, db);
  });

  unsubscribes.push(myRequestsUnsubscribe, incomingRequestsUnsubscribe, processedRequestsUnsubscribe);
}

/**
 * Renders my match requests with "show more" functionality
 */
let showAllMyRequests = false; // State for showing all or limited

async function renderMyRequests(requests, userData, db) {
  const container = document.getElementById("my-match-requests-list");
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
    showAllMyRequests = false;
    return;
  }

  container.innerHTML = "";

  // Determine how many to show
  const maxInitial = 3;
  const requestsToShow = showAllMyRequests ? requests : requests.slice(0, maxInitial);

  // Render request cards
  for (const request of requestsToShow) {
    const playerBData = await getUserData(request.playerBId, db);
    const card = createMyRequestCard(request, playerBData, userData, db);
    container.appendChild(card);
  }

  // Add "Show more" / "Show less" button if needed
  if (requests.length > maxInitial) {
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "text-center mt-4";

    const button = document.createElement("button");
    button.className = "text-indigo-600 hover:text-indigo-800 font-medium text-sm transition";
    button.innerHTML = showAllMyRequests
      ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
      : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

    button.addEventListener("click", () => {
      showAllMyRequests = !showAllMyRequests;
      renderMyRequests(requests, userData, db);
    });

    buttonContainer.appendChild(button);
    container.appendChild(buttonContainer);
  }
}

/**
 * Renders incoming match requests with "show more" functionality
 */
let showAllIncomingRequests = false; // State for showing all or limited

async function renderIncomingRequests(requests, userData, db) {
  const container = document.getElementById("incoming-match-requests-list");
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine neuen Anfragen</p>';
    showAllIncomingRequests = false;
    return;
  }

  container.innerHTML = "";

  // Determine how many to show
  const maxInitial = 3;
  const requestsToShow = showAllIncomingRequests ? requests : requests.slice(0, maxInitial);

  // Render request cards
  for (const request of requestsToShow) {
    const playerAData = await getUserData(request.playerAId, db);
    const card = createIncomingRequestCard(request, playerAData, userData, db);
    container.appendChild(card);
  }

  // Add "Show more" / "Show less" button if needed
  if (requests.length > maxInitial) {
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "text-center mt-4";

    const button = document.createElement("button");
    button.className = "text-indigo-600 hover:text-indigo-800 font-medium text-sm transition";
    button.innerHTML = showAllIncomingRequests
      ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
      : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

    button.addEventListener("click", () => {
      showAllIncomingRequests = !showAllIncomingRequests;
      renderIncomingRequests(requests, userData, db);
    });

    buttonContainer.appendChild(button);
    container.appendChild(buttonContainer);
  }
}

/**
 * Renders processed match requests with "show more" functionality
 */
let showAllProcessedRequests = false; // State for showing all or limited

async function renderProcessedRequests(requests, userData, db) {
  const container = document.getElementById("processed-match-requests-list");
  if (!container) return;

  if (requests.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine bearbeiteten Anfragen</p>';
    showAllProcessedRequests = false;
    return;
  }

  container.innerHTML = "";

  // Determine how many to show
  const maxInitial = 3;
  const requestsToShow = showAllProcessedRequests ? requests : requests.slice(0, maxInitial);

  // Render request cards
  for (const request of requestsToShow) {
    const playerAData = await getUserData(request.playerAId, db);
    const card = createProcessedRequestCard(request, playerAData, userData, db);
    container.appendChild(card);
  }

  // Add "Show more" / "Show less" button if needed
  if (requests.length > maxInitial) {
    const buttonContainer = document.createElement("div");
    buttonContainer.className = "text-center mt-4";

    const button = document.createElement("button");
    button.className = "text-indigo-600 hover:text-indigo-800 font-medium text-sm transition";
    button.innerHTML = showAllProcessedRequests
      ? '<i class="fas fa-chevron-up mr-2"></i>Weniger anzeigen'
      : `<i class="fas fa-chevron-down mr-2"></i>Mehr anzeigen (${requests.length - maxInitial} weitere)`;

    button.addEventListener("click", () => {
      showAllProcessedRequests = !showAllProcessedRequests;
      renderProcessedRequests(requests, userData, db);
    });

    buttonContainer.appendChild(button);
    container.appendChild(buttonContainer);
  }
}

/**
 * Creates a card for my requests
 */
function createMyRequestCard(request, playerB, userData, db) {
  const div = document.createElement("div");
  div.className = "bg-white border border-gray-200 rounded-lg p-4 shadow-sm";

  const setsDisplay = formatSetsDisplay(request.sets);
  const statusBadge = getStatusBadge(request.status, request.approvals);

  div.innerHTML = `
    <div class="flex justify-between items-start mb-2">
      <div class="flex-1">
        <p class="font-semibold text-gray-800">
          ${userData.firstName} vs ${playerB?.firstName || "Unbekannt"}
        </p>
        <p class="text-sm text-gray-600">${setsDisplay}</p>
        ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ""}
      </div>
      ${statusBadge}
    </div>
    <div class="flex gap-2 mt-3">
      ${request.status === "pending_player" && !request.approvals?.playerB?.status
        ? `
        <button class="edit-request-btn flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-edit"></i> Bearbeiten
        </button>
        <button class="delete-request-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
          <i class="fas fa-trash"></i> Löschen
        </button>
        `
        : ""
      }
    </div>
  `;

  // Event listeners
  const editBtn = div.querySelector(".edit-request-btn");
  const deleteBtn = div.querySelector(".delete-request-btn");

  if (editBtn) {
    editBtn.addEventListener("click", () => openEditRequestModal(request, userData, db));
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => deleteMatchRequest(request.id, db));
  }

  return div;
}

/**
 * Creates a card for incoming requests
 */
function createIncomingRequestCard(request, playerA, userData, db) {
  const div = document.createElement("div");
  div.className = "bg-white border border-indigo-200 rounded-lg p-4 shadow-md";

  const setsDisplay = formatSetsDisplay(request.sets);
  const winner = getWinner(request.sets, playerA, userData);

  div.innerHTML = `
    <div class="mb-3">
      <p class="font-semibold text-gray-800">
        ${playerA?.firstName || "Unbekannt"} vs ${userData.firstName}
      </p>
      <p class="text-sm text-gray-600">${setsDisplay}</p>
      <p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>
      ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ""}
    </div>
    <div class="flex gap-2">
      <button class="approve-request-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
        <i class="fas fa-check"></i> Akzeptieren
      </button>
      <button class="reject-request-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-request-id="${request.id}">
        <i class="fas fa-times"></i> Ablehnen
      </button>
    </div>
  `;

  // Event listeners
  const approveBtn = div.querySelector(".approve-request-btn");
  const rejectBtn = div.querySelector(".reject-request-btn");

  if (approveBtn) {
    approveBtn.addEventListener("click", () => approveMatchRequest(request.id, db, "playerB"));
  }

  if (rejectBtn) {
    rejectBtn.addEventListener("click", () => rejectMatchRequest(request.id, db, "playerB"));
  }

  return div;
}

/**
 * Creates a card for processed requests (read-only)
 */
function createProcessedRequestCard(request, playerA, userData, db) {
  const div = document.createElement("div");

  // Different styling based on status
  let borderColor = "border-gray-200";
  if (request.status === "approved" || request.status === "pending_coach") {
    borderColor = "border-green-200 bg-green-50";
  } else if (request.status === "rejected") {
    borderColor = "border-red-200 bg-red-50";
  }

  div.className = `bg-white border ${borderColor} rounded-lg p-4 shadow-sm`;

  const setsDisplay = formatSetsDisplay(request.sets);
  const winner = getWinner(request.sets, playerA, userData);
  const statusBadge = getProcessedStatusBadge(request.status, request.approvals);

  div.innerHTML = `
    <div class="mb-3">
      <div class="flex justify-between items-start mb-2">
        <div class="flex-1">
          <p class="font-semibold text-gray-800">
            ${playerA?.firstName || "Unbekannt"} vs ${userData.firstName}
          </p>
          <p class="text-sm text-gray-600">${setsDisplay}</p>
          <p class="text-sm font-medium text-indigo-700 mt-1">Gewinner: ${winner}</p>
          ${request.handicapUsed ? '<p class="text-xs text-blue-600 mt-1"><i class="fas fa-balance-scale-right"></i> Handicap verwendet</p>' : ""}
        </div>
        ${statusBadge}
      </div>
      ${getStatusDescription(request.status, request.approvals)}
    </div>
  `;

  return div;
}

/**
 * Gets status badge for processed requests
 */
function getProcessedStatusBadge(status, approvals) {
  if (status === "pending_coach") {
    return '<span class="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">⏳ Wartet auf Coach</span>';
  }

  if (status === "approved") {
    const coachName = approvals?.coach?.coachName || "Coach";
    return `<span class="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">✓ Genehmigt von ${coachName}</span>`;
  }

  if (status === "rejected") {
    if (approvals?.playerB?.status === "rejected") {
      return '<span class="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">✗ Von dir abgelehnt</span>';
    } else {
      const coachName = approvals?.coach?.coachName || "Coach";
      return `<span class="text-xs bg-red-100 text-red-800 px-3 py-1 rounded-full font-medium">✗ Abgelehnt von ${coachName}</span>`;
    }
  }

  return "";
}

/**
 * Gets status description text
 */
function getStatusDescription(status, approvals) {
  if (status === "pending_coach") {
    return '<p class="text-xs text-blue-700 mt-2"><i class="fas fa-info-circle mr-1"></i> Du hast diese Anfrage akzeptiert. Wartet jetzt auf Coach-Genehmigung.</p>';
  }

  if (status === "approved") {
    const coachName = approvals?.coach?.coachName || "Coach";
    return `<p class="text-xs text-green-700 mt-2"><i class="fas fa-check-circle mr-1"></i> Diese Anfrage wurde von ${coachName} genehmigt und das Match wurde erstellt.</p>`;
  }

  if (status === "rejected") {
    if (approvals?.playerB?.status === "rejected") {
      return '<p class="text-xs text-red-700 mt-2"><i class="fas fa-times-circle mr-1"></i> Du hast diese Anfrage abgelehnt.</p>';
    } else {
      const coachName = approvals?.coach?.coachName || "Coach";
      return `<p class="text-xs text-red-700 mt-2"><i class="fas fa-times-circle mr-1"></i> Diese Anfrage wurde von ${coachName} abgelehnt.</p>`;
    }
  }

  return "";
}

/**
 * Formats sets display
 */
function formatSetsDisplay(sets) {
  if (!sets || sets.length === 0) return "Kein Ergebnis";

  const setsStr = sets.map((s) => `${s.playerA}:${s.playerB}`).join(", ");
  const winsA = sets.filter((s) => s.playerA > s.playerB && s.playerA >= 11).length;
  const winsB = sets.filter((s) => s.playerB > s.playerA && s.playerB >= 11).length;

  return `${winsA}:${winsB} (${setsStr})`;
}

/**
 * Gets winner name
 */
function getWinner(sets, playerA, playerB) {
  if (!sets || sets.length === 0) return "Unbekannt";

  const winsA = sets.filter((s) => s.playerA > s.playerB && s.playerA >= 11).length;
  const winsB = sets.filter((s) => s.playerB > s.playerA && s.playerB >= 11).length;

  if (winsA >= 3) return playerA?.firstName || "Spieler A";
  if (winsB >= 3) return playerB?.firstName || "Spieler B";
  return "Unbekannt";
}

/**
 * Gets status badge HTML
 */
function getStatusBadge(status, approvals) {
  if (status === "pending_player") {
    if (approvals?.playerB?.status === "approved") {
      return '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Wartet auf Coach</span>';
    }
    return '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Wartet auf Gegner</span>';
  }

  if (status === "pending_coach") {
    return '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Wartet auf Coach</span>';
  }

  if (status === "approved") {
    return '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">✓ Genehmigt</span>';
  }

  if (status === "rejected") {
    return '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">✗ Abgelehnt</span>';
  }

  return "";
}

/**
 * Approves a match request
 */
async function approveMatchRequest(requestId, db, role) {
  try {
    const requestRef = doc(db, "matchRequests", requestId);
    const updateData = {};

    if (role === "playerB") {
      updateData["approvals.playerB"] = {
        status: "approved",
        timestamp: serverTimestamp(),
      };
      updateData.status = "pending_coach"; // Move to coach approval
    } else if (role === "coach") {
      updateData["approvals.coach"] = {
        status: "approved",
        timestamp: serverTimestamp(),
      };
      updateData.status = "approved"; // Final approval
    }

    updateData.updatedAt = serverTimestamp();

    await updateDoc(requestRef, updateData);

    showFeedback("Anfrage akzeptiert!", "success");
  } catch (error) {
    console.error("Error approving request:", error);
    showFeedback("Fehler beim Akzeptieren der Anfrage.", "error");
  }
}

/**
 * Rejects a match request
 */
async function rejectMatchRequest(requestId, db, role) {
  try {
    const requestRef = doc(db, "matchRequests", requestId);
    const updateData = {};

    if (role === "playerB") {
      updateData["approvals.playerB"] = {
        status: "rejected",
        timestamp: serverTimestamp(),
      };
    } else if (role === "coach") {
      updateData["approvals.coach"] = {
        status: "rejected",
        timestamp: serverTimestamp(),
      };
    }

    updateData.status = "rejected";
    updateData.rejectedBy = role;
    updateData.updatedAt = serverTimestamp();

    await updateDoc(requestRef, updateData);

    showFeedback("Anfrage abgelehnt.", "success");
  } catch (error) {
    console.error("Error rejecting request:", error);
    showFeedback("Fehler beim Ablehnen der Anfrage.", "error");
  }
}

/**
 * Deletes a match request
 */
async function deleteMatchRequest(requestId, db) {
  if (!confirm("Möchtest du diese Anfrage wirklich löschen?")) return;

  try {
    await deleteDoc(doc(db, "matchRequests", requestId));
    showFeedback("Anfrage gelöscht.", "success");
  } catch (error) {
    console.error("Error deleting request:", error);
    showFeedback("Fehler beim Löschen der Anfrage.", "error");
  }
}

/**
 * Opens edit request modal
 */
function openEditRequestModal(request, userData, db) {
  // TODO: Implement edit modal if needed
  showFeedback("Bearbeiten-Funktion wird bald verfügbar sein.", "info");
}

/**
 * Gets user data by ID
 */
async function getUserData(userId, db) {
  try {
    const userDoc = await getDocs(query(collection(db, "users"), where("__name__", "==", userId)));
    if (!userDoc.empty) {
      return { id: userDoc.docs[0].id, ...userDoc.docs[0].data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

/**
 * Updates match request badge count
 */
function updateMatchRequestBadge(count) {
  const badge = document.getElementById("match-request-badge");
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

/**
 * Shows feedback message
 */
function showFeedback(message, type = "success") {
  const feedbackEl = document.getElementById("match-request-feedback");
  if (!feedbackEl) {
    alert(message);
    return;
  }

  feedbackEl.textContent = message;
  feedbackEl.className = `mt-3 p-3 rounded-md text-sm font-medium ${
    type === "success"
      ? "bg-green-100 text-green-800"
      : type === "error"
      ? "bg-red-100 text-red-800"
      : "bg-blue-100 text-blue-800"
  }`;

  feedbackEl.classList.remove("hidden");

  setTimeout(() => {
    feedbackEl.classList.add("hidden");
  }, 3000);
}

/**
 * Initializes the match request form
 */
export function initializeMatchRequestForm(userData, db, clubPlayers) {
  const form = document.getElementById("match-request-form");
  if (!form) return;

  const opponentSelect = document.getElementById("opponent-select");
  const handicapToggle = document.getElementById("match-handicap-toggle");
  const handicapInfo = document.getElementById("match-handicap-info");
  const setScoreContainer = document.getElementById("set-score-container");

  // Populate opponent dropdown
  opponentSelect.innerHTML = '<option value="">Gegner wählen...</option>';
  clubPlayers
    .filter((p) => p.id !== userData.id && p.role === "player")
    .forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = `${player.firstName} ${player.lastName} (Elo: ${Math.round(player.eloRating || 0)})`;
      option.dataset.elo = player.eloRating || 0;
      opponentSelect.appendChild(option);
    });

  // Initialize set score input
  const setScoreInput = createSetScoreInput(setScoreContainer);

  // Handicap calculation
  opponentSelect.addEventListener("change", () => {
    const selectedOption = opponentSelect.selectedOptions[0];
    if (!selectedOption || !selectedOption.value) {
      handicapInfo.classList.add("hidden");
      return;
    }

    const opponentElo = parseFloat(selectedOption.dataset.elo) || 0;
    const myElo = userData.eloRating || 0;
    const eloDiff = Math.abs(myElo - opponentElo);

    if (eloDiff >= 25) {
      const handicapPoints = Math.min(Math.round(eloDiff / 50), 10);
      const weakerPlayer = myElo < opponentElo ? "Du" : selectedOption.textContent.split(" (")[0];

      document.getElementById("match-handicap-text").textContent =
        `${weakerPlayer} startet mit ${handicapPoints} Punkten Vorsprung pro Satz.`;
      handicapInfo.classList.remove("hidden");
    } else {
      handicapInfo.classList.add("hidden");
    }
  });

  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const opponentId = opponentSelect.value;
    const handicapUsed = handicapToggle.checked;

    if (!opponentId) {
      showFeedback("Bitte wähle einen Gegner aus.", "error");
      return;
    }

    const validation = setScoreInput.validate();
    if (!validation.valid) {
      showFeedback(validation.error, "error");
      return;
    }

    const sets = setScoreInput.getSets();
    const winnerId = validation.winnerId === "A" ? userData.id : opponentId;
    const loserId = validation.winnerId === "A" ? opponentId : userData.id;

    try {
      await addDoc(collection(db, "matchRequests"), {
        status: "pending_player",
        playerAId: userData.id,
        playerBId: opponentId,
        winnerId,
        loserId,
        handicapUsed,
        clubId: userData.clubId,
        sets,
        approvals: {
          playerB: { status: null, timestamp: null },
          coach: { status: null, timestamp: null },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        requestedBy: userData.id,
      });

      showFeedback("Anfrage erfolgreich erstellt! Warte auf Bestätigung.", "success");
      form.reset();
      setScoreInput.refresh();
      handicapInfo.classList.add("hidden");
    } catch (error) {
      console.error("Error creating match request:", error);
      showFeedback("Fehler beim Erstellen der Anfrage.", "error");
    }
  });
}
