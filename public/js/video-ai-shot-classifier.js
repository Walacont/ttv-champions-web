/**
 * Video AI Shot Classifier - Schlag-Klassifizierung aus Pose-Daten
 * Regel-basierte Erkennung von Vorhand/Rückhand, Topspin/Schupf/Block/Aufschlag.
 * Nutzt Handgelenk-Trajektorien und Körperposition aus MediaPipe-Keypoints.
 */

import { POSE_LANDMARKS } from './video-ai-engine.js';

const L = POSE_LANDMARKS;

// Schwellenwerte
const STROKE_SPEED_THRESHOLD = 0.015;  // Min. Wrist-Geschwindigkeit pro Frame für Schlag
const STROKE_MIN_FRAMES = 2;           // Min. Frames für einen Schlag
const STROKE_COOLDOWN_FRAMES = 3;      // Frames Pause zwischen Schlägen
const SERVE_TOSS_THRESHOLD = 0.03;     // Y-Bewegung der Nicht-Schlaghand für Aufschlag

/**
 * Klassifiziert Schläge aus analysierten Frames.
 * @param {Array} frames - Array von {timestamp_seconds, poses}
 * @param {number} [playerIdx=0] - Welcher Spieler (0 oder 1)
 * @returns {Object} - { shots: [...], stats: {...} }
 */
export function classifyShots(frames, playerIdx = 0) {
    if (!frames || frames.length < 5) {
        return { shots: [], stats: null };
    }

    // Player-Frames extrahieren
    const playerFrames = frames
        .filter(f => f.poses && f.poses.length > playerIdx)
        .map(f => ({
            timestamp: f.timestamp_seconds,
            landmarks: f.poses[playerIdx].landmarks
        }));

    if (playerFrames.length < 5) {
        return { shots: [], stats: null };
    }

    // Dominante Seite bestimmen
    const dominantSide = detectDominantSide(playerFrames);

    // Schlag-Events erkennen (Momente hoher Wrist-Geschwindigkeit)
    const strokeEvents = detectStrokeEvents(playerFrames, dominantSide);

    // Jeden Schlag klassifizieren
    const shots = strokeEvents.map(event => {
        const side = classifySide(event, playerFrames, dominantSide);
        const type = classifyShotType(event, playerFrames, dominantSide);
        const isServe = detectServe(event, playerFrames, dominantSide);

        let shotType;
        if (isServe) {
            shotType = side === 'forehand' ? 'forehand_serve' : 'backhand_serve';
        } else {
            shotType = `${side}_${type}`;
        }

        return {
            timestamp: event.timestamp,
            frameIndex: event.frameIndex,
            shotType,
            side,
            type: isServe ? 'serve' : type,
            confidence: event.confidence,
            wristSpeed: event.speed
        };
    });

    // Statistik berechnen
    const stats = computeShotStats(shots);

    return { shots, stats };
}

/**
 * Erkennt die dominante Seite (links/rechts-händig).
 */
function detectDominantSide(playerFrames) {
    let leftActivity = 0, rightActivity = 0;

    for (let i = 1; i < playerFrames.length; i++) {
        const prev = playerFrames[i - 1].landmarks;
        const curr = playerFrames[i].landmarks;

        const lw = curr[L.LEFT_WRIST];
        const rw = curr[L.RIGHT_WRIST];
        const plw = prev[L.LEFT_WRIST];
        const prw = prev[L.RIGHT_WRIST];

        if (lw && plw && lw.visibility > 0.3 && plw.visibility > 0.3) {
            leftActivity += Math.abs(lw.x - plw.x) + Math.abs(lw.y - plw.y);
        }
        if (rw && prw && rw.visibility > 0.3 && prw.visibility > 0.3) {
            rightActivity += Math.abs(rw.x - prw.x) + Math.abs(rw.y - prw.y);
        }
    }

    return leftActivity > rightActivity ? 'left' : 'right';
}

/**
 * Erkennt Schlag-Events anhand der Handgelenk-Geschwindigkeit.
 */
function detectStrokeEvents(playerFrames, dominantSide) {
    const events = [];
    const wristIdx = dominantSide === 'left' ? L.LEFT_WRIST : L.RIGHT_WRIST;

    let cooldown = 0;

    for (let i = 1; i < playerFrames.length; i++) {
        if (cooldown > 0) {
            cooldown--;
            continue;
        }

        const prev = playerFrames[i - 1].landmarks;
        const curr = playerFrames[i].landmarks;

        const pw = prev[wristIdx];
        const cw = curr[wristIdx];

        if (!pw || !cw || pw.visibility < 0.3 || cw.visibility < 0.3) continue;

        const dx = cw.x - pw.x;
        const dy = cw.y - pw.y;
        const speed = Math.sqrt(dx * dx + dy * dy);

        if (speed >= STROKE_SPEED_THRESHOLD) {
            // Prüfe ob der Schlag über mehrere Frames anhält
            let peakSpeed = speed;
            let peakIdx = i;
            let strokeFrames = 1;

            for (let j = i + 1; j < Math.min(i + 6, playerFrames.length); j++) {
                const nextPrev = playerFrames[j - 1].landmarks[wristIdx];
                const next = playerFrames[j].landmarks[wristIdx];
                if (!nextPrev || !next) break;

                const ns = Math.sqrt(
                    Math.pow(next.x - nextPrev.x, 2) + Math.pow(next.y - nextPrev.y, 2)
                );
                if (ns >= STROKE_SPEED_THRESHOLD * 0.5) {
                    strokeFrames++;
                    if (ns > peakSpeed) {
                        peakSpeed = ns;
                        peakIdx = j;
                    }
                } else {
                    break;
                }
            }

            if (strokeFrames >= STROKE_MIN_FRAMES) {
                const confidence = Math.min(1.0, peakSpeed / (STROKE_SPEED_THRESHOLD * 3));

                events.push({
                    frameIndex: peakIdx,
                    timestamp: playerFrames[peakIdx].timestamp,
                    speed: peakSpeed,
                    strokeFrames,
                    confidence: Math.round(confidence * 100) / 100,
                    // Richtung des Schlags
                    directionX: dx,
                    directionY: dy
                });

                cooldown = STROKE_COOLDOWN_FRAMES;
            }
        }
    }

    return events;
}

/**
 * Klassifiziert VH/RH anhand der Handgelenk-Position relativ zur Körpermitte.
 */
function classifySide(event, playerFrames, dominantSide) {
    const frame = playerFrames[event.frameIndex];
    if (!frame) return 'forehand';

    const lm = frame.landmarks;
    const ls = lm[L.LEFT_SHOULDER];
    const rs = lm[L.RIGHT_SHOULDER];

    if (!ls || !rs || ls.visibility < 0.3 || rs.visibility < 0.3) return 'forehand';

    // Körpermitte
    const centerX = (ls.x + rs.x) / 2;

    // Handgelenk der dominanten Seite
    const wristIdx = dominantSide === 'left' ? L.LEFT_WRIST : L.RIGHT_WRIST;
    const wrist = lm[wristIdx];

    if (!wrist || wrist.visibility < 0.3) return 'forehand';

    // Vorhand: Schlagarm auf der gleichen Seite wie die dominante Hand
    // Rückhand: Schlagarm kreuzt die Körpermitte
    if (dominantSide === 'right') {
        // Rechtshänder: Wrist rechts von Mitte = Vorhand, links = Rückhand
        return wrist.x > centerX ? 'forehand' : 'backhand';
    } else {
        // Linkshänder: Wrist links von Mitte = Vorhand, rechts = Rückhand
        return wrist.x < centerX ? 'forehand' : 'backhand';
    }
}

/**
 * Klassifiziert den Schlag-Typ (topspin/push/block).
 */
function classifyShotType(event, playerFrames, dominantSide) {
    const idx = event.frameIndex;
    const wristIdx = dominantSide === 'left' ? L.LEFT_WRIST : L.RIGHT_WRIST;

    // Frames vor und nach dem Schlag analysieren
    const before = idx >= 2 ? playerFrames[idx - 2] : null;
    const at = playerFrames[idx];
    const after = idx + 2 < playerFrames.length ? playerFrames[idx + 2] : null;

    if (!at) return 'topspin';

    const wristAt = at.landmarks[wristIdx];
    if (!wristAt || wristAt.visibility < 0.3) return 'topspin';

    // Vertikale Bewegung analysieren
    let verticalMovement = 0;
    let amplitude = 0;

    if (before) {
        const wristBefore = before.landmarks[wristIdx];
        if (wristBefore && wristBefore.visibility > 0.3) {
            verticalMovement = wristBefore.y - wristAt.y; // Positiv = nach oben
            amplitude += Math.abs(wristBefore.y - wristAt.y);
        }
    }

    if (after) {
        const wristAfter = after.landmarks[wristIdx];
        if (wristAfter && wristAfter.visibility > 0.3) {
            amplitude += Math.abs(wristAt.y - wristAfter.y);
        }
    }

    // Topspin: große Aufwärtsbewegung (Wrist geht hoch = Y sinkt)
    if (verticalMovement > 0.02 && amplitude > 0.03) {
        return 'topspin';
    }

    // Block: kleine Amplitude, kompakte Bewegung
    if (amplitude < 0.02 && event.strokeFrames <= 3) {
        return 'block';
    }

    // Push/Schupf: moderate Bewegung, eher horizontal
    if (amplitude < 0.04) {
        return 'push';
    }

    // Default: Topspin (häufigster Schlag)
    return 'topspin';
}

/**
 * Erkennt ob ein Schlag ein Aufschlag ist.
 * Aufschlag-Indikator: Die Nicht-Schlaghand bewegt sich kurz vor dem Schlag nach oben (Ballwurf).
 */
function detectServe(event, playerFrames, dominantSide) {
    const idx = event.frameIndex;
    const nonDominantWristIdx = dominantSide === 'left' ? L.RIGHT_WRIST : L.LEFT_WRIST;

    // 3-5 Frames vor dem Schlag prüfen
    const checkStart = Math.max(0, idx - 5);
    const checkEnd = Math.max(0, idx - 1);

    let maxUpwardMovement = 0;

    for (let i = checkStart + 1; i <= checkEnd; i++) {
        const prev = playerFrames[i - 1]?.landmarks[nonDominantWristIdx];
        const curr = playerFrames[i]?.landmarks[nonDominantWristIdx];

        if (!prev || !curr || prev.visibility < 0.3 || curr.visibility < 0.3) continue;

        // Aufwärtsbewegung = Y sinkt (Bildkoordinaten)
        const upward = prev.y - curr.y;
        if (upward > maxUpwardMovement) {
            maxUpwardMovement = upward;
        }
    }

    return maxUpwardMovement >= SERVE_TOSS_THRESHOLD;
}

/**
 * Berechnet Schlag-Statistiken.
 */
function computeShotStats(shots) {
    if (shots.length === 0) return null;

    const counts = {};
    const sideCount = { forehand: 0, backhand: 0 };
    const typeCount = { topspin: 0, push: 0, block: 0, serve: 0 };

    for (const shot of shots) {
        counts[shot.shotType] = (counts[shot.shotType] || 0) + 1;
        sideCount[shot.side] = (sideCount[shot.side] || 0) + 1;
        typeCount[shot.type] = (typeCount[shot.type] || 0) + 1;
    }

    return {
        totalShots: shots.length,
        shotTypeCounts: counts,
        sideDistribution: sideCount,
        typeDistribution: typeCount,
        avgConfidence: Math.round(
            shots.reduce((sum, s) => sum + s.confidence, 0) / shots.length * 100
        )
    };
}

/**
 * Rendert Shot-Statistik als HTML.
 */
export function renderShotStats(analysis) {
    if (!analysis || !analysis.stats) {
        return '<p class="text-sm text-gray-500">Keine Schläge erkannt</p>';
    }

    const s = analysis.stats;

    // Shot-Type Labels (deutsch)
    const shotLabels = {
        forehand_serve: 'VH Aufschlag',
        backhand_serve: 'RH Aufschlag',
        forehand_topspin: 'VH Topspin',
        backhand_topspin: 'RH Topspin',
        forehand_push: 'VH Schupf',
        backhand_push: 'RH Schupf',
        forehand_block: 'VH Block',
        backhand_block: 'RH Block'
    };

    const shotColors = {
        forehand_serve: 'bg-purple-500',
        backhand_serve: 'bg-purple-400',
        forehand_topspin: 'bg-red-500',
        backhand_topspin: 'bg-red-400',
        forehand_push: 'bg-blue-500',
        backhand_push: 'bg-blue-400',
        forehand_block: 'bg-green-500',
        backhand_block: 'bg-green-400'
    };

    // Schlag-Verteilung als Balken
    const maxCount = Math.max(...Object.values(s.shotTypeCounts));
    const barsHtml = Object.entries(s.shotTypeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            const color = shotColors[type] || 'bg-gray-500';
            const label = shotLabels[type] || type;
            return `
                <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-400 w-24 text-right shrink-0">${label}</span>
                    <div class="flex-1 bg-gray-700 rounded-full h-2">
                        <div class="${color} h-2 rounded-full" style="width: ${pct}%"></div>
                    </div>
                    <span class="text-xs font-medium w-6">${count}</span>
                </div>
            `;
        }).join('');

    // VH/RH Verhältnis
    const vhPct = s.totalShots > 0
        ? Math.round((s.sideDistribution.forehand / s.totalShots) * 100)
        : 0;

    return `
        <div class="text-sm space-y-2">
            <div class="flex justify-between">
                <span class="text-gray-400">Schläge gesamt:</span>
                <span class="font-medium">${s.totalShots}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-gray-400">VH / RH:</span>
                <div class="flex items-center gap-1">
                    <div class="w-16 bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div class="bg-red-500 h-2 rounded-full" style="width: ${vhPct}%"></div>
                    </div>
                    <span class="text-xs font-medium">${vhPct}% / ${100 - vhPct}%</span>
                </div>
            </div>
            <div class="space-y-1.5 mt-2">
                ${barsHtml}
            </div>
        </div>
    `;
}

/**
 * Speichert klassifizierte Schläge in video_labels.
 */
export async function saveShotLabels(db, videoId, userId, clubId, shots) {
    if (!db || !shots || shots.length === 0) return;

    const labels = shots.map(shot => ({
        video_id: videoId,
        labeled_by: userId,
        club_id: clubId || null,
        timestamp_start: shot.timestamp,
        timestamp_end: null,
        event_type: 'shot',
        shot_type: shot.shotType,
        player_position: 'unknown',
        confidence: shot.confidence >= 0.7 ? 'probable' : 'uncertain',
        notes: `AI-detected (speed: ${shot.wristSpeed?.toFixed(3)})`,
        is_verified: false
    }));

    // Batch-Insert (max 50 pro Request)
    for (let i = 0; i < labels.length; i += 50) {
        const batch = labels.slice(i, i + 50);
        const { error } = await db.from('video_labels').insert(batch);
        if (error) {
            console.error('[Shot Classifier] Save failed:', error);
            throw error;
        }
    }

    return labels.length;
}

// Export für globalen Zugriff
window.videoAIShotClassifier = {
    classifyShots,
    renderShotStats,
    saveShotLabels
};

export default {
    classifyShots,
    renderShotStats,
    saveShotLabels
};
