-- ============================================
-- UPDATE PRIVACY SETTINGS
-- Erweitere privacy_settings um friends_only Option
-- ============================================

-- Aktualisiere bestehende privacy_settings
-- Alte Struktur: {"searchable": true, "showElo": true}
-- Neue Struktur: {"searchable": "global", "showElo": true, "showInLeaderboards": true}

UPDATE profiles
SET privacy_settings = jsonb_build_object(
    'searchable',
    CASE
        -- Wenn searchable true ist -> 'global'
        WHEN (privacy_settings->>'searchable')::boolean = true THEN 'global'
        -- Wenn searchable false ist -> 'club_only'
        WHEN (privacy_settings->>'searchable')::boolean = false THEN 'club_only'
        -- Falls schon ein String ist, behalten
        WHEN privacy_settings->>'searchable' IN ('global', 'club_only', 'friends_only', 'none') THEN privacy_settings->>'searchable'
        -- Default
        ELSE 'global'
    END,
    'showElo',
    COALESCE((privacy_settings->>'showElo')::boolean, true),
    'showInLeaderboards',
    COALESCE((privacy_settings->>'showInLeaderboards')::boolean, true)
)
WHERE privacy_settings IS NOT NULL;

-- Für Profile ohne privacy_settings (sollte nicht vorkommen, aber sicher ist sicher)
UPDATE profiles
SET privacy_settings = jsonb_build_object(
    'searchable', 'global',
    'showElo', true,
    'showInLeaderboards', true
)
WHERE privacy_settings IS NULL;

-- Kommentar: Mögliche Werte für searchable:
-- 'global': Alle können dich finden
-- 'club_only': Nur Vereinsmitglieder können dich finden
-- 'friends_only': Nur Freunde können dich finden
-- 'none': Niemand kann dich finden (unsichtbar)
