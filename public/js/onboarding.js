// Onboarding-Seite (Firebase-Version)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    collection,
    getDocs,
    query,
    where,
    addDoc,
    Timestamp,
    connectFirestoreEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    connectStorageEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';
import { firebaseConfig, shouldUseEmulators } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

if (shouldUseEmulators()) {
    console.log('Onboarding.js: Verbinde mit lokalen Firebase Emulatoren...');
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
}

const onboardingForm = document.getElementById('onboarding-form');
const submitButton = document.getElementById('submit-button');
const errorMessage = document.getElementById('error-message');
const photoUpload = document.getElementById('photo-upload');
const profileImagePreview = document.getElementById('profile-image-preview');

let currentUser = null;
let currentUserData = null;
let selectedFile = null;

function initializeDateSelects() {
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');

    for (let i = 1; i <= 31; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        daySelect.appendChild(option);
    }

    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        monthSelect.appendChild(option);
    }

    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 1900; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }
}

initializeDateSelects();

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;

        // Token aktualisieren für neue Custom Claims
        await user.getIdToken(true);

        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            currentUserData = userDocSnap.data();

            if (currentUserData.onboardingComplete) {
                redirectToDashboard(currentUserData.role);
                return;
            }

            document.getElementById('firstName').value = currentUserData.firstName || '';
            document.getElementById('lastName').value = currentUserData.lastName || '';

            if (currentUserData.birthdate) {
                const dateParts = currentUserData.birthdate.split('-');
                if (dateParts.length === 3) {
                    document.getElementById('birthdate-year').value = dateParts[0];
                    document.getElementById('birthdate-month').value = parseInt(dateParts[1], 10);
                    document.getElementById('birthdate-day').value = parseInt(dateParts[2], 10);
                }
            }
        } else {
            errorMessage.textContent =
                'Fehler: Dein Profil konnte nicht gefunden werden. Bitte starte den Prozess neu.';
            submitButton.disabled = true;
        }
    } else {
        if (window.spaNavigate) {
            window.spaNavigate('/index.html');
        } else {
            window.location.href = '/index.html';
        }
    }
});

photoUpload.addEventListener('change', e => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = event => {
            profileImagePreview.src = event.target.result;
        };
        reader.readAsDataURL(selectedFile);
    }
});

onboardingForm.addEventListener('submit', async e => {
    e.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Speichern...';
    errorMessage.textContent = '';

    try {
        if (!currentUser || !currentUserData) {
            throw new Error('Benutzerdaten nicht geladen. Bitte Seite neu laden.');
        }

        let photoURL = currentUserData.photoURL || null;
        if (selectedFile) {
            const storageRef = ref(
                storage,
                `profile-pictures/${currentUser.uid}/${selectedFile.name}`
            );
            const snapshot = await uploadBytes(storageRef, selectedFile);
            photoURL = await getDownloadURL(snapshot.ref);
        }

        const day = document.getElementById('birthdate-day').value;
        const month = document.getElementById('birthdate-month').value;
        const year = document.getElementById('birthdate-year').value;

        const paddedDay = day.padStart(2, '0');
        const paddedMonth = month.padStart(2, '0');
        const birthdate = `${year}-${paddedMonth}-${paddedDay}`;

        const qttrPointsInput = document.getElementById('qttr-points').value;
        const qttrPoints = qttrPointsInput ? parseInt(qttrPointsInput, 10) : null;

        const dataToUpdate = {
            firstName: document.getElementById('firstName').value,
            lastName: document.getElementById('lastName').value,
            birthdate: birthdate,
            gender: document.getElementById('gender').value,
            photoURL: photoURL,
            onboardingComplete: true,
            isOffline: false,
        };

        // QTTR zu Elo konvertieren: ELO = QTTR * 0.9, minimum 800
        if (qttrPoints !== null && qttrPoints > 0) {
            dataToUpdate.qttrPoints = qttrPoints;
            const calculatedElo = Math.max(800, Math.round(qttrPoints * 0.9));
            dataToUpdate.eloRating = calculatedElo;
            dataToUpdate.highestElo = calculatedElo;
        }

        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, dataToUpdate);

        redirectToDashboard(currentUserData.role);
    } catch (error) {
        errorMessage.textContent = 'Fehler: ' + error.message;
        submitButton.disabled = false;
        submitButton.textContent = 'Profil speichern';
    }
});

const clubSelectionDialog = document.getElementById('club-selection-dialog');
const hasClubBtn = document.getElementById('has-club-btn');
const noClubBtn = document.getElementById('no-club-btn');
const clubDropdownContainer = document.getElementById('club-dropdown-container');
const clubSelect = document.getElementById('club-select');
const requestClubBtn = document.getElementById('request-club-btn');
const backToChoiceBtn = document.getElementById('back-to-choice-btn');
const clubErrorMessage = document.getElementById('club-error-message');

function showClubSelectionDialog() {
    onboardingForm.parentElement.classList.add('hidden');
    clubSelectionDialog.classList.remove('hidden');
}

function hideClubSelectionDialog() {
    clubSelectionDialog.classList.add('hidden');
}

async function loadClubs() {
    try {
        const clubsRef = collection(db, 'clubs');
        const snapshot = await getDocs(clubsRef);

        const clubs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(club => !club.isTestClub);

        clubSelect.innerHTML = '<option value="">-- Verein auswählen --</option>';
        clubs.forEach(club => {
            const option = document.createElement('option');
            option.value = club.id;
            option.textContent = club.name;
            clubSelect.appendChild(option);
        });

        return clubs;
    } catch (error) {
        console.error('Fehler beim Laden der Vereine:', error);
        clubErrorMessage.textContent = 'Fehler beim Laden der Vereine.';
        return [];
    }
}

hasClubBtn.addEventListener('click', async () => {
    hasClubBtn.disabled = true;
    noClubBtn.disabled = true;
    clubErrorMessage.textContent = '';

    await loadClubs();

    hasClubBtn.parentElement.classList.add('hidden');
    clubDropdownContainer.classList.remove('hidden');

    hasClubBtn.disabled = false;
    noClubBtn.disabled = false;
});

noClubBtn.addEventListener('click', () => {
    hideClubSelectionDialog();
    redirectToDashboard(currentUserData.role);
});

clubSelect.addEventListener('change', () => {
    requestClubBtn.disabled = !clubSelect.value;
});

requestClubBtn.addEventListener('click', async () => {
    const selectedClubId = clubSelect.value;
    if (!selectedClubId) return;

    requestClubBtn.disabled = true;
    requestClubBtn.textContent = 'Sende Anfrage...';
    clubErrorMessage.textContent = '';

    try {
        await addDoc(collection(db, 'clubRequests'), {
            playerId: currentUser.uid,
            clubId: selectedClubId,
            status: 'pending',
            playerName: `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim(),
            playerEmail: currentUser.email || '',
            createdAt: Timestamp.now(),
        });

        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            clubRequestStatus: 'pending',
            clubRequestId: selectedClubId,
        });

        alert('Deine Beitrittsanfrage wurde gesendet! Ein Coach muss diese noch genehmigen.');
        hideClubSelectionDialog();
        redirectToDashboard(currentUserData.role);
    } catch (error) {
        console.error('Fehler beim Senden der Anfrage:', error);
        clubErrorMessage.textContent = 'Fehler beim Senden der Anfrage. Bitte versuche es erneut.';
        requestClubBtn.disabled = false;
        requestClubBtn.textContent = 'Beitrittsanfrage senden';
    }
});

backToChoiceBtn.addEventListener('click', () => {
    clubDropdownContainer.classList.add('hidden');
    hasClubBtn.parentElement.classList.remove('hidden');
    clubErrorMessage.textContent = '';
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

    console.log('[ONBOARDING] Onboarding abgeschlossen, Weiterleitung zu:', targetUrl);
    window.location.href = targetUrl;
}
