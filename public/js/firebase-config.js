export const firebaseConfig = {
    apiKey: 'AIzaSyC_LUFOIUm3PNlUh_Y8w7iiAqlI1aRapWc',
    authDomain: 'ttv-champions-prod.firebaseapp.com',
    projectId: 'ttv-champions-prod',
    storageBucket: 'ttv-champions-prod.firebasestorage.app',
    messagingSenderId: '569930663711',
    appId: '1:569930663711:web:2a5529aff927b28c12922a',
    measurementId: 'G-H2R9ZJYQ06',
};

// Set to false to disable emulators in production
// Set to true only for local development with Firebase emulators running
export const USE_FIREBASE_EMULATORS = false;

/**
 * Helper function to determine if emulators should be used
 * Returns true only if:
 * 1. USE_FIREBASE_EMULATORS is explicitly true
 * 2. Running on localhost (not in Capacitor native app)
 */
export function shouldUseEmulators() {
    if (!USE_FIREBASE_EMULATORS) return false;

    // Check if running in Capacitor native app
    const isCapacitorApp = typeof window !== 'undefined' &&
        typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform();

    if (isCapacitorApp) return false;

    // Only use emulators on localhost in browser
    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return hostname === 'localhost' || hostname === '127.0.0.1';
}
