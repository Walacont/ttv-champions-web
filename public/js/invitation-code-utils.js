

const ALLOWED_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_PREFIX = 'TTV';
const CODE_SEGMENT_LENGTH = 3;
const CODE_VALIDITY_DAYS = 7;


export function generateInvitationCode() {
    const segment1 = generateRandomSegment(CODE_SEGMENT_LENGTH);
    const segment2 = generateRandomSegment(CODE_SEGMENT_LENGTH);
    return `${CODE_PREFIX}-${segment1}-${segment2}`;
}


function generateRandomSegment(length) {
    let segment = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * ALLOWED_CHARS.length);
        segment += ALLOWED_CHARS[randomIndex];
    }
    return segment;
}


export function validateCodeFormat(code) {
    if (!code) return false;

    const regex = /^TTV-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/;
    return regex.test(code.toUpperCase());
}


export function formatCode(code) {
    const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();

    if (cleaned.length === 9 && cleaned.startsWith('TTV')) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 9)}`;
    }

    return code;
}


export function getExpirationDate() {
    const date = new Date();
    date.setDate(date.getDate() + CODE_VALIDITY_DAYS);
    return date;
}


export function isCodeExpired(expiresAt) {
    if (!expiresAt) return true;

    const expirationDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    return new Date() > expirationDate;
}


export function getRemainingDays(expiresAt) {
    if (!expiresAt) return 0;

    const expirationDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const now = new Date();
    const diffTime = expirationDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
}


export function createWhatsAppShareUrl(code, firstName = '') {
    const baseUrl = window.location.origin;
    const message = firstName
        ? `Hallo ${firstName}! Hier ist dein SC Champions Einladungscode: ${code}\n\nMelde dich an unter: ${baseUrl}?code=${code}`
        : `Hier ist dein SC Champions Einladungscode: ${code}\n\nMelde dich an unter: ${baseUrl}?code=${code}`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
}


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
