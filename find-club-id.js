/**
 * Finds club IDs from existing data
 * Run with: node find-club-id.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function findClubId() {
    console.log('\n🔍 Suche nach Club-IDs in der Datenbank...\n');

    try {
        const clubIds = new Set();

        // Check users collection
        console.log('Prüfe users...');
        const usersSnapshot = await db.collection('users').limit(10).get();
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.clubId) {
                clubIds.add(data.clubId);
            }
        });

        // Check matches collection
        console.log('Prüfe matches...');
        const matchesSnapshot = await db.collection('matches').limit(10).get();
        matchesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.clubId) {
                clubIds.add(data.clubId);
            }
        });

        // Check doublesMatches collection
        console.log('Prüfe doublesMatches...');
        const doublesSnapshot = await db.collection('doublesMatches').limit(10).get();
        doublesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.clubId) {
                clubIds.add(data.clubId);
            }
        });

        console.log('\n✅ Gefundene Club-IDs:\n');

        if (clubIds.size === 0) {
            console.log('❌ Keine Club-IDs gefunden!\n');
            console.log('Mögliche Gründe:');
            console.log('1. Noch keine Daten in der Datenbank');
            console.log('2. Feld heißt anders als "clubId"');
            console.log(
                '\nFühren Sie "node list-collections.js" aus, um die Datenbank-Struktur zu sehen.'
            );
        } else {
            Array.from(clubIds).forEach((clubId, index) => {
                console.log(`${index + 1}. ${clubId}`);
            });

            if (clubIds.size === 1) {
                const theClubId = Array.from(clubIds)[0];
                console.log(`\n💡 Das ist Ihre Club-ID: ${theClubId}`);
                console.log(`\nVerwenden Sie diese für die anderen Scripts:`);
                console.log(`   node debug-match-history.js ${theClubId}`);
            }
        }

        console.log('');
    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }

    process.exit(0);
}

findClubId();
