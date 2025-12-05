-- Fix subgroups table: Add missing is_default column
-- Run this in the Supabase SQL Editor

-- Add is_default column to subgroups table
ALTER TABLE subgroups ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_subgroups_is_default ON subgroups(is_default);

-- Clean up old Firebase subgroup IDs from profiles
-- This removes any subgroup_ids that are not valid UUIDs
-- The regex pattern matches valid UUID format: 8-4-4-4-12 hex characters

-- First, let's see which profiles have invalid subgroup IDs (for debugging)
-- SELECT id, first_name, last_name, subgroup_ids
-- FROM profiles
-- WHERE subgroup_ids IS NOT NULL
-- AND array_length(subgroup_ids, 1) > 0
-- AND EXISTS (
--     SELECT 1 FROM unnest(subgroup_ids) AS sid
--     WHERE sid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
-- );

-- Clean up: Remove non-UUID subgroup IDs from profiles
UPDATE profiles
SET subgroup_ids = (
    SELECT COALESCE(
        array_agg(sid)::uuid[],
        '{}'::uuid[]
    )
    FROM unnest(subgroup_ids) AS sid
    WHERE sid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
WHERE subgroup_ids IS NOT NULL
AND array_length(subgroup_ids, 1) > 0
AND EXISTS (
    SELECT 1 FROM unnest(subgroup_ids) AS sid
    WHERE sid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- Verify the changes
-- SELECT COUNT(*) as profiles_with_invalid_ids FROM profiles
-- WHERE subgroup_ids IS NOT NULL
-- AND array_length(subgroup_ids, 1) > 0
-- AND EXISTS (
--     SELECT 1 FROM unnest(subgroup_ids) AS sid
--     WHERE sid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
-- );
