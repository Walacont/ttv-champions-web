-- Migration: allow_ai_training und ai_ready Felder zu video_analyses hinzufügen
-- Ermöglicht DSGVO-konforme Einwilligung pro Video für KI-Training
-- ============================================

-- allow_ai_training Spalte hinzufügen falls nicht vorhanden
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'video_analyses' AND column_name = 'allow_ai_training'
    ) THEN
        ALTER TABLE video_analyses
        ADD COLUMN allow_ai_training BOOLEAN DEFAULT false;

        COMMENT ON COLUMN video_analyses.allow_ai_training IS
            'DSGVO-Einwilligung: Video darf anonymisiert für KI-Training genutzt werden';
    END IF;
END $$;

-- ai_ready Spalte hinzufügen falls nicht vorhanden
-- Wird auf true gesetzt wenn das interne Team das Video gelabelt hat
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'video_analyses' AND column_name = 'ai_ready'
    ) THEN
        ALTER TABLE video_analyses
        ADD COLUMN ai_ready BOOLEAN DEFAULT false;

        COMMENT ON COLUMN video_analyses.ai_ready IS
            'Vom internen Team geprüft und gelabelt - bereit für ML-Training';
    END IF;
END $$;

-- Index für schnelle Abfragen der trainingsfähigen Videos
CREATE INDEX IF NOT EXISTS idx_video_analyses_ai_training
    ON video_analyses(allow_ai_training)
    WHERE allow_ai_training = true;

-- Index für Videos die noch gelabelt werden müssen
CREATE INDEX IF NOT EXISTS idx_video_analyses_pending_labeling
    ON video_analyses(allow_ai_training, ai_ready)
    WHERE allow_ai_training = true AND ai_ready = false;
