/**
 * UI Tests für Tournament Bracket Tree
 *
 * Tests für:
 * - transformMatchesToBracketData (Daten-Transformation)
 * - renderTournamentBracket (DOM-Rendering)
 * - renderBracketFromMatches (Convenience)
 * - Rundennamen (Achtelfinale, Viertelfinale, Halbfinale, etc.)
 * - Freilos-Anzeige
 * - Score-Anzeige
 * - Gewinner-Markierung
 * - Trostrunde (Losers Bracket)
 * - Finale / Grand Finals
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
    transformMatchesToBracketData,
    renderTournamentBracket,
    renderBracketFromMatches,
} from '../tournament-bracket-tree.js';

// ============================================================
// HELPERS - Mock Data Factories
// ============================================================

/** Create a mock player profile */
function mockPlayer(id, name, elo = 1200) {
    const parts = name.split(' ');
    return {
        id,
        display_name: name,
        first_name: parts[0] || '',
        last_name: parts[1] || '',
        elo_rating: elo,
        avatar_url: null
    };
}

/** Create a mock WB match */
function mockWbMatch(opts) {
    const {
        id = `match-${Math.random().toString(36).slice(2, 8)}`,
        round = 1, position = 1,
        playerA = null, playerB = null,
        playerAId = playerA?.id || null,
        playerBId = playerB?.id || null,
        status = 'pending', winnerId = null,
        setsA = null, setsB = null
    } = opts;

    return {
        id,
        round_number: round,
        bracket_position: position,
        bracket_type: 'winners',
        player_a_id: playerAId,
        player_b_id: playerBId,
        player_a: playerA,
        player_b: playerB,
        status,
        winner_id: winnerId,
        player_a_sets_won: setsA,
        player_b_sets_won: setsB
    };
}

/** Create a mock LB match */
function mockLbMatch(opts) {
    return { ...mockWbMatch(opts), bracket_type: 'losers' };
}

/** Create a mock Finals match */
function mockFinalsMatch(opts) {
    return { ...mockWbMatch(opts), bracket_type: 'finals', round_number: 1 };
}

/** Create a mock Grand Finals match */
function mockGrandFinalsMatch(opts) {
    return { ...mockWbMatch(opts), bracket_type: 'grand_finals', round_number: 2 };
}

/**
 * Create a full 8-player bracket (in a 16-bracket = Achtelfinale start)
 * All WB R1 matches are byes (8 players in 16-bracket)
 */
function create8PlayerBracket() {
    const players = [];
    for (let i = 0; i < 8; i++) {
        players.push(mockPlayer(`p${i + 1}`, `Spieler ${i + 1}`, 1600 - i * 50));
    }

    // Seed order for 16: [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
    // With 8 players (seeds 1-8), seeds 9-16 are absent
    // WB R1 (8 matches, all byes):
    const wbR1 = [
        mockWbMatch({ id: 'wb1-1', round: 1, position: 1, playerA: players[0], playerAId: 'p1', status: 'completed', winnerId: 'p1' }), // Seed 1 vs 16 (absent)
        mockWbMatch({ id: 'wb1-2', round: 1, position: 2, playerB: players[7], playerBId: 'p8', status: 'completed', winnerId: 'p8' }), // Seed 16 absent, vs Seed 8... wait
    ];

    // Simplified: just create typical matches for testing
    // All WB R1 are byes
    const matches = [];

    // WB R1 - 8 bye matches (each has one player)
    for (let i = 0; i < 8; i++) {
        matches.push(mockWbMatch({
            id: `wb1-${i + 1}`, round: 1, position: i + 1,
            playerA: players[i], playerAId: players[i].id,
            status: 'completed', winnerId: players[i].id
        }));
    }

    // WB R2 - 4 real matches (Viertelfinale)
    matches.push(mockWbMatch({ id: 'wb2-1', round: 2, position: 1, playerA: players[0], playerAId: 'p1', playerB: players[7], playerBId: 'p8', status: 'completed', winnerId: 'p1', setsA: 3, setsB: 1 }));
    matches.push(mockWbMatch({ id: 'wb2-2', round: 2, position: 2, playerA: players[3], playerAId: 'p4', playerB: players[4], playerBId: 'p5', status: 'completed', winnerId: 'p4', setsA: 3, setsB: 2 }));
    matches.push(mockWbMatch({ id: 'wb2-3', round: 2, position: 3, playerA: players[1], playerAId: 'p2', playerB: players[6], playerBId: 'p7', status: 'completed', winnerId: 'p2', setsA: 3, setsB: 0 }));
    matches.push(mockWbMatch({ id: 'wb2-4', round: 2, position: 4, playerA: players[2], playerAId: 'p3', playerB: players[5], playerBId: 'p6', status: 'pending' }));

    // WB R3 - 2 matches (Halbfinale)
    matches.push(mockWbMatch({ id: 'wb3-1', round: 3, position: 1, playerA: players[0], playerAId: 'p1', playerB: players[3], playerBId: 'p4', status: 'pending' }));
    matches.push(mockWbMatch({ id: 'wb3-2', round: 3, position: 2, status: 'pending' }));

    // WB R4 - 1 match (WB Finale)
    matches.push(mockWbMatch({ id: 'wb4-1', round: 4, position: 1, status: 'pending' }));

    // LB R1 - 4 matches
    for (let i = 0; i < 4; i++) {
        matches.push(mockLbMatch({ id: `lb1-${i + 1}`, round: 1, position: i + 1, status: 'pending' }));
    }
    // LB R2 - 4 matches
    for (let i = 0; i < 4; i++) {
        matches.push(mockLbMatch({ id: `lb2-${i + 1}`, round: 2, position: i + 1, status: 'pending' }));
    }
    // LB R3-R6
    for (let r = 3; r <= 6; r++) {
        const count = r <= 4 ? 2 : 1;
        for (let i = 0; i < count; i++) {
            matches.push(mockLbMatch({ id: `lb${r}-${i + 1}`, round: r, position: i + 1, status: 'pending' }));
        }
    }

    // Finals
    matches.push(mockFinalsMatch({ id: 'finals-1', status: 'pending' }));
    matches.push(mockGrandFinalsMatch({ id: 'gf-1', status: 'pending' }));

    return { matches, players };
}

/** Create a simple completed 4-match bracket for rendering tests */
function createSimple4MatchBracket() {
    const p1 = mockPlayer('p1', 'Max Mustermann', 1500);
    const p2 = mockPlayer('p2', 'Anna Schmidt', 1400);
    const p3 = mockPlayer('p3', 'Tom Weber', 1300);
    const p4 = mockPlayer('p4', 'Lisa Meier', 1200);

    return [
        // WB R1 - 2 real matches
        mockWbMatch({ id: 'wb1-1', round: 1, position: 1, playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2', status: 'completed', winnerId: 'p1', setsA: 3, setsB: 1 }),
        mockWbMatch({ id: 'wb1-2', round: 1, position: 2, playerA: p3, playerAId: 'p3', playerB: p4, playerBId: 'p4', status: 'completed', winnerId: 'p3', setsA: 3, setsB: 2 }),
        // WB R2 - Finals
        mockWbMatch({ id: 'wb2-1', round: 2, position: 1, playerA: p1, playerAId: 'p1', playerB: p3, playerBId: 'p3', status: 'completed', winnerId: 'p1', setsA: 3, setsB: 0 }),
    ];
}

// ============================================================
// transformMatchesToBracketData
// ============================================================
describe('transformMatchesToBracketData()', () => {
    test('leere Eingabe gibt leeres Bracket zurück', () => {
        expect(transformMatchesToBracketData(null)).toEqual({ winners: [], losers: [] });
        expect(transformMatchesToBracketData([])).toEqual({ winners: [], losers: [] });
        expect(transformMatchesToBracketData(undefined)).toEqual({ winners: [], losers: [] });
    });

    test('trennt Winners und Losers Bracket korrekt', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.winners.length).toBeGreaterThan(0);
        expect(result.losers.length).toBeGreaterThan(0);
    });

    test('Winners Bracket hat korrekte Rundenanzahl (WB + Finals + Grand Finals)', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        // WB has 4 rounds + Finals + Grand Finals = 6
        expect(result.winners).toHaveLength(6);
    });

    test('Losers Bracket hat 6 Runden', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.losers).toHaveLength(6);
    });

    test('WB R1 hat 8 Matches', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.winners[0]).toHaveLength(8);
    });

    test('WB R2 hat 4 Matches', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.winners[1]).toHaveLength(4);
    });

    test('WB R3 hat 2 Matches', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.winners[2]).toHaveLength(2);
    });

    test('WB R4 hat 1 Match', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.winners[3]).toHaveLength(1);
    });

    test('Finals hat 1 Match', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        // Finals is at index 4 (after WB R1-R4)
        expect(result.winners[4]).toHaveLength(1);
        expect(result.winners[4][0].bracketType).toBe('finals');
    });

    test('Grand Finals hat 1 Match', () => {
        const { matches } = create8PlayerBracket();
        const result = transformMatchesToBracketData(matches);

        expect(result.winners[5]).toHaveLength(1);
        expect(result.winners[5][0].bracketType).toBe('grand_finals');
    });

    describe('Match-Transformation', () => {
        test('abgeschlossenes Match hat Spielerdaten', () => {
            const p1 = mockPlayer('p1', 'Max Mustermann', 1500);
            const p2 = mockPlayer('p2', 'Anna Schmidt', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p1', setsA: 3, setsB: 1
                })
            ];

            const result = transformMatchesToBracketData(matches);
            const match = result.winners[0][0];

            expect(match.player1.name).toBe('Max Mustermann');
            expect(match.player2.name).toBe('Anna Schmidt');
            expect(match.winner).toBe(1); // player_a won
            expect(match.score).toBe('3:1');
            expect(match.status).toBe('completed');
        });

        test('Spieler B als Gewinner wird korrekt markiert', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p2', setsA: 1, setsB: 3
                })
            ];

            const result = transformMatchesToBracketData(matches);
            expect(result.winners[0][0].winner).toBe(2); // player_b won
        });

        test('ausstehendes Match hat keinen Gewinner', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'pending'
                })
            ];

            const result = transformMatchesToBracketData(matches);
            expect(result.winners[0][0].winner).toBeNull();
            expect(result.winners[0][0].status).toBe('upcoming');
        });

        test('Bye-Match zeigt "Freilos" für fehlenden Spieler', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1',
                    status: 'completed', winnerId: 'p1'
                })
            ];

            const result = transformMatchesToBracketData(matches);
            const match = result.winners[0][0];

            expect(match.player1.name).toBe('Max');
            expect(match.player2.name).toBe('Freilos');
            expect(match.player2.isBye).toBe(true);
        });

        test('Skipped Match zeigt "Freilos" Score', () => {
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    status: 'skipped'
                })
            ];

            const result = transformMatchesToBracketData(matches);
            expect(result.winners[0][0].score).toBe('Freilos');
        });

        test('Double-Bye zeigt "Freilos" für beide Spieler', () => {
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    status: 'skipped'
                })
            ];

            const result = transformMatchesToBracketData(matches);
            const match = result.winners[0][0];

            expect(match.player1.name).toBe('Freilos');
            expect(match.player2.name).toBe('Freilos');
            expect(match.player1.isBye).toBe(true);
            expect(match.player2.isBye).toBe(true);
        });

        test('Spieler ohne display_name nutzt first/last name', () => {
            const player = {
                id: 'p1',
                display_name: null,
                first_name: 'Max',
                last_name: 'Mustermann',
                elo_rating: 1500,
                avatar_url: null
            };
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: player, playerAId: 'p1', playerB: player, playerBId: 'p1',
                    status: 'pending'
                })
            ];

            const result = transformMatchesToBracketData(matches);
            expect(result.winners[0][0].player1.name).toBe('Max Mustermann');
        });

        test('Match-Sortierung nach bracket_position', () => {
            const p1 = mockPlayer('p1', 'Spieler 1');
            const p2 = mockPlayer('p2', 'Spieler 2');
            const p3 = mockPlayer('p3', 'Spieler 3');
            const p4 = mockPlayer('p4', 'Spieler 4');

            // Insert in reverse order to test sorting
            const matches = [
                mockWbMatch({ id: 'wb1-2', round: 1, position: 2, playerA: p3, playerAId: 'p3', playerB: p4, playerBId: 'p4', status: 'pending' }),
                mockWbMatch({ id: 'wb1-1', round: 1, position: 1, playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2', status: 'pending' }),
            ];

            const result = transformMatchesToBracketData(matches);
            expect(result.winners[0][0].player1.name).toBe('Spieler 1');
            expect(result.winners[0][1].player1.name).toBe('Spieler 3');
        });
    });

    describe('Bracket-Typen', () => {
        test('nur Winners-Matches ergibt leeres Losers', () => {
            const matches = createSimple4MatchBracket();
            const result = transformMatchesToBracketData(matches);

            expect(result.winners.length).toBeGreaterThan(0);
            expect(result.losers).toHaveLength(0);
        });

        test('LB-Matches werden korrekt gruppiert', () => {
            const matches = [
                mockLbMatch({ id: 'lb1-1', round: 1, position: 1, status: 'pending' }),
                mockLbMatch({ id: 'lb1-2', round: 1, position: 2, status: 'pending' }),
                mockLbMatch({ id: 'lb2-1', round: 2, position: 1, status: 'pending' }),
            ];

            const result = transformMatchesToBracketData(matches);
            expect(result.losers).toHaveLength(2); // 2 rounds
            expect(result.losers[0]).toHaveLength(2); // R1: 2 matches
            expect(result.losers[1]).toHaveLength(1); // R2: 1 match
        });
    });
});

// ============================================================
// DOM RENDERING - renderTournamentBracket
// ============================================================
describe('renderTournamentBracket()', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('rendert in Container-Element', () => {
        const bracketData = { winners: [[]], losers: [] };
        renderTournamentBracket(container, bracketData);

        expect(container.innerHTML).not.toBe('');
        expect(container.querySelector('.tournament-bracket-container')).not.toBeNull();
    });

    test('null Container macht nichts', () => {
        renderTournamentBracket(null, { winners: [], losers: [] });
        // Should not throw
    });

    test('zeigt Scroll-Hinweis', () => {
        const { matches } = create8PlayerBracket();
        const bracketData = transformMatchesToBracketData(matches);
        renderTournamentBracket(container, bracketData);

        const scrollInfo = container.querySelector('.bracket-scroll-info');
        expect(scrollInfo).not.toBeNull();
        expect(scrollInfo.textContent).toContain('scrollen');
    });

    test('leeres Bracket zeigt Fallback-Nachricht', () => {
        renderTournamentBracket(container, { winners: [], losers: [] });

        expect(container.textContent).toContain('Keine Bracket-Daten');
    });

    describe('Hauptrunde (Winners Bracket)', () => {
        test('zeigt "Hauptrunde" Überschrift', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Hauptrunde');
        });

        test('rendert Match-Karten', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const matchCards = container.querySelectorAll('.bracket-match-card');
            expect(matchCards.length).toBeGreaterThan(0);
        });
    });

    describe('Trostrunde (Losers Bracket)', () => {
        test('zeigt "Trostrunde" Überschrift', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Trostrunde');
        });

        test('wird nur gezeigt wenn LB-Matches existieren', () => {
            const matches = createSimple4MatchBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).not.toContain('Trostrunde');
        });
    });

    describe('Rundennamen', () => {
        test('zeigt "Achtelfinale" für 8 Matches in einer Runde', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Achtelfinale');
        });

        test('zeigt "Viertelfinale" für 4 Matches in einer Runde', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Viertelfinale');
        });

        test('zeigt "Halbfinale" für 2 Matches in einer Runde', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Halbfinale');
        });

        test('zeigt "WB Finale" für 1 Match in der letzten WB-Runde', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('WB Finale');
        });

        test('zeigt "Finale" für Finals-Match', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Finale');
        });

        test('zeigt "Grand Finals" für Grand-Finals-Match', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Grand Finals');
        });

        test('zeigt "TR 1", "TR 2" etc. für Trostrunde', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('TR 1');
            expect(container.textContent).toContain('TR 2');
        });
    });

    describe('Spieler-Anzeige', () => {
        test('zeigt Spielernamen', () => {
            const { matches } = create8PlayerBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Spieler 1');
            expect(container.textContent).toContain('Spieler 2');
        });

        test('zeigt "Freilos" für Bye-Matches', () => {
            const p1 = mockPlayer('p1', 'Max Mustermann', 1500);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1',
                    status: 'completed', winnerId: 'p1'
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Freilos');
            expect(container.textContent).toContain('Max Mustermann');
        });

        test('zeigt "TBD" für ausstehende Matches ohne Spieler', () => {
            const matches = [
                mockWbMatch({ id: 'test1', round: 2, position: 1, status: 'pending' }),
            ];
            // Add a dummy R1 match so R2 isn't the first round
            matches.push(mockWbMatch({
                id: 'dummy1', round: 1, position: 1,
                playerA: mockPlayer('p1', 'Test'), playerAId: 'p1',
                status: 'completed', winnerId: 'p1'
            }));
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('TBD');
        });

        test('zeigt Elo-Rating', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'pending'
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Elo 1500');
            expect(container.textContent).toContain('Elo 1400');
        });
    });

    describe('Score-Anzeige', () => {
        test('zeigt Score für abgeschlossenes Match', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p1', setsA: 3, setsB: 1
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('3:1');
        });

        test('zeigt "Ausstehend" für Pending-Match', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'pending'
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            expect(container.textContent).toContain('Ausstehend');
        });

        test('zeigt "Freilos" Score für Bye-Matches', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1',
                    status: 'completed', winnerId: 'p1'
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            // Should show "Freilos" as score (not a set result)
            const matchCards = container.querySelectorAll('.bracket-match-card');
            expect(matchCards.length).toBe(1);
            // The footer should say "Freilos"
            const footerText = matchCards[0].querySelector('.bg-green-100, .bg-orange-100, .bg-gray-100');
            expect(footerText.textContent.trim()).toBe('Freilos');
        });
    });

    describe('Gewinner-Markierung', () => {
        test('Gewinner hat Krone-Icon', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p1', setsA: 3, setsB: 1
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const crownIcons = container.querySelectorAll('.fa-crown');
            expect(crownIcons.length).toBe(1);
        });

        test('Gewinner hat Check-Icon', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p1', setsA: 3, setsB: 1
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const checkIcons = container.querySelectorAll('.fa-check');
            expect(checkIcons.length).toBe(1);
        });
    });

    describe('Styling', () => {
        test('WB abgeschlossene Matches haben grünen Border', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p1', setsA: 3, setsB: 0
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const card = container.querySelector('.bracket-match-card');
            expect(card.classList.contains('border-green-400')).toBe(true);
        });

        test('WB ausstehende Matches haben grauen Border', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockWbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'pending'
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const card = container.querySelector('.bracket-match-card');
            expect(card.classList.contains('border-gray-200')).toBe(true);
        });

        test('LB Matches haben orange Styling', () => {
            const p1 = mockPlayer('p1', 'Max', 1500);
            const p2 = mockPlayer('p2', 'Anna', 1400);
            const matches = [
                mockLbMatch({
                    id: 'test1', round: 1, position: 1,
                    playerA: p1, playerAId: 'p1', playerB: p2, playerBId: 'p2',
                    status: 'completed', winnerId: 'p1', setsA: 3, setsB: 0
                })
            ];
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const card = container.querySelector('.bracket-match-card');
            expect(card.classList.contains('border-orange-400')).toBe(true);
        });
    });

    describe('SVG Connectors', () => {
        test('erzeugt SVG Connector-Lines zwischen Runden', () => {
            const matches = createSimple4MatchBracket();
            const bracketData = transformMatchesToBracketData(matches);
            renderTournamentBracket(container, bracketData);

            const svgConnectors = container.querySelectorAll('.bracket-connector-svg');
            expect(svgConnectors.length).toBeGreaterThan(0);
        });
    });
});

// ============================================================
// renderBracketFromMatches (Convenience)
// ============================================================
describe('renderBracketFromMatches()', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('rendert direkt aus Match-Daten', () => {
        const { matches } = create8PlayerBracket();
        renderBracketFromMatches(container, matches);

        expect(container.querySelector('.tournament-bracket-container')).not.toBeNull();
        expect(container.textContent).toContain('Hauptrunde');
        expect(container.textContent).toContain('Trostrunde');
    });

    test('handhabt leere Match-Liste', () => {
        renderBracketFromMatches(container, []);

        expect(container.textContent).toContain('Keine Bracket-Daten');
    });

    test('handhabt null', () => {
        renderBracketFromMatches(container, null);

        expect(container.textContent).toContain('Keine Bracket-Daten');
    });
});

// ============================================================
// XSS-Schutz
// ============================================================
describe('XSS-Schutz', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('HTML in Spielernamen wird escaped', () => {
        const maliciousPlayer = {
            id: 'evil',
            display_name: '<script>alert("xss")</script>',
            first_name: '<img src=x onerror=alert(1)>',
            last_name: 'Test',
            elo_rating: 1500,
            avatar_url: null
        };
        const normalPlayer = mockPlayer('p2', 'Normal', 1400);

        const matches = [
            mockWbMatch({
                id: 'test1', round: 1, position: 1,
                playerA: maliciousPlayer, playerAId: 'evil',
                playerB: normalPlayer, playerBId: 'p2',
                status: 'pending'
            })
        ];

        const bracketData = transformMatchesToBracketData(matches);
        renderTournamentBracket(container, bracketData);

        // Script tags should be escaped, not executed
        expect(container.innerHTML).not.toContain('<script>');
        expect(container.innerHTML).toContain('&lt;script&gt;');
    });
});

// ============================================================
// Integration: Vollständiges Bracket-Rendering
// ============================================================
describe('Integration: Vollständiges Bracket', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    test('8-Spieler-Bracket rendert alle Elemente korrekt', () => {
        const { matches } = create8PlayerBracket();
        renderBracketFromMatches(container, matches);

        // Strukturelle Elemente
        expect(container.querySelector('.tournament-bracket-container')).not.toBeNull();
        expect(container.textContent).toContain('Hauptrunde');
        expect(container.textContent).toContain('Trostrunde');

        // Rundennamen
        expect(container.textContent).toContain('Achtelfinale');
        expect(container.textContent).toContain('Viertelfinale');
        expect(container.textContent).toContain('Halbfinale');
        expect(container.textContent).toContain('WB Finale');
        expect(container.textContent).toContain('Finale');
        expect(container.textContent).toContain('Grand Finals');

        // Spielerdaten
        expect(container.textContent).toContain('Spieler 1');
        expect(container.textContent).toContain('Spieler 8');

        // Scores
        expect(container.textContent).toContain('3:1');
        expect(container.textContent).toContain('3:2');
        expect(container.textContent).toContain('3:0');
    });

    test('Match-Karten haben data-match-id Attribut', () => {
        const { matches } = create8PlayerBracket();
        renderBracketFromMatches(container, matches);

        const cards = container.querySelectorAll('[data-match-id]');
        expect(cards.length).toBeGreaterThan(0);

        // Check specific match IDs exist
        expect(container.querySelector('[data-match-id="wb1-1"]')).not.toBeNull();
        expect(container.querySelector('[data-match-id="wb2-1"]')).not.toBeNull();
        expect(container.querySelector('[data-match-id="finals-1"]')).not.toBeNull();
    });

    test('Bracket-Sections haben korrekte Hintergrundfarben', () => {
        const { matches } = create8PlayerBracket();
        renderBracketFromMatches(container, matches);

        const sections = container.querySelectorAll('.bracket-section');
        expect(sections.length).toBe(2); // Hauptrunde + Trostrunde

        // First section (WB) has green background
        const wbBg = sections[0].querySelector('.bg-gradient-to-br');
        expect(wbBg.classList.contains('from-green-50')).toBe(true);

        // Second section (LB) has orange background
        const lbBg = sections[1].querySelector('.bg-gradient-to-br');
        expect(lbBg.classList.contains('from-orange-50')).toBe(true);
    });
});
