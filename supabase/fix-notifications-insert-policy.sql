-- ============================================
-- FIX NOTIFICATIONS INSERT POLICY
-- ============================================
-- Problem: Players can't create notifications for coaches
-- when sending club join/leave requests.
--
-- Solution: Allow any authenticated user to insert notifications.
-- The application logic controls what notifications are created.
-- ============================================

-- Drop existing insert policy
DROP POLICY IF EXISTS notifications_insert ON notifications;

-- Create new policy: Any authenticated user can insert notifications
-- This is safe because:
-- 1. Users can only SELECT/UPDATE/DELETE their own notifications
-- 2. The application controls what notification types are created
-- 3. Notifications are just messages, not permissions
CREATE POLICY notifications_insert ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
