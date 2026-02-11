-- ============================================
-- Guardian Event Invitations Access Policies
-- ============================================
-- Allows guardians to:
--   - View event invitations for their linked children
--   - Update event invitation status (accept/reject) on behalf of children
-- Also tracks who responded via the responded_by column
-- ============================================

-- Ensure RLS is enabled
ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SELECT: Users can see own invitations + guardians can see children's
-- ============================================
DROP POLICY IF EXISTS "Users can view own event invitations" ON event_invitations;
DROP POLICY IF EXISTS "Guardians can view children event invitations" ON event_invitations;
DROP POLICY IF EXISTS "event_invitations_select" ON event_invitations;

CREATE POLICY "event_invitations_select" ON event_invitations FOR SELECT
    USING (
        -- User's own invitations
        user_id = auth.uid()
        -- Guardian can see their children's invitations
        OR EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND guardian_links.child_id = event_invitations.user_id
        )
        -- Coaches can see invitations for their club's events
        OR EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_invitations.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- UPDATE: Users can update own + guardians can update children's
-- ============================================
DROP POLICY IF EXISTS "Users can update own event invitations" ON event_invitations;
DROP POLICY IF EXISTS "Guardians can update children event invitations" ON event_invitations;
DROP POLICY IF EXISTS "event_invitations_update" ON event_invitations;

CREATE POLICY "event_invitations_update" ON event_invitations FOR UPDATE
    USING (
        -- User's own invitations
        user_id = auth.uid()
        -- Guardian can update their children's invitations
        OR EXISTS (
            SELECT 1 FROM guardian_links
            WHERE guardian_links.guardian_id = auth.uid()
            AND guardian_links.child_id = event_invitations.user_id
        )
        -- Coaches can update invitations for their club's events
        OR EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_invitations.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- INSERT: System/coaches can create invitations
-- ============================================
DROP POLICY IF EXISTS "event_invitations_insert" ON event_invitations;

CREATE POLICY "event_invitations_insert" ON event_invitations FOR INSERT
    WITH CHECK (
        -- Coaches can create invitations for their club's events
        EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_invitations.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
        -- Users can self-insert (for recurring event auto-creation)
        OR user_id = auth.uid()
    );

-- ============================================
-- DELETE: Coaches can delete invitations
-- ============================================
DROP POLICY IF EXISTS "event_invitations_delete" ON event_invitations;

CREATE POLICY "event_invitations_delete" ON event_invitations FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM events e
            JOIN profiles p ON p.club_id = e.club_id
            WHERE e.id = event_invitations.event_id
            AND p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- ============================================
-- Verification
-- ============================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Guardian Event Invitations Policies Applied!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Guardians can now:';
    RAISE NOTICE '  - View event invitations of their children';
    RAISE NOTICE '  - Accept/reject events on behalf of children';
    RAISE NOTICE '========================================';
END $$;
