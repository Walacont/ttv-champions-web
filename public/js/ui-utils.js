/**
 * UI Utils Module
 * Common UI utility functions for tabs and countdown timers
 */

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
 * Season ends on the 15th of each month or at end of month
 * @param {string} elementId - The ID of the countdown element (default: 'season-countdown')
 * @param {boolean} reloadOnEnd - Whether to reload the page when season ends (default: false for coach, true for player)
 */
export function updateSeasonCountdown(elementId = 'season-countdown', reloadOnEnd = false) {
    const seasonCountdownEl = document.getElementById(elementId);
    if (!seasonCountdownEl) return;

    const now = new Date();
    let endOfSeason;

    // Season ends either on the 15th or at month end
    if (now.getDate() < 15) {
        endOfSeason = new Date(now.getFullYear(), now.getMonth(), 15, 0, 0, 0);
    } else {
        endOfSeason = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    const diff = endOfSeason - now;

    if (diff <= 0) {
        seasonCountdownEl.textContent = "Saison beendet!";
        if (reloadOnEnd) {
            setTimeout(() => window.location.reload(), 5000);
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
 * Season ends either on the 15th or at month end
 * @returns {Date} The end date of the current season
 */
export function getSeasonEndDate() {
    const now = new Date();
    let endOfSeason;

    // Season ends either on the 15th or at month end
    if (now.getDate() < 15) {
        endOfSeason = new Date(now.getFullYear(), now.getMonth(), 15, 23, 59, 59);
    } else {
        endOfSeason = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }

    return endOfSeason;
}

/**
 * Formats the season end date for display
 * @returns {string} Formatted date string (e.g., "15.11.2025")
 */
export function formatSeasonEndDate() {
    const endDate = getSeasonEndDate();
    const day = String(endDate.getDate()).padStart(2, '0');
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const year = endDate.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Gets the current season key (format: "MONTH-YEAR")
 * Used for tracking which season a milestone was completed in
 * @returns {string} Season key (e.g., "11-2025")
 */
export function getCurrentSeasonKey() {
    const endDate = getSeasonEndDate();
    return `${endDate.getMonth() + 1}-${endDate.getFullYear()}`;
}
