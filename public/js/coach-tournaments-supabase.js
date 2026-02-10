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

function getBracketLabel(bracketType) {
    const labels = {
        'winners': 'Hauptrunde',
        'losers': 'Zweite Chance',
        'finals': 'Finale',
        'grand_finals': 'Entscheidung'
    };
    return labels[bracketType] || 'Hauptrunde';
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
            // Show tournaments created by this coach that are not completed/cancelled
            tournaments = all.filter(t => t.status !== 'completed' && t.status !== 'cancelled' && t.created_by === userId);
        } else if (currentFilter === 'completed') {
            // Show both completed and cancelled tournaments
            const allCompleted = await getTournaments('completed');
            const allCancelled = await getTournaments('cancelled');
            tournaments = [...allCompleted, ...allCancelled].sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            );
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

            ${tournament.tournament_matches?.length > 0 && tournament.format === 'round_robin' ? `
                <div>
                    <h4 class="font-bold text-gray-800 mb-3"><i class="fas fa-table mr-2"></i>Kreuztabelle</h4>
                    ${renderCrossTable(tournament.tournament_participants || [], tournament.tournament_matches || [], tournament.tournament_standings || [])}
                </div>
            ` : ''}

            ${tournament.tournament_matches?.length > 0 ? `
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h4 class="font-bold text-gray-800"><i class="fas fa-table-tennis-paddle-ball mr-2"></i>Spiele</h4>
                        <div class="flex items-center gap-2">
                            <select id="coach-rounds-filter" class="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
                                <option value="remaining" selected>Übrige Runden</option>
                                <option value="completed">Abgeschlossene</option>
                                <option value="all">Alle Runden</option>
                            </select>
                            ${tournament.status === 'in_progress' && isCreator ? `
                                <button id="coach-quick-match-entry-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-1.5 px-3 rounded-lg font-medium">
                                    <i class="fas fa-bolt mr-1"></i>Eintragen
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div id="coach-matches-container">
                        ${renderMatches(tournament.tournament_matches || [], isCreator, 'remaining')}
                    </div>
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

    // Delete button for cancelled tournaments (only creator can delete)
    if (isCreator && tournament.status === 'cancelled') {
        buttons.push(`<button id="coach-delete-tournament-btn" class="bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg font-medium" title="Löschen"><i class="fas fa-trash"></i></button>`);
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

function renderMatches(matches, isCreator = false, filter = 'all') {
    if (!matches.length) return '<p class="text-gray-400 text-sm">Noch keine Spiele</p>';

    // Check if this is a Double Elimination tournament (has bracket_type)
    const hasDoubleElim = matches.some(m => m.bracket_type && m.bracket_type !== 'winners');
    if (hasDoubleElim || matches.some(m => m.bracket_type === 'winners')) {
        return renderDoubleEliminationMatches(matches, isCreator, filter);
    }

    const byRound = {};
    matches.forEach(m => { const r = m.round_number || 1; if (!byRound[r]) byRound[r] = []; byRound[r].push(m); });

    // Determine which rounds to show based on filter
    const filteredRounds = Object.keys(byRound).sort((a, b) => a - b).filter(round => {
        const rm = byRound[round];
        const actual = rm.filter(m => m.player_b_id !== null);
        const completedCount = actual.filter(m => m.status === 'completed').length;
        const isRoundCompleted = completedCount === actual.length && actual.length > 0;

        if (filter === 'remaining') return !isRoundCompleted;
        if (filter === 'completed') return isRoundCompleted;
        return true; // 'all'
    });

    if (!filteredRounds.length) {
        if (filter === 'remaining') return '<p class="text-gray-400 text-sm"><i class="fas fa-check-circle text-green-500 mr-2"></i>Alle Runden abgeschlossen!</p>';
        if (filter === 'completed') return '<p class="text-gray-400 text-sm">Noch keine Runden abgeschlossen</p>';
        return '<p class="text-gray-400 text-sm">Noch keine Spiele</p>';
    }

    return filteredRounds.map(round => {
        const rm = byRound[round];
        // Echte Matches: beide Spieler vorhanden
        const actual = rm.filter(m => m.player_a_id && m.player_b_id);
        // Freilose: genau ein Spieler vorhanden (nicht beide null!)
        const byes = rm.filter(m => (m.player_a_id && !m.player_b_id) || (!m.player_a_id && m.player_b_id));
        const completed = actual.filter(m => m.status === 'completed').length;

        return `<div class="mb-4">
            <div class="flex items-center justify-between mb-2">
                <h5 class="text-sm font-semibold text-gray-700"><i class="fas fa-layer-group mr-1"></i>Runde ${round}</h5>
                <span class="text-xs text-gray-500">${completed}/${actual.length} abgeschlossen</span>
            </div>
            <div class="space-y-2">
                ${actual.map(m => renderMatchCard(m, isCreator)).join('')}
                ${byes.map(m => renderByeCard(m)).join('')}
            </div>
        </div>`;
    }).join('');
}

function renderDoubleEliminationMatches(matches, isCreator = false, filter = 'all') {
    // Group by bracket type
    const brackets = { winners: [], losers: [], finals: [], grand_finals: [] };
    matches.forEach(m => {
        const type = m.bracket_type || 'winners';
        if (brackets[type]) brackets[type].push(m);
    });

    // Check if we have any matches
    const hasWinners = brackets.winners.length > 0;
    const hasLosers = brackets.losers.length > 0;
    const hasFinalsData = [...brackets.finals, ...brackets.grand_finals].some(m => m.player_a_id || m.player_b_id);

    if (!hasWinners && !hasLosers && !hasFinalsData) {
        if (filter === 'remaining') return '<p class="text-gray-400 text-sm">Alle Spiele abgeschlossen!</p>';
        if (filter === 'completed') return '<p class="text-gray-400 text-sm">Noch keine Spiele abgeschlossen</p>';
        return '<p class="text-gray-400 text-sm">Noch keine Spiele</p>';
    }

    // Generate unique ID for this bracket instance
    const bracketId = 'coach-bracket-' + Math.random().toString(36).substr(2, 9);

    // Prepare bracket data for tabs
    const bracketData = {
        winners: prepareBracketData(brackets.winners, 'winners', filter),
        losers: prepareBracketData(brackets.losers, 'losers', filter),
        finals: prepareFinalsData([...brackets.finals, ...brackets.grand_finals], filter),
        allMatches: matches // Store all matches for tree view
    };

    // Determine default active bracket
    let defaultBracket = 'winners';
    if (!bracketData.winners.rounds.length && bracketData.losers.rounds.length) defaultBracket = 'losers';
    if (!bracketData.winners.rounds.length && !bracketData.losers.rounds.length && bracketData.finals.matches.length) defaultBracket = 'finals';

    let html = `<div class="bracket-tabs-container" id="${bracketId}" data-is-creator="${isCreator}">`;

    // View Mode Toggle (List vs Tree)
    html += `
        <div class="bracket-view-toggle">
            <button class="bracket-view-btn active" data-view="list" title="Listenansicht">
                <i class="fas fa-list"></i> Liste
            </button>
            <button class="bracket-view-btn" data-view="tree" title="Baumansicht">
                <i class="fas fa-sitemap"></i> Baum
            </button>
        </div>
    `;

    // Bracket Type Toggle with colored indicators
    html += '<div class="bracket-type-toggle">';
    if (hasWinners) {
        html += `<button class="bracket-type-btn winners ${defaultBracket === 'winners' ? 'active' : ''}" data-bracket="winners">
            <span class="bracket-indicator" style="background:#16a34a;"></span>
            Hauptrunde
        </button>`;
    }
    if (hasLosers) {
        html += `<button class="bracket-type-btn losers ${defaultBracket === 'losers' ? 'active' : ''}" data-bracket="losers">
            <span class="bracket-indicator" style="background:#dc2626;"></span>
            Zweite Chance
        </button>`;
    }
    if (hasFinalsData) {
        html += `<button class="bracket-type-btn finals ${defaultBracket === 'finals' ? 'active' : ''}" data-bracket="finals">
            <span class="bracket-indicator" style="background:#7c3aed;"></span>
            Finale
        </button>`;
    }
    html += '</div>';

    // Store bracket data in a data attribute
    html += `<script type="application/json" id="${bracketId}-data">${JSON.stringify(bracketData)}</script>`;

    // Round Tabs (will be populated by JS)
    html += `<div class="bracket-round-tabs" id="${bracketId}-round-tabs"></div>`;

    // Content Area
    html += `<div class="bracket-content" id="${bracketId}-content"></div>`;

    html += '</div>';

    // Initialize after DOM insertion
    setTimeout(() => initBracketTabs(bracketId, defaultBracket), 0);

    return html;
}

function prepareBracketData(bracketMatches, bracketType, filter) {
    const byRound = {};
    bracketMatches.forEach(m => {
        const r = m.round_number || 1;
        if (!byRound[r]) byRound[r] = [];
        byRound[r].push(m);
    });

    const allRounds = Object.keys(byRound).sort((a, b) => a - b);
    const totalRounds = allRounds.length;

    const rounds = allRounds.map(round => {
        const roundMatches = byRound[round];
        const roundNum = parseInt(round);
        const actual = roundMatches.filter(m => m.player_a_id && m.player_b_id);
        const completed = actual.filter(m => m.status === 'completed').length;
        const isCompleted = completed === actual.length && actual.length > 0;
        const hasWaiting = roundMatches.some(m => !m.player_a_id || !m.player_b_id);

        // Apply filter
        if (filter === 'remaining' && isCompleted && !hasWaiting) return null;
        if (filter === 'completed' && !completed) return null;

        // Determine round name
        let name;
        if (bracketType === 'winners') {
            if (roundNum === totalRounds) name = 'Finale WB';
            else if (roundNum === totalRounds - 1) name = 'Halbfinale';
            else if (roundNum === totalRounds - 2) name = 'Viertelfinale';
            else if (roundNum === totalRounds - 3) name = 'Achtelfinale';
            else name = `Runde ${roundNum}`;
        } else {
            name = `Runde ${roundNum}`;
        }

        return {
            number: roundNum,
            name: name,
            matches: roundMatches,
            completed: completed,
            total: actual.length,
            status: isCompleted ? 'completed' : (completed > 0 ? 'in-progress' : 'pending')
        };
    }).filter(r => r !== null);

    return { rounds, bracketType };
}

function prepareFinalsData(finalsMatches, filter) {
    const grandFinal = finalsMatches.find(m => m.bracket_type === 'finals');
    const resetMatch = finalsMatches.find(m => m.bracket_type === 'grand_finals');

    const matches = [];
    if (grandFinal && (grandFinal.player_a_id || grandFinal.player_b_id)) {
        matches.push({ ...grandFinal, label: 'Grand Final' });
    }
    if (resetMatch && (resetMatch.player_a_id || resetMatch.player_b_id)) {
        matches.push({ ...resetMatch, label: 'Reset Match' });
    }

    // Apply filter
    const hasCompleted = matches.some(m => m.status === 'completed');
    if (filter === 'completed' && !hasCompleted) return { matches: [] };
    if (filter === 'remaining' && matches.every(m => m.status === 'completed')) return { matches: [] };

    return { matches };
}

function initBracketTabs(bracketId, defaultBracket) {
    const container = document.getElementById(bracketId);
    if (!container) return;

    const dataEl = document.getElementById(`${bracketId}-data`);
    if (!dataEl) return;

    const bracketData = JSON.parse(dataEl.textContent);
    const isCreator = container.dataset.isCreator === 'true';
    let currentView = 'list';
    let currentBracket = defaultBracket;

    // View mode toggle (List vs Tree)
    container.querySelectorAll('.bracket-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.bracket-view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;

            // Toggle visibility of bracket type buttons and round tabs
            const bracketTypeToggle = container.querySelector('.bracket-type-toggle');
            const roundTabs = container.querySelector('.bracket-round-tabs');

            if (currentView === 'tree') {
                if (bracketTypeToggle) bracketTypeToggle.style.display = 'none';
                if (roundTabs) roundTabs.style.display = 'none';
                renderBracketTreeView(bracketId, bracketData, isCreator);
            } else {
                if (bracketTypeToggle) bracketTypeToggle.style.display = 'flex';
                if (roundTabs) roundTabs.style.display = 'flex';
                renderBracketRoundTabs(bracketId, currentBracket, bracketData, isCreator);
            }
        });
    });

    // Bracket type toggle
    container.querySelectorAll('.bracket-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.bracket-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentBracket = btn.dataset.bracket;
            renderBracketRoundTabs(bracketId, currentBracket, bracketData, isCreator);
        });
    });

    // Initial render
    renderBracketRoundTabs(bracketId, defaultBracket, bracketData, isCreator);
}

// Render full bracket tree view (interactive version)
function renderBracketTreeView(bracketId, bracketData, isCreator) {
    const contentContainer = document.getElementById(`${bracketId}-content`);
    if (!contentContainer) return;

    const allMatches = bracketData.allMatches || [];
    const brackets = { winners: [], losers: [], finals: [], grand_finals: [] };
    allMatches.forEach(m => {
        const type = m.bracket_type || 'winners';
        if (brackets[type]) brackets[type].push(m);
    });

    // Group by rounds
    const groupByRound = (arr) => {
        const byRound = {};
        arr.forEach(m => {
            const r = m.round_number || 1;
            if (!byRound[r]) byRound[r] = [];
            byRound[r].push(m);
        });
        Object.keys(byRound).forEach(r => {
            byRound[r].sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0));
        });
        return byRound;
    };

    const wbRounds = groupByRound(brackets.winners);
    const lbRounds = groupByRound(brackets.losers);
    const wbRoundNums = Object.keys(wbRounds).sort((a, b) => a - b);
    const lbRoundNums = Object.keys(lbRounds).sort((a, b) => a - b);
    const totalWbRounds = wbRoundNums.length;

    // Get round name
    const getRoundName = (roundNum, total, bracketType) => {
        const num = parseInt(roundNum);
        if (bracketType === 'winners') {
            if (num === total) return 'WB Finale';
            if (num === total - 1) return 'Halbfinale';
            if (num === total - 2) return 'Viertelfinale';
            if (num === total - 3) return 'Achtelfinale';
            return `Runde ${num}`;
        }
        return `LB Runde ${num}`;
    };

    // Render single match for tree view
    const renderTreeMatch = (m) => {
        const playerA = getPlayerName(m.player_a);
        const playerB = getPlayerName(m.player_b);
        const isCompleted = m.status === 'completed';
        const aWon = m.winner_id === m.player_a_id;
        const bWon = m.winner_id === m.player_b_id;
        const isBye = (m.player_a_id && !m.player_b_id) || (!m.player_a_id && m.player_b_id);
        const isWaiting = !m.player_a_id && !m.player_b_id;

        if (isWaiting) {
            return `<div class="bracket-match waiting tree-match"><div class="bracket-player"><span class="bracket-player-tbd">TBD</span></div><div class="bracket-player"><span class="bracket-player-tbd">TBD</span></div></div>`;
        }

        return `
            <div class="bracket-match ${isCompleted ? 'completed' : (isBye ? 'bye' : 'pending')} tree-match" data-match-id="${m.id}">
                <div class="bracket-player ${aWon ? 'winner' : (isCompleted && bWon ? 'loser' : '')}">
                    <span class="bracket-player-name">${m.player_a_id ? escapeHtml(playerA) : '<span class="bracket-player-tbd">TBD</span>'}</span>
                    ${isCompleted && !isBye ? `<span class="bracket-player-score">${m.player_a_sets_won || 0}</span>` : ''}
                    ${isBye && m.player_a_id ? '<span class="bracket-bye-label">Freilos</span>' : ''}
                </div>
                <div class="bracket-player ${bWon ? 'winner' : (isCompleted && aWon ? 'loser' : '')}">
                    <span class="bracket-player-name">${m.player_b_id ? escapeHtml(playerB) : '<span class="bracket-player-tbd">TBD</span>'}</span>
                    ${isCompleted && !isBye ? `<span class="bracket-player-score">${m.player_b_sets_won || 0}</span>` : ''}
                    ${isBye && m.player_b_id ? '<span class="bracket-bye-label">Freilos</span>' : ''}
                </div>
            </div>
        `;
    };

    let html = '<div class="bracket-tree-container">';

    // Winners Bracket
    if (wbRoundNums.length > 0) {
        html += `
            <div class="bracket-section tree-section">
                <div class="bracket-section-header winners">
                    <span class="bracket-indicator" style="background:#16a34a;"></span>
                    Hauptrunde (Winners Bracket)
                </div>
                <div class="bracket-tree-wrapper">
        `;

        wbRoundNums.forEach((roundNum, idx) => {
            const roundMatches = wbRounds[roundNum] || [];
            const roundName = getRoundName(roundNum, totalWbRounds, 'winners');
            html += `
                <div class="bracket-tree-round" style="--round-index: ${idx};">
                    <div class="bracket-round-header">${roundName}</div>
                    <div class="bracket-round-matches">
                        ${roundMatches.map(m => renderTreeMatch(m)).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
    }

    // Losers Bracket (filter out empty matches)
    const hasLBMatches = lbRoundNums.some(rn => (lbRounds[rn] || []).some(m => m.player_a_id || m.player_b_id));
    if (hasLBMatches) {
        html += `
            <div class="bracket-section tree-section">
                <div class="bracket-section-header losers">
                    <span class="bracket-indicator" style="background:#dc2626;"></span>
                    Zweite Chance (Losers Bracket)
                </div>
                <div class="bracket-tree-wrapper losers-tree">
        `;

        lbRoundNums.forEach((roundNum, idx) => {
            const roundMatches = (lbRounds[roundNum] || []).filter(m => m.player_a_id || m.player_b_id);
            if (roundMatches.length === 0) return;

            html += `
                <div class="bracket-tree-round">
                    <div class="bracket-round-header">LB Runde ${roundNum}</div>
                    <div class="bracket-round-matches">
                        ${roundMatches.map(m => renderTreeMatch(m)).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div></div>';
    }

    // Finals
    const grandFinal = brackets.finals[0];
    const resetMatch = brackets.grand_finals[0];
    if ((grandFinal && (grandFinal.player_a_id || grandFinal.player_b_id)) || (resetMatch && (resetMatch.player_a_id || resetMatch.player_b_id))) {
        html += `
            <div class="bracket-section tree-section">
                <div class="bracket-section-header finals">
                    <span class="bracket-indicator" style="background:#7c3aed;"></span>
                    Entscheidung
                </div>
                <div class="bracket-finals-container">
        `;

        if (grandFinal && (grandFinal.player_a_id || grandFinal.player_b_id)) {
            html += `<div class="bracket-grand-final-wrapper"><div class="bracket-final-label">Grand Final</div>${renderTreeMatch(grandFinal)}</div>`;
        }
        if (resetMatch && (resetMatch.player_a_id || resetMatch.player_b_id)) {
            html += `<div class="bracket-reset-wrapper"><div class="bracket-final-label">Reset Match</div>${renderTreeMatch(resetMatch)}</div>`;
        }

        html += '</div></div>';
    }

    html += '</div>';
    contentContainer.innerHTML = html;
}

function renderBracketRoundTabs(bracketId, bracketType, bracketData, isCreator) {
    const tabsContainer = document.getElementById(`${bracketId}-round-tabs`);
    const contentContainer = document.getElementById(`${bracketId}-content`);
    if (!tabsContainer || !contentContainer) return;

    if (bracketType === 'finals') {
        // Finals don't have rounds - show directly
        tabsContainer.innerHTML = '';
        renderFinalsContent(contentContainer, bracketData.finals, isCreator);
        return;
    }

    const data = bracketData[bracketType];
    if (!data || !data.rounds.length) {
        tabsContainer.innerHTML = '';
        contentContainer.innerHTML = '<div class="bracket-empty-state">Keine Spiele in dieser Kategorie</div>';
        return;
    }

    // Render round tabs
    tabsContainer.innerHTML = data.rounds.map((round, idx) => `
        <button class="bracket-round-tab ${idx === 0 ? 'active' : ''}" data-round="${round.number}">
            ${round.name}
            <span class="round-status ${round.status}"></span>
        </button>
    `).join('');

    // Tab click handlers
    tabsContainer.querySelectorAll('.bracket-round-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            tabsContainer.querySelectorAll('.bracket-round-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const round = data.rounds.find(r => r.number === parseInt(tab.dataset.round));
            if (round) renderRoundContent(contentContainer, round, isCreator);
        });
    });

    // Render first round
    renderRoundContent(contentContainer, data.rounds[0], isCreator);
}

function renderRoundContent(container, round, isCreator) {
    container.innerHTML = `
        <div class="bracket-round-content">
            <div class="bracket-round-info">
                <span class="bracket-round-title">${round.name}</span>
                <span class="bracket-round-progress">${round.completed}/${round.total} abgeschlossen</span>
            </div>
            <div class="bracket-matches-list">
                ${round.matches.map(m => renderBracketMatch(m, isCreator)).join('')}
            </div>
        </div>
    `;
}

function renderFinalsContent(container, finalsData, isCreator) {
    if (!finalsData.matches.length) {
        container.innerHTML = '<div class="bracket-empty-state">Finale noch nicht bereit</div>';
        return;
    }

    container.innerHTML = `
        <div class="bracket-round-content">
            <div class="bracket-finals">
                ${finalsData.matches.map(m => `
                    <div class="${m.bracket_type === 'grand_finals' ? 'bracket-reset-match' : 'bracket-grand-final'}">
                        <div class="text-xs text-center text-gray-500 mb-2">${m.label}</div>
                        ${renderBracketMatch(m, isCreator)}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderBracketMatch(match, isCreator) {
    const playerA = getPlayerName(match.player_a);
    const playerB = getPlayerName(match.player_b);
    const isCompleted = match.status === 'completed';
    const isWaiting = !match.player_a_id || !match.player_b_id;

    let statusClass = 'pending';
    if (isCompleted) statusClass = 'completed';
    else if (isWaiting) statusClass = 'waiting';

    const aWon = match.winner_id === match.player_a_id;
    const bWon = match.winner_id === match.player_b_id;

    return `
        <div class="bracket-match ${statusClass}" data-match-id="${match.id}">
            <div class="bracket-player ${isCompleted && aWon ? 'winner' : ''} ${isCompleted && !aWon ? 'loser' : ''}">
                <span class="bracket-player-name" title="${escapeHtml(playerA)}">
                    ${match.player_a_id ? escapeHtml(playerA) : '<span class="bracket-player-tbd">TBD</span>'}
                </span>
                ${isCompleted ? `<span class="bracket-player-score">${match.player_a_sets_won || 0}</span>` : ''}
            </div>
            <div class="bracket-player ${isCompleted && bWon ? 'winner' : ''} ${isCompleted && !bWon ? 'loser' : ''}">
                <span class="bracket-player-name" title="${escapeHtml(playerB)}">
                    ${match.player_b_id ? escapeHtml(playerB) : '<span class="bracket-player-tbd">TBD</span>'}
                </span>
                ${isCompleted ? `<span class="bracket-player-score">${match.player_b_sets_won || 0}</span>` : ''}
            </div>
            ${isCompleted && isCreator ? `<button class="coach-correct-match-btn bracket-match-status" data-match-id="${match.id}" title="Korrigieren"><i class="fas fa-edit text-indigo-500"></i></button>` : ''}
            ${!isCompleted && !isWaiting ? '<span class="bracket-match-status"><i class="fas fa-clock text-yellow-500"></i></span>' : ''}
        </div>`;
}

function renderMatchCard(match, isCreator) {
    const a = getPlayerName(match.player_a);
    const b = getPlayerName(match.player_b);
    const done = match.status === 'completed';
    return `<div class="bg-white border border-gray-200 rounded-lg p-3">
        <div class="flex items-center justify-between">
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <span class="${match.winner_id === match.player_a_id ? 'font-bold text-gray-900' : 'text-gray-700'}">${escapeHtml(a)}</span>
                    ${done ? `<span class="text-sm font-mono">${match.player_a_sets_won || 0}</span>` : ''}
                </div>
                <div class="flex items-center gap-2">
                    <span class="${match.winner_id === match.player_b_id ? 'font-bold text-gray-900' : 'text-gray-700'}">${escapeHtml(b)}</span>
                    ${done ? `<span class="text-sm font-mono">${match.player_b_sets_won || 0}</span>` : ''}
                </div>
            </div>
            <div class="flex items-center gap-2">
                ${done
                    ? '<span class="text-xs text-gray-500"><i class="fas fa-check text-green-500 mr-1"></i>Gespielt</span>'
                    : '<span class="text-xs text-gray-500"><i class="fas fa-clock text-yellow-500 mr-1"></i>Ausstehend</span>'}
                ${done && isCreator ? `<button class="coach-correct-match-btn text-xs text-indigo-600 hover:text-indigo-800 ml-2" data-match-id="${match.id}" title="Korrigieren"><i class="fas fa-edit"></i></button>` : ''}
            </div>
        </div>
    </div>`;
}

function renderByeCard(match) {
    // Nimm den Spieler, der existiert (entweder player_a oder player_b)
    const player = match.player_a_id ? match.player_a : match.player_b;
    const name = getPlayerName(player);
    return `<div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2"><i class="fas fa-coffee text-gray-400"></i><span class="text-gray-700">${escapeHtml(name)}</span></div>
            <span class="text-xs text-gray-500 italic">Freilos</span>
        </div>
    </div>`;
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
    document.getElementById('coach-delete-tournament-btn')?.addEventListener('click', () => handleCoachDeleteTournament(tournament));

    // Match correction buttons
    document.querySelectorAll('.coach-correct-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const matchId = btn.dataset.matchId;
            const match = tournament.tournament_matches?.find(m => m.id === matchId);
            if (match) openCoachCorrectMatchModal(match, tournament);
        });
    });

    // Rounds filter dropdown
    const roundsFilter = document.getElementById('coach-rounds-filter');
    if (roundsFilter) {
        roundsFilter.addEventListener('change', () => {
            const filter = roundsFilter.value;
            const container = document.getElementById('coach-matches-container');
            if (container) {
                container.innerHTML = renderMatches(tournament.tournament_matches || [], isCreator, filter);
                // Re-attach correction button listeners
                document.querySelectorAll('.coach-correct-match-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const matchId = btn.dataset.matchId;
                        const match = tournament.tournament_matches?.find(m => m.id === matchId);
                        if (match) openCoachCorrectMatchModal(match, tournament);
                    });
                });
            }
        });
    }
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
    const formatName = getTournamentFormatName(tournament.format);
    const isDoubleElim = tournament.format === 'double_elimination' || tournament.format === 'double_elim_32';

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
                <div class="mb-3 p-2 bg-gray-50 rounded-lg">
                    <div class="text-sm font-medium text-gray-800">${escapeHtml(tournament.name)}</div>
                    <div class="text-xs text-gray-500 mt-1">${formatName} | ${getMatchModeName(matchMode)}</div>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Match auswaehlen</label>
                    <select id="coach-quick-match-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="">-- Bitte waehlen --</option>
                        ${pendingMatches.map(m => {
                            const a = getPlayerName(m.player_a);
                            const b = getPlayerName(m.player_b);
                            const bracketLabel = isDoubleElim ? getBracketLabel(m.bracket_type) + ' - ' : '';
                            return `<option value="${m.id}">${bracketLabel}Runde ${m.round_number}: ${escapeHtml(a)} vs ${escapeHtml(b)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div id="coach-quick-match-form" class="hidden space-y-4">
                    <div class="flex gap-2 mb-2">
                        <button type="button" class="coach-entry-mode flex-1 py-1.5 px-3 text-sm font-medium rounded-lg bg-indigo-600 text-white" data-mode="quick">Schnell (Saetze)</button>
                        <button type="button" class="coach-entry-mode flex-1 py-1.5 px-3 text-sm font-medium rounded-lg bg-gray-200 text-gray-700" data-mode="detailed">Detail (Punkte)</button>
                    </div>

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

                    <div id="coach-quick-mode-detailed" class="hidden">
                        <div class="flex justify-between items-center mb-2">
                            <span id="coach-detail-player-a-name" class="text-xs font-medium text-gray-700 truncate max-w-[40%]"></span>
                            <span id="coach-detail-player-b-name" class="text-xs font-medium text-gray-700 truncate max-w-[40%] text-right"></span>
                        </div>
                        <div id="coach-detail-sets-container" class="space-y-2"></div>
                        <div id="coach-detail-result-preview" class="mt-2 text-center text-sm font-medium text-gray-600"></div>
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
    let entryMode = 'quick';

    // Mode toggle
    modal.querySelectorAll('.coach-entry-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            entryMode = btn.dataset.mode;
            modal.querySelectorAll('.coach-entry-mode').forEach(b => {
                b.classList.toggle('bg-indigo-600', b.dataset.mode === entryMode);
                b.classList.toggle('text-white', b.dataset.mode === entryMode);
                b.classList.toggle('bg-gray-200', b.dataset.mode !== entryMode);
                b.classList.toggle('text-gray-700', b.dataset.mode !== entryMode);
            });
            modal.querySelector('#coach-quick-mode-sets').classList.toggle('hidden', entryMode !== 'quick');
            modal.querySelector('#coach-quick-mode-detailed').classList.toggle('hidden', entryMode !== 'detailed');
        });
    });

    function renderDetailedSets() {
        const container = modal.querySelector('#coach-detail-sets-container');
        container.innerHTML = '';
        for (let i = 0; i < maxSets; i++) {
            container.innerHTML += `
                <div class="grid grid-cols-3 gap-2 items-center">
                    <input type="number" min="0" class="coach-detail-score-a w-full px-2 py-1.5 border border-gray-300 rounded text-center text-sm" data-set="${i}" placeholder="0">
                    <div class="text-center text-gray-400 text-xs">Satz ${i + 1}</div>
                    <input type="number" min="0" class="coach-detail-score-b w-full px-2 py-1.5 border border-gray-300 rounded text-center text-sm" data-set="${i}" placeholder="0">
                </div>
            `;
        }
        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', updateDetailedPreview);
        });
    }

    function getDetailedSets() {
        const sets = [];
        for (let i = 0; i < maxSets; i++) {
            const a = parseInt(modal.querySelector(`.coach-detail-score-a[data-set="${i}"]`)?.value) || 0;
            const b = parseInt(modal.querySelector(`.coach-detail-score-b[data-set="${i}"]`)?.value) || 0;
            if (a > 0 || b > 0) sets.push({ playerA: a, playerB: b });
        }
        return sets;
    }

    function updateDetailedPreview() {
        const sets = getDetailedSets();
        let sA = 0, sB = 0;
        for (const s of sets) {
            if (s.playerA > s.playerB) sA++;
            else if (s.playerB > s.playerA) sB++;
        }
        const preview = modal.querySelector('#coach-detail-result-preview');
        if (sets.length > 0) {
            const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
            preview.textContent = `Saetze: ${sA}:${sB} (${setsStr})`;
            preview.className = (sA >= setsToWin || sB >= setsToWin)
                ? 'mt-2 text-center text-sm font-medium text-green-600'
                : 'mt-2 text-center text-sm font-medium text-gray-600';
        } else {
            preview.textContent = '';
        }
    }

    matchSelect.addEventListener('change', () => {
        if (matchSelect.value) {
            selectedMatch = pendingMatches.find(m => m.id === matchSelect.value);
            const nameA = getPlayerName(selectedMatch.player_a);
            const nameB = getPlayerName(selectedMatch.player_b);
            modal.querySelector('#coach-quick-player-a-name').textContent = nameA;
            modal.querySelector('#coach-quick-player-b-name').textContent = nameB;
            modal.querySelector('#coach-detail-player-a-name').textContent = nameA;
            modal.querySelector('#coach-detail-player-b-name').textContent = nameB;
            renderDetailedSets();
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

        let setsA, setsB, setsArray = [];

        if (entryMode === 'quick') {
            setsA = parseInt(modal.querySelector('#coach-quick-sets-a').value) || 0;
            setsB = parseInt(modal.querySelector('#coach-quick-sets-b').value) || 0;
            if (setsA + setsB > maxSets) {
                showToast(`Maximal ${maxSets} Saetze moeglich bei ${getMatchModeName(matchMode)}`, 'error'); return;
            }
            if (Math.max(setsA, setsB) > setsToWin) {
                showToast(`Maximal ${setsToWin} gewonnene Saetze bei ${getMatchModeName(matchMode)}`, 'error'); return;
            }
            if (setsA !== setsToWin && setsB !== setsToWin) {
                showToast(`Ein Spieler muss ${setsToWin} Saetze gewinnen (${getMatchModeName(matchMode)})`, 'error'); return;
            }
        } else {
            setsArray = getDetailedSets();
            if (setsArray.length === 0) { showToast('Bitte Satzpunkte eingeben', 'error'); return; }
            setsA = 0; setsB = 0;
            for (const s of setsArray) {
                if (s.playerA > s.playerB) setsA++;
                else if (s.playerB > s.playerA) setsB++;
            }
            if (setsA !== setsToWin && setsB !== setsToWin) {
                showToast(`Ein Spieler muss ${setsToWin} Saetze gewinnen (${getMatchModeName(matchMode)})`, 'error'); return;
            }
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
                    sets: setsArray, club_id: coachUserData.clubId, created_by: getCurrentUserId(),
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
 * Open modal to edit tournament details (name, description, max participants, match mode, handicap)
 */
function openCoachEditTournamentModal(tournament) {
    const isStarted = tournament.status !== 'registration';
    const currentMatchMode = tournament.match_mode || 'best-of-5';

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
                        <input type="number" id="coach-edit-tournament-max" value="${tournament.max_participants}" min="${tournament.tournament_participants?.length || 2}" max="16"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <p class="text-xs text-gray-500 mt-1">Min. ${tournament.tournament_participants?.length || 2}, Max. 16</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Spielmodus</label>
                        <select id="coach-edit-tournament-match-mode" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" ${isStarted ? 'disabled' : ''}>
                            <option value="best-of-5" ${currentMatchMode === 'best-of-5' ? 'selected' : ''}>Best of 5 (Standard)</option>
                            <option value="best-of-3" ${currentMatchMode === 'best-of-3' ? 'selected' : ''}>Best of 3</option>
                            <option value="best-of-7" ${currentMatchMode === 'best-of-7' ? 'selected' : ''}>Best of 7</option>
                        </select>
                        ${isStarted ? '<p class="text-xs text-gray-500 mt-1">Kann nach Turnierstart nicht mehr geändert werden</p>' : ''}
                    </div>
                    <div>
                        <label class="flex items-center gap-3 cursor-pointer ${isStarted ? 'opacity-50' : ''}">
                            <input type="checkbox" id="coach-edit-tournament-handicap" ${tournament.with_handicap ? 'checked' : ''} ${isStarted ? 'disabled' : ''}
                                class="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500">
                            <div>
                                <span class="text-sm font-medium text-gray-700">Handicap aktivieren</span>
                                <p class="text-xs text-gray-500">Elo-basierter Satzvorsprung für schwächere Spieler</p>
                            </div>
                        </label>
                        ${isStarted ? '<p class="text-xs text-gray-500 mt-1">Kann nach Turnierstart nicht mehr geändert werden</p>' : ''}
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
        const maxParticipants = Math.min(16, Math.max(tournament.tournament_participants?.length || 2, parseInt(modal.querySelector('#coach-edit-tournament-max').value) || tournament.max_participants));
        const matchMode = modal.querySelector('#coach-edit-tournament-match-mode').value;
        const withHandicap = modal.querySelector('#coach-edit-tournament-handicap').checked;

        if (!name) { showToast('Name ist erforderlich', 'error'); return; }
        if (maxParticipants > 16) { showToast('Maximum ist 16 Teilnehmer', 'error'); return; }

        const saveBtn = modal.querySelector('#save-coach-edit-tournament');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Speichere...';

        try {
            const updateData = { name, description, max_participants: maxParticipants };
            // Only update match_mode and with_handicap if tournament hasn't started
            if (!isStarted) {
                updateData.match_mode = matchMode;
                updateData.with_handicap = withHandicap;
            }

            const { error } = await supabase
                .from('tournaments')
                .update(updateData)
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
 * Delete a cancelled tournament permanently
 */
async function handleCoachDeleteTournament(tournament) {
    if (tournament.status !== 'cancelled') {
        showToast('Nur abgebrochene Turniere können gelöscht werden', 'error');
        return;
    }

    if (!confirm('Turnier endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
        return;
    }

    try {
        // Delete related data first (foreign key constraints)
        await supabase.from('tournament_standings').delete().eq('tournament_id', tournament.id);
        await supabase.from('tournament_matches').delete().eq('tournament_id', tournament.id);
        await supabase.from('tournament_participants').delete().eq('tournament_id', tournament.id);

        // Delete the tournament itself
        const { error } = await supabase
            .from('tournaments')
            .delete()
            .eq('id', tournament.id);

        if (error) throw error;
        showToast('Turnier gelöscht', 'success');
        closeDetailsModal();
        await loadCoachTournaments();
    } catch (err) {
        console.error('[Coach Tournaments] Error deleting tournament:', err);
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
 * Generate bracket tree HTML for Double Elimination print/PDF
 * Creates a visual tree structure with connecting lines
 */
function generateBracketTreeHtml(matches, participants) {
    // Group matches by bracket type
    const brackets = { winners: [], losers: [], finals: [], grand_finals: [] };
    matches.forEach(m => {
        const type = m.bracket_type || 'winners';
        if (brackets[type]) brackets[type].push(m);
    });

    // Group by rounds - filter empty matches (no players) for cleaner display
    const groupByRound = (arr, filterEmpty = false) => {
        const byRound = {};
        arr.forEach(m => {
            // Skip empty matches if filtering is enabled
            if (filterEmpty && !m.player_a_id && !m.player_b_id) return;
            const r = m.round_number || 1;
            if (!byRound[r]) byRound[r] = [];
            byRound[r].push(m);
        });
        // Sort matches by position within each round
        Object.keys(byRound).forEach(r => {
            byRound[r].sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0));
        });
        return byRound;
    };

    const wbRounds = groupByRound(brackets.winners, false);
    const lbRounds = groupByRound(brackets.losers, true); // Filter empty LB matches
    const wbRoundNums = Object.keys(wbRounds).sort((a, b) => a - b);
    const lbRoundNums = Object.keys(lbRounds).sort((a, b) => a - b);
    const totalWbRounds = wbRoundNums.length;

    // Match box dimensions for tree layout - responsive sizing
    const numParticipants = participants.length;
    const isCompact = numParticipants > 8;
    const matchHeight = isCompact ? 38 : 44;
    const matchWidth = isCompact ? 115 : 130;
    const horizontalGap = isCompact ? 20 : 30;
    const connectorWidth = 15;

    // Helper to get round name
    const getRoundName = (roundNum, total, bracketType) => {
        const num = parseInt(roundNum);
        if (bracketType === 'winners') {
            if (num === total) return 'Finale';
            if (num === total - 1) return 'Halbfinale';
            if (num === total - 2) return 'Viertelfinale';
            if (num === total - 3) return 'Achtelfinale';
            return `Runde ${num}`;
        }
        return `Runde ${num}`;
    };

    // Helper to render a single match box
    const renderMatchBox = (m, showConnectorLeft = false, showConnectorRight = false, isTop = false, isBottom = false) => {
        const playerA = getPlayerName(m.player_a);
        const playerB = getPlayerName(m.player_b);
        const isCompleted = m.status === 'completed';
        const aWon = m.winner_id === m.player_a_id;
        const bWon = m.winner_id === m.player_b_id;
        const scoreA = m.player_a_sets_won || 0;
        const scoreB = m.player_b_sets_won || 0;
        const isBye = (m.player_a_id && !m.player_b_id) || (!m.player_a_id && m.player_b_id);
        const isWaiting = !m.player_a_id && !m.player_b_id;

        // Don't render empty waiting slots (no players yet)
        if (isWaiting) {
            return `
                <div style="position:relative; width:${matchWidth}px; height:${matchHeight}px; margin:2px 0;">
                    <div style="border:1px dashed #ccc; border-radius:3px; font-size:8px; background:#f9fafb; height:100%; display:flex; align-items:center; justify-content:center; color:#9ca3af;">
                        Ausstehend
                    </div>
                </div>
            `;
        }

        return `
            <div style="position:relative; width:${matchWidth}px; height:${matchHeight}px; margin:2px 0;">
                ${showConnectorLeft ? `
                    <div style="position:absolute; left:-${connectorWidth}px; top:50%; width:${connectorWidth}px; height:2px; background:#16a34a;"></div>
                ` : ''}
                ${showConnectorRight ? `
                    <div style="position:absolute; right:-${connectorWidth}px; top:50%; width:${connectorWidth}px; height:2px; background:#16a34a;"></div>
                    ${isTop ? `<div style="position:absolute; right:-${connectorWidth}px; top:50%; width:2px; height:calc(50% + ${matchHeight/2 + 2}px); background:#16a34a;"></div>` : ''}
                    ${isBottom ? `<div style="position:absolute; right:-${connectorWidth}px; bottom:50%; width:2px; height:calc(50% + ${matchHeight/2 + 2}px); background:#16a34a;"></div>` : ''}
                ` : ''}
                <div style="border:1px solid ${isBye ? '#fbbf24' : '#999'}; border-radius:3px; font-size:9px; background:#fff; height:100%; display:flex; flex-direction:column;">
                    <div style="display:flex; justify-content:space-between; padding:2px 4px; border-bottom:1px solid #ddd; flex:1; align-items:center; ${aWon ? 'font-weight:bold; background:#d1fae5;' : ''}${isBye && m.player_a_id ? 'background:#fef3c7;' : ''}">
                        <span style="max-width:${matchWidth - 50}px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.player_a_id ? escapeHtml(playerA) : ''}</span>
                        ${isCompleted && !isBye ? `<span style="font-family:monospace; font-size:10px;">${scoreA}</span>` : ''}
                        ${isBye && m.player_a_id ? '<span style="font-size:7px; color:#92400e; font-style:italic;">Freilos</span>' : ''}
                    </div>
                    <div style="display:flex; justify-content:space-between; padding:2px 4px; flex:1; align-items:center; ${bWon ? 'font-weight:bold; background:#d1fae5;' : ''}${isBye && m.player_b_id ? 'background:#fef3c7;' : ''}">
                        <span style="max-width:${matchWidth - 50}px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.player_b_id ? escapeHtml(playerB) : ''}</span>
                        ${isCompleted && !isBye ? `<span style="font-family:monospace; font-size:10px;">${scoreB}</span>` : ''}
                        ${isBye && m.player_b_id ? '<span style="font-size:7px; color:#92400e; font-style:italic;">Freilos</span>' : ''}
                    </div>
                </div>
            </div>
        `;
    };

    // Render bracket tree with connecting lines
    const renderBracketTree = (roundsMap, roundNums, bracketType, title, bgColor) => {
        if (!roundNums.length) return '';

        const total = roundNums.length;
        // Filter out empty slots from first round for height calculation
        const firstRoundMatches = (roundsMap[roundNums[0]] || []).filter(m => m.player_a_id || m.player_b_id).length || 1;
        const baseMatchHeight = matchHeight + (isCompact ? 12 : 20);
        const treeHeight = Math.max(150, firstRoundMatches * baseMatchHeight);

        let html = `
            <div style="margin-bottom:20px;">
                <div style="background:${bgColor}; color:#fff; padding:8px 12px; font-weight:bold; font-size:13px; border-radius:4px 4px 0 0; display:flex; align-items:center; gap:8px;">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#fff;"></span>
                    ${title}
                </div>
                <div style="border:1px solid #ddd; border-top:none; border-radius:0 0 4px 4px; background:#fafafa; padding:12px; overflow-x:auto;">
                    <div style="display:flex; align-items:flex-start; gap:0; min-height:${treeHeight}px;">
        `;

        roundNums.forEach((roundNum, roundIdx) => {
            const roundMatches = roundsMap[roundNum] || [];
            const roundName = getRoundName(roundNum, total, bracketType);
            const isFirstRound = roundIdx === 0;
            const isLastRound = roundIdx === roundNums.length - 1;

            // Calculate vertical spacing for tree effect
            const spacingMultiplier = Math.pow(2, roundIdx);
            const verticalGap = (matchHeight + 4) * (spacingMultiplier - 1) / 2;

            html += `
                <div style="display:flex; flex-direction:column; align-items:center; min-width:${matchWidth + horizontalGap}px;">
                    <div style="font-size:9px; font-weight:bold; color:#666; margin-bottom:8px; text-align:center; padding:3px 8px; background:#e5e7eb; border-radius:3px;">${roundName}</div>
                    <div style="display:flex; flex-direction:column; justify-content:space-around; height:${treeHeight - 30}px;">
            `;

            roundMatches.forEach((m, matchIdx) => {
                const showConnectorLeft = !isFirstRound;
                const showConnectorRight = !isLastRound;
                const isTop = matchIdx % 2 === 0;
                const isBottom = matchIdx % 2 === 1;

                html += `
                    <div style="display:flex; align-items:center; ${roundIdx > 0 ? `margin:${verticalGap}px 0;` : ''}">
                        ${renderMatchBox(m, showConnectorLeft, showConnectorRight, isTop && showConnectorRight, isBottom && showConnectorRight)}
                    </div>
                `;
            });

            html += '</div></div>';
        });

        html += '</div></div></div>';
        return html;
    };

    // Render Losers Bracket (simpler horizontal layout due to complexity)
    const renderLosersBracket = (roundsMap, roundNums, title, bgColor) => {
        if (!roundNums.length) return '';

        // Calculate number of matches with actual players
        let totalMatches = 0;
        roundNums.forEach(rn => {
            const matches = roundsMap[rn] || [];
            totalMatches += matches.filter(m => m.player_a_id || m.player_b_id).length;
        });

        // Don't render if no matches have players yet
        if (totalMatches === 0) return '';

        let html = `
            <div style="margin-bottom:20px;">
                <div style="background:${bgColor}; color:#fff; padding:8px 12px; font-weight:bold; font-size:13px; border-radius:4px 4px 0 0; display:flex; align-items:center; gap:8px;">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#fff;"></span>
                    ${title}
                </div>
                <div style="border:1px solid #ddd; border-top:none; border-radius:0 0 4px 4px; background:#fff8f8; padding:12px; overflow-x:auto;">
                    <div style="display:flex; gap:15px; align-items:flex-start;">
        `;

        roundNums.forEach((roundNum, roundIdx) => {
            const roundMatches = (roundsMap[roundNum] || []).filter(m => m.player_a_id || m.player_b_id);
            if (roundMatches.length === 0) return; // Skip empty rounds

            html += `
                <div style="min-width:${matchWidth + 10}px;">
                    <div style="font-size:9px; font-weight:bold; color:#991b1b; margin-bottom:8px; text-align:center; padding:3px 8px; background:#fee2e2; border-radius:3px;">LB Runde ${roundNum}</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${roundMatches.map(m => renderMatchBox(m, roundIdx > 0, roundIdx < roundNums.length - 1)).join('')}
                    </div>
                </div>
            `;
        });

        html += '</div></div></div>';
        return html;
    };

    // Render finals
    const renderFinals = () => {
        const grandFinal = brackets.finals[0];
        const resetMatch = brackets.grand_finals[0];

        if (!grandFinal && !resetMatch) return '';

        let html = `
            <div style="margin-bottom:25px; page-break-inside:avoid;">
                <div style="background:#7c3aed; color:#fff; padding:8px 12px; font-weight:bold; font-size:13px; border-radius:4px 4px 0 0; display:flex; align-items:center; gap:8px;">
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#fff;"></span>
                    Entscheidung
                </div>
                <div style="border:1px solid #ddd; border-top:none; border-radius:0 0 4px 4px; background:#faf5ff; padding:15px;">
                    <div style="display:flex; gap:40px; justify-content:center; align-items:center; flex-wrap:wrap;">
        `;

        if (grandFinal) {
            const gfPlayerA = getPlayerName(grandFinal.player_a);
            const gfPlayerB = getPlayerName(grandFinal.player_b);
            const gfCompleted = grandFinal.status === 'completed';
            const gfAWon = grandFinal.winner_id === grandFinal.player_a_id;
            const gfBWon = grandFinal.winner_id === grandFinal.player_b_id;

            html += `
                <div style="text-align:center;">
                    <div style="font-size:10px; font-weight:bold; color:#6b21a8; margin-bottom:8px; padding:4px 12px; background:#e9d5ff; border-radius:4px;">Grand Final</div>
                    <div style="border:2px solid #7c3aed; border-radius:4px; width:150px; background:#fff;">
                        <div style="display:flex; justify-content:space-between; padding:6px 8px; border-bottom:1px solid #ddd; ${gfAWon ? 'font-weight:bold; background:#d1fae5;' : ''}">
                            <span style="font-size:10px; display:flex; align-items:center; gap:4px;">
                                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#16a34a;"></span>
                                ${grandFinal.player_a_id ? escapeHtml(gfPlayerA) : 'TBD'}
                            </span>
                            ${gfCompleted ? `<span style="font-family:monospace;">${grandFinal.player_a_sets_won || 0}</span>` : ''}
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:6px 8px; ${gfBWon ? 'font-weight:bold; background:#d1fae5;' : ''}">
                            <span style="font-size:10px; display:flex; align-items:center; gap:4px;">
                                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#dc2626;"></span>
                                ${grandFinal.player_b_id ? escapeHtml(gfPlayerB) : 'TBD'}
                            </span>
                            ${gfCompleted ? `<span style="font-family:monospace;">${grandFinal.player_b_sets_won || 0}</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size:8px; color:#666; margin-top:4px;">
                        <span style="color:#16a34a;">● Hauptrunde</span> vs <span style="color:#dc2626;">● Zweite Chance</span>
                    </div>
                </div>
            `;
        }

        if (resetMatch && (resetMatch.player_a_id || resetMatch.player_b_id)) {
            const rmPlayerA = getPlayerName(resetMatch.player_a);
            const rmPlayerB = getPlayerName(resetMatch.player_b);
            const rmCompleted = resetMatch.status === 'completed';
            const rmAWon = resetMatch.winner_id === resetMatch.player_a_id;
            const rmBWon = resetMatch.winner_id === resetMatch.player_b_id;

            html += `
                <div style="text-align:center;">
                    <div style="font-size:10px; font-weight:bold; color:#991b1b; margin-bottom:8px; padding:4px 12px; background:#fee2e2; border-radius:4px;">Entscheidungsspiel</div>
                    <div style="border:2px solid #dc2626; border-radius:4px; width:150px; background:#fff;">
                        <div style="display:flex; justify-content:space-between; padding:6px 8px; border-bottom:1px solid #ddd; ${rmAWon ? 'font-weight:bold; background:#d1fae5;' : ''}">
                            <span style="font-size:10px;">${resetMatch.player_a_id ? escapeHtml(rmPlayerA) : 'TBD'}</span>
                            ${rmCompleted ? `<span style="font-family:monospace;">${resetMatch.player_a_sets_won || 0}</span>` : ''}
                        </div>
                        <div style="display:flex; justify-content:space-between; padding:6px 8px; ${rmBWon ? 'font-weight:bold; background:#d1fae5;' : ''}">
                            <span style="font-size:10px;">${resetMatch.player_b_id ? escapeHtml(rmPlayerB) : 'TBD'}</span>
                            ${rmCompleted ? `<span style="font-family:monospace;">${resetMatch.player_b_sets_won || 0}</span>` : ''}
                        </div>
                    </div>
                    <div style="font-size:8px; color:#666; margin-top:4px;">Falls Zweite Chance gewinnt</div>
                </div>
            `;
        }

        html += '</div></div></div>';
        return html;
    };

    // Build complete bracket tree
    let html = '<div style="margin-top:15px;">';
    html += renderBracketTree(wbRounds, wbRoundNums, 'winners', 'Hauptrunde (Winners Bracket)', '#16a34a');
    html += renderLosersBracket(lbRounds, lbRoundNums, 'Zweite Chance (Losers Bracket)', '#dc2626');
    html += renderFinals();
    html += '</div>';

    return html;
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
    const n = participants.length;

    // Adaptive sizing for larger tournaments
    const isLarge = n > 10;
    // Double Elimination always uses landscape for better bracket visibility
    const isDoubleElim = tournament.format === 'double_elimination' || tournament.format === 'double_elim_32';
    const useLandscape = isLarge || isDoubleElim;
    const fontSize = isLarge ? '9px' : '11px';
    const cellPadding = isLarge ? '2px' : '4px';
    const cellWidth = isLarge ? '28px' : '35px';
    const nameCellStyle = isLarge ? 'max-width:100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;' : '';

    // Generate round-robin pairings table (only numbers)
    let roundPairingsHtml = '';
    if (n >= 3 && tournament.format === 'round_robin') {
        const players = Array.from({ length: n }, (_, i) => i + 1);
        if (n % 2 !== 0) players.push(0); // bye placeholder
        const numPlayers = players.length;
        const numRounds = numPlayers - 1;
        const rounds = [];

        for (let r = 0; r < numRounds; r++) {
            const roundPairings = [];
            for (let i = 0; i < numPlayers / 2; i++) {
                const p1 = players[i];
                const p2 = players[numPlayers - 1 - i];
                if (p1 !== 0 && p2 !== 0) {
                    roundPairings.push(`${p1}-${p2}`);
                }
            }
            rounds.push(roundPairings);
            const last = players.pop();
            players.splice(1, 0, last);
        }

        // For large tournaments (>10), split rounds into multiple rows
        const roundsPerRow = isLarge ? 8 : numRounds;
        const roundChunks = [];
        for (let i = 0; i < rounds.length; i += roundsPerRow) {
            roundChunks.push(rounds.slice(i, i + roundsPerRow));
        }

        roundPairingsHtml = `
            <div style="margin-top:20px; border:1px solid #ddd; padding:8px; font-size:${isLarge ? '8px' : '10px'};">
                <strong>Für ${n} Teilnehmer - Rundenpaarungen:</strong>
                ${roundChunks.map((chunk, chunkIdx) => `
                    <table style="margin-top:6px; border-collapse:collapse; ${chunkIdx > 0 ? 'margin-top:10px;' : ''}">
                        <tr style="background:#f3f4f6;">
                            ${chunk.map((_, i) => `<th style="border:1px solid #ddd; padding:2px 4px; text-align:center;">${chunkIdx * roundsPerRow + i + 1}.R.</th>`).join('')}
                        </tr>
                        ${Array.from({ length: Math.max(...chunk.map(r => r.length)) }, (_, rowIdx) => `
                            <tr>
                                ${chunk.map(round => `<td style="border:1px solid #ddd; padding:2px 4px; text-align:center; font-family:monospace;">${round[rowIdx] || ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </table>
                `).join('')}
            </div>
        `;
    }

    // Generate Double Elimination bracket tree for print
    let bracketTreeHtml = '';
    if ((tournament.format === 'double_elimination' || tournament.format === 'double_elim_32') && matches.length > 0) {
        bracketTreeHtml = generateBracketTreeHtml(matches, participants);
    }

    let crossTableHtml = '';
    if (n > 0 && matches.length > 0 && tournament.format !== 'double_elimination' && tournament.format !== 'double_elim_32') {
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
            <table style="width:100%; border-collapse:collapse; font-size:${fontSize}; margin-top:15px;">
                <thead>
                    <tr style="background:#f3f4f6;">
                        <th style="border:1px solid #ddd; padding:${cellPadding}; width:18px;"></th>
                        <th style="border:1px solid #ddd; padding:${cellPadding}; text-align:left; ${nameCellStyle}">Name</th>
                        ${sorted.map((_, i) => `<th style="border:1px solid #ddd; padding:${cellPadding}; width:${cellWidth}; text-align:center;">${i + 1}</th>`).join('')}
                        <th style="border:1px solid #ddd; padding:${cellPadding}; width:${cellWidth};">Sp</th>
                        <th style="border:1px solid #ddd; padding:${cellPadding}; width:${cellWidth};">Satz</th>
                        <th style="border:1px solid #ddd; padding:${cellPadding}; width:22px;">Pl.</th>
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
                            <td style="border:1px solid #ddd; padding:${cellPadding}; text-align:center; font-weight:bold;">${rowIdx + 1}</td>
                            <td style="border:1px solid #ddd; padding:${cellPadding}; ${nameCellStyle}">${escapeHtml(name)}</td>
                            ${sorted.map((colPlayer, colIdx) => {
                                if (rowIdx === colIdx) return `<td style="border:1px solid #ddd; background:#333;"></td>`;
                                const result = results[rowPlayer.player_id]?.[colPlayer.player_id];
                                if (result) {
                                    const won = result.setsA > result.setsB;
                                    return `<td style="border:1px solid #ddd; padding:${cellPadding}; text-align:center; font-family:monospace; ${won ? 'font-weight:bold;' : ''}">${result.setsA}:${result.setsB}</td>`;
                                }
                                return `<td style="border:1px solid #ddd; padding:${cellPadding}; text-align:center; color:#ccc;">-</td>`;
                            }).join('')}
                            <td style="border:1px solid #ddd; padding:${cellPadding}; text-align:center;">${wins}:${losses}</td>
                            <td style="border:1px solid #ddd; padding:${cellPadding}; text-align:center;">${setsW}:${setsL}</td>
                            <td style="border:1px solid #ddd; padding:${cellPadding}; text-align:center; font-weight:bold;">${rank}</td>
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
                body { font-family: Arial, sans-serif; padding: ${isLarge ? '10px' : '20px'}; font-size: ${isLarge ? '12px' : '14px'}; }
                h1 { margin-bottom: 5px; font-size: ${isLarge ? '18px' : '24px'}; }
                .subtitle { color: #666; margin-bottom: 15px; font-size: ${isLarge ? '11px' : '14px'}; }
                .info { display: flex; flex-wrap: wrap; gap: ${isLarge ? '15px' : '30px'}; margin-bottom: 15px; font-size: ${isLarge ? '11px' : '14px'}; }
                .info-item { display: flex; gap: 6px; }
                .info-label { color: #666; }
                ${useLandscape ? '.landscape-hint { background: #fffbeb; border: 1px solid #fcd34d; padding: 8px 12px; border-radius: 4px; margin-bottom: 15px; font-size: 11px; color: #92400e; }' : ''}
                @media print {
                    body { padding: 8px; }
                    @page { size: landscape; }
                    .landscape-hint { display: none; }
                }
            </style>
        </head>
        <body>
            ${useLandscape ? '<div class="landscape-hint"><strong>Tipp:</strong> Für beste Darstellung im Querformat drucken (Landscape)</div>' : ''}
            <h1>${escapeHtml(tournament.name)}</h1>
            <p class="subtitle">${escapeHtml(tournament.description || '')}</p>
            <div class="info">
                <div class="info-item"><span class="info-label">Turniermodus:</span> ${formatName}</div>
                <div class="info-item"><span class="info-label">Spielmodus:</span> ${getMatchModeName(tournament.match_mode)}</div>
                <div class="info-item"><span class="info-label">Handicap:</span> ${tournament.with_handicap ? 'Ja' : 'Nein'}</div>
                <div class="info-item"><span class="info-label">Teilnehmer:</span> ${n}</div>
            </div>
            ${bracketTreeHtml}
            ${crossTableHtml}
            ${roundPairingsHtml}
            <p style="margin-top:20px; font-size:9px; color:#999;">Erstellt am ${new Date().toLocaleDateString('de-DE')} - SC Champions</p>
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
