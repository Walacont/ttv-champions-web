import { collection, query, where, orderBy, limit, getDocs, doc, writeBatch, serverTimestamp, increment, onSnapshot, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Attendance Module
 * Handles calendar rendering and attendance tracking for coaches
 * Now also tracks XP (Experience Points) for the new rank system
 * Updated to support subgroups with separate streaks per subgroup
 */

// Module state
let monthlyAttendance = new Map();
let currentSubgroupFilter = 'all'; // Current active subgroup filter
let isRenderingAttendance = false; // Guard to prevent multiple simultaneous renders

/**
 * Sets the current subgroup filter for attendance operations
 * @param {string} subgroupId - Subgroup ID or 'all' for all subgroups
 */
export function setAttendanceSubgroupFilter(subgroupId) {
    currentSubgroupFilter = subgroupId || 'all';
}

/**
 * Renders the calendar for a given month and year
 * @param {Date} date - The date to render the calendar for
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user's data
 */
export async function renderCalendar(date, db, currentUserData) {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;
    const calendarMonthYear = document.getElementById('calendar-month-year');

    calendarGrid.innerHTML = '';

    const month = date.getMonth();
    const year = date.getFullYear();
    calendarMonthYear.textContent = date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    await fetchMonthlyAttendance(year, month, db, currentUserData);

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const startOffset = (firstDayOfMonth === 0) ? 6 : firstDayOfMonth - 1;

    for (let i = 0; i < startOffset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'p-2 border rounded-md bg-gray-50';
        calendarGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        dayCell.className = 'calendar-day p-2 border rounded-md text-center';
        dayCell.textContent = day;
        dayCell.dataset.date = dateString;

        if (monthlyAttendance.has(dateString)) {
            dayCell.classList.add('calendar-day-present');
        }

        calendarGrid.appendChild(dayCell);
    }
}

/**
 * Fetches attendance data for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user's data
 */
export async function fetchMonthlyAttendance(year, month, db, currentUserData) {
    monthlyAttendance.clear();
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    // Build query based on subgroup filter
    let q;
    if (currentSubgroupFilter === 'all') {
        // Show all attendance events for the club
        q = query(collection(db, 'attendance'),
            where('clubId', '==', currentUserData.clubId),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
    } else {
        // Show only attendance events for the selected subgroup
        q = query(collection(db, 'attendance'),
            where('clubId', '==', currentUserData.clubId),
            where('subgroupId', '==', currentSubgroupFilter),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
    }

    const querySnapshot = await getDocs(q);

    // When filter is "all", we might have multiple events per day (different subgroups)
    // We'll mark a day as present if ANY subgroup had a training that day
    querySnapshot.forEach(doc => {
        const data = doc.data();
        const dateKey = data.date;

        if (currentSubgroupFilter === 'all') {
            // For "all" view, just mark the day - don't store specific event data
            if (!monthlyAttendance.has(dateKey)) {
                monthlyAttendance.set(dateKey, { id: doc.id, ...data });
            }
        } else {
            // For specific subgroup, store the event data
            monthlyAttendance.set(dateKey, { id: doc.id, ...data });
        }
    });
}

/**
 * Checks if a player is present in other subgroups on a specific date
 * @param {string} playerId - Player ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} currentSubgroupId - Current subgroup ID to exclude
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Array>} Array of subgroup names where player was present
 */
async function checkPlayerInOtherSubgroups(playerId, date, currentSubgroupId, clubId, db) {
    try {
        // Query attendance for this date and club, but exclude current subgroup
        const q = query(
            collection(db, 'attendance'),
            where('clubId', '==', clubId),
            where('date', '==', date)
        );

        const snapshot = await getDocs(q);
        const otherSubgroups = [];

        for (const attendanceDoc of snapshot.docs) {
            const data = attendanceDoc.data();
            // Check if this attendance is for a different subgroup
            if (data.subgroupId !== currentSubgroupId && data.presentPlayerIds && data.presentPlayerIds.includes(playerId)) {
                // Get subgroup name
                try {
                    const subgroupDoc = await getDoc(doc(db, 'subgroups', data.subgroupId));
                    if (subgroupDoc.exists()) {
                        otherSubgroups.push(subgroupDoc.data().name);
                    } else {
                        otherSubgroups.push(data.subgroupId);
                    }
                } catch (err) {
                    console.error(`Error loading subgroup name for ${data.subgroupId}:`, err);
                    otherSubgroups.push(data.subgroupId);
                }
            }
        }

        return otherSubgroups;
    } catch (error) {
        console.error("Error checking player in other subgroups:", error);
        return [];
    }
}

/**
 * Handles calendar day click to open attendance modal
 * @param {Event} e - Click event
 * @param {Array} clubPlayers - List of club players
 * @param {Function} updateAttendanceCount - Callback to update attendance count
 * @param {Function} updatePairingsButtonState - Callback to update pairings button
 * @param {Object} db - Firestore database instance
 * @param {string} clubId - Club ID
 */
export async function handleCalendarDayClick(e, clubPlayers, updateAttendanceCount, updatePairingsButtonState, db, clubId) {
    const dayCell = e.target.closest('.calendar-day');
    if (!dayCell || dayCell.classList.contains('disabled')) return;

    // Prevent multiple simultaneous executions
    if (isRenderingAttendance) {
        console.log('[Attendance Modal] Already rendering, skipping duplicate call');
        return;
    }
    isRenderingAttendance = true;

    try {
        const date = dayCell.dataset.date;
        const attendanceData = monthlyAttendance.get(date);
        const modal = document.getElementById('attendance-modal');
        document.getElementById('attendance-modal-date').textContent = new Date(date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        document.getElementById('attendance-date-input').value = date;
        document.getElementById('attendance-doc-id-input').value = attendanceData ? attendanceData.id : '';

        const playerListContainer = document.getElementById('attendance-player-list');

        // Force clear the container - remove all children
        while (playerListContainer.firstChild) {
            playerListContainer.removeChild(playerListContainer.firstChild);
        }

        console.log(`[Attendance Modal] Container cleared, checkboxes count: ${playerListContainer.querySelectorAll('input[type="checkbox"]').length}`);

        // Show warning if "Alle" view is active
        if (currentSubgroupFilter === 'all') {
            playerListContainer.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                    <p class="text-sm text-yellow-800 font-semibold">⚠️ Bitte wähle eine spezifische Untergruppe aus</p>
                    <p class="text-xs text-yellow-700 mt-1">Du kannst nur Anwesenheit für eine bestimmte Gruppe erfassen.</p>
                </div>
            `;
            modal.classList.remove('hidden');
            return;
        }

        console.log(`[Attendance Modal] Total players in clubPlayers: ${clubPlayers.length}`);
        console.log(`[Attendance Modal] Current subgroup filter: ${currentSubgroupFilter}`);

        // Filter players: Only show players who are members of the current subgroup
        const playersInCurrentSubgroup = clubPlayers.filter(player =>
            player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
        );

        console.log(`[Attendance Modal] Players in current subgroup (before dedup): ${playersInCurrentSubgroup.length}`);

        // Deduplicate players by ID to prevent duplicates in the UI
        const playersMap = new Map();
        let dedupCount = 0;
        playersInCurrentSubgroup.forEach(player => {
            if (playersMap.has(player.id)) {
                console.warn(`[Attendance Modal] Duplicate player ID found: ${player.firstName} ${player.lastName} (ID: ${player.id})`);
                dedupCount++;
            }
            playersMap.set(player.id, player);
        });
        const uniquePlayers = Array.from(playersMap.values());

        console.log(`[Attendance Modal] Unique players after dedup: ${uniquePlayers.length} (removed ${dedupCount} duplicates)`);

        if (uniquePlayers.length === 0) {
            playerListContainer.innerHTML = `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-600">Keine Spieler in dieser Gruppe gefunden.</p>
                    <p class="text-xs text-gray-500 mt-1">Weise Spieler im "Spieler verwalten"-Modal zu.</p>
                </div>
            `;
            modal.classList.remove('hidden');
            return;
        }

        // Render players with async check for other subgroup attendance
        for (const player of uniquePlayers) {
            const isChecked = attendanceData && attendanceData.presentPlayerIds.includes(player.id);

            // Check if player is present in other subgroups on this date
            const otherSubgroups = await checkPlayerInOtherSubgroups(player.id, date, currentSubgroupFilter, clubId, db);
            const isInOtherSubgroup = otherSubgroups.length > 0;

            const div = document.createElement('div');
            // Apply special background color if player is in other subgroups
            div.className = `flex items-center p-2 rounded-md ${isInOtherSubgroup ? 'bg-amber-50 border border-amber-200' : ''}`;
            div.innerHTML = `
                <input id="player-check-${player.id}" name="present" value="${player.id}" type="checkbox" ${isChecked ? 'checked' : ''} ${isInOtherSubgroup ? 'disabled' : ''} class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 ${isInOtherSubgroup ? 'opacity-50 cursor-not-allowed' : ''}">
                <label for="player-check-${player.id}" class="ml-3 block text-sm font-medium ${isInOtherSubgroup ? 'text-gray-400' : 'text-gray-700'}">${player.firstName} ${player.lastName}</label>
                ${isInOtherSubgroup ? `<span class="text-xs bg-amber-200 text-amber-900 px-2 py-1 rounded-full ml-auto">🔒 Bereits in ${otherSubgroups.join(', ')}</span>` : ''}
                ${!isInOtherSubgroup && !player.isMatchReady ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-auto">Nicht bereit</span>' : ''}
            `;
            playerListContainer.appendChild(div);
        }

        console.log(`[Attendance Modal] Rendered ${uniquePlayers.length} players in the attendance list`);
        console.log(`[Attendance Modal] Total checkboxes in DOM: ${playerListContainer.querySelectorAll('input[type="checkbox"]').length}`);

        modal.classList.remove('hidden');

        // Initialen Zustand für Zähler und Button setzen
        updateAttendanceCount();
        updatePairingsButtonState();
    } catch (error) {
        console.error('[Attendance Modal] Error rendering attendance:', error);
    } finally {
        // Always release the guard
        isRenderingAttendance = false;
    }
}

/**
 * Saves attendance data and calculates points/streaks
 * Now supports subgroups with separate streaks per subgroup
 * @param {Event} e - Form submit event
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user's data
 * @param {Array} clubPlayers - List of club players
 * @param {Date} currentCalendarDate - Current calendar date being viewed
 * @param {Function} renderCalendarCallback - Callback to re-render calendar
 */
export async function handleAttendanceSave(e, db, currentUserData, clubPlayers, currentCalendarDate, renderCalendarCallback) {
    e.preventDefault();
    const feedbackEl = document.getElementById('attendance-feedback');
    feedbackEl.textContent = 'Speichere...';

    const date = document.getElementById('attendance-date-input').value;
    const docId = document.getElementById('attendance-doc-id-input').value;
    const ATTENDANCE_POINTS_BASE = 10;

    // When filter is "all", prevent saving (user must select a specific subgroup)
    if (currentSubgroupFilter === 'all') {
        feedbackEl.textContent = 'Bitte wähle eine spezifische Untergruppe aus, um Anwesenheit zu erfassen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    // Load subgroup name for history
    let subgroupName = currentSubgroupFilter;
    try {
        const subgroupDoc = await getDoc(doc(db, 'subgroups', currentSubgroupFilter));
        if (subgroupDoc.exists()) {
            subgroupName = subgroupDoc.data().name;
        }
    } catch (error) {
        console.error("Error loading subgroup name:", error);
    }

    const allPlayerCheckboxes = document.getElementById('attendance-player-list').querySelectorAll('input[type="checkbox"]');
    const presentPlayerIds = Array.from(allPlayerCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);

    const previousAttendanceData = monthlyAttendance.get(date);
    const previouslyPresentIdsOnThisDay = previousAttendanceData ? previousAttendanceData.presentPlayerIds : [];

    try {
        const batch = writeBatch(db);

        // Find the last training day for THIS SUBGROUP before the current date
        const attendanceColl = collection(db, 'attendance');
        const q = query(
            attendanceColl,
            where('clubId', '==', currentUserData.clubId),
            where('subgroupId', '==', currentSubgroupFilter),
            where('date', '<', date),
            orderBy('date', 'desc'),
            limit(1)
        );
        const previousTrainingSnapshot = await getDocs(q);

        let previousTrainingPresentIds = [];
        if (!previousTrainingSnapshot.empty) {
            previousTrainingPresentIds = previousTrainingSnapshot.docs[0].data().presentPlayerIds || [];
        }

        // Update/create attendance document for this day and subgroup
        const attendanceRef = docId ? doc(db, 'attendance', docId) : doc(attendanceColl);
        batch.set(attendanceRef, {
            date,
            clubId: currentUserData.clubId,
            subgroupId: currentSubgroupFilter,
            presentPlayerIds,
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Process EVERY player in the club and update their subgroup-specific streak and points
        // Filter to only process players who are members of this subgroup
        const playersInSubgroup = clubPlayers.filter(p =>
            p.subgroupIDs && p.subgroupIDs.includes(currentSubgroupFilter)
        );

        for (const player of playersInSubgroup) {
            const playerRef = doc(db, 'users', player.id);
            const streakRef = doc(db, `users/${player.id}/streaks`, currentSubgroupFilter);

            const isPresentToday = presentPlayerIds.includes(player.id);
            const wasPresentPreviouslyOnThisDay = previouslyPresentIdsOnThisDay.includes(player.id);

            // CASE 1: Player is present today
            if (isPresentToday) {
                // Only execute if player was NEWLY marked as present for this day
                if (!wasPresentPreviouslyOnThisDay) {
                    // Get current streak from subcollection
                    const streakDoc = await getDoc(streakRef);
                    const currentStreak = streakDoc.exists() ? (streakDoc.data().count || 0) : 0;

                    const wasPresentLastTraining = previousTrainingPresentIds.includes(player.id);

                    // Streak logic
                    const newStreak = wasPresentLastTraining ? currentStreak + 1 : 1;

                    // Bonus points logic
                    let pointsToAdd = ATTENDANCE_POINTS_BASE;
                    let reason = `Anwesenheit beim Training - ${subgroupName}`;

                    if (newStreak >= 5) {
                        pointsToAdd = 20; // 10 base + 10 bonus
                        reason = `Anwesenheit beim Training - ${subgroupName} (${newStreak}x Super-Streak)`;
                    } else if (newStreak >= 3) {
                        pointsToAdd = 15; // 10 base + 5 bonus
                        reason = `Anwesenheit beim Training - ${subgroupName} (${newStreak}x Streak-Bonus)`;
                    }

                    // Update streak in subcollection
                    batch.set(streakRef, {
                        count: newStreak,
                        subgroupId: currentSubgroupFilter,
                        lastUpdated: serverTimestamp()
                    });

                    // Update global player points and XP
                    batch.update(playerRef, {
                        points: increment(pointsToAdd),
                        xp: increment(pointsToAdd), // XP = same as points for attendance
                        lastXPUpdate: serverTimestamp()
                    });

                    const historyRef = doc(collection(db, `users/${player.id}/pointsHistory`));
                    batch.set(historyRef, {
                        points: pointsToAdd,
                        xp: pointsToAdd, // Track XP change (same as points for attendance)
                        eloChange: 0, // No Elo change for attendance
                        reason,
                        timestamp: serverTimestamp(),
                        awardedBy: "System (Anwesenheit)"
                    });

                    // Track XP in separate history
                    const xpHistoryRef = doc(collection(db, `users/${player.id}/xpHistory`));
                    batch.set(xpHistoryRef, {
                        xp: pointsToAdd,
                        reason,
                        timestamp: serverTimestamp(),
                        awardedBy: "System (Anwesenheit)"
                    });
                }
            }
            // CASE 2: Player is NOT present today
            else {
                // Reset the streak for this subgroup to 0 for absent players
                batch.set(streakRef, {
                    count: 0,
                    subgroupId: currentSubgroupFilter,
                    lastUpdated: serverTimestamp()
                });

                // If coach unchecked the player for this day, deduct base points
                if (wasPresentPreviouslyOnThisDay) {
                    batch.update(playerRef, { points: increment(-ATTENDANCE_POINTS_BASE) });
                    // Optional: Create negative entry in history
                    const historyRef = doc(collection(db, `users/${player.id}/pointsHistory`));
                    batch.set(historyRef, {
                        points: -ATTENDANCE_POINTS_BASE,
                        xp: -ATTENDANCE_POINTS_BASE, // Track XP change
                        eloChange: 0, // No Elo change
                        reason: "Anwesenheit korrigiert (abgemeldet)",
                        timestamp: serverTimestamp(),
                        awardedBy: "System (Anwesenheit)"
                    });
                }
            }
        }

        await batch.commit();

        feedbackEl.textContent = 'Anwesenheit erfolgreich gespeichert!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';

        setTimeout(() => {
            document.getElementById('attendance-modal').classList.add('hidden');
            feedbackEl.textContent = '';
            renderCalendarCallback(currentCalendarDate); // Kalender neu laden
        }, 1500);

    } catch (error) {
        console.error("Fehler beim Speichern der Anwesenheit:", error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
}

/**
 * Loads players for attendance tracking
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Function} onPlayersLoaded - Callback when players are loaded
 */
export function loadPlayersForAttendance(clubId, db, onPlayersLoaded) {
    const q = query(collection(db, 'users'), where('clubId', '==', clubId), where('role', '==', 'player'));
    onSnapshot(q, (snapshot) => {
        console.log(`[Attendance] Loaded ${snapshot.docs.length} player documents from Firestore`);

        // Use Map to prevent duplicate players
        // Deduplicate by document ID first, then by email or name combination
        const playersMap = new Map();
        const seenIdentifiers = new Set();
        let duplicateCount = 0;

        snapshot.docs.forEach(doc => {
            const playerData = { id: doc.id, ...doc.data() };

            // Create unique identifier based on email or name combination
            const emailKey = playerData.email?.toLowerCase()?.trim();
            const nameKey = `${playerData.firstName?.toLowerCase()?.trim()}_${playerData.lastName?.toLowerCase()?.trim()}`;

            // Skip if we've already seen this player (by email or name)
            if (emailKey && seenIdentifiers.has(emailKey)) {
                console.warn(`[Attendance] Duplicate player detected by email: ${playerData.email} (ID: ${playerData.id})`);
                duplicateCount++;
                return;
            }
            if (seenIdentifiers.has(nameKey)) {
                console.warn(`[Attendance] Duplicate player detected by name: ${playerData.firstName} ${playerData.lastName} (ID: ${playerData.id})`);
                duplicateCount++;
                return;
            }

            // Add to map and tracking sets
            playersMap.set(doc.id, playerData);
            if (emailKey) seenIdentifiers.add(emailKey);
            seenIdentifiers.add(nameKey);
        });

        const players = Array.from(playersMap.values());
        console.log(`[Attendance] After deduplication: ${players.length} unique players (removed ${duplicateCount} duplicates)`);

        players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
        onPlayersLoaded(players);
    }, (error) => {
        console.error("Fehler beim Laden der Spieler für die Anwesenheit:", error);
    });
}

/**
 * Updates the attendance count display
 */
export function updateAttendanceCount() {
    const countEl = document.getElementById('attendance-count');
    if (!countEl) return;
    const checkboxes = document.getElementById('attendance-player-list').querySelectorAll('input[type="checkbox"]:checked');
    countEl.textContent = `${checkboxes.length} Spieler anwesend`;
}
