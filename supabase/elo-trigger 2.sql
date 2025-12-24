-- SC Champions - ELO Calculation Trigger
-- =========================================
-- Berechnet automatisch ELO-Änderungen wenn ein Match gespeichert wird

-- =========================================
-- ELO CALCULATION FUNCTION
-- =========================================
-- Standard ELO Formula mit K-Factor 32

CREATE OR REPLACE FUNCTION calculate_elo(
    winner_elo INTEGER,
    loser_elo INTEGER,
    k_factor INTEGER DEFAULT 32
)
RETURNS TABLE(new_winner_elo INTEGER, new_loser_elo INTEGER, elo_delta INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
    expected_winner NUMERIC;
    expected_loser NUMERIC;
    new_winner INTEGER;
    new_loser INTEGER;
    delta INTEGER;
BEGIN
    -- Expected score calculation (ELO formula)
    expected_winner := 1.0 / (1.0 + POWER(10.0, (loser_elo - winner_elo)::NUMERIC / 400.0));
    expected_loser := 1.0 - expected_winner;

    -- New ELO ratings
    new_winner := ROUND(winner_elo + k_factor * (1.0 - expected_winner));
    new_loser := ROUND(loser_elo + k_factor * (0.0 - expected_loser));

    -- Ensure minimum ELO of 100
    IF new_loser < 100 THEN
        new_loser := 100;
    END IF;

    delta := new_winner - winner_elo;

    RETURN QUERY SELECT new_winner, new_loser, delta;
END;
$$;

-- =========================================
-- MATCH PROCESSING TRIGGER
-- =========================================
-- Wird automatisch aufgerufen wenn ein Match eingefügt oder aktualisiert wird

CREATE OR REPLACE FUNCTION process_match_elo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    winner_current_elo INTEGER;
    loser_current_elo INTEGER;
    winner_highest_elo INTEGER;
    elo_result RECORD;
BEGIN
    -- Nur verarbeiten wenn winner_id gesetzt ist und noch nicht verarbeitet
    IF NEW.winner_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Prüfen ob ELO schon berechnet wurde
    IF NEW.elo_change IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Aktuelles ELO der Spieler holen
    SELECT elo_rating, highest_elo
    INTO winner_current_elo, winner_highest_elo
    FROM profiles
    WHERE id = NEW.winner_id;

    SELECT elo_rating
    INTO loser_current_elo
    FROM profiles
    WHERE id = NEW.loser_id;

    -- Fallback auf 1000 wenn kein ELO vorhanden
    winner_current_elo := COALESCE(winner_current_elo, 1000);
    loser_current_elo := COALESCE(loser_current_elo, 1000);
    winner_highest_elo := COALESCE(winner_highest_elo, winner_current_elo);

    -- ELO berechnen
    SELECT * INTO elo_result FROM calculate_elo(winner_current_elo, loser_current_elo);

    -- Match mit ELO-Daten aktualisieren
    NEW.player_a_elo_before := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN winner_current_elo
        ELSE loser_current_elo
    END;
    NEW.player_b_elo_before := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN winner_current_elo
        ELSE loser_current_elo
    END;
    NEW.player_a_elo_after := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN elo_result.new_winner_elo
        ELSE elo_result.new_loser_elo
    END;
    NEW.player_b_elo_after := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN elo_result.new_winner_elo
        ELSE elo_result.new_loser_elo
    END;
    NEW.elo_change := elo_result.elo_delta;

    -- Winner ELO aktualisieren
    UPDATE profiles
    SET
        elo_rating = elo_result.new_winner_elo,
        highest_elo = GREATEST(winner_highest_elo, elo_result.new_winner_elo),
        updated_at = NOW()
    WHERE id = NEW.winner_id;

    -- Loser ELO aktualisieren
    UPDATE profiles
    SET
        elo_rating = elo_result.new_loser_elo,
        updated_at = NOW()
    WHERE id = NEW.loser_id;

    RETURN NEW;
END;
$$;

-- =========================================
-- TRIGGER ERSTELLEN
-- =========================================

-- Alten Trigger löschen falls vorhanden
DROP TRIGGER IF EXISTS trigger_process_match_elo ON matches;

-- Neuen Trigger erstellen
CREATE TRIGGER trigger_process_match_elo
    BEFORE INSERT OR UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_elo();

-- =========================================
-- XP AWARDING FUNCTION (für Challenges, Attendance, etc.)
-- =========================================

CREATE OR REPLACE FUNCTION award_xp(
    p_user_id UUID,
    p_xp_amount INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_source TEXT DEFAULT 'system'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- XP zum Profil hinzufügen
    UPDATE profiles
    SET xp = COALESCE(xp, 0) + p_xp_amount,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- XP History eintragen
    INSERT INTO xp_history (user_id, xp, reason, source, created_at)
    VALUES (p_user_id, p_xp_amount, p_reason, p_source, NOW());
END;
$$;

-- =========================================
-- POINTS AWARDING FUNCTION
-- =========================================

CREATE OR REPLACE FUNCTION award_points(
    p_user_id UUID,
    p_points INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_awarded_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Punkte zum Profil hinzufügen
    UPDATE profiles
    SET points = COALESCE(points, 0) + p_points,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Points History eintragen
    INSERT INTO points_history (user_id, points, reason, awarded_by, created_at)
    VALUES (p_user_id, p_points, p_reason, p_awarded_by, NOW());
END;
$$;

-- =========================================
-- STREAK UPDATE FUNCTION (für Anwesenheit)
-- =========================================

CREATE OR REPLACE FUNCTION update_attendance_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    last_date DATE;
    current_streak_val INTEGER;
    longest_streak_val INTEGER;
BEGIN
    -- Nur für anwesende Spieler
    IF NEW.present = FALSE THEN
        RETURN NEW;
    END IF;

    -- Aktuellen Streak holen
    SELECT last_attendance_date, current_streak, longest_streak
    INTO last_date, current_streak_val, longest_streak_val
    FROM streaks
    WHERE user_id = NEW.user_id AND subgroup_id = NEW.subgroup_id;

    IF NOT FOUND THEN
        -- Neuen Streak-Eintrag erstellen
        INSERT INTO streaks (user_id, subgroup_id, current_streak, longest_streak, last_attendance_date)
        VALUES (NEW.user_id, NEW.subgroup_id, 1, 1, NEW.date);
    ELSE
        -- Streak aktualisieren
        IF last_date IS NULL OR NEW.date > last_date THEN
            -- Prüfen ob Streak fortgesetzt wird (innerhalb von 7 Tagen)
            IF last_date IS NOT NULL AND (NEW.date - last_date) <= 7 THEN
                current_streak_val := current_streak_val + 1;
            ELSE
                current_streak_val := 1;
            END IF;

            longest_streak_val := GREATEST(longest_streak_val, current_streak_val);

            UPDATE streaks
            SET current_streak = current_streak_val,
                longest_streak = longest_streak_val,
                last_attendance_date = NEW.date,
                updated_at = NOW()
            WHERE user_id = NEW.user_id AND subgroup_id = NEW.subgroup_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Streak Trigger erstellen
DROP TRIGGER IF EXISTS trigger_update_attendance_streak ON attendance;

CREATE TRIGGER trigger_update_attendance_streak
    AFTER INSERT ON attendance
    FOR EACH ROW
    EXECUTE FUNCTION update_attendance_streak();

-- =========================================
-- FERTIG!
-- =========================================
-- Führe dieses Script im Supabase SQL Editor aus.
-- Danach werden ELO-Punkte automatisch berechnet wenn Matches gespeichert werden.
