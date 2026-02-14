/**
 * Event-Listenansicht – Spond-Style mit Wochengruppierung und Rückmeldestatus
 */

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let listViewState = {
    filter: 'upcoming', // 'upcoming' | 'past'
    userData: null,
    containerId: null,
    subscriptions: [],
    subscriptionsActive: false,
    reloadTimer: null,
};

/**
 * Lädt und rendert die Event-Liste.
 * Subscriptions werden nur einmal erstellt und wiederverwendet.
 */
export async function loadEventListView(containerId, userData, filter = 'upcoming') {
    const container = document.getElementById(containerId);
    if (!container || !userData?.clubId) return;

    listViewState.filter = filter;
    listViewState.userData = userData;
    listViewState.containerId = containerId;

    container.innerHTML = `
        <div class="flex justify-center py-8">
            <i class="fas fa-spinner fa-spin text-indigo-600 text-2xl"></i>
        </div>
    `;

    try {
        const now = new Date();
        const todayStr = formatDateStr(now);
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        let allOccurrences = [];

        if (filter === 'upcoming') {
            allOccurrences = await fetchUpcomingEvents(userData, todayStr, currentTimeStr);
        } else {
            allOccurrences = await fetchPastEvents(userData, todayStr, currentTimeStr);
        }

        // Sortieren
        if (filter === 'upcoming') {
            allOccurrences.sort((a, b) => {
                const cmp = a.occurrence_date.localeCompare(b.occurrence_date);
                if (cmp !== 0) return cmp;
                return (a.start_time || '').localeCompare(b.start_time || '');
            });
        } else {
            allOccurrences.sort((a, b) => {
                const cmp = b.occurrence_date.localeCompare(a.occurrence_date);
                if (cmp !== 0) return cmp;
                return (b.start_time || '').localeCompare(a.start_time || '');
            });
        }

        // Rückmeldungen laden
        const eventIds = [...new Set(allOccurrences.map(e => e.id))];
        const invitationsByKey = await fetchInvitations(eventIds);

        // Untergruppen laden
        const subgroupsMap = await fetchSubgroups(userData.clubId);

        // Rendern
        renderEventList(container, allOccurrences, invitationsByKey, subgroupsMap, filter, todayStr);

        // Realtime Subscriptions nur einmal aufsetzen
        setupSubscriptions(containerId, userData);

    } catch (error) {
        console.error('[EventList] Error loading events:', error);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>Fehler beim Laden der Veranstaltungen</p>
            </div>
        `;
    }
}

/**
 * Lädt anstehende Events (6 Monate voraus)
 */
async function fetchUpcomingEvents(userData, todayStr, currentTimeStr) {
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setMonth(futureDate.getMonth() + 6);
    const futureDateStr = formatDateStr(futureDate);

    const occurrences = [];

    // Einzelne Events
    const { data: singleEvents } = await supabase
        .from('events')
        .select('*')
        .eq('club_id', userData.clubId)
        .or('event_type.eq.single,event_type.is.null')
        .gte('start_date', todayStr)
        .lte('start_date', futureDateStr)
        .or('cancelled.eq.false,cancelled.is.null')
        .order('start_date', { ascending: true });

    (singleEvents || []).forEach(event => {
        if (event.start_date === todayStr && event.end_time && event.end_time <= currentTimeStr) return;
        occurrences.push({ ...event, occurrence_date: event.start_date });
    });

    // Wiederkehrende Events
    const { data: recurringEvents } = await supabase
        .from('events')
        .select('*')
        .eq('club_id', userData.clubId)
        .eq('event_type', 'recurring')
        .lte('start_date', futureDateStr)
        .or(`repeat_end_date.gte.${todayStr},repeat_end_date.is.null`)
        .or('cancelled.eq.false,cancelled.is.null');

    (recurringEvents || []).forEach(event => {
        const dates = expandRecurringEvent(event, todayStr, futureDateStr);
        dates.forEach(dateStr => {
            if (dateStr === todayStr && event.end_time && event.end_time <= currentTimeStr) return;
            occurrences.push({ ...event, occurrence_date: dateStr });
        });
    });

    return occurrences;
}

/**
 * Lädt vergangene Events (3 Monate zurück)
 */
async function fetchPastEvents(userData, todayStr, currentTimeStr) {
    const now = new Date();
    const pastDate = new Date(now);
    pastDate.setMonth(pastDate.getMonth() - 3);
    const pastDateStr = formatDateStr(pastDate);

    const occurrences = [];

    // Einzelne Events
    const { data: singleEvents } = await supabase
        .from('events')
        .select('*')
        .eq('club_id', userData.clubId)
        .or('event_type.eq.single,event_type.is.null')
        .gte('start_date', pastDateStr)
        .lte('start_date', todayStr)
        .or('cancelled.eq.false,cancelled.is.null')
        .order('start_date', { ascending: false });

    (singleEvents || []).forEach(event => {
        if (event.start_date === todayStr) {
            if (!event.end_time || event.end_time > currentTimeStr) return;
        }
        occurrences.push({ ...event, occurrence_date: event.start_date });
    });

    // Wiederkehrende Events
    const { data: recurringEvents } = await supabase
        .from('events')
        .select('*')
        .eq('club_id', userData.clubId)
        .eq('event_type', 'recurring')
        .lte('start_date', todayStr)
        .or('cancelled.eq.false,cancelled.is.null');

    (recurringEvents || []).forEach(event => {
        const dates = expandRecurringEvent(event, pastDateStr, todayStr);
        dates.forEach(dateStr => {
            if (dateStr === todayStr) {
                if (!event.end_time || event.end_time > currentTimeStr) return;
            }
            occurrences.push({ ...event, occurrence_date: dateStr });
        });
    });

    return occurrences;
}

/**
 * Lädt Rückmeldungen für gegebene Event-IDs
 */
async function fetchInvitations(eventIds) {
    const invitationsByKey = {};
    if (eventIds.length === 0) return invitationsByKey;

    const { data: allInvitations } = await supabase
        .from('event_invitations')
        .select('event_id, occurrence_date, status, user_id, decline_comment, profiles:user_id(first_name, last_name)')
        .in('event_id', eventIds);

    (allInvitations || []).forEach(inv => {
        const key = `${inv.event_id}_${inv.occurrence_date || 'single'}`;
        if (!invitationsByKey[key]) {
            invitationsByKey[key] = { accepted: [], rejected: [], pending: [] };
        }
        const group = inv.status === 'accepted' ? 'accepted'
            : (inv.status === 'rejected' || inv.status === 'declined') ? 'rejected'
            : 'pending';
        invitationsByKey[key][group].push(inv);
    });

    return invitationsByKey;
}

/**
 * Lädt Untergruppen
 */
async function fetchSubgroups(clubId) {
    const { data: subgroupsData } = await supabase
        .from('subgroups')
        .select('id, name, color')
        .eq('club_id', clubId);

    const map = new Map();
    (subgroupsData || []).forEach(sg => {
        map.set(sg.id, { name: sg.name, color: sg.color || '#6366f1' });
    });
    return map;
}

/**
 * Setzt Realtime-Subscriptions nur einmal auf.
 * Bei Änderungen wird ein Debounced-Reload ausgelöst (kein Subscription-Neuaufbau).
 */
function setupSubscriptions(containerId, userData) {
    if (listViewState.subscriptionsActive) return;

    const debouncedReload = () => {
        if (listViewState.reloadTimer) clearTimeout(listViewState.reloadTimer);
        listViewState.reloadTimer = setTimeout(() => {
            loadEventListView(
                listViewState.containerId,
                listViewState.userData,
                listViewState.filter
            );
        }, 800);
    };

    const invChannel = supabase
        .channel('event-list-invitations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_invitations' }, debouncedReload)
        .subscribe();

    const evtChannel = supabase
        .channel('event-list-events')
        .on('postgres_changes', {
            event: '*', schema: 'public', table: 'events',
            filter: `club_id=eq.${userData.clubId}`
        }, debouncedReload)
        .subscribe();

    listViewState.subscriptions.push(invChannel, evtChannel);
    listViewState.subscriptionsActive = true;
}

/**
 * Expandiert ein wiederkehrendes Event in Einzeltermine
 */
function expandRecurringEvent(event, fromDateStr, toDateStr) {
    const occurrences = [];
    const eventStart = new Date(event.start_date + 'T12:00:00');
    const from = new Date(fromDateStr + 'T12:00:00');
    const to = new Date(toDateStr + 'T12:00:00');
    const repeatEnd = event.repeat_end_date ? new Date(event.repeat_end_date + 'T12:00:00') : null;
    const excluded = event.excluded_dates || [];

    let current = new Date(eventStart);

    // Vorspulen zum Startfenster
    while (current < from) {
        advanceDate(current, event.repeat_type);
    }

    let maxIterations = 500;
    while (current <= to && maxIterations > 0) {
        if (repeatEnd && current > repeatEnd) break;

        const dateStr = formatDateStr(current);

        if (!excluded.includes(dateStr) && current >= from) {
            occurrences.push(dateStr);
        }

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

function formatDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Rendert die Event-Liste mit Wochengruppierung
 */
function renderEventList(container, occurrences, invitationsByKey, subgroupsMap, filter, todayStr) {
    if (occurrences.length === 0) {
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

    // Gruppierung nach Woche
    const groups = groupByWeek(occurrences, todayStr, filter);

    let html = '<div class="space-y-6">';

    groups.forEach(group => {
        html += `
            <div>
                <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 px-1">${group.label}</h3>
                <div class="space-y-3">
        `;

        group.events.forEach(event => {
            const dateObj = new Date(event.occurrence_date + 'T12:00:00');
            const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const monthShort = dateObj.toLocaleDateString('de-DE', { month: 'short' });
            const isToday = event.occurrence_date === todayStr;

            // Untergruppe-Farbe (Fallback: Kategorie-Farbe)
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

            // Rückmeldungen
            const invKey = `${event.id}_${event.occurrence_date || 'single'}`;
            const responses = invitationsByKey[invKey]
                || invitationsByKey[`${event.id}_single`]
                || invitationsByKey[`${event.id}_null`]
                || { accepted: [], rejected: [], pending: [] };

            const totalResponses = responses.accepted.length + responses.rejected.length + responses.pending.length;

            html += `
                <div class="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                     onclick="window.openEventDetails('${event.id}', '${event.occurrence_date}')">
                    <div class="flex">
                        <!-- Datum-Badge -->
                        <div class="flex-shrink-0 w-16 flex flex-col items-center justify-center py-3 ${isToday ? 'bg-indigo-600 text-white' : 'bg-gray-50 text-gray-700'}" style="${!isToday ? `border-left: 3px solid ${accentColor}` : ''}">
                            <span class="text-xs font-medium ${isToday ? 'text-indigo-200' : 'text-gray-500'}">${dayName}</span>
                            <span class="text-xl font-bold leading-tight">${dayNum}</span>
                            <span class="text-xs ${isToday ? 'text-indigo-200' : 'text-gray-500'}">${monthShort}</span>
                        </div>

                        <!-- Event-Info -->
                        <div class="flex-1 p-3 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <h4 class="font-semibold text-gray-900 truncate">${event.title}</h4>
                                ${isToday ? '<span class="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium flex-shrink-0">Heute</span>' : ''}
                                ${event.event_type === 'recurring' ? '<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full flex-shrink-0"><i class="fas fa-repeat text-[10px]"></i></span>' : ''}
                            </div>

                            <!-- Zeit & Ort -->
                            <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500">
                                ${event.start_time ? `
                                    <span class="flex items-center gap-1">
                                        <i class="far fa-clock text-xs"></i>
                                        ${event.start_time.slice(0, 5)}${event.end_time ? ' - ' + event.end_time.slice(0, 5) : ''}
                                    </span>
                                ` : ''}
                                ${event.meeting_time ? `
                                    <span class="flex items-center gap-1 text-xs text-gray-400">
                                        <i class="fas fa-walking text-[10px]"></i>
                                        Treff ${event.meeting_time.slice(0, 5)}
                                    </span>
                                ` : ''}
                                ${event.location ? `
                                    <span class="flex items-center gap-1">
                                        <i class="fas fa-map-marker-alt text-xs"></i>
                                        <span class="truncate max-w-[150px]">${event.location}</span>
                                    </span>
                                ` : ''}
                            </div>

                            <!-- Untergruppen -->
                            ${subgroupNames.length > 0 ? `
                                <div class="mt-1 text-xs text-gray-400">${subgroupNames.join(', ')}</div>
                            ` : ''}

                            <!-- Rückmeldungen -->
                            ${totalResponses > 0 ? `
                                <div class="mt-2 flex items-center gap-3 text-xs">
                                    <span class="flex items-center gap-1 text-green-600 font-medium">
                                        <i class="fas fa-check"></i> ${responses.accepted.length}
                                    </span>
                                    <span class="flex items-center gap-1 text-red-500 font-medium">
                                        <i class="fas fa-times"></i> ${responses.rejected.length}
                                    </span>
                                    <span class="flex items-center gap-1 text-gray-400 font-medium">
                                        <i class="far fa-clock"></i> ${responses.pending.length}
                                    </span>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Chevron -->
                        <div class="flex-shrink-0 flex items-center pr-3 text-gray-300">
                            <i class="fas fa-chevron-right text-sm"></i>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
}

/**
 * Gruppiert Events nach Woche
 */
function groupByWeek(occurrences, todayStr, filter) {
    const today = new Date(todayStr + 'T12:00:00');
    const groups = new Map();

    occurrences.forEach(event => {
        const eventDate = new Date(event.occurrence_date + 'T12:00:00');
        const label = getWeekLabel(eventDate, today, filter);

        if (!groups.has(label)) {
            groups.set(label, { label, events: [] });
        }
        groups.get(label).events.push(event);
    });

    return Array.from(groups.values());
}

function getWeekLabel(eventDate, today, filter) {
    const diffDays = Math.round((eventDate - today) / (1000 * 60 * 60 * 24));

    if (filter === 'upcoming') {
        if (diffDays === 0) return 'Heute';
        if (diffDays === 1) return 'Morgen';

        const todayWeek = getISOWeek(today);
        const eventWeek = getISOWeek(eventDate);
        const todayYear = today.getFullYear();
        const eventYear = eventDate.getFullYear();

        if (todayYear === eventYear && todayWeek === eventWeek) return 'Diese Woche';
        if ((todayYear === eventYear && eventWeek === todayWeek + 1) ||
            (eventYear === todayYear + 1 && todayWeek >= 52 && eventWeek === 1)) {
            return 'Nächste Woche';
        }

        return eventDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    } else {
        if (diffDays === 0) return 'Heute';
        if (diffDays === -1) return 'Gestern';

        const todayWeek = getISOWeek(today);
        const eventWeek = getISOWeek(eventDate);
        const todayYear = today.getFullYear();
        const eventYear = eventDate.getFullYear();

        if (todayYear === eventYear && todayWeek === eventWeek) return 'Diese Woche';
        if ((todayYear === eventYear && eventWeek === todayWeek - 1) ||
            (eventYear === todayYear - 1 && eventWeek >= 52 && todayWeek === 1)) {
            return 'Letzte Woche';
        }

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

/**
 * Cleanup Subscriptions
 */
export function cleanupListSubscriptions() {
    if (listViewState.reloadTimer) {
        clearTimeout(listViewState.reloadTimer);
        listViewState.reloadTimer = null;
    }
    listViewState.subscriptions.forEach(ch => {
        try { supabase.removeChannel(ch); } catch (e) { /* ignore */ }
    });
    listViewState.subscriptions = [];
    listViewState.subscriptionsActive = false;
}

/**
 * Gibt den aktuellen Filter zurück
 */
export function getEventListFilter() {
    return listViewState.filter;
}
