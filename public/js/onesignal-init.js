/**
 * OneSignal Push Notifications Integration
 *
 * Setup:
 * 1. Create account at https://onesignal.com
 * 2. Create new Web Push app
 * 3. Replace YOUR_ONESIGNAL_APP_ID below with your App ID
 * 4. In OneSignal dashboard, set:
 *    - Site URL: https://sc-champions.de
 *    - Default icon: /icons/icon-192x192.png
 */

// Replace with your OneSignal App ID from the dashboard
const ONESIGNAL_APP_ID = 'YOUR_ONESIGNAL_APP_ID';

let isOneSignalInitialized = false;

/**
 * Initialize OneSignal
 * Call this early in your app initialization
 */
export async function initOneSignal() {
    if (isOneSignalInitialized) return;
    if (typeof window === 'undefined') return;

    // Don't init on native apps (they use FCM directly)
    if (window.CapacitorUtils?.isNative()) {
        console.log('[OneSignal] Skipping - running in native app');
        return;
    }

    // Check if OneSignal SDK is loaded
    if (!window.OneSignalDeferred) {
        console.warn('[OneSignal] SDK not loaded');
        return;
    }

    try {
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal) {
            await OneSignal.init({
                appId: ONESIGNAL_APP_ID,
                // Safari web push requires this
                safari_web_id: undefined,
                // Auto resubscribe returning users
                autoResubscribe: true,
                // DISABLE all automatic prompts - we use our own UI
                autoRegister: false,
                notifyButton: {
                    enable: false
                },
                promptOptions: {
                    autoPrompt: false,
                    slidedown: {
                        enabled: false,
                        autoPrompt: false
                    }
                },
                // Welcome notification after opt-in
                welcomeNotification: {
                    disable: true
                },
                // Service worker settings
                serviceWorkerPath: '/OneSignalSDKWorker.js',
                serviceWorkerParam: { scope: '/' }
            });

            isOneSignalInitialized = true;
            console.log('[OneSignal] Initialized successfully');

            // Listen for subscription changes
            OneSignal.User.PushSubscription.addEventListener('change', (event) => {
                console.log('[OneSignal] Subscription changed:', event.current);
                if (event.current.optedIn) {
                    // User opted in - save external ID
                    syncUserWithOneSignal();
                }
            });
        });
    } catch (error) {
        console.error('[OneSignal] Initialization error:', error);
    }
}

/**
 * Sync the current user with OneSignal
 * Call this after user logs in
 */
export async function syncUserWithOneSignal(userId, userEmail = null, userName = null) {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        // Set external user ID (your Supabase user ID)
        if (userId) {
            await window.OneSignal.login(userId);
            console.log('[OneSignal] User logged in:', userId);
        }

        // Set user tags for segmentation
        if (userEmail || userName) {
            await window.OneSignal.User.addTags({
                email: userEmail || '',
                name: userName || ''
            });
        }
    } catch (error) {
        console.error('[OneSignal] Error syncing user:', error);
    }
}

/**
 * Logout user from OneSignal
 * Call this when user logs out
 */
export async function logoutOneSignal() {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        await window.OneSignal.logout();
        console.log('[OneSignal] User logged out');
    } catch (error) {
        console.error('[OneSignal] Error logging out:', error);
    }
}

/**
 * Request push notification permission
 * Uses native browser permission (not OneSignal slidedown)
 */
export async function requestOneSignalPermission() {
    if (!isOneSignalInitialized || !window.OneSignal) {
        console.warn('[OneSignal] Not initialized');
        return false;
    }

    try {
        // Request native browser permission directly
        await window.OneSignal.Notifications.requestPermission();

        // Check if permission was granted
        const permission = await window.OneSignal.Notifications.permission;
        return permission;
    } catch (error) {
        console.error('[OneSignal] Error requesting permission:', error);
        return false;
    }
}

/**
 * Check if push notifications are enabled
 */
export async function isOneSignalEnabled() {
    if (!isOneSignalInitialized || !window.OneSignal) {
        return false;
    }

    try {
        const subscription = window.OneSignal.User.PushSubscription;
        return subscription.optedIn === true;
    } catch (error) {
        console.error('[OneSignal] Error checking status:', error);
        return false;
    }
}

/**
 * Get the current permission status
 * Returns: 'granted', 'denied', 'default', or 'unsupported'
 */
export async function getOneSignalPermissionStatus() {
    if (!window.OneSignal) {
        return 'unsupported';
    }

    try {
        return await window.OneSignal.Notifications.permission;
    } catch (error) {
        return 'unsupported';
    }
}

/**
 * Opt out of push notifications
 */
export async function optOutOneSignal() {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        await window.OneSignal.User.PushSubscription.optOut();
        console.log('[OneSignal] User opted out');
    } catch (error) {
        console.error('[OneSignal] Error opting out:', error);
    }
}

/**
 * Set notification tags for targeting
 * @param {Object} tags - Key-value pairs for targeting
 */
export async function setOneSignalTags(tags) {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        await window.OneSignal.User.addTags(tags);
        console.log('[OneSignal] Tags set:', tags);
    } catch (error) {
        console.error('[OneSignal] Error setting tags:', error);
    }
}

// Export a simple API
export default {
    init: initOneSignal,
    syncUser: syncUserWithOneSignal,
    logout: logoutOneSignal,
    requestPermission: requestOneSignalPermission,
    isEnabled: isOneSignalEnabled,
    getPermissionStatus: getOneSignalPermissionStatus,
    optOut: optOutOneSignal,
    setTags: setOneSignalTags
};
