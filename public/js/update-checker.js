/**
 * Automatic Update Checker
 * Checks for new app versions and notifies users
 */

let currentVersion = null;
let updateCheckInterval = null;

// Check interval: 5 minutes
const CHECK_INTERVAL = 5 * 60 * 1000;

/**
 * Initialize update checker
 */
async function initializeUpdateChecker() {
    try {
        // Get current version
        const response = await fetch('/version.json?' + Date.now());
        const versionData = await response.json();
        currentVersion = versionData.version;

        // Store in localStorage for comparison
        const storedVersion = localStorage.getItem('app_version');
        if (!storedVersion) {
            localStorage.setItem('app_version', currentVersion);
        } else if (storedVersion === currentVersion) {
            // If versions match, update timestamp to current version
            // This ensures we're in sync after a reload
            localStorage.setItem('app_version', currentVersion);
        }

        // Start periodic check
        startUpdateCheck();
    } catch (error) {
        // Silent fail - update check is not critical
    }
}

/**
 * Start periodic version check
 */
function startUpdateCheck() {
    // Check immediately after 1 minute
    setTimeout(checkForUpdates, 60000);

    // Then check every 5 minutes
    updateCheckInterval = setInterval(checkForUpdates, CHECK_INTERVAL);
}

/**
 * Check if new version is available
 */
async function checkForUpdates() {
    try {
        const response = await fetch('/version.json?' + Date.now());
        const versionData = await response.json();
        const latestVersion = versionData.version;
        const storedVersion = localStorage.getItem('app_version');

        // Compare versions
        if (storedVersion && latestVersion !== storedVersion) {
            showUpdateBanner(versionData.message || 'Eine neue Version ist verfügbar!');
            // Stop checking once update is detected
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
    // Check if banner already exists
    if (document.getElementById('update-banner')) {
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.className = 'fixed top-0 left-0 right-0 bg-indigo-600 text-white py-3 px-4 shadow-lg z-50 animate-slide-down';
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
                    <i class="fas fa-sync-alt mr-2"></i>
                    Jetzt aktualisieren
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
    const style = document.createElement('style');
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

    document.body.prepend(banner);

    // Add event listeners
    document.getElementById('update-reload-btn').addEventListener('click', async () => {
        // Update stored version BEFORE reload to prevent banner from showing again
        try {
            const response = await fetch('/version.json?' + Date.now());
            const versionData = await response.json();
            localStorage.setItem('app_version', versionData.version);
        } catch (error) {
            // If fetch fails, still reload
        }

        // Clear cache and reload
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name));
            }).then(() => {
                location.reload(true);
            });
        } else {
            location.reload(true);
        }
    });

    document.getElementById('update-dismiss-btn').addEventListener('click', async () => {
        // Update stored version to prevent banner from showing again
        try {
            const response = await fetch('/version.json?' + Date.now());
            const versionData = await response.json();
            localStorage.setItem('app_version', versionData.version);
        } catch (error) {
            // Silent fail
        }
        banner.remove();
    });
}

/**
 * Update version after successful reload
 */
function updateStoredVersion() {
    if (currentVersion) {
        localStorage.setItem('app_version', currentVersion);
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUpdateChecker);
} else {
    initializeUpdateChecker();
}

// Update stored version on successful load
window.addEventListener('load', updateStoredVersion);

// Export for manual checks if needed
window.checkForUpdates = checkForUpdates;
