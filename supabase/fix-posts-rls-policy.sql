-- ============================================
-- FIX COMMUNITY POSTS RLS POLICY
-- Improved visibility for follower posts
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view posts based on visibility" ON community_posts;

-- Create improved policy
-- Follower posts should be visible to:
-- 1. The post author
-- 2. Users who follow the author
-- 3. Club members if the author is in the same club
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
                AND club_id IS NOT NULL
                AND club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
            )
            OR
            -- Follower posts visible to followers AND club members
            (
                visibility = 'followers'
                AND (
                    -- User follows the post author
                    EXISTS (
                        SELECT 1 FROM friendships
                        WHERE requester_id = auth.uid()
                        AND addressee_id = community_posts.user_id
                        AND status = 'accepted'
                    )
                    OR
                    -- User is in the same club as the post author
                    (
                        club_id IS NOT NULL
                        AND club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                    )
                )
            )
        )
    );

-- ============================================
-- Done! RLS policy updated for better visibility.
-- ============================================
