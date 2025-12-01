import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getFirestore,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js';
import {
    getStorage,
    connectStorageEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';
import {
    getFunctions,
    connectFunctionsEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';

/**
 * Singleton instance of Firebase services
 * @type {Object|null}
 */
let firebaseInstance = null;

/**
 * Initializes Firebase services and connects to emulators in development
 * @returns {Object} Firebase services (app, auth, db, analytics, storage, functions)
 */
export function initFirebase() {
    if (firebaseInstance) {
        return firebaseInstance;
    }

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const analytics = getAnalytics(app);
    const storage = getStorage(app);
    const functions = getFunctions(app, 'europe-west3');

    // Auto-connect to emulators in development environment (but NOT in Capacitor)
    const isCapacitorApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
    if (!isCapacitorApp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
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

    firebaseInstance = { app, auth, db, analytics, storage, functions };
    return firebaseInstance;
}

/**
 * Gets the existing Firebase instance or initializes if not yet created
 * @returns {Object} Firebase services (app, auth, db, analytics, storage, functions)
 */
export function getFirebaseInstance() {
    return firebaseInstance || initFirebase();
}
