/**
 * Doubles Head-to-Head Statistics Module (Supabase Version)
 * Shows match history and statistics between two doubles teams
 */

// ========================================================================
// ===== MODAL MANAGEMENT =====
// ========================================================================

let currentModal = null;

/**
 * Show head-to-head statistics modal for two doubles teams
 * @param {Object} supabase - Supabase-Client-Instanz
 * @param {string} currentUserId - ID des aktuellen Benutzers
 * @param {Object} opponentTeam - Gegnerteam-Objekt mit player1Id und player2Id
 */
export async function showDoublesHeadToHeadModal(supabase, currentUserId, opponentTeam) {
    // Bestehendes Modal schließen falls vorhanden
    closeDoublesHeadToHeadModal();

    // Modal-Container erstellen
    const modal = document.createElement('div');
    modal.id = 'doubles-h2h-modal';
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center p-4';
    modal.style.cssText = 'z-index: 100001;'; // Higher than header (9999) and bottom nav (99999)
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-y-auto" style="max-height: calc(100vh - 140px); margin-top: 60px; margin-bottom: 80px;">
            <div class="p-6">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-2xl font-bold text-gray-900">Doppel Head-to-Head</h2>
                    <button id="close-doubles-h2h-modal" class="text-gray-400 hover:text-gray-600 text-2xl font-bold">
                        ×
                    </button>
                </div>
                <div id="doubles-h2h-content" class="text-center py-8">
                    <p class="text-gray-400">Lade Statistiken...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    currentModal = modal;

    // Bei Hintergrund-Klick schließen
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeDoublesHeadToHeadModal();
        }
    });

    // Schließen-Button
    document.getElementById('close-doubles-h2h-modal').addEventListener('click', closeDoublesHeadToHeadModal);

    // Statistiken laden und anzeigen
    await loadDoublesHeadToHeadStats(supabase, currentUserId, opponentTeam);
}

/**
 * Close the doubles head-to-head modal
 */
export function closeDoublesHeadToHeadModal() {
    if (currentModal) {
        currentModal.remove();
        currentModal = null;
    }
}

// ========================================================================
// ===== STATISTICS LOADING =====
// ========================================================================

/**
 * Load and display doubles head-to-head statistics
 * @param {Object} supabase - Supabase-Client-Instanz
 * @param {string} currentUserId - ID des aktuellen Benutzers
 * @param {Object} opponentTeam - Gegnerteam mit player1Id, player2Id, player1Name, player2Name
 */
async function loadDoublesHeadToHeadStats(supabase, currentUserId, opponentTeam) {
    const contentEl = document.getElementById('doubles-h2h-content');

    try {
        const opponentPlayer1Id = opponentTeam.player1Id;
        const opponentPlayer2Id = opponentTeam.player2Id;
        const opponentTeamName = `${opponentTeam.player1Name} & ${opponentTeam.player2Name}`;

        // Query all doubles matches where current user participated
        // Supabase uses flat field names: team_a_player1_id, team_a_player2_id, etc.
        const { data: allMatches, error } = await supabase
            .from('doubles_matches')
            .select('*')
            .or(`team_a_player1_id.eq.${currentUserId},team_a_player2_id.eq.${currentUserId},team_b_player1_id.eq.${currentUserId},team_b_player2_id.eq.${currentUserId}`)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching doubles matches:', error);
            contentEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Statistiken.</p>';
            return;
        }

        // Matches filtern wo Benutzer gegen dieses Gegnerteam gespielt hat
        const relevantMatches = [];
        const pairingHistory = new Map(); // Track which partners I played with

        (allMatches || []).forEach(match => {
            const teamAPlayers = [match.team_a_player1_id, match.team_a_player2_id];
            const teamBPlayers = [match.team_b_player1_id, match.team_b_player2_id];

            const currentUserInTeamA = teamAPlayers.includes(currentUserId);
            const currentUserInTeamB = teamBPlayers.includes(currentUserId);

            // Prüfen ob Gegnerteam genau in teamA oder teamB ist
            const opponentTeamInTeamA =
                teamAPlayers.includes(opponentPlayer1Id) &&
                teamAPlayers.includes(opponentPlayer2Id);
            const opponentTeamInTeamB =
                teamBPlayers.includes(opponentPlayer1Id) &&
                teamBPlayers.includes(opponentPlayer2Id);

            // Match is relevant if:
            // - Current user is in one team AND opponent team is in the other team
            if ((currentUserInTeamA && opponentTeamInTeamB) || (currentUserInTeamB && opponentTeamInTeamA)) {
                relevantMatches.push(match);

                // Track pairing
                const myPartnerId = currentUserInTeamA
                    ? teamAPlayers.find(p => p !== currentUserId)
                    : teamBPlayers.find(p => p !== currentUserId);

                if (myPartnerId) {
                    const count = pairingHistory.get(myPartnerId) || 0;
                    pairingHistory.set(myPartnerId, count + 1);
                }
            }
        });

        // Statistiken berechnen
        const stats = calculateDoublesStats(relevantMatches, currentUserId);

        // Partner-Namen für Paarungen abrufen
        const partnerNames = await getPartnerNames(supabase, Array.from(pairingHistory.keys()));

        // Modal-Inhalt rendern
        renderDoublesHeadToHeadContent(
            contentEl,
            opponentTeamName,
            stats,
            relevantMatches,
            currentUserId,
            pairingHistory,
            partnerNames
        );

    } catch (error) {
        console.error('Error loading doubles head-to-head stats:', error);
        contentEl.innerHTML = '<p class="text-red-500">Fehler beim Laden der Statistiken.</p>';
    }
}

/**
 * Get partner names from their IDs
 * @param {Object} supabase - Supabase-Client-Instanz
 * @param {string[]} partnerIds - Array von Partner-IDs
 * @returns {Map} Map von partnerId -> Name
 */
async function getPartnerNames(supabase, partnerIds) {
    const names = new Map();

    if (partnerIds.length === 0) return names;

    try {
        const { data: partners, error } = await supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .in('id', partnerIds);

        if (!error && partners) {
            partners.forEach(partner => {
                const name = `${partner.first_name || ''} ${partner.last_name || ''}`.trim();
                names.set(partner.id, name || 'Unbekannt');
            });
        }
    } catch (error) {
        console.error('Error fetching partner names:', error);
    }

    return names;
}

// ========================================================================
// ===== STATISTICS CALCULATION =====
// ========================================================================

/**
 * Calculate doubles statistics
 * @param {Array} matches - Array von Match-Objekten
 * @param {string} currentUserId - ID des aktuellen Benutzers
 * @returns {Object} Statistik-Objekt
 */
function calculateDoublesStats(matches, currentUserId) {
    let wins = 0;
    let losses = 0;
    let setsWon = 0;
    let setsLost = 0;

    matches.forEach(match => {
        // Determine if current user was in team A or B
        const teamAPlayers = [match.team_a_player1_id, match.team_a_player2_id];
        const currentUserInTeamA = teamAPlayers.includes(currentUserId);

        const isWinner = currentUserInTeamA
            ? match.winning_team === 'A'
            : match.winning_team === 'B';

        if (isWinner) {
            wins++;
        } else {
            losses++;
        }

        // Count sets
        if (match.sets && Array.isArray(match.sets)) {
            match.sets.forEach(set => {
                // Sätze können team_a/team_b oder teamA/teamB je nach Format verwenden
                const teamAScore = parseInt(set.team_a ?? set.teamA) || 0;
                const teamBScore = parseInt(set.team_b ?? set.teamB) || 0;

                const myScore = currentUserInTeamA ? teamAScore : teamBScore;
                const oppScore = currentUserInTeamA ? teamBScore : teamAScore;

                if (myScore > oppScore) {
                    setsWon++;
                } else if (oppScore > myScore) {
                    setsLost++;
                }
            });
        }
    });

    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    return {
        wins,
        losses,
        totalMatches,
        winRate,
        setsWon,
        setsLost,
    };
}

// ========================================================================
// ===== RENDERING =====
// ========================================================================

/**
 * Render doubles head-to-head content
 */
function renderDoublesHeadToHeadContent(
    container,
    opponentTeamName,
    stats,
    matches,
    currentUserId,
    pairingHistory,
    partnerNames
) {
    let winRateColor = 'text-gray-600';
    if (stats.winRate >= 60) {
        winRateColor = 'text-green-600';
    } else if (stats.winRate <= 40) {
        winRateColor = 'text-red-600';
    }

    // Paarungslisten-HTML erstellen
    let pairingsHTML = '';
    if (pairingHistory.size > 0) {
        pairingsHTML = '<div class="mb-6"><h4 class="text-md font-semibold text-gray-900 mb-2">Deine Paarungen</h4><div class="space-y-1">';
        pairingHistory.forEach((count, partnerId) => {
            const partnerName = partnerNames.get(partnerId) || 'Unbekannt';
            pairingsHTML += `<p class="text-sm text-gray-700">• Mit <span class="font-semibold">${partnerName}</span>: ${count} Match${count !== 1 ? 'es' : ''}</p>`;
        });
        pairingsHTML += '</div></div>';
    }

    container.innerHTML = `
        <!-- Opponent Team Info -->
        <div class="text-center mb-6">
            <h3 class="text-xl font-bold text-gray-900">${opponentTeamName}</h3>
        </div>

        ${stats.totalMatches === 0 ? `
            <!-- No Matches Yet -->
            <div class="bg-gray-50 rounded-lg p-6 text-center">
                <p class="text-gray-500">Noch keine Matches gegen dieses Team gespielt.</p>
            </div>
        ` : `
            <!-- Statistics -->
            <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-6 mb-6">
                <h4 class="text-lg font-semibold text-gray-900 mb-4 text-center">Deine Bilanz</h4>

                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="bg-white rounded-lg p-4 text-center shadow">
                        <p class="text-3xl font-bold text-green-600">${stats.wins}</p>
                        <p class="text-sm text-gray-600">Siege</p>
                    </div>
                    <div class="bg-white rounded-lg p-4 text-center shadow">
                        <p class="text-3xl font-bold text-red-600">${stats.losses}</p>
                        <p class="text-sm text-gray-600">Niederlagen</p>
                    </div>
                </div>

                <div class="bg-white rounded-lg p-4 text-center shadow mb-4">
                    <p class="text-4xl font-bold ${winRateColor}">${stats.winRate}%</p>
                    <p class="text-sm text-gray-600">Siegrate</p>
                </div>

                <!-- Sets Ratio -->
                <div class="bg-white rounded-lg p-4 text-center shadow">
                    <div class="flex items-center justify-center gap-2">
                        <p class="text-3xl font-bold text-indigo-600">${stats.setsWon}</p>
                        <p class="text-2xl text-gray-400">:</p>
                        <p class="text-3xl font-bold text-purple-600">${stats.setsLost}</p>
                    </div>
                    <p class="text-sm text-gray-600 mt-2">Satzverhältnis</p>
                </div>
            </div>

            ${pairingsHTML}

            <!-- Match History -->
            <div class="mb-4">
                <h4 class="text-lg font-semibold text-gray-900 mb-3">Match-Historie</h4>
                <div id="doubles-h2h-match-list" class="space-y-2">
                    ${renderDoublesMatchHistory(matches.slice(0, 3), currentUserId, partnerNames)}
                </div>
                ${matches.length > 3 ? `
                    <div class="text-center mt-4">
                        <button id="doubles-h2h-toggle-btn" class="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 rounded-md hover:bg-indigo-50 transition-colors">
                            + ${matches.length - 3} weitere Match${matches.length - 3 !== 1 ? 'es' : ''} anzeigen
                        </button>
                    </div>
                ` : ''}
            </div>
        `}
    `;

    // Toggle-Funktionalität für Match-Verlauf hinzufügen
    if (matches.length > 3) {
        let showingAll = false;
        const toggleBtn = document.getElementById('doubles-h2h-toggle-btn');
        const matchList = document.getElementById('doubles-h2h-match-list');

        if (toggleBtn && matchList) {
            toggleBtn.addEventListener('click', () => {
                showingAll = !showingAll;
                if (showingAll) {
                    matchList.innerHTML = renderDoublesMatchHistory(matches, currentUserId, partnerNames);
                    toggleBtn.innerHTML = '− Weniger anzeigen';
                } else {
                    matchList.innerHTML = renderDoublesMatchHistory(matches.slice(0, 3), currentUserId, partnerNames);
                    toggleBtn.innerHTML = `+ ${matches.length - 3} weitere Match${matches.length - 3 !== 1 ? 'es' : ''} anzeigen`;
                }
            });
        }
    }
}

/**
 * Render doubles match history list
 * @param {Array} matches - Array von Match-Objekten
 * @param {string} currentUserId - ID des aktuellen Benutzers
 * @param {Map} partnerNames - Map von partnerId -> Name
 * @returns {string} HTML-String
 */
function renderDoublesMatchHistory(matches, currentUserId, partnerNames) {
    if (matches.length === 0) {
        return '<p class="text-gray-400 text-center py-4">Keine Matches gefunden</p>';
    }

    return matches.map(match => {
        const teamAPlayers = [match.team_a_player1_id, match.team_a_player2_id];
        const teamBPlayers = [match.team_b_player1_id, match.team_b_player2_id];
        const currentUserInTeamA = teamAPlayers.includes(currentUserId);

        // Partner-ID finden (anderer Spieler im selben Team)
        const myTeamPlayers = currentUserInTeamA ? teamAPlayers : teamBPlayers;
        const partnerId = myTeamPlayers.find(id => id !== currentUserId);
        const partnerName = partnerNames?.get(partnerId) || 'Unbekannt';

        const isWinner = currentUserInTeamA
            ? match.winning_team === 'A'
            : match.winning_team === 'B';

        // Datum parsen - Supabase gibt ISO-Strings zurück
        const matchDate = match.played_at ? new Date(match.played_at) :
                         match.created_at ? new Date(match.created_at) : new Date();
        const formattedDate = formatMatchDate(matchDate);

        // Sätze formatieren
        const setsDisplay = formatDoublesS(match.sets, currentUserInTeamA);

        return `
            <div class="flex items-center justify-between p-3 ${isWinner ? 'bg-green-50 border-l-4 border-green-500' : 'bg-red-50 border-l-4 border-red-500'} rounded-lg">
                <div class="flex-1">
                    <div class="flex items-center justify-between">
                        <p class="text-sm font-semibold ${isWinner ? 'text-green-700' : 'text-red-700'}">
                            ${isWinner ? 'Sieg' : 'Niederlage'}
                        </p>
                        <p class="text-sm font-mono font-medium text-gray-800">${setsDisplay}</p>
                    </div>
                    <div class="flex items-center justify-between mt-1">
                        <p class="text-xs text-gray-600">Mit <span class="font-medium">${partnerName}</span></p>
                        <p class="text-xs text-gray-500">${formattedDate}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========================================================================
// ===== FORMATTING UTILITIES =====
// ========================================================================

/**
 * Format sets for display
 * @param {Array} sets - Array von Satz-Objekten
 * @param {boolean} isTeamA - Ob der aktuelle Benutzer in Team A ist
 * @returns {string} Formatierter Satz-String
 */
function formatDoublesS(sets, isTeamA) {
    if (!sets || sets.length === 0) return 'N/A';

    return sets
        .map(set => {
            // Sowohl snake_case als auch camelCase Formate verarbeiten
            const teamAScore = set.team_a ?? set.teamA;
            const teamBScore = set.team_b ?? set.teamB;
            const myScore = isTeamA ? teamAScore : teamBScore;
            const oppScore = isTeamA ? teamBScore : teamAScore;
            return `${myScore}:${oppScore}`;
        })
        .join(', ');
}

/**
 * Format match date
 * @param {Date} date - Datum-Objekt
 * @returns {string} Formatierter Datum-String
 */
function formatMatchDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(
        yesterday.getFullYear(),
        yesterday.getMonth(),
        yesterday.getDate()
    );

    if (dateOnly.getTime() === todayOnly.getTime()) {
        return 'Heute';
    } else if (dateOnly.getTime() === yesterdayOnly.getTime()) {
        return 'Gestern';
    } else {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}.${month}.${year}`;
    }
}
