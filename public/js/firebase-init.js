// Firebase Initialisierung und Singleton-Verwaltung

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

let firebaseInstance = null;

function isCapacitorNative() {
    return typeof window !== 'undefined' &&
        typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform();
}

export async function initFirebase() {
    if (firebaseInstance) {
        return firebaseInstance;
    }

    console.log('[Firebase] Initialisierung...');
    console.log('[Firebase] Ist Capacitor native:', isCapacitorNative());

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);

    // browserLocalPersistence funktioniert besser im WebView als indexedDB
    if (isCapacitorNative()) {
        try {
            console.log('[Firebase] Setze browserLocalPersistence für Capacitor...');
            await setPersistence(auth, browserLocalPersistence);
            console.log('[Firebase] Persistence erfolgreich gesetzt');
        } catch (error) {
            console.warn('[Firebase] Persistence konnte nicht gesetzt werden:', error);
        }
    }

    const db = getFirestore(app);
    const storage = getStorage(app);
    const functions = getFunctions(app, 'europe-west3');

    if (shouldUseEmulators()) {
        try {
            connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
            connectFirestoreEmulator(db, 'localhost', 8080);
            connectFunctionsEmulator(functions, 'localhost', 5001);
            connectStorageEmulator(storage, 'localhost', 9199);
            console.log('Mit Firebase Emulatoren verbunden');
        } catch (error) {
            console.warn('Verbindung zu Emulatoren fehlgeschlagen:', error.message);
        }
    }

    console.log('[Firebase] Initialisierung abgeschlossen');
    firebaseInstance = { app, auth, db, storage, functions };
    return firebaseInstance;
}

export async function getFirebaseInstance() {
    return firebaseInstance || await initFirebase();
}
