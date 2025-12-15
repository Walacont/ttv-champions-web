-- =============================================================================
-- Delete all duplicate data from migration
-- =============================================================================

-- =============================================================================
-- 1. DELETE DUPLICATE MATCHES (Singles)
-- =============================================================================
-- Duplicates: same players, same date, same sets
WITH duplicate_matches AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY player_a_id, player_b_id, DATE(played_at), sets::text
            ORDER BY created_at ASC
        ) as rn
    FROM matches
)
DELETE FROM matches
WHERE id IN (SELECT id FROM duplicate_matches WHERE rn > 1);

-- =============================================================================
-- 2. DELETE DUPLICATE DOUBLES MATCHES
-- =============================================================================
WITH duplicate_doubles AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY
                team_a_player1_id, team_a_player2_id,
                team_b_player1_id, team_b_player2_id,
                DATE(created_at), sets::text
            ORDER BY created_at ASC
        ) as rn
    FROM doubles_matches
)
DELETE FROM doubles_matches
WHERE id IN (SELECT id FROM duplicate_doubles WHERE rn > 1);

-- =============================================================================
-- 3. DELETE DUPLICATE DOUBLES PAIRINGS
-- =============================================================================
WITH duplicate_pairings AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY player1_id, player2_id, club_id
            ORDER BY created_at ASC
        ) as rn
    FROM doubles_pairings
)
DELETE FROM doubles_pairings
WHERE id IN (SELECT id FROM duplicate_pairings WHERE rn > 1);

-- =============================================================================
-- 4. DELETE DUPLICATE PROFILES
-- =============================================================================
-- Duplicates by email
WITH duplicates AS (
    SELECT
        id,
        email,
        ROW_NUMBER() OVER (
            PARTITION BY email
            ORDER BY
                (COALESCE(wins, 0) + COALESCE(losses, 0)) DESC,
                COALESCE(points, 0) DESC,
                COALESCE(xp, 0) DESC,
                created_at ASC
        ) as rn
    FROM profiles
    WHERE email IS NOT NULL
),
to_delete AS (
    SELECT id FROM duplicates WHERE rn > 1
)
DELETE FROM profiles
WHERE id IN (SELECT id FROM to_delete);

-- Duplicates by name
WITH duplicates_by_name AS (
    SELECT
        id,
        first_name,
        last_name,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(first_name), LOWER(last_name)
            ORDER BY
                (COALESCE(wins, 0) + COALESCE(losses, 0)) DESC,
                COALESCE(points, 0) DESC,
                COALESCE(xp, 0) DESC,
                created_at ASC
        ) as rn
    FROM profiles
    WHERE first_name IS NOT NULL AND last_name IS NOT NULL
),
to_delete_by_name AS (
    SELECT id FROM duplicates_by_name WHERE rn > 1
)
DELETE FROM profiles
WHERE id IN (SELECT id FROM to_delete_by_name);

-- =============================================================================
-- 5. SHOW RESULTS
-- =============================================================================
SELECT 'Matches remaining:' as info, COUNT(*) as count FROM matches
UNION ALL
SELECT 'Doubles matches remaining:', COUNT(*) FROM doubles_matches
UNION ALL
SELECT 'Doubles pairings remaining:', COUNT(*) FROM doubles_pairings
UNION ALL
SELECT 'Profiles remaining:', COUNT(*) FROM profiles;
