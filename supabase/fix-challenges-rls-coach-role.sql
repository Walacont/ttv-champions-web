-- Fix Challenges RLS Policies
-- Coach role can be stored in either:
-- - profiles.role (global role: coach/head_coach/admin)
-- - profile_club_sports.role (per-sport role: coach/head_coach)
--
-- The policies need to check BOTH tables for authorization

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
        -- Any club member can view challenges
        club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
        OR
        club_id IN (SELECT club_id FROM profile_club_sports WHERE user_id = (SELECT auth.uid()))
    );
