-- Clean up activity events from migration
-- These are flooding the activity feed

-- Option 1: Delete all club_join events from migration (same timestamp pattern)
-- This removes events created during bulk migration

-- First, see what we have:
SELECT event_type, COUNT(*), MIN(created_at), MAX(created_at)
FROM activity_events
GROUP BY event_type
ORDER BY event_type;

-- Delete club_join events that were created within the same minute (migration artifact)
-- Keep only one per user
WITH ranked_events AS (
    SELECT
        id,
        user_id,
        event_type,
        created_at,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, event_type
            ORDER BY created_at DESC
        ) as rn
    FROM activity_events
    WHERE event_type = 'club_join'
)
DELETE FROM activity_events
WHERE id IN (
    SELECT id FROM ranked_events WHERE rn > 1
);

-- Also delete rank_up events that are duplicates (keep only the newest per user/rank)
WITH ranked_rank_ups AS (
    SELECT
        id,
        user_id,
        event_data->>'rank_name' as rank_name,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, event_data->>'rank_name'
            ORDER BY created_at DESC
        ) as rn
    FROM activity_events
    WHERE event_type = 'rank_up'
)
DELETE FROM activity_events
WHERE id IN (
    SELECT id FROM ranked_rank_ups WHERE rn > 1
);

-- Show remaining events
SELECT event_type, COUNT(*)
FROM activity_events
GROUP BY event_type
ORDER BY event_type;
