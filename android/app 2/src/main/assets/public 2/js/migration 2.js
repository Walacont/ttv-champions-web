import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    writeBatch,
    query,
    where,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Migration Module for Subgroups Feature
 * Migrates existing data to support subgroups:
 * - Creates default "Hauptgruppe" for each club
 * - Assigns all players to the main subgroup
 * - Migrates streaks from user document to streaks subcollection
 * - Adds subgroupId to existing attendance documents
 */

const MIGRATION_VERSION = 1;
const DEFAULT_SUBGROUP_NAME = 'Hauptgruppe';

/**
 * Checks if migration is needed for a club
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @returns {Promise<boolean>} - True if migration is needed
 */
export async function needsMigration(clubId, db) {
    try {
        // Check if any subgroups exist for this club
        const subgroupsQuery = query(collection(db, 'subgroups'), where('clubId', '==', clubId));
        const subgroupsSnapshot = await getDocs(subgroupsQuery);

        return subgroupsSnapshot.empty;
    } catch (error) {
        console.error('Error checking migration status:', error);
        return false;
    }
}

/**
 * Runs the migration for a club
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Object>} - Migration result
 */
export async function runMigration(clubId, db) {
    console.log(`[Migration] Starting migration for club: ${clubId}`);

    try {
        // Step 1: Create default subgroup
        const mainSubgroupRef = await addDoc(collection(db, 'subgroups'), {
            clubId: clubId,
            name: DEFAULT_SUBGROUP_NAME,
            createdAt: serverTimestamp(),
            isDefault: true,
        });
        const mainSubgroupId = mainSubgroupRef.id;
        console.log(`[Migration] Created main subgroup: ${mainSubgroupId}`);

        // Step 2: Get all players in the club
        const usersQuery = query(collection(db, 'users'), where('clubId', '==', clubId));
        const usersSnapshot = await getDocs(usersQuery);
        console.log(`[Migration] Found ${usersSnapshot.size} users to migrate`);

        // Step 3: Migrate users and streaks in batches (max 500 operations per batch)
        const batch = writeBatch(db);
        let batchCount = 0;
        let migratedUsers = 0;
        let migratedStreaks = 0;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const userRef = doc(db, 'users', userId);

            // Update user: Add subgroupIDs array
            const subgroupIDs = [mainSubgroupId];
            batch.update(userRef, {
                subgroupIDs: subgroupIDs,
                migratedToSubgroups: true,
                migrationVersion: MIGRATION_VERSION,
            });
            batchCount++;
            migratedUsers++;

            // Migrate streak if it exists
            if (userData.streak !== undefined && userData.streak !== null) {
                const streakRef = doc(db, `users/${userId}/streaks`, mainSubgroupId);
                batch.set(streakRef, {
                    count: userData.streak,
                    subgroupId: mainSubgroupId,
                    lastUpdated: serverTimestamp(),
                });
                batchCount++;
                migratedStreaks++;
            }

            // Commit batch if we're approaching the limit (500 operations)
            if (batchCount >= 450) {
                await batch.commit();
                console.log(`[Migration] Batch committed (${batchCount} operations)`);
                batchCount = 0;
            }
        }

        // Commit any remaining operations
        if (batchCount > 0) {
            await batch.commit();
            console.log(`[Migration] Final batch committed (${batchCount} operations)`);
        }

        // Step 4: Migrate attendance documents
        const attendanceQuery = query(collection(db, 'attendance'), where('clubId', '==', clubId));
        const attendanceSnapshot = await getDocs(attendanceQuery);
        console.log(`[Migration] Found ${attendanceSnapshot.size} attendance records to migrate`);

        const attendanceBatch = writeBatch(db);
        let attendanceBatchCount = 0;
        let migratedAttendance = 0;

        for (const attendanceDoc of attendanceSnapshot.docs) {
            const attendanceRef = doc(db, 'attendance', attendanceDoc.id);

            // Add subgroupId to attendance document
            attendanceBatch.update(attendanceRef, {
                subgroupId: mainSubgroupId,
                migratedToSubgroups: true,
            });
            attendanceBatchCount++;
            migratedAttendance++;

            // Commit batch if approaching limit
            if (attendanceBatchCount >= 450) {
                await attendanceBatch.commit();
                console.log(
                    `[Migration] Attendance batch committed (${attendanceBatchCount} operations)`
                );
                attendanceBatchCount = 0;
            }
        }

        // Commit any remaining attendance operations
        if (attendanceBatchCount > 0) {
            await attendanceBatch.commit();
            console.log(
                `[Migration] Final attendance batch committed (${attendanceBatchCount} operations)`
            );
        }

        // Step 5: Migrate challenges (add subgroupId: "all" to existing challenges)
        const challengesQuery = query(collection(db, 'challenges'), where('clubId', '==', clubId));
        const challengesSnapshot = await getDocs(challengesQuery);
        console.log(`[Migration] Found ${challengesSnapshot.size} challenges to migrate`);

        const challengesBatch = writeBatch(db);
        let challengesBatchCount = 0;
        let migratedChallenges = 0;

        for (const challengeDoc of challengesSnapshot.docs) {
            const challengeRef = doc(db, 'challenges', challengeDoc.id);

            // Set subgroupId to "all" for existing challenges
            challengesBatch.update(challengeRef, {
                subgroupId: 'all',
                migratedToSubgroups: true,
            });
            challengesBatchCount++;
            migratedChallenges++;

            if (challengesBatchCount >= 450) {
                await challengesBatch.commit();
                console.log(
                    `[Migration] Challenges batch committed (${challengesBatchCount} operations)`
                );
                challengesBatchCount = 0;
            }
        }

        if (challengesBatchCount > 0) {
            await challengesBatch.commit();
            console.log(
                `[Migration] Final challenges batch committed (${challengesBatchCount} operations)`
            );
        }

        console.log(`[Migration] Completed successfully!`);
        console.log(`[Migration] Summary:`);
        console.log(`  - Created main subgroup: ${mainSubgroupId}`);
        console.log(`  - Migrated users: ${migratedUsers}`);
        console.log(`  - Migrated streaks: ${migratedStreaks}`);
        console.log(`  - Migrated attendance records: ${migratedAttendance}`);
        console.log(`  - Migrated challenges: ${migratedChallenges}`);

        return {
            success: true,
            mainSubgroupId: mainSubgroupId,
            stats: {
                users: migratedUsers,
                streaks: migratedStreaks,
                attendance: migratedAttendance,
                challenges: migratedChallenges,
            },
        };
    } catch (error) {
        console.error('[Migration] Error during migration:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Checks and runs migration if needed
 * @param {string} clubId - Club ID
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Object>} - Migration result
 */
export async function checkAndMigrate(clubId, db) {
    const migrationNeeded = await needsMigration(clubId, db);

    if (migrationNeeded) {
        console.log(`[Migration] Migration needed for club ${clubId}`);
        return await runMigration(clubId, db);
    } else {
        console.log(`[Migration] No migration needed for club ${clubId}`);
        return {
            success: true,
            skipped: true,
            message: 'Migration already completed or not needed',
        };
    }
}
