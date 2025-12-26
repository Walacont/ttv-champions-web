-- Migration 006: Enable RLS on tournament_rounds table
-- This table exists but RLS was not enabled, creating a security issue

-- Enable RLS on tournament_rounds
ALTER TABLE tournament_rounds ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view tournament rounds" ON tournament_rounds;
DROP POLICY IF EXISTS "Coaches can manage tournament rounds" ON tournament_rounds;
DROP POLICY IF EXISTS "Tournament creators can manage rounds" ON tournament_rounds;

-- Users can view rounds if they can view the tournament
CREATE POLICY "Users can view tournament rounds"
ON tournament_rounds FOR SELECT
USING (
    tournament_id IN (
        SELECT id FROM tournaments
        WHERE (is_club_only = false)  -- Global tournaments
           OR (is_club_only = true AND club_id IN (
               SELECT club_id FROM profiles WHERE id = auth.uid()
           ))  -- Club-only tournaments for members
    )
);

-- Coaches can manage tournament rounds for their club
CREATE POLICY "Coaches can manage tournament rounds"
ON tournament_rounds FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'coach'
        AND club_id IN (
            SELECT club_id FROM tournaments WHERE id = tournament_rounds.tournament_id
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role = 'coach'
        AND club_id IN (
            SELECT club_id FROM tournaments WHERE id = tournament_rounds.tournament_id
        )
    )
);

-- Tournament creators can manage rounds in their tournaments
CREATE POLICY "Tournament creators can manage rounds"
ON tournament_rounds FOR ALL
USING (
    tournament_id IN (
        SELECT id FROM tournaments WHERE created_by = auth.uid()
    )
)
WITH CHECK (
    tournament_id IN (
        SELECT id FROM tournaments WHERE created_by = auth.uid()
    )
);

COMMENT ON TABLE tournament_rounds IS 'Runden innerhalb eines Turniers - RLS enabled für Sicherheit';
