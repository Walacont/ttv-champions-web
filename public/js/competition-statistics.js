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

// Chart instance (global to allow cleanup)
let competitionActivityChart = null;

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

        // Collect player IDs and coach IDs
        usersSnapshot.forEach(doc => {
            const user = doc.data();
            if (currentSubgroupFilter === 'all' ||
                (user.subgroupIDs && user.subgroupIDs.includes(currentSubgroupFilter))) {
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

        // Group by month
        const monthlyStats = groupByMonth(matchData);

        // Calculate metrics
        const metrics = calculateMetrics(monthlyStats);

        // Render UI
        renderCompetitionMetrics(metrics);
        renderCompetitionChart(monthlyStats);

        // Add filter toggle listeners
        setupFilterToggles(monthlyStats);

    } catch (error) {
        console.error('Error loading competition statistics:', error);
    }
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
            month: date.toLocaleString('de-DE', { month: 'short', year: '2-digit' }),
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
 * Calculate summary metrics
 */
function calculateMetrics(monthlyStats) {
    const totalCompetitions = monthlyStats.reduce((sum, m) => sum + m.total, 0);
    const avgPerMonth = totalCompetitions > 0 ? Math.round(totalCompetitions / 12) : 0;

    // Find most active month
    const mostActiveMonth = monthlyStats.reduce((max, current) =>
        current.total > max.total ? current : max
    , monthlyStats[0]);

    // Calculate trend (comparing last 6 months to previous 6 months)
    const recentMonths = monthlyStats.slice(6);
    const previousMonths = monthlyStats.slice(0, 6);

    const recentTotal = recentMonths.reduce((sum, m) => sum + m.total, 0);
    const previousTotal = previousMonths.reduce((sum, m) => sum + m.total, 0);

    let trend = 'neutral';
    if (recentTotal > previousTotal) trend = 'up';
    else if (recentTotal < previousTotal) trend = 'down';

    const trendPercent = previousTotal > 0
        ? Math.round(((recentTotal - previousTotal) / previousTotal) * 100)
        : 0;

    return {
        totalCompetitions,
        avgPerMonth,
        mostActiveMonth: {
            name: mostActiveMonth.month,
            count: mostActiveMonth.total,
        },
        trend,
        trendPercent,
    };
}

/**
 * Render competition metrics summary
 */
function renderCompetitionMetrics(metrics) {
    const totalEl = document.getElementById('stats-competition-total');
    const avgEl = document.getElementById('stats-competition-avg');
    const activeMonthEl = document.getElementById('stats-competition-active-month');
    const trendEl = document.getElementById('stats-competition-trend');

    if (totalEl) totalEl.textContent = metrics.totalCompetitions;
    if (avgEl) avgEl.textContent = metrics.avgPerMonth;
    if (activeMonthEl) {
        activeMonthEl.textContent = `${metrics.mostActiveMonth.name} (${metrics.mostActiveMonth.count})`;
    }
    if (trendEl) {
        const trendIcon = metrics.trend === 'up' ? '↗️' : metrics.trend === 'down' ? '↘️' : '➡️';
        const trendClass = metrics.trend === 'up' ? 'text-green-600' : metrics.trend === 'down' ? 'text-red-600' : 'text-gray-600';
        trendEl.innerHTML = `<span class="${trendClass}">${trendIcon} ${Math.abs(metrics.trendPercent)}%</span>`;
    }
}

/**
 * Render competition activity chart
 */
function renderCompetitionChart(monthlyStats, filterMode = 'all') {
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
                data: monthlyStats.map(m => m.singles),
                backgroundColor: 'rgba(34, 197, 94, 0.8)',
                borderColor: 'rgba(34, 197, 94, 1)',
                borderWidth: 1,
            },
            {
                label: 'Doppel',
                data: monthlyStats.map(m => m.doubles),
                backgroundColor: 'rgba(59, 130, 246, 0.8)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
            },
        ];
    } else if (filterMode === 'coach') {
        datasets = [
            {
                label: 'Von Trainern',
                data: monthlyStats.map(m => m.byCoach),
                backgroundColor: 'rgba(139, 92, 246, 0.8)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
            },
        ];
    } else if (filterMode === 'player') {
        datasets = [
            {
                label: 'Von Spielern',
                data: monthlyStats.map(m => m.byPlayer),
                backgroundColor: 'rgba(234, 179, 8, 0.8)',
                borderColor: 'rgba(234, 179, 8, 1)',
                borderWidth: 1,
            },
        ];
    } else if (filterMode === 'comparison') {
        datasets = [
            {
                label: 'Von Trainern',
                data: monthlyStats.map(m => m.byCoach),
                backgroundColor: 'rgba(139, 92, 246, 0.8)',
                borderColor: 'rgba(139, 92, 246, 1)',
                borderWidth: 1,
            },
            {
                label: 'Von Spielern',
                data: monthlyStats.map(m => m.byPlayer),
                backgroundColor: 'rgba(234, 179, 8, 0.8)',
                borderColor: 'rgba(234, 179, 8, 1)',
                borderWidth: 1,
            },
        ];
    }

    competitionActivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthlyStats.map(m => m.month),
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
                            const data = monthlyStats[index];
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
 * Setup filter toggle buttons
 */
function setupFilterToggles(monthlyStats) {
    const filters = ['all', 'coach', 'player', 'comparison'];

    filters.forEach(filter => {
        const button = document.getElementById(`competition-filter-${filter}`);
        if (button) {
            button.addEventListener('click', () => {
                // Update active state
                filters.forEach(f => {
                    const btn = document.getElementById(`competition-filter-${f}`);
                    if (btn) {
                        btn.classList.remove('bg-indigo-600', 'text-white');
                        btn.classList.add('bg-gray-200', 'text-gray-700');
                    }
                });

                button.classList.remove('bg-gray-200', 'text-gray-700');
                button.classList.add('bg-indigo-600', 'text-white');

                // Re-render chart with filter
                renderCompetitionChart(monthlyStats, filter);
            });
        }
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
