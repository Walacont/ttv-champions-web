-- Fix: Missing columns that database triggers check for
-- This causes errors like: "record 'new' has no field 'processed'"
-- and "column 'doubles_highest_elo' does not exist"

-- Add missing columns to doubles_matches table
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

-- Add missing column to doubles_pairings table (tracks highest achieved Elo)
ALTER TABLE doubles_pairings ADD COLUMN IF NOT EXISTS doubles_highest_elo INTEGER DEFAULT 800;

-- Note: After running this, the triggers will work because:
-- 1. The trigger_process_doubles_match (BEFORE INSERT) runs first and checks processed=false
-- 2. The process_doubles_match_trigger (AFTER INSERT) runs to update Elo ratings
