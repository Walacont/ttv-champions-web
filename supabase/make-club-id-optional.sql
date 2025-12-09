-- Make club_id optional in matches table for players without a club

-- Remove NOT NULL constraint from club_id in matches table
ALTER TABLE matches ALTER COLUMN club_id DROP NOT NULL;

-- Also make club_id optional in match_requests table
ALTER TABLE match_requests ALTER COLUMN club_id DROP NOT NULL;

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'club_id is now optional in matches and match_requests tables';
END $$;
