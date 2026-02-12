/**
 * Video AI Engine - MediaPipe Pose-Erkennung für Tischtennis-Videoanalyse
 * Lädt MediaPipe Tasks Vision, erkennt Posen und cached Ergebnisse.
 */

// MediaPipe wird lazy geladen wenn benötigt
let poseLandmarker = null;
let mediapipeLoaded = false;
let mediapipeLoading = false;

// Cache für Analyse-Ergebnisse (videoId:timestamp -> result)
const poseCache = new Map();
const MAX_CACHE_SIZE = 500;

// MediaPipe erfordert strikt monoton steigende Timestamps.
// Wir verwenden einen internen Zähler statt der Video-Zeit,
// damit Re-Analysen und Rückwärts-Seeks keine Fehler verursachen.
let mediapipeTimestampCounter = 0;

/**
 * Prüft ob KI-Analyse im Browser verfügbar ist.
 * Auf nativen Apps ist MediaPipe WASM nicht zuverlässig nutzbar.
 */
export function isAIAvailable() {
    // Nicht auf nativen Capacitor-Apps
    if (typeof window !== 'undefined' && window.Capacitor &&
        window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        return false;
    }
    // WebGL muss verfügbar sein (MediaPipe GPU Delegate)
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        return !!gl;
    } catch {
        return false;
    }
}

/**
 * Lädt MediaPipe PoseLandmarker.
 * @param {Function} [onProgress] - Fortschritts-Callback (0-100)
 * @returns {Promise<Object>} - PoseLandmarker-Instanz
 */
export async function loadModels(onProgress) {
    if (mediapipeLoaded && poseLandmarker) return poseLandmarker;

    if (!isAIAvailable()) {
        throw new Error('KI-Analyse ist auf dieser Plattform nicht verfügbar.');
    }

    // Falls bereits am Laden, warten
    if (mediapipeLoading) {
        while (mediapipeLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return poseLandmarker;
    }

    mediapipeLoading = true;

    try {
        if (onProgress) onProgress(10);

        // MediaPipe Tasks Vision laden (CDN-Pattern wie video-compressor.js)
        const vision = await import('https://esm.sh/@mediapipe/tasks-vision@0.10.18');
        const { PoseLandmarker, FilesetResolver } = vision;

        if (onProgress) onProgress(30);

        // WASM-Fileset laden
        const wasmFileset = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        if (onProgress) onProgress(60);

        // PoseLandmarker erstellen
        poseLandmarker = await PoseLandmarker.createFromOptions(wasmFileset, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 2
        });

        mediapipeLoaded = true;
        if (onProgress) onProgress(100);
        console.log('[AI Engine] MediaPipe PoseLandmarker loaded successfully');

        return poseLandmarker;
    } catch (error) {
        console.error('[AI Engine] Failed to load MediaPipe:', error);
        mediapipeLoading = false;
        throw error;
    } finally {
        mediapipeLoading = false;
    }
}

/**
 * Führt Pose-Erkennung auf dem aktuellen Video-Frame aus.
 * @param {HTMLVideoElement} videoElement
 * @param {number} timestampMs - Aktuelle Wiedergabezeit in Millisekunden
 * @param {string} [videoId] - Video-ID für Caching
 * @returns {Object|null} - MediaPipe PoseLandmarkerResult oder null
 */
export function detectPose(videoElement, timestampMs, videoId) {
    if (!poseLandmarker || !mediapipeLoaded) return null;
    if (videoElement.readyState < 2) return null; // HAVE_CURRENT_DATA

    // Cache prüfen
    const cacheKey = videoId ? `${videoId}:${Math.round(timestampMs)}` : null;
    if (cacheKey && poseCache.has(cacheKey)) {
        return poseCache.get(cacheKey);
    }

    try {
        // MediaPipe erfordert strikt monoton steigende Timestamps.
        // Wir nutzen einen internen Zähler anstelle der Video-Zeit,
        // da MediaPipe den Timestamp nur für interne Stream-Ordnung braucht.
        mediapipeTimestampCounter += 1;
        const result = poseLandmarker.detectForVideo(videoElement, mediapipeTimestampCounter);

        // Cache speichern
        if (cacheKey && result) {
            if (poseCache.size >= MAX_CACHE_SIZE) {
                // Ältesten Eintrag entfernen
                const firstKey = poseCache.keys().next().value;
                poseCache.delete(firstKey);
            }
            poseCache.set(cacheKey, result);
        }

        return result;
    } catch (error) {
        console.error('[AI Engine] Pose detection failed:', error);
        return null;
    }
}

/**
 * Analysiert einen Zeitbereich des Videos Frame für Frame.
 * @param {HTMLVideoElement} videoElement
 * @param {number} startTime - Startzeit in Sekunden
 * @param {number} endTime - Endzeit in Sekunden
 * @param {number} [fps=5] - Frames pro Sekunde (5 = alle 200ms)
 * @param {string} [videoId] - Video-ID für Caching
 * @param {Function} [onProgress] - Callback (framesAnalyzed, totalFrames)
 * @param {AbortSignal} [signal] - AbortController Signal zum Abbrechen
 * @returns {Promise<Array>} - Array von {timestamp, result}
 */
export async function analyzeFrameRange(videoElement, startTime, endTime, fps = 5, videoId, onProgress, signal) {
    if (!poseLandmarker || !mediapipeLoaded) {
        throw new Error('MediaPipe not loaded. Call loadModels() first.');
    }

    const interval = 1 / fps;
    const totalFrames = Math.ceil((endTime - startTime) * fps);
    const results = [];

    // Video stumm schalten und pausieren
    const wasMuted = videoElement.muted;
    const wasPaused = videoElement.paused;
    videoElement.muted = true;
    videoElement.pause();

    try {
        let frameIndex = 0;
        for (let time = startTime; time <= endTime; time += interval) {
            // Abbruch prüfen
            if (signal && signal.aborted) break;

            // Video zum Zeitpunkt seeken
            await seekTo(videoElement, time);

            // Pose erkennen
            const timestampMs = Math.round(time * 1000);
            const result = detectPose(videoElement, timestampMs, videoId);

            if (result && result.landmarks && result.landmarks.length > 0) {
                results.push({
                    timestamp: time,
                    timestampMs,
                    landmarks: result.landmarks,
                    worldLandmarks: result.worldLandmarks,
                    playerCount: result.landmarks.length
                });
            }

            frameIndex++;
            if (onProgress) onProgress(frameIndex, totalFrames);
        }
    } finally {
        // Video-Status wiederherstellen
        videoElement.muted = wasMuted;
        if (!wasPaused) videoElement.play();
    }

    return results;
}

/**
 * Seeked das Video zu einem bestimmten Zeitpunkt und wartet.
 * @param {HTMLVideoElement} video
 * @param {number} timeSeconds
 * @returns {Promise<void>}
 */
function seekTo(video, timeSeconds) {
    return new Promise((resolve) => {
        if (Math.abs(video.currentTime - timeSeconds) < 0.05) {
            resolve();
            return;
        }

        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = timeSeconds;
    });
}

/**
 * Leert den Pose-Cache.
 * @param {string} [videoId] - Optional: nur Cache für dieses Video leeren
 */
export function clearCache(videoId) {
    if (videoId) {
        const prefix = `${videoId}:`;
        for (const key of poseCache.keys()) {
            if (key.startsWith(prefix)) {
                poseCache.delete(key);
            }
        }
    } else {
        poseCache.clear();
    }
}

/**
 * Gibt zurück ob MediaPipe geladen ist.
 */
export function isModelLoaded() {
    return mediapipeLoaded && !!poseLandmarker;
}

/**
 * Zerstört die PoseLandmarker-Instanz und gibt Speicher frei.
 */
export function destroyEngine() {
    if (poseLandmarker) {
        poseLandmarker.close();
        poseLandmarker = null;
    }
    mediapipeLoaded = false;
    mediapipeLoading = false;
    mediapipeTimestampCounter = 0;
    poseCache.clear();
}

/**
 * Speichert Analyse-Ergebnisse in Supabase.
 * @param {Object} db - Supabase-Client
 * @param {string} videoId
 * @param {string} userId
 * @param {Array} frames - Array von {timestamp, landmarks, worldLandmarks, playerCount}
 * @returns {Promise<Object>} - Die gespeicherte Analyse
 */
export async function saveAnalysisResults(db, videoId, userId, frames) {
    const startTime = Date.now();

    // Alte Analysen für dieses Video löschen (verhindert Duplikate)
    // CASCADE löscht auch zugehörige video_ai_frames automatisch
    try {
        await db
            .from('video_ai_analyses')
            .delete()
            .eq('video_id', videoId)
            .eq('analysis_type', 'pose_estimation');
    } catch (e) {
        console.warn('[AI Engine] Could not delete old analyses:', e);
    }

    // Analyse-Haupteintrag erstellen
    const { data: analysis, error: analysisError } = await db
        .from('video_ai_analyses')
        .insert({
            video_id: videoId,
            analysis_type: 'pose_estimation',
            status: 'completed',
            processing_location: 'browser',
            model_name: 'mediapipe_pose_landmarker_heavy',
            model_version: '0.10.18',
            frames_analyzed: frames.length,
            processing_time_ms: Date.now() - startTime,
            summary: {
                total_frames: frames.length,
                max_players_detected: Math.max(...frames.map(f => f.playerCount), 0),
                time_range: frames.length > 0 ? {
                    start: frames[0].timestamp,
                    end: frames[frames.length - 1].timestamp
                } : null
            },
            created_by: userId
        })
        .select()
        .single();

    if (analysisError) {
        console.error('[AI Engine] Failed to save analysis:', analysisError);
        throw analysisError;
    }

    // Frame-Daten in Batches speichern (max 50 pro Insert)
    const batchSize = 50;
    for (let i = 0; i < frames.length; i += batchSize) {
        const batch = frames.slice(i, i + batchSize).map(frame => ({
            analysis_id: analysis.id,
            video_id: videoId,
            timestamp_seconds: frame.timestamp,
            poses: frame.landmarks.map((landmarks, idx) => ({
                landmarks: landmarks.map(l => ({
                    x: Math.round(l.x * 10000) / 10000,
                    y: Math.round(l.y * 10000) / 10000,
                    z: Math.round(l.z * 10000) / 10000,
                    visibility: Math.round(l.visibility * 1000) / 1000
                })),
                worldLandmarks: frame.worldLandmarks[idx] ? frame.worldLandmarks[idx].map(l => ({
                    x: Math.round(l.x * 10000) / 10000,
                    y: Math.round(l.y * 10000) / 10000,
                    z: Math.round(l.z * 10000) / 10000,
                    visibility: Math.round(l.visibility * 1000) / 1000
                })) : null
            })),
            player_count: frame.playerCount
        }));

        const { error: frameError } = await db
            .from('video_ai_frames')
            .insert(batch);

        if (frameError) {
            console.error('[AI Engine] Failed to save frames batch:', frameError);
        }
    }

    // Processing time aktualisieren
    await db
        .from('video_ai_analyses')
        .update({ processing_time_ms: Date.now() - startTime })
        .eq('id', analysis.id);

    return analysis;
}

/**
 * Lädt gespeicherte Analyse-Ergebnisse aus Supabase.
 * @param {Object} db - Supabase-Client
 * @param {string} videoId
 * @returns {Promise<Object|null>} - Die neueste Analyse mit Frames
 */
export async function loadAnalysisResults(db, videoId) {
    // Neueste abgeschlossene Pose-Analyse laden
    const { data: analysis, error } = await db
        .from('video_ai_analyses')
        .select('*')
        .eq('video_id', videoId)
        .eq('analysis_type', 'pose_estimation')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !analysis) return null;

    // Frames laden
    const { data: frames, error: framesError } = await db
        .from('video_ai_frames')
        .select('*')
        .eq('analysis_id', analysis.id)
        .order('timestamp_seconds', { ascending: true });

    if (framesError) {
        console.error('[AI Engine] Failed to load frames:', framesError);
        return null;
    }

    return { analysis, frames };
}

// MediaPipe Keypoint-Namen (33 Punkte)
export const POSE_LANDMARKS = {
    NOSE: 0,
    LEFT_EYE_INNER: 1,
    LEFT_EYE: 2,
    LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4,
    RIGHT_EYE: 5,
    RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7,
    RIGHT_EAR: 8,
    MOUTH_LEFT: 9,
    MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_PINKY: 17,
    RIGHT_PINKY: 18,
    LEFT_INDEX: 19,
    RIGHT_INDEX: 20,
    LEFT_THUMB: 21,
    RIGHT_THUMB: 22,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,
    RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31,
    RIGHT_FOOT_INDEX: 32
};

// Skelett-Verbindungen für Zeichnung
export const POSE_CONNECTIONS = [
    // Torso
    [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
    [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
    [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
    [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],
    // Linker Arm
    [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
    [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
    [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_PINKY],
    [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_INDEX],
    [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_THUMB],
    [POSE_LANDMARKS.LEFT_INDEX, POSE_LANDMARKS.LEFT_PINKY],
    // Rechter Arm
    [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
    [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
    [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_PINKY],
    [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_INDEX],
    [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_THUMB],
    [POSE_LANDMARKS.RIGHT_INDEX, POSE_LANDMARKS.RIGHT_PINKY],
    // Linkes Bein
    [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
    [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
    [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.LEFT_HEEL],
    [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.LEFT_FOOT_INDEX],
    [POSE_LANDMARKS.LEFT_HEEL, POSE_LANDMARKS.LEFT_FOOT_INDEX],
    // Rechtes Bein
    [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
    [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
    [POSE_LANDMARKS.RIGHT_ANKLE, POSE_LANDMARKS.RIGHT_HEEL],
    [POSE_LANDMARKS.RIGHT_ANKLE, POSE_LANDMARKS.RIGHT_FOOT_INDEX],
    [POSE_LANDMARKS.RIGHT_HEEL, POSE_LANDMARKS.RIGHT_FOOT_INDEX],
    // Gesicht
    [POSE_LANDMARKS.NOSE, POSE_LANDMARKS.LEFT_EYE_INNER],
    [POSE_LANDMARKS.LEFT_EYE_INNER, POSE_LANDMARKS.LEFT_EYE],
    [POSE_LANDMARKS.LEFT_EYE, POSE_LANDMARKS.LEFT_EYE_OUTER],
    [POSE_LANDMARKS.LEFT_EYE_OUTER, POSE_LANDMARKS.LEFT_EAR],
    [POSE_LANDMARKS.NOSE, POSE_LANDMARKS.RIGHT_EYE_INNER],
    [POSE_LANDMARKS.RIGHT_EYE_INNER, POSE_LANDMARKS.RIGHT_EYE],
    [POSE_LANDMARKS.RIGHT_EYE, POSE_LANDMARKS.RIGHT_EYE_OUTER],
    [POSE_LANDMARKS.RIGHT_EYE_OUTER, POSE_LANDMARKS.RIGHT_EAR],
    [POSE_LANDMARKS.MOUTH_LEFT, POSE_LANDMARKS.MOUTH_RIGHT],
];

// Alias für kürzeren Zugriff (verwendet in comparePoses/normalizePose)
const L = POSE_LANDMARKS;

/**
 * Lädt Analyse eines anderen Videos als Referenz (z.B. Trainer-Demonstration).
 * @param {Object} db - Supabase-Client
 * @param {string} referenceVideoId - Video-ID der Referenz
 * @returns {Promise<Array|null>} - Frames der Referenz-Analyse
 */
export async function loadReferenceAnalysis(db, referenceVideoId) {
    const result = await loadAnalysisResults(db, referenceVideoId);
    if (!result || !result.frames || result.frames.length === 0) return null;
    return result.frames;
}

/**
 * Vergleicht zwei Posen miteinander (Spieler vs. Referenz).
 * Berechnet einen Ähnlichkeits-Score pro Keypoint-Gruppe.
 * @param {Array} playerPose - Landmarks des Spielers (33 Keypoints)
 * @param {Array} referencePose - Landmarks der Referenz (33 Keypoints)
 * @returns {Object} - { overallScore, groups: { arm, torso, legs }, deviations }
 */
export function comparePoses(playerPose, referencePose) {
    if (!playerPose || !referencePose) return null;

    const groups = {
        arm: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_ELBOW, L.RIGHT_ELBOW, L.LEFT_WRIST, L.RIGHT_WRIST],
        torso: [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP],
        legs: [L.LEFT_HIP, L.RIGHT_HIP, L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE]
    };

    // Posen normalisieren: Schulter-Zentrum als Ursprung, Schulterbreite als Maßstab
    const normalizeP = normalizePose(playerPose);
    const normalizeR = normalizePose(referencePose);

    if (!normalizeP || !normalizeR) return null;

    const results = {};
    const deviations = [];
    let totalScore = 0, totalCount = 0;

    for (const [groupName, indices] of Object.entries(groups)) {
        let similarity = 0, count = 0;

        for (const idx of indices) {
            const p = normalizeP[idx];
            const r = normalizeR[idx];
            if (!p || !r || p.visibility < 0.3 || r.visibility < 0.3) continue;

            const dx = p.x - r.x;
            const dy = p.y - r.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const score = Math.max(0, 1 - dist / 2.0); // Normalisiert auf Schulterbreite

            similarity += score;
            count++;

            if (dist > 0.5) {
                deviations.push({
                    landmark: idx,
                    group: groupName,
                    distance: Math.round(dist * 100) / 100,
                    direction: { x: dx, y: dy }
                });
            }
        }

        results[groupName] = count > 0 ? Math.round((similarity / count) * 100) : 0;
        totalScore += similarity;
        totalCount += count;
    }

    return {
        overallScore: totalCount > 0 ? Math.round((totalScore / totalCount) * 100) : 0,
        groups: results,
        deviations: deviations.sort((a, b) => b.distance - a.distance).slice(0, 5)
    };
}

/**
 * Normalisiert eine Pose: Schulter-Zentrum als Ursprung, Schulterbreite = 1.
 * Macht den Vergleich größen- und positionsunabhängig.
 */
function normalizePose(landmarks) {
    const ls = landmarks[L.LEFT_SHOULDER];
    const rs = landmarks[L.RIGHT_SHOULDER];
    if (!ls || !rs || ls.visibility < 0.3 || rs.visibility < 0.3) return null;

    const centerX = (ls.x + rs.x) / 2;
    const centerY = (ls.y + rs.y) / 2;
    const shoulderWidth = Math.abs(rs.x - ls.x);
    if (shoulderWidth < 0.01) return null; // Zu klein zum Normalisieren

    return landmarks.map(lm => {
        if (!lm) return null;
        return {
            x: (lm.x - centerX) / shoulderWidth,
            y: (lm.y - centerY) / shoulderWidth,
            z: lm.z || 0,
            visibility: lm.visibility
        };
    });
}

// Export für globalen Zugriff
window.videoAIEngine = {
    isAIAvailable,
    loadModels,
    detectPose,
    analyzeFrameRange,
    clearCache,
    isModelLoaded,
    destroyEngine,
    saveAnalysisResults,
    loadAnalysisResults,
    loadReferenceAnalysis,
    comparePoses,
    POSE_LANDMARKS,
    POSE_CONNECTIONS
};

export default {
    isAIAvailable,
    loadModels,
    detectPose,
    analyzeFrameRange,
    clearCache,
    isModelLoaded,
    destroyEngine,
    saveAnalysisResults,
    loadAnalysisResults,
    loadReferenceAnalysis,
    comparePoses,
    POSE_LANDMARKS,
    POSE_CONNECTIONS
};
