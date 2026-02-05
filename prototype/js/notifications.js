/**
 * Benachrichtigungssystem für SC Champions Prototyp
 * In-App Benachrichtigungen und Push-Notifications
 */

import { supabase, getCurrentProfile, subscribeToNotifications } from './supabase-client.js';

// Benachrichtigungstypen
export const NOTIFICATION_TYPES = {
    MATCH_REQUEST: 'match_request',
    MATCH_CONFIRMED: 'match_confirmed',
    MATCH_REJECTED: 'match_rejected',
    POINTS_AWARDED: 'points_awarded',
    CHALLENGE_AVAILABLE: 'challenge_available',
    SEASON_STARTED: 'season_started',
    SEASON_ENDING: 'season_ending'
};

// ============================================
// BENACHRICHTIGUNGEN LADEN
// ============================================

/**
 * Lädt Benachrichtigungen des aktuellen Benutzers
 *
 * @param {Object} options - Optionen
 * @param {boolean} options.unreadOnly - Nur ungelesene
 * @param {number} options.limit - Limit
 * @returns {Promise<Array>} Benachrichtigungen
 */
export async function getNotifications(options = {}) {
    const profile = getCurrentProfile();
    if (!profile) return [];

    const { unreadOnly = false, limit = 20 } = options;

    let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (unreadOnly) {
        query = query.eq('read', false);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden der Benachrichtigungen:', error);
        return [];
    }

    return data;
}

/**
 * Zählt ungelesene Benachrichtigungen
 *
 * @returns {Promise<number>} Anzahl ungelesener Benachrichtigungen
 */
export async function getUnreadCount() {
    const profile = getCurrentProfile();
    if (!profile) return 0;

    const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('read', false);

    if (error) {
        console.error('Fehler beim Zählen der Benachrichtigungen:', error);
        return 0;
    }

    return count || 0;
}

// ============================================
// BENACHRICHTIGUNGEN VERWALTEN
// ============================================

/**
 * Erstellt eine Benachrichtigung
 *
 * @param {string} userId - Empfänger-ID
 * @param {string} type - Typ
 * @param {string} title - Titel
 * @param {string} message - Nachricht
 * @param {Object} data - Zusätzliche Daten
 * @returns {Promise<Object>} Ergebnis
 */
export async function createNotification(userId, type, title, message, data = {}) {
    try {
        const { data: notification, error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type,
                title,
                message,
                data
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, notification };
    } catch (error) {
        console.error('Fehler beim Erstellen der Benachrichtigung:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Markiert eine Benachrichtigung als gelesen
 *
 * @param {string} notificationId - Benachrichtigungs-ID
 * @returns {Promise<boolean>} Erfolg
 */
export async function markAsRead(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

    return !error;
}

/**
 * Markiert alle Benachrichtigungen als gelesen
 *
 * @returns {Promise<boolean>} Erfolg
 */
export async function markAllAsRead() {
    const profile = getCurrentProfile();
    if (!profile) return false;

    const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', profile.id)
        .eq('read', false);

    return !error;
}

/**
 * Löscht eine Benachrichtigung
 *
 * @param {string} notificationId - ID
 * @returns {Promise<boolean>} Erfolg
 */
export async function deleteNotification(notificationId) {
    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

    return !error;
}

/**
 * Löscht alle Benachrichtigungen des Benutzers
 *
 * @returns {Promise<boolean>} Erfolg
 */
export async function clearAllNotifications() {
    const profile = getCurrentProfile();
    if (!profile) return false;

    const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', profile.id);

    return !error;
}

// ============================================
// REALTIME UPDATES
// ============================================

let notificationSubscription = null;
let notificationCallbacks = [];

/**
 * Initialisiert Realtime-Updates für Benachrichtigungen
 *
 * @param {Function} callback - Callback bei neuer Benachrichtigung
 */
export function initNotificationListener(callback) {
    if (callback) {
        notificationCallbacks.push(callback);
    }

    if (!notificationSubscription) {
        notificationSubscription = subscribeToNotifications((notification) => {
            // Alle Callbacks aufrufen
            notificationCallbacks.forEach(cb => cb(notification));

            // Badge aktualisieren
            updateNotificationBadge();

            // Toast anzeigen
            showNotificationToast(notification);
        });
    }
}

/**
 * Stoppt Realtime-Updates
 */
export function stopNotificationListener() {
    if (notificationSubscription) {
        notificationSubscription.unsubscribe();
        notificationSubscription = null;
    }
    notificationCallbacks = [];
}

// ============================================
// UI FUNKTIONEN
// ============================================

/**
 * Aktualisiert das Benachrichtigungs-Badge im Header
 */
export async function updateNotificationBadge() {
    const count = await getUnreadCount();
    const badge = document.getElementById('notification-badge');

    if (badge) {
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count.toString();
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

/**
 * Zeigt einen Toast für eine neue Benachrichtigung
 *
 * @param {Object} notification - Benachrichtigung
 */
export function showNotificationToast(notification) {
    const container = document.getElementById('toast-container') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = 'toast bg-white rounded-lg shadow-lg p-4 mb-2 border-l-4 border-blue-500 animate-slide-in';
    toast.innerHTML = `
        <div class="flex items-start gap-3">
            <div class="text-xl">${getNotificationIcon(notification.type)}</div>
            <div class="flex-1">
                <p class="font-medium text-sm">${notification.title}</p>
                <p class="text-xs text-gray-600">${notification.message || ''}</p>
            </div>
            <button class="toast-close text-gray-400 hover:text-gray-600" onclick="this.parentElement.parentElement.remove()">
                ✕
            </button>
        </div>
    `;

    container.appendChild(toast);

    // Nach 5 Sekunden automatisch entfernen
    setTimeout(() => {
        toast.classList.add('animate-slide-out');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

/**
 * Erstellt den Toast-Container
 */
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-4 right-4 z-50 w-80 space-y-2';
    document.body.appendChild(container);
    return container;
}

/**
 * Gibt das Icon für einen Benachrichtigungstyp zurück
 */
function getNotificationIcon(type) {
    const icons = {
        [NOTIFICATION_TYPES.MATCH_REQUEST]: '🏓',
        [NOTIFICATION_TYPES.MATCH_CONFIRMED]: '✅',
        [NOTIFICATION_TYPES.MATCH_REJECTED]: '❌',
        [NOTIFICATION_TYPES.POINTS_AWARDED]: '⭐',
        [NOTIFICATION_TYPES.CHALLENGE_AVAILABLE]: '🎯',
        [NOTIFICATION_TYPES.SEASON_STARTED]: '🚀',
        [NOTIFICATION_TYPES.SEASON_ENDING]: '⏰'
    };
    return icons[type] || '🔔';
}

// ============================================
// HTML RENDERING
// ============================================

/**
 * Erstellt HTML für den Benachrichtigungs-Button im Header
 *
 * @returns {string} HTML
 */
export function createNotificationButton() {
    return `
        <button id="notification-btn" class="relative p-2 text-gray-600 hover:text-gray-900 transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span id="notification-badge"
                  class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                0
            </span>
        </button>
    `;
}

/**
 * Erstellt HTML für die Benachrichtigungsliste
 *
 * @param {Array} notifications - Benachrichtigungen
 * @returns {string} HTML
 */
export function createNotificationList(notifications) {
    if (!notifications || notifications.length === 0) {
        return `
            <div class="text-center py-8 text-gray-500">
                <div class="text-4xl mb-2">🔔</div>
                <p>Keine Benachrichtigungen</p>
            </div>
        `;
    }

    return `
        <div class="divide-y divide-gray-100">
            ${notifications.map(n => createNotificationItem(n)).join('')}
        </div>
    `;
}

/**
 * Erstellt HTML für eine einzelne Benachrichtigung
 *
 * @param {Object} notification - Benachrichtigung
 * @returns {string} HTML
 */
export function createNotificationItem(notification) {
    const icon = getNotificationIcon(notification.type);
    const unreadClass = notification.read ? '' : 'bg-blue-50';
    const timeAgo = formatTimeAgo(notification.created_at);

    let actionButton = '';
    if (notification.type === NOTIFICATION_TYPES.MATCH_REQUEST && notification.data?.match_id) {
        actionButton = `
            <div class="mt-2 flex gap-2">
                <button class="confirm-match-btn px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                        data-match-id="${notification.data.match_id}">
                    Bestätigen
                </button>
                <button class="reject-match-btn px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                        data-match-id="${notification.data.match_id}">
                    Ablehnen
                </button>
            </div>
        `;
    }

    return `
        <div class="notification-item p-4 ${unreadClass} hover:bg-gray-50 transition-colors cursor-pointer"
             data-id="${notification.id}">
            <div class="flex items-start gap-3">
                <div class="text-xl">${icon}</div>
                <div class="flex-1">
                    <p class="font-medium text-sm ${notification.read ? 'text-gray-700' : 'text-gray-900'}">
                        ${notification.title}
                    </p>
                    <p class="text-xs text-gray-600 mt-0.5">${notification.message || ''}</p>
                    <p class="text-xs text-gray-400 mt-1">${timeAgo}</p>
                    ${actionButton}
                </div>
                ${!notification.read ? '<div class="w-2 h-2 bg-blue-500 rounded-full"></div>' : ''}
            </div>
        </div>
    `;
}

/**
 * Formatiert einen Zeitstempel als "vor X Minuten/Stunden"
 */
function formatTimeAgo(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Min.`;
    if (diffHours < 24) return `vor ${diffHours} Std.`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;

    return date.toLocaleDateString('de-DE');
}

/**
 * Erstellt HTML für Benachrichtigungs-Dropdown
 *
 * @param {Array} notifications - Benachrichtigungen
 * @returns {string} HTML
 */
export function createNotificationDropdown(notifications) {
    return `
        <div id="notification-dropdown"
             class="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
            <div class="flex items-center justify-between p-3 border-b border-gray-100">
                <h3 class="font-semibold">Benachrichtigungen</h3>
                <button id="mark-all-read" class="text-xs text-blue-600 hover:text-blue-800">
                    Alle als gelesen markieren
                </button>
            </div>
            <div class="max-h-96 overflow-y-auto">
                ${createNotificationList(notifications)}
            </div>
        </div>
    `;
}
