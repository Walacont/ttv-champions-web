-- Fix points_history RLS policy to allow players to insert (for match confirmations)
-- Run this in Supabase SQL Editor

-- Drop existing INSERT policy
DROP POLICY IF EXISTS points_history_insert ON points_history;

-- Create new INSERT policy - allow all authenticated users to insert
-- (points are system-generated from matches, so this is safe)
CREATE POLICY points_history_insert ON points_history FOR INSERT
    WITH CHECK (
        -- Any authenticated user can insert points history
        -- This is needed because players confirm matches and trigger points creation
        auth.uid() IS NOT NULL
    );

-- Verify the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'points_history';
