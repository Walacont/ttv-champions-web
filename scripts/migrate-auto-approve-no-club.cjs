#!/usr/bin/env node

/**
 * Migration Script: Auto-approve pending matches for players without club
 *
 * This script finds all pending_coach match requests where both/all players
 * have no club (clubId is null, undefined, or empty string) and automatically
 * approves them.
 *
 * Usage:
 *   node scripts/migrate-auto-approve-no-club.cjs
 *
 * Requirements:
 *   - serviceAccountKey.json in project root
 *   - firebase-admin package installed
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Checks if a player has no club
 * @param {string|null|undefined} clubId - The club ID to check
 * @returns {boolean} True if player has no club
 */
function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

/**
 * Migrate singles match requests
 */
async function migrateSinglesMatches() {
    console.log('\n📋 Checking singles match requests...');

    const matchRequestsRef = db.collection('matchRequests');
    const snapshot = await matchRequestsRef.where('status', '==', 'pending_coach').get();

    console.log(`Found ${snapshot.size} singles matches with status 'pending_coach'`);

    let approved = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
        const matchData = doc.data();
        const matchId = doc.id;

        try {
            // Fetch both players
            const [playerADoc, playerBDoc] = await Promise.all([
                db.collection('users').doc(matchData.playerAId).get(),
                db.collection('users').doc(matchData.playerBId).get()
            ]);

            if (!playerADoc.exists || !playerBDoc.exists) {
                console.log(`  ⚠️  Match ${matchId}: Player not found, skipping`);
                skipped++;
                continue;
            }

            const playerAData = playerADoc.data();
            const playerBData = playerBDoc.data();

            // Check if both players have no club
            if (hasNoClub(playerAData.clubId) && hasNoClub(playerBData.clubId)) {
                // Auto-approve this match
                await matchRequestsRef.doc(matchId).update({
                    status: 'approved',
                    'approvals.coach': {
                        status: 'auto_approved',
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        reason: 'Both players have no club (migrated)',
                        migratedAt: admin.firestore.FieldValue.serverTimestamp()
                    },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`  ✅ Match ${matchId}: Auto-approved (both players without club)`);
                approved++;
            } else {
                console.log(`  ⏭️  Match ${matchId}: At least one player has club, skipping`);
                skipped++;
            }
        } catch (error) {
            console.error(`  ❌ Error processing match ${matchId}:`, error.message);
            errors++;
        }
    }

    console.log(`\n✨ Singles migration complete:`);
    console.log(`   - Approved: ${approved}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Errors: ${errors}`);

    return { approved, skipped, errors };
}

/**
 * Migrate doubles match requests
 */
async function migrateDoublesMatches() {
    console.log('\n📋 Checking doubles match requests...');

    const doublesRequestsRef = db.collection('doublesMatchRequests');
    const snapshot = await doublesRequestsRef.where('status', '==', 'pending_coach').get();

    console.log(`Found ${snapshot.size} doubles matches with status 'pending_coach'`);

    let approved = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
        const matchData = doc.data();
        const matchId = doc.id;

        try {
            // Fetch all 4 players
            const [player1Doc, player2Doc, player3Doc, player4Doc] = await Promise.all([
                db.collection('users').doc(matchData.teamA.player1Id).get(),
                db.collection('users').doc(matchData.teamA.player2Id).get(),
                db.collection('users').doc(matchData.teamB.player1Id).get(),
                db.collection('users').doc(matchData.teamB.player2Id).get()
            ]);

            if (!player1Doc.exists || !player2Doc.exists || !player3Doc.exists || !player4Doc.exists) {
                console.log(`  ⚠️  Match ${matchId}: One or more players not found, skipping`);
                skipped++;
                continue;
            }

            const player1Data = player1Doc.data();
            const player2Data = player2Doc.data();
            const player3Data = player3Doc.data();
            const player4Data = player4Doc.data();

            // Check if all 4 players have no club
            if (hasNoClub(player1Data.clubId) && hasNoClub(player2Data.clubId) &&
                hasNoClub(player3Data.clubId) && hasNoClub(player4Data.clubId)) {

                // Auto-approve this match
                await doublesRequestsRef.doc(matchId).update({
                    status: 'approved',
                    approvedBy: 'auto_approved',
                    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                    approvalReason: 'All 4 players have no club (migrated)',
                    migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                console.log(`  ✅ Match ${matchId}: Auto-approved (all 4 players without club)`);
                approved++;
            } else {
                console.log(`  ⏭️  Match ${matchId}: At least one player has club, skipping`);
                skipped++;
            }
        } catch (error) {
            console.error(`  ❌ Error processing match ${matchId}:`, error.message);
            errors++;
        }
    }

    console.log(`\n✨ Doubles migration complete:`);
    console.log(`   - Approved: ${approved}`);
    console.log(`   - Skipped: ${skipped}`);
    console.log(`   - Errors: ${errors}`);

    return { approved, skipped, errors };
}

/**
 * Main migration function
 */
async function migrate() {
    console.log('🚀 Starting migration: Auto-approve matches for players without club');
    console.log('=' .repeat(70));

    try {
        const singlesResult = await migrateSinglesMatches();
        const doublesResult = await migrateDoublesMatches();

        console.log('\n' + '='.repeat(70));
        console.log('🎉 Migration completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   Singles - Approved: ${singlesResult.approved}, Skipped: ${singlesResult.skipped}, Errors: ${singlesResult.errors}`);
        console.log(`   Doubles - Approved: ${doublesResult.approved}, Skipped: ${doublesResult.skipped}, Errors: ${doublesResult.errors}`);
        console.log(`   Total Approved: ${singlesResult.approved + doublesResult.approved}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        // Cleanup
        await admin.app().delete();
    }
}

// Run migration
migrate();
