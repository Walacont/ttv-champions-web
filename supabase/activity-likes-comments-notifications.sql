-- ============================================
-- ACTIVITY LIKES & COMMENTS WITH NOTIFICATIONS
-- ============================================
-- Updates activity system to support all activity types
-- Adds real-time notifications for likes and comments

-- ============================================
-- PART 1: Update activity_likes table
-- ============================================

-- Drop old table and recreate with new schema
DROP TABLE IF EXISTS activity_likes CASCADE;

CREATE TABLE activity_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'singles_match', 'doubles_match', 'post', 'poll', 'event',
        'rank_up', 'club_join'
    )),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure a user can only like an activity once
    UNIQUE(activity_id, activity_type, user_id)
);

-- Create indexes
CREATE INDEX idx_activity_likes_activity ON activity_likes(activity_id, activity_type);
CREATE INDEX idx_activity_likes_user ON activity_likes(user_id);
CREATE INDEX idx_activity_likes_created ON activity_likes(created_at DESC);

-- Enable RLS
ALTER TABLE activity_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "activity_likes_select" ON activity_likes
    FOR SELECT USING (true);

CREATE POLICY "activity_likes_insert" ON activity_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "activity_likes_delete" ON activity_likes
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- PART 2: Update activity_comments table
-- ============================================

-- Update activity_type constraint to include all types
ALTER TABLE activity_comments DROP CONSTRAINT IF EXISTS activity_comments_activity_type_check;
ALTER TABLE activity_comments ADD CONSTRAINT activity_comments_activity_type_check
    CHECK (activity_type IN ('singles_match', 'doubles_match', 'post', 'poll', 'event', 'rank_up', 'club_join'));

-- ============================================
-- PART 3: Toggle like function with notifications
-- ============================================

CREATE OR REPLACE FUNCTION toggle_activity_like(
    p_activity_id UUID,
    p_activity_type TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_existing_like UUID;
    v_like_count INT;
    v_is_liked BOOLEAN;
    v_is_owner BOOLEAN := FALSE;
BEGIN
    -- Validate activity type
    IF p_activity_type NOT IN ('singles_match', 'doubles_match', 'post', 'poll', 'event', 'rank_up', 'club_join') THEN
        RAISE EXCEPTION 'Invalid activity type: %', p_activity_type;
    END IF;

    -- Check if user is owner/participant of the activity
    IF p_activity_type = 'singles_match' THEN
        SELECT EXISTS (
            SELECT 1 FROM matches
            WHERE id = p_activity_id
            AND (player_a_id = v_user_id OR player_b_id = v_user_id)
        ) INTO v_is_owner;
    ELSIF p_activity_type = 'doubles_match' THEN
        SELECT EXISTS (
            SELECT 1 FROM doubles_matches
            WHERE id = p_activity_id
            AND (team_a_player1_id = v_user_id OR team_a_player2_id = v_user_id
                 OR team_b_player1_id = v_user_id OR team_b_player2_id = v_user_id)
        ) INTO v_is_owner;
    ELSIF p_activity_type IN ('post', 'poll') THEN
        SELECT EXISTS (
            SELECT 1 FROM community_posts
            WHERE id = p_activity_id
            AND (user_id = v_user_id OR created_by = v_user_id)
        ) INTO v_is_owner;
    ELSIF p_activity_type IN ('rank_up', 'club_join', 'event') THEN
        SELECT EXISTS (
            SELECT 1 FROM activity_events
            WHERE id = p_activity_id
            AND user_id = v_user_id
        ) INTO v_is_owner;
    END IF;

    -- Prevent users from liking their own activities
    IF v_is_owner THEN
        RAISE EXCEPTION 'You cannot like your own activity';
    END IF;

    -- Check if user already liked this activity
    SELECT id INTO v_existing_like
    FROM activity_likes
    WHERE activity_id = p_activity_id
      AND activity_type = p_activity_type
      AND user_id = v_user_id;

    IF v_existing_like IS NOT NULL THEN
        -- Unlike
        DELETE FROM activity_likes WHERE id = v_existing_like;
        v_is_liked := FALSE;
    ELSE
        -- Like
        INSERT INTO activity_likes (activity_id, activity_type, user_id)
        VALUES (p_activity_id, p_activity_type, v_user_id);
        v_is_liked := TRUE;

        -- Send notifications based on activity type
        IF p_activity_type = 'singles_match' THEN
            -- Notify both players
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                player_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Spiel geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM (
                SELECT player_a_id AS player_id FROM matches WHERE id = p_activity_id
                UNION
                SELECT player_b_id FROM matches WHERE id = p_activity_id
            ) AS players
            WHERE player_id != v_user_id AND player_id IS NOT NULL;

        ELSIF p_activity_type = 'doubles_match' THEN
            -- Notify all 4 players
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                player_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Doppel geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM (
                SELECT team_a_player1_id AS player_id FROM doubles_matches WHERE id = p_activity_id
                UNION
                SELECT team_a_player2_id FROM doubles_matches WHERE id = p_activity_id
                UNION
                SELECT team_b_player1_id FROM doubles_matches WHERE id = p_activity_id
                UNION
                SELECT team_b_player2_id FROM doubles_matches WHERE id = p_activity_id
            ) AS players
            WHERE player_id != v_user_id AND player_id IS NOT NULL;

        ELSIF p_activity_type = 'post' THEN
            -- Notify post author
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                user_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deinen Beitrag geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM community_posts
            WHERE id = p_activity_id AND user_id != v_user_id;

        ELSIF p_activity_type = 'poll' THEN
            -- Notify poll author
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                created_by,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Umfrage geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM community_posts
            WHERE id = p_activity_id AND type = 'poll' AND created_by != v_user_id;

        ELSIF p_activity_type IN ('rank_up', 'club_join', 'event') THEN
            -- Notify event owner
            INSERT INTO notifications (user_id, type, title, message, data, created_at)
            SELECT
                user_id,
                'activity_like',
                'Neues Like',
                (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Aktivit�t geliked',
                json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'liker_id', v_user_id),
                NOW()
            FROM activity_events
            WHERE id = p_activity_id AND user_id != v_user_id;
        END IF;
    END IF;

    -- Get updated like count
    SELECT COUNT(*) INTO v_like_count
    FROM activity_likes
    WHERE activity_id = p_activity_id AND activity_type = p_activity_type;

    RETURN json_build_object(
        'is_liked', v_is_liked,
        'like_count', v_like_count
    );
END;
$$;

-- ============================================
-- PART 4: Get likes batch function
-- ============================================

CREATE OR REPLACE FUNCTION get_activity_likes_batch(
    p_activity_ids UUID[],
    p_activity_types TEXT[]
)
RETURNS TABLE(
    activity_id UUID,
    activity_type TEXT,
    like_count BIGINT,
    is_liked_by_me BOOLEAN,
    recent_likers JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    WITH activity_pairs AS (
        SELECT unnest(p_activity_ids) AS activity_id, unnest(p_activity_types) AS activity_type
    ),
    like_counts AS (
        SELECT
            al.activity_id,
            al.activity_type,
            COUNT(*) AS total_likes,
            BOOL_OR(al.user_id = v_user_id) AS is_liked
        FROM activity_likes al
        INNER JOIN activity_pairs ap ON al.activity_id = ap.activity_id AND al.activity_type = ap.activity_type
        GROUP BY al.activity_id, al.activity_type
    ),
    recent_likers AS (
        SELECT
            al.activity_id,
            al.activity_type,
            jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.'),
                    'avatar_url', p.avatar_url
                ) ORDER BY al.created_at DESC
            ) FILTER (WHERE p.id IS NOT NULL) AS likers
        FROM activity_likes al
        INNER JOIN activity_pairs ap ON al.activity_id = ap.activity_id AND al.activity_type = ap.activity_type
        LEFT JOIN profiles p ON al.user_id = p.id
        GROUP BY al.activity_id, al.activity_type
    )
    SELECT
        ap.activity_id,
        ap.activity_type,
        COALESCE(lc.total_likes, 0)::BIGINT AS like_count,
        COALESCE(lc.is_liked, FALSE) AS is_liked_by_me,
        COALESCE(rl.likers, '[]'::JSONB) AS recent_likers
    FROM activity_pairs ap
    LEFT JOIN like_counts lc ON ap.activity_id = lc.activity_id AND ap.activity_type = lc.activity_type
    LEFT JOIN recent_likers rl ON ap.activity_id = rl.activity_id AND ap.activity_type = rl.activity_type;
END;
$$;

-- ============================================
-- PART 5: Add comment function with notifications
-- ============================================

CREATE OR REPLACE FUNCTION add_activity_comment(
    p_activity_id UUID,
    p_activity_type TEXT,
    p_content TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_comment_id UUID;
    v_comment_count INT;
BEGIN
    -- Validate content
    IF length(p_content) = 0 OR length(p_content) > 2000 THEN
        RAISE EXCEPTION 'Comment must be between 1 and 2000 characters';
    END IF;

    -- Validate activity type
    IF p_activity_type NOT IN ('singles_match', 'doubles_match', 'post', 'poll', 'event', 'rank_up', 'club_join') THEN
        RAISE EXCEPTION 'Invalid activity type: %', p_activity_type;
    END IF;

    -- Insert comment
    INSERT INTO activity_comments (activity_id, activity_type, user_id, content)
    VALUES (p_activity_id, p_activity_type, v_user_id, p_content)
    RETURNING id INTO v_comment_id;

    -- Send notifications
    IF p_activity_type = 'singles_match' THEN
        -- Notify both players
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            player_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Spiel kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM (
            SELECT player_a_id AS player_id FROM matches WHERE id = p_activity_id
            UNION
            SELECT player_b_id FROM matches WHERE id = p_activity_id
        ) AS players
        WHERE player_id != v_user_id AND player_id IS NOT NULL;

    ELSIF p_activity_type = 'doubles_match' THEN
        -- Notify all 4 players
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            player_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat euer Doppel kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM (
            SELECT team_a_player1_id AS player_id FROM doubles_matches WHERE id = p_activity_id
            UNION
            SELECT team_a_player2_id FROM doubles_matches WHERE id = p_activity_id
            UNION
            SELECT team_b_player1_id FROM doubles_matches WHERE id = p_activity_id
            UNION
            SELECT team_b_player2_id FROM doubles_matches WHERE id = p_activity_id
        ) AS players
        WHERE player_id != v_user_id AND player_id IS NOT NULL;

    ELSIF p_activity_type = 'post' THEN
        -- Notify post author
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            user_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deinen Beitrag kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM community_posts
        WHERE id = p_activity_id AND user_id != v_user_id;

    ELSIF p_activity_type = 'poll' THEN
        -- Notify poll author
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            created_by,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Umfrage kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM community_posts
        WHERE id = p_activity_id AND type = 'poll' AND created_by != v_user_id;

    ELSIF p_activity_type IN ('rank_up', 'club_join', 'event') THEN
        -- Notify event owner
        INSERT INTO notifications (user_id, type, title, message, data, created_at)
        SELECT
            user_id,
            'activity_comment',
            'Neuer Kommentar',
            (SELECT COALESCE(display_name, first_name || ' ' || last_name) FROM profiles WHERE id = v_user_id) || ' hat deine Aktivit�t kommentiert',
            json_build_object('activity_id', p_activity_id, 'activity_type', p_activity_type, 'comment_id', v_comment_id, 'commenter_id', v_user_id),
            NOW()
        FROM activity_events
        WHERE id = p_activity_id AND user_id != v_user_id;
    END IF;

    -- Get updated comment count
    SELECT COUNT(*) INTO v_comment_count
    FROM activity_comments
    WHERE activity_id = p_activity_id AND activity_type = p_activity_type;

    RETURN json_build_object(
        'comment_id', v_comment_id,
        'comment_count', v_comment_count
    );
END;
$$;
