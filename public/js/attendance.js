import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    doc,
    writeBatch,
    serverTimestamp,
    increment,
    onSnapshot,
    getDoc,
    setDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Attendance Module
 * Handles calendar rendering and attendance tracking for coaches
 * Now also tracks XP (Experience Points) for the new rank system
 * Updated to support subgroups with separate streaks per subgroup
 */

/**
 * Calculates the duration in hours between two time strings
 * @param {string} startTime - Start time in HH:MM format (e.g., "18:00")
 * @param {string} endTime - End time in HH:MM format (e.g., "20:00")
 * @returns {number} Duration in hours (e.g., 2.0)
 */
function calculateTrainingDuration(startTime, endTime) {
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
        console.error('Error calculating training duration:', error);
        return 2.0; // Default to 2 hours
    }
}

// Module state
let monthlyAttendance = new Map();
let monthlySessions = new Map(); // NEW: Store sessions by date
let subgroupsMap = new Map(); // Store subgroups with their colors
let currentSubgroupFilter = 'all'; // Current active subgroup filter
let isRenderingAttendance = false; // Guard to prevent multiple simultaneous renders
let currentSessionId = null; // NEW: Track current session being edited

// Store callbacks for current session
let currentClubPlayers = [];
let currentUpdateAttendanceCount = null;
let currentUpdatePairingsButtonState = null;

/**
 * Sets the current subgroup filter for attendance operations
 * @param {string} subgroupId - Subgroup ID or 'all' for all subgroups
 */
export function setAttendanceSubgroupFilter(subgroupId) {
    currentSubgroupFilter = subgroupId || 'all';
}

/**
 * Gets the current session ID being edited
 * @returns {string|null} Current session ID or null
 */
export function getCurrentSessionId() {
    return currentSessionId;
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
    calendarMonthYear.textContent = date.toLocaleDateString('de-DE', {
        month: 'long',
        year: 'numeric',
    });

    await fetchMonthlyAttendance(year, month, db, currentUserData);

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    for (let i = 0; i < startOffset; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'p-2 border rounded-md bg-gray-50';
        calendarGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // Base styling
        dayCell.className =
            'calendar-day p-2 border rounded-md text-center relative cursor-pointer hover:bg-gray-50 transition-colors';

        const dayNumber = document.createElement('div');
        dayNumber.className = 'font-medium';
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        dayCell.dataset.date = dateString;

        // NEW: Check for sessions on this day
        const sessionsOnDay = monthlySessions.get(dateString) || [];

        if (sessionsOnDay.length > 0) {
            // Add subtle border to indicate sessions exist
            dayCell.classList.add('border-indigo-300');

            // Add indicator dots for sessions
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'flex gap-1 justify-center mt-1';

            // Show up to 3 dots, or a "3+" indicator
            const dotsToShow = Math.min(sessionsOnDay.length, 3);
            for (let i = 0; i < dotsToShow; i++) {
                const session = sessionsOnDay[i];
                const subgroup = subgroupsMap.get(session.subgroupId);
                const color = subgroup ? subgroup.color : '#6366f1'; // Default to indigo

                const dot = document.createElement('div');
                dot.className = 'w-2 h-2 rounded-full';
                dot.style.backgroundColor = color;
                dotsContainer.appendChild(dot);
            }

            if (sessionsOnDay.length > 3) {
                const moreDot = document.createElement('div');
                moreDot.className = 'text-xs text-indigo-600 font-bold';
                moreDot.textContent = '+';
                dotsContainer.appendChild(moreDot);
            }

            dayCell.appendChild(dotsContainer);
        }

        // Remove the green background - we only show colored dots now
        // monthlyAttendance is no longer used for background color

        calendarGrid.appendChild(dayCell);
    }

    // Return a no-op unsubscribe function for compatibility with coach.js
    // (attendance.js doesn't use real-time listeners, so no cleanup needed)
    return () => {};
}

/**
 * Fetches attendance data and training sessions for a specific month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user's data
 */
export async function fetchMonthlyAttendance(year, month, db, currentUserData) {
    monthlyAttendance.clear();
    monthlySessions.clear(); // NEW: Clear sessions
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    try {
        console.log('[fetchMonthlyAttendance] Loading subgroups...');
        // Load subgroups for color mapping
        const subgroupsSnapshot = await getDocs(
            query(collection(db, 'subgroups'), where('clubId', '==', currentUserData.clubId))
        );
        subgroupsMap.clear();
        subgroupsSnapshot.forEach(doc => {
            const data = doc.data();
            subgroupsMap.set(doc.id, {
                name: data.name,
                color: data.color || '#6366f1', // Default to indigo if no color set
            });
        });
        console.log(`[fetchMonthlyAttendance] Loaded ${subgroupsMap.size} subgroups`);
    } catch (error) {
        console.error('[fetchMonthlyAttendance] Error loading subgroups:', error);
        throw error;
    }

    // NEW: Fetch training sessions for the month
    try {
        console.log('[fetchMonthlyAttendance] Loading training sessions...');
        let sessionsQuery;
        if (currentSubgroupFilter === 'all') {
            sessionsQuery = query(
                collection(db, 'trainingSessions'),
                where('clubId', '==', currentUserData.clubId),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                where('cancelled', '==', false)
            );
        } else {
            sessionsQuery = query(
                collection(db, 'trainingSessions'),
                where('clubId', '==', currentUserData.clubId),
                where('subgroupId', '==', currentSubgroupFilter),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                where('cancelled', '==', false)
            );
        }

        const sessionsSnapshot = await getDocs(sessionsQuery);
        sessionsSnapshot.forEach(doc => {
            const sessionData = doc.data();
            const dateKey = sessionData.date;

            if (!monthlySessions.has(dateKey)) {
                monthlySessions.set(dateKey, []);
            }
            monthlySessions.get(dateKey).push({ id: doc.id, ...sessionData });
        });
        console.log(`[fetchMonthlyAttendance] Loaded ${sessionsSnapshot.size} training sessions`);
    } catch (error) {
        console.error('[fetchMonthlyAttendance] Error loading training sessions:', error);
        console.error('[fetchMonthlyAttendance] Query details:', {
            clubId: currentUserData.clubId,
            startDate,
            endDate,
            subgroupFilter: currentSubgroupFilter,
        });
        throw error;
    }

    // Build query based on subgroup filter
    try {
        console.log('[fetchMonthlyAttendance] Loading attendance records...');
        let q;
        if (currentSubgroupFilter === 'all') {
            // Show all attendance events for the club
            q = query(
                collection(db, 'attendance'),
                where('clubId', '==', currentUserData.clubId),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        } else {
            // Show only attendance events for the selected subgroup
            q = query(
                collection(db, 'attendance'),
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
        console.log(`[fetchMonthlyAttendance] Loaded ${querySnapshot.size} attendance records`);
        console.log('[fetchMonthlyAttendance] ✓ All data loaded successfully');
    } catch (error) {
        console.error('[fetchMonthlyAttendance] Error loading attendance records:', error);
        console.error('[fetchMonthlyAttendance] Query details:', {
            clubId: currentUserData.clubId,
            startDate,
            endDate,
            subgroupFilter: currentSubgroupFilter,
        });
        throw error;
    }
}

/**
 * Finds the original attendance points awarded to a player on a specific date
 * Simple approach: Load recent history and sum all POSITIVE attendance entries for this date
 * @param {string} playerId - Player ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @param {string} subgroupName - Subgroup name to match in history (for logging only)
 * @param {Object} db - Firestore database instance
 * @param {string} subgroupId - Subgroup ID for precise matching
 * @returns {Promise<number>} Points to deduct (defaults to 10 if not found)
 */
async function findOriginalAttendancePoints(playerId, date, subgroupName, db, subgroupId) {
    try {
        console.log(
            `[findOriginalAttendancePoints] Searching for attendance on ${date} for subgroup ${subgroupName} (${subgroupId})`
        );

        // Load recent history entries (no complex query to avoid index issues)
        const historyQuery = query(
            collection(db, `users/${playerId}/pointsHistory`),
            orderBy('timestamp', 'desc'),
            limit(100)
        );

        const historySnapshot = await getDocs(historyQuery);
        console.log(
            `[findOriginalAttendancePoints] Loaded ${historySnapshot.size} recent history entries`
        );

        let totalPositivePoints = 0;
        let foundEntries = 0;

        // Find all POSITIVE attendance entries for this date and subgroup
        historySnapshot.forEach(historyDoc => {
            const historyData = historyDoc.data();

            // Check if this is a positive attendance entry (not a correction)
            if (
                historyData.points > 0 &&
                historyData.reason &&
                historyData.reason.includes('Anwesenheit beim Training')
            ) {
                let matchesDate = false;
                let matchesSubgroup = false;

                // Check if date matches (try stored field first, then extract from timestamp)
                if (historyData.date === date) {
                    matchesDate = true;
                } else if (historyData.timestamp) {
                    const entryDate = historyData.timestamp.toDate();
                    const year = entryDate.getFullYear();
                    const month = String(entryDate.getMonth() + 1).padStart(2, '0');
                    const day = String(entryDate.getDate()).padStart(2, '0');
                    const entryDateString = `${year}-${month}-${day}`;
                    if (entryDateString === date) {
                        matchesDate = true;
                    }
                }

                // Check if subgroup matches (try stored field first, then name in reason)
                if (historyData.subgroupId === subgroupId) {
                    matchesSubgroup = true;
                } else if (historyData.reason.includes(subgroupName)) {
                    matchesSubgroup = true;
                }

                if (matchesDate && matchesSubgroup) {
                    console.log(
                        `[findOriginalAttendancePoints] Found entry: ${historyData.reason}, points: ${historyData.points}`
                    );
                    totalPositivePoints += historyData.points;
                    foundEntries++;
                }
            }
        });

        if (foundEntries > 0) {
            console.log(
                `[findOriginalAttendancePoints] ✓ Found ${foundEntries} positive entries, total: ${totalPositivePoints} points`
            );
            return totalPositivePoints;
        }

        // If not found, return base points
        console.warn(
            `[findOriginalAttendancePoints] ✗ No positive attendance entries found for ${date}/${subgroupName}, defaulting to 10`
        );
        return 10;
    } catch (error) {
        console.error('[findOriginalAttendancePoints] Error:', error);
        return 10;
    }
}

/**
 * Recalculates all subsequent training days after a removal
 * This is necessary because removing a day affects the streak count of all future days
 * @param {string} playerId - Player ID
 * @param {string} removedDate - Date that was removed (YYYY-MM-DD)
 * @param {string} subgroupId - Subgroup ID
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Object} batch - Firestore batch
 * @param {string} subgroupName - Subgroup name for history entries
 */
async function recalculateSubsequentDays(
    playerId,
    removedDate,
    subgroupId,
    clubId,
    db,
    batch,
    subgroupName
) {
    const ATTENDANCE_POINTS_BASE = 3; // New system: 3 points base

    try {
        // Find all training days AFTER the removed date for this subgroup
        const subsequentTrainingsQuery = query(
            collection(db, 'attendance'),
            where('clubId', '==', clubId),
            where('subgroupId', '==', subgroupId),
            where('date', '>', removedDate),
            orderBy('date', 'asc')
        );

        const subsequentSnapshot = await getDocs(subsequentTrainingsQuery);
        console.log(
            `[recalculateSubsequentDays] Found ${subsequentSnapshot.size} training days after ${removedDate}`
        );

        // Filter to only days where this player was present
        const playerPresentDays = [];
        subsequentSnapshot.forEach(trainingDoc => {
            const trainingData = trainingDoc.data();
            if (trainingData.presentPlayerIds && trainingData.presentPlayerIds.includes(playerId)) {
                playerPresentDays.push(trainingData.date);
            }
        });

        console.log(
            `[recalculateSubsequentDays] Player was present on ${playerPresentDays.length} subsequent days: ${playerPresentDays.join(', ')}`
        );

        if (playerPresentDays.length === 0) {
            console.log(`[recalculateSubsequentDays] No subsequent days to recalculate`);
            return;
        }

        // Get all trainings in chronological order (to calculate streaks correctly)
        const allTrainingsQuery = query(
            collection(db, 'attendance'),
            where('clubId', '==', clubId),
            where('subgroupId', '==', subgroupId),
            orderBy('date', 'asc')
        );

        const allTrainingsSnapshot = await getDocs(allTrainingsQuery);
        const allTrainingDates = allTrainingsSnapshot.docs
            .map(doc => doc.data())
            .filter(
                training =>
                    training.presentPlayerIds && training.presentPlayerIds.includes(playerId)
            )
            .map(training => training.date)
            .sort();

        console.log(
            `[recalculateSubsequentDays] All training dates (player present): ${allTrainingDates.join(', ')}`
        );

        // Get ALL trainings for this subgroup (to check for gaps)
        const allSubgroupTrainings = allTrainingsSnapshot.docs
            .map(doc => ({ date: doc.data().date, presentPlayerIds: doc.data().presentPlayerIds }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // For each subsequent day where player was present, recalculate
        for (const currentDate of playerPresentDays) {
            // Calculate what the streak SHOULD be for this date
            // We need to count backwards from currentDate and check for consecutive attendance
            let newStreak = 1;

            // Find index of current date in ALL trainings (not just player's)
            const currentIndex = allSubgroupTrainings.findIndex(t => t.date === currentDate);

            // Count backwards - player must have been present at EVERY previous training
            for (let i = currentIndex - 1; i >= 0; i--) {
                const training = allSubgroupTrainings[i];

                if (training.presentPlayerIds && training.presentPlayerIds.includes(playerId)) {
                    // Player was present - streak continues
                    newStreak++;
                } else {
                    // Player was NOT present - streak is broken
                    break;
                }
            }

            console.log(
                `[recalculateSubsequentDays] Date ${currentDate}: new streak = ${newStreak}`
            );

            // Calculate NEW points based on new streak (New System)
            let newPoints = ATTENDANCE_POINTS_BASE; // 3 points default
            if (newStreak >= 5) {
                newPoints = 6; // 3 base + 3 bonus
            } else if (newStreak >= 3) {
                newPoints = 5; // 3 base + 2 bonus
            }

            // NEW: Check if player attended another training on the same day
            // If yes, apply half points for second training
            const otherTrainingsQuery = query(
                collection(db, 'attendance'),
                where('clubId', '==', clubId),
                where('date', '==', currentDate),
                where('presentPlayerIds', 'array-contains', playerId)
            );
            const otherTrainingsSnapshot = await getDocs(otherTrainingsQuery);
            // If there are 2+ trainings on this day, this is a second/third training
            const isSecondTrainingOrMore = otherTrainingsSnapshot.size > 1;

            if (isSecondTrainingOrMore) {
                newPoints = Math.ceil(newPoints / 2); // Half points for 2nd+ training
                console.log(
                    `[recalculateSubsequentDays] Date ${currentDate}: is 2nd+ training, reducing to ${newPoints} points`
                );
            }

            // Find OLD points that were awarded
            const oldPoints = await findOriginalAttendancePoints(
                playerId,
                currentDate,
                subgroupName,
                db,
                subgroupId
            );

            console.log(
                `[recalculateSubsequentDays] Date ${currentDate}: old points = ${oldPoints}, new points = ${newPoints}`
            );

            // If points changed, create correction entry
            if (oldPoints !== newPoints) {
                const pointsDifference = newPoints - oldPoints;

                console.log(
                    `[recalculateSubsequentDays] Adjusting ${pointsDifference} points for ${currentDate}`
                );

                // Format date for display in history
                const formattedDate = new Date(currentDate + 'T12:00:00').toLocaleDateString(
                    'de-DE',
                    {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                    }
                );

                // Update player's points and XP
                const playerRef = doc(db, 'users', playerId);
                batch.update(playerRef, {
                    points: increment(pointsDifference),
                    xp: increment(pointsDifference),
                });

                // Create history entry for the correction
                const historyRef = doc(collection(db, `users/${playerId}/pointsHistory`));
                batch.set(historyRef, {
                    points: pointsDifference,
                    xp: pointsDifference,
                    eloChange: 0,
                    reason: `Anwesenheit neu berechnet am ${formattedDate} (Streak-Korrektur: ${oldPoints}→${newPoints}) - ${subgroupName}`,
                    date: currentDate,
                    subgroupId: subgroupId,
                    timestamp: serverTimestamp(),
                    awardedBy: 'System (Neuberechnung)',
                });

                // XP history
                const xpHistoryRef = doc(collection(db, `users/${playerId}/xpHistory`));
                batch.set(xpHistoryRef, {
                    xp: pointsDifference,
                    reason: `Anwesenheit neu berechnet am ${formattedDate} (Streak-Korrektur: ${oldPoints}→${newPoints}) - ${subgroupName}`,
                    date: currentDate,
                    subgroupId: subgroupId,
                    timestamp: serverTimestamp(),
                    awardedBy: 'System (Neuberechnung)',
                });
            }

            // Always update the streak count for the latest day (to keep it in sync)
            if (currentDate === playerPresentDays[playerPresentDays.length - 1]) {
                const streakRef = doc(db, `users/${playerId}/streaks`, subgroupId);
                batch.set(streakRef, {
                    count: newStreak,
                    subgroupId: subgroupId,
                    lastUpdated: serverTimestamp(),
                });
                console.log(
                    `[recalculateSubsequentDays] Updated streak subcollection: ${newStreak}`
                );
            }
        }

        console.log(`[recalculateSubsequentDays] Recalculation complete`);
    } catch (error) {
        console.error('[recalculateSubsequentDays] Error during recalculation:', error);
        // Don't throw - let the main operation continue even if recalculation fails
    }
}

/**
 * Updates the streak subcollection after removing a day
 * This ensures the streak reflects the actual consecutive attendance
 * @param {string} playerId - Player ID
 * @param {string} removedDate - Date that was removed (YYYY-MM-DD)
 * @param {string} subgroupId - Subgroup ID
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {Object} batch - Firestore batch
 */
async function updateStreakAfterRemoval(playerId, removedDate, subgroupId, clubId, db, batch) {
    try {
        // Get all trainings for this subgroup (in order)
        const allTrainingsQuery = query(
            collection(db, 'attendance'),
            where('clubId', '==', clubId),
            where('subgroupId', '==', subgroupId),
            orderBy('date', 'desc')
        );

        const allTrainingsSnapshot = await getDocs(allTrainingsQuery);

        // Get all trainings WITH present status
        const allTrainings = allTrainingsSnapshot.docs
            .map(doc => ({
                date: doc.data().date,
                presentPlayerIds: doc.data().presentPlayerIds || [],
            }))
            .sort((a, b) => b.date.localeCompare(a.date)); // Sort descending (newest first)

        // Find the MOST RECENT training where player was present
        let latestPresentDate = null;
        for (const training of allTrainings) {
            if (training.presentPlayerIds.includes(playerId)) {
                latestPresentDate = training.date;
                break;
            }
        }

        if (!latestPresentDate) {
            // Player has no remaining attendance records - set streak to 0
            console.log(
                `[updateStreakAfterRemoval] No remaining attendance records, setting streak to 0`
            );
            const streakRef = doc(db, `users/${playerId}/streaks`, subgroupId);
            batch.set(streakRef, {
                count: 0,
                subgroupId: subgroupId,
                lastUpdated: serverTimestamp(),
            });
            return;
        }

        console.log(`[updateStreakAfterRemoval] Latest present date: ${latestPresentDate}`);

        // Calculate streak for the latest present date
        // Sort all trainings in ascending order for streak calculation
        const sortedTrainings = [...allTrainings].sort((a, b) => a.date.localeCompare(b.date));

        // Find index of latest present date
        const latestIndex = sortedTrainings.findIndex(t => t.date === latestPresentDate);
        let streak = 1;

        // Count backwards from latest date
        for (let i = latestIndex - 1; i >= 0; i--) {
            const training = sortedTrainings[i];
            if (training.presentPlayerIds.includes(playerId)) {
                streak++;
            } else {
                // Gap found - streak breaks
                break;
            }
        }

        console.log(
            `[updateStreakAfterRemoval] Calculated streak: ${streak} for date ${latestPresentDate}`
        );

        // Update streak subcollection
        const streakRef = doc(db, `users/${playerId}/streaks`, subgroupId);
        batch.set(streakRef, {
            count: streak,
            subgroupId: subgroupId,
            lastUpdated: serverTimestamp(),
        });
    } catch (error) {
        console.error('[updateStreakAfterRemoval] Error:', error);
        // Don't throw - let the main operation continue
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
export async function handleCalendarDayClick(
    e,
    clubPlayers,
    updateAttendanceCount,
    updatePairingsButtonState,
    db,
    clubId
) {
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

        // Check for sessions on this day
        const sessionsOnDay = monthlySessions.get(date) || [];

        if (sessionsOnDay.length === 0) {
            // No sessions - directly show modal to create one
            isRenderingAttendance = false;
            if (window.openSpontaneousSessionModalFromCalendar) {
                window.openSpontaneousSessionModalFromCalendar(date);
            } else {
                alert('Keine Trainings an diesem Tag. Bitte erstelle ein Training.');
            }
            return;
        } else {
            // One or more sessions - always show selection modal
            // Coach can choose: record attendance for a session OR add another training
            isRenderingAttendance = false;
            if (window.openSessionSelectionModalFromCalendar) {
                window.openSessionSelectionModalFromCalendar(date, sessionsOnDay);
            }
            return;
        }
    } catch (error) {
        console.error('[handleCalendarDayClick] Error:', error);
        isRenderingAttendance = false;
    }
}

/**
 * NEW: Open attendance modal for a specific session
 * @param {string} sessionId - Session ID
 * @param {string} date - Date string
 * @param {Array} clubPlayers - Array of players
 * @param {Function} updateAttendanceCount - Callback
 * @param {Function} updatePairingsButtonState - Callback
 * @param {Object} db - Firestore instance
 * @param {string} clubId - Club ID
 */
export async function openAttendanceModalForSession(
    sessionId,
    date,
    clubPlayers,
    updateAttendanceCount,
    updatePairingsButtonState,
    db,
    clubId
) {
    try {
        currentSessionId = sessionId;

        // Store callbacks for later use
        currentClubPlayers = clubPlayers;
        currentUpdateAttendanceCount = updateAttendanceCount;
        currentUpdatePairingsButtonState = updatePairingsButtonState;

        // Get session data
        const sessionDoc = await getDoc(doc(db, 'trainingSessions', sessionId));
        if (!sessionDoc.exists()) {
            alert('Session nicht gefunden!');
            isRenderingAttendance = false;
            return;
        }

        const sessionData = sessionDoc.data();
        const subgroupId = sessionData.subgroupId;

        // Check if attendance already exists for this session
        const attendanceQuery = query(
            collection(db, 'attendance'),
            where('sessionId', '==', sessionId)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        const attendanceData = attendanceSnapshot.empty
            ? null
            : {
                  id: attendanceSnapshot.docs[0].id,
                  ...attendanceSnapshot.docs[0].data(),
              };

        // Load coaches for the club
        const coachesQuery = query(
            collection(db, 'users'),
            where('clubId', '==', clubId),
            where('role', '==', 'coach')
        );
        const coachesSnapshot = await getDocs(coachesQuery);
        const coaches = coachesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        const modal = document.getElementById('attendance-modal');
        document.getElementById('attendance-modal-date').textContent =
            `${new Date(date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} - ${sessionData.startTime}-${sessionData.endTime}`;
        document.getElementById('attendance-date-input').value = date;
        document.getElementById('attendance-doc-id-input').value = attendanceData
            ? attendanceData.id
            : '';

        // Store sessionId in a hidden field
        let sessionIdInput = document.getElementById('attendance-session-id-input');
        if (!sessionIdInput) {
            sessionIdInput = document.createElement('input');
            sessionIdInput.type = 'hidden';
            sessionIdInput.id = 'attendance-session-id-input';
            document.getElementById('attendance-form').appendChild(sessionIdInput);
        }
        sessionIdInput.value = sessionId;

        // Populate coach checkboxes with hours input
        const coachListContainer = document.getElementById('attendance-coach-list');
        coachListContainer.innerHTML = '';

        // Calculate default training duration in hours
        const defaultDuration = calculateTrainingDuration(sessionData.startTime, sessionData.endTime);

        if (coaches.length === 0) {
            coachListContainer.innerHTML = '<p class="text-sm text-gray-400">Keine Trainer gefunden</p>';
        } else {
            coaches.forEach(coach => {
                // Check if coach was present (supports both old and new format)
                let isChecked = false;
                let savedHours = defaultDuration;

                // New format: coaches array with {id, hours}
                if (attendanceData && attendanceData.coaches && Array.isArray(attendanceData.coaches)) {
                    const coachData = attendanceData.coaches.find(c => c.id === coach.id);
                    if (coachData) {
                        isChecked = true;
                        savedHours = coachData.hours || defaultDuration;
                    }
                }
                // Old format: coachIds array (backward compatibility)
                else if (attendanceData && attendanceData.coachIds && attendanceData.coachIds.includes(coach.id)) {
                    isChecked = true;
                    savedHours = defaultDuration;
                }
                // Very old format: single coachId (backward compatibility)
                else if (attendanceData && attendanceData.coachId === coach.id) {
                    isChecked = true;
                    savedHours = defaultDuration;
                }

                const div = document.createElement('div');
                div.className = 'flex items-center gap-3 mb-2';
                div.innerHTML = `
                    <input
                        id="coach-check-${coach.id}"
                        name="coaches"
                        value="${coach.id}"
                        type="checkbox"
                        ${isChecked ? 'checked' : ''}
                        class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        onchange="document.getElementById('coach-hours-${coach.id}').disabled = !this.checked"
                    >
                    <label for="coach-check-${coach.id}" class="block text-sm text-gray-700 flex-1">
                        ${coach.firstName} ${coach.lastName}
                    </label>
                    <div class="flex items-center gap-1">
                        <input
                            id="coach-hours-${coach.id}"
                            name="coach-hours"
                            data-coach-id="${coach.id}"
                            type="number"
                            min="0"
                            max="24"
                            step="0.5"
                            value="${savedHours}"
                            ${!isChecked ? 'disabled' : ''}
                            class="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
                        >
                        <span class="text-xs text-gray-500">h</span>
                    </div>
                `;
                coachListContainer.appendChild(div);
            });
        }

        const playerListContainer = document.getElementById('attendance-player-list');

        // Force clear the container - remove all children
        while (playerListContainer.firstChild) {
            playerListContainer.removeChild(playerListContainer.firstChild);
        }

        console.log(
            `[Attendance Modal] Container cleared, checkboxes count: ${playerListContainer.querySelectorAll('input[type="checkbox"]').length}`
        );
        console.log(`[Attendance Modal] Total players in clubPlayers: ${clubPlayers.length}`);
        console.log(`[Attendance Modal] Session subgroup: ${subgroupId}`);

        // Filter players: Only show players who are members of the session's subgroup
        const playersInCurrentSubgroup = clubPlayers.filter(
            player => player.subgroupIDs && player.subgroupIDs.includes(subgroupId)
        );

        console.log(
            `[Attendance Modal] Players in current subgroup (before dedup): ${playersInCurrentSubgroup.length}`
        );

        // Deduplicate players by ID to prevent duplicates in the UI
        const playersMap = new Map();
        let dedupCount = 0;
        playersInCurrentSubgroup.forEach(player => {
            if (playersMap.has(player.id)) {
                dedupCount++;
            }
            playersMap.set(player.id, player);
        });
        const uniquePlayers = Array.from(playersMap.values());

        console.log(
            `[Attendance Modal] Unique players after dedup: ${uniquePlayers.length} (removed ${dedupCount} duplicates)`
        );

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

        // Render players
        for (const player of uniquePlayers) {
            const isChecked = attendanceData && attendanceData.presentPlayerIds.includes(player.id);

            const div = document.createElement('div');
            div.className = 'flex items-center p-2 rounded-md';
            div.innerHTML = `
                <input id="player-check-${player.id}" name="present" value="${player.id}" type="checkbox" ${isChecked ? 'checked' : ''} class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                <label for="player-check-${player.id}" class="ml-3 block text-sm font-medium text-gray-700">${player.firstName} ${player.lastName}</label>
                ${!player.isMatchReady ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-auto">Nicht bereit</span>' : ''}
            `;
            playerListContainer.appendChild(div);
        }

        console.log(
            `[Attendance Modal] Rendered ${uniquePlayers.length} players in the attendance list`
        );
        console.log(
            `[Attendance Modal] Total checkboxes in DOM: ${playerListContainer.querySelectorAll('input[type="checkbox"]').length}`
        );

        modal.classList.remove('hidden');

        // Initialen Zustand für Zähler und Button setzen
        if (currentUpdateAttendanceCount) currentUpdateAttendanceCount();
        if (currentUpdatePairingsButtonState)
            currentUpdatePairingsButtonState(currentClubPlayers, subgroupId);
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
export async function handleAttendanceSave(
    e,
    db,
    currentUserData,
    clubPlayers,
    currentCalendarDate,
    renderCalendarCallback
) {
    e.preventDefault();
    const feedbackEl = document.getElementById('attendance-feedback');
    feedbackEl.textContent = 'Speichere...';

    const date = document.getElementById('attendance-date-input').value;
    const docId = document.getElementById('attendance-doc-id-input').value;
    const sessionIdInput = document.getElementById('attendance-session-id-input');
    const sessionId = sessionIdInput ? sessionIdInput.value : null; // NEW: Get session ID
    const ATTENDANCE_POINTS_BASE = 3; // New system: 3 points base

    // NEW: If no sessionId, we can't save (must have a training session)
    if (!sessionId) {
        feedbackEl.textContent =
            'Keine Training-Session gefunden. Bitte erstelle zuerst ein Training.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    // NEW: Load session to get subgroup
    let subgroupId, subgroupName;
    try {
        const sessionDoc = await getDoc(doc(db, 'trainingSessions', sessionId));
        if (!sessionDoc.exists()) {
            feedbackEl.textContent = 'Training-Session nicht gefunden!';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
        subgroupId = sessionDoc.data().subgroupId;

        // Load subgroup name for history
        const subgroupDoc = await getDoc(doc(db, 'subgroups', subgroupId));
        if (subgroupDoc.exists()) {
            subgroupName = subgroupDoc.data().name;
        } else {
            subgroupName = subgroupId;
        }
    } catch (error) {
        console.error('Error loading session/subgroup:', error);
        feedbackEl.textContent = 'Fehler beim Laden der Session-Daten';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    const allPlayerCheckboxes = document
        .getElementById('attendance-player-list')
        .querySelectorAll('input[type="checkbox"]');
    const presentPlayerIds = Array.from(allPlayerCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);

    // Get selected coaches with their hours
    const coachCheckboxes = document
        .getElementById('attendance-coach-list')
        .querySelectorAll('input[type="checkbox"]');
    const coaches = Array.from(coachCheckboxes)
        .filter(checkbox => checkbox.checked)
        .map(checkbox => {
            const coachId = checkbox.value;
            const hoursInput = document.getElementById(`coach-hours-${coachId}`);
            const hours = hoursInput ? parseFloat(hoursInput.value) || 0 : 0;
            return { id: coachId, hours };
        });

    // IMPORTANT: Get previous attendance for THIS SPECIFIC SESSION, not just this date!
    // We need to distinguish between different training sessions on the same day
    let previouslyPresentIdsOnThisDay = [];
    if (docId) {
        // If docId exists, load the previous attendance data for this session
        try {
            const attendanceDoc = await getDoc(doc(db, 'attendance', docId));
            if (attendanceDoc.exists()) {
                previouslyPresentIdsOnThisDay = attendanceDoc.data().presentPlayerIds || [];
            }
        } catch (error) {
            console.error('[Attendance Save] Error loading previous attendance:', error);
        }
    }

    console.log(`[Attendance Save] Session ${sessionId}, Date: ${date}`);
    console.log(
        `  - Previously present in THIS session: ${previouslyPresentIdsOnThisDay.length} players`
    );
    console.log(`  - Now present in THIS session: ${presentPlayerIds.length} players`);

    try {
        const batch = writeBatch(db);

        // Find the last training day for THIS SUBGROUP before the current date
        const attendanceColl = collection(db, 'attendance');
        const q = query(
            attendanceColl,
            where('clubId', '==', currentUserData.clubId),
            where('subgroupId', '==', subgroupId), // CHANGED: Use subgroupId from session
            where('date', '<', date),
            orderBy('date', 'desc'),
            limit(1)
        );
        const previousTrainingSnapshot = await getDocs(q);

        let previousTrainingPresentIds = [];
        if (!previousTrainingSnapshot.empty) {
            previousTrainingPresentIds =
                previousTrainingSnapshot.docs[0].data().presentPlayerIds || [];
        }

        // Handle attendance document: delete if empty, create/update otherwise
        const attendanceRef = docId ? doc(db, 'attendance', docId) : doc(attendanceColl);

        if (presentPlayerIds.length === 0) {
            // If no players are present and an attendance entry exists, delete it
            if (docId) {
                batch.delete(attendanceRef);
            }
            // If no entry exists and no players present, we don't need to do anything
        } else {
            // Update/create attendance document for this session
            const attendanceData = {
                date,
                clubId: currentUserData.clubId,
                subgroupId, // CHANGED: Use subgroupId from session
                sessionId, // NEW: Add sessionId
                presentPlayerIds,
                updatedAt: serverTimestamp(),
            };

            // Add coaches with hours if selected
            if (coaches && coaches.length > 0) {
                attendanceData.coaches = coaches;
            }

            batch.set(attendanceRef, attendanceData, { merge: true });
        }

        // Process EVERY player in the club and update their subgroup-specific streak and points
        // Filter to only process players who are members of this subgroup
        const playersInSubgroup = clubPlayers.filter(
            p => p.subgroupIDs && p.subgroupIDs.includes(subgroupId) // CHANGED: Use subgroupId from session
        );

        for (const player of playersInSubgroup) {
            const playerRef = doc(db, 'users', player.id);
            const streakRef = doc(db, `users/${player.id}/streaks`, subgroupId); // CHANGED: Use subgroupId from session

            const isPresentToday = presentPlayerIds.includes(player.id);
            const wasPresentPreviouslyOnThisDay = previouslyPresentIdsOnThisDay.includes(player.id);

            // CASE 1: Player is present today
            if (isPresentToday) {
                // Only execute if player was NEWLY marked as present for this day
                if (!wasPresentPreviouslyOnThisDay) {
                    // Get current streak from subcollection
                    const streakDoc = await getDoc(streakRef);
                    const currentStreak = streakDoc.exists() ? streakDoc.data().count || 0 : 0;

                    const wasPresentLastTraining = previousTrainingPresentIds.includes(player.id);

                    // Streak logic
                    const newStreak = wasPresentLastTraining ? currentStreak + 1 : 1;

                    // NEW: Check if player already attended another training on the same day
                    const otherTrainingsToday = query(
                        collection(db, 'attendance'),
                        where('clubId', '==', currentUserData.clubId),
                        where('date', '==', date),
                        where('presentPlayerIds', 'array-contains', player.id)
                    );
                    const otherTrainingsTodaySnapshot = await getDocs(otherTrainingsToday);

                    // IMPORTANT: Exclude the CURRENT session/document from the count!
                    // We need to filter out both:
                    // 1. The current sessionId (to exclude this session)
                    // 2. The current docId (if editing an existing document, to exclude this specific record)
                    const otherTrainingsCount = otherTrainingsTodaySnapshot.docs.filter(
                        docSnapshot => {
                            const docData = docSnapshot.data();

                            // Only count documents that have a sessionId
                            // This prevents old documents without sessionId from being counted
                            if (!docData.sessionId) {
                                console.warn(
                                    `[Attendance Save] Found attendance document without sessionId: ${docSnapshot.id}`
                                );
                                return false; // Skip documents without sessionId
                            }

                            // Exclude if it's the same session
                            if (docData.sessionId === sessionId) {
                                return false;
                            }

                            // ALSO exclude if it's the current document being edited
                            // This handles the case where we're updating an existing attendance record
                            if (docId && docSnapshot.id === docId) {
                                return false;
                            }

                            return true;
                        }
                    ).length;
                    const alreadyAttendedToday = otherTrainingsCount > 0;

                    // Format date for display in history
                    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                    });

                    // Bonus points logic (New System)
                    let pointsToAdd = ATTENDANCE_POINTS_BASE; // 3 points default
                    let reason = `Training am ${formattedDate} - ${subgroupName}`;

                    if (newStreak >= 5) {
                        pointsToAdd = 6; // 3 base + 3 bonus (Super-Streak)
                        reason = `Training am ${formattedDate} - ${subgroupName} (🔥 ${newStreak}x Streak!)`;
                    } else if (newStreak >= 3) {
                        pointsToAdd = 5; // 3 base + 2 bonus (Streak-Bonus)
                        reason = `Training am ${formattedDate} - ${subgroupName} (⚡ ${newStreak}x Streak)`;
                    }

                    console.log(`  - Points BEFORE half-points check: ${pointsToAdd}`);

                    // NEW: If player already attended another training today, give half points
                    if (alreadyAttendedToday) {
                        const originalPoints = pointsToAdd;
                        pointsToAdd = Math.ceil(pointsToAdd / 2); // Half points, rounded up
                        reason += ` (2. Training heute)`;
                        console.log(`  - APPLYING HALF POINTS: ${originalPoints} → ${pointsToAdd}`);
                    }

                    console.log(`  - FINAL points to add: ${pointsToAdd}`);

                    // Update streak in subcollection
                    batch.set(streakRef, {
                        count: newStreak,
                        subgroupId: subgroupId,
                        lastUpdated: serverTimestamp(),
                    });

                    // Update global player points and XP
                    batch.update(playerRef, {
                        points: increment(pointsToAdd),
                        xp: increment(pointsToAdd), // XP = same as points for attendance
                        lastXPUpdate: serverTimestamp(),
                    });

                    const historyRef = doc(collection(db, `users/${player.id}/pointsHistory`));
                    batch.set(historyRef, {
                        points: pointsToAdd,
                        xp: pointsToAdd, // Track XP change (same as points for attendance)
                        eloChange: 0, // No Elo change for attendance
                        reason,
                        date: date, // Store date for easier lookup when correcting
                        subgroupId: subgroupId, // Store subgroup ID for precise matching
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Anwesenheit)',
                    });

                    // Track XP in separate history
                    const xpHistoryRef = doc(collection(db, `users/${player.id}/xpHistory`));
                    batch.set(xpHistoryRef, {
                        xp: pointsToAdd,
                        reason,
                        date: date, // Store date for easier lookup
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Anwesenheit)',
                    });
                }
            }
            // CASE 2: Player is NOT present today
            else {
                // If coach unchecked the player for this day, deduct the originally awarded points
                if (wasPresentPreviouslyOnThisDay) {
                    // Find the original points awarded for this date by searching pointsHistory
                    const pointsToDeduct = await findOriginalAttendancePoints(
                        player.id,
                        date,
                        subgroupName,
                        db,
                        subgroupId
                    );

                    // Format date for display in history
                    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                    });

                    // Deduct both points and XP
                    batch.update(playerRef, {
                        points: increment(-pointsToDeduct),
                        xp: increment(-pointsToDeduct),
                    });

                    // Create negative entry in history
                    const historyRef = doc(collection(db, `users/${player.id}/pointsHistory`));
                    batch.set(historyRef, {
                        points: -pointsToDeduct,
                        xp: -pointsToDeduct,
                        eloChange: 0,
                        reason: `Anwesenheit korrigiert am ${formattedDate} (${pointsToDeduct} Punkte abgezogen) - ${subgroupName}`,
                        date: date, // Store date for tracking
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Anwesenheit)',
                    });

                    // Track XP deduction in xpHistory as well
                    const xpHistoryRef = doc(collection(db, `users/${player.id}/xpHistory`));
                    batch.set(xpHistoryRef, {
                        xp: -pointsToDeduct,
                        reason: `Anwesenheit korrigiert am ${formattedDate} (${pointsToDeduct} XP abgezogen) - ${subgroupName}`,
                        date: date, // Store date for tracking
                        subgroupId: subgroupId,
                        timestamp: serverTimestamp(),
                        awardedBy: 'System (Anwesenheit)',
                    });

                    // IMPORTANT: Recalculate all subsequent training days
                    // When we remove a day, all future days need to be recalculated
                    // because their streaks might have changed
                    await recalculateSubsequentDays(
                        player.id,
                        date,
                        subgroupId,
                        currentUserData.clubId,
                        db,
                        batch,
                        subgroupName
                    );

                    // IMPORTANT: Update the streak subcollection
                    // If we removed the last day, recalculateSubsequentDays won't update the streak
                    // So we need to calculate the correct streak based on remaining trainings
                    await updateStreakAfterRemoval(
                        player.id,
                        date,
                        subgroupId,
                        currentUserData.clubId,
                        db,
                        batch
                    );
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
        console.error('Fehler beim Speichern der Anwesenheit:', error);
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
    // PAGINATION: Limit to 300 players for performance (covers 99% of clubs)
    const PLAYER_LIMIT = 300;
    const q = query(
        collection(db, 'users'),
        where('clubId', '==', clubId),
        where('role', '==', 'player'),
        orderBy('lastName', 'asc'), // Consistent ordering for pagination
        limit(PLAYER_LIMIT) // Limit for scalability
    );

    // Helper function to process players (deduplication logic)
    const processPlayers = snapshot => {
        const totalLoaded = snapshot.docs.length;
        const hitLimit = totalLoaded === PLAYER_LIMIT;

        console.log(
            `[Attendance] Loaded ${totalLoaded} player documents from Firestore${hitLimit ? ' (limit reached)' : ''}`
        );

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
                duplicateCount++;
                return;
            }
            if (seenIdentifiers.has(nameKey)) {
                duplicateCount++;
                return;
            }

            // Add to map and tracking sets
            playersMap.set(doc.id, playerData);
            if (emailKey) seenIdentifiers.add(emailKey);
            seenIdentifiers.add(nameKey);
        });

        const players = Array.from(playersMap.values());
        console.log(
            `[Attendance] After deduplication: ${players.length} unique players (removed ${duplicateCount} duplicates)`
        );

        // Warn if we hit the limit (club might have more players)
        if (hitLimit) {
            console.warn(
                `[Attendance] ⚠️ Player limit (${PLAYER_LIMIT}) reached! Club may have more players.`
            );
            console.warn(
                '[Attendance] Consider implementing "Load More" functionality for larger clubs.'
            );
        }

        players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
        return players;
    };

    // OPTIMIZATION: Initial load with getDocs (fast, one-time)
    getDocs(q)
        .then(snapshot => {
            console.log('[Attendance] ⚡ Initial load complete (getDocs - optimized)');
            const players = processPlayers(snapshot);
            onPlayersLoaded(players);

            // OPTIMIZATION: Then activate live updates with debouncing
            let debounceTimeout = null;
            const unsubscribe = onSnapshot(
                q,
                snapshot => {
                    console.log('[Attendance] 🔄 Live update received, debouncing...');

                    // Clear existing timeout
                    if (debounceTimeout) clearTimeout(debounceTimeout);

                    // Debounce updates (500ms) - bundles rapid changes
                    debounceTimeout = setTimeout(() => {
                        console.log('[Attendance] ✅ Processing debounced live update');
                        const players = processPlayers(snapshot);
                        onPlayersLoaded(players);
                    }, 500);
                },
                error => {
                    console.error('Fehler beim Laden der Spieler für die Anwesenheit:', error);
                }
            );

            // Store unsubscribe function for cleanup
            if (!window.attendanceUnsubscribes) window.attendanceUnsubscribes = [];
            window.attendanceUnsubscribes.push(unsubscribe);
        })
        .catch(error => {
            console.error('[Attendance] ❌ Error during initial load:', error);
        });
}

/**
 * Updates the attendance count display
 */
export function updateAttendanceCount() {
    const countEl = document.getElementById('attendance-count');
    if (!countEl) return;
    const checkboxes = document
        .getElementById('attendance-player-list')
        .querySelectorAll('input[type="checkbox"]:checked');
    countEl.textContent = `${checkboxes.length} Spieler anwesend`;
}
