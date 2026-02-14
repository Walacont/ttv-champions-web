-- Fix: Allow per-occurrence invitations for recurring events
-- Problem: Old UNIQUE(event_id, user_id) constraint prevents creating
-- separate invitations per occurrence date. Players can only have ONE
-- invitation per event, so accepting/declining affects ALL occurrences.
--
-- Solution: Drop old constraint, ensure new one with occurrence_date exists.

-- Step 1: Find and drop old unique constraint on just (event_id, user_id)
-- The constraint name varies, so we use a dynamic approach
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find unique constraints on event_invitations that are on (event_id, user_id) only
    FOR r IN
        SELECT tc.constraint_name::text AS cname
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        WHERE tc.table_name = 'event_invitations'
            AND tc.constraint_type = 'UNIQUE'
            AND tc.table_schema = 'public'
        GROUP BY tc.constraint_name
        HAVING array_agg(ccu.column_name::text ORDER BY ccu.column_name::text) = ARRAY['event_id', 'user_id']
    LOOP
        EXECUTE format('ALTER TABLE event_invitations DROP CONSTRAINT IF EXISTS %I', r.cname);
        RAISE NOTICE 'Dropped old constraint: %', r.cname;
    END LOOP;
END
$$;

-- Step 2: Also try common auto-generated constraint names
ALTER TABLE event_invitations DROP CONSTRAINT IF EXISTS event_invitations_event_id_user_id_key;
ALTER TABLE event_invitations DROP CONSTRAINT IF EXISTS unique_event_user;
ALTER TABLE event_invitations DROP CONSTRAINT IF EXISTS event_invitations_pkey_event_user;

-- Step 3: Ensure occurrence_date column exists
ALTER TABLE event_invitations
ADD COLUMN IF NOT EXISTS occurrence_date DATE;

-- Step 4: Backfill occurrence_date for any rows that still have NULL
UPDATE event_invitations ei
SET occurrence_date = e.start_date
FROM events e
WHERE ei.event_id = e.id
AND ei.occurrence_date IS NULL;

-- Step 5: Ensure the correct unique constraint exists
ALTER TABLE event_invitations
DROP CONSTRAINT IF EXISTS unique_event_user_occurrence;

ALTER TABLE event_invitations
ADD CONSTRAINT unique_event_user_occurrence
UNIQUE (event_id, user_id, occurrence_date);

-- Step 6: Create index for efficient per-occurrence queries
CREATE INDEX IF NOT EXISTS idx_event_invitations_occurrence_date
ON event_invitations(event_id, occurrence_date);
