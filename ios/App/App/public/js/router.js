// Einfacher Client-Side Router für SC Champions SPA

class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.beforeNavigateCallbacks = [];
        this.afterNavigateCallbacks = [];

        window.addEventListener('popstate', e => {
            this.loadRoute(window.location.pathname, false);
        });

        document.addEventListener('click', e => {
            const link = e.target.closest('a');
            if (link && this.isInternalLink(link)) {
                e.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });
    }

    on(path, handler) {
        this.routes[path] = handler;
        return this;
    }

    async navigate(path, pushState = true) {
        path = path || '/';

        for (const callback of this.beforeNavigateCallbacks) {
            const result = await callback(path);
            if (result === false) return;
        }

        if (pushState && path !== window.location.pathname) {
            window.history.pushState({ path }, '', path);
        }

        await this.loadRoute(path, pushState);

        for (const callback of this.afterNavigateCallbacks) {
            await callback(path);
        }
    }

    async loadRoute(path, pushState = true) {
        const handler = this.routes[path] || this.routes['/404'];

        if (handler) {
            this.currentRoute = path;

            try {
                await handler();
            } catch (error) {
                console.error('Route-Ladefehler:', error);
                if (this.routes['/404'] && path !== '/404') {
                    await this.routes['/404']();
                }
            }
        } else {
            console.warn(`Keine Route gefunden für ${path}`);
            if (this.routes['/404']) {
                await this.routes['/404']();
            }
        }
    }

    beforeNavigate(callback) {
        this.beforeNavigateCallbacks.push(callback);
        return this;
    }

    afterNavigate(callback) {
        this.afterNavigateCallbacks.push(callback);
        return this;
    }

    isInternalLink(link) {
        if (link.hasAttribute('target')) return false;
        if (link.getAttribute('href')?.startsWith('http')) return false;
        if (link.getAttribute('href')?.startsWith('#')) return false;

        const href = link.getAttribute('href');
        if (!href) return false;

        return href.startsWith('/') || !href.includes('://');
    }

    async start() {
        const path = window.location.pathname;
        await this.loadRoute(path, false);
    }

    async reload() {
        if (this.currentRoute) {
            await this.loadRoute(this.currentRoute, false);
        }
    }
}

class ViewLoader {
    constructor(containerSelector = '#app') {
        this.container = document.querySelector(containerSelector);
        this.cache = new Map();
    }

    loadHTML(html) {
        if (!this.container) {
            console.error('Container nicht gefunden');
            return;
        }
        this.container.innerHTML = html;
    }

    async loadView(url, useCache = true) {
        if (useCache && this.cache.has(url)) {
            this.loadHTML(this.cache.get(url));
            return;
        }

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`View laden fehlgeschlagen: ${response.status}`);
            }

            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const bodyContent = doc.body.innerHTML;

            if (useCache) {
                this.cache.set(url, bodyContent);
            }

            this.loadHTML(bodyContent);
        } catch (error) {
            console.error('View-Ladefehler:', error);
            this.loadHTML('<div class="error">Seite konnte nicht geladen werden</div>');
        }
    }

    clearCache() {
        this.cache.clear();
    }
}

const router = new Router();
const viewLoader = new ViewLoader('#app');

export { router, viewLoader, Router, ViewLoader };
