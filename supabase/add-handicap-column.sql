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

-- Comments for documentation
COMMENT ON COLUMN match_requests.handicap_used IS 'Whether handicap scoring was used for this match request';
COMMENT ON COLUMN matches.handicap_used IS 'Whether handicap scoring was used for this match';
COMMENT ON COLUMN match_requests.match_mode IS 'Match format: single-set, best-of-3, best-of-5, best-of-7';
COMMENT ON COLUMN matches.match_mode IS 'Match format: single-set, best-of-3, best-of-5, best-of-7';
