-- Fix points_history table schema to match JavaScript code expectations
-- Run this in Supabase SQL Editor

-- Add missing columns to points_history
ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0;

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS elo_change INTEGER DEFAULT 0;

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS is_active_player BOOLEAN DEFAULT false;

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT false;

ALTER TABLE points_history
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Change awarded_by from UUID to TEXT (the code sends a name string, not a UUID)
-- First drop the foreign key constraint if it exists
ALTER TABLE points_history
DROP CONSTRAINT IF EXISTS points_history_awarded_by_fkey;

-- Change the column type to TEXT
ALTER TABLE points_history
ALTER COLUMN awarded_by TYPE TEXT;

-- Copy created_at to timestamp for existing records
UPDATE points_history
SET timestamp = created_at
WHERE timestamp IS NULL;

-- Create index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_points_history_timestamp ON points_history(timestamp DESC);

-- Verify the changes
DO $$
BEGIN
    RAISE NOTICE 'points_history table schema has been updated successfully';
END $$;
