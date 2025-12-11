-- Activity Events Table
-- Stores non-match activities like club joins, rank ups, achievements, etc.
-- This complements the existing match-based activity feed

CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'club_join', 'rank_up', 'milestone', etc.
    event_data JSONB DEFAULT '{}', -- Flexible storage for event-specific data
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes for performance
    CONSTRAINT valid_event_type CHECK (event_type IN ('club_join', 'rank_up', 'milestone', 'achievement'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_club_id ON activity_events(club_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(event_type);

-- Enable RLS
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- Policies: Users can read events from their club or from users they follow
CREATE POLICY "Users can view activity events from their club"
    ON activity_events FOR SELECT
    USING (
        club_id IN (
            SELECT club_id FROM profiles WHERE id = auth.uid()
        )
        OR user_id = auth.uid()
        OR user_id IN (
            SELECT addressee_id FROM friendships
            WHERE requester_id = auth.uid() AND status = 'accepted'
        )
    );

-- System can insert events (through triggers)
CREATE POLICY "System can insert activity events"
    ON activity_events FOR INSERT
    WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;

-- ============================================
-- TRIGGER: Track club joins
-- ============================================

-- Function to create club join events
CREATE OR REPLACE FUNCTION create_club_join_event()
RETURNS TRIGGER AS $$
DECLARE
    v_club_name TEXT;
    v_rank_name TEXT;
BEGIN
    -- Only trigger if club_id actually changed from NULL to a value, or changed to a different club
    IF (OLD.club_id IS DISTINCT FROM NEW.club_id) AND NEW.club_id IS NOT NULL THEN
        -- Get club name
        SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

        -- Get current rank name
        SELECT name INTO v_rank_name FROM ranks WHERE id = NEW.rank_id;

        -- Insert activity event
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_club_join_event ON profiles;

-- Create trigger
CREATE TRIGGER trigger_club_join_event
    AFTER UPDATE OF club_id ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_club_join_event();

-- ============================================
-- TRIGGER: Track rank ups
-- ============================================

-- Function to create rank up events
CREATE OR REPLACE FUNCTION create_rank_up_event()
RETURNS TRIGGER AS $$
DECLARE
    v_old_rank_order INT;
    v_new_rank_order INT;
    v_new_rank_name TEXT;
    v_club_id UUID;
BEGIN
    -- Only trigger if rank actually increased (not decreased or stayed same)
    IF OLD.rank_id IS DISTINCT FROM NEW.rank_id THEN
        -- Get rank orders to determine if it's a rank UP (not down)
        SELECT "order" INTO v_old_rank_order FROM ranks WHERE id = OLD.rank_id;
        SELECT "order", name INTO v_new_rank_order, v_new_rank_name FROM ranks WHERE id = NEW.rank_id;

        -- Only create event if rank increased
        IF v_new_rank_order > COALESCE(v_old_rank_order, 0) THEN
            -- Get user's club_id
            v_club_id := NEW.club_id;

            -- Insert activity event
            INSERT INTO activity_events (user_id, club_id, event_type, event_data)
            VALUES (
                NEW.id,
                v_club_id,
                'rank_up',
                jsonb_build_object(
                    'rank_name', COALESCE(v_new_rank_name, 'Unbekannt'),
                    'old_rank_order', COALESCE(v_old_rank_order, 0),
                    'new_rank_order', v_new_rank_order,
                    'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                    'avatar_url', NEW.avatar_url,
                    'elo_rating', NEW.elo_rating,
                    'xp', NEW.xp
                )
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_rank_up_event ON profiles;

-- Create trigger
CREATE TRIGGER trigger_rank_up_event
    AFTER UPDATE OF rank_id ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_rank_up_event();

-- ============================================
-- Helper function to get activity events
-- ============================================

-- Function to fetch activity events with user filtering
CREATE OR REPLACE FUNCTION get_activity_events(
    p_user_ids UUID[],
    p_limit INT DEFAULT 10,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    club_id UUID,
    event_type TEXT,
    event_data JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ae.id,
        ae.user_id,
        ae.club_id,
        ae.event_type,
        ae.event_data,
        ae.created_at
    FROM activity_events ae
    WHERE ae.user_id = ANY(p_user_ids)
    ORDER BY ae.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
