/**
 * Anwesenheits-Export Modul (Supabase Version)
 * Exportiert Anwesenheitsdaten ins Excel-Format
 */

/**
 * Berechnet die Dauer zwischen zwei Zeitangaben
 * @param {string} startTime - Startzeit im Format HH:MM
 * @param {string} endTime - Endzeit im Format HH:MM
 * @returns {number} Dauer in Stunden (z.B. 2.0)
 */
function calculateSessionDuration(startTime, endTime) {
    try {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const startTotalMinutes = startHour * 60 + startMinute;
        const endTotalMinutes = endHour * 60 + endMinute;

        const durationMinutes = endTotalMinutes - startTotalMinutes;
        const durationHours = durationMinutes / 60;

        return Math.round(durationHours * 10) / 10;
    } catch (error) {
        console.error('Error calculating session duration:', error);
        return 2.0; // Standard-Fallback: 2 Stunden
    }
}

/**
 * Exportiert Anwesenheitsdaten für einen Monat ins Excel-Format
 * @param {Object} supabase - Supabase Client-Instanz
 * @param {string} clubId - Verein-ID
 * @param {Date} date - Der zu exportierende Monat
 * @param {string} subgroupFilter - Untergruppen-ID oder 'all'
 */
export async function exportAttendanceToExcel(supabase, clubId, date, subgroupFilter = 'all') {
    if (window.trackEvent) window.trackEvent('attendance_export');
    try {
        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');

        const year = date.getFullYear();
        const month = date.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        console.log(`[Export] Loading attendance data for ${year}-${month + 1}`);

        // Untergruppen laden für Namens-Mapping
        const { data: subgroupsData, error: subgroupsError } = await supabase
            .from('subgroups')
            .select('id, name')
            .eq('club_id', clubId);

        if (subgroupsError) throw subgroupsError;

        const subgroupsMap = new Map();
        (subgroupsData || []).forEach(sg => {
            subgroupsMap.set(sg.id, sg.name || sg.id);
        });

        let sessionsQuery = supabase
            .from('training_sessions')
            .select('*')
            .eq('club_id', clubId)
            .or('cancelled.eq.false,cancelled.is.null')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (subgroupFilter !== 'all') {
            sessionsQuery = sessionsQuery.eq('subgroup_id', subgroupFilter);
        }

        const { data: sessionsData, error: sessionsError } = await sessionsQuery;
        if (sessionsError) throw sessionsError;

        const sessions = (sessionsData || []).map(s => ({
            id: s.id,
            date: s.date,
            startTime: s.start_time,
            endTime: s.end_time,
            subgroupId: s.subgroup_id,
            clubId: s.club_id,
            cancelled: s.cancelled
        }));

        console.log(`[Export] Loaded ${sessions.length} training sessions`);

        // Events (neues System) laden - Einzel-Events UND wiederkehrende Events
        const { data: singleEventsData } = await supabase
            .from('events')
            .select('id, title, start_date, start_time, end_time, target_subgroup_ids, event_category, event_type')
            .eq('club_id', clubId)
            .or('cancelled.eq.false,cancelled.is.null')
            .or('event_type.eq.single,event_type.is.null')
            .gte('start_date', startDate)
            .lte('start_date', endDate)
            .order('start_date', { ascending: true });

        // Wiederkehrende Events laden (start_date kann VOR dem Monat liegen!)
        const { data: recurringEventsData } = await supabase
            .from('events')
            .select('id, title, start_date, start_time, end_time, target_subgroup_ids, event_category, event_type, repeat_type, repeat_end_date, excluded_dates')
            .eq('club_id', clubId)
            .or('cancelled.eq.false,cancelled.is.null')
            .eq('event_type', 'recurring')
            .lte('start_date', endDate)
            .or(`repeat_end_date.gte.${startDate},repeat_end_date.is.null`);

        // Einzel-Events direkt übernehmen
        const events = (singleEventsData || []).map(e => ({
            id: e.id,
            date: e.start_date,
            startTime: e.start_time || '18:00',
            endTime: e.end_time || '20:00',
            title: e.title,
            subgroupId: e.target_subgroup_ids?.[0] || null,
            isEvent: true,
            occurrenceDate: e.start_date
        }));

        // Wiederkehrende Events in einzelne Vorkommnisse pro Monatstag expandieren
        (recurringEventsData || []).forEach(e => {
            const eventStartDate = new Date(e.start_date + 'T12:00:00');
            const monthStart = new Date(startDate + 'T12:00:00');
            const monthEnd = new Date(endDate + 'T12:00:00');
            const repeatEndDate = e.repeat_end_date ? new Date(e.repeat_end_date + 'T12:00:00') : null;
            const excludedDates = e.excluded_dates || [];
            const eventDayOfWeek = eventStartDate.getDay();

            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                if (d < eventStartDate) continue;
                if (repeatEndDate && d > repeatEndDate) continue;

                const currentDateString = d.toISOString().split('T')[0];
                if (excludedDates.includes(currentDateString)) continue;

                let matches = false;
                if (e.repeat_type === 'weekly') {
                    matches = d.getDay() === eventDayOfWeek;
                } else if (e.repeat_type === 'daily') {
                    matches = true;
                } else if (e.repeat_type === 'monthly') {
                    matches = d.getDate() === eventStartDate.getDate();
                }

                if (matches) {
                    events.push({
                        id: e.id,
                        date: currentDateString,
                        startTime: e.start_time || '18:00',
                        endTime: e.end_time || '20:00',
                        title: e.title,
                        subgroupId: e.target_subgroup_ids?.[0] || null,
                        isEvent: true,
                        occurrenceDate: currentDateString
                    });
                }
            }
        });

        // Events als zusätzliche Sessions behandeln
        sessions.push(...events);
        sessions.sort((a, b) => a.date.localeCompare(b.date));

        console.log(`[Export] Total sessions including events: ${sessions.length}`);

        // Wiederkehrende Event-IDs ermitteln (haben mehrere Vorkommnisse im Monat)
        const eventIdOccurrenceCount = new Map();
        events.forEach(e => {
            eventIdOccurrenceCount.set(e.id, (eventIdOccurrenceCount.get(e.id) || 0) + 1);
        });
        const recurringEventIds = new Set(
            [...eventIdOccurrenceCount.entries()]
                .filter(([, count]) => count > 1)
                .map(([id]) => id)
        );

        // Event-Attendance laden (mit occurrence_date für wiederkehrende Events)
        // Nur Attendance-Records laden, deren Datum im Exportmonat liegt
        const allEventIds = [...new Set(events.map(e => e.id))];
        const validOccurrenceDates = new Set(events.map(e => e.occurrenceDate));
        let eventAttendanceMap = new Map();
        if (allEventIds.length > 0) {
            const { data: eventAttendanceData } = await supabase
                .from('event_attendance')
                .select('event_id, occurrence_date, present_user_ids, coach_hours')
                .in('event_id', allEventIds);

            (eventAttendanceData || []).forEach(ea => {
                const occDate = ea.occurrence_date || null;

                // Nur Records berücksichtigen, die zu einem Vorkommnis im Exportmonat gehören
                if (occDate && !validOccurrenceDates.has(occDate)) return;

                // Key: event_id + occurrence_date (für wiederkehrende Events)
                const key = occDate ? `${ea.event_id}_${occDate}` : ea.event_id;
                eventAttendanceMap.set(key, {
                    presentPlayerIds: ea.present_user_ids || [],
                    coachHours: ea.coach_hours || {}
                });
            });
        }

        let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('club_id', clubId)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (subgroupFilter !== 'all') {
            attendanceQuery = attendanceQuery.eq('subgroup_id', subgroupFilter);
        }

        const { data: attendanceData, error: attendanceError } = await attendanceQuery;
        if (attendanceError) throw attendanceError;

        const attendanceRecords = new Map();
        (attendanceData || []).forEach(a => {
            const key = `${a.date}_${a.session_id || a.subgroup_id}`;
            attendanceRecords.set(key, {
                date: a.date,
                sessionId: a.session_id,
                subgroupId: a.subgroup_id,
                presentPlayerIds: a.present_player_ids || [],
                coaches: a.coaches || [],
                coachIds: a.coach_ids || [],
                coachId: a.coach_id
            });
        });

        console.log(`[Export] Loaded ${attendanceRecords.size} attendance records`);

        const { data: playersData, error: playersError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, subgroup_ids')
            .eq('club_id', clubId)
            .eq('role', 'player')
            .order('last_name', { ascending: true });

        if (playersError) throw playersError;

        const players = (playersData || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            subgroupIDs: p.subgroup_ids || []
        }));

        // Trainer laden für Namens-Mapping und Tracking (inkl. Cheftrainer)
        const { data: coachesData, error: coachesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('club_id', clubId)
            .in('role', ['coach', 'head_coach'])
            .order('last_name', { ascending: true });

        if (coachesError) throw coachesError;

        const coachesMap = new Map();
        const allCoaches = [];
        (coachesData || []).forEach(c => {
            coachesMap.set(c.id, `${c.first_name} ${c.last_name}`);
            allCoaches.push({
                id: c.id,
                firstName: c.first_name || '',
                lastName: c.last_name || '',
            });
        });

        console.log(`[Export] Loaded ${players.length} players`);

        let filteredPlayers = players;
        if (subgroupFilter !== 'all') {
            filteredPlayers = players.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(subgroupFilter)
            );
        }

        // Spieler nach Untergruppen gruppieren, um alle relevanten Spieler zu erfassen
        const allRelevantPlayers = new Set();
        for (const session of sessions) {
            const sessionPlayers = filteredPlayers.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(session.subgroupId)
            );
            sessionPlayers.forEach(p => allRelevantPlayers.add(p.id));
        }

        // Nur Spieler einbeziehen, die an mindestens einem Training teilgenommen haben könnten
        const playersList = filteredPlayers
            .filter(p => allRelevantPlayers.has(p.id))
            .sort((a, b) => {
                const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '');
                if (lastNameCompare !== 0) return lastNameCompare;
                return (a.firstName || '').localeCompare(b.firstName || '');
            });

        console.log(`[Export] Found ${playersList.length} unique players across all sessions`);

        const excelData = [];

        const sessionsPerDate = new Map();
        sessions.forEach(session => {
            const count = sessionsPerDate.get(session.date) || 0;
            sessionsPerDate.set(session.date, count + 1);
        });

        // Farbpalette für Tage mit mehreren Trainings
        const multiSessionColors = [
            'FFFFEB99',
            'FFB3E5FC',
            'FFC8E6C9',
            'FFFFCCBC',
        ];

        // Nur Daten mit mehreren Trainings erhalten Farben
        const dateColorMap = new Map();
        const datesWithMultipleSessions = [...new Set(sessions.map(s => s.date))].filter(
            date => sessionsPerDate.get(date) > 1
        );

        datesWithMultipleSessions.forEach((date, index) => {
            dateColorMap.set(date, multiSessionColors[index % multiSessionColors.length]);
        });

        sessions.forEach(session => {
            if (sessionsPerDate.get(session.date) === 1) {
                dateColorMap.set(session.date, null);
            }
        });

        const headerRow1 = ['Nachname', 'Vorname'];
        const headerRow2 = ['', ''];

        for (const session of sessions) {
            const sessionDate = new Date(session.date + 'T12:00:00');
            const formattedDate = sessionDate.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
            // Für Events den Titel verwenden, sonst Untergruppen-Name
            const sessionName = session.isEvent
                ? session.title
                : (subgroupsMap.get(session.subgroupId) || session.subgroupId);

            headerRow1.push(formattedDate);
            headerRow2.push(`${sessionName} (${session.startTime}-${session.endTime})`);
        }

        headerRow1.push('Gesamt');
        headerRow2.push('');

        excelData.push(headerRow1);
        excelData.push(headerRow2);

        for (const player of playersList) {
            const row = [player.lastName || '', player.firstName || ''];
            let playerTotal = 0;

            for (const session of sessions) {
                // Prüfen ob Spieler in der Untergruppe dieses Trainings ist
                const isInSubgroup = session.isEvent
                    ? true // Bei Events alle Spieler anzeigen
                    : (player.subgroupIDs && player.subgroupIDs.includes(session.subgroupId));

                if (!isInSubgroup) {
                    row.push('');
                    continue;
                }

                let presentPlayerIds = [];
                if (session.isEvent) {
                    // Event-Attendance: Key mit occurrence_date für wiederkehrende Events
                    const eventAttKey = session.occurrenceDate
                        ? `${session.id}_${session.occurrenceDate}` : session.id;
                    // Fallback nur für Einzel-Events (nicht wiederkehrende),
                    // da sonst eine Attendance-Record für ALLE Vorkommnisse angezeigt wird
                    const eventAtt = eventAttendanceMap.get(eventAttKey)
                        || (!recurringEventIds.has(session.id) ? eventAttendanceMap.get(session.id) : null);
                    presentPlayerIds = eventAtt?.presentPlayerIds || [];
                } else {
                    // Normale Session-Attendance
                    const attendanceKey = `${session.date}_${session.id}`;
                    const attendance = attendanceRecords.get(attendanceKey);
                    presentPlayerIds = attendance?.presentPlayerIds || [];
                }

                const isPresent = presentPlayerIds.includes(player.id);
                row.push(isPresent ? '☑' : '☐');

                if (isPresent) {
                    playerTotal++;
                }
            }

            row.push(playerTotal);

            excelData.push(row);
        }

        excelData.push([]);

        const trainerLabelRow = ['Trainer', ''];
        for (let i = 0; i < sessions.length; i++) {
            trainerLabelRow.push('');
        }
        trainerLabelRow.push('');
        excelData.push(trainerLabelRow);

        for (const coach of allCoaches) {
            const row = [coach.lastName || '', coach.firstName || ''];
            let coachTotalHours = 0;

            for (const session of sessions) {
                let hours = 0;

                if (session.isEvent) {
                    // Event-Attendance: coach_hours als Objekt {coach_id: hours}
                    const eventAttKey = session.occurrenceDate
                        ? `${session.id}_${session.occurrenceDate}` : session.id;
                    const eventAtt = eventAttendanceMap.get(eventAttKey)
                        || (!recurringEventIds.has(session.id) ? eventAttendanceMap.get(session.id) : null);
                    if (eventAtt?.coachHours?.[coach.id]) {
                        hours = eventAtt.coachHours[coach.id];
                    }
                } else {
                    // Normale Session-Attendance
                    const attendanceKey = `${session.date}_${session.id}`;
                    const attendance = attendanceRecords.get(attendanceKey);

                    // Neues Format: coaches Array mit {id, hours}
                    if (attendance && attendance.coaches && Array.isArray(attendance.coaches)) {
                        const coachData = attendance.coaches.find(c => c.id === coach.id);
                        if (coachData && coachData.hours) {
                            hours = coachData.hours;
                        }
                    }
                    // Altes Format: coachIds Array (Rückwärtskompatibilität)
                    else if (attendance && attendance.coachIds && attendance.coachIds.includes(coach.id)) {
                        hours = calculateSessionDuration(session.startTime, session.endTime);
                    }
                    // Sehr altes Format: einzelne coachId (Rückwärtskompatibilität)
                    else if (attendance && attendance.coachId === coach.id) {
                        hours = calculateSessionDuration(session.startTime, session.endTime);
                    }
                }

                row.push(hours > 0 ? hours : '');

                coachTotalHours += hours;
            }

            row.push(coachTotalHours > 0 ? Math.round(coachTotalHours * 10) / 10 : '');

            excelData.push(row);
        }

        // Zählt nur Spieler, nicht Trainer
        const countRow = ['Spieler pro Tag (ohne Trainer)', ''];
        for (const session of sessions) {
            let presentPlayerIds = [];
            if (session.isEvent) {
                const eventAttKey = session.occurrenceDate
                    ? `${session.id}_${session.occurrenceDate}` : session.id;
                const eventAtt = eventAttendanceMap.get(eventAttKey)
                    || (!recurringEventIds.has(session.id) ? eventAttendanceMap.get(session.id) : null);
                presentPlayerIds = eventAtt?.presentPlayerIds || [];
            } else {
                const attendanceKey = `${session.date}_${session.id}`;
                const attendance = attendanceRecords.get(attendanceKey);
                presentPlayerIds = attendance?.presentPlayerIds || [];
            }

            const count = playersList.filter(p => presentPlayerIds.includes(p.id)).length;
            countRow.push(count);
        }
        countRow.push('');

        excelData.push(countRow);

        excelData.push([]);

        excelData.push(['Legende:']);
        excelData.push(['Spieler:', '☑ = Anwesend, ☐ = Nicht anwesend']);
        excelData.push(['Trainer:', 'Stunden = Anwesenheitszeit in Stunden (z.B. 2.5)']);
        excelData.push(['Gesamt:', 'Spieler = Anzahl Trainings, Trainer = Summe Stunden']);
        if (datesWithMultipleSessions.length > 0) {
            excelData.push([
                'Farbige Spalten',
                '= Mehrere Trainings am selben Tag (gleiche Farbe = gleicher Tag)',
            ]);
        }

        console.log(`[Export] Generated ${excelData.length} rows for Excel (matrix format)`);

        const workbook = new ExcelJS.Workbook();
        const monthName = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        const worksheet = workbook.addWorksheet(monthName);

        // Zeilen-Indizes für Styling berechnen
        const trainerLabelRowIndex = 2 + playersList.length + 1;
        const countRowIndex = 2 + playersList.length + 2 + allCoaches.length;
        const legendStartIndex = countRowIndex + 2;

        excelData.forEach((rowData, rowIndex) => {
            const row = worksheet.addRow(rowData);

            if (rowIndex === 0 || rowIndex === 1) {
                row.eachCell((cell, colNumber) => {
                    // Farbe nur auf Datumsspalten anwenden (für visuelle Unterscheidung bei mehreren Trainings am selben Tag)
                    if (colNumber > 2 && colNumber <= sessions.length + 2) {
                        const sessionIndex = colNumber - 3;
                        const session = sessions[sessionIndex];
                        const color = dateColorMap.get(session.date);

                        // Nur färben wenn mehrere Trainings am selben Tag stattfinden
                        if (color) {
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: color },
                            };
                        }
                    }

                    cell.font = { bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });
            }

            if (rowIndex === trainerLabelRowIndex) {
                row.eachCell(cell => {
                    cell.font = { bold: true };
                });
            }

            if (rowIndex === countRowIndex) {
                row.eachCell(cell => {
                    cell.font = { bold: true };
                });
            }

            if (rowIndex === legendStartIndex) {
                row.eachCell(cell => {
                    cell.font = { bold: true, size: 12 };
                });
            }
        });

        worksheet.columns = [
            { width: 15 },
            { width: 15 },
            ...Array(sessions.length).fill({ width: 20 }),
            { width: 10 },
        ];

        const filename = `Anwesenheit_${year}_${String(month + 1).padStart(2, '0')}.xlsx`;

        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
        });

        console.log(`[Export] ✓ Excel file downloaded: ${filename}`);

        if (loadingEl) loadingEl.classList.add('hidden');

        return true;
    } catch (error) {
        console.error('[Export] Error exporting attendance:', error);

        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.add('hidden');

        alert(`Fehler beim Exportieren: ${error.message}`);
        return false;
    }
}

/**
 * Exportiert eine Zusammenfassung mit Gesamtwerten pro Spieler
 * @param {Object} supabase - Supabase Client-Instanz
 * @param {string} clubId - Verein-ID
 * @param {Date} date - Der zu exportierende Monat
 * @param {string} subgroupFilter - Untergruppen-ID oder 'all'
 */
export async function exportAttendanceSummary(supabase, clubId, date, subgroupFilter = 'all') {
    try {
        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');

        const year = date.getFullYear();
        const month = date.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        console.log(`[Export Summary] Loading data for ${year}-${month + 1}`);

        // Alte Anwesenheitsdaten (training_sessions System)
        let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('club_id', clubId)
            .gte('date', startDate)
            .lte('date', endDate);

        if (subgroupFilter !== 'all') {
            attendanceQuery = attendanceQuery.eq('subgroup_id', subgroupFilter);
        }

        const { data: attendanceData, error: attendanceError } = await attendanceQuery;
        if (attendanceError) throw attendanceError;

        // Event-Anwesenheitsdaten (neues Event-System) laden
        const { data: singleEventsForSummary } = await supabase
            .from('events')
            .select('id, target_subgroup_ids')
            .eq('club_id', clubId)
            .or('cancelled.eq.false,cancelled.is.null')
            .or('event_type.eq.single,event_type.is.null')
            .gte('start_date', startDate)
            .lte('start_date', endDate);

        const { data: recurringEventsForSummary } = await supabase
            .from('events')
            .select('id, target_subgroup_ids, start_date, repeat_type, repeat_end_date, excluded_dates')
            .eq('club_id', clubId)
            .or('cancelled.eq.false,cancelled.is.null')
            .eq('event_type', 'recurring')
            .lte('start_date', endDate)
            .or(`repeat_end_date.gte.${startDate},repeat_end_date.is.null`);

        // Alle Event-IDs sammeln (Einzel + wiederkehrend)
        const summaryEventIds = [
            ...(singleEventsForSummary || []).map(e => e.id),
            ...(recurringEventsForSummary || []).map(e => e.id)
        ];

        // Gültige Vorkommensdaten im Monat berechnen und Anzahl zählen
        const validSummaryOccurrenceDates = new Set();
        let eventOccurrenceCount = (singleEventsForSummary || []).length;
        (recurringEventsForSummary || []).forEach(e => {
            const eventStartDate = new Date(e.start_date + 'T12:00:00');
            const monthStart = new Date(startDate + 'T12:00:00');
            const monthEnd = new Date(endDate + 'T12:00:00');
            const repeatEndDate = e.repeat_end_date ? new Date(e.repeat_end_date + 'T12:00:00') : null;
            const excludedDates = e.excluded_dates || [];
            const eventDayOfWeek = eventStartDate.getDay();

            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                if (d < eventStartDate) continue;
                if (repeatEndDate && d > repeatEndDate) continue;
                const ds = d.toISOString().split('T')[0];
                if (excludedDates.includes(ds)) continue;
                let matches = false;
                if (e.repeat_type === 'weekly') matches = d.getDay() === eventDayOfWeek;
                else if (e.repeat_type === 'daily') matches = true;
                else if (e.repeat_type === 'monthly') matches = d.getDate() === eventStartDate.getDate();
                if (matches) {
                    eventOccurrenceCount++;
                    validSummaryOccurrenceDates.add(ds);
                }
            }
        });

        let eventAttendanceRecords = [];
        if (summaryEventIds.length > 0) {
            const { data: eaData } = await supabase
                .from('event_attendance')
                .select('present_user_ids, occurrence_date, event_id')
                .in('event_id', [...new Set(summaryEventIds)]);

            // Nur Records behalten, deren occurrence_date im Exportmonat liegt
            eventAttendanceRecords = (eaData || []).filter(ea => {
                if (!ea.occurrence_date) return true; // Einzel-Events ohne occurrence_date
                return validSummaryOccurrenceDates.has(ea.occurrence_date);
            });
        }

        const { data: playersData, error: playersError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, subgroup_ids')
            .eq('club_id', clubId)
            .eq('role', 'player')
            .order('last_name', { ascending: true });

        if (playersError) throw playersError;

        const playersMap = new Map();
        (playersData || []).forEach(p => {
            playersMap.set(p.id, {
                id: p.id,
                name: `${p.first_name} ${p.last_name}`,
                firstName: p.first_name,
                lastName: p.last_name,
                subgroupIDs: p.subgroup_ids || []
            });
        });

        const playerStats = new Map();

        // Alte Anwesenheitsdaten zählen
        (attendanceData || []).forEach(a => {
            const presentPlayerIds = a.present_player_ids || [];

            presentPlayerIds.forEach(playerId => {
                if (!playerStats.has(playerId)) {
                    playerStats.set(playerId, { count: 0, dates: [] });
                }
                const stats = playerStats.get(playerId);
                stats.count++;
                stats.dates.push(a.date);
            });
        });

        // Event-Anwesenheitsdaten zählen
        eventAttendanceRecords.forEach(ea => {
            const presentPlayerIds = ea.present_user_ids || [];
            const dateStr = ea.occurrence_date || '';

            presentPlayerIds.forEach(playerId => {
                if (!playerStats.has(playerId)) {
                    playerStats.set(playerId, { count: 0, dates: [] });
                }
                const stats = playerStats.get(playerId);
                stats.count++;
                if (dateStr) stats.dates.push(dateStr);
            });
        });

        const summaryData = [];
        summaryData.push(['Spieler', 'Trainingsteilnahmen', 'Anwesenheitsrate']);

        const totalSessions = (attendanceData || []).length + eventOccurrenceCount;

        for (const [playerId, stats] of playerStats) {
            const player = playersMap.get(playerId);
            if (!player) continue;

            if (
                subgroupFilter !== 'all' &&
                (!player.subgroupIDs || !player.subgroupIDs.includes(subgroupFilter))
            ) {
                continue;
            }

            const attendanceRate =
                totalSessions > 0 ? ((stats.count / totalSessions) * 100).toFixed(1) : '0.0';

            summaryData.push([player.name, stats.count, `${attendanceRate}%`]);
        }

        summaryData.slice(1).sort((a, b) => b[1] - a[1]);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Zusammenfassung');

        summaryData.forEach((rowData, rowIndex) => {
            const row = worksheet.addRow(rowData);

            if (rowIndex === 0) {
                row.eachCell(cell => {
                    cell.font = { bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });
            }
        });

        worksheet.columns = [
            { width: 25 },
            { width: 20 },
            { width: 18 },
        ];

        const filename = `Anwesenheit_Zusammenfassung_${year}_${String(month + 1).padStart(2, '0')}.xlsx`;

        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
        });

        console.log(`[Export Summary] ✓ Excel file downloaded: ${filename}`);

        if (loadingEl) loadingEl.classList.add('hidden');

        return true;
    } catch (error) {
        console.error('[Export Summary] Error:', error);

        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.add('hidden');

        alert(`Fehler beim Exportieren: ${error.message}`);
        return false;
    }
}
