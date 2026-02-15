-- TTV Champions Development Seed Data
-- TEST USERS AND DATA - NOT FOR PRODUCTION
--
-- Creates: 1 club, 1 sport, 1 season, 3 users (admin + 2 players),
-- 2 completed matches with Elo changes, H2H stats, and points history.
-- Designed for testing the match correction feature.
--
-- DO NOT run this file in production environments.

-- ==========================================
-- Deterministic UUIDs
-- ==========================================
-- Club:    c0000000-0000-0000-0000-000000000001
-- Sport:   d0000000-0000-0000-0000-000000000001
-- Season:  e0000000-0000-0000-0000-000000000001
-- Admin:   a0000000-0000-0000-0000-000000000001
-- Player1: b0000000-0000-0000-0000-000000000001
-- Player2: b0000000-0000-0000-0000-000000000002
-- Match1:  f0000000-0000-0000-0000-000000000001
-- Match2:  f0000000-0000-0000-0000-000000000002
-- H2H:     10000000-0000-0000-0000-000000000001

-- ==========================================
-- TEST USERS (auth.users + auth.identities)
-- ==========================================

-- Admin user (admin@ttv.test / adminadmin)
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  aud, role, confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'admin@ttv.test',
  crypt('adminadmin', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated', 'authenticated',
  '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'admin@ttv.test',
  '{"sub":"a0000000-0000-0000-0000-000000000001","email":"admin@ttv.test"}',
  'email', now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Player 1 (player1@ttv.test / password123)
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  aud, role, confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'player1@ttv.test',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated', 'authenticated',
  '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'player1@ttv.test',
  '{"sub":"b0000000-0000-0000-0000-000000000001","email":"player1@ttv.test"}',
  'email', now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- Player 2 (player2@ttv.test / password123)
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  aud, role, confirmation_token, recovery_token,
  email_change_token_new, email_change_token_current,
  email_change, phone_change, phone_change_token, reauthentication_token
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'player2@ttv.test',
  crypt('password123', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated', 'authenticated',
  '', '', '', '', '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002',
  'player2@ttv.test',
  '{"sub":"b0000000-0000-0000-0000-000000000002","email":"player2@ttv.test"}',
  'email', now(), now(), now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- ==========================================
-- CLUB
-- ==========================================

INSERT INTO clubs (id, name, description, created_at, updated_at)
VALUES (
  'c0000000-0000-0000-0000-000000000001',
  'TTV Test Club',
  'Test club for local development',
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- SPORT (Table Tennis)
-- ==========================================

INSERT INTO sports (id, name, display_name, icon, is_active, created_at, updated_at)
VALUES (
  'd0000000-0000-0000-0000-000000000001',
  'table_tennis',
  'Tischtennis',
  'table-tennis-paddle-ball',
  true,
  now(), now()
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- SEASON (active, Sep 2025 - Jun 2026)
-- ==========================================

INSERT INTO seasons (id, sport_id, name, start_date, end_date, is_active, created_at)
VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  '2025/2026',
  '2025-09-01',
  '2026-06-30',
  true,
  now()
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- PROFILES (linked to auth users)
-- ==========================================

-- Admin profile
INSERT INTO profiles (
  id, email, display_name, role, club_id, sport_id, active_sport_id,
  elo_rating, highest_elo, points, xp, wins, losses, singles_matches_played,
  onboarding_complete, created_at, updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'admin@ttv.test',
  'Admin User',
  'admin',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  800, 800, 0, 0, 0, 0, 0,
  true, now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Player 1 profile: won 1 match, lost 1 match → elo 800 (net zero), 2 matches played
INSERT INTO profiles (
  id, email, display_name, role, club_id, sport_id, active_sport_id,
  elo_rating, highest_elo, points, xp, wins, losses, singles_matches_played,
  onboarding_complete, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'player1@ttv.test',
  'Player One',
  'player',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  800, 816, 3, 16, 1, 1, 2,
  true, now(), now()
) ON CONFLICT (id) DO NOTHING;

-- Player 2 profile: won 1 match, lost 1 match → elo 800 (net zero), 2 matches played
INSERT INTO profiles (
  id, email, display_name, role, club_id, sport_id, active_sport_id,
  elo_rating, highest_elo, points, xp, wins, losses, singles_matches_played,
  onboarding_complete, created_at, updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'player2@ttv.test',
  'Player Two',
  'player',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  800, 816, 3, 16, 1, 1, 2,
  true, now(), now()
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- MATCHES (2 completed matches for correction testing)
-- ==========================================

-- Match 1: Player 1 beat Player 2 (3-1 sets)
-- K=32, equal elo → elo_change = 16
INSERT INTO matches (
  id, club_id, sport_id,
  player_a_id, player_b_id, winner_id, loser_id,
  sets, player_a_sets_won, player_b_sets_won,
  winner_elo_change, loser_elo_change,
  player_a_elo_before, player_b_elo_before,
  handicap_used, match_mode, processed,
  season_points_awarded,
  played_at, created_at
) VALUES (
  'f0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  '[{"playerA": 11, "playerB": 7}, {"playerA": 9, "playerB": 11}, {"playerA": 11, "playerB": 5}, {"playerA": 11, "playerB": 8}]',
  3, 1,
  16, -16,
  800, 800,
  false, 'best-of-5', true,
  3,
  '2026-01-15 14:00:00+00',
  '2026-01-15 14:00:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Match 2: Player 2 beat Player 1 (3-2 sets)
-- K=32, P1 elo 816, P2 elo 784 → elo change ~18 for underdog win
INSERT INTO matches (
  id, club_id, sport_id,
  player_a_id, player_b_id, winner_id, loser_id,
  sets, player_a_sets_won, player_b_sets_won,
  winner_elo_change, loser_elo_change,
  player_a_elo_before, player_b_elo_before,
  handicap_used, match_mode, processed,
  season_points_awarded,
  played_at, created_at
) VALUES (
  'f0000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001',
  '[{"playerA": 11, "playerB": 8}, {"playerA": 7, "playerB": 11}, {"playerA": 11, "playerB": 9}, {"playerA": 6, "playerB": 11}, {"playerA": 8, "playerB": 11}]',
  2, 3,
  16, -16,
  816, 784,
  false, 'best-of-5', true,
  3,
  '2026-02-01 16:00:00+00',
  '2026-02-01 16:00:00+00'
) ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- HEAD-TO-HEAD STATS
-- ==========================================
-- player_a_id < player_b_id (UUID ordering)
-- b0000000-...-001 < b0000000-...-002

INSERT INTO head_to_head_stats (
  id, player_a_id, player_b_id,
  player_a_wins, player_b_wins, total_matches,
  consecutive_wins, current_streak_winner_id, suggested_handicap,
  last_winner_id, last_match_at,
  created_at, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
  1, 1, 2,
  1, 'b0000000-0000-0000-0000-000000000002', 0,
  'b0000000-0000-0000-0000-000000000002',
  '2026-02-01 16:00:00+00',
  now(), now()
) ON CONFLICT (player_a_id, player_b_id) DO NOTHING;

-- ==========================================
-- POINTS HISTORY
-- ==========================================

-- Match 1: Player 1 won → +3 season points, +16 elo, +16 xp
INSERT INTO points_history (user_id, points, reason, elo_change, xp, created_at)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  3, 'Sieg gegen Player Two', 16, 16,
  '2026-01-15 14:00:00+00'
);

-- Match 1: Player 2 lost → 0 season points, -16 elo
INSERT INTO points_history (user_id, points, reason, elo_change, xp, created_at)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  0, 'Niederlage gegen Player One', -16, 0,
  '2026-01-15 14:00:00+00'
);

-- Match 2: Player 2 won → +3 season points, +16 elo, +16 xp
INSERT INTO points_history (user_id, points, reason, elo_change, xp, created_at)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  3, 'Sieg gegen Player One', 16, 16,
  '2026-02-01 16:00:00+00'
);

-- Match 2: Player 1 lost → 0 season points, -16 elo
INSERT INTO points_history (user_id, points, reason, elo_change, xp, created_at)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  0, 'Niederlage gegen Player Two', -16, 0,
  '2026-02-01 16:00:00+00'
);

-- ==========================================
-- VERIFICATION
-- ==========================================
DO $$
BEGIN
    RAISE NOTICE 'Seed data loaded:';
    RAISE NOTICE '- 3 users: admin@ttv.test (admin), player1@ttv.test, player2@ttv.test';
    RAISE NOTICE '- 1 club: TTV Test Club';
    RAISE NOTICE '- 1 sport: Tischtennis';
    RAISE NOTICE '- 1 season: 2025/2026 (active)';
    RAISE NOTICE '- 2 matches with Elo changes (for correction testing)';
    RAISE NOTICE '- H2H stats and points history';
END $$;
