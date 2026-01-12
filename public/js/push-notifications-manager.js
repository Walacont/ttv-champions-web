// Push Notifications Manager - verwaltet OneSignal für PWA

import { getFirebaseInstance } from './firebase-init.js';
import { doc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    initOneSignal,
    syncUserWithOneSignal,
    requestOneSignalPermission,
    isOneSignalEnabled,
    optOutOneSignal,
    logoutOneSignal
} from './onesignal-init.js';

let currentUserId = null;

export async function initPushNotifications(userId) {
    if (!userId) return;
    currentUserId = userId;

    await initOneSignal();

    const { db } = getFirebaseInstance();
    if (db) {
        try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
                const profile = userDoc.data();
                await syncUserWithOneSignal(userId, profile.email, profile.displayName);
            } else {
                await syncUserWithOneSignal(userId);
            }
        } catch (e) {
            console.error('[Push] Fehler beim Laden des Profils:', e);
            await syncUserWithOneSignal(userId);
        }
    }
}

export async function requestPushPermission() {
    console.log('[Push] requestPushPermission aufgerufen');

    try {
        console.log('[Push] Verwende OneSignal für PWA...');
        const granted = await requestOneSignalPermission();
        console.log('[Push] OneSignal Berechtigung:', granted);
        return granted;
    } catch (e) {
        console.error('[Push] Fehler bei requestPushPermission:', e);
        return false;
    }
}

export async function isPushEnabled() {
    return await isOneSignalEnabled();
}

export async function disablePushNotifications() {
    if (!currentUserId) return;

    try {
        await optOutOneSignal();
        console.log('[Push] Benachrichtigungen deaktiviert');
    } catch (e) {
        console.error('[Push] Fehler beim Deaktivieren:', e);
    }
}

export async function updateNotificationPreferences(preferences) {
    if (!currentUserId) return;

    try {
        const { db } = getFirebaseInstance();
        if (!db) return;

        await updateDoc(doc(db, 'users', currentUserId), {
            notificationPreferences: preferences,
            notificationPreferencesUpdatedAt: new Date().toISOString()
        });

        console.log('[Push] Einstellungen aktualisiert');
    } catch (e) {
        console.error('[Push] Fehler beim Aktualisieren der Einstellungen:', e);
    }
}

export async function getNotificationPreferences() {
    if (!currentUserId) return getDefaultPreferences();

    try {
        const { db } = getFirebaseInstance();
        if (!db) return getDefaultPreferences();

        const userDoc = await getDoc(doc(db, 'users', currentUserId));
        if (!userDoc.exists()) return getDefaultPreferences();

        const data = userDoc.data();
        return {
            enabled: data.notificationsEnabled ?? true,
            ...getDefaultPreferences(),
            ...data.notificationPreferences
        };
    } catch (e) {
        console.error('[Push] Fehler beim Laden der Einstellungen:', e);
        return getDefaultPreferences();
    }
}

function getDefaultPreferences() {
    return {
        enabled: true,
        match_requests: true,
        ranking_changes: true,
        training_reminders: true
    };
}

function showInAppNotification(notification) {
    const title = notification.title || 'SC Champions';
    const body = notification.body || '';

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

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 5000);

    toast.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;

        const data = notification.data;
        if (data?.type === 'match_request') {
            window.location.href = '/dashboard.html#matches';
        } else if (data?.url) {
            window.location.href = data.url;
        }

        toast.remove();
    });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export async function showPushPermissionPrompt() {
    return new Promise((resolve) => {
        if ('Notification' in window) {
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
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
                <div class="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-bell text-indigo-600 text-2xl"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-900 mb-2">Push-Benachrichtigungen aktivieren?</h3>
                <p class="text-gray-600 mb-6">
                    Erhalte Benachrichtigungen für Spielanfragen und Ranglistenänderungen.
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
            console.log('[Push] Aktivieren geklickt');
            modal.remove();
            try {
                const granted = await requestPushPermission();
                console.log('[Push] Berechtigung erteilt:', granted);
                resolve(granted);
            } catch (e) {
                console.error('[Push] Fehler nach Aktivieren-Klick:', e);
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

export function isPushSupported() {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator.standalone === true) return true;
    return false;
}

export async function shouldShowPushPrompt() {
    if (!isPushSupported()) return false;

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

    const isEnabled = await isOneSignalEnabled();
    if (isEnabled) return false;

    if ('Notification' in window && Notification.permission === 'denied') {
        return false;
    }

    return true;
}

export async function logoutPushNotifications() {
    currentUserId = null;
    await logoutOneSignal();
}
