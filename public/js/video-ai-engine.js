/**
 * Video AI Engine - MediaPipe Pose-Erkennung für Tischtennis-Videoanalyse
 * Lädt MediaPipe Tasks Vision, erkennt Posen und cached Ergebnisse.
 */

// MediaPipe wird lazy geladen wenn benötigt
let poseLandmarker = null;
let objectDetector = null;
let mediapipeLoaded = false;
let mediapipeLoading = false;
let objectDetectorLoaded = false;
let objectDetectorLoading = false;

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
 * Lädt MediaPipe ObjectDetector für Tisch- und Ballerkennung.
 * Nutzt EfficientDet-Lite0 (COCO-Datensatz: erkennt "dining table", "sports ball").
 * @param {Function} [onProgress] - Fortschritts-Callback (0-100)
 */
export async function loadObjectDetector(onProgress) {
    if (objectDetectorLoaded && objectDetector) return objectDetector;

    if (!isAIAvailable()) {
        throw new Error('KI-Analyse ist auf dieser Plattform nicht verfügbar.');
    }

    if (objectDetectorLoading) {
        while (objectDetectorLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return objectDetector;
    }

    objectDetectorLoading = true;

    try {
        if (onProgress) onProgress(10);

        const vision = await import('https://esm.sh/@mediapipe/tasks-vision@0.10.18');
        const { ObjectDetector, FilesetResolver } = vision;

        if (onProgress) onProgress(40);

        const wasmFileset = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
        );

        if (onProgress) onProgress(70);

        objectDetector = await ObjectDetector.createFromOptions(wasmFileset, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            maxResults: 10,
            scoreThreshold: 0.3,
            categoryAllowlist: ['dining table', 'sports ball']
        });

        objectDetectorLoaded = true;
        if (onProgress) onProgress(100);
        console.log('[AI Engine] MediaPipe ObjectDetector loaded (table + ball)');

        return objectDetector;
    } catch (error) {
        console.error('[AI Engine] Failed to load ObjectDetector:', error);
        objectDetectorLoading = false;
        throw error;
    } finally {
        objectDetectorLoading = false;
    }
}

/**
 * Erkennt Objekte (Tisch, Ball) im aktuellen Video-Frame.
 * @param {HTMLVideoElement} videoElement
 * @returns {Object|null} - { table: {x,y,width,height,score}|null, balls: [{x,y,width,height,score}] }
 */
export function detectObjects(videoElement) {
    if (!objectDetector || !objectDetectorLoaded) return null;
    if (videoElement.readyState < 2) return null;

    try {
        mediapipeTimestampCounter += 1;
        const result = objectDetector.detectForVideo(videoElement, mediapipeTimestampCounter);

        let table = null;
        const balls = [];

        if (result && result.detections) {
            for (const det of result.detections) {
                if (!det.categories || !det.categories[0]) continue;
                const cat = det.categories[0];
                const bb = det.boundingBox;
                if (!bb) continue;

                const box = {
                    x: bb.originX / videoElement.videoWidth,
                    y: bb.originY / videoElement.videoHeight,
                    width: bb.width / videoElement.videoWidth,
                    height: bb.height / videoElement.videoHeight,
                    score: cat.score
                };

                if (cat.categoryName === 'dining table') {
                    if (!table || cat.score > table.score) {
                        table = box;
                    }
                } else if (cat.categoryName === 'sports ball') {
                    balls.push(box);
                }
            }
        }

        return { table, balls };
    } catch (error) {
        console.error('[AI Engine] Object detection failed:', error);
        return null;
    }
}

/**
 * Farbbasierte Tischerkennung: Sucht nach der dominanten blauen/grünen Fläche
 * im Frame (Tischtennis-Tische sind immer blau oder grün).
 * Nutzt Canvas-Pixel-Analyse statt ML-Modell.
 * @param {HTMLVideoElement} videoElement
 * @returns {Object|null} - {x, y, width, height, color:'blue'|'green', pixelRatio}
 */
function detectTableByColor(videoElement) {
    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;
    if (!w || !h) return null;

    // Canvas in reduzierter Auflösung für Performance
    const scale = Math.min(1, 320 / w);
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoElement, 0, 0, sw, sh);
    const imageData = ctx.getImageData(0, 0, sw, sh);
    const data = imageData.data;

    // Pixel als blau/grün klassifizieren via HSV
    const mask = new Uint8Array(sw * sh); // 0=nothing, 1=blue, 2=green

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        const d = max - min;

        if (d < 15 || l < 25 || l > 210) continue;

        const denom = 255 - Math.abs(2 * l - 255);
        const s = denom > 0 ? d / denom : 0;
        if (s < 0.20) continue;

        let hue = 0;
        if (max === r) hue = ((g - b) / d) % 6;
        else if (max === g) hue = (b - r) / d + 2;
        else hue = (r - g) / d + 4;
        hue = ((hue * 60) + 360) % 360;

        const pIdx = i / 4;
        if (hue >= 196 && hue <= 250 && s > 0.25 && l > 25 && l < 190) {
            mask[pIdx] = 1; // Blau
        } else if (hue >= 80 && hue <= 195 && s > 0.20 && l > 20 && l < 180) {
            mask[pIdx] = 2; // Grün
        }
    }

    // Zähle Blau vs Grün
    let blueCount = 0, greenCount = 0;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 1) blueCount++;
        else if (mask[i] === 2) greenCount++;
    }

    const totalPixels = sw * sh;
    const dominantColor = blueCount >= greenCount ? 1 : 2;
    const dominantCount = Math.max(blueCount, greenCount);
    const colorName = dominantColor === 1 ? 'blue' : 'green';

    if (dominantCount / totalPixels < 0.005) return null;

    // ===== Grid + Multi-Cluster mit Scoring =====
    const cellW = Math.max(4, Math.round(sw / 24));
    const cellH = Math.max(4, Math.round(sh / 18));
    const gridW = Math.ceil(sw / cellW);
    const gridH = Math.ceil(sh / cellH);
    const grid = new Float32Array(gridW * gridH);

    for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
            if (mask[y * sw + x] === dominantColor) {
                const gx = Math.min(gridW - 1, Math.floor(x / cellW));
                const gy = Math.min(gridH - 1, Math.floor(y / cellH));
                grid[gy * gridW + gx]++;
            }
        }
    }

    const maxCellPixels = cellW * cellH;
    for (let i = 0; i < grid.length; i++) {
        grid[i] /= maxCellPixels;
    }

    // Finde ALLE Cluster via BFS
    const densityThreshold = 0.12;
    const visited = new Uint8Array(gridW * gridH);
    const allClusters = [];

    for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
            const idx = gy * gridW + gx;
            if (visited[idx] || grid[idx] < densityThreshold) continue;

            const queue = [[gx, gy]];
            visited[idx] = 1;
            let cMinX = gx, cMaxX = gx, cMinY = gy, cMaxY = gy;
            let clusterDensity = 0;
            let clusterSize = 0;

            while (queue.length > 0) {
                const [cx, cy] = queue.shift();
                clusterDensity += grid[cy * gridW + cx];
                clusterSize++;
                if (cx < cMinX) cMinX = cx;
                if (cx > cMaxX) cMaxX = cx;
                if (cy < cMinY) cMinY = cy;
                if (cy > cMaxY) cMaxY = cy;

                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
                    const nIdx = ny * gridW + nx;
                    if (visited[nIdx] || grid[nIdx] < densityThreshold) continue;
                    visited[nIdx] = 1;
                    queue.push([nx, ny]);
                }
            }

            // Mindestens 3 Zellen
            if (clusterSize >= 3) {
                allClusters.push({ cMinX, cMaxX, cMinY, cMaxY, clusterDensity, clusterSize });
            }
        }
    }

    if (allClusters.length === 0) return null;

    // Für jeden Cluster: exakte Pixel-Box berechnen und nach Tisch-Eigenschaften bewerten
    let bestResult = null;
    let bestScore = -Infinity;

    for (const cluster of allClusters) {
        const pxMinX = cluster.cMinX * cellW;
        const pxMinY = cluster.cMinY * cellH;
        const pxMaxX = Math.min(sw, (cluster.cMaxX + 1) * cellW);
        const pxMaxY = Math.min(sh, (cluster.cMaxY + 1) * cellH);

        // Exakte Bounding Box innerhalb des Clusters
        let fMinX = pxMaxX, fMinY = pxMaxY, fMaxX = pxMinX, fMaxY = pxMinY;
        let filledPixels = 0;
        for (let y = pxMinY; y < pxMaxY; y++) {
            for (let x = pxMinX; x < pxMaxX; x++) {
                if (mask[y * sw + x] === dominantColor) {
                    filledPixels++;
                    if (x < fMinX) fMinX = x;
                    if (x > fMaxX) fMaxX = x;
                    if (y < fMinY) fMinY = y;
                    if (y > fMaxY) fMaxY = y;
                }
            }
        }

        const boxW = fMaxX - fMinX;
        const boxH = fMaxY - fMinY;
        if (boxW < sw * 0.06 || boxH < sh * 0.015) continue;

        const aspectRatio = boxW / Math.max(1, boxH);
        const areaRatio = (boxW * boxH) / (sw * sh);
        const fillRatio = filledPixels / Math.max(1, boxW * boxH);

        // Tisch-Scoring: höher = wahrscheinlicher ein TT-Tisch
        let score = 0;

        // 1. Seitenverhältnis: TT-Tisch ≈ 2.74:1 (Kamera: ~1.5 bis 5)
        //    Quadratische Objekte (Matten!) bekommen Abzug
        if (aspectRatio >= 1.5 && aspectRatio <= 6.0) {
            // Bonus: je näher an 2.74, desto besser
            const arDist = Math.abs(aspectRatio - 2.74);
            score += Math.max(0, 30 - arDist * 8);
        } else if (aspectRatio >= 1.2 && aspectRatio < 1.5) {
            score += 5; // Leicht breit, könnte Perspektive sein
        } else {
            score -= 20; // Quadratisch oder hochkant = kein Tisch
        }

        // 2. Füllgrad: Tisch ist ein gefülltes Rechteck (>30%)
        //    Unregelmäßige Formen (Wände, verstreute Pixel) haben niedrigen Füllgrad
        if (fillRatio > 0.25) {
            score += fillRatio * 25;
        } else {
            score -= 10;
        }

        // 3. Position: Tisch steht typisch in der Mitte oder unteren Hälfte
        const centerY = (fMinY + fMaxY) / 2 / sh;
        const centerX = (fMinX + fMaxX) / 2 / sw;
        // Vertikale Mitte bevorzugen (0.3 - 0.8)
        if (centerY >= 0.3 && centerY <= 0.8) {
            score += 15;
        } else if (centerY >= 0.2 && centerY <= 0.9) {
            score += 5;
        }
        // Horizontale Mitte bevorzugen
        if (centerX >= 0.2 && centerX <= 0.8) {
            score += 10;
        }

        // 4. Größe: Tisch nimmt typisch 5-40% des Bildes ein
        if (areaRatio >= 0.03 && areaRatio <= 0.35) {
            score += 15;
        } else if (areaRatio > 0.35 && areaRatio <= 0.50) {
            score += 5;
        } else if (areaRatio > 0.50) {
            score -= 20; // Viel zu groß
        }

        // 5. Dichte des Clusters (mittlere Zelldichte)
        const avgDensity = cluster.clusterDensity / cluster.clusterSize;
        score += avgDensity * 10;

        if (score > bestScore) {
            bestScore = score;
            bestResult = {
                x: fMinX / sw,
                y: fMinY / sh,
                width: boxW / sw,
                height: boxH / sh,
                color: colorName,
                pixelRatio: dominantCount / totalPixels,
                _score: score,
                _aspect: aspectRatio,
                _fill: fillRatio,
                _area: areaRatio
            };
        }
    }

    // Mindest-Score: unter 15 ist es wahrscheinlich kein Tisch
    if (!bestResult || bestScore < 15) return null;

    return bestResult;
}

/**
 * Sucht nach kleinen weißen oder orangenen Objekten (Ball-Kandidaten).
 * Tischtennisbälle sind weiß oder orange, ~40mm, im Video oft nur 3-8px.
 * @param {HTMLVideoElement} videoElement
 * @param {Object|null} tableBox - Bekannte Tischposition (Suche drumherum)
 * @returns {Array} - [{x, y, score}]
 */
function detectBallByColor(videoElement, tableBox) {
    const w = videoElement.videoWidth;
    const h = videoElement.videoHeight;
    if (!w || !h) return [];

    const scale = Math.min(1, 480 / w);
    const sw = Math.round(w * scale);
    const sh = Math.round(h * scale);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoElement, 0, 0, sw, sh);
    const imageData = ctx.getImageData(0, 0, sw, sh);
    const data = imageData.data;

    // Suchbereich: Tisch ± großzügiger Bereich (Ball fliegt über dem Tisch)
    let searchMinY = 0, searchMaxY = sh;
    let searchMinX = 0, searchMaxX = sw;
    if (tableBox) {
        const tTop = Math.round(tableBox.y * sh);
        const tBot = Math.round((tableBox.y + tableBox.height) * sh);
        const tLeft = Math.round(tableBox.x * sw);
        const tRight = Math.round((tableBox.x + tableBox.width) * sw);
        const tHeight = tBot - tTop;
        const tWidth = tRight - tLeft;
        // Ball kann weit über dem Tisch sein + etwas seitlich daneben
        searchMinY = Math.max(0, tTop - tHeight * 3);
        searchMaxY = Math.min(sh, tBot + tHeight);
        searchMinX = Math.max(0, tLeft - tWidth * 0.3);
        searchMaxX = Math.min(sw, tRight + tWidth * 0.3);
    }

    const candidates = [];

    // Suche nach hellen, kleinen Blob-Zentren
    // Weiß: R>200, G>200, B>200 (hohe Helligkeit, niedrige Sättigung)
    // Orange: R>180, G>100-170, B<100 (TT-Ball Orange)
    for (let y = searchMinY + 1; y < searchMaxY - 1; y++) {
        for (let x = searchMinX + 1; x < searchMaxX - 1; x++) {
            const idx = (y * sw + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];

            let isBall = false;

            // Weiß (Ball unter verschiedener Beleuchtung)
            if (r > 195 && g > 195 && b > 195) {
                isBall = true;
            }
            // Orange (TT-Ball Orange)
            if (r > 180 && g > 90 && g < 180 && b < 110) {
                isBall = true;
            }

            if (!isBall) continue;

            // Prüfe ob es ein kleiner isolierter Punkt ist (nicht Teil einer großen Fläche)
            // Zähle ähnliche Pixel in 5x5 Nachbarschaft
            let neighborCount = 0;
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const ni = ((y + dy) * sw + (x + dx)) * 4;
                    if (ni < 0 || ni >= data.length) continue;
                    const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
                    if ((nr > 195 && ng > 195 && nb > 195) ||
                        (nr > 180 && ng > 90 && ng < 180 && nb < 110)) {
                        neighborCount++;
                    }
                }
            }

            // Ball: 3-15 Pixel im 5x5 Fenster (nicht zu wenig = Rauschen, nicht zu viel = große Fläche)
            if (neighborCount < 3 || neighborCount > 15) continue;

            // Kontrast-Check: Der Ball muss sich von der Umgebung abheben
            // Prüfe 9x9 Ring (äußere Pixel) - dort sollte es deutlich dunkler sein
            let ringDark = 0, ringTotal = 0;
            for (let dy = -4; dy <= 4; dy++) {
                for (let dx = -4; dx <= 4; dx++) {
                    if (Math.abs(dy) < 3 && Math.abs(dx) < 3) continue; // Inneren Bereich überspringen
                    const ny2 = y + dy, nx2 = x + dx;
                    if (ny2 < 0 || ny2 >= sh || nx2 < 0 || nx2 >= sw) continue;
                    const ni = (ny2 * sw + nx2) * 4;
                    const nr = data[ni], ng = data[ni + 1], nb = data[ni + 2];
                    const brightness = (nr + ng + nb) / 3;
                    ringTotal++;
                    if (brightness < 160) ringDark++;
                }
            }
            // Mindestens 50% der Ring-Pixel müssen deutlich dunkler sein
            if (ringTotal > 0 && ringDark / ringTotal < 0.5) continue;

            candidates.push({
                x: x / sw,
                y: y / sh,
                score: Math.min(1, neighborCount / 10)
            });
        }
    }

    // Cluster-Zentren finden (Kandidaten die nah beisammen liegen zusammenfassen)
    const clusters = [];
    const used = new Set();
    const clusterRadius = 8 / sw; // ~8 Pixel Radius

    for (let i = 0; i < candidates.length; i++) {
        if (used.has(i)) continue;
        let cx = candidates[i].x, cy = candidates[i].y, cs = candidates[i].score, count = 1;
        used.add(i);

        for (let j = i + 1; j < candidates.length; j++) {
            if (used.has(j)) continue;
            const dx = candidates[j].x - cx / count;
            const dy = candidates[j].y - cy / count;
            if (Math.sqrt(dx * dx + dy * dy) < clusterRadius) {
                cx += candidates[j].x;
                cy += candidates[j].y;
                cs = Math.max(cs, candidates[j].score);
                count++;
                used.add(j);
            }
        }

        clusters.push({
            x: cx / count,
            y: cy / count,
            score: cs
        });
    }

    // Nur bester Kandidat pro Frame (reduziert False Positives)
    clusters.sort((a, b) => b.score - a.score);
    return clusters.length > 0 ? [clusters[0]] : [];
}

/**
 * Analysiert einen Zeitbereich und erkennt Tisch + Ball pro Frame.
 * Hybrid-Ansatz: Farbbasierte Erkennung (zuverlässig für TT) + ObjectDetector als Fallback.
 * @param {HTMLVideoElement} videoElement
 * @param {number} startTime
 * @param {number} endTime
 * @param {number} fps - Frames pro Sekunde
 * @param {Function} [onProgress]
 * @param {AbortSignal} [signal]
 * @returns {Promise<Object>} - { table: {x,y,w,h,color}|null, ballTrack: [{time,x,y}] }
 */
export async function analyzeTableAndBall(videoElement, startTime, endTime, fps = 3, onProgress, signal) {
    const interval = 1 / fps;
    const totalFrames = Math.ceil((endTime - startTime) * fps);
    const tableCandidates = [];
    const objDetTableCandidates = [];
    const ballTrack = [];

    // Probiere ObjectDetector zu laden (optional, Fallback)
    let hasObjDetector = false;
    if (objectDetectorLoaded && objectDetector) {
        hasObjDetector = true;
    } else {
        try {
            await loadObjectDetector();
            hasObjDetector = true;
        } catch (e) {
            console.warn('[AI Engine] ObjectDetector not available, using color-only detection');
        }
    }

    const wasMuted = videoElement.muted;
    const wasPaused = videoElement.paused;
    videoElement.muted = true;
    videoElement.pause();

    try {
        let frameIndex = 0;
        for (let time = startTime; time <= endTime; time += interval) {
            if (signal && signal.aborted) break;

            await seekTo(videoElement, time);

            // 1. Farbbasierte Tischerkennung (primär)
            const colorTable = detectTableByColor(videoElement);
            if (colorTable) {
                tableCandidates.push(colorTable);
            }

            // 2. ObjectDetector (Fallback/Ergänzung)
            if (hasObjDetector) {
                const objResult = detectObjects(videoElement);
                if (objResult) {
                    if (objResult.table) {
                        objDetTableCandidates.push(objResult.table);
                    }
                    for (const ball of objResult.balls) {
                        ballTrack.push({
                            time,
                            x: ball.x + ball.width / 2,
                            y: ball.y + ball.height / 2,
                            score: ball.score,
                            source: 'detector'
                        });
                    }
                }
            }

            // 3. Farbbasierte Ball-Suche (findet kleine weiße/orange Punkte)
            const currentTableBox = colorTable || (tableCandidates.length > 0 ? tableCandidates[0] : null);
            const colorBalls = detectBallByColor(videoElement, currentTableBox);
            for (const cb of colorBalls) {
                ballTrack.push({
                    time,
                    x: cb.x,
                    y: cb.y,
                    score: cb.score,
                    source: 'color'
                });
            }

            frameIndex++;
            if (onProgress) onProgress(frameIndex, totalFrames);
        }
    } finally {
        videoElement.muted = wasMuted;
        if (!wasPaused) videoElement.play();
    }

    // Stabile Tisch-Bounding-Box: Median über alle Farb-Erkennungen
    let table = null;
    const candidates = tableCandidates.length >= 2 ? tableCandidates : objDetTableCandidates;

    if (candidates.length >= 2) {
        const sorted = (arr) => [...arr].sort((a, b) => a - b);
        const median = (arr) => arr[Math.floor(arr.length / 2)];
        table = {
            x: median(sorted(candidates.map(t => t.x))),
            y: median(sorted(candidates.map(t => t.y))),
            width: median(sorted(candidates.map(t => t.width))),
            height: median(sorted(candidates.map(t => t.height))),
            color: tableCandidates.length > 0 ? tableCandidates[0].color : 'unknown',
            confidence: candidates.length / totalFrames,
            source: tableCandidates.length >= 2 ? 'color' : 'detector'
        };
    }

    return { table, ballTrack };
}

export function isObjectDetectorLoaded() {
    return objectDetectorLoaded && !!objectDetector;
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
    if (objectDetector) {
        objectDetector.close();
        objectDetector = null;
    }
    mediapipeLoaded = false;
    mediapipeLoading = false;
    objectDetectorLoaded = false;
    objectDetectorLoading = false;
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
    loadObjectDetector,
    detectPose,
    detectObjects,
    analyzeFrameRange,
    analyzeTableAndBall,
    clearCache,
    isModelLoaded,
    isObjectDetectorLoaded,
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
    loadObjectDetector,
    detectPose,
    detectObjects,
    analyzeFrameRange,
    analyzeTableAndBall,
    clearCache,
    isModelLoaded,
    isObjectDetectorLoaded,
    destroyEngine,
    saveAnalysisResults,
    loadAnalysisResults,
    loadReferenceAnalysis,
    comparePoses,
    POSE_LANDMARKS,
    POSE_CONNECTIONS
};
