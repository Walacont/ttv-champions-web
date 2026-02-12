-- Fix duplicate rank_up events
-- Prevents the same rank from being logged multiple times for a user

-- Drop and recreate the trigger function with duplicate check
CREATE OR REPLACE FUNCTION create_rank_up_event()
RETURNS TRIGGER AS $$
DECLARE
    v_old_rank TEXT;
    v_new_rank TEXT;
    v_old_rank_order INT;
    v_new_rank_order INT;
    v_existing_event UUID;
BEGIN
    v_old_rank := calculate_rank(
        COALESCE(OLD.elo_rating, 800),
        COALESCE(OLD.xp, 0)
    );

    v_new_rank := calculate_rank(
        COALESCE(NEW.elo_rating, 800),
        COALESCE(NEW.xp, 0)
    );

    IF v_old_rank != v_new_rank THEN
        v_old_rank_order := get_rank_order(v_old_rank);
        v_new_rank_order := get_rank_order(v_new_rank);

        IF v_new_rank_order > v_old_rank_order THEN
            -- Check if we already have a rank_up event for this user and rank
            SELECT id INTO v_existing_event
            FROM activity_events
            WHERE user_id = NEW.id
              AND event_type = 'rank_up'
              AND event_data->>'rank_name' = v_new_rank
            LIMIT 1;

            -- Only insert if no existing event for this rank
            IF v_existing_event IS NULL THEN
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
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also delete existing duplicate rank_up events (keep only first occurrence)
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, event_data->>'rank_name'
            ORDER BY created_at ASC
        ) as rn
    FROM activity_events
    WHERE event_type = 'rank_up'
)
DELETE FROM activity_events
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Show remaining rank_up events
SELECT
    ae.id,
    ae.event_data->>'display_name' as player,
    ae.event_data->>'rank_name' as rank,
    ae.created_at
FROM activity_events ae
WHERE event_type = 'rank_up'
ORDER BY created_at DESC
LIMIT 20;
