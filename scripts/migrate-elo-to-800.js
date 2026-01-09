/**
 * Migration Script: Update all users' ELO from old system (0-based) to new system (800-based)
 *
 * This script:
 * 1. Reads all users from Firestore
 * 2. Updates their ELO rating: newElo = oldElo + 800
 * 3. Updates their highestElo if applicable
 * 4. Preserves all other user data
 *
 * Run this ONCE after deploying the new points system.
 *
 * Usage:
 *   node scripts/migrate-elo-to-800.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json'); // You'll need to provide this

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateUsers() {
    console.log('🚀 Starting ELO migration...');
    console.log('📝 New system: All users start at 800 ELO (instead of 0)');
    console.log('');

    try {
        // Get all users
        const usersSnapshot = await db.collection('users').get();
        console.log(`📊 Found ${usersSnapshot.size} users to migrate`);
        console.log('');

        let migratedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Process in batches of 500 (Firestore batch limit)
        const batchSize = 500;
        let batch = db.batch();
        let batchCount = 0;

        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const userId = userDoc.id;

            try {
                const oldElo = userData.eloRating ?? 0; // Use 0 if undefined
                const oldHighestElo = userData.highestElo ?? oldElo;

                // New ELO values (add 800 to shift scale)
                const newElo = oldElo + 800;
                const newHighestElo = oldHighestElo + 800;

                // Check if migration already happened (ELO >= 800 suggests new system)
                if (oldElo >= 800) {
                    console.log(
                        `⏭️  Skipping ${userData.firstName} ${userData.lastName} (ELO: ${oldElo}) - already migrated`
                    );
                    skippedCount++;
                    continue;
                }

                // Update user document
                batch.update(userDoc.ref, {
                    eloRating: newElo,
                    highestElo: newHighestElo,
                });

                console.log(
                    `✅ ${userData.firstName} ${userData.lastName}: ${oldElo} → ${newElo} ELO`
                );
                migratedCount++;
                batchCount++;

                // Commit batch when it reaches 500 operations
                if (batchCount >= batchSize) {
                    await batch.commit();
                    console.log(`💾 Committed batch of ${batchCount} updates`);
                    batch = db.batch(); // Create new batch
                    batchCount = 0;
                }
            } catch (error) {
                console.error(`❌ Error migrating user ${userId}:`, error.message);
                errorCount++;
            }
        }

        // Commit remaining batch
        if (batchCount > 0) {
            await batch.commit();
            console.log(`💾 Committed final batch of ${batchCount} updates`);
        }

        console.log('');
        console.log('✨ Migration complete!');
        console.log(`📊 Summary:`);
        console.log(`   - Migrated: ${migratedCount} users`);
        console.log(`   - Skipped: ${skippedCount} users (already migrated)`);
        console.log(`   - Errors: ${errorCount} users`);
    } catch (error) {
        console.error('💥 Fatal error during migration:', error);
        process.exit(1);
    }
}

// Run migration
migrateUsers()
    .then(() => {
        console.log('');
        console.log('🎉 All done! You can now deploy the new points system.');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });
