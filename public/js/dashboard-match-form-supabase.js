// Dashboard Match-Formular-Modul (Supabase-Version)
// Aus dashboard-supabase.js extrahiert für bessere Wartbarkeit
// Verwaltet Match-Request-Formular, Gegnersuche und Match-Übermittlung

import { getSupabase } from './supabase-init.js';
import { initializeDoublesPlayerUI, initializeDoublesPlayerSearch } from './doubles-player-ui-supabase.js';
import { createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

let setScoreHandler = null;
let selectedOpponent = null;
let currentUser = null;
let currentUserData = null;
let currentSportContext = null;
let testClubIdsCache = null;
let currentHandicapDetails = null; // Speichert aktuelle Handicap-Vorschläge für spätere Verwendung
let pendingTournamentMatches = []; // Pending tournament matches between current user and selected opponent

/**
 * Modul mit Benutzerdaten initialisieren
 */
export function initMatchFormModule(user, userData, sportContext) {
    currentUser = user;
    currentUserData = userData;
    currentSportContext = sportContext;
}

/**
 * Set-Score-Handler abrufen (für externen Zugriff)
 */
export function getSetScoreHandler() {
    return setScoreHandler;
}

/**
 * Gewählten Gegner abrufen (für externen Zugriff)
 */
export function getSelectedOpponent() {
    return selectedOpponent;
}

/**
 * Test-Verein-IDs laden (mit Caching)
 */
async function loadTestClubIds() {
    if (testClubIdsCache !== null) return testClubIdsCache;

    try {
        const { data: clubs } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        testClubIdsCache = (clubs || [])
            .filter(c => c.is_test_club === true)
            .map(c => c.id);
    } catch (error) {
        console.error('Error loading test club IDs:', error);
        testClubIdsCache = [];
    }

    return testClubIdsCache;
}

/**
 * Benachrichtigung für einen Benutzer erstellen
 */
async function createNotification(userId, type, title, message, data = {}) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                title: title,
                message: message,
                data: data,
                is_read: false
            });

        if (error) {
            console.error('[MatchForm] Error creating notification:', error);
        }
    } catch (error) {
        console.error('[MatchForm] Error creating notification:', error);
    }
}

/**
 * Match-Request-Formular einrichten
 */
export function setupMatchForm(callbacks = {}) {
    const form = document.getElementById('match-request-form');
    const opponentSearchInput = document.getElementById('opponent-search-input');
    const opponentSearchResults = document.getElementById('opponent-search-results');
    const matchModeSelect = document.getElementById('match-mode-select');
    const setScoreContainer = document.getElementById('set-score-container');
    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');
    const goldenPointCheckbox = document.getElementById('golden-point-checkbox');
    const matchTieBreakCheckbox = document.getElementById('match-tiebreak-checkbox');
    const tennisOptionsContainer = document.getElementById('tennis-options-container');

    if (!form) return;

    const sportName = currentSportContext?.sportName;
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';

    console.log('[SetupMatchForm] Sport:', sportName, 'isTennis:', isTennisOrPadel, 'isBadminton:', isBadminton);

    const modeInfoTexts = {
        'best-of-3-tennis': {
            title: 'Best of 3 (Standard)',
            desc: 'Wer zuerst 2 Sätze gewinnt. Ein Satz geht bis 6 Spiele mit 2 Spielen Vorsprung. Bei 6:6 wird ein Tie-Break gespielt (7:6).',
            example: 'z.B. 6:4, 3:6, 7:5'
        },
        'best-of-5-tennis': {
            title: 'Best of 5 (Grand Slam)',
            desc: 'Wer zuerst 3 Sätze gewinnt. Ein Satz geht bis 6 Spiele mit 2 Spielen Vorsprung. Bei 6:6 wird ein Tie-Break gespielt.',
            example: 'z.B. 6:4, 3:6, 7:6, 6:3'
        },
        'pro-set': {
            title: 'Einzelsatz (Pro Set)',
            desc: 'Nur ein langer Satz. Wer zuerst 9 (oder 10) Spiele erreicht, gewinnt. Es müssen 2 Spiele Vorsprung sein.',
            example: 'z.B. 9:7 oder 10:8'
        },
        'timed': {
            title: 'Zeit / Fortlaufend',
            desc: 'Ideal für Trainingsmatches mit fester Zeit. Es werden einfach die gewonnenen Spiele gezählt, ohne Satz-Logik.',
            example: 'z.B. 14:11 nach 60 Minuten'
        },
        'fast4': {
            title: 'Fast4 (Schnellformat)',
            desc: 'Verkürzte Sätze bis 4 Spiele. Bei 3:3 gibt es einen Tie-Break. Best of 3 Sätze.',
            example: 'z.B. 4:2, 3:4, 4:1'
        },
        'best-of-3-tt': {
            title: 'Best of 3',
            desc: 'Wer zuerst 2 Sätze gewinnt. Ein Satz geht bis 11 Punkte mit 2 Punkten Vorsprung.',
            example: 'z.B. 11:9, 8:11, 11:7'
        },
        'best-of-5': {
            title: 'Best of 5 (Standard)',
            desc: 'Wer zuerst 3 Sätze gewinnt. Ein Satz geht bis 11 Punkte mit 2 Punkten Vorsprung.',
            example: 'z.B. 11:9, 11:7, 9:11, 11:5'
        },
        'best-of-7': {
            title: 'Best of 7',
            desc: 'Wer zuerst 4 Sätze gewinnt. Wird oft bei wichtigen Turnieren gespielt.',
            example: 'z.B. 11:9, 11:7, 9:11, 11:5, 11:8'
        },
        'single-set': {
            title: '1 Satz',
            desc: 'Nur ein einzelner Satz. Schnelles Format für Training oder Zeitdruck.',
            example: 'z.B. 11:8'
        },
        'best-of-3-badminton': {
            title: 'Best of 3 (Standard)',
            desc: 'Wer zuerst 2 Sätze gewinnt. Ein Satz geht bis 21 Punkte mit 2 Punkten Vorsprung (max. 30).',
            example: 'z.B. 21:18, 19:21, 21:15'
        }
    };

    function getModeInfoKey(mode) {
        if (isTennisOrPadel) {
            if (mode === 'best-of-3') return 'best-of-3-tennis';
            if (mode === 'best-of-5') return 'best-of-5-tennis';
            return mode;
        } else if (isBadminton) {
            if (mode === 'best-of-3') return 'best-of-3-badminton';
            return mode;
        } else {
            if (mode === 'best-of-3') return 'best-of-3-tt';
            return mode;
        }
    }

    let modeInfoContainer = document.getElementById('match-mode-info');
    if (!modeInfoContainer && matchModeSelect) {
        modeInfoContainer = document.createElement('div');
        modeInfoContainer.id = 'match-mode-info';
        modeInfoContainer.className = 'mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';
        matchModeSelect.parentNode.appendChild(modeInfoContainer);
    }

    function updateModeInfo(mode) {
        if (!modeInfoContainer) return;
        const key = getModeInfoKey(mode);
        const info = modeInfoTexts[key];
        if (info) {
            modeInfoContainer.innerHTML = `
                <div class="flex items-start gap-2">
                    <i class="fas fa-info-circle text-indigo-500 mt-0.5"></i>
                    <div>
                        <div class="font-medium text-gray-700">${info.title}</div>
                        <div class="text-gray-600 mt-1">${info.desc}</div>
                        <div class="text-gray-500 mt-1 italic">${info.example}</div>
                    </div>
                </div>
            `;
        }
    }

    if (matchModeSelect) {
        if (isTennisOrPadel) {
            matchModeSelect.innerHTML = `
                <option value="best-of-3" selected>Best of 3 (Standard)</option>
                <option value="best-of-5">Best of 5 (Grand Slam)</option>
                <option value="pro-set">Pro-Set (bis 9/10)</option>
                <option value="timed">Zeit / Fortlaufend</option>
                <option value="fast4">Fast4 (Sätze bis 4)</option>
            `;
        } else if (isBadminton) {
            matchModeSelect.innerHTML = `
                <option value="best-of-3" selected>Best of 3 (Standard)</option>
                <option value="single-set">1 Satz</option>
            `;
        } else {
            matchModeSelect.innerHTML = `
                <option value="best-of-3">Best of 3</option>
                <option value="best-of-5" selected>Best of 5 (Standard)</option>
                <option value="best-of-7">Best of 7</option>
                <option value="single-set">1 Satz</option>
            `;
        }
        updateModeInfo(matchModeSelect.value);
    }

    if (tennisOptionsContainer) {
        if (isTennisOrPadel) {
            tennisOptionsContainer.classList.remove('hidden');
        } else {
            tennisOptionsContainer.classList.add('hidden');
        }
    }

    function updateWinnerDisplay() {
        const matchWinnerInfo = document.getElementById('match-winner-info');
        const matchWinnerText = document.getElementById('match-winner-text');

        if (!setScoreHandler || !matchWinnerInfo || !matchWinnerText) return;
        if (typeof setScoreHandler.getMatchWinner !== 'function') return;

        const winnerData = setScoreHandler.getMatchWinner();

        if (winnerData && winnerData.winner) {
            const doublesToggle = document.getElementById('player-doubles-toggle');
            const doublesContainer = document.getElementById('doubles-players-container');
            const partnerInput = document.getElementById('partner-search-input');

            const isDoublesMode = (doublesToggle && doublesToggle.classList.contains('active')) ||
                                  (doublesContainer && !doublesContainer.classList.contains('hidden')) ||
                                  (partnerInput && partnerInput.value.trim());

            let winnerName;
            if (isDoublesMode) {
                const opponent1Input = document.getElementById('opponent1-search-input');
                const opponent2Input = document.getElementById('opponent2-search-input');

                const myName = currentUserData?.first_name || 'Du';
                const partnerName = partnerInput?.value?.split(' ')[0] || 'Partner';
                const opp1Name = opponent1Input?.value?.split(' ')[0] || 'Gegner 1';
                const opp2Name = opponent2Input?.value?.split(' ')[0] || 'Gegner 2';

                if (winnerData.winner === 'A') {
                    winnerName = `${myName} & ${partnerName}`;
                } else {
                    winnerName = `${opp1Name} & ${opp2Name}`;
                }
            } else {
                if (winnerData.winner === 'A') {
                    winnerName = currentUserData?.first_name || 'Du';
                } else {
                    winnerName = selectedOpponent?.name || 'Gegner';
                }
            }

            // Gewinner-Anzeige wird nur von winnerPreview verwaltet
            matchWinnerInfo.classList.add('hidden');
        } else {
            matchWinnerInfo.classList.add('hidden');
        }
    }

    function createScoreInputForSport(mode) {
        if (!setScoreContainer) return null;

        let handler;
        if (isTennisOrPadel) {
            const options = {
                mode: mode || 'best-of-3',
                goldenPoint: goldenPointCheckbox?.checked || false,
                matchTieBreak: matchTieBreakCheckbox?.checked || false
            };
            handler = createTennisScoreInput(setScoreContainer, [], options);
        } else if (isBadminton) {
            handler = createBadmintonScoreInput(setScoreContainer, [], 'best-of-3');
        } else {
            handler = createSetScoreInput(setScoreContainer, [], mode || 'best-of-5');
        }

        if (setScoreContainer) {
            setScoreContainer.addEventListener('input', updateWinnerDisplay);
        }

        setTimeout(updateWinnerDisplay, 100);

        return handler;
    }

    setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
    window.playerSetScoreInput = setScoreHandler;

    matchModeSelect?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect.value);
        window.playerSetScoreInput = setScoreHandler;
        updateModeInfo(matchModeSelect.value);
    });

    goldenPointCheckbox?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
        window.playerSetScoreInput = setScoreHandler;
    });

    matchTieBreakCheckbox?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
        window.playerSetScoreInput = setScoreHandler;
    });

    singlesToggle?.addEventListener('click', () => {
        singlesToggle.classList.add('active');
        doublesToggle?.classList.remove('active');
        document.getElementById('singles-opponent-container')?.classList.remove('hidden');
        document.getElementById('doubles-players-container')?.classList.add('hidden');
    });

    doublesToggle?.addEventListener('click', () => {
        doublesToggle.classList.add('active');
        singlesToggle?.classList.remove('active');
        document.getElementById('singles-opponent-container')?.classList.add('hidden');
        document.getElementById('doubles-players-container')?.classList.remove('hidden');
    });

    let searchTimeout = null;
    opponentSearchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();

        if (query.length < 2) {
            opponentSearchResults.innerHTML = '';
            return;
        }

        searchTimeout = setTimeout(() => searchOpponents(query, opponentSearchResults), 300);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const doublesToggle = document.getElementById('player-doubles-toggle');
        const isDoublesMode = doublesToggle && doublesToggle.classList.contains('active');

        if (isDoublesMode) {
            const { handleDoublesPlayerMatchRequest } = await import('./doubles-player-ui-supabase.js');
            await handleDoublesPlayerMatchRequest(e, supabase, currentUserData);
        } else {
            await submitMatchRequest(callbacks);
        }
    });

    initializeDoublesPlayerUI();
    initializeDoublesPlayerSearch(supabase, currentUserData);
}

/**
 * Gegner suchen
 */
async function searchOpponents(query, resultsContainer) {
    try {
        const testClubIds = await loadTestClubIds();
        const isCurrentUserInTestClub = currentUserData.club_id && testClubIds.includes(currentUserData.club_id);
        const userSportId = currentUserData.active_sport_id;

        let playersQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, elo_rating, club_id, privacy_settings, grundlagen_completed, is_match_ready, active_sport_id, is_offline, clubs(name)')
            .neq('id', currentUser.id)
            .in('role', ['player', 'coach', 'head_coach'])
            .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`);

        if (userSportId) {
            playersQuery = playersQuery.eq('active_sport_id', userSportId);
        }

        const { data: players, error } = await playersQuery.limit(50);

        if (error) throw error;

        const filteredPlayers = (players || []).filter(player => {
            if (player.role === 'admin') return false;
            if (player.is_match_ready !== true) return false;

            // Einzelspieler: Offline-Spieler ausschließen (können nur Doppel spielen)
            if (player.is_offline === true) return false;

            if (player.club_id && testClubIds.includes(player.club_id)) {
                if (!isCurrentUserInTestClub || currentUserData.club_id !== player.club_id) {
                    return false;
                }
            }

            const userHasNoClub = !currentUserData.club_id;
            const playerHasNoClub = !player.club_id;

            if (userHasNoClub && playerHasNoClub) return true;

            const searchable = player.privacy_settings?.searchable || 'global';

            if (currentUserData.club_id && player.club_id === currentUserData.club_id) {
                return true;
            }

            if (searchable === 'global') return true;

            return false;
        }).slice(0, 10);

        if (filteredPlayers.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden</p>';
            return;
        }

        resultsContainer.innerHTML = filteredPlayers.map(player => {
            const isSameClub = player.club_id && player.club_id === currentUserData.club_id;
            const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unbekannt';
            const clubName = player.clubs?.name || null;
            const hasNoClub = !player.club_id;

            let clubBadge = '';
            if (!isSameClub && player.club_id && clubName) {
                clubBadge = `<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">${clubName}</span>`;
            } else if (!isSameClub && player.club_id) {
                clubBadge = '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded mr-2">Anderer Verein</span>';
            } else if (hasNoClub) {
                clubBadge = '<span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mr-2">Kein Verein</span>';
            }

            return `
            <div class="opponent-option flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer rounded-lg border border-gray-200 mb-2"
                 data-id="${player.id}"
                 data-name="${playerName}"
                 data-elo="${player.elo_rating || 800}">
                <img src="${player.avatar_url || DEFAULT_AVATAR}"
                     class="w-10 h-10 rounded-full object-cover"
                     onerror="this.src='${DEFAULT_AVATAR}'">
                <div class="flex-1">
                    <p class="font-medium">${playerName}</p>
                    <p class="text-xs text-gray-500">Elo: ${player.elo_rating || 800}</p>
                </div>
                ${clubBadge}
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        `;
        }).join('');

        resultsContainer.querySelectorAll('.opponent-option').forEach(option => {
            option.addEventListener('click', () => selectOpponent(option));
        });

    } catch (error) {
        console.error('Error searching opponents:', error);
        resultsContainer.innerHTML = '<p class="text-red-500 text-sm p-2">Fehler bei der Suche</p>';
    }
}

/**
 * Gegner aus Suchergebnissen auswählen
 */
function selectOpponent(optionElement) {
    const id = optionElement.dataset.id;
    const name = optionElement.dataset.name;
    const elo = optionElement.dataset.elo;

    selectedOpponent = { id, name, elo: parseInt(elo) };

    document.getElementById('selected-opponent-id').value = id;
    document.getElementById('selected-opponent-elo').value = elo;
    document.getElementById('opponent-search-input').value = name;
    document.getElementById('opponent-search-results').innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
            <i class="fas fa-check-circle text-green-500"></i>
            <span class="font-medium text-green-800">${name}</span>
            <span class="text-sm text-green-600">(Elo: ${elo})</span>
            <button type="button" onclick="clearOpponentSelection()" class="ml-auto text-gray-500 hover:text-red-500">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    checkHandicap();
    checkTournamentMatches();
}

/**
 * Gegnerwahl aufheben
 */
export function clearOpponentSelection() {
    selectedOpponent = null;
    currentHandicapDetails = null;
    pendingTournamentMatches = [];
    document.getElementById('selected-opponent-id').value = '';
    document.getElementById('selected-opponent-elo').value = '';
    document.getElementById('opponent-search-input').value = '';
    document.getElementById('opponent-search-results').innerHTML = '';
    document.getElementById('match-handicap-info')?.classList.add('hidden');
    document.getElementById('tournament-match-info')?.classList.add('hidden');
}

// Für onclick-Handler im globalen Scope verfügbar machen
window.clearOpponentSelection = clearOpponentSelection;

/**
 * Handicap-Vorschläge prüfen
 */
async function checkHandicap() {
    const handicapInfo = document.getElementById('match-handicap-info');
    const handicapText = document.getElementById('match-handicap-text');

    if (!handicapInfo || !selectedOpponent) return;

    const myElo = currentUserData.elo_rating || 800;
    const opponentElo = selectedOpponent.elo;
    const diff = Math.abs(myElo - opponentElo);
    const iAmStronger = myElo > opponentElo;

    const sportName = currentSportContext?.sportName?.toLowerCase();
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';
    const unitText = isTennisOrPadel ? 'Games' : 'Punkten';

    const threshold = isTennisOrPadel ? 150 : 40;

    let handicapSuggestions = [];

    if (diff >= threshold) {
        const stronger = iAmStronger ? 'Du bist' : `${selectedOpponent.name} ist`;
        const weaker = iAmStronger ? selectedOpponent.name : 'Du';

        let handicapValue;
        if (isTennisOrPadel) {
            handicapValue = Math.min(Math.floor(diff / 150), 3);
        } else if (isBadminton) {
            handicapValue = Math.min(Math.floor(diff / 40), 12);
        } else {
            handicapValue = Math.min(Math.floor(diff / 40), 7);
        }

        if (handicapValue > 0) {
            handicapSuggestions.push({
                type: 'elo',
                value: handicapValue,
                text: `${stronger} ${diff} Elo stärker → ${weaker} startet mit +${handicapValue} ${unitText}`
            });
        }
    }

    let h2hStreakWinnerId = null;
    try {
        const { data: h2hData, error } = await supabase
            .rpc('get_h2h_handicap', {
                p1_id: currentUser.id,
                p2_id: selectedOpponent.id
            });

        if (!error && h2hData && h2hData.length > 0) {
            const h2h = h2hData[0];

            if (h2h.suggested_handicap > 0 && h2h.streak_winner_id) {
                h2hStreakWinnerId = h2h.streak_winner_id;

                if (h2h.streak_winner_id === selectedOpponent.id) {
                    handicapSuggestions.push({
                        type: 'h2h',
                        value: h2h.suggested_handicap,
                        text: `H2H-Vorteil: ${selectedOpponent.name} gewinnt öfter. Du startest mit +${h2h.suggested_handicap} ${unitText}`
                    });
                } else if (h2h.streak_winner_id === currentUser.id) {
                    handicapSuggestions.push({
                        type: 'h2h',
                        value: h2h.suggested_handicap,
                        text: `H2H-Vorteil: Du gewinnst öfter. ${selectedOpponent.name} startet mit +${h2h.suggested_handicap} ${unitText}`
                    });
                }
            }
        }
    } catch (e) {
        console.log('[Handicap] H2H check failed:', e);
    }

    if (handicapSuggestions.length > 0) {
        const h2hSuggestion = handicapSuggestions.find(s => s.type === 'h2h');
        const eloSuggestion = handicapSuggestions.find(s => s.type === 'elo');

        let displayText = '';
        let selectedSuggestion = null;

        if (h2hSuggestion) {
            displayText = h2hSuggestion.text;
            selectedSuggestion = h2hSuggestion;
        } else if (eloSuggestion) {
            displayText = eloSuggestion.text;
            selectedSuggestion = eloSuggestion;
        }

        // Handicap-Details für spätere Verwendung beim Speichern des Matches speichern
        if (selectedSuggestion) {
            let handicapPlayerId, handicapPlayerName;

            if (selectedSuggestion.type === 'h2h' && h2hStreakWinnerId) {
                // H2H: Der Spieler, der die Serie VERLOREN hat, bekommt das Handicap
                if (h2hStreakWinnerId === selectedOpponent.id) {
                    handicapPlayerId = currentUser.id;
                    handicapPlayerName = `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim();
                } else {
                    handicapPlayerId = selectedOpponent.id;
                    handicapPlayerName = selectedOpponent.name;
                }
            } else {
                // Elo-basiert: Schwächerer Spieler (niedrigere Elo) bekommt Handicap
                const myElo = currentUserData.elo_rating || 800;
                const opponentElo = selectedOpponent.elo;
                const iAmStronger = myElo > opponentElo;
                handicapPlayerId = iAmStronger ? selectedOpponent.id : currentUser.id;
                handicapPlayerName = iAmStronger ? selectedOpponent.name :
                    `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim();
            }

            currentHandicapDetails = {
                player_id: handicapPlayerId,
                player_name: handicapPlayerName,
                points: selectedSuggestion.value,
                type: selectedSuggestion.type,
                elo_diff: diff
            };
        }

        handicapText.innerHTML = displayText.replace(/\n/g, '<br>');
        handicapInfo.classList.remove('hidden');
    } else {
        currentHandicapDetails = null;
        handicapInfo.classList.add('hidden');
    }
}

/**
 * Prüfen ob es offene Turnierspiele zwischen den beiden Spielern gibt
 */
async function checkTournamentMatches() {
    const tournamentInfo = document.getElementById('tournament-match-info');
    const tournamentOptions = document.getElementById('tournament-match-options');
    if (!tournamentInfo || !tournamentOptions || !selectedOpponent) {
        if (tournamentInfo) tournamentInfo.classList.add('hidden');
        pendingTournamentMatches = [];
        return;
    }

    try {
        // Find pending tournament matches between current user and selected opponent
        const { data: matches, error } = await supabase
            .from('tournament_matches')
            .select(`
                id, round_number, status, player_a_id, player_b_id,
                tournament:tournaments(id, name, status)
            `)
            .in('status', ['pending', 'in_progress'])
            .or(`and(player_a_id.eq.${currentUser.id},player_b_id.eq.${selectedOpponent.id}),and(player_a_id.eq.${selectedOpponent.id},player_b_id.eq.${currentUser.id})`);

        if (error) throw error;

        // Filter to only active tournaments
        const activeMatches = (matches || []).filter(m =>
            m.tournament?.status === 'in_progress'
        );

        pendingTournamentMatches = activeMatches;

        if (activeMatches.length > 0) {
            tournamentOptions.innerHTML = activeMatches.map((m, idx) => {
                const tournamentName = escapeHtml(m.tournament?.name || 'Turnier');
                return `
                    <div class="flex items-center gap-2">
                        <input type="checkbox" id="tournament-match-${idx}"
                            class="tournament-match-checkbox h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            data-tournament-match-id="${m.id}"
                            ${activeMatches.length === 1 ? 'checked' : ''}
                        />
                        <label for="tournament-match-${idx}" class="text-sm text-indigo-700">
                            Für <strong>${tournamentName}</strong> (Runde ${m.round_number}) werten
                        </label>
                    </div>
                `;
            }).join('');

            // Only allow one checkbox to be selected at a time
            tournamentOptions.querySelectorAll('.tournament-match-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        tournamentOptions.querySelectorAll('.tournament-match-checkbox').forEach(other => {
                            if (other !== e.target) other.checked = false;
                        });
                    }
                });
            });

            tournamentInfo.classList.remove('hidden');
        } else {
            tournamentInfo.classList.add('hidden');
        }
    } catch (err) {
        console.error('[MatchForm] Error checking tournament matches:', err);
        pendingTournamentMatches = [];
        tournamentInfo.classList.add('hidden');
    }
}

/**
 * Gewählte Turnier-Match-ID abrufen (falls angekreuzt)
 */
function getSelectedTournamentMatchId() {
    const checked = document.querySelector('.tournament-match-checkbox:checked');
    return checked ? checked.dataset.tournamentMatchId : null;
}

/**
 * Match-Anfrage absenden
 */
async function submitMatchRequest(callbacks = {}) {
    const feedbackEl = document.getElementById('match-request-feedback');

    if (!selectedOpponent) {
        showFeedback(feedbackEl, 'Bitte wähle einen Gegner aus.', 'error');
        return;
    }

    if (!setScoreHandler) {
        showFeedback(feedbackEl, 'Satzergebnis-Handler nicht initialisiert.', 'error');
        return;
    }

    const validation = setScoreHandler.validate();
    if (!validation.valid) {
        showFeedback(feedbackEl, validation.error, 'error');
        return;
    }

    const sets = setScoreHandler.getSets();
    const matchMode = document.getElementById('match-mode-select')?.value || 'best-of-5';
    const handicapUsed = document.getElementById('match-handicap-toggle')?.checked || false;

    const winnerId = validation.winnerId === 'A' ? currentUser.id : selectedOpponent.id;
    const loserId = validation.winnerId === 'A' ? selectedOpponent.id : currentUser.id;

    const sportId = currentSportContext?.sportId || currentUserData.active_sport_id || null;
    const myClubId = currentSportContext?.clubId || currentUserData.club_id || null;
    const opponentClubId = selectedOpponent.clubId || selectedOpponent.club_id || null;

    const isCrossClub = myClubId !== opponentClubId && myClubId && opponentClubId;
    const tournamentMatchId = getSelectedTournamentMatchId();

    try {
        const handicapData = handicapUsed && currentHandicapDetails ? {
            player_id: currentHandicapDetails.player_id,
            player_name: currentHandicapDetails.player_name,
            points: currentHandicapDetails.points
        } : null;

        const insertData = {
            player_a_id: currentUser.id,
            player_b_id: selectedOpponent.id,
            club_id: myClubId,
            sport_id: sportId,
            sets: sets,
            match_mode: matchMode,
            handicap_used: handicapUsed,
            handicap: handicapData,
            winner_id: winnerId,
            loser_id: loserId,
            status: 'pending_player',
            is_cross_club: isCrossClub,
            approvals: {
                player_a: true,
                player_b: false,
                coach_a: null,
                coach_b: null
            },
            created_at: new Date().toISOString()
        };

        if (tournamentMatchId) {
            insertData.tournament_match_id = tournamentMatchId;
        }

        const { data: insertedRequest, error } = await supabase
            .from('match_requests')
            .insert(insertData)
            .select('id')
            .single();

        if (error) throw error;

        const playerName = `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim() || 'Ein Spieler';
        const opponentName = selectedOpponent.displayName || selectedOpponent.display_name ||
            `${selectedOpponent.firstName || selectedOpponent.first_name || ''} ${selectedOpponent.lastName || selectedOpponent.last_name || ''}`.trim() || 'du';

        const setsString = sets.map(s => `${s.playerA}:${s.playerB}`).join(', ');

        // Gewinner aus Sicht des Gegners bestimmen (validation.winnerId ist 'A' oder 'B')
        const opponentWon = validation.winnerId === 'B';
        const setScore = `${validation.playerAWins}:${validation.playerBWins}`;

        let notificationBody;
        if (opponentWon) {
            notificationBody = `${playerName} trägt ein: Du hast ${setScore} gewonnen (${setsString})`;
        } else {
            notificationBody = `${playerName} trägt ein: ${playerName} hat ${setScore} gewonnen (${setsString})`;
        }

        if (handicapUsed) {
            notificationBody += ' [Handicap]';
        }

        // Add tournament info to notification
        let notificationTitle = 'Neue Spielanfrage';
        const notificationData = {
            request_id: insertedRequest?.id,
            requester_id: currentUser.id,
            requester_name: playerName,
            winner_id: winnerId,
            loser_id: loserId,
            sets: JSON.stringify(sets),
            set_score: setScore,
            handicap_used: handicapUsed ? 'true' : 'false'
        };

        if (tournamentMatchId) {
            const selectedMatch = pendingTournamentMatches.find(m => m.id === tournamentMatchId);
            if (selectedMatch) {
                const tName = selectedMatch.tournament?.name || 'Turnier';
                notificationBody += ` [Turnier: ${tName}, Runde ${selectedMatch.round_number}]`;
                notificationTitle = 'Turnier-Spielanfrage';
                notificationData.tournament_match_id = tournamentMatchId;
                notificationData.tournament_name = tName;
                notificationData.tournament_round = selectedMatch.round_number;
            }
        }

        await createNotification(
            selectedOpponent.id,
            'match_request',
            notificationTitle,
            notificationBody,
            notificationData
        );

        showFeedback(feedbackEl, 'Anfrage erfolgreich gesendet! Warte auf Bestätigung.', 'success');

        clearOpponentSelection();
        setScoreHandler.reset();

        if (callbacks.onSuccess) {
            callbacks.onSuccess();
        }

    } catch (error) {
        console.error('Error submitting match request:', error);
        showFeedback(feedbackEl, 'Fehler beim Senden der Anfrage: ' + error.message, 'error');
    }
}

/**
 * Feedback-Nachricht anzeigen
 */
function showFeedback(element, message, type) {
    if (!element) return;

    element.className = `mt-4 p-3 rounded-lg text-sm font-medium ${
        type === 'success' ? 'bg-green-100 text-green-800' :
        type === 'error' ? 'bg-red-100 text-red-800' :
        'bg-blue-100 text-blue-800'
    }`;
    element.textContent = message;
    element.classList.remove('hidden');

    setTimeout(() => {
        element.classList.add('hidden');
    }, 5000);
}

/**
 * Satzergebnis-Eingabe erstellen (Tischtennis)
 */
export function createSetScoreInput(container, existingSets = [], mode = 'best-of-5') {
    container.innerHTML = '';

    let minSets, maxSets, setsToWin;
    switch (mode) {
        case 'single-set': minSets = 1; maxSets = 1; setsToWin = 1; break;
        case 'best-of-3': minSets = 2; maxSets = 3; setsToWin = 2; break;
        case 'best-of-5': minSets = 3; maxSets = 5; setsToWin = 3; break;
        case 'best-of-7': minSets = 4; maxSets = 7; setsToWin = 4; break;
        default: minSets = 3; maxSets = 5; setsToWin = 3;
    }

    const sets = existingSets.length > 0 ? [...existingSets] : [];
    while (sets.length < minSets) {
        sets.push({ playerA: '', playerB: '' });
    }

    function isValidSet(scoreA, scoreB) {
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;
        if (a < 11 && b < 11) return false;
        if (a === b) return false;
        if (a >= 10 && b >= 10) return Math.abs(a - b) === 2;
        return (a >= 11 && a > b) || (b >= 11 && b > a);
    }

    function getSetWinner(scoreA, scoreB) {
        if (!isValidSet(scoreA, scoreB)) return null;
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;
        if (a > b) return 'A';
        if (b > a) return 'B';
        return null;
    }

    function renderSets() {
        container.innerHTML = '';
        sets.forEach((set, index) => {
            const setDiv = document.createElement('div');
            setDiv.className = 'flex items-center gap-3 mb-3';
            setDiv.innerHTML = `
                <label class="text-sm font-medium text-gray-700 w-16">Satz ${index + 1}:</label>
                <input type="number" min="0" max="99"
                       class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                       data-set="${index}" data-player="A" placeholder="0" value="${set.playerA}"/>
                <span class="text-gray-500">:</span>
                <input type="number" min="0" max="99"
                       class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                       data-set="${index}" data-player="B" placeholder="0" value="${set.playerB}"/>
            `;
            container.appendChild(setDiv);
        });

        let winnerPreview = container.querySelector('.winner-preview');
        if (!winnerPreview) {
            winnerPreview = document.createElement('div');
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold hidden';
            container.appendChild(winnerPreview);
        }

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', handleSetInput);
        });

        updateWinnerPreview();
    }

    function updateWinnerPreview() {
        const winnerPreview = container.querySelector('.winner-preview');
        if (!winnerPreview) return;

        let playerAWins = 0, playerBWins = 0;
        sets.forEach(set => {
            const a = parseInt(set.playerA) || 0;
            const b = parseInt(set.playerB) || 0;
            if (a > b && a >= 11 && (a >= 11 && b < 10 || Math.abs(a - b) >= 2)) playerAWins++;
            if (b > a && b >= 11 && (b >= 11 && a < 10 || Math.abs(a - b) >= 2)) playerBWins++;
        });

        const doublesToggle = document.getElementById('player-doubles-toggle');
        const doublesContainer = document.getElementById('doubles-players-container');
        const partnerInput = document.getElementById('partner-search-input');
        const isDoublesMode = (doublesToggle && doublesToggle.classList.contains('active')) ||
                              (doublesContainer && !doublesContainer.classList.contains('hidden')) ||
                              (partnerInput && partnerInput.value.trim());

        let teamAName, teamBName;
        if (isDoublesMode) {
            const opponent1Input = document.getElementById('opponent1-search-input');
            const opponent2Input = document.getElementById('opponent2-search-input');

            const myFirstName = currentUserData?.first_name || 'Du';
            const partnerName = partnerInput?.value?.split(' ')[0] || 'Partner';
            const opp1Name = opponent1Input?.value?.split(' ')[0] || 'Gegner 1';
            const opp2Name = opponent2Input?.value?.split(' ')[0] || 'Gegner 2';

            teamAName = `${myFirstName} & ${partnerName}`;
            teamBName = `${opp1Name} & ${opp2Name}`;
        } else {
            teamAName = `${currentUserData?.first_name || ''} ${currentUserData?.last_name || ''}`.trim() || 'Du';
            teamBName = selectedOpponent?.name || 'Gegner';
        }

        if (playerAWins >= setsToWin) {
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold bg-green-100 text-green-800';
            winnerPreview.innerHTML = `Gewinner: ${escapeHtml(teamAName)} (${playerAWins}:${playerBWins})`;
            winnerPreview.classList.remove('hidden');
        } else if (playerBWins >= setsToWin) {
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold bg-blue-100 text-blue-800';
            winnerPreview.innerHTML = `Gewinner: ${escapeHtml(teamBName)} (${playerAWins}:${playerBWins})`;
            winnerPreview.classList.remove('hidden');
        } else if (playerAWins > 0 || playerBWins > 0) {
            winnerPreview.className = 'winner-preview mt-4 p-3 rounded-lg text-center font-semibold bg-gray-100 text-gray-700';
            winnerPreview.innerHTML = `Zwischenstand: ${playerAWins}:${playerBWins}`;
            winnerPreview.classList.remove('hidden');
        } else {
            winnerPreview.classList.add('hidden');
        }
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        const value = e.target.value.trim();
        sets[setIndex][`player${player}`] = value === '' ? '' : parseInt(value);

        let playerAWins = 0, playerBWins = 0;
        sets.forEach(set => {
            const a = parseInt(set.playerA) || 0;
            const b = parseInt(set.playerB) || 0;
            if (a > b && a >= 11) playerAWins++;
            if (b > a && b >= 11) playerBWins++;
        });

        const matchWon = playerAWins >= setsToWin || playerBWins >= setsToWin;
        if (!matchWon && sets.length < maxSets) {
            const lastSet = sets[sets.length - 1];
            if (lastSet.playerA !== '' && lastSet.playerB !== '') {
                sets.push({ playerA: '', playerB: '' });
                renderSets();
                return;
            }
        }

        updateWinnerPreview();
    }

    function getSets() {
        return sets.filter(set => set.playerA !== '' && set.playerB !== '').map(set => ({
            playerA: parseInt(set.playerA),
            playerB: parseInt(set.playerB)
        }));
    }

    function validate() {
        const filledSets = getSets();
        if (filledSets.length < minSets) {
            return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
        }

        for (let i = 0; i < filledSets.length; i++) {
            const set = filledSets[i];
            if (!isValidSet(set.playerA, set.playerB)) {
                return { valid: false, error: `Satz ${i + 1}: Ungültiges Ergebnis. Ein Spieler braucht 11+ Punkte und 2 Punkte Vorsprung bei 10:10+.` };
            }
        }

        let playerAWins = 0, playerBWins = 0;
        filledSets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins < setsToWin && playerBWins < setsToWin) {
            return { valid: false, error: `Ein Spieler muss ${setsToWin} Sätze gewinnen.` };
        }

        // Verhindert mehr als setsToWin Sätze (Match sollte enden, sobald jemand gewinnt)
        if (playerAWins > setsToWin || playerBWins > setsToWin) {
            return { valid: false, error: `Ungültiges Ergebnis: Bei diesem Modus kann niemand mehr als ${setsToWin} Sätze gewinnen.` };
        }

        return { valid: true, winnerId: playerAWins >= setsToWin ? 'A' : 'B', playerAWins, playerBWins };
    }

    function reset() {
        sets.length = 0;
        for (let i = 0; i < minSets; i++) sets.push({ playerA: '', playerB: '' });
        renderSets();
    }

    function getMatchWinner() {
        const filledSets = getSets();
        let playerAWins = 0, playerBWins = 0;
        filledSets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins >= setsToWin) {
            return { winner: 'A', setsA: playerAWins, setsB: playerBWins };
        } else if (playerBWins >= setsToWin) {
            return { winner: 'B', setsA: playerAWins, setsB: playerBWins };
        }
        return null;
    }

    renderSets();
    return { getSets, validate, reset, refresh: renderSets, getMatchWinner };
}
