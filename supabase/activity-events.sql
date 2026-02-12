-- Activity Events Table
-- Stores non-match activities like club joins, rank ups, achievements, etc.
-- This complements the existing match-based activity feed
--
-- IMPORTANT: Ranks are NOT stored in the database!
-- Ranks are calculated dynamically from: elo_rating + xp
-- The calculate_rank() function mirrors the JavaScript logic in ranks.js
--
-- VISIBILITY RULES:
-- ==================
-- club_join events:
--   - Only visible to club members
--   - Respects privacy: if user has searchable='none', no one sees the event
--
-- rank_up events:
--   - Visibility depends on privacy_settings.searchable:
--     * 'global' (default): visible to club members AND followers
--     * 'club_only': only visible to club members
--     * 'friends_only': only visible to followers
--     * 'none': invisible to everyone (except the user themselves)
--
-- milestone/achievement events:
--   - Same visibility rules as rank_up events

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

-- Policies: Granular visibility based on event type and privacy settings
CREATE POLICY "Users can view activity events based on type and privacy"
    ON activity_events FOR SELECT
    USING (
        -- User can always see their own events
        user_id = auth.uid()
        OR
        -- Check privacy settings and event type
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = activity_events.user_id
            -- User must not be invisible (searchable = 'none')
            AND COALESCE(p.privacy_settings->>'searchable', 'global') != 'none'
            AND (
                -- club_join events: Only visible to club members
                (
                    activity_events.event_type = 'club_join'
                    AND activity_events.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                )
                OR
                -- rank_up events: Visible based on privacy settings
                (
                    activity_events.event_type = 'rank_up'
                    AND (
                        -- If searchable = 'global': visible to club members and followers
                        (
                            COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
                            AND (
                                -- Club members can see it
                                p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                                OR
                                -- Followers can see it
                                EXISTS (
                                    SELECT 1 FROM friendships
                                    WHERE requester_id = auth.uid()
                                    AND addressee_id = activity_events.user_id
                                    AND status = 'accepted'
                                )
                            )
                        )
                        OR
                        -- If searchable = 'club_only': only club members can see it
                        (
                            p.privacy_settings->>'searchable' = 'club_only'
                            AND p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                        )
                        OR
                        -- If searchable = 'friends_only': only followers can see it
                        (
                            p.privacy_settings->>'searchable' = 'friends_only'
                            AND EXISTS (
                                SELECT 1 FROM friendships
                                WHERE requester_id = auth.uid()
                                AND addressee_id = activity_events.user_id
                                AND status = 'accepted'
                            )
                        )
                    )
                )
                OR
                -- milestone and achievement events: same as rank_up
                (
                    activity_events.event_type IN ('milestone', 'achievement')
                    AND (
                        (
                            COALESCE(p.privacy_settings->>'searchable', 'global') = 'global'
                            AND (
                                p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                                OR
                                EXISTS (
                                    SELECT 1 FROM friendships
                                    WHERE requester_id = auth.uid()
                                    AND addressee_id = activity_events.user_id
                                    AND status = 'accepted'
                                )
                            )
                        )
                        OR
                        (
                            p.privacy_settings->>'searchable' = 'club_only'
                            AND p.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                        )
                        OR
                        (
                            p.privacy_settings->>'searchable' = 'friends_only'
                            AND EXISTS (
                                SELECT 1 FROM friendships
                                WHERE requester_id = auth.uid()
                                AND addressee_id = activity_events.user_id
                                AND status = 'accepted'
                            )
                        )
                    )
                )
            )
        )
    );

-- System can insert events (through triggers)
CREATE POLICY "System can insert activity events"
    ON activity_events FOR INSERT
    WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;

-- ============================================
-- HELPER FUNCTION: Calculate rank from stats
-- ============================================

-- SQL function to mirror the JavaScript calculateRank logic
CREATE OR REPLACE FUNCTION calculate_rank(p_elo INTEGER, p_xp INTEGER)
RETURNS TEXT AS $$
BEGIN
    -- Champion: 1600 Elo, 1800 XP
    IF p_elo >= 1600 AND p_xp >= 1800 THEN
        RETURN 'Champion';
    END IF;

    -- Platin: 1400 Elo, 1000 XP
    IF p_elo >= 1400 AND p_xp >= 1000 THEN
        RETURN 'Platin';
    END IF;

    -- Gold: 1200 Elo, 500 XP
    IF p_elo >= 1200 AND p_xp >= 500 THEN
        RETURN 'Gold';
    END IF;

    -- Silber: 1000 Elo, 200 XP
    IF p_elo >= 1000 AND p_xp >= 200 THEN
        RETURN 'Silber';
    END IF;

    -- Bronze: 850 Elo, 50 XP
    IF p_elo >= 850 AND p_xp >= 50 THEN
        RETURN 'Bronze';
    END IF;

    -- Rekrut (default)
    RETURN 'Rekrut';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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

        -- Calculate current rank
        v_rank_name := calculate_rank(
            COALESCE(NEW.elo_rating, 800),
            COALESCE(NEW.xp, 0)
        );

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
                'rank_name', v_rank_name
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

-- Helper function to get rank order (for comparison)
CREATE OR REPLACE FUNCTION get_rank_order(p_rank_name TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE p_rank_name
        WHEN 'Rekrut' THEN 0
        WHEN 'Bronze' THEN 1
        WHEN 'Silber' THEN 2
        WHEN 'Gold' THEN 3
        WHEN 'Platin' THEN 4
        WHEN 'Champion' THEN 5
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to create rank up events
CREATE OR REPLACE FUNCTION create_rank_up_event()
RETURNS TRIGGER AS $$
DECLARE
    v_old_rank TEXT;
    v_new_rank TEXT;
    v_old_rank_order INT;
    v_new_rank_order INT;
BEGIN
    -- Calculate old and new ranks from stats
    v_old_rank := calculate_rank(
        COALESCE(OLD.elo_rating, 800),
        COALESCE(OLD.xp, 0)
    );

    v_new_rank := calculate_rank(
        COALESCE(NEW.elo_rating, 800),
        COALESCE(NEW.xp, 0)
    );

    -- Only create event if rank actually increased
    IF v_old_rank != v_new_rank THEN
        v_old_rank_order := get_rank_order(v_old_rank);
        v_new_rank_order := get_rank_order(v_new_rank);

        -- Only create event if rank order increased (rank up, not down)
        IF v_new_rank_order > v_old_rank_order THEN
            -- Insert activity event
            INSERT INTO activity_events (user_id, club_id, event_type, event_data)
            VALUES (
                NEW.id,
                NEW.club_id,
                'rank_up',
                jsonb_build_object(
                    'rank_name', v_new_rank,
                    'old_rank_name', v_old_rank,
                    'old_rank_order', v_old_rank_order,
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

-- Create trigger - fires when elo_rating or xp changes
CREATE TRIGGER trigger_rank_up_event
    AFTER UPDATE OF elo_rating, xp ON profiles
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
