/**
 * Lists all collections in the database
 * Run with: node list-collections.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function listCollections() {
    console.log('\n📚 Liste aller Collections in der Datenbank:\n');

    try {
        const collections = await db.listCollections();

        if (collections.length === 0) {
            console.log('Keine Collections gefunden.');
            process.exit(0);
        }

        console.log(`Gefundene Collections (${collections.length}):\n`);

        for (const collection of collections) {
            console.log(`📁 ${collection.id}`);

            // Count documents in collection
            const snapshot = await collection.limit(1).get();
            const count = snapshot.size;

            if (count > 0) {
                console.log(`   └─ Beispiel Document ID: ${snapshot.docs[0].id}`);
                const data = snapshot.docs[0].data();
                console.log(
                    `   └─ Felder: ${Object.keys(data).slice(0, 5).join(', ')}${Object.keys(data).length > 5 ? '...' : ''}`
                );
            }
            console.log('');
        }

        // Special check: Look for users with clubId
        console.log('\n🔍 Suche nach clubId in users...\n');
        const usersSnapshot = await db.collection('users').limit(3).get();

        usersSnapshot.forEach((doc, index) => {
            const data = doc.data();
            if (data.clubId) {
                console.log(`User ${index + 1} (${doc.id}):`);
                console.log(`  Club ID: ${data.clubId}`);
                console.log(`  Name: ${data.firstName} ${data.lastName}`);
                console.log('');
            }
        });
    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }

    process.exit(0);
}

listCollections();
