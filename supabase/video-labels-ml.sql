-- Video Labels für ML-Training
-- Speichert strukturierte Annotationen von Coaches/Spielern
-- Diese Daten werden später zum Training von KI-Modellen verwendet
-- ============================================

-- ============================================
-- ENUM TYPES für Label-Kategorien
-- ============================================

-- Schlagarten im Tischtennis
DO $$ BEGIN
    CREATE TYPE tt_shot_type AS ENUM (
        -- Vorhand
        'forehand_topspin',
        'forehand_block',
        'forehand_push',
        'forehand_flick',
        'forehand_smash',
        'forehand_chop',
        'forehand_counter',
        -- Rückhand
        'backhand_topspin',
        'backhand_block',
        'backhand_push',
        'backhand_flick',
        'backhand_smash',
        'backhand_chop',
        'backhand_counter',
        -- Aufschlag
        'serve_forehand',
        'serve_backhand',
        'serve_pendulum',
        'serve_tomahawk',
        -- Sonstige
        'other',
        'unknown'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Event-Typen für Rally-Erkennung
DO $$ BEGIN
    CREATE TYPE tt_event_type AS ENUM (
        'rally_start',
        'rally_end',
        'point_won',
        'point_lost',
        'shot',
        'fault',
        'let',
        'timeout'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Spielerposition (aus Kameraperspektive)
DO $$ BEGIN
    CREATE TYPE tt_player_position AS ENUM (
        'near',      -- Nah an der Kamera
        'far',       -- Weit von der Kamera
        'left',      -- Links im Bild
        'right',     -- Rechts im Bild
        'unknown'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- HAUPT-TABELLE: video_labels
-- ============================================

CREATE TABLE IF NOT EXISTS video_labels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Referenz zum Video
    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,

    -- Wer hat gelabelt
    labeled_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Club-Zuordnung (für RLS)
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,

    -- Zeitpunkt im Video (in Sekunden)
    timestamp_start FLOAT NOT NULL,
    timestamp_end FLOAT,  -- NULL für Punkt-Events (z.B. einzelner Schlag)

    -- Was für ein Event
    event_type tt_event_type NOT NULL DEFAULT 'shot',

    -- Schlagdetails (nur wenn event_type = 'shot')
    shot_type tt_shot_type,
    shot_quality SMALLINT CHECK (shot_quality >= 1 AND shot_quality <= 5), -- 1-5 Sterne

    -- Spielerinfo
    player_position tt_player_position DEFAULT 'unknown',
    player_id UUID REFERENCES profiles(id), -- Falls bekannter Spieler

    -- Ball-Position (normalisiert 0-1, für späteres Training)
    ball_position_x FLOAT CHECK (ball_position_x >= 0 AND ball_position_x <= 1),
    ball_position_y FLOAT CHECK (ball_position_y >= 0 AND ball_position_y <= 1),

    -- Zusätzliche Beschreibung
    notes TEXT,

    -- Qualität des Labels (für ML-Training wichtig)
    confidence TEXT DEFAULT 'certain' CHECK (confidence IN ('certain', 'probable', 'uncertain')),
    is_verified BOOLEAN DEFAULT false,  -- Von zweiter Person bestätigt
    verified_by UUID REFERENCES profiles(id),

    -- ML-Export-Tracking
    exported_for_training BOOLEAN DEFAULT false,
    export_batch_id TEXT,  -- Welcher Export-Batch

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VIDEO METADATA für ML
-- Speichert technische Infos die fürs Training wichtig sind
-- ============================================

CREATE TABLE IF NOT EXISTS video_ml_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE UNIQUE,

    -- Technische Daten
    width INT,
    height INT,
    fps FLOAT,
    duration_seconds FLOAT,
    codec TEXT,

    -- Aufnahme-Kontext
    camera_angle TEXT CHECK (camera_angle IN ('side', 'behind', 'above', 'mixed', 'unknown')),
    camera_distance TEXT CHECK (camera_distance IN ('close', 'medium', 'far', 'unknown')),
    lighting TEXT CHECK (lighting IN ('good', 'moderate', 'poor', 'unknown')),

    -- Szene
    table_visible BOOLEAN,
    players_count SMALLINT,
    has_audience BOOLEAN,

    -- Audio-Qualität (wichtig für Rally-Detection)
    audio_quality TEXT CHECK (audio_quality IN ('good', 'moderate', 'poor', 'none', 'unknown')),
    ball_sounds_audible BOOLEAN,

    -- ML-Eignung
    suitable_for_training BOOLEAN DEFAULT true,
    exclusion_reason TEXT,

    -- Auto-detected (später von KI gefüllt)
    auto_detected_fps FLOAT,
    auto_detected_table BOOLEAN,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RALLY SEGMENTS (zusammenhängende Ballwechsel)
-- Wird später von KI oder manuell gefüllt
-- ============================================

CREATE TABLE IF NOT EXISTS video_rally_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,

    -- Zeitraum
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    duration_seconds FLOAT GENERATED ALWAYS AS (end_time - start_time) STORED,

    -- Rally-Info
    shot_count INT,
    winner TEXT CHECK (winner IN ('near', 'far', 'unknown')),
    end_type TEXT CHECK (end_type IN ('winner', 'error', 'net', 'out', 'unknown')),

    -- Quelle
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ai_detected', 'ai_verified')),
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),

    -- Von wem
    created_by UUID REFERENCES profiles(id),
    verified BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES für Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_video_labels_video ON video_labels(video_id);
CREATE INDEX IF NOT EXISTS idx_video_labels_event_type ON video_labels(event_type);
CREATE INDEX IF NOT EXISTS idx_video_labels_shot_type ON video_labels(shot_type);
CREATE INDEX IF NOT EXISTS idx_video_labels_timestamp ON video_labels(video_id, timestamp_start);
CREATE INDEX IF NOT EXISTS idx_video_labels_club ON video_labels(club_id);
CREATE INDEX IF NOT EXISTS idx_video_labels_exported ON video_labels(exported_for_training) WHERE exported_for_training = false;
CREATE INDEX IF NOT EXISTS idx_video_labels_verified ON video_labels(is_verified) WHERE is_verified = true;

CREATE INDEX IF NOT EXISTS idx_video_ml_metadata_video ON video_ml_metadata(video_id);
CREATE INDEX IF NOT EXISTS idx_video_ml_metadata_suitable ON video_ml_metadata(suitable_for_training) WHERE suitable_for_training = true;

CREATE INDEX IF NOT EXISTS idx_video_rally_segments_video ON video_rally_segments(video_id);
CREATE INDEX IF NOT EXISTS idx_video_rally_segments_time ON video_rally_segments(video_id, start_time);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS update_video_labels_updated_at ON video_labels;
CREATE TRIGGER update_video_labels_updated_at
    BEFORE UPDATE ON video_labels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_video_ml_metadata_updated_at ON video_ml_metadata;
CREATE TRIGGER update_video_ml_metadata_updated_at
    BEFORE UPDATE ON video_ml_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE video_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_ml_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_rally_segments ENABLE ROW LEVEL SECURITY;

-- video_labels Policies
DROP POLICY IF EXISTS "video_labels_select" ON video_labels;
DROP POLICY IF EXISTS "video_labels_insert" ON video_labels;
DROP POLICY IF EXISTS "video_labels_update" ON video_labels;
DROP POLICY IF EXISTS "video_labels_delete" ON video_labels;

-- SELECT: Eigene Labels + Labels im eigenen Club
CREATE POLICY "video_labels_select" ON video_labels
    FOR SELECT USING (
        labeled_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_labels.club_id
        )
    );

-- INSERT: Jeder authentifizierte User kann labeln
CREATE POLICY "video_labels_insert" ON video_labels
    FOR INSERT WITH CHECK (
        labeled_by = auth.uid()
    );

-- UPDATE: Nur eigene Labels oder Coach kann verifizieren
CREATE POLICY "video_labels_update" ON video_labels
    FOR UPDATE USING (
        labeled_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_labels.club_id
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- DELETE: Nur eigene Labels oder Admin
CREATE POLICY "video_labels_delete" ON video_labels
    FOR DELETE USING (
        labeled_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- video_ml_metadata Policies (nur Coaches können bearbeiten)
DROP POLICY IF EXISTS "video_ml_metadata_select" ON video_ml_metadata;
DROP POLICY IF EXISTS "video_ml_metadata_insert" ON video_ml_metadata;
DROP POLICY IF EXISTS "video_ml_metadata_update" ON video_ml_metadata;

CREATE POLICY "video_ml_metadata_select" ON video_ml_metadata
    FOR SELECT USING (true); -- Alle können lesen

CREATE POLICY "video_ml_metadata_insert" ON video_ml_metadata
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE POLICY "video_ml_metadata_update" ON video_ml_metadata
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- video_rally_segments Policies
DROP POLICY IF EXISTS "video_rally_segments_select" ON video_rally_segments;
DROP POLICY IF EXISTS "video_rally_segments_insert" ON video_rally_segments;
DROP POLICY IF EXISTS "video_rally_segments_update" ON video_rally_segments;
DROP POLICY IF EXISTS "video_rally_segments_delete" ON video_rally_segments;

CREATE POLICY "video_rally_segments_select" ON video_rally_segments
    FOR SELECT USING (true);

CREATE POLICY "video_rally_segments_insert" ON video_rally_segments
    FOR INSERT WITH CHECK (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE POLICY "video_rally_segments_update" ON video_rally_segments
    FOR UPDATE USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('coach', 'head_coach', 'admin')
        )
    );

CREATE POLICY "video_rally_segments_delete" ON video_rally_segments
    FOR DELETE USING (
        created_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Statistik: Wie viele Labels pro Schlagtyp
CREATE OR REPLACE FUNCTION get_label_statistics(p_club_id UUID DEFAULT NULL)
RETURNS TABLE (
    shot_type tt_shot_type,
    label_count BIGINT,
    verified_count BIGINT,
    avg_quality NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vl.shot_type,
        COUNT(*)::BIGINT AS label_count,
        COUNT(*) FILTER (WHERE vl.is_verified)::BIGINT AS verified_count,
        ROUND(AVG(vl.shot_quality), 2) AS avg_quality
    FROM video_labels vl
    WHERE vl.shot_type IS NOT NULL
      AND (p_club_id IS NULL OR vl.club_id = p_club_id)
    GROUP BY vl.shot_type
    ORDER BY label_count DESC;
END;
$$;

-- Export-Funktion: Labels für ML-Training exportieren
CREATE OR REPLACE FUNCTION export_labels_for_training(
    p_min_labels_per_type INT DEFAULT 10,
    p_only_verified BOOLEAN DEFAULT false,
    p_batch_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    video_url TEXT,
    timestamp_start FLOAT,
    timestamp_end FLOAT,
    event_type tt_event_type,
    shot_type tt_shot_type,
    player_position tt_player_position,
    confidence TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_batch_id TEXT;
BEGIN
    -- Batch-ID generieren falls nicht angegeben
    v_batch_id := COALESCE(p_batch_id, 'export_' || NOW()::TEXT);

    -- Labels markieren als exportiert
    UPDATE video_labels
    SET exported_for_training = true,
        export_batch_id = v_batch_id
    WHERE id IN (
        SELECT vl.id
        FROM video_labels vl
        WHERE (NOT p_only_verified OR vl.is_verified)
          AND vl.exported_for_training = false
    );

    -- Daten zurückgeben
    RETURN QUERY
    SELECT
        va.video_url,
        vl.timestamp_start,
        vl.timestamp_end,
        vl.event_type,
        vl.shot_type,
        vl.player_position,
        vl.confidence
    FROM video_labels vl
    JOIN video_analyses va ON va.id = vl.video_id
    WHERE vl.export_batch_id = v_batch_id;
END;
$$;

-- Rally-Segmente für ein Video abrufen
CREATE OR REPLACE FUNCTION get_video_rallies(p_video_id UUID)
RETURNS TABLE (
    id UUID,
    start_time FLOAT,
    end_time FLOAT,
    duration_seconds FLOAT,
    shot_count INT,
    winner TEXT,
    source TEXT,
    confidence FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vrs.id,
        vrs.start_time,
        vrs.end_time,
        vrs.duration_seconds,
        vrs.shot_count,
        vrs.winner,
        vrs.source,
        vrs.confidence
    FROM video_rally_segments vrs
    WHERE vrs.video_id = p_video_id
    ORDER BY vrs.start_time;
END;
$$;

-- ============================================
-- GDPR: Consent-Tracking für ML-Nutzung
-- ============================================

CREATE TABLE IF NOT EXISTS ml_data_consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

    -- Einwilligungen
    consent_video_training BOOLEAN DEFAULT false,  -- Videos für KI-Training nutzen
    consent_anonymized_export BOOLEAN DEFAULT false,  -- Anonymisierter Export
    consent_research BOOLEAN DEFAULT false,  -- Für Forschungszwecke

    -- Wann/Wie
    consented_at TIMESTAMPTZ,
    consent_version TEXT DEFAULT '1.0',
    ip_address INET,

    -- Widerruf
    revoked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ml_data_consent_user ON ml_data_consent(user_id);

ALTER TABLE ml_data_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ml_data_consent_select" ON ml_data_consent
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ml_data_consent_insert" ON ml_data_consent
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "ml_data_consent_update" ON ml_data_consent
    FOR UPDATE USING (user_id = auth.uid());

-- ============================================
-- KOMMENTAR zur Nutzung
-- ============================================

COMMENT ON TABLE video_labels IS 'Strukturierte Labels für ML-Training. Jeder Eintrag ist eine Annotation eines Moments im Video (Schlag, Rally-Start, etc.)';
COMMENT ON TABLE video_ml_metadata IS 'Technische Metadaten eines Videos die für ML-Training relevant sind (Auflösung, Kamerawinkel, etc.)';
COMMENT ON TABLE video_rally_segments IS 'Erkannte oder manuell markierte Ballwechsel-Segmente in Videos';
COMMENT ON TABLE ml_data_consent IS 'GDPR-konforme Einwilligungsverwaltung für die Nutzung von Nutzerdaten im ML-Training';
