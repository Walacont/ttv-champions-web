-- Activity Likes Table
-- Stores likes for match activities

CREATE TABLE IF NOT EXISTS activity_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('singles', 'doubles')),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure a user can only like a match once
    UNIQUE(match_id, match_type, user_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_likes_match ON activity_likes(match_id, match_type);
CREATE INDEX IF NOT EXISTS idx_activity_likes_user ON activity_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_likes_created ON activity_likes(created_at DESC);

-- Enable RLS
ALTER TABLE activity_likes ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view all likes (for like counts)
CREATE POLICY "activity_likes_select" ON activity_likes
    FOR SELECT USING (true);

-- Users can insert their own likes
CREATE POLICY "activity_likes_insert" ON activity_likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own likes
CREATE POLICY "activity_likes_delete" ON activity_likes
    FOR DELETE USING (auth.uid() = user_id);

-- Function to toggle like on an activity
CREATE OR REPLACE FUNCTION toggle_activity_like(
    p_match_id UUID,
    p_match_type TEXT
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
BEGIN
    -- Check if user already liked this activity
    SELECT id INTO v_existing_like
    FROM activity_likes
    WHERE match_id = p_match_id
      AND match_type = p_match_type
      AND user_id = v_user_id;

    IF v_existing_like IS NOT NULL THEN
        -- Unlike: Delete the like
        DELETE FROM activity_likes WHERE id = v_existing_like;
        v_is_liked := FALSE;
    ELSE
        -- Like: Insert new like
        INSERT INTO activity_likes (match_id, match_type, user_id)
        VALUES (p_match_id, p_match_type, v_user_id);
        v_is_liked := TRUE;
    END IF;

    -- Get updated like count
    SELECT COUNT(*) INTO v_like_count
    FROM activity_likes
    WHERE match_id = p_match_id AND match_type = p_match_type;

    RETURN json_build_object(
        'is_liked', v_is_liked,
        'like_count', v_like_count
    );
END;
$$;

-- Function to get likes for multiple activities at once
CREATE OR REPLACE FUNCTION get_activity_likes_batch(
    p_activity_ids UUID[],
    p_match_types TEXT[]
)
RETURNS TABLE(
    match_id UUID,
    match_type TEXT,
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
        SELECT unnest(p_activity_ids) AS match_id, unnest(p_match_types) AS match_type
    ),
    like_counts AS (
        SELECT
            al.match_id,
            al.match_type,
            COUNT(*) AS total_likes,
            BOOL_OR(al.user_id = v_user_id) AS is_liked
        FROM activity_likes al
        INNER JOIN activity_pairs ap ON al.match_id = ap.match_id AND al.match_type = ap.match_type
        GROUP BY al.match_id, al.match_type
    ),
    recent_likers AS (
        SELECT
            al.match_id,
            al.match_type,
            jsonb_agg(
                jsonb_build_object(
                    'id', p.id,
                    'name', COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.'),
                    'avatar_url', p.avatar_url
                ) ORDER BY al.created_at DESC
            ) FILTER (WHERE p.id IS NOT NULL) AS likers
        FROM activity_likes al
        INNER JOIN activity_pairs ap ON al.match_id = ap.match_id AND al.match_type = ap.match_type
        LEFT JOIN profiles p ON al.user_id = p.id
        GROUP BY al.match_id, al.match_type
    )
    SELECT
        ap.match_id,
        ap.match_type,
        COALESCE(lc.total_likes, 0)::BIGINT AS like_count,
        COALESCE(lc.is_liked, FALSE) AS is_liked_by_me,
        COALESCE(rl.likers, '[]'::JSONB) AS recent_likers
    FROM activity_pairs ap
    LEFT JOIN like_counts lc ON ap.match_id = lc.match_id AND ap.match_type = lc.match_type
    LEFT JOIN recent_likers rl ON ap.match_id = rl.match_id AND ap.match_type = rl.match_type;
END;
$$;
