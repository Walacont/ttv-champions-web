-- ============================================
-- STORAGE BUCKET FOR POST IMAGES
-- Configuration for community post image uploads
-- ============================================

-- Create storage bucket for post images
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================
-- RLS POLICIES FOR POST IMAGES BUCKET
-- ============================================

-- Allow authenticated users to upload their own images
CREATE POLICY "Users can upload post images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to all post images
CREATE POLICY "Public read access to post images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-images');

-- Allow users to update their own images
CREATE POLICY "Users can update own post images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own images
CREATE POLICY "Users can delete own post images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================
-- Done! Post images storage is configured.
-- ============================================
