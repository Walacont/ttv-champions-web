// Benachrichtigungseinstellungen

import { getFirebaseInstance, initFirebase } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    isPushEnabled,
    requestPushPermission,
    getNotificationPreferences,
    updateNotificationPreferences,
    isPushSupported
} from './push-notifications-manager.js';

let currentUser = null;
let preferences = {};

async function init() {
    const { auth } = initFirebase();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await loadUI();
        } else {
            window.location.href = '/index.html';
        }
    });
}

async function loadUI() {
    document.getElementById('page-loader').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';

    await updatePushStatus();
    await loadPreferences();
    setupEventListeners();
}

async function updatePushStatus() {
    const statusIcon = document.getElementById('push-status-icon');
    const statusText = document.getElementById('push-status-text');
    const enableBtn = document.getElementById('enable-push-btn');

    if (!isPushSupported()) {
        statusIcon.innerHTML = '<i class="fas fa-bell-slash text-gray-400"></i>';
        statusText.textContent = 'Nur in der PWA verfügbar';
        enableBtn.classList.add('hidden');
        return;
    }

    const isEnabled = await isPushEnabled();

    if (isEnabled) {
        statusIcon.className = 'w-10 h-10 bg-green-100 rounded-full flex items-center justify-center';
        statusIcon.innerHTML = '<i class="fas fa-bell text-green-600"></i>';
        statusText.textContent = 'Aktiviert';
        enableBtn.classList.add('hidden');
    } else {
        statusIcon.className = 'w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center';
        statusIcon.innerHTML = '<i class="fas fa-bell-slash text-yellow-600"></i>';
        statusText.textContent = 'Nicht aktiviert';
        enableBtn.classList.remove('hidden');
    }
}

async function loadPreferences() {
    preferences = await getNotificationPreferences();

    const prefKeys = ['match_requests', 'ranking_changes', 'training_reminders'];

    prefKeys.forEach(key => {
        const checkbox = document.getElementById(`pref-${key}`);
        if (checkbox) {
            checkbox.checked = preferences[key] ?? true;
        }
    });
}

function setupEventListeners() {
    const enableBtn = document.getElementById('enable-push-btn');
    enableBtn.addEventListener('click', async () => {
        enableBtn.disabled = true;
        enableBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird aktiviert...';

        const granted = await requestPushPermission();

        if (granted) {
            await updatePushStatus();
            showSaveStatus('Push-Benachrichtigungen aktiviert', 'success');
        } else {
            showSaveStatus('Berechtigung nicht erteilt', 'error');
        }

        enableBtn.disabled = false;
        enableBtn.innerHTML = 'Aktivieren';
    });

    const prefInputs = document.querySelectorAll('[id^="pref-"]');
    prefInputs.forEach(input => {
        input.addEventListener('change', async () => {
            const key = input.id.replace('pref-', '');
            preferences[key] = input.checked;

            try {
                await updateNotificationPreferences(preferences);
                showSaveStatus('Einstellungen gespeichert', 'success');
            } catch (e) {
                console.error('Fehler beim Speichern:', e);
                showSaveStatus('Fehler beim Speichern', 'error');
            }
        });
    });
}

function showSaveStatus(message, type) {
    const statusEl = document.getElementById('save-status');
    statusEl.textContent = message;
    statusEl.className = `mt-4 p-3 rounded-lg text-center text-sm font-medium ${
        type === 'success'
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
    }`;
    statusEl.classList.remove('hidden');

    setTimeout(() => {
        statusEl.classList.add('hidden');
    }, 3000);
}

init();
