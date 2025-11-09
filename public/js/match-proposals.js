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
  getDoc,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Match Proposals Module
 * Handles player-to-player match proposals (future matches, not results)
 * Players can propose matches with optional date/time/location/phone
 * Recipients can accept, decline, or make counter-proposals
 */

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
    // Filter eligible players
    const eligiblePlayers = allPlayers.filter((p) => {
      const isNotSelf = p.id !== userData.id;
      const isMatchReady = (p.grundlagenCompleted || 0) >= 5;
      const isPlayer = p.role === "player";
      return isNotSelf && isMatchReady && isPlayer;
    });

    // Get all matches involving the current user
    // Query both new format (with playerIds array) and old format (playerAId/playerBId)
    const matchesWithPlayerIds = query(
      collection(db, "matches"),
      where("playerIds", "array-contains", userData.id)
    );
    const matchesAsPlayerA = query(
      collection(db, "matches"),
      where("playerAId", "==", userData.id)
    );
    const matchesAsPlayerB = query(
      collection(db, "matches"),
      where("playerBId", "==", userData.id)
    );

    // Execute all queries
    const [matchesSnapshot1, matchesSnapshot2, matchesSnapshot3] = await Promise.all([
      getDocs(matchesWithPlayerIds),
      getDocs(matchesAsPlayerA),
      getDocs(matchesAsPlayerB)
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
    allMatchDocs.forEach((doc) => {
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
      if (matchDate && (!opponentHistory[opponentId].lastMatchDate || matchDate > opponentHistory[opponentId].lastMatchDate)) {
        opponentHistory[opponentId].lastMatchDate = matchDate;
      }
    });

    // Calculate priority score for each eligible player
    const now = new Date();

    const suggestions = eligiblePlayers.map((player) => {
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
    console.error("Error calculating match suggestions:", error);
    return [];
  }
}

// ========================================================================
// ===== MATCH PROPOSAL MANAGEMENT =====
// ========================================================================

/**
 * Loads and renders match proposals
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadMatchProposals(userData, db, unsubscribes) {
  const sentProposalsList = document.getElementById("sent-proposals-list");
  const receivedProposalsList = document.getElementById("received-proposals-list");

  if (!sentProposalsList || !receivedProposalsList) return;

  // Query for proposals sent by me
  const sentProposalsQuery = query(
    collection(db, "matchProposals"),
    where("requesterId", "==", userData.id),
    orderBy("createdAt", "desc")
  );

  // Query for proposals received by me
  const receivedProposalsQuery = query(
    collection(db, "matchProposals"),
    where("recipientId", "==", userData.id),
    orderBy("createdAt", "desc")
  );

  // Listen to sent proposals
  const sentUnsubscribe = onSnapshot(sentProposalsQuery, async (snapshot) => {
    const proposals = [];
    for (const docSnap of snapshot.docs) {
      proposals.push({ id: docSnap.id, ...docSnap.data() });
    }
    await renderSentProposals(proposals, userData, db);
  });

  // Listen to received proposals
  const receivedUnsubscribe = onSnapshot(receivedProposalsQuery, async (snapshot) => {
    const proposals = [];
    for (const docSnap of snapshot.docs) {
      proposals.push({ id: docSnap.id, ...docSnap.data() });
    }
    await renderReceivedProposals(proposals, userData, db);

    // Update badge count (only pending proposals)
    const pendingCount = proposals.filter((p) => p.status === "pending").length;
    updateProposalBadge(pendingCount);
  });

  unsubscribes.push(sentUnsubscribe, receivedUnsubscribe);
}

/**
 * Renders sent proposals
 */
async function renderSentProposals(proposals, userData, db) {
  const container = document.getElementById("sent-proposals-list");
  if (!container) return;

  if (proposals.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine gesendeten Anfragen</p>';
    return;
  }

  container.innerHTML = "";

  for (const proposal of proposals) {
    const recipientData = await getUserData(proposal.recipientId, db);
    const card = createSentProposalCard(proposal, recipientData, userData, db);
    container.appendChild(card);
  }
}

/**
 * Renders received proposals
 */
async function renderReceivedProposals(proposals, userData, db) {
  const container = document.getElementById("received-proposals-list");
  if (!container) return;

  if (proposals.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine empfangenen Anfragen</p>';
    return;
  }

  container.innerHTML = "";

  for (const proposal of proposals) {
    const requesterData = await getUserData(proposal.requesterId, db);
    const card = createReceivedProposalCard(proposal, requesterData, userData, db);
    container.appendChild(card);
  }
}

/**
 * Creates a card for sent proposals
 */
function createSentProposalCard(proposal, recipient, userData, db) {
  const div = document.createElement("div");
  div.className = "bg-white border border-gray-200 rounded-lg p-3 shadow-sm mb-2";

  const statusBadge = getProposalStatusBadge(proposal.status);
  const dateTimeStr = formatDateTime(proposal.proposedDateTime);
  const latestProposal = getLatestProposal(proposal);

  div.innerHTML = `
    <div class="flex justify-between items-start mb-3">
      <div class="flex-1">
        <p class="font-semibold text-gray-800">
          ${userData.firstName} <i class="fas fa-arrow-right text-gray-400 mx-1"></i> ${recipient?.firstName || "Unbekannt"}
        </p>
        ${statusBadge}
      </div>
    </div>

    <div class="space-y-2 text-sm">
      ${latestProposal.dateTime ? `<p class="text-gray-700"><i class="fas fa-calendar mr-2 text-indigo-500"></i><strong>Zeit:</strong> ${latestProposal.dateTime}</p>` : ""}
      ${latestProposal.location ? `<p class="text-gray-700"><i class="fas fa-map-marker-alt mr-2 text-indigo-500"></i><strong>Ort:</strong> ${latestProposal.location}</p>` : ""}
      ${proposal.phoneNumber ? `<p class="text-gray-700"><i class="fas fa-phone mr-2 text-indigo-500"></i><strong>Telefon:</strong> ${proposal.phoneNumber}</p>` : ""}
      ${proposal.message ? `<p class="text-gray-700 mt-2 p-2 bg-gray-50 rounded"><i class="fas fa-comment mr-2 text-indigo-500"></i>${proposal.message}</p>` : ""}

      ${proposal.counterProposals && proposal.counterProposals.length > 0 ? renderCounterProposalsHistory(proposal.counterProposals, userData, recipient) : ""}
    </div>

    <div class="flex gap-2 mt-3">
      ${proposal.status === "pending" || proposal.status === "counter_proposed" ? `
        <button class="cancel-proposal-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-proposal-id="${proposal.id}">
          <i class="fas fa-times"></i> Zurückziehen
        </button>
      ` : ""}
    </div>
  `;

  const cancelBtn = div.querySelector(".cancel-proposal-btn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => cancelProposal(proposal.id, db));
  }

  return div;
}

/**
 * Creates a card for received proposals
 */
function createReceivedProposalCard(proposal, requester, userData, db) {
  const div = document.createElement("div");

  let borderColor = "border-indigo-200";
  if (proposal.status === "accepted") borderColor = "border-green-200 bg-green-50";
  if (proposal.status === "declined") borderColor = "border-red-200 bg-red-50";

  div.className = `bg-white border ${borderColor} rounded-lg p-3 shadow-sm mb-2`;

  const statusBadge = getProposalStatusBadge(proposal.status);
  const latestProposal = getLatestProposal(proposal);
  const isPending = proposal.status === "pending" || proposal.status === "counter_proposed";

  div.innerHTML = `
    <div class="flex justify-between items-start mb-3">
      <div class="flex-1">
        <p class="font-semibold text-gray-800">
          ${requester?.firstName || "Unbekannt"} <i class="fas fa-arrow-right text-gray-400 mx-1"></i> ${userData.firstName}
        </p>
        ${statusBadge}
      </div>
    </div>

    <div class="space-y-2 text-sm">
      ${latestProposal.dateTime ? `<p class="text-gray-700"><i class="fas fa-calendar mr-2 text-indigo-500"></i><strong>Zeit:</strong> ${latestProposal.dateTime}</p>` : ""}
      ${latestProposal.location ? `<p class="text-gray-700"><i class="fas fa-map-marker-alt mr-2 text-indigo-500"></i><strong>Ort:</strong> ${latestProposal.location}</p>` : ""}
      ${proposal.phoneNumber ? `<p class="text-gray-700"><i class="fas fa-phone mr-2 text-indigo-500"></i><strong>Telefon:</strong> ${proposal.phoneNumber}</p>` : ""}
      ${proposal.message ? `<p class="text-gray-700 mt-2 p-2 bg-gray-50 rounded"><i class="fas fa-comment mr-2 text-indigo-500"></i>${proposal.message}</p>` : ""}

      ${proposal.counterProposals && proposal.counterProposals.length > 0 ? renderCounterProposalsHistory(proposal.counterProposals, requester, userData) : ""}
    </div>

    ${isPending ? `
      <div class="flex gap-2 mt-3">
        <button class="accept-proposal-btn flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md transition" data-proposal-id="${proposal.id}">
          <i class="fas fa-check"></i> Annehmen
        </button>
        <button class="decline-proposal-btn flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md transition" data-proposal-id="${proposal.id}">
          <i class="fas fa-times"></i> Ablehnen
        </button>
        <button class="counter-proposal-btn flex-1 bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-3 rounded-md transition" data-proposal-id="${proposal.id}">
          <i class="fas fa-reply"></i> Gegenvorschlag
        </button>
      </div>
    ` : ""}
  `;

  const acceptBtn = div.querySelector(".accept-proposal-btn");
  const declineBtn = div.querySelector(".decline-proposal-btn");
  const counterBtn = div.querySelector(".counter-proposal-btn");

  if (acceptBtn) {
    acceptBtn.addEventListener("click", () => acceptProposal(proposal.id, db));
  }

  if (declineBtn) {
    declineBtn.addEventListener("click", () => declineProposal(proposal.id, db));
  }

  if (counterBtn) {
    counterBtn.addEventListener("click", () => openCounterProposalModal(proposal, requester, db));
  }

  return div;
}

/**
 * Gets the latest proposal (original or latest counter-proposal)
 */
function getLatestProposal(proposal) {
  if (proposal.counterProposals && proposal.counterProposals.length > 0) {
    const latest = proposal.counterProposals[proposal.counterProposals.length - 1];
    return {
      dateTime: formatDateTime(latest.dateTime),
      location: latest.location,
    };
  }

  return {
    dateTime: formatDateTime(proposal.proposedDateTime),
    location: proposal.proposedLocation,
  };
}

/**
 * Renders counter-proposals history
 */
function renderCounterProposalsHistory(counterProposals, requester, recipient) {
  if (!counterProposals || counterProposals.length === 0) return "";

  const history = counterProposals.map((cp, index) => {
    const proposerName = cp.proposedBy === requester.id ? requester.firstName : recipient.firstName;
    return `
      <div class="text-xs text-gray-600 p-2 bg-blue-50 border-l-2 border-blue-300 rounded">
        <div class="mb-1">
          <i class="fas fa-reply mr-1"></i><strong>${proposerName}</strong> schlug vor:
          ${cp.dateTime ? formatDateTime(cp.dateTime) : "Keine Zeit"}
          ${cp.location ? `@ ${cp.location}` : ""}
        </div>
        ${cp.message ? `<div class="text-xs text-gray-700 italic mt-1">"${cp.message}"</div>` : ""}
      </div>
    `;
  }).join("");

  return `
    <div class="mt-3 space-y-2">
      <p class="text-xs font-semibold text-gray-600 uppercase">Gegenvorschläge:</p>
      ${history}
    </div>
  `;
}

/**
 * Gets proposal status badge
 */
function getProposalStatusBadge(status) {
  const badges = {
    pending: '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">⏳ Ausstehend</span>',
    counter_proposed: '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">🔄 Gegenvorschlag</span>',
    accepted: '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">✓ Angenommen</span>',
    declined: '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-medium">✗ Abgelehnt</span>',
    cancelled: '<span class="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full font-medium">↺ Zurückgezogen</span>',
  };

  return badges[status] || "";
}

/**
 * Formats date/time for display
 */
function formatDateTime(timestamp) {
  if (!timestamp) return "";

  try {
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (typeof timestamp === "string") {
      date = new Date(timestamp);
    } else {
      date = timestamp;
    }

    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch (error) {
    return "";
  }
}

/**
 * Accepts a proposal (players can arrange directly without coach approval)
 */
async function acceptProposal(proposalId, db) {
  try {
    const proposalRef = doc(db, "matchProposals", proposalId);
    await updateDoc(proposalRef, {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    showProposalFeedback("Match-Anfrage angenommen! Viel Erfolg beim Spiel!", "success");
  } catch (error) {
    console.error("Error accepting proposal:", error);
    showProposalFeedback("Fehler beim Annehmen der Anfrage.", "error");
  }
}

/**
 * Declines a proposal
 */
async function declineProposal(proposalId, db) {
  try {
    const proposalRef = doc(db, "matchProposals", proposalId);
    await updateDoc(proposalRef, {
      status: "declined",
      updatedAt: serverTimestamp(),
    });

    showProposalFeedback("Match-Anfrage abgelehnt.", "success");
  } catch (error) {
    console.error("Error declining proposal:", error);
    showProposalFeedback("Fehler beim Ablehnen der Anfrage.", "error");
  }
}

/**
 * Cancels a proposal
 */
async function cancelProposal(proposalId, db) {
  if (!confirm("Möchtest du diese Anfrage wirklich zurückziehen?")) return;

  try {
    const proposalRef = doc(db, "matchProposals", proposalId);
    await updateDoc(proposalRef, {
      status: "cancelled",
      updatedAt: serverTimestamp(),
    });

    showProposalFeedback("Anfrage zurückgezogen.", "success");
  } catch (error) {
    console.error("Error cancelling proposal:", error);
    showProposalFeedback("Fehler beim Zurückziehen der Anfrage.", "error");
  }
}

/**
 * Opens counter-proposal modal
 */
function openCounterProposalModal(proposal, requester, db) {
  const modal = document.getElementById("counter-proposal-modal");
  const form = document.getElementById("counter-proposal-form");
  const closeBtn = document.getElementById("close-counter-proposal-modal");

  if (!modal || !form) {
    alert("Counter-proposal modal not found");
    return;
  }

  // Set proposal info
  document.getElementById("counter-proposal-opponent-name").textContent = requester.firstName;

  // Reset form
  form.reset();

  // Show modal
  modal.classList.remove("hidden");

  // Close handler
  const handleClose = () => {
    modal.classList.add("hidden");
    form.removeEventListener("submit", handleSubmit);
    closeBtn.removeEventListener("click", handleClose);
  };

  closeBtn.addEventListener("click", handleClose);

  // Form submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    const dateTimeInput = document.getElementById("counter-proposal-datetime").value;
    const locationInput = document.getElementById("counter-proposal-location").value;

    if (!dateTimeInput && !locationInput) {
      showProposalFeedback("Bitte gib mindestens einen Zeitpunkt oder einen Ort an.", "error");
      return;
    }

    try {
      const proposalRef = doc(db, "matchProposals", proposal.id);
      const proposalDoc = await getDoc(proposalRef);

      if (!proposalDoc.exists()) {
        throw new Error("Proposal not found");
      }

      const currentData = proposalDoc.data();
      const counterProposals = currentData.counterProposals || [];

      const messageInput = document.getElementById("counter-proposal-message").value;

      // Add new counter-proposal (use plain Date instead of serverTimestamp in arrays)
      counterProposals.push({
        proposedBy: currentData.recipientId, // Current recipient makes counter-proposal
        dateTime: dateTimeInput ? new Date(dateTimeInput) : null,
        location: locationInput || null,
        message: messageInput || null,
        createdAt: new Date(), // Use plain Date object, not serverTimestamp
      });

      await updateDoc(proposalRef, {
        counterProposals: counterProposals,
        status: "counter_proposed",
        updatedAt: serverTimestamp(),
      });

      showProposalFeedback("Gegenvorschlag gesendet!", "success");
      handleClose();
    } catch (error) {
      console.error("Error sending counter-proposal:", error);
      showProposalFeedback("Fehler beim Senden des Gegenvorschlags.", "error");
    }
  };

  form.addEventListener("submit", handleSubmit);
}

/**
 * Gets user data by ID
 */
async function getUserData(userId, db) {
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return { id: userSnap.id, ...userSnap.data() };
    }
    return null;
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
}

/**
 * Updates proposal badge count
 */
function updateProposalBadge(count) {
  const badge = document.getElementById("match-proposal-badge");
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
function showProposalFeedback(message, type = "success") {
  const feedbackEl = document.getElementById("match-proposal-feedback");
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
 * Initializes the match proposal form
 */
export function initializeMatchProposalForm(userData, db) {
  const form = document.getElementById("match-proposal-form");
  if (!form) return;

  const searchInput = document.getElementById("proposal-player-search");
  const playerList = document.getElementById("proposal-player-list");
  const selectedPlayerDiv = document.getElementById("selected-proposal-player");

  let selectedPlayer = null;
  let allPlayers = [];

  // Load all eligible players
  const loadPlayers = async () => {
    try {
      const playersQuery = query(
        collection(db, "users"),
        where("clubId", "==", userData.clubId),
        where("role", "==", "player")
      );

      const snapshot = await getDocs(playersQuery);
      allPlayers = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((p) => {
          const isNotSelf = p.id !== userData.id;
          const isMatchReady = (p.grundlagenCompleted || 0) >= 5;
          return isNotSelf && isMatchReady;
        });
    } catch (error) {
      console.error("Error loading players:", error);
    }
  };

  // Search functionality
  searchInput.addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();

    if (searchTerm.length < 2) {
      playerList.innerHTML = "";
      playerList.classList.add("hidden");
      return;
    }

    const filtered = allPlayers.filter((p) => {
      const fullName = `${p.firstName} ${p.lastName}`.toLowerCase();
      return fullName.includes(searchTerm);
    });

    renderPlayerSearchResults(filtered, playerList, (player) => {
      selectedPlayer = player;
      searchInput.value = "";
      playerList.innerHTML = "";
      playerList.classList.add("hidden");
      renderSelectedPlayer(player, selectedPlayerDiv);
    });
  });

  // Form submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedPlayer) {
      showProposalFeedback("Bitte wähle einen Spieler aus.", "error");
      return;
    }

    const phoneNumber = document.getElementById("proposal-phone").value;
    const dateTimeInput = document.getElementById("proposal-datetime").value;
    const location = document.getElementById("proposal-location").value;
    const message = document.getElementById("proposal-message").value;

    try {
      await addDoc(collection(db, "matchProposals"), {
        requesterId: userData.id,
        recipientId: selectedPlayer.id,
        clubId: userData.clubId,
        status: "pending",
        phoneNumber: phoneNumber || null,
        proposedDateTime: dateTimeInput ? new Date(dateTimeInput) : null,
        proposedLocation: location || null,
        message: message || null,
        counterProposals: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showProposalFeedback("Match-Anfrage erfolgreich gesendet!", "success");
      form.reset();
      selectedPlayer = null;
      selectedPlayerDiv.innerHTML = "";
    } catch (error) {
      console.error("Error creating proposal:", error);
      showProposalFeedback("Fehler beim Erstellen der Anfrage.", "error");
    }
  });

  // Listen for custom playerSelected event from suggestion cards
  document.addEventListener("playerSelected", (e) => {
    selectedPlayer = e.detail;
  });

  // Listen for custom playerDeselected event
  document.addEventListener("playerDeselected", () => {
    selectedPlayer = null;
  });

  // Load players on init
  loadPlayers();
}

/**
 * Renders player search results
 */
function renderPlayerSearchResults(players, container, onSelect) {
  container.innerHTML = "";

  if (players.length === 0) {
    container.innerHTML = '<p class="p-3 text-gray-500 text-sm">Keine Spieler gefunden</p>';
    container.classList.remove("hidden");
    return;
  }

  players.forEach((player) => {
    const div = document.createElement("div");
    div.className = "p-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0";
    div.innerHTML = `
      <p class="font-medium text-gray-800">${player.firstName} ${player.lastName}</p>
      <p class="text-xs text-gray-500">ELO: ${Math.round(player.eloRating || 1000)}</p>
    `;

    div.addEventListener("click", () => onSelect(player));
    container.appendChild(div);
  });

  container.classList.remove("hidden");
}

/**
 * Renders selected player
 */
function renderSelectedPlayer(player, container) {
  container.innerHTML = `
    <div class="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
      <div>
        <p class="font-semibold text-gray-800">${player.firstName} ${player.lastName}</p>
        <p class="text-xs text-gray-600">ELO: ${Math.round(player.eloRating || 1000)}</p>
      </div>
      <button type="button" class="remove-selected-player text-red-500 hover:text-red-700">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  // Add event listener for remove button
  const removeBtn = container.querySelector('.remove-selected-player');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      container.innerHTML = '';
      // Trigger custom event to clear selectedPlayer in parent scope
      document.dispatchEvent(new CustomEvent('playerDeselected'));
    });
  }
}

/**
 * Loads and renders match suggestions with real-time updates
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export async function loadMatchSuggestions(userData, db, unsubscribes = []) {
  const container = document.getElementById("match-suggestions-list");
  if (!container) return;

  container.innerHTML = '<p class="text-gray-500 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Lade Vorschläge...</p>';

  try {
    // Get all players in club
    const playersQuery = query(
      collection(db, "users"),
      where("clubId", "==", userData.clubId),
      where("role", "==", "player")
    );

    const snapshot = await getDocs(playersQuery);
    const allPlayers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Function to calculate and render suggestions
    const renderSuggestions = async () => {
      const suggestions = await calculateMatchSuggestions(userData, allPlayers, db);

      if (suggestions.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine Vorschläge verfügbar</p>';
        return;
      }

      container.innerHTML = "";

      // Render all suggestions (3-4 players)
      suggestions.forEach((player) => {
        const card = createSuggestionCard(player, userData, db);
        container.appendChild(card);
      });
    };

    // Initial render
    await renderSuggestions();

    // Listen for changes to matches collection to update suggestions in real-time
    // Set up listeners for both new format (playerIds) and old format (playerAId/playerBId)
    const matchesQueryNew = query(
      collection(db, "matches"),
      where("playerIds", "array-contains", userData.id)
    );
    const matchesQueryA = query(
      collection(db, "matches"),
      where("playerAId", "==", userData.id)
    );
    const matchesQueryB = query(
      collection(db, "matches"),
      where("playerBId", "==", userData.id)
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
    console.error("Error loading match suggestions:", error);
    container.innerHTML = '<p class="text-red-500 text-center py-4">Fehler beim Laden der Vorschläge</p>';
  }
}

/**
 * Creates a suggestion card
 */
function createSuggestionCard(player, userData, db) {
  const div = document.createElement("div");
  div.className = "bg-white border border-indigo-200 rounded-md p-2 shadow-sm hover:shadow-md transition";

  const eloDiff = Math.abs((userData.eloRating || 1000) - (player.eloRating || 1000));
  const neverPlayed = player.history.matchCount === 0;
  const lastPlayedStr = player.history.lastMatchDate
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short" }).format(player.history.lastMatchDate)
    : null;

  div.innerHTML = `
    <div class="flex justify-between items-center mb-1">
      <div class="flex-1">
        <p class="font-semibold text-gray-800 text-sm">${player.firstName} ${player.lastName}</p>
        <p class="text-xs text-gray-600">ELO: ${Math.round(player.eloRating || 1000)}</p>
      </div>
      <button class="propose-match-btn bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium py-1 px-3 rounded transition" data-player-id="${player.id}" data-player-name="${player.firstName} ${player.lastName}">
        <i class="fas fa-paper-plane mr-1"></i>Anfragen
      </button>
    </div>

    <div class="text-xs text-gray-600">
      ${neverPlayed
        ? '<span class="text-purple-700 font-medium"><i class="fas fa-star mr-1"></i>Noch nie gespielt</span>'
        : `${player.history.matchCount} Match${player.history.matchCount === 1 ? '' : 'es'}${lastPlayedStr ? `, zuletzt ${lastPlayedStr}` : ''}`
      }
    </div>
  `;

  const proposeBtn = div.querySelector(".propose-match-btn");
  proposeBtn.addEventListener("click", () => {
    // Scroll to and pre-fill the proposal form
    const proposalSection = document.getElementById("match-proposal-section");
    const searchInput = document.getElementById("proposal-player-search");
    const selectedPlayerDiv = document.getElementById("selected-proposal-player");

    if (proposalSection) {
      proposalSection.scrollIntoView({ behavior: "smooth" });

      // Pre-select the player
      renderSelectedPlayer(player, selectedPlayerDiv);

      // Trigger a custom event to set selectedPlayer in the form handler
      const event = new CustomEvent("playerSelected", { detail: player });
      document.dispatchEvent(event);
    }
  });

  return div;
}
