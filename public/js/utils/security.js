// Sicherheits-Utilities zur XSS-Prävention

/**
 * HTML-Escape zur XSS-Prävention
 * Für ALLE benutzergenerierten Inhalte vor innerHTML-Einfügung verwenden
 */
export function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    if (typeof text !== 'string') text = String(text);

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * HTML-Attributwerte escapen
 * Für Attribute wie alt="", title="" etc. verwenden
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
 * URL bereinigen um javascript: und data: Angriffe zu verhindern
 */
export function sanitizeUrl(url, fallback = '#') {
    if (!url || typeof url !== 'string') return fallback;

    const trimmed = url.trim().toLowerCase();

    // Gefährliche Protokolle blockieren
    if (trimmed.startsWith('javascript:') ||
        trimmed.startsWith('data:') ||
        trimmed.startsWith('vbscript:')) {
        return fallback;
    }

    return url;
}

/**
 * Bild-URL bereinigen
 */
export function sanitizeImageUrl(url, fallback = '/icons/icon-192x192.png') {
    if (!url || typeof url !== 'string') return fallback;

    const trimmed = url.trim().toLowerCase();

    // Nur http, https und relative URLs erlauben
    if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('/') ||
        trimmed.startsWith('./')) {
        return url;
    }

    return fallback;
}

/**
 * Sicheren HTML-String mit escapten Benutzerinhalten erstellen
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

export default {
    escapeHtml,
    escapeAttr,
    sanitizeUrl,
    sanitizeImageUrl,
    safeHtml
};
