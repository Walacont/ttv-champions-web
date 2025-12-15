-- ============================================
-- Fix: Add missing columns to invitation_codes
-- ============================================
-- Run this in Supabase SQL Editor

-- Add missing columns for invitation codes
ALTER TABLE invitation_codes
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'player',
ADD COLUMN IF NOT EXISTS subgroup_ids UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS used_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS superseded BOOLEAN DEFAULT false;

-- Verify the changes
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'invitation_codes'
ORDER BY ordinal_position;
