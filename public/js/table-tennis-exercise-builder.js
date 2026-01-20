/**
 * Table Tennis Exercise Builder
 * Animates table tennis exercises with ball trajectories on a canvas
 */

// Polyfill for roundRect (for older browsers)
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radii) {
        const radius = typeof radii === 'number' ? radii : (radii && radii[0]) || 0;
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
        return this;
    };
}

// Stroke types with their display names and colors
const STROKE_TYPES = {
    A: { name: 'Aufschlag', color: '#10B981', isOffensive: true },
    T: { name: 'Topspin', color: '#10B981', isOffensive: true },
    K: { name: 'Konter', color: '#10B981', isOffensive: true },
    B: { name: 'Block', color: '#9CA3AF', isOffensive: false },
    F: { name: 'Flip', color: '#10B981', isOffensive: true },
    S: { name: 'Smash', color: '#EF4444', isOffensive: true },
    SCH: { name: 'Schupf', color: '#9CA3AF', isOffensive: false },
    U: { name: 'Unterschnitt-Abwehr', color: '#9CA3AF', isOffensive: false },
    OS: { name: 'Oberschnitt', color: '#F59E0B', isOffensive: true },
    US: { name: 'Unterschnitt', color: '#9CA3AF', isOffensive: false },
    SS: { name: 'Seitenschnitt', color: '#F59E0B', isOffensive: true }
};

// Position types
const POSITIONS = {
    VH: { name: 'Vorhand', xRatio: 0.75 },  // Right side of table (from player's view)
    RH: { name: 'Rückhand', xRatio: 0.25 }, // Left side of table
    M: { name: 'Mitte', xRatio: 0.50 }      // Middle of table
};

// Table dimensions (relative)
const TABLE = {
    aspectRatio: 1.8, // length / width
    padding: 40,
    netPosition: 0.5,  // Middle of table
    color: '#1e3a5f',
    lineColor: '#ffffff',
    lineWidth: 2
};

class TableTennisExerciseBuilder {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`Canvas with id "${canvasId}" not found`);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.steps = [];
        this.currentStepIndex = 0;
        this.isPlaying = false;
        this.animationFrame = null;
        this.ballPosition = { x: 0, y: 0 };
        this.ballTarget = { x: 0, y: 0 };
        this.animationProgress = 0;
        this.loopAnimation = true;

        // Calculate table dimensions
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Initial draw
        this.drawTable();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const maxHeight = 500;

        // Calculate dimensions maintaining aspect ratio
        let width = containerWidth;
        let height = width / TABLE.aspectRatio;

        if (height > maxHeight) {
            height = maxHeight;
            width = height * TABLE.aspectRatio;
        }

        this.canvas.width = width;
        this.canvas.height = height;

        // Calculate table bounds
        this.tableX = TABLE.padding;
        this.tableY = TABLE.padding;
        this.tableWidth = width - TABLE.padding * 2;
        this.tableHeight = height - TABLE.padding * 2;

        // Redraw
        this.drawTable();
    }

    drawTable() {
        const ctx = this.ctx;
        const { tableX, tableY, tableWidth, tableHeight } = this;

        // Clear canvas with black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw table surface
        ctx.fillStyle = TABLE.color;
        ctx.fillRect(tableX, tableY, tableWidth, tableHeight);

        // Draw outer border
        ctx.strokeStyle = TABLE.lineColor;
        ctx.lineWidth = TABLE.lineWidth * 2;
        ctx.strokeRect(tableX, tableY, tableWidth, tableHeight);

        // Draw center line (vertical)
        ctx.beginPath();
        ctx.strokeStyle = TABLE.lineColor;
        ctx.lineWidth = TABLE.lineWidth;
        ctx.moveTo(tableX + tableWidth / 2, tableY);
        ctx.lineTo(tableX + tableWidth / 2, tableY + tableHeight);
        ctx.stroke();

        // Draw net line (horizontal at middle)
        ctx.beginPath();
        ctx.strokeStyle = TABLE.lineColor;
        ctx.lineWidth = TABLE.lineWidth;
        const netY = tableY + tableHeight * TABLE.netPosition;
        ctx.moveTo(tableX, netY);
        ctx.lineTo(tableX + tableWidth, netY);
        ctx.stroke();
    }

    getPositionCoords(position, isPlayerA) {
        const posData = POSITIONS[position] || POSITIONS.M;
        const x = this.tableX + this.tableWidth * posData.xRatio;

        // Player A is at bottom, Player B is at top
        let y;
        if (isPlayerA) {
            y = this.tableY + this.tableHeight * 0.8; // Bottom area
        } else {
            y = this.tableY + this.tableHeight * 0.2; // Top area
        }

        return { x, y };
    }

    getTargetZoneCoords(position, isPlayerA) {
        const posData = POSITIONS[position] || POSITIONS.M;
        const x = this.tableX + this.tableWidth * posData.xRatio;

        // Target zone is on opponent's side
        let y;
        if (isPlayerA) {
            y = this.tableY + this.tableHeight * 0.25; // Top area (opponent's side)
        } else {
            y = this.tableY + this.tableHeight * 0.75; // Bottom area (opponent's side)
        }

        return { x, y };
    }

    addStep(player, strokeType, side, fromPosition, toPosition, isShort = false) {
        this.steps.push({
            player,       // 'A' or 'B'
            strokeType,   // 'T', 'B', 'SCH', etc.
            side,         // 'VH' or 'RH'
            fromPosition, // 'VH', 'RH', 'M'
            toPosition,   // 'VH', 'RH', 'M'
            isShort       // true for short balls
        });
    }

    clearSteps() {
        this.steps = [];
        this.currentStepIndex = 0;
        this.stopAnimation();
        this.drawTable();
    }

    setSteps(steps) {
        this.steps = steps;
        this.currentStepIndex = 0;
    }

    drawStep(step, progress = 1) {
        const ctx = this.ctx;
        const isPlayerA = step.player === 'A';
        const strokeData = STROKE_TYPES[step.strokeType] || STROKE_TYPES.T;

        // Get positions
        const startPos = this.getPositionCoords(step.fromPosition, isPlayerA);
        const endPos = this.getTargetZoneCoords(step.toPosition, isPlayerA);

        // Adjust end position for short balls
        let adjustedEndPos = { ...endPos };
        if (step.isShort) {
            // Short balls land closer to the net
            const netY = this.tableY + this.tableHeight * TABLE.netPosition;
            if (isPlayerA) {
                adjustedEndPos.y = netY - this.tableHeight * 0.1;
            } else {
                adjustedEndPos.y = netY + this.tableHeight * 0.1;
            }
        }

        // Draw target zone (dashed rectangle)
        const zoneWidth = 80;
        const zoneHeight = 50;
        ctx.save();
        ctx.strokeStyle = strokeData.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(
            adjustedEndPos.x - zoneWidth / 2,
            adjustedEndPos.y - zoneHeight / 2,
            zoneWidth,
            zoneHeight
        );

        // Fill target zone with diagonal stripes
        ctx.fillStyle = strokeData.color + '30';
        ctx.fillRect(
            adjustedEndPos.x - zoneWidth / 2,
            adjustedEndPos.y - zoneHeight / 2,
            zoneWidth,
            zoneHeight
        );
        ctx.restore();

        // Calculate current ball position based on progress
        const currentX = startPos.x + (adjustedEndPos.x - startPos.x) * progress;
        const currentY = startPos.y + (adjustedEndPos.y - startPos.y) * progress;

        // Draw trajectory line
        ctx.beginPath();
        ctx.strokeStyle = strokeData.color;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
        ctx.moveTo(startPos.x, startPos.y);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();

        // Draw arrowhead if animation complete
        if (progress >= 1) {
            this.drawArrowhead(ctx, startPos.x, startPos.y, adjustedEndPos.x, adjustedEndPos.y, strokeData.color);
        }

        // Draw ball
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(currentX, currentY, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw stroke label
        const labelText = `${step.side} ${strokeData.name}`;
        const labelY = isPlayerA ? startPos.y + 40 : startPos.y - 30;

        // Label background
        ctx.font = 'bold 14px Inter, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const labelPadding = 12;
        const labelWidth = textMetrics.width + labelPadding * 2;
        const labelHeight = 28;

        ctx.fillStyle = strokeData.color;
        ctx.beginPath();
        ctx.roundRect(
            startPos.x - labelWidth / 2,
            labelY - labelHeight / 2,
            labelWidth,
            labelHeight,
            14
        );
        ctx.fill();

        // Label text
        ctx.fillStyle = strokeData.isOffensive ? '#000000' : '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, startPos.x, labelY);
    }

    drawArrowhead(ctx, fromX, fromY, toX, toY, color) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const headLength = 12;

        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle - Math.PI / 6),
            toY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            toX - headLength * Math.cos(angle + Math.PI / 6),
            toY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    animate() {
        if (!this.isPlaying || this.steps.length === 0) return;

        const step = this.steps[this.currentStepIndex];

        // Clear and redraw table
        this.drawTable();

        // Draw current step with animation progress
        this.drawStep(step, this.animationProgress);

        // Update progress
        this.animationProgress += 0.02;

        if (this.animationProgress >= 1) {
            // Step animation complete, show full step for a moment
            this.animationProgress = 1;

            setTimeout(() => {
                if (!this.isPlaying) return;

                // Move to next step
                this.currentStepIndex++;
                this.animationProgress = 0;

                if (this.currentStepIndex >= this.steps.length) {
                    if (this.loopAnimation) {
                        this.currentStepIndex = 0;
                    } else {
                        this.isPlaying = false;
                        if (this.onAnimationComplete) {
                            this.onAnimationComplete();
                        }
                        return;
                    }
                }

                this.animationFrame = requestAnimationFrame(() => this.animate());
            }, 1500); // Pause between steps
        } else {
            this.animationFrame = requestAnimationFrame(() => this.animate());
        }
    }

    play() {
        if (this.steps.length === 0) return;
        this.isPlaying = true;
        this.animate();
    }

    pause() {
        this.isPlaying = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    stopAnimation() {
        this.isPlaying = false;
        this.currentStepIndex = 0;
        this.animationProgress = 0;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }

    reset() {
        this.stopAnimation();
        this.drawTable();
    }

    showStepStatic(stepIndex) {
        if (stepIndex >= 0 && stepIndex < this.steps.length) {
            this.drawTable();
            this.drawStep(this.steps[stepIndex], 1);
        }
    }

    showAllSteps() {
        this.drawTable();
        this.steps.forEach((step, index) => {
            this.drawStep(step, 1);
        });
    }

    // Export exercise data
    exportExercise() {
        return {
            steps: this.steps.map(step => ({
                player: step.player,
                strokeType: step.strokeType,
                side: step.side,
                fromPosition: step.fromPosition,
                toPosition: step.toPosition,
                isShort: step.isShort
            }))
        };
    }

    // Import exercise data
    importExercise(data) {
        if (data && data.steps) {
            this.steps = data.steps;
            this.currentStepIndex = 0;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TableTennisExerciseBuilder, STROKE_TYPES, POSITIONS };
}

// Make available globally
window.TableTennisExerciseBuilder = TableTennisExerciseBuilder;
window.TT_STROKE_TYPES = STROKE_TYPES;
window.TT_POSITIONS = POSITIONS;
