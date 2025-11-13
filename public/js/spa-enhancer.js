/**
 * SPA Enhancer for TTV Champions
 * Converts multi-page application into SPA by intercepting navigation
 * and loading pages dynamically without full page reloads
 */

class SPAEnhancer {
    constructor() {
        this.currentPageScripts = [];
        this.cache = new Map();
        this.isNavigating = false;

        // Initialize
        this.init();
    }

    init() {
        // Intercept link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && this.shouldIntercept(link)) {
                e.preventDefault();
                const href = link.getAttribute('href');
                this.navigateTo(href);
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.url) {
                this.loadPage(e.state.url, false);
            }
        });

        // Store initial state
        const currentPath = window.location.pathname;
        history.replaceState({ url: currentPath }, '', currentPath);
    }

    /**
     * Check if we should intercept this link
     */
    shouldIntercept(link) {
        const href = link.getAttribute('href');

        // Don't intercept if:
        // - External link
        // - Has target attribute
        // - Has download attribute
        // - Is a hash link
        // - Is mailto: or tel:
        if (!href ||
            href.startsWith('http') ||
            href.startsWith('#') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            link.hasAttribute('target') ||
            link.hasAttribute('download')) {
            return false;
        }

        return true;
    }

    /**
     * Navigate to a URL
     */
    async navigateTo(url) {
        if (this.isNavigating) return;

        // Parse URL to separate path and query string
        const urlObj = new URL(url, window.location.origin);
        const fullPath = urlObj.pathname + urlObj.search + urlObj.hash;

        // Don't reload if we're already on this exact page (including query params)
        if (fullPath === window.location.pathname + window.location.search + window.location.hash) {
            return;
        }

        // Push state with full URL
        history.pushState({ url: fullPath }, '', fullPath);

        // Load the page
        await this.loadPage(urlObj.pathname, true);
    }

    /**
     * Load a page dynamically
     */
    async loadPage(url, updateHistory = true) {
        if (this.isNavigating) return;
        this.isNavigating = true;

        try {
            // Show loading indicator
            this.showLoader();

            // Check cache
            let html;
            if (this.cache.has(url)) {
                html = this.cache.get(url);
            } else {
                // Fetch the page
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                html = await response.text();
                this.cache.set(url, html);
            }

            // Parse HTML
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(html, 'text/html');

            // Update title
            document.title = newDoc.title;

            // Clean up old page scripts
            this.cleanup();

            // Replace body
            const newBody = newDoc.body;
            document.body.className = newBody.className;
            document.body.innerHTML = newBody.innerHTML;

            // Update or add styles
            this.updateStyles(newDoc);

            // Execute new scripts
            await this.executeScripts(newDoc);

            // Scroll to top
            window.scrollTo(0, 0);

            // Hide loader
            this.hideLoader();

        } catch (error) {
            console.error('Navigation failed:', error);
            // Fallback to full page load
            window.location.href = url;
        } finally {
            this.isNavigating = false;
        }
    }

    /**
     * Update page styles
     */
    updateStyles(newDoc) {
        // Remove old dynamic styles
        document.querySelectorAll('style[data-spa-dynamic]').forEach(el => el.remove());

        // Add new styles
        const styles = newDoc.querySelectorAll('style');
        styles.forEach(style => {
            const newStyle = document.createElement('style');
            newStyle.textContent = style.textContent;
            newStyle.setAttribute('data-spa-dynamic', 'true');
            document.head.appendChild(newStyle);
        });
    }

    /**
     * Execute page scripts
     */
    async executeScripts(newDoc) {
        const scripts = newDoc.querySelectorAll('script');

        for (const script of scripts) {
            const newScript = document.createElement('script');

            // Copy attributes
            Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });

            // If it's a module script with src, import it dynamically
            if (script.type === 'module' && script.src) {
                try {
                    // Add timestamp to bust cache and force re-execution
                    const modulePath = script.src + '?t=' + Date.now();
                    await import(modulePath);
                    this.currentPageScripts.push(modulePath);
                } catch (error) {
                    console.error('Failed to load module:', script.src, error);
                }
            }
            // If it's inline script
            else if (!script.src) {
                newScript.textContent = script.textContent;
                document.body.appendChild(newScript);
                this.currentPageScripts.push(newScript);
            }
            // If it's a regular script with src
            else {
                newScript.src = script.src;
                document.body.appendChild(newScript);
                this.currentPageScripts.push(newScript);
            }
        }
    }

    /**
     * Cleanup old page resources
     */
    cleanup() {
        // Remove old scripts
        this.currentPageScripts.forEach(script => {
            if (script instanceof HTMLElement && script.parentNode) {
                script.parentNode.removeChild(script);
            }
        });
        this.currentPageScripts = [];

        // You could add more cleanup here if needed
        // For example, clearing timers, removing event listeners, etc.
    }

    /**
     * Show loading indicator
     */
    showLoader() {
        const loader = document.getElementById('spa-loader') ||
                      document.getElementById('page-loader');
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }
    }

    /**
     * Hide loading indicator
     */
    hideLoader() {
        setTimeout(() => {
            const loader = document.getElementById('spa-loader') ||
                          document.getElementById('page-loader');
            if (loader) {
                loader.style.display = 'none';
                loader.classList.add('hidden');
            }
        }, 100);
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Prefetch a URL
     */
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
}

// Initialize SPA enhancer when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.spaEnhancer = new SPAEnhancer();

        // Provide a global navigate function for programmatic navigation
        window.spaNavigate = (url) => {
            if (window.spaEnhancer) {
                window.spaEnhancer.navigateTo(url);
            } else {
                window.location.href = url;
            }
        };
    });
} else {
    window.spaEnhancer = new SPAEnhancer();

    // Provide a global navigate function for programmatic navigation
    window.spaNavigate = (url) => {
        if (window.spaEnhancer) {
            window.spaEnhancer.navigateTo(url);
        } else {
            window.location.href = url;
        }
    };
}

// Export for module usage
export default SPAEnhancer;
