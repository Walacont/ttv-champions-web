/**
 * Friends Module - Supabase Version
 * Handles player search, friend requests, and friends list
 */

import { getSupabase } from './supabase-init.js';

let searchTimeout = null;
let currentUser = null;
let friendshipsSubscription = null;

/**
 * Initialize the friends module
 */
export async function initFriends() {
    console.log('[Friends] Initializing friends module');

    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.error('[Friends] No user found');
        return;
    }

    currentUser = session.user;

    // Setup event listeners
    setupEventListeners();

    // Setup realtime subscriptions
    setupRealtimeSubscriptions();

    // Load initial data
    await loadFriendRequests();
    await loadFriends();
}

/**
 * Setup realtime subscriptions for friendships
 */
function setupRealtimeSubscriptions() {
    const supabase = getSupabase();

    // Cleanup existing subscription
    if (friendshipsSubscription) {
        friendshipsSubscription.unsubscribe();
    }

    // Subscribe to friendships changes (only for current user)
    friendshipsSubscription = supabase
        .channel('friendships-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'friendships',
                filter: `or(requester_id.eq.${currentUser.id},addressee_id.eq.${currentUser.id})`
            },
            (payload) => {
                console.log('[Friends] Realtime update:', payload);
                handleFriendshipChange(payload);
            }
        )
        .subscribe();

    console.log('[Friends] Realtime subscriptions setup complete');
}

/**
 * Handle friendship changes from realtime
 */
async function handleFriendshipChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    console.log(`[Friends] Friendship ${eventType}:`, newRecord || oldRecord);

    // Reload data based on event type
    if (eventType === 'INSERT') {
        // New friend request received or sent
        await loadFriendRequests();
    } else if (eventType === 'UPDATE') {
        // Friend request accepted or status changed
        await loadFriendRequests();
        await loadFriends();
    } else if (eventType === 'DELETE') {
        // Friend request declined or friendship removed
        await loadFriendRequests();
        await loadFriends();
    }
}

/**
 * Cleanup subscriptions
 */
export function cleanupFriendsSubscriptions() {
    if (friendshipsSubscription) {
        friendshipsSubscription.unsubscribe();
        friendshipsSubscription = null;
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Player search input
    const searchInput = document.getElementById('player-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', handlePlayerSearch);
    }
}

/**
 * Handle player search with debounce
 */
function handlePlayerSearch(event) {
    const query = event.target.value.trim();

    // Clear existing timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // Show loading state
    const resultsContainer = document.getElementById('player-search-results');
    if (query.length < 2) {
        resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Gib mindestens 2 Zeichen ein</p>';
        return;
    }

    resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Suche...</p>';

    // Debounce search
    searchTimeout = setTimeout(async () => {
        await searchPlayers(query);
    }, 300);
}

/**
 * Search for players
 */
async function searchPlayers(query) {
    const resultsContainer = document.getElementById('player-search-results');

    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .rpc('search_players', {
                search_query: query,
                current_user_id: currentUser.id,
                limit_count: 20
            });

        if (error) {
            console.error('[Friends] Error searching players:', error);
            resultsContainer.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Suchen</p>';
            return;
        }

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine Spieler gefunden</p>';
            return;
        }

        // Render search results
        renderSearchResults(data);

    } catch (error) {
        console.error('[Friends] Error searching players:', error);
        resultsContainer.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Suchen</p>';
    }
}

/**
 * Render search results
 */
function renderSearchResults(players) {
    const resultsContainer = document.getElementById('player-search-results');

    const html = players.map(player => {
        const photoUrl = player.photo_url || 'https://placehold.co/64x64/e2e8f0/64748b?text=' + (player.first_name?.[0] || '?');
        const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
        const clubName = player.club_name || 'Kein Verein';
        const elo = player.elo_rating || 800;

        // Determine button state
        let button = '';
        if (player.friendship_status === 'accepted') {
            button = `
                <button
                    onclick="window.removeFriend('${player.id}')"
                    class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                >
                    <i class="fas fa-user-times mr-1"></i> Entfernen
                </button>
            `;
        } else if (player.friendship_status === 'pending') {
            button = `
                <span class="text-gray-500 text-sm font-medium">
                    <i class="fas fa-clock mr-1"></i> Anfrage ausstehend
                </span>
            `;
        } else {
            button = `
                <button
                    onclick="window.sendFriendRequest('${player.id}')"
                    class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                >
                    <i class="fas fa-user-plus mr-1"></i> Anfrage senden
                </button>
            `;
        }

        return `
            <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-indigo-300 transition">
                <div class="flex items-center gap-3 flex-1">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-gray-300"
                    />
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800">${fullName}</h4>
                        <p class="text-sm text-gray-500">
                            <i class="fas fa-building mr-1"></i>${clubName}
                            <span class="mx-2">•</span>
                            <i class="fas fa-star mr-1"></i>Elo: ${elo}
                        </p>
                    </div>
                </div>
                <div>${button}</div>
            </div>
        `;
    }).join('');

    resultsContainer.innerHTML = html;
}

/**
 * Send friend request
 */
export async function sendFriendRequest(targetUserId) {
    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .rpc('send_friend_request', {
                current_user_id: currentUser.id,
                target_user_id: targetUserId
            });

        if (error) {
            console.error('[Friends] Error sending friend request:', error);
            alert('Fehler beim Senden der Freundschaftsanfrage');
            return;
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            alert(result.message === 'Friend request accepted (mutual)'
                ? 'Ihr seid jetzt Freunde!'
                : 'Freundschaftsanfrage gesendet!');

            // Reload data
            await loadFriendRequests();
            await loadFriends();

            // Re-trigger search to update button states
            const searchInput = document.getElementById('player-search-input');
            if (searchInput && searchInput.value) {
                await searchPlayers(searchInput.value);
            }
        } else {
            alert(result.error || 'Fehler beim Senden der Anfrage');
        }

    } catch (error) {
        console.error('[Friends] Error sending friend request:', error);
        alert('Fehler beim Senden der Freundschaftsanfrage');
    }
}

/**
 * Accept friend request
 */
export async function acceptFriendRequest(friendshipId) {
    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .rpc('accept_friend_request', {
                current_user_id: currentUser.id,
                friendship_id: friendshipId
            });

        if (error) {
            console.error('[Friends] Error accepting friend request:', error);
            alert('Fehler beim Akzeptieren der Anfrage');
            return;
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            alert('Freundschaftsanfrage akzeptiert!');

            // Reload data
            await loadFriendRequests();
            await loadFriends();
        } else {
            alert(result.error || 'Fehler beim Akzeptieren');
        }

    } catch (error) {
        console.error('[Friends] Error accepting friend request:', error);
        alert('Fehler beim Akzeptieren der Anfrage');
    }
}

/**
 * Decline friend request
 */
export async function declineFriendRequest(friendshipId) {
    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .rpc('decline_friend_request', {
                current_user_id: currentUser.id,
                friendship_id: friendshipId
            });

        if (error) {
            console.error('[Friends] Error declining friend request:', error);
            alert('Fehler beim Ablehnen der Anfrage');
            return;
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            // Reload data
            await loadFriendRequests();
        } else {
            alert(result.error || 'Fehler beim Ablehnen');
        }

    } catch (error) {
        console.error('[Friends] Error declining friend request:', error);
        alert('Fehler beim Ablehnen der Anfrage');
    }
}

/**
 * Remove friend
 */
export async function removeFriend(friendId) {
    if (!confirm('Möchtest du diesen Freund wirklich entfernen?')) {
        return;
    }

    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .rpc('remove_friend', {
                current_user_id: currentUser.id,
                friend_id: friendId
            });

        if (error) {
            console.error('[Friends] Error removing friend:', error);
            alert('Fehler beim Entfernen des Freundes');
            return;
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            alert('Freund entfernt');

            // Reload data
            await loadFriends();

            // Re-trigger search to update button states
            const searchInput = document.getElementById('player-search-input');
            if (searchInput && searchInput.value) {
                await searchPlayers(searchInput.value);
            }
        } else {
            alert(result.error || 'Fehler beim Entfernen');
        }

    } catch (error) {
        console.error('[Friends] Error removing friend:', error);
        alert('Fehler beim Entfernen des Freundes');
    }
}

/**
 * Load friend requests
 */
async function loadFriendRequests() {
    try {
        const supabase = getSupabase();

        // Load received requests
        const { data: receivedRequests, error: receivedError } = await supabase
            .rpc('get_pending_friend_requests', {
                current_user_id: currentUser.id
            });

        if (receivedError) {
            console.error('[Friends] Error loading received requests:', receivedError);
        } else {
            renderReceivedRequests(receivedRequests || []);
        }

        // Load sent requests
        const { data: sentRequests, error: sentError } = await supabase
            .rpc('get_sent_friend_requests', {
                current_user_id: currentUser.id
            });

        if (sentError) {
            console.error('[Friends] Error loading sent requests:', sentError);
        } else {
            renderSentRequests(sentRequests || []);
        }

    } catch (error) {
        console.error('[Friends] Error loading friend requests:', error);
    }
}

/**
 * Render received friend requests
 */
function renderReceivedRequests(requests) {
    const container = document.getElementById('received-friend-requests-list');
    const countBadge = document.getElementById('received-requests-count');

    if (countBadge) {
        countBadge.textContent = requests.length;
        countBadge.style.display = requests.length > 0 ? 'inline-block' : 'none';
    }

    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine ausstehenden Anfragen</p>';
        return;
    }

    const html = requests.map(request => {
        const photoUrl = request.requester_photo_url || 'https://placehold.co/64x64/e2e8f0/64748b?text=' + (request.requester_first_name?.[0] || '?');
        const fullName = `${request.requester_first_name || ''} ${request.requester_last_name || ''}`.trim();
        const clubName = request.requester_club_name || 'Kein Verein';
        const elo = request.requester_elo_rating || 800;
        const timeAgo = getTimeAgo(new Date(request.created_at));

        return `
            <div class="flex items-center justify-between p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <div class="flex items-center gap-3 flex-1">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-orange-300"
                    />
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800">${fullName}</h4>
                        <p class="text-sm text-gray-500">
                            <i class="fas fa-building mr-1"></i>${clubName}
                            <span class="mx-2">•</span>
                            <i class="fas fa-star mr-1"></i>Elo: ${elo}
                        </p>
                        <p class="text-xs text-gray-400 mt-1">
                            <i class="far fa-clock mr-1"></i>${timeAgo}
                        </p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button
                        onclick="window.acceptFriendRequest('${request.id}')"
                        class="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                    >
                        <i class="fas fa-check mr-1"></i> Annehmen
                    </button>
                    <button
                        onclick="window.declineFriendRequest('${request.id}')"
                        class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                    >
                        <i class="fas fa-times mr-1"></i> Ablehnen
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/**
 * Render sent friend requests
 */
function renderSentRequests(requests) {
    const container = document.getElementById('sent-friend-requests-list');

    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine gesendeten Anfragen</p>';
        return;
    }

    const html = requests.map(request => {
        const photoUrl = request.addressee_photo_url || 'https://placehold.co/64x64/e2e8f0/64748b?text=' + (request.addressee_first_name?.[0] || '?');
        const fullName = `${request.addressee_first_name || ''} ${request.addressee_last_name || ''}`.trim();
        const clubName = request.addressee_club_name || 'Kein Verein';
        const elo = request.addressee_elo_rating || 800;
        const timeAgo = getTimeAgo(new Date(request.created_at));

        return `
            <div class="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div class="flex items-center gap-3 flex-1">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-blue-300"
                    />
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800">${fullName}</h4>
                        <p class="text-sm text-gray-500">
                            <i class="fas fa-building mr-1"></i>${clubName}
                            <span class="mx-2">•</span>
                            <i class="fas fa-star mr-1"></i>Elo: ${elo}
                        </p>
                        <p class="text-xs text-gray-400 mt-1">
                            <i class="far fa-clock mr-1"></i>Gesendet ${timeAgo}
                        </p>
                    </div>
                </div>
                <span class="text-gray-500 text-sm font-medium">
                    <i class="fas fa-clock mr-1"></i> Ausstehend
                </span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/**
 * Load friends list
 */
async function loadFriends() {
    try {
        const supabase = getSupabase();

        const { data: friends, error } = await supabase
            .rpc('get_friends', {
                current_user_id: currentUser.id
            });

        if (error) {
            console.error('[Friends] Error loading friends:', error);
            return;
        }

        renderFriendsList(friends || []);

    } catch (error) {
        console.error('[Friends] Error loading friends:', error);
    }
}

/**
 * Render friends list
 */
function renderFriendsList(friends) {
    const container = document.getElementById('friends-list');
    const countDisplay = document.getElementById('friends-count');

    if (countDisplay) {
        countDisplay.textContent = `(${friends.length})`;
    }

    if (!friends || friends.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Du hast noch keine Freunde hinzugefügt</p>';
        return;
    }

    const html = friends.map(friend => {
        const photoUrl = friend.photo_url || 'https://placehold.co/64x64/e2e8f0/64748b?text=' + (friend.first_name?.[0] || '?');
        const fullName = `${friend.first_name || ''} ${friend.last_name || ''}`.trim();
        const clubName = friend.club_name || 'Kein Verein';
        const elo = friend.elo_rating || 800;
        const friendsSince = new Date(friend.friendship_created_at).toLocaleDateString('de-DE');

        return `
            <div class="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div class="flex items-center gap-3 flex-1">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-green-300"
                    />
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-800">${fullName}</h4>
                        <p class="text-sm text-gray-500">
                            <i class="fas fa-building mr-1"></i>${clubName}
                            <span class="mx-2">•</span>
                            <i class="fas fa-star mr-1"></i>Elo: ${elo}
                        </p>
                        <p class="text-xs text-gray-400 mt-1">
                            <i class="fas fa-user-friends mr-1"></i>Freunde seit ${friendsSince}
                        </p>
                    </div>
                </div>
                <button
                    onclick="window.removeFriend('${friend.id}')"
                    class="bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg text-sm transition"
                >
                    <i class="fas fa-user-times mr-1"></i> Entfernen
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/**
 * Helper function to get time ago string
 */
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    const intervals = {
        Jahr: 31536000,
        Monat: 2592000,
        Woche: 604800,
        Tag: 86400,
        Stunde: 3600,
        Minute: 60
    };

    for (const [name, value] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / value);
        if (interval >= 1) {
            return `vor ${interval} ${name}${interval > 1 ? (name === 'Monat' ? 'en' : name === 'Jahr' ? 'en' : 'n') : ''}`;
        }
    }

    return 'gerade eben';
}

// Expose functions to window for onclick handlers
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.removeFriend = removeFriend;
