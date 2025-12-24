// Database Abstraction Layer for Supabase
// Provides Firebase-like API for easier migration
// SC Champions - Supabase Version

import { getSupabase } from './supabase-init.js';

// ============================================
// FIELD NAME MAPPING (camelCase → snake_case)
// ============================================

const fieldMappings = {
    // User/Profile fields (1:1 Firebase mapping)
    firstName: 'first_name',
    lastName: 'last_name',
    photoURL: 'avatar_url',
    avatarUrl: 'avatar_url',
    clubId: 'club_id',
    eloRating: 'elo_rating',
    highestElo: 'highest_elo',
    league: 'league',

    // Doubles Stats
    doublesEloRating: 'doubles_elo_rating',
    highestDoublesElo: 'highest_doubles_elo',
    doublesMatchesPlayed: 'doubles_matches_played',
    doublesMatchesWon: 'doubles_matches_won',
    doublesMatchesLost: 'doubles_matches_lost',

    // Training/Stats
    qttrPoints: 'qttr_points',
    grundlagenCompleted: 'grundlagen_completed',

    // Status Flags
    isOffline: 'is_offline',
    isMatchReady: 'is_match_ready',
    onboardingComplete: 'onboarding_complete',

    // Push Notifications
    fcmToken: 'fcm_token',
    fcmTokenUpdatedAt: 'fcm_token_updated_at',
    notificationsEnabled: 'notifications_enabled',
    notificationPreferences: 'notification_preferences',
    notificationPreferencesUpdatedAt: 'notification_preferences_updated_at',

    // Preferences & Privacy
    leaderboardPreferences: 'leaderboard_preferences',
    privacySettings: 'privacy_settings',

    // Season Tracking
    lastSeasonReset: 'last_season_reset',
    lastXPUpdate: 'last_xp_update',

    // Subgroups
    subgroupIDs: 'subgroup_ids',

    // Migration
    migratedAt: 'migrated_at',
    migratedFrom: 'migrated_from',

    // Timestamps
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    // Match fields
    playerAId: 'player_a_id',
    playerBId: 'player_b_id',
    winnerId: 'winner_id',
    loserId: 'loser_id',
    playerASetsWon: 'player_a_sets_won',
    playerBSetsWon: 'player_b_sets_won',
    eloChange: 'elo_change',
    playerAEloBefore: 'player_a_elo_before',
    playerBEloBefore: 'player_b_elo_before',
    playerAEloAfter: 'player_a_elo_after',
    playerBEloAfter: 'player_b_elo_after',
    playedAt: 'played_at',
    createdBy: 'created_by',
    sportId: 'sport_id',

    // Subgroup fields
    trainingDays: 'training_days',
    isDefault: 'is_default',

    // Attendance fields
    subgroupId: 'subgroup_id',
    userId: 'user_id',
    xpAwarded: 'xp_awarded',
    recordedBy: 'recorded_by',
    sessionId: 'session_id',

    // Challenge fields
    xpReward: 'xp_reward',
    isActive: 'is_active',

    // Exercise fields
    recordCount: 'record_count',
    recordHolderId: 'record_holder_id',
    recordHolderName: 'record_holder_name',
    recordHolderClub: 'record_holder_club',
    recordHolderClubId: 'record_holder_club_id',
    recordUpdatedAt: 'record_updated_at',

    // Invitation code fields
    maxUses: 'max_uses',
    useCount: 'use_count',
    expiresAt: 'expires_at',

    // Training session fields
    startTime: 'start_time',
    endTime: 'end_time',

    // Doubles match fields
    teamASetsWon: 'team_a_sets_won',
    teamBSetsWon: 'team_b_sets_won',
    winningTeam: 'winning_team',
    isCrossClub: 'is_cross_club',
    teamAPlayer1Id: 'team_a_player1_id',
    teamAPlayer2Id: 'team_a_player2_id',
    teamBPlayer1Id: 'team_b_player1_id',
    teamBPlayer2Id: 'team_b_player2_id',

    // General
    logoUrl: 'logo_url'
};

// Reverse mapping for reading data
const reverseFieldMappings = Object.fromEntries(
    Object.entries(fieldMappings).map(([k, v]) => [v, k])
);

// Collection name mappings (Firestore → Supabase tables)
const collectionMappings = {
    users: 'profiles',
    clubs: 'clubs',
    subgroups: 'subgroups',
    matches: 'matches',
    matchRequests: 'match_requests',
    matchProposals: 'match_proposals',
    doublesMatches: 'doubles_matches',
    doublesMatchRequests: 'doubles_match_requests',
    attendance: 'attendance',
    trainingSessions: 'training_sessions',
    challenges: 'challenges',
    exercises: 'exercises',
    invitationCodes: 'invitation_codes',
    clubRequests: 'club_requests',
    leaveClubRequests: 'leave_club_requests',
    pointsHistory: 'points_history',
    xpHistory: 'xp_history',
    streaks: 'streaks',
    completedChallenges: 'completed_challenges',
    completedExercises: 'completed_exercises',
    exerciseMilestones: 'exercise_milestones',
    sports: 'sports',
    config: 'config'
};

/**
 * Convert camelCase field names to snake_case for Supabase
 */
function toSnakeCase(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(toSnakeCase);

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const snakeKey = fieldMappings[key] || key.replace(/([A-Z])/g, '_$1').toLowerCase();
        result[snakeKey] = value && typeof value === 'object' && !(value instanceof Date)
            ? toSnakeCase(value)
            : value;
    }
    return result;
}

/**
 * Convert snake_case field names to camelCase for compatibility
 */
function toCamelCase(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(toCamelCase);

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const camelKey = reverseFieldMappings[key] || key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        result[camelKey] = value && typeof value === 'object' && !(value instanceof Date)
            ? toCamelCase(value)
            : value;
    }
    return result;
}

/**
 * Get table name from collection name
 */
function getTableName(collectionName) {
    return collectionMappings[collectionName] || collectionName;
}

// ============================================
// DOCUMENT REFERENCE (Firebase-like API)
// ============================================

/**
 * Creates a document reference (like Firestore doc())
 */
export function doc(collectionName, docId) {
    return {
        _type: 'doc_ref',
        collection: getTableName(collectionName),
        id: docId
    };
}

/**
 * Gets a single document (like Firestore getDoc())
 */
export async function getDoc(docRef) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from(docRef.collection)
        .select('*')
        .eq('id', docRef.id)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('getDoc error:', error);
    }

    return {
        exists: () => !!data,
        data: () => data ? { id: docRef.id, ...toCamelCase(data) } : null,
        id: docRef.id
    };
}

/**
 * Updates a document (like Firestore updateDoc())
 */
export async function updateDoc(docRef, updates) {
    const supabase = getSupabase();

    // Handle serverTimestamp
    const processedUpdates = processUpdates(updates);
    const snakeCaseUpdates = toSnakeCase(processedUpdates);

    const { error } = await supabase
        .from(docRef.collection)
        .update(snakeCaseUpdates)
        .eq('id', docRef.id);

    if (error) {
        console.error('updateDoc error:', error);
        throw error;
    }
}

/**
 * Sets a document (like Firestore setDoc())
 */
export async function setDoc(docRef, data, options = {}) {
    const supabase = getSupabase();

    const processedData = processUpdates(data);
    const snakeCaseData = toSnakeCase({ id: docRef.id, ...processedData });

    if (options.merge) {
        const { error } = await supabase
            .from(docRef.collection)
            .upsert(snakeCaseData, { onConflict: 'id' });

        if (error) throw error;
    } else {
        const { error } = await supabase
            .from(docRef.collection)
            .insert(snakeCaseData);

        if (error) throw error;
    }
}

/**
 * Deletes a document (like Firestore deleteDoc())
 */
export async function deleteDoc(docRef) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from(docRef.collection)
        .delete()
        .eq('id', docRef.id);

    if (error) throw error;
}

// ============================================
// COLLECTION REFERENCE (Firebase-like API)
// ============================================

/**
 * Creates a collection reference (like Firestore collection())
 */
export function collection(collectionName) {
    return {
        _type: 'collection_ref',
        name: getTableName(collectionName)
    };
}

/**
 * Adds a document to collection (like Firestore addDoc())
 */
export async function addDoc(collectionRef, data) {
    const supabase = getSupabase();

    const processedData = processUpdates(data);
    const snakeCaseData = toSnakeCase(processedData);

    const { data: result, error } = await supabase
        .from(collectionRef.name)
        .insert(snakeCaseData)
        .select()
        .single();

    if (error) throw error;

    return {
        id: result.id,
        ...toCamelCase(result)
    };
}

/**
 * Gets all documents from collection (like Firestore getDocs())
 */
export async function getDocs(queryObj) {
    const supabase = getSupabase();
    let query = supabase.from(queryObj._collection || queryObj.name).select('*');

    // Apply filters
    if (queryObj._filters) {
        for (const filter of queryObj._filters) {
            if (filter.op === '==') {
                query = query.eq(filter.field, filter.value);
            } else if (filter.op === '!=') {
                query = query.neq(filter.field, filter.value);
            } else if (filter.op === '<') {
                query = query.lt(filter.field, filter.value);
            } else if (filter.op === '<=') {
                query = query.lte(filter.field, filter.value);
            } else if (filter.op === '>') {
                query = query.gt(filter.field, filter.value);
            } else if (filter.op === '>=') {
                query = query.gte(filter.field, filter.value);
            } else if (filter.op === 'in') {
                query = query.in(filter.field, filter.value);
            } else if (filter.op === 'array-contains') {
                query = query.contains(filter.field, [filter.value]);
            }
        }
    }

    // Apply ordering
    if (queryObj._orderBy) {
        for (const order of queryObj._orderBy) {
            query = query.order(order.field, { ascending: order.direction !== 'desc' });
        }
    }

    // Apply limit
    if (queryObj._limit) {
        query = query.limit(queryObj._limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('getDocs error:', error);
        throw error;
    }

    return {
        docs: (data || []).map(row => ({
            id: row.id,
            data: () => toCamelCase(row),
            exists: () => true
        })),
        empty: !data || data.length === 0,
        size: data ? data.length : 0
    };
}

// ============================================
// QUERY BUILDERS (Firebase-like API)
// ============================================

/**
 * Creates a query (like Firestore query())
 */
export function query(collectionRef, ...constraints) {
    const queryObj = {
        _type: 'query',
        _collection: collectionRef.name,
        _filters: [],
        _orderBy: [],
        _limit: null
    };

    for (const constraint of constraints) {
        if (constraint._type === 'where') {
            queryObj._filters.push(constraint);
        } else if (constraint._type === 'orderBy') {
            queryObj._orderBy.push(constraint);
        } else if (constraint._type === 'limit') {
            queryObj._limit = constraint.value;
        }
    }

    return queryObj;
}

/**
 * Creates a where constraint (like Firestore where())
 */
export function where(field, op, value) {
    const snakeField = fieldMappings[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase();
    return {
        _type: 'where',
        field: snakeField,
        op,
        value
    };
}

/**
 * Creates an orderBy constraint (like Firestore orderBy())
 */
export function orderBy(field, direction = 'asc') {
    const snakeField = fieldMappings[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase();
    return {
        _type: 'orderBy',
        field: snakeField,
        direction
    };
}

/**
 * Creates a limit constraint (like Firestore limit())
 */
export function limit(n) {
    return {
        _type: 'limit',
        value: n
    };
}

// ============================================
// REAL-TIME LISTENERS (Firebase-like API)
// ============================================

/**
 * Sets up a real-time listener (like Firestore onSnapshot())
 */
export function onSnapshot(target, callback, errorCallback) {
    const supabase = getSupabase();

    if (target._type === 'doc_ref') {
        // Document listener
        const channel = supabase
            .channel(`doc_${target.collection}_${target.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: target.collection,
                    filter: `id=eq.${target.id}`
                },
                async (payload) => {
                    if (payload.eventType === 'DELETE') {
                        callback({
                            exists: () => false,
                            data: () => null,
                            id: target.id
                        });
                    } else {
                        const data = payload.new;
                        callback({
                            exists: () => true,
                            data: () => toCamelCase(data),
                            id: target.id
                        });
                    }
                }
            )
            .subscribe();

        // Initial fetch
        getDoc(target).then(callback).catch(errorCallback);

        // Return unsubscribe function
        return () => supabase.removeChannel(channel);

    } else if (target._type === 'query' || target._type === 'collection_ref') {
        // Query/Collection listener
        const tableName = target._collection || target.name;
        const channelName = `query_${tableName}_${Date.now()}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: tableName
                },
                async () => {
                    // Re-fetch on any change
                    try {
                        const result = await getDocs(target);
                        callback(result);
                    } catch (error) {
                        if (errorCallback) errorCallback(error);
                    }
                }
            )
            .subscribe();

        // Initial fetch
        getDocs(target).then(callback).catch(errorCallback);

        // Return unsubscribe function
        return () => supabase.removeChannel(channel);
    }

    console.error('onSnapshot: Unknown target type', target);
    return () => {};
}

// ============================================
// BATCH WRITES (Firebase-like API)
// ============================================

/**
 * Creates a write batch (like Firestore writeBatch())
 */
export function writeBatch() {
    const operations = [];

    return {
        set: (docRef, data, options = {}) => {
            operations.push({ type: 'set', docRef, data, options });
        },
        update: (docRef, data) => {
            operations.push({ type: 'update', docRef, data });
        },
        delete: (docRef) => {
            operations.push({ type: 'delete', docRef });
        },
        commit: async () => {
            const supabase = getSupabase();

            for (const op of operations) {
                const processedData = op.data ? toSnakeCase(processUpdates(op.data)) : null;

                if (op.type === 'set') {
                    if (op.options.merge) {
                        await supabase
                            .from(op.docRef.collection)
                            .upsert({ id: op.docRef.id, ...processedData }, { onConflict: 'id' });
                    } else {
                        await supabase
                            .from(op.docRef.collection)
                            .insert({ id: op.docRef.id, ...processedData });
                    }
                } else if (op.type === 'update') {
                    await supabase
                        .from(op.docRef.collection)
                        .update(processedData)
                        .eq('id', op.docRef.id);
                } else if (op.type === 'delete') {
                    await supabase
                        .from(op.docRef.collection)
                        .delete()
                        .eq('id', op.docRef.id);
                }
            }
        }
    };
}

// ============================================
// SPECIAL VALUES (Firebase-like API)
// ============================================

/**
 * Server timestamp placeholder (like Firestore serverTimestamp())
 */
export function serverTimestamp() {
    return { _type: 'serverTimestamp' };
}

/**
 * Increment value (like Firestore increment())
 */
export function increment(n) {
    return { _type: 'increment', value: n };
}

/**
 * Array union (like Firestore arrayUnion())
 */
export function arrayUnion(...elements) {
    return { _type: 'arrayUnion', elements };
}

/**
 * Array remove (like Firestore arrayRemove())
 */
export function arrayRemove(...elements) {
    return { _type: 'arrayRemove', elements };
}

/**
 * Process special values in updates
 */
function processUpdates(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value && value._type === 'serverTimestamp') {
            result[key] = new Date().toISOString();
        } else if (value && value._type === 'increment') {
            // Note: Increment needs special handling with Supabase RPC
            // For now, just set the value (caller should handle increment separately)
            result[key] = value.value;
        } else if (value && value._type === 'arrayUnion') {
            result[key] = value.elements;
        } else if (value && value._type === 'arrayRemove') {
            result[key] = value.elements;
        } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            result[key] = processUpdates(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ============================================
// HELPER EXPORTS
// ============================================

export { toSnakeCase, toCamelCase, getTableName };
