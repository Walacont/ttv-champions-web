-- ============================================
-- Automatische Vorlaufzeit-Benachrichtigungen für wiederkehrende Veranstaltungen
--
-- Erstellt automatisch Einladungen und Push-Benachrichtigungen
-- wenn das Vorlaufzeit-Fenster einer wiederkehrenden Veranstaltung beginnt.
--
-- Beispiel: Event jeden Mittwoch, 3 Tage Vorlaufzeit
-- -> Jeden Sonntag wird automatisch eine Benachrichtigung verschickt
--
-- VORAUSSETZUNG: pg_cron Extension muss aktiviert sein
-- (Supabase Dashboard -> Database -> Extensions -> pg_cron)
-- ============================================

-- 1. Tracking-Spalte: Wann wurde die Vorlaufzeit-Benachrichtigung gesendet?
ALTER TABLE event_invitations
ADD COLUMN IF NOT EXISTS lead_time_notified_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================
-- 2. Hauptfunktion: Prüft und sendet Vorlaufzeit-Benachrichtigungen
-- ============================================
CREATE OR REPLACE FUNCTION check_and_send_lead_time_notifications()
RETURNS jsonb AS $$
DECLARE
    v_event RECORD;
    v_occurrence_date DATE;
    v_lead_time_start DATE;
    v_member RECORD;
    v_existing_inv RECORD;
    v_inv_id UUID;
    v_event_date_formatted TEXT;
    v_notifications_sent INTEGER := 0;
    v_invitations_created INTEGER := 0;
    v_today DATE := CURRENT_DATE;
    v_window_end DATE := CURRENT_DATE + INTERVAL '8 weeks';
BEGIN
    -- Alle wiederkehrenden Events mit Vorlaufzeit-Einstellung finden
    FOR v_event IN
        SELECT e.id, e.title, e.start_date, e.start_time, e.repeat_type,
               e.repeat_end_date, e.excluded_dates, e.club_id,
               e.target_type, e.target_subgroup_ids,
               e.invitation_lead_time_value, e.invitation_lead_time_unit,
               e.event_type
        FROM events e
        WHERE e.event_type = 'recurring'
          AND e.invitation_lead_time_value IS NOT NULL
          AND e.invitation_lead_time_unit IS NOT NULL
          AND e.repeat_type IS NOT NULL
          AND e.repeat_type != 'none'
          -- Event darf nicht abgelaufen sein
          AND (e.repeat_end_date IS NULL OR e.repeat_end_date >= v_today)
    LOOP
        -- Für jedes Event: Nächste Termine berechnen
        v_occurrence_date := v_event.start_date;

        -- Zum ersten Termin ab heute vorspulen
        WHILE v_occurrence_date < v_today LOOP
            v_occurrence_date := CASE v_event.repeat_type
                WHEN 'daily' THEN v_occurrence_date + INTERVAL '1 day'
                WHEN 'weekly' THEN v_occurrence_date + INTERVAL '7 days'
                WHEN 'biweekly' THEN v_occurrence_date + INTERVAL '14 days'
                WHEN 'monthly' THEN v_occurrence_date + INTERVAL '1 month'
                ELSE v_occurrence_date + INTERVAL '7 days'
            END;
        END LOOP;

        -- Termine innerhalb des Fensters durchgehen
        WHILE v_occurrence_date <= v_window_end LOOP
            -- Prüfen ob Datum nicht ausgeschlossen ist
            IF v_event.excluded_dates IS NULL
               OR NOT (v_occurrence_date::text = ANY(v_event.excluded_dates)) THEN

                -- Vorlaufzeit-Startdatum berechnen
                v_lead_time_start := CASE v_event.invitation_lead_time_unit
                    WHEN 'hours' THEN v_occurrence_date -- Bei Stunden: ab dem Tag selbst
                    WHEN 'days' THEN v_occurrence_date - (v_event.invitation_lead_time_value * INTERVAL '1 day')
                    WHEN 'weeks' THEN v_occurrence_date - (v_event.invitation_lead_time_value * 7 * INTERVAL '1 day')
                    ELSE v_occurrence_date - (v_event.invitation_lead_time_value * INTERVAL '1 day')
                END;

                -- Nur verarbeiten wenn wir im Vorlaufzeit-Fenster sind
                IF v_today >= v_lead_time_start AND v_occurrence_date >= v_today THEN

                    -- Datum formatieren für Benachrichtigungstext
                    v_event_date_formatted := to_char(v_occurrence_date, 'DD.MM.YYYY');

                    -- Relevante Club-Mitglieder finden
                    FOR v_member IN
                        SELECT p.id AS user_id
                        FROM profiles p
                        WHERE p.club_id = v_event.club_id
                          AND p.role = 'player'
                          AND (
                              v_event.target_type != 'subgroups'
                              OR v_event.target_subgroup_ids IS NULL
                              OR p.subgroup_ids::text[] && v_event.target_subgroup_ids::text[]
                          )
                    LOOP
                        -- Prüfen ob Einladung für diesen Termin existiert
                        SELECT id, status, lead_time_notified_at
                        INTO v_existing_inv
                        FROM event_invitations
                        WHERE event_id = v_event.id
                          AND user_id = v_member.user_id
                          AND occurrence_date = v_occurrence_date
                        LIMIT 1;

                        IF v_existing_inv IS NULL THEN
                            -- Einladung erstellen
                            INSERT INTO event_invitations (event_id, user_id, occurrence_date, status, created_at)
                            VALUES (v_event.id, v_member.user_id, v_occurrence_date, 'pending', NOW())
                            ON CONFLICT (event_id, user_id, occurrence_date) DO NOTHING
                            RETURNING id INTO v_inv_id;

                            v_invitations_created := v_invitations_created + 1;

                            -- Benachrichtigung erstellen (Trigger sendet Push automatisch)
                            INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
                            VALUES (
                                v_member.user_id,
                                'event_reminder',
                                v_event.title,
                                'Du wurdest zu "' || v_event.title || '" am ' || v_event_date_formatted || ' eingeladen. Bitte sage zu oder ab.',
                                jsonb_build_object('event_id', v_event.id, 'occurrence_date', v_occurrence_date::text),
                                false,
                                NOW()
                            );

                            -- Tracking-Spalte setzen
                            UPDATE event_invitations
                            SET lead_time_notified_at = NOW()
                            WHERE event_id = v_event.id
                              AND user_id = v_member.user_id
                              AND occurrence_date = v_occurrence_date;

                            v_notifications_sent := v_notifications_sent + 1;

                        ELSIF v_existing_inv.lead_time_notified_at IS NULL
                              AND v_existing_inv.status = 'pending' THEN
                            -- Einladung existiert aber noch keine Benachrichtigung gesendet
                            INSERT INTO notifications (user_id, type, title, message, data, is_read, created_at)
                            VALUES (
                                v_member.user_id,
                                'event_reminder',
                                v_event.title,
                                'Erinnerung: "' || v_event.title || '" am ' || v_event_date_formatted || '. Bitte sage zu oder ab.',
                                jsonb_build_object('event_id', v_event.id, 'occurrence_date', v_occurrence_date::text),
                                false,
                                NOW()
                            );

                            UPDATE event_invitations
                            SET lead_time_notified_at = NOW()
                            WHERE id = v_existing_inv.id;

                            v_notifications_sent := v_notifications_sent + 1;
                        END IF;
                        -- Wenn lead_time_notified_at gesetzt oder status != 'pending': überspringen

                    END LOOP; -- v_member
                END IF; -- im Vorlaufzeit-Fenster
            END IF; -- nicht ausgeschlossen

            -- Zum nächsten Termin
            v_occurrence_date := CASE v_event.repeat_type
                WHEN 'daily' THEN v_occurrence_date + INTERVAL '1 day'
                WHEN 'weekly' THEN v_occurrence_date + INTERVAL '7 days'
                WHEN 'biweekly' THEN v_occurrence_date + INTERVAL '14 days'
                WHEN 'monthly' THEN v_occurrence_date + INTERVAL '1 month'
                ELSE v_occurrence_date + INTERVAL '7 days'
            END;

            -- Repeat-End-Date prüfen
            IF v_event.repeat_end_date IS NOT NULL AND v_occurrence_date > v_event.repeat_end_date THEN
                EXIT;
            END IF;
        END LOOP; -- v_occurrence_date
    END LOOP; -- v_event

    RETURN jsonb_build_object(
        'invitations_created', v_invitations_created,
        'notifications_sent', v_notifications_sent,
        'checked_at', NOW()::text
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. pg_cron Schedule: Jede Stunde prüfen
-- ============================================
-- WICHTIG: pg_cron muss aktiviert sein!
-- Supabase Dashboard -> Database -> Extensions -> pg_cron aktivieren
--
-- Dann diesen Befehl ausführen:

-- Stündlich prüfen (Minute 0 jeder Stunde)
SELECT cron.schedule(
    'check-event-lead-time-notifications',
    '0 * * * *',
    $$SELECT check_and_send_lead_time_notifications()$$
);

-- ============================================
-- ALTERNATIVE: Täglich um 8:00 Uhr prüfen (weniger Last)
-- ============================================
-- SELECT cron.schedule(
--     'check-event-lead-time-notifications',
--     '0 8 * * *',
--     $$SELECT check_and_send_lead_time_notifications()$$
-- );

-- ============================================
-- NÜTZLICHE BEFEHLE
-- ============================================
-- Manuell ausführen (zum Testen):
-- SELECT check_and_send_lead_time_notifications();
--
-- Cron-Job Status prüfen:
-- SELECT * FROM cron.job;
--
-- Letzte Ausführungen anzeigen:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- Cron-Job deaktivieren:
-- SELECT cron.unschedule('check-event-lead-time-notifications');
