-- Notifications table for in-app notifications
-- Run this in Supabase SQL Editor

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'points_awarded', 'points_deducted', 'match_request', 'challenge_completed', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}', -- Additional data (points, xp, elo, etc.)
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own notifications
CREATE POLICY notifications_select ON notifications FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- Users can update their own notifications (mark as read)
CREATE POLICY notifications_update ON notifications FOR UPDATE
    USING (user_id = (SELECT auth.uid()));

-- Any authenticated user can insert notifications
-- This allows players to notify coaches about join/leave requests
-- Security: Users can only SELECT/UPDATE/DELETE their own notifications
CREATE POLICY notifications_insert ON notifications FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete their own notifications
-- OR notifications they created for others (where data->>'player_id' matches their id)
CREATE POLICY notifications_delete ON notifications FOR DELETE
    USING (
        user_id = auth.uid()
        OR (data->>'player_id')::uuid = auth.uid()
    );

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
