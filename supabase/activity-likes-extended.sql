-- Extended Activity Likes Table
-- Migration to support likes on ALL activity types (matches, posts, polls, events)

-- Drop existing policies first (if re-running)
DROP POLICY IF EXISTS "activity_likes_select" ON activity_likes;
DROP POLICY IF EXISTS "activity_likes_insert" ON activity_likes;
DROP POLICY IF EXISTS "activity_likes_delete" ON activity_likes;

-- Check if we need to migrate from old structure
DO $$
BEGIN
    -- If activity_likes doesn't exist or has the old structure (match_id column), migrate
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'activity_likes' AND column_name = 'activity_id'
    ) THEN
        -- Rename old table if it exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_likes') THEN
            ALTER TABLE activity_likes RENAME TO activity_likes_old;
        END IF;

        -- Create new table
        CREATE TABLE activity_likes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            activity_id UUID NOT NULL,
            activity_type TEXT NOT NULL CHECK (activity_type IN ('singles_match', 'doubles_match', 'post', 'poll', 'event')),
            user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(activity_id, activity_type, user_id)
        );

        -- Migrate data if old table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_likes_old') THEN
            INSERT INTO activity_likes (id, activity_id, activity_type, user_id, created_at)
            SELECT
                id,
                match_id,
                CASE
                    WHEN match_type = 'singles' THEN 'singles_match'
                    WHEN match_type = 'doubles' THEN 'doubles_match'
                END,
                user_id,
                created_at
            FROM activity_likes_old;

            DROP TABLE activity_likes_old;
        END IF;
    END IF;
END $$;

-- Ensure table exists with correct structure (safe to run multiple times)
CREATE TABLE IF NOT EXISTS activity_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('singles_match', 'doubles_match', 'post', 'poll', 'event')),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(activity_id, activity_type, user_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_likes_activity ON activity_likes(activity_id, activity_type);
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

-- Updated function to toggle like on any activity
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
BEGIN
    -- Validate activity type
    IF p_activity_type NOT IN ('singles_match', 'doubles_match', 'post', 'poll', 'event') THEN
        RAISE EXCEPTION 'Invalid activity type: %', p_activity_type;
    END IF;

    -- Check if user already liked this activity
    SELECT id INTO v_existing_like
    FROM activity_likes
    WHERE activity_id = p_activity_id
      AND activity_type = p_activity_type
      AND user_id = v_user_id;

    IF v_existing_like IS NOT NULL THEN
        -- Unlike: Delete the like
        DELETE FROM activity_likes WHERE id = v_existing_like;
        v_is_liked := FALSE;
    ELSE
        -- Like: Insert new like
        INSERT INTO activity_likes (activity_id, activity_type, user_id)
        VALUES (p_activity_id, p_activity_type, v_user_id);
        v_is_liked := TRUE;
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

-- Updated function to get likes for multiple activities at once
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
