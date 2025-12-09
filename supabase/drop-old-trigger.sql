-- Drop the old trigger that uses outdated column names (set1_winner, set1_loser, etc.)
-- The JavaScript code now handles creating matches directly with the correct 'sets' JSONB column

-- Drop the trigger
DROP TRIGGER IF EXISTS trigger_process_approved_match_request ON match_requests;

-- Optionally drop the function too (it's no longer needed)
DROP FUNCTION IF EXISTS process_approved_match_request();

-- Note: The match creation is now handled by the JavaScript code in dashboard-supabase.js
-- in the createMatchFromRequest() function which uses the correct 'sets' JSONB column format
