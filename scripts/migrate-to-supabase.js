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
                // Build display name for auth metadata
                let authDisplayName = data.displayName || data.name;
                if (!authDisplayName && (data.firstName || data.lastName)) {
                    authDisplayName = `${data.firstName || ''} ${data.lastName || ''}`.trim();
                }
                if (!authDisplayName) {
                    authDisplayName = 'Unknown';
                }

                // Create user in Supabase Auth (generates UUID automatically)
                const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                    email: data.email,
                    email_confirm: true,
                    password: 'TempPassword123!', // User muss Passwort zurücksetzen
                    user_metadata: {
                        display_name: authDisplayName
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

        // Build display name from firstName + lastName, or use displayName/name as fallback
        // Build names properly
        const firstName = data.firstName || null;
        const lastName = data.lastName || null;

        // Build display name: prefer displayName/name, fallback to firstName + lastName
        let displayName = data.displayName || data.name;
        if (!displayName && (firstName || lastName)) {
            displayName = `${firstName || ''} ${lastName || ''}`.trim();
        }
        if (!displayName) {
            displayName = 'Unknown Player';
        }

        // Berechne neuen Elo basierend auf qttr und highestElo
        // Formel: highestElo - qttr + 800, mindestens 800
        // QTTR-Punkte gibt es nicht mehr, alle starten jetzt mit 800 als Basis
        const qttr = data.qttrPoints || 800;
        const highestElo = data.highestElo || data.eloRating || 800;
        const calculatedElo = Math.max(800, highestElo - qttr + 800);

        profiles.push({
            id: newUserId,
            email: data.email || null,
            first_name: firstName,
            last_name: lastName,
            display_name: displayName,
            avatar_url: data.avatarUrl || data.photoURL || null,
            role: data.role || 'player',
            club_id: mappedClubId,
            xp: data.xp || 0,
            points: data.points || 0,
            elo_rating: calculatedElo,
            highest_elo: calculatedElo,
            qttr_points: null, // QTTR-Punkte werden nicht mehr verwendet
            grundlagen_completed: data.grundlagenCompleted || 0,
            is_offline: data.isOffline || false,
            onboarding_complete: data.onboardingComplete || false,
            privacy_settings: data.privacySettings || { searchable: true, showElo: true },
            gender: data.gender || null,
            birthdate: data.birthdate || null,
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (profiles.length === 0) {
        log('No users found', 'warn');
        return idMappings.users;
    }

    // Insert profiles one by one for better error handling
    let successCount = 0;
    let errorCount = 0;

    for (const profile of profiles) {
        const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });
        if (error) {
            log(`  Profile error for ${profile.display_name}: ${error.message}`, 'warn');
            errorCount++;
        } else {
            successCount++;
        }
    }

    log(`Migrated ${successCount} profiles (${errorCount} errors)`, successCount > 0 ? 'success' : 'warn');
    return idMappings.users;
}

async function migrateSubgroups(clubIdMap, sportId) {
    log('Migrating subgroups...', 'progress');

    const snapshot = await firestore.collection('subgroups').get();
    let successCount = 0;
    let errorCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'subgroups');
        const mappedClubId = getMappedId(data.clubId, 'clubs');

        const subgroup = {
            id: newId,
            club_id: mappedClubId,
            sport_id: sportId,
            name: data.name || 'Unknown Subgroup',
            description: data.description || null,
            color: data.color || null,
            training_days: data.trainingDays || null,
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        };

        const { error } = await supabase.from('subgroups').upsert(subgroup, { onConflict: 'id' });
        if (error) {
            log(`  Subgroup error for "${data.name}": ${error.message}`, 'warn');
            errorCount++;
        } else {
            log(`  Subgroup: ${data.name} → ${newId}`, 'info');
            successCount++;
        }
    }

    log(`Migrated ${successCount} subgroups (${errorCount} errors)`, successCount > 0 ? 'success' : 'warn');
    return idMappings.subgroups;
}

async function migrateMatches(clubIdMap, userIdMap, sportId) {
    log('Migrating matches...', 'progress');

    const snapshot = await firestore.collection('matches').get();
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'matches');

        const playerAId = getMappedId(data.playerAId, 'users');
        const playerBId = getMappedId(data.playerBId, 'users');
        const clubId = getMappedId(data.clubId, 'clubs');

        // Skip matches with missing required fields
        if (!playerAId || !playerBId || !clubId) {
            log(`  Skipping match ${doc.id}: missing player or club ID`, 'warn');
            skippedCount++;
            continue;
        }

        const match = {
            id: newId,
            club_id: clubId,
            sport_id: sportId,
            player_a_id: playerAId,
            player_b_id: playerBId,
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
            winner_elo_change: data.winnerEloChange || null,
            loser_elo_change: data.loserEloChange || null,
            season_points_awarded: data.seasonPointsAwarded || 0,
            match_mode: data.matchMode || null,
            handicap_used: data.handicapUsed || false,
            handicap: data.handicap || null,
            played_at: convertTimestamp(data.playedAt || data.createdAt) || new Date().toISOString(),
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        };

        const { error } = await supabase.from('matches').upsert(match, { onConflict: 'id' });
        if (error) {
            log(`  Match error: ${error.message}`, 'warn');
            errorCount++;
        } else {
            successCount++;
        }
    }

    log(`Migrated ${successCount} matches (${errorCount} errors, ${skippedCount} skipped)`, successCount > 0 ? 'success' : 'warn');
}

async function migrateAttendance(clubIdMap, userIdMap, subgroupIdMap) {
    log('Migrating attendance...', 'progress');

    const snapshot = await firestore.collection('attendance').get();
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'attendance');

        const userId = getMappedId(data.userId, 'users');
        const clubId = getMappedId(data.clubId, 'clubs');

        // Skip attendance with missing required fields
        if (!userId || !clubId) {
            skippedCount++;
            continue;
        }

        const record = {
            id: newId,
            club_id: clubId,
            subgroup_id: getMappedId(data.subgroupId, 'subgroups'),
            user_id: userId,
            date: convertDate(data.date) || new Date().toISOString().split('T')[0],
            present: data.present !== false,
            xp_awarded: data.xpAwarded || 0,
            notes: data.notes || null,
            recorded_by: getMappedId(data.recordedBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        };

        const { error } = await supabase.from('attendance').upsert(record, { onConflict: 'id' });
        if (error) {
            errorCount++;
        } else {
            successCount++;
        }
    }

    log(`Migrated ${successCount} attendance (${errorCount} errors, ${skippedCount} skipped)`, successCount > 0 ? 'success' : 'warn');
}

async function migrateChallenges(clubIdMap, userIdMap, subgroupIdMap, sportId) {
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
            sport_id: sportId,
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

// Konvertiert Text-Difficulty zu Integer
function convertDifficulty(diff) {
    if (typeof diff === 'number') return diff;
    if (!diff) return 1;

    const mapping = {
        'easy': 1,
        'leicht': 1,
        'normal': 2,
        'mittel': 2,
        'medium': 2,
        'hard': 3,
        'schwer': 3,
        'difficult': 3,
        'expert': 4,
        'experte': 4
    };

    return mapping[diff.toLowerCase()] || 1;
}

async function migrateExercises(userIdMap, clubIdMap, sportId) {
    log('Migrating exercises...', 'progress');

    const snapshot = await firestore.collection('exercises').get();
    const exercises = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'exercises');

        exercises.push({
            id: newId,
            sport_id: sportId,
            name: data.name || 'Exercise',
            description: data.description || null,
            category: data.category || null,
            difficulty: convertDifficulty(data.difficulty),
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

async function migrateTrainingSessions(clubIdMap, userIdMap, subgroupIdMap, sportId) {
    log('Migrating training sessions...', 'progress');

    const snapshot = await firestore.collection('trainingSessions').get();
    const sessions = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'trainingSessions');

        const createdAt = convertTimestamp(data.createdAt) || new Date().toISOString();

        sessions.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            subgroup_id: getMappedId(data.subgroupId, 'subgroups'),
            sport_id: data.sportId ? getMappedId(data.sportId, 'sports') : sportId,
            title: data.title || null,
            date: convertDate(data.date) || new Date().toISOString().split('T')[0],
            start_time: data.startTime || null,
            end_time: data.endTime || null,
            notes: data.notes || null,
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: createdAt,
            updated_at: convertTimestamp(data.updatedAt) || createdAt
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

async function migrateDoublesMatches(clubIdMap, userIdMap, sportId) {
    log('Migrating doubles matches...', 'progress');

    const snapshot = await firestore.collection('doublesMatches').get();
    const matches = [];
    let skippedCount = 0;

    for (const doc of snapshot.docs) {
        const data = doc.data();
        const newId = getOrCreateUUID(doc.id, 'doublesMatches');

        // Get mapped player IDs
        const teamAPlayer1Id = getMappedId(data.teamA?.player1Id, 'users');
        const teamAPlayer2Id = getMappedId(data.teamA?.player2Id, 'users');
        const teamBPlayer1Id = getMappedId(data.teamB?.player1Id, 'users');
        const teamBPlayer2Id = getMappedId(data.teamB?.player2Id, 'users');

        // Skip if any player ID is missing
        if (!teamAPlayer1Id || !teamAPlayer2Id || !teamBPlayer1Id || !teamBPlayer2Id) {
            log(`  Skipping doubles match ${doc.id}: missing player ID(s)`, 'warn');
            skippedCount++;
            continue;
        }

        matches.push({
            id: newId,
            club_id: getMappedId(data.clubId, 'clubs'),
            sport_id: sportId,
            team_a_player1_id: teamAPlayer1Id,
            team_a_player2_id: teamAPlayer2Id,
            team_b_player1_id: teamBPlayer1Id,
            team_b_player2_id: teamBPlayer2Id,
            winning_team: data.winningTeam || null,
            sets: data.sets || null,
            team_a_sets_won: data.teamASetsWon || 0,
            team_b_sets_won: data.teamBSetsWon || 0,
            is_cross_club: data.isCrossClub || false,
            match_mode: data.matchMode || null,
            handicap_used: data.handicapUsed || false,
            handicap: data.handicap || null,
            winner_elo_change: data.winnerEloChange || null,
            loser_elo_change: data.loserEloChange || null,
            season_points_awarded: data.seasonPointsAwarded || 0,
            played_at: convertTimestamp(data.playedAt || data.createdAt) || new Date().toISOString(),
            created_by: getMappedId(data.createdBy, 'users'),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });
    }

    if (matches.length === 0) {
        log(`No valid doubles matches found (${skippedCount} skipped)`, 'warn');
        return;
    }

    const { error } = await supabase.from('doubles_matches').upsert(matches, { onConflict: 'id' });
    if (error) {
        log(`Error migrating doubles matches: ${error.message}`, 'error');
    } else {
        log(`Migrated ${matches.length} doubles matches${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`, 'success');
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

        // Points History - delete existing first to avoid duplicates on re-run
        const pointsSnapshot = await firestore.collection('users').doc(userDoc.id).collection('pointsHistory').get();
        const pointsHistory = pointsSnapshot.docs.map(doc => ({
            user_id: userId,
            points: doc.data().points || 0,
            reason: doc.data().reason || null,
            awarded_by: getMappedId(doc.data().awardedBy, 'users'),
            created_at: convertTimestamp(doc.data().createdAt) || new Date().toISOString()
        }));

        if (pointsHistory.length > 0) {
            // Delete existing records for this user first to avoid duplicates
            await supabase.from('points_history').delete().eq('user_id', userId);
            const { error } = await supabase.from('points_history').insert(pointsHistory);
            if (error) log(`Points history error for ${userDoc.id}: ${error.message}`, 'warn');
            else totalPoints += pointsHistory.length;
        }

        // XP History - delete existing first to avoid duplicates on re-run
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
            // Delete existing records for this user first to avoid duplicates
            await supabase.from('xp_history').delete().eq('user_id', userId);
            const { error } = await supabase.from('xp_history').insert(xpHistory);
            if (error) log(`XP history error for ${userDoc.id}: ${error.message}`, 'warn');
            else totalXp += xpHistory.length;
        }
    }

    log(`Migrated ${totalPoints} points history + ${totalXp} xp history records`, 'success');
}

async function migrateConfig() {
    log('Migrating config...', 'progress');

    try {
        // Migrate seasonReset config
        const seasonResetDoc = await firestore.collection('config').doc('seasonReset').get();

        if (seasonResetDoc.exists) {
            const data = seasonResetDoc.data();
            const configValue = {
                lastResetDate: convertTimestamp(data.lastResetDate)
            };

            const { error } = await supabase.from('config').upsert({
                key: 'season_reset',
                value: configValue,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

            if (error) {
                log(`Error migrating seasonReset config: ${error.message}`, 'warn');
            } else {
                log('Migrated seasonReset config', 'success');
            }
        } else {
            log('No seasonReset config found in Firebase', 'warn');
        }
    } catch (error) {
        log(`Error migrating config: ${error.message}`, 'error');
    }
}

async function migrateDoublesPairings(clubIdMap, userIdMap) {
    log('Migrating doubles pairings...', 'progress');

    const snapshot = await firestore.collection('doublesPairings').get();
    const pairings = [];

    for (const doc of snapshot.docs) {
        const data = doc.data();

        // Map player IDs
        const player1Id = getMappedId(data.player1Id, 'users');
        const player2Id = getMappedId(data.player2Id, 'users');
        const clubId = getMappedId(data.clubId, 'clubs');

        if (!player1Id || !player2Id) {
            log(`  Skipping pairing ${doc.id}: missing player IDs`, 'warn');
            continue;
        }

        // Create sorted pairing ID
        const sortedIds = [player1Id, player2Id].sort();
        const pairingId = `${sortedIds[0]}_${sortedIds[1]}`;

        pairings.push({
            id: pairingId,
            player1_id: sortedIds[0],
            player2_id: sortedIds[1],
            player1_name: data.player1Name || null,
            player2_name: data.player2Name || null,
            player1_club_id_at_match: getMappedId(data.player1ClubIdAtMatch, 'clubs'),
            player2_club_id_at_match: getMappedId(data.player2ClubIdAtMatch, 'clubs'),
            club_id: clubId,
            matches_played: data.matchesPlayed || 0,
            matches_won: data.matchesWon || 0,
            matches_lost: data.matchesLost || 0,
            win_rate: data.winRate || 0.0,
            current_elo_rating: data.currentEloRating || 800,
            last_played: convertTimestamp(data.lastPlayed),
            created_at: convertTimestamp(data.createdAt) || new Date().toISOString()
        });

        log(`  Pairing: ${doc.id} → ${pairingId}`, 'info');
    }

    if (pairings.length === 0) {
        log('No doubles pairings found', 'warn');
        return;
    }

    const { error } = await supabase.from('doubles_pairings').upsert(pairings, { onConflict: 'id' });
    if (error) {
        log(`Error migrating doubles pairings: ${error.message}`, 'error');
        throw error;
    }

    log(`Migrated ${pairings.length} doubles pairings`, 'success');
}

// ============================================
// MAIN MIGRATION
// ============================================

/**
 * Get the UUID for table tennis sport from Supabase
 */
async function getTableTennisSportId() {
    log('Fetching table tennis sport ID...', 'progress');

    const { data, error } = await supabase
        .from('sports')
        .select('id')
        .eq('name', 'table_tennis')
        .single();

    if (error) {
        log(`Error fetching table tennis sport: ${error.message}`, 'error');
        throw error;
    }

    if (!data) {
        log('Table tennis sport not found in database!', 'error');
        throw new Error('Table tennis sport not found');
    }

    log(`Table tennis sport ID: ${data.id}`, 'success');
    return data.id;
}

async function runMigration() {
    console.log('\n========================================');
    console.log('  Firebase → Supabase Migration');
    console.log('========================================\n');

    try {
        // Step 0: Get table tennis sport ID (all migrated data is for table tennis)
        const tableTennisSportId = await getTableTennisSportId();

        // Step 1: Migrate clubs first (no dependencies)
        const clubIdMap = await migrateClubs();

        // Step 2: Migrate subgroups (depends on clubs)
        const subgroupIdMap = await migrateSubgroups(clubIdMap, tableTennisSportId);

        // Step 3: Migrate users (depends on clubs)
        const userIdMap = await migrateUsers(clubIdMap);

        // Step 4: Migrate exercises (depends on users, clubs)
        await migrateExercises(userIdMap, clubIdMap, tableTennisSportId);

        // Step 5: Migrate matches (depends on clubs, users)
        await migrateMatches(clubIdMap, userIdMap, tableTennisSportId);

        // Step 6: Migrate doubles matches
        await migrateDoublesMatches(clubIdMap, userIdMap, tableTennisSportId);

        // Step 7: Migrate attendance (depends on clubs, users, subgroups)
        await migrateAttendance(clubIdMap, userIdMap, subgroupIdMap);

        // Step 8: Migrate training sessions
        await migrateTrainingSessions(clubIdMap, userIdMap, subgroupIdMap, tableTennisSportId);

        // Step 9: Migrate challenges
        await migrateChallenges(clubIdMap, userIdMap, subgroupIdMap, tableTennisSportId);

        // Step 10: Migrate invitation codes
        await migrateInvitationCodes(clubIdMap, userIdMap, subgroupIdMap);

        // Step 11: Migrate user subcollections (history, etc.)
        await migrateUserSubcollections(userIdMap);

        // Step 12: Migrate doubles pairings
        await migrateDoublesPairings(clubIdMap, userIdMap);

        // Step 13: Migrate config (seasonReset, etc.)
        await migrateConfig();

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
