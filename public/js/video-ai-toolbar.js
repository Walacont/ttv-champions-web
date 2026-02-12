/**
 * Video AI Toolbar - UI-Controls für KI-Videoanalyse
 * Erstellt einen KI-Analyse-Button und ein Floating-Panel.
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

let aiOverlay = null;
let abortController = null;

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

    // Neues Overlay erstellen
    aiOverlay = new VideoAIOverlay(videoPlayer);

    // Panel erstellen (falls nicht vorhanden)
    let panel = document.getElementById('ai-analysis-panel');
    if (!panel) {
        panel = createAIPanel();
        const videoContainer = document.getElementById('video-player-container');
        if (videoContainer) {
            videoContainer.style.position = 'relative';
            videoContainer.appendChild(panel);
        }
    }

    // Prüfen ob bereits gespeicherte Ergebnisse vorliegen
    if (context.db) {
        try {
            const saved = await loadAnalysisResults(context.db, videoId);
            if (saved && saved.frames && saved.frames.length > 0) {
                aiOverlay.setSavedFrames(saved.frames);
                updatePanelStatus('saved', saved.analysis.frames_analyzed);
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
        position: absolute;
        bottom: 70px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        padding: 12px 16px;
        background: rgba(0, 0, 0, 0.92);
        border-radius: 16px;
        z-index: 25;
        min-width: 280px;
        max-width: 95%;
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

        <!-- Toggles -->
        <div class="flex flex-col gap-2 mb-3">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ai-toggle-skeleton" checked
                       class="rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-0">
                <span class="text-sm">Skelett anzeigen</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ai-toggle-player1" checked
                       class="rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-0">
                <span class="text-sm">Spieler 1</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="ai-toggle-player2" checked
                       class="rounded text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500 focus:ring-offset-0">
                <span class="text-sm">Spieler 2</span>
            </label>
        </div>

        <!-- Aktions-Buttons -->
        <div class="flex flex-col gap-2">
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
            if (aiOverlay) {
                const savedFormat = frames.map(f => ({
                    timestamp_seconds: f.timestamp,
                    poses: f.landmarks.map((lm, idx) => ({
                        landmarks: lm,
                        worldLandmarks: f.worldLandmarks[idx] || null
                    })),
                    player_count: f.playerCount
                }));
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
                    updatePanelStatus('done', frames.length);
                } catch (saveError) {
                    console.error('[AI Toolbar] Save failed:', saveError);
                    updatePanelStatus('done_not_saved', frames.length);
                }
            } else {
                updatePanelStatus('done', frames.length);
            }
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
        saving: '<i class="fas fa-spinner fa-spin mr-1"></i> Ergebnisse werden gespeichert...',
        frame_done: `<i class="fas fa-check text-green-400 mr-1"></i> ${count || 0} Person(en) erkannt`,
        done: `<i class="fas fa-check text-green-400 mr-1"></i> ${count || 0} Frames analysiert und gespeichert`,
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
