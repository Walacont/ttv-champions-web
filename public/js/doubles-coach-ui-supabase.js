import { saveDoublesMatch } from './doubles-matches-supabase.js';
import { createSetScoreInput, createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';
import { getSportContext } from './sport-context-supabase.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils-supabase.js';
import { calculateDoublesHandicap } from './validation-utils.js';

/**
 * Doppel-Coach UI Modul
 */

let currentMatchType = 'singles';
let doublesSetScoreInput = null;
let currentUserId = null;
let currentCoachDoublesHandicapDetails = null;

// ========================================================================
// ===== HELPER FUNCTIONS =====
// ========================================================================

/**
 * Erstellt sportartspezifisches Score-Input für Doppel-Matches
 * @param {HTMLElement} container - Container-Element
 * @param {Array} sets - Bestehende Sätze
 * @param {string} mode - Match-Modus
 * @returns {Object} Score-Input-Instanz
 */
async function createDoublesScoreInput(container, sets = [], mode = 'best-of-5') {
    if (!currentUserId) {
        // Fallback auf Tischtennis wenn keine User-ID vorhanden
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
        return createSetScoreInput(container, sets, mode || 'best-of-5');
    }
}

// ========================================================================
// ===== INITIALIZATION =====
// ========================================================================

/**
 * Initialisiert die Doppel-Match UI für Trainer
 */
export function initializeDoublesCoachUI() {
    const singlesToggle = document.getElementById('singles-toggle');
    const doublesToggle = document.getElementById('doubles-toggle');

    if (!singlesToggle || !doublesToggle) {
        console.error('Toggle buttons not found');
        return;
    }

    singlesToggle.addEventListener('click', () => switchMatchType('singles'));
    doublesToggle.addEventListener('click', () => switchMatchType('doubles'));

    switchMatchType('singles');
}

/**
 * Wechselt zwischen Einzel- und Doppel-Match-Typ
 * @param {string} type - 'singles' oder 'doubles'
 */
function switchMatchType(type) {
    currentMatchType = type;

    const singlesToggle = document.getElementById('singles-toggle');
    const doublesToggle = document.getElementById('doubles-toggle');
    const singlesContainer = document.getElementById('singles-players-container');
    const doublesContainer = document.getElementById('doubles-players-container');

    if (type === 'singles') {
        singlesToggle.classList.add('active', 'bg-indigo-600', 'text-white');
        singlesToggle.classList.remove('text-gray-700');
        doublesToggle.classList.remove('active', 'bg-indigo-600', 'text-white');
        doublesToggle.classList.add('text-gray-700');

        singlesContainer.classList.remove('hidden');
        doublesContainer.classList.add('hidden');

        clearDoublesSelections();
    } else {
        doublesToggle.classList.add('active', 'bg-indigo-600', 'text-white');
        doublesToggle.classList.remove('text-gray-700');
        singlesToggle.classList.remove('active', 'bg-indigo-600', 'text-white');
        singlesToggle.classList.add('text-gray-700');

        doublesContainer.classList.remove('hidden');
        singlesContainer.classList.add('hidden');

        clearSinglesSelections();

        // Handicap-Vorschlag beim Wechsel zu Doppel verbergen
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
 * Löscht Einzel-Spielerauswahl
 */
function clearSinglesSelections() {
    const playerASelect = document.getElementById('player-a-select');
    const playerBSelect = document.getElementById('player-b-select');

    if (playerASelect) playerASelect.value = '';
    if (playerBSelect) playerBSelect.value = '';
}

/**
 * Löscht Doppel-Spielerauswahl
 */
function clearDoublesSelections() {
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
 * Befüllt alle Doppel-Dropdowns mit spielbereiten Spielern
 * @param {Array} clubPlayers - Vereinsspieler
 * @param {string} currentSubgroupFilter - Aktueller Untergruppen-Filter
 * @param {string} excludePlayerId - Auszuschließende Spieler-ID (z.B. Trainer)
 * @param {string} currentGenderFilter - Aktueller Geschlechter-Filter
 */
export function populateDoublesDropdowns(clubPlayers, currentSubgroupFilter = 'all', excludePlayerId = null, currentGenderFilter = 'all') {
    // Nur spielbereite Spieler filtern
    let matchReadyPlayers = clubPlayers.filter(p => {
        const isMatchReady = p.isMatchReady === true || p.is_match_ready === true;
        return isMatchReady;
    });

    console.log('[Doubles] populateDoublesDropdowns:', {
        totalPlayers: clubPlayers.length,
        matchReadyBefore: matchReadyPlayers.length,
        subgroupFilter: currentSubgroupFilter,
        genderFilter: currentGenderFilter,
        excludePlayerId
    });

    if (currentSubgroupFilter !== 'all') {
        if (isAgeGroupFilter(currentSubgroupFilter)) {
            console.log('[Doubles] Filtering by age group:', currentSubgroupFilter);
            matchReadyPlayers = filterPlayersByAgeGroup(matchReadyPlayers, currentSubgroupFilter);
            console.log('[Doubles] After age filter:', matchReadyPlayers.length);
        } else if (!isGenderFilter(currentSubgroupFilter)) {
            console.log('[Doubles] Filtering by custom subgroup:', currentSubgroupFilter);
            matchReadyPlayers = matchReadyPlayers.filter(
                player => player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
            );
            console.log('[Doubles] After custom subgroup filter:', matchReadyPlayers.length);
        }
    }

    // Geschlechter-Filter separat anwenden (kann mit Alters-/Untergruppen-Filter kombiniert werden)
    if (currentGenderFilter && currentGenderFilter !== 'all' && currentGenderFilter !== 'gender_all') {
        console.log('[Doubles] Filtering by gender:', currentGenderFilter);
        matchReadyPlayers = filterPlayersByGender(matchReadyPlayers, currentGenderFilter);
        console.log('[Doubles] After gender filter:', matchReadyPlayers.length);
    }

    if (excludePlayerId) {
        matchReadyPlayers = matchReadyPlayers.filter(p => p.id !== excludePlayerId);
        console.log('[Doubles] After excluding player:', matchReadyPlayers.length);
    }

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
 * Verarbeitet die Formularabsendung für Doppel-Matches
 * @param {Event} e - Form-Submit-Event
 * @param {Object} supabase - Supabase-Client
 * @param {Object} currentUserData - Aktuelle Benutzerdaten
 */
export async function handleDoublesMatchSave(e, supabase, currentUserData) {
    e.preventDefault();

    const feedbackEl = document.getElementById('match-feedback');

    const teamAPlayer1Id = document.getElementById('doubles-team-a-player1-select').value;
    const teamAPlayer2Id = document.getElementById('doubles-team-a-player2-select').value;
    const teamBPlayer1Id = document.getElementById('doubles-team-b-player1-select').value;
    const teamBPlayer2Id = document.getElementById('doubles-team-b-player2-select').value;

    if (!teamAPlayer1Id || !teamAPlayer2Id || !teamBPlayer1Id || !teamBPlayer2Id) {
        feedbackEl.textContent = 'Bitte alle 4 Spieler auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const allPlayerIds = [teamAPlayer1Id, teamAPlayer2Id, teamBPlayer1Id, teamBPlayer2Id];
    if (new Set(allPlayerIds).size !== 4) {
        feedbackEl.textContent = 'Alle 4 Spieler müssen unterschiedlich sein!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

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

    // Feld-Namen von playerA/playerB zu teamA/teamB für Doppel konvertieren
    const doublesSets = sets.map(set => ({
        teamA: set.playerA,
        teamB: set.playerB,
    }));

    const handicapUsed = document.getElementById('handicap-toggle')?.checked || false;

    const matchModeSelect = document.getElementById('coach-match-mode-select');
    const matchMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';

    feedbackEl.textContent = 'Speichere Doppel-Match...';
    feedbackEl.className = 'mt-3 text-sm font-medium text-center text-gray-600';

    try {
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

            e.target.reset();

            const matchModeSelect = document.getElementById('coach-match-mode-select');
            const setScoreLabel = document.getElementById('coach-set-score-label');
            const container = document.getElementById('coach-set-score-container');

            if (matchModeSelect) {
                matchModeSelect.value = 'best-of-5';
            }

            if (container) {
                doublesSetScoreInput = await createDoublesScoreInput(container, [], 'best-of-5');
                if (setScoreLabel) {
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
 * Gibt den aktuellen Match-Typ zurück
 * @returns {string} 'singles' oder 'doubles'
 */
export function getCurrentMatchType() {
    return currentMatchType;
}

/**
 * Setzt die aktuelle User-ID für den Sportart-Kontext
 * @param {string} userId - User-ID
 */
export function setDoublesUserId(userId) {
    currentUserId = userId;
}

/**
 * Setzt die Doppel-Set-Score-Input-Instanz
 * @param {Object} inputInstance - Set-Score-Input-Instanz
 */
export function setDoublesSetScoreInput(inputInstance) {
    doublesSetScoreInput = inputInstance;
}

// Funktionen global verfügbar machen
window.setDoublesSetScoreInput = setDoublesSetScoreInput;
window.setDoublesUserId = setDoublesUserId;

// ========================================================================
// ===== HANDICAP SETUP =====
// ========================================================================

/**
 * Richtet Handicap-Berechnung für Doppel-Matches ein
 * @param {Array} clubPlayers - Vereinsspieler für Lookup
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

    const playersMap = new Map();
    clubPlayers.forEach(player => {
        playersMap.set(player.id, player);
    });

    function calculateAndDisplayHandicap() {
        const teamAPlayer1Id = teamAPlayer1Select.value;
        const teamAPlayer2Id = teamAPlayer2Select.value;
        const teamBPlayer1Id = teamBPlayer1Select.value;
        const teamBPlayer2Id = teamBPlayer2Select.value;

        if (!teamAPlayer1Id || !teamAPlayer2Id || !teamBPlayer1Id || !teamBPlayer2Id) {
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

        // Doppel-Elo verwenden - sowohl snake_case als auch camelCase unterstützen
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
            const p1FirstName = teamAPlayer1.first_name || teamAPlayer1.firstName || '';
            const p2FirstName = teamAPlayer2.first_name || teamAPlayer2.firstName || '';
            const p3FirstName = teamBPlayer1.first_name || teamBPlayer1.firstName || '';
            const p4FirstName = teamBPlayer2.first_name || teamBPlayer2.firstName || '';

            const weakerTeamName = handicapResult.team === 'A'
                ? `Team A (${p1FirstName} & ${p2FirstName})`
                : `Team B (${p3FirstName} & ${p4FirstName})`;

            // Handicap-Details für spätere Verwendung beim Speichern speichern
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

            if (handicapToggle) {
                handicapToggle.checked = false;
            }
        } else {
            currentCoachDoublesHandicapDetails = null;
            if (handicapSuggestion) handicapSuggestion.classList.add('hidden');
            if (handicapToggleContainer) handicapToggleContainer.classList.add('hidden');
        }
    }

    [teamAPlayer1Select, teamAPlayer2Select, teamBPlayer1Select, teamBPlayer2Select].forEach(select => {
        select.addEventListener('change', calculateAndDisplayHandicap);
    });
}
