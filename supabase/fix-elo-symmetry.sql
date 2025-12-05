-- SC Champions - Fix ELO Symmetry
-- =========================================
-- Stellt sicher dass ELO-Änderungen symmetrisch sind (Winner +X, Loser -X)
-- Fügt elo_change_a und elo_change_b Spalten hinzu

-- =========================================
-- 1. NEUE SPALTEN HINZUFÜGEN
-- =========================================

ALTER TABLE matches ADD COLUMN IF NOT EXISTS elo_change_a INTEGER;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS elo_change_b INTEGER;

-- =========================================
-- 2. BESTEHENDE MATCHES AKTUALISIEREN
-- =========================================
-- Berechne elo_change_a und elo_change_b aus den vorhandenen before/after Werten

UPDATE matches
SET
    elo_change_a = player_a_elo_after - player_a_elo_before,
    elo_change_b = player_b_elo_after - player_b_elo_before
WHERE player_a_elo_after IS NOT NULL
  AND player_a_elo_before IS NOT NULL
  AND player_b_elo_after IS NOT NULL
  AND player_b_elo_before IS NOT NULL;

-- =========================================
-- 3. ELO CALCULATION FUNCTION (UPDATED)
-- =========================================
-- Standard ELO Formula mit K-Factor 32
-- ELO-Gate bei 800: Niemand kann unter 800 fallen

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
    delta_calc INTEGER;
    new_winner INTEGER;
    new_loser INTEGER;
BEGIN
    -- Expected score calculation (ELO formula)
    expected_winner := 1.0 / (1.0 + POWER(10.0, (loser_elo - winner_elo)::NUMERIC / 400.0));

    -- Calculate delta (same for both, ensures symmetry)
    delta_calc := ROUND(k_factor * (1.0 - expected_winner));

    -- Ensure minimum delta of 1
    IF delta_calc < 1 THEN
        delta_calc := 1;
    END IF;

    -- Apply delta symmetrically
    new_winner := winner_elo + delta_calc;
    new_loser := loser_elo - delta_calc;

    -- ELO-Gate bei 800: Niemand kann unter 800 fallen
    IF new_loser < 800 THEN
        new_loser := 800;
    END IF;

    RETURN QUERY SELECT new_winner, new_loser, delta_calc;
END;
$$;

-- =========================================
-- 4. MATCH PROCESSING TRIGGER (UPDATED)
-- =========================================
-- Speichert jetzt elo_change_a und elo_change_b

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
    winner_change INTEGER;
    loser_change INTEGER;
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

    -- Fallback auf 800 wenn kein ELO vorhanden (Start-ELO)
    winner_current_elo := COALESCE(winner_current_elo, 800);
    loser_current_elo := COALESCE(loser_current_elo, 800);
    winner_highest_elo := COALESCE(winner_highest_elo, winner_current_elo);

    -- ELO berechnen (symmetrisch, keine Gates)
    SELECT * INTO elo_result FROM calculate_elo(winner_current_elo, loser_current_elo);

    -- Berechne Änderungen pro Spieler
    winner_change := elo_result.new_winner_elo - winner_current_elo;
    loser_change := elo_result.new_loser_elo - loser_current_elo;

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

    -- ELO-Änderungen pro Spieler speichern
    NEW.elo_change_a := CASE
        WHEN NEW.winner_id = NEW.player_a_id THEN winner_change
        ELSE loser_change
    END;
    NEW.elo_change_b := CASE
        WHEN NEW.winner_id = NEW.player_b_id THEN winner_change
        ELSE loser_change
    END;

    -- Legacy: elo_change = Winner's gain
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
-- 5. TRIGGER NEU ERSTELLEN
-- =========================================

DROP TRIGGER IF EXISTS trigger_process_match_elo ON matches;

CREATE TRIGGER trigger_process_match_elo
    BEFORE INSERT OR UPDATE ON matches
    FOR EACH ROW
    EXECUTE FUNCTION process_match_elo();

-- =========================================
-- FERTIG!
-- =========================================
-- Die ELO-Berechnung ist jetzt:
-- - Symmetrisch: Winner +X, Loser -X (gleicher Betrag, außer Gate greift)
-- - ELO-Gate bei 800: Niemand kann unter 800 fallen
-- - Start-ELO: 800
