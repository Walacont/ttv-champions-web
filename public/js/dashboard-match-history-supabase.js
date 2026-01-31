// Dashboard Match History Modul (Supabase-Version)
// Verwaltet Anzeige der Wettkampf-Historie, Rendering und Detail-Modals

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

let currentUser = null;
let currentUserData = null;
let allLoadedMatches = [];
let displayedMatchCount = 3;
let profileMapCache = {};
const MATCHES_PER_PAGE = 3;

/** Initialisiert das Modul mit Benutzerdaten */
export function initMatchHistoryModule(user, userData) {
    currentUser = user;
    currentUserData = userData;
    allLoadedMatches = [];
    displayedMatchCount = MATCHES_PER_PAGE;
    profileMapCache = {};
}

/** Lädt Wettkampf-Historie (Einzel + Doppel) mit Paginierung */
export async function loadMatchHistory() {
    const container = document.getElementById('match-history-list');
    if (!container) return;

    // Paginierung zurücksetzen für neues Laden
    displayedMatchCount = MATCHES_PER_PAGE;

    try {
        const { data: singlesMatches, error: singlesError } = await supabase
            .from('matches')
            .select('id, player_a_id, player_b_id, winner_id, loser_id, sets, player_a_sets_won, player_b_sets_won, elo_change, winner_elo_change, loser_elo_change, player_a_elo_before, player_b_elo_before, season_points_awarded, played_at, created_at, sport_id, club_id, match_mode, handicap_used')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (singlesError) throw singlesError;

        const { data: doublesMatches, error: doublesError } = await supabase
            .from('doubles_matches')
            .select('id, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id, winning_team, sets, team_a_sets_won, team_b_sets_won, team_a_elo_change, team_b_elo_change, season_points_awarded, played_at, created_at, sport_id, club_id, match_mode, handicap_used')
            .or(`team_a_player1_id.eq.${currentUser.id},team_a_player2_id.eq.${currentUser.id},team_b_player1_id.eq.${currentUser.id},team_b_player2_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false })
            .limit(50);

        console.log('[MatchHistory] Doubles query for user:', currentUser.id);
        console.log('[MatchHistory] Doubles matches found:', doublesMatches?.length || 0, doublesMatches);
        if (doublesError) console.warn('[MatchHistory] Error fetching doubles:', doublesError);

        allLoadedMatches = [
            ...(singlesMatches || []).map(m => ({ ...m, matchType: 'singles' })),
            ...(doublesMatches || []).map(m => ({ ...m, matchType: 'doubles' }))
        ];

        allLoadedMatches.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (allLoadedMatches.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe gespielt</p>';
            return;
        }

        const playerIds = new Set();
        allLoadedMatches.forEach(m => {
            if (m.matchType === 'singles') {
                playerIds.add(m.player_a_id);
                playerIds.add(m.player_b_id);
            } else {
                playerIds.add(m.team_a_player1_id);
                playerIds.add(m.team_a_player2_id);
                playerIds.add(m.team_b_player1_id);
                playerIds.add(m.team_b_player2_id);
            }
        });

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, first_name, last_name, avatar_url, elo_rating, wins, losses')
            .in('id', [...playerIds].filter(Boolean));

        const { data: allPlayers } = await supabase
            .from('profiles')
            .select('id, elo_rating')
            .in('role', ['player', 'coach', 'head_coach'])
            .order('elo_rating', { ascending: false });

        const rankMap = {};
        (allPlayers || []).forEach((p, index) => {
            rankMap[p.id] = index + 1;
        });

        profileMapCache = {};
        (profiles || []).forEach(p => {
            profileMapCache[p.id] = {
                ...p,
                rank: rankMap[p.id] || '-'
            };
        });

        renderMatchHistory(container);

    } catch (error) {
        console.error('Error loading match history:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

/** Rendert Wettkampf-Historie mit aktueller Paginierung */
function renderMatchHistory(container) {
    const matchesToShow = allLoadedMatches.slice(0, displayedMatchCount);
    const hasMore = allLoadedMatches.length > displayedMatchCount;

    let html = matchesToShow.map(match => {
        if (match.matchType === 'doubles') {
            return renderDoublesMatchCard(match, profileMapCache);
        } else {
            return renderSinglesMatchCard(match, profileMapCache);
        }
    }).join('');

    if (hasMore) {
        const remaining = allLoadedMatches.length - displayedMatchCount;
        html += `
            <button id="load-more-matches"
                    class="w-full py-3 text-indigo-600 hover:text-indigo-800 font-medium text-sm border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
                Mehr anzeigen (${remaining} weitere)
            </button>
        `;
    }

    container.innerHTML = html;

    const loadMoreBtn = document.getElementById('load-more-matches');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            displayedMatchCount += MATCHES_PER_PAGE;
            renderMatchHistory(container);
        });
    }

    // Wettkämpfe für Detail-Modal global verfügbar machen
    const singlesMatchesForModal = allLoadedMatches.filter(m => m.matchType !== 'doubles');
    const doublesMatchesForModal = allLoadedMatches.filter(m => m.matchType === 'doubles');
    window.matchHistoryData = { matches: singlesMatchesForModal, doublesMatches: doublesMatchesForModal, profileMap: profileMapCache };
}

/** Placeholder für gelöschte Spieler */
const DELETED_PLAYER = {
    first_name: 'Gelöschter',
    last_name: 'Spieler',
    display_name: 'Gelöschter Spieler',
    avatar_url: null,
    rank: '-',
    elo_rating: null
};

/** Rendert eine Einzel-Wettkampf-Karte */
function renderSinglesMatchCard(match, profileMap) {
    // Gelöschte Spieler (NULL-IDs) erkennen und Placeholder verwenden
    const playerADeleted = match.player_a_id === null;
    const playerBDeleted = match.player_b_id === null;
    const playerA = playerADeleted ? DELETED_PLAYER : (profileMap[match.player_a_id] || {});
    const playerB = playerBDeleted ? DELETED_PLAYER : (profileMap[match.player_b_id] || {});
    const isCurrentUserA = match.player_a_id === currentUser.id;
    const isWinner = match.winner_id === currentUser.id;

    const currentPlayer = isCurrentUserA ? playerA : playerB;
    const opponent = isCurrentUserA ? playerB : playerA;
    const opponentDeleted = isCurrentUserA ? playerBDeleted : playerADeleted;

    let playerASetWins = 0;
    let playerBSetWins = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (scoreA > scoreB) playerASetWins++;
        else if (scoreB > scoreA) playerBSetWins++;
    });
    // Fallback to player_a_sets_won / player_b_sets_won when sets array is empty
    if (playerASetWins === 0 && playerBSetWins === 0) {
        playerASetWins = match.player_a_sets_won || 0;
        playerBSetWins = match.player_b_sets_won || 0;
    }

    const mySetWins = isCurrentUserA ? playerASetWins : playerBSetWins;
    const oppSetWins = isCurrentUserA ? playerBSetWins : playerASetWins;

    const setScoresDisplay = sets.length > 0 ? sets.map(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        return isCurrentUserA ? `${scoreA}-${scoreB}` : `${scoreB}-${scoreA}`;
    }).join(', ') : '';

    const eloChange = isWinner ? (match.winner_elo_change || match.elo_change || 0) : (match.loser_elo_change || match.elo_change || 0);

    const matchDate = new Date(match.played_at || match.created_at);
    const dateDisplay = formatRelativeDate(matchDate);
    const timeDisplay = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const myAvatar = currentPlayer.avatar_url || DEFAULT_AVATAR;
    const oppAvatar = opponent.avatar_url || DEFAULT_AVATAR;

    // Nur Elo-Änderung auf Karte anzeigen (Saisonpunkte werden in Details gezeigt)
    const displayElo = Math.abs(eloChange);
    const statsHtml = isWinner
        ? `<span class="text-green-600 font-medium">+${displayElo} Elo</span>`
        : `<span class="text-red-600 font-medium">-${displayElo} Elo</span>`;

    const handicapBadge = match.handicap_used
        ? '<span class="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">Handicap</span>'
        : '';

    const oppName = opponentDeleted ? 'Gelöschter Spieler' : (opponent.first_name || opponent.display_name || 'Gegner');
    const oppNameDisplay = oppName.length > 12 ? oppName.substring(0, 12) + '.' : oppName;

    return `
        <div class="bg-white rounded-xl shadow-sm border-l-4 ${isWinner ? 'border-l-green-500' : 'border-l-red-500'} p-4 mb-4">
            <!-- Kopfzeile -->
            <div class="flex justify-between items-center mb-3">
                <span class="text-sm text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${isWinner ? 'Sieg' : 'Niederlage'}
                </span>
            </div>

            <!-- Ergebnis -->
            <div class="text-center mb-3">
                <p class="text-3xl font-bold">${mySetWins} : ${oppSetWins}</p>
            </div>

            <!-- Spieler -->
            <div class="flex items-center justify-center gap-4 mb-3">
                <div class="flex items-center">
                    <img src="${myAvatar}" alt="Du"
                        class="w-8 h-8 rounded-full object-cover border-2 ${isWinner ? 'border-green-500' : 'border-red-500'}"
                        onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="ml-2">
                        <p class="text-sm font-medium">Du</p>
                        <p class="text-xs text-gray-400">#${currentPlayer.rank}</p>
                    </div>
                </div>

                <span class="text-gray-400 text-sm">vs</span>

                <div class="flex items-center">
                    <img src="${oppAvatar}" alt="Gegner"
                        class="w-8 h-8 rounded-full object-cover border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'}"
                        onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="ml-2">
                        <p class="text-sm font-medium">${oppNameDisplay}</p>
                        <p class="text-xs text-gray-400">#${opponent.rank}</p>
                    </div>
                </div>
            </div>

            <!-- Fußzeile -->
            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <div class="flex items-center">
                    ${statsHtml}${handicapBadge}
                </div>
                <button onclick="showMatchDetails('${match.id}', 'singles')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                    Details
                </button>
            </div>
        </div>
    `;
}

/** Rendert eine Doppel-Wettkampf-Karte (mobile-optimiert) */
function renderDoublesMatchCard(match, profileMap) {
    const isTeamA = match.team_a_player1_id === currentUser.id || match.team_a_player2_id === currentUser.id;
    const isWinner = (isTeamA && match.winning_team === 'A') || (!isTeamA && match.winning_team === 'B');

    const partnerId = isTeamA
        ? (match.team_a_player1_id === currentUser.id ? match.team_a_player2_id : match.team_a_player1_id)
        : (match.team_b_player1_id === currentUser.id ? match.team_b_player2_id : match.team_b_player1_id);

    // Gelöschte Spieler erkennen (NULL-IDs)
    const partnerDeleted = partnerId === null;
    const partner = partnerDeleted ? DELETED_PLAYER : (profileMap[partnerId] || {});

    const opp1Id = isTeamA ? match.team_b_player1_id : match.team_a_player1_id;
    const opp2Id = isTeamA ? match.team_b_player2_id : match.team_a_player2_id;
    const opp1Deleted = opp1Id === null;
    const opp2Deleted = opp2Id === null;
    const oppTeamPlayer1 = opp1Deleted ? DELETED_PLAYER : (profileMap[opp1Id] || {});
    const oppTeamPlayer2 = opp2Deleted ? DELETED_PLAYER : (profileMap[opp2Id] || {});

    let teamASetWins = 0;
    let teamBSetWins = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        if (scoreA > scoreB) teamASetWins++;
        else if (scoreB > scoreA) teamBSetWins++;
    });
    if (teamASetWins === 0 && teamBSetWins === 0) {
        teamASetWins = match.player_a_sets_won || 0;
        teamBSetWins = match.player_b_sets_won || 0;
    }

    const mySetWins = isTeamA ? teamASetWins : teamBSetWins;
    const oppSetWins = isTeamA ? teamBSetWins : teamASetWins;

    const matchDate = new Date(match.played_at || match.created_at);
    const dateDisplay = formatRelativeDate(matchDate);
    const timeDisplay = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const myAvatar = currentUserData?.avatar_url || DEFAULT_AVATAR;
    const partnerAvatar = partner.avatar_url || DEFAULT_AVATAR;
    const opp1Avatar = oppTeamPlayer1?.avatar_url || DEFAULT_AVATAR;
    const opp2Avatar = oppTeamPlayer2?.avatar_url || DEFAULT_AVATAR;

    const partnerName = partnerDeleted ? 'Gelöscht' : (partner.first_name || partner.display_name || 'Partner');
    const opp1Name = opp1Deleted ? 'Gelöscht' : (oppTeamPlayer1?.first_name || oppTeamPlayer1?.display_name || 'Gegner');
    const opp2Name = opp2Deleted ? 'Gelöscht' : (oppTeamPlayer2?.first_name || oppTeamPlayer2?.display_name || 'Gegner');

    const handicapBadge = match.handicap_used
        ? '<span class="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">Handicap</span>'
        : '';

    const myTeamEloChange = isTeamA ? (match.team_a_elo_change || 0) : (match.team_b_elo_change || 0);
    const displayElo = Math.abs(myTeamEloChange);

    const statsHtml = isWinner
        ? `<span class="text-green-600 font-medium">+${displayElo} Doppel-Elo</span>`
        : `<span class="text-red-600 font-medium">-${displayElo} Doppel-Elo</span>`;

    return `
        <div class="bg-white rounded-xl shadow-sm border-l-4 ${isWinner ? 'border-l-green-500' : 'border-l-red-500'} p-4 mb-4">
            <!-- Kopfzeile -->
            <div class="flex justify-between items-center mb-3">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">Doppel</span>
                    <span class="text-sm text-gray-500">${dateDisplay}, ${timeDisplay}</span>
                </div>
                <span class="px-2 py-1 rounded-full text-xs font-medium ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                    ${isWinner ? 'Sieg' : 'Niederlage'}
                </span>
            </div>

            <!-- Ergebnis und Teams -->
            <div class="flex flex-col items-center mb-3">
                <p class="text-3xl font-bold mb-2">${mySetWins} : ${oppSetWins}</p>

                <div class="doubles-teams-row flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm">
                    <div class="flex items-center">
                        <div class="flex -space-x-1 flex-shrink-0">
                            <img src="${myAvatar}" alt="Du"
                                class="w-5 h-5 rounded-full object-cover border ${isWinner ? 'border-green-500' : 'border-red-500'}"
                                onerror="this.src='${DEFAULT_AVATAR}'">
                            <img src="${partnerAvatar}" alt="${partnerName}"
                                class="w-5 h-5 rounded-full object-cover border ${isWinner ? 'border-green-500' : 'border-red-500'}"
                                onerror="this.src='${DEFAULT_AVATAR}'">
                        </div>
                        <span class="ml-1 doubles-team-names truncate max-w-[120px]">Du & ${partnerName}</span>
                    </div>
                    <span class="vs-separator text-gray-400">vs</span>
                    <div class="flex items-center">
                        <div class="flex -space-x-1 flex-shrink-0">
                            <img src="${opp1Avatar}" alt="${opp1Name}"
                                class="w-5 h-5 rounded-full object-cover border ${!isWinner ? 'border-green-500' : 'border-red-500'}"
                                onerror="this.src='${DEFAULT_AVATAR}'">
                            <img src="${opp2Avatar}" alt="${opp2Name}"
                                class="w-5 h-5 rounded-full object-cover border ${!isWinner ? 'border-green-500' : 'border-red-500'}"
                                onerror="this.src='${DEFAULT_AVATAR}'">
                        </div>
                        <span class="ml-1 doubles-team-names truncate max-w-[120px]">${opp1Name} & ${opp2Name}</span>
                    </div>
                </div>
            </div>

            <!-- Fußzeile -->
            <div class="flex justify-between items-center pt-2 border-t border-gray-100">
                <div class="flex items-center">
                    ${statsHtml}${handicapBadge}
                </div>
                <button onclick="showMatchDetails('${match.id}', 'doubles')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                    Details
                </button>
            </div>
        </div>
    `;
}

/** Formatiert relative Datumsangabe (Heute, Gestern, oder Datum) */
export function formatRelativeDate(date) {
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

/** Zeigt Detail-Modal für Einzel-Wettkampf */
export function showMatchDetails(matchId, matchType = 'singles') {
    const { matches, doublesMatches, profileMap } = window.matchHistoryData || {};

    const match = matchType === 'doubles'
        ? doublesMatches?.find(m => m.id === matchId)
        : matches?.find(m => m.id === matchId);
    if (!match) return;

    if (matchType === 'doubles') {
        showDoublesMatchDetails(match, profileMap);
        return;
    }

    const playerA = profileMap[match.player_a_id] || {};
    const playerB = profileMap[match.player_b_id] || {};

    const isParticipant = currentUser && (match.player_a_id === currentUser.id || match.player_b_id === currentUser.id);
    const isCurrentUserA = match.player_a_id === currentUser?.id;
    const isWinner = isParticipant && match.winner_id === currentUser.id;

    // Ansicht je nach Perspektive: Teilnehmer sieht "Du" links, Zuschauer sieht Gewinner links
    let leftPlayer, rightPlayer, leftIsWinner, leftName, rightName;
    if (isParticipant) {
        // "Du" links für Teilnehmer
        leftPlayer = isCurrentUserA ? playerA : playerB;
        rightPlayer = isCurrentUserA ? playerB : playerA;
        leftIsWinner = isWinner;
        leftName = 'Du';
        rightName = rightPlayer.first_name || rightPlayer.display_name || 'Gegner';
    } else {
        // Gewinner links für Zuschauer
        const winnerIsA = match.winner_id === match.player_a_id;
        leftPlayer = winnerIsA ? playerA : playerB;
        rightPlayer = winnerIsA ? playerB : playerA;
        leftIsWinner = true;
        leftName = leftPlayer.first_name || leftPlayer.display_name || 'Spieler 1';
        rightName = rightPlayer.first_name || rightPlayer.display_name || 'Spieler 2';
    }

    // Satzergebnisse aus Perspektive des linken Spielers
    const sets = match.sets || [];
    const leftIsPlayerA = isParticipant ? isCurrentUserA : (match.winner_id === match.player_a_id);
    let setsHtml = '';
    if (sets.length > 0) {
        setsHtml = sets.map((set, i) => {
            const scoreA = set.playerA ?? set.teamA ?? 0;
            const scoreB = set.playerB ?? set.teamB ?? 0;
            const leftScore = leftIsPlayerA ? scoreA : scoreB;
            const rightScore = leftIsPlayerA ? scoreB : scoreA;
            const leftWonSet = leftScore > rightScore;
            return `
                <div class="flex justify-between items-center py-2 ${i < sets.length - 1 ? 'border-b border-gray-100' : ''}">
                    <span class="text-gray-600">Satz ${i + 1}</span>
                    <span class="font-semibold ${leftWonSet ? 'text-green-600' : 'text-red-600'}">${leftScore} : ${rightScore}</span>
                </div>
            `;
        }).join('');
    } else {
        // Quick entry mode - show only set ratio
        const aWins = match.player_a_sets_won || 0;
        const bWins = match.player_b_sets_won || 0;
        if (aWins > 0 || bWins > 0) {
            const leftWins = leftIsPlayerA ? aWins : bWins;
            const rightWins = leftIsPlayerA ? bWins : aWins;
            setsHtml = `<div class="text-center py-3 text-gray-500 text-sm">Schnelleingabe: ${leftWins}:${rightWins} Sätze</div>`;
        }
    }

    const modeLabels = {
        'single-set': '1 Satz',
        'best-of-3': 'Best of 3',
        'best-of-5': 'Best of 5',
        'best-of-7': 'Best of 7',
        'pro-set': 'Pro-Set',
        'timed': 'Zeit/Fortlaufend',
        'fast4': 'Fast4'
    };
    const modeDisplay = modeLabels[match.match_mode] || match.match_mode || 'Standard';

    const winnerEloChange = Math.abs(match.winner_elo_change || 0);
    const loserEloChange = -Math.abs(match.loser_elo_change || 0);
    const leftEloChange = leftIsWinner ? winnerEloChange : loserEloChange;
    const rightEloChange = leftIsWinner ? loserEloChange : winnerEloChange;

    // Elo zum Zeitpunkt des Matches (vor dem Match)
    const leftEloAtMatch = leftIsPlayerA
        ? (match.player_a_elo_before || leftPlayer.elo_rating || 800)
        : (match.player_b_elo_before || rightPlayer.elo_rating || 800);
    const rightEloAtMatch = leftIsPlayerA
        ? (match.player_b_elo_before || rightPlayer.elo_rating || 800)
        : (match.player_a_elo_before || leftPlayer.elo_rating || 800);

    const matchDate = new Date(match.played_at || match.created_at);
    const dateStr = matchDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    let resultBadge = '';
    if (isParticipant) {
        resultBadge = `<span class="px-4 py-2 rounded-full text-lg font-bold ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
            ${isWinner ? 'Sieg' : 'Niederlage'}
        </span>`;
    } else {
        resultBadge = `<span class="px-4 py-2 rounded-full text-lg font-bold bg-green-100 text-green-700">
            ${leftName} gewinnt
        </span>`;
    }

    const modalHtml = `
        <div id="match-details-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick="if(event.target === this) this.remove()">
            <div class="bg-white rounded-2xl max-w-md w-full max-h-[75vh] overflow-y-auto">
                <div class="sticky top-0 bg-white p-4 border-b border-gray-200 flex justify-between items-center z-10 rounded-t-2xl">
                    <h3 class="text-lg font-bold">Match Details</h3>
                    <button onclick="document.getElementById('match-details-modal').remove()" class="text-gray-400 hover:text-gray-600 p-1">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="p-4">
                    <div class="text-center mb-4">
                        ${resultBadge}
                    </div>

                    <div class="flex items-center justify-between mb-6">
                        <div class="text-center">
                            <img src="${leftPlayer.avatar_url || DEFAULT_AVATAR}" class="w-16 h-16 rounded-full mx-auto border-2 ${leftIsWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <p class="font-semibold mt-2">${leftName}</p>
                            <p class="text-xs text-gray-500">${leftEloAtMatch} Elo</p>
                        </div>
                        <div class="text-2xl font-bold text-gray-400">VS</div>
                        <div class="text-center">
                            <img src="${rightPlayer.avatar_url || DEFAULT_AVATAR}" class="w-16 h-16 rounded-full mx-auto border-2 ${!leftIsWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            <p class="font-semibold mt-2">${rightName}</p>
                            <p class="text-xs text-gray-500">${rightEloAtMatch} Elo</p>
                        </div>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <h4 class="font-semibold mb-2 text-sm text-gray-600">Satzergebnisse</h4>
                        ${setsHtml}
                    </div>

                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">${isParticipant ? 'Deine' : leftName + 's'} Elo-Änderung</p>
                            <p class="text-lg font-bold ${leftEloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${leftEloChange >= 0 ? '+' : ''}${leftEloChange}
                            </p>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">${isParticipant ? 'Gegner' : rightName + 's'} Elo-Änderung</p>
                            <p class="text-lg font-bold ${rightEloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${rightEloChange >= 0 ? '+' : ''}${rightEloChange}
                            </p>
                        </div>
                        ${isWinner && match.season_points_awarded ? `
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Saisonpunkte</p>
                            <p class="text-lg font-bold text-green-600">+${match.season_points_awarded}</p>
                        </div>
                        ` : ''}
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Spielmodus</p>
                            <p class="text-sm font-semibold">${modeDisplay}</p>
                        </div>
                    </div>

                    ${match.handicap_used ? `
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-center">
                        <span class="text-yellow-800 font-medium">Handicap-Match</span>
                        ${match.handicap ? `
                        <p class="text-sm text-yellow-700 mt-1">
                            <strong>${match.handicap.player_name || match.handicap.player?.name || 'Spieler'}</strong> erhält <strong>${match.handicap.points || 0}</strong> Punkte Vorsprung
                        </p>
                        ` : ''}
                        <p class="text-xs text-yellow-600 mt-1">Feste Elo-Änderung: ±8 Punkte</p>
                    </div>
                    ` : ''}

                    <div class="text-center text-sm text-gray-500">
                        ${dateStr}
                    </div>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('match-details-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/** Zeigt Detail-Modal für Doppel-Wettkampf */
function showDoublesMatchDetails(match, profileMap) {
    const teamAPlayer1 = profileMap[match.team_a_player1_id] || {};
    const teamAPlayer2 = profileMap[match.team_a_player2_id] || {};
    const teamBPlayer1 = profileMap[match.team_b_player1_id] || {};
    const teamBPlayer2 = profileMap[match.team_b_player2_id] || {};

    const isInTeamA = match.team_a_player1_id === currentUser.id || match.team_a_player2_id === currentUser.id;
    const isWinner = isInTeamA ? match.winning_team === 'A' : match.winning_team === 'B';

    let myAvatar, partnerAvatar, partnerName, opp1Name, opp2Name, opp1Avatar, opp2Avatar;
    if (isInTeamA) {
        const me = match.team_a_player1_id === currentUser.id ? teamAPlayer1 : teamAPlayer2;
        const partner = match.team_a_player1_id === currentUser.id ? teamAPlayer2 : teamAPlayer1;
        myAvatar = me.avatar_url || DEFAULT_AVATAR;
        partnerAvatar = partner.avatar_url || DEFAULT_AVATAR;
        partnerName = partner.first_name || partner.display_name || 'Partner';
        opp1Name = teamBPlayer1.first_name || teamBPlayer1.display_name || 'Gegner 1';
        opp2Name = teamBPlayer2.first_name || teamBPlayer2.display_name || 'Gegner 2';
        opp1Avatar = teamBPlayer1.avatar_url || DEFAULT_AVATAR;
        opp2Avatar = teamBPlayer2.avatar_url || DEFAULT_AVATAR;
    } else {
        const me = match.team_b_player1_id === currentUser.id ? teamBPlayer1 : teamBPlayer2;
        const partner = match.team_b_player1_id === currentUser.id ? teamBPlayer2 : teamBPlayer1;
        myAvatar = me.avatar_url || DEFAULT_AVATAR;
        partnerAvatar = partner.avatar_url || DEFAULT_AVATAR;
        partnerName = partner.first_name || partner.display_name || 'Partner';
        opp1Name = teamAPlayer1.first_name || teamAPlayer1.display_name || 'Gegner 1';
        opp2Name = teamAPlayer2.first_name || teamAPlayer2.display_name || 'Gegner 2';
        opp1Avatar = teamAPlayer1.avatar_url || DEFAULT_AVATAR;
        opp2Avatar = teamAPlayer2.avatar_url || DEFAULT_AVATAR;
    }

    const sets = match.sets || [];
    let setsHtml = '';
    if (sets.length > 0) {
        setsHtml = sets.map((set, i) => {
            const scoreA = set.teamA ?? 0;
            const scoreB = set.teamB ?? 0;
            const myScore = isInTeamA ? scoreA : scoreB;
            const oppScore = isInTeamA ? scoreB : scoreA;
            const wonSet = myScore > oppScore;
            return `
                <div class="flex justify-between items-center py-2 ${i < sets.length - 1 ? 'border-b border-gray-100' : ''}">
                    <span class="text-gray-600">Satz ${i + 1}</span>
                    <span class="font-semibold ${wonSet ? 'text-green-600' : 'text-red-600'}">${myScore} : ${oppScore}</span>
                </div>
            `;
        }).join('');
    }

    const modeLabels = {
        'single-set': '1 Satz',
        'best-of-3': 'Best of 3',
        'best-of-5': 'Best of 5',
        'best-of-7': 'Best of 7',
        'pro-set': 'Pro-Set',
        'timed': 'Zeit/Fortlaufend',
        'fast4': 'Fast4'
    };
    const modeDisplay = modeLabels[match.match_mode] || match.match_mode || 'Standard';

    const teamAEloChange = match.team_a_elo_change || 0;
    const teamBEloChange = match.team_b_elo_change || 0;
    const myEloChange = isInTeamA ? teamAEloChange : teamBEloChange;
    const oppEloChange = isInTeamA ? teamBEloChange : teamAEloChange;
    const seasonPoints = match.season_points_awarded || 0;

    const matchDate = new Date(match.played_at || match.created_at);
    const dateStr = matchDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const modalHtml = `
        <div id="match-details-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onclick="if(event.target === this) this.remove()">
            <div class="bg-white rounded-2xl max-w-md w-full max-h-[75vh] overflow-y-auto">
                <div class="sticky top-0 bg-white p-4 border-b border-gray-200 flex justify-between items-center z-10 rounded-t-2xl">
                    <div class="flex items-center gap-2">
                        <h3 class="text-lg font-bold">Match Details</h3>
                        <span class="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full font-medium">Doppel</span>
                    </div>
                    <button onclick="document.getElementById('match-details-modal').remove()" class="text-gray-400 hover:text-gray-600 p-1">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <div class="p-4">
                    <div class="text-center mb-4">
                        <span class="px-4 py-2 rounded-full text-lg font-bold ${isWinner ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${isWinner ? 'Sieg' : 'Niederlage'}
                        </span>
                    </div>

                    <div class="flex items-center justify-between mb-6">
                        <div class="text-center">
                            <div class="flex -space-x-2 justify-center mb-2">
                                <img src="${myAvatar}" class="w-12 h-12 rounded-full border-2 ${isWinner ? 'border-green-500' : 'border-red-500'} z-10" onerror="this.src='${DEFAULT_AVATAR}'">
                                <img src="${partnerAvatar}" class="w-12 h-12 rounded-full border-2 ${isWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            </div>
                            <p class="font-semibold text-sm">Du & ${partnerName}</p>
                        </div>
                        <div class="text-2xl font-bold text-gray-400">VS</div>
                        <div class="text-center">
                            <div class="flex -space-x-2 justify-center mb-2">
                                <img src="${opp1Avatar}" class="w-12 h-12 rounded-full border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'} z-10" onerror="this.src='${DEFAULT_AVATAR}'">
                                <img src="${opp2Avatar}" class="w-12 h-12 rounded-full border-2 ${!isWinner ? 'border-green-500' : 'border-red-500'}" onerror="this.src='${DEFAULT_AVATAR}'">
                            </div>
                            <p class="font-semibold text-sm">${opp1Name} & ${opp2Name}</p>
                        </div>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <h4 class="font-semibold mb-2 text-sm text-gray-600">Satzergebnisse</h4>
                        ${setsHtml || '<p class="text-gray-400 text-sm">Keine Satzergebnisse</p>'}
                    </div>

                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Deine Doppel-Elo</p>
                            <p class="text-lg font-bold ${myEloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${myEloChange >= 0 ? '+' : ''}${myEloChange}
                            </p>
                        </div>
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Gegner Doppel-Elo</p>
                            <p class="text-lg font-bold ${oppEloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${oppEloChange >= 0 ? '+' : ''}${oppEloChange}
                            </p>
                        </div>
                        ${isWinner && seasonPoints > 0 ? `
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Saisonpunkte</p>
                            <p class="text-lg font-bold text-green-600">+${seasonPoints}</p>
                        </div>
                        ` : ''}
                        <div class="bg-gray-50 rounded-lg p-3 text-center">
                            <p class="text-xs text-gray-500">Spielmodus</p>
                            <p class="text-sm font-semibold">${modeDisplay}</p>
                        </div>
                    </div>

                    ${match.handicap_used ? `
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-center">
                        <span class="text-yellow-800 font-medium">Handicap-Match</span>
                        ${match.handicap ? `
                        <p class="text-sm text-yellow-700 mt-1">
                            <strong>${match.handicap.team_name || match.handicap.player_name || match.handicap.team?.name || 'Team'}</strong> erhält <strong>${match.handicap.points || 0}</strong> Punkte Vorsprung
                        </p>
                        ` : ''}
                        <p class="text-xs text-yellow-600 mt-1">Feste Elo-Änderung: ±8 Punkte</p>
                    </div>
                    ` : ''}

                    <div class="text-center text-sm text-gray-500">
                        ${dateStr}
                    </div>
                </div>
            </div>
        </div>
    `;

    const existing = document.getElementById('match-details-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/** Formatiert Satz-Anzeige */
export function formatSetsDisplay(sets, match) {
    if (!sets || sets.length === 0) {
        // Fallback to player_a_sets_won / player_b_sets_won
        const aWins = match?.player_a_sets_won || 0;
        const bWins = match?.player_b_sets_won || 0;
        if (aWins === 0 && bWins === 0) return 'Keine Sätze';
        return `${aWins}:${bWins}`;
    }

    let playerASetWins = 0;
    let playerBSetWins = 0;

    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (scoreA > scoreB) playerASetWins++;
        else if (scoreB > scoreA) playerBSetWins++;
    });

    const setScores = sets.map(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ');

    if (sets.length === 1) {
        return setScores;
    }

    return `${playerASetWins}:${playerBSetWins} (${setScores})`;
}

/** Löscht eine Wettkampf-Anfrage */
export async function deleteMatchRequest(requestId, callbacks = {}) {
    if (!confirm('Möchtest du diese Anfrage wirklich zurückziehen?')) return;

    try {
        const { data: request } = await supabase
            .from('match_requests')
            .select('player_b_id')
            .eq('id', requestId)
            .single();

        const { error } = await supabase
            .from('match_requests')
            .delete()
            .eq('id', requestId)
            .eq('player_a_id', currentUser.id);

        if (error) throw error;

        if (request?.player_b_id) {
            const { data: notifications } = await supabase
                .from('notifications')
                .select('id, data')
                .eq('user_id', request.player_b_id)
                .eq('type', 'match_request');

            for (const notif of (notifications || [])) {
                if (notif.data?.request_id === requestId) {
                    await supabase.from('notifications').delete().eq('id', notif.id);
                }
            }
        }

        // setTimeout stellt sicher, dass DOM und Funktionen verfügbar sind
        setTimeout(() => {
            if (typeof window.loadMatchRequests === 'function') {
                window.loadMatchRequests();
            }
            if (typeof window.loadPendingRequests === 'function') {
                window.loadPendingRequests();
            }
        }, 100);

        if (callbacks.onSuccess) {
            callbacks.onSuccess();
        }

    } catch (error) {
        console.error('Error deleting match request:', error);
        alert('Fehler beim Löschen der Anfrage');
    }
}

// Funktionen global verfügbar machen für onclick-Handler
window.showMatchDetails = showMatchDetails;
window.deleteMatchRequest = deleteMatchRequest;
