-- Fix subgroups RLS policies
-- The subgroups_manage policy was dropped but not replaced with INSERT/UPDATE/DELETE policies
-- Also adds head_coach to all coach-level policies

-- ============================================
-- PROFILES UPDATE POLICY FOR COACHES
-- ============================================
-- Coaches need to update subgroup_ids on player profiles in their club

DROP POLICY IF EXISTS profiles_update_coach ON profiles;
CREATE POLICY profiles_update_coach ON profiles FOR UPDATE
    USING (
        -- Coach/Head Coach can update players in their club
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    )
    WITH CHECK (
        -- Can only update profiles in their own club
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- SUBGROUPS POLICIES
-- ============================================

-- Drop old policies first
DROP POLICY IF EXISTS subgroups_select ON subgroups;
DROP POLICY IF EXISTS subgroups_manage ON subgroups;
DROP POLICY IF EXISTS subgroups_insert ON subgroups;
DROP POLICY IF EXISTS subgroups_update ON subgroups;
DROP POLICY IF EXISTS subgroups_delete ON subgroups;

-- SELECT: All club members can view subgroups
CREATE POLICY subgroups_select ON subgroups FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- INSERT: Coaches and head_coaches can create subgroups
CREATE POLICY subgroups_insert ON subgroups FOR INSERT
    WITH CHECK (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- UPDATE: Coaches and head_coaches can update subgroups
CREATE POLICY subgroups_update ON subgroups FOR UPDATE
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- DELETE: Coaches and head_coaches can delete subgroups
CREATE POLICY subgroups_delete ON subgroups FOR DELETE
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- SUBGROUP MEMBERS POLICIES
-- ============================================

DROP POLICY IF EXISTS subgroup_members_select ON subgroup_members;
DROP POLICY IF EXISTS subgroup_members_manage ON subgroup_members;
DROP POLICY IF EXISTS subgroup_members_insert ON subgroup_members;
DROP POLICY IF EXISTS subgroup_members_update ON subgroup_members;
DROP POLICY IF EXISTS subgroup_members_delete ON subgroup_members;

-- SELECT: All club members can view subgroup members
CREATE POLICY subgroup_members_select ON subgroup_members FOR SELECT
    USING (
        subgroup_id IN (
            SELECT id FROM subgroups
            WHERE club_id IN (
                SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())
            )
        )
    );

-- INSERT: Coaches and head_coaches can add members to subgroups
CREATE POLICY subgroup_members_insert ON subgroup_members FOR INSERT
    WITH CHECK (
        subgroup_id IN (
            SELECT id FROM subgroups
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- UPDATE: Coaches and head_coaches can update subgroup members
CREATE POLICY subgroup_members_update ON subgroup_members FOR UPDATE
    USING (
        subgroup_id IN (
            SELECT id FROM subgroups
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- DELETE: Coaches and head_coaches can remove members from subgroups
CREATE POLICY subgroup_members_delete ON subgroup_members FOR DELETE
    USING (
        subgroup_id IN (
            SELECT id FROM subgroups
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- ============================================
-- TRAINING SESSIONS POLICIES (add head_coach)
-- ============================================

DROP POLICY IF EXISTS training_sessions_select ON training_sessions;
DROP POLICY IF EXISTS training_sessions_manage ON training_sessions;
DROP POLICY IF EXISTS training_sessions_insert ON training_sessions;
DROP POLICY IF EXISTS training_sessions_update ON training_sessions;
DROP POLICY IF EXISTS training_sessions_delete ON training_sessions;

-- SELECT: All club members can view training sessions
CREATE POLICY training_sessions_select ON training_sessions FOR SELECT
    USING (club_id IN (SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())));

-- INSERT: Coaches and head_coaches can create training sessions
CREATE POLICY training_sessions_insert ON training_sessions FOR INSERT
    WITH CHECK (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- UPDATE: Coaches and head_coaches can update training sessions
CREATE POLICY training_sessions_update ON training_sessions FOR UPDATE
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- DELETE: Coaches and head_coaches can delete training sessions
CREATE POLICY training_sessions_delete ON training_sessions FOR DELETE
    USING (
        club_id IN (
            SELECT club_id FROM profiles
            WHERE id = (SELECT auth.uid())
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- ATTENDANCE POLICIES (add head_coach)
-- ============================================

DROP POLICY IF EXISTS attendance_select ON attendance;
DROP POLICY IF EXISTS attendance_manage ON attendance;
DROP POLICY IF EXISTS attendance_insert ON attendance;
DROP POLICY IF EXISTS attendance_update ON attendance;
DROP POLICY IF EXISTS attendance_delete ON attendance;

-- SELECT: Club members can view attendance
CREATE POLICY attendance_select ON attendance FOR SELECT
    USING (
        session_id IN (
            SELECT id FROM training_sessions
            WHERE club_id IN (
                SELECT club_id FROM profiles WHERE id = (SELECT auth.uid())
            )
        )
    );

-- INSERT: Coaches and head_coaches can record attendance
CREATE POLICY attendance_insert ON attendance FOR INSERT
    WITH CHECK (
        session_id IN (
            SELECT id FROM training_sessions
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- UPDATE: Coaches and head_coaches can update attendance
CREATE POLICY attendance_update ON attendance FOR UPDATE
    USING (
        session_id IN (
            SELECT id FROM training_sessions
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );

-- DELETE: Coaches and head_coaches can delete attendance
CREATE POLICY attendance_delete ON attendance FOR DELETE
    USING (
        session_id IN (
            SELECT id FROM training_sessions
            WHERE club_id IN (
                SELECT club_id FROM profiles
                WHERE id = (SELECT auth.uid())
                AND role IN ('coach', 'head_coach', 'admin')
            )
        )
    );
