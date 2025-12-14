-- Delete duplicate profiles
-- Keeps the profile with the most activity (matches, points, etc.)
-- Duplicates are identified by same email

-- First, let's see what duplicates exist:
-- SELECT email, COUNT(*) as count
-- FROM profiles
-- WHERE email IS NOT NULL
-- GROUP BY email
-- HAVING COUNT(*) > 1;

-- Delete duplicates, keeping the one with highest activity
-- (based on wins + points + xp)

WITH duplicates AS (
    SELECT
        id,
        email,
        ROW_NUMBER() OVER (
            PARTITION BY email
            ORDER BY
                (COALESCE(wins, 0) + COALESCE(losses, 0)) DESC,  -- Most matches played
                COALESCE(points, 0) DESC,                         -- Most points
                COALESCE(xp, 0) DESC,                             -- Most XP
                created_at ASC                                    -- Oldest account
        ) as rn
    FROM profiles
    WHERE email IS NOT NULL
),
to_delete AS (
    SELECT id FROM duplicates WHERE rn > 1
)
DELETE FROM profiles
WHERE id IN (SELECT id FROM to_delete);

-- Also delete profiles with same first_name + last_name (if email is different/null)
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

-- Show remaining profiles
SELECT id, email, first_name, last_name, wins, losses, points, xp
FROM profiles
ORDER BY last_name, first_name;
