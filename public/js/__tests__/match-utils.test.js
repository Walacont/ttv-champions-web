/**
 * Unit Tests für Match-Utilities
 *
 * Tests für:
 * - Satz-Formatierung
 * - Sieger-Bestimmung
 * - Doppel-Match-Funktionen
 */

import { describe, test, expect } from 'vitest';
import {
    formatMatchSets,
    formatDoublesSets,
    determineWinner,
    getWinnerDisplay,
    formatSetsSimple,
    getDoublesTeamName,
} from '../match-utils.js';

describe('formatMatchSets()', () => {
    describe('Normale Formatierung', () => {
        test('sollte 3:0 Match korrekt formatieren', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];

            const result = formatMatchSets(sets);

            expect(result).toBe('3:0 (11:9, 11:7, 11:8)');
        });

        test('sollte 3:2 Match korrekt formatieren', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 9, playerB: 11 },
                { playerA: 11, playerB: 7 },
                { playerA: 8, playerB: 11 },
                { playerA: 11, playerB: 9 },
            ];

            const result = formatMatchSets(sets);

            expect(result).toBe('3:2 (11:9, 9:11, 11:7, 8:11, 11:9)');
        });

        test('sollte 0:3 Match korrekt formatieren', () => {
            const sets = [
                { playerA: 9, playerB: 11 },
                { playerA: 7, playerB: 11 },
                { playerA: 8, playerB: 11 },
            ];

            const result = formatMatchSets(sets);

            expect(result).toBe('0:3 (9:11, 7:11, 8:11)');
        });
    });

    describe('Optionen', () => {
        test('sollte ohne Ratio formatieren', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];

            const result = formatMatchSets(sets, { showRatio: false });

            expect(result).toBe('11:9, 11:7, 11:8');
        });

        test('sollte custom Keys verwenden', () => {
            const sets = [
                { scoreA: 11, scoreB: 9 },
                { scoreA: 11, scoreB: 7 },
            ];

            const result = formatMatchSets(sets, {
                playerAKey: 'scoreA',
                playerBKey: 'scoreB',
                showRatio: false,
            });

            expect(result).toBe('11:9, 11:7');
        });

        test('sollte custom noResultText verwenden', () => {
            const result = formatMatchSets([], { noResultText: 'Kein Match' });

            expect(result).toBe('Kein Match');
        });
    });

    describe('Edge Cases', () => {
        test('sollte für leere Sets Standard-Text zurückgeben', () => {
            expect(formatMatchSets([])).toBe('Kein Ergebnis');
            expect(formatMatchSets(null)).toBe('Kein Ergebnis');
            expect(formatMatchSets(undefined)).toBe('Kein Ergebnis');
        });

        test('sollte Deuce-Sätze korrekt zählen', () => {
            const sets = [
                { playerA: 12, playerB: 10 },
                { playerA: 14, playerB: 12 },
                { playerA: 11, playerB: 9 },
            ];

            const result = formatMatchSets(sets);

            expect(result).toBe('3:0 (12:10, 14:12, 11:9)');
        });
    });
});

describe('formatDoublesSets()', () => {
    test('sollte Doppel-Match mit teamA/teamB Keys formatieren', () => {
        const sets = [
            { teamA: 11, teamB: 9 },
            { teamA: 11, teamB: 7 },
            { teamA: 11, teamB: 8 },
        ];

        const result = formatDoublesSets(sets);

        expect(result).toBe('3:0 (11:9, 11:7, 11:8)');
    });

    test('sollte leere Doppel-Sets behandeln', () => {
        expect(formatDoublesSets([])).toBe('Kein Ergebnis');
    });
});

describe('formatSetsSimple()', () => {
    test('sollte nur Sätze ohne Ratio formatieren', () => {
        const sets = [
            { playerA: 11, playerB: 9 },
            { playerA: 11, playerB: 7 },
        ];

        const result = formatSetsSimple(sets);

        expect(result).toBe('11:9, 11:7');
    });
});

describe('determineWinner()', () => {
    describe('Best-of-5 (Standard)', () => {
        test('sollte A bei 3:0 als Sieger erkennen', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];

            expect(determineWinner(sets)).toBe('A');
        });

        test('sollte B bei 0:3 als Sieger erkennen', () => {
            const sets = [
                { playerA: 9, playerB: 11 },
                { playerA: 7, playerB: 11 },
                { playerA: 8, playerB: 11 },
            ];

            expect(determineWinner(sets)).toBe('B');
        });

        test('sollte A bei 3:2 als Sieger erkennen', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 9, playerB: 11 },
                { playerA: 11, playerB: 7 },
                { playerA: 8, playerB: 11 },
                { playerA: 11, playerB: 9 },
            ];

            expect(determineWinner(sets)).toBe('A');
        });

        test('sollte null bei 2:1 (unvollständig) zurückgeben', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 8, playerB: 11 },
            ];

            expect(determineWinner(sets)).toBe(null);
        });
    });

    describe('Andere Match-Modi', () => {
        test('sollte single-set korrekt behandeln', () => {
            const sets = [{ playerA: 11, playerB: 9 }];

            expect(determineWinner(sets, 'single-set')).toBe('A');
        });

        test('sollte best-of-3 korrekt behandeln', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
            ];

            expect(determineWinner(sets, 'best-of-3')).toBe('A');
        });

        test('sollte best-of-7 korrekt behandeln', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
                { playerA: 11, playerB: 6 },
            ];

            expect(determineWinner(sets, 'best-of-7')).toBe('A');
        });

        test('sollte null bei 3:3 in best-of-7 zurückgeben', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 9, playerB: 11 },
                { playerA: 11, playerB: 8 },
                { playerA: 8, playerB: 11 },
                { playerA: 11, playerB: 7 },
                { playerA: 7, playerB: 11 },
            ];

            expect(determineWinner(sets, 'best-of-7')).toBe(null);
        });
    });

    describe('Custom Keys', () => {
        test('sollte custom player keys verwenden', () => {
            const sets = [
                { home: 11, away: 9 },
                { home: 11, away: 7 },
                { home: 11, away: 8 },
            ];

            expect(determineWinner(sets, 'best-of-5', 'home', 'away')).toBe('A');
        });
    });

    describe('Edge Cases', () => {
        test('sollte null für leere Sets zurückgeben', () => {
            expect(determineWinner([])).toBe(null);
            expect(determineWinner(null)).toBe(null);
            expect(determineWinner(undefined)).toBe(null);
        });

        test('sollte Sätze unter 11 Punkten ignorieren', () => {
            const sets = [
                { playerA: 10, playerB: 8 }, // Ungültiger Satz
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];

            // Der erste Satz zählt nicht, also 3:0
            expect(determineWinner(sets)).toBe('A');
        });

        test('sollte unbekannten Match-Modus als best-of-5 behandeln', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];

            expect(determineWinner(sets, 'unknown-mode')).toBe('A');
        });
    });
});

describe('getWinnerDisplay()', () => {
    describe('Mit Spieler-Objekten', () => {
        test('sollte Spieler A Namen bei Sieg anzeigen', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];
            const playerA = { firstName: 'Max' };
            const playerB = { firstName: 'Anna' };

            expect(getWinnerDisplay(sets, playerA, playerB)).toBe('Max');
        });

        test('sollte Spieler B Namen bei Sieg anzeigen', () => {
            const sets = [
                { playerA: 9, playerB: 11 },
                { playerA: 7, playerB: 11 },
                { playerA: 8, playerB: 11 },
            ];
            const playerA = { firstName: 'Max' };
            const playerB = { firstName: 'Anna' };

            expect(getWinnerDisplay(sets, playerA, playerB)).toBe('Anna');
        });
    });

    describe('Fallbacks', () => {
        test('sollte "Spieler A" ohne Namen anzeigen', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
                { playerA: 11, playerB: 8 },
            ];

            expect(getWinnerDisplay(sets, {}, {})).toBe('Spieler A');
        });

        test('sollte "Spieler B" ohne Namen anzeigen', () => {
            const sets = [
                { playerA: 9, playerB: 11 },
                { playerA: 7, playerB: 11 },
                { playerA: 8, playerB: 11 },
            ];

            expect(getWinnerDisplay(sets, null, null)).toBe('Spieler B');
        });

        test('sollte "Unentschieden" für unvollständiges Match anzeigen', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 9, playerB: 11 },
            ];

            expect(getWinnerDisplay(sets, {}, {})).toBe('Unentschieden');
        });
    });

    describe('Verschiedene Match-Modi', () => {
        test('sollte best-of-3 korrekt behandeln', () => {
            const sets = [
                { playerA: 11, playerB: 9 },
                { playerA: 11, playerB: 7 },
            ];
            const playerA = { firstName: 'Max' };
            const playerB = { firstName: 'Anna' };

            expect(getWinnerDisplay(sets, playerA, playerB, 'best-of-3')).toBe('Max');
        });
    });
});

describe('getDoublesTeamName()', () => {
    describe('Team A Sieg', () => {
        test('sollte Team A Namen korrekt formatieren', () => {
            const match = {
                teamAPlayer1: { firstName: 'Max' },
                teamAPlayer2: { firstName: 'Anna' },
                teamBPlayer1: { firstName: 'Tom' },
                teamBPlayer2: { firstName: 'Lisa' },
            };

            expect(getDoublesTeamName(match, 'A')).toBe('Max & Anna');
        });

        test('sollte Fallback für fehlende Team A Namen verwenden', () => {
            const match = {
                teamAPlayer1: {},
                teamAPlayer2: null,
            };

            expect(getDoublesTeamName(match, 'A')).toBe('Spieler 1 & Spieler 2');
        });
    });

    describe('Team B Sieg', () => {
        test('sollte Team B Namen korrekt formatieren', () => {
            const match = {
                teamAPlayer1: { firstName: 'Max' },
                teamAPlayer2: { firstName: 'Anna' },
                teamBPlayer1: { firstName: 'Tom' },
                teamBPlayer2: { firstName: 'Lisa' },
            };

            expect(getDoublesTeamName(match, 'B')).toBe('Tom & Lisa');
        });

        test('sollte Fallback für fehlende Team B Namen verwenden', () => {
            const match = {
                teamBPlayer1: {},
                teamBPlayer2: undefined,
            };

            expect(getDoublesTeamName(match, 'B')).toBe('Spieler 3 & Spieler 4');
        });
    });

    describe('Teilweise fehlende Namen', () => {
        test('sollte teilweise Fallbacks verwenden', () => {
            const match = {
                teamAPlayer1: { firstName: 'Max' },
                teamAPlayer2: {},
            };

            expect(getDoublesTeamName(match, 'A')).toBe('Max & Spieler 2');
        });
    });
});

describe('Integration Tests', () => {
    test('sollte komplettes Match korrekt verarbeiten', () => {
        const sets = [
            { playerA: 11, playerB: 9 },
            { playerA: 9, playerB: 11 },
            { playerA: 12, playerB: 10 }, // Deuce
            { playerA: 11, playerB: 8 },
        ];
        const playerA = { firstName: 'Max' };
        const playerB = { firstName: 'Anna' };

        // Formatierung
        expect(formatMatchSets(sets)).toBe('3:1 (11:9, 9:11, 12:10, 11:8)');

        // Sieger
        expect(determineWinner(sets)).toBe('A');
        expect(getWinnerDisplay(sets, playerA, playerB)).toBe('Max');
    });

    test('sollte Doppel-Match korrekt verarbeiten', () => {
        const sets = [
            { teamA: 11, teamB: 9 },
            { teamA: 11, teamB: 7 },
            { teamA: 11, teamB: 8 },
        ];
        const match = {
            teamAPlayer1: { firstName: 'Max' },
            teamAPlayer2: { firstName: 'Anna' },
            teamBPlayer1: { firstName: 'Tom' },
            teamBPlayer2: { firstName: 'Lisa' },
        };

        expect(formatDoublesSets(sets)).toBe('3:0 (11:9, 11:7, 11:8)');
        expect(getDoublesTeamName(match, 'A')).toBe('Max & Anna');
    });
});
