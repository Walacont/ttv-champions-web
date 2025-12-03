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
    setupModalHandlers();

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
// Default avatar as data URL (simple gray circle with user icon)
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4=';

function setupHeader() {
    // Profile picture
    const headerPic = document.getElementById('header-profile-pic');
    if (headerPic) {
        headerPic.src = currentUserData.avatar_url || DEFAULT_AVATAR;
        headerPic.onerror = () => { headerPic.src = DEFAULT_AVATAR; };
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

// --- Leaderboard State ---
let currentLeaderboardTab = 'xp'; // 'xp', 'elo', 'points'
let currentLeaderboardScope = 'club'; // 'club', 'global'
let leaderboardCache = { club: null, global: null };

// --- Load Leaderboards ---
async function loadLeaderboards() {
    const container = document.getElementById('leaderboard-content-wrapper');
    if (!container) return;

    // Render the leaderboard structure
    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

            <!-- Tabs -->
            <div class="flex justify-center border-b border-gray-200 mb-4">
                <button id="lb-tab-xp" class="lb-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                    <div>Fleiß</div>
                    <div class="text-xs text-gray-500 font-normal">(XP)</div>
                </button>
                <button id="lb-tab-elo" class="lb-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                    <div>Skill</div>
                    <div class="text-xs text-gray-500 font-normal">(Elo)</div>
                </button>
                <button id="lb-tab-points" class="lb-tab-btn px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                    <div>Season</div>
                    <div class="text-xs text-gray-500 font-normal">(Punkte)</div>
                </button>
            </div>

            <!-- Club/Global Toggle -->
            ${currentUserData.club_id ? `
            <div class="flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100 mb-4">
                <button id="lb-scope-club" class="lb-scope-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors">Mein Verein</button>
                <button id="lb-scope-global" class="lb-scope-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors">Global</button>
            </div>
            ` : ''}

            <!-- Leaderboard Content -->
            <div id="leaderboard-list" class="mt-4 space-y-2">
                <p class="text-center text-gray-500 py-8">Lade Rangliste...</p>
            </div>
        </div>
    `;

    // Setup tab listeners
    document.querySelectorAll('.lb-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.id.replace('lb-tab-', '');
            currentLeaderboardTab = tab;
            updateLeaderboardTabs();
            renderLeaderboardList();
        });
    });

    // Setup scope listeners
    document.querySelectorAll('.lb-scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scope = btn.id.replace('lb-scope-', '');
            currentLeaderboardScope = scope;
            updateLeaderboardScope();
            renderLeaderboardList();
        });
    });

    // Initial state
    updateLeaderboardTabs();
    updateLeaderboardScope();

    // Load data
    await fetchLeaderboardData();
    renderLeaderboardList();
}

function updateLeaderboardTabs() {
    document.querySelectorAll('.lb-tab-btn').forEach(btn => {
        const tab = btn.id.replace('lb-tab-', '');
        if (tab === currentLeaderboardTab) {
            btn.classList.add('border-indigo-500', 'text-indigo-600');
            btn.classList.remove('border-transparent');
        } else {
            btn.classList.remove('border-indigo-500', 'text-indigo-600');
            btn.classList.add('border-transparent');
        }
    });
}

function updateLeaderboardScope() {
    document.querySelectorAll('.lb-scope-btn').forEach(btn => {
        const scope = btn.id.replace('lb-scope-', '');
        if (scope === currentLeaderboardScope) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
            btn.classList.remove('text-gray-600');
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
            btn.classList.add('text-gray-600');
        }
    });
}

async function fetchLeaderboardData() {
    try {
        // Fetch club data
        if (currentUserData.club_id) {
            const { data: clubPlayers } = await supabase
                .from('profiles')
                .select('id, display_name, avatar_url, xp, elo_rating, points, role')
                .eq('club_id', currentUserData.club_id)
                .neq('role', 'admin')
                .limit(100);
            leaderboardCache.club = clubPlayers || [];
        }

        // Fetch global data
        const { data: globalPlayers } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, xp, elo_rating, points, role')
            .neq('role', 'admin')
            .limit(100);
        leaderboardCache.global = globalPlayers || [];

    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
    }
}

function renderLeaderboardList() {
    const container = document.getElementById('leaderboard-list');
    if (!container) return;

    const players = leaderboardCache[currentLeaderboardScope] || [];

    // Sort by current tab
    const fieldMap = { xp: 'xp', elo: 'elo_rating', points: 'points' };
    const field = fieldMap[currentLeaderboardTab];
    const sorted = [...players].sort((a, b) => (b[field] || 0) - (a[field] || 0));

    const top15 = sorted.slice(0, 15);
    const currentUserRank = sorted.findIndex(p => p.id === currentUser.id) + 1;
    const currentPlayerData = sorted.find(p => p.id === currentUser.id);

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
        return;
    }

    let html = '';

    top15.forEach((player, index) => {
        const isCurrentUser = player.id === currentUser.id;
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        const value = player[field] || 0;

        html += `
            <div class="flex items-center justify-between p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-gray-50 hover:bg-gray-100'} transition-colors">
                <div class="flex items-center gap-3">
                    <span class="w-8 text-center font-bold ${rank <= 3 ? 'text-lg' : 'text-gray-500'}">${medal}</span>
                    <img src="${player.avatar_url || DEFAULT_AVATAR}"
                         class="w-10 h-10 rounded-full object-cover border-2 ${isCurrentUser ? 'border-indigo-400' : 'border-gray-200'}"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <span class="${isCurrentUser ? 'font-bold text-indigo-700' : 'font-medium'}">${player.display_name || 'Unbekannt'}</span>
                        ${isCurrentUser ? '<span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>' : ''}
                    </div>
                </div>
                <span class="font-bold text-lg ${currentLeaderboardTab === 'xp' ? 'text-purple-600' : currentLeaderboardTab === 'elo' ? 'text-blue-600' : 'text-yellow-600'}">${value}</span>
            </div>
        `;
    });

    // Show current user if not in top 15
    if (currentUserRank > 15 && currentPlayerData) {
        html += `
            <div class="border-t-2 border-dashed border-gray-300 mt-4 pt-4">
                <div class="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border-2 border-indigo-300">
                    <div class="flex items-center gap-3">
                        <span class="w-8 text-center font-bold text-gray-500">${currentUserRank}.</span>
                        <img src="${currentPlayerData.avatar_url || DEFAULT_AVATAR}"
                             class="w-10 h-10 rounded-full object-cover border-2 border-indigo-400"
                             onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <span class="font-bold text-indigo-700">${currentPlayerData.display_name || 'Du'}</span>
                            <span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>
                        </div>
                    </div>
                    <span class="font-bold text-lg ${currentLeaderboardTab === 'xp' ? 'text-purple-600' : currentLeaderboardTab === 'elo' ? 'text-blue-600' : 'text-yellow-600'}">${currentPlayerData[field] || 0}</span>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
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

    // Skip if user has no club
    if (!currentUserData.club_id) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Tritt einem Verein bei um Challenges zu sehen</p>';
        return;
    }

    try {
        const { data: challenges, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', currentUserData.club_id)
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
                    <img src="${exercise.image_url || ''}"
                         alt="${exercise.name}"
                         class="w-full h-full object-cover"
                         onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-4xl\\'>🏓</div>'">
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
        // Schema uses player_a_id and player_b_id (not requester_id/opponent_id)
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            return;
        }

        // Get unique user IDs to fetch profiles
        const userIds = [...new Set(requests.flatMap(r => [r.player_a_id, r.player_b_id]))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', userIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        container.innerHTML = requests.map(req => {
            // player_a is usually the one who created the request
            const isPlayerA = req.player_a_id === currentUser.id;
            const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
            const otherPlayer = profileMap[otherPlayerId];
            const statusText = req.status === 'pending_player' ? 'Warte auf Spieler' : 'Warte auf Coach';

            return `
                <div class="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div class="flex items-center gap-3">
                        <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}"
                             class="w-10 h-10 rounded-full object-cover"
                             onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayer?.display_name || 'Unbekannt'}</p>
                            <p class="text-xs text-gray-500">${statusText}</p>
                        </div>
                    </div>
                    ${!isPlayerA && req.status === 'pending_player' ? `
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
            const pendingCount = requests.filter(r => r.player_b_id === currentUser.id && r.status === 'pending_player').length;
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

// --- Helper: Escape HTML ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Helper: Render Table for Display ---
function renderTableForDisplay(tableData) {
    if (!tableData || !tableData.headers || !tableData.rows) {
        return '';
    }

    let html = '<table class="exercise-display-table border-collapse w-full my-3">';

    // Headers
    html += '<thead><tr>';
    tableData.headers.forEach(header => {
        html += `<th class="border border-gray-400 bg-gray-100 px-3 py-2 font-semibold text-left">${escapeHtml(header)}</th>`;
    });
    html += '</tr></thead>';

    // Rows
    html += '<tbody>';
    tableData.rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td class="border border-gray-300 px-3 py-2">${escapeHtml(cell)}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
}

// --- Setup Modal Handlers ---
function setupModalHandlers() {
    // Exercise modal close
    const closeExerciseModal = document.getElementById('close-exercise-modal');
    if (closeExerciseModal) {
        closeExerciseModal.addEventListener('click', () => {
            document.getElementById('exercise-modal')?.classList.add('hidden');
        });
    }

    // Challenge modal close
    const closeChallengeModal = document.getElementById('close-challenge-modal');
    if (closeChallengeModal) {
        closeChallengeModal.addEventListener('click', () => {
            document.getElementById('challenge-modal')?.classList.add('hidden');
        });
    }

    // Close modals on backdrop click
    document.getElementById('exercise-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'exercise-modal') {
            e.target.classList.add('hidden');
        }
    });

    document.getElementById('challenge-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'challenge-modal') {
            e.target.classList.add('hidden');
        }
    });

    // Abbreviations toggle
    const toggleAbbreviations = document.getElementById('toggle-abbreviations');
    const abbreviationsContent = document.getElementById('abbreviations-content');
    const abbreviationsIcon = document.getElementById('abbreviations-icon');

    if (toggleAbbreviations && abbreviationsContent) {
        toggleAbbreviations.addEventListener('click', () => {
            abbreviationsContent.classList.toggle('hidden');
            if (abbreviationsIcon) {
                abbreviationsIcon.style.transform = abbreviationsContent.classList.contains('hidden')
                    ? 'rotate(0deg)'
                    : 'rotate(180deg)';
            }
        });
    }
}

// --- Global Functions for onclick handlers ---
window.openExerciseModal = async (exerciseId) => {
    const modal = document.getElementById('exercise-modal');
    if (!modal) return;

    try {
        // Fetch exercise data
        const { data: exercise, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (error || !exercise) {
            console.error('Error loading exercise:', error);
            alert('Übung konnte nicht geladen werden');
            return;
        }

        // Set title
        const titleEl = document.getElementById('modal-exercise-title');
        if (titleEl) titleEl.textContent = exercise.name || exercise.title || '';

        // Handle image
        const imageEl = document.getElementById('modal-exercise-image');
        if (imageEl) {
            if (exercise.image_url) {
                imageEl.src = exercise.image_url;
                imageEl.alt = exercise.name || exercise.title || '';
                imageEl.style.display = 'block';
                imageEl.onerror = () => { imageEl.style.display = 'none'; };
            } else {
                imageEl.style.display = 'none';
            }
        }

        // Handle description content (can be text or table)
        const descriptionEl = document.getElementById('modal-exercise-description');
        if (descriptionEl) {
            let descriptionContent = exercise.description_content || exercise.descriptionContent || exercise.description;

            // Try to parse as JSON (for table or structured content)
            let descriptionData = null;
            try {
                if (typeof descriptionContent === 'string') {
                    descriptionData = JSON.parse(descriptionContent);
                } else {
                    descriptionData = descriptionContent;
                }
            } catch (e) {
                // Not JSON, treat as plain text
                descriptionData = { type: 'text', text: descriptionContent || '' };
            }

            if (descriptionData && descriptionData.type === 'table') {
                const tableHtml = renderTableForDisplay(descriptionData.tableData);
                const additionalText = descriptionData.additionalText || '';
                descriptionEl.innerHTML =
                    tableHtml +
                    (additionalText
                        ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>`
                        : '');
            } else {
                descriptionEl.textContent = descriptionData?.text || exercise.description || '';
                descriptionEl.style.whiteSpace = 'pre-wrap';
            }
        }

        // Handle tags
        const tagsContainer = document.getElementById('modal-exercise-tags');
        if (tagsContainer) {
            const tags = exercise.tags || [];
            if (tags.length > 0) {
                tagsContainer.innerHTML = tags
                    .map(tag =>
                        `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${escapeHtml(tag)}</span>`
                    )
                    .join('');
            } else {
                tagsContainer.innerHTML = '';
            }
        }

        // Handle points and milestones
        const pointsEl = document.getElementById('modal-exercise-points');
        const milestonesContainer = document.getElementById('modal-exercise-milestones');

        // Parse tieredPoints if it's a string
        let tieredPointsData = exercise.tiered_points || exercise.tieredPoints;
        if (typeof tieredPointsData === 'string') {
            try {
                tieredPointsData = JSON.parse(tieredPointsData);
            } catch (e) {
                tieredPointsData = null;
            }
        }

        const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;
        const points = exercise.xp_reward || exercise.points || 0;

        // Load player progress if milestones exist
        let playerProgress = null;
        if (hasTieredPoints && currentUser) {
            try {
                const { data: progressData } = await supabase
                    .from('exercise_milestones')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .eq('exercise_id', exerciseId)
                    .single();
                playerProgress = progressData;
            } catch (e) {
                // No progress yet
            }
        }

        const currentCount = playerProgress?.current_count || 0;

        if (hasTieredPoints) {
            if (pointsEl) pointsEl.textContent = `🎯 Bis zu ${points} P.`;

            if (milestonesContainer) {
                // Player progress section
                let progressHtml = '';
                const nextMilestone = tieredPointsData.milestones.find(m => m.count > currentCount);
                const remaining = nextMilestone ? nextMilestone.count - currentCount : 0;

                progressHtml = `
                    <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-lg">📈</span>
                            <span class="font-bold text-gray-800">Deine beste Leistung</span>
                        </div>
                        <p class="text-base text-gray-700 mb-2">
                            Persönlicher Rekord: <span class="font-bold text-blue-600">${currentCount} Wiederholungen</span>
                        </p>
                        ${nextMilestone
                            ? `<p class="text-sm text-gray-600">
                                Noch <span class="font-semibold text-orange-600">${remaining} Wiederholungen</span> bis zum nächsten Meilenstein
                            </p>`
                            : `<p class="text-sm text-green-600 font-semibold">
                                ✓ Alle Meilensteine erreicht!
                            </p>`
                        }
                    </div>
                `;

                // Milestones list
                const milestonesHtml = tieredPointsData.milestones
                    .sort((a, b) => a.count - b.count)
                    .map((milestone, index) => {
                        const isFirst = index === 0;
                        const displayPoints = isFirst
                            ? milestone.points
                            : `+${milestone.points - tieredPointsData.milestones[index - 1].points}`;

                        let bgColor, borderColor, iconColor, textColor, statusIcon;
                        if (currentCount >= milestone.count) {
                            bgColor = 'bg-gradient-to-r from-green-50 to-emerald-50';
                            borderColor = 'border-green-300';
                            iconColor = 'text-green-600';
                            textColor = 'text-green-700';
                            statusIcon = '✓';
                        } else if (index === 0 || currentCount >= tieredPointsData.milestones[index - 1].count) {
                            bgColor = 'bg-gradient-to-r from-orange-50 to-amber-50';
                            borderColor = 'border-orange-300';
                            iconColor = 'text-orange-600';
                            textColor = 'text-orange-700';
                            statusIcon = '🎯';
                        } else {
                            bgColor = 'bg-gradient-to-r from-gray-50 to-slate-50';
                            borderColor = 'border-gray-300';
                            iconColor = 'text-gray-500';
                            textColor = 'text-gray-600';
                            statusIcon = '⚪';
                        }

                        return `<div class="flex justify-between items-center py-3 px-4 ${bgColor} rounded-lg mb-2 border ${borderColor}">
                            <div class="flex items-center gap-3">
                                <span class="text-2xl">${statusIcon}</span>
                                <span class="text-base font-semibold ${textColor}">${milestone.count} Wiederholungen</span>
                            </div>
                            <div class="text-right">
                                <div class="text-xl font-bold ${iconColor}">${displayPoints} P.</div>
                                <div class="text-xs text-gray-500 font-medium">Gesamt: ${milestone.points} P.</div>
                            </div>
                        </div>`;
                    })
                    .join('');

                milestonesContainer.innerHTML = `
                    <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                        <h4 class="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                            <span class="text-2xl">📊</span>
                            <span>Meilensteine</span>
                        </h4>
                        ${progressHtml}
                        ${milestonesHtml}
                    </div>`;
                milestonesContainer.classList.remove('hidden');
            }
        } else {
            if (pointsEl) pointsEl.textContent = `+${points} XP`;
            if (milestonesContainer) {
                milestonesContainer.innerHTML = '';
                milestonesContainer.classList.add('hidden');
            }
        }

        // Show modal
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('Error opening exercise modal:', error);
        alert('Fehler beim Laden der Übung');
    }
};

window.openChallengeModal = async (challengeId) => {
    const modal = document.getElementById('challenge-modal');
    if (!modal) return;

    try {
        // Fetch challenge data
        const { data: challenge, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('id', challengeId)
            .single();

        if (error || !challenge) {
            console.error('Error loading challenge:', error);
            alert('Challenge konnte nicht geladen werden');
            return;
        }

        // Set title
        const titleEl = document.getElementById('modal-challenge-title');
        if (titleEl) titleEl.textContent = challenge.name || '';

        // Set description
        const descriptionEl = document.getElementById('modal-challenge-description');
        if (descriptionEl) descriptionEl.textContent = challenge.description || '';

        // Set points
        const pointsEl = document.getElementById('modal-challenge-points');
        if (pointsEl) pointsEl.textContent = `+${challenge.xp_reward || 0} XP`;

        // Show modal
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('Error opening challenge modal:', error);
        alert('Fehler beim Laden der Challenge');
    }
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
