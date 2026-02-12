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

// Cached userData und supabase für Refresh
let cachedUserData = null;
let cachedSupabase = null;

/**
 * Wrapper für Timeout bei async Funktionen
 */
function withTimeout(promise, timeoutMs, fallbackFn) {
    let resolved = false;
    let timeoutId;

    return Promise.race([
        promise.then(result => {
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            return result;
        }),
        new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    if (fallbackFn) fallbackFn();
                    reject(new Error('Timeout'));
                }
            }, timeoutMs);
        })
    ]).catch(err => {
        if (!resolved) {
            console.warn('Function timed out or failed:', err);
        }
    });
}

/**
 * Lädt alle Statistik-Bereiche
 */
export async function loadStatistics(userData, supabase, currentSubgroupFilter = 'all') {
    // Cache für spätere Refreshes
    cachedUserData = userData;
    cachedSupabase = supabase;

    const TIMEOUT_MS = 15000; // 15 Sekunden Timeout

    // Promise.allSettled statt Promise.all - so stoppt ein Fehler nicht alles
    const results = await Promise.allSettled([
        withTimeout(loadTodaysTrainings(userData, supabase), TIMEOUT_MS, () => {
            const container = document.getElementById('todays-trainings-list');
            if (container) container.innerHTML = '<p class="text-center text-gray-500 py-4">Laden fehlgeschlagen</p>';
        }),
        withTimeout(loadTrainingAnalysis(userData, supabase, currentSubgroupFilter), TIMEOUT_MS, () => {
            const weekEl = document.getElementById('stats-attendance-week');
            const monthEl = document.getElementById('stats-attendance-month');
            if (weekEl) weekEl.textContent = '-';
            if (monthEl) monthEl.textContent = '-';
        }),
        withTimeout(loadTeamOverview(userData, supabase, currentSubgroupFilter), TIMEOUT_MS),
        withTimeout(loadActivityMonitor(userData, supabase, currentSubgroupFilter), TIMEOUT_MS),
    ]);

    // Fehler loggen
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Statistics function ${index} failed:`, result.reason);
        }
    });
}

// Aktuell ausgewähltes Datum für Veranstaltungen-Anzeige
let selectedEventsDate = new Date();

/**
 * Initialisiert die Veranstaltungen-Navigation
 */
export function initEventsNavigation(userData, supabase) {
    const prevBtn = document.getElementById('events-prev-day');
    const nextBtn = document.getElementById('events-next-day');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            selectedEventsDate.setDate(selectedEventsDate.getDate() - 1);
            loadEventsForDay(userData, supabase, selectedEventsDate);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            selectedEventsDate.setDate(selectedEventsDate.getDate() + 1);
            loadEventsForDay(userData, supabase, selectedEventsDate);
        });
    }
}

/**
 * Aktualisiert die Veranstaltungen (global verfügbar für Refresh nach Anwesenheit-Speicherung)
 */
window.refreshTodaysTrainings = async function() {
    if (cachedUserData && cachedSupabase) {
        await loadEventsForDay(cachedUserData, cachedSupabase, selectedEventsDate);
    }
};

/**
 * Lädt Trainings/Events für Quick-Access (Legacy-Wrapper)
 */
export async function loadTodaysTrainings(userData, supabase) {
    selectedEventsDate = new Date(); // Reset auf heute
    await loadEventsForDay(userData, supabase, selectedEventsDate);
}

/**
 * Lädt Veranstaltungen für einen bestimmten Tag
 */
export async function loadEventsForDay(userData, supabase, date) {
    const container = document.getElementById('events-day-list');
    const dateDisplay = document.getElementById('events-date-display');
    if (!container) return;

    const selectedDate = new Date(date);
    const dateStr = selectedDate.toISOString().split('T')[0];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isToday = dateStr === todayStr;

    // Datum anzeigen
    if (dateDisplay) {
        if (isToday) {
            dateDisplay.textContent = 'Heute, ' + selectedDate.toLocaleDateString('de-DE', {
                day: 'numeric',
                month: 'long'
            });
        } else {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);

            if (dateStr === yesterday.toISOString().split('T')[0]) {
                dateDisplay.textContent = 'Gestern, ' + selectedDate.toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'long'
                });
            } else if (dateStr === tomorrow.toISOString().split('T')[0]) {
                dateDisplay.textContent = 'Morgen, ' + selectedDate.toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'long'
                });
            } else {
                dateDisplay.textContent = selectedDate.toLocaleDateString('de-DE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'long'
                });
            }
        }
    }

    try {
        // Lade alle Events für das ausgewählte Datum (inkl. wiederkehrende)
        // Safari-kompatibel: Zwei separate Abfragen statt komplexem .or() mit verschachteltem and()
        let singleEventsData = [];
        let recurringEventsData = [];

        // Erste Abfrage: Einzelne Events für das Datum
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*, event_attendance(id, present_user_ids, occurrence_date)')
                .eq('club_id', userData.clubId)
                .eq('start_date', dateStr)
                .order('start_time', { ascending: true });
            if (!error) singleEventsData = data || [];
        } catch (e) {
            console.warn('Error loading single events:', e);
        }

        // Zweite Abfrage: Wiederkehrende Events die vor oder am Datum gestartet sind
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*, event_attendance(id, present_user_ids, occurrence_date)')
                .eq('club_id', userData.clubId)
                .eq('event_type', 'recurring')
                .lte('start_date', dateStr)
                .order('start_time', { ascending: true });
            if (!error) recurringEventsData = data || [];
        } catch (e) {
            console.warn('Error loading recurring events:', e);
        }

        // Kombiniere und dedupliziere (falls ein Event beide Bedingungen erfüllt)
        const eventMap = new Map();
        [...singleEventsData, ...recurringEventsData].forEach(e => {
            eventMap.set(e.id, e);
        });
        const events = Array.from(eventMap.values());

        // Filtere wiederkehrende Events für das ausgewählte Datum (nach Wochentag)
        const selectedDayOfWeek = selectedDate.getDay();
        const daysEvents = (events || []).filter(event => {
            if (event.event_type === 'recurring') {
                const eventStartDate = new Date(event.start_date + 'T12:00:00');
                const eventDayOfWeek = eventStartDate.getDay();
                if (eventDayOfWeek !== selectedDayOfWeek) return false;
                // Prüfe ob vor end_date
                if (event.repeat_end_date && dateStr > event.repeat_end_date) return false;
                // Prüfe excluded_dates
                if (event.excluded_dates?.includes(dateStr)) return false;
                return true;
            }
            return event.start_date === dateStr;
        });

        if (daysEvents.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <svg class="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                    </svg>
                    <p class="text-sm">Keine Veranstaltungen ${isToday ? 'für heute' : 'an diesem Tag'} geplant</p>
                </div>
            `;
            return;
        }

        // Nutze bereits eingebettete Anwesenheitsdaten (Safari-kompatibel: keine separate .in() Abfrage)
        const attendanceMap = new Map();
        daysEvents.forEach(event => {
            const attendanceRecords = event.event_attendance || [];
            // Für wiederkehrende Events: nur wenn occurrence_date exakt dem ausgewählten Datum entspricht
            // Für nicht-wiederkehrende Events: occurrence_date kann fehlen oder gleich dem Event-Datum sein
            const isRecurring = !!event.repeat_type;
            const dayAttendance = attendanceRecords.find(att => {
                if (isRecurring) {
                    // Bei wiederkehrenden Events MUSS occurrence_date dem ausgewählten Datum entsprechen
                    return att.occurrence_date === dateStr;
                } else {
                    // Bei einmaligen Events: occurrence_date kann fehlen oder gleich dem Datum sein
                    return !att.occurrence_date || att.occurrence_date === dateStr;
                }
            });
            if (dayAttendance) {
                attendanceMap.set(event.id, dayAttendance);
            }
        });

        // Render Events
        container.innerHTML = daysEvents.map(event => {
            const startTime = event.start_time?.slice(0, 5) || '';
            const endTime = event.end_time?.slice(0, 5) || '';
            const attendance = attendanceMap.get(event.id);
            const hasAttendance = attendance && attendance.present_user_ids?.length > 0;
            const attendeeCount = attendance?.present_user_ids?.length || 0;

            // Status bestimmen (nur für heute relevant)
            let status = 'upcoming';
            let statusBadge = '';
            let statusClass = 'border-gray-200 hover:border-indigo-300';

            if (startTime && endTime) {
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                const eventStart = new Date(selectedDate);
                eventStart.setHours(startH, startM, 0);
                const eventEnd = new Date(selectedDate);
                eventEnd.setHours(endH, endM, 0);

                // Vergangene Tage: immer "finished"
                if (dateStr < todayStr) {
                    status = 'finished';
                    if (hasAttendance) {
                        statusBadge = `<span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">✓ ${attendeeCount} anwesend</span>`;
                        statusClass = 'border-green-300 hover:border-green-400';
                    } else {
                        statusBadge = '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">Keine Daten</span>';
                        statusClass = 'border-gray-200 hover:border-gray-300';
                    }
                } else if (isToday) {
                    // Heute: Live-Status
                    if (now >= eventStart && now <= eventEnd) {
                        status = 'running';
                        statusBadge = '<span class="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium animate-pulse">Läuft jetzt</span>';
                        statusClass = 'border-orange-300 bg-orange-50 hover:border-orange-400';
                    } else if (now > eventEnd) {
                        status = 'finished';
                        if (hasAttendance) {
                            statusBadge = `<span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">✓ ${attendeeCount} anwesend</span>`;
                            statusClass = 'border-green-300 hover:border-green-400';
                        } else {
                            statusBadge = '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Anwesenheit fehlt</span>';
                            statusClass = 'border-red-300 bg-red-50 hover:border-red-400';
                        }
                    }
                }
                // Zukünftige Tage: bleiben "upcoming" ohne Badge
            }

            return `
                <div class="p-4 rounded-xl border-2 ${statusClass} cursor-pointer transition-all hover:shadow-md"
                     onclick="window.openEventDetails && window.openEventDetails('${event.id}', '${dateStr}')">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold text-gray-900">${event.title}</h4>
                                ${statusBadge}
                            </div>
                            <p class="text-sm text-gray-500">
                                ${startTime}${endTime ? ' - ' + endTime : ''} Uhr
                            </p>
                        </div>
                        <svg class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading events for day:', error);
        container.innerHTML = `
            <div class="text-center py-4 text-red-500">
                <p class="text-sm">Fehler beim Laden der Veranstaltungen</p>
            </div>
        `;
    }
}

/**
 * Bereich 1: Trainingsanwesenheiten-Analyse
 */
async function loadTrainingAnalysis(userData, supabase, currentSubgroupFilter = 'all') {
    try {
        // Lade Events für den Club
        const { data: eventsData, error: eventsError } = await supabase
            .from('events')
            .select('id, title, target_type, target_subgroup_ids')
            .eq('club_id', userData.clubId);

        if (eventsError) throw eventsError;

        // Filter nach Subgroup wenn nötig (Events können mehrere Subgroups haben)
        let eventIds = (eventsData || []).map(e => e.id);
        if (currentSubgroupFilter !== 'all') {
            eventIds = (eventsData || [])
                .filter(e => {
                    // Wenn target_type 'club' ist, gehört es zu allen
                    if (e.target_type === 'club') return true;
                    // Sonst prüfen ob die Subgroup in target_subgroup_ids ist
                    const subgroupIds = e.target_subgroup_ids || [];
                    return subgroupIds.includes(currentSubgroupFilter);
                })
                .map(e => e.id);
        }

        if (eventIds.length === 0) {
            // Keine Events gefunden
            const weekEl = document.getElementById('stats-attendance-week');
            const monthEl = document.getElementById('stats-attendance-month');
            const totalEl = document.getElementById('stats-total-trainings');
            if (weekEl) weekEl.textContent = '0';
            if (monthEl) monthEl.textContent = '0';
            if (totalEl) totalEl.textContent = '0';
            renderAttendanceTrendChart([]);
            return;
        }

        // Lade Anwesenheitsdaten von event_attendance
        const { data, error } = await supabase
            .from('event_attendance')
            .select('*')
            .in('event_id', eventIds)
            .order('occurrence_date', { ascending: false });

        if (error) throw error;

        const attendanceData = (data || []).map(record => ({
            date: new Date(record.occurrence_date || record.created_at),
            count: record.present_user_ids ? record.present_user_ids.length : 0,
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
        // Safari-kompatibel: .or() statt .in() für Rollen
        const { data: playersData, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('club_id', userData.clubId)
            .or('role.eq.player,role.eq.coach,role.eq.head_coach');

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
        // Safari-kompatibel: .or() statt .in() für Rollen
        const { data: playersData, error: playersError } = await supabase
            .from('profiles')
            .select('*')
            .eq('club_id', userData.clubId)
            .or('role.eq.player,role.eq.coach,role.eq.head_coach');

        if (playersError) throw playersError;

        let players = (playersData || []).map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            email: p.email,
            subgroupIDs: p.subgroup_ids || [],
            rankName: p.rank_name,
        }));

        if (currentSubgroupFilter !== 'all') {
            players = players.filter(
                p => p.subgroupIDs && p.subgroupIDs.includes(currentSubgroupFilter)
            );
        }

        // Lade Events für Club
        const { data: eventsData, error: eventsError } = await supabase
            .from('events')
            .select('id, target_type, target_subgroup_ids')
            .eq('club_id', userData.clubId);

        if (eventsError) throw eventsError;

        // Filter nach Subgroup wenn nötig
        let eventIds = (eventsData || []).map(e => e.id);
        if (currentSubgroupFilter !== 'all') {
            eventIds = (eventsData || [])
                .filter(e => {
                    if (e.target_type === 'club') return true;
                    const subgroupIds = e.target_subgroup_ids || [];
                    return subgroupIds.includes(currentSubgroupFilter);
                })
                .map(e => e.id);
        }

        // Lade Anwesenheitsdaten von event_attendance
        let attendanceRecords = [];
        if (eventIds.length > 0) {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('event_attendance')
                .select('*')
                .in('event_id', eventIds)
                .order('occurrence_date', { ascending: false })
                .limit(50);

            if (attendanceError) throw attendanceError;

            attendanceRecords = (attendanceData || []).map(a => ({
                id: a.id,
                date: a.occurrence_date || a.created_at,
                presentPlayerIds: a.present_user_ids || [],
            }));
        }

        const playerStreaks = calculateStreaks(players, attendanceRecords);
        renderTopStreaks(playerStreaks);

        const inactivePlayers = findInactivePlayers(players, attendanceRecords);
        renderInactivePlayers(inactivePlayers);

        await loadMatchActivity(userData, supabase);

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
