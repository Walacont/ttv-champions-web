-- ============================================
-- Fix Challenges RLS Policies - COMPLETE VERSION
-- ============================================
-- This is the FINAL version that checks BOTH tables:
-- - profiles.role (global role: coach/head_coach/admin)
-- - profile_club_sports.role (per-sport role: coach/head_coach)
--
-- Run this in Supabase SQL Editor to fix the 403 error
-- when creating challenges.
-- ============================================

-- ============================================
-- CHALLENGES - INSERT POLICY
-- ============================================
DROP POLICY IF EXISTS challenges_insert ON challenges;
CREATE POLICY challenges_insert ON challenges FOR INSERT
    WITH CHECK (
        -- Check profiles table for global role
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
        OR
        -- Check profile_club_sports table for per-sport role
        EXISTS (
            SELECT 1 FROM profile_club_sports
            WHERE user_id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach')
        )
    );

-- ============================================
-- CHALLENGES - UPDATE POLICY
-- ============================================
DROP POLICY IF EXISTS challenges_update ON challenges;
CREATE POLICY challenges_update ON challenges FOR UPDATE
    USING (
        -- Check profiles table for global role
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
        OR
        -- Check profile_club_sports table for per-sport role
        EXISTS (
            SELECT 1 FROM profile_club_sports
            WHERE user_id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach')
        )
    );

-- ============================================
-- CHALLENGES - DELETE POLICY
-- ============================================
DROP POLICY IF EXISTS challenges_delete ON challenges;
CREATE POLICY challenges_delete ON challenges FOR DELETE
    USING (
        -- Check profiles table for global role
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
        OR
        -- Check profile_club_sports table for per-sport role
        EXISTS (
            SELECT 1 FROM profile_club_sports
            WHERE user_id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach')
        )
    );

-- ============================================
-- CHALLENGES - SELECT POLICY (allow all club members to view)
-- ============================================
DROP POLICY IF EXISTS challenges_select ON challenges;
CREATE POLICY challenges_select ON challenges FOR SELECT
    USING (
        -- Any club member can view challenges (via profiles)
        club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
        OR
        -- Any club member can view challenges (via profile_club_sports)
        club_id IN (SELECT club_id FROM profile_club_sports WHERE user_id = (SELECT auth.uid()))
    );

-- ============================================
-- Verification: Show current user's roles in both tables
-- ============================================
SELECT 'Checking your roles...' as status;

SELECT 'profiles' as source, id, club_id, role
FROM profiles
WHERE id = (SELECT auth.uid());

SELECT 'profile_club_sports' as source, user_id, club_id, role
FROM profile_club_sports
WHERE user_id = (SELECT auth.uid());

SELECT 'Challenges RLS policies updated successfully!' as result;
