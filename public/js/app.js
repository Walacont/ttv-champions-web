/**
 * TTV Champions SPA - Main Application Entry Point
 * Initializes the router and defines all routes
 */

import { router, viewLoader } from './router.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Track loaded modules to prevent re-initialization
const loadedModules = new Map();
let currentModuleCleanup = null;

/**
 * Load and execute a JavaScript module for a page
 * @param {string} modulePath - Path to the module
 */
async function loadPageModule(modulePath) {
    try {
        // Clean up previous module if it has cleanup function
        if (currentModuleCleanup) {
            await currentModuleCleanup();
            currentModuleCleanup = null;
        }

        // Import the module dynamically
        const module = await import(modulePath + '?t=' + Date.now());

        // If module exports a cleanup function, store it
        if (module.cleanup) {
            currentModuleCleanup = module.cleanup;
        }

        // If module exports an init function, call it
        if (module.init) {
            await module.init();
        }

        return module;
    } catch (error) {
        console.error(`Failed to load module ${modulePath}:`, error);
    }
}

/**
 * Load a page view with its content
 * @param {string} htmlPath - Path to HTML file
 * @param {string} jsPath - Path to JS module (optional)
 */
async function loadPage(htmlPath, jsPath = null) {
    // Show loader
    showLoader();

    try {
        // Load HTML content
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${htmlPath}`);
        }

        const html = await response.text();

        // Parse HTML and extract body content
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Extract and update title
        const title = doc.querySelector('title');
        if (title) {
            document.title = title.textContent;
        }

        // Extract styles from the page
        const styles = doc.querySelectorAll('style');
        const existingStyles = document.querySelectorAll('style[data-page]');
        existingStyles.forEach(style => style.remove());

        styles.forEach(style => {
            const newStyle = document.createElement('style');
            newStyle.textContent = style.textContent;
            newStyle.setAttribute('data-page', 'true');
            document.head.appendChild(newStyle);
        });

        // Get body content and class
        const bodyContent = doc.body.innerHTML;
        const bodyClass = doc.body.className;

        // Update body class
        document.body.className = bodyClass;

        // Load content into container
        viewLoader.loadHTML(bodyContent);

        // Extract and execute inline script modules from the original page
        const scripts = doc.querySelectorAll('script[type="module"]');
        scripts.forEach(script => {
            const src = script.getAttribute('src');
            if (src && jsPath && src.includes(jsPath.replace('/js/', ''))) {
                // Load the module
                loadPageModule(src);
            }
        });

        // If jsPath explicitly provided, load it
        if (jsPath && !Array.from(scripts).find(s => s.getAttribute('src')?.includes(jsPath.replace('/js/', '')))) {
            await loadPageModule(jsPath);
        }

        // Hide loader
        hideLoader();

    } catch (error) {
        console.error('Failed to load page:', error);
        hideLoader();
        router.navigate('/404');
    }
}

/**
 * Show loading indicator
 */
function showLoader() {
    const loader = document.getElementById('spa-loader');
    if (loader) {
        loader.classList.remove('hidden');
    }
}

/**
 * Hide loading indicator
 */
function hideLoader() {
    const loader = document.getElementById('spa-loader');
    if (loader) {
        loader.classList.add('hidden');
    }
}

/**
 * Check if user is authenticated
 */
function requireAuth(redirectTo = '/') {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            if (user) {
                resolve(user);
            } else {
                router.navigate(redirectTo);
                reject(new Error('Not authenticated'));
            }
        });
    });
}

// Define all routes
router
    // Public routes
    .on('/', async () => {
        // Redirect to landing page (index.html) - kept separate from SPA
        window.location.href = '/index.html';
    })
    .on('/faq', async () => {
        // FAQ can be loaded dynamically or kept separate
        window.location.href = '/faq.html';
    })

    // Authentication routes
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

    // Protected routes - Player (SPA routes)
    .on('/dashboard', async () => {
        try {
            await requireAuth('/');
            await loadPage('/dashboard.html', '/js/dashboard.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })
    .on('/settings', async () => {
        try {
            await requireAuth('/');
            await loadPage('/settings.html', '/js/settings.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })

    // Protected routes - Coach
    .on('/coach', async () => {
        try {
            await requireAuth('/');
            await loadPage('/coach.html', '/js/coach.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })

    // Protected routes - Admin
    .on('/admin', async () => {
        try {
            await requireAuth('/');
            await loadPage('/admin.html', '/js/admin.js');
        } catch (error) {
            console.log('Authentication required');
        }
    })

    // 404 page
    .on('/404', async () => {
        window.location.href = '/404.html';
    });

// Navigation guards
router.beforeNavigate(async (path) => {
    console.log('Navigating to:', path);
    return true; // Allow navigation
});

router.afterNavigate(async (path) => {
    // Scroll to top on navigation
    window.scrollTo(0, 0);
    console.log('Navigation complete:', path);
});

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('TTV Champions SPA initialized');
    router.start();
});

// Export for global access if needed
export { router, auth, app, requireAuth };
