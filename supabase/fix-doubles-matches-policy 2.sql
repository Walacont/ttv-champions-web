-- Fix doubles_matches INSERT policy to allow coaches to create matches
-- The current policy doesn't properly handle:
-- 1. Cross-club matches where club_id is NULL
-- 2. Coaches creating matches directly (not via request approval)

-- Drop existing policy
DROP POLICY IF EXISTS doubles_matches_create ON doubles_matches;

-- Create new policy that allows:
-- 1. Coaches/head_coaches/admins to insert doubles matches for their club
-- 2. Players who are part of the match to insert
-- 3. Cross-club matches (is_cross_club = true, club_id = NULL)
CREATE POLICY doubles_matches_create ON doubles_matches FOR INSERT
    WITH CHECK (
        -- Coach/head_coach/admin can create matches
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
        -- Or user is one of the players in the match
        OR team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
        -- Or created_by is the current user (for trigger-based inserts)
        OR created_by = (SELECT auth.uid())
    );

-- Also ensure UPDATE policy allows coaches to update doubles matches
DROP POLICY IF EXISTS doubles_matches_update ON doubles_matches;
CREATE POLICY doubles_matches_update ON doubles_matches FOR UPDATE
    USING (
        -- Coach/head_coach/admin from the same club can update
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
            AND (
                -- Same club
                club_id = doubles_matches.club_id
                -- Or cross-club match (admin only)
                OR (doubles_matches.club_id IS NULL AND role = 'admin')
            )
        )
    );
