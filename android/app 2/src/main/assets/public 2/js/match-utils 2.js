/**
 * Match Utilities Module
 * Shared utilities for match set formatting and winner determination
 */

/**
 * Formats match sets for display
 * @param {Array} sets - Array of set objects with playerA and playerB scores
 * @param {Object} options - Formatting options
 * @param {string} options.playerAKey - Key for player A score (default: 'playerA')
 * @param {string} options.playerBKey - Key for player B score (default: 'playerB')
 * @param {boolean} options.showRatio - Whether to show win ratio (default: true)
 * @param {string} options.noResultText - Text to show when no result (default: 'Kein Ergebnis')
 * @returns {string} Formatted set string (e.g., "2:1 (11:9, 9:11, 11:7)")
 */
export function formatMatchSets(sets, options = {}) {
    const {
        playerAKey = 'playerA',
        playerBKey = 'playerB',
        showRatio = true,
        noResultText = 'Kein Ergebnis',
    } = options;

    if (!sets || sets.length === 0) {
        return noResultText;
    }

    const setsStr = sets.map(s => `${s[playerAKey]}:${s[playerBKey]}`).join(', ');

    if (showRatio) {
        const winsA = sets.filter(s => s[playerAKey] > s[playerBKey] && s[playerAKey] >= 11).length;
        const winsB = sets.filter(s => s[playerBKey] > s[playerAKey] && s[playerBKey] >= 11).length;
        return `${winsA}:${winsB} (${setsStr})`;
    }

    return setsStr;
}

/**
 * Formats doubles match sets for display
 * @param {Array} sets - Array of set objects with teamA and teamB scores
 * @returns {string} Formatted set string
 */
export function formatDoublesSets(sets) {
    return formatMatchSets(sets, {
        playerAKey: 'teamA',
        playerBKey: 'teamB',
    });
}

/**
 * Determines the winner of a match based on sets won
 * @param {Array} sets - Array of set objects
 * @param {string} matchMode - Match mode ('single-set', 'best-of-3', 'best-of-5', 'best-of-7')
 * @param {string} playerAKey - Key for player A score (default: 'playerA')
 * @param {string} playerBKey - Key for player B score (default: 'playerB')
 * @returns {string|null} 'A' if player A wins, 'B' if player B wins, null if no winner yet
 */
export function determineWinner(
    sets,
    matchMode = 'best-of-5',
    playerAKey = 'playerA',
    playerBKey = 'playerB'
) {
    if (!sets || sets.length === 0) {
        return null;
    }

    const setsToWin =
        {
            'single-set': 1,
            'best-of-3': 2,
            'best-of-5': 3,
            'best-of-7': 4,
        }[matchMode] || 3;

    const winsA = sets.filter(s => s[playerAKey] > s[playerBKey] && s[playerAKey] >= 11).length;
    const winsB = sets.filter(s => s[playerBKey] > s[playerAKey] && s[playerBKey] >= 11).length;

    if (winsA >= setsToWin) return 'A';
    if (winsB >= setsToWin) return 'B';
    return null;
}

/**
 * Gets the display name of the winner
 * @param {Array} sets - Array of set objects
 * @param {Object} playerA - Player A object with firstName property
 * @param {Object} playerB - Player B object with firstName property
 * @param {string} matchMode - Match mode (default: 'best-of-5')
 * @returns {string} Winner's name or 'Unentschieden'
 */
export function getWinnerDisplay(sets, playerA, playerB, matchMode = 'best-of-5') {
    const winner = determineWinner(sets, matchMode);

    if (winner === 'A') {
        return playerA?.firstName || 'Spieler A';
    }
    if (winner === 'B') {
        return playerB?.firstName || 'Spieler B';
    }

    return 'Unentschieden';
}

/**
 * Formats a simple set display without ratio (just scores)
 * @param {Array} sets - Array of set objects
 * @returns {string} Formatted set string (e.g., "11:9, 9:11, 11:7")
 */
export function formatSetsSimple(sets) {
    return formatMatchSets(sets, { showRatio: false });
}

/**
 * Gets winner name for doubles match
 * @param {Object} match - Match object with teamAPlayer1, teamAPlayer2, teamBPlayer1, teamBPlayer2
 * @param {string} winningTeam - 'A' or 'B'
 * @returns {string} Team names concatenated with &
 */
export function getDoublesTeamName(match, winningTeam) {
    if (winningTeam === 'A') {
        const p1 = match.teamAPlayer1?.firstName || 'Spieler 1';
        const p2 = match.teamAPlayer2?.firstName || 'Spieler 2';
        return `${p1} & ${p2}`;
    } else {
        const p1 = match.teamBPlayer1?.firstName || 'Spieler 3';
        const p2 = match.teamBPlayer2?.firstName || 'Spieler 4';
        return `${p1} & ${p2}`;
    }
}
