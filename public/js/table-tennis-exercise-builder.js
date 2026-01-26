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
// SC Champions purple: #8B5CF6, Gray: #9CA3AF
const STROKE_TYPES = {
    A: { name: 'Aufschlag', color: '#8B5CF6', isOffensive: true },
    T: { name: 'Topspin', color: '#8B5CF6', isOffensive: true },
    K: { name: 'Konter', color: '#8B5CF6', isOffensive: true },
    B: { name: 'Block', color: '#9CA3AF', isOffensive: false },
    F: { name: 'Flip', color: '#8B5CF6', isOffensive: true },
    S: { name: 'Smash', color: '#EF4444', isOffensive: true },
    SCH: { name: 'Schupf', color: '#9CA3AF', isOffensive: false },
    U: { name: 'Unterschnitt-Abwehr', color: '#9CA3AF', isOffensive: false },
    OS: { name: 'Oberschnitt', color: '#8B5CF6', isOffensive: true },
    US: { name: 'Unterschnitt', color: '#9CA3AF', isOffensive: false },
    SS: { name: 'Seitenschnitt', color: '#8B5CF6', isOffensive: true }
};

// Position types
const POSITIONS = {
    VH: { name: 'Vorhand', xRatio: 0.75 },  // Right side of table (from player's view)
    RH: { name: 'Rückhand', xRatio: 0.25 }, // Left side of table
    M: { name: 'Mitte', xRatio: 0.50 },     // Middle of table
    FREI: { name: 'Frei', xRatio: 0.50, isFree: true }  // Free placement - anywhere
};

// Table dimensions (relative)
// Real table: 2.74m long x 1.525m wide = aspect ratio ~0.56 (width/height)
// Table is viewed from player's perspective: longer dimension is vertical
const TABLE = {
    aspectRatio: 0.56, // width / height (table is taller than wide)
    padding: 20,       // Reduced padding for compact design
    netPosition: 0.5,  // Middle of table
    color: '#0d4f3c',  // Modern green table color
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

        // Handedness for each player (false = right-handed, true = left-handed)
        this.playerALeftHanded = false;
        this.playerBLeftHanded = false;

        // Calculate table dimensions
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Initial draw
        this.drawTable();
    }

    // Set handedness from handedness code (R-R, L-L, R-L, L-R)
    // First letter = Player A, Second letter = Player B
    setHandedness(handednessCode) {
        if (!handednessCode || handednessCode.length < 3) {
            this.playerALeftHanded = false;
            this.playerBLeftHanded = false;
            return;
        }
        // Parse: "R-R", "L-L", "R-L", "L-R"
        const parts = handednessCode.split('-');
        this.playerALeftHanded = parts[0] === 'L';
        this.playerBLeftHanded = parts[1] === 'L';

        // Redraw if we have steps
        if (this.steps.length > 0) {
            this.showAllSteps();
        }
    }

    resizeCanvas() {
        // Fixed dimensions for consistent display
        // Table is taller than wide (aspect ratio 0.56)
        const targetHeight = 380;
        const targetWidth = Math.round(targetHeight * TABLE.aspectRatio); // ~213px

        let width = targetWidth;
        let height = targetHeight;

        // High-DPI support for crisp rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        this.ctx.scale(dpr, dpr);
        this.dpr = dpr;

        // Store logical dimensions (before scaling)
        this.logicalWidth = width;
        this.logicalHeight = height;

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
        const cornerRadius = 6;

        // Reset transform and apply DPI scaling fresh each frame
        const dpr = this.dpr || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Clear canvas with dark background (use logical dimensions)
        const width = this.logicalWidth || this.canvas.width;
        const height = this.logicalHeight || this.canvas.height;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        // Draw table shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 15;
        ctx.shadowOffsetX = 4;
        ctx.shadowOffsetY = 4;
        ctx.fillStyle = TABLE.color;
        ctx.beginPath();
        ctx.roundRect(tableX, tableY, tableWidth, tableHeight, cornerRadius);
        ctx.fill();
        ctx.restore();

        // Draw table surface with subtle gradient
        const gradient = ctx.createLinearGradient(tableX, tableY, tableX + tableWidth, tableY + tableHeight);
        gradient.addColorStop(0, '#0d5c47');
        gradient.addColorStop(0.5, TABLE.color);
        gradient.addColorStop(1, '#0a3d2e');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(tableX, tableY, tableWidth, tableHeight, cornerRadius);
        ctx.fill();

        // Draw outer border
        ctx.strokeStyle = TABLE.lineColor;
        ctx.lineWidth = TABLE.lineWidth * 1.5;
        ctx.beginPath();
        ctx.roundRect(tableX, tableY, tableWidth, tableHeight, cornerRadius);
        ctx.stroke();

        // Draw center line (vertical)
        ctx.beginPath();
        ctx.strokeStyle = TABLE.lineColor;
        ctx.lineWidth = TABLE.lineWidth;
        ctx.moveTo(tableX + tableWidth / 2, tableY);
        ctx.lineTo(tableX + tableWidth / 2, tableY + tableHeight);
        ctx.stroke();

        // Draw net line (horizontal at middle) with slight glow
        ctx.beginPath();
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = TABLE.lineWidth + 1;
        const netY = tableY + tableHeight * TABLE.netPosition;
        ctx.moveTo(tableX, netY);
        ctx.lineTo(tableX + tableWidth, netY);
        ctx.stroke();
    }

    getPositionCoords(position, isPlayerA, previousStepWasShort = false) {
        const posData = POSITIONS[position] || POSITIONS.M;

        // Get base xRatio - for right-handers: VH=right(0.75), RH=left(0.25)
        let baseXRatio = posData.xRatio;

        // For left-handed players, flip VH and RH (VH is on left side for left-handers)
        const isLeftHanded = isPlayerA ? this.playerALeftHanded : this.playerBLeftHanded;
        if (isLeftHanded && position !== 'M' && position !== 'FREI') {
            baseXRatio = 1 - baseXRatio; // Flip: VH becomes 0.25, RH becomes 0.75
        }

        // Mirror x-position for Player B (opponent stands on opposite side from our view)
        const xRatio = isPlayerA ? baseXRatio : (1 - baseXRatio);
        const x = this.tableX + this.tableWidth * xRatio;

        // Player A is at bottom, Player B is at top
        // If previous shot was short, player must be near the table to return it
        let y;
        if (isPlayerA) {
            if (previousStepWasShort) {
                y = this.tableY + this.tableHeight * 0.60; // Near the table (to reach short ball)
            } else {
                y = this.tableY + this.tableHeight * 0.85; // Bottom area (near edge)
            }
        } else {
            if (previousStepWasShort) {
                y = this.tableY + this.tableHeight * 0.40; // Near the table (to reach short ball)
            } else {
                y = this.tableY + this.tableHeight * 0.15; // Top area (near edge)
            }
        }

        return { x, y };
    }

    getTargetZoneCoords(position, isPlayerA) {
        const posData = POSITIONS[position] || POSITIONS.M;

        // Get base xRatio - target is on opponent's side
        let baseXRatio = posData.xRatio;

        // The target position refers to the opponent's VH/RH
        // If the opponent is left-handed, their VH is on the left side
        const opponentIsLeftHanded = isPlayerA ? this.playerBLeftHanded : this.playerALeftHanded;
        if (opponentIsLeftHanded && position !== 'M' && position !== 'FREI') {
            baseXRatio = 1 - baseXRatio; // Flip for left-handed opponent
        }

        // From our view: Player B is at top, so their positions are mirrored
        const xRatio = isPlayerA ? (1 - baseXRatio) : baseXRatio;
        const x = this.tableX + this.tableWidth * xRatio;

        // Target zone is on opponent's side of the table (deep, near baseline)
        let y;
        if (isPlayerA) {
            y = this.tableY + this.tableHeight * 0.08; // Deep in opponent's side (near top edge/baseline)
        } else {
            y = this.tableY + this.tableHeight * 0.92; // Deep in opponent's side (near bottom edge/baseline)
        }

        return { x, y };
    }

    addStep(player, strokeType, side, fromPosition, toPosition, isShort = false, variants = undefined, repetitions = undefined, playerDecides = false) {
        this.steps.push({
            player,       // 'A' or 'B'
            strokeType,   // 'T', 'B', 'SCH', etc.
            side,         // 'VH' or 'RH'
            fromPosition, // 'VH', 'RH', 'M'
            toPosition,   // 'VH', 'RH', 'M', 'FREI'
            isShort,      // true for short balls
            variants,     // Array of alternative actions: [{condition, side, strokeType, toPosition}]
            repetitions,  // { min: number, max: number } for variable repetitions (e.g., 3-8x)
            playerDecides // true if the player decides when/where to execute (not random/system)
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

    drawStep(step, progress = 1, previousStep = null) {
        const ctx = this.ctx;
        const isPlayerA = step.player === 'A';
        const strokeData = STROKE_TYPES[step.strokeType] || STROKE_TYPES.T;
        const toPositionData = POSITIONS[step.toPosition] || POSITIONS.M;

        // Check if previous step was a short ball that landed on this player's side
        // If so, this player must start from near the table
        const previousStepWasShort = previousStep && previousStep.isShort && previousStep.player !== step.player;

        // Get positions
        const startPos = this.getPositionCoords(step.fromPosition, isPlayerA, previousStepWasShort);

        // Check if target is "FREI" (free placement)
        const isFreeTarget = toPositionData.isFree;

        let adjustedEndPos;
        if (isFreeTarget) {
            // For "frei", target the center of opponent's side
            adjustedEndPos = {
                x: this.tableX + this.tableWidth / 2,
                y: isPlayerA ? this.tableY + this.tableHeight * 0.25 : this.tableY + this.tableHeight * 0.75
            };
        } else {
            const endPos = this.getTargetZoneCoords(step.toPosition, isPlayerA);
            adjustedEndPos = { ...endPos };

            // Adjust end position for short balls
            if (step.isShort) {
                // Short balls land closer to the net
                const netY = this.tableY + this.tableHeight * TABLE.netPosition;
                if (isPlayerA) {
                    adjustedEndPos.y = netY - this.tableHeight * 0.1;
                } else {
                    adjustedEndPos.y = netY + this.tableHeight * 0.1;
                }
            }
        }

        // Draw target zone or "frei" indicator (three lines)
        if (isFreeTarget) {
            // Draw three lines to VH, MITTE, and RH simultaneously
            this.drawFreeZone(ctx, isPlayerA, strokeData.color, startPos, progress);
            // Skip drawing single trajectory line and ball for free target
        } else {
            // Draw target zone (dashed rectangle) - scaled for compact table
            const zoneWidth = 50;
            const zoneHeight = 30;
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

            // Draw ball - smaller for compact design
            ctx.beginPath();
            ctx.fillStyle = '#ffffff';
            ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw stroke label - compact version
        const labelText = `${step.side} ${strokeData.name}`;
        const labelY = isPlayerA ? startPos.y + 25 : startPos.y - 20;

        // Label background - smaller for compact design
        ctx.font = 'bold 10px Inter, sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const labelPadding = 6;
        const labelWidth = textMetrics.width + labelPadding * 2;
        const labelHeight = 18;

        ctx.fillStyle = strokeData.color;
        ctx.beginPath();
        ctx.roundRect(
            startPos.x - labelWidth / 2,
            labelY - labelHeight / 2,
            labelWidth,
            labelHeight,
            9
        );
        ctx.fill();

        // Label text
        ctx.fillStyle = strokeData.isOffensive ? '#000000' : '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, startPos.x, labelY);

        // Draw repetitions badge if present
        if (step.repetitions && (step.repetitions.min || step.repetitions.max)) {
            const repText = step.repetitions.min === step.repetitions.max
                ? `${step.repetitions.min}x`
                : `${step.repetitions.min}-${step.repetitions.max}x`;
            const repY = labelY + (isPlayerA ? 14 : -14);

            ctx.font = 'bold 8px Inter, sans-serif';
            const repMetrics = ctx.measureText(repText);
            const repPadding = 4;
            const repWidth = repMetrics.width + repPadding * 2;
            const repHeight = 14;

            // Blue pill for repetitions
            ctx.fillStyle = '#3B82F6';
            ctx.beginPath();
            ctx.roundRect(
                startPos.x - repWidth / 2,
                repY - repHeight / 2,
                repWidth,
                repHeight,
                7
            );
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(repText, startPos.x, repY);
        }

        // Draw "player decides" indicator if present
        if (step.playerDecides) {
            const decideY = labelY + (isPlayerA ? (step.repetitions ? 26 : 14) : (step.repetitions ? -26 : -14));
            const decideText = 'entscheidet';

            ctx.font = 'bold 8px Inter, sans-serif';
            const decideMetrics = ctx.measureText(decideText);
            const decidePadding = 4;
            const decideWidth = decideMetrics.width + decidePadding * 2;
            const decideHeight = 14;

            // Purple pill for player decides
            ctx.fillStyle = '#8B5CF6';
            ctx.beginPath();
            ctx.roundRect(
                startPos.x - decideWidth / 2,
                decideY - decideHeight / 2,
                decideWidth,
                decideHeight,
                7
            );
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(decideText, startPos.x, decideY);
        }

        // Draw variants if present
        if (step.variants && step.variants.length > 0 && progress >= 1) {
            this.drawVariants(step, startPos, isPlayerA, previousStepWasShort);
        }
    }

    drawVariants(step, mainStartPos, isPlayerA, previousStepWasShort) {
        const ctx = this.ctx;

        step.variants.forEach((variant, index) => {
            const variantStrokeData = STROKE_TYPES[variant.strokeType] || STROKE_TYPES.T;
            const variantToPositionData = POSITIONS[variant.toPosition] || POSITIONS.M;

            // Calculate variant end position
            let variantEndPos;
            if (variantToPositionData.isFree) {
                variantEndPos = {
                    x: this.tableX + this.tableWidth / 2,
                    y: isPlayerA ? this.tableY + this.tableHeight * 0.25 : this.tableY + this.tableHeight * 0.75
                };
            } else {
                variantEndPos = this.getTargetZoneCoords(variant.toPosition, isPlayerA);
            }

            // Offset the start position slightly for visual distinction
            const offsetX = (index + 1) * 8;
            const startPos = {
                x: mainStartPos.x + offsetX,
                y: mainStartPos.y
            };

            // Draw variant trajectory (dashed line, different color)
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = variantStrokeData.color;
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.globalAlpha = 0.7;
            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(variantEndPos.x, variantEndPos.y);
            ctx.stroke();

            // Draw variant arrowhead
            this.drawArrowhead(ctx, startPos.x, startPos.y, variantEndPos.x, variantEndPos.y, variantStrokeData.color);

            // Draw variant target zone (smaller, semi-transparent)
            if (!variantToPositionData.isFree) {
                const zoneWidth = 40;
                const zoneHeight = 24;
                ctx.strokeStyle = variantStrokeData.color;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 3]);
                ctx.globalAlpha = 0.5;
                ctx.strokeRect(
                    variantEndPos.x - zoneWidth / 2,
                    variantEndPos.y - zoneHeight / 2,
                    zoneWidth,
                    zoneHeight
                );
            }

            ctx.restore();

            // Draw small condition label near the variant line
            const conditionLabelX = (startPos.x + variantEndPos.x) / 2;
            const conditionLabelY = (startPos.y + variantEndPos.y) / 2;

            ctx.save();
            ctx.font = 'bold 8px Inter, sans-serif';
            ctx.fillStyle = variantStrokeData.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha = 0.9;

            // Background for readability
            const condText = `${variant.condition}→${variant.side} ${variantStrokeData.name}`;
            const textWidth = ctx.measureText(condText).width;
            ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
            ctx.fillRect(conditionLabelX - textWidth / 2 - 3, conditionLabelY - 6, textWidth + 6, 12);

            ctx.fillStyle = variantStrokeData.color;
            ctx.fillText(condText, conditionLabelX, conditionLabelY);
            ctx.restore();
        });
    }

    drawArrowhead(ctx, fromX, fromY, toX, toY, color) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const headLength = 8;  // Smaller for compact design

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

    drawFreeZone(ctx, isPlayerA, color, startPos, progress = 1) {
        // Draw three lines to VH, MITTE, and RH simultaneously
        const positions = ['VH', 'M', 'RH'];

        positions.forEach(pos => {
            const targetPos = this.getTargetZoneCoords(pos, isPlayerA);

            // Calculate current position based on progress
            const currentX = startPos.x + (targetPos.x - startPos.x) * progress;
            const currentY = startPos.y + (targetPos.y - startPos.y) * progress;

            // Draw trajectory line
            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            // Draw arrowhead if animation complete
            if (progress >= 1) {
                this.drawArrowhead(ctx, startPos.x, startPos.y, targetPos.x, targetPos.y, color);
            }

            // Draw small target zone
            if (progress >= 1) {
                const zoneWidth = 40;
                const zoneHeight = 24;
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(
                    targetPos.x - zoneWidth / 2,
                    targetPos.y - zoneHeight / 2,
                    zoneWidth,
                    zoneHeight
                );
                ctx.fillStyle = color + '30';
                ctx.fillRect(
                    targetPos.x - zoneWidth / 2,
                    targetPos.y - zoneHeight / 2,
                    zoneWidth,
                    zoneHeight
                );
            }

            ctx.restore();
        });

        // Draw "frei" label in center of opponent's side
        const netY = this.tableY + this.tableHeight * TABLE.netPosition;
        const centerX = this.tableX + this.tableWidth / 2;
        let zoneY;
        if (isPlayerA) {
            zoneY = this.tableY + (netY - this.tableY) / 2;
        } else {
            zoneY = netY + (this.tableY + this.tableHeight - netY) / 2;
        }

        ctx.save();
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.7;
        ctx.fillText('frei', centerX, zoneY);
        ctx.restore();
    }

    drawStepNumber(currentStep, totalSteps) {
        if (totalSteps === 0) return;

        const ctx = this.ctx;
        const text = `${currentStep}/${totalSteps}`;

        ctx.save();

        // Position: top right corner (use logical width)
        const x = (this.logicalWidth || this.canvas.width) - 10;
        const y = 12;

        // Draw background pill
        ctx.font = 'bold 12px Inter, sans-serif';
        const textMetrics = ctx.measureText(text);
        const padding = 8;
        const bgWidth = textMetrics.width + padding * 2;
        const bgHeight = 20;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(x - bgWidth, y - bgHeight / 2 + 2, bgWidth, bgHeight, 10);
        ctx.fill();

        // Draw text
        ctx.fillStyle = '#1a1a2e';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x - padding, y + 2);

        ctx.restore();
    }

    animate() {
        if (!this.isPlaying || this.steps.length === 0) return;

        const step = this.steps[this.currentStepIndex];
        const previousStep = this.currentStepIndex > 0 ? this.steps[this.currentStepIndex - 1] : null;

        // Clear and redraw table
        this.drawTable();

        // Draw current step with animation progress
        this.drawStep(step, this.animationProgress, previousStep);

        // Draw step number indicator
        this.drawStepNumber(this.currentStepIndex + 1, this.steps.length);

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
        // Ensure we have steps to show
        if (!this.steps || this.steps.length === 0) {
            console.warn('showStepStatic: No steps available');
            return;
        }

        if (stepIndex >= 0 && stepIndex < this.steps.length) {
            // Clear and redraw table first
            this.drawTable();

            // Get previous step for context (player position after short ball, etc.)
            const previousStep = stepIndex > 0 ? this.steps[stepIndex - 1] : null;

            // Draw only this single step
            this.drawStep(this.steps[stepIndex], 1, previousStep);

            // Show step number
            this.drawStepNumber(stepIndex + 1, this.steps.length);
        } else {
            console.warn('showStepStatic: Invalid step index', stepIndex, 'steps length:', this.steps.length);
        }
    }

    showAllSteps() {
        this.drawTable();
        this.steps.forEach((step, index) => {
            const previousStep = index > 0 ? this.steps[index - 1] : null;
            this.drawStep(step, 1, previousStep);
        });
        // Show total count when displaying all steps
        if (this.steps.length > 0) {
            this.drawStepNumber(this.steps.length, this.steps.length);
        }
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
                isShort: step.isShort,
                variants: step.variants,
                repetitions: step.repetitions,
                playerDecides: step.playerDecides
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
