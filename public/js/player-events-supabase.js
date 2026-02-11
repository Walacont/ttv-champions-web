/**
 * Player Events Module (Supabase Version)
 * Handles event display and responses for players on the dashboard
 */

import { getSupabase } from './supabase-init.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();

let currentUserId = null;

/**
 * Generate upcoming occurrence dates for a recurring event (for a single user)
 * @param {string} startDate - Event-Startdatum (YYYY-MM-DD)
 * @param {string} repeatType - 'daily', 'weekly', 'biweekly', 'monthly'
 * @param {string|null} repeatEndDate - Optionales Enddatum für Wiederholung
 * @param {Array} excludedDates - Array ausgeschlossener Datum-Strings
 * @param {number} weeksAhead - Wochen im Voraus für Termine
 * @returns {Array} Array of date strings (YYYY-MM-DD)
 */
function generateUpcomingOccurrences(startDate, repeatType, repeatEndDate, excludedDates = [], weeksAhead = 4, leadTimeValue = null, leadTimeUnit = null) {
    const occurrences = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventStart = new Date(startDate + 'T12:00:00');
    const endDate = repeatEndDate ? new Date(repeatEndDate + 'T12:00:00') : null;

    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + (weeksAhead * 7));

    let currentDate = new Date(eventStart);
    if (currentDate < today) {
        while (currentDate < today) {
            switch (repeatType) {
                case 'daily':
                    currentDate.setDate(currentDate.getDate() + 1);
                    break;
                case 'weekly':
                    currentDate.setDate(currentDate.getDate() + 7);
                    break;
                case 'biweekly':
                    currentDate.setDate(currentDate.getDate() + 14);
                    break;
                case 'monthly':
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    break;
            }
        }
    }

    let maxIterations = 100;
    while (currentDate <= windowEnd && maxIterations > 0) {
        if (endDate && currentDate > endDate) break;

        // Lead-Time-Filter: Nur Termine einbeziehen bei denen das Vorlaufzeit-Fenster begonnen hat
        // z.B. bei 3 Tage Vorlaufzeit: Termin am Mittwoch -> erst ab Sonntag sichtbar
        let withinLeadTimeWindow = true;
        if (leadTimeValue && leadTimeUnit) {
            const leadTimeStart = new Date(currentDate);
            switch (leadTimeUnit) {
                case 'hours':
                    leadTimeStart.setHours(leadTimeStart.getHours() - leadTimeValue);
                    break;
                case 'days':
                    leadTimeStart.setDate(leadTimeStart.getDate() - leadTimeValue);
                    break;
                case 'weeks':
                    leadTimeStart.setDate(leadTimeStart.getDate() - (leadTimeValue * 7));
                    break;
            }
            leadTimeStart.setHours(0, 0, 0, 0);
            withinLeadTimeWindow = today >= leadTimeStart;
        }

        // Use local date to avoid timezone issues
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        if (!excludedDates.includes(dateStr) && withinLeadTimeWindow) {
            occurrences.push(dateStr);
        }

        switch (repeatType) {
            case 'daily':
                currentDate.setDate(currentDate.getDate() + 1);
                break;
            case 'weekly':
                currentDate.setDate(currentDate.getDate() + 7);
                break;
            case 'biweekly':
                currentDate.setDate(currentDate.getDate() + 14);
                break;
            case 'monthly':
                currentDate.setMonth(currentDate.getMonth() + 1);
                break;
        }
        maxIterations--;
    }

    return occurrences;
}

/**
 * Ensure invitations exist for upcoming occurrences of a recurring event (for a single user)
 * @param {string} eventId - Event-ID
 * @param {Object} event - Event-Daten
 * @param {string} userId - Benutzer-ID
 */
async function ensureRecurringInvitationsForPlayer(eventId, event, userId) {
    if (!event.repeat_type || event.event_type !== 'recurring') return;

    // Existierende Einladungen für diesen Benutzer/Event abrufen
    const { data: existingInvitations } = await supabase
        .from('event_invitations')
        .select('occurrence_date')
        .eq('event_id', eventId)
        .eq('user_id', userId);

    const existingDates = new Set((existingInvitations || []).map(inv => inv.occurrence_date));

    // Kommende Termine generieren (mit Lead-Time-Filter)
    const upcomingOccurrences = generateUpcomingOccurrences(
        event.start_date,
        event.repeat_type,
        event.repeat_end_date,
        event.excluded_dates || [],
        4,
        event.invitation_lead_time_value,
        event.invitation_lead_time_unit
    );

    // Fehlende Einladungen finden
    const newInvitations = [];
    upcomingOccurrences.forEach(occurrenceDate => {
        if (!existingDates.has(occurrenceDate)) {
            newInvitations.push({
                event_id: eventId,
                user_id: userId,
                occurrence_date: occurrenceDate,
                status: 'pending',
                created_at: new Date().toISOString()
            });
        }
    });

    // Neue Einladungen einfügen (mit upsert um 409 Konflikte zu vermeiden)
    if (newInvitations.length > 0) {
        try {
            await supabase.from('event_invitations').upsert(newInvitations, {
                onConflict: 'event_id,user_id,occurrence_date',
                ignoreDuplicates: true
            });
        } catch (err) {
            console.warn('[PlayerEvents] Error creating recurring invitations:', err);
        }
    }
}

/**
 * Initialize player events module
 * @param {string} userId - Aktuelle Benutzer-ID
 */
export async function initPlayerEvents(userId) {
    if (!userId) return;
    currentUserId = userId;

    await loadUpcomingEvents();

    // Echtzeit-Subscription für Event-Einladungen einrichten
    setupEventSubscription();
}

/**
 * Load upcoming events for the current player
 */
async function loadUpcomingEvents() {
    if (!currentUserId) return;

    const section = document.getElementById('upcoming-events-section');
    const slidesContainer = document.getElementById('events-carousel-slides');
    if (!section || !slidesContainer) return;

    try {
        // Use local date to avoid timezone issues (toISOString uses UTC)
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // Event-Einladungen für aktuellen Benutzer abrufen
        // Enthält jetzt occurrence_date für Nachverfolgung pro Termin
        const { data: invitations, error } = await supabase
            .from('event_invitations')
            .select(`
                id,
                status,
                event_id,
                occurrence_date,
                events (
                    id,
                    title,
                    description,
                    start_date,
                    start_time,
                    end_time,
                    location,
                    organizer_id,
                    max_participants,
                    response_deadline,
                    repeat_type,
                    repeat_end_date,
                    excluded_dates,
                    invitation_lead_time_value,
                    invitation_lead_time_unit,
                    event_type
                )
            `)
            .eq('user_id', currentUserId);

        if (error) {
            console.error('[PlayerEvents] Error fetching invitations:', error);
            section.classList.add('hidden');
            return;
        }

        // Auf wiederkehrende Events prüfen die neue Einladungen benötigen
        // Einladungen nach Event gruppieren
        const eventGroups = {};
        (invitations || []).forEach(inv => {
            if (inv.events && inv.events.repeat_type && inv.events.event_type === 'recurring') {
                if (!eventGroups[inv.event_id]) {
                    eventGroups[inv.event_id] = {
                        event: inv.events,
                        invitations: []
                    };
                }
                eventGroups[inv.event_id].invitations.push(inv);
            }
        });

        // Fehlende Einladungen für kommende Termine erstellen
        for (const eventId of Object.keys(eventGroups)) {
            const group = eventGroups[eventId];
            await ensureRecurringInvitationsForPlayer(eventId, group.event, currentUserId);
        }

        // Einladungen neu laden nachdem wiederkehrende erstellt wurden
        const { data: updatedInvitations, error: reloadError } = await supabase
            .from('event_invitations')
            .select(`
                id,
                status,
                event_id,
                occurrence_date,
                events (
                    id,
                    title,
                    description,
                    start_date,
                    start_time,
                    end_time,
                    location,
                    organizer_id,
                    max_participants,
                    response_deadline,
                    repeat_type,
                    repeat_end_date,
                    excluded_dates,
                    invitation_lead_time_value,
                    invitation_lead_time_unit,
                    event_type
                )
            `)
            .eq('user_id', currentUserId);

        // Null-Events und vergangene Termine clientseitig herausfiltern
        // occurrence_date verwenden falls verfügbar, sonst auf start_date zurückfallen
        const nowTime = new Date();
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        let validInvitations = (updatedInvitations || []).filter(inv => {
            if (!inv.events) return false;
            const displayDate = inv.occurrence_date || inv.events.start_date;

            // Lead-Time-Filter: Bei wiederkehrenden Events mit Vorlaufzeit
            // nur Einladungen anzeigen bei denen das Vorlaufzeit-Fenster begonnen hat
            const ltValue = inv.events.invitation_lead_time_value;
            const ltUnit = inv.events.invitation_lead_time_unit;
            if (ltValue && ltUnit && inv.events.event_type === 'recurring') {
                const eventDate = new Date(displayDate + 'T12:00:00');
                const leadTimeStart = new Date(eventDate);
                switch (ltUnit) {
                    case 'hours':
                        leadTimeStart.setHours(leadTimeStart.getHours() - ltValue);
                        break;
                    case 'days':
                        leadTimeStart.setDate(leadTimeStart.getDate() - ltValue);
                        break;
                    case 'weeks':
                        leadTimeStart.setDate(leadTimeStart.getDate() - (ltValue * 7));
                        break;
                }
                leadTimeStart.setHours(0, 0, 0, 0);
                if (todayDate < leadTimeStart) return false;
            }

            // Falls Event in der Zukunft, einbeziehen
            if (displayDate > today) return true;

            // Falls Event heute, prüfen ob noch nicht beendet
            if (displayDate === today) {
                // end_time verwenden falls verfügbar, sonst start_time
                const eventTime = inv.events.end_time || inv.events.start_time;
                if (eventTime) {
                    const [hours, minutes] = eventTime.split(':').map(Number);
                    const eventEndTime = new Date();
                    eventEndTime.setHours(hours, minutes, 0, 0);
                    // Einbeziehen falls Event noch nicht beendet
                    return nowTime < eventEndTime;
                }
                // Falls keine Zeitinfo, heutige Events einbeziehen
                return true;
            }

            // Vergangene Daten - ausschließen
            return false;
        });

        // Sortierung: Pending zuerst, dann nach Datum (nächster Termin zuerst)
        const statusOrder = { pending: 0, accepted: 1, rejected: 2 };
        validInvitations.sort((a, b) => {
            const statusDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
            if (statusDiff !== 0) return statusDiff;
            const dateA = a.occurrence_date || a.events.start_date;
            const dateB = b.occurrence_date || b.events.start_date;
            return dateA.localeCompare(dateB);
        });

        // Auf nächste 10 Events limitieren
        validInvitations = validInvitations.slice(0, 10);

        if (validInvitations.length === 0) {
            section.classList.add('hidden');
            return;
        }

        // Sektion anzeigen
        section.classList.remove('hidden');

        // Angenommen-Zähler für jede Event/Termin-Kombination abrufen
        const eventIds = validInvitations.map(inv => inv.events.id);

        const { data: acceptedCounts } = await supabase
            .from('event_invitations')
            .select('event_id, occurrence_date')
            .in('event_id', eventIds)
            .eq('status', 'accepted');

        // Map erstellen mit Schlüssel = "eventId-occurrenceDate"
        const countMap = {};
        (acceptedCounts || []).forEach(item => {
            const key = `${item.event_id}-${item.occurrence_date || 'none'}`;
            countMap[key] = (countMap[key] || 0) + 1;
        });

        // Pending-Badge aktualisieren
        const pendingCount = validInvitations.filter(inv => inv.status === 'pending').length;
        const pendingBadge = document.getElementById('events-pending-badge');
        if (pendingBadge) {
            if (pendingCount > 0) {
                pendingBadge.textContent = `${pendingCount} offen`;
                pendingBadge.classList.remove('hidden');
            } else {
                pendingBadge.classList.add('hidden');
            }
        }

        // Events als Carousel-Slides rendern
        slidesContainer.innerHTML = validInvitations.map((inv, index) => {
            const key = `${inv.events.id}-${inv.occurrence_date || 'none'}`;
            return `<div class="event-slide w-full flex-shrink-0" data-index="${index}">${renderEventCard(inv, countMap[key] || 0)}</div>`;
        }).join('');

        // Dots und Navigation
        const dotsContainer = document.getElementById('events-carousel-dots');
        const prevBtn = document.getElementById('events-prev-btn');
        const nextBtn = document.getElementById('events-next-btn');
        const hasMultiple = validInvitations.length > 1;

        if (prevBtn) prevBtn.classList.toggle('hidden', !hasMultiple);
        if (nextBtn) nextBtn.classList.toggle('hidden', !hasMultiple);
        if (dotsContainer) {
            dotsContainer.classList.toggle('hidden', !hasMultiple);
            dotsContainer.innerHTML = validInvitations.map((inv, index) => {
                const dotColor = inv.status === 'pending' ? 'bg-orange-400' : 'bg-gray-300';
                const activeColor = index === 0 ? 'bg-indigo-600' : dotColor;
                return `<button class="event-carousel-dot w-2 h-2 rounded-full transition-colors ${activeColor}" data-index="${index}"></button>`;
            }).join('');
        }

        // Carousel initialisieren
        initEventsCarousel(validInvitations.length);

        // Event-Listener hinzufügen
        setupEventCardListeners();

    } catch (error) {
        console.error('[PlayerEvents] Error loading events:', error);
        section.classList.add('hidden');
    }
}

/**
 * Get the next occurrence of a recurring event
 * @param {Object} event - Event mit repeat_type, start_date, repeat_end_date, excluded_dates
 * @param {string} afterDate - Termin nach diesem Datum finden (YYYY-MM-DD)
 * @returns {string|null} Next occurrence date or null
 */
function getNextOccurrence(event, afterDate) {
    if (!event.repeat_type || event.repeat_type === 'none') return null;

    const startDate = new Date(event.start_date + 'T12:00:00');
    const afterDateObj = new Date(afterDate + 'T12:00:00');
    const endDate = event.repeat_end_date ? new Date(event.repeat_end_date + 'T12:00:00') : null;
    const excludedDates = event.excluded_dates || [];

    let currentDate = new Date(startDate);
    let maxIterations = 365; // Endlosschleifen verhindern

    while (maxIterations > 0) {
        // Use local date to avoid timezone issues
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

        // Prüfen ob dieses Datum gültig ist
        if (currentDate >= afterDateObj && !excludedDates.includes(dateStr)) {
            if (!endDate || currentDate <= endDate) {
                return dateStr;
            } else {
                return null; // Nach dem Enddatum
            }
        }

        // Zum nächsten Termin basierend auf Wiederholungstyp wechseln
        switch (event.repeat_type) {
            case 'daily':
                currentDate.setDate(currentDate.getDate() + 1);
                break;
            case 'weekly':
                currentDate.setDate(currentDate.getDate() + 7);
                break;
            case 'biweekly':
                currentDate.setDate(currentDate.getDate() + 14);
                break;
            case 'monthly':
                currentDate.setMonth(currentDate.getMonth() + 1);
                break;
            default:
                return null;
        }

        maxIterations--;
    }

    return null;
}

/**
 * Render a single event card
 * @param {Object} invitation - Event-Einladung mit Event-Daten
 * @param {number} acceptedCount - Anzahl akzeptierter Einladungen für diesen Termin
 * @returns {string} HTML string
 */
function renderEventCard(invitation, acceptedCount) {
    const event = invitation.events;
    const status = invitation.status;

    // occurrence_date aus Einladung verwenden (für Pro-Termin-Tracking)
    // Auf displayDate oder start_date zurückfallen für Abwärtskompatibilität
    const displayDate = invitation.occurrence_date || event.displayDate || event.start_date;

    // Datum formatieren
    const [year, month, day] = displayDate.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('de-DE', { month: 'short' });

    // Wiederkehrend-Indikator anzeigen
    const isRecurring = event.repeat_type && event.repeat_type !== 'none';

    // Uhrzeit formatieren
    const startTime = event.start_time?.slice(0, 5) || '';
    const endTime = event.end_time?.slice(0, 5) || '';
    const timeDisplay = endTime ? `${startTime} - ${endTime}` : startTime;

    // Participants display
    const maxParticipants = event.max_participants;
    const participantsDisplay = maxParticipants
        ? `${acceptedCount}/${maxParticipants} Teilnehmer`
        : `${acceptedCount} Teilnehmer`;

    // Status styling
    let statusBadge = '';
    let actionButtons = '';

    if (status === 'accepted') {
        statusBadge = `
            <span class="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <i class="fas fa-check mr-1"></i>Zugesagt
            </span>
        `;
        actionButtons = `
            <button class="event-cancel-btn text-sm text-red-600 hover:text-red-800 font-medium" data-invitation-id="${invitation.id}">
                Absagen
            </button>
        `;
    } else if (status === 'rejected') {
        statusBadge = `
            <span class="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                <i class="fas fa-times mr-1"></i>Abgesagt
            </span>
        `;
        actionButtons = `
            <button class="event-accept-btn text-sm text-indigo-600 hover:text-indigo-800 font-medium" data-invitation-id="${invitation.id}">
                Doch zusagen
            </button>
        `;
    } else {
        // Pending
        actionButtons = `
            <div class="flex gap-2">
                <button class="event-accept-btn px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors" data-invitation-id="${invitation.id}">
                    Zusagen
                </button>
                <button class="event-reject-btn px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors" data-invitation-id="${invitation.id}">
                    Absagen
                </button>
            </div>
        `;
    }

    return `
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div class="flex">
                <!-- Date Badge -->
                <div class="w-20 bg-gradient-to-b from-indigo-500 to-purple-600 text-white flex flex-col items-center justify-center py-4">
                    <span class="text-xs uppercase font-medium opacity-80">${dayName}</span>
                    <span class="text-2xl font-bold">${dayNum}</span>
                    <span class="text-xs uppercase font-medium opacity-80">${monthName}</span>
                </div>

                <!-- Content -->
                <div class="flex-1 p-4">
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <h3 class="font-semibold text-gray-900">
                                ${escapeHtml(event.title)}
                                ${isRecurring ? '<i class="fas fa-redo text-xs text-indigo-500 ml-1" title="Wiederkehrend"></i>' : ''}
                            </h3>
                            <p class="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                </svg>
                                ${timeDisplay}
                            </p>
                            ${event.location ? `
                                <p class="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                    </svg>
                                    ${escapeHtml(event.location)}
                                </p>
                            ` : ''}
                        </div>
                        ${statusBadge}
                    </div>

                    <!-- Participants -->
                    <div class="flex items-center gap-2 text-sm text-gray-500 mb-3">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        <span>${participantsDisplay}</span>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center justify-between">
                        ${actionButtons}
                        <button class="event-details-btn text-sm text-gray-500 hover:text-gray-700" data-event-id="${event.id}">
                            Details <i class="fas fa-chevron-right ml-1"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup event listeners for event cards
 */
function setupEventCardListeners() {
    // Annehmen-Buttons
    document.querySelectorAll('.event-accept-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invitationId = e.target.dataset.invitationId;
            await respondToEvent(invitationId, 'accepted');
        });
    });

    // Ablehnen-Buttons
    document.querySelectorAll('.event-reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invitationId = e.target.dataset.invitationId;
            await showRejectModal(invitationId);
        });
    });

    // Absagen-Buttons (für bereits angenommene)
    document.querySelectorAll('.event-cancel-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invitationId = e.target.dataset.invitationId;
            await showRejectModal(invitationId);
        });
    });

    // Details-Buttons
    document.querySelectorAll('.event-details-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const eventId = e.target.dataset.eventId;
            await showEventDetails(eventId);
        });
    });
}

/**
 * Respond to an event invitation
 * @param {string} invitationId - Einladungs-ID
 * @param {string} status - 'accepted' or 'rejected'
 * @param {string} reason - Optionaler Ablehnungsgrund
 */
async function respondToEvent(invitationId, status, reason = null) {
    try {
        // Zuerst Einladungsdetails inklusive Event-Info abrufen
        const { data: invitation, error: invError } = await supabase
            .from('event_invitations')
            .select(`
                id,
                event_id,
                events (
                    id,
                    title,
                    start_date,
                    organizer_id,
                    club_id
                )
            `)
            .eq('id', invitationId)
            .single();

        if (invError) throw invError;

        // Aktuellen Benutzernamen für Benachrichtigung abrufen
        const { data: currentUser } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', currentUserId)
            .single();

        const userName = currentUser ? `${currentUser.first_name} ${currentUser.last_name}` : 'Ein Spieler';

        const updateData = {
            status,
            response_at: new Date().toISOString()
        };

        // Save decline comment if provided (visible to organizers who accepted)
        if (status === 'rejected' && reason) {
            updateData.decline_comment = reason;
        } else if (status === 'accepted') {
            updateData.decline_comment = null;
        }

        const { error } = await supabase
            .from('event_invitations')
            .update(updateData)
            .eq('id', invitationId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        // Benachrichtigung an Event-Organisator senden
        if (invitation.events?.organizer_id && invitation.events.organizer_id !== currentUserId) {
            const event = invitation.events;
            const formattedDate = new Date(event.start_date + 'T12:00:00').toLocaleDateString('de-DE', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });

            const notificationType = status === 'accepted' ? 'event_response_accepted' : 'event_response_rejected';
            const notificationTitle = status === 'accepted' ? 'Zusage erhalten' : 'Absage erhalten';
            const notificationMessage = status === 'accepted'
                ? `${userName} hat für "${event.title}" am ${formattedDate} zugesagt`
                : `${userName} hat für "${event.title}" am ${formattedDate} abgesagt${reason ? `: ${reason}` : ''}`;

            await supabase.from('notifications').insert({
                user_id: invitation.events.organizer_id,
                type: notificationType,
                title: notificationTitle,
                message: notificationMessage,
                data: {
                    event_id: event.id,
                    event_title: event.title,
                    event_date: event.start_date,
                    responder_id: currentUserId,
                    responder_name: userName,
                    response_status: status,
                    rejection_reason: reason
                },
                is_read: false,
                created_at: new Date().toISOString()
            });
        }

        // Auch alle Coaches/Head-Coaches des Vereins benachrichtigen falls Organisator kein Coach ist
        // Stellt sicher dass Coaches immer Antworten sehen
        if (invitation.events?.club_id) {
            const { data: coaches } = await supabase
                .from('profiles')
                .select('id')
                .eq('club_id', invitation.events.club_id)
                .in('role', ['coach', 'head_coach'])
                .neq('id', currentUserId)
                .neq('id', invitation.events.organizer_id || '');

            if (coaches && coaches.length > 0) {
                const event = invitation.events;
                const formattedDate = new Date(event.start_date + 'T12:00:00').toLocaleDateString('de-DE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short'
                });

                const coachNotifications = coaches.map(coach => ({
                    user_id: coach.id,
                    type: status === 'accepted' ? 'event_response_accepted' : 'event_response_rejected',
                    title: status === 'accepted' ? 'Zusage erhalten' : 'Absage erhalten',
                    message: status === 'accepted'
                        ? `${userName} hat für "${event.title}" am ${formattedDate} zugesagt`
                        : `${userName} hat für "${event.title}" am ${formattedDate} abgesagt`,
                    data: {
                        event_id: event.id,
                        event_title: event.title,
                        event_date: event.start_date,
                        responder_id: currentUserId,
                        responder_name: userName,
                        response_status: status
                    },
                    is_read: false,
                    created_at: new Date().toISOString()
                }));

                await supabase.from('notifications').insert(coachNotifications);
            }
        }

        // Events neu laden
        await loadUpcomingEvents();

    } catch (error) {
        console.error('[PlayerEvents] Error responding to event:', error);
        alert('Fehler beim Antworten: ' + error.message);
    }
}

/**
 * Show rejection modal with two options: with comment or without
 * @param {string} invitationId - Einladungs-ID
 */
async function showRejectModal(invitationId) {
    const modal = document.createElement('div');
    modal.id = 'event-reject-modal';
    modal.className = 'fixed inset-0 bg-gray-800/75 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-2">Absage</h3>
            <p class="text-gray-600 mb-5 text-sm">Wie möchtest du absagen?</p>

            <div id="reject-options" class="space-y-3">
                <button id="reject-with-comment-btn" class="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition text-left">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                        </svg>
                    </div>
                    <div>
                        <span class="font-semibold text-gray-900">Mit Kommentar absagen</span>
                        <p class="text-xs text-gray-500 mt-0.5">Sichtbar für Veranstalter die zugesagt haben</p>
                    </div>
                </button>

                <button id="reject-without-comment-btn" class="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-gray-200 hover:border-red-400 hover:bg-red-50 transition text-left">
                    <div class="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <svg class="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </div>
                    <div>
                        <span class="font-semibold text-gray-900">Ohne Grund absagen</span>
                        <p class="text-xs text-gray-500 mt-0.5">Einfach absagen ohne Kommentar</p>
                    </div>
                </button>
            </div>

            <div id="reject-comment-form" class="hidden">
                <textarea
                    id="reject-reason-input"
                    placeholder="z.B. Bin krank, habe einen anderen Termin..."
                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                    rows="3"
                ></textarea>
                <div class="flex gap-3 mt-4">
                    <button id="confirm-reject-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                        Absagen
                    </button>
                    <button id="back-reject-btn" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                        Zurück
                    </button>
                </div>
            </div>

            <button id="cancel-reject-btn" class="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 py-2">
                Abbrechen
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    // Option: with comment
    document.getElementById('reject-with-comment-btn').addEventListener('click', () => {
        document.getElementById('reject-options').classList.add('hidden');
        document.getElementById('reject-comment-form').classList.remove('hidden');
        document.getElementById('reject-reason-input').focus();
    });

    // Option: without comment
    document.getElementById('reject-without-comment-btn').addEventListener('click', async () => {
        modal.remove();
        await respondToEvent(invitationId, 'rejected', null);
    });

    // Confirm with comment
    document.getElementById('confirm-reject-btn').addEventListener('click', async () => {
        const reason = document.getElementById('reject-reason-input').value.trim();
        modal.remove();
        await respondToEvent(invitationId, 'rejected', reason || null);
    });

    // Back button
    document.getElementById('back-reject-btn').addEventListener('click', () => {
        document.getElementById('reject-options').classList.remove('hidden');
        document.getElementById('reject-comment-form').classList.add('hidden');
    });

    document.getElementById('cancel-reject-btn').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * Show event details modal
 * @param {string} eventId - Event-ID
 */
async function showEventDetails(eventId) {
    try {
        // Vollständige Event-Details laden
        const { data: event, error } = await supabase
            .from('events')
            .select(`
                *,
                organizer:organizer_id (
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .eq('id', eventId)
            .single();

        if (error) throw error;

        // Teilnehmer abrufen
        const { data: participants } = await supabase
            .from('event_invitations')
            .select(`
                status,
                user:user_id (
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .eq('event_id', eventId);

        const accepted = (participants || []).filter(p => p.status === 'accepted');
        const rejected = (participants || []).filter(p => p.status === 'rejected');
        const pending = (participants || []).filter(p => p.status === 'pending');

        // Datum formatieren
        const [year, month, day] = event.start_date.split('-');
        const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
        const dateDisplay = dateObj.toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Time display
        const startTime = event.start_time?.slice(0, 5) || '';
        const endTime = event.end_time?.slice(0, 5) || '';
        const meetingTime = event.meeting_time?.slice(0, 5) || '';

        // Modal erstellen
        const modal = document.createElement('div');
        modal.id = 'event-details-modal';
        modal.className = 'fixed inset-0 bg-gray-800/75 overflow-y-auto h-full w-full flex items-start justify-center z-50 p-4 pt-16';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden">
                <!-- Header -->
                <div class="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-xl font-bold text-white">${escapeHtml(event.title)}</h2>
                            <p class="text-indigo-200 text-sm mt-1">${dateDisplay}</p>
                        </div>
                        <button id="close-event-details" class="text-white/80 hover:text-white">
                            <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6 space-y-6">
                    ${event.description ? `
                        <div>
                            <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Beschreibung</h3>
                            <p class="text-gray-700">${escapeHtml(event.description)}</p>
                        </div>
                    ` : ''}

                    <!-- Time & Location -->
                    <div class="space-y-3">
                        <div class="flex items-center gap-3 text-gray-700">
                            <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <div>
                                <p class="font-medium">${startTime}${endTime ? ` - ${endTime}` : ''} Uhr</p>
                                ${meetingTime ? `<p class="text-sm text-gray-500">Treffpunkt: ${meetingTime} Uhr</p>` : ''}
                            </div>
                        </div>

                        ${event.location ? `
                            <div class="flex items-center gap-3 text-gray-700">
                                <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                </svg>
                                <p class="font-medium">${escapeHtml(event.location)}</p>
                            </div>
                        ` : ''}

                        ${event.organizer ? `
                            <div class="flex items-center gap-3 text-gray-700">
                                <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                </svg>
                                <p class="font-medium">Organisiert von ${event.organizer.first_name} ${event.organizer.last_name}</p>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Participants -->
                    <div>
                        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                            Teilnehmer (${accepted.length}${event.max_participants ? `/${event.max_participants}` : ''})
                        </h3>

                        <!-- Accepted -->
                        ${accepted.length > 0 ? `
                            <div class="mb-4">
                                <p class="text-xs font-medium text-green-600 mb-2 flex items-center gap-1">
                                    <i class="fas fa-check"></i> Zugesagt (${accepted.length})
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    ${accepted.map(p => `
                                        <span class="px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
                                            ${p.user?.first_name || ''} ${p.user?.last_name || ''}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Rejected -->
                        ${rejected.length > 0 ? `
                            <div class="mb-4">
                                <p class="text-xs font-medium text-red-600 mb-2 flex items-center gap-1">
                                    <i class="fas fa-times"></i> Abgesagt (${rejected.length})
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    ${rejected.map(p => `
                                        <span class="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm">
                                            ${p.user?.first_name || ''} ${p.user?.last_name || ''}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Pending -->
                        ${pending.length > 0 ? `
                            <div>
                                <p class="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                                    <i class="fas fa-clock"></i> Ausstehend (${pending.length})
                                </p>
                                <div class="flex flex-wrap gap-2">
                                    ${pending.map(p => `
                                        <span class="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                                            ${p.user?.first_name || ''} ${p.user?.last_name || ''}
                                        </span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>

                    ${event.comments_enabled ? `
                    <!-- Comments Section -->
                    <div class="border-t pt-4">
                        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Kommentare</h3>
                        <div id="player-event-comments-list" class="space-y-3 mb-4 max-h-48 overflow-y-auto">
                            <p class="text-sm text-gray-400 text-center py-2">Laden...</p>
                        </div>
                        <div class="flex gap-2">
                            <input type="text" id="player-event-comment-input" placeholder="Kommentar schreiben..."
                                class="flex-1 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm">
                            <button id="player-post-comment-btn" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Schließen-Button
        document.getElementById('close-event-details').addEventListener('click', () => {
            modal.remove();
        });

        // Bei Hintergrund-Klick schließen
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Load and setup comments if enabled
        if (event.comments_enabled) {
            await loadPlayerEventComments(eventId);

            const postBtn = document.getElementById('player-post-comment-btn');
            const commentInput = document.getElementById('player-event-comment-input');
            if (postBtn && commentInput) {
                postBtn.addEventListener('click', async () => {
                    const content = commentInput.value.trim();
                    if (!content) return;
                    try {
                        await supabase.from('event_comments').insert({
                            event_id: eventId,
                            user_id: currentUserId,
                            content,
                            created_at: new Date().toISOString()
                        });
                        commentInput.value = '';
                        await loadPlayerEventComments(eventId);
                    } catch (err) {
                        console.error('[PlayerEvents] Error posting comment:', err);
                    }
                });

                commentInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        postBtn.click();
                    }
                });
            }
        }

    } catch (error) {
        console.error('[PlayerEvents] Error loading event details:', error);
        alert('Fehler beim Laden der Details: ' + error.message);
    }
}

/**
 * Load comments for a player event detail view
 */
async function loadPlayerEventComments(eventId) {
    const container = document.getElementById('player-event-comments-list');
    if (!container) return;

    try {
        const { data: comments, error } = await supabase
            .from('event_comments')
            .select(`
                id, content, created_at, user_id,
                profiles:user_id (first_name, last_name)
            `)
            .eq('event_id', eventId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!comments || comments.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-400 text-center py-2">Noch keine Kommentare</p>';
            return;
        }

        container.innerHTML = comments.map(comment => {
            const name = comment.profiles ? `${comment.profiles.first_name} ${comment.profiles.last_name}` : 'Unbekannt';
            const time = new Date(comment.created_at).toLocaleString('de-DE', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
            const isOwn = comment.user_id === currentUserId;
            return `
                <div class="flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}">
                    <div class="${isOwn ? 'text-right' : ''}">
                        <div class="inline-block ${isOwn ? 'bg-indigo-50' : 'bg-gray-50'} rounded-xl px-3 py-2 max-w-[85%]">
                            <p class="text-xs font-semibold ${isOwn ? 'text-indigo-600' : 'text-gray-600'}">${name}</p>
                            <p class="text-sm text-gray-900">${escapeHtml(comment.content)}</p>
                            <p class="text-xs text-gray-400 mt-0.5">${time}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    } catch (error) {
        console.error('[PlayerEvents] Error loading comments:', error);
        container.innerHTML = '<p class="text-sm text-red-500 text-center py-2">Fehler beim Laden</p>';
    }
}

/**
 * Setup real-time subscription for event invitations and events
 */
function setupEventSubscription() {
    if (!currentUserId) return;

    // Auf Einladungsänderungen für diesen Benutzer abonnieren
    const invitationsChannel = supabase
        .channel(`player_invitations_${currentUserId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'event_invitations',
                filter: `user_id=eq.${currentUserId}`
            },
            () => {
                loadUpcomingEvents();
            }
        )
        .subscribe();

    // Auf Events-Tabellen-Änderungen abonnieren (Löschungen, Updates zu excluded_dates)
    // Stellt sicher dass gelöschte Events sofort verschwinden
    const eventsChannel = supabase
        .channel(`player_events_updates_${currentUserId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'events'
            },
            (payload) => {
                console.log('[PlayerEvents] Event updated:', payload);
                loadUpcomingEvents();
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'DELETE',
                schema: 'public',
                table: 'events'
            },
            (payload) => {
                console.log('[PlayerEvents] Event deleted:', payload);
                loadUpcomingEvents();
            }
        )
        .subscribe();

    // Abmelde-Funktionen speichern
    if (!window.playerEventsUnsubscribes) window.playerEventsUnsubscribes = [];
    window.playerEventsUnsubscribes.push(() => supabase.removeChannel(invitationsChannel));
    window.playerEventsUnsubscribes.push(() => supabase.removeChannel(eventsChannel));
}

// ========== EVENTS CAROUSEL ==========

let eventsCarouselIndex = 0;
let eventsCarouselCount = 0;
let eventsTouchStartX = 0;
let eventsTouchEndX = 0;

function initEventsCarousel(count) {
    eventsCarouselCount = count;
    eventsCarouselIndex = 0;

    const slidesContainer = document.getElementById('events-carousel-slides');
    const prevBtn = document.getElementById('events-prev-btn');
    const nextBtn = document.getElementById('events-next-btn');
    const dotsContainer = document.getElementById('events-carousel-dots');
    const carousel = document.getElementById('events-carousel');

    if (!slidesContainer || !carousel) return;

    // Remove old listeners by cloning
    const newCarousel = carousel.cloneNode(true);
    carousel.parentNode.replaceChild(newCarousel, carousel);

    const newPrev = document.getElementById('events-prev-btn');
    const newNext = document.getElementById('events-next-btn');
    const newDots = document.getElementById('events-carousel-dots');
    const freshCarousel = document.getElementById('events-carousel');

    // Arrow navigation
    newPrev?.addEventListener('click', () => goToEventSlide(eventsCarouselIndex - 1));
    newNext?.addEventListener('click', () => goToEventSlide(eventsCarouselIndex + 1));

    // Dot navigation
    newDots?.querySelectorAll('.event-carousel-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            goToEventSlide(parseInt(dot.dataset.index));
        });
    });

    // Touch/swipe support
    freshCarousel.addEventListener('touchstart', (e) => {
        eventsTouchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    freshCarousel.addEventListener('touchend', (e) => {
        eventsTouchEndX = e.changedTouches[0].screenX;
        const diff = eventsTouchStartX - eventsTouchEndX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) goToEventSlide(eventsCarouselIndex + 1);
            else goToEventSlide(eventsCarouselIndex - 1);
        }
    }, { passive: true });

    // Mouse drag support
    let isDragging = false;
    let dragStartX = 0;

    freshCarousel.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragStartX = e.clientX;
        freshCarousel.style.cursor = 'grabbing';
    });

    freshCarousel.addEventListener('mousemove', (e) => {
        if (isDragging) e.preventDefault();
    });

    freshCarousel.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        freshCarousel.style.cursor = 'grab';
        const diff = dragStartX - e.clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) goToEventSlide(eventsCarouselIndex + 1);
            else goToEventSlide(eventsCarouselIndex - 1);
        }
    });

    freshCarousel.addEventListener('mouseleave', () => {
        isDragging = false;
        freshCarousel.style.cursor = '';
    });

    if (count > 1) {
        freshCarousel.style.cursor = 'grab';
    }
}

function goToEventSlide(index) {
    if (index < 0) index = eventsCarouselCount - 1;
    if (index >= eventsCarouselCount) index = 0;

    eventsCarouselIndex = index;

    const slidesContainer = document.getElementById('events-carousel-slides');
    const dotsContainer = document.getElementById('events-carousel-dots');

    if (slidesContainer) {
        slidesContainer.style.transform = `translateX(-${index * 100}%)`;
    }

    if (dotsContainer) {
        const dots = dotsContainer.querySelectorAll('.event-carousel-dot');
        dots.forEach((dot, i) => {
            // Get the slide to determine pending status for inactive dot color
            const slide = document.querySelector(`.event-slide[data-index="${i}"]`);
            const isPending = slide?.querySelector('.event-accept-btn:not(.event-cancel-btn)') && !slide?.querySelector('.px-2.py-1.rounded-full');
            if (i === index) {
                dot.className = 'event-carousel-dot w-2.5 h-2.5 rounded-full transition-colors bg-indigo-600';
            } else {
                dot.className = `event-carousel-dot w-2 h-2 rounded-full transition-colors ${isPending ? 'bg-orange-400' : 'bg-gray-300'}`;
            }
        });
    }
}

// Export
export { loadUpcomingEvents };
