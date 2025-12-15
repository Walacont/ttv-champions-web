-- Add anonymous voting support for polls
-- Run this migration to enable anonymous/non-anonymous polls

-- Add is_anonymous column to community_polls (default true for backwards compatibility)
ALTER TABLE community_polls
ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT true;

-- Done!
SELECT 'Anonymous polls enabled!' as status;
