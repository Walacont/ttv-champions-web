-- ============================================
-- Fix head_coach permissions in all RLS policies
-- head_coach should have ALL permissions that coach has
-- ============================================
-- Run this in Supabase SQL Editor

-- ============================================
-- CLUBS
-- ============================================
DROP POLICY IF EXISTS clubs_update_admin ON clubs;
CREATE POLICY clubs_update_admin ON clubs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('admin', 'coach', 'head_coach')
            AND club_id = clubs.id
        )
    );

-- ============================================
-- MATCH REQUESTS
-- ============================================
DROP POLICY IF EXISTS match_requests_select ON match_requests;
CREATE POLICY match_requests_select ON match_requests FOR SELECT
    USING (
        winner_id = (SELECT auth.uid())
        OR loser_id = (SELECT auth.uid())
        OR club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS match_requests_update ON match_requests;
CREATE POLICY match_requests_update ON match_requests FOR UPDATE
    USING (
        winner_id = (SELECT auth.uid())
        OR loser_id = (SELECT auth.uid())
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
        winner_id = (SELECT auth.uid())
        OR loser_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = match_requests.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- MATCH PROPOSALS
-- ============================================
DROP POLICY IF EXISTS match_proposals_select ON match_proposals;
CREATE POLICY match_proposals_select ON match_proposals FOR SELECT
    USING (
        requester_id = (SELECT auth.uid())
        OR recipient_id = (SELECT auth.uid())
        OR club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- DOUBLES MATCHES
-- ============================================
DROP POLICY IF EXISTS doubles_matches_create ON doubles_matches;
CREATE POLICY doubles_matches_create ON doubles_matches FOR INSERT
    WITH CHECK (
        team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_matches.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_matches_update ON doubles_matches;
CREATE POLICY doubles_matches_update ON doubles_matches FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_matches.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_matches_delete ON doubles_matches;
CREATE POLICY doubles_matches_delete ON doubles_matches FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_matches.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- DOUBLES MATCH REQUESTS
-- ============================================
DROP POLICY IF EXISTS doubles_requests_select ON doubles_match_requests;
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
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_requests_insert ON doubles_match_requests;
CREATE POLICY doubles_requests_insert ON doubles_match_requests FOR INSERT
    WITH CHECK (
        team_a_player1_id = (SELECT auth.uid())
        OR team_a_player2_id = (SELECT auth.uid())
        OR team_b_player1_id = (SELECT auth.uid())
        OR team_b_player2_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = doubles_match_requests.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS doubles_requests_update ON doubles_match_requests;
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
            AND role IN ('coach', 'head_coach', 'admin')
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
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- CHALLENGES
-- ============================================
DROP POLICY IF EXISTS challenges_insert ON challenges;
CREATE POLICY challenges_insert ON challenges FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS challenges_update ON challenges;
CREATE POLICY challenges_update ON challenges FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS challenges_delete ON challenges;
CREATE POLICY challenges_delete ON challenges FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = challenges.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- TRAINING SESSIONS
-- ============================================
DROP POLICY IF EXISTS training_sessions_insert ON training_sessions;
CREATE POLICY training_sessions_insert ON training_sessions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = training_sessions.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS training_sessions_update ON training_sessions;
CREATE POLICY training_sessions_update ON training_sessions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = training_sessions.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS training_sessions_delete ON training_sessions;
CREATE POLICY training_sessions_delete ON training_sessions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = training_sessions.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- ATTENDANCE
-- ============================================
DROP POLICY IF EXISTS attendance_insert ON attendance;
CREATE POLICY attendance_insert ON attendance FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM training_sessions ts
            JOIN profiles p ON p.club_id = ts.club_id
            WHERE ts.id = attendance.session_id
            AND p.id = (SELECT auth.uid())
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS attendance_update ON attendance;
CREATE POLICY attendance_update ON attendance FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM training_sessions ts
            JOIN profiles p ON p.club_id = ts.club_id
            WHERE ts.id = attendance.session_id
            AND p.id = (SELECT auth.uid())
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS attendance_delete ON attendance;
CREATE POLICY attendance_delete ON attendance FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM training_sessions ts
            JOIN profiles p ON p.club_id = ts.club_id
            WHERE ts.id = attendance.session_id
            AND p.id = (SELECT auth.uid())
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- MATCHES (Create/Update/Delete)
-- ============================================
DROP POLICY IF EXISTS matches_insert ON matches;
CREATE POLICY matches_insert ON matches FOR INSERT
    WITH CHECK (
        player_a_id = (SELECT auth.uid())
        OR player_b_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = matches.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS matches_update ON matches;
CREATE POLICY matches_update ON matches FOR UPDATE
    USING (
        player_a_id = (SELECT auth.uid())
        OR player_b_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = matches.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS matches_delete ON matches;
CREATE POLICY matches_delete ON matches FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = matches.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- INVITATION CODES
-- ============================================
DROP POLICY IF EXISTS invitation_codes_insert ON invitation_codes;
CREATE POLICY invitation_codes_insert ON invitation_codes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = invitation_codes.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS invitation_codes_update ON invitation_codes;
CREATE POLICY invitation_codes_update ON invitation_codes FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = invitation_codes.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS invitation_codes_delete ON invitation_codes;
CREATE POLICY invitation_codes_delete ON invitation_codes FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND club_id = invitation_codes.club_id
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- STREAKS
-- ============================================
DROP POLICY IF EXISTS streaks_insert ON streaks;
CREATE POLICY streaks_insert ON streaks FOR INSERT
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS streaks_update ON streaks;
CREATE POLICY streaks_update ON streaks FOR UPDATE
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles p
            JOIN profiles target ON target.id = streaks.user_id
            WHERE p.id = (SELECT auth.uid())
            AND p.club_id = target.club_id
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- COMPLETED EXERCISES
-- ============================================
DROP POLICY IF EXISTS completed_exercises_insert ON completed_exercises;
CREATE POLICY completed_exercises_insert ON completed_exercises FOR INSERT
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- COMPLETED CHALLENGES
-- ============================================
DROP POLICY IF EXISTS completed_challenges_insert ON completed_challenges;
CREATE POLICY completed_challenges_insert ON completed_challenges FOR INSERT
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- EXERCISE MILESTONES
-- ============================================
DROP POLICY IF EXISTS exercise_milestones_insert ON exercise_milestones;
CREATE POLICY exercise_milestones_insert ON exercise_milestones FOR INSERT
    WITH CHECK (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS exercise_milestones_update ON exercise_milestones;
CREATE POLICY exercise_milestones_update ON exercise_milestones FOR UPDATE
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- PLAYER POINTS
-- ============================================
DROP POLICY IF EXISTS player_points_insert ON player_points;
CREATE POLICY player_points_insert ON player_points FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

DROP POLICY IF EXISTS player_points_update ON player_points;
CREATE POLICY player_points_update ON player_points FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- POINTS HISTORY (already fixed separately)
-- ============================================
-- See fix-points-history-rls.sql

-- ============================================
-- XP HISTORY (already fixed separately)
-- ============================================
-- See fix-points-history-rls.sql

-- ============================================
-- Done!
-- ============================================
SELECT 'head_coach permissions updated successfully!' as result;
