// Tournaments UI Module - Supabase Version
// SC Champions - Tournament System UI Logic

import {
    initTournaments, createTournament, joinTournament, leaveTournament,
    deleteTournament, startTournament, regeneratePairings,
    getTournaments, getTournamentDetails, isParticipating,
    getTournamentFormatName, getTournamentStatusName, getCurrentUserId,
    recordTournamentMatchResult
} from './tournaments-supabase.js';

import { escapeHtml } from './utils/security.js';
import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

function showToast(message, type = 'info') {
    const colors = { info: 'bg-indigo-600', success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600' };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('opacity-0', 'transition-opacity'); setTimeout(() => toast.remove(), 300); }, 3000);
}

let currentFilter = 'open';
let selectedTournamentId = null;

function getMatchModeName(mode) {
    const names = {
        'best-of-5': 'Best of 5',
        'best-of-3': 'Best of 3',
        'best-of-7': 'Best of 7',
        'single-set': '1 Satz'
    };
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

export async function initTournamentsUI(userId, clubId, sportId) {
    console.log('[Tournaments UI] Initializing...');
    initTournaments(userId, clubId, sportId);
    setupEventListeners();

    // Set default active tab to "Aktiv" (my tournaments)
    const myTab = document.getElementById('tournament-tab-my');
    if (myTab) {
        myTab.classList.remove('text-gray-400', 'border-transparent');
        myTab.classList.add('text-indigo-600', 'border-indigo-600');
    }
    // Also switch the filter to 'my' on init
    switchTab('my');

    await loadTournaments();

    window.tournamentUIRefresh = loadTournaments;
    window.refreshTournamentDetails = refreshTournamentDetailsView;
}

function setupMatchesSubTabs() {
    const subTabs = document.querySelectorAll('.matches-sub-tab');
    const wettkampfContent = document.getElementById('matches-subtab-wettkampf');
    const turniereContent = document.getElementById('matches-subtab-turniere');

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
                loadTournaments();
            }
        });
    });
}

function setupEventListeners() {
    setupMatchesSubTabs();
    document.getElementById('create-tournament-btn')?.addEventListener('click', openCreateTournamentModal);
    document.getElementById('join-tournament-code-btn')?.addEventListener('click', openJoinCodeModal);

    document.getElementById('create-tournament-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleCreateTournament();
    });
    document.getElementById('join-tournament-code-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleJoinWithCode();
    });

    document.getElementById('close-create-tournament-modal')?.addEventListener('click', closeCreateTournamentModal);
    document.getElementById('cancel-create-tournament')?.addEventListener('click', closeCreateTournamentModal);
    document.getElementById('close-join-code-modal')?.addEventListener('click', closeJoinCodeModal);
    document.getElementById('cancel-join-code')?.addEventListener('click', closeJoinCodeModal);
    document.getElementById('close-tournament-details-modal')?.addEventListener('click', closeTournamentDetailsModal);

    document.getElementById('tournament-tab-open')?.addEventListener('click', () => switchTab('open'));
    document.getElementById('tournament-tab-my')?.addEventListener('click', () => switchTab('my'));
    document.getElementById('tournament-tab-completed')?.addEventListener('click', () => switchTab('completed'));
}

async function switchTab(filter) {
    currentFilter = filter;
    document.querySelectorAll('.tournament-tab-btn').forEach(btn => {
        btn.classList.remove('text-indigo-600', 'border-indigo-600');
        btn.classList.add('text-gray-400', 'border-transparent');
    });
    const activeTab = document.getElementById(`tournament-tab-${filter}`);
    if (activeTab) {
        activeTab.classList.remove('text-gray-400', 'border-transparent');
        activeTab.classList.add('text-indigo-600', 'border-indigo-600');
    }
    await loadTournaments();
}

async function loadTournaments() {
    const list = document.getElementById('tournaments-list');
    if (!list) return;

    list.innerHTML = '<p class="text-gray-500 text-center py-4 text-sm">Lade Turniere...</p>';

    try {
        let tournaments = [];

        if (currentFilter === 'open') {
            const all = await getTournaments('registration');
            tournaments = all.filter(t => t.is_open);
        } else if (currentFilter === 'my') {
            const all = await getTournaments();
            const my = [];
            for (const t of all) {
                if (t.status !== 'completed' && t.status !== 'cancelled' && await isParticipating(t.id)) my.push(t);
            }
            tournaments = my;
        } else if (currentFilter === 'completed') {
            // Show both completed and cancelled tournaments
            const allCompleted = await getTournaments('completed');
            const allCancelled = await getTournaments('cancelled');
            tournaments = [...allCompleted, ...allCancelled].sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            );
        }

        if (tournaments.length === 0) {
            list.innerHTML = '<p class="text-gray-400 text-center py-8 text-sm">Keine Turniere gefunden</p>';
            return;
        }

        list.innerHTML = tournaments.map(t => renderTournamentCard(t)).join('');

        tournaments.forEach(t => {
            document.getElementById(`tournament-card-${t.id}`)?.addEventListener('click', () => openTournamentDetails(t.id));
        });
    } catch (error) {
        console.error('[Tournaments UI] Error loading tournaments:', error);
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

    return `
        <div id="tournament-card-${tournament.id}" class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer">
            <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                    <h3 class="font-bold text-gray-800 mb-1">${escapeHtml(tournament.name)}</h3>
                    <p class="text-xs text-gray-600">${fmt}</p>
                </div>
                ${badge}
            </div>
            <div class="flex items-center justify-between text-xs mt-3">
                <div class="flex items-center gap-3">
                    <span class="text-gray-700"><i class="fas fa-users mr-1"></i>${displayCount}</span>
                    ${!tournament.is_open ? '<i class="fas fa-lock text-gray-500" title="Nur mit Code"></i>' : ''}
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
        'in_progress': '<span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">Läuft</span>',
        'completed': '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Beendet</span>',
        'cancelled': '<span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">Abgebrochen</span>',
        'draft': '<span class="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Entwurf</span>'
    };
    return badges[status] || '';
}

function openCreateTournamentModal() {
    const modal = document.getElementById('create-tournament-modal');
    if (modal) { modal.classList.remove('hidden'); document.getElementById('create-tournament-form')?.reset(); }
}
function closeCreateTournamentModal() { document.getElementById('create-tournament-modal')?.classList.add('hidden'); }
function openJoinCodeModal() {
    const modal = document.getElementById('join-tournament-code-modal');
    if (modal) { modal.classList.remove('hidden'); document.getElementById('join-tournament-code-form')?.reset(); document.getElementById('join-code-input')?.focus(); }
}
function closeJoinCodeModal() { document.getElementById('join-tournament-code-modal')?.classList.add('hidden'); }

async function openTournamentDetails(tournamentId) {
    selectedTournamentId = tournamentId;
    window.currentTournamentDetailsId = tournamentId;
    const modal = document.getElementById('tournament-details-modal');
    const content = document.getElementById('tournament-details-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = '<p class="text-gray-500 text-center py-8">Lade Turnier-Details...</p>';

    try {
        const tournament = await getTournamentDetails(tournamentId);
        const participating = await isParticipating(tournamentId);
        content.innerHTML = renderTournamentDetails(tournament, participating);
        setupDetailEventListeners(tournament, participating);
    } catch (error) {
        console.error('[Tournaments UI] Error loading details:', error);
        content.innerHTML = '<p class="text-red-500 text-center py-8">Fehler beim Laden</p>';
    }
}

function closeTournamentDetailsModal() {
    document.getElementById('tournament-details-modal')?.classList.add('hidden');
    selectedTournamentId = null;
    window.currentTournamentDetailsId = null;
}

async function refreshTournamentDetailsView(tournamentId) {
    if (!tournamentId || tournamentId !== window.currentTournamentDetailsId) return;
    const content = document.getElementById('tournament-details-content');
    if (!content) return;
    try {
        const tournament = await getTournamentDetails(tournamentId);
        const participating = await isParticipating(tournamentId);
        content.innerHTML = renderTournamentDetails(tournament, participating);
        setupDetailEventListeners(tournament, participating);
    } catch (error) {
        console.error('[Tournaments UI] Error refreshing details:', error);
    }
}

function getPlayerName(profileOrStanding) {
    const p = profileOrStanding?.profile || profileOrStanding;
    return p?.display_name || `${p?.first_name || ''} ${p?.last_name || ''}`.trim() || 'Unbekannt';
}

function renderTournamentDetails(tournament, participating) {
    const formatName = getTournamentFormatName(tournament.format);
    const statusName = getTournamentStatusName(tournament.status);
    const creatorName = getPlayerName(tournament.created_by_profile);
    const isCreator = tournament.created_by === getCurrentUserId();

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
                    <div><span class="text-gray-600">Teilnehmer:</span> <span class="font-medium ml-2">${tournament.tournament_participants?.length || 0}/${tournament.max_participants}</span></div>
                    <div><span class="text-gray-600">Erstellt von:</span> <span class="font-medium ml-2">${escapeHtml(creatorName)}</span></div>
                    ${tournament.with_handicap ? '<div><span class="text-gray-600">Handicap:</span> <span class="font-medium ml-2"><i class="fas fa-check text-green-500"></i> Aktiv</span></div>' : ''}
                    ${!tournament.is_open && tournament.join_code && isCreator ? `<div><span class="text-gray-600">Code:</span> <span class="font-mono font-bold ml-2 text-indigo-600">${tournament.join_code}</span></div>` : ''}
                </div>
                <div class="mt-4 flex gap-2 flex-wrap">
                    ${renderActionButtons(tournament, participating)}
                </div>
            </div>

            <div>
                <h4 class="font-bold text-gray-800 mb-3"><i class="fas fa-users mr-2"></i>Teilnehmer</h4>
                ${renderParticipants(tournament.tournament_participants || [])}
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
                            <button id="quick-match-entry-btn" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-1.5 px-3 rounded-lg font-medium">
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

function renderActionButtons(tournament, participating) {
    const isCreator = tournament.created_by === getCurrentUserId();
    let buttons = [];

    if (tournament.status === 'registration') {
        if (!participating) {
            buttons.push(`<button id="join-tournament-btn" class="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg font-medium"><i class="fas fa-sign-in-alt mr-2"></i>Beitreten</button>`);
        } else {
            buttons.push(`<button id="leave-tournament-btn" class="flex-1 bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg font-medium"><i class="fas fa-sign-out-alt mr-2"></i>Verlassen</button>`);
        }
        if (isCreator && (tournament.tournament_participants?.length || 0) >= 2) {
            buttons.push(`<button id="start-tournament-btn" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium"><i class="fas fa-play mr-2"></i>Starten</button>`);
        }
        if (isCreator) {
            buttons.push(`<button id="edit-tournament-btn" class="bg-gray-500 hover:bg-gray-600 text-white py-2 px-3 rounded-lg font-medium" title="Bearbeiten"><i class="fas fa-edit"></i></button>`);
            buttons.push(`<button id="cancel-tournament-btn" class="bg-orange-500 hover:bg-orange-600 text-white py-2 px-3 rounded-lg font-medium" title="Abbrechen"><i class="fas fa-ban"></i></button>`);
        }
    }

    if (tournament.status === 'in_progress' && isCreator) {
        buttons.push(`<button id="regenerate-pairings-btn" class="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg font-medium"><i class="fas fa-sync-alt mr-2"></i>Neu generieren</button>`);
        buttons.push(`<button id="cancel-tournament-btn" class="bg-orange-500 hover:bg-orange-600 text-white py-2 px-3 rounded-lg font-medium" title="Abbrechen"><i class="fas fa-ban"></i></button>`);
    }

    // Copy and Print buttons for creator (all statuses except cancelled)
    if (isCreator && tournament.status !== 'cancelled') {
        buttons.push(`<button id="copy-tournament-btn" class="bg-purple-500 hover:bg-purple-600 text-white py-2 px-3 rounded-lg font-medium" title="Kopieren"><i class="fas fa-copy"></i></button>`);
    }

    // Print button for all (if tournament has matches)
    if (tournament.tournament_matches?.length > 0) {
        buttons.push(`<button id="print-tournament-btn" class="bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded-lg font-medium" title="Drucken"><i class="fas fa-print"></i></button>`);
    }

    return buttons.join('');
}

function renderParticipants(participants) {
    if (participants.length === 0) return '<p class="text-gray-400 text-sm">Noch keine Teilnehmer</p>';

    const sorted = [...participants].sort((a, b) => {
        if (a.seed && b.seed) return a.seed - b.seed;
        return (b.elo_at_registration || 800) - (a.elo_at_registration || 800);
    });

    return `<div class="space-y-2">
        ${sorted.map(p => {
            const name = getPlayerName(p);
            const elo = p.elo_at_registration || p.profile?.elo_rating || 800;
            return `<div class="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                <div class="flex items-center gap-3">
                    <span class="font-bold text-gray-500 w-6">#${p.seed || '-'}</span>
                    <span class="font-medium text-gray-800">${escapeHtml(name)}</span>
                </div>
                <span class="text-sm text-gray-600">Elo: ${elo}</span>
            </div>`;
        }).join('')}
    </div>`;
}

function renderCrossTableCell(rowIdx, colIdx, results, rowPlayer, colPlayer) {
    if (rowIdx === colIdx) {
        return '<td class="px-2 py-2 text-center border border-gray-300 bg-gray-800"></td>';
    }
    const result = results[rowPlayer.player_id]?.[colPlayer.player_id];
    if (result) {
        const won = result.setsA > result.setsB;
        const cls = won ? 'text-green-700 font-bold' : 'text-red-600';
        return `<td class="px-2 py-2 text-center border border-gray-300 font-mono ${cls}">${result.setsA}:${result.setsB}</td>`;
    }
    return '<td class="px-2 py-2 text-center border border-gray-300 text-gray-300">-</td>';
}

function renderCrossTable(participants, matches, standings) {
    if (!participants.length) return '<p class="text-gray-400 text-sm">Keine Teilnehmer</p>';

    // Sort by seed
    const sorted = [...participants].sort((a, b) => (a.seed || 999) - (b.seed || 999));
    const n = sorted.length;

    // Build results matrix: results[playerA_id][playerB_id] = { setsA, setsB }
    const results = {};
    sorted.forEach(p => { results[p.player_id] = {}; });

    // Only count real matches (not bye matches)
    matches.forEach(m => {
        if (!m.player_a_id || !m.player_b_id) return;
        if (m.status !== 'completed') return;
        results[m.player_a_id][m.player_b_id] = { setsA: m.player_a_sets_won || 0, setsB: m.player_b_sets_won || 0 };
        results[m.player_b_id][m.player_a_id] = { setsA: m.player_b_sets_won || 0, setsB: m.player_a_sets_won || 0 };
    });

    // Build standings lookup
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
                        ${sorted.map((colPlayer, colIdx) => renderCrossTableCell(rowIdx, colIdx, results, rowPlayer, colPlayer)).join('')}
                        <td class="px-2 py-2 text-center border border-gray-300 font-medium">${matchRecord}</td>
                        <td class="px-2 py-2 text-center border border-gray-300">${setsRecord}</td>
                        <td class="px-2 py-2 text-center border border-gray-300 font-bold">${rank}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>`;
}

function renderStandings(standings) {
    if (!standings.length) return '<p class="text-gray-400 text-sm">Noch keine Ergebnisse</p>';

    return `<div class="overflow-x-auto">
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
                    const name = getPlayerName(s);
                    return `<tr class="${s.rank === 1 ? 'bg-yellow-50 font-semibold' : 'bg-white'}">
                        <td class="px-3 py-2">${s.rank || '-'}</td>
                        <td class="px-3 py-2">${escapeHtml(name)}</td>
                        <td class="px-3 py-2 text-center">${s.matches_played || 0}</td>
                        <td class="px-3 py-2 text-center text-green-600">${s.matches_won || 0}</td>
                        <td class="px-3 py-2 text-center text-red-600">${s.matches_lost || 0}</td>
                        <td class="px-3 py-2 text-center">${s.sets_won || 0}:${s.sets_lost || 0}</td>
                        <td class="px-3 py-2 text-center font-bold">${s.tournament_points || 0}</td>
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
                ${actual.map(m => renderMatchCard(m, isCreator)).join('')}
                ${byes.map(m => renderByeCard(m)).join('')}
            </div>
        </div>`;
    }).join('');
}

function renderMatchCard(match, isCreator = false) {
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
                ${done && isCreator ? `<button class="correct-match-btn text-xs text-indigo-600 hover:text-indigo-800 ml-2" data-match-id="${match.id}" title="Korrigieren"><i class="fas fa-edit"></i></button>` : ''}
            </div>
        </div>
    </div>`;
}

function renderByeCard(match) {
    const name = getPlayerName(match.player_a);
    return `<div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-2"><i class="fas fa-coffee text-gray-400"></i><span class="text-gray-700">${escapeHtml(name)}</span></div>
            <span class="text-xs text-gray-500 italic">Freilos</span>
        </div>
    </div>`;
}

function setupDetailEventListeners(tournament, participating) {
    document.getElementById('join-tournament-btn')?.addEventListener('click', async () => {
        try { await joinTournament(tournament.id); await openTournamentDetails(tournament.id); await loadTournaments(); } catch {}
    });
    document.getElementById('leave-tournament-btn')?.addEventListener('click', async () => {
        if (confirm('Möchtest du dieses Turnier wirklich verlassen?')) {
            try { await leaveTournament(tournament.id); closeTournamentDetailsModal(); await loadTournaments(); } catch {}
        }
    });
    document.getElementById('start-tournament-btn')?.addEventListener('click', async () => {
        if (confirm('Turnier jetzt starten? Danach können keine weiteren Spieler beitreten.')) {
            try { await startTournament(tournament.id); await openTournamentDetails(tournament.id); await loadTournaments(); } catch {}
        }
    });
    document.getElementById('regenerate-pairings-btn')?.addEventListener('click', async () => {
        if (confirm('Paarungen neu generieren? Alle bisherigen Ergebnisse werden gelöscht!')) {
            try { await regeneratePairings(tournament.id); await openTournamentDetails(tournament.id); await loadTournaments(); } catch {}
        }
    });
    document.getElementById('quick-match-entry-btn')?.addEventListener('click', () => openQuickMatchEntryModal(tournament));

    // New action buttons
    document.getElementById('edit-tournament-btn')?.addEventListener('click', () => openEditTournamentModal(tournament));
    document.getElementById('cancel-tournament-btn')?.addEventListener('click', () => handleCancelTournament(tournament));
    document.getElementById('copy-tournament-btn')?.addEventListener('click', () => openCopyTournamentModal(tournament));
    document.getElementById('print-tournament-btn')?.addEventListener('click', () => printTournament(tournament));

    // Match correction buttons (on completed matches)
    document.querySelectorAll('.correct-match-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const matchId = btn.dataset.matchId;
            const match = tournament.tournament_matches?.find(m => m.id === matchId);
            if (match) openCorrectMatchModal(match, tournament);
        });
    });
}

async function handleCreateTournament() {
    const name = document.getElementById('tournament-name')?.value;
    const description = document.getElementById('tournament-description')?.value;
    const format = document.getElementById('tournament-format')?.value;
    const matchMode = document.getElementById('tournament-match-mode')?.value || 'best-of-5';
    const maxParticipants = parseInt(document.getElementById('tournament-max-participants')?.value || '8');
    const accessType = document.querySelector('input[name="tournament-access"]:checked')?.value;
    const visibilityType = document.querySelector('input[name="tournament-visibility"]:checked')?.value;
    const withHandicap = document.getElementById('tournament-handicap')?.checked || false;

    try {
        const tournament = await createTournament({
            name, description, format, matchMode, maxParticipants,
            isOpen: accessType === 'open', isClubOnly: visibilityType === 'club', withHandicap
        });
        closeCreateTournamentModal();
        await loadTournaments();
        await openTournamentDetails(tournament.id);
    } catch {}
}

async function handleJoinWithCode() {
    const code = document.getElementById('join-code-input')?.value.toUpperCase();
    if (!code || code.length !== 6) { showToast('Bitte gib einen gültigen 6-stelligen Code ein', 'error'); return; }
    try {
        const allTournaments = await getTournaments();
        const tournament = allTournaments.find(t => t.join_code === code);
        if (!tournament) { showToast('Ungültiger Einladungscode', 'error'); return; }
        await joinTournament(tournament.id, code);
        closeJoinCodeModal();
        await loadTournaments();
        await openTournamentDetails(tournament.id);
    } catch {}
}

function openQuickMatchEntryModal(tournament) {
    const pendingMatches = (tournament.tournament_matches || []).filter(m => m.status === 'pending' && m.player_b_id);
    if (!pendingMatches.length) { showToast('Keine offenen Matches', 'info'); return; }

    const matchMode = tournament.match_mode || 'best-of-5';
    const maxSets = getMaxSets(matchMode);
    const setsToWin = getSetsToWin(matchMode);

    const modal = document.createElement('div');
    modal.id = 'quick-match-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-bolt text-indigo-600 mr-2"></i>Match eintragen</h3>
                    <button id="close-quick-match" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <div class="mb-3 text-xs text-gray-500">Spielmodus: <span class="font-medium">${getMatchModeName(matchMode)}</span></div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Match auswählen</label>
                    <select id="quick-match-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <option value="">-- Bitte wählen --</option>
                        ${pendingMatches.map(m => {
                            const a = getPlayerName(m.player_a);
                            const b = getPlayerName(m.player_b);
                            return `<option value="${m.id}">Runde ${m.round_number}: ${escapeHtml(a)} vs ${escapeHtml(b)}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div id="quick-match-form" class="hidden space-y-4">
                    <div class="flex gap-2 mb-2">
                        <button type="button" class="quick-entry-mode flex-1 py-1.5 px-3 text-sm font-medium rounded-lg bg-indigo-600 text-white" data-mode="quick">Schnell (Sätze)</button>
                        <button type="button" class="quick-entry-mode flex-1 py-1.5 px-3 text-sm font-medium rounded-lg bg-gray-200 text-gray-700" data-mode="detailed">Detail (Punkte)</button>
                    </div>

                    <div id="quick-mode-sets">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Ergebnis (Sätze)</label>
                        <div class="grid grid-cols-3 gap-2 items-center">
                            <div>
                                <input type="number" id="quick-sets-a" min="0" max="${maxSets}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold" placeholder="0">
                                <div id="quick-player-a-name" class="text-xs text-gray-600 mt-1 text-center truncate"></div>
                            </div>
                            <div class="text-center text-gray-400 font-bold text-xl">:</div>
                            <div>
                                <input type="number" id="quick-sets-b" min="0" max="${maxSets}" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold" placeholder="0">
                                <div id="quick-player-b-name" class="text-xs text-gray-600 mt-1 text-center truncate"></div>
                            </div>
                        </div>
                    </div>

                    <div id="quick-mode-detailed" class="hidden">
                        <div class="flex justify-between items-center mb-2">
                            <span id="detail-player-a-name" class="text-xs font-medium text-gray-700 truncate max-w-[40%]"></span>
                            <span id="detail-player-b-name" class="text-xs font-medium text-gray-700 truncate max-w-[40%] text-right"></span>
                        </div>
                        <div id="detail-sets-container" class="space-y-2"></div>
                        <div id="detail-result-preview" class="mt-2 text-center text-sm font-medium text-gray-600"></div>
                    </div>

                    <div class="flex gap-2">
                        <button id="cancel-quick-match" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button id="submit-quick-match" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium">Speichern</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    let entryMode = 'quick';
    const matchSelect = modal.querySelector('#quick-match-select');
    const matchForm = modal.querySelector('#quick-match-form');
    let selectedMatch = null;

    // Mode toggle
    modal.querySelectorAll('.quick-entry-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            entryMode = btn.dataset.mode;
            modal.querySelectorAll('.quick-entry-mode').forEach(b => {
                b.classList.toggle('bg-indigo-600', b.dataset.mode === entryMode);
                b.classList.toggle('text-white', b.dataset.mode === entryMode);
                b.classList.toggle('bg-gray-200', b.dataset.mode !== entryMode);
                b.classList.toggle('text-gray-700', b.dataset.mode !== entryMode);
            });
            modal.querySelector('#quick-mode-sets').classList.toggle('hidden', entryMode !== 'quick');
            modal.querySelector('#quick-mode-detailed').classList.toggle('hidden', entryMode !== 'detailed');
        });
    });

    function renderDetailedSets() {
        const container = modal.querySelector('#detail-sets-container');
        container.innerHTML = '';
        for (let i = 0; i < maxSets; i++) {
            container.innerHTML += `
                <div class="grid grid-cols-3 gap-2 items-center">
                    <input type="number" min="0" class="detail-score-a w-full px-2 py-1.5 border border-gray-300 rounded text-center text-sm" data-set="${i}" placeholder="0">
                    <div class="text-center text-gray-400 text-xs">Satz ${i + 1}</div>
                    <input type="number" min="0" class="detail-score-b w-full px-2 py-1.5 border border-gray-300 rounded text-center text-sm" data-set="${i}" placeholder="0">
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
            const a = parseInt(modal.querySelector(`.detail-score-a[data-set="${i}"]`)?.value) || 0;
            const b = parseInt(modal.querySelector(`.detail-score-b[data-set="${i}"]`)?.value) || 0;
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
        const preview = modal.querySelector('#detail-result-preview');
        if (sets.length > 0) {
            const setsStr = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');
            preview.textContent = `Sätze: ${sA}:${sB} (${setsStr})`;
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
            modal.querySelector('#quick-player-a-name').textContent = nameA;
            modal.querySelector('#quick-player-b-name').textContent = nameB;
            modal.querySelector('#detail-player-a-name').textContent = nameA;
            modal.querySelector('#detail-player-b-name').textContent = nameB;
            renderDetailedSets();
            matchForm.classList.remove('hidden');
        } else {
            matchForm.classList.add('hidden');
        }
    });

    const closeModal = () => modal.remove();
    modal.querySelector('#close-quick-match').addEventListener('click', closeModal);
    modal.querySelector('#cancel-quick-match').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#submit-quick-match').addEventListener('click', async () => {
        if (!selectedMatch) return;

        let setsA, setsB, setsArray = [];

        if (entryMode === 'quick') {
            setsA = parseInt(modal.querySelector('#quick-sets-a').value) || 0;
            setsB = parseInt(modal.querySelector('#quick-sets-b').value) || 0;
            if (setsA + setsB > maxSets) {
                showToast(`Maximal ${maxSets} Sätze möglich bei ${getMatchModeName(matchMode)}`, 'error'); return;
            }
            if (Math.max(setsA, setsB) > setsToWin) {
                showToast(`Maximal ${setsToWin} gewonnene Sätze bei ${getMatchModeName(matchMode)}`, 'error'); return;
            }
            if (setsA !== setsToWin && setsB !== setsToWin) {
                showToast(`Ein Spieler muss ${setsToWin} Sätze gewinnen (${getMatchModeName(matchMode)})`, 'error'); return;
            }
        } else {
            setsArray = getDetailedSets();
            if (setsArray.length === 0) { showToast('Bitte Satzpunkte eingeben', 'error'); return; }
            setsA = 0; setsB = 0;
            for (const s of setsArray) {
                if (s.playerA > s.playerB) setsA++;
                else if (s.playerB > s.playerA) setsB++;
            }
            if (setsA < setsToWin && setsB < setsToWin) {
                showToast(`Mindestens ${setsToWin} Sätze müssen gewonnen werden (${getMatchModeName(matchMode)})`, 'error');
                return;
            }
        }

        if (setsA === 0 && setsB === 0) { showToast('Bitte Ergebnis eingeben', 'error'); return; }
        if (setsA === setsB) { showToast('Unentschieden nicht möglich', 'error'); return; }

        const submitBtn = modal.querySelector('#submit-quick-match');
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
                    sets: setsArray, club_id: tournament.club_id, created_by: getCurrentUserId(),
                    sport_id: tournament.sport_id, played_at: new Date().toISOString(),
                    match_mode: matchMode, handicap_used: false,
                    tournament_match_id: selectedMatch.id
                })
                .select().single();
            if (matchError) throw matchError;

            await recordTournamentMatchResult(selectedMatch.id, match.id);
            showToast('Match eingetragen!', 'success');
            closeModal();
            await openTournamentDetails(tournament.id);
        } catch (error) {
            console.error('[Tournaments UI] Error saving match:', error);
            showToast('Fehler: ' + error.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Speichern';
        }
    });
}

/**
 * Load and display active tournament banner on the start screen
 */
export async function loadActiveTournamentBanner() {
    const banner = document.getElementById('active-tournament-banner');
    if (!banner) return;

    const userId = getCurrentUserId();
    if (!userId) { banner.classList.add('hidden'); return; }

    try {
        // Get tournaments where user is participating and status is in_progress
        const { data: participations, error: partErr } = await supabase
            .from('tournament_participants')
            .select('tournament_id')
            .eq('player_id', userId);

        if (partErr || !participations || participations.length === 0) {
            banner.classList.add('hidden');
            return;
        }

        const tournamentIds = participations.map(p => p.tournament_id);

        const { data: activeTournaments, error: tErr } = await supabase
            .from('tournaments')
            .select('id, name')
            .in('id', tournamentIds)
            .eq('status', 'in_progress')
            .limit(1);

        if (tErr || !activeTournaments || activeTournaments.length === 0) {
            banner.classList.add('hidden');
            return;
        }

        const tournament = activeTournaments[0];

        // Get pending matches for this user in this tournament
        const { data: pendingMatches, error: mErr } = await supabase
            .from('tournament_matches')
            .select(`
                id, round_number, player_a_id, player_b_id, status,
                player_a:profiles!tournament_matches_player_a_id_fkey(first_name, last_name),
                player_b:profiles!tournament_matches_player_b_id_fkey(first_name, last_name)
            `)
            .eq('tournament_id', tournament.id)
            .in('status', ['pending', 'in_progress'])
            .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
            .order('round_number', { ascending: true });

        if (mErr || !pendingMatches || pendingMatches.length === 0) {
            // All matches done
            banner.classList.add('hidden');
            return;
        }

        const nextMatch = pendingMatches[0];
        const isPlayerA = nextMatch.player_a_id === userId;
        const opponent = isPlayerA ? nextMatch.player_b : nextMatch.player_a;
        const opponentName = opponent
            ? `${opponent.first_name || ''} ${opponent.last_name || ''}`.trim() || 'Unbekannt'
            : 'Freilos';

        // Count total rounds and completed rounds
        const { data: allMatches } = await supabase
            .from('tournament_matches')
            .select('round_number, status')
            .eq('tournament_id', tournament.id)
            .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`);

        const totalRounds = allMatches ? Math.max(...allMatches.map(m => m.round_number)) : 0;
        const completedRounds = allMatches
            ? new Set(allMatches.filter(m => m.status === 'completed').map(m => m.round_number)).size
            : 0;

        document.getElementById('tournament-banner-name').textContent = tournament.name;
        document.getElementById('tournament-banner-round').textContent =
            `Runde ${nextMatch.round_number} von ${totalRounds} · ${pendingMatches.length} Spiel${pendingMatches.length !== 1 ? 'e' : ''} offen`;
        document.getElementById('tournament-banner-opponent').textContent = opponentName;

        banner.classList.remove('hidden');
    } catch (err) {
        console.error('[Tournaments UI] Error loading tournament banner:', err);
        banner.classList.add('hidden');
    }
}

// ========== NEW FEATURE FUNCTIONS ==========

/**
 * Open modal to edit tournament details (name, description, max participants)
 */
function openEditTournamentModal(tournament) {
    const modal = document.createElement('div');
    modal.id = 'edit-tournament-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit text-indigo-600 mr-2"></i>Turnier bearbeiten</h3>
                    <button id="close-edit-tournament" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <form id="edit-tournament-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" id="edit-tournament-name" value="${escapeHtml(tournament.name)}" required
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                        <textarea id="edit-tournament-description" rows="2"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">${escapeHtml(tournament.description || '')}</textarea>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Max. Teilnehmer</label>
                        <input type="number" id="edit-tournament-max" value="${tournament.max_participants}" min="${tournament.tournament_participants?.length || 2}" max="32"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                        <p class="text-xs text-gray-500 mt-1">Mindestens ${tournament.tournament_participants?.length || 2} (aktuelle Teilnehmer)</p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="cancel-edit-tournament" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button type="submit" id="save-edit-tournament" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg font-medium">Speichern</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-edit-tournament').addEventListener('click', closeModal);
    modal.querySelector('#cancel-edit-tournament').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#edit-tournament-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = modal.querySelector('#edit-tournament-name').value.trim();
        const description = modal.querySelector('#edit-tournament-description').value.trim();
        const maxParticipants = parseInt(modal.querySelector('#edit-tournament-max').value) || tournament.max_participants;

        if (!name) { showToast('Name ist erforderlich', 'error'); return; }

        const saveBtn = modal.querySelector('#save-edit-tournament');
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
            await openTournamentDetails(tournament.id);
            await loadTournaments();
        } catch (err) {
            console.error('[Tournaments UI] Error updating tournament:', err);
            showToast('Fehler: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Speichern';
        }
    });
}

/**
 * Cancel tournament (mark as cancelled instead of deleting)
 */
async function handleCancelTournament(tournament) {
    if (!confirm('Turnier wirklich abbrechen? Das Turnier wird als "Abgebrochen" markiert und kann nicht fortgesetzt werden.')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('tournaments')
            .update({ status: 'cancelled' })
            .eq('id', tournament.id);

        if (error) throw error;
        showToast('Turnier abgebrochen', 'success');
        closeTournamentDetailsModal();
        await loadTournaments();
    } catch (err) {
        console.error('[Tournaments UI] Error cancelling tournament:', err);
        showToast('Fehler: ' + err.message, 'error');
    }
}

/**
 * Open modal to copy tournament as template
 */
function openCopyTournamentModal(tournament) {
    const modal = document.createElement('div');
    modal.id = 'copy-tournament-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-copy text-purple-600 mr-2"></i>Turnier kopieren</h3>
                    <button id="close-copy-tournament" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Erstelle ein neues Turnier mit den gleichen Einstellungen wie "${escapeHtml(tournament.name)}".</p>
                <form id="copy-tournament-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Neuer Name</label>
                        <input type="text" id="copy-tournament-name" value="${escapeHtml(tournament.name)} (Kopie)" required
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="cancel-copy-tournament" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button type="submit" id="save-copy-tournament" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg font-medium">Kopieren</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-copy-tournament').addEventListener('click', closeModal);
    modal.querySelector('#cancel-copy-tournament').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#copy-tournament-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = modal.querySelector('#copy-tournament-name').value.trim();
        if (!name) { showToast('Name ist erforderlich', 'error'); return; }

        const saveBtn = modal.querySelector('#save-copy-tournament');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Kopiere...';

        try {
            const newTournament = await createTournament({
                name,
                description: tournament.description,
                format: tournament.format,
                matchMode: tournament.match_mode,
                maxParticipants: tournament.max_participants,
                isOpen: tournament.is_open,
                isClubOnly: tournament.is_club_only,
                withHandicap: tournament.with_handicap
            });

            showToast('Turnier kopiert!', 'success');
            closeModal();
            closeTournamentDetailsModal();
            await loadTournaments();
            await openTournamentDetails(newTournament.id);
        } catch (err) {
            console.error('[Tournaments UI] Error copying tournament:', err);
            showToast('Fehler: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Kopieren';
        }
    });
}

/**
 * Print tournament schedule/overview
 */
function printTournament(tournament) {
    const formatName = getTournamentFormatName(tournament.format);
    const statusName = getTournamentStatusName(tournament.status);

    // Build cross table HTML
    const participants = tournament.tournament_participants || [];
    const matches = tournament.tournament_matches || [];
    const standings = tournament.tournament_standings || [];

    // Generate round-robin pairings table (only numbers)
    let roundPairingsHtml = '';
    if (participants.length >= 3 && tournament.format === 'round-robin') {
        const n = participants.length;
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

        roundPairingsHtml = `
            <div style="margin-top:25px; border:1px solid #ddd; padding:10px; font-size:11px;">
                <strong>Für ${n} Teilnehmer - Rundenpaarungen:</strong>
                <table style="margin-top:8px; border-collapse:collapse;">
                    <tr style="background:#f3f4f6;">
                        ${rounds.map((_, i) => `<th style="border:1px solid #ddd; padding:4px 8px; text-align:center;">${i + 1}.R.</th>`).join('')}
                    </tr>
                    ${Array.from({ length: Math.max(...rounds.map(r => r.length)) }, (_, rowIdx) => `
                        <tr>
                            ${rounds.map(round => `<td style="border:1px solid #ddd; padding:3px 8px; text-align:center; font-family:monospace;">${round[rowIdx] || ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    }

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
                @media print {
                    body { padding: 10px; }
                }
            </style>
        </head>
        <body>
            <h1>${escapeHtml(tournament.name)}</h1>
            <p class="subtitle">${escapeHtml(tournament.description || '')}</p>
            <div class="info">
                <div class="info-item"><span class="info-label">Turniermodus:</span> ${formatName}</div>
                <div class="info-item"><span class="info-label">Spielmodus:</span> ${getMatchModeName(tournament.match_mode)}</div>
                <div class="info-item"><span class="info-label">Handicap:</span> ${tournament.with_handicap ? 'Ja' : 'Nein'}</div>
                <div class="info-item"><span class="info-label">Teilnehmer:</span> ${participants.length}</div>
            </div>
            ${crossTableHtml}
            ${roundPairingsHtml}
            <p style="margin-top:30px; font-size:10px; color:#999;">Erstellt am ${new Date().toLocaleDateString('de-DE')} - SC Champions</p>
            <script>window.print();</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

/**
 * Open modal to correct a completed match result
 */
function openCorrectMatchModal(match, tournament) {
    const matchMode = tournament.match_mode || 'best-of-5';
    const maxSets = getMaxSets(matchMode);
    const setsToWin = getSetsToWin(matchMode);
    const playerAName = getPlayerName(match.player_a);
    const playerBName = getPlayerName(match.player_b);

    const modal = document.createElement('div');
    modal.id = 'correct-match-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div class="p-6">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold text-gray-800"><i class="fas fa-edit text-orange-600 mr-2"></i>Ergebnis korrigieren</h3>
                    <button id="close-correct-match" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Korrigiere das Ergebnis für Runde ${match.round_number}</p>
                <div class="space-y-4">
                    <div class="grid grid-cols-3 gap-2 items-center">
                        <div>
                            <input type="number" id="correct-sets-a" min="0" max="${maxSets}" value="${match.player_a_sets_won || 0}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold">
                            <div class="text-xs text-gray-600 mt-1 text-center truncate">${escapeHtml(playerAName)}</div>
                        </div>
                        <div class="text-center text-gray-400 font-bold text-xl">:</div>
                        <div>
                            <input type="number" id="correct-sets-b" min="0" max="${maxSets}" value="${match.player_b_sets_won || 0}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center text-lg font-bold">
                            <div class="text-xs text-gray-600 mt-1 text-center truncate">${escapeHtml(playerBName)}</div>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" id="cancel-correct-match" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-medium">Abbrechen</button>
                        <button type="button" id="save-correct-match" class="flex-1 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg font-medium">Korrigieren</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#close-correct-match').addEventListener('click', closeModal);
    modal.querySelector('#cancel-correct-match').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#save-correct-match').addEventListener('click', async () => {
        const setsA = parseInt(modal.querySelector('#correct-sets-a').value) || 0;
        const setsB = parseInt(modal.querySelector('#correct-sets-b').value) || 0;

        // Validation
        if (setsA + setsB > maxSets) {
            showToast(`Maximal ${maxSets} Sätze möglich`, 'error'); return;
        }
        if (setsA !== setsToWin && setsB !== setsToWin) {
            showToast(`Ein Spieler muss ${setsToWin} Sätze gewinnen`, 'error'); return;
        }
        if (setsA === setsB) {
            showToast('Unentschieden nicht möglich', 'error'); return;
        }

        const saveBtn = modal.querySelector('#save-correct-match');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Speichere...';

        try {
            const newWinnerId = setsA > setsB ? match.player_a_id : match.player_b_id;

            // Update tournament_match
            const { error: tmError } = await supabase
                .from('tournament_matches')
                .update({
                    player_a_sets_won: setsA,
                    player_b_sets_won: setsB,
                    winner_id: newWinnerId
                })
                .eq('id', match.id);

            if (tmError) throw tmError;

            // Also update the linked match in matches table if exists
            if (match.match_id) {
                await supabase
                    .from('matches')
                    .update({
                        player_a_sets_won: setsA,
                        player_b_sets_won: setsB,
                        winner_id: newWinnerId,
                        loser_id: setsA > setsB ? match.player_b_id : match.player_a_id
                    })
                    .eq('id', match.match_id);
            }

            // Recalculate standings
            await recalculateTournamentStandings(tournament.id);

            showToast('Ergebnis korrigiert!', 'success');
            closeModal();
            await openTournamentDetails(tournament.id);
            await loadTournaments();
        } catch (err) {
            console.error('[Tournaments UI] Error correcting match:', err);
            showToast('Fehler: ' + err.message, 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Korrigieren';
        }
    });
}

/**
 * Recalculate tournament standings after match correction
 */
async function recalculateTournamentStandings(tournamentId) {
    try {
        // Get all completed matches
        const { data: matches, error: mErr } = await supabase
            .from('tournament_matches')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('status', 'completed');

        if (mErr) throw mErr;

        // Get all participants
        const { data: participants, error: pErr } = await supabase
            .from('tournament_participants')
            .select('player_id')
            .eq('tournament_id', tournamentId);

        if (pErr) throw pErr;

        // Calculate standings for each player
        const standingsData = {};
        participants.forEach(p => {
            standingsData[p.player_id] = {
                player_id: p.player_id,
                tournament_id: tournamentId,
                matches_played: 0,
                matches_won: 0,
                matches_lost: 0,
                sets_won: 0,
                sets_lost: 0,
                tournament_points: 0
            };
        });

        matches.forEach(m => {
            if (!m.player_a_id || !m.player_b_id) return;

            // Player A stats
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

            // Player B stats
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

        // Sort and assign ranks
        const sortedStandings = Object.values(standingsData).sort((a, b) => {
            if (b.tournament_points !== a.tournament_points) return b.tournament_points - a.tournament_points;
            const aDiff = a.sets_won - a.sets_lost;
            const bDiff = b.sets_won - b.sets_lost;
            if (bDiff !== aDiff) return bDiff - aDiff;
            return b.sets_won - a.sets_won;
        });

        sortedStandings.forEach((s, i) => { s.rank = i + 1; });

        // Delete old standings and insert new ones
        await supabase.from('tournament_standings').delete().eq('tournament_id', tournamentId);

        if (sortedStandings.length > 0) {
            const { error: insertErr } = await supabase
                .from('tournament_standings')
                .insert(sortedStandings);
            if (insertErr) throw insertErr;
        }

        console.log('[Tournaments UI] Standings recalculated');
    } catch (err) {
        console.error('[Tournaments UI] Error recalculating standings:', err);
    }
}
