-- ============================================
-- USER SEASON POINTS - Saisonpunkte an Saison binden
-- ============================================
-- Speichert die Punkte eines Spielers pro Saison.
-- Wenn ein Spieler den Verein verlässt, bleiben die Punkte gespeichert.
-- Bei Wiederbeitritt in derselben Saison werden die Punkte wiederhergestellt.
-- Bei einer neuen Saison startet der Spieler mit 0 Punkten.

-- 1. Neue Tabelle für saisongebundene Punkte
CREATE TABLE IF NOT EXISTS user_season_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    points INTEGER DEFAULT 0,           -- gespeicherte profiles.points
    sport_points INTEGER DEFAULT 0,     -- gespeicherte user_sport_stats.points
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, season_id)
);

-- Indizes
CREATE INDEX IF NOT EXISTS idx_user_season_points_user ON user_season_points(user_id);
CREATE INDEX IF NOT EXISTS idx_user_season_points_season ON user_season_points(season_id);
CREATE INDEX IF NOT EXISTS idx_user_season_points_user_season ON user_season_points(user_id, season_id);

-- RLS
ALTER TABLE user_season_points ENABLE ROW LEVEL SECURITY;

-- Jeder kann lesen (für Ranglisten etc.)
CREATE POLICY "user_season_points_select_policy" ON user_season_points
    FOR SELECT USING (true);

-- System/Funktionen können schreiben (SECURITY DEFINER)
CREATE POLICY "user_season_points_insert_policy" ON user_season_points
    FOR INSERT WITH CHECK (true);

CREATE POLICY "user_season_points_update_policy" ON user_season_points
    FOR UPDATE USING (true);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_user_season_points_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_season_points_timestamp ON user_season_points;
CREATE TRIGGER update_user_season_points_timestamp
    BEFORE UPDATE ON user_season_points
    FOR EACH ROW EXECUTE FUNCTION update_user_season_points_updated_at();


-- ============================================
-- 2. HELPER: Saisonpunkte speichern (vor Vereinsaustritt)
-- ============================================
CREATE OR REPLACE FUNCTION save_user_season_points(
    p_user_id UUID,
    p_club_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_points INTEGER;
    v_season RECORD;
    v_sport_points INTEGER;
BEGIN
    -- Aktuelle Punkte aus profiles holen
    SELECT COALESCE(points, 0) INTO v_profile_points
    FROM profiles
    WHERE id = p_user_id;

    -- Für jede aktive Saison des Vereins die Punkte speichern
    FOR v_season IN
        SELECT s.id AS season_id, s.sport_id
        FROM seasons s
        WHERE s.club_id = p_club_id AND s.is_active = true
    LOOP
        -- Sport-spezifische Punkte holen
        SELECT COALESCE(uss.points, 0) INTO v_sport_points
        FROM user_sport_stats uss
        WHERE uss.user_id = p_user_id AND uss.sport_id = v_season.sport_id;

        v_sport_points := COALESCE(v_sport_points, 0);

        -- Upsert in user_season_points
        INSERT INTO user_season_points (user_id, season_id, points, sport_points)
        VALUES (p_user_id, v_season.season_id, v_profile_points, v_sport_points)
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            sport_points = EXCLUDED.sport_points,
            updated_at = NOW();
    END LOOP;
END;
$$;


-- ============================================
-- 3. HELPER: Saisonpunkte wiederherstellen (bei Wiederbeitritt)
-- ============================================
-- Gibt die gespeicherten Punkte zurück (oder 0 wenn keine gefunden)
CREATE OR REPLACE FUNCTION restore_user_season_points(
    p_user_id UUID,
    p_club_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_restored_points INTEGER := 0;
    v_season RECORD;
    v_saved RECORD;
BEGIN
    -- Für jede aktive Saison des Vereins prüfen ob Punkte gespeichert sind
    SELECT usp.points INTO v_restored_points
    FROM user_season_points usp
    JOIN seasons s ON s.id = usp.season_id
    WHERE usp.user_id = p_user_id
    AND s.club_id = p_club_id
    AND s.is_active = true
    ORDER BY usp.updated_at DESC
    LIMIT 1;

    v_restored_points := COALESCE(v_restored_points, 0);

    -- Sport-spezifische Punkte wiederherstellen
    FOR v_season IN
        SELECT s.id AS season_id, s.sport_id
        FROM seasons s
        WHERE s.club_id = p_club_id AND s.is_active = true
    LOOP
        SELECT usp.sport_points INTO v_saved
        FROM user_season_points usp
        WHERE usp.user_id = p_user_id AND usp.season_id = v_season.season_id;

        IF FOUND AND v_saved.sport_points > 0 THEN
            UPDATE user_sport_stats
            SET points = v_saved.sport_points
            WHERE user_id = p_user_id AND sport_id = v_season.sport_id;
        ELSE
            UPDATE user_sport_stats
            SET points = 0
            WHERE user_id = p_user_id AND sport_id = v_season.sport_id;
        END IF;
    END LOOP;

    RETURN v_restored_points;
END;
$$;


-- ============================================
-- 4. TRIGGER: profiles.points automatisch synchronisieren
-- ============================================
-- Synchronisiert profiles.points → user_season_points
-- Feuert NUR bei normalen Punkteänderungen (nicht bei Join/Leave)
CREATE OR REPLACE FUNCTION sync_season_points_on_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Nur synchronisieren wenn:
    -- 1. Punkte sich geändert haben
    -- 2. Spieler in einem Verein ist
    -- 3. club_id hat sich NICHT geändert (kein Join/Leave)
    IF NEW.points IS DISTINCT FROM OLD.points
       AND NEW.club_id IS NOT NULL
       AND OLD.club_id IS NOT NULL
       AND OLD.club_id = NEW.club_id THEN

        INSERT INTO user_season_points (user_id, season_id, points)
        SELECT NEW.id, s.id, NEW.points
        FROM seasons s
        WHERE s.club_id = NEW.club_id AND s.is_active = true
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_season_points_trigger ON profiles;
CREATE TRIGGER sync_season_points_trigger
    AFTER UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION sync_season_points_on_profile_update();


-- ============================================
-- 5. TRIGGER: user_sport_stats.points automatisch synchronisieren
-- ============================================
CREATE OR REPLACE FUNCTION sync_season_points_on_sport_stats_update()
RETURNS TRIGGER AS $$
DECLARE
    v_club_id UUID;
BEGIN
    -- Nur synchronisieren wenn Punkte sich geändert haben
    IF NEW.points IS DISTINCT FROM OLD.points THEN
        -- Club-ID des Spielers holen
        SELECT club_id INTO v_club_id
        FROM profiles
        WHERE id = NEW.user_id;

        -- Nur wenn Spieler in einem Verein ist
        IF v_club_id IS NOT NULL THEN
            UPDATE user_season_points usp
            SET sport_points = NEW.points, updated_at = NOW()
            FROM seasons s
            WHERE usp.season_id = s.id
            AND s.club_id = v_club_id
            AND s.sport_id = NEW.sport_id
            AND s.is_active = true
            AND usp.user_id = NEW.user_id;

            -- Falls kein Eintrag existiert, erstelle einen
            IF NOT FOUND THEN
                INSERT INTO user_season_points (user_id, season_id, points, sport_points)
                SELECT NEW.user_id, s.id,
                    COALESCE((SELECT points FROM profiles WHERE id = NEW.user_id), 0),
                    NEW.points
                FROM seasons s
                WHERE s.club_id = v_club_id
                AND s.sport_id = NEW.sport_id
                AND s.is_active = true
                ON CONFLICT (user_id, season_id) DO UPDATE SET
                    sport_points = EXCLUDED.sport_points,
                    updated_at = NOW();
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_season_sport_points_trigger ON user_sport_stats;
CREATE TRIGGER sync_season_sport_points_trigger
    AFTER UPDATE ON user_sport_stats
    FOR EACH ROW EXECUTE FUNCTION sync_season_points_on_sport_stats_update();


-- ============================================
-- 6. UPDATE: leave_club_directly - Punkte speichern vor Austritt
-- ============================================
CREATE OR REPLACE FUNCTION leave_club_directly(
    p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_player RECORD;
    v_club_id UUID;
BEGIN
    -- Get the player's current data
    SELECT id, club_id, role INTO v_player
    FROM profiles
    WHERE id = p_player_id;

    IF v_player IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    IF v_player.club_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler ist keinem Verein zugeordnet');
    END IF;

    v_club_id := v_player.club_id;

    -- *** NEU: Saisonpunkte speichern BEVOR sie zurückgesetzt werden ***
    PERFORM save_user_season_points(p_player_id, v_club_id);

    -- Remove player from club, clear subgroups, downgrade role if coach
    -- Reset season points (points are club-bound)
    UPDATE profiles
    SET
        club_id = NULL,
        subgroup_ids = '{}',
        points = 0,
        role = CASE
            WHEN role IN ('coach', 'head_coach') THEN 'player'
            ELSE role
        END,
        updated_at = NOW()
    WHERE id = p_player_id;

    -- Reset sport-specific season points
    UPDATE user_sport_stats
    SET points = 0
    WHERE user_id = p_player_id;

    -- Remove from subgroup_members table if it exists
    DELETE FROM subgroup_members
    WHERE user_id = p_player_id
    AND subgroup_id IN (SELECT id FROM subgroups WHERE club_id = v_club_id);

    -- Remove from profile_club_sports
    DELETE FROM profile_club_sports
    WHERE user_id = p_player_id AND club_id = v_club_id;

    -- Create activity event
    INSERT INTO activity_events (user_id, club_id, event_type, event_data, created_at)
    VALUES (
        p_player_id,
        v_club_id,
        'club_leave',
        jsonb_build_object(
            'left_directly', true,
            'previous_role', v_player.role
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Spieler hat den Verein verlassen',
        'was_coach', v_player.role IN ('coach', 'head_coach')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION leave_club_directly(UUID) TO authenticated;


-- ============================================
-- 7. UPDATE: approve_club_join_request - Punkte wiederherstellen
-- ============================================
CREATE OR REPLACE FUNCTION approve_club_join_request(
    p_request_id UUID,
    p_coach_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_data RECORD;
    player_update_count INTEGER;
    request_update_count INTEGER;
    v_hauptgruppe_id UUID;
    v_restored_points INTEGER := 0;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    -- Get or create Hauptgruppe for this club
    v_hauptgruppe_id := get_hauptgruppe_id(request_data.club_id);
    IF v_hauptgruppe_id IS NULL THEN
        v_hauptgruppe_id := create_hauptgruppe_for_club(request_data.club_id);
    END IF;

    -- *** NEU: Gespeicherte Saisonpunkte prüfen ***
    -- Wenn der Spieler in derselben Saison war, werden seine Punkte wiederhergestellt
    v_restored_points := restore_user_season_points(
        request_data.player_id,
        request_data.club_id
    );

    -- Update the player's club_id and add to Hauptgruppe
    -- Punkte werden auf den gespeicherten Wert gesetzt (oder 0 bei neuer Saison)
    UPDATE profiles
    SET
        club_id = request_data.club_id,
        subgroup_ids = CASE
            WHEN v_hauptgruppe_id IS NOT NULL THEN ARRAY[v_hauptgruppe_id::text]
            ELSE '{}'
        END,
        points = v_restored_points,
        updated_at = NOW()
    WHERE id = request_data.player_id;

    -- Sport-spezifische Punkte wurden bereits von restore_user_season_points() behandelt
    -- Falls KEINE gespeicherten Punkte existieren, auf 0 setzen
    IF v_restored_points = 0 THEN
        UPDATE user_sport_stats
        SET points = 0
        WHERE user_id = request_data.player_id;
    END IF;

    GET DIAGNOSTICS player_update_count = ROW_COUNT;

    IF player_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    -- Update the request status
    UPDATE club_requests
    SET
        status = 'approved',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE
            WHEN v_restored_points > 0 THEN 'Spieler wurde zum Verein hinzugefügt (Saisonpunkte wiederhergestellt: ' || v_restored_points || ')'
            ELSE 'Spieler wurde zum Verein hinzugefügt'
        END,
        'player_updated', player_update_count,
        'request_updated', request_update_count,
        'hauptgruppe_id', v_hauptgruppe_id,
        'restored_points', v_restored_points
    );
END;
$$;


-- ============================================
-- 8. UPDATE: approve_club_leave_request - Punkte speichern vor Austritt
-- ============================================
CREATE OR REPLACE FUNCTION approve_club_leave_request(
    p_request_id UUID,
    p_coach_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    request_data RECORD;
    player_update_count INTEGER;
    request_update_count INTEGER;
    v_club_id UUID;
BEGIN
    -- Get the request
    SELECT * INTO request_data
    FROM leave_club_requests
    WHERE id = p_request_id AND status = 'pending';

    IF request_data IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage nicht gefunden oder bereits bearbeitet');
    END IF;

    v_club_id := request_data.club_id;

    -- *** NEU: Saisonpunkte speichern BEVOR sie zurückgesetzt werden ***
    PERFORM save_user_season_points(request_data.player_id, v_club_id);

    -- Remove the player from the club
    -- Reset season points
    UPDATE profiles
    SET
        club_id = NULL,
        points = 0,
        updated_at = NOW()
    WHERE id = request_data.player_id;

    GET DIAGNOSTICS player_update_count = ROW_COUNT;

    IF player_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Spieler nicht gefunden');
    END IF;

    -- Reset sport-specific season points
    UPDATE user_sport_stats
    SET points = 0
    WHERE user_id = request_data.player_id;

    -- Update the request status
    UPDATE leave_club_requests
    SET
        status = 'approved',
        reviewed_by = p_coach_id,
        reviewed_at = NOW()
    WHERE id = p_request_id;

    GET DIAGNOSTICS request_update_count = ROW_COUNT;

    IF request_update_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Anfrage-Status konnte nicht aktualisiert werden');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Spieler hat den Verein verlassen',
        'player_updated', player_update_count,
        'request_updated', request_update_count
    );
END;
$$;


-- ============================================
-- 9. UPDATE: start_new_season - Punkte archivieren vor Reset
-- ============================================
CREATE OR REPLACE FUNCTION start_new_season(
    p_sport_id UUID,
    p_name TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_created_by UUID,
    p_club_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_new_season_id UUID;
    v_club_id UUID;
    v_old_season_id UUID;
BEGIN
    -- Club-ID vom Benutzer holen falls nicht übergeben
    IF p_club_id IS NULL THEN
        SELECT club_id INTO v_club_id
        FROM profiles
        WHERE id = p_created_by;
    ELSE
        v_club_id := p_club_id;
    END IF;

    -- *** NEU: Aktuelle Punkte für die ALTE Saison archivieren ***
    SELECT s.id INTO v_old_season_id
    FROM seasons s
    WHERE s.club_id = v_club_id
    AND s.sport_id = p_sport_id
    AND s.is_active = true
    LIMIT 1;

    IF v_old_season_id IS NOT NULL THEN
        -- Punkte aller Spieler dieses Vereins/Sports für die alte Saison speichern
        INSERT INTO user_season_points (user_id, season_id, points, sport_points)
        SELECT
            pcs.user_id,
            v_old_season_id,
            COALESCE(p.points, 0),
            COALESCE(uss.points, 0)
        FROM profile_club_sports pcs
        JOIN profiles p ON p.id = pcs.user_id
        LEFT JOIN user_sport_stats uss ON uss.user_id = pcs.user_id AND uss.sport_id = pcs.sport_id
        WHERE pcs.sport_id = p_sport_id
        AND pcs.club_id = v_club_id
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            sport_points = EXCLUDED.sport_points,
            updated_at = NOW();
    END IF;

    -- 1. Neue Saison erstellen (Trigger deaktiviert automatisch die alte für diesen Club)
    INSERT INTO seasons (sport_id, name, start_date, end_date, is_active, created_by, club_id)
    VALUES (p_sport_id, p_name, p_start_date, p_end_date, true, p_created_by, v_club_id)
    RETURNING id INTO v_new_season_id;

    -- 2. Saison-Punkte aller Spieler DIESES VEREINS für diese Sportart auf 0 setzen
    UPDATE profiles p
    SET
        points = 0,
        updated_at = NOW()
    WHERE p.id IN (
        SELECT pcs.user_id
        FROM profile_club_sports pcs
        WHERE pcs.sport_id = p_sport_id
        AND pcs.club_id = v_club_id
    );

    RAISE NOTICE 'Neue Saison % gestartet für Sport % in Club %. Punkte wurden zurückgesetzt.',
        p_name, p_sport_id, v_club_id;

    RETURN v_new_season_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 10. UPDATE: reset_season_points - Punkte archivieren vor Reset
-- ============================================
CREATE OR REPLACE FUNCTION reset_season_points(
    p_club_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    affected_count INTEGER;
    v_season RECORD;
BEGIN
    -- *** NEU: Punkte für alle aktiven Saisons archivieren ***
    FOR v_season IN
        SELECT s.id AS season_id, s.sport_id
        FROM seasons s
        WHERE s.club_id = p_club_id AND s.is_active = true
    LOOP
        INSERT INTO user_season_points (user_id, season_id, points, sport_points)
        SELECT
            p.id,
            v_season.season_id,
            COALESCE(p.points, 0),
            COALESCE(uss.points, 0)
        FROM profiles p
        LEFT JOIN user_sport_stats uss ON uss.user_id = p.id AND uss.sport_id = v_season.sport_id
        WHERE p.club_id = p_club_id
        ON CONFLICT (user_id, season_id) DO UPDATE SET
            points = EXCLUDED.points,
            sport_points = EXCLUDED.sport_points,
            updated_at = NOW();
    END LOOP;

    -- Dann wie bisher zurücksetzen
    UPDATE profiles
    SET points = 0, updated_at = NOW()
    WHERE club_id = p_club_id;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$;


-- ============================================
-- 11. Hilfsfunktion: Gespeicherte Saisonpunkte abrufen
-- ============================================
-- Für die Anzeige im Frontend (z.B. beim Wiederbeitritt)
CREATE OR REPLACE FUNCTION get_user_season_points(
    p_user_id UUID,
    p_club_id UUID
)
RETURNS TABLE (
    season_id UUID,
    season_name TEXT,
    is_active BOOLEAN,
    points INTEGER,
    sport_points INTEGER,
    saved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.is_active,
        usp.points,
        usp.sport_points,
        usp.updated_at
    FROM user_season_points usp
    JOIN seasons s ON s.id = usp.season_id
    WHERE usp.user_id = p_user_id
    AND s.club_id = p_club_id
    ORDER BY s.start_date DESC;
END;
$$;


-- ============================================
-- 12. Migration: Bestehende Punkte initialisieren
-- ============================================
-- Für alle aktuellen Spieler, die Punkte haben, Einträge erstellen
DO $$
DECLARE
    v_player RECORD;
    v_season RECORD;
BEGIN
    -- Für jeden Spieler der in einem Verein ist und Punkte hat
    FOR v_player IN
        SELECT p.id AS user_id, p.club_id, COALESCE(p.points, 0) AS profile_points
        FROM profiles p
        WHERE p.club_id IS NOT NULL
        AND COALESCE(p.points, 0) > 0
    LOOP
        -- Für jede aktive Saison des Vereins
        FOR v_season IN
            SELECT s.id AS season_id, s.sport_id
            FROM seasons s
            WHERE s.club_id = v_player.club_id AND s.is_active = true
        LOOP
            INSERT INTO user_season_points (user_id, season_id, points, sport_points)
            VALUES (
                v_player.user_id,
                v_season.season_id,
                v_player.profile_points,
                COALESCE((
                    SELECT uss.points
                    FROM user_sport_stats uss
                    WHERE uss.user_id = v_player.user_id
                    AND uss.sport_id = v_season.sport_id
                ), 0)
            )
            ON CONFLICT (user_id, season_id) DO NOTHING;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Migration abgeschlossen: Bestehende Punkte in user_season_points initialisiert';
END $$;


-- ============================================
-- Fertig! Saisonpunkte sind jetzt an Saisons gebunden.
-- ============================================
-- Verhalten:
-- - Spieler verlässt Verein → Punkte werden in user_season_points gespeichert
-- - Spieler tritt wieder bei (gleiche Saison) → Punkte werden wiederhergestellt
-- - Spieler tritt wieder bei (neue Saison) → 0 Punkte
-- - Neue Saison startet → Alte Punkte werden archiviert, neue Saison startet mit 0
-- - Punkte ändern sich (Training, Challenges etc.) → user_season_points wird automatisch synchronisiert
