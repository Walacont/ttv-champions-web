import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js';
import {
    getFirestore,
    doc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
    updateDoc,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    getFunctions,
    httpsCallable,
    connectFunctionsEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';
import { isCodeExpired, validateCodeFormat } from './invitation-code-utils.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);
const functions = getFunctions(app, 'europe-west3');

if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('Register.js: Verbinde mit lokalen Firebase Emulatoren...');
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectFunctionsEmulator(functions, 'localhost', 5001);
}

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

async function initializeRegistration() {
    const urlParams = new URLSearchParams(window.location.search);
    tokenId = urlParams.get('token');
    invitationCode = urlParams.get('code');

    if (!tokenId && !invitationCode) {
        return;
    }

    if (tokenRequiredMessageContainer) {
        tokenRequiredMessageContainer.classList.add('hidden');
    }
    loader.classList.remove('hidden');

    try {
        if (invitationCode) {
            registrationType = 'code';
            invitationCode = invitationCode.trim().toUpperCase();

            if (!validateCodeFormat(invitationCode)) {
                return displayError('Ungültiges Code-Format.');
            }

            const q = query(collection(db, 'invitationCodes'), where('code', '==', invitationCode));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                return displayError('Dieser Code existiert nicht.');
            }

            invitationCodeData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

            if (invitationCodeData.used) {
                return displayError('Dieser Code wurde bereits verwendet.');
            }

            if (isCodeExpired(invitationCodeData.expiresAt)) {
                return displayError('Dieser Code ist abgelaufen.');
            }

            const welcomeName = invitationCodeData.firstName
                ? invitationCodeData.firstName
                : 'Coach';
            formSubtitle.textContent = `Willkommen ${welcomeName}! Vervollständige deine Registrierung.`;
            loader.classList.add('hidden');
            registrationFormContainer.classList.remove('hidden');
        }
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
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

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
        }
        else if (registrationType === 'token') {
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
        }
    } catch (error) {
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

/** Zeigt eine Fehlermeldung an */
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
        console.error(
            'Kritischer Fehler: #token-required-message Container nicht im DOM gefunden.'
        );
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
