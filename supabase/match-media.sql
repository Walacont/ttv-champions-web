-- Match Media Table
-- Stores photos and videos for matches (singles and doubles)
-- Files are stored in Supabase Storage, this table stores metadata

-- Drop existing policies first (if re-running)
DROP POLICY IF EXISTS "match_media_select" ON match_media;
DROP POLICY IF EXISTS "match_media_insert" ON match_media;
DROP POLICY IF EXISTS "match_media_delete" ON match_media;

CREATE TABLE IF NOT EXISTS match_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL,
    match_type TEXT NOT NULL CHECK (match_type IN ('singles', 'doubles')),
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN ('photo', 'video')),
    file_path TEXT NOT NULL UNIQUE, -- Path in Supabase Storage
    file_size BIGINT NOT NULL, -- Size in bytes
    mime_type TEXT NOT NULL,
    thumbnail_path TEXT, -- Optional thumbnail for videos
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure valid file sizes
    CONSTRAINT valid_photo_size CHECK (
        file_type != 'photo' OR file_size <= 10485760  -- 10 MB for photos
    ),
    CONSTRAINT valid_video_size CHECK (
        file_type != 'video' OR file_size <= 52428800  -- 50 MB for videos
    )
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_match_media_match ON match_media(match_id, match_type);
CREATE INDEX IF NOT EXISTS idx_match_media_uploader ON match_media(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_match_media_created ON match_media(created_at DESC);

-- Enable RLS
ALTER TABLE match_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view media for matches they can see
-- For now, everyone can see all match media (can restrict later based on privacy settings)
CREATE POLICY "match_media_select" ON match_media
    FOR SELECT USING (true);

-- Only match participants can upload media
-- For singles: player_a or player_b
-- For doubles: any of the 4 players
CREATE POLICY "match_media_insert" ON match_media
    FOR INSERT WITH CHECK (
        auth.uid() = uploaded_by
        AND (
            -- Singles match: must be player_a or player_b
            (match_type = 'singles' AND EXISTS (
                SELECT 1 FROM singles_matches sm
                WHERE sm.id = match_id
                AND (sm.player_a_id = auth.uid() OR sm.player_b_id = auth.uid())
            ))
            OR
            -- Doubles match: must be one of the 4 players
            (match_type = 'doubles' AND EXISTS (
                SELECT 1 FROM doubles_matches dm
                WHERE dm.id = match_id
                AND (
                    (dm.team_a->>'player1_id')::UUID = auth.uid()
                    OR (dm.team_a->>'player2_id')::UUID = auth.uid()
                    OR (dm.team_b->>'player1_id')::UUID = auth.uid()
                    OR (dm.team_b->>'player2_id')::UUID = auth.uid()
                )
            ))
        )
    );

-- Users can delete their own uploads
CREATE POLICY "match_media_delete" ON match_media
    FOR DELETE USING (auth.uid() = uploaded_by);

-- Function to get media for a match
CREATE OR REPLACE FUNCTION get_match_media(
    p_match_id UUID,
    p_match_type TEXT
)
RETURNS TABLE(
    id UUID,
    file_type TEXT,
    file_path TEXT,
    file_size BIGINT,
    mime_type TEXT,
    thumbnail_path TEXT,
    created_at TIMESTAMPTZ,
    uploaded_by UUID,
    uploader_name TEXT,
    uploader_avatar TEXT,
    is_uploader BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    RETURN QUERY
    SELECT
        mm.id,
        mm.file_type,
        mm.file_path,
        mm.file_size,
        mm.mime_type,
        mm.thumbnail_path,
        mm.created_at,
        mm.uploaded_by,
        COALESCE(p.display_name, p.first_name || ' ' || LEFT(p.last_name, 1) || '.') AS uploader_name,
        p.avatar_url AS uploader_avatar,
        (mm.uploaded_by = v_user_id) AS is_uploader
    FROM match_media mm
    LEFT JOIN profiles p ON mm.uploaded_by = p.id
    WHERE mm.match_id = p_match_id
      AND mm.match_type = p_match_type
    ORDER BY mm.created_at ASC;
END;
$$;

-- Function to check if user can upload media to a match
CREATE OR REPLACE FUNCTION can_upload_match_media(
    p_match_id UUID,
    p_match_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_participant BOOLEAN := FALSE;
    v_media_count INT;
BEGIN
    -- Check if user is a match participant
    IF p_match_type = 'singles' THEN
        SELECT EXISTS (
            SELECT 1 FROM singles_matches
            WHERE id = p_match_id
            AND (player_a_id = v_user_id OR player_b_id = v_user_id)
        ) INTO v_is_participant;
    ELSIF p_match_type = 'doubles' THEN
        SELECT EXISTS (
            SELECT 1 FROM doubles_matches
            WHERE id = p_match_id
            AND (
                (team_a->>'player1_id')::UUID = v_user_id
                OR (team_a->>'player2_id')::UUID = v_user_id
                OR (team_b->>'player1_id')::UUID = v_user_id
                OR (team_b->>'player2_id')::UUID = v_user_id
            )
        ) INTO v_is_participant;
    END IF;

    IF NOT v_is_participant THEN
        RETURN FALSE;
    END IF;

    -- Check if match already has 5 media items (limit)
    SELECT COUNT(*) INTO v_media_count
    FROM match_media
    WHERE match_id = p_match_id AND match_type = p_match_type;

    RETURN v_media_count < 5;
END;
$$;

-- Function to delete match media (also removes from storage)
CREATE OR REPLACE FUNCTION delete_match_media(
    p_media_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_file_path TEXT;
    v_thumbnail_path TEXT;
BEGIN
    -- Get file paths and verify ownership
    SELECT file_path, thumbnail_path INTO v_file_path, v_thumbnail_path
    FROM match_media
    WHERE id = p_media_id AND uploaded_by = v_user_id;

    IF v_file_path IS NULL THEN
        RAISE EXCEPTION 'Media not found or you do not have permission to delete it';
    END IF;

    -- Delete from database
    DELETE FROM match_media WHERE id = p_media_id;

    -- Return paths for deletion from storage (client-side)
    RETURN json_build_object(
        'file_path', v_file_path,
        'thumbnail_path', v_thumbnail_path
    );
END;
$$;
