-- Add match_mode column to doubles_matches table
-- This was missing - singles matches have it but doubles didn't

ALTER TABLE doubles_matches
ADD COLUMN IF NOT EXISTS match_mode VARCHAR(50) DEFAULT 'best-of-5';

ALTER TABLE doubles_matches
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

COMMENT ON COLUMN doubles_matches.match_mode IS 'Match format: single-set, best-of-3, best-of-5, best-of-7';
COMMENT ON COLUMN doubles_matches.handicap_used IS 'Whether handicap scoring was used for this match';
