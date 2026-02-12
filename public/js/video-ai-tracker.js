/**
 * Video AI Tracker - ByteTrack-inspired Ball Tracking for Table Tennis
 * Tracks ball detections across frames to build continuous trajectories.
 * Also detects ball bounces (landing points) and calculates speed.
 *
 * Based on ByteTrack algorithm (MIT License) - simplified for single-ball tracking.
 * No external dependencies - pure JavaScript.
 */

/**
 * BallTracker - Tracks a single ball across frames.
 * Uses Kalman-filter-like prediction + Hungarian matching.
 */
class BallTracker {
    constructor(options = {}) {
        this.maxAge = options.maxAge || 10;       // Frames before track is lost
        this.minHits = options.minHits || 3;      // Min detections to confirm track
        this.iouThreshold = options.iouThreshold || 0.2;
        this.distThreshold = options.distThreshold || 0.15; // Max distance (normalized) to match

        this.tracks = [];
        this.nextId = 1;
        this.frameCount = 0;
        this.trajectory = [];  // Complete ball trajectory: [{time, x, y, score, trackId, vx, vy}]
        this.bounces = [];     // Detected bounces: [{time, x, y, speed}]
        this.fps = options.fps || 30;
    }

    /**
     * Updates tracker with new detections from a single frame.
     * @param {Array} detections - [{x, y, width, height, score}] (normalized 0-1)
     * @param {number} timestamp - Current timestamp in seconds
     * @returns {Object} - { activeTracks, trajectory, newBounces }
     */
    update(detections, timestamp) {
        this.frameCount++;

        // Convert detections to center points
        const dets = detections.map(d => ({
            cx: d.x + d.width / 2,
            cy: d.y + d.height / 2,
            w: d.width,
            h: d.height,
            score: d.score,
            time: timestamp
        }));

        // Predict next position for existing tracks
        for (const track of this.tracks) {
            track.predict();
        }

        // Match detections to existing tracks (nearest neighbor)
        const matched = new Set();
        const matchedTracks = new Set();

        if (this.tracks.length > 0 && dets.length > 0) {
            // Build cost matrix (distances)
            const costs = [];
            for (let i = 0; i < this.tracks.length; i++) {
                costs[i] = [];
                for (let j = 0; j < dets.length; j++) {
                    const track = this.tracks[i];
                    const det = dets[j];
                    const dx = track.predictedX - det.cx;
                    const dy = track.predictedY - det.cy;
                    costs[i][j] = Math.sqrt(dx * dx + dy * dy);
                }
            }

            // Greedy matching (sufficient for single ball)
            const numMatches = Math.min(this.tracks.length, dets.length);
            for (let m = 0; m < numMatches; m++) {
                let bestCost = Infinity;
                let bestI = -1, bestJ = -1;

                for (let i = 0; i < this.tracks.length; i++) {
                    if (matchedTracks.has(i)) continue;
                    for (let j = 0; j < dets.length; j++) {
                        if (matched.has(j)) continue;
                        if (costs[i][j] < bestCost) {
                            bestCost = costs[i][j];
                            bestI = i;
                            bestJ = j;
                        }
                    }
                }

                if (bestCost < this.distThreshold && bestI >= 0) {
                    this.tracks[bestI].update(dets[bestJ]);
                    matched.add(bestJ);
                    matchedTracks.add(bestI);
                }
            }
        }

        // Age unmatched tracks
        for (let i = 0; i < this.tracks.length; i++) {
            if (!matchedTracks.has(i)) {
                this.tracks[i].age++;
            }
        }

        // Create new tracks for unmatched detections
        for (let j = 0; j < dets.length; j++) {
            if (!matched.has(j)) {
                this.tracks.push(new Track(this.nextId++, dets[j]));
            }
        }

        // Remove dead tracks
        this.tracks = this.tracks.filter(t => t.age <= this.maxAge);

        // Record trajectory from confirmed tracks
        const newBounces = [];
        for (const track of this.tracks) {
            if (track.hits >= this.minHits && track.age === 0) {
                const point = {
                    time: timestamp,
                    x: track.x,
                    y: track.y,
                    score: track.lastScore,
                    trackId: track.id,
                    vx: track.vx,
                    vy: track.vy
                };

                this.trajectory.push(point);

                // Bounce detection: vertical velocity changes from downward to upward
                const bounce = this.detectBounce(track, timestamp);
                if (bounce) {
                    this.bounces.push(bounce);
                    newBounces.push(bounce);
                }
            }
        }

        return {
            activeTracks: this.tracks.filter(t => t.hits >= this.minHits && t.age <= 2),
            trajectory: this.trajectory,
            newBounces
        };
    }

    /**
     * Detects if the ball just bounced (vertical velocity sign change).
     * A bounce happens when the ball's vertical velocity changes from positive (going down)
     * to negative (going up) - this indicates it hit the table.
     */
    detectBounce(track, timestamp) {
        const history = track.history;
        if (history.length < 4) return null;

        const recent = history.slice(-4);

        // Calculate vertical velocities
        const vy1 = recent[1].cy - recent[0].cy; // older
        const vy2 = recent[2].cy - recent[1].cy;
        const vy3 = recent[3].cy - recent[2].cy; // newest

        // Bounce: going down (vy > 0) then going up (vy < 0)
        // In normalized coords, y increases downward
        if (vy2 > 0.002 && vy3 < -0.002) {
            // Calculate speed at bounce point (in normalized units per second)
            const dt = 1 / this.fps;
            const speedNorm = Math.sqrt(track.vx * track.vx + track.vy * track.vy) / dt;

            return {
                time: timestamp,
                x: recent[2].cx,
                y: recent[2].cy,
                speed: speedNorm,
                trackId: track.id
            };
        }

        return null;
    }

    /**
     * Calculates ball speed in m/s using table calibration.
     * @param {Object} bounce - Bounce detection result
     * @param {Object} tableCalibration - {corners, realWidth: 2.74, realHeight: 1.525}
     * @returns {number} - Speed in m/s
     */
    calculateRealSpeed(bounce, tableCalibration) {
        if (!tableCalibration || !tableCalibration.corners) return 0;

        // Use table dimensions for pixel-to-meter conversion
        // Table is 2.74m x 1.525m
        const corners = tableCalibration.corners;
        const tableWidthPx = Math.sqrt(
            Math.pow(corners[1].x - corners[0].x, 2) +
            Math.pow(corners[1].y - corners[0].y, 2)
        );

        if (tableWidthPx < 0.01) return 0;

        const metersPerUnit = 2.74 / tableWidthPx;
        return bounce.speed * metersPerUnit;
    }

    /**
     * Gets the current trajectory for rendering.
     * @param {number} [windowSeconds=2] - How many seconds of history to return
     * @param {number} [currentTime] - Current video time
     * @returns {Array} - Trajectory points within the window
     */
    getTrajectoryWindow(windowSeconds = 2, currentTime = null) {
        if (currentTime === null) {
            return this.trajectory.slice(-Math.round(windowSeconds * this.fps));
        }

        return this.trajectory.filter(
            p => p.time >= currentTime - windowSeconds && p.time <= currentTime
        );
    }

    /**
     * Gets all detected bounces.
     * @returns {Array}
     */
    getBounces() {
        return this.bounces;
    }

    /**
     * Resets the tracker state.
     */
    reset() {
        this.tracks = [];
        this.trajectory = [];
        this.bounces = [];
        this.frameCount = 0;
        this.nextId = 1;
    }
}

/**
 * Single ball track with simple velocity-based prediction.
 */
class Track {
    constructor(id, detection) {
        this.id = id;
        this.x = detection.cx;
        this.y = detection.cy;
        this.w = detection.w;
        this.h = detection.h;
        this.vx = 0;
        this.vy = 0;
        this.predictedX = this.x;
        this.predictedY = this.y;
        this.lastScore = detection.score;
        this.hits = 1;
        this.age = 0;
        this.history = [detection]; // Keep last N positions for bounce detection
        this.maxHistory = 20;
    }

    /**
     * Predicts the next position based on current velocity.
     */
    predict() {
        this.predictedX = this.x + this.vx;
        this.predictedY = this.y + this.vy;
    }

    /**
     * Updates the track with a new matched detection.
     */
    update(detection) {
        // Update velocity (smoothed)
        const alpha = 0.6; // Smoothing factor
        const newVx = detection.cx - this.x;
        const newVy = detection.cy - this.y;
        this.vx = alpha * newVx + (1 - alpha) * this.vx;
        this.vy = alpha * newVy + (1 - alpha) * this.vy;

        // Update position
        this.x = detection.cx;
        this.y = detection.cy;
        this.w = detection.w;
        this.h = detection.h;
        this.lastScore = detection.score;
        this.hits++;
        this.age = 0;

        // History for bounce detection
        this.history.push(detection);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
    }
}

// Export
window.BallTracker = BallTracker;

export { BallTracker, Track };
export default BallTracker;
