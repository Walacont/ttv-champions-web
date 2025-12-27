-- ============================================
-- Remove duplicate tournament_standings entries
-- Migration 012
-- ============================================

-- Delete duplicate standings, keeping only the first one (by id)
DELETE FROM tournament_standings a USING (
    SELECT MIN(id) as id, tournament_id, round_id, player_id
    FROM tournament_standings
    GROUP BY tournament_id, round_id, player_id
    HAVING COUNT(*) > 1
) b
WHERE a.tournament_id = b.tournament_id
  AND (a.round_id = b.round_id OR (a.round_id IS NULL AND b.round_id IS NULL))
  AND a.player_id = b.player_id
  AND a.id != b.id;

-- Verify the unique constraint exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tournament_standings_tournament_id_round_id_player_id_key'
    ) THEN
        ALTER TABLE tournament_standings
        ADD CONSTRAINT tournament_standings_tournament_id_round_id_player_id_key
        UNIQUE (tournament_id, round_id, player_id);
    END IF;
END $$;

COMMENT ON CONSTRAINT tournament_standings_tournament_id_round_id_player_id_key ON tournament_standings
IS 'Ensures no duplicate standings entries for same tournament/round/player combination';
