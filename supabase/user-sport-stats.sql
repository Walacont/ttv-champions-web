-- ============================================
-- USER SPORT STATS - Sport-spezifische Statistiken
-- ============================================
-- Ermöglicht separate ELO, XP, Punkte pro Sportart
-- Unabhängig von Vereinszugehörigkeit (profile_club_sports)

-- Neue Tabelle für Sport-spezifische Stats
CREATE TABLE IF NOT EXISTS user_sport_stats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    sport_id UUID NOT NULL REFERENCES sports(id) ON DELETE CASCADE,

    -- ELO Rating (Singles)
    elo_rating INTEGER DEFAULT 1000,
    highest_elo INTEGER DEFAULT 1000,

    -- ELO Rating (Doubles)
    doubles_elo_rating INTEGER DEFAULT 1000,
    doubles_highest_elo INTEGER DEFAULT 1000,

    -- XP und Punkte
    xp INTEGER DEFAULT 0,
    points INTEGER DEFAULT 0,

    -- Match-Statistiken (Singles)
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,

    -- Match-Statistiken (Doubles)
    doubles_wins INTEGER DEFAULT 0,
    doubles_losses INTEGER DEFAULT 0,

    -- Für Ranglisten-Sichtbarkeit
    matches_played INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ein User kann pro Sport nur einen Eintrag haben
    UNIQUE(user_id, sport_id)
);

-- Indizes für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_user_sport_stats_user ON user_sport_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sport_stats_sport ON user_sport_stats(sport_id);
CREATE INDEX IF NOT EXISTS idx_user_sport_stats_elo ON user_sport_stats(sport_id, elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_user_sport_stats_matches ON user_sport_stats(sport_id, matches_played);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_user_sport_stats_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_sport_stats_timestamp ON user_sport_stats;
CREATE TRIGGER update_user_sport_stats_timestamp
    BEFORE UPDATE ON user_sport_stats
    FOR EACH ROW EXECUTE FUNCTION update_user_sport_stats_updated_at();

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE user_sport_stats ENABLE ROW LEVEL SECURITY;

-- Jeder kann Stats lesen (für Ranglisten)
CREATE POLICY "user_sport_stats_select_policy" ON user_sport_stats
    FOR SELECT USING (true);

-- User können ihre eigenen Stats erstellen
CREATE POLICY "user_sport_stats_insert_policy" ON user_sport_stats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- User können ihre eigenen Stats updaten (oder System-Updates)
CREATE POLICY "user_sport_stats_update_policy" ON user_sport_stats
    FOR UPDATE USING (
        auth.uid() = user_id
        OR EXISTS (
            -- Coaches können Stats ihrer Spieler updaten
            SELECT 1 FROM profile_club_sports pcs
            WHERE pcs.user_id = auth.uid()
            AND pcs.role IN ('coach', 'head_coach')
            AND pcs.club_id IN (
                SELECT club_id FROM profile_club_sports
                WHERE user_id = user_sport_stats.user_id
                AND sport_id = user_sport_stats.sport_id
            )
        )
    );

-- ============================================
-- Helper Functions
-- ============================================

-- Funktion um Sport-Stats zu holen oder zu erstellen
CREATE OR REPLACE FUNCTION get_or_create_sport_stats(
    p_user_id UUID,
    p_sport_id UUID
) RETURNS user_sport_stats AS $$
DECLARE
    v_stats user_sport_stats;
BEGIN
    -- Versuche existierende Stats zu finden
    SELECT * INTO v_stats
    FROM user_sport_stats
    WHERE user_id = p_user_id AND sport_id = p_sport_id;

    -- Falls nicht vorhanden, erstelle neue
    IF v_stats.id IS NULL THEN
        INSERT INTO user_sport_stats (user_id, sport_id)
        VALUES (p_user_id, p_sport_id)
        RETURNING * INTO v_stats;
    END IF;

    RETURN v_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funktion um ELO nach Match zu aktualisieren
CREATE OR REPLACE FUNCTION update_sport_elo_after_match(
    p_winner_id UUID,
    p_loser_id UUID,
    p_sport_id UUID,
    p_is_doubles BOOLEAN DEFAULT FALSE
) RETURNS void AS $$
DECLARE
    v_winner_stats user_sport_stats;
    v_loser_stats user_sport_stats;
    v_winner_elo INTEGER;
    v_loser_elo INTEGER;
    v_expected_winner FLOAT;
    v_k_factor INTEGER := 32;
    v_elo_change INTEGER;
    v_new_winner_elo INTEGER;
    v_new_loser_elo INTEGER;
    v_min_elo INTEGER := 100;
BEGIN
    -- Stats holen oder erstellen
    SELECT * INTO v_winner_stats FROM get_or_create_sport_stats(p_winner_id, p_sport_id);
    SELECT * INTO v_loser_stats FROM get_or_create_sport_stats(p_loser_id, p_sport_id);

    -- ELO basierend auf Singles/Doubles
    IF p_is_doubles THEN
        v_winner_elo := COALESCE(v_winner_stats.doubles_elo_rating, 1000);
        v_loser_elo := COALESCE(v_loser_stats.doubles_elo_rating, 1000);
    ELSE
        v_winner_elo := COALESCE(v_winner_stats.elo_rating, 1000);
        v_loser_elo := COALESCE(v_loser_stats.elo_rating, 1000);
    END IF;

    -- ELO-Berechnung
    v_expected_winner := 1.0 / (1.0 + POWER(10, (v_loser_elo - v_winner_elo)::FLOAT / 400));
    v_elo_change := ROUND(v_k_factor * (1 - v_expected_winner));

    v_new_winner_elo := v_winner_elo + v_elo_change;
    v_new_loser_elo := GREATEST(v_min_elo, v_loser_elo - v_elo_change);

    -- Update Winner
    IF p_is_doubles THEN
        UPDATE user_sport_stats SET
            doubles_elo_rating = v_new_winner_elo,
            doubles_highest_elo = GREATEST(doubles_highest_elo, v_new_winner_elo),
            doubles_wins = doubles_wins + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_winner_id AND sport_id = p_sport_id;
    ELSE
        UPDATE user_sport_stats SET
            elo_rating = v_new_winner_elo,
            highest_elo = GREATEST(highest_elo, v_new_winner_elo),
            wins = wins + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_winner_id AND sport_id = p_sport_id;
    END IF;

    -- Update Loser
    IF p_is_doubles THEN
        UPDATE user_sport_stats SET
            doubles_elo_rating = v_new_loser_elo,
            doubles_losses = doubles_losses + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_loser_id AND sport_id = p_sport_id;
    ELSE
        UPDATE user_sport_stats SET
            elo_rating = v_new_loser_elo,
            losses = losses + 1,
            matches_played = matches_played + 1
        WHERE user_id = p_loser_id AND sport_id = p_sport_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Migration: Bestehende Daten migrieren
-- ============================================
-- Kopiere aktuelle Stats aus profiles nach user_sport_stats
-- (für die Standard-Sportart Tischtennis)

DO $$
DECLARE
    v_table_tennis_id UUID;
BEGIN
    -- Finde Tischtennis Sport ID
    SELECT id INTO v_table_tennis_id FROM sports WHERE name = 'table_tennis' LIMIT 1;

    IF v_table_tennis_id IS NOT NULL THEN
        -- Migriere bestehende Stats
        -- Note: profiles table has: elo_rating, highest_elo, doubles_elo_rating, highest_doubles_elo
        -- But NOT: wins, losses, doubles_wins, doubles_losses (these are calculated from matches)
        INSERT INTO user_sport_stats (
            user_id, sport_id,
            elo_rating, highest_elo,
            doubles_elo_rating, doubles_highest_elo,
            xp, points,
            wins, losses,
            doubles_wins, doubles_losses,
            matches_played
        )
        SELECT
            p.id,
            v_table_tennis_id,
            COALESCE(p.elo_rating, 1000),
            COALESCE(p.highest_elo, 1000),
            COALESCE(p.doubles_elo_rating, 1000),
            COALESCE(p.highest_doubles_elo, 1000),  -- Correct column name
            COALESCE(p.xp, 0),
            COALESCE(p.points, 0),
            0,  -- wins - will be recalculated from matches if needed
            0,  -- losses - will be recalculated from matches if needed
            COALESCE(p.doubles_matches_won, 0),
            COALESCE(p.doubles_matches_lost, 0),
            COALESCE(p.doubles_matches_played, 0)  -- Use doubles_matches_played as base
        FROM profiles p
        WHERE NOT EXISTS (
            SELECT 1 FROM user_sport_stats uss
            WHERE uss.user_id = p.id AND uss.sport_id = v_table_tennis_id
        );

        RAISE NOTICE 'Migrated existing stats to user_sport_stats for table_tennis';
    END IF;
END $$;

-- ============================================
-- View für einfache Ranglisten-Abfragen
-- ============================================
CREATE OR REPLACE VIEW sport_leaderboard AS
SELECT
    uss.sport_id,
    uss.user_id,
    p.first_name,
    p.last_name,
    p.display_name,
    p.avatar_url,
    p.gender,
    p.birthdate,
    uss.elo_rating,
    uss.highest_elo,
    uss.xp,
    uss.points,
    uss.wins,
    uss.losses,
    uss.matches_played,
    pcs.club_id,
    c.name as club_name,
    s.name as sport_name,
    s.display_name as sport_display_name
FROM user_sport_stats uss
JOIN profiles p ON p.id = uss.user_id
JOIN sports s ON s.id = uss.sport_id
LEFT JOIN profile_club_sports pcs ON pcs.user_id = uss.user_id AND pcs.sport_id = uss.sport_id
LEFT JOIN clubs c ON c.id = pcs.club_id
WHERE uss.matches_played > 0;  -- Nur Spieler mit mindestens 1 Match anzeigen

COMMENT ON VIEW sport_leaderboard IS 'Rangliste pro Sportart - nur Spieler mit matches_played > 0';
