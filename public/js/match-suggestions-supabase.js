/**
 * Match-Vorschläge-Modul (Supabase-Version)
 * Bietet Gegner-Vorschläge basierend auf Match-Verlauf und Spieler-Bewertungen
 * Multi-Sport-Unterstützung: Filtert Vorschläge nach aktiver Sportart
 */

import { isAgeGroupFilter, filterPlayersByAgeGroup, isGenderFilter, filterPlayersByGender } from './ui-utils-supabase.js';
import { getSportContext } from './sport-context-supabase.js';

// Cache für Vereinsdaten
let clubsCache = null;
let clubsCacheTimestamp = null;
const CLUBS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Lädt alle Vereine und gibt sie als Map zurück (mit Caching)
 * @param {Object} supabase - Supabase-Client-Instanz
 * @returns {Promise<Map>} Map von clubId -> Vereinsdaten
 */
async function loadClubsMap(supabase) {
    // Gecachte Daten zurückgeben falls noch gültig
    if (clubsCache && clubsCacheTimestamp && (Date.now() - clubsCacheTimestamp) < CLUBS_CACHE_TTL) {
        return clubsCache;
    }

    try {
        const { data, error } = await supabase
            .from('clubs')
            .select('*');

        if (error) throw error;

        const clubsMap = new Map();
        (data || []).forEach(club => {
            clubsMap.set(club.id, {
                id: club.id,
                name: club.name,
                isTestClub: club.is_test_club
            });
        });

        // Cache aktualisieren
        clubsCache = clubsMap;
        clubsCacheTimestamp = Date.now();

        return clubsMap;
    } catch (error) {
        console.error('Error loading clubs:', error);
        // Bei Fehler leere Map zurückgeben
        return new Map();
    }
}

/**
 * Filtert Spieler basierend auf Datenschutz-Einstellungen (nur suchbare)
 * Hinweis: showInLeaderboards betrifft nur Ranglisten-Sichtbarkeit, nicht Match-Vorschläge
 * @param {Array} players - Array von Spieler-Objekten
 * @param {Object} currentUserData - Daten des aktuellen Benutzers (mit id, role, clubId)
 * @returns {Array} Gefilterte Spieler
 */
function filterPlayersByPrivacy(players, currentUserData) {
    return players.filter(player => {
        // Aktuellen Benutzer immer anzeigen
        if (player.id === currentUserData.id) return true;

        const privacySettings = player.privacySettings || {};
        const searchable = privacySettings.searchable || 'global';

        // Spieler anzeigen die global suchbar sind
        if (searchable === 'global') return true;

        // club_only: nur Spielern im selben Verein anzeigen
        if (searchable === 'club_only' && currentUserData.clubId === player.clubId) {
            return true;
        }

        return false;
    });
}

/**
 * Filtert Spieler aus Test-Vereinen aus (außer Betrachter ist aus Test-Verein)
 * @param {Array} players - Array von Spieler-Objekten
 * @param {Object} currentUserData - Daten des aktuellen Benutzers (mit id, role, clubId)
 * @param {Map} clubsMap - Map von clubId -> Vereinsdaten
 * @returns {Array} Gefilterte Spieler
 */
function filterTestClubPlayers(players, currentUserData, clubsMap) {
    // Prüfen ob Benutzer aus Test-Verein ist
    const currentUserClub = clubsMap.get(currentUserData.clubId);
    if (currentUserClub && currentUserClub.isTestClub) {
        // Test-Verein-Mitglieder sehen alle
        return players;
    }

    // Aktueller Benutzer ist NICHT aus Test-Verein
    // Alle Test-Verein-Spieler ausfiltern
    return players.filter(player => {
        // Aktuellen Benutzer immer anzeigen
        if (player.id === currentUserData.id) return true;

        // Spieler ohne Verein anzeigen
        if (!player.clubId) return true;

        // Vereinsdaten des Spielers abrufen
        const club = clubsMap.get(player.clubId);

        // Wenn Verein nicht existiert oder kein Test-Verein, Spieler anzeigen
        if (!club || !club.isTestClub) return true;

        // Spieler ist aus Test-Verein - von normalen Benutzern verstecken
        return false;
    });
}

/**
 * Mappt Spieler von Supabase (snake_case) zu App-Format (camelCase)
 */
function mapPlayerFromSupabase(player) {
    return {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        role: player.role,
        clubId: player.club_id,
        eloRating: player.elo_rating,
        doublesEloRating: player.doubles_elo_rating,
        subgroupIDs: player.subgroup_ids || [],
        privacySettings: player.privacy_settings || {}
    };
}

// ========================================================================
// ===== MATCH-VORSCHLÄGE-ALGORITHMUS =====
// ========================================================================

/**
 * Berechnet Match-Vorschläge für einen Spieler
 * Priorisiert Spieler gegen die noch nicht oder lange nicht gespielt wurde
 * @param {Object} userData - Aktuelle Benutzerdaten
 * @param {Array} allPlayers - Alle Spieler im Verein
 * @param {Object} supabase - Supabase-Client-Instanz
 * @returns {Promise<Array>} Array von vorgeschlagenen Spielern mit Prioritäts-Scores
 */
export async function calculateMatchSuggestions(userData, allPlayers, supabase) {
    try {
        // Berechtigte Spieler filtern (Spieler und Trainer)
        const eligiblePlayers = allPlayers.filter(p => {
            const isNotSelf = p.id !== userData.id;
            const isPlayerOrCoach = p.role === 'player' || p.role === 'coach' || p.role === 'head_coach';
            return isNotSelf && isPlayerOrCoach;
        });

        // Alle Matches des aktuellen Benutzers abrufen
        // Abfrage als playerA
        const { data: matchesAsA, error: errorA } = await supabase
            .from('matches')
            .select('*')
            .eq('player_a_id', userData.id);

        if (errorA) console.error('Error fetching matches as A:', errorA);

        // Abfrage als playerB
        const { data: matchesAsB, error: errorB } = await supabase
            .from('matches')
            .select('*')
            .eq('player_b_id', userData.id);

        if (errorB) console.error('Error fetching matches as B:', errorB);

        // Ergebnisse kombinieren und nach ID deduplizieren
        const allMatchDocs = new Map();
        [...(matchesAsA || []), ...(matchesAsB || [])].forEach(match => {
            allMatchDocs.set(match.id, match);
        });

        // Gegner-Verlauf erstellen
        const opponentHistory = {};
        allMatchDocs.forEach((match) => {
            const opponentId = match.player_a_id === userData.id ? match.player_b_id : match.player_a_id;

            if (!opponentHistory[opponentId]) {
                opponentHistory[opponentId] = {
                    matchCount: 0,
                    lastMatchDate: null,
                };
            }

            opponentHistory[opponentId].matchCount++;

            const matchDate = match.played_at ? new Date(match.played_at) :
                             match.created_at ? new Date(match.created_at) : null;
            if (
                matchDate &&
                (!opponentHistory[opponentId].lastMatchDate ||
                    matchDate > opponentHistory[opponentId].lastMatchDate)
            ) {
                opponentHistory[opponentId].lastMatchDate = matchDate;
            }
        });

        // Prioritäts-Score für jeden Spieler berechnen
        const now = new Date();

        const suggestions = eligiblePlayers.map(player => {
            const history = opponentHistory[player.id] || { matchCount: 0, lastMatchDate: null };
            const playerElo = player.eloRating || 1000;
            const myElo = userData.eloRating || 1000;
            const eloDiff = Math.abs(myElo - playerElo);

            let score = 100; // Base score

            // Factor 1: Never played = highest priority
            if (history.matchCount === 0) {
                score += 50;
            } else {
                // Factor 2: Fewer matches = higher priority
                score -= history.matchCount * 5;
            }

            // Factor 3: Time since last match (if played before)
            if (history.lastMatchDate) {
                const daysSinceLastMatch = (now - history.lastMatchDate) / (1000 * 60 * 60 * 24);
                score += Math.min(daysSinceLastMatch / 7, 30); // Bis zu +30 für 30+ Wochen
            }

            // NO ELO filtering - everyone should play against everyone

            return {
                ...player,
                suggestionScore: Math.max(0, score),
                history: history,
                eloDiff: eloDiff,
            };
        });

        // Nach Prioritäts-Score sortieren (höchster zuerst)
        suggestions.sort((a, b) => b.suggestionScore - a.suggestionScore);

        // Prüfen ob es Spieler gibt gegen die nie gespielt wurde
        const neverPlayedPlayers = suggestions.filter(s => s.history.matchCount === 0);

        if (neverPlayedPlayers.length > 0) {
            // Nur noch nie gespielte Spieler anzeigen (3-4 davon)
            return neverPlayedPlayers.slice(0, 4);
        } else {
            // Gegen alle Spieler bereits gespielt - zufällige 3-4 Vorschläge anzeigen
            const randomSuggestions = [...suggestions].sort(() => Math.random() - 0.5);
            return randomSuggestions.slice(0, 4);
        }
    } catch (error) {
        console.error('Error calculating match suggestions:', error);
        return [];
    }
}

// ========================================================================
// ===== LOAD AND RENDER MATCH SUGGESTIONS =====
// ========================================================================

/**
 * Loads and renders match suggestions
 * @param {Object} userData - Aktuelle Benutzerdaten
 * @param {Object} supabase - Supabase-Client-Instanz
 * @param {Array} unsubscribes - Array to store unsubscribe functions
 * @param {String} subgroupFilter - Filter nach Untergruppe ('club', 'global' oder Untergruppen-ID)
 */
export async function loadMatchSuggestions(
    userData,
    supabase,
    unsubscribes = [],
    subgroupFilter = 'club'
) {
    const container = document.getElementById('match-suggestions-list');
    if (!container) return;

    // Prüfen ob Spieler in Verein ist
    const hasClub = userData.clubId !== null && userData.clubId !== undefined;

    if (!hasClub) {
        container.innerHTML = `
      <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
            </svg>
          </div>
          <div class="ml-3">
            <p class="text-sm text-yellow-700">
              <strong>🔒 Match-Vorschläge nur für Vereinsmitglieder!</strong><br>
              Diese Funktion ist nur für Spieler verfügbar, die einem Verein angehören.
            </p>
          </div>
        </div>
      </div>
    `;
        return; // Frühzeitig beenden
    }

    container.innerHTML =
        '<p class="text-gray-500 text-center py-4"><i class="fas fa-spinner fa-spin mr-2"></i>Lade Vorschläge...</p>';

    console.log('[Match Suggestions] Loading with filter:', subgroupFilter);

    try {
        // Match-Vorschläge funktionieren nur in Club-Ansicht (nicht global)
        // Supabase erlaubt nur Lesen von Spielern im eigenen Verein
        if (subgroupFilter === 'global') {
            container.innerHTML = `
        <div class="bg-blue-50 border-l-4 border-blue-400 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-blue-700">
                <strong>ℹ️ Hinweis</strong><br>
                Gegnervorschläge sind nur in der Club-Ansicht verfügbar.
              </p>
            </div>
          </div>
        </div>
      `;
            return;
        }

        // Vereine-Map für Test-Verein-Filterung laden
        const clubsMap = await loadClubsMap(supabase);

        // Sport-Kontext abrufen (Single-Sport-Modell)
        const sportContext = await getSportContext(userData.id);
        const effectiveClubId = sportContext?.clubId || userData.clubId;
        const sportId = sportContext?.sportId;

        // Alle Spieler und Trainer basierend auf Filter abrufen
        let playersQuery = supabase
            .from('profiles')
            .select('*')
            .in('role', ['player', 'coach', 'head_coach'])
            .eq('club_id', effectiveClubId);

        // Nach Sportart filtern falls verfügbar
        if (sportId) {
            playersQuery = playersQuery.eq('active_sport_id', sportId);
            console.log('[Match Suggestions] Sport filter active:', sportId);
        }

        const { data: playersData, error: playersError } = await playersQuery;

        if (playersError) throw playersError;

        let allPlayers = (playersData || []).map(p => {
            const mapped = mapPlayerFromSupabase(p);
            mapped.clubId = p.club_id;
            return mapped;
        });

        console.log('[Match Suggestions] Players before filter:', allPlayers.length);
        console.log(
            '[Match Suggestions] Sample player subgroups:',
            allPlayers.slice(0, 3).map(p => ({ name: p.firstName, subgroupIDs: p.subgroupIDs }))
        );

        // Untergruppen-, Alters- oder Geschlechtsfilter in JavaScript anwenden
        // Hinweis: Spieler können in mehreren Untergruppen sein
        if (subgroupFilter !== 'club' && subgroupFilter !== 'global') {
            console.log('[Match Suggestions] Applying filter:', subgroupFilter);
            if (isAgeGroupFilter(subgroupFilter)) {
                allPlayers = filterPlayersByAgeGroup(allPlayers, subgroupFilter);
            } else if (isGenderFilter(subgroupFilter)) {
                allPlayers = filterPlayersByGender(allPlayers, subgroupFilter);
            } else {
                allPlayers = allPlayers.filter(player =>
                    (player.subgroupIDs || []).includes(subgroupFilter)
                );
            }
            console.log('[Match Suggestions] Players after filter:', allPlayers.length);
        }

        // Nach Datenschutz-Einstellungen filtern (suchbar)
        allPlayers = filterPlayersByPrivacy(allPlayers, userData);
        console.log('[Match Suggestions] Players after privacy filter:', allPlayers.length);

        // Test-Verein-Spieler filtern
        allPlayers = filterTestClubPlayers(allPlayers, userData, clubsMap);
        console.log('[Match Suggestions] Players after test club filter:', allPlayers.length);

        // Funktion zum Berechnen und Rendern von Vorschlägen
        const renderSuggestions = async () => {
            const suggestions = await calculateMatchSuggestions(userData, allPlayers, supabase);

            if (suggestions.length === 0) {
                container.innerHTML =
                    '<p class="text-gray-500 text-center py-4">Keine Vorschläge verfügbar</p>';
                return;
            }

            container.innerHTML = '';

            // Alle Vorschläge rendern (3-4 Spieler)
            suggestions.forEach(player => {
                const card = createSuggestionCard(player, userData);
                container.appendChild(card);
            });
        };

        // Initiales Rendern
        await renderSuggestions();

        // Auf Match-Änderungen hören um Vorschläge in Echtzeit zu aktualisieren
        const matchesSubscription = supabase
            .channel('match-suggestions')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'matches'
                },
                async (payload) => {
                    const match = payload.new || payload.old;
                    // Neu rendern wenn dieses Match den aktuellen Benutzer betrifft
                    if (match && (match.player_a_id === userData.id || match.player_b_id === userData.id)) {
                        await renderSuggestions();
                    }
                }
            )
            .subscribe();

        if (unsubscribes) {
            unsubscribes.push(matchesSubscription);
        }
    } catch (error) {
        console.error('Error loading match suggestions:', error);
        container.innerHTML =
            '<p class="text-red-500 text-center py-4">Fehler beim Laden der Vorschläge</p>';
    }
}

/**
 * Creates a suggestion card (view only, no actions)
 */
function createSuggestionCard(player, userData) {
    const div = document.createElement('div');
    div.className = 'bg-white border border-indigo-200 rounded-md p-2 shadow-sm';

    const myElo = userData.eloRating || 1000;
    const playerElo = player.eloRating || 1000;
    const eloDiff = Math.abs(myElo - playerElo);
    const neverPlayed = player.history.matchCount === 0;
    const lastPlayedStr = player.history.lastMatchDate
        ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' }).format(
              player.history.lastMatchDate
          )
        : null;

    // Handicap berechnen (gleiche Logik wie in player-matches.js)
    let handicapHTML = '';
    if (eloDiff >= 25) {
        const handicapPoints = Math.min(Math.round(eloDiff / 50), 10);
        const weakerPlayerIsMe = myElo < playerElo;
        const weakerPlayerName = weakerPlayerIsMe ? 'Du' : player.firstName;

        handicapHTML = `
      <div class="text-xs text-blue-600 mt-1">
        <i class="fas fa-balance-scale-right mr-1"></i>
        Handicap: ${weakerPlayerName} ${handicapPoints} Punkt${handicapPoints === 1 ? '' : 'e'}/Satz
      </div>
    `;
    }

    div.innerHTML = `
    <div class="flex justify-between items-center mb-1">
      <div class="flex-1">
        <p class="font-semibold text-gray-800 text-sm">${player.firstName} ${player.lastName}</p>
        <p class="text-xs text-gray-600">ELO: ${Math.round(playerElo)}</p>
      </div>
    </div>

    <div class="text-xs text-gray-600">
      ${
          neverPlayed
              ? '<span class="text-purple-700 font-medium"><i class="fas fa-star mr-1"></i>Noch nie gespielt</span>'
              : `${player.history.matchCount} Match${player.history.matchCount === 1 ? '' : 'es'}${lastPlayedStr ? `, zuletzt ${lastPlayedStr}` : ''}`
      }
    </div>
    ${handicapHTML}
  `;

    return div;
}
