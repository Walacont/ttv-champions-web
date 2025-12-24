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

    // Helper function to get plugins safely
    function getPlugins() {
        try {
            return window.Capacitor?.Plugins || {};
        } catch (e) {
            console.error('[Capacitor] Error accessing plugins:', e);
            return {};
        }
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
        const Plugins = getPlugins();
        const { SplashScreen, StatusBar, App, Keyboard } = Plugins;

        // Configure Status Bar
        if (StatusBar) {
            try {
                await StatusBar.setBackgroundColor({ color: '#1e3a5f' });
                await StatusBar.setStyle({ style: 'LIGHT' });
                console.log('[Capacitor] Status bar configured');
            } catch (e) {
                console.log('[Capacitor] Status bar not available:', e.message);
            }
        }

        // Handle keyboard events
        if (Keyboard) {
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
        }

        // Handle app state changes
        if (App) {
            try {
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
                    try {
                        const url = new URL(event.url);
                        // Handle the deep link - navigate to the appropriate page
                        if (url.pathname) {
                            window.location.href = url.pathname;
                        }
                    } catch (e) {
                        console.error('[Capacitor] Error parsing deep link:', e);
                    }
                });
            } catch (e) {
                console.log('[Capacitor] App plugin error:', e.message);
            }
        }

        // Hide splash screen after content is ready
        if (SplashScreen) {
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
        }

        // Initialize Push Notifications (delayed to ensure everything is ready)
        setTimeout(() => {
            initializePushNotifications().catch(e => {
                console.error('[Push] Failed to initialize:', e);
            });
        }, 1000);
    }

    /**
     * Initialize Push Notifications for native apps
     */
    async function initializePushNotifications() {
        console.log('[Push] Initializing push notifications...');

        const Plugins = getPlugins();
        const PushNotifications = Plugins.PushNotifications;

        if (!PushNotifications) {
            console.log('[Push] PushNotifications plugin not available');
            return;
        }

        try {
            console.log('[Push] PushNotifications plugin loaded');

            // Check current permission status
            let permStatus;
            try {
                permStatus = await PushNotifications.checkPermissions();
                console.log('[Push] Initial permission status:', JSON.stringify(permStatus));
            } catch (e) {
                console.error('[Push] Error checking permissions:', e);
                return;
            }

            // Listen for registration success
            try {
                await PushNotifications.addListener('registration', (token) => {
                    console.log('[Push] Registration successful!');
                    const tokenValue = token?.value || '';
                    console.log('[Push] Token received:', tokenValue ? tokenValue.substring(0, 30) + '...' : 'empty');
                    // Store token for later use - will be saved to Supabase when user logs in
                    window.pushToken = tokenValue;
                    try {
                        window.dispatchEvent(new CustomEvent('push-token-received', { detail: { token: tokenValue } }));
                    } catch (e) {
                        console.error('[Push] Error dispatching token event:', e);
                    }
                });
            } catch (e) {
                console.error('[Push] Error adding registration listener:', e);
            }

            // Listen for registration errors
            try {
                await PushNotifications.addListener('registrationError', (error) => {
                    console.error('[Push] Registration error:', JSON.stringify(error));
                });
            } catch (e) {
                console.error('[Push] Error adding registrationError listener:', e);
            }

            // Listen for push notifications received while app is in foreground
            try {
                await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                    console.log('[Push] Notification received in foreground:', JSON.stringify(notification));
                    // Show in-app notification toast
                    try {
                        window.dispatchEvent(new CustomEvent('push-notification-received', {
                            detail: notification
                        }));
                    } catch (e) {
                        console.error('[Push] Error dispatching notification event:', e);
                    }
                });
            } catch (e) {
                console.error('[Push] Error adding pushNotificationReceived listener:', e);
            }

            // Listen for notification actions (when user taps on notification)
            try {
                await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                    console.log('[Push] Notification action performed:', JSON.stringify(action));
                    const data = action?.notification?.data;

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
            } catch (e) {
                console.error('[Push] Error adding pushNotificationActionPerformed listener:', e);
            }

            console.log('[Push] All listeners registered');

            // If permission is already granted, register immediately to get token
            if (permStatus && permStatus.receive === 'granted') {
                console.log('[Push] Permission already granted, registering to get token...');
                try {
                    await PushNotifications.register();
                    console.log('[Push] Registration call completed');
                } catch (regError) {
                    console.error('[Push] Registration failed:', regError);
                }
            } else {
                console.log('[Push] Permission not yet granted, status:', permStatus?.receive);
            }

            console.log('[Push] Push notifications initialized successfully');
        } catch (e) {
            console.error('[Push] Push notifications initialization failed:', e);
        }
    }

    // Expose utility functions
    window.CapacitorUtils = {
        isNative: () => isCapacitor,
        getPlatform: () => (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        // Request push notification permission
        async requestPushPermission() {
            console.log('[Push] requestPushPermission called, isCapacitor:', isCapacitor);

            if (!isCapacitor) {
                console.log('[Push] Not running in Capacitor, using web notifications');
                return await requestWebPushPermission();
            }

            const Plugins = getPlugins();
            const PushNotifications = Plugins.PushNotifications;

            if (!PushNotifications) {
                console.error('[Push] PushNotifications plugin not available');
                return false;
            }

            try {
                console.log('[Push] PushNotifications module loaded');

                // Check current permission status
                const permStatus = await PushNotifications.checkPermissions();
                console.log('[Push] Current permission status:', JSON.stringify(permStatus));

                // If already granted, just register
                if (permStatus.receive === 'granted') {
                    console.log('[Push] Already granted, registering...');
                    await PushNotifications.register();
                    return true;
                }

                // For any other status (prompt, denied, or unknown), try to request permission
                // On Android 13+, this will show the system permission dialog
                console.log('[Push] Requesting permission...');
                const result = await PushNotifications.requestPermissions();
                console.log('[Push] Permission request result:', JSON.stringify(result));

                if (result.receive === 'granted') {
                    console.log('[Push] Permission granted, registering...');
                    await PushNotifications.register();
                    return true;
                }

                console.log('[Push] Permission not granted:', result.receive);
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

            const Plugins = getPlugins();
            const PushNotifications = Plugins.PushNotifications;
            if (!PushNotifications) return false;

            try {
                const permStatus = await PushNotifications.checkPermissions();
                return permStatus.receive === 'granted';
            } catch (e) {
                return false;
            }
        },

        // Haptic feedback
        async vibrate(style = 'medium') {
            if (!isCapacitor) return;

            const Plugins = getPlugins();
            const Haptics = Plugins.Haptics;
            if (!Haptics) return;

            try {
                const impactStyle = {
                    light: 'LIGHT',
                    medium: 'MEDIUM',
                    heavy: 'HEAVY'
                }[style] || 'MEDIUM';

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

            const Plugins = getPlugins();
            const Preferences = Plugins.Preferences;
            if (!Preferences) {
                localStorage.setItem(key, JSON.stringify(value));
                return;
            }

            try {
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

            const Plugins = getPlugins();
            const Preferences = Plugins.Preferences;
            if (!Preferences) {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            }

            try {
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
