/**
 * Migrate exercises from Firebase to Supabase with ALL fields
 * Run this after adding the missing columns to the exercises table
 *
 * Usage: node scripts/migrate-exercises-full.js
 */

import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';

// Setup for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Load environment variables - check both scripts folder and root
const scriptsEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '../.env');

// Try scripts folder first, then root
if (fs.existsSync(scriptsEnvPath)) {
    console.log('Loading .env from:', scriptsEnvPath);
    dotenv.config({ path: scriptsEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
    console.log('Loading .env from:', rootEnvPath);
    dotenv.config({ path: rootEnvPath });
} else {
    console.log('No .env file found, using system environment');
}

// Debug: Show available Supabase env vars
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log('SUPABASE_URL:', supabaseUrl ? `✓ found (${supabaseUrl})` : '✗ missing');
console.log('SERVICE_ROLE_KEY:', supabaseKey ? `✓ found (${supabaseKey.substring(0, 20)}...)` : '✗ missing');

if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Missing environment variables!');
    console.error('Please ensure your .env file contains:');
    console.error('  VITE_SUPABASE_URL=https://your-project.supabase.co');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    console.error('\nThe service role key can be found in Supabase Dashboard > Settings > API');
    process.exit(1);
}

// Initialize Firebase Admin - try different possible filenames
let serviceAccount;
const possiblePaths = [
    '../firebase-service-account.json',
    '../serviceAccountKey.json',
    './firebase-service-account.json',
    './serviceAccountKey.json'
];

for (const p of possiblePaths) {
    const fullPath = path.resolve(__dirname, p);
    if (fs.existsSync(fullPath)) {
        serviceAccount = require(fullPath);
        console.log('Firebase service account loaded from:', fullPath);
        break;
    }
}

if (!serviceAccount) {
    console.error('❌ Firebase service account not found!');
    console.error('Please ensure one of these files exists:');
    possiblePaths.forEach(p => console.error('  -', p));
    process.exit(1);
}
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const firestore = admin.firestore();

// Initialize Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

// Load ID mappings from previous migration
let idMappings = {};
const mappingsFile = path.resolve(__dirname, './id-mappings.json');
const newMappingsFile = path.resolve(__dirname, './id-mappings-new.json');

// Try to load existing mappings
if (fs.existsSync(newMappingsFile)) {
    idMappings = JSON.parse(fs.readFileSync(newMappingsFile, 'utf8'));
    console.log('Loaded existing ID mappings from id-mappings-new.json');
} else if (fs.existsSync(mappingsFile)) {
    idMappings = JSON.parse(fs.readFileSync(mappingsFile, 'utf8'));
    console.log('Loaded existing ID mappings from id-mappings.json');
}

function getMappedId(oldId, type) {
    if (!oldId) return null;
    return idMappings[type]?.[oldId] || null;
}

function getOrCreateUUID(oldId, type) {
    if (!idMappings[type]) idMappings[type] = {};
    if (!idMappings[type][oldId]) {
        idMappings[type][oldId] = randomUUID();
    }
    return idMappings[type][oldId];
}

async function migrateExercises() {
    console.log('🏋️ Starting full exercises migration...\n');

    // Test Supabase connection first
    console.log('Testing Supabase connection...');
    try {
        const { data, error } = await supabase.from('exercises').select('id').limit(1);
        if (error) {
            console.error('❌ Supabase connection failed:', error.message);
            process.exit(1);
        }
        console.log('✅ Supabase connection OK\n');
    } catch (connError) {
        console.error('❌ Cannot connect to Supabase:', connError.message);
        if (connError.cause) {
            console.error('   Cause:', connError.cause.message || connError.cause);
        }
        console.error('\nPlease check:');
        console.error('  1. Your internet connection');
        console.error('  2. The VITE_SUPABASE_URL is correct');
        console.error('  3. No VPN/firewall blocking the connection');
        process.exit(1);
    }

    const snapshot = await firestore.collection('exercises').get();
    console.log(`Found ${snapshot.docs.length} exercises in Firebase\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const exerciseId = getOrCreateUUID(doc.id, 'exercises');

        // Map all fields from Firebase to Supabase
        const exercise = {
            id: exerciseId,
            // Basic info
            name: data.name || data.title || 'Unbenannte Übung',
            title: data.title || data.name || 'Unbenannte Übung',
            description: data.description || null,
            description_content: data.descriptionContent ?
                (typeof data.descriptionContent === 'string' ?
                    JSON.parse(data.descriptionContent) : data.descriptionContent)
                : null,

            // Media
            image_url: data.imageUrl || null,

            // Points & Difficulty - ensure numeric values
            points: typeof data.points === 'number' ? data.points : (typeof data.xpReward === 'number' ? data.xpReward : 10),
            xp_reward: typeof data.xpReward === 'number' ? data.xpReward : (typeof data.points === 'number' ? data.points : 10),
            // Don't send 'difficulty' or 'level' - they have type mismatches with DB
            tiered_points: data.tieredPoints || null,

            // Categorization - store level (standard/grundlagen) in category
            category: data.level || data.category || (data.tags ? data.tags[0] : null),
            tags: data.tags || (data.category ? [data.category] : []),
            visibility: data.visibility || 'global',

            // Club association
            club_id: getMappedId(data.clubId, 'clubs'),

            // Record holder
            record_count: data.recordCount || null,
            record_holder_id: getMappedId(data.recordHolderId, 'users'),
            record_holder_name: data.recordHolderName || null,
            record_holder_club: data.recordHolderClub || null,
            record_holder_club_id: getMappedId(data.recordHolderClubId, 'clubs'),
            record_updated_at: data.recordUpdatedAt?.toDate?.()?.toISOString() || null,

            // Creator
            created_by: getMappedId(data.createdBy, 'users'),
            created_by_name: data.createdByName || null,
            created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
        };

        // Upsert to Supabase
        try {
            const { error } = await supabase
                .from('exercises')
                .upsert(exercise, { onConflict: 'id' });

            if (error) {
                console.error(`❌ Error migrating "${data.name || data.title}": ${error.message}`);
                // Debug: show the data that caused the error
                console.error('   Firebase data:', JSON.stringify({
                    points: data.points,
                    xpReward: data.xpReward,
                    category: data.category,
                    level: data.level,
                    difficulty: data.difficulty
                }, null, 2));
                errorCount++;
            } else {
                console.log(`✅ Migrated: ${data.name || data.title}`);
                if (data.imageUrl) console.log(`   📷 Image: ${data.imageUrl.substring(0, 50)}...`);
                if (data.descriptionContent) console.log(`   📋 Has table/rich content`);
                successCount++;
            }
        } catch (networkError) {
            console.error(`❌ Network error migrating "${data.name || data.title}": ${networkError.message}`);
            if (networkError.cause) {
                console.error('   Cause:', networkError.cause.message || networkError.cause);
            }
            errorCount++;
        }
    }

    // Save updated mappings
    fs.writeFileSync(newMappingsFile, JSON.stringify(idMappings, null, 2));

    console.log(`\n========================================`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`========================================\n`);

    process.exit(0);
}

migrateExercises().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
