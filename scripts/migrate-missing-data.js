/**
 * Migrate Missing Data from Firebase to Supabase
 *
 * Migriert: Attendance, Match Requests, Doubles Matches
 *
 * Usage: node scripts/migrate-missing-data.js
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

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

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ============================================
// ID MAPPING HELPERS
// ============================================

// Load existing ID mappings from profiles (email -> supabase_id)
const emailToSupabaseId = {};
const firebaseIdToSupabaseId = {};

async function loadIdMappings() {
    console.log('📥 Loading ID mappings...');

    // Load Supabase profiles
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email');

    if (error) throw error;

    profiles.forEach(p => {
        if (p.email) {
            emailToSupabaseId[p.email.toLowerCase()] = p.id;
        }
    });

    // Load Firebase users to map Firebase IDs to emails
    const usersSnapshot = await firestore.collection('users').get();
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.email) {
            const supabaseId = emailToSupabaseId[data.email.toLowerCase()];
            if (supabaseId) {
                firebaseIdToSupabaseId[doc.id] = supabaseId;
            }
        }
    });

    console.log(`   Mapped ${Object.keys(firebaseIdToSupabaseId).length} user IDs\n`);
}

function mapUserId(firebaseId) {
    if (!firebaseId) return null;
    return firebaseIdToSupabaseId[firebaseId] || null;
}

function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

// Load club mappings - maps club name to UUID
const clubNameToId = {};
const clubToSubgroupId = {};

async function loadClubMappings() {
    const { data: clubs } = await supabase.from('clubs').select('id, name');
    if (clubs) {
        clubs.forEach(c => {
            clubNameToId[c.name.toLowerCase()] = c.id;
        });
    }
    console.log(`   Loaded ${Object.keys(clubNameToId).length} club name mappings`);
}

// Load subgroup mappings - maps club_id to first subgroup
async function loadSubgroupMappings() {
    const { data: subgroups } = await supabase.from('subgroups').select('id, club_id');
    if (subgroups) {
        subgroups.forEach(s => {
            // Store first subgroup for each club as default
            if (!clubToSubgroupId[s.club_id]) {
                clubToSubgroupId[s.club_id] = s.id;
            }
        });
    }
    console.log(`   Loaded ${Object.keys(clubToSubgroupId).length} club->subgroup mappings`);
}

// Load training session mappings
const sessionMappings = {};
async function loadSessionMappings() {
    const { data: sessions } = await supabase.from('training_sessions').select('id, date, start_time, subgroup_id');
    if (sessions) {
        sessions.forEach(s => {
            // Create a key that can be matched
            const key = `${s.date}_${s.start_time}_${s.subgroup_id}`;
            sessionMappings[key] = s.id;
        });
    }
}

// ============================================
// MIGRATE ATTENDANCE
// ============================================

async function migrateAttendance() {
    console.log('🔄 Migrating Attendance...');

    const snapshot = await firestore.collection('attendance').get();
    console.log(`   Found ${snapshot.size} attendance records in Firebase`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        try {
            // Map player IDs - Firebase has array, Supabase needs one row per player
            const presentPlayerIds = (data.presentPlayerIds || [])
                .map(id => mapUserId(id))
                .filter(id => id !== null);

            // Map coach IDs for the coaches JSONB field
            let coaches = null;
            if (data.coachIds) {
                coaches = data.coachIds
                    .map(id => ({ id: mapUserId(id), hours: 2 }))
                    .filter(c => c.id !== null);
            } else if (data.coaches) {
                coaches = data.coaches
                    .map(c => ({ id: mapUserId(c.id), hours: c.hours || 2 }))
                    .filter(c => c.id !== null);
            }

            // Map club ID first (needed for subgroup fallback)
            // Firebase uses club NAME, not UUID
            let clubId = data.clubId;
            if (clubId && !isValidUUID(clubId)) {
                // Try to match by club name
                clubId = clubNameToId[clubId.toLowerCase()] || null;
            }

            // Get subgroup ID - use default from club if not valid
            let subgroupId = data.subgroupId;
            if (!subgroupId || !isValidUUID(subgroupId)) {
                // Use first subgroup from the club as fallback
                subgroupId = clubId ? clubToSubgroupId[clubId] : null;
            }

            // Get session ID if exists
            let sessionId = null;
            if (data.sessionId && isValidUUID(data.sessionId)) {
                sessionId = data.sessionId;
            }

            if (!clubId || !subgroupId || presentPlayerIds.length === 0) {
                skipped++;
                continue;
            }

            // Supabase uses ONE ROW PER USER - insert each present player as separate row
            for (const playerId of presentPlayerIds) {
                const attendanceData = {
                    id: randomUUID(), // Each row needs unique ID
                    date: data.date,
                    club_id: clubId,
                    subgroup_id: subgroupId,
                    session_id: sessionId,
                    user_id: playerId,
                    present: true,
                    xp_awarded: data.xpAwarded || 0,
                    notes: data.notes || null,
                    recorded_by: mapUserId(data.recordedBy) || null,
                    coaches: coaches,
                    created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
                };

                const { error } = await supabase
                    .from('attendance')
                    .insert(attendanceData);

                if (error) {
                    // Skip duplicates silently
                    if (!error.message.includes('duplicate')) {
                        console.log(`   ❌ Error: ${error.message}`);
                        errors++;
                    }
                } else {
                    migrated++;
                }
            }
        } catch (err) {
            console.log(`   ❌ Error processing ${doc.id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`   ✅ Migrated: ${migrated} player attendance records, Skipped: ${skipped} sessions, Errors: ${errors}\n`);
}

// ============================================
// MIGRATE MATCH REQUESTS
// ============================================

async function migrateMatchRequests() {
    console.log('🔄 Migrating Match Requests...');

    const snapshot = await firestore.collection('matchRequests').get();
    console.log(`   Found ${snapshot.size} match requests in Firebase`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        try {
            // Try multiple field name variations
            const playerAId = mapUserId(data.requesterId || data.playerAId || data.player_a_id);
            const playerBId = mapUserId(data.opponentId || data.playerBId || data.player_b_id);

            if (!playerAId || !playerBId) {
                console.log(`   ⚠️ Skipping ${doc.id}: Missing player IDs`);
                skipped++;
                continue;
            }

            // Map club ID - Firebase uses club NAME
            let clubId = data.clubId;
            if (clubId && !isValidUUID(clubId)) {
                clubId = clubNameToId[clubId.toLowerCase()] || null;
            }

            // Map winner/loser if they exist
            const winnerId = mapUserId(data.winnerId);
            const loserId = mapUserId(data.loserId);

            // Map Firebase status to Supabase enum values
            // Valid values: pending_player, pending_coach, approved, rejected
            const statusMap = {
                'pending': 'pending_player',
                'pending_player': 'pending_player',
                'pending_coach': 'pending_coach',
                'accepted': 'approved',
                'confirmed': 'approved',
                'approved': 'approved',
                'completed': 'approved',
                'rejected': 'rejected',
                'declined': 'rejected',
                'cancelled': 'rejected',
                'canceled': 'rejected'
            };
            const status = statusMap[data.status?.toLowerCase()] || 'pending_player';

            const requestData = {
                id: isValidUUID(doc.id) ? doc.id : randomUUID(),
                player_a_id: playerAId,
                player_b_id: playerBId,
                club_id: clubId,
                winner_id: winnerId,
                loser_id: loserId,
                status: status,
                sets: data.sets || null,
                approvals: data.approvals || null,
                is_cross_club: data.isCrossClub || false,
                created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
            };

            const { error } = await supabase
                .from('match_requests')
                .upsert(requestData, { onConflict: 'id' });

            if (error) {
                console.log(`   ❌ Error: ${error.message}`);
                errors++;
            } else {
                migrated++;
            }
        } catch (err) {
            console.log(`   ❌ Error processing ${doc.id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`   ✅ Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}\n`);
}

// ============================================
// MIGRATE DOUBLES MATCHES
// ============================================

async function migrateDoublesMatches() {
    console.log('🔄 Migrating Doubles Matches...');

    const snapshot = await firestore.collection('doublesMatches').get();
    console.log(`   Found ${snapshot.size} doubles matches in Firebase`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();

        try {
            // Map team player IDs - try multiple variations
            const teamAPlayer1 = mapUserId(data.team1Player1Id || data.teamAPlayer1Id || data.team1?.player1Id || data.teamA?.player1Id);
            const teamAPlayer2 = mapUserId(data.team1Player2Id || data.teamAPlayer2Id || data.team1?.player2Id || data.teamA?.player2Id);
            const teamBPlayer1 = mapUserId(data.team2Player1Id || data.teamBPlayer1Id || data.team2?.player1Id || data.teamB?.player1Id);
            const teamBPlayer2 = mapUserId(data.team2Player2Id || data.teamBPlayer2Id || data.team2?.player2Id || data.teamB?.player2Id);

            if (!teamAPlayer1 || !teamAPlayer2 || !teamBPlayer1 || !teamBPlayer2) {
                console.log(`   ⚠️ Skipping ${doc.id}: Missing player IDs`);
                skipped++;
                continue;
            }

            // Map club ID - Firebase uses club NAME
            let clubId = data.clubId;
            if (clubId && !isValidUUID(clubId)) {
                clubId = clubNameToId[clubId.toLowerCase()] || null;
            }

            // Winner team (A=1, B=2)
            const teamASetsWon = data.team1SetsWon || data.teamASetsWon || 0;
            const teamBSetsWon = data.team2SetsWon || data.teamBSetsWon || 0;
            const winningTeam = data.winnerTeam || data.winningTeam || (teamASetsWon > teamBSetsWon ? 'A' : 'B');

            const doublesData = {
                id: isValidUUID(doc.id) ? doc.id : randomUUID(),
                club_id: clubId,
                team_a_player1_id: teamAPlayer1,
                team_a_player2_id: teamAPlayer2,
                team_b_player1_id: teamBPlayer1,
                team_b_player2_id: teamBPlayer2,
                team_a_sets_won: teamASetsWon,
                team_b_sets_won: teamBSetsWon,
                winning_team: winningTeam,
                sets: data.sets || [],
                is_cross_club: data.isCrossClub || false,
                played_at: data.playedAt?.toDate?.()?.toISOString() || data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString()
            };

            const { error } = await supabase
                .from('doubles_matches')
                .upsert(doublesData, { onConflict: 'id' });

            if (error) {
                console.log(`   ❌ Error: ${error.message}`);
                errors++;
            } else {
                migrated++;
            }
        } catch (err) {
            console.log(`   ❌ Error processing ${doc.id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`   ✅ Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}\n`);
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log('========================================');
    console.log('🚀 Migrating Missing Data to Supabase');
    console.log('========================================\n');

    try {
        await loadIdMappings();
        await loadClubMappings();
        await loadSubgroupMappings();
        await loadSessionMappings();

        await migrateAttendance();
        await migrateMatchRequests();
        await migrateDoublesMatches();

        console.log('========================================');
        console.log('✅ Migration Complete!');
        console.log('========================================\n');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    }

    process.exit(0);
}

main();
