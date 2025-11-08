import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

/**
 * Calendar Module
 * Handles calendar rendering and attendance tracking for dashboard
 */

/**
 * Gets club attendance data for a specific period
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @param {number} daysToLookBack - Number of days to look back (default: 90)
 * @returns {Promise<Array>} Array of attendance records
 */
export async function getClubAttendanceForPeriod(clubId, db, daysToLookBack = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToLookBack);
    const startString = cutoffDate.toISOString().split('T')[0];

    const q = query(
        collection(db, 'attendance'),
        where('clubId', '==', clubId),
        where('date', '>=', startString),
        orderBy('date', 'desc')
    );
    try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Fehler beim Abrufen der Club-Anwesenheitsdaten: ", error);
        return [];
    }
}

/**
 * Renders the attendance calendar for a player with real-time updates
 * @param {Date} date - Date to render
 * @param {Object} currentUserData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {string} subgroupFilter - Subgroup filter ('club', 'global', or subgroupId)
 * @returns {Function} Unsubscribe function for the listener
 */
export function renderCalendar(date, currentUserData, db, subgroupFilter = 'club') {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const statsMonthName = document.getElementById('stats-month-name');
    const statsTrainingDays = document.getElementById('stats-training-days');

    if (!calendarGrid || !calendarMonthYear) return () => {};

    calendarGrid.innerHTML = '<div class="col-span-7 text-center p-8">Lade Anwesenheitsdaten...</div>';

    const month = date.getMonth();
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString('de-DE', { month: 'long' });
    calendarMonthYear.textContent = `${monthName} ${year}`;
    if (statsMonthName) statsMonthName.textContent = monthName;

    // Setup real-time listener for attendance data
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const startString = cutoffDate.toISOString().split('T')[0];

    const q = query(
        collection(db, 'attendance'),
        where('clubId', '==', currentUserData.clubId),
        where('date', '>=', startString),
        orderBy('date', 'desc')
    );

    // NEW: Also load training sessions to show multiple sessions per day
    let allSessionsCache = [];
    async function loadSessions() {
        try {
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            const sessionsQuery = query(
                collection(db, 'trainingSessions'),
                where('clubId', '==', currentUserData.clubId),
                where('date', '>=', startDate),
                where('date', '<=', endDate),
                where('cancelled', '==', false)
            );

            const sessionsSnapshot = await getDocs(sessionsQuery);
            allSessionsCache = sessionsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
        } catch (error) {
            console.error("Error loading sessions:", error);
        }
    }

    // Load sessions first, then set up attendance listener
    loadSessions().then(() => {
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const allClubTrainings = querySnapshot.docs.map(doc => doc.data());

            // Filter trainings by subgroup if a specific subgroup is selected
            let filteredTrainings = allClubTrainings;
            if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
                // Filter to only show trainings for the selected subgroup
                filteredTrainings = allClubTrainings.filter(training => training.subgroupId === subgroupFilter);
            }

            // Get all trainings for the player's subgroups (for missed training detection)
            const userSubgroups = currentUserData.subgroupIDs || [];
            const relevantTrainings = allClubTrainings.filter(training => {
                // If no subgroups assigned, all trainings are relevant
                if (userSubgroups.length === 0) return true;
                // Otherwise, only trainings for the player's subgroups are relevant
                return training.subgroupId && userSubgroups.includes(training.subgroupId);
            });

            const presentDatesSet = new Set();
            const missedDatesSet = new Set();
            const sessionsPerDay = new Map(); // NEW: Track sessions per day

            // NEW: Build sessions per day map
            allSessionsCache.forEach(session => {
                const dateKey = session.date;
                if (!sessionsPerDay.has(dateKey)) {
                    sessionsPerDay.set(dateKey, []);
                }

                // Only include sessions for player's subgroups
                if (userSubgroups.length === 0 || userSubgroups.includes(session.subgroupId)) {
                    sessionsPerDay.get(dateKey).push(session);
                }
            });

            filteredTrainings.forEach(training => {
                if (training.presentPlayerIds.includes(currentUserData.id)) {
                    presentDatesSet.add(training.date);
                }
            });

            // Identify missed trainings (relevant trainings where player was not present)
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
                break; // Streak is broken
            }
        }

        const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        calendarGrid.innerHTML = '';

        for (let i = 0; i < firstDayOfWeek; i++) {
            calendarGrid.appendChild(document.createElement('div'));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'relative flex flex-col items-center justify-center';

            const dayDiv = document.createElement('div');
            dayDiv.className = 'h-10 w-10 flex items-center justify-center rounded-full border-2 border-transparent';
            dayDiv.textContent = day;

            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            if (streakDates.has(dateString)) {
                dayDiv.classList.add('calendar-day-streak');
            } else if (presentDatesSet.has(dateString)) {
                dayDiv.classList.add('calendar-day-present');
            } else if (missedDatesSet.has(dateString)) {
                // Missed training - mark in red
                dayDiv.classList.add('calendar-day-missed');
            }

            if (new Date(year, month, day).toDateString() === new Date().toDateString()) {
                dayDiv.classList.add('ring-2', 'ring-indigo-500');
            }

            dayCell.appendChild(dayDiv);

            // Add session indicators
            const sessionsOnDay = sessionsPerDay.get(dateString) || [];
            if (sessionsOnDay.length > 0) {
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'flex gap-1 justify-center mt-1';

                const dotsToShow = Math.min(sessionsOnDay.length, 3);
                for (let i = 0; i < dotsToShow; i++) {
                    const dot = document.createElement('div');
                    dot.className = 'w-1.5 h-1.5 rounded-full bg-indigo-500';
                    dotsContainer.appendChild(dot);
                }
                dayCell.appendChild(dotsContainer);
            }

            calendarGrid.appendChild(dayCell);
        }
    }, (error) => {
        console.error("Fehler beim Laden der Anwesenheitsdaten:", error);
        calendarGrid.innerHTML = '<div class="col-span-7 text-center p-8 text-red-500">Fehler beim Laden der Daten</div>';
    });

    return unsubscribe;
}

/**
 * Loads today's matches and training sessions for the player
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadTodaysMatches(userData, db, unsubscribes) {
    const container = document.getElementById('todays-matches-container');
    const listEl = document.getElementById('matches-list');
    if (!container || !listEl) return;

    const today = new Date().toISOString().split('T')[0];

    // Load today's training sessions
    const sessionsQuery = query(
        collection(db, 'trainingSessions'),
        where('clubId', '==', userData.clubId),
        where('date', '==', today),
        where('cancelled', '==', false),
        orderBy('startTime', 'asc')
    );

    const sessionsListener = onSnapshot(sessionsQuery, async (sessionsSnapshot) => {
        const sessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter sessions for player's subgroups
        const userSubgroups = userData.subgroupIDs || [];
        const relevantSessions = sessions.filter(session =>
            userSubgroups.length === 0 || userSubgroups.includes(session.subgroupId)
        );

        if (relevantSessions.length > 0) {
            container.classList.remove('hidden');
            listEl.innerHTML = '<div class="mb-4"><h3 class="font-semibold text-gray-700 mb-2">Heutige Trainings</h3><div id="todays-sessions-list" class="space-y-2"></div></div>';

            const sessionsListEl = document.getElementById('todays-sessions-list');

            for (const session of relevantSessions) {
                // Get subgroup name
                let subgroupName = 'Training';
                try {
                    const subgroupDoc = await getDoc(doc(db, 'subgroups', session.subgroupId));
                    if (subgroupDoc.exists()) {
                        subgroupName = subgroupDoc.data().name;
                    }
                } catch (error) {
                    console.error('Error loading subgroup:', error);
                }

                const sessionEl = document.createElement('div');
                sessionEl.className = 'p-3 rounded-lg border bg-indigo-50 border-indigo-300';
                sessionEl.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div>
                            <span class="font-bold text-indigo-700">${session.startTime} - ${session.endTime}</span>
                            <span class="text-gray-600 ml-2">${subgroupName}</span>
                        </div>
                    </div>
                    <div id="pairings-${session.id}" class="mt-2"></div>
                `;
                sessionsListEl.appendChild(sessionEl);

                // Load pairings for this session
                loadPairingsForSession(session.id, userData, db);
            }
        } else {
            container.classList.add('hidden');
        }
    });

    unsubscribes.push(sessionsListener);

    // Keep existing match loading (will be updated later for session-based matches)
    const matchDocRef = doc(db, "trainingMatches", `${userData.clubId}_${today}`);

    const matchListener = onSnapshot(matchDocRef, (docSnap) => {
        if (docSnap.exists()) {
            container.classList.remove('hidden');
            const data = docSnap.data();
            const groups = data.groups;
            listEl.innerHTML = '';

            if (Object.keys(groups).length === 0 && !data.leftoverPlayer) {
                listEl.innerHTML = '<p class="text-center text-gray-500 py-4">Für heute wurden noch keine Matches erstellt.</p>';
                return;
            }

            for (const groupName in groups) {
                const groupDiv = document.createElement('div');
                groupDiv.innerHTML = `<h4 class="font-semibold text-gray-700 mb-2">${groupName}</h4>`;
                const ul = document.createElement('ul');
                ul.className = 'space-y-2';

                groups[groupName].forEach(match => {
                    const isMyMatch = match.playerA.id === userData.id || match.playerB.id === userData.id;
                    const highlightClass = isMyMatch ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-200' : 'bg-gray-50';

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
            if (data.leftoverPlayer) {
                const isLeftover = data.leftoverPlayer.id === userData.id;
                const leftoverEl = document.createElement('p');
                leftoverEl.className = `mt-4 text-sm p-2 rounded-md ${isLeftover ? 'bg-orange-100 text-orange-700 font-bold' : 'text-gray-500'}`;
                leftoverEl.textContent = `${data.leftoverPlayer.name} sitzt diese Runde aus.`;
                listEl.appendChild(leftoverEl);
            }

        } else {
            container.classList.add('hidden');
        }
    });

    unsubscribes.push(matchListener);
}

/**
 * Loads and displays match pairings for a specific session
 * @param {string} sessionId - Session ID
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 */
async function loadPairingsForSession(sessionId, userData, db) {
    const container = document.getElementById(`pairings-${sessionId}`);
    if (!container) return;

    try {
        const pairingsDoc = await getDoc(doc(db, 'trainingMatches', sessionId));

        if (!pairingsDoc.exists()) {
            // No pairings yet
            return;
        }

        const pairingsData = pairingsDoc.data();
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
                const isMyMatch = match.playerA.id === userData.id || match.playerB.id === userData.id;
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

        if (pairingsData.leftoverPlayer) {
            const isLeftover = pairingsData.leftoverPlayer.id === userData.id;
            const leftoverClass = isLeftover ? 'bg-orange-100 text-orange-700 font-bold' : 'text-gray-500';
            html += `<p class="text-xs ${leftoverClass} mt-1">${pairingsData.leftoverPlayer.name.split(' ')[0]} sitzt aus</p>`;
        }

        html += '</div>';

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading pairings for session:', error);
    }
}
