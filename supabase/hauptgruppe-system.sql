-- ========================================================================
-- HAUPTGRUPPE SYSTEM
-- ========================================================================
-- Jeder Verein hat automatisch eine "Hauptgruppe" (is_default = true)
-- - Wird automatisch erstellt wenn ein Verein erstellt wird
-- - Kann nicht gelöscht werden (UI verhindert das bereits)
-- - Alle Spieler werden automatisch zur Hauptgruppe hinzugefügt
-- ========================================================================

-- ========================================================================
-- 1. FUNCTION: Create Hauptgruppe for a club
-- ========================================================================
CREATE OR REPLACE FUNCTION create_hauptgruppe_for_club(p_club_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hauptgruppe_id UUID;
BEGIN
    -- Check if Hauptgruppe already exists
    SELECT id INTO v_hauptgruppe_id
    FROM subgroups
    WHERE club_id = p_club_id AND is_default = true
    LIMIT 1;

    -- If exists, return existing ID
    IF v_hauptgruppe_id IS NOT NULL THEN
        RETURN v_hauptgruppe_id;
    END IF;

    -- Create new Hauptgruppe
    INSERT INTO subgroups (id, club_id, name, color, is_default, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        p_club_id,
        'Hauptgruppe',
        '#6366f1',  -- Indigo color
        true,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_hauptgruppe_id;

    RETURN v_hauptgruppe_id;
END;
$$;

-- ========================================================================
-- 2. UPDATE: Auto Create Club on Invitation (with Hauptgruppe)
-- ========================================================================
CREATE OR REPLACE FUNCTION auto_create_club_on_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    existing_club RECORD;
BEGIN
    -- Check if club exists
    SELECT * INTO existing_club FROM clubs WHERE id = NEW.club_id;

    IF existing_club IS NULL THEN
        -- Create club
        INSERT INTO clubs (id, name, created_at)
        VALUES (NEW.club_id, NEW.club_id, NOW())
        ON CONFLICT (id) DO NOTHING;

        -- Create Hauptgruppe for the new club
        PERFORM create_hauptgruppe_for_club(NEW.club_id);
    END IF;

    RETURN NEW;
END;
$$;

-- ========================================================================
-- 3. FUNCTION: Get Hauptgruppe ID for a club
-- ========================================================================
CREATE OR REPLACE FUNCTION get_hauptgruppe_id(p_club_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hauptgruppe_id UUID;
BEGIN
    SELECT id INTO v_hauptgruppe_id
    FROM subgroups
    WHERE club_id = p_club_id AND is_default = true
    LIMIT 1;

    RETURN v_hauptgruppe_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_hauptgruppe_id TO authenticated;
GRANT EXECUTE ON FUNCTION create_hauptgruppe_for_club TO authenticated;

-- ========================================================================
-- 4. UPDATE: Create Offline Player (auto-add to Hauptgruppe)
-- ========================================================================
CREATE OR REPLACE FUNCTION create_offline_player(
    p_first_name TEXT,
    p_last_name TEXT,
    p_club_id UUID,
    p_subgroup_ids UUID[] DEFAULT '{}',
    p_is_match_ready BOOLEAN DEFAULT FALSE,
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
        is_match_ready,
        onboarding_complete,
        points,
        elo_rating,
        highest_elo,
        xp,
        grundlagen_completed,
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
        p_is_match_ready,
        FALSE,
        0,
        800,
        800,
        CASE WHEN p_is_match_ready THEN 50 ELSE 0 END,
        CASE WHEN p_is_match_ready THEN 5 ELSE 0 END,
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
        'is_match_ready', p.is_match_ready,
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

-- ========================================================================
-- 5. MIGRATION: Add Hauptgruppe to existing clubs
-- ========================================================================
-- This adds Hauptgruppe to all clubs that don't have one yet
DO $$
DECLARE
    club_record RECORD;
    v_hauptgruppe_id UUID;
BEGIN
    FOR club_record IN SELECT id FROM clubs LOOP
        -- Check if club already has a Hauptgruppe
        SELECT id INTO v_hauptgruppe_id
        FROM subgroups
        WHERE club_id = club_record.id AND is_default = true
        LIMIT 1;

        -- Create if not exists
        IF v_hauptgruppe_id IS NULL THEN
            INSERT INTO subgroups (id, club_id, name, color, is_default, created_at, updated_at)
            VALUES (
                gen_random_uuid(),
                club_record.id,
                'Hauptgruppe',
                '#6366f1',
                true,
                NOW(),
                NOW()
            );
            RAISE NOTICE 'Created Hauptgruppe for club %', club_record.id;
        END IF;
    END LOOP;
END;
$$;

-- ========================================================================
-- 6. MIGRATION: Add all existing players to their club's Hauptgruppe
-- ========================================================================
DO $$
DECLARE
    player_record RECORD;
    v_hauptgruppe_id UUID;
    v_current_subgroups UUID[];
BEGIN
    FOR player_record IN
        SELECT id, club_id, subgroup_ids
        FROM profiles
        WHERE club_id IS NOT NULL
    LOOP
        -- Get the Hauptgruppe for this player's club
        SELECT id INTO v_hauptgruppe_id
        FROM subgroups
        WHERE club_id = player_record.club_id AND is_default = true
        LIMIT 1;

        -- If Hauptgruppe exists and player is not in it, add them
        IF v_hauptgruppe_id IS NOT NULL THEN
            v_current_subgroups := COALESCE(player_record.subgroup_ids, '{}');

            IF NOT (v_hauptgruppe_id = ANY(v_current_subgroups)) THEN
                UPDATE profiles
                SET subgroup_ids = array_append(v_current_subgroups, v_hauptgruppe_id),
                    updated_at = NOW()
                WHERE id = player_record.id;

                RAISE NOTICE 'Added player % to Hauptgruppe', player_record.id;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- ========================================================================
-- DONE!
-- ========================================================================
-- Run this file in Supabase SQL Editor to set up the Hauptgruppe system
