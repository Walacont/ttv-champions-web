// Settings Notifications Page - Supabase Version
// Handles push notification preferences

import { getSupabase } from './supabase-init.js';
import { initI18n, translatePage, setupAutoTranslate } from './i18n.js';
import {
    initPushNotifications,
    requestPushPermission,
    isPushEnabled,
    getPermissionStatus,
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

    // Initialize push notifications for this user (with error handling)
    try {
        await initPushNotifications(currentUserId);
    } catch (e) {
        console.error('[Settings] Error initializing push notifications:', e);
    }

    // Update push permission status (with error handling)
    try {
        await updatePushStatus();
    } catch (e) {
        console.error('[Settings] Error updating push status:', e);
    }

    // Load notification preferences (with error handling)
    try {
        await loadPreferences();
    } catch (e) {
        console.error('[Settings] Error loading preferences:', e);
    }

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

    // Check permission status via OneSignal (more reliable than browser API on iOS)
    let permissionStatus = 'default';
    try {
        permissionStatus = await getPermissionStatus();
    } catch (e) {
        console.error('[Settings] Error getting permission status:', e);
    }
    console.log('[Settings] Push enabled:', enabled, 'Permission status:', permissionStatus);

    if (enabled) {
        // Push is enabled
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
    } else if (permissionStatus === 'denied') {
        // Permission explicitly denied - show blocked message
        statusIcon.className = 'w-10 h-10 bg-red-100 rounded-full flex items-center justify-center';
        statusIcon.innerHTML = '<i class="fas fa-ban text-red-600"></i>';
        statusText.textContent = 'Push-Benachrichtigungen wurden blockiert. Bitte aktiviere sie in den Geräteeinstellungen.';
        statusText.className = 'text-sm text-red-600';
        enableBtn.classList.add('hidden');

        // Disable preference toggles
        PREFERENCE_KEYS.forEach(key => {
            const toggle = document.getElementById(`pref-${key}`);
            if (toggle) toggle.disabled = true;
        });
    } else {
        // Push not enabled yet - show enable button
        statusIcon.className = 'w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center';
        statusIcon.innerHTML = '<i class="fas fa-bell-slash text-gray-400"></i>';
        statusText.textContent = 'Push-Benachrichtigungen sind noch nicht aktiviert';
        statusText.className = 'text-sm text-gray-500';
        enableBtn.classList.remove('hidden');

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
                toggle.checked = preferences[key] !== false; // Default to true if not set
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

// Initialize on DOMContentLoaded or immediately if already loaded (for SPA navigation)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Fallback: Show content after 3 seconds even if init fails
setTimeout(() => {
    const loader = document.getElementById('page-loader');
    const content = document.getElementById('main-content');
    if (loader && loader.style.display !== 'none') {
        console.warn('[Settings] Fallback: Showing content after timeout');
        loader.style.display = 'none';
        if (content) content.style.display = 'block';
    }
}, 3000);
