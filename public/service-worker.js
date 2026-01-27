// TTV Champions Service Worker
const CACHE_NAME = 'ttv-champions-v10';
const STATIC_CACHE = 'ttv-static-v10';
const DYNAMIC_CACHE = 'ttv-dynamic-v10';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/coach.html',
    '/admin.html',
    '/settings.html',
    '/register.html',
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

const NETWORK_ONLY = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'cloudfunctions.net',
    'googleapis.com/storage',
    'google-analytics.com',
    'googletagmanager.com',
    // Supabase muss Cache umgehen wegen Echtzeit-Daten
    'supabase.co',
    'supabase.com',
    'supabase.in',
    // Versionsprüfung immer aktuell halten
    'version.json',
    'update-checker.js',
    'onesignal.com'
];

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

function shouldBypassCache(url) {
    return NETWORK_ONLY.some((domain) => url.includes(domain));
}

function isHtmlRequest(request) {
    const acceptHeader = request.headers.get('Accept') || '';
    return acceptHeader.includes('text/html');
}

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

self.addEventListener('fetch', (event) => {
    const url = event.request.url;

    if (event.request.method !== 'GET') {
        return;
    }

    if (shouldBypassCache(url)) {
        return;
    }

    // Chrome-Erweiterungen und andere nicht-HTTP(S) Anfragen überspringen
    if (!url.startsWith('http')) {
        return;
    }

    event.respondWith(
        (async () => {
            if (isStaticAsset(url)) {
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    // Cache im Hintergrund aktualisieren (stale-while-revalidate)
                    event.waitUntil(updateCache(event.request));
                    return cachedResponse;
                }
            }

            // HTML-Seiten: Network-First für aktuelle Inhalte
            if (isHtmlRequest(event.request)) {
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse.ok) {
                        const cache = await caches.open(DYNAMIC_CACHE);
                        cache.put(event.request, networkResponse.clone());
                    }
                    return networkResponse;
                } catch (error) {
                    const cachedResponse = await caches.match(event.request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return caches.match('/dashboard.html');
                }
            }

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
                return new Response('Offline', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            }
        })()
    );
});

async function updateCache(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            await cache.put(request, response);
        }
    } catch (error) {
        // Netzwerkfehler beim Hintergrund-Update ignorieren
    }
}

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

// Background Sync für Offline-Match-Eingaben (zukünftiges Feature)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-matches') {
        event.waitUntil(syncMatches());
    }
});

async function syncMatches() {
    // Später: Offline gespeicherte Matches synchronisieren sobald wieder online
    console.log('[SW] Syncing matches...');
}

// Push-Benachrichtigungen (zukünftiges Feature)
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

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('ttv-champions') && 'focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
