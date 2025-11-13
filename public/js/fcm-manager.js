/**
 * Firebase Cloud Messaging Manager
 * Handles FCM token registration, push notification permissions, and token management
 */

import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging.js";
import { doc, setDoc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

class FCMManager {
    constructor(firebaseApp, db, auth) {
        this.app = firebaseApp;
        this.db = db;
        this.auth = auth;
        this.messaging = null;
        this.currentToken = null;
        this.vapidKey = 'YOUR_VAPID_KEY_HERE'; // TODO: Replace with actual VAPID key from Firebase Console

        try {
            this.messaging = getMessaging(this.app);
            this.setupForegroundMessageHandler();
        } catch (error) {
            console.warn('[FCM] Messaging not supported:', error);
        }
    }

    /**
     * Check if push notifications are supported
     */
    isSupported() {
        return 'Notification' in window &&
               'serviceWorker' in navigator &&
               this.messaging !== null;
    }

    /**
     * Get current notification permission status
     */
    getPermissionStatus() {
        if (!this.isSupported()) return 'unsupported';
        return Notification.permission;
    }

    /**
     * Request notification permission and get FCM token
     */
    async requestPermission() {
        if (!this.isSupported()) {
            throw new Error('Push notifications are not supported in this browser');
        }

        console.log('[FCM] Requesting notification permission...');

        try {
            // Register service worker
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            console.log('[FCM] Service Worker registered:', registration);

            // Wait for service worker to be ready
            await navigator.serviceWorker.ready;

            // Request notification permission
            const permission = await Notification.requestPermission();
            console.log('[FCM] Permission status:', permission);

            if (permission === 'granted') {
                // Get FCM token
                const token = await getToken(this.messaging, {
                    vapidKey: this.vapidKey,
                    serviceWorkerRegistration: registration
                });

                if (token) {
                    console.log('[FCM] Token obtained:', token);
                    this.currentToken = token;

                    // Save token to Firestore
                    await this.saveTokenToFirestore(token);

                    return { success: true, token };
                } else {
                    throw new Error('No registration token available');
                }
            } else {
                console.log('[FCM] Permission denied');
                return { success: false, reason: 'permission_denied' };
            }

        } catch (error) {
            console.error('[FCM] Error requesting permission:', error);
            throw error;
        }
    }

    /**
     * Save FCM token to Firestore
     */
    async saveTokenToFirestore(token) {
        const user = this.auth.currentUser;
        if (!user) {
            console.warn('[FCM] No user logged in, cannot save token');
            return;
        }

        try {
            const userRef = doc(this.db, 'users', user.uid);

            // Check if document exists
            const userDoc = await getDoc(userRef);

            if (userDoc.exists()) {
                // Update existing document
                await updateDoc(userRef, {
                    fcmToken: token,
                    fcmTokenUpdatedAt: new Date(),
                    notificationsEnabled: true
                });
            } else {
                // Create new document (shouldn't happen, but just in case)
                await setDoc(userRef, {
                    fcmToken: token,
                    fcmTokenUpdatedAt: new Date(),
                    notificationsEnabled: true
                }, { merge: true });
            }

            console.log('[FCM] Token saved to Firestore for user:', user.uid);

        } catch (error) {
            console.error('[FCM] Error saving token to Firestore:', error);
            throw error;
        }
    }

    /**
     * Delete FCM token from Firestore (when user disables notifications)
     */
    async deleteTokenFromFirestore() {
        const user = this.auth.currentUser;
        if (!user) return;

        try {
            const userRef = doc(this.db, 'users', user.uid);
            await updateDoc(userRef, {
                fcmToken: null,
                notificationsEnabled: false,
                fcmTokenUpdatedAt: new Date()
            });

            console.log('[FCM] Token deleted from Firestore');

        } catch (error) {
            console.error('[FCM] Error deleting token:', error);
            throw error;
        }
    }

    /**
     * Setup handler for foreground messages (when app is open)
     */
    setupForegroundMessageHandler() {
        if (!this.messaging) return;

        onMessage(this.messaging, (payload) => {
            console.log('[FCM] Foreground message received:', payload);

            // Show toast notification instead of browser notification when app is open
            if (window.notifications) {
                const title = payload.notification?.title || 'TTV Champions';
                const body = payload.notification?.body || 'Neue Benachrichtigung';

                window.notifications.info(`${title}: ${body}`, 6000);
            }

            // Trigger custom event for other parts of the app to listen to
            window.dispatchEvent(new CustomEvent('fcm-message', { detail: payload }));
        });
    }

    /**
     * Check if user has already granted permission and has a token
     */
    async checkExistingPermission() {
        if (!this.isSupported()) return false;

        const user = this.auth.currentUser;
        if (!user) return false;

        try {
            const userDoc = await getDoc(doc(this.db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                return data.notificationsEnabled === true && data.fcmToken;
            }
        } catch (error) {
            console.error('[FCM] Error checking existing permission:', error);
        }

        return false;
    }

    /**
     * Refresh FCM token (useful when token expires)
     */
    async refreshToken() {
        if (!this.isSupported() || !this.auth.currentUser) return;

        try {
            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(this.messaging, {
                vapidKey: this.vapidKey,
                serviceWorkerRegistration: registration
            });

            if (token && token !== this.currentToken) {
                this.currentToken = token;
                await this.saveTokenToFirestore(token);
                console.log('[FCM] Token refreshed');
            }

        } catch (error) {
            console.error('[FCM] Error refreshing token:', error);
        }
    }

    /**
     * Update notification preferences in Firestore
     */
    async updateNotificationPreferences(preferences) {
        const user = this.auth.currentUser;
        if (!user) return;

        try {
            const userRef = doc(this.db, 'users', user.uid);
            await updateDoc(userRef, {
                notificationPreferences: preferences,
                notificationPreferencesUpdatedAt: new Date()
            });

            console.log('[FCM] Notification preferences updated:', preferences);

        } catch (error) {
            console.error('[FCM] Error updating preferences:', error);
            throw error;
        }
    }

    /**
     * Get notification preferences from Firestore
     */
    async getNotificationPreferences() {
        const user = this.auth.currentUser;
        if (!user) return this.getDefaultPreferences();

        try {
            const userDoc = await getDoc(doc(this.db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                return data.notificationPreferences || this.getDefaultPreferences();
            }
        } catch (error) {
            console.error('[FCM] Error getting preferences:', error);
        }

        return this.getDefaultPreferences();
    }

    /**
     * Default notification preferences
     */
    getDefaultPreferences() {
        return {
            matchApproved: true,
            matchRequest: true,
            trainingReminder: true,
            challengeAvailable: true,
            rankUp: true,
            matchSuggestion: false
        };
    }
}

// Global instance
let fcmManagerInstance = null;

/**
 * Initialize FCM Manager
 */
export function initFCMManager(firebaseApp, db, auth) {
    if (!fcmManagerInstance) {
        fcmManagerInstance = new FCMManager(firebaseApp, db, auth);
    }
    return fcmManagerInstance;
}

/**
 * Get FCM Manager instance
 */
export function getFCMManager() {
    return fcmManagerInstance;
}

export default FCMManager;
