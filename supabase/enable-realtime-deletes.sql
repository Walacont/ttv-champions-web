-- Enable REPLICA IDENTITY FULL for real-time DELETE events
-- This is required so that DELETE events include the full 'old' row data
-- Without this, Supabase Realtime cannot filter DELETE events by row values

-- For match_requests table
ALTER TABLE match_requests REPLICA IDENTITY FULL;

-- For doubles_match_requests table
ALTER TABLE doubles_match_requests REPLICA IDENTITY FULL;

-- For notifications table (if needed for real-time notification removal)
ALTER TABLE notifications REPLICA IDENTITY FULL;

-- Verify the changes
SELECT relname, relreplident
FROM pg_class
WHERE relname IN ('match_requests', 'doubles_match_requests', 'notifications');
-- relreplident = 'f' means FULL is set
