/**
 * Migration Script: Create clubs collection from existing user data
 *
 * This script:
 * 1. Reads all users with clubId from Firestore
 * 2. Groups them by clubId
 * 3. Creates a club document for each unique clubId
 * 4. Sets first coach/admin as ownerId
 *
 * Run this ONCE after deploying the clubs collection feature.
 *
 * Usage:
 *   node scripts/migrate-clubs.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateClubs() {
    console.log('🚀 Starting clubs collection migration...');
    console.log('📝 Creating clubs collection from existing user data');
    console.log('');

    try {
        // Get all users with clubId
        const usersSnapshot = await db.collection('users')
            .where('clubId', '!=', null)
            .get();

        console.log(`📊 Found ${usersSnapshot.size} users with clubs`);
        console.log('');

        // Group users by clubId
        const clubsMap = new Map();

        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const clubId = userData.clubId;

            if (!clubId) continue;

            if (!clubsMap.has(clubId)) {
                clubsMap.set(clubId, {
                    members: [],
                    coaches: [],
                    admins: [],
                });
            }

            const club = clubsMap.get(clubId);
            club.members.push({
                id: userDoc.id,
                ...userData,
            });

            if (userData.role === 'coach') {
                club.coaches.push(userDoc.id);
            } else if (userData.role === 'admin') {
                club.admins.push(userDoc.id);
            }
        }

        console.log(`🏢 Found ${clubsMap.size} unique clubs`);
        console.log('');

        let createdCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        // Create club documents
        for (const [clubId, clubData] of clubsMap.entries()) {
            try {
                const clubRef = db.collection('clubs').doc(clubId);
                const clubDoc = await clubRef.get();

                if (clubDoc.exists) {
                    console.log(`⏭️  Skipping ${clubId} - already exists`);
                    skippedCount++;
                    continue;
                }

                // Determine owner: first admin, then first coach, then null
                let ownerId = null;
                if (clubData.admins.length > 0) {
                    ownerId = clubData.admins[0];
                } else if (clubData.coaches.length > 0) {
                    ownerId = clubData.coaches[0];
                }

                // Create club document
                await clubRef.set({
                    name: clubId, // Default: use clubId as name
                    createdAt: admin.firestore.Timestamp.now(),
                    isTestClub: false, // Default: not a test club (admin can change manually)
                    memberCount: clubData.members.length,
                    ownerId: ownerId,
                });

                console.log(`✅ Created club: ${clubId}`);
                console.log(`   - Members: ${clubData.members.length}`);
                console.log(`   - Coaches: ${clubData.coaches.length}`);
                console.log(`   - Admins: ${clubData.admins.length}`);
                console.log(`   - Owner: ${ownerId || 'none'}`);
                console.log('');

                createdCount++;
            } catch (error) {
                console.error(`❌ Error creating club ${clubId}:`, error.message);
                errorCount++;
            }
        }

        console.log('');
        console.log('✨ Migration complete!');
        console.log(`📊 Summary:`);
        console.log(`   - Created: ${createdCount} clubs`);
        console.log(`   - Skipped: ${skippedCount} clubs (already exist)`);
        console.log(`   - Errors: ${errorCount} clubs`);
        console.log('');
        console.log('ℹ️  Note: All clubs are set to isTestClub: false by default');
        console.log('   If you have test clubs, update them manually in Firestore');
    } catch (error) {
        console.error('💥 Fatal error during migration:', error);
        process.exit(1);
    }
}

// Run migration
migrateClubs()
    .then(() => {
        console.log('');
        console.log('🎉 All done! Clubs collection has been created.');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Migration failed:', error);
        process.exit(1);
    });
