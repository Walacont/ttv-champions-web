// Admin-Statistikmodul (Supabase-Version)
// Verwaltet Statistikladen und Chart-Rendering

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let genderChartInstance = null;
let attendanceChartInstance = null;
let competitionChartInstance = null;
let competitionMatchData = [];
let competitionPeriod = 'month';
let competitionTypeFilter = 'all';
let currentSportFilter = 'all';

export function setStatisticsSportFilter(sportId) {
    currentSportFilter = sportId;
}

export async function loadStatistics() {
    try {
        // Clubs laden um Test-Clubs zu identifizieren
        const { data: clubs } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        const testClubIds = new Set(
            (clubs || []).filter(c => c.is_test_club === true).map(c => c.id)
        );

        // Benutzer laden (Test-Clubs ausschließen, nach Sport filtern)
        let usersQuery = supabase.from('profiles').select('*');

        if (currentSportFilter !== 'all') {
            usersQuery = usersQuery.eq('active_sport_id', currentSportFilter);
        }

        const { data: allUsers } = await usersQuery;

        let users = (allUsers || []).filter(u => !u.club_id || !testClubIds.has(u.club_id));

        // Anwesenheiten laden (Test-Clubs ausschließen)
        const { data: allAttendance } = await supabase
            .from('attendance')
            .select('*');

        const attendances = (allAttendance || []).filter(a => !a.club_id || !testClubIds.has(a.club_id));

        const realClubIds = new Set(
            users.map(u => u.club_id).filter(id => id && !testClubIds.has(id))
        );

        document.getElementById('stats-total-users').textContent = users.length;
        document.getElementById('stats-total-clubs').textContent = realClubIds.size;
        document.getElementById('stats-total-points').textContent = users.reduce(
            (sum, u) => sum + (u.points || 0),
            0
        );
        document.getElementById('stats-total-attendance').textContent = attendances.reduce(
            (sum, a) => sum + (a.present_player_ids?.length || 0),
            0
        );

        const genderCounts = users.reduce((acc, user) => {
            const gender = user.gender || 'unknown';
            acc[gender] = (acc[gender] || 0) + 1;
            return acc;
        }, {});

        const attendanceByMonth = attendances.reduce((acc, record) => {
            if (record.date) {
                const month = new Date(record.date).toLocaleString('de-DE', {
                    month: 'short',
                    year: '2-digit',
                });
                acc[month] = (acc[month] || 0) + (record.present_player_ids?.length || 0);
            }
            return acc;
        }, {});

        const sortedMonths = Object.keys(attendanceByMonth).sort((a, b) => {
            const [m1, y1] = a.split(' ');
            const [m2, y2] = b.split(' ');
            return new Date(`01 ${m1} 20${y1}`) - new Date(`01 ${m2} 20${y2}`);
        });

        renderGenderChart(genderCounts);
        renderAttendanceChart(sortedMonths, attendanceByMonth);

        await loadGlobalCompetitionStatistics(testClubIds);
    } catch (error) {
        console.error('Fehler beim Laden der Statistiken:', error);
        document.getElementById('statistics-section').innerHTML =
            '<p class="text-red-500">Statistiken konnten nicht geladen werden.</p>';
    }
}

function renderGenderChart(data) {
    const ctx = document.getElementById('gender-chart')?.getContext('2d');
    if (!ctx) return;

    if (genderChartInstance) genderChartInstance.destroy();
    genderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Männlich', 'Weiblich', 'Divers', 'Unbekannt'],
            datasets: [
                {
                    data: [data.male || 0, data.female || 0, data.diverse || 0, data.unknown || 0],
                    backgroundColor: ['#3b82f6', '#ec4899', '#8b5cf6', '#a1a1aa'],
                },
            ],
        },
        options: { responsive: true, plugins: { legend: { position: 'top' } } },
    });
}

function renderAttendanceChart(labels, data) {
    const ctx = document.getElementById('attendance-chart')?.getContext('2d');
    if (!ctx) return;

    const chartData = labels.map(label => data[label]);
    if (attendanceChartInstance) attendanceChartInstance.destroy();
    attendanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Anwesenheiten',
                    data: chartData,
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            scales: { y: { beginAtZero: true } },
            responsive: true,
            plugins: { legend: { display: false } },
        },
    });
}

async function loadGlobalCompetitionStatistics(testClubIds = new Set()) {
    try {
        let singlesQuery = supabase
            .from('matches')
            .select('created_at, club_id, sport_id');

        if (currentSportFilter !== 'all') {
            singlesQuery = singlesQuery.eq('sport_id', currentSportFilter);
        }

        const { data: singlesMatches } = await singlesQuery;

        let doublesQuery = supabase
            .from('doubles_matches')
            .select('created_at, club_id, sport_id');

        if (currentSportFilter !== 'all') {
            doublesQuery = doublesQuery.eq('sport_id', currentSportFilter);
        }

        const { data: doublesMatches } = await doublesQuery;

        competitionMatchData = [];

        (singlesMatches || []).forEach(match => {
            if (match.club_id && testClubIds.has(match.club_id)) return;
            competitionMatchData.push({
                date: match.created_at ? new Date(match.created_at) : new Date(),
                type: 'singles',
            });
        });

        (doublesMatches || []).forEach(match => {
            if (match.club_id && testClubIds.has(match.club_id)) return;
            competitionMatchData.push({
                date: match.created_at ? new Date(match.created_at) : new Date(),
                type: 'doubles',
            });
        });

        renderCompetitionStatistics();
        setupCompetitionFilterListeners();
    } catch (error) {
        console.error('Fehler beim Laden der Wettkampf-Statistiken:', error);
    }
}

export function setupCompetitionFilterListeners() {
    const periodWeek = document.getElementById('admin-competition-period-week');
    const periodMonth = document.getElementById('admin-competition-period-month');
    const periodYear = document.getElementById('admin-competition-period-year');

    if (periodWeek) {
        periodWeek.addEventListener('click', () => {
            competitionPeriod = 'week';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (periodMonth) {
        periodMonth.addEventListener('click', () => {
            competitionPeriod = 'month';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (periodYear) {
        periodYear.addEventListener('click', () => {
            competitionPeriod = 'year';
            updatePeriodButtonStyles();
            renderCompetitionStatistics();
        });
    }

    const filterAll = document.getElementById('admin-competition-filter-all');
    const filterSingles = document.getElementById('admin-competition-filter-singles');
    const filterDoubles = document.getElementById('admin-competition-filter-doubles');

    if (filterAll) {
        filterAll.addEventListener('click', () => {
            competitionTypeFilter = 'all';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (filterSingles) {
        filterSingles.addEventListener('click', () => {
            competitionTypeFilter = 'singles';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
    if (filterDoubles) {
        filterDoubles.addEventListener('click', () => {
            competitionTypeFilter = 'doubles';
            updateTypeButtonStyles();
            renderCompetitionStatistics();
        });
    }
}

function updatePeriodButtonStyles() {
    const buttons = {
        week: document.getElementById('admin-competition-period-week'),
        month: document.getElementById('admin-competition-period-month'),
        year: document.getElementById('admin-competition-period-year'),
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) {
            if (key === competitionPeriod) {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-blue-600 text-white';
            } else {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700';
            }
        }
    });
}

function updateTypeButtonStyles() {
    const buttons = {
        all: document.getElementById('admin-competition-filter-all'),
        singles: document.getElementById('admin-competition-filter-singles'),
        doubles: document.getElementById('admin-competition-filter-doubles'),
    };

    Object.entries(buttons).forEach(([key, btn]) => {
        if (btn) {
            if (key === competitionTypeFilter) {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-indigo-600 text-white';
            } else {
                btn.className = 'px-4 py-2 rounded-lg font-medium transition-colors bg-gray-200 text-gray-700';
            }
        }
    });
}

export function renderCompetitionStatistics() {
    let filteredMatches = competitionMatchData;
    if (competitionTypeFilter === 'singles') {
        filteredMatches = competitionMatchData.filter(m => m.type === 'singles');
    } else if (competitionTypeFilter === 'doubles') {
        filteredMatches = competitionMatchData.filter(m => m.type === 'doubles');
    }

    const now = new Date();
    const periodData = {};
    let periodCount, periodLabel;

    if (competitionPeriod === 'week') {
        periodCount = 12;
        periodLabel = 'Wochen';
        for (let i = periodCount - 1; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(weekStart.getDate() - (i * 7));
            const weekKey = `KW ${getWeekNumber(weekStart)}`;
            periodData[weekKey] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const weeksSince = Math.floor((now - matchDate) / (7 * 24 * 60 * 60 * 1000));
                if (weeksSince >= 0 && weeksSince < periodCount) {
                    const weekKey = `KW ${getWeekNumber(matchDate)}`;
                    if (periodData[weekKey] !== undefined) {
                        periodData[weekKey]++;
                    }
                }
            }
        });
    } else if (competitionPeriod === 'month') {
        periodCount = 12;
        periodLabel = 'Monate';
        for (let i = periodCount - 1; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthKey = monthDate.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
            periodData[monthKey] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const monthKey = matchDate.toLocaleString('de-DE', { month: 'short', year: '2-digit' });
                if (periodData[monthKey] !== undefined) {
                    periodData[monthKey]++;
                }
            }
        });
    } else {
        periodCount = 3;
        periodLabel = 'Jahre';
        for (let i = periodCount - 1; i >= 0; i--) {
            const year = now.getFullYear() - i;
            periodData[year.toString()] = 0;
        }

        filteredMatches.forEach(match => {
            if (match.date) {
                const matchDate = new Date(match.date);
                const yearKey = matchDate.getFullYear().toString();
                if (periodData[yearKey] !== undefined) {
                    periodData[yearKey]++;
                }
            }
        });
    }

    const values = Object.values(periodData);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? (total / values.length).toFixed(1) : 0;

    let maxPeriod = '-';
    let maxCount = 0;
    Object.entries(periodData).forEach(([period, count]) => {
        if (count > maxCount) {
            maxCount = count;
            maxPeriod = period;
        }
    });

    const periodsArray = Object.values(periodData);
    let trend = '-';
    if (periodsArray.length >= 2) {
        const current = periodsArray[periodsArray.length - 1];
        const previous = periodsArray[periodsArray.length - 2];
        if (previous > 0) {
            const change = ((current - previous) / previous * 100).toFixed(0);
            trend = change >= 0 ? `+${change}%` : `${change}%`;
        } else if (current > 0) {
            trend = '+∞';
        }
    }

    const totalLabel = document.getElementById('admin-stats-competition-total-label');
    const totalEl = document.getElementById('admin-stats-competition-total');
    const avgLabel = document.getElementById('admin-stats-competition-avg-label');
    const avgEl = document.getElementById('admin-stats-competition-avg');
    const activePeriodLabel = document.getElementById('admin-stats-competition-active-period-label');
    const activePeriodEl = document.getElementById('admin-stats-competition-active-period');
    const trendEl = document.getElementById('admin-stats-competition-trend');

    if (totalLabel) totalLabel.textContent = `Gesamt (${periodCount} ${periodLabel})`;
    if (totalEl) totalEl.textContent = total;
    if (avgLabel) avgLabel.textContent = `Ø pro ${competitionPeriod === 'week' ? 'Woche' : competitionPeriod === 'month' ? 'Monat' : 'Jahr'}`;
    if (avgEl) avgEl.textContent = avg;
    if (activePeriodLabel) activePeriodLabel.textContent = `Aktivster ${competitionPeriod === 'week' ? 'Woche' : competitionPeriod === 'month' ? 'Monat' : 'Jahr'}`;
    if (activePeriodEl) activePeriodEl.textContent = maxCount > 0 ? `${maxPeriod} (${maxCount})` : '-';
    if (trendEl) trendEl.textContent = trend;

    renderCompetitionChart(Object.keys(periodData), Object.values(periodData));
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function calculateSmartStepSize(maxValue) {
    if (maxValue <= 10) return 1;
    if (maxValue <= 25) return 5;
    if (maxValue <= 50) return 10;
    if (maxValue <= 100) return 20;
    if (maxValue <= 250) return 50;
    if (maxValue <= 500) return 100;
    return Math.ceil(maxValue / 10);
}

function renderCompetitionChart(labels, data) {
    const ctx = document.getElementById('admin-competition-chart')?.getContext('2d');
    if (!ctx) return;

    if (competitionChartInstance) competitionChartInstance.destroy();

    const maxValue = Math.max(...data, 1);
    const stepSize = calculateSmartStepSize(maxValue);

    competitionChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Wettkämpfe',
                    data: data,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: stepSize,
                        callback: function(value) {
                            return Number.isInteger(value) ? value : '';
                        }
                    }
                }
            },
            plugins: {
                legend: { display: false },
            },
        },
    });
}
