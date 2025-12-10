/**
 * Profile View Module - Supabase Version
 * Displays public profile pages for other users
 */

import { getSupabase } from './supabase-init.js';

let currentUser = null;
let profileUser = null;
let profileId = null;

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

        const supabase = getSupabase();

        // Get current user (viewer)
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;

        // Check if viewing own profile
        if (currentUser && currentUser.id === profileId) {
            // Redirect to own dashboard profile tab
            window.location.href = '/dashboard.html#profile';
            return;
        }

        // Load profile data
        await loadProfile();

        // Show main content
        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    } catch (error) {
        console.error('[ProfileView] Initialization error:', error);
        showError('Fehler beim Laden des Profils');
    }
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
                photo_url,
                elo_rating,
                highest_elo,
                points,
                xp,
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

        // Check privacy settings
        const visibility = profile.privacy_settings?.profileVisibility || 'public';
        const canViewDetails = await checkViewPermission(profile, visibility);

        if (canViewDetails) {
            // Show full profile
            document.getElementById('public-profile-content').classList.remove('hidden');
            document.getElementById('private-profile-notice').classList.add('hidden');

            await renderProfileStats(profile);
            await renderClubSection(profile);
            await renderRecentActivity(profile);
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
 */
async function checkViewPermission(profile, visibility) {
    // Public profiles are always visible
    if (visibility === 'public') {
        return true;
    }

    // Must be logged in for other visibility levels
    if (!currentUser) {
        return false;
    }

    // Check if same club for club_only
    if (visibility === 'club_only') {
        const supabase = getSupabase();
        const { data: currentProfile } = await supabase
            .from('profiles')
            .select('club_id')
            .eq('id', currentUser.id)
            .single();

        if (currentProfile?.club_id && currentProfile.club_id === profile.club_id) {
            return true;
        }
    }

    // Check if following (for private profiles)
    const supabase = getSupabase();
    const { data: friendship } = await supabase
        .from('friendships')
        .select('status')
        .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${currentUser.id})`)
        .eq('status', 'accepted')
        .maybeSingle();

    return !!friendship;
}

/**
 * Render profile header (name, avatar, location, bio)
 */
function renderProfileHeader(profile) {
    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unbekannt';
    const photoUrl = profile.photo_url || `https://placehold.co/120x120/e2e8f0/64748b?text=${(profile.first_name?.[0] || '?')}`;

    // Set page title
    document.title = `${fullName} - SC Champions`;

    // Avatar
    document.getElementById('profile-avatar').src = photoUrl;
    document.getElementById('profile-avatar').alt = fullName;

    // Name
    document.getElementById('profile-name').textContent = fullName;

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
 * Render recent activity (last 5 matches)
 */
async function renderRecentActivity(profile) {
    const supabase = getSupabase();

    const { data: matches, error } = await supabase
        .from('matches')
        .select(`
            id,
            winner_id,
            player_a_id,
            player_b_id,
            player_a_sets_won,
            player_b_sets_won,
            played_at,
            player_a:profiles!matches_player_a_id_fkey(first_name, last_name),
            player_b:profiles!matches_player_b_id_fkey(first_name, last_name)
        `)
        .or(`player_a_id.eq.${profileId},player_b_id.eq.${profileId}`)
        .order('played_at', { ascending: false })
        .limit(5);

    if (error || !matches || matches.length === 0) {
        return;
    }

    const activitySection = document.getElementById('activity-section');
    activitySection.classList.remove('hidden');

    const container = document.getElementById('recent-matches');
    container.innerHTML = matches.map(match => {
        const isPlayerA = match.player_a_id === profileId;
        const opponent = isPlayerA ? match.player_b : match.player_a;
        const opponentName = `${opponent?.first_name || ''} ${opponent?.last_name || ''}`.trim() || 'Unbekannt';
        const won = match.winner_id === profileId;
        const score = isPlayerA
            ? `${match.player_a_sets_won}:${match.player_b_sets_won}`
            : `${match.player_b_sets_won}:${match.player_a_sets_won}`;
        const date = new Date(match.played_at).toLocaleDateString('de-DE');

        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center gap-3">
                    <div class="h-10 w-10 rounded-full flex items-center justify-center ${won ? 'bg-green-100' : 'bg-red-100'}">
                        <i class="fas ${won ? 'fa-trophy text-green-600' : 'fa-times text-red-600'}"></i>
                    </div>
                    <div>
                        <p class="font-medium text-gray-800">vs. ${escapeHtml(opponentName)}</p>
                        <p class="text-xs text-gray-500">${date}</p>
                    </div>
                </div>
                <span class="font-bold ${won ? 'text-green-600' : 'text-red-600'}">${score}</span>
            </div>
        `;
    }).join('');
}

/**
 * Load follower statistics
 */
async function loadFollowerStats() {
    const supabase = getSupabase();

    // Count followers (people who sent accepted friend requests to this user)
    const { count: followers } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', profileId)
        .eq('status', 'accepted');

    // Count following (people this user sent accepted friend requests to)
    const { count: following } = await supabase
        .from('friendships')
        .select('id', { count: 'exact', head: true })
        .eq('requester_id', profileId)
        .eq('status', 'accepted');

    document.getElementById('followers-count').textContent = followers || 0;
    document.getElementById('following-count').textContent = following || 0;
}

/**
 * Render follow/unfollow button
 */
async function renderFollowButton() {
    const container = document.getElementById('follow-button-container');

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

    // Check current friendship status
    const { data: friendship } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .or(`and(requester_id.eq.${currentUser.id},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${currentUser.id})`)
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
window.followUser = async function(userId) {
    if (!currentUser) {
        window.location.href = '/app.html';
        return;
    }

    try {
        const supabase = getSupabase();

        // Check if profile is public (no confirmation needed) or private
        const visibility = profileUser?.privacy_settings?.profileVisibility || 'public';

        if (visibility === 'public') {
            // Direct follow - create accepted friendship
            const { error } = await supabase
                .rpc('send_friend_request', {
                    from_user_id: currentUser.id,
                    to_user_id: userId
                });

            if (error) throw error;

            // Auto-accept for public profiles
            await supabase
                .rpc('accept_friend_request', {
                    from_user_id: currentUser.id,
                    to_user_id: userId
                });
        } else {
            // Send follow request
            const { error } = await supabase
                .rpc('send_friend_request', {
                    from_user_id: currentUser.id,
                    to_user_id: userId
                });

            if (error) throw error;
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
                user_id: currentUser.id,
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
 * Cancel a pending follow request
 */
window.cancelFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .rpc('decline_friend_request', {
                from_user_id: currentUser.id,
                to_user_id: userId
            });

        if (error) throw error;

        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error canceling request:', error);
        alert('Fehler beim Abbrechen');
    }
};

/**
 * Accept a follow request
 */
window.acceptFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .rpc('accept_friend_request', {
                from_user_id: userId,
                to_user_id: currentUser.id
            });

        if (error) throw error;

        await loadFollowerStats();
        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error accepting request:', error);
        alert('Fehler beim Annehmen');
    }
};

/**
 * Decline a follow request
 */
window.declineFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .rpc('decline_friend_request', {
                from_user_id: userId,
                to_user_id: currentUser.id
            });

        if (error) throw error;

        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error declining request:', error);
        alert('Fehler beim Ablehnen');
    }
};

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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initProfileView);
