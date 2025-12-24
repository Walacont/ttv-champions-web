// i18n Module - Internationalization for SC Champions
// Uses i18next for translations

import i18next from 'https://cdn.jsdelivr.net/npm/i18next@23.16.4/+esm';
import HttpBackend from 'https://cdn.jsdelivr.net/npm/i18next-http-backend@2.6.2/+esm';

let i18nInitialized = false;
const DEFAULT_LANGUAGE = 'de';
const STORAGE_KEY = 'app_language';

/**
 * Initialize i18next with HTTP backend
 * @returns {Promise<void>}
 */
async function initI18n() {
    if (i18nInitialized) {
        return i18next;
    }

    // Get saved language preference
    const savedLanguage = await getStoredLanguage();

    await i18next
        .use(HttpBackend)
        .init({
            lng: savedLanguage || DEFAULT_LANGUAGE,
            fallbackLng: DEFAULT_LANGUAGE,
            debug: false,
            backend: {
                loadPath: '/locales/{{lng}}/translation.json',
            },
            interpolation: {
                escapeValue: false, // Not needed for DOM manipulation
            },
        });

    i18nInitialized = true;
    return i18next;
}

/**
 * Get stored language from Capacitor Preferences or localStorage
 * @returns {Promise<string|null>}
 */
async function getStoredLanguage() {
    try {
        // Try Capacitor Preferences first (for native apps)
        if (window.Capacitor?.Plugins?.Preferences) {
            const { Preferences } = window.Capacitor.Plugins;
            const { value } = await Preferences.get({ key: STORAGE_KEY });
            return value;
        }
    } catch (error) {
        console.warn('Capacitor Preferences not available, using localStorage:', error);
    }

    // Fallback to localStorage (for web)
    return localStorage.getItem(STORAGE_KEY);
}

/**
 * Store language preference in Capacitor Preferences or localStorage
 * @param {string} language - Language code (e.g., 'de', 'en')
 * @returns {Promise<void>}
 */
async function storeLanguage(language) {
    try {
        // Try Capacitor Preferences first (for native apps)
        if (window.Capacitor?.Plugins?.Preferences) {
            const { Preferences } = window.Capacitor.Plugins;
            await Preferences.set({ key: STORAGE_KEY, value: language });
        }
    } catch (error) {
        console.warn('Capacitor Preferences not available, using localStorage:', error);
    }

    // Always also store in localStorage for web compatibility
    localStorage.setItem(STORAGE_KEY, language);
}

/**
 * Change the current language
 * @param {string} language - Language code (e.g., 'de', 'en')
 * @returns {Promise<void>}
 */
async function changeLanguage(language) {
    await i18next.changeLanguage(language);
    await storeLanguage(language);

    // Update HTML lang attribute
    document.documentElement.lang = language;

    // Dispatch custom event for components to react to language change
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language } }));
}

/**
 * Translate a key
 * @param {string} key - Translation key (e.g., 'settings.title')
 * @param {Object} [options] - Interpolation options
 * @returns {string}
 */
function t(key, options = {}) {
    if (!i18nInitialized) {
        console.warn('i18n not initialized yet, returning key:', key);
        return key;
    }
    return i18next.t(key, options);
}

/**
 * Get current language
 * @returns {string}
 */
function getCurrentLanguage() {
    return i18next.language || DEFAULT_LANGUAGE;
}

/**
 * Get available languages
 * @returns {string[]}
 */
function getAvailableLanguages() {
    return ['de', 'en', 'zh'];
}

/**
 * Translate all elements with data-i18n attribute
 * Usage: <h1 data-i18n="settings.title"></h1>
 * For HTML content: <div data-i18n-html="faq.answers.eloVsXp"></div>
 */
function translatePage() {
    // Don't translate if i18n isn't initialized yet - keep fallback text
    if (!i18nInitialized) {
        console.warn('translatePage called before i18n initialized, skipping');
        return;
    }

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach((element) => {
        const key = element.getAttribute('data-i18n');
        const translation = t(key);

        // Only update if we got a real translation (not the key itself)
        if (translation && translation !== key) {
            // Check if element has data-i18n-attr for attribute translation
            const attr = element.getAttribute('data-i18n-attr');
            if (attr) {
                element.setAttribute(attr, translation);
            } else {
                element.textContent = translation;
            }
        }
    });

    // Handle HTML content translations
    const htmlElements = document.querySelectorAll('[data-i18n-html]');
    htmlElements.forEach((element) => {
        const key = element.getAttribute('data-i18n-html');
        const translation = t(key);
        // Only update if we got a real translation
        if (translation && translation !== key) {
            element.innerHTML = translation;
        }
    });

    // Handle placeholder translations
    const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
    placeholderElements.forEach((element) => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = t(key);
        // Only update if we got a real translation
        if (translation && translation !== key) {
            element.placeholder = translation;
        }
    });
}

/**
 * Auto-translate page when language changes
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
