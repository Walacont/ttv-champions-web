/**
 * Unit Tests for Match Correction Eligibility
 *
 * Tests which matches can be corrected based on:
 * - Tournament matches excluded
 * - Already corrected matches excluded
 * - Must be within current season
 * - Only participants can request corrections
 */

import { describe, test, expect, beforeEach } from 'vitest';

// ============================================================================
// Extracted eligibility logic (mirrors match-correction-supabase.js)
// ============================================================================

function isCorrectionEligible(match, currentSeason, currentUserId) {
    // Tournament matches excluded
    if (match.tournament_match_id) {
        return { eligible: false, reason: 'tournament' };
    }

    // Already corrected
    if (match.is_corrected) {
        return { eligible: false, reason: 'already_corrected' };
    }

    // Must be a participant
    if (
        currentUserId &&
        match.player_a_id !== currentUserId &&
        match.player_b_id !== currentUserId
    ) {
        return { eligible: false, reason: 'not_participant' };
    }

    // Must be within current season
    if (currentSeason) {
        const matchDate = new Date(match.played_at || match.created_at);
        const seasonStart = new Date(currentSeason.start_date);
        if (matchDate < seasonStart) {
            return { eligible: false, reason: 'old_season' };
        }
    }

    return { eligible: true };
}

// ============================================================================
// Test Data
// ============================================================================

const PLAYER_A = 'player-a-uuid';
const PLAYER_B = 'player-b-uuid';
const PLAYER_C = 'player-c-uuid';

function createMatch(overrides = {}) {
    return {
        id: 'match-1',
        player_a_id: PLAYER_A,
        player_b_id: PLAYER_B,
        winner_id: PLAYER_A,
        loser_id: PLAYER_B,
        tournament_match_id: null,
        is_corrected: false,
        played_at: '2026-01-15T10:00:00Z',
        created_at: '2026-01-15T10:00:00Z',
        ...overrides,
    };
}

const CURRENT_SEASON = {
    start_date: '2025-09-01',
    end_date: '2026-06-30',
};

// ============================================================================
// Tests
// ============================================================================

describe('Match Correction Eligibility', () => {
    describe('Basic eligibility', () => {
        test('regular match is eligible for correction', () => {
            const match = createMatch();
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(true);
        });

        test('both players can request correction', () => {
            const match = createMatch();
            expect(isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A).eligible).toBe(true);
            expect(isCorrectionEligible(match, CURRENT_SEASON, PLAYER_B).eligible).toBe(true);
        });
    });

    describe('Tournament matches excluded', () => {
        test('tournament match is not eligible', () => {
            const match = createMatch({ tournament_match_id: 'tournament-uuid' });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(false);
            expect(result.reason).toBe('tournament');
        });
    });

    describe('Already corrected excluded', () => {
        test('corrected match is not eligible', () => {
            const match = createMatch({ is_corrected: true });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(false);
            expect(result.reason).toBe('already_corrected');
        });
    });

    describe('Season boundary', () => {
        test('match within current season is eligible', () => {
            const match = createMatch({ played_at: '2026-01-15T10:00:00Z' });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(true);
        });

        test('match from previous season is not eligible', () => {
            const match = createMatch({ played_at: '2025-06-15T10:00:00Z' });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(false);
            expect(result.reason).toBe('old_season');
        });

        test('match on season start date is eligible', () => {
            const match = createMatch({ played_at: '2025-09-01T00:00:00Z' });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(true);
        });

        test('match one day before season start is not eligible', () => {
            const match = createMatch({ played_at: '2025-08-31T23:59:59Z' });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(false);
            expect(result.reason).toBe('old_season');
        });

        test('no active season allows all matches', () => {
            const match = createMatch({ played_at: '2024-01-01T10:00:00Z' });
            const result = isCorrectionEligible(match, null, PLAYER_A);
            expect(result.eligible).toBe(true);
        });
    });

    describe('Participant check', () => {
        test('non-participant cannot request correction', () => {
            const match = createMatch();
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_C);
            expect(result.eligible).toBe(false);
            expect(result.reason).toBe('not_participant');
        });

        test('player A can request correction', () => {
            const match = createMatch();
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.eligible).toBe(true);
        });

        test('player B can request correction', () => {
            const match = createMatch();
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_B);
            expect(result.eligible).toBe(true);
        });

        test('null userId skips participant check', () => {
            const match = createMatch();
            const result = isCorrectionEligible(match, CURRENT_SEASON, null);
            expect(result.eligible).toBe(true);
        });
    });

    describe('Priority of exclusion reasons', () => {
        test('tournament takes priority over corrected', () => {
            const match = createMatch({
                tournament_match_id: 'tournament-uuid',
                is_corrected: true,
            });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.reason).toBe('tournament');
        });

        test('corrected takes priority over season', () => {
            const match = createMatch({
                is_corrected: true,
                played_at: '2025-06-15T10:00:00Z',
            });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_A);
            expect(result.reason).toBe('already_corrected');
        });

        test('participant check before season check', () => {
            const match = createMatch({ played_at: '2025-06-15T10:00:00Z' });
            const result = isCorrectionEligible(match, CURRENT_SEASON, PLAYER_C);
            expect(result.reason).toBe('not_participant');
        });
    });
});
