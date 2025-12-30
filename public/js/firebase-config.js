export const firebaseConfig = {
    apiKey: 'AIzaSyC_LUFOIUm3PNlUh_Y8w7iiAqlI1aRapWc',
    authDomain: 'ttv-champions-prod.firebaseapp.com',
    projectId: 'ttv-champions-prod',
    storageBucket: 'ttv-champions-prod.firebasestorage.app',
    messagingSenderId: '569930663711',
    appId: '1:569930663711:web:2a5529aff927b28c12922a',
    measurementId: 'G-H2R9ZJYQ06',
};

// Auf 'true' setzen für lokale Entwicklung mit Firebase Emulatoren
export const USE_FIREBASE_EMULATORS = false;

/**
 * Emulatoren werden nur im Browser auf localhost verwendet,
 * da sie in nativen Capacitor Apps nicht erreichbar sind
 */
export function shouldUseEmulators() {
    if (!USE_FIREBASE_EMULATORS) return false;

    const isCapacitorApp = typeof window !== 'undefined' &&
        typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform();

    if (isCapacitorApp) return false;

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    return hostname === 'localhost' || hostname === '127.0.0.1';
}
