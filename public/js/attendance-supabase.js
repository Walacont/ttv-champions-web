// Attendance Module - Supabase Version
// SC Champions - Migration von Firebase zu Supabase
// Multi-sport support: Attendance is filtered by active sport

import { getSupabase } from './supabase-init.js';
import { getSportContext } from './sport-context-supabase.js';

/**
 * Attendance Module - Supabase Version
 * Handles calendar rendering and attendance tracking for coaches
 * Supports subgroups with separate streaks per subgroup
 * Multi-sport: Filters attendance by active sport
 */

const supabase = getSupabase();

// Module state
let monthlyAttendance = new Map();
let monthlyEvents = new Map();
let subgroupsMap = new Map();
let currentSubgroupFilter = 'all';
let isRenderingAttendance = false;
let currentSessionId = null;

// Store callbacks for current session
let currentClubPlayers = [];
let currentUpdateAttendanceCount = null;
let currentUpdatePairingsButtonState = null;

// Constants
const ATTENDANCE_POINTS_BASE = 3;

/**
 * Calculates the duration in hours between two time strings
 */
function calculateTrainingDuration(startTime, endTime) {
    try {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);

        const startTotalMinutes = startHour * 60 + startMinute;
        const endTotalMinutes = endHour * 60 + endMinute;

        const durationMinutes = endTotalMinutes - startTotalMinutes;
        const durationHours = durationMinutes / 60;

        return Math.round(durationHours * 10) / 10;
    } catch (error) {
        console.error('Error calculating training duration:', error);
        return 2.0;
    }
}

/**
 * Sets the current subgroup filter for attendance operations
 */
export function setAttendanceSubgroupFilter(subgroupId) {
    currentSubgroupFilter = subgroupId || 'all';
}

/**
 * Gets the current session ID being edited
 */
export function getCurrentSessionId() {
    return currentSessionId;
}

/**
 * Renders the calendar for a given month and year
 */
export async function renderCalendar(date, currentUserData) {
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

    await fetchMonthlyAttendance(year, month, currentUserData);

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

        dayCell.className =
            'calendar-day p-2 border rounded-md text-center relative cursor-pointer hover:bg-gray-50 transition-colors';

        const dayNumber = document.createElement('div');
        dayNumber.className = 'font-medium';
        dayNumber.textContent = day;
        dayCell.appendChild(dayNumber);

        dayCell.dataset.date = dateString;

        // Check for events on this day
        const eventsOnDay = monthlyEvents.get(dateString) || [];

        if (eventsOnDay.length > 0) {
            dayCell.classList.add('border-indigo-300');

            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'flex gap-1 justify-center mt-1 flex-wrap';

            // Add event dots with subgroup colors
            const eventsToShow = Math.min(eventsOnDay.length, 4);
            for (let i = 0; i < eventsToShow; i++) {
                const event = eventsOnDay[i];
                // Use first subgroup color, or default indigo for club-wide events
                const color = event.subgroupColor || '#6366f1';

                const dot = document.createElement('div');
                dot.className = 'w-2 h-2 rounded-full';
                dot.style.backgroundColor = color;
                dot.title = event.title;
                dotsContainer.appendChild(dot);
            }

            // Show + if there are more events
            if (eventsOnDay.length > 4) {
                const moreDot = document.createElement('div');
                moreDot.className = 'text-xs text-indigo-600 font-bold';
                moreDot.textContent = '+';
                dotsContainer.appendChild(moreDot);
            }

            dayCell.appendChild(dotsContainer);
        }

        calendarGrid.appendChild(dayCell);
    }

    return () => {};
}

/**
 * Fetches attendance data and events for a specific month
 */
export async function fetchMonthlyAttendance(year, month, currentUserData) {
    monthlyAttendance.clear();
    monthlyEvents.clear();

    // Check for valid clubId before querying
    if (!currentUserData?.clubId) {
        console.warn('[fetchMonthlyAttendance] No clubId provided, skipping');
        return;
    }

    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    // Get sport context for multi-sport filtering
    const sportContext = await getSportContext(currentUserData.id);
    const effectiveClubId = sportContext?.clubId || currentUserData.clubId;
    const activeSportId = sportContext?.sportId;

    try {
        // Load subgroups for color mapping (filtered by sport if available)
        let subgroupsQuery = supabase
            .from('subgroups')
            .select('id, name, color')
            .eq('club_id', effectiveClubId);

        // Filter by sport if available
        if (activeSportId) {
            subgroupsQuery = subgroupsQuery.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: subgroups, error: subError } = await subgroupsQuery;

        if (subError) throw subError;

        subgroupsMap.clear();
        (subgroups || []).forEach(s => {
            subgroupsMap.set(s.id, {
                name: s.name,
                color: s.color || '#6366f1',
            });
        });
    } catch (error) {
        console.error('[fetchMonthlyAttendance] Error loading subgroups:', error);
        throw error;
    }

    // Fetch events for the month (including recurring events)
    try {
        // Query 1: Single events in this month
        const { data: singleEvents, error: singleError } = await supabase
            .from('events')
            .select('id, title, start_date, start_time, target_type, target_subgroup_ids, event_type, repeat_type, repeat_end_date')
            .eq('club_id', effectiveClubId)
            .eq('cancelled', false)
            .or(`event_type.eq.single,event_type.is.null`)
            .gte('start_date', startDate)
            .lte('start_date', endDate);

        // Query 2: Recurring events that might occur in this month
        const { data: recurringEvents, error: recurringError } = await supabase
            .from('events')
            .select('id, title, start_date, start_time, target_type, target_subgroup_ids, event_type, repeat_type, repeat_end_date')
            .eq('club_id', effectiveClubId)
            .eq('cancelled', false)
            .eq('event_type', 'recurring')
            .lte('start_date', endDate)
            .or(`repeat_end_date.gte.${startDate},repeat_end_date.is.null`);

        if (singleError) {
            console.warn('[fetchMonthlyAttendance] Could not load single events:', singleError);
        }
        if (recurringError) {
            console.warn('[fetchMonthlyAttendance] Could not load recurring events:', recurringError);
        }

        // Helper function to add event to a specific date
        const addEventToDate = (dateKey, event) => {
            let subgroupColor = '#6366f1';
            if (event.target_type === 'subgroups' && event.target_subgroup_ids && event.target_subgroup_ids.length > 0) {
                const firstSubgroup = subgroupsMap.get(event.target_subgroup_ids[0]);
                if (firstSubgroup) {
                    subgroupColor = firstSubgroup.color;
                }
            }

            if (!monthlyEvents.has(dateKey)) {
                monthlyEvents.set(dateKey, []);
            }
            monthlyEvents.get(dateKey).push({
                id: event.id,
                title: event.title,
                startTime: event.start_time,
                targetType: event.target_type,
                targetSubgroupIds: event.target_subgroup_ids,
                subgroupColor,
                isRecurring: event.event_type === 'recurring'
            });
        };

        // Process single events
        (singleEvents || []).forEach(e => {
            addEventToDate(e.start_date, e);
        });

        // Process recurring events - generate instances for each matching day in the month
        (recurringEvents || []).forEach(e => {
            const eventStartDate = new Date(e.start_date + 'T12:00:00');
            const monthStart = new Date(startDate + 'T12:00:00');
            const monthEnd = new Date(endDate + 'T12:00:00');
            const repeatEndDate = e.repeat_end_date ? new Date(e.repeat_end_date + 'T12:00:00') : null;
            const excludedDates = e.excluded_dates || [];

            // Get the day of week for the original event (0 = Sunday, 1 = Monday, etc.)
            const eventDayOfWeek = eventStartDate.getDay();

            // Iterate through each day in the month
            for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                // Skip if before event start date
                if (d < eventStartDate) continue;

                // Skip if after repeat end date
                if (repeatEndDate && d > repeatEndDate) continue;

                const currentDateString = d.toISOString().split('T')[0];

                // Skip if this date is in the excluded dates list
                if (excludedDates.includes(currentDateString)) continue;

                // Check if this day matches the repeat pattern
                if (e.repeat_type === 'weekly') {
                    // Weekly: same day of week
                    if (d.getDay() === eventDayOfWeek) {
                        addEventToDate(currentDateString, e);
                    }
                } else if (e.repeat_type === 'daily') {
                    // Daily: every day
                    addEventToDate(currentDateString, e);
                } else if (e.repeat_type === 'monthly') {
                    // Monthly: same day of month
                    if (d.getDate() === eventStartDate.getDate()) {
                        addEventToDate(currentDateString, e);
                    }
                }
            }
        });
    } catch (error) {
        console.warn('[fetchMonthlyAttendance] Error loading events:', error);
        // Don't throw - events loading shouldn't break the page
    }

    // Fetch attendance records
    try {
        let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('club_id', currentUserData.clubId)
            .gte('date', startDate)
            .lte('date', endDate);

        if (currentSubgroupFilter !== 'all') {
            attendanceQuery = attendanceQuery.eq('subgroup_id', currentSubgroupFilter);
        }

        const { data: attendance, error: attError } = await attendanceQuery;

        if (attError) throw attError;

        (attendance || []).forEach(a => {
            const dateKey = a.date;

            if (currentSubgroupFilter === 'all') {
                if (!monthlyAttendance.has(dateKey)) {
                    monthlyAttendance.set(dateKey, {
                        id: a.id,
                        presentPlayerIds: a.present_player_ids,
                        subgroupId: a.subgroup_id
                    });
                }
            } else {
                monthlyAttendance.set(dateKey, {
                    id: a.id,
                    presentPlayerIds: a.present_player_ids,
                    subgroupId: a.subgroup_id
                });
            }
        });
    } catch (error) {
        console.error('[fetchMonthlyAttendance] Error loading attendance records:', error);
        throw error;
    }
}

/**
 * Handles calendar day click to open attendance modal
 */
export async function handleCalendarDayClick(
    e,
    clubPlayers,
    updateAttendanceCount,
    updatePairingsButtonState,
    clubId
) {
    const dayCell = e.target.closest('.calendar-day');
    if (!dayCell || dayCell.classList.contains('disabled')) return;

    if (isRenderingAttendance) {
        console.log('[Attendance Modal] Already rendering, skipping duplicate call');
        return;
    }
    isRenderingAttendance = true;

    try {
        const date = dayCell.dataset.date;
        const sessionsOnDay = monthlySessions.get(date) || [];

        if (sessionsOnDay.length === 0) {
            isRenderingAttendance = false;
            if (window.openSpontaneousSessionModalFromCalendar) {
                window.openSpontaneousSessionModalFromCalendar(date);
            } else {
                alert('Keine Trainings an diesem Tag. Bitte erstelle ein Training.');
            }
            return;
        } else {
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
 * Open attendance modal for a specific session
 */
export async function openAttendanceModalForSession(
    sessionId,
    date,
    clubPlayers,
    updateAttendanceCount,
    updatePairingsButtonState,
    clubId
) {
    try {
        currentSessionId = sessionId;
        currentClubPlayers = clubPlayers;
        currentUpdateAttendanceCount = updateAttendanceCount;
        currentUpdatePairingsButtonState = updatePairingsButtonState;

        // Get session data
        const { data: sessionData, error: sessError } = await supabase
            .from('training_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessError || !sessionData) {
            alert('Session nicht gefunden!');
            isRenderingAttendance = false;
            return;
        }

        const subgroupId = sessionData.subgroup_id;

        // Check if attendance already exists for this session
        const { data: attendanceRecords } = await supabase
            .from('attendance')
            .select('*')
            .eq('session_id', sessionId);

        const attendanceData = attendanceRecords && attendanceRecords.length > 0
            ? {
                  id: attendanceRecords[0].id,
                  presentPlayerIds: attendanceRecords[0].present_player_ids || [],
                  coaches: attendanceRecords[0].coaches || []
              }
            : null;

        // Load coaches for the club
        const { data: coaches } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('club_id', clubId)
            .eq('role', 'coach');

        const modal = document.getElementById('attendance-modal');
        document.getElementById('attendance-modal-date').textContent =
            `${new Date(date).toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} - ${sessionData.start_time}-${sessionData.end_time}`;
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

        const defaultDuration = calculateTrainingDuration(sessionData.start_time, sessionData.end_time);

        if (!coaches || coaches.length === 0) {
            coachListContainer.innerHTML = '<p class="text-sm text-gray-400">Keine Trainer gefunden</p>';
        } else {
            coaches.forEach(coach => {
                let isChecked = false;
                let savedHours = defaultDuration;

                if (attendanceData && attendanceData.coaches && Array.isArray(attendanceData.coaches)) {
                    const coachData = attendanceData.coaches.find(c => c.id === coach.id);
                    if (coachData) {
                        isChecked = true;
                        savedHours = coachData.hours || defaultDuration;
                    }
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
                        ${coach.first_name} ${coach.last_name}
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
        while (playerListContainer.firstChild) {
            playerListContainer.removeChild(playerListContainer.firstChild);
        }

        // Filter players: Only show players who are members of the session's subgroup
        const playersInCurrentSubgroup = clubPlayers.filter(
            player => player.subgroupIDs && player.subgroupIDs.includes(subgroupId)
        );

        // Deduplicate players by ID
        const playersMap = new Map();
        playersInCurrentSubgroup.forEach(player => {
            playersMap.set(player.id, player);
        });
        const uniquePlayers = Array.from(playersMap.values());

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

        modal.classList.remove('hidden');

        if (currentUpdateAttendanceCount) currentUpdateAttendanceCount();
        if (currentUpdatePairingsButtonState)
            currentUpdatePairingsButtonState(currentClubPlayers, subgroupId);
    } catch (error) {
        console.error('[Attendance Modal] Error rendering attendance:', error);
    } finally {
        isRenderingAttendance = false;
    }
}

/**
 * Saves attendance data and calculates points/streaks
 */
export async function handleAttendanceSave(
    e,
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
    const sessionId = sessionIdInput ? sessionIdInput.value : null;

    if (!sessionId) {
        feedbackEl.textContent =
            'Keine Training-Session gefunden. Bitte erstelle zuerst ein Training.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    // Load session to get subgroup
    let subgroupId, subgroupName;
    try {
        const { data: sessionData, error: sessError } = await supabase
            .from('training_sessions')
            .select('subgroup_id')
            .eq('id', sessionId)
            .single();

        if (sessError || !sessionData) {
            feedbackEl.textContent = 'Training-Session nicht gefunden!';
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
            return;
        }
        subgroupId = sessionData.subgroup_id;

        // Load subgroup name
        const { data: subgroupData } = await supabase
            .from('subgroups')
            .select('name')
            .eq('id', subgroupId)
            .single();

        subgroupName = subgroupData?.name || subgroupId;
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

    // Get previous attendance for THIS SPECIFIC SESSION
    let previouslyPresentIdsOnThisDay = [];
    if (docId) {
        try {
            const { data: prevAttendance } = await supabase
                .from('attendance')
                .select('present_player_ids')
                .eq('id', docId)
                .single();

            if (prevAttendance) {
                previouslyPresentIdsOnThisDay = prevAttendance.present_player_ids || [];
            }
        } catch (error) {
            console.error('[Attendance Save] Error loading previous attendance:', error);
        }
    }

    console.log(`[Attendance Save] Session ${sessionId}, Date: ${date}`);
    console.log(`  - Previously present: ${previouslyPresentIdsOnThisDay.length} players`);
    console.log(`  - Now present: ${presentPlayerIds.length} players`);

    try {
        // Find the last training day for THIS SUBGROUP before the current date
        const { data: previousTrainings } = await supabase
            .from('attendance')
            .select('present_player_ids')
            .eq('club_id', currentUserData.clubId)
            .eq('subgroup_id', subgroupId)
            .lt('date', date)
            .order('date', { ascending: false })
            .limit(1);

        let previousTrainingPresentIds = [];
        if (previousTrainings && previousTrainings.length > 0) {
            previousTrainingPresentIds = previousTrainings[0].present_player_ids || [];
        }

        // Handle attendance document
        if (presentPlayerIds.length === 0 && docId) {
            // Delete if empty
            await supabase.from('attendance').delete().eq('id', docId);
        } else if (presentPlayerIds.length > 0) {
            // Update/create attendance
            const attendanceData = {
                date,
                club_id: currentUserData.clubId,
                subgroup_id: subgroupId,
                session_id: sessionId,
                present_player_ids: presentPlayerIds,
                updated_at: new Date().toISOString(),
            };

            if (coaches && coaches.length > 0) {
                attendanceData.coaches = coaches;
            }

            if (docId) {
                await supabase
                    .from('attendance')
                    .update(attendanceData)
                    .eq('id', docId);
            } else {
                await supabase.from('attendance').insert(attendanceData);
            }
        }

        // Process players and update points/streaks
        const playersInSubgroup = clubPlayers.filter(
            p => p.subgroupIDs && p.subgroupIDs.includes(subgroupId)
        );

        for (const player of playersInSubgroup) {
            const isPresentToday = presentPlayerIds.includes(player.id);
            const wasPresentPreviouslyOnThisDay = previouslyPresentIdsOnThisDay.includes(player.id);

            if (isPresentToday && !wasPresentPreviouslyOnThisDay) {
                // Player newly marked as present
                await awardAttendancePoints(
                    player.id,
                    date,
                    subgroupId,
                    subgroupName,
                    currentUserData.clubId,
                    previousTrainingPresentIds,
                    sessionId
                );
            } else if (!isPresentToday && wasPresentPreviouslyOnThisDay) {
                // Player removed from attendance
                await deductAttendancePoints(
                    player.id,
                    date,
                    subgroupId,
                    subgroupName,
                    currentUserData.clubId
                );
            }
        }

        feedbackEl.textContent = 'Anwesenheit erfolgreich gespeichert!';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';

        setTimeout(() => {
            document.getElementById('attendance-modal').classList.add('hidden');
            feedbackEl.textContent = '';
            renderCalendarCallback(currentCalendarDate);
        }, 1500);
    } catch (error) {
        console.error('Fehler beim Speichern der Anwesenheit:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }
}

/**
 * Award attendance points to a player
 */
async function awardAttendancePoints(
    playerId,
    date,
    subgroupId,
    subgroupName,
    clubId,
    previousTrainingPresentIds,
    sessionId
) {
    // Get current streak
    const { data: streakData } = await supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', playerId)
        .eq('subgroup_id', subgroupId)
        .single();

    const currentStreak = streakData?.current_streak || 0;
    const wasPresentLastTraining = previousTrainingPresentIds.includes(playerId);
    const newStreak = wasPresentLastTraining ? currentStreak + 1 : 1;

    // Check for other trainings on same day
    const { data: otherTrainings } = await supabase
        .from('attendance')
        .select('id, session_id')
        .eq('club_id', clubId)
        .eq('date', date)
        .contains('present_player_ids', [playerId]);

    const alreadyAttendedToday = (otherTrainings || []).filter(
        t => t.session_id && t.session_id !== sessionId
    ).length > 0;

    // Format date for display
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    // Calculate points
    let pointsToAdd = ATTENDANCE_POINTS_BASE;
    let reason = `Training am ${formattedDate} - ${subgroupName}`;

    if (newStreak >= 5) {
        pointsToAdd = 6; // 3 base + 3 bonus (Super-Streak)
        reason = `Training am ${formattedDate} - ${subgroupName} (🔥 ${newStreak}x Streak!)`;
    } else if (newStreak >= 3) {
        pointsToAdd = 5; // 3 base + 2 bonus (Streak-Bonus)
        reason = `Training am ${formattedDate} - ${subgroupName} (⚡ ${newStreak}x Streak)`;
    }

    if (alreadyAttendedToday) {
        pointsToAdd = Math.ceil(pointsToAdd / 2);
        reason += ` (2. Training heute)`;
    }

    // Update streak
    const { error: streakError } = await supabase.from('streaks').upsert({
        user_id: playerId,
        subgroup_id: subgroupId,
        current_streak: newStreak,
        last_attendance_date: date,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,subgroup_id' });

    if (streakError) {
        console.warn('[Attendance] Error updating streak:', streakError);
    }

    // Update player points and XP
    const { error: rpcError } = await supabase.rpc('add_player_points', {
        p_user_id: playerId,
        p_points: pointsToAdd,
        p_xp: pointsToAdd
    });

    if (rpcError) {
        console.warn('[Attendance] Error adding points:', rpcError);
    }

    // Create points history entry
    const now = new Date().toISOString();
    const { error: pointsError } = await supabase.from('points_history').insert({
        user_id: playerId,
        points: pointsToAdd,
        xp: pointsToAdd,
        elo_change: 0,
        reason,
        timestamp: now,
        awarded_by: 'System (Anwesenheit)',
    });

    if (pointsError) {
        console.warn('[Attendance] Error creating points history:', pointsError);
    }

    // Create XP history entry
    const { error: xpError } = await supabase.from('xp_history').insert({
        player_id: playerId,
        xp: pointsToAdd,
        reason,
        timestamp: now,
        awarded_by: 'System (Anwesenheit)',
    });

    if (xpError) {
        console.warn('[Attendance] Error creating XP history:', xpError);
    }

    // Send notification to player
    let notificationTitle = 'Anwesenheit eingetragen';
    let notificationMessage = `Du hast +${pointsToAdd} Punkte für das Training am ${formattedDate} erhalten.`;

    if (newStreak >= 5) {
        notificationTitle = '🔥 Super-Streak!';
        notificationMessage = `${newStreak}x in Folge beim Training! +${pointsToAdd} Punkte (${subgroupName})`;
    } else if (newStreak >= 3) {
        notificationTitle = '⚡ Streak-Bonus!';
        notificationMessage = `${newStreak}x in Folge beim Training! +${pointsToAdd} Punkte (${subgroupName})`;
    }

    await supabase.from('notifications').insert({
        user_id: playerId,
        type: 'attendance',
        title: notificationTitle,
        message: notificationMessage,
        data: {
            points: pointsToAdd,
            streak: newStreak,
            date,
            subgroup_id: subgroupId,
            subgroup_name: subgroupName
        }
    });
}

/**
 * Deduct attendance points from a player
 */
async function deductAttendancePoints(
    playerId,
    date,
    subgroupId,
    subgroupName,
    clubId
) {
    // Find original points awarded
    const { data: historyEntries } = await supabase
        .from('points_history')
        .select('*')
        .eq('user_id', playerId)
        .eq('date', date)
        .eq('subgroup_id', subgroupId)
        .eq('awarded_by', 'System (Anwesenheit)')
        .gt('points', 0);

    const historyEntry = (historyEntries || []).find(
        entry => !entry.reason?.includes('korrigiert')
    );

    const pointsToDeduct = historyEntry?.points || 10;

    // Format date for display
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    // Deduct points
    await supabase.rpc('deduct_player_points', {
        p_user_id: playerId,
        p_points: pointsToDeduct,
        p_xp: pointsToDeduct
    });

    // Create negative history entry
    const correctionTime = new Date().toISOString();
    await supabase.from('points_history').insert({
        user_id: playerId,
        points: -pointsToDeduct,
        xp: -pointsToDeduct,
        elo_change: 0,
        reason: `Anwesenheit korrigiert am ${formattedDate} (${pointsToDeduct} Punkte abgezogen) - ${subgroupName}`,
        timestamp: correctionTime,
        awarded_by: 'System (Anwesenheit)',
    });

    // Create negative XP history entry
    await supabase.from('xp_history').insert({
        player_id: playerId,
        xp: -pointsToDeduct,
        reason: `Anwesenheit korrigiert am ${formattedDate} (${pointsToDeduct} XP abgezogen) - ${subgroupName}`,
        timestamp: correctionTime,
        awarded_by: 'System (Anwesenheit)',
    });
}

/**
 * Loads players for attendance tracking
 * @param {string} clubId - Club ID
 * @param {Object|Function} supabaseOrCallback - Supabase instance (ignored) or callback
 * @param {Function} [callback] - Callback function when players are loaded
 */
export async function loadPlayersForAttendance(clubId, supabaseOrCallback, callback) {
    // Handle both (clubId, callback) and (clubId, supabase, callback) signatures
    const onPlayersLoaded = typeof supabaseOrCallback === 'function' ? supabaseOrCallback : callback;
    const PLAYER_LIMIT = 300;

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email, subgroup_ids, is_match_ready, role, grundlagen_completed, elo_rating, birthdate, gender, doubles_elo_rating, is_offline')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach', 'head_coach'])
            .order('last_name', { ascending: true })
            .limit(PLAYER_LIMIT);

        if (error) throw error;

        // Debug: Log all players including offline ones
        console.log(`[Attendance] Loaded ${data?.length || 0} players from DB:`,
            data?.map(p => ({ id: p.id, name: `${p.first_name} ${p.last_name}`, is_offline: p.is_offline }))
        );

        // Deduplicate players
        const playersMap = new Map();
        const seenIdentifiers = new Set();

        (data || []).forEach(p => {
            const player = {
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                email: p.email,
                subgroupIDs: p.subgroup_ids || [],
                isMatchReady: p.is_match_ready,
                role: p.role,
                grundlagenCompleted: p.grundlagen_completed || 0,
                eloRating: p.elo_rating || 800,
                birthdate: p.birthdate,
                gender: p.gender,
                doublesEloRating: p.doubles_elo_rating || 800,
                isOffline: p.is_offline || false
            };

            const emailKey = player.email?.toLowerCase()?.trim();
            const nameKey = `${player.firstName?.toLowerCase()?.trim()}_${player.lastName?.toLowerCase()?.trim()}`;

            if (emailKey && seenIdentifiers.has(emailKey)) return;
            if (seenIdentifiers.has(nameKey)) return;

            playersMap.set(p.id, player);
            if (emailKey) seenIdentifiers.add(emailKey);
            seenIdentifiers.add(nameKey);
        });

        const players = Array.from(playersMap.values());
        players.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));

        if (typeof onPlayersLoaded === 'function') {
            onPlayersLoaded(players);
        }

        // Set up real-time subscription
        const channel = supabase
            .channel(`attendance_players_${clubId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'profiles',
                    filter: `club_id=eq.${clubId}`
                },
                () => {
                    loadPlayersForAttendance(clubId, onPlayersLoaded);
                }
            )
            .subscribe();

        if (!window.attendanceUnsubscribes) window.attendanceUnsubscribes = [];
        window.attendanceUnsubscribes.push(() => supabase.removeChannel(channel));

    } catch (error) {
        console.error('[Attendance] Error loading players:', error);
    }
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

/**
 * Subscribe to attendance changes (real-time)
 */
export function subscribeToAttendance(clubId, callback) {
    const channel = supabase
        .channel(`attendance_${clubId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'attendance',
                filter: `club_id=eq.${clubId}`
            },
            () => {
                callback();
            }
        )
        .subscribe();

    return () => supabase.removeChannel(channel);
}
