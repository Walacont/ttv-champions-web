-- ============================================
-- COMMUNITY POSTS & POLLS
-- Beiträge und Umfragen für die Community
-- ============================================

-- ============================================
-- POSTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

    -- Content
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    image_url TEXT,

    -- Visibility
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'club')),

    -- Metadata
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_posts_user_id ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_club_id ON community_posts(club_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_visibility ON community_posts(visibility);

-- Enable RLS
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS community_polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,

    -- Content
    question TEXT NOT NULL CHECK (char_length(question) <= 500),
    options JSONB NOT NULL, -- Array of {id, text, votes}

    -- Settings
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers', 'club')),
    duration_days INTEGER NOT NULL DEFAULT 7,
    ends_at TIMESTAMPTZ NOT NULL,

    -- Metadata
    total_votes INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_polls_user_id ON community_polls(user_id);
CREATE INDEX IF NOT EXISTS idx_community_polls_club_id ON community_polls(club_id);
CREATE INDEX IF NOT EXISTS idx_community_polls_created_at ON community_polls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_polls_ends_at ON community_polls(ends_at);

-- Enable RLS
ALTER TABLE community_polls ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLL VOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- User can only vote once per poll
    UNIQUE(poll_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);

-- Enable RLS
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POST LIKES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS post_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- User can only like once per post
    UNIQUE(post_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id);

-- Enable RLS
ALTER TABLE post_likes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POST COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS post_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
    poll_id UUID REFERENCES community_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    content TEXT NOT NULL CHECK (char_length(content) <= 1000),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Either post_id or poll_id must be set
    CHECK (
        (post_id IS NOT NULL AND poll_id IS NULL) OR
        (post_id IS NULL AND poll_id IS NOT NULL)
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_poll_id ON post_comments(poll_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_user_id ON post_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_created_at ON post_comments(created_at DESC);

-- Enable RLS
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES - POSTS
-- ============================================

-- Users can view posts based on visibility settings
CREATE POLICY "Users can view posts based on visibility"
    ON community_posts FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            -- Own posts are always visible
            user_id = auth.uid()
            OR
            -- Public posts visible to all
            visibility = 'public'
            OR
            -- Club posts visible to club members
            (
                visibility = 'club'
                AND club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- Follower posts visible to followers
            (
                visibility = 'followers'
                AND EXISTS (
                    SELECT 1 FROM friendships
                    WHERE requester_id = auth.uid()
                    AND addressee_id = community_posts.user_id
                    AND status = 'accepted'
                )
            )
        )
    );

-- Users can create posts
CREATE POLICY "Users can create posts"
    ON community_posts FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own posts
CREATE POLICY "Users can update own posts"
    ON community_posts FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own posts (soft delete)
CREATE POLICY "Users can delete own posts"
    ON community_posts FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES - POLLS
-- ============================================

-- Users can view polls based on visibility settings
CREATE POLICY "Users can view polls based on visibility"
    ON community_polls FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            user_id = auth.uid()
            OR
            visibility = 'public'
            OR
            (
                visibility = 'club'
                AND club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
            )
            OR
            (
                visibility = 'followers'
                AND EXISTS (
                    SELECT 1 FROM friendships
                    WHERE requester_id = auth.uid()
                    AND addressee_id = community_polls.user_id
                    AND status = 'accepted'
                )
            )
        )
    );

-- Users can create polls
CREATE POLICY "Users can create polls"
    ON community_polls FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own polls
CREATE POLICY "Users can update own polls"
    ON community_polls FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own polls
CREATE POLICY "Users can delete own polls"
    ON community_polls FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES - POLL VOTES
-- ============================================

-- Users can view all votes for polls they can see
CREATE POLICY "Users can view poll votes"
    ON poll_votes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM community_polls
            WHERE id = poll_votes.poll_id
            AND deleted_at IS NULL
        )
    );

-- Users can vote on polls
CREATE POLICY "Users can vote on polls"
    ON poll_votes FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can change their vote
CREATE POLICY "Users can update own votes"
    ON poll_votes FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can remove their vote
CREATE POLICY "Users can delete own votes"
    ON poll_votes FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES - POST LIKES
-- ============================================

-- Users can view likes
CREATE POLICY "Users can view post likes"
    ON post_likes FOR SELECT
    USING (true);

-- Users can like posts
CREATE POLICY "Users can like posts"
    ON post_likes FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can unlike posts
CREATE POLICY "Users can unlike posts"
    ON post_likes FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- RLS POLICIES - COMMENTS
-- ============================================

-- Users can view comments on posts/polls they can see
CREATE POLICY "Users can view comments"
    ON post_comments FOR SELECT
    USING (
        (
            post_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM community_posts
                WHERE id = post_comments.post_id
                AND deleted_at IS NULL
            )
        )
        OR
        (
            poll_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM community_polls
                WHERE id = post_comments.poll_id
                AND deleted_at IS NULL
            )
        )
    );

-- Users can create comments
CREATE POLICY "Users can create comments"
    ON post_comments FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
    ON post_comments FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
    ON post_comments FOR DELETE
    USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to increment post likes count
CREATE OR REPLACE FUNCTION increment_post_likes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_posts
    SET likes_count = likes_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement post likes count
CREATE OR REPLACE FUNCTION decrement_post_likes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_posts
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment poll votes count
CREATE OR REPLACE FUNCTION increment_poll_votes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_polls
    SET total_votes = total_votes + 1,
        options = jsonb_set(
            options,
            ARRAY[
                (
                    SELECT (index - 1)::text
                    FROM jsonb_array_elements(options) WITH ORDINALITY arr(elem, index)
                    WHERE elem->>'id' = NEW.option_id
                )::int,
                'votes'
            ],
            to_jsonb(
                COALESCE(
                    (
                        SELECT (elem->>'votes')::int + 1
                        FROM jsonb_array_elements(options) elem
                        WHERE elem->>'id' = NEW.option_id
                    ),
                    1
                )
            )
        )
    WHERE id = NEW.poll_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to decrement poll votes count
CREATE OR REPLACE FUNCTION decrement_poll_votes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_polls
    SET total_votes = GREATEST(0, total_votes - 1),
        options = jsonb_set(
            options,
            ARRAY[
                (
                    SELECT (index - 1)::text
                    FROM jsonb_array_elements(options) WITH ORDINALITY arr(elem, index)
                    WHERE elem->>'id' = OLD.option_id
                )::int,
                'votes'
            ],
            to_jsonb(
                GREATEST(
                    0,
                    (
                        SELECT (elem->>'votes')::int - 1
                        FROM jsonb_array_elements(options) elem
                        WHERE elem->>'id' = OLD.option_id
                    )
                )
            )
        )
    WHERE id = OLD.poll_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger for post likes
DROP TRIGGER IF EXISTS trigger_increment_post_likes ON post_likes;
CREATE TRIGGER trigger_increment_post_likes
    AFTER INSERT ON post_likes
    FOR EACH ROW
    EXECUTE FUNCTION increment_post_likes();

DROP TRIGGER IF EXISTS trigger_decrement_post_likes ON post_likes;
CREATE TRIGGER trigger_decrement_post_likes
    AFTER DELETE ON post_likes
    FOR EACH ROW
    EXECUTE FUNCTION decrement_post_likes();

-- Trigger for poll votes
DROP TRIGGER IF EXISTS trigger_increment_poll_votes ON poll_votes;
CREATE TRIGGER trigger_increment_poll_votes
    AFTER INSERT ON poll_votes
    FOR EACH ROW
    EXECUTE FUNCTION increment_poll_votes();

DROP TRIGGER IF EXISTS trigger_decrement_poll_votes ON poll_votes;
CREATE TRIGGER trigger_decrement_poll_votes
    AFTER DELETE ON poll_votes
    FOR EACH ROW
    EXECUTE FUNCTION decrement_poll_votes();

-- ============================================
-- REALTIME (optional)
-- ============================================

-- Enable realtime for posts (new posts appear instantly)
-- Uncomment if you want realtime updates:
-- ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
-- ALTER PUBLICATION supabase_realtime ADD TABLE community_polls;
-- ALTER PUBLICATION supabase_realtime ADD TABLE post_likes;
-- ALTER PUBLICATION supabase_realtime ADD TABLE poll_votes;
-- ALTER PUBLICATION supabase_realtime ADD TABLE post_comments;

-- ============================================
-- Done! Community posts and polls are ready.
-- ============================================
