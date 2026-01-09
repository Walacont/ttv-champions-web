import {
    collection,
    query,
    where,
    orderBy,
    getDocs,
    getDoc,
    doc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Attendance Export Module
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

        return Math.round(durationHours * 10) / 10;
    } catch (error) {
        console.error('Error calculating session duration:', error);
        return 2.0;
    }
}

/**
 * Exports attendance data for a specific month to Excel
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 * @param {Date} date - The month to export (year/month will be extracted)
 * @param {string} subgroupFilter - Subgroup ID or 'all' for all subgroups
 */
export async function exportAttendanceToExcel(db, clubId, date, subgroupFilter = 'all') {
    try {
        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');

        const year = date.getFullYear();
        const month = date.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        console.log(`[Export] Loading attendance data for ${year}-${month + 1}`);

        const subgroupsSnapshot = await getDocs(
            query(collection(db, 'subgroups'), where('clubId', '==', clubId))
        );
        const subgroupsMap = new Map();
        subgroupsSnapshot.forEach(doc => {
            const data = doc.data();
            subgroupsMap.set(doc.id, data.name || doc.id);
        });

        let sessionsQuery;
        if (subgroupFilter === 'all') {
            sessionsQuery = query(
                collection(db, 'trainingSessions'),
                where('clubId', '==', clubId),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                where('cancelled', '==', false),
                orderBy('date', 'asc')
            );
        } else {
            sessionsQuery = query(
                collection(db, 'trainingSessions'),
                where('clubId', '==', clubId),
                where('subgroupId', '==', subgroupFilter),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                where('cancelled', '==', false),
                orderBy('date', 'asc')
            );
        }

        const sessionsSnapshot = await getDocs(sessionsQuery);
        const sessions = sessionsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        console.log(`[Export] Loaded ${sessions.length} training sessions`);

        let attendanceQuery;
        if (subgroupFilter === 'all') {
            attendanceQuery = query(
                collection(db, 'attendance'),
                where('clubId', '==', clubId),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                orderBy('date', 'asc')
            );
        } else {
            attendanceQuery = query(
                collection(db, 'attendance'),
                where('clubId', '==', clubId),
                where('subgroupId', '==', subgroupFilter),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                orderBy('date', 'asc')
            );
        }

        const attendanceSnapshot = await getDocs(attendanceQuery);
        const attendanceRecords = new Map();
        attendanceSnapshot.forEach(doc => {
            const data = doc.data();
            const key = `${data.date}_${data.sessionId || data.subgroupId}`;
            attendanceRecords.set(key, data);
        });

        console.log(`[Export] Loaded ${attendanceRecords.size} attendance records`);

        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'player'),
            orderBy('lastName', 'asc')
        );
        const playersSnapshot = await getDocs(playersQuery);
        const players = playersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        const coachesQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'coach'),
            orderBy('lastName', 'asc')
        );
        const coachesSnapshot = await getDocs(coachesQuery);
        const coachesMap = new Map();
        const allCoaches = [];
        coachesSnapshot.forEach(doc => {
            const data = doc.data();
            coachesMap.set(doc.id, `${data.firstName} ${data.lastName}`);
            allCoaches.push({
                id: doc.id,
                firstName: data.firstName || '',
                lastName: data.lastName || '',
            });
        });

        console.log(`[Export] Loaded ${players.length} players`);

        let filteredPlayers = players;
        if (subgroupFilter !== 'all') {
            filteredPlayers = players.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(subgroupFilter)
            );
        }

        const allRelevantPlayers = new Set();
        for (const session of sessions) {
            const sessionPlayers = filteredPlayers.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(session.subgroupId)
            );
            sessionPlayers.forEach(p => allRelevantPlayers.add(p.id));
        }

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

        const multiSessionColors = [
            'FFFFEB99',
            'FFB3E5FC',
            'FFC8E6C9',
            'FFFFCCBC',
        ];

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
            const subgroupName = subgroupsMap.get(session.subgroupId) || session.subgroupId;

            headerRow1.push(formattedDate);
            headerRow2.push(`${subgroupName} (${session.startTime}-${session.endTime})`);
        }

        headerRow1.push('Gesamt');
        headerRow2.push('');

        excelData.push(headerRow1);
        excelData.push(headerRow2);

        for (const player of playersList) {
            const row = [player.lastName || '', player.firstName || ''];
            let playerTotal = 0;

            for (const session of sessions) {
                const isInSubgroup =
                    player.subgroupIDs && player.subgroupIDs.includes(session.subgroupId);

                if (!isInSubgroup) {
                    row.push('');
                    continue;
                }

                const attendanceKey = `${session.date}_${session.id}`;
                const attendance = attendanceRecords.get(attendanceKey);
                const presentPlayerIds = attendance ? attendance.presentPlayerIds || [] : [];

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
                const attendanceKey = `${session.date}_${session.id}`;
                const attendance = attendanceRecords.get(attendanceKey);

                let hours = 0;

                if (attendance && attendance.coaches && Array.isArray(attendance.coaches)) {
                    const coachData = attendance.coaches.find(c => c.id === coach.id);
                    if (coachData && coachData.hours) {
                        hours = coachData.hours;
                    }
                }
                else if (attendance && attendance.coachIds && attendance.coachIds.includes(coach.id)) {
                    hours = calculateSessionDuration(session.startTime, session.endTime);
                }
                else if (attendance && attendance.coachId === coach.id) {
                    hours = calculateSessionDuration(session.startTime, session.endTime);
                }

                row.push(hours > 0 ? hours : '');

                coachTotalHours += hours;
            }

            row.push(coachTotalHours > 0 ? Math.round(coachTotalHours * 10) / 10 : '');

            excelData.push(row);
        }

        const countRow = ['Spieler pro Tag (ohne Trainer)', ''];
        for (const session of sessions) {
            const attendanceKey = `${session.date}_${session.id}`;
            const attendance = attendanceRecords.get(attendanceKey);
            const presentPlayerIds = attendance ? attendance.presentPlayerIds || [] : [];

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

        const trainerLabelRowIndex = 2 + playersList.length + 1; // +2 for headers, +1 for empty row
        const countRowIndex = 2 + playersList.length + 2 + allCoaches.length; // +2 for empty + "Trainer" label
        const legendStartIndex = countRowIndex + 2; // +1 for count row, +1 for empty row

        excelData.forEach((rowData, rowIndex) => {
            const row = worksheet.addRow(rowData);

            if (rowIndex === 0 || rowIndex === 1) {
                row.eachCell((cell, colNumber) => {
                    if (colNumber > 2 && colNumber <= sessions.length + 2) {
                        const sessionIndex = colNumber - 3; // 0-indexed session
                        const session = sessions[sessionIndex];
                        const color = dateColorMap.get(session.date);

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
 * Exports a summary view with totals per player
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 * @param {Date} date - The month to export
 * @param {string} subgroupFilter - Subgroup ID or 'all'
 */
export async function exportAttendanceSummary(db, clubId, date, subgroupFilter = 'all') {
    try {
        const loadingEl = document.getElementById('export-loading');
        if (loadingEl) loadingEl.classList.remove('hidden');

        const year = date.getFullYear();
        const month = date.getMonth();
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        console.log(`[Export Summary] Loading data for ${year}-${month + 1}`);

        let attendanceQuery;
        if (subgroupFilter === 'all') {
            attendanceQuery = query(
                collection(db, 'attendance'),
                where('clubId', '==', clubId),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        } else {
            attendanceQuery = query(
                collection(db, 'attendance'),
                where('clubId', '==', clubId),
                where('subgroupId', '==', subgroupFilter),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        }

        const attendanceSnapshot = await getDocs(attendanceQuery);

        const playersQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'player'),
            orderBy('lastName', 'asc')
        );
        const playersSnapshot = await getDocs(playersQuery);
        const playersMap = new Map();
        playersSnapshot.forEach(doc => {
            const data = doc.data();
            playersMap.set(doc.id, {
                id: doc.id,
                name: `${data.firstName} ${data.lastName}`,
                ...data,
            });
        });

        const playerStats = new Map();

        attendanceSnapshot.forEach(doc => {
            const data = doc.data();
            const presentPlayerIds = data.presentPlayerIds || [];

            presentPlayerIds.forEach(playerId => {
                if (!playerStats.has(playerId)) {
                    playerStats.set(playerId, { count: 0, dates: [] });
                }
                const stats = playerStats.get(playerId);
                stats.count++;
                stats.dates.push(data.date);
            });
        });

        const summaryData = [];
        summaryData.push(['Spieler', 'Trainingsteilnahmen', 'Anwesenheitsrate']);

        const totalSessions = attendanceSnapshot.size;

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
