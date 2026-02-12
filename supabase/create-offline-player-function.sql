-- Function to create offline players (bypasses RLS with proper authorization)
-- This allows coaches to create offline player profiles for their club
-- NOTE: The profiles table must NOT have a foreign key constraint to auth.users for offline players

-- First, ensure we can insert offline players by modifying the constraint if needed
-- (Run this separately if you get foreign key errors)
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
--   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
--   NOT VALID; -- NOT VALID allows existing data that doesn't match

CREATE OR REPLACE FUNCTION create_offline_player(
    p_first_name TEXT,
    p_last_name TEXT,
    p_club_id UUID,
    p_subgroup_ids UUID[] DEFAULT '{}',
    p_birthdate TEXT DEFAULT NULL,
    p_gender TEXT DEFAULT NULL,
    p_sport_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_new_player_id UUID;
    v_display_name TEXT;
    v_result JSON;
BEGIN
    -- Get the caller's ID
    v_caller_id := auth.uid();

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if caller is coach, head_coach, or admin in this club
    SELECT role INTO v_caller_role
    FROM profiles
    WHERE id = v_caller_id;

    IF v_caller_role NOT IN ('coach', 'head_coach', 'admin') THEN
        -- Also check profile_club_sports for sport-specific coach role
        SELECT pcs.role INTO v_caller_role
        FROM profile_club_sports pcs
        WHERE pcs.user_id = v_caller_id
          AND pcs.club_id = p_club_id
          AND pcs.role IN ('coach', 'head_coach');

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Not authorized to create players';
        END IF;
    END IF;

    -- Generate a new UUID for the offline player
    v_new_player_id := gen_random_uuid();

    -- Create display name
    v_display_name := TRIM(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, ''));

    -- Create the offline player profile
    INSERT INTO profiles (
        id,
        first_name,
        last_name,
        display_name,
        club_id,
        role,
        is_offline,
        onboarding_complete,
        points,
        elo_rating,
        highest_elo,
        xp,
        subgroup_ids,
        birthdate,
        gender,
        active_sport_id,
        created_at,
        updated_at
    ) VALUES (
        v_new_player_id,
        p_first_name,
        p_last_name,
        v_display_name,
        p_club_id,
        'player',
        TRUE,
        FALSE,
        0,
        800,
        800,
        0,
        p_subgroup_ids,
        CASE WHEN p_birthdate IS NOT NULL THEN p_birthdate::DATE ELSE NULL END,
        p_gender,
        p_sport_id,
        NOW(),
        NOW()
    );

    -- If sport_id is provided, also create profile_club_sports entry
    IF p_sport_id IS NOT NULL AND p_club_id IS NOT NULL THEN
        INSERT INTO profile_club_sports (user_id, club_id, sport_id, role, created_at)
        VALUES (v_new_player_id, p_club_id, p_sport_id, 'player', NOW())
        ON CONFLICT (user_id, club_id, sport_id) DO NOTHING;
    END IF;

    -- Return the new player data
    SELECT json_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'club_id', p.club_id,
        'role', p.role,
        'is_offline', p.is_offline,
        'xp', p.xp,
        'points', p.points,
        'elo_rating', p.elo_rating,
        'subgroup_ids', p.subgroup_ids,
        'birthdate', p.birthdate,
        'gender', p.gender
    ) INTO v_result
    FROM profiles p
    WHERE p.id = v_new_player_id;

    RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_offline_player TO authenticated;
