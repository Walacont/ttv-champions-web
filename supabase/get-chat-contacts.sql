-- ============================================
-- GET_CHAT_CONTACTS: Friends + Club Members
-- Returns deduplicated list of users you can chat with:
-- 1. People you follow (friends)
-- 2. People in the same club
-- ============================================

DROP FUNCTION IF EXISTS get_chat_contacts(UUID);

CREATE OR REPLACE FUNCTION get_chat_contacts(current_user_id UUID)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    club_id UUID,
    club_name TEXT,
    elo_rating INT,
    source TEXT  -- 'friend', 'club', or 'both'
) AS $$
DECLARE
    v_club_id UUID;
BEGIN
    -- Get current user's club
    SELECT p.club_id INTO v_club_id
    FROM profiles p WHERE p.id = current_user_id;

    RETURN QUERY
    SELECT
        combined.id,
        combined.first_name,
        combined.last_name,
        combined.avatar_url,
        combined.club_id,
        combined.club_name,
        combined.elo_rating,
        -- If both friend and club member, show 'both'
        CASE
            WHEN bool_or(combined.is_friend) AND bool_or(combined.is_club) THEN 'both'
            WHEN bool_or(combined.is_friend) THEN 'friend'
            ELSE 'club'
        END AS source
    FROM (
        -- Friends (people you follow)
        SELECT
            p.id, p.first_name, p.last_name, p.avatar_url,
            p.club_id, c.name AS club_name, p.elo_rating,
            true AS is_friend, false AS is_club
        FROM friendships f
        INNER JOIN profiles p ON p.id = f.addressee_id
        LEFT JOIN clubs c ON p.club_id = c.id
        WHERE f.requester_id = current_user_id AND f.status = 'accepted'

        UNION ALL

        -- Club members (same club_id, excluding self)
        SELECT
            p.id, p.first_name, p.last_name, p.avatar_url,
            p.club_id, c.name AS club_name, p.elo_rating,
            false AS is_friend, true AS is_club
        FROM profiles p
        LEFT JOIN clubs c ON p.club_id = c.id
        WHERE v_club_id IS NOT NULL
          AND p.club_id = v_club_id
          AND p.id != current_user_id
    ) combined
    GROUP BY combined.id, combined.first_name, combined.last_name,
             combined.avatar_url, combined.club_id, combined.club_name, combined.elo_rating
    ORDER BY combined.first_name, combined.last_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_chat_contacts(UUID) TO authenticated;
