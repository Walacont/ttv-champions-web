/**
 * Attendance Export Module (Supabase Version)
 * Handles exporting attendance data to Excel format
 */

/**
 * Calculates the duration in hours between two time strings
 * @param {string} startTime - Start time in HH:MM format (e.g., "18:00")
 * @param {string} endTime - End time in HH:MM format (e.g., "20:00")
 * @returns {number} Duration in hours (e.g., 2.0)
 */
function calculateSessionDuration(startTime, endTime) {
    try {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const startTotalMinutes = startHour * 60 + startMinute;
        const endTotalMinutes = endHour * 60 + endMinute;

        const durationMinutes = endTotalMinutes - startTotalMinutes;
        const durationHours = durationMinutes / 60;

        // Round to 1 decimal place
        return Math.round(durationHours * 10) / 10;
    } catch (error) {
        console.error('Error calculating session duration:', error);
        return 2.0; // Default to 2 hours
    }
}

/**
 * Exports attendance data for a specific month to Excel
 * @param {Object} supabase - Supabase client instance
 * @param {string} clubId - Club ID
 * @param {Date} date - The month to export (year/month will be extracted)
 * @param {string} subgroupFilter - Subgroup ID or 'all' for all subgroups
 */
export async function exportAttendanceToExcel(supabase, clubId, date, subgroupFilter = 'all') {
    try {
        // Show loading indicator
        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');

        const year = date.getFullYear();
        const month = date.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        console.log(`[Export] Loading attendance data for ${year}-${month + 1}`);

        // Load subgroups for name mapping
        const { data: subgroupsData, error: subgroupsError } = await supabase
            .from('subgroups')
            .select('id, name')
            .eq('club_id', clubId);

        if (subgroupsError) throw subgroupsError;

        const subgroupsMap = new Map();
        (subgroupsData || []).forEach(sg => {
            subgroupsMap.set(sg.id, sg.name || sg.id);
        });

        // Load training sessions for the month
        let sessionsQuery = supabase
            .from('training_sessions')
            .select('*')
            .eq('club_id', clubId)
            .eq('cancelled', false)
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

        // Load attendance records for the month
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

        // Load all players
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

        // Load all coaches for name mapping and tracking
        const { data: coachesData, error: coachesError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('club_id', clubId)
            .eq('role', 'coach')
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

        // Filter players by subgroup if needed
        let filteredPlayers = players;
        if (subgroupFilter !== 'all') {
            filteredPlayers = players.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(subgroupFilter)
            );
        }

        // Group players by subgroup to get all relevant players
        const allRelevantPlayers = new Set();
        for (const session of sessions) {
            const sessionPlayers = filteredPlayers.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(session.subgroupId)
            );
            sessionPlayers.forEach(p => allRelevantPlayers.add(p.id));
        }

        // Get unique list of players who participated in any session
        const playersList = filteredPlayers
            .filter(p => allRelevantPlayers.has(p.id))
            .sort((a, b) => {
                const lastNameCompare = (a.lastName || '').localeCompare(b.lastName || '');
                if (lastNameCompare !== 0) return lastNameCompare;
                return (a.firstName || '').localeCompare(b.firstName || '');
            });

        console.log(`[Export] Found ${playersList.length} unique players across all sessions`);

        // Build Excel data structure in matrix format
        const excelData = [];

        // Count how many sessions per date
        const sessionsPerDate = new Map();
        sessions.forEach(session => {
            const count = sessionsPerDate.get(session.date) || 0;
            sessionsPerDate.set(session.date, count + 1);
        });

        // Color palette for dates with multiple trainings
        const multiSessionColors = [
            'FFFFEB99', // Light yellow
            'FFB3E5FC', // Light blue
            'FFC8E6C9', // Light green
            'FFFFCCBC', // Light orange
        ];

        // Map each date to a color: only dates with multiple sessions get colors
        const dateColorMap = new Map();
        const datesWithMultipleSessions = [...new Set(sessions.map(s => s.date))].filter(
            date => sessionsPerDate.get(date) > 1
        );

        // Assign different colors to different multi-session dates
        datesWithMultipleSessions.forEach((date, index) => {
            dateColorMap.set(date, multiSessionColors[index % multiSessionColors.length]);
        });

        // Single-session dates get no color
        sessions.forEach(session => {
            if (sessionsPerDate.get(session.date) === 1) {
                dateColorMap.set(session.date, null);
            }
        });

        // Build header rows
        const headerRow1 = ['Nachname', 'Vorname']; // First header row (dates)
        const headerRow2 = ['', '']; // Second header row (group + time)

        // Add date columns
        for (const session of sessions) {
            const sessionDate = new Date(session.date + 'T12:00:00');
            const formattedDate = sessionDate.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
            const subgroupName = subgroupsMap.get(session.subgroupId) || session.subgroupId;

            headerRow1.push(formattedDate);
            headerRow2.push(`${subgroupName} (${session.startTime}-${session.endTime})`);
        }

        // Add "Gesamt" column header
        headerRow1.push('Gesamt');
        headerRow2.push('');

        excelData.push(headerRow1);
        excelData.push(headerRow2);

        // Add player rows
        for (const player of playersList) {
            const row = [player.lastName || '', player.firstName || ''];
            let playerTotal = 0; // Count attendance for this player

            // Check attendance for each session
            for (const session of sessions) {
                // Check if player is in this session's subgroup
                const isInSubgroup =
                    player.subgroupIDs && player.subgroupIDs.includes(session.subgroupId);

                if (!isInSubgroup) {
                    row.push(''); // Not in this subgroup
                    continue;
                }

                // Get attendance for this session
                const attendanceKey = `${session.date}_${session.id}`;
                const attendance = attendanceRecords.get(attendanceKey);
                const presentPlayerIds = attendance ? attendance.presentPlayerIds || [] : [];

                // Add checkbox: ☑ if present, ☐ if not
                const isPresent = presentPlayerIds.includes(player.id);
                row.push(isPresent ? '☑' : '☐');

                if (isPresent) {
                    playerTotal++;
                }
            }

            // Add total for this player
            row.push(playerTotal);

            excelData.push(row);
        }

        // Add empty row for spacing
        excelData.push([]);

        // Add "Trainer" label row
        const trainerLabelRow = ['Trainer', ''];
        for (let i = 0; i < sessions.length; i++) {
            trainerLabelRow.push('');
        }
        trainerLabelRow.push(''); // Empty cell for Gesamt column
        excelData.push(trainerLabelRow);

        // Add coach rows
        for (const coach of allCoaches) {
            const row = [coach.lastName || '', coach.firstName || ''];
            let coachTotalHours = 0; // Total hours for this coach

            // Check attendance for each session
            for (const session of sessions) {
                // Get attendance for this session
                const attendanceKey = `${session.date}_${session.id}`;
                const attendance = attendanceRecords.get(attendanceKey);

                let hours = 0;

                // New format: coaches array with {id, hours}
                if (attendance && attendance.coaches && Array.isArray(attendance.coaches)) {
                    const coachData = attendance.coaches.find(c => c.id === coach.id);
                    if (coachData && coachData.hours) {
                        hours = coachData.hours;
                    }
                }
                // Old format: coachIds array (backward compatibility)
                else if (attendance && attendance.coachIds && attendance.coachIds.includes(coach.id)) {
                    // Calculate session duration as fallback
                    hours = calculateSessionDuration(session.startTime, session.endTime);
                }
                // Very old format: single coachId (backward compatibility)
                else if (attendance && attendance.coachId === coach.id) {
                    // Calculate session duration as fallback
                    hours = calculateSessionDuration(session.startTime, session.endTime);
                }

                // Add hours to row (show hours if present, empty if not)
                row.push(hours > 0 ? hours : '');

                coachTotalHours += hours;
            }

            // Add total hours for this coach (rounded to 1 decimal)
            row.push(coachTotalHours > 0 ? Math.round(coachTotalHours * 10) / 10 : '');

            excelData.push(row);
        }

        // Add bottom row with counts per session (only counting players, not coaches)
        const countRow = ['Spieler pro Tag (ohne Trainer)', ''];
        for (const session of sessions) {
            const attendanceKey = `${session.date}_${session.id}`;
            const attendance = attendanceRecords.get(attendanceKey);
            const presentPlayerIds = attendance ? attendance.presentPlayerIds || [] : [];

            // Count how many players from our list were present
            const count = playersList.filter(p => presentPlayerIds.includes(p.id)).length;
            countRow.push(count);
        }
        // Empty cell for the "Gesamt" column in the count row
        countRow.push('');

        excelData.push(countRow);

        // Add empty row for spacing
        excelData.push([]);

        // Add legend
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

        // Create Excel workbook using ExcelJS
        const workbook = new ExcelJS.Workbook();
        const monthName = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        const worksheet = workbook.addWorksheet(monthName);

        // Calculate row indices for styling
        // Structure: 2 header rows + players + empty row + "Trainer" label + coaches + countRow
        const trainerLabelRowIndex = 2 + playersList.length + 1; // +2 for headers, +1 for empty row
        const countRowIndex = 2 + playersList.length + 2 + allCoaches.length; // +2 for empty + "Trainer" label
        const legendStartIndex = countRowIndex + 2; // +1 for count row, +1 for empty row

        // Add rows to worksheet
        excelData.forEach((rowData, rowIndex) => {
            const row = worksheet.addRow(rowData);

            // Style header rows (first two rows)
            if (rowIndex === 0 || rowIndex === 1) {
                row.eachCell((cell, colNumber) => {
                    // Apply color to date columns (column 3 onwards, before "Gesamt")
                    if (colNumber > 2 && colNumber <= sessions.length + 2) {
                        const sessionIndex = colNumber - 3; // 0-indexed session
                        const session = sessions[sessionIndex];
                        const color = dateColorMap.get(session.date);

                        // Only apply color if this date has multiple trainings
                        if (color) {
                            cell.fill = {
                                type: 'pattern',
                                pattern: 'solid',
                                fgColor: { argb: color },
                            };
                        }
                    }

                    // Make all header cells bold and centered
                    cell.font = { bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });
            }

            // Style the "Trainer" label row
            if (rowIndex === trainerLabelRowIndex) {
                row.eachCell(cell => {
                    cell.font = { bold: true };
                });
            }

            // Style the "Anzahl" row
            if (rowIndex === countRowIndex) {
                row.eachCell(cell => {
                    cell.font = { bold: true };
                });
            }

            // Style legend header ("Legende:")
            if (rowIndex === legendStartIndex) {
                row.eachCell(cell => {
                    cell.font = { bold: true, size: 12 };
                });
            }
        });

        // Set column widths
        worksheet.columns = [
            { width: 15 }, // Nachname
            { width: 15 }, // Vorname
            ...Array(sessions.length).fill({ width: 20 }), // Date columns
            { width: 10 }, // Gesamt
        ];

        // Generate filename
        const filename = `Anwesenheit_${year}_${String(month + 1).padStart(2, '0')}.xlsx`;

        // Download the file
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

        // Hide loading indicator
        if (loadingEl) loadingEl.classList.add('hidden');

        return true;
    } catch (error) {
        console.error('[Export] Error exporting attendance:', error);

        // Hide loading indicator
        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.add('hidden');

        alert(`Fehler beim Exportieren: ${error.message}`);
        return false;
    }
}

/**
 * Exports a summary view with totals per player
 * @param {Object} supabase - Supabase client instance
 * @param {string} clubId - Club ID
 * @param {Date} date - The month to export
 * @param {string} subgroupFilter - Subgroup ID or 'all'
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

        // Load attendance records
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

        // Load players
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

        // Count attendance per player
        const playerStats = new Map();

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

        // Build summary data
        const summaryData = [];
        summaryData.push(['Spieler', 'Trainingsteilnahmen', 'Anwesenheitsrate']);

        // Calculate total number of training sessions
        const totalSessions = (attendanceData || []).length;

        for (const [playerId, stats] of playerStats) {
            const player = playersMap.get(playerId);
            if (!player) continue;

            // Filter by subgroup if needed
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

        // Sort by attendance count (descending)
        summaryData.slice(1).sort((a, b) => b[1] - a[1]);

        // Create Excel workbook using ExcelJS
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Zusammenfassung');

        // Add rows
        summaryData.forEach((rowData, rowIndex) => {
            const row = worksheet.addRow(rowData);

            // Style header row
            if (rowIndex === 0) {
                row.eachCell(cell => {
                    cell.font = { bold: true };
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                });
            }
        });

        // Set column widths
        worksheet.columns = [
            { width: 25 }, // Spieler
            { width: 20 }, // Trainingsteilnahmen
            { width: 18 }, // Anwesenheitsrate
        ];

        const filename = `Anwesenheit_Zusammenfassung_${year}_${String(month + 1).padStart(2, '0')}.xlsx`;

        // Download the file
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
