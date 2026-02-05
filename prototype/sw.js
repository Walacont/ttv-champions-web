/**
 * Service Worker für TTV Champions Prototyp
 * Implementiert Caching-Strategien für PWA-Funktionalität
 */

const CACHE_NAME = 'ttv-champions-v1';
const STATIC_CACHE = 'ttv-static-v1';
const DYNAMIC_CACHE = 'ttv-dynamic-v1';

// Statische Assets, die beim Install gecached werden
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/profile.html',
    '/leaderboards.html',
    '/matches.html',
    '/training.html',
    '/coach.html',
    '/css/style.css',
    '/js/app.js',
    '/js/supabase-client.js',
    '/js/ranks.js',
    '/js/elo.js',
    '/js/points.js',
    '/js/streaks.js',
    '/js/matches.js',
    '/js/exercises.js',
    '/js/challenges.js',
    '/js/leaderboards.js',
    '/js/feed.js',
    '/js/notifications.js',
    '/manifest.json'
];

// ============================================
// INSTALL EVENT
// Cache statische Assets
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// ============================================
// ACTIVATE EVENT
// Alte Caches löschen
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker activated');
                return self.clients.claim();
            })
    );
});

// ============================================
// FETCH EVENT
// Caching-Strategien
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Nur GET-Requests cachen
    if (request.method !== 'GET') {
        return;
    }

    // Supabase API-Calls nicht cachen (immer frisch holen)
    if (url.hostname.includes('supabase')) {
        event.respondWith(networkOnly(request));
        return;
    }

    // HTML-Seiten: Network First (Aktualität wichtig)
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // JS, CSS, Bilder: Stale While Revalidate (Schnell + Aktuell)
    if (
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.svg')
    ) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Alles andere: Cache First
    event.respondWith(cacheFirst(request));
});

// ============================================
// CACHING-STRATEGIEN
// ============================================

/**
 * Network Only - Immer vom Netzwerk holen
 */
async function networkOnly(request) {
    try {
        return await fetch(request);
    } catch (error) {
        console.error('[SW] Network only failed:', error);
        throw error;
    }
}

/**
 * Network First - Netzwerk bevorzugen, Cache als Fallback
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);

        // Erfolgreiche Antwort cachen
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache...');
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Offline-Fallback für HTML
        if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
        }

        throw error;
    }
}

/**
 * Cache First - Cache bevorzugen, Netzwerk als Fallback
 */
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache first failed:', error);
        throw error;
    }
}

/**
 * Stale While Revalidate - Cache sofort liefern, im Hintergrund aktualisieren
 */
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);

    // Im Hintergrund neu laden
    const fetchPromise = fetch(request)
        .then((networkResponse) => {
            if (networkResponse.ok) {
                caches.open(DYNAMIC_CACHE)
                    .then((cache) => cache.put(request, networkResponse.clone()));
            }
            return networkResponse;
        })
        .catch((error) => {
            console.log('[SW] Background fetch failed:', error);
        });

    // Cache sofort zurückgeben, falls vorhanden
    return cachedResponse || fetchPromise;
}

// ============================================
// PUSH NOTIFICATIONS (Vorbereitung)
// ============================================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    const data = event.data.json();

    const options = {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/index.html'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'TTV Champions', options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/index.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Existierendes Fenster fokussieren
                for (const client of windowClients) {
                    if (client.url.includes('/') && 'focus' in client) {
                        client.navigate(url);
                        return client.focus();
                    }
                }

                // Neues Fenster öffnen
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});

console.log('[SW] Service Worker loaded');
