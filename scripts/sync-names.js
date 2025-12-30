/**
 * Synchronisiert firstName und lastName von Firebase Users nach Supabase Profiles
 *
 * Usage: node scripts/sync-names.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// KONFIGURATION
// ============================================

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

const serviceAccountPath = join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

initializeApp({
    credential: cert(serviceAccount)
});

const firestore = getFirestore();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ============================================
// SYNC-FUNKTION
// ============================================

async function syncNames() {
    console.log('🔄 Starting name sync from Firebase to Supabase...\n');

    console.log('📥 Loading users from Firebase...');
    const usersSnapshot = await firestore.collection('users').get();
    console.log(`   Found ${usersSnapshot.size} users in Firebase\n`);

    console.log('📥 Loading profiles from Supabase...');
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, display_name, first_name, last_name');

    if (profilesError) {
        console.error('❌ Error loading Supabase profiles:', profilesError);
        return;
    }
    console.log(`   Found ${profiles.length} profiles in Supabase\n`);

    // E-Mail-Map für schnelles Matching erstellen
    const emailToProfile = {};
    profiles.forEach(p => {
        if (p.email) {
            emailToProfile[p.email.toLowerCase()] = p;
        }
    });

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    console.log('🔄 Syncing names...\n');

    for (const doc of usersSnapshot.docs) {
        const firebaseUser = doc.data();
        const email = firebaseUser.email?.toLowerCase();
        const firstName = firebaseUser.firstName || '';
        const lastName = firebaseUser.lastName || '';

        if (!email) {
            skipped++;
            continue;
        }

        const supabaseProfile = emailToProfile[email];

        if (!supabaseProfile) {
            console.log(`   ⚠️  No Supabase profile for: ${email}`);
            notFound++;
            continue;
        }

        // Namen sind bereits korrekt, überspringe Update
        if (supabaseProfile.first_name === firstName && supabaseProfile.last_name === lastName) {
            skipped++;
            continue;
        }

        const displayName = `${firstName} ${lastName}`.trim() || 'Unknown';

        const { error: updateError } = await supabase
            .from('profiles')
            .update({
                first_name: firstName,
                last_name: lastName,
                display_name: displayName
            })
            .eq('id', supabaseProfile.id);

        if (updateError) {
            console.error(`   ❌ Error updating ${email}:`, updateError.message);
        } else {
            console.log(`   ✅ Updated: ${email} → ${firstName} ${lastName}`);
            updated++;
        }
    }

    console.log('\n========================================');
    console.log('📊 Sync Complete!');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ⚠️  Not found: ${notFound}`);
    console.log('========================================\n');
}

syncNames().catch(console.error);
