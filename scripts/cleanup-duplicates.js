/**
 * Bereinigt doppelte Profile und korrigiert "Unknown Player" Namen
 * Verwendung: node scripts/cleanup-duplicates.js
 */

import { createClient } from '@supabase/supabase-js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const serviceAccountPath = join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

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

async function findAndRemoveDuplicates() {
    log('Finding duplicate profiles...', 'progress');

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, display_name, xp, elo_rating, role');

    if (error) {
        log(`Error fetching profiles: ${error.message}`, 'error');
        return;
    }

    const emailGroups = {};
    for (const profile of profiles) {
        if (profile.email) {
            if (!emailGroups[profile.email]) {
                emailGroups[profile.email] = [];
            }
            emailGroups[profile.email].push(profile);
        }
    }

    let duplicatesRemoved = 0;
    for (const [email, group] of Object.entries(emailGroups)) {
        if (group.length > 1) {
            log(`  Duplicate found: ${email} (${group.length} entries)`, 'warn');

            // Sortiere nach Gesamtscore (XP + Elo) für Fallback
            group.sort((a, b) => {
                const scoreA = (a.xp || 0) + (a.elo_rating || 0);
                const scoreB = (b.xp || 0) + (b.elo_rating || 0);
                return scoreB - scoreA;
            });

            const { data: authUsers } = await supabase.auth.admin.listUsers();
            const authUserIds = new Set(authUsers?.users?.map(u => u.id) || []);

            // Bevorzuge auth.users Eintrag, sonst den mit höchstem Score
            let keepProfile = group[0];
            for (const profile of group) {
                if (authUserIds.has(profile.id)) {
                    keepProfile = profile;
                    break;
                }
            }

            for (const profile of group) {
                if (profile.id !== keepProfile.id) {
                    log(`    Removing: ${profile.id} (${profile.display_name})`, 'info');
                    const { error: deleteError } = await supabase
                        .from('profiles')
                        .delete()
                        .eq('id', profile.id);

                    if (deleteError) {
                        log(`    Error deleting: ${deleteError.message}`, 'error');
                    } else {
                        duplicatesRemoved++;
                    }
                }
            }
            log(`    Kept: ${keepProfile.id} (${keepProfile.display_name})`, 'success');
        }
    }

    log(`Removed ${duplicatesRemoved} duplicate profiles`, 'success');
}

async function fixUnknownPlayerNames() {
    log('Fixing Unknown Player names...', 'progress');

    const { data: unknownProfiles, error } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .or('display_name.eq.Unknown Player,display_name.eq.Unknown');

    if (error) {
        log(`Error fetching profiles: ${error.message}`, 'error');
        return;
    }

    log(`Found ${unknownProfiles?.length || 0} profiles with Unknown name`, 'info');

    // Lade ID-Mappings um ursprüngliche Firebase-IDs zu finden
    let idMappings = {};
    try {
        const mappingsPath = join(__dirname, 'id-mappings.json');
        idMappings = JSON.parse(readFileSync(mappingsPath, 'utf8'));
    } catch (e) {
        log('Could not load id-mappings.json, will use email lookup', 'warn');
    }

    // Reverse Mapping: Supabase ID -> Firebase ID
    const reverseMapping = {};
    for (const [firebaseId, supabaseId] of Object.entries(idMappings.users || {})) {
        reverseMapping[supabaseId] = firebaseId;
    }

    let fixedCount = 0;
    for (const profile of unknownProfiles || []) {
        let firebaseId = reverseMapping[profile.id];
        let firebaseData = null;

        if (firebaseId) {
            try {
                const doc = await firestore.collection('users').doc(firebaseId).get();
                if (doc.exists) {
                    firebaseData = doc.data();
                }
            } catch (e) {
                // Ignore
            }
        }

        // Fallback: Suche via E-Mail wenn keine ID-Zuordnung existiert
        if (!firebaseData && profile.email) {
            try {
                const snapshot = await firestore.collection('users')
                    .where('email', '==', profile.email)
                    .limit(1)
                    .get();

                if (!snapshot.empty) {
                    firebaseData = snapshot.docs[0].data();
                }
            } catch (e) {
                // Ignore
            }
        }

        if (firebaseData) {
            let displayName = firebaseData.displayName || firebaseData.name;
            if (!displayName && (firebaseData.firstName || firebaseData.lastName)) {
                displayName = `${firebaseData.firstName || ''} ${firebaseData.lastName || ''}`.trim();
            }

            if (displayName && displayName !== 'Unknown Player' && displayName !== 'Unknown') {
                log(`  Fixing: ${profile.id} → "${displayName}"`, 'info');

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ display_name: displayName })
                    .eq('id', profile.id);

                if (updateError) {
                    log(`    Error: ${updateError.message}`, 'error');
                } else {
                    fixedCount++;
                }
            } else {
                log(`  No name found for: ${profile.email || profile.id}`, 'warn');
            }
        } else {
            log(`  No Firebase data for: ${profile.email || profile.id}`, 'warn');
        }
    }

    log(`Fixed ${fixedCount} profile names`, 'success');
}

async function main() {
    console.log('\n========================================');
    console.log('  Profile Cleanup Script');
    console.log('========================================\n');

    try {
        await findAndRemoveDuplicates();
        console.log('');
        await fixUnknownPlayerNames();

        console.log('\n========================================');
        log('Cleanup completed!', 'success');
        console.log('========================================\n');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();
