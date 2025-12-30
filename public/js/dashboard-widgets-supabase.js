/**
 * Dashboard Widgets Verwaltung mit Supabase
 * Ermöglicht Spielern die Anpassung der sichtbaren Dashboard-Widgets
 */

const WIDGETS = [
    {
        id: 'info-banner',
        name: '📚 Info-Banner',
        description: 'Erklärt die drei Systeme: XP, Elo und Saisonpunkte',
        default: true,
        essential: true, // Kann nicht deaktiviert werden
    },
    {
        id: 'statistics',
        name: '📊 Deine Statistiken',
        description: 'Zeigt XP, Elo und Saisonpunkte übersichtlich an',
        default: true,
        essential: false,
    },
    {
        id: 'season-countdown',
        name: '⏳ Saison-Countdown',
        description: 'Zeit bis zum Ende der aktuellen Saison',
        default: true,
        essential: false,
        requiresClub: true, // Nur für Vereinsmitglieder
    },
    {
        id: 'match-requests',
        name: '🏓 Wettkampf-Anfragen',
        description: 'Ausstehende und eingegangene Match-Anfragen',
        default: true,
        essential: true, // Notwendig für das Match-System
    },
    {
        id: 'rank',
        name: '🏆 Dein Rang',
        description: 'Deine aktuelle Rangstufe und Fortschritt',
        default: true,
        essential: false,
    },
    {
        id: 'skill-rival',
        name: '⚡ Skill-Rivale',
        description: 'Dein nächster Gegner in der Elo-Rangliste',
        default: true,
        essential: false,
    },
    {
        id: 'effort-rival',
        name: '💪 Fleiß-Rivale',
        description: 'Dein nächster Konkurrent in der XP-Rangliste',
        default: true,
        essential: false,
        requiresClub: true, // Nur für Vereinsmitglieder
    },
    {
        id: 'points-history',
        name: '📜 Punkte-Historie',
        description: 'Deine letzten Punkteänderungen im Überblick',
        default: true,
        essential: false,
    },
    {
        id: 'challenges',
        name: '🎯 Aktive Challenges',
        description: 'Deine aktuellen Herausforderungen',
        default: true,
        essential: false,
    },
];

let currentSettings = {};
let supabaseClient = null;
let currentUserId = null;
let currentUserData = null;

/**
 * Initialisiert das Widget-System (nicht-blockierend)
 * Zeigt sofort Defaults an, lädt gespeicherte Einstellungen im Hintergrund
 */
export function initializeWidgetSystem(supabaseInstance, userId, userData = null) {
    supabaseClient = supabaseInstance;
    currentUserId = userId;
    currentUserData = userData;

    // Sofort Defaults nutzen für schnelles Rendering
    currentSettings = getDefaultSettings();
    applyWidgetSettings();

    setupWidgetControls();

    // Gespeicherte Einstellungen im Hintergrund laden
    loadWidgetSettings()
        .then(() => {
            applyWidgetSettings();
        })
        .catch(error => {
            // Bei Fehler bleiben die Defaults aktiv
        });
}

/**
 * Lädt Widget-Einstellungen aus Supabase (mit localStorage Fallback)
 */
async function loadWidgetSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('user_preferences')
            .select('dashboard_widgets')
            .eq('user_id', currentUserId)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') { // PGRST116 = keine Zeilen gefunden
            console.warn('[Widget System] Supabase table not available, using localStorage:', error.message);
            const localData = localStorage.getItem(`widgetSettings_${currentUserId}`);
            if (localData) {
                currentSettings = JSON.parse(localData);
            } else {
                currentSettings = getDefaultSettings();
            }
            return;
        }

        if (data && data.dashboard_widgets) {
            currentSettings = data.dashboard_widgets;
            // Auch lokal speichern als Backup
            localStorage.setItem(`widgetSettings_${currentUserId}`, JSON.stringify(data.dashboard_widgets));
        } else {
            const localData = localStorage.getItem(`widgetSettings_${currentUserId}`);
            if (localData) {
                currentSettings = JSON.parse(localData);
            } else {
                currentSettings = getDefaultSettings();
            }
        }
    } catch (error) {
        console.warn('[Widget System] Error loading from Supabase, using localStorage fallback:', error);
        const localData = localStorage.getItem(`widgetSettings_${currentUserId}`);
        if (localData) {
            currentSettings = JSON.parse(localData);
        } else {
            currentSettings = getDefaultSettings();
        }
    }
}

/**
 * Gibt die Standard-Widget-Einstellungen zurück
 */
function getDefaultSettings() {
    const settings = {};
    // Unterstützt beide Schreibweisen für club ID (camelCase und snake_case)
    const hasClub = currentUserData &&
        (currentUserData.clubId !== null && currentUserData.clubId !== undefined) ||
        (currentUserData.club_id !== null && currentUserData.club_id !== undefined);

    WIDGETS.forEach(widget => {
        // Vereins-Widgets standardmäßig deaktivieren wenn User keinen Verein hat
        if (widget.requiresClub && !hasClub) {
            settings[widget.id] = false;
        } else {
            settings[widget.id] = widget.default;
        }
    });
    return settings;
}

/**
 * Speichert Widget-Einstellungen in Supabase (mit localStorage Fallback)
 */
async function saveWidgetSettings(settings) {
    // Immer lokal speichern als Backup
    try {
        localStorage.setItem(`widgetSettings_${currentUserId}`, JSON.stringify(settings));
    } catch (localError) {
        console.warn('[Widget System] Could not save to localStorage:', localError);
    }

    try {
        const { error } = await supabaseClient
            .from('user_preferences')
            .upsert({
                user_id: currentUserId,
                dashboard_widgets: settings,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id'
            });

        if (error) {
            console.warn('[Widget System] Supabase table not available, using localStorage only:', error.message);
            // Trotzdem true zurückgeben, da localStorage erfolgreich war
            return true;
        }
        return true;
    } catch (error) {
        console.warn('[Widget System] Error saving to Supabase, using localStorage only:', error);
        // Trotzdem true zurückgeben, da localStorage erfolgreich war
        return true;
    }
}

/**
 * Wendet Widget-Einstellungen auf das Dashboard an
 */
function applyWidgetSettings() {
    const widgets = document.querySelectorAll('.dashboard-widget');
    // Unterstützt beide Schreibweisen für club ID (camelCase und snake_case)
    const hasClub = currentUserData &&
        (currentUserData.clubId !== null && currentUserData.clubId !== undefined) ||
        (currentUserData.club_id !== null && currentUserData.club_id !== undefined);

    widgets.forEach(widget => {
        const widgetId = widget.getAttribute('data-widget-id');
        const isVisible = currentSettings[widgetId] !== false; // Standardmäßig sichtbar

        const widgetDef = WIDGETS.find(w => w.id === widgetId);
        const requiresClub = widgetDef?.requiresClub || false;

        const shouldShow = isVisible && (!requiresClub || hasClub);

        if (shouldShow) {
            widget.classList.remove('hidden');
        } else {
            widget.classList.add('hidden');
        }
    });
}

/**
 * Richtet Event-Listener für Widget-Controls ein
 */
function setupWidgetControls() {
    const editButton = document.getElementById('edit-dashboard-button');
    if (editButton) {
        editButton.addEventListener('click', openWidgetSettingsModal);
    }

    const closeButton = document.getElementById('close-widget-settings-modal');
    const cancelButton = document.getElementById('cancel-widget-settings-button');
    if (closeButton) closeButton.addEventListener('click', closeWidgetSettingsModal);
    if (cancelButton) cancelButton.addEventListener('click', closeWidgetSettingsModal);

    const saveButton = document.getElementById('save-widget-settings-button');
    if (saveButton) {
        saveButton.addEventListener('click', saveWidgetSettingsFromModal);
    }

    const resetButton = document.getElementById('reset-widgets-button');
    if (resetButton) {
        resetButton.addEventListener('click', resetWidgetSettings);
    }
}

/**
 * Öffnet das Widget-Einstellungen Modal
 */
function openWidgetSettingsModal() {
    console.log('[Widget System] Opening settings modal');

    const modal = document.getElementById('widget-settings-modal');
    const listContainer = document.getElementById('widget-settings-list');

    // Unterstützt beide Schreibweisen für club ID (camelCase und snake_case)
    const hasClub = currentUserData &&
        ((currentUserData.clubId !== null && currentUserData.clubId !== undefined) ||
         (currentUserData.club_id !== null && currentUserData.club_id !== undefined));

    console.log('[Widget System] User club status:', {
        hasClub,
        clubId: currentUserData?.clubId,
        club_id: currentUserData?.club_id
    });

    listContainer.innerHTML = '';

    WIDGETS.forEach(widget => {
        const isEnabled = currentSettings[widget.id] !== false;
        const isEssential = widget.essential;
        const requiresClub = widget.requiresClub || false;
        const isDisabled = isEssential || (requiresClub && !hasClub);

        const widgetItem = document.createElement('div');
        widgetItem.className =
            'flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors';
        widgetItem.innerHTML = `
            <div class="flex-1">
                <div class="flex items-center gap-2">
                    <span class="text-lg">${widget.name}</span>
                    ${isEssential ? '<span class="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full font-semibold">Pflicht</span>' : ''}
                    ${requiresClub && !hasClub ? '<span class="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-semibold">🏠 Nur für Vereinsmitglieder</span>' : ''}
                </div>
                <p class="text-sm text-gray-600 mt-1">${widget.description}</p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}">
                <input type="checkbox"
                       class="widget-toggle sr-only peer"
                       data-widget-id="${widget.id}"
                       ${isEnabled && (!requiresClub || hasClub) ? 'checked' : ''}
                       ${isDisabled ? 'disabled' : ''}>
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
        `;
        listContainer.appendChild(widgetItem);
    });

    modal.classList.remove('hidden');
}

/**
 * Schließt das Widget-Einstellungen Modal
 */
function closeWidgetSettingsModal() {
    const modal = document.getElementById('widget-settings-modal');
    modal.classList.add('hidden');

    const feedback = document.getElementById('widget-settings-feedback');
    feedback.classList.add('hidden');
    feedback.textContent = '';
}

/**
 * Speichert Widget-Einstellungen aus dem Modal
 */
async function saveWidgetSettingsFromModal() {
    console.log('[Widget System] Saving settings from modal');

    const feedback = document.getElementById('widget-settings-feedback');
    feedback.classList.remove('hidden');
    feedback.className = 'mt-4 text-center text-sm font-medium text-gray-600';
    feedback.textContent = 'Speichere Einstellungen...';

    const toggles = document.querySelectorAll('.widget-toggle');
    const newSettings = {};

    toggles.forEach(toggle => {
        const widgetId = toggle.getAttribute('data-widget-id');
        newSettings[widgetId] = toggle.checked;
    });

    const success = await saveWidgetSettings(newSettings);

    if (success) {
        currentSettings = newSettings;
        applyWidgetSettings();

        feedback.className = 'mt-4 text-center text-sm font-medium text-green-600';
        feedback.textContent = '✓ Einstellungen gespeichert!';

        // Modal nach kurzer Verzögerung schließen für besseres UX
        setTimeout(() => {
            closeWidgetSettingsModal();
        }, 1500);
    } else {
        feedback.className = 'mt-4 text-center text-sm font-medium text-red-600';
        feedback.textContent = '✗ Fehler beim Speichern. Bitte versuche es erneut.';
    }
}

/**
 * Setzt Widget-Einstellungen auf Standardwerte zurück
 */
async function resetWidgetSettings() {
    if (!confirm('Möchtest du alle Widgets auf die Standardeinstellungen zurücksetzen?')) {
        return;
    }

    console.log('[Widget System] Resetting to default settings');

    const defaultSettings = getDefaultSettings();
    const success = await saveWidgetSettings(defaultSettings);

    if (success) {
        currentSettings = defaultSettings;
        applyWidgetSettings();

        closeWidgetSettingsModal();
        openWidgetSettingsModal();

        const feedback = document.getElementById('widget-settings-feedback');
        feedback.classList.remove('hidden');
        feedback.className = 'mt-4 text-center text-sm font-medium text-green-600';
        feedback.textContent = '✓ Auf Standard zurückgesetzt!';

        setTimeout(() => {
            feedback.classList.add('hidden');
        }, 3000);
    }
}

/**
 * Gibt aktuelle Widget-Einstellungen zurück (für Debugging)
 */
export function getCurrentWidgetSettings() {
    return { ...currentSettings };
}

/**
 * Prüft ob ein Widget sichtbar ist
 */
export function isWidgetVisible(widgetId) {
    return currentSettings[widgetId] !== false;
}
