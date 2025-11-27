import { createDoublesMatchRequest } from './doubles-matches.js';
import { doc, getDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

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
    // Clear search inputs
    const partnerInput = document.getElementById('partner-search-input');
    const opponent1Input = document.getElementById('opponent1-search-input');
    const opponent2Input = document.getElementById('opponent2-search-input');

    if (partnerInput) {
        partnerInput.value = '';
        document.getElementById('partner-search-results').innerHTML = '';
        document.getElementById('selected-partner-id').value = '';
    }
    if (opponent1Input) {
        opponent1Input.value = '';
        document.getElementById('opponent1-search-results').innerHTML = '';
        document.getElementById('selected-opponent1-id').value = '';
    }
    if (opponent2Input) {
        opponent2Input.value = '';
        document.getElementById('opponent2-search-results').innerHTML = '';
        document.getElementById('selected-opponent2-id').value = '';
    }
}

// ========================================================================
// ===== PLAYER SEARCH FUNCTIONALITY =====
// ========================================================================

/**
 * Initializes search functionality for all 3 player selections in doubles
 * @param {Object} db - Firestore database instance
 * @param {Object} userData - Current user data
 */
export async function initializeDoublesPlayerSearch(db, userData) {
    // Load all searchable players
    let allPlayers = [];
    try {
        // Load clubs for test club filtering
        const clubsSnapshot = await getDocs(collection(db, 'clubs'));
        const clubsMap = new Map();
        clubsSnapshot.forEach(doc => {
            clubsMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // Check if current user is from a test club
        const currentUserClub = userData.clubId ? clubsMap.get(userData.clubId) : null;
        const isCurrentUserFromTestClub = currentUserClub && currentUserClub.isTestClub;

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', '==', 'player'));
        const snapshot = await getDocs(q);

        allPlayers = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => {
                // Filter: not self, match-ready, and privacy check
                const playerGrundlagen = p.grundlagenCompleted || 0;
                const isMatchReady = playerGrundlagen >= 5;
                const isSelf = p.id === userData.id;

                if (isSelf || !isMatchReady) return false;

                // Test club filtering
                if (!isCurrentUserFromTestClub && p.clubId) {
                    const playerClub = clubsMap.get(p.clubId);
                    if (playerClub && playerClub.isTestClub) {
                        return false; // Hide test club players from non-test club users
                    }
                }

                // Privacy check - 3 cases:
                // 1. Both players have NO club → visible
                // 2. Same club → visible
                // 3. Player is globally searchable → visible
                const bothNoClub = !userData.clubId && !p.clubId;
                const isSameClub = userData.clubId && p.clubId === userData.clubId;
                const isGloballySearchable = p.privacySettings?.searchable === 'global';

                return bothNoClub || isSameClub || isGloballySearchable;
            });
    } catch (error) {
        console.error('Error loading players:', error);
    }

    // Initialize search for Partner
    initializePlayerSearchInput(
        'partner-search-input',
        'partner-search-results',
        'selected-partner-id',
        'selected-partner-elo',
        allPlayers,
        userData,
        []
    );

    // Initialize search for Opponent 1
    initializePlayerSearchInput(
        'opponent1-search-input',
        'opponent1-search-results',
        'selected-opponent1-id',
        'selected-opponent1-elo',
        allPlayers,
        userData,
        []
    );

    // Initialize search for Opponent 2
    initializePlayerSearchInput(
        'opponent2-search-input',
        'opponent2-search-results',
        'selected-opponent2-id',
        'selected-opponent2-elo',
        allPlayers,
        userData,
        []
    );
}

/**
 * Initializes a single player search input
 * @param {string} inputId - ID of the search input element
 * @param {string} resultsId - ID of the results container element
 * @param {string} selectedIdFieldId - ID of the hidden field storing selected player ID
 * @param {string} selectedEloFieldId - ID of the hidden field storing selected player Elo
 * @param {Array} allPlayers - Array of all searchable players
 * @param {Object} userData - Current user data
 * @param {Array} excludeIds - Array of player IDs to exclude from results
 */
function initializePlayerSearchInput(inputId, resultsId, selectedIdFieldId, selectedEloFieldId, allPlayers, userData, excludeIds) {
    const searchInput = document.getElementById(inputId);
    const searchResults = document.getElementById(resultsId);
    const selectedIdField = document.getElementById(selectedIdFieldId);
    const selectedEloField = document.getElementById(selectedEloFieldId);

    if (!searchInput || !searchResults || !selectedIdField) return;

    // Search on input
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        // If search is empty, clear results
        if (!searchTerm) {
            searchResults.innerHTML = '';
            return;
        }

        // Filter players by search term
        const filteredPlayers = allPlayers.filter(player => {
            // Exclude players in excludeIds
            if (excludeIds.includes(player.id)) return false;

            const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
            return fullName.includes(searchTerm);
        }).slice(0, 10); // Limit to 10 results

        displaySearchResults(filteredPlayers, searchResults, searchInput, selectedIdField, selectedEloField, userData);
    });

    // Clear results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.innerHTML = '';
        }
    });
}

/**
 * Displays search results for player selection
 * @param {Array} players - Filtered players to display
 * @param {HTMLElement} resultsContainer - Container to display results
 * @param {HTMLElement} searchInput - Search input element
 * @param {HTMLElement} selectedIdField - Hidden field to store selected ID
 * @param {HTMLElement} selectedEloField - Hidden field to store selected Elo
 * @param {Object} userData - Current user data
 */
function displaySearchResults(players, resultsContainer, searchInput, selectedIdField, selectedEloField, userData) {
    if (players.length === 0) {
        resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden.</p>';
        return;
    }

    resultsContainer.innerHTML = players.map(player => {
        const clubName = player.clubId || 'Kein Verein';
        const isSameClub = player.clubId === userData.clubId;
        const doublesElo = Math.round(player.doublesEloRating || 800);

        return `
            <div class="player-search-result border border-gray-200 rounded-lg p-3 mb-2 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                 data-player-id="${player.id}"
                 data-player-elo="${doublesElo}"
                 data-player-name="${player.firstName} ${player.lastName}">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-900">${player.firstName} ${player.lastName}</h5>
                        <p class="text-sm text-gray-600">Doppel-Elo: ${doublesElo}</p>
                        <p class="text-xs text-gray-500 mt-1">
                            <i class="fas fa-users mr-1"></i>${clubName}
                        </p>
                    </div>
                    ${!isSameClub && player.clubId ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Anderer Verein</span>' : ''}
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers to results
    resultsContainer.querySelectorAll('.player-search-result').forEach(result => {
        result.addEventListener('click', () => {
            const playerId = result.dataset.playerId;
            const playerName = result.dataset.playerName;
            const playerElo = result.dataset.playerElo;

            // Set selected player
            selectedIdField.value = playerId;
            if (selectedEloField) selectedEloField.value = playerElo;

            // Update search input to show selected player
            searchInput.value = playerName;

            // Clear search results
            resultsContainer.innerHTML = '';
        });
    });
}

// Deprecated: Keep for backwards compatibility but mark as deprecated
export function populateDoublesPlayerDropdowns(players, currentUserId) {
    console.warn('populateDoublesPlayerDropdowns is deprecated. Use initializeDoublesPlayerSearch instead.');
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

    // Get player selections from hidden fields
    const partnerId = document.getElementById('selected-partner-id').value;
    const opponent1Id = document.getElementById('selected-opponent1-id').value;
    const opponent2Id = document.getElementById('selected-opponent2-id').value;

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
