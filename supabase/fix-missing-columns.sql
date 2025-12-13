-- Fix missing columns in profiles table for migration
-- Run this BEFORE running the migration script

-- Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS qttr_points INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_group TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS jersey_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;

-- Add sport_id column for multi-sport support
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sport_id UUID REFERENCES sports(id) ON DELETE SET NULL;

-- Ensure the doubles_match_requests has the new columns too
ALTER TABLE doubles_match_requests ADD COLUMN IF NOT EXISTS match_mode TEXT DEFAULT 'best-of-5';
ALTER TABLE doubles_match_requests ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;
ALTER TABLE doubles_match_requests ADD COLUMN IF NOT EXISTS handicap JSONB;

-- Update display_name from first_name + last_name if empty
UPDATE profiles
SET display_name = COALESCE(
    NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''),
    email,
    'Unbekannt'
)
WHERE display_name IS NULL;

-- Verify the columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles'
AND column_name IN ('display_name', 'qttr_points', 'sport_id', 'wins', 'losses')
ORDER BY column_name;
