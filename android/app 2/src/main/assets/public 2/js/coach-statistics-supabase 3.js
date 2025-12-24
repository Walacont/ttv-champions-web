/**
 * Coach Statistics Module (Supabase Version)
 * Handles the Statistics tab for coaches with 3 main sections:
 * 1. Trainings-Analyse (Training Analysis)
 * 2. Team-Übersicht (Team Overview)
 * 3. Aktivitäts-Monitor (Activity Monitor)
 */

import { RANK_ORDER } from './ranks.js';
import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils.js';

// Chart instances (global to allow cleanup)
let attendanceTrendChart = null;
let ageDistributionChart = null;
let genderDistributionChart = null;
let rankDistributionChart = null;

/**
 * Initialize the statistics tab
 * @param {Object} userData - Current coach user data
 * @param {Object} supabase - Supabase client instance
 * @param {string} currentSubgroupFilter - Current subgroup filter (or "all")
 */
export async function loadStatistics(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        // Load all statistics sections
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
 * Section 1: Trainings-Analyse
 * Displays attendance statistics and trends
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

        // Calculate statistics
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

        // Update UI
        const weekEl = document.getElementById('stats-attendance-week');
        const monthEl = document.getElementById('stats-attendance-month');
        const totalEl = document.getElementById('stats-total-trainings');

        if (weekEl) weekEl.textContent = avgWeek;
        if (monthEl) monthEl.textContent = avgMonth;
        if (totalEl) totalEl.textContent = totalTrainings;

        // Create trend chart (last 12 weeks)
        const twelveWeeksAgo = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
        const last12Weeks = attendanceData.filter(a => a.date >= twelveWeeksAgo).reverse();

        renderAttendanceTrendChart(last12Weeks);
    } catch (error) {
        console.error('Error loading training analysis:', error);
    }
}

/**
 * Render attendance trend chart using Chart.js
 */
function renderAttendanceTrendChart(data) {
    const ctx = document.getElementById('attendance-trend-chart');
    if (!ctx) return;

    // Destroy previous chart if exists
    if (attendanceTrendChart) {
        attendanceTrendChart.destroy();
    }

    // Group by week
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

/**
 * Group attendance data by week
 */
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
        .slice(-12); // Last 12 weeks
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
 * Section 2: Team-Übersicht
 * Displays team demographics and distribution charts
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

        // Filter by subgroup, age group, or gender
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

        // Calculate team statistics
        const teamSize = players.length;
        const avgAge = calculateAverageAge(players);
        const avgElo = teamSize > 0 ? Math.round(
            players.reduce((sum, p) => sum + (p.eloRating || 1000), 0) / teamSize
        ) : 0;
        const avgXp = teamSize > 0 ? Math.round(players.reduce((sum, p) => sum + (p.xp || 0), 0) / teamSize) : 0;

        // Update UI
        const teamSizeEl = document.getElementById('stats-team-size');
        const avgAgeEl = document.getElementById('stats-avg-age');
        const avgEloEl = document.getElementById('stats-avg-elo');
        const avgXpEl = document.getElementById('stats-avg-xp');

        if (teamSizeEl) teamSizeEl.textContent = teamSize;
        if (avgAgeEl) avgAgeEl.textContent = avgAge > 0 ? avgAge : '-';
        if (avgEloEl) avgEloEl.textContent = avgElo;
        if (avgXpEl) avgXpEl.textContent = avgXp;

        // Render charts
        renderAgeDistributionChart(players);
        renderGenderDistributionChart(players);
        renderRankDistributionChart(players);
    } catch (error) {
        console.error('Error loading team overview:', error);
    }
}

/**
 * Calculate average age from birthdate
 */
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

/**
 * Render age distribution chart
 */
function renderAgeDistributionChart(players) {
    const ctx = document.getElementById('age-distribution-chart');
    if (!ctx) return;

    if (ageDistributionChart) {
        ageDistributionChart.destroy();
    }

    // Group by age ranges
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

/**
 * Render gender distribution chart
 */
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

/**
 * Render rank distribution chart
 */
function renderRankDistributionChart(players) {
    const ctx = document.getElementById('rank-distribution-chart');
    if (!ctx) return;

    if (rankDistributionChart) {
        rankDistributionChart.destroy();
    }

    // Count players by rank
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
 * Section 3: Aktivitäts-Monitor
 * Displays player engagement metrics
 */
async function loadActivityMonitor(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        // Get players and coaches
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

        // Filter by subgroup
        if (currentSubgroupFilter !== 'all') {
            players = players.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(currentSubgroupFilter)
            );
        }

        // Get attendance records
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

        // Calculate top streaks
        const playerStreaks = calculateStreaks(players, attendanceRecords);
        renderTopStreaks(playerStreaks);

        // Calculate inactive players
        const inactivePlayers = findInactivePlayers(players, attendanceRecords);
        renderInactivePlayers(inactivePlayers);

        // Calculate match activity
        await loadMatchActivity(userData, supabase);

        // Calculate Grundlagen rate
        calculateGrundlagenRate(players);

        // Calculate team progress
        calculateTeamProgress(players);
    } catch (error) {
        console.error('Error loading activity monitor:', error);
    }
}

/**
 * Calculate attendance streaks for all players
 */
function calculateStreaks(players, attendanceRecords) {
    const playerStreaks = players.map(player => {
        let currentStreak = 0;

        // Sort attendance records by date (most recent first)
        const sortedRecords = [...attendanceRecords].sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // Count consecutive attendance
        for (const record of sortedRecords) {
            if (record.presentPlayerIds && record.presentPlayerIds.includes(player.id)) {
                currentStreak++;
            } else {
                break; // Streak broken
            }
        }

        return {
            name: `${player.firstName || ''} ${player.lastName || ''}`.trim() || player.email,
            streak: currentStreak,
        };
    });

    // Sort by streak (descending) and take top 3
    return playerStreaks.sort((a, b) => b.streak - a.streak).slice(0, 3);
}

/**
 * Render top streaks
 */
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

/**
 * Find players who haven't attended in over 2 weeks
 */
function findInactivePlayers(players, attendanceRecords) {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    return players
        .filter(player => {
            // Find most recent attendance for this player
            const lastAttendance = attendanceRecords
                .filter(
                    record => record.presentPlayerIds && record.presentPlayerIds.includes(player.id)
                )
                .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

            if (!lastAttendance) return true; // Never attended

            const lastDate = new Date(lastAttendance.date);
            return lastDate < twoWeeksAgo;
        })
        .map(p => ({
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email,
            lastSeen: getLastSeenText(p, attendanceRecords),
        }))
        .slice(0, 5); // Top 5 most inactive
}

/**
 * Get last seen text for a player
 */
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

/**
 * Render inactive players
 */
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

/**
 * Load match activity statistics
 */
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

/**
 * Calculate match-ready rate (players who can participate in competitions)
 */
function calculateGrundlagenRate(players) {
    const matchReadyPlayers = players.filter(p => p.isMatchReady === true || p.is_match_ready === true);
    const rate =
        players.length > 0 ? Math.round((matchReadyPlayers.length / players.length) * 100) : 0;

    const el = document.getElementById('stats-grundlagen-rate');
    if (el) el.textContent = `${rate}%`;
}

/**
 * Calculate team progress (average rank index)
 */
function calculateTeamProgress(players) {
    const el = document.getElementById('stats-team-progress');
    if (!el) return;

    if (players.length === 0) {
        el.textContent = '-';
        return;
    }

    // Calculate average rank index
    const totalRankIndex = players.reduce((sum, p) => {
        const rankIndex = RANK_ORDER.findIndex(r => r.name === (p.rankName || 'Rekrut'));
        return sum + (rankIndex !== -1 ? rankIndex : 0);
    }, 0);

    const avgRankIndex = totalRankIndex / players.length;
    const progressPercent = Math.round((avgRankIndex / (RANK_ORDER.length - 1)) * 100);

    el.textContent = `${progressPercent}%`;
}

/**
 * Cleanup function to destroy all charts
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
