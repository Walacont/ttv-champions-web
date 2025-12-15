-- ============================================
-- FIX: SEARCH_PLAYERS FUNCTION FOR ONE-WAY FOLLOW
-- Only show "is_friend" when YOU follow THEM (one-directional)
-- ============================================

-- Drop existing function first
DROP FUNCTION IF EXISTS search_players(text, uuid, int);

-- Recreate with one-way follower checks
CREATE OR REPLACE FUNCTION search_players(
    search_query TEXT,
    current_user_id UUID,
    limit_count INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    club_id UUID,
    club_name TEXT,
    elo_rating INT,
    is_friend BOOLEAN,
    friendship_status friendship_status
) AS $$
DECLARE
    current_user_club_id UUID;
BEGIN
    -- Get current user's club_id once
    SELECT p.club_id INTO current_user_club_id FROM profiles p WHERE p.id = current_user_id;

    RETURN QUERY
    SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.avatar_url,
        p.club_id,
        c.name as club_name,
        p.elo_rating,
        -- Check if YOU follow THEM (one-way)
        EXISTS (
            SELECT 1 FROM friendships f
            WHERE f.requester_id = current_user_id
            AND f.addressee_id = p.id
            AND f.status = 'accepted'
        ) as is_friend,
        -- Get friendship status where YOU are the follower (one-way)
        (
            SELECT f.status FROM friendships f
            WHERE f.requester_id = current_user_id
            AND f.addressee_id = p.id
            LIMIT 1
        ) as friendship_status
    FROM profiles p
    LEFT JOIN clubs c ON p.club_id = c.id
    WHERE
        -- Nicht der aktuelle User selbst
        p.id != current_user_id
        -- Suchfilter
        AND (
            p.first_name ILIKE '%' || search_query || '%'
            OR p.last_name ILIKE '%' || search_query || '%'
            OR (p.first_name || ' ' || p.last_name) ILIKE '%' || search_query || '%'
        )
        -- Privacy-Filter: Nur sichtbare Spieler
        AND (
            -- Global sichtbar
            (p.privacy_settings->>'searchable' = 'global' OR p.privacy_settings->>'searchable' = 'true')
            -- Oder Club-Only und selber Club
            OR (
                p.privacy_settings->>'searchable' = 'club_only'
                AND p.club_id IS NOT NULL
                AND p.club_id = current_user_club_id
            )
            -- Oder Friends-Only und YOU follow THEM (one-way)
            OR (
                p.privacy_settings->>'searchable' = 'friends_only'
                AND EXISTS (
                    SELECT 1 FROM friendships f2
                    WHERE f2.requester_id = current_user_id
                    AND f2.addressee_id = p.id
                    AND f2.status = 'accepted'
                )
            )
        )
    ORDER BY
        -- People YOU follow first (one-way)
        CASE WHEN EXISTS (
            SELECT 1 FROM friendships f3
            WHERE f3.requester_id = current_user_id
            AND f3.addressee_id = p.id
            AND f3.status = 'accepted'
        ) THEN 0 ELSE 1 END,
        -- Dann nach Name
        p.first_name, p.last_name
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Done! Search results now show one-way following status.
-- ============================================
