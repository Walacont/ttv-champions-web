/**
 * Video AI Shot Classifier - Schlag-Klassifizierung aus Pose-Daten
 * Regel-basierte Erkennung von Vorhand/Rückhand, Topspin/Schupf/Block/Aufschlag.
 * Nutzt Handgelenk-Trajektorien und Körperposition aus MediaPipe-Keypoints.
 */

import { POSE_LANDMARKS } from './video-ai-engine.js';

const L = POSE_LANDMARKS;

// Basis-Schwellenwerte (kalibriert auf Erwachsene, Schulterbreite ~0.15 in normalisierten Coords)
const REFERENCE_SHOULDER_WIDTH = 0.15;
const BASE_STROKE_SPEED_THRESHOLD = 0.025;  // Min. Wrist-Geschwindigkeit pro Frame (erhöht von 0.015 → weniger Fehlerkennungen)
const STROKE_MIN_FRAMES = 3;               // Min. Frames für einen Schlag (erhöht von 2 → filtert kurze Zufallsbewegungen)
const STROKE_COOLDOWN_FRAMES = 8;          // Frames Pause zwischen Schlägen (erhöht von 3 → verhindert Doppelzählung bei Vor-/Rückschwung)
const BASE_SERVE_TOSS_THRESHOLD = 0.03;    // Y-Bewegung der Nicht-Schlaghand
const MIN_CONFIDENCE_THRESHOLD = 0.4;      // Min. Confidence um als Schlag zu zählen

/**
 * Berechnet den Skalierungsfaktor basierend auf der sichtbaren Körpergröße.
 * Kinder und weiter entfernte Spieler erscheinen kleiner im Bild,
 * wodurch ihre Bewegungen in normalisierten Koordinaten kleiner ausfallen.
 * Diese Funktion normalisiert die Schwellenwerte entsprechend.
 * @param {Array} playerFrames - Frames mit Landmarks
 * @returns {number} - Skalierungsfaktor (1.0 = Referenz-Erwachsener)
 */
function computeBodyScale(playerFrames) {
    let totalWidth = 0;
    let count = 0;

    // Schulterbreite über mehrere Frames mitteln für Stabilität
    const sampleStep = Math.max(1, Math.floor(playerFrames.length / 10));
    for (let i = 0; i < playerFrames.length; i += sampleStep) {
        const lm = playerFrames[i].landmarks;
        const ls = lm[L.LEFT_SHOULDER];
        const rs = lm[L.RIGHT_SHOULDER];
        if (ls && rs && ls.visibility > 0.3 && rs.visibility > 0.3) {
            totalWidth += Math.abs(rs.x - ls.x);
            count++;
        }
    }

    if (count === 0) return 1.0;
    const avgShoulderWidth = totalWidth / count;
    // Clamp zwischen 0.5x und 2.0x um Ausreißer zu vermeiden
    return Math.max(0.5, Math.min(2.0, avgShoulderWidth / REFERENCE_SHOULDER_WIDTH));
}

/**
 * Klassifiziert Schläge aus analysierten Frames.
 * @param {Array} frames - Array von {timestamp_seconds, poses}
 * @param {number} [playerIdx=0] - Welcher Spieler (0 oder 1)
 * @param {Object} [options] - Optionen
 * @param {string} [options.spielhand] - Explizite Spielhand ('left'/'right') aus Profil, sonst Auto-Erkennung
 * @returns {Object} - { shots: [...], stats: {...} }
 */
export function classifyShots(frames, playerIdx = 0, options = {}) {
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

    // Körpergröße-Skalierung berechnen (passt Schwellenwerte an Kinder/Entfernung an)
    const bodyScale = computeBodyScale(playerFrames);

    // Dominante Seite: explizit aus Profil oder Auto-Erkennung
    const dominantSide = options.spielhand || detectDominantSide(playerFrames);
    const handSource = options.spielhand ? 'profile' : 'auto';

    // Skalierte Schwellenwerte
    const strokeSpeedThreshold = BASE_STROKE_SPEED_THRESHOLD * bodyScale;
    const serveTossThreshold = BASE_SERVE_TOSS_THRESHOLD * bodyScale;

    // Schlag-Events erkennen (Momente hoher Wrist-Geschwindigkeit)
    const strokeEvents = detectStrokeEvents(playerFrames, dominantSide, strokeSpeedThreshold);

    // Jeden Schlag klassifizieren und nach Mindest-Confidence filtern
    const shots = strokeEvents
        .filter(event => event.confidence >= MIN_CONFIDENCE_THRESHOLD)
        .map(event => {
            const side = classifySide(event, playerFrames, dominantSide);
            const type = classifyShotType(event, playerFrames, dominantSide, bodyScale);
            const isServe = detectServe(event, playerFrames, dominantSide, serveTossThreshold);

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

    return {
        shots,
        stats,
        meta: {
            dominantSide,
            handSource,
            bodyScale: Math.round(bodyScale * 100) / 100,
            strokeSpeedThreshold: Math.round(strokeSpeedThreshold * 10000) / 10000
        }
    };
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
function detectStrokeEvents(playerFrames, dominantSide, speedThreshold) {
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

        if (speed >= speedThreshold) {
            // Prüfe ob der Schlag über mehrere Frames anhält
            let peakSpeed = speed;
            let peakIdx = i;
            let strokeFrames = 1;
            let totalSpeed = speed;

            for (let j = i + 1; j < Math.min(i + 8, playerFrames.length); j++) {
                const nextPrev = playerFrames[j - 1].landmarks[wristIdx];
                const next = playerFrames[j].landmarks[wristIdx];
                if (!nextPrev || !next) break;

                const ns = Math.sqrt(
                    Math.pow(next.x - nextPrev.x, 2) + Math.pow(next.y - nextPrev.y, 2)
                );
                if (ns >= speedThreshold * 0.4) {
                    strokeFrames++;
                    totalSpeed += ns;
                    if (ns > peakSpeed) {
                        peakSpeed = ns;
                        peakIdx = j;
                    }
                } else {
                    break;
                }
            }

            if (strokeFrames >= STROKE_MIN_FRAMES) {
                // Durchschnitts-Geschwindigkeit muss über 60% des Schwellwerts liegen
                const avgSpeed = totalSpeed / strokeFrames;
                if (avgSpeed < speedThreshold * 0.6) {
                    continue;
                }

                const confidence = Math.min(1.0, peakSpeed / (speedThreshold * 3));

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
function classifyShotType(event, playerFrames, dominantSide, bodyScale = 1.0) {
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

    // Skalierte Schwellenwerte (Kinder/weiter entfernte Spieler haben kleinere Bewegungen)
    const topspinVerticalThreshold = 0.02 * bodyScale;
    const topspinAmplitudeThreshold = 0.03 * bodyScale;
    const blockAmplitudeThreshold = 0.02 * bodyScale;
    const pushAmplitudeThreshold = 0.04 * bodyScale;

    // Topspin: große Aufwärtsbewegung (Wrist geht hoch = Y sinkt)
    if (verticalMovement > topspinVerticalThreshold && amplitude > topspinAmplitudeThreshold) {
        return 'topspin';
    }

    // Block: kleine Amplitude, kompakte Bewegung
    if (amplitude < blockAmplitudeThreshold && event.strokeFrames <= 3) {
        return 'block';
    }

    // Push/Schupf: moderate Bewegung, eher horizontal
    if (amplitude < pushAmplitudeThreshold) {
        return 'push';
    }

    // Default: Topspin (häufigster Schlag)
    return 'topspin';
}

/**
 * Erkennt ob ein Schlag ein Aufschlag ist.
 * Aufschlag-Indikator: Die Nicht-Schlaghand bewegt sich kurz vor dem Schlag nach oben (Ballwurf).
 */
function detectServe(event, playerFrames, dominantSide, tossThreshold) {
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

    return maxUpwardMovement >= tossThreshold;
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
    const meta = analysis.meta;

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

    // Händigkeit und Skalierung anzeigen
    const handLabel = meta?.dominantSide === 'left' ? 'Linkshänder' : 'Rechtshänder';
    const handSourceLabel = meta?.handSource === 'profile' ? '(Profil)' : '(Auto)';
    const scaleLabel = meta?.bodyScale
        ? (meta.bodyScale < 0.8 ? '(klein/weit)' : meta.bodyScale > 1.2 ? '(groß/nah)' : '')
        : '';

    return `
        <div class="text-sm space-y-2">
            <div class="flex justify-between">
                <span class="text-gray-400">Spieler:</span>
                <span class="font-medium">${handLabel} <span class="text-gray-500 text-xs">${handSourceLabel} ${scaleLabel}</span></span>
            </div>
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

    // Alte KI-generierte Labels für dieses Video löschen (verhindert Duplikate)
    try {
        await db
            .from('video_labels')
            .delete()
            .eq('video_id', videoId)
            .eq('labeled_by', userId)
            .like('notes', 'AI-detected%');
    } catch (e) {
        console.warn('[Shot Classifier] Could not delete old labels:', e);
    }

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
