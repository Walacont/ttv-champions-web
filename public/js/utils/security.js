/**
 * Security Utilities for XSS Prevention
 * SC Champions - Zentrale Sicherheits-Funktionen
 */

/**
 * Escape HTML to prevent XSS attacks
 * Use this for ALL user-generated content before inserting into innerHTML
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML-safe string
 */
export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') text = String(text);

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape HTML attribute values
 * Use this when inserting into HTML attributes like alt="", title="", etc.
 * @param {string} value - Attribute value to escape
 * @returns {string} Escaped attribute-safe string
 */
export function escapeAttr(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') value = String(value);

    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Sanitize URL to prevent javascript: and data: attacks
 * @param {string} url - URL to sanitize
 * @param {string} fallback - Fallback URL if invalid
 * @returns {string} Safe URL or fallback
 */
export function sanitizeUrl(url, fallback = '#') {
    if (!url || typeof url !== 'string') return fallback;

    const trimmed = url.trim().toLowerCase();

    // Block dangerous protocols
    if (trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:')) {
        return fallback;
    }

    return url;
}

/**
 * Sanitize image URL
 * @param {string} url - Image URL
 * @param {string} fallback - Default avatar/image URL
 * @returns {string} Safe image URL
 */
export function sanitizeImageUrl(url, fallback = '/icons/icon-192x192.png') {
    if (!url || typeof url !== 'string') return fallback;

    const trimmed = url.trim().toLowerCase();

    // Only allow http, https, and relative URLs
    if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('./')) {
        return url;
    }

    return fallback;
}

/**
 * Create a safe HTML string with escaped user content
 * @param {string[]} literals - Template literal strings
 * @param {...any} values - Values to escape
 * @returns {string} Safe HTML string
 */
export function safeHtml(literals, ...values) {
    let result = '';
    for (let i = 0; i < literals.length; i++) {
        result += literals[i];
        if (i < values.length) {
            result += escapeHtml(values[i]);
        }
    }
    return result;
}

// Legacy support - also export as default object
export default {
    escapeHtml,
    escapeAttr,
    sanitizeUrl,
    sanitizeImageUrl,
    safeHtml
};
