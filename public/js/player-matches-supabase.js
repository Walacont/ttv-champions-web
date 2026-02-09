import { getSupabase } from './supabase-init.js';
import { getSportContext } from './sport-context-supabase.js';

const supabase = getSupabase();

const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4=';

let setScoreHandler = null;
let selectedOpponent = null;

export async function setupMatchForm(currentUser, currentUserData, callbacks = {}) {
    const form = document.getElementById('match-request-form');
    const opponentSearchInput = document.getElementById('opponent-search-input');
    const opponentSearchResults = document.getElementById('opponent-search-results');
    const matchModeSelect = document.getElementById('match-mode-select');
    const setScoreContainer = document.getElementById('set-score-container');
    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');
    const goldenPointCheckbox = document.getElementById('golden-point-checkbox');
    const matchTieBreakCheckbox = document.getElementById('match-tiebreak-checkbox');

    if (!form) return;

    const sportContext = await getSportContext(currentUser.id);
    const sportName = sportContext?.sportName;
    const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
    const isBadminton = sportName === 'badminton';

    const tennisOptionsContainer = document.getElementById('tennis-options-container');
    if (tennisOptionsContainer) {
        if (isTennisOrPadel) {
            tennisOptionsContainer.classList.remove('hidden');
        } else {
            tennisOptionsContainer.classList.add('hidden');
        }
    }

    if (matchModeSelect) {
        if (isTennisOrPadel || isBadminton) {
            matchModeSelect.value = 'best-of-3';
        }
    }

    function createScoreInputForSport(mode) {
        if (!setScoreContainer) return null;

        if (isTennisOrPadel) {
            const options = {
                mode: mode || 'best-of-3',
                goldenPoint: goldenPointCheckbox?.checked || false,
                matchTieBreak: matchTieBreakCheckbox?.checked || false
            };
            return createTennisScoreInput(setScoreContainer, [], options);
        } else if (isBadminton) {
            return createBadmintonScoreInput(setScoreContainer, [], 'best-of-3');
        } else {
            return createSetScoreInput(setScoreContainer, [], mode || 'best-of-5');
        }
    }

    setScoreHandler = createScoreInputForSport(matchModeSelect?.value);

    matchModeSelect?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect.value);
    });

    goldenPointCheckbox?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
    });

    matchTieBreakCheckbox?.addEventListener('change', () => {
        setScoreHandler = createScoreInputForSport(matchModeSelect?.value);
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

        searchTimeout = setTimeout(() => searchOpponents(query, opponentSearchResults, currentUser, currentUserData), 300);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitMatchRequest(currentUser, currentUserData, callbacks);
    });

    setupMatchSuggestions(currentUser, currentUserData);

    // Funktion muss global verfügbar sein für onclick-Handler im DOM
    window.clearOpponentSelection = () => clearOpponentSelection(currentUserData);
}

async function searchOpponents(query, resultsContainer, currentUser, currentUserData) {
    if (!currentUserData.club_id) {
        resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Du musst einem Verein beitreten um Wettkämpfe zu melden.</p>';
        return;
    }

    try {
        const { data: players, error } = await supabase
            .from('profiles')
            .select('id, display_name, first_name, last_name, avatar_url, elo_rating, privacy_settings, is_offline')
            .eq('club_id', currentUserData.club_id)
            .neq('id', currentUser.id)
            .or(`display_name.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
            .limit(20);

        if (error) throw error;

        if (!players || players.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden</p>';
            return;
        }

        // Offline-Spieler sind nur im Doppel erlaubt, nicht im Einzel
        const filteredPlayers = players.filter(player => {
            if (player.is_offline === true) return false;

            const privacySettings = player.privacy_settings || {};
            const searchable = privacySettings.searchable || 'global';

            // 'global' und 'club_only' sind beide sichtbar, da wir innerhalb des Vereins suchen
            return searchable === 'global' || searchable === 'club_only';
        }).slice(0, 10);

        if (filteredPlayers.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden</p>';
            return;
        }

        resultsContainer.innerHTML = filteredPlayers.map(player => `
            <div class="opponent-option flex items-center gap-3 p-3 hover:bg-indigo-50 cursor-pointer rounded-lg border border-gray-200 mb-2"
                 data-id="${player.id}"
                 data-name="${player.display_name}"
                 data-elo="${player.elo_rating || 800}">
                <img src="${player.avatar_url || DEFAULT_AVATAR}"
                     class="w-10 h-10 rounded-full object-cover"
                     onerror="this.src='${DEFAULT_AVATAR}'">
                <div class="flex-1">
                    <p class="font-medium">${player.display_name || `${player.first_name} ${player.last_name}`}</p>
                    <p class="text-xs text-gray-500">Elo: ${player.elo_rating || 800}</p>
                </div>
                <i class="fas fa-chevron-right text-gray-400"></i>
            </div>
        `).join('');

        resultsContainer.querySelectorAll('.opponent-option').forEach(option => {
            option.addEventListener('click', () => selectOpponent(option, currentUserData));
        });

    } catch (error) {
        console.error('Error searching opponents:', error);
        resultsContainer.innerHTML = '<p class="text-red-500 text-sm p-2">Fehler bei der Suche</p>';
    }
}

function selectOpponent(optionElement, currentUserData) {
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

    checkHandicap(currentUserData);
}

function clearOpponentSelection(currentUserData) {
    selectedOpponent = null;
    const opponentIdEl = document.getElementById('selected-opponent-id');
    const opponentEloEl = document.getElementById('selected-opponent-elo');
    const searchInput = document.getElementById('opponent-search-input');
    const resultsEl = document.getElementById('opponent-search-results');
    const handicapInfo = document.getElementById('match-handicap-info');

    if (opponentIdEl) opponentIdEl.value = '';
    if (opponentEloEl) opponentEloEl.value = '';
    if (searchInput) searchInput.value = '';
    if (resultsEl) resultsEl.innerHTML = '';
    if (handicapInfo) handicapInfo.classList.add('hidden');
}

function checkHandicap(currentUserData) {
    const handicapInfo = document.getElementById('match-handicap-info');
    const handicapText = document.getElementById('match-handicap-text');

    if (!handicapInfo || !selectedOpponent) return;

    const myElo = currentUserData.elo_rating || 800;
    const opponentElo = selectedOpponent.elo;
    const diff = Math.abs(myElo - opponentElo);

    if (diff >= 100) {
        const stronger = myElo > opponentElo ? 'Du bist' : `${selectedOpponent.name} ist`;
        const weaker = myElo > opponentElo ? selectedOpponent.name : 'Du';
        const handicapPoints = Math.min(Math.floor(diff / 50), 5);

        handicapText.textContent = `${stronger} ${diff} Elo-Punkte stärker. Empfohlener Handicap: ${weaker} startet jeden Satz mit ${handicapPoints} Punkten.`;
        handicapInfo.classList.remove('hidden');
    } else {
        handicapInfo.classList.add('hidden');
    }
}

async function submitMatchRequest(currentUser, currentUserData, callbacks = {}) {
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

    try {
        const sportContext = await getSportContext(currentUser.id);
        const sportId = sportContext?.sportId || null;
        const myClubId = sportContext?.clubId || currentUserData.club_id;

        let opponentClubId = selectedOpponent.clubId || null;
        if (selectedOpponent.id && !opponentClubId) {
            const { data: opponentProfile } = await supabase
                .from('profiles')
                .select('club_id')
                .eq('id', selectedOpponent.id)
                .single();

            if (opponentProfile) {
                opponentClubId = opponentProfile.club_id;
            }
        }

        const isCrossClub = myClubId !== opponentClubId && myClubId && opponentClubId;

        // Verein des Anfragenden verwenden, falls vorhanden
        const matchClubId = myClubId || opponentClubId || null;

        const { error } = await supabase
            .from('match_requests')
            .insert({
                player_a_id: currentUser.id,
                player_b_id: selectedOpponent.id,
                club_id: matchClubId,
                sport_id: sportId,
                sets: sets,
                match_mode: matchMode,
                handicap_used: handicapUsed,
                winner_id: winnerId,
                loser_id: loserId,
                status: 'pending_player',
                is_cross_club: isCrossClub,
                approvals: JSON.stringify({
                    player_a: true,  // Anfragender bestätigt automatisch
                    player_b: false,
                    coach_a: null,
                    coach_b: null
                }),
                created_at: new Date().toISOString()
            });

        if (error) throw error;

        if (window.trackEvent) window.trackEvent('match_request_submit');

        showFeedback(feedbackEl, 'Anfrage erfolgreich gesendet! Warte auf Bestätigung.', 'success');

        clearOpponentSelection(currentUserData);
        setScoreHandler.reset();

        if (callbacks.onRequestCreated) {
            callbacks.onRequestCreated();
        }

    } catch (error) {
        console.error('Error submitting match request:', error);
        showFeedback(feedbackEl, 'Fehler beim Senden der Anfrage: ' + error.message, 'error');
    }
}

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

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', handleSetInput);
        });
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        // Erlaubt 0 als gültigen Wert (parseInt("0") || '' würde fälschlicherweise '' werden)
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
            }
        }
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

        // Match muss enden, wenn jemand die erforderliche Anzahl Sätze gewonnen hat
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

    function setHandicap(player, points) {
        sets.forEach((set, index) => {
            if (player === 'A') {
                const currentValue = parseInt(set.playerA) || 0;
                sets[index].playerA = Math.max(currentValue, points);
            } else if (player === 'B') {
                const currentValue = parseInt(set.playerB) || 0;
                sets[index].playerB = Math.max(currentValue, points);
            }
        });
        renderSets();
    }

    function clearHandicap(player) {
        sets.forEach((set, index) => {
            if (player === 'A') {
                sets[index].playerA = '';
            } else if (player === 'B') {
                sets[index].playerB = '';
            }
        });
        renderSets();
    }

    function getMatchWinner() {
        const filledSets = getSets();

        if (filledSets.length === 0) {
            return null;
        }

        let playerAWins = 0;
        let playerBWins = 0;

        filledSets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins >= setsToWin) {
            return { winner: 'A', setsA: playerAWins, setsB: playerBWins };
        }
        if (playerBWins >= setsToWin) {
            return { winner: 'B', setsA: playerAWins, setsB: playerBWins };
        }

        if (playerAWins > 0 || playerBWins > 0) {
            return { winner: null, setsA: playerAWins, setsB: playerBWins };
        }

        return null;
    }

    renderSets();
    return {
        getSets,
        validate,
        refresh: renderSets,
        reset,
        setHandicap,
        clearHandicap,
        getMatchWinner,
    };
}

export function createTennisScoreInput(container, existingSets = [], options = {}) {
    const { mode = 'best-of-3', goldenPoint = false, matchTieBreak = false } = options;

    container.innerHTML = '';

    const isTimedMode = mode === 'timed';
    const isProSetMode = mode === 'pro-set';
    const isFast4Mode = mode === 'fast4';
    const isStandardMode = !isTimedMode && !isProSetMode && !isFast4Mode;

    // Für Fast4 sind nur 4 Spiele zum Satzgewinn nötig statt 6
    const gamesForSet = isFast4Mode ? 4 : 6;
    const tieBreakAt = isFast4Mode ? 3 : 6;

    let minSets, maxSets, setsToWin;
    if (isTimedMode || isProSetMode) {
        minSets = 1; maxSets = 1; setsToWin = 1;
    } else if (isFast4Mode) {
        minSets = 2; maxSets = 3; setsToWin = 2;
    } else {
        switch (mode) {
            case 'best-of-3': minSets = 2; maxSets = 3; setsToWin = 2; break;
            case 'best-of-5': minSets = 3; maxSets = 5; setsToWin = 3; break;
            default: minSets = 2; maxSets = 3; setsToWin = 2;
        }
    }

    const sets = existingSets.length > 0 ? [...existingSets] : [];
    while (sets.length < minSets) {
        sets.push({ playerA: '', playerB: '', tiebreak: null });
    }

    function isValidSet(scoreA, scoreB, setIndex) {
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;

        if (a === 0 && b === 0) return false;

        if (isTimedMode) {
            return a !== b;
        }

        if (isProSetMode) {
            if (a < 9 && b < 9) return false;
            return Math.abs(a - b) >= 2;
        }

        if (isFast4Mode) {
            if (a === 4 && b === 3) return true;
            if (b === 4 && a === 3) return true;
            if (a >= 4 || b >= 4) {
                return Math.abs(a - b) >= 1 && (a === 4 || b === 4);
            }
            return false;
        }

        const isMatchTieBreakSet = matchTieBreak && setIndex === (maxSets - 1) && sets.length === maxSets;

        if (isMatchTieBreakSet) {
            if (a < 10 && b < 10) return false;
            if (a >= 10 || b >= 10) {
                return Math.abs(a - b) >= 2;
            }
            return false;
        }

        if (a === 7 && b === 6) return true;
        if (b === 7 && a === 6) return true;

        if (a >= 6 || b >= 6) {
            return Math.abs(a - b) >= 2;
        }

        return false;
    }

    function getSetWinner(scoreA, scoreB, setIndex) {
        if (!isValidSet(scoreA, scoreB, setIndex)) return null;
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;
        if (a > b) return 'A';
        if (b > a) return 'B';
        return null;
    }

    function renderSets() {
        container.innerHTML = '';

        if (isTimedMode) {
            const div = document.createElement('div');
            div.className = 'mb-4';
            div.innerHTML = `
                <label class="text-sm font-medium text-gray-700 block mb-2">Gewonnene Spiele:</label>
                <div class="flex items-center gap-3">
                    <input type="number" min="0" max="99"
                           class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                           data-set="0" data-player="A" placeholder="0" value="${sets[0]?.playerA || ''}"/>
                    <span class="text-gray-500">:</span>
                    <input type="number" min="0" max="99"
                           class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                           data-set="0" data-player="B" placeholder="0" value="${sets[0]?.playerB || ''}"/>
                    <span class="text-xs text-gray-500 ml-2">Spiele</span>
                </div>
                <p class="text-xs text-gray-500 mt-1">z.B. 14:11 bei Zeitspiel</p>
            `;
            container.appendChild(div);
        }
        else if (isProSetMode) {
            const div = document.createElement('div');
            div.className = 'mb-4';
            div.innerHTML = `
                <label class="text-sm font-medium text-gray-700 block mb-2">Einzelsatz (bis 9/10):</label>
                <div class="flex items-center gap-3">
                    <input type="number" min="0" max="20"
                           class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                           data-set="0" data-player="A" placeholder="0" value="${sets[0]?.playerA || ''}"/>
                    <span class="text-gray-500">:</span>
                    <input type="number" min="0" max="20"
                           class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                           data-set="0" data-player="B" placeholder="0" value="${sets[0]?.playerB || ''}"/>
                </div>
                <p class="text-xs text-gray-500 mt-1">z.B. 9:7 oder 10:8 (2 Spiele Vorsprung)</p>
            `;
            container.appendChild(div);
        }
        else {
            sets.forEach((set, index) => {
                const a = parseInt(set.playerA) || 0;
                const b = parseInt(set.playerB) || 0;

                const isTieBreakPossible = isFast4Mode
                    ? (a === 4 && b === 3) || (b === 4 && a === 3)
                    : (a === 7 && b === 6) || (b === 7 && a === 6);

                const isMatchTieBreakSet = matchTieBreak && index === (maxSets - 1);
                const setLabel = isMatchTieBreakSet ? 'Match Tie-Break' : `Satz ${index + 1}`;

                const setDiv = document.createElement('div');
                setDiv.className = 'mb-4';
                setDiv.innerHTML = `
                    <label class="text-sm font-medium text-gray-700 block mb-2">${setLabel}:</label>
                    <div class="flex items-center gap-3">
                        <input type="number" min="0" max="20"
                               class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                               data-set="${index}" data-player="A" placeholder="0" value="${set.playerA}"/>
                        <span class="text-gray-500">:</span>
                        <input type="number" min="0" max="20"
                               class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                               data-set="${index}" data-player="B" placeholder="0" value="${set.playerB}"/>
                        ${isTieBreakPossible && !isMatchTieBreakSet ? `
                            <span class="text-xs text-gray-500 ml-2">(</span>
                            <input type="number" min="0" max="99"
                                   class="tiebreak-input w-14 px-2 py-1 border border-gray-300 rounded-md text-sm text-center"
                                   data-set="${index}" placeholder="Pkt" value="${set.tiebreak || ''}"
                                   title="Tie-Break Punkte des Verlierers"/>
                            <span class="text-xs text-gray-500">)</span>
                        ` : ''}
                    </div>
                `;
                container.appendChild(setDiv);
            });
        }

        container.querySelectorAll('.set-input-a, .set-input-b').forEach(input => {
            input.addEventListener('input', handleSetInput);
        });

        container.querySelectorAll('.tiebreak-input').forEach(input => {
            input.addEventListener('input', handleTieBreakInput);
        });
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        // Erlaubt 0 als gültigen Wert (parseInt("0") || '' würde fälschlicherweise '' werden)
        const value = e.target.value.trim();
        sets[setIndex][`player${player}`] = value === '' ? '' : parseInt(value);

        if (isTimedMode || isProSetMode) {
            renderSets();
            return;
        }

        let playerAWins = 0, playerBWins = 0;
        sets.forEach((set, idx) => {
            const winner = getSetWinner(set.playerA, set.playerB, idx);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        const matchWon = playerAWins >= setsToWin || playerBWins >= setsToWin;
        if (!matchWon && sets.length < maxSets) {
            const lastSet = sets[sets.length - 1];
            if (lastSet.playerA !== '' && lastSet.playerB !== '') {
                sets.push({ playerA: '', playerB: '', tiebreak: null });
                renderSets();
            }
        } else {
            renderSets();
        }
    }

    function handleTieBreakInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        sets[setIndex].tiebreak = e.target.value;
    }

    function getSets() {
        return sets.filter(set => set.playerA !== '' && set.playerB !== '').map(set => ({
            playerA: parseInt(set.playerA),
            playerB: parseInt(set.playerB),
            tiebreak: set.tiebreak || null
        }));
    }

    function validate() {
        const filledSets = getSets();

        if (isTimedMode) {
            if (filledSets.length === 0) {
                return { valid: false, error: 'Bitte gib die Anzahl der gewonnenen Spiele ein.' };
            }
            const set = filledSets[0];
            if (set.playerA === set.playerB) {
                return { valid: false, error: 'Bei Zeitspiel muss es einen Gewinner geben (kein Unentschieden).' };
            }
            const winner = set.playerA > set.playerB ? 'A' : 'B';
            return { valid: true, winnerId: winner, playerAWins: set.playerA > set.playerB ? 1 : 0, playerBWins: set.playerB > set.playerA ? 1 : 0 };
        }

        if (isProSetMode) {
            if (filledSets.length === 0) {
                return { valid: false, error: 'Bitte gib das Ergebnis ein.' };
            }
            const set = filledSets[0];
            if (!isValidSet(set.playerA, set.playerB, 0)) {
                return { valid: false, error: 'Ungültiges Ergebnis. Einzelsatz: Erster bis 9 (oder mehr), 2 Spiele Vorsprung (z.B. 9:7, 10:8).' };
            }
            const winner = set.playerA > set.playerB ? 'A' : 'B';
            return { valid: true, winnerId: winner, playerAWins: 1, playerBWins: 0 };
        }

        if (filledSets.length < minSets) {
            return { valid: false, error: `Mindestens ${minSets} Sätze müssen ausgefüllt sein.` };
        }

        for (let i = 0; i < filledSets.length; i++) {
            const set = filledSets[i];
            if (!isValidSet(set.playerA, set.playerB, i)) {
                const isMatchTieBreakSet = matchTieBreak && i === (maxSets - 1);
                if (isMatchTieBreakSet) {
                    return { valid: false, error: `Match Tie-Break: Ein Spieler muss 10+ Punkte erreichen und 2 Punkte Vorsprung haben.` };
                }
                if (isFast4Mode) {
                    return { valid: false, error: `Satz ${i + 1}: Ungültiges Ergebnis. Fast4-Regeln: Satz bis 4 Spiele, bei 3:3 Tie-Break (4:3).` };
                }
                return { valid: false, error: `Satz ${i + 1}: Ungültiges Ergebnis. Tennis-Regeln: 6 Spiele mit 2 Spielen Vorsprung oder 7:6 (Tie-Break).` };
            }
        }

        let playerAWins = 0, playerBWins = 0;
        filledSets.forEach((set, idx) => {
            const winner = getSetWinner(set.playerA, set.playerB, idx);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins < setsToWin && playerBWins < setsToWin) {
            return { valid: false, error: `Ein Spieler muss ${setsToWin} Sätze gewinnen.` };
        }

        // Match muss enden, wenn jemand die erforderliche Anzahl Sätze gewonnen hat
        if (playerAWins > setsToWin || playerBWins > setsToWin) {
            return { valid: false, error: `Ungültiges Ergebnis: Bei diesem Modus kann niemand mehr als ${setsToWin} Sätze gewinnen.` };
        }

        return { valid: true, winnerId: playerAWins >= setsToWin ? 'A' : 'B', playerAWins, playerBWins };
    }

    function reset() {
        sets.length = 0;
        for (let i = 0; i < minSets; i++) sets.push({ playerA: '', playerB: '', tiebreak: null });
        renderSets();
    }

    function getMatchWinner() {
        const filledSets = getSets();

        if (filledSets.length === 0) {
            return null;
        }

        if (isTimedMode || isProSetMode) {
            const set = filledSets[0];
            if (set.playerA > set.playerB) {
                return { winner: 'A', setsA: 1, setsB: 0 };
            }
            if (set.playerB > set.playerA) {
                return { winner: 'B', setsA: 0, setsB: 1 };
            }
            return null;
        }

        let playerAWins = 0;
        let playerBWins = 0;

        filledSets.forEach((set, idx) => {
            const winner = getSetWinner(set.playerA, set.playerB, idx);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins >= setsToWin) {
            return { winner: 'A', setsA: playerAWins, setsB: playerBWins };
        }
        if (playerBWins >= setsToWin) {
            return { winner: 'B', setsA: playerAWins, setsB: playerBWins };
        }

        if (playerAWins > 0 || playerBWins > 0) {
            return { winner: null, setsA: playerAWins, setsB: playerBWins };
        }

        return null;
    }

    renderSets();
    return {
        getSets,
        validate,
        refresh: renderSets,
        reset,
        getMatchWinner,
        mode
    };
}

/** Badminton Score-Eingabe: Rally-Point bis 21, 2 Punkte Vorsprung, Maximum 30 */
export function createBadmintonScoreInput(container, existingSets = [], mode = 'best-of-3') {
    container.innerHTML = '';

    let minSets, maxSets, setsToWin;
    // Badminton ist immer Best of 3
    minSets = 2;
    maxSets = 3;
    setsToWin = 2;

    const sets = existingSets.length > 0 ? [...existingSets] : [];
    while (sets.length < minSets) {
        sets.push({ playerA: '', playerB: '' });
    }

    // Badminton-Regeln: 21 Punkte mit 2 Punkten Vorsprung, bei 20:20 bis 30 (Hardlimit)
    function isValidSet(scoreA, scoreB) {
        const a = parseInt(scoreA) || 0;
        const b = parseInt(scoreB) || 0;

        if (a === 0 && b === 0) return false;
        if (a < 21 && b < 21) return false;

        const diff = Math.abs(a - b);

        if (diff >= 2) {
            // Maximum 30 Punkte
            if (a > 30 || b > 30) return false;
            return true;
        }

        // Spezialfall: 30:29 ist gültig (Hardlimit)
        if ((a === 30 && b === 29) || (b === 30 && a === 29)) {
            return true;
        }

        return false;
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
                <input type="number" min="0" max="30"
                       class="set-input-a w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                       data-set="${index}" data-player="A" placeholder="0" value="${set.playerA}"/>
                <span class="text-gray-500">:</span>
                <input type="number" min="0" max="30"
                       class="set-input-b w-20 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                       data-set="${index}" data-player="B" placeholder="0" value="${set.playerB}"/>
                <span class="text-xs text-gray-400">bis 21 (max 30)</span>
            `;
            container.appendChild(setDiv);
        });

        container.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', handleSetInput);
        });
    }

    function handleSetInput(e) {
        const setIndex = parseInt(e.target.dataset.set);
        const player = e.target.dataset.player;
        // Erlaubt 0 als gültigen Wert (parseInt("0") || '' würde fälschlicherweise '' werden)
        const value = e.target.value.trim();
        sets[setIndex][`player${player}`] = value === '' ? '' : parseInt(value);
        let playerAWins = 0, playerBWins = 0;
        sets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        const matchWon = playerAWins >= setsToWin || playerBWins >= setsToWin;
        if (!matchWon && sets.length < maxSets) {
            const lastSet = sets[sets.length - 1];
            if (lastSet.playerA !== '' && lastSet.playerB !== '') {
                sets.push({ playerA: '', playerB: '' });
                renderSets();
            }
        }
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
                return { valid: false, error: `Satz ${i + 1}: Ungültiges Ergebnis. Badminton-Regeln: 21 Punkte, 2 Punkte Vorsprung, Maximum 30:29.` };
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

        // Match muss enden, wenn jemand die erforderliche Anzahl Sätze gewonnen hat
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

        if (filledSets.length === 0) {
            return null;
        }

        let playerAWins = 0;
        let playerBWins = 0;

        filledSets.forEach(set => {
            const winner = getSetWinner(set.playerA, set.playerB);
            if (winner === 'A') playerAWins++;
            if (winner === 'B') playerBWins++;
        });

        if (playerAWins >= setsToWin) {
            return { winner: 'A', setsA: playerAWins, setsB: playerBWins };
        }
        if (playerBWins >= setsToWin) {
            return { winner: 'B', setsA: playerAWins, setsB: playerBWins };
        }

        if (playerAWins > 0 || playerBWins > 0) {
            return { winner: null, setsA: playerAWins, setsB: playerBWins };
        }

        return null;
    }

    renderSets();
    return {
        getSets,
        validate,
        refresh: renderSets,
        reset,
        getMatchWinner,
    };
}

export async function loadPendingRequests(currentUser) {
    const container = document.getElementById('pending-result-requests-list');
    if (!container) return;

    try {
        const { data: requests, error } = await supabase
            .from('match_requests')
            .select('id, player_a_id, player_b_id, winner_id, loser_id, status, sets, approvals, match_mode, handicap_used, created_at')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine ausstehenden Anfragen</p>';
            return;
        }

        const userIds = [...new Set(requests.flatMap(r => [r.player_a_id, r.player_b_id]))];
        const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        container.innerHTML = requests.map(req => {
            const isPlayerA = req.player_a_id === currentUser.id;
            const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
            const otherPlayer = profileMap[otherPlayerId];
            const setsDisplay = formatSetsDisplay(req.sets, req);
            const statusText = req.status === 'pending_player' ? 'Wartet auf Bestätigung' : 'Wartet auf Coach';
            const needsResponse = !isPlayerA && req.status === 'pending_player';

            return `
                <div class="bg-white border ${needsResponse ? 'border-indigo-300' : 'border-gray-200'} rounded-lg p-4 shadow-sm mb-3">
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center gap-3">
                            <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div>
                                <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayer?.display_name || 'Unbekannt'}</p>
                                <p class="text-xs text-gray-500">${setsDisplay}</p>
                            </div>
                        </div>
                        <span class="text-xs ${req.status === 'pending_coach' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'} px-2 py-1 rounded-full">${statusText}</span>
                    </div>
                    ${needsResponse ? `
                        <div class="flex gap-2 mt-3">
                            <button onclick="respondToMatchRequest('${req.id}', true)" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md">
                                <i class="fas fa-check mr-1"></i> Akzeptieren
                            </button>
                            <button onclick="respondToMatchRequest('${req.id}', false)" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                                <i class="fas fa-times mr-1"></i> Ablehnen
                            </button>
                        </div>
                    ` : isPlayerA ? `
                        <div class="flex gap-2 mt-3">
                            <button onclick="deleteMatchRequest('${req.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                                <i class="fas fa-trash mr-1"></i> Zurückziehen
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading pending requests:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

export async function loadMatchHistory(currentUser) {
    const container = document.getElementById('match-history-list');
    if (!container) return;

    try {
        const { data: matches, error } = await supabase
            .from('matches')
            .select('id, player_a_id, player_b_id, winner_id, loser_id, sets, player_a_sets_won, player_b_sets_won, elo_change, winner_elo_change, loser_elo_change, player_a_elo_before, player_b_elo_before, season_points_awarded, played_at, created_at, sport_id, club_id, match_mode, handicap_used')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('played_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!matches || matches.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Noch keine Wettkämpfe gespielt</p>';
            return;
        }

        const userIds = [...new Set(matches.flatMap(m => [m.player_a_id, m.player_b_id]))];
        const { data: profiles } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        container.innerHTML = matches.map(match => {
            const playerA = profileMap[match.player_a_id];
            const playerB = profileMap[match.player_b_id];
            const isWinner = match.winner_id === currentUser.id;
            const setsDisplay = formatSetsDisplay(match.sets, match);
            const eloChange = isWinner
                ? (match.winner_elo_change || 0)
                : (match.loser_elo_change || 0);

            return `
                <div class="bg-white border ${isWinner ? 'border-green-200' : 'border-red-200'} rounded-lg p-4 shadow-sm mb-3">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-medium">${playerA?.display_name || 'Unbekannt'} vs ${playerB?.display_name || 'Unbekannt'}</p>
                            <p class="text-sm text-gray-600">${setsDisplay}</p>
                        </div>
                        <div class="text-right">
                            <span class="${isWinner ? 'text-green-600' : 'text-red-600'} font-bold">${isWinner ? 'Gewonnen' : 'Verloren'}</span>
                            <p class="text-xs ${eloChange >= 0 ? 'text-green-600' : 'text-red-600'}">
                                ${eloChange >= 0 ? '+' : ''}${eloChange} Elo
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading match history:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

export function formatSetsDisplay(sets, match) {
    if (!sets || sets.length === 0) {
        const aWins = match?.player_a_sets_won || 0;
        const bWins = match?.player_b_sets_won || 0;
        if (aWins === 0 && bWins === 0) return '—';
        return `${aWins}:${bWins}`;
    }
    return sets.map((set) => `${set.playerA || set.teamA || 0}:${set.playerB || set.teamB || 0}`).join(', ');
}

export async function respondToMatchRequest(requestId, accept, callbacks = {}) {
    try {
        const newStatus = accept ? 'pending_coach' : 'rejected';

        const { error } = await supabase
            .from('match_requests')
            .update({ status: newStatus })
            .eq('id', requestId);

        if (error) throw error;

        if (callbacks.onResponse) {
            callbacks.onResponse();
        }

    } catch (error) {
        console.error('Error responding to match request:', error);
        alert('Fehler beim Verarbeiten der Anfrage');
    }
}

export async function deleteMatchRequest(requestId, currentUser, callbacks = {}) {
    if (!confirm('Möchtest du diese Anfrage wirklich zurückziehen?')) return;

    try {
        const { error } = await supabase
            .from('match_requests')
            .delete()
            .eq('id', requestId)
            .eq('player_a_id', currentUser.id);

        if (error) throw error;

        if (callbacks.onDelete) {
            callbacks.onDelete();
        }

    } catch (error) {
        console.error('Error deleting match request:', error);
        alert('Fehler beim Löschen der Anfrage');
    }
}

function setupMatchSuggestions(currentUser, currentUserData) {
    const toggleBtn = document.getElementById('toggle-match-suggestions');
    const content = document.getElementById('match-suggestions-content');
    const chevron = document.getElementById('suggestions-chevron');

    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            content.classList.toggle('hidden');
            if (chevron) {
                chevron.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
            if (!content.classList.contains('hidden')) {
                loadMatchSuggestions(currentUser, currentUserData);
            }
        });
    }
}

export async function loadMatchSuggestions(currentUser, currentUserData) {
    const container = document.getElementById('match-suggestions-list');
    if (!container || !currentUserData.club_id) return;

    container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Lade Vorschläge...</p>';

    try {
        const { data: clubMembers, error } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, elo_rating')
            .eq('club_id', currentUserData.club_id)
            .neq('id', currentUser.id)
            .neq('role', 'admin')
            .limit(10);

        if (error) throw error;

        if (!clubMembers || clubMembers.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Keine Spieler gefunden</p>';
            return;
        }

        // Kürzlich gespielte Matches laden, um diese Spieler zu deprioritisieren
        const { data: recentMatches } = await supabase
            .from('matches')
            .select('player_a_id, player_b_id')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('played_at', { ascending: false })
            .limit(20);

        const recentOpponents = new Set();
        (recentMatches || []).forEach(m => {
            if (m.player_a_id === currentUser.id) recentOpponents.add(m.player_b_id);
            else recentOpponents.add(m.player_a_id);
        });

        // Spieler priorisieren, die wir noch nicht kürzlich gespielt haben
        const suggestions = clubMembers
            .map(p => ({ ...p, playedRecently: recentOpponents.has(p.id) }))
            .sort((a, b) => (a.playedRecently ? 1 : 0) - (b.playedRecently ? 1 : 0))
            .slice(0, 5);

        container.innerHTML = suggestions.map(player => `
            <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 mb-2">
                <div class="flex items-center gap-3">
                    <img src="${player.avatar_url || DEFAULT_AVATAR}" class="w-8 h-8 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <p class="font-medium text-sm">${player.display_name}</p>
                        <p class="text-xs text-gray-500">Elo: ${player.elo_rating || 800}</p>
                    </div>
                </div>
                <span class="text-xs ${player.playedRecently ? 'text-gray-400' : 'text-green-600 font-medium'}">
                    ${player.playedRecently ? 'Kürzlich gespielt' : '⭐ Empfohlen'}
                </span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading match suggestions:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-2 text-sm">Fehler beim Laden</p>';
    }
}
