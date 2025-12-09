-- Add handicap_used column to match_requests table
-- This column tracks whether handicap scoring was used in a match request

ALTER TABLE match_requests
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

-- Also add to matches table if it doesn't exist
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN match_requests.handicap_used IS 'Whether handicap scoring was used for this match request';
COMMENT ON COLUMN matches.handicap_used IS 'Whether handicap scoring was used for this match';
