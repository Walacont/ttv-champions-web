/**
 * Unit Tests for Frontend Validation Utilities
 *
 * Tests table tennis match validation:
 * - Set score validation (official rules)
 * - Match validation (3 out of 5 sets)
 * - Handicap calculation (Elo-based)
 */

import { describe, test, expect } from 'vitest';
import {
  isValidSet,
  getSetWinner,
  validateMatch,
  calculateHandicap,
} from '../validation-utils.js';

describe('Set Score Validation', () => {
  describe('isValidSet()', () => {
    describe('Valid Sets', () => {
      test('should validate 11:0 (minimum win)', () => {
        expect(isValidSet(11, 0)).toBe(true);
      });

      test('should validate 11:9 (normal win)', () => {
        expect(isValidSet(11, 9)).toBe(true);
      });

      test('should validate 11:5 (comfortable win)', () => {
        expect(isValidSet(11, 5)).toBe(true);
      });

      test('should validate 0:11 (reverse)', () => {
        expect(isValidSet(0, 11)).toBe(true);
      });

      test('should validate 15:3 (large margin)', () => {
        expect(isValidSet(15, 3)).toBe(true);
      });

      test('should validate deuce scenarios (12:10, 14:12, etc.)', () => {
        expect(isValidSet(12, 10)).toBe(true); // Deuce win
        expect(isValidSet(10, 12)).toBe(true); // Reverse
        expect(isValidSet(14, 12)).toBe(true); // Extended deuce
        expect(isValidSet(12, 14)).toBe(true); // Reverse
        expect(isValidSet(20, 18)).toBe(true); // Very long deuce
        expect(isValidSet(18, 20)).toBe(true); // Reverse
      });

      test('should validate edge case: exactly 11 with lead (not deuce yet)', () => {
        // 11:10 is valid - deuce only starts when BOTH are at 10 (10:10)
        // Here, one player reached 11 before the other reached 10
        expect(isValidSet(11, 10)).toBe(false); // This is deuce territory (both >= 10)
        expect(isValidSet(10, 11)).toBe(false); // Same
      });
    });

    describe('Invalid Sets - Below 11 Points', () => {
      test('should reject 10:9 (not enough points)', () => {
        expect(isValidSet(10, 9)).toBe(false);
      });

      test('should reject 5:3 (too low)', () => {
        expect(isValidSet(5, 3)).toBe(false);
      });

      test('should reject 0:0 (empty)', () => {
        expect(isValidSet(0, 0)).toBe(false);
      });

      test('should reject 10:0 (below minimum)', () => {
        expect(isValidSet(10, 0)).toBe(false);
      });
    });

    describe('Invalid Sets - Ties', () => {
      test('should reject 11:11 (tie)', () => {
        expect(isValidSet(11, 11)).toBe(false);
      });

      test('should reject 15:15 (tie)', () => {
        expect(isValidSet(15, 15)).toBe(false);
      });

      test('should reject 5:5 (tie)', () => {
        expect(isValidSet(5, 5)).toBe(false);
      });
    });

    describe('Invalid Sets - Deuce Rules', () => {
      test('should reject 11:10 and similar (deuce territory needs 2-point lead)', () => {
        // Once both >= 10, must win by 2
        expect(isValidSet(11, 10)).toBe(false); // Deuce territory (both >= 10), need 2-point lead
        expect(isValidSet(10, 11)).toBe(false); // Same
        expect(isValidSet(13, 12)).toBe(false); // 1-point lead in deuce
        expect(isValidSet(12, 11)).toBe(false); // 1-point lead in deuce
        expect(isValidSet(15, 14)).toBe(false); // 1-point lead in deuce
      });

      test('should accept 12:10 but reject 12:11 in deuce', () => {
        expect(isValidSet(12, 10)).toBe(true);  // 2-point lead
        expect(isValidSet(12, 11)).toBe(false); // Only 1-point lead
      });

      test('should handle extended deuces correctly', () => {
        expect(isValidSet(19, 17)).toBe(true);  // Valid deuce
        expect(isValidSet(20, 19)).toBe(false); // Invalid (1-point lead)
        expect(isValidSet(21, 19)).toBe(true);  // Valid deuce
      });
    });

    describe('Edge Cases', () => {
      test('should handle string inputs', () => {
        expect(isValidSet('11', '9')).toBe(true);
        expect(isValidSet('12', '10')).toBe(true);
      });

      test('should handle null/undefined as 0', () => {
        expect(isValidSet(null, 11)).toBe(true);
        expect(isValidSet(11, null)).toBe(true);
        expect(isValidSet(null, null)).toBe(false);
      });

      test('should handle negative numbers (treat as 0)', () => {
        expect(isValidSet(-5, 11)).toBe(true);
        expect(isValidSet(11, -5)).toBe(true);
      });

      test('should handle very high scores', () => {
        expect(isValidSet(50, 48)).toBe(true);
        expect(isValidSet(99, 97)).toBe(true);
      });
    });
  });

  describe('getSetWinner()', () => {
    test('should return "A" when player A wins', () => {
      expect(getSetWinner(11, 9)).toBe('A');
      expect(getSetWinner(12, 10)).toBe('A');
      expect(getSetWinner(15, 13)).toBe('A');
    });

    test('should return "B" when player B wins', () => {
      expect(getSetWinner(9, 11)).toBe('B');
      expect(getSetWinner(10, 12)).toBe('B');
      expect(getSetWinner(13, 15)).toBe('B');
    });

    test('should return null for invalid sets', () => {
      expect(getSetWinner(10, 9)).toBe(null);  // Not enough points
      expect(getSetWinner(11, 11)).toBe(null); // Tie
      expect(getSetWinner(12, 11)).toBe(null); // Invalid deuce
    });

    test('should return null for ties', () => {
      expect(getSetWinner(11, 11)).toBe(null);
      expect(getSetWinner(0, 0)).toBe(null);
    });
  });
});

describe('Match Validation', () => {
  describe('validateMatch()', () => {
    describe('Valid Matches', () => {
      test('should validate 3:0 victory (minimum sets)', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 11, playerB: 7 },
          { playerA: 11, playerB: 8 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
        expect(result.winner).toBe('A');
      });

      test('should validate 0:3 victory (reverse)', () => {
        const sets = [
          { playerA: 9, playerB: 11 },
          { playerA: 7, playerB: 11 },
          { playerA: 8, playerB: 11 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
        expect(result.winner).toBe('B');
      });

      test('should validate 3:1 victory (4 sets)', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 11, playerB: 7 },
          { playerA: 9, playerB: 11 },
          { playerA: 11, playerB: 8 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
        expect(result.winner).toBe('A');
      });

      test('should validate 3:2 victory (full 5 sets)', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 9, playerB: 11 },
          { playerA: 11, playerB: 7 },
          { playerA: 8, playerB: 11 },
          { playerA: 11, playerB: 9 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
        expect(result.winner).toBe('A');
      });

      test('should validate match with deuce sets', () => {
        const sets = [
          { playerA: 12, playerB: 10 },
          { playerA: 10, playerB: 12 },
          { playerA: 14, playerB: 12 },
          { playerA: 11, playerB: 9 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
        expect(result.winner).toBe('A');
      });
    });

    describe('Invalid Matches - Not Enough Sets', () => {
      test('should reject match with only 2 sets', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 11, playerB: 7 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Mindestens 3 Sätze');
      });

      test('should reject match with 1 set', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
      });

      test('should reject empty sets array', () => {
        const result = validateMatch([]);
        expect(result.valid).toBe(false);
      });

      test('should reject null/undefined sets', () => {
        expect(validateMatch(null).valid).toBe(false);
        expect(validateMatch(undefined).valid).toBe(false);
      });
    });

    describe('Invalid Matches - Invalid Set Scores', () => {
      test('should reject match with invalid set (below 11)', () => {
        const sets = [
          { playerA: 10, playerB: 9 },
          { playerA: 11, playerB: 7 },
          { playerA: 11, playerB: 8 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Satz 1');
        expect(result.error).toContain('11 Punkte');
      });

      test('should reject match with tied set', () => {
        const sets = [
          { playerA: 11, playerB: 11 },
          { playerA: 11, playerB: 7 },
          { playerA: 11, playerB: 8 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Satz 1');
        expect(result.error).toContain('Unentschieden');
      });

      test('should reject match with invalid deuce', () => {
        const sets = [
          { playerA: 12, playerB: 11 }, // Invalid: only 1-point lead in deuce
          { playerA: 11, playerB: 7 },
          { playerA: 11, playerB: 8 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Satz 1');
        expect(result.error).toContain('2 Punkte Vorsprung');
      });
    });

    describe('Invalid Matches - No Winner', () => {
      test('should reject match with 2:1 score (no winner yet)', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 11, playerB: 7 },
          { playerA: 8, playerB: 11 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('3 Sätze gewinnen');
      });

      test('should reject match with 2:2 score (incomplete)', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 9, playerB: 11 },
          { playerA: 11, playerB: 7 },
          { playerA: 8, playerB: 11 },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('3 Sätze gewinnen');
      });
    });

    describe('Edge Cases', () => {
      test('should handle string inputs in sets', () => {
        const sets = [
          { playerA: '11', playerB: '9' },
          { playerA: '11', playerB: '7' },
          { playerA: '11', playerB: '8' },
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
      });

      test('should identify correct winner in close match', () => {
        const sets = [
          { playerA: 11, playerB: 9 },
          { playerA: 9, playerB: 11 },
          { playerA: 11, playerB: 9 },
          { playerA: 9, playerB: 11 },
          { playerA: 12, playerB: 10 }, // Player A wins 3:2
        ];
        const result = validateMatch(sets);
        expect(result.valid).toBe(true);
        expect(result.winner).toBe('A');
      });
    });
  });
});

describe('Handicap Calculation', () => {
  describe('calculateHandicap()', () => {
    describe('Valid Handicaps', () => {
      test('should calculate 1-point handicap for 25-49 Elo difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 825 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(1);
        expect(result.player).toBe(playerA);
      });

      test('should calculate 1-point handicap for exactly 25 Elo difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 825 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(1);
      });

      test('should calculate 2-point handicap for 50-99 Elo difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 900 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(2);
        expect(result.player).toBe(playerA);
      });

      test('should calculate 5-point handicap for 250 Elo difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 1050 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(5);
      });

      test('should cap handicap at 10 points', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 1600 }; // 800 Elo difference
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(10); // Capped at 10
        expect(result.player).toBe(playerA);
      });

      test('should cap handicap at 10 for extreme differences', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 2000 }; // 1200 Elo difference
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(10);
      });

      test('should identify weaker player correctly (reverse)', () => {
        const playerA = { eloRating: 1000 };
        const playerB = { eloRating: 800 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.player).toBe(playerB); // Weaker player gets handicap
      });
    });

    describe('No Handicap Scenarios', () => {
      test('should return null for Elo difference < 25', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 824 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).toBe(null);
      });

      test('should return null for exactly 24 Elo difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 824 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).toBe(null);
      });

      test('should return null for 0 Elo difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 800 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).toBe(null);
      });

      test('should return null for very small difference', () => {
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 801 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).toBe(null);
      });
    });

    describe('Edge Cases', () => {
      test('should handle 0 Elo (old system)', () => {
        const playerA = { eloRating: 0 };
        const playerB = { eloRating: 800 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBeGreaterThan(0);
        expect(result.player).toBe(playerA);
      });

      test('should handle missing eloRating (defaults to 0)', () => {
        const playerA = {};
        const playerB = { eloRating: 800 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.player).toBe(playerA);
      });

      test('should handle both players with 0 Elo', () => {
        const playerA = { eloRating: 0 };
        const playerB = { eloRating: 0 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).toBe(null);
      });

      test('should round handicap points correctly', () => {
        // 74 Elo diff → 74/50 = 1.48 → rounds to 1
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 874 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(1);
      });

      test('should round up handicap points correctly', () => {
        // 76 Elo diff → 76/50 = 1.52 → rounds to 2
        const playerA = { eloRating: 800 };
        const playerB = { eloRating: 876 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).not.toBe(null);
        expect(result.points).toBe(2);
      });
    });

    describe('Real-World Scenarios', () => {
      test('Beginner (800) vs Intermediate (1000)', () => {
        const beginner = { eloRating: 800 };
        const intermediate = { eloRating: 1000 };
        const result = calculateHandicap(beginner, intermediate);

        expect(result).not.toBe(null);
        expect(result.points).toBe(4); // 200/50 = 4
        expect(result.player).toBe(beginner);
      });

      test('Intermediate (1000) vs Advanced (1300)', () => {
        const intermediate = { eloRating: 1000 };
        const advanced = { eloRating: 1300 };
        const result = calculateHandicap(intermediate, advanced);

        expect(result).not.toBe(null);
        expect(result.points).toBe(6); // 300/50 = 6
        expect(result.player).toBe(intermediate);
      });

      test('Beginner (800) vs Expert (1600)', () => {
        const beginner = { eloRating: 800 };
        const expert = { eloRating: 1600 };
        const result = calculateHandicap(beginner, expert);

        expect(result).not.toBe(null);
        expect(result.points).toBe(10); // Capped at 10
        expect(result.player).toBe(beginner);
      });

      test('Closely matched players (950 vs 970)', () => {
        const playerA = { eloRating: 950 };
        const playerB = { eloRating: 970 };
        const result = calculateHandicap(playerA, playerB);

        expect(result).toBe(null); // Only 20 Elo difference
      });
    });
  });
});
