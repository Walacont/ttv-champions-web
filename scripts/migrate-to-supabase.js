/**
 * Firebase to Supabase Migration Script
 *
 * Migriert alle Daten von Firestore nach Supabase PostgreSQL
 *
 * Usage:
 *   node scripts/migrate-to-supabase.js
 *
 * Voraussetzungen:
 *   - firebase-service-account.json im scripts/ Ordner
 *   - npm install in scripts/ ausgeführt
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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
const firebaseAuth = getAuth();

// Initialize Supabase (with service_role key to bypass RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// ============================================
// ID MAPPING (Firebase Text IDs → Supabase UUIDs)
// ============================================

const idMappings = {
    clubs: {},
    users: {},
    subgroups: {},
    exercises: {},
    challenges: {},
    matches: {},
    attendance: {},
    trainingSessions: {},
    invitationCodes: {},
    doublesMatches: {}
};

function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

function getOrCreateUUID(oldId, collection) {
    if (!oldId) return null;

    // If already a valid UUID, use it
    if (isValidUUID(oldId)) {
        idMappings[collection][oldId] = oldId;
        return oldId;
    }

    // If we already mapped this ID, return the mapping
    if (idMappings[collection][oldId]) {
        return idMappings[collection][oldId];
    }

    // Generate new UUID
    const newUUID = randomUUID();
    idMappings[collection][oldId] = newUUID;
    return newUUID;
}

function getMappedId(oldId, collection) {
    if (!oldId) return null;
    if (isValidUUID(oldId)) return oldId;
    return idMappings[collection][oldId] || null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function log(message, type = 'info') {
    const prefix = {
        info: '📋',
        success: '✅',
        error: '❌',
        warn: '⚠️',
        progress: '🔄'
    };
    console.log(`${prefix[type] || '•'} ${message}`);
}

function convertTimestamp(firestoreTimestamp) {
    if (!firestoreTimestamp) return null;
    if (firestoreTimestamp.toDate) {
        return firestoreTimestamp.toDate().toISOString();
    }
    if (firestoreTimestamp._seconds) {
        return new Date(firestoreTimestamp._seconds * 1000).toISOString();
    }
    return firestoreTimestamp;
}

function convertDate(firestoreTimestamp) {
    if (!firestoreTimestamp) return null;
    const iso = convertTimestamp(firestoreTimestamp);
    return iso ? iso.split('T')[0] : null;
}

// ============================================
// MIGRATION FUNCTIONS
// ============================================

async function migrateClubs() {
    log('Migrating clubs...', 'progress');

    const snapshot = await firestore.collection('clubs').get();
    const clubs = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'clubs');

        clubs.push({
            id: newId,
            name: data.name || 'Unknown Club',
            description: data.description || null,
            logo_url: data.logoUrl || null,
            settings: data.settings || {},
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });

        log(`  Club: ${doc.id} → ${newId}`, 'info');
    }

    if (clubs.length === 0) {
        log('No clubs found', 'warn');
        return idMappings.clubs;
    }

    const { error } = await supabase.from('clubs').upsert(clubs, { onConflict: 'id' });
    if (error) {
        log(`Error migrating clubs: ${error.message}`, 'error');
        throw error;
    }

    log(`Migrated ${clubs.length} clubs`, 'success');
    return idMappings.clubs;
}

async function migrateUsers(clubIdMap) {
    log('Migrating users...', 'progress');

    const snapshot = await firestore.collection('users').get();
    const profiles = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        let newUserId = null;

        // For online users with email: create in Supabase Auth
        if (data.email && !data.isOffline) {
            try {
                // Create user in Supabase Auth (generates UUID automatically)
                const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                    email: data.email,
                    email_confirm: true,
                    password: 'TempPassword123!', // User muss Passwort zurücksetzen
                    user_metadata: {
                        display_name: data.displayName || data.name || 'Unknown'
                    }
                });

                if (authError) {
                    if (authError.message.includes('already been registered')) {
                        // User exists, get their ID
                        const { data: users } = await supabase.auth.admin.listUsers();
                        const existingUser = users?.users?.find(u => u.email === data.email);
                        if (existingUser) {
                            newUserId = existingUser.id;
                            log(`  User exists: ${data.email} → ${newUserId}`, 'info');
                        }
                    } else {
                        log(`  Auth error for ${data.email}: ${authError.message}`, 'warn');
                    }
                } else {
                    newUserId = authData.user.id;
                    log(`  Created auth: ${data.email} → ${newUserId}`, 'info');
                }
            } catch (e) {
                log(`  Error creating auth user ${data.email}: ${e.message}`, 'warn');
            }
        }

        // For offline users or if auth failed: generate UUID
        if (!newUserId) {
            newUserId = getOrCreateUUID(doc.id, 'users');
            log(`  Offline user: ${doc.id} → ${newUserId}`, 'info');
        } else {
            idMappings.users[doc.id] = newUserId;
        }

        const mappedClubId = getMappedId(data.clubId, 'clubs');

        profiles.push({
            id: newUserId,
            email: data.email || null,
            display_name: data.displayName || data.name || 'Unknown Player',
            avatar_url: data.avatarUrl || data.photoURL || null,
            role: data.role || 'player',
            club_id: mappedClubId,
            xp: data.xp || 0,
            points: data.points || 0,
            elo_rating: data.eloRating || data.elo || 1000,
            highest_elo: data.highestElo || data.eloRating || 1000,
            qttr_points: data.qttrPoints || null,
            grundlagen_completed: data.grundlagenCompleted || 0,
            is_offline: data.isOffline || false,
            onboarding_complete: data.onboardingComplete || false,
            privacy_settings: data.privacySettings || { searchable: true, showElo: true },
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (profiles.length === 0) {
        log('No users found', 'warn');
        return idMappings.users;
    }

    // Insert in batches of 100
    for (let i = 0; i < profiles.length; i += 100) {
        const batch = profiles.slice(i, i + 100);
        const { error } = await supabase.from('profiles').upsert(batch, { onConflict: 'id' });
        if (error) {
            log(`Error migrating users batch ${i}: ${error.message}`, 'error');
        }
    }

    log(`Migrated ${profiles.length} users`, 'success');
    return idMappings.users;
}

async function migrateSubgroups(clubIdMap) {
    log('Migrating subgroups...', 'progress');

    const snapshot = await firestore.collection('subgroups').get();
    const subgroups = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'subgroups');
        const mappedClubId = getMappedId(data.clubId, 'clubs');

        subgroups.push({
            id: newId,
            club_id: mappedClubId,
            name: data.name || 'Unknown Subgroup',
            description: data.description || null,
            color: data.color || null,
            training_days: data.trainingDays || null,
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (subgroups.length === 0) {
        log('No subgroups found', 'warn');
        return idMappings.subgroups;
    }

    const { error } = await supabase.from('subgroups').upsert(subgroups, { onConflict: 'id' });
    if (error) {
        log(`Error migrating subgroups: ${error.message}`, 'error');
    } else {
        log(`Migrated ${subgroups.length} subgroups`, 'success');
    }

    return idMappings.subgroups;
}

async function migrateMatches(clubIdMap, userIdMap) {
    log('Migrating matches...', 'progress');

    const snapshot = await firestore.collection('matches').get();
    const matches = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'matches');

        matches.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            player_a_id: getMappedId(data.playerAId, 'users'),
            player_b_id: getMappedId(data.playerBId, 'users'),
            winner_id: getMappedId(data.winnerId, 'users'),
            loser_id: getMappedId(data.loserId, 'users'),
            sets: data.sets || null,
            player_a_sets_won: data.playerASetsWon || 0,
            player_b_sets_won: data.playerBSetsWon || 0,
            elo_change: data.eloChange || null,
            player_a_elo_before: data.playerAEloBefore || null,
            player_b_elo_before: data.playerBEloBefore || null,
            player_a_elo_after: data.playerAEloAfter || null,
            player_b_elo_after: data.playerBEloAfter || null,
            played_at: convertTimestamp(data.playedAt || data.createdAt) || new Date().toISOString(),
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (matches.length === 0) {
        log('No matches found', 'warn');
        return;
    }

    // Insert in batches
    for (let i = 0; i < matches.length; i += 100) {
        const batch = matches.slice(i, i + 100);
        const { error } = await supabase.from('matches').upsert(batch, { onConflict: 'id' });
        if (error) {
            log(`Error migrating matches batch ${i}: ${error.message}`, 'error');
        }
    }

    log(`Migrated ${matches.length} matches`, 'success');
}

async function migrateAttendance(clubIdMap, userIdMap, subgroupIdMap) {
    log('Migrating attendance...', 'progress');

    const snapshot = await firestore.collection('attendance').get();
    const attendance = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'attendance');

        attendance.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            subgroup_id: getMappedId(data.subgroupId, 'subgroups'),
            user_id: getMappedId(data.userId, 'users'),
            date: convertDate(data.date) || new Date().toISOString().split('T')[0],
            present: data.present !== false,
            xp_awarded: data.xpAwarded || 0,
            notes: data.notes || null,
            recorded_by: getMappedId(data.recordedBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (attendance.length === 0) {
        log('No attendance found', 'warn');
        return;
    }

    for (let i = 0; i < attendance.length; i += 100) {
        const batch = attendance.slice(i, i + 100);
        const { error } = await supabase.from('attendance').upsert(batch, { onConflict: 'id' });
        if (error) {
            log(`Error migrating attendance batch ${i}: ${error.message}`, 'error');
        }
    }

    log(`Migrated ${attendance.length} attendance records`, 'success');
}

async function migrateChallenges(clubIdMap, userIdMap, subgroupIdMap) {
    log('Migrating challenges...', 'progress');

    const snapshot = await firestore.collection('challenges').get();
    const challenges = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'challenges');

        challenges.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            subgroup_id: getMappedId(data.subgroupId, 'subgroups'),
            title: data.title || 'Challenge',
            description: data.description || null,
            xp_reward: data.xpReward || 10,
            date: convertDate(data.date) || new Date().toISOString().split('T')[0],
            is_active: data.isActive !== false,
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (challenges.length === 0) {
        log('No challenges found', 'warn');
        return;
    }

    const { error } = await supabase.from('challenges').upsert(challenges, { onConflict: 'id' });
    if (error) {
        log(`Error migrating challenges: ${error.message}`, 'error');
    } else {
        log(`Migrated ${challenges.length} challenges`, 'success');
    }
}

async function migrateExercises(userIdMap, clubIdMap) {
    log('Migrating exercises...', 'progress');

    const snapshot = await firestore.collection('exercises').get();
    const exercises = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'exercises');

        exercises.push({
            id: newId,
            name: data.name || 'Exercise',
            description: data.description || null,
            category: data.category || null,
            difficulty: data.difficulty || 1,
            xp_reward: data.xpReward || 10,
            record_count: data.recordCount || null,
            record_holder_id: getMappedId(data.recordHolderId, 'users'),
            record_holder_name: data.recordHolderName || null,
            record_holder_club: data.recordHolderClub || null,
            record_holder_club_id: getMappedId(data.recordHolderClubId, 'clubs'),
            record_updated_at: convertTimestamp(data.recordUpdatedAt),
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (exercises.length === 0) {
        log('No exercises found', 'warn');
        return;
    }

    const { error } = await supabase.from('exercises').upsert(exercises, { onConflict: 'id' });
    if (error) {
        log(`Error migrating exercises: ${error.message}`, 'error');
    } else {
        log(`Migrated ${exercises.length} exercises`, 'success');
    }
}

async function migrateTrainingSessions(clubIdMap, userIdMap, subgroupIdMap) {
    log('Migrating training sessions...', 'progress');

    const snapshot = await firestore.collection('trainingSessions').get();
    const sessions = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'trainingSessions');

        sessions.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            subgroup_id: getMappedId(data.subgroupId, 'subgroups'),
            title: data.title || null,
            date: convertDate(data.date) || new Date().toISOString().split('T')[0],
            start_time: data.startTime || null,
            end_time: data.endTime || null,
            notes: data.notes || null,
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (sessions.length === 0) {
        log('No training sessions found', 'warn');
        return;
    }

    const { error } = await supabase.from('training_sessions').upsert(sessions, { onConflict: 'id' });
    if (error) {
        log(`Error migrating training sessions: ${error.message}`, 'error');
    } else {
        log(`Migrated ${sessions.length} training sessions`, 'success');
    }
}

async function migrateInvitationCodes(clubIdMap, userIdMap, subgroupIdMap) {
    log('Migrating invitation codes...', 'progress');

    const snapshot = await firestore.collection('invitationCodes').get();
    const codes = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'invitationCodes');

        codes.push({
            id: newId,
            code: data.code,
            club_id: getMappedId(data.clubId, 'clubs'),
            subgroup_id: getMappedId(data.subgroupId, 'subgroups'),
            max_uses: data.maxUses || null,
            use_count: data.useCount || 0,
            expires_at: convertTimestamp(data.expiresAt),
            is_active: data.isActive !== false && !data.used,
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (codes.length === 0) {
        log('No invitation codes found', 'warn');
        return;
    }

    const { error } = await supabase.from('invitation_codes').upsert(codes, { onConflict: 'id' });
    if (error) {
        log(`Error migrating invitation codes: ${error.message}`, 'error');
    } else {
        log(`Migrated ${codes.length} invitation codes`, 'success');
    }
}

async function migrateDoublesMatches(clubIdMap, userIdMap) {
    log('Migrating doubles matches...', 'progress');

    const snapshot = await firestore.collection('doublesMatches').get();
    const matches = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'doublesMatches');

        matches.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            team_a_player1_id: getMappedId(data.teamA?.player1Id, 'users'),
            team_a_player2_id: getMappedId(data.teamA?.player2Id, 'users'),
            team_b_player1_id: getMappedId(data.teamB?.player1Id, 'users'),
            team_b_player2_id: getMappedId(data.teamB?.player2Id, 'users'),
            winning_team: data.winningTeam || null,
            sets: data.sets || null,
            team_a_sets_won: data.teamASetsWon || 0,
            team_b_sets_won: data.teamBSetsWon || 0,
            is_cross_club: data.isCrossClub || false,
            played_at: convertTimestamp(data.playedAt || data.createdAt) || new Date().toISOString(),
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (matches.length === 0) {
        log('No doubles matches found', 'warn');
        return;
    }

    const { error } = await supabase.from('doubles_matches').upsert(matches, { onConflict: 'id' });
    if (error) {
        log(`Error migrating doubles matches: ${error.message}`, 'error');
    } else {
        log(`Migrated ${matches.length} doubles matches`, 'success');
    }
}

// ============================================
// SUBCOLLECTIONS MIGRATION
// ============================================

async function migrateUserSubcollections(userIdMap) {
    log('Migrating user subcollections...', 'progress');

    const usersSnapshot = await firestore.collection('users').get();
    let totalPoints = 0;
    let totalXp = 0;

    for (const userDoc of usersSnapshot.docs) {
        const userId = getMappedId(userDoc.id, 'users');
        if (!userId) continue;

        // Points History
        const pointsSnapshot = await firestore.collection('users').doc(userDoc.id).collection('pointsHistory').get();
        const pointsHistory = pointsSnapshot.docs.map(doc => ({
            user_id: userId,
            points: doc.data().points || 0,
            reason: doc.data().reason || null,
            awarded_by: getMappedId(doc.data().awardedBy, 'users'),
            created_at: convertTimestamp(doc.data().createdAt) || new Date().toISOString()
        }));

        if (pointsHistory.length > 0) {
            const { error } = await supabase.from('points_history').insert(pointsHistory);
            if (error) log(`Points history error for ${userDoc.id}: ${error.message}`, 'warn');
            else totalPoints += pointsHistory.length;
        }

        // XP History
        const xpSnapshot = await firestore.collection('users').doc(userDoc.id).collection('xpHistory').get();
        const xpHistory = xpSnapshot.docs.map(doc => ({
            user_id: userId,
            xp: doc.data().xp || 0,
            reason: doc.data().reason || null,
            source: doc.data().source || null,
            awarded_by: getMappedId(doc.data().awardedBy, 'users'),
            created_at: convertTimestamp(doc.data().createdAt) || new Date().toISOString()
        }));

        if (xpHistory.length > 0) {
            const { error } = await supabase.from('xp_history').insert(xpHistory);
            if (error) log(`XP history error for ${userDoc.id}: ${error.message}`, 'warn');
            else totalXp += xpHistory.length;
        }
    }

    log(`Migrated ${totalPoints} points history + ${totalXp} xp history records`, 'success');
}

// ============================================
// MAIN MIGRATION
// ============================================

async function runMigration() {
    console.log('\n========================================');
    console.log('  Firebase → Supabase Migration');
    console.log('========================================\n');

    try {
        // Step 1: Migrate clubs first (no dependencies)
        const clubIdMap = await migrateClubs();

        // Step 2: Migrate subgroups (depends on clubs)
        const subgroupIdMap = await migrateSubgroups(clubIdMap);

        // Step 3: Migrate users (depends on clubs)
        const userIdMap = await migrateUsers(clubIdMap);

        // Step 4: Migrate exercises (depends on users, clubs)
        await migrateExercises(userIdMap, clubIdMap);

        // Step 5: Migrate matches (depends on clubs, users)
        await migrateMatches(clubIdMap, userIdMap);

        // Step 6: Migrate doubles matches
        await migrateDoublesMatches(clubIdMap, userIdMap);

        // Step 7: Migrate attendance (depends on clubs, users, subgroups)
        await migrateAttendance(clubIdMap, userIdMap, subgroupIdMap);

        // Step 8: Migrate training sessions
        await migrateTrainingSessions(clubIdMap, userIdMap, subgroupIdMap);

        // Step 9: Migrate challenges
        await migrateChallenges(clubIdMap, userIdMap, subgroupIdMap);

        // Step 10: Migrate invitation codes
        await migrateInvitationCodes(clubIdMap, userIdMap, subgroupIdMap);

        // Step 11: Migrate user subcollections (history, etc.)
        await migrateUserSubcollections(userIdMap);

        // Save ID mappings to file for reference
        const mappingFile = join(__dirname, 'id-mappings.json');
        writeFileSync(mappingFile, JSON.stringify(idMappings, null, 2));
        log(`ID mappings saved to: ${mappingFile}`, 'info');

        console.log('\n========================================');
        log('Migration completed successfully!', 'success');
        console.log('========================================\n');

        console.log('⚠️  WICHTIG: Alle migrierten User haben ein temporäres Passwort.');
        console.log('   Sie müssen "Passwort vergessen" nutzen um ein neues zu setzen.\n');
        console.log('📁 ID-Mappings wurden gespeichert in: scripts/id-mappings.json\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

// Run the migration
runMigration();
