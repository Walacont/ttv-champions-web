-- Push Notifications Setup
-- Run this in the Supabase SQL Editor to add push notification support

-- ============================================
-- ADD PUSH NOTIFICATION COLUMNS TO PROFILES
-- ============================================

-- Add FCM token column (stores the device token for push notifications)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Add timestamp for when token was last updated
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcm_token_updated_at TIMESTAMPTZ;

-- Add platform column (ios, android, web)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_platform TEXT;

-- Add notifications enabled flag
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;

-- Add notification preferences (JSON object for granular control)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "match_requests": true,
    "doubles_match_requests": true,
    "friend_requests": true,
    "club_requests": true,
    "ranking_changes": true,
    "training_reminders": true,
    "points_awarded": false
}'::jsonb;

-- Add timestamp for when preferences were last updated
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_preferences_updated_at TIMESTAMPTZ;

-- ============================================
-- CREATE PUSH NOTIFICATION LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS push_notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT,
    body TEXT,
    data JSONB,
    platform TEXT,
    status TEXT DEFAULT 'pending', -- pending, sent, failed, delivered
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ
);

-- Index for querying user's notification history
CREATE INDEX IF NOT EXISTS idx_push_logs_user_id ON push_notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_push_logs_created_at ON push_notification_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_logs_status ON push_notification_logs(status);

-- ============================================
-- RLS POLICIES FOR PUSH NOTIFICATION LOGS
-- ============================================

ALTER TABLE push_notification_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notification logs
CREATE POLICY "Users can view own push logs" ON push_notification_logs
    FOR SELECT USING (user_id = auth.uid());

-- Only service role can insert/update logs (from Edge Functions)
CREATE POLICY "Service role can manage push logs" ON push_notification_logs
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- FUNCTION: Get users with push tokens for a notification
-- ============================================

CREATE OR REPLACE FUNCTION get_push_recipients(
    p_user_ids UUID[],
    p_notification_type TEXT
)
RETURNS TABLE (
    user_id UUID,
    fcm_token TEXT,
    push_platform TEXT,
    display_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.fcm_token,
        p.push_platform,
        COALESCE(p.display_name, p.first_name, 'Nutzer') as display_name
    FROM profiles p
    WHERE p.id = ANY(p_user_ids)
      AND p.fcm_token IS NOT NULL
      AND p.notifications_enabled = true
      AND (
          p.notification_preferences IS NULL
          OR p.notification_preferences->>p_notification_type IS NULL
          OR (p.notification_preferences->>p_notification_type)::boolean = true
      );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Send push notification on new notification
-- This will be called by the Edge Function
-- ============================================

-- Create a function that can be called to queue push notifications
CREATE OR REPLACE FUNCTION queue_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient RECORD;
    v_title TEXT;
    v_body TEXT;
BEGIN
    -- Get recipient info
    SELECT fcm_token, push_platform, notifications_enabled,
           notification_preferences, display_name, first_name
    INTO v_recipient
    FROM profiles
    WHERE id = NEW.user_id;

    -- Skip if no token or notifications disabled
    IF v_recipient.fcm_token IS NULL OR v_recipient.notifications_enabled = false THEN
        RETURN NEW;
    END IF;

    -- Check notification preferences for this type
    IF v_recipient.notification_preferences IS NOT NULL THEN
        -- Map notification type to preference key
        DECLARE
            v_pref_key TEXT;
        BEGIN
            v_pref_key := CASE NEW.type
                WHEN 'match_request' THEN 'match_requests'
                WHEN 'doubles_match_request' THEN 'doubles_match_requests'
                WHEN 'follow_request' THEN 'friend_requests'
                WHEN 'friend_request' THEN 'friend_requests'
                WHEN 'club_join_request' THEN 'club_requests'
                WHEN 'club_leave_request' THEN 'club_requests'
                WHEN 'points_awarded' THEN 'points_awarded'
                WHEN 'points_deducted' THEN 'points_awarded'
                ELSE NULL
            END;

            IF v_pref_key IS NOT NULL AND
               v_recipient.notification_preferences->>v_pref_key IS NOT NULL AND
               (v_recipient.notification_preferences->>v_pref_key)::boolean = false THEN
                RETURN NEW;
            END IF;
        END;
    END IF;

    -- Log the push notification to be sent
    INSERT INTO push_notification_logs (
        user_id,
        notification_type,
        title,
        body,
        data,
        platform,
        status
    ) VALUES (
        NEW.user_id,
        NEW.type,
        NEW.title,
        NEW.message,
        jsonb_build_object(
            'notification_id', NEW.id,
            'type', NEW.type,
            'data', NEW.data
        ),
        v_recipient.push_platform,
        'pending'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON notifications;
CREATE TRIGGER trigger_queue_push_notification
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION queue_push_notification();

-- ============================================
-- VERIFY SETUP
-- ============================================

-- Check if columns were added
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name LIKE '%notification%' OR column_name LIKE '%fcm%';

-- Check if push_notification_logs table exists
-- SELECT * FROM push_notification_logs LIMIT 1;
