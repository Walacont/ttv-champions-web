// Push Notifications Manager
// Handles FCM token registration with Supabase and notification preferences
// Also handles Web Push API for PWA

import { getSupabase } from './supabase-init.js';

let currentUserId = null;
let tokenSaveTimeout = null;

// VAPID Public Key for Web Push
// Generate with: npx web-push generate-vapid-keys
// Store the private key in Supabase Edge Function secrets as VAPID_PRIVATE_KEY
const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

/**
 * Initialize push notifications for a logged-in user
 * @param {string} userId - The user's ID
 */
export async function initPushNotifications(userId) {
    if (!userId) return;
    currentUserId = userId;

    // Check if we already have a token waiting
    if (window.pushToken) {
        await savePushToken(window.pushToken);
    }

    // Listen for new tokens
    window.addEventListener('push-token-received', async (event) => {
        const token = event.detail?.token;
        if (token && currentUserId) {
            await savePushToken(token);
        }
    });

    // Listen for push notifications in foreground
    window.addEventListener('push-notification-received', (event) => {
        const notification = event.detail;
        showInAppNotification(notification);
    });
}

/**
 * Save push token to Supabase
 * @param {string} token - The FCM/APNs token
 */
async function savePushToken(token) {
    if (!currentUserId || !token) return;

    // Debounce token saves to avoid multiple updates
    if (tokenSaveTimeout) {
        clearTimeout(tokenSaveTimeout);
    }

    tokenSaveTimeout = setTimeout(async () => {
        try {
            const db = getSupabase();
            if (!db) return;

            const platform = window.CapacitorUtils?.getPlatform() || 'web';

            const { error } = await db
                .from('profiles')
                .update({
                    fcm_token: token,
                    fcm_token_updated_at: new Date().toISOString(),
                    push_platform: platform,
                    notifications_enabled: true
                })
                .eq('id', currentUserId);

            if (error) {
                console.error('[Push] Error saving token:', error);
            } else {
                console.log('[Push] Token saved successfully for platform:', platform);
            }
        } catch (e) {
            console.error('[Push] Error saving token:', e);
        }
    }, 1000);
}

/**
 * Request push notification permission and register
 * @returns {Promise<boolean>} - Whether permission was granted
 */
export async function requestPushPermission() {
    console.log('[Push] requestPushPermission called');

    try {
        // For native apps, use Capacitor
        if (window.CapacitorUtils?.isNative()) {
            console.log('[Push] Calling CapacitorUtils.requestPushPermission...');
            const granted = await window.CapacitorUtils.requestPushPermission();
            console.log('[Push] Permission result:', granted);

            if (granted && currentUserId) {
                // Token will be received via the event listener
                console.log('[Push] Permission granted, waiting for token...');
            }

            return granted;
        }

        // For PWA/Web, use Web Push API
        console.log('[Push] Using Web Push API for PWA...');
        return await requestWebPushPermission();
    } catch (e) {
        console.error('[Push] Error in requestPushPermission:', e);
        return false;
    }
}

/**
 * Request Web Push permission for PWA
 * @returns {Promise<boolean>} - Whether permission was granted
 */
async function requestWebPushPermission() {
    // Check if Web Push is supported
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] Web Push not supported in this browser');
        return false;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    console.log('[Push] Notification permission:', permission);

    if (permission !== 'granted') {
        return false;
    }

    try {
        // Get service worker registration
        const registration = await navigator.serviceWorker.ready;
        console.log('[Push] Service worker ready');

        // Check for existing subscription
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
            // Create new subscription
            console.log('[Push] Creating new Web Push subscription...');
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
            console.log('[Push] New subscription created');
        } else {
            console.log('[Push] Existing subscription found');
        }

        // Save subscription to Supabase
        await saveWebPushSubscription(subscription);
        return true;
    } catch (error) {
        console.error('[Push] Web Push subscription error:', error);
        return false;
    }
}

/**
 * Save Web Push subscription to Supabase
 * @param {PushSubscription} subscription - The Web Push subscription
 */
async function saveWebPushSubscription(subscription) {
    if (!currentUserId) {
        console.error('[Push] No user ID for saving subscription');
        return;
    }

    try {
        const db = getSupabase();
        if (!db) return;

        const subscriptionJSON = subscription.toJSON();

        const { error } = await db
            .from('push_subscriptions')
            .upsert({
                user_id: currentUserId,
                endpoint: subscription.endpoint,
                p256dh: subscriptionJSON.keys.p256dh,
                auth: subscriptionJSON.keys.auth,
                user_agent: navigator.userAgent,
                is_active: true
            }, {
                onConflict: 'endpoint'
            });

        if (error) {
            console.error('[Push] Error saving Web Push subscription:', error);
        } else {
            console.log('[Push] Web Push subscription saved to database');
        }
    } catch (e) {
        console.error('[Push] Error saving Web Push subscription:', e);
    }
}

/**
 * Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * Check if push notifications are enabled
 * @returns {Promise<boolean>}
 */
export async function isPushEnabled() {
    // For native apps, use Capacitor
    if (window.CapacitorUtils?.isNative()) {
        return await window.CapacitorUtils?.isPushEnabled() || false;
    }

    // For PWA/Web, check Web Push subscription
    return await isWebPushEnabled();
}

/**
 * Check if Web Push is enabled for PWA
 * @returns {Promise<boolean>}
 */
async function isWebPushEnabled() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        return false;
    }

    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return false;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        return !!subscription;
    } catch (error) {
        console.error('[Push] Error checking Web Push status:', error);
        return false;
    }
}

/**
 * Disable push notifications for this user
 */
export async function disablePushNotifications() {
    if (!currentUserId) return;

    try {
        const db = getSupabase();
        if (!db) return;

        // For native apps
        if (window.CapacitorUtils?.isNative()) {
            await db
                .from('profiles')
                .update({
                    fcm_token: null,
                    notifications_enabled: false
                })
                .eq('id', currentUserId);
        }

        // For Web Push - unsubscribe and remove from database
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.getSubscription();

                if (subscription) {
                    // Remove from database
                    await db
                        .from('push_subscriptions')
                        .delete()
                        .eq('endpoint', subscription.endpoint);

                    // Unsubscribe from push
                    await subscription.unsubscribe();
                    console.log('[Push] Web Push unsubscribed');
                }
            } catch (webPushError) {
                console.error('[Push] Error unsubscribing from Web Push:', webPushError);
            }
        }

        console.log('[Push] Notifications disabled');
    } catch (e) {
        console.error('[Push] Error disabling notifications:', e);
    }
}

/**
 * Update notification preferences
 * @param {Object} preferences - Notification preferences object
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
 * Get notification preferences
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
 * Get default notification preferences
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
        points_awarded: false
    };
}

/**
 * Show in-app notification when a push is received in foreground
 * @param {Object} notification - The notification object
 */
function showInAppNotification(notification) {
    const title = notification.title || 'SC Champions';
    const body = notification.body || '';

    // Create toast notification
    const toast = document.createElement('div');
    toast.className = 'fixed top-4 right-4 left-4 sm:left-auto sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-[9999] transform translate-y-0 opacity-100 transition-all duration-300';
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

    // Add safe area padding on native apps
    if (window.CapacitorUtils?.isNative()) {
        toast.style.marginTop = 'max(env(safe-area-inset-top, 16px), 16px)';
    }

    document.body.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);

    // Handle click to navigate
    toast.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Don't navigate if clicking close button

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
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show push notification permission prompt
 * @returns {Promise<boolean>} - Whether user enabled notifications
 */
export async function showPushPermissionPrompt() {
    return new Promise((resolve) => {
        // Check if already enabled or denied
        if (window.CapacitorUtils?.isNative()) {
            // For native, we'll show the prompt
        } else if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                resolve(true);
                return;
            }
            if (Notification.permission === 'denied') {
                resolve(false);
                return;
            }
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'push-permission-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4';
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

        // Handle enable button
        document.getElementById('enable-push-btn').addEventListener('click', async () => {
            console.log('[Push] Enable button clicked');
            modal.remove();
            try {
                const granted = await requestPushPermission();
                console.log('[Push] Permission granted:', granted);
                resolve(granted);
            } catch (e) {
                console.error('[Push] Error after enable button click:', e);
                resolve(false);
            }
        });

        // Handle skip button
        document.getElementById('skip-push-btn').addEventListener('click', () => {
            modal.remove();
            // Store that user skipped, increment counter
            localStorage.setItem('push_prompt_skipped', Date.now().toString());
            const currentCount = parseInt(localStorage.getItem('push_prompt_skip_count') || '0');
            localStorage.setItem('push_prompt_skip_count', (currentCount + 1).toString());
            resolve(false);
        });
    });
}

/**
 * Check if we should show the push permission prompt
 * @returns {Promise<boolean>}
 */
export async function shouldShowPushPrompt() {
    // Don't show if already have a token (native)
    if (window.pushToken) return false;

    // Check if user permanently dismissed (clicked "Später" 3 times or "Nicht mehr fragen")
    const dismissedPermanently = localStorage.getItem('push_prompt_dismissed_permanently');
    if (dismissedPermanently === 'true') return false;

    // Check if user recently skipped
    const skippedTime = localStorage.getItem('push_prompt_skipped');
    const skipCount = parseInt(localStorage.getItem('push_prompt_skip_count') || '0');

    if (skippedTime) {
        const daysSinceSkip = (Date.now() - parseInt(skippedTime)) / (1000 * 60 * 60 * 24);
        // After 3 skips, don't ask again (user clearly doesn't want it)
        if (skipCount >= 3) {
            localStorage.setItem('push_prompt_dismissed_permanently', 'true');
            return false;
        }
        // Wait longer each time (7 days, then 14, then 30)
        const waitDays = skipCount === 0 ? 7 : skipCount === 1 ? 14 : 30;
        if (daysSinceSkip < waitDays) return false;
    }

    // For native apps, check if push is already enabled
    if (window.CapacitorUtils?.isNative()) {
        try {
            const isEnabled = await window.CapacitorUtils.isPushEnabled();
            if (isEnabled) return false;
        } catch (e) {
            // Continue to show prompt if check fails
        }
    } else {
        // For PWA/Web - check Web Push status
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            // Web Push not supported, don't show prompt
            return false;
        }

        // Check if permission was already denied or granted
        if ('Notification' in window) {
            if (Notification.permission === 'denied') return false;
            if (Notification.permission === 'granted') {
                // Check if already subscribed
                try {
                    const registration = await navigator.serviceWorker.ready;
                    const subscription = await registration.pushManager.getSubscription();
                    if (subscription) return false;
                } catch (e) {
                    // Continue to show prompt if check fails
                }
            }
        }
    }

    return true;
}
