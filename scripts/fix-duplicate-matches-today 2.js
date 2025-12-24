/**
 * Script to find and delete duplicate matches from today
 * Also corrects player statistics (wins, losses, elo)
 *
 * Usage: node scripts/fix-duplicate-matches-today.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('🔍 Finding duplicate matches from today...\n');

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString();

    // Fetch all matches from today
    const { data: matches, error } = await supabase
        .from('matches')
        .select('*')
        .gte('created_at', todayStr)
        .lt('created_at', tomorrowStr)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching matches:', error);
        process.exit(1);
    }

    console.log(`Found ${matches.length} matches from today\n`);

    if (matches.length === 0) {
        console.log('No matches to process.');
        return;
    }

    // Group matches by player pair (normalize order)
    const matchGroups = {};
    matches.forEach(match => {
        // Create a normalized key (sort player IDs to handle both orders)
        const players = [match.player_a_id, match.player_b_id].sort();
        const key = `${players[0]}_${players[1]}`;

        if (!matchGroups[key]) {
            matchGroups[key] = [];
        }
        matchGroups[key].push(match);
    });

    // Find duplicates (groups with more than 1 match)
    const duplicateGroups = Object.entries(matchGroups).filter(([key, group]) => group.length > 1);

    if (duplicateGroups.length === 0) {
        console.log('✅ No duplicate matches found!');
        return;
    }

    console.log(`Found ${duplicateGroups.length} groups with duplicates:\n`);

    // Track stats corrections needed
    const statsCorrections = {};

    for (const [key, group] of duplicateGroups) {
        console.log(`\n--- Player pair: ${key} ---`);
        console.log(`Total matches: ${group.length} (${group.length - 1} duplicates to remove)`);

        // Keep the first match, delete the rest
        const [keepMatch, ...duplicates] = group;

        console.log(`Keeping match ${keepMatch.id} (created ${keepMatch.created_at})`);
        console.log(`Winner: ${keepMatch.winner_id}`);
        console.log(`Elo change: winner +${keepMatch.winner_elo_change || 0}, loser ${keepMatch.loser_elo_change || 0}`);

        for (const dup of duplicates) {
            console.log(`\nDeleting duplicate ${dup.id} (created ${dup.created_at})`);
            console.log(`  Winner: ${dup.winner_id}, Elo change: +${dup.winner_elo_change || 0}/${dup.loser_elo_change || 0}`);

            // Track corrections for winner
            if (!statsCorrections[dup.winner_id]) {
                statsCorrections[dup.winner_id] = { wins: 0, losses: 0, elo: 0, matchesPlayed: 0 };
            }
            statsCorrections[dup.winner_id].wins -= 1;
            statsCorrections[dup.winner_id].matchesPlayed -= 1;
            statsCorrections[dup.winner_id].elo -= (dup.winner_elo_change || 0);

            // Track corrections for loser
            if (!statsCorrections[dup.loser_id]) {
                statsCorrections[dup.loser_id] = { wins: 0, losses: 0, elo: 0, matchesPlayed: 0 };
            }
            statsCorrections[dup.loser_id].losses -= 1;
            statsCorrections[dup.loser_id].matchesPlayed -= 1;
            statsCorrections[dup.loser_id].elo -= (dup.loser_elo_change || 0); // loser_elo_change is usually negative

            // Delete the duplicate match
            const { error: deleteError } = await supabase
                .from('matches')
                .delete()
                .eq('id', dup.id);

            if (deleteError) {
                console.error(`  ❌ Error deleting: ${deleteError.message}`);
            } else {
                console.log(`  ✅ Deleted`);
            }
        }
    }

    // Apply stats corrections
    console.log('\n\n📊 Applying stats corrections...\n');

    for (const [playerId, corrections] of Object.entries(statsCorrections)) {
        console.log(`Player ${playerId}:`);
        console.log(`  Wins: ${corrections.wins}, Losses: ${corrections.losses}, Elo: ${corrections.elo > 0 ? '+' : ''}${corrections.elo}`);

        // Get current stats
        const { data: player, error: fetchError } = await supabase
            .from('profiles')
            .select('wins, losses, matches_played, elo_rating, first_name, last_name')
            .eq('id', playerId)
            .single();

        if (fetchError) {
            console.error(`  ❌ Error fetching player: ${fetchError.message}`);
            continue;
        }

        const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim();
        console.log(`  Current: ${playerName} - Wins: ${player.wins}, Losses: ${player.losses}, Elo: ${player.elo_rating}`);

        // Calculate new values
        const newWins = Math.max(0, (player.wins || 0) + corrections.wins);
        const newLosses = Math.max(0, (player.losses || 0) + corrections.losses);
        const newMatchesPlayed = Math.max(0, (player.matches_played || 0) + corrections.matchesPlayed);
        const newElo = Math.max(100, (player.elo_rating || 800) + corrections.elo);

        console.log(`  New: Wins: ${newWins}, Losses: ${newLosses}, Elo: ${newElo}`);

        // Update player stats
        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                wins: newWins,
                losses: newLosses,
                matches_played: newMatchesPlayed,
                elo_rating: newElo
            })
            .eq('id', playerId);

        if (updateError) {
            console.error(`  ❌ Error updating: ${updateError.message}`);
        } else {
            console.log(`  ✅ Updated`);
        }
    }

    console.log('\n\n🎉 Done! Duplicate matches removed and stats corrected.');
}

main().catch(console.error);
