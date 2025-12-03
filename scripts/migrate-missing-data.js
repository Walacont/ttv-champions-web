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

// Load subgroup mappings
const subgroupMappings = {};
async function loadSubgroupMappings() {
    const { data: subgroups } = await supabase.from('subgroups').select('id, club_id');
    // We'll match by checking existing subgroups
    if (subgroups) {
        subgroups.forEach(s => {
            subgroupMappings[s.id] = s.id; // UUID to UUID
        });
    }
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
            // Map player IDs
            const presentPlayerIds = (data.presentPlayerIds || [])
                .map(id => mapUserId(id))
                .filter(id => id !== null);

            // Map coach IDs
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

            // Get subgroup ID
            let subgroupId = data.subgroupId;
            if (subgroupId && !isValidUUID(subgroupId)) {
                // Try to find matching subgroup
                subgroupId = null;
            }

            // Get session ID if exists
            let sessionId = null;
            if (data.sessionId && isValidUUID(data.sessionId)) {
                sessionId = data.sessionId;
            }

            // Map club ID
            let clubId = data.clubId;
            if (clubId && !isValidUUID(clubId)) {
                // Load club by some identifier if needed
                const { data: clubs } = await supabase.from('clubs').select('id').limit(1);
                clubId = clubs?.[0]?.id || null;
            }

            if (!clubId || presentPlayerIds.length === 0) {
                skipped++;
                continue;
            }

            const attendanceData = {
                id: isValidUUID(doc.id) ? doc.id : randomUUID(),
                date: data.date,
                club_id: clubId,
                subgroup_id: subgroupId,
                session_id: sessionId,
                present_player_ids: presentPlayerIds,
                coaches: coaches,
                created_at: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                updated_at: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString()
            };

            const { error } = await supabase
                .from('attendance')
                .upsert(attendanceData, { onConflict: 'id' });

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
            const requesterId = mapUserId(data.requesterId);
            const opponentId = mapUserId(data.opponentId);

            if (!requesterId || !opponentId) {
                skipped++;
                continue;
            }

            // Map club ID
            let clubId = data.clubId;
            if (clubId && !isValidUUID(clubId)) {
                const { data: clubs } = await supabase.from('clubs').select('id').limit(1);
                clubId = clubs?.[0]?.id || null;
            }

            const requestData = {
                id: isValidUUID(doc.id) ? doc.id : randomUUID(),
                requester_id: requesterId,
                opponent_id: opponentId,
                club_id: clubId,
                status: data.status || 'pending',
                message: data.message || null,
                proposed_date: data.proposedDate || null,
                proposed_time: data.proposedTime || null,
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
            // Map team player IDs
            const team1Player1 = mapUserId(data.team1Player1Id || data.team1?.player1Id);
            const team1Player2 = mapUserId(data.team1Player2Id || data.team1?.player2Id);
            const team2Player1 = mapUserId(data.team2Player1Id || data.team2?.player1Id);
            const team2Player2 = mapUserId(data.team2Player2Id || data.team2?.player2Id);

            if (!team1Player1 || !team1Player2 || !team2Player1 || !team2Player2) {
                skipped++;
                continue;
            }

            // Map club ID
            let clubId = data.clubId;
            if (clubId && !isValidUUID(clubId)) {
                const { data: clubs } = await supabase.from('clubs').select('id').limit(1);
                clubId = clubs?.[0]?.id || null;
            }

            // Winner team
            const winnerTeam = data.winnerTeam || (data.team1SetsWon > data.team2SetsWon ? 1 : 2);

            const doublesData = {
                id: isValidUUID(doc.id) ? doc.id : randomUUID(),
                club_id: clubId,
                team1_player1_id: team1Player1,
                team1_player2_id: team1Player2,
                team2_player1_id: team2Player1,
                team2_player2_id: team2Player2,
                team1_sets_won: data.team1SetsWon || 0,
                team2_sets_won: data.team2SetsWon || 0,
                winner_team: winnerTeam,
                sets: data.sets || [],
                elo_change: data.eloChange || 0,
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
