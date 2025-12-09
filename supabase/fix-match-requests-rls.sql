-- Fix match_requests RLS policies to use player_a_id and player_b_id
-- The current policies only check winner_id/loser_id, but players need to see
-- requests where they are player_a or player_b

-- ============================================
-- MATCH REQUESTS - SELECT
-- ============================================
DROP POLICY IF EXISTS match_requests_select ON match_requests;
CREATE POLICY match_requests_select ON match_requests FOR SELECT
    USING (
        -- Players can see their own requests (as player A or B)
        player_a_id = auth.uid()
        OR player_b_id = auth.uid()
        -- Also allow by winner/loser for backwards compatibility
        OR winner_id = auth.uid()
        OR loser_id = auth.uid()
        -- Coaches can see requests from their club
        OR club_id IN (
            SELECT p.club_id FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- MATCH REQUESTS - INSERT
-- ============================================
DROP POLICY IF EXISTS match_requests_insert ON match_requests;
CREATE POLICY match_requests_insert ON match_requests FOR INSERT
    WITH CHECK (
        -- Only player A can create the request
        player_a_id = auth.uid()
    );

-- ============================================
-- MATCH REQUESTS - UPDATE
-- ============================================
DROP POLICY IF EXISTS match_requests_update ON match_requests;
CREATE POLICY match_requests_update ON match_requests FOR UPDATE
    USING (
        -- Players involved can update
        player_a_id = auth.uid()
        OR player_b_id = auth.uid()
        -- Coaches can update requests from their club
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = match_requests.club_id
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- MATCH REQUESTS - DELETE
-- ============================================
DROP POLICY IF EXISTS match_requests_delete ON match_requests;
CREATE POLICY match_requests_delete ON match_requests FOR DELETE
    USING (
        -- Only player A (creator) can delete/withdraw
        player_a_id = auth.uid()
        -- Or coaches from the same club
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = match_requests.club_id
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );
