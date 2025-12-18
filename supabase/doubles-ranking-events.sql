-- Doubles Ranking Change Events (PAIRING-BASED)
-- Creates activity events for:
-- 1. Club Top 10 doubles pairing changes (only visible to club members)
-- 2. Global doubles pairing ranking changes (visible to both players + their followers)
--
-- Rankings are based on PAIRINGS, not individual players!
-- A player can have multiple rankings with different partners.

-- ============================================
-- UPDATE CONSTRAINT: Add doubles event types
-- ============================================

ALTER TABLE activity_events DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE activity_events ADD CONSTRAINT valid_event_type
    CHECK (event_type IN (
        'club_join', 'club_leave', 'rank_up', 'milestone', 'achievement',
        'club_ranking_change', 'global_ranking_change',
        'club_doubles_ranking_change', 'global_doubles_ranking_change'
    ));

-- ============================================
-- HELPER FUNCTION: Get club doubles PAIRING ranking position
-- ============================================

CREATE OR REPLACE FUNCTION get_club_doubles_pairing_position(p_pairing_id TEXT, p_club_id UUID, p_elo INT)
RETURNS INT AS $$
DECLARE
    v_position INT;
    v_matches_played INT;
BEGIN
    -- Get the pairing's matches_played for tie-breaking
    SELECT COALESCE(matches_played, 0) INTO v_matches_played
    FROM doubles_pairings WHERE id = p_pairing_id;

    -- Count pairings with higher Elo (or same Elo but more matches)
    SELECT COUNT(*) + 1 INTO v_position
    FROM doubles_pairings
    WHERE club_id = p_club_id
      AND id != p_pairing_id
      AND matches_played > 0  -- Only count pairings that have played
      AND (
          current_elo_rating > p_elo
          OR (current_elo_rating = p_elo AND matches_played > v_matches_played)
      );

    RETURN v_position;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- HELPER FUNCTION: Get global doubles PAIRING ranking position
-- ============================================

CREATE OR REPLACE FUNCTION get_global_doubles_pairing_position(p_pairing_id TEXT, p_elo INT)
RETURNS INT AS $$
DECLARE
    v_position INT;
    v_matches_played INT;
BEGIN
    -- Get the pairing's matches_played for tie-breaking
    SELECT COALESCE(matches_played, 0) INTO v_matches_played
    FROM doubles_pairings WHERE id = p_pairing_id;

    -- Count all pairings with higher Elo globally
    SELECT COUNT(*) + 1 INTO v_position
    FROM doubles_pairings
    WHERE id != p_pairing_id
      AND matches_played > 0  -- Only count pairings that have played
      AND (
          current_elo_rating > p_elo
          OR (current_elo_rating = p_elo AND matches_played > v_matches_played)
      );

    RETURN v_position;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- TRIGGER FUNCTION: Detect doubles PAIRING ranking changes
-- Fires on doubles_pairings table
-- ============================================

CREATE OR REPLACE FUNCTION create_doubles_pairing_ranking_events()
RETURNS TRIGGER AS $$
DECLARE
    v_old_club_position INT;
    v_new_club_position INT;
    v_old_global_position INT;
    v_new_global_position INT;
    v_club_pairing_count INT;
    v_global_pairing_count INT;
    v_position_medal TEXT;
    v_old_holder_id TEXT;
    v_old_holder_names TEXT;
    v_old_holder_elo INT;
    v_direction TEXT;
    v_player1_exists BOOLEAN;
    v_player2_exists BOOLEAN;
    v_player1_offline BOOLEAN;
    v_player2_offline BOOLEAN;
BEGIN
    -- Only process if Elo actually changed
    IF OLD.current_elo_rating IS NOT DISTINCT FROM NEW.current_elo_rating THEN
        RETURN NEW;
    END IF;

    -- Check if players exist in auth.users (skip offline players)
    SELECT is_offline INTO v_player1_offline FROM profiles WHERE id = NEW.player1_id;
    SELECT is_offline INTO v_player2_offline FROM profiles WHERE id = NEW.player2_id;

    IF v_player1_offline IS TRUE AND v_player2_offline IS TRUE THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = NEW.player1_id) INTO v_player1_exists;
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = NEW.player2_id) INTO v_player2_exists;

    -- At least one real user must exist
    IF NOT v_player1_exists AND NOT v_player2_exists THEN
        RETURN NEW;
    END IF;

    -- ============================================
    -- CLUB TOP 10 DOUBLES PAIRING RANKING
    -- ============================================

    IF NEW.club_id IS NOT NULL THEN
        -- Count pairings in club (minimum 3 needed)
        SELECT COUNT(*) INTO v_club_pairing_count
        FROM doubles_pairings
        WHERE club_id = NEW.club_id AND matches_played > 0;

        IF v_club_pairing_count >= 3 THEN
            -- Calculate old position
            v_old_club_position := get_club_doubles_pairing_position(NEW.id, NEW.club_id, COALESCE(OLD.current_elo_rating, 800));
            -- Calculate new position
            v_new_club_position := get_club_doubles_pairing_position(NEW.id, NEW.club_id, NEW.current_elo_rating);

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

                -- Get previous holder info (if moving up)
                IF v_direction = 'up' AND v_new_club_position <= 10 THEN
                    SELECT
                        dp.id,
                        COALESCE(dp.player1_name, '') || ' & ' || COALESCE(dp.player2_name, ''),
                        dp.current_elo_rating
                    INTO v_old_holder_id, v_old_holder_names, v_old_holder_elo
                    FROM doubles_pairings dp
                    WHERE dp.club_id = NEW.club_id
                      AND dp.id != NEW.id
                      AND dp.matches_played > 0
                    ORDER BY dp.current_elo_rating DESC, dp.matches_played DESC
                    OFFSET (v_new_club_position - 1)
                    LIMIT 1;
                END IF;

                -- Create event for player 1 (if real user)
                IF v_player1_exists AND v_player1_offline IS NOT TRUE THEN
                    INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                    VALUES (
                        NEW.player1_id,
                        NEW.club_id,
                        'club_doubles_ranking_change',
                        jsonb_build_object(
                            'pairing_id', NEW.id,
                            'player1_id', NEW.player1_id,
                            'player2_id', NEW.player2_id,
                            'player1_name', COALESCE(NEW.player1_name, 'Spieler 1'),
                            'player2_name', COALESCE(NEW.player2_name, 'Spieler 2'),
                            'display_name', COALESCE(NEW.player1_name, '') || ' & ' || COALESCE(NEW.player2_name, ''),
                            'new_position', v_new_club_position,
                            'old_position', v_old_club_position,
                            'position_medal', v_position_medal,
                            'elo_rating', NEW.current_elo_rating,
                            'previous_holder_id', v_old_holder_id,
                            'previous_holder_name', v_old_holder_names,
                            'previous_holder_elo', v_old_holder_elo,
                            'direction', v_direction,
                            'ranking_type', 'club_doubles_pairing'
                        )
                    );
                END IF;

                -- Create event for player 2 (if real user and different from player 1)
                IF v_player2_exists AND v_player2_offline IS NOT TRUE AND NEW.player2_id != NEW.player1_id THEN
                    INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                    VALUES (
                        NEW.player2_id,
                        NEW.club_id,
                        'club_doubles_ranking_change',
                        jsonb_build_object(
                            'pairing_id', NEW.id,
                            'player1_id', NEW.player1_id,
                            'player2_id', NEW.player2_id,
                            'player1_name', COALESCE(NEW.player1_name, 'Spieler 1'),
                            'player2_name', COALESCE(NEW.player2_name, 'Spieler 2'),
                            'display_name', COALESCE(NEW.player1_name, '') || ' & ' || COALESCE(NEW.player2_name, ''),
                            'new_position', v_new_club_position,
                            'old_position', v_old_club_position,
                            'position_medal', v_position_medal,
                            'elo_rating', NEW.current_elo_rating,
                            'previous_holder_id', v_old_holder_id,
                            'previous_holder_name', v_old_holder_names,
                            'previous_holder_elo', v_old_holder_elo,
                            'direction', v_direction,
                            'ranking_type', 'club_doubles_pairing'
                        )
                    );
                END IF;
            END IF;
        END IF;
    END IF;

    -- ============================================
    -- GLOBAL DOUBLES PAIRING RANKING
    -- ============================================

    -- Count global pairings (minimum 3 needed)
    SELECT COUNT(*) INTO v_global_pairing_count
    FROM doubles_pairings WHERE matches_played > 0;

    IF v_global_pairing_count >= 3 THEN
        -- Calculate positions
        v_old_global_position := get_global_doubles_pairing_position(NEW.id, COALESCE(OLD.current_elo_rating, 800));
        v_new_global_position := get_global_doubles_pairing_position(NEW.id, NEW.current_elo_rating);

        -- Only create event if position changed
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

            -- Create event for player 1 (if real user)
            IF v_player1_exists AND v_player1_offline IS NOT TRUE THEN
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.player1_id,
                    NEW.club_id,
                    'global_doubles_ranking_change',
                    jsonb_build_object(
                        'pairing_id', NEW.id,
                        'player1_id', NEW.player1_id,
                        'player2_id', NEW.player2_id,
                        'player1_name', COALESCE(NEW.player1_name, 'Spieler 1'),
                        'player2_name', COALESCE(NEW.player2_name, 'Spieler 2'),
                        'display_name', COALESCE(NEW.player1_name, '') || ' & ' || COALESCE(NEW.player2_name, ''),
                        'new_position', v_new_global_position,
                        'old_position', v_old_global_position,
                        'positions_changed', ABS(v_new_global_position - v_old_global_position),
                        'position_medal', v_position_medal,
                        'elo_rating', NEW.current_elo_rating,
                        'direction', v_direction,
                        'ranking_type', 'global_doubles_pairing'
                    )
                );
            END IF;

            -- Create event for player 2 (if real user and different)
            IF v_player2_exists AND v_player2_offline IS NOT TRUE AND NEW.player2_id != NEW.player1_id THEN
                INSERT INTO activity_events (user_id, club_id, event_type, event_data)
                VALUES (
                    NEW.player2_id,
                    NEW.club_id,
                    'global_doubles_ranking_change',
                    jsonb_build_object(
                        'pairing_id', NEW.id,
                        'player1_id', NEW.player1_id,
                        'player2_id', NEW.player2_id,
                        'player1_name', COALESCE(NEW.player1_name, 'Spieler 1'),
                        'player2_name', COALESCE(NEW.player2_name, 'Spieler 2'),
                        'display_name', COALESCE(NEW.player1_name, '') || ' & ' || COALESCE(NEW.player2_name, ''),
                        'new_position', v_new_global_position,
                        'old_position', v_old_global_position,
                        'positions_changed', ABS(v_new_global_position - v_old_global_position),
                        'position_medal', v_position_medal,
                        'elo_rating', NEW.current_elo_rating,
                        'direction', v_direction,
                        'ranking_type', 'global_doubles_pairing'
                    )
                );
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DROP OLD TRIGGERS (player-based)
-- ============================================

DROP TRIGGER IF EXISTS trigger_doubles_ranking_change_events ON profiles;
DROP TRIGGER IF EXISTS trigger_sync_doubles_elo_to_profiles ON doubles_pairings;

-- ============================================
-- CREATE NEW TRIGGER (pairing-based)
-- ============================================

DROP TRIGGER IF EXISTS trigger_doubles_pairing_ranking_events ON doubles_pairings;
CREATE TRIGGER trigger_doubles_pairing_ranking_events
    AFTER UPDATE OF current_elo_rating ON doubles_pairings
    FOR EACH ROW
    EXECUTE FUNCTION create_doubles_pairing_ranking_events();

-- ============================================
-- RLS POLICIES for doubles ranking events
-- ============================================

-- Club doubles ranking: visible to all club members
DROP POLICY IF EXISTS "Club doubles ranking visible to club members" ON activity_events;
CREATE POLICY "Club doubles ranking visible to club members" ON activity_events
    FOR SELECT USING (
        event_type = 'club_doubles_ranking_change'
        AND club_id IN (SELECT club_id FROM profiles WHERE id = auth.uid())
    );

-- Global doubles ranking: visible to both players in the pairing and their friends
DROP POLICY IF EXISTS "Global doubles ranking visible to players and friends" ON activity_events;
CREATE POLICY "Global doubles ranking visible to players and friends" ON activity_events
    FOR SELECT USING (
        event_type = 'global_doubles_ranking_change'
        AND (
            -- User is one of the players
            user_id = auth.uid()
            OR (event_data->>'player1_id')::uuid = auth.uid()
            OR (event_data->>'player2_id')::uuid = auth.uid()
            -- Or user is friends with one of the players
            OR EXISTS (
                SELECT 1 FROM friendships
                WHERE status = 'accepted'
                AND (
                    (user_id = auth.uid() AND friend_id = (event_data->>'player1_id')::uuid)
                    OR (friend_id = auth.uid() AND user_id = (event_data->>'player1_id')::uuid)
                    OR (user_id = auth.uid() AND friend_id = (event_data->>'player2_id')::uuid)
                    OR (friend_id = auth.uid() AND user_id = (event_data->>'player2_id')::uuid)
                )
            )
        )
    );
