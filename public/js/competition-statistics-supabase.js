/**
 * Wettkampf-Statistik-Modul
 * Zeigt monatliche Wettkampfaktivität mit Trainer/Spieler-Filter
 */

import { isAgeGroupFilter, calculateAge, isInAgeGroup, isGenderFilter } from './ui-utils-supabase.js';

// Chart-Instanz (global für Cleanup-Zugriff)
let competitionActivityChart = null;

let currentMatchData = [];
let currentPeriod = 'month';
let currentTypeFilter = 'all';
let filtersInitialized = false;

/**
 * Lädt Wettkampfstatistiken
 * @param {Object} userData - Aktueller Trainer-Benutzerdaten
 * @param {Object} supabase - Supabase-Client
 * @param {string} currentSubgroupFilter - Untergruppen-Filter
 */
export async function loadCompetitionStatistics(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        const { data: usersData, error: usersError } = await supabase
            .from('profiles')
            .select('id, role, subgroup_ids, birthdate, gender')
            .eq('club_id', userData.clubId)
            .eq('role', 'player');

        if (usersError) throw usersError;

        const playerIds = [];
        const coachIds = [];

        (usersData || []).forEach(user => {
            let includePlayer = false;

            if (currentSubgroupFilter === 'all') {
                includePlayer = true;
            } else if (isAgeGroupFilter(currentSubgroupFilter)) {
                const age = calculateAge(user.birthdate);
                includePlayer = isInAgeGroup(age, currentSubgroupFilter);
            } else if (isGenderFilter(currentSubgroupFilter)) {
                includePlayer = user.gender === currentSubgroupFilter;
            } else {
                includePlayer = user.subgroup_ids && user.subgroup_ids.includes(currentSubgroupFilter);
            }

            if (includePlayer) {
                playerIds.push(user.id);
            }
        });

        const { data: coachData, error: coachError } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', userData.clubId)
            .eq('role', 'coach');

        if (coachError) throw coachError;

        (coachData || []).forEach(coach => {
            coachIds.push(coach.id);
        });

        const { data: singlesData, error: singlesError } = await supabase
            .from('matches')
            .select('player_a_id, player_b_id, created_at, reported_by')
            .eq('club_id', userData.clubId);

        if (singlesError) throw singlesError;

        const { data: doublesData, error: doublesError } = await supabase
            .from('doubles_matches')
            .select('team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id, created_at, reported_by')
            .eq('club_id', userData.clubId);

        if (doublesError) throw doublesError;

        const matchData = [];

        (singlesData || []).forEach(data => {
            // Filter nach Untergruppe - mindestens ein Spieler muss in der Gruppe sein
            if (currentSubgroupFilter === 'all' ||
                playerIds.includes(data.player_a_id) ||
                playerIds.includes(data.player_b_id)) {
                matchData.push({
                    type: 'single',
                    createdAt: data.created_at ? new Date(data.created_at) : new Date(),
                    reportedBy: data.reported_by || '',
                    isCoachReported: coachIds.includes(data.reported_by || ''),
                });
            }
        });

        (doublesData || []).forEach(data => {
            if (currentSubgroupFilter === 'all' ||
                playerIds.includes(data.team_a_player1_id) ||
                playerIds.includes(data.team_a_player2_id) ||
                playerIds.includes(data.team_b_player1_id) ||
                playerIds.includes(data.team_b_player2_id)) {
                matchData.push({
                    type: 'double',
                    createdAt: data.created_at ? new Date(data.created_at) : new Date(),
                    reportedBy: data.reported_by || '',
                    isCoachReported: coachIds.includes(data.reported_by || ''),
                });
            }
        });

        // Match-Daten global speichern für Filteränderungen
        currentMatchData = matchData;

        // Nach aktuellem Zeitraum gruppieren (berücksichtigt Filterzustand)
        const stats = groupByPeriod(matchData, currentPeriod);

        const metrics = calculateMetrics(stats, currentPeriod);

        renderCompetitionMetrics(metrics, currentPeriod);
        renderCompetitionChart(stats, currentTypeFilter);

        // Filter-Toggle-Listener hinzufügen (nur einmal)
        setupFilterToggles();

    } catch (error) {
        console.error('Error loading competition statistics:', error);
    }
}

/**
 * Gruppiert Matches nach Zeitraum
 * @param {Array} matchData - Match-Objekte
 * @param {string} period - 'week', 'month' oder 'year'
 */
function groupByPeriod(matchData, period) {
    if (period === 'week') return groupByWeek(matchData);
    if (period === 'month') return groupByMonth(matchData);
    if (period === 'year') return groupByYear(matchData);
    return groupByMonth(matchData);
}

/**
 * Gruppiert Matches nach Wochen (letzte 12 Wochen)
 */
function groupByWeek(matchData) {
    const now = new Date();
    const weeksData = [];

    for (let i = 11; i >= 0; i--) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (i * 7) - now.getDay()); // Wochenstart = Sonntag
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
 * Gruppiert Matches nach Monaten (letzte 12 Monate)
 */
function groupByMonth(matchData) {
    const now = new Date();
    const monthsData = [];

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
 * Gruppiert Matches nach Jahren (letzte 5 Jahre)
 */
function groupByYear(matchData) {
    const now = new Date();
    const yearsData = [];

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
 * Berechnet ISO-Kalenderwoche
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Berechnet Zusammenfassungs-Metriken
 * @param {Array} stats - Gruppierte Statistikdaten
 * @param {string} period - 'week', 'month' oder 'year'
 */
function calculateMetrics(stats, period) {
    const totalCompetitions = stats.reduce((sum, m) => sum + m.total, 0);
    const count = stats.length;
    const avgPerPeriod = totalCompetitions > 0 ? Math.round(totalCompetitions / count) : 0;

    const mostActivePeriod = stats.reduce((max, current) =>
        current.total > max.total ? current : max
    , stats[0]);

    // Trend-Berechnung: Vergleich zweite Hälfte mit erster Hälfte
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
 * Rendert Wettkampf-Metriken
 * @param {Object} metrics - Berechnete Metriken
 * @param {string} period - 'week', 'month' oder 'year'
 */
function renderCompetitionMetrics(metrics, period) {
    const totalEl = document.getElementById('stats-competition-total');
    const avgEl = document.getElementById('stats-competition-avg');
    const avgLabelEl = document.getElementById('stats-competition-avg-label');
    const activePeriodEl = document.getElementById('stats-competition-active-period');
    const activePeriodLabelEl = document.getElementById('stats-competition-active-period-label');
    const trendEl = document.getElementById('stats-competition-trend');

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

    const totalLabelEl = document.getElementById('stats-competition-total-label');
    if (totalLabelEl) totalLabelEl.textContent = `Gesamt (${labels.total})`;
}

/**
 * Rendert Wettkampfaktivitäts-Chart
 * @param {Array} stats - Gruppierte Statistikdaten
 * @param {string} filterMode - 'all', 'coach', 'player' oder 'comparison'
 */
function renderCompetitionChart(stats, filterMode = 'all') {
    const ctx = document.getElementById('competition-activity-chart');
    if (!ctx) return;

    if (competitionActivityChart) {
        competitionActivityChart.destroy();
    }

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
 * Initialisiert Filter-Toggle-Buttons
 */
function setupFilterToggles() {
    // Nur einmal initialisieren um doppelte Event-Listener zu vermeiden
    if (filtersInitialized) {
        return;
    }
    filtersInitialized = true;

    const periods = ['week', 'month', 'year'];
    periods.forEach(period => {
        const button = document.getElementById(`competition-period-${period}`);
        if (!button) {
            console.warn(`Button not found: competition-period-${period}`);
            return;
        }

        button.addEventListener('click', () => {
            periods.forEach(p => {
                const btn = document.getElementById(`competition-period-${p}`);
                if (btn) {
                    btn.classList.remove('bg-blue-600', 'text-white');
                    btn.classList.add('bg-gray-200', 'text-gray-700');
                }
            });

            button.classList.remove('bg-gray-200', 'text-gray-700');
            button.classList.add('bg-blue-600', 'text-white');

            currentPeriod = period;

            const stats = groupByPeriod(currentMatchData, period);
            const metrics = calculateMetrics(stats, period);
            renderCompetitionMetrics(metrics, period);
            renderCompetitionChart(stats, currentTypeFilter);
        });
    });

    const typeFilters = ['all', 'coach', 'player', 'comparison'];
    typeFilters.forEach(filter => {
        const button = document.getElementById(`competition-filter-${filter}`);
        if (!button) {
            console.warn(`Button not found: competition-filter-${filter}`);
            return;
        }

        button.addEventListener('click', () => {
            typeFilters.forEach(f => {
                const btn = document.getElementById(`competition-filter-${f}`);
                if (btn) {
                    btn.classList.remove('bg-indigo-600', 'text-white');
                    btn.classList.add('bg-gray-200', 'text-gray-700');
                }
            });

            button.classList.remove('bg-gray-200', 'text-gray-700');
            button.classList.add('bg-indigo-600', 'text-white');

            currentTypeFilter = filter;

            const stats = groupByPeriod(currentMatchData, currentPeriod);
            renderCompetitionChart(stats, filter);
        });
    });
}

/**
 * Bereinigt Chart-Instanz
 */
export function cleanupCompetitionStatistics() {
    if (competitionActivityChart) {
        competitionActivityChart.destroy();
        competitionActivityChart = null;
    }
}
