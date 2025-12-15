-- Supabase Storage Setup for Match Media
-- Creates a bucket for storing match photos and videos

-- NOTE: Storage bucket and policies should be created through Supabase Dashboard
-- Go to: Storage > Create a new bucket > "match-media" (public)
-- Then set up policies in the Policies tab:
--
-- Policy 1: "Allow public read access"
--   - Operation: SELECT
--   - Policy definition: true
--
-- Policy 2: "Allow authenticated users to upload"
--   - Operation: INSERT
--   - Policy definition: (auth.role() = 'authenticated')
--
-- Policy 3: "Allow users to delete own files"
--   - Operation: DELETE
--   - Policy definition: ((storage.foldername(name))[1] = (auth.uid())::text)

-- Create storage bucket for match media (run this if bucket doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('match-media', 'match-media', true)
ON CONFLICT (id) DO NOTHING;
