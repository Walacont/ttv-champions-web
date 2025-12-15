-- ============================================
-- FIX: Follower counts visible to everyone
-- ============================================
-- The current RLS policy on friendships only allows users to see
-- friendships where they are the requester or addressee.
-- This prevents viewing follower/following counts for other users.
--
-- Solution: Create an RPC function that returns counts only (no details).
-- Uses SECURITY DEFINER to bypass RLS for counting purposes.

-- RPC Function: Get follow counts for any user
CREATE OR REPLACE FUNCTION get_follow_counts(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_followers INT;
    v_following INT;
BEGIN
    -- Count followers (people who follow this user - they are the requesters)
    SELECT COUNT(*) INTO v_followers
    FROM friendships
    WHERE addressee_id = p_user_id
    AND status = 'accepted';

    -- Count following (people this user follows - this user is the requester)
    SELECT COUNT(*) INTO v_following
    FROM friendships
    WHERE requester_id = p_user_id
    AND status = 'accepted';

    RETURN jsonb_build_object(
        'followers', v_followers,
        'following', v_following
    );
END;
$$;

-- Grant execute permission to all authenticated users
GRANT EXECUTE ON FUNCTION get_follow_counts(UUID) TO authenticated;

-- Also allow anonymous users (for viewing public profiles without login)
GRANT EXECUTE ON FUNCTION get_follow_counts(UUID) TO anon;
