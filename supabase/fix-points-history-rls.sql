-- Fix points_history RLS policy to include head_coach role
-- Run this in Supabase SQL Editor

-- Drop existing policy
DROP POLICY IF EXISTS points_history_select ON points_history;

-- Create updated policy that includes head_coach
CREATE POLICY points_history_select ON points_history FOR SELECT
    USING (
        -- Player can see their own history
        user_id = (SELECT auth.uid())
        -- Coaches, head_coaches, and admins can see all players in their club
        OR user_id IN (
            SELECT id FROM profiles
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- Also fix xp_history if it has the same issue
DROP POLICY IF EXISTS xp_history_select ON xp_history;

CREATE POLICY xp_history_select ON xp_history FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR user_id IN (
            SELECT id FROM profiles
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );
