-- Fix matches without played_at date
-- Sets played_at to created_at for all matches where played_at is NULL

UPDATE matches
SET played_at = created_at
WHERE played_at IS NULL;

-- Show results
SELECT
    COUNT(*) FILTER (WHERE played_at IS NOT NULL) as with_played_at,
    COUNT(*) FILTER (WHERE played_at IS NULL) as without_played_at
FROM matches;
