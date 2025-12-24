-- ============================================
-- TOURNAMENT SYSTEM - Migration 001
-- SC Champions - Turniere Feature
-- ============================================

-- ============================================
-- ENUM TYPES für Turniere
-- ============================================

CREATE TYPE tournament_format AS ENUM (
    'round_robin',           -- Jeder gegen Jeden (bis 10 Spieler)
    'pool_6',                -- Poolplan bis 6 Spieler
    'pool_8',                -- Poolplan bis 8 Spieler
    'groups_4',              -- Vierergruppen
    'knockout_16',           -- K.O. System bis 16 Spieler
    'knockout_32',           -- K.O. System bis 32 Spieler
    'double_elim_32',        -- Doppeltes K.O. System bis 32 Spieler
    'groups_knockout_32',    -- Gruppen + K.O. System bis 32 Spieler
    'groups_knockout_64',    -- Gruppen + K.O. System bis 64 Spieler
    'doubles_team',          -- Spielbögen Zweiermannschaft
    'single_match'           -- Turnierzettel einzelne Begegnung
);

CREATE TYPE tournament_status AS ENUM (
    'draft',                 -- Erstellt, aber noch nicht gestartet
    'registration',          -- Anmeldung läuft
    'in_progress',           -- Turnier läuft
    'completed',             -- Abgeschlossen
    'cancelled'              -- Abgebrochen
);

CREATE TYPE tournament_match_status AS ENUM (
    'pending',               -- Noch nicht gespielt
    'in_progress',           -- Wird gerade gespielt
    'completed',             -- Abgeschlossen
    'walkover'               -- Kampflos (Gegner nicht angetreten)
);

-- ============================================
-- TOURNAMENTS - Haupttabelle
-- ============================================

CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Basis-Informationen
    name TEXT NOT NULL,
    description TEXT,
    club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE SET NULL,

    -- Turnier-Konfiguration
    format tournament_format NOT NULL,
    max_participants INTEGER NOT NULL,

    -- Zugangssteuerung
    is_open BOOLEAN DEFAULT true,              -- true = offen, false = nur mit Code
    join_code TEXT UNIQUE,                     -- Code für Einladungs-Turniere

    -- Spielmodus
    with_handicap BOOLEAN DEFAULT false,       -- Mit/ohne Handicap

    -- Zeitsteuerung
    is_live BOOLEAN DEFAULT false,             -- true = Tagesturnier, false = zeitgesteuert
    match_deadline_days INTEGER DEFAULT 7,     -- Tage pro Runde (wenn nicht live)

    -- Status
    status tournament_status DEFAULT 'draft',

    -- Termine
    start_date TIMESTAMPTZ,                    -- Wann startet das Turnier
    end_date TIMESTAMPTZ,                      -- Wann endet es (oder NULL für offen)
    registration_deadline TIMESTAMPTZ,         -- Anmeldeschluss

    -- Statistiken
    participant_count INTEGER DEFAULT 0,
    matches_total INTEGER DEFAULT 0,
    matches_completed INTEGER DEFAULT 0,

    -- Gewinner
    winner_id UUID REFERENCES profiles(id),
    runner_up_id UUID REFERENCES profiles(id),

    -- Metadata
    created_by UUID NOT NULL REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ============================================
-- TOURNAMENT PARTICIPANTS - Teilnehmer
-- ============================================

CREATE TABLE tournament_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Seeding (Position im Turnier)
    seed INTEGER,                              -- 1 = stärkster Spieler
    elo_at_registration INTEGER,               -- Elo zum Zeitpunkt der Anmeldung

    -- Statistiken
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    sets_won INTEGER DEFAULT 0,
    sets_lost INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,                  -- Turnierpunkte (Sieg = 2, Unentschieden = 1)

    -- Platzierung
    final_rank INTEGER,                        -- Endplatzierung

    -- Status
    is_active BOOLEAN DEFAULT true,            -- false = disqualifiziert
    disqualified_reason TEXT,

    -- Metadata
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tournament_id, player_id)
);

-- ============================================
-- TOURNAMENT ROUNDS - Runden (für K.O./Gruppen)
-- ============================================

CREATE TABLE tournament_rounds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

    -- Runden-Info
    round_number INTEGER NOT NULL,             -- 1, 2, 3, ...
    round_name TEXT,                           -- "Achtelfinale", "Viertelfinale", "Gruppe A", etc.

    -- Bei Gruppenphasen
    group_name TEXT,                           -- "Gruppe A", "Gruppe B", etc.

    -- Zeitsteuerung
    start_date TIMESTAMPTZ,
    deadline TIMESTAMPTZ,                      -- Deadline für diese Runde

    -- Status
    is_active BOOLEAN DEFAULT false,
    is_completed BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tournament_id, round_number, group_name)
);

-- ============================================
-- TOURNAMENT MATCHES - Turnier-Matches
-- ============================================

CREATE TABLE tournament_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id UUID REFERENCES tournament_rounds(id) ON DELETE SET NULL,

    -- Match-Info
    match_number INTEGER,                      -- Nummer innerhalb der Runde
    round_number INTEGER DEFAULT 1,            -- Für einfache Queries

    -- Spieler
    player_a_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    player_b_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Verknüpfung zum tatsächlichen Match
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,

    -- Zeitsteuerung
    scheduled_for TIMESTAMPTZ,
    deadline TIMESTAMPTZ,

    -- Status
    status tournament_match_status DEFAULT 'pending',

    -- Ergebnis (cached für schnellere Queries)
    winner_id UUID REFERENCES profiles(id),
    player_a_sets_won INTEGER DEFAULT 0,
    player_b_sets_won INTEGER DEFAULT 0,

    -- Walkover (kampflos)
    is_walkover BOOLEAN DEFAULT false,
    walkover_reason TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================
-- TOURNAMENT STANDINGS - Tabelle (für Round Robin/Gruppen)
-- ============================================

CREATE TABLE tournament_standings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_id UUID REFERENCES tournament_rounds(id) ON DELETE CASCADE,  -- NULL = Gesamt
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Statistiken
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    matches_lost INTEGER DEFAULT 0,
    matches_drawn INTEGER DEFAULT 0,          -- Bei manchen Formaten

    sets_won INTEGER DEFAULT 0,
    sets_lost INTEGER DEFAULT 0,
    sets_difference INTEGER DEFAULT 0,        -- Satzdifferenz

    points_scored INTEGER DEFAULT 0,          -- Punktzahl in Sätzen
    points_against INTEGER DEFAULT 0,
    points_difference INTEGER DEFAULT 0,

    -- Turnierpunkte (Sieg = 2/3 Punkte, je nach System)
    tournament_points INTEGER DEFAULT 0,

    -- Platzierung
    rank INTEGER,

    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tournament_id, round_id, player_id)
);

-- ============================================
-- INDEXES für Performance
-- ============================================

CREATE INDEX idx_tournaments_club ON tournaments(club_id);
CREATE INDEX idx_tournaments_sport ON tournaments(sport_id);
CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_created_by ON tournaments(created_by);
CREATE INDEX idx_tournaments_join_code ON tournaments(join_code) WHERE join_code IS NOT NULL;

CREATE INDEX idx_tournament_participants_tournament ON tournament_participants(tournament_id);
CREATE INDEX idx_tournament_participants_player ON tournament_participants(player_id);
CREATE INDEX idx_tournament_participants_rank ON tournament_participants(tournament_id, final_rank);

CREATE INDEX idx_tournament_rounds_tournament ON tournament_rounds(tournament_id);
CREATE INDEX idx_tournament_rounds_number ON tournament_rounds(tournament_id, round_number);

CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_round ON tournament_matches(round_id);
CREATE INDEX idx_tournament_matches_players ON tournament_matches(player_a_id, player_b_id);
CREATE INDEX idx_tournament_matches_status ON tournament_matches(status);
CREATE INDEX idx_tournament_matches_deadline ON tournament_matches(deadline) WHERE status = 'pending';

CREATE INDEX idx_tournament_standings_tournament ON tournament_standings(tournament_id);
CREATE INDEX idx_tournament_standings_round ON tournament_standings(round_id);
CREATE INDEX idx_tournament_standings_player ON tournament_standings(player_id);
CREATE INDEX idx_tournament_standings_rank ON tournament_standings(tournament_id, rank);

-- ============================================
-- TRIGGERS für updated_at
-- ============================================

CREATE TRIGGER update_tournaments_updated_at
    BEFORE UPDATE ON tournaments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tournament_standings_updated_at
    BEFORE UPDATE ON tournament_standings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- FUNCTION: Generate Tournament Join Code
-- ============================================

CREATE OR REPLACE FUNCTION generate_tournament_join_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- ohne 0, O, 1, I (Verwechslungsgefahr)
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Update Tournament Statistics
-- ============================================

CREATE OR REPLACE FUNCTION update_tournament_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Update participant count
    UPDATE tournaments
    SET participant_count = (
        SELECT COUNT(*)
        FROM tournament_participants
        WHERE tournament_id = NEW.tournament_id
    )
    WHERE id = NEW.tournament_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tournament_participant_count
    AFTER INSERT OR DELETE ON tournament_participants
    FOR EACH ROW EXECUTE FUNCTION update_tournament_stats();

-- ============================================
-- FUNCTION: Update Tournament Match Count
-- ============================================

CREATE OR REPLACE FUNCTION update_tournament_match_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tournaments
    SET
        matches_total = (
            SELECT COUNT(*)
            FROM tournament_matches
            WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
        ),
        matches_completed = (
            SELECT COUNT(*)
            FROM tournament_matches
            WHERE tournament_id = COALESCE(NEW.tournament_id, OLD.tournament_id)
            AND status = 'completed'
        )
    WHERE id = COALESCE(NEW.tournament_id, OLD.tournament_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tournament_match_counts
    AFTER INSERT OR UPDATE OR DELETE ON tournament_matches
    FOR EACH ROW EXECUTE FUNCTION update_tournament_match_count();

-- ============================================
-- COMMENTS (Dokumentation)
-- ============================================

COMMENT ON TABLE tournaments IS 'Haupttabelle für alle Turnier-Formate';
COMMENT ON TABLE tournament_participants IS 'Spieler die an einem Turnier teilnehmen';
COMMENT ON TABLE tournament_rounds IS 'Runden innerhalb eines Turniers (für K.O./Gruppen)';
COMMENT ON TABLE tournament_matches IS 'Einzelne Matches innerhalb eines Turniers';
COMMENT ON TABLE tournament_standings IS 'Tabellenstände für Round-Robin und Gruppenphasen';

COMMENT ON COLUMN tournaments.join_code IS 'Einladungscode für geschlossene Turniere (6 Zeichen, A-Z/2-9)';
COMMENT ON COLUMN tournaments.is_live IS 'true = alle Spieler vor Ort (Tagesturnier), false = zeitgesteuert';
COMMENT ON COLUMN tournaments.match_deadline_days IS 'Anzahl Tage pro Runde bei zeitgesteuerten Turnieren';

COMMENT ON COLUMN tournament_participants.seed IS 'Setzposition basierend auf Elo (1 = stärkster Spieler)';
COMMENT ON COLUMN tournament_participants.points IS 'Turnierpunkte: Sieg = 2, Unentschieden = 1, Niederlage = 0';

COMMENT ON COLUMN tournament_standings.tournament_points IS 'Punkte nach Turnier-Wertungssystem';
COMMENT ON COLUMN tournament_standings.sets_difference IS 'Satzdifferenz (Gewonnen - Verloren)';
