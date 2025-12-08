-- Fix points_history RLS policy to include head_coach role
-- Run this in Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS points_history_select ON points_history;
DROP POLICY IF EXISTS points_history_insert ON points_history;

-- Create SELECT policy
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

-- Create INSERT policy - coaches/head_coaches/admins can insert for players in their club
CREATE POLICY points_history_insert ON points_history FOR INSERT
    WITH CHECK (
        -- Coaches, head_coaches, and admins can insert points for players in their club
        EXISTS (
            SELECT 1 FROM profiles coach
            WHERE coach.id = (SELECT auth.uid())
            AND coach.role IN ('coach', 'head_coach', 'admin')
            AND coach.club_id IN (
                SELECT club_id FROM profiles WHERE id = points_history.user_id
            )
        )
        -- Or it's the player's own entry (for system-generated entries)
        OR user_id = (SELECT auth.uid())
    );

-- Also fix xp_history if it has the same issue
DROP POLICY IF EXISTS xp_history_select ON xp_history;
DROP POLICY IF EXISTS xp_history_insert ON xp_history;

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

CREATE POLICY xp_history_insert ON xp_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles coach
            WHERE coach.id = (SELECT auth.uid())
            AND coach.role IN ('coach', 'head_coach', 'admin')
            AND coach.club_id IN (
                SELECT club_id FROM profiles WHERE id = xp_history.user_id
            )
        )
        OR user_id = (SELECT auth.uid())
    );
