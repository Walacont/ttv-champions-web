// NEU: Zusätzliche Imports für die Emulatoren
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    connectAuthEmulator,
    verifyBeforeUpdateEmail,
    EmailAuthProvider,
    reauthenticateWithCredential,
    sendEmailVerification,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-analytics.js';
import {
    getFirestore,
    doc,
    getDoc,
    updateDoc,
    connectFirestoreEmulator,
    collection,
    query,
    where,
    getDocs,
    addDoc,
    deleteDoc,
    serverTimestamp,
    onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    connectStorageEmulator,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);
const functions = getFunctions(app, 'europe-west3');

// NEU: Der Emulator-Block
// Verbindet sich nur mit den lokalen Emulatoren, wenn die Seite über localhost läuft (aber NICHT in Capacitor).
const isCapacitorApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
if (!isCapacitorApp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    console.log('Settings.js: Verbinde mit lokalen Firebase Emulatoren...');

    // Auth Emulator
    connectAuthEmulator(auth, 'http://localhost:9099');

    // Firestore Emulator
    connectFirestoreEmulator(db, 'localhost', 8080);

    // Storage Emulator
    connectStorageEmulator(storage, 'localhost', 9199);

    // Functions Emulator
    connectFunctionsEmulator(functions, 'localhost', 5001);
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

// Privacy Settings Elements
const searchableGlobal = document.getElementById('searchable-global');
const searchableClubOnly = document.getElementById('searchable-club-only');
const showInLeaderboards = document.getElementById('show-in-leaderboards');
const savePrivacySettingsBtn = document.getElementById('save-privacy-settings-btn');
const privacyFeedback = document.getElementById('privacy-feedback');
const noClubWarning = document.getElementById('no-club-warning');

let currentUser = null;
let currentUserData = null;
let selectedFile = null;

onAuthStateChanged(auth, async user => {
    if (user) {
        currentUser = user;
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            currentUserData = userDocSnap.data();
            const initials = (currentUserData.firstName?.[0] || '') + (currentUserData.lastName?.[0] || '');
            profileImagePreview.src =
                currentUserData.photoURL || `https://placehold.co/96x96/e2e8f0/64748b?text=${initials}`;
            firstNameInput.value = currentUserData.firstName || '';
            lastNameInput.value = currentUserData.lastName || '';

            // Synchronisiere Email zwischen Firebase Auth und Firestore
            if (user.email !== currentUserData.email) {
                console.log('Email-Adresse hat sich geändert, aktualisiere Firestore...');
                await updateDoc(userDocRef, { email: user.email });
            }

            // Tutorial-Status anzeigen
            updateTutorialStatus(currentUserData);

            // Privacy-Einstellungen laden
            loadPrivacySettings(currentUserData);

            // Vereinsverwaltung initialisieren
            initializeClubManagement();
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
        document
            .getElementById('send-verification-btn')
            ?.addEventListener('click', sendVerificationEmail);
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
        console.error('Fehler beim Senden der Verifizierungs-Email:', error);
        emailVerificationStatus.innerHTML += `
            <p class="text-red-600 text-sm mt-2">Fehler: ${error.message}</p>
        `;
    }
}

photoUpload.addEventListener('change', e => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = event => {
            profileImagePreview.src = event.target.result;
        };
        reader.readAsDataURL(selectedFile);
        savePhotoButton.disabled = false;
        savePhotoButton.classList.remove('opacity-0');
    }
});

uploadPhotoForm.addEventListener('submit', async e => {
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
        console.error('Fehler beim Hochladen des Bildes:', error);
        uploadFeedback.textContent = 'Fehler beim Speichern des Bildes.';
        uploadFeedback.classList.add('text-red-600');
    } finally {
        savePhotoButton.disabled = false;
        savePhotoButton.textContent = 'Speichern';
    }
});

updateNameForm.addEventListener('submit', async e => {
    e.preventDefault();
    const firstName = firstNameInput.value;
    const lastName = lastNameInput.value;
    nameFeedback.textContent = '';

    try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            firstName,
            lastName,
        });
        nameFeedback.textContent = 'Name erfolgreich gespeichert!';
        nameFeedback.className = 'mt-2 text-sm text-green-600'; // Erfolgsmeldung grün machen
    } catch (error) {
        console.error('Fehler beim Speichern des Namens:', error);
        nameFeedback.textContent = 'Fehler beim Speichern des Namens.';
        nameFeedback.className = 'mt-2 text-sm text-red-600';
    }
});

// Email-Änderung mit Re-Authentication
updateEmailForm.addEventListener('submit', async e => {
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
        console.error('Fehler beim Ändern der Email:', error);

        let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.';

        // Spezifische Fehlermeldungen
        if (error.code === 'auth/wrong-password') {
            errorMessage = 'Das eingegebene Passwort ist falsch.';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Diese Email-Adresse wird bereits von einem anderen Account verwendet.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Die eingegebene Email-Adresse ist ungültig.';
        } else if (error.code === 'auth/requires-recent-login') {
            errorMessage =
                'Aus Sicherheitsgründen musst du dich erneut anmelden, bevor du deine Email ändern kannst.';
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

// ===== TUTORIAL FUNCTIONS =====

/**
 * Tutorial-Status anzeigen
 */
function updateTutorialStatus(userData) {
    const role = userData?.role;
    const tutorialSection = document.getElementById('tutorial-section');
    if (!tutorialSection) return;

    tutorialSection.style.display = 'block';

    // Coach Tutorial Status
    const coachTutorialCompleted = userData?.tutorialCompleted?.coach || false;
    const coachBadge = document.getElementById('tutorial-badge-coach');
    const coachButton = document.getElementById('start-coach-tutorial-btn');

    if (coachBadge) {
        if (coachTutorialCompleted) {
            coachBadge.className = 'tutorial-badge tutorial-badge-completed';
            coachBadge.innerHTML = '<i class="fas fa-check mr-1"></i> Abgeschlossen';
        } else {
            coachBadge.className = 'tutorial-badge tutorial-badge-pending';
            coachBadge.textContent = 'Ausstehend';
        }
    }

    if (coachButton) {
        if (role === 'coach' || role === 'admin') {
            coachButton.closest('.bg-gray-50').style.display = 'block';
            if (coachTutorialCompleted) {
                coachButton.innerHTML = '<i class="fas fa-redo mr-2"></i> Tutorial wiederholen';
            } else {
                coachButton.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Tutorial starten';
            }
        } else {
            coachButton.closest('.bg-gray-50').style.display = 'none';
        }
    }

    // Player Tutorial Status
    const playerTutorialCompleted = userData?.tutorialCompleted?.player || false;
    const playerBadge = document.getElementById('tutorial-badge-player');
    const playerButton = document.getElementById('start-player-tutorial-btn');

    if (playerBadge) {
        if (playerTutorialCompleted) {
            playerBadge.className = 'tutorial-badge tutorial-badge-completed';
            playerBadge.innerHTML = '<i class="fas fa-check mr-1"></i> Abgeschlossen';
        } else {
            playerBadge.className = 'tutorial-badge tutorial-badge-pending';
            playerBadge.textContent = 'Ausstehend';
        }
    }

    if (playerButton) {
        if (role === 'player' || role === 'admin') {
            playerButton.closest('.bg-gray-50').style.display = 'block';
            if (playerTutorialCompleted) {
                playerButton.innerHTML = '<i class="fas fa-redo mr-2"></i> Tutorial wiederholen';
            } else {
                playerButton.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Tutorial starten';
            }
        } else {
            playerButton.closest('.bg-gray-50').style.display = 'none';
        }
    }
}

/**
 * Coach-Tutorial starten
 */
document.getElementById('start-coach-tutorial-btn')?.addEventListener('click', () => {
    // Zur Coach-Seite navigieren und Tutorial starten
    if (window.location.pathname.includes('coach.html')) {
        // Bereits auf der Coach-Seite
        if (typeof window.startCoachTutorial === 'function') {
            window.startCoachTutorial();
        }
    } else {
        // Zur Coach-Seite navigieren und Tutorial-Flag setzen
        sessionStorage.setItem('startTutorial', 'coach');
        window.location.href = '/coach.html';
    }
});

/**
 * Player-Tutorial starten
 */
document.getElementById('start-player-tutorial-btn')?.addEventListener('click', () => {
    // Zur Dashboard-Seite navigieren und Tutorial starten
    if (window.location.pathname.includes('dashboard.html')) {
        // Bereits auf der Dashboard-Seite
        if (typeof window.startPlayerTutorial === 'function') {
            window.startPlayerTutorial();
        }
    } else {
        // Zur Dashboard-Seite navigieren und Tutorial-Flag setzen
        sessionStorage.setItem('startTutorial', 'player');
        window.location.href = '/dashboard.html';
    }
});

/**
 * ===============================================
 * GDPR DATA EXPORT & ACCOUNT DELETION
 * ===============================================
 */

/**
 * Export all user data as JSON file (GDPR Art. 20)
 */
document.getElementById('export-data-btn')?.addEventListener('click', async () => {
    const exportBtn = document.getElementById('export-data-btn');
    const feedbackEl = document.getElementById('export-feedback');

    if (!currentUser) {
        feedbackEl.textContent = 'Fehler: Nicht angemeldet';
        feedbackEl.className = 'text-sm mt-2 text-red-600';
        return;
    }

    try {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Exportiere Daten...';
        feedbackEl.textContent = '';

        // Get user data
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : {};

        // Get all matches (singles)
        const matchesQuery = query(
            collection(db, 'matches'),
            where('playerIds', 'array-contains', currentUser.uid)
        );
        const matchesSnapshot = await getDocs(matchesQuery);
        const matches = [];
        matchesSnapshot.forEach(doc => {
            matches.push({ id: doc.id, ...doc.data() });
        });

        // Get all doubles matches (requires clubId filter for security rules)
        const doublesMatches = [];
        if (userData.clubId) {
            const doublesQuery = query(
                collection(db, 'doublesMatches'),
                where('clubId', '==', userData.clubId),
                where('playerIds', 'array-contains', currentUser.uid)
            );
            const doublesSnapshot = await getDocs(doublesQuery);
            doublesSnapshot.forEach(doc => {
                doublesMatches.push({ id: doc.id, ...doc.data() });
            });
        }

        // Get attendance records (role-aware)
        let attendance = [];
        if (userData.role === 'player') {
            // Players: query by their presence in attendance
            const attendanceQuery = query(
                collection(db, 'attendance'),
                where('presentPlayerIds', 'array-contains', currentUser.uid)
            );
            const attendanceSnapshot = await getDocs(attendanceQuery);
            attendanceSnapshot.forEach(doc => {
                attendance.push({ id: doc.id, ...doc.data() });
            });
        } else if (userData.role === 'coach' && userData.clubId) {
            // Coaches: query by club (they can see all club attendance)
            const attendanceQuery = query(
                collection(db, 'attendance'),
                where('clubId', '==', userData.clubId)
            );
            const attendanceSnapshot = await getDocs(attendanceQuery);
            attendanceSnapshot.forEach(doc => {
                attendance.push({ id: doc.id, ...doc.data() });
            });
        }

        // Compile all data
        const exportData = {
            exportDate: new Date().toISOString(),
            profile: {
                userId: currentUser.uid,
                email: currentUser.email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                birthdate: userData.birthdate,
                gender: userData.gender,
                photoURL: userData.photoURL,
                eloRating: userData.eloRating,
                xp: userData.xp,
                rankName: userData.rankName,
                clubId: userData.clubId,
                role: userData.role,
                createdAt: userData.createdAt,
            },
            statistics: {
                totalMatches: matches.length + doublesMatches.length,
                singlesMatches: matches.length,
                doublesMatches: doublesMatches.length,
                trainingAttendance: attendance.length,
            },
            matches: matches,
            doublesMatches: doublesMatches,
            attendance: attendance,
        };

        // Create and download JSON file
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sc-champions-datenexport-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);

        feedbackEl.textContent = '✓ Daten erfolgreich heruntergeladen';
        feedbackEl.className = 'text-sm mt-2 text-green-600';
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="fas fa-file-download mr-2"></i>Daten herunterladen';
    } catch (error) {
        console.error('Error exporting data:', error);
        feedbackEl.textContent = `Fehler beim Export: ${error.message}`;
        feedbackEl.className = 'text-sm mt-2 text-red-600';
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="fas fa-file-download mr-2"></i>Daten herunterladen';
    }
});

/**
 * Delete account with anonymization
 */
document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
    if (!currentUser) {
        alert('Fehler: Nicht angemeldet');
        return;
    }

    // Show confirmation dialog
    const confirmed = confirm(
        '⚠️ WARNUNG: Account-Löschung\n\n' +
        'Bist du sicher, dass du deinen Account löschen möchtest?\n\n' +
        'Was passiert:\n' +
        '• Dein Account wird deaktiviert\n' +
        '• Persönliche Daten werden gelöscht\n' +
        '• Dein Name wird durch "Gelöschter Nutzer" ersetzt\n' +
        '• Match-Historie bleibt anonymisiert erhalten\n' +
        '• Diese Aktion kann NICHT rückgängig gemacht werden!\n\n' +
        'Empfehlung: Lade zuerst deine Daten herunter.\n\n' +
        'Fortfahren?'
    );

    if (!confirmed) return;

    // Second confirmation
    const doubleConfirm = prompt(
        'Bitte tippe "LÖSCHEN" ein, um die Account-Löschung zu bestätigen:'
    );

    if (doubleConfirm !== 'LÖSCHEN') {
        alert('Account-Löschung abgebrochen.');
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');

    try {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Lösche Account...';

        // Call Cloud Function to anonymize account
        const anonymizeAccount = httpsCallable(functions, 'anonymizeAccount');
        const result = await anonymizeAccount({ userId: currentUser.uid });

        if (result.data.success) {
            alert(
                'Dein Account wurde erfolgreich anonymisiert.\n\n' +
                'Du wirst jetzt abgemeldet.'
            );

            // Sign out user
            await auth.signOut();
            window.location.href = '/index.html';
        } else {
            throw new Error(result.data.message || 'Unbekannter Fehler');
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        alert(`Fehler beim Löschen des Accounts: ${error.message}`);
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt mr-2"></i>Account unwiderruflich löschen';
    }
});

/**
 * ===============================================
 * PRIVACY SETTINGS
 * ===============================================
 */

/**
 * Load privacy settings from user data
 */
function loadPrivacySettings(userData) {
    if (!userData) return;

    // Load searchable setting (default: 'global')
    const searchable = userData.privacySettings?.searchable || 'global';
    if (searchable === 'global') {
        searchableGlobal.checked = true;
    } else {
        searchableClubOnly.checked = true;
    }

    // Load showInLeaderboards setting (default: true)
    const showInLeaderboardsSetting = userData.privacySettings?.showInLeaderboards !== false;
    showInLeaderboards.checked = showInLeaderboardsSetting;

    // Show warning if user has no club and selects club_only
    updateNoClubWarning(userData.clubId);

    // Add listeners to radio buttons to show/hide warning
    searchableGlobal.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableClubOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
}

/**
 * Show/hide warning if user has no club
 */
function updateNoClubWarning(clubId) {
    if (!clubId && searchableClubOnly.checked) {
        noClubWarning.classList.remove('hidden');
    } else {
        noClubWarning.classList.add('hidden');
    }
}

/**
 * Save privacy settings
 */
savePrivacySettingsBtn?.addEventListener('click', async () => {
    if (!currentUser || !currentUserData) {
        privacyFeedback.textContent = 'Fehler: Nicht angemeldet';
        privacyFeedback.className = 'text-sm mt-2 text-red-600';
        return;
    }

    try {
        savePrivacySettingsBtn.disabled = true;
        savePrivacySettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Speichere...';
        privacyFeedback.textContent = '';

        // Get selected values
        const searchable = searchableGlobal.checked ? 'global' : 'club_only';
        const showInLeaderboardsValue = showInLeaderboards.checked;

        // Update Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
            'privacySettings.searchable': searchable,
            'privacySettings.showInLeaderboards': showInLeaderboardsValue,
        });

        // Update local data
        if (!currentUserData.privacySettings) {
            currentUserData.privacySettings = {};
        }
        currentUserData.privacySettings.searchable = searchable;
        currentUserData.privacySettings.showInLeaderboards = showInLeaderboardsValue;

        privacyFeedback.textContent = '✓ Einstellungen erfolgreich gespeichert';
        privacyFeedback.className = 'text-sm mt-2 text-green-600';

        savePrivacySettingsBtn.disabled = false;
        savePrivacySettingsBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Einstellungen speichern';
    } catch (error) {
        console.error('Error saving privacy settings:', error);
        privacyFeedback.textContent = `Fehler beim Speichern: ${error.message}`;
        privacyFeedback.className = 'text-sm mt-2 text-red-600';

        savePrivacySettingsBtn.disabled = false;
        savePrivacySettingsBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Einstellungen speichern';
    }
});

/**
 * ===============================================
 * CLUB MANAGEMENT
 * ===============================================
 */

// Get DOM elements
const currentClubStatus = document.getElementById('current-club-status');
const pendingRequestStatus = document.getElementById('pending-request-status');
const clubSearchSection = document.getElementById('club-search-section');
const clubSearchInput = document.getElementById('club-search-input');
const clubSearchBtn = document.getElementById('club-search-btn');
const clubSearchResults = document.getElementById('club-search-results');
const leaveClubSection = document.getElementById('leave-club-section');
const leaveClubBtn = document.getElementById('leave-club-btn');
const clubManagementFeedback = document.getElementById('club-management-feedback');

let clubRequestsUnsubscribe = null;
let leaveRequestsUnsubscribe = null;

/**
 * Initialize club management UI
 */
async function initializeClubManagement() {
    if (!currentUser || !currentUserData) return;

    // Listen for club requests
    listenToClubRequests();

    // Listen for leave requests
    listenToLeaveRequests();

    // Update UI based on current state
    await updateClubManagementUI();
}

/**
 * Show rejection notification and delete the rejected request
 */
async function showRejectionNotification(type, requestDoc) {
    const requestData = requestDoc.data();

    // Load club name
    let clubName = requestData.clubId;
    try {
        const clubDoc = await getDoc(doc(db, 'clubs', requestData.clubId));
        if (clubDoc.exists()) {
            clubName = clubDoc.data().name || clubName;
        }
    } catch (error) {
        console.error('Error loading club name:', error);
    }

    const messageType = type === 'join' ? 'Beitrittsanfrage' : 'Austrittsanfrage';
    const message = `Deine ${messageType} an "${clubName}" wurde leider abgelehnt.`;

    // Show notification in the feedback area
    clubManagementFeedback.innerHTML = `
        <div class="bg-red-50 border border-red-300 p-3 rounded-lg">
            <div class="flex items-start justify-between">
                <div class="flex-1">
                    <p class="text-sm text-red-800">
                        <i class="fas fa-times-circle mr-2"></i>
                        <strong>${message}</strong>
                    </p>
                    <p class="text-xs text-red-600 mt-1">
                        Du kannst eine neue Anfrage senden, wenn du möchtest.
                    </p>
                </div>
                <button
                    onclick="this.closest('.bg-red-50').remove()"
                    class="text-red-600 hover:text-red-800 ml-2"
                    title="Schließen"
                >
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;

    // Delete the rejected request after showing notification
    try {
        const collectionName = type === 'join' ? 'clubRequests' : 'leaveClubRequests';
        await deleteDoc(doc(db, collectionName, requestDoc.id));
    } catch (error) {
        console.error('Error deleting rejected request:', error);
    }
}

/**
 * Listen to club join requests in real-time
 */
function listenToClubRequests() {
    if (clubRequestsUnsubscribe) {
        clubRequestsUnsubscribe();
    }

    const q = query(
        collection(db, 'clubRequests'),
        where('playerId', '==', currentUser.uid)
    );

    clubRequestsUnsubscribe = onSnapshot(q, async snapshot => {
        // Check for rejected requests and show notification
        const rejectedRequests = snapshot.docs.filter(doc => doc.data().status === 'rejected');
        if (rejectedRequests.length > 0) {
            for (const doc of rejectedRequests) {
                await showRejectionNotification('join', doc);
            }
        }
        await updateClubManagementUI();
    });
}

/**
 * Listen to club leave requests in real-time
 */
function listenToLeaveRequests() {
    if (leaveRequestsUnsubscribe) {
        leaveRequestsUnsubscribe();
    }

    const q = query(
        collection(db, 'leaveClubRequests'),
        where('playerId', '==', currentUser.uid)
    );

    leaveRequestsUnsubscribe = onSnapshot(q, async snapshot => {
        // Check for rejected requests and show notification
        const rejectedRequests = snapshot.docs.filter(doc => doc.data().status === 'rejected');
        if (rejectedRequests.length > 0) {
            for (const doc of rejectedRequests) {
                await showRejectionNotification('leave', doc);
            }
        }
        await updateClubManagementUI();
    });
}

/**
 * Update club management UI based on user state
 */
async function updateClubManagementUI() {
    if (!currentUser || !currentUserData) return;

    // Refresh user data
    const userDocRef = doc(db, 'users', currentUser.uid);
    const userDocSnap = await getDoc(userDocRef);
    if (userDocSnap.exists()) {
        currentUserData = userDocSnap.data();
    }

    // Check for pending join request
    const joinRequestQuery = query(
        collection(db, 'clubRequests'),
        where('playerId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );
    const joinRequestSnapshot = await getDocs(joinRequestQuery);
    const hasPendingJoinRequest = !joinRequestSnapshot.empty;

    // Check for pending leave request
    const leaveRequestQuery = query(
        collection(db, 'leaveClubRequests'),
        where('playerId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );
    const leaveRequestSnapshot = await getDocs(leaveRequestQuery);
    const hasPendingLeaveRequest = !leaveRequestSnapshot.empty;

    // Update current club status
    if (currentUserData.clubId) {
        // Load club name
        let clubName = currentUserData.clubId;
        try {
            const clubDoc = await getDoc(doc(db, 'clubs', currentUserData.clubId));
            if (clubDoc.exists()) {
                clubName = clubDoc.data().name || clubName;
            }
        } catch (error) {
            console.error('Error loading club name:', error);
        }

        currentClubStatus.innerHTML = `
            <div class="bg-green-50 border border-green-200 p-3 rounded-lg">
                <p class="text-sm text-green-800">
                    <i class="fas fa-check-circle mr-2"></i>
                    <strong>Aktueller Verein:</strong> ${clubName}
                </p>
            </div>
        `;
    } else {
        currentClubStatus.innerHTML = `
            <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                <p class="text-sm text-gray-700">
                    <i class="fas fa-info-circle mr-2"></i>
                    Du bist aktuell keinem Verein zugeordnet.
                </p>
            </div>
        `;
    }

    // Update pending request status
    if (hasPendingJoinRequest) {
        const joinRequestDoc = joinRequestSnapshot.docs[0];
        const joinRequestData = joinRequestDoc.data();

        // Load club name
        let clubName = joinRequestData.clubId;
        try {
            const clubDoc = await getDoc(doc(db, 'clubs', joinRequestData.clubId));
            if (clubDoc.exists()) {
                clubName = clubDoc.data().name || clubName;
            }
        } catch (error) {
            console.error('Error loading club name:', error);
        }

        pendingRequestStatus.innerHTML = `
            <div class="bg-yellow-50 border border-yellow-300 p-3 rounded-lg">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm text-yellow-800 mb-1">
                            <i class="fas fa-clock mr-2"></i>
                            <strong>Ausstehende Beitrittsanfrage</strong>
                        </p>
                        <p class="text-xs text-yellow-700">
                            Verein: <strong>${clubName}</strong>
                        </p>
                    </div>
                    <button
                        class="withdraw-join-request-btn bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1 px-3 rounded transition"
                        data-request-id="${joinRequestDoc.id}"
                    >
                        <i class="fas fa-times mr-1"></i>
                        Zurückziehen
                    </button>
                </div>
            </div>
        `;

        // Add event listener to withdraw button
        document.querySelector('.withdraw-join-request-btn').addEventListener('click', async (e) => {
            const requestId = e.target.closest('button').dataset.requestId;
            await withdrawJoinRequest(requestId);
        });
    } else if (hasPendingLeaveRequest) {
        const leaveRequestDoc = leaveRequestSnapshot.docs[0];
        const leaveRequestData = leaveRequestDoc.data();

        // Load club name
        let clubName = leaveRequestData.clubId;
        try {
            const clubDoc = await getDoc(doc(db, 'clubs', leaveRequestData.clubId));
            if (clubDoc.exists()) {
                clubName = clubDoc.data().name || clubName;
            }
        } catch (error) {
            console.error('Error loading club name:', error);
        }

        pendingRequestStatus.innerHTML = `
            <div class="bg-orange-50 border border-orange-300 p-3 rounded-lg">
                <div class="flex items-start justify-between">
                    <div>
                        <p class="text-sm text-orange-800 mb-1">
                            <i class="fas fa-clock mr-2"></i>
                            <strong>Ausstehende Austrittsanfrage</strong>
                        </p>
                        <p class="text-xs text-orange-700">
                            Verein: <strong>${clubName}</strong>
                        </p>
                    </div>
                    <button
                        class="withdraw-leave-request-btn bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1 px-3 rounded transition"
                        data-request-id="${leaveRequestDoc.id}"
                    >
                        <i class="fas fa-times mr-1"></i>
                        Zurückziehen
                    </button>
                </div>
            </div>
        `;

        // Add event listener to withdraw button
        document.querySelector('.withdraw-leave-request-btn').addEventListener('click', async (e) => {
            const requestId = e.target.closest('button').dataset.requestId;
            await withdrawLeaveRequest(requestId);
        });
    } else {
        pendingRequestStatus.innerHTML = '';
    }

    // Show/hide club search section
    if (!currentUserData.clubId && !hasPendingJoinRequest) {
        clubSearchSection.classList.remove('hidden');
    } else {
        clubSearchSection.classList.add('hidden');
    }

    // Show/hide leave club section
    if (currentUserData.clubId && !hasPendingLeaveRequest) {
        leaveClubSection.classList.remove('hidden');
    } else {
        leaveClubSection.classList.add('hidden');
    }
}

/**
 * Search for clubs
 */
clubSearchBtn?.addEventListener('click', async () => {
    const searchTerm = clubSearchInput.value.trim().toLowerCase();

    if (searchTerm.length < 2) {
        clubSearchResults.innerHTML = `
            <p class="text-sm text-gray-500">
                <i class="fas fa-info-circle mr-1"></i>
                Bitte mindestens 2 Zeichen eingeben.
            </p>
        `;
        return;
    }

    try {
        clubSearchBtn.disabled = true;
        clubSearchBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Suche...';
        clubSearchResults.innerHTML = '<p class="text-sm text-gray-500">Suche...</p>';

        // Get all clubs
        const clubsSnapshot = await getDocs(collection(db, 'clubs'));

        // Filter by search term
        let clubs = clubsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(club => {
                const name = (club.name || club.id).toLowerCase();
                return name.includes(searchTerm) && !club.isTestClub; // Exclude test clubs
            });

        // Count members for each club
        for (const club of clubs) {
            const usersQuery = query(
                collection(db, 'users'),
                where('clubId', '==', club.id),
                where('role', '==', 'player')
            );
            const usersSnapshot = await getDocs(usersQuery);
            club.memberCount = usersSnapshot.size;
        }

        if (clubs.length === 0) {
            clubSearchResults.innerHTML = `
                <p class="text-sm text-gray-500">
                    <i class="fas fa-search mr-1"></i>
                    Keine Vereine gefunden.
                </p>
            `;
        } else {
            clubSearchResults.innerHTML = clubs
                .map(club => `
                    <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium text-gray-900">${club.name || club.id}</p>
                            <p class="text-xs text-gray-600">${club.memberCount || 0} Mitglieder</p>
                        </div>
                        <button
                            class="request-to-join-btn bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1 px-3 rounded transition"
                            data-club-id="${club.id}"
                            data-club-name="${club.name || club.id}"
                        >
                            <i class="fas fa-paper-plane mr-1"></i>
                            Anfrage senden
                        </button>
                    </div>
                `)
                .join('');

            // Add event listeners to all request buttons
            document.querySelectorAll('.request-to-join-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const clubId = e.target.closest('button').dataset.clubId;
                    const clubName = e.target.closest('button').dataset.clubName;
                    await requestToJoinClub(clubId, clubName);
                });
            });
        }

        clubSearchBtn.disabled = false;
        clubSearchBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Suchen';
    } catch (error) {
        console.error('Error searching clubs:', error);
        clubSearchResults.innerHTML = `
            <p class="text-sm text-red-600">
                <i class="fas fa-exclamation-circle mr-1"></i>
                Fehler bei der Suche: ${error.message}
            </p>
        `;
        clubSearchBtn.disabled = false;
        clubSearchBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Suchen';
    }
});

/**
 * Request to join a club
 */
async function requestToJoinClub(clubId, clubName) {
    if (!confirm(`Möchtest du wirklich eine Beitrittsanfrage an "${clubName}" senden?`)) {
        return;
    }

    try {
        clubManagementFeedback.textContent = 'Sende Anfrage...';
        clubManagementFeedback.className = 'text-sm mt-3 text-gray-600';

        // Create club join request
        await addDoc(collection(db, 'clubRequests'), {
            playerId: currentUser.uid,
            playerEmail: currentUser.email,
            playerName: `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUser.email,
            clubId: clubId,
            status: 'pending',
            createdAt: serverTimestamp(),
        });

        clubManagementFeedback.textContent = `✓ Beitrittsanfrage an "${clubName}" gesendet!`;
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        // Clear search
        clubSearchInput.value = '';
        clubSearchResults.innerHTML = '';

        // Update UI
        await updateClubManagementUI();
    } catch (error) {
        console.error('Error requesting to join club:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

/**
 * Request to leave club
 */
leaveClubBtn?.addEventListener('click', async () => {
    if (!currentUserData.clubId) {
        alert('Du bist aktuell keinem Verein zugeordnet.');
        return;
    }

    // Load club name
    let clubName = currentUserData.clubId;
    try {
        const clubDoc = await getDoc(doc(db, 'clubs', currentUserData.clubId));
        if (clubDoc.exists()) {
            clubName = clubDoc.data().name || clubName;
        }
    } catch (error) {
        console.error('Error loading club name:', error);
    }

    if (!confirm(`Möchtest du wirklich eine Austrittsanfrage für "${clubName}" senden?`)) {
        return;
    }

    try {
        leaveClubBtn.disabled = true;
        leaveClubBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sende Anfrage...';
        clubManagementFeedback.textContent = '';

        // Create leave club request
        await addDoc(collection(db, 'leaveClubRequests'), {
            playerId: currentUser.uid,
            playerEmail: currentUser.email,
            playerName: `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUser.email,
            clubId: currentUserData.clubId,
            status: 'pending',
            createdAt: serverTimestamp(),
        });

        clubManagementFeedback.textContent = `✓ Austrittsanfrage gesendet!`;
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        // Update UI
        await updateClubManagementUI();

        leaveClubBtn.disabled = false;
        leaveClubBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Austrittsanfrage senden';
    } catch (error) {
        console.error('Error requesting to leave club:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';

        leaveClubBtn.disabled = false;
        leaveClubBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Austrittsanfrage senden';
    }
});

/**
 * Withdraw join request
 */
async function withdrawJoinRequest(requestId) {
    if (!confirm('Möchtest du deine Beitrittsanfrage wirklich zurückziehen?')) {
        return;
    }

    try {
        clubManagementFeedback.textContent = 'Ziehe Anfrage zurück...';
        clubManagementFeedback.className = 'text-sm mt-3 text-gray-600';

        await deleteDoc(doc(db, 'clubRequests', requestId));

        clubManagementFeedback.textContent = '✓ Beitrittsanfrage zurückgezogen';
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error withdrawing join request:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

/**
 * Withdraw leave request
 */
async function withdrawLeaveRequest(requestId) {
    if (!confirm('Möchtest du deine Austrittsanfrage wirklich zurückziehen?')) {
        return;
    }

    try {
        clubManagementFeedback.textContent = 'Ziehe Anfrage zurück...';
        clubManagementFeedback.className = 'text-sm mt-3 text-gray-600';

        await deleteDoc(doc(db, 'leaveClubRequests', requestId));

        clubManagementFeedback.textContent = '✓ Austrittsanfrage zurückgezogen';
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error withdrawing leave request:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}
