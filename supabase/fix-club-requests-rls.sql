-- ============================================
-- FIX CLUB REQUESTS RLS POLICIES
-- ============================================
-- Problem: The existing policies use 'user_id' but the table has 'player_id'
-- Also missing: Coach policy to view club's requests
-- ============================================

-- Enable RLS if not already enabled
ALTER TABLE club_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_club_requests ENABLE ROW LEVEL SECURITY;

-- ============================================
-- DROP ALL EXISTING POLICIES (comprehensive list)
-- ============================================

-- club_requests - drop ALL possible policy names
DROP POLICY IF EXISTS "club_requests_select_own" ON club_requests;
DROP POLICY IF EXISTS "club_requests_select_coach" ON club_requests;
DROP POLICY IF EXISTS "club_requests_select" ON club_requests;
DROP POLICY IF EXISTS "club_requests_insert" ON club_requests;
DROP POLICY IF EXISTS "club_requests_update" ON club_requests;
DROP POLICY IF EXISTS "club_requests_delete" ON club_requests;
DROP POLICY IF EXISTS "club_requests_all" ON club_requests;
DROP POLICY IF EXISTS "Enable read access for own requests" ON club_requests;
DROP POLICY IF EXISTS "Enable insert for own requests" ON club_requests;

-- leave_club_requests - drop ALL possible policy names
DROP POLICY IF EXISTS "leave_requests_select_own" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_requests_select_coach" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_requests_select" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_requests_insert" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_requests_update" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_requests_delete" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_requests_all" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_club_requests_select_own" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_club_requests_select_coach" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_club_requests_insert" ON leave_club_requests;
DROP POLICY IF EXISTS "leave_club_requests_delete" ON leave_club_requests;

-- ============================================
-- CLUB_REQUESTS POLICIES
-- ============================================

-- Players can see their own requests
CREATE POLICY club_requests_select_own ON club_requests FOR SELECT
    USING (player_id = auth.uid());

-- Coaches/Head Coaches can see all requests for their club
CREATE POLICY club_requests_select_coach ON club_requests FOR SELECT
    USING (
        club_id IN (
            SELECT p.club_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Players can insert their own requests
CREATE POLICY club_requests_insert ON club_requests FOR INSERT
    WITH CHECK (player_id = auth.uid());

-- Players can delete their own pending requests (withdraw)
CREATE POLICY club_requests_delete ON club_requests FOR DELETE
    USING (player_id = auth.uid() AND status = 'pending');

-- ============================================
-- LEAVE_CLUB_REQUESTS POLICIES
-- ============================================

-- Players can see their own leave requests
CREATE POLICY leave_requests_select_own ON leave_club_requests FOR SELECT
    USING (player_id = auth.uid());

-- Coaches/Head Coaches can see all leave requests for their club
CREATE POLICY leave_requests_select_coach ON leave_club_requests FOR SELECT
    USING (
        club_id IN (
            SELECT p.club_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Players can insert their own leave requests
CREATE POLICY leave_requests_insert ON leave_club_requests FOR INSERT
    WITH CHECK (player_id = auth.uid());

-- Players can delete their own pending requests (withdraw)
CREATE POLICY leave_requests_delete ON leave_club_requests FOR DELETE
    USING (player_id = auth.uid() AND status = 'pending');

-- ============================================
-- VERIFICATION
-- ============================================
-- After running this, verify with:
-- SELECT * FROM pg_policies WHERE tablename IN ('club_requests', 'leave_club_requests');
