// Tournaments Module - Supabase Version
// SC Champions - Tournament System

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

function showToast(message, type = 'info') {
    const colors = {
        info: 'bg-indigo-600',
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600'
    };
    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

let currentTournamentId = null;
let currentUserId = null;
let currentClubId = null;
let currentSportId = null;
let tournamentSubscriptions = [];

export function initTournaments(userId, clubId, sportId) {
    console.log('[Tournaments] Initializing...', { userId, clubId, sportId });
    currentUserId = userId;
    currentClubId = clubId;
    currentSportId = sportId;
    setupRealtimeSubscriptions();
}

function setupRealtimeSubscriptions() {
    tournamentSubscriptions.forEach(sub => supabase.removeChannel(sub));
    tournamentSubscriptions = [];

    const tournamentsChannel = supabase
        .channel('tournaments_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tournaments' }, () => {
            if (window.tournamentUIRefresh) window.tournamentUIRefresh();
        })
        .subscribe();

    const participantsChannel = supabase
        .channel('tournament_participants_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_participants' }, () => {
            if (window.tournamentUIRefresh) window.tournamentUIRefresh();
            if (window.currentTournamentDetailsId && window.refreshTournamentDetails) {
                window.refreshTournamentDetails(window.currentTournamentDetailsId);
            }
        })
        .subscribe();

    tournamentSubscriptions.push(tournamentsChannel, participantsChannel);
}

export function getCurrentUserId() {
    return currentUserId;
}

function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export async function createTournament(tournamentData) {
    try {
        const {
            name, description = '', format = 'round_robin', matchMode = 'best-of-5', maxParticipants,
            isOpen = true, isClubOnly = false, withHandicap = false,
            isLive = false, matchDeadlineDays = 7, startDate = null, registrationDeadline = null
        } = tournamentData;

        if (!name || !maxParticipants) throw new Error('Name und Teilnehmerzahl sind erforderlich');
        if (!currentClubId || !currentSportId) throw new Error('Kein Verein oder Sportart ausgewählt');
        if (format === 'round_robin' && maxParticipants > 16) throw new Error('Jeder gegen Jeden ist nur bis 16 Spieler möglich');
        if (format === 'double_elimination' && maxParticipants > 16) throw new Error('Doppel-K.O. ist nur bis 16 Spieler möglich');

        const joinCode = !isOpen ? generateJoinCode() : null;

        const { data, error } = await supabase
            .from('tournaments')
            .insert({
                name, description, club_id: currentClubId, sport_id: currentSportId,
                format, match_mode: matchMode, max_participants: maxParticipants, is_open: isOpen,
                is_club_only: isClubOnly, join_code: joinCode, with_handicap: withHandicap,
                is_live: isLive, match_deadline_days: matchDeadlineDays,
                status: 'registration', start_date: startDate,
                registration_deadline: registrationDeadline, created_by: currentUserId
            })
            .select()
            .single();

        if (error) throw error;

        if (!isOpen && joinCode) {
            showToast(`Turnier erstellt! Einladungscode: ${joinCode}`, 'success');
        } else {
            showToast('Turnier erfolgreich erstellt!', 'success');
        }

        return data;
    } catch (error) {
        console.error('[Tournaments] Error creating tournament:', error);
        showToast('Fehler beim Erstellen des Turniers: ' + error.message, 'error');
        throw error;
    }
}

export async function joinTournament(tournamentId, joinCode = null) {
    try {
        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments').select('*').eq('id', tournamentId).single();
        if (tournamentError) throw tournamentError;
        if (!tournament) throw new Error('Turnier nicht gefunden');
        if (tournament.status !== 'registration') throw new Error('Anmeldung für dieses Turnier ist nicht mehr möglich');
        if (tournament.participant_count >= tournament.max_participants) throw new Error('Turnier ist bereits voll');

        const isCreator = tournament.created_by === currentUserId;
        if (!tournament.is_open && !isCreator) {
            if (!joinCode || joinCode.toUpperCase() !== tournament.join_code) throw new Error('Ungültiger Einladungscode');
        }

        const { data: existing } = await supabase
            .from('tournament_participants').select('id').eq('tournament_id', tournamentId).eq('player_id', currentUserId).maybeSingle();
        if (existing) throw new Error('Du bist bereits für dieses Turnier angemeldet');

        const { data: profile } = await supabase.from('profiles').select('elo_rating').eq('id', currentUserId).single();

        const { data, error } = await supabase
            .from('tournament_participants')
            .insert({ tournament_id: tournamentId, player_id: currentUserId, elo_at_registration: profile?.elo_rating || 800 })
            .select().single();

        if (error) throw error;
        showToast('Erfolgreich für Turnier angemeldet!', 'success');
        return data;
    } catch (error) {
        console.error('[Tournaments] Error joining tournament:', error);
        showToast('Fehler beim Beitreten: ' + error.message, 'error');
        throw error;
    }
}

export async function leaveTournament(tournamentId) {
    try {
        const { data: tournament } = await supabase.from('tournaments').select('status').eq('id', tournamentId).single();
        if (tournament?.status === 'in_progress' || tournament?.status === 'completed') {
            throw new Error('Du kannst ein laufendes oder abgeschlossenes Turnier nicht verlassen');
        }
        const { error } = await supabase.from('tournament_participants').delete().eq('tournament_id', tournamentId).eq('player_id', currentUserId);
        if (error) throw error;
        showToast('Turnier erfolgreich verlassen', 'success');
    } catch (error) {
        console.error('[Tournaments] Error leaving tournament:', error);
        showToast('Fehler beim Verlassen: ' + error.message, 'error');
        throw error;
    }
}

export async function deleteTournament(tournamentId) {
    try {
        const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);
        if (error) throw error;
        showToast('Turnier erfolgreich gelöscht', 'success');
    } catch (error) {
        console.error('[Tournaments] Error deleting tournament:', error);
        showToast('Fehler beim Löschen: ' + error.message, 'error');
        throw error;
    }
}

export async function startTournament(tournamentId) {
    try {
        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('*, tournament_participants(id, player_id, seed, elo_at_registration)')
            .eq('id', tournamentId).single();
        if (tournamentError) throw tournamentError;
        if (tournament.created_by !== currentUserId) throw new Error('Nur der Turnier-Ersteller kann das Turnier starten');
        if (tournament.status !== 'registration') throw new Error('Turnier kann nur aus dem Anmeldestatus gestartet werden');

        const participantCount = tournament.tournament_participants?.length || 0;
        if (participantCount < 2) throw new Error('Mindestens 2 Teilnehmer erforderlich');

        // Set status FIRST to prevent double-start
        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ status: 'in_progress', started_at: new Date().toISOString() })
            .eq('id', tournamentId)
            .eq('status', 'registration'); // Only update if still in registration
        if (updateError) throw updateError;

        await assignSeeds(tournamentId);

        if (tournament.format === 'round_robin') {
            await generateRoundRobinMatches(tournamentId);
        } else if (tournament.format === 'double_elimination' || tournament.format === 'double_elim_32') {
            await generateDoubleEliminationMatches(tournamentId);
        } else {
            throw new Error(`Format ${tournament.format} wird noch nicht unterstützt`);
        }

        showToast('Turnier gestartet! Matches wurden generiert.', 'success');
        return true;
    } catch (error) {
        console.error('[Tournaments] Error starting tournament:', error);
        showToast('Fehler beim Starten: ' + error.message, 'error');
        throw error;
    }
}

export async function regeneratePairings(tournamentId) {
    try {
        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('*, tournament_participants(id, player_id, seed, elo_at_registration)')
            .eq('id', tournamentId).single();
        if (tournamentError) throw tournamentError;
        if (tournament.created_by !== currentUserId) throw new Error('Nur der Turnier-Ersteller kann die Paarungen neu generieren');
        if (tournament.status !== 'in_progress') throw new Error('Turnier muss gestartet sein');

        const { error: delMatchErr } = await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);
        if (delMatchErr) throw new Error('Spiele konnten nicht gelöscht werden: ' + delMatchErr.message);

        const { error: delStandErr } = await supabase.from('tournament_standings').delete().eq('tournament_id', tournamentId);
        if (delStandErr) throw new Error('Tabelle konnte nicht gelöscht werden: ' + delStandErr.message);

        // Verify deletion actually worked (RLS might silently block DELETE)
        const { data: remaining } = await supabase.from('tournament_matches').select('id').eq('tournament_id', tournamentId).limit(1);
        if (remaining && remaining.length > 0) {
            throw new Error('Alte Spiele konnten nicht gelöscht werden. Bitte DELETE-Policies in der Datenbank prüfen.');
        }

        await assignSeeds(tournamentId);
        if (tournament.format === 'round_robin') {
            await generateRoundRobinMatches(tournamentId);
        } else if (tournament.format === 'double_elimination' || tournament.format === 'double_elim_32') {
            await generateDoubleEliminationMatches(tournamentId);
        }

        showToast('Paarungen erfolgreich neu generiert!', 'success');
        return true;
    } catch (error) {
        console.error('[Tournaments] Error regenerating pairings:', error);
        showToast('Fehler beim Neu-Generieren: ' + error.message, 'error');
        throw error;
    }
}

async function assignSeeds(tournamentId) {
    const { data: participants, error } = await supabase
        .from('tournament_participants').select('id, elo_at_registration')
        .eq('tournament_id', tournamentId).order('elo_at_registration', { ascending: false });
    if (error) throw error;

    for (let i = 0; i < participants.length; i++) {
        await supabase.from('tournament_participants').update({ seed: i + 1 }).eq('id', participants[i].id);
    }
}

async function generateRoundRobinMatches(tournamentId) {
    // Safety: remove any existing matches before generating (prevents duplicates)
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);

    const { data: participants, error } = await supabase
        .from('tournament_participants').select('player_id, seed')
        .eq('tournament_id', tournamentId).order('seed', { ascending: true });
    if (error) throw error;

    const playerIds = participants.map(p => p.player_id);
    const n = playerIds.length;
    const matches = [];

    const hasOddPlayers = n % 2 === 1;
    const totalPlayers = hasOddPlayers ? n + 1 : n;
    const numRounds = totalPlayers - 1;

    const positions = [];
    for (let i = 0; i < n; i++) positions.push(i);
    if (hasOddPlayers) positions.push(null);

    for (let round = 0; round < numRounds; round++) {
        const halfSize = totalPlayers / 2;
        for (let i = 0; i < halfSize; i++) {
            const player1 = positions[i];
            const player2 = positions[totalPlayers - 1 - i];

            if (player1 !== null && player2 !== null) {
                matches.push({
                    tournament_id: tournamentId, round_number: round + 1,
                    match_number: matches.length + 1,
                    player_a_id: playerIds[player1], player_b_id: playerIds[player2],
                    status: 'pending'
                });
            } else {
                const playerWithBye = player1 !== null ? player1 : player2;
                if (playerWithBye !== null) {
                    matches.push({
                        tournament_id: tournamentId, round_number: round + 1,
                        match_number: matches.length + 1,
                        player_a_id: playerIds[playerWithBye], player_b_id: null,
                        status: 'completed', winner_id: playerIds[playerWithBye]
                    });
                }
            }
        }

        if (round < numRounds - 1) {
            const last = positions[positions.length - 1];
            for (let j = positions.length - 1; j > 1; j--) positions[j] = positions[j - 1];
            positions[1] = last;
        }
    }

    const { error: insertError } = await supabase.from('tournament_matches').insert(matches);
    if (insertError) throw insertError;

    const standings = participants.map(p => ({
        tournament_id: tournamentId, round_id: null, player_id: p.player_id
    }));
    const { error: standingsError } = await supabase
        .from('tournament_standings')
        .upsert(standings, { onConflict: 'tournament_id,round_id,player_id', ignoreDuplicates: false });
    if (standingsError) throw standingsError;

    return matches;
}

/**
 * Generate Double Elimination bracket matches
 * Supports 4, 8, and 16 players
 */
async function generateDoubleEliminationMatches(tournamentId) {
    // Safety: remove any existing matches before generating
    await supabase.from('tournament_matches').delete().eq('tournament_id', tournamentId);

    const { data: participants, error } = await supabase
        .from('tournament_participants').select('player_id, seed')
        .eq('tournament_id', tournamentId).order('seed', { ascending: true });
    if (error) throw error;

    const n = participants.length;
    if (n < 2) throw new Error('Mindestens 2 Teilnehmer erforderlich');

    // Find next power of 2
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
    if (bracketSize > 16) throw new Error('Double Elimination unterstuetzt maximal 16 Spieler');

    const playerIds = participants.map(p => p.player_id);
    const matches = [];

    // Seed players into bracket positions
    const seedOrder = generateSeedOrder(bracketSize);

    // ============ WINNERS BRACKET ============
    const winnersRounds = Math.log2(bracketSize);
    let matchNumber = 1;

    // Generate all Winners Bracket rounds
    for (let round = 1; round <= winnersRounds; round++) {
        const matchesInRound = bracketSize / Math.pow(2, round);
        for (let pos = 1; pos <= matchesInRound; pos++) {
            let player1 = null, player2 = null;

            // Only Round 1 has initial players
            if (round === 1) {
                const idx = (pos - 1) * 2;
                const seed1 = seedOrder[idx];
                const seed2 = seedOrder[idx + 1];
                player1 = seed1 <= n ? playerIds[seed1 - 1] : null;
                player2 = seed2 <= n ? playerIds[seed2 - 1] : null;
            }

            const isBye = round === 1 && (!player1 || !player2);
            matches.push({
                tournament_id: tournamentId,
                round_number: round,
                match_number: matchNumber++,
                bracket_type: 'winners',
                bracket_position: pos,
                player_a_id: player1,
                player_b_id: player2,
                status: isBye ? 'completed' : 'pending',
                winner_id: isBye ? (player1 || player2) : null
            });
        }
    }

    // ============ LOSERS BRACKET ============
    // For bracketSize players, Losers Bracket has (2 * winnersRounds - 2) rounds
    // Structure:
    //   - Odd rounds (1,3,5...): Winners from previous LB round play losers dropping from WB
    //   - Even rounds (2,4,6...): LB matches between survivors
    const losersRounds = 2 * (winnersRounds - 1);

    for (let round = 1; round <= losersRounds; round++) {
        // Calculate matches per round
        // Round 1: bracketSize/4 matches (losers from WB R1)
        // Round 2: bracketSize/4 matches (survivors from LB R1)
        // Round 3: bracketSize/8 matches (LB R2 winners + WB R2 losers)
        // etc.
        const matchesInRound = Math.max(1, bracketSize / Math.pow(2, Math.floor((round + 3) / 2)));

        for (let pos = 1; pos <= matchesInRound; pos++) {
            matches.push({
                tournament_id: tournamentId,
                round_number: round,
                match_number: matchNumber++,
                bracket_type: 'losers',
                bracket_position: pos,
                player_a_id: null,
                player_b_id: null,
                status: 'pending'
            });
        }
    }

    // ============ GRAND FINALS ============
    matches.push({
        tournament_id: tournamentId,
        round_number: 1,
        match_number: matchNumber++,
        bracket_type: 'finals',
        bracket_position: 1,
        player_a_id: null, // Winners bracket champion
        player_b_id: null, // Losers bracket champion
        status: 'pending'
    });

    // Grand Finals Reset (if losers champion wins first finals)
    matches.push({
        tournament_id: tournamentId,
        round_number: 2,
        match_number: matchNumber++,
        bracket_type: 'grand_finals',
        bracket_position: 1,
        player_a_id: null,
        player_b_id: null,
        status: 'pending'
    });

    // Insert all matches
    const { error: insertError } = await supabase.from('tournament_matches').insert(matches);
    if (insertError) throw insertError;

    // Process byes - advance players who got a bye in round 1
    await processDoubleEliminationByes(tournamentId);

    // Create standings entries
    const standings = participants.map(p => ({
        tournament_id: tournamentId, round_id: null, player_id: p.player_id
    }));
    const { error: standingsError } = await supabase
        .from('tournament_standings')
        .upsert(standings, { onConflict: 'tournament_id,round_id,player_id', ignoreDuplicates: false });
    if (standingsError) throw standingsError;

    return matches;
}

/**
 * Generate standard seeding order for bracket
 * Returns array of seeds in bracket order (e.g., for 8: [1,8,4,5,2,7,3,6])
 */
function generateSeedOrder(bracketSize) {
    if (bracketSize === 2) return [1, 2];
    if (bracketSize === 4) return [1, 4, 2, 3];
    if (bracketSize === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
    if (bracketSize === 16) return [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];
    // Fallback for other sizes
    const order = [];
    for (let i = 1; i <= bracketSize; i++) order.push(i);
    return order;
}

/**
 * Process byes in Double Elimination - advance players who had no opponent
 * Behandelt Byes in beiden Brackets (Winners und Losers)
 */
async function processDoubleEliminationByes(tournamentId) {
    // 1. Verarbeite WB R1 Byes - Spieler ohne Gegner rücken vor
    const { data: wbByeMatches, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('bracket_type', 'winners')
        .eq('round_number', 1)
        .eq('status', 'completed');

    if (error || !wbByeMatches) return;

    for (const byeMatch of wbByeMatches) {
        if (byeMatch.winner_id) {
            await advanceDoubleEliminationWinner(tournamentId, byeMatch, byeMatch.winner_id);
        }
    }

    // 2. Markiere LB R1 Matches die keine Spieler bekommen werden als "skipped"
    // (passiert wenn zu viele Byes im WB sind)
    // Bei bracketSize 8 mit 5 Spielern: 3 Byes in WB R1 -> nur 2 Verlierer für 2 LB R1 Matches
    // Aber einer der LB R1 Matches könnte leer bleiben

    // Zähle wie viele echte WB R1 Matches es gab (ohne Byes)
    const { data: allWbR1 } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('bracket_type', 'winners')
        .eq('round_number', 1);

    const realWbR1Matches = allWbR1?.filter(m => m.player_a_id && m.player_b_id).length || 0;
    const expectedLbR1Losers = realWbR1Matches; // Jedes echte WB R1 Match produziert einen Verlierer

    // Hole LB R1 Matches
    const { data: lbR1Matches } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('bracket_type', 'losers')
        .eq('round_number', 1)
        .order('bracket_position', { ascending: true });

    if (!lbR1Matches || lbR1Matches.length === 0) return;

    // Berechne wie viele LB R1 Matches wirklich gespielt werden können
    // Jedes LB R1 Match braucht 2 Verlierer aus WB R1
    const playableLbR1Matches = Math.floor(expectedLbR1Losers / 2);

    // Markiere überzählige LB R1 Matches als skipped
    for (let i = playableLbR1Matches; i < lbR1Matches.length; i++) {
        const match = lbR1Matches[i];
        if (match.status === 'pending' && !match.player_a_id && !match.player_b_id) {
            await supabase
                .from('tournament_matches')
                .update({ status: 'skipped' })
                .eq('id', match.id);
        }
    }

    // 3. Prüfe ob es ungerade Anzahl von Verlierern gibt -> ein LB R1 Match ist ein Bye
    // Das passiert wenn expectedLbR1Losers ungerade ist
    if (expectedLbR1Losers % 2 === 1 && expectedLbR1Losers > 0) {
        // Ein LB R1 Match wird nur einen Spieler haben
        // Die WB R1 Matches müssen erst abgeschlossen werden bevor wir das wissen
        // Also markieren wir hier nichts - das wird nach den ersten WB R1 Matches passieren
    }
}

/**
 * Advance winner to next match in Double Elimination
 */
async function advanceDoubleEliminationWinner(tournamentId, completedMatch, winnerId) {
    const bracketType = completedMatch.bracket_type;
    const roundNumber = completedMatch.round_number;
    const bracketPosition = completedMatch.bracket_position;

    // Get bracket info to calculate total rounds
    const { data: allMatches } = await supabase
        .from('tournament_matches')
        .select('bracket_type, round_number')
        .eq('tournament_id', tournamentId);

    const winnersRounds = Math.max(...allMatches.filter(m => m.bracket_type === 'winners').map(m => m.round_number));
    const losersRounds = Math.max(...allMatches.filter(m => m.bracket_type === 'losers').map(m => m.round_number));

    if (bracketType === 'winners') {
        // Check if this is the Winners Bracket Final
        if (roundNumber === winnersRounds) {
            // Winner goes to Grand Finals as player_a
            await supabase
                .from('tournament_matches')
                .update({ player_a_id: winnerId })
                .eq('tournament_id', tournamentId)
                .eq('bracket_type', 'finals');
        } else {
            // Advance to next winners bracket round
            const nextRound = roundNumber + 1;
            const nextPosition = Math.ceil(bracketPosition / 2);
            const isSlotA = bracketPosition % 2 === 1;

            await supabase
                .from('tournament_matches')
                .update({ [isSlotA ? 'player_a_id' : 'player_b_id']: winnerId })
                .eq('tournament_id', tournamentId)
                .eq('bracket_type', 'winners')
                .eq('round_number', nextRound)
                .eq('bracket_position', nextPosition);
        }
    } else if (bracketType === 'losers') {
        // Check if this is the Losers Bracket Final
        if (roundNumber === losersRounds) {
            // Winner goes to Grand Finals as player_b
            await supabase
                .from('tournament_matches')
                .update({ player_b_id: winnerId })
                .eq('tournament_id', tournamentId)
                .eq('bracket_type', 'finals');
        } else {
            // Advance in losers bracket
            const nextRound = roundNumber + 1;

            // In LB, even rounds halve the matches, odd rounds don't
            let nextPosition;
            if (roundNumber % 2 === 0) {
                // Even round -> next is odd, positions halve
                nextPosition = Math.ceil(bracketPosition / 2);
            } else {
                // Odd round -> next is even, same number of positions
                nextPosition = bracketPosition;
            }

            const { data: nextMatches } = await supabase
                .from('tournament_matches')
                .select('*')
                .eq('tournament_id', tournamentId)
                .eq('bracket_type', 'losers')
                .eq('round_number', nextRound)
                .order('bracket_position', { ascending: true });

            if (nextMatches && nextMatches.length > 0) {
                // Find slot based on position
                const targetMatch = nextMatches.find(m => m.bracket_position === nextPosition) || nextMatches[0];
                if (targetMatch) {
                    const updateField = targetMatch.player_a_id ? 'player_b_id' : 'player_a_id';
                    await supabase
                        .from('tournament_matches')
                        .update({ [updateField]: winnerId })
                        .eq('id', targetMatch.id);
                }
            }
        }
    } else if (bracketType === 'finals') {
        // Grand Finals (erstes Finale) abgeschlossen
        // Prüfe ob LB-Champion (player_b) gewonnen hat - wenn ja, Bracket Reset nötig
        const { data: finalsMatch } = await supabase
            .from('tournament_matches')
            .select('player_a_id, player_b_id, winner_id')
            .eq('tournament_id', tournamentId)
            .eq('bracket_type', 'finals')
            .single();

        if (finalsMatch) {
            if (finalsMatch.winner_id === finalsMatch.player_b_id) {
                // LB-Champion hat gewonnen -> Bracket Reset erforderlich!
                // Beide Spieler haben jetzt je eine Niederlage
                await supabase
                    .from('tournament_matches')
                    .update({
                        player_a_id: finalsMatch.player_a_id,  // WB-Champion
                        player_b_id: finalsMatch.player_b_id   // LB-Champion
                    })
                    .eq('tournament_id', tournamentId)
                    .eq('bracket_type', 'grand_finals');
            } else {
                // WB-Champion hat gewonnen -> Turnier beendet, kein Reset nötig
                // LB-Champion hat jetzt 2 Niederlagen
                await supabase
                    .from('tournament_matches')
                    .update({
                        status: 'skipped',
                        winner_id: finalsMatch.winner_id  // WB-Champion ist Turniersieger
                    })
                    .eq('tournament_id', tournamentId)
                    .eq('bracket_type', 'grand_finals');
            }
        }
    }
}

/**
 * Drop loser to losers bracket in Double Elimination
 *
 * WICHTIGE REGELN:
 * 1. LB hat spezielle Runden-Struktur:
 *    - LB R1: WB R1 Verlierer spielen gegeneinander (Sonderfall)
 *    - Gerade LB-Runden (2,4,6): "Aufnahme-Runden" - WB-Verlierer treffen auf LB-Überlebende
 *    - Ungerade LB-Runden nach R1 (3,5,7): "Halbierungs-Runden" - nur LB-Spieler gegeneinander
 *
 * 2. Mapping WB -> LB:
 *    - WB R1 Verlierer -> LB R1 (spielen gegeneinander)
 *    - WB R2 Verlierer -> LB R2 (spielen gegen LB R1 Gewinner)
 *    - WB R3 Verlierer -> LB R4 (spielen gegen LB R3 Gewinner)
 *    - WB R4 Verlierer -> LB R6 (spielen gegen LB R5 Gewinner)
 *    - Allgemein: WB Rn -> LB R(2n-2) für n>1
 *
 * 3. Cross-Over Logik zur Rematch-Vermeidung:
 *    - WB-Verlierer aus oberer Hälfte -> untere Hälfte im LB
 *    - WB-Verlierer aus unterer Hälfte -> obere Hälfte im LB
 */
async function dropToLosersBracket(tournamentId, completedMatch, loserId) {
    const wbRound = completedMatch.round_number;
    const wbPosition = completedMatch.bracket_position;

    // Berechne Ziel-LB-Runde
    // WB R1 -> LB R1 (Verlierer spielen gegeneinander)
    // WB R2 -> LB R2 (Verlierer spielen gegen LB R1 Gewinner)
    // WB R3 -> LB R4 (Verlierer spielen gegen LB R3 Gewinner)
    // WB R4 -> LB R6 (Verlierer spielen gegen LB R5 Gewinner)
    let lbRound;
    if (wbRound === 1) {
        lbRound = 1;
    } else {
        lbRound = 2 * (wbRound - 1);
    }

    const { data: lbMatches } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('bracket_type', 'losers')
        .eq('round_number', lbRound)
        .order('bracket_position', { ascending: true });

    if (!lbMatches || lbMatches.length === 0) return;

    const numLbMatches = lbMatches.length;

    // Berechne Ziel-Position mit Cross-Over Logik
    let targetPosition;

    if (wbRound === 1) {
        // WB R1 Verlierer: Paaren sich im LB R1
        // Position 1,2 -> LB Match 1, Position 3,4 -> LB Match 2, etc.
        // ABER mit Cross-Over: Position 1 und 4 zusammen, Position 2 und 3 zusammen (bei 4 Matches)
        const matchesInWbR1 = numLbMatches * 2; // Doppelte Anzahl der LB R1 Matches

        // Cross-Over: Verlierer aus oberer Hälfte trifft Verlierer aus unterer Hälfte
        // Bei 8 Spielern (4 WB R1 Matches, 2 LB R1 Matches):
        // WB Pos 1 (Seed 1 vs 8) loser -> LB Pos 1, Slot A
        // WB Pos 2 (Seed 4 vs 5) loser -> LB Pos 2, Slot A
        // WB Pos 3 (Seed 2 vs 7) loser -> LB Pos 2, Slot B (Cross-Over)
        // WB Pos 4 (Seed 3 vs 6) loser -> LB Pos 1, Slot B (Cross-Over)
        const halfWbMatches = matchesInWbR1 / 2;

        if (wbPosition <= halfWbMatches) {
            // Obere Hälfte: geht in die gleiche Position
            targetPosition = wbPosition;
        } else {
            // Untere Hälfte: Cross-Over - spiegelt in die andere Hälfte
            // Pos 3 -> 2, Pos 4 -> 1 (bei 4 Matches)
            // Pos 5 -> 4, Pos 6 -> 3, Pos 7 -> 2, Pos 8 -> 1 (bei 8 Matches)
            targetPosition = matchesInWbR1 - wbPosition + 1;
        }

        // Bestimme Slot (A oder B) basierend auf ursprünglicher Position
        const isUpperHalf = wbPosition <= halfWbMatches;

        const targetMatch = lbMatches.find(m => m.bracket_position === targetPosition);
        if (targetMatch) {
            // Obere WB-Hälfte geht in Slot A, untere in Slot B
            const updateField = isUpperHalf ? 'player_a_id' : 'player_b_id';

            await supabase
                .from('tournament_matches')
                .update({ [updateField]: loserId })
                .eq('id', targetMatch.id);

            // Prüfe ob dieses LB R1 Match jetzt ein Bye ist
            await checkAndProcessLbMatchBye(tournamentId, targetMatch.id, lbRound);
        }
    } else {
        // WB R2+ Verlierer: Treffen auf LB-Überlebende
        // Cross-Over Logik: Verlierer aus oberer WB-Hälfte trifft LB-Spieler aus unterer Hälfte

        // Berechne wie viele Matches in dieser WB-Runde waren
        const matchesInThisWbRound = numLbMatches; // Sollte gleich sein
        const halfMatches = Math.ceil(matchesInThisWbRound / 2);

        if (matchesInThisWbRound === 1) {
            // Nur ein Match in dieser Runde - kein Cross-Over nötig
            targetPosition = 1;
        } else if (wbPosition <= halfMatches) {
            // Obere Hälfte -> Cross-Over zur unteren Hälfte des LB
            // Position 1 -> letzte LB Position, Position 2 -> vorletzte, etc.
            targetPosition = numLbMatches - wbPosition + 1;
        } else {
            // Untere Hälfte -> Cross-Over zur oberen Hälfte des LB
            // Position 3 -> Position 2, Position 4 -> Position 1 (bei 4 Matches)
            targetPosition = matchesInThisWbRound - wbPosition + 1;
        }

        const targetMatch = lbMatches.find(m => m.bracket_position === targetPosition);
        if (!targetMatch) {
            // Fallback: Finde Match mit verfügbarem Slot
            const availableMatch = lbMatches.find(m => !m.player_a_id || !m.player_b_id);
            if (availableMatch) {
                const updateField = availableMatch.player_a_id ? 'player_b_id' : 'player_a_id';
                await supabase
                    .from('tournament_matches')
                    .update({ [updateField]: loserId })
                    .eq('id', availableMatch.id);
            }
            return;
        }

        // WB-Verlierer kommen in Slot B (LB-Überlebende sind in Slot A)
        // Außer wenn Slot B schon belegt ist
        const updateField = targetMatch.player_b_id ? 'player_a_id' : 'player_b_id';

        await supabase
            .from('tournament_matches')
            .update({ [updateField]: loserId })
            .eq('id', targetMatch.id);

        // Prüfe ob dieses LB-Match jetzt ein Bye ist (nur ein Spieler, der andere kommt nicht mehr)
        await checkAndProcessLbMatchBye(tournamentId, targetMatch.id, lbRound);
    }
}

/**
 * Prüft ob ein LB-Match ein Bye ist und verarbeitet es entsprechend
 * Ein Bye entsteht wenn einer der erwarteten Spieler aus dem WB nicht kommt (weil sein WB-Match ein Bye war)
 */
async function checkAndProcessLbMatchBye(tournamentId, matchId, lbRound) {
    // Hole aktuellen Stand des Matches
    const { data: match } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('id', matchId)
        .single();

    if (!match || match.status !== 'pending') return;

    const hasPlayerA = !!match.player_a_id;
    const hasPlayerB = !!match.player_b_id;

    // Wenn beide Spieler da sind, ist es kein Bye
    if (hasPlayerA && hasPlayerB) return;

    // Prüfe ob wir noch auf weitere Spieler warten müssen
    // Für LB R1: Warten auf 2 WB R1 Verlierer
    // Für LB R2, R4, R6 (gerade): Warten auf 1 LB-Gewinner + 1 WB-Verlierer
    // Für LB R3, R5 (ungerade nach R1): Warten auf 2 LB-Gewinner

    if (lbRound === 1) {
        // LB R1 braucht 2 Verlierer aus WB R1
        // Prüfe ob alle WB R1 Matches abgeschlossen sind
        const { data: wbR1Matches } = await supabase
            .from('tournament_matches')
            .select('status')
            .eq('tournament_id', tournamentId)
            .eq('bracket_type', 'winners')
            .eq('round_number', 1);

        const allWbR1Done = wbR1Matches?.every(m => m.status === 'completed' || m.status === 'skipped');

        if (allWbR1Done && (hasPlayerA !== hasPlayerB)) {
            // Alle WB R1 Matches sind fertig, aber nur ein Spieler im LB Match -> Bye!
            const winnerId = hasPlayerA ? match.player_a_id : match.player_b_id;
            await supabase
                .from('tournament_matches')
                .update({ status: 'completed', winner_id: winnerId })
                .eq('id', matchId);
            await advanceDoubleEliminationWinner(tournamentId, match, winnerId);
        }
    } else if (lbRound % 2 === 0) {
        // Gerade LB-Runde: LB-Gewinner vs WB-Verlierer
        // Prüfe ob alle entsprechenden WB-Matches fertig sind
        const wbRound = Math.floor(lbRound / 2) + 1; // LB R2 -> WB R2, LB R4 -> WB R3, LB R6 -> WB R4

        const { data: wbMatches } = await supabase
            .from('tournament_matches')
            .select('status')
            .eq('tournament_id', tournamentId)
            .eq('bracket_type', 'winners')
            .eq('round_number', wbRound);

        const allWbDone = wbMatches?.every(m => m.status === 'completed' || m.status === 'skipped');

        // Auch prüfen ob vorherige LB-Runde fertig ist
        const { data: prevLbMatches } = await supabase
            .from('tournament_matches')
            .select('status')
            .eq('tournament_id', tournamentId)
            .eq('bracket_type', 'losers')
            .eq('round_number', lbRound - 1);

        const allPrevLbDone = prevLbMatches?.every(m => m.status === 'completed' || m.status === 'skipped');

        if (allWbDone && allPrevLbDone && (hasPlayerA !== hasPlayerB)) {
            // Beide Quellen sind fertig, aber nur ein Spieler -> Bye!
            const winnerId = hasPlayerA ? match.player_a_id : match.player_b_id;
            await supabase
                .from('tournament_matches')
                .update({ status: 'completed', winner_id: winnerId })
                .eq('id', matchId);
            await advanceDoubleEliminationWinner(tournamentId, { ...match, round_number: lbRound, bracket_type: 'losers' }, winnerId);
        }
    }
}

/**
 * Verarbeitet Byes im Losers Bracket nach dem Droppen von Spielern
 * Wird aufgerufen nachdem alle Spieler einer WB-Runde ins LB gedroppt wurden
 * Prüft ob LB-Matches nur einen Spieler haben (Bye) und lässt diesen automatisch weiterkommen
 */
async function processLosersBracketByes(tournamentId, lbRound) {
    const { data: lbMatches } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('bracket_type', 'losers')
        .eq('round_number', lbRound)
        .eq('status', 'pending');

    if (!lbMatches) return;

    for (const match of lbMatches) {
        const hasPlayerA = !!match.player_a_id;
        const hasPlayerB = !!match.player_b_id;

        // Bye: Nur ein Spieler vorhanden
        if (hasPlayerA && !hasPlayerB) {
            // Player A gewinnt automatisch
            await supabase
                .from('tournament_matches')
                .update({
                    status: 'completed',
                    winner_id: match.player_a_id
                })
                .eq('id', match.id);
            await advanceDoubleEliminationWinner(tournamentId, match, match.player_a_id);
        } else if (!hasPlayerA && hasPlayerB) {
            // Player B gewinnt automatisch
            await supabase
                .from('tournament_matches')
                .update({
                    status: 'completed',
                    winner_id: match.player_b_id
                })
                .eq('id', match.id);
            await advanceDoubleEliminationWinner(tournamentId, match, match.player_b_id);
        }
        // Beide Slots leer: wird später gefüllt oder Match wird geskippt
    }
}

export async function recordTournamentMatchResult(tournamentMatchId, matchId) {
    try {
        const { data: match, error: matchError } = await supabase
            .from('matches').select('*').eq('id', matchId).single();
        if (matchError) throw matchError;

        // Fetch tournament match with tournament info for player order + match_mode validation
        const { data: tournamentMatch, error: tmError } = await supabase
            .from('tournament_matches')
            .select('*, tournament:tournament_id(match_mode, format)')
            .eq('id', tournamentMatchId).single();
        if (tmError) throw tmError;

        // Validate match_mode: reject matches that don't fit the tournament format
        const tournamentMode = tournamentMatch.tournament?.match_mode || 'best-of-5';
        const maxSetsMap = { 'best-of-5': 5, 'best-of-3': 3, 'best-of-7': 7, 'single-set': 1 };
        const setsToWinMap = { 'best-of-5': 3, 'best-of-3': 2, 'best-of-7': 4, 'single-set': 1 };
        const maxSets = maxSetsMap[tournamentMode] || 5;
        const setsToWin = setsToWinMap[tournamentMode] || 3;
        const totalSetsPlayed = (match.player_a_sets_won || 0) + (match.player_b_sets_won || 0);
        const maxWon = Math.max(match.player_a_sets_won || 0, match.player_b_sets_won || 0);

        if (totalSetsPlayed > maxSets || maxWon > setsToWin) {
            const modeNames = { 'best-of-5': 'Best of 5', 'best-of-3': 'Best of 3', 'best-of-7': 'Best of 7', 'single-set': '1 Satz' };
            throw new Error(`Spielmodus passt nicht! Das Turnier ist ${modeNames[tournamentMode]}, aber das Ergebnis ist ${match.player_a_sets_won}:${match.player_b_sets_won}.`);
        }

        // Check if player order matches between match and tournament_match
        const sameOrder = match.player_a_id === tournamentMatch.player_a_id;
        const tmPlayerASets = sameOrder ? match.player_a_sets_won : match.player_b_sets_won;
        const tmPlayerBSets = sameOrder ? match.player_b_sets_won : match.player_a_sets_won;

        const { error: updateError } = await supabase
            .from('tournament_matches')
            .update({
                match_id: matchId, status: 'completed', winner_id: match.winner_id,
                player_a_sets_won: tmPlayerASets, player_b_sets_won: tmPlayerBSets,
                completed_at: new Date().toISOString()
            })
            .eq('id', tournamentMatchId);
        if (updateError) throw updateError;

        await updateStandings(
            tournamentMatch.tournament_id, tournamentMatch.player_a_id, tournamentMatch.player_b_id,
            match.winner_id, tmPlayerASets, tmPlayerBSets
        );

        // Handle Double Elimination bracket progression
        const format = tournamentMatch.tournament?.format;
        if (format === 'double_elimination' || format === 'double_elim_32') {
            const loserId = match.winner_id === tournamentMatch.player_a_id
                ? tournamentMatch.player_b_id
                : tournamentMatch.player_a_id;

            // Advance winner
            await advanceDoubleEliminationWinner(tournamentMatch.tournament_id, tournamentMatch, match.winner_id);

            // Drop loser to losers bracket (only from winners bracket)
            if (tournamentMatch.bracket_type === 'winners') {
                await dropToLosersBracket(tournamentMatch.tournament_id, tournamentMatch, loserId);
            }
        }

        await checkAndCompleteTournament(tournamentMatch.tournament_id);
        showToast('Turnier-Match Ergebnis gespeichert!', 'success');
    } catch (error) {
        console.error('[Tournaments] Error recording match result:', error);
        showToast('Fehler beim Speichern: ' + error.message, 'error');
        throw error;
    }
}

async function checkAndCompleteTournament(tournamentId) {
    try {
        const { data: allMatches, error } = await supabase
            .from('tournament_matches').select('id, status, player_b_id').eq('tournament_id', tournamentId);
        if (error) throw error;

        const total = allMatches.length;
        // 'completed' = regulär beendet, 'skipped' = übersprungen (z.B. Grand Finals Reset nicht nötig)
        const finished = allMatches.filter(m => m.status === 'completed' || m.status === 'skipped').length;

        if (total > 0 && finished === total) {
            await supabase.from('tournaments')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', tournamentId);

            // Create activity events for all participants
            await createTournamentCompletedEvents(tournamentId);

            showToast('Turnier abgeschlossen! Alle Spiele wurden gespielt.', 'success');
        }
    } catch (error) {
        console.error('[Tournaments] Error checking tournament completion:', error);
    }
}

async function createTournamentCompletedEvents(tournamentId) {
    try {
        // Load tournament info
        const { data: tournament } = await supabase
            .from('tournaments')
            .select('id, name, club_id, format, match_mode')
            .eq('id', tournamentId).single();
        if (!tournament) return;

        // Load standings sorted by rank
        const { data: standings } = await supabase
            .from('tournament_standings')
            .select('player_id, rank, matches_played, matches_won, matches_lost, sets_won, sets_lost, tournament_points')
            .eq('tournament_id', tournamentId)
            .is('round_id', null)
            .order('rank', { ascending: true });
        if (!standings || standings.length === 0) return;

        // Load participant profiles for names
        const playerIds = standings.map(s => s.player_id);
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, display_name, avatar_url')
            .in('id', playerIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Build podium (top 3)
        const podium = standings.slice(0, 3).map(s => {
            const p = profileMap[s.player_id] || {};
            return {
                player_id: s.player_id,
                rank: s.rank,
                name: p.display_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Spieler',
                avatar_url: p.avatar_url || null,
                matches_won: s.matches_won,
                tournament_points: s.tournament_points
            };
        });

        // Create one activity event per participant
        const events = standings.map(s => ({
            user_id: s.player_id,
            club_id: tournament.club_id,
            event_type: 'tournament_completed',
            event_data: {
                tournament_id: tournament.id,
                tournament_name: tournament.name,
                tournament_format: tournament.format,
                match_mode: tournament.match_mode,
                my_rank: s.rank,
                my_matches_won: s.matches_won,
                my_matches_lost: s.matches_lost,
                my_sets_won: s.sets_won,
                my_sets_lost: s.sets_lost,
                my_tournament_points: s.tournament_points,
                total_participants: standings.length,
                podium: podium,
                participant_ids: playerIds
            }
        }));

        const { error } = await supabase.from('activity_events').insert(events);
        if (error) {
            console.error('[Tournaments] Error creating completion events:', error);
        } else {
            console.log('[Tournaments] Created', events.length, 'tournament completion events');
        }
    } catch (err) {
        console.error('[Tournaments] Error creating tournament completed events:', err);
    }
}

async function updateStandings(tournamentId, playerAId, playerBId, winnerId, playerASets, playerBSets) {
    const playerAPoints = winnerId === playerAId ? 2 : 0;
    const playerBPoints = winnerId === playerBId ? 2 : 0;

    const { data: standingsA } = await supabase
        .from('tournament_standings').select('*')
        .eq('tournament_id', tournamentId).eq('player_id', playerAId).is('round_id', null).maybeSingle();

    if (standingsA) {
        await supabase.from('tournament_standings').update({
            matches_played: standingsA.matches_played + 1,
            matches_won: standingsA.matches_won + (winnerId === playerAId ? 1 : 0),
            matches_lost: standingsA.matches_lost + (winnerId === playerBId ? 1 : 0),
            sets_won: standingsA.sets_won + playerASets,
            sets_lost: standingsA.sets_lost + playerBSets,
            sets_difference: (standingsA.sets_won + playerASets) - (standingsA.sets_lost + playerBSets),
            tournament_points: standingsA.tournament_points + playerAPoints
        }).eq('id', standingsA.id);
    }

    const { data: standingsB } = await supabase
        .from('tournament_standings').select('*')
        .eq('tournament_id', tournamentId).eq('player_id', playerBId).is('round_id', null).maybeSingle();

    if (standingsB) {
        await supabase.from('tournament_standings').update({
            matches_played: standingsB.matches_played + 1,
            matches_won: standingsB.matches_won + (winnerId === playerBId ? 1 : 0),
            matches_lost: standingsB.matches_lost + (winnerId === playerAId ? 1 : 0),
            sets_won: standingsB.sets_won + playerBSets,
            sets_lost: standingsB.sets_lost + playerASets,
            sets_difference: (standingsB.sets_won + playerBSets) - (standingsB.sets_lost + playerASets),
            tournament_points: standingsB.tournament_points + playerBPoints
        }).eq('id', standingsB.id);
    }

    await updateParticipantStats(tournamentId, playerAId, winnerId === playerAId, playerASets, playerBSets);
    await updateParticipantStats(tournamentId, playerBId, winnerId === playerBId, playerBSets, playerASets);
    await calculateRanks(tournamentId);
}

async function updateParticipantStats(tournamentId, playerId, won, setsWon, setsLost) {
    const { data: participant } = await supabase
        .from('tournament_participants').select('*')
        .eq('tournament_id', tournamentId).eq('player_id', playerId).maybeSingle();

    if (participant) {
        await supabase.from('tournament_participants').update({
            matches_played: participant.matches_played + 1,
            matches_won: participant.matches_won + (won ? 1 : 0),
            matches_lost: participant.matches_lost + (won ? 0 : 1),
            sets_won: participant.sets_won + setsWon,
            sets_lost: participant.sets_lost + setsLost,
            points: participant.points + (won ? 2 : 0)
        }).eq('id', participant.id);
    }
}

async function calculateRanks(tournamentId) {
    try {
        const { data: standings, error } = await supabase
            .from('tournament_standings').select('*')
            .eq('tournament_id', tournamentId).is('round_id', null)
            .order('tournament_points', { ascending: false })
            .order('sets_difference', { ascending: false })
            .order('sets_won', { ascending: false });
        if (error) throw error;

        for (let i = 0; i < standings.length; i++) {
            await supabase.from('tournament_standings').update({ rank: i + 1 }).eq('id', standings[i].id);
        }
    } catch (error) {
        console.error('[Tournaments] Error calculating ranks:', error);
    }
}

export async function getTournaments(status = null) {
    try {
        if (!currentSportId) {
            console.warn('[Tournaments] No sport_id set, cannot load tournaments');
            return [];
        }
        let query = supabase
            .from('tournaments')
            .select(`
                *,
                created_by_profile:profiles!tournaments_created_by_fkey(id, display_name, first_name, last_name),
                tournament_participants(count)
            `)
            .eq('club_id', currentClubId)
            .eq('sport_id', currentSportId)
            .order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[Tournaments] Error loading tournaments:', error);
        return [];
    }
}

export async function getTournamentDetails(tournamentId) {
    try {
        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select(`
                *,
                created_by_profile:profiles!tournaments_created_by_fkey(id, display_name, first_name, last_name),
                tournament_participants(
                    id, tournament_id, player_id, seed, elo_at_registration, matches_played,
                    matches_won, matches_lost, sets_won, sets_lost, points, final_rank,
                    is_active, joined_at,
                    profile:profiles(id, display_name, first_name, last_name, elo_rating, avatar_url)
                ),
                tournament_matches(
                    id, tournament_id, round_id, match_number, round_number,
                    player_a_id, player_b_id, match_id, scheduled_for, deadline,
                    status, winner_id, player_a_sets_won, player_b_sets_won,
                    is_walkover, created_at, completed_at,
                    bracket_type, bracket_position,
                    player_a:profiles!tournament_matches_player_a_id_fkey(id, display_name, first_name, last_name, elo_rating, avatar_url),
                    player_b:profiles!tournament_matches_player_b_id_fkey(id, display_name, first_name, last_name, elo_rating, avatar_url),
                    winner:profiles!tournament_matches_winner_id_fkey(id, display_name, first_name, last_name)
                ),
                tournament_standings(
                    id, tournament_id, player_id, matches_played, matches_won,
                    matches_lost, matches_drawn, sets_won, sets_lost, sets_difference,
                    points_scored, points_against, points_difference, tournament_points, rank,
                    profile:profiles(id, display_name, first_name, last_name, avatar_url)
                )
            `)
            .eq('id', tournamentId)
            .single();

        if (error) throw error;

        if (tournament.tournament_standings) {
            tournament.tournament_standings.sort((a, b) => (a.rank || 999) - (b.rank || 999));
        }

        return tournament;
    } catch (error) {
        console.error('[Tournaments] Error loading tournament details:', error);
        throw error;
    }
}

export async function isParticipating(tournamentId) {
    try {
        const { data } = await supabase
            .from('tournament_participants').select('id')
            .eq('tournament_id', tournamentId).eq('player_id', currentUserId).maybeSingle();
        return !!data;
    } catch { return false; }
}

export function getTournamentFormatName(format) {
    const formats = {
        'round_robin': 'Jeder gegen Jeden',
        'double_elimination': 'Doppel-K.O.',
        'pool_6': 'Poolplan bis 6',
        'pool_8': 'Poolplan bis 8',
        'groups_4': 'Vierergruppen',
        'knockout_16': 'K.O. bis 16',
        'knockout_32': 'K.O. bis 32',
        'double_elim_32': 'Doppel-K.O.',
        'groups_knockout_32': 'Gruppen + K.O. (32)',
        'groups_knockout_64': 'Gruppen + K.O. (64)',
        'doubles_team': 'Zweiermannschaft',
        'single_match': 'Einzelbegegnung'
    };
    return formats[format] || format;
}

export function getTournamentStatusName(status) {
    const statuses = {
        'draft': 'Entwurf',
        'registration': 'Anmeldung läuft',
        'in_progress': 'Läuft',
        'completed': 'Abgeschlossen',
        'cancelled': 'Abgebrochen'
    };
    return statuses[status] || status;
}

export async function getPendingTournamentMatch(playerAId, playerBId) {
    try {
        const { data, error } = await supabase
            .from('tournament_matches')
            .select('*, tournament:tournaments(id, name, format, with_handicap)')
            .eq('status', 'pending')
            .or(`and(player_a_id.eq.${playerAId},player_b_id.eq.${playerBId}),and(player_a_id.eq.${playerBId},player_b_id.eq.${playerAId})`)
            .limit(1)
            .maybeSingle();

        if (error) { console.error('[Tournaments] Error checking pending match:', error); return null; }
        return data || null;
    } catch { return null; }
}
