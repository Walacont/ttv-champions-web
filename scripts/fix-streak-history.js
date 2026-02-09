/**
 * Script to fix incorrect streak values in points_history
 *
 * The bug: Streaks were calculated incorrectly, causing wrong streak bonuses
 * and reason texts in the points_history.
 *
 * This script:
 * 1. Loads all training attendance records chronologically
 * 2. Recalculates correct streaks for each player/subgroup
 * 3. Updates points_history with correct streak values and adjusted points
 *
 * Usage: node scripts/fix-streak-history.js [--dry-run] [--club-id=<id>]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const isDryRun = process.argv.includes('--dry-run');
const clubIdArg = process.argv.find(arg => arg.startsWith('--club-id='));
const specificClubId = clubIdArg ? clubIdArg.split('=')[1] : null;

async function fixStreakHistory() {
    console.log('='.repeat(60));
    console.log('Fix Streak History in Points History');
    console.log('='.repeat(60));
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    if (specificClubId) {
        console.log(`Club: ${specificClubId}`);
    }
    console.log('');

    try {
        // 1. Get all clubs (or specific club)
        let clubsQuery = supabase.from('clubs').select('id, name');
        if (specificClubId) {
            clubsQuery = clubsQuery.eq('id', specificClubId);
        }
        const { data: clubs, error: clubsError } = await clubsQuery;

        if (clubsError) throw clubsError;
        console.log(`Found ${clubs.length} club(s) to process\n`);

        let totalUpdated = 0;
        let totalSkipped = 0;

        for (const club of clubs) {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`Processing club: ${club.name} (${club.id})`);
            console.log('='.repeat(50));

            const result = await processClub(club.id);
            totalUpdated += result.updated;
            totalSkipped += result.skipped;
        }

        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total entries updated: ${totalUpdated}`);
        console.log(`Total entries skipped (already correct): ${totalSkipped}`);

        if (isDryRun) {
            console.log('\n⚠️  DRY RUN - No changes were made. Run without --dry-run to apply changes.');
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

async function processClub(clubId) {
    let updated = 0;
    let skipped = 0;

    // 1. Load all training events for this club
    const { data: trainingEvents, error: eventsError } = await supabase
        .from('events')
        .select('id, title, start_date, target_subgroup_ids, event_category, club_id')
        .eq('club_id', clubId)
        .eq('event_category', 'training');

    if (eventsError) throw eventsError;
    console.log(`  Found ${trainingEvents?.length || 0} training events`);

    if (!trainingEvents || trainingEvents.length === 0) {
        return { updated: 0, skipped: 0 };
    }

    // 2. Load all attendance records with occurrence_date
    const eventIds = trainingEvents.map(e => e.id);
    const { data: attendanceData, error: attError } = await supabase
        .from('event_attendance')
        .select('id, event_id, present_user_ids, occurrence_date, created_at')
        .in('event_id', eventIds);

    if (attError) throw attError;
    console.log(`  Found ${attendanceData?.length || 0} attendance records`);

    // 3. Load all players in this club
    const { data: players, error: playersError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, subgroup_ids')
        .eq('club_id', clubId)
        .in('role', ['player', 'coach', 'head_coach']);

    if (playersError) throw playersError;
    console.log(`  Found ${players?.length || 0} players`);

    // 4. Load subgroups for name lookup
    const { data: subgroups } = await supabase
        .from('subgroups')
        .select('id, name, is_default')
        .eq('club_id', clubId);

    const subgroupMap = new Map();
    let fallbackSubgroupId = null;
    subgroups?.forEach(sg => {
        subgroupMap.set(sg.id, sg.name);
        if (sg.is_default) fallbackSubgroupId = sg.id;
    });

    // 5. Build event map
    const eventMap = new Map();
    trainingEvents.forEach(e => eventMap.set(e.id, e));

    // 6. Build attendance list with actual dates, sorted chronologically
    const allAttendances = (attendanceData || []).map(a => {
        const event = eventMap.get(a.event_id);
        return {
            ...a,
            event,
            actualDate: a.occurrence_date || event?.start_date,
            subgroupIds: event?.target_subgroup_ids || [],
            present_user_ids: a.present_user_ids || []
        };
    }).filter(a => a.actualDate)
      .sort((a, b) => a.actualDate.localeCompare(b.actualDate));

    console.log(`  Sorted ${allAttendances.length} attendance records chronologically`);

    // 7. For each player, calculate correct streaks at each attendance
    const playerCorrectStreaks = new Map(); // playerId -> Map<attendanceKey, correctStreak>

    for (const player of players || []) {
        const playerSubgroups = player.subgroup_ids || [];
        const subgroupStreaks = new Map(); // subgroupId -> currentStreak
        const streakHistory = new Map(); // `${eventId}_${occurrenceDate}` -> correctStreak

        for (const attendance of allAttendances) {
            const eventSubgroups = attendance.subgroupIds;
            const isClubWide = eventSubgroups.length === 0;
            const wasInvited = isClubWide || eventSubgroups.some(sg => playerSubgroups.includes(sg));

            if (!wasInvited) continue;

            // Determine subgroup for streak tracking
            let subgroupId = eventSubgroups[0];
            if (!subgroupId && fallbackSubgroupId) {
                subgroupId = fallbackSubgroupId;
            }
            if (!subgroupId) continue;

            const wasPresent = attendance.present_user_ids.includes(player.id);

            if (!subgroupStreaks.has(subgroupId)) {
                subgroupStreaks.set(subgroupId, 0);
            }

            let currentStreak = subgroupStreaks.get(subgroupId);

            if (wasPresent) {
                currentStreak++;
                subgroupStreaks.set(subgroupId, currentStreak);

                // Store the correct streak for this attendance
                const key = `${attendance.event_id}_${attendance.actualDate}`;
                streakHistory.set(key, {
                    streak: currentStreak,
                    subgroupId,
                    subgroupName: subgroupMap.get(subgroupId) || 'Unbekannt'
                });
            } else {
                // Reset streak
                subgroupStreaks.set(subgroupId, 0);
            }
        }

        playerCorrectStreaks.set(player.id, streakHistory);
    }

    // 8. Load points_history entries for training attendance
    const { data: pointsHistory, error: phError } = await supabase
        .from('points_history')
        .select('id, user_id, points, reason, created_at')
        .eq('awarded_by', 'System (Veranstaltung)')
        .in('user_id', players.map(p => p.id))
        .like('reason', '%Training%');

    if (phError) throw phError;
    console.log(`  Found ${pointsHistory?.length || 0} training points_history entries`);

    // 9. Also load xp_history entries
    const { data: xpHistory, error: xhError } = await supabase
        .from('xp_history')
        .select('id, user_id, xp, reason, created_at')
        .eq('awarded_by', 'System (Veranstaltung)')
        .in('user_id', players.map(p => p.id))
        .like('reason', '%Training%');

    if (xhError) throw xhError;
    console.log(`  Found ${xpHistory?.length || 0} training xp_history entries`);

    // 10. Match points_history entries to attendance records and fix
    for (const ph of pointsHistory || []) {
        const playerStreakHistory = playerCorrectStreaks.get(ph.user_id);
        if (!playerStreakHistory) continue;

        // Parse the reason to extract event info and current streak
        // Format: "Event Title am DD.MM.YYYY - Subgroup (🔥 Nx Streak!)" or similar
        const reasonMatch = ph.reason.match(/^(.+) am (\d{2})\.(\d{2})\.(\d{4}) - ([^(]+?)(?:\s*\(([^)]+)\))?$/);
        if (!reasonMatch) continue;

        const [, eventTitle, day, month, year, subgroupName, streakPart] = reasonMatch;
        const dateStr = `${year}-${month}-${day}`;

        // Find matching attendance
        let matchingAttendance = null;
        let matchingKey = null;

        for (const attendance of allAttendances) {
            if (attendance.actualDate === dateStr) {
                const event = attendance.event;
                if (event && event.title && ph.reason.includes(event.title.substring(0, 20))) {
                    matchingKey = `${attendance.event_id}_${attendance.actualDate}`;
                    matchingAttendance = attendance;
                    break;
                }
            }
        }

        if (!matchingKey) {
            // Try to find by date and subgroup
            for (const [key, data] of playerStreakHistory) {
                const [eventId, keyDate] = key.split('_');
                if (keyDate === dateStr && ph.reason.includes(data.subgroupName)) {
                    matchingKey = key;
                    break;
                }
            }
        }

        if (!matchingKey || !playerStreakHistory.has(matchingKey)) {
            continue;
        }

        const correctData = playerStreakHistory.get(matchingKey);
        const correctStreak = correctData.streak;

        // Parse current streak from reason
        let currentStreakInReason = 0;
        if (streakPart) {
            const streakMatch = streakPart.match(/(\d+)x/);
            if (streakMatch) {
                currentStreakInReason = parseInt(streakMatch[1], 10);
            }
        }

        // Check if correction is needed
        if (currentStreakInReason === correctStreak) {
            skipped++;
            continue;
        }

        // Calculate correct points
        // Base points = 3, streak bonus starts at streak 3
        const basePoints = 3;
        let correctPoints = basePoints;
        if (correctStreak >= 5) {
            correctPoints = basePoints + 3; // 6 points for 5+ streak
        } else if (correctStreak >= 3) {
            correctPoints = basePoints + 2; // 5 points for 3-4 streak
        }

        // Build correct reason
        let correctReason = `${eventTitle} am ${day}.${month}.${year} - ${subgroupName.trim()}`;
        if (correctStreak >= 5) {
            correctReason += ` (🔥 ${correctStreak}x Streak!)`;
        } else if (correctStreak >= 3) {
            correctReason += ` (⚡ ${correctStreak}x Streak)`;
        }

        const player = players.find(p => p.id === ph.user_id);
        const playerName = player ? `${player.first_name} ${player.last_name}` : ph.user_id;

        console.log(`\n  ${playerName}:`);
        console.log(`    Date: ${dateStr}`);
        console.log(`    Old streak: ${currentStreakInReason || 0}, Correct streak: ${correctStreak}`);
        console.log(`    Old points: ${ph.points}, Correct points: ${correctPoints}`);
        console.log(`    Old reason: ${ph.reason}`);
        console.log(`    New reason: ${correctReason}`);

        if (!isDryRun) {
            // Update points_history
            const { error: updateError } = await supabase
                .from('points_history')
                .update({
                    points: correctPoints,
                    reason: correctReason
                })
                .eq('id', ph.id);

            if (updateError) {
                console.error(`    ❌ Error updating points_history: ${updateError.message}`);
            } else {
                console.log(`    ✅ Updated points_history`);
                updated++;
            }

            // Also update xp_history if exists
            const matchingXp = xpHistory?.find(xp =>
                xp.user_id === ph.user_id &&
                Math.abs(new Date(xp.created_at) - new Date(ph.created_at)) < 5000 // Within 5 seconds
            );

            if (matchingXp) {
                await supabase
                    .from('xp_history')
                    .update({
                        xp: correctPoints,
                        reason: correctReason
                    })
                    .eq('id', matchingXp.id);
                console.log(`    ✅ Updated xp_history`);
            }

            // Update player's total points
            const pointsDiff = correctPoints - ph.points;
            if (pointsDiff !== 0) {
                const { data: playerData } = await supabase
                    .from('profiles')
                    .select('points')
                    .eq('id', ph.user_id)
                    .single();

                if (playerData) {
                    await supabase
                        .from('profiles')
                        .update({ points: (playerData.points || 0) + pointsDiff })
                        .eq('id', ph.user_id);
                    console.log(`    ✅ Adjusted player points by ${pointsDiff > 0 ? '+' : ''}${pointsDiff}`);
                }
            }
        } else {
            updated++;
        }
    }

    return { updated, skipped };
}

// Run the script
fixStreakHistory().then(() => {
    console.log('\nDone!');
    process.exit(0);
}).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
