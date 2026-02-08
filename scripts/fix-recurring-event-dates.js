/**
 * Script to fix incorrect dates in points_history for recurring events
 *
 * The bug: When attendance was saved for recurring events, the reason showed
 * the original event start_date (e.g., "16.01.2026") instead of the actual
 * occurrence_date (e.g., "06.02.2026").
 *
 * This script:
 * 1. Finds points_history entries awarded by 'System (Veranstaltung)'
 * 2. Matches them to event_attendance records by timestamp and user
 * 3. Updates the reason to use the correct occurrence_date
 *
 * Usage: node scripts/fix-recurring-event-dates.js [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    console.error('Make sure you have a .env file with these values');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const isDryRun = process.argv.includes('--dry-run');

async function fixRecurringEventDates() {
    console.log('='.repeat(60));
    console.log('Fix Recurring Event Dates in Points History');
    console.log('='.repeat(60));
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    console.log('');

    // Step 1: Get all points_history entries from event attendance
    console.log('Step 1: Loading points_history entries from events...');
    const { data: pointsEntries, error: pointsError } = await supabase
        .from('points_history')
        .select('id, user_id, reason, timestamp, points')
        .eq('awarded_by', 'System (Veranstaltung)')
        .gt('points', 0) // Only positive points (awards, not deductions)
        .order('timestamp', { ascending: false });

    if (pointsError) {
        console.error('Error loading points_history:', pointsError);
        return;
    }

    console.log(`Found ${pointsEntries.length} event attendance points entries`);
    console.log('');

    // Step 2: Get all event_attendance records with occurrence_date
    console.log('Step 2: Loading event_attendance records...');
    const { data: attendances, error: attendanceError } = await supabase
        .from('event_attendance')
        .select(`
            id,
            event_id,
            occurrence_date,
            present_user_ids,
            points_awarded_to,
            created_at,
            events!inner(
                id,
                title,
                start_date,
                event_type
            )
        `)
        .not('occurrence_date', 'is', null);

    if (attendanceError) {
        console.error('Error loading event_attendance:', attendanceError);
        return;
    }

    console.log(`Found ${attendances.length} event_attendance records with occurrence_date`);
    console.log('');

    // Step 3: Match and fix
    console.log('Step 3: Matching and fixing entries...');
    let fixedCount = 0;
    let skippedCount = 0;
    let alreadyCorrectCount = 0;
    let noMatchCount = 0;

    for (const entry of pointsEntries) {
        // Extract the date from the current reason (wrong date)
        const dateMatch = entry.reason.match(/am (\d{2}\.\d{2}\.\d{4})/);
        if (!dateMatch) {
            skippedCount++;
            continue;
        }

        const currentDateStr = dateMatch[1]; // e.g., "16.01.2026"

        // Convert timestamp to Date for comparison
        const entryTime = new Date(entry.timestamp);

        // Find matching attendance record
        // Match criteria:
        // 1. User is in points_awarded_to or present_user_ids
        // 2. Timestamp is within 1 hour of attendance created_at
        // 3. Event title appears in the reason
        let matchedAttendance = null;

        for (const att of attendances) {
            const attTime = new Date(att.created_at);
            const timeDiff = Math.abs(entryTime - attTime);
            const isWithinTimeWindow = timeDiff < 60 * 60 * 1000; // 1 hour

            const userInAttendance =
                (att.points_awarded_to && att.points_awarded_to.includes(entry.user_id)) ||
                (att.present_user_ids && att.present_user_ids.includes(entry.user_id));

            const eventTitle = att.events?.title || '';
            const titleInReason = eventTitle && entry.reason.includes(eventTitle);

            if (isWithinTimeWindow && userInAttendance && titleInReason) {
                matchedAttendance = att;
                break;
            }
        }

        if (!matchedAttendance) {
            noMatchCount++;
            continue;
        }

        // Check if the date is actually wrong
        const occurrenceDate = new Date(matchedAttendance.occurrence_date + 'T12:00:00');
        const correctDateStr = occurrenceDate.toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        if (currentDateStr === correctDateStr) {
            alreadyCorrectCount++;
            continue;
        }

        // Date is wrong, fix it
        const newReason = entry.reason.replace(currentDateStr, correctDateStr);

        console.log(`  Entry ${entry.id}:`);
        console.log(`    User: ${entry.user_id}`);
        console.log(`    Old: "${entry.reason}"`);
        console.log(`    New: "${newReason}"`);
        console.log(`    Date change: ${currentDateStr} → ${correctDateStr}`);

        if (!isDryRun) {
            const { error: updateError } = await supabase
                .from('points_history')
                .update({ reason: newReason })
                .eq('id', entry.id);

            if (updateError) {
                console.log(`    ❌ Error: ${updateError.message}`);
            } else {
                console.log(`    ✅ Fixed`);
                fixedCount++;
            }
        } else {
            console.log(`    🔍 Would fix (dry run)`);
            fixedCount++;
        }
        console.log('');
    }

    // Also fix xp_history
    console.log('Step 4: Fixing xp_history entries...');
    const { data: xpEntries, error: xpError } = await supabase
        .from('xp_history')
        .select('id, user_id, reason, created_at, xp')
        .eq('source', 'event_attendance')
        .gt('xp', 0);

    if (!xpError && xpEntries) {
        let xpFixedCount = 0;

        for (const entry of xpEntries) {
            const dateMatch = entry.reason.match(/am (\d{2}\.\d{2}\.\d{4})/);
            if (!dateMatch) continue;

            const currentDateStr = dateMatch[1];
            const entryTime = new Date(entry.created_at);

            let matchedAttendance = null;
            for (const att of attendances) {
                const attTime = new Date(att.created_at);
                const timeDiff = Math.abs(entryTime - attTime);
                const isWithinTimeWindow = timeDiff < 60 * 60 * 1000;

                const userInAttendance =
                    (att.points_awarded_to && att.points_awarded_to.includes(entry.user_id)) ||
                    (att.present_user_ids && att.present_user_ids.includes(entry.user_id));

                const eventTitle = att.events?.title || '';
                const titleInReason = eventTitle && entry.reason.includes(eventTitle);

                if (isWithinTimeWindow && userInAttendance && titleInReason) {
                    matchedAttendance = att;
                    break;
                }
            }

            if (!matchedAttendance) continue;

            const occurrenceDate = new Date(matchedAttendance.occurrence_date + 'T12:00:00');
            const correctDateStr = occurrenceDate.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            if (currentDateStr === correctDateStr) continue;

            const newReason = entry.reason.replace(currentDateStr, correctDateStr);

            if (!isDryRun) {
                await supabase
                    .from('xp_history')
                    .update({ reason: newReason })
                    .eq('id', entry.id);
            }
            xpFixedCount++;
        }

        console.log(`  Fixed ${xpFixedCount} xp_history entries`);
    }

    // Summary
    console.log('');
    console.log('='.repeat(60));
    console.log('Summary');
    console.log('='.repeat(60));
    console.log(`Total entries processed: ${pointsEntries.length}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Already correct: ${alreadyCorrectCount}`);
    console.log(`No match found: ${noMatchCount}`);
    console.log(`Skipped (no date in reason): ${skippedCount}`);
    console.log('');

    if (isDryRun) {
        console.log('This was a DRY RUN. No changes were made.');
        console.log('Run without --dry-run to apply changes.');
    } else {
        console.log('Changes have been applied to the database.');
    }
}

fixRecurringEventDates().catch(console.error);
