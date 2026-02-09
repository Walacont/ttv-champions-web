/**
 * Unit Tests für Alters-Utilities
 *
 * Tests für:
 * - Altersberechnung
 * - Altersgruppen-Bestimmung
 * - Registrierungs-Validierung
 * - Vormund-Validierung
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    calculateAge,
    calculateAgeMode,
    isMinor,
    isChild,
    isTeen,
    validateRegistrationAge,
    validateGuardianAge,
    formatBirthdate,
    parseBirthdate,
    getAgeAppropriateGreeting,
    KID_FRIENDLY_RANKS,
    getAgeAppropriateRank,
} from '../age-utils.js';

describe('calculateAge()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Grundlegende Altersberechnung', () => {
        test('sollte korrektes Alter berechnen', () => {
            expect(calculateAge('2014-06-15')).toBe(10); // Genau 10 heute
            expect(calculateAge('2004-06-15')).toBe(20); // Genau 20 heute
            expect(calculateAge('1994-06-15')).toBe(30); // Genau 30 heute
        });

        test('sollte Alter vor Geburtstag korrekt berechnen', () => {
            // Geburtstag noch nicht gewesen dieses Jahr
            expect(calculateAge('2014-07-01')).toBe(9); // Wird 10 im Juli
            expect(calculateAge('2014-12-25')).toBe(9); // Wird 10 im Dezember
        });

        test('sollte Alter nach Geburtstag korrekt berechnen', () => {
            // Geburtstag schon gewesen dieses Jahr
            expect(calculateAge('2014-01-01')).toBe(10); // Wurde 10 im Januar
            expect(calculateAge('2014-05-01')).toBe(10); // Wurde 10 im Mai
        });
    });

    describe('Date-Objekt Eingabe', () => {
        test('sollte mit Date-Objekt funktionieren', () => {
            const birthdate = new Date('2014-06-15');
            expect(calculateAge(birthdate)).toBe(10);
        });
    });

    describe('Edge Cases', () => {
        test('sollte null für null/undefined zurückgeben', () => {
            expect(calculateAge(null)).toBe(null);
            expect(calculateAge(undefined)).toBe(null);
            expect(calculateAge('')).toBe(null);
        });

        test('sollte null für ungültiges Datum zurückgeben', () => {
            expect(calculateAge('invalid-date')).toBe(null);
            expect(calculateAge('2024-13-45')).toBe(null);
        });

        test('sollte Schaltjahr-Geburtstage korrekt behandeln', () => {
            vi.setSystemTime(new Date('2024-02-29')); // Schaltjahr
            expect(calculateAge('2000-02-29')).toBe(24);
        });
    });
});

describe('calculateAgeMode()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte "kids" für unter 14 zurückgeben', () => {
        expect(calculateAgeMode('2015-01-01')).toBe('kids'); // 9 Jahre
        expect(calculateAgeMode('2012-01-01')).toBe('kids'); // 12 Jahre
        expect(calculateAgeMode('2011-01-01')).toBe('kids'); // 13 Jahre
    });

    test('sollte "teen" für 14-15 zurückgeben', () => {
        expect(calculateAgeMode('2010-01-01')).toBe('teen'); // 14 Jahre
        expect(calculateAgeMode('2009-01-01')).toBe('teen'); // 15 Jahre
    });

    test('sollte "full" für 16+ zurückgeben', () => {
        expect(calculateAgeMode('2008-01-01')).toBe('full'); // 16 Jahre
        expect(calculateAgeMode('2000-01-01')).toBe('full'); // 24 Jahre
        expect(calculateAgeMode('1990-01-01')).toBe('full'); // 34 Jahre
    });

    test('sollte null für ungültiges Datum zurückgeben', () => {
        expect(calculateAgeMode(null)).toBe(null);
        expect(calculateAgeMode('invalid')).toBe(null);
    });
});

describe('isMinor()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte true für unter 16 zurückgeben', () => {
        expect(isMinor('2015-01-01')).toBe(true); // 9
        expect(isMinor('2010-01-01')).toBe(true); // 14
        expect(isMinor('2009-01-01')).toBe(true); // 15
    });

    test('sollte false für 16+ zurückgeben', () => {
        expect(isMinor('2008-01-01')).toBe(false); // 16
        expect(isMinor('2000-01-01')).toBe(false); // 24
    });

    test('sollte false für ungültiges Datum zurückgeben', () => {
        expect(isMinor(null)).toBe(false);
        expect(isMinor('invalid')).toBe(false);
    });
});

describe('isChild()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte true für unter 14 zurückgeben', () => {
        expect(isChild('2015-01-01')).toBe(true); // 9
        expect(isChild('2012-01-01')).toBe(true); // 12
        expect(isChild('2011-01-01')).toBe(true); // 13
    });

    test('sollte false für 14+ zurückgeben', () => {
        expect(isChild('2010-01-01')).toBe(false); // 14
        expect(isChild('2009-01-01')).toBe(false); // 15
        expect(isChild('2000-01-01')).toBe(false); // 24
    });
});

describe('isTeen()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte true für 14-15 zurückgeben', () => {
        expect(isTeen('2010-01-01')).toBe(true); // 14
        expect(isTeen('2009-01-01')).toBe(true); // 15
    });

    test('sollte false für unter 14 zurückgeben', () => {
        expect(isTeen('2015-01-01')).toBe(false); // 9
        expect(isTeen('2011-01-01')).toBe(false); // 13
    });

    test('sollte false für 16+ zurückgeben', () => {
        expect(isTeen('2008-01-01')).toBe(false); // 16
        expect(isTeen('2000-01-01')).toBe(false); // 24
    });
});

describe('validateRegistrationAge()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Gültige Registrierung (16+)', () => {
        test('sollte Registrierung für 16+ erlauben', () => {
            const result = validateRegistrationAge('2008-01-01'); // 16

            expect(result.allowed).toBe(true);
            expect(result.ageMode).toBe('full');
        });

        test('sollte Registrierung für Erwachsene erlauben', () => {
            const result = validateRegistrationAge('1990-01-01'); // 34

            expect(result.allowed).toBe(true);
            expect(result.ageMode).toBe('full');
        });
    });

    describe('Ungültige Registrierung (unter 16)', () => {
        test('sollte Registrierung für unter 14 (kids) ablehnen', () => {
            const result = validateRegistrationAge('2015-01-01'); // 9

            expect(result.allowed).toBe(false);
            expect(result.ageMode).toBe('kids');
            expect(result.reason).toContain('unter 16');
        });

        test('sollte Registrierung für 14-15 (teen) ablehnen', () => {
            const result = validateRegistrationAge('2010-01-01'); // 14

            expect(result.allowed).toBe(false);
            expect(result.ageMode).toBe('teen');
            expect(result.reason).toContain('unter 16');
        });
    });

    describe('Edge Cases', () => {
        test('sollte für fehlendes Geburtsdatum ablehnen', () => {
            const result = validateRegistrationAge(null);

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Geburtsdatum');
        });

        test('sollte für ungültiges Geburtsdatum ablehnen', () => {
            const result = validateRegistrationAge('invalid');

            expect(result.allowed).toBe(false);
        });
    });
});

describe('validateGuardianAge()', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Gültige Vormund-Registrierung (18+)', () => {
        test('sollte Vormund-Registrierung für 18+ erlauben', () => {
            const result = validateGuardianAge('2006-01-01'); // 18

            expect(result.allowed).toBe(true);
        });

        test('sollte Vormund-Registrierung für Erwachsene erlauben', () => {
            const result = validateGuardianAge('1980-01-01'); // 44

            expect(result.allowed).toBe(true);
        });
    });

    describe('Ungültige Vormund-Registrierung (unter 18)', () => {
        test('sollte Vormund-Registrierung für unter 18 ablehnen', () => {
            const result = validateGuardianAge('2008-01-01'); // 16

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('18 Jahre');
        });

        test('sollte Vormund-Registrierung für 17-Jährige ablehnen', () => {
            const result = validateGuardianAge('2007-01-01'); // 17

            expect(result.allowed).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        test('sollte für fehlendes Geburtsdatum ablehnen', () => {
            const result = validateGuardianAge(null);

            expect(result.allowed).toBe(false);
            expect(result.reason).toContain('Geburtsdatum');
        });
    });
});

describe('formatBirthdate()', () => {
    test('sollte deutsches Datumsformat zurückgeben', () => {
        const result = formatBirthdate('2010-03-15');

        expect(result).toContain('15');
        expect(result).toContain('März');
        expect(result).toContain('2010');
    });

    test('sollte leeren String für null/undefined zurückgeben', () => {
        expect(formatBirthdate(null)).toBe('');
        expect(formatBirthdate(undefined)).toBe('');
        expect(formatBirthdate('')).toBe('');
    });

    test('sollte Original für ungültiges Datum zurückgeben', () => {
        expect(formatBirthdate('invalid')).toBe('invalid');
    });
});

describe('parseBirthdate()', () => {
    describe('Gültige Eingaben', () => {
        test('sollte YYYY-MM-DD Format zurückgeben', () => {
            expect(parseBirthdate(15, 3, 2010)).toBe('2010-03-15');
            expect(parseBirthdate(1, 1, 2000)).toBe('2000-01-01');
            expect(parseBirthdate(31, 12, 1999)).toBe('1999-12-31');
        });

        test('sollte String-Eingaben akzeptieren', () => {
            expect(parseBirthdate('15', '3', '2010')).toBe('2010-03-15');
        });

        test('sollte einstellige Zahlen padden', () => {
            expect(parseBirthdate(5, 6, 2010)).toBe('2010-06-05');
        });
    });

    describe('Ungültige Eingaben', () => {
        test('sollte null für fehlende Werte zurückgeben', () => {
            expect(parseBirthdate(null, 3, 2010)).toBe(null);
            expect(parseBirthdate(15, null, 2010)).toBe(null);
            expect(parseBirthdate(15, 3, null)).toBe(null);
        });

        test('sollte null für ungültige Zahlen zurückgeben', () => {
            expect(parseBirthdate('abc', 3, 2010)).toBe(null);
            expect(parseBirthdate(15, 'xyz', 2010)).toBe(null);
        });

        test('sollte null für Werte außerhalb des Bereichs zurückgeben', () => {
            expect(parseBirthdate(0, 3, 2010)).toBe(null); // Tag 0
            expect(parseBirthdate(32, 3, 2010)).toBe(null); // Tag 32
            expect(parseBirthdate(15, 0, 2010)).toBe(null); // Monat 0
            expect(parseBirthdate(15, 13, 2010)).toBe(null); // Monat 13
            expect(parseBirthdate(15, 3, 1899)).toBe(null); // Jahr < 1900
        });

        test('sollte null für zukünftige Jahre zurückgeben', () => {
            // Angenommen wir sind in 2024
            expect(parseBirthdate(15, 3, 2030)).toBe(null);
        });
    });
});

describe('getAgeAppropriateGreeting()', () => {
    test('sollte Kids-Gruß mit Emoji zurückgeben', () => {
        const result = getAgeAppropriateGreeting('Max', 'kids');

        expect(result).toBe('Hallo Max! 🎮');
    });

    test('sollte Teen-Gruß zurückgeben', () => {
        const result = getAgeAppropriateGreeting('Anna', 'teen');

        expect(result).toBe('Hey Anna!');
    });

    test('sollte Full-Gruß zurückgeben', () => {
        const result = getAgeAppropriateGreeting('Peter', 'full');

        expect(result).toBe('Willkommen, Peter');
    });

    test('sollte Fallback "Spieler" ohne Namen verwenden', () => {
        expect(getAgeAppropriateGreeting(null, 'kids')).toBe('Hallo Spieler! 🎮');
        expect(getAgeAppropriateGreeting('', 'teen')).toBe('Hey Spieler!');
        expect(getAgeAppropriateGreeting(undefined, 'full')).toBe('Willkommen, Spieler');
    });
});

describe('KID_FRIENDLY_RANKS', () => {
    test('sollte kinderfreundliche Ränge definiert haben', () => {
        expect(KID_FRIENDLY_RANKS).toBeDefined();
        expect(Object.keys(KID_FRIENDLY_RANKS).length).toBeGreaterThan(0);
    });

    test('sollte Namen und Emojis für jeden Rang haben', () => {
        Object.values(KID_FRIENDLY_RANKS).forEach(rank => {
            expect(rank.name).toBeDefined();
            expect(rank.emoji).toBeDefined();
        });
    });

    test('sollte Rekrut als Anfänger haben', () => {
        expect(KID_FRIENDLY_RANKS['Rekrut'].name).toBe('Anfänger');
        expect(KID_FRIENDLY_RANKS['Rekrut'].emoji).toBe('🌱');
    });
});

describe('getAgeAppropriateRank()', () => {
    test('sollte kinderfreundlichen Rang für kids zurückgeben', () => {
        const result = getAgeAppropriateRank('Rekrut', 'kids');

        expect(result.name).toBe('Anfänger');
        expect(result.emoji).toBe('🌱');
    });

    test('sollte Original-Rang für teen zurückgeben', () => {
        const result = getAgeAppropriateRank('Rekrut', 'teen');

        expect(result.name).toBe('Rekrut');
        expect(result.emoji).toBe('');
    });

    test('sollte Original-Rang für full zurückgeben', () => {
        const result = getAgeAppropriateRank('Rekrut', 'full');

        expect(result.name).toBe('Rekrut');
        expect(result.emoji).toBe('');
    });

    test('sollte Original für unbekannten Rang bei kids zurückgeben', () => {
        const result = getAgeAppropriateRank('UnbekannterRang', 'kids');

        expect(result.name).toBe('UnbekannterRang');
    });
});

describe('Integration Tests', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-06-15'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('sollte vollständigen Registrierungsflow validieren', () => {
        // 10-jähriges Kind
        const childBirthdate = parseBirthdate(15, 3, 2014);
        expect(childBirthdate).toBe('2014-03-15');

        const age = calculateAge(childBirthdate);
        expect(age).toBe(10);

        const mode = calculateAgeMode(childBirthdate);
        expect(mode).toBe('kids');

        expect(isChild(childBirthdate)).toBe(true);
        expect(isMinor(childBirthdate)).toBe(true);

        const registration = validateRegistrationAge(childBirthdate);
        expect(registration.allowed).toBe(false);
        expect(registration.ageMode).toBe('kids');
    });

    test('sollte Vormund-Registrierung für 30-Jährigen erlauben', () => {
        const guardianBirthdate = parseBirthdate(1, 1, 1994);
        expect(guardianBirthdate).toBe('1994-01-01');

        const age = calculateAge(guardianBirthdate);
        expect(age).toBe(30);

        const guardianValidation = validateGuardianAge(guardianBirthdate);
        expect(guardianValidation.allowed).toBe(true);
    });

    test('sollte altersgerechte Inhalte für verschiedene Altersgruppen liefern', () => {
        // Kind (10 Jahre)
        const childMode = calculateAgeMode('2014-01-01');
        expect(getAgeAppropriateGreeting('Tim', childMode)).toBe('Hallo Tim! 🎮');
        expect(getAgeAppropriateRank('Rekrut', childMode).name).toBe('Anfänger');

        // Teen (14 Jahre)
        const teenMode = calculateAgeMode('2010-01-01');
        expect(getAgeAppropriateGreeting('Lisa', teenMode)).toBe('Hey Lisa!');
        expect(getAgeAppropriateRank('Rekrut', teenMode).name).toBe('Rekrut');

        // Erwachsener (24 Jahre)
        const adultMode = calculateAgeMode('2000-01-01');
        expect(getAgeAppropriateGreeting('Max', adultMode)).toBe('Willkommen, Max');
        expect(getAgeAppropriateRank('Rekrut', adultMode).name).toBe('Rekrut');
    });
});
