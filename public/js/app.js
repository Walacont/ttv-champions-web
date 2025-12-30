// SC Champions SPA - Hauptanwendungs-Einstiegspunkt

import { router, viewLoader } from './router.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const loadedModules = new Map();
let currentModuleCleanup = null;

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
        console.error(`Modul ${modulePath} konnte nicht geladen werden:`, error);
    }
}

async function loadPage(htmlPath, jsPath = null) {
    showLoader();

    try {
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`${htmlPath} konnte nicht geladen werden`);
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
        console.error('Seite konnte nicht geladen werden:', error);
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

function requireAuth(redirectTo = '/') {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, user => {
            unsubscribe();
            if (user) {
                resolve(user);
            } else {
                router.navigate(redirectTo);
                reject(new Error('Nicht authentifiziert'));
            }
        });
    });
}

router
    .on('/', async () => {
        window.location.href = '/index.html';
    })
    .on('/faq', async () => {
        window.location.href = '/faq.html';
    })
    .on('/register', async () => {
        window.location.href = '/register.html';
    })
    .on('/onboarding', async () => {
        try {
            await requireAuth('/');
            window.location.href = '/onboarding.html';
        } catch (error) {
            console.log('Authentifizierung erforderlich');
        }
    })
    .on('/dashboard', async () => {
        try {
            await requireAuth('/');
            await loadPage('/dashboard.html', '/js/dashboard.js');
        } catch (error) {
            console.log('Authentifizierung erforderlich');
        }
    })
    .on('/settings', async () => {
        try {
            await requireAuth('/');
            await loadPage('/settings.html', '/js/settings.js');
        } catch (error) {
            console.log('Authentifizierung erforderlich');
        }
    })
    .on('/coach', async () => {
        try {
            await requireAuth('/');
            await loadPage('/coach.html', '/js/coach.js');
        } catch (error) {
            console.log('Authentifizierung erforderlich');
        }
    })
    .on('/admin', async () => {
        try {
            await requireAuth('/');
            await loadPage('/admin.html', '/js/admin.js');
        } catch (error) {
            console.log('Authentifizierung erforderlich');
        }
    })
    .on('/404', async () => {
        window.location.href = '/404.html';
    });

router.beforeNavigate(async path => {
    console.log('Navigiere zu:', path);
    return true;
});

router.afterNavigate(async path => {
    window.scrollTo(0, 0);
    console.log('Navigation abgeschlossen:', path);
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('SC Champions SPA initialisiert');
    router.start();
});

export { router, auth, app, requireAuth };
