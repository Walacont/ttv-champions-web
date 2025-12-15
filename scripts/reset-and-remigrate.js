/**
 * Reset and Re-Migrate Script
 *
 * Clears all profiles and re-runs migration from Firebase
 *
 * Usage: node scripts/reset-and-remigrate.js
 */

import { createClient } from '@supabase/supabase-js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase config
const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// Load Firebase service account
const serviceAccountPath = join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const firestore = getFirestore();

function log(message, type = 'info') {
    const prefix = {
        info: '📋',
        success: '✅',
        error: '❌',
        warn: '⚠️',
        progress: '🔄'
    };
    console.log(`${prefix[type] || '•'} ${message}`);
}

function convertTimestamp(firestoreTimestamp) {
    if (!firestoreTimestamp) return null;
    if (firestoreTimestamp.toDate) {
        return firestoreTimestamp.toDate().toISOString();
    }
    if (firestoreTimestamp._seconds) {
        return new Date(firestoreTimestamp._seconds * 1000).toISOString();
    }
    return firestoreTimestamp;
}

async function clearProfiles() {
    log('Clearing existing profiles and related data...', 'progress');

    // Delete dependent tables first (in correct order due to foreign keys)
    // Tables with composite primary keys or user_id column
    const tablesWithUserId = [
        'completed_exercises',
        'completed_challenges',
        'exercise_milestones',
        'xp_history',
        'points_history',
        'streaks',
        'attendance'
    ];

    for (const table of tablesWithUserId) {
        const { error } = await supabase.from(table).delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
        if (error && error.code !== 'PGRST116') {
            log(`  Warning: Could not clear ${table}: ${error.message}`, 'warn');
        } else {
            log(`  Cleared ${table}`, 'info');
        }
    }

    // Tables with id column
    const tablesWithId = [
        'match_requests',
        'match_proposals',
        'doubles_match_requests',
        'matches',
        'doubles_matches',
        'doubles_pairings',
        'club_requests',
        'leave_club_requests',
        'training_sessions'
    ];

    for (const table of tablesWithId) {
        const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error && error.code !== 'PGRST116') {
            log(`  Warning: Could not clear ${table}: ${error.message}`, 'warn');
        } else {
            log(`  Cleared ${table}`, 'info');
        }
    }

    // subgroup_members has composite primary key (subgroup_id, user_id)
    const { error: sgError } = await supabase
        .from('subgroup_members')
        .delete()
        .neq('user_id', '00000000-0000-0000-0000-000000000000');
    if (sgError && sgError.code !== 'PGRST116') {
        log(`  Warning: Could not clear subgroup_members: ${sgError.message}`, 'warn');
    } else {
        log(`  Cleared subgroup_members`, 'info');
    }

    // Clear exercises created_by reference (set to null instead of delete)
    const { error: exerciseError } = await supabase
        .from('exercises')
        .update({ created_by: null })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (exerciseError) {
        log(`  Warning: Could not clear exercises.created_by: ${exerciseError.message}`, 'warn');
    }

    // Clear challenges created_by reference
    const { error: challengeError } = await supabase
        .from('challenges')
        .update({ created_by: null })
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (challengeError) {
        log(`  Warning: Could not clear challenges.created_by: ${challengeError.message}`, 'warn');
    }

    // Now delete all profiles
    const { error } = await supabase
        .from('profiles')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        log(`Error clearing profiles: ${error.message}`, 'error');
        throw error;
    }

    log('Profiles cleared', 'success');
}

async function migrateProfiles() {
    log('Migrating profiles from Firebase...', 'progress');

    // Get all existing Supabase Auth users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authUsers = authData?.users || [];
    const authUsersByEmail = {};
    for (const user of authUsers) {
        if (user.email) {
            authUsersByEmail[user.email.toLowerCase()] = user;
        }
    }
    log(`Found ${authUsers.length} existing auth users`, 'info');

    // Get all Firebase users
    const snapshot = await firestore.collection('users').get();
    log(`Found ${snapshot.size} Firebase users`, 'info');

    const profiles = [];
    const idMappings = { users: {} };

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let supabaseUserId = null;

        // Check if user exists in Supabase Auth (by email)
        if (data.email) {
            const authUser = authUsersByEmail[data.email.toLowerCase()];
            if (authUser) {
                supabaseUserId = authUser.id;
                log(`  Auth user found: ${data.email} → ${supabaseUserId}`, 'info');
            }
        }

        // For offline users or users without auth, generate a UUID
        if (!supabaseUserId) {
            supabaseUserId = randomUUID();
            log(`  Generated UUID for: ${data.email || doc.id} → ${supabaseUserId}`, 'info');
        }

        // Store mapping
        idMappings.users[doc.id] = supabaseUserId;

        // Map club ID
        const { data: clubData } = await supabase
            .from('clubs')
            .select('id')
            .limit(1);

        // For now, try to find club by name or use null
        let clubId = null;
        if (data.clubId) {
            // Try to find club mapping
            const { data: existingClubs } = await supabase
                .from('clubs')
                .select('id, name');

            // Match by original Firebase club ID stored somewhere or by name
            for (const club of existingClubs || []) {
                // Simple heuristic - will be improved
                if (data.clubId.includes('Lokstedt') || data.clubName?.includes('Lokstedt')) {
                    if (club.name?.includes('Lokstedt')) clubId = club.id;
                } else if (data.clubId.includes('Harksheide') || data.clubName?.includes('Harksheide')) {
                    if (club.name?.includes('Harksheide')) clubId = club.id;
                } else if (data.clubId.includes('Test') || data.clubName?.includes('Test')) {
                    if (club.name?.includes('Test')) clubId = club.id;
                }
            }
        }

        // 1:1 Firebase Felder übernehmen
        profiles.push({
            id: supabaseUserId,

            // Basis-Daten
            email: data.email || null,
            first_name: data.firstName || null,
            last_name: data.lastName || null,
            birthdate: data.birthdate || null,
            gender: data.gender || null,
            photo_url: data.photoURL || data.avatarUrl || null,
            role: data.role || 'player',
            club_id: clubId,

            // Stats
            xp: data.xp || 0,
            points: data.points || 0,
            elo_rating: data.eloRating || 1000,
            highest_elo: data.highestElo || data.eloRating || 1000,
            league: data.league || null,

            // Doubles Stats
            doubles_elo_rating: data.doublesEloRating || 1000,
            highest_doubles_elo: data.highestDoublesElo || data.doublesEloRating || 1000,
            doubles_matches_played: data.doublesMatchesPlayed || 0,
            doubles_matches_won: data.doublesMatchesWon || 0,
            doubles_matches_lost: data.doublesMatchesLost || 0,

            // Tischtennis-spezifisch
            qttr_points: data.qttrPoints || null,
            grundlagen_completed: data.grundlagenCompleted || 0,

            // Status Flags
            is_offline: data.isOffline || false,
            is_match_ready: data.isMatchReady || false,
            onboarding_complete: data.onboardingComplete !== false,

            // Push Notifications
            fcm_token: data.fcmToken || null,
            fcm_token_updated_at: convertTimestamp(data.fcmTokenUpdatedAt),
            notifications_enabled: data.notificationsEnabled !== false,
            notification_preferences: data.notificationPreferences || null,
            notification_preferences_updated_at: convertTimestamp(data.notificationPreferencesUpdatedAt),

            // Leaderboard & Privacy
            leaderboard_preferences: data.leaderboardPreferences || null,
            privacy_settings: data.privacySettings || null,

            // Season Tracking
            last_season_reset: convertTimestamp(data.lastSeasonReset),
            last_xp_update: convertTimestamp(data.lastXPUpdate),

            // Subgroups (Firebase Array)
            subgroup_ids: data.subgroupIDs || null,

            // Migration Tracking
            migrated_at: convertTimestamp(data.migratedAt),
            migrated_from: data.migratedFrom || doc.id,

            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    // Insert profiles
    log(`Inserting ${profiles.length} profiles...`, 'progress');

    let successCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
        const { error } = await supabase
            .from('profiles')
            .upsert(profile, { onConflict: 'id' });

        if (error) {
            log(`  Error inserting ${profile.email || profile.id}: ${error.message}`, 'error');
            errorCount++;
        } else {
            successCount++;
        }
    }

    log(`Migrated ${successCount} profiles (${errorCount} errors)`, 'success');

    // Save ID mappings
    const mappingFile = join(__dirname, 'id-mappings-new.json');
    writeFileSync(mappingFile, JSON.stringify(idMappings, null, 2));
    log(`ID mappings saved to: ${mappingFile}`, 'info');

    return idMappings;
}

async function main() {
    console.log('\n========================================');
    console.log('  Reset and Re-Migrate Profiles');
    console.log('========================================\n');

    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise(resolve => {
        rl.question('⚠️  Dies löscht ALLE Profile und migriert neu. Fortfahren? (ja/nein): ', resolve);
    });
    rl.close();

    if (answer.toLowerCase() !== 'ja') {
        log('Abgebrochen.', 'warn');
        process.exit(0);
    }

    try {
        await clearProfiles();
        await migrateProfiles();

        console.log('\n========================================');
        log('Migration abgeschlossen!', 'success');
        console.log('========================================\n');
        console.log('Bitte Browser refreshen (Ctrl+Shift+R)');

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();
