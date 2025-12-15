-- Fix: Missing columns that database triggers check for
-- This causes errors like: "record 'new' has no field 'processed'"
-- and "column 'doubles_highest_elo' does not exist"

-- Add missing columns to doubles_matches table
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS team_a_pairing_id TEXT REFERENCES doubles_pairings(id);
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS team_b_pairing_id TEXT REFERENCES doubles_pairings(id);
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set1_a INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set1_b INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set2_a INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set2_b INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set3_a INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set3_b INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set4_a INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set4_b INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set5_a INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS set5_b INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES profiles(id);
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS team_a_elo_change INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS team_b_elo_change INTEGER DEFAULT 0;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS season_points_awarded INTEGER DEFAULT 0;

-- Add missing columns to doubles_pairings table for win/loss tracking
ALTER TABLE doubles_pairings ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;
ALTER TABLE doubles_pairings ADD COLUMN IF NOT EXISTS losses INTEGER DEFAULT 0;
ALTER TABLE doubles_pairings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add missing columns to profiles table for doubles stats
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS doubles_highest_elo INTEGER DEFAULT 800;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS doubles_wins INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS doubles_losses INTEGER DEFAULT 0;

-- Note: After running this, the triggers will work because:
-- 1. The trigger_process_doubles_match (BEFORE INSERT) runs first and checks processed=false
-- 2. The process_doubles_match_trigger (AFTER INSERT) runs to update Elo ratings
