-- ============================================
-- ADD SPORT_ID TO CLUB_REQUESTS
-- ============================================
-- Club requests are now sport-specific
-- A user can request to join a club for a specific sport

-- Add sport_id column to club_requests
ALTER TABLE club_requests
    ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id) ON DELETE CASCADE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_club_requests_sport ON club_requests(sport_id);

-- Add sport_id column to leave_club_requests
ALTER TABLE leave_club_requests
    ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id) ON DELETE CASCADE;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_leave_club_requests_sport ON leave_club_requests(sport_id);
