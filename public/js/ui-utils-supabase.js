/** UI-Hilfsfunktionen (Supabase-Version) - Tabs und Countdown-Timer */

let cachedSeasonEnd = null;
let cachedSeasonName = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000;

let cachedSportId = null;
let cachedClubId = null;

/** Lädt das Saison-Enddatum aus der seasons-Tabelle */
async function fetchSeasonEndDate(supabase, sportId = null, clubId = null) {
    try {
        const cacheValid = cachedSeasonEnd !== undefined &&
                          lastFetchTime &&
                          Date.now() - lastFetchTime < CACHE_DURATION &&
                          cachedSportId === sportId &&
                          cachedClubId === clubId;
        if (cacheValid) {
            return cachedSeasonEnd;
        }

        let query = supabase
            .from('seasons')
            .select('id, name, start_date, end_date, sport_id, club_id')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (sportId) {
            query = query.eq('sport_id', sportId);
        }

        // Filter by club_id - eigene Vereins-Saisons ODER globale Saisons (club_id = null)
        if (clubId) {
            query = query.or(`club_id.eq.${clubId},club_id.is.null`);
        }

        const { data: activeSeasons, error } = await query;

        if (!error && activeSeasons && activeSeasons.length > 0) {
            // Prefer club-specific season over global (null club_id)
            const activeSeason = activeSeasons.find(s => s.club_id === clubId) || activeSeasons[0];
            const seasonEnd = new Date(activeSeason.end_date);

            cachedSeasonEnd = seasonEnd;
            cachedSeasonName = activeSeason.name;
            cachedSportId = sportId;
            cachedClubId = clubId;
            lastFetchTime = Date.now();

            console.log(
                '📅 Season end date loaded from seasons table:',
                seasonEnd.toLocaleString('de-DE'),
                `(${activeSeason.name})`,
                clubId ? `Club: ${clubId}` : ''
            );
            return seasonEnd;
        }

        console.log('📅 No active season found for sport:', sportId || 'all', 'club:', clubId || 'all');
        cachedSeasonEnd = null;
        cachedSeasonName = null;
        cachedSportId = sportId;
        cachedClubId = clubId;
        lastFetchTime = Date.now();

        return null;

    } catch (error) {
        console.error('Error fetching season end date:', error);
        return null;
    }
}

/** Initialisiert die Tab-Navigation */
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

/** Aktualisiert den Saison-Countdown-Timer */
export async function updateSeasonCountdown(
    elementId = 'season-countdown',
    reloadOnEnd = false,
    supabase = null,
    sportId = null,
    clubId = null
) {
    const seasonCountdownEl = document.getElementById(elementId);
    if (!seasonCountdownEl) return;

    if (!supabase) {
        console.error('Supabase instance required for season countdown');
        seasonCountdownEl.textContent = 'Saisonpause';
        seasonCountdownEl.title = 'Keine Saison-Daten verfügbar';
        return;
    }

    try {
        const endOfSeason = await fetchSeasonEndDate(supabase, sportId, clubId);

        if (!endOfSeason) {
            seasonCountdownEl.textContent = 'Saisonpause';
            seasonCountdownEl.title = 'Aktuell ist keine Saison aktiv - Head-Coach kann neue Saison starten';
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
    } catch (error) {
        console.error('Error updating season countdown:', error);
        seasonCountdownEl.textContent = 'Saisonpause';
        seasonCountdownEl.title = 'Fehler beim Laden der Saison-Daten';
    }
}

/** Gibt das aktuelle Saison-Enddatum zurück */
export async function getSeasonEndDate(supabase) {
    return await fetchSeasonEndDate(supabase);
}

/** Formatiert das Saison-Enddatum zur Anzeige */
export async function formatSeasonEndDate(supabase) {
    const endDate = await fetchSeasonEndDate(supabase);
    const day = String(endDate.getDate()).padStart(2, '0');
    const month = String(endDate.getMonth() + 1).padStart(2, '0');
    const year = endDate.getFullYear();

    return `${day}.${month}.${year}`;
}

/** Gibt den aktuellen Saison-Schlüssel zurück (Format: "MONAT-JAHR") */
export async function getCurrentSeasonKey(supabase) {
    try {
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

        const { data: configData } = await supabase
            .from('config')
            .select('value')
            .eq('key', 'seasonReset')
            .single();

        if (configData && configData.value) {
            const lastResetDate = new Date(configData.value.lastResetDate);
            return `${lastResetDate.getMonth() + 1}-${lastResetDate.getFullYear()}`;
        }

        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    } catch (error) {
        console.error('Error getting season key:', error);
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    }
}

/** Formatiert Zeitstempel ins deutsche Datumsformat */
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

/** Formatiert Zeitstempel als relative Zeit (z.B. "vor 5 Minuten") */
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

/** Formatiert Punkte mit Vorzeichen */
export function formatPoints(points, alwaysShowSign = true) {
    if (points === null || points === undefined) return '0';
    const num = Number(points);
    if (isNaN(num)) return '0';

    if (alwaysShowSign) {
        return num >= 0 ? `+${num}` : `${num}`;
    }
    return `${num}`;
}

/** Formatiert XP mit optionalem Suffix */
export function formatXP(xp, showSuffix = true) {
    if (xp === null || xp === undefined) return showSuffix ? '0 XP' : '0';
    const num = Number(xp);
    if (isNaN(num)) return showSuffix ? '0 XP' : '0';

    const formatted = num.toLocaleString('de-DE');
    return showSuffix ? `${formatted} XP` : formatted;
}

/** Formatiert Elo-Rating */
export function formatElo(elo) {
    if (elo === null || elo === undefined) return '800';
    const num = Number(elo);
    if (isNaN(num)) return '800';
    return Math.round(num).toString();
}

/** Formatiert Prozentwerte */
export function formatPercent(value, isDecimal = false) {
    if (value === null || value === undefined) return '0%';
    let num = Number(value);
    if (isNaN(num)) return '0%';
    if (isDecimal) num *= 100;
    return `${Math.round(num)}%`;
}

/** Berechnet Satzgewinne aus einem Satz-Array */
export function calculateSetWins(sets, playerKey = 'playerA', opponentKey = 'playerB') {
    if (!sets || !Array.isArray(sets)) {
        return { playerWins: 0, opponentWins: 0 };
    }

    let playerWins = 0;
    let opponentWins = 0;

    sets.forEach(set => {
        const playerScore = set[playerKey] || 0;
        const opponentScore = set[opponentKey] || 0;

        if (playerScore >= 11 && playerScore > opponentScore) {
            playerWins++;
        } else if (opponentScore >= 11 && opponentScore > playerScore) {
            opponentWins++;
        }
    });

    return { playerWins, opponentWins };
}

/** Formatiert ein Match-Ergebnis */
export function formatMatchResult(winsA, winsB) {
    return `${winsA}:${winsB}`;
}

/** Bestimmt das Match-Ergebnis für einen Spieler */
export function getMatchOutcome(playerWins, opponentWins) {
    if (playerWins > opponentWins) return 'win';
    if (playerWins < opponentWins) return 'loss';
    return 'draw';
}

/** Verwaltet Supabase-Subscriptions zur Vermeidung von Memory-Leaks */
class ListenerManager {
    constructor() {
        this.listeners = new Map();
    }

    add(key, subscription) {
        if (this.listeners.has(key)) {
            this.remove(key);
        }
        this.listeners.set(key, subscription);
    }

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

    get size() {
        return this.listeners.size;
    }
}

export const listenerManager = new ListenerManager();

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        listenerManager.clear();
    });
}

/** Wrapper für Async-Funktionen mit Fehlerbehandlung */
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

/** Zeigt eine benutzerfreundliche Fehlermeldung */
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

    console.error(message);
}

/** Zeigt eine Erfolgsmeldung */
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

const moduleCache = new Map();

/** Lädt ein Modul verzögert und cached es */
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

/** Lädt Module im Hintergrund vor */
export function preloadModules(modulePaths) {
    modulePaths.forEach(path => {
        const schedulePreload = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));
        schedulePreload(() => {
            lazyLoad(path).catch(() => {});
        });
    });
}

/** Debounce-Funktion */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/** Throttle-Funktion */
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

/** Geschlechter-Filter-Definitionen */
export const GENDER_GROUPS = [
    { id: 'gender_all', label: 'Alle', value: null },
    { id: 'male', label: 'Männlich', value: 'male' },
    { id: 'female', label: 'Weiblich', value: 'female' },
];

/** Berechnet das Alter aus dem Geburtsdatum */
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

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
        age--;
    }

    return age;
}

/** Prüft ob ein Spieler einer bestimmten Altersgruppe angehört */
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

/** Filtert Spieler nach Altersgruppe (schließt Spieler ohne Geburtsdatum aus) */
export function filterPlayersByAgeGroup(players, ageGroupId) {
    return players.filter(player => {
        if (!player.birthdate) return false;
        const age = calculateAge(player.birthdate);
        return isInAgeGroup(age, ageGroupId);
    });
}

/** Prüft ob ein Filterwert eine Altersgruppe ist */
export function isAgeGroupFilter(filterValue) {
    if (!filterValue) return false;
    return (
        AGE_GROUPS.youth.some(g => g.id === filterValue) ||
        AGE_GROUPS.adults.some(g => g.id === filterValue) ||
        AGE_GROUPS.seniors.some(g => g.id === filterValue)
    );
}

/** Prüft ob ein Filterwert ein Geschlechterfilter ist */
export function isGenderFilter(filterValue) {
    if (!filterValue) return false;
    return GENDER_GROUPS.some(g => g.id === filterValue);
}

/** Filtert Spieler nach Geschlecht (schließt Spieler ohne Geschlecht aus) */
export function filterPlayersByGender(players, genderId) {
    if (genderId === 'gender_all' || genderId === 'all') return players;

    const genderGroup = GENDER_GROUPS.find(g => g.id === genderId);
    if (!genderGroup || !genderGroup.value) return players;

    return players.filter(player => player.gender && player.gender === genderGroup.value);
}
