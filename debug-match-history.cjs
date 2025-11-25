/**
 * Debug script to check match history data
 * Run with: node debug-match-history.js <clubId>
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function debugMatchHistory() {
    const clubId = process.argv[2];

    if (!clubId) {
        console.log('Usage: node debug-match-history.js <clubId>');
        console.log('Example: node debug-match-history.js your-club-id');
        process.exit(1);
    }

    console.log(`\n🔍 Debugging match history for club: ${clubId}\n`);

    try {
        // Check singles matches
        console.log('=== SINGLES MATCHES ===');
        const singlesSnapshot = await db
            .collection('matches')
            .where('clubId', '==', clubId)
            .limit(10)
            .get();

        console.log(`Total singles matches found: ${singlesSnapshot.docs.length}\n`);

        singlesSnapshot.docs.forEach((doc, index) => {
            const data = doc.data();
            console.log(`Match ${index + 1} (${doc.id}):`);
            console.log(`  - processed: ${data.processed}`);
            console.log(
                `  - timestamp: ${data.timestamp ? 'YES' : 'NO'} ${data.timestamp ? `(${data.timestamp.toDate()})` : ''}`
            );
            console.log(
                `  - createdAt: ${data.createdAt ? 'YES' : 'NO'} ${data.createdAt ? `(${data.createdAt.toDate()})` : ''}`
            );
            console.log(`  - playerAId: ${data.playerAId}`);
            console.log(`  - playerBId: ${data.playerBId}`);
            console.log(`  - winnerId: ${data.winnerId}`);
            console.log('');
        });

        // Check processed matches specifically
        console.log('=== PROCESSED SINGLES MATCHES ===');
        const processedSnapshot = await db
            .collection('matches')
            .where('clubId', '==', clubId)
            .where('processed', '==', true)
            .limit(5)
            .get();

        console.log(`Total processed matches: ${processedSnapshot.docs.length}\n`);

        processedSnapshot.docs.forEach((doc, index) => {
            const data = doc.data();
            console.log(`Processed Match ${index + 1} (${doc.id}):`);
            console.log(
                `  - timestamp: ${data.timestamp ? 'YES ✅' : 'NO ❌'} ${data.timestamp ? `(${data.timestamp.toDate()})` : ''}`
            );
            console.log(
                `  - createdAt: ${data.createdAt ? 'YES' : 'NO'} ${data.createdAt ? `(${data.createdAt.toDate()})` : ''}`
            );
            console.log('');
        });

        // Check doubles matches
        console.log('=== DOUBLES MATCHES ===');
        const doublesSnapshot = await db
            .collection('doublesMatches')
            .where('clubId', '==', clubId)
            .limit(5)
            .get();

        console.log(`Total doubles matches found: ${doublesSnapshot.docs.length}\n`);

        doublesSnapshot.docs.forEach((doc, index) => {
            const data = doc.data();
            console.log(`Doubles Match ${index + 1} (${doc.id}):`);
            console.log(`  - processed: ${data.processed}`);
            console.log(
                `  - timestamp: ${data.timestamp ? 'YES' : 'NO'} ${data.timestamp ? `(${data.timestamp.toDate()})` : ''}`
            );
            console.log(
                `  - createdAt: ${data.createdAt ? 'YES' : 'NO'} ${data.createdAt ? `(${data.createdAt.toDate()})` : ''}`
            );
            console.log('');
        });
    } catch (error) {
        console.error('❌ Error:', error);
    }

    process.exit(0);
}

debugMatchHistory();
