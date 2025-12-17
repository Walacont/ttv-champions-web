-- Doubles Ranking Change Events
-- Creates activity events for:
-- 1. Club Top 10 doubles changes (only visible to club members)
-- 2. Global doubles ranking changes (only visible to the player + followers, NOT in club)
--
-- Tie-breaking: Doubles Elo DESC, then doubles_matches_played DESC

-- ============================================
-- UPDATE CONSTRAINT: Add doubles event types
-- ============================================

-- Drop and recreate the constraint to include doubles event types
ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE activity_events ADD CONSTRAINT valid_event_type
    CHECK (event_type IN (
        'club_join', 'club_leave', 'rank_up', 'milestone', 'achievement',
        'club_ranking_change', 'global_ranking_change',
        'club_doubles_ranking_change', 'global_doubles_ranking_change'
    ));

-- ============================================
-- HELPER FUNCTION: Get club doubles ranking position
-- ============================================

CREATE OR REPLACE FUNCTION get_club_doubles_ranking_position(p_player_id UUID, p_club_id UUID, p_doubles_elo INT)
RETURNS INT AS $$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE club_id = p_club_id
      AND role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      AND (
          COALESCE(doubles_elo_rating, 800) > p_doubles_elo
          OR (COALESCE(doubles_elo_rating, 800) = p_doubles_elo AND COALESCE(doubles_matches_played, 0) > (SELECT COALESCE(doubles_matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- HELPER FUNCTION: Get global doubles ranking position
-- ============================================

CREATE OR REPLACE FUNCTION get_global_doubles_ranking_position(p_player_id UUID, p_doubles_elo INT)
RETURNS INT AS $$
DECLARE
    v_position INT;
BEGIN
    SELECT COUNT(*) + 1 INTO v_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != p_player_id
      AND (
          COALESCE(doubles_elo_rating, 800) > p_doubles_elo
          OR (COALESCE(doubles_elo_rating, 800) = p_doubles_elo AND COALESCE(doubles_matches_played, 0) > (SELECT COALESCE(doubles_matches_played, 0) FROM profiles WHERE id = p_player_id))
      );

    RETURN v_position;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- TRIGGER FUNCTION: Detect doubles ranking changes
-- ============================================

CREATE OR REPLACE FUNCTION create_doubles_ranking_change_events()
RETURNS TRIGGER AS $$
DECLARE
    v_old_club_position INT;
    v_new_club_position INT;
    v_old_global_position INT;
    v_new_global_position INT;
    v_club_player_count INT;
    v_position_medal TEXT;
    v_old_holder_id UUID;
    v_old_holder_name TEXT;
    v_old_holder_elo INT;
    v_direction TEXT;
    v_user_exists BOOLEAN;
BEGIN
    -- Only process if Doubles Elo actually changed
    IF OLD.doubles_elo_rating IS NOT DISTINCT FROM NEW.doubles_elo_rating THEN
        RETURN NEW;
    END IF;

    -- Skip offline players (they don't exist in auth.users)
    IF NEW.is_offline = true THEN
        RETURN NEW;
    END IF;

    -- Check if user exists in auth.users (foreign key requirement)
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = NEW.id) INTO v_user_exists;
    IF NOT v_user_exists THEN
        RETURN NEW;
    END IF;

    -- ============================================
    -- CLUB TOP 10 DOUBLES RANKING CHANGE
    -- ============================================

    IF NEW.club_id IS NOT NULL THEN
        -- Count players in club (minimum 3 needed for ranking to matter)
        SELECT COUNT(*) INTO v_club_player_count
        FROM profiles
        WHERE club_id = NEW.club_id
          AND role IN ('player', 'coach', 'head_coach');

        IF v_club_player_count >= 3 THEN
            -- Calculate old position (with old Doubles Elo)
            SELECT COUNT(*) + 1 INTO v_old_club_position
            FROM profiles
            WHERE club_id = NEW.club_id
              AND role IN ('player', 'coach', 'head_coach')
              AND id != NEW.id
              AND (
                  COALESCE(doubles_elo_rating, 800) > COALESCE(OLD.doubles_elo_rating, 800)
                  OR (COALESCE(doubles_elo_rating, 800) = COALESCE(OLD.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
              );

            -- Calculate new position (with new Doubles Elo)
            SELECT COUNT(*) + 1 INTO v_new_club_position
            FROM profiles
            WHERE club_id = NEW.club_id
              AND role IN ('player', 'coach', 'head_coach')
              AND id != NEW.id
              AND (
                  COALESCE(doubles_elo_rating, 800) > COALESCE(NEW.doubles_elo_rating, 800)
                  OR (COALESCE(doubles_elo_rating, 800) = COALESCE(NEW.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
              );

            -- Only create event for TOP 10 changes
            IF (v_old_club_position > 10 AND v_new_club_position <= 10) OR
               (v_old_club_position <= 10 AND v_new_club_position > 10) OR
               (v_old_club_position <= 10 AND v_new_club_position <= 10 AND v_old_club_position != v_new_club_position) THEN

                -- Determine direction
                IF v_new_club_position < v_old_club_position THEN
                    v_direction := 'up';
                ELSE
                    v_direction := 'down';
                END IF;

                -- Get medal emoji for top 3
                v_position_medal := CASE v_new_club_position
                    WHEN 1 THEN '🥇'
                    WHEN 2 THEN '🥈'
                    WHEN 3 THEN '🥉'
                    ELSE ''
                END;

                -- Get the previous holder of the new position (if moving up)
                IF v_direction = 'up' AND v_new_club_position <= 10 THEN
                    WITH ranked_before AS (
                        SELECT
                            p.id,
                            COALESCE(p.display_name, p.first_name, 'Spieler') as display_name,
                            COALESCE(p.doubles_elo_rating, 800) as doubles_elo_rating,
                            ROW_NUMBER() OVER (
                                ORDER BY
                                    CASE WHEN p.id = NEW.id THEN COALESCE(OLD.doubles_elo_rating, 800) ELSE COALESCE(p.doubles_elo_rating, 800) END DESC,
                                    COALESCE(p.doubles_matches_played, 0) DESC
                            ) as old_position
                        FROM profiles p
                        WHERE p.club_id = NEW.club_id
                          AND p.role IN ('player', 'coach', 'head_coach')
                    )
                    SELECT id, display_name, doubles_elo_rating
                    INTO v_old_holder_id, v_old_holder_name, v_old_holder_elo
                    FROM ranked_before
                    WHERE old_position = v_new_club_position AND id != NEW.id;
                END IF;

                -- Create the club doubles ranking change event
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.id,
                    NEW.club_id,
                    'club_doubles_ranking_change',
                    jsonb_build_object(
                        'new_position', v_new_club_position,
                        'old_position', v_old_club_position,
                        'position_medal', v_position_medal,
                        'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                        'avatar_url', NEW.avatar_url,
                        'elo_rating', NEW.doubles_elo_rating,
                        'previous_holder_id', v_old_holder_id,
                        'previous_holder_name', v_old_holder_name,
                        'previous_holder_elo', v_old_holder_elo,
                        'direction', v_direction,
                        'ranking_type', 'club_doubles'
                    )
                );
            END IF;
        END IF;
    END IF;

    -- ============================================
    -- GLOBAL DOUBLES RANKING CHANGE (for followers)
    -- ============================================

    -- Calculate old global position (with old Doubles Elo)
    SELECT COUNT(*) + 1 INTO v_old_global_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != NEW.id
      AND (
          COALESCE(doubles_elo_rating, 800) > COALESCE(OLD.doubles_elo_rating, 800)
          OR (COALESCE(doubles_elo_rating, 800) = COALESCE(OLD.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
      );

    -- Calculate new global position (with new Doubles Elo)
    SELECT COUNT(*) + 1 INTO v_new_global_position
    FROM profiles
    WHERE role IN ('player', 'coach', 'head_coach')
      AND id != NEW.id
      AND (
          COALESCE(doubles_elo_rating, 800) > COALESCE(NEW.doubles_elo_rating, 800)
          OR (COALESCE(doubles_elo_rating, 800) = COALESCE(NEW.doubles_elo_rating, 800) AND COALESCE(doubles_matches_played, 0) > COALESCE(NEW.doubles_matches_played, 0))
      );

    -- Create event for ANY global position change
    IF v_old_global_position != v_new_global_position THEN
        -- Determine direction
        IF v_new_global_position < v_old_global_position THEN
            v_direction := 'up';
        ELSE
            v_direction := 'down';
        END IF;

        -- Get medal emoji for top 3
        v_position_medal := CASE v_new_global_position
            WHEN 1 THEN '🥇'
            WHEN 2 THEN '🥈'
            WHEN 3 THEN '🥉'
            ELSE ''
        END;

        -- Create the global doubles ranking change event (NO club_id so it's not club-visible)
        INSERT INTO activity_events (user_id, club_id, event_type, event_data)
        VALUES (
            NEW.id,
            NULL,  -- Important: NULL club_id means it won't show in club feed
            'global_doubles_ranking_change',
            jsonb_build_object(
                'new_position', v_new_global_position,
                'old_position', v_old_global_position,
                'position_medal', v_position_medal,
                'display_name', COALESCE(NEW.display_name, NEW.first_name, 'Spieler'),
                'avatar_url', NEW.avatar_url,
                'elo_rating', NEW.doubles_elo_rating,
                'direction', v_direction,
                'ranking_type', 'global_doubles',
                'positions_changed', ABS(v_new_global_position - v_old_global_position)
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_doubles_ranking_change_events ON profiles;

-- Create new trigger that fires on doubles_elo_rating changes
CREATE TRIGGER trigger_doubles_ranking_change_events
    AFTER UPDATE OF doubles_elo_rating ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_doubles_ranking_change_events();

-- ============================================
-- UPDATE RLS POLICY to include doubles events
-- ============================================

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
                -- club_join, club_leave, club_ranking_change, club_doubles_ranking_change: Only visible to club members
                (
                    activity_events.event_type IN ('club_join', 'club_leave', 'club_ranking_change', 'club_doubles_ranking_change')
                    AND activity_events.club_id IS NOT NULL
                    AND activity_events.club_id = (SELECT club_id FROM profiles WHERE id = auth.uid())
                )
                OR
                -- global_ranking_change, global_doubles_ranking_change: Only visible to followers (NOT club members)
                (
                    activity_events.event_type IN ('global_ranking_change', 'global_doubles_ranking_change')
                    AND EXISTS (
                        SELECT 1 FROM friendships
                        WHERE requester_id = auth.uid()
                        AND addressee_id = activity_events.user_id
                        AND status = 'accepted'
                    )
                )
                OR
                -- rank_up, milestone, achievement: Visible based on privacy settings
                (
                    activity_events.event_type IN ('rank_up', 'milestone', 'achievement')
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

-- ============================================
-- Verify
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Doubles ranking change events trigger created successfully';
END $$;
