-- Podium Change Events
-- Creates activity events when players move into or out of top 3 positions in club Elo ranking
--
-- This migration adds:
-- 1. 'podium_change' and 'club_leave' to valid event types
-- 2. A trigger that detects podium changes after Elo updates
-- 3. Proper tie-breaking: Elo DESC, then matches_played DESC

-- ============================================
-- UPDATE CONSTRAINT: Add podium_change event type
-- ============================================

-- Drop and recreate the constraint to include new event types
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE activity_events ADD CONSTRAINT valid_event_type
    CHECK (event_type IN ('club_join', 'club_leave', 'rank_up', 'milestone', 'achievement', 'podium_change'));

-- ============================================
-- HELPER FUNCTION: Get club podium positions
-- ============================================

-- Returns the top 3 players in a club by Elo (with tie-breaking)
CREATE OR REPLACE FUNCTION get_club_podium(p_club_id UUID)
RETURNS TABLE (
    position INT,
    player_id UUID,
    display_name TEXT,
    avatar_url TEXT,
    elo_rating INT,
    matches_played INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ROW_NUMBER() OVER (ORDER BY COALESCE(p.elo_rating, 800) DESC, COALESCE(p.matches_played, 0) DESC)::INT as position,
        p.id as player_id,
        COALESCE(p.display_name, p.first_name, 'Spieler') as display_name,
        p.avatar_url,
        COALESCE(p.elo_rating, 800)::INT as elo_rating,
        COALESCE(p.matches_played, 0)::INT as matches_played
    FROM profiles p
    WHERE p.club_id = p_club_id
      AND p.role IN ('player', 'coach', 'head_coach')
    ORDER BY COALESCE(p.elo_rating, 800) DESC, COALESCE(p.matches_played, 0) DESC
    LIMIT 3;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- TRIGGER FUNCTION: Detect podium changes
-- ============================================

CREATE OR REPLACE FUNCTION create_podium_change_event()
RETURNS TRIGGER AS $$
DECLARE
    v_old_position INT;
    v_new_position INT;
    v_old_holder_id UUID;
    v_old_holder_name TEXT;
    v_old_holder_elo INT;
    v_club_player_count INT;
    v_position_medal TEXT;
    rec RECORD;
BEGIN
    -- Only process if Elo actually changed and user has a club
    IF NEW.club_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF OLD.elo_rating IS NOT DISTINCT FROM NEW.elo_rating THEN
        RETURN NEW;
    END IF;

    -- Count players in club (minimum 3 needed for podium to matter)
    SELECT COUNT(*) INTO v_club_player_count
    FROM profiles
    WHERE club_id = NEW.club_id
      AND role IN ('player', 'coach', 'head_coach');

    IF v_club_player_count < 3 THEN
        RETURN NEW;
    END IF;

    -- Get player's old position (before update)
    -- We need to calculate what position they would have had with old Elo
    WITH ranked_players AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN id = NEW.id THEN COALESCE(OLD.elo_rating, 800) ELSE COALESCE(elo_rating, 800) END DESC,
                    COALESCE(matches_played, 0) DESC
            ) as position
        FROM profiles
        WHERE club_id = NEW.club_id
          AND role IN ('player', 'coach', 'head_coach')
    )
    SELECT position INTO v_old_position FROM ranked_players WHERE id = NEW.id;

    -- Get player's new position (after update)
    WITH ranked_players AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                ORDER BY COALESCE(elo_rating, 800) DESC, COALESCE(matches_played, 0) DESC
            ) as position
        FROM profiles
        WHERE club_id = NEW.club_id
          AND role IN ('player', 'coach', 'head_coach')
    )
    SELECT position INTO v_new_position FROM ranked_players WHERE id = NEW.id;

    -- Only care about podium positions (1, 2, 3)
    -- Create event if:
    -- 1. Player moved INTO podium (old > 3, new <= 3)
    -- 2. Player moved OUT of podium (old <= 3, new > 3)
    -- 3. Player changed position WITHIN podium (old <= 3, new <= 3, different)

    IF (v_old_position > 3 AND v_new_position <= 3) OR
       (v_old_position <= 3 AND v_new_position > 3) OR
       (v_old_position <= 3 AND v_new_position <= 3 AND v_old_position != v_new_position) THEN

        -- Get medal emoji for position
        v_position_medal := CASE v_new_position
            WHEN 1 THEN '🥇'
            WHEN 2 THEN '🥈'
            WHEN 3 THEN '🥉'
            ELSE ''
        END;

        -- Get the previous holder of the new position (if moving up within podium)
        IF v_new_position <= 3 AND v_new_position < v_old_position THEN
            WITH ranked_before AS (
                SELECT
                    p.id,
                    COALESCE(p.display_name, p.first_name, 'Spieler') as display_name,
                    COALESCE(p.elo_rating, 800) as elo_rating,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            CASE WHEN p.id = NEW.id THEN COALESCE(OLD.elo_rating, 800) ELSE COALESCE(p.elo_rating, 800) END DESC,
                            COALESCE(p.matches_played, 0) DESC
                    ) as old_position
                FROM profiles p
                WHERE p.club_id = NEW.club_id
                  AND p.role IN ('player', 'coach', 'head_coach')
            )
            SELECT id, display_name, elo_rating
            INTO v_old_holder_id, v_old_holder_name, v_old_holder_elo
            FROM ranked_before
            WHERE old_position = v_new_position AND id != NEW.id;
        END IF;

        -- Create the activity event
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NEW.club_id,
            'podium_change',
            jsonb_build_object(
                'new_position', v_new_position,
                'old_position', v_old_position,
                'position_medal', v_position_medal,
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url,
                'elo_rating', NEW.elo_rating,
                'previous_holder_id', v_old_holder_id,
                'previous_holder_name', v_old_holder_name,
                'previous_holder_elo', v_old_holder_elo,
                'direction', CASE
                    WHEN v_new_position < v_old_position THEN 'up'
                    WHEN v_new_position > v_old_position THEN 'down'
                    ELSE 'same'
                END
            )
        );

        -- If someone moved up, also create an event for the person who got displaced (if within podium)
        IF v_old_holder_id IS NOT NULL AND v_new_position <= 3 THEN
            -- Get displaced player's new position
            WITH ranked_after AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        ORDER BY COALESCE(elo_rating, 800) DESC, COALESCE(matches_played, 0) DESC
                    ) as new_pos
                FROM profiles
                WHERE club_id = NEW.club_id
                  AND role IN ('player', 'coach', 'head_coach')
            )
            SELECT new_pos INTO v_old_position FROM ranked_after WHERE id = v_old_holder_id;

            -- Only create displacement event if they're still on podium (just moved down a spot)
            IF v_old_position <= 3 THEN
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    v_old_holder_id,
                    NEW.club_id,
                    'podium_change',
                    jsonb_build_object(
                        'new_position', v_old_position,
                        'old_position', v_new_position,
                        'position_medal', CASE v_old_position
                            WHEN 1 THEN '🥇'
                            WHEN 2 THEN '🥈'
                            WHEN 3 THEN '🥉'
                            ELSE ''
                        END,
                        'display_name', v_old_holder_name,
                        'avatar_url', (SELECT avatar_url FROM profiles WHERE id = v_old_holder_id),
                        'elo_rating', v_old_holder_elo,
                        'displaced_by_id', NEW.id,
                        'displaced_by_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                        'direction', 'down'
                    )
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_podium_change_event ON profiles;

-- Create trigger - fires when elo_rating changes
CREATE TRIGGER trigger_podium_change_event
    AFTER UPDATE OF elo_rating ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_podium_change_event();

-- ============================================
-- UPDATE RLS POLICY: Include podium_change
-- ============================================

-- Drop and recreate the select policy to include podium_change events
DROP POLICY IF EXISTS "Users can view activity events based on type and privacy" ON activity_events;

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
                -- club_join and podium_change events: Only visible to club members
                (
                    activity_events.event_type IN ('club_join', 'club_leave', 'podium_change')
                    AND activity_events.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                )
                OR
                -- rank_up, milestone, achievement events: Visible based on privacy settings
                (
                    activity_events.event_type IN ('rank_up', 'milestone', 'achievement')
                    AND (
                        -- If searchable = 'global': visible to club members and followers
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
            )
        )
    );
