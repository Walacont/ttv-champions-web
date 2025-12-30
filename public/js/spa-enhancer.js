// SPA-Enhancer für SC Champions
// Wandelt Multi-Page-Application in SPA um durch Abfangen von Navigation
// und dynamisches Laden von Seiten ohne vollständige Seitenneuladen

class SPAEnhancer {
    constructor() {
        this.currentPageScripts = [];
        this.cache = new Map();
        this.isNavigating = false;
        this.loadingIndicator = null;
        this.eventCallbacks = {};

        this.init();
        this.createLoadingIndicator();
    }

    init() {
        // Link-Klicks abfangen
        document.addEventListener('click', e => {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                if (this.shouldIntercept(link)) {
                    e.preventDefault();
                    this.navigateTo(href);
                }
            }
        });

        // Browser Zurück/Vorwärts behandeln
        window.addEventListener('popstate', e => {
            if (e.state && e.state.url) {
                const url = e.state.url.split('?')[0];
                const noInterceptPages = [
                    '/index.html',
                    '/',
                    '/dashboard.html',
                    '/coach.html',
                    '/admin.html',
                    '/onboarding.html',
                    '/register.html',
                ];

                if (noInterceptPages.includes(url)) {
                    window.location.href = e.state.url;
                    return;
                }

                this.loadPage(e.state.url, false);
            }
        });

        // Initialen State speichern
        const currentPath =
            window.location.pathname + window.location.search + window.location.hash;
        history.replaceState({ url: currentPath }, '', currentPath);
    }

    // Prüft ob Link abgefangen werden soll
    shouldIntercept(link) {
        const href = link.getAttribute('href');

        // Nicht abfangen bei: externen Links, target-Attribut, Download, Hash-Links, mailto:/tel:
        if (
            !href ||
            href.startsWith('http') ||
            href.startsWith('#') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            link.hasAttribute('target') ||
            link.hasAttribute('download')
        ) {
            return false;
        }

        // Seiten die vollständigen Reload benötigen (Auth-State, Haupt-Einstiegspunkte)
        const noInterceptPages = [
            '/index.html',
            '/',
            '/dashboard.html',
            '/coach.html',
            '/admin.html',
            '/onboarding.html',
            '/register.html',
        ];

        let linkPath = href.split('?')[0];
        if (!linkPath.startsWith('/')) {
            linkPath = '/' + linkPath;
        }

        if (noInterceptPages.includes(linkPath)) {
            return false;
        }

        return true;
    }

    async navigateTo(url) {
        if (this.isNavigating) return;

        const urlObj = new URL(url, window.location.origin);
        const fullPath = urlObj.pathname + urlObj.search + urlObj.hash;

        if (fullPath === window.location.pathname + window.location.search + window.location.hash) {
            return;
        }

        history.pushState({ url: fullPath }, '', fullPath);
        await this.loadPage(urlObj.pathname, true);
    }

    // Seite dynamisch laden
    async loadPage(url, updateHistory = true) {
        if (this.isNavigating) return;
        this.isNavigating = true;

        try {
            this.showLoader();

            let html;
            if (this.cache.has(url)) {
                html = this.cache.get(url);
            } else {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                html = await response.text();
                this.cache.set(url, html);
            }

            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');

            document.title = newDoc.title;
            this.cleanup();
            this.trigger('navigationStart', { url });

            const newBody = newDoc.body;
            document.body.className = newBody.className;
            document.body.innerHTML = newBody.innerHTML;

            const mainContent =
                document.getElementById('main-content') ||
                document.getElementById('app-content') ||
                document.body;
            this.addPageTransition(mainContent);

            this.updateStyles(newDoc);
            await this.executeScripts(newDoc);
            window.scrollTo(0, 0);
            this.hideLoader();
            this.trigger('navigationEnd', { url });
        } catch (error) {
            console.error('Navigation failed:', error);
            window.location.href = url;
        } finally {
            this.isNavigating = false;
        }
    }

    updateStyles(newDoc) {
        document.querySelectorAll('style[data-spa-dynamic]').forEach(el => el.remove());

        const styles = newDoc.querySelectorAll('style');
        styles.forEach(style => {
            const newStyle = document.createElement('style');
            newStyle.textContent = style.textContent;
            newStyle.setAttribute('data-spa-dynamic', 'true');
            document.head.appendChild(newStyle);
        });
    }

    async executeScripts(newDoc) {
        const scripts = newDoc.querySelectorAll('script');

        for (const script of scripts) {
            const newScript = document.createElement('script');

            Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            if (script.type === 'module' && script.src) {
                try {
                    const modulePath = script.src + '?t=' + Date.now();
                    await import(modulePath);
                    this.currentPageScripts.push(modulePath);
                } catch (error) {
                    console.error('Failed to load module:', script.src, error);
                }
            } else if (!script.src) {
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
                this.currentPageScripts.push(newScript);
            } else {
                newScript.src = script.src;
                document.body.appendChild(newScript);
                this.currentPageScripts.push(newScript);
            }
        }
    }

    // Alte Seiten-Ressourcen bereinigen
    cleanup() {
        this.currentPageScripts.forEach(script => {
            if (script instanceof HTMLElement && script.parentNode) {
                script.parentNode.removeChild(script);
            }
        });
        this.currentPageScripts = [];

        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.classList.remove('modal-open', 'overflow-hidden', 'keyboard-visible');
    }

    createLoadingIndicator() {
        if (!this.loadingIndicator) {
            this.loadingIndicator = document.createElement('div');
            this.loadingIndicator.className = 'spa-loading-indicator';
            this.loadingIndicator.innerHTML = '<div class="spa-loading-bar"></div>';
            this.loadingIndicator.style.display = 'none';
            document.body.appendChild(this.loadingIndicator);
        }
    }

    showLoader() {
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'block';
            this.loadingIndicator.classList.remove('loading-complete');
        }

        const loader =
            document.getElementById('spa-loader') || document.getElementById('page-loader');
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }

        this.trigger('loadStart');
    }

    hideLoader() {
        setTimeout(() => {
            if (this.loadingIndicator) {
                this.loadingIndicator.classList.add('loading-complete');
                setTimeout(() => {
                    this.loadingIndicator.style.display = 'none';
                }, 300);
            }

            const loader =
                document.getElementById('spa-loader') || document.getElementById('page-loader');
            if (loader) {
                loader.style.display = 'none';
                loader.classList.add('hidden');
            }

            this.trigger('loadEnd');
        }, 100);
    }

    clearCache() {
        this.cache.clear();
    }

    async prefetch(url) {
        if (this.cache.has(url)) return;

        try {
            const response = await fetch(url);
            if (response.ok) {
                const html = await response.text();
                this.cache.set(url, html);
            }
        } catch (error) {
            console.warn('Prefetch failed:', url, error);
        }
    }

    on(event, callback) {
        if (!this.eventCallbacks[event]) {
            this.eventCallbacks[event] = [];
        }
        this.eventCallbacks[event].push(callback);
    }

    trigger(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} callback:`, error);
                }
            });
        }
    }

    addPageTransition(element) {
        if (element) {
            element.style.animation = 'fadeIn 0.3s ease-in-out';
        }
    }
}

// SPA-Enhancer initialisieren (nur einmal)
if (!window.spaEnhancer) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.spaEnhancer = new SPAEnhancer();
            window.spaNavigate = url => {
                if (window.spaEnhancer) {
                    window.spaEnhancer.navigateTo(url);
                } else {
                    window.location.href = url;
                }
            };
        });
    } else {
        window.spaEnhancer = new SPAEnhancer();
        window.spaNavigate = url => {
            if (window.spaEnhancer) {
                window.spaEnhancer.navigateTo(url);
            } else {
                window.location.href = url;
            }
        };
    }
}

export default SPAEnhancer;
