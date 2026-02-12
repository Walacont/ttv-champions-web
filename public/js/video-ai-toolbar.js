/**
 * Video AI Toolbar - UI-Controls für KI-Videoanalyse
 * Erstellt einen KI-Analyse-Button und ein Floating-Panel.
 * Integriert: Skelett-Overlay, Schlag-Klassifizierung, Bewegungsqualität.
 */

import {
    isAIAvailable,
    loadModels,
    detectPose,
    analyzeFrameRange,
    isModelLoaded,
    saveAnalysisResults,
    loadAnalysisResults,
    loadReferenceAnalysis,
    comparePoses,
    clearCache
} from './video-ai-engine.js';
import { VideoAIOverlay } from './video-ai-overlay.js';
import { classifyShots, renderShotStats, saveShotLabels } from './video-ai-shot-classifier.js';
import { analyzeBallMachineSession, renderConsistencyTimeline, renderMovementSummary } from './video-ai-movement-quality.js';

let aiOverlay = null;
let abortController = null;
let lastAnalysisResults = null; // Cached results for panel re-open
let lastSavedFrames = null;    // Cached frames for player-switch re-analysis
let lastContext = null;        // Cached context for re-analysis
let lastVideoId = null;        // Cached videoId for re-analysis
let selectedPlayerIdx = 0;     // Aktuell ausgewählter Spieler (0 oder 1)

/**
 * Initialisiert die AI-Toolbar für ein Video im Detail-Modal.
 * @param {HTMLVideoElement} videoPlayer - Das Video-Element
 * @param {string} videoId - Die Video-ID
 * @param {Object} context - videoAnalysisContext (db, userId, etc.)
 */
export async function setupAIToolbar(videoPlayer, videoId, context) {
    if (!isAIAvailable()) {
        console.log('[AI Toolbar] AI not available on this platform');
        return;
    }

    const aiBtn = document.getElementById('ai-analysis-btn');
    if (!aiBtn) return;

    // Button sichtbar machen
    aiBtn.classList.remove('hidden');

    // Altes Overlay aufräumen
    if (aiOverlay) {
        aiOverlay.destroy();
        aiOverlay = null;
    }
    lastAnalysisResults = null;

    // Neues Overlay erstellen
    aiOverlay = new VideoAIOverlay(videoPlayer);

    // Panel erstellen (falls nicht vorhanden)
    // Wird an den Modal-Container gehängt (nicht video-player-container),
    // damit fixed-Positionierung nicht durch overflow:hidden abgeschnitten wird.
    let panel = document.getElementById('ai-analysis-panel');
    if (!panel) {
        panel = createAIPanel();
        const modal = document.getElementById('video-detail-modal');
        if (modal) {
            modal.appendChild(panel);
        }
    }

    // Prüfen ob bereits gespeicherte Ergebnisse vorliegen
    if (context.db) {
        try {
            const saved = await loadAnalysisResults(context.db, videoId);
            if (saved && saved.frames && saved.frames.length > 0) {
                aiOverlay.setSavedFrames(saved.frames);
                // Overlay sofort aktivieren damit Skelett sichtbar ist
                aiOverlay.activate();
                updatePanelStatus('saved', saved.analysis.frames_analyzed);

                // Sofort Shot-Klassifizierung + Movement Quality auf gespeicherten Frames
                runPostAnalysis(saved.frames, context, videoId);

                // Auto-Referenz: Wenn Video einer Übung zugewiesen ist,
                // automatisch Musterbeispiel laden und vergleichen
                if (context.exerciseId) {
                    autoCompareWithExerciseReference(context, videoId);
                }
            }
        } catch (e) {
            console.warn('[AI Toolbar] Could not load saved results:', e);
        }

        // Gespeicherte Claude-Technik-Analyse laden
        try {
            const { data: claudeAnalysis } = await context.db
                .from('video_ai_analyses')
                .select('results')
                .eq('video_id', videoId)
                .eq('analysis_type', 'claude_technique_analysis')
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (claudeAnalysis?.results) {
                // Ergebnis anzeigen nachdem Panel erstellt wurde
                setTimeout(() => {
                    const resultContainer = document.getElementById('ai-technique-result');
                    if (resultContainer) {
                        resultContainer.classList.remove('hidden');
                        renderTechniqueResult(resultContainer, claudeAnalysis.results);
                    }
                }, 100);
            }
        } catch (e) {
            // Nicht kritisch - Claude-Analyse ist optional
        }
    }

    // Kontext speichern für Re-Analyze-Button
    window._aiToolbarContext = { videoPlayer, videoId, context };

    // Button Click-Handler
    aiBtn.onclick = () => {
        toggleAIPanel(panel);
    };

    // Panel Event-Handler einrichten
    setupPanelEvents(panel, videoPlayer, videoId, context);
}

/**
 * Erstellt das AI-Analyse-Panel
 */
function createAIPanel() {
    const panel = document.createElement('div');
    panel.id = 'ai-analysis-panel';
    panel.className = 'ai-analysis-panel';
    panel.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.92);
        border-radius: 16px;
        z-index: 60;
        min-width: 280px;
        max-width: 360px;
        max-height: 60vh;
        overflow-y: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        color: white;
        font-size: 13px;
    `;

    panel.innerHTML = `
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
                <i class="fas fa-robot text-blue-400"></i>
                <span class="font-medium">KI-Analyse</span>
            </div>
            <button id="ai-panel-close" class="text-gray-400 hover:text-white transition-colors p-1">
                <i class="fas fa-times text-sm"></i>
            </button>
        </div>

        <!-- Status -->
        <div id="ai-status" class="mb-3 text-xs text-gray-400">
            <span id="ai-status-text">Bereit</span>
        </div>

        <!-- Fortschrittsbalken -->
        <div id="ai-progress-container" class="hidden mb-3">
            <div class="w-full bg-gray-700 rounded-full h-1.5">
                <div id="ai-progress-bar" class="bg-blue-500 h-1.5 rounded-full transition-all duration-200" style="width: 0%"></div>
            </div>
            <div class="flex justify-between mt-1 text-xs text-gray-500">
                <span id="ai-progress-text">0%</span>
                <button id="ai-cancel-btn" class="text-red-400 hover:text-red-300 hidden">Abbrechen</button>
            </div>
        </div>

        <!-- Toggles (kompakt) -->
        <div id="ai-toggles" class="flex items-center gap-3 mb-3 text-xs">
            <label class="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" id="ai-toggle-skeleton" checked
                       class="rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-0 w-3.5 h-3.5">
                <span>Skelett</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" id="ai-toggle-player1" checked
                       class="rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-0 w-3.5 h-3.5">
                <span>P1</span>
            </label>
            <label class="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" id="ai-toggle-player2" checked
                       class="rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-0 w-3.5 h-3.5">
                <span>P2</span>
            </label>
        </div>

        <!-- Ergebnis-Bereich (wird nach Analyse gefüllt) -->
        <div id="ai-results" class="hidden"></div>

        <!-- Aktions-Buttons -->
        <div id="ai-actions" class="flex flex-col gap-2">
            <button id="ai-analyze-frame-btn"
                    class="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                <i class="fas fa-camera"></i>
                <span>Einzelbild analysieren</span>
            </button>
            <button id="ai-analyze-video-btn"
                    class="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                <i class="fas fa-film"></i>
                <span>Video analysieren</span>
            </button>
            <button id="ai-technique-btn"
                    class="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                <i class="fas fa-brain"></i>
                <span>Detailanalyse (Claude)</span>
            </button>
        </div>

        <!-- Claude Technik-Analyse Ergebnis -->
        <div id="ai-technique-result" class="hidden mt-3"></div>
    `;

    return panel;
}

/**
 * Panel Event-Handler einrichten
 */
function setupPanelEvents(panel, videoPlayer, videoId, context) {
    // Schließen
    const closeBtn = panel.querySelector('#ai-panel-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            panel.style.display = 'none';
        };
    }

    // Skeleton Toggle
    const skeletonToggle = panel.querySelector('#ai-toggle-skeleton');
    if (skeletonToggle) {
        skeletonToggle.onchange = () => {
            if (aiOverlay) {
                if (skeletonToggle.checked) {
                    aiOverlay.activate();
                } else {
                    aiOverlay.deactivate();
                }
            }
        };
    }

    // Spieler Toggles
    const player1Toggle = panel.querySelector('#ai-toggle-player1');
    if (player1Toggle) {
        player1Toggle.onchange = () => {
            if (aiOverlay) {
                aiOverlay.options.showPlayer1 = player1Toggle.checked;
                aiOverlay.render();
            }
        };
    }

    const player2Toggle = panel.querySelector('#ai-toggle-player2');
    if (player2Toggle) {
        player2Toggle.onchange = () => {
            if (aiOverlay) {
                aiOverlay.options.showPlayer2 = player2Toggle.checked;
                aiOverlay.render();
            }
        };
    }

    // Einzelbild analysieren
    const analyzeFrameBtn = panel.querySelector('#ai-analyze-frame-btn');
    if (analyzeFrameBtn) {
        analyzeFrameBtn.onclick = () => analyzeCurrentFrame(videoPlayer, videoId);
    }

    // Video analysieren
    const analyzeVideoBtn = panel.querySelector('#ai-analyze-video-btn');
    if (analyzeVideoBtn) {
        analyzeVideoBtn.onclick = () => analyzeFullVideo(videoPlayer, videoId, context);
    }

    // Detailanalyse (Claude Vision)
    const techniqueBtn = panel.querySelector('#ai-technique-btn');
    if (techniqueBtn) {
        techniqueBtn.onclick = () => runClaudeTechniqueAnalysis(videoPlayer, videoId, context);
    }

    // Abbrechen
    const cancelBtn = panel.querySelector('#ai-cancel-btn');
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (abortController) {
                abortController.abort();
                abortController = null;
                updatePanelStatus('cancelled');
                hideProgress();
            }
        };
    }
}

/**
 * Analysiert den aktuellen Video-Frame
 */
async function analyzeCurrentFrame(videoPlayer, videoId) {
    try {
        // Modell laden falls nötig
        if (!isModelLoaded()) {
            updatePanelStatus('loading');
            await loadModels((progress) => {
                updateProgress(progress);
            });
        }

        updatePanelStatus('analyzing_frame');

        const timestampMs = Math.round(videoPlayer.currentTime * 1000);
        const result = detectPose(videoPlayer, timestampMs, videoId);

        if (result && result.landmarks && result.landmarks.length > 0) {
            if (aiOverlay) {
                aiOverlay.setPoseResult(result);
                aiOverlay.activate();
                // Skeleton-Toggle auf checked setzen
                const toggle = document.getElementById('ai-toggle-skeleton');
                if (toggle) toggle.checked = true;
            }
            updatePanelStatus('frame_done', result.landmarks.length);
        } else {
            updatePanelStatus('no_pose');
        }

        hideProgress();
    } catch (error) {
        console.error('[AI Toolbar] Frame analysis failed:', error);
        updatePanelStatus('error', 0, error.message);
        hideProgress();
    }
}

/**
 * Analysiert das gesamte Video
 */
async function analyzeFullVideo(videoPlayer, videoId, context) {
    try {
        // Modell laden falls nötig
        if (!isModelLoaded()) {
            updatePanelStatus('loading');
            showProgress();
            await loadModels((progress) => {
                updateProgress(progress);
            });
        }

        updatePanelStatus('analyzing_video');
        showProgress();

        const cancelBtn = document.getElementById('ai-cancel-btn');
        if (cancelBtn) cancelBtn.classList.remove('hidden');

        abortController = new AbortController();

        const startTime = 0;
        const endTime = videoPlayer.duration || 60;
        const fps = 5; // 5 Frames pro Sekunde

        const frames = await analyzeFrameRange(
            videoPlayer,
            startTime,
            endTime,
            fps,
            videoId,
            (current, total) => {
                const progress = Math.round((current / total) * 100);
                updateProgress(progress);
                updatePanelStatus('analyzing_progress', current, `${current}/${total} Frames`);
            },
            abortController.signal
        );

        if (cancelBtn) cancelBtn.classList.add('hidden');
        abortController = null;

        if (frames.length > 0) {
            // Overlay mit Ergebnissen füttern
            const savedFormat = frames.map(f => ({
                timestamp_seconds: f.timestamp,
                poses: f.landmarks.map((lm, idx) => ({
                    landmarks: lm,
                    worldLandmarks: f.worldLandmarks[idx] || null
                })),
                player_count: f.playerCount
            }));

            if (aiOverlay) {
                aiOverlay.setSavedFrames(savedFormat);
                aiOverlay.activate();

                const toggle = document.getElementById('ai-toggle-skeleton');
                if (toggle) toggle.checked = true;
            }

            // In Supabase speichern
            if (context.db && context.userId) {
                try {
                    updatePanelStatus('saving');
                    await saveAnalysisResults(context.db, videoId, context.userId, frames);
                } catch (saveError) {
                    console.error('[AI Toolbar] Save failed:', saveError);
                }
            }

            // Shot-Klassifizierung + Movement Quality
            updatePanelStatus('classifying');
            await runPostAnalysis(savedFormat, context, videoId);

            // Auto-Referenz-Vergleich mit Musterbeispiel (wenn Übung zugewiesen)
            if (context.exerciseId) {
                autoCompareWithExerciseReference(context, videoId);
            }

            updatePanelStatus('done', frames.length);

            // UX: Video zum Anfang seeken, Panel minimieren, abspielen
            videoPlayer.currentTime = 0;
            const panel = document.getElementById('ai-analysis-panel');
            if (panel) panel.style.display = 'none';
            try { await videoPlayer.play(); } catch (_) { /* autoplay blocked */ }
        } else {
            updatePanelStatus('no_pose');
        }

        hideProgress();
    } catch (error) {
        if (error.name === 'AbortError') {
            updatePanelStatus('cancelled');
        } else {
            console.error('[AI Toolbar] Video analysis failed:', error);
            updatePanelStatus('error', 0, error.message);
        }
        hideProgress();
    }
}

/**
 * Führt Shot-Klassifizierung und Movement Quality nach der Pose-Analyse durch.
 */
async function runPostAnalysis(savedFrames, context, videoId, playerIdx = 0) {
    const resultsDiv = document.getElementById('ai-results');
    if (!resultsDiv) return;

    // Cache für Spieler-Wechsel
    lastSavedFrames = savedFrames;
    lastContext = context;
    lastVideoId = videoId;
    selectedPlayerIdx = playerIdx;

    // Mehrere Spieler erkennen
    const maxPlayers = Math.max(...savedFrames.map(f => f.poses?.length || 0));

    try {
        // 1. Shot-Klassifizierung (Spielhand aus Profil übergeben falls vorhanden)
        const shotAnalysis = classifyShots(savedFrames, playerIdx, { spielhand: context.spielhand || null });

        // 2. Bewegungsqualität (Balleimertraining-Erkennung)
        const movementAnalysis = analyzeBallMachineSession(savedFrames, playerIdx);

        // Ergebnisse cachen
        lastAnalysisResults = { shotAnalysis, movementAnalysis };

        // 3. Shot-Labels in DB speichern
        if (context.db && context.userId && shotAnalysis.shots.length > 0) {
            try {
                await saveShotLabels(
                    context.db, videoId, context.userId,
                    context.clubId || null,
                    shotAnalysis.shots
                );
            } catch (e) {
                console.warn('[AI Toolbar] Shot labels save failed:', e);
            }
        }

        // 4. UI aktualisieren (mit Spieler-Auswahl wenn mehrere erkannt)
        renderResults(resultsDiv, shotAnalysis, movementAnalysis, maxPlayers, playerIdx);
    } catch (e) {
        console.error('[AI Toolbar] Post-analysis failed:', e);
    }
}

/**
 * Rendert die Analyse-Ergebnisse ins Panel.
 */
function renderResults(container, shotAnalysis, movementAnalysis, maxPlayers = 1, currentPlayerIdx = 0) {
    container.classList.remove('hidden');

    // Große Aktions-Buttons durch kompakten "Erneut analysieren" ersetzen
    const actionsDiv = document.getElementById('ai-actions');
    if (actionsDiv) {
        actionsDiv.innerHTML = `
            <button id="ai-reanalyze-btn"
                    class="w-full text-xs text-gray-400 hover:text-blue-400 py-1 transition-colors flex items-center justify-center gap-1">
                <i class="fas fa-redo text-[10px]"></i>
                <span>Erneut analysieren</span>
            </button>
        `;
    }

    let html = '';

    // Spieler-Auswahl bei mehreren erkannten Personen
    if (maxPlayers >= 2) {
        html += `<div class="flex items-center gap-2 mb-2 p-1.5 bg-gray-800 rounded-lg">
            <i class="fas fa-users text-xs text-gray-400"></i>
            <span class="text-[10px] text-gray-400">Spieler:</span>
            <button class="ai-player-select text-[10px] px-2 py-0.5 rounded transition-colors ${currentPlayerIdx === 0 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}" data-player="0">
                Person 1
            </button>
            <button class="ai-player-select text-[10px] px-2 py-0.5 rounded transition-colors ${currentPlayerIdx === 1 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}" data-player="1">
                Person 2
            </button>
        </div>`;
    }

    // Tabs für verschiedene Ansichten
    html += `<div class="flex gap-1 mb-3 border-b border-gray-700 pb-2">
        <button class="ai-result-tab active text-xs px-2 py-1 rounded-t transition-colors bg-gray-700 text-white" data-tab="shots">
            <i class="fas fa-table-tennis mr-1"></i>Schläge
        </button>`;

    if (movementAnalysis && movementAnalysis.summary) {
        html += `<button class="ai-result-tab text-xs px-2 py-1 rounded-t transition-colors text-gray-400 hover:text-white" data-tab="quality">
            <i class="fas fa-chart-line mr-1"></i>Qualität
        </button>`;
    }

    html += `<button class="ai-result-tab text-xs px-2 py-1 rounded-t transition-colors text-gray-400 hover:text-white" data-tab="compare">
        <i class="fas fa-balance-scale mr-1"></i>Vergleich
    </button>`;

    html += `</div>`;

    // Shot-Statistik Tab
    html += `<div id="ai-tab-shots" class="ai-tab-content">`;
    if (shotAnalysis && shotAnalysis.stats) {
        html += renderShotStats(shotAnalysis);
    } else {
        html += '<p class="text-sm text-gray-500">Keine Schläge erkannt</p>';
    }
    html += `</div>`;

    // Movement Quality Tab
    if (movementAnalysis && movementAnalysis.summary) {
        html += `<div id="ai-tab-quality" class="ai-tab-content hidden">`;
        html += renderMovementSummary(movementAnalysis);
        html += `<div class="mt-3">
            <span class="text-xs text-gray-400 mb-1 block">Konsistenz pro Wiederholung:</span>
            ${renderConsistencyTimeline(movementAnalysis.repetitions)}
        </div>`;
        html += `</div>`;
    }

    // Referenz-Vergleich Tab
    html += `<div id="ai-tab-compare" class="ai-tab-content hidden">
        <div class="text-sm space-y-2">
            <p class="text-gray-400 text-xs">Vergleiche die Pose mit einem Referenz-Video (z.B. Trainer-Demonstration).</p>
            <button id="ai-select-reference-btn"
                    class="w-full bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-xs font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                <i class="fas fa-video"></i>
                <span>Referenz-Video wählen</span>
            </button>
            <div id="ai-compare-results"></div>
        </div>
    </div>`;

    container.innerHTML = html;

    // Tab-Wechsel
    container.querySelectorAll('.ai-result-tab').forEach(tab => {
        tab.onclick = () => {
            container.querySelectorAll('.ai-result-tab').forEach(t => {
                t.classList.remove('active', 'bg-gray-700', 'text-white');
                t.classList.add('text-gray-400');
            });
            tab.classList.add('active', 'bg-gray-700', 'text-white');
            tab.classList.remove('text-gray-400');

            container.querySelectorAll('.ai-tab-content').forEach(c => c.classList.add('hidden'));
            const target = document.getElementById(`ai-tab-${tab.dataset.tab}`);
            if (target) target.classList.remove('hidden');
        };
    });

    // Spieler-Auswahl (bei 2+ Personen im Video)
    container.querySelectorAll('.ai-player-select').forEach(btn => {
        btn.onclick = () => {
            const playerIdx = parseInt(btn.dataset.player, 10);
            if (playerIdx !== selectedPlayerIdx && lastSavedFrames && lastContext && lastVideoId) {
                runPostAnalysis(lastSavedFrames, lastContext, lastVideoId, playerIdx);
            }
        };
    });

    // Referenz-Video-Auswahl
    const selectRefBtn = document.getElementById('ai-select-reference-btn');
    if (selectRefBtn) {
        selectRefBtn.onclick = () => showReferenceVideoSelector();
    }

    // "Erneut analysieren" Button-Handler
    const reanalyzeBtn = document.getElementById('ai-reanalyze-btn');
    if (reanalyzeBtn) {
        reanalyzeBtn.onclick = () => {
            // Aktions-Buttons wiederherstellen
            const actionsDiv = document.getElementById('ai-actions');
            if (actionsDiv) {
                actionsDiv.innerHTML = `
                    <button id="ai-analyze-frame-btn"
                            class="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fas fa-camera"></i>
                        <span>Einzelbild analysieren</span>
                    </button>
                    <button id="ai-analyze-video-btn"
                            class="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                        <i class="fas fa-film"></i>
                        <span>Video analysieren</span>
                    </button>
                `;
            }
            // Ergebnisse ausblenden
            container.classList.add('hidden');
            container.innerHTML = '';
            // Event-Handler neu einrichten (da die Buttons neu erstellt wurden)
            const panel = document.getElementById('ai-analysis-panel');
            if (panel && window._aiToolbarContext) {
                const { videoPlayer, videoId, context } = window._aiToolbarContext;
                const analyzeFrameBtn = panel.querySelector('#ai-analyze-frame-btn');
                if (analyzeFrameBtn) {
                    analyzeFrameBtn.onclick = () => analyzeCurrentFrame(videoPlayer, videoId);
                }
                const analyzeVideoBtn = panel.querySelector('#ai-analyze-video-btn');
                if (analyzeVideoBtn) {
                    analyzeVideoBtn.onclick = () => analyzeFullVideo(videoPlayer, videoId, context);
                }
            }
        };
    }
}

/**
 * Toggle AI Panel
 */
function toggleAIPanel(panel) {
    if (panel.style.display === 'none' || !panel.style.display) {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

/**
 * Status-Text aktualisieren
 */
function updatePanelStatus(status, count, extra) {
    const statusText = document.getElementById('ai-status-text');
    if (!statusText) return;

    const messages = {
        loading: '<i class="fas fa-spinner fa-spin mr-1"></i> Modell wird geladen...',
        analyzing_frame: '<i class="fas fa-spinner fa-spin mr-1"></i> Analysiere Frame...',
        analyzing_video: '<i class="fas fa-spinner fa-spin mr-1"></i> Video wird analysiert...',
        analyzing_progress: `<i class="fas fa-spinner fa-spin mr-1"></i> Analysiere... ${extra || ''}`,
        classifying: '<i class="fas fa-spinner fa-spin mr-1"></i> Schläge werden klassifiziert...',
        saving: '<i class="fas fa-spinner fa-spin mr-1"></i> Ergebnisse werden gespeichert...',
        frame_done: `<i class="fas fa-check text-green-400 mr-1"></i> ${count || 0} Person(en) erkannt`,
        done: `<i class="fas fa-check text-green-400 mr-1"></i> ${count || 0} Frames analysiert`,
        done_not_saved: `<i class="fas fa-check text-yellow-400 mr-1"></i> ${count || 0} Frames analysiert (nicht gespeichert)`,
        saved: `<i class="fas fa-database text-blue-400 mr-1"></i> ${count || 0} gespeicherte Frames geladen`,
        no_pose: '<i class="fas fa-exclamation-triangle text-yellow-400 mr-1"></i> Keine Person erkannt',
        cancelled: '<i class="fas fa-ban text-gray-400 mr-1"></i> Abgebrochen',
        error: `<i class="fas fa-exclamation-circle text-red-400 mr-1"></i> Fehler: ${extra || 'Unbekannt'}`,
    };

    statusText.innerHTML = messages[status] || 'Bereit';
}

/**
 * Fortschrittsbalken anzeigen
 */
function showProgress() {
    const container = document.getElementById('ai-progress-container');
    if (container) container.classList.remove('hidden');
}

/**
 * Fortschrittsbalken verstecken
 */
function hideProgress() {
    const container = document.getElementById('ai-progress-container');
    if (container) container.classList.add('hidden');

    const cancelBtn = document.getElementById('ai-cancel-btn');
    if (cancelBtn) cancelBtn.classList.add('hidden');

    updateProgress(0);
}

/**
 * Fortschritt aktualisieren
 */
function updateProgress(percent) {
    const bar = document.getElementById('ai-progress-bar');
    const text = document.getElementById('ai-progress-text');
    if (bar) bar.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
}

/**
 * Sucht automatisch das Musterbeispiel der zugewiesenen Übung und vergleicht.
 * Wird aufgerufen wenn ein Video einer Übung zugewiesen ist UND bereits analysiert wurde.
 */
async function autoCompareWithExerciseReference(context, videoId) {
    if (!context.exerciseId || !context.db || !context.clubId) return;

    try {
        // Musterbeispiel-Videos für diese Übung laden
        const { data: examples, error } = await context.db
            .from('exercise_example_videos')
            .select('video_id')
            .eq('exercise_id', context.exerciseId)
            .eq('club_id', context.clubId)
            .not('video_id', 'is', null)
            .order('sort_order', { ascending: true });

        if (error || !examples || examples.length === 0) return;

        // Prüfen ob eines der Musterbeispiele eine KI-Analyse hat
        for (const example of examples) {
            if (example.video_id === videoId) continue; // Sich selbst nicht vergleichen

            const refFrames = await loadReferenceAnalysis(context.db, example.video_id);
            if (refFrames && refFrames.length > 0) {
                // Gefunden! Automatisch vergleichen
                console.log(`[AI Toolbar] Auto-comparing with exercise reference video: ${example.video_id}`);

                // Vergleich-Tab mit Ergebnis füllen
                const currentFrames = aiOverlay?.savedFrames;
                if (!currentFrames || currentFrames.length === 0) return;

                const comparisons = [];
                for (const frame of currentFrames) {
                    if (!frame.poses || frame.poses.length === 0) continue;
                    const playerPose = frame.poses[0].landmarks;

                    let closest = refFrames[0];
                    let minDiff = Math.abs(closest.timestamp_seconds - frame.timestamp_seconds);
                    for (const ref of refFrames) {
                        const diff = Math.abs(ref.timestamp_seconds - frame.timestamp_seconds);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closest = ref;
                        }
                    }

                    if (closest.poses && closest.poses.length > 0 && minDiff < 1.0) {
                        const refPose = closest.poses[0].landmarks;
                        const result = comparePoses(playerPose, refPose);
                        if (result) {
                            comparisons.push({ timestamp: frame.timestamp_seconds, ...result });
                        }
                    }
                }

                if (comparisons.length === 0) return;

                const avgOverall = Math.round(comparisons.reduce((s, c) => s + c.overallScore, 0) / comparisons.length);
                const avgArm = Math.round(comparisons.reduce((s, c) => s + c.groups.arm, 0) / comparisons.length);
                const avgTorso = Math.round(comparisons.reduce((s, c) => s + c.groups.torso, 0) / comparisons.length);
                const avgLegs = Math.round(comparisons.reduce((s, c) => s + c.groups.legs, 0) / comparisons.length);

                const scoreColor = (s) => s >= 80 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400';
                const exerciseName = context.exerciseName || 'Übung';

                // Vergleich-Tab befüllen (verzögert warten bis DOM bereit)
                const fillCompareTab = () => {
                    const resultsDiv = document.getElementById('ai-compare-results');
                    if (!resultsDiv) return;

                    resultsDiv.innerHTML = `
                        <div class="bg-purple-900/30 rounded-lg p-2 mb-2">
                            <div class="flex items-center gap-1 text-purple-300 text-xs mb-1">
                                <i class="fas fa-star"></i>
                                <span class="font-medium">Musterbeispiel: ${exerciseName}</span>
                            </div>
                        </div>
                        <div class="space-y-2">
                            <div class="flex justify-between items-center">
                                <span class="text-gray-400 text-xs">Gesamt:</span>
                                <span class="font-bold ${scoreColor(avgOverall)}">${avgOverall}%</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-400 text-xs">Arme:</span>
                                <span class="font-medium text-xs ${scoreColor(avgArm)}">${avgArm}%</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-400 text-xs">Oberkörper:</span>
                                <span class="font-medium text-xs ${scoreColor(avgTorso)}">${avgTorso}%</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-gray-400 text-xs">Beine:</span>
                                <span class="font-medium text-xs ${scoreColor(avgLegs)}">${avgLegs}%</span>
                            </div>
                            <p class="text-[10px] text-gray-500 mt-1">${comparisons.length} Frames verglichen</p>
                            <button class="ai-ref-change-btn w-full text-xs text-gray-400 hover:text-purple-400 py-1 transition-colors">
                                <i class="fas fa-exchange-alt mr-1"></i>Andere Referenz wählen
                            </button>
                        </div>
                    `;

                    const changeBtn = resultsDiv.querySelector('.ai-ref-change-btn');
                    if (changeBtn) {
                        changeBtn.onclick = () => showReferenceVideoSelector();
                    }

                    // Vergleich-Tab mit Badge markieren
                    const compareTabBtn = document.querySelector('[data-tab="compare"]');
                    if (compareTabBtn) {
                        compareTabBtn.innerHTML = `<i class="fas fa-balance-scale mr-1"></i>Vergleich <span class="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 ml-1"></span>`;
                    }
                };

                // Kurz warten bis renderResults() das DOM aufgebaut hat
                setTimeout(fillCompareTab, 300);
                return; // Erstes Musterbeispiel reicht
            }
        }
    } catch (e) {
        console.warn('[AI Toolbar] Auto-compare with exercise reference failed:', e);
    }
}

/**
 * Zeigt eine Auswahl der verfügbaren Videos als Referenz an.
 * Lädt die Referenz-Analyse und vergleicht mit dem aktuellen Video.
 */
async function showReferenceVideoSelector() {
    const ctx = window._aiToolbarContext;
    if (!ctx || !ctx.context.db) return;

    const resultsDiv = document.getElementById('ai-compare-results');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '<p class="text-xs text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Videos werden geladen...</p>';

    try {
        // Andere analysierte Videos laden (die bereits KI-Analysen haben)
        const { data: analyses, error } = await ctx.context.db
            .from('video_ai_analyses')
            .select('video_id, summary, created_at, video_analyses:video_id(title, video_url)')
            .eq('analysis_type', 'pose_estimation')
            .eq('status', 'completed')
            .neq('video_id', ctx.videoId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error || !analyses || analyses.length === 0) {
            resultsDiv.innerHTML = '<p class="text-xs text-gray-500">Keine anderen analysierten Videos gefunden. Analysiere zuerst ein Referenz-Video.</p>';
            return;
        }

        let listHtml = '<div class="space-y-1 max-h-32 overflow-y-auto">';
        for (const a of analyses) {
            const title = a.video_analyses?.title || 'Unbenannt';
            const frames = a.summary?.total_frames || '?';
            listHtml += `
                <button class="ai-ref-video-btn w-full text-left text-xs p-2 rounded bg-gray-800 hover:bg-gray-700 transition-colors flex items-center gap-2"
                        data-video-id="${a.video_id}">
                    <i class="fas fa-video text-purple-400"></i>
                    <span class="truncate flex-1">${title}</span>
                    <span class="text-gray-500">${frames}F</span>
                </button>
            `;
        }
        listHtml += '</div>';

        resultsDiv.innerHTML = listHtml;

        // Click-Handler für jedes Video
        resultsDiv.querySelectorAll('.ai-ref-video-btn').forEach(btn => {
            btn.onclick = () => loadAndCompareReference(btn.dataset.videoId);
        });

    } catch (e) {
        console.error('[AI Toolbar] Reference video load failed:', e);
        resultsDiv.innerHTML = '<p class="text-xs text-red-400">Fehler beim Laden der Videos.</p>';
    }
}

/**
 * Lädt eine Referenz-Analyse und vergleicht sie mit dem aktuellen Video.
 */
async function loadAndCompareReference(referenceVideoId) {
    const ctx = window._aiToolbarContext;
    if (!ctx || !ctx.context.db) return;

    const resultsDiv = document.getElementById('ai-compare-results');
    if (!resultsDiv) return;

    resultsDiv.innerHTML = '<p class="text-xs text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Referenz wird geladen und verglichen...</p>';

    try {
        // Referenz-Frames laden
        const refFrames = await loadReferenceAnalysis(ctx.context.db, referenceVideoId);
        if (!refFrames || refFrames.length === 0) {
            resultsDiv.innerHTML = '<p class="text-xs text-red-400">Keine Frames in der Referenz gefunden.</p>';
            return;
        }

        // Aktuelle Frames (aus savedFrames des Overlays)
        const currentFrames = aiOverlay?.savedFrames;
        if (!currentFrames || currentFrames.length === 0) {
            resultsDiv.innerHTML = '<p class="text-xs text-red-400">Aktuelles Video hat keine Analyse-Daten.</p>';
            return;
        }

        // Frame-weise Vergleich (benutze Frames bei ähnlichen Zeitpunkten)
        const comparisons = [];
        for (const frame of currentFrames) {
            if (!frame.poses || frame.poses.length === 0) continue;
            const playerPose = frame.poses[0].landmarks;

            // Nächsten Referenz-Frame finden
            let closest = refFrames[0];
            let minDiff = Math.abs(closest.timestamp_seconds - frame.timestamp_seconds);
            for (const ref of refFrames) {
                const diff = Math.abs(ref.timestamp_seconds - frame.timestamp_seconds);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = ref;
                }
            }

            if (closest.poses && closest.poses.length > 0 && minDiff < 1.0) {
                const refPose = closest.poses[0].landmarks;
                const result = comparePoses(playerPose, refPose);
                if (result) {
                    comparisons.push({ timestamp: frame.timestamp_seconds, ...result });
                }
            }
        }

        if (comparisons.length === 0) {
            resultsDiv.innerHTML = '<p class="text-xs text-gray-500">Kein Vergleich möglich (zu wenig überlappende Frames).</p>';
            return;
        }

        // Durchschnitt berechnen
        const avgOverall = Math.round(comparisons.reduce((s, c) => s + c.overallScore, 0) / comparisons.length);
        const avgArm = Math.round(comparisons.reduce((s, c) => s + c.groups.arm, 0) / comparisons.length);
        const avgTorso = Math.round(comparisons.reduce((s, c) => s + c.groups.torso, 0) / comparisons.length);
        const avgLegs = Math.round(comparisons.reduce((s, c) => s + c.groups.legs, 0) / comparisons.length);

        const scoreColor = (s) => s >= 80 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : 'text-red-400';

        resultsDiv.innerHTML = `
            <div class="space-y-2 mt-2">
                <div class="flex justify-between items-center">
                    <span class="text-gray-400 text-xs">Gesamt:</span>
                    <span class="font-bold ${scoreColor(avgOverall)}">${avgOverall}%</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-400 text-xs">Arme:</span>
                    <span class="font-medium text-xs ${scoreColor(avgArm)}">${avgArm}%</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-400 text-xs">Oberkörper:</span>
                    <span class="font-medium text-xs ${scoreColor(avgTorso)}">${avgTorso}%</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-gray-400 text-xs">Beine:</span>
                    <span class="font-medium text-xs ${scoreColor(avgLegs)}">${avgLegs}%</span>
                </div>
                <p class="text-[10px] text-gray-500 mt-1">${comparisons.length} Frames verglichen</p>
                <button class="ai-ref-change-btn w-full text-xs text-gray-400 hover:text-purple-400 py-1 transition-colors">
                    <i class="fas fa-exchange-alt mr-1"></i>Andere Referenz wählen
                </button>
            </div>
        `;

        // "Andere Referenz wählen" Button
        const changeBtn = resultsDiv.querySelector('.ai-ref-change-btn');
        if (changeBtn) {
            changeBtn.onclick = () => showReferenceVideoSelector();
        }

    } catch (e) {
        console.error('[AI Toolbar] Comparison failed:', e);
        resultsDiv.innerHTML = '<p class="text-xs text-red-400">Vergleich fehlgeschlagen.</p>';
    }
}

/**
 * Räumt die AI-Toolbar auf (beim Schließen des Modals)
 */
export function cleanupAIToolbar() {
    if (aiOverlay) {
        aiOverlay.destroy();
        aiOverlay = null;
    }
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    lastAnalysisResults = null;
    lastSavedFrames = null;
    lastContext = null;
    lastVideoId = null;
    selectedPlayerIdx = 0;
    window._aiToolbarContext = null;
    clearCache();

    const panel = document.getElementById('ai-analysis-panel');
    if (panel) panel.remove();
}

// ============================================
// CLAUDE VISION TECHNIK-ANALYSE (Phase 1A)
// ============================================

/**
 * Extrahiert Schlüssel-Frames aus dem Video als Base64-JPEG.
 * Nimmt gleichmäßig verteilte Frames über die Videolänge.
 */
function extractFramesAsBase64(videoPlayer, count = 5) {
    return new Promise((resolve) => {
        const duration = videoPlayer.duration;
        if (!duration || duration <= 0) {
            resolve([]);
            return;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = Math.min(640, videoPlayer.videoWidth);
        canvas.height = Math.round(canvas.width * (videoPlayer.videoHeight / videoPlayer.videoWidth));

        const timestamps = [];
        // Frames gleichmäßig verteilen, erste und letzte 10% überspringen
        const start = duration * 0.1;
        const end = duration * 0.9;
        const step = (end - start) / (count - 1);
        for (let i = 0; i < count; i++) {
            timestamps.push(start + step * i);
        }

        const frames = [];
        let idx = 0;

        const originalTime = videoPlayer.currentTime;
        const wasPaused = videoPlayer.paused;

        function captureNext() {
            if (idx >= timestamps.length) {
                // Video-Position zurücksetzen
                videoPlayer.currentTime = originalTime;
                if (!wasPaused) videoPlayer.play();
                resolve({ frames, timestamps });
                return;
            }

            videoPlayer.currentTime = timestamps[idx];
        }

        videoPlayer.addEventListener('seeked', function onSeeked() {
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
            frames.push(base64);
            idx++;
            if (idx < timestamps.length) {
                videoPlayer.currentTime = timestamps[idx];
            } else {
                videoPlayer.removeEventListener('seeked', onSeeked);
                videoPlayer.currentTime = originalTime;
                if (!wasPaused) videoPlayer.play();
                resolve({ frames, timestamps });
            }
        });

        if (wasPaused) videoPlayer.pause();
        captureNext();
    });
}

/**
 * Führt die Claude Vision Technik-Analyse durch.
 */
async function runClaudeTechniqueAnalysis(videoPlayer, videoId, context) {
    const resultContainer = document.getElementById('ai-technique-result');
    const techniqueBtn = document.getElementById('ai-technique-btn');

    if (!resultContainer || !techniqueBtn) return;

    // Button deaktivieren
    techniqueBtn.disabled = true;
    techniqueBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Analysiert...</span>';

    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = `
        <div class="text-xs text-gray-400 text-center py-2">
            <i class="fas fa-spinner fa-spin mr-1"></i>
            Frames werden extrahiert...
        </div>
    `;

    try {
        // 1. Frames extrahieren
        const { frames: frameImages, timestamps } = await extractFramesAsBase64(videoPlayer, 5);

        if (frameImages.length === 0) {
            throw new Error('Keine Frames extrahiert');
        }

        resultContainer.innerHTML = `
            <div class="text-xs text-gray-400 text-center py-2">
                <i class="fas fa-spinner fa-spin mr-1"></i>
                Claude analysiert ${frameImages.length} Frames...
            </div>
        `;

        // 2. Shot-Labels als Kontext sammeln
        let shotLabels = [];
        if (lastAnalysisResults?.shotAnalysis?.shots) {
            shotLabels = lastAnalysisResults.shotAnalysis.shots.map(s => ({
                type: s.shotType,
                timestamp: s.timestamp,
                confidence: s.confidence,
            }));
        }

        // 3. Edge Function aufrufen
        const { db } = context;
        const supabaseUrl = db.supabaseUrl || db._supabaseUrl || '';

        const response = await db.functions.invoke('analyze-video-ai', {
            body: {
                video_id: videoId,
                frame_images: frameImages,
                frame_timestamps: timestamps,
                shot_labels: shotLabels,
                player_name: context.playerName || null,
                exercise_name: context.exerciseName || null,
            },
        });

        if (response.error) {
            throw new Error(response.error.message || 'Edge Function Fehler');
        }

        const data = response.data;

        if (data.error) {
            throw new Error(data.error);
        }

        // 4. Ergebnis anzeigen
        renderTechniqueResult(resultContainer, data.result);

    } catch (error) {
        console.error('[AI Toolbar] Claude technique analysis error:', error);
        resultContainer.innerHTML = `
            <div class="text-xs text-red-400 text-center py-2">
                <i class="fas fa-exclamation-triangle mr-1"></i>
                ${error.message || 'Analyse fehlgeschlagen'}
                <p class="text-gray-500 mt-1">Stelle sicher dass ANTHROPIC_API_KEY konfiguriert ist.</p>
            </div>
        `;
    } finally {
        techniqueBtn.disabled = false;
        techniqueBtn.innerHTML = '<i class="fas fa-brain"></i> <span>Detailanalyse (Claude)</span>';
    }
}

/**
 * Rendert das Claude-Technik-Analyse-Ergebnis.
 */
function renderTechniqueResult(container, result) {
    if (!result) {
        container.innerHTML = '<p class="text-xs text-gray-500">Kein Ergebnis</p>';
        return;
    }

    const ratingColor = result.overall_rating >= 7 ? 'text-green-400'
        : result.overall_rating >= 4 ? 'text-yellow-400'
        : 'text-red-400';

    const bodyParts = result.body_parts || {};
    const bodyPartLabels = {
        arm_technique: 'Armtechnik',
        shoulder_rotation: 'Schulterrotation',
        footwork: 'Beinarbeit',
        body_posture: 'Körperhaltung',
        racket_angle: 'Schlägerwinkel',
    };

    const bodyPartHtml = Object.entries(bodyPartLabels)
        .map(([key, label]) => {
            const bp = bodyParts[key];
            if (!bp) return '';
            const barWidth = (bp.rating / 10) * 100;
            const barColor = bp.rating >= 7 ? 'bg-green-500'
                : bp.rating >= 4 ? 'bg-yellow-500'
                : 'bg-red-500';
            return `
                <div class="mb-2">
                    <div class="flex justify-between text-xs mb-0.5">
                        <span class="text-gray-300">${label}</span>
                        <span class="font-medium">${bp.rating}/10</span>
                    </div>
                    <div class="w-full bg-gray-700 rounded-full h-1.5">
                        <div class="${barColor} h-1.5 rounded-full" style="width: ${barWidth}%"></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-0.5">${bp.feedback}</p>
                </div>
            `;
        }).join('');

    const strengthsHtml = (result.strengths || [])
        .map(s => `<li class="text-green-400"><i class="fas fa-check-circle mr-1"></i>${s}</li>`)
        .join('');

    const improvementsHtml = (result.improvements || [])
        .map(s => `<li class="text-yellow-400"><i class="fas fa-arrow-up mr-1"></i>${s}</li>`)
        .join('');

    const drillsHtml = (result.drill_suggestions || [])
        .map(s => `<li class="text-blue-400"><i class="fas fa-dumbbell mr-1"></i>${s}</li>`)
        .join('');

    container.innerHTML = `
        <div class="border-t border-gray-700 pt-3">
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-gray-300">
                    <i class="fas fa-brain text-purple-400 mr-1"></i>Claude Technik-Analyse
                </span>
                <span class="text-lg font-bold ${ratingColor}">${result.overall_rating}/10</span>
            </div>

            <p class="text-xs text-gray-300 mb-3">${result.summary || ''}</p>

            ${bodyPartHtml}

            ${strengthsHtml ? `
                <div class="mt-3">
                    <span class="text-xs font-medium text-gray-400">Stärken:</span>
                    <ul class="text-xs mt-1 space-y-0.5">${strengthsHtml}</ul>
                </div>
            ` : ''}

            ${improvementsHtml ? `
                <div class="mt-2">
                    <span class="text-xs font-medium text-gray-400">Verbesserungen:</span>
                    <ul class="text-xs mt-1 space-y-0.5">${improvementsHtml}</ul>
                </div>
            ` : ''}

            ${drillsHtml ? `
                <div class="mt-2">
                    <span class="text-xs font-medium text-gray-400">Übungsempfehlungen:</span>
                    <ul class="text-xs mt-1 space-y-0.5">${drillsHtml}</ul>
                </div>
            ` : ''}
        </div>
    `;
}

// Export für globalen Zugriff
window.videoAIToolbar = {
    setupAIToolbar,
    cleanupAIToolbar
};

export default {
    setupAIToolbar,
    cleanupAIToolbar
};
