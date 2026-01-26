-- ============================================
-- Delete Player Video RPC Function
-- Ermöglicht Spielern, Videos zu löschen die ihnen gehören ODER die ihnen zugewiesen wurden
-- ============================================

-- Die Funktion nutzt SECURITY DEFINER um RLS zu umgehen
-- Der Spieler kann ein Video löschen wenn:
-- 1. Er das Video selbst hochgeladen hat (uploaded_by = player_id)
-- 2. Das Video ihm zugewiesen wurde (video_assignments)

CREATE OR REPLACE FUNCTION delete_player_video(p_video_id UUID, p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_can_delete BOOLEAN := FALSE;
    v_video_exists BOOLEAN := FALSE;
BEGIN
    -- Prüfen ob das Video existiert
    SELECT EXISTS(
        SELECT 1 FROM video_analyses WHERE id = p_video_id
    ) INTO v_video_exists;

    IF NOT v_video_exists THEN
        -- Video existiert nicht, als erfolgreich behandeln
        RETURN TRUE;
    END IF;

    -- Prüfen ob der Spieler berechtigt ist das Video zu löschen
    SELECT EXISTS(
        SELECT 1 FROM video_analyses va
        WHERE va.id = p_video_id
        AND (
            -- Eigenes Video
            va.uploaded_by = p_player_id
            OR
            -- Zugewiesenes Video
            EXISTS (
                SELECT 1 FROM video_assignments vass
                WHERE vass.video_id = va.id
                AND vass.player_id = p_player_id
            )
        )
    ) INTO v_can_delete;

    IF NOT v_can_delete THEN
        RAISE EXCEPTION 'Keine Berechtigung zum Löschen dieses Videos';
    END IF;

    -- Video löschen (CASCADE löscht automatisch assignments und comments)
    DELETE FROM video_analyses WHERE id = p_video_id;

    RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_player_video(UUID, UUID) TO authenticated;
