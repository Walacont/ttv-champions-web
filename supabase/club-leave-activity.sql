-- Add club_leave to the activity_events event_type constraint
-- This enables tracking when players leave a club (either by request or being kicked)

-- First, drop the existing constraint
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS valid_event_type;

-- Add new constraint including 'club_leave'
ALTER TABLE activity_events ADD CONSTRAINT valid_event_type
    CHECK (event_type IN ('club_join', 'club_leave', 'rank_up', 'milestone', 'achievement'));

-- ============================================
-- TRIGGER: Track club leaves
-- ============================================

-- Update the club join/leave trigger function to handle both cases
CREATE OR REPLACE FUNCTION create_club_join_event()
RETURNS TRIGGER AS $$
DECLARE
    v_club_name TEXT;
    v_rank_name TEXT;
    v_old_club_name TEXT;
BEGIN
    -- Handle CLUB JOIN: club_id changed from NULL to a value, or changed to a different club
    IF (OLD.club_id IS DISTINCT FROM NEW.club_id) AND NEW.club_id IS NOT NULL THEN
        -- Get club name
        SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

        -- Get current rank name
        SELECT name INTO v_rank_name FROM ranks WHERE id = NEW.rank_id;

        -- Insert club join activity event
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NEW.club_id,
            'club_join',
            jsonb_build_object(
                'club_name', COALESCE(v_club_name, 'Unbekannt'),
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url,
                'rank_name', COALESCE(v_rank_name, 'Rekrut')
            )
        );
    END IF;

    -- Handle CLUB LEAVE: club_id changed from a value to NULL
    IF OLD.club_id IS NOT NULL AND NEW.club_id IS NULL THEN
        -- Get old club name for the event
        SELECT name INTO v_old_club_name FROM clubs WHERE id = OLD.club_id;

        -- Insert club leave activity event
        -- Note: We use OLD.club_id so the event is visible to the old club members
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            OLD.club_id,  -- Use the OLD club_id so event shows for the club that was left
            'club_leave',
            jsonb_build_object(
                'club_name', COALESCE(v_old_club_name, 'Unbekannt'),
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The trigger already exists from activity-events.sql
-- It will now use the updated function that handles both joins and leaves
