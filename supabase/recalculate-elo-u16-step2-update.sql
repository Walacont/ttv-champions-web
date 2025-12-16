-- ===================================================
-- STEP 2: Update ELO ratings for all ü16 players
-- Only run this AFTER reviewing Step 1!
-- ===================================================

-- Update players WITH matches
WITH player_elo_changes AS (
    SELECT
        winner_id as player_id,
        SUM(COALESCE(winner_elo_change, 0)) as total_change
    FROM matches
    WHERE winner_id IS NOT NULL
    GROUP BY winner_id

    UNION ALL

    SELECT
        loser_id as player_id,
        SUM(COALESCE(loser_elo_change, 0)) as total_change
    FROM matches
    WHERE loser_id IS NOT NULL
    GROUP BY loser_id
),
aggregated_changes AS (
    SELECT
        player_id,
        SUM(total_change) as total_elo_change
    FROM player_elo_changes
    GROUP BY player_id
)
UPDATE profiles p
SET elo_rating = GREATEST(100, 1000 + COALESCE(ac.total_elo_change, 0))
FROM aggregated_changes ac
WHERE p.id = ac.player_id
  AND p.birthdate IS NOT NULL
  AND p.birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE)) >= 16
  AND p.role = 'player';

-- Also reset ü16 players with NO matches to 1000
UPDATE profiles p
SET elo_rating = 1000
WHERE p.birthdate IS NOT NULL
  AND p.birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE)) >= 16
  AND p.role = 'player'
  AND NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.winner_id = p.id OR m.loser_id = p.id
  );
