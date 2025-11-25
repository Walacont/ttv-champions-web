/**
 * Firebase Cloud Messaging Service Worker
 * Handles background push notifications
 */

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
    apiKey: 'AIzaSyC_LUFOIUm3PNlUh_Y8w7iiAqlI1aRapWc',
    authDomain: 'ttv-champions-prod.firebaseapp.com',
    projectId: 'ttv-champions-prod',
    storageBucket: 'ttv-champions-prod.firebasestorage.app',
    messagingSenderId: '569930663711',
    appId: '1:569930663711:web:2a5529aff927b28c12922a',
    measurementId: 'G-F1PHV19E5Z',
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging
const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(payload => {
    console.log('[firebase-messaging-sw.js] Received background message:', payload);

    const notificationTitle = payload.notification?.title || 'TTV Champions';
    const notificationOptions = {
        body: payload.notification?.body || 'Neue Benachrichtigung',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        tag: payload.data?.tag || 'default',
        data: payload.data || {},
        vibrate: [200, 100, 200],
        requireInteraction: false,
        actions: [
            {
                action: 'open',
                title: 'Öffnen',
            },
            {
                action: 'close',
                title: 'Schließen',
            },
        ],
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    console.log('[firebase-messaging-sw.js] Notification clicked:', event);

    event.notification.close();

    // Get the URL to open from the notification data
    const urlToOpen = event.notification.data?.url || '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Check if there's already a window open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i];
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    // Navigate existing window
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

// Handle notification close
self.addEventListener('notificationclose', event => {
    console.log('[firebase-messaging-sw.js] Notification closed:', event);
});

// Service Worker installation
self.addEventListener('install', event => {
    console.log('[firebase-messaging-sw.js] Service Worker installing...');
    self.skipWaiting();
});

// Service Worker activation
self.addEventListener('activate', event => {
    console.log('[firebase-messaging-sw.js] Service Worker activating...');
    event.waitUntil(clients.claim());
});
