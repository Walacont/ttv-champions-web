/** Training-Abschluss-Modul (Supabase-Version) - Workflow für Training-Abschluss mit automatischer Punkteverteilung */

import { openExerciseSelectionModal } from './session-planning-supabase.js';
import {
    initializePartnerPairing,
    openPartnerPairingModal,
    distributeExercisePoints,
    distributeMilestonePoints,
} from './partner-pairing-supabase.js';

let supabaseClient = null;
let currentUserData = null;
let currentSessionId = null;
let currentSessionData = null;
let currentAttendanceData = null;
let plannedExercises = [];
let spontaneousExercises = [];
let exercisePairings = {
    planned: [],
    spontaneous: [],
};

/** Initialisiert das Training-Abschluss-Modul */
export function initializeTrainingCompletion(supabaseInstance, userData) {
    supabaseClient = supabaseInstance;
    currentUserData = userData;
    setupEventListeners();
    initializePartnerPairing(supabaseInstance, userData);
}

function setupEventListeners() {
    const closeBtn = document.getElementById('close-training-completion-modal-button');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCompletionModal);
    }

    const form = document.getElementById('training-completion-form');
    if (form) {
        form.addEventListener('submit', handleCompletionSubmit);
    }

    const addSpontBtn = document.getElementById('add-spontaneous-exercise-button');
    if (addSpontBtn) {
        addSpontBtn.addEventListener('click', openSpontaneousExerciseModal);
    }
}

function openSpontaneousExerciseModal() {
    openExerciseSelectionModal(exercise => {
        addSpontaneousExerciseFromModal(exercise);
    });
}

/** Duplikate erlaubt - Übungen können mehrfach pro Training durchgeführt werden */
function addSpontaneousExerciseFromModal(exercise) {
    spontaneousExercises.push({
        exerciseId: exercise.exerciseId || exercise.id,
        name: exercise.name,
        points: exercise.points || 0,
        tieredPoints: exercise.tieredPoints || false,
    });

    exercisePairings.spontaneous.push(null);
    renderSpontaneousExercises();
}

/** Öffnet das Training-Abschluss-Modal */
window.openTrainingCompletionModal = async function (sessionId, dateStr) {
    currentSessionId = sessionId;
    plannedExercises = [];
    spontaneousExercises = [];

    try {
        const { data: sessionData, error: sessionError } = await supabaseClient
            .from('training_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessionError || !sessionData) {
            alert('Training-Session nicht gefunden!');
            return;
        }

        currentSessionData = {
            id: sessionData.id,
            date: sessionData.date,
            startTime: sessionData.start_time,
            endTime: sessionData.end_time,
            subgroupId: sessionData.subgroup_id,
            clubId: sessionData.club_id,
            completed: sessionData.completed,
            completedAt: sessionData.completed_at,
            completedBy: sessionData.completed_by,
            plannedExercises: sessionData.planned_exercises || [],
            cancelled: sessionData.cancelled
        };

        if (currentSessionData.completed) {
            alert('Dieses Training wurde bereits abgeschlossen!');
            return;
        }

        const { data: attendanceData, error: attendanceError } = await supabaseClient
            .from('attendance')
            .select('*')
            .eq('session_id', sessionId);

        if (attendanceError || !attendanceData || attendanceData.length === 0) {
            alert('Bitte erfasse zuerst die Anwesenheit für dieses Training!');
            return;
        }

        const attendance = attendanceData[0];
        currentAttendanceData = {
            id: attendance.id,
            date: attendance.date,
            sessionId: attendance.session_id,
            subgroupId: attendance.subgroup_id,
            presentPlayerIds: attendance.present_player_ids || [],
            coaches: attendance.coaches || [],
            coachIds: attendance.coach_ids || []
        };

        const { data: subgroupData } = await supabaseClient
            .from('subgroups')
            .select('name')
            .eq('id', currentSessionData.subgroupId)
            .single();

        const subgroupName = subgroupData?.name || 'Unbekannt';

        document.getElementById('completion-session-info').textContent =
            `${subgroupName} • ${currentSessionData.startTime}-${currentSessionData.endTime} • ${formatDateGerman(dateStr)}`;
        document.getElementById('completion-session-id').value = sessionId;
        document.getElementById('completion-session-date').value = dateStr;
        document.getElementById('completion-player-count').textContent =
            currentAttendanceData.presentPlayerIds?.length || 0;

        plannedExercises = currentSessionData.plannedExercises || [];
        document.getElementById('completion-planned-count').textContent = plannedExercises.length;

        exercisePairings.planned = new Array(plannedExercises.length).fill(null);
        exercisePairings.spontaneous = new Array(spontaneousExercises.length).fill(null);

        renderPlannedExercises();
        renderSpontaneousExercises();

        const modal = document.getElementById('training-completion-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } catch (error) {
        console.error('[Training Completion] Error opening modal:', error);
        alert('Fehler beim Laden der Training-Daten: ' + error.message);
    }
};

function renderPlannedExercises() {
    const container = document.getElementById('completion-planned-exercises');
    if (!container) return;

    if (plannedExercises.length === 0) {
        container.innerHTML =
            '<p class="text-xs text-gray-400 text-center py-4">Keine Übungen geplant</p>';
        return;
    }

    container.innerHTML = '';

    plannedExercises.forEach((exercise, index) => {
        const div = document.createElement('div');
        div.className =
            'flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white border rounded hover:bg-gray-50';

        let badges = '';
        if (exercise.tieredPoints) {
            badges +=
                '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }

        const hasPairings =
            exercisePairings.planned[index] !== undefined &&
            exercisePairings.planned[index] !== null;
        const pairingStatus = hasPairings
            ? '<span class="text-xs text-green-600 whitespace-nowrap">✓ Paarungen gesetzt</span>'
            : '<span class="text-xs text-orange-600 whitespace-nowrap">⚠ Paarungen fehlen</span>';

        div.innerHTML = `
            <span class="flex-1 text-sm text-gray-700 break-words">
                📋 ${exercise.name}
                ${badges}
            </span>
            <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-gray-500 whitespace-nowrap">+${exercise.points} Pkt</span>
                ${pairingStatus}
                <button
                    type="button"
                    class="text-xs px-2 py-1 rounded whitespace-nowrap ${hasPairings ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}"
                    onclick="window.openPairingForPlannedExercise(${index})"
                >
                    ${hasPairings ? '✏️ Bearbeiten' : '👥 Partner wählen'}
                </button>
                <button
                    type="button"
                    class="text-red-600 hover:text-red-800 text-xs"
                    onclick="window.removePlannedExercise(${index})"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    updateSubmitButtonState();
}

function renderSpontaneousExercises() {
    const container = document.getElementById('completion-spontaneous-exercises');
    if (!container) return;

    if (spontaneousExercises.length === 0) {
        container.innerHTML =
            '<p class="text-xs text-gray-400 text-center py-4">Keine spontanen Übungen hinzugefügt</p>';
        return;
    }

    container.innerHTML = '';

    spontaneousExercises.forEach((exercise, index) => {
        const div = document.createElement('div');
        div.className =
            'flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-green-50 border border-green-200 rounded';

        let badges = '';
        if (exercise.tieredPoints) {
            badges +=
                '<span class="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded ml-2" title="Meilenstein-System">📊</span>';
        }

        const hasPairings =
            exercisePairings.spontaneous[index] !== undefined &&
            exercisePairings.spontaneous[index] !== null;
        const pairingStatus = hasPairings
            ? '<span class="text-xs text-green-600 whitespace-nowrap">✓ Paarungen gesetzt</span>'
            : '<span class="text-xs text-orange-600 whitespace-nowrap">⚠ Paarungen fehlen</span>';

        div.innerHTML = `
            <span class="flex-1 text-sm text-gray-700 break-words">
                ⚡ ${exercise.name}
                ${badges}
            </span>
            <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs text-gray-500 whitespace-nowrap">+${exercise.points} Pkt</span>
                ${pairingStatus}
                <button
                    type="button"
                    class="text-xs px-2 py-1 rounded whitespace-nowrap ${hasPairings ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}"
                    onclick="window.openPairingForSpontaneousExercise(${index})"
                >
                    ${hasPairings ? '✏️ Bearbeiten' : '👥 Partner wählen'}
                </button>
                <button type="button" class="text-red-600 hover:text-red-800 text-xs" onclick="window.removeSpontaneousExercise(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    updateSubmitButtonState();
}

window.removePlannedExercise = function (index) {
    plannedExercises.splice(index, 1);
    exercisePairings.planned.splice(index, 1);
    document.getElementById('completion-planned-count').textContent = plannedExercises.length;
    renderPlannedExercises();
};

window.removeSpontaneousExercise = function (index) {
    spontaneousExercises.splice(index, 1);
    exercisePairings.spontaneous.splice(index, 1);
    renderSpontaneousExercises();
};

async function handleCompletionSubmit(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    showFeedback('Verarbeite Training-Abschluss...', 'info');

    try {
        const exercisesWithPairings = [];

        plannedExercises.forEach((exercise, index) => {
            const pairingData = exercisePairings.planned[index];
            exercisesWithPairings.push({
                exercise,
                pairingData,
                type: 'planned',
                index,
            });
        });

        spontaneousExercises.forEach((exercise, index) => {
            const pairingData = exercisePairings.spontaneous[index];
            exercisesWithPairings.push({
                exercise,
                pairingData,
                type: 'spontaneous',
                index,
            });
        });

        if (exercisesWithPairings.length > 0) {
            await processPointsDistributionWithPairings(exercisesWithPairings);
        }

        const { error: updateError } = await supabaseClient
            .from('training_sessions')
            .update({
                completed: true,
                completed_at: new Date().toISOString(),
                completed_by: currentUserData.id,
                completed_exercises: exercisesWithPairings.map(item => ({
                    exerciseId: item.exercise.exerciseId,
                    name: item.exercise.name,
                    points: item.exercise.points,
                    tieredPoints: item.exercise.tieredPoints || false,
                    pairingData: item.pairingData,
                })),
            })
            .eq('id', currentSessionId);

        if (updateError) throw updateError;

        const successMessage =
            exercisesWithPairings.length > 0
                ? 'Training erfolgreich abgeschlossen! Punkte wurden vergeben.'
                : 'Training erfolgreich abgeschlossen! (Nur Anwesenheit)';
        showFeedback(successMessage, 'success');
        if (window.trackEvent) window.trackEvent('training_complete');

        window.dispatchEvent(
            new CustomEvent('trainingCompleted', {
                detail: {
                    sessionId: currentSessionId,
                    date: currentSessionData.date,
                },
            })
        );

        setTimeout(() => {
            closeCompletionModal();
        }, 1500);
    } catch (error) {
        console.error('[Training Completion] Error:', error);
        showFeedback('Fehler: ' + error.message, 'error');
        submitBtn.disabled = false;
    }
}

/** Verarbeitet Punkteverteilung mit gespeicherten Paarungsdaten */
async function processPointsDistributionWithPairings(exercisesWithPairings) {
    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        throw new Error('Keine Spieler anwesend');
    }

    for (const item of exercisesWithPairings) {
        const { exercise, pairingData } = item;

        if (exercise.tieredPoints) {
            try {
                const { data: exerciseData, error: exerciseError } = await supabaseClient
                    .from('exercises')
                    .select('*')
                    .eq('id', exercise.exerciseId)
                    .single();

                if (exerciseError || !exerciseData) {
                    console.error('[Training Completion] Exercise not found:', exercise.exerciseId);
                    continue;
                }

                const exerciseWithMilestones = {
                    ...exercise,
                    tieredPoints: exerciseData.tiered_points,
                };

                if (
                    pairingData &&
                    (pairingData.pairs?.length > 0 || pairingData.singlePlayers?.length > 0)
                ) {
                    await distributeMilestonePoints(
                        pairingData.pairs || [],
                        pairingData.singlePlayers || [],
                        exerciseWithMilestones,
                        currentSessionData
                    );
                }
            } catch (error) {
                console.error('[Training Completion] Error processing milestone exercise:', error);
            }
            continue;
        }

        if (
            pairingData &&
            (pairingData.pairs?.length > 0 || pairingData.singlePlayers?.length > 0)
        ) {
            await distributeExercisePoints(
                pairingData.pairs || [],
                pairingData.singlePlayers || [],
                exercise,
                currentSessionData
            );
        }
    }
}

function formatDateGerman(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}.${month}.${year}`;
}

function showFeedback(message, type) {
    const feedbackElement = document.getElementById('training-completion-feedback');
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

function clearFeedback() {
    const feedbackElement = document.getElementById('training-completion-feedback');
    if (feedbackElement) {
        feedbackElement.textContent = '';
    }
}

function closeCompletionModal() {
    const modal = document.getElementById('training-completion-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearFeedback();
    currentSessionId = null;
    currentSessionData = null;
    currentAttendanceData = null;
    plannedExercises = [];
    spontaneousExercises = [];
    exercisePairings = {
        planned: [],
        spontaneous: [],
    };
}

/** Öffnet Partner-Paarungs-Modal für geplante Übung */
window.openPairingForPlannedExercise = async function (index) {
    const exercise = plannedExercises[index];
    if (!exercise) return;

    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        alert('Keine Spieler anwesend!');
        return;
    }

    try {
        let fullExercise = exercise;
        if (exercise.tieredPoints) {
            const { data: exerciseData, error: exerciseError } = await supabaseClient
                .from('exercises')
                .select('*')
                .eq('id', exercise.exerciseId)
                .single();

            if (!exerciseError && exerciseData) {
                fullExercise = {
                    ...exercise,
                    tieredPoints: exerciseData.tiered_points,
                };
            }
        }

        const existingPairings = exercisePairings.planned[index];

        const pairingData = await openPartnerPairingModal(
            fullExercise,
            presentPlayerIds,
            currentSessionData,
            existingPairings
        );

        exercisePairings.planned[index] = pairingData;
        renderPlannedExercises();
    } catch (error) {
        console.error('[Training Completion] Error setting pairings for planned exercise:', error);
    }
};

/** Öffnet Partner-Paarungs-Modal für spontane Übung */
window.openPairingForSpontaneousExercise = async function (index) {
    const exercise = spontaneousExercises[index];
    if (!exercise) return;

    const presentPlayerIds = currentAttendanceData.presentPlayerIds || [];
    if (presentPlayerIds.length === 0) {
        alert('Keine Spieler anwesend!');
        return;
    }

    try {
        let fullExercise = exercise;
        if (exercise.tieredPoints) {
            const { data: exerciseData, error: exerciseError } = await supabaseClient
                .from('exercises')
                .select('*')
                .eq('id', exercise.exerciseId)
                .single();

            if (!exerciseError && exerciseData) {
                fullExercise = {
                    ...exercise,
                    tieredPoints: exerciseData.tiered_points,
                };
            }
        }

        const existingPairings = exercisePairings.spontaneous[index];

        const pairingData = await openPartnerPairingModal(
            fullExercise,
            presentPlayerIds,
            currentSessionData,
            existingPairings
        );

        exercisePairings.spontaneous[index] = pairingData;
        renderSpontaneousExercises();
    } catch (error) {
        console.error(
            '[Training Completion] Error setting pairings for spontaneous exercise:',
            error
        );
    }
};

/** Aktualisiert Submit-Button-Status basierend auf Paarungen */
function updateSubmitButtonState() {
    const submitBtn = document.getElementById('training-completion-submit');
    if (!submitBtn) return;

    const allPlannedHavePairings = plannedExercises.every((exercise, index) => {
        return (
            exercisePairings.planned[index] !== undefined &&
            exercisePairings.planned[index] !== null
        );
    });

    const allSpontaneousHavePairings = spontaneousExercises.every((exercise, index) => {
        return (
            exercisePairings.spontaneous[index] !== undefined &&
            exercisePairings.spontaneous[index] !== null
        );
    });

    const allPairingsSet = allPlannedHavePairings && allSpontaneousHavePairings;
    const hasAnyExercises = plannedExercises.length > 0 || spontaneousExercises.length > 0;

    // Aktiviert wenn: keine Übungen (nur Anwesenheit) ODER alle Paarungen gesetzt
    if (!hasAnyExercises || allPairingsSet) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('bg-gray-400', 'cursor-not-allowed');
        submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    } else {
        submitBtn.disabled = true;
        submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        submitBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
    }
}
