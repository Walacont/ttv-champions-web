// Benachrichtigungs-Einstellungen - Supabase-Version
// Verwaltet Push-Benachrichtigungs-Einstellungen

import { getSupabase } from './supabase-init.js';
import { initI18n, translatePage, setupAutoTranslate } from './i18n.js';
import {
    initPushNotifications,
    requestPushPermission,
    isPushEnabled,
    isPushSupported,
    getNotificationPreferences,
    updateNotificationPreferences,
    disablePushNotifications
} from './push-notifications-manager.js';

const supabase = getSupabase();
let currentUserId = null;
let saveTimeout = null;

// Einstellungs-Schlüssel die zu Toggle-IDs mappen
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
    // i18n initialisieren
    await initI18n();
    setupAutoTranslate();
    translatePage();

    // Auth prüfen
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = '/index.html';
        return;
    }

    currentUserId = session.user.id;

    // Push-Benachrichtigungen nur in PWA/native App verfügbar
    if (!isPushSupported()) {
        document.getElementById('page-loader').style.display = 'none';
        document.getElementById('main-content').innerHTML = `
            <div class="max-w-lg mx-auto p-6 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-mobile-alt text-gray-400 text-2xl"></i>
                </div>
                <h2 class="text-xl font-bold text-gray-900 mb-2">Nur in der App verfügbar</h2>
                <p class="text-gray-600 mb-6">
                    Push-Benachrichtigungen sind nur in der installierten App oder PWA verfügbar.
                    Installiere die App, um Benachrichtigungen zu erhalten.
                </p>
                <a href="/settings.html" class="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition">
                    Zurück zu Einstellungen
                </a>
            </div>
        `;
        document.getElementById('main-content').style.display = 'block';
        return;
    }

    // Push-Benachrichtigungen für diesen Benutzer initialisieren
    await initPushNotifications(currentUserId);

    // Push-Berechtigungsstatus aktualisieren
    await updatePushStatus();

    // Benachrichtigungs-Einstellungen laden
    await loadPreferences();

    // Event-Listener einrichten
    setupEventListeners();

    // Loader ausblenden und Inhalt anzeigen
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

        // Einstellungs-Toggles aktivieren
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

        // Einstellungs-Toggles deaktivieren wenn Push nicht aktiviert ist
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

    // Nach 3 Sekunden ausblenden
    setTimeout(() => {
        statusEl.classList.add('hidden');
    }, 3000);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Push-Button aktivieren
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

    // Einstellungs-Toggles
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
