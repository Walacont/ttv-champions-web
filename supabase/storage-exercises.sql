-- ============================================
-- STORAGE BUCKET FOR EXERCISE IMAGES
-- Configuration for exercise image uploads
-- Coaches, Head-Coaches and Admins can upload
-- ============================================

-- Create storage bucket for exercise images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercises', 'exercises', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================
-- RLS POLICIES FOR EXERCISES BUCKET
-- ============================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "Coaches can upload exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can update exercise images" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can delete exercise images" ON storage.objects;

-- Allow coaches, head_coaches and admins to upload images
CREATE POLICY "Coaches can upload exercise images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'exercises'
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('coach', 'head_coach', 'admin')
    )
);

-- Allow public read access to all exercise images
CREATE POLICY "Public read access to exercise images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'exercises');

-- Allow coaches, head_coaches and admins to update images
CREATE POLICY "Coaches can update exercise images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'exercises'
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('coach', 'head_coach', 'admin')
    )
)
WITH CHECK (
    bucket_id = 'exercises'
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('coach', 'head_coach', 'admin')
    )
);

-- Allow coaches, head_coaches and admins to delete images
CREATE POLICY "Coaches can delete exercise images"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'exercises'
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('coach', 'head_coach', 'admin')
    )
);

-- ============================================
-- Done! Exercise images storage is configured.
-- ============================================
