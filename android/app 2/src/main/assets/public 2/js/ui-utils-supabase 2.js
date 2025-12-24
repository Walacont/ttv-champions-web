/**
 * UI Utils Module (Supabase Version)
 * Common UI utility functions for tabs and countdown timers
 */

// Module-level cache for season end date
let cachedSeasonEnd = null;
let cachedSeasonName = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Cache key includes sportId for sport-specific caching
let cachedSportId = null;

/**
 * Fetches the season end date from seasons table
 * @param {Object} supabase - Supabase client instance
 * @param {string} sportId - Optional sport ID to filter by user's active sport
 * @returns {Promise<Date|null>} The end date of the current season, or null if no active season
 */
async function fetchSeasonEndDate(supabase, sportId = null) {
    try {
        // Check cache first (only if sportId matches)
        const cacheValid = cachedSeasonEnd !== undefined &&
                          lastFetchTime &&
                          Date.now() - lastFetchTime < CACHE_DURATION &&
                          cachedSportId === sportId;
        if (cacheValid) {
            return cachedSeasonEnd;
        }

        // Fetch active season from seasons table
        let query = supabase
            .from('seasons')
            .select('id, name, start_date, end_date, sport_id')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        // Filter by user's sport if provided
        if (sportId) {
            query = query.eq('sport_id', sportId);
        }

        const { data: activeSeasons, error } = await query;

        if (!error && activeSeasons && activeSeasons.length > 0) {
            // Use the first active season for the user's sport
            const activeSeason = activeSeasons[0];
            const seasonEnd = new Date(activeSeason.end_date);

            // Cache the result (including sportId for cache key)
            cachedSeasonEnd = seasonEnd;
            cachedSeasonName = activeSeason.name;
            cachedSportId = sportId;
            lastFetchTime = Date.now();

            console.log(
                '📅 Season end date loaded from seasons table:',
                seasonEnd.toLocaleString('de-DE'),
                `(${activeSeason.name})`
            );
            return seasonEnd;
        }

        // No active season found - return null to indicate season pause
        console.log('📅 No active season found for sport:', sportId || 'all');
        cachedSeasonEnd = null;
        cachedSeasonName = null;
        cachedSportId = sportId;
        lastFetchTime = Date.now();

        return null;

    } catch (error) {
        console.error('Error fetching season end date:', error);
        return null;
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
 * @param {Object} supabase - Supabase client instance (required)
 * @param {string} sportId - Optional sport ID to filter by user's active sport
 */
export async function updateSeasonCountdown(
    elementId = 'season-countdown',
    reloadOnEnd = false,
    supabase = null,
    sportId = null
) {
    const seasonCountdownEl = document.getElementById(elementId);
    if (!seasonCountdownEl) return;

    if (!supabase) {
        console.error('Supabase instance required for season countdown');
        seasonCountdownEl.textContent = 'Lädt...';
        return;
    }

    const endOfSeason = await fetchSeasonEndDate(supabase, sportId);

    // No active season - show pause message
    if (!endOfSeason) {
        seasonCountdownEl.textContent = 'Saisonpause';
        seasonCountdownEl.title = 'Aktuell ist keine Saison aktiv für diese Sportart';
        return;
    }

    const now = new Date();
    const diff = endOfSeason - now;

    if (diff <= 0) {
        seasonCountdownEl.textContent = 'Saison beendet!';

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
    seasonCountdownEl.title = cachedSeasonName ? `Saison: ${cachedSeasonName}` : '';
}

/**
 * Gets the current season end date
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Date>} The end date of the current season
 */
export async function getSeasonEndDate(supabase) {
    return await fetchSeasonEndDate(supabase);
}

/**
 * Formats the season end date for display
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string>} Formatted date string (e.g., "15.12.2025")
 */
export async function formatSeasonEndDate(supabase) {
    const endDate = await fetchSeasonEndDate(supabase);
    const day = String(endDate.getDate()).padStart(2, '0');
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const year = endDate.getFullYear();

    return `${day}.${month}.${year}`;
}

/**
 * Gets the current season key (format: "MONTH-YEAR" based on season start date)
 * Used for tracking which season a milestone was completed in
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<string>} Season key (e.g., "11-2025")
 */
export async function getCurrentSeasonKey(supabase) {
    try {
        // Try to get active season from seasons table
        const { data: activeSeasons, error } = await supabase
            .from('seasons')
            .select('id, name, start_date')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1);

        if (!error && activeSeasons && activeSeasons.length > 0) {
            const startDate = new Date(activeSeasons[0].start_date);
            return `${startDate.getMonth() + 1}-${startDate.getFullYear()}`;
        }

        // Fallback: Try old config table
        const { data: configData } = await supabase
            .from('config')
            .select('value')
            .eq('key', 'seasonReset')
            .single();

        if (configData && configData.value) {
            const lastResetDate = new Date(configData.value.lastResetDate);
            return `${lastResetDate.getMonth() + 1}-${lastResetDate.getFullYear()}`;
        }

        // Final fallback: Use current month/year
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    } catch (error) {
        console.error('Error getting season key:', error);
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    }
}

// ============================================
// DATE FORMATTING UTILITIES
// ============================================

/**
 * Formats a timestamp or Date to German date format
 * @param {Object|Date} timestamp - Timestamp or Date object
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeTime - Include time in output (default: false)
 * @param {boolean} options.shortFormat - Use short format like "15.12." (default: false)
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp, options = {}) {
    const { includeTime = false, shortFormat = false } = options;

    if (!timestamp) return '—';

    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

        if (isNaN(date.getTime())) return '—';

        if (shortFormat) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${day}.${month}.`;
        }

        const dateStr = date.toLocaleDateString('de-DE');

        if (includeTime) {
            const timeStr = date.toLocaleTimeString('de-DE', {
                hour: '2-digit',
                minute: '2-digit'
            });
            return `${dateStr}, ${timeStr}`;
        }

        return dateStr;
    } catch (e) {
        return '—';
    }
}

/**
 * Formats a timestamp to relative time (e.g., "vor 5 Minuten")
 * @param {Object|Date} timestamp - Timestamp or Date object
 * @returns {string} Relative time string
 */
export function formatRelativeTime(timestamp) {
    if (!timestamp) return '—';

    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSec < 60) return 'gerade eben';
        if (diffMin < 60) return `vor ${diffMin} Min.`;
        if (diffHours < 24) return `vor ${diffHours} Std.`;
        if (diffDays === 1) return 'gestern';
        if (diffDays < 7) return `vor ${diffDays} Tagen`;

        return formatDate(timestamp);
    } catch (e) {
        return '—';
    }
}

// ============================================
// NUMBER FORMATTING UTILITIES
// ============================================

/**
 * Formats points with sign prefix
 * @param {number} points - Points value
 * @param {boolean} alwaysShowSign - Always show + or - (default: true)
 * @returns {string} Formatted points string (e.g., "+15", "-5")
 */
export function formatPoints(points, alwaysShowSign = true) {
    if (points === null || points === undefined) return '0';
    const num = Number(points);
    if (isNaN(num)) return '0';

    if (alwaysShowSign) {
        return num >= 0 ? `+${num}` : `${num}`;
    }
    return `${num}`;
}

/**
 * Formats XP with optional suffix
 * @param {number} xp - XP value
 * @param {boolean} showSuffix - Show "XP" suffix (default: true)
 * @returns {string} Formatted XP string (e.g., "1.250 XP")
 */
export function formatXP(xp, showSuffix = true) {
    if (xp === null || xp === undefined) return showSuffix ? '0 XP' : '0';
    const num = Number(xp);
    if (isNaN(num)) return showSuffix ? '0 XP' : '0';

    const formatted = num.toLocaleString('de-DE');
    return showSuffix ? `${formatted} XP` : formatted;
}

/**
 * Formats Elo rating
 * @param {number} elo - Elo value
 * @returns {string} Formatted Elo string
 */
export function formatElo(elo) {
    if (elo === null || elo === undefined) return '800';
    const num = Number(elo);
    if (isNaN(num)) return '800';
    return Math.round(num).toString();
}

/**
 * Formats percentage
 * @param {number} value - Value (0-100 or 0-1)
 * @param {boolean} isDecimal - If true, value is 0-1 and will be multiplied by 100
 * @returns {string} Formatted percentage (e.g., "75%")
 */
export function formatPercent(value, isDecimal = false) {
    if (value === null || value === undefined) return '0%';
    let num = Number(value);
    if (isNaN(num)) return '0%';
    if (isDecimal) num *= 100;
    return `${Math.round(num)}%`;
}

// ============================================
// MATCH UTILITIES
// ============================================

/**
 * Calculates wins from a sets array
 * @param {Array} sets - Array of set objects with score properties
 * @param {string} playerKey - Key for player score ('playerA', 'teamA', etc.)
 * @param {string} opponentKey - Key for opponent score ('playerB', 'teamB', etc.)
 * @returns {Object} { playerWins, opponentWins }
 */
export function calculateSetWins(sets, playerKey = 'playerA', opponentKey = 'playerB') {
    if (!sets || !Array.isArray(sets)) {
        return { playerWins: 0, opponentWins: 0 };
    }

    let playerWins = 0;
    let opponentWins = 0;

    sets.forEach(set => {
        const playerScore = set[playerKey] || 0;
        const opponentScore = set[opponentKey] || 0;

        // A set is won if score >= 11 and lead >= 2
        if (playerScore >= 11 && playerScore > opponentScore) {
            playerWins++;
        } else if (opponentScore >= 11 && opponentScore > playerScore) {
            opponentWins++;
        }
    });

    return { playerWins, opponentWins };
}

/**
 * Formats a match result string
 * @param {number} winsA - Wins for player/team A
 * @param {number} winsB - Wins for player/team B
 * @returns {string} Formatted result (e.g., "3:1")
 */
export function formatMatchResult(winsA, winsB) {
    return `${winsA}:${winsB}`;
}

/**
 * Determines match outcome for a player
 * @param {number} playerWins - Player's set wins
 * @param {number} opponentWins - Opponent's set wins
 * @returns {string} 'win', 'loss', or 'draw'
 */
export function getMatchOutcome(playerWins, opponentWins) {
    if (playerWins > opponentWins) return 'win';
    if (playerWins < opponentWins) return 'loss';
    return 'draw';
}

// ============================================
// LISTENER MANAGER
// ============================================

/**
 * Manages Supabase subscriptions to prevent memory leaks
 */
class ListenerManager {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Adds a listener with a key
     * @param {string} key - Unique identifier for the listener
     * @param {Object} subscription - The subscription object returned by Supabase
     */
    add(key, subscription) {
        // Cleanup existing listener with same key
        if (this.listeners.has(key)) {
            this.remove(key);
        }
        this.listeners.set(key, subscription);
    }

    /**
     * Removes and unsubscribes a listener
     * @param {string} key - The listener key to remove
     */
    remove(key) {
        const subscription = this.listeners.get(key);
        if (subscription) {
            try {
                if (typeof subscription.unsubscribe === 'function') {
                    subscription.unsubscribe();
                } else if (typeof subscription === 'function') {
                    subscription();
                }
            } catch (e) {
                console.warn(`Error unsubscribing listener ${key}:`, e);
            }
        }
        this.listeners.delete(key);
    }

    /**
     * Removes all listeners
     */
    clear() {
        this.listeners.forEach((subscription, key) => {
            try {
                if (typeof subscription.unsubscribe === 'function') {
                    subscription.unsubscribe();
                } else if (typeof subscription === 'function') {
                    subscription();
                }
            } catch (e) {
                console.warn(`Error unsubscribing listener ${key}:`, e);
            }
        });
        this.listeners.clear();
    }

    /**
     * Gets the count of active listeners
     * @returns {number}
     */
    get size() {
        return this.listeners.size;
    }
}

// Singleton instance
export const listenerManager = new ListenerManager();

// Cleanup on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        listenerManager.clear();
    });
}

// ============================================
// ERROR HANDLING UTILITIES
// ============================================

/**
 * Wraps an async function with error handling
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Options
 * @param {string} options.context - Context for error messages
 * @param {Function} options.onError - Custom error handler
 * @param {*} options.fallback - Fallback value on error
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, options = {}) {
    const { context = 'Operation', onError, fallback = null } = options;

    return async (...args) => {
        try {
            return await fn(...args);
        } catch (error) {
            console.error(`[${context}] Error:`, error.message || error);

            if (onError && typeof onError === 'function') {
                onError(error);
            }

            return fallback;
        }
    };
}

/**
 * Shows a user-friendly error message
 * @param {string} message - Error message to display
 * @param {string} elementId - ID of element to show error in (optional)
 * @param {number} duration - How long to show the message in ms (default: 5000)
 */
export function showError(message, elementId = null, duration = 5000) {
    if (elementId) {
        const el = document.getElementById(elementId);
        if (el) {
            el.textContent = message;
            el.className = 'text-red-600 text-sm font-medium';
            if (duration > 0) {
                setTimeout(() => {
                    el.textContent = '';
                }, duration);
            }
            return;
        }
    }

    // Fallback: Show toast or console
    console.error(message);
}

/**
 * Shows a success message
 * @param {string} message - Success message to display
 * @param {string} elementId - ID of element to show message in
 * @param {number} duration - How long to show the message in ms (default: 3000)
 */
export function showSuccess(message, elementId, duration = 3000) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = 'text-green-600 text-sm font-medium';
        if (duration > 0) {
            setTimeout(() => {
                el.textContent = '';
            }, duration);
        }
    }
}

// ============================================
// LAZY LOADING UTILITIES
// ============================================

// Cache for loaded modules
const moduleCache = new Map();

/**
 * Lazy loads a module and caches it
 * @param {string} modulePath - Path to the module
 * @returns {Promise<Object>} The loaded module
 */
export async function lazyLoad(modulePath) {
    if (moduleCache.has(modulePath)) {
        return moduleCache.get(modulePath);
    }

    try {
        const module = await import(modulePath);
        moduleCache.set(modulePath, module);
        return module;
    } catch (error) {
        console.error(`[LazyLoad] Failed to load module: ${modulePath}`, error);
        throw error;
    }
}

/**
 * Preloads modules in the background
 * @param {Array<string>} modulePaths - Array of module paths to preload
 */
export function preloadModules(modulePaths) {
    modulePaths.forEach(path => {
        // Use requestIdleCallback if available, otherwise setTimeout
        const schedulePreload = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
        schedulePreload(() => {
            lazyLoad(path).catch(() => {
                // Silently ignore preload errors
            });
        });
    });
}

// ============================================
// DEBOUNCE / THROTTLE UTILITIES
// ============================================

/**
 * Debounces a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttles a function
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit = 100) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

// ============================================
// AGE GROUP UTILITIES
// ============================================

/**
 * Age group definitions for automatic filtering
 * Youth groups (under X years) and Senior groups (over X years)
 */
export const AGE_GROUPS = {
    youth: [
        { id: 'u11', label: 'U11', maxAge: 10 },
        { id: 'u13', label: 'U13', maxAge: 12 },
        { id: 'u15', label: 'U15', maxAge: 14 },
        { id: 'u17', label: 'U17', maxAge: 16 },
        { id: 'u19', label: 'U19', maxAge: 18 },
    ],
    adults: [
        { id: 'adult', label: 'Erwachsene (18-39)', minAge: 18, maxAge: 39 },
    ],
    seniors: [
        { id: 'o40', label: 'Ü40', minAge: 40 },
        { id: 'o45', label: 'Ü45', minAge: 45 },
        { id: 'o50', label: 'Ü50', minAge: 50 },
        { id: 'o55', label: 'Ü55', minAge: 55 },
        { id: 'o60', label: 'Ü60', minAge: 60 },
        { id: 'o65', label: 'Ü65', minAge: 65 },
        { id: 'o70', label: 'Ü70', minAge: 70 },
        { id: 'o75', label: 'Ü75', minAge: 75 },
        { id: 'o80', label: 'Ü80', minAge: 80 },
        { id: 'o85', label: 'Ü85', minAge: 85 },
    ],
};

/**
 * Gender filter definitions
 */
export const GENDER_GROUPS = [
    { id: 'gender_all', label: 'Alle', value: null },
    { id: 'male', label: 'Männlich', value: 'male' },
    { id: 'female', label: 'Weiblich', value: 'female' },
];

/**
 * Calculates age from birthdate
 * @param {Object|Date|string} birthdate - Timestamp, Date object, or date string
 * @returns {number|null} Age in years, or null if birthdate is invalid
 */
export function calculateAge(birthdate) {
    if (!birthdate) return null;

    let date;
    if (birthdate.toDate) {
        // Timestamp
        date = birthdate.toDate();
    } else if (birthdate instanceof Date) {
        date = birthdate;
    } else {
        date = new Date(birthdate);
    }

    if (isNaN(date.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDiff = today.getMonth() - date.getMonth();

    // Adjust if birthday hasn't occurred yet this year
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
        age--;
    }

    return age;
}

/**
 * Checks if a player belongs to a specific age group
 * @param {number} age - Player's age
 * @param {string} ageGroupId - Age group ID (e.g., 'u15', 'o40')
 * @returns {boolean} True if player belongs to the age group
 */
export function isInAgeGroup(age, ageGroupId) {
    if (age === null || age === undefined) return false;

    // Check youth groups
    const youthGroup = AGE_GROUPS.youth.find(g => g.id === ageGroupId);
    if (youthGroup) {
        return age <= youthGroup.maxAge;
    }

    // Check adults group (has both minAge and maxAge)
    const adultGroup = AGE_GROUPS.adults.find(g => g.id === ageGroupId);
    if (adultGroup) {
        return age >= adultGroup.minAge && age <= adultGroup.maxAge;
    }

    // Check senior groups
    const seniorGroup = AGE_GROUPS.seniors.find(g => g.id === ageGroupId);
    if (seniorGroup) {
        return age >= seniorGroup.minAge;
    }

    return false;
}

/**
 * Filters players by age group
 * @param {Array} players - Array of player objects with birthdate field
 * @param {string} ageGroupId - Age group ID (e.g., 'u15', 'o40')
 * @returns {Array} Filtered players
 */
export function filterPlayersByAgeGroup(players, ageGroupId) {
    return players.filter(player => {
        const age = calculateAge(player.birthdate);
        return isInAgeGroup(age, ageGroupId);
    });
}

/**
 * Checks if a filter value is an age group
 * @param {string} filterValue - Filter value to check
 * @returns {boolean} True if it's an age group filter
 */
export function isAgeGroupFilter(filterValue) {
    if (!filterValue) return false;
    return (
        AGE_GROUPS.youth.some(g => g.id === filterValue) ||
        AGE_GROUPS.adults.some(g => g.id === filterValue) ||
        AGE_GROUPS.seniors.some(g => g.id === filterValue)
    );
}

/**
 * Checks if a filter value is a gender filter
 * @param {string} filterValue - Filter value to check
 * @returns {boolean} True if it's a gender filter
 */
export function isGenderFilter(filterValue) {
    if (!filterValue) return false;
    return GENDER_GROUPS.some(g => g.id === filterValue);
}

/**
 * Filters players by gender
 * @param {Array} players - Array of player objects with gender field
 * @param {string} genderId - Gender ID ('gender_all', 'male', 'female')
 * @returns {Array} Filtered players
 */
export function filterPlayersByGender(players, genderId) {
    // 'gender_all' returns all players (no filtering)
    if (genderId === 'gender_all') return players;

    const genderGroup = GENDER_GROUPS.find(g => g.id === genderId);
    if (!genderGroup || !genderGroup.value) return players;

    return players.filter(player => player.gender === genderGroup.value);
}
