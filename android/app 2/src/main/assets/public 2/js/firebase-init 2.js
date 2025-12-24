import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    connectAuthEmulator,
    indexedDBLocalPersistence,
    browserLocalPersistence,
    setPersistence,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getFirestore,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    getStorage,
    connectStorageEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';
import {
    getFunctions,
    connectFunctionsEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';
import { firebaseConfig, shouldUseEmulators } from './firebase-config.js';

/**
 * Singleton instance of Firebase services
 * @type {Object|null}
 */
let firebaseInstance = null;

/**
 * Check if running in Capacitor native app
 */
function isCapacitorNative() {
    return typeof window !== 'undefined' &&
        typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform();
}

/**
 * Initializes Firebase services and connects to emulators in development
 * @returns {Object} Firebase services (app, auth, db, storage, functions)
 */
export async function initFirebase() {
    if (firebaseInstance) {
        return firebaseInstance;
    }

    console.log('[Firebase] Initializing...');
    console.log('[Firebase] Is Capacitor native:', isCapacitorNative());

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    // Set persistence for Capacitor - use browserLocalPersistence which works better in WebView
    if (isCapacitorNative()) {
        try {
            console.log('[Firebase] Setting browserLocalPersistence for Capacitor...');
            await setPersistence(auth, browserLocalPersistence);
            console.log('[Firebase] Persistence set successfully');
        } catch (error) {
            console.warn('[Firebase] Failed to set persistence:', error);
        }
    }

    const db = getFirestore(app);
    const storage = getStorage(app);
    const functions = getFunctions(app, 'europe-west3');

    // Auto-connect to emulators only when explicitly enabled
    if (shouldUseEmulators()) {
        try {
            connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
            connectFirestoreEmulator(db, 'localhost', 8080);
            connectFunctionsEmulator(functions, 'localhost', 5001);
            connectStorageEmulator(storage, 'localhost', 9199);
            console.log('Connected to Firebase emulators');
        } catch (error) {
            console.warn('Failed to connect to emulators:', error.message);
        }
    }

    console.log('[Firebase] Initialization complete');
    firebaseInstance = { app, auth, db, storage, functions };
    return firebaseInstance;
}

/**
 * Gets the existing Firebase instance or initializes if not yet created
 * @returns {Promise<Object>} Firebase services (app, auth, db, storage, functions)
 */
export async function getFirebaseInstance() {
    return firebaseInstance || await initFirebase();
}
