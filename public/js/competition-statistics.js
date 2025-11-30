/**
 * Competition Statistics Module
 * Displays monthly competition activity with trainer/player filter
 */

import {
    collection,
    query,
    where,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { isAgeGroupFilter, calculateAge, isInAgeGroup } from './ui-utils.js';

// Chart instance (global to allow cleanup)
let competitionActivityChart = null;

// Current filter states
let currentMatchData = [];
let currentPeriod = 'month';
let currentTypeFilter = 'all';
let filtersInitialized = false;

/**
 * Load competition statistics
 * @param {Object} userData - Current coach user data
 * @param {Object} db - Firestore database instance
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export async function loadCompetitionStatistics(userData, db, currentSubgroupFilter = 'all') {
    try {
        // Get all players from the club for filtering
        const usersRef = collection(db, 'users');
        const usersQuery = query(
            usersRef,
            where('clubId', '==', userData.clubId),
            where('role', '==', 'player')
        );
        const usersSnapshot = await getDocs(usersQuery);

        const playerIds = [];
        const coachIds = [];

        // Collect player IDs based on filter
        usersSnapshot.forEach(doc => {
            const user = doc.data();
            let includePlayer = false;

            if (currentSubgroupFilter === 'all') {
                includePlayer = true;
            } else if (isAgeGroupFilter(currentSubgroupFilter)) {
                const age = calculateAge(user.birthdate);
                includePlayer = isInAgeGroup(age, currentSubgroupFilter);
            } else {
                includePlayer = user.subgroupIDs && user.subgroupIDs.includes(currentSubgroupFilter);
            }

            if (includePlayer) {
                playerIds.push(doc.id);
            }
        });

        // Get coach IDs from club
        const coachQuery = query(
            usersRef,
            where('clubId', '==', userData.clubId),
            where('role', '==', 'coach')
        );
        const coachSnapshot = await getDocs(coachQuery);
        coachSnapshot.forEach(doc => {
            coachIds.push(doc.id);
        });

        // Fetch singles matches
        const matchesRef = collection(db, 'matches');
        const singlesQuery = query(
            matchesRef,
            where('clubId', '==', userData.clubId)
        );
        const singlesSnapshot = await getDocs(singlesQuery);

        // Fetch doubles matches
        const doublesMatchesRef = collection(db, 'doublesMatches');
        const doublesQuery = query(
            doublesMatchesRef,
            where('clubId', '==', userData.clubId)
        );
        const doublesSnapshot = await getDocs(doublesQuery);

        // Process all matches
        const matchData = [];

        singlesSnapshot.forEach(doc => {
            const data = doc.data();
            // Filter by subgroup - check if either player is in the filtered group
            if (currentSubgroupFilter === 'all' ||
                playerIds.includes(data.playerAId) ||
                playerIds.includes(data.playerBId)) {
                matchData.push({
                    type: 'single',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    reportedBy: data.reportedBy || '',
                    isCoachReported: coachIds.includes(data.reportedBy || ''),
                });
            }
        });

        doublesSnapshot.forEach(doc => {
            const data = doc.data();
            // Filter by subgroup
            if (currentSubgroupFilter === 'all' ||
                playerIds.includes(data.teamA?.player1Id) ||
                playerIds.includes(data.teamA?.player2Id) ||
                playerIds.includes(data.teamB?.player1Id) ||
                playerIds.includes(data.teamB?.player2Id)) {
                matchData.push({
                    type: 'double',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    reportedBy: data.reportedBy || '',
                    isCoachReported: coachIds.includes(data.reportedBy || ''),
                });
            }
        });

        // Store match data globally for filter changes
        currentMatchData = matchData;

        // Group by current period (respects filter state)
        const stats = groupByPeriod(matchData, currentPeriod);

        // Calculate metrics
        const metrics = calculateMetrics(stats, currentPeriod);

        // Render UI
        renderCompetitionMetrics(metrics, currentPeriod);
        renderCompetitionChart(stats, currentTypeFilter);

        // Add filter toggle listeners (only once)
        setupFilterToggles();

    } catch (error) {
        console.error('Error loading competition statistics:', error);
    }
}

/**
 * Group match data by specified period
 * @param {Array} matchData - Array of match objects
 * @param {string} period - 'week', 'month', or 'year'
 */
function groupByPeriod(matchData, period) {
    if (period === 'week') return groupByWeek(matchData);
    if (period === 'month') return groupByMonth(matchData);
    if (period === 'year') return groupByYear(matchData);
    return groupByMonth(matchData); // default
}

/**
 * Group match data by week for the last 12 weeks
 */
function groupByWeek(matchData) {
    const now = new Date();
    const weeksData = [];

    // Generate last 12 weeks
    for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i * 7) - now.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekNum = getWeekNumber(weekStart);
        const weekKey = `${weekStart.getFullYear()}-W${weekNum}`;

        weeksData.push({
            label: `KW ${weekNum}`,
            weekKey: weekKey,
            startDate: weekStart,
            endDate: weekEnd,
            total: 0,
            singles: 0,
            doubles: 0,
            byCoach: 0,
            byPlayer: 0,
        });
    }

    // Count matches per week
    matchData.forEach(match => {
        const matchDate = match.createdAt;
        const weekEntry = weeksData.find(w => matchDate >= w.startDate && matchDate <= w.endDate);

        if (weekEntry) {
            weekEntry.total++;
            if (match.type === 'single') weekEntry.singles++;
            else weekEntry.doubles++;
            if (match.isCoachReported) weekEntry.byCoach++;
            else weekEntry.byPlayer++;
        }
    });

    return weeksData;
}

/**
 * Group match data by month for the last 12 months
 */
function groupByMonth(matchData) {
    const now = new Date();
    const monthsData = [];

    // Generate last 12 months
    for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        monthsData.push({
            label: date.toLocaleString('de-DE', { month: 'short', year: '2-digit' }),
            monthKey: monthKey,
            date: date,
            total: 0,
            singles: 0,
            doubles: 0,
            byCoach: 0,
            byPlayer: 0,
        });
    }

    // Count matches per month
    matchData.forEach(match => {
        const matchDate = match.createdAt;
        const monthKey = `${matchDate.getFullYear()}-${String(matchDate.getMonth() + 1).padStart(2, '0')}`;

        const monthEntry = monthsData.find(m => m.monthKey === monthKey);
        if (monthEntry) {
            monthEntry.total++;

            if (match.type === 'single') {
                monthEntry.singles++;
            } else {
                monthEntry.doubles++;
            }

            if (match.isCoachReported) {
                monthEntry.byCoach++;
            } else {
                monthEntry.byPlayer++;
            }
        }
    });

    return monthsData;
}

/**
 * Group match data by year for the last 5 years
 */
function groupByYear(matchData) {
    const now = new Date();
    const yearsData = [];

    // Generate last 5 years
    for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const yearKey = `${year}`;

        yearsData.push({
            label: yearKey,
            yearKey: yearKey,
            year: year,
            total: 0,
            singles: 0,
            doubles: 0,
            byCoach: 0,
            byPlayer: 0,
        });
    }

    // Count matches per year
    matchData.forEach(match => {
        const matchDate = match.createdAt;
        const yearKey = `${matchDate.getFullYear()}`;

        const yearEntry = yearsData.find(y => y.yearKey === yearKey);
        if (yearEntry) {
            yearEntry.total++;

            if (match.type === 'single') {
                yearEntry.singles++;
            } else {
                yearEntry.doubles++;
            }

            if (match.isCoachReported) {
                yearEntry.byCoach++;
            } else {
                yearEntry.byPlayer++;
            }
        }
    });

    return yearsData;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Calculate summary metrics
 * @param {Array} stats - Grouped statistics data
 * @param {string} period - 'week', 'month', or 'year'
 */
function calculateMetrics(stats, period) {
    const totalCompetitions = stats.reduce((sum, m) => sum + m.total, 0);
    const count = stats.length;
    const avgPerPeriod = totalCompetitions > 0 ? Math.round(totalCompetitions / count) : 0;

    // Find most active period
    const mostActivePeriod = stats.reduce((max, current) =>
        current.total > max.total ? current : max
    , stats[0]);

    // Calculate trend (comparing last half to previous half)
    const halfPoint = Math.floor(count / 2);
    const recentPeriods = stats.slice(halfPoint);
    const previousPeriods = stats.slice(0, halfPoint);

    const recentTotal = recentPeriods.reduce((sum, m) => sum + m.total, 0);
    const previousTotal = previousPeriods.reduce((sum, m) => sum + m.total, 0);

    let trend = 'neutral';
    if (recentTotal > previousTotal) trend = 'up';
    else if (recentTotal < previousTotal) trend = 'down';

    const trendPercent = previousTotal > 0
        ? Math.round(((recentTotal - previousTotal) / previousTotal) * 100)
        : 0;

    return {
        totalCompetitions,
        avgPerPeriod,
        mostActivePeriod: {
            name: mostActivePeriod.label,
            count: mostActivePeriod.total,
        },
        trend,
        trendPercent,
        period,
    };
}

/**
 * Render competition metrics summary
 * @param {Object} metrics - Calculated metrics
 * @param {string} period - 'week', 'month', or 'year'
 */
function renderCompetitionMetrics(metrics, period) {
    const totalEl = document.getElementById('stats-competition-total');
    const avgEl = document.getElementById('stats-competition-avg');
    const avgLabelEl = document.getElementById('stats-competition-avg-label');
    const activePeriodEl = document.getElementById('stats-competition-active-period');
    const activePeriodLabelEl = document.getElementById('stats-competition-active-period-label');
    const trendEl = document.getElementById('stats-competition-trend');

    // Get period-specific labels
    const periodLabels = {
        week: { avg: 'Ø pro Woche', active: 'Aktivste Woche', total: '12 Wochen' },
        month: { avg: 'Ø pro Monat', active: 'Aktivster Monat', total: '12 Monate' },
        year: { avg: 'Ø pro Jahr', active: 'Aktivstes Jahr', total: '5 Jahre' },
    };

    const labels = periodLabels[period] || periodLabels.month;

    if (totalEl) totalEl.textContent = metrics.totalCompetitions;
    if (avgEl) avgEl.textContent = metrics.avgPerPeriod;
    if (avgLabelEl) avgLabelEl.textContent = labels.avg;
    if (activePeriodEl) {
        activePeriodEl.textContent = `${metrics.mostActivePeriod.name} (${metrics.mostActivePeriod.count})`;
    }
    if (activePeriodLabelEl) {
        activePeriodLabelEl.textContent = labels.active;
    }
    if (trendEl) {
        const trendIcon = metrics.trend === 'up' ? '↗️' : metrics.trend === 'down' ? '↘️' : '➡️';
        const trendClass = metrics.trend === 'up' ? 'text-green-600' : metrics.trend === 'down' ? 'text-red-600' : 'text-gray-600';
        trendEl.innerHTML = `<span class="${trendClass}">${trendIcon} ${Math.abs(metrics.trendPercent)}%</span>`;
    }

    // Update total label
    const totalLabelEl = document.getElementById('stats-competition-total-label');
    if (totalLabelEl) totalLabelEl.textContent = `Gesamt (${labels.total})`;
}

/**
 * Render competition activity chart
 * @param {Array} stats - Grouped statistics data
 * @param {string} filterMode - 'all', 'coach', 'player', or 'comparison'
 */
function renderCompetitionChart(stats, filterMode = 'all') {
    const ctx = document.getElementById('competition-activity-chart');
    if (!ctx) return;

    // Destroy previous chart if exists
    if (competitionActivityChart) {
        competitionActivityChart.destroy();
    }

    // Prepare data based on filter mode
    let datasets = [];

    if (filterMode === 'all') {
        datasets = [
            {
                label: 'Einzel',
                data: stats.map(m => m.singles),
                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1,
            },
            {
                label: 'Doppel',
                data: stats.map(m => m.doubles),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            },
        ];
    } else if (filterMode === 'coach') {
        datasets = [
            {
                label: 'Von Trainern',
                data: stats.map(m => m.byCoach),
                backgroundColor: 'rgba(139, 92, 246, 0.8)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
            },
        ];
    } else if (filterMode === 'player') {
        datasets = [
            {
                label: 'Von Spielern',
                data: stats.map(m => m.byPlayer),
                backgroundColor: 'rgba(234, 179, 8, 0.8)',
                borderColor: 'rgba(234, 179, 8, 1)',
                borderWidth: 1,
            },
        ];
    } else if (filterMode === 'comparison') {
        datasets = [
            {
                label: 'Von Trainern',
                data: stats.map(m => m.byCoach),
                backgroundColor: 'rgba(139, 92, 246, 0.8)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
            },
            {
                label: 'Von Spielern',
                data: stats.map(m => m.byPlayer),
                backgroundColor: 'rgba(234, 179, 8, 0.8)',
                borderColor: 'rgba(234, 179, 8, 1)',
                borderWidth: 1,
            },
        ];
    }

    competitionActivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: stats.map(m => m.label),
            datasets: datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        footer: (tooltipItems) => {
                            const index = tooltipItems[0].dataIndex;
                            const data = stats[index];
                            return `Gesamt: ${data.total}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

/**
 * Setup filter toggle buttons for both period and type filters
 */
function setupFilterToggles() {
    // Only initialize once to prevent duplicate event listeners
    if (filtersInitialized) {
        return;
    }
    filtersInitialized = true;

    // Period filters (week, month, year)
    const periods = ['week', 'month', 'year'];
    periods.forEach(period => {
        const button = document.getElementById(`competition-period-${period}`);
        if (!button) {
            console.warn(`Button not found: competition-period-${period}`);
            return;
        }

        button.addEventListener('click', () => {
            // Update active state for period buttons
            periods.forEach(p => {
                const btn = document.getElementById(`competition-period-${p}`);
                if (btn) {
                    btn.classList.remove('bg-blue-600', 'text-white');
                    btn.classList.add('bg-gray-200', 'text-gray-700');
                }
            });

            button.classList.remove('bg-gray-200', 'text-gray-700');
            button.classList.add('bg-blue-600', 'text-white');

            // Update current period
            currentPeriod = period;

            // Re-group data and re-render
            const stats = groupByPeriod(currentMatchData, period);
            const metrics = calculateMetrics(stats, period);
            renderCompetitionMetrics(metrics, period);
            renderCompetitionChart(stats, currentTypeFilter);
        });
    });

    // Type filters (all, coach, player, comparison)
    const typeFilters = ['all', 'coach', 'player', 'comparison'];
    typeFilters.forEach(filter => {
        const button = document.getElementById(`competition-filter-${filter}`);
        if (!button) {
            console.warn(`Button not found: competition-filter-${filter}`);
            return;
        }

        button.addEventListener('click', () => {
            // Update active state for type buttons
            typeFilters.forEach(f => {
                const btn = document.getElementById(`competition-filter-${f}`);
                if (btn) {
                    btn.classList.remove('bg-indigo-600', 'text-white');
                    btn.classList.add('bg-gray-200', 'text-gray-700');
                }
            });

            button.classList.remove('bg-gray-200', 'text-gray-700');
            button.classList.add('bg-indigo-600', 'text-white');

            // Update current type filter
            currentTypeFilter = filter;

            // Re-render chart with current stats
            const stats = groupByPeriod(currentMatchData, currentPeriod);
            renderCompetitionChart(stats, filter);
        });
    });
}

/**
 * Cleanup function to destroy chart
 */
export function cleanupCompetitionStatistics() {
    if (competitionActivityChart) {
        competitionActivityChart.destroy();
        competitionActivityChart = null;
    }
}
