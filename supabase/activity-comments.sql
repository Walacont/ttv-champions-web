-- Activity Comments Table
-- Stores comments on all activity types (matches, posts, polls, events)

-- Drop existing policies first (if re-running)
DROP POLICY IF EXISTS "activity_comments_select" ON activity_comments;
DROP POLICY IF EXISTS "activity_comments_insert" ON activity_comments;
DROP POLICY IF EXISTS "activity_comments_update" ON activity_comments;
DROP POLICY IF EXISTS "activity_comments_delete" ON activity_comments;

CREATE TABLE IF NOT EXISTS activity_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('singles_match', 'doubles_match', 'post', 'poll', 'event')),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_comments_activity ON activity_comments(activity_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_comments_user ON activity_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_comments_created ON activity_comments(created_at DESC);

-- Enable RLS
ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view comments based on activity visibility
-- For now, everyone can see all comments (we can restrict later based on privacy settings)
CREATE POLICY "activity_comments_select" ON activity_comments
    FOR SELECT USING (true);

-- Users can insert their own comments
CREATE POLICY "activity_comments_insert" ON activity_comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments within 24 hours
CREATE POLICY "activity_comments_update" ON activity_comments
    FOR UPDATE USING (
        auth.uid() = user_id
        AND created_at > NOW() - INTERVAL '24 hours'
    );

-- Users can delete their own comments
CREATE POLICY "activity_comments_delete" ON activity_comments
    FOR DELETE USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_activity_comment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER activity_comments_updated_at
    BEFORE UPDATE ON activity_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_activity_comment_updated_at();

-- Function to get comments for an activity
CREATE OR REPLACE FUNCTION get_activity_comments(
    p_activity_id UUID,
    p_activity_type TEXT,
    p_limit INT DEFAULT 50,
    p_offset INT DEFAULT 0
)
RETURNS TABLE(
    id UUID,
    content TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    user_id UUID,
    user_name TEXT,
    user_avatar_url TEXT,
    is_author BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        ac.id,
        ac.content,
        ac.created_at,
        ac.updated_at,
        ac.user_id,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS user_name,
        p.avatar_url AS user_avatar_url,
        (ac.user_id = v_user_id) AS is_author
    FROM activity_comments ac
    LEFT JOIN profiles p ON ac.user_id = p.id
    WHERE ac.activity_id = p_activity_id
      AND ac.activity_type = p_activity_type
    ORDER BY ac.created_at ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Function to add a comment
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
    IF p_activity_type NOT IN ('singles_match', 'doubles_match', 'post', 'poll', 'event') THEN
        RAISE EXCEPTION 'Invalid activity type: %', p_activity_type;
    END IF;

    -- Insert comment
    INSERT INTO activity_comments (activity_id, activity_type, user_id, content)
    VALUES (p_activity_id, p_activity_type, v_user_id, p_content)
    RETURNING id INTO v_comment_id;

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

-- Function to delete a comment
CREATE OR REPLACE FUNCTION delete_activity_comment(
    p_comment_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity_id UUID;
    v_activity_type TEXT;
    v_comment_count INT;
BEGIN
    -- Get activity info and verify ownership
    SELECT activity_id, activity_type INTO v_activity_id, v_activity_type
    FROM activity_comments
    WHERE id = p_comment_id AND user_id = v_user_id;

    IF v_activity_id IS NULL THEN
        RAISE EXCEPTION 'Comment not found or you do not have permission to delete it';
    END IF;

    -- Delete comment
    DELETE FROM activity_comments WHERE id = p_comment_id;

    -- Get updated comment count
    SELECT COUNT(*) INTO v_comment_count
    FROM activity_comments
    WHERE activity_id = v_activity_id AND activity_type = v_activity_type;

    RETURN json_build_object(
        'comment_count', v_comment_count
    );
END;
$$;
