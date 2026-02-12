/**
 * Video AI Overlay - Canvas-Overlay für Skelett-Rendering
 * Rendert MediaPipe Pose-Landmarks auf einem Canvas über dem Video-Element.
 * Folgt dem Pattern von VideoDrawingTool (video-drawing-tool.js).
 */

import { POSE_LANDMARKS, POSE_CONNECTIONS } from './video-ai-engine.js';

// Farben für Skelett-Teile (Spieler 1 - warme Farben)
const PLAYER1_COLORS = {
    torso: '#FF4444',     // Rot
    leftArm: '#00DDFF',   // Cyan
    rightArm: '#00AAFF',  // Blau
    leftLeg: '#44FF44',   // Lime
    rightLeg: '#22CC22',  // Grün
    face: '#FFDD00',      // Gelb
    keypoint: '#FFFFFF'   // Weiß
};

// Farben für Spieler 2 - kühle Farben
const PLAYER2_COLORS = {
    torso: '#FF8800',     // Orange
    leftArm: '#FF44FF',   // Magenta
    rightArm: '#CC22CC',  // Lila
    leftLeg: '#FFAA00',   // Bernstein
    rightLeg: '#FF8800',  // Orange
    face: '#FF6666',      // Rosa
    keypoint: '#FFCCCC'   // Hellrosa
};

// Welche Verbindung gehört zu welchem Körperteil
function getConnectionColor(startIdx, endIdx, colors) {
    const L = POSE_LANDMARKS;

    // Torso
    if ((startIdx === L.LEFT_SHOULDER && endIdx === L.RIGHT_SHOULDER) ||
        (startIdx === L.LEFT_SHOULDER && endIdx === L.LEFT_HIP) ||
        (startIdx === L.RIGHT_SHOULDER && endIdx === L.RIGHT_HIP) ||
        (startIdx === L.LEFT_HIP && endIdx === L.RIGHT_HIP)) {
        return colors.torso;
    }

    // Linker Arm
    if ((startIdx >= L.LEFT_SHOULDER && startIdx <= L.LEFT_WRIST && endIdx >= L.LEFT_SHOULDER && endIdx <= L.LEFT_WRIST) ||
        (startIdx === L.LEFT_WRIST && (endIdx === L.LEFT_PINKY || endIdx === L.LEFT_INDEX || endIdx === L.LEFT_THUMB)) ||
        (startIdx === L.LEFT_INDEX && endIdx === L.LEFT_PINKY)) {
        return colors.leftArm;
    }

    // Rechter Arm
    if ((startIdx >= L.RIGHT_SHOULDER && startIdx <= L.RIGHT_WRIST && endIdx >= L.RIGHT_SHOULDER && endIdx <= L.RIGHT_WRIST) ||
        (startIdx === L.RIGHT_WRIST && (endIdx === L.RIGHT_PINKY || endIdx === L.RIGHT_INDEX || endIdx === L.RIGHT_THUMB)) ||
        (startIdx === L.RIGHT_INDEX && endIdx === L.RIGHT_PINKY)) {
        return colors.rightArm;
    }

    // Linkes Bein
    if ((startIdx === L.LEFT_HIP && endIdx === L.LEFT_KNEE) ||
        (startIdx === L.LEFT_KNEE && endIdx === L.LEFT_ANKLE) ||
        (startIdx === L.LEFT_ANKLE && (endIdx === L.LEFT_HEEL || endIdx === L.LEFT_FOOT_INDEX)) ||
        (startIdx === L.LEFT_HEEL && endIdx === L.LEFT_FOOT_INDEX)) {
        return colors.leftLeg;
    }

    // Rechtes Bein
    if ((startIdx === L.RIGHT_HIP && endIdx === L.RIGHT_KNEE) ||
        (startIdx === L.RIGHT_KNEE && endIdx === L.RIGHT_ANKLE) ||
        (startIdx === L.RIGHT_ANKLE && (endIdx === L.RIGHT_HEEL || endIdx === L.RIGHT_FOOT_INDEX)) ||
        (startIdx === L.RIGHT_HEEL && endIdx === L.RIGHT_FOOT_INDEX)) {
        return colors.rightLeg;
    }

    // Gesicht
    return colors.face;
}

/**
 * VideoAIOverlay Klasse
 */
class VideoAIOverlay {
    constructor(videoElement, options = {}) {
        this.video = videoElement;
        this.options = {
            showSkeleton: true,
            showKeypoints: true,
            showPlayer1: true,
            showPlayer2: true,
            lineWidth: options.lineWidth || 2.5,
            keypointRadius: options.keypointRadius || 4,
            minVisibility: options.minVisibility || 0.5,
            ...options
        };

        this.canvas = null;
        this.ctx = null;
        this.container = null;
        this.isActive = false;
        this.currentPoseResult = null;
        this.animationFrameId = null;
        this.savedFrames = null; // Für gespeicherte Analyse-Ergebnisse

        this.init();
    }

    /**
     * Initialisiert das Overlay
     */
    init() {
        this.createContainer();
        this.createCanvas();
        this.setupVideoListeners();
    }

    /**
     * Erstellt den Container (Pattern aus VideoDrawingTool.createContainer)
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'video-ai-overlay-container';
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 5;
        `;

        this.video.parentElement.style.position = 'relative';
        this.video.parentElement.appendChild(this.container);
    }

    /**
     * Erstellt das Canvas (Pattern aus VideoDrawingTool.createCanvas)
     */
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'video-ai-overlay-canvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
        `;

        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.resizeCanvas();
        this._resizeHandler = () => this.resizeCanvas();
        window.addEventListener('resize', this._resizeHandler);
    }

    /**
     * Passt Canvas-Größe an (Pattern aus VideoDrawingTool.resizeCanvas)
     */
    resizeCanvas() {
        const rect = this.video.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.scale(dpr, dpr);

        // Neu rendern
        this.render();
    }

    /**
     * Video-Event-Listener einrichten
     */
    setupVideoListeners() {
        this._seekedHandler = () => {
            if (this.isActive) this.render();
        };
        this.video.addEventListener('seeked', this._seekedHandler);

        // Saved-Frame-Rendering während Wiedergabe
        this._playHandler = () => {
            if (this.isActive && this.savedFrames && !this.animationFrameId) {
                this.startSavedFrameRendering();
            }
        };
        this._pauseHandler = () => {
            this.stopSavedFrameRendering();
            if (this.isActive) this.render();
        };
        this.video.addEventListener('play', this._playHandler);
        this.video.addEventListener('pause', this._pauseHandler);
        this.video.addEventListener('ended', this._pauseHandler);
    }

    /**
     * Setzt den aktuellen Pose-Result für Live-Rendering.
     * @param {Object} poseResult - MediaPipe PoseLandmarkerResult
     */
    setPoseResult(poseResult) {
        this.currentPoseResult = poseResult;
        if (this.isActive) this.render();
    }

    /**
     * Setzt gespeicherte Frames für Offline-Rendering.
     * @param {Array} frames - Array von {timestamp_seconds, poses, player_count}
     */
    setSavedFrames(frames) {
        this.savedFrames = frames;
    }

    /**
     * Holt den passenden Frame für die aktuelle Video-Position.
     */
    getFrameForCurrentTime() {
        if (!this.savedFrames || this.savedFrames.length === 0) return null;

        const currentTime = this.video.currentTime;
        let closest = this.savedFrames[0];
        let minDiff = Math.abs(closest.timestamp_seconds - currentTime);

        for (const frame of this.savedFrames) {
            const diff = Math.abs(frame.timestamp_seconds - currentTime);
            if (diff < minDiff) {
                minDiff = diff;
                closest = frame;
            }
        }

        // Nur rendern wenn der nächste Frame nahe genug ist (max 0.5s Abstand)
        return minDiff <= 0.5 ? closest : null;
    }

    /**
     * Rendert das aktuelle Skelett-Overlay
     */
    render() {
        const rect = this.video.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        if (!this.isActive) return;

        let landmarks = null;

        // Live-Ergebnis hat Vorrang
        if (this.currentPoseResult && this.currentPoseResult.landmarks) {
            landmarks = this.currentPoseResult.landmarks;
        }
        // Sonst gespeicherte Frames verwenden
        else if (this.savedFrames) {
            const frame = this.getFrameForCurrentTime();
            if (frame && frame.poses) {
                landmarks = frame.poses.map(p => p.landmarks);
            }
        }

        if (!landmarks || landmarks.length === 0) return;

        // Jeden erkannten Spieler zeichnen
        for (let playerIdx = 0; playerIdx < landmarks.length; playerIdx++) {
            // Spieler-Toggle prüfen
            if (playerIdx === 0 && !this.options.showPlayer1) continue;
            if (playerIdx === 1 && !this.options.showPlayer2) continue;

            const playerLandmarks = landmarks[playerIdx];
            const colors = playerIdx === 0 ? PLAYER1_COLORS : PLAYER2_COLORS;

            // Skelett-Verbindungen zeichnen
            if (this.options.showSkeleton) {
                this.drawConnections(playerLandmarks, colors, rect);
            }

            // Keypoints zeichnen
            if (this.options.showKeypoints) {
                this.drawKeypoints(playerLandmarks, colors, rect);
            }
        }
    }

    /**
     * Zeichnet die Skelett-Verbindungen
     */
    drawConnections(landmarks, colors, rect) {
        this.ctx.lineWidth = this.options.lineWidth;
        this.ctx.lineCap = 'round';

        for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
            const start = landmarks[startIdx];
            const end = landmarks[endIdx];

            if (!start || !end) continue;
            if (start.visibility < this.options.minVisibility ||
                end.visibility < this.options.minVisibility) continue;

            const color = getConnectionColor(startIdx, endIdx, colors);

            this.ctx.strokeStyle = color;
            this.ctx.beginPath();
            this.ctx.moveTo(start.x * rect.width, start.y * rect.height);
            this.ctx.lineTo(end.x * rect.width, end.y * rect.height);
            this.ctx.stroke();
        }
    }

    /**
     * Zeichnet die Keypoints als Kreise
     */
    drawKeypoints(landmarks, colors, rect) {
        for (let i = 0; i < landmarks.length; i++) {
            const point = landmarks[i];
            if (!point || point.visibility < this.options.minVisibility) continue;

            const x = point.x * rect.width;
            const y = point.y * rect.height;
            const radius = this.options.keypointRadius * (0.5 + point.visibility * 0.5);

            // Äußerer Kreis (Schatten)
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius + 1, 0, 2 * Math.PI);
            this.ctx.fill();

            // Innerer Kreis
            this.ctx.fillStyle = colors.keypoint;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    /**
     * Startet das Live-Rendering (für Video-Wiedergabe).
     * Ruft detectPose pro Frame auf.
     * @param {Function} detectFn - Funktion die für den aktuellen Frame detectPose aufruft
     */
    startLiveRendering(detectFn) {
        this.stopLiveRendering();

        const renderLoop = () => {
            if (!this.isActive) return;

            if (!this.video.paused && !this.video.ended) {
                const result = detectFn(this.video, performance.now());
                if (result) {
                    this.currentPoseResult = result;
                }
                this.render();
            }

            this.animationFrameId = requestAnimationFrame(renderLoop);
        };

        this.animationFrameId = requestAnimationFrame(renderLoop);
    }

    /**
     * Stoppt das Live-Rendering.
     */
    stopLiveRendering() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Startet Rendering-Loop für gespeicherte Frames während Video-Wiedergabe.
     * Leichtgewichtig: ruft nur render() auf (keine MediaPipe-Detection).
     */
    startSavedFrameRendering() {
        this.stopSavedFrameRendering();
        const loop = () => {
            if (!this.isActive || this.video.paused || this.video.ended) return;
            this.render();
            this._savedFrameRAF = requestAnimationFrame(loop);
        };
        this._savedFrameRAF = requestAnimationFrame(loop);
    }

    /**
     * Stoppt das Saved-Frame-Rendering.
     */
    stopSavedFrameRendering() {
        if (this._savedFrameRAF) {
            cancelAnimationFrame(this._savedFrameRAF);
            this._savedFrameRAF = null;
        }
    }

    /**
     * Aktiviert das Overlay
     */
    activate() {
        this.isActive = true;
        this.container.style.display = 'block';
        this.resizeCanvas();
        this.render();
        // Wenn Video bereits läuft und saved Frames vorhanden → Rendering starten
        if (!this.video.paused && this.savedFrames && !this.animationFrameId) {
            this.startSavedFrameRendering();
        }
    }

    /**
     * Deaktiviert das Overlay
     */
    deactivate() {
        this.isActive = false;
        this.stopLiveRendering();
        this.stopSavedFrameRendering();
        this.container.style.display = 'none';
        const rect = this.video.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
    }

    /**
     * Toggle
     */
    toggle() {
        if (this.isActive) {
            this.deactivate();
        } else {
            this.activate();
        }
        return this.isActive;
    }

    /**
     * Zerstört das Overlay und räumt auf
     */
    destroy() {
        this.stopLiveRendering();
        this.stopSavedFrameRendering();
        this.video.removeEventListener('seeked', this._seekedHandler);
        this.video.removeEventListener('play', this._playHandler);
        this.video.removeEventListener('pause', this._pauseHandler);
        this.video.removeEventListener('ended', this._pauseHandler);
        window.removeEventListener('resize', this._resizeHandler);
        if (this.container && this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
        this.canvas = null;
        this.ctx = null;
    }
}

// Export für globalen Zugriff
window.VideoAIOverlay = VideoAIOverlay;

export { VideoAIOverlay };
export default VideoAIOverlay;
