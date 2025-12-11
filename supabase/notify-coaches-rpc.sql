-- ============================================
-- RPC Function: Notify club coaches about requests
-- ============================================
-- This function bypasses RLS to find coaches in a club
-- and create notifications for them when a player sends
-- a join or leave request.

CREATE OR REPLACE FUNCTION notify_club_coaches(
    p_club_id UUID,
    p_request_type TEXT,  -- 'join' or 'leave'
    p_player_name TEXT,
    p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coach RECORD;
    v_notification_count INT := 0;
    v_notification_type TEXT;
    v_title TEXT;
    v_message TEXT;
BEGIN
    -- Validate request type
    IF p_request_type NOT IN ('join', 'leave') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid request type');
    END IF;

    -- Set notification details based on type
    IF p_request_type = 'join' THEN
        v_notification_type := 'club_join_request';
        v_title := 'Neue Beitrittsanfrage';
        v_message := p_player_name || ' möchte dem Verein beitreten.';
    ELSE
        v_notification_type := 'club_leave_request';
        v_title := 'Neue Austrittsanfrage';
        v_message := p_player_name || ' möchte den Verein verlassen.';
    END IF;

    -- Find all coaches and head_coaches in the club and notify them
    FOR v_coach IN
        SELECT id FROM profiles
        WHERE club_id = p_club_id
        AND role IN ('coach', 'head_coach')
    LOOP
        INSERT INTO notifications (user_id, type, title, message, data, is_read)
        VALUES (
            v_coach.id,
            v_notification_type,
            v_title,
            v_message,
            jsonb_build_object('player_name', p_player_name, 'player_id', p_player_id),
            false
        );
        v_notification_count := v_notification_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'coaches_notified', v_notification_count
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION notify_club_coaches(UUID, TEXT, TEXT, UUID) TO authenticated;
