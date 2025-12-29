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

// Exercise tracking state for event attendance
let eventExercises = [];
let allExercises = []; // Cache of all available exercises

// Points configuration
const EVENT_ATTENDANCE_POINTS_BASE = 3;

/**
 * Show a toast notification message
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToastMessage(message, type = 'info') {
    // Remove any existing toast
    const existingToast = document.getElementById('event-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.id = 'event-toast';

    const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-indigo-600';

    toast.className = `fixed bottom-4 right-4 ${bgColor} text-white px-6 py-3 rounded-xl shadow-xl z-[100010] flex items-center gap-3 transition-opacity duration-300`;
    toast.style.opacity = '0';
    toast.innerHTML = `
        <svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            ${type === 'success'
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
                : type === 'error'
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'}
        </svg>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // Fade in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Generate upcoming occurrence dates for a recurring event
 * Returns dates where invitations should be created (within lead time window)
 * @param {string} startDate - Event start date (YYYY-MM-DD)
 * @param {string} repeatType - 'daily', 'weekly', 'biweekly', 'monthly'
 * @param {string|null} repeatEndDate - Optional end date for recurring
 * @param {Array} excludedDates - Array of excluded date strings
 * @param {number|null} leadTimeValue - Lead time value (e.g., 3)
 * @param {string|null} leadTimeUnit - 'hours', 'days', 'weeks'
 * @param {number} weeksAhead - How many weeks ahead to generate occurrences
 * @returns {Array} Array of date strings (YYYY-MM-DD)
 */
function generateUpcomingOccurrences(startDate, repeatType, repeatEndDate, excludedDates = [], leadTimeValue = null, leadTimeUnit = null, weeksAhead = 4) {
    const occurrences = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventStart = new Date(startDate + 'T12:00:00');
    const endDate = repeatEndDate ? new Date(repeatEndDate + 'T12:00:00') : null;

    // Calculate the window: from today to weeksAhead weeks from now
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + (weeksAhead * 7));

    // If there's a lead time, we should include occurrences that are within the lead time window
    // For example, if lead time is 3 days and an event is in 5 days, it should be included
    // because in 2 days it will be within the 3-day window
    let windowStart = new Date(today);

    // Start from the event's start date or today, whichever is later
    let currentDate = new Date(eventStart);
    if (currentDate < today) {
        // Find the first occurrence on or after today
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

    // Generate occurrences within the window
    let maxIterations = 100;
    while (currentDate <= windowEnd && maxIterations > 0) {
        // Check if past end date
        if (endDate && currentDate > endDate) break;

        const dateStr = currentDate.toISOString().split('T')[0];

        // Check if not excluded
        if (!excludedDates.includes(dateStr)) {
            occurrences.push(dateStr);
        }

        // Move to next occurrence
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
 * Check and create missing invitations for recurring events
 * This should be called periodically or when viewing events
 * @param {string} eventId - Event ID
 * @param {Object} event - Event data with repeat settings
 * @param {Array} existingInvitations - Existing invitations for this event
 * @returns {Array} New invitations that were created
 */
async function ensureRecurringInvitations(eventId, event, existingInvitations) {
    if (!event.repeat_type || event.event_type !== 'recurring') return [];

    const today = new Date().toISOString().split('T')[0];

    // Get all unique user IDs from existing invitations
    const userIds = [...new Set(existingInvitations.map(inv => inv.user_id))];
    if (userIds.length === 0) return [];

    // Get existing occurrence dates
    const existingDates = new Set(existingInvitations.map(inv => inv.occurrence_date));

    // Generate upcoming occurrences
    const upcomingOccurrences = generateUpcomingOccurrences(
        event.start_date,
        event.repeat_type,
        event.repeat_end_date,
        event.excluded_dates || [],
        event.invitation_lead_time_value,
        event.invitation_lead_time_unit,
        4 // 4 weeks ahead
    );

    // Find missing invitations
    const newInvitations = [];
    upcomingOccurrences.forEach(occurrenceDate => {
        if (!existingDates.has(occurrenceDate)) {
            userIds.forEach(userId => {
                newInvitations.push({
                    event_id: eventId,
                    user_id: userId,
                    occurrence_date: occurrenceDate,
                    status: 'pending',
                    created_at: new Date().toISOString()
                });
            });
        }
    });

    // Insert new invitations
    if (newInvitations.length > 0) {
        try {
            const { error } = await supabase
                .from('event_invitations')
                .upsert(newInvitations, {
                    onConflict: 'event_id,user_id,occurrence_date',
                    ignoreDuplicates: true
                });

            if (error) {
                console.warn('[Events] Error creating recurring invitations:', error);
            }
        } catch (err) {
            console.warn('[Events] Error in ensureRecurringInvitations:', err);
        }
    }

    return newInvitations;
}

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
        const leadTimeDiv = document.getElementById('event-lead-time-send');

        // Hide all first
        scheduledDiv?.classList.add('hidden');
        leadTimeDiv?.classList.add('hidden');

        // Show the relevant one
        if (e.target.value === 'scheduled') {
            scheduledDiv?.classList.remove('hidden');
        } else if (e.target.value === 'lead_time') {
            leadTimeDiv?.classList.remove('hidden');
        }
    });
}

/**
 * Open the day modal when clicking on a calendar day
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {Array} eventsOnDay - Events on this day
 */
export function openEventDayModal(dateString, eventsOnDay = []) {
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

    if (eventsOnDay.length > 0) {
        listEl.innerHTML = eventsOnDay.map(event => {
            const subgroupColor = event.subgroupColor || '#6366f1';
            const subgroupText = event.subgroupNames && event.subgroupNames.length > 0
                ? event.subgroupNames.join(', ')
                : (event.targetType === 'club' ? 'Gesamter Verein' : '');

            return `
                <div class="p-4 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all cursor-pointer flex items-center gap-4"
                     onclick="window.openEventDetails && window.openEventDetails('${event.id}', '${dateString}')">
                    <div class="w-1 h-12 rounded-full" style="background-color: ${subgroupColor}"></div>
                    <div class="flex-1">
                        <p class="font-semibold text-gray-900">${event.title}</p>
                        <p class="text-sm text-gray-500">
                            ${event.startTime || ''}${event.endTime ? ' - ' + event.endTime : ''}
                            ${event.location ? ' • ' + event.location : ''}
                        </p>
                        ${subgroupText ? `<p class="text-xs text-gray-400 mt-1">${subgroupText}</p>` : ''}
                    </div>
                    <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                    </svg>
                </div>
            `;
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
    const leadTimeValue = parseInt(document.getElementById('event-lead-time-value')?.value) || 3;
    const leadTimeUnit = document.getElementById('event-lead-time-unit')?.value || 'days';
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
        repeatType = document.getElementById('event-repeat-type')?.value || null;
        repeatEnd = document.getElementById('event-repeat-end')?.value || null;
    }

    // Calculate invitation_send_at based on send type
    let invitationSendAt = new Date().toISOString();
    let invitationLeadTimeValue = null;
    let invitationLeadTimeUnit = null;

    if (sendInvitation === 'scheduled' && sendAt) {
        invitationSendAt = sendAt;
    } else if (sendInvitation === 'lead_time') {
        // Calculate when to send based on lead time before event
        const eventDateTime = new Date(`${startDate}T${startTime}`);
        const sendDateTime = new Date(eventDateTime);

        switch (leadTimeUnit) {
            case 'hours':
                sendDateTime.setHours(sendDateTime.getHours() - leadTimeValue);
                break;
            case 'days':
                sendDateTime.setDate(sendDateTime.getDate() - leadTimeValue);
                break;
            case 'weeks':
                sendDateTime.setDate(sendDateTime.getDate() - (leadTimeValue * 7));
                break;
        }

        // If calculated time is in the past, send now
        if (sendDateTime < new Date()) {
            invitationSendAt = new Date().toISOString();
        } else {
            invitationSendAt = sendDateTime.toISOString();
        }

        // Store lead time for recurring events
        invitationLeadTimeValue = leadTimeValue;
        invitationLeadTimeUnit = leadTimeUnit;
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
        invitation_send_at: invitationSendAt,
        invitation_lead_time_value: invitationLeadTimeValue,
        invitation_lead_time_unit: invitationLeadTimeUnit,
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
        // For recurring events, create invitations for each occurrence within the next 4 weeks
        // For single events, create one invitation with occurrence_date = start_date
        const invitations = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (currentEventData.eventType === 'recurring' && repeatType) {
            // Generate occurrences for the next 4 weeks (or until repeat_end_date)
            const occurrences = generateUpcomingOccurrences(
                startDate,
                repeatType,
                repeatEnd,
                [],  // no excluded dates yet
                invitationLeadTimeValue,
                invitationLeadTimeUnit,
                4 // weeks to look ahead
            );

            // Create invitation for each occurrence and each member
            occurrences.forEach(occurrenceDate => {
                currentEventData.selectedMembers.forEach(userId => {
                    invitations.push({
                        event_id: event.id,
                        user_id: userId,
                        occurrence_date: occurrenceDate,
                        status: 'pending',
                        created_at: new Date().toISOString()
                    });
                });
            });
        } else {
            // Single event - one invitation per member
            currentEventData.selectedMembers.forEach(userId => {
                invitations.push({
                    event_id: event.id,
                    user_id: userId,
                    occurrence_date: startDate,
                    status: 'pending',
                    created_at: new Date().toISOString()
                });
            });
        }

        if (invitations.length > 0) {
            const { error: invError } = await supabase
                .from('event_invitations')
                .insert(invitations);

            if (invError) throw invError;
        }

        // Create notifications for invited members (if sending now)
        // Note: This is optional and won't block event creation if it fails
        if (sendInvitation === 'now') {
            try {
                const notifications = currentEventData.selectedMembers.map(userId => ({
                    user_id: userId,
                    type: 'event_invitation',
                    title: 'Neue Einladung',
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
 * Shows attendance tracking for coaches if event is today or past
 * @param {string} eventId - The event ID
 * @param {string} occurrenceDate - The specific occurrence date (YYYY-MM-DD) for recurring events
 */
window.openEventDetails = async function(eventId, occurrenceDate = null) {
    try {
        // Load event details
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        // Load invitations with user details
        const { data: invitations, error: invError } = await supabase
            .from('event_invitations')
            .select(`
                id,
                user_id,
                status,
                response_at,
                profiles:user_id (
                    id,
                    first_name,
                    last_name
                )
            `)
            .eq('event_id', eventId);

        if (invError) console.warn('[Events] Could not load invitations:', invError);

        const accepted = (invitations || []).filter(i => i.status === 'accepted');
        const declined = (invitations || []).filter(i => i.status === 'rejected' || i.status === 'declined');
        const pending = (invitations || []).filter(i => i.status === 'pending');

        // Check if event is today or in past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Use occurrence date if provided (for recurring events), otherwise use start_date
        const displayDate = occurrenceDate || event.start_date;
        const eventDate = new Date(displayDate);
        eventDate.setHours(0, 0, 0, 0);
        const isPastOrToday = eventDate <= today;

        // Check if current user is coach/head_coach/admin
        const isCoach = currentUserData && ['coach', 'head_coach', 'admin'].includes(currentUserData.role);
        console.log('[Events] openEventDetails - currentUserData:', currentUserData, 'isCoach:', isCoach);

        // Format date
        const formattedDate = eventDate.toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // Load existing attendance if any
        let attendanceData = null;
        eventExercises = []; // Reset exercises
        if (isPastOrToday) {
            const { data: attendance } = await supabase
                .from('event_attendance')
                .select('*')
                .eq('event_id', eventId)
                .single();
            attendanceData = attendance;

            // Load existing exercises from attendance
            if (attendance?.completed_exercises) {
                eventExercises = attendance.completed_exercises;
            }
        }

        // Create and show modal
        const existingModal = document.getElementById('event-details-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'event-details-modal';
        modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-[100001] p-4';

        const presentIds = attendanceData?.present_user_ids || [];
        const existingExercisesHtml = eventExercises.length > 0
            ? eventExercises.map((ex, index) => `
                <div class="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div class="flex-1">
                        <p class="font-medium text-gray-900">${ex.name}</p>
                        <p class="text-sm text-indigo-600">+${ex.points || 0} Punkte</p>
                    </div>
                    <button onclick="window.removeEventExercise(${index})"
                            class="text-red-500 hover:text-red-700 p-1">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
            `).join('')
            : '<p class="text-gray-400 text-sm text-center py-2">Keine Übungen hinzugefügt</p>';

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-start">
                        <div>
                            <h2 class="text-xl font-bold text-gray-900">${event.title}</h2>
                            <p class="text-gray-500 mt-1">${formattedDate}</p>
                            ${event.repeat_type ? `
                            <p class="text-sm text-indigo-600 mt-1">
                                <svg class="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                                </svg>
                                Wiederkehrend (${event.repeat_type === 'weekly' ? 'Wöchentlich' : event.repeat_type === 'daily' ? 'Täglich' : 'Monatlich'})
                            </p>
                            ` : ''}
                        </div>
                        <div class="flex items-center gap-2">
                            ${isCoach ? `
                            <button onclick="window.openEditEventModal('${eventId}')" class="text-indigo-500 hover:text-indigo-700 p-2" title="Bearbeiten">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                </svg>
                            </button>
                            <button onclick="window.openDeleteEventModal('${eventId}', ${event.repeat_type ? 'true' : 'false'}, '${displayDate}')" class="text-red-500 hover:text-red-700 p-2" title="Löschen">
                                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                                </svg>
                            </button>
                            ` : ''}
                            <button onclick="document.getElementById('event-details-modal').remove()" class="text-gray-400 hover:text-gray-600 p-2">
                                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6 overflow-y-auto flex-1">
                    <!-- Event Info -->
                    <div class="space-y-3 mb-6">
                        <div class="flex items-center gap-3 text-gray-600">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <span>${event.start_time || '-'}${event.end_time ? ' - ' + event.end_time : ''}</span>
                        </div>
                        ${event.location ? `
                        <div class="flex items-center gap-3 text-gray-600">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                            </svg>
                            <span>${event.location}</span>
                        </div>
                        ` : ''}
                        ${event.description ? `
                        <p class="text-gray-600 mt-3">${event.description}</p>
                        ` : ''}
                    </div>

                    <!-- Attendance Status Summary -->
                    <div class="flex gap-4 mb-6">
                        <div class="flex-1 bg-green-50 rounded-xl p-4 text-center">
                            <p class="text-2xl font-bold text-green-600">${accepted.length}</p>
                            <p class="text-sm text-green-700">Zusagen</p>
                        </div>
                        <div class="flex-1 bg-red-50 rounded-xl p-4 text-center">
                            <p class="text-2xl font-bold text-red-600">${declined.length}</p>
                            <p class="text-sm text-red-700">Absagen</p>
                        </div>
                        <div class="flex-1 bg-gray-50 rounded-xl p-4 text-center">
                            <p class="text-2xl font-bold text-gray-600">${pending.length}</p>
                            <p class="text-sm text-gray-700">Ausstehend</p>
                        </div>
                    </div>

                    ${isPastOrToday && isCoach ? `
                    <!-- Attendance Tracking for Coaches -->
                    <div class="border-t pt-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <svg class="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                            </svg>
                            Anwesenheit erfassen
                        </h3>
                        <p class="text-sm text-gray-500 mb-4">Markiere die Teilnehmer, die anwesend waren:</p>

                        <div class="space-y-2 max-h-64 overflow-y-auto" id="event-attendance-list">
                            ${(invitations || []).map(inv => {
                                const name = inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt';
                                const isPresent = presentIds.includes(inv.user_id);
                                const statusBadge = inv.status === 'accepted'
                                    ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Zugesagt</span>'
                                    : inv.status === 'rejected' || inv.status === 'declined'
                                    ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Abgesagt</span>'
                                    : '<span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Ausstehend</span>';
                                return `
                                    <label class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox"
                                               class="event-attendance-checkbox w-5 h-5 text-indigo-600 rounded"
                                               data-user-id="${inv.user_id}"
                                               ${isPresent ? 'checked' : ''}>
                                        <span class="flex-1 font-medium text-gray-900">${name}</span>
                                        ${statusBadge}
                                    </label>
                                `;
                            }).join('')}
                        </div>

                    </div>

                    <!-- Exercise Tracking for Coaches -->
                    <div class="border-t pt-6 mt-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <svg class="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                            </svg>
                            Übungen
                        </h3>
                        <p class="text-sm text-gray-500 mb-4">Welche Übungen wurden durchgeführt?</p>

                        <div id="event-exercises-list" class="space-y-2 mb-4">
                            ${existingExercisesHtml}
                        </div>

                        <button
                            onclick="window.openEventExerciseSelector('${eventId}')"
                            class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                            </svg>
                            Übung hinzufügen
                        </button>
                    </div>

                    <button
                        onclick="window.saveEventAttendance('${eventId}')"
                        class="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors">
                        Alles speichern
                    </button>
                    ` : ''}

                    ${!isPastOrToday ? `
                    <!-- Future event - show participant list -->
                    <div class="border-t pt-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">Teilnehmer</h3>
                        ${accepted.length > 0 ? `
                        <div class="mb-4">
                            <p class="text-sm font-medium text-green-700 mb-2">Zugesagt (${accepted.length})</p>
                            <div class="flex flex-wrap gap-2">
                                ${accepted.map(inv => `
                                    <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                                        ${inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt'}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${declined.length > 0 ? `
                        <div class="mb-4">
                            <p class="text-sm font-medium text-red-700 mb-2">Abgesagt (${declined.length})</p>
                            <div class="flex flex-wrap gap-2">
                                ${declined.map(inv => `
                                    <span class="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                                        ${inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt'}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${pending.length > 0 ? `
                        <div>
                            <p class="text-sm font-medium text-gray-700 mb-2">Ausstehend (${pending.length})</p>
                            <div class="flex flex-wrap gap-2">
                                ${pending.map(inv => `
                                    <span class="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                                        ${inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt'}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

    } catch (error) {
        console.error('[Events] Error loading event details:', error);
        alert('Fehler beim Laden der Event-Details');
    }
};

/**
 * Save event attendance and exercises with points/streak logic
 * @param {string} eventId - Event ID
 */
window.saveEventAttendance = async function(eventId) {
    try {
        const checkboxes = document.querySelectorAll('.event-attendance-checkbox:checked');
        const presentUserIds = Array.from(checkboxes).map(cb => cb.dataset.userId);

        // Load event details for points calculation
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*, target_subgroup_ids')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        // Prepare exercise data
        const exerciseData = eventExercises.map(ex => ({
            id: ex.id,
            name: ex.name,
            points: ex.points || 0
        }));

        // Calculate total exercise points
        const totalExercisePoints = exerciseData.reduce((sum, ex) => sum + (ex.points || 0), 0);

        // Check if attendance record exists and get previous attendees
        const { data: existing } = await supabase
            .from('event_attendance')
            .select('id, present_user_ids, points_awarded_to')
            .eq('event_id', eventId)
            .single();

        const previouslyAwardedTo = existing?.points_awarded_to || [];
        const previousPresentIds = existing?.present_user_ids || [];

        // Determine which players need points awarded (new attendees)
        const newAttendees = presentUserIds.filter(id => !previouslyAwardedTo.includes(id));
        const removedAttendees = previousPresentIds.filter(id => !presentUserIds.includes(id) && previouslyAwardedTo.includes(id));

        // Award points to new attendees
        for (const playerId of newAttendees) {
            await awardEventAttendancePoints(
                playerId,
                event,
                totalExercisePoints
            );
        }

        // Deduct points from removed attendees (if they were previously awarded)
        for (const playerId of removedAttendees) {
            await deductEventAttendancePoints(
                playerId,
                event
            );
        }

        // Update the list of players who received points
        const updatedPointsAwardedTo = [
            ...previouslyAwardedTo.filter(id => presentUserIds.includes(id)),
            ...newAttendees
        ];

        if (existing) {
            // Update existing record
            const { error } = await supabase
                .from('event_attendance')
                .update({
                    present_user_ids: presentUserIds,
                    completed_exercises: exerciseData,
                    points_awarded_to: updatedPointsAwardedTo,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // Create new record
            const { error } = await supabase
                .from('event_attendance')
                .insert({
                    event_id: eventId,
                    present_user_ids: presentUserIds,
                    completed_exercises: exerciseData,
                    points_awarded_to: updatedPointsAwardedTo,
                    created_at: new Date().toISOString()
                });

            if (error) throw error;
        }

        alert('Gespeichert!');
        document.getElementById('event-details-modal')?.remove();
        eventExercises = []; // Reset

    } catch (error) {
        console.error('[Events] Error saving attendance:', error);
        alert('Fehler beim Speichern: ' + error.message);
    }
};

/**
 * Award attendance points to a player for an event
 * @param {string} playerId - Player ID
 * @param {Object} event - Event object with details
 * @param {number} exercisePoints - Additional points from exercises
 */
async function awardEventAttendancePoints(playerId, event, exercisePoints = 0) {
    const date = event.start_date;
    const eventTitle = event.title || 'Veranstaltung';
    const subgroupIds = event.target_subgroup_ids || [];

    // Use first subgroup for streak tracking, or null for club-wide events
    const primarySubgroupId = subgroupIds.length > 0 ? subgroupIds[0] : null;

    // Get subgroup name if available
    let subgroupName = '';
    if (primarySubgroupId) {
        const { data: subgroup } = await supabase
            .from('subgroups')
            .select('name')
            .eq('id', primarySubgroupId)
            .single();
        subgroupName = subgroup?.name || '';
    }

    // Get previous event to determine streak continuation
    const { data: previousEvents } = await supabase
        .from('events')
        .select('id, start_date')
        .eq('club_id', event.club_id)
        .lt('start_date', date)
        .order('start_date', { ascending: false })
        .limit(1);

    let wasPresentAtLastEvent = false;
    if (previousEvents && previousEvents.length > 0) {
        const { data: prevAttendance } = await supabase
            .from('event_attendance')
            .select('present_user_ids')
            .eq('event_id', previousEvents[0].id)
            .single();

        wasPresentAtLastEvent = prevAttendance?.present_user_ids?.includes(playerId) || false;
    }

    // Get current streak (use event-specific streaks or fallback to subgroup streaks)
    const { data: streakData } = await supabase
        .from('streaks')
        .select('current_streak')
        .eq('user_id', playerId)
        .eq('subgroup_id', primarySubgroupId || event.club_id)
        .single();

    const currentStreak = streakData?.current_streak || 0;
    const newStreak = wasPresentAtLastEvent ? currentStreak + 1 : 1;

    // Check for other events on same day
    const { data: otherEventsToday } = await supabase
        .from('events')
        .select('id')
        .eq('club_id', event.club_id)
        .eq('start_date', date)
        .neq('id', event.id);

    let alreadyAttendedToday = false;
    if (otherEventsToday && otherEventsToday.length > 0) {
        for (const otherEvent of otherEventsToday) {
            const { data: otherAttendance } = await supabase
                .from('event_attendance')
                .select('present_user_ids')
                .eq('event_id', otherEvent.id)
                .single();

            if (otherAttendance?.present_user_ids?.includes(playerId)) {
                alreadyAttendedToday = true;
                break;
            }
        }
    }

    // Format date for display
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    // Calculate points
    let pointsToAdd = EVENT_ATTENDANCE_POINTS_BASE;
    let reason = `${eventTitle} am ${formattedDate}`;
    if (subgroupName) reason += ` - ${subgroupName}`;

    if (newStreak >= 5) {
        pointsToAdd = 6; // 3 base + 3 bonus (Super-Streak)
        reason += ` (🔥 ${newStreak}x Streak!)`;
    } else if (newStreak >= 3) {
        pointsToAdd = 5; // 3 base + 2 bonus (Streak-Bonus)
        reason += ` (⚡ ${newStreak}x Streak)`;
    }

    if (alreadyAttendedToday) {
        pointsToAdd = Math.ceil(pointsToAdd / 2);
        reason += ` (2. Veranstaltung heute)`;
    }

    // Add exercise points
    const totalPoints = pointsToAdd + exercisePoints;
    if (exercisePoints > 0) {
        reason += ` (+${exercisePoints} Übungspunkte)`;
    }

    // Update streak
    const { error: streakError } = await supabase.from('streaks').upsert({
        user_id: playerId,
        subgroup_id: primarySubgroupId || event.club_id,
        current_streak: newStreak,
        last_attendance_date: date,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'user_id,subgroup_id'
    });

    if (streakError) {
        console.warn('[Events] Error updating streak:', streakError);
    }

    // Update player points and XP
    const { error: rpcError } = await supabase.rpc('add_player_points', {
        p_user_id: playerId,
        p_points: totalPoints,
        p_xp: totalPoints
    });

    if (rpcError) {
        console.warn('[Events] Error adding points:', rpcError);
    }

    // Create points history entry
    const { error: pointsError } = await supabase.from('points_history').insert({
        user_id: playerId,
        points: totalPoints,
        xp: totalPoints,
        elo_change: 0,
        reason,
        date,
        subgroup_id: primarySubgroupId,
        created_at: new Date().toISOString(),
        awarded_by: 'System (Veranstaltung)',
    });

    if (pointsError) {
        console.warn('[Events] Error creating points history:', pointsError);
    }

    // Create XP history entry
    const { error: xpError } = await supabase.from('xp_history').insert({
        user_id: playerId,
        xp: totalPoints,
        reason,
        date,
        subgroup_id: primarySubgroupId,
        created_at: new Date().toISOString(),
        source: 'System (Veranstaltung)',
    });

    if (xpError) {
        console.warn('[Events] Error creating XP history:', xpError);
    }

    // Send notification to player
    let notificationTitle = 'Anwesenheit eingetragen';
    let notificationMessage = `Du hast +${totalPoints} Punkte für "${eventTitle}" am ${formattedDate} erhalten.`;

    if (newStreak >= 5) {
        notificationTitle = '🔥 Super-Streak!';
        notificationMessage = `${newStreak}x in Folge dabei! +${totalPoints} Punkte`;
    } else if (newStreak >= 3) {
        notificationTitle = '⚡ Streak-Bonus!';
        notificationMessage = `${newStreak}x in Folge dabei! +${totalPoints} Punkte`;
    }

    await supabase.from('notifications').insert({
        user_id: playerId,
        type: 'event_attendance',
        title: notificationTitle,
        message: notificationMessage,
        data: {
            points: totalPoints,
            streak: newStreak,
            date,
            event_id: event.id,
            event_title: eventTitle,
            subgroup_id: primarySubgroupId,
            subgroup_name: subgroupName
        }
    });

    console.log(`[Events] Awarded ${totalPoints} points to player ${playerId} (streak: ${newStreak})`);
}

/**
 * Deduct attendance points from a player when removed from event
 * @param {string} playerId - Player ID
 * @param {Object} event - Event object with details
 */
async function deductEventAttendancePoints(playerId, event) {
    const date = event.start_date;
    const eventTitle = event.title || 'Veranstaltung';
    const subgroupIds = event.target_subgroup_ids || [];
    const primarySubgroupId = subgroupIds.length > 0 ? subgroupIds[0] : null;

    // Get subgroup name if available
    let subgroupName = '';
    if (primarySubgroupId) {
        const { data: subgroup } = await supabase
            .from('subgroups')
            .select('name')
            .eq('id', primarySubgroupId)
            .single();
        subgroupName = subgroup?.name || '';
    }

    // Format date for display
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    // Deduct base points (we don't track exact amount previously given, so use base)
    const pointsToDeduct = EVENT_ATTENDANCE_POINTS_BASE;
    const reason = `Anwesenheit korrigiert: ${eventTitle} am ${formattedDate}${subgroupName ? ` - ${subgroupName}` : ''} (${pointsToDeduct} Punkte abgezogen)`;

    // Deduct player points and XP
    await supabase.rpc('deduct_player_points', {
        p_user_id: playerId,
        p_points: pointsToDeduct,
        p_xp: pointsToDeduct
    });

    // Create negative history entry
    await supabase.from('points_history').insert({
        user_id: playerId,
        points: -pointsToDeduct,
        xp: -pointsToDeduct,
        elo_change: 0,
        reason,
        date,
        subgroup_id: primarySubgroupId,
        created_at: new Date().toISOString(),
        awarded_by: 'System (Veranstaltung)',
    });

    // Create negative XP history entry
    await supabase.from('xp_history').insert({
        user_id: playerId,
        xp: -pointsToDeduct,
        reason,
        date,
        subgroup_id: primarySubgroupId,
        created_at: new Date().toISOString(),
        source: 'System (Veranstaltung)',
    });

    console.log(`[Events] Deducted ${pointsToDeduct} points from player ${playerId}`);
}

/**
 * Open exercise selector modal
 * @param {string} eventId - Event ID
 */
window.openEventExerciseSelector = async function(eventId) {
    try {
        // Load exercises if not cached
        if (allExercises.length === 0) {
            const { data: exercises, error } = await supabase
                .from('exercises')
                .select('*')
                .eq('club_id', currentUserData.clubId)
                .order('name');

            if (error) throw error;
            allExercises = exercises || [];
        }

        // Create exercise selector modal
        const existingSelector = document.getElementById('exercise-selector-modal');
        if (existingSelector) existingSelector.remove();

        const modal = document.createElement('div');
        modal.id = 'exercise-selector-modal';
        modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-[100002] p-4';

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
                <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-gray-900">Übung hinzufügen</h3>
                    <button onclick="document.getElementById('exercise-selector-modal').remove()" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>

                <div class="p-4 border-b">
                    <input type="text" id="exercise-search" placeholder="Übung suchen..."
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                           oninput="window.filterExercises(this.value)">
                </div>

                <div class="flex-1 overflow-y-auto p-4">
                    <div id="exercise-selector-list" class="space-y-2">
                        ${allExercises.length > 0 ? allExercises.map(ex => `
                            <button onclick="window.addEventExercise('${ex.id}', '${ex.name.replace(/'/g, "\\'")}', ${ex.points || 0})"
                                    class="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 transition-colors">
                                <p class="font-medium text-gray-900">${ex.name}</p>
                                <p class="text-sm text-gray-500">+${ex.points || 0} Punkte</p>
                            </button>
                        `).join('') : '<p class="text-gray-500 text-center py-4">Keine Übungen vorhanden</p>'}
                    </div>
                </div>

                <div class="p-4 border-t bg-gray-50">
                    <button onclick="window.openCreateExerciseModal()"
                            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                        + Neue Übung erstellen
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

    } catch (error) {
        console.error('[Events] Error opening exercise selector:', error);
        alert('Fehler beim Laden der Übungen');
    }
};

/**
 * Filter exercises in selector
 * @param {string} query - Search query
 */
window.filterExercises = function(query) {
    const listEl = document.getElementById('exercise-selector-list');
    if (!listEl) return;

    const filtered = allExercises.filter(ex =>
        ex.name.toLowerCase().includes(query.toLowerCase())
    );

    listEl.innerHTML = filtered.length > 0 ? filtered.map(ex => `
        <button onclick="window.addEventExercise('${ex.id}', '${ex.name.replace(/'/g, "\\'")}', ${ex.points || 0})"
                class="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-indigo-50 hover:border-indigo-300 transition-colors">
            <p class="font-medium text-gray-900">${ex.name}</p>
            <p class="text-sm text-gray-500">+${ex.points || 0} Punkte</p>
        </button>
    `).join('') : '<p class="text-gray-500 text-center py-4">Keine Übungen gefunden</p>';
};

/**
 * Add exercise to event
 * @param {string} id - Exercise ID
 * @param {string} name - Exercise name
 * @param {number} points - Exercise points
 */
window.addEventExercise = function(id, name, points) {
    eventExercises.push({ id, name, points });
    document.getElementById('exercise-selector-modal')?.remove();
    renderEventExercises();
};

/**
 * Remove exercise from event
 * @param {number} index - Index in eventExercises array
 */
window.removeEventExercise = function(index) {
    eventExercises.splice(index, 1);
    renderEventExercises();
};

/**
 * Render event exercises list
 */
function renderEventExercises() {
    const listEl = document.getElementById('event-exercises-list');
    if (!listEl) return;

    if (eventExercises.length === 0) {
        listEl.innerHTML = '<p class="text-gray-400 text-sm text-center py-2">Keine Übungen hinzugefügt</p>';
        return;
    }

    listEl.innerHTML = eventExercises.map((ex, index) => `
        <div class="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div class="flex-1">
                <p class="font-medium text-gray-900">${ex.name}</p>
                <p class="text-sm text-indigo-600">+${ex.points} Punkte</p>
            </div>
            <button onclick="window.removeEventExercise(${index})"
                    class="text-red-500 hover:text-red-700 p-1">
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');
}

/**
 * Open create exercise modal (full version like exercises tab)
 */
window.openCreateExerciseModal = function() {
    const existingModal = document.getElementById('create-exercise-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'create-exercise-modal';
    modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-[100003] p-4';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 class="text-lg font-semibold text-gray-900">Neue Übung erstellen</h3>
                <button onclick="document.getElementById('create-exercise-modal').remove()" class="text-gray-400 hover:text-gray-600">
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="p-4 overflow-y-auto flex-1 space-y-4">
                <!-- Titel -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                    <input type="text" id="new-exercise-name" placeholder="z.B. Aufschlag-Training"
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required>
                </div>

                <!-- Beschreibung -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                    <textarea id="new-exercise-description" rows="3" placeholder="Beschreibe die Übung..."
                              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"></textarea>
                </div>

                <!-- Beschreibung als Tabelle -->
                <div>
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="new-exercise-use-table" class="w-4 h-4 text-indigo-600 rounded">
                        <span class="text-sm text-gray-700">Als Tabelle eingeben</span>
                    </label>
                    <div id="new-exercise-table-container" class="hidden mt-2">
                        <div class="border rounded-lg overflow-hidden">
                            <table class="w-full text-sm" id="new-exercise-table">
                                <thead class="bg-gray-100">
                                    <tr>
                                        <th class="px-3 py-2 text-left font-medium">Spalte 1</th>
                                        <th class="px-3 py-2 text-left font-medium">Spalte 2</th>
                                        <th class="w-10"></th>
                                    </tr>
                                </thead>
                                <tbody id="new-exercise-table-body">
                                    <tr>
                                        <td class="px-1 py-1"><input type="text" class="w-full px-2 py-1 border rounded" placeholder="Wert"></td>
                                        <td class="px-1 py-1"><input type="text" class="w-full px-2 py-1 border rounded" placeholder="Wert"></td>
                                        <td class="px-1 py-1"><button type="button" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700">✕</button></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <button type="button" onclick="window.addExerciseTableRow()" class="mt-2 text-sm text-indigo-600 hover:text-indigo-800">+ Zeile hinzufügen</button>
                    </div>
                </div>

                <!-- Level -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Level *</label>
                    <select id="new-exercise-level" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required>
                        <option value="">Level wählen...</option>
                        <option value="grundlagen">🎖️ Grundlagen (Rekruten)</option>
                        <option value="standard">🥉 Standard (ab Bronze)</option>
                        <option value="fortgeschritten">🥇 Fortgeschritten (ab Gold)</option>
                    </select>
                </div>

                <!-- Schwierigkeit -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Schwierigkeit *</label>
                    <select id="new-exercise-difficulty" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" required>
                        <option value="">Schwierigkeit wählen...</option>
                        <option value="easy">⭐ Einfach</option>
                        <option value="normal">⭐⭐ Normal</option>
                        <option value="hard">⭐⭐⭐ Schwer</option>
                    </select>
                </div>

                <!-- Punkte (auto-berechnet) -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Punkte</label>
                    <input type="number" id="new-exercise-points" value="3" min="0" readonly
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed">
                    <p class="text-xs text-gray-500 mt-1">Automatisch basierend auf Level + Schwierigkeit</p>
                </div>

                <!-- Tags -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Tags</label>
                    <input type="text" id="new-exercise-tags" placeholder="z.B. Aufschlag, Beinarbeit, Koordination"
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    <p class="text-xs text-gray-500 mt-1">Kommagetrennt eingeben</p>
                </div>

                <!-- Bild -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bild (optional)</label>
                    <input type="file" id="new-exercise-image" accept="image/*"
                           class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100">
                    <p class="text-xs text-gray-500 mt-1">JPG, PNG, GIF, WebP - max. 5MB</p>
                    <div id="new-exercise-image-preview" class="mt-2 hidden">
                        <img id="new-exercise-image-preview-img" class="max-h-32 rounded-lg" src="" alt="Vorschau">
                    </div>
                </div>

                <!-- Sichtbarkeit -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Sichtbarkeit</label>
                    <div class="flex gap-2">
                        <label class="flex-1 cursor-pointer">
                            <input type="radio" name="new-exercise-visibility" value="global" checked class="sr-only peer">
                            <div class="text-center px-3 py-2 border-2 border-gray-300 rounded-lg peer-checked:border-indigo-600 peer-checked:bg-indigo-50 hover:bg-gray-50">
                                <span class="block text-lg">🌍</span>
                                <span class="text-xs font-medium">Global</span>
                            </div>
                        </label>
                        <label class="flex-1 cursor-pointer">
                            <input type="radio" name="new-exercise-visibility" value="club" class="sr-only peer">
                            <div class="text-center px-3 py-2 border-2 border-gray-300 rounded-lg peer-checked:border-indigo-600 peer-checked:bg-indigo-50 hover:bg-gray-50">
                                <span class="block text-lg">🏠</span>
                                <span class="text-xs font-medium">Nur Verein</span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>

            <div class="p-4 border-t bg-gray-50 flex gap-3">
                <button onclick="window.saveNewExerciseFull()"
                        class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg">
                    Erstellen & Hinzufügen
                </button>
                <button onclick="document.getElementById('create-exercise-modal').remove()"
                        class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2.5 rounded-lg">
                    Abbrechen
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Setup event listeners
    setupNewExerciseModalListeners();
};

/**
 * Setup listeners for the new exercise modal
 */
function setupNewExerciseModalListeners() {
    // Table toggle
    const tableCheckbox = document.getElementById('new-exercise-use-table');
    const tableContainer = document.getElementById('new-exercise-table-container');
    tableCheckbox?.addEventListener('change', () => {
        tableContainer.classList.toggle('hidden', !tableCheckbox.checked);
    });

    // Auto-calculate points based on level and difficulty
    const levelSelect = document.getElementById('new-exercise-level');
    const difficultySelect = document.getElementById('new-exercise-difficulty');
    const pointsInput = document.getElementById('new-exercise-points');

    const calculatePoints = () => {
        const levelPoints = { 'grundlagen': 1, 'standard': 2, 'fortgeschritten': 3 };
        const difficultyPoints = { 'easy': 1, 'normal': 2, 'hard': 3 };

        const level = levelSelect?.value || '';
        const difficulty = difficultySelect?.value || '';

        if (level && difficulty) {
            const points = (levelPoints[level] || 1) + (difficultyPoints[difficulty] || 1);
            if (pointsInput) pointsInput.value = points;
        }
    };

    levelSelect?.addEventListener('change', calculatePoints);
    difficultySelect?.addEventListener('change', calculatePoints);

    // Image preview
    const imageInput = document.getElementById('new-exercise-image');
    imageInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('new-exercise-image-preview');
                const img = document.getElementById('new-exercise-image-preview-img');
                if (preview && img) {
                    img.src = e.target.result;
                    preview.classList.remove('hidden');
                }
            };
            reader.readAsDataURL(file);
        }
    });
}

/**
 * Add row to exercise table
 */
window.addExerciseTableRow = function() {
    const tbody = document.getElementById('new-exercise-table-body');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="px-1 py-1"><input type="text" class="w-full px-2 py-1 border rounded" placeholder="Wert"></td>
        <td class="px-1 py-1"><input type="text" class="w-full px-2 py-1 border rounded" placeholder="Wert"></td>
        <td class="px-1 py-1"><button type="button" onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700">✕</button></td>
    `;
    tbody.appendChild(row);
};

/**
 * Save new exercise with all fields
 */
window.saveNewExerciseFull = async function() {
    const name = document.getElementById('new-exercise-name')?.value?.trim();
    const description = document.getElementById('new-exercise-description')?.value?.trim();
    const level = document.getElementById('new-exercise-level')?.value;
    const difficulty = document.getElementById('new-exercise-difficulty')?.value;
    const points = parseInt(document.getElementById('new-exercise-points')?.value) || 3;
    const tags = document.getElementById('new-exercise-tags')?.value?.trim();
    const imageFile = document.getElementById('new-exercise-image')?.files[0];
    const visibility = document.querySelector('input[name="new-exercise-visibility"]:checked')?.value || 'global';
    const useTable = document.getElementById('new-exercise-use-table')?.checked;

    // Validation
    if (!name) {
        alert('Bitte gib einen Titel ein');
        return;
    }
    if (!level) {
        alert('Bitte wähle ein Level');
        return;
    }
    if (!difficulty) {
        alert('Bitte wähle eine Schwierigkeit');
        return;
    }

    try {
        // Get table data if enabled
        let tableData = null;
        if (useTable) {
            const rows = document.querySelectorAll('#new-exercise-table-body tr');
            tableData = [];
            rows.forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 2) {
                    tableData.push([inputs[0].value, inputs[1].value]);
                }
            });
        }

        // Prepare description (either text or table JSON)
        let finalDescription = description || '';
        if (useTable && tableData && tableData.length > 0) {
            finalDescription = JSON.stringify({ type: 'table', data: tableData });
        }

        // Upload image if provided
        let imageUrl = null;
        if (imageFile) {
            const fileName = `exercises/${Date.now()}_${imageFile.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('exercise-images')
                .upload(fileName, imageFile);

            if (uploadError) {
                console.warn('[Events] Image upload failed:', uploadError);
            } else {
                const { data: urlData } = supabase.storage
                    .from('exercise-images')
                    .getPublicUrl(fileName);
                imageUrl = urlData?.publicUrl;
            }
        }

        // Parse tags
        const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

        // Save to database
        const exerciseData = {
            name,
            description: finalDescription,
            level,
            difficulty,
            points,
            tags: tagsArray,
            image_url: imageUrl,
            visibility,
            club_id: visibility === 'club' ? currentUserData.clubId : null,
            created_by: currentUserData.id,
            created_at: new Date().toISOString()
        };

        const { data: newExercise, error } = await supabase
            .from('exercises')
            .insert(exerciseData)
            .select()
            .single();

        if (error) throw error;

        // Add to cache
        allExercises.push(newExercise);

        // Add to current event
        eventExercises.push({
            id: newExercise.id,
            name: newExercise.name,
            points: newExercise.points
        });

        // Close modals
        document.getElementById('create-exercise-modal')?.remove();
        document.getElementById('exercise-selector-modal')?.remove();

        renderEventExercises();

        alert('Übung erstellt und hinzugefügt!');

    } catch (error) {
        console.error('[Events] Error creating exercise:', error);
        alert('Fehler beim Erstellen: ' + error.message);
    }
};

/**
 * Open delete event confirmation modal
 * @param {string} eventId - Event ID
 * @param {boolean} isRecurring - Whether this is a recurring event
 * @param {string} occurrenceDate - The specific occurrence date (YYYY-MM-DD) for recurring events
 */
window.openDeleteEventModal = async function(eventId, isRecurring, occurrenceDate = null) {
    // Load event details
    const { data: event, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

    if (error) {
        console.error('[Events] Error loading event:', error);
        alert('Fehler beim Laden der Veranstaltung');
        return;
    }

    const existingModal = document.getElementById('delete-event-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'delete-event-modal';
    modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-[100003] p-4';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div class="text-center mb-6">
                <div class="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                    <svg class="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                </div>
                <h3 class="text-xl font-bold text-gray-900">Veranstaltung löschen</h3>
                <p class="text-gray-500 mt-2">Möchtest du "${event.title}" wirklich löschen?</p>
            </div>

            ${isRecurring ? `
            <div class="mb-6">
                <p class="text-sm font-medium text-gray-700 mb-3">Diese Veranstaltung ist wiederkehrend:</p>
                <div class="space-y-2">
                    <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="delete-scope" value="this" checked class="w-4 h-4 text-red-600">
                        <div>
                            <p class="font-medium text-gray-900">Nur diesen Termin</p>
                            <p class="text-sm text-gray-500">Nur den ausgewählten Termin löschen</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="delete-scope" value="future" class="w-4 h-4 text-red-600">
                        <div>
                            <p class="font-medium text-gray-900">Diesen und alle zukünftigen</p>
                            <p class="text-sm text-gray-500">Ab diesem Datum löschen</p>
                        </div>
                    </label>
                    <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                        <input type="radio" name="delete-scope" value="all" class="w-4 h-4 text-red-600">
                        <div>
                            <p class="font-medium text-gray-900">Alle Termine</p>
                            <p class="text-sm text-gray-500">Die gesamte Veranstaltungsserie löschen</p>
                        </div>
                    </label>
                </div>
            </div>
            ` : ''}

            <div class="mb-6">
                <label class="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                    <input type="checkbox" id="delete-notify-participants" checked class="w-4 h-4 text-blue-600 rounded">
                    <div>
                        <p class="font-medium text-blue-900">Teilnehmer benachrichtigen</p>
                        <p class="text-sm text-blue-700">Eingeladene werden über die Absage informiert</p>
                    </div>
                </label>
            </div>

            <div class="flex gap-3">
                <button onclick="document.getElementById('delete-event-modal').remove()"
                        class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                    Abbrechen
                </button>
                <button onclick="window.executeDeleteEvent('${eventId}', ${isRecurring}, '${occurrenceDate || ''}')"
                        class="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-medium">
                    Löschen
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
};

/**
 * Execute event deletion
 * @param {string} eventId - Event ID
 * @param {boolean} isRecurring - Whether this is a recurring event
 * @param {string} occurrenceDate - The specific occurrence date (YYYY-MM-DD) for recurring events
 */
window.executeDeleteEvent = async function(eventId, isRecurring, occurrenceDate = '') {
    try {
        const deleteScope = isRecurring
            ? document.querySelector('input[name="delete-scope"]:checked')?.value || 'this'
            : 'this';
        const notifyParticipants = document.getElementById('delete-notify-participants')?.checked ?? true;

        // Load event details for notification
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        // Use occurrence date if provided, otherwise fall back to start_date
        const targetDate = occurrenceDate || event.start_date;

        // Get all participants to notify
        let participantsToNotify = [];
        if (notifyParticipants) {
            const { data: invitations } = await supabase
                .from('event_invitations')
                .select('user_id')
                .eq('event_id', eventId);
            participantsToNotify = (invitations || []).map(i => i.user_id);
        }

        // Format date for notification
        const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });

        if (deleteScope === 'this') {
            // Delete only this event instance
            // For recurring events, we add this date to an exclusions list
            if (isRecurring && event.repeat_type) {
                // Add exclusion date - use the specific occurrence date, not the original start_date
                const exclusions = event.excluded_dates || [];
                exclusions.push(targetDate);

                await supabase
                    .from('events')
                    .update({ excluded_dates: exclusions })
                    .eq('id', eventId);
            } else {
                // Delete the event completely
                await supabase.from('event_invitations').delete().eq('event_id', eventId);
                await supabase.from('event_attendance').delete().eq('event_id', eventId);
                await supabase.from('events').delete().eq('id', eventId);
            }
        } else if (deleteScope === 'future') {
            // Set repeat_end_date to before this date
            const previousDay = new Date(targetDate);
            previousDay.setDate(previousDay.getDate() - 1);
            const newEndDate = previousDay.toISOString().split('T')[0];

            await supabase
                .from('events')
                .update({ repeat_end_date: newEndDate })
                .eq('id', eventId);
        } else if (deleteScope === 'all') {
            // Delete the entire event series
            await supabase.from('event_invitations').delete().eq('event_id', eventId);
            await supabase.from('event_attendance').delete().eq('event_id', eventId);
            await supabase.from('events').delete().eq('id', eventId);
        }

        // Send notifications
        if (notifyParticipants && participantsToNotify.length > 0) {
            const scopeText = deleteScope === 'all' ? ' (alle Termine)'
                : deleteScope === 'future' ? ' (ab diesem Datum)'
                : '';

            const notifications = participantsToNotify.map(userId => ({
                user_id: userId,
                type: 'event_cancelled',
                title: 'Veranstaltung abgesagt',
                message: `"${event.title}" am ${formattedDate} wurde abgesagt${scopeText}`,
                data: {
                    event_id: eventId,
                    event_title: event.title,
                    event_date: event.start_date,
                    delete_scope: deleteScope
                },
                is_read: false,
                created_at: new Date().toISOString()
            }));

            await supabase.from('notifications').insert(notifications);
        }

        // Close all related modals
        document.getElementById('delete-event-modal')?.remove();
        document.getElementById('event-details-modal')?.remove();
        document.getElementById('event-day-modal')?.classList.add('hidden');

        // Show success message (non-blocking toast)
        const message = 'Veranstaltung wurde gelöscht' + (notifyParticipants ? ' und Teilnehmer benachrichtigt' : '');
        showToastMessage(message, 'success');

        // Trigger calendar refresh by dispatching custom event with occurrence date
        window.dispatchEvent(new CustomEvent('event-changed', {
            detail: {
                type: 'delete',
                eventId,
                occurrenceDate: targetDate,
                deleteScope
            }
        }));

    } catch (error) {
        console.error('[Events] Error deleting event:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
};

/**
 * Open edit event modal
 * @param {string} eventId - Event ID
 */
window.openEditEventModal = async function(eventId) {
    try {
        // Load event details
        const { data: event, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error) throw error;

        const isRecurring = !!event.repeat_type;

        const existingModal = document.getElementById('edit-event-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'edit-event-modal';
        modal.className = 'fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-[100003] p-4';

        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
                <!-- Header -->
                <div class="p-6 border-b border-gray-200">
                    <div class="flex justify-between items-center">
                        <h2 class="text-xl font-bold text-gray-900">Veranstaltung bearbeiten</h2>
                        <button onclick="document.getElementById('edit-event-modal').remove()" class="text-gray-400 hover:text-gray-600">
                            <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Form -->
                <div class="p-6 overflow-y-auto flex-1 space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
                        <input type="text" id="edit-event-title" value="${event.title || ''}"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                        <textarea id="edit-event-description" rows="2"
                                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">${event.description || ''}</textarea>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Datum</label>
                            <input type="date" id="edit-event-date" value="${event.start_date || ''}"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Treffzeit</label>
                            <input type="time" id="edit-event-meeting-time" value="${event.meeting_time || ''}"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Startzeit</label>
                            <input type="time" id="edit-event-start-time" value="${event.start_time || ''}"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Endzeit</label>
                            <input type="time" id="edit-event-end-time" value="${event.end_time || ''}"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Ort</label>
                        <input type="text" id="edit-event-location" value="${event.location || ''}"
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>

                    ${isRecurring ? `
                    <div class="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <p class="text-sm font-medium text-indigo-800 mb-3">Wiederkehrende Veranstaltung</p>
                        <div class="space-y-2">
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input type="radio" name="edit-scope" value="this" checked class="w-4 h-4 text-indigo-600">
                                <span class="text-sm text-gray-700">Nur diesen Termin ändern</span>
                            </label>
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input type="radio" name="edit-scope" value="future" class="w-4 h-4 text-indigo-600">
                                <span class="text-sm text-gray-700">Diesen und alle zukünftigen Termine</span>
                            </label>
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input type="radio" name="edit-scope" value="all" class="w-4 h-4 text-indigo-600">
                                <span class="text-sm text-gray-700">Alle Termine der Serie</span>
                            </label>
                        </div>
                    </div>
                    ` : ''}

                    <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" id="edit-notify-participants" checked class="w-4 h-4 text-blue-600 rounded">
                            <div>
                                <p class="font-medium text-blue-900">Teilnehmer benachrichtigen</p>
                                <p class="text-sm text-blue-700">Über die Änderungen informieren</p>
                            </div>
                        </label>
                    </div>
                </div>

                <!-- Footer -->
                <div class="p-6 border-t border-gray-200">
                    <div class="flex gap-3">
                        <button onclick="document.getElementById('edit-event-modal').remove()"
                                class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                            Abbrechen
                        </button>
                        <button onclick="window.executeEditEvent('${eventId}', ${isRecurring})"
                                class="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium">
                            Speichern
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

    } catch (error) {
        console.error('[Events] Error loading event for edit:', error);
        alert('Fehler beim Laden der Veranstaltung');
    }
};

/**
 * Execute event edit/update
 * @param {string} eventId - Event ID
 * @param {boolean} isRecurring - Whether this is a recurring event
 */
window.executeEditEvent = async function(eventId, isRecurring) {
    try {
        const editScope = isRecurring
            ? document.querySelector('input[name="edit-scope"]:checked')?.value || 'this'
            : 'all';
        const notifyParticipants = document.getElementById('edit-notify-participants')?.checked ?? true;

        // Gather form data
        const title = document.getElementById('edit-event-title')?.value?.trim();
        const description = document.getElementById('edit-event-description')?.value?.trim();
        const startDate = document.getElementById('edit-event-date')?.value;
        const meetingTime = document.getElementById('edit-event-meeting-time')?.value;
        const startTime = document.getElementById('edit-event-start-time')?.value;
        const endTime = document.getElementById('edit-event-end-time')?.value;
        const location = document.getElementById('edit-event-location')?.value?.trim();

        if (!title) {
            alert('Bitte gib einen Titel ein');
            return;
        }

        // Load original event
        const { data: originalEvent, error: loadError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (loadError) throw loadError;

        // Get participants to notify
        let participantsToNotify = [];
        if (notifyParticipants) {
            const { data: invitations } = await supabase
                .from('event_invitations')
                .select('user_id')
                .eq('event_id', eventId);
            participantsToNotify = (invitations || []).map(i => i.user_id);
        }

        // Build update data
        const updateData = {
            title,
            description: description || null,
            meeting_time: meetingTime || null,
            start_time: startTime || null,
            end_time: endTime || null,
            location: location || null,
            updated_at: new Date().toISOString()
        };

        // Handle date changes based on scope
        if (startDate && startDate !== originalEvent.start_date) {
            if (editScope === 'this' && isRecurring) {
                // For single instance change of recurring event, we need to:
                // 1. Add original date to exclusions
                // 2. Create a new single event for the new date
                const exclusions = originalEvent.excluded_dates || [];
                exclusions.push(originalEvent.start_date);

                await supabase
                    .from('events')
                    .update({ excluded_dates: exclusions })
                    .eq('id', eventId);

                // Create new single event
                const newEventData = {
                    ...originalEvent,
                    id: undefined,
                    start_date: startDate,
                    repeat_type: null,
                    repeat_end_date: null,
                    excluded_dates: null,
                    ...updateData
                };
                delete newEventData.id;

                const { data: newEvent, error: createError } = await supabase
                    .from('events')
                    .insert(newEventData)
                    .select()
                    .single();

                if (createError) throw createError;

                // Copy invitations to new event
                const { data: oldInvitations } = await supabase
                    .from('event_invitations')
                    .select('*')
                    .eq('event_id', eventId);

                if (oldInvitations && oldInvitations.length > 0) {
                    const newInvitations = oldInvitations.map(inv => ({
                        ...inv,
                        id: undefined,
                        event_id: newEvent.id
                    }));
                    newInvitations.forEach(inv => delete inv.id);

                    await supabase.from('event_invitations').insert(newInvitations);
                }

            } else {
                updateData.start_date = startDate;
            }
        }

        // Update the event (for 'all' or 'future' scope, or non-recurring)
        if (editScope !== 'this' || !isRecurring || !startDate || startDate === originalEvent.start_date) {
            if (editScope === 'future' && isRecurring) {
                // For future: update this event and set previous date as end date for a copy
                // This is complex - for simplicity we just update all
                updateData.start_date = startDate || originalEvent.start_date;
            }

            await supabase
                .from('events')
                .update(updateData)
                .eq('id', eventId);
        }

        // Format date for notification
        const formattedDate = new Date((startDate || originalEvent.start_date) + 'T12:00:00').toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });

        // Send notifications
        if (notifyParticipants && participantsToNotify.length > 0) {
            // Build change description
            const changes = [];
            if (title !== originalEvent.title) changes.push(`Titel: "${title}"`);
            if (startDate && startDate !== originalEvent.start_date) changes.push(`Neues Datum: ${formattedDate}`);
            if (startTime !== originalEvent.start_time) changes.push(`Neue Startzeit: ${startTime || '-'}`);
            if (location !== originalEvent.location) changes.push(`Neuer Ort: ${location || '-'}`);

            const changeText = changes.length > 0 ? changes.join(', ') : 'Details aktualisiert';

            const notifications = participantsToNotify.map(userId => ({
                user_id: userId,
                type: 'event_updated',
                title: 'Veranstaltung geändert',
                message: `"${title}" am ${formattedDate} wurde geändert: ${changeText}`,
                data: {
                    event_id: eventId,
                    event_title: title,
                    event_date: startDate || originalEvent.start_date,
                    changes: changes
                },
                is_read: false,
                created_at: new Date().toISOString()
            }));

            await supabase.from('notifications').insert(notifications);
        }

        // Close modals and refresh
        document.getElementById('edit-event-modal')?.remove();
        document.getElementById('event-details-modal')?.remove();

        alert('Veranstaltung wurde aktualisiert' + (notifyParticipants ? ' und Teilnehmer benachrichtigt' : ''));

        // Trigger calendar refresh
        window.dispatchEvent(new CustomEvent('event-changed', { detail: { type: 'update', eventId } }));

    } catch (error) {
        console.error('[Events] Error updating event:', error);
        alert('Fehler beim Speichern: ' + error.message);
    }
};

/**
 * Load and render upcoming events with response status for coaches
 * @param {string} containerId - Container element ID to render into
 * @param {Object} userData - Current user data
 */
export async function loadUpcomingEventsForCoach(containerId, userData) {
    const container = document.getElementById(containerId);
    if (!container || !userData?.clubId) return;

    try {
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 14);
        const endDate = nextWeek.toISOString().split('T')[0];

        // Load upcoming events
        const { data: events, error } = await supabase
            .from('events')
            .select('*')
            .eq('club_id', userData.clubId)
            .gte('start_date', today)
            .lte('start_date', endDate)
            .eq('cancelled', false)
            .order('start_date', { ascending: true })
            .limit(5);

        if (error) throw error;

        if (!events || events.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-md p-6">
                    <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        Anstehende Veranstaltungen
                    </h3>
                    <p class="text-gray-500 text-center py-4">Keine anstehenden Veranstaltungen in den nächsten 2 Wochen</p>
                </div>
            `;
            return;
        }

        // Load response counts for each event
        const eventIds = events.map(e => e.id);
        const { data: allInvitations } = await supabase
            .from('event_invitations')
            .select('event_id, status, user_id, profiles:user_id(first_name, last_name)')
            .in('event_id', eventIds);

        // Group invitations by event
        const invitationsByEvent = {};
        (allInvitations || []).forEach(inv => {
            if (!invitationsByEvent[inv.event_id]) {
                invitationsByEvent[inv.event_id] = { accepted: [], rejected: [], pending: [] };
            }
            const statusGroup = inv.status === 'accepted' ? 'accepted'
                : (inv.status === 'rejected' || inv.status === 'declined') ? 'rejected'
                : 'pending';
            invitationsByEvent[inv.event_id][statusGroup].push(inv);
        });

        // Render events
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md p-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    Anstehende Veranstaltungen
                </h3>
                <div class="space-y-4">
                    ${events.map(event => {
                        const responses = invitationsByEvent[event.id] || { accepted: [], rejected: [], pending: [] };
                        const dateObj = new Date(event.start_date + 'T12:00:00');
                        const formattedDate = dateObj.toLocaleDateString('de-DE', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short'
                        });
                        const isToday = event.start_date === today;

                        return `
                            <div class="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer" onclick="window.openEventDetails('${event.id}', '${event.start_date}')">
                                <div class="flex items-start justify-between">
                                    <div class="flex-1">
                                        <div class="flex items-center gap-2">
                                            <h4 class="font-semibold text-gray-900">${event.title}</h4>
                                            ${isToday ? '<span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">Heute</span>' : ''}
                                            ${event.repeat_type ? '<span class="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">Wiederkehrend</span>' : ''}
                                        </div>
                                        <p class="text-sm text-gray-500 mt-1">
                                            ${formattedDate}${event.start_time ? ` um ${event.start_time.slice(0, 5)} Uhr` : ''}
                                        </p>
                                    </div>
                                </div>

                                <!-- Response Summary -->
                                <div class="flex gap-4 mt-3 text-sm">
                                    <div class="flex items-center gap-1 text-green-600">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                                        </svg>
                                        <span class="font-medium">${responses.accepted.length}</span>
                                        <span class="text-gray-500">Zusagen</span>
                                    </div>
                                    <div class="flex items-center gap-1 text-red-600">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                        <span class="font-medium">${responses.rejected.length}</span>
                                        <span class="text-gray-500">Absagen</span>
                                    </div>
                                    <div class="flex items-center gap-1 text-gray-500">
                                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                        </svg>
                                        <span class="font-medium">${responses.pending.length}</span>
                                        <span class="text-gray-500">Ausstehend</span>
                                    </div>
                                </div>

                                <!-- Accepted Names (collapsed by default, expandable) -->
                                ${responses.accepted.length > 0 ? `
                                <div class="mt-3 pt-3 border-t">
                                    <button class="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')">
                                        <svg class="w-3 h-3 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                        </svg>
                                        Zusagen anzeigen
                                    </button>
                                    <div class="hidden mt-2 flex flex-wrap gap-1">
                                        ${responses.accepted.map(inv => `
                                            <span class="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                                                ${inv.profiles?.first_name || ''} ${inv.profiles?.last_name || ''}
                                            </span>
                                        `).join('')}
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Set up real-time subscription for responses
        const invitationsChannel = supabase
            .channel('coach_event_responses')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'event_invitations'
                },
                () => {
                    // Reload when any invitation changes
                    loadUpcomingEventsForCoach(containerId, userData);
                }
            )
            .subscribe();

        // Set up real-time subscription for events changes (including deletions)
        const eventsChannel = supabase
            .channel('coach_events_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'events',
                    filter: `club_id=eq.${userData.clubId}`
                },
                () => {
                    // Reload when any event changes (including excluded_dates updates)
                    loadUpcomingEventsForCoach(containerId, userData);
                }
            )
            .subscribe();

        // Store unsubscribe
        if (!window.coachEventUnsubscribes) window.coachEventUnsubscribes = [];
        window.coachEventUnsubscribes.push(() => supabase.removeChannel(invitationsChannel));
        window.coachEventUnsubscribes.push(() => supabase.removeChannel(eventsChannel));

    } catch (error) {
        console.error('[Events] Error loading upcoming events for coach:', error);
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md p-6">
                <p class="text-red-500">Fehler beim Laden der Veranstaltungen</p>
            </div>
        `;
    }
}

// Export functions for global access
export { closeAllModals };
