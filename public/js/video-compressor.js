/**
 * Video Compressor - Client-seitige Video-Komprimierung
 * Verwendet FFmpeg.wasm für die Komprimierung
 */

// FFmpeg wird lazy geladen wenn benötigt
let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

// Schwellenwert für automatische Komprimierung (in Bytes)
const AUTO_COMPRESS_THRESHOLD = 15 * 1024 * 1024; // 15 MB
const TARGET_SIZE_MB = 8; // Zielgröße nach Komprimierung

/**
 * Lädt FFmpeg.wasm
 */
async function loadFFmpeg(onProgress) {
    if (ffmpegLoaded && ffmpeg) return ffmpeg;
    if (ffmpegLoading) {
        // Warte bis FFmpeg geladen ist
        while (ffmpegLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return ffmpeg;
    }

    ffmpegLoading = true;

    try {
        // Dynamisch FFmpeg laden
        const { FFmpeg } = await import('https://esm.sh/@ffmpeg/ffmpeg@0.12.7');
        const { toBlobURL } = await import('https://esm.sh/@ffmpeg/util@0.12.1');

        ffmpeg = new FFmpeg();

        // Progress Handler
        ffmpeg.on('progress', ({ progress }) => {
            if (onProgress) {
                onProgress(Math.round(progress * 100));
            }
        });

        // FFmpeg Core laden
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        ffmpegLoaded = true;
        console.log('[VideoCompressor] FFmpeg loaded successfully');
        return ffmpeg;
    } catch (error) {
        console.error('[VideoCompressor] Failed to load FFmpeg:', error);
        ffmpegLoading = false;
        throw error;
    } finally {
        ffmpegLoading = false;
    }
}

/**
 * Prüft ob ein Video komprimiert werden sollte
 * @param {File} file - Die Video-Datei
 * @returns {boolean}
 */
export function shouldCompressVideo(file) {
    return file.size > AUTO_COMPRESS_THRESHOLD;
}

/**
 * Gibt die empfohlene Aktion für eine Datei zurück
 * @param {File} file - Die Video-Datei
 * @returns {Object} - { shouldCompress, originalSizeMB, estimatedSizeMB }
 */
export function getCompressionRecommendation(file) {
    const originalSizeMB = file.size / (1024 * 1024);
    const shouldCompress = file.size > AUTO_COMPRESS_THRESHOLD;

    // Geschätzte Komprimierungsrate basierend auf Dateigröße
    let estimatedSizeMB = originalSizeMB;
    if (shouldCompress) {
        // Grobe Schätzung: 50-70% Reduktion je nach Originalgröße
        const compressionRatio = originalSizeMB > 50 ? 0.3 : originalSizeMB > 30 ? 0.4 : 0.5;
        estimatedSizeMB = Math.max(TARGET_SIZE_MB, originalSizeMB * compressionRatio);
    }

    return {
        shouldCompress,
        originalSizeMB: originalSizeMB.toFixed(1),
        estimatedSizeMB: estimatedSizeMB.toFixed(1),
        savingsPercent: shouldCompress ? Math.round((1 - estimatedSizeMB / originalSizeMB) * 100) : 0
    };
}

/**
 * Komprimiert ein Video
 * @param {File} file - Die Video-Datei
 * @param {Object} options - Komprimierungsoptionen
 * @param {Function} options.onProgress - Progress Callback (0-100)
 * @param {Function} options.onStatus - Status Callback (string)
 * @param {string} options.quality - 'low', 'medium', 'high' (default: 'medium')
 * @returns {Promise<File>} - Die komprimierte Video-Datei
 */
export async function compressVideo(file, options = {}) {
    const { onProgress, onStatus, quality = 'medium' } = options;

    // Status Update
    if (onStatus) onStatus('FFmpeg wird geladen...');
    if (onProgress) onProgress(0);

    try {
        // FFmpeg laden
        const ff = await loadFFmpeg((p) => {
            if (onProgress && p < 90) {
                onProgress(Math.round(p * 0.9)); // 0-90% für Encoding
            }
        });

        if (onStatus) onStatus('Video wird vorbereitet...');

        // Input-Datei in FFmpeg schreiben
        const inputName = 'input' + getFileExtension(file.name);
        const outputName = 'output.mp4';

        const fileData = await file.arrayBuffer();
        await ff.writeFile(inputName, new Uint8Array(fileData));

        if (onStatus) onStatus('Video wird komprimiert...');

        // Qualitätseinstellungen
        const qualitySettings = {
            low: { crf: '32', preset: 'veryfast', scale: '640:-2' },
            medium: { crf: '28', preset: 'fast', scale: '1280:-2' },
            high: { crf: '24', preset: 'medium', scale: '1920:-2' }
        };

        const settings = qualitySettings[quality] || qualitySettings.medium;

        // FFmpeg Kommando ausführen
        // -crf: Qualität (niedriger = besser, 18-28 ist gut)
        // -preset: Geschwindigkeit vs Komprimierung
        // -vf scale: Maximale Auflösung
        // -movflags +faststart: Für Web-Streaming optimiert
        await ff.exec([
            '-i', inputName,
            '-c:v', 'libx264',
            '-crf', settings.crf,
            '-preset', settings.preset,
            '-vf', `scale='min(${settings.scale.split(':')[0]},iw)':'-2'`,
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y',
            outputName
        ]);

        if (onStatus) onStatus('Video wird fertiggestellt...');
        if (onProgress) onProgress(95);

        // Output lesen
        const outputData = await ff.readFile(outputName);

        // Cleanup
        await ff.deleteFile(inputName);
        await ff.deleteFile(outputName);

        if (onProgress) onProgress(100);
        if (onStatus) onStatus('Fertig!');

        // Neue Datei erstellen
        const compressedBlob = new Blob([outputData], { type: 'video/mp4' });
        const compressedFile = new File(
            [compressedBlob],
            file.name.replace(/\.[^/.]+$/, '') + '_compressed.mp4',
            { type: 'video/mp4' }
        );

        console.log(`[VideoCompressor] Compressed ${(file.size / 1024 / 1024).toFixed(1)}MB -> ${(compressedFile.size / 1024 / 1024).toFixed(1)}MB`);

        return compressedFile;

    } catch (error) {
        console.error('[VideoCompressor] Compression failed:', error);
        if (onStatus) onStatus('Fehler bei der Komprimierung');
        throw error;
    }
}

/**
 * Zeigt den Komprimierungs-Dialog an
 * @param {File} file - Die Video-Datei
 * @returns {Promise<{ compress: boolean, file: File }>}
 */
export function showCompressionDialog(file) {
    return new Promise((resolve) => {
        const recommendation = getCompressionRecommendation(file);

        // Modal erstellen
        const modal = document.createElement('div');
        modal.id = 'compression-dialog';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
        modal.style.zIndex = '100002';

        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                        <i class="fas fa-compress-alt text-purple-600 text-xl"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-lg">Video komprimieren?</h3>
                        <p class="text-sm text-gray-500">Das Video ist ${recommendation.originalSizeMB} MB groß</p>
                    </div>
                </div>

                <div class="bg-gray-50 rounded-lg p-4 mb-4">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-gray-600">Originalgröße:</span>
                        <span class="font-medium">${recommendation.originalSizeMB} MB</span>
                    </div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-sm text-gray-600">Geschätzte Größe:</span>
                        <span class="font-medium text-green-600">~${recommendation.estimatedSizeMB} MB</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Ersparnis:</span>
                        <span class="font-medium text-green-600">~${recommendation.savingsPercent}%</span>
                    </div>
                </div>

                <p class="text-sm text-gray-500 mb-4">
                    Die Komprimierung kann je nach Videolänge einige Sekunden dauern.
                    Die Qualität bleibt dabei gut erhalten.
                </p>

                <div class="flex gap-3">
                    <button id="compress-skip" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
                        Überspringen
                    </button>
                    <button id="compress-start" class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                        <i class="fas fa-compress-alt mr-2"></i>Komprimieren
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event Listener
        document.getElementById('compress-skip').addEventListener('click', () => {
            modal.remove();
            resolve({ compress: false, file: file });
        });

        document.getElementById('compress-start').addEventListener('click', () => {
            modal.remove();
            resolve({ compress: true, file: file });
        });

        // Backdrop Click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve({ compress: false, file: file });
            }
        });
    });
}

/**
 * Zeigt den Komprimierungs-Fortschritt an
 * @param {File} file - Die Video-Datei
 * @param {Function} onComplete - Callback wenn fertig
 * @returns {Object} - { updateProgress, updateStatus, close }
 */
export function showCompressionProgress(file) {
    const modal = document.createElement('div');
    modal.id = 'compression-progress';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.style.zIndex = '100002';

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-cog fa-spin text-purple-600 text-xl"></i>
                </div>
                <div>
                    <h3 class="font-bold text-lg">Video wird komprimiert</h3>
                    <p id="compression-status" class="text-sm text-gray-500">Wird vorbereitet...</p>
                </div>
            </div>

            <div class="mb-4">
                <div class="flex justify-between text-sm mb-1">
                    <span class="text-gray-600">${file.name}</span>
                    <span id="compression-percent" class="font-medium">0%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-3">
                    <div id="compression-bar" class="bg-purple-600 h-3 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>

            <p class="text-xs text-gray-400 text-center">
                Bitte warte, bis die Komprimierung abgeschlossen ist...
            </p>
        </div>
    `;

    document.body.appendChild(modal);

    return {
        updateProgress: (percent) => {
            const bar = document.getElementById('compression-bar');
            const percentText = document.getElementById('compression-percent');
            if (bar) bar.style.width = `${percent}%`;
            if (percentText) percentText.textContent = `${percent}%`;
        },
        updateStatus: (status) => {
            const statusEl = document.getElementById('compression-status');
            if (statusEl) statusEl.textContent = status;
        },
        close: () => {
            modal.remove();
        }
    };
}

/**
 * Hilfsfunktion: Dateiendung ermitteln
 */
function getFileExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    return '.' + ext;
}

/**
 * Prüft ob der Browser FFmpeg.wasm unterstützt
 */
export function isCompressionSupported() {
    // SharedArrayBuffer wird für FFmpeg.wasm benötigt
    return typeof SharedArrayBuffer !== 'undefined';
}

// Export für globalen Zugriff
window.videoCompressor = {
    shouldCompressVideo,
    getCompressionRecommendation,
    compressVideo,
    showCompressionDialog,
    showCompressionProgress,
    isCompressionSupported
};

export default {
    shouldCompressVideo,
    getCompressionRecommendation,
    compressVideo,
    showCompressionDialog,
    showCompressionProgress,
    isCompressionSupported
};
