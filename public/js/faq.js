// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// NEU: Der Emulator-Block
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("faq.js: Verbinde mit lokalen Firebase Emulatoren...");
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);
}

const backLink = document.getElementById('back-link');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is logged in - set back link based on role
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const { role } = userDoc.data();
            if (role === 'admin') backLink.href = '/admin.html';
            else if (role === 'coach') backLink.href = '/coach.html';
            else backLink.href = '/dashboard.html';
        } else {
            // User exists but no user document - go to index
            backLink.href = '/index.html';
        }
    } else {
        // User is not logged in - FAQ is publicly accessible, link back to index
        backLink.href = '/index.html';
    }
});