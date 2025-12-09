-- Fix: doubles_matches table doesn't have 'processed' column
-- but the trigger function process_doubles_match_result() checks for it
-- This causes error: "record 'new' has no field 'processed'"

-- Option 1: Add the processed column to doubles_matches
ALTER TABLE doubles_matches ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT false;

-- Option 2 (Alternative): Drop the problematic trigger if you want to use the
-- process_doubles_match function from doubles-policies.sql instead
-- DROP TRIGGER IF EXISTS trigger_process_doubles_match ON doubles_matches;

-- Note: After running this, the trigger will work because:
-- 1. The trigger_process_doubles_match (BEFORE INSERT) runs first and checks processed=false
-- 2. The process_doubles_match_trigger (AFTER INSERT) runs to update Elo ratings
