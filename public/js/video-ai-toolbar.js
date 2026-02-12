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
    clearCache
} from './video-ai-engine.js';
import { VideoAIOverlay } from './video-ai-overlay.js';
import { classifyShots, renderShotStats, saveShotLabels } from './video-ai-shot-classifier.js';
import { analyzeBallMachineSession, renderConsistencyTimeline, renderMovementSummary } from './video-ai-movement-quality.js';

let aiOverlay = null;
let abortController = null;
let lastAnalysisResults = null; // Cached results for panel re-open

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
                updatePanelStatus('saved', saved.analysis.frames_analyzed);

                // Sofort Shot-Klassifizierung + Movement Quality auf gespeicherten Frames
                runPostAnalysis(saved.frames, context, videoId);
            }
        } catch (e) {
            console.warn('[AI Toolbar] Could not load saved results:', e);
        }
    }

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
        </div>
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
async function runPostAnalysis(savedFrames, context, videoId) {
    const resultsDiv = document.getElementById('ai-results');
    if (!resultsDiv) return;

    try {
        // 1. Shot-Klassifizierung
        const shotAnalysis = classifyShots(savedFrames);

        // 2. Bewegungsqualität (Balleimertraining-Erkennung)
        const movementAnalysis = analyzeBallMachineSession(savedFrames);

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

        // 4. UI aktualisieren
        renderResults(resultsDiv, shotAnalysis, movementAnalysis);
    } catch (e) {
        console.error('[AI Toolbar] Post-analysis failed:', e);
    }
}

/**
 * Rendert die Analyse-Ergebnisse ins Panel.
 */
function renderResults(container, shotAnalysis, movementAnalysis) {
    container.classList.remove('hidden');

    // Große Aktions-Buttons verstecken nach Analyse
    const actionsDiv = document.getElementById('ai-actions');
    if (actionsDiv) actionsDiv.classList.add('hidden');

    let html = '';

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
    clearCache();

    const panel = document.getElementById('ai-analysis-panel');
    if (panel) panel.remove();
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
