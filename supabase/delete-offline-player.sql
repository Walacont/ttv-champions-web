-- Function to safely delete an offline player profile
-- Used as fallback when migrate_offline_player fails
-- Only deletes profiles that are marked as is_offline = TRUE

-- Drop old function first to allow parameter name changes
DROP FUNCTION IF EXISTS delete_offline_player(UUID);

CREATE OR REPLACE FUNCTION delete_offline_player(
    p_offline_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    -- First, clear any invitation_code references to this player
    -- (invitation_codes has a foreign key to profiles without ON DELETE CASCADE)
    UPDATE invitation_codes SET player_id = NULL
    WHERE player_id = p_offline_player_id;

    -- Only delete if the profile exists and is marked as offline
    DELETE FROM profiles
    WHERE id = p_offline_player_id
    AND is_offline = TRUE;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
        RETURN json_build_object(
            'success', TRUE,
            'deleted_id', p_offline_player_id,
            'message', 'Offline player deleted successfully'
        );
    ELSE
        RETURN json_build_object(
            'success', FALSE,
            'error', 'No offline player found with this ID or player is not offline'
        );
    END IF;

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', FALSE,
        'error', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_offline_player TO authenticated;
