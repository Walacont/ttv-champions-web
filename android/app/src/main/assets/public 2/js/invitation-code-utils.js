/**
 * Utility-Funktionen für Einladungscodes
 * Format: TTV-XXX-YYY (11 Zeichen)
 * Gültigkeit: 7 Tage
 */

// Erlaubte Zeichen (keine verwechselbaren: 0/O, 1/I/l)
const ALLOWED_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_PREFIX = 'TTV';
const CODE_SEGMENT_LENGTH = 3;
const CODE_VALIDITY_DAYS = 7;

/**
 * Generiert einen zufälligen Einladungscode
 * @returns {string} Code im Format "TTV-XXX-YYY"
 */
export function generateInvitationCode() {
    const segment1 = generateRandomSegment(CODE_SEGMENT_LENGTH);
    const segment2 = generateRandomSegment(CODE_SEGMENT_LENGTH);
    return `${CODE_PREFIX}-${segment1}-${segment2}`;
}

/**
 * Generiert ein zufälliges Code-Segment
 * @param {number} length - Länge des Segments
 * @returns {string} Zufälliges Segment
 */
function generateRandomSegment(length) {
    let segment = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * ALLOWED_CHARS.length);
        segment += ALLOWED_CHARS[randomIndex];
    }
    return segment;
}

/**
 * Validiert das Format eines Einladungscodes
 * @param {string} code - Der zu validierende Code
 * @returns {boolean} true wenn gültig
 */
export function validateCodeFormat(code) {
    if (!code) return false;

    // Format: TTV-XXX-YYY
    const regex = /^TTV-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/;
    return regex.test(code.toUpperCase());
}

/**
 * Formatiert einen Code (fügt Bindestriche hinzu wenn nötig)
 * @param {string} code - Der zu formatierende Code
 * @returns {string} Formatierter Code
 */
export function formatCode(code) {
    // Entfernt alle Nicht-Alphanumerischen Zeichen
    const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    // TTV + 6 Zeichen = 9 Zeichen total
    if (cleaned.length === 9 && cleaned.startsWith('TTV')) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 9)}`;
    }

    return code;
}

/**
 * Berechnet das Ablaufdatum (7 Tage ab jetzt)
 * @returns {Date} Ablaufdatum
 */
export function getExpirationDate() {
    const date = new Date();
    date.setDate(date.getDate() + CODE_VALIDITY_DAYS);
    return date;
}

/**
 * Prüft ob ein Code abgelaufen ist
 * @param {Date|string|Object} expiresAt - Ablaufdatum (Date, ISO string, oder Timestamp mit toDate())
 * @returns {boolean} true wenn abgelaufen
 */
export function isCodeExpired(expiresAt) {
    if (!expiresAt) return true;

    const expirationDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    return new Date() > expirationDate;
}

/**
 * Berechnet verbleibende Tage bis zum Ablauf
 * @param {Date|string} expiresAt - Ablaufdatum
 * @returns {number} Verbleibende Tage
 */
export function getRemainingDays(expiresAt) {
    if (!expiresAt) return 0;

    const expirationDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const now = new Date();
    const diffTime = expirationDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
}

/**
 * Erstellt eine WhatsApp-Share-URL
 * @param {string} code - Einladungscode
 * @param {string} firstName - Vorname des Eingeladenen
 * @returns {string} WhatsApp-URL
 */
export function createWhatsAppShareUrl(code, firstName = '') {
    const baseUrl = window.location.origin;
    const message = firstName
        ? `Hallo ${firstName}! Hier ist dein SC Champions Einladungscode: ${code}\n\nMelde dich an unter: ${baseUrl}?code=${code}`
        : `Hier ist dein SC Champions Einladungscode: ${code}\n\nMelde dich an unter: ${baseUrl}?code=${code}`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Kopiert Text in die Zwischenablage
 * @param {string} text - Zu kopierender Text
 * @returns {Promise<boolean>} true wenn erfolgreich
 */
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Fehler beim Kopieren:', err);
        return false;
    }
}

export const CODE_CONFIG = {
    PREFIX: CODE_PREFIX,
    VALIDITY_DAYS: CODE_VALIDITY_DAYS,
    FORMAT: 'TTV-XXX-YYY',
    ALLOWED_CHARS: ALLOWED_CHARS,
};
