-- ===================================================
-- STEP 1: Preview - Show all ü16 players and their recalculated ELO
-- Run this FIRST to see what will change
-- ===================================================

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
SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.birthdate,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE))::INTEGER as age,
    p.elo_rating as current_elo,
    COALESCE(ac.total_elo_change, 0) as total_elo_from_matches,
    1000 + COALESCE(ac.total_elo_change, 0) as new_elo,
    p.elo_rating - (1000 + COALESCE(ac.total_elo_change, 0)) as difference
FROM profiles p
LEFT JOIN aggregated_changes ac ON p.id = ac.player_id
WHERE p.birthdate IS NOT NULL
  AND p.birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE)) >= 16
  AND p.role = 'player'
ORDER BY p.last_name, p.first_name;
