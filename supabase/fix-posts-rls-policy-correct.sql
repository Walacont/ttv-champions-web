-- ============================================
-- FIX COMMUNITY POSTS RLS POLICY (CORRECTED)
-- Follower posts should ONLY be visible to followers
-- NOT to club members
-- ============================================

-- Drop existing policy
DROP POLICY IF EXISTS "Users can view posts based on visibility" ON community_posts;

-- Create corrected policy
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
            -- Follower posts visible ONLY to followers (NOT club members)
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

-- ============================================
-- Done! RLS policy corrected.
-- ============================================
