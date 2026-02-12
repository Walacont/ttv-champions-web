/**
 * Unit Tests für Rang-System
 *
 * Tests für:
 * - Rangberechnung (Elo + XP)
 * - Rang-Progression
 * - Rang-Hilfsfunktionen
 */

import { describe, test, expect } from 'vitest';
import {
    RANKS,
    RANK_ORDER,
    calculateRank,
    getRankProgress,
    getRankById,
    getRankByName,
    formatRank,
    groupPlayersByRank,
} from '../ranks.js';

describe('RANKS Konstanten', () => {
    test('sollte 6 Ränge definiert haben', () => {
        expect(Object.keys(RANKS)).toHaveLength(6);
    });

    test('sollte korrekte Rang-IDs haben (0-5)', () => {
        expect(RANKS.REKRUT.id).toBe(0);
        expect(RANKS.BRONZE.id).toBe(1);
        expect(RANKS.SILBER.id).toBe(2);
        expect(RANKS.GOLD.id).toBe(3);
        expect(RANKS.PLATIN.id).toBe(4);
        expect(RANKS.CHAMPION.id).toBe(5);
    });

    test('sollte aufsteigende Elo-Anforderungen haben', () => {
        expect(RANKS.REKRUT.minElo).toBe(800);
        expect(RANKS.BRONZE.minElo).toBe(850);
        expect(RANKS.SILBER.minElo).toBe(1000);
        expect(RANKS.GOLD.minElo).toBe(1200);
        expect(RANKS.PLATIN.minElo).toBe(1400);
        expect(RANKS.CHAMPION.minElo).toBe(1600);
    });

    test('sollte aufsteigende XP-Anforderungen haben', () => {
        expect(RANKS.REKRUT.minXP).toBe(0);
        expect(RANKS.BRONZE.minXP).toBe(50);
        expect(RANKS.SILBER.minXP).toBe(200);
        expect(RANKS.GOLD.minXP).toBe(500);
        expect(RANKS.PLATIN.minXP).toBe(1000);
        expect(RANKS.CHAMPION.minXP).toBe(1800);
    });

    test('sollte Emojis für alle Ränge haben', () => {
        RANK_ORDER.forEach(rank => {
            expect(rank.emoji).toBeDefined();
            expect(rank.emoji.length).toBeGreaterThan(0);
        });
    });

    test('sollte Farben für alle Ränge haben', () => {
        RANK_ORDER.forEach(rank => {
            expect(rank.color).toBeDefined();
            expect(rank.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        });
    });
});

describe('RANK_ORDER', () => {
    test('sollte Ränge in richtiger Reihenfolge haben', () => {
        expect(RANK_ORDER[0]).toBe(RANKS.REKRUT);
        expect(RANK_ORDER[1]).toBe(RANKS.BRONZE);
        expect(RANK_ORDER[2]).toBe(RANKS.SILBER);
        expect(RANK_ORDER[3]).toBe(RANKS.GOLD);
        expect(RANK_ORDER[4]).toBe(RANKS.PLATIN);
        expect(RANK_ORDER[5]).toBe(RANKS.CHAMPION);
    });

    test('sollte 6 Ränge enthalten', () => {
        expect(RANK_ORDER).toHaveLength(6);
    });
});

describe('calculateRank()', () => {
    describe('Rekrut (Starrang)', () => {
        test('sollte Rekrut für neue Spieler (800 Elo, 0 XP) zurückgeben', () => {
            const rank = calculateRank(800, 0);
            expect(rank.id).toBe(RANKS.REKRUT.id);
            expect(rank.name).toBe('Rekrut');
        });

        test('sollte Rekrut für null/undefined Werte zurückgeben', () => {
            expect(calculateRank(null, null).id).toBe(RANKS.REKRUT.id);
            expect(calculateRank(undefined, undefined).id).toBe(RANKS.REKRUT.id);
        });

        test('sollte Rekrut für niedrige Werte zurückgeben', () => {
            expect(calculateRank(700, 0).id).toBe(RANKS.REKRUT.id);
            expect(calculateRank(800, 10).id).toBe(RANKS.REKRUT.id);
        });
    });

    describe('Bronze', () => {
        test('sollte Bronze geben mit ausreichend Elo und XP', () => {
            const rank = calculateRank(900, 100);
            expect(rank.id).toBe(RANKS.BRONZE.id);
        });

        test('sollte Bronze geben am Minimum (850 Elo, 50 XP)', () => {
            const rank = calculateRank(850, 50);
            expect(rank.id).toBe(RANKS.BRONZE.id);
        });

        test('sollte Rekrut bleiben wenn XP zu niedrig', () => {
            const rank = calculateRank(900, 30);
            expect(rank.id).toBe(RANKS.REKRUT.id);
        });
    });

    describe('Silber', () => {
        test('sollte Silber geben bei 1000 Elo und 200 XP', () => {
            const rank = calculateRank(1000, 200);
            expect(rank.id).toBe(RANKS.SILBER.id);
        });

        test('sollte Bronze bleiben wenn XP zu niedrig', () => {
            const rank = calculateRank(1000, 100); // Nur 100 XP
            expect(rank.id).toBe(RANKS.BRONZE.id);
        });
    });

    describe('Gold', () => {
        test('sollte Gold geben bei 1200 Elo und 500 XP', () => {
            const rank = calculateRank(1200, 500);
            expect(rank.id).toBe(RANKS.GOLD.id);
        });

        test('sollte Silber bleiben wenn Elo zu niedrig', () => {
            const rank = calculateRank(1100, 500);
            expect(rank.id).toBe(RANKS.SILBER.id);
        });
    });

    describe('Platin', () => {
        test('sollte Platin geben bei 1400 Elo und 1000 XP', () => {
            const rank = calculateRank(1400, 1000);
            expect(rank.id).toBe(RANKS.PLATIN.id);
        });

        test('sollte Gold bleiben wenn XP zu niedrig', () => {
            const rank = calculateRank(1400, 800);
            expect(rank.id).toBe(RANKS.GOLD.id);
        });
    });

    describe('Champion (Höchster Rang)', () => {
        test('sollte Champion geben bei 1600 Elo und 1800 XP', () => {
            const rank = calculateRank(1600, 1800);
            expect(rank.id).toBe(RANKS.CHAMPION.id);
        });

        test('sollte Champion geben bei hohen Werten', () => {
            const rank = calculateRank(2000, 5000);
            expect(rank.id).toBe(RANKS.CHAMPION.id);
        });

        test('sollte Platin bleiben wenn XP zu niedrig', () => {
            const rank = calculateRank(1600, 1500);
            expect(rank.id).toBe(RANKS.PLATIN.id);
        });
    });

    describe('Edge Cases', () => {
        test('sollte mit 0 Elo funktionieren', () => {
            const rank = calculateRank(0, 0);
            expect(rank.id).toBe(RANKS.REKRUT.id);
        });

        test('sollte mit negativem Elo funktionieren', () => {
            const rank = calculateRank(-100, 0);
            expect(rank.id).toBe(RANKS.REKRUT.id);
        });

        test('sollte mit sehr hohen Werten funktionieren', () => {
            const rank = calculateRank(10000, 100000);
            expect(rank.id).toBe(RANKS.CHAMPION.id);
        });
    });
});

describe('getRankProgress()', () => {
    describe('Rekrut → Bronze Progress', () => {
        test('sollte korrekten Fortschritt für neuen Spieler zeigen', () => {
            const progress = getRankProgress(800, 0);

            expect(progress.currentRank.id).toBe(RANKS.REKRUT.id);
            expect(progress.nextRank.id).toBe(RANKS.BRONZE.id);
            expect(progress.isMaxRank).toBe(false);
            expect(progress.eloNeeded).toBe(50); // 850 - 800
            expect(progress.xpNeeded).toBe(50); // 50 - 0
        });

        test('sollte teilweisen Fortschritt zeigen', () => {
            const progress = getRankProgress(825, 25);

            expect(progress.currentRank.id).toBe(RANKS.REKRUT.id);
            expect(progress.eloNeeded).toBe(25); // 850 - 825
            expect(progress.xpNeeded).toBe(25); // 50 - 25
        });
    });

    describe('Champion (Max Rang)', () => {
        test('sollte isMaxRank=true für Champion zurückgeben', () => {
            const progress = getRankProgress(1600, 1800);

            expect(progress.currentRank.id).toBe(RANKS.CHAMPION.id);
            expect(progress.nextRank).toBe(null);
            expect(progress.isMaxRank).toBe(true);
            expect(progress.eloProgress).toBe(100);
            expect(progress.xpProgress).toBe(100);
            expect(progress.eloNeeded).toBe(0);
            expect(progress.xpNeeded).toBe(0);
        });
    });

    describe('Fortschrittsberechnung', () => {
        test('sollte korrekten prozentualen Fortschritt berechnen', () => {
            const progress = getRankProgress(1000, 100);

            // Aktueller Rang: Bronze (da Elo >= 850, XP >= 50)
            expect(progress.currentRank.id).toBe(RANKS.BRONZE.id);
            expect(progress.nextRank.id).toBe(RANKS.SILBER.id);

            // Progress zum nächsten Rang (Silber: 1000 Elo, 200 XP)
            expect(progress.eloProgress).toBe(100); // 1000/1000 = 100%
            expect(progress.xpProgress).toBe(50); // 100/200 = 50%
        });

        test('sollte gerundeten Fortschritt zurückgeben', () => {
            const progress = getRankProgress(900, 66);

            // Fortschritt sollte gerundet sein
            expect(Number.isInteger(progress.eloProgress)).toBe(true);
            expect(Number.isInteger(progress.xpProgress)).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        test('sollte mit null/undefined Werten funktionieren', () => {
            const progress = getRankProgress(null, null);

            expect(progress.currentRank.id).toBe(RANKS.REKRUT.id);
            expect(progress.eloNeeded).toBeGreaterThan(0);
        });
    });
});

describe('getRankById()', () => {
    test('sollte korrekten Rang für gültige ID zurückgeben', () => {
        expect(getRankById(0)).toBe(RANKS.REKRUT);
        expect(getRankById(1)).toBe(RANKS.BRONZE);
        expect(getRankById(2)).toBe(RANKS.SILBER);
        expect(getRankById(3)).toBe(RANKS.GOLD);
        expect(getRankById(4)).toBe(RANKS.PLATIN);
        expect(getRankById(5)).toBe(RANKS.CHAMPION);
    });

    test('sollte null für ungültige ID zurückgeben', () => {
        expect(getRankById(-1)).toBe(null);
        expect(getRankById(6)).toBe(null);
        expect(getRankById(100)).toBe(null);
    });

    test('sollte null für nicht-numerische IDs zurückgeben', () => {
        expect(getRankById(null)).toBe(null);
        expect(getRankById(undefined)).toBe(null);
    });
});

describe('getRankByName()', () => {
    test('sollte korrekten Rang für gültigen Namen zurückgeben', () => {
        expect(getRankByName('REKRUT')).toBe(RANKS.REKRUT);
        expect(getRankByName('BRONZE')).toBe(RANKS.BRONZE);
        expect(getRankByName('SILBER')).toBe(RANKS.SILBER);
        expect(getRankByName('GOLD')).toBe(RANKS.GOLD);
        expect(getRankByName('PLATIN')).toBe(RANKS.PLATIN);
        expect(getRankByName('CHAMPION')).toBe(RANKS.CHAMPION);
    });

    test('sollte case-insensitive sein', () => {
        expect(getRankByName('rekrut')).toBe(RANKS.REKRUT);
        expect(getRankByName('Rekrut')).toBe(RANKS.REKRUT);
        expect(getRankByName('bronze')).toBe(RANKS.BRONZE);
    });

    test('sollte null für ungültigen Namen zurückgeben', () => {
        expect(getRankByName('INVALID')).toBe(null);
        expect(getRankByName('')).toBe(null);
    });
});

describe('formatRank()', () => {
    test('sollte Emoji + Name für gültigen Rang zurückgeben', () => {
        expect(formatRank(RANKS.REKRUT)).toBe('🔰 Rekrut');
        expect(formatRank(RANKS.BRONZE)).toBe('🥉 Bronze');
        expect(formatRank(RANKS.SILBER)).toBe('🥈 Silber');
        expect(formatRank(RANKS.GOLD)).toBe('🥇 Gold');
        expect(formatRank(RANKS.PLATIN)).toBe('💎 Platin');
        expect(formatRank(RANKS.CHAMPION)).toBe('👑 Champion');
    });

    test('sollte Fallback für null/undefined zurückgeben', () => {
        expect(formatRank(null)).toBe('🎖️ Rekrut');
        expect(formatRank(undefined)).toBe('🎖️ Rekrut');
    });
});

describe('groupPlayersByRank()', () => {
    test('sollte leere Gruppen für alle Ränge erstellen', () => {
        const grouped = groupPlayersByRank([]);

        expect(Object.keys(grouped)).toHaveLength(6);
        expect(grouped[0]).toEqual([]); // Rekrut
        expect(grouped[1]).toEqual([]); // Bronze
        expect(grouped[2]).toEqual([]); // Silber
        expect(grouped[3]).toEqual([]); // Gold
        expect(grouped[4]).toEqual([]); // Platin
        expect(grouped[5]).toEqual([]); // Champion
    });

    test('sollte Spieler nach Rang gruppieren', () => {
        const players = [
            { id: 1, eloRating: 800, xp: 0 },
            { id: 2, eloRating: 900, xp: 100 },
            { id: 3, eloRating: 1200, xp: 600 },
        ];

        const grouped = groupPlayersByRank(players);

        expect(grouped[0]).toHaveLength(1); // Rekrut (player 1)
        expect(grouped[1]).toHaveLength(1); // Bronze (player 2)
        expect(grouped[3]).toHaveLength(1); // Gold (player 3)
    });

    test('sollte Rang-Objekt zu jedem Spieler hinzufügen', () => {
        const players = [{ id: 1, eloRating: 800, xp: 0 }];

        const grouped = groupPlayersByRank(players);

        expect(grouped[0][0].rank).toBeDefined();
        expect(grouped[0][0].rank.id).toBe(RANKS.REKRUT.id);
    });

    test('sollte Bronze geben wenn Elo und XP ausreichend', () => {
        const players = [{ id: 1, eloRating: 900, xp: 100 }];

        const grouped = groupPlayersByRank(players);

        // Sollte Bronze sein (Elo >= 850, XP >= 50)
        expect(grouped[1]).toHaveLength(1);
    });

    test('sollte mehrere Spieler pro Rang gruppieren', () => {
        const players = [
            { id: 1, eloRating: 800, xp: 0 },
            { id: 2, eloRating: 750, xp: 10 },
            { id: 3, eloRating: 820, xp: 20 },
        ];

        const grouped = groupPlayersByRank(players);

        expect(grouped[0]).toHaveLength(3); // Alle Rekruts
    });
});
