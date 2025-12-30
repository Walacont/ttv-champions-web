// SC Champions - Login-Seite (Firebase-Version)

import {
    signInWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    doc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import { initFirebase } from './firebase-init.js';
import { validateCodeFormat, formatCode, isCodeExpired } from './invitation-code-utils.js';

console.log('[INDEX] Script starting...');

const { auth, db } = await initFirebase();

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

// URL-Parameter prüfen für Direktlinks (z.B. aus WhatsApp)
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');
if (codeFromUrl) {
    switchToCodeTab();
    invitationCodeInput.value = codeFromUrl;
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.remove('hidden');
    }
}

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

// Auto-Formatierung des Codes (Bindestriche für bessere Lesbarkeit)
invitationCodeInput?.addEventListener('input', e => {
    let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (value.length > 3 && value.length <= 6) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    } else if (value.length > 6) {
        value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6, 9);
    }
    e.target.value = value;
});

// Auth-State-Listener: Leitet bereits eingeloggte Benutzer weiter
onAuthStateChanged(auth, async user => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (!userData.onboardingComplete) {
                    window.location.href = '/onboarding.html';
                    return;
                }
                let targetUrl;
                if (userData.role === 'admin') targetUrl = '/admin.html';
                else if (userData.role === 'coach') targetUrl = '/coach.html';
                else targetUrl = '/dashboard.html';

                window.location.href = targetUrl;
            }
        } catch (error) {
            console.error('[INDEX] Error fetching user document:', error);
        }
    }
});

if (loginForm) {
    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        const email = document.getElementById('email-address').value;
        const password = document.getElementById('password').value;
        const submitButton = document.getElementById('login-submit-button');
        feedbackMessage.textContent = '';
        feedbackMessage.className = 'mt-2 text-center text-sm';
        submitButton.disabled = true;

        try {
            // Timeout um hängende Anfragen zu erkennen
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Login timeout after 15 seconds')), 15000)
            );

            const loginPromise = signInWithEmailAndPassword(auth, email, password);
            await Promise.race([loginPromise, timeoutPromise]);
            // Weiterleitung erfolgt durch onAuthStateChanged Listener
        } catch (error) {
            console.error('[INDEX] Login error:', error);
            if (error.message === 'Login timeout after 15 seconds') {
                feedbackMessage.textContent = 'Login-Timeout. Bitte prüfe deine Internetverbindung.';
            } else {
                feedbackMessage.textContent = 'E-Mail oder Passwort ist falsch.';
            }
            feedbackMessage.classList.add('text-red-600');
            submitButton.disabled = false;
        }
    });
}

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

codeForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const code = invitationCodeInput.value.trim().toUpperCase();
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    if (!validateCodeFormat(code)) {
        feedbackMessage.textContent = 'Ungültiges Code-Format. Format: TTV-XXX-YYY';
        feedbackMessage.classList.add('text-red-600');
        return;
    }

    try {
        const q = query(collection(db, 'invitationCodes'), where('code', '==', code));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            feedbackMessage.textContent = 'Dieser Code existiert nicht. Bitte überprüfe den Code.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        const codeData = snapshot.docs[0].data();

        if (codeData.used) {
            feedbackMessage.textContent = 'Dieser Code wurde bereits verwendet.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        if (isCodeExpired(codeData.expiresAt)) {
            feedbackMessage.textContent =
                'Dieser Code ist leider abgelaufen. Bitte fordere einen neuen Code an.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        feedbackMessage.textContent = 'Code gültig! Weiterleitung zur Registrierung...';
        feedbackMessage.classList.add('text-green-600');

        setTimeout(() => {
            const targetUrl = `/register.html?code=${code}`;
            if (window.spaNavigate) {
                window.spaNavigate(targetUrl);
            } else {
                window.location.href = targetUrl;
            }
        }, 1000);
    } catch (error) {
        console.error('Fehler bei Code-Validierung:', error);
        feedbackMessage.textContent = 'Fehler beim Überprüfen des Codes. Bitte versuche es erneut.';
        feedbackMessage.classList.add('text-red-600');
    }
});

// Modal-Steuerung
const loginModal = document.getElementById('login-modal');
const openLoginBtn = document.getElementById('open-login-modal');
const closeLoginBtn = document.getElementById('close-login-modal');

if (loginModal && openLoginBtn && closeLoginBtn) {
    openLoginBtn.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });

    closeLoginBtn.addEventListener('click', () => {
        loginModal.classList.add('hidden');
    });

    loginModal.addEventListener('click', e => {
        if (e.target === loginModal) {
            loginModal.classList.add('hidden');
        }
    });
}
