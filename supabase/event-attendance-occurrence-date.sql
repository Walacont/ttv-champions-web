-- Event Attendance Occurrence Date Migration
-- Adds occurrence_date column to support separate attendance records for recurring events
-- This fixes the bug where attendance for one occurrence affected all occurrences

DO $$
BEGIN
    -- Check if event_attendance table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'event_attendance') THEN
        -- Add occurrence_date column if it doesn't exist
        IF NOT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'event_attendance'
            AND column_name = 'occurrence_date'
        ) THEN
            ALTER TABLE event_attendance ADD COLUMN occurrence_date DATE;
            RAISE NOTICE 'Added occurrence_date column to event_attendance table';
        ELSE
            RAISE NOTICE 'occurrence_date column already exists';
        END IF;

        -- Drop the old unique constraint on event_id only
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'event_attendance_event_id_key'
            AND conrelid = 'event_attendance'::regclass
        ) THEN
            ALTER TABLE event_attendance DROP CONSTRAINT event_attendance_event_id_key;
            RAISE NOTICE 'Dropped old unique constraint on event_id';
        END IF;

        -- Create new composite unique constraint on (event_id, occurrence_date)
        -- This allows multiple attendance records per event (one per occurrence date)
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'event_attendance_event_id_occurrence_date_key'
            AND conrelid = 'event_attendance'::regclass
        ) THEN
            -- Use a unique index instead of constraint to handle NULL occurrence_date
            CREATE UNIQUE INDEX IF NOT EXISTS idx_event_attendance_event_occurrence
                ON event_attendance (event_id, COALESCE(occurrence_date, '1900-01-01'::date));
            RAISE NOTICE 'Created composite unique index on (event_id, occurrence_date)';
        ELSE
            RAISE NOTICE 'Composite unique constraint already exists';
        END IF;

        -- Create index for faster queries by occurrence_date
        CREATE INDEX IF NOT EXISTS idx_event_attendance_occurrence_date
            ON event_attendance(occurrence_date);
        RAISE NOTICE 'Created index on occurrence_date';

    ELSE
        RAISE NOTICE 'event_attendance table does not exist, skipping migration';
    END IF;
END $$;

-- Update existing records: set occurrence_date from event start_date for single events
UPDATE event_attendance ea
SET occurrence_date = e.start_date
FROM events e
WHERE ea.event_id = e.id
AND ea.occurrence_date IS NULL
AND (e.event_type IS NULL OR e.event_type = 'single');

COMMENT ON COLUMN event_attendance.occurrence_date IS 'Date of the specific occurrence for recurring events. NULL for single events created before this migration.';
