/**
 * Kalender-Modul mit Veranstaltungsanzeige für Spieler
 */

let subgroupsMap = new Map();
let eventsPerDayCache = new Map();

/**
 * Rendert den Veranstaltungskalender mit Echtzeit-Updates
 * @param {Date} date - Anzuzeigendes Datum
 * @param {Object} currentUserData - Aktuelle Benutzerdaten
 * @param {Object} supabase - Supabase Client
 * @param {string} subgroupFilter - Untergruppen-Filter
 * @returns {Function} Unsubscribe-Funktion
 */
export function renderCalendar(date, currentUserData, supabase, subgroupFilter = 'club') {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarMonthYear = document.getElementById('calendar-month-year');
    const statsMonthName = document.getElementById('stats-month-name');
    const statsEventCount = document.getElementById('stats-training-days'); // Wiederverwendung des bestehenden Elements

    if (!calendarGrid || !calendarMonthYear) return () => {};

    calendarGrid.innerHTML =
        '<div class="col-span-7 text-center p-8">Lade Veranstaltungen...</div>';

    const month = date.getMonth();
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString('de-DE', { month: 'long' });
    calendarMonthYear.textContent = `${monthName} ${year}`;
    if (statsMonthName) statsMonthName.textContent = monthName;

    let subscriptions = [];

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

    // Wird bei Datenänderungen aufgerufen
    function renderCalendarGrid() {
        const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let eventCountThisMonth = 0;
        eventsPerDayCache.forEach((events, dateKey) => {
            const eventDate = new Date(dateKey + 'T12:00:00');
            if (eventDate.getMonth() === month && eventDate.getFullYear() === year) {
                eventCountThisMonth += events.length;
            }
        });
        if (statsEventCount) statsEventCount.textContent = eventCountThisMonth;

        calendarGrid.innerHTML = '';

        for (let i = 0; i < firstDayOfWeek; i++) {
            calendarGrid.appendChild(document.createElement('div'));
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const eventsOnDay = eventsPerDayCache.get(dateString) || [];

            const dayCell = document.createElement('div');
            dayCell.className = 'border rounded-md p-2 min-h-[80px] hover:shadow-md transition-shadow';

            if (eventsOnDay.length > 0) {
                dayCell.classList.add('cursor-pointer', 'hover:bg-gray-50');
                dayCell.addEventListener('click', () => {
                    openEventDayModal(dateString, eventsOnDay);
                });
            }

            const dayNumber = document.createElement('div');
            dayNumber.className = 'flex items-center justify-between mb-2';

            const dayText = document.createElement('span');
            dayText.className = 'text-sm font-medium';
            dayText.textContent = day;
            dayNumber.appendChild(dayText);

            if (eventsOnDay.length > 0) {
                const countBadge = document.createElement('span');
                countBadge.className = 'text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium';
                countBadge.textContent = eventsOnDay.length;
                dayNumber.appendChild(countBadge);
            }

            if (new Date(year, month, day).toDateString() === new Date().toDateString()) {
                dayCell.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50');
            }

            dayCell.appendChild(dayNumber);

            if (eventsOnDay.length > 0) {
                const dotsContainer = document.createElement('div');
                dotsContainer.className = 'flex gap-1 flex-wrap';

                const eventsToShow = Math.min(eventsOnDay.length, 4);
                for (let i = 0; i < eventsToShow; i++) {
                    const event = eventsOnDay[i];
                    const dot = document.createElement('div');
                    dot.className = 'w-2 h-2 rounded-full';
                    dot.style.backgroundColor = event.subgroupColor || '#6366f1';
                    dot.title = event.title;
                    dotsContainer.appendChild(dot);
                }

                if (eventsOnDay.length > 4) {
                    const moreDot = document.createElement('span');
                    moreDot.className = 'text-xs text-gray-500';
                    moreDot.textContent = `+${eventsOnDay.length - 4}`;
                    dotsContainer.appendChild(moreDot);
                }

                dayCell.appendChild(dotsContainer);

                if (eventsOnDay.length > 0) {
                    const preview = document.createElement('div');
                    preview.className = 'text-xs text-gray-600 mt-1 truncate';
                    preview.textContent = eventsOnDay[0].title;
                    dayCell.appendChild(preview);
                }
            }

            calendarGrid.appendChild(dayCell);
        }
    }

    loadSubgroups().then(async () => {
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        // Lädt sowohl einzelne als auch wiederkehrende Veranstaltungen
        async function loadEvents() {
            try {
                eventsPerDayCache.clear();
                const userSubgroups = currentUserData.subgroupIDs || [];

                // Einzelne Veranstaltungen in diesem Monat
                const { data: singleEvents, error: singleError } = await supabase
                    .from('events')
                    .select('id, title, start_date, start_time, end_time, location, description, target_type, target_subgroup_ids, event_type, repeat_type, repeat_end_date')
                    .eq('club_id', currentUserData.clubId)
                    .eq('cancelled', false)
                    .or('event_type.eq.single,event_type.is.null')
                    .gte('start_date', startDate)
                    .lte('start_date', endDate);

                // Wiederkehrende Veranstaltungen, die in diesem Monat stattfinden könnten
                const { data: recurringEvents, error: recurringError } = await supabase
                    .from('events')
                    .select('id, title, start_date, start_time, end_time, location, description, target_type, target_subgroup_ids, event_type, repeat_type, repeat_end_date')
                    .eq('club_id', currentUserData.clubId)
                    .eq('cancelled', false)
                    .eq('event_type', 'recurring')
                    .lte('start_date', endDate)
                    .or(`repeat_end_date.gte.${startDate},repeat_end_date.is.null`);

                if (singleError) console.warn('[Calendar] Error loading single events:', singleError);
                if (recurringError) console.warn('[Calendar] Error loading recurring events:', recurringError);

                const isPlayerInvited = (event) => {
                    if (event.target_type === 'club') return true;
                    if (event.target_type === 'subgroups' && event.target_subgroup_ids) {
                        if (userSubgroups.length === 0) return true;
                        return userSubgroups.some(sg => event.target_subgroup_ids.includes(sg));
                    }
                    return true;
                };

                const addEventToDate = (dateKey, event) => {
                    if (!isPlayerInvited(event)) return;

                    let subgroupColor = '#6366f1'; // Standard: Indigo
                    let subgroupNames = [];
                    if (event.target_type === 'subgroups' && event.target_subgroup_ids && event.target_subgroup_ids.length > 0) {
                        const firstSubgroup = subgroupsMap.get(event.target_subgroup_ids[0]);
                        if (firstSubgroup) {
                            subgroupColor = firstSubgroup.color;
                        }
                        event.target_subgroup_ids.forEach(sgId => {
                            const sg = subgroupsMap.get(sgId);
                            if (sg) subgroupNames.push(sg.name);
                        });
                    }

                    if (!eventsPerDayCache.has(dateKey)) {
                        eventsPerDayCache.set(dateKey, []);
                    }
                    eventsPerDayCache.get(dateKey).push({
                        id: event.id,
                        title: event.title,
                        startTime: event.start_time,
                        endTime: event.end_time,
                        location: event.location,
                        description: event.description,
                        targetType: event.target_type,
                        subgroupColor,
                        subgroupNames,
                        isRecurring: event.event_type === 'recurring',
                        repeatType: event.repeat_type
                    });
                };

                (singleEvents || []).forEach(e => addEventToDate(e.start_date, e));

                // Generiert Instanzen für jeden passenden Tag
                (recurringEvents || []).forEach(e => {
                    const eventStartDate = new Date(e.start_date + 'T12:00:00');
                    const monthStart = new Date(startDate + 'T12:00:00');
                    const monthEnd = new Date(endDate + 'T12:00:00');
                    const repeatEndDate = e.repeat_end_date ? new Date(e.repeat_end_date + 'T12:00:00') : null;
                    const excludedDates = e.excluded_dates || [];
                    const eventDayOfWeek = eventStartDate.getDay();

                    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                        if (d < eventStartDate) continue;
                        if (repeatEndDate && d > repeatEndDate) continue;

                        const currentDateString = d.toISOString().split('T')[0];

                        // Ausgeschlossene Termine überspringen
                        if (excludedDates.includes(currentDateString)) continue;

                        if (e.repeat_type === 'weekly' && d.getDay() === eventDayOfWeek) {
                            addEventToDate(currentDateString, e);
                        } else if (e.repeat_type === 'daily') {
                            addEventToDate(currentDateString, e);
                        } else if (e.repeat_type === 'monthly' && d.getDate() === eventStartDate.getDate()) {
                            addEventToDate(currentDateString, e);
                        }
                    }
                });

                renderCalendarGrid();
            } catch (error) {
                console.warn('[Calendar] Error loading events:', error);
                calendarGrid.innerHTML =
                    '<div class="col-span-7 text-center p-8 text-red-500">Fehler beim Laden der Veranstaltungen</div>';
            }
        }

        await loadEvents();

        const eventsSubscription = supabase
            .channel('calendar-events')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'events',
                    filter: `club_id=eq.${currentUserData.clubId}`
                },
                () => {
                    console.log('[Calendar] Events updated in real-time');
                    loadEvents();
                }
            )
            .subscribe();

        subscriptions.push(eventsSubscription);
    });

    return () => {
        subscriptions.forEach(sub => sub.unsubscribe());
    };
}

/**
 * Lädt heutige Veranstaltungen für den Spieler
 * @param {Object} userData - Benutzerdaten
 * @param {Object} supabase - Supabase Client
 * @param {Array} unsubscribes - Array für Unsubscribe-Funktionen
 */
export function loadTodaysMatches(userData, supabase, unsubscribes) {
    const container = document.getElementById('todays-matches-container');
    const listEl = document.getElementById('matches-list');
    if (!container || !listEl) return;

    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today + 'T12:00:00');
    const todayDayOfWeek = todayDate.getDay();
    const todayDayOfMonth = todayDate.getDate();

    async function loadTodaysEvents() {
        try {
            const userSubgroups = userData.subgroupIDs || [];

            const { data: singleEvents, error: singleError } = await supabase
                .from('events')
                .select('id, title, start_time, end_time, location, target_type, target_subgroup_ids, event_type')
                .eq('club_id', userData.clubId)
                .eq('cancelled', false)
                .eq('start_date', today)
                .or('event_type.eq.single,event_type.is.null')
                .order('start_time', { ascending: true });

            const { data: recurringEvents, error: recurringError } = await supabase
                .from('events')
                .select('id, title, start_date, start_time, end_time, location, target_type, target_subgroup_ids, event_type, repeat_type, repeat_end_date, excluded_dates')
                .eq('club_id', userData.clubId)
                .eq('cancelled', false)
                .eq('event_type', 'recurring')
                .lte('start_date', today)
                .or(`repeat_end_date.gte.${today},repeat_end_date.is.null`);

            if (singleError) throw singleError;
            if (recurringError) throw recurringError;

            // Nur wiederkehrende Events, die tatsächlich heute stattfinden
            const matchingRecurringEvents = (recurringEvents || []).filter(event => {
                // Ausgeschlossene Termine prüfen
                const excludedDates = event.excluded_dates || [];
                if (excludedDates.includes(today)) return false;

                const eventStartDate = new Date(event.start_date + 'T12:00:00');
                const eventDayOfWeek = eventStartDate.getDay();
                const eventDayOfMonth = eventStartDate.getDate();

                if (event.repeat_type === 'weekly') {
                    return todayDayOfWeek === eventDayOfWeek;
                } else if (event.repeat_type === 'daily') {
                    return true;
                } else if (event.repeat_type === 'monthly') {
                    return todayDayOfMonth === eventDayOfMonth;
                }
                return false;
            });

            const allEvents = [...(singleEvents || []), ...matchingRecurringEvents];
            const relevantEvents = allEvents.filter(event => {
                if (event.target_type === 'club') return true;
                if (event.target_type === 'subgroups' && event.target_subgroup_ids) {
                    if (userSubgroups.length === 0) return true;
                    return userSubgroups.some(sg => event.target_subgroup_ids.includes(sg));
                }
                return true;
            });

            relevantEvents.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

            if (relevantEvents.length > 0) {
                container.classList.remove('hidden');
                listEl.innerHTML = '<h3 class="font-semibold text-gray-700 mb-3">📅 Heutige Termine</h3>';

                const eventsListEl = document.createElement('div');
                eventsListEl.className = 'space-y-2';

                for (const event of relevantEvents) {
                    let subgroupNames = [];
                    if (event.target_type === 'subgroups' && event.target_subgroup_ids) {
                        const { data: subgroups } = await supabase
                            .from('subgroups')
                            .select('name')
                            .in('id', event.target_subgroup_ids);
                        subgroupNames = (subgroups || []).map(s => s.name);
                    }

                    const eventEl = document.createElement('div');
                    eventEl.className = 'p-3 rounded-lg border bg-indigo-50 border-indigo-300';
                    eventEl.innerHTML = `
                        <div class="flex justify-between items-start">
                            <div class="flex-1">
                                <div class="font-bold text-indigo-700">${event.title}</div>
                                ${event.start_time ? `
                                    <div class="text-sm text-gray-600">
                                        ${event.start_time}${event.end_time ? ` - ${event.end_time}` : ''}
                                    </div>
                                ` : ''}
                                ${event.location ? `
                                    <div class="text-sm text-gray-500">
                                        📍 ${event.location}
                                    </div>
                                ` : ''}
                                ${subgroupNames.length > 0 ? `
                                    <div class="text-xs text-gray-500 mt-1">
                                        ${subgroupNames.join(', ')}
                                    </div>
                                ` : ''}
                            </div>
                            ${event.event_type === 'recurring' ? '<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Wiederkehrend</span>' : ''}
                        </div>
                    `;
                    eventsListEl.appendChild(eventEl);
                }

                listEl.appendChild(eventsListEl);
            } else {
                container.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading today\'s events:', error);
        }
    }

    loadTodaysEvents();

    const eventsSubscription = supabase
        .channel('todays-events')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'events',
                filter: `club_id=eq.${userData.clubId}`
            },
            () => {
                loadTodaysEvents();
            }
        )
        .subscribe();

    unsubscribes.push(() => eventsSubscription.unsubscribe());
}

/**
 * Öffnet das Modal mit Veranstaltungsdetails
 * @param {string} dateString - Datum im Format YYYY-MM-DD
 * @param {Array} events - Veranstaltungen für diesen Tag
 */
function openEventDayModal(dateString, events) {
    const modal = document.getElementById('training-day-modal');
    const modalTitle = document.getElementById('training-day-modal-title');
    const modalContent = document.getElementById('training-day-modal-content');

    if (!modal || !modalTitle || !modalContent) return;

    const [year, month, day] = dateString.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    modalTitle.textContent = formattedDate;

    let html = '<div class="space-y-3">';

    if (events.length === 0) {
        html += '<p class="text-gray-500 text-center py-4">Keine Termine an diesem Tag.</p>';
    } else {
        events.forEach(event => {
            const repeatLabel = {
                'weekly': 'Wöchentlich',
                'daily': 'Täglich',
                'monthly': 'Monatlich'
            };

            html += `
                <div class="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <div class="w-3 h-3 rounded-full" style="background-color: ${event.subgroupColor || '#6366f1'};"></div>
                                <span class="font-semibold text-gray-900 text-lg">${event.title}</span>
                            </div>

                            ${event.startTime ? `
                                <div class="flex items-center gap-2 text-sm text-gray-700 mb-1">
                                    <span>🕐</span>
                                    <span>${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}</span>
                                </div>
                            ` : ''}

                            ${event.location ? `
                                <div class="flex items-center gap-2 text-sm text-gray-700 mb-1">
                                    <span>📍</span>
                                    <span>${event.location}</span>
                                </div>
                            ` : ''}

                            ${event.subgroupNames && event.subgroupNames.length > 0 ? `
                                <div class="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                    <span>👥</span>
                                    <span>${event.subgroupNames.join(', ')}</span>
                                </div>
                            ` : `
                                <div class="flex items-center gap-2 text-sm text-gray-600 mb-1">
                                    <span>👥</span>
                                    <span>Gesamter Verein</span>
                                </div>
                            `}

                            ${event.description ? `
                                <div class="text-sm text-gray-600 mt-2 pt-2 border-t">
                                    ${event.description}
                                </div>
                            ` : ''}
                        </div>

                        <div class="flex flex-col items-end gap-1">
                            ${event.isRecurring ? `
                                <span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                    🔄 ${repeatLabel[event.repeatType] || 'Wiederkehrend'}
                                </span>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    html += '</div>';

    modalContent.innerHTML = html;

    modal.classList.remove('hidden');
}

/**
 * Schließt das Veranstaltungs-Modal
 */
function closeEventDayModal() {
    const modal = document.getElementById('training-day-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        const closeBtn = document.getElementById('close-training-day-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeEventDayModal);
        }

        const modal = document.getElementById('training-day-modal');
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) {
                    closeEventDayModal();
                }
            });
        }
    });
}
