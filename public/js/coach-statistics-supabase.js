/**
 * Statistik-Modul für Trainer
 * Verwaltet 3 Bereiche: Trainings-Analyse, Team-Übersicht, Aktivitäts-Monitor
 */

import { RANK_ORDER } from './ranks.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils-supabase.js';

// Chart-Instanzen (global für Cleanup)
let attendanceTrendChart = null;
let ageDistributionChart = null;
let genderDistributionChart = null;
let rankDistributionChart = null;

/**
 * Lädt alle Statistik-Bereiche
 */
export async function loadStatistics(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        await Promise.all([
            loadTrainingAnalysis(userData, supabase, currentSubgroupFilter),
            loadTeamOverview(userData, supabase, currentSubgroupFilter),
            loadActivityMonitor(userData, supabase, currentSubgroupFilter),
        ]);
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

/**
 * Bereich 1: Trainings-Analyse
 */
async function loadTrainingAnalysis(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        let query = supabase
            .from('attendance')
            .select('*')
            .eq('club_id', userData.clubId)
            .order('date', { ascending: false });

        if (currentSubgroupFilter !== 'all') {
            query = query.eq('subgroup_id', currentSubgroupFilter);
        }

        const { data, error } = await query;
        if (error) throw error;

        const attendanceData = (data || []).map(record => ({
            date: new Date(record.date),
            count: record.present_player_ids ? record.present_player_ids.length : 0,
        }));

        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const thisWeek = attendanceData.filter(a => a.date >= oneWeekAgo);
        const thisMonth = attendanceData.filter(a => a.date >= oneMonthAgo);

        const avgWeek =
            thisWeek.length > 0
                ? Math.round(thisWeek.reduce((sum, a) => sum + a.count, 0) / thisWeek.length)
                : 0;
        const avgMonth =
            thisMonth.length > 0
                ? Math.round(thisMonth.reduce((sum, a) => sum + a.count, 0) / thisMonth.length)
                : 0;
        const totalTrainings = attendanceData.length;

        const weekEl = document.getElementById('stats-attendance-week');
        const monthEl = document.getElementById('stats-attendance-month');
        const totalEl = document.getElementById('stats-total-trainings');

        if (weekEl) weekEl.textContent = avgWeek;
        if (monthEl) monthEl.textContent = avgMonth;
        if (totalEl) totalEl.textContent = totalTrainings;

        const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
        const last12Weeks = attendanceData.filter(a => a.date >= twelveWeeksAgo).reverse();

        renderAttendanceTrendChart(last12Weeks);
    } catch (error) {
        console.error('Error loading training analysis:', error);
    }
}

function renderAttendanceTrendChart(data) {
    const ctx = document.getElementById('attendance-trend-chart');
    if (!ctx) return;

    // Vorheriges Chart aufräumen um Memory Leaks zu vermeiden
    if (attendanceTrendChart) {
        attendanceTrendChart.destroy();
    }

    const weeklyData = groupByWeek(data);

    attendanceTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeklyData.map(w => `KW ${w.week}`),
            datasets: [
                {
                    label: 'Ø Teilnehmer',
                    data: weeklyData.map(w => w.avgCount),
                    borderColor: 'rgb(79, 70, 229)',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    tension: 0.3,
                    fill: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                    },
                },
            },
        },
    });
}

function groupByWeek(data) {
    const weekMap = {};

    data.forEach(item => {
        const weekNum = getWeekNumber(item.date);
        const key = `${item.date.getFullYear()}-W${weekNum}`;

        if (!weekMap[key]) {
            weekMap[key] = {
                week: weekNum,
                counts: [],
                year: item.date.getFullYear(),
            };
        }
        weekMap[key].counts.push(item.count);
    });

    return Object.values(weekMap)
        .map(week => ({
            week: week.week,
            avgCount: Math.round(week.counts.reduce((sum, c) => sum + c, 0) / week.counts.length),
        }))
        .slice(-12);
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Bereich 2: Team-Übersicht
 */
async function loadTeamOverview(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        const { data: playersData, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('club_id', userData.clubId)
            .in('role', ['player', 'coach', 'head_coach']);

        if (error) throw error;

        let players = (playersData || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            email: p.email,
            eloRating: p.elo_rating,
            xp: p.xp,
            birthdate: p.birthdate,
            gender: p.gender,
            rankName: p.rank_name,
            subgroupIDs: p.subgroup_ids || [],
            grundlagenCompleted: p.grundlagen_completed,
        }));

        if (currentSubgroupFilter !== 'all') {
            if (isAgeGroupFilter(currentSubgroupFilter)) {
                players = filterPlayersByAgeGroup(players, currentSubgroupFilter);
            } else if (isGenderFilter(currentSubgroupFilter)) {
                players = filterPlayersByGender(players, currentSubgroupFilter);
            } else {
                players = players.filter(
                    p => p.subgroupIDs && p.subgroupIDs.includes(currentSubgroupFilter)
                );
            }
        }

        const teamSize = players.length;
        const avgAge = calculateAverageAge(players);
        const avgElo = teamSize > 0 ? Math.round(
            players.reduce((sum, p) => sum + (p.eloRating || 1000), 0) / teamSize
        ) : 0;
        const avgXp = teamSize > 0 ? Math.round(players.reduce((sum, p) => sum + (p.xp || 0), 0) / teamSize) : 0;

        const teamSizeEl = document.getElementById('stats-team-size');
        const avgAgeEl = document.getElementById('stats-avg-age');
        const avgEloEl = document.getElementById('stats-avg-elo');
        const avgXpEl = document.getElementById('stats-avg-xp');

        if (teamSizeEl) teamSizeEl.textContent = teamSize;
        if (avgAgeEl) avgAgeEl.textContent = avgAge > 0 ? avgAge : '-';
        if (avgEloEl) avgEloEl.textContent = avgElo;
        if (avgXpEl) avgXpEl.textContent = avgXp;

        renderAgeDistributionChart(players);
        renderGenderDistributionChart(players);
        renderRankDistributionChart(players);
    } catch (error) {
        console.error('Error loading team overview:', error);
    }
}

function calculateAverageAge(players) {
    const playersWithAge = players.filter(p => p.birthdate);
    if (playersWithAge.length === 0) return 0;

    const now = new Date();
    const totalAge = playersWithAge.reduce((sum, p) => {
        const birthdate = new Date(p.birthdate);
        const age = now.getFullYear() - birthdate.getFullYear();
        return sum + age;
    }, 0);

    return Math.round(totalAge / playersWithAge.length);
}

function renderAgeDistributionChart(players) {
    const ctx = document.getElementById('age-distribution-chart');
    if (!ctx) return;

    if (ageDistributionChart) {
        ageDistributionChart.destroy();
    }

    const ageRanges = {
        U10: 0,
        U13: 0,
        U15: 0,
        U18: 0,
        '18+': 0,
    };

    const now = new Date();
    players.forEach(p => {
        if (!p.birthdate) return;
        const birthdate = new Date(p.birthdate);
        const age = now.getFullYear() - birthdate.getFullYear();

        if (age < 10) ageRanges['U10']++;
        else if (age < 13) ageRanges['U13']++;
        else if (age < 15) ageRanges['U15']++;
        else if (age < 18) ageRanges['U18']++;
        else ageRanges['18+']++;
    });

    ageDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(ageRanges),
            datasets: [
                {
                    data: Object.values(ageRanges),
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 206, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                    ],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
            },
        },
    });
}

function renderGenderDistributionChart(players) {
    const ctx = document.getElementById('gender-distribution-chart');
    if (!ctx) return;

    if (genderDistributionChart) {
        genderDistributionChart.destroy();
    }

    const genderCounts = {
        Männlich: 0,
        Weiblich: 0,
        Divers: 0,
        Unbekannt: 0,
    };

    players.forEach(p => {
        const gender = p.gender || 'other';
        if (gender === 'male') genderCounts['Männlich']++;
        else if (gender === 'female') genderCounts['Weiblich']++;
        else if (gender === 'other') genderCounts['Divers']++;
        else genderCounts['Unbekannt']++;
    });

    genderDistributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(genderCounts),
            datasets: [
                {
                    data: Object.values(genderCounts),
                    backgroundColor: [
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(153, 102, 255, 0.8)',
                        'rgba(201, 203, 207, 0.8)',
                    ],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                },
            },
        },
    });
}

function renderRankDistributionChart(players) {
    const ctx = document.getElementById('rank-distribution-chart');
    if (!ctx) return;

    if (rankDistributionChart) {
        rankDistributionChart.destroy();
    }

    const rankCounts = {};
    RANK_ORDER.forEach(rank => {
        rankCounts[rank.name] = 0;
    });

    players.forEach(p => {
        const rankName = p.rankName || 'Rekrut';
        if (rankCounts[rankName] !== undefined) {
            rankCounts[rankName]++;
        }
    });

    rankDistributionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(rankCounts),
            datasets: [
                {
                    label: 'Spieler',
                    data: Object.values(rankCounts),
                    backgroundColor: 'rgba(79, 70, 229, 0.8)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false,
                },
            },
            scales: {
                y: {
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
 * Bereich 3: Aktivitäts-Monitor
 */
async function loadActivityMonitor(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        const { data: playersData, error: playersError } = await supabase
            .from('profiles')
            .select('*')
            .eq('club_id', userData.clubId)
            .in('role', ['player', 'coach', 'head_coach']);

        if (playersError) throw playersError;

        let players = (playersData || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            email: p.email,
            subgroupIDs: p.subgroup_ids || [],
            grundlagenCompleted: p.grundlagen_completed,
            rankName: p.rank_name,
        }));

        if (currentSubgroupFilter !== 'all') {
            players = players.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(currentSubgroupFilter)
            );
        }

        let attendanceQuery = supabase
            .from('attendance')
            .select('*')
            .eq('club_id', userData.clubId)
            .order('date', { ascending: false })
            .limit(50);

        if (currentSubgroupFilter !== 'all') {
            attendanceQuery = attendanceQuery.eq('subgroup_id', currentSubgroupFilter);
        }

        const { data: attendanceData, error: attendanceError } = await attendanceQuery;
        if (attendanceError) throw attendanceError;

        const attendanceRecords = (attendanceData || []).map(a => ({
            id: a.id,
            date: a.date,
            presentPlayerIds: a.present_player_ids || [],
            subgroupId: a.subgroup_id,
        }));

        const playerStreaks = calculateStreaks(players, attendanceRecords);
        renderTopStreaks(playerStreaks);

        const inactivePlayers = findInactivePlayers(players, attendanceRecords);
        renderInactivePlayers(inactivePlayers);

        await loadMatchActivity(userData, supabase);

        calculateGrundlagenRate(players);

        calculateTeamProgress(players);
    } catch (error) {
        console.error('Error loading activity monitor:', error);
    }
}

function calculateStreaks(players, attendanceRecords) {
    const playerStreaks = players.map(player => {
        let currentStreak = 0;

        const sortedRecords = [...attendanceRecords].sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        for (const record of sortedRecords) {
            if (record.presentPlayerIds && record.presentPlayerIds.includes(player.id)) {
                currentStreak++;
            } else {
                break; // Streak unterbrochen
            }
        }

        return {
            name: `${player.firstName || ''} ${player.lastName || ''}`.trim() || player.email,
            streak: currentStreak,
        };
    });

    return playerStreaks.sort((a, b) => b.streak - a.streak).slice(0, 3);
}

function renderTopStreaks(streaks) {
    const container = document.getElementById('stats-top-streaks');
    if (!container) return;

    if (streaks.length === 0) {
        container.innerHTML = '<li class="text-gray-500">Keine Daten verfügbar</li>';
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    container.innerHTML = streaks
        .map(
            (s, index) => `
        <li class="flex justify-between items-center p-2 bg-white rounded">
            <span class="font-medium">${medals[index]} ${s.name}</span>
            <span class="text-orange-600 font-bold">${s.streak} Tage</span>
        </li>
    `
        )
        .join('');
}

function findInactivePlayers(players, attendanceRecords) {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    return players
        .filter(player => {
            const lastAttendance = attendanceRecords
                .filter(
                    record => record.presentPlayerIds && record.presentPlayerIds.includes(player.id)
                )
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!lastAttendance) return true; // Noch nie teilgenommen

            const lastDate = new Date(lastAttendance.date);
            return lastDate < twoWeeksAgo;
        })
        .map(p => ({
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
            lastSeen: getLastSeenText(p, attendanceRecords),
        }))
        .slice(0, 5);
}

function getLastSeenText(player, attendanceRecords) {
    const lastAttendance = attendanceRecords
        .filter(record => record.presentPlayerIds && record.presentPlayerIds.includes(player.id))
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    if (!lastAttendance) return 'Nie';

    const lastDate = new Date(lastAttendance.date);
    const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysAgo === 0) return 'Heute';
    if (daysAgo === 1) return 'Gestern';
    return `vor ${daysAgo} Tagen`;
}

function renderInactivePlayers(inactivePlayers) {
    const container = document.getElementById('stats-inactive-players');
    if (!container) return;

    if (inactivePlayers.length === 0) {
        container.innerHTML = '<li class="text-green-600 font-medium">Alle aktiv!</li>';
        return;
    }

    container.innerHTML = inactivePlayers
        .map(
            p => `
        <li class="flex justify-between items-center p-2 bg-white rounded">
            <span class="font-medium">${p.name}</span>
            <span class="text-red-600 text-sm">${p.lastSeen}</span>
        </li>
    `
        )
        .join('');
}

async function loadMatchActivity(userData, supabase) {
    try {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('matches')
            .select('id')
            .eq('club_id', userData.clubId)
            .gte('played_at', oneWeekAgo);

        if (error) throw error;

        const matchesThisWeek = (data || []).length;

        const el = document.getElementById('stats-matches-per-week');
        if (el) el.textContent = matchesThisWeek;
    } catch (error) {
        console.error('Error loading match activity:', error);
        const el = document.getElementById('stats-matches-per-week');
        if (el) el.textContent = '0';
    }
}

function calculateGrundlagenRate(players) {
    const matchReadyPlayers = players.filter(p => p.isMatchReady === true || p.is_match_ready === true);
    const rate =
        players.length > 0 ? Math.round((matchReadyPlayers.length / players.length) * 100) : 0;

    const el = document.getElementById('stats-grundlagen-rate');
    if (el) el.textContent = `${rate}%`;
}

function calculateTeamProgress(players) {
    const el = document.getElementById('stats-team-progress');
    if (!el) return;

    if (players.length === 0) {
        el.textContent = '-';
        return;
    }

    const totalRankIndex = players.reduce((sum, p) => {
        const rankIndex = RANK_ORDER.findIndex(r => r.name === (p.rankName || 'Rekrut'));
        return sum + (rankIndex !== -1 ? rankIndex : 0);
    }, 0);

    const avgRankIndex = totalRankIndex / players.length;
    const progressPercent = Math.round((avgRankIndex / (RANK_ORDER.length - 1)) * 100);

    el.textContent = `${progressPercent}%`;
}

/**
 * Räumt alle Charts auf
 */
export function cleanupStatistics() {
    if (attendanceTrendChart) {
        attendanceTrendChart.destroy();
        attendanceTrendChart = null;
    }
    if (ageDistributionChart) {
        ageDistributionChart.destroy();
        ageDistributionChart = null;
    }
    if (genderDistributionChart) {
        genderDistributionChart.destroy();
        genderDistributionChart = null;
    }
    if (rankDistributionChart) {
        rankDistributionChart.destroy();
        rankDistributionChart = null;
    }
}
