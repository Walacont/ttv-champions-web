/**
 * Match-Workflow für SC Champions Prototyp
 * Verwaltet Einzel- und Doppelspiele
 */

import { supabase, getCurrentProfile, isCoach } from './supabase-client.js';
import {
    processMatch,
    getHandicapRecommendation,
    calculateDoublesEloChange,
    ELO_FLOOR
} from './elo.js';

// Match-Status
export const MATCH_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    REJECTED: 'rejected'
};

// ============================================
// EINZELSPIELE
// ============================================

/**
 * Erstellt ein neues Einzelspiel
 *
 * @param {Object} matchData - Spieldaten
 * @param {string} matchData.playerAId - ID Spieler A (Ersteller)
 * @param {string} matchData.playerBId - ID Spieler B (Gegner)
 * @param {Array} matchData.sets - Satzergebnisse [{player_a: 11, player_b: 9}, ...]
 * @param {string} matchData.winnerId - ID des Gewinners
 * @param {boolean} matchData.handicapUsed - Wurde Handicap verwendet?
 * @param {number} matchData.handicapPoints - Handicap-Punkte
 * @param {string} matchData.handicapForPlayer - Spieler mit Handicap
 * @returns {Promise<Object>} Ergebnis
 */
export async function createMatch(matchData) {
    const profile = getCurrentProfile();
    if (!profile) {
        return { success: false, error: 'Nicht eingeloggt' };
    }

    try {
        // Satzergebnis berechnen
        const playerASetsWon = matchData.sets.filter(s => s.player_a > s.player_b).length;
        const playerBSetsWon = matchData.sets.filter(s => s.player_b > s.player_a).length;

        // Gewinner bestimmen
        const winnerId = playerASetsWon > playerBSetsWon
            ? matchData.playerAId
            : matchData.playerBId;
        const loserId = winnerId === matchData.playerAId
            ? matchData.playerBId
            : matchData.playerAId;

        // Status: Coaches können direkt bestätigen
        const status = isCoach() ? MATCH_STATUS.CONFIRMED : MATCH_STATUS.PENDING;

        const insertData = {
            club_id: profile.club_id,
            player_a_id: matchData.playerAId,
            player_b_id: matchData.playerBId,
            winner_id: winnerId,
            loser_id: loserId,
            sets: matchData.sets,
            player_a_sets_won: playerASetsWon,
            player_b_sets_won: playerBSetsWon,
            handicap_used: matchData.handicapUsed || false,
            handicap_points: matchData.handicapPoints || 0,
            handicap_for_player: matchData.handicapForPlayer || null,
            status,
            created_by: profile.id,
            confirmed_by: isCoach() ? profile.id : null,
            played_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('matches')
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        // Benachrichtigung an Gegner senden (wenn nicht Coach)
        if (!isCoach()) {
            await createNotification(
                matchData.playerBId,
                'match_request',
                'Neue Spielanfrage',
                `${profile.first_name} ${profile.last_name} hat ein Spielergebnis eingetragen.`,
                { match_id: data.id }
            );
        }

        // Aktivitätsfeed aktualisieren (wenn bestätigt)
        if (status === MATCH_STATUS.CONFIRMED) {
            await createMatchActivityEntry(data);
        }

        return { success: true, match: data };
    } catch (error) {
        console.error('Fehler beim Erstellen des Spiels:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Bestätigt ein Spiel
 *
 * @param {string} matchId - Match-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function confirmMatch(matchId) {
    const profile = getCurrentProfile();
    if (!profile) {
        return { success: false, error: 'Nicht eingeloggt' };
    }

    try {
        // Spiel laden
        const { data: match, error: loadError } = await supabase
            .from('matches')
            .select('*')
            .eq('id', matchId)
            .single();

        if (loadError) throw loadError;

        // Prüfen, ob Spieler berechtigt ist
        if (match.player_b_id !== profile.id && !isCoach()) {
            return { success: false, error: 'Nicht berechtigt' };
        }

        // Status aktualisieren (Trigger übernimmt Elo-Berechnung)
        const { data, error } = await supabase
            .from('matches')
            .update({
                status: MATCH_STATUS.CONFIRMED,
                confirmed_by: profile.id
            })
            .eq('id', matchId)
            .select()
            .single();

        if (error) throw error;

        // Benachrichtigung an Ersteller
        await createNotification(
            match.created_by,
            'match_confirmed',
            'Spiel bestätigt',
            'Dein eingetragenes Spiel wurde bestätigt.',
            { match_id: matchId }
        );

        // Aktivitätsfeed
        await createMatchActivityEntry(data);

        return { success: true, match: data };
    } catch (error) {
        console.error('Fehler beim Bestätigen des Spiels:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lehnt ein Spiel ab
 *
 * @param {string} matchId - Match-ID
 * @param {string} reason - Ablehnungsgrund (optional)
 * @returns {Promise<Object>} Ergebnis
 */
export async function rejectMatch(matchId, reason = '') {
    const profile = getCurrentProfile();
    if (!profile) {
        return { success: false, error: 'Nicht eingeloggt' };
    }

    try {
        const { data: match, error: loadError } = await supabase
            .from('matches')
            .select('created_by, player_b_id')
            .eq('id', matchId)
            .single();

        if (loadError) throw loadError;

        // Prüfen, ob berechtigt
        if (match.player_b_id !== profile.id && !isCoach()) {
            return { success: false, error: 'Nicht berechtigt' };
        }

        const { error } = await supabase
            .from('matches')
            .update({ status: MATCH_STATUS.REJECTED })
            .eq('id', matchId);

        if (error) throw error;

        // Benachrichtigung
        await createNotification(
            match.created_by,
            'match_rejected',
            'Spiel abgelehnt',
            reason || 'Das Spielergebnis wurde abgelehnt.',
            { match_id: matchId }
        );

        return { success: true };
    } catch (error) {
        console.error('Fehler beim Ablehnen des Spiels:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lädt Spiele mit Filtern
 *
 * @param {Object} filters - Filter
 * @param {string} filters.playerId - Spieler-ID
 * @param {string} filters.clubId - Verein-ID
 * @param {string} filters.status - Status-Filter
 * @param {number} filters.limit - Limit
 * @returns {Promise<Array>} Spiele
 */
export async function getMatches(filters = {}) {
    let query = supabase
        .from('matches')
        .select(`
            *,
            player_a:player_a_id(id, first_name, last_name, elo_rating),
            player_b:player_b_id(id, first_name, last_name, elo_rating),
            winner:winner_id(id, first_name, last_name)
        `)
        .order('played_at', { ascending: false });

    if (filters.playerId) {
        query = query.or(`player_a_id.eq.${filters.playerId},player_b_id.eq.${filters.playerId}`);
    }

    if (filters.clubId) {
        query = query.eq('club_id', filters.clubId);
    }

    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    if (filters.limit) {
        query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden der Spiele:', error);
        return [];
    }

    return data;
}

/**
 * Lädt ausstehende Spielanfragen für den aktuellen Benutzer
 *
 * @returns {Promise<Array>} Ausstehende Spiele
 */
export async function getPendingMatchRequests() {
    const profile = getCurrentProfile();
    if (!profile) return [];

    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            player_a:player_a_id(id, first_name, last_name, elo_rating),
            player_b:player_b_id(id, first_name, last_name, elo_rating)
        `)
        .eq('player_b_id', profile.id)
        .eq('status', MATCH_STATUS.PENDING)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fehler beim Laden der Anfragen:', error);
        return [];
    }

    return data;
}

// ============================================
// DOPPELSPIELE
// ============================================

/**
 * Erstellt ein Doppelspiel
 *
 * @param {Object} matchData - Doppel-Spieldaten
 * @returns {Promise<Object>} Ergebnis
 */
export async function createDoublesMatch(matchData) {
    const profile = getCurrentProfile();
    if (!profile) {
        return { success: false, error: 'Nicht eingeloggt' };
    }

    try {
        // Satzergebnis berechnen
        const teamASetsWon = matchData.sets.filter(s => s.team_a > s.team_b).length;
        const teamBSetsWon = matchData.sets.filter(s => s.team_b > s.team_a).length;
        const winningTeam = teamASetsWon > teamBSetsWon ? 'A' : 'B';

        const status = isCoach() ? MATCH_STATUS.CONFIRMED : MATCH_STATUS.PENDING;

        const insertData = {
            club_id: profile.club_id,
            team_a_player1_id: matchData.teamA[0],
            team_a_player2_id: matchData.teamA[1],
            team_b_player1_id: matchData.teamB[0],
            team_b_player2_id: matchData.teamB[1],
            winning_team: winningTeam,
            sets: matchData.sets,
            team_a_sets_won: teamASetsWon,
            team_b_sets_won: teamBSetsWon,
            status,
            created_by: profile.id,
            confirmed_by: isCoach() ? profile.id : null,
            played_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('doubles_matches')
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;

        // Bei Bestätigung: Doppel-Elo aktualisieren
        if (status === MATCH_STATUS.CONFIRMED) {
            await updateDoublesElo(data);
        }

        return { success: true, match: data };
    } catch (error) {
        console.error('Fehler beim Erstellen des Doppelspiels:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Aktualisiert Doppel-Elo für beide Teams
 *
 * @param {Object} match - Doppel-Match
 */
async function updateDoublesElo(match) {
    // Team-Elos holen/erstellen
    const teamAElo = await getOrCreateDoublesTeam(
        match.team_a_player1_id,
        match.team_a_player2_id
    );
    const teamBElo = await getOrCreateDoublesTeam(
        match.team_b_player1_id,
        match.team_b_player2_id
    );

    const teamAWon = match.winning_team === 'A';

    // Elo-Änderungen berechnen
    const changeA = calculateDoublesEloChange(
        teamAElo.elo_rating,
        teamBElo.elo_rating,
        teamAWon,
        teamAElo.matches_played
    );
    const changeB = calculateDoublesEloChange(
        teamBElo.elo_rating,
        teamAElo.elo_rating,
        !teamAWon,
        teamBElo.matches_played
    );

    // Team A aktualisieren
    await supabase
        .from('doubles_teams')
        .update({
            elo_rating: Math.max(ELO_FLOOR, teamAElo.elo_rating + changeA),
            matches_played: teamAElo.matches_played + 1,
            wins: teamAElo.wins + (teamAWon ? 1 : 0),
            losses: teamAElo.losses + (teamAWon ? 0 : 1)
        })
        .eq('id', teamAElo.id);

    // Team B aktualisieren
    await supabase
        .from('doubles_teams')
        .update({
            elo_rating: Math.max(ELO_FLOOR, teamBElo.elo_rating + changeB),
            matches_played: teamBElo.matches_played + 1,
            wins: teamBElo.wins + (!teamAWon ? 1 : 0),
            losses: teamBElo.losses + (!teamAWon ? 0 : 1)
        })
        .eq('id', teamBElo.id);

    // Match mit Elo-Änderung aktualisieren
    await supabase
        .from('doubles_matches')
        .update({ elo_change: Math.abs(changeA) })
        .eq('id', match.id);
}

/**
 * Holt oder erstellt ein Doppel-Team
 */
async function getOrCreateDoublesTeam(player1Id, player2Id) {
    // IDs sortieren für konsistente Speicherung
    const [p1, p2] = [player1Id, player2Id].sort();

    const { data: existing } = await supabase
        .from('doubles_teams')
        .select('*')
        .eq('player1_id', p1)
        .eq('player2_id', p2)
        .single();

    if (existing) return existing;

    // Neues Team erstellen
    const { data: newTeam, error } = await supabase
        .from('doubles_teams')
        .insert({
            player1_id: p1,
            player2_id: p2,
            elo_rating: 800,
            matches_played: 0,
            wins: 0,
            losses: 0
        })
        .select()
        .single();

    if (error) {
        console.error('Fehler beim Erstellen des Doppel-Teams:', error);
        return { elo_rating: 800, matches_played: 0, wins: 0, losses: 0 };
    }

    return newTeam;
}

// ============================================
// HEAD-TO-HEAD
// ============================================

/**
 * Holt Head-to-Head Statistik zwischen zwei Spielern
 *
 * @param {string} player1Id - Spieler 1
 * @param {string} player2Id - Spieler 2
 * @returns {Promise<Object>} H2H-Statistik
 */
export async function getHeadToHead(player1Id, player2Id) {
    // IDs sortieren
    const [p1, p2] = [player1Id, player2Id].sort();

    const { data, error } = await supabase
        .from('head_to_head')
        .select('*')
        .eq('player1_id', p1)
        .eq('player2_id', p2)
        .single();

    if (error || !data) {
        return {
            player1_wins: 0,
            player2_wins: 0,
            consecutive_wins: 0,
            last_winner_id: null
        };
    }

    // Ergebnis so formatieren, dass es den ursprünglichen Spieler-IDs entspricht
    if (p1 === player1Id) {
        return data;
    } else {
        return {
            ...data,
            player1_wins: data.player2_wins,
            player2_wins: data.player1_wins
        };
    }
}

/**
 * Holt Handicap-Empfehlung zwischen zwei Spielern
 *
 * @param {string} playerAId - Spieler A
 * @param {string} playerBId - Spieler B
 * @returns {Promise<Object>} Handicap-Empfehlung
 */
export async function getMatchHandicap(playerAId, playerBId) {
    // Spieler-Daten laden
    const { data: players, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, elo_rating')
        .in('id', [playerAId, playerBId]);

    if (error || players.length !== 2) {
        return { recommended: false, handicapPoints: 0 };
    }

    const playerA = players.find(p => p.id === playerAId);
    const playerB = players.find(p => p.id === playerBId);

    // H2H-Stats laden
    const h2hStats = await getHeadToHead(playerAId, playerBId);

    return getHandicapRecommendation(playerA, playerB, h2hStats);
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

/**
 * Erstellt eine Benachrichtigung
 */
async function createNotification(userId, type, title, message, data = {}) {
    await supabase
        .from('notifications')
        .insert({
            user_id: userId,
            type,
            title,
            message,
            data
        });
}

/**
 * Erstellt einen Aktivitätsfeed-Eintrag für ein Match
 */
async function createMatchActivityEntry(match) {
    await supabase
        .from('activity_feed')
        .insert({
            club_id: match.club_id,
            user_id: match.winner_id,
            type: 'match_result',
            data: {
                match_id: match.id,
                winner_id: match.winner_id,
                loser_id: match.loser_id,
                player_a_sets: match.player_a_sets_won,
                player_b_sets: match.player_b_sets_won,
                elo_change: match.elo_change
            }
        });
}

/**
 * Validiert Satzergebnisse
 *
 * @param {Array} sets - Satzergebnisse
 * @returns {Object} Validierungsergebnis
 */
export function validateSetScores(sets) {
    if (!sets || sets.length === 0) {
        return { valid: false, error: 'Keine Sätze angegeben' };
    }

    for (let i = 0; i < sets.length; i++) {
        const set = sets[i];

        // Mindestens 11 Punkte zum Gewinnen
        if (set.player_a < 11 && set.player_b < 11) {
            return { valid: false, error: `Satz ${i + 1}: Mindestens 11 Punkte zum Gewinnen` };
        }

        // Bei 10:10 muss mit 2 Punkten Vorsprung gewonnen werden
        if (set.player_a >= 10 && set.player_b >= 10) {
            if (Math.abs(set.player_a - set.player_b) !== 2) {
                return { valid: false, error: `Satz ${i + 1}: Bei Verlängerung 2 Punkte Vorsprung nötig` };
            }
        }

        // Gewinner muss genau 11 haben (oder 2 mehr bei Verlängerung)
        const winner = Math.max(set.player_a, set.player_b);
        const loser = Math.min(set.player_a, set.player_b);

        if (loser < 10 && winner !== 11) {
            return { valid: false, error: `Satz ${i + 1}: Satz endet bei 11 Punkten` };
        }
    }

    // Mindestens ein Spieler muss gewonnen haben
    const playerASets = sets.filter(s => s.player_a > s.player_b).length;
    const playerBSets = sets.filter(s => s.player_b > s.player_a).length;

    if (playerASets === playerBSets) {
        return { valid: false, error: 'Unentschieden nicht möglich' };
    }

    return { valid: true };
}

/**
 * Formatiert ein Spielergebnis für die Anzeige
 *
 * @param {Object} match - Match-Objekt
 * @returns {string} Formatiertes Ergebnis
 */
export function formatMatchResult(match) {
    const sets = match.sets || [];
    const setScores = sets.map(s => `${s.player_a}:${s.player_b}`).join(', ');

    return `${match.player_a_sets_won}:${match.player_b_sets_won} (${setScores})`;
}
