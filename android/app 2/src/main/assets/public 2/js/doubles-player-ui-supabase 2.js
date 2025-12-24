import { createDoublesMatchRequest } from './doubles-matches-supabase.js';
import { calculateDoublesHandicap } from './validation-utils.js';

/**
 * Doubles Player UI Module (Supabase Version)
 * Handles player interface for doubles match requests
 * NOTE: Set score input is shared via window.playerSetScoreInput (from player-matches.js)
 */

// ========================================================================
// ===== HELPER FUNCTIONS =====
// ========================================================================

/**
 * Checks if a player has no club
 * @param {string|null|undefined} clubId - The club ID to check
 * @returns {boolean} True if player has no club (null, undefined, or empty string)
 */
function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

let currentPlayerMatchType = 'singles'; // 'singles' or 'doubles'
let supabaseClient = null; // Store supabase client for use in handicap calculation
let currentDoublesHandicapDetails = null; // Stores current handicap suggestion details for doubles

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
    const teamEloDisplay = document.getElementById('doubles-team-elo-display');

    if (type === 'singles') {
        // Update toggle buttons
        singlesToggle.classList.add('active');
        doublesToggle.classList.remove('active');

        // Show singles, hide doubles
        singlesContainer.classList.remove('hidden');
        doublesContainer.classList.add('hidden');

        // Hide team Elo display
        if (teamEloDisplay) {
            teamEloDisplay.classList.add('hidden');
        }

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
    // Clear handicap details
    currentDoublesHandicapDetails = null;

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
 * @param {Object} supabase - Supabase client instance
 * @param {Object} userData - Current user data
 */
export async function initializeDoublesPlayerSearch(supabase, userData) {
    // Store supabase client for later use (e.g., handicap calculation)
    supabaseClient = supabase;

    // Load all searchable players - with real-time updates
    // Use object wrapper so search functions always access current data
    const playersData = { players: [] };

    // Get current user's sport ID for filtering (support both camelCase and snake_case)
    const userSportId = userData.activeSportId || userData.active_sport_id;
    // Support both camelCase and snake_case for clubId
    const userClubId = userData.clubId || userData.club_id;

    async function loadPlayers() {
        try {
            // Load clubs for test club filtering
            const { data: clubsData } = await supabase.from('clubs').select('*');
            const clubsMap = new Map();
            (clubsData || []).forEach(club => clubsMap.set(club.id, club));

            // Check if current user is from a test club
            const currentUserClub = userClubId ? clubsMap.get(userClubId) : null;
            const isCurrentUserFromTestClub = currentUserClub && currentUserClub.is_test_club;

            // Load players and coaches - explicitly exclude admins
            // Don't filter by sport in query - we'll do it in JS to allow offline players
            let query = supabase
                .from('profiles')
                .select('*')
                .in('role', ['player', 'coach', 'head_coach'])
                .neq('role', 'admin'); // Extra safety: explicitly exclude admins

            const { data: usersData, error } = await query;

            if (error) throw error;

            playersData.players = (usersData || [])
                .map(p => {
                    const playerClub = p.club_id ? clubsMap.get(p.club_id) : null;
                    return {
                        id: p.id,
                        firstName: p.first_name,
                        lastName: p.last_name,
                        clubId: p.club_id,
                        clubName: playerClub ? playerClub.name : null,
                        doublesEloRating: p.doubles_elo_rating,
                        privacySettings: p.privacy_settings,
                        isOffline: p.is_offline,
                        activeSportId: p.active_sport_id,
                        isMatchReady: p.is_match_ready,
                    };
                })
                .filter(p => {
                    // Filter: not self
                    const isSelf = p.id === userData.id;
                    if (isSelf) return false;

                    // Offline players are always allowed in doubles (they bypass match-ready check)
                    // Online players must be match-ready
                    if (!p.isOffline && !p.isMatchReady) return false;

                    // Sport filter: same sport OR offline player (offline players can play any sport)
                    if (userSportId && !p.isOffline) {
                        if (p.activeSportId !== userSportId) return false;
                    }

                    // Test club filtering
                    if (!isCurrentUserFromTestClub && p.clubId) {
                        const playerClub = clubsMap.get(p.clubId);
                        if (playerClub && playerClub.is_test_club) {
                            return false;
                        }
                    }

                    // Offline players in the same club are always visible (bypass privacy check)
                    if (p.isOffline && userClubId && p.clubId === userClubId) {
                        return true;
                    }

                    // Privacy check
                    if (hasNoClub(userClubId) && hasNoClub(p.clubId)) {
                        return true;
                    }

                    const searchable = p.privacySettings?.searchable || 'global';

                    if (searchable === 'global') {
                        return true;
                    }

                    if (searchable === 'club_only' && userClubId && p.clubId === userClubId) {
                        return true;
                    }

                    return false;
                });

            console.log('[Doubles Player Search] Players list updated with', playersData.players.length, 'players');
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    // Initial load
    await loadPlayers();

    // Set up real-time subscription for player updates
    supabase
        .channel('doubles-player-search-updates')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'profiles'
            },
            () => {
                loadPlayers();
            }
        )
        .subscribe();

    // Track selected player IDs to exclude from other searches
    const selectedIds = {
        partner: null,
        opponent1: null,
        opponent2: null
    };

    // Function to get all currently selected IDs (excluding a specific field)
    function getExcludeIds(excludeField) {
        const ids = [];
        if (excludeField !== 'partner' && selectedIds.partner) ids.push(selectedIds.partner);
        if (excludeField !== 'opponent1' && selectedIds.opponent1) ids.push(selectedIds.opponent1);
        if (excludeField !== 'opponent2' && selectedIds.opponent2) ids.push(selectedIds.opponent2);
        return ids;
    }

    // Initialize search for Partner - pass playersData object
    initializePlayerSearchInput(
        'partner-search-input',
        'partner-search-results',
        'selected-partner-id',
        'selected-partner-elo',
        playersData,
        userData,
        () => getExcludeIds('partner'),
        (id) => { selectedIds.partner = id; }
    );

    // Initialize search for Opponent 1
    initializePlayerSearchInput(
        'opponent1-search-input',
        'opponent1-search-results',
        'selected-opponent1-id',
        'selected-opponent1-elo',
        playersData,
        userData,
        () => getExcludeIds('opponent1'),
        (id) => { selectedIds.opponent1 = id; }
    );

    // Initialize search for Opponent 2
    initializePlayerSearchInput(
        'opponent2-search-input',
        'opponent2-search-results',
        'selected-opponent2-id',
        'selected-opponent2-elo',
        playersData,
        userData,
        () => getExcludeIds('opponent2'),
        (id) => { selectedIds.opponent2 = id; }
    );
}

/**
 * Initializes a single player search input
 * @param {string} inputId - ID of the search input element
 * @param {string} resultsId - ID of the results container element
 * @param {string} selectedIdFieldId - ID of the hidden field storing selected player ID
 * @param {string} selectedEloFieldId - ID of the hidden field storing selected player Elo
 * @param {Object} playersData - Object with players array (for real-time updates)
 * @param {Object} userData - Current user data
 * @param {Function} getExcludeIds - Function that returns array of player IDs to exclude
 * @param {Function} onSelect - Callback when a player is selected
 */
function initializePlayerSearchInput(inputId, resultsId, selectedIdFieldId, selectedEloFieldId, playersData, userData, getExcludeIds, onSelect) {
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

        // Get current exclude IDs (dynamically)
        const excludeIds = getExcludeIds();

        // Filter players by search term - use playersData.players for real-time data
        const filteredPlayers = playersData.players.filter(player => {
            // Exclude players already selected in other fields
            if (excludeIds.includes(player.id)) return false;

            const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
            return fullName.includes(searchTerm);
        }).slice(0, 10); // Limit to 10 results

        displaySearchResults(filteredPlayers, searchResults, searchInput, selectedIdField, selectedEloField, userData, onSelect);
    });

    // Clear results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.innerHTML = '';
        }
    });

    // Clear selection when input is cleared
    searchInput.addEventListener('input', (e) => {
        if (!e.target.value.trim()) {
            selectedIdField.value = '';
            if (selectedEloField) selectedEloField.value = '';
            onSelect(null);
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
 * @param {Function} onSelect - Callback when a player is selected
 */
function displaySearchResults(players, resultsContainer, searchInput, selectedIdField, selectedEloField, userData, onSelect) {
    if (players.length === 0) {
        resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden.</p>';
        return;
    }

    resultsContainer.innerHTML = players.map(player => {
        const clubName = player.clubName || 'Kein Verein';
        // Check both camelCase and snake_case for userData club ID
        const userClubId = userData.clubId || userData.club_id;
        const isSameClub = player.clubId === userClubId;

        return `
            <div class="player-search-result border border-gray-200 rounded-lg p-3 mb-2 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                 data-player-id="${player.id}"
                 data-player-name="${player.firstName} ${player.lastName}">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-900">${player.firstName} ${player.lastName}</h5>
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

            // Set selected player
            selectedIdField.value = playerId;
            // Note: Individual Elo field is deprecated - pairing Elo is now used
            if (selectedEloField) selectedEloField.value = '800'; // Default, will be looked up from pairing

            // Update search input to show selected player
            searchInput.value = playerName;

            // Track selection for excluding from other searches
            if (onSelect) onSelect(playerId);

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
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Current user data
 */
export async function handleDoublesPlayerMatchRequest(e, supabase, currentUserData) {
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
    let playersData;
    try {
        const { data: players, error } = await supabase
            .from('profiles')
            .select('*')
            .in('id', allPlayerIds);

        if (error) throw error;

        const notReadyPlayers = [];
        (players || []).forEach(player => {
            const grundlagen = player.grundlagen_completed || 0;
            if (grundlagen < 5) {
                notReadyPlayers.push(player.first_name + ' ' + player.last_name);
            }
        });

        if (notReadyPlayers.length > 0) {
            feedbackEl.textContent = `Folgende Spieler haben noch nicht genug Grundlagen (min. 5): ${notReadyPlayers.join(', ')}`;
            feedbackEl.className =
                'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
            feedbackEl.classList.remove('hidden');
            return;
        }

        // Build a map for quick lookup
        playersData = new Map();
        (players || []).forEach(p => playersData.set(p.id, p));

        // NEW: Validate that at least one opponent is an online player
        const opponent1Data = playersData.get(opponent1Id);
        const opponent2Data = playersData.get(opponent2Id);

        const opponent1IsOffline = opponent1Data?.is_offline === true;
        const opponent2IsOffline = opponent2Data?.is_offline === true;

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
        // Extract player names from loaded player data
        const partnerData = playersData.get(partnerId);
        const opponent1Data = playersData.get(opponent1Id);
        const opponent2Data = playersData.get(opponent2Id);

        // Handle both camelCase and snake_case for user data
        const userFirstName = currentUserData.firstName || currentUserData.first_name || '';
        const userLastName = currentUserData.lastName || currentUserData.last_name || '';

        // Build handicap object if handicap is used
        const handicapData = handicapUsed && currentDoublesHandicapDetails ? {
            team: currentDoublesHandicapDetails.team,
            team_name: currentDoublesHandicapDetails.team_name,
            points: currentDoublesHandicapDetails.points
        } : null;

        const requestData = {
            partnerId: partnerId,
            opponent1Id: opponent1Id,
            opponent2Id: opponent2Id,
            sets: doublesSets,
            handicapUsed: handicapUsed,
            handicap: handicapData,
            matchMode: matchMode,
            playerNames: {
                player1: `${userFirstName} ${userLastName}`.trim() || 'Unbekannt',
                player2: partnerData
                    ? `${partnerData.first_name} ${partnerData.last_name}`
                    : 'Unbekannt',
                opponent1: opponent1Data
                    ? `${opponent1Data.first_name} ${opponent1Data.last_name}`
                    : 'Unbekannt',
                opponent2: opponent2Data
                    ? `${opponent2Data.first_name} ${opponent2Data.last_name}`
                    : 'Unbekannt',
            },
        };

        const result = await createDoublesMatchRequest(requestData, supabase, currentUserData);

        if (result.success) {
            feedbackEl.textContent = 'Doppel-Anfrage gesendet! Einer der Gegner muss bestätigen, dann wird das Match automatisch genehmigt.';
            feedbackEl.className =
                'bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded';

            // Reset form
            if (setScoreInput && setScoreInput.reset) {
                setScoreInput.reset();
            }
            clearDoublesSelections();

            // Refresh match requests list if available
            if (typeof window.loadMatchRequests === 'function') {
                window.loadMatchRequests();
            }

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

// ========================================================================
// ===== HANDICAP SETUP =====
// ========================================================================

/**
 * Sets up handicap calculation for doubles player form
 * @param {Object} playersData - Object with players array
 * @param {Object} userData - Current user data
 */
export function setupDoublesPlayerHandicap(playersData, userData) {
    const partnerIdField = document.getElementById('selected-partner-id');
    const opponent1IdField = document.getElementById('selected-opponent1-id');
    const opponent2IdField = document.getElementById('selected-opponent2-id');
    const handicapInfo = document.getElementById('match-handicap-info');
    const handicapText = document.getElementById('match-handicap-text');
    const handicapToggleContainer = document.getElementById('match-handicap-toggle-container');
    const teamEloDisplay = document.getElementById('doubles-team-elo-display');
    const teamAEloValue = document.getElementById('team-a-elo-value');
    const teamBEloValue = document.getElementById('team-b-elo-value');

    if (!partnerIdField || !opponent1IdField || !opponent2IdField || !handicapInfo || !handicapText) {
        console.warn('Handicap elements not found for doubles player form');
        return;
    }

    /**
     * Calculate and display handicap based on current selections
     * Uses PAIRING Elo from doubles_pairings table (not individual player average)
     */
    async function calculateAndDisplayHandicap() {
        const partnerId = partnerIdField.value;
        const opponent1Id = opponent1IdField.value;
        const opponent2Id = opponent2IdField.value;

        // Check if all 3 players are selected
        if (!partnerId || !opponent1Id || !opponent2Id) {
            // Hide handicap and team Elo if not all players selected
            handicapInfo.classList.add('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.add('hidden');
            }
            if (teamEloDisplay) {
                teamEloDisplay.classList.add('hidden');
            }
            return;
        }

        // Get player data from playersData
        const partner = playersData.players.find(p => p.id === partnerId);
        const opponent1 = playersData.players.find(p => p.id === opponent1Id);
        const opponent2 = playersData.players.find(p => p.id === opponent2Id);

        // If any player not found, hide handicap and team Elo
        if (!partner || !opponent1 || !opponent2) {
            handicapInfo.classList.add('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.add('hidden');
            }
            if (teamEloDisplay) {
                teamEloDisplay.classList.add('hidden');
            }
            return;
        }

        // Calculate pairing IDs (sorted player IDs for consistency)
        const currentUserId = userData.id;
        const teamAPairingId = currentUserId < partnerId
            ? `${currentUserId}_${partnerId}`
            : `${partnerId}_${currentUserId}`;
        const teamBPairingId = opponent1Id < opponent2Id
            ? `${opponent1Id}_${opponent2Id}`
            : `${opponent2Id}_${opponent1Id}`;

        // Fetch PAIRING Elo from database (not individual player average!)
        let teamAElo = 800; // Default for new pairing
        let teamBElo = 800; // Default for new pairing
        let teamAIsNew = true;
        let teamBIsNew = true;

        if (supabaseClient) {
            try {
                // Fetch Team A pairing
                const { data: teamAPairing } = await supabaseClient
                    .from('doubles_pairings')
                    .select('current_elo_rating')
                    .eq('id', teamAPairingId)
                    .single();

                if (teamAPairing) {
                    teamAElo = teamAPairing.current_elo_rating || 800;
                    teamAIsNew = false;
                }

                // Fetch Team B pairing
                const { data: teamBPairing } = await supabaseClient
                    .from('doubles_pairings')
                    .select('current_elo_rating')
                    .eq('id', teamBPairingId)
                    .single();

                if (teamBPairing) {
                    teamBElo = teamBPairing.current_elo_rating || 800;
                    teamBIsNew = false;
                }
            } catch (err) {
                console.warn('Could not fetch pairing Elo, using defaults:', err);
            }
        }

        // Display team Elo values with "Neu" indicator for new pairings
        if (teamEloDisplay && teamAEloValue && teamBEloValue) {
            teamAEloValue.textContent = teamAIsNew ? `Neu (${teamAElo})` : teamAElo;
            teamBEloValue.textContent = teamBIsNew ? `Neu (${teamBElo})` : teamBElo;
            teamEloDisplay.classList.remove('hidden');
        }

        // Build team objects for handicap calculation using PAIRING Elo
        const teamA = {
            player1: { eloRating: teamAElo / 2 }, // Split for handicap calc formula
            player2: { eloRating: teamAElo / 2 }
        };

        const teamB = {
            player1: { eloRating: teamBElo / 2 },
            player2: { eloRating: teamBElo / 2 }
        };

        // Calculate handicap
        const handicapResult = calculateDoublesHandicap(teamA, teamB);

        if (handicapResult && handicapText) {
            // Build team names - handle both snake_case and camelCase
            const userFirstName = userData.first_name || userData.firstName || '';
            const userLastName = userData.last_name || userData.lastName || '';
            const partnerFirstName = partner.first_name || partner.firstName || '';
            const partnerLastName = partner.last_name || partner.lastName || '';
            const opp1FirstName = opponent1.first_name || opponent1.firstName || '';
            const opp1LastName = opponent1.last_name || opponent1.lastName || '';
            const opp2FirstName = opponent2.first_name || opponent2.firstName || '';
            const opp2LastName = opponent2.last_name || opponent2.lastName || '';

            const teamAName = `${userFirstName} ${userLastName} & ${partnerFirstName} ${partnerLastName}`;
            const teamBName = `${opp1FirstName} ${opp1LastName} & ${opp2FirstName} ${opp2LastName}`;

            const weakerTeamName = handicapResult.team === 'A' ? teamAName.trim() : teamBName.trim();

            // Store handicap details for later use when saving match
            currentDoublesHandicapDetails = {
                team: handicapResult.team,
                team_name: weakerTeamName,
                points: handicapResult.points,
                team_a_elo: teamAElo,
                team_b_elo: teamBElo
            };

            handicapText.textContent = `${weakerTeamName} startet mit ${handicapResult.points} Punkt${handicapResult.points !== 1 ? 'en' : ''} Vorsprung (${teamAElo} vs ${teamBElo} Elo)`;
            handicapInfo.classList.remove('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.remove('hidden');
            }
        } else {
            // No handicap needed
            currentDoublesHandicapDetails = null;
            handicapInfo.classList.add('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.add('hidden');
            }
        }
    }

    // Use MutationObserver to watch for changes to hidden fields
    const observer = new MutationObserver(() => {
        calculateAndDisplayHandicap();
    });

    // Observe all three hidden fields
    observer.observe(partnerIdField, { attributes: true, attributeFilter: ['value'] });
    observer.observe(opponent1IdField, { attributes: true, attributeFilter: ['value'] });
    observer.observe(opponent2IdField, { attributes: true, attributeFilter: ['value'] });

    // Also add direct event listener for when value is set programmatically
    // Since MutationObserver doesn't always catch programmatic value changes,
    // we'll add a periodic check as a fallback
    let lastPartnerId = '';
    let lastOpponent1Id = '';
    let lastOpponent2Id = '';

    setInterval(() => {
        const currentPartnerId = partnerIdField.value;
        const currentOpponent1Id = opponent1IdField.value;
        const currentOpponent2Id = opponent2IdField.value;

        if (currentPartnerId !== lastPartnerId ||
            currentOpponent1Id !== lastOpponent1Id ||
            currentOpponent2Id !== lastOpponent2Id) {
            lastPartnerId = currentPartnerId;
            lastOpponent1Id = currentOpponent1Id;
            lastOpponent2Id = currentOpponent2Id;
            calculateAndDisplayHandicap();
        }
    }, 500); // Check every 500ms
}
