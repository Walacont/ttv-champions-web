-- Add multiple choice support for polls
-- Run this migration to enable multiple selection in polls

-- Add allow_multiple column to community_polls
ALTER TABLE community_polls
ADD COLUMN IF NOT EXISTS allow_multiple BOOLEAN DEFAULT false;

-- Update poll_votes to allow multiple votes per user (when allow_multiple is true)
-- We need to drop the unique constraint and add a new one that checks the poll setting

-- First, let's update the poll_votes table to support multiple selections
-- The unique constraint (poll_id, user_id) will be changed to (poll_id, user_id, option_id)

-- Drop old unique constraint if exists
ALTER TABLE poll_votes
DROP CONSTRAINT IF EXISTS poll_votes_poll_id_user_id_key;

-- Add new unique constraint that allows multiple votes per user but not same option twice
ALTER TABLE poll_votes
ADD CONSTRAINT poll_votes_poll_id_user_id_option_id_key UNIQUE (poll_id, user_id, option_id);

-- Update the increment trigger to handle the poll correctly
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

-- Update the decrement trigger
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

-- Done!
SELECT 'Multiple choice polls enabled!' as status;
