/**
 * Training Statistics Module (Supabase Version)
 * Provides Strava-like training statistics with heatmap and monthly comparisons
 */

/**
 * Initialize training statistics display
 * Non-blocking: Loads data in background
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Current user's data
 */
export function initializeTrainingStats(supabase, currentUserData) {
    // Show loading state immediately
    displayLoadingState();

    // Load data in background (non-blocking)
    loadAndDisplayTrainingStats(supabase, currentUserData).catch(error => {
        console.error('[Training Stats] Error initializing:', error);
        displayError();
    });
}

/**
 * Load and display training statistics
 * @private
 */
async function loadAndDisplayTrainingStats(supabase, currentUserData) {
    try {
        // Get training dates for the last 12 months
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        const trainingDates = await getTrainingDates(
            supabase,
            currentUserData.id,
            currentUserData.clubId,
            oneYearAgo
        );

        // Calculate statistics
        const stats = calculateStatistics(trainingDates);

        // Update UI
        updateStatsUI(stats);

        // Draw heatmap
        drawHeatmap(trainingDates);
    } catch (error) {
        console.error('[Training Stats] Error loading data:', error);
        throw error;
    }
}

/**
 * Get all training dates where player was present
 * @param {Object} supabase - Supabase client instance
 * @param {string} playerId - Player ID
 * @param {string} clubId - Club ID
 * @param {Date} since - Start date
 * @returns {Promise<Array>} Array of date strings (YYYY-MM-DD)
 */
async function getTrainingDates(supabase, playerId, clubId, since) {
    try {
        const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

        const { data, error } = await supabase
            .from('attendance')
            .select('date, present_player_ids')
            .eq('club_id', clubId)
            .gte('date', sinceStr)
            .contains('present_player_ids', [playerId]);

        if (error) throw error;

        // Extract dates where player was present
        const dates = (data || [])
            .filter(record => record.present_player_ids?.includes(playerId))
            .map(record => record.date);

        return dates.sort(); // Sort chronologically
    } catch (error) {
        console.error('[Training Stats] Error fetching training dates:', error);
        return [];
    }
}

/**
 * Calculate statistics from training dates
 * @param {Array} trainingDates - Array of date strings
 * @returns {Object} Statistics object
 */
function calculateStatistics(trainingDates) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Get last month
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Count trainings per month
    let currentMonthCount = 0;
    let lastMonthCount = 0;

    trainingDates.forEach(dateStr => {
        const date = new Date(dateStr + 'T12:00:00');
        const month = date.getMonth();
        const year = date.getFullYear();

        if (year === currentYear && month === currentMonth) {
            currentMonthCount++;
        } else if (year === lastMonthYear && month === lastMonth) {
            lastMonthCount++;
        }
    });

    // Calculate trend
    let trend = 'neutral';
    let trendPercentage = 0;

    if (lastMonthCount > 0) {
        const change = currentMonthCount - lastMonthCount;
        trendPercentage = Math.round((change / lastMonthCount) * 100);

        if (change > 0) trend = 'up';
        else if (change < 0) trend = 'down';
    } else if (currentMonthCount > 0) {
        trend = 'up';
        trendPercentage = 100;
    }

    // Calculate weekly average (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

    const recentTrainings = trainingDates.filter(d => d >= fourWeeksAgoStr);
    const weeklyAverage = (recentTrainings.length / 4).toFixed(1);

    return {
        currentMonthCount,
        lastMonthCount,
        trend,
        trendPercentage,
        weeklyAverage,
        totalDays: trainingDates.length,
    };
}

/**
 * Update statistics UI
 * @param {Object} stats - Statistics object
 */
function updateStatsUI(stats) {
    // Current month count
    const currentMonthEl = document.getElementById('stats-current-month');
    if (currentMonthEl) {
        currentMonthEl.textContent = stats.currentMonthCount;
    }

    // Last month count
    const lastMonthEl = document.getElementById('stats-last-month');
    if (lastMonthEl) {
        lastMonthEl.textContent = stats.lastMonthCount;
    }

    // Trend indicator
    const trendEl = document.getElementById('stats-trend');
    if (trendEl) {
        let trendHTML = '';
        let trendColor = 'text-gray-600';

        if (stats.trend === 'up') {
            trendColor = 'text-green-600';
            trendHTML = `<svg class="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
            </svg> +${Math.abs(stats.trendPercentage)}%`;
        } else if (stats.trend === 'down') {
            trendColor = 'text-red-600';
            trendHTML = `<svg class="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l2.293-2.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg> ${stats.trendPercentage}%`;
        } else {
            trendHTML = `<svg class="w-5 h-5 inline" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/>
            </svg> ±0%`;
        }

        trendEl.innerHTML = trendHTML;
        trendEl.className = `text-sm font-semibold ${trendColor}`;
    }

    // Weekly average
    const weeklyAvgEl = document.getElementById('stats-weekly-avg');
    if (weeklyAvgEl) {
        weeklyAvgEl.textContent = `${stats.weeklyAverage}x pro Woche`;
    }
}

/**
 * Draw GitHub-style heatmap
 * @param {Array} trainingDates - Array of date strings
 */
function drawHeatmap(trainingDates) {
    const container = document.getElementById('training-heatmap');
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    // Create date map for quick lookup
    const dateMap = new Set(trainingDates);

    // Calculate date range (last 52 weeks)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 52 * 7); // 52 weeks ago

    // Find first Sunday
    while (startDate.getDay() !== 0) {
        startDate.setDate(startDate.getDate() - 1);
    }

    // Build heatmap data
    const weeks = [];
    let currentWeek = [];
    const currentDate = new Date(startDate);

    while (currentDate <= now) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const hasTraining = dateMap.has(dateStr);

        currentWeek.push({
            date: dateStr,
            hasTraining,
            dayOfWeek: currentDate.getDay(),
        });

        // Start new week on Sunday
        if (currentDate.getDay() === 6) {
            weeks.push(currentWeek);
            currentWeek = [];
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Add remaining days
    if (currentWeek.length > 0) {
        weeks.push(currentWeek);
    }

    // Create SVG
    const cellSize = 12;
    const cellGap = 3;
    const width = weeks.length * (cellSize + cellGap);
    const height = 7 * (cellSize + cellGap);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Draw cells
    weeks.forEach((week, weekIndex) => {
        week.forEach(day => {
            const x = weekIndex * (cellSize + cellGap);
            const y = day.dayOfWeek * (cellSize + cellGap);

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', cellSize);
            rect.setAttribute('height', cellSize);
            rect.setAttribute('rx', 2);

            // Color based on training
            if (day.hasTraining) {
                rect.setAttribute('fill', '#10b981'); // green-500
                rect.setAttribute('class', 'hover:opacity-80 cursor-pointer');
            } else {
                rect.setAttribute('fill', '#e5e7eb'); // gray-200
                rect.setAttribute('class', 'hover:opacity-80');
            }

            // Tooltip
            const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = `${day.date}${day.hasTraining ? ' - Training' : ''}`;
            rect.appendChild(title);

            svg.appendChild(rect);
        });
    });

    // Add month labels
    const monthLabels = [
        'Jan',
        'Feb',
        'Mär',
        'Apr',
        'Mai',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Okt',
        'Nov',
        'Dez',
    ];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
        if (week.length === 0) return;

        const firstDay = new Date(week[0].date + 'T12:00:00');
        const month = firstDay.getMonth();

        if (month !== lastMonth && weekIndex > 0) {
            const x = weekIndex * (cellSize + cellGap);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', -5);
            text.setAttribute('font-size', '10');
            text.setAttribute('fill', '#6b7280'); // gray-500
            text.textContent = monthLabels[month];

            svg.appendChild(text);
            lastMonth = month;
        }
    });

    container.appendChild(svg);

    // Add legend
    const legend = document.createElement('div');
    legend.className = 'flex items-center gap-2 mt-3 text-xs text-gray-600';
    legend.innerHTML = `
        <span>Weniger</span>
        <div class="w-3 h-3 bg-gray-200 rounded-sm"></div>
        <div class="w-3 h-3 bg-green-500 rounded-sm"></div>
        <span>Mehr</span>
    `;
    container.appendChild(legend);
}

/**
 * Display loading state
 */
function displayLoadingState() {
    const currentMonthEl = document.getElementById('stats-current-month');
    const lastMonthEl = document.getElementById('stats-last-month');
    const trendEl = document.getElementById('stats-trend');

    if (currentMonthEl) currentMonthEl.textContent = '...';
    if (lastMonthEl) lastMonthEl.textContent = '...';
    if (trendEl) trendEl.textContent = 'Lädt...';
}

/**
 * Display error message
 */
function displayError() {
    const currentMonthEl = document.getElementById('stats-current-month');
    const lastMonthEl = document.getElementById('stats-last-month');
    const trendEl = document.getElementById('stats-trend');

    if (currentMonthEl) currentMonthEl.textContent = '-';
    if (lastMonthEl) lastMonthEl.textContent = '-';
    if (trendEl) {
        trendEl.textContent = 'Fehler';
        trendEl.className = 'text-sm text-red-600';
    }

    const heatmap = document.getElementById('training-heatmap');
    if (heatmap) {
        heatmap.innerHTML =
            '<p class="text-sm text-red-600">Daten konnten nicht geladen werden</p>';
    }
}
