/**
 * Dashboard Widgets Management (Supabase Version)
 * Allows players to customize which widgets are visible on their dashboard
 * Inspired by modern app customization (like HVV Switch)
 */

// Widget definitions with metadata
const WIDGETS = [
    {
        id: 'info-banner',
        name: '📚 Info-Banner',
        description: 'Erklärt die drei Systeme: XP, Elo und Saisonpunkte',
        default: true,
        essential: true, // Cannot be disabled
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
        requiresClub: true, // Only available for club members
    },
    {
        id: 'match-requests',
        name: '🏓 Wettkampf-Anfragen',
        description: 'Ausstehende und eingegangene Match-Anfragen',
        default: true,
        essential: true, // Cannot be disabled - required for match system
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
        requiresClub: true, // Only available for club members
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
 * Initialize widget management system
 * Non-blocking: Shows defaults immediately, then loads saved settings in background
 * @param {Object} supabaseInstance - Supabase client instance
 * @param {string} userId - Current user ID
 * @param {Object} userData - Current user data (optional, for club status)
 */
export function initializeWidgetSystem(supabaseInstance, userId, userData = null) {
    supabaseClient = supabaseInstance;
    currentUserId = userId;
    currentUserData = userData;

    // Use default settings immediately (non-blocking)
    currentSettings = getDefaultSettings();
    applyWidgetSettings();

    // Setup event listeners
    setupWidgetControls();

    // Load user's saved settings in background (non-blocking)
    loadWidgetSettings()
        .then(() => {
            applyWidgetSettings();
        })
        .catch(error => {
            // Use defaults if loading fails
        });
}

/**
 * Load widget settings from Supabase (with localStorage fallback)
 */
async function loadWidgetSettings() {
    try {
        const { data, error } = await supabaseClient
            .from('user_preferences')
            .select('dashboard_widgets')
            .eq('user_id', currentUserId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.warn('[Widget System] Supabase table not available, using localStorage:', error.message);
            // Fallback to localStorage
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
            // Also save to localStorage as backup
            localStorage.setItem(`widgetSettings_${currentUserId}`, JSON.stringify(data.dashboard_widgets));
        } else {
            // Try localStorage fallback
            const localData = localStorage.getItem(`widgetSettings_${currentUserId}`);
            if (localData) {
                currentSettings = JSON.parse(localData);
            } else {
                currentSettings = getDefaultSettings();
            }
        }
    } catch (error) {
        console.warn('[Widget System] Error loading from Supabase, using localStorage fallback:', error);
        // Fallback to localStorage
        const localData = localStorage.getItem(`widgetSettings_${currentUserId}`);
        if (localData) {
            currentSettings = JSON.parse(localData);
        } else {
            currentSettings = getDefaultSettings();
        }
    }
}

/**
 * Get default widget settings
 * @returns {Object} Default settings object
 */
function getDefaultSettings() {
    const settings = {};
    // Support both camelCase and snake_case for club ID
    const hasClub = currentUserData &&
        (currentUserData.clubId !== null && currentUserData.clubId !== undefined) ||
        (currentUserData.club_id !== null && currentUserData.club_id !== undefined);

    WIDGETS.forEach(widget => {
        // Disable club-only widgets by default if user has no club
        if (widget.requiresClub && !hasClub) {
            settings[widget.id] = false;
        } else {
            settings[widget.id] = widget.default;
        }
    });
    return settings;
}

/**
 * Save widget settings to Supabase (with localStorage fallback)
 * @param {Object} settings - Settings object to save
 */
async function saveWidgetSettings(settings) {
    // Always save to localStorage as backup
    try {
        localStorage.setItem(`widgetSettings_${currentUserId}`, JSON.stringify(settings));
    } catch (localError) {
        console.warn('[Widget System] Could not save to localStorage:', localError);
    }

    // Try to save to Supabase
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
            // Still return true since we saved to localStorage
            return true;
        }
        return true;
    } catch (error) {
        console.warn('[Widget System] Error saving to Supabase, using localStorage only:', error);
        // Still return true since we saved to localStorage
        return true;
    }
}

/**
 * Apply widget settings to the dashboard (show/hide widgets)
 */
function applyWidgetSettings() {
    const widgets = document.querySelectorAll('.dashboard-widget');
    // Support both camelCase and snake_case for club ID
    const hasClub = currentUserData &&
        (currentUserData.clubId !== null && currentUserData.clubId !== undefined) ||
        (currentUserData.club_id !== null && currentUserData.club_id !== undefined);

    widgets.forEach(widget => {
        const widgetId = widget.getAttribute('data-widget-id');
        const isVisible = currentSettings[widgetId] !== false; // Default to visible if not set

        // Check if widget requires club membership
        const widgetDef = WIDGETS.find(w => w.id === widgetId);
        const requiresClub = widgetDef?.requiresClub || false;

        // Hide widget if it requires club and user has no club
        const shouldShow = isVisible && (!requiresClub || hasClub);

        if (shouldShow) {
            widget.classList.remove('hidden');
        } else {
            widget.classList.add('hidden');
        }
    });
}

/**
 * Setup event listeners for widget controls
 */
function setupWidgetControls() {
    // Open modal button
    const editButton = document.getElementById('edit-dashboard-button');
    if (editButton) {
        editButton.addEventListener('click', openWidgetSettingsModal);
    }

    // Close modal buttons
    const closeButton = document.getElementById('close-widget-settings-modal');
    const cancelButton = document.getElementById('cancel-widget-settings-button');
    if (closeButton) closeButton.addEventListener('click', closeWidgetSettingsModal);
    if (cancelButton) cancelButton.addEventListener('click', closeWidgetSettingsModal);

    // Save button
    const saveButton = document.getElementById('save-widget-settings-button');
    if (saveButton) {
        saveButton.addEventListener('click', saveWidgetSettingsFromModal);
    }

    // Reset button
    const resetButton = document.getElementById('reset-widgets-button');
    if (resetButton) {
        resetButton.addEventListener('click', resetWidgetSettings);
    }
}

/**
 * Open widget settings modal
 */
function openWidgetSettingsModal() {
    console.log('[Widget System] Opening settings modal');

    const modal = document.getElementById('widget-settings-modal');
    const listContainer = document.getElementById('widget-settings-list');

    // Check if user has a club - support both camelCase and snake_case
    const hasClub = currentUserData &&
        ((currentUserData.clubId !== null && currentUserData.clubId !== undefined) ||
         (currentUserData.club_id !== null && currentUserData.club_id !== undefined));

    console.log('[Widget System] User club status:', {
        hasClub,
        clubId: currentUserData?.clubId,
        club_id: currentUserData?.club_id
    });

    // Clear previous content
    listContainer.innerHTML = '';

    // Generate widget toggles
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

    // Show modal
    modal.classList.remove('hidden');
}

/**
 * Close widget settings modal
 */
function closeWidgetSettingsModal() {
    const modal = document.getElementById('widget-settings-modal');
    modal.classList.add('hidden');

    // Clear feedback
    const feedback = document.getElementById('widget-settings-feedback');
    feedback.classList.add('hidden');
    feedback.textContent = '';
}

/**
 * Save widget settings from modal
 */
async function saveWidgetSettingsFromModal() {
    console.log('[Widget System] Saving settings from modal');

    const feedback = document.getElementById('widget-settings-feedback');
    feedback.classList.remove('hidden');
    feedback.className = 'mt-4 text-center text-sm font-medium text-gray-600';
    feedback.textContent = 'Speichere Einstellungen...';

    // Collect settings from checkboxes
    const toggles = document.querySelectorAll('.widget-toggle');
    const newSettings = {};

    toggles.forEach(toggle => {
        const widgetId = toggle.getAttribute('data-widget-id');
        newSettings[widgetId] = toggle.checked;
    });

    // Save to Supabase
    const success = await saveWidgetSettings(newSettings);

    if (success) {
        // Update current settings
        currentSettings = newSettings;

        // Apply to dashboard
        applyWidgetSettings();

        // Show success message
        feedback.className = 'mt-4 text-center text-sm font-medium text-green-600';
        feedback.textContent = '✓ Einstellungen gespeichert!';

        // Close modal after delay
        setTimeout(() => {
            closeWidgetSettingsModal();
        }, 1500);
    } else {
        // Show error message
        feedback.className = 'mt-4 text-center text-sm font-medium text-red-600';
        feedback.textContent = '✗ Fehler beim Speichern. Bitte versuche es erneut.';
    }
}

/**
 * Reset widget settings to defaults
 */
async function resetWidgetSettings() {
    if (!confirm('Möchtest du alle Widgets auf die Standardeinstellungen zurücksetzen?')) {
        return;
    }

    console.log('[Widget System] Resetting to default settings');

    const defaultSettings = getDefaultSettings();

    // Save defaults to Supabase
    const success = await saveWidgetSettings(defaultSettings);

    if (success) {
        // Update current settings
        currentSettings = defaultSettings;

        // Apply to dashboard
        applyWidgetSettings();

        // Refresh modal
        closeWidgetSettingsModal();
        openWidgetSettingsModal();

        // Show feedback
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
 * Get current widget settings (for debugging)
 * @returns {Object} Current settings
 */
export function getCurrentWidgetSettings() {
    return { ...currentSettings };
}

/**
 * Check if a specific widget is visible
 * @param {string} widgetId - Widget ID to check
 * @returns {boolean} True if visible
 */
export function isWidgetVisible(widgetId) {
    return currentSettings[widgetId] !== false;
}
