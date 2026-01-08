import { createDoublesMatchRequest } from './doubles-matches-supabase.js';
import { calculateDoublesHandicap } from './validation-utils.js';

/**
 * Doppel-Spieler-UI-Modul (Supabase-Version)
 * Verwaltet Spieler-Oberfläche für Doppel-Match-Anfragen
 * HINWEIS: Satz-Eingabe wird über window.playerSetScoreInput geteilt (aus player-matches.js)
 */

// ========================================================================
// ===== HILFSFUNKTIONEN =====
// ========================================================================

/**
 * Prüft ob Spieler keinen Verein hat
 * @param {string|null|undefined} clubId - Die zu prüfende Vereins-ID
 * @returns {boolean} True wenn Spieler keinen Verein hat
 */
function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

let currentPlayerMatchType = 'singles'; // 'singles' or 'doubles'
let supabaseClient = null; // Supabase-Client für Handicap-Berechnung speichern
let currentDoublesHandicapDetails = null; // Speichert aktuelle Handicap-Vorschlagsdetails für Doppel

// ========================================================================
// ===== INITIALISIERUNG =====
// ========================================================================

/**
 * Initialisiert die Doppel-Match-UI für Spieler
 */
export function initializeDoublesPlayerUI() {
    // Toggle-Buttons einrichten
    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');

    if (!singlesToggle || !doublesToggle) {
        console.error('Player toggle buttons not found');
        return;
    }

    singlesToggle.addEventListener('click', () => switchPlayerMatchType('singles'));
    doublesToggle.addEventListener('click', () => switchPlayerMatchType('doubles'));

    // Mit Einzel initialisieren
    switchPlayerMatchType('singles');

    // getCurrentPlayerMatchType für Zugriff aus player-matches.js exportieren
    window.getCurrentPlayerMatchType = getCurrentPlayerMatchType;
}

/**
 * Wechselt zwischen Einzel- und Doppel-Match-Typ für Spieler
 * @param {string} type - 'singles' oder 'doubles'
 */
function switchPlayerMatchType(type) {
    currentPlayerMatchType = type;

    const singlesToggle = document.getElementById('player-singles-toggle');
    const doublesToggle = document.getElementById('player-doubles-toggle');
    const singlesContainer = document.getElementById('singles-opponent-container');
    const doublesContainer = document.getElementById('doubles-players-container');
    const teamEloDisplay = document.getElementById('doubles-team-elo-display');

    if (type === 'singles') {
        // Toggle-Buttons aktualisieren
        singlesToggle.classList.add('active');
        doublesToggle.classList.remove('active');

        // Einzel anzeigen, Doppel verstecken
        singlesContainer.classList.remove('hidden');
        doublesContainer.classList.add('hidden');

        // Team-Elo-Anzeige verstecken
        if (teamEloDisplay) {
            teamEloDisplay.classList.add('hidden');
        }

        // Doppel-Auswahlen löschen
        clearDoublesSelections();
    } else {
        // Toggle-Buttons aktualisieren
        doublesToggle.classList.add('active');
        singlesToggle.classList.remove('active');

        // Doppel anzeigen, Einzel verstecken
        doublesContainer.classList.remove('hidden');
        singlesContainer.classList.add('hidden');

        // Einzel-Auswahl löschen
        clearSinglesSelection();

        // Handicap-Info beim Wechsel zu Doppel verstecken
        const handicapInfo = document.getElementById('match-handicap-info');
        if (handicapInfo) {
            handicapInfo.classList.add('hidden');
        }
    }

    // Match-Verlauf mit passendem Filter neu laden
    if (window.reloadMatchHistory) {
        window.reloadMatchHistory(type);
    }
}

/**
 * Löscht Einzel-Gegner-Auswahl
 */
function clearSinglesSelection() {
    const opponentSelect = document.getElementById('opponent-select');
    if (opponentSelect) opponentSelect.value = '';
}

/**
 * Löscht Doppel-Spieler-Auswahlen
 */
function clearDoublesSelections() {
    // Handicap-Details löschen
    currentDoublesHandicapDetails = null;

    // Sucheingaben löschen
    const partnerInput = document.getElementById('partner-search-input');
    const opponent1Input = document.getElementById('opponent1-search-input');
    const opponent2Input = document.getElementById('opponent2-search-input');

    if (partnerInput) {
        partnerInput.value = '';
        document.getElementById('partner-search-results').innerHTML = '';
        document.getElementById('selected-partner-id').value = '';
    }
    if (opponent1Input) {
        opponent1Input.value = '';
        document.getElementById('opponent1-search-results').innerHTML = '';
        document.getElementById('selected-opponent1-id').value = '';
    }
    if (opponent2Input) {
        opponent2Input.value = '';
        document.getElementById('opponent2-search-results').innerHTML = '';
        document.getElementById('selected-opponent2-id').value = '';
    }
}

// ========================================================================
// ===== SPIELER-SUCHE-FUNKTIONALITÄT =====
// ========================================================================

/**
 * Initialisiert Suchfunktionalität für alle 3 Spieler-Auswahlen im Doppel
 * @param {Object} supabase - Supabase client instance
 * @param {Object} userData - Aktuelle Benutzerdaten
 */
export async function initializeDoublesPlayerSearch(supabase, userData) {
    // Supabase-Client für spätere Nutzung speichern (z.B. Handicap)
    supabaseClient = supabase;

    // Alle suchbaren Spieler laden - mit Echtzeit-Updates
    // Objekt-Wrapper damit Suchfunktionen immer aktuelle Daten haben
    const playersData = { players: [] };

    // Sport-ID des Benutzers für Filterung abrufen (camelCase und snake_case)
    const userSportId = userData.activeSportId || userData.active_sport_id;
    // Sowohl camelCase als auch snake_case für clubId
    const userClubId = userData.clubId || userData.club_id;

    async function loadPlayers() {
        try {
            // Vereine für Test-Verein-Filterung laden
            const { data: clubsData } = await supabase.from('clubs').select('*');
            const clubsMap = new Map();
            (clubsData || []).forEach(club => clubsMap.set(club.id, club));

            // Prüfen ob Benutzer aus Test-Verein ist
            const currentUserClub = userClubId ? clubsMap.get(userClubId) : null;
            const isCurrentUserFromTestClub = currentUserClub && currentUserClub.is_test_club;

            // Spieler und Trainer laden - Admins explizit ausschließen
            // Nicht nach Sport in Query filtern - wird in JS gemacht für Offline-Spieler
            let query = supabase
                .from('profiles')
                .select('*')
                .in('role', ['player', 'coach', 'head_coach'])
                .neq('role', 'admin'); // Extra-Sicherheit: Admins explizit ausschließen

            const { data: usersData, error } = await query;

            if (error) throw error;

            playersData.players = (usersData || [])
                .map(p => {
                    const playerClub = p.club_id ? clubsMap.get(p.club_id) : null;
                    return {
                        id: p.id,
                        firstName: p.first_name,
                        lastName: p.last_name,
                        clubId: p.club_id,
                        clubName: playerClub ? playerClub.name : null,
                        doublesEloRating: p.doubles_elo_rating,
                        privacySettings: p.privacy_settings,
                        isOffline: p.is_offline,
                        activeSportId: p.active_sport_id,
                        isMatchReady: p.is_match_ready,
                    };
                })
                .filter(p => {
                    // Filter: nicht selbst
                    const isSelf = p.id === userData.id;
                    if (isSelf) return false;

                    // Offline-Spieler sind im Doppel immer erlaubt (umgehen Match-Ready-Prüfung)
                    // Online-Spieler müssen spielbereit sein
                    if (!p.isOffline && !p.isMatchReady) return false;

                    // Sport-Filter: gleiche Sportart ODER Offline-Spieler (können jede Sportart)
                    if (userSportId && !p.isOffline) {
                        if (p.activeSportId !== userSportId) return false;
                    }

                    // Test-Verein-Filterung
                    if (!isCurrentUserFromTestClub && p.clubId) {
                        const playerClub = clubsMap.get(p.clubId);
                        if (playerClub && playerClub.is_test_club) {
                            return false;
                        }
                    }

                    // Offline-Spieler im selben Verein sind immer sichtbar
                    if (p.isOffline && userClubId && p.clubId === userClubId) {
                        return true;
                    }

                    // Datenschutz-Prüfung
                    if (hasNoClub(userClubId) && hasNoClub(p.clubId)) {
                        return true;
                    }

                    const searchable = p.privacySettings?.searchable || 'global';

                    if (searchable === 'global') {
                        return true;
                    }

                    if (searchable === 'club_only' && userClubId && p.clubId === userClubId) {
                        return true;
                    }

                    return false;
                });

            console.log('[Doubles Player Search] Players list updated with', playersData.players.length, 'players');
        } catch (error) {
            console.error('Error loading players:', error);
        }
    }

    // Initiales Laden
    await loadPlayers();

    // Echtzeit-Subscription für Spieler-Updates einrichten
    supabase
        .channel('doubles-player-search-updates')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'profiles'
            },
            () => {
                loadPlayers();
            }
        )
        .subscribe();

    // Ausgewählte Spieler-IDs verfolgen um von anderen Suchen auszuschließen
    const selectedIds = {
        partner: null,
        opponent1: null,
        opponent2: null
    };

    // Funktion um alle aktuell ausgewählten IDs zu erhalten (exkl. Feld)
    function getExcludeIds(excludeField) {
        const ids = [];
        if (excludeField !== 'partner' && selectedIds.partner) ids.push(selectedIds.partner);
        if (excludeField !== 'opponent1' && selectedIds.opponent1) ids.push(selectedIds.opponent1);
        if (excludeField !== 'opponent2' && selectedIds.opponent2) ids.push(selectedIds.opponent2);
        return ids;
    }

    // Suche für Partner initialisieren - playersData-Objekt übergeben
    initializePlayerSearchInput(
        'partner-search-input',
        'partner-search-results',
        'selected-partner-id',
        'selected-partner-elo',
        playersData,
        userData,
        () => getExcludeIds('partner'),
        (id) => { selectedIds.partner = id; }
    );

    // Suche für Gegner 1 initialisieren
    initializePlayerSearchInput(
        'opponent1-search-input',
        'opponent1-search-results',
        'selected-opponent1-id',
        'selected-opponent1-elo',
        playersData,
        userData,
        () => getExcludeIds('opponent1'),
        (id) => { selectedIds.opponent1 = id; }
    );

    // Suche für Gegner 2 initialisieren
    initializePlayerSearchInput(
        'opponent2-search-input',
        'opponent2-search-results',
        'selected-opponent2-id',
        'selected-opponent2-elo',
        playersData,
        userData,
        () => getExcludeIds('opponent2'),
        (id) => { selectedIds.opponent2 = id; }
    );
}

/**
 * Initialisiert eine einzelne Spieler-Sucheingabe
 * @param {string} inputId - ID des Sucheingabe-Elements
 * @param {string} resultsId - ID des Ergebnis-Container-Elements
 * @param {string} selectedIdFieldId - ID des versteckten Feldes für Spieler-ID
 * @param {string} selectedEloFieldId - ID des versteckten Feldes für Spieler-Elo
 * @param {Object} playersData - Objekt mit Spieler-Array (für Echtzeit-Updates)
 * @param {Object} userData - Aktuelle Benutzerdaten
 * @param {Function} getExcludeIds - Funktion die Array auszuschließender Spieler-IDs zurückgibt
 * @param {Function} onSelect - Callback wenn Spieler ausgewählt wird
 */
function initializePlayerSearchInput(inputId, resultsId, selectedIdFieldId, selectedEloFieldId, playersData, userData, getExcludeIds, onSelect) {
    const searchInput = document.getElementById(inputId);
    const searchResults = document.getElementById(resultsId);
    const selectedIdField = document.getElementById(selectedIdFieldId);
    const selectedEloField = document.getElementById(selectedEloFieldId);

    if (!searchInput || !searchResults || !selectedIdField) return;

    // Bei Eingabe suchen
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        // Wenn Suche leer, Ergebnisse löschen
        if (!searchTerm) {
            searchResults.innerHTML = '';
            return;
        }

        // Aktuelle Ausschluss-IDs abrufen (dynamisch)
        const excludeIds = getExcludeIds();

        // Spieler nach Suchbegriff filtern - playersData.players für Echtzeit-Daten
        const filteredPlayers = playersData.players.filter(player => {
            // Spieler ausschließen die bereits in anderen Feldern ausgewählt
            if (excludeIds.includes(player.id)) return false;

            const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
            return fullName.includes(searchTerm);
        }).slice(0, 10); // Auf 10 Ergebnisse begrenzen

        displaySearchResults(filteredPlayers, searchResults, searchInput, selectedIdField, selectedEloField, userData, onSelect);
    });

    // Ergebnisse löschen bei Klick außerhalb
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.innerHTML = '';
        }
    });

    // Auswahl löschen wenn Eingabe gelöscht
    searchInput.addEventListener('input', (e) => {
        if (!e.target.value.trim()) {
            selectedIdField.value = '';
            if (selectedEloField) selectedEloField.value = '';
            onSelect(null);
        }
    });
}

/**
 * Zeigt Suchergebnisse für Spieler-Auswahl an
 * @param {Array} players - Gefilterte Spieler zum Anzeigen
 * @param {HTMLElement} resultsContainer - Container für Ergebnisse
 * @param {HTMLElement} searchInput - Sucheingabe-Element
 * @param {HTMLElement} selectedIdField - Verstecktes Feld für ausgewählte ID
 * @param {HTMLElement} selectedEloField - Verstecktes Feld für ausgewähltes Elo
 * @param {Object} userData - Aktuelle Benutzerdaten
 * @param {Function} onSelect - Callback wenn Spieler ausgewählt wird
 */
function displaySearchResults(players, resultsContainer, searchInput, selectedIdField, selectedEloField, userData, onSelect) {
    if (players.length === 0) {
        resultsContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Keine Spieler gefunden.</p>';
        return;
    }

    resultsContainer.innerHTML = players.map(player => {
        const clubName = player.clubName || 'Kein Verein';
        // Sowohl camelCase als auch snake_case für userData Vereins-ID
        const userClubId = userData.clubId || userData.club_id;
        const isSameClub = player.clubId === userClubId;

        return `
            <div class="player-search-result border border-gray-200 rounded-lg p-3 mb-2 cursor-pointer hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
                 data-player-id="${player.id}"
                 data-player-name="${player.firstName} ${player.lastName}">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-900">${player.firstName} ${player.lastName}</h5>
                        <p class="text-xs text-gray-500 mt-1">
                            <i class="fas fa-users mr-1"></i>${clubName}
                        </p>
                    </div>
                    ${!isSameClub && player.clubId ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Anderer Verein</span>' : ''}
                </div>
            </div>
        `;
    }).join('');

    // Klick-Handler zu Ergebnissen hinzufügen
    resultsContainer.querySelectorAll('.player-search-result').forEach(result => {
        result.addEventListener('click', () => {
            const playerId = result.dataset.playerId;
            const playerName = result.dataset.playerName;

            // Ausgewählten Spieler setzen
            selectedIdField.value = playerId;
            // Hinweis: Individuelles Elo-Feld veraltet - Paarungs-Elo wird verwendet
            if (selectedEloField) selectedEloField.value = '800'; // Standard, wird aus Paarung nachgeschlagen

            // Sucheingabe aktualisieren um ausgewählten Spieler zu zeigen
            searchInput.value = playerName;

            // Auswahl verfolgen um von anderen Suchen auszuschließen
            if (onSelect) onSelect(playerId);

            // Suchergebnisse löschen
            resultsContainer.innerHTML = '';
        });
    });
}

// Veraltet: Für Abwärtskompatibilität behalten
export function populateDoublesPlayerDropdowns(players, currentUserId) {
    console.warn('populateDoublesPlayerDropdowns is deprecated. Use initializeDoublesPlayerSearch instead.');
}

// ========================================================================
// ===== FORMULAR-ÜBERMITTLUNG =====
// ========================================================================

/**
 * Verarbeitet Doppel-Match-Anfrage-Übermittlung
 * HINWEIS: e.preventDefault() wird bereits in player-matches.js aufgerufen
 * @param {Event} e - Formular-Submit-Event
 * @param {Object} supabase - Supabase client instance
 * @param {Object} currentUserData - Aktuelle Benutzerdaten
 */
export async function handleDoublesPlayerMatchRequest(e, supabase, currentUserData) {
    const feedbackEl = document.getElementById('match-request-feedback');

    // Spieler-Auswahlen aus versteckten Feldern abrufen
    const partnerId = document.getElementById('selected-partner-id').value;
    const opponent1Id = document.getElementById('selected-opponent1-id').value;
    const opponent2Id = document.getElementById('selected-opponent2-id').value;

    // Validieren dass alle Spieler ausgewählt sind
    if (!partnerId || !opponent1Id || !opponent2Id) {
        feedbackEl.textContent = 'Bitte alle Spieler auswählen: Partner und beide Gegner.';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    // Validieren dass alle Spieler unterschiedlich sind
    const allPlayerIds = [currentUserData.id, partnerId, opponent1Id, opponent2Id];
    if (new Set(allPlayerIds).size !== 4) {
        feedbackEl.textContent = 'Alle 4 Spieler müssen unterschiedlich sein!';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    // Validieren dass alle Spieler spielbereit sind (5+ Grundlagen)
    let playersData;
    try {
        const { data: players, error } = await supabase
            .from('profiles')
            .select('*')
            .in('id', allPlayerIds);

        if (error) throw error;

        const notReadyPlayers = [];
        (players || []).forEach(player => {
            const grundlagen = player.grundlagen_completed || 0;
            if (grundlagen < 5) {
                notReadyPlayers.push(player.first_name + ' ' + player.last_name);
            }
        });

        if (notReadyPlayers.length > 0) {
            feedbackEl.textContent = `Folgende Spieler haben noch nicht genug Grundlagen (min. 5): ${notReadyPlayers.join(', ')}`;
            feedbackEl.className =
                'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
            feedbackEl.classList.remove('hidden');
            return;
        }

        // Map für schnellen Lookup erstellen
        playersData = new Map();
        (players || []).forEach(p => playersData.set(p.id, p));

        // NEU: Validieren dass mindestens ein Gegner Online-Spieler ist
        const opponent1Data = playersData.get(opponent1Id);
        const opponent2Data = playersData.get(opponent2Id);

        const opponent1IsOffline = opponent1Data?.is_offline === true;
        const opponent2IsOffline = opponent2Data?.is_offline === true;

        if (opponent1IsOffline && opponent2IsOffline) {
            feedbackEl.textContent =
                'Mindestens einer der beiden Gegner muss ein Online-Spieler sein (mit Code angemeldet). Beide Gegner können nicht Offline-Spieler sein.';
            feedbackEl.className =
                'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
            feedbackEl.classList.remove('hidden');
            return;
        }
    } catch (error) {
        console.error('Error checking player readiness:', error);
        feedbackEl.textContent = 'Fehler beim Überprüfen der Spieler-Berechtigung.';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    // Globales Set-Score-Input von player-matches.js verwenden (geteilt)
    const setScoreInput = window.playerSetScoreInput;
    if (!setScoreInput) {
        feedbackEl.textContent = 'Fehler: Set-Score-Input nicht initialisiert.';
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    const setValidation = setScoreInput.validate();
    if (!setValidation.valid) {
        feedbackEl.textContent = setValidation.error;
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
        feedbackEl.classList.remove('hidden');
        return;
    }

    const sets = setScoreInput.getSets();
    const handicapUsed = document.getElementById('match-handicap-toggle')?.checked || false;

    // Match-Modus aus Dropdown abrufen
    const matchModeSelect = document.getElementById('match-mode-select');
    const matchMode = matchModeSelect ? matchModeSelect.value : 'best-of-5';

    // Satz-Feldnamen von playerA/playerB zu teamA/teamB für Doppel konvertieren
    const doublesSets = sets.map(set => ({
        teamA: set.playerA,
        teamB: set.playerB,
    }));

    feedbackEl.textContent = 'Sende Doppel-Anfrage...';
    feedbackEl.className = 'bg-blue-100 border border-blue-300 text-blue-700 px-4 py-3 rounded';
    feedbackEl.classList.remove('hidden');

    try {
        // Spielernamen aus geladenen Daten extrahieren
        const partnerData = playersData.get(partnerId);
        const opponent1Data = playersData.get(opponent1Id);
        const opponent2Data = playersData.get(opponent2Id);

        // Sowohl camelCase als auch snake_case für Benutzerdaten
        const userFirstName = currentUserData.firstName || currentUserData.first_name || '';
        const userLastName = currentUserData.lastName || currentUserData.last_name || '';

        // Handicap-Objekt erstellen falls Handicap verwendet
        const handicapData = handicapUsed && currentDoublesHandicapDetails ? {
            team: currentDoublesHandicapDetails.team,
            team_name: currentDoublesHandicapDetails.team_name,
            points: currentDoublesHandicapDetails.points
        } : null;

        const requestData = {
            partnerId: partnerId,
            opponent1Id: opponent1Id,
            opponent2Id: opponent2Id,
            sets: doublesSets,
            handicapUsed: handicapUsed,
            handicap: handicapData,
            matchMode: matchMode,
            playerNames: {
                player1: `${userFirstName} ${userLastName}`.trim() || 'Unbekannt',
                player2: partnerData
                    ? `${partnerData.first_name} ${partnerData.last_name}`
                    : 'Unbekannt',
                opponent1: opponent1Data
                    ? `${opponent1Data.first_name} ${opponent1Data.last_name}`
                    : 'Unbekannt',
                opponent2: opponent2Data
                    ? `${opponent2Data.first_name} ${opponent2Data.last_name}`
                    : 'Unbekannt',
            },
        };

        const result = await createDoublesMatchRequest(requestData, supabase, currentUserData);

        if (result.success) {
            feedbackEl.textContent = 'Doppel-Anfrage gesendet! Einer der Gegner muss bestätigen, dann wird das Match automatisch genehmigt.';
            feedbackEl.className =
                'bg-green-100 border border-green-300 text-green-700 px-4 py-3 rounded';

            // Formular zurücksetzen
            if (setScoreInput && setScoreInput.reset) {
                setScoreInput.reset();
            }
            clearDoublesSelections();

            // Match-Anfragen-Liste aktualisieren falls verfügbar
            if (typeof window.loadMatchRequests === 'function') {
                window.loadMatchRequests();
            }

            // Feedback nach 5 Sekunden ausblenden
            setTimeout(() => {
                feedbackEl.classList.add('hidden');
            }, 5000);
        }
    } catch (error) {
        console.error('Error creating doubles match request:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded';
    }
}

/**
 * Gibt den aktuellen Match-Typ zurück
 * @returns {string} 'singles' oder 'doubles'
 */
export function getCurrentPlayerMatchType() {
    return currentPlayerMatchType;
}

// ========================================================================
// ===== HANDICAP-EINRICHTUNG =====
// ========================================================================

/**
 * Richtet Handicap-Berechnung für Doppel-Spieler-Formular ein
 * @param {Object} playersData - Objekt mit Spieler-Array
 * @param {Object} userData - Aktuelle Benutzerdaten
 */
export function setupDoublesPlayerHandicap(playersData, userData) {
    const partnerIdField = document.getElementById('selected-partner-id');
    const opponent1IdField = document.getElementById('selected-opponent1-id');
    const opponent2IdField = document.getElementById('selected-opponent2-id');
    const handicapInfo = document.getElementById('match-handicap-info');
    const handicapText = document.getElementById('match-handicap-text');
    const handicapToggleContainer = document.getElementById('match-handicap-toggle-container');
    const teamEloDisplay = document.getElementById('doubles-team-elo-display');
    const teamAEloValue = document.getElementById('team-a-elo-value');
    const teamBEloValue = document.getElementById('team-b-elo-value');

    if (!partnerIdField || !opponent1IdField || !opponent2IdField || !handicapInfo || !handicapText) {
        console.warn('Handicap elements not found for doubles player form');
        return;
    }

    /**
     * Berechnet und zeigt Handicap basierend auf aktuellen Auswahlen
     * Verwendet PAARUNGS-Elo aus doubles_pairings-Tabelle (nicht Spieler-Durchschnitt)
     */
    async function calculateAndDisplayHandicap() {
        const partnerId = partnerIdField.value;
        const opponent1Id = opponent1IdField.value;
        const opponent2Id = opponent2IdField.value;

        // Prüfen ob alle 3 Spieler ausgewählt sind
        if (!partnerId || !opponent1Id || !opponent2Id) {
            // Handicap und Team-Elo verstecken wenn nicht alle Spieler ausgewählt
            handicapInfo.classList.add('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.add('hidden');
            }
            if (teamEloDisplay) {
                teamEloDisplay.classList.add('hidden');
            }
            return;
        }

        // Spielerdaten aus playersData abrufen
        const partner = playersData.players.find(p => p.id === partnerId);
        const opponent1 = playersData.players.find(p => p.id === opponent1Id);
        const opponent2 = playersData.players.find(p => p.id === opponent2Id);

        // Wenn Spieler nicht gefunden, Handicap und Team-Elo verstecken
        if (!partner || !opponent1 || !opponent2) {
            handicapInfo.classList.add('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.add('hidden');
            }
            if (teamEloDisplay) {
                teamEloDisplay.classList.add('hidden');
            }
            return;
        }

        // Paarungs-IDs berechnen (sortierte Spieler-IDs für Konsistenz)
        const currentUserId = userData.id;
        const teamAPairingId = currentUserId < partnerId
            ? `${currentUserId}_${partnerId}`
            : `${partnerId}_${currentUserId}`;
        const teamBPairingId = opponent1Id < opponent2Id
            ? `${opponent1Id}_${opponent2Id}`
            : `${opponent2Id}_${opponent1Id}`;

        // PAARUNGS-Elo aus Datenbank abrufen (nicht individueller Spielerdurchschnitt!)
        let teamAElo = 800; // Standard für neue Paarung
        let teamBElo = 800; // Standard für neue Paarung
        let teamAIsNew = true;
        let teamBIsNew = true;

        if (supabaseClient) {
            try {
                // Team A Paarung abrufen
                const { data: teamAPairing } = await supabaseClient
                    .from('doubles_pairings')
                    .select('current_elo_rating')
                    .eq('id', teamAPairingId)
                    .single();

                if (teamAPairing) {
                    teamAElo = teamAPairing.current_elo_rating || 800;
                    teamAIsNew = false;
                }

                // Team B Paarung abrufen
                const { data: teamBPairing } = await supabaseClient
                    .from('doubles_pairings')
                    .select('current_elo_rating')
                    .eq('id', teamBPairingId)
                    .single();

                if (teamBPairing) {
                    teamBElo = teamBPairing.current_elo_rating || 800;
                    teamBIsNew = false;
                }
            } catch (err) {
                console.warn('Could not fetch pairing Elo, using defaults:', err);
            }
        }

        // Team-Elo-Werte mit "Neu"-Indikator für neue Paarungen anzeigen
        if (teamEloDisplay && teamAEloValue && teamBEloValue) {
            teamAEloValue.textContent = teamAIsNew ? `Neu (${teamAElo})` : teamAElo;
            teamBEloValue.textContent = teamBIsNew ? `Neu (${teamBElo})` : teamBElo;
            teamEloDisplay.classList.remove('hidden');
        }

        // Team-Objekte für Handicap-Berechnung mit PAARUNGS-Elo erstellen
        const teamA = {
            player1: { eloRating: teamAElo / 2 }, // Aufteilen für Handicap-Berechnungsformel
            player2: { eloRating: teamAElo / 2 }
        };

        const teamB = {
            player1: { eloRating: teamBElo / 2 },
            player2: { eloRating: teamBElo / 2 }
        };

        // Handicap berechnen
        const handicapResult = calculateDoublesHandicap(teamA, teamB);

        if (handicapResult && handicapText) {
            // Team-Namen erstellen - sowohl snake_case als auch camelCase
            const userFirstName = userData.first_name || userData.firstName || '';
            const userLastName = userData.last_name || userData.lastName || '';
            const partnerFirstName = partner.first_name || partner.firstName || '';
            const partnerLastName = partner.last_name || partner.lastName || '';
            const opp1FirstName = opponent1.first_name || opponent1.firstName || '';
            const opp1LastName = opponent1.last_name || opponent1.lastName || '';
            const opp2FirstName = opponent2.first_name || opponent2.firstName || '';
            const opp2LastName = opponent2.last_name || opponent2.lastName || '';

            const teamAName = `${userFirstName} ${userLastName} & ${partnerFirstName} ${partnerLastName}`;
            const teamBName = `${opp1FirstName} ${opp1LastName} & ${opp2FirstName} ${opp2LastName}`;

            const weakerTeamName = handicapResult.team === 'A' ? teamAName.trim() : teamBName.trim();

            // Handicap-Details für spätere Verwendung beim Speichern speichern
            currentDoublesHandicapDetails = {
                team: handicapResult.team,
                team_name: weakerTeamName,
                points: handicapResult.points,
                team_a_elo: teamAElo,
                team_b_elo: teamBElo
            };

            handicapText.textContent = `${weakerTeamName} startet mit ${handicapResult.points} Punkt${handicapResult.points !== 1 ? 'en' : ''} Vorsprung (${teamAElo} vs ${teamBElo} Elo)`;
            handicapInfo.classList.remove('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.remove('hidden');
            }
        } else {
            // Kein Handicap erforderlich
            currentDoublesHandicapDetails = null;
            handicapInfo.classList.add('hidden');
            if (handicapToggleContainer) {
                handicapToggleContainer.classList.add('hidden');
            }
        }
    }

    // MutationObserver verwenden um Änderungen an versteckten Feldern zu beobachten
    const observer = new MutationObserver(() => {
        calculateAndDisplayHandicap();
    });

    // Alle drei versteckten Felder beobachten
    observer.observe(partnerIdField, { attributes: true, attributeFilter: ['value'] });
    observer.observe(opponent1IdField, { attributes: true, attributeFilter: ['value'] });
    observer.observe(opponent2IdField, { attributes: true, attributeFilter: ['value'] });

    // Event-Listener für programmatische Wertänderung hinzufügen
    // Da MutationObserver nicht immer programmatische Wertänderungen erfasst,
    // we'll add a periodic check as a fallback
    let lastPartnerId = '';
    let lastOpponent1Id = '';
    let lastOpponent2Id = '';

    setInterval(() => {
        const currentPartnerId = partnerIdField.value;
        const currentOpponent1Id = opponent1IdField.value;
        const currentOpponent2Id = opponent2IdField.value;

        if (currentPartnerId !== lastPartnerId ||
            currentOpponent1Id !== lastOpponent1Id ||
            currentOpponent2Id !== lastOpponent2Id) {
            lastPartnerId = currentPartnerId;
            lastOpponent1Id = currentOpponent1Id;
            lastOpponent2Id = currentOpponent2Id;
            calculateAndDisplayHandicap();
        }
    }, 500); // Alle 500ms prüfen
}
