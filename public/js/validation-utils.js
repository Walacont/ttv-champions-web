/**
 * Validation Utilities
 * Pure functions for validating match data (no Firebase dependencies)
 * Extracted from player-matches.js and matches.js for testing
 */

// ========================================================================
// ===== SET SCORE VALIDATION =====
// ========================================================================

/**
 * Validates a set score according to official table tennis rules
 * @param {number} scoreA - Score for player A
 * @param {number} scoreB - Score for player B
 * @returns {boolean} True if the set is valid
 */
export function isValidSet(scoreA, scoreB) {
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

/**
 * Determines the winner of a set
 * @param {number} scoreA - Score for player A
 * @param {number} scoreB - Score for player B
 * @returns {'A'|'B'|null} Winner of the set, or null if invalid
 */
export function getSetWinner(scoreA, scoreB) {
    if (!isValidSet(scoreA, scoreB)) return null;

    const a = parseInt(scoreA) || 0;
    const b = parseInt(scoreB) || 0;

    if (a > b) return 'A';
    if (b > a) return 'B';
    return null;
}

/**
 * Validates an entire match (all sets)
 * @param {Array<{playerA: number, playerB: number}>} sets - Array of set scores
 * @returns {{valid: boolean, error?: string, winner?: 'A'|'B'}} Validation result
 */
export function validateMatch(sets) {
    const minSets = 3;

    if (!sets || sets.length < minSets) {
        return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
    }

    // Validate each set according to official table tennis rules
    for (let i = 0; i < sets.length; i++) {
        const set = sets[i];
        const scoreA = parseInt(set.playerA) || 0;
        const scoreB = parseInt(set.playerB) || 0;

        if (!isValidSet(scoreA, scoreB)) {
            // Provide specific error message based on the issue
            if (scoreA < 11 && scoreB < 11) {
                return {
                    valid: false,
                    error: `Satz ${i + 1}: Mindestens eine Seite muss 11 Punkte haben.`,
                };
            }
            if (scoreA === scoreB) {
                return { valid: false, error: `Satz ${i + 1}: Unentschieden ist nicht erlaubt.` };
            }
            if (scoreA >= 10 && scoreB >= 10 && Math.abs(scoreA - scoreB) !== 2) {
                return {
                    valid: false,
                    error: `Satz ${i + 1}: Ab 10:10 muss eine Seite 2 Punkte Vorsprung haben (z.B. 12:10, 14:12).`,
                };
            }
            return {
                valid: false,
                error: `Satz ${i + 1}: Ungültiges Satzergebnis (${scoreA}:${scoreB}).`,
            };
        }
    }

    // Calculate wins
    let playerAWins = 0;
    let playerBWins = 0;

    sets.forEach(set => {
        const winner = getSetWinner(set.playerA, set.playerB);
        if (winner === 'A') playerAWins++;
        if (winner === 'B') playerBWins++;
    });

    // Check if someone won (3 sets)
    if (playerAWins < 3 && playerBWins < 3) {
        return { valid: false, error: 'Ein Spieler muss 3 Sätze gewinnen.' };
    }

    // Determine winner
    const winner = playerAWins >= 3 ? 'A' : 'B';

    return { valid: true, winner };
}

// ========================================================================
// ===== HANDICAP CALCULATION =====
// ========================================================================

/**
 * Calculates handicap points based on Elo difference
 * @param {Object} playerA - Player A object with eloRating
 * @param {Object} playerB - Player B object with eloRating
 * @returns {{player: Object, points: number}|null} Handicap info or null if no handicap
 */
export function calculateHandicap(playerA, playerB) {
    const eloA = playerA.eloRating || 0;
    const eloB = playerB.eloRating || 0;
    const eloDiff = Math.abs(eloA - eloB);

    if (eloDiff < 25) {
        return null;
    }

    let handicapPoints = Math.round(eloDiff / 50);

    if (handicapPoints > 10) {
        handicapPoints = 10;
    }

    if (handicapPoints < 1) {
        return null;
    }

    const weakerPlayer = eloA < eloB ? playerA : playerB;
    return {
        player: weakerPlayer,
        points: handicapPoints,
    };
}

/**
 * Calculates handicap points for doubles based on average team Elo
 * @param {Object} teamA - Team A with player1 and player2 (both have eloRating)
 * @param {Object} teamB - Team B with player1 and player2 (both have eloRating)
 * @returns {{team: 'A'|'B', averageEloA: number, averageEloB: number, points: number}|null} Handicap info or null
 */
export function calculateDoublesHandicap(teamA, teamB) {
    // Calculate average Elo for each team
    const eloA1 = teamA.player1?.eloRating || 0;
    const eloA2 = teamA.player2?.eloRating || 0;
    const eloB1 = teamB.player1?.eloRating || 0;
    const eloB2 = teamB.player2?.eloRating || 0;

    const averageEloA = (eloA1 + eloA2) / 2;
    const averageEloB = (eloB1 + eloB2) / 2;

    const eloDiff = Math.abs(averageEloA - averageEloB);

    if (eloDiff < 25) {
        return null;
    }

    let handicapPoints = Math.round(eloDiff / 50);

    if (handicapPoints > 10) {
        handicapPoints = 10;
    }

    if (handicapPoints < 1) {
        return null;
    }

    const weakerTeam = averageEloA < averageEloB ? 'A' : 'B';
    return {
        team: weakerTeam,
        averageEloA: Math.round(averageEloA),
        averageEloB: Math.round(averageEloB),
        points: handicapPoints,
    };
}
