/**
 * Automatic Update Checker
 * Checks for new app versions and notifies users
 */

// Guard against re-execution (SPA navigation)
if (window._updateCheckerInitialized) {
    // Already initialized, skip
} else {
window._updateCheckerInitialized = true;

let currentVersion = null;
let updateCheckInterval = null;
let updateBannerShown = false;

// Check interval: 5 minutes
const CHECK_INTERVAL = 5 * 60 * 1000;

// Version of this update checker logic - increment to force reset
const UPDATE_CHECKER_VERSION = 6;

/**
 * Initialize update checker
 */
async function initializeUpdateChecker() {
    try {
        // Check if we need to reset due to update checker code change
        const storedCheckerVersion = localStorage.getItem('update_checker_version');
        if (storedCheckerVersion !== String(UPDATE_CHECKER_VERSION)) {
            console.log('[UpdateChecker] Resetting due to code update');
            localStorage.removeItem('app_version');
            localStorage.removeItem('dismissed_version');
            localStorage.setItem('update_checker_version', String(UPDATE_CHECKER_VERSION));
            // Don't show banner immediately after reset - wait for next page load
            localStorage.setItem('update_checker_just_reset', 'true');
            return;
        }

        // Skip banner check if we just reset
        if (localStorage.getItem('update_checker_just_reset') === 'true') {
            localStorage.removeItem('update_checker_just_reset');
            console.log('[UpdateChecker] Skipping check after reset');
        }

        // Get current version from server (with aggressive cache busting)
        const response = await fetch('/version.json?t=' + Date.now(), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        const versionData = await response.json();
        currentVersion = versionData.version;

        console.log('[UpdateChecker] Server version:', currentVersion);

        // Get stored version
        const storedVersion = localStorage.getItem('app_version');
        console.log('[UpdateChecker] Stored version:', storedVersion);

        // If no stored version, save current and don't show banner
        if (!storedVersion) {
            localStorage.setItem('app_version', currentVersion);
            console.log('[UpdateChecker] First visit, storing version');
            return; // Don't start checking, we're up to date
        }

        // If versions match, we're up to date
        if (storedVersion === currentVersion) {
            console.log('[UpdateChecker] Already up to date');
            return; // Don't start checking, we're up to date
        }

        // If banner was already dismissed for this version, update and don't show
        if (localStorage.getItem('dismissed_version') === currentVersion) {
            console.log('[UpdateChecker] Banner already dismissed for this version');
            localStorage.setItem('app_version', currentVersion);
            return;
        }

        // Version mismatch - show banner
        console.log('[UpdateChecker] Version mismatch, showing banner');
        showUpdateBanner(versionData.message || 'Eine neue Version ist verfügbar!');

    } catch (error) {
        console.error('[UpdateChecker] Init error:', error);
    }
}

/**
 * Start periodic version check
 */
function startUpdateCheck() {
    // Check every 5 minutes
    updateCheckInterval = setInterval(checkForUpdates, CHECK_INTERVAL);
}

/**
 * Check if new version is available
 */
async function checkForUpdates() {
    // Don't check if banner is already shown
    if (updateBannerShown) return;

    try {
        const response = await fetch('/version.json?t=' + Date.now(), {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        const versionData = await response.json();
        const latestVersion = versionData.version;
        const storedVersion = localStorage.getItem('app_version');

        // Check if new version available
        if (storedVersion && latestVersion !== storedVersion) {
            // Don't show if already dismissed for this version
            if (localStorage.getItem('dismissed_version') === latestVersion) {
                return;
            }
            showUpdateBanner(versionData.message || 'Eine neue Version ist verfügbar!');
            // Stop checking
            if (updateCheckInterval) {
                clearInterval(updateCheckInterval);
            }
        }
    } catch (error) {
        // Silent fail
    }
}

/**
 * Show update notification banner
 */
function showUpdateBanner(message) {
    // Prevent multiple banners
    if (document.getElementById('update-banner') || updateBannerShown) {
        return;
    }
    updateBannerShown = true;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className =
        'fixed top-0 left-0 right-0 bg-indigo-600 text-white py-3 px-4 shadow-lg z-[99999] animate-slide-down';
    banner.innerHTML = `
        <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                <span class="font-medium">${message}</span>
            </div>
            <div class="flex items-center gap-2">
                <button id="update-reload-btn" class="bg-white text-indigo-600 hover:bg-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors shadow-sm">
                    Aktualisieren
                </button>
                <button id="update-dismiss-btn" class="text-white hover:text-gray-200 p-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // Add CSS for animation
    if (!document.getElementById('update-banner-styles')) {
        const style = document.createElement('style');
        style.id = 'update-banner-styles';
        style.textContent = `
            @keyframes slide-down {
                from {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            .animate-slide-down {
                animation: slide-down 0.3s ease-out;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.prepend(banner);

    // Handle "Aktualisieren" button
    document.getElementById('update-reload-btn').addEventListener('click', async () => {
        // Update stored version FIRST - set both to prevent banner from showing again
        localStorage.setItem('app_version', currentVersion);
        localStorage.setItem('dismissed_version', currentVersion);

        // Clear all caches
        if ('caches' in window) {
            try {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
            } catch (e) {
                console.error('[UpdateChecker] Error clearing caches:', e);
            }
        }

        // Unregister all service workers so they don't re-cache old content
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(reg => reg.unregister()));
            } catch (e) {
                console.error('[UpdateChecker] Error unregistering service workers:', e);
            }
        }

        // Force reload
        window.location.reload(true);
    });

    // Handle dismiss button
    document.getElementById('update-dismiss-btn').addEventListener('click', () => {
        // Mark as dismissed for this version
        localStorage.setItem('app_version', currentVersion);
        localStorage.setItem('dismissed_version', currentVersion);
        banner.remove();
        updateBannerShown = false;
    });
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUpdateChecker);
} else {
    initializeUpdateChecker();
}

// Export for manual checks if needed
window.checkForUpdates = checkForUpdates;

} // End of guard block
