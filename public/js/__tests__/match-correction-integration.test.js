/**
 * Integration Tests for Match Correction Flow
 *
 * Requires local Supabase running (`just up && just db-reset`).
 * Tests the full correction cycle against seed data:
 *   - reverse_match_effects RPC
 *   - Correction request submission
 *   - Concurrent correction prevention (unique index)
 *
 * Seed data (from seed_dev.sql):
 *   Player1 (b0000000-...-001): elo 800, 1W/1L, 3pts
 *   Player2 (b0000000-...-002): elo 800, 1W/1L, 3pts
 *   Match1  (f0000000-...-001): P1 beat P2, elo_change ±16
 *   Match2  (f0000000-...-002): P2 beat P1, elo_change ±16
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// Local Supabase config (deterministic for supabase start)
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Deterministic UUIDs from seed_dev.sql
const PLAYER1_ID = 'b0000000-0000-0000-0000-000000000001';
const PLAYER2_ID = 'b0000000-0000-0000-0000-000000000002';
const MATCH1_ID = 'f0000000-0000-0000-0000-000000000001';
const MATCH2_ID = 'f0000000-0000-0000-0000-000000000002';
const CLUB_ID = 'c0000000-0000-0000-0000-000000000001';
const SPORT_ID = 'd0000000-0000-0000-0000-000000000001';

/** Check if local Supabase is running and seeded */
const isLocalSupabaseRunning = await (async () => {
    try {
        const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { persistSession: false },
        });
        const { error } = await client.from('profiles').select('id').limit(1);
        return !error;
    } catch {
        return false;
    }
})();

/** Create an authenticated Supabase client for a test user */
async function createAuthClient(email, password) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`Auth failed for ${email}: ${error.message}`);
    return client;
}

/** Service-role client for reading data without RLS */
function createServiceClient() {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false },
    });
}

describe.skipIf(!isLocalSupabaseRunning)('Match Correction Integration', () => {
    let player1Client;
    let player2Client;
    let serviceClient;

    beforeAll(async () => {
        serviceClient = createServiceClient();
        player1Client = await createAuthClient('player1@ttv.test', 'password123');
        player2Client = await createAuthClient('player2@ttv.test', 'password123');
    });

    describe('reverse_match_effects RPC', () => {
        test('reverses Match 1 effects on player profiles', async () => {
            // Snapshot profiles before reversal
            const { data: before } = await serviceClient
                .from('profiles')
                .select('id, elo_rating, wins, losses, points, singles_matches_played')
                .in('id', [PLAYER1_ID, PLAYER2_ID]);

            const p1Before = before.find((p) => p.id === PLAYER1_ID);
            const p2Before = before.find((p) => p.id === PLAYER2_ID);

            // Call RPC as Player 1 (a participant)
            const { data: result, error } = await player1Client.rpc('reverse_match_effects', {
                p_match_id: MATCH1_ID,
            });

            expect(error).toBeNull();

            const parsed = typeof result === 'string' ? JSON.parse(result) : result;
            expect(parsed.success).toBe(true);

            // Verify profiles updated: P1 lost a win, P2 lost a loss
            const { data: after } = await serviceClient
                .from('profiles')
                .select('id, elo_rating, wins, losses, points, singles_matches_played')
                .in('id', [PLAYER1_ID, PLAYER2_ID]);

            const p1After = after.find((p) => p.id === PLAYER1_ID);
            const p2After = after.find((p) => p.id === PLAYER2_ID);

            expect(p1After.wins).toBe(p1Before.wins - 1);
            expect(p1After.singles_matches_played).toBe(p1Before.singles_matches_played - 1);
            expect(p2After.losses).toBe(p2Before.losses - 1);
            expect(p2After.singles_matches_played).toBe(p2Before.singles_matches_played - 1);

            // Match should be marked as corrected
            const { data: match } = await serviceClient
                .from('matches')
                .select('is_corrected')
                .eq('id', MATCH1_ID)
                .single();

            expect(match.is_corrected).toBe(true);
        });
    });

    describe('Correction request submission', () => {
        test('Player 1 can submit a correction request for Match 2', async () => {
            const { data, error } = await player1Client
                .from('match_requests')
                .insert({
                    player_a_id: PLAYER1_ID,
                    player_b_id: PLAYER2_ID,
                    club_id: CLUB_ID,
                    sport_id: SPORT_ID,
                    sets: [
                        { playerA: 11, playerB: 5 },
                        { playerA: 11, playerB: 7 },
                        { playerA: 11, playerB: 9 },
                    ],
                    match_mode: 'best-of-5',
                    handicap_used: false,
                    winner_id: PLAYER1_ID,
                    loser_id: PLAYER2_ID,
                    status: 'pending_player',
                    corrects_match_id: MATCH2_ID,
                    correction_reason: 'Wrong score entered',
                    approvals: JSON.stringify({
                        player_a: true,
                        player_b: false,
                        coach_a: null,
                        coach_b: null,
                    }),
                    created_at: new Date().toISOString(),
                })
                .select('id, corrects_match_id, correction_reason')
                .single();

            expect(error).toBeNull();
            expect(data.corrects_match_id).toBe(MATCH2_ID);
            expect(data.correction_reason).toBe('Wrong score entered');
        });

        test('concurrent correction for same match is rejected (unique index)', async () => {
            // Second correction request for the same match should fail
            const { error } = await player2Client.from('match_requests').insert({
                player_a_id: PLAYER2_ID,
                player_b_id: PLAYER1_ID,
                club_id: CLUB_ID,
                sport_id: SPORT_ID,
                sets: [
                    { playerA: 5, playerB: 11 },
                    { playerA: 7, playerB: 11 },
                    { playerA: 9, playerB: 11 },
                ],
                match_mode: 'best-of-5',
                handicap_used: false,
                winner_id: PLAYER2_ID,
                loser_id: PLAYER1_ID,
                status: 'pending_player',
                corrects_match_id: MATCH2_ID,
                correction_reason: 'Different correction attempt',
                approvals: JSON.stringify({
                    player_a: true,
                    player_b: false,
                    coach_a: null,
                    coach_b: null,
                }),
                created_at: new Date().toISOString(),
            });

            // Should fail due to idx_one_pending_correction unique partial index
            expect(error).not.toBeNull();
            expect(error.message).toContain('idx_one_pending_correction');
        });
    });
});
