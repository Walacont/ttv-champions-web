#!/usr/bin/env node

/**
 * Script to initialize the season reset configuration in Firestore
 * This creates the config/seasonReset document needed for the 6-week season cycle
 *
 * Usage: node scripts/init-season-reset.cjs
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');

try {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    console.log('✅ Firebase Admin initialized');
} catch (error) {
    console.error('❌ Error: Could not find serviceAccountKey.json');
    console.error('   Please download your service account key from Firebase Console:');
    console.error('   1. Go to Project Settings > Service Accounts');
    console.error('   2. Click "Generate new private key"');
    console.error('   3. Save as serviceAccountKey.json in project root');
    process.exit(1);
}

const db = admin.firestore();

async function initSeasonReset() {
    try {
        console.log('🔄 Checking if season reset config already exists...');

        const configRef = db.collection('config').doc('seasonReset');
        const configDoc = await configRef.get();

        if (configDoc.exists()) {
            const data = configDoc.data();
            const lastReset = data.lastResetDate.toDate();
            const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
            const nextReset = new Date(lastReset.getTime() + sixWeeksInMs);

            console.log('ℹ️  Season reset config already exists:');
            console.log(`   Last reset: ${lastReset.toLocaleString('de-DE')}`);
            console.log(`   Next reset: ${nextReset.toLocaleString('de-DE')}`);

            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout,
            });

            readline.question('\nDo you want to reset the season NOW? (yes/no): ', async answer => {
                if (answer.toLowerCase() === 'yes') {
                    await configRef.set(
                        {
                            lastResetDate: admin.firestore.Timestamp.now(),
                            lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                        },
                        { merge: true }
                    );

                    console.log('✅ Season reset date updated to NOW!');
                    console.log(`   Next reset will be in 6 weeks`);
                } else {
                    console.log('ℹ️  No changes made');
                }

                readline.close();
                process.exit(0);
            });

            return;
        }

        console.log('🆕 Creating new season reset config...');

        await configRef.set({
            lastResetDate: admin.firestore.Timestamp.now(),
            lastResetTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log('✅ Season reset config created successfully!');
        console.log(`   Start date: ${new Date().toLocaleString('de-DE')}`);

        const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
        const nextReset = new Date(Date.now() + sixWeeksInMs);
        console.log(`   Next reset: ${nextReset.toLocaleString('de-DE')}`);
        console.log('\n🎉 Your 6-week season cycle is now active!');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

initSeasonReset();
