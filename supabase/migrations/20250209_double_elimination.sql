-- ============================================
-- DOUBLE ELIMINATION TOURNAMENT SUPPORT
-- Adds bracket_type and bracket_position fields to tournament_matches
-- ============================================

-- Add bracket_type to distinguish between winners/losers bracket matches
ALTER TABLE tournament_matches
ADD COLUMN IF NOT EXISTS bracket_type TEXT DEFAULT 'winners';

-- Add bracket_position to track position within bracket (for visualization)
ALTER TABLE tournament_matches
ADD COLUMN IF NOT EXISTS bracket_position INTEGER;

-- Add next_match_id for winner progression
ALTER TABLE tournament_matches
ADD COLUMN IF NOT EXISTS next_winner_match_id UUID REFERENCES tournament_matches(id);

-- Add next_match_id for loser progression (in double elimination)
ALTER TABLE tournament_matches
ADD COLUMN IF NOT EXISTS next_loser_match_id UUID REFERENCES tournament_matches(id);

-- Add index for bracket_type queries
CREATE INDEX IF NOT EXISTS idx_tournament_matches_bracket_type
ON tournament_matches(tournament_id, bracket_type);

-- Update the tournament_format enum if double_elimination doesn't exist
-- Note: double_elim_32 already exists, but we add a simpler 'double_elimination' for flexibility
DO $$
BEGIN
    -- Check if double_elimination exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'double_elimination'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'tournament_format')
    ) THEN
        ALTER TYPE tournament_format ADD VALUE IF NOT EXISTS 'double_elimination';
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN tournament_matches.bracket_type IS 'Type of bracket: winners, losers, finals, grand_finals';
COMMENT ON COLUMN tournament_matches.bracket_position IS 'Position within the bracket for visualization (1-indexed)';
COMMENT ON COLUMN tournament_matches.next_winner_match_id IS 'The match the winner advances to';
COMMENT ON COLUMN tournament_matches.next_loser_match_id IS 'The match the loser drops to (double elimination only)';
