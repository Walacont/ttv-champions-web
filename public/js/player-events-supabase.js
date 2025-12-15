/**
 * Player Events Module (Supabase Version)
 * Handles event display and responses for players on the dashboard
 */

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let currentUserId = null;

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
        // Get event invitations for current user
        const today = new Date().toISOString().split('T')[0];

        const { data: invitations, error } = await supabase
            .from('event_invitations')
            .select(`
                id,
                status,
                event_id,
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
                    response_deadline
                )
            `)
            .eq('user_id', currentUserId)
            .gte('events.start_date', today)
            .order('events(start_date)', { ascending: true });

        if (error) {
            // Table might not exist yet
            console.log('[PlayerEvents] Events table not available yet');
            section.classList.add('hidden');
            return;
        }

        // Filter out null events (already passed or deleted)
        const validInvitations = (invitations || []).filter(inv => inv.events);

        if (validInvitations.length === 0) {
            section.classList.add('hidden');
            return;
        }

        // Show section
        section.classList.remove('hidden');

        // Get accepted count for each event
        const eventIds = validInvitations.map(inv => inv.events.id);
        const { data: acceptedCounts } = await supabase
            .from('event_invitations')
            .select('event_id')
            .in('event_id', eventIds)
            .eq('status', 'accepted');

        const countMap = {};
        (acceptedCounts || []).forEach(item => {
            countMap[item.event_id] = (countMap[item.event_id] || 0) + 1;
        });

        // Render events
        list.innerHTML = validInvitations.map(inv => renderEventCard(inv, countMap[inv.events.id] || 0)).join('');

        // Add event listeners
        setupEventCardListeners();

    } catch (error) {
        console.error('[PlayerEvents] Error loading events:', error);
        section.classList.add('hidden');
    }
}

/**
 * Render a single event card
 * @param {Object} invitation - Event invitation with event data
 * @param {number} acceptedCount - Number of accepted invitations
 * @returns {string} HTML string
 */
function renderEventCard(invitation, acceptedCount) {
    const event = invitation.events;
    const status = invitation.status;

    // Format date
    const [year, month, day] = event.start_date.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const dayName = dateObj.toLocaleDateString('de-DE', { weekday: 'short' });
    const dayNum = dateObj.getDate();
    const monthName = dateObj.toLocaleDateString('de-DE', { month: 'short' });

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
                            <h3 class="font-semibold text-gray-900">${escapeHtml(event.title)}</h3>
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
 * Setup real-time subscription for event invitations
 */
function setupEventSubscription() {
    if (!currentUserId) return;

    const channel = supabase
        .channel(`player_events_${currentUserId}`)
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

    // Store unsubscribe function
    if (!window.playerEventsUnsubscribes) window.playerEventsUnsubscribes = [];
    window.playerEventsUnsubscribes.push(() => supabase.removeChannel(channel));
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
