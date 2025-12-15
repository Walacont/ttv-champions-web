/**
 * Migrate Gender and Birthdate from Firebase to Supabase
 *
 * This script updates existing profiles with gender and birthdate
 * that were missed in the initial migration.
 *
 * Usage:
 *   node scripts/migrate-gender-birthdate.js
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

const firestore = getFirestore();

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ============================================
// LOGGING
// ============================================

function log(message, type = 'info') {
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        warn: '\x1b[33m',
        error: '\x1b[31m',
        progress: '\x1b[35m'
    };
    const reset = '\x1b[0m';
    const color = colors[type] || colors.info;
    console.log(`${color}[${type.toUpperCase()}]${reset} ${message}`);
}

// ============================================
// MAIN MIGRATION
// ============================================

async function migrateGenderAndBirthdate() {
    log('Starting gender and birthdate migration...', 'progress');

    // Get all users from Firebase
    const snapshot = await firestore.collection('users').get();
    log(`Found ${snapshot.size} users in Firebase`, 'info');

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const email = data.email;

        // Skip if no gender and no birthdate
        if (!data.gender && !data.birthdate) {
            skippedCount++;
            continue;
        }

        // Find the profile in Supabase by email
        if (!email) {
            log(`  Skipping ${doc.id}: no email`, 'warn');
            skippedCount++;
            continue;
        }

        // Prepare update data
        const updateData = {};
        if (data.gender) {
            updateData.gender = data.gender;
        }
        if (data.birthdate) {
            updateData.birthdate = data.birthdate;
        }

        // Update profile in Supabase
        const { data: profile, error: selectError } = await supabase
            .from('profiles')
            .select('id, display_name')
            .eq('email', email)
            .single();

        if (selectError || !profile) {
            log(`  Profile not found for email: ${email}`, 'warn');
            skippedCount++;
            continue;
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', profile.id);

        if (updateError) {
            log(`  Error updating ${profile.display_name}: ${updateError.message}`, 'error');
            errorCount++;
        } else {
            log(`  Updated ${profile.display_name}: gender=${data.gender || 'null'}, birthdate=${data.birthdate || 'null'}`, 'success');
            updatedCount++;
        }
    }

    log('', 'info');
    log('=== Migration Summary ===', 'progress');
    log(`Updated: ${updatedCount}`, 'success');
    log(`Skipped: ${skippedCount}`, 'info');
    log(`Errors: ${errorCount}`, errorCount > 0 ? 'error' : 'info');
}

// Run migration
migrateGenderAndBirthdate()
    .then(() => {
        log('Migration completed!', 'success');
        process.exit(0);
    })
    .catch((error) => {
        log(`Migration failed: ${error.message}`, 'error');
        console.error(error);
        process.exit(1);
    });
