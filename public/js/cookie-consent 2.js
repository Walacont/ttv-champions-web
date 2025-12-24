/**
 * Cookie Consent Manager
 * GDPR-compliant cookie consent for Google Analytics 4
 */

(function() {
    'use strict';

    const CONSENT_KEY = 'cookie_consent';
    const CONSENT_EXPIRY_DAYS = 365; // 1 Jahr
    const GA_MEASUREMENT_ID = 'G-Z3R3M51GJX';

    /**
     * Get stored consent
     */
    function getConsent() {
        try {
            const consent = localStorage.getItem(CONSENT_KEY);
            if (!consent) return null;

            const data = JSON.parse(consent);
            // Check if expired
            if (data.expiry && new Date().getTime() > data.expiry) {
                localStorage.removeItem(CONSENT_KEY);
                return null;
            }
            return data;
        } catch (e) {
            return null;
        }
    }

    /**
     * Save consent
     */
    function saveConsent(accepted) {
        const expiry = new Date().getTime() + (CONSENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        const data = {
            analytics: accepted,
            timestamp: new Date().toISOString(),
            expiry: expiry
        };
        localStorage.setItem(CONSENT_KEY, JSON.stringify(data));
    }

    /**
     * Load Google Analytics 4
     */
    function loadGA4() {
        // Check if already loaded
        if (window.gtag) return;

        // Load gtag.js
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script);

        // Initialize gtag
        window.dataLayer = window.dataLayer || [];
        window.gtag = function() { dataLayer.push(arguments); };
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID);

        console.log('[Cookie Consent] Google Analytics 4 loaded');
    }

    /**
     * Remove GA4 cookies (when rejected)
     */
    function removeGA4Cookies() {
        // Remove GA cookies
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const name = cookie.split('=')[0].trim();
            if (name.startsWith('_ga')) {
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}`;
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
            }
        }
    }

    /**
     * Create and show cookie banner
     */
    function showBanner() {
        // Don't show if already exists
        if (document.getElementById('cookie-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'cookie-banner';
        banner.innerHTML = `
            <div class="cookie-banner-overlay"></div>
            <div class="cookie-banner-content">
                <div class="cookie-banner-text">
                    <h3>Cookie-Einstellungen</h3>
                    <p>Wir verwenden Cookies, um die Nutzung unserer Website zu analysieren und zu verbessern.
                    Du kannst selbst entscheiden, ob du Analyse-Cookies zulassen möchtest.</p>
                    <p class="cookie-banner-details">
                        <a href="/docs/datenschutz.html" target="_blank">Mehr erfahren</a>
                    </p>
                </div>
                <div class="cookie-banner-buttons">
                    <button id="cookie-reject" class="cookie-btn cookie-btn-reject">
                        Nur notwendige
                    </button>
                    <button id="cookie-accept" class="cookie-btn cookie-btn-accept">
                        Alle akzeptieren
                    </button>
                </div>
            </div>
        `;

        // Add styles
        const styles = document.createElement('style');
        styles.textContent = `
            #cookie-banner {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .cookie-banner-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: -1;
            }
            .cookie-banner-content {
                background: white;
                padding: 20px;
                box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.15);
                max-width: 600px;
                margin: 0 auto 20px;
                border-radius: 16px;
                margin-left: 20px;
                margin-right: 20px;
            }
            .cookie-banner-text h3 {
                margin: 0 0 10px 0;
                font-size: 18px;
                color: #1a1a1a;
            }
            .cookie-banner-text p {
                margin: 0 0 10px 0;
                font-size: 14px;
                color: #666;
                line-height: 1.5;
            }
            .cookie-banner-details a {
                color: #4f46e5;
                text-decoration: none;
            }
            .cookie-banner-details a:hover {
                text-decoration: underline;
            }
            .cookie-banner-buttons {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }
            .cookie-btn {
                flex: 1;
                padding: 12px 20px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }
            .cookie-btn-reject {
                background: #f3f4f6;
                color: #374151;
            }
            .cookie-btn-reject:hover {
                background: #e5e7eb;
            }
            .cookie-btn-accept {
                background: #4f46e5;
                color: white;
            }
            .cookie-btn-accept:hover {
                background: #4338ca;
            }
            @media (max-width: 480px) {
                .cookie-banner-content {
                    margin: 0 10px 10px;
                    padding: 15px;
                }
                .cookie-banner-buttons {
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(styles);
        document.body.appendChild(banner);

        // Event listeners
        document.getElementById('cookie-accept').addEventListener('click', function() {
            saveConsent(true);
            loadGA4();
            hideBanner();
        });

        document.getElementById('cookie-reject').addEventListener('click', function() {
            saveConsent(false);
            removeGA4Cookies();
            hideBanner();
        });
    }

    /**
     * Hide cookie banner
     */
    function hideBanner() {
        const banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.style.opacity = '0';
            banner.style.transform = 'translateY(100%)';
            banner.style.transition = 'all 0.3s ease';
            setTimeout(() => banner.remove(), 300);
        }
    }

    /**
     * Initialize consent manager
     */
    function init() {
        const consent = getConsent();

        if (consent === null) {
            // No consent yet - show banner
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', showBanner);
            } else {
                showBanner();
            }
        } else if (consent.analytics === true) {
            // User accepted - load GA4
            loadGA4();
        }
        // If consent.analytics === false, do nothing (no GA4)
    }

    /**
     * Allow user to change consent (can be called from settings page)
     */
    window.resetCookieConsent = function() {
        localStorage.removeItem(CONSENT_KEY);
        removeGA4Cookies();
        showBanner();
    };

    /**
     * Check if analytics is enabled
     */
    window.isAnalyticsEnabled = function() {
        const consent = getConsent();
        return consent && consent.analytics === true;
    };

    // Initialize
    init();
})();
