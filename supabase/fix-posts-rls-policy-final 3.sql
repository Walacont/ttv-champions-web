-- ============================================
-- FIX COMMUNITY POSTS RLS POLICY (FINAL)
-- One-directional follower check
-- If you follow someone, you see their follower-only posts
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view posts based on visibility" ON community_posts;

-- Create corrected policy with one-directional check
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
            -- Club posts visible ONLY to club members
            (
                visibility = 'club'
                AND club_id IS NOT NULL
                AND club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- Follower posts visible ONLY to people who follow the author
            -- One-directional: You follow them = You see their posts
            (
                visibility = 'followers'
                AND EXISTS (
                    SELECT 1 FROM friendships
                    WHERE requester_id = auth.uid()  -- You are the follower
                    AND addressee_id = community_posts.user_id  -- They are the author
                    AND status = 'accepted'
                )
            )
        )
    );

-- ============================================
-- Debug Query (run this to check your friendship)
-- ============================================
-- Replace YOUR_USER_ID and POST_AUTHOR_ID with actual UUIDs

-- Check if you follow the post author:
-- SELECT * FROM friendships
-- WHERE requester_id = 'YOUR_USER_ID'
-- AND addressee_id = 'POST_AUTHOR_ID'
-- AND status = 'accepted';

-- Check the post visibility:
-- SELECT id, user_id, visibility, content, created_at
-- FROM community_posts
-- WHERE user_id = 'POST_AUTHOR_ID'
-- ORDER BY created_at DESC;

-- ============================================
-- Done! One-directional follower check restored.
-- ============================================
