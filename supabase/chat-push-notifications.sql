-- ============================================
-- CHAT PUSH NOTIFICATIONS
-- Sends OneSignal push via pg_net when a chat message is inserted.
-- Does NOT create entries in the notifications table (no bell icon).
-- ============================================

CREATE OR REPLACE FUNCTION send_chat_push_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_sender_name TEXT;
    v_conv_type TEXT;
    v_conv_name TEXT;
    v_participant RECORD;
    v_supabase_url TEXT;
    v_service_key TEXT;
    v_title TEXT;
    v_body TEXT;
    v_pref_value TEXT;
BEGIN
    -- Get Supabase credentials
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_key := current_setting('app.settings.service_role_key', true);

    IF v_supabase_url IS NULL THEN
        SELECT decrypted_secret INTO v_supabase_url
        FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
    END IF;

    IF v_service_key IS NULL THEN
        SELECT decrypted_secret INTO v_service_key
        FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    END IF;

    -- Skip if credentials not configured
    IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
        RETURN NEW;
    END IF;

    -- Get sender name
    SELECT COALESCE(display_name, first_name, 'Jemand')
    INTO v_sender_name
    FROM profiles WHERE id = NEW.sender_id;

    -- Get conversation info
    SELECT type, name INTO v_conv_type, v_conv_name
    FROM chat_conversations WHERE id = NEW.conversation_id;

    -- Build notification title and body
    IF v_conv_type = 'group' THEN
        v_title := COALESCE(v_conv_name, 'Gruppenchat');
        v_body := v_sender_name || ': ' || LEFT(NEW.content, 100);
    ELSE
        v_title := v_sender_name;
        v_body := LEFT(NEW.content, 100);
    END IF;

    -- Send to all participants except the sender
    FOR v_participant IN
        SELECT cp.user_id, p.fcm_token, p.notifications_enabled, p.notification_preferences
        FROM chat_participants cp
        JOIN profiles p ON p.id = cp.user_id
        WHERE cp.conversation_id = NEW.conversation_id
          AND cp.user_id != NEW.sender_id
          AND p.fcm_token IS NOT NULL
          AND p.notifications_enabled = true
    LOOP
        -- Check if user has disabled chat_messages notifications
        IF v_participant.notification_preferences IS NOT NULL THEN
            v_pref_value := v_participant.notification_preferences->>'chat_messages';
            IF v_pref_value IS NOT NULL AND v_pref_value::boolean = false THEN
                CONTINUE;
            END IF;
        END IF;

        -- Send push via pg_net (async, non-blocking)
        PERFORM net.http_post(
            url := v_supabase_url || '/functions/v1/send-push-notification',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_service_key
            ),
            body := jsonb_build_object(
                'user_id', v_participant.user_id::text,
                'title', v_title,
                'body', v_body,
                'notification_type', 'chat_message',
                'data', jsonb_build_object(
                    'type', 'chat_message',
                    'conversation_id', NEW.conversation_id::text,
                    'sender_id', NEW.sender_id::text
                )
            )
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on chat_messages
DROP TRIGGER IF EXISTS trigger_chat_push_notification ON chat_messages;

CREATE TRIGGER trigger_chat_push_notification
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION send_chat_push_notification();
