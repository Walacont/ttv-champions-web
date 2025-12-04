/**
 * Calendar Module (Supabase Version)
 * Handles calendar rendering and attendance tracking for dashboard
 */

// Module state
let subgroupsMap = new Map(); // Store subgroups with their colors

/**
 * Gets club attendance data for a specific period
 * @param {string} clubId - Club ID
 * @param {Object} supabase - Supabase client instance
 * @param {number} daysToLookBack - Number of days to look back (default: 90)
 * @returns {Promise<Array>} Array of attendance records
 */
export async function getClubAttendanceForPeriod(clubId, supabase, daysToLookBack = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToLookBack);
    const startString = cutoffDate.toISOString().split('T')[0];

    try {
        const { data, error } = await supabase
            .from('attendance')
            .select('*')
            .eq('club_id', clubId)
            .gte('date', startString)
            .order('date', { ascending: false });

        if (error) throw error;

        return (data || []).map(a => ({
            date: a.date,
            clubId: a.club_id,
            subgroupId: a.subgroup_id,
            sessionId: a.session_id,
            presentPlayerIds: a.present_player_ids || [],
        }));
    } catch (error) {
        console.error('Fehler beim Abrufen der Club-Anwesenheitsdaten:', error);
        return [];
    }
}

/**
 * Renders the attendance calendar for a player with real-time updates
 * @param {Date} date - Date to render
 * @param {Object} currentUserData - Current user data
 * @param {Object} supabase - Supabase client instance
 * @param {string} subgroupFilter - Subgroup filter ('club', 'global', or subgroupId)
 * @returns {Function} Unsubscribe function for the listener
 */
export function renderCalendar(date, currentUserData, supabase, subgroupFilter = 'club') {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const statsMonthName = document.getElementById('stats-month-name');
    const statsTrainingDays = document.getElementById('stats-training-days');

    if (!calendarGrid || !calendarMonthYear) return () => {};

    calendarGrid.innerHTML =
        '<div class="col-span-7 text-center p-8">Lade Anwesenheitsdaten...</div>';

    const month = date.getMonth();
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString('de-DE', { month: 'long' });
    calendarMonthYear.textContent = `${monthName} ${year}`;
    if (statsMonthName) statsMonthName.textContent = monthName;

    // Setup real-time listener for attendance data
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const startString = cutoffDate.toISOString().split('T')[0];

    // Cache for sessions and attendance
    let allSessionsCache = [];
    let allClubTrainingsCache = [];
    let subscriptions = [];

    // Load subgroups for color mapping
    async function loadSubgroups() {
        try {
            const { data, error } = await supabase
                .from('subgroups')
                .select('*')
                .eq('club_id', currentUserData.clubId);

            if (error) throw error;

            subgroupsMap.clear();
            (data || []).forEach(subgroup => {
                subgroupsMap.set(subgroup.id, {
                    name: subgroup.name,
                    color: subgroup.color || '#6366f1',
                });
            });
        } catch (error) {
            console.error('Error loading subgroups:', error);
        }
    }

    // Render calendar function that gets called when data changes
    function renderCalendarGrid() {
        const allClubTrainings = allClubTrainingsCache;
        // Filter trainings by subgroup if a specific subgroup is selected
        let filteredTrainings = allClubTrainings;
        if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
            filteredTrainings = allClubTrainings.filter(
                training => training.subgroupId === subgroupFilter
            );
        }

        // Get all trainings for the player's subgroups (for missed training detection)
        const userSubgroups = currentUserData.subgroupIDs || [];
        const relevantTrainings = allClubTrainings.filter(training => {
            if (userSubgroups.length === 0) return true;
            return training.subgroupId && userSubgroups.includes(training.subgroupId);
        });

        const presentDatesSet = new Set();
        const missedDatesSet = new Set();
        const sessionsPerDay = new Map();

        // Build sessions per day map from cache
        allSessionsCache.forEach(session => {
            const dateKey = session.date;
            if (!sessionsPerDay.has(dateKey)) {
                sessionsPerDay.set(dateKey, []);
            }

            if (userSubgroups.length === 0 || userSubgroups.includes(session.subgroupId)) {
                sessionsPerDay.get(dateKey).push(session);
            }
        });

        filteredTrainings.forEach(training => {
            if (training.presentPlayerIds.includes(currentUserData.id)) {
                presentDatesSet.add(training.date);
            }
        });

        // Identify missed trainings
        relevantTrainings.forEach(training => {
            if (!training.presentPlayerIds.includes(currentUserData.id)) {
                missedDatesSet.add(training.date);
            }
        });

        const trainingDaysThisMonth = Array.from(presentDatesSet).filter(d => {
            const trainingDate = new Date(d + 'T12:00:00');
            return trainingDate.getMonth() === month && trainingDate.getFullYear() === year;
        }).length;
        if (statsTrainingDays) statsTrainingDays.textContent = trainingDaysThisMonth;

        const streakDates = new Set();
        for (const training of filteredTrainings) {
            if (presentDatesSet.has(training.date)) {
                streakDates.add(training.date);
            } else {
                break;
            }
        }

        const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        calendarGrid.innerHTML = '';

        for (let i = 0; i < firstDayOfWeek; i++) {
            calendarGrid.appendChild(document.createElement('div'));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let sessionsOnDay = sessionsPerDay.get(dateString) || [];

            // Apply the same filter to sessions
            if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
                sessionsOnDay = sessionsOnDay.filter(
                    session => session.subgroupId === subgroupFilter
                );
            }

            const dayCell = document.createElement('div');
            dayCell.className =
                'border rounded-md p-2 min-h-[80px] hover:shadow-md transition-shadow';

            // Make clickable if there are sessions
            if (sessionsOnDay.length > 0) {
                dayCell.classList.add('cursor-pointer', 'hover:bg-gray-50');
                dayCell.addEventListener('click', () => {
                    openTrainingDayModal(
                        dateString,
                        sessionsOnDay,
                        filteredTrainings,
                        currentUserData.id
                    );
                });
            }

            // Day number with status indicator
            const dayNumber = document.createElement('div');
            dayNumber.className = 'flex items-center justify-between mb-2';

            const dayText = document.createElement('span');
            dayText.className = 'text-sm font-medium';
            dayText.textContent = day;
            dayNumber.appendChild(dayText);

            // Status indicator
            if (sessionsOnDay.length > 0) {
                const statusIcon = document.createElement('span');
                statusIcon.className = 'text-xs';

                const attendedCount = sessionsOnDay.filter(session => {
                    const attendance = filteredTrainings.find(
                        t =>
                            t.date === dateString &&
                            t.sessionId === session.id &&
                            t.presentPlayerIds &&
                            t.presentPlayerIds.includes(currentUserData.id)
                    );
                    return attendance !== undefined;
                }).length;

                const completedCount = sessionsOnDay.filter(
                    session => session.completed === true
                ).length;

                const totalRelevantSessions = sessionsOnDay.length;

                if (attendedCount === totalRelevantSessions && totalRelevantSessions > 0) {
                    statusIcon.textContent = '✓';
                    statusIcon.classList.add('text-green-600', 'font-bold');
                } else if (attendedCount === 0 && totalRelevantSessions > 0) {
                    if (completedCount === totalRelevantSessions) {
                        statusIcon.textContent = '✗';
                        statusIcon.classList.add('text-red-600', 'font-bold');
                    } else {
                        statusIcon.textContent = '○';
                        statusIcon.classList.add('text-gray-400', 'font-bold');
                    }
                } else if (attendedCount > 0 && attendedCount < totalRelevantSessions) {
                    statusIcon.textContent = '◐';
                    statusIcon.classList.add('text-orange-600', 'font-bold');
                }

                dayNumber.appendChild(statusIcon);
            }

            // Today indicator
            if (new Date(year, month, day).toDateString() === new Date().toDateString()) {
                dayCell.classList.add('ring-2', 'ring-indigo-500');
            }

            dayCell.appendChild(dayNumber);

            // Add colored dots for sessions
            if (sessionsOnDay.length > 0) {
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'flex gap-1 flex-wrap';

                const dotsToShow = Math.min(sessionsOnDay.length, 4);
                for (let i = 0; i < dotsToShow; i++) {
                    const session = sessionsOnDay[i];
                    const subgroup = subgroupsMap.get(session.subgroupId);
                    const color = subgroup ? subgroup.color : '#6366f1';

                    const dot = document.createElement('div');
                    dot.className = 'w-2 h-2 rounded-full';
                    dot.style.backgroundColor = color;
                    dot.title = subgroup ? subgroup.name : 'Training';
                    dotsContainer.appendChild(dot);
                }

                if (sessionsOnDay.length > 4) {
                    const moreDot = document.createElement('span');
                    moreDot.className = 'text-xs text-gray-500';
                    moreDot.textContent = `+${sessionsOnDay.length - 4}`;
                    dotsContainer.appendChild(moreDot);
                }

                dayCell.appendChild(dotsContainer);
            }

            calendarGrid.appendChild(dayCell);
        }
    }

    // Load subgroups first, then set up real-time listeners
    loadSubgroups().then(async () => {
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        // Initial load of sessions
        async function loadSessions() {
            try {
                const { data, error } = await supabase
                    .from('training_sessions')
                    .select('*')
                    .eq('club_id', currentUserData.clubId)
                    .gte('date', startDate)
                    .lte('date', endDate)
                    .eq('cancelled', false);

                if (error) throw error;

                allSessionsCache = (data || []).map(s => ({
                    id: s.id,
                    date: s.date,
                    startTime: s.start_time,
                    endTime: s.end_time,
                    subgroupId: s.subgroup_id,
                    completed: s.completed,
                    completedExercises: s.completed_exercises,
                    plannedExercises: s.planned_exercises,
                }));

                renderCalendarGrid();
            } catch (error) {
                console.error('Error loading sessions:', error);
            }
        }

        // Initial load of attendance
        async function loadAttendance() {
            try {
                const { data, error } = await supabase
                    .from('attendance')
                    .select('*')
                    .eq('club_id', currentUserData.clubId)
                    .gte('date', startString)
                    .order('date', { ascending: false });

                if (error) throw error;

                allClubTrainingsCache = (data || []).map(a => ({
                    date: a.date,
                    subgroupId: a.subgroup_id,
                    sessionId: a.session_id,
                    presentPlayerIds: a.present_player_ids || [],
                }));

                renderCalendarGrid();
            } catch (error) {
                console.error('Fehler beim Laden der Anwesenheitsdaten:', error);
                calendarGrid.innerHTML =
                    '<div class="col-span-7 text-center p-8 text-red-500">Fehler beim Laden der Daten</div>';
            }
        }

        // Initial loads
        await loadSessions();
        await loadAttendance();

        // Set up real-time subscriptions
        const sessionsSubscription = supabase
            .channel('calendar-sessions')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'training_sessions',
                    filter: `club_id=eq.${currentUserData.clubId}`
                },
                () => {
                    console.log('[Calendar] Training sessions updated in real-time');
                    loadSessions();
                }
            )
            .subscribe();

        const attendanceSubscription = supabase
            .channel('calendar-attendance')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'attendance',
                    filter: `club_id=eq.${currentUserData.clubId}`
                },
                () => {
                    console.log('[Calendar] Attendance data updated in real-time');
                    loadAttendance();
                }
            )
            .subscribe();

        subscriptions.push(sessionsSubscription, attendanceSubscription);
    });

    // Return combined unsubscribe function
    return () => {
        subscriptions.forEach(sub => sub.unsubscribe());
    };
}

/**
 * Loads today's matches and training sessions for the player
 * @param {Object} userData - User data
 * @param {Object} supabase - Supabase client instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadTodaysMatches(userData, supabase, unsubscribes) {
    const container = document.getElementById('todays-matches-container');
    const listEl = document.getElementById('matches-list');
    if (!container || !listEl) return;

    const today = new Date().toISOString().split('T')[0];

    async function loadSessions() {
        try {
            const { data: sessions, error } = await supabase
                .from('training_sessions')
                .select('*')
                .eq('club_id', userData.clubId)
                .eq('date', today)
                .eq('cancelled', false)
                .order('start_time', { ascending: true });

            if (error) throw error;

            // Filter sessions for player's subgroups
            const userSubgroups = userData.subgroupIDs || [];
            const relevantSessions = (sessions || []).filter(
                session => userSubgroups.length === 0 || userSubgroups.includes(session.subgroup_id)
            );

            if (relevantSessions.length > 0) {
                container.classList.remove('hidden');
                listEl.innerHTML =
                    '<div class="mb-4"><h3 class="font-semibold text-gray-700 mb-2">Heutige Trainings</h3><div id="todays-sessions-list" class="space-y-2"></div></div>';

                const sessionsListEl = document.getElementById('todays-sessions-list');

                for (const session of relevantSessions) {
                    // Get subgroup name
                    let subgroupName = 'Training';
                    try {
                        const { data: subgroupData } = await supabase
                            .from('subgroups')
                            .select('name')
                            .eq('id', session.subgroup_id)
                            .single();

                        if (subgroupData) {
                            subgroupName = subgroupData.name;
                        }
                    } catch (error) {
                        console.error('Error loading subgroup:', error);
                    }

                    const sessionEl = document.createElement('div');
                    sessionEl.className = 'p-3 rounded-lg border bg-indigo-50 border-indigo-300';
                    sessionEl.innerHTML = `
                        <div class="flex justify-between items-center">
                            <div>
                                <span class="font-bold text-indigo-700">${session.start_time} - ${session.end_time}</span>
                                <span class="text-gray-600 ml-2">${subgroupName}</span>
                            </div>
                        </div>
                        <div id="pairings-${session.id}" class="mt-2"></div>
                    `;
                    sessionsListEl.appendChild(sessionEl);

                    // Load pairings for this session
                    loadPairingsForSession(session.id, userData, supabase);
                }
            } else {
                container.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading today sessions:', error);
        }
    }

    // Initial load
    loadSessions();

    // Real-time subscription for sessions
    const sessionsSubscription = supabase
        .channel('todays-sessions')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'training_sessions',
                filter: `club_id=eq.${userData.clubId}`
            },
            () => {
                loadSessions();
            }
        )
        .subscribe();

    unsubscribes.push(() => sessionsSubscription.unsubscribe());

    // Load today's matches from trainingMatches (legacy)
    async function loadMatches() {
        try {
            const { data: matchData, error } = await supabase
                .from('training_matches')
                .select('*')
                .eq('id', `${userData.clubId}_${today}`)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

            if (matchData) {
                container.classList.remove('hidden');
                const groups = matchData.groups || {};
                listEl.innerHTML = '';

                if (Object.keys(groups).length === 0 && !matchData.leftover_player) {
                    listEl.innerHTML =
                        '<p class="text-center text-gray-500 py-4">Für heute wurden noch keine Matches erstellt.</p>';
                    return;
                }

                for (const groupName in groups) {
                    const groupDiv = document.createElement('div');
                    groupDiv.innerHTML = `<h4 class="font-semibold text-gray-700 mb-2">${groupName}</h4>`;
                    const ul = document.createElement('ul');
                    ul.className = 'space-y-2';

                    groups[groupName].forEach(match => {
                        const isMyMatch =
                            match.playerA.id === userData.id || match.playerB.id === userData.id;
                        const highlightClass = isMyMatch
                            ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200'
                            : 'bg-gray-50';

                        let handicapHTML = '';
                        if (match.handicap) {
                            handicapHTML = `<p class="text-xs text-blue-600 mt-1 font-semibold">
                                                Vorgabe: ${match.handicap.player.name.split(' ')[0]} +${match.handicap.points}
                                            </p>`;
                        }

                        const li = document.createElement('li');
                        li.className = `p-3 rounded-lg border ${highlightClass}`;
                        li.innerHTML = `
                            <div class="flex justify-between items-center">
                                <div>
                                    <span class="font-bold">${match.playerA.name}</span>
                                    <span class="text-gray-400 mx-1">vs</span>
                                    <span class="font-bold">${match.playerB.name}</span>
                                </div>
                                ${isMyMatch ? '<span class="text-xs bg-indigo-500 text-white font-bold py-1 px-2 rounded-full">DEIN MATCH</span>' : ''}
                            </div>
                            ${handicapHTML}
                        `;
                        ul.appendChild(li);
                    });
                    groupDiv.appendChild(ul);
                    listEl.appendChild(groupDiv);
                }
                if (matchData.leftover_player) {
                    const isLeftover = matchData.leftover_player.id === userData.id;
                    const leftoverEl = document.createElement('p');
                    leftoverEl.className = `mt-4 text-sm p-2 rounded-md ${isLeftover ? 'bg-orange-100 text-orange-700 font-bold' : 'text-gray-500'}`;
                    leftoverEl.textContent = `${matchData.leftover_player.name} sitzt diese Runde aus.`;
                    listEl.appendChild(leftoverEl);
                }
            }
        } catch (error) {
            console.error('Error loading today matches:', error);
        }
    }

    loadMatches();

    // Real-time subscription for matches
    const matchesSubscription = supabase
        .channel('todays-matches')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'training_matches'
            },
            () => {
                loadMatches();
            }
        )
        .subscribe();

    unsubscribes.push(() => matchesSubscription.unsubscribe());
}

/**
 * Loads and displays match pairings for a specific session
 * @param {string} sessionId - Session ID
 * @param {Object} userData - User data
 * @param {Object} supabase - Supabase client instance
 */
async function loadPairingsForSession(sessionId, userData, supabase) {
    const container = document.getElementById(`pairings-${sessionId}`);
    if (!container) return;

    try {
        const { data: pairingsData, error } = await supabase
            .from('training_matches')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        if (!pairingsData) return;

        const groups = pairingsData.groups || {};

        let html = '<div class="text-sm space-y-2 mt-2 border-t pt-2">';
        html += '<p class="text-xs text-gray-600 font-semibold mb-1">Heutige Paarungen:</p>';

        for (const groupName in groups) {
            const matches = groups[groupName];
            if (matches.length === 0) continue;

            html += `<div class="mb-2">`;
            html += `<p class="text-xs font-bold text-gray-700">${groupName}</p>`;
            html += '<ul class="space-y-1">';

            matches.forEach(match => {
                const isMyMatch =
                    match.playerA.id === userData.id || match.playerB.id === userData.id;
                const highlightClass = isMyMatch ? 'bg-yellow-50 border-yellow-400 font-bold' : '';

                let handicapHTML = '';
                if (match.handicap) {
                    handicapHTML = `<span class="text-xs text-blue-600 ml-2">+${match.handicap.points}</span>`;
                }

                html += `
                    <li class="text-xs p-2 rounded border ${highlightClass}">
                        <span>${match.playerA.name.split(' ')[0]}</span>
                        <span class="text-gray-400 mx-1">vs</span>
                        <span>${match.playerB.name.split(' ')[0]}</span>
                        ${handicapHTML}
                        ${isMyMatch ? '<span class="ml-2 text-indigo-600">← Du!</span>' : ''}
                    </li>
                `;
            });

            html += '</ul></div>';
        }

        if (pairingsData.leftover_player) {
            const isLeftover = pairingsData.leftover_player.id === userData.id;
            const leftoverClass = isLeftover
                ? 'bg-orange-100 text-orange-700 font-bold'
                : 'text-gray-500';
            html += `<p class="text-xs ${leftoverClass} mt-1">${pairingsData.leftover_player.name.split(' ')[0]} sitzt aus</p>`;
        }

        html += '</div>';

        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading pairings for session:', error);
    }
}

/**
 * Opens the training day modal with session details
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {Array} sessions - Array of training sessions
 * @param {Array} allTrainings - All attendance records
 * @param {string} playerId - Player ID
 */
function openTrainingDayModal(dateString, sessions, allTrainings, playerId) {
    const modal = document.getElementById('training-day-modal');
    const modalTitle = document.getElementById('training-day-modal-title');
    const modalContent = document.getElementById('training-day-modal-content');

    if (!modal || !modalTitle || !modalContent) return;

    // Format date nicely
    const [year, month, day] = dateString.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    modalTitle.textContent = `Training am ${formattedDate}`;

    // Build content
    let html = '<div class="space-y-3">';

    // Get attendance data for this date
    const attendanceForDate = allTrainings.filter(t => t.date === dateString);

    sessions.forEach(session => {
        const subgroup = subgroupsMap.get(session.subgroupId);
        const subgroupName = subgroup ? subgroup.name : 'Unbekannt';
        const subgroupColor = subgroup ? subgroup.color : '#6366f1';

        // Check if player attended THIS SPECIFIC SESSION
        const attendance = attendanceForDate.find(a => {
            return (
                a.sessionId === session.id &&
                a.presentPlayerIds &&
                a.presentPlayerIds.includes(playerId)
            );
        });

        const attended = attendance !== undefined;
        const isCompleted = session.completed === true;

        // Determine status and styling
        let statusText, statusColor, bgColor, borderColor, icon;
        if (attended) {
            statusText = 'Teilgenommen';
            statusColor = 'text-green-700';
            bgColor = 'bg-green-50';
            borderColor = 'border-green-300';
            icon = '✓';
        } else if (!isCompleted) {
            statusText = 'Noch ausstehend';
            statusColor = 'text-gray-600';
            bgColor = 'bg-gray-50';
            borderColor = 'border-gray-300';
            icon = '○';
        } else {
            statusText = 'Verpasst';
            statusColor = 'text-red-700';
            bgColor = 'bg-red-50';
            borderColor = 'border-red-300';
            icon = '✗';
        }

        html += `
            <div class="border rounded-lg p-3 ${bgColor} ${borderColor}">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-lg">${icon}</span>
                            <span class="font-semibold text-gray-900">${session.startTime} - ${session.endTime}</span>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-gray-700 mb-2">
                            <div class="w-3 h-3 rounded-full" style="background-color: ${subgroupColor};"></div>
                            <span>${subgroupName}</span>
                        </div>
                        ${
                            isCompleted &&
                            session.completedExercises &&
                            session.completedExercises.length > 0
                                ? `
                            <div class="text-xs text-gray-600 mt-2">
                                <div class="font-medium mb-1">Durchgeführte Übungen:</div>
                                <ul class="list-disc list-inside pl-2 space-y-0.5">
                                    ${session.completedExercises
                                        .map(
                                            ex => `
                                        <li>${ex.name} <span class="text-gray-500">(+${ex.points} Pkt)</span></li>
                                    `
                                        )
                                        .join('')}
                                </ul>
                            </div>
                        `
                                : !isCompleted &&
                                    session.plannedExercises &&
                                    session.plannedExercises.length > 0
                                  ? `
                            <div class="text-xs text-gray-600 mt-2">
                                <div class="font-medium mb-1">Geplante Übungen:</div>
                                <ul class="list-disc list-inside pl-2 space-y-0.5">
                                    ${session.plannedExercises
                                        .map(
                                            ex => `
                                        <li>${ex.name} <span class="text-gray-500">(+${ex.points} Pkt)</span></li>
                                    `
                                        )
                                        .join('')}
                                </ul>
                            </div>
                        `
                                  : ''
                        }
                    </div>
                    <div class="text-sm font-medium ${statusColor}">
                        ${statusText}
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';

    modalContent.innerHTML = html;

    // Show modal
    modal.classList.remove('hidden');
}

/**
 * Closes the training day modal
 */
function closeTrainingDayModal() {
    const modal = document.getElementById('training-day-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Setup modal close handlers
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('close-training-day-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeTrainingDayModal);
        }

        // Close modal when clicking outside
        const modal = document.getElementById('training-day-modal');
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) {
                    closeTrainingDayModal();
                }
            });
        }
    });
}
