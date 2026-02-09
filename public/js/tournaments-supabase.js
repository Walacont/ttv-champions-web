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
        if (format === 'round_robin' && maxParticipants > 10) throw new Error('Jeder gegen Jeden ist nur bis 10 Spieler möglich');

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

export async function recordTournamentMatchResult(tournamentMatchId, matchId) {
    try {
        const { data: match, error: matchError } = await supabase
            .from('matches').select('*').eq('id', matchId).single();
        if (matchError) throw matchError;

        // Fetch tournament match with tournament info for player order + match_mode validation
        const { data: tournamentMatch, error: tmError } = await supabase
            .from('tournament_matches')
            .select('tournament_id, player_a_id, player_b_id, tournament:tournament_id(match_mode)')
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
        const completed = allMatches.filter(m => m.status === 'completed').length;

        if (total > 0 && completed === total) {
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
        .eq('tournament_id', tournamentId).eq('player_id', playerAId).is('round_id', null).single();

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
        .eq('tournament_id', tournamentId).eq('player_id', playerBId).is('round_id', null).single();

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
        .eq('tournament_id', tournamentId).eq('player_id', playerId).single();

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
                    player_a:profiles!tournament_matches_player_a_id_fkey(id, display_name, first_name, last_name),
                    player_b:profiles!tournament_matches_player_b_id_fkey(id, display_name, first_name, last_name),
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
        'pool_6': 'Poolplan bis 6',
        'pool_8': 'Poolplan bis 8',
        'groups_4': 'Vierergruppen',
        'knockout_16': 'K.O. bis 16',
        'knockout_32': 'K.O. bis 32',
        'double_elim_32': 'Doppeltes K.O.',
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
