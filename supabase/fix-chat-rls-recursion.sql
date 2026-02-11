-- ============================================
-- FIX CHAT RLS INFINITE RECURSION
-- ============================================
-- The chat_participants policies cause infinite recursion because they query
-- chat_participants within their own RLS checks. This follows the same pattern
-- used in fix-profiles-rls-recursion.sql: SECURITY DEFINER functions bypass RLS.

-- ============================================
-- STEP 1: Create helper functions (SECURITY DEFINER)
-- ============================================

-- Check if the current user is a participant of a conversation
CREATE OR REPLACE FUNCTION public.is_chat_participant(p_conversation_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  );
$$;

-- Check if the current user is an admin of a conversation
CREATE OR REPLACE FUNCTION public.is_chat_admin(p_conversation_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- Check if the current user is a guardian of any participant in a conversation
CREATE OR REPLACE FUNCTION public.is_guardian_of_participant(p_conversation_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM guardian_links gl
    JOIN chat_participants cp ON cp.conversation_id = p_conversation_id AND cp.user_id = gl.child_id
    WHERE gl.guardian_id = auth.uid()
  );
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_chat_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_chat_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_guardian_of_participant(UUID) TO authenticated;

-- ============================================
-- STEP 2: Drop and recreate all affected policies
-- ============================================

-- --- chat_conversations policies ---

DROP POLICY IF EXISTS chat_conversations_select ON chat_conversations;
CREATE POLICY chat_conversations_select ON chat_conversations FOR SELECT
    USING (public.is_chat_participant(chat_conversations.id));

DROP POLICY IF EXISTS chat_conversations_update ON chat_conversations;
CREATE POLICY chat_conversations_update ON chat_conversations FOR UPDATE
    USING (
        created_by = (SELECT auth.uid())
        OR public.is_chat_admin(chat_conversations.id)
    );

-- --- chat_participants policies ---

DROP POLICY IF EXISTS chat_participants_select ON chat_participants;
CREATE POLICY chat_participants_select ON chat_participants FOR SELECT
    USING (public.is_chat_participant(conversation_id));

DROP POLICY IF EXISTS chat_participants_insert ON chat_participants;
CREATE POLICY chat_participants_insert ON chat_participants FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            -- Sich selbst hinzufügen (beim Erstellen)
            user_id = (SELECT auth.uid())
            -- Oder Ersteller der Konversation
            OR EXISTS (
                SELECT 1 FROM chat_conversations cc
                WHERE cc.id = conversation_id AND cc.created_by = (SELECT auth.uid())
            )
            -- Oder Admin der Konversation
            OR public.is_chat_admin(conversation_id)
        )
    );

DROP POLICY IF EXISTS chat_participants_delete ON chat_participants;
CREATE POLICY chat_participants_delete ON chat_participants FOR DELETE
    USING (
        user_id = (SELECT auth.uid())
        OR public.is_chat_admin(conversation_id)
    );

-- --- chat_messages policies ---

DROP POLICY IF EXISTS chat_messages_select ON chat_messages;
CREATE POLICY chat_messages_select ON chat_messages FOR SELECT
    USING (public.is_chat_participant(conversation_id));

DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT
    WITH CHECK (
        sender_id = (SELECT auth.uid())
        AND public.is_chat_participant(conversation_id)
    );

-- --- Guardian policies ---

DROP POLICY IF EXISTS chat_conversations_guardian_select ON chat_conversations;
CREATE POLICY chat_conversations_guardian_select ON chat_conversations FOR SELECT
    USING (public.is_guardian_of_participant(chat_conversations.id));

DROP POLICY IF EXISTS chat_participants_guardian_select ON chat_participants;
CREATE POLICY chat_participants_guardian_select ON chat_participants FOR SELECT
    USING (public.is_guardian_of_participant(conversation_id));

DROP POLICY IF EXISTS chat_messages_guardian_select ON chat_messages;
CREATE POLICY chat_messages_guardian_select ON chat_messages FOR SELECT
    USING (public.is_guardian_of_participant(conversation_id));
