-- ============================================
-- UPDATE COMMUNITY POSTS FOR MULTIPLE IMAGES
-- Change single image_url to array of image_urls
-- ============================================

-- Add new column for multiple images
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Migrate existing data from image_url to image_urls
UPDATE community_posts
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND image_urls IS NULL;

-- Remove old column (optional - comment out if you want to keep it)
-- ALTER TABLE community_posts DROP COLUMN IF EXISTS image_url;

-- ============================================
-- Done! Community posts now support multiple images.
-- ============================================
