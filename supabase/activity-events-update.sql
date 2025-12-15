-- Activity Events - UPDATE ONLY
-- Updates triggers and functions for existing activity_events table
-- Use this if the table already exists

-- ============================================
-- STEP 1: Drop old triggers and functions
-- ============================================

DROP TRIGGER IF EXISTS trigger_club_join_event ON profiles;
DROP TRIGGER IF EXISTS trigger_rank_up_event ON profiles;

DROP FUNCTION IF EXISTS create_club_join_event();
DROP FUNCTION IF EXISTS create_rank_up_event();
DROP FUNCTION IF EXISTS calculate_rank(INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_rank_order(TEXT);

-- ============================================
-- STEP 2: Update/create policies (safe operation)
-- ============================================

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view activity events based on type and privacy" ON activity_events;
DROP POLICY IF EXISTS "Users can view activity events from their club" ON activity_events;
DROP POLICY IF EXISTS "System can insert activity events" ON activity_events;

-- Create new granular policy
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
-- STEP 4: Create trigger functions
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
-- STEP 5: Create triggers
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
-- OPTIONAL: Remove from realtime (if desired)
-- ============================================

-- Uncomment this line if you want to remove realtime updates for activity_events:
-- ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS activity_events;

-- Note: Activity feed uses pull-to-refresh on mobile, realtime is not needed.
-- Users manually refresh by pulling down on the feed.

-- ============================================
-- Done! Triggers updated successfully.
-- ============================================
