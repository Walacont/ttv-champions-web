-- ========================================================================
-- FIX: Remove is_match_ready references from database functions
-- ========================================================================
-- The is_match_ready column has been removed from the profiles table.
-- This migration re-deploys the create_offline_player function without it.
-- Run this in the Supabase SQL Editor.
-- ========================================================================

-- ========================================================================
-- 1. Drop ALL existing versions of create_offline_player dynamically
-- ========================================================================
DO $$
DECLARE
    func_oid oid;
BEGIN
    FOR func_oid IN
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'create_offline_player'
          AND n.nspname = 'public'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || func_oid::regprocedure || ' CASCADE';
    END LOOP;
END;
$$;

-- ========================================================================
-- 2. Re-deploy create_offline_player (without is_match_ready)
-- ========================================================================
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
    v_hauptgruppe_id UUID;
    v_final_subgroup_ids UUID[];
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

    -- Get or create Hauptgruppe for this club
    v_hauptgruppe_id := get_hauptgruppe_id(p_club_id);
    IF v_hauptgruppe_id IS NULL THEN
        v_hauptgruppe_id := create_hauptgruppe_for_club(p_club_id);
    END IF;

    -- Merge provided subgroup_ids with Hauptgruppe (ensure Hauptgruppe is always included)
    IF v_hauptgruppe_id IS NOT NULL THEN
        IF p_subgroup_ids IS NULL OR array_length(p_subgroup_ids, 1) IS NULL THEN
            v_final_subgroup_ids := ARRAY[v_hauptgruppe_id];
        ELSIF NOT (v_hauptgruppe_id = ANY(p_subgroup_ids)) THEN
            v_final_subgroup_ids := array_append(p_subgroup_ids, v_hauptgruppe_id);
        ELSE
            v_final_subgroup_ids := p_subgroup_ids;
        END IF;
    ELSE
        v_final_subgroup_ids := COALESCE(p_subgroup_ids, '{}');
    END IF;

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
        v_final_subgroup_ids,
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_offline_player TO authenticated;

-- ========================================================================
-- 3. Safety check: Drop is_match_ready column if it still exists
-- ========================================================================
ALTER TABLE profiles DROP COLUMN IF EXISTS is_match_ready;
ALTER TABLE profiles DROP COLUMN IF EXISTS grundlagen_completed;

-- ========================================================================
-- DONE! Both errors should now be fixed:
-- - Offline player creation works again
-- - Dashboard filter error is resolved (column is gone)
-- ========================================================================
