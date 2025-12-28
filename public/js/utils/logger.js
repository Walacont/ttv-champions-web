/**
 * Logger Utility for SC Champions
 *
 * Provides controlled logging that can be disabled in production.
 * Also provides a way to globally suppress console.log in production.
 *
 * Usage:
 * 1. Import and use the logger directly:
 *    import { logger } from './utils/logger.js';
 *    logger.log('Debug message');
 *    logger.error('Error message');
 *
 * 2. Or suppress all console.log globally (for production):
 *    import { suppressConsoleLogs } from './utils/logger.js';
 *    suppressConsoleLogs(); // Call once at app startup
 */

// Determine if we're in production based on hostname
const isProduction = () => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    // localhost and 127.0.0.1 are development
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
};

// Log levels
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

// Current log level - in production, only show warnings and errors
let currentLogLevel = isProduction() ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;

/**
 * Set the minimum log level
 * @param {string} level - 'debug', 'info', 'warn', 'error', or 'none'
 */
export function setLogLevel(level) {
    const levelMap = {
        'debug': LOG_LEVELS.DEBUG,
        'info': LOG_LEVELS.INFO,
        'warn': LOG_LEVELS.WARN,
        'error': LOG_LEVELS.ERROR,
        'none': LOG_LEVELS.NONE
    };
    currentLogLevel = levelMap[level.toLowerCase()] ?? LOG_LEVELS.DEBUG;
}

/**
 * Logger object with methods for each log level
 */
export const logger = {
    /**
     * Debug level logging (development only)
     */
    debug(...args) {
        if (currentLogLevel <= LOG_LEVELS.DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    },

    /**
     * Info level logging
     */
    log(...args) {
        if (currentLogLevel <= LOG_LEVELS.INFO) {
            console.log(...args);
        }
    },

    /**
     * Info level logging (alias for log)
     */
    info(...args) {
        if (currentLogLevel <= LOG_LEVELS.INFO) {
            console.info('[INFO]', ...args);
        }
    },

    /**
     * Warning level logging
     */
    warn(...args) {
        if (currentLogLevel <= LOG_LEVELS.WARN) {
            console.warn(...args);
        }
    },

    /**
     * Error level logging (always shown unless level is NONE)
     */
    error(...args) {
        if (currentLogLevel <= LOG_LEVELS.ERROR) {
            console.error(...args);
        }
    },

    /**
     * Group logging
     */
    group(label) {
        if (currentLogLevel <= LOG_LEVELS.DEBUG) {
            console.group(label);
        }
    },

    groupEnd() {
        if (currentLogLevel <= LOG_LEVELS.DEBUG) {
            console.groupEnd();
        }
    },

    /**
     * Table logging
     */
    table(data) {
        if (currentLogLevel <= LOG_LEVELS.DEBUG) {
            console.table(data);
        }
    }
};

// Store original console methods
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

/**
 * Suppress console.log and console.debug in production
 * Keeps console.warn and console.error active
 * Call this once at app startup
 */
export function suppressConsoleLogs() {
    if (!isProduction()) {
        console.log('[Logger] Development mode - console logging enabled');
        return;
    }

    // Replace console.log and console.debug with no-op
    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};

    // Keep warn and error for important messages
    // console.warn and console.error remain unchanged

    console.warn('[Logger] Production mode - debug logging suppressed');
}

/**
 * Restore original console methods
 * Useful for debugging in production if needed
 */
export function restoreConsoleLogs() {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.warn('[Logger] Console logging restored');
}

/**
 * Check if we're in production mode
 */
export function isProductionMode() {
    return isProduction();
}

// Export default logger
export default logger;
