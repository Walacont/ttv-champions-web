-- ============================================
-- STORAGE BUCKET FOR TRAINING VIDEOS
-- Configuration for video analysis uploads
-- ============================================

-- Create storage bucket for training videos
-- Public bucket for easy video playback (videos are protected by RLS on metadata table)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'training-videos',
    'training-videos',
    true,
    104857600, -- 100 MB max file size
    ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 104857600,
    allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'image/jpeg', 'image/png']::text[];

-- ============================================
-- RLS POLICIES FOR TRAINING VIDEOS BUCKET
-- ============================================

-- Drop existing policies (für Re-Run)
DROP POLICY IF EXISTS "Users can upload training videos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to training videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own training videos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own training videos" ON storage.objects;

-- Allow authenticated users to upload videos to their own folder
-- Path format: {user_id}/{filename}
CREATE POLICY "Users can upload training videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'training-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all training videos
-- (Access control is handled via video_analyses RLS)
CREATE POLICY "Public read access to training videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'training-videos');

-- Allow users to update their own videos
CREATE POLICY "Users can update own training videos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'training-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'training-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own videos
CREATE POLICY "Users can delete own training videos"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'training-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- Done! Training videos storage is configured.
-- File path format: {user_id}/{video_id}.mp4
-- Thumbnails: {user_id}/{video_id}_thumb.jpg
-- ============================================
