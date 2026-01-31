-- Migration: Add posted_as_club column to community_posts and community_polls
-- This allows coaches/head_coaches to post on behalf of the club

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS posted_as_club BOOLEAN DEFAULT FALSE;
ALTER TABLE community_polls ADD COLUMN IF NOT EXISTS posted_as_club BOOLEAN DEFAULT FALSE;

-- Index for efficient club page feed queries
CREATE INDEX IF NOT EXISTS idx_community_posts_club_public ON community_posts (club_id, visibility) WHERE posted_as_club = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_community_polls_club_public ON community_polls (club_id, visibility) WHERE posted_as_club = TRUE AND deleted_at IS NULL;
