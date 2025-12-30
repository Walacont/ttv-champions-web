// FAQ-Seite (Firebase-Version)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { firebaseConfig, shouldUseEmulators } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

if (shouldUseEmulators()) {
    console.log('faq.js: Verbinde mit lokalen Firebase Emulatoren...');
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
}

const backLink = document.getElementById('back-link');

onAuthStateChanged(auth, async user => {
    if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const { role } = userDoc.data();
            if (role === 'admin') backLink.href = '/admin.html';
            else if (role === 'coach') backLink.href = '/coach.html';
            else backLink.href = '/dashboard.html';
        } else {
            backLink.href = '/index.html';
        }
    } else {
        backLink.href = '/index.html';
    }
});
