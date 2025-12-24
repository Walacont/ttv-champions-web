-- Event Attendance Points Migration
-- Adds points_awarded_to column to track which players have received points
-- This prevents duplicate point awards when attendance is updated

-- Add the points_awarded_to column if it doesn't exist
DO $$
BEGIN
    -- Check if event_attendance table exists
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'event_attendance') THEN
        -- Add points_awarded_to column if it doesn't exist
        IF NOT EXISTS (
            SELECT FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = 'event_attendance'
            AND column_name = 'points_awarded_to'
        ) THEN
            ALTER TABLE event_attendance ADD COLUMN points_awarded_to TEXT[] DEFAULT '{}';
            RAISE NOTICE 'Added points_awarded_to column to event_attendance table';
        ELSE
            RAISE NOTICE 'points_awarded_to column already exists';
        END IF;
    ELSE
        -- Create the event_attendance table if it doesn't exist
        CREATE TABLE event_attendance (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
            present_user_ids TEXT[] DEFAULT '{}',
            completed_exercises JSONB DEFAULT '[]',
            points_awarded_to TEXT[] DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(event_id)
        );

        -- Enable RLS
        ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;

        -- Create policies
        CREATE POLICY "Coaches can manage event attendance" ON event_attendance
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM events e
                    JOIN profiles p ON p.club_id = e.club_id
                    WHERE e.id = event_attendance.event_id
                    AND p.id = auth.uid()
                    AND p.role IN ('coach', 'head_coach', 'admin')
                )
            );

        CREATE POLICY "Players can view their event attendance" ON event_attendance
            FOR SELECT
            USING (
                auth.uid()::text = ANY(present_user_ids)
                OR EXISTS (
                    SELECT 1 FROM events e
                    JOIN profiles p ON p.club_id = e.club_id
                    WHERE e.id = event_attendance.event_id
                    AND p.id = auth.uid()
                )
            );

        RAISE NOTICE 'Created event_attendance table with points_awarded_to column';
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_event_attendance_event_id ON event_attendance(event_id);
