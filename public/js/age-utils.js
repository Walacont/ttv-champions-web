/**
 * Age Utilities for Guardian/Parental Control System
 * Handles age calculation, age mode determination, and registration validation
 */

/**
 * Calculate age from birthdate
 * @param {string|Date} birthdate - Birthdate in YYYY-MM-DD format or Date object
 * @returns {number|null} Age in years, or null if invalid
 */
export function calculateAge(birthdate) {
    if (!birthdate) return null;

    const birth = typeof birthdate === 'string' ? new Date(birthdate) : birthdate;
    if (isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    // Adjust age if birthday hasn't occurred this year
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }

    return age;
}

/**
 * Determine age mode based on birthdate
 * @param {string|Date} birthdate - Birthdate
 * @returns {'kids'|'teen'|'full'|null} Age mode
 */
export function calculateAgeMode(birthdate) {
    const age = calculateAge(birthdate);
    if (age === null) return null;

    if (age < 14) return 'kids';
    if (age < 16) return 'teen';
    return 'full';
}

/**
 * Check if user is a minor (under 16)
 * @param {string|Date} birthdate - Birthdate
 * @returns {boolean}
 */
export function isMinor(birthdate) {
    const age = calculateAge(birthdate);
    return age !== null && age < 16;
}

/**
 * Check if user is a child (under 14)
 * @param {string|Date} birthdate - Birthdate
 * @returns {boolean}
 */
export function isChild(birthdate) {
    const age = calculateAge(birthdate);
    return age !== null && age < 14;
}

/**
 * Check if user is a teen (14-15)
 * @param {string|Date} birthdate - Birthdate
 * @returns {boolean}
 */
export function isTeen(birthdate) {
    const age = calculateAge(birthdate);
    return age !== null && age >= 14 && age < 16;
}

/**
 * Validate if user can register themselves
 * @param {string|Date} birthdate - Birthdate
 * @param {boolean} hasInvitationCode - Whether user has an invitation code
 * @returns {{allowed: boolean, reason?: string, requiresParentConfirmation?: boolean}}
 */
export function validateRegistrationAge(birthdate, hasInvitationCode) {
    const age = calculateAge(birthdate);

    if (age === null) {
        return {
            allowed: false,
            reason: 'Bitte gib dein Geburtsdatum ein.'
        };
    }

    // Under 14: ALWAYS blocked - must be created by guardian
    if (age < 14) {
        return {
            allowed: false,
            reason: 'Du bist unter 14 Jahre alt. Bitte lass deine Eltern einen Account für dich erstellen.',
            ageMode: 'kids'
        };
    }

    // 14-15: Only with invitation code from club
    if (age >= 14 && age < 16) {
        if (!hasInvitationCode) {
            return {
                allowed: false,
                reason: 'Mit 14-15 Jahren benötigst du einen Einladungscode von deinem Verein.',
                ageMode: 'teen'
            };
        }
        // With code: allowed but parent confirmation recommended
        return {
            allowed: true,
            requiresParentConfirmation: true,
            ageMode: 'teen'
        };
    }

    // 16+: Full access
    return {
        allowed: true,
        requiresParentConfirmation: false,
        ageMode: 'full'
    };
}

/**
 * Format birthdate for display
 * @param {string} birthdate - Birthdate in YYYY-MM-DD format
 * @returns {string} Formatted date (e.g., "15. März 2010")
 */
export function formatBirthdate(birthdate) {
    if (!birthdate) return '';

    const date = new Date(birthdate);
    if (isNaN(date.getTime())) return birthdate;

    return date.toLocaleDateString('de-DE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

/**
 * Parse birthdate from day/month/year inputs
 * @param {string|number} day
 * @param {string|number} month
 * @param {string|number} year
 * @returns {string|null} Birthdate in YYYY-MM-DD format, or null if invalid
 */
export function parseBirthdate(day, month, year) {
    if (!day || !month || !year) return null;

    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);

    if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
    if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear()) return null;

    const paddedDay = d.toString().padStart(2, '0');
    const paddedMonth = m.toString().padStart(2, '0');

    return `${y}-${paddedMonth}-${paddedDay}`;
}

/**
 * Get age-appropriate greeting
 * @param {string} firstName
 * @param {'kids'|'teen'|'full'} ageMode
 * @returns {string}
 */
export function getAgeAppropriateGreeting(firstName, ageMode) {
    const name = firstName || 'Spieler';

    switch (ageMode) {
        case 'kids':
            return `Hallo ${name}! 🎮`;
        case 'teen':
            return `Hey ${name}!`;
        default:
            return `Willkommen, ${name}`;
    }
}

/**
 * Get kid-friendly rank names (more playful)
 */
export const KID_FRIENDLY_RANKS = {
    'Rekrut': { name: 'Anfänger', emoji: '🌱' },
    'Kadett': { name: 'Tischtennis-Tiger', emoji: '🐯' },
    'Gefreiter': { name: 'Pingpong-Panda', emoji: '🐼' },
    'Unteroffizier': { name: 'Ball-Blitz', emoji: '⚡' },
    'Feldwebel': { name: 'Schmetterball-Star', emoji: '🌟' },
    'Leutnant': { name: 'Spin-Meister', emoji: '🌀' },
    'Hauptmann': { name: 'Netz-Ninja', emoji: '🥷' },
    'Major': { name: 'Platte-Profi', emoji: '🏆' },
    'Oberst': { name: 'Champion', emoji: '👑' },
    'General': { name: 'Legende', emoji: '🔥' }
};

/**
 * Get rank display based on age mode
 * @param {string} rankName - Original rank name
 * @param {'kids'|'teen'|'full'} ageMode
 * @returns {{name: string, emoji: string}}
 */
export function getAgeAppropriateRank(rankName, ageMode) {
    if (ageMode === 'kids' && KID_FRIENDLY_RANKS[rankName]) {
        return KID_FRIENDLY_RANKS[rankName];
    }
    // Return original for teen/full
    return { name: rankName, emoji: '' };
}
