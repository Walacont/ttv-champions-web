-- Fix match_requests RLS policies to use correct column names
-- The policies in fix-security-and-performance.sql incorrectly use winner_id/loser_id
-- but match_requests uses player_a_id/player_b_id for the players involved

-- ============================================
-- MATCH REQUESTS - SELECT
-- ============================================
DROP POLICY IF EXISTS match_requests_select ON match_requests;
CREATE POLICY match_requests_select ON match_requests FOR SELECT
    USING (
        -- Players can see their own requests (as player A or B)
        player_a_id = (SELECT auth.uid())
        OR player_b_id = (SELECT auth.uid())
        -- Also allow by winner/loser for backwards compatibility
        OR winner_id = (SELECT auth.uid())
        OR loser_id = (SELECT auth.uid())
        -- Coaches can see requests from their club
        OR club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- MATCH REQUESTS - INSERT
-- ============================================
DROP POLICY IF EXISTS match_requests_insert ON match_requests;
CREATE POLICY match_requests_insert ON match_requests FOR INSERT
    WITH CHECK (
        -- Only player A can create the request
        player_a_id = (SELECT auth.uid())
    );

-- ============================================
-- MATCH REQUESTS - UPDATE
-- ============================================
DROP POLICY IF EXISTS match_requests_update ON match_requests;
CREATE POLICY match_requests_update ON match_requests FOR UPDATE
    USING (
        -- Players involved can update (using player_a_id and player_b_id!)
        player_a_id = (SELECT auth.uid())
        OR player_b_id = (SELECT auth.uid())
        -- Coaches can update requests from their club
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = match_requests.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- MATCH REQUESTS - DELETE
-- ============================================
DROP POLICY IF EXISTS match_requests_delete ON match_requests;
CREATE POLICY match_requests_delete ON match_requests FOR DELETE
    USING (
        -- Only player A (creator) can delete/withdraw
        player_a_id = (SELECT auth.uid())
        -- Or coaches from the same club
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = match_requests.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );
