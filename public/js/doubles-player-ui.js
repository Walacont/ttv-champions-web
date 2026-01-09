import { createDoublesMatchRequest } from './doubles-matches.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Doubles Player UI Module
 * Handles player interface for doubles match requests
 * NOTE: Set score input is shared via window.playerSetScoreInput (from player-matches.js)
 */

let currentPlayerMatchType = 'singles'; // 'singles' or 'doubles'

// ========================================================================
// ===== INITIALIZATION =====
// ========================================================================

/**
 * Initializes the doubles match UI for players
 */
export function initializeDoublesPlayerUI() {
    // Set up toggle buttons
    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');

    if (!singlesToggle || !doublesToggle) {
        console.error('Player toggle buttons not found');
        return;
    }

    singlesToggle.addEventListener('click', () => switchPlayerMatchType('singles'));
    doublesToggle.addEventListener('click', () => switchPlayerMatchType('doubles'));

    // Initialize with singles
    switchPlayerMatchType('singles');

    // Export getCurrentPlayerMatchType to window for access from player-matches.js
    window.getCurrentPlayerMatchType = getCurrentPlayerMatchType;
}

/**
 * Switches between singles and doubles match type for player
 * @param {string} type - 'singles' or 'doubles'
 */
function switchPlayerMatchType(type) {
    currentPlayerMatchType = type;

    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');
    const singlesContainer = document.getElementById('singles-opponent-container');
    const doublesContainer = document.getElementById('doubles-players-container');

    if (type === 'singles') {
        // Update toggle buttons
        singlesToggle.classList.add('active');
        doublesToggle.classList.remove('active');

        // Show singles, hide doubles
        singlesContainer.classList.remove('hidden');
        doublesContainer.classList.add('hidden');

        // Clear doubles selections
        clearDoublesSelections();
    } else {
        // Update toggle buttons
        doublesToggle.classList.add('active');
        singlesToggle.classList.remove('active');

        // Show doubles, hide singles
        doublesContainer.classList.remove('hidden');
        singlesContainer.classList.add('hidden');

        // Clear singles selection
        clearSinglesSelection();

        // Hide handicap info when switching to doubles
        const handicapInfo = document.getElementById('match-handicap-info');
        if (handicapInfo) {
            handicapInfo.classList.add('hidden');
        }
    }

    // Reload match history with the appropriate filter
    if (window.reloadMatchHistory) {
        window.reloadMatchHistory(type);
    }
}

/**
 * Clears singles opponent selection
 */
function clearSinglesSelection() {
    const opponentSelect = document.getElementById('opponent-select');
    if (opponentSelect) opponentSelect.value = '';
}

/**
 * Clears doubles player selections
 */
function clearDoublesSelections() {
    const selects = [
        'doubles-partner-select',
        'doubles-opponent1-select',
        'doubles-opponent2-select',
    ];

    selects.forEach(id => {
        const select = document.getElementById(id);
        if (select) select.value = '';
    });
}

// ========================================================================
// ===== POPULATE DROPDOWNS =====
// ========================================================================

/**
 * Populates all doubles dropdowns with available players
 * @param {Array} players - Array of club players
 * @param {string} currentUserId - Current user's ID (to exclude from opponents)
 */
export function populateDoublesPlayerDropdowns(players, currentUserId) {
    const partnerSelect = document.getElementById('doubles-partner-select');
    const opponent1Select = document.getElementById('doubles-opponent1-select');
    const opponent2Select = document.getElementById('doubles-opponent2-select');

    if (!partnerSelect || !opponent1Select || !opponent2Select) return;

    // Filter: exclude current user AND only show match-ready players
    const otherPlayers = players.filter(p => {
        if (p.id === currentUserId) return false;

        // Player must be match-ready (either flag is set OR has 5+ Grundlagen)
        const isMatchReady = p.isMatchReady === true || (p.grundlagenCompleted || 0) >= 5;

        return isMatchReady;
    });

    // Populate all 3 dropdowns
    [partnerSelect, opponent1Select, opponent2Select].forEach(select => {
        select.innerHTML = '<option value="">Spieler wählen...</option>';

        otherPlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.firstName} ${player.lastName} (Doppel-Elo: ${Math.round(player.doublesEloRating || 800)})`;
            select.appendChild(option);
        });
    });
}

// ========================================================================
// ===== FORM SUBMISSION =====
// ========================================================================

/**
 * Handles doubles match request submission
 * NOTE: e.preventDefault() is already called in player-matches.js before this function
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user data
 */
export async function handleDoublesPlayerMatchRequest(e, db, currentUserData) {
    const feedbackEl = document.getElementById('match-request-feedback');

    // Get player selections
    const partnerId = document.getElementById('doubles-partner-select').value;
    const opponent1Id = document.getElementById('doubles-opponent1-select').value;
    const opponent2Id = document.getElementById('doubles-opponent2-select').value;

    // Validate all players are selected
    if (!partnerId || !opponent1Id || !opponent2Id) {
        feedbackEl.textContent = 'Bitte alle Spieler auswählen: Partner und beide Gegner.';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    // Validate all players are different
    const allPlayerIds = [currentUserData.id, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        feedbackEl.textContent = 'Alle 4 Spieler müssen unterschiedlich sein!';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    // Validate all players are match-ready (5+ Grundlagen) and load player data
    let playerDocs;
    try {
        playerDocs = await Promise.all([
            getDoc(doc(db, 'users', currentUserData.id)),
            getDoc(doc(db, 'users', partnerId)),
            getDoc(doc(db, 'users', opponent1Id)),
            getDoc(doc(db, 'users', opponent2Id)),
        ]);

        const notReadyPlayers = [];
        playerDocs.forEach((playerDoc, index) => {
            if (playerDoc.exists()) {
                const data = playerDoc.data();
                const grundlagen = data.grundlagenCompleted || 0;
                if (grundlagen < 5) {
                    notReadyPlayers.push(data.firstName + ' ' + data.lastName);
                }
            }
        });

        if (notReadyPlayers.length > 0) {
            feedbackEl.textContent = `Folgende Spieler haben noch nicht genug Grundlagen (min. 5): ${notReadyPlayers.join(', ')}`;
            feedbackEl.className =
                'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
            feedbackEl.classList.remove('hidden');
            return;
        }

        // NEW: Validate that at least one opponent is an online player
        const opponent1Data = playerDocs[2]?.data(); // opponent1Id (index 2)
        const opponent2Data = playerDocs[3]?.data(); // opponent2Id (index 3)

        const opponent1IsOffline = opponent1Data?.isOffline === true;
        const opponent2IsOffline = opponent2Data?.isOffline === true;

        if (opponent1IsOffline && opponent2IsOffline) {
            feedbackEl.textContent =
                'Mindestens einer der beiden Gegner muss ein Online-Spieler sein (mit Code angemeldet). Beide Gegner können nicht Offline-Spieler sein.';
            feedbackEl.className =
                'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
            feedbackEl.classList.remove('hidden');
            return;
        }
    } catch (error) {
        console.error('Error checking player readiness:', error);
        feedbackEl.textContent = 'Fehler beim Überprüfen der Spieler-Berechtigung.';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    // Use the global set score input from player-matches.js (shared between singles and doubles)
    const setScoreInput = window.playerSetScoreInput;
    if (!setScoreInput) {
        feedbackEl.textContent = 'Fehler: Set-Score-Input nicht initialisiert.';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    const setValidation = setScoreInput.validate();
    if (!setValidation.valid) {
        feedbackEl.textContent = setValidation.error;
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    const sets = setScoreInput.getSets();
    const handicapUsed = document.getElementById('match-handicap-toggle')?.checked || false;

    // Get match mode from dropdown
    const matchModeSelect = document.getElementById('match-mode-select');
    const matchMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';

    // Convert set field names from playerA/playerB to teamA/teamB for doubles
    const doublesSets = sets.map(set => ({
        teamA: set.playerA,
        teamB: set.playerB,
    }));

    feedbackEl.textContent = 'Sende Doppel-Anfrage...';
    feedbackEl.className = 'bg-blue-100 border border-blue-300 text-blue-700 px-4 py-3 rounded';
    feedbackEl.classList.remove('hidden');

    try {
        // Extract player names from already loaded player docs
        const partnerData = playerDocs[1]?.data();
        const opponent1Data = playerDocs[2]?.data();
        const opponent2Data = playerDocs[3]?.data();

        const requestData = {
            partnerId: partnerId,
            opponent1Id: opponent1Id,
            opponent2Id: opponent2Id,
            sets: doublesSets,
            handicapUsed: handicapUsed,
            matchMode: matchMode,
            playerNames: {
                player1: `${currentUserData.firstName} ${currentUserData.lastName}`,
                player2: partnerData
                    ? `${partnerData.firstName} ${partnerData.lastName}`
                    : 'Unbekannt',
                opponent1: opponent1Data
                    ? `${opponent1Data.firstName} ${opponent1Data.lastName}`
                    : 'Unbekannt',
                opponent2: opponent2Data
                    ? `${opponent2Data.firstName} ${opponent2Data.lastName}`
                    : 'Unbekannt',
            },
        };

        const result = await createDoublesMatchRequest(requestData, db, currentUserData);

        if (result.success) {
            feedbackEl.textContent =
                '✅ Doppel-Anfrage gesendet! Einer der Gegner muss bestätigen, dann muss der Coach genehmigen.';
            feedbackEl.className =
                'bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded';

            // Reset form
            if (setScoreInput && setScoreInput.reset) {
                setScoreInput.reset();
            }
            clearDoublesSelections();

            // Hide feedback after 5 seconds
            setTimeout(() => {
                feedbackEl.classList.add('hidden');
            }, 5000);
        }
    } catch (error) {
        console.error('Error creating doubles match request:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
    }
}

/**
 * Returns the current match type
 * @returns {string} 'singles' or 'doubles'
 */
export function getCurrentPlayerMatchType() {
    return currentPlayerMatchType;
}
