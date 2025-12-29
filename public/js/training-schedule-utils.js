/**
 * Training Schedule Utility Functions
 * Pure functions for date/time validation and manipulation
 * No Firebase dependencies - safe for unit testing
 */

/**
 * Check if time format is valid (HH:MM)
 * @param {string} time - Time string to validate
 * @returns {boolean}
 */
export function isValidTimeFormat(time) {
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
}

/**
 * Check if date format is valid (YYYY-MM-DD)
 * @param {string} date - Date string to validate
 * @returns {boolean}
 */
export function isValidDateFormat(date) {
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Check if two time ranges overlap
 * @param {string} start1 - Start time of first range (HH:MM)
 * @param {string} end1 - End time of first range (HH:MM)
 * @param {string} start2 - Start time of second range (HH:MM)
 * @param {string} end2 - End time of second range (HH:MM)
 * @returns {boolean}
 */
export function timeRangesOverlap(start1, end1, start2, end2) {
    return start1 < end2 && end1 > start2;
}

/**
 * Get all dates in a range
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array<string>} Array of dates in YYYY-MM-DD format
 */
export function getDatesInRange(startDate, endDate) {
    const dates = [];
    const currentDate = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    while (currentDate <= end) {
        dates.push(formatDate(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

/**
 * Format date to YYYY-MM-DD
 * @param {Date} date - Date object to format
 * @returns {string}
 */
export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Get day of week name in German
 * @param {number} dayOfWeek - 0=Sunday, 6=Saturday
 * @returns {string}
 */
export function getDayOfWeekName(dayOfWeek) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return days[dayOfWeek];
}

/**
 * Format time range for display
 * @param {string} startTime - HH:MM
 * @param {string} endTime - HH:MM
 * @returns {string} "16:00-17:00"
 */
export function formatTimeRange(startTime, endTime) {
    return `${startTime}-${endTime}`;
}
