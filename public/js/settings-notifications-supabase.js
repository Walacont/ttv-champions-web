// Benachrichtigungs-Einstellungen - Supabase-Version
// Handles push notification preferences

import { getSupabase } from './supabase-init.js';
import { initI18n, translatePage, setupAutoTranslate } from './i18n.js';
import {
    initPushNotifications,
    requestPushPermission,
    isPushEnabled,
    getNotificationPreferences,
    updateNotificationPreferences,
    disablePushNotifications
} from './push-notifications-manager.js';

const supabase = getSupabase();
let currentUserId = null;
let saveTimeout = null;

// Preference keys that map to toggle IDs
const PREFERENCE_KEYS = [
    'match_requests',
    'doubles_match_requests',
    'friend_requests',
    'club_requests',
    'ranking_changes',
    'training_reminders',
    'points_awarded'
];

async function init() {
    // Initialize i18n
    await initI18n();
    setupAutoTranslate();
    translatePage();

    // Check auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/index.html';
        return;
    }

    currentUserId = session.user.id;

    // Initialize push notifications for this user
    await initPushNotifications(currentUserId);

    // Update push permission status
    await updatePushStatus();

    // Load notification preferences
    await loadPreferences();

    // Setup event listeners
    setupEventListeners();

    // Hide loader and show content
    document.getElementById('page-loader').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
}

/**
 * Update the push permission status UI
 */
async function updatePushStatus() {
    const statusIcon = document.getElementById('push-status-icon');
    const statusText = document.getElementById('push-status-text');
    const enableBtn = document.getElementById('enable-push-btn');
    const preferencesContainer = document.getElementById('preferences-container');

    const isNative = window.CapacitorUtils?.isNative();
    let enabled = false;

    try {
        enabled = await isPushEnabled();
    } catch (e) {
        console.error('Error checking push status:', e);
    }

    if (enabled) {
        // Push ist aktiviert
        statusIcon.className = 'w-10 h-10 bg-green-100 rounded-full flex items-center justify-center';
        statusIcon.innerHTML = '<i class="fas fa-bell text-green-600"></i>';
        statusText.textContent = 'Push-Benachrichtigungen sind aktiviert';
        statusText.className = 'text-sm text-green-600';
        enableBtn.classList.add('hidden');

        // Enable preference toggles
        PREFERENCE_KEYS.forEach(key => {
            const toggle = document.getElementById(`pref-${key}`);
            if (toggle) toggle.disabled = false;
        });
    } else {
        // Push ist nicht aktiviert
        statusIcon.className = 'w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center';
        statusIcon.innerHTML = '<i class="fas fa-bell-slash text-gray-400"></i>';

        // Prüfen ob abgelehnt oder nur nicht angefragt
        if (!isNative && 'Notification' in window && Notification.permission === 'denied') {
            statusText.textContent = 'Push-Benachrichtigungen wurden blockiert. Bitte aktiviere sie in den Geräteeinstellungen.';
            statusText.className = 'text-sm text-red-600';
            enableBtn.classList.add('hidden');
        } else {
            statusText.textContent = 'Push-Benachrichtigungen sind deaktiviert';
            statusText.className = 'text-sm text-gray-500';
            enableBtn.classList.remove('hidden');
        }

        // Disable preference toggles when push is not enabled
        PREFERENCE_KEYS.forEach(key => {
            const toggle = document.getElementById(`pref-${key}`);
            if (toggle) toggle.disabled = true;
        });
    }
}

/**
 * Load notification preferences from Supabase
 */
async function loadPreferences() {
    try {
        const preferences = await getNotificationPreferences();

        PREFERENCE_KEYS.forEach(key => {
            const toggle = document.getElementById(`pref-${key}`);
            if (toggle) {
                toggle.checked = preferences[key] !== false; // Standard ist true wenn nicht gesetzt
            }
        });
    } catch (e) {
        console.error('Error loading preferences:', e);
    }
}

/**
 * Save notification preferences to Supabase
 */
async function savePreferences() {
    // Debounce saves
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        const preferences = {};

        PREFERENCE_KEYS.forEach(key => {
            const toggle = document.getElementById(`pref-${key}`);
            if (toggle) {
                preferences[key] = toggle.checked;
            }
        });

        try {
            await updateNotificationPreferences(preferences);
            showSaveStatus('success', 'Einstellungen gespeichert');
        } catch (e) {
            console.error('Error saving preferences:', e);
            showSaveStatus('error', 'Fehler beim Speichern');
        }
    }, 500);
}

/**
 * Show save status message
 */
function showSaveStatus(type, message) {
    const statusEl = document.getElementById('save-status');
    statusEl.textContent = message;
    statusEl.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-red-100', 'text-red-700');

    if (type === 'success') {
        statusEl.classList.add('bg-green-100', 'text-green-700');
    } else {
        statusEl.classList.add('bg-red-100', 'text-red-700');
    }

    // Hide after 3 seconds
    setTimeout(() => {
        statusEl.classList.add('hidden');
    }, 3000);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Enable push button
    const enableBtn = document.getElementById('enable-push-btn');
    enableBtn.addEventListener('click', async () => {
        enableBtn.disabled = true;
        enableBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Aktivieren...';

        try {
            const granted = await requestPushPermission();

            if (granted) {
                await updatePushStatus();
                showSaveStatus('success', 'Push-Benachrichtigungen aktiviert!');
            } else {
                showSaveStatus('error', 'Berechtigung verweigert');
            }
        } catch (e) {
            console.error('Error enabling push:', e);
            showSaveStatus('error', 'Fehler beim Aktivieren');
        }

        enableBtn.disabled = false;
        enableBtn.innerHTML = 'Aktivieren';
    });

    // Preference toggles
    PREFERENCE_KEYS.forEach(key => {
        const toggle = document.getElementById(`pref-${key}`);
        if (toggle) {
            toggle.addEventListener('change', () => {
                savePreferences();
            });
        }
    });
}

// Bei DOMContentLoaded initialisieren oder sofort falls bereits geladen (für SPA)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
