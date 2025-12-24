-- Add tournament_match_id to match_requests for linking tournament matches
-- This allows match requests to be associated with tournament matches

ALTER TABLE match_requests
ADD COLUMN tournament_match_id UUID REFERENCES tournament_matches(id) ON DELETE SET NULL;

CREATE INDEX idx_match_requests_tournament_match ON match_requests(tournament_match_id);

COMMENT ON COLUMN match_requests.tournament_match_id IS 'Links this match request to a tournament match if applicable';
