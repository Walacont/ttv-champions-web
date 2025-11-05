import { collection, doc, getDocs, onSnapshot, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

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
 * Renders the attendance calendar for a player
 * @param {Date} date - Date to render
 * @param {Object} currentUserData - Current user data
 * @param {Object} db - Firestore database instance
 * @param {string} subgroupFilter - Subgroup filter ('club', 'global', or subgroupId)
 */
export async function renderCalendar(date, currentUserData, db, subgroupFilter = 'club') {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const statsMonthName = document.getElementById('stats-month-name');
    const statsTrainingDays = document.getElementById('stats-training-days');

    if (!calendarGrid || !calendarMonthYear) return;

    calendarGrid.innerHTML = '<div class="col-span-7 text-center p-8">Lade Anwesenheitsdaten...</div>';

    const month = date.getMonth();
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString('de-DE', { month: 'long' });
    calendarMonthYear.textContent = `${monthName} ${year}`;
    if (statsMonthName) statsMonthName.textContent = monthName;

    const allClubTrainings = await getClubAttendanceForPeriod(currentUserData.clubId, db);

    // Filter trainings by subgroup if a specific subgroup is selected
    let filteredTrainings = allClubTrainings;
    if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
        // Filter to only show trainings for the selected subgroup
        filteredTrainings = allClubTrainings.filter(training => training.subgroupId === subgroupFilter);
    }

    const presentDatesSet = new Set();
    filteredTrainings.forEach(training => {
        if (training.presentPlayerIds.includes(currentUserData.id)) {
            presentDatesSet.add(training.date);
        }
    });

    const trainingDaysThisMonth = Array.from(presentDatesSet).filter(d => {
        const trainingDate = new Date(d + 'T12:00:00'); // Use a fixed time to avoid timezone issues
        return trainingDate.getMonth() === month && trainingDate.getFullYear() === year;
    }).length;
    if (statsTrainingDays) statsTrainingDays.textContent = trainingDaysThisMonth;

    const streakDates = new Set();
    for (const training of filteredTrainings) { // Already sorted descending, use filtered trainings
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
        const dayDiv = document.createElement('div');
        dayDiv.className = 'h-10 w-10 flex items-center justify-center rounded-full border-2 border-transparent';
        dayDiv.textContent = day;

        const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (streakDates.has(dateString)) {
            dayDiv.classList.add('calendar-day-streak');
        } else if (presentDatesSet.has(dateString)) {
            dayDiv.classList.add('calendar-day-present');
        }

        if (new Date(year, month, day).toDateString() === new Date().toDateString()) {
            dayDiv.classList.add('ring-2', 'ring-indigo-500');
        }
        calendarGrid.appendChild(dayDiv);
    }
}

/**
 * Loads today's matches for the player
 * @param {Object} userData - User data
 * @param {Object} db - Firestore database instance
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 */
export function loadTodaysMatches(userData, db, unsubscribes) {
    const container = document.getElementById('todays-matches-container');
    const listEl = document.getElementById('matches-list');
    if (!container || !listEl) return;

    const today = new Date().toISOString().split('T')[0];
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
