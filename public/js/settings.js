// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, connectAuthEmulator, verifyBeforeUpdateEmail, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// NEU: Der Emulator-Block
// Verbindet sich nur mit den lokalen Emulatoren, wenn die Seite über localhost läuft.
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Settings.js: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);

    // Storage Emulator
    connectStorageEmulator(storage, "localhost", 9199);
}


const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const profileImagePreview = document.getElementById('profile-image-preview');
const photoUpload = document.getElementById('photo-upload');
const savePhotoButton = document.getElementById('save-photo-button');
const uploadPhotoForm = document.getElementById('upload-photo-form');
const uploadFeedback = document.getElementById('upload-feedback');
const updateNameForm = document.getElementById('update-name-form');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const nameFeedback = document.getElementById('name-feedback');
const currentEmailDisplay = document.getElementById('current-email');
const emailVerificationStatus = document.getElementById('email-verification-status');
const updateEmailForm = document.getElementById('update-email-form');
const newEmailInput = document.getElementById('new-email');
const currentPasswordInput = document.getElementById('current-password');
const emailFeedback = document.getElementById('email-feedback');

let currentUser = null;
let selectedFile = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            const initials = (userData.firstName?.[0] || '') + (userData.lastName?.[0] || '');
            profileImagePreview.src = userData.photoURL || `https://placehold.co/96x96/e2e8f0/64748b?text=${initials}`;
            firstNameInput.value = userData.firstName || '';
            lastNameInput.value = userData.lastName || '';

            // Synchronisiere Email zwischen Firebase Auth und Firestore
            if (user.email !== userData.email) {
                console.log('Email-Adresse hat sich geändert, aktualisiere Firestore...');
                await updateDoc(userDocRef, { email: user.email });
            }
        }

        // Email-Adresse anzeigen und Verifizierungs-Status
        currentEmailDisplay.textContent = user.email || 'Keine Email hinterlegt';
        updateEmailVerificationStatus(user.emailVerified);

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

    } else {
        window.location.href = '/index.html';
    }
});

// Zeigt den Email-Verifizierungs-Status an
function updateEmailVerificationStatus(isVerified) {
    if (isVerified) {
        emailVerificationStatus.innerHTML = `
            <div class="flex items-center text-green-600 text-sm">
                <i class="fas fa-check-circle mr-2"></i>
                <span>Email-Adresse verifiziert</span>
            </div>
        `;
    } else {
        emailVerificationStatus.innerHTML = `
            <div class="flex flex-col space-y-2">
                <div class="flex items-center text-amber-600 text-sm">
                    <i class="fas fa-exclamation-triangle mr-2"></i>
                    <span>Email-Adresse nicht verifiziert</span>
                </div>
                <button id="send-verification-btn" class="text-indigo-600 hover:text-indigo-800 text-sm font-semibold text-left">
                    Verifizierungs-Email erneut senden
                </button>
            </div>
        `;

        // Event Listener für Verifizierungs-Email
        document.getElementById('send-verification-btn')?.addEventListener('click', sendVerificationEmail);
    }
}

// Sendet eine Email-Verifikation
async function sendVerificationEmail() {
    try {
        await sendEmailVerification(currentUser);
        emailVerificationStatus.innerHTML = `
            <div class="flex items-center text-green-600 text-sm">
                <i class="fas fa-check-circle mr-2"></i>
                <span>Verifizierungs-Email wurde gesendet! Bitte prüfe dein Postfach.</span>
            </div>
        `;
    } catch (error) {
        console.error("Fehler beim Senden der Verifizierungs-Email:", error);
        emailVerificationStatus.innerHTML += `
            <p class="text-red-600 text-sm mt-2">Fehler: ${error.message}</p>
        `;
    }
}

photoUpload.addEventListener('change', (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = (event) => {
            profileImagePreview.src = event.target.result;
        }
        reader.readAsDataURL(selectedFile);
        savePhotoButton.disabled = false;
        savePhotoButton.classList.remove('opacity-0');
    }
});

uploadPhotoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile || !currentUser) return;

    savePhotoButton.disabled = true;
    savePhotoButton.textContent = 'Speichere...';
    uploadFeedback.textContent = '';
    uploadFeedback.className = 'mt-2 text-sm';

    try {
        const storageRef = ref(storage, `profile-pictures/${currentUser.uid}/${selectedFile.name}`);
        const snapshot = await uploadBytes(storageRef, selectedFile);
        const photoURL = await getDownloadURL(snapshot.ref);

        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, { photoURL });

        uploadFeedback.textContent = 'Profilbild erfolgreich aktualisiert!';
        uploadFeedback.classList.add('text-green-600');
        savePhotoButton.classList.add('opacity-0');
        selectedFile = null;

    } catch (error) {
        console.error("Fehler beim Hochladen des Bildes:", error);
        uploadFeedback.textContent = 'Fehler beim Speichern des Bildes.';
        uploadFeedback.classList.add('text-red-600');
    } finally {
        savePhotoButton.disabled = false;
        savePhotoButton.textContent = 'Speichern';
    }
});

updateNameForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const firstName = firstNameInput.value;
    const lastName = lastNameInput.value;
    nameFeedback.textContent = '';

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            firstName,
            lastName
        });
        nameFeedback.textContent = 'Name erfolgreich gespeichert!';
        nameFeedback.className = 'mt-2 text-sm text-green-600'; // Erfolgsmeldung grün machen
    } catch (error) {
        console.error("Fehler beim Speichern des Namens:", error);
        nameFeedback.textContent = 'Fehler beim Speichern des Namens.';
        nameFeedback.className = 'mt-2 text-sm text-red-600';
    }
});

// Email-Änderung mit Re-Authentication
updateEmailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newEmail = newEmailInput.value.trim();
    const password = currentPasswordInput.value;

    emailFeedback.textContent = '';
    emailFeedback.className = 'text-sm';

    // Validierung
    if (newEmail === currentUser.email) {
        emailFeedback.textContent = 'Die neue Email-Adresse ist identisch mit der aktuellen.';
        emailFeedback.className = 'text-sm text-amber-600';
        return;
    }

    try {
        // Schritt 1: Re-Authentication (Sicherheit)
        const credential = EmailAuthProvider.credential(currentUser.email, password);
        await reauthenticateWithCredential(currentUser, credential);

        // Schritt 2: Verifizierungs-Email an NEUE Email senden
        // Firebase ändert die Email automatisch nachdem der User den Link klickt
        await verifyBeforeUpdateEmail(currentUser, newEmail);

        // Erfolg!
        emailFeedback.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div class="flex items-start">
                    <i class="fas fa-envelope text-blue-600 mt-1 mr-3"></i>
                    <div>
                        <p class="font-semibold text-blue-900">Verifizierungs-Email gesendet!</p>
                        <p class="text-sm text-blue-700 mt-1">
                            Wir haben eine Verifizierungs-Email an <strong>${newEmail}</strong> gesendet.
                            Bitte klicke auf den Link in der Email, um deine neue Email-Adresse zu bestätigen.
                        </p>
                        <p class="text-xs text-blue-600 mt-2">
                            <i class="fas fa-info-circle mr-1"></i>
                            Deine Email-Adresse wird automatisch geändert, sobald du den Link bestätigst.
                            Danach musst du dich eventuell erneut anmelden.
                        </p>
                    </div>
                </div>
            </div>
        `;

        // Formular zurücksetzen
        newEmailInput.value = '';
        currentPasswordInput.value = '';

    } catch (error) {
        console.error("Fehler beim Ändern der Email:", error);

        let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.';

        // Spezifische Fehlermeldungen
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Das eingegebene Passwort ist falsch.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese Email-Adresse wird bereits von einem anderen Account verwendet.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Die eingegebene Email-Adresse ist ungültig.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Aus Sicherheitsgründen musst du dich erneut anmelden, bevor du deine Email ändern kannst.';
        } else if (error.code === 'auth/too-many-requests') {
            errorMessage = 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.';
        }

        emailFeedback.innerHTML = `
            <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                <div class="flex items-start">
                    <i class="fas fa-exclamation-circle text-red-600 mt-1 mr-3"></i>
                    <div>
                        <p class="font-semibold text-red-900">Fehler beim Ändern der Email-Adresse</p>
                        <p class="text-sm text-red-700 mt-1">${errorMessage}</p>
                    </div>
                </div>
            </div>
        `;
    }
});