// Tournaments Module - Supabase Version
// SC Champions - Tournament System

import { getSupabase } from './supabase-init.js';

/**
 * Tournaments Module
 * Handles tournament creation, registration, match generation, and standings
 */

const supabase = getSupabase();

/**
 * Show toast notification
 */
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

// Global state
let currentTournamentId = null;
let currentUserId = null;
let currentClubId = null;
let currentSportId = null;

/**
 * Initialize tournaments module
 * @param {string} userId - Current user ID
 * @param {string} clubId - Current club ID
 * @param {string} sportId - Current sport ID (table_tennis)
 */
let tournamentSubscriptions = [];

export function initTournaments(userId, clubId, sportId) {
    console.log('[Tournaments] Initializing...', { userId, clubId, sportId });
    currentUserId = userId;
    currentClubId = clubId;
    currentSportId = sportId;

    // Set up real-time subscriptions
    setupRealtimeSubscriptions();
}

/**
 * Set up real-time subscriptions for tournaments
 */
function setupRealtimeSubscriptions() {
    // Clean up existing subscriptions
    tournamentSubscriptions.forEach(sub => {
        supabase.removeChannel(sub);
    });
    tournamentSubscriptions = [];

    console.log('[Tournaments] Setting up real-time subscriptions');

    // Subscribe to tournament changes
    const tournamentsChannel = supabase
        .channel('tournaments_changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tournaments'
        }, (payload) => {
            console.log('[Tournaments Realtime] Tournament changed:', payload.eventType);
            // Trigger UI refresh in tournaments-ui-supabase.js
            if (window.tournamentUIRefresh) {
                window.tournamentUIRefresh();
            }
        })
        .subscribe((status) => {
            console.log('[Tournaments Realtime] Tournaments subscription status:', status);
        });

    // Subscribe to tournament_participants changes
    const participantsChannel = supabase
        .channel('tournament_participants_changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'tournament_participants'
        }, (payload) => {
            console.log('[Tournaments Realtime] Participant changed:', payload.eventType, payload);
            // Trigger UI refresh
            if (window.tournamentUIRefresh) {
                window.tournamentUIRefresh();
            }
            // Also refresh details if currently viewing a tournament
            if (window.currentTournamentDetailsId) {
                if (window.refreshTournamentDetails) {
                    window.refreshTournamentDetails(window.currentTournamentDetailsId);
                }
            }
        })
        .subscribe((status) => {
            console.log('[Tournaments Realtime] Participants subscription status:', status);
        });

    tournamentSubscriptions.push(tournamentsChannel, participantsChannel);
}

/**
 * Get current user ID
 * @returns {string|null} Current user ID
 */
export function getCurrentUserId() {
    return currentUserId;
}

/**
 * Generate a random 6-character join code
 * @returns {string} Join code (e.g., "ABC123")
 */
function generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I (confusion)
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Create a new tournament
 * @param {Object} tournamentData - Tournament configuration
 * @returns {Promise<Object>} Created tournament
 */
export async function createTournament(tournamentData) {
    try {
        console.log('[Tournaments] Creating tournament:', tournamentData);

        const {
            name,
            description = '',
            format = 'round_robin',
            maxParticipants,
            isOpen = true,
            isClubOnly = false,
            withHandicap = false,
            isLive = false,
            matchDeadlineDays = 7,
            startDate = null,
            registrationDeadline = null
        } = tournamentData;

        // Validate
        if (!name || !maxParticipants) {
            throw new Error('Name und Teilnehmerzahl sind erforderlich');
        }

        if (format === 'round_robin' && maxParticipants > 10) {
            throw new Error('Jeder gegen Jeden ist nur bis 10 Spieler möglich');
        }

        // Generate join code for private tournaments
        const joinCode = !isOpen ? generateJoinCode() : null;

        const tournament = {
            name,
            description,
            club_id: currentClubId,
            sport_id: currentSportId,
            format,
            max_participants: maxParticipants,
            is_open: isOpen,
            is_club_only: isClubOnly,
            join_code: joinCode,
            with_handicap: withHandicap,
            is_live: isLive,
            match_deadline_days: matchDeadlineDays,
            status: 'registration',
            start_date: startDate,
            registration_deadline: registrationDeadline,
            created_by: currentUserId
        };

        const { data, error } = await supabase
            .from('tournaments')
            .insert(tournament)
            .select()
            .single();

        if (error) throw error;

        console.log('[Tournaments] Tournament created:', data);

        // Automatically add creator as first participant
        const { data: profile } = await supabase
            .from('profiles')
            .select('elo_rating')
            .eq('id', currentUserId)
            .single();

        const eloRating = profile?.elo_rating || 800;

        const { error: participantError } = await supabase
            .from('tournament_participants')
            .insert({
                tournament_id: data.id,
                player_id: currentUserId,
                elo_at_registration: eloRating
            });

        if (participantError) {
            console.error('[Tournaments] Error adding creator as participant:', participantError);
            // Don't throw - tournament was created successfully
        } else {
            console.log('[Tournaments] Creator automatically joined tournament');
        }

        // Show join code if private
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

/**
 * Join a tournament (open or with code)
 * @param {string} tournamentId - Tournament ID
 * @param {string} joinCode - Join code (for private tournaments)
 * @returns {Promise<Object>} Participant record
 */
export async function joinTournament(tournamentId, joinCode = null) {
    try {
        console.log('[Tournaments] Joining tournament:', tournamentId);

        // Get tournament details
        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('*')
            .eq('id', tournamentId)
            .single();

        if (tournamentError) throw tournamentError;
        if (!tournament) throw new Error('Turnier nicht gefunden');

        // Check if tournament is open for registration
        if (tournament.status !== 'registration') {
            throw new Error('Anmeldung für dieses Turnier ist nicht mehr möglich');
        }

        // Check if tournament is full
        if (tournament.participant_count >= tournament.max_participants) {
            throw new Error('Turnier ist bereits voll');
        }

        // Validate join code for private tournaments
        // Exception: Tournament creator can join without code
        const isCreator = tournament.created_by === currentUserId;
        if (!tournament.is_open && !isCreator) {
            if (!joinCode || joinCode.toUpperCase() !== tournament.join_code) {
                throw new Error('Ungültiger Einladungscode');
            }
        }

        // Check if already joined
        const { data: existing } = await supabase
            .from('tournament_participants')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('player_id', currentUserId)
            .single();

        if (existing) {
            throw new Error('Du bist bereits für dieses Turnier angemeldet');
        }

        // Get player's current Elo for seeding
        const { data: profile } = await supabase
            .from('profiles')
            .select('elo_rating')
            .eq('id', currentUserId)
            .single();

        const eloRating = profile?.elo_rating || 800;

        // Join tournament
        const participant = {
            tournament_id: tournamentId,
            player_id: currentUserId,
            elo_at_registration: eloRating
        };

        const { data, error } = await supabase
            .from('tournament_participants')
            .insert(participant)
            .select()
            .single();

        if (error) throw error;

        console.log('[Tournaments] Joined tournament:', data);
        showToast('Erfolgreich für Turnier angemeldet!', 'success');

        return data;
    } catch (error) {
        console.error('[Tournaments] Error joining tournament:', error);
        showToast('Fehler beim Beitreten: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Leave a tournament
 * @param {string} tournamentId - Tournament ID
 */
export async function leaveTournament(tournamentId) {
    try {
        console.log('[Tournaments] Leaving tournament:', tournamentId);

        // Check if tournament has started
        const { data: tournament } = await supabase
            .from('tournaments')
            .select('status')
            .eq('id', tournamentId)
            .single();

        if (tournament?.status === 'in_progress' || tournament?.status === 'completed') {
            throw new Error('Du kannst ein laufendes oder abgeschlossenes Turnier nicht verlassen');
        }

        const { error } = await supabase
            .from('tournament_participants')
            .delete()
            .eq('tournament_id', tournamentId)
            .eq('player_id', currentUserId);

        if (error) throw error;

        showToast('Turnier erfolgreich verlassen', 'success');
    } catch (error) {
        console.error('[Tournaments] Error leaving tournament:', error);
        showToast('Fehler beim Verlassen: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Delete a tournament (only creator or coach can delete)
 * @param {string} tournamentId - Tournament ID
 */
export async function deleteTournament(tournamentId) {
    try {
        console.log('[Tournaments] Deleting tournament:', tournamentId);

        // Delete tournament (CASCADE will delete participants, matches, standings)
        const { error } = await supabase
            .from('tournaments')
            .delete()
            .eq('id', tournamentId);

        if (error) throw error;

        showToast('Turnier erfolgreich gelöscht', 'success');
    } catch (error) {
        console.error('[Tournaments] Error deleting tournament:', error);
        showToast('Fehler beim Löschen: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Start a tournament (assign seeds and generate matches)
 * @param {string} tournamentId - Tournament ID
 */
export async function startTournament(tournamentId) {
    try {
        console.log('[Tournaments] Starting tournament:', tournamentId);

        // Get tournament details
        const { data: tournament, error: tournamentError } = await supabase
            .from('tournaments')
            .select('*, tournament_participants(*)')
            .eq('id', tournamentId)
            .single();

        if (tournamentError) throw tournamentError;
        if (!tournament) throw new Error('Turnier nicht gefunden');

        // Check if user is creator
        if (tournament.created_by !== currentUserId) {
            throw new Error('Nur der Turnier-Ersteller kann das Turnier starten');
        }

        // Check minimum participants
        const participantCount = tournament.tournament_participants?.length || 0;
        if (participantCount < 2) {
            throw new Error('Mindestens 2 Teilnehmer erforderlich');
        }

        // Assign seeds based on Elo
        await assignSeeds(tournamentId);

        // Generate matches based on format
        if (tournament.format === 'round_robin') {
            await generateRoundRobinMatches(tournamentId);
        } else {
            throw new Error(`Format ${tournament.format} wird noch nicht unterstützt`);
        }

        // Update tournament status
        const { error: updateError } = await supabase
            .from('tournaments')
            .update({
                status: 'in_progress',
                started_at: new Date().toISOString()
            })
            .eq('id', tournamentId);

        if (updateError) throw updateError;

        console.log('[Tournaments] Tournament started successfully');
        showToast('Turnier gestartet! Matches wurden generiert.', 'success');

        return true;
    } catch (error) {
        console.error('[Tournaments] Error starting tournament:', error);
        showToast('Fehler beim Starten: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Assign seeds to participants based on Elo rating
 * @param {string} tournamentId - Tournament ID
 */
async function assignSeeds(tournamentId) {
    try {
        // Get all participants with their Elo
        const { data: participants, error } = await supabase
            .from('tournament_participants')
            .select('id, elo_at_registration')
            .eq('tournament_id', tournamentId)
            .order('elo_at_registration', { ascending: false });

        if (error) throw error;

        // Assign seeds (1 = highest Elo)
        for (let i = 0; i < participants.length; i++) {
            await supabase
                .from('tournament_participants')
                .update({ seed: i + 1 })
                .eq('id', participants[i].id);
        }

        console.log('[Tournaments] Seeds assigned:', participants.length);
    } catch (error) {
        console.error('[Tournaments] Error assigning seeds:', error);
        throw error;
    }
}

/**
 * Generate Round Robin matches (everyone plays everyone)
 * @param {string} tournamentId - Tournament ID
 */
async function generateRoundRobinMatches(tournamentId) {
    try {
        console.log('[Tournaments] Generating Round Robin matches...');

        // Get all participants sorted by seed (1 = highest Elo)
        const { data: participants, error } = await supabase
            .from('tournament_participants')
            .select('player_id, seed')
            .eq('tournament_id', tournamentId)
            .order('seed', { ascending: true });

        if (error) throw error;

        const playerIds = participants.map(p => p.player_id);
        const n = playerIds.length;
        const matches = [];

        // Round-Robin with correct rotation algorithm
        // For odd number of players, one player gets a "bye" each round
        const hasOddPlayers = n % 2 === 1;
        const totalPlayers = hasOddPlayers ? n + 1 : n;
        const numRounds = totalPlayers - 1;

        // Create array representing current positions
        // For even: [0, 1, 2, 3, 4, 5] means players 0-5
        // For odd: [0, 1, 2, 3, 4, null] means players 0-4 plus a bye
        const positions = [];
        for (let i = 0; i < n; i++) {
            positions.push(i);
        }
        if (hasOddPlayers) {
            positions.push(null); // null = bye
        }

        console.log(`[Tournaments] Setting up ${n} players, ${numRounds} rounds, ${totalPlayers/2} matches per round`);

        // Generate matches for each round
        for (let round = 0; round < numRounds; round++) {
            // In each round, pair up players
            // First half plays against second half (reversed)
            const halfSize = totalPlayers / 2;

            for (let i = 0; i < halfSize; i++) {
                const pos1 = i;
                const pos2 = totalPlayers - 1 - i;

                const player1 = positions[pos1];
                const player2 = positions[pos2];

                // Skip if either is a bye
                if (player1 !== null && player2 !== null) {
                    matches.push({
                        tournament_id: tournamentId,
                        round_number: round + 1,
                        match_number: matches.length + 1,
                        player_a_id: playerIds[player1],
                        player_b_id: playerIds[player2],
                        status: 'pending'
                    });
                } else {
                    // One player has a bye
                    const playerWithBye = player1 !== null ? player1 : player2;
                    if (playerWithBye !== null) {
                        console.log(`[Tournaments] Round ${round + 1}: Player ${playerWithBye + 1} (seed ${playerWithBye + 1}) has bye`);
                    }
                }
            }

            // Rotate all players except the first one (position 0 stays fixed)
            // This is the standard round-robin rotation
            if (round < numRounds - 1) {
                const last = positions[positions.length - 1];
                for (let i = positions.length - 1; i > 1; i--) {
                    positions[i] = positions[i - 1];
                }
                positions[1] = last;
            }
        }

        // Insert all matches
        const { error: insertError } = await supabase
            .from('tournament_matches')
            .insert(matches);

        if (insertError) throw insertError;

        // Initialize standings for all participants
        const standings = participants.map(p => ({
            tournament_id: tournamentId,
            player_id: p.player_id
        }));

        const { error: standingsError } = await supabase
            .from('tournament_standings')
            .insert(standings);

        if (standingsError) throw standingsError;

        console.log(`[Tournaments] Generated ${matches.length} Round Robin matches across ${numRounds} rounds`);
        if (hasOddPlayers) {
            console.log('[Tournaments] Tournament has odd number of players - using bye rotation');
        }
        return matches;
    } catch (error) {
        console.error('[Tournaments] Error generating matches:', error);
        throw error;
    }
}

/**
 * Record a match result for a tournament match
 * @param {string} tournamentMatchId - Tournament match ID
 * @param {string} matchId - Actual match ID from matches table
 */
export async function recordTournamentMatchResult(tournamentMatchId, matchId) {
    try {
        console.log('[Tournaments] Recording match result:', { tournamentMatchId, matchId });

        // Get the actual match details
        const { data: match, error: matchError } = await supabase
            .from('matches')
            .select('*')
            .eq('id', matchId)
            .single();

        if (matchError) throw matchError;

        // Update tournament match
        const { error: updateError } = await supabase
            .from('tournament_matches')
            .update({
                match_id: matchId,
                status: 'completed',
                winner_id: match.winner_id,
                player_a_sets_won: match.player_a_sets_won,
                player_b_sets_won: match.player_b_sets_won,
                completed_at: new Date().toISOString()
            })
            .eq('id', tournamentMatchId);

        if (updateError) throw updateError;

        // Get tournament ID for standings update
        const { data: tournamentMatch } = await supabase
            .from('tournament_matches')
            .select('tournament_id, player_a_id, player_b_id')
            .eq('id', tournamentMatchId)
            .single();

        // Update standings
        await updateStandings(
            tournamentMatch.tournament_id,
            tournamentMatch.player_a_id,
            tournamentMatch.player_b_id,
            match.winner_id,
            match.player_a_sets_won,
            match.player_b_sets_won
        );

        // Check if tournament is complete
        await checkAndCompleteTournament(tournamentMatch.tournament_id);

        console.log('[Tournaments] Match result recorded successfully');
        showToast('Turnier-Match Ergebnis gespeichert!', 'success');
    } catch (error) {
        console.error('[Tournaments] Error recording match result:', error);
        showToast('Fehler beim Speichern: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Check if all tournament matches are completed and mark tournament as finished
 * @param {string} tournamentId - Tournament ID
 */
async function checkAndCompleteTournament(tournamentId) {
    try {
        console.log('[Tournaments] Checking if tournament is complete:', tournamentId);

        // Get all matches for this tournament
        const { data: allMatches, error: matchesError } = await supabase
            .from('tournament_matches')
            .select('id, status')
            .eq('tournament_id', tournamentId);

        if (matchesError) throw matchesError;

        // Check if all matches are completed
        const totalMatches = allMatches.length;
        const completedMatches = allMatches.filter(m => m.status === 'completed').length;

        console.log('[Tournaments] Match status:', {
            total: totalMatches,
            completed: completedMatches
        });

        if (totalMatches > 0 && completedMatches === totalMatches) {
            // All matches completed - finish the tournament
            const { error: updateError } = await supabase
                .from('tournaments')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString()
                })
                .eq('id', tournamentId);

            if (updateError) throw updateError;

            console.log('[Tournaments] Tournament completed!');
            showToast('Turnier abgeschlossen! Alle Spiele wurden gespielt.', 'success');
        }
    } catch (error) {
        console.error('[Tournaments] Error checking tournament completion:', error);
        // Don't throw - this is not critical, just log the error
    }
}

/**
 * Update tournament standings after a match
 * @param {string} tournamentId - Tournament ID
 * @param {string} playerAId - Player A ID
 * @param {string} playerBId - Player B ID
 * @param {string} winnerId - Winner ID
 * @param {number} playerASets - Sets won by Player A
 * @param {number} playerBSets - Sets won by Player B
 */
async function updateStandings(tournamentId, playerAId, playerBId, winnerId, playerASets, playerBSets) {
    try {
        // Points system: Win = 2 points, Loss = 0 points
        const playerAPoints = winnerId === playerAId ? 2 : 0;
        const playerBPoints = winnerId === playerBId ? 2 : 0;

        // Update Player A standings
        const { data: standingsA } = await supabase
            .from('tournament_standings')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('player_id', playerAId)
            .is('round_id', null)
            .single();

        if (standingsA) {
            await supabase
                .from('tournament_standings')
                .update({
                    matches_played: standingsA.matches_played + 1,
                    matches_won: standingsA.matches_won + (winnerId === playerAId ? 1 : 0),
                    matches_lost: standingsA.matches_lost + (winnerId === playerBId ? 1 : 0),
                    sets_won: standingsA.sets_won + playerASets,
                    sets_lost: standingsA.sets_lost + playerBSets,
                    sets_difference: (standingsA.sets_won + playerASets) - (standingsA.sets_lost + playerBSets),
                    tournament_points: standingsA.tournament_points + playerAPoints
                })
                .eq('id', standingsA.id);
        }

        // Update Player B standings
        const { data: standingsB } = await supabase
            .from('tournament_standings')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('player_id', playerBId)
            .is('round_id', null)
            .single();

        if (standingsB) {
            await supabase
                .from('tournament_standings')
                .update({
                    matches_played: standingsB.matches_played + 1,
                    matches_won: standingsB.matches_won + (winnerId === playerBId ? 1 : 0),
                    matches_lost: standingsB.matches_lost + (winnerId === playerAId ? 1 : 0),
                    sets_won: standingsB.sets_won + playerBSets,
                    sets_lost: standingsB.sets_lost + playerASets,
                    sets_difference: (standingsB.sets_won + playerBSets) - (standingsB.sets_lost + playerASets),
                    tournament_points: standingsB.tournament_points + playerBPoints
                })
                .eq('id', standingsB.id);
        }

        // Update participant stats
        await updateParticipantStats(tournamentId, playerAId, winnerId === playerAId, playerASets, playerBSets);
        await updateParticipantStats(tournamentId, playerBId, winnerId === playerBId, playerBSets, playerASets);

        // Recalculate ranks
        await calculateRanks(tournamentId);

        console.log('[Tournaments] Standings updated');
    } catch (error) {
        console.error('[Tournaments] Error updating standings:', error);
        throw error;
    }
}

/**
 * Update participant stats
 */
async function updateParticipantStats(tournamentId, playerId, won, setsWon, setsLost) {
    const { data: participant } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('player_id', playerId)
        .single();

    if (participant) {
        await supabase
            .from('tournament_participants')
            .update({
                matches_played: participant.matches_played + 1,
                matches_won: participant.matches_won + (won ? 1 : 0),
                matches_lost: participant.matches_lost + (won ? 0 : 1),
                sets_won: participant.sets_won + setsWon,
                sets_lost: participant.sets_lost + setsLost,
                points: participant.points + (won ? 2 : 0)
            })
            .eq('id', participant.id);
    }
}

/**
 * Calculate and update ranks in standings
 * @param {string} tournamentId - Tournament ID
 */
async function calculateRanks(tournamentId) {
    try {
        // Get all standings ordered by points, then set difference
        const { data: standings, error } = await supabase
            .from('tournament_standings')
            .select('*')
            .eq('tournament_id', tournamentId)
            .is('round_id', null)
            .order('tournament_points', { ascending: false })
            .order('sets_difference', { ascending: false })
            .order('sets_won', { ascending: false });

        if (error) throw error;

        // Update ranks
        for (let i = 0; i < standings.length; i++) {
            await supabase
                .from('tournament_standings')
                .update({ rank: i + 1 })
                .eq('id', standings[i].id);
        }

        console.log('[Tournaments] Ranks calculated');
    } catch (error) {
        console.error('[Tournaments] Error calculating ranks:', error);
    }
}

/**
 * Get all tournaments for current club
 * @param {string} status - Filter by status (optional)
 * @returns {Promise<Array>} List of tournaments
 */
export async function getTournaments(status = null) {
    try {
        let query = supabase
            .from('tournaments')
            .select(`
                *,
                created_by_profile:profiles!tournaments_created_by_fkey(id, display_name, first_name, last_name),
                tournament_participants(count)
            `)
            .eq('sport_id', currentSportId)
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        // RLS policies will automatically filter:
        // - Global tournaments (is_club_only = false): visible to all
        // - Club-only tournaments (is_club_only = true): only visible to club members

        console.log('[Tournaments] Loaded tournaments:', data?.length);
        return data || [];
    } catch (error) {
        console.error('[Tournaments] Error loading tournaments:', error);
        return [];
    }
}

/**
 * Get tournament details with participants and matches
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<Object>} Tournament details
 */
export async function getTournamentDetails(tournamentId) {
    try {
        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select(`
                *,
                created_by_profile:profiles!tournaments_created_by_fkey(id, display_name, first_name, last_name),
                tournament_participants(
                    *,
                    profile:profiles(id, display_name, first_name, last_name, elo_rating, avatar_url)
                ),
                tournament_matches(
                    *,
                    player_a:profiles!tournament_matches_player_a_id_fkey(id, display_name, first_name, last_name),
                    player_b:profiles!tournament_matches_player_b_id_fkey(id, display_name, first_name, last_name),
                    winner:profiles!tournament_matches_winner_id_fkey(id, display_name, first_name, last_name),
                    match:matches(*)
                ),
                tournament_standings(
                    *,
                    profile:profiles(id, display_name, first_name, last_name, avatar_url)
                )
            `)
            .eq('id', tournamentId)
            .single();

        if (error) throw error;

        // Sort standings by rank
        if (tournament.tournament_standings) {
            tournament.tournament_standings.sort((a, b) => (a.rank || 999) - (b.rank || 999));
        }

        console.log('[Tournaments] Loaded tournament details:', tournament);
        return tournament;
    } catch (error) {
        console.error('[Tournaments] Error loading tournament details:', error);
        throw error;
    }
}

/**
 * Check if current user is participating in a tournament
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<boolean>} True if participating
 */
export async function isParticipating(tournamentId) {
    try {
        const { data, error } = await supabase
            .from('tournament_participants')
            .select('id')
            .eq('tournament_id', tournamentId)
            .eq('player_id', currentUserId)
            .single();

        return !!data;
    } catch (error) {
        return false;
    }
}

/**
 * Get tournament format display name
 * @param {string} format - Format key
 * @returns {string} Display name
 */
export function getTournamentFormatName(format) {
    const formats = {
        'round_robin': 'Jeder gegen Jeden',
        'pool_6': 'Poolplan bis 6 Spieler',
        'pool_8': 'Poolplan bis 8 Spieler',
        'groups_4': 'Vierergruppen',
        'knockout_16': 'K.O. System bis 16 Spieler',
        'knockout_32': 'K.O. System bis 32 Spieler',
        'double_elim_32': 'Doppeltes K.O. System bis 32 Spieler',
        'groups_knockout_32': 'Gruppen + K.O. System bis 32 Spieler',
        'groups_knockout_64': 'Gruppen + K.O. System bis 64 Spieler',
        'doubles_team': 'Spielbögen Zweiermannschaft',
        'single_match': 'Turnierzettel einzelne Begegnung'
    };
    return formats[format] || format;
}

/**
 * Get tournament status display name
 * @param {string} status - Status key
 * @returns {string} Display name
 */
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

/**
 * Check if two players have a pending tournament match
 * @param {string} playerAId - Player A ID
 * @param {string} playerBId - Player B ID
 * @returns {Promise<Object|null>} Tournament match if found, null otherwise
 */
export async function getPendingTournamentMatch(playerAId, playerBId) {
    try {
        const { data, error } = await supabase
            .from('tournament_matches')
            .select(`
                *,
                tournament:tournaments(id, name, format, with_handicap)
            `)
            .eq('status', 'pending')
            .or(`and(player_a_id.eq.${playerAId},player_b_id.eq.${playerBId}),and(player_a_id.eq.${playerBId},player_b_id.eq.${playerAId})`)
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows found, which is fine
            console.error('[Tournaments] Error checking pending match:', error);
            return null;
        }

        if (data) {
            console.log('[Tournaments] Found pending tournament match:', data);
            return data;
        }

        return null;
    } catch (error) {
        console.error('[Tournaments] Error in getPendingTournamentMatch:', error);
        return null;
    }
}

export default {
    initTournaments,
    createTournament,
    joinTournament,
    leaveTournament,
    deleteTournament,
    startTournament,
    getTournaments,
    getTournamentDetails,
    isParticipating,
    recordTournamentMatchResult,
    getTournamentFormatName,
    getTournamentStatusName
};
