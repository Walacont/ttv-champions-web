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

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const firestore = admin.firestore();

// Initialize Supabase
const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Need service role for bypassing RLS
);

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

            // Points & Difficulty
            points: data.points || data.xpReward || 10,
            xp_reward: data.xpReward || data.points || 10,
            level: data.level || null,
            difficulty: data.difficulty || null,
            tiered_points: data.tieredPoints || null,

            // Categorization
            category: data.category || (data.tags ? data.tags[0] : null),
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
        const { error } = await supabase
            .from('exercises')
            .upsert(exercise, { onConflict: 'id' });

        if (error) {
            console.error(`❌ Error migrating "${data.name || data.title}": ${error.message}`);
            errorCount++;
        } else {
            console.log(`✅ Migrated: ${data.name || data.title}`);
            if (data.imageUrl) console.log(`   📷 Image: ${data.imageUrl.substring(0, 50)}...`);
            if (data.descriptionContent) console.log(`   📋 Has table/rich content`);
            successCount++;
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
