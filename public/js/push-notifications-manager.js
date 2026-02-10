// Push Notifications Manager - Unified OneSignal for native + web

import { getSupabase } from './supabase-init.js';
import {
    initOneSignal,
    syncUserWithOneSignal,
    requestOneSignalPermission,
    isOneSignalEnabled,
    optOutOneSignal,
    logoutOneSignal
} from './onesignal-init.js';

let currentUserId = null;

/**
 * Saves push subscription status to the profiles table so the DB trigger
 * knows this user has push notifications enabled.
 */
async function savePushTokenToProfile(userId, platform) {
    try {
        const db = getSupabase();
        if (!db || !userId) return;

        await db.from('profiles').update({
            fcm_token: `onesignal:${userId}`,
            fcm_token_updated_at: new Date().toISOString(),
            push_platform: platform,
            notifications_enabled: true
        }).eq('id', userId);

        console.log('[Push] Push token saved to profile for', platform);
    } catch (e) {
        console.error('[Push] Error saving push token to profile:', e);
    }
}

/**
 * Initialisiert Push-Benachrichtigungen für einen angemeldeten Benutzer
 * @param {string} userId - Benutzer-ID
 */
export async function initPushNotifications(userId) {
    if (!userId) return;
    currentUserId = userId;

    if (window.CapacitorUtils?.isNative()) {
        // Native: OneSignal login via Capacitor plugin
        if (window.CapacitorUtils.loginOneSignal) {
            await window.CapacitorUtils.loginOneSignal(userId);
        }

        // Always save push token on native - OneSignal handles FCM internally
        // and hasPermission() can return stale false on some Android versions
        const platform = window.CapacitorUtils.getPlatform();
        await savePushTokenToProfile(userId, platform);

        // Listen for foreground notifications (in-app toast)
        window.addEventListener('push-notification-received', (event) => {
            const notification = event.detail;
            showInAppNotification(notification);
        });
    } else {
        // Web/PWA: OneSignal Web SDK
        await initOneSignal();
        const db = getSupabase();
        if (db) {
            const { data: profile } = await db
                .from('profiles')
                .select('display_name, email')
                .eq('id', userId)
                .single();

            if (profile) {
                await syncUserWithOneSignal(userId, profile.email, profile.display_name);
            } else {
                await syncUserWithOneSignal(userId);
            }
        }

        // Save push token if permission already granted
        const webEnabled = await isOneSignalEnabled();
        if (webEnabled) {
            await savePushTokenToProfile(userId, 'web');
        }
    }
}

/**
 * Fordert Berechtigung für Push-Benachrichtigungen an
 * @returns {Promise<boolean>} - Ob die Berechtigung erteilt wurde
 */
export async function requestPushPermission() {
    console.log('[Push] requestPushPermission called');

    try {
        if (window.CapacitorUtils?.isNative()) {
            console.log('[Push] Calling CapacitorUtils.requestPushPermission...');
            const granted = await window.CapacitorUtils.requestPushPermission();
            console.log('[Push] Permission result:', granted);
            if (granted && currentUserId) {
                const platform = window.CapacitorUtils.getPlatform();
                await savePushTokenToProfile(currentUserId, platform);
            }
            return granted;
        }

        console.log('[Push] Using OneSignal for PWA...');
        const granted = await requestOneSignalPermission();
        console.log('[Push] OneSignal permission result:', granted);
        if (granted && currentUserId) {
            await savePushTokenToProfile(currentUserId, 'web');
        }
        return granted;
    } catch (e) {
        console.error('[Push] Error in requestPushPermission:', e);
        return false;
    }
}

/**
 * Prüft, ob Push-Benachrichtigungen aktiviert sind
 * @returns {Promise<boolean>}
 */
export async function isPushEnabled() {
    if (window.CapacitorUtils?.isNative()) {
        return await window.CapacitorUtils?.isPushEnabled() || false;
    }

    return await isOneSignalEnabled();
}

/**
 * Deaktiviert Push-Benachrichtigungen für den Benutzer
 */
export async function disablePushNotifications() {
    if (!currentUserId) return;

    try {
        if (window.CapacitorUtils?.isNative()) {
            // Native OneSignal - opt out
            var OneSignal = window._oneSignalNative;
            if (OneSignal) {
                try {
                    OneSignal.User.pushSubscription.optOut();
                } catch (e) {
                    console.error('[Push] OneSignal optOut error:', e);
                }
            }
        } else {
            // PWA verwendet OneSignal Web Opt-Out
            await optOutOneSignal();
        }

        localStorage.removeItem('onesignal_push_granted');
        console.log('[Push] Notifications disabled');
    } catch (e) {
        console.error('[Push] Error disabling notifications:', e);
    }
}

/**
 * Aktualisiert Benachrichtigungseinstellungen
 * @param {Object} preferences - Benachrichtigungseinstellungen
 */
export async function updateNotificationPreferences(preferences) {
    if (!currentUserId) return;

    try {
        const db = getSupabase();
        if (!db) return;

        await db
            .from('profiles')
            .update({
                notification_preferences: preferences,
                notification_preferences_updated_at: new Date().toISOString()
            })
            .eq('id', currentUserId);

        console.log('[Push] Preferences updated');
    } catch (e) {
        console.error('[Push] Error updating preferences:', e);
    }
}

/**
 * Gibt die Benachrichtigungseinstellungen zurück
 * @returns {Promise<Object>}
 */
export async function getNotificationPreferences() {
    if (!currentUserId) return getDefaultPreferences();

    try {
        const db = getSupabase();
        if (!db) return getDefaultPreferences();

        const { data, error } = await db
            .from('profiles')
            .select('notification_preferences, notifications_enabled')
            .eq('id', currentUserId)
            .single();

        if (error || !data) return getDefaultPreferences();

        return {
            enabled: data.notifications_enabled ?? true,
            ...getDefaultPreferences(),
            ...data.notification_preferences
        };
    } catch (e) {
        console.error('[Push] Error getting preferences:', e);
        return getDefaultPreferences();
    }
}

/**
 * Gibt Standard-Benachrichtigungseinstellungen zurück
 */
function getDefaultPreferences() {
    return {
        enabled: true,
        match_requests: true,
        doubles_match_requests: true,
        friend_requests: true,
        club_requests: true,
        ranking_changes: true,
        training_reminders: true,
        points_awarded: false,
        video_feedback: true
    };
}

/**
 * Zeigt In-App-Benachrichtigung bei Push im Vordergrund
 * @param {Object} notification - Benachrichtigungsobjekt
 */
function showInAppNotification(notification) {
    const title = notification.title || 'SC Champions';
    const body = notification.body || '';

    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 left-4 sm:left-auto sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 transform translate-y-0 opacity-100 transition-all duration-300';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="flex-shrink-0">
                <div class="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-bell text-indigo-600"></i>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 text-sm">${escapeHtml(title)}</p>
                <p class="text-gray-600 text-sm mt-0.5 line-clamp-2">${escapeHtml(body)}</p>
            </div>
            <button class="flex-shrink-0 text-gray-400 hover:text-gray-600" onclick="this.closest('.fixed').remove()">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Safe Area Padding für native Apps (wegen Notch/Statusleiste)
    if (window.CapacitorUtils?.isNative()) {
        toast.style.marginTop = 'max(env(safe-area-inset-top, 16px), 16px)';
    }

    document.body.appendChild(toast);

    // Automatisches Entfernen nach 5 Sekunden
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);

    toast.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;

        const data = notification.data;
        if (data?.type === 'match_request' || data?.type === 'doubles_match_request') {
            window.location.href = '/dashboard.html#matches';
        } else if (data?.type === 'follow_request' && data?.requester_id) {
            window.location.href = `/profile.html?id=${data.requester_id}`;
        } else if (data?.url) {
            window.location.href = data.url;
        }

        toast.remove();
    });
}

/**
 * Escapet HTML zur XSS-Prävention
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Zeigt Berechtigungsdialog für Push-Benachrichtigungen
 * @returns {Promise<boolean>} - Ob Benachrichtigungen aktiviert wurden
 */
export async function showPushPermissionPrompt() {
    return new Promise((resolve) => {
        if (!window.CapacitorUtils?.isNative() && 'Notification' in window) {
            if (Notification.permission === 'granted') {
                resolve(true);
                return;
            }
            if (Notification.permission === 'denied') {
                resolve(false);
                return;
            }
        }

        const modal = document.createElement('div');
        modal.id = 'push-permission-modal';
        modal.className = 'fixed inset-0 flex items-center justify-center p-4';
        modal.style.cssText = 'z-index: 9999; background: rgba(0,0,0,0.5);';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
                <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-bell text-indigo-600 text-2xl"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-900 mb-2">Push-Benachrichtigungen aktivieren?</h3>
                <p class="text-gray-600 mb-6">
                    Erhalte Benachrichtigungen für Spielanfragen, Freundschaftsanfragen und Ranglistenänderungen.
                </p>
                <div class="flex flex-col gap-3">
                    <button id="enable-push-btn" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition">
                        <i class="fas fa-bell mr-2"></i>Aktivieren
                    </button>
                    <button id="skip-push-btn" class="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-xl transition">
                        Später
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('enable-push-btn').addEventListener('click', async () => {
            console.log('[Push] Enable button clicked');
            modal.remove();
            try {
                const granted = await requestPushPermission();
                console.log('[Push] Permission granted:', granted);
                if (granted) {
                    localStorage.setItem('onesignal_push_granted', 'true');
                }
                resolve(granted);
            } catch (e) {
                console.error('[Push] Error after enable button click:', e);
                resolve(false);
            }
        });

        document.getElementById('skip-push-btn').addEventListener('click', () => {
            modal.remove();
            localStorage.setItem('push_prompt_skipped', Date.now().toString());
            const currentCount = parseInt(localStorage.getItem('push_prompt_skip_count') || '0');
            localStorage.setItem('push_prompt_skip_count', (currentCount + 1).toString());
            resolve(false);
        });
    });
}

/**
 * Prüft, ob Push-Benachrichtigungen unterstützt werden (nur PWA oder native App)
 * @returns {boolean}
 */
export function isPushSupported() {
    if (window.CapacitorUtils?.isNative()) return true;
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true;
    return false;
}

/**
 * Prüft, ob der Berechtigungsdialog angezeigt werden soll
 * @returns {Promise<boolean>}
 */
export async function shouldShowPushPrompt() {
    if (!isPushSupported()) return false;

    // If push was already granted, never show the prompt
    if (localStorage.getItem('onesignal_push_granted') === 'true') return false;

    const dismissedPermanently = localStorage.getItem('push_prompt_dismissed_permanently');
    if (dismissedPermanently === 'true') return false;

    const skippedTime = localStorage.getItem('push_prompt_skipped');
    const skipCount = parseInt(localStorage.getItem('push_prompt_skip_count') || '0');

    if (skippedTime) {
        const daysSinceSkip = (Date.now() - parseInt(skippedTime)) / (1000 * 60 * 60 * 24);
        if (skipCount >= 3) {
            localStorage.setItem('push_prompt_dismissed_permanently', 'true');
            return false;
        }
        const waitDays = skipCount === 0 ? 7 : skipCount === 1 ? 14 : 30;
        if (daysSinceSkip < waitDays) return false;
    }

    if (window.CapacitorUtils?.isNative()) {
        try {
            const isEnabled = await window.CapacitorUtils.isPushEnabled();
            if (isEnabled) return false;
        } catch (e) {
            // Bei Fehler trotzdem Dialog anzeigen
        }
    } else {
        const isEnabled = await isOneSignalEnabled();
        if (isEnabled) return false;

        if ('Notification' in window && Notification.permission === 'denied') {
            return false;
        }
    }

    return true;
}

/**
 * Meldet Benutzer von Push-Benachrichtigungen ab
 */
export async function logoutPushNotifications() {
    currentUserId = null;

    if (window.CapacitorUtils?.isNative()) {
        if (window.CapacitorUtils.logoutOneSignal) {
            await window.CapacitorUtils.logoutOneSignal();
        }
    } else {
        await logoutOneSignal();
    }
}
