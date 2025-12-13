-- Supabase Storage Setup for Match Media
-- Creates a bucket for storing match photos and videos

-- Create storage bucket for match media
INSERT INTO storage.buckets (id, name, public)
VALUES ('match-media', 'match-media', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "match_media_select" ON storage.objects;
DROP POLICY IF EXISTS "match_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "match_media_delete" ON storage.objects;

-- Policy: Anyone can view match media files
CREATE POLICY "match_media_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'match-media');

-- Policy: Only authenticated users can upload to match-media bucket
-- Additional validation is done in the match_media table insert policy
CREATE POLICY "match_media_insert"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'match-media'
    AND auth.role() = 'authenticated'
);

-- Policy: Users can only delete their own uploads
-- File path format: {user_id}/{match_type}/{match_id}/{filename}
CREATE POLICY "match_media_delete"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'match-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Create a function to get the public URL for a match media file
CREATE OR REPLACE FUNCTION get_match_media_url(file_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Returns the public URL for a file in the match-media bucket
    -- Note: This assumes Supabase is configured with a public URL
    -- Format: https://{project_ref}.supabase.co/storage/v1/object/public/match-media/{file_path}
    RETURN format('https://%s.supabase.co/storage/v1/object/public/match-media/%s',
        current_setting('app.settings.project_ref', true),
        file_path
    );
END;
$$;
