/**
 * Tournament Logic - Pure Functions
 * Extracted from tournaments-supabase.js for testability
 *
 * Contains all pure tournament logic without Supabase dependencies:
 * - Seed order generation
 * - Round-robin pairing generation
 * - Double elimination bracket structure
 * - WB→LB round mapping
 * - Cross-over position calculation
 */

/**
 * Generate standard seeding order for bracket
 * Returns array of seeds in bracket order (e.g., for 8: [1,8,4,5,2,7,3,6])
 * This ensures the top seeds are spread across the bracket and would meet latest.
 */
export function generateSeedOrder(bracketSize) {
    if (bracketSize === 2) return [1, 2];
    if (bracketSize === 4) return [1, 4, 2, 3];
    if (bracketSize === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
    if (bracketSize === 16) return [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];
    // Fallback for other sizes
    const order = [];
    for (let i = 1; i <= bracketSize; i++) order.push(i);
    return order;
}

/**
 * Generate round-robin pairings using the circle method rotation.
 *
 * @param {number} playerCount - Number of players (minimum 2)
 * @returns {{ rounds: Array<Array<{a: number, b: number, isBye: boolean}>>, totalMatches: number, totalRounds: number }}
 *   - a/b are 0-based player indices, isBye indicates a bye match (b === null)
 */
export function generateRoundRobinPairings(playerCount) {
    const n = playerCount;
    if (n < 2) throw new Error('Mindestens 2 Teilnehmer erforderlich');

    const hasOddPlayers = n % 2 === 1;
    const totalPlayers = hasOddPlayers ? n + 1 : n;
    const numRounds = totalPlayers - 1;

    const positions = [];
    for (let i = 0; i < n; i++) positions.push(i);
    if (hasOddPlayers) positions.push(null); // ghost player for bye

    const rounds = [];
    let totalMatches = 0;

    for (let round = 0; round < numRounds; round++) {
        const halfSize = totalPlayers / 2;
        const roundMatches = [];

        for (let i = 0; i < halfSize; i++) {
            const player1 = positions[i];
            const player2 = positions[totalPlayers - 1 - i];

            if (player1 !== null && player2 !== null) {
                roundMatches.push({ a: player1, b: player2, isBye: false });
                totalMatches++;
            } else {
                // Bye: one player has no opponent
                const playerWithBye = player1 !== null ? player1 : player2;
                if (playerWithBye !== null) {
                    roundMatches.push({ a: playerWithBye, b: null, isBye: true });
                    totalMatches++;
                }
            }
        }

        rounds.push(roundMatches);

        // Circle method rotation: fix position 0, rotate others
        if (round < numRounds - 1) {
            const last = positions[positions.length - 1];
            for (let j = positions.length - 1; j > 1; j--) {
                positions[j] = positions[j - 1];
            }
            positions[1] = last;
        }
    }

    return { rounds, totalMatches, totalRounds: numRounds };
}

/**
 * Generate double elimination bracket structure.
 * Always uses bracketSize=16 (starts at Achtelfinale).
 *
 * @param {number} playerCount - Number of players (2-16)
 * @returns {{
 *   matches: Array<{round: number, position: number, bracketType: string, playerA: number|null, playerB: number|null, status: string, winnerId: number|null}>,
 *   bracketSize: number,
 *   winnersRounds: number,
 *   losersRounds: number,
 *   wbMatchCount: number,
 *   lbMatchCount: number,
 *   totalMatchCount: number
 * }}
 *   playerA/playerB are 0-based player indices or null (bye/empty)
 */
export function generateDoubleEliminationStructure(playerCount) {
    const n = playerCount;
    if (n < 2) throw new Error('Mindestens 2 Teilnehmer erforderlich');
    if (n > 16) throw new Error('Double Elimination unterstützt maximal 16 Spieler');

    const bracketSize = 16;
    const seedOrder = generateSeedOrder(bracketSize);
    const winnersRounds = Math.log2(bracketSize); // 4 for size 16
    const losersRounds = 2 * (winnersRounds - 1); // 6 for size 16

    const matches = [];
    let wbMatchCount = 0;
    let lbMatchCount = 0;

    // ============ WINNERS BRACKET ============
    for (let round = 1; round <= winnersRounds; round++) {
        const matchesInRound = bracketSize / Math.pow(2, round);
        for (let pos = 1; pos <= matchesInRound; pos++) {
            let playerA = null;
            let playerB = null;

            if (round === 1) {
                const idx = (pos - 1) * 2;
                const seed1 = seedOrder[idx];
                const seed2 = seedOrder[idx + 1];
                playerA = seed1 <= n ? seed1 - 1 : null; // 0-based index
                playerB = seed2 <= n ? seed2 - 1 : null;
            }

            const isDoubleBye = round === 1 && playerA === null && playerB === null;
            const isBye = round === 1 && (playerA === null || playerB === null);

            matches.push({
                round,
                position: pos,
                bracketType: 'winners',
                playerA,
                playerB,
                status: isDoubleBye ? 'skipped' : (isBye ? 'completed' : 'pending'),
                winnerId: isDoubleBye ? null : (isBye ? (playerA !== null ? playerA : playerB) : null)
            });
            wbMatchCount++;
        }
    }

    // ============ LOSERS BRACKET ============
    for (let round = 1; round <= losersRounds; round++) {
        const matchesInRound = Math.max(1, bracketSize / Math.pow(2, Math.floor((round + 3) / 2)));
        for (let pos = 1; pos <= matchesInRound; pos++) {
            matches.push({
                round,
                position: pos,
                bracketType: 'losers',
                playerA: null,
                playerB: null,
                status: 'pending',
                winnerId: null
            });
            lbMatchCount++;
        }
    }

    // ============ FINALS ============
    matches.push({
        round: 1,
        position: 1,
        bracketType: 'finals',
        playerA: null,
        playerB: null,
        status: 'pending',
        winnerId: null
    });

    // Grand Finals Reset
    matches.push({
        round: 2,
        position: 1,
        bracketType: 'grand_finals',
        playerA: null,
        playerB: null,
        status: 'pending',
        winnerId: null
    });

    const totalMatchCount = wbMatchCount + lbMatchCount + 2; // +2 for finals + grand finals

    return {
        matches,
        bracketSize,
        winnersRounds,
        losersRounds,
        wbMatchCount,
        lbMatchCount,
        totalMatchCount
    };
}

/**
 * Calculate LB matches per round for a given bracket size.
 * Formula: max(1, bracketSize / 2^(floor((round+3)/2)))
 */
export function calculateLbMatchesPerRound(bracketSize, round) {
    return Math.max(1, bracketSize / Math.pow(2, Math.floor((round + 3) / 2)));
}

/**
 * Map WB round to LB target round for losers dropping down.
 * WB R1 → LB R1, WB Rn → LB R(2n-2) for n>1
 */
export function wbToLbRoundMapping(wbRound) {
    if (wbRound === 1) return 1;
    return 2 * (wbRound - 1);
}

/**
 * Calculate cross-over position when dropping to LB.
 * Prevents rematches by sending upper-half WB losers to lower-half LB and vice versa.
 *
 * @param {number} wbPosition - Position in WB (1-based)
 * @param {number} wbRound - WB round number
 * @param {number} numLbMatches - Number of matches in target LB round
 * @returns {{ targetPosition: number, slot: 'a'|'b' }}
 */
export function calculateCrossOverPosition(wbPosition, wbRound, numLbMatches) {
    if (wbRound === 1) {
        const matchesInWbR1 = numLbMatches * 2;
        const halfWbMatches = matchesInWbR1 / 2;
        const isUpperHalf = wbPosition <= halfWbMatches;

        let targetPosition;
        if (isUpperHalf) {
            targetPosition = wbPosition;
        } else {
            targetPosition = matchesInWbR1 - wbPosition + 1;
        }

        return { targetPosition, slot: isUpperHalf ? 'a' : 'b' };
    } else {
        // WB R2+
        const matchesInThisWbRound = numLbMatches;
        const halfMatches = Math.ceil(matchesInThisWbRound / 2);

        let targetPosition;
        if (matchesInThisWbRound === 1) {
            targetPosition = 1;
        } else if (wbPosition <= halfMatches) {
            targetPosition = numLbMatches - wbPosition + 1;
        } else {
            targetPosition = matchesInThisWbRound - wbPosition + 1;
        }

        return { targetPosition, slot: 'b' };
    }
}

/**
 * Simulate WB R1 bye processing and return which players advance and where losers go.
 * This is a pure simulation of processDoubleEliminationByes for R1.
 *
 * @param {number} playerCount - Number of actual players
 * @returns {{
 *   wbR1Results: Array<{pos: number, playerA: number|null, playerB: number|null, winnerId: number|null, status: string}>,
 *   wbR2Slots: Array<{pos: number, playerA: number|null, playerB: number|null}>,
 *   lbR1Slots: Array<{pos: number, playerA: number|null, playerB: number|null}>
 * }}
 */
export function simulateWbR1Byes(playerCount) {
    const bracketSize = 16;
    const seedOrder = generateSeedOrder(bracketSize);
    const n = playerCount;

    const wbR1Results = [];
    const wbR2Slots = Array.from({ length: 4 }, (_, i) => ({ pos: i + 1, playerA: null, playerB: null }));

    for (let pos = 1; pos <= 8; pos++) {
        const idx = (pos - 1) * 2;
        const seed1 = seedOrder[idx];
        const seed2 = seedOrder[idx + 1];
        const playerA = seed1 <= n ? seed1 - 1 : null;
        const playerB = seed2 <= n ? seed2 - 1 : null;

        const isDoubleBye = playerA === null && playerB === null;
        const isBye = playerA === null || playerB === null;

        let winnerId = null;
        let status = 'pending';

        if (isDoubleBye) {
            status = 'skipped';
        } else if (isBye) {
            winnerId = playerA !== null ? playerA : playerB;
            status = 'completed';
        }

        wbR1Results.push({ pos, playerA, playerB, winnerId, status });

        // Advance winner to WB R2
        if (winnerId !== null) {
            const nextPos = Math.ceil(pos / 2);
            const isSlotA = pos % 2 === 1;
            if (isSlotA) {
                wbR2Slots[nextPos - 1].playerA = winnerId;
            } else {
                wbR2Slots[nextPos - 1].playerB = winnerId;
            }
        }
    }

    // LB R1 has 4 matches
    const lbR1Slots = Array.from({ length: 4 }, (_, i) => ({ pos: i + 1, playerA: null, playerB: null }));

    // Note: Only real matches (both players present) produce losers that drop to LB
    // Bye matches do NOT produce losers (the non-existent player doesn't drop)

    return { wbR1Results, wbR2Slots, lbR1Slots };
}

/**
 * Calculate WB advancement position.
 * From WB round R, position P → next round R+1, position ceil(P/2), slot A if P is odd, B if even
 */
export function calculateWbAdvancement(position) {
    return {
        nextPosition: Math.ceil(position / 2),
        slot: position % 2 === 1 ? 'a' : 'b'
    };
}

/**
 * Calculate LB advancement position.
 * In LB: even rounds halve positions, odd rounds keep same number.
 */
export function calculateLbAdvancement(position, currentRound) {
    if (currentRound % 2 === 0) {
        // Even round → next is odd, positions halve
        return { nextPosition: Math.ceil(position / 2) };
    } else {
        // Odd round → next is even, same number of positions
        return { nextPosition: position };
    }
}

/**
 * Get all unique player pairings from round-robin.
 * Returns a set of sorted [a,b] pairs as strings for easy checking.
 */
export function getRoundRobinPairings(rounds) {
    const pairings = new Set();
    for (const round of rounds) {
        for (const match of round) {
            if (!match.isBye) {
                const pair = [match.a, match.b].sort((x, y) => x - y).join('-');
                pairings.add(pair);
            }
        }
    }
    return pairings;
}

/**
 * Check if every player plays every other player exactly once in round-robin.
 */
export function validateRoundRobinCompleteness(playerCount, rounds) {
    const expectedPairings = (playerCount * (playerCount - 1)) / 2;
    const pairings = getRoundRobinPairings(rounds);

    if (pairings.size !== expectedPairings) {
        return { valid: false, reason: `Expected ${expectedPairings} unique pairings, got ${pairings.size}` };
    }

    // Check that each player appears exactly once per round (or has a bye)
    for (let roundIdx = 0; roundIdx < rounds.length; roundIdx++) {
        const playerAppearances = {};
        for (const match of rounds[roundIdx]) {
            if (match.a !== null) {
                playerAppearances[match.a] = (playerAppearances[match.a] || 0) + 1;
            }
            if (match.b !== null) {
                playerAppearances[match.b] = (playerAppearances[match.b] || 0) + 1;
            }
        }
        for (const [player, count] of Object.entries(playerAppearances)) {
            if (count > 1) {
                return { valid: false, reason: `Player ${player} appears ${count} times in round ${roundIdx + 1}` };
            }
        }
    }

    return { valid: true };
}

/**
 * Simulate a full round-robin tournament with deterministic results.
 * Higher-indexed player wins (simple deterministic rule).
 *
 * @param {number} playerCount
 * @returns {{ standings: Array<{player: number, wins: number, losses: number, setsWon: number, setsLost: number, points: number}> }}
 */
export function simulateRoundRobin(playerCount) {
    const { rounds } = generateRoundRobinPairings(playerCount);
    const stats = {};
    for (let i = 0; i < playerCount; i++) {
        stats[i] = { player: i, wins: 0, losses: 0, setsWon: 0, setsLost: 0, points: 0 };
    }

    for (const round of rounds) {
        for (const match of round) {
            if (match.isBye) continue;

            // Deterministic: higher seed (lower index = better) wins
            // Player 0 beats everyone, player 1 beats everyone except 0, etc.
            const winner = match.a < match.b ? match.a : match.b;
            const loser = winner === match.a ? match.b : match.a;

            stats[winner].wins++;
            stats[winner].setsWon += 3;
            stats[winner].setsLost += 1;
            stats[winner].points += 2;

            stats[loser].losses++;
            stats[loser].setsWon += 1;
            stats[loser].setsLost += 3;
        }
    }

    // Sort by points desc, then sets difference desc
    const standings = Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const aDiff = a.setsWon - a.setsLost;
        const bDiff = b.setsWon - b.setsLost;
        if (bDiff !== aDiff) return bDiff - aDiff;
        return b.setsWon - a.setsWon;
    });

    // Assign ranks
    standings.forEach((s, i) => { s.rank = i + 1; });

    return { standings };
}

/**
 * Validate double elimination bracket structure.
 * Checks match counts, round structure, and bracket integrity.
 */
export function validateDoubleEliminationStructure(structure) {
    const errors = [];
    const { matches, bracketSize, winnersRounds, losersRounds } = structure;

    // Check WB matches count
    const wbMatches = matches.filter(m => m.bracketType === 'winners');
    let expectedWbMatches = 0;
    for (let r = 1; r <= winnersRounds; r++) {
        expectedWbMatches += bracketSize / Math.pow(2, r);
    }
    if (wbMatches.length !== expectedWbMatches) {
        errors.push(`WB: expected ${expectedWbMatches} matches, got ${wbMatches.length}`);
    }

    // Check LB matches count
    const lbMatches = matches.filter(m => m.bracketType === 'losers');
    let expectedLbMatches = 0;
    for (let r = 1; r <= losersRounds; r++) {
        expectedLbMatches += calculateLbMatchesPerRound(bracketSize, r);
    }
    if (lbMatches.length !== expectedLbMatches) {
        errors.push(`LB: expected ${expectedLbMatches} matches, got ${lbMatches.length}`);
    }

    // Check finals
    const finals = matches.filter(m => m.bracketType === 'finals');
    if (finals.length !== 1) {
        errors.push(`Finals: expected 1, got ${finals.length}`);
    }

    const grandFinals = matches.filter(m => m.bracketType === 'grand_finals');
    if (grandFinals.length !== 1) {
        errors.push(`Grand Finals: expected 1, got ${grandFinals.length}`);
    }

    return { valid: errors.length === 0, errors };
}
