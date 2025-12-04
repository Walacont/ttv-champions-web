/**
 * State Manager Module
 * Centralized state management for the application
 * Provides a reactive store with subscription capabilities
 */

// Initial state structure
const initialState = {
    // User state
    user: {
        id: null,
        data: null,
        isAuthenticated: false,
        role: null,
        clubId: null,
    },

    // UI state
    ui: {
        currentTab: 'overview',
        isLoading: false,
        error: null,
        subgroupFilter: 'club',
    },

    // Data caches
    cache: {
        clubPlayers: [],
        challenges: [],
        exercises: [],
    },
};

// Deep clone helper
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// Create the store
class StateManager {
    constructor() {
        this.state = deepClone(initialState);
        this.subscribers = new Map();
        this.subscriberId = 0;
    }

    /**
     * Gets the current state or a specific path
     * @param {string} path - Dot-notation path (e.g., 'user.data.firstName')
     * @returns {*} The state value
     */
    get(path = null) {
        if (!path) return deepClone(this.state);

        const keys = path.split('.');
        let value = this.state;

        for (const key of keys) {
            if (value === undefined || value === null) return undefined;
            value = value[key];
        }

        return value;
    }

    /**
     * Sets a value at a specific path
     * @param {string} path - Dot-notation path
     * @param {*} value - The value to set
     */
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.state;

        for (const key of keys) {
            if (current[key] === undefined) {
                current[key] = {};
            }
            current = current[key];
        }

        const oldValue = current[lastKey];
        current[lastKey] = value;

        // Notify subscribers
        this.notify(path, value, oldValue);
    }

    /**
     * Updates multiple values at once
     * @param {Object} updates - Object with path: value pairs
     */
    update(updates) {
        Object.entries(updates).forEach(([path, value]) => {
            this.set(path, value);
        });
    }

    /**
     * Resets state to initial values
     * @param {string} path - Optional path to reset only a portion
     */
    reset(path = null) {
        if (!path) {
            this.state = deepClone(initialState);
            this.notify('', this.state, null);
            return;
        }

        const keys = path.split('.');
        let initialValue = initialState;
        for (const key of keys) {
            initialValue = initialValue?.[key];
        }

        if (initialValue !== undefined) {
            this.set(path, deepClone(initialValue));
        }
    }

    /**
     * Subscribe to state changes
     * @param {string|Function} pathOrCallback - Path to watch or callback for all changes
     * @param {Function} callback - Callback function (if path provided)
     * @returns {Function} Unsubscribe function
     */
    subscribe(pathOrCallback, callback = null) {
        const id = ++this.subscriberId;

        if (typeof pathOrCallback === 'function') {
            // Subscribe to all changes
            this.subscribers.set(id, { path: '*', callback: pathOrCallback });
        } else {
            // Subscribe to specific path
            this.subscribers.set(id, { path: pathOrCallback, callback });
        }

        // Return unsubscribe function
        return () => {
            this.subscribers.delete(id);
        };
    }

    /**
     * Notify subscribers of changes
     * @param {string} changedPath - The path that changed
     * @param {*} newValue - The new value
     * @param {*} oldValue - The old value
     */
    notify(changedPath, newValue, oldValue) {
        this.subscribers.forEach(({ path, callback }) => {
            if (path === '*' || changedPath.startsWith(path) || path.startsWith(changedPath)) {
                try {
                    callback(newValue, oldValue, changedPath);
                } catch (e) {
                    console.error('State subscriber error:', e);
                }
            }
        });
    }

    // ============================================
    // CONVENIENCE METHODS
    // ============================================

    /**
     * Sets the current user data
     * @param {Object} userData - User data from database
     */
    setUser(userData) {
        this.update({
            'user.id': userData?.id || null,
            'user.data': userData || null,
            'user.isAuthenticated': !!userData,
            'user.role': userData?.role || null,
            'user.clubId': userData?.clubId || null,
        });
    }

    /**
     * Clears user data (logout)
     */
    clearUser() {
        this.reset('user');
    }

    /**
     * Sets loading state
     * @param {boolean} isLoading
     */
    setLoading(isLoading) {
        this.set('ui.isLoading', isLoading);
    }

    /**
     * Sets error state
     * @param {string|null} error
     */
    setError(error) {
        this.set('ui.error', error);
    }

    /**
     * Sets current tab
     * @param {string} tab
     */
    setTab(tab) {
        this.set('ui.currentTab', tab);
    }

    /**
     * Sets subgroup filter
     * @param {string} filter
     */
    setSubgroupFilter(filter) {
        this.set('ui.subgroupFilter', filter);
    }

    /**
     * Caches club players
     * @param {Array} players
     */
    setClubPlayers(players) {
        this.set('cache.clubPlayers', players);
    }

    /**
     * Gets cached club players
     * @returns {Array}
     */
    getClubPlayers() {
        return this.get('cache.clubPlayers') || [];
    }
}

// Singleton instance
export const appState = new StateManager();

// Export for debugging in console
if (typeof window !== 'undefined') {
    window.__appState = appState;
}
