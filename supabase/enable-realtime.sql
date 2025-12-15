-- Enable Realtime for necessary tables
-- Run this in the Supabase SQL Editor

-- Enable realtime for profiles table (for leaderboard updates)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Enable realtime for match_requests table (for incoming requests)
ALTER PUBLICATION supabase_realtime ADD TABLE match_requests;

-- Enable realtime for matches table (for match history)
ALTER PUBLICATION supabase_realtime ADD TABLE matches;

-- Enable realtime for doubles_matches table (for doubles match history)
ALTER PUBLICATION supabase_realtime ADD TABLE doubles_matches;

-- Enable realtime for doubles_match_requests table (for doubles incoming requests)
ALTER PUBLICATION supabase_realtime ADD TABLE doubles_match_requests;

-- Note: If you get an error that a table is already added, that's fine - it means realtime is already enabled.
-- You can check which tables have realtime enabled with:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
