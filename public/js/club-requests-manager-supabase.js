// ===== Club Requests Manager for Coaches (Supabase Version) =====
// This module manages club join/leave requests for coaches

import { formatDate } from './ui-utils.js';

let currentUserData = null;
let supabaseClient = null;
let subscriptions = [];
let reloadJoinRequests = null;
let reloadLeaveRequests = null;

/**
 * Maps club request from Supabase (snake_case) to app format (camelCase)
 */
function mapClubRequestFromSupabase(request) {
    const playerName = request.player
        ? `${request.player.first_name || ''} ${request.player.last_name || ''}`.trim()
        : 'Unbekannt';
    const playerEmail = request.player?.email || 'Keine E-Mail';

    return {
        id: request.id,
        clubId: request.club_id,
        playerId: request.player_id,
        playerName: playerName || playerEmail,
        playerEmail: playerEmail,
        status: request.status,
        createdAt: request.created_at,
        updatedAt: request.updated_at
    };
}

/**
 * Maps leave request from Supabase (snake_case) to app format (camelCase)
 */
function mapLeaveRequestFromSupabase(request) {
    const playerName = request.player
        ? `${request.player.first_name || ''} ${request.player.last_name || ''}`.trim()
        : 'Unbekannt';
    const playerEmail = request.player?.email || 'Keine E-Mail';
    const playerRole = request.player?.role || 'player';

    return {
        id: request.id,
        clubId: request.club_id,
        playerId: request.player_id,
        playerName: playerName || playerEmail,
        playerEmail: playerEmail,
        playerRole: playerRole,
        isCoach: playerRole === 'coach' || playerRole === 'head_coach',
        status: request.status,
        createdAt: request.created_at,
        updatedAt: request.updated_at
    };
}

// Initialize club requests manager
export async function initClubRequestsManager(userData, supabase) {
    currentUserData = userData;
    supabaseClient = supabase;

    // Only load for coaches/head_coaches/admins
    if (!['coach', 'head_coach', 'admin'].includes(userData.role)) {
        return;
    }

    // Setup event delegation for join requests
    const joinRequestsContainer = document.getElementById('club-join-requests-list');
    if (joinRequestsContainer) {
        console.log('[ClubRequests] Setting up event delegation for join requests container');
        joinRequestsContainer.addEventListener('click', handleJoinRequestClick);
    } else {
        console.error('[ClubRequests] Join requests container not found!');
    }

    // Setup event delegation for leave requests
    const leaveRequestsContainer = document.getElementById('leave-requests-list');
    if (leaveRequestsContainer) {
        console.log('[ClubRequests] Setting up event delegation for leave requests container');
        leaveRequestsContainer.addEventListener('click', handleLeaveRequestClick);
    } else {
        console.error('[ClubRequests] Leave requests container not found!');
    }

    // Load club join requests
    loadClubJoinRequests();
    // Load leave requests
    loadLeaveRequests();
}

// Event delegation handler for join requests
async function handleJoinRequestClick(e) {
    console.log('[ClubRequests] Click detected on container, target:', e.target.tagName, e.target.className);

    const button = e.target.closest('button[data-action]');
    if (!button) {
        console.log('[ClubRequests] No button with data-action found');
        return;
    }

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;

    console.log('[ClubRequests] Button clicked:', action, requestId);

    if (action === 'approve-join') {
        await approveClubRequest(requestId);
    } else if (action === 'reject-join') {
        await rejectClubRequest(requestId);
    }
}

// Event delegation handler for leave requests
async function handleLeaveRequestClick(e) {
    console.log('[ClubRequests] Click detected on leave container, target:', e.target.tagName, e.target.className);

    const button = e.target.closest('button[data-action]');
    if (!button) {
        console.log('[ClubRequests] No button with data-action found');
        return;
    }

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;
    const isCoach = button.dataset.isCoach === 'true';
    const playerName = button.dataset.playerName || 'Spieler';

    console.log('[ClubRequests] Button clicked:', action, requestId, 'isCoach:', isCoach);

    if (action === 'approve-leave') {
        await approveLeaveRequest(requestId, isCoach, playerName);
    } else if (action === 'reject-leave') {
        await rejectLeaveRequest(requestId);
    }
}

// Clean up subscriptions
export function cleanupClubRequestsManager() {
    subscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
            sub.unsubscribe();
        }
    });
    subscriptions = [];
}

// Load pending club join requests
async function loadClubJoinRequests() {
    if (!supabaseClient || !currentUserData) return;

    async function fetchRequests() {
        try {
            console.log('[ClubRequests] Fetching join requests for club:', currentUserData.clubId);
            const { data, error } = await supabaseClient
                .from('club_requests')
                .select('*')
                .eq('club_id', currentUserData.clubId)
                .eq('status', 'pending');

            if (error) throw error;

            console.log('[ClubRequests] Found', data?.length || 0, 'pending join requests');

            // Fetch player data for each request
            const requestsWithPlayerData = await Promise.all(
                (data || []).map(async (request) => {
                    const { data: playerData } = await supabaseClient
                        .from('profiles')
                        .select('first_name, last_name, email')
                        .eq('id', request.player_id)
                        .single();

                    return {
                        ...request,
                        player: playerData
                    };
                })
            );

            const requests = requestsWithPlayerData.map(r => mapClubRequestFromSupabase(r));
            displayClubJoinRequests(requests);
        } catch (error) {
            console.error('Error loading club join requests:', error);
        }
    }

    // Store reference for manual reload
    reloadJoinRequests = fetchRequests;

    // Initial fetch
    fetchRequests();

    // Real-time subscription
    const subscription = supabaseClient
        .channel('club-join-requests')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'club_requests',
                filter: `club_id=eq.${currentUserData.clubId}`
            },
            () => {
                fetchRequests();
            }
        )
        .subscribe();

    subscriptions.push(subscription);
}

// Load pending leave requests
async function loadLeaveRequests() {
    if (!supabaseClient || !currentUserData) return;

    async function fetchRequests() {
        try {
            console.log('[ClubRequests] Fetching leave requests for club:', currentUserData.clubId);
            const { data, error } = await supabaseClient
                .from('leave_club_requests')
                .select('*')
                .eq('club_id', currentUserData.clubId)
                .eq('status', 'pending');

            if (error) throw error;

            console.log('[ClubRequests] Found', data?.length || 0, 'pending leave requests');

            // Fetch player data for each request (including role)
            const requestsWithPlayerData = await Promise.all(
                (data || []).map(async (request) => {
                    const { data: playerData } = await supabaseClient
                        .from('profiles')
                        .select('first_name, last_name, email, role')
                        .eq('id', request.player_id)
                        .single();

                    return {
                        ...request,
                        player: playerData
                    };
                })
            );

            const requests = requestsWithPlayerData.map(r => mapLeaveRequestFromSupabase(r));
            displayLeaveRequests(requests);
        } catch (error) {
            console.error('Error loading leave requests:', error);
        }
    }

    // Store reference for manual reload
    reloadLeaveRequests = fetchRequests;

    // Initial fetch
    fetchRequests();

    // Real-time subscription
    const subscription = supabaseClient
        .channel('leave-club-requests')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'leave_club_requests',
                filter: `club_id=eq.${currentUserData.clubId}`
            },
            () => {
                fetchRequests();
            }
        )
        .subscribe();

    subscriptions.push(subscription);
}

// Display club join requests
function displayClubJoinRequests(requests) {
    const container = document.getElementById('club-join-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Keine offenen Beitrittsanfragen</p>';
        return;
    }

    container.innerHTML = requests
        .map(
            request => `
        <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-900">${request.playerName}</h4>
                    <p class="text-sm text-gray-600">${request.playerEmail}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        Angefragt am: ${formatDate(request.createdAt, { includeTime: true })}
                    </p>
                </div>
                <div class="flex gap-2">
                    <button
                        data-action="approve-join"
                        data-request-id="${request.id}"
                        class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        Genehmigen
                    </button>
                    <button
                        data-action="reject-join"
                        data-request-id="${request.id}"
                        class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                        Ablehnen
                    </button>
                </div>
            </div>
        </div>
    `
        )
        .join('');
}

// Display leave requests
function displayLeaveRequests(requests) {
    const container = document.getElementById('leave-requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Keine offenen Austrittsanfragen</p>';
        return;
    }

    container.innerHTML = requests
        .map(
            request => {
                // Show warning if the leaving player is a coach
                const coachWarning = request.isCoach ? `
                    <div class="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                        <i class="fas fa-exclamation-triangle mr-1"></i>
                        <strong>Achtung:</strong> ${request.playerRole === 'head_coach' ? 'Haupttrainer' : 'Spartenleiter'} -
                        wird bei Genehmigung zum Spieler herabgestuft!
                    </div>
                ` : '';

                const roleLabel = request.isCoach
                    ? `<span class="ml-2 px-2 py-0.5 text-xs rounded ${request.playerRole === 'head_coach' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}">${request.playerRole === 'head_coach' ? 'Haupttrainer' : 'Spartenleiter'}</span>`
                    : '';

                return `
        <div class="bg-white rounded-lg border ${request.isCoach ? 'border-yellow-300' : 'border-gray-200'} p-4 hover:shadow-md transition-shadow">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <h4 class="font-medium text-gray-900">${request.playerName}${roleLabel}</h4>
                    <p class="text-sm text-gray-600">${request.playerEmail}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        Angefragt am: ${formatDate(request.createdAt, { includeTime: true })}
                    </p>
                    ${coachWarning}
                </div>
                <div class="flex gap-2">
                    <button
                        data-action="approve-leave"
                        data-request-id="${request.id}"
                        data-is-coach="${request.isCoach}"
                        data-player-name="${request.playerName}"
                        class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                    >
                        Genehmigen
                    </button>
                    <button
                        data-action="reject-leave"
                        data-request-id="${request.id}"
                        class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                    >
                        Ablehnen
                    </button>
                </div>
            </div>
        </div>
    `;
            }
        )
        .join('');
}

// Approve club join request
async function approveClubRequest(requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich genehmigen?')) return;

    try {
        console.log('[ClubRequests] Approving join request via RPC:', requestId);

        // First get the player_id from the request for notification
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // Call RPC function that bypasses RLS
        const { data, error } = await supabaseClient.rpc('approve_club_join_request', {
            p_request_id: requestId,
            p_coach_id: currentUserData.id
        });

        if (error) {
            console.error('Error calling approve_club_join_request RPC:', error);
            throw error;
        }

        console.log('[ClubRequests] RPC result:', data);

        if (!data.success) {
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        // Notify the player that their request was approved
        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_join_approved',
                'Beitrittsanfrage genehmigt',
                'Deine Beitrittsanfrage wurde genehmigt. Willkommen im Verein!');
            // Mark coach notifications as read
            await markCoachNotificationsAsRead(requestData.player_id, 'club_join_request');
        }

        // Manually reload the requests list
        if (reloadJoinRequests) {
            console.log('[ClubRequests] Reloading join requests list...');
            await reloadJoinRequests();
        }

        alert('Spieler wurde erfolgreich genehmigt!');
    } catch (error) {
        console.error('Error approving club request:', error);
        alert('Fehler beim Genehmigen: ' + error.message);
    }
}

// Reject club join request
async function rejectClubRequest(requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich ablehnen?')) return;

    try {
        console.log('[ClubRequests] Rejecting join request via RPC:', requestId);

        // First get the player_id from the request for notification
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // Call RPC function that bypasses RLS
        const { data, error } = await supabaseClient.rpc('reject_club_join_request', {
            p_request_id: requestId,
            p_coach_id: currentUserData.id
        });

        if (error) {
            console.error('Error calling reject_club_join_request RPC:', error);
            throw error;
        }

        console.log('[ClubRequests] RPC result:', data);

        if (!data.success) {
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        // Notify the player that their request was rejected
        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_join_rejected',
                'Beitrittsanfrage abgelehnt',
                'Deine Beitrittsanfrage wurde leider abgelehnt.');
            // Mark coach notifications as read
            await markCoachNotificationsAsRead(requestData.player_id, 'club_join_request');
        }

        // Manually reload the requests list
        if (reloadJoinRequests) {
            console.log('[ClubRequests] Reloading join requests list...');
            await reloadJoinRequests();
        }

        alert('Anfrage wurde abgelehnt.');
    } catch (error) {
        console.error('Error rejecting club request:', error);
        alert('Fehler beim Ablehnen: ' + error.message);
    }
}

// Helper function to notify a player
async function notifyPlayer(playerId, type, title, message) {
    try {
        const { error } = await supabaseClient
            .from('notifications')
            .insert({
                user_id: playerId,
                type: type,
                title: title,
                message: message,
                data: {},
                is_read: false
            });

        if (error) {
            console.error('Error creating player notification:', error);
        } else {
            console.log(`[ClubRequests] Notified player ${playerId} about ${type}`);
        }
    } catch (error) {
        console.error('Error notifying player:', error);
    }
}

// Helper function to mark coach notifications as read when request is processed
async function markCoachNotificationsAsRead(playerId, notificationType) {
    try {
        // Find and mark all notifications for this request type and player as read
        const { error } = await supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('type', notificationType)
            .eq('is_read', false)
            .contains('data', { player_id: playerId });

        if (error) {
            console.error('Error marking coach notifications as read:', error);
        } else {
            console.log(`[ClubRequests] Marked ${notificationType} notifications for player ${playerId} as read`);
        }
    } catch (error) {
        console.error('Error marking coach notifications as read:', error);
    }
}

// Approve leave request
async function approveLeaveRequest(requestId, isCoach = false, playerName = 'Spieler') {
    // Special confirmation for coaches
    let confirmMessage = 'Möchtest du diese Austrittsanfrage wirklich genehmigen?';
    if (isCoach) {
        confirmMessage = `⚠️ ACHTUNG: ${playerName} ist ein Trainer!\n\n` +
            `Wenn du diese Anfrage genehmigst, wird ${playerName}:\n` +
            `• Den Verein verlassen\n` +
            `• Zum normalen Spieler herabgestuft\n\n` +
            `Möchtest du fortfahren?`;
    }

    if (!confirm(confirmMessage)) return;

    try {
        console.log('[ClubRequests] Approving leave request via RPC:', requestId, 'isCoach:', isCoach);

        // First get the player_id from the request for notification
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('leave_club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // Call RPC function that bypasses RLS
        const { data, error } = await supabaseClient.rpc('approve_club_leave_request', {
            p_request_id: requestId,
            p_coach_id: currentUserData.id
        });

        if (error) {
            console.error('Error calling approve_club_leave_request RPC:', error);
            throw error;
        }

        console.log('[ClubRequests] RPC result:', data);

        if (!data.success) {
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        // Notify the player that their leave request was approved
        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_leave_approved',
                'Austrittsanfrage genehmigt',
                'Deine Austrittsanfrage wurde genehmigt. Du hast den Verein verlassen.');
            // Mark coach notifications as read
            await markCoachNotificationsAsRead(requestData.player_id, 'club_leave_request');
        }

        // Manually reload the requests list
        if (reloadLeaveRequests) {
            console.log('[ClubRequests] Reloading leave requests list...');
            await reloadLeaveRequests();
        }

        // Show appropriate message
        if (isCoach) {
            alert(`${playerName} hat den Verein verlassen und wurde zum Spieler herabgestuft.`);
        } else {
            alert('Spieler hat den Verein verlassen.');
        }
    } catch (error) {
        console.error('Error approving leave request:', error);
        alert('Fehler beim Genehmigen: ' + error.message);
    }
}

// Reject leave request
async function rejectLeaveRequest(requestId) {
    if (!confirm('Möchtest du diese Austrittsanfrage wirklich ablehnen?')) return;

    try {
        console.log('[ClubRequests] Rejecting leave request via RPC:', requestId);

        // First get the player_id from the request for notification
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('leave_club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // Call RPC function that bypasses RLS
        const { data, error } = await supabaseClient.rpc('reject_club_leave_request', {
            p_request_id: requestId,
            p_coach_id: currentUserData.id
        });

        if (error) {
            console.error('Error calling reject_club_leave_request RPC:', error);
            throw error;
        }

        console.log('[ClubRequests] RPC result:', data);

        if (!data.success) {
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        // Notify the player that their leave request was rejected
        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_leave_rejected',
                'Austrittsanfrage abgelehnt',
                'Deine Austrittsanfrage wurde abgelehnt. Du bleibst Mitglied im Verein.');
            // Mark coach notifications as read
            await markCoachNotificationsAsRead(requestData.player_id, 'club_leave_request');
        }

        // Manually reload the requests list
        if (reloadLeaveRequests) {
            console.log('[ClubRequests] Reloading leave requests list...');
            await reloadLeaveRequests();
        }

        alert('Austrittsanfrage wurde abgelehnt.');
    } catch (error) {
        console.error('Error rejecting leave request:', error);
        alert('Fehler beim Ablehnen: ' + error.message);
    }
}
