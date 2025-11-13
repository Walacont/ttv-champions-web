/**
 * Initialize Push Notifications
 * Easy integration helper for push notifications
 */

import { initFCMManager, getFCMManager } from './fcm-manager.js';
import NotificationPermissionDialog from './notification-permission-dialog.js';

/**
 * Initialize push notifications for a user
 * @param {Object} firebaseApp - Firebase app instance
 * @param {Object} db - Firestore instance
 * @param {Object} auth - Firebase Auth instance
 * @param {Object} options - Configuration options
 */
export async function initPushNotifications(firebaseApp, db, auth, options = {}) {
    const {
        autoPrompt = false,        // Automatically show permission dialog
        promptDelay = 3000,         // Delay before showing dialog (ms)
        showOnlyOnce = true,        // Only show dialog once per session
        onPermissionGranted = null, // Callback when permission granted
        onPermissionDenied = null   // Callback when permission denied
    } = options;

    // Initialize FCM Manager
    const fcmManager = initFCMManager(firebaseApp, db, auth);

    // Check if supported
    if (!fcmManager.isSupported()) {
        console.log('[Notifications] Push notifications not supported in this browser');
        return { supported: false };
    }

    // Check if user is logged in
    if (!auth.currentUser) {
        console.log('[Notifications] User not logged in, skipping initialization');
        return { supported: true, loggedIn: false };
    }

    // Check existing permission
    const hasExisting = await fcmManager.checkExistingPermission();
    const permissionStatus = fcmManager.getPermissionStatus();

    console.log('[Notifications] Permission status:', permissionStatus);
    console.log('[Notifications] Has existing token:', hasExisting);

    // If already granted and has token, we're done
    if (permissionStatus === 'granted' && hasExisting) {
        console.log('[Notifications] Already enabled');
        return { supported: true, enabled: true, status: 'already_enabled' };
    }

    // If permission granted but no token, get the token silently
    if (permissionStatus === 'granted' && !hasExisting) {
        console.log('[Notifications] Permission granted but no token, requesting token...');
        try {
            const result = await fcmManager.requestPermission();
            if (result.success) {
                console.log('[Notifications] Token obtained silently');
                if (onPermissionGranted) {
                    onPermissionGranted(result.token);
                }
                return { supported: true, enabled: true, status: 'token_obtained' };
            }
        } catch (error) {
            console.error('[Notifications] Error getting token:', error);
        }
    }

    // If explicitly denied, don't prompt again
    if (permissionStatus === 'denied') {
        console.log('[Notifications] Permission denied by user');
        return { supported: true, enabled: false, status: 'denied' };
    }

    // Auto-prompt if enabled
    if (autoPrompt && permissionStatus === 'default') {
        // Check if we've already shown the dialog this session
        if (showOnlyOnce && sessionStorage.getItem('notification-dialog-shown')) {
            return { supported: true, enabled: false, status: 'already_prompted' };
        }

        // Show dialog after delay
        setTimeout(() => {
            showNotificationPermissionDialog(fcmManager, {
                onPermissionGranted,
                onPermissionDenied
            });
        }, promptDelay);

        // Mark as shown
        if (showOnlyOnce) {
            sessionStorage.setItem('notification-dialog-shown', 'true');
        }
    }

    return { supported: true, enabled: false, status: 'initialized' };
}

/**
 * Show notification permission dialog
 * @param {Object} fcmManager - FCM Manager instance
 * @param {Object} callbacks - Callbacks for permission events
 */
export function showNotificationPermissionDialog(fcmManager, callbacks = {}) {
    const { onPermissionGranted, onPermissionDenied } = callbacks;

    window.notificationPermissionDialog.show({
        onAccept: async () => {
            console.log('[Notifications] User accepted');

            // Show loading toast
            const loader = window.notifications ?
                window.notifications.loading('Aktiviere Benachrichtigungen...') :
                null;

            try {
                const result = await fcmManager.requestPermission();

                if (result.success) {
                    console.log('[Notifications] Permission granted, token:', result.token);

                    if (loader) {
                        loader.success('Benachrichtigungen aktiviert! 🔔');
                    }

                    if (onPermissionGranted) {
                        onPermissionGranted(result.token);
                    }

                } else {
                    console.log('[Notifications] Permission not granted:', result.reason);

                    if (loader) {
                        loader.error('Benachrichtigungen konnten nicht aktiviert werden');
                    }

                    if (onPermissionDenied) {
                        onPermissionDenied(result.reason);
                    }
                }

            } catch (error) {
                console.error('[Notifications] Error requesting permission:', error);

                if (loader) {
                    loader.error('Fehler beim Aktivieren der Benachrichtigungen');
                }

                if (onPermissionDenied) {
                    onPermissionDenied(error);
                }
            }
        },

        onDecline: () => {
            console.log('[Notifications] User declined');

            if (onPermissionDenied) {
                onPermissionDenied('user_declined');
            }
        }
    });
}

/**
 * Manually trigger notification permission request
 * (for use in settings page)
 */
export async function requestNotificationPermission() {
    const fcmManager = getFCMManager();

    if (!fcmManager) {
        console.error('[Notifications] FCM Manager not initialized');
        return { success: false, reason: 'not_initialized' };
    }

    if (!fcmManager.isSupported()) {
        return { success: false, reason: 'not_supported' };
    }

    return new Promise((resolve) => {
        showNotificationPermissionDialog(fcmManager, {
            onPermissionGranted: (token) => {
                resolve({ success: true, token });
            },
            onPermissionDenied: (reason) => {
                resolve({ success: false, reason });
            }
        });
    });
}

/**
 * Disable notifications (delete token)
 */
export async function disableNotifications() {
    const fcmManager = getFCMManager();

    if (!fcmManager) {
        console.error('[Notifications] FCM Manager not initialized');
        return false;
    }

    try {
        await fcmManager.deleteTokenFromFirestore();
        console.log('[Notifications] Notifications disabled');
        return true;
    } catch (error) {
        console.error('[Notifications] Error disabling notifications:', error);
        return false;
    }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(preferences) {
    const fcmManager = getFCMManager();

    if (!fcmManager) {
        console.error('[Notifications] FCM Manager not initialized');
        return false;
    }

    try {
        await fcmManager.updateNotificationPreferences(preferences);
        console.log('[Notifications] Preferences updated:', preferences);
        return true;
    } catch (error) {
        console.error('[Notifications] Error updating preferences:', error);
        return false;
    }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences() {
    const fcmManager = getFCMManager();

    if (!fcmManager) {
        console.error('[Notifications] FCM Manager not initialized');
        return null;
    }

    return await fcmManager.getNotificationPreferences();
}

/**
 * Get notification status
 */
export function getNotificationStatus() {
    const fcmManager = getFCMManager();

    if (!fcmManager) {
        return { initialized: false };
    }

    return {
        initialized: true,
        supported: fcmManager.isSupported(),
        permission: fcmManager.getPermissionStatus()
    };
}

export default {
    initPushNotifications,
    showNotificationPermissionDialog,
    requestNotificationPermission,
    disableNotifications,
    updateNotificationPreferences,
    getNotificationPreferences,
    getNotificationStatus
};
