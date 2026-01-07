/**
 * Unit Tests for Match Approval Logic
 *
 * Tests the approval workflow for different club scenarios:
 * - Singles: Both without club, same club, one with club, different clubs
 * - Doubles: All in same club, mixed clubs, all without club
 * - Auto-approval logic for players without club
 * - Cross-club approval logic
 */

import { describe, test, expect } from 'vitest';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if a player has no club
 * @param {string|null|undefined} clubId - The club ID to check
 * @returns {boolean} True if player has no club (null, undefined, or empty string)
 */
function hasNoClub(clubId) {
    return !clubId || clubId === '';
}

// ============================================================================
// Singles Match clubId Logic (Extracted from player-matches.js)
// ============================================================================

/**
 * Determines the clubId for a singles match based on both players' clubs
 * @param {Object} playerA - Player A data with clubId
 * @param {Object} playerB - Player B data with clubId
 * @returns {string|null} - Club ID or null for auto-approve/cross-club
 */
function determineSinglesMatchClubId(playerA, playerB) {
    const playerAClubId = playerA?.clubId;
    const playerBClubId = playerB?.clubId;

    if (hasNoClub(playerAClubId) && hasNoClub(playerBClubId)) {
        // Beide ohne Verein → null (automatisch genehmigen)
        return null;
    } else if (!hasNoClub(playerAClubId) && !hasNoClub(playerBClubId) && playerAClubId === playerBClubId) {
        // Gleicher Verein → diesen Verein verwenden
        return playerAClubId;
    } else if (!hasNoClub(playerAClubId) && hasNoClub(playerBClubId)) {
        // Nur PlayerA hat Verein → PlayerA's Verein verwenden
        return playerAClubId;
    } else if (hasNoClub(playerAClubId) && !hasNoClub(playerBClubId)) {
        // Nur PlayerB hat Verein → PlayerB's Verein verwenden
        return playerBClubId;
    } else {
        // Verschiedene Vereine → null (vereinsübergreifend, jeder Coach kann genehmigen)
        return null;
    }
}

/**
 * Simulates the approval logic when PlayerB confirms
 * @param {Object} playerA - Player A data
 * @param {Object} playerB - Player B data
 * @returns {Object} - { status, isAutoApproved, clubId }
 */
function simulatePlayerBApproval(playerA, playerB) {
    const clubId = determineSinglesMatchClubId(playerA, playerB);

    // Auto-approve if both players have no club
    const isAutoApproved = hasNoClub(playerA.clubId) && hasNoClub(playerB.clubId);
    const status = isAutoApproved ? 'approved' : 'pending_coach';

    return { status, isAutoApproved, clubId };
}

// ============================================================================
// Doubles Match clubId Logic (Extracted from doubles-matches.js)
// ============================================================================

/**
 * Determines the clubId for a doubles match
 * Only set if all 4 players are from the same club
 * @param {Object} player1 - Player 1 data
 * @param {Object} player2 - Player 2 data
 * @param {Object} player3 - Player 3 data
 * @param {Object} player4 - Player 4 data
 * @returns {string|null} - Club ID or null
 */
function determineDoublesMatchClubId(player1, player2, player3, player4) {
    const club1 = player1?.clubId || null;
    const club2 = player2?.clubId || null;
    const club3 = player3?.clubId || null;
    const club4 = player4?.clubId || null;

    // clubId nur setzen wenn alle 4 Spieler im selben Verein sind
    if (club1 && club1 === club2 && club1 === club3 && club1 === club4) {
        return club1;
    }
    return null;
}

/**
 * Simulates the doubles opponent approval logic
 * @param {Object} player1 - Team A Player 1
 * @param {Object} player2 - Team A Player 2
 * @param {Object} player3 - Team B Player 1 (opponent confirming)
 * @param {Object} player4 - Team B Player 2
 * @returns {Object} - { status, isAutoApproved, clubId }
 */
function simulateDoublesOpponentApproval(player1, player2, player3, player4) {
    const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);

    // Auto-approve if at least one team has no club
    const teamANoClub = hasNoClub(player1.clubId) && hasNoClub(player2.clubId);
    const teamBNoClub = hasNoClub(player3.clubId) && hasNoClub(player4.clubId);
    const isAutoApproved = teamANoClub || teamBNoClub;
    const status = isAutoApproved ? 'approved' : 'pending_coach';

    return { status, isAutoApproved, clubId };
}

// ============================================================================
// SINGLES MATCH TESTS
// ============================================================================

describe('Singles Match Approval Logic', () => {

    test('Both players without club → Auto-approve', () => {
        const playerA = { id: 'A', clubId: null };
        const playerB = { id: 'B', clubId: null };

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
        expect(result.clubId).toBe(null);
    });

    test('Both players without club (undefined) → Auto-approve', () => {
        const playerA = { id: 'A' }; // clubId undefined
        const playerB = { id: 'B' }; // clubId undefined

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
    });

    test('Both players without club (empty string) → Auto-approve', () => {
        const playerA = { id: 'A', clubId: '' }; // clubId empty string
        const playerB = { id: 'B', clubId: '' }; // clubId empty string

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
    });

    test('Mixed: PlayerA empty string, PlayerB null → Auto-approve', () => {
        const playerA = { id: 'A', clubId: '' }; // clubId empty string
        const playerB = { id: 'B', clubId: null }; // clubId null

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
    });

    test('Both players in same club → Coach approval required', () => {
        const playerA = { id: 'A', clubId: 'TuRa Harksheide' };
        const playerB = { id: 'B', clubId: 'TuRa Harksheide' };

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe('TuRa Harksheide');
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
        expect(result.clubId).toBe('TuRa Harksheide');
    });

    test('PlayerA has club, PlayerB without → Use PlayerA club, Coach approval', () => {
        const playerA = { id: 'A', clubId: 'TuRa Harksheide' };
        const playerB = { id: 'B', clubId: null };

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe('TuRa Harksheide');
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
        expect(result.clubId).toBe('TuRa Harksheide');
    });

    test('PlayerA without club, PlayerB has club → Use PlayerB club, Coach approval', () => {
        const playerA = { id: 'A', clubId: null };
        const playerB = { id: 'B', clubId: 'SC Poppenbüttel' };

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe('SC Poppenbüttel');
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
        expect(result.clubId).toBe('SC Poppenbüttel');
    });

    test('Different clubs → Cross-club (null clubId), Coach approval', () => {
        const playerA = { id: 'A', clubId: 'TuRa Harksheide' };
        const playerB = { id: 'B', clubId: 'SC Poppenbüttel' };

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe(null);
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
        expect(result.clubId).toBe(null);
    });
});

// ============================================================================
// DOUBLES MATCH TESTS
// ============================================================================

describe('Doubles Match Approval Logic', () => {

    test('All 4 players without club → Auto-approve', () => {
        const player1 = { id: '1', clubId: null };
        const player2 = { id: '2', clubId: null };
        const player3 = { id: '3', clubId: null };
        const player4 = { id: '4', clubId: null };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
        expect(result.clubId).toBe(null);
    });

    test('All 4 players without club (empty strings) → Auto-approve', () => {
        const player1 = { id: '1', clubId: '' };
        const player2 = { id: '2', clubId: '' };
        const player3 = { id: '3', clubId: '' };
        const player4 = { id: '4', clubId: '' };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
        expect(result.clubId).toBe(null);
    });

    test('Mixed: All 4 players without club (empty string, null, undefined) → Auto-approve', () => {
        const player1 = { id: '1', clubId: '' };
        const player2 = { id: '2', clubId: null };
        const player3 = { id: '3' }; // undefined
        const player4 = { id: '4', clubId: '' };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
        expect(result.clubId).toBe(null);
    });

    test('All 4 players in same club → Coach approval required', () => {
        const player1 = { id: '1', clubId: 'TuRa Harksheide' };
        const player2 = { id: '2', clubId: 'TuRa Harksheide' };
        const player3 = { id: '3', clubId: 'TuRa Harksheide' };
        const player4 = { id: '4', clubId: 'TuRa Harksheide' };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe('TuRa Harksheide');
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
        expect(result.clubId).toBe('TuRa Harksheide');
    });

    test('3 players in club, 1 without → Cross-club (null), Coach approval', () => {
        const player1 = { id: '1', clubId: 'TuRa Harksheide' };
        const player2 = { id: '2', clubId: 'TuRa Harksheide' };
        const player3 = { id: '3', clubId: 'TuRa Harksheide' };
        const player4 = { id: '4', clubId: null };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
    });

    test('Team A without club vs Team B with club → Auto-approve', () => {
        const player1 = { id: '1', clubId: null };
        const player2 = { id: '2', clubId: null };
        const player3 = { id: '3', clubId: 'TuRa Harksheide' };
        const player4 = { id: '4', clubId: 'TuRa Harksheide' };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
    });

    test('Team A with club vs Team B without club → Auto-approve', () => {
        const player1 = { id: '1', clubId: 'TuRa Harksheide' };
        const player2 = { id: '2', clubId: 'TuRa Harksheide' };
        const player3 = { id: '3', clubId: null };
        const player4 = { id: '4', clubId: null };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
    });

    test('Team A without club vs Team B mixed → Auto-approve', () => {
        const player1 = { id: '1', clubId: null };
        const player2 = { id: '2', clubId: null };
        const player3 = { id: '3', clubId: 'TuRa Harksheide' };
        const player4 = { id: '4', clubId: null };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('approved');
        expect(result.isAutoApproved).toBe(true);
    });

    test('Mixed clubs (2 different clubs) → Cross-club (null), Coach approval', () => {
        const player1 = { id: '1', clubId: 'TuRa Harksheide' };
        const player2 = { id: '2', clubId: 'TuRa Harksheide' };
        const player3 = { id: '3', clubId: 'SC Poppenbüttel' };
        const player4 = { id: '4', clubId: 'SC Poppenbüttel' };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
    });

    test('All different clubs → Cross-club (null), Coach approval', () => {
        const player1 = { id: '1', clubId: 'Club A' };
        const player2 = { id: '2', clubId: 'Club B' };
        const player3 = { id: '3', clubId: 'Club C' };
        const player4 = { id: '4', clubId: 'Club D' };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
    });

    test('Mix of with/without club → Cross-club (null), Coach approval', () => {
        const player1 = { id: '1', clubId: 'TuRa Harksheide' };
        const player2 = { id: '2', clubId: null };
        const player3 = { id: '3', clubId: 'SC Poppenbüttel' };
        const player4 = { id: '4', clubId: null };

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.status).toBe('pending_coach');
        expect(result.isAutoApproved).toBe(false);
    });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge Cases', () => {

    test('Singles: Empty club strings treated as no club', () => {
        const playerA = { id: 'A', clubId: '' };
        const playerB = { id: 'B', clubId: '' };

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        // Leere Strings sind falsy, sollten als kein Verein behandelt werden
        expect(clubId).toBe(null);
        expect(result.isAutoApproved).toBe(true);
    });

    test('Singles: One null, one undefined → Auto-approve', () => {
        const playerA = { id: 'A', clubId: null };
        const playerB = { id: 'B' }; // undefined

        const clubId = determineSinglesMatchClubId(playerA, playerB);
        const result = simulatePlayerBApproval(playerA, playerB);

        expect(clubId).toBe(null);
        expect(result.isAutoApproved).toBe(true);
    });

    test('Doubles: All undefined clubIds → Auto-approve', () => {
        const player1 = { id: '1' }; // undefined
        const player2 = { id: '2' }; // undefined
        const player3 = { id: '3' }; // undefined
        const player4 = { id: '4' }; // undefined

        const clubId = determineDoublesMatchClubId(player1, player2, player3, player4);
        const result = simulateDoublesOpponentApproval(player1, player2, player3, player4);

        expect(clubId).toBe(null);
        expect(result.isAutoApproved).toBe(true);
    });
});

// ============================================================================
// APPROVAL WORKFLOW TESTS
// ============================================================================

describe('Complete Approval Workflow', () => {

    test('Singles: Both without club → Status transitions from pending_player to approved', () => {
        const playerA = { id: 'A', clubId: null };
        const playerB = { id: 'B', clubId: null };

        // Initial status
        let matchRequest = {
            status: 'pending_player',
            playerAId: 'A',
            playerBId: 'B',
            clubId: determineSinglesMatchClubId(playerA, playerB),
        };

        expect(matchRequest.status).toBe('pending_player');

        // PlayerB approves
        const approval = simulatePlayerBApproval(playerA, playerB);
        matchRequest.status = approval.status;

        expect(matchRequest.status).toBe('approved');
        expect(matchRequest.clubId).toBe(null);
    });

    test('Singles: Same club → Status transitions from pending_player to pending_coach', () => {
        const playerA = { id: 'A', clubId: 'TuRa Harksheide' };
        const playerB = { id: 'B', clubId: 'TuRa Harksheide' };

        let matchRequest = {
            status: 'pending_player',
            playerAId: 'A',
            playerBId: 'B',
            clubId: determineSinglesMatchClubId(playerA, playerB),
        };

        // PlayerB approves
        const approval = simulatePlayerBApproval(playerA, playerB);
        matchRequest.status = approval.status;

        expect(matchRequest.status).toBe('pending_coach');
        expect(matchRequest.clubId).toBe('TuRa Harksheide');
    });

    test('Doubles: All without club → Status transitions from pending_opponent to approved', () => {
        const player1 = { id: '1', clubId: null };
        const player2 = { id: '2', clubId: null };
        const player3 = { id: '3', clubId: null };
        const player4 = { id: '4', clubId: null };

        let doublesRequest = {
            status: 'pending_opponent',
            clubId: determineDoublesMatchClubId(player1, player2, player3, player4),
        };

        // Opponent approves
        const approval = simulateDoublesOpponentApproval(player1, player2, player3, player4);
        doublesRequest.status = approval.status;

        expect(doublesRequest.status).toBe('approved');
        expect(doublesRequest.clubId).toBe(null);
    });

    test('Doubles: All in same club → Status transitions from pending_opponent to pending_coach', () => {
        const player1 = { id: '1', clubId: 'TuRa Harksheide' };
        const player2 = { id: '2', clubId: 'TuRa Harksheide' };
        const player3 = { id: '3', clubId: 'TuRa Harksheide' };
        const player4 = { id: '4', clubId: 'TuRa Harksheide' };

        let doublesRequest = {
            status: 'pending_opponent',
            clubId: determineDoublesMatchClubId(player1, player2, player3, player4),
        };

        // Opponent approves
        const approval = simulateDoublesOpponentApproval(player1, player2, player3, player4);
        doublesRequest.status = approval.status;

        expect(doublesRequest.status).toBe('pending_coach');
        expect(doublesRequest.clubId).toBe('TuRa Harksheide');
    });
});
