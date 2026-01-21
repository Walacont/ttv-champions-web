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

        // Wait for the main content to become visible (after auth check)
        const mainContent = document.getElementById('main-content');
        if (mainContent && mainContent.style.display === 'none') {
            // Use MutationObserver to detect when main-content becomes visible
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        if (mainContent.style.display !== 'none') {
                            observer.disconnect();
                            initializeExerciseBuilder();
                        }
                    }
                }
            });
            observer.observe(mainContent, { attributes: true });

            // Also try after a short delay as fallback
            setTimeout(() => {
                if (!exerciseBuilder) {
                    observer.disconnect();
                    initializeExerciseBuilder();
                }
            }, 1000);
        } else {
            initializeExerciseBuilder();
        }
    }

    function initializeExerciseBuilder() {
        if (exerciseBuilder) return; // Already initialized

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

        // Export GIF
        const exportGifBtn = document.getElementById('tt-export-gif');
        if (exportGifBtn) {
            exportGifBtn.addEventListener('click', handleExportGif);
        }

        // Variants toggle
        const hasVariantsCheckbox = document.getElementById('tt-has-variants');
        const variantsContainer = document.getElementById('tt-variants-container');
        if (hasVariantsCheckbox && variantsContainer) {
            hasVariantsCheckbox.addEventListener('change', (e) => {
                variantsContainer.classList.toggle('hidden', !e.target.checked);
                if (e.target.checked) {
                    // Add initial variant if none exists
                    const variantsList = document.getElementById('tt-variants-list');
                    if (variantsList && variantsList.children.length === 0) {
                        addVariantRow();
                    }
                }
            });
        }

        // Repetitions toggle
        const hasRepetitionsCheckbox = document.getElementById('tt-has-repetitions');
        const repetitionsContainer = document.getElementById('tt-repetitions-container');
        if (hasRepetitionsCheckbox && repetitionsContainer) {
            hasRepetitionsCheckbox.addEventListener('change', (e) => {
                repetitionsContainer.classList.toggle('hidden', !e.target.checked);
            });
        }

        // Add variant button
        const addVariantBtn = document.getElementById('tt-add-variant-btn');
        if (addVariantBtn) {
            addVariantBtn.addEventListener('click', addVariantRow);
        }
    }

    let variantCounter = 0;

    function addVariantRow() {
        const variantsList = document.getElementById('tt-variants-list');
        if (!variantsList) return;

        const variantId = variantCounter++;
        const variantHtml = `
            <div class="variant-row bg-slate-50 rounded-lg p-2 border border-slate-200" data-variant-id="${variantId}">
                <div class="flex items-center gap-1 mb-1">
                    <span class="text-[9px] text-slate-500">Wenn</span>
                    <select class="variant-condition px-1.5 py-0.5 text-[10px] border border-slate-200 rounded bg-white">
                        <option value="RH">in RH</option>
                        <option value="VH">in VH</option>
                        <option value="kurz">kurz</option>
                        <option value="lang">lang</option>
                    </select>
                    <span class="text-[9px] text-slate-500">→</span>
                    <select class="variant-side px-1.5 py-0.5 text-[10px] border border-slate-200 rounded bg-white">
                        <option value="RH">RH</option>
                        <option value="VH">VH</option>
                    </select>
                    <select class="variant-stroke px-1.5 py-0.5 text-[10px] border border-slate-200 rounded bg-white">
                        <option value="T">T</option>
                        <option value="SCH">SCH</option>
                        <option value="B">B</option>
                        <option value="K">K</option>
                        <option value="F">F</option>
                        <option value="S">S</option>
                    </select>
                    <span class="text-[9px] text-slate-500">→</span>
                    <select class="variant-to px-1.5 py-0.5 text-[10px] border border-slate-200 rounded bg-white">
                        <option value="RH">RH</option>
                        <option value="M">M</option>
                        <option value="VH">VH</option>
                        <option value="FREI">Frei</option>
                    </select>
                    <button type="button" class="variant-remove text-red-400 hover:text-red-600 ml-1">
                        <i class="fas fa-times text-[10px]"></i>
                    </button>
                </div>
            </div>
        `;
        variantsList.insertAdjacentHTML('beforeend', variantHtml);

        // Add remove handler
        const newRow = variantsList.querySelector(`[data-variant-id="${variantId}"]`);
        const removeBtn = newRow.querySelector('.variant-remove');
        removeBtn.addEventListener('click', () => {
            newRow.remove();
        });
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

        // Aufschlag Schupf with player decides preset
        const schupfVarBtn = document.getElementById('tt-preset-schupf-var');
        if (schupfVarBtn) {
            schupfVarBtn.addEventListener('click', () => {
                loadPreset([
                    { player: 'A', strokeType: 'A', side: 'RH', fromPosition: 'RH', toPosition: 'VH', isShort: true },
                    { player: 'B', strokeType: 'SCH', side: 'VH', fromPosition: 'VH', toPosition: 'RH', isShort: true, repetitions: { min: 3, max: 8 } },
                    { player: 'A', strokeType: 'SCH', side: 'RH', fromPosition: 'RH', toPosition: 'VH', isShort: true, repetitions: { min: 3, max: 8 } },
                    { player: 'B', strokeType: 'SCH', side: 'VH', fromPosition: 'VH', toPosition: 'FREI', isShort: false, playerDecides: true,
                      variants: [
                          { condition: 'lang', side: 'VH', strokeType: 'SCH', toPosition: 'VH' },
                          { condition: 'lang', side: 'VH', strokeType: 'SCH', toPosition: 'RH' }
                      ]
                    }
                ], 'Schupf variabel');
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
        const hasVariants = document.getElementById('tt-has-variants').checked;
        const hasRepetitions = document.getElementById('tt-has-repetitions').checked;
        const playerDecides = document.getElementById('tt-player-decides').checked;

        // Collect variants if enabled
        let variants = [];
        if (hasVariants) {
            const variantRows = document.querySelectorAll('#tt-variants-list .variant-row');
            variantRows.forEach(row => {
                variants.push({
                    condition: row.querySelector('.variant-condition').value,
                    side: row.querySelector('.variant-side').value,
                    strokeType: row.querySelector('.variant-stroke').value,
                    toPosition: row.querySelector('.variant-to').value
                });
            });
        }

        // Collect repetitions if enabled
        let repetitions = undefined;
        if (hasRepetitions) {
            const repMin = parseInt(document.getElementById('tt-rep-min').value) || 1;
            const repMax = parseInt(document.getElementById('tt-rep-max').value) || repMin;
            repetitions = { min: repMin, max: Math.max(repMin, repMax) };
        }

        const step = {
            player,
            strokeType,
            side,
            fromPosition,
            toPosition,
            isShort,
            variants: variants.length > 0 ? variants : undefined,
            repetitions,
            playerDecides
        };

        steps.push(step);
        exerciseBuilder.addStep(player, strokeType, side, fromPosition, toPosition, isShort, variants.length > 0 ? variants : undefined, repetitions, playerDecides);

        updateStepsList();

        // Reset short checkbox
        document.getElementById('tt-short-checkbox').checked = false;

        // Reset variants
        const hasVariantsCheckbox = document.getElementById('tt-has-variants');
        if (hasVariantsCheckbox) {
            hasVariantsCheckbox.checked = false;
            document.getElementById('tt-variants-container').classList.add('hidden');
            document.getElementById('tt-variants-list').innerHTML = '';
        }

        // Reset repetitions
        const hasRepetitionsCheckbox = document.getElementById('tt-has-repetitions');
        if (hasRepetitionsCheckbox) {
            hasRepetitionsCheckbox.checked = false;
            document.getElementById('tt-repetitions-container').classList.add('hidden');
            document.getElementById('tt-rep-min').value = '3';
            document.getElementById('tt-rep-max').value = '8';
        }

        // Reset player decides
        const playerDecidesCheckbox = document.getElementById('tt-player-decides');
        if (playerDecidesCheckbox) {
            playerDecidesCheckbox.checked = false;
        }

        // Auto-switch player for next step
        const playerSelect = document.getElementById('tt-player-select');
        playerSelect.value = player === 'A' ? 'B' : 'A';

        // Auto-select "from" position based on where the ball landed (toPosition)
        // Only if toPosition is not "FREI" (free)
        if (toPosition && toPosition !== 'FREI') {
            const fromPositionSelect = document.getElementById('tt-from-position');
            fromPositionSelect.value = toPosition;

            // Also auto-select the side based on where the ball landed
            const sideSelect = document.getElementById('tt-side-select');
            if (toPosition === 'VH') {
                sideSelect.value = 'VH';
            } else if (toPosition === 'RH') {
                sideSelect.value = 'RH';
            }
            // For 'M' (Mitte), keep the previous side selection
        }

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
                step.isShort,
                step.variants,
                step.repetitions,
                step.playerDecides
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
            listContainer.innerHTML = '<p class="text-slate-400 text-[10px] italic">Keine Schritte</p>';
            return;
        }

        const strokeTypes = window.TT_STROKE_TYPES || {};

        listContainer.innerHTML = steps.map((step, index) => {
            const strokeData = strokeTypes[step.strokeType] || { name: step.strokeType, color: '#6B7280' };
            const shortLabel = step.isShort ? '<span class="text-amber-600 ml-1">K</span>' : '';

            // Build repetitions display
            let repLabel = '';
            if (step.repetitions && (step.repetitions.min || step.repetitions.max)) {
                const repText = step.repetitions.min === step.repetitions.max
                    ? `${step.repetitions.min}x`
                    : `${step.repetitions.min}-${step.repetitions.max}x`;
                repLabel = `<span class="bg-blue-100 text-blue-700 px-1 rounded text-[9px] ml-1">${repText}</span>`;
            }

            // Build player decides display
            let decidesLabel = '';
            if (step.playerDecides) {
                decidesLabel = `<span class="bg-violet-100 text-violet-700 px-1 rounded text-[9px] ml-1">entscheidet</span>`;
            }

            // Build variants display
            let variantsHtml = '';
            if (step.variants && step.variants.length > 0) {
                const variantTexts = step.variants.map(v => {
                    const vStrokeData = strokeTypes[v.strokeType] || { name: v.strokeType };
                    return `<span class="text-violet-600">${v.condition}→${v.side} ${vStrokeData.name}→${v.toPosition}</span>`;
                }).join(' | ');
                variantsHtml = `<div class="text-[9px] text-slate-400 mt-0.5">oder: ${variantTexts}</div>`;
            }

            return `
                <div class="tt-step-item flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 hover:bg-slate-100 transition-colors cursor-grab active:cursor-grabbing"
                     draggable="true"
                     data-step-index="${index}">
                    <div class="flex items-center gap-1 mr-1 text-slate-300 hover:text-slate-500 drag-handle">
                        <i class="fas fa-grip-vertical text-[10px]"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${step.player === 'A' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}">
                                ${step.player}
                            </span>
                            <span class="text-[10px] text-slate-600">
                                <span class="font-semibold">${step.side} ${strokeData.name}</span>
                                <span class="text-slate-400">${step.fromPosition}→${step.toPosition}</span>
                                ${shortLabel}${repLabel}${decidesLabel}
                            </span>
                        </div>
                        ${variantsHtml}
                    </div>
                    <button onclick="window.ttRemoveStep(${index})" class="text-slate-400 hover:text-red-500 p-0.5 transition-colors">
                        <i class="fas fa-times text-[10px]"></i>
                    </button>
                </div>
            `;
        }).join('');

        // Setup drag and drop event listeners
        setupStepDragAndDrop();
    }

    let draggedStepIndex = null;

    function setupStepDragAndDrop() {
        const listContainer = document.getElementById('tt-steps-list');
        if (!listContainer) return;

        const stepItems = listContainer.querySelectorAll('.tt-step-item');

        stepItems.forEach(item => {
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragend', handleDragEnd);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('dragenter', handleDragEnter);
            item.addEventListener('dragleave', handleDragLeave);
            item.addEventListener('drop', handleDrop);
        });
    }

    function handleDragStart(e) {
        draggedStepIndex = parseInt(e.currentTarget.dataset.stepIndex);
        e.currentTarget.classList.add('opacity-50', 'border-purple-400', 'border-2');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedStepIndex);
    }

    function handleDragEnd(e) {
        e.currentTarget.classList.remove('opacity-50', 'border-purple-400', 'border-2');
        // Remove all drag-over styles
        document.querySelectorAll('.tt-step-item').forEach(item => {
            item.classList.remove('border-t-2', 'border-b-2', 'border-purple-500');
        });
        draggedStepIndex = null;
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDragEnter(e) {
        e.preventDefault();
        const targetIndex = parseInt(e.currentTarget.dataset.stepIndex);
        if (targetIndex !== draggedStepIndex) {
            // Show drop indicator
            e.currentTarget.classList.remove('border-t-2', 'border-b-2');
            if (targetIndex < draggedStepIndex) {
                e.currentTarget.classList.add('border-t-2', 'border-purple-500');
            } else {
                e.currentTarget.classList.add('border-b-2', 'border-purple-500');
            }
        }
    }

    function handleDragLeave(e) {
        e.currentTarget.classList.remove('border-t-2', 'border-b-2', 'border-purple-500');
    }

    function handleDrop(e) {
        e.preventDefault();
        const targetIndex = parseInt(e.currentTarget.dataset.stepIndex);

        if (draggedStepIndex !== null && draggedStepIndex !== targetIndex) {
            moveStep(draggedStepIndex, targetIndex);
        }

        e.currentTarget.classList.remove('border-t-2', 'border-b-2', 'border-purple-500');
    }

    function moveStep(fromIndex, toIndex) {
        // Remove the step from its original position
        const [movedStep] = steps.splice(fromIndex, 1);

        // Insert at the new position
        steps.splice(toIndex, 0, movedStep);

        // Rebuild exercise builder steps
        exerciseBuilder.clearSteps();
        steps.forEach(step => {
            exerciseBuilder.addStep(
                step.player,
                step.strokeType,
                step.side,
                step.fromPosition,
                step.toPosition,
                step.isShort,
                step.variants,
                step.repetitions,
                step.playerDecides
            );
        });

        updateStepsList();
        showToast('Reihenfolge geändert', 'success');
    }

    // Make moveStep globally accessible for potential external use
    window.ttMoveStep = moveStep;

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
                step.isShort,
                step.variants,
                step.repetitions,
                step.playerDecides
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

    async function handleExportGif() {
        if (steps.length === 0) {
            showToast('Bitte füge zuerst Schritte hinzu', 'warning');
            return;
        }

        // Check if gif.js is available
        if (typeof GIF === 'undefined') {
            showToast('GIF-Library nicht geladen', 'error');
            return;
        }

        const exportBtn = document.getElementById('tt-export-gif');
        const originalText = exportBtn.innerHTML;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>...';
        exportBtn.disabled = true;

        try {
            // Create a temporary high-resolution canvas for GIF
            const tempCanvas = document.createElement('canvas');
            const gifWidth = 440;  // 2x resolution for quality
            const gifHeight = 760;
            tempCanvas.width = gifWidth;
            tempCanvas.height = gifHeight;
            const tempCtx = tempCanvas.getContext('2d');

            // Create GIF encoder
            const gif = new GIF({
                workers: 2,
                quality: 10,
                width: gifWidth,
                height: gifHeight,
                workerScript: '/js/gif.worker.js'
            });

            // Helper function to draw a frame
            function drawFrame(stepIndex, progress) {
                const step = steps[stepIndex];
                const previousStep = stepIndex > 0 ? steps[stepIndex - 1] : null;

                // Clear and draw table
                tempCtx.fillStyle = '#1a1a2e';
                tempCtx.fillRect(0, 0, gifWidth, gifHeight);

                // Scale for the temp canvas
                const scale = gifWidth / 220;
                tempCtx.save();
                tempCtx.scale(scale, scale);

                // Draw table (simplified version)
                const tableX = 20;
                const tableY = 20;
                const tableWidth = 180;
                const tableHeight = 340;

                // Table surface
                tempCtx.fillStyle = '#0d4f3c';
                tempCtx.beginPath();
                tempCtx.roundRect(tableX, tableY, tableWidth, tableHeight, 6);
                tempCtx.fill();

                // Table border
                tempCtx.strokeStyle = '#ffffff';
                tempCtx.lineWidth = 3;
                tempCtx.beginPath();
                tempCtx.roundRect(tableX, tableY, tableWidth, tableHeight, 6);
                tempCtx.stroke();

                // Center line
                tempCtx.beginPath();
                tempCtx.lineWidth = 2;
                tempCtx.moveTo(tableX + tableWidth / 2, tableY);
                tempCtx.lineTo(tableX + tableWidth / 2, tableY + tableHeight);
                tempCtx.stroke();

                // Net line
                const netY = tableY + tableHeight * 0.5;
                tempCtx.beginPath();
                tempCtx.strokeStyle = '#e0e0e0';
                tempCtx.lineWidth = 3;
                tempCtx.moveTo(tableX, netY);
                tempCtx.lineTo(tableX + tableWidth, netY);
                tempCtx.stroke();

                // Draw step information
                const strokeTypes = window.TT_STROKE_TYPES || {};
                const positions = window.TT_POSITIONS || {};
                const strokeData = strokeTypes[step.strokeType] || { name: step.strokeType, color: '#8B5CF6' };
                const isPlayerA = step.player === 'A';

                // Calculate positions
                const fromPosData = positions[step.fromPosition] || { xRatio: 0.5 };
                const toPosData = positions[step.toPosition] || { xRatio: 0.5 };

                const fromX = tableX + tableWidth * (isPlayerA ? fromPosData.xRatio : (1 - fromPosData.xRatio));
                const fromY = isPlayerA ? tableY + tableHeight * 0.85 : tableY + tableHeight * 0.15;

                const toXRatio = isPlayerA ? (1 - toPosData.xRatio) : toPosData.xRatio;
                const toX = tableX + tableWidth * toXRatio;
                let toY = isPlayerA ? tableY + tableHeight * 0.08 : tableY + tableHeight * 0.92;

                if (step.isShort) {
                    toY = isPlayerA ? netY - tableHeight * 0.1 : netY + tableHeight * 0.1;
                }

                // Animated position
                const currentX = fromX + (toX - fromX) * progress;
                const currentY = fromY + (toY - fromY) * progress;

                // Draw trajectory
                tempCtx.beginPath();
                tempCtx.strokeStyle = strokeData.color;
                tempCtx.lineWidth = 4;
                tempCtx.setLineDash([]);
                tempCtx.moveTo(fromX, fromY);
                tempCtx.lineTo(currentX, currentY);
                tempCtx.stroke();

                // Draw ball
                tempCtx.beginPath();
                tempCtx.fillStyle = '#ffffff';
                tempCtx.arc(currentX, currentY, 8, 0, Math.PI * 2);
                tempCtx.fill();
                tempCtx.strokeStyle = '#cccccc';
                tempCtx.lineWidth = 1;
                tempCtx.stroke();

                // Draw label
                const labelText = `${step.side} ${strokeData.name}`;
                const labelY = isPlayerA ? fromY + 30 : fromY - 25;

                tempCtx.font = 'bold 14px Inter, sans-serif';
                const textWidth = tempCtx.measureText(labelText).width;

                tempCtx.fillStyle = strokeData.color;
                tempCtx.beginPath();
                tempCtx.roundRect(fromX - textWidth / 2 - 10, labelY - 12, textWidth + 20, 24, 12);
                tempCtx.fill();

                tempCtx.fillStyle = '#000000';
                tempCtx.textAlign = 'center';
                tempCtx.textBaseline = 'middle';
                tempCtx.fillText(labelText, fromX, labelY);

                // Draw step number
                const stepText = `${stepIndex + 1}/${steps.length}`;
                tempCtx.font = 'bold 14px Inter, sans-serif';
                tempCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                tempCtx.beginPath();
                tempCtx.roundRect(180, 8, 30, 24, 12);
                tempCtx.fill();
                tempCtx.fillStyle = '#1a1a2e';
                tempCtx.fillText(stepText, 195, 20);

                tempCtx.restore();
            }

            // Generate frames for each step
            const framesPerStep = 15;
            const holdFrames = 20;

            for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
                // Animation frames
                for (let frame = 0; frame <= framesPerStep; frame++) {
                    const progress = frame / framesPerStep;
                    drawFrame(stepIdx, progress);
                    gif.addFrame(tempCtx, { copy: true, delay: 50 });
                }
                // Hold frames at end
                for (let hold = 0; hold < holdFrames; hold++) {
                    drawFrame(stepIdx, 1);
                    gif.addFrame(tempCtx, { copy: true, delay: 50 });
                }
            }

            // Render and download
            gif.on('finished', function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                const nameInput = document.getElementById('tt-exercise-name');
                const name = nameInput ? nameInput.value.trim() : 'uebung';
                link.download = `${name || 'tischtennis-uebung'}.gif`;
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);

                exportBtn.innerHTML = originalText;
                exportBtn.disabled = false;
                showToast('GIF exportiert!', 'success');
            });

            gif.render();
        } catch (error) {
            console.error('GIF export error:', error);
            showToast('Fehler beim GIF-Export', 'error');
            exportBtn.innerHTML = originalText;
            exportBtn.disabled = false;
        }
    }

    function generateExerciseDescription() {
        const strokeTypes = window.TT_STROKE_TYPES || {};
        let description = 'Tischtennis Übung:\n\n';

        steps.forEach((step, index) => {
            const strokeData = strokeTypes[step.strokeType] || { name: step.strokeType };
            const shortText = step.isShort ? ' kurz' : '';
            const toText = step.toPosition === 'FREI' ? 'frei' : step.toPosition;

            // Build repetition text
            let repText = '';
            if (step.repetitions && (step.repetitions.min || step.repetitions.max)) {
                repText = step.repetitions.min === step.repetitions.max
                    ? ` (${step.repetitions.min}x)`
                    : ` (${step.repetitions.min}-${step.repetitions.max}x)`;
            }

            // Build player decides text
            const decidesText = step.playerDecides ? ' [Spieler entscheidet]' : '';

            description += `${index + 1}. Spieler ${step.player}: ${step.side} ${strokeData.name}${shortText} aus ${step.fromPosition} in die ${toText}${repText}${decidesText}\n`;

            // Add variants to description
            if (step.variants && step.variants.length > 0) {
                step.variants.forEach(variant => {
                    const variantStrokeData = strokeTypes[variant.strokeType] || { name: variant.strokeType };
                    const variantToText = variant.toPosition === 'FREI' ? 'frei' : variant.toPosition;
                    description += `   oder wenn ${variant.condition}: ${variant.side} ${variantStrokeData.name} → ${variantToText}\n`;
                });
            }
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
