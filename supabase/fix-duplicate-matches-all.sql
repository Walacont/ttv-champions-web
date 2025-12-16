-- Script to find and fix ALL duplicate matches in the database
-- Criteria: Same players, created within 5 minutes, same scores (or both NULL)
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)

-- Step 1: View ALL duplicate matches (same players, same scores, within 5 minutes)
-- This shows which matches will be affected
SELECT
    m1.id as match_to_delete,
    m1.player_a_id,
    m1.player_b_id,
    m1.score_a,
    m1.score_b,
    m1.winner_id,
    m1.loser_id,
    m1.winner_elo_change,
    m1.loser_elo_change,
    m1.season_points_awarded,
    m1.created_at,
    m2.id as original_match_id,
    m2.created_at as original_created_at,
    EXTRACT(EPOCH FROM (m1.created_at - m2.created_at)) as seconds_apart
FROM matches m1
INNER JOIN matches m2 ON (
    -- Same players (in either order)
    ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
     (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
    -- Same scores (handles NULL correctly)
    AND m1.score_a IS NOT DISTINCT FROM m2.score_a
    AND m1.score_b IS NOT DISTINCT FROM m2.score_b
    -- m2 is the original (use ID as tiebreaker for same timestamp)
    AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
    -- Created within 5 minutes of each other
    AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
)
ORDER BY m1.created_at DESC, m1.player_a_id, m1.player_b_id;

-- Step 2: Show affected players and their FULL stat corrections needed
-- Including: elo, wins, losses, XP, and season points
WITH duplicates AS (
    SELECT
        m1.id,
        m1.winner_id,
        m1.loser_id,
        m1.winner_elo_change,
        m1.loser_elo_change,
        -- XP for winner = winner_elo_change (0 for handicap matches)
        CASE WHEN m1.handicap IS NOT NULL THEN 0 ELSE COALESCE(m1.winner_elo_change, 0) END as winner_xp,
        -- Season points = season_points_awarded or elo_change * 0.2
        COALESCE(m1.season_points_awarded, ROUND(COALESCE(m1.winner_elo_change, 0) * 0.2)) as season_points,
        m1.created_at
    FROM matches m1
    INNER JOIN matches m2 ON (
        ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
         (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
        AND m1.score_a IS NOT DISTINCT FROM m2.score_a
        AND m1.score_b IS NOT DISTINCT FROM m2.score_b
        AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
        AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
    )
)
SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.elo_rating as current_elo,
    p.wins as current_wins,
    p.losses as current_losses,
    p.xp as current_xp,
    p.points as current_season_points,
    -- Corrections needed:
    SUM(CASE WHEN d.winner_id = p.id THEN -d.winner_elo_change ELSE 0 END) +
    SUM(CASE WHEN d.loser_id = p.id THEN -d.loser_elo_change ELSE 0 END) as elo_correction,
    COUNT(CASE WHEN d.winner_id = p.id THEN 1 END) as wins_to_remove,
    COUNT(CASE WHEN d.loser_id = p.id THEN 1 END) as losses_to_remove,
    COUNT(DISTINCT d.id) as matches_to_remove,
    SUM(CASE WHEN d.winner_id = p.id THEN -d.winner_xp ELSE 0 END) as xp_correction,
    SUM(CASE WHEN d.winner_id = p.id THEN -d.season_points ELSE 0 END) as season_points_correction
FROM profiles p
LEFT JOIN duplicates d ON p.id = d.winner_id OR p.id = d.loser_id
WHERE d.id IS NOT NULL
GROUP BY p.id, p.first_name, p.last_name, p.elo_rating, p.wins, p.losses, p.xp, p.points
ORDER BY COUNT(DISTINCT d.id) DESC;

-- Step 3: Count total duplicates found
SELECT COUNT(*) as total_duplicates_to_delete
FROM matches m1
INNER JOIN matches m2 ON (
    ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
     (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
    AND m1.score_a IS NOT DISTINCT FROM m2.score_a
    AND m1.score_b IS NOT DISTINCT FROM m2.score_b
    AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
    AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
);

-- ===================================================
-- EXECUTE THE FOLLOWING TO FIX (after reviewing above)
-- ===================================================

-- Step 4: Update player stats (elo, wins, losses, XP, season points) - UNCOMMENT TO RUN
/*
WITH duplicates AS (
    SELECT
        m1.id,
        m1.winner_id,
        m1.loser_id,
        m1.winner_elo_change,
        m1.loser_elo_change,
        -- XP for winner = winner_elo_change (0 for handicap matches)
        CASE WHEN m1.handicap IS NOT NULL THEN 0 ELSE COALESCE(m1.winner_elo_change, 0) END as winner_xp,
        -- Season points = season_points_awarded or elo_change * 0.2
        COALESCE(m1.season_points_awarded, ROUND(COALESCE(m1.winner_elo_change, 0) * 0.2)) as season_points
    FROM matches m1
    INNER JOIN matches m2 ON (
        ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
         (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
        AND m1.score_a IS NOT DISTINCT FROM m2.score_a
        AND m1.score_b IS NOT DISTINCT FROM m2.score_b
        AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
        AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
    )
),
corrections AS (
    SELECT
        p.id,
        SUM(CASE WHEN d.winner_id = p.id THEN -d.winner_elo_change ELSE 0 END) +
        SUM(CASE WHEN d.loser_id = p.id THEN -d.loser_elo_change ELSE 0 END) as elo_correction,
        COUNT(CASE WHEN d.winner_id = p.id THEN 1 END) as wins_to_remove,
        COUNT(CASE WHEN d.loser_id = p.id THEN 1 END) as losses_to_remove,
        SUM(CASE WHEN d.winner_id = p.id THEN -d.winner_xp ELSE 0 END) as xp_correction,
        SUM(CASE WHEN d.winner_id = p.id THEN -d.season_points ELSE 0 END) as season_points_correction
    FROM profiles p
    INNER JOIN duplicates d ON p.id = d.winner_id OR p.id = d.loser_id
    GROUP BY p.id
)
UPDATE profiles p
SET
    elo_rating = GREATEST(100, p.elo_rating + c.elo_correction),
    wins = GREATEST(0, COALESCE(p.wins, 0) - c.wins_to_remove),
    losses = GREATEST(0, COALESCE(p.losses, 0) - c.losses_to_remove),
    xp = GREATEST(0, COALESCE(p.xp, 0) + c.xp_correction),
    points = GREATEST(0, COALESCE(p.points, 0) + c.season_points_correction)
FROM corrections c
WHERE p.id = c.id;
*/

-- Step 5: Delete points_history entries for duplicate matches - UNCOMMENT TO RUN
/*
DELETE FROM points_history
WHERE reason LIKE 'match_%'
AND timestamp IN (
    SELECT m1.created_at
    FROM matches m1
    INNER JOIN matches m2 ON (
        ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
         (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
        AND m1.score_a IS NOT DISTINCT FROM m2.score_a
        AND m1.score_b IS NOT DISTINCT FROM m2.score_b
        AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
        AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
    )
);
*/

-- Step 6: Delete duplicate matches - UNCOMMENT TO RUN
/*
DELETE FROM matches
WHERE id IN (
    SELECT m1.id
    FROM matches m1
    INNER JOIN matches m2 ON (
        ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
         (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
        AND m1.score_a IS NOT DISTINCT FROM m2.score_a
        AND m1.score_b IS NOT DISTINCT FROM m2.score_b
        AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
        AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
    )
);
*/

-- Step 7: Verify no duplicates remain
SELECT COUNT(*) as remaining_duplicates
FROM matches m1
INNER JOIN matches m2 ON (
    ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
     (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
    AND m1.score_a IS NOT DISTINCT FROM m2.score_a
    AND m1.score_b IS NOT DISTINCT FROM m2.score_b
    AND (m2.created_at < m1.created_at OR (m2.created_at = m1.created_at AND m2.id < m1.id))
    AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) <= 300
);
