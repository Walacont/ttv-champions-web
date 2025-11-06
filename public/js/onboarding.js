// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// NEU: Der Emulator-Block
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.log("Onboarding.js: Verbinde mit lokalen Firebase Emulatoren...");
    
    // Auth Emulator
    connectAuthEmulator(auth, "http://localhost:9099");
    
    // Firestore Emulator
    connectFirestoreEmulator(db, "localhost", 8080);

    // Storage Emulator
    connectStorageEmulator(storage, "localhost", 9199);
}


const onboardingForm = document.getElementById('onboarding-form');
const submitButton = document.getElementById('submit-button');
const errorMessage = document.getElementById('error-message');
const photoUpload = document.getElementById('photo-upload');
const profileImagePreview = document.getElementById('profile-image-preview');

let currentUser = null;
let currentUserData = null; // Wir speichern die Daten aus Firestore hier
let selectedFile = null;

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // WICHTIG: Erzwinge die Aktualisierung des Tokens, um die neuen Custom Claims zu erhalten.
        await user.getIdToken(true);

        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            currentUserData = userDocSnap.data();

            if (currentUserData.onboardingComplete) {
                redirectToDashboard(currentUserData.role);
                return;
            }

            // Fülle das Formular mit den Daten, die vom Coach/Admin angelegt wurden
            document.getElementById('firstName').value = currentUserData.firstName || '';
            document.getElementById('lastName').value = currentUserData.lastName || '';

        } else {
            errorMessage.textContent = "Fehler: Dein Profil konnte nicht gefunden werden. Bitte starte den Prozess neu.";
            submitButton.disabled = true;
        }
    } else {
        window.location.href = '/index.html';
    }
});

photoUpload.addEventListener('change', (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = (event) => { profileImagePreview.src = event.target.result; };
        reader.readAsDataURL(selectedFile);
    }
});

onboardingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Speichern...';
    errorMessage.textContent = '';

    try {
        if (!currentUser || !currentUserData) {
            throw new Error("Benutzerdaten nicht geladen. Bitte Seite neu laden.");
        }

        let photoURL = currentUserData.photoURL || null; // Behalte altes Foto, falls keins ausgewählt
        if (selectedFile) {
            const storageRef = ref(storage, `profile-pictures/${currentUser.uid}/${selectedFile.name}`);
            const snapshot = await uploadBytes(storageRef, selectedFile);
            photoURL = await getDownloadURL(snapshot.ref);
        }
        
        const dataToUpdate = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            birthdate: document.getElementById('birthdate').value,
            gender: document.getElementById('gender').value,
            photoURL: photoURL,
            onboardingComplete: true, // Wichtig: Onboarding abschließen
            isOffline: false, // User is now online after completing onboarding
        };

        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, dataToUpdate);
        
        redirectToDashboard(currentUserData.role);

    } catch (error) {
        errorMessage.textContent = 'Fehler: ' + error.message;
        submitButton.disabled = false;
        submitButton.textContent = 'Profil speichern';
    }
});

function redirectToDashboard(role) {
    if (role === 'admin') {
        window.location.href = '/admin.html';
    } else if (role === 'coach') {
        window.location.href = '/coach.html';
    } else {
        window.location.href = '/dashboard.html';
    }
}