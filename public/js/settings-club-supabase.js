// Vereinsverwaltung-Einstellungen - Supabase-Version

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

// Check for child_id parameter (guardian editing child's club settings)
const urlParams = new URLSearchParams(window.location.search);
const childId = urlParams.get('child_id');
let isChildMode = false;
let targetProfileId = null; // The profile ID being managed (user's own or child's)

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const currentClubStatus = document.getElementById('current-club-status');
const pendingRequestStatus = document.getElementById('pending-request-status');
const clubSearchSection = document.getElementById('club-search-section');
const clubSearchInput = document.getElementById('club-search-input');
const clubSearchBtn = document.getElementById('club-search-btn');
const clubSearchResults = document.getElementById('club-search-results');
const leaveClubSection = document.getElementById('leave-club-section');
const leaveClubBtn = document.getElementById('leave-club-btn');
const clubManagementFeedback = document.getElementById('club-management-feedback');

let currentUser = null;
let currentUserData = null;
let clubRequestsSubscription = null;


// Verify guardian has permission to manage this child's club settings
async function verifyGuardianAccess() {
    if (!childId) return true;

    const { data: guardianLink, error } = await supabase
        .from('guardian_links')
        .select('id, permissions')
        .eq('guardian_id', currentUser.id)
        .eq('child_id', childId)
        .single();

    if (error || !guardianLink) {
        console.error('Guardian access denied:', error);
        alert('Kein Zugriff auf die Vereinsverwaltung dieses Kindes.');
        window.location.href = '/guardian-dashboard.html';
        return false;
    }

    return true;
}

// Setup child mode UI
function setupChildModeUI(childProfile) {
    isChildMode = true;
    targetProfileId = childId;

    // Update page title
    const titleElement = document.querySelector('h1');
    if (titleElement) {
        titleElement.textContent = `Vereinsverwaltung für ${childProfile.first_name}`;
    }
    document.title = `Vereinsverwaltung für ${childProfile.first_name} - SC Champions`;

    // Update back link to include child_id
    const backLink = document.querySelector('a[href="/settings.html"]');
    if (backLink) {
        backLink.href = `/settings.html?child_id=${childId}`;
    }
}

// Authentifizierungsstatus beim Laden prüfen
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        // If managing child's club settings, verify access first
        if (childId) {
            const hasAccess = await verifyGuardianAccess();
            if (!hasAccess) return;

            // Load child's profile
            const { data: childProfile, error: childError } = await supabase
                .from('profiles')
                .select('id, email, first_name, last_name, role, club_id, active_sport_id')
                .eq('id', childId)
                .single();

            if (childError || !childProfile) {
                console.error('Child profile not found:', childError);
                window.location.href = '/guardian-dashboard.html';
                return;
            }

            // Setup child mode UI
            setupChildModeUI(childProfile);

            currentUserData = {
                id: childId,
                email: childProfile.email || '',
                firstName: childProfile.first_name || '',
                lastName: childProfile.last_name || '',
                role: childProfile.role || 'player',
                clubId: childProfile.club_id || null,
                activeSportId: childProfile.active_sport_id || null,
            };

            // Vereinsverwaltung initialisieren
            initializeClubManagement();
        } else {
            // Normal mode - managing own club
            targetProfileId = currentUser.id;

            // Benutzerprofil von Supabase abrufen
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('id, email, first_name, last_name, role, club_id, active_sport_id')
                .eq('id', currentUser.id)
                .single();

            if (!error && profile) {
                currentUserData = {
                    id: currentUser.id,
                    email: profile.email || currentUser.email,
                    firstName: profile.first_name || '',
                    lastName: profile.last_name || '',
                    role: profile.role || 'player',
                    clubId: profile.club_id || null,
                    activeSportId: profile.active_sport_id || null,
                };

                // Vereinsverwaltung initialisieren
                initializeClubManagement();
            }
        }

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
        if (window.hideSplash) window.hideSplash();
    } else {
        window.location.href = '/index.html';
    }
}

// Bei DOMContentLoaded initialisieren oder sofort falls bereits geladen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Auth-Status-Änderungen beobachten - nur bei explizitem Logout weiterleiten
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

/**
 * Initialize club management UI
 */
async function initializeClubManagement() {
    if (!currentUser || !currentUserData) return;

    listenToClubRequests();
    await updateClubManagementUI();
}

/**
 * Show rejection notification and delete the rejected request
 */
async function showRejectionNotification(type, requestData) {
    let clubName = requestData.club_id;
    try {
        const { data: clubData } = await supabase
            .from('clubs')
            .select('name')
            .eq('id', requestData.club_id)
            .single();

        if (clubData) {
            clubName = clubData.name || clubName;
        }
    } catch (error) {
        console.error('Error loading club name:', error);
    }

    const message = `Deine Beitrittsanfrage an "${clubName}" wurde leider abgelehnt.`;

    clubManagementFeedback.innerHTML = `
        <div class="bg-red-50 border border-red-300 p-3 rounded-lg">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <p class="text-sm text-red-800">
                        <i class="fas fa-times-circle mr-2"></i>
                        <strong>${message}</strong>
                    </p>
                    <p class="text-xs text-red-600 mt-1">
                        Du kannst eine neue Anfrage senden, wenn du möchtest.
                    </p>
                </div>
                <button
                    onclick="this.closest('.bg-red-50').remove()"
                    class="text-red-600 hover:text-red-800 ml-2"
                    title="Schließen"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;

    try {
        await supabase.from('club_requests').delete().eq('id', requestData.id);
    } catch (error) {
        console.error('Error deleting rejected request:', error);
    }
}

/**
 * Listen to club join requests in real-time
 */
function listenToClubRequests() {
    if (clubRequestsSubscription) {
        clubRequestsSubscription.unsubscribe();
    }

    const profileId = targetProfileId || currentUser.id;
    clubRequestsSubscription = supabase
        .channel('club-requests-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'club_requests',
            filter: `player_id=eq.${profileId}`
        }, async (payload) => {
            if (payload.new?.status === 'rejected') {
                await showRejectionNotification('join', payload.new);
            }
            await updateClubManagementUI();
        })
        .subscribe();
}

/**
 * Update club management UI based on user state
 */
async function updateClubManagementUI() {
    if (!currentUser || !currentUserData) return;

    const profileId = targetProfileId || currentUser.id;

    // Benutzerdaten aktualisieren
    const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', profileId)
        .single();

    if (profile) {
        currentUserData.clubId = profile.club_id || null;
    }

    // Auf ausstehende Beitrittsanfrage prüfen
    const { data: joinRequests } = await supabase
        .from('club_requests')
        .select('id')
        .eq('player_id', profileId)
        .eq('status', 'pending');

    const hasPendingJoinRequest = joinRequests && joinRequests.length > 0;

    // Aktuellen Vereinsstatus aktualisieren
    if (currentUserData.clubId) {
        let clubName = currentUserData.clubId;
        try {
            const { data: clubData } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', currentUserData.clubId)
                .single();

            if (clubData) {
                clubName = clubData.name || clubName;
            }
        } catch (error) {
            console.error('Error loading club name:', error);
        }

        currentClubStatus.innerHTML = `
            <h2 class="text-xl font-semibold mb-4">Aktueller Verein</h2>
            <div class="bg-green-50 border border-green-200 p-3 rounded-lg">
                <p class="text-sm text-green-800">
                    <i class="fas fa-check-circle mr-2"></i>
                    <strong>Verein:</strong> ${clubName}
                </p>
            </div>
        `;
    } else {
        currentClubStatus.innerHTML = `
            <h2 class="text-xl font-semibold mb-4">Aktueller Verein</h2>
            <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                <p class="text-sm text-gray-700">
                    <i class="fas fa-info-circle mr-2"></i>
                    Du bist aktuell keinem Verein zugeordnet.
                </p>
            </div>
        `;
    }

    // Status ausstehender Anfragen aktualisieren
    if (hasPendingJoinRequest) {
        const joinRequestData = joinRequests[0];
        let clubName = joinRequestData.club_id;
        try {
            const { data: clubData } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', joinRequestData.club_id)
                .single();

            if (clubData) {
                clubName = clubData.name || clubName;
            }
        } catch (error) {
            console.error('Error loading club name:', error);
        }

        pendingRequestStatus.innerHTML = `
            <div class="bg-yellow-50 border border-yellow-300 p-4 rounded-xl shadow-md">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm text-yellow-800 mb-1">
                            <i class="fas fa-clock mr-2"></i>
                            <strong>Ausstehende Beitrittsanfrage</strong>
                        </p>
                        <p class="text-xs text-yellow-700">
                            Verein: <strong>${clubName}</strong>
                        </p>
                    </div>
                    <button
                        class="withdraw-join-request-btn bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1 px-3 rounded transition"
                        data-request-id="${joinRequestData.id}"
                    >
                        <i class="fas fa-times mr-1"></i>
                        Zurückziehen
                    </button>
                </div>
            </div>
        `;

        document.querySelector('.withdraw-join-request-btn').addEventListener('click', async (e) => {
            const requestId = e.target.closest('button').dataset.requestId;
            await withdrawJoinRequest(requestId);
        });
    } else {
        pendingRequestStatus.innerHTML = '';
    }

    // Vereinssuche-Bereich ein-/ausblenden
    if (!currentUserData.clubId && !hasPendingJoinRequest) {
        clubSearchSection.classList.remove('hidden');
    } else {
        clubSearchSection.classList.add('hidden');
    }

    // Verein-verlassen-Bereich ein-/ausblenden
    if (currentUserData.clubId) {
        leaveClubSection.classList.remove('hidden');
    } else {
        leaveClubSection.classList.add('hidden');
    }
}

/**
 * Search for clubs
 */
clubSearchBtn?.addEventListener('click', async () => {
    const searchTerm = clubSearchInput.value.trim().toLowerCase();

    if (searchTerm.length < 2) {
        clubSearchResults.innerHTML = `
            <p class="text-sm text-gray-500">
                <i class="fas fa-info-circle mr-1"></i>
                Bitte mindestens 2 Zeichen eingeben.
            </p>
        `;
        return;
    }

    try {
        clubSearchBtn.disabled = true;
        clubSearchBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Suche...';
        clubSearchResults.innerHTML = '<p class="text-sm text-gray-500">Suche...</p>';

        const userSportId = currentUserData.activeSportId;
        let clubsData = [];

        if (userSportId) {
            const { data: clubSportsData, error: csError } = await supabase
                .from('club_sports')
                .select('club_id')
                .eq('sport_id', userSportId)
                .eq('is_active', true);

            if (csError) throw csError;

            const clubIdsWithSport = (clubSportsData || []).map(cs => cs.club_id);

            if (clubIdsWithSport.length > 0) {
                const { data, error } = await supabase
                    .from('clubs')
                    .select('id, name')
                    .ilike('name', `%${searchTerm}%`)
                    .eq('is_test_club', false)
                    .in('id', clubIdsWithSport);

                if (error) throw error;
                clubsData = data || [];
            }
        } else {
            const { data, error } = await supabase
                .from('clubs')
                .select('id, name')
                .ilike('name', `%${searchTerm}%`)
                .eq('is_test_club', false);

            if (error) throw error;
            clubsData = data || [];
        }

        let clubs = clubsData;

        for (const club of clubs) {
            const { count } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('club_id', club.id)
                .or('role.eq.player,role.eq.coach,is_offline.eq.true');

            club.memberCount = count || 0;
        }

        if (clubs.length === 0) {
            clubSearchResults.innerHTML = `
                <p class="text-sm text-gray-500">
                    <i class="fas fa-search mr-1"></i>
                    Keine Vereine mit deiner Sportart gefunden.
                </p>
            `;
        } else {
            clubSearchResults.innerHTML = clubs
                .map(club => `
                    <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-900">${club.name || club.id}</p>
                            <p class="text-xs text-gray-600">${club.memberCount || 0} Mitglieder</p>
                        </div>
                        <button
                            class="request-to-join-btn bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1 px-3 rounded transition"
                            data-club-id="${club.id}"
                            data-club-name="${club.name || club.id}"
                        >
                            <i class="fas fa-paper-plane mr-1"></i>
                            Anfrage senden
                        </button>
                    </div>
                `)
                .join('');

            document.querySelectorAll('.request-to-join-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const clubId = e.target.closest('button').dataset.clubId;
                    const clubName = e.target.closest('button').dataset.clubName;
                    await requestToJoinClub(clubId, clubName);
                });
            });
        }

        clubSearchBtn.disabled = false;
        clubSearchBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Suchen';
    } catch (error) {
        console.error('Error searching clubs:', error);
        clubSearchResults.innerHTML = `
            <p class="text-sm text-red-600">
                <i class="fas fa-exclamation-circle mr-1"></i>
                Fehler bei der Suche: ${error.message}
            </p>
        `;
        clubSearchBtn.disabled = false;
        clubSearchBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Suchen';
    }
});

/**
 * Notify all coaches in a club about a join request
 * Uses RPC function to bypass RLS (players without a club can't read coach profiles directly)
 */
async function notifyClubCoaches(clubId, type, playerName) {
    try {
        const { data, error } = await supabase.rpc('notify_club_coaches', {
            p_club_id: clubId,
            p_request_type: type,
            p_player_name: playerName,
            p_player_id: currentUser.id
        });

        if (error) {
            console.error('Error notifying coaches via RPC:', error);
            return;
        }

        if (data?.success) {
            console.log(`[Settings] Notified ${data.coaches_notified} coach(es) about ${type} request`);
        } else {
            console.error('Error from notify_club_coaches RPC:', data?.error);
        }
    } catch (error) {
        console.error('Error notifying coaches:', error);
    }
}

/**
 * Notify only the head_coach about a player leaving the club
 */
async function notifyHeadCoachAboutLeave(clubId, playerName) {
    try {
        const { data, error } = await supabase.rpc('notify_head_coach_leave', {
            p_club_id: clubId,
            p_player_name: playerName,
            p_player_id: targetProfileId || currentUser.id
        });

        if (error) {
            console.error('Error notifying head coach via RPC:', error);
            return;
        }

        if (data?.success) {
            console.log(`[Settings] Notified head coach about leave`);
        }
    } catch (error) {
        console.error('Error notifying head coach:', error);
    }
}

/**
 * Request to join a club - directly submits a member join request
 */
async function requestToJoinClub(clubId, clubName) {
    await submitMemberJoinRequest(clubId, clubName);
}

/**
 * Leave club directly (no request needed)
 */
leaveClubBtn?.addEventListener('click', async () => {
    if (!currentUserData.clubId) {
        alert('Du bist aktuell keinem Verein zugeordnet.');
        return;
    }

    let clubName = currentUserData.clubId;
    try {
        const { data: clubData } = await supabase
            .from('clubs')
            .select('name')
            .eq('id', currentUserData.clubId)
            .single();

        if (clubData) {
            clubName = clubData.name || clubName;
        }
    } catch (error) {
        console.error('Error loading club name:', error);
    }

    const isCoach = currentUserData.role === 'coach' || currentUserData.role === 'head_coach';
    let confirmMessage = `Möchtest du wirklich den Verein "${clubName}" verlassen?\n\nDu verlierst den Zugang zu allen Veranstaltungen und Gruppen.`;

    if (isCoach) {
        confirmMessage = `⚠️ ACHTUNG: Du bist ${currentUserData.role === 'head_coach' ? 'Haupttrainer' : 'Spartenleiter'}!\n\n` +
            `Wenn du den Verein "${clubName}" verlässt, verlierst du deine Trainer-Rechte und wirst zu einem normalen Spieler herabgestuft.\n\n` +
            `Möchtest du trotzdem den Verein verlassen?`;
    }

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        leaveClubBtn.disabled = true;
        leaveClubBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verein wird verlassen...';
        clubManagementFeedback.textContent = '';

        const profileId = targetProfileId || currentUser.id;
        const clubId = currentUserData.clubId;

        // Directly leave the club via RPC
        const { data, error } = await supabase.rpc('leave_club_directly', {
            p_player_id: profileId
        });

        if (error) throw error;

        if (!data?.success) {
            throw new Error(data?.error || 'Unbekannter Fehler');
        }

        // Notify only the head coach
        const playerName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.email;
        await notifyHeadCoachAboutLeave(clubId, playerName);

        clubManagementFeedback.textContent = `Du hast den Verein "${clubName}" verlassen.`;
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        // Update local state
        currentUserData.clubId = null;
        if (isCoach) {
            currentUserData.role = 'player';
        }

        await updateClubManagementUI();

        leaveClubBtn.disabled = false;
        leaveClubBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Verein verlassen';
    } catch (error) {
        console.error('Error leaving club:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';

        leaveClubBtn.disabled = false;
        leaveClubBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Verein verlassen';
    }
});

/**
 * Remove notifications created by this player for a specific type
 */
async function removePlayerNotifications(playerId, notificationType) {
    try {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('type', notificationType)
            .filter('data->>player_id', 'eq', playerId);

        if (error) {
            console.error('Error removing notifications:', error);
        } else {
            console.log(`[Settings] Removed ${notificationType} notifications for player ${playerId}`);
        }
    } catch (error) {
        console.error('Error removing notifications:', error);
    }
}

/**
 * Withdraw join request
 */
async function withdrawJoinRequest(requestId) {
    if (!confirm('Möchtest du deine Beitrittsanfrage wirklich zurückziehen?')) {
        return;
    }

    try {
        clubManagementFeedback.textContent = 'Ziehe Anfrage zurück...';
        clubManagementFeedback.className = 'text-sm mt-3 text-gray-600';

        const { error } = await supabase
            .from('club_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        await removePlayerNotifications(currentUser.id, 'club_join_request');

        clubManagementFeedback.textContent = '✓ Beitrittsanfrage zurückgezogen';
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error withdrawing join request:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

/**
 * Submit member join request (regular join)
 */
async function submitMemberJoinRequest(clubId, clubName) {
    try {
        clubManagementFeedback.textContent = 'Sende Anfrage...';
        clubManagementFeedback.className = 'text-sm mt-3 text-gray-600';

        const profileId = targetProfileId || currentUser.id;
        const { error } = await supabase.from('club_requests').insert({
            player_id: profileId,
            club_id: clubId,
            status: 'pending',
            request_type: 'member'
        });

        if (error) throw error;

        const playerName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.email;
        await notifyClubCoaches(clubId, 'join', playerName);

        clubManagementFeedback.textContent = `✓ Beitrittsanfrage an "${clubName}" gesendet!`;
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';
        if (window.trackEvent) window.trackEvent('club_join_request');

        clubSearchInput.value = '';
        clubSearchResults.innerHTML = '';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error requesting to join club:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

