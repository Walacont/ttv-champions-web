/**
 * Table Tennis Exercise Builder UI
 * Handles form interactions and connects to the canvas animation
 */

(function() {
    'use strict';

    let exerciseBuilder = null;
    let steps = [];

    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', initTableTennisUI);

    function initTableTennisUI() {
        // Check if we're on admin page with the exercise builder section
        const canvas = document.getElementById('tt-exercise-canvas');
        if (!canvas) return;

        // Initialize the canvas builder
        exerciseBuilder = new TableTennisExerciseBuilder('tt-exercise-canvas');

        // Setup event listeners
        setupFormListeners();
        setupPlaybackControls();
        setupPresets();
        setupLegendToggle();
    }

    function setupFormListeners() {
        // Add step form
        const addStepForm = document.getElementById('tt-add-step-form');
        if (addStepForm) {
            addStepForm.addEventListener('submit', handleAddStep);
        }

        // Clear all steps
        const clearBtn = document.getElementById('tt-clear-steps');
        if (clearBtn) {
            clearBtn.addEventListener('click', handleClearSteps);
        }

        // Save exercise
        const saveBtn = document.getElementById('tt-save-exercise');
        if (saveBtn) {
            saveBtn.addEventListener('click', handleSaveExercise);
        }
    }

    function setupPlaybackControls() {
        const playBtn = document.getElementById('tt-play-btn');
        const pauseBtn = document.getElementById('tt-pause-btn');
        const resetBtn = document.getElementById('tt-reset-btn');
        const loopToggle = document.getElementById('tt-loop-toggle');

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                if (steps.length === 0) {
                    showToast('Bitte füge zuerst Schritte hinzu', 'warning');
                    return;
                }
                exerciseBuilder.play();
                playBtn.classList.add('hidden');
                pauseBtn.classList.remove('hidden');
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                exerciseBuilder.pause();
                pauseBtn.classList.add('hidden');
                playBtn.classList.remove('hidden');
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                exerciseBuilder.reset();
                pauseBtn.classList.add('hidden');
                playBtn.classList.remove('hidden');
            });
        }

        if (loopToggle) {
            loopToggle.addEventListener('change', (e) => {
                exerciseBuilder.loopAnimation = e.target.checked;
            });
        }
    }

    function setupPresets() {
        // Falkenberg preset
        const falkenbergBtn = document.getElementById('tt-preset-falkenberg');
        if (falkenbergBtn) {
            falkenbergBtn.addEventListener('click', () => {
                loadPreset([
                    { player: 'A', strokeType: 'T', side: 'RH', fromPosition: 'RH', toPosition: 'RH', isShort: false },
                    { player: 'B', strokeType: 'B', side: 'RH', fromPosition: 'RH', toPosition: 'RH', isShort: false },
                    { player: 'A', strokeType: 'T', side: 'VH', fromPosition: 'RH', toPosition: 'RH', isShort: false },
                    { player: 'B', strokeType: 'B', side: 'RH', fromPosition: 'RH', toPosition: 'VH', isShort: false },
                    { player: 'A', strokeType: 'T', side: 'VH', fromPosition: 'VH', toPosition: 'RH', isShort: false }
                ], 'Falkenberg');
            });
        }

        // Aufschlag RH preset
        const aufschlagBtn = document.getElementById('tt-preset-aufschlag-rh');
        if (aufschlagBtn) {
            aufschlagBtn.addEventListener('click', () => {
                loadPreset([
                    { player: 'A', strokeType: 'A', side: 'RH', fromPosition: 'RH', toPosition: 'RH', isShort: true },
                    { player: 'B', strokeType: 'SCH', side: 'RH', fromPosition: 'RH', toPosition: 'VH', isShort: false },
                    { player: 'A', strokeType: 'T', side: 'VH', fromPosition: 'VH', toPosition: 'RH', isShort: false }
                ], 'Aufschlag RH');
            });
        }

        // Topspin Counter preset
        const topspinBtn = document.getElementById('tt-preset-topspin-counter');
        if (topspinBtn) {
            topspinBtn.addEventListener('click', () => {
                loadPreset([
                    { player: 'A', strokeType: 'T', side: 'RH', fromPosition: 'RH', toPosition: 'RH', isShort: false },
                    { player: 'B', strokeType: 'K', side: 'RH', fromPosition: 'RH', toPosition: 'RH', isShort: false },
                    { player: 'A', strokeType: 'K', side: 'RH', fromPosition: 'RH', toPosition: 'VH', isShort: false },
                    { player: 'B', strokeType: 'T', side: 'VH', fromPosition: 'VH', toPosition: 'RH', isShort: false }
                ], 'Topspin-Konter');
            });
        }
    }

    function setupLegendToggle() {
        const toggleBtn = document.getElementById('tt-toggle-legend');
        const legendContent = document.getElementById('tt-legend-content');
        const legendIcon = document.getElementById('tt-legend-icon');

        if (toggleBtn && legendContent && legendIcon) {
            toggleBtn.addEventListener('click', () => {
                legendContent.classList.toggle('hidden');
                legendIcon.style.transform = legendContent.classList.contains('hidden') ? '' : 'rotate(180deg)';
            });
        }
    }

    function handleAddStep(e) {
        e.preventDefault();

        const player = document.getElementById('tt-player-select').value;
        const side = document.getElementById('tt-side-select').value;
        const strokeType = document.getElementById('tt-stroke-select').value;
        const fromPosition = document.getElementById('tt-from-position').value;
        const toPosition = document.getElementById('tt-to-position').value;
        const isShort = document.getElementById('tt-short-checkbox').checked;

        const step = {
            player,
            strokeType,
            side,
            fromPosition,
            toPosition,
            isShort
        };

        steps.push(step);
        exerciseBuilder.addStep(player, strokeType, side, fromPosition, toPosition, isShort);

        updateStepsList();

        // Reset short checkbox
        document.getElementById('tt-short-checkbox').checked = false;

        // Auto-switch player for next step
        const playerSelect = document.getElementById('tt-player-select');
        playerSelect.value = player === 'A' ? 'B' : 'A';

        showToast('Schritt hinzugefügt', 'success');
    }

    function handleClearSteps() {
        if (steps.length === 0) return;

        if (confirm('Alle Schritte löschen?')) {
            steps = [];
            exerciseBuilder.clearSteps();
            updateStepsList();
            showToast('Alle Schritte gelöscht', 'info');
        }
    }

    function loadPreset(presetSteps, name) {
        steps = [...presetSteps];
        exerciseBuilder.clearSteps();

        presetSteps.forEach(step => {
            exerciseBuilder.addStep(
                step.player,
                step.strokeType,
                step.side,
                step.fromPosition,
                step.toPosition,
                step.isShort
            );
        });

        updateStepsList();

        // Set exercise name
        const nameInput = document.getElementById('tt-exercise-name');
        if (nameInput) {
            nameInput.value = name;
        }

        showToast(`Vorlage "${name}" geladen`, 'success');
    }

    function updateStepsList() {
        const listContainer = document.getElementById('tt-steps-list');
        if (!listContainer) return;

        if (steps.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 text-sm italic">Noch keine Schritte hinzugefügt.</p>';
            return;
        }

        const strokeTypes = window.TT_STROKE_TYPES || {};

        listContainer.innerHTML = steps.map((step, index) => {
            const strokeData = strokeTypes[step.strokeType] || { name: step.strokeType, color: '#6B7280' };
            const shortLabel = step.isShort ? ' <span class="text-xs text-orange-600">(kurz)</span>' : '';

            return `
                <div class="flex items-center justify-between bg-white border rounded-lg p-2 hover:bg-gray-50">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${step.player === 'A' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}">
                            ${step.player}
                        </span>
                        <span class="text-sm">
                            <span class="font-medium">${step.side} ${strokeData.name}</span>
                            <span class="text-gray-500"> aus ${step.fromPosition} in ${step.toPosition}</span>
                            ${shortLabel}
                        </span>
                    </div>
                    <button onclick="window.ttRemoveStep(${index})" class="text-red-500 hover:text-red-700 p-1">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    // Remove step function (globally accessible)
    window.ttRemoveStep = function(index) {
        steps.splice(index, 1);

        // Rebuild exercise builder steps
        exerciseBuilder.clearSteps();
        steps.forEach(step => {
            exerciseBuilder.addStep(
                step.player,
                step.strokeType,
                step.side,
                step.fromPosition,
                step.toPosition,
                step.isShort
            );
        });

        updateStepsList();
        showToast('Schritt entfernt', 'info');
    };

    function handleSaveExercise() {
        const nameInput = document.getElementById('tt-exercise-name');
        const name = nameInput ? nameInput.value.trim() : '';

        if (!name) {
            showToast('Bitte gib einen Namen für die Übung ein', 'warning');
            return;
        }

        if (steps.length === 0) {
            showToast('Bitte füge zuerst Schritte hinzu', 'warning');
            return;
        }

        const exerciseData = {
            name,
            steps: steps,
            type: 'table-tennis-animation',
            createdAt: new Date().toISOString()
        };

        // For now, save to localStorage (can be extended to save to database)
        const savedExercises = JSON.parse(localStorage.getItem('tt-saved-exercises') || '[]');
        savedExercises.push(exerciseData);
        localStorage.setItem('tt-saved-exercises', JSON.stringify(savedExercises));

        showToast(`Übung "${name}" gespeichert`, 'success');

        // Generate description for the exercise form
        const description = generateExerciseDescription();
        copyToClipboard(description);

        showToast('Beschreibung in Zwischenablage kopiert', 'info');
    }

    function generateExerciseDescription() {
        const strokeTypes = window.TT_STROKE_TYPES || {};
        let description = 'Tischtennis Übung:\n\n';

        steps.forEach((step, index) => {
            const strokeData = strokeTypes[step.strokeType] || { name: step.strokeType };
            const shortText = step.isShort ? ' kurz' : '';
            description += `${index + 1}. Spieler ${step.player}: ${step.side} ${strokeData.name}${shortText} aus ${step.fromPosition} in die ${step.toPosition}\n`;
        });

        return description;
    }

    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
        } else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
    }

    function showToast(message, type = 'info') {
        // Try to use existing toast system if available
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
            return;
        }

        // Fallback toast implementation
        const toast = document.createElement('div');
        toast.className = `fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg text-white z-50 transition-opacity duration-300 ${
            type === 'success' ? 'bg-green-600' :
            type === 'warning' ? 'bg-yellow-600' :
            type === 'error' ? 'bg-red-600' :
            'bg-blue-600'
        }`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

})();
