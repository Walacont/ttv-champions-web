// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js";
import { getFirestore, doc, getDoc, updateDoc, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

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

// Initialize date select fields
function initializeDateSelects() {
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');

    // Fill days (1-31)
    for (let i = 1; i <= 31; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        daySelect.appendChild(option);
    }

    // Fill months (1-12)
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        monthSelect.appendChild(option);
    }

    // Fill years (1900 to current year)
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 1900; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }
}

// Initialize the date selects when the page loads
initializeDateSelects();

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

            // Fill birthdate selects if data exists
            if (currentUserData.birthdate) {
                const dateParts = currentUserData.birthdate.split('-');
                if (dateParts.length === 3) {
                    document.getElementById('birthdate-year').value = dateParts[0];
                    document.getElementById('birthdate-month').value = parseInt(dateParts[1], 10);
                    document.getElementById('birthdate-day').value = parseInt(dateParts[2], 10);
                }
            }

        } else {
            errorMessage.textContent = "Fehler: Dein Profil konnte nicht gefunden werden. Bitte starte den Prozess neu.";
            submitButton.disabled = true;
        }
    } else {
        // Use SPA navigation if available
        if (window.spaNavigate) {
            window.spaNavigate('/index.html');
        } else {
            window.location.href = '/index.html';
        }
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

        // Combine the three date select values into YYYY-MM-DD format
        const day = document.getElementById('birthdate-day').value;
        const month = document.getElementById('birthdate-month').value;
        const year = document.getElementById('birthdate-year').value;

        // Pad day and month with leading zeros if needed
        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        const birthdate = `${year}-${paddedMonth}-${paddedDay}`;

        const dataToUpdate = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            birthdate: birthdate,
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
    let targetUrl;
    if (role === 'admin') {
        targetUrl = '/admin.html';
    } else if (role === 'coach') {
        targetUrl = '/coach.html';
    } else {
        targetUrl = '/dashboard.html';
    }

    console.log("[ONBOARDING] Onboarding complete, redirecting to:", targetUrl);
    // Use normal navigation after onboarding (not SPA) to ensure fresh state
    window.location.href = targetUrl;
}