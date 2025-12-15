-- =====================================================
-- Fix: Remove duplicate doubles match trigger
-- =====================================================
-- Problem: Both trigger_process_doubles_match AND process_doubles_match_trigger
-- were processing doubles matches, causing:
-- 1. Duplicate pairings
-- 2. Double ELO calculations
-- 3. Incorrect win/loss counts
--
-- Solution: Drop process_doubles_match_trigger (from doubles-policies.sql)
-- and keep trigger_process_doubles_match (from functions.sql) which has
-- correct pairing ID creation logic
-- =====================================================

-- Drop the duplicate trigger
DROP TRIGGER IF EXISTS process_doubles_match_trigger ON doubles_matches;

-- Verify only one trigger remains
SELECT 'Doubles match triggers after cleanup:' as status;
SELECT tgname as trigger_name, tgtype, pg_get_triggerdef(oid) as definition
FROM pg_trigger
WHERE tgrelid = 'doubles_matches'::regclass
AND NOT tgisinternal;

-- Optional: Clean up duplicate pairings (run this manually if needed)
-- This will show duplicates:
SELECT
    player1_id,
    player2_id,
    COUNT(*) as duplicate_count,
    array_agg(id) as pairing_ids
FROM doubles_pairings
GROUP BY player1_id, player2_id
HAVING COUNT(*) > 1;

-- Note: To fix existing data, you may need to:
-- 1. Delete duplicate pairings (keep the one with most matches)
-- 2. Recalculate ELO from scratch
-- 3. Reset match counts

SELECT 'Fix applied! Only trigger_process_doubles_match should remain.' as result;
