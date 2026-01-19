/**
 * Video Drawing Tool - Canvas-Overlay für Video-Annotationen
 * Ermöglicht Coaches, auf Videos zu zeichnen (Pfeile, Kreise, etc.)
 */

// Zeichen-Modi
const DRAW_MODES = {
    ARROW: 'arrow',
    CIRCLE: 'circle',
    RECTANGLE: 'rectangle',
    FREEHAND: 'freehand',
    LINE: 'line',
    TEXT: 'text'
};

// Standard-Farben
const DEFAULT_COLORS = [
    '#FF0000', // Rot
    '#00FF00', // Grün
    '#0000FF', // Blau
    '#FFFF00', // Gelb
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#FFFFFF', // Weiß
    '#000000'  // Schwarz
];

/**
 * VideoDrawingTool Klasse
 */
class VideoDrawingTool {
    constructor(videoElement, options = {}) {
        this.video = videoElement;
        this.options = {
            strokeWidth: options.strokeWidth || 3,
            color: options.color || '#FF0000',
            onSave: options.onSave || null,
            ...options
        };

        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.currentMode = DRAW_MODES.ARROW;
        this.startX = 0;
        this.startY = 0;
        this.history = [];
        this.historyIndex = -1;
        this.currentPath = [];
        this.container = null;
        this.toolbar = null;
        this.isActive = false;

        this.init();
    }

    /**
     * Initialisiert das Drawing Tool
     */
    init() {
        this.createContainer();
        this.createCanvas();
        this.createToolbar();
        this.setupEventListeners();
        this.saveState();
    }

    /**
     * Erstellt den Container für Canvas und Toolbar
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'video-drawing-container';
        this.container.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        `;

        // Container nach dem Video einfügen
        this.video.parentElement.style.position = 'relative';
        this.video.parentElement.appendChild(this.container);
    }

    /**
     * Erstellt das Canvas-Element
     */
    createCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'video-drawing-canvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            cursor: crosshair;
            pointer-events: none;
        `;

        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // Canvas-Größe anpassen
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Passt die Canvas-Größe an das Video an
     */
    resizeCanvas() {
        const rect = this.video.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';

        this.ctx.scale(dpr, dpr);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Zeichnungen neu rendern
        this.redraw();
    }

    /**
     * Erstellt die Toolbar
     */
    createToolbar() {
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'video-drawing-toolbar';
        this.toolbar.style.cssText = `
            position: absolute;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            display: none;
            gap: 8px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.85);
            border-radius: 12px;
            z-index: 20;
            pointer-events: auto;
            flex-wrap: wrap;
            justify-content: center;
            max-width: 95%;
        `;

        // Tool-Buttons
        const tools = [
            { mode: DRAW_MODES.ARROW, icon: 'fa-arrow-right', title: 'Pfeil' },
            { mode: DRAW_MODES.CIRCLE, icon: 'fa-circle', title: 'Kreis' },
            { mode: DRAW_MODES.RECTANGLE, icon: 'fa-square', title: 'Rechteck' },
            { mode: DRAW_MODES.LINE, icon: 'fa-minus', title: 'Linie' },
            { mode: DRAW_MODES.FREEHAND, icon: 'fa-pencil', title: 'Freihand' },
        ];

        // Tool-Gruppe
        const toolGroup = document.createElement('div');
        toolGroup.className = 'flex gap-1';
        toolGroup.innerHTML = tools.map(tool => `
            <button class="drawing-tool-btn p-2 rounded-lg transition-colors ${tool.mode === this.currentMode ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
                    data-mode="${tool.mode}" title="${tool.title}">
                <i class="fas ${tool.icon} text-sm"></i>
            </button>
        `).join('');
        this.toolbar.appendChild(toolGroup);

        // Trennlinie
        const divider1 = document.createElement('div');
        divider1.className = 'w-px h-8 bg-gray-600 mx-1';
        this.toolbar.appendChild(divider1);

        // Farb-Gruppe
        const colorGroup = document.createElement('div');
        colorGroup.className = 'flex gap-1';
        colorGroup.innerHTML = DEFAULT_COLORS.slice(0, 6).map(color => `
            <button class="drawing-color-btn w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${color === this.options.color ? 'border-white scale-110' : 'border-transparent'}"
                    data-color="${color}" style="background-color: ${color};" title="${color}">
            </button>
        `).join('');
        this.toolbar.appendChild(colorGroup);

        // Trennlinie
        const divider2 = document.createElement('div');
        divider2.className = 'w-px h-8 bg-gray-600 mx-1';
        this.toolbar.appendChild(divider2);

        // Aktions-Gruppe
        const actionGroup = document.createElement('div');
        actionGroup.className = 'flex gap-1';
        actionGroup.innerHTML = `
            <button class="drawing-action-btn p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors" data-action="undo" title="Rückgängig">
                <i class="fas fa-undo text-sm"></i>
            </button>
            <button class="drawing-action-btn p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors" data-action="redo" title="Wiederholen">
                <i class="fas fa-redo text-sm"></i>
            </button>
            <button class="drawing-action-btn p-2 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors" data-action="clear" title="Alles löschen">
                <i class="fas fa-trash text-sm"></i>
            </button>
            <button class="drawing-action-btn p-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors" data-action="save" title="Speichern">
                <i class="fas fa-save text-sm"></i>
            </button>
        `;
        this.toolbar.appendChild(actionGroup);

        this.container.appendChild(this.toolbar);

        // Event Listener für Toolbar
        this.toolbar.querySelectorAll('.drawing-tool-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setMode(btn.dataset.mode);
                this.updateToolbarUI();
            });
        });

        this.toolbar.querySelectorAll('.drawing-color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setColor(btn.dataset.color);
                this.updateToolbarUI();
            });
        });

        this.toolbar.querySelectorAll('.drawing-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'undo') this.undo();
                else if (action === 'redo') this.redo();
                else if (action === 'clear') this.clear();
                else if (action === 'save') this.save();
            });
        });
    }

    /**
     * Aktualisiert die Toolbar-UI
     */
    updateToolbarUI() {
        // Tools
        this.toolbar.querySelectorAll('.drawing-tool-btn').forEach(btn => {
            if (btn.dataset.mode === this.currentMode) {
                btn.classList.remove('bg-gray-700', 'text-gray-300');
                btn.classList.add('bg-purple-600', 'text-white');
            } else {
                btn.classList.remove('bg-purple-600', 'text-white');
                btn.classList.add('bg-gray-700', 'text-gray-300');
            }
        });

        // Farben
        this.toolbar.querySelectorAll('.drawing-color-btn').forEach(btn => {
            if (btn.dataset.color === this.options.color) {
                btn.classList.add('border-white', 'scale-110');
                btn.classList.remove('border-transparent');
            } else {
                btn.classList.remove('border-white', 'scale-110');
                btn.classList.add('border-transparent');
            }
        });
    }

    /**
     * Setup Event Listeners für Zeichnen
     */
    setupEventListeners() {
        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.handleStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleEnd(e));
        this.canvas.addEventListener('mouseleave', (e) => this.handleEnd(e));

        // Touch Events
        this.canvas.addEventListener('touchstart', (e) => this.handleStart(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleMove(e), { passive: false });
        this.canvas.addEventListener('touchend', (e) => this.handleEnd(e));
        this.canvas.addEventListener('touchcancel', (e) => this.handleEnd(e));
    }

    /**
     * Konvertiert Event-Koordinaten zu Canvas-Koordinaten
     */
    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    /**
     * Start des Zeichnens
     */
    handleStart(e) {
        if (!this.isActive) return;

        e.preventDefault();
        const coords = this.getCoordinates(e);

        this.isDrawing = true;
        this.startX = coords.x;
        this.startY = coords.y;
        this.currentPath = [{ x: coords.x, y: coords.y }];
    }

    /**
     * Bewegung beim Zeichnen
     */
    handleMove(e) {
        if (!this.isActive || !this.isDrawing) return;

        e.preventDefault();
        const coords = this.getCoordinates(e);

        // Redraw für Preview
        this.redraw();

        // Vorschau zeichnen
        this.ctx.strokeStyle = this.options.color;
        this.ctx.lineWidth = this.options.strokeWidth;
        this.ctx.fillStyle = this.options.color;

        switch (this.currentMode) {
            case DRAW_MODES.ARROW:
                this.drawArrow(this.startX, this.startY, coords.x, coords.y);
                break;
            case DRAW_MODES.CIRCLE:
                this.drawCircle(this.startX, this.startY, coords.x, coords.y);
                break;
            case DRAW_MODES.RECTANGLE:
                this.drawRectangle(this.startX, this.startY, coords.x, coords.y);
                break;
            case DRAW_MODES.LINE:
                this.drawLine(this.startX, this.startY, coords.x, coords.y);
                break;
            case DRAW_MODES.FREEHAND:
                this.currentPath.push({ x: coords.x, y: coords.y });
                this.drawFreehand(this.currentPath);
                break;
        }
    }

    /**
     * Ende des Zeichnens
     */
    handleEnd(e) {
        if (!this.isActive || !this.isDrawing) return;

        const coords = this.getCoordinates(e);
        this.isDrawing = false;

        // Shape zur History hinzufügen
        const shape = {
            mode: this.currentMode,
            color: this.options.color,
            strokeWidth: this.options.strokeWidth,
            startX: this.startX,
            startY: this.startY,
            endX: coords.x,
            endY: coords.y,
            path: this.currentMode === DRAW_MODES.FREEHAND ? [...this.currentPath] : null
        };

        // Nur speichern wenn tatsächlich gezeichnet wurde
        if (Math.abs(shape.endX - shape.startX) > 2 || Math.abs(shape.endY - shape.startY) > 2 ||
            (shape.path && shape.path.length > 2)) {
            this.addToHistory(shape);
        }

        this.currentPath = [];
        this.redraw();
    }

    /**
     * Zeichnet einen Pfeil
     */
    drawArrow(fromX, fromY, toX, toY) {
        const headLength = 15;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.stroke();

        // Pfeilspitze
        this.ctx.beginPath();
        this.ctx.moveTo(toX, toY);
        this.ctx.lineTo(
            toX - headLength * Math.cos(angle - Math.PI / 6),
            toY - headLength * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.lineTo(
            toX - headLength * Math.cos(angle + Math.PI / 6),
            toY - headLength * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.closePath();
        this.ctx.fill();
    }

    /**
     * Zeichnet einen Kreis/Ellipse
     */
    drawCircle(startX, startY, endX, endY) {
        const radiusX = Math.abs(endX - startX) / 2;
        const radiusY = Math.abs(endY - startY) / 2;
        const centerX = Math.min(startX, endX) + radiusX;
        const centerY = Math.min(startY, endY) + radiusY;

        this.ctx.beginPath();
        this.ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        this.ctx.stroke();
    }

    /**
     * Zeichnet ein Rechteck
     */
    drawRectangle(startX, startY, endX, endY) {
        const width = endX - startX;
        const height = endY - startY;

        this.ctx.beginPath();
        this.ctx.strokeRect(startX, startY, width, height);
    }

    /**
     * Zeichnet eine Linie
     */
    drawLine(startX, startY, endX, endY) {
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
    }

    /**
     * Zeichnet Freihand
     */
    drawFreehand(path) {
        if (path.length < 2) return;

        this.ctx.beginPath();
        this.ctx.moveTo(path[0].x, path[0].y);

        for (let i = 1; i < path.length; i++) {
            this.ctx.lineTo(path[i].x, path[i].y);
        }
        this.ctx.stroke();
    }

    /**
     * Zeichnet ein Shape aus der History
     */
    drawShape(shape) {
        this.ctx.strokeStyle = shape.color;
        this.ctx.lineWidth = shape.strokeWidth;
        this.ctx.fillStyle = shape.color;

        switch (shape.mode) {
            case DRAW_MODES.ARROW:
                this.drawArrow(shape.startX, shape.startY, shape.endX, shape.endY);
                break;
            case DRAW_MODES.CIRCLE:
                this.drawCircle(shape.startX, shape.startY, shape.endX, shape.endY);
                break;
            case DRAW_MODES.RECTANGLE:
                this.drawRectangle(shape.startX, shape.startY, shape.endX, shape.endY);
                break;
            case DRAW_MODES.LINE:
                this.drawLine(shape.startX, shape.startY, shape.endX, shape.endY);
                break;
            case DRAW_MODES.FREEHAND:
                if (shape.path) this.drawFreehand(shape.path);
                break;
        }
    }

    /**
     * Neuzeichnen aller Shapes
     */
    redraw() {
        const rect = this.video.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);

        // Alle Shapes bis zum aktuellen Index zeichnen
        for (let i = 0; i <= this.historyIndex; i++) {
            this.drawShape(this.history[i]);
        }
    }

    /**
     * Fügt Shape zur History hinzu
     */
    addToHistory(shape) {
        // Alles nach dem aktuellen Index entfernen (für Redo)
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(shape);
        this.historyIndex = this.history.length - 1;
    }

    /**
     * Speichert initialen State
     */
    saveState() {
        // Initial state ist leer
    }

    /**
     * Setzt den Zeichenmodus
     */
    setMode(mode) {
        this.currentMode = mode;
    }

    /**
     * Setzt die Farbe
     */
    setColor(color) {
        this.options.color = color;
    }

    /**
     * Setzt die Strichstärke
     */
    setStrokeWidth(width) {
        this.options.strokeWidth = width;
    }

    /**
     * Rückgängig
     */
    undo() {
        if (this.historyIndex >= 0) {
            this.historyIndex--;
            this.redraw();
        }
    }

    /**
     * Wiederholen
     */
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.redraw();
        }
    }

    /**
     * Alles löschen
     */
    clear() {
        this.history = [];
        this.historyIndex = -1;
        this.redraw();
    }

    /**
     * Aktiviert das Drawing Tool
     */
    activate() {
        this.isActive = true;
        this.canvas.style.pointerEvents = 'auto';
        this.toolbar.style.display = 'flex';
        this.video.pause();
        this.resizeCanvas();
    }

    /**
     * Deaktiviert das Drawing Tool
     */
    deactivate() {
        this.isActive = false;
        this.canvas.style.pointerEvents = 'none';
        this.toolbar.style.display = 'none';
    }

    /**
     * Toggle Drawing Tool
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
     * Speichert das annotierte Bild
     */
    async save() {
        // Video-Frame + Zeichnungen kombinieren
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        const rect = this.video.getBoundingClientRect();
        tempCanvas.width = this.video.videoWidth || rect.width;
        tempCanvas.height = this.video.videoHeight || rect.height;

        // Video-Frame zeichnen
        tempCtx.drawImage(this.video, 0, 0, tempCanvas.width, tempCanvas.height);

        // Skalierungsfaktoren für Zeichnungen
        const scaleX = tempCanvas.width / rect.width;
        const scaleY = tempCanvas.height / rect.height;

        // Zeichnungen mit Skalierung übertragen
        tempCtx.scale(scaleX, scaleY);
        for (let i = 0; i <= this.historyIndex; i++) {
            const shape = this.history[i];
            tempCtx.strokeStyle = shape.color;
            tempCtx.lineWidth = shape.strokeWidth;
            tempCtx.fillStyle = shape.color;
            tempCtx.lineCap = 'round';
            tempCtx.lineJoin = 'round';

            switch (shape.mode) {
                case DRAW_MODES.ARROW:
                    this.drawArrowOnCtx(tempCtx, shape.startX, shape.startY, shape.endX, shape.endY);
                    break;
                case DRAW_MODES.CIRCLE:
                    this.drawCircleOnCtx(tempCtx, shape.startX, shape.startY, shape.endX, shape.endY);
                    break;
                case DRAW_MODES.RECTANGLE:
                    this.drawRectangleOnCtx(tempCtx, shape.startX, shape.startY, shape.endX, shape.endY);
                    break;
                case DRAW_MODES.LINE:
                    this.drawLineOnCtx(tempCtx, shape.startX, shape.startY, shape.endX, shape.endY);
                    break;
                case DRAW_MODES.FREEHAND:
                    if (shape.path) this.drawFreehandOnCtx(tempCtx, shape.path);
                    break;
            }
        }

        // Als Blob exportieren
        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        const timestamp = this.video.currentTime;

        // Callback aufrufen
        if (this.options.onSave) {
            this.options.onSave({
                blob,
                timestamp,
                dataUrl: tempCanvas.toDataURL('image/png'),
                shapes: this.history.slice(0, this.historyIndex + 1)
            });
        }

        return { blob, timestamp, dataUrl: tempCanvas.toDataURL('image/png') };
    }

    // Helper-Methoden für externen Context
    drawArrowOnCtx(ctx, fromX, fromY, toX, toY) {
        const headLength = 15;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    drawCircleOnCtx(ctx, startX, startY, endX, endY) {
        const radiusX = Math.abs(endX - startX) / 2;
        const radiusY = Math.abs(endY - startY) / 2;
        const centerX = Math.min(startX, endX) + radiusX;
        const centerY = Math.min(startY, endY) + radiusY;

        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }

    drawRectangleOnCtx(ctx, startX, startY, endX, endY) {
        ctx.beginPath();
        ctx.strokeRect(startX, startY, endX - startX, endY - startY);
    }

    drawLineOnCtx(ctx, startX, startY, endX, endY) {
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
    }

    drawFreehandOnCtx(ctx, path) {
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x, path[i].y);
        }
        ctx.stroke();
    }

    /**
     * Entfernt das Drawing Tool
     */
    destroy() {
        if (this.container && this.container.parentElement) {
            this.container.parentElement.removeChild(this.container);
        }
        window.removeEventListener('resize', () => this.resizeCanvas());
    }
}

/**
 * Erstellt einen "Zeichnen"-Button für ein Video-Element
 */
export function createDrawingButton(videoElement, options = {}) {
    let drawingTool = null;

    const button = document.createElement('button');
    button.className = 'drawing-toggle-btn absolute top-2 right-2 p-2 bg-black bg-opacity-60 rounded-lg text-white hover:bg-opacity-80 transition-all z-20';
    button.innerHTML = '<i class="fas fa-pen"></i>';
    button.title = 'Zeichnen';

    button.addEventListener('click', (e) => {
        e.stopPropagation();

        if (!drawingTool) {
            drawingTool = new VideoDrawingTool(videoElement, options);
        }

        const isActive = drawingTool.toggle();
        button.innerHTML = isActive
            ? '<i class="fas fa-times"></i>'
            : '<i class="fas fa-pen"></i>';
        button.title = isActive ? 'Zeichnen beenden' : 'Zeichnen';

        if (isActive) {
            button.classList.add('bg-purple-600');
        } else {
            button.classList.remove('bg-purple-600');
        }
    });

    // Button zum Video-Container hinzufügen
    videoElement.parentElement.style.position = 'relative';
    videoElement.parentElement.appendChild(button);

    return {
        button,
        getDrawingTool: () => drawingTool,
        destroy: () => {
            if (drawingTool) drawingTool.destroy();
            button.remove();
        }
    };
}

// Export für globalen Zugriff
window.VideoDrawingTool = VideoDrawingTool;
window.createDrawingButton = createDrawingButton;

export { VideoDrawingTool, DRAW_MODES, DEFAULT_COLORS };
export default VideoDrawingTool;
