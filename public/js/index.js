// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// NEU: Der Emulator-Block
// Verbindet sich nur mit den lokalen Emulatoren, wenn die Seite über localhost läuft.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Login-Script: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);
}

const loginForm = document.getElementById('login-form');
const resetForm = document.getElementById('reset-form');
const feedbackMessage = document.getElementById('feedback-message');
const formTitle = document.getElementById('form-title');

const forgotPasswordButton = document.getElementById('forgot-password-button');
const backToLoginButton = document.getElementById('back-to-login-button');

// *** VEREINFACHTE LOGIK ***
// Dieser Listener ist jetzt NUR für bereits eingeloggte Nutzer, die die Seite neu laden.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Wenn das Onboarding aus irgendeinem Grund nicht abgeschlossen ist, schicke sie dorthin.
            if (!userData.onboardingComplete) {
                window.location.href = '/onboarding.html';
                return;
            }
            // Ansonsten, normale Weiterleitung basierend auf der Rolle.
            if (userData.role === 'admin') window.location.href = '/admin.html';
            else if (userData.role === 'coach') window.location.href = '/coach.html';
            else window.location.href = '/dashboard.html';
        }
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const submitButton = document.getElementById('login-submit-button');
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';
    submitButton.disabled = true;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // Die Weiterleitung wird vom onAuthStateChanged Listener oben übernommen.
    } catch (error) {
        console.error("Login-Fehler:", error);
        feedbackMessage.textContent = 'E-Mail oder Passwort ist falsch.';
        feedbackMessage.classList.add('text-red-600');
        submitButton.disabled = false;
    }
});

forgotPasswordButton.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    resetForm.classList.remove('hidden');
    formTitle.textContent = 'Passwort zurücksetzen';
    feedbackMessage.textContent = '';
});

backToLoginButton.addEventListener('click', () => {
    resetForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    formTitle.textContent = 'Anmelden';
    feedbackMessage.textContent = '';
});

resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reset-email-address').value;
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    try {
        await sendPasswordResetEmail(auth, email);
        feedbackMessage.textContent = 'Ein Link zum Zurücksetzen des Passworts wurde an Ihre E-Mail-Adresse gesendet.';
        feedbackMessage.classList.add('text-green-600');
    } catch (error) {
        console.error("Passwort-Reset Fehler:", error);
        feedbackMessage.textContent = 'Fehler beim Senden der E-Mail. Bitte überprüfen Sie die Adresse.';
        feedbackMessage.classList.add('text-red-600');
    }
});