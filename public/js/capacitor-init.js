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

        // Verzögert initialisieren, damit alle anderen Features bereit sind
        setTimeout(() => {
            initializePushNotifications().catch(e => {
                console.error('[Push] Failed to initialize:', e);
            });
        }, 1000);
    }

    /** Prüft ob Firebase/FCM korrekt konfiguriert ist */
    function isFirebaseAvailable() {
        try {
            // Check native-side flag first (set by MainActivity)
            if (window.__firebaseAvailable === false) return false;
            return window.Capacitor?.Plugins?.PushNotifications != null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Sichere Registrierung - fängt native Crashes ab.
     * Verwendet einen Timeout als Schutz, da native Firebase-Fehler
     * auf einem separaten Thread auftreten und die JS-Promise nie resolved wird.
     */
    async function safeRegister(PushNotifications) {
        // Skip if Firebase is known to be unavailable
        if (window.__firebaseAvailable === false) {
            console.log('[Push] Skipping register - Firebase not available');
            window._pushNotificationsUnavailable = true;
            return false;
        }

        // Auf Android prüfen ob Firebase verfügbar ist
        const platform = window.Capacitor?.getPlatform();
        if (platform === 'android') {
            try {
                // Kurzer Test: checkPermissions funktioniert ohne Firebase
                // Wenn das Plugin grundsätzlich nicht antwortet, ist etwas falsch
                const testResult = await Promise.race([
                    PushNotifications.checkPermissions(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Plugin timeout')), 3000)
                    )
                ]);
                console.log('[Push] Plugin health check passed:', JSON.stringify(testResult));
            } catch (healthError) {
                console.error('[Push] Plugin health check failed:', healthError);
                window._pushNotificationsUnavailable = true;
                return false;
            }
        }

        try {
            // register() mit Timeout absichern - wenn Firebase nicht initialisiert ist,
            // crasht der native Thread und die Promise wird nie aufgelöst
            await Promise.race([
                PushNotifications.register(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Registration timeout - Firebase may not be configured')), 5000)
                )
            ]);
            console.log('[Push] Registration call completed');
            return true;
        } catch (regError) {
            const errorMsg = regError?.message || JSON.stringify(regError) || 'Unknown error';
            console.error('[Push] Registration failed:', errorMsg);
            if (errorMsg.includes('Firebase') || errorMsg.includes('Default') ||
                errorMsg.includes('IllegalState') || errorMsg.includes('timeout')) {
                console.error('[Push] Firebase ist nicht konfiguriert. google-services.json fehlt im Android-Projekt.');
                window._pushNotificationsUnavailable = true;
            }
            return false;
        }
    }

    /** Initialisiert Push-Benachrichtigungen für native Apps */
    async function initializePushNotifications() {
        console.log('[Push] Initializing push notifications...');

        // Check if Firebase is available before touching PushNotifications plugin
        if (window.__firebaseAvailable === false) {
            console.log('[Push] Firebase not available (google-services.json missing), skipping push init');
            window._pushNotificationsUnavailable = true;
            return;
        }

        const Plugins = getPlugins();
        const PushNotifications = Plugins.PushNotifications;

        if (!PushNotifications) {
            console.log('[Push] PushNotifications plugin not available');
            return;
        }

        try {
            console.log('[Push] PushNotifications plugin loaded');

            let permStatus;
            try {
                permStatus = await PushNotifications.checkPermissions();
                console.log('[Push] Initial permission status:', JSON.stringify(permStatus));
            } catch (e) {
                console.error('[Push] Error checking permissions:', e);
                window._pushNotificationsUnavailable = true;
                return;
            }

            try {
                await PushNotifications.addListener('registration', (token) => {
                    console.log('[Push] Registration successful!');
                    const tokenValue = token?.value || '';
                    console.log('[Push] Token received:', tokenValue ? tokenValue.substring(0, 30) + '...' : 'empty');
                    // Token wird beim Login in Supabase gespeichert
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

            try {
                await PushNotifications.addListener('registrationError', (error) => {
                    console.error('[Push] Registration error:', JSON.stringify(error));
                });
            } catch (e) {
                console.error('[Push] Error adding registrationError listener:', e);
            }

            try {
                await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                    console.log('[Push] Notification received in foreground:', JSON.stringify(notification));
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

            try {
                await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
                    console.log('[Push] Notification action performed:', JSON.stringify(action));
                    const data = action?.notification?.data;

                    // Immer zum Spieler-Dashboard (nicht Coach-Dashboard), außer bei Club-Anfragen
                    if (data?.type === 'match_request' || data?.type === 'doubles_match_request') {
                        window.location.href = '/dashboard.html?tab=matches&scrollTo=pending-requests-section';
                    } else if (data?.type === 'follow_request' || data?.type === 'friend_request') {
                        if (data?.requester_id) {
                            window.location.href = `/profile.html?id=${data.requester_id}`;
                        } else {
                            window.location.href = '/dashboard.html?scrollTo=pending-follow-requests-section';
                        }
                    } else if (data?.type === 'club_join_request' || data?.type === 'club_leave_request') {
                        // Club-Anfragen weiterhin zum Coach-Dashboard
                        window.location.href = '/coach.html?tab=club&scrollTo=club-join-requests-list';
                    } else if (data?.url) {
                        window.location.href = data.url;
                    } else {
                        window.location.href = '/dashboard.html?tab=matches';
                    }
                });
            } catch (e) {
                console.error('[Push] Error adding pushNotificationActionPerformed listener:', e);
            }

            console.log('[Push] All listeners registered');

            // Sofort registrieren wenn Berechtigung bereits erteilt, um Token zu erhalten
            if (permStatus && permStatus.receive === 'granted') {
                console.log('[Push] Permission already granted, registering to get token...');
                await safeRegister(PushNotifications);
            } else {
                console.log('[Push] Permission not yet granted, status:', permStatus?.receive);
            }

            console.log('[Push] Push notifications initialized successfully');
        } catch (e) {
            console.error('[Push] Push notifications initialization failed:', e);
        }
    }

    window.CapacitorUtils = {
        isNative: () => isCapacitor,
        getPlatform: () => (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        /** Fordert Push-Benachrichtigungs-Berechtigung an */
        async requestPushPermission() {
            console.log('[Push] requestPushPermission called, isCapacitor:', isCapacitor);

            // Prüfen ob Push als nicht verfügbar markiert wurde (z.B. Firebase fehlt)
            if (window._pushNotificationsUnavailable) {
                console.warn('[Push] Push notifications unavailable (Firebase nicht konfiguriert)');
                return false;
            }

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

                const permStatus = await PushNotifications.checkPermissions();
                console.log('[Push] Current permission status:', JSON.stringify(permStatus));

                if (permStatus.receive === 'granted') {
                    console.log('[Push] Already granted, registering...');
                    const registered = await safeRegister(PushNotifications);
                    return registered;
                }

                // Ab Android 13+ wird der System-Dialog angezeigt
                console.log('[Push] Requesting permission...');
                const result = await PushNotifications.requestPermissions();
                console.log('[Push] Permission request result:', JSON.stringify(result));

                if (result.receive === 'granted') {
                    console.log('[Push] Permission granted, registering...');
                    const registered = await safeRegister(PushNotifications);
                    return registered;
                }

                console.log('[Push] Permission not granted:', result.receive);
                return false;
            } catch (e) {
                console.error('[Push] Error requesting permission:', e);
                return false;
            }
        },

        /** Gibt das aktuelle Push-Token zurück */
        getPushToken() {
            return window.pushToken || null;
        },

        /** Prüft ob Push-Benachrichtigungen aktiviert sind */
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
