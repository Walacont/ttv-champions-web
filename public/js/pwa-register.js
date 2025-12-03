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
                            // New content is available
                            showUpdateNotification();
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

    // Show update notification to user
    function showUpdateNotification() {
        // Check if we have a UI notification system
        if (typeof window.showToast === 'function') {
            window.showToast('Neue Version verfügbar! Seite neu laden für Updates.', 'info', 10000);
        } else {
            // Create a simple notification banner
            const banner = document.createElement('div');
            banner.id = 'pwa-update-banner';
            banner.innerHTML = `
                <div style="position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                            background: #4f46e5; color: white; padding: 12px 20px; border-radius: 8px;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; display: flex;
                            align-items: center; gap: 12px; font-family: 'Inter', sans-serif;">
                    <span>Neue Version verfügbar!</span>
                    <button onclick="window.location.reload()"
                            style="background: white; color: #4f46e5; border: none; padding: 6px 12px;
                                   border-radius: 4px; cursor: pointer; font-weight: 500;">
                        Aktualisieren
                    </button>
                    <button onclick="this.parentElement.parentElement.remove()"
                            style="background: transparent; color: white; border: none; cursor: pointer;
                                   padding: 4px; font-size: 18px;">
                        &times;
                    </button>
                </div>
            `;
            document.body.appendChild(banner);
        }
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
