/**
 * Script to remove duplicate doubles matches and pairings from Supabase
 *
 * This script handles:
 * 1. Duplicate matches (same players, same timestamp)
 * 2. Duplicate pairings with swapped player order (A+B vs B+A)
 *
 * Usage:
 *   node scripts/remove-duplicate-doubles.js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

/**
 * Create a sorted pairing key from two player IDs
 */
function createSortedKey(player1Id, player2Id) {
    const sorted = [player1Id, player2Id].sort();
    return `${sorted[0]}_${sorted[1]}`;
}

async function removeDuplicateDoublesMatches() {
    console.log('🔍 Finding duplicate doubles matches...\n');

    // Fetch all doubles matches
    const { data: matches, error } = await supabase
        .from('doubles_matches')
        .select('id, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id, played_at, created_at')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Error fetching matches:', error.message);
        return;
    }

    console.log(`Found ${matches.length} total doubles matches\n`);

    // Group by unique match key (players + played_at)
    const matchGroups = {};

    matches.forEach(match => {
        const key = `${match.team_a_player1_id}_${match.team_a_player2_id}_${match.team_b_player1_id}_${match.team_b_player2_id}_${match.played_at}`;

        if (!matchGroups[key]) {
            matchGroups[key] = [];
        }
        matchGroups[key].push(match);
    });

    // Find duplicates
    const duplicatesToDelete = [];

    for (const [key, group] of Object.entries(matchGroups)) {
        if (group.length > 1) {
            console.log(`📋 Found ${group.length} duplicates for match:`);
            console.log(`   Players: ${key.split('_').slice(0, 4).join(', ')}`);
            console.log(`   Played at: ${group[0].played_at}`);

            // Keep the first one (oldest by created_at), delete the rest
            const [keep, ...remove] = group;
            console.log(`   Keeping ID: ${keep.id}`);
            console.log(`   Deleting IDs: ${remove.map(m => m.id).join(', ')}\n`);

            duplicatesToDelete.push(...remove.map(m => m.id));
        }
    }

    if (duplicatesToDelete.length === 0) {
        console.log('✅ No duplicate matches found!');
        return;
    }

    console.log(`\n🗑️ Deleting ${duplicatesToDelete.length} duplicate matches...\n`);

    // Delete duplicates
    const { error: deleteError } = await supabase
        .from('doubles_matches')
        .delete()
        .in('id', duplicatesToDelete);

    if (deleteError) {
        console.error('❌ Error deleting duplicates:', deleteError.message);
        return;
    }

    console.log(`✅ Successfully deleted ${duplicatesToDelete.length} duplicate matches!`);

    // Verify final count
    const { count } = await supabase
        .from('doubles_matches')
        .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Final count: ${count} doubles matches in database`);
}

async function removeDuplicateDoublesPairings() {
    console.log('\n🔍 Finding duplicate doubles pairings (including swapped player order)...\n');

    // Fetch all doubles pairings with all relevant fields
    const { data: pairings, error } = await supabase
        .from('doubles_pairings')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Error fetching pairings:', error.message);
        return;
    }

    console.log(`Found ${pairings.length} total doubles pairings\n`);

    // Group by SORTED player IDs (to find duplicates where player order is swapped)
    const pairingGroups = {};

    pairings.forEach(pairing => {
        // Create a key using sorted player IDs
        const sortedKey = createSortedKey(pairing.player1_id, pairing.player2_id);

        if (!pairingGroups[sortedKey]) {
            pairingGroups[sortedKey] = [];
        }
        pairingGroups[sortedKey].push(pairing);
    });

    // Find duplicates
    const duplicatesToDelete = [];
    const pairingsToUpdate = [];

    for (const [sortedKey, group] of Object.entries(pairingGroups)) {
        if (group.length > 1) {
            console.log(`📋 Found ${group.length} pairings for players: ${sortedKey}`);

            // Sort by matches_played descending to keep the one with most stats
            group.sort((a, b) => (b.matches_played || 0) - (a.matches_played || 0));

            const [keep, ...remove] = group;

            // Merge stats from duplicates
            let totalMatchesPlayed = keep.matches_played || 0;
            let totalMatchesWon = keep.matches_won || 0;
            let totalMatchesLost = keep.matches_lost || 0;
            let bestElo = keep.current_elo_rating || 800;

            for (const dup of remove) {
                totalMatchesPlayed += (dup.matches_played || 0);
                totalMatchesWon += (dup.matches_won || 0);
                totalMatchesLost += (dup.matches_lost || 0);
                bestElo = Math.max(bestElo, dup.current_elo_rating || 800);
            }

            console.log(`   Keeping: ${keep.id} (${keep.player1_name} + ${keep.player2_name})`);
            console.log(`   Merged stats: ${totalMatchesWon}W / ${totalMatchesLost}L`);
            console.log(`   Deleting: ${remove.map(p => p.id).join(', ')}\n`);

            // Ensure the kept pairing has sorted player IDs
            const [sortedP1, sortedP2] = [keep.player1_id, keep.player2_id].sort();
            const needsPlayerSwap = sortedP1 !== keep.player1_id;

            // Prepare update for the kept pairing
            pairingsToUpdate.push({
                id: keep.id,
                player1_id: sortedP1,
                player2_id: sortedP2,
                player1_name: needsPlayerSwap ? keep.player2_name : keep.player1_name,
                player2_name: needsPlayerSwap ? keep.player1_name : keep.player2_name,
                player1_club_id_at_match: needsPlayerSwap ? keep.player2_club_id_at_match : keep.player1_club_id_at_match,
                player2_club_id_at_match: needsPlayerSwap ? keep.player1_club_id_at_match : keep.player2_club_id_at_match,
                matches_played: totalMatchesPlayed,
                matches_won: totalMatchesWon,
                matches_lost: totalMatchesLost,
                win_rate: totalMatchesPlayed > 0 ? (totalMatchesWon / totalMatchesPlayed) : 0,
                current_elo_rating: bestElo
            });

            duplicatesToDelete.push(...remove.map(p => p.id));
        } else {
            // Single pairing - just ensure player IDs are sorted
            const pairing = group[0];
            const [sortedP1, sortedP2] = [pairing.player1_id, pairing.player2_id].sort();

            if (sortedP1 !== pairing.player1_id) {
                console.log(`🔄 Fixing player order for: ${pairing.player1_name} + ${pairing.player2_name}`);

                pairingsToUpdate.push({
                    id: pairing.id,
                    player1_id: sortedP1,
                    player2_id: sortedP2,
                    player1_name: pairing.player2_name,
                    player2_name: pairing.player1_name,
                    player1_club_id_at_match: pairing.player2_club_id_at_match,
                    player2_club_id_at_match: pairing.player1_club_id_at_match
                });
            }
        }
    }

    // Delete duplicates first
    if (duplicatesToDelete.length > 0) {
        console.log(`\n🗑️ Deleting ${duplicatesToDelete.length} duplicate pairings...\n`);

        const { error: deleteError } = await supabase
            .from('doubles_pairings')
            .delete()
            .in('id', duplicatesToDelete);

        if (deleteError) {
            console.error('❌ Error deleting duplicate pairings:', deleteError.message);
            return;
        }

        console.log(`✅ Successfully deleted ${duplicatesToDelete.length} duplicate pairings!`);
    } else {
        console.log('✅ No duplicate pairings found!');
    }

    // Update remaining pairings with merged stats and sorted player IDs
    if (pairingsToUpdate.length > 0) {
        console.log(`\n🔄 Updating ${pairingsToUpdate.length} pairings with merged stats and sorted player IDs...\n`);

        for (const update of pairingsToUpdate) {
            const { error: updateError } = await supabase
                .from('doubles_pairings')
                .update(update)
                .eq('id', update.id);

            if (updateError) {
                console.error(`❌ Error updating pairing ${update.id}:`, updateError.message);
            }
        }

        console.log('✅ Pairings updated successfully!');
    }

    // Verify final count
    const { count } = await supabase
        .from('doubles_pairings')
        .select('*', { count: 'exact', head: true });

    console.log(`\n📊 Final count: ${count} doubles pairings in database`);
}

async function main() {
    console.log('🚀 Starting Duplicate Removal...\n');
    console.log('='.repeat(50));

    await removeDuplicateDoublesMatches();
    await removeDuplicateDoublesPairings();

    console.log('\n' + '='.repeat(50));
    console.log('✅ Duplicate Removal Complete!');
}

main();
