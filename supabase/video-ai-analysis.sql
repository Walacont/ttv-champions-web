-- Video AI Analysis - KI-gestützte Videoanalyse
-- Speichert Pose-Erkennung, Shot-Klassifizierung und weitere KI-Ergebnisse
-- Verwendet MediaPipe Tasks Vision (PoseLandmarker) als Basis
-- ============================================

-- ============================================
-- HAUPTTABELLE: KI-Analyse-Ergebnisse pro Video
-- ============================================

CREATE TABLE IF NOT EXISTS video_ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,

    -- Analyse-Typ
    analysis_type TEXT NOT NULL CHECK (analysis_type IN (
        'pose_estimation',       -- Skelett-Erkennung
        'shot_classification',   -- Schlag-Klassifizierung
        'ball_tracking',         -- Ball-Tracking
        'match_analysis',        -- Match-Analyse (Fehler, Punkte)
        'movement_quality',      -- Bewegungsqualität (Balleimertraining)
        'player_detection'       -- Spieler-Erkennung
    )),

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'processing', 'completed', 'failed'
    )),

    -- Wo wurde die Analyse durchgeführt
    processing_location TEXT DEFAULT 'browser' CHECK (processing_location IN (
        'browser', 'edge_function', 'server'
    )),

    -- Verwendetes Modell
    model_name TEXT,      -- z.B. 'mediapipe_pose_landmarker_heavy'
    model_version TEXT,   -- z.B. '0.10.18'

    -- Ergebnisse (flexibles JSONB)
    results JSONB,

    -- Zusammenfassung (denormalisiert für schnelle Queries)
    summary JSONB,

    -- Performance-Metriken
    processing_time_ms INT,
    frames_analyzed INT,

    -- Metadaten
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FRAME-TABELLE: Pro-Frame KI-Daten
-- ============================================

CREATE TABLE IF NOT EXISTS video_ai_frames (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES video_ai_analyses(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES video_analyses(id) ON DELETE CASCADE,

    -- Frame-Timing
    timestamp_seconds FLOAT NOT NULL,
    frame_number INT,

    -- Pose-Daten (MediaPipe: bis zu 2 Personen mit je 33 Keypoints)
    -- Format: [{landmarks: [{x, y, z, visibility}, ...], worldLandmarks: [...]}]
    poses JSONB,

    -- Erkannte Spieleranzahl
    player_count SMALLINT,

    -- Ball-Position (wenn erkannt, für spätere Phase)
    ball_x FLOAT,
    ball_y FLOAT,
    ball_confidence FLOAT,

    -- Tisch-Grenzen (wenn erkannt)
    table_bounds JSONB,  -- {x1, y1, x2, y2, confidence}

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDIZES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_video_ai_analyses_video
    ON video_ai_analyses(video_id);

CREATE INDEX IF NOT EXISTS idx_video_ai_analyses_type
    ON video_ai_analyses(video_id, analysis_type);

CREATE INDEX IF NOT EXISTS idx_video_ai_analyses_status
    ON video_ai_analyses(status) WHERE status != 'completed';

CREATE INDEX IF NOT EXISTS idx_video_ai_frames_analysis
    ON video_ai_frames(analysis_id);

CREATE INDEX IF NOT EXISTS idx_video_ai_frames_time
    ON video_ai_frames(video_id, timestamp_seconds);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE video_ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_ai_frames ENABLE ROW LEVEL SECURITY;

-- Coaches/Admins können alle Analysen im Club sehen
CREATE POLICY "Coaches see club ai analyses"
    ON video_ai_analyses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN club_players cp ON cp.club_id = va.club_id
            WHERE va.id = video_ai_analyses.video_id
              AND cp.player_id = auth.uid()
              AND cp.role IN ('coach', 'head_coach', 'admin')
        )
    );

-- Spieler können eigene Video-Analysen sehen
CREATE POLICY "Players see own ai analyses"
    ON video_ai_analyses FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_ai_analyses.video_id
              AND va.uploaded_by = auth.uid()
        )
    );

-- Coaches können Analysen erstellen
CREATE POLICY "Coaches create ai analyses"
    ON video_ai_analyses FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN club_players cp ON cp.club_id = va.club_id
            WHERE va.id = video_ai_analyses.video_id
              AND cp.player_id = auth.uid()
              AND cp.role IN ('coach', 'head_coach', 'admin')
        )
        OR
        EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_ai_analyses.video_id
              AND va.uploaded_by = auth.uid()
        )
    );

-- Coaches können Status aktualisieren
CREATE POLICY "Coaches update ai analyses"
    ON video_ai_analyses FOR UPDATE
    USING (created_by = auth.uid());

-- Frame-Policies (gleiche Regeln wie Analysen)
CREATE POLICY "Users see ai frames via analysis"
    ON video_ai_frames FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM video_ai_analyses vaa
            WHERE vaa.id = video_ai_frames.analysis_id
        )
    );

CREATE POLICY "Users create ai frames"
    ON video_ai_frames FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM video_ai_analyses vaa
            WHERE vaa.id = video_ai_frames.analysis_id
              AND vaa.created_by = auth.uid()
        )
    );

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_video_ai_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_video_ai_analyses_updated_at ON video_ai_analyses;
CREATE TRIGGER trigger_video_ai_analyses_updated_at
    BEFORE UPDATE ON video_ai_analyses
    FOR EACH ROW
    EXECUTE FUNCTION update_video_ai_analyses_updated_at();
