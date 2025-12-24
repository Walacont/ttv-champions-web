-- Enable Supabase Realtime for match request tables
-- This is required for real-time updates when accepting/rejecting match requests

-- ============================================
-- ENABLE REALTIME FOR match_requests
-- ============================================

-- First, check if the publication exists and alter it
DO $$
BEGIN
    -- Try to add match_requests to supabase_realtime publication
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE match_requests;
        RAISE NOTICE 'Added match_requests to supabase_realtime publication';
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'match_requests already in supabase_realtime publication';
        WHEN undefined_object THEN
            RAISE NOTICE 'supabase_realtime publication does not exist - table will use default realtime';
    END;
END $$;

-- ============================================
-- ENABLE REALTIME FOR doubles_match_requests
-- ============================================

DO $$
BEGIN
    -- Try to add doubles_match_requests to supabase_realtime publication
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE doubles_match_requests;
        RAISE NOTICE 'Added doubles_match_requests to supabase_realtime publication';
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'doubles_match_requests already in supabase_realtime publication';
        WHEN undefined_object THEN
            RAISE NOTICE 'supabase_realtime publication does not exist - table will use default realtime';
    END;
END $$;

-- ============================================
-- ALSO ENABLE FOR matches and doubles_matches
-- So the match lists update in real-time too
-- ============================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE matches;
        RAISE NOTICE 'Added matches to supabase_realtime publication';
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'matches already in supabase_realtime publication';
        WHEN undefined_object THEN
            RAISE NOTICE 'supabase_realtime publication does not exist';
    END;
END $$;

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE doubles_matches;
        RAISE NOTICE 'Added doubles_matches to supabase_realtime publication';
    EXCEPTION
        WHEN duplicate_object THEN
            RAISE NOTICE 'doubles_matches already in supabase_realtime publication';
        WHEN undefined_object THEN
            RAISE NOTICE 'supabase_realtime publication does not exist';
    END;
END $$;

-- ============================================
-- Verify realtime is enabled
-- ============================================

-- Check current publications
SELECT
    schemaname,
    tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
