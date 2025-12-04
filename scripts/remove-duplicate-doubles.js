/**
 * Script to remove duplicate doubles matches from Supabase
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
        console.log('✅ No duplicates found!');
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
    console.log('\n🔍 Finding duplicate doubles pairings...\n');

    // Fetch all doubles pairings
    const { data: pairings, error } = await supabase
        .from('doubles_pairings')
        .select('id, player1_id, player2_id, created_at')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ Error fetching pairings:', error.message);
        return;
    }

    console.log(`Found ${pairings.length} total doubles pairings\n`);

    // Group by unique pairing key (players sorted)
    const pairingGroups = {};

    pairings.forEach(pairing => {
        // ID format is already player1_player2 (sorted), use it as key
        const key = pairing.id;

        if (!pairingGroups[key]) {
            pairingGroups[key] = [];
        }
        pairingGroups[key].push(pairing);
    });

    // Find duplicates (shouldn't happen since ID is the key, but check anyway)
    let duplicateCount = 0;

    for (const [key, group] of Object.entries(pairingGroups)) {
        if (group.length > 1) {
            console.log(`📋 Found ${group.length} duplicates for pairing: ${key}`);
            duplicateCount += group.length - 1;
        }
    }

    if (duplicateCount === 0) {
        console.log('✅ No duplicate pairings found!');
    }
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
