// TTV Champions Service Worker
const CACHE_NAME = 'ttv-champions-v9';
const STATIC_CACHE = 'ttv-static-v9';
const DYNAMIC_CACHE = 'ttv-dynamic-v9';

// Static assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/coach.html',
    '/admin.html',
    '/settings.html',
    '/register.html',
    '/onboarding.html',
    '/faq.html',
    '/404.html',
    '/css/spa-enhancements.css',
    '/css/mobile-fixes.css',
    '/css/tutorial.css',
    '/js/spa-enhancer.js',
    '/js/supabase-init.js',
    '/js/ui-utils.js',
    '/js/dashboard-supabase.js',
    '/js/coach-supabase.js',
    '/js/admin-supabase.js',
    '/js/exercises.js',
    '/js/leaderboard.js',
    '/js/onesignal-init.js',
    '/js/push-notifications-manager.js',
    '/manifest.json'
];

// URLs that should always go to network (Firebase, Supabase, APIs)
const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'cloudfunctions.net',
    'googleapis.com/storage',
    'google-analytics.com',
    'googletagmanager.com',
    // Supabase URLs - MUST bypass cache for real-time data!
    'supabase.co',
    'supabase.com',
    'supabase.in',
    // Version check - always fetch fresh
    'version.json',
    'update-checker.js',
    // OneSignal
    'onesignal.com'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches
            .open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.error('[SW] Failed to cache static assets:', err);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return (
                                name !== STATIC_CACHE &&
                                name !== DYNAMIC_CACHE &&
                                name !== CACHE_NAME
                            );
                        })
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Helper: Check if URL should bypass cache
function shouldBypassCache(url) {
    return NETWORK_ONLY.some((domain) => url.includes(domain));
}

// Helper: Check if request is for HTML page
function isHtmlRequest(request) {
    const acceptHeader = request.headers.get('Accept') || '';
    return acceptHeader.includes('text/html');
}

// Helper: Check if request is for static asset
function isStaticAsset(url) {
    return (
        url.endsWith('.css') ||
        url.endsWith('.js') ||
        url.endsWith('.png') ||
        url.endsWith('.jpg') ||
        url.endsWith('.jpeg') ||
        url.endsWith('.svg') ||
        url.endsWith('.webp') ||
        url.endsWith('.woff') ||
        url.endsWith('.woff2')
    );
}

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }

    // Network only for Firebase and external APIs
    if (shouldBypassCache(url)) {
        return;
    }

    // Skip chrome-extension and other non-http(s) requests
    if (!url.startsWith('http')) {
        return;
    }

    event.respondWith(
        (async () => {
            // Try cache first for static assets
            if (isStaticAsset(url)) {
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    // Update cache in background (stale-while-revalidate)
                    event.waitUntil(updateCache(event.request));
                    return cachedResponse;
                }
            }

            // Network first for HTML pages (to get fresh content)
            if (isHtmlRequest(event.request)) {
                try {
                    const networkResponse = await fetch(event.request);
                    // Cache successful responses
                    if (networkResponse.ok) {
                        const cache = await caches.open(DYNAMIC_CACHE);
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (error) {
                    // Offline - serve from cache
                    const cachedResponse = await caches.match(event.request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Return offline page
                    return caches.match('/dashboard.html');
                }
            }

            // For other requests: cache first, network fallback
            try {
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }

                const networkResponse = await fetch(event.request);
                if (networkResponse.ok) {
                    const cache = await caches.open(DYNAMIC_CACHE);
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            } catch (error) {
                console.error('[SW] Fetch failed:', error);
                // Return a basic offline response for non-HTML requests
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            }
        })()
    );
});

// Helper: Update cache in background
async function updateCache(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response);
        }
    } catch (error) {
        // Ignore network errors during background update
    }
}

// Listen for messages from the main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(cacheNames.map((name) => caches.delete(name)));
            })
        );
    }
});

// Background sync for offline match submissions (future feature)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-matches') {
        event.waitUntil(syncMatches());
    }
});

async function syncMatches() {
    // Future: Sync offline-submitted matches when back online
    console.log('[SW] Syncing matches...');
}

// Push notifications (future feature)
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();
    const options = {
        body: data.body || 'Neue Benachrichtigung',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/dashboard.html'
        },
        actions: data.actions || []
    };

    event.waitUntil(self.registration.showNotification(data.title || 'TTV Champions', options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there's already a window open
            for (const client of clientList) {
                if (client.url.includes('ttv-champions') && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // Open new window
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
