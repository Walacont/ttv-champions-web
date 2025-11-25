/**
 * Unit Tests für ELO-Berechnungen und Gates
 *
 * Testet das neue Punktesystem:
 * - ELO startet bei 800
 * - Season Points = Elo-Gewinn × 0.2
 * - Elo-Gates: [850, 900, 1000, 1100, 1300, 1600]
 * - Handicap: ±8 Elo fix
 */

const { _testOnly } = require('../index');
const { calculateElo, getHighestEloGate, applyEloGate, CONFIG } = _testOnly;

describe('ELO Calculation System', () => {
    describe('calculateElo()', () => {
        test('should calculate Elo for evenly matched players (800 vs 800)', () => {
            const result = calculateElo(800, 800, 32);

            expect(result.newWinnerElo).toBe(816); // Winner gains 16
            expect(result.newLoserElo).toBe(784); // Loser loses 16
            expect(result.eloDelta).toBe(16); // Delta is 16
        });

        test('should calculate Elo when higher rated player wins (1000 vs 800)', () => {
            const result = calculateElo(1000, 800, 32);

            // Higher rated player should gain less when winning
            expect(result.newWinnerElo).toBeGreaterThan(1000);
            expect(result.newWinnerElo).toBeLessThan(1010); // Small gain (~8)
            expect(result.newLoserElo).toBeGreaterThan(790);
            expect(result.newLoserElo).toBeLessThan(800);
        });

        test('should calculate Elo when lower rated player wins (800 vs 1000)', () => {
            const result = calculateElo(800, 1000, 32);

            // Lower rated player should gain more when winning (upset)
            expect(result.newWinnerElo).toBeGreaterThan(820); // Large gain (~24)
            expect(result.newWinnerElo).toBeLessThan(830);
            expect(result.newLoserElo).toBeLessThan(1000);
            expect(result.newLoserElo).toBeGreaterThan(970);
        });

        test('should handle extreme rating differences (1600 vs 800)', () => {
            const result = calculateElo(800, 1600, 32);

            // Huge upset - winner should gain almost all K-factor
            expect(result.newWinnerElo).toBeGreaterThan(825);
            expect(result.newLoserElo).toBeLessThan(1605);
        });

        test('should always return rounded integers', () => {
            const result = calculateElo(823, 891, 32);

            expect(Number.isInteger(result.newWinnerElo)).toBe(true);
            expect(Number.isInteger(result.newLoserElo)).toBe(true);
            expect(Number.isInteger(result.eloDelta)).toBe(true);
        });

        test('should respect K-factor (different K values)', () => {
            const result16 = calculateElo(800, 800, 16);
            const result32 = calculateElo(800, 800, 32);
            const result64 = calculateElo(800, 800, 64);

            // Higher K-factor = larger Elo changes
            expect(result16.eloDelta).toBeLessThan(result32.eloDelta);
            expect(result32.eloDelta).toBeLessThan(result64.eloDelta);
        });

        test('should ensure Elo conservation (winner gain ≈ loser loss)', () => {
            const result = calculateElo(800, 800, 32);

            const winnerGain = result.newWinnerElo - 800;
            const loserLoss = 800 - result.newLoserElo;

            // Due to rounding, they might differ by ±1
            expect(Math.abs(winnerGain - loserLoss)).toBeLessThanOrEqual(1);
        });

        test('should calculate Season Points correctly (×0.2)', () => {
            const result = calculateElo(800, 800, 32);
            const seasonPoints = Math.round(result.eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR);

            // 16 Elo × 0.2 = 3.2 → 3 Season Points
            expect(seasonPoints).toBe(3);
        });
    });

    describe('getHighestEloGate()', () => {
        const gates = CONFIG.ELO.GATES; // [850, 900, 1000, 1100, 1300, 1600]

        test('should return 0 when no gate reached (below 850)', () => {
            expect(getHighestEloGate(800, 800)).toBe(0);
            expect(getHighestEloGate(849, 849)).toBe(0);
            expect(getHighestEloGate(800, 840)).toBe(0);
        });

        test('should return first gate (850) when reached', () => {
            expect(getHighestEloGate(850, 850)).toBe(850);
            expect(getHighestEloGate(899, 899)).toBe(850);
            expect(getHighestEloGate(800, 850)).toBe(850); // highestElo matters
        });

        test('should return second gate (900) when reached', () => {
            expect(getHighestEloGate(900, 900)).toBe(900);
            expect(getHighestEloGate(950, 950)).toBe(900);
            expect(getHighestEloGate(850, 900)).toBe(900);
        });

        test('should return third gate (1000) when reached', () => {
            expect(getHighestEloGate(1000, 1000)).toBe(1000);
            expect(getHighestEloGate(1050, 1050)).toBe(1000);
        });

        test('should return fourth gate (1100) when reached', () => {
            expect(getHighestEloGate(1100, 1100)).toBe(1100);
            expect(getHighestEloGate(1200, 1200)).toBe(1100);
        });

        test('should return fifth gate (1300) when reached', () => {
            expect(getHighestEloGate(1300, 1300)).toBe(1300);
            expect(getHighestEloGate(1500, 1500)).toBe(1300);
        });

        test('should return highest gate (1600) when reached', () => {
            expect(getHighestEloGate(1600, 1600)).toBe(1600);
            expect(getHighestEloGate(2000, 2000)).toBe(1600);
        });

        test('should use highestElo even if currentElo is lower', () => {
            // Player had 1000 Elo, now at 950 → gate is 1000
            expect(getHighestEloGate(950, 1000)).toBe(1000);

            // Player had 1300 Elo, now at 1100 → gate is 1300
            expect(getHighestEloGate(1100, 1300)).toBe(1300);
        });

        test('should handle null/undefined highestElo (new players)', () => {
            expect(getHighestEloGate(800, null)).toBe(0);
            expect(getHighestEloGate(800, undefined)).toBe(0);
            expect(getHighestEloGate(900, null)).toBe(900);
        });

        test('should handle edge cases at gate boundaries', () => {
            expect(getHighestEloGate(849, 849)).toBe(0); // Just below
            expect(getHighestEloGate(850, 850)).toBe(850); // Exactly at gate
            expect(getHighestEloGate(851, 851)).toBe(850); // Just above
        });
    });

    describe('applyEloGate()', () => {
        test('should not protect Elo if no gate reached', () => {
            // Player at 800, loses match → 784, no gate protection
            expect(applyEloGate(784, 800, 800)).toBe(784);
        });

        test('should protect Elo at first gate (850)', () => {
            // Player at 870, loses → should be 854, but gate protects at 850
            expect(applyEloGate(854, 870, 870)).toBe(854); // Above gate

            // Player at 855, loses → should be 840, but gate protects at 850
            expect(applyEloGate(840, 855, 855)).toBe(850); // Gate protection!
        });

        test('should protect Elo at second gate (900)', () => {
            // Player at 920, loses → should be 880, but gate protects at 900
            expect(applyEloGate(880, 920, 920)).toBe(900);

            // Player at 950, loses → should be 905, gate doesn't apply (above 900)
            expect(applyEloGate(905, 950, 950)).toBe(905);
        });

        test('should protect Elo at third gate (1000)', () => {
            // Player at 1020, loses → should be 990, but gate protects at 1000
            expect(applyEloGate(990, 1020, 1020)).toBe(1000);
        });

        test('should protect Elo at highest gate (1600)', () => {
            // Player at 1700, loses → should be 1550, but gate protects at 1600
            expect(applyEloGate(1550, 1700, 1700)).toBe(1600);

            // Player at 2000, loses → should be 1500, but gate protects at 1600
            expect(applyEloGate(1500, 2000, 2000)).toBe(1600);
        });

        test('should use highestElo for gate calculation', () => {
            // Player had 1000 Elo peak, now at 950, loses → should be 930
            // Gate is 1000 (based on highestElo), but 930 is below → no protection needed
            expect(applyEloGate(930, 950, 1000)).toBe(1000); // Gate protects!

            // Player had 1300 Elo peak, now at 1200, loses → should be 1180
            // Gate is 1300, protects at 1300
            expect(applyEloGate(1180, 1200, 1300)).toBe(1300);
        });

        test('should not protect if new Elo is above gate', () => {
            // Player at 870, loses → 854, gate is 850 → no protection needed (still above)
            expect(applyEloGate(854, 870, 870)).toBe(854);
        });

        test('should handle winning scenarios (Elo increase)', () => {
            // Player wins, Elo goes up → no gate protection needed
            expect(applyEloGate(916, 900, 900)).toBe(916);
            expect(applyEloGate(1016, 1000, 1000)).toBe(1016);
        });

        test('should handle extreme loss scenarios', () => {
            // Player at 1600, loses massively → should go to 1500, but gate protects
            expect(applyEloGate(1500, 1600, 1600)).toBe(1600);

            // Player at 800, no gate → can fall below
            expect(applyEloGate(750, 800, 800)).toBe(750);
        });

        test('should handle null/undefined highestElo', () => {
            // New player at 800, no highestElo → no gate protection
            expect(applyEloGate(784, 800, null)).toBe(784);
            expect(applyEloGate(784, 800, undefined)).toBe(784);
        });
    });

    describe('Integration: Full Match Simulation', () => {
        test('Standard Match: 800 vs 800 (evenly matched)', () => {
            const winnerElo = 800;
            const loserElo = 800;

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            // Apply gate protection for loser
            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            // Calculate Season Points
            const seasonPoints = Math.round(eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR);

            expect(newWinnerElo).toBe(816);
            expect(protectedLoserElo).toBe(784); // No gate protection
            expect(seasonPoints).toBe(3); // 16 × 0.2 = 3.2 → 3
        });

        test('Standard Match: 900 vs 900 (at first gate)', () => {
            const winnerElo = 900;
            const loserElo = 900;

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            // Loser should be protected at 900 gate
            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            expect(newWinnerElo).toBe(916);
            expect(newLoserElo).toBe(884); // Calculated loss
            expect(protectedLoserElo).toBe(900); // Protected by gate!
        });

        test('Standard Match: 1000 vs 950 (winner at gate)', () => {
            const winnerElo = 1000;
            const loserElo = 950;

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            expect(newWinnerElo).toBeGreaterThan(1000);
            expect(protectedLoserElo).toBeGreaterThanOrEqual(900); // Protected at 900 gate
        });

        test('Handicap Match: Fixed ±8 Elo', () => {
            const winnerElo = 800;
            const loserElo = 1000;

            // Handicap matches use fixed changes
            const newWinnerElo = winnerElo + CONFIG.ELO.HANDICAP_SEASON_POINTS; // +8
            const newLoserElo = loserElo - CONFIG.ELO.HANDICAP_SEASON_POINTS; // -8

            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            expect(newWinnerElo).toBe(808);
            expect(protectedLoserElo).toBe(1000); // Protected at 1000 gate

            // Season Points for handicap = 8 (fixed)
            expect(CONFIG.ELO.HANDICAP_SEASON_POINTS).toBe(8);
        });

        test('Upset Victory: Lower rated player wins', () => {
            const winnerElo = 800; // Underdog
            const loserElo = 1200; // Favorite

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            // Winner should gain a lot (upset bonus)
            expect(newWinnerElo).toBeGreaterThan(820);

            // Loser should be protected at 1100 gate
            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);
            expect(protectedLoserElo).toBeGreaterThanOrEqual(1100);

            // Season Points should be high due to large Elo delta
            const seasonPoints = Math.round(eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR);
            expect(seasonPoints).toBeGreaterThan(3);
        });

        test('Player who peaked at 1300 but dropped to 1250', () => {
            const currentElo = 1250;
            const highestElo = 1300;
            const loserElo = 1200;

            const { newWinnerElo, newLoserElo } = calculateElo(
                currentElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            // If this player loses next match
            const { newLoserElo: potentialNewElo } = calculateElo(
                1200,
                currentElo,
                CONFIG.ELO.K_FACTOR
            );

            // Gate should protect at 1300
            const protectedElo = applyEloGate(potentialNewElo, currentElo, highestElo);
            expect(protectedElo).toBeGreaterThanOrEqual(1300); // Protected at peak gate
        });
    });

    describe('Edge Cases & Boundary Conditions', () => {
        test('should handle 0 Elo (old system migration)', () => {
            // Old players might have 0 Elo before migration
            const result = calculateElo(800, 0, 32);

            // Against 0 Elo, winner wins ~100% expected, so gains almost 0 Elo
            expect(result.newWinnerElo).toBeGreaterThanOrEqual(800);
            // Loser should lose approximately full K-factor (can be -0 or -32)
            expect(result.newLoserElo).toBeLessThanOrEqual(0);
            expect(result.eloDelta).toBeGreaterThanOrEqual(0);
        });

        test('should handle very high Elo (2000+)', () => {
            const result = calculateElo(2000, 1800, 32);

            expect(Number.isInteger(result.newWinnerElo)).toBe(true);
            expect(Number.isInteger(result.newLoserElo)).toBe(true);
        });

        test('should handle K-factor = 0 (no change)', () => {
            const result = calculateElo(800, 900, 0);

            expect(result.newWinnerElo).toBe(800);
            expect(result.newLoserElo).toBe(900);
            expect(result.eloDelta).toBe(0);
        });

        test('should protect at exact gate boundary', () => {
            // Player exactly at 1000, loses → protected
            expect(applyEloGate(984, 1000, 1000)).toBe(1000);
        });

        test('should handle multiple gates', () => {
            // Player who peaked at 1600, now at 1400, should be protected at 1600
            expect(applyEloGate(1380, 1400, 1600)).toBe(1600);
        });
    });

    describe('Season Points Calculation', () => {
        test('should calculate Season Points for various Elo deltas', () => {
            const testCases = [
                { winnerElo: 800, loserElo: 800, expectedMin: 3, expectedMax: 4 }, // ~16 Elo × 0.2 = 3
                { winnerElo: 800, loserElo: 1000, expectedMin: 4, expectedMax: 6 }, // ~24 Elo × 0.2 = 5
                { winnerElo: 1000, loserElo: 800, expectedMin: 1, expectedMax: 2 }, // ~8 Elo × 0.2 = 2
            ];

            testCases.forEach(({ winnerElo, loserElo, expectedMin, expectedMax }) => {
                const { eloDelta } = calculateElo(winnerElo, loserElo, 32);
                const seasonPoints = Math.round(eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR);

                expect(seasonPoints).toBeGreaterThanOrEqual(expectedMin);
                expect(seasonPoints).toBeLessThanOrEqual(expectedMax);
            });
        });

        test('Handicap Season Points should always be 8', () => {
            expect(CONFIG.ELO.HANDICAP_SEASON_POINTS).toBe(8);
        });
    });

    describe('Configuration Validation', () => {
        test('CONFIG should have correct default values', () => {
            expect(CONFIG.ELO.DEFAULT_RATING).toBe(800);
            expect(CONFIG.ELO.K_FACTOR).toBe(32);
            expect(CONFIG.ELO.SEASON_POINT_FACTOR).toBe(0.2);
            expect(CONFIG.ELO.HANDICAP_SEASON_POINTS).toBe(8);
        });

        test('CONFIG.ELO.GATES should be in ascending order', () => {
            const gates = CONFIG.ELO.GATES;
            for (let i = 1; i < gates.length; i++) {
                expect(gates[i]).toBeGreaterThan(gates[i - 1]);
            }
        });

        test('CONFIG.ELO.GATES should match expected gates', () => {
            expect(CONFIG.ELO.GATES).toEqual([850, 900, 1000, 1100, 1300, 1600]);
        });
    });
});
