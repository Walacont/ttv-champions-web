-- Script to find and fix duplicate matches from today
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)

-- Step 1: View duplicate matches from today (same players within same minute)
-- This shows which matches will be affected
SELECT
    m1.id as match_to_delete,
    m1.player_a_id,
    m1.player_b_id,
    m1.winner_id,
    m1.loser_id,
    m1.winner_elo_change,
    m1.loser_elo_change,
    m1.created_at,
    m2.id as original_match_id,
    m2.created_at as original_created_at
FROM matches m1
INNER JOIN matches m2 ON (
    -- Same players (in either order)
    ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
     (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
    -- m2 is the original (created first)
    AND m2.created_at < m1.created_at
    -- Both from today
    AND DATE(m1.created_at) = CURRENT_DATE
    AND DATE(m2.created_at) = CURRENT_DATE
)
ORDER BY m1.player_a_id, m1.player_b_id, m1.created_at;

-- Step 2: Show affected players and their stat corrections needed
-- (Run this to see what will be corrected)
WITH duplicates AS (
    SELECT
        m1.id,
        m1.winner_id,
        m1.loser_id,
        m1.winner_elo_change,
        m1.loser_elo_change
    FROM matches m1
    INNER JOIN matches m2 ON (
        ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
         (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
        AND m2.created_at < m1.created_at
        AND DATE(m1.created_at) = CURRENT_DATE
        AND DATE(m2.created_at) = CURRENT_DATE
    )
)
SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.elo_rating as current_elo,
    p.wins as current_wins,
    p.losses as current_losses,
    SUM(CASE WHEN d.winner_id = p.id THEN -d.winner_elo_change ELSE 0 END) +
    SUM(CASE WHEN d.loser_id = p.id THEN -d.loser_elo_change ELSE 0 END) as elo_correction,
    COUNT(CASE WHEN d.winner_id = p.id THEN 1 END) as wins_to_remove,
    COUNT(CASE WHEN d.loser_id = p.id THEN 1 END) as losses_to_remove
FROM profiles p
LEFT JOIN duplicates d ON p.id = d.winner_id OR p.id = d.loser_id
WHERE d.id IS NOT NULL
GROUP BY p.id, p.first_name, p.last_name, p.elo_rating, p.wins, p.losses;

-- ===================================================
-- EXECUTE THE FOLLOWING TO FIX (after reviewing above)
-- ===================================================

-- Step 3: Update player stats (wins, losses, elo) - UNCOMMENT TO RUN
/*
WITH duplicates AS (
    SELECT
        m1.id,
        m1.winner_id,
        m1.loser_id,
        m1.winner_elo_change,
        m1.loser_elo_change
    FROM matches m1
    INNER JOIN matches m2 ON (
        ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
         (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
        AND m2.created_at < m1.created_at
        AND DATE(m1.created_at) = CURRENT_DATE
        AND DATE(m2.created_at) = CURRENT_DATE
    )
),
corrections AS (
    SELECT
        p.id,
        SUM(CASE WHEN d.winner_id = p.id THEN -d.winner_elo_change ELSE 0 END) +
        SUM(CASE WHEN d.loser_id = p.id THEN -d.loser_elo_change ELSE 0 END) as elo_correction,
        COUNT(CASE WHEN d.winner_id = p.id THEN 1 END) as wins_to_remove,
        COUNT(CASE WHEN d.loser_id = p.id THEN 1 END) as losses_to_remove
    FROM profiles p
    INNER JOIN duplicates d ON p.id = d.winner_id OR p.id = d.loser_id
    GROUP BY p.id
)
UPDATE profiles p
SET
    elo_rating = GREATEST(100, p.elo_rating + c.elo_correction),
    wins = GREATEST(0, COALESCE(p.wins, 0) - c.wins_to_remove),
    losses = GREATEST(0, COALESCE(p.losses, 0) - c.losses_to_remove),
    matches_played = GREATEST(0, COALESCE(p.matches_played, 0) - c.wins_to_remove - c.losses_to_remove)
FROM corrections c
WHERE p.id = c.id;
*/

-- Step 4: Delete duplicate matches - UNCOMMENT TO RUN
/*
DELETE FROM matches m1
USING matches m2
WHERE (
    ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
     (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
    AND m2.created_at < m1.created_at
    AND DATE(m1.created_at) = CURRENT_DATE
    AND DATE(m2.created_at) = CURRENT_DATE
);
*/

-- Step 5: Verify no duplicates remain
SELECT
    COUNT(*) as remaining_duplicates
FROM matches m1
INNER JOIN matches m2 ON (
    ((m1.player_a_id = m2.player_a_id AND m1.player_b_id = m2.player_b_id) OR
     (m1.player_a_id = m2.player_b_id AND m1.player_b_id = m2.player_a_id))
    AND m2.created_at < m1.created_at
    AND DATE(m1.created_at) = CURRENT_DATE
    AND DATE(m2.created_at) = CURRENT_DATE
);
