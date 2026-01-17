-- ============================================
-- ADD UNIT FIELD TO EXERCISES
-- Allows custom units like "Sterne", "Punkte", etc.
-- instead of just "Wiederholungen"
-- ============================================

-- Add unit column to exercises table
ALTER TABLE exercises
ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'Wiederholungen';

-- Add comment for documentation
COMMENT ON COLUMN exercises.unit IS 'Die Einheit für die Meilensteine (z.B. Wiederholungen, Sterne, Punkte, Treffer, Sekunden)';

-- ============================================
-- Done! Unit field added to exercises.
-- ============================================
