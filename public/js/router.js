/**
 * Simple Client-Side Router for TTV Champions SPA
 * Handles navigation and view loading without page reloads
 */

class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.beforeNavigateCallbacks = [];
        this.afterNavigateCallbacks = [];

        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            this.loadRoute(window.location.pathname, false);
        });

        // Intercept all link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && this.isInternalLink(link)) {
                e.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });
    }

    /**
     * Register a route
     * @param {string} path - Route path (e.g., '/dashboard', '/')
     * @param {Function} handler - Async function that loads the view
     */
    on(path, handler) {
        this.routes[path] = handler;
        return this;
    }

    /**
     * Navigate to a route
     * @param {string} path - Path to navigate to
     * @param {boolean} pushState - Whether to push state to history
     */
    async navigate(path, pushState = true) {
        // Normalize path
        path = path || '/';

        // Run before navigate callbacks
        for (const callback of this.beforeNavigateCallbacks) {
            const result = await callback(path);
            if (result === false) return; // Cancel navigation
        }

        // Update browser history
        if (pushState && path !== window.location.pathname) {
            window.history.pushState({ path }, '', path);
        }

        // Load the route
        await this.loadRoute(path, pushState);

        // Run after navigate callbacks
        for (const callback of this.afterNavigateCallbacks) {
            await callback(path);
        }
    }

    /**
     * Load a route handler
     * @param {string} path - Path to load
     * @param {boolean} pushState - Whether this is a new navigation
     */
    async loadRoute(path, pushState = true) {
        // Find matching route
        const handler = this.routes[path] || this.routes['/404'];

        if (handler) {
            this.currentRoute = path;

            try {
                await handler();
            } catch (error) {
                console.error('Route loading error:', error);
                // Try to load 404 page
                if (this.routes['/404'] && path !== '/404') {
                    await this.routes['/404']();
                }
            }
        } else {
            console.warn(`No route found for ${path}`);
            // Fallback to 404
            if (this.routes['/404']) {
                await this.routes['/404']();
            }
        }
    }

    /**
     * Add callback before navigation
     * @param {Function} callback - Callback function
     */
    beforeNavigate(callback) {
        this.beforeNavigateCallbacks.push(callback);
        return this;
    }

    /**
     * Add callback after navigation
     * @param {Function} callback - Callback function
     */
    afterNavigate(callback) {
        this.afterNavigateCallbacks.push(callback);
        return this;
    }

    /**
     * Check if a link is internal
     * @param {HTMLAnchorElement} link - Link element
     */
    isInternalLink(link) {
        // Check if it's an external link
        if (link.hasAttribute('target')) return false;
        if (link.getAttribute('href')?.startsWith('http')) return false;
        if (link.getAttribute('href')?.startsWith('#')) return false;

        // Check if it's a same-origin link
        const href = link.getAttribute('href');
        if (!href) return false;

        // Must be internal
        return href.startsWith('/') || !href.includes('://');
    }

    /**
     * Start the router (load initial route)
     */
    async start() {
        const path = window.location.pathname;
        await this.loadRoute(path, false);
    }

    /**
     * Reload current route
     */
    async reload() {
        if (this.currentRoute) {
            await this.loadRoute(this.currentRoute, false);
        }
    }
}

// View Loader Utility
class ViewLoader {
    constructor(containerSelector = '#app') {
        this.container = document.querySelector(containerSelector);
        this.cache = new Map();
    }

    /**
     * Load HTML content into the container
     * @param {string} html - HTML content to load
     */
    loadHTML(html) {
        if (!this.container) {
            console.error('Container not found');
            return;
        }
        this.container.innerHTML = html;
    }

    /**
     * Fetch and load a view from a URL
     * @param {string} url - URL to fetch
     * @param {boolean} useCache - Whether to use cached version
     */
    async loadView(url, useCache = true) {
        // Check cache
        if (useCache && this.cache.has(url)) {
            this.loadHTML(this.cache.get(url));
            return;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load view: ${response.status}`);
            }

            const html = await response.text();

            // Extract body content (if loading full HTML)
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const bodyContent = doc.body.innerHTML;

            // Cache it
            if (useCache) {
                this.cache.set(url, bodyContent);
            }

            // Load it
            this.loadHTML(bodyContent);

        } catch (error) {
            console.error('View loading error:', error);
            this.loadHTML('<div class="error">Failed to load page</div>');
        }
    }

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Create singleton instances
const router = new Router();
const viewLoader = new ViewLoader('#app');

export { router, viewLoader, Router, ViewLoader };
