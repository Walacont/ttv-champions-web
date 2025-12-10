/**
 * Activity Feed Module - Supabase Version
 * Shows recent matches from club members and followed users
 */

import { getSupabase } from './supabase-init.js';
import { formatRelativeDate } from './dashboard-match-history-supabase.js';

const supabase = getSupabase();
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

// Module state
let currentUser = null;
let currentUserData = null;
let activityOffset = 0;
const ACTIVITIES_PER_PAGE = 10;

/**
 * Initialize the activity feed module
 */
export function initActivityFeedModule(user, userData) {
    currentUser = user;
    currentUserData = userData;
    activityOffset = 0;
}

/**
 * Load activity feed from club members and followed users
 */
export async function loadActivityFeed() {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    try {
        // Get users in the same club
        let clubMemberIds = [];
        if (currentUserData.club_id) {
            const { data: clubMembers } = await supabase
                .from('profiles')
                .select('id')
                .eq('club_id', currentUserData.club_id)
                .neq('id', currentUser.id);

            clubMemberIds = (clubMembers || []).map(m => m.id);
        }

        // Get users the current user follows
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');

        const followingIds = (following || []).map(f => f.addressee_id);

        // Combine unique user IDs (club + following)
        const relevantUserIds = [...new Set([...clubMemberIds, ...followingIds])];

        if (relevantUserIds.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center">
                    <i class="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">Noch keine Aktivitäten</p>
                    <p class="text-gray-400 text-sm mt-1">Folge anderen Spielern oder tritt einem Verein bei</p>
                </div>
            `;
            return;
        }

        // Load recent singles matches involving these users
        const { data: singlesMatches, error: singlesError } = await supabase
            .from('matches')
            .select('*')
            .or(`player_a_id.in.(${relevantUserIds.join(',')}),player_b_id.in.(${relevantUserIds.join(',')})`)
            .order('created_at', { ascending: false })
            .range(activityOffset, activityOffset + ACTIVITIES_PER_PAGE - 1);

        if (singlesError) throw singlesError;

        // Load recent doubles matches involving these users
        const { data: doublesMatches, error: doublesError } = await supabase
            .from('doubles_matches')
            .select('*')
            .or(`team_a_player1_id.in.(${relevantUserIds.join(',')}),team_a_player2_id.in.(${relevantUserIds.join(',')}),team_b_player1_id.in.(${relevantUserIds.join(',')}),team_b_player2_id.in.(${relevantUserIds.join(',')})`)
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

        // Take top results
        const activities = allActivities.slice(0, ACTIVITIES_PER_PAGE);

        if (activities.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center">
                    <i class="fas fa-table-tennis-paddle-ball text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">Noch keine Aktivitäten</p>
                    <p class="text-gray-400 text-sm mt-1">Hier erscheinen Spiele von deinem Verein und gefolgten Spielern</p>
                </div>
            `;
            return;
        }

        // Collect all player IDs needed for profile lookup
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

        // Render activity feed
        container.innerHTML = activities.map(activity => {
            if (activity.matchType === 'doubles') {
                return renderDoublesActivityCard(activity, profileMap, followingIds);
            } else {
                return renderSinglesActivityCard(activity, profileMap, followingIds);
            }
        }).join('');

        // Show/hide load more button
        const loadMoreBtn = document.getElementById('load-more-activities');
        if (loadMoreBtn) {
            if (activities.length >= ACTIVITIES_PER_PAGE) {
                loadMoreBtn.classList.remove('hidden');
                loadMoreBtn.querySelector('button').onclick = () => loadMoreActivities();
            } else {
                loadMoreBtn.classList.add('hidden');
            }
        }

    } catch (error) {
        console.error('[ActivityFeed] Error loading activities:', error);
        container.innerHTML = `
            <div class="p-6 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p class="text-sm">Fehler beim Laden der Aktivitäten</p>
            </div>
        `;
    }
}

/**
 * Load more activities (pagination)
 */
async function loadMoreActivities() {
    activityOffset += ACTIVITIES_PER_PAGE;

    const container = document.getElementById('activity-feed');
    if (!container) return;

    // Add loading indicator at the end
    const loadMoreBtn = document.getElementById('load-more-activities');
    if (loadMoreBtn) {
        loadMoreBtn.innerHTML = '<p class="text-gray-400 text-sm">Laden...</p>';
    }

    // This is a simplified version - in production you'd append to existing content
    await loadActivityFeed();
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

    // Determine context (club or following)
    const isFollowingWinner = followingIds.includes(match.winner_id);
    const isFollowingLoser = followingIds.includes(match.winner_id === match.player_a_id ? match.player_b_id : match.player_a_id);
    const inSameClub = winnerProfile.club_id === currentUserData.club_id || loserProfile.club_id === currentUserData.club_id;

    let contextIcon = '';
    if (isFollowingWinner || isFollowingLoser) {
        contextIcon = '<i class="fas fa-user-check text-indigo-400 text-xs" title="Gefolgt"></i>';
    } else if (inSameClub) {
        contextIcon = '<i class="fas fa-building text-gray-400 text-xs" title="Verein"></i>';
    }

    return `
        <div class="p-4 hover:bg-gray-50 transition cursor-pointer" onclick="window.location.href='/profile.html?id=${match.winner_id}'">
            <div class="flex items-start gap-3">
                <!-- Winner Avatar -->
                <a href="/profile.html?id=${match.winner_id}" class="flex-shrink-0" onclick="event.stopPropagation();">
                    <img src="${winnerAvatar}" alt="${winnerName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-green-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>

                <!-- Content -->
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <a href="/profile.html?id=${match.winner_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition" onclick="event.stopPropagation();">
                            ${winnerName}
                        </a>
                        <span class="text-gray-500 text-sm">besiegte</span>
                        <a href="/profile.html?id=${match.winner_id === match.player_a_id ? match.player_b_id : match.player_a_id}" class="font-medium text-gray-700 hover:text-indigo-600 transition" onclick="event.stopPropagation();">
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

                    <!-- Set Details -->
                    <div class="mt-2 text-xs text-gray-500">
                        ${sets.map((set, idx) => {
                            const scoreA = set.playerA ?? set.teamA ?? 0;
                            const scoreB = set.playerB ?? set.teamB ?? 0;
                            const winnerScore = match.winner_id === match.player_a_id ? scoreA : scoreB;
                            const loserScore = match.winner_id === match.player_a_id ? scoreB : scoreA;
                            return `<span class="mr-2">Satz ${idx + 1}: ${winnerScore}-${loserScore}</span>`;
                        }).join('')}
                    </div>
                </div>

                <!-- Loser Avatar (smaller) -->
                <a href="/profile.html?id=${match.winner_id === match.player_a_id ? match.player_b_id : match.player_a_id}" class="flex-shrink-0" onclick="event.stopPropagation();">
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

    // Format time
    const matchDate = new Date(match.created_at);
    const dateStr = formatRelativeDate(matchDate);
    const timeStr = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="p-4 hover:bg-gray-50 transition">
            <div class="flex items-start gap-3">
                <!-- Team Avatars -->
                <div class="flex-shrink-0 flex -space-x-2">
                    <img src="${winnerTeam[0]?.avatar_url || DEFAULT_AVATAR}" alt=""
                         class="w-10 h-10 rounded-full object-cover border-2 border-green-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <img src="${winnerTeam[1]?.avatar_url || DEFAULT_AVATAR}" alt=""
                         class="w-10 h-10 rounded-full object-cover border-2 border-green-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </div>

                <!-- Content -->
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
                </div>

                <!-- Loser Team Avatars (smaller) -->
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
