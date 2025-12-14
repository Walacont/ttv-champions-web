-- =============================================================================
-- FIX HEAD_COACH DEFAULTS
-- =============================================================================
-- Sets grundlagen_completed = 5 and is_match_ready = true for all head_coaches
-- who were migrated without these values
-- =============================================================================

-- Show current state
SELECT
    display_name,
    role,
    grundlagen_completed,
    is_match_ready
FROM profiles
WHERE role = 'head_coach'
ORDER BY display_name;

-- Update head_coaches
UPDATE profiles
SET
    grundlagen_completed = 5,
    is_match_ready = true
WHERE role = 'head_coach'
  AND (grundlagen_completed < 5 OR is_match_ready = false OR is_match_ready IS NULL);

-- Also update coaches if needed
UPDATE profiles
SET
    grundlagen_completed = 5,
    is_match_ready = true
WHERE role = 'coach'
  AND (grundlagen_completed < 5 OR is_match_ready = false OR is_match_ready IS NULL);

-- Show results
SELECT
    role,
    COUNT(*) as count,
    SUM(CASE WHEN is_match_ready = true THEN 1 ELSE 0 END) as match_ready_count,
    AVG(grundlagen_completed) as avg_grundlagen
FROM profiles
WHERE role IN ('head_coach', 'coach')
GROUP BY role;
