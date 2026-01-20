/**
 * Unit Tests für ELO-Berechnungen
 *
 * Testet das Punktesystem:
 * - ELO startet bei 800
 * - Season Points = Elo-Gewinn × 0.2
 * - Elo-Gates: DISABLED (Elo kann frei fallen, nur nicht unter 0)
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

    describe('getHighestEloGate() - DISABLED', () => {
        test('should always return 0 (gates disabled)', () => {
            // Gates are disabled - always returns 0
            expect(getHighestEloGate(799, 799)).toBe(0);
            expect(getHighestEloGate(800, 800)).toBe(0);
            expect(getHighestEloGate(850, 850)).toBe(0);
            expect(getHighestEloGate(900, 900)).toBe(0);
            expect(getHighestEloGate(1000, 1000)).toBe(0);
            expect(getHighestEloGate(1600, 1600)).toBe(0);
            expect(getHighestEloGate(2000, 2000)).toBe(0);
        });

        test('should return 0 regardless of highestElo', () => {
            expect(getHighestEloGate(950, 1000)).toBe(0);
            expect(getHighestEloGate(1100, 1300)).toBe(0);
        });

        test('should handle null/undefined highestElo', () => {
            expect(getHighestEloGate(800, null)).toBe(0);
            expect(getHighestEloGate(800, undefined)).toBe(0);
        });
    });

    describe('applyEloGate() - Only prevents negative Elo', () => {
        test('should allow Elo to fall freely (no gate protection)', () => {
            // Gates are disabled - Elo can fall freely
            expect(applyEloGate(750, 799, 799)).toBe(750);
            expect(applyEloGate(784, 800, 800)).toBe(784);
            expect(applyEloGate(790, 820, 820)).toBe(790);
            expect(applyEloGate(840, 855, 855)).toBe(840);
            expect(applyEloGate(880, 920, 920)).toBe(880);
            expect(applyEloGate(990, 1020, 1020)).toBe(990);
            expect(applyEloGate(1500, 1600, 1600)).toBe(1500);
        });

        test('should prevent negative Elo', () => {
            // Only protection: Elo cannot go below 0
            expect(applyEloGate(-50, 100, 100)).toBe(0);
            expect(applyEloGate(-100, 50, 50)).toBe(0);
            expect(applyEloGate(0, 100, 100)).toBe(0);
        });

        test('should allow Elo increases', () => {
            expect(applyEloGate(916, 900, 900)).toBe(916);
            expect(applyEloGate(1016, 1000, 1000)).toBe(1016);
        });

        test('should handle null/undefined highestElo', () => {
            // No gate protection with null/undefined
            expect(applyEloGate(784, 800, null)).toBe(784);
            expect(applyEloGate(784, 800, undefined)).toBe(784);
        });
    });

    describe('Integration: Full Match Simulation (No Gates)', () => {
        test('Standard Match: 800 vs 800 (evenly matched)', () => {
            const winnerElo = 800;
            const loserElo = 800;

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            // No gate protection - loser Elo falls freely
            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            // Calculate Season Points
            const seasonPoints = Math.round(eloDelta * CONFIG.ELO.SEASON_POINT_FACTOR);

            expect(newWinnerElo).toBe(816);
            expect(protectedLoserElo).toBe(784); // Elo falls freely (no gate protection)
            expect(seasonPoints).toBe(3); // 16 × 0.2 = 3.2 → 3
        });

        test('Standard Match: 900 vs 900', () => {
            const winnerElo = 900;
            const loserElo = 900;

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            // No gate protection - loser Elo falls freely
            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            expect(newWinnerElo).toBe(916);
            expect(newLoserElo).toBe(884); // Calculated loss
            expect(protectedLoserElo).toBe(884); // No gate protection!
        });

        test('Standard Match: 1000 vs 950', () => {
            const winnerElo = 1000;
            const loserElo = 950;

            const { newWinnerElo, newLoserElo, eloDelta } = calculateElo(
                winnerElo,
                loserElo,
                CONFIG.ELO.K_FACTOR
            );

            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            expect(newWinnerElo).toBeGreaterThan(1000);
            expect(protectedLoserElo).toBe(newLoserElo); // No gate protection
        });

        test('Handicap Match: Fixed ±8 Elo', () => {
            const winnerElo = 800;
            const loserElo = 1000;

            // Handicap matches use fixed changes
            const newWinnerElo = winnerElo + CONFIG.ELO.HANDICAP_SEASON_POINTS; // +8
            const newLoserElo = loserElo - CONFIG.ELO.HANDICAP_SEASON_POINTS; // -8

            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);

            expect(newWinnerElo).toBe(808);
            expect(protectedLoserElo).toBe(992); // Elo falls freely (no gate protection)

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

            // Loser Elo falls freely (no gate protection)
            const protectedLoserElo = applyEloGate(newLoserElo, loserElo, loserElo);
            expect(protectedLoserElo).toBe(newLoserElo);

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

            // No gate protection - Elo falls freely
            const protectedElo = applyEloGate(potentialNewElo, currentElo, highestElo);
            expect(protectedElo).toBe(potentialNewElo); // No gate protection
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

        test('should allow Elo to fall freely (no gate protection)', () => {
            // No gates - Elo falls freely
            expect(applyEloGate(984, 1000, 1000)).toBe(984);
            expect(applyEloGate(1380, 1400, 1600)).toBe(1380);
        });

        test('should only prevent negative Elo', () => {
            expect(applyEloGate(-10, 50, 50)).toBe(0);
            expect(applyEloGate(0, 100, 100)).toBe(0);
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

        test('CONFIG.ELO.GATES should be empty (gates disabled)', () => {
            expect(CONFIG.ELO.GATES).toEqual([]);
        });
    });
});
