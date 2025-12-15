/**
 * Firebase to Supabase Migration Script - Doubles Data
 *
 * Migriert Doppel-Spieldaten von Firestore nach Supabase:
 * - doublesPairings (Doppel-Paarungen mit Statistiken)
 * - doublesMatches (Abgeschlossene Doppel-Spiele)
 * - doublesMatchRequests (Ausstehende Doppel-Anfragen)
 *
 * Usage:
 *   node scripts/migrate-doubles-data.js
 *
 * ⚠️ WICHTIG: VOR der Migration müssen Sie in Supabase SQL Editor ausführen:
 *   DROP TRIGGER IF EXISTS trigger_process_doubles_match ON doubles_matches;
 *
 * Nach der Migration können Sie den Trigger wieder aktivieren:
 *   CREATE TRIGGER trigger_process_doubles_match
 *       BEFORE INSERT ON doubles_matches
 *       FOR EACH ROW
 *       EXECUTE FUNCTION process_doubles_match_result();
 *
 * Voraussetzungen:
 *   - firebase-service-account.json im scripts/ Ordner
 *   - npm install in scripts/ ausgeführt
 *   - id-mappings-new.json mit User-ID Mappings
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

const SUPABASE_URL = 'https://wmrbjuyqgbmvtzrujuxs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtcmJqdXlxZ2JtdnR6cnVqdXhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY3OTMzOSwiZXhwIjoyMDgwMjU1MzM5fQ.94nqvxAhCHUP0g1unKzdnInOaM4huwTTcSnKxJ5jSdA';

// Load Firebase service account
const serviceAccountPath = join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const firestore = getFirestore();

// Initialize Supabase (with service_role key to bypass RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ============================================
// LOAD ID MAPPINGS
// ============================================

const idMappingsPath = join(__dirname, 'id-mappings-new.json');
let userMappings = {};

try {
    const mappingsData = JSON.parse(readFileSync(idMappingsPath, 'utf8'));
    userMappings = mappingsData.users || {};
    console.log(`✅ Loaded ${Object.keys(userMappings).length} user ID mappings`);
} catch (error) {
    console.error('❌ Error loading ID mappings:', error.message);
    process.exit(1);
}

// Club name to UUID mapping (will be loaded from Supabase)
let clubMappings = {};

// ============================================
// HELPER FUNCTIONS
// ============================================

function isValidUUID(str) {
    if (!str) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

function mapUserId(firebaseUserId) {
    if (!firebaseUserId) return null;
    if (isValidUUID(firebaseUserId)) return firebaseUserId;
    return userMappings[firebaseUserId] || null;
}

function mapClubId(firebaseClubId) {
    if (!firebaseClubId) return null;
    if (isValidUUID(firebaseClubId)) return firebaseClubId;
    return clubMappings[firebaseClubId] || null;
}

/**
 * Creates a Supabase pairing ID from two player UUIDs
 * Format: player1_player2 (UUIDs sorted alphabetically)
 */
function createSupabasePairingId(player1Uuid, player2Uuid) {
    if (!player1Uuid || !player2Uuid) return null;
    const sorted = [player1Uuid, player2Uuid].sort();
    return `${sorted[0]}_${sorted[1]}`;
}

/**
 * Converts Firebase timestamp to ISO string
 */
function convertTimestamp(firebaseTimestamp) {
    if (!firebaseTimestamp) return null;
    if (firebaseTimestamp.toDate) {
        return firebaseTimestamp.toDate().toISOString();
    }
    if (firebaseTimestamp instanceof Date) {
        return firebaseTimestamp.toISOString();
    }
    return null;
}

// ============================================
// LOAD CLUB MAPPINGS FROM SUPABASE
// ============================================

async function loadClubMappings() {
    console.log('\n📍 Loading club mappings from Supabase...');

    const { data: clubs, error } = await supabase
        .from('clubs')
        .select('id, name');

    if (error) {
        console.error('❌ Error loading clubs:', error.message);
        return;
    }

    clubs.forEach(club => {
        clubMappings[club.name] = club.id;
    });

    console.log(`✅ Loaded ${clubs.length} club mappings`);
}

// ============================================
// MIGRATE DOUBLES PAIRINGS
// ============================================

async function migrateDoublesPairings() {
    console.log('\n🎯 Migrating Doubles Pairings...');

    const snapshot = await firestore.collection('doublesPairings').get();
    console.log(`Found ${snapshot.size} doubles pairings in Firebase`);

    if (snapshot.empty) {
        console.log('No doubles pairings to migrate');
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const firebasePairingId = doc.id;

        try {
            // Map player IDs
            const player1Uuid = mapUserId(data.player1Id);
            const player2Uuid = mapUserId(data.player2Id);

            if (!player1Uuid || !player2Uuid) {
                console.log(`⚠️ Skipping pairing ${firebasePairingId}: Missing player mapping (player1: ${data.player1Id} -> ${player1Uuid}, player2: ${data.player2Id} -> ${player2Uuid})`);
                skippedCount++;
                continue;
            }

            // Create Supabase pairing ID (sorted)
            const supabasePairingId = createSupabasePairingId(player1Uuid, player2Uuid);

            // Sort player UUIDs to ensure consistent ordering
            const sortedUuids = [player1Uuid, player2Uuid].sort();
            const isSwapped = sortedUuids[0] !== player1Uuid;

            // Map club IDs
            const clubUuid = mapClubId(data.clubId);
            const player1ClubUuid = mapClubId(data.player1ClubIdAtMatch);
            const player2ClubUuid = mapClubId(data.player2ClubIdAtMatch);

            // Use sorted order for player data to ensure consistency
            const pairingData = {
                id: supabasePairingId,
                player1_id: sortedUuids[0],
                player2_id: sortedUuids[1],
                player1_name: isSwapped ? (data.player2Name || null) : (data.player1Name || null),
                player2_name: isSwapped ? (data.player1Name || null) : (data.player2Name || null),
                player1_club_id_at_match: isSwapped ? player2ClubUuid : player1ClubUuid,
                player2_club_id_at_match: isSwapped ? player1ClubUuid : player2ClubUuid,
                club_id: clubUuid,
                matches_played: data.matchesPlayed || 0,
                matches_won: data.matchesWon || 0,
                matches_lost: data.matchesLost || 0,
                win_rate: data.winRate || 0,
                current_elo_rating: data.currentEloRating || 1000,
                last_played: convertTimestamp(data.lastPlayed),
                created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
            };

            const { error } = await supabase
                .from('doubles_pairings')
                .upsert(pairingData, { onConflict: 'id' });

            if (error) {
                console.error(`❌ Error inserting pairing ${supabasePairingId}:`, error.message);
                errorCount++;
            } else {
                successCount++;
            }

        } catch (error) {
            console.error(`❌ Error processing pairing ${firebasePairingId}:`, error.message);
            errorCount++;
        }
    }

    console.log(`\n✅ Doubles Pairings migration complete:`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Skipped: ${skippedCount}`);
}

// ============================================
// MIGRATE DOUBLES MATCHES
// ============================================

async function migrateDoublesMatches() {
    console.log('\n🎯 Migrating Doubles Matches...');
    console.log('   ⚠️ Stellen Sie sicher, dass der Trigger deaktiviert wurde!');
    console.log('   (DROP TRIGGER IF EXISTS trigger_process_doubles_match ON doubles_matches;)\n');

    const snapshot = await firestore.collection('doublesMatches').get();
    console.log(`Found ${snapshot.size} doubles matches in Firebase`);

    if (snapshot.empty) {
        console.log('No doubles matches to migrate');
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const firebaseMatchId = doc.id;

        try {
            // Map player IDs for both teams
            const teamAPlayer1Uuid = mapUserId(data.teamA?.player1Id);
            const teamAPlayer2Uuid = mapUserId(data.teamA?.player2Id);
            const teamBPlayer1Uuid = mapUserId(data.teamB?.player1Id);
            const teamBPlayer2Uuid = mapUserId(data.teamB?.player2Id);

            if (!teamAPlayer1Uuid || !teamAPlayer2Uuid || !teamBPlayer1Uuid || !teamBPlayer2Uuid) {
                console.log(`⚠️ Skipping match ${firebaseMatchId}: Missing player mapping`);
                skippedCount++;
                continue;
            }

            // Map club ID
            const clubUuid = mapClubId(data.clubId);

            // Calculate sets won
            const sets = data.sets || [];
            let teamASetsWon = 0;
            let teamBSetsWon = 0;

            sets.forEach(set => {
                if ((set.teamA || 0) > (set.teamB || 0)) {
                    teamASetsWon++;
                } else if ((set.teamB || 0) > (set.teamA || 0)) {
                    teamBSetsWon++;
                }
            });

            const playedAt = convertTimestamp(data.timestamp) || convertTimestamp(data.createdAt);

            // Check if match already exists (to avoid duplicates)
            const { data: existingMatches } = await supabase
                .from('doubles_matches')
                .select('id')
                .eq('team_a_player1_id', teamAPlayer1Uuid)
                .eq('team_a_player2_id', teamAPlayer2Uuid)
                .eq('team_b_player1_id', teamBPlayer1Uuid)
                .eq('team_b_player2_id', teamBPlayer2Uuid)
                .eq('played_at', playedAt)
                .limit(1);

            if (existingMatches && existingMatches.length > 0) {
                console.log(`⚠️ Skipping match ${firebaseMatchId}: Already exists in Supabase`);
                skippedCount++;
                continue;
            }

            const matchData = {
                club_id: clubUuid,
                team_a_player1_id: teamAPlayer1Uuid,
                team_a_player2_id: teamAPlayer2Uuid,
                team_b_player1_id: teamBPlayer1Uuid,
                team_b_player2_id: teamBPlayer2Uuid,
                winning_team: data.winningTeam || null,
                sets: sets,
                team_a_sets_won: teamASetsWon,
                team_b_sets_won: teamBSetsWon,
                is_cross_club: false,
                played_at: playedAt,
                created_by: null, // Set to null to avoid foreign key errors
                created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
            };

            const { error } = await supabase
                .from('doubles_matches')
                .insert(matchData);

            if (error) {
                console.error(`❌ Error inserting match ${firebaseMatchId}:`, error.message);
                errorCount++;
            } else {
                successCount++;
            }

        } catch (error) {
            console.error(`❌ Error processing match ${firebaseMatchId}:`, error.message);
            errorCount++;
        }
    }

    console.log(`\n✅ Doubles Matches migration complete:`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Skipped: ${skippedCount}`);
}

// ============================================
// MIGRATE DOUBLES MATCH REQUESTS
// ============================================

async function migrateDoublesMatchRequests() {
    console.log('\n🎯 Migrating Doubles Match Requests...');

    const snapshot = await firestore.collection('doublesMatchRequests').get();
    console.log(`Found ${snapshot.size} doubles match requests in Firebase`);

    if (snapshot.empty) {
        console.log('No doubles match requests to migrate');
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const firebaseRequestId = doc.id;

        try {
            // Skip already approved/processed requests (they should be in doublesMatches)
            if (data.status === 'approved' || data.status === 'processed') {
                console.log(`⚠️ Skipping request ${firebaseRequestId}: Already ${data.status}`);
                skippedCount++;
                continue;
            }

            // Map player IDs for both teams
            const teamAPlayer1Uuid = mapUserId(data.teamA?.player1Id);
            const teamAPlayer2Uuid = mapUserId(data.teamA?.player2Id);
            const teamBPlayer1Uuid = mapUserId(data.teamB?.player1Id);
            const teamBPlayer2Uuid = mapUserId(data.teamB?.player2Id);

            if (!teamAPlayer1Uuid || !teamAPlayer2Uuid || !teamBPlayer1Uuid || !teamBPlayer2Uuid) {
                console.log(`⚠️ Skipping request ${firebaseRequestId}: Missing player mapping`);
                skippedCount++;
                continue;
            }

            // Map club ID
            const clubUuid = mapClubId(data.clubId);

            // Map initiated_by
            const initiatedByUuid = mapUserId(data.initiatedBy);

            if (!initiatedByUuid) {
                console.log(`⚠️ Skipping request ${firebaseRequestId}: Missing initiatedBy mapping`);
                skippedCount++;
                continue;
            }

            // Convert confirmations to approvals format
            const approvals = {};
            if (data.confirmations) {
                for (const [firebaseUserId, confirmed] of Object.entries(data.confirmations)) {
                    const uuid = mapUserId(firebaseUserId);
                    if (uuid) {
                        approvals[uuid] = confirmed;
                    }
                }
            }

            // Map Firebase status to Supabase status
            let status = 'pending_opponent';
            if (data.status === 'pending_coach') {
                status = 'pending_coach';
            } else if (data.status === 'pending_player') {
                status = 'pending_opponent';
            }

            const createdAt = convertTimestamp(data.createdAt) || new Date().toISOString();

            // Check if request already exists (to avoid duplicates)
            const { data: existingRequests } = await supabase
                .from('doubles_match_requests')
                .select('id')
                .eq('initiated_by', initiatedByUuid)
                .eq('created_at', createdAt)
                .limit(1);

            if (existingRequests && existingRequests.length > 0) {
                console.log(`⚠️ Skipping request ${firebaseRequestId}: Already exists in Supabase`);
                skippedCount++;
                continue;
            }

            const requestData = {
                club_id: clubUuid,
                initiated_by: initiatedByUuid,
                team_a: {
                    player1_id: teamAPlayer1Uuid,
                    player2_id: teamAPlayer2Uuid
                },
                team_b: {
                    player1_id: teamBPlayer1Uuid,
                    player2_id: teamBPlayer2Uuid
                },
                sets: data.sets || null,
                winning_team: data.winningTeam || null,
                status: status,
                approvals: approvals,
                is_cross_club: false,
                created_at: createdAt,
                updated_at: convertTimestamp(data.confirmedAt) || createdAt
            };

            const { error } = await supabase
                .from('doubles_match_requests')
                .insert(requestData);

            if (error) {
                console.error(`❌ Error inserting request ${firebaseRequestId}:`, error.message);
                errorCount++;
            } else {
                successCount++;
            }

        } catch (error) {
            console.error(`❌ Error processing request ${firebaseRequestId}:`, error.message);
            errorCount++;
        }
    }

    console.log(`\n✅ Doubles Match Requests migration complete:`);
    console.log(`   - Success: ${successCount}`);
    console.log(`   - Errors: ${errorCount}`);
    console.log(`   - Skipped: ${skippedCount}`);
}

// ============================================
// MAIN MIGRATION
// ============================================

async function main() {
    console.log('🚀 Starting Doubles Data Migration...\n');
    console.log('=' .repeat(50));

    try {
        // Load club mappings first
        await loadClubMappings();

        // Migrate in order (pairings first, then matches, then requests)
        await migrateDoublesPairings();
        await migrateDoublesMatches();
        await migrateDoublesMatchRequests();

        console.log('\n' + '='.repeat(50));
        console.log('✅ Doubles Data Migration Complete!');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    }
}

main();
