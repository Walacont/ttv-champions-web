/**
 * Events Modul - Verwaltung von Veranstaltungen für Trainer
 */

import { getSupabase } from './supabase-init.js';
import { createTrainingSummariesForAttendees, addPointsToTrainingSummary } from './training-summary-supabase.js';
import { uploadToR2 } from './r2-storage.js';
import { compressImage } from './image-compressor.js';

const supabase = getSupabase();

let currentEventData = {
    selectedDate: null,
    eventType: 'single',
    targetType: 'club',
    selectedSubgroups: [],
    selectedMembers: [],
    formData: {}
};

let clubSubgroups = [];
let clubMembers = [];
let currentUserData = null;

// Übungen werden zur Punkteberechnung bei Anwesenheit verwendet
let eventExercises = [];
let allExercises = [];

// Flag um Doppel-Submits zu verhindern
let isSubmittingAttendance = false;

const EVENT_ATTENDANCE_POINTS_BASE = 3;

/**
 * Prüft ob ein Spieler zu einem Event eingeladen war
 * @param {Array} playerSubgroups - Untergruppen des Spielers
 * @param {Object} event - Event mit target_type und target_subgroup_ids
 * @returns {boolean} true wenn eingeladen
 */
function isPlayerInvitedToEvent(playerSubgroups, event) {
    // Wenn target_type 'all' oder nicht gesetzt → alle eingeladen
    if (!event.target_type || event.target_type === 'all' || event.target_type === 'club') {
        return true;
    }

    // Wenn target_type 'subgroups' → prüfe ob Spieler in einer der Ziel-Untergruppen ist
    if (event.target_type === 'subgroups') {
        const targetSubgroups = event.target_subgroup_ids || [];
        if (targetSubgroups.length === 0) return true;

        return playerSubgroups.some(sg => targetSubgroups.includes(sg));
    }

    return true;
}

/**
 * Toast-Benachrichtigung anzeigen
 * @param {string} message - Nachricht
 * @param {string} type - 'success', 'error' oder 'info'
 */
function showToastMessage(message, type = 'info') {
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

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Generiert zukünftige Termine für wiederkehrende Veranstaltungen
 * @param {string} startDate - Startdatum (YYYY-MM-DD)
 * @param {string} repeatType - 'daily', 'weekly', 'biweekly', 'monthly'
 * @param {string|null} repeatEndDate - Enddatum
 * @param {Array} excludedDates - Ausgeschlossene Termine
 * @param {number|null} leadTimeValue - Vorlaufzeit-Wert
 * @param {string|null} leadTimeUnit - 'hours', 'days', 'weeks'
 * @param {number} weeksAhead - Wochen im Voraus
 * @returns {Array} Datums-Array (YYYY-MM-DD)
 */
function generateUpcomingOccurrences(startDate, repeatType, repeatEndDate, excludedDates = [], leadTimeValue = null, leadTimeUnit = null, weeksAhead = 4) {
    const occurrences = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventStart = new Date(startDate + 'T12:00:00');
    const endDate = repeatEndDate ? new Date(repeatEndDate + 'T12:00:00') : null;

    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + (weeksAhead * 7));

    // Vorlaufzeit wird berücksichtigt, damit Einladungen rechtzeitig erstellt werden
    let windowStart = new Date(today);

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

        // Use local date to avoid timezone issues
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

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
 * Prüft und erstellt fehlende Einladungen für wiederkehrende Veranstaltungen
 * @param {string} eventId - Event ID
 * @param {Object} event - Event-Daten
 * @param {Array} existingInvitations - Bestehende Einladungen
 * @returns {Array} Neu erstellte Einladungen
 */
async function ensureRecurringInvitations(eventId, event, existingInvitations) {
    if (!event.repeat_type || event.event_type !== 'recurring') return [];

    // Use local date to avoid timezone issues (toISOString uses UTC)
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const userIds = [...new Set(existingInvitations.map(inv => inv.user_id))];
    if (userIds.length === 0) return [];

    const existingDates = new Set(existingInvitations.map(inv => inv.occurrence_date));

    const upcomingOccurrences = generateUpcomingOccurrences(
        event.start_date,
        event.repeat_type,
        event.repeat_end_date,
        event.excluded_dates || [],
        event.invitation_lead_time_value,
        event.invitation_lead_time_unit,
        4
    );

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
 * Initialisiert das Events-Modul
 * @param {Object} userData - Aktuelle Benutzerdaten
 */
export function initEventsModule(userData) {
    currentUserData = userData;
    setupEventListeners();
    console.log('[Events] Module initialized');
}

/**
 * Richtet Event-Listener für die Modals ein
 */
function setupEventListeners() {
    document.getElementById('close-event-day-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('add-event-btn')?.addEventListener('click', openEventTypeModal);

    document.getElementById('close-event-type-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('back-event-type-modal')?.addEventListener('click', () => showModal('event-day-modal'));
    document.getElementById('select-single-event')?.addEventListener('click', () => selectEventType('single'));
    document.getElementById('select-recurring-event')?.addEventListener('click', () => selectEventType('recurring'));

    document.getElementById('close-event-target-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('back-event-target-modal')?.addEventListener('click', () => showModal('event-type-modal'));
    document.getElementById('select-whole-club')?.addEventListener('click', () => selectTargetType('club'));
    document.getElementById('select-subgroups')?.addEventListener('click', () => selectTargetType('subgroups'));

    document.getElementById('close-event-subgroup-modal')?.addEventListener('click', closeAllModals);
    document.getElementById('back-event-subgroup-modal')?.addEventListener('click', () => showModal('event-target-modal'));
    document.getElementById('confirm-subgroups-btn')?.addEventListener('click', confirmSubgroups);

    document.getElementById('back-event-members-modal')?.addEventListener('click', goBackFromMembers);
    document.getElementById('event-members-next-btn')?.addEventListener('click', openEventFormModal);
    document.getElementById('event-select-all-members')?.addEventListener('click', toggleSelectAllMembers);
    document.getElementById('event-select-all-guardians')?.addEventListener('click', toggleSelectAllGuardians);

    document.getElementById('back-event-form-modal')?.addEventListener('click', () => showModal('event-members-modal'));
    document.getElementById('event-form-submit-btn')?.addEventListener('click', submitEvent);

    document.getElementById('event-send-invitation')?.addEventListener('change', (e) => {
        const scheduledDiv = document.getElementById('event-scheduled-send');
        const leadTimeDiv = document.getElementById('event-lead-time-send');

        scheduledDiv?.classList.add('hidden');
        leadTimeDiv?.classList.add('hidden');

        if (e.target.value === 'scheduled') {
            scheduledDiv?.classList.remove('hidden');
        } else if (e.target.value === 'lead_time') {
            leadTimeDiv?.classList.remove('hidden');
        }
    });

    // === NEW: Event type change → show/hide points toggle ===
    document.getElementById('event-type')?.addEventListener('change', handleEventTypeChange);

    // === NEW: More Settings toggle (collapsible) ===
    document.getElementById('event-more-settings-toggle')?.addEventListener('click', () => {
        const content = document.getElementById('event-more-settings-content');
        const chevron = document.getElementById('event-more-settings-chevron');
        if (content && chevron) {
            content.classList.toggle('hidden');
            chevron.classList.toggle('rotate-180');
        }
    });

    // === NEW: Organizer row click → toggle dropdown ===
    document.getElementById('event-organizer-row')?.addEventListener('click', toggleOrganizerDropdown);

    // === NEW: Attachment row click → toggle section ===
    document.getElementById('event-attachment-row')?.addEventListener('click', () => {
        document.getElementById('event-attachment-section')?.classList.toggle('hidden');
    });

    // === NEW: Attachment buttons ===
    document.getElementById('event-attach-photo-btn')?.addEventListener('click', () => {
        document.getElementById('event-attachment-photo-input')?.click();
    });
    document.getElementById('event-attach-camera-btn')?.addEventListener('click', () => {
        document.getElementById('event-attachment-camera-input')?.click();
    });
    document.getElementById('event-attach-pdf-btn')?.addEventListener('click', () => {
        document.getElementById('event-attachment-pdf-input')?.click();
    });
    document.getElementById('event-attachment-photo-input')?.addEventListener('change', handleAttachmentUpload);
    document.getElementById('event-attachment-camera-input')?.addEventListener('change', handleAttachmentUpload);
    document.getElementById('event-attachment-pdf-input')?.addEventListener('change', handleAttachmentUpload);

    // === NEW: Auto reminder button ===
    document.getElementById('event-auto-reminder-btn')?.addEventListener('click', handleAutoReminderClick);

    // === NEW: Default participation status change ===
    document.getElementById('event-default-status')?.addEventListener('change', (e) => {
        const hint = document.getElementById('event-default-status-hint');
        if (hint) {
            if (e.target.value === 'accepted') {
                hint.textContent = 'Empfänger werden standardmäßig als teilnehmend gekennzeichnet. Sie müssen nur dann antworten, wenn sie nicht teilnehmen können.';
            } else {
                hint.textContent = 'Empfänger werden standardmäßig als unbeantwortet eingetragen. Sie müssen ihre Teilnahme bestätigen oder ablehnen.';
            }
        }
        updateReminderAvailability();
    });
}

// === NEW: Pending event attachments (files to upload on submit) ===
let pendingAttachments = [];

/**
 * Handle event type change - show/hide points toggle
 */
function handleEventTypeChange(e) {
    const type = e?.target?.value || document.getElementById('event-type')?.value;
    const pointsToggle = document.getElementById('event-points-toggle');
    const pointsInfo = document.getElementById('event-points-info');

    if (pointsToggle && pointsInfo) {
        if (type === 'training') {
            pointsToggle.classList.add('hidden');
            pointsInfo.classList.remove('hidden');
            pointsInfo.innerHTML = `
                <div class="flex items-center gap-2 text-sm text-green-600">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span>Training: Punkte werden automatisch vergeben</span>
                </div>`;
        } else if (type === 'competition') {
            pointsToggle.classList.remove('hidden');
            pointsInfo.classList.add('hidden');
        } else {
            pointsToggle.classList.add('hidden');
            pointsInfo.classList.add('hidden');
        }
    }
}

/**
 * Toggle organizer dropdown and load coaches
 */
async function toggleOrganizerDropdown() {
    const dropdown = document.getElementById('event-organizer-dropdown');
    if (!dropdown) return;

    dropdown.classList.toggle('hidden');

    if (!dropdown.classList.contains('hidden')) {
        await loadOrganizers();
    }
}

/**
 * Load coaches/head_coaches for organizer selection
 */
async function loadOrganizers() {
    const listEl = document.getElementById('event-organizer-list');
    if (!listEl || !currentUserData?.clubId) return;

    listEl.innerHTML = '<div class="text-sm text-gray-400 text-center py-2">Laden...</div>';

    const { data: coaches, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url, role')
        .eq('club_id', currentUserData.clubId)
        .in('role', ['coach', 'head_coach'])
        .order('first_name');

    if (error || !coaches) {
        listEl.innerHTML = '<div class="text-sm text-red-500 text-center py-2">Fehler beim Laden</div>';
        return;
    }

    // Initialize selected organizers with current user
    if (!currentEventData.selectedOrganizers) {
        currentEventData.selectedOrganizers = [currentUserData.id];
    }

    listEl.innerHTML = coaches.map(coach => {
        const isSelected = currentEventData.selectedOrganizers.includes(coach.id);
        const isCreator = coach.id === currentUserData.id;
        const name = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Unbekannt';
        const initials = `${(coach.first_name || '?')[0]}${(coach.last_name || '?')[0]}`.toUpperCase();
        const roleLabel = coach.role === 'head_coach' ? 'Cheftrainer' : 'Trainer';

        return `
            <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 cursor-pointer transition ${isCreator ? 'bg-indigo-50' : ''}">
                ${coach.avatar_url
                    ? `<img src="${coach.avatar_url}" class="w-8 h-8 rounded-full object-cover" onerror="this.outerHTML='<div class=\\'w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600\\'>${initials}</div>'">`
                    : `<div class="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600">${initials}</div>`
                }
                <div class="flex-1 min-w-0">
                    <span class="text-sm font-medium text-gray-900">${name}</span>
                    <span class="text-xs text-gray-500 ml-1">${roleLabel}</span>
                    ${isCreator ? '<span class="text-xs text-indigo-600 ml-1">(Du)</span>' : ''}
                </div>
                <input type="checkbox" value="${coach.id}"
                    class="event-organizer-checkbox w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    ${isSelected ? 'checked' : ''}
                    ${isCreator ? 'checked disabled' : ''}
                    onchange="window._updateOrganizerSelection()">
            </label>
        `;
    }).join('');

    // Global function for checkbox changes
    window._updateOrganizerSelection = function() {
        const checkboxes = document.querySelectorAll('.event-organizer-checkbox:checked');
        currentEventData.selectedOrganizers = Array.from(checkboxes).map(cb => cb.value);

        // Always include creator
        if (!currentEventData.selectedOrganizers.includes(currentUserData.id)) {
            currentEventData.selectedOrganizers.push(currentUserData.id);
        }

        // Update display text
        const display = document.getElementById('event-organizer-display');
        if (display) {
            const count = currentEventData.selectedOrganizers.length;
            display.textContent = count === 1 ? 'Du' : `${count} Veranstalter`;
        }
    };
}

/**
 * Handle attachment file selection
 */
function handleAttachmentUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach(file => {
        const type = file.type.startsWith('image/') ? 'image' : 'pdf';
        pendingAttachments.push({ file, type, name: file.name });
    });

    renderAttachmentPreviews();
    e.target.value = ''; // Reset input
}

/**
 * Render attachment previews
 */
function renderAttachmentPreviews() {
    const container = document.getElementById('event-attachment-preview');
    const countEl = document.getElementById('event-attachment-count');
    if (!container) return;

    if (countEl) {
        countEl.textContent = pendingAttachments.length > 0 ? `${pendingAttachments.length} Datei(en)` : '';
    }

    container.innerHTML = pendingAttachments.map((att, index) => `
        <div class="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
            ${att.type === 'image'
                ? `<i class="fas fa-image text-indigo-500"></i>`
                : `<i class="fas fa-file-pdf text-red-500"></i>`
            }
            <span class="flex-1 text-sm text-gray-700 truncate">${att.name}</span>
            <button type="button" onclick="window._removeAttachment(${index})" class="text-gray-400 hover:text-red-500 transition">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');

    window._removeAttachment = function(index) {
        pendingAttachments.splice(index, 1);
        renderAttachmentPreviews();
    };
}

/**
 * Upload pending attachments to R2 storage
 */
async function uploadEventAttachments(eventId) {
    if (pendingAttachments.length === 0) return [];

    const uploaded = [];
    for (const att of pendingAttachments) {
        try {
            const path = `events/${eventId}/${Date.now()}_${att.name}`;
            const url = await uploadToR2(att.file, path);
            if (url) {
                uploaded.push({
                    url,
                    filename: att.name,
                    type: att.type,
                    uploaded_at: new Date().toISOString(),
                    uploaded_by: currentUserData.id
                });
            }
        } catch (err) {
            console.warn('[Events] Failed to upload attachment:', att.name, err);
        }
    }
    return uploaded;
}

/**
 * Handle auto reminder button click
 */
function handleAutoReminderClick() {
    const btn = document.getElementById('event-auto-reminder-btn');
    if (!btn) return;

    // Check if reminder can be enabled
    if (!canEnableReminder()) {
        // Show info popup
        const info = document.getElementById('event-reminder-info');
        if (info) {
            info.classList.toggle('hidden');
        }
        return;
    }

    // Cycle through options: disabled → after_48h → before_48h → disabled
    const currentValue = btn.dataset.value || 'disabled';
    let newValue;
    switch (currentValue) {
        case 'disabled': newValue = 'after_48h'; break;
        case 'after_48h': newValue = 'before_48h'; break;
        case 'before_48h': newValue = 'disabled'; break;
        default: newValue = 'disabled';
    }

    btn.dataset.value = newValue;
    const labels = {
        'disabled': 'Deaktiviert',
        'after_48h': 'Nach 48 Stunden',
        'before_48h': '48h vor Beginn'
    };
    btn.textContent = labels[newValue] || 'Deaktiviert';
    btn.classList.toggle('text-indigo-600', newValue !== 'disabled');
    btn.classList.toggle('text-gray-500', newValue === 'disabled');
}

/**
 * Check if reminder can be enabled
 */
function canEnableReminder() {
    const defaultStatus = document.getElementById('event-default-status')?.value;

    // Cannot enable if everyone is auto-accepted
    if (defaultStatus === 'accepted') return false;

    // Check time window
    const startDate = document.getElementById('event-start-date')?.value;
    const startTime = document.getElementById('event-start-time')?.value;
    const sendInvitation = document.getElementById('event-send-invitation')?.value;

    if (startDate && startTime) {
        const eventStart = new Date(`${startDate}T${startTime}`);
        const now = new Date();
        const hoursUntilEvent = (eventStart - now) / (1000 * 60 * 60);

        // If less than 48h until event, reminder doesn't make sense
        if (hoursUntilEvent < 48) return false;
    }

    return true;
}

/**
 * Update reminder availability based on current form state
 */
function updateReminderAvailability() {
    const btn = document.getElementById('event-auto-reminder-btn');
    if (!btn) return;

    if (!canEnableReminder()) {
        btn.dataset.value = 'disabled';
        btn.textContent = 'Deaktiviert';
        btn.classList.remove('text-indigo-600');
        btn.classList.add('text-gray-500');
    }
}

/**
 * Check for duplicate events at the same date/time
 */
async function checkDuplicateEvent(startDate, startTime, eventCategory) {
    if (!currentUserData?.clubId || !startDate || !startTime) return false;

    const { data: existing } = await supabase
        .from('events')
        .select('id, title, event_category')
        .eq('club_id', currentUserData.clubId)
        .eq('start_date', startDate)
        .eq('start_time', startTime)
        .is('cancelled', null)
        .limit(1);

    if (existing && existing.length > 0) {
        return existing[0];
    }
    return null;
}

/**
 * Öffnet das Tag-Modal beim Klick auf einen Kalendertag
 * @param {string} dateString - Datum (YYYY-MM-DD)
 * @param {Array} eventsOnDay - Events an diesem Tag
 */
export function openEventDayModal(dateString, eventsOnDay = []) {
    currentEventData.selectedDate = dateString;

    const [year, month, day] = dateString.split('-');
    const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    document.getElementById('event-day-modal-date').textContent = formattedDate;

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

function openEventTypeModal() {
    showModal('event-type-modal');
}

/**
 * Wählt Event-Typ und fährt fort
 * @param {string} type - 'single' oder 'recurring'
 */
function selectEventType(type) {
    currentEventData.eventType = type;

    const recurringSettings = document.getElementById('event-recurring-settings');
    if (type === 'recurring') {
        recurringSettings?.classList.remove('hidden');
    } else {
        recurringSettings?.classList.add('hidden');
    }

    // Vorlaufzeit-Option nur für wiederkehrende Events anzeigen
    updateSendInvitationOptions(type);

    showModal('event-target-modal');
}

/**
 * Aktualisiert die Einladungs-Optionen basierend auf Event-Typ
 * @param {string} eventType - 'single' oder 'recurring'
 */
function updateSendInvitationOptions(eventType) {
    const sendInvitationSelect = document.getElementById('event-send-invitation');
    if (!sendInvitationSelect) return;

    const existingLeadTimeOption = sendInvitationSelect.querySelector('option[value="lead_time"]');

    if (eventType === 'recurring') {
        // Option hinzufügen falls nicht vorhanden
        if (!existingLeadTimeOption) {
            const noneOption = sendInvitationSelect.querySelector('option[value="none"]');
            const leadTimeOption = document.createElement('option');
            leadTimeOption.value = 'lead_time';
            leadTimeOption.textContent = 'Vorlaufzeit';
            sendInvitationSelect.insertBefore(leadTimeOption, noneOption);
        }
    } else {
        // Option entfernen falls vorhanden
        if (existingLeadTimeOption) {
            // Falls Vorlaufzeit ausgewählt war, auf "Sofort" zurücksetzen
            if (sendInvitationSelect.value === 'lead_time') {
                sendInvitationSelect.value = 'now';
                sendInvitationSelect.dispatchEvent(new Event('change'));
            }
            existingLeadTimeOption.remove();
        }
    }
}

/**
 * Wählt Zielgruppe und fährt fort
 * @param {string} type - 'club' oder 'subgroups'
 */
async function selectTargetType(type) {
    currentEventData.targetType = type;

    if (type === 'subgroups') {
        await loadSubgroups();
        showModal('event-subgroup-modal');
    } else {
        currentEventData.selectedSubgroups = [];
        await loadMembers();
        showModal('event-members-modal');
    }
}

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

    window.updateSubgroupSelection = updateSubgroupSelection;
}

function updateSubgroupSelection() {
    const checkboxes = document.querySelectorAll('.subgroup-checkbox:checked');
    currentEventData.selectedSubgroups = Array.from(checkboxes).map(cb => cb.value);

    const confirmBtn = document.getElementById('confirm-subgroups-btn');
    if (confirmBtn) {
        confirmBtn.disabled = currentEventData.selectedSubgroups.length === 0;
    }
}

async function confirmSubgroups() {
    await loadMembers();
    showModal('event-members-modal');
}

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

function renderMemberList() {
    const listEl = document.getElementById('event-members-list');
    const totalEl = document.getElementById('event-members-total');
    if (!listEl) return;

    if (totalEl) {
        totalEl.textContent = clubMembers.length;
    }

    listEl.innerHTML = clubMembers.map(member => {
        const initials = `${member.first_name?.[0] || ''}${member.last_name?.[0] || ''}`.toUpperCase();
        const avatarUrl = member.avatar_url || avatarPlaceholder(initials);
        const fullName = `${member.first_name || ''} ${member.last_name || ''}`.trim();

        return `
            <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-all">
                <img src="${avatarUrl}" alt="${fullName}"
                     class="w-10 h-10 rounded-full object-cover border border-gray-200"
                     onerror="this.src=avatarPlaceholder('${initials}')">
                <span class="flex-1 font-medium text-gray-900">${fullName}</span>
                <input type="checkbox" value="${member.id}" checked
                       class="member-checkbox h-5 w-5 text-indigo-600 rounded-full border-gray-300 focus:ring-indigo-500"
                       onchange="window.updateMemberCount && window.updateMemberCount()">
            </label>
        `;
    }).join('');

    currentEventData.selectedMembers = clubMembers.map(m => m.id);
    updateMemberCount();

    window.updateMemberCount = updateMemberCount;
}

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

    const selectAllBtn = document.getElementById('event-select-all-members');
    if (selectAllBtn) {
        const allChecked = checkboxes.length === clubMembers.length;
        selectAllBtn.textContent = allChecked ? 'Alle abwählen' : 'Alle auswählen';
    }
}

function toggleSelectAllMembers() {
    const checkboxes = document.querySelectorAll('.member-checkbox');
    const allChecked = document.querySelectorAll('.member-checkbox:checked').length === checkboxes.length;

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    updateMemberCount();
}

// === Guardian/Vormunde Tab ===
let clubGuardians = [];

/**
 * Switch between Mitglieder and Vormunde tabs
 */
window.switchRecipientTab = function(tab) {
    const membersTab = document.getElementById('event-members-tab-members');
    const guardiansTab = document.getElementById('event-members-tab-guardians');
    const membersContent = document.getElementById('event-members-content');
    const guardiansContent = document.getElementById('event-guardians-content');

    if (tab === 'members') {
        currentEventData.inviteMode = 'members';
        membersTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-gray-50');
        membersTab.classList.remove('text-gray-500', 'border-transparent');
        guardiansTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-gray-50');
        guardiansTab.classList.add('text-gray-500', 'border-transparent');
        membersContent.classList.remove('hidden');
        guardiansContent.classList.add('hidden');
        updateMemberCount();
    } else {
        currentEventData.inviteMode = 'guardians';
        guardiansTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-gray-50');
        guardiansTab.classList.remove('text-gray-500', 'border-transparent');
        membersTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-gray-50');
        membersTab.classList.add('text-gray-500', 'border-transparent');
        guardiansContent.classList.remove('hidden');
        membersContent.classList.add('hidden');
        loadGuardians();
        updateGuardianCount();
    }
};

/**
 * Load guardians for the club
 */
async function loadGuardians() {
    if (!currentUserData?.clubId) return;
    if (clubGuardians.length > 0) {
        renderGuardianList();
        return;
    }

    const listEl = document.getElementById('event-guardians-list');
    if (listEl) listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Laden...</p>';

    try {
        // Get all guardians who have children in this club
        const { data: guardianLinks, error: linksError } = await supabase
            .from('guardian_links')
            .select(`
                guardian_id,
                child_id,
                child:child_id (
                    id,
                    first_name,
                    last_name,
                    club_id,
                    subgroup_ids
                )
            `);

        if (linksError) throw linksError;

        // Filter to only guardians whose children are in this club
        const clubGuardianLinks = (guardianLinks || []).filter(
            link => link.child?.club_id === currentUserData.clubId
        );

        // If subgroup filter is active, also filter by subgroup
        let filteredLinks = clubGuardianLinks;
        if (currentEventData.targetType === 'subgroups' && currentEventData.selectedSubgroups.length > 0) {
            filteredLinks = clubGuardianLinks.filter(link => {
                const childSubgroups = link.child?.subgroup_ids || [];
                return currentEventData.selectedSubgroups.some(sg => childSubgroups.includes(sg));
            });
        }

        // Group by guardian
        const guardianMap = new Map();
        filteredLinks.forEach(link => {
            if (!guardianMap.has(link.guardian_id)) {
                guardianMap.set(link.guardian_id, {
                    guardian_id: link.guardian_id,
                    children: []
                });
            }
            if (link.child) {
                const childName = `${link.child.first_name || ''} ${link.child.last_name || ''}`.trim();
                guardianMap.get(link.guardian_id).children.push(childName);
            }
        });

        // Load guardian profiles
        const guardianIds = Array.from(guardianMap.keys());
        if (guardianIds.length === 0) {
            clubGuardians = [];
            renderGuardianList();
            return;
        }

        const { data: guardianProfiles, error: profileError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url')
            .in('id', guardianIds)
            .order('last_name');

        if (profileError) throw profileError;

        clubGuardians = (guardianProfiles || []).map(profile => {
            const guardianData = guardianMap.get(profile.id);
            return {
                ...profile,
                children: guardianData?.children || []
            };
        });

        renderGuardianList();
    } catch (error) {
        console.error('[Events] Error loading guardians:', error);
        if (listEl) listEl.innerHTML = '<p class="text-sm text-red-500 text-center py-4">Fehler beim Laden</p>';
    }
}

/**
 * Render guardian list
 */
function renderGuardianList() {
    const listEl = document.getElementById('event-guardians-list');
    const totalEl = document.getElementById('event-guardians-total');
    if (!listEl) return;

    if (totalEl) {
        totalEl.textContent = clubGuardians.length;
    }

    if (clubGuardians.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">Keine Vormunde gefunden</p>';
        return;
    }

    listEl.innerHTML = clubGuardians.map(guardian => {
        const initials = `${guardian.first_name?.[0] || ''}${guardian.last_name?.[0] || ''}`.toUpperCase();
        const avatarUrl = guardian.avatar_url || avatarPlaceholder(initials);
        const fullName = `${guardian.first_name || ''} ${guardian.last_name || ''}`.trim();
        const childrenText = guardian.children.length > 0
            ? `Vormund für ${guardian.children.join(', ')}`
            : '';

        return `
            <label class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-all">
                <img src="${avatarUrl}" alt="${fullName}"
                     class="w-10 h-10 rounded-full object-cover border border-gray-200"
                     onerror="this.src=avatarPlaceholder('${initials}')">
                <div class="flex-1 min-w-0">
                    <span class="font-medium text-gray-900 block">${fullName}</span>
                    ${childrenText ? `<span class="text-xs text-gray-500 block truncate">${childrenText}</span>` : ''}
                </div>
                <input type="checkbox" value="${guardian.id}"
                       class="guardian-checkbox h-5 w-5 text-indigo-600 rounded-full border-gray-300 focus:ring-indigo-500"
                       onchange="window.updateGuardianCount && window.updateGuardianCount()">
            </label>
        `;
    }).join('');

    updateGuardianCount();
}

/**
 * Update guardian selection count
 */
function updateGuardianCount() {
    const checkboxes = document.querySelectorAll('.guardian-checkbox:checked');
    currentEventData.selectedGuardians = Array.from(checkboxes).map(cb => cb.value);

    const countEl = document.getElementById('event-members-count');
    if (countEl) {
        const count = currentEventData.selectedGuardians.length;
        countEl.textContent = count === 0
            ? 'Keine Empfänger ausgewählt'
            : `${count} Vormund${count !== 1 ? 'e' : ''} ausgewählt`;
    }

    const selectAllBtn = document.getElementById('event-select-all-guardians');
    if (selectAllBtn) {
        const allChecked = checkboxes.length === clubGuardians.length && clubGuardians.length > 0;
        selectAllBtn.textContent = allChecked ? 'Alle abwählen' : 'Alle auswählen';
    }
}
window.updateGuardianCount = updateGuardianCount;

/**
 * Toggle select all guardians
 */
function toggleSelectAllGuardians() {
    const checkboxes = document.querySelectorAll('.guardian-checkbox');
    const allChecked = document.querySelectorAll('.guardian-checkbox:checked').length === checkboxes.length;

    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });

    updateGuardianCount();
}

function goBackFromMembers() {
    if (currentEventData.targetType === 'subgroups') {
        showModal('event-subgroup-modal');
    } else {
        showModal('event-target-modal');
    }
}

function openEventFormModal() {
    const startDateInput = document.getElementById('event-start-date');
    if (startDateInput && currentEventData.selectedDate) {
        startDateInput.value = currentEventData.selectedDate;
    }

    const startTimeInput = document.getElementById('event-start-time');
    if (startTimeInput && !startTimeInput.value) {
        startTimeInput.value = '18:00';
    }

    showModal('event-form-modal');
}

/**
 * Get award_points value based on event category
 * Training = always (true), Competition = checkbox, Meeting/Other = never (false)
 */
function getAwardPointsValue(eventCategory) {
    switch (eventCategory) {
        case 'training':
            return true;
        case 'competition': {
            const checkbox = document.getElementById('event-award-points');
            return checkbox ? checkbox.checked : false;
        }
        default:
            return false;
    }
}

/**
 * Notify guardians when their children are invited to events
 */
async function notifyGuardiansForEvent(event, memberIds) {
    if (!event || !memberIds || memberIds.length === 0) return;

    // Find which invited members are children (age_mode = 'kids' or 'teen')
    const { data: childMembers, error: childError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, age_mode')
        .in('id', memberIds)
        .in('age_mode', ['kids', 'teen']);

    if (childError || !childMembers || childMembers.length === 0) return;

    const childIds = childMembers.map(c => c.id);

    // Find guardians for these children
    const { data: guardianLinks, error: guardianError } = await supabase
        .from('guardian_links')
        .select('guardian_id, child_id')
        .in('child_id', childIds);

    if (guardianError || !guardianLinks || guardianLinks.length === 0) return;

    // Format event date
    const formattedDate = new Date(event.start_date + 'T12:00:00').toLocaleDateString('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });

    // Create notifications for each guardian
    const notifications = [];
    const guardianResponses = [];

    for (const link of guardianLinks) {
        const child = childMembers.find(c => c.id === link.child_id);
        const childName = child ? `${child.first_name} ${child.last_name}` : 'Dein Kind';

        notifications.push({
            user_id: link.guardian_id,
            type: 'guardian_event_notification',
            title: 'Einladung für ' + childName,
            message: `${childName} wurde zu "${event.title}" am ${formattedDate} eingeladen`,
            data: {
                event_id: event.id,
                child_id: link.child_id,
                event_title: event.title,
                event_date: event.start_date
            },
            is_read: false,
            created_at: new Date().toISOString()
        });

        // Create guardian response record
        guardianResponses.push({
            event_id: event.id,
            occurrence_date: event.start_date,
            child_id: link.child_id,
            guardian_id: link.guardian_id,
            status: 'pending',
            notified_at: new Date().toISOString()
        });
    }

    if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
    }

    if (guardianResponses.length > 0) {
        await supabase.from('guardian_event_responses').upsert(guardianResponses, {
            onConflict: 'event_id,occurrence_date,child_id,guardian_id',
            ignoreDuplicates: true
        });
    }
}

/**
 * Erstellt die Veranstaltung und Einladungen
 */
async function submitEvent() {
    const title = document.getElementById('event-title')?.value?.trim();
    const description = document.getElementById('event-description')?.value?.trim();
    const eventCategory = document.getElementById('event-type')?.value || 'other';
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

    if (!title) {
        alert('Bitte gib einen Titel ein.');
        return;
    }
    if (!startDate || !startTime) {
        alert('Bitte gib Datum und Uhrzeit ein.');
        return;
    }
    const isGuardianMode = currentEventData.inviteMode === 'guardians';
    if (isGuardianMode) {
        if (!currentEventData.selectedGuardians || currentEventData.selectedGuardians.length === 0) {
            alert('Bitte wähle mindestens einen Vormund aus.');
            return;
        }
    } else {
        if (currentEventData.selectedMembers.length === 0) {
            alert('Bitte wähle mindestens einen Empfänger aus.');
            return;
        }
    }

    let repeatType = null;
    let repeatEnd = null;
    if (currentEventData.eventType === 'recurring') {
        repeatType = document.getElementById('event-repeat-type')?.value || null;
        repeatEnd = document.getElementById('event-repeat-end')?.value || null;
    }

    let invitationSendAt = new Date().toISOString();
    let invitationLeadTimeValue = null;
    let invitationLeadTimeUnit = null;

    // Bei "keine Einladung" → null setzen
    if (sendInvitation === 'none') {
        invitationSendAt = null;
    } else if (sendInvitation === 'scheduled' && sendAt) {
        invitationSendAt = sendAt;
    } else if (sendInvitation === 'lead_time') {
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

        if (sendDateTime < new Date()) {
            invitationSendAt = new Date().toISOString();
        } else {
            invitationSendAt = sendDateTime.toISOString();
        }

        invitationLeadTimeValue = leadTimeValue;
        invitationLeadTimeUnit = leadTimeUnit;
    }

    // Bei "Ganzer Verein" die Hauptgruppe (is_default) automatisch setzen
    let targetSubgroupIds = [];
    if (currentEventData.targetType === 'subgroups') {
        targetSubgroupIds = currentEventData.selectedSubgroups;
    } else if (currentEventData.targetType === 'club') {
        // Hauptgruppe für den Verein holen
        const { data: hauptgruppe } = await supabase
            .from('subgroups')
            .select('id')
            .eq('club_id', currentUserData.clubId)
            .eq('is_default', true)
            .limit(1)
            .maybeSingle();

        if (hauptgruppe) {
            targetSubgroupIds = [hauptgruppe.id];
        }
    }

    // === NEW: Read new form fields ===
    const awardPoints = getAwardPointsValue(eventCategory);
    const autoReminder = document.getElementById('event-auto-reminder-btn')?.dataset?.value || 'disabled';
    const defaultStatus = document.getElementById('event-default-status')?.value || 'pending';
    const organizerIds = currentEventData.selectedOrganizers || [currentUserData.id];

    // === NEW: Duplicate detection ===
    const duplicate = await checkDuplicateEvent(startDate, startTime, eventCategory);
    if (duplicate) {
        const confirmContinue = confirm(`Es gibt bereits eine Veranstaltung am selben Datum und zur selben Uhrzeit:\n"${duplicate.title}"\n\nMöchtest du trotzdem fortfahren?`);
        if (!confirmContinue) return;
    }

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
        event_category: eventCategory,
        target_type: currentEventData.targetType,
        target_subgroup_ids: targetSubgroupIds,
        max_participants: maxParticipants ? parseInt(maxParticipants) : null,
        response_deadline: responseDeadline || null,
        invitation_send_at: invitationSendAt,
        invitation_lead_time_value: invitationLeadTimeValue,
        invitation_lead_time_unit: invitationLeadTimeUnit,
        comments_enabled: commentsEnabled,
        repeat_type: repeatType,
        repeat_end_date: repeatEnd,
        // === NEW fields ===
        award_points: awardPoints,
        organizer_ids: organizerIds,
        auto_reminder: autoReminder,
        default_participation_status: defaultStatus,
        invite_mode: isGuardianMode ? 'guardians' : 'members',
        created_at: new Date().toISOString()
    };

    try {
        const submitBtn = document.getElementById('event-form-submit-btn');
        if (submitBtn) {
            submitBtn.textContent = 'Wird erstellt...';
            submitBtn.disabled = true;
        }

        // Event einfügen
        const { data: event, error: eventError } = await supabase
            .from('events')
            .insert(eventData)
            .select()
            .single();

        if (eventError) throw eventError;

        // === NEW: Upload attachments if any ===
        if (pendingAttachments.length > 0) {
            const attachments = await uploadEventAttachments(event.id);
            if (attachments.length > 0) {
                await supabase
                    .from('events')
                    .update({ attachments })
                    .eq('id', event.id);
            }
        }

        // Einladungen IMMER erstellen (zum Tracken wer ausgewählt wurde)
        const invitations = [];
        const invitationStatus = defaultStatus === 'accepted' ? 'accepted' : 'pending';

        if (isGuardianMode) {
            // Guardian mode: invite guardians directly
            const uniqueGuardians = [...new Set(currentEventData.selectedGuardians)];

            uniqueGuardians.forEach(userId => {
                invitations.push({
                    event_id: event.id,
                    user_id: userId,
                    occurrence_date: startDate,
                    status: invitationStatus,
                    role: 'participant',
                    created_at: new Date().toISOString()
                });
            });

            if (invitations.length > 0) {
                const { error: invError } = await supabase
                    .from('event_invitations')
                    .upsert(invitations, {
                        onConflict: 'event_id,user_id',
                        ignoreDuplicates: true
                    });
                if (invError) throw invError;
            }

            // Send notifications to guardians
            if (sendInvitation === 'now') {
                try {
                    const notifications = uniqueGuardians.map(userId => ({
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
                    console.warn('[Events] Could not create guardian notifications:', notifError);
                }
            }
        } else {
            // Member mode: invite members, auto-notify guardians for children
            const uniqueMembers = [...new Set(currentEventData.selectedMembers)];

            uniqueMembers.forEach(userId => {
                const isOrganizer = organizerIds.includes(userId);
                invitations.push({
                    event_id: event.id,
                    user_id: userId,
                    occurrence_date: startDate,
                    status: isOrganizer ? 'accepted' : invitationStatus,
                    role: isOrganizer ? 'organizer' : 'participant',
                    created_at: new Date().toISOString()
                });
            });

            // Also invite organizers who aren't in selectedMembers
            for (const orgId of organizerIds) {
                if (!uniqueMembers.includes(orgId)) {
                    invitations.push({
                        event_id: event.id,
                        user_id: orgId,
                        occurrence_date: startDate,
                        status: 'accepted',
                        role: 'organizer',
                        created_at: new Date().toISOString()
                    });
                }
            }

            if (invitations.length > 0) {
                const { error: invError } = await supabase
                    .from('event_invitations')
                    .upsert(invitations, {
                        onConflict: 'event_id,user_id',
                        ignoreDuplicates: true
                    });
                if (invError) throw invError;
            }

            // Notify guardians for child participants (automatic)
            try {
                await notifyGuardiansForEvent(event, uniqueMembers);
            } catch (guardianError) {
                console.warn('[Events] Could not notify guardians:', guardianError);
            }

            // Send notifications to members
            if (sendInvitation === 'now') {
                try {
                    const notifications = uniqueMembers.map(userId => ({
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
        }

        if (window.trackEvent) window.trackEvent('event_create');
        alert('Veranstaltung erfolgreich erstellt!');
        closeAllModals();
        resetEventData();

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

function resetEventData() {
    currentEventData = {
        selectedDate: null,
        eventType: 'single',
        targetType: 'club',
        selectedSubgroups: [],
        selectedMembers: [],
        selectedGuardians: [],
        selectedOrganizers: null,
        inviteMode: 'members',
        formData: {}
    };

    // Reset guardian state
    clubGuardians = [];

    // Clear pending attachments
    pendingAttachments = [];

    document.getElementById('event-creation-form')?.reset();

    // Reset attachment preview
    const attachmentPreview = document.getElementById('event-attachment-preview');
    if (attachmentPreview) attachmentPreview.innerHTML = '';
    const attachmentCount = document.getElementById('event-attachment-count');
    if (attachmentCount) attachmentCount.textContent = '';

    // Reset auto reminder button
    const reminderBtn = document.getElementById('event-auto-reminder-btn');
    if (reminderBtn) {
        reminderBtn.dataset.value = 'disabled';
        reminderBtn.textContent = 'Deaktiviert';
        reminderBtn.classList.remove('text-indigo-600');
        reminderBtn.classList.add('text-gray-500');
    }

    // Reset points toggle visibility
    const pointsToggle = document.getElementById('event-points-toggle');
    const pointsInfo = document.getElementById('event-points-info');
    if (pointsToggle) pointsToggle.classList.add('hidden');
    if (pointsInfo) pointsInfo.classList.add('hidden');

    // Reset organizer display
    const organizerDisplay = document.getElementById('event-organizer-display');
    if (organizerDisplay) organizerDisplay.textContent = 'Du';
    const organizerDropdown = document.getElementById('event-organizer-dropdown');
    if (organizerDropdown) organizerDropdown.classList.add('hidden');

    // Reset recipient tab to Mitglieder
    const membersTab = document.getElementById('event-members-tab-members');
    const guardiansTab = document.getElementById('event-members-tab-guardians');
    const membersContent = document.getElementById('event-members-content');
    const guardiansContent = document.getElementById('event-guardians-content');
    if (membersTab) {
        membersTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-gray-50');
        membersTab.classList.remove('text-gray-500', 'border-transparent');
    }
    if (guardiansTab) {
        guardiansTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-gray-50');
        guardiansTab.classList.add('text-gray-500', 'border-transparent');
    }
    if (membersContent) membersContent.classList.remove('hidden');
    if (guardiansContent) guardiansContent.classList.add('hidden');

    // Vorlaufzeit-Option verstecken (Standard ist einzelnes Event)
    updateSendInvitationOptions('single');
}

/**
 * Zeigt ein bestimmtes Modal an
 * @param {string} modalId - Modal ID
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
 * Öffnet Event-Details und zeigt Anwesenheitserfassung für Trainer
 * @param {string} eventId - Event ID
 * @param {string} occurrenceDate - Datum für wiederkehrende Events (YYYY-MM-DD)
 */
window.openEventDetails = async function(eventId, occurrenceDate = null) {
    try {
        // Event-Details laden
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        const { data: invitations, error: invError } = await supabase
            .from('event_invitations')
            .select(`
                id,
                user_id,
                status,
                response_at,
                role,
                decline_comment,
                profiles:user_id (
                    id,
                    first_name,
                    last_name
                )
            `)
            .eq('event_id', eventId);

        if (invError) console.warn('[Events] Could not load invitations:', invError);

        // Lade immer alle aktuellen Club-Mitglieder für Anwesenheitserfassung
        let attendeeList = [];
        let coachList = [];

        const { data: clubMembers } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, subgroup_ids, role')
            .eq('club_id', currentUserData?.clubId)
            .in('role', ['player', 'coach', 'head_coach'])
            .order('last_name', { ascending: true });

        if (clubMembers) {
            // Filtere nach Zielgruppe falls gesetzt
            let filteredMembers = clubMembers;
            if (event.target_type === 'subgroups' && event.target_subgroup_ids?.length > 0) {
                filteredMembers = clubMembers.filter(m =>
                    m.subgroup_ids?.some(sg => event.target_subgroup_ids.includes(sg)) ||
                    m.role === 'coach' || m.role === 'head_coach'
                );
            }

            // Spieler und Trainer trennen
            const players = filteredMembers.filter(m => m.role === 'player');
            const coaches = filteredMembers.filter(m => m.role === 'coach' || m.role === 'head_coach');

            // Einladungs-Status aus existierenden Einladungen übernehmen
            const invitationMap = new Map();
            (invitations || []).forEach(inv => {
                invitationMap.set(inv.user_id, {
                    status: inv.status,
                    role: inv.role || 'participant',
                    decline_comment: inv.decline_comment || null
                });
            });

            attendeeList = players.map(m => {
                const invData = invitationMap.get(m.id);
                return {
                    user_id: m.id,
                    status: invData?.status || 'none',
                    role: 'player',
                    eventRole: invData?.role || 'participant',
                    decline_comment: invData?.decline_comment || null,
                    profiles: { id: m.id, first_name: m.first_name, last_name: m.last_name }
                };
            });

            coachList = coaches.map(m => ({
                user_id: m.id,
                role: m.role,
                profiles: { id: m.id, first_name: m.first_name, last_name: m.last_name }
            }));
        }

        // Anwesenheitsstatistik für jeden Spieler laden (letzte 3 Monate) für Sortierung
        // Bei untergruppen-spezifischen Events nur diese Untergruppen zählen
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        const startDateForStats = threeMonthsAgo.toISOString().split('T')[0];

        let eventAttendanceQuery = supabase
            .from('event_attendance')
            .select('present_user_ids, events!inner(club_id, target_type, target_subgroup_ids)')
            .eq('events.club_id', event.club_id)
            .gte('created_at', startDateForStats);

        const { data: eventAttendanceHistory } = await eventAttendanceQuery;

        // Anwesenheitszähler pro Spieler berechnen
        // Bei untergruppen-spezifischen Events nur passende Events zählen
        const attendanceCountMap = new Map();
        const targetSubgroups = event.target_subgroup_ids || [];
        const isSubgroupSpecific = event.target_type === 'subgroups' && targetSubgroups.length > 0;

        (eventAttendanceHistory || []).forEach(record => {
            // Nur zählen wenn: Event ist vereinsweit ODER hat gleiche Untergruppen
            const recordSubgroups = record.events?.target_subgroup_ids || [];
            const recordIsClubWide = record.events?.target_type !== 'subgroups' || recordSubgroups.length === 0;

            let shouldCount = false;
            if (!isSubgroupSpecific) {
                // Aktuelles Event ist vereinsweit -> alle zählen
                shouldCount = true;
            } else if (recordIsClubWide) {
                // Record ist vereinsweit -> auch zählen für Untergruppen-Events
                shouldCount = true;
            } else {
                // Beide sind untergruppen-spezifisch -> nur wenn Überschneidung
                shouldCount = recordSubgroups.some(sg => targetSubgroups.includes(sg));
            }

            if (shouldCount) {
                (record.present_user_ids || []).forEach(userId => {
                    attendanceCountMap.set(userId, (attendanceCountMap.get(userId) || 0) + 1);
                });
            }
        });

        // Spieler nach Anwesenheitshäufigkeit sortieren (höchste zuerst)
        attendeeList.sort((a, b) => {
            const countA = attendanceCountMap.get(a.user_id) || 0;
            const countB = attendanceCountMap.get(b.user_id) || 0;
            if (countB !== countA) {
                return countB - countA; // Absteigende Sortierung nach Anwesenheit
            }
            // Bei gleicher Anzahl: nach Nachname sortieren
            const nameA = a.profiles?.last_name || '';
            const nameB = b.profiles?.last_name || '';
            return nameA.localeCompare(nameB);
        });

        // Anwesenheits-Count zu jedem Attendee hinzufügen
        attendeeList.forEach(inv => {
            inv.attendanceCount = attendanceCountMap.get(inv.user_id) || 0;
        });

        const accepted = attendeeList.filter(i => i.status === 'accepted');
        const declined = attendeeList.filter(i => i.status === 'rejected' || i.status === 'declined');
        const pending = attendeeList.filter(i => i.status === 'pending' || i.status === 'none');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const displayDate = occurrenceDate || event.start_date;
        const eventDate = new Date(displayDate);
        eventDate.setHours(0, 0, 0, 0);
        const isPastOrToday = eventDate <= today;

        // Prüfen ob das Event bereits begonnen hat (Datum + Uhrzeit)
        const now = new Date();
        let hasEventStarted = false;
        if (eventDate < today) {
            // Vergangenes Datum - Event hat definitiv begonnen
            hasEventStarted = true;
        } else if (eventDate.getTime() === today.getTime() && event.start_time) {
            // Heute - prüfe Startzeit
            const [startH, startM] = event.start_time.split(':').map(Number);
            const eventStartTime = new Date();
            eventStartTime.setHours(startH, startM, 0, 0);
            hasEventStarted = now >= eventStartTime;
        } else if (eventDate.getTime() === today.getTime() && !event.start_time) {
            // Heute ohne Startzeit - erlauben
            hasEventStarted = true;
        }

        const isCoach = currentUserData && ['coach', 'head_coach', 'admin'].includes(currentUserData.role);
        console.log('[Events] openEventDetails - currentUserData:', currentUserData, 'isCoach:', isCoach);

        const formattedDate = eventDate.toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        let attendanceData = null;
        eventExercises = [];
        if (hasEventStarted) {
            // Für wiederkehrende Events: Anwesenheit pro Termin (occurrence_date) laden
            let attendanceQuery = supabase
                .from('event_attendance')
                .select('*')
                .eq('event_id', eventId);

            // Bei wiederkehrenden Events nach spezifischem Datum filtern
            if (occurrenceDate) {
                attendanceQuery = attendanceQuery.eq('occurrence_date', occurrenceDate);
            }

            const { data: attendance, error: attendanceError } = await attendanceQuery.maybeSingle();

            if (attendanceError) {
                console.warn('[Events] Could not load attendance:', attendanceError);
            } else {
                attendanceData = attendance;
                if (attendance?.completed_exercises) {
                    eventExercises = attendance.completed_exercises;
                }
            }
        }

        const existingModal = document.getElementById('event-details-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'event-details-modal';
        modal.className = 'fixed inset-0 bg-gray-800/75 flex items-center justify-center z-[100001] p-4';

        const presentIds = attendanceData?.present_user_ids || [];
        const coachHours = attendanceData?.coach_hours || {};

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

                    ${isPastOrToday && isCoach && !hasEventStarted ? `
                    <!-- Event hat noch nicht begonnen -->
                    <div class="border-t pt-6">
                        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                            <svg class="w-8 h-8 text-yellow-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            <p class="text-yellow-800 font-medium">Veranstaltung beginnt um ${event.start_time || '-'} Uhr</p>
                            <p class="text-yellow-600 text-sm mt-1">Anwesenheit kann erst nach Beginn erfasst werden</p>
                        </div>
                    </div>
                    ` : ''}

                    ${hasEventStarted && isCoach ? `
                    <!-- Attendance Tracking for Coaches -->
                    <div class="border-t pt-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-semibold text-gray-900">
                                <svg class="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                                </svg>
                                Anwesenheit erfassen
                            </h3>
                            <span id="event-attendance-count" class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold">${presentIds.length} / ${attendeeList.length}</span>
                        </div>
                        <div class="flex items-center gap-2 mb-4">
                            <button type="button" onclick="document.querySelectorAll('.event-attendance-checkbox').forEach(cb => cb.checked = true); window.updateEventAttendanceCount();" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                                Alle auswählen
                            </button>
                            <button type="button" onclick="document.querySelectorAll('.event-attendance-checkbox').forEach(cb => cb.checked = false); window.updateEventAttendanceCount();" class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                                Keine
                            </button>
                        </div>

                        <div class="space-y-2 max-h-64 overflow-y-auto" id="event-attendance-list">
                            ${attendeeList.length > 0 ? attendeeList.map(inv => {
                                const name = inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt';
                                const isPresent = presentIds.includes(inv.user_id);
                                const statusBadge = inv.status === 'accepted'
                                    ? '<span class="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Zugesagt</span>'
                                    : inv.status === 'rejected' || inv.status === 'declined'
                                    ? '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Abgesagt</span>'
                                    : inv.status === 'none'
                                    ? ''
                                    : '<span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">Ausstehend</span>';
                                return `
                                    <label class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                                        <input type="checkbox"
                                               class="event-attendance-checkbox w-5 h-5 text-indigo-600 rounded"
                                               data-user-id="${inv.user_id}"
                                               onchange="window.updateEventAttendanceCount()"
                                               ${isPresent ? 'checked' : ''}>
                                        <span class="flex-1 font-medium text-gray-900">${name}</span>
                                        ${statusBadge}
                                    </label>
                                `;
                            }).join('') : '<p class="text-gray-400 text-sm text-center py-4">Keine Teilnehmer gefunden</p>'}
                        </div>

                    </div>

                    <!-- Coach Attendance with Hours -->
                    ${coachList.length > 0 ? `
                    <div class="border-t pt-6 mt-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <svg class="w-5 h-5 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                            Trainer-Anwesenheit
                        </h3>
                        <p class="text-sm text-gray-500 mb-4">Welche Trainer waren dabei und wie lange?</p>

                        <div class="space-y-2" id="event-coach-attendance-list">
                            ${coachList.map(coach => {
                                const name = coach.profiles ? (coach.profiles.first_name + ' ' + coach.profiles.last_name) : 'Unbekannt';
                                const hours = coachHours[coach.user_id] || 0;
                                return '<div class="flex items-center gap-3 p-3 rounded-lg border border-gray-200">' +
                                    '<span class="flex-1 font-medium text-gray-900">' + name + '</span>' +
                                    '<select class="coach-hours-select px-2 py-1 border border-gray-300 rounded-lg text-sm" data-coach-id="' + coach.user_id + '">' +
                                    '<option value="0"' + (hours === 0 ? ' selected' : '') + '>Nicht da</option>' +
                                    '<option value="0.5"' + (hours === 0.5 ? ' selected' : '') + '>0,5 Std</option>' +
                                    '<option value="0.75"' + (hours === 0.75 ? ' selected' : '') + '>0,75 Std</option>' +
                                    '<option value="1"' + (hours === 1 ? ' selected' : '') + '>1 Std</option>' +
                                    '<option value="1.5"' + (hours === 1.5 ? ' selected' : '') + '>1,5 Std</option>' +
                                    '<option value="2"' + (hours === 2 ? ' selected' : '') + '>2 Std</option>' +
                                    '<option value="2.5"' + (hours === 2.5 ? ' selected' : '') + '>2,5 Std</option>' +
                                    '<option value="3"' + (hours === 3 ? ' selected' : '') + '>3 Std</option>' +
                                    '<option value="4"' + (hours === 4 ? ' selected' : '') + '>4 Std</option>' +
                                    '</select>' +
                                    '</div>';
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Speichern-Bereich -->
                    <div class="mt-6 space-y-3">
                        <button
                            id="save-attendance-btn"
                            onclick="window.saveEventAttendance('${eventId}', '${displayDate}')"
                            class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors">
                            Speichern
                        </button>
                        <!-- Erfolgs-Banner (versteckt) -->
                        <div id="attendance-success-banner" class="hidden bg-green-50 border border-green-200 rounded-xl p-4">
                            <p class="text-green-800 font-medium text-center mb-3">Anwesenheit gespeichert!</p>
                            <p class="text-green-700 text-sm text-center mb-3">Punkte vergeben oder Wettkämpfe eintragen?</p>
                            <div class="flex gap-2">
                                <button
                                    onclick="window.openQuickPointsForEvent('${eventId}', '${displayDate}')"
                                    class="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition-colors">
                                    Weiter
                                </button>
                                <button
                                    onclick="document.getElementById('event-details-modal')?.remove()"
                                    class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium py-2 rounded-lg transition-colors">
                                    Schließen
                                </button>
                            </div>
                        </div>
                        ${attendanceData ? `
                        <button
                            onclick="window.openQuickPointsForEvent('${eventId}', '${displayDate}')"
                            class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-xl transition-colors">
                            Punkte eintragen
                        </button>
                        ` : ''}
                    </div>
                    ` : ''}

                    ${isCoach ? `
                    <!-- Coach: Always show participant responses -->
                    <div class="border-t pt-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">Antworten</h3>
                        ${accepted.length > 0 ? `
                        <div class="mb-4">
                            <p class="text-sm font-medium text-green-700 mb-2">Zugesagt (${accepted.length})</p>
                            <div class="space-y-1">
                                ${accepted.map(inv => {
                                    const name = inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt';
                                    const isOrganizer = inv.eventRole === 'organizer';
                                    return `
                                    <div class="flex items-center gap-2">
                                        <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                                            ${name}
                                        </span>
                                        ${isOrganizer ? '<span class="text-xs text-indigo-600 font-medium">Veranstalter</span>' : ''}
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${declined.length > 0 ? `
                        <div class="mb-4">
                            <p class="text-sm font-medium text-red-700 mb-2">Abgesagt (${declined.length})</p>
                            <div class="space-y-1">
                                ${declined.map(inv => {
                                    const name = inv.profiles ? `${inv.profiles.first_name} ${inv.profiles.last_name}` : 'Unbekannt';
                                    return `
                                    <div>
                                        <span class="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm inline-block">
                                            ${name}
                                        </span>
                                        ${inv.decline_comment ? `
                                        <p class="text-xs text-gray-500 ml-3 mt-1 italic">"${inv.decline_comment}"</p>
                                        ` : ''}
                                    </div>`;
                                }).join('')}
                            </div>
                        </div>
                        ` : ''}
                        ${pending.length > 0 ? `
                        <div class="mb-4">
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
                        ${accepted.length === 0 && declined.length === 0 && pending.length === 0 ? `
                        <p class="text-sm text-gray-400 text-center py-2">Noch keine Einladungen</p>
                        ` : ''}

                        ${!isPastOrToday && pending.length > 0 ? `
                        <!-- Reminder button for coaches (only future events) -->
                        <div class="mt-4">
                            <button onclick="window.sendEventReminder('${eventId}', '${displayDate}')" class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-medium transition-colors">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                                </svg>
                                Erinnerung an ${pending.length} Unbeantwortete senden
                            </button>
                        </div>
                        ` : ''}
                    </div>
                    ` : `
                    ${!isPastOrToday ? `
                    <!-- Player: show participant list for future events -->
                    <div class="border-t pt-6">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">Teilnehmer</h3>
                        ${accepted.length > 0 ? `
                        <div class="mb-4">
                            <p class="text-sm font-medium text-green-700 mb-2">Zugesagt (${accepted.length})</p>
                            <div class="flex flex-wrap gap-2">
                                ${accepted.map(inv => `
                                    <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                                        ${inv.profiles ? inv.profiles.first_name + ' ' + inv.profiles.last_name : 'Unbekannt'}
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
                                        ${inv.profiles ? inv.profiles.first_name + ' ' + inv.profiles.last_name : 'Unbekannt'}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}
                    `}

                    <!-- Comments Section (always visible for coaches, for others only when enabled) -->
                    ${isCoach || event.comments_enabled !== false ? `
                    <div class="border-t pt-6 mt-4">
                        <h3 class="text-lg font-semibold text-gray-900 mb-4">
                            <svg class="w-5 h-5 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                            </svg>
                            Kommentare
                        </h3>
                        <div id="event-comments-list" class="space-y-3 mb-4 max-h-64 overflow-y-auto" data-event-id="${eventId}" data-occurrence-date="${displayDate}">
                            <p class="text-sm text-gray-400 text-center py-2">Laden...</p>
                        </div>
                        <div class="flex gap-2">
                            <input type="text" id="event-comment-input" placeholder="Kommentar schreiben..."
                                class="flex-1 px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm">
                            <button onclick="window.postEventComment('${eventId}', '${displayDate}')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
                                Senden
                            </button>
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Load comments (always for coaches, otherwise when enabled)
        if (isCoach || event.comments_enabled !== false) {
            loadEventComments(eventId, displayDate);
        }

    } catch (error) {
        console.error('[Events] Error loading event details:', error);
        alert('Fehler beim Laden der Event-Details');
    }
};

/**
 * Send reminder to pending participants
 */
window.sendEventReminder = async function(eventId, occurrenceDate) {
    try {
        const { data: event } = await supabase
            .from('events')
            .select('title, start_date, club_id, target_type, target_subgroup_ids')
            .eq('id', eventId)
            .single();

        if (!event) return;

        // Load all relevant club members (same logic as event detail display)
        const { data: members } = await supabase
            .from('profiles')
            .select('id, subgroup_ids, role')
            .eq('club_id', event.club_id)
            .in('role', ['player']);

        if (!members || members.length === 0) {
            alert('Keine Mitglieder gefunden.');
            return;
        }

        // Filter by target subgroups if applicable
        let targetMembers = members;
        if (event.target_type === 'subgroups' && event.target_subgroup_ids?.length > 0) {
            targetMembers = members.filter(m =>
                m.subgroup_ids?.some(sg => event.target_subgroup_ids.includes(sg))
            );
        }

        // Load existing invitations for this event (optionally filtered by occurrence_date)
        let invQuery = supabase
            .from('event_invitations')
            .select('user_id, status')
            .eq('event_id', eventId);

        if (occurrenceDate) {
            invQuery = invQuery.eq('occurrence_date', occurrenceDate);
        }

        const { data: invitations } = await invQuery;

        // Build map of invitation statuses
        const statusMap = new Map();
        (invitations || []).forEach(inv => {
            statusMap.set(inv.user_id, inv.status);
        });

        // Find members who haven't accepted or declined (status is 'pending', 'none', or no record)
        const pendingUserIds = targetMembers
            .filter(m => {
                const status = statusMap.get(m.id);
                return !status || status === 'pending' || status === 'none';
            })
            .map(m => m.id);

        if (pendingUserIds.length === 0) {
            alert('Keine ausstehenden Antworten vorhanden.');
            return;
        }

        const displayDate = occurrenceDate || event.start_date;
        const formattedDate = new Date(displayDate + 'T12:00:00').toLocaleDateString('de-DE', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });

        const notifications = pendingUserIds.map(userId => ({
            user_id: userId,
            type: 'event_reminder',
            title: 'Erinnerung: Antwort ausstehend',
            message: `Bitte antworte auf die Einladung zu "${event.title}" am ${formattedDate}`,
            data: { event_id: eventId },
            is_read: false,
            created_at: new Date().toISOString()
        }));

        const { error } = await supabase.from('notifications').insert(notifications);
        if (error) throw error;

        alert(`Erinnerung an ${pendingUserIds.length} Spieler gesendet!`);
    } catch (error) {
        console.error('[Events] Error sending reminders:', error);
        alert('Fehler beim Senden der Erinnerungen: ' + error.message);
    }
};

/**
 * Load event comments
 */
async function loadEventComments(eventId, occurrenceDate) {
    const container = document.getElementById('event-comments-list');
    if (!container) return;

    try {
        const { data: comments, error } = await supabase
            .from('event_comments')
            .select(`
                id,
                content,
                created_at,
                user_id,
                profiles:user_id (
                    first_name,
                    last_name
                )
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
            const isOwn = comment.user_id === currentUserData?.id;
            return `
                <div class="flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}">
                    <div class="flex-1 ${isOwn ? 'text-right' : ''}">
                        <div class="inline-block ${isOwn ? 'bg-indigo-50 text-indigo-900' : 'bg-gray-100 text-gray-900'} rounded-xl px-4 py-2 max-w-[85%]">
                            <p class="text-xs font-semibold ${isOwn ? 'text-indigo-600' : 'text-gray-600'} mb-0.5">${name}</p>
                            <p class="text-sm">${comment.content}</p>
                            <p class="text-xs ${isOwn ? 'text-indigo-400' : 'text-gray-400'} mt-1">${time}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error('[Events] Error loading comments:', error);
        container.innerHTML = '<p class="text-sm text-red-500 text-center py-2">Fehler beim Laden</p>';
    }
}

/**
 * Post a comment to an event
 */
window.postEventComment = async function(eventId, occurrenceDate) {
    const input = document.getElementById('event-comment-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    try {
        const { error } = await supabase
            .from('event_comments')
            .insert({
                event_id: eventId,
                occurrence_date: occurrenceDate || null,
                user_id: currentUserData.id,
                content,
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        input.value = '';
        await loadEventComments(eventId, occurrenceDate);

    } catch (error) {
        console.error('[Events] Error posting comment:', error);
        alert('Fehler beim Senden des Kommentars: ' + error.message);
    }
};

/**
 * Aktualisiert den Anwesenheitszähler im Event-Modal
 */
window.updateEventAttendanceCount = function() {
    const countEl = document.getElementById('event-attendance-count');
    if (!countEl) return;
    const allCheckboxes = document.querySelectorAll('.event-attendance-checkbox');
    const checkedCheckboxes = document.querySelectorAll('.event-attendance-checkbox:checked');
    countEl.textContent = `${checkedCheckboxes.length} / ${allCheckboxes.length}`;
};

/**
 * Speichert Anwesenheit und Übungen inkl. Punkte-/Streak-Logik
 * @param {string} eventId - Event ID
 * @param {string} occurrenceDate - Datum des spezifischen Termins (für wiederkehrende Events)
 */
window.saveEventAttendance = async function(eventId, occurrenceDate = null) {
    // Verhindere Doppel-Submits
    if (isSubmittingAttendance) {
        console.log('[Events] Attendance save already in progress, ignoring duplicate call');
        return;
    }
    isSubmittingAttendance = true;

    // Lade-Animation anzeigen
    const saveBtn = document.getElementById('save-attendance-btn');
    const originalBtnText = saveBtn?.innerHTML;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
            <svg class="animate-spin h-5 w-5 mr-2 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Speichert...
        `;
        saveBtn.classList.add('opacity-75', 'cursor-not-allowed');
    }

    try {
        const checkboxes = document.querySelectorAll('.event-attendance-checkbox:checked');
        const presentUserIds = Array.from(checkboxes).map(cb => cb.dataset.userId);

        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*, target_subgroup_ids')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        const exerciseData = eventExercises.map(ex => ({
            id: ex.id,
            name: ex.name,
            points: ex.points || 0
        }));

        const totalExercisePoints = exerciseData.reduce((sum, ex) => sum + (ex.points || 0), 0);

        // Trainer-Stunden sammeln
        const coachHoursSelects = document.querySelectorAll('.coach-hours-select');
        const coachHours = {};
        coachHoursSelects.forEach(select => {
            const hours = parseFloat(select.value);
            if (hours > 0) {
                coachHours[select.dataset.coachId] = hours;
            }
        });

        // Für wiederkehrende Events: Anwesenheit pro Termin (occurrence_date) suchen
        let existingQuery = supabase
            .from('event_attendance')
            .select('id, present_user_ids, points_awarded_to')
            .eq('event_id', eventId);

        if (occurrenceDate) {
            existingQuery = existingQuery.eq('occurrence_date', occurrenceDate);
        }

        const { data: existing, error: existingError } = await existingQuery.maybeSingle();

        if (existingError) {
            console.warn('[Events] Could not load existing attendance:', existingError);
        }

        const previouslyAwardedTo = existing?.points_awarded_to || [];
        const previousPresentIds = existing?.present_user_ids || [];

        const newAttendees = presentUserIds.filter(id => !previouslyAwardedTo.includes(id));
        const removedAttendees = previousPresentIds.filter(id => !presentUserIds.includes(id) && previouslyAwardedTo.includes(id));

        // Training-Zusammenfassungen für ALLE anwesenden Spieler erstellen/aktualisieren
        // (nicht nur neue, damit Quick Points auch für bestehende funktioniert)
        if (presentUserIds.length > 0) {
            const eventDate = occurrenceDate || event.start_date;
            console.log('[Events] Creating/updating training summaries for', presentUserIds.length, 'attendees, date:', eventDate, 'eventId:', eventId);
            await createTrainingSummariesForAttendees(
                event.club_id,
                eventId,
                eventDate,
                event.title,
                presentUserIds
            );
        }

        // Punkte in Batches vergeben (5 gleichzeitig) um Netzwerküberlastung zu vermeiden
        const BATCH_SIZE = 5;
        for (let i = 0; i < newAttendees.length; i += BATCH_SIZE) {
            const batch = newAttendees.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(playerId =>
                awardEventAttendancePoints(playerId, event, totalExercisePoints, occurrenceDate)
            ));
        }

        // Punkte in Batches abziehen
        for (let i = 0; i < removedAttendees.length; i += BATCH_SIZE) {
            const batch = removedAttendees.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(playerId =>
                deductEventAttendancePoints(playerId, event, occurrenceDate)
            ));
        }

        const updatedPointsAwardedTo = [
            ...previouslyAwardedTo.filter(id => presentUserIds.includes(id)),
            ...newAttendees
        ];

        if (existing) {
            const { error } = await supabase
                .from('event_attendance')
                .update({
                    present_user_ids: presentUserIds,
                    completed_exercises: exerciseData,
                    points_awarded_to: updatedPointsAwardedTo,
                    coach_hours: coachHours,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            const insertData = {
                event_id: eventId,
                present_user_ids: presentUserIds,
                coach_hours: coachHours,
                completed_exercises: exerciseData,
                points_awarded_to: updatedPointsAwardedTo,
                created_at: new Date().toISOString()
            };

            // occurrence_date nur hinzufügen wenn vorhanden (für wiederkehrende Events)
            if (occurrenceDate) {
                insertData.occurrence_date = occurrenceDate;
            }

            const { error } = await supabase
                .from('event_attendance')
                .insert(insertData);

            if (error) throw error;
        }

        // Heutige Trainings aktualisieren (falls auf Startseite)
        if (typeof window.refreshTodaysTrainings === 'function') {
            window.refreshTodaysTrainings();
        }

        // Erfolgs-Banner anzeigen wenn Spieler anwesend waren
        const successBanner = document.getElementById('attendance-success-banner');
        const saveBtnEl = document.getElementById('save-attendance-btn');

        if (presentUserIds.length > 0 && successBanner) {
            // Speichern-Button ausblenden, Erfolgs-Banner anzeigen
            if (saveBtnEl) saveBtnEl.classList.add('hidden');
            successBanner.classList.remove('hidden');
            eventExercises = [];
        } else {
            // Keine Spieler anwesend - Modal schließen
            document.getElementById('event-details-modal')?.remove();
            eventExercises = [];
        }

        // Erfolg - Flag zurücksetzen
        isSubmittingAttendance = false;
        if (window.trackEvent) window.trackEvent('event_rsvp');

    } catch (error) {
        console.error('[Events] Error saving attendance:', error);

        // Flag zurücksetzen damit erneuter Versuch möglich ist
        isSubmittingAttendance = false;

        // AbortError speziell behandeln (kann bei Netzwerkproblemen auftreten)
        if (error.message?.includes('AbortError') || error.name === 'AbortError') {
            alert('Die Anfrage wurde unterbrochen. Bitte versuche es erneut.');
        } else {
            alert('Fehler beim Speichern: ' + error.message);
        }

        // Button wieder aktivieren bei Fehler
        if (saveBtn && originalBtnText) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnText;
            saveBtn.classList.remove('opacity-75', 'cursor-not-allowed');
        }
    }
};

/**
 * Öffnet das Quick Points Modal für ein Event (ohne Anwesenheit zu speichern)
 * @param {string} eventId - Event ID
 * @param {string} occurrenceDate - Datum des spezifischen Termins
 */
window.openQuickPointsForEvent = async function(eventId, occurrenceDate = null) {
    try {
        // Lade bestehende Anwesenheit
        let attendanceQuery = supabase
            .from('event_attendance')
            .select('present_user_ids')
            .eq('event_id', eventId);

        if (occurrenceDate) {
            attendanceQuery = attendanceQuery.eq('occurrence_date', occurrenceDate);
        }

        const { data: attendance } = await attendanceQuery.maybeSingle();
        const presentUserIds = attendance?.present_user_ids || [];

        if (presentUserIds.length === 0) {
            alert('Keine Spieler als anwesend markiert.');
            return;
        }

        // Alle Event-Modals schließen
        document.getElementById('event-details-modal')?.remove();
        document.getElementById('event-day-modal')?.classList.add('hidden');

        // Spieler-Daten und Event-Daten parallel laden
        const [{ data: playersData }, { data: event }] = await Promise.all([
            supabase.from('profiles')
                .select('id, first_name, last_name, email, subgroup_ids')
                .in('id', presentUserIds),
            supabase.from('events')
                .select('club_id, title, start_date')
                .eq('id', eventId)
                .single()
        ]);

        const players = (playersData || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            email: p.email,
            subgroupIDs: p.subgroup_ids || []
        }));

        // Auswahl-Dialog sofort öffnen (Punkte / Wettkämpfe / Schließen)
        if (typeof window.openPostAttendanceChoice === 'function') {
            window.openPostAttendanceChoice(presentUserIds, players, currentUserData, occurrenceDate, eventId);
        } else if (typeof window.openQuickPointsModal === 'function') {
            // Fallback falls Choice-Modal nicht verfügbar (z.B. auf Player-Seite)
            window.openQuickPointsModal(presentUserIds, players, currentUserData, occurrenceDate, eventId);
        }

        // Training-Summaries im Hintergrund erstellen (blockiert nicht das UI)
        if (event && presentUserIds.length > 0) {
            const eventDate = occurrenceDate || event.start_date;
            console.log('[Events] Ensuring training summaries exist for', presentUserIds.length, 'players, eventId:', eventId);
            createTrainingSummariesForAttendees(
                event.club_id,
                eventId,
                eventDate,
                event.title,
                presentUserIds
            ).catch(err => console.warn('[Events] Training summaries background error:', err));
        }
    } catch (error) {
        console.error('[Events] Error opening quick points:', error);
        alert('Fehler: ' + error.message);
    }
};

/**
 * Vergibt Punkte für Event-Teilnahme inkl. Streak-Berechnung
 * @param {string} playerId - Spieler ID
 * @param {Object} event - Event-Daten
 * @param {number} exercisePoints - Zusätzliche Übungspunkte
 * @param {string} occurrenceDate - Tatsächliches Datum (für wiederkehrende Events)
 */
async function awardEventAttendancePoints(playerId, event, exercisePoints = 0, occurrenceDate = null) {
    // Verwende occurrenceDate wenn vorhanden, sonst event.start_date
    const date = occurrenceDate || event.start_date;
    const eventTitle = event.title || 'Veranstaltung';
    const subgroupIds = event.target_subgroup_ids || [];
    const isTraining = event.event_category === 'training';

    // Streak-Tracking für ALLE Trainings:
    // - Mit Untergruppe: erste Subgruppe verwenden
    // - Ohne Untergruppe (ganzer Verein): Hauptgruppe verwenden (is_default = true)
    let primarySubgroupId = null;
    if (isTraining) {
        if (subgroupIds.length > 0) {
            primarySubgroupId = subgroupIds[0];
        } else {
            // Fallback: Verwende die Hauptgruppe (is_default = true) für Club-weite Trainings
            const { data: hauptgruppe } = await supabase
                .from('subgroups')
                .select('id, name')
                .eq('club_id', event.club_id)
                .eq('is_default', true)
                .limit(1)
                .maybeSingle();

            if (hauptgruppe) {
                primarySubgroupId = hauptgruppe.id;
                console.log('[Events] Using Hauptgruppe for club-wide training:', hauptgruppe.name);
            }
        }
    }

    let subgroupName = '';
    if (primarySubgroupId) {
        const { data: subgroup } = await supabase
            .from('subgroups')
            .select('name')
            .eq('id', primarySubgroupId)
            .maybeSingle();
        subgroupName = subgroup?.name || '';
    }

    let wasPresentAtLastEvent = false;
    let currentStreak = 0;
    let newStreak = 1;

    if (isTraining && primarySubgroupId) {
        // Lade die letzten Anwesenheiten für Trainings mit passenden Untergruppen
        // WICHTIG: Mit ORDER BY und nur Events VOR dem aktuellen Datum
        const targetSubgroups = event.target_subgroup_ids || [];

        const { data: lastAttendances } = await supabase
            .from('event_attendance')
            .select(`
                present_user_ids,
                occurrence_date,
                created_at,
                events!inner(
                    id,
                    event_category,
                    target_subgroup_ids,
                    start_date,
                    club_id
                )
            `)
            .eq('events.club_id', event.club_id)
            .eq('events.event_category', 'training')
            .order('created_at', { ascending: false })
            .limit(100);

        // Alle relevanten Anwesenheiten mit tatsächlichem Datum sammeln
        const relevantAttendances = (lastAttendances || [])
            .map(att => ({
                ...att,
                actualDate: att.occurrence_date || att.events?.start_date
            }))
            .filter(att => {
                if (!att.actualDate || att.actualDate >= date) return false;

                // Prüfe ob die Untergruppen übereinstimmen
                const attSubgroups = att.events?.target_subgroup_ids || [];

                // Exakte Untergruppen-Übereinstimmung für Streak-Berechnung
                // (nur Events der gleichen Untergruppe zählen)
                if (targetSubgroups.length > 0 && attSubgroups.length > 0) {
                    // Beide haben Untergruppen - mindestens eine muss übereinstimmen
                    return attSubgroups.some(sg => targetSubgroups.includes(sg));
                } else if (targetSubgroups.length === 0 && attSubgroups.length === 0) {
                    // Beide sind club-weit
                    return true;
                }
                // Ansonsten nicht relevant (eines club-weit, anderes mit Untergruppe)
                return false;
            })
            // Nach tatsächlichem Datum sortieren (neueste zuerst)
            .sort((a, b) => b.actualDate.localeCompare(a.actualDate));

        console.log(`[Events] Streak check for ${playerId}: found ${relevantAttendances.length} relevant prior trainings for subgroups ${targetSubgroups.join(',')}`);

        const lastRelevantAttendance = relevantAttendances[0] || null;

        if (lastRelevantAttendance) {
            // Prüfen ob der Spieler beim letzten Training anwesend war
            const presentIds = lastRelevantAttendance.present_user_ids || [];
            wasPresentAtLastEvent = presentIds.includes(playerId);
            console.log(`[Events] Streak check for ${playerId}: last training ${lastRelevantAttendance.actualDate}, present_ids count: ${presentIds.length}, was present: ${wasPresentAtLastEvent}`);
        } else {
            // Kein vorheriges Training gefunden → Streak startet bei 1
            wasPresentAtLastEvent = true;
            console.log(`[Events] Streak check for ${playerId}: no previous training found, starting fresh`);
        }

        const { data: streakData } = await supabase
            .from('streaks')
            .select('current_streak')
            .eq('user_id', playerId)
            .eq('subgroup_id', primarySubgroupId)
            .maybeSingle();
        currentStreak = streakData?.current_streak || 0;
        newStreak = wasPresentAtLastEvent ? currentStreak + 1 : 1;

        console.log(`[Events] Streak result for ${playerId}: currentStreak=${currentStreak}, wasPresentAtLast=${wasPresentAtLastEvent}, newStreak=${newStreak}`);
    }

    // Prüfen ob bereits heute bei anderem Event anwesend (halbe Punkte)
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
                .maybeSingle();

            if (otherAttendance?.present_user_ids?.includes(playerId)) {
                alreadyAttendedToday = true;
                break;
            }
        }
    }

    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    let pointsToAdd = EVENT_ATTENDANCE_POINTS_BASE;
    let reason = `${eventTitle} am ${formattedDate}`;
    if (subgroupName) reason += ` - ${subgroupName}`;

    if (isTraining) {
        if (newStreak >= 5) {
            pointsToAdd = 6;
            reason += ` (🔥 ${newStreak}x Streak!)`;
        } else if (newStreak >= 3) {
            pointsToAdd = 5;
            reason += ` (⚡ ${newStreak}x Streak)`;
        }
    }

    if (alreadyAttendedToday) {
        pointsToAdd = Math.ceil(pointsToAdd / 2);
        reason += ` (2. Veranstaltung heute)`;
    }

    const totalPoints = pointsToAdd + exercisePoints;
    if (exercisePoints > 0) {
        reason += ` (+${exercisePoints} Übungspunkte)`;
    }

    if (isTraining && primarySubgroupId) {
        const { error: streakError } = await supabase.from('streaks').upsert({
            user_id: playerId,
            subgroup_id: primarySubgroupId,
            current_streak: newStreak,
            last_attendance_date: date,
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id,subgroup_id'
        });

        if (streakError) {
            console.warn('[Events] Error updating streak:', streakError);
        }
    }

    const { error: rpcError } = await supabase.rpc('add_player_points', {
        p_user_id: playerId,
        p_points: totalPoints,
        p_xp: totalPoints
    });

    if (rpcError) {
        console.warn('[Events] Error adding points:', rpcError);
    }

    const now = new Date().toISOString();
    const { error: pointsError } = await supabase.from('points_history').insert({
        user_id: playerId,
        points: totalPoints,
        xp: totalPoints,
        elo_change: 0,
        reason,
        timestamp: now,
        awarded_by: 'System (Veranstaltung)',
    });

    if (pointsError) {
        console.warn('[Events] Error creating points history:', pointsError);
    }

    const { error: xpError } = await supabase.from('xp_history').insert({
        user_id: playerId,
        xp: totalPoints,
        reason,
        source: 'event_attendance',
    });

    if (xpError) {
        console.warn('[Events] Error creating XP history:', xpError);
    }

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

    // Anwesenheitspunkte zur Training-Summary hinzufügen (ohne Übungspunkte - die werden separat hinzugefügt)
    let attendanceReason = 'Anwesenheit';
    if (isTraining && newStreak >= 5) {
        attendanceReason = `${newStreak}x Streak`;
    } else if (isTraining && newStreak >= 3) {
        attendanceReason = `${newStreak}x Streak`;
    }
    if (alreadyAttendedToday) {
        attendanceReason += ' (2. Training)';
    }

    await addPointsToTrainingSummary(playerId, event.id, {
        amount: pointsToAdd,
        reason: attendanceReason,
        type: 'attendance'
    });
}

/**
 * Zieht Punkte ab wenn Spieler nachträglich von Anwesenheit entfernt wird
 * Sucht die tatsächlich vergebenen Punkte und verringert Streak um 1
 * @param {string} occurrenceDate - Tatsächliches Datum (für wiederkehrende Events)
 */
async function deductEventAttendancePoints(playerId, event, occurrenceDate = null) {
    // Verwende occurrenceDate wenn vorhanden, sonst event.start_date
    const date = occurrenceDate || event.start_date;
    const eventTitle = event.title || 'Veranstaltung';
    const isTraining = event.event_category === 'training';
    const subgroupIds = event.target_subgroup_ids || [];
    const primarySubgroupId = isTraining && subgroupIds.length > 0 ? subgroupIds[0] : null;

    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    // Tatsächlich vergebene Punkte aus History suchen
    const { data: historyEntries } = await supabase
        .from('points_history')
        .select('points')
        .eq('user_id', playerId)
        .like('reason', `%${eventTitle}%${formattedDate}%`)
        .gt('points', 0)
        .order('timestamp', { ascending: false })
        .limit(1);

    const pointsToDeduct = historyEntries?.[0]?.points || EVENT_ATTENDANCE_POINTS_BASE;
    const reason = `Anwesenheit korrigiert: ${eventTitle} am ${formattedDate} (${pointsToDeduct} Punkte abgezogen)`;

    await supabase.rpc('deduct_player_points', {
        p_user_id: playerId,
        p_points: pointsToDeduct,
        p_xp: pointsToDeduct
    });

    const correctionTime = new Date().toISOString();
    await supabase.from('points_history').insert({
        user_id: playerId,
        points: -pointsToDeduct,
        xp: -pointsToDeduct,
        elo_change: 0,
        reason,
        timestamp: correctionTime,
        awarded_by: 'System (Veranstaltung)',
    });

    await supabase.from('xp_history').insert({
        user_id: playerId,
        xp: -pointsToDeduct,
        reason,
        source: 'event_attendance_correction',
    });

    // Streak um 1 verringern (nicht löschen) - nur bei Trainings
    if (primarySubgroupId) {
        const { data: streakData } = await supabase
            .from('streaks')
            .select('current_streak')
            .eq('user_id', playerId)
            .eq('subgroup_id', primarySubgroupId)
            .maybeSingle();

        if (streakData && streakData.current_streak > 0) {
            const newStreak = Math.max(0, streakData.current_streak - 1);
            await supabase.from('streaks').update({
                current_streak: newStreak,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', playerId)
            .eq('subgroup_id', primarySubgroupId);

            console.log(`[Events] Streak decreased for ${playerId}: ${streakData.current_streak} -> ${newStreak}`);
        }
    }

    console.log(`[Events] Deducted ${pointsToDeduct} points from player ${playerId}`);
}

/**
 * Zieht ALLE vergebenen Punkte eines Events ab und verringert Streaks um 1
 * Wird beim Löschen eines Events aufgerufen
 */
async function revokeEventAttendancePoints(eventId, event) {
    // Anwesenheitsdaten holen
    const { data: attendance } = await supabase
        .from('event_attendance')
        .select('points_awarded_to')
        .eq('event_id', eventId)
        .maybeSingle();

    const awardedPlayers = attendance?.points_awarded_to || [];
    if (awardedPlayers.length === 0) return;

    const eventTitle = event.title || 'Veranstaltung';
    const date = event.start_date;
    const isTraining = event.event_category === 'training';
    const subgroupIds = event.target_subgroup_ids || [];
    const primarySubgroupId = isTraining && subgroupIds.length > 0 ? subgroupIds[0] : null;

    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    for (const playerId of awardedPlayers) {
        try {
            // Punkte aus points_history suchen (enthält Event-Titel und Datum)
            const { data: historyEntries } = await supabase
                .from('points_history')
                .select('points')
                .eq('user_id', playerId)
                .like('reason', `%${eventTitle}%${formattedDate}%`)
                .gt('points', 0)
                .order('timestamp', { ascending: false })
                .limit(1);

            const pointsToDeduct = historyEntries?.[0]?.points || EVENT_ATTENDANCE_POINTS_BASE;

            // Punkte abziehen
            await supabase.rpc('deduct_player_points', {
                p_user_id: playerId,
                p_points: pointsToDeduct,
                p_xp: pointsToDeduct
            });

            // Korrektur-Einträge erstellen
            const correctionTime = new Date().toISOString();
            const reason = `Veranstaltung gelöscht: ${eventTitle} am ${formattedDate} (${pointsToDeduct} Punkte abgezogen)`;

            await supabase.from('points_history').insert({
                user_id: playerId,
                points: -pointsToDeduct,
                xp: -pointsToDeduct,
                elo_change: 0,
                reason,
                timestamp: correctionTime,
                awarded_by: 'System (Veranstaltung gelöscht)',
            });

            await supabase.from('xp_history').insert({
                user_id: playerId,
                xp: -pointsToDeduct,
                reason,
                source: 'event_deleted',
            });

            // Streak um 1 verringern (nicht löschen) - nur bei Trainings
            if (primarySubgroupId) {
                const { data: streakData } = await supabase
                    .from('streaks')
                    .select('current_streak')
                    .eq('user_id', playerId)
                    .eq('subgroup_id', primarySubgroupId)
                    .maybeSingle();

                if (streakData && streakData.current_streak > 0) {
                    const newStreak = Math.max(0, streakData.current_streak - 1);
                    await supabase.from('streaks').update({
                        current_streak: newStreak,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', playerId)
                    .eq('subgroup_id', primarySubgroupId);

                    console.log(`[Events] Streak decreased for ${playerId}: ${streakData.current_streak} -> ${newStreak}`);
                }
            }

            console.log(`[Events] Revoked ${pointsToDeduct} points from player ${playerId} (event deleted)`);
        } catch (err) {
            console.warn(`[Events] Error revoking points for player ${playerId}:`, err);
        }
    }
}

/**
 * Öffnet Übungsauswahl-Modal
 * @param {string} eventId - Event ID
 */
window.openEventExerciseSelector = async function(eventId) {
    try {
        if (allExercises.length === 0) {
            // Lade globale Übungen UND Club-spezifische Übungen
            const { data: exercises, error } = await supabase
                .from('exercises')
                .select('*')
                .or(`visibility.eq.global,club_id.eq.${currentUserData.clubId}`)
                .order('name');

            if (error) throw error;
            allExercises = exercises || [];
        }

        const existingSelector = document.getElementById('exercise-selector-modal');
        if (existingSelector) existingSelector.remove();

        const modal = document.createElement('div');
        modal.id = 'exercise-selector-modal';
        modal.className = 'fixed inset-0 bg-gray-800/75 flex items-center justify-center z-[100002] p-4';

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

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

    } catch (error) {
        console.error('[Events] Error opening exercise selector:', error);
        alert('Fehler beim Laden der Übungen');
    }
};

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

window.addEventExercise = function(id, name, points) {
    eventExercises.push({ id, name, points });
    document.getElementById('exercise-selector-modal')?.remove();
    renderEventExercises();
};

window.removeEventExercise = function(index) {
    eventExercises.splice(index, 1);
    renderEventExercises();
};

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

window.openCreateExerciseModal = function() {
    const existingModal = document.getElementById('create-exercise-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'create-exercise-modal';
    modal.className = 'fixed inset-0 bg-gray-800/75 flex items-center justify-center z-[100003] p-4';

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

    setupNewExerciseModalListeners();
};

function setupNewExerciseModalListeners() {
    const tableCheckbox = document.getElementById('new-exercise-use-table');
    const tableContainer = document.getElementById('new-exercise-table-container');
    tableCheckbox?.addEventListener('change', () => {
        tableContainer.classList.toggle('hidden', !tableCheckbox.checked);
    });

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

        let finalDescription = description || '';
        if (useTable && tableData && tableData.length > 0) {
            finalDescription = JSON.stringify({ type: 'table', data: tableData });
        }

        let imageUrl = null;
        if (imageFile) {
            try {
                // Bild vor dem Upload komprimieren
                let compressedImage = imageFile;
                try {
                    compressedImage = await compressImage(imageFile, { maxWidth: 1280, maxHeight: 1280, quality: 0.80 });
                } catch (e) {
                    console.warn('[Events] Image compression failed, uploading original:', e);
                }

                const fileName = `${Date.now()}_${compressedImage.name}`;
                // Upload zu R2 (mit Fallback zu Supabase)
                const uploadResult = await uploadToR2('exercise-images', compressedImage, {
                    subfolder: 'exercises',
                    filename: fileName
                });
                imageUrl = uploadResult.url;
            } catch (uploadError) {
                console.warn('[Events] Image upload failed:', uploadError);
            }
        }

        const tagsArray = tags ? tags.split(',').map(t => t.trim()).filter(t => t) : [];

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

        allExercises.push(newExercise);

        eventExercises.push({
            id: newExercise.id,
            name: newExercise.name,
            points: newExercise.points
        });

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
 * Öffnet Bestätigungsdialog zum Löschen einer Veranstaltung
 * @param {string} eventId - Event ID
 * @param {boolean} isRecurring - Wiederkehrende Veranstaltung
 * @param {string} occurrenceDate - Datum für wiederkehrende Events (YYYY-MM-DD)
 */
window.openDeleteEventModal = async function(eventId, isRecurring, occurrenceDate = null) {
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
    modal.className = 'fixed inset-0 bg-gray-800/75 flex items-center justify-center z-[100003] p-4';

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
 * Führt das Löschen einer Veranstaltung aus
 * @param {string} eventId - Event ID
 * @param {boolean} isRecurring - Wiederkehrende Veranstaltung
 * @param {string} occurrenceDate - Datum (YYYY-MM-DD)
 */
window.executeDeleteEvent = async function(eventId, isRecurring, occurrenceDate = '') {
    try {
        const deleteScope = isRecurring
            ? document.querySelector('input[name="delete-scope"]:checked')?.value || 'this'
            : 'this';
        const notifyParticipants = document.getElementById('delete-notify-participants')?.checked ?? true;

        // Event-Details laden for notification
        const { data: event, error: eventError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (eventError) throw eventError;

        const targetDate = occurrenceDate || event.start_date;

        let participantsToNotify = [];
        if (notifyParticipants) {
            const { data: invitations } = await supabase
                .from('event_invitations')
                .select('user_id')
                .eq('event_id', eventId);
            participantsToNotify = (invitations || []).map(i => i.user_id);
        }

        const formattedDate = new Date(targetDate + 'T12:00:00').toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });

        console.log(`[Events] Deleting event ${eventId}, scope: ${deleteScope}, isRecurring: ${isRecurring}`);

        if (deleteScope === 'this') {
            if (isRecurring && event.repeat_type) {
                // Wiederkehrendes Event: Datum zu excluded_dates hinzufügen
                const exclusions = event.excluded_dates || [];
                exclusions.push(targetDate);
                console.log(`[Events] Adding ${targetDate} to excluded_dates`);

                const { error: updateError } = await supabase
                    .from('events')
                    .update({ excluded_dates: exclusions })
                    .eq('id', eventId);

                if (updateError) {
                    console.error('[Events] Error updating excluded_dates:', updateError);
                    throw updateError;
                }
            } else {
                // Einmaliges Event: komplett löschen
                console.log('[Events] Deleting single event completely');

                // Punkte abziehen und Streaks verringern bevor Daten gelöscht werden
                try {
                    await revokeEventAttendancePoints(eventId, event);
                } catch (revokeError) {
                    console.warn('[Events] Error revoking points (continuing with delete):', revokeError);
                }

                const { error: invError } = await supabase.from('event_invitations').delete().eq('event_id', eventId);
                if (invError) console.warn('[Events] Error deleting invitations:', invError);

                const { error: attError } = await supabase.from('event_attendance').delete().eq('event_id', eventId);
                if (attError) console.warn('[Events] Error deleting attendance:', attError);

                // Löschen mit select() um zu prüfen ob wirklich gelöscht wurde
                const { data: deletedData, error: eventDelError } = await supabase
                    .from('events')
                    .delete()
                    .eq('id', eventId)
                    .select();

                if (eventDelError) {
                    console.error('[Events] Error deleting event:', eventDelError);
                    throw eventDelError;
                }

                // Prüfen ob wirklich gelöscht wurde (RLS könnte blockieren)
                if (!deletedData || deletedData.length === 0) {
                    console.error('[Events] Delete returned no data - RLS might be blocking. Checking if event still exists...');
                    const { data: checkEvent } = await supabase.from('events').select('id').eq('id', eventId).single();
                    if (checkEvent) {
                        throw new Error('Event konnte nicht gelöscht werden. Möglicherweise fehlen die Berechtigungen.');
                    }
                }

                console.log('[Events] Event deleted successfully, deleted:', deletedData);
            }
        } else if (deleteScope === 'future') {
            const previousDay = new Date(targetDate);
            previousDay.setDate(previousDay.getDate() - 1);
            const newEndDate = previousDay.toISOString().split('T')[0];
            console.log(`[Events] Setting repeat_end_date to ${newEndDate}`);

            const { error: updateError } = await supabase
                .from('events')
                .update({ repeat_end_date: newEndDate })
                .eq('id', eventId);

            if (updateError) {
                console.error('[Events] Error updating repeat_end_date:', updateError);
                throw updateError;
            }
        } else if (deleteScope === 'all') {
            console.log('[Events] Deleting all occurrences of recurring event');

            // Punkte abziehen und Streaks verringern bevor Daten gelöscht werden
            try {
                await revokeEventAttendancePoints(eventId, event);
            } catch (revokeError) {
                console.warn('[Events] Error revoking points (continuing with delete):', revokeError);
            }

            const { error: invError } = await supabase.from('event_invitations').delete().eq('event_id', eventId);
            if (invError) console.warn('[Events] Error deleting invitations:', invError);

            const { error: attError } = await supabase.from('event_attendance').delete().eq('event_id', eventId);
            if (attError) console.warn('[Events] Error deleting attendance:', attError);

            // Löschen mit select() um zu prüfen ob wirklich gelöscht wurde
            const { data: deletedData, error: eventDelError } = await supabase
                .from('events')
                .delete()
                .eq('id', eventId)
                .select();

            if (eventDelError) {
                console.error('[Events] Error deleting event:', eventDelError);
                throw eventDelError;
            }

            // Prüfen ob wirklich gelöscht wurde
            if (!deletedData || deletedData.length === 0) {
                console.error('[Events] Delete returned no data - RLS might be blocking');
                const { data: checkEvent } = await supabase.from('events').select('id').eq('id', eventId).single();
                if (checkEvent) {
                    throw new Error('Event konnte nicht gelöscht werden. Möglicherweise fehlen die Berechtigungen.');
                }
            }

            console.log('[Events] Recurring event deleted successfully');
        }

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

        document.getElementById('delete-event-modal')?.remove();
        document.getElementById('event-details-modal')?.remove();
        document.getElementById('event-day-modal')?.classList.add('hidden');

        const message = 'Veranstaltung wurde gelöscht' + (notifyParticipants ? ' und Teilnehmer benachrichtigt' : '');
        showToastMessage(message, 'success');

        // Kurze Verzögerung damit DB-Änderungen propagiert werden
        await new Promise(resolve => setTimeout(resolve, 300));

        console.log('[Events] Dispatching event-changed event to refresh calendar');
        window.dispatchEvent(new CustomEvent('event-changed', {
            detail: {
                type: 'delete',
                eventId,
                occurrenceDate: targetDate,
                deleteScope
            }
        }));
        console.log('[Events] Delete completed successfully');

    } catch (error) {
        console.error('[Events] Error deleting event:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
};

/**
 * Formatiert Zeit für HTML time input (HH:MM ohne Sekunden)
 * @param {string} timeStr - Zeit-String (kann HH:MM:SS oder HH:MM sein)
 * @returns {string} Formatierte Zeit (HH:MM)
 */
function formatTimeForInput(timeStr) {
    if (!timeStr) return '';
    // Nur die ersten 5 Zeichen nehmen (HH:MM)
    return timeStr.substring(0, 5);
}

/**
 * Öffnet Bearbeitungs-Modal für eine Veranstaltung
 * @param {string} eventId - Event ID
 */
window.openEditEventModal = async function(eventId) {
    try {
        // Event-Details laden
        const { data: event, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error) throw error;

        const isRecurring = !!event.repeat_type;

        // Zeiten für Input-Felder formatieren (ohne Sekunden)
        const meetingTimeFormatted = formatTimeForInput(event.meeting_time);
        const startTimeFormatted = formatTimeForInput(event.start_time);
        const endTimeFormatted = formatTimeForInput(event.end_time);

        const existingModal = document.getElementById('edit-event-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'edit-event-modal';
        modal.className = 'fixed inset-0 bg-gray-800/75 flex items-center justify-center z-[100003] p-4';

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
                            <input type="time" id="edit-event-meeting-time" value="${meetingTimeFormatted}"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Startzeit</label>
                            <input type="time" id="edit-event-start-time" value="${startTimeFormatted}"
                                   class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Endzeit</label>
                            <input type="time" id="edit-event-end-time" value="${endTimeFormatted}"
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
 * Speichert Änderungen an einer Veranstaltung
 * @param {string} eventId - Event ID
 * @param {boolean} isRecurring - Wiederkehrende Veranstaltung
 */
window.executeEditEvent = async function(eventId, isRecurring) {
    try {
        const editScope = isRecurring
            ? document.querySelector('input[name="edit-scope"]:checked')?.value || 'this'
            : 'all';
        const notifyParticipants = document.getElementById('edit-notify-participants')?.checked ?? true;

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

        const { data: originalEvent, error: loadError } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (loadError) throw loadError;

        let participantsToNotify = [];
        if (notifyParticipants) {
            const { data: invitations } = await supabase
                .from('event_invitations')
                .select('user_id')
                .eq('event_id', eventId);
            participantsToNotify = (invitations || []).map(i => i.user_id);
        }

        const updateData = {
            title,
            description: description || null,
            meeting_time: meetingTime || null,
            start_time: startTime || null,
            end_time: endTime || null,
            location: location || null,
            updated_at: new Date().toISOString()
        };

        if (startDate && startDate !== originalEvent.start_date) {
            if (editScope === 'this' && isRecurring) {
                const exclusions = originalEvent.excluded_dates || [];
                exclusions.push(originalEvent.start_date);

                await supabase
                    .from('events')
                    .update({ excluded_dates: exclusions })
                    .eq('id', eventId);

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

                    await supabase.from('event_invitations').upsert(newInvitations, {
                        onConflict: 'event_id,user_id,occurrence_date',
                        ignoreDuplicates: true
                    });
                }

            } else {
                updateData.start_date = startDate;
            }
        }

        if (editScope !== 'this' || !isRecurring || !startDate || startDate === originalEvent.start_date) {
            if (editScope === 'future' && isRecurring) {
                updateData.start_date = startDate || originalEvent.start_date;
            }

            const { error: updateError } = await supabase
                .from('events')
                .update(updateData)
                .eq('id', eventId);

            if (updateError) throw updateError;
        }

        const formattedDate = new Date((startDate || originalEvent.start_date) + 'T12:00:00').toLocaleDateString('de-DE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });

        if (notifyParticipants && participantsToNotify.length > 0) {
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

        document.getElementById('edit-event-modal')?.remove();
        document.getElementById('event-details-modal')?.remove();

        alert('Veranstaltung wurde aktualisiert' + (notifyParticipants ? ' und Teilnehmer benachrichtigt' : ''));

        window.dispatchEvent(new CustomEvent('event-changed', { detail: { type: 'update', eventId } }));

    } catch (error) {
        console.error('[Events] Error updating event:', error);
        alert('Fehler beim Speichern: ' + error.message);
    }
};

/**
 * Lädt und rendert anstehende Veranstaltungen für Trainer mit Rückmeldestatus
 * @param {string} containerId - Container-Element ID
 * @param {Object} userData - Benutzerdaten
 */
export async function loadUpcomingEventsForCoach(containerId, userData) {
    const container = document.getElementById(containerId);
    if (!container || !userData?.clubId) return;

    try {
        // Use local date to avoid timezone issues (toISOString uses UTC)
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 14);
        const endDate = `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;

        // Anstehende Events laden
        const { data: events, error } = await supabase
            .from('events')
            .select('*')
            .eq('club_id', userData.clubId)
            .gte('start_date', today)
            .lte('start_date', endDate)
            .or('cancelled.eq.false,cancelled.is.null')
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

        const eventIds = events.map(e => e.id);
        const { data: allInvitations } = await supabase
            .from('event_invitations')
            .select('event_id, status, user_id, decline_comment, profiles:user_id(first_name, last_name)')
            .in('event_id', eventIds);

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

                                <!-- Expandable Details -->
                                <div class="mt-3 pt-3 border-t space-y-2">
                                    ${responses.accepted.length > 0 ? `
                                    <div>
                                        <button class="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')">
                                            <svg class="w-3 h-3 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                            </svg>
                                            Zusagen anzeigen (${responses.accepted.length})
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

                                    ${responses.rejected.length > 0 ? `
                                    <div>
                                        <button class="text-xs text-red-600 hover:text-red-800 font-medium flex items-center gap-1" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')">
                                            <svg class="w-3 h-3 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                            </svg>
                                            Absagen anzeigen (${responses.rejected.length})
                                        </button>
                                        <div class="hidden mt-2 space-y-1">
                                            ${responses.rejected.map(inv => {
                                                const name = `${inv.profiles?.first_name || ''} ${inv.profiles?.last_name || ''}`.trim();
                                                return `
                                                <div>
                                                    <span class="px-2 py-0.5 bg-red-50 text-red-700 text-xs rounded-full inline-block">
                                                        ${name}
                                                    </span>
                                                    ${inv.decline_comment ? `
                                                    <p class="text-xs text-gray-500 ml-2 mt-0.5 italic">"${inv.decline_comment}"</p>
                                                    ` : ''}
                                                </div>`;
                                            }).join('')}
                                        </div>
                                    </div>
                                    ` : ''}

                                    ${responses.pending.length > 0 ? `
                                    <div class="flex items-center justify-between">
                                        <button class="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1" onclick="event.stopPropagation(); this.parentElement.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-180')">
                                            <svg class="w-3 h-3 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                            </svg>
                                            Ausstehend anzeigen (${responses.pending.length})
                                        </button>
                                        <button onclick="event.stopPropagation(); window.sendEventReminder('${event.id}', '${event.start_date}')" class="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1 px-2 py-1 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                                            </svg>
                                            Erinnern
                                        </button>
                                    </div>
                                    <div class="hidden mt-2 flex flex-wrap gap-1">
                                        ${responses.pending.map(inv => `
                                            <span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                                ${inv.profiles?.first_name || ''} ${inv.profiles?.last_name || ''}
                                            </span>
                                        `).join('')}
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

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
                    loadUpcomingEventsForCoach(containerId, userData);
                }
            )
            .subscribe();

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
                    loadUpcomingEventsForCoach(containerId, userData);
                }
            )
            .subscribe();

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

/**
 * Berechnet Streaks rückwirkend für alle Spieler eines Clubs
 * Berücksichtigt occurrence_date für wiederkehrende Events
 */
window.recalculateStreaksRetroactively = async function(clubId) {
    if (!clubId) {
        alert('Keine Club-ID angegeben');
        return;
    }

    console.log('[Streaks] Starting retroactive streak calculation for club:', clubId);

    try {
        // 1. Alle Trainings-Events laden
        const { data: trainingEvents, error: eventsError } = await supabase
            .from('events')
            .select('id, title, start_date, target_type, target_subgroup_ids, event_category')
            .eq('club_id', clubId)
            .eq('event_category', 'training');

        if (eventsError) throw eventsError;
        console.log('[Streaks] Found', trainingEvents?.length || 0, 'training events');

        if (!trainingEvents || trainingEvents.length === 0) {
            alert('Keine Trainings gefunden');
            return;
        }

        // 2. Alle Attendance-Daten laden (mit occurrence_date für wiederkehrende Events!)
        const eventIds = trainingEvents.map(e => e.id);
        const { data: attendanceData, error: attError } = await supabase
            .from('event_attendance')
            .select('event_id, present_user_ids, points_awarded_to, occurrence_date')
            .in('event_id', eventIds);

        if (attError) throw attError;
        console.log('[Streaks] Found', attendanceData?.length || 0, 'attendance records');

        // Map Event-ID -> Event-Daten
        const eventMap = new Map();
        trainingEvents.forEach(e => eventMap.set(e.id, e));

        // Attendance-Daten mit tatsächlichem Datum anreichern und sortieren
        // WICHTIG: Auch Records mit leeren present_user_ids einbeziehen (alle waren abwesend)
        const allAttendances = (attendanceData || []).map(a => {
            const event = eventMap.get(a.event_id);
            return {
                ...a,
                event,
                actualDate: a.occurrence_date || event?.start_date,
                subgroupIds: event?.target_subgroup_ids || [],
                present_user_ids: a.present_user_ids || []
            };
        }).filter(a => a.actualDate) // Nur gültige Daten
          .sort((a, b) => a.actualDate.localeCompare(b.actualDate)); // Chronologisch sortieren

        console.log('[Streaks] Sorted attendance records:', allAttendances.length);

        // 3. Alle Spieler im Club laden
        const { data: players, error: playersError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, subgroup_ids')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach', 'head_coach']);

        if (playersError) throw playersError;
        console.log('[Streaks] Found', players?.length || 0, 'players');

        // 4. Hauptgruppe für Club-weite Trainings finden
        const { data: hauptgruppe } = await supabase
            .from('subgroups')
            .select('id, name')
            .eq('club_id', clubId)
            .eq('is_default', true)
            .limit(1)
            .maybeSingle();

        const fallbackSubgroupId = hauptgruppe?.id;
        if (fallbackSubgroupId) {
            console.log('[Streaks] Using Hauptgruppe:', hauptgruppe.name);
        }

        // 5. Alle existierenden Streaks löschen (clean slate)
        await supabase
            .from('streaks')
            .delete()
            .in('user_id', players.map(p => p.id));
        console.log('[Streaks] Cleared existing streaks');

        // 6. Für jeden Spieler Streaks berechnen
        let playersUpdated = 0;
        const streakResults = [];

        for (const player of players || []) {
            const playerSubgroups = player.subgroup_ids || [];

            // Streak pro Untergruppe berechnen
            const subgroupStreaks = new Map();

            for (const attendance of allAttendances) {
                // Prüfen ob der Spieler zu diesem Training eingeladen war
                const eventSubgroups = attendance.subgroupIds;
                const isClubWide = eventSubgroups.length === 0;
                const wasInvited = isClubWide || eventSubgroups.some(sg => playerSubgroups.includes(sg));

                if (!wasInvited) continue;

                // Untergruppe für Streak-Tracking bestimmen
                let subgroupId = eventSubgroups[0];
                if (!subgroupId && fallbackSubgroupId) {
                    subgroupId = fallbackSubgroupId;
                }
                if (!subgroupId) continue;

                // Prüfen ob Spieler anwesend war
                const wasPresent = attendance.present_user_ids.includes(player.id);

                if (!subgroupStreaks.has(subgroupId)) {
                    subgroupStreaks.set(subgroupId, { currentStreak: 0, lastAttendedDate: null });
                }

                const streakData = subgroupStreaks.get(subgroupId);

                if (wasPresent) {
                    streakData.currentStreak++;
                    streakData.lastAttendedDate = attendance.actualDate;
                } else {
                    // Spieler war nicht da → Streak auf 0 zurücksetzen
                    streakData.currentStreak = 0;
                    streakData.lastAttendedDate = null;
                }
            }

            // Streaks in DB speichern (nur > 0)
            for (const [subgroupId, streakData] of subgroupStreaks) {
                if (streakData.currentStreak > 0) {
                    const { error: upsertError } = await supabase
                        .from('streaks')
                        .upsert({
                            user_id: player.id,
                            subgroup_id: subgroupId,
                            current_streak: streakData.currentStreak,
                            last_attendance_date: streakData.lastAttendedDate,
                            updated_at: new Date().toISOString()
                        }, {
                            onConflict: 'user_id,subgroup_id'
                        });

                    if (!upsertError) {
                        playersUpdated++;
                        streakResults.push({
                            player: `${player.first_name} ${player.last_name}`,
                            subgroupId,
                            streak: streakData.currentStreak
                        });
                    }
                }
            }
        }

        alert(`Streaks neu berechnet!\n${playersUpdated} Spieler-Streaks aktualisiert.`);
        console.log('[Streaks] Calculation complete. Players updated:', playersUpdated);

    } catch (error) {
        console.error('[Streaks] Error recalculating streaks:', error);
        alert('Fehler bei der Streak-Berechnung: ' + error.message);
    }
};

export { closeAllModals };
