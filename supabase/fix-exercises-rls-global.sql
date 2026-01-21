-- ============================================
-- Fix exercises RLS policies to allow global exercises
-- Global exercises have club_id = NULL and can be created by admins
-- ============================================

-- Drop existing exercise policies
DROP POLICY IF EXISTS exercises_select ON exercises;
DROP POLICY IF EXISTS exercises_insert ON exercises;
DROP POLICY IF EXISTS exercises_update ON exercises;
DROP POLICY IF EXISTS exercises_delete ON exercises;

-- SELECT: Users can see global exercises OR exercises from their club
CREATE POLICY exercises_select ON exercises FOR SELECT
    USING (
        -- Global exercises (club_id is NULL) are visible to everyone
        club_id IS NULL
        -- OR exercises from user's own club
        OR club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
    );

-- INSERT: Admins can create any exercise, coaches only for their club
CREATE POLICY exercises_insert ON exercises FOR INSERT
    WITH CHECK (
        -- Admins can create global exercises (club_id IS NULL) or any club exercise
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role = 'admin'
        )
        -- OR coaches/head_coaches can create exercises for their own club only
        OR (
            club_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE id = (SELECT auth.uid())
                AND club_id = exercises.club_id
                AND role IN ('coach', 'head_coach')
            )
        )
    );

-- UPDATE: Admins can update any exercise, coaches only their club's exercises
CREATE POLICY exercises_update ON exercises FOR UPDATE
    USING (
        -- Admins can update any exercise
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role = 'admin'
        )
        -- OR coaches/head_coaches can update exercises for their own club
        OR (
            club_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE id = (SELECT auth.uid())
                AND club_id = exercises.club_id
                AND role IN ('coach', 'head_coach')
            )
        )
    );

-- DELETE: Admins can delete any exercise, coaches only their club's exercises
CREATE POLICY exercises_delete ON exercises FOR DELETE
    USING (
        -- Admins can delete any exercise
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role = 'admin'
        )
        -- OR coaches/head_coaches can delete exercises for their own club
        OR (
            club_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM profiles
                WHERE id = (SELECT auth.uid())
                AND club_id = exercises.club_id
                AND role IN ('coach', 'head_coach')
            )
        )
    );

-- ============================================
-- Done! Run this SQL in Supabase SQL Editor
-- ============================================
SELECT 'exercises RLS policies updated to allow global exercises!' as result;
