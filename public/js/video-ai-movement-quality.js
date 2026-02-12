/**
 * Video AI Movement Quality - Bewegungsqualität-Analyse für Balleimertraining
 * Erkennt Wiederholungen, berechnet Konsistenz-Scores und erkennt Ermüdung.
 */

import { POSE_LANDMARKS } from './video-ai-engine.js';

const L = POSE_LANDMARKS;

// Keypoints die für die Schlagbewegung relevant sind
const STROKE_KEYPOINTS = [
    L.LEFT_SHOULDER, L.RIGHT_SHOULDER,
    L.LEFT_ELBOW, L.RIGHT_ELBOW,
    L.LEFT_WRIST, L.RIGHT_WRIST,
    L.LEFT_HIP, L.RIGHT_HIP,
    L.LEFT_KNEE, L.RIGHT_KNEE,
    L.LEFT_ANKLE, L.RIGHT_ANKLE
];

/**
 * Analysiert eine Balleimertraining-Session.
 * @param {Array} frames - Array von {timestamp_seconds, poses}
 * @returns {Object} - Analyse-Ergebnisse
 */
export function analyzeBallMachineSession(frames) {
    if (!frames || frames.length < 5) {
        return { repetitions: [], summary: null, fatigueCurve: [] };
    }

    // Nur den ersten Spieler analysieren (Trainierenden)
    const playerFrames = extractPlayerFrames(frames, 0);
    if (playerFrames.length < 5) {
        return { repetitions: [], summary: null, fatigueCurve: [] };
    }

    // Wiederholungen erkennen
    const repetitions = detectRepetitions(playerFrames);

    if (repetitions.length < 2) {
        return { repetitions, summary: null, fatigueCurve: [] };
    }

    // Referenz-Pose bestimmen (Durchschnitt der ersten 3 Wiederholungen)
    const referenceCount = Math.min(3, repetitions.length);
    const referencePose = computeReferencePose(repetitions.slice(0, referenceCount));

    // Konsistenz-Scores berechnen
    const scoredRepetitions = repetitions.map((rep, idx) => {
        const score = computeConsistencyScore(rep.peakPose, referencePose);
        const deviations = identifyDeviations(rep.peakPose, referencePose);
        return {
            ...rep,
            index: idx,
            consistencyScore: score,
            deviations
        };
    });

    // Ermüdungskurve berechnen
    const fatigueCurve = computeFatigueCurve(scoredRepetitions);

    // Zusammenfassung
    const scores = scoredRepetitions.map(r => r.consistencyScore);
    const summary = {
        totalRepetitions: scoredRepetitions.length,
        averageConsistency: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        bestScore: Math.round(Math.max(...scores)),
        worstScore: Math.round(Math.min(...scores)),
        fatigueDetected: fatigueCurve.length > 3 && fatigueCurve[fatigueCurve.length - 1].trend < -10,
        commonDeviations: findCommonDeviations(scoredRepetitions)
    };

    return { repetitions: scoredRepetitions, summary, fatigueCurve };
}

/**
 * Extrahiert Frames eines bestimmten Spielers.
 */
function extractPlayerFrames(frames, playerIdx) {
    return frames
        .filter(f => f.poses && f.poses.length > playerIdx)
        .map(f => ({
            timestamp: f.timestamp_seconds,
            landmarks: f.poses[playerIdx].landmarks
        }));
}

/**
 * Erkennt Wiederholungen anhand der Handgelenk-Bewegung.
 * Schlagbewegungen haben einen charakteristischen Zyklus:
 * Ausholbewegung -> Schlag -> Rückstellung
 */
function detectRepetitions(playerFrames) {
    const repetitions = [];

    // Handgelenk-Y-Werte extrahieren (dominante Hand - nehmen beide und verwenden die aktivere)
    const leftWristY = playerFrames.map(f => f.landmarks[L.LEFT_WRIST]?.y ?? 0.5);
    const rightWristY = playerFrames.map(f => f.landmarks[L.RIGHT_WRIST]?.y ?? 0.5);

    // Varianz beider Handgelenke berechnen um die dominante Seite zu finden
    const leftVar = computeVariance(leftWristY);
    const rightVar = computeVariance(rightWristY);
    const wristY = leftVar > rightVar ? leftWristY : rightWristY;
    const dominantSide = leftVar > rightVar ? 'left' : 'right';

    // Glättung (Moving Average mit Fenster 3)
    const smoothed = movingAverage(wristY, 3);

    // Peaks finden (lokale Minima = höchster Punkt des Schlags, da Y nach unten zunimmt)
    const peaks = findPeaks(smoothed, 0.02); // Min 2% Unterschied

    // Aus Peaks Wiederholungen bilden
    for (let i = 0; i < peaks.length; i++) {
        const peakIdx = peaks[i];
        const frame = playerFrames[peakIdx];
        if (!frame) continue;

        repetitions.push({
            timestamp: frame.timestamp,
            frameIndex: peakIdx,
            peakPose: frame.landmarks,
            dominantSide
        });
    }

    return repetitions;
}

/**
 * Berechnet die Referenz-Pose (Durchschnitt mehrerer Wiederholungen).
 */
function computeReferencePose(repetitions) {
    if (repetitions.length === 0) return null;

    const numLandmarks = repetitions[0].peakPose.length;
    const reference = [];

    for (let i = 0; i < numLandmarks; i++) {
        let sumX = 0, sumY = 0, sumZ = 0, count = 0;
        for (const rep of repetitions) {
            const lm = rep.peakPose[i];
            if (lm && lm.visibility > 0.3) {
                sumX += lm.x;
                sumY += lm.y;
                sumZ += lm.z || 0;
                count++;
            }
        }
        reference.push({
            x: count > 0 ? sumX / count : 0,
            y: count > 0 ? sumY / count : 0,
            z: count > 0 ? sumZ / count : 0,
            visibility: count / repetitions.length
        });
    }

    return reference;
}

/**
 * Berechnet den Konsistenz-Score zwischen einer Pose und der Referenz.
 * @returns {number} - Score 0-100 (100 = perfekt gleich)
 */
function computeConsistencyScore(pose, reference) {
    if (!pose || !reference) return 0;

    let similarity = 0;
    let count = 0;

    for (const idx of STROKE_KEYPOINTS) {
        const p = pose[idx];
        const r = reference[idx];
        if (!p || !r || p.visibility < 0.3 || r.visibility < 0.3) continue;

        // Euklidischer Abstand (normalisiert 0-1)
        const dx = p.x - r.x;
        const dy = p.y - r.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // In Similarity umwandeln (0 Abstand = 1.0, max ~0.3 Abstand = 0.0)
        similarity += Math.max(0, 1 - dist / 0.3);
        count++;
    }

    return count > 0 ? Math.round((similarity / count) * 100) : 0;
}

/**
 * Identifiziert spezifische Abweichungen.
 */
function identifyDeviations(pose, reference) {
    if (!pose || !reference) return [];

    const deviations = [];
    const threshold = 0.04; // 4% der Bildbreite/-höhe

    const checkPoints = [
        { idx: L.LEFT_ELBOW, name: 'Linker Ellbogen' },
        { idx: L.RIGHT_ELBOW, name: 'Rechter Ellbogen' },
        { idx: L.LEFT_WRIST, name: 'Linkes Handgelenk' },
        { idx: L.RIGHT_WRIST, name: 'Rechtes Handgelenk' },
        { idx: L.LEFT_SHOULDER, name: 'Linke Schulter' },
        { idx: L.RIGHT_SHOULDER, name: 'Rechte Schulter' },
        { idx: L.LEFT_HIP, name: 'Linke Hüfte' },
        { idx: L.RIGHT_HIP, name: 'Rechte Hüfte' },
        { idx: L.LEFT_KNEE, name: 'Linkes Knie' },
        { idx: L.RIGHT_KNEE, name: 'Rechtes Knie' },
    ];

    for (const { idx, name } of checkPoints) {
        const p = pose[idx];
        const r = reference[idx];
        if (!p || !r || p.visibility < 0.3 || r.visibility < 0.3) continue;

        const dy = p.y - r.y;
        const dx = p.x - r.x;

        if (Math.abs(dy) > threshold) {
            deviations.push({
                landmark: name,
                direction: dy > 0 ? 'tiefer' : 'höher',
                amount: Math.abs(dy),
                description: `${name} ist ${dy > 0 ? 'tiefer' : 'höher'} als die Referenz`
            });
        }

        if (Math.abs(dx) > threshold) {
            deviations.push({
                landmark: name,
                direction: dx > 0 ? 'weiter rechts' : 'weiter links',
                amount: Math.abs(dx),
                description: `${name} ist ${dx > 0 ? 'weiter rechts' : 'weiter links'} als die Referenz`
            });
        }
    }

    // Nach Schwere sortieren (größte Abweichung zuerst)
    deviations.sort((a, b) => b.amount - a.amount);

    return deviations.slice(0, 5); // Max 5 Abweichungen
}

/**
 * Berechnet die Ermüdungskurve.
 */
function computeFatigueCurve(scoredRepetitions) {
    if (scoredRepetitions.length < 3) return [];

    const windowSize = 3;
    const curve = [];

    for (let i = 0; i < scoredRepetitions.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(scoredRepetitions.length, start + windowSize);
        const window = scoredRepetitions.slice(start, end);
        const avgScore = window.reduce((sum, r) => sum + r.consistencyScore, 0) / window.length;

        // Trend berechnen (Differenz zum Anfangs-Score)
        const initialAvg = scoredRepetitions.slice(0, Math.min(3, scoredRepetitions.length))
            .reduce((sum, r) => sum + r.consistencyScore, 0) / Math.min(3, scoredRepetitions.length);

        curve.push({
            index: i,
            timestamp: scoredRepetitions[i].timestamp,
            score: Math.round(avgScore),
            trend: Math.round(avgScore - initialAvg)
        });
    }

    return curve;
}

/**
 * Findet die häufigsten Abweichungen über alle Wiederholungen.
 */
function findCommonDeviations(scoredRepetitions) {
    const deviationCounts = {};

    for (const rep of scoredRepetitions) {
        for (const dev of rep.deviations) {
            const key = `${dev.landmark}:${dev.direction}`;
            if (!deviationCounts[key]) {
                deviationCounts[key] = { ...dev, count: 0 };
            }
            deviationCounts[key].count++;
        }
    }

    // Nach Häufigkeit sortieren
    return Object.values(deviationCounts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 3) // Top 3
        .map(d => ({
            description: d.description,
            frequency: Math.round((d.count / scoredRepetitions.length) * 100)
        }));
}

// --- Hilfsfunktionen ---

function computeVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / values.length;
}

function movingAverage(values, windowSize) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(values.length, start + windowSize);
        const window = values.slice(start, end);
        result.push(window.reduce((a, b) => a + b, 0) / window.length);
    }
    return result;
}

function findPeaks(values, minProminence) {
    const peaks = [];
    for (let i = 1; i < values.length - 1; i++) {
        // Lokales Minimum (Y geht nach unten = Arm geht nach oben)
        if (values[i] < values[i - 1] && values[i] < values[i + 1]) {
            const prominence = Math.min(values[i - 1] - values[i], values[i + 1] - values[i]);
            if (prominence >= minProminence) {
                peaks.push(i);
            }
        }
    }
    return peaks;
}

/**
 * Erstellt eine Konsistenz-Timeline als HTML.
 * @param {Array} scoredRepetitions - Repetitions mit consistencyScore
 * @returns {string} - HTML-String
 */
export function renderConsistencyTimeline(scoredRepetitions) {
    if (!scoredRepetitions || scoredRepetitions.length === 0) {
        return '<p class="text-sm text-gray-500">Keine Wiederholungen erkannt</p>';
    }

    const bars = scoredRepetitions.map((rep, idx) => {
        const score = rep.consistencyScore;
        let color;
        if (score >= 80) color = 'bg-green-500';
        else if (score >= 50) color = 'bg-yellow-500';
        else color = 'bg-red-500';

        return `
            <div class="flex flex-col items-center" title="Wiederholung ${idx + 1}: ${score}%">
                <div class="w-3 rounded-t ${color}" style="height: ${Math.max(4, score * 0.4)}px"></div>
                <span class="text-[9px] text-gray-400 mt-0.5">${idx + 1}</span>
            </div>
        `;
    }).join('');

    return `
        <div class="flex items-end gap-1 p-2 bg-gray-900 rounded-lg overflow-x-auto">
            ${bars}
        </div>
    `;
}

/**
 * Erstellt die Zusammenfassung als HTML.
 */
export function renderMovementSummary(analysis) {
    if (!analysis || !analysis.summary) {
        return '<p class="text-sm text-gray-500">Keine Analyse verfügbar</p>';
    }

    const s = analysis.summary;
    const fatigueClass = s.fatigueDetected ? 'text-red-400' : 'text-green-400';
    const fatigueText = s.fatigueDetected ? 'Ermüdung erkannt' : 'Keine Ermüdung';

    let deviationsHtml = '';
    if (s.commonDeviations && s.commonDeviations.length > 0) {
        deviationsHtml = `
            <div class="mt-2">
                <span class="text-xs text-gray-400">Häufige Abweichungen:</span>
                ${s.commonDeviations.map(d => `
                    <div class="text-xs text-yellow-300 mt-1">
                        <i class="fas fa-exclamation-triangle mr-1"></i>
                        ${d.description} (${d.frequency}% der Wiederholungen)
                    </div>
                `).join('')}
            </div>
        `;
    }

    return `
        <div class="text-sm space-y-1.5">
            <div class="flex justify-between">
                <span class="text-gray-400">Wiederholungen:</span>
                <span class="font-medium">${s.totalRepetitions}</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Durchschnitt:</span>
                <span class="font-medium">${s.averageConsistency}%</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Bester Schlag:</span>
                <span class="font-medium text-green-400">${s.bestScore}%</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Schlechtester:</span>
                <span class="font-medium text-red-400">${s.worstScore}%</span>
            </div>
            <div class="flex justify-between">
                <span class="text-gray-400">Ermüdung:</span>
                <span class="font-medium ${fatigueClass}">${fatigueText}</span>
            </div>
            ${deviationsHtml}
        </div>
    `;
}

// Export für globalen Zugriff
window.videoAIMovementQuality = {
    analyzeBallMachineSession,
    renderConsistencyTimeline,
    renderMovementSummary
};

export default {
    analyzeBallMachineSession,
    renderConsistencyTimeline,
    renderMovementSummary
};
