// Quick Points Dialog Module (Supabase-Version)
// Ermöglicht schnelle Punktevergabe nach Anwesenheitserfassung

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let currentPresentPlayerIds = [];
let currentClubPlayers = [];
let currentUserData = null;
let selectedPlayerIds = new Set();
let selectedPointsType = null;
let exercisesData = [];
let challengesData = [];

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

    // Submit button
    document.getElementById('quick-points-submit-btn')?.addEventListener('click', handleQuickPointsSubmit);

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
}

/**
 * Öffnet den Quick Points Dialog nach dem Speichern der Anwesenheit
 */
export async function openQuickPointsModal(presentPlayerIds, clubPlayers, userData) {
    const modal = document.getElementById('quick-points-modal');
    if (!modal) return;

    currentPresentPlayerIds = presentPlayerIds;
    currentClubPlayers = clubPlayers;
    currentUserData = userData;
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

    // Reset feedback
    const feedback = document.getElementById('quick-points-feedback');
    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'text-sm font-medium text-center';
    }

    // Disable submit
    const submitBtn = document.getElementById('quick-points-submit-btn');
    if (submitBtn) submitBtn.disabled = true;
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
        const { data, error } = await supabase
            .from('exercises')
            .select('*')
            .order('name', { ascending: true });

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

            if (hasTieredPoints) {
                option.dataset.milestones = JSON.stringify(e.tiered_points.milestones);
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

        const infoEl = document.getElementById('quick-points-exercise-milestone-info');
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
        const sign = points >= 0 ? '+' : '';
        previewAmount.textContent = `${sign}${points} Punkte`;
        previewAmount.className = points >= 0 ? 'font-bold text-green-600' : 'font-bold text-red-600';
    }

    updatePlayerCount();
}

/**
 * Aktualisiert den Submit-Button
 */
function updateSubmitButton() {
    const submitBtn = document.getElementById('quick-points-submit-btn');
    if (!submitBtn) return;

    const points = calculatePoints();
    const hasPlayers = selectedPlayerIds.size > 0;
    const hasValidSelection = selectedPointsType && points !== 0;

    let isValid = hasPlayers && hasValidSelection;

    // Für manuelle Vergabe: Grund muss auch angegeben sein
    if (selectedPointsType === 'manual') {
        const reason = document.getElementById('quick-points-manual-reason')?.value?.trim();
        isValid = isValid && !!reason;
    }

    // Für Meilenstein-Übungen/Challenges: Anzahl muss angegeben sein
    if (selectedPointsType === 'exercise') {
        const select = document.getElementById('quick-points-exercise-select');
        const selectedOption = select?.options[select.selectedIndex];
        if (selectedOption?.dataset.hasMilestones === 'true') {
            const count = parseInt(document.getElementById('quick-points-exercise-count')?.value) || 0;
            isValid = isValid && count > 0;
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

    submitBtn.disabled = !isValid;
}

/**
 * Behandelt das Absenden der Punkte
 */
async function handleQuickPointsSubmit() {
    const submitBtn = document.getElementById('quick-points-submit-btn');
    const feedbackEl = document.getElementById('quick-points-feedback');

    if (!submitBtn || selectedPlayerIds.size === 0) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird vergeben...';

    const points = calculatePoints();
    if (points === 0) {
        feedbackEl.textContent = 'Keine Punkte zum Vergeben';
        feedbackEl.className = 'text-sm font-medium text-center text-red-600';
        submitBtn.textContent = 'Punkte vergeben';
        updateSubmitButton();
        return;
    }

    let reason = '';
    let exerciseId = null;
    let challengeId = null;

    if (selectedPointsType === 'exercise') {
        const select = document.getElementById('quick-points-exercise-select');
        const selectedOption = select?.options[select.selectedIndex];
        reason = `Übung: ${selectedOption?.dataset.title || 'Unbekannt'}`;
        exerciseId = selectedOption?.value;

        if (selectedOption?.dataset.hasMilestones === 'true') {
            const count = document.getElementById('quick-points-exercise-count')?.value;
            reason += ` (${count}×)`;
        }
    } else if (selectedPointsType === 'challenge') {
        const select = document.getElementById('quick-points-challenge-select');
        const selectedOption = select?.options[select.selectedIndex];
        reason = `Challenge: ${selectedOption?.dataset.title || 'Unbekannt'}`;
        challengeId = selectedOption?.value;

        if (selectedOption?.dataset.hasMilestones === 'true') {
            const count = document.getElementById('quick-points-challenge-count')?.value;
            reason += ` (${count}×)`;
        }
    } else if (selectedPointsType === 'manual') {
        reason = document.getElementById('quick-points-manual-reason')?.value || 'Manuelle Vergabe';
    }

    const awardedBy = currentUserData ? `${currentUserData.firstName} ${currentUserData.lastName}` : 'Trainer';
    const now = new Date().toISOString();

    try {
        let successCount = 0;
        const playerIds = Array.from(selectedPlayerIds);

        // Batch-Verarbeitung um Netzwerküberlastung zu vermeiden
        const BATCH_SIZE = 5;
        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
            const batch = playerIds.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (playerId) => {
                try {
                    // Punkte zum Spieler hinzufügen
                    const { error: rpcError } = await supabase.rpc('add_player_points', {
                        p_user_id: playerId,
                        p_points: points,
                        p_xp: points
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
                                points: Math.max(0, currentPoints + points),
                                xp: Math.max(0, currentXP + points),
                                last_xp_update: now
                            }).eq('id', playerId);
                        }
                    }

                    // Punkte-Historie eintragen
                    await supabase.from('points_history').insert({
                        user_id: playerId,
                        points: points,
                        xp: points,
                        elo_change: 0,
                        reason,
                        timestamp: now,
                        awarded_by: awardedBy
                    });

                    // XP-Historie eintragen
                    await supabase.from('xp_history').insert({
                        user_id: playerId,
                        xp: points,
                        reason,
                        source: selectedPointsType === 'exercise' ? 'exercise' :
                               selectedPointsType === 'challenge' ? 'challenge' : 'manual'
                    });

                    // Completed exercises/challenges eintragen
                    if (exerciseId) {
                        await supabase.from('completed_exercises').upsert({
                            user_id: playerId,
                            exercise_id: exerciseId,
                            completed_at: now
                        });
                    }

                    if (challengeId) {
                        await supabase.from('completed_challenges').upsert({
                            user_id: playerId,
                            challenge_id: challengeId,
                            completed_at: now
                        });
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

        // Modal nach kurzer Verzögerung schließen
        setTimeout(() => {
            closeQuickPointsModal();
        }, 1500);

    } catch (error) {
        console.error('[QuickPoints] Error awarding points:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'text-sm font-medium text-center text-red-600';
        submitBtn.textContent = 'Punkte vergeben';
        updateSubmitButton();
    }
}

// Export für globale Verfügbarkeit
window.openQuickPointsModal = openQuickPointsModal;
window.closeQuickPointsModal = closeQuickPointsModal;
