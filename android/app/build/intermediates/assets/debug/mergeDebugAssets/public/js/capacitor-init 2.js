// Capacitor Native Integration
// This file initializes Capacitor plugins when running as a native app

(function () {
    'use strict';

    // Check if running in Capacitor
    const isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();

    if (!isCapacitor) {
        console.log('[Capacitor] Running in browser mode');
        return;
    }

    console.log('[Capacitor] Running as native app on', window.Capacitor.getPlatform());

    // Wait for Capacitor plugins to be ready
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            await initializeNativeFeatures();
        } catch (error) {
            console.error('[Capacitor] Initialization error:', error);
        }
    });

    async function initializeNativeFeatures() {
        // Import Capacitor plugins dynamically
        const { SplashScreen } = await import('@capacitor/splash-screen');
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        const { App } = await import('@capacitor/app');
        const { Keyboard } = await import('@capacitor/keyboard');

        // Configure Status Bar
        try {
            await StatusBar.setBackgroundColor({ color: '#1e3a5f' });
            await StatusBar.setStyle({ style: Style.Light });
            console.log('[Capacitor] Status bar configured');
        } catch (e) {
            console.log('[Capacitor] Status bar not available:', e.message);
        }

        // Handle keyboard events
        try {
            Keyboard.addListener('keyboardWillShow', (info) => {
                document.body.classList.add('keyboard-visible');
                document.body.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
            });

            Keyboard.addListener('keyboardWillHide', () => {
                document.body.classList.remove('keyboard-visible');
                document.body.style.removeProperty('--keyboard-height');
            });
            console.log('[Capacitor] Keyboard listeners configured');
        } catch (e) {
            console.log('[Capacitor] Keyboard not available:', e.message);
        }

        // Handle app state changes
        App.addListener('appStateChange', ({ isActive }) => {
            console.log('[Capacitor] App state changed, active:', isActive);
            if (isActive) {
                // App came to foreground - refresh data if needed
                window.dispatchEvent(new CustomEvent('app-resumed'));
            }
        });

        // Handle back button (Android)
        App.addListener('backButton', ({ canGoBack }) => {
            if (canGoBack) {
                window.history.back();
            } else {
                // Ask user if they want to exit
                if (confirm('App beenden?')) {
                    App.exitApp();
                }
            }
        });

        // Handle deep links
        App.addListener('appUrlOpen', (event) => {
            console.log('[Capacitor] Deep link opened:', event.url);
            const url = new URL(event.url);
            // Handle the deep link - navigate to the appropriate page
            if (url.pathname) {
                window.location.href = url.pathname;
            }
        });

        // Hide splash screen after content is ready
        setTimeout(async () => {
            try {
                await SplashScreen.hide({
                    fadeOutDuration: 300
                });
                console.log('[Capacitor] Splash screen hidden');
            } catch (e) {
                console.log('[Capacitor] Splash screen error:', e.message);
            }
        }, 500);
    }

    // Expose utility functions
    window.CapacitorUtils = {
        isNative: () => isCapacitor,
        getPlatform: () => (isCapacitor ? window.Capacitor.getPlatform() : 'web'),

        // Haptic feedback
        async vibrate(style = 'medium') {
            if (!isCapacitor) return;
            try {
                const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
                const impactStyle =
                    {
                        light: ImpactStyle.Light,
                        medium: ImpactStyle.Medium,
                        heavy: ImpactStyle.Heavy
                    }[style] || ImpactStyle.Medium;

                await Haptics.impact({ style: impactStyle });
            } catch (e) {
                console.log('[Capacitor] Haptics not available');
            }
        },

        // Store/retrieve data
        async setItem(key, value) {
            if (!isCapacitor) {
                localStorage.setItem(key, JSON.stringify(value));
                return;
            }
            try {
                const { Preferences } = await import('@capacitor/preferences');
                await Preferences.set({ key, value: JSON.stringify(value) });
            } catch (e) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        },

        async getItem(key) {
            if (!isCapacitor) {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            }
            try {
                const { Preferences } = await import('@capacitor/preferences');
                const { value } = await Preferences.get({ key });
                return value ? JSON.parse(value) : null;
            } catch (e) {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : null;
            }
        }
    };
})();
