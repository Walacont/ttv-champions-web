/**
 * Events Module (Supabase Version)
 * Handles event creation flow for coaches
 */

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

// Module state
let currentEventData = {
    selectedDate: null,
    eventType: 'single', // 'single' or 'recurring'
    targetType: 'club', // 'club' or 'subgroups'
    selectedSubgroups: [],
    selectedMembers: [],
    formData: {}
};

let clubSubgroups = [];
let clubMembers = [];
let currentUserData = null;

/**
 * Initialize events module
 * @param {Object} userData - Current user data
 */
export function initEventsModule(userData) {
    currentUserData = userData;
    setupEventListeners();
    console.log('[Events] Module initialized');
}

/**
 * Setup all event listeners for modals
 */
function setupEventListeners() {
    // Day Modal
    document.getElementById('close-event-day-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('add-event-btn')?.addEventListener('click', openEventTypeModal);

    // Event Type Modal
    document.getElementById('close-event-type-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('back-event-type-modal')?.addEventListener('click', () => showModal('event-day-modal'));
    document.getElementById('select-single-event')?.addEventListener('click', () => selectEventType('single'));
    document.getElementById('select-recurring-event')?.addEventListener('click', () => selectEventType('recurring'));

    // Target Group Modal
    document.getElementById('close-event-target-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('back-event-target-modal')?.addEventListener('click', () => showModal('event-type-modal'));
    document.getElementById('select-whole-club')?.addEventListener('click', () => selectTargetType('club'));
    document.getElementById('select-subgroups')?.addEventListener('click', () => selectTargetType('subgroups'));

    // Subgroup Selection Modal
    document.getElementById('close-event-subgroup-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('back-event-subgroup-modal')?.addEventListener('click', () => showModal('event-target-modal'));
    document.getElementById('confirm-subgroups-btn')?.addEventListener('click', confirmSubgroups);

    // Members Modal
    document.getElementById('back-event-members-modal')?.addEventListener('click', goBackFromMembers);
    document.getElementById('event-members-next-btn')?.addEventListener('click', openEventFormModal);
    document.getElementById('event-select-all-members')?.addEventListener('click', toggleSelectAllMembers);

    // Event Form Modal
    document.getElementById('back-event-form-modal')?.addEventListener('click', () => showModal('event-members-modal'));
    document.getElementById('event-form-submit-btn')?.addEventListener('click', submitEvent);

    // Invitation send type toggle
    document.getElementById('event-send-invitation')?.addEventListener('change', (e) => {
        const scheduledDiv = document.getElementById('event-scheduled-send');
        if (e.target.value === 'scheduled') {
            scheduledDiv?.classList.remove('hidden');
        } else {
            scheduledDiv?.classList.add('hidden');
        }
    });
}

/**
 * Open the day modal when clicking on a calendar day
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {Array} sessionsOnDay - Training sessions on this day
 */
export function openEventDayModal(dateString, sessionsOnDay = []) {
    currentEventData.selectedDate = dateString;

    // Format date for display
    const [year, month, day] = dateString.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    document.getElementById('event-day-modal-date').textContent = formattedDate;

    // Populate events list
    const listEl = document.getElementById('event-day-list');

    if (sessionsOnDay.length > 0) {
        listEl.innerHTML = sessionsOnDay.map(item => {
            const subgroupColor = item.subgroupColor || '#6366f1';

            if (item.type === 'event') {
                // Event item
                return `
                    <div class="p-4 rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all cursor-pointer flex items-center gap-4"
                         onclick="window.openEventDetails && window.openEventDetails('${item.id}')">
                        <div class="w-1 h-12 rounded-full" style="background-color: ${subgroupColor}"></div>
                        <div class="flex-1">
                            <p class="font-semibold text-gray-900">${item.title}</p>
                            <p class="text-sm text-gray-500">${item.startTime || ''}${item.endTime ? ' - ' + item.endTime : ''}${item.location ? ' • ' + item.location : ''}</p>
                        </div>
                        <span class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">Event</span>
                    </div>
                `;
            } else {
                // Training session
                const subgroupName = item.subgroupName || 'Training';
                return `
                    <div class="p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all cursor-pointer flex items-center gap-4"
                         onclick="window.openAttendanceForSession && window.openAttendanceForSession('${item.id}', '${dateString}')">
                        <div class="w-1 h-12 rounded-full" style="background-color: ${subgroupColor}"></div>
                        <div class="flex-1">
                            <p class="font-semibold text-gray-900">${item.startTime} - ${item.endTime}</p>
                            <p class="text-sm text-gray-500">${subgroupName}</p>
                        </div>
                        <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                `;
            }
        }).join('');
    } else {
        listEl.innerHTML = `
            <p class="text-gray-500 text-center py-4">
                Keine Veranstaltungen an diesem Tag
            </p>
        `;
    }

    showModal('event-day-modal');
}

/**
 * Open event type selection modal
 */
function openEventTypeModal() {
    showModal('event-type-modal');
}

/**
 * Select event type and proceed
 * @param {string} type - 'single' or 'recurring'
 */
function selectEventType(type) {
    currentEventData.eventType = type;

    // Show/hide recurring settings in form
    const recurringSettings = document.getElementById('event-recurring-settings');
    if (type === 'recurring') {
        recurringSettings?.classList.remove('hidden');
    } else {
        recurringSettings?.classList.add('hidden');
    }

    showModal('event-target-modal');
}

/**
 * Select target type and proceed
 * @param {string} type - 'club' or 'subgroups'
 */
async function selectTargetType(type) {
    currentEventData.targetType = type;

    if (type === 'subgroups') {
        await loadSubgroups();
        showModal('event-subgroup-modal');
    } else {
        // Whole club - load all members
        currentEventData.selectedSubgroups = [];
        await loadMembers();
        showModal('event-members-modal');
    }
}

/**
 * Load subgroups for selection
 */
async function loadSubgroups() {
    if (!currentUserData?.clubId) return;

    try {
        const { data, error } = await supabase
            .from('subgroups')
            .select('id, name, color')
            .eq('club_id', currentUserData.clubId)
            .order('name');

        if (error) throw error;

        clubSubgroups = data || [];
        renderSubgroupList();
    } catch (error) {
        console.error('[Events] Error loading subgroups:', error);
    }
}

/**
 * Render subgroup list in modal
 */
function renderSubgroupList() {
    const listEl = document.getElementById('event-subgroup-list');
    if (!listEl) return;

    listEl.innerHTML = clubSubgroups.map(subgroup => {
        const color = subgroup.color || '#6366f1';
        return `
            <label class="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-indigo-300 cursor-pointer transition-all">
                <input type="checkbox" value="${subgroup.id}" class="subgroup-checkbox h-5 w-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                       onchange="window.updateSubgroupSelection && window.updateSubgroupSelection()">
                <div class="w-4 h-4 rounded-full" style="background-color: ${color}"></div>
                <span class="font-medium text-gray-900">${subgroup.name}</span>
            </label>
        `;
    }).join('');

    // Expose update function
    window.updateSubgroupSelection = updateSubgroupSelection;
}

/**
 * Update subgroup selection state
 */
function updateSubgroupSelection() {
    const checkboxes = document.querySelectorAll('.subgroup-checkbox:checked');
    currentEventData.selectedSubgroups = Array.from(checkboxes).map(cb => cb.value);

    const confirmBtn = document.getElementById('confirm-subgroups-btn');
    if (confirmBtn) {
        confirmBtn.disabled = currentEventData.selectedSubgroups.length === 0;
    }
}

/**
 * Confirm subgroup selection and proceed
 */
async function confirmSubgroups() {
    await loadMembers();
    showModal('event-members-modal');
}

/**
 * Load members based on selection
 */
async function loadMembers() {
    if (!currentUserData?.clubId) return;

    try {
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, subgroup_ids')
            .eq('club_id', currentUserData.clubId)
            .in('role', ['player', 'coach', 'head_coach'])
            .order('last_name');

        const { data, error } = await query;

        if (error) throw error;

        // Filter by subgroups if selected
        if (currentEventData.targetType === 'subgroups' && currentEventData.selectedSubgroups.length > 0) {
            clubMembers = (data || []).filter(member => {
                const memberSubgroups = member.subgroup_ids || [];
                return currentEventData.selectedSubgroups.some(sg => memberSubgroups.includes(sg));
            });
        } else {
            clubMembers = data || [];
        }

        renderMemberList();
    } catch (error) {
        console.error('[Events] Error loading members:', error);
    }
}

/**
 * Render member list in modal
 */
function renderMemberList() {
    const listEl = document.getElementById('event-members-list');
    const totalEl = document.getElementById('event-members-total');
    if (!listEl) return;

    if (totalEl) {
        totalEl.textContent = clubMembers.length;
    }

    listEl.innerHTML = clubMembers.map(member => {
        const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase();
        const avatarUrl = member.avatar_url || `https://placehold.co/40x40/e2e8f0/64748b?text=${initials}`;
        const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();

        return `
            <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-all">
                <img src="${avatarUrl}" alt="${fullName}"
                     class="w-10 h-10 rounded-full object-cover border border-gray-200"
                     onerror="this.src='https://placehold.co/40x40/e2e8f0/64748b?text=${initials}'">
                <span class="flex-1 font-medium text-gray-900">${fullName}</span>
                <input type="checkbox" value="${member.id}" checked
                       class="member-checkbox h-5 w-5 text-indigo-600 rounded-full border-gray-300 focus:ring-indigo-500"
                       onchange="window.updateMemberCount && window.updateMemberCount()">
            </label>
        `;
    }).join('');

    // Select all by default
    currentEventData.selectedMembers = clubMembers.map(m => m.id);
    updateMemberCount();

    // Expose update function
    window.updateMemberCount = updateMemberCount;
}

/**
 * Update member count display
 */
function updateMemberCount() {
    const checkboxes = document.querySelectorAll('.member-checkbox:checked');
    currentEventData.selectedMembers = Array.from(checkboxes).map(cb => cb.value);

    const countEl = document.getElementById('event-members-count');
    if (countEl) {
        const count = currentEventData.selectedMembers.length;
        countEl.textContent = count === 0
            ? 'Keine Empfänger ausgewählt'
            : `${count} Empfänger ausgewählt`;
    }

    // Update select all button text
    const selectAllBtn = document.getElementById('event-select-all-members');
    if (selectAllBtn) {
        const allChecked = checkboxes.length === clubMembers.length;
        selectAllBtn.textContent = allChecked ? 'Alle abwählen' : 'Alle auswählen';
    }
}

/**
 * Toggle select all members
 */
function toggleSelectAllMembers() {
    const checkboxes = document.querySelectorAll('.member-checkbox');
    const allChecked = document.querySelectorAll('.member-checkbox:checked').length === checkboxes.length;

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    updateMemberCount();
}

/**
 * Go back from members modal
 */
function goBackFromMembers() {
    if (currentEventData.targetType === 'subgroups') {
        showModal('event-subgroup-modal');
    } else {
        showModal('event-target-modal');
    }
}

/**
 * Open event creation form modal
 */
function openEventFormModal() {
    // Pre-fill date from selected date
    const startDateInput = document.getElementById('event-start-date');
    if (startDateInput && currentEventData.selectedDate) {
        startDateInput.value = currentEventData.selectedDate;
    }

    // Set default time to 18:00
    const startTimeInput = document.getElementById('event-start-time');
    if (startTimeInput && !startTimeInput.value) {
        startTimeInput.value = '18:00';
    }

    showModal('event-form-modal');
}

/**
 * Submit the event
 */
async function submitEvent() {
    const title = document.getElementById('event-title')?.value?.trim();
    const description = document.getElementById('event-description')?.value?.trim();
    const startDate = document.getElementById('event-start-date')?.value;
    const startTime = document.getElementById('event-start-time')?.value;
    const meetingTime = document.getElementById('event-meeting-time')?.value;
    const endTime = document.getElementById('event-end-time')?.value;
    const location = document.getElementById('event-location')?.value?.trim();
    const maxParticipants = document.getElementById('event-max-participants')?.value;
    const responseDeadline = document.getElementById('event-response-deadline')?.value;
    const sendInvitation = document.getElementById('event-send-invitation')?.value;
    const sendAt = document.getElementById('event-send-at')?.value;
    const commentsEnabled = document.getElementById('event-comments-enabled')?.checked;

    // Validation
    if (!title) {
        alert('Bitte gib einen Titel ein.');
        return;
    }
    if (!startDate || !startTime) {
        alert('Bitte gib Datum und Uhrzeit ein.');
        return;
    }
    if (currentEventData.selectedMembers.length === 0) {
        alert('Bitte wähle mindestens einen Empfänger aus.');
        return;
    }

    // Recurring settings
    let repeatType = null;
    let repeatEnd = null;
    if (currentEventData.eventType === 'recurring') {
        repeatType = document.getElementById('event-repeat-type')?.value;
        repeatEnd = document.getElementById('event-repeat-end')?.value;
    }

    // Build event data
    const eventData = {
        club_id: currentUserData.clubId,
        organizer_id: currentUserData.id,
        title,
        description,
        start_date: startDate,
        start_time: startTime,
        meeting_time: meetingTime || null,
        end_time: endTime || null,
        location: location || null,
        event_type: currentEventData.eventType,
        target_type: currentEventData.targetType,
        target_subgroup_ids: currentEventData.targetType === 'subgroups' ? currentEventData.selectedSubgroups : [],
        max_participants: maxParticipants ? parseInt(maxParticipants) : null,
        response_deadline: responseDeadline || null,
        invitation_send_at: sendInvitation === 'scheduled' && sendAt ? sendAt : new Date().toISOString(),
        comments_enabled: commentsEnabled,
        repeat_type: repeatType,
        repeat_end_date: repeatEnd,
        created_at: new Date().toISOString()
    };

    try {
        const submitBtn = document.getElementById('event-form-submit-btn');
        if (submitBtn) {
            submitBtn.textContent = 'Wird erstellt...';
            submitBtn.disabled = true;
        }

        // Insert event
        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert(eventData)
            .select()
            .single();

        if (eventError) throw eventError;

        // Create invitations for selected members
        const invitations = currentEventData.selectedMembers.map(userId => ({
            event_id: event.id,
            user_id: userId,
            status: 'pending',
            created_at: new Date().toISOString()
        }));

        const { error: invError } = await supabase
            .from('event_invitations')
            .insert(invitations);

        if (invError) throw invError;

        // Create notifications for invited members (if sending now)
        // Note: This is optional and won't block event creation if it fails
        if (sendInvitation === 'now') {
            try {
                const notifications = currentEventData.selectedMembers.map(userId => ({
                    user_id: userId,
                    type: 'event_invitation',
                    message: `Du wurdest zu "${title}" eingeladen`,
                    data: { event_id: event.id },
                    is_read: false,
                    created_at: new Date().toISOString()
                }));

                await supabase.from('notifications').insert(notifications);
            } catch (notifError) {
                console.warn('[Events] Could not create notifications:', notifError);
            }
        }

        // Success
        alert('Veranstaltung erfolgreich erstellt!');
        closeAllModals();
        resetEventData();

        // Trigger calendar reload
        window.dispatchEvent(new CustomEvent('event-created'));

    } catch (error) {
        console.error('[Events] Error creating event:', error);
        alert('Fehler beim Erstellen der Veranstaltung: ' + error.message);
    } finally {
        const submitBtn = document.getElementById('event-form-submit-btn');
        if (submitBtn) {
            submitBtn.textContent = 'Senden';
            submitBtn.disabled = false;
        }
    }
}

/**
 * Reset event data
 */
function resetEventData() {
    currentEventData = {
        selectedDate: null,
        eventType: 'single',
        targetType: 'club',
        selectedSubgroups: [],
        selectedMembers: [],
        formData: {}
    };

    // Reset form
    document.getElementById('event-creation-form')?.reset();
}

/**
 * Show a specific modal and hide others
 * @param {string} modalId - Modal ID to show
 */
function showModal(modalId) {
    const allModals = [
        'event-day-modal',
        'event-type-modal',
        'event-target-modal',
        'event-subgroup-modal',
        'event-members-modal',
        'event-form-modal'
    ];

    allModals.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            if (id === modalId) {
                modal.classList.remove('hidden');
            } else {
                modal.classList.add('hidden');
            }
        }
    });
}

/**
 * Close all modals
 */
function closeAllModals() {
    const allModals = [
        'event-day-modal',
        'event-type-modal',
        'event-target-modal',
        'event-subgroup-modal',
        'event-members-modal',
        'event-form-modal'
    ];

    allModals.forEach(id => {
        document.getElementById(id)?.classList.add('hidden');
    });
}

/**
 * Open event details (for viewing an existing event)
 * @param {string} eventId - The event ID
 */
window.openEventDetails = async function(eventId) {
    try {
        // Load event details
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        // Load invitation counts
        const { data: invitations, error: invError } = await supabase
            .from('event_invitations')
            .select('status')
            .eq('event_id', eventId);

        const accepted = (invitations || []).filter(i => i.status === 'accepted').length;
        const declined = (invitations || []).filter(i => i.status === 'declined').length;
        const pending = (invitations || []).filter(i => i.status === 'pending').length;

        // Format date
        const eventDate = new Date(event.start_date);
        const formattedDate = eventDate.toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Show details in alert for now (can be improved with a proper modal later)
        alert(`${event.title}\n\n` +
            `Datum: ${formattedDate}\n` +
            `Zeit: ${event.start_time || '-'}${event.end_time ? ' - ' + event.end_time : ''}\n` +
            `Ort: ${event.location || '-'}\n\n` +
            `Zusagen: ${accepted}\n` +
            `Absagen: ${declined}\n` +
            `Ausstehend: ${pending}\n\n` +
            (event.description ? `Beschreibung:\n${event.description}` : '')
        );

    } catch (error) {
        console.error('[Events] Error loading event details:', error);
        alert('Fehler beim Laden der Event-Details');
    }
};

// Export functions for global access
export { closeAllModals };
