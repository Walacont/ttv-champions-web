-- ============================================
-- TTV Champions Prototyp - Datenbankschema
-- Für Bachelorarbeit: Gamification im Tischtennis
-- ============================================

-- Vereine
CREATE TABLE clubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Untergruppen (Basistraining, Leistungstraining, U18, etc.)
CREATE TABLE subgroups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_main_group BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spielerprofile
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birthdate DATE,
    club_id UUID REFERENCES clubs(id),
    role TEXT DEFAULT 'player' CHECK (role IN ('player', 'coach', 'admin')),

    -- Gamification-Punkte
    xp INTEGER DEFAULT 0,                    -- Experience Points (dauerhaft)
    season_points INTEGER DEFAULT 0,         -- Saisonpunkte (resetbar)
    elo_rating INTEGER DEFAULT 800,          -- Einzelwertung
    doubles_elo_rating INTEGER DEFAULT 800,  -- Doppelwertung

    -- Statistiken
    singles_matches_played INTEGER DEFAULT 0,
    singles_wins INTEGER DEFAULT 0,
    singles_losses INTEGER DEFAULT 0,
    doubles_matches_played INTEGER DEFAULT 0,
    doubles_wins INTEGER DEFAULT 0,
    doubles_losses INTEGER DEFAULT 0,
    grundlagen_completed INTEGER DEFAULT 0,  -- Für Rang-Aufstieg aus Rekrut

    -- Untergruppen-Zuordnung
    subgroup_ids UUID[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Login-Codes (für Code-basiertes Login)
CREATE TABLE login_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,           -- 6-stelliger Code
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- Index für schnelle Code-Suche
CREATE INDEX idx_login_codes_code ON login_codes(code) WHERE is_active = TRUE;

-- Saison-Verwaltung
CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id)
);

-- XP-Historie (für Nachvollziehbarkeit)
CREATE TABLE xp_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,  -- 'training', 'match_win', 'exercise', 'challenge', 'penalty'
    source_id UUID,        -- Referenz auf Match, Training, etc.
    awarded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Season Points Historie
CREATE TABLE points_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source_id UUID,
    awarded_by UUID REFERENCES profiles(id),
    season_id UUID REFERENCES seasons(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRAINING & ANWESENHEIT
-- ============================================

-- Trainingseinheiten
CREATE TABLE training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id),  -- NULL = Hauptgruppe
    title TEXT NOT NULL,
    date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES profiles(id),
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Anwesenheit
CREATE TABLE attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    session_id UUID REFERENCES training_sessions(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id),
    date DATE NOT NULL,
    present BOOLEAN DEFAULT TRUE,
    xp_awarded INTEGER DEFAULT 0,
    points_awarded INTEGER DEFAULT 0,
    is_second_session BOOLEAN DEFAULT FALSE,  -- Für abnehmende Erträge
    recorded_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, session_id)
);

-- Streaks (pro Spieler und Untergruppe)
CREATE TABLE streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    subgroup_id UUID REFERENCES subgroups(id),  -- NULL = Hauptgruppe
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_attendance_date DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, subgroup_id)
);

-- ============================================
-- MATCHES & ELO
-- ============================================

-- Einzelspiele
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id),
    player_a_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player_b_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    winner_id UUID REFERENCES profiles(id),
    loser_id UUID REFERENCES profiles(id),

    -- Satzergebnisse als JSON Array: [{player_a: 11, player_b: 9}, ...]
    sets JSONB NOT NULL DEFAULT '[]',
    player_a_sets_won INTEGER DEFAULT 0,
    player_b_sets_won INTEGER DEFAULT 0,

    -- Elo-Änderungen
    elo_change INTEGER DEFAULT 0,
    player_a_elo_before INTEGER,
    player_a_elo_after INTEGER,
    player_b_elo_before INTEGER,
    player_b_elo_after INTEGER,

    -- Handicap
    handicap_used BOOLEAN DEFAULT FALSE,
    handicap_points INTEGER DEFAULT 0,
    handicap_for_player UUID REFERENCES profiles(id),

    -- Status für Bestätigungsflow
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    created_by UUID REFERENCES profiles(id),
    confirmed_by UUID REFERENCES profiles(id),

    played_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doppelspiele
CREATE TABLE doubles_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id),

    -- Team A
    team_a_player1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    team_a_player2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    -- Team B
    team_b_player1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    team_b_player2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

    winning_team TEXT CHECK (winning_team IN ('A', 'B')),
    sets JSONB NOT NULL DEFAULT '[]',
    team_a_sets_won INTEGER DEFAULT 0,
    team_b_sets_won INTEGER DEFAULT 0,

    -- Elo-Änderungen
    elo_change INTEGER DEFAULT 0,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    created_by UUID REFERENCES profiles(id),
    confirmed_by UUID REFERENCES profiles(id),

    played_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doppel-Paarungen (für separates Doppel-Elo)
CREATE TABLE doubles_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    elo_rating INTEGER DEFAULT 800,
    matches_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player1_id, player2_id)
);

-- Head-to-Head Statistik (für Handicap-Berechnung)
CREATE TABLE head_to_head (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    player1_wins INTEGER DEFAULT 0,
    player2_wins INTEGER DEFAULT 0,
    last_winner_id UUID REFERENCES profiles(id),
    consecutive_wins INTEGER DEFAULT 0,  -- Für Bilanz-Handicap
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player1_id, player2_id)
);

-- ============================================
-- ÜBUNGEN & CHALLENGES
-- ============================================

-- Übungen (vom Admin/Coach erstellt)
CREATE TABLE exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,

    -- Typ: 'single' (Einzelübung) oder 'pair' (Paarübung)
    type TEXT DEFAULT 'single' CHECK (type IN ('single', 'pair')),
    -- Bei Paarübungen: sind beide aktiv oder einer passiv?
    pair_mode TEXT CHECK (pair_mode IN ('both_active', 'active_passive')),

    -- Punkte
    xp_reward INTEGER NOT NULL,

    -- Meilensteine (optional): [{count: 3, points: 3}, {count: 8, points: 6}, ...]
    milestones JSONB,

    -- Kategorisierung
    tags TEXT[] DEFAULT '{}',  -- z.B. ['Grundlage', 'Vorhand-Topspin', 'Beinarbeit']
    is_grundlage BOOLEAN DEFAULT FALSE,  -- Für Rekrut-Aufstieg

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abgeschlossene Übungen
CREATE TABLE completed_exercises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
    partner_id UUID REFERENCES profiles(id),  -- Bei Paarübungen
    is_active_player BOOLEAN DEFAULT TRUE,    -- Bei active_passive: aktiv oder passiv?
    score INTEGER,  -- Erreichter Wert (für Meilensteine)
    xp_awarded INTEGER NOT NULL,
    points_awarded INTEGER DEFAULT 0,
    awarded_by UUID REFERENCES profiles(id),
    session_id UUID REFERENCES training_sessions(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Challenges (vom Trainer für den eigenen Verein)
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,

    -- Belohnung
    xp_reward INTEGER NOT NULL,
    points_reward INTEGER DEFAULT 0,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,

    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abgeschlossene Challenges
CREATE TABLE completed_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
    xp_awarded INTEGER NOT NULL,
    points_awarded INTEGER DEFAULT 0,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
);

-- ============================================
-- AKTIVITÄTSFEED & BENACHRICHTIGUNGEN
-- ============================================

-- Aktivitätsfeed
CREATE TABLE activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES clubs(id),
    user_id UUID REFERENCES profiles(id),

    -- Event-Typ
    type TEXT NOT NULL CHECK (type IN (
        'match_result',      -- Spielergebnis
        'season_start',      -- Saison gestartet
        'season_end',        -- Saison beendet
        'rank_change',       -- Rangänderung
        'podium_change',     -- Top 3 Veränderung
        'challenge_completed', -- Challenge abgeschlossen
        'streak_milestone'   -- Streak-Meilenstein
    )),

    -- Daten je nach Typ
    data JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Benachrichtigungen
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

    type TEXT NOT NULL CHECK (type IN (
        'match_request',     -- Eingehende Spielanfrage
        'match_confirmed',   -- Spiel bestätigt
        'match_rejected',    -- Spiel abgelehnt
        'points_awarded',    -- Punkte erhalten
        'challenge_available', -- Neue Challenge
        'season_started',    -- Saison gestartet
        'season_ending'      -- Saison endet bald
    )),

    title TEXT NOT NULL,
    message TEXT,
    data JSONB DEFAULT '{}',

    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FUNKTIONEN & TRIGGER
-- ============================================

-- A-Faktor Berechnung nach QTTR-Verfahren
CREATE OR REPLACE FUNCTION calculate_a_factor(
    matches_played INTEGER,
    birthdate DATE
) RETURNS INTEGER AS $$
DECLARE
    age INTEGER;
BEGIN
    -- Alter berechnen
    IF birthdate IS NOT NULL THEN
        age := EXTRACT(YEAR FROM age(birthdate));
    ELSE
        age := 99;  -- Wenn kein Geburtsdatum, als Erwachsener behandeln
    END IF;

    -- Jugendliche unter 21 haben immer Faktor 20
    IF age < 21 THEN
        RETURN 20;
    END IF;

    -- Nach Spielanzahl
    IF matches_played <= 10 THEN
        RETURN 32;  -- Initialisierung
    ELSIF matches_played <= 20 THEN
        RETURN 24;  -- Stabilisierung
    ELSE
        RETURN 16;  -- Etabliert
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Erwartete Gewinnwahrscheinlichkeit
CREATE OR REPLACE FUNCTION calculate_expected_score(
    player_elo INTEGER,
    opponent_elo INTEGER
) RETURNS NUMERIC AS $$
BEGIN
    RETURN 1.0 / (1.0 + POWER(10.0, (opponent_elo - player_elo)::NUMERIC / 400.0));
END;
$$ LANGUAGE plpgsql;

-- Elo-Änderung berechnen
CREATE OR REPLACE FUNCTION calculate_elo_change(
    player_elo INTEGER,
    opponent_elo INTEGER,
    player_won BOOLEAN,
    a_factor INTEGER,
    is_handicap_match BOOLEAN DEFAULT FALSE
) RETURNS INTEGER AS $$
DECLARE
    expected NUMERIC;
    actual NUMERIC;
    change NUMERIC;
BEGIN
    -- Bei Handicap-Match: fester Wert
    IF is_handicap_match THEN
        IF player_won THEN
            RETURN 8;
        ELSE
            RETURN -8;
        END IF;
    END IF;

    -- Normale Elo-Berechnung
    expected := calculate_expected_score(player_elo, opponent_elo);
    actual := CASE WHEN player_won THEN 1.0 ELSE 0.0 END;
    change := a_factor * (actual - expected);

    RETURN ROUND(change);
END;
$$ LANGUAGE plpgsql;

-- Handicap basierend auf Elo-Differenz berechnen
CREATE OR REPLACE FUNCTION calculate_elo_handicap(
    elo_difference INTEGER
) RETURNS INTEGER AS $$
BEGIN
    IF elo_difference < 40 THEN
        RETURN 0;
    ELSIF elo_difference < 80 THEN
        RETURN 1;
    ELSIF elo_difference < 120 THEN
        RETURN 2;
    ELSIF elo_difference < 160 THEN
        RETURN 3;
    ELSIF elo_difference < 200 THEN
        RETURN 4;
    ELSIF elo_difference < 240 THEN
        RETURN 5;
    ELSIF elo_difference < 280 THEN
        RETURN 6;
    ELSE
        RETURN 7;  -- Maximum
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Handicap basierend auf direkter Bilanz berechnen
CREATE OR REPLACE FUNCTION calculate_h2h_handicap(
    consecutive_wins INTEGER
) RETURNS INTEGER AS $$
BEGIN
    IF consecutive_wins < 2 THEN
        RETURN 0;
    ELSIF consecutive_wins = 2 THEN
        RETURN 1;
    ELSIF consecutive_wins = 3 THEN
        RETURN 2;
    ELSIF consecutive_wins = 4 THEN
        RETURN 3;
    ELSIF consecutive_wins = 5 THEN
        RETURN 4;
    ELSIF consecutive_wins = 6 THEN
        RETURN 5;
    ELSIF consecutive_wins = 7 THEN
        RETURN 6;
    ELSE
        RETURN 7;  -- Maximum
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Streak-Punkte berechnen
CREATE OR REPLACE FUNCTION calculate_streak_points(
    streak_count INTEGER,
    is_second_session BOOLEAN DEFAULT FALSE
) RETURNS INTEGER AS $$
DECLARE
    base_points INTEGER;
BEGIN
    -- Basispunkte nach Streak
    IF streak_count <= 2 THEN
        base_points := 3;
    ELSIF streak_count <= 4 THEN
        base_points := 5;
    ELSE
        base_points := 6;
    END IF;

    -- Bei zweitem Training am Tag: halbe Punkte (aufgerundet)
    IF is_second_session THEN
        RETURN CEIL(base_points::NUMERIC / 2);
    END IF;

    RETURN base_points;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Nach Match-Bestätigung Elo aktualisieren
CREATE OR REPLACE FUNCTION process_match_confirmation()
RETURNS TRIGGER AS $$
DECLARE
    player_a RECORD;
    player_b RECORD;
    a_factor_a INTEGER;
    a_factor_b INTEGER;
    elo_change_a INTEGER;
    elo_change_b INTEGER;
BEGIN
    -- Nur bei Status-Änderung zu 'confirmed'
    IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
        -- Spielerdaten holen
        SELECT * INTO player_a FROM profiles WHERE id = NEW.player_a_id;
        SELECT * INTO player_b FROM profiles WHERE id = NEW.player_b_id;

        -- A-Faktoren berechnen
        a_factor_a := calculate_a_factor(player_a.singles_matches_played, player_a.birthdate);
        a_factor_b := calculate_a_factor(player_b.singles_matches_played, player_b.birthdate);

        -- Elo-Änderungen berechnen
        elo_change_a := calculate_elo_change(
            player_a.elo_rating,
            player_b.elo_rating,
            NEW.winner_id = NEW.player_a_id,
            a_factor_a,
            NEW.handicap_used
        );
        elo_change_b := calculate_elo_change(
            player_b.elo_rating,
            player_a.elo_rating,
            NEW.winner_id = NEW.player_b_id,
            a_factor_b,
            NEW.handicap_used
        );

        -- Match-Daten aktualisieren
        NEW.player_a_elo_before := player_a.elo_rating;
        NEW.player_b_elo_before := player_b.elo_rating;
        NEW.player_a_elo_after := GREATEST(400, player_a.elo_rating + elo_change_a);
        NEW.player_b_elo_after := GREATEST(400, player_b.elo_rating + elo_change_b);
        NEW.elo_change := ABS(elo_change_a);

        -- Spieler-Profile aktualisieren
        UPDATE profiles SET
            elo_rating = GREATEST(400, elo_rating + elo_change_a),
            singles_matches_played = singles_matches_played + 1,
            singles_wins = singles_wins + CASE WHEN NEW.winner_id = NEW.player_a_id THEN 1 ELSE 0 END,
            singles_losses = singles_losses + CASE WHEN NEW.winner_id = NEW.player_b_id THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE id = NEW.player_a_id;

        UPDATE profiles SET
            elo_rating = GREATEST(400, elo_rating + elo_change_b),
            singles_matches_played = singles_matches_played + 1,
            singles_wins = singles_wins + CASE WHEN NEW.winner_id = NEW.player_b_id THEN 1 ELSE 0 END,
            singles_losses = singles_losses + CASE WHEN NEW.winner_id = NEW.player_a_id THEN 1 ELSE 0 END,
            updated_at = NOW()
        WHERE id = NEW.player_b_id;

        -- XP vergeben (nur für Gewinner)
        INSERT INTO xp_history (user_id, amount, reason, source_id)
        VALUES (NEW.winner_id, 25, 'match_win', NEW.id);

        UPDATE profiles SET xp = xp + 25 WHERE id = NEW.winner_id;

        -- Season Points vergeben (basierend auf Elo-Änderung)
        -- Gewinner: Elo-Änderung * 0.2, mindestens 2 Punkte
        INSERT INTO points_history (user_id, amount, reason, source_id)
        VALUES (NEW.winner_id, GREATEST(2, ROUND(ABS(elo_change_a) * 0.2)), 'match_win', NEW.id);

        UPDATE profiles SET
            season_points = season_points + GREATEST(2, ROUND(ABS(elo_change_a) * 0.2))
        WHERE id = NEW.winner_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_match_confirmation
    BEFORE UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_confirmation();

-- Trigger: Head-to-Head aktualisieren
CREATE OR REPLACE FUNCTION update_head_to_head()
RETURNS TRIGGER AS $$
DECLARE
    p1 UUID;
    p2 UUID;
    existing RECORD;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
        -- Spieler-IDs sortieren für konsistente Speicherung
        IF NEW.player_a_id < NEW.player_b_id THEN
            p1 := NEW.player_a_id;
            p2 := NEW.player_b_id;
        ELSE
            p1 := NEW.player_b_id;
            p2 := NEW.player_a_id;
        END IF;

        -- Existierenden Eintrag suchen
        SELECT * INTO existing FROM head_to_head
        WHERE player1_id = p1 AND player2_id = p2;

        IF existing IS NULL THEN
            -- Neuen Eintrag erstellen
            INSERT INTO head_to_head (player1_id, player2_id, player1_wins, player2_wins, last_winner_id, consecutive_wins)
            VALUES (
                p1, p2,
                CASE WHEN NEW.winner_id = p1 THEN 1 ELSE 0 END,
                CASE WHEN NEW.winner_id = p2 THEN 1 ELSE 0 END,
                NEW.winner_id,
                1
            );
        ELSE
            -- Aktualisieren
            UPDATE head_to_head SET
                player1_wins = player1_wins + CASE WHEN NEW.winner_id = p1 THEN 1 ELSE 0 END,
                player2_wins = player2_wins + CASE WHEN NEW.winner_id = p2 THEN 1 ELSE 0 END,
                consecutive_wins = CASE
                    WHEN last_winner_id = NEW.winner_id THEN consecutive_wins + 1
                    ELSE 1
                END,
                last_winner_id = NEW.winner_id,
                updated_at = NOW()
            WHERE player1_id = p1 AND player2_id = p2;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_h2h
    AFTER UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION update_head_to_head();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- RLS aktivieren für alle Tabellen
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

-- ============================================
-- CLUBS
-- ============================================
CREATE POLICY "Clubs sind öffentlich lesbar" ON clubs
    FOR SELECT USING (true);

CREATE POLICY "Coaches können Clubs verwalten" ON clubs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- SUBGROUPS
-- ============================================
CREATE POLICY "Subgroups sind für Vereinsmitglieder lesbar" ON subgroups
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = subgroups.club_id)
    );

CREATE POLICY "Coaches können Subgroups verwalten" ON subgroups
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin') AND club_id = subgroups.club_id)
    );

-- ============================================
-- PROFILES
-- ============================================
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
            AND p.role IN ('coach', 'admin')
            AND p.club_id = profiles.club_id
        )
    );

-- ============================================
-- LOGIN_CODES
-- ============================================
-- Codes können ohne Auth abgefragt werden (für Code-Login)
CREATE POLICY "Login-Codes können abgefragt werden" ON login_codes
    FOR SELECT USING (is_active = true);

-- Codes können von angemeldeten Benutzern aktualisiert werden
CREATE POLICY "Login-Codes können aktualisiert werden" ON login_codes
    FOR UPDATE USING (true);

-- Coaches/Admins können Codes erstellen
CREATE POLICY "Coaches können Login-Codes erstellen" ON login_codes
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- Coaches/Admins können Codes löschen
CREATE POLICY "Coaches können Login-Codes löschen" ON login_codes
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- SEASONS
-- ============================================
CREATE POLICY "Seasons sind für Vereinsmitglieder lesbar" ON seasons
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = seasons.club_id)
    );

CREATE POLICY "Coaches können Seasons verwalten" ON seasons
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin') AND club_id = seasons.club_id)
    );

-- ============================================
-- XP_HISTORY & POINTS_HISTORY
-- ============================================
CREATE POLICY "Eigene XP-Historie lesbar" ON xp_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können XP vergeben" ON xp_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "System kann XP vergeben" ON xp_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Eigene Punkte-Historie lesbar" ON points_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Punkte vergeben" ON points_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "System kann Punkte vergeben" ON points_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- TRAINING_SESSIONS
-- ============================================
CREATE POLICY "Trainings sind für Vereinsmitglieder lesbar" ON training_sessions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = training_sessions.club_id)
    );

CREATE POLICY "Coaches können Trainings verwalten" ON training_sessions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin') AND club_id = training_sessions.club_id)
    );

-- ============================================
-- ATTENDANCE
-- ============================================
CREATE POLICY "Eigene Anwesenheit lesbar" ON attendance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Anwesenheit im Verein sehen" ON attendance
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin') AND club_id = attendance.club_id)
    );

CREATE POLICY "Coaches können Anwesenheit verwalten" ON attendance
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- STREAKS
-- ============================================
CREATE POLICY "Eigene Streaks lesbar" ON streaks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Eigene Streaks verwalten" ON streaks
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Streaks verwalten" ON streaks
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- MATCHES (Einzel)
-- ============================================
CREATE POLICY "Matches sind öffentlich lesbar" ON matches
    FOR SELECT USING (true);

CREATE POLICY "Beteiligte können Matches erstellen" ON matches
    FOR INSERT WITH CHECK (
        auth.uid() IN (player_a_id, player_b_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "Beteiligte und Coaches können Matches bearbeiten" ON matches
    FOR UPDATE USING (
        auth.uid() IN (player_a_id, player_b_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- DOUBLES_MATCHES
-- ============================================
CREATE POLICY "Doppel-Matches sind öffentlich lesbar" ON doubles_matches
    FOR SELECT USING (true);

CREATE POLICY "Beteiligte können Doppel-Matches erstellen" ON doubles_matches
    FOR INSERT WITH CHECK (
        auth.uid() IN (team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "Beteiligte und Coaches können Doppel-Matches bearbeiten" ON doubles_matches
    FOR UPDATE USING (
        auth.uid() IN (team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- DOUBLES_TEAMS
-- ============================================
CREATE POLICY "Doppel-Teams sind öffentlich lesbar" ON doubles_teams
    FOR SELECT USING (true);

CREATE POLICY "Beteiligte können Doppel-Teams erstellen" ON doubles_teams
    FOR INSERT WITH CHECK (
        auth.uid() IN (player1_id, player2_id)
    );

CREATE POLICY "System kann Doppel-Teams aktualisieren" ON doubles_teams
    FOR UPDATE USING (true);

-- ============================================
-- HEAD_TO_HEAD
-- ============================================
CREATE POLICY "H2H-Stats sind für Beteiligte lesbar" ON head_to_head
    FOR SELECT USING (
        auth.uid() IN (player1_id, player2_id) OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "System kann H2H-Stats verwalten" ON head_to_head
    FOR ALL USING (true);

-- ============================================
-- EXERCISES
-- ============================================
CREATE POLICY "Übungen sind öffentlich lesbar" ON exercises
    FOR SELECT USING (true);

CREATE POLICY "Coaches können Übungen erstellen" ON exercises
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "Ersteller können Übungen bearbeiten" ON exercises
    FOR UPDATE USING (auth.uid() = created_by);

-- ============================================
-- COMPLETED_EXERCISES
-- ============================================
CREATE POLICY "Eigene abgeschlossene Übungen lesbar" ON completed_exercises
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können abgeschlossene Übungen sehen" ON completed_exercises
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "Coaches können Übungsabschluss eintragen" ON completed_exercises
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- CHALLENGES
-- ============================================
CREATE POLICY "Challenges sind für Vereinsmitglieder lesbar" ON challenges
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = challenges.club_id)
    );

CREATE POLICY "Coaches können Challenges verwalten" ON challenges
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin') AND club_id = challenges.club_id)
    );

-- ============================================
-- COMPLETED_CHALLENGES
-- ============================================
CREATE POLICY "Eigene abgeschlossene Challenges lesbar" ON completed_challenges
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Coaches können Challenge-Abschlüsse sehen" ON completed_challenges
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

CREATE POLICY "Coaches können Challenge-Abschluss eintragen" ON completed_challenges
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
    );

-- ============================================
-- ACTIVITY_FEED
-- ============================================
CREATE POLICY "Feed ist für Vereinsmitglieder lesbar" ON activity_feed
    FOR SELECT USING (
        club_id IS NULL OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND club_id = activity_feed.club_id)
    );

CREATE POLICY "Authentifizierte können Feed-Einträge erstellen" ON activity_feed
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- NOTIFICATIONS
-- ============================================
CREATE POLICY "Eigene Benachrichtigungen lesen" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Eigene Benachrichtigungen aktualisieren" ON notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Eigene Benachrichtigungen löschen" ON notifications
    FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "System kann Benachrichtigungen erstellen" ON notifications
    FOR INSERT WITH CHECK (true);

-- ============================================
-- INDIZES FÜR PERFORMANCE
-- ============================================

CREATE INDEX idx_profiles_club ON profiles(club_id);
CREATE INDEX idx_profiles_elo ON profiles(elo_rating DESC);
CREATE INDEX idx_profiles_xp ON profiles(xp DESC);
CREATE INDEX idx_profiles_season_points ON profiles(season_points DESC);

CREATE INDEX idx_matches_club ON matches(club_id);
CREATE INDEX idx_matches_players ON matches(player_a_id, player_b_id);
CREATE INDEX idx_matches_status ON matches(status);
CREATE INDEX idx_matches_played_at ON matches(played_at DESC);

CREATE INDEX idx_training_club_date ON training_sessions(club_id, date);
CREATE INDEX idx_attendance_user ON attendance(user_id);
CREATE INDEX idx_attendance_session ON attendance(session_id);

CREATE INDEX idx_streaks_user ON streaks(user_id);
CREATE INDEX idx_activity_club ON activity_feed(club_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
