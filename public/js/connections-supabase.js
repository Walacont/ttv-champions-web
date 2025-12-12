/**
 * Connections Page - Supabase Version
 * Shows followers and following lists for a user
 */

import { getSupabase } from './supabase-init.js';

let currentUser = null;
let profileUserId = null;
let profileUserName = '';
let isOwnProfile = false;
let currentTab = 'following'; // 'following' or 'followers'
let friendshipSubscription = null;

const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

/**
 * Initialize the connections page
 */
async function initConnections() {
    console.log('[Connections] Initializing connections page');

    try {
        const supabase = getSupabase();
        if (!supabase) {
            console.error('[Connections] Supabase not initialized');
            showError('Verbindungsfehler');
            return;
        }

        // Get current user
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;

        // Get profile ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        profileUserId = urlParams.get('id');
        const initialTab = urlParams.get('tab');

        // If no ID provided, use current user
        if (!profileUserId && currentUser) {
            profileUserId = currentUser.id;
        }

        if (!profileUserId) {
            showError('Kein Profil angegeben');
            return;
        }

        isOwnProfile = currentUser && currentUser.id === profileUserId;

        // Load profile user's name
        const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', profileUserId)
            .single();

        if (profile) {
            profileUserName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        }

        // Set initial tab from URL if provided
        if (initialTab === 'followers' || initialTab === 'following') {
            currentTab = initialTab;
            updateTabUI();
        }

        // Load connections
        await loadConnections();

        // Setup real-time subscription
        setupRealtimeSubscription(supabase);

        // Show main content
        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';

    } catch (error) {
        console.error('[Connections] Initialization error:', error);
        showError('Fehler beim Laden');
    }
}

/**
 * Switch between tabs
 */
window.switchConnectionsTab = function(tab) {
    if (tab === currentTab) return;

    currentTab = tab;
    updateTabUI();
    loadConnections();
};

/**
 * Update tab UI
 */
function updateTabUI() {
    const followingTab = document.getElementById('tab-following');
    const followersTab = document.getElementById('tab-followers');

    if (currentTab === 'following') {
        followingTab.classList.add('active');
        followersTab.classList.remove('active');
    } else {
        followersTab.classList.add('active');
        followingTab.classList.remove('active');
    }
}

/**
 * Load connections based on current tab
 * Uses RPC functions to respect privacy settings
 */
async function loadConnections() {
    const container = document.getElementById('connections-list');
    const emptyState = document.getElementById('empty-state');
    const sectionHeader = document.getElementById('section-header');
    const emptyMessage = document.getElementById('empty-message');

    // Show loading
    container.innerHTML = `
        <div class="p-8 text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl"></i>
            <p class="mt-2 text-sm">Lade...</p>
        </div>
    `;
    emptyState.classList.add('hidden');

    try {
        const supabase = getSupabase();
        let users = [];
        let accessDenied = false;
        let privacyMessage = '';

        // Use RPC functions to respect privacy settings
        const viewerId = currentUser?.id || null;

        if (currentTab === 'following') {
            // Get users that this profile follows
            const { data, error } = await supabase.rpc('get_user_following', {
                p_profile_id: profileUserId,
                p_viewer_id: viewerId
            });

            if (error) {
                console.error('[Connections] RPC error:', error);
                // Fallback to empty if RPC doesn't exist yet
                if (error.code === '42883') {
                    // Function doesn't exist, show access denied
                    accessDenied = true;
                    privacyMessage = 'Verbindungsliste nicht verfügbar';
                } else {
                    throw error;
                }
            } else if (data?.access_denied) {
                accessDenied = true;
                privacyMessage = data.message;
            } else if (data?.success) {
                users = data.following || [];
            }

            // Update header
            if (isOwnProfile) {
                sectionHeader.textContent = 'Sportler, denen du folgst';
                emptyMessage.textContent = 'Du folgst noch niemandem';
            } else {
                sectionHeader.textContent = `Sportler, denen ${profileUserName || 'dieser Nutzer'} folgt`;
                emptyMessage.textContent = `${profileUserName || 'Dieser Nutzer'} folgt noch niemandem`;
            }

        } else {
            // Get users that follow this profile
            const { data, error } = await supabase.rpc('get_user_followers', {
                p_profile_id: profileUserId,
                p_viewer_id: viewerId
            });

            if (error) {
                console.error('[Connections] RPC error:', error);
                if (error.code === '42883') {
                    accessDenied = true;
                    privacyMessage = 'Verbindungsliste nicht verfügbar';
                } else {
                    throw error;
                }
            } else if (data?.access_denied) {
                accessDenied = true;
                privacyMessage = data.message;
            } else if (data?.success) {
                users = data.followers || [];
            }

            // Update header
            if (isOwnProfile) {
                sectionHeader.textContent = 'Deine Abonnenten';
                emptyMessage.textContent = 'Du hast noch keine Abonnenten';
            } else {
                sectionHeader.textContent = `Abonnenten von ${profileUserName || 'diesem Nutzer'}`;
                emptyMessage.textContent = `${profileUserName || 'Dieser Nutzer'} hat noch keine Abonnenten`;
            }
        }

        // Handle access denied
        if (accessDenied) {
            container.innerHTML = `
                <div class="p-8 text-center">
                    <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                    <p class="text-gray-600 font-medium">${escapeHtml(privacyMessage)}</p>
                    ${!currentUser ? '<p class="text-sm text-gray-400 mt-2">Melde dich an, um mehr zu sehen</p>' : ''}
                </div>
            `;
            return;
        }

        if (users.length === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        // Get current user's follow status for each user
        let followStatuses = {};
        if (currentUser) {
            const userIds = users.map(u => u.id).filter(id => id !== currentUser.id);
            if (userIds.length > 0) {
                const { data: myFollows } = await supabase
                    .from('friendships')
                    .select('addressee_id, status')
                    .eq('requester_id', currentUser.id)
                    .in('addressee_id', userIds);

                (myFollows || []).forEach(f => {
                    followStatuses[f.addressee_id] = f.status;
                });
            }
        }

        // Render users
        renderUsers(users, followStatuses);

    } catch (error) {
        console.error('[Connections] Error loading connections:', error);
        container.innerHTML = `
            <div class="p-8 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-2xl"></i>
                <p class="mt-2 text-sm">Fehler beim Laden</p>
            </div>
        `;
    }
}

/**
 * Render user list
 */
function renderUsers(users, followStatuses) {
    const container = document.getElementById('connections-list');

    const html = users.map(user => {
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unbekannt';
        const avatar = user.avatar_url || DEFAULT_AVATAR;
        // Support both RPC format (club_name) and direct query format (clubs.name)
        const clubName = user.club_name || user.clubs?.name || '';
        const isMe = currentUser && user.id === currentUser.id;
        const followStatus = followStatuses[user.id]; // 'accepted', 'pending', or undefined

        let buttonHtml = '';
        if (!isMe && currentUser) {
            if (followStatus === 'accepted') {
                buttonHtml = `
                    <span class="text-gray-500 font-medium py-2 px-4 rounded-full text-sm border border-gray-300">
                        Gefolgt
                    </span>
                `;
            } else if (followStatus === 'pending') {
                buttonHtml = `
                    <span class="text-indigo-500 font-medium py-2 px-4 rounded-full text-sm border border-indigo-500">
                        Angefragt
                    </span>
                `;
            } else {
                buttonHtml = `
                    <button
                        onclick="followUser('${user.id}')"
                        class="text-indigo-500 hover:text-white hover:bg-indigo-500 font-medium py-2 px-4 rounded-full text-sm transition border border-indigo-500"
                    >
                        Folgen
                    </button>
                `;
            }
        }

        return `
            <div class="flex items-center justify-between px-4 py-3">
                <a href="/profile.html?id=${user.id}" class="flex items-center gap-3 flex-1 min-w-0">
                    <img
                        src="${avatar}"
                        alt="${escapeHtml(fullName)}"
                        class="h-12 w-12 rounded-full object-cover flex-shrink-0"
                        onerror="this.src='${DEFAULT_AVATAR}'"
                    />
                    <div class="min-w-0">
                        <h4 class="font-semibold text-gray-900 truncate">${escapeHtml(fullName)}</h4>
                        ${clubName ? `<p class="text-sm text-gray-500 truncate">${escapeHtml(clubName)}</p>` : ''}
                    </div>
                </a>
                ${buttonHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/**
 * Follow a user
 */
window.followUser = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .rpc('send_friend_request', {
                current_user_id: currentUser.id,
                target_user_id: userId
            });

        if (error) throw error;

        // Reload connections to update UI
        await loadConnections();

    } catch (error) {
        console.error('[Connections] Error following user:', error);
        alert('Fehler beim Folgen');
    }
};

/**
 * Setup real-time subscription for friendship changes
 */
function setupRealtimeSubscription(supabase) {
    if (!currentUser) return;

    friendshipSubscription = supabase
        .channel('connections-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'friendships'
            },
            async (payload) => {
                // Reload if the change involves the profile user or current user
                const involvesCurrent = payload.new?.requester_id === currentUser.id ||
                                       payload.new?.addressee_id === currentUser.id ||
                                       payload.old?.requester_id === currentUser.id ||
                                       payload.old?.addressee_id === currentUser.id;

                const involvesProfile = payload.new?.requester_id === profileUserId ||
                                       payload.new?.addressee_id === profileUserId ||
                                       payload.old?.requester_id === profileUserId ||
                                       payload.old?.addressee_id === profileUserId;

                if (involvesCurrent || involvesProfile) {
                    console.log('[Connections] Friendship change detected, reloading...');
                    await loadConnections();
                }
            }
        )
        .subscribe();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (friendshipSubscription) {
            supabase.removeChannel(friendshipSubscription);
        }
    });
}

/**
 * Show error message
 */
function showError(message) {
    document.getElementById('page-loader').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('connections-list').innerHTML = `
        <div class="p-8 text-center">
            <i class="fas fa-exclamation-circle text-4xl text-red-500 mb-3"></i>
            <p class="text-gray-700">${escapeHtml(message)}</p>
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
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConnections);
} else {
    initConnections();
}
