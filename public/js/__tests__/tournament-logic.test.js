/**
 * Turnier-Logik Tests
 *
 * Umfassende Tests für:
 * - Jeder gegen Jeden (Round Robin) mit 3-16 Teilnehmern
 * - Doppel-K.O. (Double Elimination) mit 3-16 Teilnehmern
 * - Seed-Reihenfolge
 * - WB→LB Mapping
 * - Cross-Over Logik
 * - Platzierungen / Rankings
 */

import { describe, test, expect } from 'vitest';
import {
    generateSeedOrder,
    generateRoundRobinPairings,
    generateDoubleEliminationStructure,
    calculateLbMatchesPerRound,
    wbToLbRoundMapping,
    calculateCrossOverPosition,
    simulateWbR1Byes,
    calculateWbAdvancement,
    calculateLbAdvancement,
    getRoundRobinPairings,
    validateRoundRobinCompleteness,
    simulateRoundRobin,
    validateDoubleEliminationStructure,
} from '../utils/tournament-logic.js';

// ============================================================
// SEED ORDER
// ============================================================
describe('generateSeedOrder()', () => {
    test('Bracket Größe 2', () => {
        expect(generateSeedOrder(2)).toEqual([1, 2]);
    });

    test('Bracket Größe 4', () => {
        const order = generateSeedOrder(4);
        expect(order).toEqual([1, 4, 2, 3]);
        // Seed 1 vs 4 in erste Hälfte, Seed 2 vs 3 in zweite
    });

    test('Bracket Größe 8', () => {
        const order = generateSeedOrder(8);
        expect(order).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
        // Seed 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6
    });

    test('Bracket Größe 16', () => {
        const order = generateSeedOrder(16);
        expect(order).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
        expect(order).toHaveLength(16);
    });

    test('Seed 1 und 2 sind in verschiedenen Hälften (16er Bracket)', () => {
        const order = generateSeedOrder(16);
        // Seed 1 ist an Position 0 (obere Hälfte), Seed 2 ist an Position 8 (untere Hälfte)
        const pos1 = order.indexOf(1);
        const pos2 = order.indexOf(2);
        expect(pos1).toBeLessThan(8);
        expect(pos2).toBeGreaterThanOrEqual(8);
    });

    test('Alle Seeds sind einzigartig und vollständig', () => {
        for (const size of [2, 4, 8, 16]) {
            const order = generateSeedOrder(size);
            expect(order).toHaveLength(size);
            const sorted = [...order].sort((a, b) => a - b);
            expect(sorted).toEqual(Array.from({ length: size }, (_, i) => i + 1));
        }
    });
});

// ============================================================
// ROUND ROBIN (JEDER GEGEN JEDEN)
// ============================================================
describe('Jeder gegen Jeden (Round Robin)', () => {
    describe('Grundlegende Struktur', () => {
        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: korrekte Rundenanzahl',
            (n) => {
                const result = generateRoundRobinPairings(n);
                const expectedRounds = n % 2 === 0 ? n - 1 : n;
                expect(result.totalRounds).toBe(expectedRounds);
                expect(result.rounds).toHaveLength(expectedRounds);
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: korrekte Gesamtanzahl Matches',
            (n) => {
                const result = generateRoundRobinPairings(n);
                // Real matches (non-bye) should be n*(n-1)/2
                const realMatches = result.rounds.flat().filter(m => !m.isBye).length;
                expect(realMatches).toBe((n * (n - 1)) / 2);
            }
        );

        test('2 Teilnehmer: 1 Runde, 1 Match', () => {
            const result = generateRoundRobinPairings(2);
            expect(result.totalRounds).toBe(1);
            expect(result.rounds[0]).toHaveLength(1);
            expect(result.rounds[0][0].isBye).toBe(false);
        });

        test('weniger als 2 Teilnehmer: Fehler', () => {
            expect(() => generateRoundRobinPairings(1)).toThrow();
            expect(() => generateRoundRobinPairings(0)).toThrow();
        });
    });

    describe('Gerade Teilnehmerzahlen', () => {
        test.each([4, 6, 8, 10, 12, 14, 16])(
            '%i Teilnehmer (gerade): keine Byes',
            (n) => {
                const result = generateRoundRobinPairings(n);
                const byeMatches = result.rounds.flat().filter(m => m.isBye);
                expect(byeMatches).toHaveLength(0);
            }
        );

        test.each([4, 6, 8, 10, 12, 14, 16])(
            '%i Teilnehmer (gerade): jede Runde hat n/2 Matches',
            (n) => {
                const result = generateRoundRobinPairings(n);
                for (const round of result.rounds) {
                    expect(round).toHaveLength(n / 2);
                }
            }
        );
    });

    describe('Ungerade Teilnehmerzahlen', () => {
        test.each([3, 5, 7, 9, 11, 13, 15])(
            '%i Teilnehmer (ungerade): genau n Byes (einer pro Runde)',
            (n) => {
                const result = generateRoundRobinPairings(n);
                const byeMatches = result.rounds.flat().filter(m => m.isBye);
                expect(byeMatches).toHaveLength(n); // n rounds, 1 bye each
            }
        );

        test.each([3, 5, 7, 9, 11, 13, 15])(
            '%i Teilnehmer (ungerade): jeder Spieler hat genau ein Freilos',
            (n) => {
                const result = generateRoundRobinPairings(n);
                const byeCounts = {};
                for (let i = 0; i < n; i++) byeCounts[i] = 0;

                for (const round of result.rounds) {
                    for (const match of round) {
                        if (match.isBye) {
                            byeCounts[match.a]++;
                        }
                    }
                }

                for (let i = 0; i < n; i++) {
                    expect(byeCounts[i]).toBe(1);
                }
            }
        );
    });

    describe('Vollständigkeit', () => {
        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: jeder spielt gegen jeden genau einmal',
            (n) => {
                const result = generateRoundRobinPairings(n);
                const validation = validateRoundRobinCompleteness(n, result.rounds);
                expect(validation.valid).toBe(true);
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: kein Spieler spielt doppelt in einer Runde',
            (n) => {
                const result = generateRoundRobinPairings(n);
                for (let roundIdx = 0; roundIdx < result.rounds.length; roundIdx++) {
                    const seen = new Set();
                    for (const match of result.rounds[roundIdx]) {
                        if (match.a !== null) {
                            expect(seen.has(match.a)).toBe(false);
                            seen.add(match.a);
                        }
                        if (match.b !== null) {
                            expect(seen.has(match.b)).toBe(false);
                            seen.add(match.b);
                        }
                    }
                }
            }
        );
    });

    describe('Platzierungen / Rankings', () => {
        test.each([3, 4, 5, 6, 7, 8])(
            '%i Teilnehmer: Simulation hat korrekte Rankings',
            (n) => {
                const { standings } = simulateRoundRobin(n);

                // Should have exactly n standings
                expect(standings).toHaveLength(n);

                // Ranks should be 1 through n
                const ranks = standings.map(s => s.rank);
                expect(ranks).toEqual(Array.from({ length: n }, (_, i) => i + 1));

                // Player 0 (best seed) should be rank 1 (wins all)
                expect(standings[0].player).toBe(0);
                expect(standings[0].wins).toBe(n - 1);
                expect(standings[0].losses).toBe(0);

                // Last player should have 0 wins
                expect(standings[n - 1].player).toBe(n - 1);
                expect(standings[n - 1].wins).toBe(0);
                expect(standings[n - 1].losses).toBe(n - 1);
            }
        );

        test('3 Teilnehmer: 3 verschiedene Platzierungen', () => {
            const { standings } = simulateRoundRobin(3);
            expect(standings).toHaveLength(3);
            expect(standings[0].rank).toBe(1);
            expect(standings[1].rank).toBe(2);
            expect(standings[2].rank).toBe(3);
        });

        test('16 Teilnehmer: 16 verschiedene Platzierungen', () => {
            const { standings } = simulateRoundRobin(16);
            expect(standings).toHaveLength(16);
            for (let i = 0; i < 16; i++) {
                expect(standings[i].rank).toBe(i + 1);
            }
        });

        test('Punkte-System: 2 Punkte pro Sieg, 0 pro Niederlage', () => {
            const { standings } = simulateRoundRobin(4);
            // Player 0 wins 3 matches → 6 points
            expect(standings[0].points).toBe(6);
            // Player 1 wins 2 matches → 4 points
            expect(standings[1].points).toBe(4);
            // Player 2 wins 1 match → 2 points
            expect(standings[2].points).toBe(2);
            // Player 3 wins 0 matches → 0 points
            expect(standings[3].points).toBe(0);
        });
    });
});

// ============================================================
// DOUBLE ELIMINATION (DOPPEL K.O.)
// ============================================================
describe('Doppel-K.O. (Double Elimination)', () => {
    describe('Grundlegende Bracket-Struktur', () => {
        test('bracketSize ist immer 16', () => {
            for (let n = 3; n <= 16; n++) {
                const structure = generateDoubleEliminationStructure(n);
                expect(structure.bracketSize).toBe(16);
            }
        });

        test('winnersRounds ist 4 (log2(16))', () => {
            const structure = generateDoubleEliminationStructure(8);
            expect(structure.winnersRounds).toBe(4);
        });

        test('losersRounds ist 6 (2*(4-1))', () => {
            const structure = generateDoubleEliminationStructure(8);
            expect(structure.losersRounds).toBe(6);
        });

        test('WB Matches: 8+4+2+1 = 15', () => {
            const structure = generateDoubleEliminationStructure(8);
            expect(structure.wbMatchCount).toBe(15);
        });

        test('Fehler bei weniger als 2 Teilnehmern', () => {
            expect(() => generateDoubleEliminationStructure(1)).toThrow();
            expect(() => generateDoubleEliminationStructure(0)).toThrow();
        });

        test('Fehler bei mehr als 16 Teilnehmern', () => {
            expect(() => generateDoubleEliminationStructure(17)).toThrow();
        });
    });

    describe('Bracket-Struktur Validierung', () => {
        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: Struktur ist valide',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                const validation = validateDoubleEliminationStructure(structure);
                expect(validation.valid).toBe(true);
            }
        );
    });

    describe('Winners Bracket Matches pro Runde', () => {
        test('WB Runde 1: 8 Matches (Achtelfinale)', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            expect(wbR1).toHaveLength(8);
        });

        test('WB Runde 2: 4 Matches (Viertelfinale)', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR2 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 2);
            expect(wbR2).toHaveLength(4);
        });

        test('WB Runde 3: 2 Matches (Halbfinale)', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR3 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 3);
            expect(wbR3).toHaveLength(2);
        });

        test('WB Runde 4: 1 Match (WB Finale)', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR4 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 4);
            expect(wbR4).toHaveLength(1);
        });
    });

    describe('Losers Bracket Matches pro Runde', () => {
        test('LB Matches pro Runde (bracketSize=16)', () => {
            // LB R1: 4, R2: 4, R3: 2, R4: 2, R5: 1, R6: 1
            expect(calculateLbMatchesPerRound(16, 1)).toBe(4);
            expect(calculateLbMatchesPerRound(16, 2)).toBe(4);
            expect(calculateLbMatchesPerRound(16, 3)).toBe(2);
            expect(calculateLbMatchesPerRound(16, 4)).toBe(2);
            expect(calculateLbMatchesPerRound(16, 5)).toBe(1);
            expect(calculateLbMatchesPerRound(16, 6)).toBe(1);
        });

        test('Gesamt LB Matches: 4+4+2+2+1+1 = 14', () => {
            let total = 0;
            for (let r = 1; r <= 6; r++) {
                total += calculateLbMatchesPerRound(16, r);
            }
            expect(total).toBe(14);
        });
    });

    describe('Finals', () => {
        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: genau 1 Finals Match',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                const finals = structure.matches.filter(m => m.bracketType === 'finals');
                expect(finals).toHaveLength(1);
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: genau 1 Grand Finals Match',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                const grandFinals = structure.matches.filter(m => m.bracketType === 'grand_finals');
                expect(grandFinals).toHaveLength(1);
            }
        );

        test('Gesamtanzahl Matches: WB(15) + LB(14) + Finals(1) + Grand Finals(1) = 31', () => {
            const structure = generateDoubleEliminationStructure(16);
            expect(structure.totalMatchCount).toBe(31);
        });
    });

    describe('Byes (Freilose) bei weniger als 16 Teilnehmern', () => {
        test('16 Teilnehmer: keine Byes in WB R1', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const byes = wbR1.filter(m => m.status === 'completed' || m.status === 'skipped');
            expect(byes).toHaveLength(0);
            // All matches should have both players
            for (const match of wbR1) {
                expect(match.playerA).not.toBeNull();
                expect(match.playerB).not.toBeNull();
            }
        });

        test('8 Teilnehmer: alle WB R1 Matches sind Byes (ein Spieler)', () => {
            const structure = generateDoubleEliminationStructure(8);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            // With 8 players in a 16-bracket, every match has one real player and one bye
            // because seeds 9-16 don't exist
            for (const match of wbR1) {
                const hasA = match.playerA !== null;
                const hasB = match.playerB !== null;
                // Each match should have exactly one player (bye)
                expect(hasA !== hasB).toBe(true);
                expect(match.status).toBe('completed');
                expect(match.winnerId).not.toBeNull();
            }
        });

        test('3 Teilnehmer: nur 3 Matches mit einem Spieler, 5 komplett leer', () => {
            const structure = generateDoubleEliminationStructure(3);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const withOnePlayer = wbR1.filter(m => (m.playerA !== null) !== (m.playerB !== null));
            const withBothPlayers = wbR1.filter(m => m.playerA !== null && m.playerB !== null);
            const empty = wbR1.filter(m => m.playerA === null && m.playerB === null);

            expect(withOnePlayer.length).toBe(3); // 3 players each get a bye
            expect(withBothPlayers.length).toBe(0); // no real matches
            expect(empty.length).toBe(5); // 5 empty slots (skipped)
        });

        test('5 Teilnehmer: korrekte Bye-Verteilung', () => {
            const structure = generateDoubleEliminationStructure(5);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const withBothPlayers = wbR1.filter(m => m.playerA !== null && m.playerB !== null);
            const withOnePlayer = wbR1.filter(m => {
                const hasA = m.playerA !== null;
                const hasB = m.playerB !== null;
                return hasA !== hasB;
            });
            const empty = wbR1.filter(m => m.playerA === null && m.playerB === null);

            // 5 players in 16-bracket: seeds 1-5 present, 6-16 absent
            // Seed pairings: (1,16), (8,9), (4,13), (5,12), (2,15), (7,10), (3,14), (6,11)
            // Players: 1,2,3,4,5 present; 6-16 absent
            // Real matches: none where both seeds <= 5 (1v16, 8v9, 4v13, 5v12, 2v15, 7v10, 3v14, 6v11)
            // Actually: 1v16→bye(1), 8v9→empty, 4v13→bye(4), 5v12→bye(5), 2v15→bye(2), 7v10→empty, 3v14→bye(3), 6v11→empty
            expect(withOnePlayer.length).toBe(5);
            expect(withBothPlayers.length).toBe(0);
            expect(empty.length).toBe(3);
        });

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: jeder Spieler erscheint genau einmal in WB R1',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
                const playerSet = new Set();
                for (const match of wbR1) {
                    if (match.playerA !== null) {
                        expect(playerSet.has(match.playerA)).toBe(false);
                        playerSet.add(match.playerA);
                    }
                    if (match.playerB !== null) {
                        expect(playerSet.has(match.playerB)).toBe(false);
                        playerSet.add(match.playerB);
                    }
                }
                expect(playerSet.size).toBe(n);
            }
        );
    });

    describe('Seeding im Bracket', () => {
        test('16 Teilnehmer: Seed 1 vs Seed 16 in WB R1', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            // Position 1 should have seed 1 (index 0) vs seed 16 (index 15)
            const firstMatch = wbR1.find(m => m.position === 1);
            expect(firstMatch.playerA).toBe(0);  // seed 1 = index 0
            expect(firstMatch.playerB).toBe(15); // seed 16 = index 15
        });

        test('16 Teilnehmer: Seed 1 und Seed 2 in verschiedenen Hälften', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);

            let seed1Pos = -1;
            let seed2Pos = -1;
            for (const match of wbR1) {
                if (match.playerA === 0 || match.playerB === 0) seed1Pos = match.position;
                if (match.playerA === 1 || match.playerB === 1) seed2Pos = match.position;
            }

            // Seed 1 should be in positions 1-4, Seed 2 in positions 5-8
            expect(seed1Pos).toBeLessThanOrEqual(4);
            expect(seed2Pos).toBeGreaterThan(4);
        });
    });

    describe('WB→LB Round Mapping', () => {
        test('WB R1 → LB R1', () => {
            expect(wbToLbRoundMapping(1)).toBe(1);
        });

        test('WB R2 → LB R2', () => {
            expect(wbToLbRoundMapping(2)).toBe(2);
        });

        test('WB R3 → LB R4', () => {
            expect(wbToLbRoundMapping(3)).toBe(4);
        });

        test('WB R4 → LB R6', () => {
            expect(wbToLbRoundMapping(4)).toBe(6);
        });
    });

    describe('Cross-Over Logik', () => {
        test('WB R1: obere Hälfte geht in Slot A', () => {
            // 4 LB R1 matches, WB has 8 matches
            const result = calculateCrossOverPosition(1, 1, 4);
            expect(result.slot).toBe('a');
            expect(result.targetPosition).toBe(1);
        });

        test('WB R1: untere Hälfte geht in Slot B (cross-over)', () => {
            // Position 5 (untere Hälfte bei 8 WB matches) → cross-over
            const result = calculateCrossOverPosition(5, 1, 4);
            expect(result.slot).toBe('b');
            expect(result.targetPosition).toBe(4); // 8 - 5 + 1 = 4
        });

        test('WB R1: Position 8 → LB Position 1 Slot B', () => {
            const result = calculateCrossOverPosition(8, 1, 4);
            expect(result.slot).toBe('b');
            expect(result.targetPosition).toBe(1); // 8 - 8 + 1 = 1
        });

        test('WB R2+: Verlierer gehen in Slot B', () => {
            const result = calculateCrossOverPosition(1, 2, 4);
            expect(result.slot).toBe('b');
        });
    });

    describe('WB Advancement', () => {
        test('Position 1 → nächste Position 1, Slot A', () => {
            const adv = calculateWbAdvancement(1);
            expect(adv.nextPosition).toBe(1);
            expect(adv.slot).toBe('a');
        });

        test('Position 2 → nächste Position 1, Slot B', () => {
            const adv = calculateWbAdvancement(2);
            expect(adv.nextPosition).toBe(1);
            expect(adv.slot).toBe('b');
        });

        test('Position 3 → nächste Position 2, Slot A', () => {
            const adv = calculateWbAdvancement(3);
            expect(adv.nextPosition).toBe(2);
            expect(adv.slot).toBe('a');
        });

        test('Position 4 → nächste Position 2, Slot B', () => {
            const adv = calculateWbAdvancement(4);
            expect(adv.nextPosition).toBe(2);
            expect(adv.slot).toBe('b');
        });

        test('Position 7 → nächste Position 4, Slot A', () => {
            const adv = calculateWbAdvancement(7);
            expect(adv.nextPosition).toBe(4);
            expect(adv.slot).toBe('a');
        });

        test('Position 8 → nächste Position 4, Slot B', () => {
            const adv = calculateWbAdvancement(8);
            expect(adv.nextPosition).toBe(4);
            expect(adv.slot).toBe('b');
        });
    });

    describe('LB Advancement', () => {
        test('Ungerade Runde: Position bleibt gleich', () => {
            // Odd round → even round, same positions
            const adv = calculateLbAdvancement(3, 1);
            expect(adv.nextPosition).toBe(3);
        });

        test('Gerade Runde: Position halbiert', () => {
            // Even round → odd round, positions halve
            const adv = calculateLbAdvancement(3, 2);
            expect(adv.nextPosition).toBe(2);
        });

        test('Gerade Runde Position 1 bleibt 1', () => {
            const adv = calculateLbAdvancement(1, 2);
            expect(adv.nextPosition).toBe(1);
        });

        test('Gerade Runde Position 4 → 2', () => {
            const adv = calculateLbAdvancement(4, 2);
            expect(adv.nextPosition).toBe(2);
        });
    });

    describe('WB R1 Bye Simulation', () => {
        test('8 Teilnehmer: alle WB R1 sind Byes', () => {
            const sim = simulateWbR1Byes(8);
            // Every WB R1 match should have exactly one player
            for (const result of sim.wbR1Results) {
                const hasA = result.playerA !== null;
                const hasB = result.playerB !== null;
                expect(hasA !== hasB).toBe(true);
                expect(result.status).toBe('completed');
                expect(result.winnerId).not.toBeNull();
            }
        });

        test('8 Teilnehmer: WB R2 hat alle 4 Slots gefüllt', () => {
            const sim = simulateWbR1Byes(8);
            for (const slot of sim.wbR2Slots) {
                expect(slot.playerA).not.toBeNull();
                expect(slot.playerB).not.toBeNull();
            }
        });

        test('16 Teilnehmer: keine Byes, alle WB R1 pending', () => {
            const sim = simulateWbR1Byes(16);
            for (const result of sim.wbR1Results) {
                expect(result.playerA).not.toBeNull();
                expect(result.playerB).not.toBeNull();
                expect(result.status).toBe('pending');
            }
        });

        test('4 Teilnehmer: 4 Byes, 4 Skipped (double byes)', () => {
            const sim = simulateWbR1Byes(4);
            const byes = sim.wbR1Results.filter(r => r.status === 'completed');
            const skipped = sim.wbR1Results.filter(r => r.status === 'skipped');
            expect(byes.length).toBe(4);
            expect(skipped.length).toBe(4);
        });

        test('3 Teilnehmer: 3 Byes, 5 Skipped', () => {
            const sim = simulateWbR1Byes(3);
            const byes = sim.wbR1Results.filter(r => r.status === 'completed');
            const skipped = sim.wbR1Results.filter(r => r.status === 'skipped');
            expect(byes.length).toBe(3);
            expect(skipped.length).toBe(5);
        });
    });

    describe('Teilnehmer-Szenarien', () => {
        test('3 Teilnehmer (ungerade, Minimum)', () => {
            const structure = generateDoubleEliminationStructure(3);
            // Should still have full bracket structure
            expect(structure.bracketSize).toBe(16);
            expect(structure.winnersRounds).toBe(4);
            expect(structure.losersRounds).toBe(6);
            expect(structure.totalMatchCount).toBe(31);

            // Only 3 players present in WB R1
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const withPlayers = wbR1.filter(m => m.playerA !== null || m.playerB !== null);
            expect(withPlayers.length).toBe(3);
        });

        test('4 Teilnehmer (gerade)', () => {
            const structure = generateDoubleEliminationStructure(4);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const withPlayers = wbR1.filter(m => m.playerA !== null || m.playerB !== null);
            expect(withPlayers.length).toBe(4);
        });

        test('7 Teilnehmer (ungerade)', () => {
            const structure = generateDoubleEliminationStructure(7);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const withPlayers = wbR1.filter(m => m.playerA !== null || m.playerB !== null);
            expect(withPlayers.length).toBe(7);
        });

        test('9 Teilnehmer (ungerade, über 8)', () => {
            const structure = generateDoubleEliminationStructure(9);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            // 9 players: some real matches, some byes
            const realMatches = wbR1.filter(m => m.playerA !== null && m.playerB !== null);
            const byes = wbR1.filter(m => (m.playerA !== null) !== (m.playerB !== null));
            // 16 - 9 = 7 absent seeds → 7 byes, 1 real match (8 vs 9)
            expect(realMatches.length).toBe(1);
            expect(byes.length).toBe(7);
        });

        test('10 Teilnehmer (gerade, über 8)', () => {
            const structure = generateDoubleEliminationStructure(10);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const realMatches = wbR1.filter(m => m.playerA !== null && m.playerB !== null);
            const byes = wbR1.filter(m => (m.playerA !== null) !== (m.playerB !== null));
            // 16 - 10 = 6 absent, so 6 byes and 2 real matches
            expect(realMatches.length).toBe(2);
            expect(byes.length).toBe(6);
        });

        test('15 Teilnehmer (ungerade, knapp unter 16)', () => {
            const structure = generateDoubleEliminationStructure(15);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            const realMatches = wbR1.filter(m => m.playerA !== null && m.playerB !== null);
            const byes = wbR1.filter(m => (m.playerA !== null) !== (m.playerB !== null));
            // 16 - 15 = 1 absent, so 1 bye and 7 real matches
            expect(realMatches.length).toBe(7);
            expect(byes.length).toBe(1);
        });
    });

    describe('LB Runden-Struktur', () => {
        test.each([
            [1, 'Aufnahme WB R1 Verlierer'],
            [2, 'WB R2 Verlierer + LB R1 Gewinner'],
            [3, 'LB R2 Gewinner halbieren'],
            [4, 'WB R3 Verlierer + LB R3 Gewinner'],
            [5, 'LB R4 Gewinner halbieren'],
            [6, 'WB R4 Verlierer + LB R5 Gewinner']
        ])('LB Runde %i: %s', (lbRound) => {
            const structure = generateDoubleEliminationStructure(16);
            const lbMatches = structure.matches.filter(
                m => m.bracketType === 'losers' && m.round === lbRound
            );
            const expected = calculateLbMatchesPerRound(16, lbRound);
            expect(lbMatches).toHaveLength(expected);
        });

        test('Gerade LB-Runden empfangen WB-Verlierer', () => {
            // Even rounds (2,4,6) should have same number of matches as WB round that drops to them
            expect(wbToLbRoundMapping(2)).toBe(2);  // WB R2 → LB R2
            expect(wbToLbRoundMapping(3)).toBe(4);  // WB R3 → LB R4
            expect(wbToLbRoundMapping(4)).toBe(6);  // WB R4 → LB R6
        });

        test('Ungerade LB-Runden (>1) sind Halbierungsrunden', () => {
            // LB R3: 2 matches (halved from LB R2's 4)
            expect(calculateLbMatchesPerRound(16, 3)).toBe(2);
            // LB R5: 1 match (halved from LB R4's 2)
            expect(calculateLbMatchesPerRound(16, 5)).toBe(1);
        });
    });

    describe('Match-Status bei Byes', () => {
        test('Bye Match (ein Spieler) hat status "completed"', () => {
            const structure = generateDoubleEliminationStructure(8);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            for (const match of wbR1) {
                if ((match.playerA !== null) !== (match.playerB !== null)) {
                    expect(match.status).toBe('completed');
                    expect(match.winnerId).not.toBeNull();
                }
            }
        });

        test('Double-Bye Match (kein Spieler) hat status "skipped"', () => {
            const structure = generateDoubleEliminationStructure(3);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            for (const match of wbR1) {
                if (match.playerA === null && match.playerB === null) {
                    expect(match.status).toBe('skipped');
                    expect(match.winnerId).toBeNull();
                }
            }
        });

        test('Normales Match hat status "pending"', () => {
            const structure = generateDoubleEliminationStructure(16);
            const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);
            for (const match of wbR1) {
                expect(match.status).toBe('pending');
                expect(match.winnerId).toBeNull();
            }
        });
    });

    describe('Konsistenz über verschiedene Teilnehmerzahlen', () => {
        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: Gesamt-Match-Anzahl ist immer 31',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                expect(structure.totalMatchCount).toBe(31);
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: WB hat immer 15 Matches',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                expect(structure.wbMatchCount).toBe(15);
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: LB hat immer 14 Matches',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                expect(structure.lbMatchCount).toBe(14);
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: Spieler-Indizes sind 0 bis n-1',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                const allPlayers = new Set();
                for (const match of structure.matches) {
                    if (match.playerA !== null) allPlayers.add(match.playerA);
                    if (match.playerB !== null) allPlayers.add(match.playerB);
                }
                expect(allPlayers.size).toBe(n);
                for (const player of allPlayers) {
                    expect(player).toBeGreaterThanOrEqual(0);
                    expect(player).toBeLessThan(n);
                }
            }
        );

        test.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])(
            '%i Teilnehmer: richtige Anzahl Byes',
            (n) => {
                const structure = generateDoubleEliminationStructure(n);
                const wbR1 = structure.matches.filter(m => m.bracketType === 'winners' && m.round === 1);

                const absentSeeds = 16 - n;
                const realMatches = wbR1.filter(m => m.playerA !== null && m.playerB !== null);
                const singleByes = wbR1.filter(m => (m.playerA !== null) !== (m.playerB !== null));
                const doubleByes = wbR1.filter(m => m.playerA === null && m.playerB === null);

                // absent seeds = single byes + 2 * double byes
                expect(singleByes.length + 2 * doubleByes.length).toBe(absentSeeds);
                // total matches = 8
                expect(realMatches.length + singleByes.length + doubleByes.length).toBe(8);
            }
        );
    });
});
