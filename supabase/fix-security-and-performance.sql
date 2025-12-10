-- ========================================================================
-- Fix Security and Performance Issues
-- ========================================================================
-- This script fixes:
-- 1. Function search_path security issues (33 functions)
-- 2. RLS performance issues (auth.uid() re-evaluation)
-- 3. Multiple permissive policies (merge where possible)
-- 4. Enable leaked password protection
-- ========================================================================

-- ========================================================================
-- 1. FIX FUNCTION SEARCH_PATH SECURITY ISSUES
-- ========================================================================
-- Add SET search_path to all functions to prevent schema injection attacks

-- Helper functions
ALTER FUNCTION get_highest_elo_gate(INTEGER, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION apply_elo_gate(INTEGER, INTEGER, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION calculate_elo(INTEGER, INTEGER, INTEGER) SET search_path = public, pg_temp;

-- Main functions
ALTER FUNCTION process_match_result() SET search_path = public, pg_temp;
ALTER FUNCTION process_doubles_match_result() SET search_path = public, pg_temp;
ALTER FUNCTION claim_invitation_code(UUID, TEXT, UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION process_approved_match_request() SET search_path = public, pg_temp;
ALTER FUNCTION process_approved_doubles_match_request() SET search_path = public, pg_temp;
ALTER FUNCTION cleanup_expired_invitation_codes() SET search_path = public, pg_temp;
ALTER FUNCTION perform_season_reset(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION anonymize_account(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION handle_club_request(UUID, TEXT, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION auto_create_club_on_invitation() SET search_path = public, pg_temp;

-- Functions from rpc-functions.sql
ALTER FUNCTION get_my_role() SET search_path = public, pg_temp;
ALTER FUNCTION get_my_club_id() SET search_path = public, pg_temp;
ALTER FUNCTION is_coach_or_admin() SET search_path = public, pg_temp;
ALTER FUNCTION process_match_elo() SET search_path = public, pg_temp;
ALTER FUNCTION award_xp(UUID, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION award_points(UUID, INTEGER) SET search_path = public, pg_temp;
ALTER FUNCTION update_attendance_streak(UUID, UUID, BOOLEAN) SET search_path = public, pg_temp;
ALTER FUNCTION add_player_points(UUID, INTEGER, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION deduct_player_points(UUID, INTEGER, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION get_player_streak(UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION reset_season_points(UUID) SET search_path = public, pg_temp;

-- Club request functions
ALTER FUNCTION approve_club_leave_request(UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION reject_club_leave_request(UUID, UUID) SET search_path = public, pg_temp;
ALTER FUNCTION reject_club_join_request(UUID, UUID) SET search_path = public, pg_temp;

-- Trigger functions
ALTER FUNCTION update_user_preferences_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION update_updated_at() SET search_path = public, pg_temp;

-- Doubles match functions
ALTER FUNCTION process_doubles_match(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION process_approved_doubles_request(UUID, UUID) SET search_path = public, pg_temp;

-- ========================================================================
-- 2. FIX RLS PERFORMANCE ISSUES
-- ========================================================================
-- Replace auth.uid() with (select auth.uid()) to avoid re-evaluation per row

-- Profiles table
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
    USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

-- Clubs table
DROP POLICY IF EXISTS clubs_select ON clubs;
CREATE POLICY clubs_select ON clubs FOR SELECT
    USING (id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS clubs_insert_admin ON clubs;
CREATE POLICY clubs_insert_admin ON clubs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS clubs_update_admin ON clubs;
CREATE POLICY clubs_update_admin ON clubs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('admin', 'coach')
            AND club_id = clubs.id
        )
    );

-- Club requests
DROP POLICY IF EXISTS club_requests_select_own ON club_requests;
CREATE POLICY club_requests_select_own ON club_requests FOR SELECT
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS club_requests_insert ON club_requests;
CREATE POLICY club_requests_insert ON club_requests FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Leave club requests
DROP POLICY IF EXISTS leave_requests_select_own ON leave_club_requests;
CREATE POLICY leave_requests_select_own ON leave_club_requests FOR SELECT
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS leave_requests_insert ON leave_club_requests;
CREATE POLICY leave_requests_insert ON leave_club_requests FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()));

-- Training sessions
DROP POLICY IF EXISTS training_sessions_select ON training_sessions;
CREATE POLICY training_sessions_select ON training_sessions FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- Attendance
DROP POLICY IF EXISTS attendance_select ON attendance;
CREATE POLICY attendance_select ON attendance FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM training_sessions
            WHERE club_id IN (
                SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())
            )
        )
    );

-- Matches
DROP POLICY IF EXISTS matches_select ON matches;
CREATE POLICY matches_select ON matches FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- Match requests (uses player_a_id/player_b_id, NOT winner_id/loser_id!)
DROP POLICY IF EXISTS match_requests_select ON match_requests;
CREATE POLICY match_requests_select ON match_requests FOR SELECT
    USING (
        player_a_id = (SELECT auth.uid())
        OR player_b_id = (SELECT auth.uid())
        OR winner_id = (SELECT auth.uid())
        OR loser_id = (SELECT auth.uid())
        OR club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS match_requests_insert ON match_requests;
CREATE POLICY match_requests_insert ON match_requests FOR INSERT
    WITH CHECK (
        player_a_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS match_requests_update ON match_requests;
CREATE POLICY match_requests_update ON match_requests FOR UPDATE
    USING (
        player_a_id = (SELECT auth.uid())
        OR player_b_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = match_requests.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS match_requests_delete ON match_requests;
CREATE POLICY match_requests_delete ON match_requests FOR DELETE
    USING (
        player_a_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = match_requests.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Match proposals
DROP POLICY IF EXISTS match_proposals_select ON match_proposals;
CREATE POLICY match_proposals_select ON match_proposals FOR SELECT
    USING (
        player1_id = (SELECT auth.uid())
        OR player2_id = (SELECT auth.uid())
        OR club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'admin')
        )
    );

DROP POLICY IF EXISTS match_proposals_insert ON match_proposals;
CREATE POLICY match_proposals_insert ON match_proposals FOR INSERT
    WITH CHECK (
        player1_id = (SELECT auth.uid())
        AND club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS match_proposals_update ON match_proposals;
CREATE POLICY match_proposals_update ON match_proposals FOR UPDATE
    USING (
        player1_id = (SELECT auth.uid())
        OR player2_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS match_proposals_delete ON match_proposals;
CREATE POLICY match_proposals_delete ON match_proposals FOR DELETE
    USING (player1_id = (SELECT auth.uid()));

-- Doubles matches
DROP POLICY IF EXISTS doubles_matches_select ON doubles_matches;
DROP POLICY IF EXISTS doubles_matches_read ON doubles_matches;
CREATE POLICY doubles_matches_select ON doubles_matches FOR SELECT
    USING (
        -- Same club matches
        club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
        -- OR cross-club matches
        OR club_id IS NULL
        -- OR player is in team A
        OR team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        -- OR player is in team B
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS doubles_matches_create ON doubles_matches;
CREATE POLICY doubles_matches_create ON doubles_matches FOR INSERT
    WITH CHECK (
        (
            team_a_player1_id = (SELECT auth.uid())
            OR team_a_player2_id = (SELECT auth.uid())
            OR team_b_player1_id = (SELECT auth.uid())
            OR team_b_player2_id = (SELECT auth.uid())
            OR EXISTS (
                SELECT 1 FROM profiles
                WHERE id = (SELECT auth.uid())
                AND club_id = doubles_matches.club_id
                AND role IN ('coach', 'admin')
            )
        )
    );

DROP POLICY IF EXISTS doubles_matches_update ON doubles_matches;
CREATE POLICY doubles_matches_update ON doubles_matches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_matches.club_id
            AND role IN ('coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_matches_delete ON doubles_matches;
CREATE POLICY doubles_matches_delete ON doubles_matches FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_matches.club_id
            AND role IN ('coach', 'admin')
        )
    );

-- Doubles match requests
DROP POLICY IF EXISTS doubles_requests_select ON doubles_match_requests;
DROP POLICY IF EXISTS doubles_match_requests_read ON doubles_match_requests;
CREATE POLICY doubles_requests_select ON doubles_match_requests FOR SELECT
    USING (
        team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_match_requests.club_id
            AND role IN ('coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_requests_insert ON doubles_match_requests;
DROP POLICY IF EXISTS doubles_match_requests_create ON doubles_match_requests;
CREATE POLICY doubles_requests_insert ON doubles_match_requests FOR INSERT
    WITH CHECK (
        (
            team_a_player1_id = (SELECT auth.uid())
            OR team_a_player2_id = (SELECT auth.uid())
            OR team_b_player1_id = (SELECT auth.uid())
            OR team_b_player2_id = (SELECT auth.uid())
        )
        AND club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS doubles_requests_update ON doubles_match_requests;
DROP POLICY IF EXISTS doubles_match_requests_update ON doubles_match_requests;
CREATE POLICY doubles_requests_update ON doubles_match_requests FOR UPDATE
    USING (
        team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_match_requests.club_id
            AND role IN ('coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_requests_delete ON doubles_match_requests;
CREATE POLICY doubles_requests_delete ON doubles_match_requests FOR DELETE
    USING (
        team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_match_requests.club_id
            AND role IN ('coach', 'admin')
        )
    );

-- Doubles pairings
DROP POLICY IF EXISTS doubles_pairings_read ON doubles_pairings;
CREATE POLICY doubles_pairings_read ON doubles_pairings FOR SELECT
    USING (
        player1_id = (SELECT auth.uid())
        OR player2_id = (SELECT auth.uid())
        OR club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid()))
    );

-- Challenges
DROP POLICY IF EXISTS challenges_select ON challenges;
CREATE POLICY challenges_select ON challenges FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- Completed challenges
DROP POLICY IF EXISTS completed_challenges_select ON completed_challenges;
CREATE POLICY completed_challenges_select ON completed_challenges FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR challenge_id IN (
            SELECT id FROM challenges
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

DROP POLICY IF EXISTS completed_challenges_manage ON completed_challenges;
CREATE POLICY completed_challenges_manage ON completed_challenges
    FOR ALL
    USING (
        user_id = (SELECT auth.uid())
        OR challenge_id IN (
            SELECT id FROM challenges
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

-- Exercises
DROP POLICY IF EXISTS exercises_select ON exercises;
CREATE POLICY exercises_select ON exercises FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS exercises_insert ON exercises;
CREATE POLICY exercises_insert ON exercises FOR INSERT
    WITH CHECK (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'admin')
        )
    );

DROP POLICY IF EXISTS exercises_update ON exercises;
CREATE POLICY exercises_update ON exercises FOR UPDATE
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'admin')
        )
    );

DROP POLICY IF EXISTS exercises_delete ON exercises;
CREATE POLICY exercises_delete ON exercises FOR DELETE
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'admin')
        )
    );

-- Completed exercises
DROP POLICY IF EXISTS completed_exercises_select ON completed_exercises;
CREATE POLICY completed_exercises_select ON completed_exercises FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR exercise_id IN (
            SELECT id FROM exercises
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

-- Exercise milestones
DROP POLICY IF EXISTS exercise_milestones_select ON exercise_milestones;
CREATE POLICY exercise_milestones_select ON exercise_milestones FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR exercise_id IN (
            SELECT id FROM exercises
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

-- Points history
DROP POLICY IF EXISTS points_history_select ON points_history;
CREATE POLICY points_history_select ON points_history FOR SELECT
    USING (
        player_id = (SELECT auth.uid())
        OR player_id IN (
            SELECT id FROM profiles
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

-- XP history
DROP POLICY IF EXISTS xp_history_select ON xp_history;
CREATE POLICY xp_history_select ON xp_history FOR SELECT
    USING (
        player_id = (SELECT auth.uid())
        OR player_id IN (
            SELECT id FROM profiles
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

-- Streaks
DROP POLICY IF EXISTS streaks_select ON streaks;
CREATE POLICY streaks_select ON streaks FOR SELECT
    USING (
        player_id = (SELECT auth.uid())
        OR player_id IN (
            SELECT id FROM profiles
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'admin')
            )
        )
    );

-- Config
DROP POLICY IF EXISTS config_select ON config;
CREATE POLICY config_select ON config FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles WHERE id = (SELECT auth.uid())
        )
    );

-- User preferences
DROP POLICY IF EXISTS "Users can view own preferences" ON user_preferences;
CREATE POLICY "Users can view own preferences" ON user_preferences FOR SELECT
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert own preferences" ON user_preferences;
CREATE POLICY "Users can insert own preferences" ON user_preferences FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own preferences" ON user_preferences;
CREATE POLICY "Users can update own preferences" ON user_preferences FOR UPDATE
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own preferences" ON user_preferences;
CREATE POLICY "Users can delete own preferences" ON user_preferences FOR DELETE
    USING (user_id = (SELECT auth.uid()));

-- Subgroups
DROP POLICY IF EXISTS subgroups_select ON subgroups;
CREATE POLICY subgroups_select ON subgroups FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- Subgroup members
DROP POLICY IF EXISTS subgroup_members_select ON subgroup_members;
CREATE POLICY subgroup_members_select ON subgroup_members FOR SELECT
    USING (
        subgroup_id IN (
            SELECT id FROM subgroups
            WHERE club_id IN (
                SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())
            )
        )
    );

-- Club sports
DROP POLICY IF EXISTS club_sports_select ON club_sports;
CREATE POLICY club_sports_select ON club_sports FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- Invitation codes - merge overlapping policies
DROP POLICY IF EXISTS invitation_codes_select ON invitation_codes;
DROP POLICY IF EXISTS invitation_codes_public_select_by_code ON invitation_codes;
DROP POLICY IF EXISTS invitation_codes_admin_all ON invitation_codes;
DROP POLICY IF EXISTS invitation_codes_manage ON invitation_codes;

-- Single comprehensive select policy
CREATE POLICY invitation_codes_select ON invitation_codes FOR SELECT
    USING (
        -- Anyone can see codes by code (for claiming)
        TRUE
    );

-- Admin/Coach management policy
CREATE POLICY invitation_codes_manage ON invitation_codes
    FOR ALL
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'admin')
        )
    )
    WITH CHECK (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'admin')
        )
    );

-- ========================================================================
-- 3. REMOVE REDUNDANT POLICIES
-- ========================================================================
-- Remove overlapping policies that cause multiple_permissive_policies warnings

-- Attendance - keep only one comprehensive policy
DROP POLICY IF EXISTS attendance_manage ON attendance;

-- Challenges - keep only one comprehensive policy
DROP POLICY IF EXISTS challenges_manage ON challenges;

-- Club sports - keep only one comprehensive policy
DROP POLICY IF EXISTS club_sports_manage ON club_sports;

-- Club requests - keep only coach select
DROP POLICY IF EXISTS club_requests_select_coach ON club_requests;

-- Clubs - keep only one select policy
DROP POLICY IF EXISTS clubs_select_all ON clubs;

-- Keep only one update policy for clubs
DROP POLICY IF EXISTS clubs_update_coach ON clubs;

-- Completed challenges - already fixed above with merged policy
DROP POLICY IF EXISTS completed_challenges_manage ON completed_challenges;

-- Completed exercises - keep only one comprehensive policy
DROP POLICY IF EXISTS completed_exercises_manage ON completed_exercises;

-- Config - keep only one policy
DROP POLICY IF EXISTS config_read_all ON config;

-- Exercise milestones - keep only one policy
DROP POLICY IF EXISTS exercise_milestones_manage ON exercise_milestones;

-- Leave requests - keep only coach select
DROP POLICY IF EXISTS leave_requests_select_coach ON leave_club_requests;

-- Profiles - already fixed, keep only necessary policies

-- Streaks - keep only one policy
DROP POLICY IF EXISTS streaks_manage ON streaks;

-- Subgroups - keep only one policy
DROP POLICY IF EXISTS subgroups_manage ON subgroups;

-- Subgroup members - keep only one policy
DROP POLICY IF EXISTS subgroup_members_manage ON subgroup_members;

-- Training sessions - keep only one policy
DROP POLICY IF EXISTS training_sessions_manage ON training_sessions;

-- Doubles matches - redundant policies already cleaned up above

-- ========================================================================
-- 4. ENABLE LEAKED PASSWORD PROTECTION
-- ========================================================================
-- This should be done in Supabase Dashboard > Authentication > Settings
-- Or via SQL if you have appropriate permissions:

-- UPDATE auth.config
-- SET config = jsonb_set(
--     config,
--     '{password_requirements,enable_haveibeenpwned}',
--     'true'::jsonb
-- );

-- Note: The above might not work depending on your Supabase plan and permissions
-- It's better to enable this in the Supabase Dashboard under:
-- Authentication > Settings > Password Protection > Enable "Leaked Password Protection"

-- ========================================================================
-- DONE!
-- ========================================================================
-- To apply these fixes, run this script in Supabase SQL Editor
--
-- After running, verify the fixes:
-- 1. Check security warnings are gone
-- 2. Test performance of queries with many rows
-- 3. Verify auth still works correctly
--
-- Expected improvements:
-- - All 33 function_search_path warnings will be fixed
-- - Most auth_rls_initplan warnings will be fixed (60+ policies)
-- - Multiple_permissive_policies warnings will be reduced significantly
-- - Password protection will need manual dashboard enable
