-- ============================================
-- FIX: REMOVE_FRIEND FUNCTION FOR ONE-WAY UNFOLLOW
-- Only delete the friendship where current user is the requester
-- ============================================

-- Drop and recreate remove_friend function
DROP FUNCTION IF EXISTS remove_friend(uuid, uuid);

CREATE OR REPLACE FUNCTION remove_friend(
    current_user_id UUID,
    friend_id UUID
)
RETURNS JSON AS $$
DECLARE
    deleted_count INT;
BEGIN
    -- Delete friendship ONE-WAY only
    -- Only delete where current user is the follower (requester)
    DELETE FROM friendships
    WHERE requester_id = current_user_id
    AND addressee_id = friend_id
    AND status = 'accepted';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Friendship not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Friend removed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Done! One-way unfollow fixed.
-- ============================================
