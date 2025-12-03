-- Add is_test_club column to clubs table
-- This column is used to mark test/demo clubs that should not appear in:
-- - Leaderboards
-- - Club search results
-- - Match/competition player searches

ALTER TABLE clubs
ADD COLUMN IF NOT EXISTS is_test_club BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_clubs_is_test_club ON clubs(is_test_club);

COMMENT ON COLUMN clubs.is_test_club IS 'If true, this club and its players will be hidden from public listings (leaderboards, searches, competitions)';
