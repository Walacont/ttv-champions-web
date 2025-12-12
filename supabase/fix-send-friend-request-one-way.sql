-- ============================================
-- FIX: SEND_FRIEND_REQUEST FOR ONE-WAY FOLLOW
-- Each follow is independent - A following B is separate from B following A
-- ============================================

-- Drop existing function first
DROP FUNCTION IF EXISTS send_friend_request(uuid, uuid);

-- Recreate with one-way follow logic
CREATE OR REPLACE FUNCTION send_friend_request(
    current_user_id UUID,
    target_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    existing_follow friendships%ROWTYPE;
    new_friendship_id UUID;
    requester_name TEXT;
    result JSON;
BEGIN
    -- Validierung: Nicht sich selbst folgen
    IF current_user_id = target_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Cannot follow yourself');
    END IF;

    -- Get requester name for notification
    SELECT first_name || ' ' || last_name INTO requester_name
    FROM profiles WHERE id = current_user_id;

    -- Check ob der aktuelle User bereits dieser Person folgt (NUR EINE RICHTUNG!)
    -- requester_id = der Follower, addressee_id = der Gefolgte
    SELECT * INTO existing_follow
    FROM friendships
    WHERE requester_id = current_user_id
    AND addressee_id = target_user_id
    LIMIT 1;

    -- Wenn bereits ein Follow existiert
    IF existing_follow.id IS NOT NULL THEN
        IF existing_follow.status = 'accepted' THEN
            RETURN json_build_object('success', false, 'error', 'Already following');
        ELSIF existing_follow.status = 'pending' THEN
            RETURN json_build_object('success', false, 'error', 'Follow request already pending');
        END IF;
    END IF;

    -- Neuen Follow erstellen (direkt auf 'accepted' für öffentliche Profile)
    -- In einem One-Way System gibt es keine "pending" requests mehr - du folgst einfach
    INSERT INTO friendships (requester_id, addressee_id, status)
    VALUES (current_user_id, target_user_id, 'accepted')
    RETURNING id INTO new_friendship_id;

    -- Benachrichtigung erstellen
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
        target_user_id,
        'new_follower',
        'Neuer Follower',
        requester_name || ' folgt dir jetzt!',
        json_build_object('friendship_id', new_friendship_id, 'user_id', current_user_id)
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Now following',
        'friendship_id', new_friendship_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Done! One-way follow system for send_friend_request.
-- Now A can follow B independently of whether B follows A.
-- ============================================
