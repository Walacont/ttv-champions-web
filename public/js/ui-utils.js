/**
 * UI Utils Module
 * Common UI utility functions for tabs and countdown timers
 */

import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

// Module-level cache for season end date
let cachedSeasonEnd = null;
let lastFetchTime = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

/**
 * Fetches the season end date from Firestore config
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Date>} The end date of the current season
 */
async function fetchSeasonEndDate(db) {
    try {
        // Check cache first
        if (cachedSeasonEnd && lastFetchTime && Date.now() - lastFetchTime < CACHE_DURATION) {
            return cachedSeasonEnd;
        }

        const configRef = doc(db, 'config', 'seasonReset');
        const configDoc = await getDoc(configRef);

        if (configDoc.exists()) {
            const data = configDoc.data();
            const lastResetDate = data.lastResetDate.toDate();
            const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
            const seasonEnd = new Date(lastResetDate.getTime() + sixWeeksInMs);

            // Cache the result
            cachedSeasonEnd = seasonEnd;
            lastFetchTime = Date.now();

            console.log(
                '📅 Season end date loaded from Firestore:',
                seasonEnd.toLocaleString('de-DE')
            );
            return seasonEnd;
        } else {
            // Fallback: If no config exists, calculate from today + 6 weeks
            console.warn('⚠️ No season reset config found, using fallback calculation');
            const now = new Date();
            const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
            const fallbackEnd = new Date(now.getTime() + sixWeeksInMs);

            cachedSeasonEnd = fallbackEnd;
            lastFetchTime = Date.now();

            return fallbackEnd;
        }
    } catch (error) {
        console.error('Error fetching season end date:', error);

        // Fallback calculation
        const now = new Date();
        const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
        return new Date(now.getTime() + sixWeeksInMs);
    }
}

/**
 * Sets up tab navigation for both dashboard and coach views
 * @param {string} defaultTab - The default tab to show (e.g., 'overview', 'dashboard')
 */
export function setupTabs(defaultTab = 'overview') {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const defaultButton = document.querySelector(`.tab-button[data-tab="${defaultTab}"]`);

    // First, hide all tabs and remove all active states
    tabButtons.forEach(btn => btn.classList.remove('tab-active'));
    tabContents.forEach(content => content.classList.add('hidden'));

    // Then show only the default tab
    if (defaultButton) {
        defaultButton.classList.add('tab-active');
        const defaultContent = document.getElementById(`tab-content-${defaultTab}`);
        if (defaultContent) defaultContent.classList.remove('hidden');
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('tab-active'));
            tabContents.forEach(content => content.classList.add('hidden'));
            button.classList.add('tab-active');
            const targetContent = document.getElementById(`tab-content-${tabName}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    });
}

/**
 * Updates the season countdown timer
 * Shows countdown to the end of the 6-week season cycle
 * @param {string} elementId - The ID of the countdown element (default: 'season-countdown')
 * @param {boolean} reloadOnEnd - Whether to reload the page when season ends (default: false)
 * @param {Object} db - Firestore database instance (required)
 */
export async function updateSeasonCountdown(
    elementId = 'season-countdown',
    reloadOnEnd = false,
    db = null
) {
    const seasonCountdownEl = document.getElementById(elementId);
    if (!seasonCountdownEl) return;

    if (!db) {
        console.error('Firestore instance required for season countdown');
        seasonCountdownEl.textContent = 'Lädt...';
        return;
    }

    const now = new Date();
    const endOfSeason = await fetchSeasonEndDate(db);

    const diff = endOfSeason - now;

    if (diff <= 0) {
        seasonCountdownEl.textContent = 'Saison beendet! Wird automatisch zurückgesetzt...';

        if (reloadOnEnd) {
            console.log('🔄 Season ended, reloading page in 30 seconds...');
            setTimeout(() => window.location.reload(), 30000);
        }
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    seasonCountdownEl.textContent = `${days}T ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Gets the current season end date
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Date>} The end date of the current season
 */
export async function getSeasonEndDate(db) {
    return await fetchSeasonEndDate(db);
}

/**
 * Formats the season end date for display
 * @param {Object} db - Firestore database instance
 * @returns {Promise<string>} Formatted date string (e.g., "15.12.2025")
 */
export async function formatSeasonEndDate(db) {
    const endDate = await fetchSeasonEndDate(db);
    const day = String(endDate.getDate()).padStart(2, '0');
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const year = endDate.getFullYear();

    return `${day}.${month}.${year}`;
}

/**
 * Gets the current season key (format: "MONTH-YEAR" based on reset date)
 * Used for tracking which season a milestone was completed in
 * @param {Object} db - Firestore database instance
 * @returns {Promise<string>} Season key (e.g., "11-2025")
 */
export async function getCurrentSeasonKey(db) {
    try {
        const configRef = doc(db, 'config', 'seasonReset');
        const configDoc = await getDoc(configRef);

        if (configDoc.exists()) {
            const data = configDoc.data();
            const lastResetDate = data.lastResetDate.toDate();

            // Season key is based on the month/year when the season started (lastResetDate)
            return `${lastResetDate.getMonth() + 1}-${lastResetDate.getFullYear()}`;
        } else {
            // Fallback: Use current month/year
            const now = new Date();
            return `${now.getMonth() + 1}-${now.getFullYear()}`;
        }
    } catch (error) {
        console.error('Error getting season key:', error);
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    }
}
