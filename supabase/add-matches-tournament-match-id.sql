-- Add tournament_match_id to matches table (for activity feed filtering)
-- Run this if you already ran tournaments.sql before this column was added

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS tournament_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_tournament_match ON matches(tournament_match_id) WHERE tournament_match_id IS NOT NULL;
