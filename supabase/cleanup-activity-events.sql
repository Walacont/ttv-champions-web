-- =============================================================================
-- CLEAN UP ACTIVITY EVENTS FROM MIGRATION
-- =============================================================================
-- These club_join events from migration are flooding the activity feed
-- Since each user only has one club_join event, we need to delete by date
-- =============================================================================

-- First, see what we have:
SELECT event_type, COUNT(*), MIN(created_at), MAX(created_at)
FROM activity_events
GROUP BY event_type
ORDER BY event_type;

-- =============================================================================
-- OPTION 1: Delete ALL club_join events from migration date (December 13, 2025)
-- =============================================================================
-- Use this if all club_join events are from migration:
DELETE FROM activity_events
WHERE event_type = 'club_join'
  AND created_at::date = '2025-12-13';

-- =============================================================================
-- OPTION 2: Delete club_join events created within a short timeframe
-- =============================================================================
-- This identifies bulk migration by looking at events created within 1 hour
-- Uncomment if you want to use this method instead:
/*
WITH migration_window AS (
    SELECT MIN(created_at) as start_time, MAX(created_at) as end_time
    FROM activity_events
    WHERE event_type = 'club_join'
      AND created_at >= '2025-12-13 00:00:00'
      AND created_at <= '2025-12-14 00:00:00'
)
DELETE FROM activity_events
WHERE event_type = 'club_join'
  AND created_at BETWEEN (SELECT start_time FROM migration_window)
                     AND (SELECT end_time FROM migration_window);
*/

-- =============================================================================
-- Also delete rank_up events that are duplicates (keep only the first per user/rank)
-- =============================================================================
WITH ranked_rank_ups AS (
    SELECT
        id,
        user_id,
        event_data->>'rank_name' as rank_name,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, event_data->>'rank_name'
            ORDER BY created_at ASC
        ) as rn
    FROM activity_events
    WHERE event_type = 'rank_up'
)
DELETE FROM activity_events
WHERE id IN (
    SELECT id FROM ranked_rank_ups WHERE rn > 1
);

-- =============================================================================
-- Show remaining events
-- =============================================================================
SELECT event_type, COUNT(*)
FROM activity_events
GROUP BY event_type
ORDER BY event_type;
