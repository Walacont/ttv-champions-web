/**
 * Community Module - Supabase Version
 * Handles community tabs, club search, and suggested users
 */

import { getSupabase } from './supabase-init.js';
import { createFollowRequestNotification } from './notifications-supabase.js';

let currentUser = null;
let currentUserData = null;
let clubSearchTimeout = null;
let pendingRequestIds = new Set(); // Track pending outgoing follow requests
let friendshipSubscription = null; // Real-time subscription

/**
 * Initialize the community module
 */
export async function initCommunity() {
    console.log('[Community] Initializing community module');

    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.error('[Community] No user found');
        return;
    }

    currentUser = session.user;

    // Load user profile data
    const { data: profile } = await supabase
        .from('profiles')
        .select('*, clubs(id, name)')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        currentUserData = profile;
    }

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    await loadPendingFollowRequests();
    await loadSuggestedUsers();
    await loadCurrentClubStatus();

    // Setup real-time subscription for friendship changes
    setupFriendshipSubscription();

    // Expose tab switch function globally
    window.switchCommunityTab = switchCommunityTab;

    // Expose withdraw function globally
    window.withdrawFollowRequest = withdrawFollowRequest;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Club search input
    const clubSearchInput = document.getElementById('club-search-input');
    if (clubSearchInput) {
        clubSearchInput.addEventListener('input', handleClubSearch);
    }

    // Follow all button
    const followAllBtn = document.getElementById('follow-all-btn');
    if (followAllBtn) {
        followAllBtn.addEventListener('click', followAllSuggested);
    }

    // Open Community button (search icon in header)
    const openCommunityBtn = document.getElementById('open-community-btn');
    if (openCommunityBtn) {
        openCommunityBtn.addEventListener('click', () => {
            // Show the community fullscreen overlay
            const communityFullscreen = document.getElementById('community-fullscreen');
            if (communityFullscreen) {
                communityFullscreen.classList.remove('hidden');
                // Focus search input
                const searchInput = document.getElementById('player-search-input');
                if (searchInput) {
                    setTimeout(() => searchInput.focus(), 100);
                }
            }
        });
    }

    // Close Community button (back arrow in community fullscreen)
    const closeCommunityBtn = document.getElementById('close-community-btn');
    if (closeCommunityBtn) {
        closeCommunityBtn.addEventListener('click', () => {
            const communityFullscreen = document.getElementById('community-fullscreen');
            if (communityFullscreen) {
                communityFullscreen.classList.add('hidden');
            }
        });
    }
}

/**
 * Switch between community sub-tabs
 */
function switchCommunityTab(tab) {
    const personsTab = document.getElementById('community-tab-persons');
    const clubsTab = document.getElementById('community-tab-clubs');
    const personsContent = document.getElementById('community-content-persons');
    const clubsContent = document.getElementById('community-content-clubs');

    if (tab === 'persons') {
        // Activate persons tab
        personsTab.classList.add('border-indigo-600', 'text-indigo-600');
        personsTab.classList.remove('border-transparent', 'text-gray-500');
        clubsTab.classList.remove('border-indigo-600', 'text-indigo-600');
        clubsTab.classList.add('border-transparent', 'text-gray-500');

        personsContent.classList.remove('hidden');
        clubsContent.classList.add('hidden');
    } else {
        // Activate clubs tab
        clubsTab.classList.add('border-indigo-600', 'text-indigo-600');
        clubsTab.classList.remove('border-transparent', 'text-gray-500');
        personsTab.classList.remove('border-indigo-600', 'text-indigo-600');
        personsTab.classList.add('border-transparent', 'text-gray-500');

        clubsContent.classList.remove('hidden');
        personsContent.classList.add('hidden');

        // Load club data when switching to clubs tab
        loadCurrentClubStatus();
    }
}

/**
 * Load pending outgoing follow requests
 */
async function loadPendingFollowRequests() {
    const container = document.getElementById('pending-follow-requests-list');
    const section = document.getElementById('pending-follow-requests-section');
    const countEl = document.getElementById('pending-requests-count');

    try {
        const supabase = getSupabase();

        // Get pending requests where current user is the requester
        const { data: pendingRequests, error } = await supabase
            .from('friendships')
            .select(`
                id,
                addressee_id,
                created_at,
                addressee:profiles!friendships_addressee_id_fkey(id, first_name, last_name, avatar_url, clubs(name))
            `)
            .eq('requester_id', currentUser.id)
            .eq('status', 'pending');

        if (error) {
            console.error('[Community] Error loading pending requests:', error);
            return;
        }

        // Update pending request IDs set
        pendingRequestIds.clear();
        if (pendingRequests) {
            pendingRequests.forEach(r => pendingRequestIds.add(r.addressee_id));
        }

        if (!container || !section) return;

        if (!pendingRequests || pendingRequests.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        if (countEl) countEl.textContent = `(${pendingRequests.length})`;

        const html = pendingRequests.map(request => {
            const user = request.addressee;
            const photoUrl = user?.avatar_url || `https://placehold.co/64x64/e2e8f0/64748b?text=${user?.first_name?.[0] || '?'}`;
            const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Unbekannt';
            const clubName = user?.clubs?.name || 'Kein Verein';

            return `
                <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                    <a href="/profile.html?id=${user?.id}" class="flex items-center gap-3 flex-1 hover:opacity-80 transition">
                        <img
                            src="${photoUrl}"
                            alt="${escapeHtml(fullName)}"
                            class="h-12 w-12 rounded-full object-cover border-2 border-yellow-200"
                        />
                        <div class="flex-1 min-w-0">
                            <h4 class="font-semibold text-gray-800 truncate">${escapeHtml(fullName)}</h4>
                            <p class="text-sm text-gray-500 truncate">${escapeHtml(clubName)}</p>
                        </div>
                    </a>
                    <button
                        onclick="window.withdrawFollowRequest('${request.id}', '${user?.id}')"
                        class="text-red-600 hover:text-white hover:bg-red-600 font-semibold py-2 px-4 rounded-full text-sm transition border border-red-600"
                    >
                        Zurückziehen
                    </button>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

    } catch (error) {
        console.error('[Community] Error loading pending requests:', error);
    }
}

/**
 * Load suggested users (club members not yet followed)
 */
async function loadSuggestedUsers() {
    const container = document.getElementById('suggested-users-list');
    if (!container) return;

    try {
        const supabase = getSupabase();

        // Get all friendships (both accepted and pending) to filter out
        const { data: allFriendships } = await supabase
            .from('friendships')
            .select('requester_id, addressee_id, status')
            .or(`requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id}`);

        const excludeIds = new Set();
        if (allFriendships) {
            allFriendships.forEach(f => {
                if (f.requester_id === currentUser.id) {
                    excludeIds.add(f.addressee_id);
                } else {
                    excludeIds.add(f.requester_id);
                }
            });
        }

        let potentialUsers = [];

        // If user has a club, first get club members
        if (currentUserData?.club_id) {
            const { data: clubMembers } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url, elo_rating, club_id, clubs(name)')
                .eq('club_id', currentUserData.club_id)
                .neq('id', currentUser.id)
                .limit(10);

            if (clubMembers) {
                potentialUsers = clubMembers.filter(u => !excludeIds.has(u.id));
            }
        }

        // If we don't have enough suggestions, get users with similar ELO
        if (potentialUsers.length < 5) {
            const currentElo = currentUserData?.elo_rating || 1000;
            const { data: similarUsers } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url, elo_rating, club_id, clubs(name)')
                .neq('id', currentUser.id)
                .gte('elo_rating', currentElo - 200)
                .lte('elo_rating', currentElo + 200)
                .limit(10);

            if (similarUsers) {
                const existingIds = new Set(potentialUsers.map(u => u.id));
                const newUsers = similarUsers.filter(u => !excludeIds.has(u.id) && !existingIds.has(u.id));
                potentialUsers = [...potentialUsers, ...newUsers].slice(0, 10);
            }
        }

        if (potentialUsers.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine Vorschläge verfügbar</p>';
            document.getElementById('follow-all-btn')?.classList.add('hidden');
            return;
        }

        // Store for follow all (only users not already pending)
        window._suggestedUserIds = potentialUsers.filter(u => !pendingRequestIds.has(u.id)).map(u => u.id);

        if (window._suggestedUserIds.length === 0) {
            document.getElementById('follow-all-btn')?.classList.add('hidden');
        } else {
            document.getElementById('follow-all-btn')?.classList.remove('hidden');
        }

        renderSuggestedUsers(potentialUsers);

    } catch (error) {
        console.error('[Community] Error loading suggested users:', error);
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

/**
 * Render suggested users list
 */
function renderSuggestedUsers(users) {
    const container = document.getElementById('suggested-users-list');
    if (!container) return;

    const html = users.map(user => {
        const photoUrl = user.avatar_url || `https://placehold.co/64x64/e2e8f0/64748b?text=${user.first_name?.[0] || '?'}`;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unbekannt';
        const clubName = user.clubs?.name || 'Kein Verein';

        // Only show "Aus deinem Verein" if current user actually has a club AND they share the same club
        let subtitle;
        if (currentUserData?.club_id && currentUserData.club_id === user.club_id) {
            subtitle = 'Aus deinem Verein';
        } else {
            subtitle = clubName;
        }

        // Check if request is pending
        const isPending = pendingRequestIds.has(user.id);

        const buttonHtml = isPending
            ? `<span class="text-yellow-600 font-semibold py-2 px-4 rounded-full text-sm border border-yellow-600 bg-yellow-50">
                   <i class="fas fa-clock mr-1"></i>Ausstehend
               </span>`
            : `<button
                   onclick="window.followUserFromCommunity('${user.id}')"
                   class="text-indigo-600 hover:text-white hover:bg-indigo-600 font-semibold py-2 px-4 rounded-full text-sm transition border border-indigo-600"
               >
                   Folgen
               </button>`;

        return `
            <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <a href="/profile.html?id=${user.id}" class="flex items-center gap-3 flex-1 hover:opacity-80 transition">
                    <img
                        src="${photoUrl}"
                        alt="${escapeHtml(fullName)}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-gray-200"
                    />
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-800 truncate">${escapeHtml(fullName)}</h4>
                        <p class="text-sm text-gray-500 truncate">${escapeHtml(subtitle)}</p>
                    </div>
                </a>
                ${buttonHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/**
 * Follow user from community tab
 */
window.followUserFromCommunity = async function(userId) {
    if (!currentUser) return;

    // Check if already pending
    if (pendingRequestIds.has(userId)) {
        console.log('[Community] Request already pending for user:', userId);
        return;
    }

    try {
        const supabase = getSupabase();

        // Check target user's privacy settings
        const { data: targetUser } = await supabase
            .from('profiles')
            .select('privacy_settings, first_name, last_name')
            .eq('id', userId)
            .single();

        const isPublicProfile = targetUser?.privacy_settings?.profile_visibility === 'global';

        const { error } = await supabase
            .rpc('send_friend_request', {
                current_user_id: currentUser.id,
                target_user_id: userId
            });

        if (error) throw error;

        // Add to pending set immediately for UI feedback
        pendingRequestIds.add(userId);

        // For non-public profiles, create a notification for the target user
        if (!isPublicProfile) {
            const requesterName = `${currentUserData?.first_name || ''} ${currentUserData?.last_name || ''}`.trim() || 'Jemand';
            await createFollowRequestNotification(userId, currentUser.id, requesterName);
        }

        // Reload suggested users and pending requests
        await loadPendingFollowRequests();
        await loadSuggestedUsers();

        // Also reload friends list if the friends module is active
        if (typeof window.reloadFriends === 'function') {
            window.reloadFriends();
        }

    } catch (error) {
        console.error('[Community] Error following user:', error);
        alert('Fehler beim Folgen');
    }
};

/**
 * Follow all suggested users
 */
async function followAllSuggested() {
    const userIds = window._suggestedUserIds || [];
    if (userIds.length === 0) return;

    if (!confirm(`Möchtest du allen ${userIds.length} vorgeschlagenen Personen folgen?`)) {
        return;
    }

    const btn = document.getElementById('follow-all-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Folge...';
    }

    try {
        for (const userId of userIds) {
            await window.followUserFromCommunity(userId);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Allen folgen';
        }
    }
}

/**
 * Handle club search with debounce
 */
function handleClubSearch(event) {
    const query = event.target.value.trim();
    const resultsContainer = document.getElementById('club-search-results');

    // Clear existing timeout
    if (clubSearchTimeout) {
        clearTimeout(clubSearchTimeout);
    }

    if (query.length < 2) {
        resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Gib mindestens 2 Zeichen ein</p>';
        return;
    }

    resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Suche...</p>';

    // Debounce search
    clubSearchTimeout = setTimeout(async () => {
        await searchClubs(query);
    }, 300);
}

/**
 * Search for clubs
 */
async function searchClubs(query) {
    const resultsContainer = document.getElementById('club-search-results');

    try {
        const supabase = getSupabase();

        const { data: clubs, error } = await supabase
            .from('clubs')
            .select('id, name, description, logo_url')
            .ilike('name', `%${query}%`)
            .eq('is_test_club', false)
            .limit(20);

        if (error) {
            console.error('[Community] Error searching clubs:', error);
            resultsContainer.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler bei der Suche</p>';
            return;
        }

        if (!clubs || clubs.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine Clubs gefunden</p>';
            return;
        }

        // Get member counts for each club
        for (const club of clubs) {
            const { count } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('club_id', club.id);
            club.memberCount = count || 0;
        }

        renderClubSearchResults(clubs);

    } catch (error) {
        console.error('[Community] Error searching clubs:', error);
        resultsContainer.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler bei der Suche</p>';
    }
}

/**
 * Render club search results
 */
function renderClubSearchResults(clubs) {
    const resultsContainer = document.getElementById('club-search-results');
    const isInClub = !!currentUserData?.club_id;

    const html = clubs.map(club => {
        const isCurrentClub = currentUserData?.club_id === club.id;
        let actionButton = '';

        if (isCurrentClub) {
            actionButton = `
                <span class="text-green-600 text-sm font-medium">
                    <i class="fas fa-check mr-1"></i>Dein Verein
                </span>
            `;
        } else if (!isInClub) {
            actionButton = `
                <button
                    onclick="window.requestJoinClub('${club.id}', '${escapeHtml(club.name)}')"
                    class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-full text-sm transition"
                >
                    Beitreten
                </button>
            `;
        } else {
            actionButton = `
                <a href="/club.html?id=${club.id}" class="text-indigo-600 hover:text-indigo-700 font-semibold text-sm">
                    Ansehen <i class="fas fa-chevron-right ml-1"></i>
                </a>
            `;
        }

        return `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-indigo-300 transition">
                <div class="flex items-center gap-3 flex-1">
                    <div class="h-12 w-12 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-building text-indigo-600"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-800 truncate">${escapeHtml(club.name)}</h4>
                        <p class="text-sm text-gray-500">${club.memberCount} Mitglieder</p>
                    </div>
                </div>
                <div>${actionButton}</div>
            </div>
        `;
    }).join('');

    resultsContainer.innerHTML = html;
}

/**
 * Request to join a club
 */
window.requestJoinClub = async function(clubId, clubName) {
    if (!currentUser) return;

    if (!confirm(`Möchtest du eine Beitrittsanfrage an "${clubName}" senden?`)) {
        return;
    }

    try {
        const supabase = getSupabase();

        // Check if already has pending request
        const { data: existingRequest } = await supabase
            .from('club_requests')
            .select('id')
            .eq('player_id', currentUser.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingRequest) {
            alert('Du hast bereits eine ausstehende Beitrittsanfrage.');
            return;
        }

        const { error } = await supabase
            .from('club_requests')
            .insert({
                player_id: currentUser.id,
                club_id: clubId,
                status: 'pending'
            });

        if (error) throw error;

        alert(`Beitrittsanfrage an "${clubName}" gesendet!`);
        await loadCurrentClubStatus();

        // Clear search
        const searchInput = document.getElementById('club-search-input');
        if (searchInput) searchInput.value = '';
        document.getElementById('club-search-results').innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Gib einen Namen ein, um nach Clubs zu suchen</p>';

    } catch (error) {
        console.error('[Community] Error requesting to join club:', error);
        alert('Fehler beim Senden der Anfrage');
    }
};

/**
 * Load current club status
 */
async function loadCurrentClubStatus() {
    const statusContainer = document.getElementById('current-club-status');
    const pendingSection = document.getElementById('pending-club-request-section');

    if (!statusContainer) return;

    try {
        const supabase = getSupabase();

        // Refresh user data
        const { data: profile } = await supabase
            .from('profiles')
            .select('*, clubs(id, name)')
            .eq('id', currentUser.id)
            .single();

        if (profile) {
            currentUserData = profile;
        }

        // Check for pending club request
        const { data: pendingRequest } = await supabase
            .from('club_requests')
            .select('*, clubs(name)')
            .eq('player_id', currentUser.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (currentUserData?.clubs) {
            // User is in a club
            statusContainer.innerHTML = `
                <div class="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-200">
                    <div class="h-14 w-14 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-building text-green-600 text-xl"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="font-bold text-gray-800">${escapeHtml(currentUserData.clubs.name)}</h3>
                        <p class="text-sm text-green-600">
                            <i class="fas fa-check-circle mr-1"></i>Du bist Mitglied
                        </p>
                    </div>
                    <button
                        onclick="window.location.href='/settings-club.html'"
                        class="text-gray-500 hover:text-gray-700"
                        title="Vereinseinstellungen"
                    >
                        <i class="fas fa-cog text-lg"></i>
                    </button>
                </div>
            `;
            pendingSection?.classList.add('hidden');
        } else if (pendingRequest) {
            // User has pending request
            statusContainer.innerHTML = `
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-200">
                    <p class="text-gray-500 text-center">
                        <i class="fas fa-info-circle mr-1"></i>Du bist keinem Verein zugeordnet
                    </p>
                </div>
            `;

            pendingSection?.classList.remove('hidden');
            pendingSection.innerHTML = `
                <div class="bg-yellow-50 p-6 rounded-xl shadow-md border border-yellow-200">
                    <div class="flex items-center justify-between">
                        <div>
                            <h3 class="font-semibold text-yellow-800">
                                <i class="fas fa-clock mr-2"></i>Ausstehende Anfrage
                            </h3>
                            <p class="text-sm text-yellow-700 mt-1">
                                Verein: <strong>${escapeHtml(pendingRequest.clubs?.name || 'Unbekannt')}</strong>
                            </p>
                        </div>
                        <button
                            onclick="window.withdrawClubRequest('${pendingRequest.id}')"
                            class="text-red-600 hover:text-red-700 font-semibold text-sm"
                        >
                            <i class="fas fa-times mr-1"></i>Zurückziehen
                        </button>
                    </div>
                </div>
            `;
        } else {
            // No club, no pending request
            statusContainer.innerHTML = `
                <div class="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                    <i class="fas fa-search text-3xl text-gray-400 mb-2"></i>
                    <p class="text-gray-500">
                        Du bist keinem Verein zugeordnet.<br>
                        <span class="text-sm">Suche oben nach einem Verein zum Beitreten.</span>
                    </p>
                </div>
            `;
            pendingSection?.classList.add('hidden');
        }

    } catch (error) {
        console.error('[Community] Error loading club status:', error);
        statusContainer.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

/**
 * Withdraw club request
 */
window.withdrawClubRequest = async function(requestId) {
    if (!confirm('Möchtest du deine Beitrittsanfrage wirklich zurückziehen?')) {
        return;
    }

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .from('club_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        await loadCurrentClubStatus();

    } catch (error) {
        console.error('[Community] Error withdrawing request:', error);
        alert('Fehler beim Zurückziehen');
    }
};

/**
 * Withdraw a follow request
 */
async function withdrawFollowRequest(friendshipId, targetUserId) {
    if (!confirm('Möchtest du die Anfrage wirklich zurückziehen?')) {
        return;
    }

    try {
        const supabase = getSupabase();

        const { error } = await supabase
            .from('friendships')
            .delete()
            .eq('id', friendshipId);

        if (error) throw error;

        // Remove from pending set
        pendingRequestIds.delete(targetUserId);

        // Reload lists
        await loadPendingFollowRequests();
        await loadSuggestedUsers();

    } catch (error) {
        console.error('[Community] Error withdrawing follow request:', error);
        alert('Fehler beim Zurückziehen der Anfrage');
    }
}

/**
 * Setup real-time subscription for friendship changes
 */
function setupFriendshipSubscription() {
    if (friendshipSubscription) {
        // Already subscribed
        return;
    }

    const supabase = getSupabase();

    friendshipSubscription = supabase
        .channel('friendship_changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `addressee_id=eq.${currentUser.id}`
            },
            async (payload) => {
                console.log('[Community] Friendship change received:', payload);

                // Reload data when something changes
                await loadPendingFollowRequests();
                await loadSuggestedUsers();

                // Trigger notification reload if available
                if (typeof window.loadNotifications === 'function') {
                    window.loadNotifications();
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `requester_id=eq.${currentUser.id}`
            },
            async (payload) => {
                console.log('[Community] Outgoing friendship change received:', payload);

                // Reload data when something changes
                await loadPendingFollowRequests();
                await loadSuggestedUsers();
            }
        )
        .subscribe();

    console.log('[Community] Real-time subscription setup complete');
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

// Export for use in other modules
export { loadSuggestedUsers, loadCurrentClubStatus, switchCommunityTab, loadPendingFollowRequests };
