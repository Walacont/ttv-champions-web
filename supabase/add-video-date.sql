-- Add video_date column to video_analyses table
-- This stores the date when the video was recorded (as opposed to when it was uploaded)
-- Falls back to created_at for old videos without a date

ALTER TABLE video_analyses ADD COLUMN IF NOT EXISTS video_date DATE;
