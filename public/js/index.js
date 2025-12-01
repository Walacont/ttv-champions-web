// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { firebaseConfig, shouldUseEmulators } from './firebase-config.js';
import { validateCodeFormat, formatCode, isCodeExpired } from './invitation-code-utils.js';

console.log('[INDEX] Script starting...');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

console.log('[INDEX] Firebase initialized');

// Emulator-Verbindung nur wenn explizit aktiviert (USE_FIREBASE_EMULATORS = true)
if (shouldUseEmulators()) {
    console.log('Login-Script: Verbinde mit lokalen Firebase Emulatoren...');
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
}

const loginForm = document.getElementById('login-form');
const resetForm = document.getElementById('reset-form');
const codeForm = document.getElementById('code-form');
const feedbackMessage = document.getElementById('feedback-message');
const formTitle = document.getElementById('form-title');

const emailLoginTab = document.getElementById('email-login-tab');
const codeLoginTab = document.getElementById('code-login-tab');
const forgotPasswordButton = document.getElementById('forgot-password-button');
const backToLoginButton = document.getElementById('back-to-login-button');
const invitationCodeInput = document.getElementById('invitation-code');

console.log('[INDEX] DOM elements:', {
    loginForm: !!loginForm,
    resetForm: !!resetForm,
    codeForm: !!codeForm,
    emailLoginTab: !!emailLoginTab,
    codeLoginTab: !!codeLoginTab
});

// Check URL for code parameter (direct link from WhatsApp/etc)
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');
if (codeFromUrl) {
    // Switch to code tab and prefill
    switchToCodeTab();
    invitationCodeInput.value = codeFromUrl;

    // NEU: Auch das Modal direkt öffnen, wenn ein Code in der URL ist
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.remove('hidden');
    }
}

// Tab Switching
if (emailLoginTab) emailLoginTab.addEventListener('click', switchToEmailTab);
if (codeLoginTab) codeLoginTab.addEventListener('click', switchToCodeTab);

function switchToEmailTab() {
    emailLoginTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
    emailLoginTab.classList.remove('text-gray-600', 'border-transparent');
    codeLoginTab.classList.add('text-gray-600', 'border-transparent');
    codeLoginTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');

    loginForm.classList.remove('hidden');
    codeForm.classList.add('hidden');
    resetForm.classList.add('hidden');
    formTitle.textContent = 'Anmelden';
    feedbackMessage.textContent = '';
}

function switchToCodeTab() {
    codeLoginTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
    codeLoginTab.classList.remove('text-gray-600', 'border-transparent');
    emailLoginTab.classList.add('text-gray-600', 'border-transparent');
    emailLoginTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');

    codeForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    resetForm.classList.add('hidden');
    formTitle.textContent = 'Mit Code anmelden';
    feedbackMessage.textContent = '';
}

// Auto-format code input (add dashes)
invitationCodeInput?.addEventListener('input', e => {
    let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (value.length > 3 && value.length <= 6) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    } else if (value.length > 6) {
        value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6, 9);
    }
    e.target.value = value;
});

// *** VEREINFACHTE LOGIK ***
// Dieser Listener ist jetzt NUR für bereits eingeloggte Nutzer, die die Seite neu laden.
onAuthStateChanged(auth, async user => {
    if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            // Wenn das Onboarding aus irgendeinem Grund nicht abgeschlossen ist, schicke sie dorthin.
            if (!userData.onboardingComplete) {
                console.log('[LOGIN] User not onboarded, redirecting to onboarding');
                window.location.href = '/onboarding.html';
                return;
            }
            // Ansonsten, normale Weiterleitung basierend auf der Rolle.
            let targetUrl;
            if (userData.role === 'admin') targetUrl = '/admin.html';
            else if (userData.role === 'coach') targetUrl = '/coach.html';
            else targetUrl = '/dashboard.html';

            console.log('[LOGIN] User already logged in, redirecting to:', targetUrl);
            // Use normal navigation for initial login redirect (not SPA navigation)
            window.location.href = targetUrl;
        }
    }
});

loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    console.log('[INDEX] Login form submitted');
    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const submitButton = document.getElementById('login-submit-button');
    console.log('[INDEX] Attempting login for:', email);
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';
    submitButton.disabled = true;

    try {
        console.log('[INDEX] Calling signInWithEmailAndPassword...');
        await signInWithEmailAndPassword(auth, email, password);
        console.log('[INDEX] Login successful');
        // Die Weiterleitung wird vom onAuthStateChanged Listener oben übernommen.
    } catch (error) {
        console.error('Login-Fehler:', error);
        feedbackMessage.textContent = 'E-Mail oder Passwort ist falsch.';
        feedbackMessage.classList.add('text-red-600');
        submitButton.disabled = false;
    }
});

forgotPasswordButton?.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    resetForm.classList.remove('hidden');
    formTitle.textContent = 'Passwort zurücksetzen';
    feedbackMessage.textContent = '';
});

backToLoginButton?.addEventListener('click', () => {
    resetForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    formTitle.textContent = 'Anmelden';
    feedbackMessage.textContent = '';
});

resetForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('reset-email-address').value;
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    try {
        await sendPasswordResetEmail(auth, email);
        feedbackMessage.textContent =
            'Ein Link zum Zurücksetzen des Passworts wurde an Ihre E-Mail-Adresse gesendet.';
        feedbackMessage.classList.add('text-green-600');
    } catch (error) {
        console.error('Passwort-Reset Fehler:', error);
        feedbackMessage.textContent =
            'Fehler beim Senden der E-Mail. Bitte überprüfen Sie die Adresse.';
        feedbackMessage.classList.add('text-red-600');
    }
});

// Code Form Handler
codeForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const code = invitationCodeInput.value.trim().toUpperCase();
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    // Validiere Format
    if (!validateCodeFormat(code)) {
        feedbackMessage.textContent = 'Ungültiges Code-Format. Format: TTV-XXX-YYY';
        feedbackMessage.classList.add('text-red-600');
        return;
    }

    try {
        // Suche Code in Firestore
        const q = query(collection(db, 'invitationCodes'), where('code', '==', code));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            feedbackMessage.textContent = 'Dieser Code existiert nicht. Bitte überprüfe den Code.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        const codeData = snapshot.docs[0].data();
        const codeId = snapshot.docs[0].id;

        // Prüfe ob Code bereits verwendet wurde
        if (codeData.used) {
            feedbackMessage.textContent = 'Dieser Code wurde bereits verwendet.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        // Prüfe ob Code abgelaufen ist
        if (isCodeExpired(codeData.expiresAt)) {
            feedbackMessage.textContent =
                'Dieser Code ist leider abgelaufen. Bitte fordere einen neuen Code an.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        // Code ist gültig! Weiterleitung zur Registrierung
        feedbackMessage.textContent = 'Code gültig! Weiterleitung zur Registrierung...';
        feedbackMessage.classList.add('text-green-600');

        setTimeout(() => {
            const targetUrl = `/register.html?code=${code}`;
            console.log('[INDEX] Navigating to:', targetUrl);
            console.log('[INDEX] spaNavigate available?', !!window.spaNavigate);

            // Use SPA navigation if available, otherwise fallback to normal navigation
            if (window.spaNavigate) {
                console.log('[INDEX] Using SPA navigation');
                window.spaNavigate(targetUrl);
            } else {
                console.log('[INDEX] Using normal navigation');
                window.location.href = targetUrl;
            }
        }, 1000);
    } catch (error) {
        console.error('Fehler bei Code-Validierung:', error);
        feedbackMessage.textContent = 'Fehler beim Überprüfen des Codes. Bitte versuche es erneut.';
        feedbackMessage.classList.add('text-red-600');
    }
});

// ===== CODE FÜR MODAL-STEUERUNG (HINZUFÜGEN) =====

// Alle Elemente für das Modal holen
const loginModal = document.getElementById('login-modal');
const openLoginBtn = document.getElementById('open-login-modal');
const closeLoginBtn = document.getElementById('close-login-modal');

if (loginModal && openLoginBtn && closeLoginBtn) {
    // Modal öffnen (Klick auf "Login" im Header)
    openLoginBtn.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });

    // Modal schließen (Klick auf 'X' im Modal)
    closeLoginBtn.addEventListener('click', () => {
        loginModal.classList.add('hidden');
    });

    // Modal schließen (Klick auf den dunklen Hintergrund)
    loginModal.addEventListener('click', e => {
        // Prüfen, ob der Klick direkt auf den Hintergrund (loginModal)
        // und nicht auf ein Kind-Element (das weiße Panel) erfolgte.
        if (e.target === loginModal) {
            loginModal.classList.add('hidden');
        }
    });
}
