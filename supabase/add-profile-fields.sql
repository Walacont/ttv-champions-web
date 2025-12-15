-- Add bio and location fields to profiles for public profile pages
-- Migration: add-profile-fields.sql

-- Add bio field (like Strava's profile description)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add location field (city/region)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location TEXT;

-- Extend privacy_settings to support the new follower system
-- Default: profile is public (everyone can see and follow)
COMMENT ON COLUMN profiles.privacy_settings IS 'Privacy settings JSON: {searchable: bool, showElo: bool, profileVisibility: "public"|"club_only"|"private"}';

-- Add index for location searches (optional, for future features)
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles(location) WHERE location IS NOT NULL;

-- Update existing privacy_settings to include profileVisibility if not present
-- This sets default to "public" for existing users
UPDATE profiles
SET privacy_settings = privacy_settings || '{"profileVisibility": "public"}'::jsonb
WHERE privacy_settings IS NOT NULL
  AND NOT (privacy_settings ? 'profileVisibility');

-- For profiles without privacy_settings, set default
UPDATE profiles
SET privacy_settings = '{"searchable": true, "showElo": true, "profileVisibility": "public"}'::jsonb
WHERE privacy_settings IS NULL;
