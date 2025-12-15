-- ============================================
-- FIX NOTIFICATIONS POLICIES
-- ============================================
-- Problem 1: Players can't create notifications for coaches
-- when sending club join/leave requests.
--
-- Problem 2: Players can't delete notifications they created
-- for coaches when withdrawing requests.
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_delete ON notifications;

-- Create new INSERT policy: Any authenticated user can insert notifications
-- This is safe because:
-- 1. Users can only SELECT/UPDATE their own notifications
-- 2. The application controls what notification types are created
-- 3. Notifications are just messages, not permissions
CREATE POLICY notifications_insert ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Create new DELETE policy: Users can delete their own notifications
-- OR notifications they created (where data->>'player_id' matches their id)
-- This allows players to clean up notifications when withdrawing requests
CREATE POLICY notifications_delete ON notifications FOR DELETE
    USING (
        user_id = auth.uid()
        OR (data->>'player_id')::uuid = auth.uid()
    );
