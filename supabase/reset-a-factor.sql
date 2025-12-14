-- =============================================================================
-- RESET A-FACTOR FOR ALL PLAYERS (Initialization Phase)
-- =============================================================================
-- This resets singles_matches_played to 0 for all players.
-- This puts everyone in the "initialization phase" with A-Factor 32.
--
-- IMPORTANT: This does NOT delete any matches!
-- The match history remains intact.
-- =============================================================================

-- Show current state
SELECT
    'Vor Reset' as status,
    COUNT(*) as total_players,
    COUNT(CASE WHEN singles_matches_played >= 21 THEN 1 END) as established_players,
    COUNT(CASE WHEN singles_matches_played BETWEEN 11 AND 20 THEN 1 END) as stabilizing_players,
    COUNT(CASE WHEN singles_matches_played BETWEEN 1 AND 10 THEN 1 END) as new_players,
    COUNT(CASE WHEN singles_matches_played = 0 OR singles_matches_played IS NULL THEN 1 END) as zero_games
FROM profiles;

-- Reset singles_matches_played to 0 for all players
-- This gives everyone A-Factor 32 (initialization phase)
UPDATE profiles
SET singles_matches_played = 0;

-- Also reset doubles matches played if you want doubles to restart too
-- UPDATE profiles SET doubles_matches_played = 0;

-- Show result
SELECT
    'Nach Reset' as status,
    COUNT(*) as total_players,
    COUNT(CASE WHEN singles_matches_played = 0 THEN 1 END) as players_with_factor_32
FROM profiles;

-- Verify matches are still there
SELECT
    'Matches intakt' as status,
    (SELECT COUNT(*) FROM matches) as einzel_matches,
    (SELECT COUNT(*) FROM doubles_matches) as doppel_matches;

-- =============================================================================
-- OPTIONAL: Set Ü18 players to 1000 ELO
-- =============================================================================
-- This sets all players 18+ years old to exactly 1000 ELO

-- First show who will be affected:
SELECT
    display_name,
    birthdate,
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthdate::DATE))::INTEGER as age,
    elo_rating as current_elo
FROM profiles
WHERE birthdate IS NOT NULL
  AND birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthdate::DATE)) >= 18
ORDER BY display_name;

-- Set Ü18 to 1000 ELO:
UPDATE profiles
SET elo_rating = 1000,
    highest_elo = GREATEST(highest_elo, 1000)
WHERE birthdate IS NOT NULL
  AND birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthdate::DATE)) >= 18;

-- =============================================================================
-- OPTIONAL: Set U18 players to 800 ELO
-- =============================================================================
-- Uncomment if you want to reset U18 players to 800:
/*
UPDATE profiles
SET elo_rating = 800,
    highest_elo = GREATEST(highest_elo, 800)
WHERE birthdate IS NOT NULL
  AND birthdate::TEXT ~ '^\d{4}-\d{2}-\d{2}$'
  AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, birthdate::DATE)) < 18;
*/

-- =============================================================================
-- ERKLÄRUNG
-- =============================================================================
-- Nach diesem Reset:
-- - Alle Spieler haben A-Faktor 32 (weil singles_matches_played = 0)
-- - Die nächsten 10 Spiele: Faktor 32 (schnelles Einpendeln)
-- - Spiele 11-20: Faktor 24 (Stabilisierung)
-- - Ab Spiel 21: Faktor 16 (etabliert)
-- - Jugendliche (U21): Faktor 20 (dauerhaft)
--
-- Die Match-Historie bleibt vollständig erhalten!
-- =============================================================================
