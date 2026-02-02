/**
 * Local avatar placeholder generator - replaces placehold.co CDN dependency.
 * Generates inline SVG data URIs with initials, matching the previous style
 * (gray background #e2e8f0, dark text #64748b).
 * Loaded as a regular script so it's available for inline onerror handlers.
 */
(function() {
    'use strict';

    var DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4=';

    function avatarPlaceholder(text) {
        var t = (text || '?').substring(0, 2);
        var fontSize = t.length > 1 ? 36 : 42;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
            '<rect width="100" height="100" rx="50" fill="#e2e8f0"/>' +
            '<text x="50" y="54" text-anchor="middle" dominant-baseline="middle" ' +
            'font-family="sans-serif" font-size="' + fontSize + '" font-weight="600" ' +
            'fill="#64748b">' + t + '</text></svg>';
        return 'data:image/svg+xml,' + encodeURIComponent(svg);
    }

    window.avatarPlaceholder = avatarPlaceholder;
    window.DEFAULT_AVATAR = DEFAULT_AVATAR;
})();
