-- =============================================================================
-- DELETE DUPLICATE CLUBS FROM MIGRATION
-- =============================================================================
-- This script removes duplicate clubs that were created during migration.
-- It keeps the OLDEST club (original) and updates all references to point to it.
-- =============================================================================

-- =============================================================================
-- 0. DISABLE USER TRIGGERS TEMPORARILY
-- =============================================================================
-- Disable specific user-defined triggers to prevent errors during update
ALTER TABLE profiles DISABLE TRIGGER trigger_club_join_event;
ALTER TABLE profiles DISABLE TRIGGER trigger_rank_up_event;

-- First, show duplicates
SELECT MIN(name) as name, COUNT(*) as count, MIN(created_at) as oldest, MAX(created_at) as newest
FROM clubs
GROUP BY LOWER(name)
HAVING COUNT(*) > 1
ORDER BY MIN(name);

-- =============================================================================
-- 1. CREATE MAPPING TABLE: duplicate_id -> keep_id
-- =============================================================================
-- We'll keep the oldest club (first created_at) for each name
CREATE TEMP TABLE club_mapping AS
WITH ranked_clubs AS (
    SELECT
        id,
        LOWER(name) as name_lower,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(name)
            ORDER BY created_at ASC
        ) as rn
    FROM clubs
),
kept_clubs AS (
    SELECT id as keep_id, name_lower
    FROM ranked_clubs
    WHERE rn = 1
),
duplicate_clubs AS (
    SELECT id as duplicate_id, name_lower
    FROM ranked_clubs
    WHERE rn > 1
)
SELECT d.duplicate_id, k.keep_id
FROM duplicate_clubs d
JOIN kept_clubs k ON d.name_lower = k.name_lower;

-- Show what will be updated
SELECT
    d.duplicate_id,
    c1.name as duplicate_name,
    d.keep_id,
    c2.name as keep_name
FROM club_mapping d
JOIN clubs c1 ON c1.id = d.duplicate_id
JOIN clubs c2 ON c2.id = d.keep_id;

-- =============================================================================
-- 2. UPDATE ALL FOREIGN KEY REFERENCES
-- =============================================================================

-- profiles.club_id
UPDATE profiles SET club_id = m.keep_id
FROM club_mapping m
WHERE profiles.club_id = m.duplicate_id;

-- matches.club_id
UPDATE matches SET club_id = m.keep_id
FROM club_mapping m
WHERE matches.club_id = m.duplicate_id;

-- doubles_matches.club_id
UPDATE doubles_matches SET club_id = m.keep_id
FROM club_mapping m
WHERE doubles_matches.club_id = m.duplicate_id;

-- match_requests.club_id
UPDATE match_requests SET club_id = m.keep_id
FROM club_mapping m
WHERE match_requests.club_id = m.duplicate_id;

-- doubles_match_requests.club_id
UPDATE doubles_match_requests SET club_id = m.keep_id
FROM club_mapping m
WHERE doubles_match_requests.club_id = m.duplicate_id;

-- doubles_pairings.club_id
UPDATE doubles_pairings SET club_id = m.keep_id
FROM club_mapping m
WHERE doubles_pairings.club_id = m.duplicate_id;

-- invitation_codes.club_id
UPDATE invitation_codes SET club_id = m.keep_id
FROM club_mapping m
WHERE invitation_codes.club_id = m.duplicate_id;

-- exercises.club_id
UPDATE exercises SET club_id = m.keep_id
FROM club_mapping m
WHERE exercises.club_id = m.duplicate_id;

-- exercises.record_holder_club_id
UPDATE exercises SET record_holder_club_id = m.keep_id
FROM club_mapping m
WHERE exercises.record_holder_club_id = m.duplicate_id;

-- activity_events.club_id
UPDATE activity_events SET club_id = m.keep_id
FROM club_mapping m
WHERE activity_events.club_id = m.duplicate_id;

-- audit_logs.club_id (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
        EXECUTE 'UPDATE audit_logs SET club_id = m.keep_id
                 FROM club_mapping m
                 WHERE audit_logs.club_id = m.duplicate_id';
    END IF;
END $$;

-- community_posts.club_id (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_posts') THEN
        EXECUTE 'UPDATE community_posts SET club_id = m.keep_id
                 FROM club_mapping m
                 WHERE community_posts.club_id = m.duplicate_id';
    END IF;
END $$;

-- community_comments.club_id (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'community_comments') THEN
        EXECUTE 'UPDATE community_comments SET club_id = m.keep_id
                 FROM club_mapping m
                 WHERE community_comments.club_id = m.duplicate_id';
    END IF;
END $$;

-- profile_club_sports.club_id (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_club_sports') THEN
        EXECUTE 'UPDATE profile_club_sports SET club_id = m.keep_id
                 FROM club_mapping m
                 WHERE profile_club_sports.club_id = m.duplicate_id';
    END IF;
END $$;

-- head_to_head_handicaps.club_id (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'head_to_head_handicaps') THEN
        EXECUTE 'UPDATE head_to_head_handicaps SET club_id = m.keep_id
                 FROM club_mapping m
                 WHERE head_to_head_handicaps.club_id = m.duplicate_id';
    END IF;
END $$;

-- =============================================================================
-- 3. DELETE DUPLICATE CLUBS
-- =============================================================================
DELETE FROM clubs
WHERE id IN (SELECT duplicate_id FROM club_mapping);

-- =============================================================================
-- 4. RE-ENABLE TRIGGERS
-- =============================================================================
ALTER TABLE profiles ENABLE TRIGGER trigger_club_join_event;
ALTER TABLE profiles ENABLE TRIGGER trigger_rank_up_event;

-- =============================================================================
-- 5. SHOW RESULTS
-- =============================================================================
SELECT 'Clubs after cleanup' as status, COUNT(*) as count FROM clubs;

-- Show all clubs now
SELECT id, name, created_at
FROM clubs
ORDER BY name;

-- Clean up temp table
DROP TABLE club_mapping;
