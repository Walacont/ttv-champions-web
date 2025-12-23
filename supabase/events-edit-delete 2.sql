-- Events Edit/Delete Feature Migration
-- Adds excluded_dates column for recurring events to skip specific dates

-- Add excluded_dates column to events table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name = 'excluded_dates'
    ) THEN
        ALTER TABLE events ADD COLUMN excluded_dates TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added excluded_dates column to events table';
    ELSE
        RAISE NOTICE 'excluded_dates column already exists';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'events'
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE events ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to events table';
    ELSE
        RAISE NOTICE 'updated_at column already exists';
    END IF;
END $$;

-- Create index for faster recurring event queries
CREATE INDEX IF NOT EXISTS idx_events_repeat_type ON events(repeat_type) WHERE repeat_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_club_date ON events(club_id, start_date);

-- Enable realtime for events table changes (for live updates)
DO $$
BEGIN
    -- Check if events is already in the publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE events;
        RAISE NOTICE 'Added events table to realtime publication';
    ELSE
        RAISE NOTICE 'events table already in realtime publication';
    END IF;
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Could not add events to realtime publication: %', SQLERRM;
END $$;
