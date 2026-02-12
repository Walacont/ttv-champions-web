/**
 * Video AI Detector - Custom ONNX Model Inference for Ball/Racket Detection
 * Uses ONNX Runtime Web (MIT License) for browser-based inference.
 * Designed to load custom-trained RF-DETR or similar models exported as ONNX.
 *
 * Lizenz: MIT (onnxruntime-web) - kommerziell nutzbar
 */

let onnxSession = null;
let onnxLoading = false;
let onnxLoaded = false;
let ort = null;

// Model configuration (set after loading model metadata)
let modelInputSize = 640;
let modelClassNames = ['ball', 'racket', 'table'];

/**
 * Loads the ONNX Runtime library and custom detection model.
 * @param {string} [modelPath] - Path to the ONNX model file
 * @param {Function} [onProgress] - Progress callback (0-100)
 * @returns {Promise<boolean>} - True if loaded successfully
 */
export async function loadDetectorModel(modelPath, onProgress) {
    if (onnxLoaded && onnxSession) return true;

    if (onnxLoading) {
        while (onnxLoading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return onnxLoaded;
    }

    onnxLoading = true;

    try {
        if (onProgress) onProgress(5);

        // Load ONNX Runtime Web
        ort = await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/esm/ort.min.js');

        // Prefer WebGPU, fallback to WASM
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';

        if (onProgress) onProgress(20);

        // Determine model path
        const path = modelPath || '/models/tt-detector.onnx';

        // Check if model file exists
        const resp = await fetch(path, { method: 'HEAD' });
        if (!resp.ok) {
            console.warn(`[Detector] Model not found at ${path}. Train a model first using the Colab notebook.`);
            onnxLoading = false;
            return false;
        }

        if (onProgress) onProgress(40);

        // Create inference session
        const sessionOptions = {
            executionProviders: ['webgpu', 'wasm'],
            graphOptimizationLevel: 'all'
        };

        onnxSession = await ort.InferenceSession.create(path, sessionOptions);

        if (onProgress) onProgress(90);

        // Read model metadata
        const inputMeta = onnxSession.inputNames;
        const outputMeta = onnxSession.outputNames;
        console.log('[Detector] Model inputs:', inputMeta);
        console.log('[Detector] Model outputs:', outputMeta);

        onnxLoaded = true;
        if (onProgress) onProgress(100);
        console.log(`[Detector] Custom ONNX model loaded from ${path}`);

        return true;
    } catch (error) {
        console.error('[Detector] Failed to load ONNX model:', error);
        onnxLoading = false;
        return false;
    } finally {
        onnxLoading = false;
    }
}

/**
 * Preprocesses a video frame for model input.
 * Resizes to modelInputSize x modelInputSize, normalizes to [0,1], transposes to NCHW.
 * @param {HTMLVideoElement|HTMLCanvasElement|ImageData} source
 * @returns {Float32Array} - Preprocessed tensor data
 */
function preprocessFrame(source) {
    const canvas = document.createElement('canvas');
    canvas.width = modelInputSize;
    canvas.height = modelInputSize;
    const ctx = canvas.getContext('2d');

    // Draw source, resizing to square (letterbox would be better but simpler this way)
    let srcW, srcH;
    if (source instanceof HTMLVideoElement) {
        srcW = source.videoWidth;
        srcH = source.videoHeight;
    } else if (source instanceof HTMLCanvasElement) {
        srcW = source.width;
        srcH = source.height;
    } else {
        srcW = source.width;
        srcH = source.height;
    }

    // Letterbox: maintain aspect ratio, pad with black
    const scale = Math.min(modelInputSize / srcW, modelInputSize / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = (modelInputSize - newW) / 2;
    const padY = (modelInputSize - newH) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, modelInputSize, modelInputSize);
    ctx.drawImage(source, padX, padY, newW, newH);

    const imageData = ctx.getImageData(0, 0, modelInputSize, modelInputSize);
    const data = imageData.data;

    // Convert to NCHW format, normalize to [0, 1]
    const size = modelInputSize * modelInputSize;
    const float32Data = new Float32Array(3 * size);

    for (let i = 0; i < size; i++) {
        float32Data[i] = data[i * 4] / 255.0;           // R
        float32Data[size + i] = data[i * 4 + 1] / 255.0; // G
        float32Data[2 * size + i] = data[i * 4 + 2] / 255.0; // B
    }

    return { tensorData: float32Data, scale, padX, padY, srcW, srcH };
}

/**
 * Runs detection on a video frame using the custom ONNX model.
 * @param {HTMLVideoElement} videoElement
 * @param {number} [threshold=0.3] - Minimum confidence threshold
 * @returns {Promise<Object|null>} - { balls: [{x, y, width, height, score}], rackets: [...], table: {...}|null }
 */
export async function detectCustom(videoElement, threshold = 0.3) {
    if (!onnxSession || !onnxLoaded) return null;
    if (videoElement.readyState < 2) return null;

    try {
        const { tensorData, scale, padX, padY, srcW, srcH } = preprocessFrame(videoElement);

        // Create input tensor
        const inputTensor = new ort.Tensor('float32', tensorData, [1, 3, modelInputSize, modelInputSize]);

        // Run inference
        const inputName = onnxSession.inputNames[0];
        const feeds = { [inputName]: inputTensor };
        const results = await onnxSession.run(feeds);

        // Parse outputs (format depends on model export)
        return parseDetections(results, threshold, scale, padX, padY, srcW, srcH);
    } catch (error) {
        console.error('[Detector] Inference failed:', error);
        return null;
    }
}

/**
 * Parses raw model outputs into structured detections.
 * Supports common output formats from RF-DETR and RT-DETR models.
 */
function parseDetections(results, threshold, scale, padX, padY, srcW, srcH) {
    const outputNames = Object.keys(results);
    const balls = [];
    const rackets = [];
    let table = null;

    // Try common output formats

    // Format 1: "labels" + "boxes" + "scores" (RF-DETR / RT-DETR)
    if (results['labels'] && results['boxes'] && results['scores']) {
        const labels = results['labels'].data;
        const boxes = results['boxes'].data;
        const scores = results['scores'].data;

        for (let i = 0; i < scores.length; i++) {
            if (scores[i] < threshold) continue;

            const classId = labels[i];
            // Boxes are typically [x1, y1, x2, y2] in model input space
            const x1 = (boxes[i * 4] - padX) / scale;
            const y1 = (boxes[i * 4 + 1] - padY) / scale;
            const x2 = (boxes[i * 4 + 2] - padX) / scale;
            const y2 = (boxes[i * 4 + 3] - padY) / scale;

            const detection = {
                x: x1 / srcW,
                y: y1 / srcH,
                width: (x2 - x1) / srcW,
                height: (y2 - y1) / srcH,
                score: scores[i],
                className: modelClassNames[classId] || `class_${classId}`
            };

            categorizeDetection(detection, balls, rackets, table);
            if (detection.className === 'table' && (!table || detection.score > table.score)) {
                table = detection;
            }
        }
    }
    // Format 2: Single output tensor [batch, num_detections, 6] (x1,y1,x2,y2,score,class)
    else if (outputNames.length === 1) {
        const output = results[outputNames[0]];
        const data = output.data;
        const shape = output.dims;

        if (shape.length === 3 && shape[2] >= 6) {
            const numDets = shape[1];
            for (let i = 0; i < numDets; i++) {
                const offset = i * shape[2];
                const score = data[offset + 4];
                if (score < threshold) continue;

                const classId = Math.round(data[offset + 5]);
                const x1 = (data[offset] - padX) / scale;
                const y1 = (data[offset + 1] - padY) / scale;
                const x2 = (data[offset + 2] - padX) / scale;
                const y2 = (data[offset + 3] - padY) / scale;

                const detection = {
                    x: x1 / srcW,
                    y: y1 / srcH,
                    width: (x2 - x1) / srcW,
                    height: (y2 - y1) / srcH,
                    score,
                    className: modelClassNames[classId] || `class_${classId}`
                };

                categorizeDetection(detection, balls, rackets, table);
                if (detection.className === 'table' && (!table || detection.score > table.score)) {
                    table = detection;
                }
            }
        }
    }

    return { balls, rackets, table };
}

/**
 * Categorizes a detection into the appropriate array.
 */
function categorizeDetection(det, balls, rackets) {
    if (det.className === 'ball') {
        balls.push(det);
    } else if (det.className === 'racket') {
        rackets.push(det);
    }
}

/**
 * Checks if the custom detector model is loaded.
 */
export function isDetectorLoaded() {
    return onnxLoaded && onnxSession !== null;
}

/**
 * Sets the class names for the model (call before or after loading).
 * @param {string[]} names - Array of class names matching model output indices
 */
export function setClassNames(names) {
    modelClassNames = names;
}

/**
 * Destroys the detector session and frees memory.
 */
export function destroyDetector() {
    if (onnxSession) {
        onnxSession.release();
        onnxSession = null;
    }
    onnxLoaded = false;
    onnxLoading = false;
}

// Global access
window.videoAIDetector = {
    loadDetectorModel,
    detectCustom,
    isDetectorLoaded,
    setClassNames,
    destroyDetector
};

export default {
    loadDetectorModel,
    detectCustom,
    isDetectorLoaded,
    setClassNames,
    destroyDetector
};
