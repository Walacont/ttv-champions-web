// ===== Verein-Anfragen Manager für Trainer (Supabase-Version) =====
// Handles join requests with subgroup assignment + events display flow

import { formatDate } from './ui-utils-supabase.js';

let currentUserData = null;
let supabaseClient = null;
let subscriptions = [];
let reloadJoinRequests = null;

const DAY_NAMES_DE = {
    0: 'Sonntag',
    1: 'Montag',
    2: 'Dienstag',
    3: 'Mittwoch',
    4: 'Donnerstag',
    5: 'Freitag',
    6: 'Samstag'
};

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

    loadClubJoinRequests();
}

async function handleJoinRequestClick(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;

    if (action === 'approve-join') {
        await startApprovalFlow(requestId);
    } else if (action === 'reject-join') {
        await rejectClubRequest(requestId);
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
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h4 class="font-medium text-gray-900">${request.playerName}</h4>
                    <p class="text-sm text-gray-600 truncate">${request.playerEmail}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        Angefragt am: ${formatDate(request.createdAt, { includeTime: true })}
                    </p>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                    <button
                        data-action="approve-join"
                        data-request-id="${request.id}"
                        class="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium flex-1 sm:flex-none"
                    >
                        Genehmigen
                    </button>
                    <button
                        data-action="reject-join"
                        data-request-id="${request.id}"
                        class="bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium flex-1 sm:flex-none"
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

// ===================================================================
// APPROVAL FLOW: Approve → Subgroup Assignment → Events Display
// ===================================================================

async function startApprovalFlow(requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage genehmigen?')) return;

    try {
        // Get request data
        const { data: requestData, error: fetchError } = await supabaseClient
            .from('club_requests')
            .select('player_id, club_id')
            .eq('id', requestId)
            .single();

        if (fetchError || !requestData) {
            alert('Anfrage nicht gefunden.');
            return;
        }

        // Get player data
        const { data: playerData } = await supabaseClient
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', requestData.player_id)
            .single();

        const playerName = playerData
            ? `${playerData.first_name || ''} ${playerData.last_name || ''}`.trim() || playerData.email
            : 'Spieler';

        // Approve the request via RPC (sets club_id)
        const { data: rpcResult, error: rpcError } = await supabaseClient.rpc('approve_club_join_request', {
            p_request_id: requestId,
            p_coach_id: currentUserData.id
        });

        if (rpcError) throw rpcError;
        if (!rpcResult.success) throw new Error(rpcResult.error);

        // Notify player
        await notifyPlayer(requestData.player_id, 'club_join_approved',
            'Beitrittsanfrage genehmigt',
            'Deine Beitrittsanfrage wurde genehmigt. Willkommen im Verein!');
        await markCoachNotificationsAsRead(requestData.player_id, 'club_join_request');

        // Reload join requests list
        if (reloadJoinRequests) await reloadJoinRequests();

        // Now show the subgroup assignment modal
        await showSubgroupAssignmentModal(requestData.player_id, requestData.club_id, playerName);

    } catch (error) {
        console.error('Error in approval flow:', error);
        alert('Fehler beim Genehmigen: ' + error.message);
    }
}

/**
 * Show subgroup assignment modal after approving a join request
 */
async function showSubgroupAssignmentModal(playerId, clubId, playerName) {
    const modal = document.getElementById('subgroup-assignment-modal');
    const content = document.getElementById('subgroup-assignment-content');
    if (!modal || !content) {
        console.error('[ClubRequests] Subgroup assignment modal not found');
        return;
    }

    // Load all subgroups for this club
    const { data: subgroups, error } = await supabaseClient
        .from('subgroups')
        .select('id, name, color, is_default, training_days, sport_id')
        .eq('club_id', clubId)
        .order('is_default', { ascending: false })
        .order('name');

    if (error) {
        console.error('Error loading subgroups:', error);
        alert('Fehler beim Laden der Untergruppen.');
        return;
    }

    const hauptgruppe = subgroups.find(sg => sg.is_default);
    const untergruppen = subgroups.filter(sg => !sg.is_default);

    content.innerHTML = `
        <div class="p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-1">Zu Untergruppen hinzufügen</h2>
            <p class="text-sm text-gray-600 mb-5">${playerName} wurde zum Verein hinzugefügt. Weise jetzt die Untergruppen zu.</p>

            <div class="space-y-3 mb-6">
                ${hauptgruppe ? `
                    <label class="flex items-center gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200 cursor-not-allowed">
                        <input type="checkbox" checked disabled
                            class="w-5 h-5 rounded text-indigo-600"
                            value="${hauptgruppe.id}" />
                        <div class="flex-1">
                            <span class="font-medium text-gray-900">${hauptgruppe.name}</span>
                            <span class="ml-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">Automatisch</span>
                        </div>
                        ${hauptgruppe.color ? `<span class="w-4 h-4 rounded-full flex-shrink-0" style="background-color: ${hauptgruppe.color}"></span>` : ''}
                    </label>
                ` : ''}

                ${untergruppen.length > 0 ? untergruppen.map(sg => `
                    <label class="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                        <input type="checkbox"
                            class="subgroup-checkbox w-5 h-5 rounded text-indigo-600 cursor-pointer"
                            value="${sg.id}" />
                        <div class="flex-1">
                            <span class="font-medium text-gray-900">${sg.name}</span>
                            ${sg.training_days && sg.training_days.length > 0
                                ? `<span class="ml-2 text-xs text-gray-500">${formatTrainingDays(sg.training_days)}</span>`
                                : ''}
                        </div>
                        ${sg.color ? `<span class="w-4 h-4 rounded-full flex-shrink-0" style="background-color: ${sg.color}"></span>` : ''}
                    </label>
                `).join('') : '<p class="text-sm text-gray-500 text-center py-2">Keine weiteren Untergruppen vorhanden</p>'}
            </div>

            <div class="flex gap-3">
                <button id="subgroup-assign-btn"
                    class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition">
                    Weiter
                </button>
            </div>
        </div>
    `;

    // Show modal
    modal.classList.remove('hidden');

    // Handle assign button
    document.getElementById('subgroup-assign-btn').addEventListener('click', async () => {
        const selectedSubgroupIds = [];

        // Always include Hauptgruppe
        if (hauptgruppe) {
            selectedSubgroupIds.push(hauptgruppe.id);
        }

        // Add selected subgroups
        content.querySelectorAll('.subgroup-checkbox:checked').forEach(cb => {
            selectedSubgroupIds.push(cb.value);
        });

        // Assign subgroups to player
        const btn = document.getElementById('subgroup-assign-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird zugewiesen...';

        try {
            // Update player's subgroup_ids
            const { error: updateError } = await supabaseClient
                .from('profiles')
                .update({
                    subgroup_ids: selectedSubgroupIds,
                    updated_at: new Date().toISOString()
                })
                .eq('id', playerId);

            if (updateError) throw updateError;

            console.log('[ClubRequests] Assigned player to subgroups:', selectedSubgroupIds);

            // Show events step
            await showEventsForSubgroups(playerId, clubId, playerName, selectedSubgroupIds, subgroups);

        } catch (err) {
            console.error('Error assigning subgroups:', err);
            alert('Fehler beim Zuweisen der Untergruppen: ' + err.message);
            btn.disabled = false;
            btn.innerHTML = 'Weiter';
        }
    });
}

/**
 * Show events related to the assigned subgroups
 */
async function showEventsForSubgroups(playerId, clubId, playerName, subgroupIds, allSubgroups) {
    const content = document.getElementById('subgroup-assignment-content');
    if (!content) return;

    // Load events for the assigned subgroups
    const { data: events, error } = await supabaseClient
        .from('events')
        .select('id, title, start_date, start_time, event_type, repeat_type, repeat_end_date, target_type, target_subgroup_ids, reminder_sent_at, cancelled')
        .eq('club_id', clubId)
        .eq('cancelled', false);

    if (error) {
        console.error('Error loading events:', error);
    }

    // Filter events that match the player's assigned subgroups
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const relevantEvents = (events || []).filter(event => {
        // Check subgroup relevance
        if (event.target_type === 'subgroups' && event.target_subgroup_ids) {
            if (!subgroupIds.some(sgId => event.target_subgroup_ids.includes(sgId))) return false;
        } else if (event.target_type !== 'club' && event.target_type) {
            return false;
        }

        // Only show future events (no past events)
        const isRecurring = event.event_type === 'recurring' || event.repeat_type;
        if (isRecurring) {
            // Recurring: show if no end date or end date is in the future
            if (event.repeat_end_date && event.repeat_end_date < todayStr) return false;
            return true;
        } else {
            // Single event: only show if start_date is today or in the future
            return event.start_date >= todayStr;
        }
    });

    // Separate active events (reminder sent = happening soon) from regular
    const activeEvents = relevantEvents.filter(e => e.reminder_sent_at);
    const futureEvents = relevantEvents.filter(e => !e.reminder_sent_at);

    // Build subgroup name map
    const subgroupMap = {};
    allSubgroups.forEach(sg => { subgroupMap[sg.id] = sg; });

    // Build events HTML
    let eventsHtml = '';

    if (relevantEvents.length === 0) {
        eventsHtml = '<p class="text-sm text-gray-500 text-center py-4">Keine Veranstaltungen für die zugewiesenen Gruppen.</p>';
    } else {
        eventsHtml = relevantEvents.map(event => {
            const isRecurring = event.event_type === 'recurring' || event.repeat_type;
            const isActive = !!event.reminder_sent_at;

            // Get subgroup names for this event
            let eventSubgroups = '';
            if (event.target_type === 'subgroups' && event.target_subgroup_ids) {
                const sgNames = event.target_subgroup_ids
                    .map(id => subgroupMap[id]?.name)
                    .filter(Boolean);
                eventSubgroups = sgNames.join(', ');
            } else {
                eventSubgroups = 'Ganzer Verein';
            }

            if (isRecurring) {
                // Recurring: show title + repeat day
                const repeatDay = getRepeatDayText(event);
                return `
                    <label class="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                        <input type="checkbox" class="event-checkbox w-5 h-5 rounded text-indigo-600 cursor-pointer" value="${event.id}" checked />
                        <div class="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-sync-alt text-indigo-600 text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-medium text-gray-900 text-sm">${event.title}</p>
                            <p class="text-xs text-gray-500">${repeatDay}</p>
                            <p class="text-xs text-gray-400">${eventSubgroups}</p>
                        </div>
                        ${isActive ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex-shrink-0">Aktiv</span>' : ''}
                    </label>
                `;
            } else {
                // Single event: show title + date
                const eventDate = formatEventDate(event.start_date);
                return `
                    <label class="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                        <input type="checkbox" class="event-checkbox w-5 h-5 rounded text-indigo-600 cursor-pointer" value="${event.id}" checked />
                        <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <i class="fas fa-calendar text-blue-600 text-sm"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="font-medium text-gray-900 text-sm">${event.title}</p>
                            <p class="text-xs text-gray-500">${eventDate}${event.start_time ? ' um ' + event.start_time.substring(0, 5) : ''}</p>
                            <p class="text-xs text-gray-400">${eventSubgroups}</p>
                        </div>
                        ${isActive ? '<span class="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full flex-shrink-0">Aktiv</span>' : ''}
                    </label>
                `;
            }
        }).join('');
    }

    content.innerHTML = `
        <div class="p-6">
            <h2 class="text-lg font-bold text-gray-900 mb-1">Veranstaltungen</h2>
            <p class="text-sm text-gray-600 mb-4">
                Wähle die Veranstaltungen aus, zu denen ${playerName} eingeladen werden soll.
                ${activeEvents.length > 0 ? `<br><span class="text-green-700 font-medium">Aktive Einladungen werden direkt verschickt.</span>` : ''}
            </p>

            <div class="space-y-2 mb-6 max-h-80 overflow-y-auto">
                ${eventsHtml}
            </div>

            <button id="finish-assignment-btn"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-lg transition">
                Fertig
            </button>
        </div>
    `;

    // Handle finish button - send invitations only for selected events
    document.getElementById('finish-assignment-btn').addEventListener('click', async () => {
        const btn = document.getElementById('finish-assignment-btn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Einladungen werden verschickt...';

        // Get selected event IDs from checkboxes
        const selectedEventIds = new Set();
        content.querySelectorAll('.event-checkbox:checked').forEach(cb => {
            selectedEventIds.add(cb.value);
        });

        // Only send invitations for selected active events
        const selectedActiveEvents = activeEvents.filter(e => selectedEventIds.has(e.id));
        if (selectedActiveEvents.length > 0) {
            await sendInvitationsForActiveEvents(playerId, selectedActiveEvents);
        }

        const modal = document.getElementById('subgroup-assignment-modal');
        if (modal) modal.classList.add('hidden');
    });
}

/**
 * Send invitations to the new player for active events (where reminder was already sent)
 */
async function sendInvitationsForActiveEvents(playerId, activeEvents) {
    for (const event of activeEvents) {
        try {
            const isRecurring = event.event_type === 'recurring' || event.repeat_type;
            let occurrenceDate = event.start_date;

            if (isRecurring) {
                // For recurring events, find the next upcoming occurrence
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                const occurrences = generateOccurrences(event.start_date, event.repeat_type, event.repeat_end_date, 2);
                occurrenceDate = occurrences.find(d => d >= todayStr) || occurrences[0] || event.start_date;
            }

            // Create invitation
            const { error } = await supabaseClient
                .from('event_invitations')
                .upsert({
                    event_id: event.id,
                    user_id: playerId,
                    occurrence_date: occurrenceDate,
                    status: 'pending',
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'event_id,user_id,occurrence_date',
                    ignoreDuplicates: true
                });

            if (error) {
                console.warn('[ClubRequests] Error creating invitation for event:', event.id, error);
            } else {
                console.log('[ClubRequests] Sent invitation for active event:', event.title);
            }

            // Also send a notification for the invitation
            await notifyPlayer(playerId, 'event_invitation',
                'Neue Veranstaltung',
                `Du wurdest zu "${event.title}" eingeladen.`);
        } catch (err) {
            console.warn('[ClubRequests] Error sending invitation:', err);
        }
    }
}

/**
 * Generate upcoming occurrences for a recurring event (simplified version)
 */
function generateOccurrences(startDate, repeatType, repeatEndDate, weeksAhead = 4) {
    const occurrences = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eventStart = new Date(startDate + 'T12:00:00');
    const endDate = repeatEndDate ? new Date(repeatEndDate + 'T12:00:00') : null;

    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + (weeksAhead * 7));

    let currentDate = new Date(eventStart);
    if (currentDate < today) {
        while (currentDate < today) {
            switch (repeatType) {
                case 'daily': currentDate.setDate(currentDate.getDate() + 1); break;
                case 'weekly': currentDate.setDate(currentDate.getDate() + 7); break;
                case 'biweekly': currentDate.setDate(currentDate.getDate() + 14); break;
                case 'monthly': currentDate.setMonth(currentDate.getMonth() + 1); break;
            }
        }
    }

    let maxIterations = 50;
    while (currentDate <= windowEnd && maxIterations > 0) {
        if (endDate && currentDate > endDate) break;
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        occurrences.push(dateStr);

        switch (repeatType) {
            case 'daily': currentDate.setDate(currentDate.getDate() + 1); break;
            case 'weekly': currentDate.setDate(currentDate.getDate() + 7); break;
            case 'biweekly': currentDate.setDate(currentDate.getDate() + 14); break;
            case 'monthly': currentDate.setMonth(currentDate.getMonth() + 1); break;
        }
        maxIterations--;
    }

    return occurrences;
}

/**
 * Get the repeat day text for a recurring event (e.g., "Jeden Montag")
 */
function getRepeatDayText(event) {
    if (!event.repeat_type) return '';

    if (event.repeat_type === 'daily') return 'Täglich';
    if (event.repeat_type === 'monthly') return 'Monatlich';

    // For weekly/biweekly, determine the day from the start_date
    const startDate = new Date(event.start_date + 'T12:00:00');
    const dayName = DAY_NAMES_DE[startDate.getDay()];

    if (event.repeat_type === 'weekly') return `Jeden ${dayName}`;
    if (event.repeat_type === 'biweekly') return `Alle 2 Wochen ${dayName}`;

    return event.repeat_type;
}

/**
 * Format event date for display
 */
function formatEventDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format training days array for display
 */
function formatTrainingDays(days) {
    if (!days || days.length === 0) return '';
    const dayMap = {
        'monday': 'Mo', 'tuesday': 'Di', 'wednesday': 'Mi',
        'thursday': 'Do', 'friday': 'Fr', 'saturday': 'Sa', 'sunday': 'So'
    };
    return days.map(d => dayMap[d] || d).join(', ');
}

// ===================================================================
// REJECT FLOW
// ===================================================================

async function rejectClubRequest(requestId) {
    if (!confirm('Möchtest du diese Beitrittsanfrage wirklich ablehnen?')) return;

    try {
        console.log('[ClubRequests] Rejecting join request via RPC:', requestId);

        const { data: requestData, error: fetchError } = await supabaseClient
            .from('club_requests')
            .select('player_id')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.error('Error fetching request data:', fetchError);
        }

        const { data, error } = await supabaseClient.rpc('reject_club_join_request', {
            p_request_id: requestId,
            p_coach_id: currentUserData.id
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');

        if (requestData?.player_id) {
            await notifyPlayer(requestData.player_id, 'club_join_rejected',
                'Beitrittsanfrage abgelehnt',
                'Deine Beitrittsanfrage wurde leider abgelehnt.');
            await markCoachNotificationsAsRead(requestData.player_id, 'club_join_request');
        }

        if (reloadJoinRequests) await reloadJoinRequests();

        alert('Anfrage wurde abgelehnt.');
    } catch (error) {
        console.error('Error rejecting club request:', error);
        alert('Fehler beim Ablehnen: ' + error.message);
    }
}

// ===================================================================
// NOTIFICATION HELPERS
// ===================================================================

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
        }
    } catch (error) {
        console.error('Error notifying player:', error);
    }
}

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
        }
    } catch (error) {
        console.error('Error marking coach notifications as read:', error);
    }
}
