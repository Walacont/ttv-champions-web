/**
 * Profile View Module - Supabase Version
 * Displays public profile pages for other users
 */

import { getSupabase } from './supabase-init.js';
import { createFollowRequestNotification, createFollowAcceptedNotification } from './notifications-supabase.js';
import { getRankProgress, RANKS } from './ranks.js';

let currentUser = null;
let profileUser = null;
let profileId = null;
let isOwnProfile = false;

const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

/**
 * Initialize the profile view
 */
async function initProfileView() {
    console.log('[ProfileView] Initializing profile view');

    try {
        // Get profile ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        profileId = urlParams.get('id');

        if (!profileId) {
            showError('Kein Profil angegeben');
            return;
        }

        // Ensure Supabase is initialized
        const supabase = getSupabase();
        if (!supabase) {
            console.error('[ProfileView] Supabase not initialized');
            showError('Verbindungsfehler');
            return;
        }

        // Get current user (viewer)
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;

        // Check if viewing own profile
        isOwnProfile = currentUser && currentUser.id === profileId;

        // Load profile data
        await loadProfile();

        // Set up real-time subscription for follow status changes
        if (currentUser && !isOwnProfile) {
            setupFollowStatusSubscription(supabase);
        }

        // Show main content
        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    } catch (error) {
        console.error('[ProfileView] Initialization error:', error);
        showError('Fehler beim Laden des Profils');
    }
}

/**
 * Set up real-time subscription for follow status changes
 * This updates the UI when the profile owner accepts/declines our follow request
 */
function setupFollowStatusSubscription(supabase) {
    // Subscribe to friendships where current user is the requester
    // This handles: request accepted, request declined (deleted)
    const channel = supabase
        .channel('follow-status-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `requester_id=eq.${currentUser.id}`
            },
            async (payload) => {
                console.log('[ProfileView] Friendship change:', payload);

                // Check if this change is relevant to the profile we're viewing
                if (payload.new?.addressee_id === profileId || payload.old?.addressee_id === profileId) {
                    if (payload.eventType === 'UPDATE' && payload.new?.status === 'accepted') {
                        // Our follow request was accepted
                        console.log('[ProfileView] Follow request accepted!');
                        await loadFollowerStats();
                        await renderFollowButton();
                        // Reload profile to check if we now have view permission
                        await loadProfile();
                    } else if (payload.eventType === 'DELETE') {
                        // Our follow request was declined (deleted)
                        console.log('[ProfileView] Follow request declined');
                        await renderFollowButton();
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `addressee_id=eq.${currentUser.id}`
            },
            async (payload) => {
                console.log('[ProfileView] Incoming friendship change:', payload);

                // Check if this change is from the profile we're viewing
                if (payload.new?.requester_id === profileId || payload.old?.requester_id === profileId) {
                    // Profile user sent us a request, or their request status changed
                    await loadFollowerStats();
                    await renderFollowButton();
                }
            }
        )
        .subscribe((status) => {
            console.log('[ProfileView] Subscription status:', status);
        });

    // Clean up subscription when leaving the page
    window.addEventListener('beforeunload', () => {
        supabase.removeChannel(channel);
    });
}

/**
 * Load profile data
 */
async function loadProfile() {
    try {
        const supabase = getSupabase();

        // Fetch profile with club info
        // Note: bio and location fields may not exist yet if migration hasn't run
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                id,
                first_name,
                last_name,
                avatar_url,
                elo_rating,
                highest_elo,
                points,
                xp,
                grundlagen_completed,
                club_id,
                privacy_settings,
                clubs (
                    id,
                    name
                )
            `)
            .eq('id', profileId)
            .single();

        if (error || !profile) {
            console.error('[ProfileView] Error loading profile:', error);
            showError('Profil nicht gefunden');
            return;
        }

        profileUser = profile;
        console.log('[ProfileView] Profile loaded:', profile);

        // Render profile header (always visible)
        renderProfileHeader(profile);

        // Check privacy settings - own profile always has full access
        const visibility = profile.privacy_settings?.profile_visibility || 'global';
        const canViewDetails = isOwnProfile || await checkViewPermission(profile, visibility);

        if (canViewDetails) {
            // Show full profile
            document.getElementById('public-profile-content').classList.remove('hidden');
            document.getElementById('private-profile-notice').classList.add('hidden');

            await renderProfileStats(profile);
            await renderClubSection(profile);
            await renderRecentActivity(profile);

            // Show additional sections for own profile
            if (isOwnProfile) {
                await renderOwnProfileExtras(profile);
            }
        } else {
            // Show private notice
            document.getElementById('public-profile-content').classList.add('hidden');
            document.getElementById('private-profile-notice').classList.remove('hidden');
        }

        // Load follower counts and follow button
        await loadFollowerStats();
        renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error loading profile:', error);
        showError('Fehler beim Laden des Profils');
    }
}

/**
 * Check if current user can view profile details
 * Based on profile_visibility setting: 'global', 'club_only', 'followers_only'
 */
async function checkViewPermission(profile, visibility) {
    // Global profiles are always visible
    if (visibility === 'global') {
        return true;
    }

    // Must be logged in for other visibility levels
    if (!currentUser) {
        return false;
    }

    const supabase = getSupabase();

    // Check if same club for club_only
    if (visibility === 'club_only') {
        const { data: currentProfile } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', currentUser.id)
            .single();

        if (currentProfile?.club_id && currentProfile.club_id === profile.club_id) {
            return true;
        }
        return false;
    }

    // Check if following for followers_only
    if (visibility === 'followers_only') {
        // Current user must follow the profile owner (current user is requester, profile is addressee)
        const { data: friendship } = await supabase
            .from('friendships')
            .select('status')
            .eq('requester_id', currentUser.id)
            .eq('addressee_id', profileId)
            .eq('status', 'accepted')
            .maybeSingle();

        return !!friendship;
    }

    // Default: no access
    return false;
}

/**
 * Render profile header (name, avatar, location, bio)
 */
function renderProfileHeader(profile) {
    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unbekannt';
    const photoUrl = profile.avatar_url || `https://placehold.co/120x120/e2e8f0/64748b?text=${(profile.first_name?.[0] || '?')}`;

    // Set page title
    document.title = isOwnProfile ? 'Mein Profil - SC Champions' : `${fullName} - SC Champions`;

    // Avatar
    document.getElementById('profile-avatar').src = photoUrl;
    document.getElementById('profile-avatar').alt = fullName;

    // Name
    document.getElementById('profile-name').textContent = isOwnProfile ? 'Mein Profil' : fullName;

    // Show user's actual name below if own profile
    const subtitleEl = document.getElementById('profile-subtitle');
    if (subtitleEl) {
        if (isOwnProfile) {
            subtitleEl.textContent = fullName;
            subtitleEl.classList.remove('hidden');
        } else {
            subtitleEl.classList.add('hidden');
        }
    }

    // Location
    const locationEl = document.getElementById('profile-location');
    if (profile.location || profile.clubs?.name) {
        const locationText = profile.location || profile.clubs?.name || '';
        locationEl.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i><span>${escapeHtml(locationText)}</span>`;
    } else {
        locationEl.classList.add('hidden');
    }

    // Bio
    if (profile.bio) {
        document.getElementById('profile-bio').textContent = profile.bio;
        document.getElementById('profile-bio-container').classList.remove('hidden');
    }

    // Show edit button for own profile
    const editBtnContainer = document.getElementById('edit-profile-btn-container');
    if (editBtnContainer) {
        if (isOwnProfile) {
            editBtnContainer.innerHTML = `
                <a href="/settings.html" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-6 rounded-full transition inline-flex items-center gap-2">
                    <i class="fas fa-edit"></i>Profil bearbeiten
                </a>
            `;
            editBtnContainer.classList.remove('hidden');
        } else {
            editBtnContainer.classList.add('hidden');
        }
    }
}

/**
 * Render profile statistics
 */
async function renderProfileStats(profile) {
    // Elo Rating
    document.getElementById('stat-elo').textContent = profile.elo_rating || 800;

    // Points
    document.getElementById('stat-points').textContent = profile.points || 0;

    // Load match stats
    const supabase = getSupabase();
    const { data: matches, error } = await supabase
        .from('matches')
        .select('winner_id')
        .or(`player_a_id.eq.${profileId},player_b_id.eq.${profileId}`);

    if (!error && matches) {
        const totalMatches = matches.length;
        const wins = matches.filter(m => m.winner_id === profileId).length;

        document.getElementById('stat-matches').textContent = totalMatches;
        document.getElementById('stat-wins').textContent = wins;
    }
}

/**
 * Render club section
 */
async function renderClubSection(profile) {
    if (!profile.clubs) {
        return;
    }

    const clubSection = document.getElementById('club-section');
    clubSection.classList.remove('hidden');

    document.getElementById('club-name').textContent = profile.clubs.name;

    // Get member count
    const supabase = getSupabase();
    const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', profile.club_id);

    document.getElementById('club-members').textContent = `${count || 0} Mitglieder`;
}

/**
 * Format relative date
 */
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

/**
 * Render recent activity (matches and posts only) - Like activity feed on dashboard
 */
async function renderRecentActivity(profile) {
    const supabase = getSupabase();
    const ACTIVITY_LIMIT = 10;

    try {
        // Fetch activity types for this user (matches and posts only)
        const [singlesRes, doublesRes, postsRes] = await Promise.all([
            // Singles matches
            supabase
                .from('matches')
                .select('*')
                .or(`player_a_id.eq.${profileId},player_b_id.eq.${profileId}`)
                .order('created_at', { ascending: false })
                .limit(ACTIVITY_LIMIT),

            // Doubles matches
            supabase
                .from('doubles_matches')
                .select('*')
                .or(`team_a_player1_id.eq.${profileId},team_a_player2_id.eq.${profileId},team_b_player1_id.eq.${profileId},team_b_player2_id.eq.${profileId}`)
                .order('created_at', { ascending: false })
                .limit(ACTIVITY_LIMIT),

            // Community posts
            supabase
                .from('community_posts')
                .select('*')
                .eq('user_id', profileId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(ACTIVITY_LIMIT)
        ]);

        // Combine all activities
        const allActivities = [
            ...(singlesRes.data || []).map(m => ({ ...m, activityType: 'singles' })),
            ...(doublesRes.data || []).map(m => ({ ...m, activityType: 'doubles' })),
            ...(postsRes.data || []).map(p => ({ ...p, activityType: 'post' }))
        ];

        // Sort by created_at descending
        allActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Take top activities
        const activities = allActivities.slice(0, ACTIVITY_LIMIT);

        if (activities.length === 0) {
            return;
        }

        // Collect player IDs for profile lookup
        const playerIds = new Set();
        activities.forEach(activity => {
            if (activity.activityType === 'singles') {
                playerIds.add(activity.player_a_id);
                playerIds.add(activity.player_b_id);
            } else if (activity.activityType === 'doubles') {
                playerIds.add(activity.team_a_player1_id);
                playerIds.add(activity.team_a_player2_id);
                playerIds.add(activity.team_b_player1_id);
                playerIds.add(activity.team_b_player2_id);
            } else if (activity.activityType === 'post') {
                playerIds.add(activity.user_id);
            }
        });

        // Fetch profiles
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, display_name, elo_rating')
            .in('id', [...playerIds].filter(Boolean));

        const profileMap = {};
        (profiles || []).forEach(p => {
            profileMap[p.id] = p;
        });

        // Show activity section
        const activitySection = document.getElementById('activity-section');
        activitySection.classList.remove('hidden');

        const container = document.getElementById('recent-matches');
        container.innerHTML = activities.map(activity => {
            return renderProfileActivityCard(activity, profileMap);
        }).join('');

    } catch (error) {
        console.error('[ProfileView] Error loading activities:', error);
    }
}

/**
 * Render a single activity card for profile view
 */
function renderProfileActivityCard(activity, profileMap) {
    switch (activity.activityType) {
        case 'singles':
            return renderProfileSinglesCard(activity, profileMap);
        case 'doubles':
            return renderProfileDoublesCard(activity, profileMap);
        case 'post':
            return renderProfilePostCard(activity, profileMap);
        default:
            return '';
    }
}

/**
 * Render singles match card for profile
 */
function renderProfileSinglesCard(match, profileMap) {
    const playerA = profileMap[match.player_a_id] || {};
    const playerB = profileMap[match.player_b_id] || {};

    const isPlayerA = match.player_a_id === profileId;
    const won = match.winner_id === profileId;

    const profilePlayer = isPlayerA ? playerA : playerB;
    const opponent = isPlayerA ? playerB : playerA;

    const opponentName = getProfileDisplayName(opponent);
    const profilePlayerName = getProfileDisplayName(profilePlayer);

    const profileAvatar = profilePlayer?.avatar_url || DEFAULT_AVATAR;
    const oppAvatar = opponent?.avatar_url || DEFAULT_AVATAR;

    // Calculate set wins
    let playerASetWins = 0;
    let playerBSetWins = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (scoreA > scoreB) playerASetWins++;
        else if (scoreB > scoreA) playerBSetWins++;
    });

    const mySetWins = isPlayerA ? playerASetWins : playerBSetWins;
    const oppSetWins = isPlayerA ? playerBSetWins : playerASetWins;

    const setScoresDisplay = sets.map(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        return isPlayerA ? `${scoreA}-${scoreB}` : `${scoreB}-${scoreA}`;
    }).join(', ');

    const eloChange = won ? (match.winner_elo_change || 0) : (match.loser_elo_change || 0);
    const pointsAwarded = won ? (match.season_points_awarded || 0) : 0;

    const matchDate = new Date(match.created_at || match.played_at);
    const dateDisplay = formatRelativeDate(matchDate);
    const timeDisplay = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    let statsHtml = '';
    if (won) {
        const displayElo = Math.abs(eloChange);
        statsHtml = `<span class="text-green-600 font-medium text-sm">+${displayElo} Elo</span>`;
        if (pointsAwarded > 0) {
            statsHtml += `<span class="text-green-600 font-medium text-sm ml-2">+${pointsAwarded} Pkt</span>`;
        }
    } else {
        const displayElo = Math.abs(eloChange);
        statsHtml = `<span class="text-red-600 font-medium text-sm">-${displayElo} Elo</span>`;
    }

    const handicapBadge = match.handicap_used
        ? '<span class="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">Handicap</span>'
        : '';

    return `
        <div class="bg-white rounded-xl shadow-sm border-l-4 ${won ? 'border-l-green-500' : 'border-l-red-500'} p-4 mb-3 hover:shadow-md transition">
            <div class="flex justify-between items-center mb-3">
                <span class="text-sm text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${won ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${won ? 'Sieg' : 'Niederlage'}
                </span>
            </div>

            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                    <img src="${escapeHtml(profileAvatar)}" alt="${escapeHtml(profilePlayerName)}"
                        class="w-10 h-10 rounded-full object-cover border-2 ${won ? 'border-green-500' : 'border-red-500'}"
                        onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="ml-2">
                        <p class="font-semibold text-sm">${escapeHtml(profilePlayerName.split(' ')[0])}</p>
                    </div>
                </div>

                <div class="text-center px-3">
                    <p class="text-xl font-bold">${mySetWins} : ${oppSetWins}</p>
                    ${setScoresDisplay ? `<p class="text-xs text-gray-500">${setScoresDisplay}</p>` : ''}
                </div>

                <div class="flex items-center">
                    <div class="mr-2 text-right">
                        <p class="font-semibold text-sm">${escapeHtml(opponentName.split(' ')[0])}</p>
                    </div>
                    <a href="/profile.html?id=${opponent.id}">
                        <img src="${escapeHtml(oppAvatar)}" alt="${escapeHtml(opponentName)}"
                            class="w-10 h-10 rounded-full object-cover border-2 ${!won ? 'border-green-500' : 'border-red-500'} hover:opacity-80 transition"
                            onerror="this.src='${DEFAULT_AVATAR}'">
                    </a>
                </div>
            </div>

            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <div class="flex items-center">
                    ${statsHtml}${handicapBadge}
                </div>
            </div>
        </div>
    `;
}

/**
 * Render doubles match card for profile
 */
function renderProfileDoublesCard(match, profileMap) {
    const teamAPlayer1 = profileMap[match.team_a_player1_id] || {};
    const teamAPlayer2 = profileMap[match.team_a_player2_id] || {};
    const teamBPlayer1 = profileMap[match.team_b_player1_id] || {};
    const teamBPlayer2 = profileMap[match.team_b_player2_id] || {};

    const isTeamAWinner = match.winning_team === 'A';
    const isInTeamA = match.team_a_player1_id === profileId || match.team_a_player2_id === profileId;
    const won = (isTeamAWinner && isInTeamA) || (!isTeamAWinner && !isInTeamA);

    const myTeam = isInTeamA ? [teamAPlayer1, teamAPlayer2] : [teamBPlayer1, teamBPlayer2];
    const oppTeam = isInTeamA ? [teamBPlayer1, teamBPlayer2] : [teamAPlayer1, teamAPlayer2];

    const myTeamNames = myTeam.map(p => getProfileDisplayName(p)).join(' & ');
    const oppTeamNames = oppTeam.map(p => getProfileDisplayName(p)).join(' & ');

    // Calculate set wins
    let teamASetWins = 0;
    let teamBSetWins = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        if (scoreA > scoreB) teamASetWins++;
        else if (scoreB > scoreA) teamBSetWins++;
    });

    const mySetWins = isInTeamA ? teamASetWins : teamBSetWins;
    const oppSetWins = isInTeamA ? teamBSetWins : teamASetWins;

    const matchDate = new Date(match.created_at);
    const dateDisplay = formatRelativeDate(matchDate);
    const timeDisplay = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="bg-white rounded-xl shadow-sm border-l-4 ${won ? 'border-l-green-500' : 'border-l-red-500'} p-4 mb-3 hover:shadow-md transition">
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                        <i class="fas fa-users mr-1"></i>Doppel
                    </span>
                    <span class="text-sm text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${won ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${won ? 'Sieg' : 'Niederlage'}
                </span>
            </div>

            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <div class="flex -space-x-2">
                        <img src="${myTeam[0]?.avatar_url || DEFAULT_AVATAR}" class="w-9 h-9 rounded-full border-2 ${won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                        <img src="${myTeam[1]?.avatar_url || DEFAULT_AVATAR}" class="w-9 h-9 rounded-full border-2 ${won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                    </div>
                    <div>
                        <p class="font-semibold text-sm">${escapeHtml(myTeamNames)}</p>
                    </div>
                </div>

                <div class="text-center px-3">
                    <p class="text-xl font-bold">${mySetWins} : ${oppSetWins}</p>
                </div>

                <div class="flex items-center gap-2">
                    <div class="text-right">
                        <p class="font-semibold text-sm">${escapeHtml(oppTeamNames)}</p>
                    </div>
                    <div class="flex -space-x-2">
                        <img src="${oppTeam[0]?.avatar_url || DEFAULT_AVATAR}" class="w-9 h-9 rounded-full border-2 ${!won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                        <img src="${oppTeam[1]?.avatar_url || DEFAULT_AVATAR}" class="w-9 h-9 rounded-full border-2 ${!won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render community post card for profile
 */
function renderProfilePostCard(post, profileMap) {
    const profile = profileMap[post.user_id] || {};
    const displayName = getProfileDisplayName(profile);
    const avatarUrl = profile.avatar_url || DEFAULT_AVATAR;

    const postDate = new Date(post.created_at);
    const dateDisplay = formatRelativeDate(postDate);
    const timeDisplay = postDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const imageUrls = post.image_urls || (post.image_url ? [post.image_url] : []);
    const hasImages = imageUrls.length > 0;

    return `
        <div class="bg-white rounded-xl shadow-sm p-4 mb-3 hover:shadow-md transition border border-gray-100">
            <div class="flex items-start gap-3 mb-3">
                <img src="${avatarUrl}" alt="${displayName}"
                     class="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                     onerror="this.src='${DEFAULT_AVATAR}'">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <span class="font-semibold text-gray-900">${displayName}</span>
                        <span class="text-gray-400">•</span>
                        <span class="text-xs text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                    </div>
                    <div class="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <i class="fas fa-${post.visibility === 'public' ? 'globe' : post.visibility === 'club' ? 'building' : 'user-friends'} text-xs"></i>
                        <span>${post.visibility === 'public' ? 'Öffentlich' : post.visibility === 'club' ? 'Verein' : 'Follower'}</span>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <p class="text-gray-800 whitespace-pre-wrap break-words">${escapeHtml(post.content)}</p>
            </div>

            ${hasImages ? `
            <div class="mb-3 grid ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-2">
                ${imageUrls.map(url => `
                    <img src="${url}" alt="Post Bild"
                         class="w-full h-auto rounded-lg object-cover cursor-pointer hover:opacity-95 transition"
                         onclick="window.open('${url}', '_blank')">
                `).join('')}
            </div>
            ` : ''}

            <div class="flex items-center gap-4 pt-3 border-t border-gray-100 text-sm text-gray-500">
                <span><i class="far fa-thumbs-up mr-1"></i>${post.likes_count || 0}</span>
                <span><i class="far fa-comment mr-1"></i>${post.comments_count || 0}</span>
            </div>
        </div>
    `;
}

/**
 * Get display name for a player profile
 */
function getProfileDisplayName(profile) {
    if (!profile) return 'Unbekannt';
    if (profile.display_name) return profile.display_name;
    if (profile.first_name && profile.last_name) {
        return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile.first_name) return profile.first_name;
    return 'Spieler';
}

/**
 * Load follower statistics
 * Uses RPC function to bypass RLS - follower counts should be visible to everyone
 */
async function loadFollowerStats() {
    const supabase = getSupabase();

    try {
        // Use RPC function to get counts (bypasses RLS so everyone can see counts)
        const { data, error } = await supabase
            .rpc('get_follow_counts', { p_user_id: profileId });

        if (error) {
            console.error('[ProfileView] Error loading follow counts:', error);
            // Fallback to 0 if error
            document.getElementById('followers-count').textContent = '0';
            document.getElementById('following-count').textContent = '0';
        } else {
            document.getElementById('followers-count').textContent = data?.followers || 0;
            document.getElementById('following-count').textContent = data?.following || 0;
        }
    } catch (err) {
        console.error('[ProfileView] Exception loading follow counts:', err);
        document.getElementById('followers-count').textContent = '0';
        document.getElementById('following-count').textContent = '0';
    }

    // Set links to connections page
    const followingLink = document.getElementById('following-link');
    const followersLink = document.getElementById('followers-link');

    if (followingLink) {
        followingLink.href = `/connections.html?id=${profileId}&tab=following`;
    }
    if (followersLink) {
        followersLink.href = `/connections.html?id=${profileId}&tab=followers`;
    }
}

/**
 * Render follow/unfollow button
 */
async function renderFollowButton() {
    const container = document.getElementById('follow-button-container');

    // Don't show follow button for own profile
    if (isOwnProfile) {
        container.innerHTML = '';
        return;
    }

    // Not logged in - show login prompt
    if (!currentUser) {
        container.innerHTML = `
            <a href="/app.html" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-full transition">
                Anmelden zum Folgen
            </a>
        `;
        return;
    }

    const supabase = getSupabase();

    // Check current friendship status - ONE WAY only
    // Only check if current user is following the profile (requester = current user)
    const { data: friendship } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .eq('requester_id', currentUser.id)
        .eq('addressee_id', profileId)
        .maybeSingle();

    if (friendship) {
        if (friendship.status === 'accepted') {
            // Already following
            container.innerHTML = `
                <button
                    onclick="window.unfollowUser('${profileId}')"
                    class="bg-gray-200 hover:bg-red-100 hover:text-red-600 text-gray-700 font-semibold py-2 px-6 rounded-full transition"
                >
                    <i class="fas fa-user-check mr-2"></i>Abonniert
                </button>
            `;
        } else if (friendship.status === 'pending') {
            if (friendship.requester_id === currentUser.id) {
                // Current user sent request
                container.innerHTML = `
                    <button
                        onclick="window.cancelFollowRequest('${profileId}')"
                        class="bg-gray-200 text-gray-600 font-semibold py-2 px-6 rounded-full transition"
                    >
                        <i class="fas fa-clock mr-2"></i>Angefragt
                    </button>
                `;
            } else {
                // Profile user sent request - show accept button
                container.innerHTML = `
                    <div class="flex gap-2">
                        <button
                            onclick="window.acceptFollowRequest('${profileId}')"
                            class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-full transition"
                        >
                            <i class="fas fa-check mr-1"></i>Annehmen
                        </button>
                        <button
                            onclick="window.declineFollowRequest('${profileId}')"
                            class="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-full transition"
                        >
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }
        }
    } else {
        // No relationship - show follow button
        container.innerHTML = `
            <button
                onclick="window.followUser('${profileId}')"
                class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-full transition"
            >
                <i class="fas fa-user-plus mr-2"></i>Folgen
            </button>
        `;
    }
}

/**
 * Follow a user
 */
let followInProgress = false;
window.followUser = async function(userId) {
    if (!currentUser) {
        window.location.href = '/app.html';
        return;
    }

    // Prevent double-clicks
    if (followInProgress) {
        console.log('[ProfileView] Follow already in progress');
        return;
    }

    followInProgress = true;

    // Update button to show loading state
    const container = document.getElementById('follow-button-container');
    if (container) {
        container.innerHTML = `
            <button class="bg-gray-300 text-gray-500 font-semibold py-2 px-6 rounded-full cursor-wait" disabled>
                <i class="fas fa-spinner fa-spin mr-2"></i>Wird verarbeitet...
            </button>
        `;
    }

    try {
        const supabase = getSupabase();

        // Check if profile is public (no confirmation needed) or private
        const visibility = profileUser?.privacy_settings?.profileVisibility || 'public';

        // Get current user's profile for name
        const { data: currentUserProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', currentUser.id)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Jemand';

        // Send follow request
        const { data, error } = await supabase
            .rpc('send_friend_request', {
                current_user_id: currentUser.id,
                target_user_id: userId
            });

        if (error) throw error;

        // For non-public profiles, create a notification
        if (visibility !== 'public') {
            await createFollowRequestNotification(userId, currentUser.id, currentUserName);
        }

        // Refresh button and stats
        await loadFollowerStats();
        await renderFollowButton();

        // Reload profile if now following
        if (visibility === 'public') {
            await loadProfile();
        }

    } catch (error) {
        console.error('[ProfileView] Error following user:', error);
        alert('Fehler beim Folgen');
        // Render button again on error
        await renderFollowButton();
    } finally {
        followInProgress = false;
    }
};

/**
 * Unfollow a user
 */
window.unfollowUser = async function(userId) {
    if (!currentUser) return;

    if (!confirm('Möchtest du dieser Person nicht mehr folgen?')) {
        return;
    }

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .rpc('remove_friend', {
                current_user_id: currentUser.id,
                friend_id: userId
            });

        if (error) throw error;

        // Refresh
        await loadFollowerStats();
        await renderFollowButton();
        await loadProfile();

    } catch (error) {
        console.error('[ProfileView] Error unfollowing user:', error);
        alert('Fehler beim Entfolgen');
    }
};

/**
 * Cancel a pending follow request (that current user sent)
 */
window.cancelFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        // Find the friendship
        const { data: friendship } = await supabase
            .from('friendships')
            .select('id')
            .eq('requester_id', currentUser.id)
            .eq('addressee_id', userId)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('[ProfileView] Friendship not found');
            return;
        }

        const { error } = await supabase
            .rpc('decline_friend_request', {
                current_user_id: currentUser.id,
                friendship_id: friendship.id
            });

        if (error) throw error;

        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error canceling request:', error);
        alert('Fehler beim Abbrechen');
    }
};

/**
 * Accept a follow request (from profile user to current user)
 */
window.acceptFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        // Find the friendship
        const { data: friendship } = await supabase
            .from('friendships')
            .select('id')
            .eq('requester_id', userId)
            .eq('addressee_id', currentUser.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('[ProfileView] Friendship not found');
            return;
        }

        // Get current user's name to include in notification
        const { data: currentUserProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', currentUser.id)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Jemand';

        const { error } = await supabase
            .rpc('accept_friend_request', {
                current_user_id: currentUser.id,
                friendship_id: friendship.id
            });

        if (error) throw error;

        // Notify the requester that their request was accepted
        await createFollowAcceptedNotification(userId, currentUser.id, currentUserName);

        await loadFollowerStats();
        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error accepting request:', error);
        alert('Fehler beim Annehmen');
    }
};

/**
 * Decline a follow request (from profile user to current user)
 */
window.declineFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        // Find the friendship
        const { data: friendship } = await supabase
            .from('friendships')
            .select('id')
            .eq('requester_id', userId)
            .eq('addressee_id', currentUser.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (!friendship) {
            console.error('[ProfileView] Friendship not found');
            return;
        }

        const { error } = await supabase
            .rpc('decline_friend_request', {
                current_user_id: currentUser.id,
                friendship_id: friendship.id
            });

        if (error) throw error;

        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error declining request:', error);
        alert('Fehler beim Ablehnen');
    }
};

/**
 * Render additional sections for own profile (XP, rank, challenges, attendance)
 * Now renders into the Fortschritt tab with dashboard-like widgets
 */
async function renderOwnProfileExtras(profile) {
    const supabase = getSupabase();

    // Show tab switcher for own profile
    const tabSwitcher = document.getElementById('profile-tab-switcher');
    if (tabSwitcher) {
        tabSwitcher.classList.remove('hidden');
    }

    // Setup global tab switch function
    window.switchProfileTab = function(tabName) {
        const aktivitaetContent = document.getElementById('profile-content-aktivitaet');
        const fortschrittContent = document.getElementById('profile-content-fortschritt');
        const aktivitaetBtn = document.getElementById('profile-tab-aktivitaet');
        const fortschrittBtn = document.getElementById('profile-tab-fortschritt');

        if (tabName === 'aktivitaet') {
            aktivitaetContent?.classList.remove('hidden');
            fortschrittContent?.classList.add('hidden');
            aktivitaetBtn?.classList.add('border-indigo-600', 'text-indigo-600');
            aktivitaetBtn?.classList.remove('border-transparent', 'text-gray-500');
            fortschrittBtn?.classList.remove('border-indigo-600', 'text-indigo-600');
            fortschrittBtn?.classList.add('border-transparent', 'text-gray-500');
        } else {
            aktivitaetContent?.classList.add('hidden');
            fortschrittContent?.classList.remove('hidden');
            fortschrittBtn?.classList.add('border-indigo-600', 'text-indigo-600');
            fortschrittBtn?.classList.remove('border-transparent', 'text-gray-500');
            aktivitaetBtn?.classList.remove('border-indigo-600', 'text-indigo-600');
            aktivitaetBtn?.classList.add('border-transparent', 'text-gray-500');
        }
    };

    // Build Fortschritt tab content
    const fortschrittContainer = document.getElementById('profile-content-fortschritt');
    if (!fortschrittContainer) return;

    const xp = profile.xp || 0;
    const elo = profile.elo_rating || 800;
    const points = profile.points || 0;
    const grundlagenCount = profile.grundlagen_completed || 0;

    // Get detailed rank progress
    const progress = getRankProgress(elo, xp, grundlagenCount);
    const { currentRank, nextRank, eloProgress, xpProgress, grundlagenProgress, eloNeeded, xpNeeded, grundlagenNeeded, isMaxRank } = progress;

    // Build rank progress HTML
    let rankProgressHtml = `
        <div class="flex items-center justify-center space-x-3 mb-4">
            <span class="text-5xl">${currentRank.emoji}</span>
            <div>
                <p class="font-bold text-xl" style="color: ${currentRank.color};">${currentRank.name}</p>
                <p class="text-xs text-gray-500">${currentRank.description}</p>
            </div>
        </div>
    `;

    if (!isMaxRank && nextRank) {
        rankProgressHtml += `
            <div class="mt-4 text-sm">
                <p class="text-gray-600 font-medium mb-3">Fortschritt zu ${nextRank.emoji} ${nextRank.name}:</p>

                <!-- ELO Progress -->
                ${nextRank.minElo > 0 ? `
                <div class="mb-3">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Elo: ${elo}/${nextRank.minElo}</span>
                        <span>${eloProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-blue-600 h-2.5 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                    </div>
                    ${eloNeeded > 0
                        ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo benötigt</p>`
                        : `<p class="text-xs text-green-600 mt-1">✓ Elo-Anforderung erfüllt</p>`}
                </div>
                ` : ''}

                <!-- XP Progress -->
                <div class="mb-3">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>XP: ${xp}/${nextRank.minXP}</span>
                        <span>${xpProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-purple-600 h-2.5 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                    </div>
                    ${xpNeeded > 0
                        ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP benötigt</p>`
                        : `<p class="text-xs text-green-600 mt-1">✓ XP-Anforderung erfüllt</p>`}
                </div>

                <!-- Grundlagen Progress -->
                ${nextRank.requiresGrundlagen ? `
                <div>
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Grundlagen-Übungen: ${grundlagenCount}/${nextRank.grundlagenRequired || 5}</span>
                        <span>${grundlagenProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-green-600 h-2.5 rounded-full transition-all" style="width: ${grundlagenProgress}%"></div>
                    </div>
                    ${grundlagenNeeded > 0
                        ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''} bis du Wettkämpfe spielen kannst</p>`
                        : `<p class="text-xs text-green-600 mt-1">✓ Grundlagen abgeschlossen - du kannst Wettkämpfe spielen!</p>`}
                </div>
                ` : ''}
            </div>
        `;
    } else {
        rankProgressHtml += `<p class="text-sm text-green-600 font-medium mt-2 text-center">🏆 Höchster Rang erreicht!</p>`;
    }

    let html = `
        <div class="p-4 space-y-4">
            <!-- Info Banner explaining the 3 systems -->
            <div class="bg-gradient-to-r from-indigo-50 to-purple-50 border-l-4 border-indigo-500 p-4 rounded-lg">
                <div class="flex items-start">
                    <div class="flex-shrink-0">
                        <i class="fas fa-info-circle text-indigo-500"></i>
                    </div>
                    <div class="ml-3 flex-1">
                        <p class="text-sm font-medium text-indigo-800">Drei Systeme für deinen Fortschritt</p>
                        <p class="text-xs text-indigo-700 mt-1">
                            <strong class="text-purple-700">XP</strong> = Permanenter Fleiß für Rang-Aufstieg •
                            <strong class="text-blue-700">Elo</strong> = Wettkampf-Spielstärke •
                            <strong class="text-yellow-700">Saisonpunkte</strong> = Temporärer 6-Wochen-Wettbewerb
                        </p>
                    </div>
                </div>
            </div>

            <!-- Statistics -->
            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-500 mb-3 text-center">Deine Statistiken</h2>
                <div class="grid grid-cols-3 gap-3">
                    <div class="text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <p class="text-xs font-semibold text-purple-800 mb-1">💪 XP</p>
                        <p class="text-2xl font-bold text-purple-600">${xp.toLocaleString()}</p>
                    </div>
                    <div class="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p class="text-xs font-semibold text-blue-800 mb-1">⚡ Elo</p>
                        <p class="text-2xl font-bold text-blue-600">${elo}</p>
                    </div>
                    <div class="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p class="text-xs font-semibold text-yellow-800 mb-1">🏆 Punkte</p>
                        <p class="text-2xl font-bold text-yellow-600">${points}</p>
                    </div>
                </div>
            </div>

            <!-- Rank with Progress -->
            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">Dein Rang</h2>
                <div id="profile-rank-info">
                    ${rankProgressHtml}
                </div>
            </div>

            <!-- Rivals Section -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <!-- Skill Rival -->
                <div class="bg-white rounded-xl shadow-sm p-4">
                    <h2 class="text-base font-semibold text-gray-700 mb-3">⚡ Skill-Rivale</h2>
                    <div id="profile-skill-rival" class="text-gray-500 text-sm">
                        <p>Lade Rivalen...</p>
                    </div>
                </div>
                <!-- Effort Rival -->
                <div class="bg-white rounded-xl shadow-sm p-4">
                    <h2 class="text-base font-semibold text-gray-700 mb-3">💪 Fleiß-Rivale</h2>
                    <div id="profile-effort-rival" class="text-gray-500 text-sm">
                        <p>Lade Rivalen...</p>
                    </div>
                </div>
            </div>

            <!-- Points History -->
            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">Punkte-Historie</h2>
                <ul id="profile-points-history" class="space-y-2 max-h-48 overflow-y-auto text-sm">
                    <li class="text-gray-400">Lade Historie...</li>
                </ul>
            </div>

            <!-- Active Challenges -->
            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">Aktive Challenges</h2>
                <div id="profile-challenges" class="space-y-3">
                    <p class="text-gray-400 text-sm">Lade Challenges...</p>
                </div>
            </div>

            <!-- Attendance Calendar -->
            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">
                    <i class="fas fa-calendar-check text-green-600 mr-2"></i>Anwesenheit
                </h2>
                <div id="profile-attendance-calendar" class="text-center text-gray-500">
                    <p class="py-4 text-sm">Lade Anwesenheit...</p>
                </div>
            </div>
        </div>
    `;

    fortschrittContainer.innerHTML = html;

    // Load additional data for Fortschritt tab
    await Promise.all([
        loadProfileRivals(profile),
        loadProfilePointsHistory(),
        loadProfileChallenges(),
        loadProfileAttendance()
    ]);

    // Hide old extras container (we now use the tab)
    const oldExtras = document.getElementById('own-profile-extras');
    if (oldExtras) {
        oldExtras.classList.add('hidden');
    }
}

/**
 * Load rival data for profile Fortschritt tab
 */
async function loadProfileRivals(profile) {
    const supabase = getSupabase();

    try {
        // Get players from same club for rival comparison
        const { data: clubPlayers } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, elo_rating, xp, avatar_url')
            .eq('club_id', profile.club_id)
            .neq('id', profileId)
            .limit(50);

        if (!clubPlayers || clubPlayers.length === 0) {
            document.getElementById('profile-skill-rival').innerHTML = '<p class="text-gray-400">Keine Rivalen gefunden</p>';
            document.getElementById('profile-effort-rival').innerHTML = '<p class="text-gray-400">Keine Rivalen gefunden</p>';
            return;
        }

        // Find skill rival (closest Elo above)
        const myElo = profile.elo_rating || 800;
        const playersAboveElo = clubPlayers.filter(p => (p.elo_rating || 800) > myElo);
        playersAboveElo.sort((a, b) => (a.elo_rating || 800) - (b.elo_rating || 800));
        const skillRival = playersAboveElo[0];

        // Find effort rival (closest XP above)
        const myXp = profile.xp || 0;
        const playersAboveXp = clubPlayers.filter(p => (p.xp || 0) > myXp);
        playersAboveXp.sort((a, b) => (a.xp || 0) - (b.xp || 0));
        const effortRival = playersAboveXp[0];

        // Render skill rival
        const skillContainer = document.getElementById('profile-skill-rival');
        if (skillRival) {
            const rivalName = `${skillRival.first_name || ''} ${skillRival.last_name || ''}`.trim();
            const rivalElo = skillRival.elo_rating || 800;
            const eloDiff = rivalElo - myElo;
            skillContainer.innerHTML = `
                <div class="flex items-center gap-3">
                    <img src="${skillRival.avatar_url || DEFAULT_AVATAR}" alt="${escapeHtml(rivalName)}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-blue-200" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="flex-1">
                        <p class="font-medium text-gray-800">${escapeHtml(rivalName)}</p>
                        <p class="text-xs text-gray-500">${rivalElo} Elo</p>
                    </div>
                </div>
                <div class="mt-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-blue-700 font-medium">Abstand:</span>
                        <span class="text-lg font-bold text-blue-600">${eloDiff} Elo</span>
                    </div>
                    <p class="text-xs text-blue-600 mt-1">Gewinne ~${Math.ceil(eloDiff / 15)} Matches um aufzuholen</p>
                </div>
            `;
        } else {
            skillContainer.innerHTML = '<p class="text-green-600 font-medium text-center py-2">Du bist an der Spitze! 🏆</p>';
        }

        // Render effort rival
        const effortContainer = document.getElementById('profile-effort-rival');
        if (effortRival) {
            const rivalName = `${effortRival.first_name || ''} ${effortRival.last_name || ''}`.trim();
            const rivalXp = effortRival.xp || 0;
            const xpDiff = rivalXp - myXp;
            effortContainer.innerHTML = `
                <div class="flex items-center gap-3">
                    <img src="${effortRival.avatar_url || DEFAULT_AVATAR}" alt="${escapeHtml(rivalName)}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-purple-200" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="flex-1">
                        <p class="font-medium text-gray-800">${escapeHtml(rivalName)}</p>
                        <p class="text-xs text-gray-500">${rivalXp.toLocaleString()} XP</p>
                    </div>
                </div>
                <div class="mt-3 p-2 bg-purple-50 rounded-lg border border-purple-200">
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-purple-700 font-medium">Abstand:</span>
                        <span class="text-lg font-bold text-purple-600">${xpDiff} XP</span>
                    </div>
                    <p class="text-xs text-purple-600 mt-1">Sammle ${xpDiff} XP durch Training & Matches</p>
                </div>
            `;
        } else {
            effortContainer.innerHTML = '<p class="text-green-600 font-medium text-center py-2">Du bist an der Spitze! 🏆</p>';
        }
    } catch (error) {
        console.error('[ProfileView] Error loading rivals:', error);
    }
}

/**
 * Load points history for profile Fortschritt tab
 */
async function loadProfilePointsHistory() {
    const supabase = getSupabase();
    const container = document.getElementById('profile-points-history');
    if (!container) return;

    try {
        const { data: history } = await supabase
            .from('points_history')
            .select('*')
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (!history || history.length === 0) {
            container.innerHTML = '<li class="text-gray-400">Keine Einträge vorhanden</li>';
            return;
        }

        container.innerHTML = history.map(entry => {
            const date = new Date(entry.created_at || entry.timestamp).toLocaleDateString('de-DE');
            const reason = entry.reason || entry.description || 'Punkte';

            // Get point values
            const points = entry.points || 0;
            const xp = entry.xp !== undefined ? entry.xp : points;
            const elo = entry.elo_change || 0;

            // Helper function for color classes
            const getColorClass = (value) => {
                if (value > 0) return 'text-green-600';
                if (value < 0) return 'text-red-600';
                return 'text-gray-500';
            };

            // Helper function for sign
            const getSign = (value) => {
                if (value > 0) return '+';
                if (value < 0) return '';
                return '±';
            };

            return `
                <li class="flex justify-between items-center py-3 border-b border-gray-100">
                    <div class="flex-1 min-w-0">
                        <span class="text-gray-700 text-sm">${escapeHtml(reason)}</span>
                        <span class="text-xs text-gray-400 ml-2">${date}</span>
                    </div>
                    <div class="flex gap-2 text-xs flex-shrink-0">
                        <div class="text-center min-w-[40px]">
                            <div class="text-gray-400 text-[10px] leading-tight">Elo</div>
                            <div class="${getColorClass(elo)} font-semibold">${getSign(elo)}${elo}</div>
                        </div>
                        <div class="text-center min-w-[40px]">
                            <div class="text-gray-400 text-[10px] leading-tight">XP</div>
                            <div class="${getColorClass(xp)} font-semibold">${getSign(xp)}${xp}</div>
                        </div>
                        <div class="text-center min-w-[40px]">
                            <div class="text-gray-400 text-[10px] leading-tight">Saison</div>
                            <div class="${getColorClass(points)} font-semibold">${getSign(points)}${points}</div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');
    } catch (error) {
        console.error('[ProfileView] Error loading points history:', error);
        container.innerHTML = '<li class="text-red-400">Fehler beim Laden</li>';
    }
}

/**
 * Load challenges for profile Fortschritt tab
 */
async function loadProfileChallenges() {
    const supabase = getSupabase();
    const container = document.getElementById('profile-challenges');
    if (!container) return;

    try {
        // Load completed challenges for this user
        const { data: completedChallenges, error } = await supabase
            .from('completed_challenges')
            .select(`
                id,
                completed_at,
                challenges (
                    id,
                    name,
                    description,
                    xp_reward
                )
            `)
            .eq('user_id', profileId)
            .order('completed_at', { ascending: false })
            .limit(5);

        if (error) {
            console.warn('[ProfileView] Error loading challenges:', error);
            container.innerHTML = '<p class="text-gray-400 text-sm">Challenges nicht verfügbar</p>';
            return;
        }

        if (!completedChallenges || completedChallenges.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-sm">Noch keine Challenges abgeschlossen</p>';
            return;
        }

        container.innerHTML = completedChallenges.map(cc => {
            const challenge = cc.challenges;
            if (!challenge) return '';

            const completedDate = cc.completed_at ? new Date(cc.completed_at).toLocaleDateString('de-DE', {
                day: 'numeric',
                month: 'short'
            }) : '';

            return `
                <div class="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-check-circle text-green-600"></i>
                            <span class="font-medium text-gray-800 text-sm">${escapeHtml(challenge.name)}</span>
                        </div>
                        <span class="text-xs text-green-600 font-semibold">+${challenge.xp_reward} XP</span>
                    </div>
                    ${completedDate ? `<p class="text-xs text-gray-500 mt-1 ml-6">Abgeschlossen am ${completedDate}</p>` : ''}
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('[ProfileView] Error loading challenges:', error);
        container.innerHTML = '<p class="text-red-400 text-sm">Fehler beim Laden</p>';
    }
}

/**
 * Load attendance calendar for own profile (now based on event_attendance)
 */
async function loadProfileAttendance() {
    const container = document.getElementById('profile-attendance-calendar');
    if (!container) return;

    const supabase = getSupabase();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Get first and last day of current month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDateStr = firstDay.toISOString().split('T')[0];
    const endDateStr = lastDay.toISOString().split('T')[0];

    // Query event_attendance where this user was present
    // event_attendance has present_user_ids array and links to events via event_id
    const { data: eventAttendance, error } = await supabase
        .from('event_attendance')
        .select(`
            event_id,
            present_user_ids,
            events (
                start_date,
                title
            )
        `)
        .contains('present_user_ids', [profileId]);

    if (error) {
        console.warn('[ProfileView] Error loading event attendance:', error);
    }

    // Filter to events in current month and collect dates
    const attendanceDates = new Set();
    if (eventAttendance) {
        eventAttendance.forEach(ea => {
            if (ea.events?.start_date) {
                const eventDate = ea.events.start_date;
                if (eventDate >= startDateStr && eventDate <= endDateStr) {
                    attendanceDates.add(eventDate);
                }
            }
        });
    }

    // Build simple calendar grid
    const monthName = now.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0

    let calendarHtml = `
        <h4 class="font-semibold text-gray-700 mb-3">${monthName}</h4>
        <div class="grid grid-cols-7 gap-1 text-xs">
            <div class="text-gray-400 font-medium py-1">Mo</div>
            <div class="text-gray-400 font-medium py-1">Di</div>
            <div class="text-gray-400 font-medium py-1">Mi</div>
            <div class="text-gray-400 font-medium py-1">Do</div>
            <div class="text-gray-400 font-medium py-1">Fr</div>
            <div class="text-gray-400 font-medium py-1">Sa</div>
            <div class="text-gray-400 font-medium py-1">So</div>
    `;

    // Empty cells for days before first of month
    for (let i = 0; i < startDayOfWeek; i++) {
        calendarHtml += '<div></div>';
    }

    // Days of month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isPresent = attendanceDates.has(dateStr);
        const isToday = day === now.getDate();

        const dayClass = isPresent
            ? 'bg-green-500 text-white'
            : isToday
                ? 'bg-indigo-100 text-indigo-700 font-bold'
                : 'text-gray-600';

        calendarHtml += `
            <div class="aspect-square flex items-center justify-center rounded ${dayClass}">
                ${day}
            </div>
        `;
    }

    calendarHtml += '</div>';

    // Stats
    const presentDays = attendanceDates.size;
    calendarHtml += `
        <div class="mt-4 text-center">
            <span class="text-green-600 font-semibold">${presentDays}</span>
            <span class="text-gray-500 text-sm">Veranstaltungen diesen Monat</span>
        </div>
    `;

    container.innerHTML = calendarHtml;
}

/**
 * Calculate rank from XP (simplified version)
 */
function calculateRankFromXP(xp) {
    const RANKS = [
        { name: 'Rekrut', minXP: 0, icon: '🔰' },
        { name: 'Lehrling', minXP: 100, icon: '📘' },
        { name: 'Geselle', minXP: 300, icon: '⚒️' },
        { name: 'Adept', minXP: 600, icon: '🎯' },
        { name: 'Experte', minXP: 1000, icon: '⭐' },
        { name: 'Meister', minXP: 1500, icon: '🏆' },
        { name: 'Champion', minXP: 2500, icon: '👑' },
        { name: 'Legende', minXP: 4000, icon: '🌟' }
    ];

    let rank = RANKS[0];
    for (const r of RANKS) {
        if (xp >= r.minXP) {
            rank = r;
        }
    }
    return rank;
}

/**
 * Show error message
 */
function showError(message) {
    document.getElementById('page-loader').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('main-content').innerHTML = `
        <div class="container mx-auto px-4 py-8">
            <div class="bg-white rounded-2xl shadow-lg p-8 text-center">
                <i class="fas fa-exclamation-circle text-5xl text-red-500 mb-4"></i>
                <h1 class="text-2xl font-bold text-gray-800 mb-2">${escapeHtml(message)}</h1>
                <p class="text-gray-500 mb-6">Das angeforderte Profil konnte nicht geladen werden.</p>
                <a href="/dashboard.html" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-full transition">
                    Zurück zum Dashboard
                </a>
            </div>
        </div>
    `;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready - handle both cases where DOM might already be loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfileView);
} else {
    // DOM is already loaded, initialize immediately
    initProfileView();
}
