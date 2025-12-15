-- ============================================
-- CLEANUP: Remove unused views
-- ============================================
-- These views were created but are not used in the application.
-- The code queries profile_club_sports directly instead.

DROP VIEW IF EXISTS clubs_with_sport;
DROP VIEW IF EXISTS sport_leaderboard;

-- Also drop the unused function
DROP FUNCTION IF EXISTS get_clubs_for_sport(UUID);
