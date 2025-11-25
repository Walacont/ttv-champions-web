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
        this.loadingIndicator = null;
        this.eventCallbacks = {};

        // Initialize
        this.init();
        this.createLoadingIndicator();
    }

    init() {
        // Intercept link clicks
        document.addEventListener('click', e => {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                console.log('[SPA] Link clicked:', href);

                if (this.shouldIntercept(link)) {
                    console.log('[SPA] Intercepting link');
                    e.preventDefault();
                    this.navigateTo(href);
                } else {
                    console.log('[SPA] NOT intercepting link, allowing default behavior');
                }
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', e => {
            if (e.state && e.state.url) {
                this.loadPage(e.state.url, false);
            }
        });

        // Store initial state with FULL URL (including query string and hash)
        const currentPath =
            window.location.pathname + window.location.search + window.location.hash;
        console.log('[SPA] init() - storing initial state:', currentPath);
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

        // Don't intercept navigation to these pages (they need full reload):
        // - Landing page (index.html)
        // - Role-based dashboards (main entry points that need fresh auth state)
        // - Authentication pages
        const noInterceptPages = [
            '/index.html',
            '/',
            '/dashboard.html', // Player dashboard - needs full reload
            '/coach.html', // Coach dashboard - needs full reload
            '/admin.html', // Admin dashboard - needs full reload
            '/onboarding.html',
            '/register.html',
        ];

        // Normalize the link path (handle both relative and absolute paths)
        let linkPath = href.split('?')[0]; // Remove query params for comparison

        // Convert relative to absolute if needed
        if (!linkPath.startsWith('/')) {
            linkPath = '/' + linkPath;
        }

        console.log('[SPA] Checking if should intercept - linkPath:', linkPath);

        // Check if the link is to a no-intercept page
        if (noInterceptPages.includes(linkPath)) {
            console.log('[SPA] Not intercepting link to:', linkPath, '(requires full reload)');
            return false;
        }

        // All other internal links can use SPA navigation
        console.log('[SPA] Intercepting link (SPA navigation)');
        return true;
    }

    /**
     * Navigate to a URL
     */
    async navigateTo(url) {
        if (this.isNavigating) return;

        console.log('[SPA] navigateTo called with:', url);

        // Parse URL to separate path and query string
        const urlObj = new URL(url, window.location.origin);
        const fullPath = urlObj.pathname + urlObj.search + urlObj.hash;

        console.log(
            '[SPA] Parsed URL - pathname:',
            urlObj.pathname,
            'search:',
            urlObj.search,
            'fullPath:',
            fullPath
        );

        // Don't reload if we're already on this exact page (including query params)
        if (fullPath === window.location.pathname + window.location.search + window.location.hash) {
            console.log('[SPA] Already on this page, skipping navigation');
            return;
        }

        // Push state with full URL
        console.log('[SPA] Pushing state with fullPath:', fullPath);
        history.pushState({ url: fullPath }, '', fullPath);
        console.log('[SPA] After pushState - window.location.href:', window.location.href);
        console.log('[SPA] After pushState - window.location.search:', window.location.search);

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

            // Trigger navigation start event
            this.trigger('navigationStart', { url });

            // Replace body
            const newBody = newDoc.body;
            document.body.className = newBody.className;
            document.body.innerHTML = newBody.innerHTML;

            // Add page transition animation
            const mainContent =
                document.getElementById('main-content') ||
                document.getElementById('app-content') ||
                document.body;
            this.addPageTransition(mainContent);

            // Update or add styles
            this.updateStyles(newDoc);

            // Execute new scripts
            await this.executeScripts(newDoc);

            // Scroll to top
            window.scrollTo(0, 0);

            // Hide loader
            this.hideLoader();

            // Trigger navigation end event
            this.trigger('navigationEnd', { url });
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
    /**
     * Create loading indicator
     */
    createLoadingIndicator() {
        if (!this.loadingIndicator) {
            this.loadingIndicator = document.createElement('div');
            this.loadingIndicator.className = 'spa-loading-indicator';
            this.loadingIndicator.innerHTML = '<div class="spa-loading-bar"></div>';
            this.loadingIndicator.style.display = 'none'; // Initially hidden
            document.body.appendChild(this.loadingIndicator);
        }
    }

    /**
     * Show loading indicator
     */
    showLoader() {
        // Show new loading bar
        if (this.loadingIndicator) {
            this.loadingIndicator.style.display = 'block';
            this.loadingIndicator.classList.remove('loading-complete');
        }

        // Also show existing page loader if present
        const loader =
            document.getElementById('spa-loader') || document.getElementById('page-loader');
        if (loader) {
            loader.style.display = 'flex';
            loader.classList.remove('hidden');
        }

        // Trigger event
        this.trigger('loadStart');
    }

    /**
     * Hide loading indicator
     */
    hideLoader() {
        setTimeout(() => {
            // Hide loading bar with animation
            if (this.loadingIndicator) {
                this.loadingIndicator.classList.add('loading-complete');
                setTimeout(() => {
                    this.loadingIndicator.style.display = 'none';
                }, 300);
            }

            // Hide existing page loader
            const loader =
                document.getElementById('spa-loader') || document.getElementById('page-loader');
            if (loader) {
                loader.style.display = 'none';
                loader.classList.add('hidden');
            }

            // Trigger event
            this.trigger('loadEnd');
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

    /**
     * Event system - Register callback
     */
    on(event, callback) {
        if (!this.eventCallbacks[event]) {
            this.eventCallbacks[event] = [];
        }
        this.eventCallbacks[event].push(callback);
    }

    /**
     * Event system - Trigger event
     */
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

    /**
     * Add page transition animations
     */
    addPageTransition(element) {
        if (element) {
            element.style.animation = 'fadeIn 0.3s ease-in-out';
        }
    }
}

// Initialize SPA enhancer when DOM is ready (only once!)
if (!window.spaEnhancer) {
    console.log('[SPA] Initializing SPAEnhancer for the first time');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.spaEnhancer = new SPAEnhancer();

            // Provide a global navigate function for programmatic navigation
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

        // Provide a global navigate function for programmatic navigation
        window.spaNavigate = url => {
            if (window.spaEnhancer) {
                window.spaEnhancer.navigateTo(url);
            } else {
                window.location.href = url;
            }
        };
    }
} else {
    console.log('[SPA] SPAEnhancer already initialized, skipping');
}

// Export for module usage
export default SPAEnhancer;
