/**
 * Profilansicht-Modul für öffentliche Benutzerprofile
 */

import { getSupabase } from './supabase-init.js';
import { createFollowRequestNotification, createFollowAcceptedNotification } from './notifications-supabase.js';
import { getRankProgress, RANKS } from './ranks.js';
import { escapeHtml } from './utils/security.js';

let currentUser = null;
let profileUser = null;
let profileId = null;
let isOwnProfile = false;

const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

/** Initialisiert die Profilansicht */
async function initProfileView() {
    console.log('[ProfileView] Initializing profile view');

    try {
        const urlParams = new URLSearchParams(window.location.search);
        profileId = urlParams.get('id');

        if (!profileId) {
            showError('Kein Profil angegeben');
            return;
        }

        const supabase = getSupabase();
        if (!supabase) {
            console.error('[ProfileView] Supabase not initialized');
            showError('Verbindungsfehler');
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;

        isOwnProfile = currentUser && currentUser.id === profileId;

        await loadProfile();

        // Real-time Updates nur für fremde Profile - eigenes Profil ändert sich nicht durch andere
        if (currentUser && !isOwnProfile) {
            setupFollowStatusSubscription(supabase);
        }

        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    } catch (error) {
        console.error('[ProfileView] Initialization error:', error);
        showError('Fehler beim Laden des Profils');
    }
}

/**
 * Echtzeit-Updates für Follow-Status
 * Aktualisiert UI wenn Profilbesitzer Follow-Request annimmt/ablehnt
 */
function setupFollowStatusSubscription(supabase) {
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

                // Nur Änderungen für aktuell angezeigtes Profil verarbeiten
                if (payload.new?.addressee_id === profileId || payload.old?.addressee_id === profileId) {
                    if (payload.eventType === 'UPDATE' && payload.new?.status === 'accepted') {
                        console.log('[ProfileView] Follow request accepted!');
                        await loadFollowerStats();
                        await renderFollowButton();
                        // Profil neu laden falls jetzt Zugriff gewährt wurde
                        await loadProfile();
                    } else if (payload.eventType === 'DELETE') {
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

                // Prüfen ob Änderung vom angezeigten Profil kommt
                if (payload.new?.requester_id === profileId || payload.old?.requester_id === profileId) {
                    await loadFollowerStats();
                    await renderFollowButton();
                }
            }
        )
        .subscribe((status) => {
            console.log('[ProfileView] Subscription status:', status);
        });

    // Aufräumen beim Verlassen der Seite
    window.addEventListener('beforeunload', () => {
        supabase.removeChannel(channel);
    });
}

/** Lädt Profildaten */
async function loadProfile() {
    try {
        const supabase = getSupabase();

        // bio und location können fehlen falls Migration noch nicht durchgelaufen
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

        renderProfileHeader(profile);

        // Eigenes Profil hat immer vollen Zugriff
        const visibility = profile.privacy_settings?.profile_visibility || 'global';
        const canViewDetails = isOwnProfile || await checkViewPermission(profile, visibility);

        if (canViewDetails) {
            document.getElementById('public-profile-content').classList.remove('hidden');
            document.getElementById('private-profile-notice').classList.add('hidden');

            await renderProfileStats(profile);
            await renderClubSection(profile);
            await renderRecentActivity(profile);

            if (isOwnProfile) {
                await renderOwnProfileExtras(profile);
            }
        } else {
            document.getElementById('public-profile-content').classList.add('hidden');
            document.getElementById('private-profile-notice').classList.remove('hidden');
        }

        await loadFollowerStats();
        renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error loading profile:', error);
        showError('Fehler beim Laden des Profils');
    }
}

/**
 * Prüft Zugriffsberechtigung basierend auf Sichtbarkeitseinstellung
 * Optionen: 'global', 'club_only', 'followers_only'
 */
async function checkViewPermission(profile, visibility) {
    if (visibility === 'global') {
        return true;
    }

    if (!currentUser) {
        return false;
    }

    const supabase = getSupabase();

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

    if (visibility === 'followers_only') {
        const { data: friendship } = await supabase
            .from('friendships')
            .select('status')
            .eq('requester_id', currentUser.id)
            .eq('addressee_id', profileId)
            .eq('status', 'accepted')
            .maybeSingle();

        return !!friendship;
    }

    return false;
}

/** Rendert Profil-Header mit Name, Avatar, Ort und Bio */
function renderProfileHeader(profile) {
    const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unbekannt';
    const photoUrl = profile.avatar_url || `https://placehold.co/120x120/e2e8f0/64748b?text=${(profile.first_name?.[0] || '?')}`;

    document.title = isOwnProfile ? 'Mein Profil - SC Champions' : `${fullName} - SC Champions`;

    document.getElementById('profile-avatar').src = photoUrl;
    document.getElementById('profile-avatar').alt = fullName;

    document.getElementById('profile-name').textContent = isOwnProfile ? 'Mein Profil' : fullName;

    const subtitleEl = document.getElementById('profile-subtitle');
    if (subtitleEl) {
        if (isOwnProfile) {
            subtitleEl.textContent = fullName;
            subtitleEl.classList.remove('hidden');
        } else {
            subtitleEl.classList.add('hidden');
        }
    }

    const locationEl = document.getElementById('profile-location');
    if (profile.location || profile.clubs?.name) {
        const locationText = profile.location || profile.clubs?.name || '';
        locationEl.innerHTML = `<i class="fas fa-map-marker-alt mr-1"></i><span>${escapeHtml(locationText)}</span>`;
    } else {
        locationEl.classList.add('hidden');
    }

    if (profile.bio) {
        document.getElementById('profile-bio').textContent = profile.bio;
        document.getElementById('profile-bio-container').classList.remove('hidden');
    }

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

/** Rendert Profilstatistiken */
async function renderProfileStats(profile) {
    document.getElementById('stat-elo').textContent = profile.elo_rating || 800;

    document.getElementById('stat-points').textContent = profile.points || 0;

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

/** Rendert Vereins-Sektion */
async function renderClubSection(profile) {
    if (!profile.clubs) {
        return;
    }

    const clubSection = document.getElementById('club-section');
    clubSection.classList.remove('hidden');

    document.getElementById('club-name').textContent = profile.clubs.name;

    const supabase = getSupabase();
    const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', profile.club_id);

    document.getElementById('club-members').textContent = `${count || 0} Mitglieder`;
}

/** Formatiert relatives Datum (Heute, Gestern, oder TT.MM.JJJJ) */
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

/** Rendert letzte Aktivitäten (Matches und Posts) analog zum Dashboard */
async function renderRecentActivity(profile) {
    const supabase = getSupabase();
    const ACTIVITY_LIMIT = 10;

    try {
        const [singlesRes, doublesRes, postsRes] = await Promise.all([
            supabase
                .from('matches')
                .select('*')
                .or(`player_a_id.eq.${profileId},player_b_id.eq.${profileId}`)
                .order('created_at', { ascending: false })
                .limit(ACTIVITY_LIMIT),

            supabase
                .from('doubles_matches')
                .select('*')
                .or(`team_a_player1_id.eq.${profileId},team_a_player2_id.eq.${profileId},team_b_player1_id.eq.${profileId},team_b_player2_id.eq.${profileId}`)
                .order('created_at', { ascending: false })
                .limit(ACTIVITY_LIMIT),

            supabase
                .from('community_posts')
                .select('*')
                .eq('user_id', profileId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(ACTIVITY_LIMIT)
        ]);

        let allActivities = [
            ...(singlesRes.data || []).map(m => ({ ...m, activityType: 'singles' })),
            ...(doublesRes.data || []).map(m => ({ ...m, activityType: 'doubles' })),
            ...(postsRes.data || []).map(p => ({ ...p, activityType: 'post' }))
        ];

        // === PRIVACY FILTERING FOR MATCHES ===
        // ALL players in a match must allow visibility - strictest setting wins
        // Skip filtering for own profile - always show all matches
        const viewerId = currentUser?.id;

        if (!isOwnProfile) {
            // Collect all player IDs from matches
            const matchPlayerIds = new Set();
            allActivities.forEach(activity => {
                if (activity.activityType === 'singles') {
                    if (activity.player_a_id) matchPlayerIds.add(activity.player_a_id);
                    if (activity.player_b_id) matchPlayerIds.add(activity.player_b_id);
                } else if (activity.activityType === 'doubles') {
                    if (activity.team_a_player1_id) matchPlayerIds.add(activity.team_a_player1_id);
                    if (activity.team_a_player2_id) matchPlayerIds.add(activity.team_a_player2_id);
                    if (activity.team_b_player1_id) matchPlayerIds.add(activity.team_b_player1_id);
                    if (activity.team_b_player2_id) matchPlayerIds.add(activity.team_b_player2_id);
                }
            });

            // Load privacy settings and club_id for all players
            let privacyMap = {};
            if (matchPlayerIds.size > 0) {
                const { data: privacyProfiles } = await supabase
                    .from('profiles')
                    .select('id, privacy_settings, club_id')
                    .in('id', [...matchPlayerIds]);

                (privacyProfiles || []).forEach(p => {
                    privacyMap[p.id] = p;
                });
            }

            // Get viewer's club_id and following list
            let viewerClubId = null;
            let viewerFollowingIds = new Set();

            if (currentUser) {
                const { data: viewerProfile } = await supabase
                    .from('profiles')
                    .select('club_id')
                    .eq('id', currentUser.id)
                    .single();

                viewerClubId = viewerProfile?.club_id;

                const { data: following } = await supabase
                    .from('friendships')
                    .select('addressee_id')
                    .eq('requester_id', currentUser.id)
                    .eq('status', 'accepted');

                (following || []).forEach(f => viewerFollowingIds.add(f.addressee_id));
            }

            // Filter matches based on privacy settings of ALL players
            allActivities = allActivities.filter(activity => {
                if (activity.activityType === 'post') {
                    return true; // Posts are not affected by matches_visibility
                }

                // Get all player IDs for this match
                let playerIds = [];
                if (activity.activityType === 'singles') {
                    playerIds = [activity.player_a_id, activity.player_b_id].filter(Boolean);
                } else if (activity.activityType === 'doubles') {
                    playerIds = [
                        activity.team_a_player1_id,
                        activity.team_a_player2_id,
                        activity.team_b_player1_id,
                        activity.team_b_player2_id
                    ].filter(Boolean);
                }

                // If viewer is a player, always visible
                if (viewerId && playerIds.includes(viewerId)) {
                    return true;
                }

                // Check if ALL players allow viewing
                for (const playerId of playerIds) {
                    const privacy = privacyMap[playerId]?.privacy_settings || {};
                    const visibility = privacy.matches_visibility || 'global';
                    const playerClubId = privacyMap[playerId]?.club_id;

                    let playerAllows = false;

                    if (visibility === 'global') {
                        playerAllows = true;
                    } else if (visibility === 'club_only') {
                        playerAllows = viewerClubId && playerClubId && viewerClubId === playerClubId;
                    } else if (visibility === 'followers_only') {
                        playerAllows = viewerFollowingIds.has(playerId);
                    } else if (visibility === 'none') {
                        playerAllows = false;
                    }

                    // If any player blocks, match is not visible
                    if (!playerAllows) {
                        return false;
                    }
                }

                return true;
            });
        }

        allActivities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const activities = allActivities.slice(0, ACTIVITY_LIMIT);

        if (activities.length === 0) {
            return;
        }

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

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, display_name, elo_rating')
            .in('id', [...playerIds].filter(Boolean));

        const profileMap = {};
        (profiles || []).forEach(p => {
            profileMap[p.id] = p;
        });

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

/** Rendert einzelne Aktivitätskarte */
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

/** Rendert Einzel-Match-Karte */
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

    const matchDate = new Date(match.played_at || match.created_at);
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

/** Rendert Doppel-Match-Karte */
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

    const matchDate = new Date(match.played_at || match.created_at);
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

            <div class="flex flex-col items-center mb-3">
                <p class="text-2xl font-bold mb-2">${mySetWins} : ${oppSetWins}</p>

                <div class="doubles-teams-row flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
                    <div class="flex items-center">
                        <div class="flex -space-x-2 flex-shrink-0">
                            <img src="${myTeam[0]?.avatar_url || DEFAULT_AVATAR}" class="w-7 h-7 rounded-full border-2 ${won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <img src="${myTeam[1]?.avatar_url || DEFAULT_AVATAR}" class="w-7 h-7 rounded-full border-2 ${won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                        </div>
                        <span class="ml-1 doubles-team-names truncate max-w-[100px] font-medium">${escapeHtml(myTeamNames)}</span>
                    </div>
                    <span class="vs-separator text-gray-400">vs</span>
                    <div class="flex items-center">
                        <div class="flex -space-x-2 flex-shrink-0">
                            <img src="${oppTeam[0]?.avatar_url || DEFAULT_AVATAR}" class="w-7 h-7 rounded-full border-2 ${!won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <img src="${oppTeam[1]?.avatar_url || DEFAULT_AVATAR}" class="w-7 h-7 rounded-full border-2 ${!won ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                        </div>
                        <span class="ml-1 doubles-team-names truncate max-w-[100px] font-medium">${escapeHtml(oppTeamNames)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/** Rendert Community-Post-Karte */
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

/** Liefert Anzeigenamen für Spielerprofil */
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
 * Lädt Follower-Statistiken
 * Verwendet RPC-Funktion um RLS zu umgehen - Follower-Zahlen sollten für alle sichtbar sein
 */
async function loadFollowerStats() {
    const supabase = getSupabase();

    try {
        const { data, error } = await supabase
            .rpc('get_follow_counts', { p_user_id: profileId });

        if (error) {
            console.error('[ProfileView] Error loading follow counts:', error);
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

    const followingLink = document.getElementById('following-link');
    const followersLink = document.getElementById('followers-link');

    if (followingLink) {
        followingLink.href = `/connections.html?id=${profileId}&tab=following`;
    }
    if (followersLink) {
        followersLink.href = `/connections.html?id=${profileId}&tab=followers`;
    }
}

/** Rendert Follow/Unfollow-Button */
async function renderFollowButton() {
    const container = document.getElementById('follow-button-container');

    if (isOwnProfile) {
        container.innerHTML = '';
        return;
    }

    if (!currentUser) {
        container.innerHTML = `
            <a href="/app.html" class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-full transition">
                Anmelden zum Folgen
            </a>
        `;
        return;
    }

    const supabase = getSupabase();

    // Nur prüfen ob aktueller User dem Profil folgt (einseitig)
    const { data: friendship } = await supabase
        .from('friendships')
        .select('id, status, requester_id')
        .eq('requester_id', currentUser.id)
        .eq('addressee_id', profileId)
        .maybeSingle();

    if (friendship) {
        if (friendship.status === 'accepted') {
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
                container.innerHTML = `
                    <button
                        onclick="window.cancelFollowRequest('${profileId}')"
                        class="bg-gray-200 text-gray-600 font-semibold py-2 px-6 rounded-full transition"
                    >
                        <i class="fas fa-clock mr-2"></i>Angefragt
                    </button>
                `;
            } else {
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

/** Folgt einem Benutzer */
let followInProgress = false;
window.followUser = async function(userId) {
    if (!currentUser) {
        window.location.href = '/app.html';
        return;
    }

    // Verhindert Doppel-Klicks
    if (followInProgress) {
        console.log('[ProfileView] Follow already in progress');
        return;
    }

    followInProgress = true;

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

        const visibility = profileUser?.privacy_settings?.profileVisibility || 'public';

        const { data: currentUserProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', currentUser.id)
            .single();

        const currentUserName = `${currentUserProfile?.first_name || ''} ${currentUserProfile?.last_name || ''}`.trim() || 'Jemand';

        const { data, error } = await supabase
            .rpc('send_friend_request', {
                current_user_id: currentUser.id,
                target_user_id: userId
            });

        if (error) throw error;

        // Nur für nicht-öffentliche Profile Benachrichtigung erstellen
        if (visibility !== 'public') {
            await createFollowRequestNotification(userId, currentUser.id, currentUserName);
        }

        await loadFollowerStats();
        await renderFollowButton();

        if (visibility === 'public') {
            await loadProfile();
        }

    } catch (error) {
        console.error('[ProfileView] Error following user:', error);
        alert('Fehler beim Folgen');
        await renderFollowButton();
    } finally {
        followInProgress = false;
    }
};

/** Entfolgt einem Benutzer */
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

        await loadFollowerStats();
        await renderFollowButton();
        await loadProfile();

    } catch (error) {
        console.error('[ProfileView] Error unfollowing user:', error);
        alert('Fehler beim Entfolgen');
    }
};

/** Bricht eine ausstehende Follow-Anfrage ab */
window.cancelFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

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

/** Nimmt eine Follow-Anfrage an */
window.acceptFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

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

        await createFollowAcceptedNotification(userId, currentUser.id, currentUserName);

        await loadFollowerStats();
        await renderFollowButton();

    } catch (error) {
        console.error('[ProfileView] Error accepting request:', error);
        alert('Fehler beim Annehmen');
    }
};

/** Lehnt eine Follow-Anfrage ab */
window.declineFollowRequest = async function(userId) {
    if (!currentUser) return;

    try {
        const supabase = getSupabase();

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
 * Rendert zusätzliche Sektionen für eigenes Profil (XP, Rang, Challenges, Anwesenheit)
 * Zeigt Dashboard-ähnliche Widgets im Fortschritt-Tab
 */
async function renderOwnProfileExtras(profile) {
    const supabase = getSupabase();

    const tabSwitcher = document.getElementById('profile-tab-switcher');
    if (tabSwitcher) {
        tabSwitcher.classList.remove('hidden');
    }

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

    const fortschrittContainer = document.getElementById('profile-content-fortschritt');
    if (!fortschrittContainer) return;

    const xp = profile.xp || 0;
    const elo = profile.elo_rating || 800;
    const points = profile.points || 0;
    const grundlagenCount = profile.grundlagen_completed || 0;

    const progress = getRankProgress(elo, xp, grundlagenCount);
    const { currentRank, nextRank, eloProgress, xpProgress, grundlagenProgress, eloNeeded, xpNeeded, grundlagenNeeded, isMaxRank } = progress;

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

            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">Dein Rang</h2>
                <div id="profile-rank-info">
                    ${rankProgressHtml}
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="bg-white rounded-xl shadow-sm p-4">
                    <h2 class="text-base font-semibold text-gray-700 mb-3">⚡ Skill-Rivale</h2>
                    <div id="profile-skill-rival" class="text-gray-500 text-sm">
                        <p>Lade Rivalen...</p>
                    </div>
                </div>
                <div class="bg-white rounded-xl shadow-sm p-4">
                    <h2 class="text-base font-semibold text-gray-700 mb-3">💪 Fleiß-Rivale</h2>
                    <div id="profile-effort-rival" class="text-gray-500 text-sm">
                        <p>Lade Rivalen...</p>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">Punkte-Historie</h2>
                <ul id="profile-points-history" class="space-y-2 max-h-48 overflow-y-auto text-sm">
                    <li class="text-gray-400">Lade Historie...</li>
                </ul>
            </div>

            <div class="bg-white rounded-xl shadow-sm p-4">
                <h2 class="text-base font-semibold text-gray-700 mb-3">Aktive Challenges</h2>
                <div id="profile-challenges" class="space-y-3">
                    <p class="text-gray-400 text-sm">Lade Challenges...</p>
                </div>
            </div>

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

    await Promise.all([
        loadProfileRivals(profile),
        loadProfilePointsHistory(),
        loadProfileChallenges(),
        loadProfileAttendance()
    ]);

    const oldExtras = document.getElementById('own-profile-extras');
    if (oldExtras) {
        oldExtras.classList.add('hidden');
    }
}

/** Lädt Rivalen-Daten für Fortschritt-Tab */
async function loadProfileRivals(profile) {
    const supabase = getSupabase();

    try {
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

        const myElo = profile.elo_rating || 800;
        const playersAboveElo = clubPlayers.filter(p => (p.elo_rating || 800) > myElo);
        playersAboveElo.sort((a, b) => (a.elo_rating || 800) - (b.elo_rating || 800));
        const skillRival = playersAboveElo[0];

        const myXp = profile.xp || 0;
        const playersAboveXp = clubPlayers.filter(p => (p.xp || 0) > myXp);
        playersAboveXp.sort((a, b) => (a.xp || 0) - (b.xp || 0));
        const effortRival = playersAboveXp[0];

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

/** Lädt Punkte-Historie für Fortschritt-Tab */
async function loadProfilePointsHistory() {
    const supabase = getSupabase();
    const container = document.getElementById('profile-points-history');
    if (!container) return;

    try {
        const { data: history } = await supabase
            .from('points_history')
            .select('*')
            .eq('user_id', profileId)
            .order('timestamp', { ascending: false })
            .limit(10);

        if (!history || history.length === 0) {
            container.innerHTML = '<li class="text-gray-400">Keine Einträge vorhanden</li>';
            return;
        }

        container.innerHTML = history.map(entry => {
            const date = new Date(entry.created_at || entry.timestamp).toLocaleDateString('de-DE');
            const reason = entry.reason || entry.description || 'Punkte';

            const points = entry.points || 0;
            const xp = entry.xp !== undefined ? entry.xp : points;
            const elo = entry.elo_change || 0;

            const getColorClass = (value) => {
                if (value > 0) return 'text-green-600';
                if (value < 0) return 'text-red-600';
                return 'text-gray-500';
            };

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

/** Lädt Challenges für Fortschritt-Tab */
async function loadProfileChallenges() {
    const supabase = getSupabase();
    const container = document.getElementById('profile-challenges');
    if (!container) return;

    try {
        const { data: completedChallenges, error } = await supabase
            .from('completed_challenges')
            .select(`
                id,
                completed_at,
                challenges (
                    id,
                    title,
                    description,
                    points
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
                            <span class="font-medium text-gray-800 text-sm">${escapeHtml(challenge.title)}</span>
                        </div>
                        <span class="text-xs text-green-600 font-semibold">+${challenge.points} Punkte</span>
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
 * Lädt Anwesenheitskalender basierend auf event_attendance
 * Zeigt nur Trainings wo der Spieler eingeladen war
 * Farben: grün = alle, gelb = teilweise, rot = keine Teilnahme
 * @param {number} displayYear - Jahr (optional, Standard: aktuelles Jahr)
 * @param {number} displayMonth - Monat 0-11 (optional, Standard: aktueller Monat)
 */
async function loadProfileAttendance(displayYear = null, displayMonth = null) {
    const container = document.getElementById('profile-attendance-calendar');
    if (!container) return;

    const supabase = getSupabase();
    const now = new Date();

    // Wenn keine Parameter, aktuellen Monat verwenden
    const year = displayYear !== null ? displayYear : now.getFullYear();
    const month = displayMonth !== null ? displayMonth : now.getMonth();

    // Aktuellen Anzeige-Monat speichern für Navigation
    window.profileCalendarDisplayMonth = { year, month };

    // Datumsstrings ohne Timezone-Probleme erstellen
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // Profil mit subgroup_ids laden
    const { data: profile } = await supabase
        .from('profiles')
        .select('club_id, subgroup_ids')
        .eq('id', profileId)
        .single();

    const clubId = profile?.club_id;
    const playerSubgroups = profile?.subgroup_ids || [];
    console.log('[ProfileView] Loading calendar for profile', profileId, 'club_id:', clubId);

    if (!clubId) {
        console.warn('[ProfileView] No clubId found for profile, cannot load events');
        return;
    }

    // Einladungen für diesen Spieler laden
    const { data: invitations } = await supabase
        .from('event_invitations')
        .select('event_id')
        .eq('user_id', profileId);

    const invitedEventIds = new Set((invitations || []).map(inv => inv.event_id));
    console.log('[ProfileView] Invited to events:', invitedEventIds.size);

    // Alle Club-Events laden
    const { data: clubEvents, error: eventsError } = await supabase
        .from('events')
        .select(`
            id,
            title,
            description,
            start_date,
            start_time,
            end_time,
            location,
            repeat_type,
            repeat_end_date,
            excluded_dates,
            event_category,
            target_type,
            target_subgroup_ids
        `)
        .eq('club_id', clubId);

    if (eventsError) {
        console.warn('[ProfileView] Error loading club events:', eventsError);
    }

    // Events filtern: Nur TRAININGS wo Spieler eingeladen ist ODER Teil der Zielgruppe
    const relevantEvents = (clubEvents || []).filter(event => {
        // NUR Trainings-Events anzeigen
        if (event.event_category !== 'training') return false;

        // Wenn eine Einladung existiert, ist der Spieler berechtigt
        if (invitedEventIds.has(event.id)) return true;

        // Fallback für alte Events ohne Einladungen: target_type prüfen
        if (event.target_type === 'club') return true;
        if (event.target_type === 'subgroups' && event.target_subgroup_ids) {
            return event.target_subgroup_ids.some(sgId => playerSubgroups.includes(sgId));
        }

        return false;
    });

    // Attendance aus BEIDEN Tabellen laden:
    // 1. event_attendance - für Events aus dem Event-System
    // 2. attendance - für reguläre Trainings aus dem Training-System

    let attendedEventIds = new Set();
    let attendedDates = new Set(); // Für reguläre Trainings (nach Datum)

    // 1. Event-Attendance laden
    if (relevantEvents.length > 0) {
        const eventIds = relevantEvents.map(e => e.id);

        const { data: eventAttendance, error: attendanceError } = await supabase
            .from('event_attendance')
            .select('*')
            .in('event_id', eventIds);

        if (attendanceError) {
            console.warn('[ProfileView] Error loading event attendance:', attendanceError);
        }

        if (eventAttendance) {
            eventAttendance.forEach(ea => {
                if (ea.present_user_ids?.includes(profileId)) {
                    attendedEventIds.add(ea.event_id);
                }
            });
        }
    }

    // 2. Reguläre Training-Attendance laden (aus attendance Tabelle)
    const { data: trainingAttendance, error: trainingAttError } = await supabase
        .from('attendance')
        .select('*')
        .eq('club_id', clubId)
        .gte('date', startDateStr)
        .lte('date', endDateStr);

    if (trainingAttError) {
        console.warn('[ProfileView] Error loading training attendance:', trainingAttError);
    }

    if (trainingAttendance) {
        trainingAttendance.forEach(ta => {
            // Try both possible column names
            const presentIds = ta.present_player_ids || ta.present_ids || ta.player_ids || [];
            if (presentIds?.includes(profileId)) {
                attendedDates.add(ta.date);
            }
        });
    }

    let allEventsForMonth = [];

    // Events im aktuellen Monat sammeln
    relevantEvents.forEach(event => {
        const eventDates = getEventDatesInRange(event, startDateStr, endDateStr);
        eventDates.forEach(dateStr => {
            allEventsForMonth.push({
                ...event,
                displayDate: dateStr
            });
        });
    });

    const eventsByDate = {};
    allEventsForMonth.forEach(event => {
        const dateKey = event.displayDate;
        if (!eventsByDate[dateKey]) {
            eventsByDate[dateKey] = [];
        }
        eventsByDate[dateKey].push(event);
    });

    window.profileCalendarEvents = eventsByDate;
    window.profileCalendarMonth = { year, month };

    const displayDate = new Date(year, month, 1);
    const monthName = displayDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const daysInMonth = lastDayOfMonth;
    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

    // Prüfen ob aktueller Monat angezeigt wird (für "Heute" Button)
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

    let calendarHtml = `
        <div class="flex items-center justify-between mb-3">
            <button onclick="navigateProfileCalendar(-1)" class="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
            </button>
            <div class="flex items-center gap-2">
                <h4 class="font-semibold text-gray-700">${monthName}</h4>
                ${!isCurrentMonth ? `<button onclick="navigateProfileCalendar(0)" class="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Heute</button>` : ''}
            </div>
            <button onclick="navigateProfileCalendar(1)" class="p-1 hover:bg-gray-100 rounded-full transition-colors">
                <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
            </button>
        </div>
        <div class="grid grid-cols-7 gap-1 text-xs">
            <div class="text-gray-400 font-medium py-1">Mo</div>
            <div class="text-gray-400 font-medium py-1">Di</div>
            <div class="text-gray-400 font-medium py-1">Mi</div>
            <div class="text-gray-400 font-medium py-1">Do</div>
            <div class="text-gray-400 font-medium py-1">Fr</div>
            <div class="text-gray-400 font-medium py-1">Sa</div>
            <div class="text-gray-400 font-medium py-1">So</div>
    `;

    for (let i = 0; i < startDayOfWeek; i++) {
        calendarHtml += '<div></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
        const dayEvents = eventsByDate[dateStr] || [];
        const hasEvents = dayEvents.length > 0;
        const eventCount = dayEvents.length;
        const isPastDay = new Date(dateStr) < new Date(now.toISOString().split('T')[0]);

        let attendedCount = 0;
        let totalForDay = 0;

        // Check attendance from event_attendance table (event-based)
        if (hasEvents) {
            dayEvents.forEach(event => {
                totalForDay++;
                if (attendedEventIds.has(event.id)) {
                    attendedCount++;
                }
            });
        }

        // Check attendance from attendance table (date-based regular trainings)
        if (attendedDates.has(dateStr)) {
            // If attended on this date via regular training attendance
            if (!hasEvents) {
                // No events but has attendance record - count as 1/1
                totalForDay = 1;
                attendedCount = 1;
            } else {
                // Has events AND attendance record - add the attendance
                attendedCount = Math.max(attendedCount, 1);
            }
        }

        let dayClass = '';
        const hasAttendanceData = hasEvents || attendedDates.has(dateStr);

        if (isPastDay && hasAttendanceData) {
            // Nur Farben, keine Icons
            if (attendedCount > 0 && attendedCount >= totalForDay) {
                dayClass = 'bg-green-500 text-white font-medium';
            } else if (attendedCount > 0) {
                dayClass = 'bg-yellow-400 text-white font-medium';
            } else if (totalForDay > 0) {
                dayClass = 'bg-red-500 text-white font-medium';
            }
            if (hasEvents) {
                dayClass += ' cursor-pointer hover:ring-2 hover:ring-gray-400 transition';
            }
        } else if (isToday) {
            dayClass = 'bg-indigo-100 text-indigo-700 font-bold';
        } else if (hasEvents && !isPastDay) {
            dayClass = 'cursor-pointer hover:ring-2 hover:ring-indigo-400 transition text-gray-600';
        } else {
            dayClass = 'text-gray-600';
        }

        let dotIndicator = '';
        if (hasEvents && !isPastDay) {
            dotIndicator = `<div class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${eventCount > 1 ? 'bg-indigo-500' : 'bg-indigo-300'}"></div>`;
        }

        calendarHtml += `
            <div class="aspect-square flex items-center justify-center rounded relative ${dayClass}"
                 ${hasEvents ? `onclick="showDayEvents('${dateStr}')"` : ''}>
                ${day}
                ${dotIndicator}
            </div>
        `;
    }

    calendarHtml += '</div>';

    // Count total attendances from both sources
    const totalEventAttendances = attendedEventIds.size;
    const totalDateAttendances = attendedDates.size;
    const totalAttendances = totalEventAttendances + totalDateAttendances;

    const todayStr = now.toISOString().split('T')[0];
    let pastEventsCount = 0;
    Object.keys(eventsByDate).forEach(dateStr => {
        if (dateStr < todayStr) {
            pastEventsCount += eventsByDate[dateStr].length;
        }
    });
    // Also count dates that have attendance records but no events
    attendedDates.forEach(dateStr => {
        if (dateStr < todayStr && !eventsByDate[dateStr]) {
            pastEventsCount++;
        }
    });

    const attendanceRate = pastEventsCount > 0 ? Math.round((totalAttendances / pastEventsCount) * 100) : 0;

    calendarHtml += `
        <div class="mt-4 text-center space-y-1">
            <div>
                <span class="text-green-600 font-semibold">${totalAttendances}/${pastEventsCount}</span>
                <span class="text-gray-500 text-sm">Anwesenheiten (${attendanceRate}%)</span>
            </div>
        </div>
    `;

    calendarHtml += `
        <div class="mt-3 flex flex-wrap justify-center gap-3 text-xs text-gray-500">
            <div class="flex items-center gap-1">
                <div class="w-4 h-4 rounded bg-green-500"></div>
                <span>Alle Trainings</span>
            </div>
            <div class="flex items-center gap-1">
                <div class="w-4 h-4 rounded bg-yellow-400"></div>
                <span>Teilweise</span>
            </div>
            <div class="flex items-center gap-1">
                <div class="w-4 h-4 rounded bg-red-500"></div>
                <span>Nicht da</span>
            </div>
            <div class="flex items-center gap-1">
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                <span>Geplant</span>
            </div>
        </div>
    `;

    // Streaks laden und anzeigen
    const { data: playerStreaks } = await supabase
        .from('streaks')
        .select('subgroup_id, current_streak, last_attendance_date')
        .eq('user_id', profileId);

    if (playerStreaks && playerStreaks.length > 0) {
        // Subgroup-Namen laden
        const subgroupIds = playerStreaks.map(s => s.subgroup_id);
        const { data: subgroups } = await supabase
            .from('subgroups')
            .select('id, name')
            .in('id', subgroupIds);

        const subgroupMap = new Map();
        (subgroups || []).forEach(sg => subgroupMap.set(sg.id, sg.name));

        calendarHtml += `
            <div class="mt-4 pt-4 border-t border-gray-200">
                <h5 class="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                    🔥 Aktuelle Streaks
                </h5>
                <div class="space-y-2">
        `;

        for (const streak of playerStreaks) {
            const subgroupName = subgroupMap.get(streak.subgroup_id) || 'Unbekannt';
            const streakCount = streak.current_streak || 0;

            // Streak-Styling basierend auf Höhe
            let streakBadgeClass = 'bg-gray-100 text-gray-600';
            let streakIcon = '';
            if (streakCount >= 5) {
                streakBadgeClass = 'bg-orange-100 text-orange-600';
                streakIcon = '🔥';
            } else if (streakCount >= 3) {
                streakBadgeClass = 'bg-yellow-100 text-yellow-600';
                streakIcon = '⚡';
            }

            calendarHtml += `
                <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600">${subgroupName}</span>
                    <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${streakBadgeClass}">
                        ${streakIcon} ${streakCount}x
                    </span>
                </div>
            `;
        }

        calendarHtml += `
                </div>
                <p class="text-xs text-gray-400 mt-2">
                    Ab 3x Streak: +2 Bonus | Ab 5x Streak: +3 Bonus
                </p>
            </div>
        `;
    }

    container.innerHTML = calendarHtml;
}

/**
 * Navigiert im Profil-Kalender vor/zurück
 * @param {number} direction - -1 für vorherigen Monat, 1 für nächsten Monat, 0 für aktuellen Monat
 */
window.navigateProfileCalendar = function(direction) {
    const now = new Date();

    if (direction === 0) {
        // Zum aktuellen Monat springen
        loadProfileAttendance(now.getFullYear(), now.getMonth());
        return;
    }

    // Aktuellen Anzeige-Monat holen
    const current = window.profileCalendarDisplayMonth || { year: now.getFullYear(), month: now.getMonth() };

    // Neuen Monat berechnen
    let newMonth = current.month + direction;
    let newYear = current.year;

    if (newMonth < 0) {
        newMonth = 11;
        newYear--;
    } else if (newMonth > 11) {
        newMonth = 0;
        newYear++;
    }

    // Kalender neu laden
    loadProfileAttendance(newYear, newMonth);
};

/** Liefert alle Termine eines Events innerhalb eines Datumsbereichs (für wiederkehrende Events) */
function getEventDatesInRange(event, startDate, endDate) {
    const dates = [];
    const eventStart = event.start_date;
    const repeatType = event.repeat_type;
    const repeatEnd = event.repeat_end_date;
    const excludedDates = event.excluded_dates || [];

    if (!repeatType || repeatType === 'none') {
        if (eventStart >= startDate && eventStart <= endDate) {
            dates.push(eventStart);
        }
        return dates;
    }

    let currentDate = new Date(eventStart + 'T12:00:00');
    const endDateObj = new Date(endDate + 'T12:00:00');
    const startDateObj = new Date(startDate + 'T12:00:00');
    const repeatEndObj = repeatEnd ? new Date(repeatEnd + 'T12:00:00') : null;
    let maxIterations = 100;

    while (currentDate <= endDateObj && maxIterations > 0) {
        const dateStr = currentDate.toISOString().split('T')[0];

        if (currentDate >= startDateObj && !excludedDates.includes(dateStr)) {
            if (!repeatEndObj || currentDate <= repeatEndObj) {
                dates.push(dateStr);
            }
        }

        switch (repeatType) {
            case 'daily':
                currentDate.setDate(currentDate.getDate() + 1);
                break;
            case 'weekly':
                currentDate.setDate(currentDate.getDate() + 7);
                break;
            case 'biweekly':
                currentDate.setDate(currentDate.getDate() + 14);
                break;
            case 'monthly':
                currentDate.setMonth(currentDate.getMonth() + 1);
                break;
            default:
                maxIterations = 0;
        }

        maxIterations--;
    }

    return dates;
}

/** Zeigt Events für einen bestimmten Tag in einem Modal */
window.showDayEvents = function(dateStr) {
    const events = window.profileCalendarEvents?.[dateStr] || [];
    if (events.length === 0) return;

    const dateObj = new Date(dateStr + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const eventsHtml = events.map(event => {
        const timeDisplay = event.start_time
            ? `${event.start_time.slice(0, 5)}${event.end_time ? ' - ' + event.end_time.slice(0, 5) : ''}`
            : '';

        let statusHtml = '';
        const now = new Date();
        const isRecurring = event.repeat_type && event.repeat_type !== 'none';

        let invitationSendAt = event.invitation_send_at ? new Date(event.invitation_send_at) : null;

        // Für wiederkehrende Events mit Vorlaufzeit: Sendezeit für diese Occurrence berechnen
        if (isRecurring && event.invitation_lead_time_value && event.invitation_lead_time_unit && event.displayDate) {
            const eventDateTime = new Date(`${event.displayDate}T${event.start_time || '12:00'}`);
            const sendDateTime = new Date(eventDateTime);

            switch (event.invitation_lead_time_unit) {
                case 'hours':
                    sendDateTime.setHours(sendDateTime.getHours() - event.invitation_lead_time_value);
                    break;
                case 'days':
                    sendDateTime.setDate(sendDateTime.getDate() - event.invitation_lead_time_value);
                    break;
                case 'weeks':
                    sendDateTime.setDate(sendDateTime.getDate() - (event.invitation_lead_time_value * 7));
                    break;
            }
            invitationSendAt = sendDateTime;
        }

        let responseButtonsHtml = '';
        const hasInvitation = event.invitationId && event.invitationStatus;
        const canRespond = hasInvitation || (invitationSendAt && invitationSendAt <= now);

        if (event.invitationStatus === 'accepted') {
            statusHtml = '<span class="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700"><i class="fas fa-check mr-1"></i>Zugesagt</span>';
            if (hasInvitation) {
                responseButtonsHtml = `
                    <button onclick="window.respondToEventFromCalendar('${event.invitationId}', 'rejected', '${event.occurrenceDate}')"
                            class="text-xs text-red-600 hover:text-red-800 font-medium">
                        Doch absagen
                    </button>
                `;
            }
        } else if (event.invitationStatus === 'rejected') {
            statusHtml = '<span class="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700"><i class="fas fa-times mr-1"></i>Abgesagt</span>';
            if (hasInvitation) {
                responseButtonsHtml = `
                    <button onclick="window.respondToEventFromCalendar('${event.invitationId}', 'accepted', '${event.occurrenceDate}')"
                            class="text-xs text-green-600 hover:text-green-800 font-medium">
                        Doch zusagen
                    </button>
                `;
            }
        } else if (event.invitationStatus === 'pending') {
            statusHtml = '<span class="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700"><i class="fas fa-clock mr-1"></i>Ausstehend</span>';
            if (hasInvitation) {
                responseButtonsHtml = `
                    <div class="flex gap-2">
                        <button onclick="window.respondToEventFromCalendar('${event.invitationId}', 'accepted', '${event.occurrenceDate}')"
                                class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors">
                            Zusagen
                        </button>
                        <button onclick="window.respondToEventFromCalendar('${event.invitationId}', 'rejected', '${event.occurrenceDate}')"
                                class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-medium rounded-lg transition-colors">
                            Absagen
                        </button>
                    </div>
                `;
            }
        } else if (invitationSendAt && invitationSendAt > now) {
            const sendDateStr = invitationSendAt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
            const sendTimeStr = invitationSendAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            statusHtml = `<span class="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"><i class="fas fa-paper-plane mr-1"></i>Einladung: ${sendDateStr}, ${sendTimeStr}</span>`;
        } else {
            statusHtml = '<span class="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500"><i class="fas fa-question mr-1"></i>Keine Einladung</span>';
        }

        let recurringHtml = '';
        if (isRecurring) {
            if (event.invitation_lead_time_value && event.invitation_lead_time_unit) {
                const unitText = event.invitation_lead_time_unit === 'hours' ? 'Std.' :
                                 event.invitation_lead_time_unit === 'days' ? 'Tage' : 'Wochen';
                recurringHtml = `<i class="fas fa-redo text-xs text-indigo-500 ml-1" title="Wiederkehrend (${event.invitation_lead_time_value} ${unitText} vorher)"></i>`;
            } else {
                recurringHtml = '<i class="fas fa-redo text-xs text-indigo-500 ml-1" title="Wiederkehrend"></i>';
            }
        }

        return `
            <div class="bg-white rounded-lg p-3 border border-gray-200 hover:shadow-sm transition" id="event-card-${event.id}-${event.occurrenceDate}">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <h4 class="font-semibold text-gray-900">
                            ${escapeHtml(event.title)}${recurringHtml}
                        </h4>
                        ${timeDisplay ? `<p class="text-sm text-gray-500 mt-1"><i class="far fa-clock mr-1"></i>${timeDisplay}</p>` : ''}
                        ${event.location ? `<p class="text-sm text-gray-500"><i class="fas fa-map-marker-alt mr-1"></i>${escapeHtml(event.location)}</p>` : ''}
                    </div>
                </div>
                <div class="mt-2 flex items-center justify-between">
                    ${statusHtml}
                    ${responseButtonsHtml}
                </div>
            </div>
        `;
    }).join('');

    const existingModal = document.getElementById('day-events-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'day-events-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div class="bg-gray-50 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div class="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-lg font-semibold">${formattedDate}</h3>
                    <button onclick="document.getElementById('day-events-modal').remove()" class="text-white/80 hover:text-white">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <p class="text-sm text-white/80 mt-1">${events.length} Veranstaltung${events.length !== 1 ? 'en' : ''}</p>
            </div>
            <div class="p-4 space-y-3 overflow-y-auto max-h-[60vh]">
                ${eventsHtml}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

/** Antwortet auf Event-Einladung aus dem Kalender-Modal */
window.respondToEventFromCalendar = async function(invitationId, status, occurrenceDate) {
    try {
        const { error } = await supabase
            .from('event_invitations')
            .update({
                status,
                response_at: new Date().toISOString()
            })
            .eq('id', invitationId);

        if (error) throw error;

        if (window.profileCalendarEvents && occurrenceDate) {
            const events = window.profileCalendarEvents[occurrenceDate];
            if (events) {
                events.forEach(event => {
                    if (event.invitationId === invitationId) {
                        event.invitationStatus = status;
                    }
                });
            }
        }

        const modal = document.getElementById('day-events-modal');
        if (modal) {
            modal.remove();
            window.showDayEvents(occurrenceDate);
        }

        const statusText = status === 'accepted' ? 'Zugesagt' : 'Abgesagt';
        showToast(`${statusText} für diesen Termin`, 'success');

    } catch (error) {
        console.error('[ProfileView] Error responding to event:', error);
        showToast('Fehler beim Antworten: ' + error.message, 'error');
    }
};

/** Zeigt einfache Toast-Benachrichtigung */
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.profile-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `profile-toast fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-xl z-[100] flex items-center gap-2 text-white transition-opacity duration-300 ${
        type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-indigo-600'
    }`;
    toast.style.opacity = '0';

    toast.innerHTML = `
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            ${type === 'success'
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
                : type === 'error'
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'}
        </svg>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/** Berechnet Rang aus XP (vereinfachte Version) */
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

/** Zeigt Fehlermeldung */
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProfileView);
} else {
    initProfileView();
}
