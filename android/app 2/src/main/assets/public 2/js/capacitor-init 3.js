// Capacitor Native Integration
// This file initializes Capacitor plugins when running as a native app

(function () {
    'use strict';

    // Check if running in Capacitor
    const isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();

    // Add platform classes to HTML element immediately
    if (isCapacitor) {
        const platform = window.Capacitor.getPlatform();
        document.documentElement.classList.add('plt-capacitor');
        document.documentElement.classList.add('plt-' + platform);
        console.log('[Capacitor] Running as native app on', platform);
    } else {
        document.documentElement.classList.add('plt-web');
        console.log('[Capacitor] Running in browser mode');
        return;
    }

    // Wait for Capacitor plugins to be ready
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await initializeNativeFeatures();
        } catch (error) {
            console.error('[Capacitor] Initialization error:', error);
        }
    });

    async function initializeNativeFeatures() {
        // Import Capacitor plugins dynamically
        const { SplashScreen } = await import('@capacitor/splash-screen');
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        const { App } = await import('@capacitor/app');
        const { Keyboard } = await import('@capacitor/keyboard');

        // Configure Status Bar
        try {
            await StatusBar.setBackgroundColor({ color: '#1e3a5f' });
            await StatusBar.setStyle({ style: Style.Light });
            console.log('[Capacitor] Status bar configured');
        } catch (e) {
            console.log('[Capacitor] Status bar not available:', e.message);
        }

        // Handle keyboard events
        try {
            Keyboard.addListener('keyboardWillShow', (info) => {
                document.body.classList.add('keyboard-visible');
                document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
            });

            Keyboard.addListener('keyboardWillHide', () => {
                document.body.classList.remove('keyboard-visible');
                document.body.style.removeProperty('--keyboard-height');
            });
            console.log('[Capacitor] Keyboard listeners configured');
        } catch (e) {
            console.log('[Capacitor] Keyboard not available:', e.message);
        }

        // Handle app state changes
        App.addListener('appStateChange', ({ isActive }) => {
            console.log('[Capacitor] App state changed, active:', isActive);
            if (isActive) {
                // App came to foreground - refresh data if needed
                window.dispatchEvent(new CustomEvent('app-resumed'));
            }
        });

        // Handle back button (Android)
        App.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack) {
                window.history.back();
            } else {
                // Ask user if they want to exit
                if (confirm('App beenden?')) {
                    App.exitApp();
                }
            }
        });

        // Handle deep links
        App.addListener('appUrlOpen', (event) => {
            console.log('[Capacitor] Deep link opened:', event.url);
            const url = new URL(event.url);
            // Handle the deep link - navigate to the appropriate page
            if (url.pathname) {
                window.location.href = url.pathname;
            }
        });

        // Hide splash screen after content is ready
        setTimeout(async () => {
            try {
                await SplashScreen.hide({
                    fadeOutDuration: 300
                });
                console.log('[Capacitor] Splash screen hidden');
            } catch (e) {
                console.log('[Capacitor] Splash screen error:', e.message);
            }
        }, 500);

        // Initialize Push Notifications
        await initializePushNotifications();
    }

    /**
     * Initialize Push Notifications for native apps
     */
    async function initializePushNotifications() {
        try {
            const { PushNotifications } = await import('@capacitor/push-notifications');

            // Check current permission status
            const permStatus = await PushNotifications.checkPermissions();
            console.log('[Push] Current permission status:', permStatus.receive);

            // Listen for registration success
            PushNotifications.addListener('registration', async (token) => {
                console.log('[Push] Registration successful, token:', token.value.substring(0, 20) + '...');
                // Store token for later use - will be saved to Supabase when user logs in
                window.pushToken = token.value;
                window.dispatchEvent(new CustomEvent('push-token-received', { detail: { token: token.value } }));
            });

            // Listen for registration errors
            PushNotifications.addListener('registrationError', (error) => {
                console.error('[Push] Registration error:', error);
            });

            // Listen for push notifications received while app is in foreground
            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[Push] Notification received in foreground:', notification);
                // Show in-app notification toast
                window.dispatchEvent(new CustomEvent('push-notification-received', {
                    detail: notification
                }));
            });

            // Listen for notification actions (when user taps on notification)
            PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                console.log('[Push] Notification action performed:', action);
                const data = action.notification.data;

                // Handle navigation based on notification type
                if (data?.type === 'match_request') {
                    window.location.href = '/dashboard.html#matches';
                } else if (data?.type === 'doubles_match_request') {
                    window.location.href = '/dashboard.html#matches';
                } else if (data?.type === 'follow_request' || data?.type === 'friend_request') {
                    if (data?.requester_id) {
                        window.location.href = `/profile.html?id=${data.requester_id}`;
                    }
                } else if (data?.type === 'club_join_request' || data?.type === 'club_leave_request') {
                    window.location.href = '/coach.html#club';
                } else if (data?.url) {
                    window.location.href = data.url;
                }
            });

            // If permission is already granted, register immediately
            if (permStatus.receive === 'granted') {
                await PushNotifications.register();
                console.log('[Push] Already permitted, registering...');
            }

            console.log('[Push] Push notifications initialized');
        } catch (e) {
            console.log('[Push] Push notifications not available:', e.message);
        }
    }

    // Expose utility functions
    window.CapacitorUtils = {
        isNative: () => isCapacitor,
        getPlatform: () => (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        // Request push notification permission
        async requestPushPermission() {
            if (!isCapacitor) {
                console.log('[Push] Not running in Capacitor, using web notifications');
                return await requestWebPushPermission();
            }
            try {
                const { PushNotifications } = await import('@capacitor/push-notifications');
                const permStatus = await PushNotifications.checkPermissions();

                if (permStatus.receive === 'prompt') {
                    const result = await PushNotifications.requestPermissions();
                    if (result.receive === 'granted') {
                        await PushNotifications.register();
                        return true;
                    }
                    return false;
                } else if (permStatus.receive === 'granted') {
                    await PushNotifications.register();
                    return true;
                }
                return false;
            } catch (e) {
                console.error('[Push] Error requesting permission:', e);
                return false;
            }
        },

        // Get current push token
        getPushToken() {
            return window.pushToken || null;
        },

        // Check if push notifications are enabled
        async isPushEnabled() {
            if (!isCapacitor) {
                return 'Notification' in window && Notification.permission === 'granted';
            }
            try {
                const { PushNotifications } = await import('@capacitor/push-notifications');
                const permStatus = await PushNotifications.checkPermissions();
                return permStatus.receive === 'granted';
            } catch (e) {
                return false;
            }
        },

        // Haptic feedback
        async vibrate(style = 'medium') {
            if (!isCapacitor) return;
            try {
                const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
                const impactStyle =
                    {
                        light: ImpactStyle.Light,
                        medium: ImpactStyle.Medium,
                        heavy: ImpactStyle.Heavy
                    }[style] || ImpactStyle.Medium;

                await Haptics.impact({ style: impactStyle });
            } catch (e) {
                console.log('[Capacitor] Haptics not available');
            }
        },

        // Store/retrieve data
        async setItem(key, value) {
            if (!isCapacitor) {
                localStorage.setItem(key, JSON.stringify(value));
                return;
            }
            try {
                const { Preferences } = await import('@capacitor/preferences');
                await Preferences.set({ key, value: JSON.stringify(value) });
            } catch (e) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        },

        async getItem(key) {
            if (!isCapacitor) {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            }
            try {
                const { Preferences } = await import('@capacitor/preferences');
                const { value } = await Preferences.get({ key });
                return value ? JSON.parse(value) : null;
            } catch (e) {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            }
        }
    };

    /**
     * Request web push notification permission (for PWA/browser)
     */
    async function requestWebPushPermission() {
        if (!('Notification' in window)) {
            console.log('[Push] Web notifications not supported');
            return false;
        }

        if (Notification.permission === 'granted') {
            return true;
        }

        if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }

        return false;
    }
})();
