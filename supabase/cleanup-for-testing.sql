-- ============================================
-- CLEANUP SCRIPT für Testing
-- Löscht: Players (NICHT Coaches/Admins), Exercises, Challenges, Subgroups
-- ============================================

-- WICHTIG: Dieses Skript führt unwiderrufliche Löschungen durch!
-- Nur in der Test-/Entwicklungsumgebung ausführen!

BEGIN;

-- ============================================
-- 1. ÜBUNGEN (Exercises) löschen
-- ============================================

TRUNCATE TABLE completed_exercises CASCADE;
TRUNCATE TABLE exercise_milestones CASCADE;
TRUNCATE TABLE exercises CASCADE;

-- ============================================
-- 2. CHALLENGES löschen
-- ============================================

TRUNCATE TABLE completed_challenges CASCADE;
TRUNCATE TABLE challenges CASCADE;

-- ============================================
-- 3. UNTERGRUPPEN (Subgroups) löschen
-- ============================================

TRUNCATE TABLE subgroup_members CASCADE;
TRUNCATE TABLE streaks CASCADE;
TRUNCATE TABLE subgroups CASCADE;

-- ============================================
-- 4. PLAYER PROFILES löschen (NICHT Coaches/Admins)
-- ============================================

-- Alle zugehörigen Daten von Playern löschen
-- Diese werden automatisch durch CASCADE gelöscht, aber wir sind explizit:

-- Player-bezogene Daten
DELETE FROM xp_history WHERE user_id IN (SELECT id FROM profiles WHERE role = 'player');
DELETE FROM points_history WHERE user_id IN (SELECT id FROM profiles WHERE role = 'player');
DELETE FROM attendance WHERE user_id IN (SELECT id FROM profiles WHERE role = 'player');

-- Match-Requests von Playern
DELETE FROM match_requests WHERE player_a_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR player_b_id IN (SELECT id FROM profiles WHERE role = 'player');

-- Match Proposals von Playern
DELETE FROM match_proposals WHERE requester_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR recipient_id IN (SELECT id FROM profiles WHERE role = 'player');

-- Doubles Match Requests von Playern
DELETE FROM doubles_match_requests WHERE initiated_by IN (SELECT id FROM profiles WHERE role = 'player')
   OR (team_a->>'player1_id')::uuid IN (SELECT id FROM profiles WHERE role = 'player')
   OR (team_a->>'player2_id')::uuid IN (SELECT id FROM profiles WHERE role = 'player')
   OR (team_b->>'player1_id')::uuid IN (SELECT id FROM profiles WHERE role = 'player')
   OR (team_b->>'player2_id')::uuid IN (SELECT id FROM profiles WHERE role = 'player');

-- Doubles Matches von Playern
DELETE FROM doubles_matches WHERE team_a_player1_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR team_a_player2_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR team_b_player1_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR team_b_player2_id IN (SELECT id FROM profiles WHERE role = 'player');

-- Doubles Pairings von Playern
DELETE FROM doubles_pairings WHERE player1_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR player2_id IN (SELECT id FROM profiles WHERE role = 'player');

-- Matches von Playern
DELETE FROM matches WHERE player_a_id IN (SELECT id FROM profiles WHERE role = 'player')
   OR player_b_id IN (SELECT id FROM profiles WHERE role = 'player');

-- Club Requests von Playern
DELETE FROM club_requests WHERE player_id IN (SELECT id FROM profiles WHERE role = 'player');
DELETE FROM leave_club_requests WHERE player_id IN (SELECT id FROM profiles WHERE role = 'player');

-- ENDLICH: Die Player Profiles löschen
DELETE FROM profiles WHERE role = 'player';

-- ============================================
-- Zusammenfassung ausgeben
-- ============================================

DO $$
DECLARE
    coach_count INTEGER;
    admin_count INTEGER;
    player_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO coach_count FROM profiles WHERE role = 'coach';
    SELECT COUNT(*) INTO admin_count FROM profiles WHERE role = 'admin';
    SELECT COUNT(*) INTO player_count FROM profiles WHERE role = 'player';

    RAISE NOTICE '============================================';
    RAISE NOTICE 'CLEANUP ABGESCHLOSSEN';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Verbleibende Profile:';
    RAISE NOTICE '  - Coaches: %', coach_count;
    RAISE NOTICE '  - Admins: %', admin_count;
    RAISE NOTICE '  - Players: %', player_count;
    RAISE NOTICE '';
    RAISE NOTICE 'Gelöscht:';
    RAISE NOTICE '  ✓ Alle Player Profiles';
    RAISE NOTICE '  ✓ Alle Exercises';
    RAISE NOTICE '  ✓ Alle Challenges';
    RAISE NOTICE '  ✓ Alle Subgroups';
    RAISE NOTICE '  ✓ Alle zugehörigen Matches, Requests, etc.';
    RAISE NOTICE '============================================';
END $$;

COMMIT;
