-- Script to recalculate ELO ratings for all ü16 players
-- Starting from 1000 + sum of all match elo changes
-- Run this in Supabase SQL Editor

-- Step 1: Preview - Show all ü16 players and their recalculated ELO
-- This shows what will change WITHOUT making any changes
WITH player_elo_changes AS (
    -- Sum up all ELO changes from wins
    SELECT
        winner_id as player_id,
        SUM(COALESCE(winner_elo_change, 0)) as total_change
    FROM matches
    WHERE winner_id IS NOT NULL
    GROUP BY winner_id

    UNION ALL

    -- Sum up all ELO changes from losses (these are negative)
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

-- Step 2: Count affected players
SELECT COUNT(*) as total_u16_players
FROM profiles p
WHERE p.birthdate IS NOT NULL
  AND p.birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE)) >= 16
  AND p.role = 'player';

-- ===================================================
-- EXECUTE THE FOLLOWING TO FIX (after reviewing above)
-- ===================================================

-- Step 3: Update ELO ratings for all ü16 players - UNCOMMENT TO RUN
/*
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
*/

-- Step 4: Also reset ü16 players with NO matches to 1000 - UNCOMMENT TO RUN
/*
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
*/

-- Step 5: Verify - Show updated ELO ratings
SELECT
    p.first_name,
    p.last_name,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE))::INTEGER as age,
    p.elo_rating,
    p.wins,
    p.losses
FROM profiles p
WHERE p.birthdate IS NOT NULL
  AND p.birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, p.birthdate::DATE)) >= 16
  AND p.role = 'player'
ORDER BY p.elo_rating DESC;
