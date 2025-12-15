/**
 * Migrate Firebase Auth Users to Supabase Auth
 *
 * Migriert alle Firebase-Benutzer nach Supabase Auth
 * Passwörter werden mit einem temporären Passwort gesetzt - Benutzer müssen es zurücksetzen
 *
 * Usage: node scripts/migrate-firebase-auth.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

// Load Firebase service account
const serviceAccountPath = join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const firebaseAuth = getFirebaseAuth();

// Initialize Supabase Admin Client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ============================================
// MIGRATION
// ============================================

async function migrateUsers() {
    console.log('========================================');
    console.log('🚀 Migrating Firebase Auth to Supabase');
    console.log('========================================\n');

    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    let nextPageToken;

    // Get existing Supabase profiles to match IDs
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email');

    const emailToProfileId = {};
    profiles?.forEach(p => {
        if (p.email) {
            emailToProfileId[p.email.toLowerCase()] = p.id;
        }
    });
    console.log(`📥 Loaded ${Object.keys(emailToProfileId).length} existing profiles\n`);

    // Get existing Supabase Auth users
    const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
    const existingEmails = new Set(
        existingAuthUsers?.users?.map(u => u.email?.toLowerCase()) || []
    );
    console.log(`📥 Found ${existingEmails.size} existing Supabase Auth users\n`);

    console.log('🔄 Migrating users...\n');

    do {
        // List Firebase users (max 1000 per page)
        const listResult = await firebaseAuth.listUsers(1000, nextPageToken);

        for (const firebaseUser of listResult.users) {
            const email = firebaseUser.email?.toLowerCase();

            if (!email) {
                console.log(`   ⚠️ Skipping user ${firebaseUser.uid}: No email`);
                skipped++;
                continue;
            }

            // Skip if already exists in Supabase Auth
            if (existingEmails.has(email)) {
                console.log(`   ⏭️ Skipping ${email}: Already exists in Supabase Auth`);
                skipped++;
                continue;
            }

            try {
                // Get the corresponding Supabase profile ID
                const profileId = emailToProfileId[email];

                if (!profileId) {
                    console.log(`   ⚠️ Skipping ${email}: No matching profile in Supabase`);
                    skipped++;
                    continue;
                }

                // Create user in Supabase Auth with the SAME ID as the profile
                const { data: newUser, error } = await supabase.auth.admin.createUser({
                    id: profileId, // Use the same ID as the profile!
                    email: email,
                    email_confirm: true, // Auto-confirm email
                    password: generateTempPassword(), // Temporary password
                    user_metadata: {
                        display_name: firebaseUser.displayName || '',
                        migrated_from_firebase: true,
                        firebase_uid: firebaseUser.uid
                    }
                });

                if (error) {
                    // If user already exists with different ID, try updating
                    if (error.message.includes('already been registered')) {
                        console.log(`   ⏭️ ${email}: Already registered`);
                        skipped++;
                    } else {
                        console.log(`   ❌ Error for ${email}: ${error.message}`);
                        errors++;
                    }
                } else {
                    console.log(`   ✅ Migrated: ${email}`);
                    migrated++;
                }

            } catch (err) {
                console.log(`   ❌ Error for ${email}: ${err.message}`);
                errors++;
            }
        }

        nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    console.log('\n========================================');
    console.log('📊 Migration Complete!');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('========================================\n');

    if (migrated > 0) {
        console.log('⚠️  WICHTIG: Alle migrierten Benutzer haben ein temporäres Passwort.');
        console.log('   Sie müssen ihr Passwort über "Passwort vergessen" zurücksetzen!');
        console.log('');
    }

    process.exit(0);
}

/**
 * Generate a random temporary password
 */
function generateTempPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
    let password = '';
    for (let i = 0; i < 24; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Run migration
migrateUsers().catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
});
