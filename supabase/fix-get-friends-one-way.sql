-- ============================================
-- FIX: GET_FRIENDS FUNCTION FOR ONE-WAY FOLLOW
-- Only return users that the current user is following (as requester)
-- NOT users who follow the current user
-- ============================================

-- Drop existing function first to avoid type conflicts
DROP FUNCTION IF EXISTS get_friends(uuid);

-- Replace the get_friends function to only show people you follow
CREATE OR REPLACE FUNCTION get_friends(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    club_id UUID,
    club_name TEXT,
    elo_rating INT,
    friendship_id UUID,
    friendship_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        f.id as friendship_id,
        f.created_at as friendship_created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.addressee_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.requester_id = current_user_id  -- Only where YOU are the follower
    AND f.status = 'accepted'
    ORDER BY p.first_name, p.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Create a separate function to get followers (people who follow you)
CREATE OR REPLACE FUNCTION get_followers(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    club_id UUID,
    club_name TEXT,
    elo_rating INT,
    friendship_id UUID,
    friendship_created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        f.id as friendship_id,
        f.created_at as friendship_created_at
    FROM friendships f
    INNER JOIN profiles p ON p.id = f.requester_id
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE f.addressee_id = current_user_id  -- Only where others follow YOU
    AND f.status = 'accepted'
    ORDER BY p.first_name, p.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Done! One-way follow system fixed.
-- ============================================
