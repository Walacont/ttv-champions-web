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

-- ============================================
-- HELPER VIEW: Clubs with coaches for a sport
-- ============================================
-- Returns clubs that have at least one coach for a specific sport

CREATE OR REPLACE VIEW clubs_with_sport AS
SELECT DISTINCT
    pcs.sport_id,
    c.id as club_id,
    c.name as club_name,
    s.display_name as sport_name,
    (SELECT COUNT(*) FROM profile_club_sports
     WHERE club_id = c.id AND sport_id = pcs.sport_id) as member_count,
    (SELECT COUNT(*) FROM profile_club_sports
     WHERE club_id = c.id AND sport_id = pcs.sport_id AND role IN ('coach', 'head_coach')) as coach_count
FROM profile_club_sports pcs
JOIN clubs c ON c.id = pcs.club_id
JOIN sports s ON s.id = pcs.sport_id
WHERE pcs.role IN ('coach', 'head_coach')
  AND c.is_test_club = false;

-- ============================================
-- FUNCTION: Get clubs for a sport
-- ============================================
-- Returns all clubs that have at least one coach for the given sport

CREATE OR REPLACE FUNCTION get_clubs_for_sport(p_sport_id UUID)
RETURNS TABLE (
    club_id UUID,
    club_name TEXT,
    member_count BIGINT,
    coach_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id as club_id,
        c.name as club_name,
        (SELECT COUNT(*) FROM profile_club_sports
         WHERE club_id = c.id AND sport_id = p_sport_id)::BIGINT as member_count,
        (SELECT COUNT(*) FROM profile_club_sports
         WHERE club_id = c.id AND sport_id = p_sport_id AND role IN ('coach', 'head_coach'))::BIGINT as coach_count
    FROM clubs c
    WHERE c.is_test_club = false
      AND EXISTS (
          SELECT 1 FROM profile_club_sports pcs
          WHERE pcs.club_id = c.id
            AND pcs.sport_id = p_sport_id
            AND pcs.role IN ('coach', 'head_coach')
      )
    ORDER BY c.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
