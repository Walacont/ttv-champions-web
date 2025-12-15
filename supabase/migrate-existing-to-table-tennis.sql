-- ============================================
-- MIGRATION: Alle existierenden Spieler und Übungen zu Tischtennis zuordnen
-- ============================================

-- Zuerst: Tischtennis Sport-ID holen
DO $$
DECLARE
    v_table_tennis_id UUID;
BEGIN
    -- Tischtennis Sport-ID finden
    SELECT id INTO v_table_tennis_id FROM sports WHERE name = 'table_tennis';

    IF v_table_tennis_id IS NULL THEN
        RAISE EXCEPTION 'Tischtennis Sport nicht gefunden!';
    END IF;

    RAISE NOTICE 'Tischtennis Sport-ID: %', v_table_tennis_id;

    -- ============================================
    -- 1. Alle Clubs bekommen Tischtennis als Sparte
    -- ============================================
    INSERT INTO club_sports (club_id, sport_id, is_active)
    SELECT DISTINCT c.id, v_table_tennis_id, true
    FROM clubs c
    WHERE NOT EXISTS (
        SELECT 1 FROM club_sports cs
        WHERE cs.club_id = c.id AND cs.sport_id = v_table_tennis_id
    );

    RAISE NOTICE 'Club-Sports erstellt für alle Clubs';

    -- ============================================
    -- 2. Alle Spieler in profile_club_sports eintragen
    -- HINWEIS: Admins werden NICHT eingetragen (bleiben global admin)
    -- HINWEIS: Coaches werden als 'coach' eingetragen, NICHT als head_coach
    --          Head_coaches müssen manuell gesetzt werden!
    -- ============================================
    INSERT INTO profile_club_sports (user_id, club_id, sport_id, role)
    SELECT
        p.id,
        p.club_id,
        v_table_tennis_id,
        CASE
            WHEN p.role = 'coach' THEN 'coach'  -- Coaches bleiben Coaches (head_coach manuell setzen!)
            ELSE 'player'
        END
    FROM profiles p
    WHERE p.club_id IS NOT NULL
    AND p.role != 'admin'  -- Admins nicht eintragen, bleiben global admin
    AND NOT EXISTS (
        SELECT 1 FROM profile_club_sports pcs
        WHERE pcs.user_id = p.id
        AND pcs.club_id = p.club_id
        AND pcs.sport_id = v_table_tennis_id
    );

    RAISE NOTICE 'Alle Spieler zu Tischtennis-Sparte hinzugefügt (Coaches müssen manuell zu head_coach befördert werden)';

    -- ============================================
    -- 3. Alle Übungen auf Tischtennis setzen
    -- ============================================
    UPDATE exercises
    SET sport_id = v_table_tennis_id
    WHERE sport_id IS NULL;

    RAISE NOTICE 'Alle Übungen auf Tischtennis gesetzt';

    -- ============================================
    -- 4. Alle Matches auf Tischtennis setzen
    -- ============================================
    UPDATE matches
    SET sport_id = v_table_tennis_id
    WHERE sport_id IS NULL;

    RAISE NOTICE 'Alle Matches auf Tischtennis gesetzt';

    -- ============================================
    -- 5. Alle Doubles Matches auf Tischtennis setzen
    -- ============================================
    UPDATE doubles_matches
    SET sport_id = v_table_tennis_id
    WHERE sport_id IS NULL;

    RAISE NOTICE 'Alle Doppel-Matches auf Tischtennis gesetzt';

    -- ============================================
    -- 6. Alle Challenges auf Tischtennis setzen
    -- ============================================
    UPDATE challenges
    SET sport_id = v_table_tennis_id
    WHERE sport_id IS NULL;

    RAISE NOTICE 'Alle Challenges auf Tischtennis gesetzt';

    -- ============================================
    -- 7. Alle Subgroups auf Tischtennis setzen
    -- ============================================
    UPDATE subgroups
    SET sport_id = v_table_tennis_id
    WHERE sport_id IS NULL;

    RAISE NOTICE 'Alle Subgroups auf Tischtennis gesetzt';

    -- ============================================
    -- 8. Alle Training Sessions auf Tischtennis setzen
    -- ============================================
    UPDATE training_sessions
    SET sport_id = v_table_tennis_id
    WHERE sport_id IS NULL;

    RAISE NOTICE 'Alle Training Sessions auf Tischtennis gesetzt';

END $$;

-- ============================================
-- VERIFICATION: Überprüfen was migriert wurde
-- ============================================
SELECT 'Clubs mit Tischtennis' as info, COUNT(*) as anzahl
FROM club_sports cs
JOIN sports s ON s.id = cs.sport_id
WHERE s.name = 'table_tennis';

SELECT 'Spieler in Tischtennis-Sparte' as info, COUNT(*) as anzahl
FROM profile_club_sports pcs
JOIN sports s ON s.id = pcs.sport_id
WHERE s.name = 'table_tennis';

SELECT 'Übungen mit Tischtennis' as info, COUNT(*) as anzahl
FROM exercises e
JOIN sports s ON s.id = e.sport_id
WHERE s.name = 'table_tennis';

SELECT 'Matches mit Tischtennis' as info, COUNT(*) as anzahl
FROM matches m
JOIN sports s ON s.id = m.sport_id
WHERE s.name = 'table_tennis';
