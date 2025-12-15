# Supabase Database Setup Guide

This guide will help you set up all the database tables, functions, and storage for the SC Champions application.

## Prerequisites

- Access to your Supabase project dashboard
- SQL Editor access in Supabase

## Setup Order

Run these migrations in the following order:

### 1. Activity Likes Extended Schema

**File:** `activity-likes-extended.sql`

This migration:
- Creates the new `activity_likes` table supporting all activity types
- Migrates data from old `match_likes` table (if it exists)
- Creates RPC functions for toggling likes and batch loading

**How to run:**
1. Open Supabase Dashboard > SQL Editor
2. Copy the entire contents of `activity-likes-extended.sql`
3. Paste and run

### 2. Activity Comments Schema

**File:** `activity-comments.sql`

This migration:
- Creates the `activity_comments` table
- Sets up RLS policies for comments
- Creates RPC functions for managing comments

**How to run:**
1. Open Supabase Dashboard > SQL Editor
2. Copy the entire contents of `activity-comments.sql`
3. Paste and run

### 3. Match Media Schema

**File:** `match-media.sql`

This migration:
- Creates the `match_media` table for storing file metadata
- Sets up RLS policies (only participants can upload)
- Creates RPC functions for managing match media

**How to run:**
1. Open Supabase Dashboard > SQL Editor
2. Copy the entire contents of `match-media.sql`
3. Paste and run

### 4. Storage Bucket Setup

**File:** `storage-match-media.sql`

⚠️ **IMPORTANT:** Storage policies MUST be created through the Supabase Dashboard UI, not via SQL.

#### Step A: Create the Bucket (SQL)

1. Open Supabase Dashboard > SQL Editor
2. Run only this part of `storage-match-media.sql`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('match-media', 'match-media', true)
ON CONFLICT (id) DO NOTHING;
```

#### Step B: Create Storage Policies (Dashboard UI)

1. Go to: **Storage** > **match-media** bucket > **Policies** tab
2. Click **New Policy**

**Policy 1: Allow public read access**
- Name: `Allow public read access`
- Allowed operation: `SELECT`
- Policy definition: `true`
- Click **Review** then **Save policy**

**Policy 2: Allow authenticated users to upload**
- Name: `Allow authenticated users to upload`
- Allowed operation: `INSERT`
- Policy definition: `(auth.role() = 'authenticated')`
- Click **Review** then **Save policy**

**Policy 3: Allow users to delete own files**
- Name: `Allow users to delete own files`
- Allowed operation: `DELETE`
- Policy definition: `((storage.foldername(name))[1] = (auth.uid())::text)`
- Click **Review** then **Save policy**

## Verification

After running all migrations, verify the setup:

### Check Tables Exist

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('activity_likes', 'activity_comments', 'match_media');
```

Should return 3 rows.

### Check RPC Functions Exist

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'toggle_activity_like',
    'get_activity_likes_batch',
    'add_activity_comment',
    'get_activity_comments',
    'delete_activity_comment',
    'get_match_media',
    'can_upload_match_media',
    'delete_match_media'
);
```

Should return 8 rows.

### Check Storage Bucket Exists

Go to: **Storage** > You should see the `match-media` bucket listed.

## Troubleshooting

### Error: "must be owner of table objects"

This error occurs when trying to create storage policies via SQL. Follow **Step B** above to create policies through the Dashboard UI instead.

### Error: "relation already exists"

This is safe to ignore - it means the table/function already exists from a previous run.

### Error: "permission denied"

Make sure you're logged in to Supabase with the correct permissions. Some operations require admin access.

## File Upload Path Format

Files are stored in this format:
```
{user_id}/{match_type}/{match_id}/{filename}
```

Example:
```
abc123-def456/singles/match789/1234567890-xyz.jpg
```

This format allows users to easily delete their own uploads via RLS policies.

## Testing the Feature

After setup, test the feature:

1. Log in to your app
2. Play a match (singles or doubles)
3. View the match in the activity feed
4. Click the upload button (only visible to participants)
5. Upload a photo or video
6. Verify it appears in the activity feed
7. Click to open the gallery viewer

## Support

If you encounter issues not covered here, check:
- Supabase Dashboard > Logs
- Browser console for JavaScript errors
- Network tab for API errors
