-- Fix points_history RLS policy to include head_coach role
-- Run this in Supabase SQL Editor

-- Ensure RLS is enabled on the table
ALTER TABLE points_history ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies first
DROP POLICY IF EXISTS points_history_select ON points_history;
DROP POLICY IF EXISTS points_history_insert ON points_history;
DROP POLICY IF EXISTS "Enable read access for users" ON points_history;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON points_history;
DROP POLICY IF EXISTS "points_history_select_policy" ON points_history;
DROP POLICY IF EXISTS "points_history_insert_policy" ON points_history;

-- Create simple SELECT policy - coaches can see all in their club
CREATE POLICY points_history_select ON points_history FOR SELECT
    USING (
        -- Player can see their own history
        user_id = (SELECT auth.uid())
        -- OR user is coach/head_coach/admin (can see all)
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND profiles.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Create simple INSERT policy - coaches/head_coaches/admins can insert
CREATE POLICY points_history_insert ON points_history FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND profiles.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Also fix xp_history if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xp_history') THEN
        ALTER TABLE xp_history ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS xp_history_select ON xp_history;
        DROP POLICY IF EXISTS xp_history_insert ON xp_history;

        CREATE POLICY xp_history_select ON xp_history FOR SELECT
            USING (
                user_id = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = (SELECT auth.uid())
                    AND profiles.role IN ('coach', 'head_coach', 'admin')
                )
            );

        CREATE POLICY xp_history_insert ON xp_history FOR INSERT
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = (SELECT auth.uid())
                    AND profiles.role IN ('coach', 'head_coach', 'admin')
                )
            );
    END IF;
END $$;
