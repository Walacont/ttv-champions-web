// Migration für Untergruppen-Feature
// Migriert bestehende Daten um Untergruppen zu unterstützen

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

const MIGRATION_VERSION = 1;
const DEFAULT_SUBGROUP_NAME = 'Hauptgruppe';

export async function needsMigration(clubId, db) {
    try {
        const subgroupsQuery = query(collection(db, 'subgroups'), where('clubId', '==', clubId));
        const subgroupsSnapshot = await getDocs(subgroupsQuery);
        return subgroupsSnapshot.empty;
    } catch (error) {
        console.error('Fehler beim Prüfen des Migrationsstatus:', error);
        return false;
    }
}

export async function runMigration(clubId, db) {
    console.log(`[Migration] Starte Migration für Verein: ${clubId}`);

    try {
        // Standard-Untergruppe erstellen
        const mainSubgroupRef = await addDoc(collection(db, 'subgroups'), {
            clubId: clubId,
            name: DEFAULT_SUBGROUP_NAME,
            createdAt: serverTimestamp(),
            isDefault: true,
        });
        const mainSubgroupId = mainSubgroupRef.id;
        console.log(`[Migration] Hauptgruppe erstellt: ${mainSubgroupId}`);

        // Alle Spieler im Verein holen
        const usersQuery = query(collection(db, 'users'), where('clubId', '==', clubId));
        const usersSnapshot = await getDocs(usersQuery);
        console.log(`[Migration] ${usersSnapshot.size} Benutzer gefunden`);

        // Benutzer und Streaks in Batches migrieren (max 500 Operationen pro Batch)
        const batch = writeBatch(db);
        let batchCount = 0;
        let migratedUsers = 0;
        let migratedStreaks = 0;

        for (const userDoc of usersSnapshot.docs) {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const userRef = doc(db, 'users', userId);

            const subgroupIDs = [mainSubgroupId];
            batch.update(userRef, {
                subgroupIDs: subgroupIDs,
                migratedToSubgroups: true,
                migrationVersion: MIGRATION_VERSION,
            });
            batchCount++;
            migratedUsers++;

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

            if (batchCount >= 450) {
                await batch.commit();
                console.log(`[Migration] Batch committed (${batchCount} Operationen)`);
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
            console.log(`[Migration] Letzter Batch committed (${batchCount} Operationen)`);
        }

        // Anwesenheits-Dokumente migrieren
        const attendanceQuery = query(collection(db, 'attendance'), where('clubId', '==', clubId));
        const attendanceSnapshot = await getDocs(attendanceQuery);
        console.log(`[Migration] ${attendanceSnapshot.size} Anwesenheitseinträge gefunden`);

        const attendanceBatch = writeBatch(db);
        let attendanceBatchCount = 0;
        let migratedAttendance = 0;

        for (const attendanceDoc of attendanceSnapshot.docs) {
            const attendanceRef = doc(db, 'attendance', attendanceDoc.id);
            attendanceBatch.update(attendanceRef, {
                subgroupId: mainSubgroupId,
                migratedToSubgroups: true,
            });
            attendanceBatchCount++;
            migratedAttendance++;

            if (attendanceBatchCount >= 450) {
                await attendanceBatch.commit();
                console.log(`[Migration] Anwesenheits-Batch committed (${attendanceBatchCount} Operationen)`);
                attendanceBatchCount = 0;
            }
        }

        if (attendanceBatchCount > 0) {
            await attendanceBatch.commit();
            console.log(`[Migration] Letzter Anwesenheits-Batch committed (${attendanceBatchCount} Operationen)`);
        }

        // Challenges migrieren
        const challengesQuery = query(collection(db, 'challenges'), where('clubId', '==', clubId));
        const challengesSnapshot = await getDocs(challengesQuery);
        console.log(`[Migration] ${challengesSnapshot.size} Challenges gefunden`);

        const challengesBatch = writeBatch(db);
        let challengesBatchCount = 0;
        let migratedChallenges = 0;

        for (const challengeDoc of challengesSnapshot.docs) {
            const challengeRef = doc(db, 'challenges', challengeDoc.id);
            challengesBatch.update(challengeRef, {
                subgroupId: 'all',
                migratedToSubgroups: true,
            });
            challengesBatchCount++;
            migratedChallenges++;

            if (challengesBatchCount >= 450) {
                await challengesBatch.commit();
                console.log(`[Migration] Challenges-Batch committed (${challengesBatchCount} Operationen)`);
                challengesBatchCount = 0;
            }
        }

        if (challengesBatchCount > 0) {
            await challengesBatch.commit();
            console.log(`[Migration] Letzter Challenges-Batch committed (${challengesBatchCount} Operationen)`);
        }

        console.log(`[Migration] Erfolgreich abgeschlossen!`);
        console.log(`[Migration] Zusammenfassung:`);
        console.log(`  - Hauptgruppe erstellt: ${mainSubgroupId}`);
        console.log(`  - Benutzer migriert: ${migratedUsers}`);
        console.log(`  - Streaks migriert: ${migratedStreaks}`);
        console.log(`  - Anwesenheitseinträge migriert: ${migratedAttendance}`);
        console.log(`  - Challenges migriert: ${migratedChallenges}`);

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
        console.error('[Migration] Fehler:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

export async function checkAndMigrate(clubId, db) {
    const migrationNeeded = await needsMigration(clubId, db);

    if (migrationNeeded) {
        console.log(`[Migration] Migration erforderlich für Verein ${clubId}`);
        return await runMigration(clubId, db);
    } else {
        console.log(`[Migration] Keine Migration erforderlich für Verein ${clubId}`);
        return {
            success: true,
            skipped: true,
            message: 'Migration bereits abgeschlossen oder nicht erforderlich',
        };
    }
}
