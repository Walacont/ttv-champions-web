/**
 * Browser Migration Script: Add points_history entries for existing matches
 *
 * HOW TO USE:
 * 1. Open your app in the browser (logged in as admin/coach)
 * 2. Open Developer Tools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 */

(async function migrateMatchesToPointsHistory() {
    // Get supabase from the global scope (it's already initialized in your app)
    const supabase = window.supabase || (await import('/js/supabase-init.js')).getSupabase();

    if (!supabase) {
        console.error('❌ Supabase not found! Make sure you are on a page where Supabase is initialized.');
        return;
    }

    console.log('🚀 Starting migration of matches to points_history...\n');

    // Get all matches
    const { data: matches, error: matchesError } = await supabase
        .from('matches')
        .select(`
            id,
            player_a_id,
            player_b_id,
            winner_id,
            loser_id,
            player_a_sets_won,
            player_b_sets_won,
            player_a_elo_before,
            player_b_elo_before,
            player_a_elo_after,
            player_b_elo_after,
            handicap_used,
            played_at,
            created_at
        `)
        .order('played_at', { ascending: true });

    if (matchesError) {
        console.error('❌ Error fetching matches:', matchesError);
        return;
    }

    console.log(`📊 Found ${matches.length} matches to process.\n`);

    // Get all player names
    const playerIds = new Set();
    matches.forEach(m => {
        if (m.player_a_id) playerIds.add(m.player_a_id);
        if (m.player_b_id) playerIds.add(m.player_b_id);
    });

    const { data: players } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', Array.from(playerIds));

    const playerMap = {};
    (players || []).forEach(p => {
        playerMap[p.id] = `${p.first_name} ${p.last_name}`;
    });

    // Check which matches already have points_history entries
    const { data: existingHistory } = await supabase
        .from('points_history')
        .select('reason, timestamp, user_id')
        .eq('awarded_by', 'System (Wettkampf)');

    // Create a set of existing entries for quick lookup
    const existingSet = new Set();
    (existingHistory || []).forEach(h => {
        const key = `${h.user_id}-${h.timestamp?.substring(0, 16)}`;
        existingSet.add(key);
    });

    console.log(`📝 Found ${existingHistory?.length || 0} existing match history entries.\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const {
            winner_id,
            loser_id,
            player_a_id,
            player_b_id,
            player_a_sets_won,
            player_b_sets_won,
            player_a_elo_before,
            player_b_elo_before,
            player_a_elo_after,
            player_b_elo_after,
            handicap_used,
            played_at
        } = match;

        // Progress indicator every 10 matches
        if (i % 10 === 0) {
            console.log(`Processing match ${i + 1}/${matches.length}...`);
        }

        if (!winner_id || !loser_id) {
            skipped++;
            continue;
        }

        const playedAt = played_at || match.created_at || new Date().toISOString();

        // Check if entries already exist
        const winnerKey = `${winner_id}-${playedAt.substring(0, 16)}`;
        const loserKey = `${loser_id}-${playedAt.substring(0, 16)}`;

        if (existingSet.has(winnerKey) || existingSet.has(loserKey)) {
            skipped++;
            continue;
        }

        const winnerName = playerMap[winner_id] || 'Gegner';
        const loserName = playerMap[loser_id] || 'Gegner';

        // Calculate ELO changes
        const winnerEloChange = winner_id === player_a_id
            ? (player_a_elo_after - player_a_elo_before) || 0
            : (player_b_elo_after - player_b_elo_before) || 0;
        const loserEloChange = loser_id === player_a_id
            ? (player_a_elo_after - player_a_elo_before) || 0
            : (player_b_elo_after - player_b_elo_before) || 0;

        // Calculate points
        const winnerPoints = Math.max(10, Math.abs(winnerEloChange) || 10);
        const loserPoints = 5;

        const matchType = handicap_used ? 'Handicap-Einzel' : 'Einzel';
        const setsDisplay = `${player_a_sets_won || 0}:${player_b_sets_won || 0}`;

        try {
            // Create winner entry
            const { error: winnerError } = await supabase
                .from('points_history')
                .insert({
                    user_id: winner_id,
                    points: winnerPoints,
                    xp: winnerPoints,
                    elo_change: winnerEloChange,
                    reason: `Sieg im ${matchType} gegen ${loserName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (winnerError) {
                console.error(`❌ Winner entry error:`, winnerError.message);
                errors++;
            } else {
                created++;
            }

            // Create loser entry
            const { error: loserError } = await supabase
                .from('points_history')
                .insert({
                    user_id: loser_id,
                    points: loserPoints,
                    xp: loserPoints,
                    elo_change: loserEloChange,
                    reason: `Niederlage im ${matchType} gegen ${winnerName} (${setsDisplay})`,
                    timestamp: playedAt,
                    awarded_by: 'System (Wettkampf)'
                });

            if (loserError) {
                console.error(`❌ Loser entry error:`, loserError.message);
                errors++;
            } else {
                created++;
            }

            // Add to existing set to avoid duplicates in this run
            existingSet.add(winnerKey);
            existingSet.add(loserKey);

        } catch (err) {
            console.error(`❌ Error processing match ${match.id}:`, err.message);
            errors++;
        }
    }

    console.log('\n--- ✅ Migration Complete ---');
    console.log(`✅ Created: ${created} points_history entries`);
    console.log(`⏭️ Skipped: ${skipped} matches (already have entries or invalid)`);
    console.log(`❌ Errors: ${errors}`);

    if (created > 0) {
        console.log('\n🎉 Done! Refresh the page to see the updated points history.');
    }
})();
