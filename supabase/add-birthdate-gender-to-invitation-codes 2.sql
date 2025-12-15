-- ============================================
-- Add birthdate and gender columns to invitation_codes
-- ============================================
-- Run this in Supabase SQL Editor

-- Add birthdate and gender columns for storing offline player data
ALTER TABLE invitation_codes
ADD COLUMN IF NOT EXISTS birthdate TEXT,
ADD COLUMN IF NOT EXISTS gender TEXT;

-- Add superseded_at column if not exists
ALTER TABLE invitation_codes
ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'invitation_codes'
ORDER BY ordinal_position;
