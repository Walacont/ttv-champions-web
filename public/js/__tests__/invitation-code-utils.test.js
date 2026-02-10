/**
 * Unit Tests für Einladungscode-Utilities
 *
 * Tests für:
 * - Code-Generierung
 * - Code-Validierung
 * - Code-Formatierung
 * - Ablaufdatum-Berechnung
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    generateInvitationCode,
    validateCodeFormat,
    formatCode,
    getExpirationDate,
    isCodeExpired,
    getRemainingDays,
    CODE_CONFIG,
} from '../invitation-code-utils.js';

describe('CODE_CONFIG', () => {
    test('sollte korrekte Konfiguration haben', () => {
        expect(CODE_CONFIG.PREFIX).toBe('TTV');
        expect(CODE_CONFIG.VALIDITY_DAYS).toBe(7);
        expect(CODE_CONFIG.FORMAT).toBe('TTV-XXX-YYY');
    });

    test('sollte keine verwechselbaren Zeichen enthalten', () => {
        const chars = CODE_CONFIG.ALLOWED_CHARS;

        // Keine 0 (verwechselbar mit O)
        expect(chars).not.toContain('0');
        // Keine 1 (verwechselbar mit I, l)
        expect(chars).not.toContain('1');
        // Kein O (verwechselbar mit 0)
        expect(chars).not.toContain('O');
        // Kein I (verwechselbar mit 1, l)
        expect(chars).not.toContain('I');
    });

    test('sollte erlaubte Zeichen enthalten', () => {
        const chars = CODE_CONFIG.ALLOWED_CHARS;

        // Ziffern 2-9
        expect(chars).toContain('2');
        expect(chars).toContain('9');

        // Großbuchstaben (außer I, O)
        expect(chars).toContain('A');
        expect(chars).toContain('Z');
        expect(chars).toContain('K');
    });
});

describe('generateInvitationCode()', () => {
    test('sollte Code im korrekten Format generieren', () => {
        const code = generateInvitationCode();

        expect(code).toMatch(/^TTV-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/);
    });

    test('sollte mit TTV- beginnen', () => {
        const code = generateInvitationCode();

        expect(code.startsWith('TTV-')).toBe(true);
    });

    test('sollte 11 Zeichen lang sein', () => {
        const code = generateInvitationCode();

        expect(code).toHaveLength(11);
    });

    test('sollte zwei 3-stellige Segmente haben', () => {
        const code = generateInvitationCode();
        const parts = code.split('-');

        expect(parts).toHaveLength(3);
        expect(parts[0]).toBe('TTV');
        expect(parts[1]).toHaveLength(3);
        expect(parts[2]).toHaveLength(3);
    });

    test('sollte verschiedene Codes generieren (Zufälligkeit)', () => {
        const codes = new Set();

        for (let i = 0; i < 100; i++) {
            codes.add(generateInvitationCode());
        }

        // Bei 100 Durchläufen sollten mindestens 90 unterschiedlich sein
        expect(codes.size).toBeGreaterThan(90);
    });

    test('sollte nur erlaubte Zeichen verwenden', () => {
        const allowedChars = CODE_CONFIG.ALLOWED_CHARS + '-';

        for (let i = 0; i < 50; i++) {
            const code = generateInvitationCode();
            const codeWithoutPrefix = code.substring(4); // Entferne "TTV-"

            for (const char of codeWithoutPrefix) {
                expect(allowedChars).toContain(char);
            }
        }
    });
});

describe('validateCodeFormat()', () => {
    describe('Gültige Codes', () => {
        test('sollte gültigen Code akzeptieren', () => {
            // Nur erlaubte Zeichen: 2-9, A-H, J-N, P-Z (keine 0, 1, I, O)
            expect(validateCodeFormat('TTV-ABC-234')).toBe(true);
            expect(validateCodeFormat('TTV-XYZ-789')).toBe(true);
        });

        test('sollte generierten Code validieren', () => {
            const code = generateInvitationCode();
            expect(validateCodeFormat(code)).toBe(true);
        });

        test('sollte case-insensitive sein', () => {
            expect(validateCodeFormat('ttv-abc-xyz')).toBe(true);
            expect(validateCodeFormat('Ttv-Abc-Xyz')).toBe(true);
        });

        test('sollte Codes mit erlaubten Zeichen akzeptieren', () => {
            expect(validateCodeFormat('TTV-234-567')).toBe(true);
            expect(validateCodeFormat('TTV-ABC-DEF')).toBe(true);
            expect(validateCodeFormat('TTV-HJK-LMN')).toBe(true);
        });
    });

    describe('Ungültige Codes', () => {
        test('sollte null/undefined ablehnen', () => {
            expect(validateCodeFormat(null)).toBe(false);
            expect(validateCodeFormat(undefined)).toBe(false);
            expect(validateCodeFormat('')).toBe(false);
        });

        test('sollte falsches Prefix ablehnen', () => {
            expect(validateCodeFormat('ABC-DEF-GHI')).toBe(false);
            expect(validateCodeFormat('XXX-ABC-123')).toBe(false);
        });

        test('sollte falsche Länge ablehnen', () => {
            expect(validateCodeFormat('TTV-AB-123')).toBe(false); // Zu kurz
            expect(validateCodeFormat('TTV-ABCD-123')).toBe(false); // Zu lang
            expect(validateCodeFormat('TTV-ABC-1234')).toBe(false); // Zu lang
        });

        test('sollte verbotene Zeichen ablehnen (0, O, 1, I)', () => {
            expect(validateCodeFormat('TTV-0AB-123')).toBe(false); // 0
            expect(validateCodeFormat('TTV-OAB-123')).toBe(false); // O
            expect(validateCodeFormat('TTV-1AB-123')).toBe(false); // 1
            expect(validateCodeFormat('TTV-IAB-123')).toBe(false); // I
        });

        test('sollte fehlende Bindestriche ablehnen', () => {
            expect(validateCodeFormat('TTVABCDEF')).toBe(false);
            expect(validateCodeFormat('TTV ABC DEF')).toBe(false);
        });

        test('sollte Sonderzeichen ablehnen', () => {
            expect(validateCodeFormat('TTV-AB!-123')).toBe(false);
            expect(validateCodeFormat('TTV-ABC-12@')).toBe(false);
        });
    });
});

describe('formatCode()', () => {
    test('sollte bereits formatierten Code unverändert lassen', () => {
        expect(formatCode('TTV-ABC-123')).toBe('TTV-ABC-123');
    });

    test('sollte Bindestriche hinzufügen', () => {
        expect(formatCode('TTVABCXYZ')).toBe('TTV-ABC-XYZ');
    });

    test('sollte zu Großbuchstaben konvertieren', () => {
        expect(formatCode('ttvabcxyz')).toBe('TTV-ABC-XYZ');
    });

    test('sollte Sonderzeichen entfernen', () => {
        expect(formatCode('TTV ABC XYZ')).toBe('TTV-ABC-XYZ');
        expect(formatCode('TTV.ABC.XYZ')).toBe('TTV-ABC-XYZ');
    });

    test('sollte falsches Format unverändert zurückgeben', () => {
        expect(formatCode('ABC')).toBe('ABC');
        expect(formatCode('ABCDEFGHIJ')).toBe('ABCDEFGHIJ');
    });

    test('sollte mit gemischten Zeichen funktionieren', () => {
        expect(formatCode('ttv-abc-xyz')).toBe('TTV-ABC-XYZ');
    });
});

describe('getExpirationDate()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte Datum 7 Tage in der Zukunft zurückgeben', () => {
        const now = new Date('2024-01-15T12:00:00Z');
        vi.setSystemTime(now);

        const expDate = getExpirationDate();
        const expected = new Date('2024-01-22T12:00:00Z');

        expect(expDate.getFullYear()).toBe(expected.getFullYear());
        expect(expDate.getMonth()).toBe(expected.getMonth());
        expect(expDate.getDate()).toBe(expected.getDate());
    });

    test('sollte Date-Objekt zurückgeben', () => {
        const expDate = getExpirationDate();
        expect(expDate instanceof Date).toBe(true);
    });

    test('sollte Monatsübergänge korrekt behandeln', () => {
        const now = new Date('2024-01-30T12:00:00Z');
        vi.setSystemTime(now);

        const expDate = getExpirationDate();

        // 30. Januar + 7 Tage = 6. Februar
        expect(expDate.getMonth()).toBe(1); // Februar
        expect(expDate.getDate()).toBe(6);
    });
});

describe('isCodeExpired()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte true für abgelaufenen Code zurückgeben', () => {
        vi.setSystemTime(new Date('2024-01-20T12:00:00Z'));

        const expiredDate = new Date('2024-01-15T12:00:00Z');
        expect(isCodeExpired(expiredDate)).toBe(true);
    });

    test('sollte false für gültigen Code zurückgeben', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const futureDate = new Date('2024-01-20T12:00:00Z');
        expect(isCodeExpired(futureDate)).toBe(false);
    });

    test('sollte true für null/undefined zurückgeben', () => {
        expect(isCodeExpired(null)).toBe(true);
        expect(isCodeExpired(undefined)).toBe(true);
    });

    test('sollte mit ISO-String funktionieren', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        expect(isCodeExpired('2024-01-10T12:00:00Z')).toBe(true);
        expect(isCodeExpired('2024-01-20T12:00:00Z')).toBe(false);
    });

    test('sollte mit Timestamp-Objekt (toDate) funktionieren', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const mockTimestamp = {
            toDate: () => new Date('2024-01-20T12:00:00Z'),
        };

        expect(isCodeExpired(mockTimestamp)).toBe(false);
    });
});

describe('getRemainingDays()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte korrekte verbleibende Tage zurückgeben', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const expDate = new Date('2024-01-20T12:00:00Z');
        expect(getRemainingDays(expDate)).toBe(5);
    });

    test('sollte 0 für abgelaufenen Code zurückgeben', () => {
        vi.setSystemTime(new Date('2024-01-20T12:00:00Z'));

        const expDate = new Date('2024-01-15T12:00:00Z');
        expect(getRemainingDays(expDate)).toBe(0);
    });

    test('sollte 0 für null/undefined zurückgeben', () => {
        expect(getRemainingDays(null)).toBe(0);
        expect(getRemainingDays(undefined)).toBe(0);
    });

    test('sollte aufrunden (ceil)', () => {
        vi.setSystemTime(new Date('2024-01-15T23:00:00Z'));

        const expDate = new Date('2024-01-17T01:00:00Z');
        // Differenz ist etwas mehr als 1 Tag, sollte auf 2 gerundet werden
        expect(getRemainingDays(expDate)).toBe(2);
    });

    test('sollte mit ISO-String funktionieren', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        expect(getRemainingDays('2024-01-22T12:00:00Z')).toBe(7);
    });

    test('sollte mit Timestamp-Objekt funktionieren', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const mockTimestamp = {
            toDate: () => new Date('2024-01-18T12:00:00Z'),
        };

        expect(getRemainingDays(mockTimestamp)).toBe(3);
    });

    test('sollte niemals negative Werte zurückgeben', () => {
        vi.setSystemTime(new Date('2024-01-20T12:00:00Z'));

        const longExpiredDate = new Date('2024-01-01T12:00:00Z');
        expect(getRemainingDays(longExpiredDate)).toBe(0);
    });
});

describe('Integration Tests', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte generierten Code validieren und Ablaufdatum prüfen', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const code = generateInvitationCode();
        const expDate = getExpirationDate();

        // Code sollte valide sein
        expect(validateCodeFormat(code)).toBe(true);

        // Code sollte nicht abgelaufen sein
        expect(isCodeExpired(expDate)).toBe(false);

        // Sollte 7 Tage gültig sein
        expect(getRemainingDays(expDate)).toBe(7);
    });

    test('sollte nach 7 Tagen als abgelaufen erkannt werden', () => {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));

        const expDate = getExpirationDate();

        // 8 Tage später
        vi.setSystemTime(new Date('2024-01-23T12:00:00Z'));

        expect(isCodeExpired(expDate)).toBe(true);
        expect(getRemainingDays(expDate)).toBe(0);
    });
});
