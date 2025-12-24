-- Instant Push Notifications Setup
-- This uses pg_net to call the Edge Function immediately when a notification is created
-- Run this AFTER push-notifications-setup.sql

-- ============================================
-- ENABLE PG_NET EXTENSION (if not already enabled)
-- ============================================
-- Note: This should already be enabled in Supabase by default
-- If not, go to Database > Extensions > Enable pg_net

-- ============================================
-- UPDATED TRIGGER: Send push notification instantly
-- ============================================

CREATE OR REPLACE FUNCTION send_push_notification_instant()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient RECORD;
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_pref_key TEXT;
BEGIN
    -- Get Supabase URL from environment (set these as database secrets)
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key := current_setting('app.settings.service_role_key', true);

    -- If settings not configured, try to get from vault
    IF v_supabase_url IS NULL THEN
        SELECT decrypted_secret INTO v_supabase_url
        FROM vault.decrypted_secrets
        WHERE name = 'supabase_url'
        LIMIT 1;
    END IF;

    IF v_service_key IS NULL THEN
        SELECT decrypted_secret INTO v_service_key
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1;
    END IF;

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
        v_pref_key := CASE NEW.type
            WHEN 'match_request' THEN 'match_requests'
            WHEN 'doubles_match_request' THEN 'doubles_match_requests'
            WHEN 'follow_request' THEN 'friend_requests'
            WHEN 'friend_request' THEN 'friend_requests'
            WHEN 'club_join_request' THEN 'club_requests'
            WHEN 'club_leave_request' THEN 'club_requests'
            WHEN 'points_awarded' THEN 'points_awarded'
            WHEN 'points_deducted' THEN 'points_awarded'
            WHEN 'ranking_change' THEN 'ranking_changes'
            WHEN 'training_reminder' THEN 'training_reminders'
            ELSE NULL
        END;

        IF v_pref_key IS NOT NULL AND
           v_recipient.notification_preferences->>v_pref_key IS NOT NULL AND
           (v_recipient.notification_preferences->>v_pref_key)::boolean = false THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Call Edge Function via pg_net (async HTTP request)
    -- This won't block the INSERT operation
    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_id', NEW.user_id::text,
                'title', NEW.title,
                'body', NEW.message,
                'notification_type', NEW.type,
                'data', jsonb_build_object(
                    'notification_id', NEW.id::text,
                    'type', NEW.type
                )
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger and create new one
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON notifications;
DROP TRIGGER IF EXISTS trigger_send_push_notification_instant ON notifications;

CREATE TRIGGER trigger_send_push_notification_instant
    AFTER INSERT ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION send_push_notification_instant();

-- ============================================
-- SETUP: Store Supabase credentials in Vault
-- ============================================
-- Run these commands with your actual values:
--
-- INSERT INTO vault.secrets (name, secret)
-- VALUES ('supabase_url', 'https://YOUR_PROJECT_REF.supabase.co');
--
-- INSERT INTO vault.secrets (name, secret)
-- VALUES ('service_role_key', 'YOUR_SERVICE_ROLE_KEY');
--
-- Or set as database config:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- ============================================
-- ALTERNATIVE: Simple approach without Vault
-- Just hardcode your Supabase URL (service key should stay in Vault for security)
-- ============================================

-- If you want a simpler setup, uncomment and modify this function:
/*
CREATE OR REPLACE FUNCTION send_push_notification_simple()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient RECORD;
BEGIN
    -- Get recipient info
    SELECT fcm_token, notifications_enabled
    INTO v_recipient
    FROM profiles
    WHERE id = NEW.user_id;

    -- Skip if no token or notifications disabled
    IF v_recipient.fcm_token IS NULL OR v_recipient.notifications_enabled = false THEN
        RETURN NEW;
    END IF;

    -- Call Edge Function (replace YOUR_PROJECT_REF with your actual project)
    PERFORM net.http_post(
        url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push-notification',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
        body := jsonb_build_object(
            'user_id', NEW.user_id::text,
            'title', NEW.title,
            'body', NEW.message,
            'notification_type', NEW.type
        )
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/

-- ============================================
-- TEST: Verify pg_net is working
-- ============================================
-- SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
