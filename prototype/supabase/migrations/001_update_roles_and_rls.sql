-- ============================================
-- Migration: head_coach Rolle und RLS-Policies
-- Für TTV Champions Prototyp
-- ============================================

-- 1. Role-Constraint aktualisieren (head_coach hinzufügen)
-- ============================================
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('player', 'coach', 'head_coach', 'admin'));

-- 2. Bestehende Policies löschen (falls vorhanden)
-- ============================================

-- CLUBS
DROP POLICY IF EXISTS "Clubs sind öffentlich lesbar" ON clubs;
DROP POLICY IF EXISTS "Coaches können Clubs verwalten" ON clubs;

-- SUBGROUPS
DROP POLICY IF EXISTS "Subgroups sind für Vereinsmitglieder lesbar" ON subgroups;
DROP POLICY IF EXISTS "Coaches können Subgroups verwalten" ON subgroups;

-- PROFILES
DROP POLICY IF EXISTS "Profiles sind öffentlich lesbar" ON profiles;
DROP POLICY IF EXISTS "Eigenes Profil erstellen" ON profiles;
DROP POLICY IF EXISTS "Eigenes Profil bearbeiten" ON profiles;
DROP POLICY IF EXISTS "Coaches können Vereinsmitglieder bearbeiten" ON profiles;
DROP POLICY IF EXISTS "Coaches können Offline-Spieler erstellen" ON profiles;

-- LOGIN_CODES
DROP POLICY IF EXISTS "Login-Codes können abgefragt werden" ON login_codes;
DROP POLICY IF EXISTS "Login-Codes können aktualisiert werden" ON login_codes;
DROP POLICY IF EXISTS "Coaches können Login-Codes erstellen" ON login_codes;
DROP POLICY IF EXISTS "Coaches können Login-Codes löschen" ON login_codes;

-- SEASONS
DROP POLICY IF EXISTS "Seasons sind für Vereinsmitglieder lesbar" ON seasons;
DROP POLICY IF EXISTS "Coaches können Seasons verwalten" ON seasons;

-- XP_HISTORY
DROP POLICY IF EXISTS "Eigene XP-Historie lesbar" ON xp_history;
DROP POLICY IF EXISTS "Coaches können XP vergeben" ON xp_history;
DROP POLICY IF EXISTS "System kann XP vergeben" ON xp_history;

-- POINTS_HISTORY
DROP POLICY IF EXISTS "Eigene Punkte-Historie lesbar" ON points_history;
DROP POLICY IF EXISTS "Coaches können Punkte vergeben" ON points_history;
DROP POLICY IF EXISTS "System kann Punkte vergeben" ON points_history;

-- TRAINING_SESSIONS
DROP POLICY IF EXISTS "Trainings sind für Vereinsmitglieder lesbar" ON training_sessions;
DROP POLICY IF EXISTS "Coaches können Trainings verwalten" ON training_sessions;

-- ATTENDANCE
DROP POLICY IF EXISTS "Eigene Anwesenheit lesbar" ON attendance;
DROP POLICY IF EXISTS "Coaches können Anwesenheit im Verein sehen" ON attendance;
DROP POLICY IF EXISTS "Coaches können Anwesenheit verwalten" ON attendance;

-- STREAKS
DROP POLICY IF EXISTS "Eigene Streaks lesbar" ON streaks;
DROP POLICY IF EXISTS "Eigene Streaks verwalten" ON streaks;
DROP POLICY IF EXISTS "Coaches können Streaks verwalten" ON streaks;

-- MATCHES
DROP POLICY IF EXISTS "Matches sind öffentlich lesbar" ON matches;
DROP POLICY IF EXISTS "Beteiligte können Matches erstellen" ON matches;
DROP POLICY IF EXISTS "Beteiligte und Coaches können Matches bearbeiten" ON matches;

-- DOUBLES_MATCHES
DROP POLICY IF EXISTS "Doppel-Matches sind öffentlich lesbar" ON doubles_matches;
DROP POLICY IF EXISTS "Beteiligte können Doppel-Matches erstellen" ON doubles_matches;
DROP POLICY IF EXISTS "Beteiligte und Coaches können Doppel-Matches bearbeiten" ON doubles_matches;

-- DOUBLES_TEAMS
DROP POLICY IF EXISTS "Doppel-Teams sind öffentlich lesbar" ON doubles_teams;
DROP POLICY IF EXISTS "Beteiligte können Doppel-Teams erstellen" ON doubles_teams;
DROP POLICY IF EXISTS "System kann Doppel-Teams aktualisieren" ON doubles_teams;

-- HEAD_TO_HEAD
DROP POLICY IF EXISTS "H2H-Stats sind für Beteiligte lesbar" ON head_to_head;
DROP POLICY IF EXISTS "System kann H2H-Stats verwalten" ON head_to_head;

-- EXERCISES
DROP POLICY IF EXISTS "Übungen sind öffentlich lesbar" ON exercises;
DROP POLICY IF EXISTS "Coaches können Übungen erstellen" ON exercises;
DROP POLICY IF EXISTS "Ersteller können Übungen bearbeiten" ON exercises;

-- COMPLETED_EXERCISES
DROP POLICY IF EXISTS "Eigene abgeschlossene Übungen lesbar" ON completed_exercises;
DROP POLICY IF EXISTS "Coaches können abgeschlossene Übungen sehen" ON completed_exercises;
DROP POLICY IF EXISTS "Coaches können Übungsabschluss eintragen" ON completed_exercises;

-- CHALLENGES
DROP POLICY IF EXISTS "Challenges sind für Vereinsmitglieder lesbar" ON challenges;
DROP POLICY IF EXISTS "Coaches können Challenges verwalten" ON challenges;

-- COMPLETED_CHALLENGES
DROP POLICY IF EXISTS "Eigene abgeschlossene Challenges lesbar" ON completed_challenges;
DROP POLICY IF EXISTS "Coaches können Challenge-Abschlüsse sehen" ON completed_challenges;
DROP POLICY IF EXISTS "Coaches können Challenge-Abschluss eintragen" ON completed_challenges;

-- ACTIVITY_FEED
DROP POLICY IF EXISTS "Feed ist für Vereinsmitglieder lesbar" ON activity_feed;
DROP POLICY IF EXISTS "Authentifizierte können Feed-Einträge erstellen" ON activity_feed;

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Eigene Benachrichtigungen lesen" ON notifications;
DROP POLICY IF EXISTS "Eigene Benachrichtigungen aktualisieren" ON notifications;
DROP POLICY IF EXISTS "Eigene Benachrichtigungen löschen" ON notifications;
DROP POLICY IF EXISTS "System kann Benachrichtigungen erstellen" ON notifications;

-- 3. RLS aktivieren (falls noch nicht aktiviert)
-- ============================================
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubles_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubles_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE head_to_head ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE completed_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 4. Neue RLS Policies erstellen
-- ============================================

-- CLUBS
CREATE POLICY "Clubs sind öffentlich lesbar" ON clubs
    FOR SELECT USING (true);

CREATE POLICY "Coaches können Clubs verwalten" ON clubs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- SUBGROUPS
CREATE POLICY "Subgroups sind für Vereinsmitglieder lesbar" ON subgroups
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = subgroups.club_id)
    );

CREATE POLICY "Coaches können Subgroups verwalten" ON subgroups
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin') AND club_id = subgroups.club_id)
    );

-- PROFILES
CREATE POLICY "Profiles sind öffentlich lesbar" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Eigenes Profil erstellen" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Eigenes Profil bearbeiten" ON profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Coaches können Vereinsmitglieder bearbeiten" ON profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
            AND p.club_id = profiles.club_id
        )
    );

-- WICHTIG: Coaches können Offline-Spieler erstellen
CREATE POLICY "Coaches können Offline-Spieler erstellen" ON profiles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- LOGIN_CODES (Wichtig für Code-Login!)
CREATE POLICY "Login-Codes können abgefragt werden" ON login_codes
    FOR SELECT USING (is_active = true);

CREATE POLICY "Login-Codes können aktualisiert werden" ON login_codes
    FOR UPDATE USING (true);

CREATE POLICY "Coaches können Login-Codes erstellen" ON login_codes
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Coaches können Login-Codes löschen" ON login_codes
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- SEASONS
CREATE POLICY "Seasons sind für Vereinsmitglieder lesbar" ON seasons
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = seasons.club_id)
    );

CREATE POLICY "Coaches können Seasons verwalten" ON seasons
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin') AND club_id = seasons.club_id)
    );

-- XP_HISTORY
CREATE POLICY "Eigene XP-Historie lesbar" ON xp_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können XP vergeben" ON xp_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "System kann XP vergeben" ON xp_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- POINTS_HISTORY
CREATE POLICY "Eigene Punkte-Historie lesbar" ON points_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Punkte vergeben" ON points_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "System kann Punkte vergeben" ON points_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- TRAINING_SESSIONS
CREATE POLICY "Trainings sind für Vereinsmitglieder lesbar" ON training_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = training_sessions.club_id)
    );

CREATE POLICY "Coaches können Trainings verwalten" ON training_sessions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin') AND club_id = training_sessions.club_id)
    );

-- ATTENDANCE
CREATE POLICY "Eigene Anwesenheit lesbar" ON attendance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Anwesenheit im Verein sehen" ON attendance
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE POLICY "Coaches können Anwesenheit verwalten" ON attendance
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- STREAKS
CREATE POLICY "Eigene Streaks lesbar" ON streaks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Eigene Streaks verwalten" ON streaks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Streaks verwalten" ON streaks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- MATCHES
CREATE POLICY "Matches sind öffentlich lesbar" ON matches
    FOR SELECT USING (true);

CREATE POLICY "Beteiligte können Matches erstellen" ON matches
    FOR INSERT WITH CHECK (
        auth.uid() IN (player_a_id, player_b_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Beteiligte und Coaches können Matches bearbeiten" ON matches
    FOR UPDATE USING (
        auth.uid() IN (player_a_id, player_b_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- DOUBLES_MATCHES
CREATE POLICY "Doppel-Matches sind öffentlich lesbar" ON doubles_matches
    FOR SELECT USING (true);

CREATE POLICY "Beteiligte können Doppel-Matches erstellen" ON doubles_matches
    FOR INSERT WITH CHECK (
        auth.uid() IN (team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Beteiligte und Coaches können Doppel-Matches bearbeiten" ON doubles_matches
    FOR UPDATE USING (
        auth.uid() IN (team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- DOUBLES_TEAMS
CREATE POLICY "Doppel-Teams sind öffentlich lesbar" ON doubles_teams
    FOR SELECT USING (true);

CREATE POLICY "Beteiligte können Doppel-Teams erstellen" ON doubles_teams
    FOR INSERT WITH CHECK (
        auth.uid() IN (player1_id, player2_id)
    );

CREATE POLICY "System kann Doppel-Teams aktualisieren" ON doubles_teams
    FOR UPDATE USING (true);

-- HEAD_TO_HEAD
CREATE POLICY "H2H-Stats sind für Beteiligte lesbar" ON head_to_head
    FOR SELECT USING (
        auth.uid() IN (player1_id, player2_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "System kann H2H-Stats verwalten" ON head_to_head
    FOR ALL USING (true);

-- EXERCISES
CREATE POLICY "Übungen sind öffentlich lesbar" ON exercises
    FOR SELECT USING (true);

CREATE POLICY "Coaches können Übungen erstellen" ON exercises
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Ersteller können Übungen bearbeiten" ON exercises
    FOR UPDATE USING (auth.uid() = created_by);

-- COMPLETED_EXERCISES
CREATE POLICY "Eigene abgeschlossene Übungen lesbar" ON completed_exercises
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können abgeschlossene Übungen sehen" ON completed_exercises
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Coaches können Übungsabschluss eintragen" ON completed_exercises
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- CHALLENGES
CREATE POLICY "Challenges sind für Vereinsmitglieder lesbar" ON challenges
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = challenges.club_id)
    );

CREATE POLICY "Coaches können Challenges verwalten" ON challenges
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin') AND club_id = challenges.club_id)
    );

-- COMPLETED_CHALLENGES
CREATE POLICY "Eigene abgeschlossene Challenges lesbar" ON completed_challenges
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Challenge-Abschlüsse sehen" ON completed_challenges
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

CREATE POLICY "Coaches können Challenge-Abschluss eintragen" ON completed_challenges
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'head_coach', 'admin'))
    );

-- ACTIVITY_FEED
CREATE POLICY "Feed ist für Vereinsmitglieder lesbar" ON activity_feed
    FOR SELECT USING (
        club_id IS NULL OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = activity_feed.club_id)
    );

CREATE POLICY "Authentifizierte können Feed-Einträge erstellen" ON activity_feed
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- NOTIFICATIONS
CREATE POLICY "Eigene Benachrichtigungen lesen" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Eigene Benachrichtigungen aktualisieren" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Eigene Benachrichtigungen löschen" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "System kann Benachrichtigungen erstellen" ON notifications
    FOR INSERT WITH CHECK (true);

-- ============================================
-- FERTIG!
-- ============================================
-- Führe dieses Script im Supabase SQL Editor aus:
-- https://supabase.com/dashboard/project/[project-id]/sql/new
