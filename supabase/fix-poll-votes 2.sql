-- Fix Poll Votes RLS Policies
-- Run this if you're getting 406/400 errors when voting on polls

-- Ensure poll_votes table exists
CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES community_polls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(poll_id, user_id)
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll_id ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);

-- Enable RLS
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view poll votes" ON poll_votes;
DROP POLICY IF EXISTS "Users can vote on polls" ON poll_votes;
DROP POLICY IF EXISTS "Users can update own votes" ON poll_votes;
DROP POLICY IF EXISTS "Users can delete own votes" ON poll_votes;

-- Recreate policies with proper permissions
-- SELECT: Users can view all votes for polls they can see
CREATE POLICY "Users can view poll votes" ON poll_votes
    FOR SELECT
    USING (true);  -- Simplified - anyone logged in can see votes

-- INSERT: Users can insert their own votes
CREATE POLICY "Users can vote on polls" ON poll_votes
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can update their own votes
CREATE POLICY "Users can update own votes" ON poll_votes
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can delete their own votes
CREATE POLICY "Users can delete own votes" ON poll_votes
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON poll_votes TO authenticated;

-- Verify triggers exist for updating poll counts
CREATE OR REPLACE FUNCTION increment_poll_votes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_polls
    SET total_votes = total_votes + 1,
        options = (
            SELECT jsonb_agg(
                CASE
                    WHEN elem->>'id' = NEW.option_id
                    THEN jsonb_set(elem, '{votes}', to_jsonb(COALESCE((elem->>'votes')::int, 0) + 1))
                    ELSE elem
                END
            )
            FROM jsonb_array_elements(options) elem
        )
    WHERE id = NEW.poll_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_poll_votes()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE community_polls
    SET total_votes = GREATEST(0, total_votes - 1),
        options = (
            SELECT jsonb_agg(
                CASE
                    WHEN elem->>'id' = OLD.option_id
                    THEN jsonb_set(elem, '{votes}', to_jsonb(GREATEST(0, COALESCE((elem->>'votes')::int, 0) - 1)))
                    ELSE elem
                END
            )
            FROM jsonb_array_elements(options) elem
        )
    WHERE id = OLD.poll_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
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

-- Done!
SELECT 'Poll votes RLS policies fixed!' as status;
