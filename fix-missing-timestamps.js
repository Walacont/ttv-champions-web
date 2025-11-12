/**
 * Script to add missing timestamp fields to processed matches
 * Run with: node fix-missing-timestamps.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixMissingTimestamps() {
  console.log('🔍 Checking for matches without timestamp...\n');

  try {
    // Check singles matches
    const singlesSnapshot = await db.collection('matches')
      .where('processed', '==', true)
      .get();

    console.log(`Found ${singlesSnapshot.docs.length} processed singles matches`);

    let singlesFixed = 0;
    const singlesBatch = db.batch();

    for (const doc of singlesSnapshot.docs) {
      const data = doc.data();

      // Check if timestamp is missing or invalid
      if (!data.timestamp) {
        console.log(`  Fixing singles match ${doc.id} - using createdAt as fallback`);

        // Use createdAt as timestamp if available, otherwise use current time
        const timestamp = data.createdAt || admin.firestore.FieldValue.serverTimestamp();

        singlesBatch.update(doc.ref, { timestamp });
        singlesFixed++;
      }
    }

    if (singlesFixed > 0) {
      await singlesBatch.commit();
      console.log(`✅ Fixed ${singlesFixed} singles matches\n`);
    } else {
      console.log(`✅ All singles matches have timestamps\n`);
    }

    // Check doubles matches
    const doublesSnapshot = await db.collection('doublesMatches')
      .where('processed', '==', true)
      .get();

    console.log(`Found ${doublesSnapshot.docs.length} processed doubles matches`);

    let doublesFixed = 0;
    const doublesBatch = db.batch();

    for (const doc of doublesSnapshot.docs) {
      const data = doc.data();

      // Check if timestamp is missing or invalid
      if (!data.timestamp) {
        console.log(`  Fixing doubles match ${doc.id} - using createdAt as fallback`);

        // Use createdAt as timestamp if available, otherwise use current time
        const timestamp = data.createdAt || admin.firestore.FieldValue.serverTimestamp();

        doublesBatch.update(doc.ref, { timestamp });
        doublesFixed++;
      }
    }

    if (doublesFixed > 0) {
      await doublesBatch.commit();
      console.log(`✅ Fixed ${doublesFixed} doubles matches\n`);
    } else {
      console.log(`✅ All doubles matches have timestamps\n`);
    }

    console.log(`\n🎉 Done! Fixed ${singlesFixed + doublesFixed} matches total`);

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

fixMissingTimestamps();
