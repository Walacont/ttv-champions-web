/** UI Utilities - Tab-Navigation und Countdown-Timer */

import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

// Cache für Season-Enddatum (verhindert wiederholte Firestore-Abfragen)
let cachedSeasonEnd = null;
let lastFetchTime = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 Stunde

/**
 * Lädt das Season-Enddatum aus Firestore
 * @param {Object} db - Firestore-Instanz
 * @returns {Promise<Date>} Enddatum der aktuellen Season
 */
async function fetchSeasonEndDate(db) {
    try {
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

            cachedSeasonEnd = seasonEnd;
            lastFetchTime = Date.now();

            console.log(
                '📅 Season end date loaded from Firestore:',
                seasonEnd.toLocaleString('de-DE')
            );
            return seasonEnd;
        } else {
            // Fallback falls keine Config existiert
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

        const now = new Date();
        const sixWeeksInMs = 6 * 7 * 24 * 60 * 60 * 1000;
        return new Date(now.getTime() + sixWeeksInMs);
    }
}

/**
 * Richtet Tab-Navigation ein
 * @param {string} defaultTab - Standard-Tab (z.B. 'overview', 'dashboard')
 */
export function setupTabs(defaultTab = 'overview') {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const defaultButton = document.querySelector(`.tab-button[data-tab="${defaultTab}"]`);

    tabButtons.forEach(btn => btn.classList.remove('tab-active'));
    tabContents.forEach(content => content.classList.add('hidden'));

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
 * Aktualisiert den Season-Countdown
 * @param {string} elementId - ID des Countdown-Elements
 * @param {boolean} reloadOnEnd - Seite beim Season-Ende neu laden
 * @param {Object} db - Firestore-Instanz (erforderlich)
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
 * @param {Object} db - Firestore-Instanz
 * @returns {Promise<Date>} Season-Enddatum
 */
export async function getSeasonEndDate(db) {
    return await fetchSeasonEndDate(db);
}

/**
 * @param {Object} db - Firestore-Instanz
 * @returns {Promise<string>} Formatiertes Datum (z.B. "15.12.2025")
 */
export async function formatSeasonEndDate(db) {
    const endDate = await fetchSeasonEndDate(db);
    const day = String(endDate.getDate()).padStart(2, '0');
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const year = endDate.getFullYear();

    return `${day}.${month}.${year}`;
}

/**
 * Gibt den Season-Key zurück (Format: "MONAT-JAHR")
 * @param {Object} db - Firestore-Instanz
 * @returns {Promise<string>} Season-Key (z.B. "11-2025")
 */
export async function getCurrentSeasonKey(db) {
    try {
        const configRef = doc(db, 'config', 'seasonReset');
        const configDoc = await getDoc(configRef);

        if (configDoc.exists()) {
            const data = configDoc.data();
            const lastResetDate = data.lastResetDate.toDate();

            // Key basiert auf Startdatum der Season
            return `${lastResetDate.getMonth() + 1}-${lastResetDate.getFullYear()}`;
        } else {
            const now = new Date();
            return `${now.getMonth() + 1}-${now.getFullYear()}`;
        }
    } catch (error) {
        console.error('Error getting season key:', error);
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    }
}

// ============================================
// DATUMSFORMATIERUNG
// ============================================

/**
 * Formatiert Datum im deutschen Format
 * @param {Object|Date} timestamp - Firestore-Timestamp oder Date-Objekt
 * @param {Object} options - Optionen: includeTime, shortFormat
 * @returns {string} Formatiertes Datum
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
 * Formatiert Zeitpunkt relativ (z.B. "vor 5 Minuten")
 * @param {Object|Date} timestamp - Firestore-Timestamp oder Date-Objekt
 * @returns {string} Relative Zeitangabe
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
// ZAHLENFORMATIERUNG
// ============================================

/**
 * Formatiert Punkte mit Vorzeichen
 * @param {number} points - Punktwert
 * @param {boolean} alwaysShowSign - Immer Vorzeichen anzeigen
 * @returns {string} Formatierte Punkte (z.B. "+15", "-5")
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
 * Formatiert XP mit optionalem Suffix
 * @param {number} xp - XP-Wert
 * @param {boolean} showSuffix - "XP"-Suffix anzeigen
 * @returns {string} Formatierte XP (z.B. "1.250 XP")
 */
export function formatXP(xp, showSuffix = true) {
    if (xp === null || xp === undefined) return showSuffix ? '0 XP' : '0';
    const num = Number(xp);
    if (isNaN(num)) return showSuffix ? '0 XP' : '0';

    const formatted = num.toLocaleString('de-DE');
    return showSuffix ? `${formatted} XP` : formatted;
}

/**
 * @param {number} elo - Elo-Wert
 * @returns {string} Formatierte Elo
 */
export function formatElo(elo) {
    if (elo === null || elo === undefined) return '800';
    const num = Number(elo);
    if (isNaN(num)) return '800';
    return Math.round(num).toString();
}

/**
 * Formatiert Prozent
 * @param {number} value - Wert (0-100 oder 0-1)
 * @param {boolean} isDecimal - true wenn Wert 0-1 ist
 * @returns {string} Formatierter Prozentsatz (z.B. "75%")
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
 * Berechnet Satzgewinne aus einem Sets-Array
 * @param {Array} sets - Array von Set-Objekten mit Punkteständen
 * @param {string} playerKey - Key für Spieler-Score ('playerA', 'teamA', etc.)
 * @param {string} opponentKey - Key für Gegner-Score ('playerB', 'teamB', etc.)
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

        // Satz ist gewonnen bei >= 11 Punkten und min. 2 Punkte Vorsprung
        if (playerScore >= 11 && playerScore > opponentScore) {
            playerWins++;
        } else if (opponentScore >= 11 && opponentScore > playerScore) {
            opponentWins++;
        }
    });

    return { playerWins, opponentWins };
}

/**
 * @param {number} winsA - Satzgewinne Spieler/Team A
 * @param {number} winsB - Satzgewinne Spieler/Team B
 * @returns {string} Formatiertes Ergebnis (z.B. "3:1")
 */
export function formatMatchResult(winsA, winsB) {
    return `${winsA}:${winsB}`;
}

/**
 * @param {number} playerWins - Satzgewinne des Spielers
 * @param {number} opponentWins - Satzgewinne des Gegners
 * @returns {string} 'win', 'loss' oder 'draw'
 */
export function getMatchOutcome(playerWins, opponentWins) {
    if (playerWins > opponentWins) return 'win';
    if (playerWins < opponentWins) return 'loss';
    return 'draw';
}

// ============================================
// LISTENER MANAGER
// ============================================

/** Verwaltet Firestore-Listener (verhindert Memory Leaks) */
class ListenerManager {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Fügt einen Listener hinzu
     * @param {string} key - Eindeutiger Identifier
     * @param {Function} unsubscribe - unsubscribe-Funktion von onSnapshot
     */
    add(key, unsubscribe) {
        // Verhindert doppelte Listener mit gleichem Key
        if (this.listeners.has(key)) {
            this.remove(key);
        }
        this.listeners.set(key, unsubscribe);
    }

    /**
     * @param {string} key - Listener-Key zum Entfernen
     */
    remove(key) {
        const unsubscribe = this.listeners.get(key);
        if (unsubscribe && typeof unsubscribe === 'function') {
            try {
                unsubscribe();
            } catch (e) {
                console.warn(`Error unsubscribing listener ${key}:`, e);
            }
        }
        this.listeners.delete(key);
    }

    /** Entfernt alle Listener */
    clear() {
        this.listeners.forEach((unsubscribe, key) => {
            try {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            } catch (e) {
                console.warn(`Error unsubscribing listener ${key}:`, e);
            }
        });
        this.listeners.clear();
    }

    /** @returns {number} Anzahl aktiver Listener */
    get size() {
        return this.listeners.size;
    }
}

export const listenerManager = new ListenerManager();

// Cleanup bei Seitenverlassen
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        listenerManager.clear();
    });
}

// ============================================
// FEHLERBEHANDLUNG
// ============================================

/**
 * Umschließt async-Funktion mit Fehlerbehandlung
 * @param {Function} fn - Async-Funktion zum Wrappen
 * @param {Object} options - Optionen: context, onError, fallback
 * @returns {Function} Gewrappte Funktion
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
 * Zeigt Fehlermeldung an
 * @param {string} message - Fehlermeldung
 * @param {string} elementId - ID des Elements (optional)
 * @param {number} duration - Anzeigedauer in ms
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

    // Fallback falls kein Element angegeben
    console.error(message);
}

/**
 * Zeigt Erfolgsmeldung an
 * @param {string} message - Erfolgsmeldung
 * @param {string} elementId - ID des Elements
 * @param {number} duration - Anzeigedauer in ms
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
// LAZY LOADING
// ============================================

const moduleCache = new Map();

/**
 * Lädt Modul lazy und cached es
 * @param {string} modulePath - Pfad zum Modul
 * @returns {Promise<Object>} Geladenes Modul
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
 * Lädt Module im Hintergrund vor
 * @param {Array<string>} modulePaths - Array von Modul-Pfaden
 */
export function preloadModules(modulePaths) {
    modulePaths.forEach(path => {
        // requestIdleCallback nutzen falls verfügbar (bessere Performance)
        const schedulePreload = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
        schedulePreload(() => {
            lazyLoad(path).catch(() => {
                // Preload-Fehler stillschweigend ignorieren
            });
        });
    });
}

// ============================================
// DEBOUNCE / THROTTLE
// ============================================

/**
 * @param {Function} fn - Funktion zum Debouncing
 * @param {number} delay - Verzögerung in Millisekunden
 * @returns {Function} Gedebouncte Funktion
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * @param {Function} fn - Funktion zum Throttling
 * @param {number} limit - Minimale Zeit zwischen Aufrufen in ms
 * @returns {Function} Gethrottlete Funktion
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
// ALTERSGRUPPEN
// ============================================

/** Altersgruppen-Definitionen für automatische Filterung */
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

export const GENDER_GROUPS = [
    { id: 'gender_all', label: 'Alle', value: null },
    { id: 'male', label: 'Männlich', value: 'male' },
    { id: 'female', label: 'Weiblich', value: 'female' },
];

/**
 * Berechnet Alter aus Geburtsdatum
 * @param {Object|Date|string} birthdate - Firestore-Timestamp, Date oder String
 * @returns {number|null} Alter in Jahren
 */
export function calculateAge(birthdate) {
    if (!birthdate) return null;

    let date;
    if (birthdate.toDate) {
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

    // Anpassung falls Geburtstag in diesem Jahr noch nicht war
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
        age--;
    }

    return age;
}

/**
 * Prüft ob Spieler zu Altersgruppe gehört
 * @param {number} age - Alter des Spielers
 * @param {string} ageGroupId - Altersgruppen-ID (z.B. 'u15', 'o40')
 * @returns {boolean}
 */
export function isInAgeGroup(age, ageGroupId) {
    if (age === null || age === undefined) return false;

    const youthGroup = AGE_GROUPS.youth.find(g => g.id === ageGroupId);
    if (youthGroup) {
        return age <= youthGroup.maxAge;
    }

    const adultGroup = AGE_GROUPS.adults.find(g => g.id === ageGroupId);
    if (adultGroup) {
        return age >= adultGroup.minAge && age <= adultGroup.maxAge;
    }

    const seniorGroup = AGE_GROUPS.seniors.find(g => g.id === ageGroupId);
    if (seniorGroup) {
        return age >= seniorGroup.minAge;
    }

    return false;
}

/**
 * Filtert Spieler nach Altersgruppe
 * @param {Array} players - Array von Spieler-Objekten
 * @param {string} ageGroupId - Altersgruppen-ID
 * @returns {Array} Gefilterte Spieler
 */
export function filterPlayersByAgeGroup(players, ageGroupId) {
    return players.filter(player => {
        const age = calculateAge(player.birthdate);
        return isInAgeGroup(age, ageGroupId);
    });
}

/**
 * @param {string} filterValue - Filterwert zum Prüfen
 * @returns {boolean} true wenn Altersgruppen-Filter
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
 * @param {string} filterValue - Filterwert zum Prüfen
 * @returns {boolean} true wenn Geschlechts-Filter
 */
export function isGenderFilter(filterValue) {
    if (!filterValue) return false;
    return GENDER_GROUPS.some(g => g.id === filterValue);
}

/**
 * Filtert Spieler nach Geschlecht
 * @param {Array} players - Array von Spieler-Objekten
 * @param {string} genderId - Geschlechts-ID ('gender_all', 'male', 'female')
 * @returns {Array} Gefilterte Spieler
 */
export function filterPlayersByGender(players, genderId) {
    // 'gender_all' gibt alle Spieler zurück
    if (genderId === 'gender_all') return players;

    const genderGroup = GENDER_GROUPS.find(g => g.id === genderId);
    if (!genderGroup || !genderGroup.value) return players;

    return players.filter(player => player.gender === genderGroup.value);
}

