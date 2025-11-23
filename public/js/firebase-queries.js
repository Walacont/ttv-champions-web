/**
 * Firebase Query Utilities
 * Centralized, reusable query functions for Firestore
 * Reduces code duplication and ensures consistent data access patterns
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

// ========================================================================
// ===== USER QUERIES =====
// ========================================================================

/**
 * Get all players in a club
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {string} [sortBy='lastName'] - Field to sort by
 * @returns {Promise<Array>} Array of player objects with IDs
 */
export async function getClubPlayers(db, clubId, sortBy = 'lastName') {
  const q = query(
    collection(db, 'users'),
    where('clubId', '==', clubId),
    where('role', '==', 'player'),
    orderBy(sortBy)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all users in a club (players + coaches)
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {string} [sortBy='lastName'] - Field to sort by
 * @returns {Promise<Array>} Array of user objects with IDs
 */
export async function getClubUsers(db, clubId, sortBy = 'lastName') {
  const q = query(collection(db, 'users'), where('clubId', '==', clubId), orderBy(sortBy));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get a single user by ID
 * @param {Firestore} db - Firestore instance
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User object or null
 */
export async function getUserById(db, userId) {
  const docRef = doc(db, 'users', userId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

/**
 * Subscribe to club players (real-time updates)
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback with array of players
 * @param {string} [sortBy='lastName'] - Field to sort by
 * @returns {Function} Unsubscribe function
 */
export function subscribeToClubPlayers(db, clubId, callback, sortBy = 'lastName') {
  const q = query(
    collection(db, 'users'),
    where('clubId', '==', clubId),
    where('role', '==', 'player'),
    orderBy(sortBy)
  );
  return onSnapshot(q, (snapshot) => {
    const players = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(players);
  });
}

// ========================================================================
// ===== MATCH QUERIES =====
// ========================================================================

/**
 * Get matches for a club
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {number} [maxResults=50] - Maximum results
 * @returns {Promise<Array>} Array of match objects
 */
export async function getClubMatches(db, clubId, maxResults = 50) {
  const q = query(
    collection(db, 'matches'),
    where('clubId', '==', clubId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get matches for a specific player
 * @param {Firestore} db - Firestore instance
 * @param {string} playerId - Player ID
 * @param {number} [maxResults=20] - Maximum results
 * @returns {Promise<Array>} Array of match objects
 */
export async function getPlayerMatches(db, playerId, maxResults = 20) {
  const q = query(
    collection(db, 'matches'),
    where('playerIds', 'array-contains', playerId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to pending match requests for a club
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback with array of requests
 * @returns {Function} Unsubscribe function
 */
export function subscribeToPendingMatchRequests(db, clubId, callback) {
  const q = query(
    collection(db, 'matchRequests'),
    where('clubId', '==', clubId),
    where('status', '==', 'pending_coach'),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(requests);
  });
}

// ========================================================================
// ===== CHALLENGE QUERIES =====
// ========================================================================

/**
 * Get active challenges for a club
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @returns {Promise<Array>} Array of challenge objects
 */
export async function getActiveChallenges(db, clubId) {
  const q = query(
    collection(db, 'challenges'),
    where('clubId', '==', clubId),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get all challenges for a club
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @returns {Promise<Array>} Array of challenge objects
 */
export async function getAllChallenges(db, clubId) {
  const q = query(
    collection(db, 'challenges'),
    where('clubId', '==', clubId),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to active challenges
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback with array of challenges
 * @returns {Function} Unsubscribe function
 */
export function subscribeToActiveChallenges(db, clubId, callback) {
  const q = query(
    collection(db, 'challenges'),
    where('clubId', '==', clubId),
    where('isActive', '==', true),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const challenges = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(challenges);
  });
}

// ========================================================================
// ===== EXERCISE QUERIES =====
// ========================================================================

/**
 * Get all exercises (global, not club-specific)
 * @param {Firestore} db - Firestore instance
 * @returns {Promise<Array>} Array of exercise objects
 */
export async function getAllExercises(db) {
  const q = query(collection(db, 'exercises'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to exercises
 * @param {Firestore} db - Firestore instance
 * @param {Function} callback - Callback with array of exercises
 * @returns {Function} Unsubscribe function
 */
export function subscribeToExercises(db, callback) {
  const q = query(collection(db, 'exercises'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const exercises = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(exercises);
  });
}

// ========================================================================
// ===== SUBGROUP QUERIES =====
// ========================================================================

/**
 * Get subgroups for a club
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @returns {Promise<Array>} Array of subgroup objects
 */
export async function getClubSubgroups(db, clubId) {
  const q = query(collection(db, 'subgroups'), where('clubId', '==', clubId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to club subgroups
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback with array of subgroups
 * @returns {Function} Unsubscribe function
 */
export function subscribeToClubSubgroups(db, clubId, callback) {
  const q = query(collection(db, 'subgroups'), where('clubId', '==', clubId));
  return onSnapshot(q, (snapshot) => {
    const subgroups = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(subgroups);
  });
}

// ========================================================================
// ===== TRAINING SESSION QUERIES =====
// ========================================================================

/**
 * Get training sessions for a date range
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} Array of session objects
 */
export async function getTrainingSessions(db, clubId, startDate, endDate) {
  const q = query(
    collection(db, 'trainingSessions'),
    where('clubId', '==', clubId),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

// ========================================================================
// ===== POINTS HISTORY QUERIES =====
// ========================================================================

/**
 * Get points history for a user
 * @param {Firestore} db - Firestore instance
 * @param {string} userId - User ID
 * @param {number} [maxResults=50] - Maximum results
 * @returns {Promise<Array>} Array of history entries
 */
export async function getPointsHistory(db, userId, maxResults = 50) {
  const q = query(
    collection(db, `users/${userId}/pointsHistory`),
    orderBy('timestamp', 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/**
 * Subscribe to points history
 * @param {Firestore} db - Firestore instance
 * @param {string} userId - User ID
 * @param {Function} callback - Callback with array of history entries
 * @param {number} [maxResults=50] - Maximum results
 * @returns {Function} Unsubscribe function
 */
export function subscribeToPointsHistory(db, userId, callback, maxResults = 50) {
  const q = query(
    collection(db, `users/${userId}/pointsHistory`),
    orderBy('timestamp', 'desc'),
    limit(maxResults)
  );
  return onSnapshot(q, (snapshot) => {
    const history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    callback(history);
  });
}

// ========================================================================
// ===== LEADERBOARD QUERIES =====
// ========================================================================

/**
 * Get leaderboard (players sorted by points/elo)
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {string} [sortBy='points'] - Sort field ('points', 'eloRating', 'xp')
 * @param {number} [maxResults=50] - Maximum results
 * @returns {Promise<Array>} Array of player objects sorted by rank
 */
export async function getLeaderboard(db, clubId, sortBy = 'points', maxResults = 50) {
  const q = query(
    collection(db, 'users'),
    where('clubId', '==', clubId),
    where('role', '==', 'player'),
    orderBy(sortBy, 'desc'),
    limit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc, index) => ({
    id: doc.id,
    rank: index + 1,
    ...doc.data(),
  }));
}

/**
 * Subscribe to leaderboard updates
 * @param {Firestore} db - Firestore instance
 * @param {string} clubId - Club ID
 * @param {Function} callback - Callback with array of players
 * @param {string} [sortBy='points'] - Sort field
 * @returns {Function} Unsubscribe function
 */
export function subscribeToLeaderboard(db, clubId, callback, sortBy = 'points') {
  const q = query(
    collection(db, 'users'),
    where('clubId', '==', clubId),
    where('role', '==', 'player'),
    orderBy(sortBy, 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const players = snapshot.docs.map((doc, index) => ({
      id: doc.id,
      rank: index + 1,
      ...doc.data(),
    }));
    callback(players);
  });
}
