/**
 * SC Champions SPA - Haupteinstiegspunkt (Supabase Version)
 */

import { router, viewLoader } from './router.js';
import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { suppressConsoleLogs } from './utils/logger.js';

// Debug-Logs in Produktion unterdrücken
suppressConsoleLogs();

const supabase = getSupabase();

// Module-Cache verhindert erneute Initialisierung bei Navigation
const loadedModules = new Map();
let currentModuleCleanup = null;

/**
 * Lädt ein Seiten-Modul und führt dessen Init- und Cleanup-Funktionen aus
 * @param {string} modulePath - Pfad zum Modul
 */
async function loadPageModule(modulePath) {
    try {
        if (currentModuleCleanup) {
            await currentModuleCleanup();
            currentModuleCleanup = null;
        }

        const module = await import(modulePath + '?t=' + Date.now());

        if (module.cleanup) {
            currentModuleCleanup = module.cleanup;
        }

        if (module.init) {
            await module.init();
        }

        return module;
    } catch (error) {
        console.error(`Failed to load module ${modulePath}:`, error);
    }
}

/**
 * Lädt eine Seite inkl. HTML, Styles und JS-Modul
 * @param {string} htmlPath - Pfad zur HTML-Datei
 * @param {string} jsPath - Pfad zum JS-Modul (optional)
 */
async function loadPage(htmlPath, jsPath = null) {
    showLoader();

    try {
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${htmlPath}`);
        }

        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const title = doc.querySelector('title');
        if (title) {
            document.title = title.textContent;
        }

        const styles = doc.querySelectorAll('style');
        const existingStyles = document.querySelectorAll('style[data-page]');
        existingStyles.forEach(style => style.remove());

        styles.forEach(style => {
            const newStyle = document.createElement('style');
            newStyle.textContent = style.textContent;
            newStyle.setAttribute('data-page', 'true');
            document.head.appendChild(newStyle);
        });

        const bodyContent = doc.body.innerHTML;
        const bodyClass = doc.body.className;

        document.body.className = bodyClass;

        viewLoader.loadHTML(bodyContent);

        const scripts = doc.querySelectorAll('script[type="module"]');
        scripts.forEach(script => {
            const src = script.getAttribute('src');
            if (src && jsPath && src.includes(jsPath.replace('/js/', ''))) {
                loadPageModule(src);
            }
        });

        if (
            jsPath &&
            !Array.from(scripts).find(s =>
                s.getAttribute('src')?.includes(jsPath.replace('/js/', ''))
            )
        ) {
            await loadPageModule(jsPath);
        }

        hideLoader();
    } catch (error) {
        console.error('Failed to load page:', error);
        hideLoader();
        router.navigate('/404');
    }
}

function showLoader() {
    const loader = document.getElementById('spa-loader');
    if (loader) {
        loader.classList.remove('hidden');
    }
}

function hideLoader() {
    const loader = document.getElementById('spa-loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

/**
 * Prüft Authentifizierung und leitet bei Fehler um
 */
function requireAuth(redirectTo = '/') {
    return new Promise(async (resolve, reject) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();

            if (session && session.user) {
                resolve(session.user);
            } else {
                router.navigate(redirectTo);
                reject(new Error('Not authenticated'));
            }
        } catch (error) {
            console.error('Auth check error:', error);
            router.navigate(redirectTo);
            reject(error);
        }
    });
}

router
    // Öffentliche Routen
    .on('/', async () => {
        // Landing Page bleibt außerhalb der SPA
        window.location.href = '/index.html';
    })
    .on('/faq', async () => {
        window.location.href = '/faq.html';
    })

    // Authentifizierung
    .on('/register', async () => {
        window.location.href = '/register.html';
    })
    .on('/onboarding', async () => {
        try {
            await requireAuth('/');
            window.location.href = '/onboarding.html';
        } catch (error) {
            console.log('Authentication required');
        }
    })

    // Geschützte Routen - Spieler (SPA)
    .on('/dashboard', async () => {
        try {
            await requireAuth('/');
            await loadPage('/dashboard.html', '/js/dashboard-supabase.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })
    .on('/settings', async () => {
        try {
            await requireAuth('/');
            await loadPage('/settings.html', '/js/settings-supabase.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })

    // Geschützte Routen - Trainer
    .on('/coach', async () => {
        try {
            await requireAuth('/');
            await loadPage('/coach.html', '/js/coach-supabase.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })

    // Geschützte Routen - Admin
    .on('/admin', async () => {
        try {
            await requireAuth('/');
            await loadPage('/admin.html', '/js/admin-supabase.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })

    .on('/404', async () => {
        window.location.href = '/404.html';
    });

router.beforeNavigate(async path => {
    console.log('Navigating to:', path);
    return true;
});

router.afterNavigate(async path => {
    // Bei Navigation nach oben scrollen für bessere UX
    window.scrollTo(0, 0);
    console.log('Navigation complete:', path);
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('SC Champions SPA (Supabase) initialized');
    router.start();
});

// Globaler Zugriff für andere Module
export { router, supabase, requireAuth };
