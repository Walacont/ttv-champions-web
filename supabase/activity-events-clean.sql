-- Activity Events - Clean Installation
-- This script safely removes any existing structures before creating new ones

-- ============================================
-- STEP 1: Clean up existing structures
-- ============================================

-- Drop existing triggers
DROP TRIGGER IF EXISTS trigger_club_join_event ON profiles;
DROP TRIGGER IF EXISTS trigger_rank_up_event ON profiles;

-- Drop existing functions
DROP FUNCTION IF EXISTS create_club_join_event();
DROP FUNCTION IF EXISTS create_rank_up_event();
DROP FUNCTION IF EXISTS calculate_rank(INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_rank_order(TEXT);
DROP FUNCTION IF EXISTS get_activity_events(UUID[], INT, INT);

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view activity events based on type and privacy" ON activity_events;
DROP POLICY IF EXISTS "Users can view activity events from their club" ON activity_events;
DROP POLICY IF EXISTS "System can insert activity events" ON activity_events;

-- Drop existing table (be careful - this deletes all data!)
-- DROP TABLE IF EXISTS activity_events CASCADE;

-- ============================================
-- STEP 2: Create fresh structures
-- ============================================

-- Create table (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    club_id UUID REFERENCES clubs(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT valid_event_type CHECK (event_type IN ('club_join', 'rank_up', 'milestone', 'achievement'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_club_id ON activity_events(club_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(event_type);

-- Enable RLS
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 3: Create helper functions
-- ============================================

-- Calculate rank from stats (mirrors JavaScript ranks.js)
CREATE OR REPLACE FUNCTION calculate_rank(p_elo INTEGER, p_xp INTEGER, p_grundlagen INTEGER)
RETURNS TEXT AS $$
BEGIN
    IF p_elo >= 1600 AND p_xp >= 1800 THEN RETURN 'Champion'; END IF;
    IF p_elo >= 1400 AND p_xp >= 1000 THEN RETURN 'Platin'; END IF;
    IF p_elo >= 1200 AND p_xp >= 500 THEN RETURN 'Gold'; END IF;
    IF p_elo >= 1000 AND p_xp >= 200 THEN RETURN 'Silber'; END IF;
    IF p_elo >= 850 AND p_xp >= 50 AND p_grundlagen >= 5 THEN RETURN 'Bronze'; END IF;
    RETURN 'Rekrut';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Get rank order for comparison
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

-- ============================================
-- STEP 4: Create RLS policies
-- ============================================

CREATE POLICY "Users can view activity events based on type and privacy"
    ON activity_events FOR SELECT
    USING (
        user_id = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = activity_events.user_id
            AND COALESCE(p.privacy_settings->>'searchable', 'global') != 'none'
            AND (
                (
                    activity_events.event_type = 'club_join'
                    AND activity_events.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                )
                OR
                (
                    activity_events.event_type = 'rank_up'
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
                OR
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

CREATE POLICY "System can insert activity events"
    ON activity_events FOR INSERT
    WITH CHECK (true);

-- ============================================
-- STEP 5: Create trigger functions
-- ============================================

-- Trigger function for club joins
CREATE OR REPLACE FUNCTION create_club_join_event()
RETURNS TRIGGER AS $$
DECLARE
    v_club_name TEXT;
    v_rank_name TEXT;
BEGIN
    IF (OLD.club_id IS DISTINCT FROM NEW.club_id) AND NEW.club_id IS NOT NULL THEN
        SELECT name INTO v_club_name FROM clubs WHERE id = NEW.club_id;

        v_rank_name := calculate_rank(
            COALESCE(NEW.elo_rating, 800),
            COALESCE(NEW.xp, 0),
            COALESCE(NEW.grundlagen_completed, 0)
        );

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

-- Trigger function for rank ups
CREATE OR REPLACE FUNCTION create_rank_up_event()
RETURNS TRIGGER AS $$
DECLARE
    v_old_rank TEXT;
    v_new_rank TEXT;
    v_old_rank_order INT;
    v_new_rank_order INT;
BEGIN
    v_old_rank := calculate_rank(
        COALESCE(OLD.elo_rating, 800),
        COALESCE(OLD.xp, 0),
        COALESCE(OLD.grundlagen_completed, 0)
    );

    v_new_rank := calculate_rank(
        COALESCE(NEW.elo_rating, 800),
        COALESCE(NEW.xp, 0),
        COALESCE(NEW.grundlagen_completed, 0)
    );

    IF v_old_rank != v_new_rank THEN
        v_old_rank_order := get_rank_order(v_old_rank);
        v_new_rank_order := get_rank_order(v_new_rank);

        IF v_new_rank_order > v_old_rank_order THEN
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

-- ============================================
-- STEP 6: Create triggers
-- ============================================

CREATE TRIGGER trigger_club_join_event
    AFTER UPDATE OF club_id ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_club_join_event();

CREATE TRIGGER trigger_rank_up_event
    AFTER UPDATE OF elo_rating, xp, grundlagen_completed ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_rank_up_event();

-- ============================================
-- STEP 7: Realtime (NOT needed for activity feed)
-- ============================================

-- Note: Realtime is NOT enabled for activity_events because:
-- - Activity feed uses pull-to-refresh on mobile (manual refresh)
-- - Saves database resources and performance
-- - Users pull down to refresh, standard mobile UX

-- If you want realtime updates anyway, uncomment this line:
-- ALTER PUBLICATION supabase_realtime ADD TABLE activity_events;

-- ============================================
-- Done! Activity events system is now active.
-- ============================================
