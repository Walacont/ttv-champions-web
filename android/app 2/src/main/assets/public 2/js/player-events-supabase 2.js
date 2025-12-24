/**
 * Player Events Module (Supabase Version)
 * Handles event display and responses for players on the dashboard
 */

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let currentUserId = null;

/**
 * Generate upcoming occurrence dates for a recurring event (for a single user)
 * @param {string} startDate - Event start date (YYYY-MM-DD)
 * @param {string} repeatType - 'daily', 'weekly', 'biweekly', 'monthly'
 * @param {string|null} repeatEndDate - Optional end date for recurring
 * @param {Array} excludedDates - Array of excluded date strings
 * @param {number} weeksAhead - How many weeks ahead to generate occurrences
 * @returns {Array} Array of date strings (YYYY-MM-DD)
 */
function generateUpcomingOccurrences(startDate, repeatType, repeatEndDate, excludedDates = [], weeksAhead = 4) {
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

        const dateStr = currentDate.toISOString().split('T')[0];
        if (!excludedDates.includes(dateStr)) {
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
 * @param {string} eventId - Event ID
 * @param {Object} event - Event data
 * @param {string} userId - User ID
 */
async function ensureRecurringInvitationsForPlayer(eventId, event, userId) {
    if (!event.repeat_type || event.event_type !== 'recurring') return;

    // Get existing invitations for this user/event
    const { data: existingInvitations } = await supabase
        .from('event_invitations')
        .select('occurrence_date')
        .eq('event_id', eventId)
        .eq('user_id', userId);

    const existingDates = new Set((existingInvitations || []).map(inv => inv.occurrence_date));

    // Generate upcoming occurrences
    const upcomingOccurrences = generateUpcomingOccurrences(
        event.start_date,
        event.repeat_type,
        event.repeat_end_date,
        event.excluded_dates || [],
        4
    );

    // Find missing invitations
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

    // Insert new invitations
    if (newInvitations.length > 0) {
        try {
            await supabase.from('event_invitations').insert(newInvitations);
        } catch (err) {
            console.warn('[PlayerEvents] Error creating recurring invitations:', err);
        }
    }
}

/**
 * Initialize player events module
 * @param {string} userId - Current user ID
 */
export async function initPlayerEvents(userId) {
    if (!userId) return;
    currentUserId = userId;

    await loadUpcomingEvents();

    // Set up real-time subscription for event invitations
    setupEventSubscription();
}

/**
 * Load upcoming events for the current player
 */
async function loadUpcomingEvents() {
    if (!currentUserId) return;

    const section = document.getElementById('upcoming-events-section');
    const list = document.getElementById('upcoming-events-list');
    if (!section || !list) return;

    try {
        const today = new Date().toISOString().split('T')[0];

        // Get event invitations for current user
        // Now includes occurrence_date for per-occurrence tracking
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

        // Check for recurring events that need new invitations created
        // Group invitations by event
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

        // Create missing invitations for upcoming occurrences
        for (const eventId of Object.keys(eventGroups)) {
            const group = eventGroups[eventId];
            await ensureRecurringInvitationsForPlayer(eventId, group.event, currentUserId);
        }

        // Reload invitations after ensuring recurring ones exist
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
                    event_type
                )
            `)
            .eq('user_id', currentUserId);

        // Filter out null events and past occurrences client-side
        // Use occurrence_date if available, otherwise fall back to start_date
        const nowTime = new Date();
        let validInvitations = (updatedInvitations || []).filter(inv => {
            if (!inv.events) return false;
            const displayDate = inv.occurrence_date || inv.events.start_date;

            // If event is in the future, include it
            if (displayDate > today) return true;

            // If event is today, check if it hasn't ended yet
            if (displayDate === today) {
                // Use end_time if available, otherwise start_time
                const eventTime = inv.events.end_time || inv.events.start_time;
                if (eventTime) {
                    const [hours, minutes] = eventTime.split(':').map(Number);
                    const eventEndTime = new Date();
                    eventEndTime.setHours(hours, minutes, 0, 0);
                    // Include if event hasn't ended yet
                    return nowTime < eventEndTime;
                }
                // If no time info, include today's events
                return true;
            }

            // Past dates - exclude
            return false;
        });

        // Sort by occurrence date
        validInvitations.sort((a, b) => {
            const dateA = a.occurrence_date || a.events.start_date;
            const dateB = b.occurrence_date || b.events.start_date;
            return dateA.localeCompare(dateB);
        });

        // Limit to next 10 events
        validInvitations = validInvitations.slice(0, 10);

        if (validInvitations.length === 0) {
            section.classList.add('hidden');
            return;
        }

        // Show section
        section.classList.remove('hidden');

        // Get accepted count for each event/occurrence combination
        // Now we count per occurrence_date, not just per event
        const eventIds = validInvitations.map(inv => inv.events.id);
        const occurrenceDates = validInvitations.map(inv => inv.occurrence_date).filter(Boolean);

        const { data: acceptedCounts } = await supabase
            .from('event_invitations')
            .select('event_id, occurrence_date')
            .in('event_id', eventIds)
            .eq('status', 'accepted');

        // Create a map with key = "eventId-occurrenceDate"
        const countMap = {};
        (acceptedCounts || []).forEach(item => {
            const key = `${item.event_id}-${item.occurrence_date || 'none'}`;
            countMap[key] = (countMap[key] || 0) + 1;
        });

        // Render events with per-occurrence counts
        list.innerHTML = validInvitations.map(inv => {
            const key = `${inv.events.id}-${inv.occurrence_date || 'none'}`;
            return renderEventCard(inv, countMap[key] || 0);
        }).join('');

        // Add event listeners
        setupEventCardListeners();

    } catch (error) {
        console.error('[PlayerEvents] Error loading events:', error);
        section.classList.add('hidden');
    }
}

/**
 * Get the next occurrence of a recurring event
 * @param {Object} event - Event with repeat_type, start_date, repeat_end_date, excluded_dates
 * @param {string} afterDate - Find occurrence after this date (YYYY-MM-DD)
 * @returns {string|null} Next occurrence date or null
 */
function getNextOccurrence(event, afterDate) {
    if (!event.repeat_type || event.repeat_type === 'none') return null;

    const startDate = new Date(event.start_date + 'T12:00:00');
    const afterDateObj = new Date(afterDate + 'T12:00:00');
    const endDate = event.repeat_end_date ? new Date(event.repeat_end_date + 'T12:00:00') : null;
    const excludedDates = event.excluded_dates || [];

    let currentDate = new Date(startDate);
    let maxIterations = 365; // Prevent infinite loops

    while (maxIterations > 0) {
        const dateStr = currentDate.toISOString().split('T')[0];

        // Check if this date is valid
        if (currentDate >= afterDateObj && !excludedDates.includes(dateStr)) {
            if (!endDate || currentDate <= endDate) {
                return dateStr;
            } else {
                return null; // Past the end date
            }
        }

        // Move to next occurrence based on repeat type
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
 * @param {Object} invitation - Event invitation with event data
 * @param {number} acceptedCount - Number of accepted invitations for this occurrence
 * @returns {string} HTML string
 */
function renderEventCard(invitation, acceptedCount) {
    const event = invitation.events;
    const status = invitation.status;

    // Use occurrence_date from invitation (for per-occurrence tracking)
    // Fall back to displayDate or start_date for backwards compatibility
    const displayDate = invitation.occurrence_date || event.displayDate || event.start_date;

    // Format date
    const [year, month, day] = displayDate.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('de-DE', { month: 'short' });

    // Show recurring indicator
    const isRecurring = event.repeat_type && event.repeat_type !== 'none';

    // Format time
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
    // Accept buttons
    document.querySelectorAll('.event-accept-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invitationId = e.target.dataset.invitationId;
            await respondToEvent(invitationId, 'accepted');
        });
    });

    // Reject buttons
    document.querySelectorAll('.event-reject-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invitationId = e.target.dataset.invitationId;
            await showRejectModal(invitationId);
        });
    });

    // Cancel buttons (for already accepted)
    document.querySelectorAll('.event-cancel-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const invitationId = e.target.dataset.invitationId;
            await showRejectModal(invitationId);
        });
    });

    // Details buttons
    document.querySelectorAll('.event-details-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const eventId = e.target.dataset.eventId;
            await showEventDetails(eventId);
        });
    });
}

/**
 * Respond to an event invitation
 * @param {string} invitationId - Invitation ID
 * @param {string} status - 'accepted' or 'rejected'
 * @param {string} reason - Optional rejection reason
 */
async function respondToEvent(invitationId, status, reason = null) {
    try {
        // First get the invitation details including event info
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

        // Get current user name for notification
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

        // Note: rejection_reason column needs to be added to the table if you want to use it
        // ALTER TABLE event_invitations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

        const { error } = await supabase
            .from('event_invitations')
            .update(updateData)
            .eq('id', invitationId)
            .eq('user_id', currentUserId);

        if (error) throw error;

        // Send notification to event organizer
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

        // Also notify all coaches/head_coaches of the club if organizer is not a coach
        // This ensures coaches always see responses
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

        // Reload events
        await loadUpcomingEvents();

    } catch (error) {
        console.error('[PlayerEvents] Error responding to event:', error);
        alert('Fehler beim Antworten: ' + error.message);
    }
}

/**
 * Show rejection modal with reason input
 * @param {string} invitationId - Invitation ID
 */
async function showRejectModal(invitationId) {
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'event-reject-modal';
    modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">Absage bestätigen</h3>
            <p class="text-gray-600 mb-4">Möchtest du einen Grund für deine Absage angeben? (optional)</p>
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
                <button id="cancel-reject-btn" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                    Abbrechen
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Event listeners
    document.getElementById('confirm-reject-btn').addEventListener('click', async () => {
        const reason = document.getElementById('reject-reason-input').value.trim();
        modal.remove();
        await respondToEvent(invitationId, 'rejected', reason || null);
    });

    document.getElementById('cancel-reject-btn').addEventListener('click', () => {
        modal.remove();
    });

    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * Show event details modal
 * @param {string} eventId - Event ID
 */
async function showEventDetails(eventId) {
    try {
        // Load full event details
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

        // Get participants
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

        // Format date
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

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'event-details-modal';
        modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 overflow-y-auto h-full w-full flex items-start justify-center z-50 p-4 pt-16';
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
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close button
        document.getElementById('close-event-details').addEventListener('click', () => {
            modal.remove();
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('[PlayerEvents] Error loading event details:', error);
        alert('Fehler beim Laden der Details: ' + error.message);
    }
}

/**
 * Setup real-time subscription for event invitations and events
 */
function setupEventSubscription() {
    if (!currentUserId) return;

    // Subscribe to invitation changes for this user
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

    // Subscribe to events table changes (deletions, updates to excluded_dates)
    // This ensures deleted events disappear immediately
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

    // Store unsubscribe functions
    if (!window.playerEventsUnsubscribes) window.playerEventsUnsubscribes = [];
    window.playerEventsUnsubscribes.push(() => supabase.removeChannel(invitationsChannel));
    window.playerEventsUnsubscribes.push(() => supabase.removeChannel(eventsChannel));
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export
export { loadUpcomingEvents };
