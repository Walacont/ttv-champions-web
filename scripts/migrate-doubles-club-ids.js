/**
 * Migration Script: Add player clubIds to doublesPairings
 *
 * This script migrates existing doublesPairings documents to store
 * the clubId of each player at the time of match creation.
 *
 * Fields added:
 * - player1ClubIdAtMatch: clubId of player 1 when pairing was created
 * - player2ClubIdAtMatch: clubId of player 2 when pairing was created
 *
 * Usage:
 *   node scripts/migrate-doubles-club-ids.js
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory (ES Module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account key
const serviceAccount = JSON.parse(
    readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateDoublesPairingsClubIds() {
    console.log('🚀 Starting migration: Add player clubIds to doublesPairings');
    console.log('================================================\n');

    try {
        // Get all doublesPairings documents
        const pairingsSnapshot = await db.collection('doublesPairings').get();

        console.log(`📊 Found ${pairingsSnapshot.size} doublesPairings documents\n`);

        if (pairingsSnapshot.empty) {
            console.log('✅ No documents to migrate');
            return;
        }

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process in batches of 500 (Firestore limit)
        const batchSize = 500;
        let batch = db.batch();
        let operationCount = 0;

        for (const pairingDoc of pairingsSnapshot.docs) {
            const pairingData = pairingDoc.data();
            const pairingId = pairingDoc.id;

            // Skip if already has the new fields
            if (pairingData.player1ClubIdAtMatch !== undefined &&
                pairingData.player2ClubIdAtMatch !== undefined) {
                skippedCount++;
                console.log(`⏭️  Skipping ${pairingId} (already migrated)`);
                continue;
            }

            try {
                // Get player documents
                const player1Doc = await db.collection('users').doc(pairingData.player1Id).get();
                const player2Doc = await db.collection('users').doc(pairingData.player2Id).get();

                if (!player1Doc.exists || !player2Doc.exists) {
                    console.log(`⚠️  Warning: Player not found for pairing ${pairingId}`);
                    errorCount++;
                    continue;
                }

                const player1Data = player1Doc.data();
                const player2Data = player2Doc.data();

                // Get current clubIds (this is our best approximation for historical data)
                const player1ClubId = player1Data.clubId || null;
                const player2ClubId = player2Data.clubId || null;

                // Update the pairing document
                batch.update(pairingDoc.ref, {
                    player1ClubIdAtMatch: player1ClubId,
                    player2ClubIdAtMatch: player2ClubId,
                    migratedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                operationCount++;
                updatedCount++;

                console.log(`✅ Queued update for ${pairingId}:`);
                console.log(`   Player 1 (${pairingData.player1Name}): ${player1ClubId || 'No club'}`);
                console.log(`   Player 2 (${pairingData.player2Name}): ${player2ClubId || 'No club'}`);

                // Commit batch if we reach the limit
                if (operationCount >= batchSize) {
                    await batch.commit();
                    console.log(`\n📦 Committed batch of ${operationCount} updates\n`);
                    batch = db.batch();
                    operationCount = 0;
                }

            } catch (error) {
                console.error(`❌ Error processing pairing ${pairingId}:`, error.message);
                errorCount++;
            }
        }

        // Commit remaining batch
        if (operationCount > 0) {
            await batch.commit();
            console.log(`\n📦 Committed final batch of ${operationCount} updates\n`);
        }

        console.log('\n================================================');
        console.log('✨ Migration Complete!');
        console.log('================================================');
        console.log(`✅ Updated: ${updatedCount}`);
        console.log(`⏭️  Skipped: ${skippedCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log(`📊 Total: ${pairingsSnapshot.size}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration
migrateDoublesPairingsClubIds()
    .then(() => {
        console.log('\n✅ Migration script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration script failed:', error);
        process.exit(1);
    });
