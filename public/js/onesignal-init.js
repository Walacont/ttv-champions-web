// OneSignal Push-Benachrichtigungen für PWA

const ONESIGNAL_APP_ID = '4cc26bd1-bfa5-4b18-bbf3-640f2db2435b';

let isOneSignalInitialized = false;
let initPromise = null;

export async function initOneSignal() {
    if (initPromise) return initPromise;
    if (isOneSignalInitialized) return Promise.resolve();
    if (typeof window === 'undefined') return Promise.resolve();

    if (!window.OneSignalDeferred) {
        console.warn('[OneSignal] SDK nicht geladen');
        return Promise.resolve();
    }

    initPromise = new Promise((resolve, reject) => {
        try {
            console.log('[OneSignal] Initialisierung gestartet...');
            window.OneSignalDeferred.push(async function(OneSignal) {
                try {
                    await OneSignal.init({
                        appId: ONESIGNAL_APP_ID,
                        safari_web_id: undefined,
                        autoResubscribe: true,
                        autoRegister: false,
                        notifyButton: { enable: false },
                        promptOptions: {
                            autoPrompt: false,
                            slidedown: { enabled: false, autoPrompt: false }
                        },
                        welcomeNotification: { disable: true },
                        serviceWorkerPath: '/OneSignalSDKWorker.js',
                        serviceWorkerParam: { scope: '/' }
                    });

                    isOneSignalInitialized = true;
                    console.log('[OneSignal] Erfolgreich initialisiert');

                    OneSignal.User.PushSubscription.addEventListener('change', (event) => {
                        console.log('[OneSignal] Subscription geändert:', event.current);
                        if (event.current.optedIn) {
                            syncUserWithOneSignal();
                        }
                    });

                    resolve();
                } catch (initError) {
                    console.error('[OneSignal] Init fehlgeschlagen:', initError);
                    reject(initError);
                }
            });
        } catch (error) {
            console.error('[OneSignal] Initialisierungsfehler:', error);
            reject(error);
        }
    });

    const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
            if (!isOneSignalInitialized) {
                console.warn('[OneSignal] Timeout nach 10s');
            }
            resolve();
        }, 10000);
    });

    return Promise.race([initPromise, timeoutPromise]);
}

export async function syncUserWithOneSignal(userId, userEmail = null, userName = null) {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        if (userId) {
            await window.OneSignal.login(userId);
            console.log('[OneSignal] User angemeldet:', userId);
        }

        if (userEmail || userName) {
            await window.OneSignal.User.addTags({
                email: userEmail || '',
                name: userName || ''
            });
        }
    } catch (error) {
        console.error('[OneSignal] Fehler beim User-Sync:', error);
    }
}

export async function logoutOneSignal() {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        await window.OneSignal.logout();
        console.log('[OneSignal] User abgemeldet');
    } catch (error) {
        console.error('[OneSignal] Fehler beim Abmelden:', error);
    }
}

export async function requestOneSignalPermission() {
    if (!isOneSignalInitialized) {
        console.log('[OneSignal] Warte auf Initialisierung...');
        await initOneSignal();
    }

    if (!isOneSignalInitialized || !window.OneSignal) {
        console.warn('[OneSignal] Nicht initialisiert');
        return false;
    }

    try {
        console.log('[OneSignal] Berechtigung wird angefordert...');

        if ('Notification' in window) {
            console.log('[OneSignal] Aktuelle Berechtigung:', Notification.permission);
            const permission = await Notification.requestPermission();
            console.log('[OneSignal] Berechtigung erhalten:', permission);

            if (permission === 'granted') {
                console.log('[OneSignal] Opt-In wird durchgeführt...');
                await window.OneSignal.User.PushSubscription.optIn();
                console.log('[OneSignal] Opt-In erfolgreich');
                return true;
            }
            return false;
        }
        console.warn('[OneSignal] Notification API nicht verfügbar');
        return false;
    } catch (error) {
        console.error('[OneSignal] Fehler bei Berechtigungsanfrage:', error);
        return false;
    }
}

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
        console.error('[OneSignal] Fehler beim Status-Check:', error);
        return false;
    }
}

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

export async function optOutOneSignal() {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        await window.OneSignal.User.PushSubscription.optOut();
        console.log('[OneSignal] User hat sich abgemeldet');
    } catch (error) {
        console.error('[OneSignal] Fehler beim Opt-Out:', error);
    }
}

export async function setOneSignalTags(tags) {
    if (!isOneSignalInitialized || !window.OneSignal) return;

    try {
        await window.OneSignal.User.addTags(tags);
        console.log('[OneSignal] Tags gesetzt:', tags);
    } catch (error) {
        console.error('[OneSignal] Fehler beim Setzen der Tags:', error);
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
