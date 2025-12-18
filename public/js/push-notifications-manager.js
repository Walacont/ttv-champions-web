// Push Notifications Manager
// Handles FCM token registration with Supabase and notification preferences

import { getSupabase } from './supabase-init.js';

let currentUserId = null;
let tokenSaveTimeout = null;

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
    const granted = await window.CapacitorUtils?.requestPushPermission();

    if (granted && currentUserId) {
        // Token will be received via the event listener
        console.log('[Push] Permission granted, waiting for token...');
    }

    return granted;
}

/**
 * Check if push notifications are enabled
 * @returns {Promise<boolean>}
 */
export async function isPushEnabled() {
    return await window.CapacitorUtils?.isPushEnabled() || false;
}

/**
 * Disable push notifications for this user
 */
export async function disablePushNotifications() {
    if (!currentUserId) return;

    try {
        const db = getSupabase();
        if (!db) return;

        await db
            .from('profiles')
            .update({
                fcm_token: null,
                notifications_enabled: false
            })
            .eq('id', currentUserId);

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
            modal.remove();
            const granted = await requestPushPermission();
            resolve(granted);
        });

        // Handle skip button
        document.getElementById('skip-push-btn').addEventListener('click', () => {
            modal.remove();
            // Store that user skipped, don't ask again for a while
            localStorage.setItem('push_prompt_skipped', Date.now().toString());
            resolve(false);
        });
    });
}

/**
 * Check if we should show the push permission prompt
 * @returns {boolean}
 */
export function shouldShowPushPrompt() {
    // Don't show if already enabled
    if (window.pushToken) return false;

    // Check if user recently skipped
    const skippedTime = localStorage.getItem('push_prompt_skipped');
    if (skippedTime) {
        const daysSinceSkip = (Date.now() - parseInt(skippedTime)) / (1000 * 60 * 60 * 24);
        if (daysSinceSkip < 7) return false; // Don't ask again for 7 days
    }

    // Check if permission was already denied (web only)
    if (!window.CapacitorUtils?.isNative() && 'Notification' in window) {
        if (Notification.permission === 'denied') return false;
        if (Notification.permission === 'granted') return false;
    }

    return true;
}
