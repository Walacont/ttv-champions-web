// SC Champions - Registrierungsseite (Firebase-Version)

import {
    createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    doc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
    updateDoc,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    httpsCallable,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';
import { initFirebase } from './firebase-init.js';
import { isCodeExpired, validateCodeFormat } from './invitation-code-utils.js';

const { auth, db, functions } = await initFirebase();

const loader = document.getElementById('loader');
const registrationFormContainer = document.getElementById('registration-form-container');
const registrationForm = document.getElementById('registration-form');
const errorMessage = document.getElementById('error-message');
const formSubtitle = document.getElementById('form-subtitle');
const submitButton = document.getElementById('submit-button');
const tokenRequiredMessageContainer = document.getElementById('token-required-message');

let tokenId = null;
let invitationCode = null;
let invitationCodeData = null;
let registrationType = null;

// Registrierung initialisieren (funktioniert für normale Seitenladung und SPA-Navigation)
async function initializeRegistration() {
    const urlParams = new URLSearchParams(window.location.search);
    tokenId = urlParams.get('token');
    invitationCode = urlParams.get('code');

    // 1. Prüfe ob Token ODER Code vorhanden
    if (!tokenId && !invitationCode) {
        // KEIN Token/Code: Tu nichts. Die register.html zeigt bereits
        // die Standard-Nachricht (#token-required-message) an.
        return;
    }

    // 2. Token/Code GEFUNDEN: Standardnachricht verstecken, Loader anzeigen
    if (tokenRequiredMessageContainer) {
        tokenRequiredMessageContainer.classList.add('hidden');
    }
    loader.classList.remove('hidden'); // Loader jetzt sichtbar machen

    try {
        // ===== CODE-FLOW =====
        if (invitationCode) {
            registrationType = 'code';
            invitationCode = invitationCode.trim().toUpperCase();

            // Validiere Format
            if (!validateCodeFormat(invitationCode)) {
                return displayError('Ungültiges Code-Format.'); // Nutzt neue displayError
            }

            // Suche Code in Firestore
            const q = query(collection(db, 'invitationCodes'), where('code', '==', invitationCode));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                return displayError('Dieser Code existiert nicht.');
            }

            invitationCodeData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

            // Prüfe ob Code bereits verwendet wurde
            if (invitationCodeData.used) {
                return displayError('Dieser Code wurde bereits verwendet.');
            }

            // Prüfe ob Code abgelaufen ist
            if (isCodeExpired(invitationCodeData.expiresAt)) {
                return displayError('Dieser Code ist abgelaufen.');
            }

            // Code gültig - Zeige Formular mit vorausgefüllten Daten
            const welcomeName = invitationCodeData.firstName
                ? invitationCodeData.firstName
                : 'Coach';
            formSubtitle.textContent = `Willkommen ${welcomeName}! Vervollständige deine Registrierung.`;
            loader.classList.add('hidden');
            registrationFormContainer.classList.remove('hidden');
        }
        // ===== TOKEN-FLOW (Bisheriger Flow) =====
        else if (tokenId) {
            registrationType = 'token';
            const tokenDocRef = doc(db, 'invitationTokens', tokenId);
            const tokenDocSnap = await getDoc(tokenDocRef);

            if (tokenDocSnap.exists() && !tokenDocSnap.data().isUsed) {
                const tokenData = tokenDocSnap.data();
                formSubtitle.textContent = `Willkommen im Verein ${tokenData.clubId}!`;
                loader.classList.add('hidden');
                registrationFormContainer.classList.remove('hidden');
            } else {
                displayError('Dieser Einladungslink ist ungültig oder wurde bereits verwendet.');
            }
        }
    } catch (error) {
        displayError('Fehler beim Überprüfen der Einladung. Bitte versuche es erneut.');
    }
}

window.addEventListener('load', initializeRegistration);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeRegistration);
} else {
    initializeRegistration();
}

// Registrierung ohne Code
const registerWithoutCodeBtn = document.getElementById('register-without-code-btn');
if (registerWithoutCodeBtn) {
    registerWithoutCodeBtn.addEventListener('click', () => {
        registrationType = 'no-code';

        // Hide welcome message, show registration form
        tokenRequiredMessageContainer.classList.add('hidden');
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

        // Show name fields (required for no-code registration)
        const nameFields = document.getElementById('name-fields');
        if (nameFields) {
            nameFields.classList.remove('hidden');
            // Make name fields required
            document.getElementById('first-name').required = true;
            document.getElementById('last-name').required = true;
        }

        // Update subtitle
        formSubtitle.textContent = 'Erstelle deinen Account und trete später einem Verein bei.';
    });
}

registrationForm.addEventListener('submit', async e => {
    e.preventDefault();
    errorMessage.textContent = '';

    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password-confirm').value;
    const consentStudy = document.getElementById('consent-study').checked;
    const consentPrivacy = document.getElementById('consent-privacy').checked;

    if (password !== passwordConfirm) {
        errorMessage.textContent = 'Die Passwörter stimmen nicht überein.';
        return;
    }

    if (!consentStudy || !consentPrivacy) {
        errorMessage.textContent = 'Du musst der Studie und der Datenschutzerklärung zustimmen.';
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Registriere...';

    try {
        // Firebase User erstellen
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Kurz warten, bis Auth-State vollständig aktiv ist
        await new Promise(resolve => setTimeout(resolve, 1500));
        await user.getIdToken(true);

        if (registrationType === 'code') {
            const claimInvitationCode = httpsCallable(functions, 'claimInvitationCode');
            const result = await claimInvitationCode({
                code: invitationCode,
                codeId: invitationCodeData.id,
            });

            if (result.data.success) {
                if (window.spaNavigate) {
                    window.spaNavigate('/onboarding.html');
                } else {
                    window.location.href = '/onboarding.html';
                }
            } else {
                throw new Error('Ein unbekannter Fehler ist aufgetreten.');
            }
        } else if (registrationType === 'token') {
            const claimInvitationToken = httpsCallable(functions, 'claimInvitationToken');
            const result = await claimInvitationToken({ tokenId });

            if (result.data.success) {
                if (window.spaNavigate) {
                    window.spaNavigate('/onboarding.html');
                } else {
                    window.location.href = '/onboarding.html';
                }
            } else {
                throw new Error('Ein unbekannter Fehler ist aufgetreten.');
            }
        } else if (registrationType === 'no-code') {
            const firstName = document.getElementById('first-name').value.trim();
            const lastName = document.getElementById('last-name').value.trim();

            if (!firstName || !lastName) {
                errorMessage.textContent = 'Bitte gib deinen Vor- und Nachnamen ein.';
                submitButton.disabled = false;
                submitButton.textContent = 'Registrierung abschließen';
                return;
            }

            const registerWithoutCode = httpsCallable(functions, 'registerWithoutCode');
            const result = await registerWithoutCode({
                firstName,
                lastName,
            });

            if (result.data.success) {
                if (window.spaNavigate) {
                    window.spaNavigate('/onboarding.html');
                } else {
                    window.location.href = '/onboarding.html';
                }
            } else {
                throw new Error('Ein unbekannter Fehler ist aufgetreten.');
            }
        }
    } catch (error) {
        console.error('[REGISTER] Error:', error);
        let displayMsg = error.message;
        if (error.code === 'auth/email-already-in-use') {
            displayMsg = 'Diese E-Mail-Adresse wird bereits verwendet.';
        } else if (error.code === 'auth/invalid-email') {
            displayMsg = 'Ungültige E-Mail-Adresse.';
        } else if (error.code === 'auth/weak-password') {
            displayMsg = 'Das Passwort ist zu schwach.';
        } else if (error.code === 'functions/unauthenticated') {
            displayMsg = 'Deine Sitzung ist abgelaufen. Bitte versuche es erneut.';
        } else if (error.code === 'functions/internal') {
            displayMsg = 'Ein interner Serverfehler ist aufgetreten.';
        } else if (error.message.includes('PERMISSION_DENIED')) {
            displayMsg = 'Zugriff verweigert – bitte versuche es erneut.';
        }

        errorMessage.textContent = 'Fehler bei der Registrierung: ' + displayMsg;
        submitButton.disabled = false;
        submitButton.textContent = 'Registrieren';
    }
});

// Fehleranzeige (nutzt bestehenden Container)
function displayError(message) {
    loader.classList.add('hidden');
    registrationFormContainer.classList.add('hidden');

    if (tokenRequiredMessageContainer) {
        const icon = tokenRequiredMessageContainer.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-exclamation-triangle text-4xl text-red-600';
        }

        const title = tokenRequiredMessageContainer.querySelector('h1');
        if (title) {
            title.textContent = 'Ein Fehler ist aufgetreten';
            title.classList.remove('text-gray-900');
            title.classList.add('text-red-600');
        }

        const paragraphs = tokenRequiredMessageContainer.querySelectorAll('p');
        if (paragraphs[0]) {
            paragraphs[0].textContent = message;
            paragraphs[0].classList.remove('text-gray-600');
            paragraphs[0].classList.add('text-gray-800', 'font-medium');
        }

        if (paragraphs[1]) paragraphs[1].classList.add('hidden');
        const divider = tokenRequiredMessageContainer.querySelector('div.border-t');
        if (divider) divider.classList.add('hidden');

        const homeLink = tokenRequiredMessageContainer.querySelector('a');
        if (homeLink) {
            homeLink.href = '/';
        }

        tokenRequiredMessageContainer.classList.remove('hidden');
    } else {
        document.body.innerHTML = `
      <div class="w-full max-w-md p-8 bg-white rounded-xl shadow-lg text-center mx-auto mt-10">
        <h2 class="text-2xl font-bold text-red-600">Fehler</h2>
        <p class="text-gray-700 mt-2">${message}</p>
        <a href="/" class="inline-block mt-6 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">
          Zur Startseite
        </a>
      </div>`;
    }
}
