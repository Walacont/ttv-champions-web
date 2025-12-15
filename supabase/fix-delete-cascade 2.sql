-- Fix foreign key constraints to allow deleting profiles
-- This script updates foreign keys that reference profiles to use ON DELETE CASCADE or ON DELETE SET NULL

-- =====================================================
-- EXERCISES TABLE
-- =====================================================
ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_created_by_fkey;
ALTER TABLE exercises ADD CONSTRAINT exercises_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_record_holder_id_fkey;
ALTER TABLE exercises ADD CONSTRAINT exercises_record_holder_id_fkey
    FOREIGN KEY (record_holder_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- MATCHES TABLE
-- =====================================================
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_winner_id_fkey;
ALTER TABLE matches ADD CONSTRAINT matches_winner_id_fkey
    FOREIGN KEY (winner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_loser_id_fkey;
ALTER TABLE matches ADD CONSTRAINT matches_loser_id_fkey
    FOREIGN KEY (loser_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_created_by_fkey;
ALTER TABLE matches ADD CONSTRAINT matches_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- MATCH_REQUESTS TABLE
-- =====================================================
ALTER TABLE match_requests DROP CONSTRAINT IF EXISTS match_requests_winner_id_fkey;
ALTER TABLE match_requests ADD CONSTRAINT match_requests_winner_id_fkey
    FOREIGN KEY (winner_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE match_requests DROP CONSTRAINT IF EXISTS match_requests_loser_id_fkey;
ALTER TABLE match_requests ADD CONSTRAINT match_requests_loser_id_fkey
    FOREIGN KEY (loser_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- DOUBLES_MATCHES TABLE
-- =====================================================
ALTER TABLE doubles_matches DROP CONSTRAINT IF EXISTS doubles_matches_created_by_fkey;
ALTER TABLE doubles_matches ADD CONSTRAINT doubles_matches_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE doubles_matches DROP CONSTRAINT IF EXISTS doubles_matches_requested_by_fkey;
ALTER TABLE doubles_matches ADD CONSTRAINT doubles_matches_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE doubles_matches DROP CONSTRAINT IF EXISTS doubles_matches_approved_by_fkey;
ALTER TABLE doubles_matches ADD CONSTRAINT doubles_matches_approved_by_fkey
    FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- TRAINING_SESSIONS TABLE
-- =====================================================
ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS training_sessions_created_by_fkey;
ALTER TABLE training_sessions ADD CONSTRAINT training_sessions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- XP_HISTORY TABLE
-- =====================================================
ALTER TABLE xp_history DROP CONSTRAINT IF EXISTS xp_history_awarded_by_fkey;
ALTER TABLE xp_history ADD CONSTRAINT xp_history_awarded_by_fkey
    FOREIGN KEY (awarded_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- INVITATION_CODES TABLE
-- =====================================================
ALTER TABLE invitation_codes DROP CONSTRAINT IF EXISTS invitation_codes_player_id_fkey;
ALTER TABLE invitation_codes ADD CONSTRAINT invitation_codes_player_id_fkey
    FOREIGN KEY (player_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE invitation_codes DROP CONSTRAINT IF EXISTS invitation_codes_used_by_fkey;
ALTER TABLE invitation_codes ADD CONSTRAINT invitation_codes_used_by_fkey
    FOREIGN KEY (used_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE invitation_codes DROP CONSTRAINT IF EXISTS invitation_codes_created_by_fkey;
ALTER TABLE invitation_codes ADD CONSTRAINT invitation_codes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- SEASONS TABLE
-- =====================================================
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_created_by_fkey;
ALTER TABLE seasons ADD CONSTRAINT seasons_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- =====================================================
-- Done!
-- =====================================================
-- After running this script, you can delete profiles and:
-- - Related data in CASCADE tables will be automatically deleted
-- - created_by, reviewed_by, etc. fields will be set to NULL
