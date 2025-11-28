import {
    doc,
    updateDoc,
    getDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Leaderboard Preferences Module
 * Handles user preferences for which leaderboard tabs to show/hide
 */

// Default preferences - all enabled (for club members)
const DEFAULT_PREFERENCES = {
    effort: true,
    season: true,
    skill: true,
    ranks: true,
    doubles: true,
};

// Default preferences for players without club
const DEFAULT_PREFERENCES_NO_CLUB = {
    effort: false,    // Hidden for club-less players
    season: false,    // Hidden for club-less players
    skill: true,      // Visible (global skill ranking)
    ranks: false,     // Hidden for club-less players
    doubles: true,    // Visible (global doubles ranking)
};

/**
 * Gets default preferences based on user's club status
 * @param {Object} userData - Current user data
 * @returns {Object} Default preferences
 */
function getDefaultPreferences(userData) {
    const hasClub = userData.clubId !== null && userData.clubId !== undefined;
    return hasClub ? DEFAULT_PREFERENCES : DEFAULT_PREFERENCES_NO_CLUB;
}

/**
 * Initializes leaderboard preferences UI and event listeners
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
export function initializeLeaderboardPreferences(userData, db) {
    // Load saved preferences (or set defaults if first time)
    loadPreferences(userData);

    // Add change listeners to all checkboxes
    const checkboxes = document.querySelectorAll('.leaderboard-pref-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
            await savePreferences(userData, db);
            applyPreferences();
        });
    });

    // Apply preferences immediately
    applyPreferences();
}

/**
 * Loads preferences from userData and updates UI
 * @param {Object} userData - User data containing preferences
 */
function loadPreferences(userData) {
    const defaultPrefs = getDefaultPreferences(userData);
    const prefs = userData.leaderboardPreferences || defaultPrefs;

    // Update checkboxes
    document.getElementById('pref-effort').checked = prefs.effort !== false;
    document.getElementById('pref-season').checked = prefs.season !== false;
    document.getElementById('pref-skill').checked = prefs.skill !== false;
    document.getElementById('pref-ranks').checked = prefs.ranks !== false;
    document.getElementById('pref-doubles').checked = prefs.doubles !== false;
}

/**
 * Saves current preferences to Firestore
 * @param {Object} userData - Current user data
 * @param {Object} db - Firestore database instance
 */
async function savePreferences(userData, db) {
    const prefs = {
        effort: document.getElementById('pref-effort').checked,
        season: document.getElementById('pref-season').checked,
        skill: document.getElementById('pref-skill').checked,
        ranks: document.getElementById('pref-ranks').checked,
        doubles: document.getElementById('pref-doubles').checked,
    };

    try {
        const userRef = doc(db, 'users', userData.id);
        await updateDoc(userRef, {
            leaderboardPreferences: prefs,
        });
        console.log('Leaderboard preferences saved:', prefs);
    } catch (error) {
        console.error('Error saving leaderboard preferences:', error);
    }
}

/**
 * Applies preferences by showing/hiding leaderboard tabs
 */
export function applyPreferences() {
    const prefs = {
        effort: document.getElementById('pref-effort')?.checked ?? true,
        season: document.getElementById('pref-season')?.checked ?? true,
        skill: document.getElementById('pref-skill')?.checked ?? true,
        ranks: document.getElementById('pref-ranks')?.checked ?? true,
        doubles: document.getElementById('pref-doubles')?.checked ?? true,
    };

    // Show/hide tab buttons
    const tabButtons = {
        effort: document.getElementById('tab-effort'),
        season: document.getElementById('tab-season'),
        skill: document.getElementById('tab-skill'),
        ranks: document.getElementById('tab-ranks'),
        doubles: document.getElementById('tab-doubles'),
    };

    // Apply visibility
    Object.keys(tabButtons).forEach(key => {
        const button = tabButtons[key];
        if (button) {
            if (prefs[key]) {
                button.classList.remove('hidden');
            } else {
                button.classList.add('hidden');
            }
        }
    });

    // If the currently active tab was hidden, switch to the first visible tab
    ensureValidActiveTab(prefs);
}

/**
 * Ensures that a visible tab is active
 * @param {Object} prefs - Current preferences
 */
function ensureValidActiveTab(prefs) {
    const tabButtons = document.querySelectorAll('.leaderboard-tab-btn');
    let hasActiveVisibleTab = false;

    // Check if current active tab is visible
    tabButtons.forEach(button => {
        if (
            button.classList.contains('border-indigo-600') &&
            !button.classList.contains('hidden')
        ) {
            hasActiveVisibleTab = true;
        }
    });

    // If no visible tab is active, activate the first visible one
    if (!hasActiveVisibleTab) {
        const firstVisibleButton = Array.from(tabButtons).find(
            btn => !btn.classList.contains('hidden')
        );
        if (firstVisibleButton) {
            firstVisibleButton.click();
        }
    }
}

/**
 * Gets current user preferences
 * @returns {Object} Current preferences
 */
export function getCurrentPreferences() {
    return {
        effort: document.getElementById('pref-effort')?.checked ?? true,
        season: document.getElementById('pref-season')?.checked ?? true,
        skill: document.getElementById('pref-skill')?.checked ?? true,
        ranks: document.getElementById('pref-ranks')?.checked ?? true,
        doubles: document.getElementById('pref-doubles')?.checked ?? true,
    };
}
