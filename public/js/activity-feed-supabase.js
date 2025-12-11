/**
 * Activity Feed Module - Supabase Version
 * Shows recent matches from club members and followed users
 * Includes Strava-style like/kudos functionality, infinite scroll, and filters
 */

import { getSupabase } from './supabase-init.js';
import { formatRelativeDate } from './dashboard-match-history-supabase.js';

const supabase = getSupabase();
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

// Module state
let currentUser = null;
let currentUserData = null;
let activityOffset = 0;
let likesDataCache = {};
let isLoadingMore = false;
let hasMoreActivities = true;
let infiniteScrollObserver = null;
let followingIdsCache = null;
let followedClubsCache = null;
let currentFilter = 'all'; // 'all', 'following', 'my-activities', or club id
const ACTIVITIES_PER_PAGE = 8;

/**
 * Initialize the activity feed module
 */
export function initActivityFeedModule(user, userData) {
    currentUser = user;
    currentUserData = userData;
    activityOffset = 0;
    likesDataCache = {};
    isLoadingMore = false;
    hasMoreActivities = true;
    followingIdsCache = null;
    followedClubsCache = null;
    currentFilter = 'all';

    // Setup global toggle like function
    window.toggleActivityLike = toggleActivityLike;

    // Setup infinite scroll
    setupInfiniteScroll();

    // Setup filter dropdown
    setupFilterDropdown();

    // Load user's club for filter
    loadUserClub();
}

/**
 * Setup filter dropdown
 */
function setupFilterDropdown() {
    const filterBtn = document.getElementById('activity-filter-btn');
    const filterDropdown = document.getElementById('activity-filter-dropdown');

    if (!filterBtn || !filterDropdown) return;

    // Toggle dropdown
    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterDropdown.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        filterDropdown.classList.add('hidden');
    });

    // Filter option clicks
    filterDropdown.addEventListener('click', (e) => {
        const option = e.target.closest('.activity-filter-option');
        if (!option) return;

        e.stopPropagation();
        const filter = option.dataset.filter;
        const label = option.querySelector('span').textContent;

        selectFilter(filter, label);
        filterDropdown.classList.add('hidden');
    });
}

/**
 * Select a filter and reload feed
 */
function selectFilter(filter, label) {
    currentFilter = filter;

    // Update label
    const labelEl = document.getElementById('activity-filter-label');
    if (labelEl) labelEl.textContent = label;

    // Update checkmarks
    document.querySelectorAll('.activity-filter-option .filter-check').forEach(check => {
        const option = check.closest('.activity-filter-option');
        if (option.dataset.filter === filter) {
            check.classList.remove('hidden');
        } else {
            check.classList.add('hidden');
        }
    });

    // Reload feed with new filter
    loadActivityFeed();
}

/**
 * Load user's own club (for filter options)
 * Only shows the club the user is a member of
 */
async function loadUserClub() {
    try {
        // Check if user is in a club
        if (!currentUserData.club_id) {
            followedClubsCache = [];
            renderClubFilters();
            return;
        }

        // Get the user's club details
        const { data: club, error } = await supabase
            .from('clubs')
            .select('id, name')
            .eq('id', currentUserData.club_id)
            .single();

        if (error || !club) {
            followedClubsCache = [];
            renderClubFilters();
            return;
        }

        followedClubsCache = [club];

        // Render club filter options
        renderClubFilters();

    } catch (error) {
        console.error('[ActivityFeed] Error loading user club:', error);
        followedClubsCache = [];
    }
}

/**
 * Render club filter options in dropdown
 */
function renderClubFilters() {
    const container = document.getElementById('activity-filter-clubs');
    if (!container || !followedClubsCache) return;

    if (followedClubsCache.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = followedClubsCache.map(club => `
        <button
            class="activity-filter-option w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between"
            data-filter="club-${club.id}"
        >
            <span>${club.name}</span>
            <i class="fas fa-check text-indigo-600 filter-check hidden"></i>
        </button>
    `).join('');
}

/**
 * Setup infinite scroll using Intersection Observer
 */
function setupInfiniteScroll() {
    if (infiniteScrollObserver) {
        infiniteScrollObserver.disconnect();
    }

    const sentinel = document.getElementById('activity-feed-sentinel');
    if (!sentinel) return;

    infiniteScrollObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoadingMore && hasMoreActivities) {
                    loadMoreActivities();
                }
            });
        },
        {
            root: null,
            rootMargin: '100px',
            threshold: 0.1
        }
    );

    infiniteScrollObserver.observe(sentinel);
}

/**
 * Load activity feed based on current filter
 */
export async function loadActivityFeed() {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    // Reset state for fresh load - prevent race conditions
    activityOffset = 0;
    hasMoreActivities = false;  // Disable infinite scroll during load
    followingIdsCache = null;   // Clear old cache

    // Show loading
    container.innerHTML = `
        <div class="p-6 text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p class="text-sm">Lade Aktivitäten...</p>
        </div>
    `;

    try {
        // Get user IDs based on filter
        const userIds = await getUserIdsForFilter();

        if (userIds.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-sm p-8 text-center">
                    <i class="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">Noch keine Aktivitäten</p>
                    <p class="text-gray-400 text-sm mt-1">${getEmptyMessage()}</p>
                </div>
            `;
            hasMoreActivities = false;
            return;
        }

        // Cache for pagination
        followingIdsCache = userIds;

        // Load first batch
        const activities = await fetchActivities(userIds);

        if (activities.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-sm p-8 text-center">
                    <i class="fas fa-table-tennis-paddle-ball text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">Noch keine Aktivitäten</p>
                    <p class="text-gray-400 text-sm mt-1">${getEmptyMessage()}</p>
                </div>
            `;
            hasMoreActivities = false;
            return;
        }

        // Render initial activities
        container.innerHTML = activities.map(activity => renderActivityCard(activity)).join('');

        // Update offset for next load
        activityOffset += activities.length;
        hasMoreActivities = activities.length >= ACTIVITIES_PER_PAGE;

    } catch (error) {
        console.error('[ActivityFeed] Error loading activities:', error);
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm p-6 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p class="text-sm">Fehler beim Laden der Aktivitäten</p>
            </div>
        `;
    }
}

/**
 * Get user IDs based on current filter
 */
async function getUserIdsForFilter() {
    if (currentFilter === 'my-activities') {
        return [currentUser.id];
    }

    if (currentFilter === 'following') {
        // Only get followed users (not club members)
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');

        return (following || []).map(f => f.addressee_id);
    }

    if (currentFilter === 'all') {
        // Combine: own activities + followed users + club members
        const userIds = new Set([currentUser.id]);

        // Get followed users
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');

        (following || []).forEach(f => userIds.add(f.addressee_id));

        // Get club members if user is in a club
        if (currentUserData.club_id) {
            const { data: clubMembers } = await supabase
                .from('profiles')
                .select('id')
                .eq('club_id', currentUserData.club_id);

            (clubMembers || []).forEach(m => userIds.add(m.id));
        }

        return [...userIds];
    }

    if (currentFilter.startsWith('club-')) {
        // Filter by specific club
        const clubId = currentFilter.replace('club-', '');

        const { data: clubMembers } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', clubId);

        return (clubMembers || []).map(m => m.id);
    }

    return [];
}

/**
 * Get empty message based on filter
 */
function getEmptyMessage() {
    if (currentFilter === 'my-activities') {
        return 'Du hast noch keine Spiele gespielt';
    }
    if (currentFilter === 'following') {
        return 'Folge anderen Spielern um ihre Aktivitäten zu sehen';
    }
    if (currentFilter === 'all') {
        return 'Noch keine Aktivitäten vorhanden';
    }
    return 'Keine Aktivitäten in diesem Verein';
}

/**
 * Fetch activities with current offset
 */
async function fetchActivities(userIds) {
    if (!userIds || userIds.length === 0) {
        return [];
    }

    // Load recent singles matches
    const { data: singlesMatches, error: singlesError } = await supabase
        .from('matches')
        .select('*')
        .or(`player_a_id.in.(${userIds.join(',')}),player_b_id.in.(${userIds.join(',')})`)
        .order('created_at', { ascending: false })
        .range(activityOffset, activityOffset + ACTIVITIES_PER_PAGE * 2 - 1);

    if (singlesError) throw singlesError;

    // Load recent doubles matches
    const { data: doublesMatches, error: doublesError } = await supabase
        .from('doubles_matches')
        .select('*')
        .or(`team_a_player1_id.in.(${userIds.join(',')}),team_a_player2_id.in.(${userIds.join(',')}),team_b_player1_id.in.(${userIds.join(',')}),team_b_player2_id.in.(${userIds.join(',')})`)
        .order('created_at', { ascending: false })
        .range(activityOffset, activityOffset + ACTIVITIES_PER_PAGE - 1);

    if (doublesError) console.warn('Error fetching doubles:', doublesError);

    // Combine and normalize matches
    const allActivities = [
        ...(singlesMatches || []).map(m => ({ ...m, matchType: 'singles' })),
        ...(doublesMatches || []).map(m => ({ ...m, matchType: 'doubles' }))
    ];

    // Sort by date descending
    allActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Take page size
    const activities = allActivities.slice(0, ACTIVITIES_PER_PAGE);

    if (activities.length === 0) {
        return [];
    }

    // Collect all player IDs
    const playerIds = new Set();
    activities.forEach(m => {
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
        .select('id, display_name, first_name, last_name, avatar_url, elo_rating, club_id')
        .in('id', [...playerIds].filter(Boolean));

    const profileMap = {};
    (profiles || []).forEach(p => {
        profileMap[p.id] = p;
    });

    // Load likes data
    await loadLikesForActivities(activities);

    // Get following IDs for context icons
    let followingIds = [];
    if (currentFilter !== 'my-activities') {
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');
        followingIds = (following || []).map(f => f.addressee_id);
    }

    return activities.map(activity => ({
        ...activity,
        profileMap,
        followingIds
    }));
}

/**
 * Load more activities (infinite scroll)
 */
async function loadMoreActivities() {
    if (isLoadingMore || !hasMoreActivities || !followingIdsCache) return;

    isLoadingMore = true;
    const loader = document.getElementById('activity-feed-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        const activities = await fetchActivities(followingIdsCache);

        if (activities.length === 0) {
            hasMoreActivities = false;
            if (loader) loader.classList.add('hidden');
            isLoadingMore = false;
            return;
        }

        const container = document.getElementById('activity-feed');
        if (container) {
            const newHtml = activities.map(activity => renderActivityCard(activity)).join('');
            container.insertAdjacentHTML('beforeend', newHtml);
        }

        activityOffset += activities.length;
        hasMoreActivities = activities.length >= ACTIVITIES_PER_PAGE;

    } catch (error) {
        console.error('[ActivityFeed] Error loading more activities:', error);
    } finally {
        if (loader) loader.classList.add('hidden');
        isLoadingMore = false;
    }
}

/**
 * Render a single activity card
 */
function renderActivityCard(activity) {
    if (activity.matchType === 'doubles') {
        return renderDoublesActivityCard(activity, activity.profileMap, activity.followingIds);
    } else {
        return renderSinglesActivityCard(activity, activity.profileMap, activity.followingIds);
    }
}

/**
 * Load likes data for a batch of activities
 */
async function loadLikesForActivities(activities) {
    if (!activities || activities.length === 0) return;

    try {
        const activityIds = activities.map(a => a.id);
        const matchTypes = activities.map(a => a.matchType);

        const { data, error } = await supabase.rpc('get_activity_likes_batch', {
            p_activity_ids: activityIds,
            p_match_types: matchTypes
        });

        if (error) {
            console.warn('[ActivityFeed] Batch likes function not available:', error.message);
            await loadLikesFallback(activities);
            return;
        }

        (data || []).forEach(like => {
            const key = `${like.match_id}_${like.match_type}`;
            likesDataCache[key] = {
                likeCount: like.like_count || 0,
                isLiked: like.is_liked_by_me || false,
                recentLikers: like.recent_likers || []
            };
        });

    } catch (error) {
        console.error('[ActivityFeed] Error loading likes:', error);
        await loadLikesFallback(activities);
    }
}

/**
 * Fallback method to load likes individually
 */
async function loadLikesFallback(activities) {
    for (const activity of activities) {
        const key = `${activity.id}_${activity.matchType}`;

        try {
            const { count } = await supabase
                .from('activity_likes')
                .select('id', { count: 'exact', head: true })
                .eq('match_id', activity.id)
                .eq('match_type', activity.matchType);

            const { data: userLike } = await supabase
                .from('activity_likes')
                .select('id')
                .eq('match_id', activity.id)
                .eq('match_type', activity.matchType)
                .eq('user_id', currentUser.id)
                .maybeSingle();

            likesDataCache[key] = {
                likeCount: count || 0,
                isLiked: !!userLike,
                recentLikers: []
            };
        } catch (e) {
            likesDataCache[key] = { likeCount: 0, isLiked: false, recentLikers: [] };
        }
    }
}

/**
 * Toggle like on an activity
 */
async function toggleActivityLike(matchId, matchType) {
    const key = `${matchId}_${matchType}`;
    const likeBtn = document.querySelector(`[data-like-btn="${key}"]`);
    const countEl = document.querySelector(`[data-like-count="${key}"]`);

    if (!likeBtn) return;

    const currentData = likesDataCache[key] || { likeCount: 0, isLiked: false };
    const newIsLiked = !currentData.isLiked;
    const newCount = newIsLiked ? currentData.likeCount + 1 : Math.max(0, currentData.likeCount - 1);

    updateLikeUI(likeBtn, countEl, newIsLiked, newCount);
    likesDataCache[key] = { ...currentData, isLiked: newIsLiked, likeCount: newCount };

    try {
        const { data, error } = await supabase.rpc('toggle_activity_like', {
            p_match_id: matchId,
            p_match_type: matchType
        });

        if (error) {
            console.warn('[ActivityFeed] Toggle RPC not available:', error.message);
            await toggleLikeFallback(matchId, matchType, newIsLiked, key);
        } else if (data) {
            likesDataCache[key] = {
                ...currentData,
                isLiked: data.is_liked,
                likeCount: data.like_count
            };
            updateLikeUI(likeBtn, countEl, data.is_liked, data.like_count);
        }

    } catch (error) {
        console.error('[ActivityFeed] Error toggling like:', error);
        updateLikeUI(likeBtn, countEl, currentData.isLiked, currentData.likeCount);
        likesDataCache[key] = currentData;
    }
}

/**
 * Fallback method to toggle like directly
 */
async function toggleLikeFallback(matchId, matchType, shouldLike, key) {
    try {
        if (shouldLike) {
            await supabase
                .from('activity_likes')
                .insert({
                    match_id: matchId,
                    match_type: matchType,
                    user_id: currentUser.id
                });
        } else {
            await supabase
                .from('activity_likes')
                .delete()
                .eq('match_id', matchId)
                .eq('match_type', matchType)
                .eq('user_id', currentUser.id);
        }
    } catch (e) {
        console.error('[ActivityFeed] Fallback toggle failed:', e);
    }
}

/**
 * Update the like button UI
 */
function updateLikeUI(likeBtn, countEl, isLiked, count) {
    if (likeBtn) {
        const icon = likeBtn.querySelector('i');
        if (isLiked) {
            likeBtn.classList.add('text-orange-500');
            likeBtn.classList.remove('text-gray-400', 'hover:text-orange-500');
            if (icon) {
                icon.classList.remove('far');
                icon.classList.add('fas');
            }
        } else {
            likeBtn.classList.remove('text-orange-500');
            likeBtn.classList.add('text-gray-400', 'hover:text-orange-500');
            if (icon) {
                icon.classList.remove('fas');
                icon.classList.add('far');
            }
        }
    }

    if (countEl) {
        countEl.textContent = count > 0 ? count : '';
    }
}

/**
 * Get like data for a specific activity
 */
function getLikeData(matchId, matchType) {
    const key = `${matchId}_${matchType}`;
    return likesDataCache[key] || { likeCount: 0, isLiked: false, recentLikers: [] };
}

/**
 * Render the like button HTML
 */
function renderLikeButton(matchId, matchType) {
    const key = `${matchId}_${matchType}`;
    const likeData = getLikeData(matchId, matchType);
    const isLiked = likeData.isLiked;
    const count = likeData.likeCount;

    const iconClass = isLiked ? 'fas' : 'far';
    const colorClass = isLiked ? 'text-orange-500' : 'text-gray-400 hover:text-orange-500';

    return `
        <button
            data-like-btn="${key}"
            onclick="event.stopPropagation(); toggleActivityLike('${matchId}', '${matchType}')"
            class="flex items-center gap-1 ${colorClass} transition-colors"
            title="Kudos geben"
        >
            <i class="${iconClass} fa-thumbs-up"></i>
            <span data-like-count="${key}" class="text-xs font-medium">${count > 0 ? count : ''}</span>
        </button>
    `;
}

/**
 * Render a singles match activity card
 */
function renderSinglesActivityCard(match, profileMap, followingIds) {
    const playerA = profileMap[match.player_a_id] || {};
    const playerB = profileMap[match.player_b_id] || {};

    const winnerProfile = match.winner_id === match.player_a_id ? playerA : playerB;
    const loserProfile = match.winner_id === match.player_a_id ? playerB : playerA;

    const winnerName = getDisplayName(winnerProfile);
    const loserName = getDisplayName(loserProfile);

    const winnerAvatar = winnerProfile.avatar_url || DEFAULT_AVATAR;
    const loserAvatar = loserProfile.avatar_url || DEFAULT_AVATAR;

    // Calculate set score
    let winnerSets = 0;
    let loserSets = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (match.winner_id === match.player_a_id) {
            if (scoreA > scoreB) winnerSets++;
            else if (scoreB > scoreA) loserSets++;
        } else {
            if (scoreB > scoreA) winnerSets++;
            else if (scoreA > scoreB) loserSets++;
        }
    });

    const setScore = `${winnerSets}:${loserSets}`;

    // Format time
    const matchDate = new Date(match.created_at);
    const dateStr = formatRelativeDate(matchDate);
    const timeStr = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Determine context
    const isFollowingWinner = followingIds.includes(match.winner_id);
    const isFollowingLoser = followingIds.includes(match.winner_id === match.player_a_id ? match.player_b_id : match.player_a_id);
    const inSameClub = winnerProfile.club_id === currentUserData.club_id || loserProfile.club_id === currentUserData.club_id;

    let contextIcon = '';
    if (currentFilter !== 'my-activities') {
        if (isFollowingWinner || isFollowingLoser) {
            contextIcon = '<i class="fas fa-user-check text-indigo-400 text-xs" title="Gefolgt"></i>';
        } else if (inSameClub) {
            contextIcon = '<i class="fas fa-building text-gray-400 text-xs" title="Verein"></i>';
        }
    }

    const loserId = match.winner_id === match.player_a_id ? match.player_b_id : match.player_a_id;

    return `
        <div class="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition">
            <div class="flex items-start gap-3">
                <a href="/profile.html?id=${match.winner_id}" class="flex-shrink-0">
                    <img src="${winnerAvatar}" alt="${winnerName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-green-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <a href="/profile.html?id=${match.winner_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${winnerName}
                        </a>
                        <span class="text-gray-500 text-sm">besiegte</span>
                        <a href="/profile.html?id=${loserId}" class="font-medium text-gray-700 hover:text-indigo-600 transition">
                            ${loserName}
                        </a>
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            ${setScore}
                        </span>
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                        ${contextIcon}
                    </div>

                    <div class="mt-2 text-xs text-gray-500">
                        ${sets.map((set, idx) => {
                            const scoreA = set.playerA ?? set.teamA ?? 0;
                            const scoreB = set.playerB ?? set.teamB ?? 0;
                            const winnerScore = match.winner_id === match.player_a_id ? scoreA : scoreB;
                            const loserScore = match.winner_id === match.player_a_id ? scoreB : scoreA;
                            return `<span class="mr-2">Satz ${idx + 1}: ${winnerScore}-${loserScore}</span>`;
                        }).join('')}
                    </div>

                    <div class="mt-3 flex items-center gap-4">
                        ${renderLikeButton(match.id, 'singles')}
                    </div>
                </div>

                <a href="/profile.html?id=${loserId}" class="flex-shrink-0">
                    <img src="${loserAvatar}" alt="${loserName}"
                         class="w-10 h-10 rounded-full object-cover border-2 border-red-300 opacity-75"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>
            </div>
        </div>
    `;
}

/**
 * Render a doubles match activity card
 */
function renderDoublesActivityCard(match, profileMap, followingIds) {
    const teamAPlayer1 = profileMap[match.team_a_player1_id] || {};
    const teamAPlayer2 = profileMap[match.team_a_player2_id] || {};
    const teamBPlayer1 = profileMap[match.team_b_player1_id] || {};
    const teamBPlayer2 = profileMap[match.team_b_player2_id] || {};

    const isTeamAWinner = match.winner_team === 'A';
    const winnerTeam = isTeamAWinner ? [teamAPlayer1, teamAPlayer2] : [teamBPlayer1, teamBPlayer2];
    const loserTeam = isTeamAWinner ? [teamBPlayer1, teamBPlayer2] : [teamAPlayer1, teamAPlayer2];

    const winnerNames = winnerTeam.map(p => getDisplayName(p)).join(' & ');
    const loserNames = loserTeam.map(p => getDisplayName(p)).join(' & ');

    // Calculate set score
    let winnerSets = 0;
    let loserSets = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        if (isTeamAWinner) {
            if (scoreA > scoreB) winnerSets++;
            else if (scoreB > scoreA) loserSets++;
        } else {
            if (scoreB > scoreA) winnerSets++;
            else if (scoreA > scoreB) loserSets++;
        }
    });

    const setScore = `${winnerSets}:${loserSets}`;

    const matchDate = new Date(match.created_at);
    const dateStr = formatRelativeDate(matchDate);
    const timeStr = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 flex -space-x-2">
                    <img src="${winnerTeam[0]?.avatar_url || DEFAULT_AVATAR}" alt=""
                         class="w-10 h-10 rounded-full object-cover border-2 border-green-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <img src="${winnerTeam[1]?.avatar_url || DEFAULT_AVATAR}" alt=""
                         class="w-10 h-10 rounded-full object-cover border-2 border-green-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-semibold text-gray-900">${winnerNames}</span>
                        <span class="text-gray-500 text-sm">besiegten</span>
                        <span class="font-medium text-gray-700">${loserNames}</span>
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                            <i class="fas fa-users mr-1"></i>${setScore}
                        </span>
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                    </div>

                    <div class="mt-3 flex items-center gap-4">
                        ${renderLikeButton(match.id, 'doubles')}
                    </div>
                </div>

                <div class="flex-shrink-0 flex -space-x-2">
                    <img src="${loserTeam[0]?.avatar_url || DEFAULT_AVATAR}" alt=""
                         class="w-8 h-8 rounded-full object-cover border-2 border-red-300 opacity-75"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <img src="${loserTeam[1]?.avatar_url || DEFAULT_AVATAR}" alt=""
                         class="w-8 h-8 rounded-full object-cover border-2 border-red-300 opacity-75"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </div>
            </div>
        </div>
    `;
}

/**
 * Get display name for a player
 */
function getDisplayName(profile) {
    if (!profile) return 'Unbekannt';
    if (profile.display_name) return profile.display_name;
    if (profile.first_name && profile.last_name) {
        return `${profile.first_name} ${profile.last_name.charAt(0)}.`;
    }
    if (profile.first_name) return profile.first_name;
    return 'Spieler';
}
