-- ============================================
-- MIGRATION: Switch Doubles Elo from Player Average to Pairing-based
-- ============================================
-- This migration changes the doubles Elo system:
-- - OLD: Team Elo = average of individual player doubles_elo_rating
-- - NEW: Team Elo = pairing's current_elo_rating (starts at 800 for new pairings)
--
-- Benefits:
-- - More accurate: A player's skill depends on their partner
-- - Simpler: One Elo per pairing, not per player
-- - Fairer: Different partnerships have different skill levels
-- ============================================

-- 1. Drop the duplicate trigger from doubles-policies.sql
-- (The main trigger in functions.sql now handles everything)
DROP TRIGGER IF EXISTS process_doubles_match_trigger ON doubles_matches;

-- 2. Update default Elo for doubles_pairings from 1000 to 800
ALTER TABLE doubles_pairings ALTER COLUMN current_elo_rating SET DEFAULT 800;

-- 3. Update existing pairings that have never played (still at 1000) to 800
UPDATE doubles_pairings
SET current_elo_rating = 800
WHERE matches_played = 0 AND current_elo_rating = 1000;

-- 4. Note: We keep the profiles.doubles_elo_rating column for now
-- It can be removed in a future migration if no longer needed

-- ============================================
-- VERIFY: Run this to check the changes
-- ============================================
-- SELECT id, current_elo_rating, matches_played FROM doubles_pairings ORDER BY current_elo_rating DESC;
