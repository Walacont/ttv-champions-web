-- Fix: doubles_matches table is missing columns that triggers check for
-- This causes errors like: "record 'new' has no field 'processed'"
-- and "record 'new' has no field 'handicap_used'"

-- Add missing columns to doubles_matches table
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS handicap_used BOOLEAN DEFAULT false;

-- Note: After running this, the triggers will work because:
-- 1. The trigger_process_doubles_match (BEFORE INSERT) runs first and checks processed=false
-- 2. The process_doubles_match_trigger (AFTER INSERT) runs to update Elo ratings
