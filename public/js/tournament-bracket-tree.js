// Tournament Bracket Tree Component
// Flexible bracket visualization with SVG connectors
// Adapted from Figma design for SC Champions

import { escapeHtml } from './utils/security.js';

/**
 * Configuration constants
 */
const MATCH_HEIGHT = 100;
const MATCH_WIDTH = 220;
const BASE_GAP = 24;
const HORIZONTAL_GAP = 64;
const CONNECTOR_LENGTH = 32;

/**
 * Transform Supabase tournament matches to bracket format
 * @param {Array} matches - Tournament matches from Supabase
 * @returns {Object} - Bracket data with winners and losers arrays
 */
export function transformMatchesToBracketData(matches) {
    if (!matches || matches.length === 0) {
        return { winners: [], losers: [] };
    }

    // Separate matches by bracket type
    const winnersMatches = matches.filter(m => m.bracket_type === 'winners');
    const losersMatches = matches.filter(m => m.bracket_type === 'losers');
    const finalsMatches = matches.filter(m => m.bracket_type === 'finals');
    const grandFinalsMatches = matches.filter(m => m.bracket_type === 'grand_finals');

    // Group matches by round
    const groupByRound = (arr) => {
        const byRound = {};
        arr.forEach(m => {
            const r = m.round_number || 1;
            if (!byRound[r]) byRound[r] = [];
            byRound[r].push(m);
        });
        // Sort by bracket_position within each round
        Object.keys(byRound).forEach(r => {
            byRound[r].sort((a, b) => (a.bracket_position || 0) - (b.bracket_position || 0));
        });
        return byRound;
    };

    const winnersRounds = groupByRound(winnersMatches);
    const losersRounds = groupByRound(losersMatches);

    // Convert to array format (sorted by round number)
    const winnersArray = Object.keys(winnersRounds)
        .sort((a, b) => Number(a) - Number(b))
        .map(roundNum => winnersRounds[roundNum].map(m => transformMatch(m)));

    const losersArray = Object.keys(losersRounds)
        .sort((a, b) => Number(a) - Number(b))
        .map(roundNum => losersRounds[roundNum].map(m => transformMatch(m)));

    // Add finals to winners bracket if exists
    if (finalsMatches.length > 0) {
        winnersArray.push(finalsMatches.map(m => transformMatch(m)));
    }

    // Add grand finals reset match if exists
    if (grandFinalsMatches.length > 0) {
        winnersArray.push(grandFinalsMatches.map(m => transformMatch(m)));
    }

    return {
        winners: winnersArray,
        losers: losersArray
    };
}

/**
 * Transform a single match to the bracket format
 */
function transformMatch(match) {
    const getPlayerData = (player, playerId) => {
        if (!playerId) {
            return { name: 'TBD', seed: null, elo: null, avatar: null };
        }
        const displayName = player?.display_name ||
            `${player?.first_name || ''} ${player?.last_name || ''}`.trim() ||
            'Unbekannt';
        return {
            name: displayName,
            seed: null, // Seeds can be added from tournament_participants if needed
            elo: player?.elo_rating || null,
            avatar: player?.avatar_url || null
        };
    };

    // Determine match status
    let status = 'upcoming';
    if (match.status === 'completed') {
        status = 'completed';
    } else if (match.status === 'skipped') {
        status = 'completed'; // Show skipped as completed
    }

    // Determine winner (1 = player_a, 2 = player_b)
    let winner = null;
    if (match.winner_id) {
        if (match.winner_id === match.player_a_id) winner = 1;
        else if (match.winner_id === match.player_b_id) winner = 2;
    }

    // Build score string
    let score = '—';
    if (match.status === 'completed' && match.player_a_sets_won !== null && match.player_b_sets_won !== null) {
        score = `${match.player_a_sets_won}:${match.player_b_sets_won}`;
    } else if (match.status === 'skipped') {
        score = 'Skip';
    }

    return {
        id: match.id,
        player1: getPlayerData(match.player_a, match.player_a_id),
        player2: getPlayerData(match.player_b, match.player_b_id),
        score: score,
        winner: winner,
        status: status,
        bracketType: match.bracket_type,
        roundNumber: match.round_number,
        bracketPosition: match.bracket_position
    };
}

/**
 * Get round name based on position from end
 */
function getRoundName(index, totalRounds, isLosersBracket) {
    if (isLosersBracket) {
        return `LR ${index + 1}`;
    }

    const fromEnd = totalRounds - index - 1;
    if (fromEnd === 0) return 'Finale';
    if (fromEnd === 1) return 'Halbfinale';
    if (fromEnd === 2) return 'Viertelfinale';
    if (fromEnd === 3) return 'Achtelfinale';
    return `Runde ${index + 1}`;
}

/**
 * Calculate the absolute top position of a match for proper alignment
 */
function calculateMatchTop(roundIndex, matchIndex) {
    if (roundIndex === 0) {
        return matchIndex * (MATCH_HEIGHT + BASE_GAP);
    } else {
        const parentIndex1 = matchIndex * 2;
        const parentIndex2 = matchIndex * 2 + 1;

        const parent1Top = calculateMatchTop(roundIndex - 1, parentIndex1);
        const parent2Top = calculateMatchTop(roundIndex - 1, parentIndex2);

        const parent1Center = parent1Top + MATCH_HEIGHT / 2;
        const parent2Center = parent2Top + MATCH_HEIGHT / 2;
        const thisCenter = (parent1Center + parent2Center) / 2;

        return thisCenter - MATCH_HEIGHT / 2;
    }
}

/**
 * Create SVG connector lines between matches
 */
function createConnectorSVG(roundIndex, matchIndex, totalHeight, meetingPointY, isCompleted, isLosersBracket) {
    const lineColor = isCompleted
        ? (isLosersBracket ? '#f97316' : '#10b981')
        : '#d1d5db';
    const strokeWidth = isCompleted ? 3 : 2;
    const horizontalLength = CONNECTOR_LENGTH;

    return `
        <svg class="bracket-connector-svg"
             style="position: absolute; left: 100%; top: 50%; width: ${horizontalLength}px; height: ${totalHeight}px; overflow: visible; pointer-events: none; z-index: 10;">
            <!-- Line from top match - horizontal -->
            <line x1="0" y1="0" x2="${horizontalLength / 2}" y2="0"
                  stroke="${lineColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                  class="bracket-connector-line" style="animation-delay: ${roundIndex * 0.1}s" />

            <!-- Vertical line from top match to meeting point -->
            <line x1="${horizontalLength / 2}" y1="0" x2="${horizontalLength / 2}" y2="${meetingPointY}"
                  stroke="${lineColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                  class="bracket-connector-line" style="animation-delay: ${roundIndex * 0.1 + 0.1}s" />

            <!-- Line from bottom match - horizontal -->
            <line x1="0" y1="${totalHeight}" x2="${horizontalLength / 2}" y2="${totalHeight}"
                  stroke="${lineColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                  class="bracket-connector-line" style="animation-delay: ${roundIndex * 0.1}s" />

            <!-- Vertical line from bottom match to meeting point -->
            <line x1="${horizontalLength / 2}" y1="${totalHeight}" x2="${horizontalLength / 2}" y2="${meetingPointY}"
                  stroke="${lineColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                  class="bracket-connector-line" style="animation-delay: ${roundIndex * 0.1 + 0.1}s" />

            <!-- Horizontal line to next round -->
            <line x1="${horizontalLength / 2}" y1="${meetingPointY}" x2="${horizontalLength}" y2="${meetingPointY}"
                  stroke="${lineColor}" stroke-width="${strokeWidth}" stroke-linecap="round"
                  class="bracket-connector-line" style="animation-delay: ${roundIndex * 0.1 + 0.2}s" />
        </svg>
    `;
}

/**
 * Render a single match card
 */
function renderMatchCard(match, roundIndex, matchIndex, isLosersBracket) {
    const isCompleted = match.status === 'completed';
    const isTBD = match.player1.name === 'TBD' && match.player2.name === 'TBD';

    // Border and shadow colors based on status
    let borderClass = 'border-gray-200';
    let shadowClass = 'shadow-md';
    if (isCompleted) {
        borderClass = isLosersBracket ? 'border-orange-400' : 'border-green-400';
        shadowClass = isLosersBracket ? 'shadow-orange-100' : 'shadow-green-100';
    }

    // Player row background based on winner
    const getPlayerBg = (playerNum) => {
        if (match.winner === playerNum) {
            return isLosersBracket
                ? 'bg-gradient-to-r from-orange-50 to-amber-50'
                : 'bg-gradient-to-r from-green-50 to-emerald-50';
        }
        return 'bg-white';
    };

    const getPlayerRing = (playerNum) => {
        if (match.winner === playerNum) {
            return isLosersBracket ? 'ring-2 ring-orange-400' : 'ring-2 ring-green-400';
        }
        return 'ring-1 ring-gray-200';
    };

    const getNameColor = (playerNum) => {
        if (match.winner === playerNum) {
            return isLosersBracket ? 'text-orange-900' : 'text-green-900';
        }
        return 'text-gray-900';
    };

    const renderPlayer = (player, playerNum, hasBorder) => {
        const isWinner = match.winner === playerNum;
        const hasAvatar = player.avatar && player.avatar.trim() !== '';

        // Get initials for fallback avatar
        const getInitials = (name) => {
            if (!name || name === 'TBD') return '?';
            const parts = name.trim().split(' ');
            if (parts.length >= 2) {
                return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
            }
            return name.substring(0, 2).toUpperCase();
        };

        return `
            <div class="flex items-center gap-2 p-2 ${getPlayerBg(playerNum)} ${hasBorder ? 'border-b border-gray-100' : ''}">
                ${player.name !== 'TBD' ? `
                    <div class="relative flex-shrink-0">
                        ${hasAvatar ? `
                            <img src="${escapeHtml(player.avatar)}"
                                 alt="${escapeHtml(player.name)}"
                                 class="w-8 h-8 rounded-full ${getPlayerRing(playerNum)} object-cover"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div class="w-8 h-8 rounded-full ${getPlayerRing(playerNum)} bg-gray-200 items-center justify-center text-xs font-bold text-gray-600" style="display: none;">
                                ${escapeHtml(getInitials(player.name))}
                            </div>
                        ` : `
                            <div class="w-8 h-8 rounded-full ${getPlayerRing(playerNum)} bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                                ${escapeHtml(getInitials(player.name))}
                            </div>
                        `}
                        ${player.seed ? `
                            <div class="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                                ${player.seed}
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1">
                        <span class="font-semibold text-sm truncate ${getNameColor(playerNum)}">
                            ${player.name === 'TBD' ? '<span class="text-gray-400 italic">TBD</span>' : escapeHtml(player.name)}
                        </span>
                        ${isWinner ? '<i class="fas fa-crown text-yellow-500 text-xs flex-shrink-0"></i>' : ''}
                    </div>
                    ${player.elo ? `<div class="text-xs text-gray-500">Elo ${player.elo}</div>` : ''}
                </div>
                ${isCompleted && isWinner ? `
                    <div class="text-lg font-bold ${isLosersBracket ? 'text-orange-500' : 'text-green-500'}">
                        <i class="fas fa-check"></i>
                    </div>
                ` : ''}
            </div>
        `;
    };

    // Footer based on status
    let footerContent = '';
    let footerClass = 'bg-gray-100 text-gray-600';

    if (isCompleted) {
        footerClass = isLosersBracket ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
        footerContent = match.score;
    } else {
        footerContent = 'Ausstehend';
    }

    return `
        <div class="bracket-match-card bg-white rounded-xl border-2 ${borderClass} ${shadowClass} overflow-hidden hover:shadow-lg transition-all duration-300"
             style="width: ${MATCH_WIDTH}px; height: ${MATCH_HEIGHT}px; animation: bracketMatchFadeIn 0.3s ease-out ${roundIndex * 0.15 + matchIndex * 0.05}s both;"
             data-match-id="${match.id}">
            ${renderPlayer(match.player1, 1, true)}
            ${renderPlayer(match.player2, 2, false)}
            <div class="px-2 py-1 text-xs font-bold text-center ${footerClass}">
                ${footerContent}
            </div>
        </div>
    `;
}

/**
 * Render a complete bracket section (winners or losers)
 */
function renderBracketSection(rounds, isLosersBracket) {
    if (!rounds || rounds.length === 0) {
        return `
            <div class="text-center py-12 text-gray-500">
                <i class="fas fa-trophy text-4xl mb-3 opacity-30"></i>
                <p>Keine Matches verfuegbar</p>
            </div>
        `;
    }

    let html = `<div class="bracket-rounds-container flex gap-16 min-w-max p-6">`;

    rounds.forEach((round, roundIndex) => {
        const roundName = getRoundName(roundIndex, rounds.length, isLosersBracket);
        const isFinal = roundIndex === rounds.length - 1;

        html += `
            <div class="bracket-round relative" style="padding-top: 48px;">
                <!-- Round Title -->
                <div class="absolute top-0 left-1/2 transform -translate-x-1/2 z-20 whitespace-nowrap">
                    <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm shadow-lg ${
                        isLosersBracket
                            ? 'bg-orange-600 text-white'
                            : 'bg-green-600 text-white'
                    }">
                        ${isFinal ? '<i class="fas fa-trophy"></i>' : ''}
                        ${escapeHtml(roundName)}
                    </div>
                </div>

                <!-- Matches -->
                <div class="bracket-round-matches relative">
        `;

        round.forEach((match, matchIndex) => {
            const absoluteTop = calculateMatchTop(roundIndex, matchIndex);
            let marginTop = absoluteTop;
            if (matchIndex > 0) {
                const prevAbsoluteTop = calculateMatchTop(roundIndex, matchIndex - 1);
                marginTop = absoluteTop - (prevAbsoluteTop + MATCH_HEIGHT);
            }

            const isTopOfPair = matchIndex % 2 === 0;
            const hasNextRound = roundIndex < rounds.length - 1;
            const hasBottomMatch = matchIndex + 1 < round.length;

            html += `
                <div class="bracket-match-wrapper relative" style="margin-top: ${marginTop}px;">
                    ${renderMatchCard(match, roundIndex, matchIndex, isLosersBracket)}
            `;

            // Add connector lines for pairs
            if (hasNextRound && isTopOfPair && hasBottomMatch) {
                const topMatch = match;
                const bottomMatch = round[matchIndex + 1];

                const topMatchAbsoluteTop = calculateMatchTop(roundIndex, matchIndex);
                const bottomMatchAbsoluteTop = calculateMatchTop(roundIndex, matchIndex + 1);
                const nextMatchAbsoluteTop = calculateMatchTop(roundIndex + 1, Math.floor(matchIndex / 2));

                const topMatchCenter = topMatchAbsoluteTop + MATCH_HEIGHT / 2;
                const bottomMatchCenter = bottomMatchAbsoluteTop + MATCH_HEIGHT / 2;
                const nextMatchCenter = nextMatchAbsoluteTop + MATCH_HEIGHT / 2;

                const meetingPointY = nextMatchCenter - topMatchCenter;
                const totalHeight = bottomMatchCenter - topMatchCenter;

                const isCompleted = topMatch.status === 'completed' && bottomMatch.status === 'completed';

                html += createConnectorSVG(roundIndex, matchIndex, totalHeight, meetingPointY, isCompleted, isLosersBracket);
            }

            html += `</div>`;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

/**
 * Main render function for the complete tournament bracket
 * @param {HTMLElement} container - Container element to render into
 * @param {Object} bracketData - Bracket data with winners and losers arrays
 */
export function renderTournamentBracket(container, bracketData) {
    if (!container) return;

    const { winners, losers } = bracketData;
    const hasWinners = winners && winners.length > 0 && winners.some(r => r.length > 0);
    const hasLosers = losers && losers.length > 0 && losers.some(r => r.length > 0);

    let html = `
        <div class="tournament-bracket-container space-y-8">
            <!-- Scroll hint -->
            <div class="bracket-scroll-info flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
                <i class="fas fa-arrows-alt-h"></i>
                <span>Horizontal scrollen um den gesamten Baum zu sehen</span>
            </div>
    `;

    // Winners Bracket
    if (hasWinners) {
        html += `
            <div class="bracket-section">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-trophy text-amber-500 text-xl"></i>
                    <h3 class="text-xl font-bold text-gray-900">Hauptrunde</h3>
                </div>
                <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl overflow-x-auto">
                    ${renderBracketSection(winners, false)}
                </div>
            </div>
        `;
    }

    // Losers Bracket
    if (hasLosers) {
        html += `
            <div class="bracket-section">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-level-down-alt text-orange-500 text-xl"></i>
                    <h3 class="text-xl font-bold text-gray-900">Trostrunde</h3>
                </div>
                <div class="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl overflow-x-auto">
                    ${renderBracketSection(losers, true)}
                </div>
            </div>
        `;
    }

    if (!hasWinners && !hasLosers) {
        html += `
            <div class="text-center py-16 text-gray-500">
                <i class="fas fa-sitemap text-5xl mb-4 opacity-30"></i>
                <p class="text-lg">Keine Bracket-Daten verfuegbar</p>
                <p class="text-sm mt-2">Das Turnier wurde noch nicht gestartet oder hat keine Double-Elimination-Struktur.</p>
            </div>
        `;
    }

    html += `</div>`;

    container.innerHTML = html;
}

/**
 * Convenience function to render bracket directly from tournament matches
 * @param {HTMLElement} container - Container element
 * @param {Array} matches - Tournament matches from Supabase
 */
export function renderBracketFromMatches(container, matches) {
    const bracketData = transformMatchesToBracketData(matches);
    renderTournamentBracket(container, bracketData);
}
