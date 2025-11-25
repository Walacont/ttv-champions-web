/**
 * Lists all clubs in the database
 * Run with: node list-clubs.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function listClubs() {
    console.log('\n🏓 Liste aller Vereine:\n');

    try {
        const clubsSnapshot = await db.collection('clubs').get();

        if (clubsSnapshot.empty) {
            console.log('Keine Vereine gefunden.');
            process.exit(0);
        }

        clubsSnapshot.forEach((doc, index) => {
            const data = doc.data();
            console.log(`${index + 1}. Club ID: ${doc.id}`);
            console.log(`   Name: ${data.name || 'Unbekannt'}`);
            console.log('');
        });

        console.log(`Gesamt: ${clubsSnapshot.size} Verein(e)\n`);
    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }

    process.exit(0);
}

listClubs();
