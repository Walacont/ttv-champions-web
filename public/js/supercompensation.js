/**
 * Supercompensation Module
 * Tracks training frequency and visualizes optimal training windows
 * Based on sports science principles of supercompensation
 */

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

// Training phases based on sports science
const PHASES = {
    FATIGUE: {
        name: 'Erholung',
        emoji: '😴',
        color: '#ef4444', // red
        recommendation: 'Gib deinem Körper Zeit zur Erholung. Leichtes Training oder Pause empfohlen.',
        minHours: 0,
        maxHours: 24
    },
    RECOVERY: {
        name: 'Bereit',
        emoji: '💪',
        color: '#22c55e', // green
        recommendation: 'Perfekter Zeitpunkt! Dein Körper ist optimal erholt für das nächste Training.',
        minHours: 24,
        maxHours: 72
    },
    SUPERCOMPENSATION: {
        name: 'Optimal',
        emoji: '🔥',
        color: '#10b981', // emerald
        recommendation: 'Jetzt trainieren! Du bist in der Superkompensations-Phase - maximale Leistungsfähigkeit!',
        minHours: 36,
        maxHours: 60
    },
    DECONDITIONING: {
        name: 'Dekonditionierung',
        emoji: '⚠️',
        color: '#f59e0b', // amber
        recommendation: 'Trainingseffekt lässt nach. Plane bald dein nächstes Training, um den Fortschritt zu erhalten!',
        minHours: 72,
        maxHours: 168
    },
    LOSS: {
        name: 'Trainingsrückstand',
        emoji: '🚨',
        color: '#dc2626', // red-600
        recommendation: 'Lange Pause! Zeit für ein neues Training, um wieder in den Rhythmus zu kommen.',
        minHours: 168,
        maxHours: Infinity
    }
};

/**
 * Initialize supercompensation display
 * Non-blocking: Loads data in background
 * @param {Object} db - Firestore database instance
 * @param {Object} currentUserData - Current user's data
 */
export function initializeSupercompensation(db, currentUserData) {
    // Show loading state immediately
    displayLoadingState();

    // Load data in background (non-blocking)
    loadAndDisplaySupercompensation(db, currentUserData)
        .catch(error => {
            displayError();
        });
}

/**
 * Load and display supercompensation data
 * @private
 */
async function loadAndDisplaySupercompensation(db, currentUserData) {
    try {
        // Get last training date
        const lastTraining = await getLastTraining(db, currentUserData.id, currentUserData.clubId);

        if (!lastTraining) {
            displayNoTrainingData();
            return;
        }

        // Calculate hours since last training
        const hoursSince = calculateHoursSince(lastTraining.date);

        // Determine current phase
        const phase = determinePhase(hoursSince);

        // Update UI
        updateSupercompensationUI(lastTraining, hoursSince, phase);

        // Draw visualization
        drawSupercompensationCurve(hoursSince);
    } catch (error) {
        throw error;
    }
}

/**
 * Get the last training session where the player was present
 * @param {Object} db - Firestore database instance
 * @param {string} playerId - Player ID
 * @param {string} clubId - Club ID
 * @returns {Promise<Object|null>} Last training data or null
 */
async function getLastTraining(db, playerId, clubId) {
    try {
        // Query attendance records where player was present
        const q = query(
            collection(db, 'attendance'),
            where('clubId', '==', clubId),
            where('presentPlayerIds', 'array-contains', playerId),
            orderBy('date', 'desc'),
            limit(1)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            return null;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        return {
            id: doc.id,
            date: data.date,
            subgroupId: data.subgroupId
        };
    } catch (error) {
        return null;
    }
}

/**
 * Calculate hours since a given date (YYYY-MM-DD)
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {number} Hours since the date
 */
function calculateHoursSince(dateString) {
    const trainingDate = new Date(dateString + 'T12:00:00'); // Assume midday
    const now = new Date();
    const diffMs = now - trainingDate;
    const diffHours = diffMs / (1000 * 60 * 60);

    return Math.max(0, diffHours); // Never negative
}

/**
 * Determine which phase the player is in based on hours since last training
 * @param {number} hours - Hours since last training
 * @returns {Object} Phase object
 */
function determinePhase(hours) {
    // Special case: Peak supercompensation window (36-60h)
    if (hours >= PHASES.SUPERCOMPENSATION.minHours && hours <= PHASES.SUPERCOMPENSATION.maxHours) {
        return PHASES.SUPERCOMPENSATION;
    }

    // Check all phases in order
    for (const phase of Object.values(PHASES)) {
        if (hours >= phase.minHours && hours < phase.maxHours) {
            return phase;
        }
    }

    // Default to LOSS if beyond all phases
    return PHASES.LOSS;
}

/**
 * Update the UI with supercompensation data
 * @param {Object} lastTraining - Last training data
 * @param {number} hoursSince - Hours since last training
 * @param {Object} phase - Current phase
 */
function updateSupercompensationUI(lastTraining, hoursSince, phase) {
    // Format last training date
    const trainingDate = new Date(lastTraining.date + 'T12:00:00');
    const formattedDate = trainingDate.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    document.getElementById('supercomp-last-training').textContent = formattedDate;

    // Calculate days ago
    const daysAgo = Math.floor(hoursSince / 24);
    let daysAgoText = '';
    if (daysAgo === 0) {
        daysAgoText = 'Heute';
    } else if (daysAgo === 1) {
        daysAgoText = 'Gestern';
    } else {
        daysAgoText = `vor ${daysAgo} Tagen`;
    }
    document.getElementById('supercomp-days-ago').textContent = daysAgoText;

    // Update status
    const statusDiv = document.getElementById('supercomp-status');
    statusDiv.innerHTML = `
        <span class="text-2xl">${phase.emoji}</span>
        <span class="text-lg font-semibold" style="color: ${phase.color};">${phase.name}</span>
    `;

    // Update recommendation
    document.getElementById('supercomp-recommendation').textContent = phase.recommendation;
}

/**
 * Display loading state while data is being fetched
 */
function displayLoadingState() {
    // Elements already show "Lade..." from HTML, so we can keep it simple
    // Or optionally update with a more explicit loading message
    const statusDiv = document.getElementById('supercomp-status');
    if (statusDiv) {
        statusDiv.innerHTML = `
            <span class="text-2xl">⏳</span>
            <span class="text-lg font-semibold text-gray-600">Lädt...</span>
        `;
    }
}

/**
 * Display message when no training data is available
 */
function displayNoTrainingData() {
    document.getElementById('supercomp-last-training').textContent = 'Noch kein Training';
    document.getElementById('supercomp-days-ago').textContent = '';

    const statusDiv = document.getElementById('supercomp-status');
    statusDiv.innerHTML = `
        <span class="text-2xl">🎯</span>
        <span class="text-lg font-semibold text-gray-600">Bereit zu starten</span>
    `;

    document.getElementById('supercomp-recommendation').textContent =
        'Beginne mit deinem ersten Training, um deinen Fortschritt zu tracken!';

    // Draw neutral curve
    drawSupercompensationCurve(0);
}

/**
 * Display error message
 */
function displayError() {
    document.getElementById('supercomp-last-training').textContent = 'Fehler';
    document.getElementById('supercomp-days-ago').textContent = '';

    const statusDiv = document.getElementById('supercomp-status');
    statusDiv.innerHTML = `
        <span class="text-2xl">❌</span>
        <span class="text-lg font-semibold text-red-600">Ladefehler</span>
    `;

    document.getElementById('supercomp-recommendation').textContent =
        'Daten konnten nicht geladen werden. Bitte versuche es später erneut.';
}

/**
 * Draw the supercompensation curve as SVG
 * @param {number} currentHours - Current hours since last training
 */
function drawSupercompensationCurve(currentHours) {
    const container = document.getElementById('supercomp-chart');
    if (!container) return;

    const width = container.offsetWidth || 300;
    const height = 192; // h-48 = 12rem = 192px

    // Clear previous content
    container.innerHTML = '';

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Define curve points (based on supercompensation theory)
    // X-axis: 0-96 hours
    // Y-axis: performance level (baseline at 50%)

    const baseline = height * 0.5; // Baseline performance
    const points = [
        { hours: 0, performance: baseline }, // Start (100%)
        { hours: 12, performance: baseline + 20 }, // Fatigue dip
        { hours: 24, performance: baseline }, // Return to baseline
        { hours: 48, performance: baseline - 30 }, // Supercompensation peak
        { hours: 72, performance: baseline - 15 }, // Still elevated
        { hours: 96, performance: baseline } // Return to baseline
    ];

    // Scale points to SVG coordinates
    const maxHours = 96;
    const scaleX = (hours) => (hours / maxHours) * width;
    const scaleY = (perf) => perf;

    // Create path for curve
    const pathData = points.map((point, index) => {
        const x = scaleX(point.hours);
        const y = scaleY(point.performance);
        return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');

    // Draw baseline
    const baselinePath = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    baselinePath.setAttribute('x1', 0);
    baselinePath.setAttribute('y1', baseline);
    baselinePath.setAttribute('x2', width);
    baselinePath.setAttribute('y2', baseline);
    baselinePath.setAttribute('stroke', '#e5e7eb'); // gray-200
    baselinePath.setAttribute('stroke-width', 2);
    baselinePath.setAttribute('stroke-dasharray', '5,5');
    svg.appendChild(baselinePath);

    // Draw curve
    const curvePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    curvePath.setAttribute('d', pathData);
    curvePath.setAttribute('fill', 'none');
    curvePath.setAttribute('stroke', '#10b981'); // green-500
    curvePath.setAttribute('stroke-width', 3);
    curvePath.setAttribute('stroke-linecap', 'round');
    curvePath.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(curvePath);

    // Draw area under curve (gradient fill)
    const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const areaData = pathData + ` L ${width} ${height} L 0 ${height} Z`;
    areaPath.setAttribute('d', areaData);
    areaPath.setAttribute('fill', 'rgba(16, 185, 129, 0.1)'); // green with opacity
    svg.insertBefore(areaPath, curvePath);

    // Mark current position
    if (currentHours > 0 && currentHours <= maxHours) {
        const currentX = scaleX(currentHours);

        // Find Y position by interpolating between points
        let currentY = baseline;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            if (currentHours >= p1.hours && currentHours <= p2.hours) {
                const t = (currentHours - p1.hours) / (p2.hours - p1.hours);
                currentY = p1.performance + t * (p2.performance - p1.performance);
                break;
            }
        }

        // Draw vertical line at current position
        const currentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        currentLine.setAttribute('x1', currentX);
        currentLine.setAttribute('y1', 0);
        currentLine.setAttribute('x2', currentX);
        currentLine.setAttribute('y2', height);
        currentLine.setAttribute('stroke', '#ef4444'); // red-500
        currentLine.setAttribute('stroke-width', 2);
        currentLine.setAttribute('stroke-dasharray', '5,5');
        svg.appendChild(currentLine);

        // Draw marker circle
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        marker.setAttribute('cx', currentX);
        marker.setAttribute('cy', currentY);
        marker.setAttribute('r', 6);
        marker.setAttribute('fill', '#ef4444'); // red-500
        marker.setAttribute('stroke', 'white');
        marker.setAttribute('stroke-width', 2);
        svg.appendChild(marker);

        // Add "Du bist hier" label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', currentX);
        label.setAttribute('y', currentY - 15);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', '#ef4444');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', 'bold');
        label.textContent = 'Du';
        svg.appendChild(label);
    }

    // Add phase regions (subtle background colors)
    const regions = [
        { start: 0, end: 24, color: 'rgba(239, 68, 68, 0.05)' }, // Fatigue - red
        { start: 24, end: 72, color: 'rgba(16, 185, 129, 0.1)' }, // Optimal - green
        { start: 72, end: 96, color: 'rgba(245, 158, 11, 0.05)' } // Deconditioning - amber
    ];

    regions.forEach(region => {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', scaleX(region.start));
        rect.setAttribute('y', 0);
        rect.setAttribute('width', scaleX(region.end) - scaleX(region.start));
        rect.setAttribute('height', height);
        rect.setAttribute('fill', region.color);
        svg.insertBefore(rect, areaPath);
    });

    container.appendChild(svg);
}
