/** Trainingsplan-UI (Supabase-Version) - UI für wiederkehrende Vorlagen und Sessions */

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
    initializeTrainingSchedule as initTrainingScheduleModule,
} from './training-schedule-supabase.js';

import {
    initializeSessionPlanning,
    loadExercisesForSelection,
    getPlannedExercises,
    resetSessionPlanning,
    initializeSessionPlanningListeners,
} from './session-planning-supabase.js';

let supabaseClient = null;
let currentUserData = null;
let subgroups = [];
let recurringTemplates = [];

/** Initialisiert minimale Funktionalität nur für Spontan-Sessions */
export function initializeSpontaneousSessions(userData, supabaseInstance) {
    supabaseClient = supabaseInstance;
    initTrainingScheduleModule(supabaseInstance);
    initializeSessionPlanning(supabaseInstance);
    currentUserData = userData;

    loadSubgroups();
    setupEventListeners();
    initializeSessionPlanningListeners();
    loadExercisesForSelection(supabaseInstance);
}

/** Initialisiert die Trainingsplan-UI (Vollversion mit wiederkehrenden Trainings) */
export function initializeTrainingSchedule(userData, supabaseInstance) {
    supabaseClient = supabaseInstance;
    initTrainingScheduleModule(supabaseInstance);
    currentUserData = userData;

    loadSubgroups();
    setupEventListeners();

    const scheduleTab = document.querySelector('[data-tab="schedule"]');
    if (scheduleTab) {
        scheduleTab.addEventListener('click', () => {
            loadRecurringTemplates();
        });
    }
}

async function loadSubgroups() {
    try {
        const { data, error } = await supabaseClient
            .from('subgroups')
            .select('*')
            .eq('club_id', currentUserData.clubId)
            .order('name', { ascending: true });

        if (error) throw error;

        subgroups = (data || []).map(sg => ({
            id: sg.id,
            name: sg.name,
            clubId: sg.club_id,
            isDefault: sg.is_default
        }));

        populateSubgroupDropdowns();
    } catch (error) {
        console.error('Error loading subgroups:', error);
        showFeedback('recurring-training-feedback', 'Fehler beim Laden der Untergruppen', 'error');
    }
}

function populateSubgroupDropdowns() {
    const dropdowns = [
        document.getElementById('recurring-training-subgroup-select'),
        document.getElementById('spontaneous-session-subgroup-select'),
    ];

    dropdowns.forEach(dropdown => {
        if (!dropdown) return;
        dropdown.innerHTML = '<option value="">Bitte wählen...</option>';
        subgroups.forEach(subgroup => {
            const option = document.createElement('option');
            option.value = subgroup.id;
            option.textContent = subgroup.name;
            dropdown.appendChild(option);
        });
    });
}

function setupEventListeners() {
    const addBtn = document.getElementById('add-recurring-training-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openRecurringTrainingModal);
    }

    const recurringForm = document.getElementById('recurring-training-form');
    if (recurringForm) {
        recurringForm.addEventListener('submit', handleRecurringTrainingSubmit);
    }

    const cancelBtns = [
        document.getElementById('cancel-recurring-training-button'),
        document.getElementById('close-recurring-training-modal-button'),
    ];
    cancelBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', closeRecurringTrainingModal);
    });

    const spontaneousForm = document.getElementById('spontaneous-session-form');
    if (spontaneousForm) {
        spontaneousForm.addEventListener('submit', handleSpontaneousSessionSubmit);
    }

    const spontaneousCancelBtns = [
        document.getElementById('cancel-spontaneous-session-button'),
        document.getElementById('close-spontaneous-session-modal-button'),
    ];
    spontaneousCancelBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', closeSpontaneousSessionModal);
    });

    const toggleExercisePlanningBtn = document.getElementById('toggle-exercise-planning-button');
    if (toggleExercisePlanningBtn) {
        toggleExercisePlanningBtn.addEventListener('click', toggleExercisePlanningSection);
    }

    const closeSessionSelectionBtn = document.getElementById(
        'close-session-selection-modal-button'
    );
    if (closeSessionSelectionBtn) {
        closeSessionSelectionBtn.addEventListener('click', closeSessionSelectionModal);
    }

    const addSpontaneousBtn = document.getElementById('add-spontaneous-session-button');
    if (addSpontaneousBtn) {
        addSpontaneousBtn.addEventListener('click', () => {
            closeSessionSelectionModal();
            const dateDisplay = document.getElementById('session-selection-date');
            const dateStr = dateDisplay.getAttribute('data-date') || dateDisplay.textContent;
            openSpontaneousSessionModal(dateStr);
        });
    }

    const closeTrainingInfoBtns = [
        document.getElementById('close-training-info-modal-button'),
        document.getElementById('close-training-info-button'),
    ];
    closeTrainingInfoBtns.forEach(btn => {
        if (btn) btn.addEventListener('click', closeTrainingInfoModal);
    });

    window.addEventListener('trainingCompleted', async event => {
        const dateDisplay = document.getElementById('session-selection-date');
        const dateStr = dateDisplay?.getAttribute('data-date');

        if (dateStr) {
            try {
                const sessions = await getSessionsForDate(currentUserData.clubId, dateStr, true);
                window.openSessionSelectionModalFromCalendar(dateStr, sessions);
            } catch (error) {
                console.error('Error reloading sessions after completion:', error);
                closeSessionSelectionModal();
            }
        } else {
            closeSessionSelectionModal();
        }
    });
}

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

    const grouped = {};
    templates.forEach(template => {
        if (!grouped[template.dayOfWeek]) {
            grouped[template.dayOfWeek] = [];
        }
        grouped[template.dayOfWeek].push(template);
    });

    let html = '';
    [1, 2, 3, 4, 5, 6, 0].forEach(dayOfWeek => {
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

function openRecurringTrainingModal(templateId = null) {
    const modal = document.getElementById('recurring-training-modal');
    const title = document.getElementById('recurring-training-modal-title');
    const form = document.getElementById('recurring-training-form');
    const idInput = document.getElementById('recurring-training-id-input');

    if (!modal || !form) return;

    form.reset();
    idInput.value = '';

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('recurring-training-start-date').value = today;

    if (templateId) {
        const template = recurringTemplates.find(t => t.id === templateId);
        if (template) {
            title.textContent = 'Wiederkehrendes Training bearbeiten';
            idInput.value = template.id;
            document.getElementById('recurring-training-day-select').value = template.dayOfWeek;
            document.getElementById('recurring-training-start-time').value = template.startTime;
            document.getElementById('recurring-training-end-time').value = template.endTime;
            document.getElementById('recurring-training-subgroup-select').value =
                template.subgroupId;
            document.getElementById('recurring-training-start-date').value = template.startDate;
            document.getElementById('recurring-training-end-date').value = template.endDate || '';
        }
    } else {
        title.textContent = 'Wiederkehrendes Training erstellen';
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeRecurringTrainingModal() {
    const modal = document.getElementById('recurring-training-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearFeedback('recurring-training-feedback');
}

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
            await updateRecurringTemplate(templateId, {
                dayOfWeek,
                startTime,
                endTime,
                subgroupId,
                startDate,
                endDate,
            });
            showFeedback('recurring-training-feedback', 'Training aktualisiert!', 'success');
        } else {
            await createRecurringTemplate(
                {
                    dayOfWeek,
                    startTime,
                    endTime,
                    subgroupId,
                    clubId: currentUserData.clubId,
                    startDate,
                    endDate,
                },
                currentUserData.id
            );
            showFeedback('recurring-training-feedback', 'Training erstellt!', 'success');
        }

        await loadRecurringTemplates();

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

window.deleteRecurringTemplateConfirm = async function (templateId) {
    if (
        !confirm(
            'Möchten Sie dieses wiederkehrende Training wirklich löschen? Bereits erstellte Sessions bleiben erhalten.'
        )
    ) {
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

window.editRecurringTemplate = function (templateId) {
    openRecurringTrainingModal(templateId);
};

export async function openSessionSelectionModal(dateStr) {
    const modal = document.getElementById('session-selection-modal');
    const dateDisplay = document.getElementById('session-selection-date');
    const listContainer = document.getElementById('session-selection-list');

    if (!modal || !listContainer) return;

    dateDisplay.textContent = formatDateGerman(dateStr);

    try {
        const sessions = await getSessionsForDate(currentUserData.clubId, dateStr);

        if (sessions.length === 0) {
            listContainer.innerHTML =
                '<p class="text-gray-500 text-center py-4">Keine Trainings an diesem Tag</p>';
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

function closeSessionSelectionModal() {
    const modal = document.getElementById('session-selection-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

window.handleCancelSession = async function (sessionId) {
    if (!confirm('Möchten Sie dieses Training wirklich absagen?')) {
        return;
    }

    try {
        await cancelTrainingSession(sessionId);
        const dateStr = document.getElementById('session-selection-date').textContent;
        await openSessionSelectionModal(dateStr);
        window.dispatchEvent(new CustomEvent('trainingCancelled', { detail: { sessionId } }));
    } catch (error) {
        console.error('Error canceling session:', error);
        alert('Fehler beim Absagen: ' + error.message);
    }
};

window.handleOpenAttendanceForSession = async function (sessionId, dateStr) {
    if (typeof window.openAttendanceForSessionFromSchedule === 'function') {
        await window.openAttendanceForSessionFromSchedule(sessionId, dateStr);
    }
    closeSessionSelectionModal();
};

function openSpontaneousSessionModal(dateStr = null) {
    const modal = document.getElementById('spontaneous-session-modal');
    const form = document.getElementById('spontaneous-session-form');
    const dateInput = document.getElementById('spontaneous-session-date-display');

    if (!modal || !form) return;

    form.reset();
    resetSessionPlanning(); // Übungsauswahl zurücksetzen

    if (dateStr) {
        dateInput.value = dateStr;
    } else {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeSpontaneousSessionModal() {
    const modal = document.getElementById('spontaneous-session-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearFeedback('spontaneous-session-feedback');

    const exercisePlanningSection = document.getElementById('exercise-planning-section');
    const toggleIcon = document.getElementById('toggle-exercise-planning-icon');
    if (exercisePlanningSection) {
        exercisePlanningSection.classList.add('hidden');
    }
    if (toggleIcon) {
        toggleIcon.classList.remove('fa-chevron-up');
        toggleIcon.classList.add('fa-chevron-down');
    }
}

function toggleExercisePlanningSection() {
    const section = document.getElementById('exercise-planning-section');
    const icon = document.getElementById('toggle-exercise-planning-icon');

    if (!section || !icon) return;

    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        section.classList.add('hidden');
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
}

async function handleSpontaneousSessionSubmit(e) {
    e.preventDefault();

    const date = document.getElementById('spontaneous-session-date-display').value;
    const startTime = document.getElementById('spontaneous-session-start-time').value;
    const endTime = document.getElementById('spontaneous-session-end-time').value;
    const subgroupId = document.getElementById('spontaneous-session-subgroup-select').value;
    const plannedExercises = getPlannedExercises();

    try {
        showFeedback('spontaneous-session-feedback', 'Erstelle Training...', 'info');

        const sessionId = await createTrainingSession(
            {
                date,
                startTime,
                endTime,
                subgroupId,
                clubId: currentUserData.clubId,
                recurringTemplateId: null,
                plannedExercises,
            },
            currentUserData.id
        );

        showFeedback(
            'spontaneous-session-feedback',
            'Training erstellt! Öffne Anwesenheit...',
            'success'
        );

        window.dispatchEvent(new CustomEvent('trainingCreated', { detail: { sessionId, date } }));

        setTimeout(() => {
            closeSpontaneousSessionModal();
            if (typeof window.openAttendanceForSessionFromSchedule === 'function') {
                window.openAttendanceForSessionFromSchedule(sessionId, date);
            }
        }, 500);
    } catch (error) {
        console.error('Error creating spontaneous session:', error);
        showFeedback('spontaneous-session-feedback', error.message, 'error');
    }
}

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

function clearFeedback(elementId) {
    const feedbackElement = document.getElementById(elementId);
    if (feedbackElement) {
        feedbackElement.textContent = '';
    }
}

function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

function formatDate(dateStr) {
    return formatDateGerman(dateStr);
}

// ============================================================================
// WINDOW-FUNKTIONEN (von attendance.js aufgerufen)
// ============================================================================

window.openSessionSelectionModalFromCalendar = async function (dateStr, sessions) {
    const modal = document.getElementById('session-selection-modal');
    const dateDisplay = document.getElementById('session-selection-date');
    const listContainer = document.getElementById('session-selection-list');

    if (!modal || !listContainer) return;

    dateDisplay.textContent = formatDateGerman(dateStr);
    dateDisplay.setAttribute('data-date', dateStr);

    let html = '';
    sessions.forEach(session => {
        const subgroup = subgroups.find(s => s.id === session.subgroupId);
        const subgroupName = subgroup ? subgroup.name : 'Unbekannt';
        const isCompleted = session.completed || false;
        const hasPlannedExercises = session.plannedExercises && session.plannedExercises.length > 0;

        let statusBadge = '';
        if (isCompleted) {
            statusBadge =
                '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full ml-2">✓ Abgeschlossen</span>';
        }

        let exercisesInfo = '';
        if (hasPlannedExercises) {
            exercisesInfo = `<p class="text-xs text-gray-500 mt-1">📋 ${session.plannedExercises.length} Übung(en) geplant</p>`;
        }

        html += `
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex-1">
                        <div class="flex items-center">
                            <h4 class="font-semibold text-gray-900">${subgroupName}</h4>
                            ${statusBadge}
                        </div>
                        <p class="text-sm text-gray-600">
                            <i class="fas fa-clock mr-1"></i>
                            ${formatTimeRange(session.startTime, session.endTime)}
                        </p>
                        ${exercisesInfo}
                    </div>
                    <button onclick="window.handleCancelSessionFromModal('${session.id}')" class="text-red-600 hover:text-red-800 text-sm">
                        <i class="fas fa-times mr-1"></i> Absagen
                    </button>
                </div>
                <div class="grid ${hasPlannedExercises ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3">
                    <button onclick="window.handleSelectSessionForAttendance('${session.id}', '${dateStr}')" class="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg text-sm">
                        Anwesenheit erfassen
                    </button>
                    ${
                        !isCompleted
                            ? `
                        <button onclick="window.handleCompleteTraining('${session.id}', '${dateStr}')" class="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg text-sm">
                            <i class="fas fa-check mr-1"></i> Abschließen
                        </button>
                    `
                            : `
                        <button disabled class="bg-gray-300 text-gray-600 font-medium py-2 px-4 rounded-lg cursor-not-allowed text-sm">
                            Bereits abgeschlossen
                        </button>
                    `
                    }
                    ${
                        hasPlannedExercises
                            ? `
                        <button onclick="window.showTrainingInfo('${session.id}', '${dateStr}')" class="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm">
                            <i class="fas fa-info-circle mr-1"></i> Info
                        </button>
                    `
                            : ''
                    }
                </div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.handleSelectSessionForAttendance = async function (sessionId, dateStr) {
    closeSessionSelectionModal();
    if (typeof window.openAttendanceForSessionFromSchedule === 'function') {
        await window.openAttendanceForSessionFromSchedule(sessionId, dateStr);
    }
};

window.handleAddAnotherTrainingFromModal = function (dateStr) {
    closeSessionSelectionModal();
    window.openSpontaneousSessionModalFromCalendar(dateStr);
};

window.handleCancelSessionFromModal = async function (sessionId) {
    if (!confirm('Möchten Sie dieses Training wirklich absagen?')) {
        return;
    }

    try {
        await cancelTrainingSession(sessionId);

        const dateDisplay = document.getElementById('session-selection-date');
        const dateStr =
            dateDisplay.getAttribute('data-date') || parseDateGerman(dateDisplay.textContent);
        if (dateStr) {
            const sessions = await getSessionsForDate(currentUserData.clubId, dateStr, true);
            window.openSessionSelectionModalFromCalendar(dateStr, sessions);
        }

        window.dispatchEvent(new CustomEvent('trainingCancelled', { detail: { sessionId } }));
    } catch (error) {
        console.error('Error canceling session:', error);
        alert('Fehler beim Absagen: ' + error.message);
    }
};

window.handleCompleteTraining = async function (sessionId, dateStr) {
    closeSessionSelectionModal();

    if (typeof window.openTrainingCompletionModal === 'function') {
        await window.openTrainingCompletionModal(sessionId, dateStr);
    } else {
        alert('Training-Abschluss-Modul ist noch nicht geladen. Bitte Seite neu laden.');
    }
};

window.openSpontaneousSessionModalFromCalendar = function (dateStr) {
    openSpontaneousSessionModal(dateStr);
};

window.showTrainingInfo = async function (sessionId, dateStr) {
    try {
        const { data: session, error: sessionError } = await supabaseClient
            .from('training_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessionError || !session) {
            alert('Training-Session nicht gefunden!');
            return;
        }

        const sessionData = {
            id: session.id,
            date: session.date,
            startTime: session.start_time,
            endTime: session.end_time,
            subgroupId: session.subgroup_id,
            clubId: session.club_id,
            completed: session.completed,
            completedAt: session.completed_at,
            completedBy: session.completed_by,
            plannedExercises: session.planned_exercises || [],
            completedExercises: session.completed_exercises || []
        };

        const subgroup = subgroups.find(s => s.id === sessionData.subgroupId);
        const subgroupName = subgroup ? subgroup.name : 'Unbekannt';

        document.getElementById('training-info-subgroup').textContent = subgroupName;
        document.getElementById('training-info-time').textContent = formatTimeRange(
            sessionData.startTime,
            sessionData.endTime
        );
        document.getElementById('training-info-date').textContent = formatDateGerman(dateStr);

        const statusElement = document.getElementById('training-info-status');
        if (sessionData.completed) {
            statusElement.innerHTML =
                '<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">✓ Training abgeschlossen</span>';
        } else {
            statusElement.innerHTML =
                '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">⏳ Noch nicht abgeschlossen</span>';
        }

        const exercisesList = document.getElementById('training-info-exercises-list');
        if (!sessionData.plannedExercises || sessionData.plannedExercises.length === 0) {
            exercisesList.innerHTML =
                '<p class="text-sm text-gray-500 text-center py-4">Keine Übungen geplant</p>';
        } else {
            let html = '';
            sessionData.plannedExercises.forEach((exercise, index) => {
                let badges = '';
                if (exercise.tieredPoints) {
                    badges +=
                        '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
                }
                if (exercise.partnerSystem) {
                    badges +=
                        '<span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-2" title="Partner-System">👥</span>';
                }

                html += `
                    <div class="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <div class="flex items-center">
                            <span class="text-gray-500 font-medium mr-3">${index + 1}.</span>
                            <span class="text-sm font-medium text-gray-900">${exercise.name}</span>
                            ${badges}
                        </div>
                        <span class="text-xs text-gray-600 font-semibold">+${exercise.points} Pkt</span>
                    </div>
                `;
            });
            exercisesList.innerHTML = html;
        }

        const completedSection = document.getElementById('training-info-completed-section');
        const completedExercisesList = document.getElementById('training-info-completed-exercises');

        if (
            sessionData.completed &&
            sessionData.completedExercises &&
            sessionData.completedExercises.length > 0
        ) {
            completedSection.classList.remove('hidden');

            const allExercises = [];

            for (const exercise of sessionData.completedExercises) {
                const isPlanned = sessionData.plannedExercises?.some(
                    ex => ex.exerciseId === exercise.exerciseId
                );
                allExercises.push({
                    name: exercise.name,
                    points: exercise.points,
                    type: isPlanned ? 'planned' : 'spontaneous',
                    isSinglePlayer: false,
                    tieredPoints: exercise.tieredPoints || false,
                });

                if (
                    exercise.pairingData &&
                    exercise.pairingData.singlePlayers &&
                    exercise.pairingData.singlePlayers.length > 0
                ) {
                    for (const single of exercise.pairingData.singlePlayers) {
                        if (single.customExercise) {
                            try {
                                const { data: playerData } = await supabaseClient
                                    .from('profiles')
                                    .select('first_name, last_name')
                                    .eq('id', single.playerId)
                                    .single();

                                if (playerData) {
                                    allExercises.push({
                                        name: single.customExercise.name,
                                        points: single.customExercise.points,
                                        type: 'single',
                                        isSinglePlayer: true,
                                        playerName: `${playerData.first_name} ${playerData.last_name}`,
                                        tieredPoints: single.customExercise.tieredPoints || false,
                                    });
                                }
                            } catch (error) {
                                console.error(
                                    'Error loading player data for custom exercise:',
                                    error
                                );
                            }
                        }
                    }
                }
            }

            let html = '';
            allExercises.forEach((exercise, index) => {
                let badges = '';

                if (exercise.type === 'planned') {
                    badges +=
                        '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2">📋 Geplant</span>';
                } else if (exercise.type === 'spontaneous') {
                    badges +=
                        '<span class="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded ml-2">⚡ Spontan</span>';
                } else if (exercise.type === 'single') {
                    badges += `<span class="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded ml-2">👤 Alleine (${exercise.playerName})</span>`;
                }

                if (exercise.tieredPoints) {
                    badges +=
                        '<span class="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊 Meilenstein</span>';
                }

                html += `
                    <div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg">
                        <div class="flex items-center flex-wrap">
                            <span class="text-gray-500 font-medium mr-3">${index + 1}.</span>
                            <span class="text-sm font-medium text-gray-900">${exercise.name}</span>
                            ${badges}
                        </div>
                        <span class="text-xs text-gray-600 font-semibold whitespace-nowrap ml-2">+${exercise.points} Pkt</span>
                    </div>
                `;
            });
            completedExercisesList.innerHTML = html;
        } else {
            completedSection.classList.add('hidden');
        }

        const singlePlayersSection = document.getElementById(
            'training-info-single-players-section'
        );
        const singlePlayersList = document.getElementById('training-info-single-players-list');

        if (
            sessionData.completed &&
            sessionData.completedExercises &&
            sessionData.completedExercises.length > 0
        ) {
            const allSinglePlayers = [];

            for (const exercise of sessionData.completedExercises) {
                if (
                    exercise.pairingData &&
                    exercise.pairingData.singlePlayers &&
                    exercise.pairingData.singlePlayers.length > 0
                ) {
                    for (const single of exercise.pairingData.singlePlayers) {
                        try {
                            const { data: playerData } = await supabaseClient
                                .from('profiles')
                                .select('first_name, last_name')
                                .eq('id', single.playerId)
                                .single();

                            if (playerData) {
                                allSinglePlayers.push({
                                    name: `${playerData.first_name} ${playerData.last_name}`,
                                    exercise: single.customExercise
                                        ? single.customExercise.name
                                        : exercise.name,
                                    points: single.customExercise
                                        ? single.customExercise.points
                                        : exercise.points,
                                    result: single.result,
                                });
                            }
                        } catch (error) {
                            console.error('Error loading player data:', error);
                        }
                    }
                }
            }

            if (allSinglePlayers.length > 0) {
                singlePlayersSection.classList.remove('hidden');
                let html = '';

                allSinglePlayers.forEach((player, index) => {
                    const resultBadge =
                        player.result === 'success'
                            ? '<span class="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded ml-2">✓ Geschafft</span>'
                            : '<span class="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded ml-2">✗ Nicht geschafft</span>';

                    html += `
                        <div class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-sm font-medium text-gray-900">👤 ${player.name}</span>
                                ${resultBadge}
                            </div>
                            <div class="text-xs text-gray-600 mt-1">
                                📝 Übung: ${player.exercise} <span class="text-gray-500">(+${player.points} Pkt)</span>
                            </div>
                        </div>
                    `;
                });
                singlePlayersList.innerHTML = html;
            } else {
                singlePlayersSection.classList.add('hidden');
            }
        } else {
            singlePlayersSection.classList.add('hidden');
        }

        const modal = document.getElementById('training-info-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        console.error('[Training Info] Error loading training info:', error);
        alert('Fehler beim Laden der Trainingsinformationen: ' + error.message);
    }
};

function closeTrainingInfoModal() {
    const modal = document.getElementById('training-info-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/** Parst deutsches Datumsformat zurück zu YYYY-MM-DD */
function parseDateGerman(dateStr) {
    const match = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
}
