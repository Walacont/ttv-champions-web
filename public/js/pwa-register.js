// PWA Service Worker Registration
(function () {
    'use strict';

    // Register service worker
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js', {
                    scope: '/'
                });

                console.log('[PWA] Service Worker registered:', registration.scope);

                // Check for updates periodically
                setInterval(
                    () => {
                        registration.update();
                    },
                    60 * 60 * 1000
                ); // Every hour

                // Handle updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('[PWA] New Service Worker found');

                    newWorker.addEventListener('statechange', () => {
                        if (
                            newWorker.state === 'installed' &&
                            navigator.serviceWorker.controller
                        ) {
                            // New content is available - silently update without notification
                            console.log('[PWA] New version available, will update on next reload');
                        }
                    });
                });
            } catch (error) {
                console.error('[PWA] Service Worker registration failed:', error);
            }
        });

        // Handle controller change (when new SW takes over)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[PWA] New Service Worker activated');
        });
    }


    // Install prompt handling
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        deferredPrompt = e;

        // Show install button if exists
        const installButton = document.getElementById('pwa-install-button');
        if (installButton) {
            installButton.style.display = 'block';
            installButton.addEventListener('click', () => {
                promptInstall();
            });
        }

        console.log('[PWA] Install prompt ready');
    });

    // Function to trigger install prompt
    window.promptInstall = async function () {
        if (!deferredPrompt) {
            console.log('[PWA] No install prompt available');
            return false;
        }

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log('[PWA] Install prompt outcome:', outcome);

        deferredPrompt = null;
        return outcome === 'accepted';
    };

    // Check if app is installed
    window.isPWAInstalled = function () {
        return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
        );
    };

    // Add standalone-mode class to body for iOS PWA safe area CSS
    // iOS Safari doesn't support display-mode: standalone media query,
    // so we need to set this class via JavaScript
    if (window.isPWAInstalled()) {
        document.documentElement.classList.add('pwa-standalone');
        if (document.body) {
            document.body.classList.add('standalone-mode');
        } else {
            // Body not ready yet, wait for DOMContentLoaded
            document.addEventListener('DOMContentLoaded', () => {
                document.body.classList.add('standalone-mode');
            });
        }
        console.log('[PWA] Running in standalone mode, added standalone-mode class');
    }

    // Track app installed event
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed');
        deferredPrompt = null;

        // Track installation in analytics if available
        if (typeof gtag === 'function') {
            gtag('event', 'pwa_installed', {
                event_category: 'PWA',
                event_label: 'App Installed'
            });
        }
    });
})();
