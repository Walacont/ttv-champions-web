-- ============================================
-- Guardian Child Data Access Policies
-- ============================================
-- This migration adds RLS policies that allow guardians
-- to view their linked children's data:
-- - points_history
-- - completed_challenges
-- - notifications
-- - matches
--
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- PART 1: Points History - Guardian Access
-- ============================================

-- Drop the existing policy and recreate with guardian access included
DROP POLICY IF EXISTS points_history_select ON points_history;
DROP POLICY IF EXISTS "Guardians can view their children's points history" ON points_history;
DROP POLICY IF EXISTS points_history_guardian_select ON points_history;

-- Create combined policy for points_history
CREATE POLICY points_history_select ON points_history FOR SELECT
    USING (
        -- Player can see their own history
        user_id = auth.uid()
        -- OR user is coach/head_coach/admin (can see all)
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('coach', 'head_coach', 'admin')
        )
        -- OR user is a guardian of this child
        OR EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND guardian_links.child_id = points_history.user_id
        )
    );

-- ============================================
-- PART 2: Completed Challenges - Guardian Access
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS completed_challenges_select ON completed_challenges;
DROP POLICY IF EXISTS "Guardians can view their children's completed challenges" ON completed_challenges;

-- Create combined policy for completed_challenges
CREATE POLICY completed_challenges_select ON completed_challenges FOR SELECT
    USING (
        -- User can see their own completed challenges
        user_id = auth.uid()
        -- OR user is coach/admin in the same club (via challenge)
        OR challenge_id IN (
            SELECT id FROM challenges
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = auth.uid()
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
        -- OR user is a guardian of this child
        OR EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND guardian_links.child_id = completed_challenges.user_id
        )
    );

-- ============================================
-- PART 3: Notifications - Guardian Access
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_delete ON notifications;
DROP POLICY IF EXISTS "Guardians can view their children's notifications" ON notifications;
DROP POLICY IF EXISTS notifications_guardian_select ON notifications;
DROP POLICY IF EXISTS notifications_guardian_delete ON notifications;

-- Create combined policy for notifications SELECT
CREATE POLICY notifications_select ON notifications FOR SELECT
    USING (
        -- User can see their own notifications
        user_id = auth.uid()
        -- OR user is a guardian of this child
        OR EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND guardian_links.child_id = notifications.user_id
        )
    );

-- Create combined policy for notifications DELETE
CREATE POLICY notifications_delete ON notifications FOR DELETE
    USING (
        -- User can delete their own notifications
        user_id = auth.uid()
        -- OR notifications they created for others
        OR (data->>'player_id')::uuid = auth.uid()
        -- OR user is a guardian of this child
        OR EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND guardian_links.child_id = notifications.user_id
        )
    );

-- ============================================
-- PART 4: Matches - Guardian Access
-- ============================================

-- Drop existing guardian policy if it exists
DROP POLICY IF EXISTS "Guardians can view their children's matches" ON matches;
DROP POLICY IF EXISTS matches_guardian_select ON matches;

-- Create policy for guardians to view their children's matches
-- Note: This is an additional policy - matches likely already have policies
-- that allow viewing. Multiple SELECT policies are OR'd together.
CREATE POLICY matches_guardian_select ON matches FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND (
                guardian_links.child_id = matches.player_a_id
                OR guardian_links.child_id = matches.player_b_id
            )
        )
    );

-- ============================================
-- PART 5: XP History - Guardian Access (if exists)
-- ============================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xp_history') THEN
        DROP POLICY IF EXISTS xp_history_select ON xp_history;
        DROP POLICY IF EXISTS "Guardians can view their children's xp history" ON xp_history;

        CREATE POLICY xp_history_select ON xp_history FOR SELECT
            USING (
                user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM profiles
                    WHERE profiles.id = auth.uid()
                    AND profiles.role IN ('coach', 'head_coach', 'admin')
                )
                OR EXISTS (
                    SELECT 1 FROM guardian_links
                    WHERE guardian_links.guardian_id = auth.uid()
                    AND guardian_links.child_id = xp_history.user_id
                )
            );
    END IF;
END $$;

-- ============================================
-- PART 6: Guardian Links - Coach Access
-- ============================================

-- Add policy for coaches to read guardian_links for players in their club
DROP POLICY IF EXISTS "Coaches can view guardian links for club players" ON guardian_links;

CREATE POLICY "Coaches can view guardian links for club players" ON guardian_links FOR SELECT
    USING (
        -- Existing: Guardian can see their own links
        guardian_id = auth.uid()
        -- NEW: Coach/Head Coach/Admin can see guardian links for players in their club
        OR EXISTS (
            SELECT 1 FROM profiles AS coach
            JOIN profiles AS child ON child.id = guardian_links.child_id
            WHERE coach.id = auth.uid()
            AND coach.role IN ('coach', 'head_coach', 'admin')
            AND coach.club_id = child.club_id
        )
    );

-- ============================================
-- PART 7: Verification
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Guardian Child Data Access Policies Applied!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Guardians can now view:';
    RAISE NOTICE '  - points_history of their children';
    RAISE NOTICE '  - completed_challenges of their children';
    RAISE NOTICE '  - notifications of their children';
    RAISE NOTICE '  - matches involving their children';
    RAISE NOTICE '  - xp_history of their children (if table exists)';
    RAISE NOTICE '';
    RAISE NOTICE 'Coaches can now view:';
    RAISE NOTICE '  - guardian_links for players in their club';
    RAISE NOTICE '========================================';
END $$;
