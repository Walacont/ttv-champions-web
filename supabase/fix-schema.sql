-- SC Champions - Schema Fix für Migration
-- =========================================
-- Dieses Script muss im Supabase SQL Editor ausgeführt werden
-- BEVOR die Migration erneut läuft

-- =========================================
-- SCHRITT 1: Bestehende Daten löschen
-- =========================================
-- (Die Firebase-Daten bleiben natürlich erhalten!)

-- Löschen in umgekehrter Reihenfolge der Abhängigkeiten
TRUNCATE TABLE completed_exercises CASCADE;
TRUNCATE TABLE completed_challenges CASCADE;
TRUNCATE TABLE exercise_milestones CASCADE;
TRUNCATE TABLE streaks CASCADE;
TRUNCATE TABLE xp_history CASCADE;
TRUNCATE TABLE points_history CASCADE;
TRUNCATE TABLE invitation_codes CASCADE;
TRUNCATE TABLE challenges CASCADE;
TRUNCATE TABLE attendance CASCADE;
TRUNCATE TABLE training_sessions CASCADE;
TRUNCATE TABLE doubles_match_requests CASCADE;
TRUNCATE TABLE doubles_matches CASCADE;
TRUNCATE TABLE match_proposals CASCADE;
TRUNCATE TABLE match_requests CASCADE;
TRUNCATE TABLE matches CASCADE;
TRUNCATE TABLE leave_club_requests CASCADE;
TRUNCATE TABLE club_requests CASCADE;
TRUNCATE TABLE subgroup_members CASCADE;
TRUNCATE TABLE subgroups CASCADE;
TRUNCATE TABLE profiles CASCADE;
TRUNCATE TABLE club_sports CASCADE;
TRUNCATE TABLE clubs CASCADE;

-- Auth users löschen (alle migrierten User)
-- WICHTIG: Das löscht ALLE User außer dem Admin!
DELETE FROM auth.users WHERE email != 'admin@scchampions.de';

-- =========================================
-- SCHRITT 2: FK Constraint von profiles entfernen
-- =========================================
-- Das erlaubt offline-User ohne auth.users Eintrag

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- =========================================
-- SCHRITT 3: Subgroups club_id NULL erlauben (temporär)
-- =========================================
-- Falls Firebase-Subgroups keinen clubId haben

ALTER TABLE subgroups ALTER COLUMN club_id DROP NOT NULL;

-- =========================================
-- FERTIG!
-- =========================================
-- Jetzt kann die Migration erneut gestartet werden
