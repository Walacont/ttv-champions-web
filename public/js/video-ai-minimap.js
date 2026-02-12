/**
 * Video AI Minimap - Homography-based Table Minimap Overlay
 * Shows ball landing positions on a top-down view of the table.
 * Uses the 4-corner table calibration for perspective transform.
 *
 * No external dependencies - pure JavaScript + Canvas.
 */

/**
 * TableMinimap - Renders a minimap overlay showing ball positions on the table.
 */
class TableMinimap {
    /**
     * @param {HTMLElement} containerElement - Element to render the minimap in
     * @param {Object} [options]
     * @param {number} [options.width=200] - Minimap width in pixels
     * @param {number} [options.height=110] - Minimap height in pixels
     * @param {string} [options.position='top-right'] - Position in container
     * @param {string} [options.tableColor='#1a4d2e'] - Table color
     */
    constructor(containerElement, options = {}) {
        this.container = containerElement;
        this.width = options.width || 200;
        this.height = options.height || 110;
        this.position = options.position || 'top-right';
        this.tableColor = options.tableColor || '#1a4d2e';

        // Real table dimensions in cm
        this.tableRealWidth = 274;   // cm
        this.tableRealHeight = 152.5; // cm

        // Calibration corners (normalized 0-1 in video space)
        this.corners = null;

        // Homography matrix (3x3)
        this.H = null;

        // Ball positions to display
        this.ballPositions = [];  // [{x, y, time, type}] in table coordinates (cm)
        this.maxBallHistory = 30;

        // Speed display
        this.currentSpeed = null;

        this.canvas = null;
        this.ctx = null;

        this.init();
    }

    /**
     * Creates the minimap canvas.
     */
    init() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'video-ai-minimap';
        this.wrapper.style.cssText = `
            position: absolute;
            ${this.position.includes('top') ? 'top: 10px' : 'bottom: 10px'};
            ${this.position.includes('right') ? 'right: 10px' : 'left: 10px'};
            width: ${this.width}px;
            height: ${this.height + 24}px;
            z-index: 20;
            pointer-events: none;
            opacity: 0.9;
        `;

        // Title bar
        this.titleBar = document.createElement('div');
        this.titleBar.style.cssText = `
            background: rgba(0,0,0,0.8);
            color: #fff;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 6px 6px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        this.titleBar.innerHTML = '<span>Tisch-Ansicht</span><span id="minimap-speed" style="color:#00ff88">--</span>';
        this.wrapper.appendChild(this.titleBar);

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.cssText = `
            border-radius: 0 0 6px 6px;
            border: 1px solid rgba(255,255,255,0.3);
            border-top: none;
        `;
        this.wrapper.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        this.container.style.position = 'relative';
        this.container.appendChild(this.wrapper);

        this.render();
    }

    /**
     * Sets the table calibration corners and computes the homography matrix.
     * @param {Array} corners - [{x, y}, {x, y}, {x, y}, {x, y}] normalized 0-1
     *   Order: top-left, top-right, bottom-right, bottom-left
     */
    setCalibration(corners) {
        if (!corners || corners.length !== 4) return;
        this.corners = corners;
        this.H = this.computeHomography(corners);
        this.render();
    }

    /**
     * Computes a 3x3 homography matrix from 4 source points to table coordinates.
     * Maps camera pixels (normalized 0-1) to table coordinates (0-274cm, 0-152.5cm).
     *
     * Uses Direct Linear Transform (DLT) algorithm.
     * @param {Array} srcPoints - 4 source points [{x, y}] normalized 0-1
     * @returns {Array} 3x3 matrix as flat array [h00, h01, h02, h10, h11, h12, h20, h21, h22]
     */
    computeHomography(srcPoints) {
        // Destination: table corners in cm
        const dst = [
            { x: 0, y: 0 },                                    // top-left
            { x: this.tableRealWidth, y: 0 },                   // top-right
            { x: this.tableRealWidth, y: this.tableRealHeight }, // bottom-right
            { x: 0, y: this.tableRealHeight }                   // bottom-left
        ];

        // Build the 8x8 matrix for DLT
        const A = [];
        for (let i = 0; i < 4; i++) {
            const sx = srcPoints[i].x;
            const sy = srcPoints[i].y;
            const dx = dst[i].x;
            const dy = dst[i].y;

            A.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
            A.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
        }

        // Solve using simplified Gaussian elimination for 8x9 augmented matrix
        // We set h22 = 1 and solve for the other 8 unknowns
        const M = [];
        for (let i = 0; i < 8; i++) {
            M.push([]);
            for (let j = 0; j < 8; j++) {
                M[i].push(A[i][j]);
            }
            M[i].push(-A[i][8]); // Augmented column (move h22 term to right side)
        }

        // Gaussian elimination with partial pivoting
        for (let col = 0; col < 8; col++) {
            // Find pivot
            let maxVal = Math.abs(M[col][col]);
            let maxRow = col;
            for (let row = col + 1; row < 8; row++) {
                if (Math.abs(M[row][col]) > maxVal) {
                    maxVal = Math.abs(M[row][col]);
                    maxRow = row;
                }
            }

            // Swap rows
            if (maxRow !== col) {
                const tmp = M[col];
                M[col] = M[maxRow];
                M[maxRow] = tmp;
            }

            // Eliminate
            const pivot = M[col][col];
            if (Math.abs(pivot) < 1e-10) return null; // Singular

            for (let j = col; j <= 8; j++) {
                M[col][j] /= pivot;
            }

            for (let row = 0; row < 8; row++) {
                if (row === col) continue;
                const factor = M[row][col];
                for (let j = col; j <= 8; j++) {
                    M[row][j] -= factor * M[col][j];
                }
            }
        }

        // Extract solution
        const h = [];
        for (let i = 0; i < 8; i++) {
            h.push(M[i][8]);
        }
        h.push(1); // h22 = 1

        return h;
    }

    /**
     * Transforms a point from camera space (normalized 0-1) to table space (cm).
     * @param {number} x - Normalized x (0-1)
     * @param {number} y - Normalized y (0-1)
     * @returns {Object|null} - {x, y} in table coordinates (cm) or null if outside
     */
    cameraToTable(x, y) {
        if (!this.H) return null;

        const h = this.H;
        const w = h[6] * x + h[7] * y + h[8];
        if (Math.abs(w) < 1e-10) return null;

        const tx = (h[0] * x + h[1] * y + h[2]) / w;
        const ty = (h[3] * x + h[4] * y + h[5]) / w;

        return { x: tx, y: ty };
    }

    /**
     * Adds a ball position from camera coordinates.
     * @param {number} camX - Ball x in camera space (0-1)
     * @param {number} camY - Ball y in camera space (0-1)
     * @param {number} time - Timestamp in seconds
     * @param {string} [type='track'] - 'track', 'bounce', or 'landing'
     */
    addBallPosition(camX, camY, time, type = 'track') {
        const tablePos = this.cameraToTable(camX, camY);
        if (!tablePos) return;

        // Only add if within reasonable table bounds (with some margin)
        if (tablePos.x < -30 || tablePos.x > this.tableRealWidth + 30 ||
            tablePos.y < -30 || tablePos.y > this.tableRealHeight + 30) {
            return;
        }

        this.ballPositions.push({
            x: tablePos.x,
            y: tablePos.y,
            time,
            type
        });

        // Trim old positions
        if (this.ballPositions.length > this.maxBallHistory) {
            this.ballPositions.shift();
        }

        this.render();
    }

    /**
     * Sets the current ball speed to display.
     * @param {number|null} speedMs - Speed in m/s or null to hide
     */
    setSpeed(speedMs) {
        this.currentSpeed = speedMs;
        const el = this.titleBar.querySelector('#minimap-speed');
        if (el) {
            el.textContent = speedMs !== null ? `${speedMs.toFixed(1)} m/s` : '--';
        }
    }

    /**
     * Clears all ball positions and re-renders.
     */
    clearBalls() {
        this.ballPositions = [];
        this.currentSpeed = null;
        this.render();
    }

    /**
     * Renders the minimap.
     */
    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, w, h);

        // Table dimensions in minimap pixels
        const padding = 8;
        const tableW = w - padding * 2;
        const tableH = h - padding * 2;
        const tableX = padding;
        const tableY = padding;

        // Draw table
        ctx.fillStyle = this.tableColor;
        ctx.fillRect(tableX, tableY, tableW, tableH);

        // Table border (white lines)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tableX, tableY, tableW, tableH);

        // Center line (net)
        ctx.beginPath();
        ctx.moveTo(tableX + tableW / 2, tableY);
        ctx.lineTo(tableX + tableW / 2, tableY + tableH);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Net posts (small marks on the sides)
        ctx.fillStyle = '#888';
        ctx.fillRect(tableX + tableW / 2 - 1, tableY - 3, 2, 3);
        ctx.fillRect(tableX + tableW / 2 - 1, tableY + tableH, 2, 3);

        // Center mark on each half
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(tableX + tableW / 4, tableY);
        ctx.lineTo(tableX + tableW / 4, tableY + tableH);
        ctx.moveTo(tableX + 3 * tableW / 4, tableY);
        ctx.lineTo(tableX + 3 * tableW / 4, tableY + tableH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('VH', tableX + tableW * 0.15, tableY + tableH + 8);
        ctx.fillText('M', tableX + tableW * 0.35, tableY + tableH + 8);
        ctx.fillText('RH', tableX + tableW * 0.15, tableY - 2);
        ctx.fillText('M', tableX + tableW * 0.35, tableY - 2);
        ctx.textAlign = 'start';

        // Draw ball positions
        if (this.ballPositions.length > 0) {
            const scaleX = tableW / this.tableRealWidth;
            const scaleY = tableH / this.tableRealHeight;

            // Draw trajectory line
            const trackPoints = this.ballPositions.filter(p => p.type !== 'landing');
            if (trackPoints.length >= 2) {
                ctx.beginPath();
                ctx.moveTo(
                    tableX + trackPoints[0].x * scaleX,
                    tableY + trackPoints[0].y * scaleY
                );
                for (let i = 1; i < trackPoints.length; i++) {
                    ctx.lineTo(
                        tableX + trackPoints[i].x * scaleX,
                        tableY + trackPoints[i].y * scaleY
                    );
                }
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Draw each ball position
            for (let i = 0; i < this.ballPositions.length; i++) {
                const pos = this.ballPositions[i];
                const px = tableX + pos.x * scaleX;
                const py = tableY + pos.y * scaleY;

                // Skip if outside minimap
                if (px < 0 || px > w || py < 0 || py > h) continue;

                const isRecent = i >= this.ballPositions.length - 3;
                const isBounce = pos.type === 'bounce' || pos.type === 'landing';

                if (isBounce) {
                    // Bounce marker: larger, with ring
                    const radius = isRecent ? 5 : 3;

                    // Outer ring
                    ctx.beginPath();
                    ctx.arc(px, py, radius + 2, 0, Math.PI * 2);
                    ctx.strokeStyle = '#ff4444';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Inner dot
                    ctx.beginPath();
                    ctx.arc(px, py, radius, 0, Math.PI * 2);
                    ctx.fillStyle = isRecent ? '#ff4444' : 'rgba(255, 68, 68, 0.6)';
                    ctx.fill();
                } else {
                    // Track point: small dot
                    const alpha = 0.3 + 0.7 * (i / this.ballPositions.length);
                    const radius = isRecent ? 3 : 1.5;

                    ctx.beginPath();
                    ctx.arc(px, py, radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 200, 0, ${alpha})`;
                    ctx.fill();
                }
            }

            // Highlight the most recent position
            const latest = this.ballPositions[this.ballPositions.length - 1];
            const lx = tableX + latest.x * scaleX;
            const ly = tableY + latest.y * scaleY;
            if (lx >= 0 && lx <= w && ly >= 0 && ly <= h) {
                ctx.beginPath();
                ctx.arc(lx, ly, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffcc00';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // "No calibration" message
        if (!this.H) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ffcc00';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Tisch kalibrieren', w / 2, h / 2 - 6);
            ctx.font = '9px sans-serif';
            ctx.fillStyle = '#aaa';
            ctx.fillText('4 Ecken markieren', w / 2, h / 2 + 8);
            ctx.textAlign = 'start';
        }
    }

    /**
     * Shows the minimap.
     */
    show() {
        this.wrapper.style.display = 'block';
        this.render();
    }

    /**
     * Hides the minimap.
     */
    hide() {
        this.wrapper.style.display = 'none';
    }

    /**
     * Toggles visibility.
     */
    toggle() {
        if (this.wrapper.style.display === 'none') {
            this.show();
        } else {
            this.hide();
        }
    }

    /**
     * Destroys the minimap and cleans up.
     */
    destroy() {
        if (this.wrapper && this.wrapper.parentElement) {
            this.wrapper.parentElement.removeChild(this.wrapper);
        }
        this.canvas = null;
        this.ctx = null;
    }
}

// Export
window.TableMinimap = TableMinimap;

export { TableMinimap };
export default TableMinimap;
