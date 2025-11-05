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
 * Handles calendar day click to open attendance modal
 * @param {Event} e - Click event
 * @param {Array} clubPlayers - List of club players
 * @param {Function} updateAttendanceCount - Callback to update attendance count
 * @param {Function} updatePairingsButtonState - Callback to update pairings button
 */
export async function handleCalendarDayClick(e, clubPlayers, updateAttendanceCount, updatePairingsButtonState) {
    const dayCell = e.target.closest('.calendar-day');
    if (!dayCell || dayCell.classList.contains('disabled')) return;
    const date = dayCell.dataset.date;
    const attendanceData = monthlyAttendance.get(date);
    const modal = document.getElementById('attendance-modal');
    document.getElementById('attendance-modal-date').textContent = new Date(date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('attendance-date-input').value = date;
    document.getElementById('attendance-doc-id-input').value = attendanceData ? attendanceData.id : '';

    const playerListContainer = document.getElementById('attendance-player-list');
    playerListContainer.innerHTML = '';

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

    // Filter players: Only show players who are members of the current subgroup
    const playersInCurrentSubgroup = clubPlayers.filter(player =>
        player.subgroupIDs && player.subgroupIDs.includes(currentSubgroupFilter)
    );

    if (playersInCurrentSubgroup.length === 0) {
        playerListContainer.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p class="text-sm text-gray-600">Keine Spieler in dieser Gruppe gefunden.</p>
                <p class="text-xs text-gray-500 mt-1">Weise Spieler im "Spieler verwalten"-Modal zu.</p>
            </div>
        `;
        modal.classList.remove('hidden');
        return;
    }

    playersInCurrentSubgroup.forEach(player => {
        const isChecked = attendanceData && attendanceData.presentPlayerIds.includes(player.id);
        const div = document.createElement('div');
        div.className = 'flex items-center p-1';
        div.innerHTML = `
            <input id="player-check-${player.id}" name="present" value="${player.id}" type="checkbox" ${isChecked ? 'checked' : ''} class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
            <label for="player-check-${player.id}" class="ml-3 block text-sm font-medium text-gray-700">${player.firstName} ${player.lastName}</label>
            ${!player.isMatchReady ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-auto">Nicht bereit</span>' : ''}
        `;
        playerListContainer.appendChild(div);
    });

    // Event Listener für Zähler und Paarungs-Button hinzufügen
    playerListContainer.addEventListener('change', () => {
        updateAttendanceCount();
        updatePairingsButtonState();
    });

    modal.classList.remove('hidden');

    // Initialen Zustand für Zähler und Button setzen
    updateAttendanceCount();
    updatePairingsButtonState();
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
                    let reason = "Anwesenheit beim Training";

                    if (newStreak >= 5) {
                        pointsToAdd = 20; // 10 base + 10 bonus
                        reason = `Anwesenheit (${newStreak}x Super-Streak)`;
                    } else if (newStreak >= 3) {
                        pointsToAdd = 15; // 10 base + 5 bonus
                        reason = `Anwesenheit (${newStreak}x Streak-Bonus)`;
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
        const players = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
