/** Freunde-Modul mit Spielersuche und Folge-Anfragen */

import { getSupabase } from './supabase-init.js';

let searchTimeout = null;
let currentUser = null;
let currentUserData = null;
let friendshipsSubscription = null;
let notificationsSubscription = null;

/** Initialisiert das Freunde-Modul */
export async function initFriends() {
    console.log('[Friends] Initializing friends module');

    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.error('[Friends] No user found');
        return;
    }

    currentUser = session.user;

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    currentUserData = profile;

    setupEventListeners();
    setupRealtimeSubscriptions();

    await loadFriendRequests();
    await loadFriends();
}

/** Richtet Realtime-Subscriptions für Freundschafts-Änderungen ein */
function setupRealtimeSubscriptions() {
    const supabase = getSupabase();

    if (friendshipsSubscription) {
        friendshipsSubscription.unsubscribe();
    }

    // Filter nur für aktuellen Benutzer, um unnötige Updates zu vermeiden
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

/** Verarbeitet Freundschafts-Änderungen aus Realtime-Updates */
async function handleFriendshipChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    console.log(`[Friends] Friendship ${eventType}:`, newRecord || oldRecord);

    if (eventType === 'INSERT') {
        await loadFriendRequests();
    } else if (eventType === 'UPDATE') {
        await loadFriendRequests();
        await loadFriends();
    } else if (eventType === 'DELETE') {
        await loadFriendRequests();
        await loadFriends();
    }
}

/** Bereinigt Subscriptions beim Cleanup */
export function cleanupFriendsSubscriptions() {
    if (friendshipsSubscription) {
        friendshipsSubscription.unsubscribe();
        friendshipsSubscription = null;
    }
}

/** Richtet Event-Listener ein */
function setupEventListeners() {
    const searchInput = document.getElementById('player-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', handlePlayerSearch);
    }
}

/** Verarbeitet Spielersuche mit Debouncing */
function handlePlayerSearch(event) {
    const query = event.target.value.trim();

    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    const resultsContainer = document.getElementById('player-search-results');
    if (query.length < 2) {
        resultsContainer.classList.add('hidden');
        resultsContainer.innerHTML = '';
        return;
    }

    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = '<div class="bg-white p-6 rounded-xl shadow-md"><p class="text-gray-400 text-center py-4 text-sm">Suche...</p></div>';

    // 300ms Verzögerung, um API-Aufrufe zu reduzieren
    searchTimeout = setTimeout(async () => {
        await searchPlayers(query);
    }, 300);
}

/** Sucht nach Spielern */
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
            resultsContainer.innerHTML = '<div class="bg-white p-6 rounded-xl shadow-md"><p class="text-red-500 text-center py-4 text-sm">Fehler beim Suchen</p></div>';
            return;
        }

        if (!data || data.length === 0) {
            resultsContainer.innerHTML = '<div class="bg-white p-6 rounded-xl shadow-md"><p class="text-gray-400 text-center py-4 text-sm">Keine Personen gefunden</p></div>';
            return;
        }

        renderSearchResults(data);

    } catch (error) {
        console.error('[Friends] Error searching players:', error);
        resultsContainer.innerHTML = '<div class="bg-white p-6 rounded-xl shadow-md"><p class="text-red-500 text-center py-4 text-sm">Fehler beim Suchen</p></div>';
    }
}

/** Rendert Suchergebnisse */
function renderSearchResults(players) {
    const resultsContainer = document.getElementById('player-search-results');

    const cardsHtml = players.map(player => {
        const photoUrl = player.avatar_url || player.photo_url || avatarPlaceholder(player.first_name?.[0] || '?');
        const fullName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
        const clubName = player.club_name || 'Kein Verein';
        const elo = player.elo_rating || 800;

        let button = '';
        if (player.friendship_status === 'accepted') {
            button = `
                <button
                    onclick="event.preventDefault(); window.removeFriend('${player.id}')"
                    class="text-gray-500 hover:text-red-600 font-semibold py-2 px-4 rounded-full text-sm transition border border-gray-300 hover:border-red-300"
                >
                    Gefolgt
                </button>
            `;
        } else if (player.friendship_status === 'pending') {
            button = `
                <button
                    onclick="event.preventDefault(); window.cancelFollowRequest('${player.id}')"
                    class="text-indigo-500 hover:text-indigo-700 font-semibold py-2 px-4 rounded-full text-sm transition border border-indigo-300 hover:border-indigo-500"
                >
                    <i class="fas fa-clock mr-1"></i>Angefragt
                </button>
            `;
        } else {
            button = `
                <button
                    onclick="event.preventDefault(); window.sendFriendRequest('${player.id}')"
                    class="text-indigo-600 hover:text-white hover:bg-indigo-600 font-semibold py-2 px-4 rounded-full text-sm transition border border-indigo-600"
                >
                    Folgen
                </button>
            `;
        }

        return `
            <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <a href="/profile.html?id=${player.id}" class="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-gray-200"
                    />
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-800 truncate">${fullName}</h4>
                        <p class="text-sm text-gray-500 truncate">${clubName}</p>
                    </div>
                </a>
                <div class="flex-shrink-0">${button}</div>
            </div>
        `;
    }).join('');

    resultsContainer.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md">
            <h2 class="text-lg font-bold text-gray-800 mb-4">
                <i class="fas fa-search mr-2 text-indigo-600"></i>Suchergebnisse
                <span class="text-sm text-gray-500 font-normal">(${players.length})</span>
            </h2>
            <div class="space-y-0">${cardsHtml}</div>
        </div>
    `;
}

/** Sendet eine Freundschaftsanfrage */
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

            await loadFriendRequests();
            await loadFriends();

            // Aktualisiert Button-Zustände in der Suche
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

/** Akzeptiert eine Freundschaftsanfrage */
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

/** Lehnt eine Freundschaftsanfrage ab */
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
            await loadFriendRequests();
        } else {
            alert(result.error || 'Fehler beim Ablehnen');
        }

    } catch (error) {
        console.error('[Friends] Error declining friend request:', error);
        alert('Fehler beim Ablehnen der Anfrage');
    }
}

/** Entfernt einen Freund (Entfolgen) */
export async function removeFriend(friendId) {
    if (!confirm('Möchtest du dieser Person nicht mehr folgen?')) {
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
            console.error('[Friends] Error unfollowing:', error);
            alert('Fehler beim Entfolgen');
            return;
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            await loadFriends();

            // Aktualisiert Button-Zustände in der Suche
            const searchInput = document.getElementById('player-search-input');
            if (searchInput && searchInput.value) {
                await searchPlayers(searchInput.value);
            }
        } else {
            alert(result.error || 'Fehler beim Entfolgen');
        }

    } catch (error) {
        console.error('[Friends] Error unfollowing:', error);
        alert('Fehler beim Entfolgen');
    }
}

/** Zieht eine ausstehende Folge-Anfrage zurück */
export async function cancelFollowRequest(targetUserId) {
    try {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .rpc('cancel_follow_request', {
                current_user_id: currentUser.id,
                target_user_id: targetUserId
            });

        if (error) {
            console.error('[Friends] Error cancelling follow request:', error);
            alert('Fehler beim Zurückziehen der Anfrage');
            return;
        }

        const result = typeof data === 'string' ? JSON.parse(data) : data;

        if (result.success) {
            await loadFriendRequests();

            // Aktualisiert Button-Zustände in der Suche
            const searchInput = document.getElementById('player-search-input');
            if (searchInput && searchInput.value) {
                await searchPlayers(searchInput.value);
            }
        } else {
            alert(result.error || 'Fehler beim Zurückziehen');
        }

    } catch (error) {
        console.error('[Friends] Error cancelling follow request:', error);
        alert('Fehler beim Zurückziehen der Anfrage');
    }
}

/** Lädt Freundschaftsanfragen */
async function loadFriendRequests() {
    try {
        const supabase = getSupabase();

        const { data: receivedRequests, error: receivedError } = await supabase
            .rpc('get_pending_friend_requests', {
                current_user_id: currentUser.id
            });

        if (receivedError) {
            console.error('[Friends] Error loading received requests:', receivedError);
        } else {
            renderReceivedRequests(receivedRequests || []);
        }

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

/** Rendert empfangene Freundschaftsanfragen */
function renderReceivedRequests(requests) {
    const container = document.getElementById('received-friend-requests-list');
    const countBadge = document.getElementById('received-requests-count');

    // Container existiert möglicherweise nicht im neuen Community Tab Design
    if (!container) {
        console.log('[Friends] Received requests container not found (expected in new design)');
        return;
    }

    if (countBadge) {
        countBadge.textContent = requests.length;
        countBadge.style.display = requests.length > 0 ? 'inline-block' : 'none';
    }

    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine ausstehenden Anfragen</p>';
        return;
    }

    const html = requests.map(request => {
        const photoUrl = request.requester_avatar_url || avatarPlaceholder(request.requester_first_name?.[0] || '?');
        const fullName = `${request.requester_first_name || ''} ${request.requester_last_name || ''}`.trim();
        const clubName = request.requester_club_name || 'Kein Verein';
        const elo = request.requester_elo_rating || 800;
        const timeAgo = getTimeAgo(new Date(request.created_at));

        return `
            <div class="flex items-center justify-between p-4 bg-indigo-50 rounded-lg border-2 border-indigo-200">
                <a href="/profile.html?id=${request.requester_id}" class="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-indigo-300"
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
                </a>
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

/** Rendert gesendete Freundschaftsanfragen */
function renderSentRequests(requests) {
    const container = document.getElementById('sent-friend-requests-list');

    // Container existiert möglicherweise nicht im neuen Community Tab Design
    if (!container) {
        console.log('[Friends] Sent requests container not found (expected in new design)');
        return;
    }

    if (!requests || requests.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine gesendeten Anfragen</p>';
        return;
    }

    const html = requests.map(request => {
        const photoUrl = request.addressee_avatar_url || avatarPlaceholder(request.addressee_first_name?.[0] || '?');
        const fullName = `${request.addressee_first_name || ''} ${request.addressee_last_name || ''}`.trim();
        const clubName = request.addressee_club_name || 'Kein Verein';
        const elo = request.addressee_elo_rating || 800;
        const timeAgo = getTimeAgo(new Date(request.created_at));

        return `
            <div class="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <a href="/profile.html?id=${request.addressee_id}" class="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition">
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
                </a>
                <span class="text-gray-500 text-sm font-medium">
                    <i class="fas fa-clock mr-1"></i> Ausstehend
                </span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

/** Lädt die Freundesliste */
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

/** Rendert die Freundesliste */
function renderFriendsList(friends) {
    const container = document.getElementById('friends-list');
    const countDisplay = document.getElementById('friends-count');

    // Container existiert möglicherweise nicht auf dieser Seite
    if (!container) {
        return;
    }

    if (countDisplay) {
        countDisplay.textContent = `(${friends.length})`;
    }

    if (!friends || friends.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Du folgst noch niemandem</p>';
        return;
    }

    const html = friends.map(friend => {
        const photoUrl = friend.avatar_url || avatarPlaceholder(friend.first_name?.[0] || '?');
        const fullName = `${friend.first_name || ''} ${friend.last_name || ''}`.trim();
        const clubName = friend.club_name || 'Kein Verein';

        return `
            <div class="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <a href="/profile.html?id=${friend.id}" class="flex items-center gap-3 flex-1 cursor-pointer hover:opacity-80 transition">
                    <img
                        src="${photoUrl}"
                        alt="${fullName}"
                        class="h-12 w-12 rounded-full object-cover border-2 border-gray-200"
                    />
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold text-gray-800 truncate">${fullName}</h4>
                        <p class="text-sm text-gray-500 truncate">${clubName}</p>
                    </div>
                </a>
                <button
                    onclick="window.removeFriend('${friend.id}')"
                    class="text-gray-500 hover:text-red-600 font-semibold py-2 px-4 rounded-full text-sm transition border border-gray-300 hover:border-red-300"
                >
                    Gefolgt
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Wird vom Community-Modul verwendet
window.reloadFriends = loadFriends;

/** Hilfsfunktion zur Berechnung der verstrichenen Zeit */
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

// Funktionen für onclick-Handler im HTML verfügbar machen
window.sendFriendRequest = sendFriendRequest;
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.removeFriend = removeFriend;
window.cancelFollowRequest = cancelFollowRequest;
