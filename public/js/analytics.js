// Feature Usage Analytics - sends events to Google Analytics 4
// Uses gtag() which is already loaded via cookie-consent.js on all pages
(function() {
    'use strict';

    /**
     * Track a feature usage event
     * @param {string} action - The action name (e.g. 'match_submit', 'profile_update')
     * @param {object} [params] - Optional parameters for the event
     */
    function trackEvent(action, params) {
        try {
            if (typeof gtag === 'function') {
                gtag('event', action, params || {});
            }
        } catch(e) {
            // Silently ignore tracking errors
        }
    }

    /**
     * Track a page/feature view
     * @param {string} featureName - Name of the feature viewed
     */
    function trackView(featureName) {
        trackEvent('feature_view', { feature_name: featureName });
    }

    // Expose globally
    window.trackEvent = trackEvent;
    window.trackView = trackView;
})();
