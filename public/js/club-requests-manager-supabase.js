// ===== Verein-Anfragen Manager für Trainer (Supabase Version) =====

import { formatDate } from './ui-utils-supabase.js';

let currentUserData = null;
let supabaseClient = null;
let subscriptions = [];
let reloadJoinRequests = null;
let reloadLeaveRequests = null;

/** Konvertiert Supabase Format (snake_case) zu App Format (camelCase) */
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

/** Konvertiert Austrittsanfrage von Supabase Format zu App Format */
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

export async function initClubRequestsManager(userData, supabase) {
    currentUserData = userData;
    supabaseClient = supabase;

    // Nur für Trainer, Haupttrainer und Admins verfügbar
    if (!['coach', 'head_coach', 'admin'].includes(userData.role)) {
        return;
    }

    const joinRequestsContainer = document.getElementById('club-join-requests-list');
    if (joinRequestsContainer) {
        console.log('[ClubRequests] Setting up event delegation for join requests container');
        joinRequestsContainer.addEventListener('click', handleJoinRequestClick);
    } else {
        console.error('[ClubRequests] Join requests container not found!');
    }

    const leaveRequestsContainer = document.getElementById('leave-requests-list');
    if (leaveRequestsContainer) {
        console.log('[ClubRequests] Setting up event delegation for leave requests container');
        leaveRequestsContainer.addEventListener('click', handleLeaveRequestClick);
    } else {
        console.error('[ClubRequests] Leave requests container not found!');
    }

    loadClubJoinRequests();
    loadLeaveRequests();
}

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

export function cleanupClubRequestsManager() {
    subscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
            sub.unsubscribe();
        }
    });
    subscriptions = [];
}

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

    // Referenz für manuelles Neuladen speichern
    reloadJoinRequests = fetchRequests;

    fetchRequests();

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

            // Spielerdaten inkl. Rolle für jede Anfrage laden
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

    // Referenz für manuelles Neuladen speichern
    reloadLeaveRequests = fetchRequests;

    fetchRequests();

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
                // Warnung anzeigen, wenn der austretende Spieler ein Trainer ist
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

async function approveClubRequest(requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich genehmigen?')) return;

    try {
        console.log('[ClubRequests] Approving join request via RPC:', requestId);

        // Spieler-ID für Benachrichtigung abrufen
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // RPC-Funktion aufrufen (umgeht RLS-Policies)
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

        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_join_approved',
                'Beitrittsanfrage genehmigt',
                'Deine Beitrittsanfrage wurde genehmigt. Willkommen im Verein!');
            await markCoachNotificationsAsRead(requestData.player_id, 'club_join_request');
        }

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

async function rejectClubRequest(requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich ablehnen?')) return;

    try {
        console.log('[ClubRequests] Rejecting join request via RPC:', requestId);

        // Spieler-ID für Benachrichtigung abrufen
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // RPC-Funktion aufrufen (umgeht RLS-Policies)
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

        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_join_rejected',
                'Beitrittsanfrage abgelehnt',
                'Deine Beitrittsanfrage wurde leider abgelehnt.');
            await markCoachNotificationsAsRead(requestData.player_id, 'club_join_request');
        }

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

// Trainer-Benachrichtigungen als gelesen markieren, wenn die Anfrage bearbeitet wurde
async function markCoachNotificationsAsRead(playerId, notificationType) {
    try {
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

async function approveLeaveRequest(requestId, isCoach = false, playerName = 'Spieler') {
    // Spezielle Bestätigung für Trainer, da diese herabgestuft werden
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

        // Spieler-ID für Benachrichtigung abrufen
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('leave_club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // RPC-Funktion aufrufen (umgeht RLS-Policies)
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

        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_leave_approved',
                'Austrittsanfrage genehmigt',
                'Deine Austrittsanfrage wurde genehmigt. Du hast den Verein verlassen.');
            await markCoachNotificationsAsRead(requestData.player_id, 'club_leave_request');
        }

        if (reloadLeaveRequests) {
            console.log('[ClubRequests] Reloading leave requests list...');
            await reloadLeaveRequests();
        }

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

async function rejectLeaveRequest(requestId) {
    if (!confirm('Möchtest du diese Austrittsanfrage wirklich ablehnen?')) return;

    try {
        console.log('[ClubRequests] Rejecting leave request via RPC:', requestId);

        // Spieler-ID für Benachrichtigung abrufen
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('leave_club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        // RPC-Funktion aufrufen (umgeht RLS-Policies)
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

        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_leave_rejected',
                'Austrittsanfrage abgelehnt',
                'Deine Austrittsanfrage wurde abgelehnt. Du bleibst Mitglied im Verein.');
            await markCoachNotificationsAsRead(requestData.player_id, 'club_leave_request');
        }

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
