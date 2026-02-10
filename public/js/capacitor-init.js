// Capacitor-Integration für native Apps

(function () {
    'use strict';

    const isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();

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

    function getPlugins() {
        try {
            return window.Capacitor?.Plugins || {};
        } catch (e) {
            console.error('[Capacitor] Error accessing plugins:', e);
            return {};
        }
    }

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

        if (StatusBar) {
            try {
                await StatusBar.setBackgroundColor({ color: '#1e3a5f' });
                await StatusBar.setStyle({ style: 'LIGHT' });
                console.log('[Capacitor] Status bar configured');
            } catch (e) {
                console.log('[Capacitor] Status bar not available:', e.message);
            }
        }

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

        if (App) {
            try {
                App.addListener('appStateChange', ({ isActive }) => {
                    console.log('[Capacitor] App state changed, active:', isActive);
                    if (isActive) {
                        // Event für Datenaktualisierung nach App-Resume
                        window.dispatchEvent(new CustomEvent('app-resumed'));
                    }
                });

                // Android-spezifisch: Hardware-Zurück-Button
                App.addListener('backButton', ({ canGoBack }) => {
                    if (canGoBack) {
                        window.history.back();
                    } else {
                        if (confirm('App beenden?')) {
                            App.exitApp();
                        }
                    }
                });

                App.addListener('appUrlOpen', (event) => {
                    console.log('[Capacitor] Deep link opened:', event.url);
                    try {
                        const url = new URL(event.url);
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

        // Splash screen: wait for page to signal readiness via hideSplash()
        // Safety timeout: hide after 10s max to prevent stuck splash
        if (SplashScreen) {
            window.__splashHidden = false;
            window.hideSplash = async function() {
                if (window.__splashHidden) return;
                window.__splashHidden = true;
                try {
                    await SplashScreen.hide({ fadeOutDuration: 300 });
                    console.log('[Capacitor] Splash screen hidden by page');
                } catch (e) {
                    console.log('[Capacitor] Splash screen hide error:', e.message);
                }
            };
            setTimeout(function() {
                if (!window.__splashHidden) {
                    console.warn('[Capacitor] Splash screen safety timeout, force-hiding');
                    window.hideSplash();
                }
            }, 10000);
        }

        // OneSignal Push-Benachrichtigungen initialisieren
        setTimeout(() => {
            initializeOneSignalPush().catch(e => {
                console.error('[Push] Failed to initialize OneSignal:', e);
            });
        }, 1000);
    }

    const ONESIGNAL_APP_ID = '4cc26bd1-bfa5-4b18-bbf3-640f2db2435b';

    /** Findet den OneSignal Plugin-Zugriff */
    function findOneSignalPlugin() {
        // Try all known locations where the Cordova plugin may be registered
        if (window.plugins?.OneSignal) return window.plugins.OneSignal;
        if (window.OneSignalPlugin) return window.OneSignalPlugin;
        if (window.cordova?.plugins?.OneSignal) return window.cordova.plugins.OneSignal;
        // OneSignal Cordova SDK v5 registers as window.OneSignalCordova
        if (window.OneSignalCordova) return window.OneSignalCordova;
        // Some versions register on window directly
        if (window.OneSignal && window.OneSignal.initialize) return window.OneSignal;
        return null;
    }

    /** Initialisiert OneSignal Push-Benachrichtigungen für native Apps */
    async function initializeOneSignalPush() {
        // Guard: use sessionStorage so it survives full page navigations within session
        if (sessionStorage.getItem('onesignal_init_done')) {
            console.log('[Push] Already initialized, skipping');
            return;
        }

        console.log('[Push] Initializing OneSignal push notifications...');
        console.log('[Push] Available: window.plugins=', typeof window.plugins,
            'window.OneSignal=', typeof window.OneSignal,
            'window.cordova=', typeof window.cordova,
            'window.OneSignalPlugin=', typeof window.OneSignalPlugin);

        try {
            var OneSignal = findOneSignalPlugin();

            if (!OneSignal) {
                console.warn('[Push] OneSignal plugin not available, retrying in 2s...');
                await new Promise(r => setTimeout(r, 2000));
                OneSignal = findOneSignalPlugin();
            }

            if (!OneSignal) {
                console.warn('[Push] Still not available, retrying in 3s...');
                await new Promise(r => setTimeout(r, 3000));
                OneSignal = findOneSignalPlugin();
            }

            if (!OneSignal) {
                console.error('[Push] OneSignal plugin not found after retries.');
                console.error('[Push] window.plugins keys:', window.plugins ? Object.keys(window.plugins) : 'none');
                console.error('[Push] window.cordova?.plugins keys:', window.cordova?.plugins ? Object.keys(window.cordova.plugins) : 'none');
                window._pushNotificationsUnavailable = true;
                return;
            }

            console.log('[Push] OneSignal plugin found, initializing with App ID:', ONESIGNAL_APP_ID);

            // Initialize OneSignal
            OneSignal.initialize(ONESIGNAL_APP_ID);

            // Listen for notification clicks
            OneSignal.Notifications.addEventListener('click', (event) => {
                console.log('[Push] Notification clicked:', JSON.stringify(event));
                const data = event.notification?.additionalData || {};
                handleNotificationAction(data);
            });

            // Listen for foreground notifications
            OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
                console.log('[Push] Notification received in foreground:', JSON.stringify(event.getNotification()));
                const notification = event.getNotification();
                // Show in-app toast
                try {
                    window.dispatchEvent(new CustomEvent('push-notification-received', {
                        detail: {
                            title: notification.title,
                            body: notification.body,
                            data: notification.additionalData || {}
                        }
                    }));
                } catch (e) {
                    console.error('[Push] Error dispatching notification event:', e);
                }
                // Let OneSignal display the notification
                event.preventDefault();
                event.getNotification().display();
            });

            // Check current permission status
            var hasPermission = OneSignal.Notifications.hasPermission();
            console.log('[Push] OneSignal permission status:', hasPermission);
            if (hasPermission) {
                localStorage.setItem('onesignal_push_granted', 'true');
            }

            // Store OneSignal reference for later use
            window._oneSignalNative = OneSignal;
            window._pushNotificationsAvailable = true;
            sessionStorage.setItem('onesignal_init_done', 'true');

            console.log('[Push] OneSignal push notifications initialized successfully');
        } catch (e) {
            console.error('[Push] OneSignal initialization failed:', e);
            window._pushNotificationsUnavailable = true;
        }
    }

    /** Navigiert basierend auf Notification-Daten */
    function handleNotificationAction(data) {
        if (data?.type === 'match_request' || data?.type === 'doubles_match_request') {
            window.location.href = '/dashboard.html?tab=matches&scrollTo=pending-requests-section';
        } else if (data?.type === 'follow_request' || data?.type === 'friend_request') {
            if (data?.requester_id) {
                window.location.href = '/profile.html?id=' + data.requester_id;
            } else {
                window.location.href = '/dashboard.html?scrollTo=pending-follow-requests-section';
            }
        } else if (data?.type === 'club_join_request' || data?.type === 'club_leave_request') {
            window.location.href = '/coach.html?tab=club&scrollTo=club-join-requests-list';
        } else if (data?.url) {
            window.location.href = data.url;
        } else {
            window.location.href = '/dashboard.html?tab=matches';
        }
    }

    window.CapacitorUtils = {
        isNative: () => isCapacitor,
        getPlatform: () => (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        /** Fordert Push-Benachrichtigungs-Berechtigung an (OneSignal) */
        async requestPushPermission() {
            console.log('[Push] requestPushPermission called');

            if (window._pushNotificationsUnavailable) {
                console.warn('[Push] Push notifications unavailable');
                return false;
            }

            if (!isCapacitor) {
                return await requestWebPushPermission();
            }

            var OneSignal = window._oneSignalNative || findOneSignalPlugin();
            if (!OneSignal) {
                console.error('[Push] OneSignal not initialized');
                return false;
            }

            try {
                var hasPermission = OneSignal.Notifications.hasPermission();
                if (hasPermission) {
                    console.log('[Push] Already has permission');
                    localStorage.setItem('onesignal_push_granted', 'true');
                    return true;
                }

                console.log('[Push] Requesting OneSignal permission...');
                var granted = await OneSignal.Notifications.requestPermission(true);
                console.log('[Push] Permission result:', granted);
                if (granted) {
                    localStorage.setItem('onesignal_push_granted', 'true');
                }
                return granted;
            } catch (e) {
                console.error('[Push] Error requesting permission:', e);
                return false;
            }
        },

        /** Prüft ob Push-Benachrichtigungen aktiviert sind */
        async isPushEnabled() {
            if (!isCapacitor) {
                return 'Notification' in window && Notification.permission === 'granted';
            }

            var OneSignal = window._oneSignalNative || findOneSignalPlugin();
            if (OneSignal) {
                try {
                    var hasPermission = OneSignal.Notifications.hasPermission();
                    if (hasPermission) {
                        localStorage.setItem('onesignal_push_granted', 'true');
                        return true;
                    }
                } catch (e) {
                    // fall through to localStorage check
                }
            }

            // Fallback: check localStorage flag set when permission was granted
            // OneSignal.Notifications.hasPermission() can return false due to timing issues
            return localStorage.getItem('onesignal_push_granted') === 'true';
        },

        /** Login bei OneSignal mit User-ID (für Targeting) */
        async loginOneSignal(userId) {
            var OneSignal = window._oneSignalNative || findOneSignalPlugin();
            if (!OneSignal || !userId) return;

            try {
                await OneSignal.login(userId);
                console.log('[Push] OneSignal user logged in:', userId);

                // Check and request permission
                var hasPermission = OneSignal.Notifications.hasPermission();
                console.log('[Push] hasPermission after login:', hasPermission);

                if (!hasPermission) {
                    console.log('[Push] Requesting push permission...');
                    try {
                        var granted = await OneSignal.Notifications.requestPermission(true);
                        console.log('[Push] requestPermission result:', granted);
                        if (granted) {
                            localStorage.setItem('onesignal_push_granted', 'true');
                        }
                    } catch (e) {
                        console.error('[Push] requestPermission error:', e);
                    }
                } else {
                    localStorage.setItem('onesignal_push_granted', 'true');
                }
            } catch (e) {
                console.error('[Push] OneSignal login error:', e);
            }
        },

        /** Logout bei OneSignal */
        async logoutOneSignal() {
            var OneSignal = window._oneSignalNative || findOneSignalPlugin();
            if (!OneSignal) return;

            try {
                await OneSignal.logout();
                console.log('[Push] OneSignal user logged out');
            } catch (e) {
                console.error('[Push] OneSignal logout error:', e);
            }
        },

        /** Haptisches Feedback (Vibration) */
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

        /** Daten speichern (Preferences API oder localStorage als Fallback) */
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

        /** Daten abrufen (Preferences API oder localStorage als Fallback) */
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

    /** Fordert Web-Push-Berechtigung an (für PWA/Browser) */
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
