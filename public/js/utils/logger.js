// Logger-Utility für SC Champions
// Ermöglicht kontrolliertes Logging, das in Produktion deaktiviert werden kann

// Produktionsmodus basierend auf Hostname bestimmen
const isProduction = () => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return hostname !== 'localhost' && hostname !== '127.0.0.1';
};

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

// In Produktion nur Warnungen und Fehler anzeigen
let currentLogLevel = isProduction() ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;

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

export const logger = {
    debug(...args) {
        if (currentLogLevel <= LOG_LEVELS.DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    },

    log(...args) {
        if (currentLogLevel <= LOG_LEVELS.INFO) {
            console.log(...args);
        }
    },

    info(...args) {
        if (currentLogLevel <= LOG_LEVELS.INFO) {
            console.info('[INFO]', ...args);
        }
    },

    warn(...args) {
        if (currentLogLevel <= LOG_LEVELS.WARN) {
            console.warn(...args);
        }
    },

    error(...args) {
        if (currentLogLevel <= LOG_LEVELS.ERROR) {
            console.error(...args);
        }
    },

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

    table(data) {
        if (currentLogLevel <= LOG_LEVELS.DEBUG) {
            console.table(data);
        }
    }
};

const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

/**
 * console.log und console.debug in Produktion unterdrücken
 * console.warn und console.error bleiben aktiv
 */
export function suppressConsoleLogs() {
    if (!isProduction()) {
        console.log('[Logger] Development mode - console logging enabled');
        return;
    }

    console.log = () => {};
    console.debug = () => {};
    console.info = () => {};

    console.warn('[Logger] Production mode - debug logging suppressed');
}

/**
 * Originale Console-Methoden wiederherstellen
 */
export function restoreConsoleLogs() {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.warn('[Logger] Console logging restored');
}

export function isProductionMode() {
    return isProduction();
}

export default logger;
