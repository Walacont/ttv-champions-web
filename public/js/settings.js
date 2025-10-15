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
        }
        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';

    } else {
        window.location.href = '/index.html';
    }
});

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