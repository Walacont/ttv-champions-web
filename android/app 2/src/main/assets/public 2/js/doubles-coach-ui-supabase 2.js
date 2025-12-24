import { saveDoublesMatch } from './doubles-matches-supabase.js';
import { createSetScoreInput, createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';
import { getSportContext } from './sport-context-supabase.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';
import { calculateDoublesHandicap } from './validation-utils.js';

/**
 * Doubles Coach UI Module (Supabase Version)
 * Handles coach interface for doubles matches
 */

let currentMatchType = 'singles'; // 'singles' or 'doubles'
let doublesSetScoreInput = null;
let currentUserId = null;
let currentCoachDoublesHandicapDetails = null; // Stores current handicap suggestion details for coach doubles

// ========================================================================
// ===== HELPER FUNCTIONS =====
// ========================================================================

/**
 * Creates sport-specific score input for doubles matches
 * @param {HTMLElement} container - Container element
 * @param {Array} sets - Existing sets
 * @param {string} mode - Match mode
 * @returns {Object} Score input instance
 */
async function createDoublesScoreInput(container, sets = [], mode = 'best-of-5') {
    if (!currentUserId) {
        // Fallback to table tennis if no user ID
        return createSetScoreInput(container, sets, mode);
    }

    const sportContext = await getSportContext(currentUserId);
    const sportName = sportContext?.sportName;

    const goldenPointCheckbox = document.getElementById('coach-golden-point-checkbox');
    const matchTieBreakCheckbox = document.getElementById('coach-match-tiebreak-checkbox');

    if (sportName === 'tennis' || sportName === 'padel') {
        const options = {
            mode: mode || 'best-of-3',
            goldenPoint: goldenPointCheckbox?.checked || false,
            matchTieBreak: matchTieBreakCheckbox?.checked || false
        };
        return createTennisScoreInput(container, sets, options);
    } else if (sportName === 'badminton') {
        return createBadmintonScoreInput(container, sets, 'best-of-3');
    } else {
        // Table tennis (default)
        return createSetScoreInput(container, sets, mode || 'best-of-5');
    }
}

// ========================================================================
// ===== INITIALIZATION =====
// ========================================================================

/**
 * Initializes the doubles match UI for coach
 */
export function initializeDoublesCoachUI() {
    // Set up toggle buttons
    const singlesToggle = document.getElementById('singles-toggle');
    const doublesToggle = document.getElementById('doubles-toggle');

    if (!singlesToggle || !doublesToggle) {
        console.error('Toggle buttons not found');
        return;
    }

    singlesToggle.addEventListener('click', () => switchMatchType('singles'));
    doublesToggle.addEventListener('click', () => switchMatchType('doubles'));

    // Initialize with singles
    switchMatchType('singles');
}

/**
 * Switches between singles and doubles match type
 * @param {string} type - 'singles' or 'doubles'
 */
function switchMatchType(type) {
    currentMatchType = type;

    const singlesToggle = document.getElementById('singles-toggle');
    const doublesToggle = document.getElementById('doubles-toggle');
    const singlesContainer = document.getElementById('singles-players-container');
    const doublesContainer = document.getElementById('doubles-players-container');

    if (type === 'singles') {
        // Update toggle buttons
        singlesToggle.classList.add('active', 'bg-indigo-600', 'text-white');
        singlesToggle.classList.remove('text-gray-700');
        doublesToggle.classList.remove('active', 'bg-indigo-600', 'text-white');
        doublesToggle.classList.add('text-gray-700');

        // Show singles, hide doubles
        singlesContainer.classList.remove('hidden');
        doublesContainer.classList.add('hidden');

        // Clear doubles selections
        clearDoublesSelections();
    } else {
        // Update toggle buttons
        doublesToggle.classList.add('active', 'bg-indigo-600', 'text-white');
        doublesToggle.classList.remove('text-gray-700');
        singlesToggle.classList.remove('active', 'bg-indigo-600', 'text-white');
        singlesToggle.classList.add('text-gray-700');

        // Show doubles, hide singles
        doublesContainer.classList.remove('hidden');
        singlesContainer.classList.add('hidden');

        // Clear singles selections
        clearSinglesSelections();

        // Hide handicap suggestion when switching to doubles
        const handicapSuggestion = document.getElementById('handicap-suggestion');
        const handicapToggleContainer = document.getElementById('handicap-toggle-container');
        if (handicapSuggestion) {
            handicapSuggestion.classList.add('hidden');
        }
        if (handicapToggleContainer) {
            handicapToggleContainer.classList.add('hidden');
        }
    }

    console.log(`Match type switched to: ${type}`);
}

/**
 * Clears singles player selections
 */
function clearSinglesSelections() {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    if (playerASelect) playerASelect.value = '';
    if (playerBSelect) playerBSelect.value = '';
}

/**
 * Clears doubles player selections
 */
function clearDoublesSelections() {
    // Clear handicap details
    currentCoachDoublesHandicapDetails = null;

    const selects = [
        'doubles-team-a-player1-select',
        'doubles-team-a-player2-select',
        'doubles-team-b-player1-select',
        'doubles-team-b-player2-select',
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
 * Populates all doubles dropdowns with match-ready players
 * @param {Array} clubPlayers - Array of club players
 * @param {string} currentSubgroupFilter - Current subgroup filter
 * @param {string} excludePlayerId - Player ID to exclude (e.g., coach)
 * @param {string} currentGenderFilter - Current gender filter
 */
export function populateDoublesDropdowns(clubPlayers, currentSubgroupFilter = 'all', excludePlayerId = null, currentGenderFilter = 'all') {
    // Filter match-ready players (only check isMatchReady flag)
    let matchReadyPlayers = clubPlayers.filter(p => {
        const isMatchReady = p.isMatchReady === true || p.is_match_ready === true;
        return isMatchReady;
    });

    // Debug logging for filters
    console.log('[Doubles] populateDoublesDropdowns:', {
        totalPlayers: clubPlayers.length,
        matchReadyBefore: matchReadyPlayers.length,
        subgroupFilter: currentSubgroupFilter,
        genderFilter: currentGenderFilter,
        excludePlayerId
    });

    // Apply subgroup/age filter first
    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            console.log('[Doubles] Filtering by age group:', currentSubgroupFilter);
            matchReadyPlayers = filterPlayersByAgeGroup(matchReadyPlayers, currentSubgroupFilter);
            console.log('[Doubles] After age filter:', matchReadyPlayers.length);
        } else if (!isGenderFilter(currentSubgroupFilter)) {
            // Custom subgroup filter (not gender - gender is handled separately)
            console.log('[Doubles] Filtering by custom subgroup:', currentSubgroupFilter);
            matchReadyPlayers = matchReadyPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
            console.log('[Doubles] After custom subgroup filter:', matchReadyPlayers.length);
        }
    }

    // Apply gender filter separately (can be combined with age/subgroup filter)
    if (currentGenderFilter && currentGenderFilter !== 'all' && currentGenderFilter !== 'gender_all') {
        console.log('[Doubles] Filtering by gender:', currentGenderFilter);
        matchReadyPlayers = filterPlayersByGender(matchReadyPlayers, currentGenderFilter);
        console.log('[Doubles] After gender filter:', matchReadyPlayers.length);
    }

    // Exclude the specified player (e.g., coach) from the dropdowns
    if (excludePlayerId) {
        matchReadyPlayers = matchReadyPlayers.filter(p => p.id !== excludePlayerId);
        console.log('[Doubles] After excluding player:', matchReadyPlayers.length);
    }

    // Populate all 4 dropdowns
    const dropdownIds = [
        'doubles-team-a-player1-select',
        'doubles-team-a-player2-select',
        'doubles-team-b-player1-select',
        'doubles-team-b-player2-select',
    ];

    dropdownIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        select.innerHTML = '<option value="">Spieler wählen...</option>';

        matchReadyPlayers.forEach(player => {
            const option = document.createElement('option');
            option.value = player.id;
            option.textContent = `${player.firstName} ${player.lastName} (Doppel-Elo: ${Math.round(player.doublesEloRating || 800)})`;
            select.appendChild(option);
        });
    });

    console.log(`Populated doubles dropdowns with ${matchReadyPlayers.length} players`);
}

// ========================================================================
// ===== FORM SUBMISSION =====
// ========================================================================

/**
 * Handles doubles match form submission
 * @param {Event} e - Form submit event
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Current user data
 */
export async function handleDoublesMatchSave(e, supabase, currentUserData) {
    e.preventDefault();

    const feedbackEl = document.getElementById('match-feedback');

    // Get player selections
    const teamAPlayer1Id = document.getElementById('doubles-team-a-player1-select').value;
    const teamAPlayer2Id = document.getElementById('doubles-team-a-player2-select').value;
    const teamBPlayer1Id = document.getElementById('doubles-team-b-player1-select').value;
    const teamBPlayer2Id = document.getElementById('doubles-team-b-player2-select').value;

    // Validate all players are selected
    if (!teamAPlayer1Id || !teamAPlayer2Id || !teamBPlayer1Id || !teamBPlayer2Id) {
        feedbackEl.textContent = 'Bitte alle 4 Spieler auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    // Validate all players are different
    const allPlayerIds = [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id];
    if (new Set(allPlayerIds).size !== 4) {
        feedbackEl.textContent = 'Alle 4 Spieler müssen unterschiedlich sein!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    // Validate set scores
    if (!doublesSetScoreInput) {
        feedbackEl.textContent = 'Fehler: Set-Score-Input nicht initialisiert.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const setValidation = doublesSetScoreInput.validate();
    if (!setValidation.valid) {
        feedbackEl.textContent = setValidation.error;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const sets = doublesSetScoreInput.getSets();
    const winningTeam = setValidation.winnerId; // 'A' or 'B'

    // Convert set field names from playerA/playerB to teamA/teamB for doubles
    const doublesSets = sets.map(set => ({
        teamA: set.playerA,
        teamB: set.playerB,
    }));

    const handicapUsed = document.getElementById('handicap-toggle')?.checked || false;

    // Get match mode from dropdown
    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const matchMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';

    feedbackEl.textContent = 'Speichere Doppel-Match...';
    feedbackEl.className = 'mt-3 text-sm font-medium text-center text-gray-600';

    try {
        // Build handicap object if handicap is used
        const handicapData = handicapUsed && currentCoachDoublesHandicapDetails ? {
            team: currentCoachDoublesHandicapDetails.team,
            team_name: currentCoachDoublesHandicapDetails.team_name,
            points: currentCoachDoublesHandicapDetails.points
        } : null;

        const matchData = {
            teamA_player1Id: teamAPlayer1Id,
            teamA_player2Id: teamAPlayer2Id,
            teamB_player1Id: teamBPlayer1Id,
            teamB_player2Id: teamBPlayer2Id,
            winningTeam: winningTeam,
            sets: doublesSets,
            handicapUsed: handicapUsed,
            handicap: handicapData,
            matchMode: matchMode,
        };

        const result = await saveDoublesMatch(matchData, supabase, currentUserData);

        if (result.success) {
            feedbackEl.textContent = 'Doppel-Match gemeldet! Punkte werden in Kürze aktualisiert.';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';

            // Reset form
            e.target.reset();

            // Reset match mode dropdown to default and recreate set score input
            const matchModeSelect = document.getElementById('coach-match-mode-select');
            const setScoreLabel = document.getElementById('coach-set-score-label');
            const container = document.getElementById('coach-set-score-container');

            if (matchModeSelect) {
                matchModeSelect.value = 'best-of-5';
            }

            // Recreate doubles set score input with default mode (sport-specific)
            if (container) {
                doublesSetScoreInput = await createDoublesScoreInput(container, [], 'best-of-5');
                if (setScoreLabel) {
                    // Label will be updated based on sport
                    const sportContext = currentUserId ? await getSportContext(currentUserId) : null;
                    const sportName = sportContext?.sportName;
                    if (sportName === 'tennis' || sportName === 'padel') {
                        setScoreLabel.textContent = 'Satzergebnisse (Best of 3)';
                    } else if (sportName === 'badminton') {
                        setScoreLabel.textContent = 'Satzergebnisse (Best of 3, bis 21)';
                    } else {
                        setScoreLabel.textContent = 'Satzergebnisse (Best of 5)';
                    }
                }
            }

            clearDoublesSelections();
        }
    } catch (error) {
        console.error('Error saving doubles match:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
}

/**
 * Returns the current match type
 * @returns {string} 'singles' or 'doubles'
 */
export function getCurrentMatchType() {
    return currentMatchType;
}

/**
 * Sets the current user ID for sport context
 * @param {string} userId - User ID
 */
export function setDoublesUserId(userId) {
    currentUserId = userId;
}

/**
 * Sets the doubles set score input instance
 * @param {Object} inputInstance - Set score input instance
 */
export function setDoublesSetScoreInput(inputInstance) {
    doublesSetScoreInput = inputInstance;
}

// Make functions available globally
window.setDoublesSetScoreInput = setDoublesSetScoreInput;
window.setDoublesUserId = setDoublesUserId;

// ========================================================================
// ===== HANDICAP SETUP =====
// ========================================================================

/**
 * Sets up handicap calculation for doubles matches
 * @param {Array} clubPlayers - Array of club players for lookup
 */
export function setupDoublesHandicap(clubPlayers) {
    const teamAPlayer1Select = document.getElementById('doubles-team-a-player1-select');
    const teamAPlayer2Select = document.getElementById('doubles-team-a-player2-select');
    const teamBPlayer1Select = document.getElementById('doubles-team-b-player1-select');
    const teamBPlayer2Select = document.getElementById('doubles-team-b-player2-select');
    const handicapSuggestion = document.getElementById('handicap-suggestion');
    const handicapText = document.getElementById('handicap-text');
    const handicapToggleContainer = document.getElementById('handicap-toggle-container');
    const handicapToggle = document.getElementById('handicap-toggle');

    if (!teamAPlayer1Select || !teamAPlayer2Select || !teamBPlayer1Select || !teamBPlayer2Select) {
        return;
    }

    // Create player lookup map
    const playersMap = new Map();
    clubPlayers.forEach(player => {
        playersMap.set(player.id, player);
    });

    function calculateAndDisplayHandicap() {
        const teamAPlayer1Id = teamAPlayer1Select.value;
        const teamAPlayer2Id = teamAPlayer2Select.value;
        const teamBPlayer1Id = teamBPlayer1Select.value;
        const teamBPlayer2Id = teamBPlayer2Select.value;

        // Check if all players are selected
        if (!teamAPlayer1Id || !teamAPlayer2Id || !teamBPlayer1Id || !teamBPlayer2Id) {
            // Hide handicap if not all players selected
            if (handicapSuggestion) handicapSuggestion.classList.add('hidden');
            if (handicapToggleContainer) handicapToggleContainer.classList.add('hidden');
            return;
        }

        const teamAPlayer1 = playersMap.get(teamAPlayer1Id);
        const teamAPlayer2 = playersMap.get(teamAPlayer2Id);
        const teamBPlayer1 = playersMap.get(teamBPlayer1Id);
        const teamBPlayer2 = playersMap.get(teamBPlayer2Id);

        if (!teamAPlayer1 || !teamAPlayer2 || !teamBPlayer1 || !teamBPlayer2) {
            if (handicapSuggestion) handicapSuggestion.classList.add('hidden');
            if (handicapToggleContainer) handicapToggleContainer.classList.add('hidden');
            return;
        }

        // Calculate handicap using doubles Elo - handle both snake_case and camelCase
        const teamA = {
            player1: { eloRating: teamAPlayer1.doubles_elo_rating || teamAPlayer1.doublesEloRating || 800 },
            player2: { eloRating: teamAPlayer2.doubles_elo_rating || teamAPlayer2.doublesEloRating || 800 }
        };

        const teamB = {
            player1: { eloRating: teamBPlayer1.doubles_elo_rating || teamBPlayer1.doublesEloRating || 800 },
            player2: { eloRating: teamBPlayer2.doubles_elo_rating || teamBPlayer2.doublesEloRating || 800 }
        };

        const handicapResult = calculateDoublesHandicap(teamA, teamB);

        if (handicapResult && handicapText) {
            // Get first names - handle both formats
            const p1FirstName = teamAPlayer1.first_name || teamAPlayer1.firstName || '';
            const p2FirstName = teamAPlayer2.first_name || teamAPlayer2.firstName || '';
            const p3FirstName = teamBPlayer1.first_name || teamBPlayer1.firstName || '';
            const p4FirstName = teamBPlayer2.first_name || teamBPlayer2.firstName || '';

            const weakerTeamName = handicapResult.team === 'A'
                ? `Team A (${p1FirstName} & ${p2FirstName})`
                : `Team B (${p3FirstName} & ${p4FirstName})`;

            // Store handicap details for later use when saving match
            currentCoachDoublesHandicapDetails = {
                team: handicapResult.team,
                team_name: weakerTeamName,
                points: handicapResult.points,
                average_elo_a: handicapResult.averageEloA,
                average_elo_b: handicapResult.averageEloB
            };

            handicapText.textContent = `${weakerTeamName} startet mit ${handicapResult.points} Punkt${handicapResult.points !== 1 ? 'en' : ''} Vorsprung (Ø ${handicapResult.averageEloA} vs ${handicapResult.averageEloB} Elo)`;
            handicapSuggestion.classList.remove('hidden');
            handicapToggleContainer.classList.remove('hidden');

            // Uncheck toggle by default
            if (handicapToggle) {
                handicapToggle.checked = false;
            }
        } else {
            // No handicap needed
            currentCoachDoublesHandicapDetails = null;
            if (handicapSuggestion) handicapSuggestion.classList.add('hidden');
            if (handicapToggleContainer) handicapToggleContainer.classList.add('hidden');
        }
    }

    // Add event listeners to all dropdowns
    [teamAPlayer1Select, teamAPlayer2Select, teamBPlayer1Select, teamBPlayer2Select].forEach(select => {
        select.addEventListener('change', calculateAndDisplayHandicap);
    });
}
