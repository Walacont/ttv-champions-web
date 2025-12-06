// SC Champions - Dashboard (Supabase Version)
// Komplett neue Version ohne Firebase-Abhängigkeiten
// Multi-sport support: Dashboard shows data filtered by active sport

import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { RANK_ORDER, groupPlayersByRank, calculateRank, getRankProgress } from './ranks.js';
import { loadDoublesLeaderboard } from './doubles-matches-supabase.js';
import { initializeLeaderboardPreferences, applyPreferences } from './leaderboard-preferences-supabase.js';
import { initializeWidgetSystem } from './dashboard-widgets-supabase.js';
import { AGE_GROUPS } from './ui-utils-supabase.js';
import { showHeadToHeadModal } from './head-to-head-supabase.js';
import { getSportContext, isCoachInSport } from './sport-context-supabase.js';
import { setLeaderboardSportFilter } from './leaderboard-supabase.js';

console.log('[DASHBOARD-SUPABASE] Script starting...');

const supabase = getSupabase();

// --- State ---
let currentUser = null;
let currentUserData = null;
let currentClubData = null;
let currentSportContext = null; // Multi-sport: stores sportId, clubId, role for active sport
let realtimeSubscriptions = [];
let currentSubgroupFilter = 'club';
let currentGenderFilter = 'all';
let currentAgeGroupFilter = 'all';

// Cache for test club filtering
let testClubIdsCache = null;

/**
 * Load test club IDs for filtering (with caching)
 */
async function loadTestClubIds() {
    if (testClubIdsCache !== null) return testClubIdsCache;

    try {
        const { data: clubs } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        testClubIdsCache = (clubs || [])
            .filter(c => c.is_test_club === true)
            .map(c => c.id);
    } catch (error) {
        console.error('Error loading test club IDs:', error);
        testClubIdsCache = [];
    }

    return testClubIdsCache;
}

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
            name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
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
async function initializeDashboard() {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');

    // Hide loader, show content
    if (pageLoader) pageLoader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    // Load sport context for multi-sport filtering
    // This determines the active sport, club, and role
    currentSportContext = await getSportContext(currentUser.id);
    console.log('[DASHBOARD-SUPABASE] Sport context loaded:', currentSportContext);

    // Set leaderboard sport filter for multi-sport support
    if (currentSportContext?.sportId) {
        setLeaderboardSportFilter(currentSportContext.sportId);
    }

    // Setup UI
    setupHeader();
    setupTabs();
    setupLogout();
    setupFilters();
    setupModalHandlers();

    // Initialize leaderboard preferences (must be after tabs are set up)
    // Use club from sport context if available (user might be in different clubs for different sports)
    const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;
    const userData = {
        id: currentUser.id,
        clubId: effectiveClubId,
        leaderboardPreferences: currentUserData.leaderboard_preferences
    };
    initializeLeaderboardPreferences(userData, supabase);

    // Load data
    updateStatsDisplay();
    updateRankDisplay();
    loadRivalData();
    loadLeaderboards();
    loadPointsHistory();
    loadChallenges();
    loadExercises();
    loadMatchRequests();
    loadPendingRequests();
    loadMatchHistory();
    loadCalendar();
    // Initialize season countdown (efficient: loads once, updates display every second)
    initSeasonCountdown();

    // Setup match form
    setupMatchForm();

    // Initialize widget system (customizable dashboard)
    initializeWidgetSystem(supabase, currentUser.id, currentUserData);

    // Populate player subgroup filter with age groups
    await populatePlayerSubgroupFilter(currentUserData);

    // Show coach switch button only if user is coach in the ACTIVE SPORT
    // User might be coach in one sport but player in another
    const isCoachInActiveSport = currentSportContext?.role === 'coach';
    if (isCoachInActiveSport) {
        const switchBtn = document.getElementById('switch-to-coach-btn');
        if (switchBtn) switchBtn.classList.remove('hidden');
    }

    // Show no-club info if needed
    const effectiveClub = currentSportContext?.clubId || currentUserData.club_id;
    if (!effectiveClub) {
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
        headerPic.src = currentUserData.photo_url || DEFAULT_AVATAR;
        headerPic.onerror = () => { headerPic.src = DEFAULT_AVATAR; };
    }

    // Welcome message
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) {
        const name = currentUserData.first_name || 'Spieler';
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
    const ageGroupFilter = document.getElementById('player-age-group-filter');

    if (subgroupFilter) {
        // Load subgroups if user has a club
        if (currentUserData.club_id) {
            loadSubgroupsForFilter(subgroupFilter);
        }

        subgroupFilter.addEventListener('change', () => {
            currentSubgroupFilter = subgroupFilter.value;

            // Update leaderboard scope based on filter selection
            if (currentSubgroupFilter === 'global') {
                currentLeaderboardScope = 'global';
            } else {
                // For 'club', age groups, and subgroups - use club data
                currentLeaderboardScope = 'club';
            }
            updateLeaderboardScope();

            // Re-render the leaderboard with new filter
            updateLeaderboardContent();
            loadRivalData(); // Update rivals when filter changes
        });
    }

    if (genderFilter) {
        genderFilter.addEventListener('change', () => {
            currentGenderFilter = genderFilter.value;
            // Just re-render the leaderboard with new filter
            updateLeaderboardContent();
        });
    }

    if (ageGroupFilter) {
        // Populate age groups - full list like original
        ageGroupFilter.innerHTML = `
            <option value="all">Alle Altersgruppen</option>
            <optgroup label="Jugend (nach Alter)">
                <option value="u11">U11</option>
                <option value="u13">U13</option>
                <option value="u15">U15</option>
                <option value="u17">U17</option>
                <option value="u19">U19</option>
            </optgroup>
            <optgroup label="Erwachsene">
                <option value="adult">Erwachsene (18-39)</option>
            </optgroup>
            <optgroup label="Senioren (nach Alter)">
                <option value="o40">Ü40</option>
                <option value="o45">Ü45</option>
                <option value="o50">Ü50</option>
                <option value="o55">Ü55</option>
                <option value="o60">Ü60</option>
                <option value="o65">Ü65</option>
                <option value="o70">Ü70</option>
                <option value="o75">Ü75</option>
                <option value="o80">Ü80</option>
                <option value="o85">Ü85</option>
            </optgroup>
        `;

        ageGroupFilter.addEventListener('change', () => {
            currentAgeGroupFilter = ageGroupFilter.value;
            // Just re-render the leaderboard with new filter
            updateLeaderboardContent();
        });
    }
}

// --- Calculate Age from Birthdate ---
function calculateAge(birthdate) {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// --- Check if player matches age group filter ---
function matchesAgeGroup(birthdate, ageGroupFilter) {
    if (ageGroupFilter === 'all') return true;
    const age = calculateAge(birthdate);
    if (age === null) return true; // Include players without birthdate

    // Youth groups (under X years) - stichtag-basiert like table tennis rules
    // U11 means player turns 11 or younger in current year
    switch (ageGroupFilter) {
        // Youth groups
        case 'u11': return age <= 10;
        case 'u13': return age <= 12;
        case 'u15': return age <= 14;
        case 'u17': return age <= 16;
        case 'u19': return age <= 18;
        // Adults
        case 'adult': return age >= 18 && age <= 39;
        // Seniors
        case 'o40': return age >= 40;
        case 'o45': return age >= 45;
        case 'o50': return age >= 50;
        case 'o55': return age >= 55;
        case 'o60': return age >= 60;
        case 'o65': return age >= 65;
        case 'o70': return age >= 70;
        case 'o75': return age >= 75;
        case 'o80': return age >= 80;
        case 'o85': return age >= 85;
        default: return true;
    }
}

async function loadSubgroupsForFilter(selectElement) {
    try {
        // Only load subgroups that the user is a member of
        const userSubgroupIds = currentUserData.subgroup_ids || [];

        if (userSubgroupIds.length === 0) {
            // User is not in any subgroups - don't show the section
            return;
        }

        const { data: subgroups } = await supabase
            .from('subgroups')
            .select('id, name')
            .eq('club_id', currentUserData.club_id)
            .in('id', userSubgroupIds)
            .order('name');

        if (subgroups && subgroups.length > 0) {
            // Create optgroup with header
            const optgroup = document.createElement('optgroup');
            optgroup.label = '📋 Meine Untergruppen im Verein';

            subgroups.forEach(sg => {
                const option = document.createElement('option');
                option.value = sg.id;
                option.textContent = sg.name;
                optgroup.appendChild(option);
            });

            selectElement.appendChild(optgroup);
        }
    } catch (error) {
        console.error('Error loading subgroups:', error);
    }
}

// --- Update Stats Display ---
// Uses sport-specific stats from user_sport_stats if available
async function updateStatsDisplay() {
    const xpEl = document.getElementById('player-xp');
    const eloEl = document.getElementById('player-elo');
    const pointsEl = document.getElementById('player-points');

    // Default values from profile
    let xp = currentUserData.xp || 0;
    let elo = currentUserData.elo_rating || 1000;
    let points = currentUserData.points || 0;

    // Try to get sport-specific stats
    const activeSportId = currentSportContext?.sportId || currentUserData.active_sport_id;
    if (activeSportId && currentUser?.id) {
        try {
            const { data: sportStats, error } = await supabase
                .from('user_sport_stats')
                .select('elo_rating, xp, points, wins, losses, matches_played')
                .eq('user_id', currentUser.id)
                .eq('sport_id', activeSportId)
                .maybeSingle();

            if (!error && sportStats) {
                xp = sportStats.xp || 0;
                elo = sportStats.elo_rating || 1000;
                points = sportStats.points || 0;
                console.log('[DASHBOARD] Using sport-specific stats:', { xp, elo, points });
            }
        } catch (err) {
            // Table might not exist yet, use profile defaults
            console.log('[DASHBOARD] user_sport_stats not available, using profile stats');
        }
    }

    if (xpEl) xpEl.textContent = xp;
    if (eloEl) eloEl.textContent = elo;
    if (pointsEl) pointsEl.textContent = points;
}

// --- Update Rank Display ---
function updateRankDisplay() {
    const rankInfo = document.getElementById('rank-info');
    if (!rankInfo) return;

    const grundlagenCount = currentUserData.grundlagen_completed || 0;
    const progress = getRankProgress(currentUserData.elo_rating, currentUserData.xp, grundlagenCount);
    const { currentRank, nextRank, eloProgress, xpProgress, grundlagenProgress, eloNeeded, xpNeeded, grundlagenNeeded, isMaxRank } = progress;

    let html = `
        <div class="flex items-center justify-center space-x-2 mb-2">
            <span class="text-4xl">${currentRank.emoji}</span>
            <div>
                <p class="font-bold text-xl" style="color: ${currentRank.color};">${currentRank.name}</p>
                <p class="text-xs text-gray-500">${currentRank.description}</p>
            </div>
        </div>
    `;

    if (!isMaxRank && nextRank) {
        html += `
            <div class="mt-3 text-sm">
                <p class="text-gray-600 font-medium mb-2">Fortschritt zu ${nextRank.emoji} ${nextRank.name}:</p>

                <!-- ELO Progress -->
                ${nextRank.minElo > 0 ? `
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Elo: ${currentUserData.elo_rating || 0}/${nextRank.minElo}</span>
                        <span>${eloProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                    </div>
                    ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ Elo-Anforderung erfüllt</p>`}
                </div>
                ` : ''}

                <!-- XP Progress -->
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>XP: ${currentUserData.xp || 0}/${nextRank.minXP}</span>
                        <span>${xpProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-purple-600 h-2 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                    </div>
                    ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ XP-Anforderung erfüllt</p>`}
                </div>

                <!-- Grundlagen Progress -->
                ${nextRank.requiresGrundlagen ? `
                <div>
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Grundlagen-Übungen: ${grundlagenCount}/${nextRank.grundlagenRequired || 5}</span>
                        <span>${grundlagenProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-green-600 h-2 rounded-full transition-all" style="width: ${grundlagenProgress}%"></div>
                    </div>
                    ${grundlagenNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''} bis du Wettkämpfe spielen kannst</p>` : `<p class="text-xs text-green-600 mt-1">✓ Grundlagen abgeschlossen - du kannst Wettkämpfe spielen!</p>`}
                </div>
                ` : ''}
            </div>
        `;
    } else {
        html += `<p class="text-sm text-green-600 font-medium mt-2">🏆 Höchster Rang erreicht!</p>`;
    }

    rankInfo.innerHTML = html;
}

// --- Load Rival Data ---
let rivalSubscription = null;

async function loadRivalData() {
    const rivalSkillEl = document.getElementById('rival-skill-info');
    const rivalEffortEl = document.getElementById('rival-effort-info');

    if (!rivalSkillEl && !rivalEffortEl) return;

    // Unsubscribe from previous subscription
    if (rivalSubscription) {
        rivalSubscription.unsubscribe();
        rivalSubscription = null;
    }

    try {
        // Get users in the current sport for multi-sport filtering
        let sportUserIds = null;
        const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;

        if (currentSportContext?.sportId) {
            const { data: sportUsers, error: sportError } = await supabase
                .from('profile_club_sports')
                .select('user_id')
                .eq('sport_id', currentSportContext.sportId);

            if (!sportError && sportUsers) {
                sportUserIds = sportUsers.map(su => su.user_id);
                console.log('[DASHBOARD] Rival filter: users in sport:', sportUserIds.length);
            }
        }

        // Build query based on filter
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, photo_url, elo_rating, xp, club_id')
            .in('role', ['player', 'coach']);

        // Apply sport filter first (if available)
        if (sportUserIds && sportUserIds.length > 0) {
            query = query.in('id', sportUserIds);
        }

        // Apply club/subgroup filter
        if (currentSubgroupFilter === 'club' && effectiveClubId) {
            // When sport filter is active, club filter means users in same sport AND same club
            if (sportUserIds) {
                // Filter already applied via sportUserIds, now filter by club
                const { data: clubSportUsers } = await supabase
                    .from('profile_club_sports')
                    .select('user_id')
                    .eq('sport_id', currentSportContext?.sportId)
                    .eq('club_id', effectiveClubId);

                if (clubSportUsers) {
                    const clubUserIds = clubSportUsers.map(u => u.user_id);
                    query = supabase
                        .from('profiles')
                        .select('id, first_name, last_name, photo_url, elo_rating, xp, club_id')
                        .in('role', ['player', 'coach'])
                        .in('id', clubUserIds);
                }
            } else {
                query = query.eq('club_id', effectiveClubId);
            }
        } else if (currentSubgroupFilter && currentSubgroupFilter.startsWith('subgroup:')) {
            // Custom subgroup filter - filter by subgroup_ids array
            const subgroupId = currentSubgroupFilter.replace('subgroup:', '');
            if (!sportUserIds) {
                query = query.eq('club_id', effectiveClubId);
            }
            query = query.contains('subgroup_ids', [subgroupId]);
        } else if (currentSubgroupFilter !== 'club' && currentSubgroupFilter !== 'global') {
            // Age group filter - apply club filter, age filtering done later
            if (effectiveClubId && !sportUserIds) {
                query = query.eq('club_id', effectiveClubId);
            }
        }
        // For 'global', only sport filter is applied (if available)

        const { data: players, error } = await query;
        if (error) throw error;

        updateRivalDisplay(players || [], rivalSkillEl, rivalEffortEl);

        // Set up real-time subscription for rival updates
        const channel = supabase
            .channel('rival-updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles'
            }, () => {
                // Reload rival data on any profile change
                loadRivalData();
            })
            .subscribe();

        rivalSubscription = channel;

    } catch (error) {
        console.error('Error loading rival data:', error);
        if (rivalSkillEl) rivalSkillEl.innerHTML = '<p class="text-gray-500">Rivalen konnten nicht geladen werden</p>';
        if (rivalEffortEl) rivalEffortEl.innerHTML = '<p class="text-gray-500">Rivalen konnten nicht geladen werden</p>';
    }
}

function updateRivalDisplay(players, rivalSkillEl, rivalEffortEl) {
    // Skill ranking (sorted by elo)
    const skillRanking = [...players].sort((a, b) => (b.elo_rating || 0) - (a.elo_rating || 0));
    const mySkillIndex = skillRanking.findIndex(p => p.id === currentUser.id);

    displayRivalInfo('Skill', skillRanking, mySkillIndex, rivalSkillEl, currentUserData.elo_rating || 0, 'Elo');

    // Effort ranking (sorted by xp)
    const effortRanking = [...players].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const myEffortIndex = effortRanking.findIndex(p => p.id === currentUser.id);

    displayRivalInfo('Fleiß', effortRanking, myEffortIndex, rivalEffortEl, currentUserData.xp || 0, 'XP');
}

function displayRivalInfo(metric, ranking, myRankIndex, el, myValue, unit) {
    if (!el) return;

    if (myRankIndex === 0) {
        el.innerHTML = `
            <p class="text-lg text-green-600 font-semibold">🎉 Glückwunsch!</p>
            <p class="text-sm">Du bist auf dem 1. Platz in ${metric}!</p>
        `;
    } else if (myRankIndex > 0) {
        const rival = ranking[myRankIndex - 1];
        const rivalValue = unit === 'Elo' ? (rival.elo_rating || 0) : (rival.xp || 0);
        const diff = rivalValue - myValue;
        const displayName = `${rival.first_name || ''} ${rival.last_name || ''}`.trim() || 'Spieler';

        el.innerHTML = `
            <div class="flex items-center space-x-3">
                <img src="${rival.photo_url || DEFAULT_AVATAR}" alt="Rivale"
                     class="h-12 w-12 rounded-full object-cover border-2 border-orange-400"
                     onerror="this.src='${DEFAULT_AVATAR}'">
                <div>
                    <p class="font-semibold text-orange-600">${displayName}</p>
                    <p class="text-sm text-gray-600">${rivalValue} ${unit}</p>
                    <p class="text-xs text-gray-500">Nur noch ${diff} ${unit} zum Überholen!</p>
                </div>
            </div>
        `;
    } else {
        el.innerHTML = `<p class="text-gray-500">Keine Rivalen gefunden</p>`;
    }
}

// --- Leaderboard State ---
let currentLeaderboardTab = 'xp'; // 'xp', 'elo', 'points'
let currentLeaderboardScope = 'club'; // 'club', 'global'
let leaderboardCache = { club: null, global: null };

// --- Load Leaderboards ---
async function loadLeaderboards() {
    const container = document.getElementById('leaderboard-content-wrapper');
    if (!container) return;

    // Set default scope to 'global' if user has no club
    if (!currentUserData.club_id) {
        currentLeaderboardScope = 'global';
    }

    // Render the leaderboard structure
    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

            <!-- Tabs -->
            <div class="overflow-x-auto border-b border-gray-200 mb-4 -mx-6 px-6">
                <div class="flex justify-center min-w-max">
                    <button id="tab-effort" data-tab="effort" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Fleiß</div>
                        <div class="text-xs text-gray-500 font-normal">(XP)</div>
                    </button>
                    <button id="tab-season" data-tab="season" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Season</div>
                        <div class="text-xs text-gray-500 font-normal">(Punkte)</div>
                    </button>
                    <button id="tab-skill" data-tab="skill" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Skill</div>
                        <div class="text-xs text-gray-500 font-normal">(Elo)</div>
                    </button>
                    <button id="tab-ranks" data-tab="ranks" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Ränge</div>
                        <div class="text-xs text-gray-500 font-normal">(Level)</div>
                    </button>
                    <button id="tab-doubles" data-tab="doubles" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Doppel</div>
                        <div class="text-xs text-gray-500 font-normal">(Teams)</div>
                    </button>
                </div>
            </div>

            <!-- Club/Global Toggle -->
            ${currentUserData.club_id ? `
            <div class="flex justify-center border border-gray-200 rounded-lg p-1 bg-gray-100 mb-4">
                <button id="lb-scope-club" class="lb-scope-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors">Mein Verein</button>
                <button id="lb-scope-global" class="lb-scope-btn flex-1 py-2 px-4 text-sm font-semibold rounded-md transition-colors">Global</button>
            </div>
            ` : ''}

            <!-- Effort/Fleiß Content -->
            <div id="content-effort" class="leaderboard-tab-content mt-4 space-y-2 hidden">
                <div id="leaderboard-list-effort" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Fleiß-Rangliste...</p>
                </div>
            </div>

            <!-- Season Content -->
            <div id="content-season" class="leaderboard-tab-content mt-4 space-y-2 hidden">
                <div id="leaderboard-list-season" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Season-Rangliste...</p>
                </div>
            </div>

            <!-- Skill/Elo Content -->
            <div id="content-skill" class="leaderboard-tab-content mt-4 space-y-2 hidden">
                <div id="leaderboard-list-skill" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Skill-Rangliste...</p>
                </div>
            </div>

            <!-- Ranks Content -->
            <div id="content-ranks" class="leaderboard-tab-content mt-4 space-y-4 hidden">
                <div id="ranks-list" class="space-y-4">
                    <p class="text-center text-gray-500 py-8">Lade Ränge...</p>
                </div>
            </div>

            <!-- Doubles Content -->
            <div id="content-doubles" class="leaderboard-tab-content mt-4 hidden">
                <div id="doubles-list" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Doppel-Rangliste...</p>
                </div>
            </div>

        </div>
    `;

    // Setup tab listeners
    document.querySelectorAll('.lb-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Support both old (lb-tab-*) and new (tab-*) ID formats
            const tab = btn.getAttribute('data-tab') || btn.id.replace('lb-tab-', '').replace('tab-', '');
            currentLeaderboardTab = tab;
            updateLeaderboardTabs();
            updateLeaderboardContent();
        });
    });

    // Setup scope listeners
    document.querySelectorAll('.lb-scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scope = btn.id.replace('lb-scope-', '');
            currentLeaderboardScope = scope;
            updateLeaderboardScope();
            updateLeaderboardContent();
        });
    });

    // Initial state
    updateLeaderboardTabs();
    updateLeaderboardScope();

    // Load data
    await fetchLeaderboardData();
    updateLeaderboardContent();

    // Load doubles leaderboard
    loadDoublesLeaderboardTab();

    // Apply leaderboard preferences (show/hide tabs based on settings)
    applyPreferences();
}

function updateLeaderboardTabs() {
    document.querySelectorAll('.lb-tab-btn').forEach(btn => {
        // Support both old (lb-tab-*) and new (tab-*) ID formats
        const tab = btn.getAttribute('data-tab') || btn.id.replace('lb-tab-', '').replace('tab-', '');
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

// Switch between different leaderboard content views
function updateLeaderboardContent() {
    const scopeToggle = document.getElementById('lb-scope-club')?.parentElement;

    // Hide all tab content
    document.querySelectorAll('.leaderboard-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Show/hide scope toggle based on tab
    if (scopeToggle) {
        if (currentLeaderboardTab === 'skill' || currentLeaderboardTab === 'elo' || currentLeaderboardTab === 'doubles') {
            scopeToggle.classList.remove('hidden');
        } else {
            scopeToggle.classList.add('hidden');
        }
    }

    // Show appropriate content based on current tab
    const contentMap = {
        'xp': 'content-effort',
        'effort': 'content-effort',
        'points': 'content-season',
        'season': 'content-season',
        'elo': 'content-skill',
        'skill': 'content-skill',
        'ranks': 'content-ranks',
        'doubles': 'content-doubles'
    };

    const contentId = contentMap[currentLeaderboardTab];
    if (contentId) {
        const content = document.getElementById(contentId);
        if (content) content.classList.remove('hidden');
    }

    // Fallback: show appropriate legacy content
    if (currentLeaderboardTab === 'ranks') {
        const ranksList = document.getElementById('ranks-list');
        if (ranksList) ranksList.classList.remove('hidden');
        renderRanksList();
    } else if (currentLeaderboardTab === 'doubles') {
        const doublesList = document.getElementById('doubles-list');
        if (doublesList) doublesList.classList.remove('hidden');
        // Doubles content is loaded separately
    } else {
        // Render the leaderboard content (effort, season, skill)
        renderLeaderboardList();
    }
}

// Load doubles leaderboard tab
async function loadDoublesLeaderboardTab() {
    const container = document.getElementById('doubles-list');
    if (!container) return;

    try {
        // Check if doubles_pairings table exists by making a simple query
        const { error } = await supabase
            .from('doubles_pairings')
            .select('id')
            .limit(1);

        if (error && error.message.includes('does not exist')) {
            // Table doesn't exist - show helpful message
            container.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-4xl mb-2">🏓</p>
                    <p class="text-gray-600 font-medium">Doppel-Rangliste</p>
                    <p class="text-sm text-gray-500 mt-2">Die Doppel-Rangliste wird basierend auf gespielten Doppel-Matches erstellt.</p>
                    <p class="text-xs text-gray-400 mt-4">Spiele Doppel-Matches um in der Rangliste zu erscheinen!</p>
                </div>
            `;
            return;
        }

        // Table exists, use the imported function
        const clubId = currentUserData.club_id;
        const isGlobal = currentLeaderboardScope === 'global' || !clubId;

        loadDoublesLeaderboard(
            isGlobal ? null : clubId,
            supabase,
            container,
            realtimeSubscriptions,
            currentUser.id,
            isGlobal
        );
    } catch (err) {
        console.error('Error loading doubles leaderboard:', err);
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p>Doppel-Rangliste konnte nicht geladen werden</p>
            </div>
        `;
    }
}

// Render ranks grouped by level
function renderRanksList() {
    const container = document.getElementById('ranks-list');
    if (!container) return;

    const players = leaderboardCache[currentLeaderboardScope] || leaderboardCache.global || [];

    if (players.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
        return;
    }

    // Group players by rank using the imported function
    const grouped = groupPlayersByRank(players.map(p => ({
        ...p,
        eloRating: p.elo_rating,
        xp: p.xp
    })));

    let html = '';

    // Display ranks from highest to lowest
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rank = RANK_ORDER[i];
        const playersInRank = grouped[rank.id] || [];

        if (playersInRank.length === 0) continue;

        // Sort by XP within rank
        playersInRank.sort((a, b) => (b.xp || 0) - (a.xp || 0));

        html += `
            <div class="rank-section">
                <div class="flex items-center justify-between p-3 rounded-lg" style="background-color: ${rank.color}20; border-left: 4px solid ${rank.color};">
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${rank.emoji}</span>
                        <span class="font-bold text-lg" style="color: ${rank.color};">${rank.name}</span>
                    </div>
                    <span class="text-sm text-gray-600">${playersInRank.length} Spieler</span>
                </div>
                <div class="mt-2 space-y-1 pl-4">
                    ${playersInRank.map(player => {
                        const isCurrentUser = player.id === currentUser.id;
                        const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unbekannt';
                        return `
                        <div class="flex items-center p-2 rounded ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}">
                            <img src="${player.photo_url || DEFAULT_AVATAR}" alt="Avatar" class="h-8 w-8 rounded-full object-cover mr-3" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div class="flex-grow">
                                <p class="text-sm">${playerName}</p>
                            </div>
                            <div class="text-xs text-gray-600">
                                ${player.elo_rating || 0} Elo | ${player.xp || 0} XP
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html || '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
}

async function fetchLeaderboardData() {
    try {
        // Load test club IDs for filtering (cache them for renderLeaderboardList)
        await loadTestClubIds();

        // Get users in the current sport for multi-sport filtering
        let sportUserIds = null;
        let sportUserClubMap = new Map();
        const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;

        if (currentSportContext?.sportId) {
            const { data: sportUsers, error: sportError } = await supabase
                .from('profile_club_sports')
                .select('user_id, club_id, clubs(name)')
                .eq('sport_id', currentSportContext.sportId);

            if (!sportError && sportUsers) {
                sportUserIds = sportUsers.map(su => su.user_id);
                sportUsers.forEach(su => {
                    sportUserClubMap.set(su.user_id, {
                        clubId: su.club_id,
                        clubName: su.clubs?.name || null
                    });
                });
                console.log('[Leaderboard] Sport filter active, users:', sportUserIds.length);
            }
        }

        // Fetch club data - players in same sport AND club
        if (effectiveClubId) {
            let clubQuery = supabase
                .from('profiles')
                .select('id, first_name, last_name, photo_url, xp, elo_rating, points, role, birthdate, gender, subgroup_ids, club_id, clubs(name), privacy_settings')
                .in('role', ['player', 'coach']);

            if (sportUserIds && sportUserIds.length > 0) {
                // Filter to users in sport AND in club
                const clubSportUserIds = sportUserIds.filter(uid => sportUserClubMap.get(uid)?.clubId === effectiveClubId);
                if (clubSportUserIds.length > 0) {
                    clubQuery = clubQuery.in('id', clubSportUserIds);
                } else {
                    leaderboardCache.club = [];
                }
            } else {
                clubQuery = clubQuery.eq('club_id', effectiveClubId);
            }

            const { data: clubPlayers, error: clubError } = await clubQuery;

            if (clubError) {
                console.error('[Leaderboard] Error fetching club data:', clubError);
            }

            leaderboardCache.club = (clubPlayers || []).map(p => {
                const sportClubInfo = sportUserClubMap.get(p.id);
                return {
                    ...p,
                    // Use club from sport context if available
                    club_id: sportClubInfo?.clubId || p.club_id,
                    club_name: sportClubInfo?.clubName || p.clubs?.name || null
                };
            });
        } else {
            leaderboardCache.club = [];
        }

        // Fetch global data - ALL players in sport (to calculate user's rank, but display only top 100)
        let globalQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, photo_url, xp, elo_rating, points, role, birthdate, gender, subgroup_ids, club_id, clubs(name), privacy_settings')
            .in('role', ['player', 'coach']);

        if (sportUserIds && sportUserIds.length > 0) {
            globalQuery = globalQuery.in('id', sportUserIds);
        }

        const { data: globalPlayers, error: globalError } = await globalQuery;

        if (globalError) {
            console.error('[Leaderboard] Error fetching global data:', globalError);
        }

        leaderboardCache.global = (globalPlayers || []).map(p => {
            const sportClubInfo = sportUserClubMap.get(p.id);
            return {
                ...p,
                // Use club from sport context if available
                club_id: sportClubInfo?.clubId || p.club_id,
                club_name: sportClubInfo?.clubName || p.clubs?.name || null
            };
        });
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
    }
}

function renderLeaderboardList() {
    // Map tab names to container IDs
    const containerMap = {
        'xp': 'leaderboard-list-effort',
        'effort': 'leaderboard-list-effort',
        'points': 'leaderboard-list-season',
        'season': 'leaderboard-list-season',
        'elo': 'leaderboard-list-skill',
        'skill': 'leaderboard-list-skill'
    };

    const containerId = containerMap[currentLeaderboardTab];
    if (!containerId) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    let players = leaderboardCache[currentLeaderboardScope] || [];

    // Determine filter type from currentSubgroupFilter
    // Values can be: 'club', 'global', age group IDs (u11, u13, adult, o40, etc.), or 'subgroup:xxx'
    const ageGroupIds = ['u11', 'u13', 'u15', 'u17', 'u19', 'adult', 'o40', 'o45', 'o50', 'o55', 'o60', 'o65', 'o70', 'o75', 'o80', 'o85'];

    if (currentSubgroupFilter && currentSubgroupFilter.startsWith('subgroup:')) {
        // Apply custom subgroup filter
        const subgroupId = currentSubgroupFilter.replace('subgroup:', '');
        players = players.filter(p => p.subgroup_ids && p.subgroup_ids.includes(subgroupId));
    } else if (currentSubgroupFilter && ageGroupIds.includes(currentSubgroupFilter)) {
        // Apply age group filter from Ansicht dropdown
        players = players.filter(p => matchesAgeGroup(p.birthdate, currentSubgroupFilter));
    }
    // 'club' and 'global' don't filter - they just set the scope (which is handled by leaderboardCache[currentLeaderboardScope])

    // Apply gender filter
    if (currentGenderFilter !== 'all') {
        players = players.filter(p => p.gender === currentGenderFilter);
    }

    // Filter out players from test clubs (unless current user is from a test club)
    if (testClubIdsCache && testClubIdsCache.length > 0) {
        const isCurrentUserInTestClub = currentUserData?.club_id && testClubIdsCache.includes(currentUserData.club_id);

        players = players.filter(player => {
            // If player is not in a test club, show them
            if (!player.club_id || !testClubIdsCache.includes(player.club_id)) {
                return true;
            }

            // Player is in a test club - only show if current user is from the same test club
            if (isCurrentUserInTestClub && currentUserData.club_id === player.club_id) {
                return true;
            }

            // Hide test club players for everyone else
            return false;
        });
    }

    // Filter by privacy settings (applies to all users including coaches)
    let currentUserHidden = false;
    players = players.filter(player => {
        const privacySettings = player.privacy_settings || {};
        const showInLeaderboards = privacySettings.showInLeaderboards !== false; // Default: true
        const searchable = privacySettings.searchable || 'global'; // Default: global

        const isCurrentUser = player.id === currentUser.id;
        const isSameClub = currentUserData?.club_id && player.club_id === currentUserData.club_id;

        // If player has disabled leaderboard visibility
        if (!showInLeaderboards) {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true; // Still show current user to themselves
            }
            return false; // Hide from others
        }

        // If player is only visible to club members
        if (searchable === 'club_only') {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true; // Still show current user to themselves
            }
            // Only show if viewer is in the same club
            if (isSameClub) {
                return true;
            }
            return false; // Hide from non-club members
        }

        return true; // Global visibility
    });

    // Sort by current tab - map tab names to field names
    const fieldMap = {
        'xp': 'xp',
        'effort': 'xp',
        'elo': 'elo_rating',
        'skill': 'elo_rating',
        'points': 'points',
        'season': 'points'
    };
    const field = fieldMap[currentLeaderboardTab];
    const sorted = [...players].sort((a, b) => (b[field] || 0) - (a[field] || 0));

    // Club view: show all players, Global view: show top 100
    const isGlobalView = currentLeaderboardScope === 'global';
    const displayLimit = isGlobalView ? 100 : sorted.length;
    const displayPlayers = sorted.slice(0, displayLimit);

    const currentUserRank = sorted.findIndex(p => p.id === currentUser.id) + 1;
    const currentPlayerData = sorted.find(p => p.id === currentUser.id);
    const isCurrentUserInDisplayList = currentUserRank > 0 && currentUserRank <= displayLimit;

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
        return;
    }

    let html = '';

    // Show privacy notice if current user is hidden from others
    if (currentUserHidden) {
        html += `
            <div class="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 rounded-r-lg">
                <div class="flex items-start">
                    <i class="fas fa-eye-slash text-amber-500 mt-0.5 mr-2"></i>
                    <div class="text-sm text-amber-700">
                        <strong>Du bist für andere nicht sichtbar.</strong><br>
                        Deine Datenschutz-Einstellungen verbergen dich in der Rangliste für andere Spieler.
                        <a href="/settings.html" class="text-amber-800 underline hover:text-amber-900">Einstellungen ändern</a>
                    </div>
                </div>
            </div>
        `;
    }

    // Check if we should show club names (global scope + skill/elo tab)
    const showClubName = currentLeaderboardScope === 'global' &&
        (currentLeaderboardTab === 'skill' || currentLeaderboardTab === 'elo');

    // Check if head-to-head is available (skill/elo tab only)
    const isH2HEnabled = currentLeaderboardTab === 'skill' || currentLeaderboardTab === 'elo';

    displayPlayers.forEach((player, index) => {
        const isCurrentUser = player.id === currentUser.id;
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        const value = player[field] || 0;
        const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unbekannt';
        const clubNameHtml = showClubName && player.club_name
            ? `<div class="text-xs text-gray-500">${player.club_name}</div>`
            : '';

        // Make row clickable for head-to-head (not for current user)
        const isClickable = isH2HEnabled && !isCurrentUser;
        const clickableClass = isClickable ? 'cursor-pointer' : '';
        const dataAttr = isClickable ? `data-player-id="${player.id}"` : '';

        html += `
            <div class="flex items-center justify-between p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-gray-50 hover:bg-gray-100'} transition-colors ${clickableClass}" ${dataAttr}>
                <div class="flex items-center gap-3">
                    <span class="w-8 text-center font-bold ${rank <= 3 ? 'text-lg' : 'text-gray-500'}">${medal}</span>
                    <img src="${player.photo_url || DEFAULT_AVATAR}"
                         class="w-10 h-10 rounded-full object-cover border-2 ${isCurrentUser ? 'border-indigo-400' : 'border-gray-200'}"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <div class="flex items-center">
                            <span class="${isCurrentUser ? 'font-bold text-indigo-700' : 'font-medium'}">${playerName}</span>
                            ${isCurrentUser ? '<span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>' : ''}
                        </div>
                        ${clubNameHtml}
                    </div>
                </div>
                <span class="font-bold text-lg ${currentLeaderboardTab === 'xp' ? 'text-purple-600' : currentLeaderboardTab === 'elo' ? 'text-blue-600' : 'text-yellow-600'}">${value}</span>
            </div>
        `;
    });

    // Show current user if not in displayed list (for global view with top 100)
    if (!isCurrentUserInDisplayList && currentPlayerData && currentUserRank > 0) {
        const currentPlayerName = `${currentPlayerData.first_name || ''} ${currentPlayerData.last_name || ''}`.trim() || 'Du';
        const currentUserClubHtml = showClubName && currentPlayerData.club_name
            ? `<div class="text-xs text-gray-500">${currentPlayerData.club_name}</div>`
            : '';
        html += `
            <div class="border-t-2 border-dashed border-gray-300 mt-4 pt-4">
                <div class="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border-2 border-indigo-300">
                    <div class="flex items-center gap-3">
                        <span class="w-8 text-center font-bold text-gray-500">${currentUserRank}.</span>
                        <img src="${currentPlayerData.photo_url || DEFAULT_AVATAR}"
                             class="w-10 h-10 rounded-full object-cover border-2 border-indigo-400"
                             onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <div class="flex items-center">
                                <span class="font-bold text-indigo-700">${currentPlayerName}</span>
                                <span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>
                            </div>
                            ${currentUserClubHtml}
                        </div>
                    </div>
                    <span class="font-bold text-lg ${currentLeaderboardTab === 'xp' ? 'text-purple-600' : currentLeaderboardTab === 'elo' ? 'text-blue-600' : 'text-yellow-600'}">${currentPlayerData[field] || 0}</span>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Add click handlers for head-to-head modal (skill/elo tab only)
    if (isH2HEnabled) {
        container.querySelectorAll('[data-player-id]').forEach(el => {
            el.addEventListener('click', () => {
                const opponentId = el.getAttribute('data-player-id');
                showHeadToHeadModal(supabase, currentUser.id, opponentId);
            });
        });
    }
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
        // Build query with optional sport filter
        let query = supabase
            .from('exercises')
            .select('*')
            .order('name');

        // Filter by user's active sport if set
        const activeSportId = currentUserData?.active_sport_id;
        if (activeSportId) {
            // Show exercises that match the sport OR have no sport (global exercises)
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: exercises, error } = await query;

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
// NOTE: Match requests show ALL sports (not filtered by active sport)
// This is intentional - user should see all pending requests regardless of sport
async function loadMatchRequests() {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    try {
        // Get pending requests where user is involved (ALL sports)
        // Schema uses player_a_id and player_b_id (not requester_id/opponent_id)
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select('*, sports(display_name)')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            return;
        }

        // Get unique user IDs to fetch profiles
        const userIds = [...new Set(requests.flatMap(r => [r.player_a_id, r.player_b_id]))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, photo_url')
            .in('id', userIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        container.innerHTML = requests.map(req => {
            // player_a is usually the one who created the request
            const isPlayerA = req.player_a_id === currentUser.id;
            const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
            const otherPlayer = profileMap[otherPlayerId];
            const otherPlayerName = otherPlayer ? `${otherPlayer.first_name || ''} ${otherPlayer.last_name || ''}`.trim() || 'Unbekannt' : 'Unbekannt';
            const statusText = req.status === 'pending_player' ? 'Warte auf Spieler' : 'Warte auf Coach';
            const sportName = req.sports?.display_name || '';
            const sportBadge = sportName ? `<span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">${sportName}</span>` : '';

            return `
                <div class="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div class="flex items-center gap-3">
                        <img src="${otherPlayer?.photo_url || DEFAULT_AVATAR}"
                             class="w-10 h-10 rounded-full object-cover"
                             onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <p class="font-medium flex items-center gap-2">
                                ${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayerName}
                                ${sportBadge}
                            </p>
                            <p class="text-xs text-gray-500">${statusText}${req.is_cross_club ? ' (Vereinsübergreifend)' : ''}</p>
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
// Cache for season config
let cachedSeasonEnd = null;
let cachedSeasonName = null;
let cachedUserSportId = null;
let lastSeasonFetchTime = null;
const SEASON_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

async function fetchSeasonEndDate() {
    try {
        // Check cache first
        if (cachedSeasonEnd && lastSeasonFetchTime && Date.now() - lastSeasonFetchTime < SEASON_CACHE_DURATION) {
            return cachedSeasonEnd;
        }

        // Get user's active sport (prefer active_sport_id, fallback to first sport)
        let userSportId = cachedUserSportId;
        if (!userSportId && currentUserData?.active_sport_id) {
            userSportId = currentUserData.active_sport_id;
            cachedUserSportId = userSportId;
        } else if (!userSportId && currentUser) {
            // Fallback: Get first sport from profile_club_sports
            const { data: userSports } = await supabase
                .from('profile_club_sports')
                .select('sport_id')
                .eq('user_id', currentUser.id)
                .limit(1);

            if (userSports && userSports.length > 0) {
                userSportId = userSports[0].sport_id;
                cachedUserSportId = userSportId;
            }
        }

        // Fetch active season for user's sport
        let query = supabase
            .from('seasons')
            .select('id, name, start_date, end_date, sport_id')
            .eq('is_active', true);

        // Filter by user's sport if available
        if (userSportId) {
            query = query.eq('sport_id', userSportId);
        }

        const { data: activeSeasons, error } = await query
            .order('created_at', { ascending: false })
            .limit(1);

        if (!error && activeSeasons && activeSeasons.length > 0) {
            const activeSeason = activeSeasons[0];
            const seasonEnd = new Date(activeSeason.end_date);

            // Cache the result
            cachedSeasonEnd = seasonEnd;
            cachedSeasonName = activeSeason.name;
            lastSeasonFetchTime = Date.now();

            console.log('📅 Season end date loaded from seasons table:', seasonEnd.toLocaleString('de-DE'), `(${activeSeason.name})`);
            return seasonEnd;
        }

        // No active season found - return null to indicate season pause
        console.log('📅 No active season found for sport:', userSportId || 'all');
        cachedSeasonEnd = null;
        cachedSeasonName = null;
        lastSeasonFetchTime = Date.now();

        return null;

    } catch (error) {
        console.error('Error fetching season end date:', error);
        return null;
    }
}

// Stored season end date for efficient countdown
let seasonEndDate = null;

// Initial load of season end date (called once)
async function initSeasonCountdown() {
    seasonEndDate = await fetchSeasonEndDate();
    updateSeasonCountdownDisplay();
    // Update display every second (efficient - no async calls)
    setInterval(updateSeasonCountdownDisplay, 1000);
    // Refresh season data every 5 minutes in case it changes
    setInterval(async () => {
        seasonEndDate = await fetchSeasonEndDate();
    }, 5 * 60 * 1000);
}

// Efficient countdown update (synchronous, no DB calls)
function updateSeasonCountdownDisplay() {
    const countdownEl = document.getElementById('season-countdown');
    if (!countdownEl) return;

    // No active season - show pause message
    if (!seasonEndDate) {
        countdownEl.textContent = 'Saisonpause';
        countdownEl.title = 'Aktuell ist keine Saison aktiv für diese Sportart';
        return;
    }

    const now = new Date();
    const diff = seasonEndDate - now;

    if (diff <= 0) {
        countdownEl.textContent = 'Saison beendet!';
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownEl.textContent = `${days}T ${hours}h ${minutes}m ${seconds}s`;
    countdownEl.title = cachedSeasonName ? `Saison: ${cachedSeasonName}` : '';
}

// Legacy function for compatibility
async function updateSeasonCountdown() {
    if (!seasonEndDate) {
        seasonEndDate = await fetchSeasonEndDate();
    }
    updateSeasonCountdownDisplay();
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
        if (!accept) {
            // Rejected - simple update
            const { error } = await supabase
                .from('match_requests')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            if (error) throw error;
            loadMatchRequests();
            return;
        }

        // Accepted - need to check club membership to determine next status
        // First get the match request details
        const { data: request, error: fetchError } = await supabase
            .from('match_requests')
            .select('*, sports(display_name)')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        // Get club info for both players (for the sport if available)
        const sportId = request.sport_id;
        let playerAClubId = null;
        let playerBClubId = null;

        if (sportId) {
            // Get clubs from profile_club_sports for this sport
            const { data: playerAData } = await supabase
                .from('profile_club_sports')
                .select('club_id')
                .eq('user_id', request.player_a_id)
                .eq('sport_id', sportId)
                .single();

            const { data: playerBData } = await supabase
                .from('profile_club_sports')
                .select('club_id')
                .eq('user_id', request.player_b_id)
                .eq('sport_id', sportId)
                .single();

            playerAClubId = playerAData?.club_id;
            playerBClubId = playerBData?.club_id;
        } else {
            // Fallback to profiles.club_id
            const { data: players } = await supabase
                .from('profiles')
                .select('id, club_id')
                .in('id', [request.player_a_id, request.player_b_id]);

            players?.forEach(p => {
                if (p.id === request.player_a_id) playerAClubId = p.club_id;
                if (p.id === request.player_b_id) playerBClubId = p.club_id;
            });
        }

        // Determine next status based on club membership
        let newStatus;
        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }
        approvals.player_b = true;

        // Case 1: Both players have NO club → Auto-approve
        if (!playerAClubId && !playerBClubId) {
            newStatus = 'approved';
            console.log('[Match] Auto-approved: Both players have no club');
        }
        // Case 2: At least one player has a club → pending_coach
        else {
            newStatus = 'pending_coach';
            console.log('[Match] Pending coach approval:', {
                playerAClub: playerAClubId,
                playerBClub: playerBClubId,
                isCrossClub: playerAClubId !== playerBClubId && playerAClubId && playerBClubId
            });
        }

        // Update the request
        const { error: updateError } = await supabase
            .from('match_requests')
            .update({
                status: newStatus,
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // If auto-approved, create the actual match
        if (newStatus === 'approved') {
            await createMatchFromRequest(request);
        }

        loadMatchRequests();

        // Show feedback
        const feedbackMsg = newStatus === 'approved'
            ? 'Match bestätigt!'
            : 'Anfrage angenommen - wartet auf Coach-Bestätigung';
        alert(feedbackMsg);

    } catch (error) {
        console.error('Error responding to match request:', error);
        alert('Fehler beim Verarbeiten der Anfrage');
    }
};

/**
 * Create actual match from approved request
 */
async function createMatchFromRequest(request) {
    try {
        const { error } = await supabase
            .from('matches')
            .insert({
                player_a_id: request.player_a_id,
                player_b_id: request.player_b_id,
                club_id: request.club_id,
                sport_id: request.sport_id,
                winner_id: request.winner_id,
                loser_id: request.loser_id,
                sets: request.sets,
                match_mode: request.match_mode,
                handicap_used: request.handicap_used,
                is_cross_club: request.is_cross_club,
                match_request_id: request.id,
                created_at: new Date().toISOString()
            });

        if (error) throw error;
        console.log('[Match] Created match from request:', request.id);

    } catch (error) {
        console.error('Error creating match from request:', error);
        throw error;
    }
}

// ========================================================================
// ===== MATCH REQUEST SYSTEM =====
// ========================================================================

let setScoreHandler = null;
let selectedOpponent = null;

// --- Setup Match Form ---
function setupMatchForm() {
    const form = document.getElementById('match-request-form');
    const opponentSearchInput = document.getElementById('opponent-search-input');
    const opponentSearchResults = document.getElementById('opponent-search-results');
    const matchModeSelect = document.getElementById('match-mode-select');
    const setScoreContainer = document.getElementById('set-score-container');
    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');

    if (!form) return;

    // Initialize set score inputs
    if (setScoreContainer) {
        setScoreHandler = createSetScoreInput(setScoreContainer, [], matchModeSelect?.value || 'best-of-5');
    }

    // Match mode change
    matchModeSelect?.addEventListener('change', () => {
        if (setScoreContainer) {
            setScoreHandler = createSetScoreInput(setScoreContainer, [], matchModeSelect.value);
        }
    });

    // Singles/Doubles toggle
    singlesToggle?.addEventListener('click', () => {
        singlesToggle.classList.add('active');
        doublesToggle?.classList.remove('active');
        document.getElementById('singles-opponent-container')?.classList.remove('hidden');
        document.getElementById('doubles-players-container')?.classList.add('hidden');
    });

    doublesToggle?.addEventListener('click', () => {
        doublesToggle.classList.add('active');
        singlesToggle?.classList.remove('active');
        document.getElementById('singles-opponent-container')?.classList.add('hidden');
        document.getElementById('doubles-players-container')?.classList.remove('hidden');
    });

    // Opponent search
    let searchTimeout = null;
    opponentSearchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 2) {
            opponentSearchResults.innerHTML = '';
            return;
        }

        searchTimeout = setTimeout(() => searchOpponents(query, opponentSearchResults), 300);
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitMatchRequest();
    });

    // Setup match suggestions toggle
    setupMatchSuggestions();

    // Setup leaderboard preferences toggle
    setupLeaderboardPreferences();
}

// --- Search Opponents ---
async function searchOpponents(query, resultsContainer) {
    try {
        // Load test club IDs for filtering
        const testClubIds = await loadTestClubIds();

        // Check if current user is from a test club
        const isCurrentUserInTestClub = currentUserData.club_id && testClubIds.includes(currentUserData.club_id);

        // Get users in the same sport as current user
        let sportUserIds = null;
        if (currentSportContext?.sportId) {
            const { data: sportUsers, error: sportError } = await supabase
                .from('profile_club_sports')
                .select('user_id')
                .eq('sport_id', currentSportContext.sportId);

            if (!sportError && sportUsers) {
                sportUserIds = sportUsers.map(su => su.user_id);
                console.log('[Opponent Search] Filtering by sport:', currentSportContext.sportName, 'Users:', sportUserIds.length);
            }
        }

        // Build query
        let query_builder = supabase
            .from('profiles')
            .select('id, first_name, last_name, photo_url, elo_rating, club_id, privacy_settings, grundlagen_completed, clubs(name)')
            .neq('id', currentUser.id)
            .in('role', ['player', 'coach'])
            .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);

        // Filter by sport if available
        if (sportUserIds && sportUserIds.length > 0) {
            query_builder = query_builder.in('id', sportUserIds);
        } else if (sportUserIds && sportUserIds.length === 0) {
            // No users in sport
            resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler in dieser Sportart gefunden</p>';
            return;
        }

        query_builder = query_builder.limit(50);

        const { data: players, error } = await query_builder;

        if (error) throw error;

        // Filter by privacy settings, match-readiness, and test clubs
        const filteredPlayers = (players || []).filter(player => {
            // Must have completed at least 5 Grundlagen
            const grundlagenCompleted = player.grundlagen_completed || 0;
            if (grundlagenCompleted < 5) return false;

            // Test club filter: hide players from test clubs unless current user is also from a test club
            if (player.club_id && testClubIds.includes(player.club_id)) {
                // Only show test club players if current user is from the same test club
                if (!isCurrentUserInTestClub || currentUserData.club_id !== player.club_id) {
                    return false;
                }
            }

            // Privacy check
            const userHasNoClub = !currentUserData.club_id;
            const playerHasNoClub = !player.club_id;

            // Both without club → always visible
            if (userHasNoClub && playerHasNoClub) return true;

            // Get searchable setting (default: global)
            const searchable = player.privacy_settings?.searchable || 'global';

            // Global: visible to everyone
            if (searchable === 'global') return true;

            // Club only: only visible to same club members
            if (searchable === 'club_only' && currentUserData.club_id && player.club_id === currentUserData.club_id) {
                return true;
            }

            return false;
        }).slice(0, 10); // Limit to 10 results

        if (filteredPlayers.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden</p>';
            return;
        }

        resultsContainer.innerHTML = filteredPlayers.map(player => {
            const isSameClub = player.club_id && player.club_id === currentUserData.club_id;
            const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unbekannt';
            const clubName = player.clubs?.name || null;
            const hasNoClub = !player.club_id;

            // Determine club badge
            let clubBadge = '';
            if (!isSameClub && player.club_id && clubName) {
                clubBadge = `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">${clubName}</span>`;
            } else if (!isSameClub && player.club_id) {
                clubBadge = '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">Anderer Verein</span>';
            } else if (hasNoClub) {
                clubBadge = '<span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mr-2">Kein Verein</span>';
            }

            return `
            <div class="opponent-option flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer rounded-lg border border-gray-200 mb-2"
                 data-id="${player.id}"
                 data-name="${playerName}"
                 data-elo="${player.elo_rating || 1000}">
                <img src="${player.photo_url || DEFAULT_AVATAR}"
                     class="w-10 h-10 rounded-full object-cover"
                     onerror="this.src='${DEFAULT_AVATAR}'">
                <div class="flex-1">
                    <p class="font-medium">${playerName}</p>
                    <p class="text-xs text-gray-500">Elo: ${player.elo_rating || 1000}</p>
                </div>
                ${clubBadge}
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        `;
        }).join('');

        // Add click handlers
        resultsContainer.querySelectorAll('.opponent-option').forEach(option => {
            option.addEventListener('click', () => selectOpponent(option));
        });

    } catch (error) {
        console.error('Error searching opponents:', error);
        resultsContainer.innerHTML = '<p class="text-red-500 text-sm p-2">Fehler bei der Suche</p>';
    }
}

// --- Select Opponent ---
function selectOpponent(optionElement) {
    const id = optionElement.dataset.id;
    const name = optionElement.dataset.name;
    const elo = optionElement.dataset.elo;

    selectedOpponent = { id, name, elo: parseInt(elo) };

    // Update UI
    document.getElementById('selected-opponent-id').value = id;
    document.getElementById('selected-opponent-elo').value = elo;
    document.getElementById('opponent-search-input').value = name;
    document.getElementById('opponent-search-results').innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
            <i class="fas fa-check-circle text-green-500"></i>
            <span class="font-medium text-green-800">${name}</span>
            <span class="text-sm text-green-600">(Elo: ${elo})</span>
            <button type="button" onclick="clearOpponentSelection()" class="ml-auto text-gray-500 hover:text-red-500">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Check for handicap
    checkHandicap();
}

window.clearOpponentSelection = function() {
    selectedOpponent = null;
    document.getElementById('selected-opponent-id').value = '';
    document.getElementById('selected-opponent-elo').value = '';
    document.getElementById('opponent-search-input').value = '';
    document.getElementById('opponent-search-results').innerHTML = '';
    document.getElementById('match-handicap-info')?.classList.add('hidden');
};

// --- Check Handicap ---
function checkHandicap() {
    const handicapInfo = document.getElementById('match-handicap-info');
    const handicapText = document.getElementById('match-handicap-text');

    if (!handicapInfo || !selectedOpponent) return;

    const myElo = currentUserData.elo_rating || 1000;
    const opponentElo = selectedOpponent.elo;
    const diff = Math.abs(myElo - opponentElo);

    if (diff >= 100) {
        const stronger = myElo > opponentElo ? 'Du bist' : `${selectedOpponent.name} ist`;
        const weaker = myElo > opponentElo ? selectedOpponent.name : 'Du';
        const handicapPoints = Math.min(Math.floor(diff / 50), 5);

        handicapText.textContent = `${stronger} ${diff} Elo-Punkte stärker. Empfohlener Handicap: ${weaker} startet jeden Satz mit ${handicapPoints} Punkten.`;
        handicapInfo.classList.remove('hidden');
    } else {
        handicapInfo.classList.add('hidden');
    }
}

// --- Submit Match Request ---
async function submitMatchRequest() {
    const feedbackEl = document.getElementById('match-request-feedback');

    if (!selectedOpponent) {
        showFeedback(feedbackEl, 'Bitte wähle einen Gegner aus.', 'error');
        return;
    }

    if (!setScoreHandler) {
        showFeedback(feedbackEl, 'Satzergebnis-Handler nicht initialisiert.', 'error');
        return;
    }

    const validation = setScoreHandler.validate();
    if (!validation.valid) {
        showFeedback(feedbackEl, validation.error, 'error');
        return;
    }

    const sets = setScoreHandler.getSets();
    const matchMode = document.getElementById('match-mode-select')?.value || 'best-of-5';
    const handicapUsed = document.getElementById('match-handicap-toggle')?.checked || false;

    // Determine winner
    const winnerId = validation.winnerId === 'A' ? currentUser.id : selectedOpponent.id;
    const loserId = validation.winnerId === 'A' ? selectedOpponent.id : currentUser.id;

    try {
        const { error } = await supabase
            .from('match_requests')
            .insert({
                player_a_id: currentUser.id,
                player_b_id: selectedOpponent.id,
                club_id: currentUserData.club_id,
                sets: sets,
                match_mode: matchMode,
                handicap_used: handicapUsed,
                winner_id: winnerId,
                loser_id: loserId,
                status: 'pending_player',
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        showFeedback(feedbackEl, 'Anfrage erfolgreich gesendet! Warte auf Bestätigung.', 'success');

        // Reset form
        window.clearOpponentSelection();
        setScoreHandler.reset();

        // Reload requests
        loadMatchRequests();
        loadPendingRequests();

    } catch (error) {
        console.error('Error submitting match request:', error);
        showFeedback(feedbackEl, 'Fehler beim Senden der Anfrage: ' + error.message, 'error');
    }
}

// --- Show Feedback ---
function showFeedback(element, message, type) {
    if (!element) return;

    element.className = `mt-4 p-3 rounded-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-100 text-green-800' :
        type === 'error' ? 'bg-red-100 text-red-800' :
        'bg-blue-100 text-blue-800'
    }`;
    element.textContent = message;
    element.classList.remove('hidden');

    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

// --- Create Set Score Input (simplified version) ---
function createSetScoreInput(container, existingSets = [], mode = 'best-of-5') {
    container.innerHTML = '';

    let minSets, maxSets, setsToWin;
    switch (mode) {
        case 'single-set': minSets = 1; maxSets = 1; setsToWin = 1; break;
        case 'best-of-3': minSets = 2; maxSets = 3; setsToWin = 2; break;
        case 'best-of-5': minSets = 3; maxSets = 5; setsToWin = 3; break;
        case 'best-of-7': minSets = 4; maxSets = 7; setsToWin = 4; break;
        default: minSets = 3; maxSets = 5; setsToWin = 3;
    }

    const sets = existingSets.length > 0 ? [...existingSets] : [];
    while (sets.length < minSets) {
        sets.push({ playerA: '', playerB: '' });
    }

    function isValidSet(scoreA, scoreB) {
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;
        if (a < 11 && b < 11) return false;
        if (a === b) return false;
        if (a >= 10 && b >= 10) return Math.abs(a - b) === 2;
        return (a >= 11 && a > b) || (b >= 11 && b > a);
    }

    function getSetWinner(scoreA, scoreB) {
        if (!isValidSet(scoreA, scoreB)) return null;
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;
        if (a > b) return 'A';
        if (b > a) return 'B';
        return null;
    }

    function renderSets() {
        container.innerHTML = '';
        sets.forEach((set, index) => {
            const setDiv = document.createElement('div');
            setDiv.className = 'flex items-center gap-3 mb-3';
            setDiv.innerHTML = `
                <label class="text-sm font-medium text-gray-700 w-16">Satz ${index + 1}:</label>
                <input type="number" min="0" max="99"
                       class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                       data-set="${index}" data-player="A" placeholder="0" value="${set.playerA}"/>
                <span class="text-gray-500">:</span>
                <input type="number" min="0" max="99"
                       class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                       data-set="${index}" data-player="B" placeholder="0" value="${set.playerB}"/>
            `;
            container.appendChild(setDiv);
        });

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', handleSetInput);
        });
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        sets[setIndex][`player${player}`] = parseInt(e.target.value) || '';

        // Auto-add sets based on score
        let playerAWins = 0, playerBWins = 0;
        sets.forEach(set => {
            const a = parseInt(set.playerA) || 0;
            const b = parseInt(set.playerB) || 0;
            if (a > b && a >= 11) playerAWins++;
            if (b > a && b >= 11) playerBWins++;
        });

        const matchWon = playerAWins >= setsToWin || playerBWins >= setsToWin;
        if (!matchWon && sets.length < maxSets) {
            const lastSet = sets[sets.length - 1];
            if (lastSet.playerA !== '' && lastSet.playerB !== '') {
                sets.push({ playerA: '', playerB: '' });
                renderSets();
            }
        }
    }

    function getSets() {
        return sets.filter(set => set.playerA !== '' && set.playerB !== '').map(set => ({
            playerA: parseInt(set.playerA),
            playerB: parseInt(set.playerB)
        }));
    }

    function validate() {
        const filledSets = getSets();
        if (filledSets.length < minSets) {
            return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
        }

        for (let i = 0; i < filledSets.length; i++) {
            const set = filledSets[i];
            if (!isValidSet(set.playerA, set.playerB)) {
                return { valid: false, error: `Satz ${i + 1}: Ungültiges Ergebnis. Ein Spieler braucht 11+ Punkte und 2 Punkte Vorsprung bei 10:10+.` };
            }
        }

        let playerAWins = 0, playerBWins = 0;
        filledSets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins < setsToWin && playerBWins < setsToWin) {
            return { valid: false, error: `Ein Spieler muss ${setsToWin} Sätze gewinnen.` };
        }

        return { valid: true, winnerId: playerAWins >= setsToWin ? 'A' : 'B', playerAWins, playerBWins };
    }

    function reset() {
        sets.length = 0;
        for (let i = 0; i < minSets; i++) sets.push({ playerA: '', playerB: '' });
        renderSets();
    }

    renderSets();
    return { getSets, validate, reset, refresh: renderSets };
}

// --- Load Pending Requests ---
async function loadPendingRequests() {
    const container = document.getElementById('pending-result-requests-list');
    if (!container) return;

    try {
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine ausstehenden Anfragen</p>';
            return;
        }

        // Get player profiles
        const userIds = [...new Set(requests.flatMap(r => [r.player_a_id, r.player_b_id]))];
        const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        container.innerHTML = requests.map(req => {
            const isPlayerA = req.player_a_id === currentUser.id;
            const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
            const otherPlayer = profileMap[otherPlayerId];
            const setsDisplay = formatSetsDisplay(req.sets);
            const statusText = req.status === 'pending_player' ? 'Wartet auf Bestätigung' : 'Wartet auf Coach';
            const needsResponse = !isPlayerA && req.status === 'pending_player';

            return `
                <div class="bg-white border ${needsResponse ? 'border-indigo-300' : 'border-gray-200'} rounded-lg p-4 shadow-sm mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center gap-3">
                            <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div>
                                <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayer?.display_name || 'Unbekannt'}</p>
                                <p class="text-xs text-gray-500">${setsDisplay}</p>
                            </div>
                        </div>
                        <span class="text-xs ${req.status === 'pending_coach' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'} px-2 py-1 rounded-full">${statusText}</span>
                    </div>
                    ${needsResponse ? `
                        <div class="flex gap-2 mt-3">
                            <button onclick="respondToMatchRequest('${req.id}', true)" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md">
                                <i class="fas fa-check mr-1"></i> Akzeptieren
                            </button>
                            <button onclick="respondToMatchRequest('${req.id}', false)" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                                <i class="fas fa-times mr-1"></i> Ablehnen
                            </button>
                        </div>
                    ` : isPlayerA ? `
                        <div class="flex gap-2 mt-3">
                            <button onclick="deleteMatchRequest('${req.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                                <i class="fas fa-trash mr-1"></i> Zurückziehen
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading pending requests:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

// --- Load Match History ---
async function loadMatchHistory() {
    const container = document.getElementById('match-history-list');
    if (!container) return;

    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('played_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!matches || matches.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe gespielt</p>';
            return;
        }

        // Get player profiles
        const userIds = [...new Set(matches.flatMap(m => [m.player_a_id, m.player_b_id]))];
        const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        container.innerHTML = matches.map(match => {
            const playerA = profileMap[match.player_a_id];
            const playerB = profileMap[match.player_b_id];
            const isWinner = match.winner_id === currentUser.id;
            const setsDisplay = formatSetsDisplay(match.sets);
            const eloChange = match.elo_change_a && match.player_a_id === currentUser.id
                ? match.elo_change_a
                : match.elo_change_b || 0;

            return `
                <div class="bg-white border ${isWinner ? 'border-green-200' : 'border-red-200'} rounded-lg p-4 shadow-sm mb-3">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-medium">${playerA?.display_name || 'Unbekannt'} vs ${playerB?.display_name || 'Unbekannt'}</p>
                            <p class="text-sm text-gray-600">${setsDisplay}</p>
                        </div>
                        <div class="text-right">
                            <span class="${isWinner ? 'text-green-600' : 'text-red-600'} font-bold">${isWinner ? 'Gewonnen' : 'Verloren'}</span>
                            <p class="text-xs ${eloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${eloChange >= 0 ? '+' : ''}${eloChange} Elo
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading match history:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

// --- Format Sets Display ---
function formatSetsDisplay(sets) {
    if (!sets || sets.length === 0) return 'Keine Sätze';
    return sets.map((set, i) => `${set.playerA || set.teamA || 0}:${set.playerB || set.teamB || 0}`).join(', ');
}

// --- Delete Match Request ---
window.deleteMatchRequest = async function(requestId) {
    if (!confirm('Möchtest du diese Anfrage wirklich zurückziehen?')) return;

    try {
        const { error } = await supabase
            .from('match_requests')
            .delete()
            .eq('id', requestId)
            .eq('player_a_id', currentUser.id);

        if (error) throw error;

        loadMatchRequests();
        loadPendingRequests();

    } catch (error) {
        console.error('Error deleting match request:', error);
        alert('Fehler beim Löschen der Anfrage');
    }
};

// --- Setup Match Suggestions ---
function setupMatchSuggestions() {
    const toggleBtn = document.getElementById('toggle-match-suggestions');
    const content = document.getElementById('match-suggestions-content');
    const chevron = document.getElementById('suggestions-chevron');

    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            content.classList.toggle('hidden');
            if (chevron) {
                chevron.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
            if (!content.classList.contains('hidden')) {
                loadMatchSuggestions();
            }
        });
    }
}

// --- Load Match Suggestions ---
async function loadMatchSuggestions() {
    const container = document.getElementById('match-suggestions-list');
    if (!container || !currentUserData.club_id) return;

    container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Lade Vorschläge...</p>';

    try {
        // Get club members (only players and coaches, not admins)
        const { data: clubMembers, error } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, elo_rating')
            .eq('club_id', currentUserData.club_id)
            .neq('id', currentUser.id)
            .in('role', ['player', 'coach'])
            .limit(10);

        if (error) throw error;

        if (!clubMembers || clubMembers.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Keine Spieler gefunden</p>';
            return;
        }

        // Get recent matches to exclude players we've played recently
        const { data: recentMatches } = await supabase
            .from('matches')
            .select('player_a_id, player_b_id')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('played_at', { ascending: false })
            .limit(20);

        const recentOpponents = new Set();
        (recentMatches || []).forEach(m => {
            if (m.player_a_id === currentUser.id) recentOpponents.add(m.player_b_id);
            else recentOpponents.add(m.player_a_id);
        });

        // Prioritize players we haven't played recently
        const suggestions = clubMembers
            .map(p => ({ ...p, playedRecently: recentOpponents.has(p.id) }))
            .sort((a, b) => (a.playedRecently ? 1 : 0) - (b.playedRecently ? 1 : 0))
            .slice(0, 5);

        container.innerHTML = suggestions.map(player => `
            <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 mb-2">
                <div class="flex items-center gap-3">
                    <img src="${player.avatar_url || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <p class="font-medium text-sm">${player.display_name}</p>
                        <p class="text-xs text-gray-500">Elo: ${player.elo_rating || 1000}</p>
                    </div>
                </div>
                <span class="text-xs ${player.playedRecently ? 'text-gray-400' : 'text-green-600 font-medium'}">
                    ${player.playedRecently ? 'Kürzlich gespielt' : '⭐ Empfohlen'}
                </span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading match suggestions:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-2 text-sm">Fehler beim Laden</p>';
    }
}

// --- Setup Leaderboard Preferences ---
function setupLeaderboardPreferences() {
    const toggleBtn = document.getElementById('toggle-leaderboard-preferences');
    const content = document.getElementById('leaderboard-preferences-content');
    const chevron = document.getElementById('preferences-chevron');

    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            content.classList.toggle('hidden');
            if (chevron) {
                chevron.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        });
    }
}

// ========================================================================
// ===== WIDGET SETTINGS =====
// ========================================================================
// Widget system now handled by dashboard-widgets-supabase.js module

// ========================================================================
// ===== PLAYER SUBGROUP FILTER =====
// ========================================================================

/**
 * Populate player subgroup filter dropdown with age groups and custom subgroups
 * @param {Object} userData - Current user data
 */
async function populatePlayerSubgroupFilter(userData) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const hasClub = userData.club_id !== null && userData.club_id !== undefined;
    const subgroupIDs = userData.subgroup_ids || [];

    // Save current selection
    const currentSelection = dropdown.value;

    // If user has no club, show only Global option
    if (!hasClub) {
        dropdown.innerHTML = '';
        dropdown.appendChild(createOption('global', '🌍 Global'));
        dropdown.value = 'global';
        return;
    }

    // Start building dropdown options
    dropdown.innerHTML = '';

    // Add club and global options first
    dropdown.appendChild(createOption('club', '🏠 Mein Verein'));
    dropdown.appendChild(createOption('global', '🌍 Global'));

    // Add Youth Age Groups
    const youthGroup = document.createElement('optgroup');
    youthGroup.label = '⚽ Jugend (nach Alter)';
    AGE_GROUPS.youth.forEach(group => {
        const option = createOption(group.id, group.label);
        youthGroup.appendChild(option);
    });
    dropdown.appendChild(youthGroup);

    // Add Adults Age Group
    const adultsGroup = document.createElement('optgroup');
    adultsGroup.label = '👥 Erwachsene';
    AGE_GROUPS.adults.forEach(group => {
        const option = createOption(group.id, group.label);
        adultsGroup.appendChild(option);
    });
    dropdown.appendChild(adultsGroup);

    // Add Senior Age Groups
    const seniorGroup = document.createElement('optgroup');
    seniorGroup.label = '🎖️ Senioren (nach Alter)';
    AGE_GROUPS.seniors.forEach(group => {
        const option = createOption(group.id, group.label);
        seniorGroup.appendChild(option);
    });
    dropdown.appendChild(seniorGroup);

    // Load and add custom subgroups if user has any
    if (subgroupIDs.length > 0) {
        try {
            const { data: subgroups, error } = await supabase
                .from('subgroups')
                .select('id, name')
                .eq('club_id', userData.club_id)
                .in('id', subgroupIDs)
                .order('created_at', { ascending: true });

            if (!error && subgroups && subgroups.length > 0) {
                const customGroup = document.createElement('optgroup');
                customGroup.label = '📋 Meine Untergruppen im Verein';
                subgroups.forEach(subgroup => {
                    const option = createOption(`subgroup:${subgroup.id}`, subgroup.name);
                    customGroup.appendChild(option);
                });
                dropdown.appendChild(customGroup);
            }
        } catch (error) {
            console.error('[Dashboard] Error loading subgroups:', error);
        }
    }

    // Restore selection if still valid
    const validValues = Array.from(dropdown.options).map(opt => opt.value);
    if (validValues.includes(currentSelection)) {
        dropdown.value = currentSelection;
    } else {
        dropdown.value = 'club';
    }
}

/**
 * Helper function to create option elements
 */
function createOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

console.log('[DASHBOARD-SUPABASE] Script loaded');
