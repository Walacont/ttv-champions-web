// SC Champions - Dashboard (Supabase Version)
// Komplett neue Version ohne Firebase-Abhängigkeiten

import { getSupabase, onAuthStateChange } from './supabase-init.js';

console.log('[DASHBOARD-SUPABASE] Script starting...');

const supabase = getSupabase();

// --- State ---
let currentUser = null;
let currentUserData = null;
let currentClubData = null;
let realtimeSubscriptions = [];
let currentSubgroupFilter = 'club';
let currentGenderFilter = 'all';

// --- Constants ---
const RANKS = [
    { name: 'Rekrut', minXP: 0, icon: '🔰' },
    { name: 'Lehrling', minXP: 100, icon: '📘' },
    { name: 'Geselle', minXP: 300, icon: '⚒️' },
    { name: 'Adept', minXP: 600, icon: '🎯' },
    { name: 'Veteran', minXP: 1000, icon: '⚔️' },
    { name: 'Experte', minXP: 1500, icon: '🛡️' },
    { name: 'Meister', minXP: 2500, icon: '👑' },
    { name: 'Großmeister', minXP: 4000, icon: '🏆' },
    { name: 'Champion', minXP: 6000, icon: '💎' },
];

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[DASHBOARD-SUPABASE] DOM loaded, checking session...');

    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.log('[DASHBOARD-SUPABASE] No session, redirecting to login');
        window.location.replace('/index.html');
        return;
    }

    currentUser = session.user;
    console.log('[DASHBOARD-SUPABASE] User:', currentUser.email);

    // Load user profile
    await loadUserProfile();

    // Listen for auth changes
    onAuthStateChange((event, session) => {
        console.log('[DASHBOARD-SUPABASE] Auth state changed:', event);
        if (event === 'SIGNED_OUT' || !session) {
            cleanupSubscriptions();
            window.location.replace('/index.html');
        }
    });
});

// --- Cleanup ---
function cleanupSubscriptions() {
    realtimeSubscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
            sub.unsubscribe();
        }
    });
    realtimeSubscriptions = [];
}

// --- Load User Profile ---
async function loadUserProfile() {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                *,
                club:clubs(id, name)
            `)
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        if (!profile) {
            console.error('[DASHBOARD-SUPABASE] No profile found');
            await supabase.auth.signOut();
            return;
        }

        // Check onboarding
        if (!profile.onboarding_complete) {
            console.log('[DASHBOARD-SUPABASE] Onboarding not complete');
            window.location.href = '/onboarding.html';
            return;
        }

        // Check role - redirect admins
        if (profile.role === 'admin') {
            window.location.href = '/admin.html';
            return;
        }

        currentUserData = profile;
        currentClubData = profile.club;

        console.log('[DASHBOARD-SUPABASE] Profile loaded:', {
            name: profile.display_name,
            role: profile.role,
            club: currentClubData?.name
        });

        // Initialize dashboard
        initializeDashboard();

    } catch (error) {
        console.error('[DASHBOARD-SUPABASE] Error loading profile:', error);
        showError('Profil konnte nicht geladen werden: ' + error.message);
    }
}

// --- Initialize Dashboard ---
function initializeDashboard() {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');

    // Hide loader, show content
    if (pageLoader) pageLoader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    // Setup UI
    setupHeader();
    setupTabs();
    setupLogout();
    setupFilters();

    // Load data
    updateStatsDisplay();
    updateRankDisplay();
    loadLeaderboards();
    loadPointsHistory();
    loadChallenges();
    loadExercises();
    loadMatchRequests();
    loadCalendar();
    updateSeasonCountdown();

    // Show coach switch button if coach
    if (currentUserData.role === 'coach') {
        const switchBtn = document.getElementById('switch-to-coach-btn');
        if (switchBtn) switchBtn.classList.remove('hidden');
    }

    // Show no-club info if needed
    if (!currentUserData.club_id) {
        const noClubBox = document.getElementById('no-club-info-box');
        if (noClubBox && localStorage.getItem('noClubInfoDismissed') !== 'true') {
            noClubBox.classList.remove('hidden');
        }
    }

    // Setup realtime subscriptions
    setupRealtimeSubscriptions();
}

// --- Setup Header ---
function setupHeader() {
    // Profile picture
    const headerPic = document.getElementById('header-profile-pic');
    if (headerPic) {
        headerPic.src = currentUserData.avatar_url || '/images/default-avatar.png';
        headerPic.onerror = () => { headerPic.src = '/images/default-avatar.png'; };
    }

    // Welcome message
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) {
        const name = currentUserData.first_name || currentUserData.display_name || 'Spieler';
        welcomeMsg.textContent = `Willkommen zurück, ${name}!`;
    }

    // Club name
    const clubName = document.getElementById('header-club-name');
    if (clubName) {
        clubName.textContent = currentClubData?.name || 'Kein Verein';
    }
}

// --- Setup Tabs ---
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;

            // Update active states
            tabButtons.forEach(btn => btn.classList.remove('tab-active'));
            button.classList.add('tab-active');

            tabContents.forEach(content => {
                content.classList.add('hidden');
                if (content.id === `tab-content-${tabId}`) {
                    content.classList.remove('hidden');
                }
            });
        });
    });

    // Activate first tab
    if (tabButtons.length > 0) {
        tabButtons[0].click();
    }
}

// --- Setup Logout ---
function setupLogout() {
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                cleanupSubscriptions();
                await supabase.auth.signOut();
                if (window.spaEnhancer) window.spaEnhancer.clearCache();
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    // Close no-club info
    const closeNoClubBtn = document.getElementById('close-no-club-info');
    if (closeNoClubBtn) {
        closeNoClubBtn.addEventListener('click', () => {
            document.getElementById('no-club-info-box')?.classList.add('hidden');
            localStorage.setItem('noClubInfoDismissed', 'true');
        });
    }
}

// --- Setup Filters ---
function setupFilters() {
    const subgroupFilter = document.getElementById('player-subgroup-filter');
    const genderFilter = document.getElementById('player-gender-filter');

    if (subgroupFilter) {
        // Load subgroups if user has a club
        if (currentUserData.club_id) {
            loadSubgroupsForFilter(subgroupFilter);
        }

        subgroupFilter.addEventListener('change', () => {
            currentSubgroupFilter = subgroupFilter.value;
            loadLeaderboards();
        });
    }

    if (genderFilter) {
        genderFilter.addEventListener('change', () => {
            currentGenderFilter = genderFilter.value;
            loadLeaderboards();
        });
    }
}

async function loadSubgroupsForFilter(selectElement) {
    try {
        const { data: subgroups } = await supabase
            .from('subgroups')
            .select('id, name')
            .eq('club_id', currentUserData.club_id)
            .order('name');

        if (subgroups && subgroups.length > 0) {
            subgroups.forEach(sg => {
                const option = document.createElement('option');
                option.value = sg.id;
                option.textContent = `📁 ${sg.name}`;
                selectElement.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading subgroups:', error);
    }
}

// --- Update Stats Display ---
function updateStatsDisplay() {
    const xpEl = document.getElementById('player-xp');
    const eloEl = document.getElementById('player-elo');
    const pointsEl = document.getElementById('player-points');

    if (xpEl) xpEl.textContent = currentUserData.xp || 0;
    if (eloEl) eloEl.textContent = currentUserData.elo_rating || 1000;
    if (pointsEl) pointsEl.textContent = currentUserData.points || 0;
}

// --- Update Rank Display ---
function updateRankDisplay() {
    const rankInfo = document.getElementById('rank-info');
    if (!rankInfo) return;

    const xp = currentUserData.xp || 0;
    let currentRank = RANKS[0];
    let nextRank = RANKS[1];

    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (xp >= RANKS[i].minXP) {
            currentRank = RANKS[i];
            nextRank = RANKS[i + 1] || null;
            break;
        }
    }

    let html = `
        <div class="text-center">
            <p class="text-4xl mb-2">${currentRank.icon}</p>
            <p class="text-xl font-bold text-indigo-600">${currentRank.name}</p>
            <p class="text-sm text-gray-500">${xp} XP</p>
    `;

    if (nextRank) {
        const progress = ((xp - currentRank.minXP) / (nextRank.minXP - currentRank.minXP)) * 100;
        html += `
            <div class="mt-4">
                <p class="text-xs text-gray-500 mb-1">Nächster Rang: ${nextRank.icon} ${nextRank.name}</p>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-indigo-600 h-2 rounded-full" style="width: ${Math.min(progress, 100)}%"></div>
                </div>
                <p class="text-xs text-gray-400 mt-1">${nextRank.minXP - xp} XP bis zum Aufstieg</p>
            </div>
        `;
    } else {
        html += `<p class="text-sm text-green-600 mt-2">Höchster Rang erreicht!</p>`;
    }

    html += '</div>';
    rankInfo.innerHTML = html;
}

// --- Load Leaderboards ---
async function loadLeaderboards() {
    const container = document.getElementById('leaderboard-content-wrapper');
    if (!container) return;

    try {
        let query = supabase
            .from('profiles')
            .select('id, display_name, avatar_url, xp, elo_rating, points, role')
            .neq('role', 'admin');

        // Apply filters
        if (currentSubgroupFilter === 'club' && currentUserData.club_id) {
            query = query.eq('club_id', currentUserData.club_id);
        } else if (currentSubgroupFilter === 'global') {
            // No filter for global
        } else if (currentSubgroupFilter && currentSubgroupFilter !== 'club' && currentSubgroupFilter !== 'global') {
            query = query.eq('subgroup_id', currentSubgroupFilter);
        }

        if (currentGenderFilter !== 'all') {
            query = query.eq('gender', currentGenderFilter);
        }

        const { data: players, error } = await query.order('elo_rating', { ascending: false }).limit(50);

        if (error) throw error;

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${renderLeaderboard('Skill (Elo)', players, 'elo_rating', '⚡')}
                ${renderLeaderboard('Fleiß (XP)', [...players].sort((a, b) => (b.xp || 0) - (a.xp || 0)), 'xp', '💪')}
                ${renderLeaderboard('Season (Punkte)', [...players].sort((a, b) => (b.points || 0) - (a.points || 0)), 'points', '🏆')}
            </div>
        `;

    } catch (error) {
        console.error('Error loading leaderboards:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden der Ranglisten</p>';
    }
}

function renderLeaderboard(title, players, field, icon) {
    const top10 = players.slice(0, 10);
    const currentUserRank = players.findIndex(p => p.id === currentUser.id) + 1;

    let html = `
        <div class="bg-white p-4 rounded-xl shadow-md">
            <h3 class="text-lg font-semibold mb-3">${icon} ${title}</h3>
            <div class="space-y-2">
    `;

    top10.forEach((player, index) => {
        const isCurrentUser = player.id === currentUser.id;
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

        html += `
            <div class="flex items-center justify-between p-2 rounded ${isCurrentUser ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50'}">
                <div class="flex items-center gap-2">
                    <span class="w-6 text-center">${medal}</span>
                    <img src="${player.avatar_url || '/images/default-avatar.png'}"
                         class="w-8 h-8 rounded-full object-cover"
                         onerror="this.src='/images/default-avatar.png'">
                    <span class="${isCurrentUser ? 'font-semibold' : ''}">${player.display_name || 'Unbekannt'}</span>
                </div>
                <span class="font-bold text-indigo-600">${player[field] || 0}</span>
            </div>
        `;
    });

    // Show current user's rank if not in top 10
    if (currentUserRank > 10) {
        const currentPlayer = players[currentUserRank - 1];
        html += `
            <div class="border-t mt-2 pt-2">
                <div class="flex items-center justify-between p-2 bg-indigo-50 border border-indigo-200 rounded">
                    <div class="flex items-center gap-2">
                        <span class="w-6 text-center">${currentUserRank}.</span>
                        <span class="font-semibold">Du</span>
                    </div>
                    <span class="font-bold text-indigo-600">${currentPlayer[field] || 0}</span>
                </div>
            </div>
        `;
    }

    html += '</div></div>';
    return html;
}

// --- Load Points History ---
async function loadPointsHistory() {
    const container = document.getElementById('points-history');
    if (!container) return;

    try {
        const { data: history, error } = await supabase
            .from('points_history')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!history || history.length === 0) {
            container.innerHTML = '<li class="text-gray-500 text-center">Noch keine Punkte-Historie</li>';
            return;
        }

        container.innerHTML = history.map(entry => `
            <li class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                    <span class="text-sm">${entry.description || entry.reason || 'Punkte'}</span>
                    <span class="text-xs text-gray-400 block">${formatDate(entry.created_at)}</span>
                </div>
                <span class="font-bold ${entry.points >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${entry.points >= 0 ? '+' : ''}${entry.points}
                </span>
            </li>
        `).join('');

    } catch (error) {
        console.error('Error loading points history:', error);
        container.innerHTML = '<li class="text-red-500">Fehler beim Laden</li>';
    }
}

// --- Load Challenges ---
async function loadChallenges() {
    const container = document.getElementById('challenges-list');
    if (!container) return;

    try {
        const { data: challenges, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', currentUserData.club_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!challenges || challenges.length === 0) {
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Keine aktiven Challenges</p>';
            return;
        }

        container.innerHTML = challenges.map(challenge => `
            <div class="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200 cursor-pointer hover:shadow-md transition"
                 onclick="openChallengeModal('${challenge.id}')">
                <h4 class="font-semibold text-purple-800">${challenge.name}</h4>
                <p class="text-sm text-gray-600 mt-1 line-clamp-2">${challenge.description || ''}</p>
                <div class="flex justify-between items-center mt-3">
                    <span class="text-xs text-purple-600">${challenge.xp_reward || 0} XP</span>
                    <span class="text-xs text-gray-400">${formatDate(challenge.expires_at)}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading challenges:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden der Challenges</p>';
    }
}

// --- Load Exercises ---
async function loadExercises() {
    const container = document.getElementById('exercises-list');
    if (!container) return;

    try {
        const { data: exercises, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (error) throw error;

        if (!exercises || exercises.length === 0) {
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Keine Übungen verfügbar</p>';
            return;
        }

        container.innerHTML = exercises.map(exercise => `
            <div class="bg-white p-4 rounded-lg border hover:shadow-md transition cursor-pointer"
                 onclick="openExerciseModal('${exercise.id}')">
                <div class="aspect-video bg-gray-100 rounded mb-3 overflow-hidden">
                    <img src="${exercise.image_url || '/images/exercise-placeholder.png'}"
                         alt="${exercise.name}"
                         class="w-full h-full object-cover"
                         onerror="this.src='/images/exercise-placeholder.png'">
                </div>
                <h4 class="font-semibold">${exercise.name}</h4>
                <p class="text-sm text-gray-600 mt-1 line-clamp-2">${exercise.description || ''}</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">${exercise.xp_reward || 0} XP</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading exercises:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden der Übungen</p>';
    }
}

// --- Load Match Requests ---
async function loadMatchRequests() {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    try {
        // Get pending requests where user is involved
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select(`
                *,
                requester:profiles!match_requests_requester_id_fkey(id, display_name, avatar_url),
                opponent:profiles!match_requests_opponent_id_fkey(id, display_name, avatar_url)
            `)
            .or(`requester_id.eq.${currentUser.id},opponent_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            return;
        }

        container.innerHTML = requests.map(req => {
            const isRequester = req.requester_id === currentUser.id;
            const otherPlayer = isRequester ? req.opponent : req.requester;
            const statusText = req.status === 'pending_player' ? 'Warte auf Spieler' : 'Warte auf Coach';

            return `
                <div class="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div class="flex items-center gap-3">
                        <img src="${otherPlayer?.avatar_url || '/images/default-avatar.png'}"
                             class="w-10 h-10 rounded-full object-cover">
                        <div>
                            <p class="font-medium">${isRequester ? 'Anfrage an' : 'Anfrage von'} ${otherPlayer?.display_name || 'Unbekannt'}</p>
                            <p class="text-xs text-gray-500">${statusText}</p>
                        </div>
                    </div>
                    ${!isRequester && req.status === 'pending_player' ? `
                        <div class="flex gap-2">
                            <button onclick="respondToMatchRequest('${req.id}', true)"
                                    class="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                                Annehmen
                            </button>
                            <button onclick="respondToMatchRequest('${req.id}', false)"
                                    class="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                                Ablehnen
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Update badge
        const badge = document.getElementById('match-request-badge');
        if (badge) {
            const pendingCount = requests.filter(r => r.opponent_id === currentUser.id && r.status === 'pending_player').length;
            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

    } catch (error) {
        console.error('Error loading match requests:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden</p>';
    }
}

// --- Load Calendar ---
async function loadCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYearEl = document.getElementById('calendar-month-year');
    if (!grid) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Update month display
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    if (monthYearEl) monthYearEl.textContent = `${monthNames[month]} ${year}`;

    // Get first and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Load attendance for this month
    let attendanceDates = [];
    if (currentUserData.club_id) {
        try {
            const { data } = await supabase
                .from('attendance')
                .select('date')
                .eq('user_id', currentUser.id)
                .eq('present', true)
                .gte('date', firstDay.toISOString().split('T')[0])
                .lte('date', lastDay.toISOString().split('T')[0]);

            attendanceDates = (data || []).map(a => a.date);
        } catch (error) {
            console.error('Error loading attendance:', error);
        }
    }

    // Build calendar grid
    let html = '';

    // Empty cells for days before first of month
    const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
    for (let i = 0; i < startDay; i++) {
        html += '<div></div>';
    }

    // Days of month
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isPresent = attendanceDates.includes(dateStr);
        const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();

        html += `
            <div class="aspect-square flex items-center justify-center text-sm rounded-lg border
                        ${isPresent ? 'calendar-day-present' : 'bg-white'}
                        ${isToday ? 'ring-2 ring-indigo-500' : ''}">
                ${day}
            </div>
        `;
    }

    grid.innerHTML = html;

    // Update stats
    const trainingDaysEl = document.getElementById('stats-training-days');
    if (trainingDaysEl) trainingDaysEl.textContent = attendanceDates.length;

    const statsMonthEl = document.getElementById('stats-month-name');
    if (statsMonthEl) statsMonthEl.textContent = monthNames[month];
}

// --- Season Countdown ---
function updateSeasonCountdown() {
    const countdownEl = document.getElementById('season-countdown');
    if (!countdownEl) return;

    // Season ends every 6 weeks from a fixed start date
    const seasonStart = new Date('2024-01-01');
    const now = new Date();
    const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
    const currentSeasonWeek = weeksSinceStart % 6;
    const daysLeft = (6 - currentSeasonWeek) * 7 - now.getDay();

    countdownEl.textContent = `${Math.max(0, daysLeft)} Tage`;
}

// --- Realtime Subscriptions ---
function setupRealtimeSubscriptions() {
    // Subscribe to profile changes
    const profileSub = supabase
        .channel('profile_changes')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${currentUser.id}`
        }, payload => {
            console.log('[DASHBOARD-SUPABASE] Profile updated:', payload.new);
            currentUserData = { ...currentUserData, ...payload.new };
            updateStatsDisplay();
            updateRankDisplay();
        })
        .subscribe();

    realtimeSubscriptions.push(profileSub);

    // Subscribe to match requests
    if (currentUserData.club_id) {
        const matchRequestSub = supabase
            .channel('match_request_changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'match_requests',
                filter: `club_id=eq.${currentUserData.club_id}`
            }, () => {
                loadMatchRequests();
            })
            .subscribe();

        realtimeSubscriptions.push(matchRequestSub);
    }
}

// --- Helper Functions ---
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showError(message) {
    const pageLoader = document.getElementById('page-loader');
    if (pageLoader) {
        pageLoader.innerHTML = `
            <div class="text-center">
                <p class="text-red-500 text-xl mb-4">❌</p>
                <p class="text-red-600">${message}</p>
                <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded">
                    Neu laden
                </button>
            </div>
        `;
    }
}

// --- Global Functions for onclick handlers ---
window.openExerciseModal = async (exerciseId) => {
    // TODO: Implement exercise modal
    console.log('Open exercise:', exerciseId);
};

window.openChallengeModal = async (challengeId) => {
    // TODO: Implement challenge modal
    console.log('Open challenge:', challengeId);
};

window.respondToMatchRequest = async (requestId, accept) => {
    try {
        const newStatus = accept ? 'pending_coach' : 'rejected';
        const { error } = await supabase
            .from('match_requests')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', requestId);

        if (error) throw error;

        loadMatchRequests();
    } catch (error) {
        console.error('Error responding to match request:', error);
        alert('Fehler beim Verarbeiten der Anfrage');
    }
};

console.log('[DASHBOARD-SUPABASE] Script loaded');
