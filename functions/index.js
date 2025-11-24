/**
 * TTV Champions - Cloud Functions
 *
 * This file aggregates all Cloud Functions from modular files.
 * Each module handles a specific domain:
 * - config.js: Configuration constants
 * - elo.js: ELO rating calculations
 * - matchProcessor.js: Singles match processing
 * - doublesProcessor.js: Doubles match processing
 * - invitations.js: Invitation codes/tokens handling
 * - scheduled.js: Scheduled/cron tasks
 * - notifications.js: Push & email notifications
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (must be done before importing modules)
admin.initializeApp();

// Import configuration
const { CONFIG } = require('./config');

// Import ELO functions (for testing)
const { calculateElo, getHighestEloGate, applyEloGate } = require('./elo');

// Import match processing functions
const { processMatchResult, processApprovedMatchRequest } = require('./matchProcessor');

// Import doubles processing functions
const {
  processDoublesMatchResult,
  processApprovedDoublesMatchRequest,
} = require('./doublesProcessor');

// Import invitation functions
const { setCustomUserClaims, claimInvitationCode, claimInvitationToken } = require('./invitations');

// Import scheduled tasks
const {
  cleanupInvitationTokens,
  cleanupExpiredInvitationCodes,
  autoGenerateTrainingSessions,
  autoSeasonReset,
  migrateAttendanceToSessions,
  migrateDoublesPairingsNames,
  migrateDoublesMatchesPointsHistory,
} = require('./scheduled');

// Import notification functions
const {
  notifyCoachesDoublesRequest,
  sendMatchApprovedNotification,
  sendMatchRequestNotification,
  sendRankUpNotification,
  sendTrainingReminders,
  sendTestNotification,
} = require('./notifications');

// ========================================================================
// ===== EXPORTS =====
// ========================================================================

// Match Processing
exports.processMatchResult = processMatchResult;
exports.processApprovedMatchRequest = processApprovedMatchRequest;

// Doubles Match Processing
exports.processDoublesMatchResult = processDoublesMatchResult;
exports.processApprovedDoublesMatchRequest = processApprovedDoublesMatchRequest;

// User/Invitation Management
exports.setCustomUserClaims = setCustomUserClaims;
exports.claimInvitationCode = claimInvitationCode;
exports.claimInvitationToken = claimInvitationToken;

// Scheduled Tasks
exports.cleanupInvitationTokens = cleanupInvitationTokens;
exports.cleanupExpiredInvitationCodes = cleanupExpiredInvitationCodes;
exports.autoGenerateTrainingSessions = autoGenerateTrainingSessions;
exports.autoSeasonReset = autoSeasonReset;

// Migration Functions
exports.migrateAttendanceToSessions = migrateAttendanceToSessions;
exports.migrateDoublesPairingsNames = migrateDoublesPairingsNames;
exports.migrateDoublesMatchesPointsHistory = migrateDoublesMatchesPointsHistory;

// Notifications
exports.notifyCoachesDoublesRequest = notifyCoachesDoublesRequest;
exports.sendMatchApprovedNotification = sendMatchApprovedNotification;
exports.sendMatchRequestNotification = sendMatchRequestNotification;
exports.sendRankUpNotification = sendRankUpNotification;
exports.sendTrainingReminders = sendTrainingReminders;
exports.sendTestNotification = sendTestNotification;

// Test exports (for unit testing)
exports._testOnly = {
  calculateElo,
  getHighestEloGate,
  applyEloGate,
  CONFIG,
};
