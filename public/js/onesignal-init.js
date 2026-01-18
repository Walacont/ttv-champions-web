/**
 * OneSignal Push-Benachrichtigungen Integration
 *
 * Setup im OneSignal Dashboard:
 * - Site URL: https://sc-champions.de
 * - Standard-Icon: /icons/icon-192x192.png
 */

const ONESIGNAL_APP_ID = '4cc26bd1-bfa5-4b18-bbf3-640f2db2435b';

let isOneSignalInitialized = false;
let initPromise = null;

/**
 * Warten bis Service Worker bereit ist
 */
async function waitForServiceWorkerReady() {
    if (!('serviceWorker' in navigator)) {
        return false;
    }
    try {
        const registration = await navigator.serviceWorker.ready;
        return !!registration;
    } catch (e) {
        console.warn('[OneSignal] Service Worker not ready:', e.message);
        return false;
    }
}

/**
 * OneSignal initialisieren - früh beim App-Start aufrufen
 */
export async function initOneSignal() {
    // Verhindert mehrfache gleichzeitige Initialisierung
    if (initPromise) return initPromise;
    if (isOneSignalInitialized) return Promise.resolve();
    if (typeof window === 'undefined') return Promise.resolve();

    // Native Apps verwenden FCM direkt statt OneSignal Web SDK
    if (window.CapacitorUtils?.isNative()) {
        console.log('[OneSignal] Skipping - running in native app');
        return Promise.resolve();
    }

    if (!window.OneSignalDeferred) {
        console.warn('[OneSignal] SDK not loaded - OneSignalDeferred missing');
        return Promise.resolve();
    }

    // Warten bis Service Worker bereit ist, um "context closed" Fehler zu vermeiden
    await waitForServiceWorkerReady();

    initPromise = new Promise((resolve, reject) => {
        try {
            console.log('[OneSignal] Starting initialization...');
            window.OneSignalDeferred.push(async function(OneSignal) {
                try {
                    console.log('[OneSignal] SDK loaded, calling init...');
                    await OneSignal.init({
                        appId: ONESIGNAL_APP_ID,
                        safari_web_id: undefined,
                        autoResubscribe: true,
                        // Alle automatischen Prompts deaktiviert - wir verwenden eigene UI
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
                        welcomeNotification: {
                            disable: true
                        },
                        serviceWorkerPath: '/OneSignalSDKWorker.js',
                        serviceWorkerParam: { scope: '/' }
                    });

                    isOneSignalInitialized = true;
                    console.log('[OneSignal] Initialized successfully');

                    OneSignal.User.PushSubscription.addEventListener('change', (event) => {
                        console.log('[OneSignal] Subscription changed:', event.current);
                        if (event.current.optedIn) {
                            syncUserWithOneSignal();
                        }
                    });

                    resolve();
                } catch (initError) {
                    console.error('[OneSignal] Init failed:', initError);
                    reject(initError);
                }
            });
        } catch (error) {
            console.error('[OneSignal] Initialization error:', error);
            reject(error);
        }
    });

    // Timeout verhindert endloses Warten falls SDK nicht lädt
    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            if (!isOneSignalInitialized) {
                console.warn('[OneSignal] Initialization timed out after 10s');
            }
            resolve();
        }, 10000);
    });

    return Promise.race([initPromise, timeoutPromise]);
}

/**
 * Benutzer mit OneSignal synchronisieren - nach Login aufrufen
 */
export async function syncUserWithOneSignal(userId, userEmail = null, userName = null) {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        // Verknüpft OneSignal-Subscription mit Supabase User-ID
        if (userId) {
            await window.OneSignal.login(userId);
            console.log('[OneSignal] User logged in:', userId);
        }

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
 * Benutzer von OneSignal abmelden - bei Logout aufrufen
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
 * Push-Benachrichtigungs-Berechtigung anfordern
 * Verwendet native Browser-API um OneSignal UI zu umgehen
 */
export async function requestOneSignalPermission() {
    if (!isOneSignalInitialized) {
        console.log('[OneSignal] Waiting for initialization before requesting permission...');
        await initOneSignal();
    }

    if (!isOneSignalInitialized || !window.OneSignal) {
        console.warn('[OneSignal] Not initialized after waiting');
        return false;
    }

    try {
        console.log('[OneSignal] Requesting permission...');

        // Native Browser-API vermeidet OneSignal's eigene Permission-Dialoge
        if ('Notification' in window) {
            console.log('[OneSignal] Current permission:', Notification.permission);
            const permission = await Notification.requestPermission();
            console.log('[OneSignal] Permission result:', permission);

            if (permission === 'granted') {
                // OneSignal über erteilte Berechtigung informieren und registrieren
                console.log('[OneSignal] Opting in to push subscription...');
                await window.OneSignal.User.PushSubscription.optIn();
                console.log('[OneSignal] Opted in successfully');
                return true;
            }
            return false;
        }
        console.warn('[OneSignal] Notification API not available');
        return false;
    } catch (error) {
        console.error('[OneSignal] Error requesting permission:', error);
        return false;
    }
}

/**
 * Prüft ob Push-Benachrichtigungen aktiviert sind
 */
export async function isOneSignalEnabled() {
    if (!isOneSignalInitialized && initPromise) {
        await initPromise;
    }

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
 * Gibt den aktuellen Berechtigungsstatus zurück
 * @returns {string} 'granted', 'denied', 'default' oder 'unsupported'
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
 * Push-Benachrichtigungen deaktivieren
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
 * Benachrichtigungs-Tags für Targeting setzen
 * @param {Object} tags - Key-Value-Paare für Segmentierung
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
