-- ============================================
-- FOLLOW REQUEST SYSTEM
-- Updates for profile_visibility based follow requests
-- ============================================

-- 1. Updated send_friend_request function with profile_visibility check
CREATE OR REPLACE FUNCTION send_friend_request(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    existing_friendship friendships%ROWTYPE;
    new_friendship_id UUID;
    requester_name TEXT;
    requester_profile profiles%ROWTYPE;
    target_profile profiles%ROWTYPE;
    target_privacy_setting TEXT;
    should_auto_accept BOOLEAN := false;
    result_status TEXT;
    notification_type TEXT;
    notification_title TEXT;
    notification_message TEXT;
    result JSON;
BEGIN
    -- Validierung: Nicht sich selbst als Freund hinzufügen
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot follow yourself');
    END IF;

    -- Get requester profile
    SELECT * INTO requester_profile FROM profiles WHERE id = current_user_id;
    requester_name := COALESCE(requester_profile.first_name, '') || ' ' || COALESCE(requester_profile.last_name, '');
    requester_name := TRIM(requester_name);
    IF requester_name = '' THEN
        requester_name := 'Ein Nutzer';
    END IF;

    -- Get target profile and privacy settings
    SELECT * INTO target_profile FROM profiles WHERE id = target_user_id;
    target_privacy_setting := COALESCE(target_profile.privacy_settings->>'profile_visibility', 'global');

    -- Check ob bereits eine Freundschaft existiert (in beide Richtungen)
    SELECT * INTO existing_friendship
    FROM friendships
    WHERE (requester_id = current_user_id AND addressee_id = target_user_id)
       OR (requester_id = target_user_id AND addressee_id = current_user_id)
    LIMIT 1;

    -- Wenn bereits existiert
    IF existing_friendship.id IS NOT NULL THEN
        IF existing_friendship.status = 'accepted' THEN
            RETURN json_build_object('success', false, 'error', 'Already following');
        ELSIF existing_friendship.status = 'pending' THEN
            -- Wenn die andere Person bereits eine Anfrage gesendet hat
            IF existing_friendship.requester_id = target_user_id THEN
                -- Auto-accept: both want to follow each other
                UPDATE friendships
                SET status = 'accepted', updated_at = NOW()
                WHERE id = existing_friendship.id;

                -- Notification: Mutual follow
                INSERT INTO notifications (user_id, type, title, message, data)
                VALUES (
                    target_user_id,
                    'new_follower',
                    'Neuer Abonnent',
                    requester_name || ' folgt dir jetzt',
                    json_build_object('friendship_id', existing_friendship.id, 'user_id', current_user_id)
                );

                RETURN json_build_object(
                    'success', true,
                    'message', 'Now following (mutual)',
                    'status', 'accepted',
                    'instant', true
                );
            ELSE
                RETURN json_build_object('success', false, 'error', 'Follow request already pending');
            END IF;
        ELSIF existing_friendship.status = 'blocked' THEN
            RETURN json_build_object('success', false, 'error', 'Cannot send follow request');
        END IF;
    END IF;

    -- Determine if auto-accept based on profile_visibility
    IF target_privacy_setting = 'global' THEN
        -- Global: Everyone can follow instantly
        should_auto_accept := true;
    ELSIF target_privacy_setting = 'club_only' THEN
        -- Club only: Check if same club
        IF requester_profile.club_id IS NOT NULL
           AND target_profile.club_id IS NOT NULL
           AND requester_profile.club_id = target_profile.club_id THEN
            should_auto_accept := true;
        ELSE
            should_auto_accept := false;
        END IF;
    ELSIF target_privacy_setting = 'followers_only' THEN
        -- Followers only: Check if target already follows requester
        IF EXISTS (
            SELECT 1 FROM friendships
            WHERE requester_id = target_user_id
            AND addressee_id = current_user_id
            AND status = 'accepted'
        ) THEN
            should_auto_accept := true;
        ELSE
            should_auto_accept := false;
        END IF;
    ELSE
        -- Default to global behavior
        should_auto_accept := true;
    END IF;

    -- Create friendship with appropriate status
    IF should_auto_accept THEN
        result_status := 'accepted';
        notification_type := 'new_follower';
        notification_title := 'Neuer Abonnent';
        notification_message := requester_name || ' folgt dir jetzt';
    ELSE
        result_status := 'pending';
        notification_type := 'follow_request';
        notification_title := 'Neue Abonnement-Anfrage';
        notification_message := requester_name || ' möchte dir folgen';
    END IF;

    -- Insert new friendship
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES (current_user_id, target_user_id, result_status::friendship_status)
    RETURNING id INTO new_friendship_id;

    -- Create notification
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        target_user_id,
        notification_type,
        notification_title,
        notification_message,
        json_build_object(
            'friendship_id', new_friendship_id,
            'requester_id', current_user_id,
            'requires_action', NOT should_auto_accept
        )
    );

    result := json_build_object(
        'success', true,
        'message', CASE WHEN should_auto_accept THEN 'Now following' ELSE 'Follow request sent' END,
        'status', result_status,
        'friendship_id', new_friendship_id,
        'instant', should_auto_accept
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Updated decline_friend_request with notification to requester
CREATE OR REPLACE FUNCTION decline_friend_request(
    current_user_id UUID,
    friendship_id UUID
)
RETURNS JSON AS $$
DECLARE
    friendship friendships%ROWTYPE;
    decliner_name TEXT;
    decliner_profile profiles%ROWTYPE;
BEGIN
    -- Get friendship
    SELECT * INTO friendship
    FROM friendships
    WHERE id = friendship_id
    AND addressee_id = current_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Follow request not found or not pending');
    END IF;

    -- Get decliner name
    SELECT * INTO decliner_profile FROM profiles WHERE id = current_user_id;
    decliner_name := COALESCE(decliner_profile.first_name, '') || ' ' || COALESCE(decliner_profile.last_name, '');
    decliner_name := TRIM(decliner_name);
    IF decliner_name = '' THEN
        decliner_name := 'Ein Nutzer';
    END IF;

    -- Delete the friendship request
    DELETE FROM friendships WHERE id = friendship_id;

    -- Send notification to requester about decline
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        friendship.requester_id,
        'follow_request_declined',
        'Anfrage abgelehnt',
        decliner_name || ' hat deine Anfrage abgelehnt',
        json_build_object('user_id', current_user_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Follow request declined'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Updated accept_friend_request with better notification
CREATE OR REPLACE FUNCTION accept_friend_request(
    current_user_id UUID,
    friendship_id UUID
)
RETURNS JSON AS $$
DECLARE
    friendship friendships%ROWTYPE;
    accepter_name TEXT;
    accepter_profile profiles%ROWTYPE;
BEGIN
    -- Get friendship
    SELECT * INTO friendship
    FROM friendships
    WHERE id = friendship_id
    AND addressee_id = current_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Follow request not found or not pending');
    END IF;

    -- Get accepter name
    SELECT * INTO accepter_profile FROM profiles WHERE id = current_user_id;
    accepter_name := COALESCE(accepter_profile.first_name, '') || ' ' || COALESCE(accepter_profile.last_name, '');
    accepter_name := TRIM(accepter_name);
    IF accepter_name = '' THEN
        accepter_name := 'Ein Nutzer';
    END IF;

    -- Update status to accepted
    UPDATE friendships
    SET status = 'accepted', updated_at = NOW()
    WHERE id = friendship_id;

    -- Send notification to requester
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        friendship.requester_id,
        'follow_request_accepted',
        'Anfrage angenommen',
        accepter_name || ' hat deine Anfrage angenommen. Du folgst jetzt ' || accepter_name || '!',
        json_build_object('friendship_id', friendship_id, 'user_id', current_user_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Follow request accepted',
        'friendship_id', friendship_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. New function: Cancel a sent follow request
CREATE OR REPLACE FUNCTION cancel_follow_request(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    friendship friendships%ROWTYPE;
BEGIN
    -- Find the pending request sent by current user
    SELECT * INTO friendship
    FROM friendships
    WHERE requester_id = current_user_id
    AND addressee_id = target_user_id
    AND status = 'pending';

    IF friendship.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No pending follow request found');
    END IF;

    -- Delete the friendship request
    DELETE FROM friendships WHERE id = friendship.id;

    -- Delete any related notification for the target user
    DELETE FROM notifications
    WHERE user_id = target_user_id
    AND type = 'follow_request'
    AND (data->>'requester_id')::uuid = current_user_id;

    RETURN json_build_object(
        'success', true,
        'message', 'Follow request cancelled'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Updated remove_friend (unfollow)
CREATE OR REPLACE FUNCTION remove_friend(
    current_user_id UUID,
    friend_id UUID
)
RETURNS JSON AS $$
DECLARE
    deleted_count INT;
BEGIN
    -- Delete friendship where current user is the requester (i.e., they followed the other person)
    DELETE FROM friendships
    WHERE requester_id = current_user_id
    AND addressee_id = friend_id
    AND status = 'accepted';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Not following this user');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Unfollowed successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. Get follow status between two users
CREATE OR REPLACE FUNCTION get_follow_status(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    outgoing_friendship friendships%ROWTYPE;
    incoming_friendship friendships%ROWTYPE;
BEGIN
    -- Check if current user follows target (or has pending request)
    SELECT * INTO outgoing_friendship
    FROM friendships
    WHERE requester_id = current_user_id AND addressee_id = target_user_id;

    -- Check if target follows current user
    SELECT * INTO incoming_friendship
    FROM friendships
    WHERE requester_id = target_user_id AND addressee_id = current_user_id
    AND status = 'accepted';

    RETURN json_build_object(
        'is_following', outgoing_friendship.status = 'accepted',
        'has_pending_request', outgoing_friendship.status = 'pending',
        'is_followed_by', incoming_friendship.id IS NOT NULL,
        'outgoing_friendship_id', outgoing_friendship.id,
        'incoming_friendship_id', incoming_friendship.id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
