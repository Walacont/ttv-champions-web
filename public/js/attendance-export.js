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
 * Exports attendance data for a specific month to Excel
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 * @param {Date} date - The month to export (year/month will be extracted)
 * @param {string} subgroupFilter - Subgroup ID or 'all' for all subgroups
 */
export async function exportAttendanceToExcel(db, clubId, date, subgroupFilter = 'all') {
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
        const subgroupsSnapshot = await getDocs(
            query(collection(db, 'subgroups'), where('clubId', '==', clubId))
        );
        const subgroupsMap = new Map();
        subgroupsSnapshot.forEach(doc => {
            const data = doc.data();
            subgroupsMap.set(doc.id, data.name || doc.id);
        });

        // Load training sessions for the month
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

        // Load attendance records for the month
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

        // Load all players
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

        // Create a color palette for dates (pastel colors for better readability)
        const colorPalette = [
            'FFB3E5FC', // Light Blue
            'FFC8E6C9', // Light Green
            'FFFFF9C4', // Light Yellow
            'FFFFCCBC', // Light Orange
            'FFD1C4E9', // Light Purple
            'FFF8BBD0', // Light Pink
            'FFB2DFDB', // Light Teal
            'FFDCEDC8', // Light Lime
        ];

        // Map each unique date to a color
        const dateColorMap = new Map();
        const uniqueDates = [...new Set(sessions.map(s => s.date))];
        uniqueDates.forEach((date, index) => {
            dateColorMap.set(date, colorPalette[index % colorPalette.length]);
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

                // Add X if present, empty if not
                const isPresent = presentPlayerIds.includes(player.id);
                row.push(isPresent ? 'X' : '');

                if (isPresent) {
                    playerTotal++;
                }
            }

            // Add total for this player
            row.push(playerTotal);

            excelData.push(row);
        }

        // Add bottom row with counts per session
        const countRow = ['Anzahl', ''];
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

        console.log(`[Export] Generated ${excelData.length} rows for Excel (matrix format)`);

        // Create Excel workbook using SheetJS
        const wb = window.XLSX.utils.book_new();
        const ws = window.XLSX.utils.aoa_to_sheet(excelData);

        // Apply colors to header cells based on date
        // Column letters: C onwards (A=Nachname, B=Vorname, C=first date)
        const startCol = 2; // Column C (0-indexed: A=0, B=1, C=2)
        sessions.forEach((session, sessionIndex) => {
            const colIndex = startCol + sessionIndex;
            const colLetter = window.XLSX.utils.encode_col(colIndex);
            const color = dateColorMap.get(session.date);

            // Apply color to both header rows (row 1 and row 2)
            const cell1 = `${colLetter}1`;
            const cell2 = `${colLetter}2`;

            if (!ws[cell1]) ws[cell1] = { t: 's', v: '' };
            if (!ws[cell2]) ws[cell2] = { t: 's', v: '' };

            // Set background color (fill)
            ws[cell1].s = {
                fill: { fgColor: { rgb: color } },
                font: { bold: true },
                alignment: { horizontal: 'center', vertical: 'center' },
            };
            ws[cell2].s = {
                fill: { fgColor: { rgb: color } },
                font: { bold: true },
                alignment: { horizontal: 'center', vertical: 'center' },
            };
        });

        // Set column widths
        const colWidths = [
            { wch: 15 }, // Nachname
            { wch: 15 }, // Vorname
        ];
        // Add width for each date column
        for (let i = 0; i < sessions.length; i++) {
            colWidths.push({ wch: 20 }); // Date columns (wider for group name + time)
        }
        // Add width for "Gesamt" column
        colWidths.push({ wch: 10 }); // Gesamt column
        ws['!cols'] = colWidths;

        // Add worksheet to workbook
        const monthName = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        window.XLSX.utils.book_append_sheet(wb, ws, monthName);

        // Generate filename
        const filename = `Anwesenheit_${year}_${String(month + 1).padStart(2, '0')}.xlsx`;

        // Download the file
        window.XLSX.writeFile(wb, filename);

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

        // Load attendance records
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

        // Load players
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

        // Count attendance per player
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

        // Build summary data
        const summaryData = [];
        summaryData.push(['Spieler', 'Trainingsteilnahmen', 'Anwesenheitsrate']);

        // Calculate total number of training sessions
        const totalSessions = attendanceSnapshot.size;

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

        // Create Excel workbook
        const wb = window.XLSX.utils.book_new();
        const ws = window.XLSX.utils.aoa_to_sheet(summaryData);

        ws['!cols'] = [
            { wch: 25 }, // Spieler
            { wch: 20 }, // Trainingsteilnahmen
            { wch: 18 }, // Anwesenheitsrate
        ];

        const monthName = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        window.XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');

        const filename = `Anwesenheit_Zusammenfassung_${year}_${String(month + 1).padStart(2, '0')}.xlsx`;
        window.XLSX.writeFile(wb, filename);

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
