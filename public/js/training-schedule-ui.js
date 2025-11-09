/**
 * Training Schedule UI Management
 * Handles the UI for recurring training templates and training sessions
 */

import {
    collection,
    doc,
    getDocs,
    query,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

import {
    createRecurringTemplate,
    getRecurringTemplates,
    updateRecurringTemplate,
    deleteRecurringTemplate,
    createTrainingSession,
    getSessionsForDate,
    cancelTrainingSession,
    deleteTrainingSession,
    generateSessionsFromTemplates,
    getDayOfWeekName,
    formatTimeRange,
    initializeTrainingSchedule as initTrainingScheduleModule
} from './training-schedule.js';

let db = null;
let currentUserData = null;
let subgroups = [];
let recurringTemplates = [];

/**
 * Initialize minimal functionality for spontaneous sessions only
 * @param {Object} userData - Current user data
 * @param {Object} firestoreInstance - Firestore database instance
 */
export function initializeSpontaneousSessions(userData, firestoreInstance) {
    db = firestoreInstance;
    initTrainingScheduleModule(firestoreInstance);
    currentUserData = userData;

    // Load subgroups for dropdown
    loadSubgroups();

    // Setup event listeners
    setupEventListeners();
}

/**
 * Initialize the training schedule UI (full version with recurring trainings)
 * @param {Object} userData - Current user data
 * @param {Object} firestoreInstance - Firestore database instance
 */
export function initializeTrainingSchedule(userData, firestoreInstance) {
    db = firestoreInstance;
    initTrainingScheduleModule(firestoreInstance);
    currentUserData = userData;

    // Load subgroups
    loadSubgroups();

    // Setup event listeners
    setupEventListeners();

    // Load recurring templates when schedule tab is opened
    const scheduleTab = document.querySelector('[data-tab="schedule"]');
    if (scheduleTab) {
        scheduleTab.addEventListener('click', () => {
            loadRecurringTemplates();
        });
    }
}

/**
 * Load subgroups for dropdowns
 */
async function loadSubgroups() {
    try {
        const q = query(
            collection(db, 'subgroups'),
            where('clubId', '==', currentUserData.clubId),
            orderBy('name', 'asc')
        );

        const snapshot = await getDocs(q);
        subgroups = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Populate dropdowns
        populateSubgroupDropdowns();
    } catch (error) {
        console.error('Error loading subgroups:', error);
        showFeedback('recurring-training-feedback', 'Fehler beim Laden der Untergruppen', 'error');
    }
}

/**
 * Populate subgroup dropdowns
 */
function populateSubgroupDropdowns() {
    const dropdowns = [
        document.getElementById('recurring-training-subgroup-select'),
        document.getElementById('spontaneous-session-subgroup-select')
    ];

    dropdowns.forEach(dropdown => {
        if (!dropdown) return;

        // Clear existing options (keep first "Bitte wählen" option)
        dropdown.innerHTML = '<option value="">Bitte wählen...</option>';

        // Add subgroup options
        subgroups.forEach(subgroup => {
            const option = document.createElement('option');
            option.value = subgroup.id;
            option.textContent = subgroup.name;
            dropdown.appendChild(option);
        });
    });
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Add recurring training button
    const addBtn = document.getElementById('add-recurring-training-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openRecurringTrainingModal);
    }

    // Recurring training form
    const recurringForm = document.getElementById('recurring-training-form');
    if (recurringForm) {
        recurringForm.addEventListener('submit', handleRecurringTrainingSubmit);
    }

    // Cancel buttons
    const cancelBtns = [
        document.getElementById('cancel-recurring-training-button'),
        document.getElementById('close-recurring-training-modal-button')
    ];
    cancelBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', closeRecurringTrainingModal);
    });

    // Spontaneous session form
    const spontaneousForm = document.getElementById('spontaneous-session-form');
    if (spontaneousForm) {
        spontaneousForm.addEventListener('submit', handleSpontaneousSessionSubmit);
    }

    // Spontaneous session cancel buttons
    const spontaneousCancelBtns = [
        document.getElementById('cancel-spontaneous-session-button'),
        document.getElementById('close-spontaneous-session-modal-button')
    ];
    spontaneousCancelBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', closeSpontaneousSessionModal);
    });

    // Session selection modal close
    const closeSessionSelectionBtn = document.getElementById('close-session-selection-modal-button');
    if (closeSessionSelectionBtn) {
        closeSessionSelectionBtn.addEventListener('click', closeSessionSelectionModal);
    }

    // Add spontaneous session from session selection modal
    const addSpontaneousBtn = document.getElementById('add-spontaneous-session-button');
    if (addSpontaneousBtn) {
        addSpontaneousBtn.addEventListener('click', () => {
            closeSessionSelectionModal();
            const dateDisplay = document.getElementById('session-selection-date');
            const dateStr = dateDisplay.getAttribute('data-date') || dateDisplay.textContent;
            openSpontaneousSessionModal(dateStr);
        });
    }
}

/**
 * Load and display recurring templates
 */
export async function loadRecurringTemplates() {
    try {
        const templates = await getRecurringTemplates(currentUserData.clubId);
        recurringTemplates = templates;
        renderRecurringTemplates(templates);
    } catch (error) {
        console.error('Error loading recurring templates:', error);
        showFeedback('recurring-training-feedback', 'Fehler beim Laden der Trainings', 'error');
    }
}

/**
 * Render recurring templates in the list
 */
function renderRecurringTemplates(templates) {
    const listContainer = document.getElementById('recurring-trainings-list');
    const noTemplatesMessage = document.getElementById('no-trainings-message');

    if (!listContainer) return;

    if (templates.length === 0) {
        listContainer.innerHTML = '';
        if (noTemplatesMessage) noTemplatesMessage.classList.remove('hidden');
        return;
    }

    if (noTemplatesMessage) noTemplatesMessage.classList.add('hidden');

    // Group by day of week
    const grouped = {};
    templates.forEach(template => {
        if (!grouped[template.dayOfWeek]) {
            grouped[template.dayOfWeek] = [];
        }
        grouped[template.dayOfWeek].push(template);
    });

    // Render grouped templates
    let html = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(dayOfWeek => { // Monday to Sunday
        if (!grouped[dayOfWeek]) return;

        grouped[dayOfWeek].forEach(template => {
            const subgroup = subgroups.find(s => s.id === template.subgroupId);
            const subgroupName = subgroup ? subgroup.name : 'Unbekannt';

            html += `
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 flex justify-between items-center hover:bg-gray-100 transition">
                    <div class="flex items-center space-x-4">
                        <div class="bg-indigo-100 text-indigo-600 rounded-full w-12 h-12 flex items-center justify-center font-bold">
                            ${getDayOfWeekName(template.dayOfWeek).substring(0, 2)}
                        </div>
                        <div>
                            <h3 class="font-semibold text-gray-900">${subgroupName}</h3>
                            <p class="text-sm text-gray-600">
                                <i class="fas fa-clock mr-1"></i>
                                ${formatTimeRange(template.startTime, template.endTime)}
                            </p>
                            <p class="text-xs text-gray-500">
                                ${getDayOfWeekName(template.dayOfWeek)}
                                ${template.endDate ? ` bis ${formatDate(template.endDate)}` : ''}
                            </p>
                        </div>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="window.editRecurringTemplate('${template.id}')" class="text-blue-600 hover:text-blue-800 px-3 py-1 rounded-md hover:bg-blue-50 transition">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button onclick="window.deleteRecurringTemplateConfirm('${template.id}')" class="text-red-600 hover:text-red-800 px-3 py-1 rounded-md hover:bg-red-50 transition">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });
    });

    listContainer.innerHTML = html;
}

/**
 * Open recurring training modal
 */
function openRecurringTrainingModal(templateId = null) {
    const modal = document.getElementById('recurring-training-modal');
    const title = document.getElementById('recurring-training-modal-title');
    const form = document.getElementById('recurring-training-form');
    const idInput = document.getElementById('recurring-training-id-input');

    if (!modal || !form) return;

    // Reset form
    form.reset();
    idInput.value = '';

    // Set today as default start date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('recurring-training-start-date').value = today;

    if (templateId) {
        // Edit mode
        const template = recurringTemplates.find(t => t.id === templateId);
        if (template) {
            title.textContent = 'Wiederkehrendes Training bearbeiten';
            idInput.value = template.id;
            document.getElementById('recurring-training-day-select').value = template.dayOfWeek;
            document.getElementById('recurring-training-start-time').value = template.startTime;
            document.getElementById('recurring-training-end-time').value = template.endTime;
            document.getElementById('recurring-training-subgroup-select').value = template.subgroupId;
            document.getElementById('recurring-training-start-date').value = template.startDate;
            document.getElementById('recurring-training-end-date').value = template.endDate || '';
        }
    } else {
        // Create mode
        title.textContent = 'Wiederkehrendes Training erstellen';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Close recurring training modal
 */
function closeRecurringTrainingModal() {
    const modal = document.getElementById('recurring-training-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearFeedback('recurring-training-feedback');
}

/**
 * Handle recurring training form submission
 */
async function handleRecurringTrainingSubmit(e) {
    e.preventDefault();

    const templateId = document.getElementById('recurring-training-id-input').value;
    const dayOfWeek = parseInt(document.getElementById('recurring-training-day-select').value);
    const startTime = document.getElementById('recurring-training-start-time').value;
    const endTime = document.getElementById('recurring-training-end-time').value;
    const subgroupId = document.getElementById('recurring-training-subgroup-select').value;
    const startDate = document.getElementById('recurring-training-start-date').value;
    const endDate = document.getElementById('recurring-training-end-date').value || null;

    try {
        showFeedback('recurring-training-feedback', 'Speichere...', 'info');

        if (templateId) {
            // Update existing template
            await updateRecurringTemplate(templateId, {
                dayOfWeek,
                startTime,
                endTime,
                subgroupId,
                startDate,
                endDate
            });
            showFeedback('recurring-training-feedback', 'Training aktualisiert!', 'success');
        } else {
            // Create new template
            await createRecurringTemplate({
                dayOfWeek,
                startTime,
                endTime,
                subgroupId,
                clubId: currentUserData.clubId,
                startDate,
                endDate
            }, currentUserData.id);
            showFeedback('recurring-training-feedback', 'Training erstellt!', 'success');
        }

        // Reload templates
        await loadRecurringTemplates();

        // Generate sessions for next 14 days
        const today = new Date().toISOString().split('T')[0];
        const endDateGenerate = new Date();
        endDateGenerate.setDate(endDateGenerate.getDate() + 14);
        await generateSessionsFromTemplates(
            currentUserData.clubId,
            today,
            endDateGenerate.toISOString().split('T')[0]
        );

        setTimeout(() => {
            closeRecurringTrainingModal();
        }, 1500);
    } catch (error) {
        console.error('Error saving recurring template:', error);
        showFeedback('recurring-training-feedback', error.message, 'error');
    }
}

/**
 * Delete recurring template with confirmation
 */
window.deleteRecurringTemplateConfirm = async function(templateId) {
    if (!confirm('Möchten Sie dieses wiederkehrende Training wirklich löschen? Bereits erstellte Sessions bleiben erhalten.')) {
        return;
    }

    try {
        await deleteRecurringTemplate(templateId);
        await loadRecurringTemplates();
    } catch (error) {
        console.error('Error deleting template:', error);
        alert('Fehler beim Löschen: ' + error.message);
    }
};

/**
 * Edit recurring template
 */
window.editRecurringTemplate = function(templateId) {
    openRecurringTrainingModal(templateId);
};

/**
 * Open session selection modal for a specific date
 * @param {string} dateStr - Date in YYYY-MM-DD format
 */
export async function openSessionSelectionModal(dateStr) {
    const modal = document.getElementById('session-selection-modal');
    const dateDisplay = document.getElementById('session-selection-date');
    const listContainer = document.getElementById('session-selection-list');

    if (!modal || !listContainer) return;

    dateDisplay.textContent = formatDateGerman(dateStr);

    try {
        const sessions = await getSessionsForDate(currentUserData.clubId, dateStr);

        if (sessions.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 text-center py-4">Keine Trainings an diesem Tag</p>';
        } else {
            renderSessionList(sessions, listContainer, dateStr);
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        console.error('Error loading sessions:', error);
        alert('Fehler beim Laden der Trainings');
    }
}

/**
 * Render session list in selection modal
 */
function renderSessionList(sessions, container, dateStr) {
    let html = '';

    sessions.forEach(session => {
        const subgroup = subgroups.find(s => s.id === session.subgroupId);
        const subgroupName = subgroup ? subgroup.name : 'Unbekannt';

        html += `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-semibold text-gray-900">${subgroupName}</h4>
                        <p class="text-sm text-gray-600">
                            <i class="fas fa-clock mr-1"></i>
                            ${formatTimeRange(session.startTime, session.endTime)}
                        </p>
                    </div>
                    <button onclick="window.handleCancelSession('${session.id}')" class="text-red-600 hover:text-red-800 text-sm">
                        <i class="fas fa-times mr-1"></i> Absagen
                    </button>
                </div>
                <button onclick="window.handleOpenAttendanceForSession('${session.id}', '${dateStr}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg mt-2">
                    Anwesenheit erfassen
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Close session selection modal
 */
function closeSessionSelectionModal() {
    const modal = document.getElementById('session-selection-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Cancel a training session
 */
window.handleCancelSession = async function(sessionId) {
    if (!confirm('Möchten Sie dieses Training wirklich absagen?')) {
        return;
    }

    try {
        await cancelTrainingSession(sessionId);

        // Reload the modal
        const dateStr = document.getElementById('session-selection-date').textContent;
        await openSessionSelectionModal(dateStr);
    } catch (error) {
        console.error('Error canceling session:', error);
        alert('Fehler beim Absagen: ' + error.message);
    }
};

/**
 * Open attendance modal for specific session
 * This will be handled by attendance.js
 */
window.handleOpenAttendanceForSession = async function(sessionId, dateStr) {
    // Call the attendance function FIRST (it loads data)
    if (typeof window.openAttendanceForSessionFromSchedule === 'function') {
        await window.openAttendanceForSessionFromSchedule(sessionId, dateStr);
    }

    // THEN close the session selection modal (no delay!)
    closeSessionSelectionModal();
};

/**
 * Open spontaneous session modal
 */
function openSpontaneousSessionModal(dateStr = null) {
    const modal = document.getElementById('spontaneous-session-modal');
    const form = document.getElementById('spontaneous-session-form');
    const dateInput = document.getElementById('spontaneous-session-date-display');

    if (!modal || !form) return;

    form.reset();

    if (dateStr) {
        dateInput.value = dateStr;
    } else {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Close spontaneous session modal
 */
function closeSpontaneousSessionModal() {
    const modal = document.getElementById('spontaneous-session-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearFeedback('spontaneous-session-feedback');
}

/**
 * Handle spontaneous session form submission
 */
async function handleSpontaneousSessionSubmit(e) {
    e.preventDefault();

    const date = document.getElementById('spontaneous-session-date-display').value;
    const startTime = document.getElementById('spontaneous-session-start-time').value;
    const endTime = document.getElementById('spontaneous-session-end-time').value;
    const subgroupId = document.getElementById('spontaneous-session-subgroup-select').value;

    try {
        showFeedback('spontaneous-session-feedback', 'Erstelle Training...', 'info');

        const sessionId = await createTrainingSession({
            date,
            startTime,
            endTime,
            subgroupId,
            clubId: currentUserData.clubId,
            recurringTemplateId: null
        }, currentUserData.id);

        showFeedback('spontaneous-session-feedback', 'Training erstellt! Öffne Anwesenheit...', 'success');

        setTimeout(() => {
            closeSpontaneousSessionModal();

            // Automatically open attendance modal for the newly created session
            if (typeof window.openAttendanceForSessionFromSchedule === 'function') {
                window.openAttendanceForSessionFromSchedule(sessionId, date);
            }
        }, 500);
    } catch (error) {
        console.error('Error creating spontaneous session:', error);
        showFeedback('spontaneous-session-feedback', error.message, 'error');
    }
}

/**
 * Show feedback message
 */
function showFeedback(elementId, message, type) {
    const feedbackElement = document.getElementById(elementId);
    if (!feedbackElement) return;

    feedbackElement.textContent = message;
    feedbackElement.className = 'mt-3 text-sm font-medium text-center';

    if (type === 'success') {
        feedbackElement.classList.add('text-green-600');
    } else if (type === 'error') {
        feedbackElement.classList.add('text-red-600');
    } else {
        feedbackElement.classList.add('text-gray-600');
    }
}

/**
 * Clear feedback message
 */
function clearFeedback(elementId) {
    const feedbackElement = document.getElementById(elementId);
    if (feedbackElement) {
        feedbackElement.textContent = '';
    }
}

/**
 * Format date for display (DD.MM.YYYY)
 */
function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
    return formatDateGerman(dateStr);
}

// ============================================================================
// WINDOW FUNCTIONS (called from attendance.js)
// ============================================================================

/**
 * Open session selection modal from calendar click
 * Called by attendance.js when multiple sessions exist on a day
 */
window.openSessionSelectionModalFromCalendar = async function(dateStr, sessions) {
    const modal = document.getElementById('session-selection-modal');
    const dateDisplay = document.getElementById('session-selection-date');
    const listContainer = document.getElementById('session-selection-list');

    if (!modal || !listContainer) return;

    // Store both formatted date (for display) and original date (for programmatic access)
    dateDisplay.textContent = formatDateGerman(dateStr);
    dateDisplay.setAttribute('data-date', dateStr);

    // Render session list
    let html = '';
    sessions.forEach(session => {
        const subgroup = subgroups.find(s => s.id === session.subgroupId);
        const subgroupName = subgroup ? subgroup.name : 'Unbekannt';

        html += `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-semibold text-gray-900">${subgroupName}</h4>
                        <p class="text-sm text-gray-600">
                            <i class="fas fa-clock mr-1"></i>
                            ${formatTimeRange(session.startTime, session.endTime)}
                        </p>
                    </div>
                    <button onclick="window.handleCancelSessionFromModal('${session.id}')" class="text-red-600 hover:text-red-800 text-sm">
                        <i class="fas fa-times mr-1"></i> Absagen
                    </button>
                </div>
                <button onclick="window.handleSelectSessionForAttendance('${session.id}', '${dateStr}')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg mt-2">
                    Anwesenheit erfassen
                </button>
            </div>
        `;
    });

    listContainer.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

/**
 * Handle session selection for attendance
 */
window.handleSelectSessionForAttendance = async function(sessionId, dateStr) {
    closeSessionSelectionModal();

    // Call the attendance module to open the modal for this session
    if (typeof window.openAttendanceForSessionFromSchedule === 'function') {
        await window.openAttendanceForSessionFromSchedule(sessionId, dateStr);
    }
};

/**
 * Handle adding another training from the session selection modal
 */
window.handleAddAnotherTrainingFromModal = function(dateStr) {
    closeSessionSelectionModal();
    window.openSpontaneousSessionModalFromCalendar(dateStr);
};

/**
 * Cancel a session from the selection modal
 */
window.handleCancelSessionFromModal = async function(sessionId) {
    if (!confirm('Möchten Sie dieses Training wirklich absagen?')) {
        return;
    }

    try {
        await cancelTrainingSession(sessionId);

        // Reload the current modal
        const dateDisplay = document.getElementById('session-selection-date');
        const dateStr = dateDisplay.getAttribute('data-date') || parseDateGerman(dateDisplay.textContent);
        if (dateStr) {
            const sessions = await getSessionsForDate(currentUserData.clubId, dateStr);
            window.openSessionSelectionModalFromCalendar(dateStr, sessions);
        }
    } catch (error) {
        console.error('Error canceling session:', error);
        alert('Fehler beim Absagen: ' + error.message);
    }
};

/**
 * Open spontaneous session modal from calendar
 */
window.openSpontaneousSessionModalFromCalendar = function(dateStr) {
    openSpontaneousSessionModal(dateStr);
};

/**
 * Helper: Parse German date format back to YYYY-MM-DD
 */
function parseDateGerman(dateStr) {
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
}
