-- ============================================
-- FIX: Training Summary Function Overloading
-- Drops all versions of training summary functions and creates clean single versions
-- This fixes PGRST203 error: "Could not choose the best candidate function"
-- ============================================

-- Drop all existing versions of add_points_to_training_summary
-- Using different signature patterns that might exist
DROP FUNCTION IF EXISTS add_points_to_training_summary(uuid, text, integer, text, text, text);
DROP FUNCTION IF EXISTS add_points_to_training_summary(uuid, text, numeric, text, text, text);
DROP FUNCTION IF EXISTS add_points_to_training_summary(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS add_points_to_training_summary(uuid, uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS add_points_to_training_summary(uuid, uuid, numeric, text, text, text);
DROP FUNCTION IF EXISTS add_points_to_training_summary(uuid, uuid, text, text, text, text);

-- Also drop by parameter names to catch any remaining versions
DROP FUNCTION IF EXISTS public.add_points_to_training_summary(p_player_id uuid, p_event_id text, p_amount integer, p_reason text, p_type text, p_exercise_name text);
DROP FUNCTION IF EXISTS public.add_points_to_training_summary(p_player_id uuid, p_event_id text, p_amount numeric, p_reason text, p_type text, p_exercise_name text);
DROP FUNCTION IF EXISTS public.add_points_to_training_summary(p_player_id uuid, p_event_id text, p_amount text, p_reason text, p_type text, p_exercise_name text);

-- Drop create_training_summary function
DROP FUNCTION IF EXISTS create_training_summary(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.create_training_summary(p_user_id uuid, p_club_id uuid, p_content text);

-- ============================================
-- CREATE CLEAN FUNCTIONS
-- ============================================

-- Function to create a training summary post for a player
-- Used by coaches to create training summaries that are visible only to the specific player
CREATE OR REPLACE FUNCTION create_training_summary(
    p_user_id UUID,
    p_club_id UUID,
    p_content TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_id UUID;
    v_coach_id UUID;
    v_is_coach BOOLEAN;
BEGIN
    -- Get the current user (coach)
    v_coach_id := auth.uid();

    -- Check if the current user is a coach in the player's club
    SELECT EXISTS (
        SELECT 1 FROM profile_club_sports pcs
        WHERE pcs.profile_id = v_coach_id
        AND pcs.club_id = p_club_id
        AND pcs.role IN ('coach', 'head_coach')
    ) INTO v_is_coach;

    IF NOT v_is_coach THEN
        RAISE EXCEPTION 'Not authorized: User is not a coach in this club';
    END IF;

    -- Insert the training summary post
    INSERT INTO community_posts (
        user_id,
        club_id,
        content,
        visibility,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_club_id,
        p_content,
        'club',  -- Only visible within the club
        NOW(),
        NOW()
    )
    RETURNING id INTO v_post_id;

    RETURN v_post_id;
END;
$$;

-- Function to add points to an existing training summary
-- Updates the JSON content of the training summary post
CREATE OR REPLACE FUNCTION add_points_to_training_summary(
    p_player_id UUID,
    p_event_id TEXT,
    p_amount INTEGER,
    p_reason TEXT,
    p_type TEXT,
    p_exercise_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_id UUID;
    v_content TEXT;
    v_summary_data JSONB;
    v_points JSONB;
    v_new_point JSONB;
    v_total_points INTEGER;
    v_coach_id UUID;
    v_player_club_id UUID;
    v_is_coach BOOLEAN;
    TRAINING_SUMMARY_PREFIX CONSTANT TEXT := 'TRAINING_SUMMARY|';
BEGIN
    -- Get the current user (coach)
    v_coach_id := auth.uid();

    -- Get the player's club
    SELECT club_id INTO v_player_club_id
    FROM profiles
    WHERE id = p_player_id;

    -- Check if the current user is a coach in the player's club
    SELECT EXISTS (
        SELECT 1 FROM profile_club_sports pcs
        WHERE pcs.profile_id = v_coach_id
        AND pcs.club_id = v_player_club_id
        AND pcs.role IN ('coach', 'head_coach')
    ) INTO v_is_coach;

    IF NOT v_is_coach THEN
        RAISE EXCEPTION 'Not authorized: User is not a coach in this club';
    END IF;

    -- Find the training summary post for this player and event
    SELECT id, content INTO v_post_id, v_content
    FROM community_posts
    WHERE user_id = p_player_id
    AND content LIKE TRAINING_SUMMARY_PREFIX || '%'
    AND deleted_at IS NULL
    AND content LIKE '%"event_id":"' || p_event_id || '"%'
    LIMIT 1;

    IF v_post_id IS NULL THEN
        -- No training summary found for this event
        RETURN FALSE;
    END IF;

    -- Parse the existing summary data
    v_summary_data := (SUBSTRING(v_content FROM LENGTH(TRAINING_SUMMARY_PREFIX) + 1))::JSONB;

    -- Get existing points array or create empty one
    v_points := COALESCE(v_summary_data->'points', '[]'::JSONB);

    -- Create new point entry
    v_new_point := jsonb_build_object(
        'amount', p_amount,
        'reason', COALESCE(p_reason, ''),
        'type', COALESCE(p_type, 'exercise'),
        'exercise_name', p_exercise_name,
        'added_at', NOW()
    );

    -- Add new point to array
    v_points := v_points || v_new_point;

    -- Calculate new total
    v_total_points := COALESCE((v_summary_data->>'total_points')::INTEGER, 0) + p_amount;

    -- Update summary data
    v_summary_data := v_summary_data || jsonb_build_object(
        'points', v_points,
        'total_points', v_total_points,
        'updated_at', NOW()
    );

    -- Update the post
    UPDATE community_posts
    SET content = TRAINING_SUMMARY_PREFIX || v_summary_data::TEXT,
        updated_at = NOW()
    WHERE id = v_post_id;

    RETURN TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_training_summary(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_points_to_training_summary(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================
-- Done! Training summary functions are fixed.
-- ============================================
