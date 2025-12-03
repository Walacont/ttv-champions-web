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
    log('Clearing existing profiles...', 'progress');

    // Delete all profiles (cascades to related data)
    const { error } = await supabase
        .from('profiles')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

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

        // Build display name from firstName + lastName
        let displayName = data.displayName || data.name;
        if (!displayName && (data.firstName || data.lastName)) {
            displayName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
        }
        if (!displayName) {
            displayName = data.email ? data.email.split('@')[0] : 'Unknown Player';
        }

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

        profiles.push({
            id: supabaseUserId,
            email: data.email || null,
            display_name: displayName,
            first_name: data.firstName || null,
            last_name: data.lastName || null,
            avatar_url: data.avatarUrl || data.photoURL || null,
            role: data.role || 'player',
            club_id: clubId,
            xp: data.xp || 0,
            points: data.points || 0,
            elo_rating: data.eloRating || data.elo || 1000,
            highest_elo: data.highestElo || data.eloRating || 1000,
            qttr_points: data.qttrPoints || null,
            grundlagen_completed: data.grundlagenCompleted || 0,
            doubles_elo_rating: data.doublesEloRating || 1000,
            is_offline: data.isOffline || !data.email,
            onboarding_complete: data.onboardingComplete !== false,
            privacy_settings: data.privacySettings || { searchable: 'global', showInLeaderboards: true },
            birthdate: data.birthdate || null,
            gender: data.gender || null,
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
