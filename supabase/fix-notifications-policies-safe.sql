-- ============================================
-- FIX NOTIFICATIONS POLICIES (SAFE VERSION)
-- ============================================
-- Drops existing policies first, then recreates them
-- This avoids "policy already exists" errors

-- Drop all existing policies on notifications table
DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_delete" ON notifications;

-- Also drop any policies with different naming conventions
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete notifications" ON notifications;

-- Recreate policies

-- Users can only see their own notifications
CREATE POLICY notifications_select ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update ON notifications FOR UPDATE
    USING (user_id = auth.uid());

-- Any authenticated user can insert notifications
-- This allows players to notify coaches about join/leave requests
CREATE POLICY notifications_insert ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete their own notifications
-- OR notifications they created for others (where data->>'player_id' matches their id)
CREATE POLICY notifications_delete ON notifications FOR DELETE
    USING (
        user_id = auth.uid()
        OR (data->>'player_id')::uuid = auth.uid()
    );

-- Ensure RLS is enabled
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Ensure realtime is enabled (ignore error if already added)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
