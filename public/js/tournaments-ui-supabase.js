// Tournaments UI Module - Supabase Version
// SC Champions - Tournament System UI Logic

import {
    initTournaments,
    createTournament,
    joinTournament,
    leaveTournament,
    deleteTournament,
    startTournament,
    regeneratePairings,
    getTournaments,
    getTournamentDetails,
    isParticipating,
    getTournamentFormatName,
    getTournamentStatusName,
    getCurrentUserId
} from './tournaments-supabase.js';

/**
 * Tournament UI Module
 * Handles all UI interactions for tournaments
 */

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const colors = {
        info: 'bg-indigo-600',
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600'
    };

    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let currentFilter = 'open'; // 'open', 'my', 'completed'
let selectedTournamentId = null;

/**
 * Initialize tournaments UI
 * @param {string} userId - Current user ID
 * @param {string} clubId - Current club ID
 * @param {string} sportId - Current sport ID
 */
export async function initTournamentsUI(userId, clubId, sportId) {
    console.log('[Tournaments UI] Initializing...');

    // Initialize tournament module
    initTournaments(userId, clubId, sportId);

    // Set up event listeners
    setupEventListeners();

    // Set initial active tab
    const openTab = document.getElementById('tournament-tab-open');
    if (openTab) {
        openTab.classList.remove('text-gray-400', 'border-transparent');
        openTab.classList.add('text-indigo-600', 'border-indigo-600');
    }

    // Load initial tournaments
    await loadTournaments();

    // Expose refresh functions for real-time updates
    window.tournamentUIRefresh = loadTournaments;
    window.refreshTournamentDetails = refreshTournamentDetailsView;

    console.log('[Tournaments UI] Initialized');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Create tournament button
    document.getElementById('create-tournament-btn')?.addEventListener('click', () => {
        openCreateTournamentModal();
    });

    // Join with code button
    document.getElementById('join-tournament-code-btn')?.addEventListener('click', () => {
        openJoinCodeModal();
    });

    // Create tournament form
    document.getElementById('create-tournament-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleCreateTournament();
    });

    // Join with code form
    document.getElementById('join-tournament-code-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleJoinWithCode();
    });

    // Close modals
    document.getElementById('close-create-tournament-modal')?.addEventListener('click', closeCreateTournamentModal);
    document.getElementById('cancel-create-tournament')?.addEventListener('click', closeCreateTournamentModal);

    document.getElementById('close-join-code-modal')?.addEventListener('click', closeJoinCodeModal);
    document.getElementById('cancel-join-code')?.addEventListener('click', closeJoinCodeModal);

    document.getElementById('close-tournament-details-modal')?.addEventListener('click', closeTournamentDetailsModal);

    // Tournament tabs
    document.getElementById('tournament-tab-open')?.addEventListener('click', () => switchTab('open'));
    document.getElementById('tournament-tab-my')?.addEventListener('click', () => switchTab('my'));
    document.getElementById('tournament-tab-completed')?.addEventListener('click', () => switchTab('completed'));
}

/**
 * Switch tournament filter tab (Strava Style)
 */
async function switchTab(filter) {
    currentFilter = filter;

    // Update tab styles - Strava style with indigo underline
    document.querySelectorAll('.tournament-tab-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-600');
        btn.classList.add('text-gray-400', 'border-transparent');
    });

    const activeTab = document.getElementById(`tournament-tab-${filter}`);
    if (activeTab) {
        activeTab.classList.remove('text-gray-400', 'border-transparent');
        activeTab.classList.add('text-indigo-600', 'border-indigo-600');
    }

    // Reload tournaments
    await loadTournaments();
}

/**
 * Load and display tournaments
 */
async function loadTournaments() {
    const list = document.getElementById('tournaments-list');
    if (!list) return;

    list.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">Lade Turniere...</p>';

    try {
        let tournaments = [];

        if (currentFilter === 'open') {
            // Show registration-open tournaments
            const allTournaments = await getTournaments('registration');
            tournaments = allTournaments.filter(t => t.is_open);
        } else if (currentFilter === 'my') {
            // Show tournaments the user is participating in (exclude completed)
            const allTournaments = await getTournaments();
            const myTournaments = [];
            for (const tournament of allTournaments) {
                // Exclude completed tournaments from "My Tournaments"
                if (tournament.status !== 'completed' && await isParticipating(tournament.id)) {
                    myTournaments.push(tournament);
                }
            }
            tournaments = myTournaments;
        } else if (currentFilter === 'completed') {
            // Show completed tournaments
            tournaments = await getTournaments('completed');
        }

        if (tournaments.length === 0) {
            list.innerHTML = '<p class="text-gray-400 text-center py-8 text-sm">Keine Turniere gefunden</p>';
            return;
        }

        list.innerHTML = tournaments.map(t => renderTournamentCard(t)).join('');

        // Add click listeners to tournament cards
        tournaments.forEach(t => {
            const card = document.getElementById(`tournament-card-${t.id}`);
            if (card) {
                card.addEventListener('click', () => openTournamentDetails(t.id));
            }
        });

    } catch (error) {
        console.error('[Tournaments UI] Error loading tournaments:', error);
        list.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden der Turniere</p>';
    }
}

/**
 * Render tournament card HTML
 */
function renderTournamentCard(tournament) {
    // Calculate actual participant count from the aggregated count or from participant_count field
    const participantCount = tournament.tournament_participants?.[0]?.count ?? tournament.participant_count ?? 0;
    const maxParticipants = tournament.max_participants;
    const percentFull = (participantCount / maxParticipants) * 100;
    const statusBadge = getStatusBadge(tournament.status);
    const formatName = getTournamentFormatName(tournament.format);

    return `
        <div
            id="tournament-card-${tournament.id}"
            class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
        >
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <h3 class="font-bold text-gray-800 mb-1">${escapeHtml(tournament.name)}</h3>
                    <p class="text-xs text-gray-600">${formatName}</p>
                </div>
                ${statusBadge}
            </div>

            <div class="flex items-center justify-between text-xs mt-3">
                <div class="flex items-center gap-3">
                    <span class="text-gray-700">
                        <i class="fas fa-users mr-1"></i>${participantCount}/${maxParticipants}
                    </span>
                    ${!tournament.is_open ? '<i class="fas fa-lock text-gray-500" title="Nur mit Code"></i>' : ''}
                    ${tournament.with_handicap ? '<i class="fas fa-balance-scale text-blue-500" title="Mit Handicap"></i>' : ''}
                </div>
                <div class="w-24 bg-gray-200 rounded-full h-2">
                    <div class="bg-indigo-600 h-2 rounded-full" style="width: ${percentFull}%"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
    const badges = {
        'draft': '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Entwurf</span>',
        'registration': '<span class="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">Anmeldung</span>',
        'in_progress': '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">Läuft</span>',
        'completed': '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Beendet</span>',
        'cancelled': '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">Abgebrochen</span>'
    };
    return badges[status] || '';
}

/**
 * Open create tournament modal
 */
function openCreateTournamentModal() {
    const modal = document.getElementById('create-tournament-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Reset form
        document.getElementById('create-tournament-form')?.reset();
    }
}

/**
 * Close create tournament modal
 */
function closeCreateTournamentModal() {
    const modal = document.getElementById('create-tournament-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Open join with code modal
 */
function openJoinCodeModal() {
    const modal = document.getElementById('join-tournament-code-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // Reset form
        document.getElementById('join-tournament-code-form')?.reset();
        document.getElementById('join-code-input')?.focus();
    }
}

/**
 * Close join code modal
 */
function closeJoinCodeModal() {
    const modal = document.getElementById('join-tournament-code-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Open tournament details modal
 */
async function openTournamentDetails(tournamentId) {
    selectedTournamentId = tournamentId;
    window.currentTournamentDetailsId = tournamentId; // Track for real-time updates

    const modal = document.getElementById('tournament-details-modal');
    const content = document.getElementById('tournament-details-content');

    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = '<p class="text-gray-500 text-center py-8">Lade Turnier-Details...</p>';

    try {
        const tournament = await getTournamentDetails(tournamentId);
        const participating = await isParticipating(tournamentId);

        content.innerHTML = renderTournamentDetails(tournament, participating);

        // Setup detail event listeners
        setupDetailEventListeners(tournament, participating);
    } catch (error) {
        console.error('[Tournaments UI] Error loading details:', error);
        content.innerHTML = '<p class="text-red-500 text-center py-8">Fehler beim Laden</p>';
    }
}

/**
 * Close tournament details modal
 */
function closeTournamentDetailsModal() {
    const modal = document.getElementById('tournament-details-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    selectedTournamentId = null;
    window.currentTournamentDetailsId = null; // Clear real-time tracking
}

/**
 * Refresh tournament details view (for real-time updates)
 */
async function refreshTournamentDetailsView(tournamentId) {
    if (!tournamentId || tournamentId !== window.currentTournamentDetailsId) return;

    console.log('[Tournaments UI] Refreshing tournament details:', tournamentId);

    const content = document.getElementById('tournament-details-content');
    if (!content) return;

    try {
        const tournament = await getTournamentDetails(tournamentId);
        const participating = await isParticipating(tournamentId);

        content.innerHTML = renderTournamentDetails(tournament, participating);

        // Re-setup event listeners
        setupDetailEventListeners(tournament, participating);
    } catch (error) {
        console.error('[Tournaments UI] Error refreshing details:', error);
    }
}

/**
 * Render tournament details HTML
 */
function renderTournamentDetails(tournament, participating) {
    const formatName = getTournamentFormatName(tournament.format);
    const statusName = getTournamentStatusName(tournament.status);
    const creatorName = tournament.created_by_profile?.display_name ||
                       `${tournament.created_by_profile?.first_name || ''} ${tournament.created_by_profile?.last_name || ''}`.trim();

    let html = `
        <div class="space-y-6">
            <!-- Winner Podium (only for completed tournaments) -->
            ${tournament.status === 'completed' && tournament.tournament_standings && tournament.tournament_standings.length > 0 ? `
                <div>
                    <h4 class="font-bold text-gray-800 mb-3 text-xl">🎉 Turnier Abgeschlossen!</h4>
                    ${renderWinnerPodium(tournament.tournament_standings)}
                </div>
            ` : ''}

            <!-- Tournament Info -->
            <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="font-bold text-gray-800 text-lg mb-3">${escapeHtml(tournament.name)}</h4>
                ${tournament.description ? `<p class="text-sm text-gray-600 mb-4">${escapeHtml(tournament.description)}</p>` : ''}

                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">Modus:</span>
                        <span class="font-medium ml-2">${formatName}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Status:</span>
                        <span class="font-medium ml-2">${statusName}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Teilnehmer:</span>
                        <span class="font-medium ml-2">${tournament.tournament_participants?.length || 0}/${tournament.max_participants}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Erstellt von:</span>
                        <span class="font-medium ml-2">${creatorName}</span>
                    </div>
                    ${tournament.with_handicap ? `
                    <div>
                        <span class="text-gray-600">Handicap:</span>
                        <span class="font-medium ml-2"><i class="fas fa-check text-green-500"></i> Aktiv</span>
                    </div>
                    ` : ''}
                    ${!tournament.is_open && tournament.join_code ? `
                    <div>
                        <span class="text-gray-600">Einladungscode:</span>
                        <span class="font-mono font-bold ml-2 text-indigo-600">${tournament.join_code}</span>
                    </div>
                    ` : ''}
                </div>

                <!-- Action Buttons -->
                <div class="mt-4 flex gap-2">
                    ${renderActionButtons(tournament, participating)}
                </div>
            </div>

            <!-- Participants -->
            <div>
                <h4 class="font-bold text-gray-800 mb-3"><i class="fas fa-users mr-2"></i>Teilnehmer</h4>
                ${renderParticipants(tournament.tournament_participants || [])}
            </div>

            <!-- Pairing Table (if matches are generated) -->
            ${tournament.tournament_matches && tournament.tournament_matches.length > 0 ? `
                <div>
                    <h4 class="font-bold text-gray-800 mb-3"><i class="fas fa-chess-board mr-2"></i>Spielpaarungen</h4>
                    ${renderPairingTable(tournament.tournament_participants || [], tournament.tournament_matches || [])}
                </div>
            ` : ''}

            <!-- Standings (if tournament is in progress or completed) -->
            ${tournament.status === 'in_progress' || tournament.status === 'completed' ? `
                <div>
                    <h4 class="font-bold text-gray-800 mb-3"><i class="fas fa-table mr-2"></i>Tabelle</h4>
                    ${renderStandings(tournament.tournament_standings || [])}
                </div>
            ` : ''}

            <!-- Matches (if generated) -->
            ${tournament.tournament_matches && tournament.tournament_matches.length > 0 ? `
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="font-bold text-gray-800"><i class="fas fa-table-tennis-paddle-ball mr-2"></i>Spiele</h4>
                        ${tournament.status === 'in_progress' ? `
                            <button id="quick-match-entry-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-1.5 px-3 rounded-lg font-medium">
                                <i class="fas fa-bolt mr-1"></i>Match eintragen
                            </button>
                        ` : ''}
                    </div>
                    ${renderMatches(tournament.tournament_matches || [])}
                </div>
            ` : ''}
        </div>
    `;

    return html;
}

/**
 * Render action buttons
 */
function renderActionButtons(tournament, participating) {
    const isCreator = tournament.created_by === getCurrentUserId();

    let buttons = [];

    if (tournament.status === 'registration') {
        if (!participating) {
            buttons.push(`
                <button id="join-tournament-btn" class="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg font-medium">
                    <i class="fas fa-sign-in-alt mr-2"></i>Beitreten
                </button>
            `);
        } else {
            buttons.push(`
                <button id="leave-tournament-btn" class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium">
                    <i class="fas fa-sign-out-alt mr-2"></i>Verlassen
                </button>
            `);
        }

        const actualParticipantCount = tournament.tournament_participants?.length || 0;
        if (isCreator && actualParticipantCount >= 2) {
            buttons.push(`
                <button id="start-tournament-btn" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium">
                    <i class="fas fa-play mr-2"></i>Turnier starten
                </button>
            `);
        }

        // Delete button for creator (only during registration)
        if (isCreator) {
            buttons.push(`
                <button id="delete-tournament-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg font-medium">
                    <i class="fas fa-trash mr-2"></i>Löschen
                </button>
            `);
        }
    }

    // Regenerate pairings button for creator during in_progress (for testing)
    if (tournament.status === 'in_progress' && isCreator) {
        buttons.push(`
            <button id="regenerate-pairings-btn" class="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg font-medium">
                <i class="fas fa-sync-alt mr-2"></i>Paarungen neu generieren (Test)
            </button>
        `);
    }

    return buttons.join('');
}

/**
 * Render participants list
 */
function renderParticipants(participants) {
    if (participants.length === 0) {
        return '<p class="text-gray-400 text-sm">Noch keine Teilnehmer</p>';
    }

    // Sort by seed if available, otherwise by ELO
    const sorted = [...participants].sort((a, b) => {
        // If both have seeds, sort by seed
        if (a.seed && b.seed) {
            return a.seed - b.seed;
        }
        // If no seeds, sort by ELO (highest first)
        const eloA = a.elo_at_registration || a.profile?.elo_rating || 800;
        const eloB = b.elo_at_registration || b.profile?.elo_rating || 800;
        return eloB - eloA; // Descending (highest ELO first)
    });

    return `
        <div class="space-y-2">
            ${sorted.map(p => {
                const name = p.profile?.display_name ||
                           `${p.profile?.first_name || ''} ${p.profile?.last_name || ''}`.trim() ||
                           'Unbekannt';
                const elo = p.elo_at_registration || p.profile?.elo_rating || 800;
                const seed = p.seed || '-';

                return `
                    <div class="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                        <div class="flex items-center gap-3">
                            <span class="font-bold text-gray-500 w-6">#${seed}</span>
                            <span class="font-medium text-gray-800">${name}</span>
                        </div>
                        <span class="text-sm text-gray-600">Elo: ${elo}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * Render pairing table (who plays whom in each round)
 */
function renderPairingTable(participants, matches) {
    if (participants.length === 0 || matches.length === 0) {
        return '<p class="text-gray-400 text-sm">Keine Paarungen verfügbar</p>';
    }

    // Get number of rounds
    const maxRound = Math.max(...matches.map(m => m.round_number || 1));
    const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);

    // Create a lookup: participantId -> round -> opponentName
    // Also track which round each player has a bye
    const pairings = {};
    const byeRounds = {}; // playerId -> round number where they have bye

    participants.forEach(p => {
        pairings[p.player_id] = {};
        byeRounds[p.player_id] = null;
    });

    matches.forEach(match => {
        const round = match.round_number || 1;
        const playerAId = match.player_a_id;
        const playerBId = match.player_b_id;

        // Get player names
        const playerAName = match.player_a?.display_name ||
                           `${match.player_a?.first_name || ''} ${match.player_a?.last_name || ''}`.trim() ||
                           'TBD';
        const playerBName = match.player_b?.display_name ||
                           `${match.player_b?.first_name || ''} ${match.player_b?.last_name || ''}`.trim() ||
                           'TBD';

        // If it's a bye (one player is null), mark as "Freilos"
        if (!playerBId) {
            if (pairings[playerAId]) {
                pairings[playerAId][round] = 'Freilos';
                byeRounds[playerAId] = round; // Track bye round for sorting
            }
        } else {
            // Normal match - both players face each other
            if (pairings[playerAId]) {
                pairings[playerAId][round] = playerBName;
            }
            if (pairings[playerBId]) {
                pairings[playerBId][round] = playerAName;
            }
        }
    });

    // Sort participants by their bye round (for diagonal display)
    // If no bye, sort by seed
    const sortedParticipants = [...participants].sort((a, b) => {
        const byeA = byeRounds[a.player_id];
        const byeB = byeRounds[b.player_id];

        // If both have byes, sort by bye round (diagonal effect)
        if (byeA !== null && byeB !== null) {
            return byeA - byeB;
        }

        // If only one has bye, that one comes first
        if (byeA !== null) return -1;
        if (byeB !== null) return 1;

        // If neither has bye, sort by seed
        return (a.seed || 999) - (b.seed || 999);
    });

    return `
        <div class="overflow-x-auto">
            <table class="w-full text-xs border-collapse">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="px-2 py-2 text-left border border-gray-300 sticky left-0 bg-gray-100 z-10">Spieler</th>
                        ${rounds.map(r => `
                            <th class="px-2 py-2 text-center border border-gray-300 whitespace-nowrap">
                                Runde ${r}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${sortedParticipants.map(p => {
                        const name = p.profile?.display_name ||
                                   `${p.profile?.first_name || ''} ${p.profile?.last_name || ''}`.trim() ||
                                   'Unbekannt';
                        const seed = p.seed || '-';

                        return `
                            <tr class="bg-white hover:bg-gray-50">
                                <td class="px-2 py-2 border border-gray-300 sticky left-0 bg-white font-medium whitespace-nowrap">
                                    <span class="text-gray-500 mr-1">#${seed}</span>${name}
                                </td>
                                ${rounds.map(round => {
                                    const opponent = pairings[p.player_id]?.[round] || '-';
                                    const isBye = opponent === 'Freilos';
                                    return `
                                        <td class="px-2 py-2 text-center border border-gray-300 ${isBye ? 'bg-gray-50 text-gray-400 italic' : ''}">
                                            ${opponent}
                                        </td>
                                    `;
                                }).join('')}
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render standings table
 */
function renderStandings(standings) {
    if (standings.length === 0) {
        return '<p class="text-gray-400 text-sm">Noch keine Ergebnisse</p>';
    }

    return `
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-gray-100">
                    <tr>
                        <th class="px-3 py-2 text-left">#</th>
                        <th class="px-3 py-2 text-left">Spieler</th>
                        <th class="px-3 py-2 text-center">Sp</th>
                        <th class="px-3 py-2 text-center">S</th>
                        <th class="px-3 py-2 text-center">N</th>
                        <th class="px-3 py-2 text-center">Sätze</th>
                        <th class="px-3 py-2 text-center">Pkt</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                    ${standings.map(s => {
                        const name = s.profile?.display_name ||
                                   `${s.profile?.first_name || ''} ${s.profile?.last_name || ''}`.trim() ||
                                   'Unbekannt';
                        return `
                            <tr class="${s.rank === 1 ? 'bg-yellow-50 font-semibold' : 'bg-white'}">
                                <td class="px-3 py-2">${s.rank || '-'}</td>
                                <td class="px-3 py-2">${name}</td>
                                <td class="px-3 py-2 text-center">${s.matches_played || 0}</td>
                                <td class="px-3 py-2 text-center text-green-600">${s.matches_won || 0}</td>
                                <td class="px-3 py-2 text-center text-red-600">${s.matches_lost || 0}</td>
                                <td class="px-3 py-2 text-center">${s.sets_won || 0}:${s.sets_lost || 0}</td>
                                <td class="px-3 py-2 text-center font-bold">${s.tournament_points || 0}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render winner podium for completed tournaments
 */
function renderWinnerPodium(standings) {
    if (!standings || standings.length === 0) {
        return '<p class="text-gray-400 text-sm">Keine Ergebnisse verfügbar</p>';
    }

    // Get top 3
    const top3 = standings.filter(s => s.rank && s.rank <= 3).sort((a, b) => a.rank - b.rank);

    if (top3.length === 0) {
        return '<p class="text-gray-400 text-sm">Keine Ergebnisse verfügbar</p>';
    }

    const winner = top3[0];
    const second = top3[1];
    const third = top3[2];

    const getPlayerName = (s) => {
        return s?.profile?.display_name ||
               `${s?.profile?.first_name || ''} ${s?.profile?.last_name || ''}`.trim() ||
               'Unbekannt';
    };

    return `
        <div class="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-6">
            <!-- Winner -->
            <div class="text-center mb-6">
                <div class="inline-block">
                    <div class="text-6xl mb-2">🏆</div>
                    <h3 class="text-2xl font-bold text-yellow-700 mb-1">Gewinner</h3>
                    <p class="text-3xl font-black text-gray-800">${getPlayerName(winner)}</p>
                    <p class="text-sm text-gray-600 mt-1">
                        ${winner.matches_won || 0} Siege • ${winner.tournament_points || 0} Punkte
                    </p>
                </div>
            </div>

            <!-- Top 3 Podium -->
            ${top3.length > 1 ? `
                <div class="grid grid-cols-${top3.length === 3 ? '3' : '2'} gap-4">
                    ${second ? `
                        <div class="text-center bg-white bg-opacity-50 rounded-lg p-4 ${top3.length === 3 ? 'order-1' : ''}">
                            <div class="text-4xl mb-2">🥈</div>
                            <p class="text-xs text-gray-600 font-semibold">2. Platz</p>
                            <p class="font-bold text-gray-800">${getPlayerName(second)}</p>
                            <p class="text-xs text-gray-600">${second.tournament_points || 0} Pkt</p>
                        </div>
                    ` : ''}

                    ${third ? `
                        <div class="text-center bg-white bg-opacity-50 rounded-lg p-4 order-3">
                            <div class="text-4xl mb-2">🥉</div>
                            <p class="text-xs text-gray-600 font-semibold">3. Platz</p>
                            <p class="font-bold text-gray-800">${getPlayerName(third)}</p>
                            <p class="text-xs text-gray-600">${third.tournament_points || 0} Pkt</p>
                        </div>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * Render matches list
 */
function renderMatches(matches) {
    if (matches.length === 0) {
        return '<p class="text-gray-400 text-sm">Noch keine Spiele generiert</p>';
    }

    // Group ALL matches by round number (including byes)
    const matchesByRound = {};
    matches.forEach(match => {
        const round = match.round_number || 1;
        if (!matchesByRound[round]) {
            matchesByRound[round] = [];
        }
        matchesByRound[round].push(match);
    });

    const rounds = Object.keys(matchesByRound).sort((a, b) => parseInt(a) - parseInt(b));

    let html = '';

    rounds.forEach(round => {
        const roundMatches = matchesByRound[round];
        // Separate actual matches from byes
        const actualMatches = roundMatches.filter(m => m.player_b_id !== null);
        const byeMatches = roundMatches.filter(m => m.player_b_id === null);

        const pending = actualMatches.filter(m => m.status === 'pending');
        const completed = actualMatches.filter(m => m.status === 'completed');
        const total = actualMatches.length;

        html += `
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <h5 class="text-sm font-semibold text-gray-700">
                        <i class="fas fa-layer-group mr-1"></i>Runde ${round}
                    </h5>
                    <span class="text-xs text-gray-500">${completed.length}/${total} abgeschlossen</span>
                </div>
                <div class="space-y-2">
                    ${actualMatches.map(m => renderMatchCard(m)).join('')}
                    ${byeMatches.map(m => renderByeCard(m)).join('')}
                </div>
            </div>
        `;
    });

    return html;
}

/**
 * Render single match card
 */
function renderMatchCard(match) {
    const playerA = match.player_a?.display_name ||
                   `${match.player_a?.first_name || ''} ${match.player_a?.last_name || ''}`.trim() ||
                   'TBD';
    const playerB = match.player_b?.display_name ||
                   `${match.player_b?.first_name || ''} ${match.player_b?.last_name || ''}`.trim() ||
                   'TBD';

    const isCompleted = match.status === 'completed';
    const setsA = match.player_a_sets_won || 0;
    const setsB = match.player_b_sets_won || 0;
    const winnerId = match.winner_id;

    return `
        <div class="bg-white border border-gray-200 rounded-lg p-3">
            <div class="flex items-center justify-between">
                <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="${winnerId === match.player_a_id ? 'font-bold text-gray-900' : 'text-gray-700'}">${playerA}</span>
                        ${isCompleted ? `<span class="text-sm font-mono">${setsA}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="${winnerId === match.player_b_id ? 'font-bold text-gray-900' : 'text-gray-700'}">${playerB}</span>
                        ${isCompleted ? `<span class="text-sm font-mono">${setsB}</span>` : ''}
                    </div>
                </div>
                ${isCompleted ?
                    '<span class="text-xs text-gray-500"><i class="fas fa-check text-green-500 mr-1"></i>Gespielt</span>' :
                    '<span class="text-xs text-gray-500"><i class="fas fa-clock text-yellow-500 mr-1"></i>Ausstehend</span>'
                }
            </div>
        </div>
    `;
}

/**
 * Render bye card (player has a bye this round)
 */
function renderByeCard(match) {
    const player = match.player_a?.display_name ||
                  `${match.player_a?.first_name || ''} ${match.player_a?.last_name || ''}`.trim() ||
                  'Unbekannt';

    return `
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-coffee text-gray-400"></i>
                    <span class="text-gray-700">${player}</span>
                </div>
                <span class="text-xs text-gray-500 italic">Freilos</span>
            </div>
        </div>
    `;
}

/**
 * Setup event listeners for detail modal
 */
function setupDetailEventListeners(tournament, participating) {
    // Join button
    const joinBtn = document.getElementById('join-tournament-btn');
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            try {
                await joinTournament(tournament.id);
                await openTournamentDetails(tournament.id); // Reload
                await loadTournaments(); // Refresh list
            } catch (error) {
                // Error already shown by joinTournament
            }
        });
    }

    // Leave button
    const leaveBtn = document.getElementById('leave-tournament-btn');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', async () => {
            if (confirm('Möchtest du dieses Turnier wirklich verlassen?')) {
                try {
                    await leaveTournament(tournament.id);
                    closeTournamentDetailsModal();
                    await loadTournaments(); // Refresh list
                } catch (error) {
                    // Error already shown
                }
            }
        });
    }

    // Start tournament button
    const startBtn = document.getElementById('start-tournament-btn');
    if (startBtn) {
        startBtn.addEventListener('click', async () => {
            if (confirm('Turnier jetzt starten? Danach können keine weiteren Spieler beitreten.')) {
                try {
                    await startTournament(tournament.id);
                    await openTournamentDetails(tournament.id); // Reload
                    await loadTournaments(); // Refresh list
                } catch (error) {
                    // Error already shown
                }
            }
        });
    }

    // Delete tournament button
    const deleteBtn = document.getElementById('delete-tournament-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (confirm('Turnier wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
                try {
                    await deleteTournament(tournament.id);
                    closeTournamentDetailsModal();
                    await loadTournaments(); // Refresh list
                } catch (error) {
                    // Error already shown
                }
            }
        });
    }

    // Regenerate pairings button (for testing)
    const regenerateBtn = document.getElementById('regenerate-pairings-btn');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', async () => {
            if (confirm('Paarungen neu generieren? Alle bisherigen Matches und Ergebnisse werden gelöscht!')) {
                try {
                    await regeneratePairings(tournament.id);
                    await openTournamentDetails(tournament.id); // Reload
                    await loadTournaments(); // Refresh list
                } catch (error) {
                    // Error already shown
                }
            }
        });
    }

    // Quick match entry button
    const quickMatchBtn = document.getElementById('quick-match-entry-btn');
    if (quickMatchBtn) {
        quickMatchBtn.addEventListener('click', () => {
            openQuickMatchEntryModal(tournament);
        });
    }
}

/**
 * Handle create tournament form submission
 */
async function handleCreateTournament() {
    const name = document.getElementById('tournament-name')?.value;
    const description = document.getElementById('tournament-description')?.value;
    const format = document.getElementById('tournament-format')?.value;
    const maxParticipants = parseInt(document.getElementById('tournament-max-participants')?.value || '8');
    const accessType = document.querySelector('input[name="tournament-access"]:checked')?.value;
    const isOpen = accessType === 'open';
    const visibilityType = document.querySelector('input[name="tournament-visibility"]:checked')?.value;
    const isClubOnly = visibilityType === 'club';
    const withHandicap = document.getElementById('tournament-handicap')?.checked || false;

    try {
        const tournament = await createTournament({
            name,
            description,
            format,
            maxParticipants,
            isOpen,
            isClubOnly,
            withHandicap
        });

        closeCreateTournamentModal();
        await loadTournaments();

        // Auto-join creator
        await joinTournament(tournament.id);

        // Show details
        await openTournamentDetails(tournament.id);
    } catch (error) {
        // Error already shown by createTournament
    }
}

/**
 * Handle join with code form submission
 */
async function handleJoinWithCode() {
    const code = document.getElementById('join-code-input')?.value.toUpperCase();

    if (!code || code.length !== 6) {
        showToast('Bitte gib einen gültigen 6-stelligen Code ein', 'error');
        return;
    }

    try {
        // Find tournament by code
        const allTournaments = await getTournaments();
        const tournament = allTournaments.find(t => t.join_code === code);

        if (!tournament) {
            showToast('Ungültiger Einladungscode', 'error');
            return;
        }

        await joinTournament(tournament.id, code);

        closeJoinCodeModal();
        await loadTournaments();
        await openTournamentDetails(tournament.id);
    } catch (error) {
        // Error already shown
    }
}

/**
 * Open quick match entry modal for tournament matches
 */
function openQuickMatchEntryModal(tournament) {
    // Get pending matches
    const pendingMatches = (tournament.tournament_matches || []).filter(m => m.status === 'pending');

    if (pendingMatches.length === 0) {
        showToast('Keine offenen Matches verfügbar', 'info');
        return;
    }

    // Create modal HTML
    const modalHTML = `
        <div id="quick-match-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div class="p-6">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-xl font-bold text-gray-800">
                            <i class="fas fa-bolt text-indigo-600 mr-2"></i>Match eintragen
                        </h3>
                        <button id="close-quick-match-modal" class="text-gray-400 hover:text-gray-600">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Match auswählen</label>
                        <select id="quick-match-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                            <option value="">-- Bitte wählen --</option>
                            ${pendingMatches.map(m => {
                                const playerA = m.player_a?.display_name ||
                                              `${m.player_a?.first_name || ''} ${m.player_a?.last_name || ''}`.trim() ||
                                              'Spieler A';
                                const playerB = m.player_b?.display_name ||
                                              `${m.player_b?.first_name || ''} ${m.player_b?.last_name || ''}`.trim() ||
                                              'Freilos';
                                return `<option value="${m.id}" data-player-a-id="${m.player_a_id}" data-player-b-id="${m.player_b_id || ''}">
                                    Runde ${m.round_number}: ${playerA} vs ${playerB}
                                </option>`;
                            }).join('')}
                        </select>
                    </div>

                    <div id="quick-match-form" class="hidden">
                        <div class="mb-4">
                            <label class="block text-sm font-medium text-gray-700 mb-2">Ergebnis (Sätze)</label>
                            <div class="grid grid-cols-3 gap-2 items-center">
                                <div>
                                    <input type="number" id="quick-sets-a" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center"
                                           placeholder="0">
                                    <div id="quick-player-a-name" class="text-xs text-gray-600 mt-1 text-center"></div>
                                </div>
                                <div class="text-center text-gray-400 font-bold">:</div>
                                <div>
                                    <input type="number" id="quick-sets-b" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center"
                                           placeholder="0">
                                    <div id="quick-player-b-name" class="text-xs text-gray-600 mt-1 text-center"></div>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-2">
                            <button id="cancel-quick-match" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">
                                Abbrechen
                            </button>
                            <button id="submit-quick-match" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium">
                                Speichern
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Insert modal into DOM
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup event listeners
    const modal = document.getElementById('quick-match-modal');
    const matchSelect = document.getElementById('quick-match-select');
    const matchForm = document.getElementById('quick-match-form');
    const closeBtn = document.getElementById('close-quick-match-modal');
    const cancelBtn = document.getElementById('cancel-quick-match');
    const submitBtn = document.getElementById('submit-quick-match');
    const setsAInput = document.getElementById('quick-sets-a');
    const setsBInput = document.getElementById('quick-sets-b');
    const playerAName = document.getElementById('quick-player-a-name');
    const playerBName = document.getElementById('quick-player-b-name');

    let selectedMatch = null;

    // Match selection
    matchSelect.addEventListener('change', () => {
        const matchId = matchSelect.value;
        if (matchId) {
            selectedMatch = pendingMatches.find(m => m.id === matchId);
            const option = matchSelect.selectedOptions[0];

            const playerA = selectedMatch.player_a?.display_name ||
                          `${selectedMatch.player_a?.first_name || ''} ${selectedMatch.player_a?.last_name || ''}`.trim();
            const playerB = selectedMatch.player_b?.display_name ||
                          `${selectedMatch.player_b?.first_name || ''} ${selectedMatch.player_b?.last_name || ''}`.trim() ||
                          'Freilos';

            playerAName.textContent = playerA;
            playerBName.textContent = playerB;

            matchForm.classList.remove('hidden');
        } else {
            matchForm.classList.add('hidden');
        }
    });

    // Close modal
    const closeModal = () => {
        modal.remove();
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Submit match
    submitBtn.addEventListener('click', async () => {
        if (!selectedMatch) return;

        const setsA = parseInt(setsAInput.value) || 0;
        const setsB = parseInt(setsBInput.value) || 0;

        if (setsA === 0 && setsB === 0) {
            showToast('Bitte Satzergebnis eingeben', 'error');
            return;
        }

        if (setsA === setsB) {
            showToast('Unentschieden nicht möglich', 'error');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Speichere...';

        try {
            const winnerId = setsA > setsB ? selectedMatch.player_a_id : selectedMatch.player_b_id;
            const loserId = setsA > setsB ? selectedMatch.player_b_id : selectedMatch.player_a_id;

            // Import recordTournamentMatchResult dynamically
            const { recordTournamentMatchResult } = await import('./tournaments-supabase.js');
            const { getSupabase } = await import('./supabase-init.js');
            const supabase = getSupabase();

            // Create match in matches table
            const { data: match, error: matchError } = await supabase
                .from('matches')
                .insert({
                    player_a_id: selectedMatch.player_a_id,
                    player_b_id: selectedMatch.player_b_id,
                    winner_id: winnerId,
                    loser_id: loserId,
                    player_a_sets_won: setsA,
                    player_b_sets_won: setsB,
                    sets: [], // Simplified - no detailed set scores
                    club_id: tournament.club_id,
                    created_by: getCurrentUserId(),
                    sport_id: tournament.sport_id,
                    played_at: new Date().toISOString(),
                    match_mode: 'best-of-5',
                    handicap_used: false
                })
                .select()
                .single();

            if (matchError) throw matchError;

            // Link to tournament match
            await recordTournamentMatchResult(selectedMatch.id, match.id);

            showToast('Match erfolgreich eingetragen!', 'success');
            closeModal();

            // Reload tournament details
            await openTournamentDetails(tournament.id);
        } catch (error) {
            console.error('[Tournaments UI] Error saving quick match:', error);
            showToast('Fehler beim Speichern: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Speichern';
        }
    });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export default {
    initTournamentsUI,
    loadTournaments
};
