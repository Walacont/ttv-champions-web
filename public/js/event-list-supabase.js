/**
 * Event-Listenansicht – Spond-Style mit Wochengruppierung, Pagination und Player/Coach-Modus
 */

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

const PAGE_SIZE = 20;

let listViewState = {
    filter: 'upcoming',     // 'upcoming' | 'past'
    mode: 'coach',          // 'coach' | 'player'
    userData: null,
    containerId: null,
    allOccurrences: [],     // Alle geladenen Events (sortiert)
    renderedCount: 0,       // Wie viele bereits im DOM
    invitationsByKey: {},
    subgroupsMap: new Map(),
    todayStr: '',
    observer: null,
    subscriptions: [],
    subscriptionsActive: false,
    reloadTimer: null,
    isLoading: false,
};

/**
 * Lädt und rendert die Event-Liste (Coach oder Player)
 * @param {string} containerId - Container-Element-ID
 * @param {Object} userData - Benutzer-Daten
 * @param {string} filter - 'upcoming' | 'past'
 * @param {string} mode - 'coach' | 'player'
 */
export async function loadEventListView(containerId, userData, filter = 'upcoming', mode = 'coach') {
    const container = document.getElementById(containerId);
    if (!container || !userData) return;
    if (listViewState.isLoading) return;
    listViewState.isLoading = true;

    listViewState.filter = filter;
    listViewState.mode = mode;
    listViewState.userData = userData;
    listViewState.containerId = containerId;
    listViewState.allOccurrences = [];
    listViewState.renderedCount = 0;

    // Observer aufräumen
    if (listViewState.observer) {
        listViewState.observer.disconnect();
        listViewState.observer = null;
    }

    container.innerHTML = `
        <div class="flex justify-center py-8">
            <i class="fas fa-spinner fa-spin text-indigo-600 text-2xl"></i>
        </div>
    `;

    try {
        const now = new Date();
        listViewState.todayStr = formatDateStr(now);
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        if (mode === 'player') {
            listViewState.allOccurrences = await fetchPlayerEvents(userData, listViewState.todayStr, currentTimeStr, filter);
        } else {
            if (filter === 'upcoming') {
                listViewState.allOccurrences = await fetchUpcomingEvents(userData, listViewState.todayStr, currentTimeStr);
            } else {
                listViewState.allOccurrences = await fetchPastEvents(userData, listViewState.todayStr, currentTimeStr);
            }
        }

        // Sortieren
        if (filter === 'upcoming') {
            listViewState.allOccurrences.sort((a, b) => {
                const cmp = a.occurrence_date.localeCompare(b.occurrence_date);
                if (cmp !== 0) return cmp;
                return (a.start_time || '').localeCompare(b.start_time || '');
            });
        } else {
            listViewState.allOccurrences.sort((a, b) => {
                const cmp = b.occurrence_date.localeCompare(a.occurrence_date);
                if (cmp !== 0) return cmp;
                return (b.start_time || '').localeCompare(a.start_time || '');
            });
        }

        // Coach: Rückmeldungen laden
        if (mode === 'coach') {
            const eventIds = [...new Set(listViewState.allOccurrences.map(e => e.id))];
            listViewState.invitationsByKey = await fetchInvitations(eventIds);
        }

        // Untergruppen laden (Coach-Ansicht)
        if (mode === 'coach' && userData.clubId) {
            listViewState.subgroupsMap = await fetchSubgroups(userData.clubId);
        }

        // Erste Seite rendern
        renderInitialPage(container);

        // Realtime Subscriptions
        setupSubscriptions(containerId, userData, mode);

    } catch (error) {
        console.error('[EventList] Error loading events:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>Fehler beim Laden der Veranstaltungen</p>
            </div>
        `;
    } finally {
        listViewState.isLoading = false;
    }
}

// ============================
// Initiales Rendern + Pagination
// ============================

function renderInitialPage(container) {
    const { allOccurrences, filter, todayStr } = listViewState;

    if (allOccurrences.length === 0) {
        const msg = filter === 'upcoming'
            ? 'Keine anstehenden Veranstaltungen'
            : 'Keine vergangenen Veranstaltungen';
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-calendar-check text-4xl text-gray-300 mb-3"></i>
                <p class="text-gray-500">${msg}</p>
            </div>
        `;
        return;
    }

    // Container mit Sentinel vorbereiten
    container.innerHTML = `
        <div id="event-list-items" class="space-y-6"></div>
        <div id="event-list-sentinel" class="h-16 flex items-center justify-center">
            <div id="event-list-loader" class="hidden text-gray-400 text-sm">
                <i class="fas fa-spinner fa-spin mr-2"></i>Laden...
            </div>
        </div>
    `;

    // Erste Seite rendern
    listViewState.renderedCount = 0;
    renderNextPage();

    // IntersectionObserver für infinite scroll
    const sentinel = document.getElementById('event-list-sentinel');
    if (sentinel) {
        listViewState.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && listViewState.renderedCount < listViewState.allOccurrences.length) {
                renderNextPage();
            }
        }, { rootMargin: '200px' });
        listViewState.observer.observe(sentinel);
    }
}

function renderNextPage() {
    const { allOccurrences, renderedCount, todayStr, filter, mode, invitationsByKey, subgroupsMap } = listViewState;
    const itemsContainer = document.getElementById('event-list-items');
    const loader = document.getElementById('event-list-loader');
    if (!itemsContainer) return;

    const end = Math.min(renderedCount + PAGE_SIZE, allOccurrences.length);
    const pageEvents = allOccurrences.slice(renderedCount, end);

    if (pageEvents.length === 0) return;

    // Gruppierung der neuen Seite
    const groups = groupByWeek(pageEvents, todayStr, filter);

    groups.forEach(group => {
        // Prüfe ob Gruppen-Header schon existiert
        let groupContainer = itemsContainer.querySelector(`[data-week-label="${CSS.escape(group.label)}"]`);

        if (!groupContainer) {
            groupContainer = document.createElement('div');
            groupContainer.setAttribute('data-week-label', group.label);
            groupContainer.innerHTML = `
                <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">${group.label}</h3>
                <div class="space-y-3 event-week-items"></div>
            `;
            itemsContainer.appendChild(groupContainer);
        }

        const weekItems = groupContainer.querySelector('.event-week-items');
        group.events.forEach(event => {
            const html = mode === 'player'
                ? renderPlayerEventCard(event, todayStr)
                : renderCoachEventCard(event, todayStr, invitationsByKey, subgroupsMap);
            weekItems.insertAdjacentHTML('beforeend', html);
        });
    });

    listViewState.renderedCount = end;

    // Player-Modus: Event-Listener für Buttons anbinden
    if (mode === 'player') {
        setupPlayerCardListeners(itemsContainer);
    }

    // Loader ausblenden wenn alle geladen
    if (loader) {
        if (end >= allOccurrences.length) {
            loader.classList.add('hidden');
            if (listViewState.observer) {
                listViewState.observer.disconnect();
            }
        } else {
            loader.classList.remove('hidden');
        }
    }
}

// ============================
// Coach-Karte
// ============================

function renderCoachEventCard(event, todayStr, invitationsByKey, subgroupsMap) {
    const dateObj = new Date(event.occurrence_date + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthShort = dateObj.toLocaleDateString('de-DE', { month: 'short' });
    const isToday = event.occurrence_date === todayStr;

    let accentColor = '#6366f1';
    if (event.event_category === 'training') accentColor = '#10b981';
    else if (event.event_category === 'competition') accentColor = '#ef4444';
    else if (event.event_category === 'meeting') accentColor = '#f59e0b';
    else if (event.event_category === 'other') accentColor = '#8b5cf6';

    let subgroupNames = [];
    if (event.target_type === 'subgroups' && event.target_subgroup_ids?.length > 0) {
        const first = subgroupsMap.get(event.target_subgroup_ids[0]);
        if (first) accentColor = first.color;
        event.target_subgroup_ids.forEach(id => {
            const sg = subgroupsMap.get(id);
            if (sg) subgroupNames.push(sg.name);
        });
    }

    const invKey = `${event.id}_${event.occurrence_date || 'single'}`;
    const responses = invitationsByKey[invKey]
        || invitationsByKey[`${event.id}_single`]
        || invitationsByKey[`${event.id}_null`]
        || { accepted: [], rejected: [], pending: [] };
    const totalResponses = responses.accepted.length + responses.rejected.length + responses.pending.length;

    return `
        <div class="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
             onclick="window.openEventDetails('${event.id}', '${event.occurrence_date}')">
            <div class="flex">
                <div class="flex-shrink-0 w-16 flex flex-col items-center justify-center py-3 ${isToday ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700'}" style="${!isToday ? `border-left: 3px solid ${accentColor}` : ''}">
                    <span class="text-xs font-medium ${isToday ? 'text-indigo-200' : 'text-gray-500'}">${dayName}</span>
                    <span class="text-xl font-bold leading-tight">${dayNum}</span>
                    <span class="text-xs ${isToday ? 'text-indigo-200' : 'text-gray-500'}">${monthShort}</span>
                </div>
                <div class="flex-1 p-3 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h4 class="font-semibold text-gray-900 truncate">${event.title}</h4>
                        ${isToday ? '<span class="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium flex-shrink-0">Heute</span>' : ''}
                        ${event.event_type === 'recurring' ? '<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full flex-shrink-0"><i class="fas fa-repeat text-[10px]"></i></span>' : ''}
                    </div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500">
                        ${event.start_time ? `<span class="flex items-center gap-1"><i class="far fa-clock text-xs"></i>${event.start_time.slice(0, 5)}${event.end_time ? ' - ' + event.end_time.slice(0, 5) : ''}</span>` : ''}
                        ${event.location ? `<span class="flex items-center gap-1"><i class="fas fa-map-marker-alt text-xs"></i><span class="truncate max-w-[150px]">${event.location}</span></span>` : ''}
                    </div>
                    ${subgroupNames.length > 0 ? `<div class="mt-1 text-xs text-gray-400">${subgroupNames.join(', ')}</div>` : ''}
                    ${totalResponses > 0 ? `
                        <div class="mt-2 flex items-center gap-3 text-xs">
                            <span class="flex items-center gap-1 text-green-600 font-medium"><i class="fas fa-check"></i> ${responses.accepted.length}</span>
                            <span class="flex items-center gap-1 text-red-500 font-medium"><i class="fas fa-times"></i> ${responses.rejected.length}</span>
                            <span class="flex items-center gap-1 text-gray-400 font-medium"><i class="far fa-clock"></i> ${responses.pending.length}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="flex-shrink-0 flex items-center pr-3 text-gray-300">
                    <i class="fas fa-chevron-right text-sm"></i>
                </div>
            </div>
        </div>
    `;
}

// ============================
// Player-Karte
// ============================

function renderPlayerEventCard(event, todayStr) {
    const dateObj = new Date(event.occurrence_date + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthShort = dateObj.toLocaleDateString('de-DE', { month: 'short' });
    const isToday = event.occurrence_date === todayStr;
    const status = event._invitationStatus || 'pending';
    const invitationId = event._invitationId || '';

    const isPending = status === 'pending';

    let badgeColor = isPending ? 'bg-gradient-to-b from-indigo-500 to-purple-600' : 'bg-gray-50';
    let badgeTextClass = isPending ? 'text-white' : 'text-gray-700';
    let badgeSubClass = isPending ? 'text-indigo-200' : 'text-gray-500';
    let borderStyle = isPending ? 'border-orange-200' : 'border-gray-100';

    let statusBadge = '';
    if (status === 'accepted') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex-shrink-0"><i class="fas fa-check mr-1"></i>Zugesagt</span>`;
    } else if (status === 'rejected' || status === 'declined') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 flex-shrink-0"><i class="fas fa-times mr-1"></i>Abgesagt</span>`;
    }

    let actionHtml = '';
    const isPastFilter = listViewState.filter === 'past';
    if (isPastFilter) {
        // No action buttons for past events
    } else if (status === 'pending') {
        actionHtml = `
            <div class="flex gap-2 mt-2">
                <button class="event-list-accept-btn flex-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors" data-invitation-id="${invitationId}">
                    Zusagen
                </button>
                <button class="event-list-reject-btn flex-1 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors" data-invitation-id="${invitationId}">
                    Absagen
                </button>
            </div>`;
    } else if (status === 'accepted') {
        actionHtml = `
            <button class="event-list-reject-btn text-xs text-red-500 hover:text-red-700 font-medium mt-1" data-invitation-id="${invitationId}">
                <i class="fas fa-times mr-1"></i>Absagen
            </button>`;
    } else {
        actionHtml = `
            <button class="event-list-accept-btn text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1" data-invitation-id="${invitationId}">
                <i class="fas fa-check mr-1"></i>Doch zusagen
            </button>`;
    }

    return `
        <div class="bg-white rounded-xl border ${borderStyle} overflow-hidden hover:shadow-md transition-shadow">
            <div class="flex">
                <div class="flex-shrink-0 w-16 ${badgeColor} ${badgeTextClass} flex flex-col items-center justify-center py-3"
                     ${!isPending && !isToday ? `style="border-left: 3px solid ${status === 'accepted' ? '#10b981' : status === 'rejected' ? '#ef4444' : '#6366f1'}"` : ''}>
                    <span class="text-xs font-medium ${badgeSubClass}">${dayName}</span>
                    <span class="text-xl font-bold leading-tight">${dayNum}</span>
                    <span class="text-xs ${badgeSubClass}">${monthShort}</span>
                </div>
                <div class="flex-1 p-3 min-w-0">
                    <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                            <h4 class="text-sm font-semibold text-gray-900 truncate">
                                ${event.title}
                                ${event.event_type === 'recurring' ? '<i class="fas fa-repeat text-[10px] text-indigo-400 ml-1"></i>' : ''}
                            </h4>
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 mt-1">
                                ${event.start_time ? `<span class="flex items-center gap-1"><i class="far fa-clock"></i>${event.start_time.slice(0, 5)}${event.end_time ? ' – ' + event.end_time.slice(0, 5) : ''}</span>` : ''}
                                ${event.location ? `<span class="flex items-center gap-1"><i class="fas fa-map-marker-alt"></i>${event.location}</span>` : ''}
                            </div>
                        </div>
                        ${statusBadge}
                    </div>
                    <div class="flex items-center justify-between">
                        ${actionHtml}
                        <button class="event-list-details-btn text-xs text-gray-400 hover:text-indigo-600 font-medium ml-auto" data-event-id="${event.id}" data-occurrence="${event.occurrence_date}">
                            Details <i class="fas fa-chevron-right text-[10px] ml-0.5"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Player-Karten Listener anbinden
 */
function setupPlayerCardListeners(container) {
    // Accept
    container.querySelectorAll('.event-list-accept-btn:not([data-bound])').forEach(btn => {
        btn.setAttribute('data-bound', '1');
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const invId = btn.dataset.invitationId;
            if (!invId) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await respondToEventFromList(invId, 'accepted');
        });
    });

    // Reject
    container.querySelectorAll('.event-list-reject-btn:not([data-bound])').forEach(btn => {
        btn.setAttribute('data-bound', '1');
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const invId = btn.dataset.invitationId;
            if (!invId) return;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            await respondToEventFromList(invId, 'rejected');
        });
    });

    // Details
    container.querySelectorAll('.event-list-details-btn:not([data-bound])').forEach(btn => {
        btn.setAttribute('data-bound', '1');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const eventId = btn.dataset.eventId;
            const occurrence = btn.dataset.occurrence;
            if (window.showEventDetails) {
                window.showEventDetails(eventId);
            } else if (window.openEventDetails) {
                window.openEventDetails(eventId, occurrence);
            }
        });
    });
}

/**
 * Player: Auf Einladung antworten (Inline)
 */
async function respondToEventFromList(invitationId, status) {
    try {
        const updateData = {
            status,
            response_at: new Date().toISOString()
        };
        if (status === 'accepted') {
            updateData.decline_comment = null;
        }

        const { error } = await supabase
            .from('event_invitations')
            .update(updateData)
            .eq('id', invitationId);

        if (error) throw error;

        // Liste neu laden
        const { containerId, userData, filter, mode } = listViewState;
        await loadEventListView(containerId, userData, filter, mode);

    } catch (error) {
        console.error('[EventList] Error responding to event:', error);
        alert('Fehler beim Antworten. Bitte versuche es erneut.');
        const { containerId, userData, filter, mode } = listViewState;
        await loadEventListView(containerId, userData, filter, mode);
    }
}

// ============================
// Daten-Laden: Coach
// ============================

async function fetchUpcomingEvents(userData, todayStr, currentTimeStr) {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 6);
    const futureDateStr = formatDateStr(futureDate);
    const occurrences = [];

    const { data: singleEvents } = await supabase
        .from('events').select('*')
        .eq('club_id', userData.clubId)
        .or('event_type.eq.single,event_type.is.null')
        .gte('start_date', todayStr).lte('start_date', futureDateStr)
        .or('cancelled.eq.false,cancelled.is.null')
        .order('start_date', { ascending: true });

    (singleEvents || []).forEach(event => {
        if (event.start_date === todayStr && event.end_time && event.end_time <= currentTimeStr) return;
        occurrences.push({ ...event, occurrence_date: event.start_date });
    });

    const { data: recurringEvents } = await supabase
        .from('events').select('*')
        .eq('club_id', userData.clubId).eq('event_type', 'recurring')
        .lte('start_date', futureDateStr)
        .or(`repeat_end_date.gte.${todayStr},repeat_end_date.is.null`)
        .or('cancelled.eq.false,cancelled.is.null');

    (recurringEvents || []).forEach(event => {
        expandRecurringEvent(event, todayStr, futureDateStr).forEach(dateStr => {
            if (dateStr === todayStr && event.end_time && event.end_time <= currentTimeStr) return;
            occurrences.push({ ...event, occurrence_date: dateStr });
        });
    });

    return occurrences;
}

async function fetchPastEvents(userData, todayStr, currentTimeStr) {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 3);
    const pastDateStr = formatDateStr(pastDate);
    const occurrences = [];

    const { data: singleEvents } = await supabase
        .from('events').select('*')
        .eq('club_id', userData.clubId)
        .or('event_type.eq.single,event_type.is.null')
        .gte('start_date', pastDateStr).lte('start_date', todayStr)
        .or('cancelled.eq.false,cancelled.is.null')
        .order('start_date', { ascending: false });

    (singleEvents || []).forEach(event => {
        if (event.start_date === todayStr && (!event.end_time || event.end_time > currentTimeStr)) return;
        occurrences.push({ ...event, occurrence_date: event.start_date });
    });

    const { data: recurringEvents } = await supabase
        .from('events').select('*')
        .eq('club_id', userData.clubId).eq('event_type', 'recurring')
        .lte('start_date', todayStr)
        .or('cancelled.eq.false,cancelled.is.null');

    (recurringEvents || []).forEach(event => {
        expandRecurringEvent(event, pastDateStr, todayStr).forEach(dateStr => {
            if (dateStr === todayStr && (!event.end_time || event.end_time > currentTimeStr)) return;
            occurrences.push({ ...event, occurrence_date: dateStr });
        });
    });

    return occurrences;
}

// ============================
// Daten-Laden: Player
// ============================

async function fetchPlayerEvents(userData, todayStr, currentTimeStr, filter) {
    const occurrences = [];

    // Alle Einladungen des Spielers mit Event-Daten laden
    const { data: invitations, error } = await supabase
        .from('event_invitations')
        .select(`
            id, status, occurrence_date,
            events (
                id, title, description, event_category,
                start_date, start_time, end_time, meeting_time, location,
                organizer_id, max_participants, event_type,
                repeat_type, repeat_end_date, excluded_dates,
                target_type, target_subgroup_ids, cancelled
            )
        `)
        .eq('user_id', userData.id);

    if (error) {
        console.error('[EventList] Error fetching player invitations:', error);
        return occurrences;
    }

    (invitations || []).forEach(inv => {
        if (!inv.events) return;
        const event = inv.events;
        if (event.cancelled) return;

        const displayDate = inv.occurrence_date || event.start_date;
        if (!displayDate) return;

        const isUpcoming = isDateUpcoming(displayDate, todayStr, event.end_time, currentTimeStr);

        if (filter === 'upcoming' && !isUpcoming) return;
        if (filter === 'past' && isUpcoming) return;

        occurrences.push({
            ...event,
            occurrence_date: displayDate,
            _invitationStatus: inv.status,
            _invitationId: inv.id,
        });
    });

    return occurrences;
}

function isDateUpcoming(dateStr, todayStr, endTime, currentTimeStr) {
    if (dateStr > todayStr) return true;
    if (dateStr < todayStr) return false;
    // Heute: endTime prüfen
    if (endTime && endTime <= currentTimeStr) return false;
    return true;
}

// ============================
// Rückmeldungen & Untergruppen
// ============================

async function fetchInvitations(eventIds) {
    const map = {};
    if (eventIds.length === 0) return map;

    const { data } = await supabase
        .from('event_invitations')
        .select('event_id, occurrence_date, status')
        .in('event_id', eventIds);

    (data || []).forEach(inv => {
        const key = `${inv.event_id}_${inv.occurrence_date || 'single'}`;
        if (!map[key]) map[key] = { accepted: [], rejected: [], pending: [] };
        const group = inv.status === 'accepted' ? 'accepted'
            : (inv.status === 'rejected' || inv.status === 'declined') ? 'rejected' : 'pending';
        map[key][group].push(inv);
    });

    return map;
}

async function fetchSubgroups(clubId) {
    const { data } = await supabase.from('subgroups').select('id, name, color').eq('club_id', clubId);
    const map = new Map();
    (data || []).forEach(sg => map.set(sg.id, { name: sg.name, color: sg.color || '#6366f1' }));
    return map;
}

// ============================
// Subscriptions (einmal erstellen)
// ============================

function setupSubscriptions(containerId, userData, mode) {
    if (listViewState.subscriptionsActive) return;

    const debouncedReload = () => {
        if (listViewState.reloadTimer) clearTimeout(listViewState.reloadTimer);
        listViewState.reloadTimer = setTimeout(() => {
            loadEventListView(
                listViewState.containerId,
                listViewState.userData,
                listViewState.filter,
                listViewState.mode
            );
        }, 800);
    };

    const invChannel = supabase
        .channel('event-list-invitations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_invitations' }, debouncedReload)
        .subscribe();

    const evtChannel = supabase
        .channel('event-list-events')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, debouncedReload)
        .subscribe();

    listViewState.subscriptions.push(invChannel, evtChannel);
    listViewState.subscriptionsActive = true;
}

// ============================
// Recurring Event Expansion
// ============================

function expandRecurringEvent(event, fromDateStr, toDateStr) {
    const occurrences = [];
    const eventStart = new Date(event.start_date + 'T12:00:00');
    const from = new Date(fromDateStr + 'T12:00:00');
    const to = new Date(toDateStr + 'T12:00:00');
    const repeatEnd = event.repeat_end_date ? new Date(event.repeat_end_date + 'T12:00:00') : null;
    const excluded = event.excluded_dates || [];

    let current = new Date(eventStart);
    while (current < from) advanceDate(current, event.repeat_type);

    let maxIterations = 500;
    while (current <= to && maxIterations > 0) {
        if (repeatEnd && current > repeatEnd) break;
        const dateStr = formatDateStr(current);
        if (!excluded.includes(dateStr) && current >= from) occurrences.push(dateStr);
        advanceDate(current, event.repeat_type);
        maxIterations--;
    }

    return occurrences;
}

function advanceDate(date, repeatType) {
    switch (repeatType) {
        case 'daily': date.setDate(date.getDate() + 1); break;
        case 'weekly': date.setDate(date.getDate() + 7); break;
        case 'biweekly': date.setDate(date.getDate() + 14); break;
        case 'monthly': date.setMonth(date.getMonth() + 1); break;
    }
}

// ============================
// Wochengruppierung
// ============================

function groupByWeek(occurrences, todayStr, filter) {
    const today = new Date(todayStr + 'T12:00:00');
    const groups = new Map();

    occurrences.forEach(event => {
        const eventDate = new Date(event.occurrence_date + 'T12:00:00');
        const label = getWeekLabel(eventDate, today, filter);
        if (!groups.has(label)) groups.set(label, { label, events: [] });
        groups.get(label).events.push(event);
    });

    return Array.from(groups.values());
}

function getWeekLabel(eventDate, today, filter) {
    const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));

    if (filter === 'upcoming') {
        if (diffDays === 0) return 'Heute';
        if (diffDays === 1) return 'Morgen';
        const tw = getISOWeek(today), ew = getISOWeek(eventDate);
        const ty = today.getFullYear(), ey = eventDate.getFullYear();
        if (ty === ey && tw === ew) return 'Diese Woche';
        if ((ty === ey && ew === tw + 1) || (ey === ty + 1 && tw >= 52 && ew === 1)) return 'Nächste Woche';
        return eventDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    } else {
        if (diffDays === 0) return 'Heute';
        if (diffDays === -1) return 'Gestern';
        const tw = getISOWeek(today), ew = getISOWeek(eventDate);
        const ty = today.getFullYear(), ey = eventDate.getFullYear();
        if (ty === ey && tw === ew) return 'Diese Woche';
        if ((ty === ey && ew === tw - 1) || (ey === ty - 1 && ew >= 52 && tw === 1)) return 'Letzte Woche';
        return eventDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    }
}

function getISOWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// ============================
// Hilfsfunktionen
// ============================

function formatDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function cleanupListSubscriptions() {
    if (listViewState.reloadTimer) {
        clearTimeout(listViewState.reloadTimer);
        listViewState.reloadTimer = null;
    }
    if (listViewState.observer) {
        listViewState.observer.disconnect();
        listViewState.observer = null;
    }
    listViewState.subscriptions.forEach(ch => {
        try { supabase.removeChannel(ch); } catch (e) { /* ignore */ }
    });
    listViewState.subscriptions = [];
    listViewState.subscriptionsActive = false;
}

export function getEventListFilter() {
    return listViewState.filter;
}
