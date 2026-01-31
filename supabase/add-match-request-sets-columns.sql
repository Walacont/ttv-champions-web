-- Add player_a_sets_won and player_b_sets_won to match_requests
-- These are needed so that when a match request is confirmed and creates a match,
-- the set scores are carried over correctly (used for tournament Kreuztabelle)

ALTER TABLE match_requests ADD COLUMN IF NOT EXISTS player_a_sets_won INTEGER DEFAULT 0;
ALTER TABLE match_requests ADD COLUMN IF NOT EXISTS player_b_sets_won INTEGER DEFAULT 0;
