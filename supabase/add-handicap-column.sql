-- Add missing columns to match_requests and matches tables

-- Add handicap_used column
ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

-- Add match_mode column (e.g., 'best-of-3', 'best-of-5', 'single-set')
ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS match_mode VARCHAR(50) DEFAULT 'best-of-5';

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS match_mode VARCHAR(50) DEFAULT 'best-of-5';

-- Add processed column (required by trigger_process_match_result)
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

-- Add wins/losses columns to profiles (required by trigger)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;

-- Add Elo change tracking columns (set by trigger)
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS winner_elo_change INTEGER;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS loser_elo_change INTEGER;

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS season_points_awarded INTEGER;

-- Comments for documentation
COMMENT ON COLUMN match_requests.handicap_used IS 'Whether handicap scoring was used for this match request';
COMMENT ON COLUMN matches.handicap_used IS 'Whether handicap scoring was used for this match';
COMMENT ON COLUMN match_requests.match_mode IS 'Match format: single-set, best-of-3, best-of-5, best-of-7';
COMMENT ON COLUMN matches.match_mode IS 'Match format: single-set, best-of-3, best-of-5, best-of-7';
COMMENT ON COLUMN matches.processed IS 'Whether the match result has been processed for Elo/stats';
COMMENT ON COLUMN matches.winner_elo_change IS 'Elo points gained by winner';
COMMENT ON COLUMN matches.loser_elo_change IS 'Elo points lost by loser';
COMMENT ON COLUMN matches.season_points_awarded IS 'Season points awarded for this match';
