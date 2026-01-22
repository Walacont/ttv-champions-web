// Quick Points Dialog Module (Supabase-Version)
// Ermöglicht schnelle Punktevergabe nach Anwesenheitserfassung

import { getSupabase } from './supabase-init.js';
import { addPointsToTrainingSummary } from './training-summary-supabase.js';

const supabase = getSupabase();

let currentPresentPlayerIds = [];
let currentClubPlayers = [];
let currentUserData = null;
let currentEventDate = null; // Datum für Training-Zusammenfassung
let currentEventId = null; // Event-ID für Training-Zusammenfassung
let selectedPlayerIds = new Set();
let selectedPointsType = null;
let exercisesData = [];
let challengesData = [];
let selectedPlayMode = null; // 'solo' oder 'pair'
let selectedExerciseData = null; // Aktuell ausgewählte Übung

/**
 * Initialisiert den Quick Points Dialog
 */
export function initQuickPointsDialog() {
    const modal = document.getElementById('quick-points-modal');
    if (!modal) return;

    // Close button
    document.getElementById('close-quick-points-modal')?.addEventListener('click', closeQuickPointsModal);

    // Skip button
    document.getElementById('quick-points-skip-btn')?.addEventListener('click', closeQuickPointsModal);

    // Submit button (Speichern & Schließen)
    document.getElementById('quick-points-submit-btn')?.addEventListener('click', () => handleQuickPointsSubmit(true));

    // Submit & Continue button (Speichern & Weiter)
    document.getElementById('quick-points-submit-continue-btn')?.addEventListener('click', () => handleQuickPointsSubmit(false));

    // Select all/none buttons
    document.getElementById('quick-points-select-all')?.addEventListener('click', selectAllPlayers);
    document.getElementById('quick-points-select-none')?.addEventListener('click', selectNoPlayers);

    // Points type buttons
    document.getElementById('quick-points-type-exercise')?.addEventListener('click', () => selectPointsType('exercise'));
    document.getElementById('quick-points-type-challenge')?.addEventListener('click', () => selectPointsType('challenge'));
    document.getElementById('quick-points-type-manual')?.addEventListener('click', () => selectPointsType('manual'));

    // Exercise select change
    document.getElementById('quick-points-exercise-select')?.addEventListener('change', handleExerciseChange);

    // Challenge select change
    document.getElementById('quick-points-challenge-select')?.addEventListener('change', handleChallengeChange);

    // Manual inputs change
    document.getElementById('quick-points-manual-amount')?.addEventListener('input', updatePreview);
    document.getElementById('quick-points-manual-reason')?.addEventListener('input', updateSubmitButton);

    // Milestone count inputs
    document.getElementById('quick-points-exercise-count')?.addEventListener('input', updateExerciseMilestonePreview);
    document.getElementById('quick-points-challenge-count')?.addEventListener('input', updateChallengeMilestonePreview);

    // Spielmodus-Buttons (Solo/Paarung)
    document.getElementById('quick-points-mode-solo')?.addEventListener('click', () => selectPlayMode('solo'));
    document.getElementById('quick-points-mode-pair')?.addEventListener('click', () => selectPlayMode('pair'));

    // Paar-Auswahl änderungen
    document.getElementById('quick-points-player-a')?.addEventListener('change', updatePairSelection);
    document.getElementById('quick-points-player-b')?.addEventListener('change', updatePairSelection);

    // Zeit-Eingabe änderungen
    document.getElementById('quick-points-time-hours')?.addEventListener('input', updateTimeInput);
    document.getElementById('quick-points-time-minutes')?.addEventListener('input', updateTimeInput);
    document.getElementById('quick-points-time-seconds')?.addEventListener('input', updateTimeInput);
}

/**
 * Öffnet den Quick Points Dialog nach dem Speichern der Anwesenheit
 * @param {string[]} presentPlayerIds - IDs der anwesenden Spieler
 * @param {object[]} clubPlayers - Liste der Club-Spieler
 * @param {object} userData - Aktuelle Benutzerdaten
 * @param {string} eventDate - Optional: Datum des Events (YYYY-MM-DD), default: heute
 * @param {string} eventId - Optional: Event-ID für Training-Zusammenfassung
 */
export async function openQuickPointsModal(presentPlayerIds, clubPlayers, userData, eventDate = null, eventId = null) {
    const modal = document.getElementById('quick-points-modal');
    if (!modal) return;

    currentPresentPlayerIds = presentPlayerIds;
    currentClubPlayers = clubPlayers;
    currentUserData = userData;
    currentEventDate = eventDate || new Date().toISOString().split('T')[0];
    currentEventId = eventId; // Event-ID speichern
    selectedPlayerIds = new Set(presentPlayerIds); // Standardmäßig alle anwesenden ausgewählt
    selectedPointsType = null;

    // Reset UI
    resetQuickPointsUI();

    // Populate player list
    populatePlayerList();

    // Load exercises and challenges
    await Promise.all([
        loadExercisesForQuickPoints(),
        loadChallengesForQuickPoints()
    ]);

    // Show modal
    modal.classList.remove('hidden');
}

/**
 * Schließt den Quick Points Dialog
 */
export function closeQuickPointsModal() {
    const modal = document.getElementById('quick-points-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    resetQuickPointsUI();
}

/**
 * Setzt die UI zurück
 */
function resetQuickPointsUI() {
    selectedPointsType = null;
    selectedPlayerIds.clear();
    selectedPlayMode = null;
    selectedExerciseData = null;

    // Reset type buttons
    document.querySelectorAll('.quick-points-type-btn').forEach(btn => {
        btn.classList.remove('border-indigo-500', 'bg-indigo-50');
        btn.classList.add('border-gray-300');
    });

    // Hide all containers
    document.getElementById('quick-points-exercise-container')?.classList.add('hidden');
    document.getElementById('quick-points-challenge-container')?.classList.add('hidden');
    document.getElementById('quick-points-manual-container')?.classList.add('hidden');
    document.getElementById('quick-points-preview')?.classList.add('hidden');
    document.getElementById('quick-points-exercise-milestone')?.classList.add('hidden');
    document.getElementById('quick-points-challenge-milestone')?.classList.add('hidden');

    // Reset play mode UI
    document.getElementById('quick-points-play-mode-container')?.classList.add('hidden');
    document.getElementById('quick-points-pair-info')?.classList.add('hidden');
    document.getElementById('quick-points-pair-selection')?.classList.add('hidden');
    document.getElementById('quick-points-time-input-container')?.classList.add('hidden');

    // Reset play mode buttons
    const soloBtn = document.getElementById('quick-points-mode-solo');
    const pairBtn = document.getElementById('quick-points-mode-pair');
    [soloBtn, pairBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('border-indigo-500', 'bg-indigo-50', 'text-indigo-600');
        }
    });

    // Show player list again
    document.getElementById('quick-points-player-list')?.classList.remove('hidden');

    // Reset inputs
    const exerciseSelect = document.getElementById('quick-points-exercise-select');
    if (exerciseSelect) exerciseSelect.value = '';

    const challengeSelect = document.getElementById('quick-points-challenge-select');
    if (challengeSelect) challengeSelect.value = '';

    const manualAmount = document.getElementById('quick-points-manual-amount');
    if (manualAmount) manualAmount.value = '';

    const manualReason = document.getElementById('quick-points-manual-reason');
    if (manualReason) manualReason.value = '';

    const exerciseCount = document.getElementById('quick-points-exercise-count');
    if (exerciseCount) exerciseCount.value = '';

    const challengeCount = document.getElementById('quick-points-challenge-count');
    if (challengeCount) challengeCount.value = '';

    // Reset pair selects
    const playerA = document.getElementById('quick-points-player-a');
    const playerB = document.getElementById('quick-points-player-b');
    if (playerA) playerA.value = '';
    if (playerB) playerB.value = '';

    // Reset time inputs
    const timeHours = document.getElementById('quick-points-time-hours');
    const timeMinutes = document.getElementById('quick-points-time-minutes');
    const timeSeconds = document.getElementById('quick-points-time-seconds');
    if (timeHours) timeHours.value = '0';
    if (timeMinutes) timeMinutes.value = '0';
    if (timeSeconds) timeSeconds.value = '0';

    // Reset feedback
    const feedback = document.getElementById('quick-points-feedback');
    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'text-sm font-medium text-center';
    }

    // Disable submit
    const submitBtn = document.getElementById('quick-points-submit-btn');
    const submitContinueBtn = document.getElementById('quick-points-submit-continue-btn');
    if (submitBtn) submitBtn.disabled = true;
    if (submitContinueBtn) submitContinueBtn.disabled = true;
}

/**
 * Befüllt die Spielerliste
 */
function populatePlayerList() {
    const listEl = document.getElementById('quick-points-player-list');
    if (!listEl) return;

    listEl.innerHTML = '';

    // Filter nur anwesende Spieler
    const presentPlayers = currentClubPlayers.filter(p => currentPresentPlayerIds.includes(p.id));

    if (presentPlayers.length === 0) {
        listEl.innerHTML = '<p class="text-sm text-gray-400">Keine anwesenden Spieler</p>';
        return;
    }

    presentPlayers.forEach(player => {
        const div = document.createElement('div');
        div.className = 'flex items-center p-1.5 rounded hover:bg-gray-50';
        div.innerHTML = `
            <input
                type="checkbox"
                id="quick-player-${player.id}"
                value="${player.id}"
                checked
                class="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 quick-player-checkbox"
            >
            <label for="quick-player-${player.id}" class="ml-2 text-sm text-gray-700 cursor-pointer flex-1">
                ${player.firstName} ${player.lastName}
            </label>
        `;

        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedPlayerIds.add(player.id);
            } else {
                selectedPlayerIds.delete(player.id);
            }
            updatePlayerCount();
            updateSubmitButton();
        });

        listEl.appendChild(div);
    });

    // Alle standardmäßig ausgewählt
    selectedPlayerIds = new Set(currentPresentPlayerIds);
    updatePlayerCount();
}

/**
 * Alle Spieler auswählen
 */
function selectAllPlayers() {
    document.querySelectorAll('.quick-player-checkbox').forEach(cb => {
        cb.checked = true;
        selectedPlayerIds.add(cb.value);
    });
    updatePlayerCount();
    updateSubmitButton();
}

/**
 * Keine Spieler auswählen
 */
function selectNoPlayers() {
    document.querySelectorAll('.quick-player-checkbox').forEach(cb => {
        cb.checked = false;
    });
    selectedPlayerIds.clear();
    updatePlayerCount();
    updateSubmitButton();
}

/**
 * Aktualisiert die Spieleranzahl-Anzeige
 */
function updatePlayerCount() {
    const countEl = document.getElementById('quick-points-player-count');
    if (countEl) {
        countEl.textContent = `${selectedPlayerIds.size} ausgewählt`;
    }

    const previewPlayers = document.getElementById('quick-points-preview-players');
    if (previewPlayers) {
        previewPlayers.textContent = selectedPlayerIds.size;
    }
}

/**
 * Wählt den Punktetyp aus
 */
function selectPointsType(type) {
    selectedPointsType = type;

    // Update button styles
    document.querySelectorAll('.quick-points-type-btn').forEach(btn => {
        btn.classList.remove('border-indigo-500', 'bg-indigo-50');
        btn.classList.add('border-gray-300');
    });

    const activeBtn = document.getElementById(`quick-points-type-${type}`);
    if (activeBtn) {
        activeBtn.classList.remove('border-gray-300');
        activeBtn.classList.add('border-indigo-500', 'bg-indigo-50');
    }

    // Show/hide containers
    document.getElementById('quick-points-exercise-container')?.classList.toggle('hidden', type !== 'exercise');
    document.getElementById('quick-points-challenge-container')?.classList.toggle('hidden', type !== 'challenge');
    document.getElementById('quick-points-manual-container')?.classList.toggle('hidden', type !== 'manual');

    // Hide milestone containers when switching
    document.getElementById('quick-points-exercise-milestone')?.classList.add('hidden');
    document.getElementById('quick-points-challenge-milestone')?.classList.add('hidden');

    // Show preview for manual
    if (type === 'manual') {
        document.getElementById('quick-points-preview')?.classList.remove('hidden');
    }

    updatePreview();
    updateSubmitButton();
}

/**
 * Lädt Übungen für Quick Points
 */
async function loadExercisesForQuickPoints() {
    const select = document.getElementById('quick-points-exercise-select');
    if (!select) return;

    try {
        // Basis-Query
        let query = supabase
            .from('exercises')
            .select('*')
            .order('name', { ascending: true });

        // Nach Sportart filtern (Übungen der Sportart + globale Übungen ohne Sportart)
        const activeSportId = currentUserData?.active_sport_id;
        if (activeSportId) {
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        // Nach Sichtbarkeit filtern (globale + Club-eigene)
        if (currentUserData?.clubId) {
            query = query.or(`visibility.eq.global,club_id.eq.${currentUserData.clubId}`);
        }

        const { data, error } = await query;

        if (error) throw error;

        exercisesData = data || [];

        select.innerHTML = '<option value="">Übung wählen...</option>';

        exercisesData.forEach(e => {
            const option = document.createElement('option');
            option.value = e.id;

            const hasTieredPoints = e.tiered_points?.enabled && e.tiered_points?.milestones?.length > 0;
            const displayText = hasTieredPoints
                ? `${e.name} (bis zu ${e.points} P. - Meilensteine)`
                : `${e.name} (+${e.points} P.)`;

            option.textContent = displayText;
            option.dataset.points = e.points;
            option.dataset.title = e.name;
            option.dataset.hasMilestones = hasTieredPoints;
            option.dataset.unit = e.unit || 'Wiederholungen';
            option.dataset.playerType = e.player_type || 'both_active';
            option.dataset.timeDirection = e.time_direction || '';

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(e.tiered_points.milestones);
                option.dataset.timeDirection = e.tiered_points?.time_direction || e.time_direction || '';
            }

            select.appendChild(option);
        });
    } catch (error) {
        console.error('[QuickPoints] Error loading exercises:', error);
        select.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

/**
 * Lädt Challenges für Quick Points
 */
async function loadChallengesForQuickPoints() {
    const select = document.getElementById('quick-points-challenge-select');
    if (!select) return;

    if (!currentUserData?.clubId) return;

    try {
        const { data, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', currentUserData.clubId)
            .eq('is_active', true);

        if (error) throw error;

        challengesData = data || [];

        // Filter expired challenges
        const now = new Date();
        challengesData = challengesData.filter(c => {
            const createdAt = new Date(c.created_at);
            let expiryDays = 7; // Default weekly
            if (c.type === 'daily') expiryDays = 1;
            else if (c.type === 'monthly') expiryDays = 30;

            const expiresAt = new Date(createdAt.getTime() + expiryDays * 24 * 60 * 60 * 1000);
            return expiresAt > now;
        });

        select.innerHTML = '<option value="">Challenge wählen...</option>';

        if (challengesData.length === 0) {
            select.innerHTML = '<option value="">Keine aktiven Challenges</option>';
            return;
        }

        challengesData.forEach(c => {
            const option = document.createElement('option');
            option.value = c.id;

            const hasTieredPoints = c.tiered_points?.enabled && c.tiered_points?.milestones?.length > 0;
            const displayText = hasTieredPoints
                ? `${c.title} (bis zu ${c.points} P. - Meilensteine)`
                : `${c.title} (+${c.points} P.)`;

            option.textContent = displayText;
            option.dataset.points = c.points;
            option.dataset.title = c.title;
            option.dataset.hasMilestones = hasTieredPoints;
            option.dataset.unit = c.unit || 'Wiederholungen';

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(c.tiered_points.milestones);
            }

            select.appendChild(option);
        });
    } catch (error) {
        console.error('[QuickPoints] Error loading challenges:', error);
        select.innerHTML = '<option value="">Fehler beim Laden</option>';
    }
}

/**
 * Behandelt Änderung der Übungsauswahl
 */
function handleExerciseChange() {
    const select = document.getElementById('quick-points-exercise-select');
    const milestoneContainer = document.getElementById('quick-points-exercise-milestone');
    const playModeContainer = document.getElementById('quick-points-play-mode-container');
    const timeInputContainer = document.getElementById('quick-points-time-input-container');

    if (!select || !milestoneContainer) return;

    const selectedOption = select.options[select.selectedIndex];
    const hasMilestones = selectedOption?.dataset.hasMilestones === 'true';
    const unit = selectedOption?.dataset.unit || 'Wiederholungen';
    const timeDirection = selectedOption?.dataset.timeDirection || '';
    const playerType = selectedOption?.dataset.playerType || 'both_active';

    // Aktuelle Übungsdaten speichern
    selectedExerciseData = selectedOption?.value ? {
        id: selectedOption.value,
        title: selectedOption.dataset.title,
        points: parseInt(selectedOption.dataset.points) || 0,
        unit,
        playerType,
        timeDirection,
        hasMilestones,
        milestones: hasMilestones ? JSON.parse(selectedOption.dataset.milestones || '[]') : []
    } : null;

    // Spielmodus zurücksetzen
    selectedPlayMode = null;
    resetPlayModeUI();

    if (hasMilestones) {
        milestoneContainer.classList.remove('hidden');
        const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');

        // Zeit-Eingabe anzeigen wenn Einheit "Zeit" ist
        if (unit === 'Zeit') {
            milestoneContainer.classList.add('hidden'); // Normale Milestone-Input verstecken
            timeInputContainer?.classList.remove('hidden');
            const directionInfo = timeDirection === 'faster' ? '(schneller ist besser)' : '(länger ist besser)';
            const infoEl = timeInputContainer?.querySelector('p');
            if (infoEl) infoEl.textContent = `Format: Stunden : Minuten : Sekunden ${directionInfo}`;
        } else {
            timeInputContainer?.classList.add('hidden');
            // Label mit korrekter Einheit aktualisieren
            const labelEl = milestoneContainer.querySelector('label');
            if (labelEl) {
                labelEl.textContent = `Anzahl ${unit}`;
            }

            const infoEl = document.getElementById('quick-points-exercise-milestone-info');
            if (infoEl) {
                const milestoneText = milestones.map(m => `${m.count}× = ${m.points}P`).join(', ');
                infoEl.textContent = `Meilensteine: ${milestoneText}`;
            }
        }
    } else {
        milestoneContainer.classList.add('hidden');
        timeInputContainer?.classList.add('hidden');
    }

    // Spielmodus-Auswahl anzeigen wenn eine Übung ausgewählt ist
    if (selectedOption?.value) {
        playModeContainer?.classList.remove('hidden');
    } else {
        playModeContainer?.classList.add('hidden');
    }

    document.getElementById('quick-points-preview')?.classList.remove('hidden');
    updatePreview();
    updateSubmitButton();
}

/**
 * Behandelt Änderung der Challenge-Auswahl
 */
function handleChallengeChange() {
    const select = document.getElementById('quick-points-challenge-select');
    const milestoneContainer = document.getElementById('quick-points-challenge-milestone');

    if (!select || !milestoneContainer) return;

    const selectedOption = select.options[select.selectedIndex];
    const hasMilestones = selectedOption?.dataset.hasMilestones === 'true';

    if (hasMilestones) {
        milestoneContainer.classList.remove('hidden');
        const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
        const unit = selectedOption.dataset.unit || 'Wiederholungen';

        // Label mit korrekter Einheit aktualisieren
        const labelEl = milestoneContainer.querySelector('label');
        if (labelEl) {
            labelEl.textContent = `Anzahl ${unit}`;
        }

        const infoEl = document.getElementById('quick-points-challenge-milestone-info');
        if (infoEl) {
            const milestoneText = milestones.map(m => `${m.count}× = ${m.points}P`).join(', ');
            infoEl.textContent = `Meilensteine: ${milestoneText}`;
        }
    } else {
        milestoneContainer.classList.add('hidden');
    }

    document.getElementById('quick-points-preview')?.classList.remove('hidden');
    updatePreview();
    updateSubmitButton();
}

/**
 * Aktualisiert die Meilenstein-Vorschau für Übungen
 */
function updateExerciseMilestonePreview() {
    const select = document.getElementById('quick-points-exercise-select');
    const countInput = document.getElementById('quick-points-exercise-count');

    if (!select || !countInput) return;

    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption || selectedOption.dataset.hasMilestones !== 'true') return;

    const count = parseInt(countInput.value) || 0;
    const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
    const achievedMilestones = milestones.filter(m => count >= m.count);

    const infoEl = document.getElementById('quick-points-exercise-milestone-info');
    if (infoEl) {
        if (achievedMilestones.length > 0) {
            const totalPoints = achievedMilestones.reduce((sum, m) => sum + m.points, 0);
            infoEl.textContent = `${count}× = ${totalPoints} Punkte erreicht!`;
            infoEl.className = 'mt-1 text-xs text-green-700 font-medium';
        } else {
            const nextMilestone = milestones.find(m => m.count > count);
            if (nextMilestone) {
                infoEl.textContent = `Noch ${nextMilestone.count - count}× bis ${nextMilestone.points}P`;
            } else {
                infoEl.textContent = 'Kein Meilenstein erreicht';
            }
            infoEl.className = 'mt-1 text-xs text-indigo-700';
        }
    }

    updatePreview();
    updateSubmitButton();
}

/**
 * Aktualisiert die Meilenstein-Vorschau für Challenges
 */
function updateChallengeMilestonePreview() {
    const select = document.getElementById('quick-points-challenge-select');
    const countInput = document.getElementById('quick-points-challenge-count');

    if (!select || !countInput) return;

    const selectedOption = select.options[select.selectedIndex];
    if (!selectedOption || selectedOption.dataset.hasMilestones !== 'true') return;

    const count = parseInt(countInput.value) || 0;
    const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
    const achievedMilestones = milestones.filter(m => count >= m.count);

    const infoEl = document.getElementById('quick-points-challenge-milestone-info');
    if (infoEl) {
        if (achievedMilestones.length > 0) {
            const totalPoints = achievedMilestones.reduce((sum, m) => sum + m.points, 0);
            infoEl.textContent = `${count}× = ${totalPoints} Punkte erreicht!`;
            infoEl.className = 'mt-1 text-xs text-green-700 font-medium';
        } else {
            const nextMilestone = milestones.find(m => m.count > count);
            if (nextMilestone) {
                infoEl.textContent = `Noch ${nextMilestone.count - count}× bis ${nextMilestone.points}P`;
            } else {
                infoEl.textContent = 'Kein Meilenstein erreicht';
            }
            infoEl.className = 'mt-1 text-xs text-indigo-700';
        }
    }

    updatePreview();
    updateSubmitButton();
}

/**
 * Wählt den Spielmodus (solo/pair)
 */
function selectPlayMode(mode) {
    selectedPlayMode = mode;

    const soloBtn = document.getElementById('quick-points-mode-solo');
    const pairBtn = document.getElementById('quick-points-mode-pair');
    const pairInfo = document.getElementById('quick-points-pair-info');
    const pairSelection = document.getElementById('quick-points-pair-selection');
    const playerListContainer = document.getElementById('quick-points-player-list');

    // Button-Styling aktualisieren
    if (soloBtn) {
        soloBtn.classList.toggle('border-indigo-500', mode === 'solo');
        soloBtn.classList.toggle('bg-indigo-50', mode === 'solo');
        soloBtn.classList.toggle('text-indigo-600', mode === 'solo');
    }
    if (pairBtn) {
        pairBtn.classList.toggle('border-indigo-500', mode === 'pair');
        pairBtn.classList.toggle('bg-indigo-50', mode === 'pair');
        pairBtn.classList.toggle('text-indigo-600', mode === 'pair');
    }

    if (mode === 'pair') {
        // Paarung-Modus
        pairInfo?.classList.remove('hidden');
        pairSelection?.classList.remove('hidden');
        playerListContainer?.classList.add('hidden');

        // Info-Text je nach Übungstyp anzeigen
        const pairTextEl = document.getElementById('quick-points-pair-text');
        const pointsInfoEl = document.getElementById('quick-points-pair-points-info');

        if (selectedExerciseData && selectedExerciseData.playerType === 'a_active_b_passive') {
            // A aktiv, B passiv
            if (pairTextEl) {
                pairTextEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i><strong>Paarung:</strong> Spieler A ist <strong>aktiv</strong>, Spieler B ist <strong>passiv</strong>.';
            }
            if (pointsInfoEl) {
                pointsInfoEl.textContent = 'Spieler A erhält 100%, Spieler B erhält 50% der Punkte.';
            }
        } else {
            // Beide aktiv
            if (pairTextEl) {
                pairTextEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i><strong>Paarung:</strong> Beide Spieler sind <strong>aktiv</strong>.';
            }
            if (pointsInfoEl) {
                pointsInfoEl.textContent = 'Beide Spieler erhalten 100% der Punkte.';
            }
        }

        // Spieler-Dropdowns befüllen
        populatePairSelects();
    } else {
        // Solo/Balleimer-Modus - normale Spielerauswahl
        pairInfo?.classList.add('hidden');
        pairSelection?.classList.add('hidden');
        playerListContainer?.classList.remove('hidden');
    }

    updatePreview();
    updateSubmitButton();
}

/**
 * Setzt die Spielmodus-UI zurück
 */
function resetPlayModeUI() {
    const soloBtn = document.getElementById('quick-points-mode-solo');
    const pairBtn = document.getElementById('quick-points-mode-pair');
    const pairInfo = document.getElementById('quick-points-pair-info');
    const pairSelection = document.getElementById('quick-points-pair-selection');
    const playerListContainer = document.getElementById('quick-points-player-list');

    selectedPlayMode = null;

    // Button-Styling zurücksetzen
    [soloBtn, pairBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('border-indigo-500', 'bg-indigo-50', 'text-indigo-600');
        }
    });

    pairInfo?.classList.add('hidden');
    pairSelection?.classList.add('hidden');
    playerListContainer?.classList.remove('hidden');
}

/**
 * Befüllt die Spieler-Dropdowns für Paarung
 */
function populatePairSelects() {
    const playerASelect = document.getElementById('quick-points-player-a');
    const playerBSelect = document.getElementById('quick-points-player-b');

    if (!playerASelect || !playerBSelect) return;

    const presentPlayers = currentClubPlayers.filter(p => currentPresentPlayerIds.includes(p.id));

    // Spieler A befüllen
    playerASelect.innerHTML = '<option value="">Spieler A wählen...</option>';
    presentPlayers.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.firstName} ${p.lastName}`;
        playerASelect.appendChild(option);
    });

    // Spieler B befüllen
    playerBSelect.innerHTML = '<option value="">Spieler B wählen...</option>';
    presentPlayers.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.firstName} ${p.lastName}`;
        playerBSelect.appendChild(option);
    });
}

/**
 * Aktualisiert die Paar-Auswahl wenn sich Spieler ändern
 */
function updatePairSelection() {
    const playerAId = document.getElementById('quick-points-player-a')?.value;
    const playerBId = document.getElementById('quick-points-player-b')?.value;

    // Spieler in selectedPlayerIds aktualisieren
    selectedPlayerIds.clear();
    if (playerAId) selectedPlayerIds.add(playerAId);
    if (playerBId) selectedPlayerIds.add(playerBId);

    updatePreview();
    updateSubmitButton();
}

/**
 * Aktualisiert die Zeit-Eingabe
 */
function updateTimeInput() {
    updatePreview();
    updateSubmitButton();
}

/**
 * Holt die eingegebene Zeit in Sekunden
 */
function getTimeInSeconds() {
    const hours = parseInt(document.getElementById('quick-points-time-hours')?.value) || 0;
    const minutes = parseInt(document.getElementById('quick-points-time-minutes')?.value) || 0;
    const seconds = parseInt(document.getElementById('quick-points-time-seconds')?.value) || 0;
    return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Formatiert Sekunden zu HH:MM:SS
 */
function formatTimeFromSeconds(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Berechnet die Punkte basierend auf der aktuellen Auswahl
 */
function calculatePoints() {
    if (!selectedPointsType) return 0;

    if (selectedPointsType === 'exercise') {
        const select = document.getElementById('quick-points-exercise-select');
        const countInput = document.getElementById('quick-points-exercise-count');
        const selectedOption = select?.options[select.selectedIndex];

        if (!selectedOption?.value) return 0;

        const hasMilestones = selectedOption.dataset.hasMilestones === 'true';
        if (hasMilestones) {
            const count = parseInt(countInput?.value) || 0;
            const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
            const achievedMilestones = milestones.filter(m => count >= m.count);
            return achievedMilestones.reduce((sum, m) => sum + m.points, 0);
        } else {
            return parseInt(selectedOption.dataset.points) || 0;
        }
    }

    if (selectedPointsType === 'challenge') {
        const select = document.getElementById('quick-points-challenge-select');
        const countInput = document.getElementById('quick-points-challenge-count');
        const selectedOption = select?.options[select.selectedIndex];

        if (!selectedOption?.value) return 0;

        const hasMilestones = selectedOption.dataset.hasMilestones === 'true';
        if (hasMilestones) {
            const count = parseInt(countInput?.value) || 0;
            const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
            const achievedMilestones = milestones.filter(m => count >= m.count);
            return achievedMilestones.reduce((sum, m) => sum + m.points, 0);
        } else {
            return parseInt(selectedOption.dataset.points) || 0;
        }
    }

    if (selectedPointsType === 'manual') {
        return parseInt(document.getElementById('quick-points-manual-amount')?.value) || 0;
    }

    return 0;
}

/**
 * Aktualisiert die Vorschau
 */
function updatePreview() {
    const points = calculatePoints();
    const previewAmount = document.getElementById('quick-points-preview-amount');

    if (previewAmount) {
        // Bei Paarung mit unterschiedlicher Punkteverteilung
        if (selectedPlayMode === 'pair' && selectedExerciseData?.playerType === 'a_active_b_passive') {
            const pointsA = points;
            const pointsB = Math.round(points * 0.5);
            previewAmount.textContent = `A: +${pointsA} / B: +${pointsB} Punkte`;
            previewAmount.className = 'font-bold text-green-600';
        } else {
            const sign = points >= 0 ? '+' : '';
            previewAmount.textContent = `${sign}${points} Punkte`;
            previewAmount.className = points >= 0 ? 'font-bold text-green-600' : 'font-bold text-red-600';
        }
    }

    updatePlayerCount();
}

/**
 * Aktualisiert die Submit-Buttons
 */
function updateSubmitButton() {
    const submitBtn = document.getElementById('quick-points-submit-btn');
    const submitContinueBtn = document.getElementById('quick-points-submit-continue-btn');

    const points = calculatePoints();
    const hasPlayers = selectedPlayerIds.size > 0;
    const hasValidSelection = selectedPointsType && points !== 0;

    let isValid = hasPlayers && hasValidSelection;

    // Für manuelle Vergabe: Grund muss auch angegeben sein
    if (selectedPointsType === 'manual') {
        const reason = document.getElementById('quick-points-manual-reason')?.value?.trim();
        isValid = isValid && !!reason;
    }

    // Für Übungen: Spielmodus muss ausgewählt sein
    if (selectedPointsType === 'exercise') {
        const select = document.getElementById('quick-points-exercise-select');
        const selectedOption = select?.options[select.selectedIndex];

        // Spielmodus muss ausgewählt sein
        if (selectedOption?.value) {
            isValid = isValid && !!selectedPlayMode;

            // Bei Paarung: beide Spieler müssen ausgewählt sein
            if (selectedPlayMode === 'pair') {
                const playerAId = document.getElementById('quick-points-player-a')?.value;
                const playerBId = document.getElementById('quick-points-player-b')?.value;
                isValid = isValid && !!playerAId && !!playerBId && playerAId !== playerBId;
            }
        }

        // Für Meilenstein-Übungen: Anzahl muss angegeben sein (außer Zeit)
        if (selectedOption?.dataset.hasMilestones === 'true') {
            const unit = selectedOption?.dataset.unit || 'Wiederholungen';
            if (unit === 'Zeit') {
                const timeInSeconds = getTimeInSeconds();
                isValid = isValid && timeInSeconds > 0;
            } else {
                const count = parseInt(document.getElementById('quick-points-exercise-count')?.value) || 0;
                isValid = isValid && count > 0;
            }
        }
    }

    if (selectedPointsType === 'challenge') {
        const select = document.getElementById('quick-points-challenge-select');
        const selectedOption = select?.options[select.selectedIndex];
        if (selectedOption?.dataset.hasMilestones === 'true') {
            const count = parseInt(document.getElementById('quick-points-challenge-count')?.value) || 0;
            isValid = isValid && count > 0;
        }
    }

    if (submitBtn) submitBtn.disabled = !isValid;
    if (submitContinueBtn) submitContinueBtn.disabled = !isValid;
}

/**
 * Behandelt das Absenden der Punkte
 * @param {boolean} closeAfter - Ob das Modal nach dem Speichern geschlossen werden soll
 */
async function handleQuickPointsSubmit(closeAfter = true) {
    const submitBtn = document.getElementById('quick-points-submit-btn');
    const submitContinueBtn = document.getElementById('quick-points-submit-continue-btn');
    const feedbackEl = document.getElementById('quick-points-feedback');

    if (selectedPlayerIds.size === 0) return;

    // Beide Buttons deaktivieren während des Speicherns
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird vergeben...';
    }
    if (submitContinueBtn) {
        submitContinueBtn.disabled = true;
        submitContinueBtn.textContent = 'Wird vergeben...';
    }

    const points = calculatePoints();
    if (points === 0) {
        feedbackEl.textContent = 'Keine Punkte zum Vergeben';
        feedbackEl.className = 'text-sm font-medium text-center text-red-600';
        resetButtonTexts();
        updateSubmitButton();
        return;
    }

    let reason = '';
    let exerciseId = null;
    let challengeId = null;
    let milestoneCount = null;
    let exerciseName = null; // Name der Übung/Challenge für Training-Zusammenfassung

    if (selectedPointsType === 'exercise') {
        const select = document.getElementById('quick-points-exercise-select');
        const selectedOption = select?.options[select.selectedIndex];
        exerciseName = selectedOption?.dataset.title || 'Unbekannt';
        reason = `Übung: ${exerciseName}`;
        exerciseId = selectedOption?.value;

        if (selectedOption?.dataset.hasMilestones === 'true') {
            milestoneCount = parseInt(document.getElementById('quick-points-exercise-count')?.value) || 0;
            reason += ` (${milestoneCount}×)`;
        }
    } else if (selectedPointsType === 'challenge') {
        const select = document.getElementById('quick-points-challenge-select');
        const selectedOption = select?.options[select.selectedIndex];
        exerciseName = selectedOption?.dataset.title || 'Unbekannt';
        reason = `Challenge: ${exerciseName}`;
        challengeId = selectedOption?.value;

        if (selectedOption?.dataset.hasMilestones === 'true') {
            milestoneCount = parseInt(document.getElementById('quick-points-challenge-count')?.value) || 0;
            reason += ` (${milestoneCount}×)`;
        }
    } else if (selectedPointsType === 'manual') {
        reason = document.getElementById('quick-points-manual-reason')?.value || 'Manuelle Vergabe';
    }

    const awardedBy = currentUserData ? `${currentUserData.firstName} ${currentUserData.lastName}` : 'Trainer';
    const now = new Date().toISOString();

    try {
        let successCount = 0;
        const playerIds = Array.from(selectedPlayerIds);

        // Punkte pro Spieler berechnen (für Paarung mit unterschiedlicher Verteilung)
        const getPlayerPoints = (playerId) => {
            if (selectedPlayMode === 'pair' && selectedExerciseData) {
                const playerAId = document.getElementById('quick-points-player-a')?.value;
                const playerBId = document.getElementById('quick-points-player-b')?.value;

                if (selectedExerciseData.playerType === 'a_active_b_passive') {
                    // Spieler A: 100%, Spieler B: 50%
                    if (playerId === playerAId) {
                        return points;
                    } else if (playerId === playerBId) {
                        return Math.round(points * 0.5);
                    }
                }
                // both_active: beide 100%
            }
            return points;
        };

        // Paar-Info für Reason hinzufügen
        if (selectedPlayMode === 'pair') {
            const playerAId = document.getElementById('quick-points-player-a')?.value;
            const playerBId = document.getElementById('quick-points-player-b')?.value;
            const playerA = currentClubPlayers.find(p => p.id === playerAId);
            const playerB = currentClubPlayers.find(p => p.id === playerBId);
            if (playerA && playerB) {
                reason += ` [Paarung: ${playerA.firstName} & ${playerB.firstName}]`;
            }
        }

        // Batch-Verarbeitung um Netzwerküberlastung zu vermeiden
        const BATCH_SIZE = 5;
        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
            const batch = playerIds.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (playerId) => {
                try {
                    // Punkte für diesen Spieler berechnen (kann unterschiedlich sein bei Paarung)
                    const playerPoints = getPlayerPoints(playerId);

                    // Punkte zum Spieler hinzufügen
                    const { error: rpcError } = await supabase.rpc('add_player_points', {
                        p_user_id: playerId,
                        p_points: playerPoints,
                        p_xp: playerPoints
                    });

                    if (rpcError) {
                        console.warn('[QuickPoints] Error adding points via RPC:', rpcError);
                        // Fallback: Direktes Update
                        const { data: playerData } = await supabase
                            .from('profiles')
                            .select('points, xp')
                            .eq('id', playerId)
                            .single();

                        if (playerData) {
                            const currentPoints = playerData.points || 0;
                            const currentXP = playerData.xp || 0;

                            await supabase.from('profiles').update({
                                points: Math.max(0, currentPoints + playerPoints),
                                xp: Math.max(0, currentXP + playerPoints),
                                last_xp_update: now
                            }).eq('id', playerId);
                        }
                    }

                    // Partner-ID ermitteln
                    let historyPartnerId = null;
                    if (selectedPlayMode === 'pair') {
                        const playerAId = document.getElementById('quick-points-player-a')?.value;
                        const playerBId = document.getElementById('quick-points-player-b')?.value;
                        historyPartnerId = playerId === playerAId ? playerBId : playerAId;
                    }

                    // Punkte-Historie eintragen
                    await supabase.from('points_history').insert({
                        user_id: playerId,
                        points: playerPoints,
                        xp: playerPoints,
                        elo_change: 0,
                        reason,
                        timestamp: now,
                        awarded_by: awardedBy,
                        play_mode: selectedPlayMode || 'solo',
                        partner_id: historyPartnerId
                    });

                    // XP-Historie eintragen
                    await supabase.from('xp_history').insert({
                        user_id: playerId,
                        xp: playerPoints,
                        reason,
                        source: selectedPointsType === 'exercise' ? 'exercise' :
                               selectedPointsType === 'challenge' ? 'challenge' : 'manual'
                    });

                    // Completed exercises/challenges eintragen
                    if (exerciseId) {
                        // Partner-ID ermitteln für Paarung
                        let partnerId = null;
                        if (selectedPlayMode === 'pair') {
                            const playerAId = document.getElementById('quick-points-player-a')?.value;
                            const playerBId = document.getElementById('quick-points-player-b')?.value;
                            // Partner ist der jeweils andere Spieler
                            partnerId = playerId === playerAId ? playerBId : playerAId;
                        }

                        await supabase.from('completed_exercises').upsert({
                            user_id: playerId,
                            exercise_id: exerciseId,
                            play_mode: selectedPlayMode || 'solo',
                            partner_id: partnerId,
                            completed_at: now
                        });

                        // Bei Meilenstein-Übungen: Fortschritt und Rekord speichern
                        if (milestoneCount !== null && milestoneCount > 0) {
                            // Rekord über die neue Funktion speichern
                            try {
                                await supabase.rpc('update_exercise_record', {
                                    p_user_id: playerId,
                                    p_exercise_id: exerciseId,
                                    p_record_value: milestoneCount,
                                    p_play_mode: selectedPlayMode || 'solo',
                                    p_partner_id: partnerId,
                                    p_points_earned: playerPoints
                                });
                            } catch (rpcErr) {
                                console.warn('[QuickPoints] RPC update_exercise_record not available, using fallback');

                                // Fallback: Alte Methode
                                const { data: existingProgress } = await supabase
                                    .from('exercise_milestones')
                                    .select('current_count')
                                    .eq('user_id', playerId)
                                    .eq('exercise_id', exerciseId)
                                    .maybeSingle();

                                const currentCount = existingProgress?.current_count || 0;
                                if (milestoneCount > currentCount) {
                                    const { error: milestoneError } = await supabase.from('exercise_milestones').upsert({
                                        user_id: playerId,
                                        exercise_id: exerciseId,
                                        current_count: milestoneCount,
                                        play_mode: selectedPlayMode || 'solo',
                                        partner_id: partnerId,
                                        updated_at: now
                                    }, {
                                        onConflict: 'user_id,exercise_id'
                                    });

                                    if (milestoneError) {
                                        console.error('[QuickPoints] Error saving milestone progress:', milestoneError);
                                    } else {
                                        console.log('[QuickPoints] Milestone progress saved:', playerId, exerciseId, milestoneCount);
                                    }
                                }
                            }
                        }
                    }

                    if (challengeId) {
                        await supabase.from('completed_challenges').upsert({
                            user_id: playerId,
                            challenge_id: challengeId,
                            completed_at: now
                        });

                        // Bei Meilenstein-Challenges: Fortschritt speichern
                        if (milestoneCount !== null && milestoneCount > 0) {
                            const { data: existingProgress } = await supabase
                                .from('challenge_progress')
                                .select('current_count')
                                .eq('user_id', playerId)
                                .eq('challenge_id', challengeId)
                                .maybeSingle();

                            const currentCount = existingProgress?.current_count || 0;
                            if (milestoneCount > currentCount) {
                                await supabase.from('challenge_progress').upsert({
                                    user_id: playerId,
                                    challenge_id: challengeId,
                                    current_count: milestoneCount,
                                    updated_at: now
                                }, {
                                    onConflict: 'user_id,challenge_id'
                                });
                            }
                        }
                    }

                    // Training-Zusammenfassung aktualisieren (für das Event)
                    if (currentEventId) {
                        const pointEntry = {
                            amount: points,
                            reason: reason,
                            type: selectedPointsType,
                            exercise_name: exerciseName || null
                        };
                        await addPointsToTrainingSummary(playerId, currentEventId, pointEntry);
                    }

                    successCount++;
                } catch (playerError) {
                    console.error(`[QuickPoints] Error awarding points to player ${playerId}:`, playerError);
                }
            }));

            // Kurze Pause zwischen Batches
            if (i + BATCH_SIZE < playerIds.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const sign = points >= 0 ? '+' : '';
        feedbackEl.textContent = `Erfolgreich ${sign}${points} Punkte an ${successCount} Spieler vergeben!`;
        feedbackEl.className = points >= 0
            ? 'text-sm font-medium text-center text-green-600'
            : 'text-sm font-medium text-center text-orange-600';

        if (closeAfter) {
            // Modal nach kurzer Verzögerung schließen
            setTimeout(() => {
                closeQuickPointsModal();
            }, 1500);
        } else {
            // Formular zurücksetzen für weitere Eingaben
            setTimeout(() => {
                resetFormForContinue();
                feedbackEl.textContent = '';
            }, 1500);
        }

    } catch (error) {
        console.error('[QuickPoints] Error awarding points:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'text-sm font-medium text-center text-red-600';
        resetButtonTexts();
        updateSubmitButton();
    }
}

/**
 * Setzt die Button-Texte zurück
 */
function resetButtonTexts() {
    const submitBtn = document.getElementById('quick-points-submit-btn');
    const submitContinueBtn = document.getElementById('quick-points-submit-continue-btn');
    if (submitBtn) submitBtn.textContent = 'Speichern & Schließen';
    if (submitContinueBtn) submitContinueBtn.textContent = 'Speichern & Weiter';
}

/**
 * Setzt das Formular zurück für weitere Punktevergabe
 */
function resetFormForContinue() {
    // Button-Texte zurücksetzen
    resetButtonTexts();

    // Spieler-Auswahl zurücksetzen (alle abwählen)
    selectedPlayerIds.clear();
    document.querySelectorAll('.quick-points-player-checkbox').forEach(cb => {
        cb.checked = false;
        cb.closest('label')?.classList.remove('bg-indigo-100', 'border-indigo-500');
        cb.closest('label')?.classList.add('bg-white', 'border-gray-200');
    });

    // Punkte-Typ-Auswahl zurücksetzen
    selectedPointsType = null;
    document.querySelectorAll('[id^="quick-points-type-"]').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-gray-100', 'text-gray-700');
    });

    // Alle Eingabefelder ausblenden
    document.getElementById('quick-points-exercise-container')?.classList.add('hidden');
    document.getElementById('quick-points-challenge-container')?.classList.add('hidden');
    document.getElementById('quick-points-manual-container')?.classList.add('hidden');

    // Eingabefelder zurücksetzen
    const exerciseSelect = document.getElementById('quick-points-exercise-select');
    if (exerciseSelect) exerciseSelect.selectedIndex = 0;

    const challengeSelect = document.getElementById('quick-points-challenge-select');
    if (challengeSelect) challengeSelect.selectedIndex = 0;

    const manualAmount = document.getElementById('quick-points-manual-amount');
    if (manualAmount) manualAmount.value = '';

    const manualReason = document.getElementById('quick-points-manual-reason');
    if (manualReason) manualReason.value = '';

    const exerciseCount = document.getElementById('quick-points-exercise-count');
    if (exerciseCount) exerciseCount.value = '';

    const challengeCount = document.getElementById('quick-points-challenge-count');
    if (challengeCount) challengeCount.value = '';

    // Milestone-Container ausblenden
    document.getElementById('quick-points-exercise-milestone')?.classList.add('hidden');
    document.getElementById('quick-points-challenge-milestone')?.classList.add('hidden');

    // Play mode UI zurücksetzen
    selectedPlayMode = null;
    selectedExerciseData = null;
    document.getElementById('quick-points-play-mode-container')?.classList.add('hidden');
    document.getElementById('quick-points-pair-info')?.classList.add('hidden');
    document.getElementById('quick-points-pair-selection')?.classList.add('hidden');
    document.getElementById('quick-points-time-input-container')?.classList.add('hidden');

    // Play mode buttons zurücksetzen
    const soloBtn = document.getElementById('quick-points-mode-solo');
    const pairBtn = document.getElementById('quick-points-mode-pair');
    [soloBtn, pairBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('border-indigo-500', 'bg-indigo-50', 'text-indigo-600');
        }
    });

    // Spielerliste wieder anzeigen
    document.getElementById('quick-points-player-list')?.classList.remove('hidden');

    // Paar-Auswahl zurücksetzen
    const playerASelect = document.getElementById('quick-points-player-a');
    const playerBSelect = document.getElementById('quick-points-player-b');
    if (playerASelect) playerASelect.value = '';
    if (playerBSelect) playerBSelect.value = '';

    // Zeit-Eingaben zurücksetzen
    const timeHours = document.getElementById('quick-points-time-hours');
    const timeMinutes = document.getElementById('quick-points-time-minutes');
    const timeSeconds = document.getElementById('quick-points-time-seconds');
    if (timeHours) timeHours.value = '0';
    if (timeMinutes) timeMinutes.value = '0';
    if (timeSeconds) timeSeconds.value = '0';

    // Vorschau zurücksetzen
    const previewAmount = document.getElementById('quick-points-preview-amount');
    if (previewAmount) previewAmount.textContent = '+0 Punkte';
    document.getElementById('quick-points-preview')?.classList.add('hidden');

    // Spieler-Count aktualisieren
    updatePlayerCount();

    // Buttons aktualisieren
    updateSubmitButton();
}

// Export für globale Verfügbarkeit
window.openQuickPointsModal = openQuickPointsModal;
window.closeQuickPointsModal = closeQuickPointsModal;
