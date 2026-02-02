// i18n Modul - Internationalisierung für SC Champions
// Nutzt i18next für Übersetzungen

import { i18next } from '/vendor/i18next.js';
import { HttpBackend } from '/vendor/i18next.js';

let i18nInitialized = false;
const DEFAULT_LANGUAGE = 'de';
const STORAGE_KEY = 'app_language';

/**
 * Initialisiert i18next mit HTTP-Backend
 * @returns {Promise<void>}
 */
async function initI18n(timeoutMs = 5000) {
    if (i18nInitialized) {
        return i18next;
    }

    try {
        const savedLanguage = await getStoredLanguage();

        await Promise.race([
            i18next
                .use(HttpBackend)
                .init({
                    lng: savedLanguage || DEFAULT_LANGUAGE,
                    fallbackLng: DEFAULT_LANGUAGE,
                    debug: false,
                    backend: {
                        loadPath: '/locales/{{lng}}/translation.json',
                    },
                    interpolation: {
                        // Nicht nötig bei DOM-Manipulation
                        escapeValue: false,
                    },
                }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('i18n init timeout')), timeoutMs)
            )
        ]);

        i18nInitialized = true;
        return i18next;
    } catch (error) {
        console.warn('[i18n] Initialization failed or timed out:', error.message);
        // Mark as initialized anyway so the app can proceed with fallback keys
        i18nInitialized = true;
        return i18next;
    }
}

/**
 * Holt gespeicherte Sprache aus Capacitor Preferences oder localStorage
 * @returns {Promise<string|null>}
 */
async function getStoredLanguage() {
    try {
        // Zuerst Capacitor Preferences versuchen (für native Apps)
        if (window.Capacitor?.Plugins?.Preferences) {
            const { Preferences } = window.Capacitor.Plugins;
            const { value } = await Preferences.get({ key: STORAGE_KEY });
            return value;
        }
    } catch (error) {
        console.warn('Capacitor Preferences nicht verfügbar, nutze localStorage:', error);
    }

    // Fallback auf localStorage (für Web)
    return localStorage.getItem(STORAGE_KEY);
}

/**
 * Speichert Spracheinstellung in Capacitor Preferences oder localStorage
 * @param {string} language - Sprachcode (z.B. 'de', 'en')
 * @returns {Promise<void>}
 */
async function storeLanguage(language) {
    try {
        // Zuerst Capacitor Preferences versuchen (für native Apps)
        if (window.Capacitor?.Plugins?.Preferences) {
            const { Preferences } = window.Capacitor.Plugins;
            await Preferences.set({ key: STORAGE_KEY, value: language });
        }
    } catch (error) {
        console.warn('Capacitor Preferences nicht verfügbar, nutze localStorage:', error);
    }

    // Immer auch in localStorage speichern für Web-Kompatibilität
    localStorage.setItem(STORAGE_KEY, language);
}

/**
 * Ändert die aktuelle Sprache
 * @param {string} language - Sprachcode (z.B. 'de', 'en')
 * @returns {Promise<void>}
 */
async function changeLanguage(language) {
    await i18next.changeLanguage(language);
    await storeLanguage(language);

    document.documentElement.lang = language;

    // Event wird geworfen, damit Komponenten auf Sprachwechsel reagieren können
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
}

/**
 * Übersetzt einen Schlüssel
 * @param {string} key - Übersetzungsschlüssel (z.B. 'settings.title')
 * @param {Object} [options] - Interpolations-Optionen
 * @returns {string}
 */
function t(key, options = {}) {
    if (!i18nInitialized) {
        console.warn('i18n noch nicht initialisiert, gebe Schlüssel zurück:', key);
        return key;
    }
    return i18next.t(key, options);
}

/**
 * Gibt aktuelle Sprache zurück
 * @returns {string}
 */
function getCurrentLanguage() {
    return i18next.language || DEFAULT_LANGUAGE;
}

/**
 * Gibt verfügbare Sprachen zurück
 * @returns {string[]}
 */
function getAvailableLanguages() {
    return ['de', 'en', 'zh'];
}

/**
 * Übersetzt alle Elemente mit data-i18n-Attribut
 * Beispiel: <h1 data-i18n="settings.title"></h1>
 * Für HTML-Inhalt: <div data-i18n-html="faq.answers.eloVsXp"></div>
 */
function translatePage() {
    // Nicht übersetzen falls i18n noch nicht initialisiert - Fallback-Text behalten
    if (!i18nInitialized) {
        console.warn('translatePage vor i18n-Initialisierung aufgerufen, überspringe');
        return;
    }

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((element) => {
        const key = element.getAttribute('data-i18n');
        const translation = t(key);

        // Nur aktualisieren wenn echte Übersetzung vorhanden (nicht der Schlüssel selbst)
        if (translation && translation !== key) {
            const attr = element.getAttribute('data-i18n-attr');
            if (attr) {
                element.setAttribute(attr, translation);
            } else {
                element.textContent = translation;
            }
        }
    });

    const htmlElements = document.querySelectorAll('[data-i18n-html]');
    htmlElements.forEach((element) => {
        const key = element.getAttribute('data-i18n-html');
        const translation = t(key);
        // Nur aktualisieren wenn echte Übersetzung vorhanden
        if (translation && translation !== key) {
            element.innerHTML = translation;
        }
    });

    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach((element) => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = t(key);
        // Nur aktualisieren wenn echte Übersetzung vorhanden
        if (translation && translation !== key) {
            element.placeholder = translation;
        }
    });
}

/**
 * Richtet automatische Seitenübersetzung bei Sprachwechsel ein
 */
function setupAutoTranslate() {
    window.addEventListener('languageChanged', () => {
        translatePage();
    });
}

export {
    initI18n,
    changeLanguage,
    t,
    getCurrentLanguage,
    getAvailableLanguages,
    translatePage,
    setupAutoTranslate,
    getStoredLanguage,
    storeLanguage,
};
