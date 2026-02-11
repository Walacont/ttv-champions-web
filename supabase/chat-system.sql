-- ============================================
-- CHAT SYSTEM (Nachrichten-System)
-- 1:1 Direktnachrichten + Gruppen-Chats
-- Mit Guardian-Sichtbarkeit für Minderjährige
-- ============================================

-- ============================================
-- TABLES
-- ============================================

-- Chat-Konversationen (Einzel & Gruppen)
CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
    name TEXT, -- Nur für Gruppen-Chats (z.B. "Trainingsgruppe A")
    club_id UUID REFERENCES clubs(id) ON DELETE SET NULL,
    subgroup_id UUID REFERENCES subgroups(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat-Teilnehmer
CREATE TABLE IF NOT EXISTS chat_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Chat-Nachrichten
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) <= 5000),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation ON chat_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_type ON chat_conversations(type);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_club ON chat_conversations(club_id) WHERE club_id IS NOT NULL;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON chat_conversations;
CREATE TRIGGER update_chat_conversations_updated_at
BEFORE UPDATE ON chat_conversations
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

-- Trigger: conversation.updated_at aktualisieren bei neuer Nachricht
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_conversation_on_message ON chat_messages;
CREATE TRIGGER trg_update_conversation_on_message
AFTER INSERT ON chat_messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_on_message();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Konversationen: Nur sichtbar für Teilnehmer
CREATE POLICY chat_conversations_select ON chat_conversations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM chat_participants cp
            WHERE cp.conversation_id = chat_conversations.id AND cp.user_id = (SELECT auth.uid())
        )
    );

-- Konversationen: Jeder authentifizierte Nutzer kann erstellen
CREATE POLICY chat_conversations_insert ON chat_conversations FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL AND created_by = (SELECT auth.uid()));

-- Konversationen: Nur Admin oder Ersteller kann updaten (Gruppenname etc.)
CREATE POLICY chat_conversations_update ON chat_conversations FOR UPDATE
    USING (
        created_by = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM chat_participants cp
            WHERE cp.conversation_id = chat_conversations.id AND cp.user_id = (SELECT auth.uid()) AND cp.role = 'admin'
        )
    );

-- Teilnehmer: Sichtbar für alle Teilnehmer derselben Konversation
CREATE POLICY chat_participants_select ON chat_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM chat_participants cp2
            WHERE cp2.conversation_id = conversation_id AND cp2.user_id = (SELECT auth.uid())
        )
    );

-- Teilnehmer: Ersteller/Admin kann Teilnehmer hinzufügen
CREATE POLICY chat_participants_insert ON chat_participants FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND (
            -- Sich selbst hinzufügen (beim Erstellen)
            user_id = (SELECT auth.uid())
            -- Oder Admin/Ersteller der Konversation
            OR EXISTS (
                SELECT 1 FROM chat_conversations cc
                WHERE cc.id = conversation_id AND cc.created_by = (SELECT auth.uid())
            )
            OR EXISTS (
                SELECT 1 FROM chat_participants cp
                WHERE cp.conversation_id = conversation_id AND cp.user_id = (SELECT auth.uid()) AND cp.role = 'admin'
            )
        )
    );

-- Teilnehmer: Selbst verlassen oder Admin kann entfernen
CREATE POLICY chat_participants_delete ON chat_participants FOR DELETE
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM chat_participants cp
            WHERE cp.conversation_id = conversation_id AND cp.user_id = (SELECT auth.uid()) AND cp.role = 'admin'
        )
    );

-- Nachrichten: Sichtbar für Teilnehmer der Konversation
CREATE POLICY chat_messages_select ON chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM chat_participants cp
            WHERE cp.conversation_id = conversation_id AND cp.user_id = (SELECT auth.uid())
        )
    );

-- Nachrichten: Nur Teilnehmer können senden
CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT
    WITH CHECK (
        sender_id = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM chat_participants cp
            WHERE cp.conversation_id = conversation_id AND cp.user_id = (SELECT auth.uid())
        )
    );

-- Nachrichten: Nur eigene Nachrichten bearbeiten
CREATE POLICY chat_messages_update ON chat_messages FOR UPDATE
    USING (sender_id = (SELECT auth.uid()));

-- Nachrichten: Nur eigene Nachrichten löschen
CREATE POLICY chat_messages_delete ON chat_messages FOR DELETE
    USING (sender_id = (SELECT auth.uid()));

-- ============================================
-- GUARDIAN-SICHTBARKEIT
-- Guardians können Chats ihrer Kinder einsehen
-- ============================================

-- Guardians sehen Konversationen ihrer Kinder
CREATE POLICY chat_conversations_guardian_select ON chat_conversations FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM guardian_links gl
            JOIN chat_participants cp ON cp.conversation_id = chat_conversations.id AND cp.user_id = gl.child_id
            WHERE gl.guardian_id = (SELECT auth.uid())
        )
    );

-- Guardians sehen Teilnehmer der Konversationen ihrer Kinder
CREATE POLICY chat_participants_guardian_select ON chat_participants FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM guardian_links gl
            JOIN chat_participants cp2 ON cp2.conversation_id = conversation_id AND cp2.user_id = gl.child_id
            WHERE gl.guardian_id = (SELECT auth.uid())
        )
    );

-- Guardians sehen Nachrichten der Konversationen ihrer Kinder
CREATE POLICY chat_messages_guardian_select ON chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM guardian_links gl
            JOIN chat_participants cp ON cp.conversation_id = conversation_id AND cp.user_id = gl.child_id
            WHERE gl.guardian_id = (SELECT auth.uid())
        )
    );

-- ============================================
-- REALTIME
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_participants;

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- 1. Direktchat finden oder erstellen
CREATE OR REPLACE FUNCTION get_or_create_direct_chat(
    current_user_id UUID,
    other_user_id UUID
)
RETURNS JSON AS $$
DECLARE
    existing_conversation_id UUID;
    new_conversation_id UUID;
BEGIN
    -- Kein Chat mit sich selbst
    IF current_user_id = other_user_id THEN
        RETURN json_build_object('success', false, 'error', 'Kein Chat mit dir selbst möglich');
    END IF;

    -- Existierenden Direktchat suchen
    SELECT cc.id INTO existing_conversation_id
    FROM chat_conversations cc
    WHERE cc.type = 'direct'
    AND EXISTS (
        SELECT 1 FROM chat_participants cp1
        WHERE cp1.conversation_id = cc.id AND cp1.user_id = current_user_id
    )
    AND EXISTS (
        SELECT 1 FROM chat_participants cp2
        WHERE cp2.conversation_id = cc.id AND cp2.user_id = other_user_id
    )
    LIMIT 1;

    IF existing_conversation_id IS NOT NULL THEN
        RETURN json_build_object('success', true, 'conversation_id', existing_conversation_id, 'created', false);
    END IF;

    -- Neuen Direktchat erstellen
    INSERT INTO chat_conversations (type, created_by)
    VALUES ('direct', current_user_id)
    RETURNING id INTO new_conversation_id;

    -- Beide Teilnehmer hinzufügen
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES
        (new_conversation_id, current_user_id, 'member'),
        (new_conversation_id, other_user_id, 'member');

    RETURN json_build_object('success', true, 'conversation_id', new_conversation_id, 'created', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Gruppen-Chat erstellen
CREATE OR REPLACE FUNCTION create_group_chat(
    current_user_id UUID,
    group_name TEXT,
    member_ids UUID[],
    p_club_id UUID DEFAULT NULL,
    p_subgroup_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    new_conversation_id UUID;
    member_id UUID;
BEGIN
    -- Validierung
    IF group_name IS NULL OR char_length(trim(group_name)) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Gruppenname ist erforderlich');
    END IF;

    IF array_length(member_ids, 1) IS NULL OR array_length(member_ids, 1) < 1 THEN
        RETURN json_build_object('success', false, 'error', 'Mindestens ein Mitglied erforderlich');
    END IF;

    -- Gruppen-Chat erstellen
    INSERT INTO chat_conversations (type, name, club_id, subgroup_id, created_by)
    VALUES ('group', trim(group_name), p_club_id, p_subgroup_id, current_user_id)
    RETURNING id INTO new_conversation_id;

    -- Ersteller als Admin hinzufügen
    INSERT INTO chat_participants (conversation_id, user_id, role)
    VALUES (new_conversation_id, current_user_id, 'admin');

    -- Mitglieder hinzufügen
    FOREACH member_id IN ARRAY member_ids LOOP
        IF member_id != current_user_id THEN
            INSERT INTO chat_participants (conversation_id, user_id, role)
            VALUES (new_conversation_id, member_id, 'member')
            ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END IF;
    END LOOP;

    RETURN json_build_object('success', true, 'conversation_id', new_conversation_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Konversationen mit letzter Nachricht laden
CREATE OR REPLACE FUNCTION get_my_conversations(current_user_id UUID)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    club_id UUID,
    subgroup_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_message_content TEXT,
    last_message_sender_id UUID,
    last_message_sender_name TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count BIGINT,
    participant_ids UUID[],
    participant_names TEXT[],
    participant_avatars TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cc.id AS conversation_id,
        cc.type AS conversation_type,
        cc.name AS conversation_name,
        cc.club_id,
        cc.subgroup_id,
        cc.created_at,
        cc.updated_at,
        lm.content AS last_message_content,
        lm.sender_id AS last_message_sender_id,
        (SELECT p.first_name || ' ' || p.last_name FROM profiles p WHERE p.id = lm.sender_id) AS last_message_sender_name,
        lm.created_at AS last_message_at,
        -- Ungelesene Nachrichten zählen
        (
            SELECT COUNT(*)::BIGINT FROM chat_messages cm
            WHERE cm.conversation_id = cc.id
            AND cm.created_at > COALESCE(my_cp.last_read_at, '1970-01-01'::timestamptz)
            AND cm.sender_id != current_user_id
        ) AS unread_count,
        -- Teilnehmer-IDs (ohne aktuellen User)
        (
            SELECT ARRAY_AGG(cp3.user_id)
            FROM chat_participants cp3
            WHERE cp3.conversation_id = cc.id AND cp3.user_id != current_user_id
        ) AS participant_ids,
        -- Teilnehmer-Namen (ohne aktuellen User)
        (
            SELECT ARRAY_AGG(p2.first_name || ' ' || p2.last_name)
            FROM chat_participants cp4
            JOIN profiles p2 ON p2.id = cp4.user_id
            WHERE cp4.conversation_id = cc.id AND cp4.user_id != current_user_id
        ) AS participant_names,
        -- Teilnehmer-Avatare (ohne aktuellen User)
        (
            SELECT ARRAY_AGG(COALESCE(p3.avatar_url, ''))
            FROM chat_participants cp5
            JOIN profiles p3 ON p3.id = cp5.user_id
            WHERE cp5.conversation_id = cc.id AND cp5.user_id != current_user_id
        ) AS participant_avatars
    FROM chat_conversations cc
    JOIN chat_participants my_cp ON my_cp.conversation_id = cc.id AND my_cp.user_id = current_user_id
    -- Letzte Nachricht per LATERAL Join
    LEFT JOIN LATERAL (
        SELECT cm.content, cm.sender_id, cm.created_at
        FROM chat_messages cm
        WHERE cm.conversation_id = cc.id
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) lm ON true
    ORDER BY COALESCE(lm.created_at, cc.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Nachrichten einer Konversation laden (paginiert)
CREATE OR REPLACE FUNCTION get_conversation_messages(
    current_user_id UUID,
    p_conversation_id UUID,
    p_limit INT DEFAULT 50,
    p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    message_id UUID,
    sender_id UUID,
    sender_name TEXT,
    sender_avatar TEXT,
    content TEXT,
    created_at TIMESTAMPTZ,
    edited_at TIMESTAMPTZ,
    is_own BOOLEAN
) AS $$
BEGIN
    -- Prüfe ob User Teilnehmer ist
    IF NOT EXISTS (
        SELECT 1 FROM chat_participants cp
        WHERE cp.conversation_id = p_conversation_id AND cp.user_id = current_user_id
    ) THEN
        RETURN; -- Leeres Ergebnis
    END IF;

    -- last_read_at aktualisieren
    UPDATE chat_participants
    SET last_read_at = NOW()
    WHERE conversation_id = p_conversation_id AND user_id = current_user_id;

    RETURN QUERY
    SELECT
        cm.id AS message_id,
        cm.sender_id,
        (p.first_name || ' ' || p.last_name) AS sender_name,
        COALESCE(p.avatar_url, '') AS sender_avatar,
        cm.content,
        cm.created_at,
        cm.edited_at,
        (cm.sender_id = current_user_id) AS is_own
    FROM chat_messages cm
    JOIN profiles p ON p.id = cm.sender_id
    WHERE cm.conversation_id = p_conversation_id
    AND (p_before IS NULL OR cm.created_at < p_before)
    ORDER BY cm.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Guardian: Chats der Kinder einsehen
CREATE OR REPLACE FUNCTION get_child_conversations(
    guardian_user_id UUID,
    child_user_id UUID
)
RETURNS TABLE (
    conversation_id UUID,
    conversation_type TEXT,
    conversation_name TEXT,
    last_message_content TEXT,
    last_message_sender_name TEXT,
    last_message_at TIMESTAMPTZ,
    participant_names TEXT[]
) AS $$
BEGIN
    -- Prüfe ob Guardian-Beziehung existiert
    IF NOT EXISTS (
        SELECT 1 FROM guardian_links gl
        WHERE gl.guardian_id = guardian_user_id AND gl.child_id = child_user_id
    ) THEN
        RETURN; -- Kein Zugriff
    END IF;

    RETURN QUERY
    SELECT
        cc.id AS conversation_id,
        cc.type AS conversation_type,
        cc.name AS conversation_name,
        lm.content AS last_message_content,
        (SELECT p.first_name || ' ' || p.last_name FROM profiles p WHERE p.id = lm.sender_id) AS last_message_sender_name,
        lm.created_at AS last_message_at,
        (
            SELECT ARRAY_AGG(p2.first_name || ' ' || p2.last_name)
            FROM chat_participants cp2
            JOIN profiles p2 ON p2.id = cp2.user_id
            WHERE cp2.conversation_id = cc.id
        ) AS participant_names
    FROM chat_conversations cc
    JOIN chat_participants cp ON cp.conversation_id = cc.id AND cp.user_id = child_user_id
    LEFT JOIN LATERAL (
        SELECT cm.content, cm.sender_id, cm.created_at
        FROM chat_messages cm
        WHERE cm.conversation_id = cc.id
        ORDER BY cm.created_at DESC
        LIMIT 1
    ) lm ON true
    ORDER BY COALESCE(lm.created_at, cc.created_at) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Ungelesene Nachrichten insgesamt zählen
CREATE OR REPLACE FUNCTION get_total_unread_count(current_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
    total BIGINT;
BEGIN
    SELECT COALESCE(SUM(
        (SELECT COUNT(*) FROM chat_messages cm
         WHERE cm.conversation_id = cp.conversation_id
         AND cm.created_at > COALESCE(cp.last_read_at, '1970-01-01'::timestamptz)
         AND cm.sender_id != current_user_id)
    ), 0) INTO total
    FROM chat_participants cp
    WHERE cp.user_id = current_user_id;

    RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
