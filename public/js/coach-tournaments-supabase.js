// Coach Tournaments Module - Supabase Version
// SC Champions - Tournament Management for Coaches/Head Coaches
// Coaches can create, manage tournaments and add club members + offline players

import {
    initTournaments, createTournament, deleteTournament, startTournament,
    regeneratePairings, getTournaments, getTournamentDetails,
    getTournamentFormatName, getTournamentStatusName, getCurrentUserId,
    recordTournamentMatchResult
} from './tournaments-supabase.js';

import { escapeHtml } from './utils/security.js';
import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

let currentFilter = 'open';
let selectedTournamentId = null;
let clubPlayersCache = [];
let coachUserData = null;

function showToast(message, type = 'info') {
    const colors = { info: 'bg-indigo-600', success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600' };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('opacity-0', 'transition-opacity'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function getMatchModeName(mode) {
    const names = { 'best-of-5': 'Best of 5', 'best-of-3': 'Best of 3', 'best-of-7': 'Best of 7', 'single-set': '1 Satz' };
    return names[mode] || mode || 'Best of 5';
}

function getMaxSets(mode) {
    const map = { 'best-of-5': 5, 'best-of-3': 3, 'best-of-7': 7, 'single-set': 1 };
    return map[mode] || 5;
}

function getSetsToWin(mode) {
    const map = { 'best-of-5': 3, 'best-of-3': 2, 'best-of-7': 4, 'single-set': 1 };
    return map[mode] || 3;
}

/**
 * Initialize the coach tournament UI
 */
export function initCoachTournamentsUI(userData, clubPlayers) {
    console.log('[Coach Tournaments] Initializing...');
    coachUserData = userData;
    clubPlayersCache = clubPlayers || [];

    initTournaments(userData.id, userData.clubId, userData.activeSportId);
    setupCoachTournamentEventListeners();
    setupCoachMatchesSubTabs();

    // Set default active tab to "Aktiv" (my tournaments)
    const myTab = document.getElementById('coach-tournament-tab-my');
    if (myTab) {
        myTab.classList.remove('text-gray-400', 'border-transparent');
        myTab.classList.add('text-indigo-600', 'border-indigo-600');
    }
    // Also switch the filter to 'my' on init
    switchTab('my');
}

/**
 * Update the cached club players list (called when players change)
 */
export function updateCoachTournamentPlayers(players) {
    clubPlayersCache = players || [];
}

function setupCoachMatchesSubTabs() {
    const subTabs = document.querySelectorAll('.coach-matches-sub-tab');
    const wettkampfContent = document.getElementById('coach-matches-subtab-wettkampf');
    const turniereContent = document.getElementById('coach-matches-subtab-turniere');

    subTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.subtab;

            subTabs.forEach(t => {
                t.classList.remove('border-indigo-600', 'text-indigo-600');
                t.classList.add('border-transparent', 'text-gray-500');
            });
            tab.classList.remove('border-transparent', 'text-gray-500');
            tab.classList.add('border-indigo-600', 'text-indigo-600');

            if (target === 'wettkampf') {
                wettkampfContent?.classList.remove('hidden');
                turniereContent?.classList.add('hidden');
            } else if (target === 'turniere') {
                wettkampfContent?.classList.add('hidden');
                turniereContent?.classList.remove('hidden');
                loadCoachTournaments();
            }
        });
    });
}

function setupCoachTournamentEventListeners() {
    // Create tournament
    document.getElementById('coach-create-tournament-btn')?.addEventListener('click', openCreateModal);
    document.getElementById('coach-create-tournament-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleCreateTournament();
    });
    document.getElementById('close-coach-create-tournament-modal')?.addEventListener('click', closeCreateModal);
    document.getElementById('cancel-coach-create-tournament')?.addEventListener('click', closeCreateModal);

    // Details modal
    document.getElementById('close-coach-tournament-details-modal')?.addEventListener('click', closeDetailsModal);

    // Add players modal
    document.getElementById('close-coach-tournament-add-players')?.addEventListener('click', closeAddPlayersModal);
    document.getElementById('cancel-coach-tournament-add-players')?.addEventListener('click', closeAddPlayersModal);
    document.getElementById('confirm-coach-tournament-add-players')?.addEventListener('click', handleConfirmAddPlayers);

    // Player search
    document.getElementById('coach-tournament-player-search')?.addEventListener('input', handlePlayerSearch);

    // Quick create offline player toggle
    document.getElementById('coach-tournament-toggle-quick-create')?.addEventListener('click', toggleQuickCreateForm);
    document.getElementById('coach-tournament-create-offline-player')?.addEventListener('click', handleQuickCreateOfflinePlayer);

    // Filter tabs
    document.getElementById('coach-tournament-tab-open')?.addEventListener('click', () => switchTab('open'));
    document.getElementById('coach-tournament-tab-my')?.addEventListener('click', () => switchTab('my'));
    document.getElementById('coach-tournament-tab-completed')?.addEventListener('click', () => switchTab('completed'));
}

function openCreateModal() {
    const modal = document.getElementById('coach-create-tournament-modal');
    if (modal) { modal.classList.remove('hidden'); document.getElementById('coach-create-tournament-form')?.reset(); }
}

function closeCreateModal() {
    document.getElementById('coach-create-tournament-modal')?.classList.add('hidden');
}

function closeDetailsModal() {
    document.getElementById('coach-tournament-details-modal')?.classList.add('hidden');
    selectedTournamentId = null;
}

function closeAddPlayersModal() {
    document.getElementById('coach-tournament-add-players-modal')?.classList.add('hidden');
}

async function switchTab(filter) {
    currentFilter = filter;
    document.querySelectorAll('.coach-tournament-tab-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-600');
        btn.classList.add('text-gray-400', 'border-transparent');
    });
    const activeTab = document.getElementById(`coach-tournament-tab-${filter}`);
    if (activeTab) {
        activeTab.classList.remove('text-gray-400', 'border-transparent');
        activeTab.classList.add('text-indigo-600', 'border-indigo-600');
    }
    await loadCoachTournaments();
}

/**
 * Load tournaments for the coach view
 */
export async function loadCoachTournaments() {
    const list = document.getElementById('coach-tournaments-list');
    if (!list) return;

    list.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">Lade Turniere...</p>';

    try {
        let tournaments = [];
        const userId = getCurrentUserId();

        if (currentFilter === 'open') {
            const all = await getTournaments('registration');
            tournaments = all;
        } else if (currentFilter === 'my') {
            const all = await getTournaments();
            // Show tournaments created by this coach that are not completed
            tournaments = all.filter(t => t.status !== 'completed' && t.created_by === userId);
        } else if (currentFilter === 'completed') {
            tournaments = await getTournaments('completed');
        }

        if (tournaments.length === 0) {
            const emptyMessages = {
                open: 'Keine offenen Turniere. Erstelle ein neues Turnier!',
                my: 'Du hast noch keine aktiven Turniere erstellt.',
                completed: 'Keine abgeschlossenen Turniere.'
            };
            list.innerHTML = `<p class="text-gray-400 text-center py-8 text-sm">${emptyMessages[currentFilter]}</p>`;
            return;
        }

        list.innerHTML = tournaments.map(t => renderTournamentCard(t)).join('');

        tournaments.forEach(t => {
            document.getElementById(`coach-tournament-card-${t.id}`)?.addEventListener('click', () => openTournamentDetails(t.id));
        });
    } catch (error) {
        console.error('[Coach Tournaments] Error loading tournaments:', error);
        list.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

function renderTournamentCard(tournament) {
    const count = tournament.tournament_participants?.[0]?.count ?? tournament.participant_count ?? 0;
    const max = tournament.max_participants;
    const isRegistration = tournament.status === 'registration';
    const displayCount = isRegistration ? `${count}/${max}` : `${count} Teilnehmer`;
    const pct = isRegistration ? (count / max) * 100 : 100;
    const badge = getStatusBadge(tournament.status);
    const fmt = getTournamentFormatName(tournament.format);
    const isCreator = tournament.created_by === getCurrentUserId();

    return `
        <div id="coach-tournament-card-${tournament.id}" class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer">
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <h3 class="font-bold text-gray-800 mb-1">${escapeHtml(tournament.name)}</h3>
                    <p class="text-xs text-gray-600">${fmt} &bull; ${getMatchModeName(tournament.match_mode)}</p>
                </div>
                <div class="flex items-center gap-2">
                    ${isCreator ? '<span class="text-xs text-indigo-600 font-medium"><i class="fas fa-crown mr-1"></i>Ersteller</span>' : ''}
                    ${badge}
                </div>
            </div>
            <div class="flex items-center justify-between text-xs mt-3">
                <div class="flex items-center gap-3">
                    <span class="text-gray-700"><i class="fas fa-users mr-1"></i>${displayCount}</span>
                    ${tournament.with_handicap ? '<i class="fas fa-balance-scale text-blue-500" title="Mit Handicap"></i>' : ''}
                </div>
                ${isRegistration ? `
                <div class="w-24 bg-gray-200 rounded-full h-2">
                    <div class="bg-indigo-600 h-2 rounded-full" style="width: ${pct}%"></div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

function getStatusBadge(status) {
    const badges = {
        'registration': '<span class="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">Anmeldung</span>',
        'in_progress': '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">Laeuft</span>',
        'completed': '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Beendet</span>',
        'cancelled': '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">Abgebrochen</span>',
        'draft': '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Entwurf</span>'
    };
    return badges[status] || '';
}

function getPlayerName(profileOrStanding) {
    const p = profileOrStanding?.profile || profileOrStanding;
    return p?.display_name || `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Unbekannt';
}

async function openTournamentDetails(tournamentId) {
    selectedTournamentId = tournamentId;
    const modal = document.getElementById('coach-tournament-details-modal');
    const content = document.getElementById('coach-tournament-details-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = '<p class="text-gray-500 text-center py-8">Lade Turnier-Details...</p>';

    try {
        const tournament = await getTournamentDetails(tournamentId);
        content.innerHTML = renderTournamentDetails(tournament);
        setupDetailEventListeners(tournament);
    } catch (error) {
        console.error('[Coach Tournaments] Error loading details:', error);
        content.innerHTML = '<p class="text-red-500 text-center py-8">Fehler beim Laden</p>';
    }
}

async function refreshDetailsView() {
    if (!selectedTournamentId) return;
    const content = document.getElementById('coach-tournament-details-content');
    if (!content) return;
    try {
        const tournament = await getTournamentDetails(selectedTournamentId);
        content.innerHTML = renderTournamentDetails(tournament);
        setupDetailEventListeners(tournament);
    } catch (error) {
        console.error('[Coach Tournaments] Error refreshing details:', error);
    }
}

function renderTournamentDetails(tournament) {
    const formatName = getTournamentFormatName(tournament.format);
    const statusName = getTournamentStatusName(tournament.status);
    const creatorName = getPlayerName(tournament.created_by_profile);
    const isCreator = tournament.created_by === getCurrentUserId();
    const participantCount = tournament.tournament_participants?.length || 0;
    const isFull = participantCount >= tournament.max_participants;

    return `
        <div class="space-y-6">
            ${tournament.status === 'completed' && tournament.tournament_standings?.length > 0 ? `
                <div>
                    <h4 class="font-bold text-gray-800 mb-3 text-xl">Turnier Abgeschlossen!</h4>
                    ${renderWinnerPodium(tournament.tournament_standings)}
                </div>
            ` : ''}

            <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="font-bold text-gray-800 text-lg mb-3">${escapeHtml(tournament.name)}</h4>
                ${tournament.description ? `<p class="text-sm text-gray-600 mb-4">${escapeHtml(tournament.description)}</p>` : ''}
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><span class="text-gray-600">Modus:</span> <span class="font-medium ml-2">${formatName}</span></div>
                    <div><span class="text-gray-600">Spielmodus:</span> <span class="font-medium ml-2">${getMatchModeName(tournament.match_mode)}</span></div>
                    <div><span class="text-gray-600">Status:</span> <span class="font-medium ml-2">${statusName}</span></div>
                    <div><span class="text-gray-600">Teilnehmer:</span> <span class="font-medium ml-2">${participantCount}/${tournament.max_participants}</span></div>
                    <div><span class="text-gray-600">Erstellt von:</span> <span class="font-medium ml-2">${escapeHtml(creatorName)}</span></div>
                    ${tournament.with_handicap ? '<div><span class="text-gray-600">Handicap:</span> <span class="font-medium ml-2"><i class="fas fa-check text-green-500"></i> Aktiv</span></div>' : ''}
                    ${tournament.join_code && isCreator ? `<div><span class="text-gray-600">Code:</span> <span class="font-mono font-bold ml-2 text-indigo-600">${tournament.join_code}</span></div>` : ''}
                </div>
                <div class="mt-4 flex gap-2 flex-wrap">
                    ${renderActionButtons(tournament)}
                </div>
            </div>

            <div>
                <div class="flex items-center justify-between mb-3">
                    <h4 class="font-bold text-gray-800"><i class="fas fa-users mr-2"></i>Teilnehmer (${participantCount}/${tournament.max_participants})</h4>
                    ${isCreator && tournament.status === 'registration' && !isFull ? `
                        <button id="coach-add-players-btn" class="bg-green-500 hover:bg-green-600 text-white text-xs py-1.5 px-3 rounded-lg font-medium">
                            <i class="fas fa-user-plus mr-1"></i>Spieler hinzufuegen
                        </button>
                    ` : ''}
                </div>
                ${renderParticipants(tournament.tournament_participants || [], tournament.status === 'registration' && isCreator)}
            </div>

            ${tournament.tournament_matches?.length > 0 ? `
                <div>
                    <h4 class="font-bold text-gray-800 mb-3"><i class="fas fa-table mr-2"></i>Kreuztabelle</h4>
                    ${renderCrossTable(tournament.tournament_participants || [], tournament.tournament_matches || [], tournament.tournament_standings || [])}
                </div>
            ` : ''}

            ${tournament.tournament_matches?.length > 0 ? `
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="font-bold text-gray-800"><i class="fas fa-table-tennis-paddle-ball mr-2"></i>Spiele</h4>
                        ${tournament.status === 'in_progress' && isCreator ? `
                            <button id="coach-quick-match-entry-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-1.5 px-3 rounded-lg font-medium">
                                <i class="fas fa-bolt mr-1"></i>Eintragen
                            </button>
                        ` : ''}
                    </div>
                    ${renderMatches(tournament.tournament_matches || [], isCreator)}
                </div>
            ` : ''}
        </div>
    `;
}

function renderActionButtons(tournament) {
    const isCreator = tournament.created_by === getCurrentUserId();
    let buttons = [];

    if (tournament.status === 'registration') {
        if (isCreator && (tournament.tournament_participants?.length || 0) >= 2) {
            buttons.push(`<button id="coach-start-tournament-btn" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium"><i class="fas fa-play mr-2"></i>Turnier starten</button>`);
        }
        if (isCreator) {
            buttons.push(`<button id="coach-edit-tournament-btn" class="bg-gray-500 hover:bg-gray-600 text-white py-2 px-3 rounded-lg font-medium" title="Bearbeiten"><i class="fas fa-edit"></i></button>`);
            buttons.push(`<button id="coach-cancel-tournament-btn" class="bg-orange-500 hover:bg-orange-600 text-white py-2 px-3 rounded-lg font-medium" title="Abbrechen"><i class="fas fa-ban"></i></button>`);
        }
    }

    if (tournament.status === 'in_progress' && isCreator) {
        buttons.push(`<button id="coach-regenerate-pairings-btn" class="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg font-medium"><i class="fas fa-sync-alt mr-2"></i>Neu generieren</button>`);
        buttons.push(`<button id="coach-cancel-tournament-btn" class="bg-orange-500 hover:bg-orange-600 text-white py-2 px-3 rounded-lg font-medium" title="Abbrechen"><i class="fas fa-ban"></i></button>`);
    }

    // Copy and Print buttons for creator (all statuses except cancelled)
    if (isCreator && tournament.status !== 'cancelled') {
        buttons.push(`<button id="coach-copy-tournament-btn" class="bg-purple-500 hover:bg-purple-600 text-white py-2 px-3 rounded-lg font-medium" title="Kopieren"><i class="fas fa-copy"></i></button>`);
    }

    // Print button (if tournament has matches)
    if (tournament.tournament_matches?.length > 0) {
        buttons.push(`<button id="coach-print-tournament-btn" class="bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded-lg font-medium" title="Drucken"><i class="fas fa-print"></i></button>`);
    }

    return buttons.join('');
}

function renderParticipants(participants, canRemove) {
    if (participants.length === 0) return '<p class="text-gray-400 text-sm">Noch keine Teilnehmer. Fuege Spieler hinzu!</p>';

    const sorted = [...participants].sort((a, b) => {
        if (a.seed && b.seed) return a.seed - b.seed;
        return (b.elo_at_registration || 800) - (a.elo_at_registration || 800);
    });

    return `<div class="space-y-2">
        ${sorted.map(p => {
            const name = getPlayerName(p);
            const elo = p.elo_at_registration || p.profile?.elo_rating || 800;
            const isOffline = p.profile?.is_offline;
            return `<div class="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                <div class="flex items-center gap-3">
                    <span class="font-bold text-gray-500 w-6">#${p.seed || '-'}</span>
                    <span class="font-medium text-gray-800">${escapeHtml(name)}</span>
                    ${isOffline ? '<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Offline</span>' : ''}
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-600">Elo: ${elo}</span>
                    ${canRemove ? `<button class="coach-remove-participant-btn text-red-400 hover:text-red-600 ml-2" data-participant-id="${p.id}" data-player-name="${escapeHtml(name)}"><i class="fas fa-times"></i></button>` : ''}
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function renderCrossTable(participants, matches, standings) {
    if (!participants.length) return '<p class="text-gray-400 text-sm">Keine Teilnehmer</p>';

    const sorted = [...participants].sort((a, b) => (a.seed || 999) - (b.seed || 999));
    const results = {};
    sorted.forEach(p => { results[p.player_id] = {}; });

    matches.forEach(m => {
        if (!m.player_a_id || !m.player_b_id) return;
        if (m.status !== 'completed') return;
        results[m.player_a_id][m.player_b_id] = { setsA: m.player_a_sets_won || 0, setsB: m.player_b_sets_won || 0 };
        results[m.player_b_id][m.player_a_id] = { setsA: m.player_b_sets_won || 0, setsB: m.player_a_sets_won || 0 };
    });

    const standingsMap = {};
    (standings || []).forEach(s => { standingsMap[s.player_id] = s; });

    return `<div class="overflow-x-auto">
        <table class="w-full text-xs border-collapse">
            <thead class="bg-gray-100">
                <tr>
                    <th class="px-1 py-2 text-center border border-gray-300 w-8"></th>
                    <th class="px-2 py-2 text-left border border-gray-300 sticky left-0 bg-gray-100 z-10">Name</th>
                    ${sorted.map((_, i) => `<th class="px-2 py-2 text-center border border-gray-300 min-w-[40px]">${i + 1}</th>`).join('')}
                    <th class="px-2 py-2 text-center border border-gray-300 font-bold">Sp</th>
                    <th class="px-2 py-2 text-center border border-gray-300 font-bold">Satz</th>
                    <th class="px-2 py-2 text-center border border-gray-300 font-bold">Pl.</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map((rowPlayer, rowIdx) => {
                    const name = getPlayerName(rowPlayer);
                    const st = standingsMap[rowPlayer.player_id];
                    const wins = st?.matches_won || 0;
                    const losses = st?.matches_lost || 0;
                    const setsW = st?.sets_won || 0;
                    const setsL = st?.sets_lost || 0;
                    const rank = st?.rank || '-';
                    const matchRecord = (wins + losses > 0) ? `${wins}:${losses}` : '-';
                    const setsRecord = (setsW + setsL > 0) ? `${setsW}:${setsL}` : '-';

                    return `<tr class="${rank === 1 ? 'bg-yellow-50' : 'bg-white'} hover:bg-gray-50">
                        <td class="px-1 py-2 text-center border border-gray-300 font-bold text-gray-500">${rowIdx + 1}</td>
                        <td class="px-2 py-2 border border-gray-300 sticky left-0 ${rank === 1 ? 'bg-yellow-50' : 'bg-white'} font-medium whitespace-nowrap">${escapeHtml(name)}</td>
                        ${sorted.map((colPlayer, colIdx) => {
                            if (rowIdx === colIdx) return '<td class="px-2 py-2 text-center border border-gray-300 bg-gray-800"></td>';
                            const result = results[rowPlayer.player_id]?.[colPlayer.player_id];
                            if (result) {
                                const won = result.setsA > result.setsB;
                                const cls = won ? 'text-green-700 font-bold' : 'text-red-600';
                                return `<td class="px-2 py-2 text-center border border-gray-300 font-mono ${cls}">${result.setsA}:${result.setsB}</td>`;
                            }
                            return '<td class="px-2 py-2 text-center border border-gray-300 text-gray-300">-</td>';
                        }).join('')}
                        <td class="px-2 py-2 text-center border border-gray-300 font-medium">${matchRecord}</td>
                        <td class="px-2 py-2 text-center border border-gray-300">${setsRecord}</td>
                        <td class="px-2 py-2 text-center border border-gray-300 font-bold">${rank}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;
}

function renderWinnerPodium(standings) {
    const top3 = standings.filter(s => s.rank && s.rank <= 3).sort((a, b) => a.rank - b.rank);
    if (!top3.length) return '<p class="text-gray-400 text-sm">Keine Ergebnisse</p>';

    const winner = top3[0]; const second = top3[1]; const third = top3[2];

    return `<div class="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-6">
        <div class="text-center mb-6">
            <div class="text-5xl mb-2"><i class="fas fa-trophy text-yellow-500"></i></div>
            <h3 class="text-xl font-bold text-yellow-700 mb-1">Gewinner</h3>
            <p class="text-2xl font-black text-gray-800">${escapeHtml(getPlayerName(winner))}</p>
            <p class="text-sm text-gray-600 mt-1">${winner.matches_won || 0} Siege &bull; ${winner.tournament_points || 0} Punkte</p>
        </div>
        ${top3.length > 1 ? `<div class="grid grid-cols-${top3.length === 3 ? '3' : '2'} gap-4">
            ${second ? `<div class="text-center bg-white/50 rounded-lg p-4">
                <div class="text-3xl mb-2"><i class="fas fa-medal text-gray-400"></i></div>
                <p class="text-xs text-gray-600 font-semibold">2. Platz</p>
                <p class="font-bold text-gray-800">${escapeHtml(getPlayerName(second))}</p>
                <p class="text-xs text-gray-600">${second.tournament_points || 0} Pkt</p>
            </div>` : ''}
            ${third ? `<div class="text-center bg-white/50 rounded-lg p-4">
                <div class="text-3xl mb-2"><i class="fas fa-medal text-orange-400"></i></div>
                <p class="text-xs text-gray-600 font-semibold">3. Platz</p>
                <p class="font-bold text-gray-800">${escapeHtml(getPlayerName(third))}</p>
                <p class="text-xs text-gray-600">${third.tournament_points || 0} Pkt</p>
            </div>` : ''}
        </div>` : ''}
    </div>`;
}

function renderMatches(matches, isCreator = false) {
    if (!matches.length) return '<p class="text-gray-400 text-sm">Noch keine Spiele</p>';

    const byRound = {};
    matches.forEach(m => { const r = m.round_number || 1; if (!byRound[r]) byRound[r] = []; byRound[r].push(m); });

    return Object.keys(byRound).sort((a, b) => a - b).map(round => {
        const rm = byRound[round];
        const actual = rm.filter(m => m.player_b_id !== null);
        const byes = rm.filter(m => m.player_b_id === null);
        const completed = actual.filter(m => m.status === 'completed').length;

        return `<div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <h5 class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group mr-1"></i>Runde ${round}</h5>
                <span class="text-xs text-gray-500">${completed}/${actual.length} abgeschlossen</span>
            </div>
            <div class="space-y-2">
                ${actual.map(m => {
                    const a = getPlayerName(m.player_a);
                    const b = getPlayerName(m.player_b);
                    const done = m.status === 'completed';
                    return `<div class="bg-white border border-gray-200 rounded-lg p-3">
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="${m.winner_id === m.player_a_id ? 'font-bold text-gray-900' : 'text-gray-700'}">${escapeHtml(a)}</span>
                                    ${done ? `<span class="text-sm font-mono">${m.player_a_sets_won || 0}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="${m.winner_id === m.player_b_id ? 'font-bold text-gray-900' : 'text-gray-700'}">${escapeHtml(b)}</span>
                                    ${done ? `<span class="text-sm font-mono">${m.player_b_sets_won || 0}</span>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                ${done
                                    ? '<span class="text-xs text-gray-500"><i class="fas fa-check text-green-500 mr-1"></i>Gespielt</span>'
                                    : '<span class="text-xs text-gray-500"><i class="fas fa-clock text-yellow-500 mr-1"></i>Ausstehend</span>'}
                                ${done && isCreator ? `<button class="coach-correct-match-btn text-xs text-indigo-600 hover:text-indigo-800 ml-2" data-match-id="${m.id}" title="Korrigieren"><i class="fas fa-edit"></i></button>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('')}
                ${byes.map(m => {
                    const name = getPlayerName(m.player_a);
                    return `<div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2"><i class="fas fa-coffee text-gray-400"></i><span class="text-gray-700">${escapeHtml(name)}</span></div>
                            <span class="text-xs text-gray-500 italic">Freilos</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }).join('');
}

function setupDetailEventListeners(tournament) {
    const isCreator = tournament.created_by === getCurrentUserId();

    // Add players button
    document.getElementById('coach-add-players-btn')?.addEventListener('click', () => openAddPlayersModal(tournament));

    // Remove participant buttons
    document.querySelectorAll('.coach-remove-participant-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const participantId = btn.dataset.participantId;
            const playerName = btn.dataset.playerName;
            if (confirm(`${playerName} wirklich aus dem Turnier entfernen?`)) {
                try {
                    const { error } = await supabase
                        .from('tournament_participants')
                        .delete()
                        .eq('id', participantId);
                    if (error) throw error;
                    showToast(`${playerName} entfernt`, 'success');
                    await refreshDetailsView();
                    await loadCoachTournaments();
                } catch (err) {
                    console.error('[Coach Tournaments] Error removing participant:', err);
                    showToast('Fehler beim Entfernen: ' + err.message, 'error');
                }
            }
        });
    });

    // Start tournament
    document.getElementById('coach-start-tournament-btn')?.addEventListener('click', async () => {
        if (confirm('Turnier jetzt starten? Danach koennen keine weiteren Spieler hinzugefuegt werden.')) {
            try {
                await startTournament(tournament.id);
                await refreshDetailsView();
                await loadCoachTournaments();
            } catch {}
        }
    });

    // Delete tournament
    document.getElementById('coach-delete-tournament-btn')?.addEventListener('click', async () => {
        if (confirm('Turnier wirklich loeschen? Alle Daten gehen verloren.')) {
            try {
                await deleteTournament(tournament.id);
                closeDetailsModal();
                await loadCoachTournaments();
            } catch {}
        }
    });

    // Regenerate pairings
    document.getElementById('coach-regenerate-pairings-btn')?.addEventListener('click', async () => {
        if (confirm('Paarungen neu generieren? Alle bisherigen Ergebnisse werden geloescht!')) {
            try {
                await regeneratePairings(tournament.id);
                await refreshDetailsView();
                await loadCoachTournaments();
            } catch {}
        }
    });

    // Quick match entry
    document.getElementById('coach-quick-match-entry-btn')?.addEventListener('click', () => openQuickMatchEntryModal(tournament));

    // New action buttons
    document.getElementById('coach-edit-tournament-btn')?.addEventListener('click', () => openCoachEditTournamentModal(tournament));
    document.getElementById('coach-cancel-tournament-btn')?.addEventListener('click', () => handleCoachCancelTournament(tournament));
    document.getElementById('coach-copy-tournament-btn')?.addEventListener('click', () => openCoachCopyTournamentModal(tournament));
    document.getElementById('coach-print-tournament-btn')?.addEventListener('click', () => printCoachTournament(tournament));

    // Match correction buttons
    document.querySelectorAll('.coach-correct-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const matchId = btn.dataset.matchId;
            const match = tournament.tournament_matches?.find(m => m.id === matchId);
            if (match) openCoachCorrectMatchModal(match, tournament);
        });
    });
}

// ---- Add Players Modal ----

function openAddPlayersModal(tournament) {
    const modal = document.getElementById('coach-tournament-add-players-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.dataset.tournamentId = tournament.id;

    const searchInput = document.getElementById('coach-tournament-player-search');
    if (searchInput) searchInput.value = '';

    const existingPlayerIds = (tournament.tournament_participants || []).map(p => p.player_id);

    renderPlayerList(existingPlayerIds, tournament);
}

function renderPlayerList(existingPlayerIds, tournament) {
    const list = document.getElementById('coach-tournament-player-list');
    if (!list) return;

    // Filter out players already in the tournament
    const availablePlayers = clubPlayersCache.filter(p => !existingPlayerIds.includes(p.id));

    if (availablePlayers.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine weiteren Spieler verfuegbar</p>';
        return;
    }

    const maxRemaining = tournament.max_participants - (tournament.tournament_participants?.length || 0);

    list.innerHTML = `
        <p class="text-xs text-gray-500 mb-2">Noch ${maxRemaining} Platz/Plaetze verfuegbar. Waehle Spieler aus:</p>
        ${availablePlayers.map(p => {
            const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.email || 'Unbekannt';
            const isOffline = p.isOffline;
            return `<label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer coach-tournament-player-item" data-name="${escapeHtml(name.toLowerCase())}">
                <input type="checkbox" class="coach-tournament-player-checkbox rounded text-indigo-600" value="${p.id}" data-elo="${p.eloRating || 800}">
                <div class="flex-1">
                    <span class="font-medium text-gray-800 text-sm">${escapeHtml(name)}</span>
                    ${isOffline ? '<span class="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-1">Offline</span>' : ''}
                </div>
                <span class="text-xs text-gray-500">Elo: ${p.eloRating || 800}</span>
            </label>`;
        }).join('')}
    `;
}

function handlePlayerSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.coach-tournament-player-item');
    items.forEach(item => {
        const name = item.dataset.name || '';
        item.style.display = name.includes(searchTerm) ? '' : 'none';
    });
}

function toggleQuickCreateForm() {
    const form = document.getElementById('coach-tournament-quick-create-form');
    const icon = document.getElementById('coach-tournament-quick-create-icon');
    if (form && icon) {
        form.classList.toggle('hidden');
        icon.classList.toggle('rotate-180');
    }
}

async function handleQuickCreateOfflinePlayer() {
    const firstName = document.getElementById('coach-tournament-new-player-firstname')?.value.trim();
    const lastName = document.getElementById('coach-tournament-new-player-lastname')?.value.trim();
    const eloInput = document.getElementById('coach-tournament-new-player-elo')?.value;
    const elo = eloInput ? parseInt(eloInput) : 800;

    if (!firstName && !lastName) {
        showToast('Bitte mindestens Vor- oder Nachname eingeben', 'error');
        return;
    }

    const createBtn = document.getElementById('coach-tournament-create-offline-player');
    if (createBtn) {
        createBtn.disabled = true;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>...';
    }

    try {
        // Create offline player profile
        const { data: newProfile, error: profileError } = await supabase
            .from('profiles')
            .insert({
                first_name: firstName || null,
                last_name: lastName || null,
                display_name: `${firstName || ''} ${lastName || ''}`.trim(),
                elo_rating: elo,
                is_offline: true
            })
            .select()
            .single();

        if (profileError) throw profileError;

        // Add to club_members
        const { error: memberError } = await supabase
            .from('club_members')
            .insert({
                club_id: coachUserData.clubId,
                user_id: newProfile.id,
                role: 'player',
                status: 'active'
            });

        if (memberError) throw memberError;

        // Add to local cache
        clubPlayersCache.push({
            id: newProfile.id,
            firstName: firstName,
            lastName: lastName,
            eloRating: elo,
            isOffline: true
        });

        // Clear form
        document.getElementById('coach-tournament-new-player-firstname').value = '';
        document.getElementById('coach-tournament-new-player-lastname').value = '';
        document.getElementById('coach-tournament-new-player-elo').value = '';

        // Refresh player list
        const modal = document.getElementById('coach-tournament-add-players-modal');
        const tournamentId = modal?.dataset.tournamentId;
        if (tournamentId) {
            const tournament = await getTournamentDetails(tournamentId);
            const existingPlayerIds = (tournament.tournament_participants || []).map(p => p.player_id);
            renderPlayerList(existingPlayerIds, tournament);
        }

        showToast(`${firstName || ''} ${lastName || ''} erstellt!`, 'success');
    } catch (err) {
        console.error('[Coach Tournaments] Error creating offline player:', err);
        showToast('Fehler: ' + err.message, 'error');
    } finally {
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.innerHTML = '<i class="fas fa-user-plus mr-1"></i>Erstellen';
        }
    }
}

async function handleConfirmAddPlayers() {
    const modal = document.getElementById('coach-tournament-add-players-modal');
    const tournamentId = modal?.dataset.tournamentId;
    if (!tournamentId) return;

    const checkboxes = document.querySelectorAll('.coach-tournament-player-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('Bitte waehle mindestens einen Spieler aus', 'warning');
        return;
    }

    // Check tournament capacity
    const tournament = await getTournamentDetails(tournamentId);
    const currentCount = tournament.tournament_participants?.length || 0;
    const remaining = tournament.max_participants - currentCount;

    if (checkboxes.length > remaining) {
        showToast(`Nur noch ${remaining} Platz/Plaetze verfuegbar, aber ${checkboxes.length} ausgewaehlt`, 'error');
        return;
    }

    const confirmBtn = document.getElementById('confirm-coach-tournament-add-players');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Hinzufuegen...';
    }

    try {
        const participants = [];
        for (const cb of checkboxes) {
            const playerId = cb.value;
            const elo = parseInt(cb.dataset.elo) || 800;
            participants.push({
                tournament_id: tournamentId,
                player_id: playerId,
                elo_at_registration: elo
            });
        }

        const { error } = await supabase
            .from('tournament_participants')
            .insert(participants);

        if (error) throw error;

        showToast(`${participants.length} Spieler hinzugefuegt!`, 'success');
        closeAddPlayersModal();
        await refreshDetailsView();
        await loadCoachTournaments();
    } catch (error) {
        console.error('[Coach Tournaments] Error adding players:', error);
        showToast('Fehler: ' + error.message, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Hinzufuegen';
        }
    }
}

// ---- Create Tournament ----

async function handleCreateTournament() {
    const name = document.getElementById('coach-tournament-name')?.value;
    const description = document.getElementById('coach-tournament-description')?.value;
    const format = document.getElementById('coach-tournament-format')?.value;
    const matchMode = document.getElementById('coach-tournament-match-mode')?.value || 'best-of-5';
    const maxParticipants = parseInt(document.getElementById('coach-tournament-max-participants')?.value || '6');
    const withHandicap = document.getElementById('coach-tournament-handicap')?.checked || false;

    try {
        const tournament = await createTournament({
            name, description, format, matchMode, maxParticipants,
            isOpen: false, isClubOnly: true, withHandicap
        });
        closeCreateModal();
        await loadCoachTournaments();
        await openTournamentDetails(tournament.id);
    } catch {}
}

// ---- Quick Match Entry ----

function openQuickMatchEntryModal(tournament) {
    const pendingMatches = (tournament.tournament_matches || []).filter(m => m.status === 'pending' && m.player_b_id);
    if (!pendingMatches.length) { showToast('Keine offenen Matches', 'info'); return; }

    const matchMode = tournament.match_mode || 'best-of-5';
    const maxSets = getMaxSets(matchMode);
    const setsToWin = getSetsToWin(matchMode);

    const modal = document.createElement('div');
    modal.id = 'coach-quick-match-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-bolt text-indigo-600 mr-2"></i>Match eintragen</h3>
                    <button id="close-coach-quick-match" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <div class="mb-3 text-xs text-gray-500">Spielmodus: <span class="font-medium">${getMatchModeName(matchMode)}</span></div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Match auswaehlen</label>
                    <select id="coach-quick-match-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="">-- Bitte waehlen --</option>
                        ${pendingMatches.map(m => {
                            const a = getPlayerName(m.player_a);
                            const b = getPlayerName(m.player_b);
                            return `<option value="${m.id}">Runde ${m.round_number}: ${escapeHtml(a)} vs ${escapeHtml(b)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div id="coach-quick-match-form" class="hidden space-y-4">
                    <div id="coach-quick-mode-sets">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Ergebnis (Saetze)</label>
                        <div class="grid grid-cols-3 gap-2 items-center">
                            <div>
                                <input type="number" id="coach-quick-sets-a" min="0" max="${maxSets}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold" placeholder="0">
                                <div id="coach-quick-player-a-name" class="text-xs text-gray-600 mt-1 text-center truncate"></div>
                            </div>
                            <div class="text-center text-gray-400 font-bold text-xl">:</div>
                            <div>
                                <input type="number" id="coach-quick-sets-b" min="0" max="${maxSets}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold" placeholder="0">
                                <div id="coach-quick-player-b-name" class="text-xs text-gray-600 mt-1 text-center truncate"></div>
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button id="cancel-coach-quick-match" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button id="submit-coach-quick-match" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium">Speichern</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const matchSelect = modal.querySelector('#coach-quick-match-select');
    const matchForm = modal.querySelector('#coach-quick-match-form');
    let selectedMatch = null;

    matchSelect.addEventListener('change', () => {
        if (matchSelect.value) {
            selectedMatch = pendingMatches.find(m => m.id === matchSelect.value);
            modal.querySelector('#coach-quick-player-a-name').textContent = getPlayerName(selectedMatch.player_a);
            modal.querySelector('#coach-quick-player-b-name').textContent = getPlayerName(selectedMatch.player_b);
            matchForm.classList.remove('hidden');
        } else {
            matchForm.classList.add('hidden');
        }
    });

    const closeModal = () => modal.remove();
    modal.querySelector('#close-coach-quick-match').addEventListener('click', closeModal);
    modal.querySelector('#cancel-coach-quick-match').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#submit-coach-quick-match').addEventListener('click', async () => {
        if (!selectedMatch) return;

        const setsA = parseInt(modal.querySelector('#coach-quick-sets-a').value) || 0;
        const setsB = parseInt(modal.querySelector('#coach-quick-sets-b').value) || 0;

        if (setsA + setsB > maxSets) {
            showToast(`Maximal ${maxSets} Saetze moeglich bei ${getMatchModeName(matchMode)}`, 'error'); return;
        }
        if (Math.max(setsA, setsB) > setsToWin) {
            showToast(`Maximal ${setsToWin} gewonnene Saetze bei ${getMatchModeName(matchMode)}`, 'error'); return;
        }
        if (setsA !== setsToWin && setsB !== setsToWin) {
            showToast(`Ein Spieler muss ${setsToWin} Saetze gewinnen (${getMatchModeName(matchMode)})`, 'error'); return;
        }
        if (setsA === 0 && setsB === 0) { showToast('Bitte Ergebnis eingeben', 'error'); return; }
        if (setsA === setsB) { showToast('Unentschieden nicht moeglich', 'error'); return; }

        const submitBtn = modal.querySelector('#submit-coach-quick-match');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Speichere...';

        try {
            const winnerId = setsA > setsB ? selectedMatch.player_a_id : selectedMatch.player_b_id;
            const loserId = setsA > setsB ? selectedMatch.player_b_id : selectedMatch.player_a_id;

            const { data: match, error: matchError } = await supabase
                .from('matches')
                .insert({
                    player_a_id: selectedMatch.player_a_id, player_b_id: selectedMatch.player_b_id,
                    winner_id: winnerId, loser_id: loserId,
                    player_a_sets_won: setsA, player_b_sets_won: setsB,
                    sets: [], club_id: coachUserData.clubId, created_by: getCurrentUserId(),
                    sport_id: coachUserData.activeSportId, played_at: new Date().toISOString(),
                    match_mode: matchMode, handicap_used: false,
                    tournament_match_id: selectedMatch.id
                })
                .select().single();
            if (matchError) throw matchError;

            await recordTournamentMatchResult(selectedMatch.id, match.id);
            showToast('Match eingetragen!', 'success');
            closeModal();
            await refreshDetailsView();
        } catch (error) {
            console.error('[Coach Tournaments] Error saving match:', error);
            showToast('Fehler: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Speichern';
        }
    });
}

// ========== NEW FEATURE FUNCTIONS ==========

/**
 * Open modal to edit tournament details
 */
function openCoachEditTournamentModal(tournament) {
    const modal = document.createElement('div');
    modal.id = 'coach-edit-tournament-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit text-indigo-600 mr-2"></i>Turnier bearbeiten</h3>
                    <button id="close-coach-edit-tournament" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <form id="coach-edit-tournament-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" id="coach-edit-tournament-name" value="${escapeHtml(tournament.name)}" required
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                        <textarea id="coach-edit-tournament-description" rows="2"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">${escapeHtml(tournament.description || '')}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Max. Teilnehmer</label>
                        <input type="number" id="coach-edit-tournament-max" value="${tournament.max_participants}" min="${tournament.tournament_participants?.length || 2}" max="32"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="cancel-coach-edit-tournament" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button type="submit" id="save-coach-edit-tournament" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium">Speichern</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-coach-edit-tournament').addEventListener('click', closeModal);
    modal.querySelector('#cancel-coach-edit-tournament').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#coach-edit-tournament-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = modal.querySelector('#coach-edit-tournament-name').value.trim();
        const description = modal.querySelector('#coach-edit-tournament-description').value.trim();
        const maxParticipants = parseInt(modal.querySelector('#coach-edit-tournament-max').value) || tournament.max_participants;

        if (!name) { showToast('Name ist erforderlich', 'error'); return; }

        const saveBtn = modal.querySelector('#save-coach-edit-tournament');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Speichere...';

        try {
            const { error } = await supabase
                .from('tournaments')
                .update({ name, description, max_participants: maxParticipants })
                .eq('id', tournament.id);

            if (error) throw error;
            showToast('Turnier aktualisiert!', 'success');
            closeModal();
            await refreshDetailsView();
            await loadCoachTournaments();
        } catch (err) {
            console.error('[Coach Tournaments] Error updating tournament:', err);
            showToast('Fehler: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Speichern';
        }
    });
}

/**
 * Cancel tournament
 */
async function handleCoachCancelTournament(tournament) {
    if (!confirm('Turnier wirklich abbrechen? Das Turnier wird als "Abgebrochen" markiert.')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('tournaments')
            .update({ status: 'cancelled' })
            .eq('id', tournament.id);

        if (error) throw error;
        showToast('Turnier abgebrochen', 'success');
        closeDetailsModal();
        await loadCoachTournaments();
    } catch (err) {
        console.error('[Coach Tournaments] Error cancelling tournament:', err);
        showToast('Fehler: ' + err.message, 'error');
    }
}

/**
 * Open modal to copy tournament
 */
function openCoachCopyTournamentModal(tournament) {
    const modal = document.createElement('div');
    modal.id = 'coach-copy-tournament-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-copy text-purple-600 mr-2"></i>Turnier kopieren</h3>
                    <button id="close-coach-copy-tournament" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Erstelle ein neues Turnier mit den gleichen Einstellungen.</p>
                <form id="coach-copy-tournament-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Neuer Name</label>
                        <input type="text" id="coach-copy-tournament-name" value="${escapeHtml(tournament.name)} (Kopie)" required
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="cancel-coach-copy-tournament" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button type="submit" id="save-coach-copy-tournament" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg font-medium">Kopieren</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-coach-copy-tournament').addEventListener('click', closeModal);
    modal.querySelector('#cancel-coach-copy-tournament').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#coach-copy-tournament-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = modal.querySelector('#coach-copy-tournament-name').value.trim();
        if (!name) { showToast('Name ist erforderlich', 'error'); return; }

        const saveBtn = modal.querySelector('#save-coach-copy-tournament');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Kopiere...';

        try {
            const newTournament = await createTournament({
                name,
                description: tournament.description,
                format: tournament.format,
                matchMode: tournament.match_mode,
                maxParticipants: tournament.max_participants,
                isOpen: false,
                isClubOnly: true,
                withHandicap: tournament.with_handicap
            });

            showToast('Turnier kopiert!', 'success');
            closeModal();
            closeDetailsModal();
            await loadCoachTournaments();
            await openTournamentDetails(newTournament.id);
        } catch (err) {
            console.error('[Coach Tournaments] Error copying tournament:', err);
            showToast('Fehler: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Kopieren';
        }
    });
}

/**
 * Print tournament
 */
function printCoachTournament(tournament) {
    const formatName = getTournamentFormatName(tournament.format);
    const statusName = getTournamentStatusName(tournament.status);
    const participants = tournament.tournament_participants || [];
    const matches = tournament.tournament_matches || [];
    const standings = tournament.tournament_standings || [];

    let crossTableHtml = '';
    if (participants.length > 0 && matches.length > 0) {
        const sorted = [...participants].sort((a, b) => (a.seed || 999) - (b.seed || 999));
        const results = {};
        sorted.forEach(p => { results[p.player_id] = {}; });

        matches.forEach(m => {
            if (!m.player_a_id || !m.player_b_id || m.status !== 'completed') return;
            results[m.player_a_id][m.player_b_id] = { setsA: m.player_a_sets_won || 0, setsB: m.player_b_sets_won || 0 };
            results[m.player_b_id][m.player_a_id] = { setsA: m.player_b_sets_won || 0, setsB: m.player_a_sets_won || 0 };
        });

        const standingsMap = {};
        standings.forEach(s => { standingsMap[s.player_id] = s; });

        crossTableHtml = `
            <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:20px;">
                <thead>
                    <tr style="background:#f3f4f6;">
                        <th style="border:1px solid #ddd; padding:4px; width:20px;"></th>
                        <th style="border:1px solid #ddd; padding:4px; text-align:left;">Name</th>
                        ${sorted.map((_, i) => `<th style="border:1px solid #ddd; padding:4px; width:35px; text-align:center;">${i + 1}</th>`).join('')}
                        <th style="border:1px solid #ddd; padding:4px; width:35px;">Sp</th>
                        <th style="border:1px solid #ddd; padding:4px; width:35px;">Satz</th>
                        <th style="border:1px solid #ddd; padding:4px; width:25px;">Pl.</th>
                    </tr>
                </thead>
                <tbody>
                    ${sorted.map((rowPlayer, rowIdx) => {
                        const name = getPlayerName(rowPlayer);
                        const st = standingsMap[rowPlayer.player_id];
                        const wins = st?.matches_won || 0;
                        const losses = st?.matches_lost || 0;
                        const setsW = st?.sets_won || 0;
                        const setsL = st?.sets_lost || 0;
                        const rank = st?.rank || '-';

                        return `<tr>
                            <td style="border:1px solid #ddd; padding:4px; text-align:center; font-weight:bold;">${rowIdx + 1}</td>
                            <td style="border:1px solid #ddd; padding:4px;">${escapeHtml(name)}</td>
                            ${sorted.map((colPlayer, colIdx) => {
                                if (rowIdx === colIdx) return '<td style="border:1px solid #ddd; background:#333;"></td>';
                                const result = results[rowPlayer.player_id]?.[colPlayer.player_id];
                                if (result) {
                                    const won = result.setsA > result.setsB;
                                    return `<td style="border:1px solid #ddd; padding:4px; text-align:center; font-family:monospace; ${won ? 'font-weight:bold;' : ''}">${result.setsA}:${result.setsB}</td>`;
                                }
                                return '<td style="border:1px solid #ddd; padding:4px; text-align:center; color:#ccc;">-</td>';
                            }).join('')}
                            <td style="border:1px solid #ddd; padding:4px; text-align:center;">${wins}:${losses}</td>
                            <td style="border:1px solid #ddd; padding:4px; text-align:center;">${setsW}:${setsL}</td>
                            <td style="border:1px solid #ddd; padding:4px; text-align:center; font-weight:bold;">${rank}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${escapeHtml(tournament.name)} - Spielplan</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { margin-bottom: 5px; }
                .subtitle { color: #666; margin-bottom: 20px; }
                .info { display: flex; gap: 30px; margin-bottom: 20px; font-size: 14px; }
                .info-item { display: flex; gap: 8px; }
                .info-label { color: #666; }
            </style>
        </head>
        <body>
            <h1>${escapeHtml(tournament.name)}</h1>
            <p class="subtitle">${escapeHtml(tournament.description || '')}</p>
            <div class="info">
                <div class="info-item"><span class="info-label">Modus:</span> ${formatName}</div>
                <div class="info-item"><span class="info-label">Status:</span> ${statusName}</div>
                <div class="info-item"><span class="info-label">Teilnehmer:</span> ${participants.length}</div>
            </div>
            ${crossTableHtml}
            <p style="margin-top:30px; font-size:10px; color:#999;">Erstellt am ${new Date().toLocaleDateString('de-DE')} - SC Champions</p>
            <script>window.print();</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Open modal to correct a match result
 */
function openCoachCorrectMatchModal(match, tournament) {
    const matchMode = tournament.match_mode || 'best-of-5';
    const maxSets = getMaxSets(matchMode);
    const setsToWin = getSetsToWin(matchMode);
    const playerAName = getPlayerName(match.player_a);
    const playerBName = getPlayerName(match.player_b);

    const modal = document.createElement('div');
    modal.id = 'coach-correct-match-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit text-orange-600 mr-2"></i>Ergebnis korrigieren</h3>
                    <button id="close-coach-correct-match" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Runde ${match.round_number}</p>
                <div class="space-y-4">
                    <div class="grid grid-cols-3 gap-2 items-center">
                        <div>
                            <input type="number" id="coach-correct-sets-a" min="0" max="${maxSets}" value="${match.player_a_sets_won || 0}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold">
                            <div class="text-xs text-gray-600 mt-1 text-center truncate">${escapeHtml(playerAName)}</div>
                        </div>
                        <div class="text-center text-gray-400 font-bold text-xl">:</div>
                        <div>
                            <input type="number" id="coach-correct-sets-b" min="0" max="${maxSets}" value="${match.player_b_sets_won || 0}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold">
                            <div class="text-xs text-gray-600 mt-1 text-center truncate">${escapeHtml(playerBName)}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="cancel-coach-correct-match" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button type="button" id="save-coach-correct-match" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg font-medium">Korrigieren</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-coach-correct-match').addEventListener('click', closeModal);
    modal.querySelector('#cancel-coach-correct-match').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#save-coach-correct-match').addEventListener('click', async () => {
        const setsA = parseInt(modal.querySelector('#coach-correct-sets-a').value) || 0;
        const setsB = parseInt(modal.querySelector('#coach-correct-sets-b').value) || 0;

        if (setsA + setsB > maxSets) { showToast(`Maximal ${maxSets} Saetze`, 'error'); return; }
        if (setsA !== setsToWin && setsB !== setsToWin) { showToast(`Ein Spieler muss ${setsToWin} Saetze gewinnen`, 'error'); return; }
        if (setsA === setsB) { showToast('Unentschieden nicht moeglich', 'error'); return; }

        const saveBtn = modal.querySelector('#save-coach-correct-match');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Speichere...';

        try {
            const newWinnerId = setsA > setsB ? match.player_a_id : match.player_b_id;

            const { error: tmError } = await supabase
                .from('tournament_matches')
                .update({ player_a_sets_won: setsA, player_b_sets_won: setsB, winner_id: newWinnerId })
                .eq('id', match.id);

            if (tmError) throw tmError;

            if (match.match_id) {
                await supabase
                    .from('matches')
                    .update({
                        player_a_sets_won: setsA, player_b_sets_won: setsB,
                        winner_id: newWinnerId, loser_id: setsA > setsB ? match.player_b_id : match.player_a_id
                    })
                    .eq('id', match.match_id);
            }

            await recalculateCoachTournamentStandings(tournament.id);

            showToast('Ergebnis korrigiert!', 'success');
            closeModal();
            await refreshDetailsView();
            await loadCoachTournaments();
        } catch (err) {
            console.error('[Coach Tournaments] Error correcting match:', err);
            showToast('Fehler: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Korrigieren';
        }
    });
}

/**
 * Recalculate tournament standings
 */
async function recalculateCoachTournamentStandings(tournamentId) {
    try {
        const { data: matches, error: mErr } = await supabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('status', 'completed');

        if (mErr) throw mErr;

        const { data: participants, error: pErr } = await supabase
            .from('tournament_participants')
            .select('player_id')
            .eq('tournament_id', tournamentId);

        if (pErr) throw pErr;

        const standingsData = {};
        participants.forEach(p => {
            standingsData[p.player_id] = {
                player_id: p.player_id, tournament_id: tournamentId,
                matches_played: 0, matches_won: 0, matches_lost: 0,
                sets_won: 0, sets_lost: 0, tournament_points: 0
            };
        });

        matches.forEach(m => {
            if (!m.player_a_id || !m.player_b_id) return;

            if (standingsData[m.player_a_id]) {
                standingsData[m.player_a_id].matches_played++;
                standingsData[m.player_a_id].sets_won += m.player_a_sets_won || 0;
                standingsData[m.player_a_id].sets_lost += m.player_b_sets_won || 0;
                if (m.winner_id === m.player_a_id) {
                    standingsData[m.player_a_id].matches_won++;
                    standingsData[m.player_a_id].tournament_points += 2;
                } else {
                    standingsData[m.player_a_id].matches_lost++;
                }
            }

            if (standingsData[m.player_b_id]) {
                standingsData[m.player_b_id].matches_played++;
                standingsData[m.player_b_id].sets_won += m.player_b_sets_won || 0;
                standingsData[m.player_b_id].sets_lost += m.player_a_sets_won || 0;
                if (m.winner_id === m.player_b_id) {
                    standingsData[m.player_b_id].matches_won++;
                    standingsData[m.player_b_id].tournament_points += 2;
                } else {
                    standingsData[m.player_b_id].matches_lost++;
                }
            }
        });

        const sortedStandings = Object.values(standingsData).sort((a, b) => {
            if (b.tournament_points !== a.tournament_points) return b.tournament_points - a.tournament_points;
            const aDiff = a.sets_won - a.sets_lost;
            const bDiff = b.sets_won - b.sets_lost;
            if (bDiff !== aDiff) return bDiff - aDiff;
            return b.sets_won - a.sets_won;
        });

        sortedStandings.forEach((s, i) => { s.rank = i + 1; });

        await supabase.from('tournament_standings').delete().eq('tournament_id', tournamentId);

        if (sortedStandings.length > 0) {
            const { error: insertErr } = await supabase.from('tournament_standings').insert(sortedStandings);
            if (insertErr) throw insertErr;
        }
    } catch (err) {
        console.error('[Coach Tournaments] Error recalculating standings:', err);
    }
}
