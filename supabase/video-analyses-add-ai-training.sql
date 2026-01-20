-- Migration: allow_ai_training Feld zu video_analyses hinzufügen
-- Ermöglicht DSGVO-konforme Einwilligung pro Video für KI-Training
-- ============================================

-- Spalte hinzufügen falls nicht vorhanden
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

-- Index für schnelle Abfragen der trainingsfähigen Videos
CREATE INDEX IF NOT EXISTS idx_video_analyses_ai_training
    ON video_analyses(allow_ai_training)
    WHERE allow_ai_training = true;
