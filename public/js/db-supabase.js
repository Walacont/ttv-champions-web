// Datenbank-Abstraktionsschicht für Supabase

import { getSupabase } from './supabase-init.js';

// ============================================
// FELDNAMEN-MAPPING (camelCase → snake_case)
// ============================================

const fieldMappings = {
    // User/Profile Felder
    firstName: 'first_name',
    lastName: 'last_name',
    photoURL: 'avatar_url',
    avatarUrl: 'avatar_url',
    clubId: 'club_id',
    eloRating: 'elo_rating',
    highestElo: 'highest_elo',
    league: 'league',

    // Doppel-Statistiken
    doublesEloRating: 'doubles_elo_rating',
    highestDoublesElo: 'highest_doubles_elo',
    doublesMatchesPlayed: 'doubles_matches_played',
    doublesMatchesWon: 'doubles_matches_won',
    doublesMatchesLost: 'doubles_matches_lost',

    // Training/Statistiken
    qttrPoints: 'qttr_points',
    grundlagenCompleted: 'grundlagen_completed',

    // Status-Flags
    isOffline: 'is_offline',
    isMatchReady: 'is_match_ready',
    onboardingComplete: 'onboarding_complete',

    // Push-Benachrichtigungen
    fcmToken: 'fcm_token',
    fcmTokenUpdatedAt: 'fcm_token_updated_at',
    notificationsEnabled: 'notifications_enabled',
    notificationPreferences: 'notification_preferences',
    notificationPreferencesUpdatedAt: 'notification_preferences_updated_at',

    // Einstellungen & Datenschutz
    leaderboardPreferences: 'leaderboard_preferences',
    privacySettings: 'privacy_settings',

    // Saison-Tracking
    lastSeasonReset: 'last_season_reset',
    lastXPUpdate: 'last_xp_update',

    // Subgroups
    subgroupIDs: 'subgroup_ids',

    // Migration
    migratedAt: 'migrated_at',
    migratedFrom: 'migrated_from',

    // Zeitstempel
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    // Match-Felder
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

    // Subgroup-Felder
    trainingDays: 'training_days',
    isDefault: 'is_default',

    // Anwesenheits-Felder
    subgroupId: 'subgroup_id',
    userId: 'user_id',
    xpAwarded: 'xp_awarded',
    recordedBy: 'recorded_by',
    sessionId: 'session_id',

    // Challenge-Felder
    xpReward: 'xp_reward',
    isActive: 'is_active',

    // Übungs-Felder
    recordCount: 'record_count',
    recordHolderId: 'record_holder_id',
    recordHolderName: 'record_holder_name',
    recordHolderClub: 'record_holder_club',
    recordHolderClubId: 'record_holder_club_id',
    recordUpdatedAt: 'record_updated_at',

    // Einladungscode-Felder
    maxUses: 'max_uses',
    useCount: 'use_count',
    expiresAt: 'expires_at',

    // Trainingssession-Felder
    startTime: 'start_time',
    endTime: 'end_time',

    // Doppel-Match-Felder
    teamASetsWon: 'team_a_sets_won',
    teamBSetsWon: 'team_b_sets_won',
    winningTeam: 'winning_team',
    isCrossClub: 'is_cross_club',
    teamAPlayer1Id: 'team_a_player1_id',
    teamAPlayer2Id: 'team_a_player2_id',
    teamBPlayer1Id: 'team_b_player1_id',
    teamBPlayer2Id: 'team_b_player2_id',

    // Allgemein
    logoUrl: 'logo_url'
};

// Umgekehrtes Mapping für Lesevorgänge
const reverseFieldMappings = Object.fromEntries(
    Object.entries(fieldMappings).map(([k, v]) => [v, k])
);

// Collection-Namen-Mapping
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
 * Konvertiert camelCase zu snake_case für Supabase
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
 * Konvertiert snake_case zu camelCase für Kompatibilität
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
 * Gibt Tabellenname von Collection-Name zurück
 */
function getTableName(collectionName) {
    return collectionMappings[collectionName] || collectionName;
}

// ============================================
// DOKUMENT-REFERENZ // ============================================

/**
 * Erstellt eine Dokumentreferenz */
export function doc(collectionName, docId) {
    return {
        _type: 'doc_ref',
        collection: getTableName(collectionName),
        id: docId
    };
}

/**
 * Holt ein einzelnes Dokument */
export async function getDoc(docRef) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from(docRef.collection)
        .select('*')
        .eq('id', docRef.id)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = keine Zeilen gefunden
        console.error('getDoc error:', error);
    }

    return {
        exists: () => !!data,
        data: () => data ? { id: docRef.id, ...toCamelCase(data) } : null,
        id: docRef.id
    };
}

/**
 * Aktualisiert ein Dokument */
export async function updateDoc(docRef, updates) {
    const supabase = getSupabase();

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
 * Setzt ein Dokument */
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
 * Löscht ein Dokument */
export async function deleteDoc(docRef) {
    const supabase = getSupabase();

    const { error } = await supabase
        .from(docRef.collection)
        .delete()
        .eq('id', docRef.id);

    if (error) throw error;
}

// ============================================
// COLLECTION-REFERENZ // ============================================

/**
 * Erstellt eine Collection-Referenz */
export function collection(collectionName) {
    return {
        _type: 'collection_ref',
        name: getTableName(collectionName)
    };
}

/**
 * Fügt ein Dokument zur Collection hinzu */
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
 * Holt alle Dokumente aus Collection */
export async function getDocs(queryObj) {
    const supabase = getSupabase();
    let query = supabase.from(queryObj._collection || queryObj.name).select('*');

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

    if (queryObj._orderBy) {
        for (const order of queryObj._orderBy) {
            query = query.order(order.field, { ascending: order.direction !== 'desc' });
        }
    }

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
// QUERY BUILDER // ============================================

/**
 * Erstellt eine Query */
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
 * Erstellt eine Where-Bedingung */
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
 * Erstellt eine OrderBy-Bedingung */
export function orderBy(field, direction = 'asc') {
    const snakeField = fieldMappings[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase();
    return {
        _type: 'orderBy',
        field: snakeField,
        direction
    };
}

/**
 * Erstellt eine Limit-Bedingung */
export function limit(n) {
    return {
        _type: 'limit',
        value: n
    };
}

// ============================================
// ECHTZEIT-LISTENER // ============================================

/**
 * Richtet einen Echtzeit-Listener ein */
export function onSnapshot(target, callback, errorCallback) {
    const supabase = getSupabase();

    if (target._type === 'doc_ref') {
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

        getDoc(target).then(callback).catch(errorCallback);

        return () => supabase.removeChannel(channel);

    } else if (target._type === 'query' || target._type === 'collection_ref') {
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
                    // Bei jeder Änderung neu abrufen
                    try {
                        const result = await getDocs(target);
                        callback(result);
                    } catch (error) {
                        if (errorCallback) errorCallback(error);
                    }
                }
            )
            .subscribe();

        getDocs(target).then(callback).catch(errorCallback);

        return () => supabase.removeChannel(channel);
    }

    console.error('onSnapshot: Unknown target type', target);
    return () => {};
}

// ============================================
// BATCH-SCHREIBVORGÄNGE // ============================================

/**
 * Erstellt einen Schreibstapel */
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
// SPEZIELLE WERTE // ============================================

/**
 * Server-Zeitstempel-Platzhalter */
export function serverTimestamp() {
    return { _type: 'serverTimestamp' };
}

/**
 * Inkrementierungswert */
export function increment(n) {
    return { _type: 'increment', value: n };
}

/**
 * Array-Union */
export function arrayUnion(...elements) {
    return { _type: 'arrayUnion', elements };
}

/**
 * Array-Remove */
export function arrayRemove(...elements) {
    return { _type: 'arrayRemove', elements };
}

/**
 * Verarbeitet spezielle Werte in Updates
 */
function processUpdates(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value && value._type === 'serverTimestamp') {
            result[key] = new Date().toISOString();
        } else if (value && value._type === 'increment') {
            // Hinweis: Increment benötigt spezielle Behandlung mit Supabase RPC
            // Vorerst wird nur der Wert gesetzt (Aufrufer muss Increment separat behandeln)
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
// HILFS-EXPORTS
// ============================================

export { toSnakeCase, toCamelCase, getTableName };
