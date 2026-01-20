-- ============================================
-- RLS Policies für Labeler-Rolle
-- ============================================
-- Labeler können alle Videos mit allow_ai_training=true sehen
-- Run this in Supabase SQL Editor AFTER adding the labeler role

-- ============================================
-- 1. UPDATE video_analyses SELECT policy
-- ============================================
-- Bestehende Policy droppen und neu erstellen mit Labeler-Zugriff

DROP POLICY IF EXISTS "video_analyses_select" ON video_analyses;

CREATE POLICY "video_analyses_select" ON video_analyses
    FOR SELECT USING (
        -- Eigene Videos
        uploaded_by = auth.uid()
        OR
        -- Zugewiesene Videos
        EXISTS (
            SELECT 1 FROM video_assignments va
            WHERE va.video_id = id AND va.player_id = auth.uid()
        )
        OR
        -- Coach/Admin sieht alle Videos im eigenen Club
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_analyses.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
        OR
        -- Labeler sieht alle Videos mit allow_ai_training = true
        (
            allow_ai_training = true
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'labeler'
            )
        )
        OR
        -- Admin sieht ALLE Videos mit allow_ai_training = true (auch ohne Club)
        (
            allow_ai_training = true
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'admin'
            )
        )
    );

-- ============================================
-- 2. Labeler kann video_analyses updaten (nur ai_ready Feld)
-- ============================================
-- Bestehende Policy erweitern

DROP POLICY IF EXISTS "video_analyses_update" ON video_analyses;

CREATE POLICY "video_analyses_update" ON video_analyses
    FOR UPDATE USING (
        uploaded_by = auth.uid()
        OR
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.club_id = video_analyses.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
        OR
        -- Labeler kann Videos mit allow_ai_training=true updaten (für ai_ready)
        (
            allow_ai_training = true
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'labeler'
            )
        )
        OR
        -- Admin kann ALLE Videos mit allow_ai_training=true updaten
        (
            allow_ai_training = true
            AND EXISTS (
                SELECT 1 FROM profiles p
                WHERE p.id = auth.uid()
                AND p.role = 'admin'
            )
        )
    );

-- ============================================
-- 3. video_comments SELECT für Labeler
-- ============================================

DROP POLICY IF EXISTS "video_comments_select" ON video_comments;

CREATE POLICY "video_comments_select" ON video_comments
    FOR SELECT USING (
        -- User kann Kommentare zu eigenen Videos sehen
        EXISTS (
            SELECT 1 FROM video_analyses va
            WHERE va.id = video_comments.video_id
            AND va.uploaded_by = auth.uid()
        )
        OR
        -- User kann Kommentare zu zugewiesenen Videos sehen
        EXISTS (
            SELECT 1 FROM video_assignments vas
            WHERE vas.video_id = video_comments.video_id
            AND vas.player_id = auth.uid()
        )
        OR
        -- Coach kann alle Kommentare im Club sehen
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_comments.video_id
            AND va.club_id = p.club_id
            AND p.role IN ('coach', 'admin', 'head_coach')
        )
        OR
        -- Eigene Kommentare
        user_id = auth.uid()
        OR
        -- Labeler sieht Kommentare zu Videos mit allow_ai_training=true
        EXISTS (
            SELECT 1 FROM video_analyses va
            JOIN profiles p ON p.id = auth.uid()
            WHERE va.id = video_comments.video_id
            AND va.allow_ai_training = true
            AND p.role = 'labeler'
        )
    );

-- ============================================
-- 4. video_labels Policies für Labeler
-- ============================================

-- SELECT: Labeler und Admins können Labels sehen
DROP POLICY IF EXISTS "video_labels_select" ON video_labels;

CREATE POLICY "video_labels_select" ON video_labels
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'labeler')
        )
    );

-- INSERT: Labeler und Admins können Labels erstellen
DROP POLICY IF EXISTS "video_labels_insert" ON video_labels;

CREATE POLICY "video_labels_insert" ON video_labels
    FOR INSERT WITH CHECK (
        labeled_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role IN ('admin', 'labeler')
        )
    );

-- UPDATE: Nur eigene Labels oder Admin
DROP POLICY IF EXISTS "video_labels_update" ON video_labels;

CREATE POLICY "video_labels_update" ON video_labels
    FOR UPDATE USING (
        labeled_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- DELETE: Nur eigene Labels oder Admin
DROP POLICY IF EXISTS "video_labels_delete" ON video_labels;

CREATE POLICY "video_labels_delete" ON video_labels
    FOR DELETE USING (
        labeled_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
    );

-- ============================================
-- 5. Verify
-- ============================================
SELECT 'Labeler RLS policies created successfully' AS status;
