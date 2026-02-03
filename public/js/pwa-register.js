// PWA Service Worker Registrierung
(function () {
    'use strict';

    // Globaler Flag für Service Worker Bereitschaft
    window.serviceWorkerReady = false;

    if ('serviceWorker' in navigator) {
        // On Capacitor native apps, unregister any existing service workers
        // The native WebView serves files from the APK - SW caching causes stale files
        var isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        if (isNative) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                registrations.forEach(function(reg) {
                    reg.unregister();
                    console.log('[PWA] Unregistered service worker on native app');
                });
            });
            // Don't register SW on native
            return;
        }

        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });

                // Warten bis der Service Worker aktiv ist
                if (registration.active) {
                    window.serviceWorkerReady = true;
                } else if (registration.installing || registration.waiting) {
                    const sw = registration.installing || registration.waiting;
                    sw.addEventListener('statechange', () => {
                        if (sw.state === 'activated') {
                            window.serviceWorkerReady = true;
                        }
                    });
                }

                console.log('[PWA] Service Worker registriert:', registration.scope);

                // Stündliche Update-Prüfung
                setInterval(() => {
                    registration.update();
                }, 60 * 60 * 1000);

                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('[PWA] Neuer Service Worker gefunden');

                    newWorker.addEventListener('statechange', () => {
                        if (
                            newWorker.state === 'installed' &&
                            navigator.serviceWorker.controller
                        ) {
                            console.log('[PWA] Neue Version verfügbar, wird beim nächsten Laden aktualisiert');
                        }
                    });
                });
            } catch (error) {
                console.error('[PWA] Service Worker Registrierung fehlgeschlagen:', error);
            }
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[PWA] Neuer Service Worker aktiviert');
        });
    }

    // Installation-Prompt Handling
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        const installButton = document.getElementById('pwa-install-button');
        if (installButton) {
            installButton.style.display = 'block';
            installButton.addEventListener('click', () => {
                promptInstall();
            });
        }

        console.log('[PWA] Install-Prompt bereit');
    });

    window.promptInstall = async function () {
        if (!deferredPrompt) {
            console.log('[PWA] Kein Install-Prompt verfügbar');
            return false;
        }

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install-Prompt Ergebnis:', outcome);

        deferredPrompt = null;
        return outcome === 'accepted';
    };

    window.isPWAInstalled = function () {
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
        );
    };

    // iOS Safari unterstützt kein display-mode: standalone Media Query,
    // daher müssen wir die Klasse per JavaScript setzen
    if (window.isPWAInstalled()) {
        document.documentElement.classList.add('pwa-standalone');
        if (document.body) {
            document.body.classList.add('standalone-mode');
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.classList.add('standalone-mode');
            });
        }
        console.log('[PWA] Läuft im Standalone-Modus');
    }

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installiert');
        deferredPrompt = null;

        if (typeof gtag === 'function') {
            gtag('event', 'pwa_installed', {
                event_category: 'PWA',
                event_label: 'App Installed'
            });
        }
    });
})();
