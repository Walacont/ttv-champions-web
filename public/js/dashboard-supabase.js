// SC Champions - Dashboard (Supabase Version)
// Komplett neue Version ohne Firebase-Abhängigkeiten
// Multi-sport support: Dashboard shows data filtered by active sport

import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { RANK_ORDER, groupPlayersByRank, calculateRank, getRankProgress } from './ranks.js';
import { loadDoublesLeaderboard } from './doubles-matches-supabase.js';
import { initializeDoublesPlayerUI, initializeDoublesPlayerSearch } from './doubles-player-ui-supabase.js';
import { initializeLeaderboardPreferences, applyPreferences } from './leaderboard-preferences-supabase.js';
import { initializeWidgetSystem } from './dashboard-widgets-supabase.js';
import { AGE_GROUPS } from './ui-utils-supabase.js';
import { showHeadToHeadModal } from './head-to-head-supabase.js';
import { getSportContext, isCoachInSport } from './sport-context-supabase.js';
import { setLeaderboardSportFilter } from './leaderboard-supabase.js';
import { createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';

// Notifications loaded dynamically - not critical for main functionality
let notificationsModule = null;

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

/**
 * Helper function to create a notification for a user
 */
async function createNotification(userId, type, title, message, data = {}) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                title: title,
                message: message,
                data: data,
                is_read: false
            });

        if (error) {
            console.error('[Dashboard] Error creating notification:', error);
        } else {
            console.log(`[Dashboard] Notification sent to ${userId}: ${type}`);
        }
    } catch (error) {
        console.error('[Dashboard] Error creating notification:', error);
    }
}

/**
 * Helper function to notify all coaches in a club
 */
async function notifyClubCoaches(clubId, type, title, message, data = {}) {
    try {
        const { data: coaches, error: coachError } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', clubId)
            .in('role', ['coach', 'head_coach']);

        if (coachError) {
            console.error('[Dashboard] Error finding coaches:', coachError);
            return;
        }

        if (!coaches || coaches.length === 0) {
            console.log('[Dashboard] No coaches found in club to notify');
            return;
        }

        const notifications = coaches.map(coach => ({
            user_id: coach.id,
            type: type,
            title: title,
            message: message,
            data: data,
            is_read: false
        }));

        const { error } = await supabase.from('notifications').insert(notifications);

        if (error) {
            console.error('[Dashboard] Error creating coach notifications:', error);
        } else {
            console.log(`[Dashboard] Notified ${coaches.length} coach(es) about ${type}`);
        }
    } catch (error) {
        console.error('[Dashboard] Error notifying coaches:', error);
    }
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

    // Initialize notifications (loaded dynamically, non-blocking)
    try {
        notificationsModule = await import('./notifications-supabase.js');
        if (notificationsModule.initNotifications) {
            notificationsModule.initNotifications(currentUser.id);
        }
    } catch (e) {
        console.warn('Notifications not available:', e);
    }

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
    // Cleanup notification subscriptions (if available)
    if (notificationsModule && notificationsModule.cleanupNotifications) {
        notificationsModule.cleanupNotifications();
    }

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

    // Check if user is coach without a club - if so, downgrade to player
    const isCoachInActiveSport = currentSportContext?.role === 'coach' || currentSportContext?.role === 'head_coach';
    const effectiveClub = currentSportContext?.clubId || currentUserData.club_id;

    if (isCoachInActiveSport && !effectiveClub) {
        // Coach without club - downgrade role to player
        console.warn('[DASHBOARD] Coach without club detected, downgrading to player');
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ role: 'player' })
            .eq('id', currentUser.id);

        if (updateError) {
            console.error('[DASHBOARD] Failed to downgrade role:', updateError);
        } else {
            console.log('[DASHBOARD] Role successfully downgraded to player');
            // Update local data
            currentUserData.role = 'player';
        }
    }

    // Show coach switch button only if user is coach or head_coach AND has a club
    if (isCoachInActiveSport && effectiveClub) {
        const switchBtn = document.getElementById('switch-to-coach-btn');
        if (switchBtn) switchBtn.classList.remove('hidden');
    }

    // Show no-club info if needed (reuses effectiveClub from above)
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
    // Profile picture - use avatar_url (saved by settings) or avatar_url (legacy)
    const headerPic = document.getElementById('header-profile-pic');
    if (headerPic) {
        headerPic.src = currentUserData.avatar_url || currentUserData.avatar_url || DEFAULT_AVATAR;
        headerPic.onerror = () => { headerPic.src = DEFAULT_AVATAR; };
    }

    // Welcome message
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg) {
        const name = currentUserData.first_name || 'Spieler';
        welcomeMsg.textContent = `Willkommen zurück, ${name}!`;
    }

    // Club name - use sport context club if available (multi-sport support)
    // A user might be in different clubs for different sports
    const clubName = document.getElementById('header-club-name');
    if (clubName) {
        const effectiveClubName = currentSportContext?.clubName || currentClubData?.name;
        clubName.textContent = effectiveClubName || 'Kein Verein';
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
        // Note: Subgroups are loaded by populatePlayerSubgroupFilter() in initializeDashboard()
        // Do NOT call loadSubgroupsForFilter here - it causes duplicates

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
        const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;
        const sportId = currentSportContext?.sportId;

        // Build query (single sport model - filter directly on profiles)
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, elo_rating, xp, club_id')
            .in('role', ['player', 'coach', 'head_coach']);

        // Apply sport filter
        if (sportId) {
            query = query.eq('active_sport_id', sportId);
            console.log('[DASHBOARD] Rival filter: filtering by sport:', sportId);
        }

        // Apply club/subgroup filter
        if (currentSubgroupFilter === 'club' && effectiveClubId) {
            query = query.eq('club_id', effectiveClubId);
        } else if (currentSubgroupFilter && currentSubgroupFilter.startsWith('subgroup:')) {
            // Custom subgroup filter - filter by subgroup_ids array
            const subgroupId = currentSubgroupFilter.replace('subgroup:', '');
            if (effectiveClubId) {
                query = query.eq('club_id', effectiveClubId);
            }
            query = query.contains('subgroup_ids', [subgroupId]);
        } else if (currentSubgroupFilter !== 'club' && currentSubgroupFilter !== 'global') {
            // Age group filter - apply club filter, age filtering done later
            if (effectiveClubId) {
                query = query.eq('club_id', effectiveClubId);
            }
        }
        // For 'global', only sport filter is applied

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
                <img src="${rival.avatar_url || DEFAULT_AVATAR}" alt="Rivale"
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
                            <img src="${player.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="h-8 w-8 rounded-full object-cover mr-3" onerror="this.src='${DEFAULT_AVATAR}'">
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
        const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;
        // Use sport from context, falling back to profile's active_sport_id
        const sportId = currentSportContext?.sportId || currentUserData.active_sport_id;
        console.log('[Leaderboard] Using sport ID:', sportId, '(from context:', !!currentSportContext?.sportId, ', from profile:', !!currentUserData.active_sport_id, ')');

        // Fetch club data - players in same sport AND club (single sport model)
        if (effectiveClubId) {
            let clubQuery = supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url, xp, elo_rating, points, role, birthdate, gender, subgroup_ids, club_id, clubs:club_id(name), privacy_settings')
                .in('role', ['player', 'coach', 'head_coach']);

            // Filter by sport
            if (sportId) {
                clubQuery = clubQuery.eq('active_sport_id', sportId);
                console.log('[Leaderboard] Sport filter active:', sportId);
            }

            // Filter by club
            clubQuery = clubQuery.eq('club_id', effectiveClubId);

            const { data: clubPlayers, error: clubError } = await clubQuery;

            if (clubError) {
                console.error('[Leaderboard] Error fetching club data:', clubError);
            }

            leaderboardCache.club = (clubPlayers || []).map(p => ({
                ...p,
                club_name: p.clubs?.name || null
            }));
        } else {
            leaderboardCache.club = [];
        }

        // Fetch global data - ALL players in sport (to calculate user's rank, but display only top 100)
        let globalQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, xp, elo_rating, points, role, birthdate, gender, subgroup_ids, club_id, clubs:club_id(name), privacy_settings')
            .in('role', ['player', 'coach', 'head_coach']);

        // Filter by sport for global leaderboard
        if (sportId) {
            globalQuery = globalQuery.eq('active_sport_id', sportId);
        }

        const { data: globalPlayers, error: globalError } = await globalQuery;

        if (globalError) {
            console.error('[Leaderboard] Error fetching global data:', globalError);
        }

        leaderboardCache.global = (globalPlayers || []).map(p => ({
            ...p,
            club_name: p.clubs?.name || null
        }));
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
                    <img src="${player.avatar_url || DEFAULT_AVATAR}"
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
                        <img src="${currentPlayerData.avatar_url || DEFAULT_AVATAR}"
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
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!history || history.length === 0) {
            container.innerHTML = '<li class="text-gray-500 text-center">Noch keine Punkte-Historie</li>';
            return;
        }

        container.innerHTML = history.map(entry => {
            const points = entry.points || 0;
            const xp = entry.xp || 0;
            const eloChange = entry.elo_change || 0;
            const reason = entry.description || entry.reason || 'Punkte';
            const date = formatDate(entry.timestamp || entry.created_at);

            // Build points display
            const pointsClass = points > 0 ? 'text-green-600' : points < 0 ? 'text-red-600' : 'text-gray-600';
            const pointsSign = points > 0 ? '+' : points < 0 ? '' : '±';

            // Build details (XP and Elo)
            const details = [];
            if (xp !== 0) {
                const xpSign = xp > 0 ? '+' : '';
                const xpClass = xp > 0 ? 'text-green-600' : xp < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${xpClass}">${xpSign}${xp} XP</span>`);
            }
            if (eloChange !== 0) {
                const eloSign = eloChange > 0 ? '+' : '';
                const eloClass = eloChange > 0 ? 'text-blue-600' : eloChange < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${eloClass}">${eloSign}${eloChange} Elo</span>`);
            }

            const detailsHtml = details.length > 0
                ? `<span class="text-xs text-gray-500 block mt-1">${details.join(' • ')}</span>`
                : '';

            // Partner badge
            let partnerBadge = '';
            if (entry.is_active_player) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">Aktiv</span>';
            } else if (entry.is_partner) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">Partner</span>';
            }

            return `
                <li class="flex justify-between items-start text-sm p-2 bg-gray-50 rounded">
                    <div>
                        <p class="font-medium">${reason}${partnerBadge}</p>
                        <p class="text-xs text-gray-500">${date}</p>
                    </div>
                    <div class="text-right">
                        <span class="font-bold ${pointsClass}">${pointsSign}${points} Pkt</span>
                        ${detailsHtml}
                    </div>
                </li>
            `;
        }).join('');

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
        // Get pending SINGLES requests where user is involved
        const { data: singlesRequests, error: singlesError } = await supabase
            .from('match_requests')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(10);

        if (singlesError) throw singlesError;

        // Get pending DOUBLES requests where user is involved
        // Fetch all pending doubles requests and filter in JS (Supabase or() with 4 conditions can fail)
        const { data: allDoublesRequests, error: doublesError } = await supabase
            .from('doubles_match_requests')
            .select('*')
            .in('status', ['pending_opponent', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(50);

        if (doublesError) throw doublesError;

        // Filter doubles requests where current user is involved
        const doublesRequests = (allDoublesRequests || []).filter(r =>
            r.team_a_player1_id === currentUser.id ||
            r.team_a_player2_id === currentUser.id ||
            r.team_b_player1_id === currentUser.id ||
            r.team_b_player2_id === currentUser.id
        ).slice(0, 10);

        // Mark each request type
        const singles = (singlesRequests || []).map(r => ({ ...r, _type: 'singles' }));
        const doubles = (doublesRequests || []).map(r => ({ ...r, _type: 'doubles' }));

        // Combine and sort by created_at
        const allRequests = [...singles, ...doubles].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        ).slice(0, 10);

        if (allRequests.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            return;
        }

        // Get unique user IDs to fetch profiles with club info
        const userIds = [...new Set(allRequests.flatMap(r => {
            if (r._type === 'singles') {
                return [r.player_a_id, r.player_b_id];
            } else {
                return [r.team_a_player1_id, r.team_a_player2_id, r.team_b_player1_id, r.team_b_player2_id];
            }
        }))];

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, club_id')
            .in('id', userIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Get club names
        const clubIds = [...new Set((profiles || []).map(p => p.club_id).filter(Boolean))];
        const { data: clubs } = clubIds.length > 0
            ? await supabase.from('clubs').select('id, name').in('id', clubIds)
            : { data: [] };
        const clubMap = {};
        (clubs || []).forEach(c => { clubMap[c.id] = c.name; });

        container.innerHTML = allRequests.map(req => {
            if (req._type === 'singles') {
                return renderSinglesRequestCard(req, profileMap, clubMap);
            } else {
                return renderDoublesRequestCard(req, profileMap);
            }
        }).join('');

        // Update badge (count all pending requests for current user)
        const badge = document.getElementById('match-request-badge');
        if (badge) {
            const singlesPending = singles.filter(r => r.player_b_id === currentUser.id && r.status === 'pending_player').length;
            const doublesPending = doubles.filter(r => {
                const isTeamB = r.team_b_player1_id === currentUser.id || r.team_b_player2_id === currentUser.id;
                return isTeamB && r.status === 'pending_opponent';
            }).length;
            const pendingCount = singlesPending + doublesPending;

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

// Helper to render singles request card
function renderSinglesRequestCard(req, profileMap, clubMap) {
    const isPlayerA = req.player_a_id === currentUser.id;
    const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
    const otherPlayer = profileMap[otherPlayerId];
    const otherPlayerName = otherPlayer ? `${otherPlayer.first_name || ''} ${otherPlayer.last_name || ''}`.trim() || 'Unbekannt' : 'Unbekannt';

    // Club info - only show if different club
    const otherPlayerClubId = otherPlayer?.club_id;
    const myClubId = currentUserData?.club_id;
    const isDifferentClub = otherPlayerClubId && myClubId && otherPlayerClubId !== myClubId;
    const otherClubName = isDifferentClub ? clubMap[otherPlayerClubId] : null;

    // Match result
    const setsDisplay = formatSetsDisplay(req.sets);
    const playerAProfile = profileMap[req.player_a_id];
    const playerBProfile = profileMap[req.player_b_id];
    const playerAName = playerAProfile ? `${playerAProfile.first_name || ''} ${playerAProfile.last_name || ''}`.trim() : 'Spieler A';
    const playerBName = playerBProfile ? `${playerBProfile.first_name || ''} ${playerBProfile.last_name || ''}`.trim() : 'Spieler B';
    const winnerName = req.winner_id === req.player_a_id ? playerAName : playerBName;
    const handicapText = req.handicap_used ? ' (mit Handicap)' : '';

    const statusText = req.status === 'pending_player' ? 'Warte auf Bestätigung' : 'Warte auf Coach';

    return `
        <div class="p-3 bg-white rounded-lg border mb-2">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}"
                         class="w-10 h-10 rounded-full object-cover"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayerName}</p>
                        ${otherClubName ? `<p class="text-xs text-blue-600">${otherClubName}</p>` : ''}
                    </div>
                </div>
                <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">${statusText}</span>
            </div>
            <div class="bg-gray-50 rounded p-2 mb-2 text-sm">
                <p class="text-gray-700">Ergebnis: ${setsDisplay}</p>
                <p class="text-green-700">Gewinner: ${winnerName}${handicapText}</p>
            </div>
            ${!isPlayerA && req.status === 'pending_player' ? `
                <div class="flex gap-2">
                    <button onclick="respondToMatchRequest('${req.id}', true)"
                            class="flex-1 px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                        Annehmen
                    </button>
                    <button onclick="respondToMatchRequest('${req.id}', false)"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                        Ablehnen
                    </button>
                </div>
            ` : isPlayerA ? `
                <div class="flex gap-2">
                    <button onclick="deleteMatchRequest('${req.id}')"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                        Zurückziehen
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// Helper to render doubles request card
function renderDoublesRequestCard(req, profileMap) {
    // Determine which team the current user is on
    const isTeamA = req.team_a_player1_id === currentUser.id || req.team_a_player2_id === currentUser.id;

    // Get player names
    const teamAPlayer1 = profileMap[req.team_a_player1_id];
    const teamAPlayer2 = profileMap[req.team_a_player2_id];
    const teamBPlayer1 = profileMap[req.team_b_player1_id];
    const teamBPlayer2 = profileMap[req.team_b_player2_id];

    const teamAName1 = teamAPlayer1?.first_name || 'Spieler';
    const teamAName2 = teamAPlayer2?.first_name || 'Spieler';
    const teamBName1 = teamBPlayer1?.first_name || 'Spieler';
    const teamBName2 = teamBPlayer2?.first_name || 'Spieler';

    // Determine winner team names
    const winnerTeamName = req.winning_team === 'A'
        ? `${teamAName1} & ${teamAName2}`
        : `${teamBName1} & ${teamBName2}`;

    // Format sets display for doubles
    const setsDisplay = (req.sets || []).map(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ') || '-';

    const handicapText = req.handicap_used ? ' (mit Handicap)' : '';
    const statusText = req.status === 'pending_opponent' ? 'Warte auf Gegner' : 'Warte auf Coach';

    // Request direction text
    let directionText;
    if (isTeamA) {
        directionText = `Doppel-Anfrage an ${teamBName1} & ${teamBName2}`;
    } else {
        directionText = `Doppel-Anfrage von ${teamAName1} & ${teamAName2}`;
    }

    return `
        <div class="p-3 bg-white rounded-lg border border-purple-200 mb-2">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                        <i class="fas fa-users text-purple-600"></i>
                    </div>
                    <div>
                        <p class="font-medium">${directionText}</p>
                        <p class="text-xs text-purple-600">Doppel-Match</p>
                    </div>
                </div>
                <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">${statusText}</span>
            </div>
            <div class="bg-gray-50 rounded p-2 mb-2 text-sm">
                <p class="text-gray-700 mb-1">
                    <span class="text-indigo-600">${teamAName1} & ${teamAName2}</span>
                    <span class="text-gray-500 mx-1">vs</span>
                    <span class="text-indigo-600">${teamBName1} & ${teamBName2}</span>
                </p>
                <p class="text-gray-700">Ergebnis: ${setsDisplay}</p>
                <p class="text-green-700">Gewinner: ${winnerTeamName}${handicapText}</p>
            </div>
            ${!isTeamA && req.status === 'pending_opponent' ? `
                <div class="flex gap-2">
                    <button onclick="respondToDoublesMatchRequest('${req.id}', true)"
                            class="flex-1 px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                        Annehmen
                    </button>
                    <button onclick="respondToDoublesMatchRequest('${req.id}', false)"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                        Ablehnen
                    </button>
                </div>
            ` : isTeamA ? `
                <div class="flex gap-2">
                    <button onclick="deleteDoublesMatchRequest('${req.id}')"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                        Zurückziehen
                    </button>
                </div>
            ` : ''}
        </div>
    `;
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

        // Get user's active sport from profile (single sport model)
        let userSportId = cachedUserSportId;
        if (!userSportId && currentUserData?.active_sport_id) {
            userSportId = currentUserData.active_sport_id;
            cachedUserSportId = userSportId;
        } else if (!userSportId && currentUser) {
            // Fallback: Get sport from profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('active_sport_id')
                .eq('id', currentUser.id)
                .single();

            if (profile?.active_sport_id) {
                userSportId = profile.active_sport_id;
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
    console.log('[Realtime] Setting up realtime subscriptions...');

    // Subscribe to profile changes for current user
    const profileSub = supabase
        .channel('profile_changes')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${currentUser.id}`
        }, payload => {
            console.log('[Realtime] Profile updated:', payload.new);
            currentUserData = { ...currentUserData, ...payload.new };
            updateStatsDisplay();
            updateRankDisplay();
        })
        .subscribe((status) => {
            console.log('[Realtime] Profile subscription status:', status);
        });

    realtimeSubscriptions.push(profileSub);

    // Subscribe to match requests for current user (as player_a - sent requests)
    const matchRequestSubA = supabase
        .channel('match_request_player_a')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'match_requests',
            filter: `player_a_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('[Realtime] Match request update (player_a):', payload.eventType);
            loadMatchRequests();
            loadPendingRequests();
        })
        .subscribe((status) => {
            console.log('[Realtime] Match request (player_a) subscription status:', status);
        });

    realtimeSubscriptions.push(matchRequestSubA);

    // Subscribe to match requests for current user (as player_b - received requests)
    const matchRequestSubB = supabase
        .channel('match_request_player_b')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'match_requests',
            filter: `player_b_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('[Realtime] Match request update (player_b):', payload.eventType);
            loadMatchRequests();
            loadPendingRequests();
            // Show notification for new incoming requests
            if (payload.eventType === 'INSERT') {
                showNewRequestNotification();
            }
        })
        .subscribe((status) => {
            console.log('[Realtime] Match request (player_b) subscription status:', status);
        });

    realtimeSubscriptions.push(matchRequestSubB);

    // Subscribe to matches table for history updates (singles)
    const matchesSub = supabase
        .channel('matches_updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'matches'
        }, (payload) => {
            // Check if current user is involved in this match
            if (payload.new.player_a_id === currentUser.id ||
                payload.new.player_b_id === currentUser.id ||
                payload.new.winner_id === currentUser.id ||
                payload.new.loser_id === currentUser.id) {
                console.log('[Realtime] New singles match created, updating history');
                loadMatchHistory();
                loadPointsHistory();
                // Also refresh match requests as the request may have been deleted
                loadMatchRequests();
                loadPendingRequests();
                // Refresh match suggestions (last played dates changed)
                const suggestionsContent = document.getElementById('match-suggestions-content');
                if (suggestionsContent && !suggestionsContent.classList.contains('hidden')) {
                    loadMatchSuggestions();
                }
            }
        })
        .subscribe((status) => {
            console.log('[Realtime] Matches subscription status:', status);
        });

    realtimeSubscriptions.push(matchesSub);

    // Subscribe to doubles matches for history updates
    const doublesMatchesSub = supabase
        .channel('doubles_matches_updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'doubles_matches'
        }, (payload) => {
            // Check if current user is involved in this doubles match
            if (payload.new.team_a_player1_id === currentUser.id ||
                payload.new.team_a_player2_id === currentUser.id ||
                payload.new.team_b_player1_id === currentUser.id ||
                payload.new.team_b_player2_id === currentUser.id) {
                console.log('[Realtime] New doubles match created, updating history');
                loadMatchHistory();
            }
        })
        .subscribe((status) => {
            console.log('[Realtime] Doubles matches subscription status:', status);
        });

    realtimeSubscriptions.push(doublesMatchesSub);

    // Subscribe to ALL profile Elo changes for leaderboard updates
    const leaderboardSub = supabase
        .channel('leaderboard_updates')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles'
        }, (payload) => {
            // Only reload if Elo changed (to avoid unnecessary reloads)
            if (payload.old?.elo_rating !== payload.new?.elo_rating) {
                console.log('[Realtime] Elo rating changed, updating leaderboard');
                loadLeaderboards();
                // Also update own rank display if it might have changed
                updateRankDisplay();
            }
        })
        .subscribe((status) => {
            console.log('[Realtime] Leaderboard subscription status:', status);
        });

    realtimeSubscriptions.push(leaderboardSub);

    console.log('[Realtime] All subscriptions set up');
}

// --- Show notification for new incoming match request ---
function showNewRequestNotification() {
    // Visual notification
    const requestsSection = document.querySelector('[data-section="match-requests"]');
    if (requestsSection) {
        requestsSection.classList.add('animate-pulse');
        setTimeout(() => requestsSection.classList.remove('animate-pulse'), 2000);
    }

    // Browser notification if permitted
    if (Notification.permission === 'granted') {
        new Notification('Neue Spielanfrage!', {
            body: 'Du hast eine neue Wettkampfanfrage erhalten.',
            icon: '/img/logo.png'
        });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
    }

    // Toast notification
    showToast('Neue Spielanfrage erhalten!', 'info');
}

// --- Toast notification helper ---
function showToast(message, type = 'info') {
    const colors = {
        info: 'bg-indigo-600',
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600'
    };

    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
            // First get player A info for notification
            const { data: request } = await supabase
                .from('match_requests')
                .select('player_a_id')
                .eq('id', requestId)
                .single();

            const { error } = await supabase
                .from('match_requests')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            if (error) throw error;

            // Notify player A that player B rejected the match
            if (request?.player_a_id) {
                const playerBName = `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim() || 'Der Gegner';
                await createNotification(
                    request.player_a_id,
                    'match_rejected',
                    'Spielanfrage abgelehnt',
                    `${playerBName} hat deine Spielanfrage abgelehnt.`
                );
            }

            loadMatchRequests();
            return;
        }

        // Accepted - get the match request details
        const { data: request, error: fetchError } = await supabase
            .from('match_requests')
            .select('*, sports(display_name)')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        // Auto-approve when Player B confirms (no coach approval needed)
        let newStatus = 'approved';
        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }
        approvals.player_b = true;

        console.log('[Match] Auto-approved: Player B confirmed');

        // Update the request
        const { error: updateError } = await supabase
            .from('match_requests')
            .update({
                status: newStatus,
                approvals: approvals
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Create the actual match (always auto-approved now)
        await createMatchFromRequest(request);

        loadMatchRequests();

        // Show feedback
        alert('Match bestätigt!');

    } catch (error) {
        console.error('Error responding to match request:', error);
        alert('Fehler beim Verarbeiten der Anfrage');
    }
};

// --- Doubles Match Request Handlers ---
window.respondToDoublesMatchRequest = async (requestId, accept) => {
    try {
        if (!accept) {
            // Rejected
            const { error } = await supabase
                .from('doubles_match_requests')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            if (error) throw error;
            loadMatchRequests();
            return;
        }

        // Accepted - update approvals and check if auto-approved
        const { data: request, error: fetchError } = await supabase
            .from('doubles_match_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        // Parse approvals
        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }

        // Mark current user's approval
        approvals[currentUser.id] = true;

        // Check if request is fully approved (at least one opponent confirmed)
        // For doubles, we auto-approve when one opponent confirms
        const newStatus = 'approved';

        const { error: updateError } = await supabase
            .from('doubles_match_requests')
            .update({
                status: newStatus,
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        loadMatchRequests();
        alert('Doppel-Match bestätigt!');

    } catch (error) {
        console.error('Error responding to doubles match request:', error);
        alert('Fehler beim Verarbeiten der Doppel-Anfrage');
    }
};

window.deleteDoublesMatchRequest = async (requestId) => {
    if (!confirm('Möchtest du diese Doppel-Anfrage wirklich zurückziehen?')) return;

    try {
        const { error } = await supabase
            .from('doubles_match_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;
        loadMatchRequests();
    } catch (error) {
        console.error('Error deleting doubles match request:', error);
        alert('Fehler beim Löschen der Doppel-Anfrage');
    }
};

/**
 * Create actual match from approved request
 */
async function createMatchFromRequest(request) {
    try {
        // Get club_id from request, or from current user's profile if available
        let clubId = request.club_id || null;
        if (!clubId) {
            // Try to get from player profiles (optional - players may not have a club)
            const { data: playerA } = await supabase
                .from('profiles')
                .select('club_id')
                .eq('id', request.player_a_id)
                .single();
            clubId = playerA?.club_id || null;
        }

        // Build match data - club_id is optional
        const matchData = {
            player_a_id: request.player_a_id,
            player_b_id: request.player_b_id,
            sport_id: request.sport_id,
            winner_id: request.winner_id,
            loser_id: request.loser_id,
            sets: request.sets,
            handicap_used: request.handicap_used || false,
            match_mode: request.match_mode || 'best-of-5'
        };

        // Only add club_id if it exists
        if (clubId) {
            matchData.club_id = clubId;
        }

        const { error } = await supabase
            .from('matches')
            .insert(matchData);

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
    const goldenPointCheckbox = document.getElementById('golden-point-checkbox');
    const matchTieBreakCheckbox = document.getElementById('match-tiebreak-checkbox');
    const tennisOptionsContainer = document.getElementById('tennis-options-container');

    if (!form) return;

    // Determine sport type from currentSportContext (already loaded in initializeDashboard)
    const sportName = currentSportContext?.sportName;
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';

    console.log('[SetupMatchForm] Sport:', sportName, 'isTennis:', isTennisOrPadel, 'isBadminton:', isBadminton);

    // Mode info texts for each sport
    const modeInfoTexts = {
        // Tennis/Padel modes
        'best-of-3-tennis': {
            title: 'Best of 3 (Standard)',
            desc: 'Wer zuerst 2 Sätze gewinnt. Ein Satz geht bis 6 Spiele mit 2 Spielen Vorsprung. Bei 6:6 wird ein Tie-Break gespielt (7:6).',
            example: 'z.B. 6:4, 3:6, 7:5'
        },
        'best-of-5-tennis': {
            title: 'Best of 5 (Grand Slam)',
            desc: 'Wer zuerst 3 Sätze gewinnt. Ein Satz geht bis 6 Spiele mit 2 Spielen Vorsprung. Bei 6:6 wird ein Tie-Break gespielt.',
            example: 'z.B. 6:4, 3:6, 7:6, 6:3'
        },
        'pro-set': {
            title: 'Einzelsatz (Pro Set)',
            desc: 'Nur ein langer Satz. Wer zuerst 9 (oder 10) Spiele erreicht, gewinnt. Es müssen 2 Spiele Vorsprung sein.',
            example: 'z.B. 9:7 oder 10:8'
        },
        'timed': {
            title: 'Zeit / Fortlaufend',
            desc: 'Ideal für Trainingsmatches mit fester Zeit. Es werden einfach die gewonnenen Spiele gezählt, ohne Satz-Logik.',
            example: 'z.B. 14:11 nach 60 Minuten'
        },
        'fast4': {
            title: 'Fast4 (Schnellformat)',
            desc: 'Verkürzte Sätze bis 4 Spiele. Bei 3:3 gibt es einen Tie-Break. Best of 3 Sätze.',
            example: 'z.B. 4:2, 3:4, 4:1'
        },
        // Table Tennis modes
        'best-of-3-tt': {
            title: 'Best of 3',
            desc: 'Wer zuerst 2 Sätze gewinnt. Ein Satz geht bis 11 Punkte mit 2 Punkten Vorsprung.',
            example: 'z.B. 11:9, 8:11, 11:7'
        },
        'best-of-5': {
            title: 'Best of 5 (Standard)',
            desc: 'Wer zuerst 3 Sätze gewinnt. Ein Satz geht bis 11 Punkte mit 2 Punkten Vorsprung.',
            example: 'z.B. 11:9, 11:7, 9:11, 11:5'
        },
        'best-of-7': {
            title: 'Best of 7',
            desc: 'Wer zuerst 4 Sätze gewinnt. Wird oft bei wichtigen Turnieren gespielt.',
            example: 'z.B. 11:9, 11:7, 9:11, 11:5, 11:8'
        },
        'single-set': {
            title: '1 Satz',
            desc: 'Nur ein einzelner Satz. Schnelles Format für Training oder Zeitdruck.',
            example: 'z.B. 11:8'
        },
        // Badminton modes
        'best-of-3-badminton': {
            title: 'Best of 3 (Standard)',
            desc: 'Wer zuerst 2 Sätze gewinnt. Ein Satz geht bis 21 Punkte mit 2 Punkten Vorsprung (max. 30).',
            example: 'z.B. 21:18, 19:21, 21:15'
        }
    };

    // Helper to get mode info key
    function getModeInfoKey(mode) {
        if (isTennisOrPadel) {
            if (mode === 'best-of-3') return 'best-of-3-tennis';
            if (mode === 'best-of-5') return 'best-of-5-tennis';
            return mode;
        } else if (isBadminton) {
            if (mode === 'best-of-3') return 'best-of-3-badminton';
            return mode;
        } else {
            // Table Tennis
            if (mode === 'best-of-3') return 'best-of-3-tt';
            return mode;
        }
    }

    // Create mode info container
    let modeInfoContainer = document.getElementById('match-mode-info');
    if (!modeInfoContainer && matchModeSelect) {
        modeInfoContainer = document.createElement('div');
        modeInfoContainer.id = 'match-mode-info';
        modeInfoContainer.className = 'mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';
        matchModeSelect.parentNode.appendChild(modeInfoContainer);
    }

    // Update mode info display
    function updateModeInfo(mode) {
        if (!modeInfoContainer) return;
        const key = getModeInfoKey(mode);
        const info = modeInfoTexts[key];
        if (info) {
            modeInfoContainer.innerHTML = `
                <div class="flex items-start gap-2">
                    <i class="fas fa-info-circle text-indigo-500 mt-0.5"></i>
                    <div>
                        <div class="font-medium text-gray-700">${info.title}</div>
                        <div class="text-gray-600 mt-1">${info.desc}</div>
                        <div class="text-gray-500 mt-1 italic">${info.example}</div>
                    </div>
                </div>
            `;
        }
    }

    // Update dropdown options based on sport
    if (matchModeSelect) {
        if (isTennisOrPadel) {
            matchModeSelect.innerHTML = `
                <option value="best-of-3" selected>Best of 3 (Standard)</option>
                <option value="best-of-5">Best of 5 (Grand Slam)</option>
                <option value="pro-set">Pro-Set (bis 9/10)</option>
                <option value="timed">Zeit / Fortlaufend</option>
                <option value="fast4">Fast4 (Sätze bis 4)</option>
            `;
        } else if (isBadminton) {
            matchModeSelect.innerHTML = `
                <option value="best-of-3" selected>Best of 3 (Standard)</option>
                <option value="single-set">1 Satz</option>
            `;
        } else {
            // Table Tennis - keep default options
            matchModeSelect.innerHTML = `
                <option value="best-of-3">Best of 3</option>
                <option value="best-of-5" selected>Best of 5 (Standard)</option>
                <option value="best-of-7">Best of 7</option>
                <option value="single-set">1 Satz</option>
            `;
        }
        // Show initial mode info
        updateModeInfo(matchModeSelect.value);
    }

    // Show/hide tennis options based on sport
    if (tennisOptionsContainer) {
        if (isTennisOrPadel) {
            tennisOptionsContainer.classList.remove('hidden');
        } else {
            tennisOptionsContainer.classList.add('hidden');
        }
    }

    // Helper function to update winner display
    function updateWinnerDisplay() {
        const matchWinnerInfo = document.getElementById('match-winner-info');
        const matchWinnerText = document.getElementById('match-winner-text');

        if (!setScoreHandler || !matchWinnerInfo || !matchWinnerText) return;

        // Check if getMatchWinner method exists
        if (typeof setScoreHandler.getMatchWinner !== 'function') return;

        const winnerData = setScoreHandler.getMatchWinner();

        // Only show when match is complete (has a winner)
        if (winnerData && winnerData.winner) {
            // Check if doubles mode is active (multiple ways to detect)
            const doublesToggle = document.getElementById('player-doubles-toggle');
            const doublesContainer = document.getElementById('doubles-players-container');
            const partnerInput = document.getElementById('partner-search-input');

            // Doubles mode if: toggle has 'active' class OR doubles container is visible OR partner input has value
            const isDoublesMode = (doublesToggle && doublesToggle.classList.contains('active')) ||
                                  (doublesContainer && !doublesContainer.classList.contains('hidden')) ||
                                  (partnerInput && partnerInput.value.trim());

            let winnerName;
            if (isDoublesMode) {
                // Doubles: Show both players from winning team
                const opponent1Input = document.getElementById('opponent1-search-input');
                const opponent2Input = document.getElementById('opponent2-search-input');

                const myName = currentUserData?.first_name || 'Du';
                const partnerName = partnerInput?.value?.split(' ')[0] || 'Partner';
                const opp1Name = opponent1Input?.value?.split(' ')[0] || 'Gegner 1';
                const opp2Name = opponent2Input?.value?.split(' ')[0] || 'Gegner 2';

                if (winnerData.winner === 'A') {
                    winnerName = `${myName} & ${partnerName}`;
                } else {
                    winnerName = `${opp1Name} & ${opp2Name}`;
                }
            } else {
                // Singles: Show single player
                if (winnerData.winner === 'A') {
                    winnerName = currentUserData?.first_name || 'Du';
                } else {
                    winnerName = selectedOpponent?.name || 'Gegner';
                }
            }

            matchWinnerText.textContent = `${winnerName} gewinnt mit ${winnerData.setsA}:${winnerData.setsB} Sätzen`;
            matchWinnerInfo.classList.remove('hidden');
        } else {
            // Match not complete yet - hide winner display
            matchWinnerInfo.classList.add('hidden');
        }
    }

    // Helper function to create appropriate score input based on sport and mode
    function createScoreInputForSport(mode) {
        if (!setScoreContainer) return null;

        let handler;
        if (isTennisOrPadel) {
            const options = {
                mode: mode || 'best-of-3',
                goldenPoint: goldenPointCheckbox?.checked || false,
                matchTieBreak: matchTieBreakCheckbox?.checked || false
            };
            handler = createTennisScoreInput(setScoreContainer, [], options);
        } else if (isBadminton) {
            handler = createBadmintonScoreInput(setScoreContainer, [], 'best-of-3');
        } else {
            // Table Tennis (default)
            handler = createSetScoreInput(setScoreContainer, [], mode || 'best-of-5');
        }

        // Add input listener to update winner display
        if (setScoreContainer) {
            setScoreContainer.addEventListener('input', updateWinnerDisplay);
        }

        // Initial update
        setTimeout(updateWinnerDisplay, 100);

        return handler;
    }

    // Initialize set score inputs based on sport
    setScoreHandler = createScoreInputForSport(matchModeSelect?.value);

    // Match mode change
    matchModeSelect?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect.value);
        updateModeInfo(matchModeSelect.value);
    });

    // Tennis-specific options: Golden Point and Match Tie-Break
    goldenPointCheckbox?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
    });

    matchTieBreakCheckbox?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
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

    // Form submission - check if singles or doubles mode
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Check if doubles mode is active
        const doublesToggle = document.getElementById('player-doubles-toggle');
        const isDoublesMode = doublesToggle && doublesToggle.classList.contains('active');

        if (isDoublesMode) {
            // Import and call doubles match request handler
            const { handleDoublesPlayerMatchRequest } = await import('./doubles-player-ui-supabase.js');
            await handleDoublesPlayerMatchRequest(e, supabase, currentUserData);
        } else {
            await submitMatchRequest();
        }
    });

    // Setup match suggestions toggle
    setupMatchSuggestions();

    // Setup leaderboard preferences toggle
    setupLeaderboardPreferences();

    // Initialize doubles player UI (toggle and player search)
    initializeDoublesPlayerUI();
    initializeDoublesPlayerSearch(supabase, currentUserData);
}

// --- Search Opponents ---
async function searchOpponents(query, resultsContainer) {
    try {
        // Load test club IDs for filtering
        const testClubIds = await loadTestClubIds();

        // Check if current user is from a test club
        const isCurrentUserInTestClub = currentUserData.club_id && testClubIds.includes(currentUserData.club_id);

        // Get current user's sport for filtering
        const userSportId = currentUserData.active_sport_id;
        console.log('[Opponent Search] Searching with sport ID:', userSportId, 'query:', query);

        // DEBUG: Check if RLS allows us to see ANY other profiles
        const { data: rlsTest, error: rlsError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, active_sport_id')
            .neq('id', currentUser.id)
            .limit(5);

        console.log('[Opponent Search] RLS TEST - Can see', rlsTest?.length || 0, 'profiles total');
        if (rlsTest?.length > 0) {
            rlsTest.forEach(p => console.log('[Opponent Search] RLS TEST - Found:', p.first_name, p.last_name, 'sport_id:', p.active_sport_id));
        }
        if (rlsError) {
            console.error('[Opponent Search] RLS ERROR:', rlsError);
        }

        // DEBUG: First check how many players exist with this sport (without name filter)
        const { data: allSportPlayers, error: debugError } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, role, active_sport_id')
            .eq('active_sport_id', userSportId)
            .neq('id', currentUser.id);

        console.log('[Opponent Search] DEBUG - All players in this sport:', allSportPlayers?.length || 0);
        if (allSportPlayers?.length > 0) {
            allSportPlayers.forEach(p => console.log('[Opponent Search] DEBUG - Player:', p.first_name, p.last_name, 'role:', p.role));
        }
        if (debugError) {
            console.error('[Opponent Search] DEBUG error:', debugError);
        }

        // Build query - filter by sport if user has one
        let playersQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, elo_rating, club_id, privacy_settings, grundlagen_completed, is_match_ready, active_sport_id, clubs(name)')
            .neq('id', currentUser.id)
            .in('role', ['player', 'coach', 'head_coach'])
            .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);  // Search both first and last name

        // Filter by same sport (single sport model)
        if (userSportId) {
            playersQuery = playersQuery.eq('active_sport_id', userSportId);
        }

        const { data: players, error } = await playersQuery.limit(50);

        if (error) {
            console.error('[Opponent Search] Query error:', error);
            throw error;
        }

        console.log('[Opponent Search] Raw query returned:', players?.length || 0, 'players');
        if (players?.length > 0) {
            console.log('[Opponent Search] First player:', players[0].first_name, players[0].last_name, 'sport:', players[0].active_sport_id, 'grundlagen:', players[0].grundlagen_completed);
        }

        // Filter by privacy settings, match-readiness, and test clubs
        console.log('[Opponent Search] Current user club:', currentUserData.club_id, 'isTestClub:', isCurrentUserInTestClub);

        const filteredPlayers = (players || []).filter(player => {
            // Must be match-ready
            if (player.is_match_ready !== true) {
                console.log('[Opponent Search] Filtered out (not match-ready):', player.first_name, player.last_name, 'is_match_ready:', player.is_match_ready);
                return false;
            }

            // Test club filter: hide players from test clubs unless current user is also from a test club
            if (player.club_id && testClubIds.includes(player.club_id)) {
                // Only show test club players if current user is from the same test club
                if (!isCurrentUserInTestClub || currentUserData.club_id !== player.club_id) {
                    console.log('[Opponent Search] Filtered out (test club):', player.first_name, player.last_name, 'playerClub:', player.club_id, 'userClub:', currentUserData.club_id);
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

            // Same club members should ALWAYS see each other, regardless of privacy setting
            if (currentUserData.club_id && player.club_id === currentUserData.club_id) {
                console.log('[Opponent Search] Same club - visible:', player.first_name, player.last_name);
                return true;
            }

            // Global: visible to everyone (outside of club)
            if (searchable === 'global') return true;

            // Club only: player has set privacy to club_only, and we're not in the same club
            // So they should NOT be visible to outsiders
            console.log('[Opponent Search] Filtered out (privacy club_only):', player.first_name, player.last_name);
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
                <img src="${player.avatar_url || DEFAULT_AVATAR}"
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
// Two types of handicap suggestions:
// 1. Elo-based: When there's a large Elo difference
// 2. H2H-based: When the stronger player has lost 2+ times in a row to the weaker
//
// Sport-specific handicap configuration:
// - Tischtennis: 1 Punkt pro 40 Elo, max 7 Punkte, ab 40 Elo Diff
// - Badminton: 1 Punkt pro 40 Elo, max 12 Punkte, ab 40 Elo Diff
// - Tennis/Padel: 1 Game pro 150 Elo, max 3 Games, ab 150 Elo Diff
async function checkHandicap() {
    const handicapInfo = document.getElementById('match-handicap-info');
    const handicapText = document.getElementById('match-handicap-text');

    if (!handicapInfo || !selectedOpponent) return;

    const myElo = currentUserData.elo_rating || 1000;
    const opponentElo = selectedOpponent.elo;
    const diff = Math.abs(myElo - opponentElo);
    const iAmStronger = myElo > opponentElo;

    // Sport-specific configuration
    const sportName = currentSportContext?.sportName?.toLowerCase();
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';
    const unitText = isTennisOrPadel ? 'Games' : 'Punkten';

    // Get sport-specific threshold for Elo-based handicap
    const threshold = isTennisOrPadel ? 150 : 40;

    let handicapSuggestions = [];

    // --- Check 1: Elo-based handicap ---
    if (diff >= threshold) {
        const stronger = iAmStronger ? 'Du bist' : `${selectedOpponent.name} ist`;
        const weaker = iAmStronger ? selectedOpponent.name : 'Du';

        let handicapValue;
        if (isTennisOrPadel) {
            handicapValue = Math.min(Math.floor(diff / 150), 3);
        } else if (isBadminton) {
            handicapValue = Math.min(Math.floor(diff / 40), 12);
        } else {
            handicapValue = Math.min(Math.floor(diff / 40), 7);
        }

        if (handicapValue > 0) {
            handicapSuggestions.push({
                type: 'elo',
                value: handicapValue,
                text: `${stronger} ${diff} Elo stärker → ${weaker} startet mit +${handicapValue} ${unitText}`
            });
        }
    }

    // --- Check 2: Head-to-Head handicap (consecutive wins by same player) ---
    try {
        const { data: h2hData, error } = await supabase
            .rpc('get_h2h_handicap', {
                p1_id: currentUser.id,
                p2_id: selectedOpponent.id
            });

        if (!error && h2hData && h2hData.length > 0) {
            const h2h = h2hData[0];

            // Show handicap suggestion if there's a winning streak
            if (h2h.suggested_handicap > 0 && h2h.streak_winner_id) {
                const wins = h2h.consecutive_wins;

                if (h2h.streak_winner_id === selectedOpponent.id) {
                    // Opponent has been winning against me
                    handicapSuggestions.push({
                        type: 'h2h',
                        value: h2h.suggested_handicap,
                        text: `${selectedOpponent.name} hat ${wins}x in Folge gegen dich gewonnen. Du startest mit +${h2h.suggested_handicap} ${unitText}`
                    });
                } else if (h2h.streak_winner_id === currentUser.id) {
                    // I have been winning against opponent
                    handicapSuggestions.push({
                        type: 'h2h',
                        value: h2h.suggested_handicap,
                        text: `Du hast ${wins}x in Folge gegen ${selectedOpponent.name} gewonnen. ${selectedOpponent.name} startet mit +${h2h.suggested_handicap} ${unitText}`
                    });
                }
            }
        }
    } catch (e) {
        console.log('[Handicap] H2H check failed:', e);
    }

    // --- Display suggestions ---
    if (handicapSuggestions.length > 0) {
        // Prioritize H2H handicap if it exists, otherwise use Elo-based
        const h2hSuggestion = handicapSuggestions.find(s => s.type === 'h2h');
        const eloSuggestion = handicapSuggestions.find(s => s.type === 'elo');

        let displayText = '';
        // H2H takes priority over Elo-based (more specific to the matchup)
        if (h2hSuggestion) {
            displayText = h2hSuggestion.text;
        } else if (eloSuggestion) {
            displayText = eloSuggestion.text;
        }

        handicapText.innerHTML = displayText.replace(/\n/g, '<br>');
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

    // Get sport ID from context
    const sportId = currentSportContext?.sportId || currentUserData.active_sport_id || null;
    const myClubId = currentSportContext?.clubId || currentUserData.club_id || null;
    const opponentClubId = selectedOpponent.clubId || selectedOpponent.club_id || null;

    // Determine if this is a cross-club match
    const isCrossClub = myClubId !== opponentClubId && myClubId && opponentClubId;

    try {
        const { error } = await supabase
            .from('match_requests')
            .insert({
                player_a_id: currentUser.id,
                player_b_id: selectedOpponent.id,
                club_id: myClubId,
                sport_id: sportId,
                sets: sets,
                match_mode: matchMode,
                handicap_used: handicapUsed,
                winner_id: winnerId,
                loser_id: loserId,
                status: 'pending_player',
                is_cross_club: isCrossClub,
                approvals: JSON.stringify({
                    player_a: true,
                    player_b: false,
                    coach_a: null,
                    coach_b: null
                }),
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        // Notify opponent about the match request
        const playerName = `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim() || 'Ein Spieler';
        await createNotification(
            selectedOpponent.id,
            'match_request',
            'Neue Spielanfrage',
            `${playerName} möchte ein Spiel mit dir eintragen. Bitte bestätige das Ergebnis.`
        );

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

        // Add winner preview div
        let winnerPreview = container.querySelector('.winner-preview');
        if (!winnerPreview) {
            winnerPreview = document.createElement('div');
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold hidden';
            container.appendChild(winnerPreview);
        }

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', handleSetInput);
        });

        updateWinnerPreview();
    }

    function updateWinnerPreview() {
        const winnerPreview = container.querySelector('.winner-preview');
        if (!winnerPreview) return;

        let playerAWins = 0, playerBWins = 0;
        sets.forEach(set => {
            const a = parseInt(set.playerA) || 0;
            const b = parseInt(set.playerB) || 0;
            if (a > b && a >= 11 && (a >= 11 && b < 10 || Math.abs(a - b) >= 2)) playerAWins++;
            if (b > a && b >= 11 && (b >= 11 && a < 10 || Math.abs(a - b) >= 2)) playerBWins++;
        });

        // Get player names
        const playerAName = `${currentUserData?.first_name || ''} ${currentUserData?.last_name || ''}`.trim() || 'Du';
        const playerBName = selectedOpponent?.name || 'Gegner';

        if (playerAWins >= setsToWin) {
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold bg-green-100 text-green-800';
            winnerPreview.innerHTML = `Gewinner: ${playerAName} (${playerAWins}:${playerBWins})`;
            winnerPreview.classList.remove('hidden');
        } else if (playerBWins >= setsToWin) {
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold bg-blue-100 text-blue-800';
            winnerPreview.innerHTML = `Gewinner: ${playerBName} (${playerAWins}:${playerBWins})`;
            winnerPreview.classList.remove('hidden');
        } else if (playerAWins > 0 || playerBWins > 0) {
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold bg-gray-100 text-gray-700';
            winnerPreview.innerHTML = `Zwischenstand: ${playerAWins}:${playerBWins}`;
            winnerPreview.classList.remove('hidden');
        } else {
            winnerPreview.classList.add('hidden');
        }
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        // Fix: Allow 0 as valid value (parseInt("0") || '' would wrongly become '')
        const value = e.target.value.trim();
        sets[setIndex][`player${player}`] = value === '' ? '' : parseInt(value);

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
                return; // renderSets already calls updateWinnerPreview
            }
        }

        // Update winner preview on every input change
        updateWinnerPreview();
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

        // Get player profiles with club info
        const userIds = [...new Set(requests.flatMap(r => [r.player_a_id, r.player_b_id]))];
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, display_name, avatar_url, club_id')
            .in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Get club names
        const clubIds = [...new Set((profiles || []).map(p => p.club_id).filter(Boolean))];
        const { data: clubs } = clubIds.length > 0
            ? await supabase.from('clubs').select('id, name').in('id', clubIds)
            : { data: [] };
        const clubMap = {};
        (clubs || []).forEach(c => { clubMap[c.id] = c.name; });

        container.innerHTML = requests.map(req => {
            const isPlayerA = req.player_a_id === currentUser.id;
            const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
            const otherPlayer = profileMap[otherPlayerId];
            const otherPlayerName = otherPlayer?.display_name ||
                `${otherPlayer?.first_name || ''} ${otherPlayer?.last_name || ''}`.trim() || 'Unbekannt';

            // Club info - only show if different club
            const otherPlayerClubId = otherPlayer?.club_id;
            const myClubId = currentUserData?.club_id;
            const isDifferentClub = otherPlayerClubId && myClubId && otherPlayerClubId !== myClubId;
            const otherClubName = isDifferentClub ? clubMap[otherPlayerClubId] : null;

            // Match result display
            const setsDisplay = formatSetsDisplay(req.sets);
            const playerAProfile = profileMap[req.player_a_id];
            const playerBProfile = profileMap[req.player_b_id];
            const playerAName = playerAProfile?.display_name ||
                `${playerAProfile?.first_name || ''} ${playerAProfile?.last_name || ''}`.trim() || 'Spieler A';
            const playerBName = playerBProfile?.display_name ||
                `${playerBProfile?.first_name || ''} ${playerBProfile?.last_name || ''}`.trim() || 'Spieler B';

            // Determine winner
            const winnerName = req.winner_id === req.player_a_id ? playerAName : playerBName;
            const handicapText = req.handicap_used ? ' (mit Handicap)' : '';

            const statusText = req.status === 'pending_player' ? 'Wartet auf Bestätigung' : 'Wartet auf Coach';
            const needsResponse = !isPlayerA && req.status === 'pending_player';

            return `
                <div class="bg-white border ${needsResponse ? 'border-indigo-300' : 'border-gray-200'} rounded-lg p-4 shadow-sm mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center gap-3">
                            <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div>
                                <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayerName}</p>
                                ${otherClubName ? `<p class="text-xs text-blue-600">${otherClubName}</p>` : ''}
                            </div>
                        </div>
                        <span class="text-xs ${req.status === 'pending_coach' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'} px-2 py-1 rounded-full">${statusText}</span>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-3 mb-3">
                        <p class="text-sm font-medium text-gray-700 mb-1">Ergebnis: ${setsDisplay}</p>
                        <p class="text-sm text-green-700">Gewinner: ${winnerName}${handicapText}</p>
                    </div>
                    ${needsResponse ? `
                        <div class="flex gap-2">
                            <button onclick="respondToMatchRequest('${req.id}', true)" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md">
                                Akzeptieren
                            </button>
                            <button onclick="respondToMatchRequest('${req.id}', false)" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                                Ablehnen
                            </button>
                        </div>
                    ` : isPlayerA ? `
                        <div class="flex gap-2">
                            <button onclick="deleteMatchRequest('${req.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                                Zurückziehen
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

// --- Load Match History (Singles + Doubles) ---
async function loadMatchHistory() {
    const container = document.getElementById('match-history-list');
    if (!container) return;

    try {
        // Fetch singles matches
        const { data: singlesMatches, error: singlesError } = await supabase
            .from('matches')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (singlesError) throw singlesError;

        // Fetch doubles matches
        const { data: doublesMatches, error: doublesError } = await supabase
            .from('doubles_matches')
            .select('*')
            .or(`team_a_player1_id.eq.${currentUser.id},team_a_player2_id.eq.${currentUser.id},team_b_player1_id.eq.${currentUser.id},team_b_player2_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (doublesError) console.warn('Error fetching doubles:', doublesError);

        // Combine and normalize matches
        const allMatches = [
            ...(singlesMatches || []).map(m => ({ ...m, matchType: 'singles' })),
            ...(doublesMatches || []).map(m => ({ ...m, matchType: 'doubles' }))
        ];

        // Sort by date descending
        allMatches.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Take top 10
        const matches = allMatches.slice(0, 10);

        if (matches.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe gespielt</p>';
            return;
        }

        // Collect all player IDs
        const playerIds = new Set();
        matches.forEach(m => {
            if (m.matchType === 'singles') {
                playerIds.add(m.player_a_id);
                playerIds.add(m.player_b_id);
            } else {
                playerIds.add(m.team_a_player1_id);
                playerIds.add(m.team_a_player2_id);
                playerIds.add(m.team_b_player1_id);
                playerIds.add(m.team_b_player2_id);
            }
        });

        // Get player profiles
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, first_name, last_name, avatar_url, elo_rating, wins, losses')
            .in('id', [...playerIds].filter(Boolean));

        // Calculate ranks based on Elo
        const { data: allPlayers } = await supabase
            .from('profiles')
            .select('id, elo_rating')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('elo_rating', { ascending: false });

        const rankMap = {};
        (allPlayers || []).forEach((p, index) => {
            rankMap[p.id] = index + 1;
        });

        const profileMap = {};
        (profiles || []).forEach(p => {
            profileMap[p.id] = {
                ...p,
                rank: rankMap[p.id] || '-'
            };
        });

        // Render matches
        container.innerHTML = matches.map(match => {
            if (match.matchType === 'doubles') {
                return renderDoublesMatchCard(match, profileMap);
            } else {
                return renderSinglesMatchCard(match, profileMap);
            }
        }).join('');

        // Store matches for details modal (separated for modal lookup)
        const singlesMatchesForModal = matches.filter(m => m.matchType !== 'doubles');
        const doublesMatchesForModal = matches.filter(m => m.matchType === 'doubles');
        window.matchHistoryData = { matches: singlesMatchesForModal, doublesMatches: doublesMatchesForModal, profileMap };

    } catch (error) {
        console.error('Error loading match history:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

// --- Render Singles Match Card ---
function renderSinglesMatchCard(match, profileMap) {
    const playerA = profileMap[match.player_a_id] || {};
    const playerB = profileMap[match.player_b_id] || {};
    const isCurrentUserA = match.player_a_id === currentUser.id;
    const isWinner = match.winner_id === currentUser.id;

    const currentPlayer = isCurrentUserA ? playerA : playerB;
    const opponent = isCurrentUserA ? playerB : playerA;

    // Set wins calculation
    let playerASetWins = 0;
    let playerBSetWins = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (scoreA > scoreB) playerASetWins++;
        else if (scoreB > scoreA) playerBSetWins++;
    });

    const mySetWins = isCurrentUserA ? playerASetWins : playerBSetWins;
    const oppSetWins = isCurrentUserA ? playerBSetWins : playerASetWins;

    const setScoresDisplay = sets.map(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        return isCurrentUserA ? `${scoreA}-${scoreB}` : `${scoreB}-${scoreA}`;
    }).join(', ');

    const eloChange = isWinner ? (match.winner_elo_change || 0) : (match.loser_elo_change || 0);
    const pointsAwarded = isWinner ? (match.season_points_awarded || 0) : 0;

    const matchDate = new Date(match.created_at);
    const dateDisplay = formatRelativeDate(matchDate);
    const timeDisplay = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const myAvatar = currentPlayer.avatar_url || DEFAULT_AVATAR;
    const oppAvatar = opponent.avatar_url || DEFAULT_AVATAR;

    let statsHtml = '';
    if (isWinner) {
        const displayElo = Math.abs(eloChange);
        statsHtml = `<span class="text-green-600 font-medium">+${displayElo} Elo</span>`;
        if (pointsAwarded > 0) {
            statsHtml += `<span class="text-green-600 font-medium ml-2">+${pointsAwarded} Pkt</span>`;
        }
    } else {
        const displayElo = Math.abs(eloChange);
        statsHtml = `<span class="text-red-600 font-medium">-${displayElo} Elo</span>`;
    }

    const handicapBadge = match.handicap_used
        ? '<span class="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">Handicap</span>'
        : '';

    return `
        <div class="bg-white rounded-xl shadow-sm border-l-4 ${isWinner ? 'border-l-green-500' : 'border-l-red-500'} p-4 mb-4">
            <div class="flex justify-between items-center mb-3">
                <span class="text-sm text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${isWinner ? 'Sieg' : 'Niederlage'}
                </span>
            </div>

            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                    <img src="${myAvatar}" alt="Du"
                        class="w-12 h-12 rounded-full object-cover border-2 ${isWinner ? 'border-green-500' : 'border-red-500'}"
                        onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="ml-3">
                        <p class="font-semibold">Du</p>
                        <p class="text-xs text-gray-500">Rang #${currentPlayer.rank}</p>
                    </div>
                </div>

                <div class="text-center px-4">
                    <p class="text-2xl font-bold">${mySetWins} : ${oppSetWins}</p>
                    <p class="text-xs text-gray-500">${setScoresDisplay}</p>
                </div>

                <div class="flex items-center">
                    <div class="mr-3 text-right">
                        <p class="font-semibold">${opponent.first_name || opponent.display_name || 'Gegner'}</p>
                        <p class="text-xs text-gray-500">Rang #${opponent.rank}</p>
                    </div>
                    <img src="${oppAvatar}" alt="Gegner"
                        class="w-12 h-12 rounded-full object-cover border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'}"
                        onerror="this.src='${DEFAULT_AVATAR}'">
                </div>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <div class="flex items-center">
                    ${statsHtml}${handicapBadge}
                </div>
                <button onclick="showMatchDetails('${match.id}', 'singles')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                    Details
                </button>
            </div>
        </div>
    `;
}

// --- Render Doubles Match Card ---
function renderDoublesMatchCard(match, profileMap) {
    // Determine which team the current user is on
    const isTeamA = match.team_a_player1_id === currentUser.id || match.team_a_player2_id === currentUser.id;
    const isWinner = (isTeamA && match.winning_team === 'A') || (!isTeamA && match.winning_team === 'B');

    // Get player data
    const myTeamPlayer1 = isTeamA ? profileMap[match.team_a_player1_id] : profileMap[match.team_b_player1_id];
    const myTeamPlayer2 = isTeamA ? profileMap[match.team_a_player2_id] : profileMap[match.team_b_player2_id];
    const oppTeamPlayer1 = isTeamA ? profileMap[match.team_b_player1_id] : profileMap[match.team_a_player1_id];
    const oppTeamPlayer2 = isTeamA ? profileMap[match.team_b_player2_id] : profileMap[match.team_a_player2_id];

    // Find partner (the other player on my team)
    const partnerId = isTeamA
        ? (match.team_a_player1_id === currentUser.id ? match.team_a_player2_id : match.team_a_player1_id)
        : (match.team_b_player1_id === currentUser.id ? match.team_b_player2_id : match.team_b_player1_id);
    const partner = profileMap[partnerId] || {};

    // Set wins calculation
    let teamASetWins = 0;
    let teamBSetWins = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        if (scoreA > scoreB) teamASetWins++;
        else if (scoreB > scoreA) teamBSetWins++;
    });

    const mySetWins = isTeamA ? teamASetWins : teamBSetWins;
    const oppSetWins = isTeamA ? teamBSetWins : teamASetWins;

    const setScoresDisplay = sets.map(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        return isTeamA ? `${scoreA}-${scoreB}` : `${scoreB}-${scoreA}`;
    }).join(', ');

    const matchDate = new Date(match.created_at);
    const dateDisplay = formatRelativeDate(matchDate);
    const timeDisplay = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const myAvatar = currentUserData?.avatar_url || DEFAULT_AVATAR;
    const partnerAvatar = partner.avatar_url || DEFAULT_AVATAR;
    const opp1Avatar = oppTeamPlayer1?.avatar_url || DEFAULT_AVATAR;
    const opp2Avatar = oppTeamPlayer2?.avatar_url || DEFAULT_AVATAR;

    const partnerName = partner.first_name || partner.display_name || 'Partner';
    const opp1Name = oppTeamPlayer1?.first_name || oppTeamPlayer1?.display_name || 'Gegner';
    const opp2Name = oppTeamPlayer2?.first_name || oppTeamPlayer2?.display_name || 'Gegner';

    const handicapBadge = match.handicap_used
        ? '<span class="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">Handicap</span>'
        : '';

    // Elo display for doubles (simplified - may not have individual elo changes)
    let statsHtml = isWinner
        ? '<span class="text-green-600 font-medium">Doppel-Sieg</span>'
        : '<span class="text-red-600 font-medium">Doppel-Niederlage</span>';

    return `
        <div class="bg-white rounded-xl shadow-sm border-l-4 ${isWinner ? 'border-l-green-500' : 'border-l-red-500'} p-4 mb-4">
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">Doppel</span>
                    <span class="text-sm text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                </div>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${isWinner ? 'Sieg' : 'Niederlage'}
                </span>
            </div>

            <div class="flex items-center justify-between mb-3">
                <!-- My Team -->
                <div class="flex items-center">
                    <div class="flex -space-x-2">
                        <img src="${myAvatar}" alt="Du"
                            class="w-10 h-10 rounded-full object-cover border-2 ${isWinner ? 'border-green-500' : 'border-red-500'} z-10"
                            onerror="this.src='${DEFAULT_AVATAR}'">
                        <img src="${partnerAvatar}" alt="${partnerName}"
                            class="w-10 h-10 rounded-full object-cover border-2 ${isWinner ? 'border-green-500' : 'border-red-500'}"
                            onerror="this.src='${DEFAULT_AVATAR}'">
                    </div>
                    <div class="ml-3">
                        <p class="font-semibold text-sm">Du & ${partnerName}</p>
                    </div>
                </div>

                <!-- Score -->
                <div class="text-center px-4">
                    <p class="text-2xl font-bold">${mySetWins} : ${oppSetWins}</p>
                    <p class="text-xs text-gray-500">${setScoresDisplay}</p>
                </div>

                <!-- Opponent Team -->
                <div class="flex items-center">
                    <div class="mr-3 text-right">
                        <p class="font-semibold text-sm">${opp1Name} & ${opp2Name}</p>
                    </div>
                    <div class="flex -space-x-2">
                        <img src="${opp1Avatar}" alt="${opp1Name}"
                            class="w-10 h-10 rounded-full object-cover border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'} z-10"
                            onerror="this.src='${DEFAULT_AVATAR}'">
                        <img src="${opp2Avatar}" alt="${opp2Name}"
                            class="w-10 h-10 rounded-full object-cover border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'}"
                            onerror="this.src='${DEFAULT_AVATAR}'">
                    </div>
                </div>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <div class="flex items-center">
                    ${statsHtml}${handicapBadge}
                </div>
                <button onclick="showMatchDetails('${match.id}', 'doubles')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                    Details
                </button>
            </div>
        </div>
    `;
}

// --- Format Relative Date ---
function formatRelativeDate(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const matchDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (matchDay.getTime() === today.getTime()) {
        return 'Heute';
    } else if (matchDay.getTime() === yesterday.getTime()) {
        return 'Gestern';
    } else {
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
}

// --- Show Match Details Modal ---
window.showMatchDetails = function(matchId, matchType = 'singles') {
    const { matches, doublesMatches, profileMap } = window.matchHistoryData || {};

    // Find match in appropriate array
    const match = matchType === 'doubles'
        ? doublesMatches?.find(m => m.id === matchId)
        : matches?.find(m => m.id === matchId);
    if (!match) return;

    // Handle doubles matches differently
    if (matchType === 'doubles') {
        showDoublesMatchDetails(match, profileMap);
        return;
    }

    const playerA = profileMap[match.player_a_id] || {};
    const playerB = profileMap[match.player_b_id] || {};
    const isCurrentUserA = match.player_a_id === currentUser.id;
    const isWinner = match.winner_id === currentUser.id;

    const currentPlayer = isCurrentUserA ? playerA : playerB;
    const opponent = isCurrentUserA ? playerB : playerA;

    // Set details
    const sets = match.sets || [];
    let setsHtml = sets.map((set, i) => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        const myScore = isCurrentUserA ? scoreA : scoreB;
        const oppScore = isCurrentUserA ? scoreB : scoreA;
        const wonSet = myScore > oppScore;
        return `
            <div class="flex justify-between items-center py-2 ${i < sets.length - 1 ? 'border-b border-gray-100' : ''}">
                <span class="text-gray-600">Satz ${i + 1}</span>
                <span class="font-semibold ${wonSet ? 'text-green-600' : 'text-red-600'}">${myScore} : ${oppScore}</span>
            </div>
        `;
    }).join('');

    // Match mode display
    const modeLabels = {
        'single-set': '1 Satz',
        'best-of-3': 'Best of 3',
        'best-of-5': 'Best of 5',
        'best-of-7': 'Best of 7',
        'pro-set': 'Pro-Set',
        'timed': 'Zeit/Fortlaufend',
        'fast4': 'Fast4'
    };
    const modeDisplay = modeLabels[match.match_mode] || match.match_mode || 'Standard';

    // Elo changes - winner gains (positive), loser loses (negative display)
    const winnerEloChange = Math.abs(match.winner_elo_change || 0);
    const loserEloChange = -Math.abs(match.loser_elo_change || 0);
    const myEloChange = isWinner ? winnerEloChange : loserEloChange;
    const oppEloChange = isWinner ? loserEloChange : winnerEloChange;

    // Date
    const matchDate = new Date(match.created_at);
    const dateStr = matchDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const modalHtml = `
        <div id="match-details-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick="if(event.target === this) this.remove()">
            <div class="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 class="text-lg font-bold">Match Details</h3>
                    <button onclick="document.getElementById('match-details-modal').remove()" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- Content -->
                <div class="p-4">
                    <!-- Result Badge -->
                    <div class="text-center mb-4">
                        <span class="px-4 py-2 rounded-full text-lg font-bold ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${isWinner ? 'Sieg' : 'Niederlage'}
                        </span>
                    </div>

                    <!-- Players -->
                    <div class="flex items-center justify-between mb-6">
                        <div class="text-center">
                            <img src="${currentPlayer.avatar_url || DEFAULT_AVATAR}" class="w-16 h-16 rounded-full mx-auto border-2 ${isWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <p class="font-semibold mt-2">Du</p>
                            <p class="text-xs text-gray-500">${currentPlayer.elo_rating || 800} Elo</p>
                        </div>
                        <div class="text-2xl font-bold text-gray-400">VS</div>
                        <div class="text-center">
                            <img src="${opponent.avatar_url || DEFAULT_AVATAR}" class="w-16 h-16 rounded-full mx-auto border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <p class="font-semibold mt-2">${opponent.first_name || opponent.display_name || 'Gegner'}</p>
                            <p class="text-xs text-gray-500">${opponent.elo_rating || 800} Elo</p>
                        </div>
                    </div>

                    <!-- Set Scores -->
                    <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <h4 class="font-semibold mb-2 text-sm text-gray-600">Satzergebnisse</h4>
                        ${setsHtml}
                    </div>

                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Deine Elo-Änderung</p>
                            <p class="text-lg font-bold ${myEloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${myEloChange >= 0 ? '+' : ''}${myEloChange}
                            </p>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Gegner Elo-Änderung</p>
                            <p class="text-lg font-bold ${oppEloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${oppEloChange >= 0 ? '+' : ''}${oppEloChange}
                            </p>
                        </div>
                        ${isWinner && match.season_points_awarded ? `
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Saisonpunkte</p>
                            <p class="text-lg font-bold text-green-600">+${match.season_points_awarded}</p>
                        </div>
                        ` : ''}
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Spielmodus</p>
                            <p class="text-sm font-semibold">${modeDisplay}</p>
                        </div>
                    </div>

                    <!-- Handicap Info -->
                    ${match.handicap_used ? `
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-center">
                        <span class="text-yellow-800 font-medium">Handicap-Match</span>
                        <p class="text-xs text-yellow-600 mt-1">Feste Elo-Änderung: ±8 Punkte</p>
                    </div>
                    ` : ''}

                    <!-- Date -->
                    <div class="text-center text-sm text-gray-500">
                        ${dateStr}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('match-details-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// --- Show Doubles Match Details Modal ---
function showDoublesMatchDetails(match, profileMap) {
    const teamAPlayer1 = profileMap[match.team_a_player1_id] || {};
    const teamAPlayer2 = profileMap[match.team_a_player2_id] || {};
    const teamBPlayer1 = profileMap[match.team_b_player1_id] || {};
    const teamBPlayer2 = profileMap[match.team_b_player2_id] || {};

    // Determine if current user is in team A or B
    const isInTeamA = match.team_a_player1_id === currentUser.id || match.team_a_player2_id === currentUser.id;
    const isWinner = isInTeamA ? match.winning_team === 'A' : match.winning_team === 'B';

    // Get partner and opponents
    let myAvatar, partnerAvatar, partnerName, opp1Name, opp2Name, opp1Avatar, opp2Avatar;
    if (isInTeamA) {
        const me = match.team_a_player1_id === currentUser.id ? teamAPlayer1 : teamAPlayer2;
        const partner = match.team_a_player1_id === currentUser.id ? teamAPlayer2 : teamAPlayer1;
        myAvatar = me.avatar_url || DEFAULT_AVATAR;
        partnerAvatar = partner.avatar_url || DEFAULT_AVATAR;
        partnerName = partner.first_name || partner.display_name || 'Partner';
        opp1Name = teamBPlayer1.first_name || teamBPlayer1.display_name || 'Gegner 1';
        opp2Name = teamBPlayer2.first_name || teamBPlayer2.display_name || 'Gegner 2';
        opp1Avatar = teamBPlayer1.avatar_url || DEFAULT_AVATAR;
        opp2Avatar = teamBPlayer2.avatar_url || DEFAULT_AVATAR;
    } else {
        const me = match.team_b_player1_id === currentUser.id ? teamBPlayer1 : teamBPlayer2;
        const partner = match.team_b_player1_id === currentUser.id ? teamBPlayer2 : teamBPlayer1;
        myAvatar = me.avatar_url || DEFAULT_AVATAR;
        partnerAvatar = partner.avatar_url || DEFAULT_AVATAR;
        partnerName = partner.first_name || partner.display_name || 'Partner';
        opp1Name = teamAPlayer1.first_name || teamAPlayer1.display_name || 'Gegner 1';
        opp2Name = teamAPlayer2.first_name || teamAPlayer2.display_name || 'Gegner 2';
        opp1Avatar = teamAPlayer1.avatar_url || DEFAULT_AVATAR;
        opp2Avatar = teamAPlayer2.avatar_url || DEFAULT_AVATAR;
    }

    // Set details
    const sets = match.sets || [];
    let setsHtml = sets.map((set, i) => {
        const scoreA = set.teamA ?? 0;
        const scoreB = set.teamB ?? 0;
        const myScore = isInTeamA ? scoreA : scoreB;
        const oppScore = isInTeamA ? scoreB : scoreA;
        const wonSet = myScore > oppScore;
        return `
            <div class="flex justify-between items-center py-2 ${i < sets.length - 1 ? 'border-b border-gray-100' : ''}">
                <span class="text-gray-600">Satz ${i + 1}</span>
                <span class="font-semibold ${wonSet ? 'text-green-600' : 'text-red-600'}">${myScore} : ${oppScore}</span>
            </div>
        `;
    }).join('');

    // Match mode display
    const modeLabels = {
        'single-set': '1 Satz',
        'best-of-3': 'Best of 3',
        'best-of-5': 'Best of 5',
        'best-of-7': 'Best of 7',
        'pro-set': 'Pro-Set',
        'timed': 'Zeit/Fortlaufend',
        'fast4': 'Fast4'
    };
    const modeDisplay = modeLabels[match.match_mode] || match.match_mode || 'Standard';

    // Date
    const matchDate = new Date(match.created_at);
    const dateStr = matchDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const modalHtml = `
        <div id="match-details-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick="if(event.target === this) this.remove()">
            <div class="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <!-- Header -->
                <div class="p-4 border-b border-gray-200 flex justify-between items-center">
                    <div class="flex items-center gap-2">
                        <h3 class="text-lg font-bold">Match Details</h3>
                        <span class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">Doppel</span>
                    </div>
                    <button onclick="document.getElementById('match-details-modal').remove()" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- Content -->
                <div class="p-4">
                    <!-- Result Badge -->
                    <div class="text-center mb-4">
                        <span class="px-4 py-2 rounded-full text-lg font-bold ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${isWinner ? 'Sieg' : 'Niederlage'}
                        </span>
                    </div>

                    <!-- Teams -->
                    <div class="flex items-center justify-between mb-6">
                        <!-- Your Team -->
                        <div class="text-center">
                            <div class="flex -space-x-2 justify-center mb-2">
                                <img src="${myAvatar}" class="w-12 h-12 rounded-full border-2 ${isWinner ? 'border-green-500' : 'border-red-500'} z-10" onerror="this.src='${DEFAULT_AVATAR}'">
                                <img src="${partnerAvatar}" class="w-12 h-12 rounded-full border-2 ${isWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            </div>
                            <p class="font-semibold text-sm">Du & ${partnerName}</p>
                        </div>
                        <div class="text-2xl font-bold text-gray-400">VS</div>
                        <!-- Opponent Team -->
                        <div class="text-center">
                            <div class="flex -space-x-2 justify-center mb-2">
                                <img src="${opp1Avatar}" class="w-12 h-12 rounded-full border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'} z-10" onerror="this.src='${DEFAULT_AVATAR}'">
                                <img src="${opp2Avatar}" class="w-12 h-12 rounded-full border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            </div>
                            <p class="font-semibold text-sm">${opp1Name} & ${opp2Name}</p>
                        </div>
                    </div>

                    <!-- Set Scores -->
                    <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <h4 class="font-semibold mb-2 text-sm text-gray-600">Satzergebnisse</h4>
                        ${setsHtml || '<p class="text-gray-400 text-sm">Keine Satzergebnisse</p>'}
                    </div>

                    <!-- Stats Grid -->
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Spielmodus</p>
                            <p class="text-sm font-semibold">${modeDisplay}</p>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Spieltyp</p>
                            <p class="text-sm font-semibold">Doppel</p>
                        </div>
                    </div>

                    <!-- Handicap Info -->
                    ${match.handicap_used ? `
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-center">
                        <span class="text-yellow-800 font-medium">Handicap-Match</span>
                    </div>
                    ` : ''}

                    <!-- Date -->
                    <div class="text-center text-sm text-gray-500">
                        ${dateStr}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('match-details-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// --- Format Sets Display ---
// Works for all sports: table tennis, tennis, badminton, padel
// Supports all modes: single-set, best-of-3, best-of-5, best-of-7
function formatSetsDisplay(sets) {
    if (!sets || sets.length === 0) return 'Keine Sätze';

    // Count set wins for each player/team
    let playerASetWins = 0;
    let playerBSetWins = 0;

    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (scoreA > scoreB) playerASetWins++;
        else if (scoreB > scoreA) playerBSetWins++;
    });

    // Format individual set scores
    const setScores = sets.map(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ');

    // Single set mode: just show the score
    if (sets.length === 1) {
        return setScores;
    }

    // Multiple sets: show set count and individual scores
    // Format: "3:1 (11:5, 11:7, 9:11, 11:3)"
    return `${playerASetWins}:${playerBSetWins} (${setScores})`;
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
// Shows 5 players from the club:
// 1. Players never played against (priority)
// 2. Players not played against for a long time
// Includes: last match date, Elo handicap, H2H handicap
async function loadMatchSuggestions() {
    const container = document.getElementById('match-suggestions-list');
    if (!container) return;

    // Allow suggestions even without club (show all players)
    const hasClub = !!currentUserData.club_id;

    container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Lade Vorschläge...</p>';

    try {
        // Get potential opponents
        let query = supabase
            .from('profiles')
            .select('id, display_name, first_name, avatar_url, elo_rating')
            .neq('id', currentUser.id)
            .in('role', ['player', 'coach', 'head_coach']);

        if (hasClub) {
            query = query.eq('club_id', currentUserData.club_id);
        }

        const { data: clubMembers, error } = await query.limit(50);

        if (error) throw error;

        if (!clubMembers || clubMembers.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Keine Spieler gefunden</p>';
            return;
        }

        // Get ALL matches with current user to find last played date
        const { data: allMatches } = await supabase
            .from('matches')
            .select('player_a_id, player_b_id, created_at')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });

        // Build map of opponent -> last match date
        const lastMatchMap = {};
        (allMatches || []).forEach(m => {
            const opponentId = m.player_a_id === currentUser.id ? m.player_b_id : m.player_a_id;
            if (!lastMatchMap[opponentId]) {
                lastMatchMap[opponentId] = new Date(m.created_at);
            }
        });

        // Get H2H data for all potential opponents
        const h2hPromises = clubMembers.map(async (player) => {
            try {
                const { data } = await supabase.rpc('get_h2h_handicap', {
                    p1_id: currentUser.id,
                    p2_id: player.id
                });
                return { playerId: player.id, h2h: data?.[0] || null };
            } catch {
                return { playerId: player.id, h2h: null };
            }
        });

        const h2hResults = await Promise.all(h2hPromises);
        const h2hMap = {};
        h2hResults.forEach(r => { h2hMap[r.playerId] = r.h2h; });

        // Calculate suggestion data for each player
        const myElo = currentUserData.elo_rating || 1000;
        const sportName = currentSportContext?.sportName?.toLowerCase();
        const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
        const threshold = isTennisOrPadel ? 150 : 40;
        const maxHandicap = isTennisOrPadel ? 3 : 7;
        const unitText = isTennisOrPadel ? 'Games' : 'Pkt';

        const suggestions = clubMembers.map(player => {
            const lastMatch = lastMatchMap[player.id];
            const neverPlayed = !lastMatch;
            const daysSinceLastMatch = lastMatch
                ? Math.floor((Date.now() - lastMatch.getTime()) / (1000 * 60 * 60 * 24))
                : Infinity;

            // Elo handicap
            const playerElo = player.elo_rating || 1000;
            const eloDiff = Math.abs(myElo - playerElo);
            let eloHandicap = 0;
            let eloHandicapFor = null;
            if (eloDiff >= threshold) {
                eloHandicap = Math.min(Math.floor(eloDiff / threshold), maxHandicap);
                eloHandicapFor = myElo > playerElo ? player.display_name : 'Du';
            }

            // H2H handicap
            const h2h = h2hMap[player.id];
            let h2hHandicap = 0;
            let h2hHandicapFor = null;
            if (h2h && h2h.suggested_handicap > 0 && h2h.streak_winner_id) {
                h2hHandicap = h2h.suggested_handicap;
                h2hHandicapFor = h2h.streak_winner_id === currentUser.id ? player.display_name : 'Du';
            }

            return {
                ...player,
                lastMatch,
                neverPlayed,
                daysSinceLastMatch,
                eloHandicap,
                eloHandicapFor,
                h2hHandicap,
                h2hHandicapFor,
                eloDiff
            };
        });

        // Sort: never played first, then by days since last match (descending)
        suggestions.sort((a, b) => {
            if (a.neverPlayed && !b.neverPlayed) return -1;
            if (!a.neverPlayed && b.neverPlayed) return 1;
            return b.daysSinceLastMatch - a.daysSinceLastMatch;
        });

        // Take top 5
        const top5 = suggestions.slice(0, 5);

        if (top5.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Keine Vorschläge</p>';
            return;
        }

        container.innerHTML = top5.map(player => {
            // Format last match date
            let lastMatchText;
            if (player.neverPlayed) {
                lastMatchText = '<span class="text-green-600 font-medium">Noch nie gespielt</span>';
            } else if (player.daysSinceLastMatch === 0) {
                lastMatchText = 'Heute gespielt';
            } else if (player.daysSinceLastMatch === 1) {
                lastMatchText = 'Gestern gespielt';
            } else if (player.daysSinceLastMatch < 7) {
                lastMatchText = `Vor ${player.daysSinceLastMatch} Tagen`;
            } else if (player.daysSinceLastMatch < 30) {
                const weeks = Math.floor(player.daysSinceLastMatch / 7);
                lastMatchText = `Vor ${weeks} Woche${weeks > 1 ? 'n' : ''}`;
            } else {
                const months = Math.floor(player.daysSinceLastMatch / 30);
                lastMatchText = `<span class="text-orange-600">Vor ${months} Monat${months > 1 ? 'en' : ''}</span>`;
            }

            // Handicap info
            let handicapHtml = '';
            if (player.eloHandicap > 0 || player.h2hHandicap > 0) {
                const parts = [];
                if (player.eloHandicap > 0) {
                    parts.push(`Elo: ${player.eloHandicapFor} +${player.eloHandicap}`);
                }
                if (player.h2hHandicap > 0) {
                    parts.push(`H2H: ${player.h2hHandicapFor} +${player.h2hHandicap}`);
                }
                handicapHtml = `<p class="text-xs text-blue-600">${parts.join(' | ')}</p>`;
            }

            return `
                <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 mb-2 hover:border-indigo-300 transition-colors">
                    <div class="flex items-center gap-3">
                        <img src="${player.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full object-cover" onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <p class="font-medium text-sm">${player.display_name || player.first_name}</p>
                            <p class="text-xs text-gray-500">${player.elo_rating || 1000} Elo ${player.eloDiff > 0 ? `(${myElo > player.elo_rating ? '+' : ''}${myElo - (player.elo_rating || 1000)})` : ''}</p>
                            ${handicapHtml}
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-gray-500">${lastMatchText}</p>
                        <button onclick="quickSelectOpponent('${player.id}', '${(player.display_name || player.first_name).replace(/'/g, "\\'")}', ${player.elo_rating || 1000})"
                            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1">
                            Herausfordern
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading match suggestions:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-2 text-sm">Fehler beim Laden</p>';
    }
}

// Quick select opponent from suggestions
window.quickSelectOpponent = function(playerId, playerName, playerElo) {
    // Set the opponent in the match request form
    selectedOpponent = { id: playerId, name: playerName, elo: playerElo };
    document.getElementById('selected-opponent-id').value = playerId;
    document.getElementById('selected-opponent-elo').value = playerElo;
    document.getElementById('opponent-search-input').value = playerName;
    document.getElementById('opponent-search-results').innerHTML = '';

    // Show the selected opponent display
    const display = document.getElementById('selected-opponent-display');
    if (display) {
        display.innerHTML = `
            <div class="flex items-center justify-between bg-indigo-50 p-3 rounded-lg">
                <div>
                    <p class="font-medium">${playerName}</p>
                    <p class="text-sm text-gray-500">${playerElo} Elo</p>
                </div>
                <button onclick="clearOpponentSelection()" class="text-red-500 hover:text-red-700">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
    }

    // Check handicap
    checkHandicap();

    // Scroll to match form
    document.getElementById('match-request-section')?.scrollIntoView({ behavior: 'smooth' });
};

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
