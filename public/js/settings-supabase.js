// Settings Page - Supabase Version
// 1:1 Migration von settings.js - Firebase → Supabase

import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { reloadSportContext } from './sport-context-supabase.js';

const supabase = getSupabase();

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

// Sport Selection Elements
const sportDropdown = document.getElementById('sport-dropdown');
const sportFeedback = document.getElementById('sport-feedback');
const sportClubStatus = document.getElementById('sport-club-status');
const sportClubInfo = document.getElementById('sport-club-info');
const sportClubSearch = document.getElementById('sport-club-search');
const sportClubList = document.getElementById('sport-club-list');
const sportClubFeedback = document.getElementById('sport-club-feedback');

let currentUser = null;
let currentUserData = null;
let selectedFile = null;

// Check auth state on load
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        // Get user profile from Supabase
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (!error && profile) {
            // Map Supabase profile to expected format
            currentUserData = {
                id: currentUser.id,
                email: profile.email || currentUser.email,
                firstName: profile.first_name || '',
                lastName: profile.last_name || '',
                displayName: profile.display_name || '',
                role: profile.role || 'player',
                clubId: profile.club_id || null,
                xp: profile.xp || 0,
                points: profile.points || 0,
                eloRating: profile.elo_rating || 1000,
                highestElo: profile.highest_elo || 1000,
                gender: profile.gender || null,
                birthdate: profile.birthdate || null,
                photoURL: profile.avatar_url || null,
                onboardingComplete: profile.onboarding_complete || false,
                tutorialCompleted: profile.tutorial_completed || {},
                privacySettings: profile.privacy_settings || {},
                activeSportId: profile.active_sport_id || null,
            };

            const initials = (currentUserData.firstName?.[0] || '') + (currentUserData.lastName?.[0] || '');
            profileImagePreview.src =
                currentUserData.photoURL || `https://placehold.co/96x96/e2e8f0/64748b?text=${initials}`;
            firstNameInput.value = currentUserData.firstName || '';
            lastNameInput.value = currentUserData.lastName || '';

            // Synchronisiere Email zwischen Supabase Auth und profiles
            if (currentUser.email !== currentUserData.email) {
                console.log('Email-Adresse hat sich geändert, aktualisiere profiles...');
                await supabase
                    .from('profiles')
                    .update({ email: currentUser.email })
                    .eq('id', currentUser.id);
            }

            // Tutorial-Status anzeigen
            updateTutorialStatus(currentUserData);

            // Privacy-Einstellungen laden
            loadPrivacySettings(currentUserData);

            // Vereinsverwaltung initialisieren
            initializeClubManagement();

            // Sport-Auswahl initialisieren
            initializeSportSelection();
        }

        // Email-Adresse anzeigen und Verifizierungs-Status
        currentEmailDisplay.textContent = currentUser.email || 'Keine Email hinterlegt';
        // Supabase handles email verification differently
        updateEmailVerificationStatus(currentUser.email_confirmed_at != null);

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Initialize on DOMContentLoaded or immediately if already loaded (for SPA navigation)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    // Document is already loaded (SPA navigation), initialize immediately
    initializeAuth();
}

// Listen for auth state changes
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
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
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: currentUser.email
        });

        if (error) throw error;

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
        // Upload to Supabase Storage
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${currentUser.id}/profile.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-pictures')
            .upload(fileName, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('profile-pictures')
            .getPublicUrl(fileName);

        const photoURL = urlData.publicUrl;

        // Update profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ avatar_url: photoURL })
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

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
        const { error } = await supabase
            .from('profiles')
            .update({
                first_name: firstName,
                last_name: lastName,
            })
            .eq('id', currentUser.id);

        if (error) throw error;

        nameFeedback.textContent = 'Name erfolgreich gespeichert!';
        nameFeedback.className = 'mt-2 text-sm text-green-600';
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
        // Schritt 1: Re-Authentication (verify current password)
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: password
        });

        if (signInError) throw signInError;

        // Schritt 2: Update email (Supabase sends verification automatically)
        const { error: updateError } = await supabase.auth.updateUser({
            email: newEmail
        });

        if (updateError) throw updateError;

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
        if (error.message?.includes('Invalid login credentials')) {
            errorMessage = 'Das eingegebene Passwort ist falsch.';
        } else if (error.message?.includes('already registered')) {
            errorMessage = 'Diese Email-Adresse wird bereits von einem anderen Account verwendet.';
        } else if (error.message?.includes('invalid')) {
            errorMessage = 'Die eingegebene Email-Adresse ist ungültig.';
        } else if (error.message) {
            errorMessage = error.message;
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

        // Get user data from profiles
        const { data: userData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (profileError) throw profileError;

        // Get all matches (singles)
        const { data: matches, error: matchesError } = await supabase
            .from('matches')
            .select('*')
            .contains('player_ids', [currentUser.id]);

        if (matchesError) console.error('Error fetching matches:', matchesError);

        // Get all doubles matches
        let doublesMatches = [];
        if (userData?.club_id) {
            const { data: doublesData, error: doublesError } = await supabase
                .from('doubles_matches')
                .select('*')
                .eq('club_id', userData.club_id)
                .contains('player_ids', [currentUser.id]);

            if (!doublesError) doublesMatches = doublesData || [];
        }

        // Get attendance records
        let attendance = [];
        if (userData?.role === 'player') {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .contains('present_player_ids', [currentUser.id]);

            if (!attendanceError) attendance = attendanceData || [];
        } else if (userData?.role === 'coach' && userData?.club_id) {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .eq('club_id', userData.club_id);

            if (!attendanceError) attendance = attendanceData || [];
        }

        // Compile all data
        const exportData = {
            exportDate: new Date().toISOString(),
            profile: {
                userId: currentUser.id,
                email: currentUser.email,
                firstName: userData?.first_name,
                lastName: userData?.last_name,
                birthdate: userData?.birthdate,
                gender: userData?.gender,
                photoURL: userData?.avatar_url,
                eloRating: userData?.elo_rating,
                xp: userData?.xp,
                rankName: userData?.rank_name,
                clubId: userData?.club_id,
                role: userData?.role,
                createdAt: userData?.created_at,
            },
            statistics: {
                totalMatches: (matches?.length || 0) + doublesMatches.length,
                singlesMatches: matches?.length || 0,
                doublesMatches: doublesMatches.length,
                trainingAttendance: attendance.length,
            },
            matches: matches || [],
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

        // Call Supabase RPC function to anonymize account
        const { data, error } = await supabase.rpc('anonymize_account', {
            p_user_id: currentUser.id
        });

        if (error) throw error;

        alert(
            'Dein Account wurde erfolgreich anonymisiert.\n\n' +
            'Du wirst jetzt abgemeldet.'
        );

        // Sign out user
        await supabase.auth.signOut();
        window.location.href = '/index.html';
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

        // Update Supabase profiles table
        const newPrivacySettings = {
            ...currentUserData.privacySettings,
            searchable: searchable,
            showInLeaderboards: showInLeaderboardsValue,
        };

        console.log('[Privacy Settings] Saving privacy settings:', JSON.stringify(newPrivacySettings));

        const { error } = await supabase
            .from('profiles')
            .update({ privacy_settings: newPrivacySettings })
            .eq('id', currentUser.id);

        if (error) throw error;

        console.log('[Privacy Settings] Saved successfully!');

        // Update local data
        currentUserData.privacySettings = newPrivacySettings;

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

let clubRequestsSubscription = null;
let leaveRequestsSubscription = null;

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
async function showRejectionNotification(type, requestData) {
    // Load club name
    let clubName = requestData.club_id;
    try {
        const { data: clubData } = await supabase
            .from('clubs')
            .select('name')
            .eq('id', requestData.club_id)
            .single();

        if (clubData) {
            clubName = clubData.name || clubName;
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
        const tableName = type === 'join' ? 'club_requests' : 'leave_club_requests';
        await supabase.from(tableName).delete().eq('id', requestData.id);
    } catch (error) {
        console.error('Error deleting rejected request:', error);
    }
}

/**
 * Listen to club join requests in real-time
 */
function listenToClubRequests() {
    if (clubRequestsSubscription) {
        clubRequestsSubscription.unsubscribe();
    }

    clubRequestsSubscription = supabase
        .channel('club-requests-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'club_requests',
            filter: `player_id=eq.${currentUser.id}`
        }, async (payload) => {
            // Check for rejected requests
            if (payload.new?.status === 'rejected') {
                await showRejectionNotification('join', payload.new);
            }
            await updateClubManagementUI();
        })
        .subscribe();
}

/**
 * Listen to club leave requests in real-time
 */
function listenToLeaveRequests() {
    if (leaveRequestsSubscription) {
        leaveRequestsSubscription.unsubscribe();
    }

    leaveRequestsSubscription = supabase
        .channel('leave-requests-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'leave_club_requests',
            filter: `player_id=eq.${currentUser.id}`
        }, async (payload) => {
            // Check for rejected requests
            if (payload.new?.status === 'rejected') {
                await showRejectionNotification('leave', payload.new);
            }
            await updateClubManagementUI();
        })
        .subscribe();
}

/**
 * Update club management UI based on user state
 */
async function updateClubManagementUI() {
    if (!currentUser || !currentUserData) return;

    // Refresh user data
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        currentUserData.clubId = profile.club_id;
    }

    // Check for pending join request
    const { data: joinRequests } = await supabase
        .from('club_requests')
        .select('*')
        .eq('player_id', currentUser.id)
        .eq('status', 'pending');

    const hasPendingJoinRequest = joinRequests && joinRequests.length > 0;

    // Check for pending leave request
    const { data: leaveRequests } = await supabase
        .from('leave_club_requests')
        .select('*')
        .eq('player_id', currentUser.id)
        .eq('status', 'pending');

    const hasPendingLeaveRequest = leaveRequests && leaveRequests.length > 0;

    // Update current club status
    if (currentUserData.clubId) {
        // Load club name
        let clubName = currentUserData.clubId;
        try {
            const { data: clubData } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', currentUserData.clubId)
                .single();

            if (clubData) {
                clubName = clubData.name || clubName;
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
        const joinRequestData = joinRequests[0];

        // Load club name
        let clubName = joinRequestData.club_id;
        try {
            const { data: clubData } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', joinRequestData.club_id)
                .single();

            if (clubData) {
                clubName = clubData.name || clubName;
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
                        data-request-id="${joinRequestData.id}"
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
        const leaveRequestData = leaveRequests[0];

        // Load club name
        let clubName = leaveRequestData.club_id;
        try {
            const { data: clubData } = await supabase
                .from('clubs')
                .select('name')
                .eq('id', leaveRequestData.club_id)
                .single();

            if (clubData) {
                clubName = clubData.name || clubName;
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
                        data-request-id="${leaveRequestData.id}"
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

        // Get all clubs matching search term
        const { data: clubsData, error } = await supabase
            .from('clubs')
            .select('*')
            .ilike('name', `%${searchTerm}%`)
            .eq('is_test_club', false);

        if (error) throw error;

        let clubs = clubsData || [];

        // Count members for each club (including offline players and coaches)
        for (const club of clubs) {
            const { count } = await supabase
                .from('profiles')
                .select('*', { count: 'exact', head: true })
                .eq('club_id', club.id)
                .or('role.eq.player,role.eq.coach,is_offline.eq.true');

            club.memberCount = count || 0;
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
        const { error } = await supabase.from('club_requests').insert({
            player_id: currentUser.id,
            club_id: clubId,
            status: 'pending'
        });

        if (error) throw error;

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
        const { data: clubData } = await supabase
            .from('clubs')
            .select('name')
            .eq('id', currentUserData.clubId)
            .single();

        if (clubData) {
            clubName = clubData.name || clubName;
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
        const { error } = await supabase.from('leave_club_requests').insert({
            player_id: currentUser.id,
            club_id: currentUserData.clubId,
            status: 'pending'
        });

        if (error) throw error;

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

        const { error } = await supabase
            .from('club_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

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

        const { error } = await supabase
            .from('leave_club_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        clubManagementFeedback.textContent = '✓ Austrittsanfrage zurückgezogen';
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error withdrawing leave request:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

/**
 * ===============================================
 * SPORT SELECTION (Multi-Sport) - Dropdown Version
 * ===============================================
 */

/**
 * Initialize sport selection dropdown
 * Loads ALL sports from database and shows current active sport
 */
async function initializeSportSelection() {
    if (!currentUser || !sportDropdown) return;

    try {
        // Load all available sports from the sports table
        const { data: allSports, error: sportsError } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (sportsError) throw sportsError;

        // Get user's active sport from profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('active_sport_id')
            .eq('id', currentUser.id)
            .single();

        if (profileError && profileError.code !== 'PGRST116') {
            throw profileError;
        }

        const activeSportId = profile?.active_sport_id;

        // Populate dropdown with all sports (await since it may set initial sport)
        await populateSportDropdown(allSports || [], activeSportId);

        // Add change event listener
        sportDropdown.addEventListener('change', handleSportChange);

        // Show club status for current sport on page load
        if (activeSportId) {
            const activeSport = allSports.find(s => s.id === activeSportId);
            if (activeSport) {
                await updateSportClubStatus(activeSportId, activeSport.display_name || activeSport.name);
            }
        }

    } catch (error) {
        console.error('Error initializing sport selection:', error);
        if (sportFeedback) {
            sportFeedback.innerHTML = `
                <span class="text-red-600">
                    <i class="fas fa-exclamation-circle mr-1"></i>
                    Fehler beim Laden der Sportarten.
                </span>
            `;
        }
    }
}

/**
 * Populate the sport dropdown with options
 */
async function populateSportDropdown(sports, activeSportId) {
    if (!sportDropdown) return;

    // Clear existing options except the placeholder
    sportDropdown.innerHTML = '<option value="" disabled>Sportart wählen...</option>';

    // Sports that are not yet available (coming soon)
    const comingSoonSports = [];

    // Add each sport as an option
    sports.forEach(sport => {
        const option = document.createElement('option');
        option.value = sport.id;

        const isComingSoon = comingSoonSports.includes(sport.name.toLowerCase());

        if (isComingSoon) {
            option.textContent = `${sport.display_name || sport.name} (Bald verfügbar)`;
            option.disabled = true;
            option.style.color = '#9CA3AF'; // Gray color
        } else {
            option.textContent = sport.display_name || sport.name;
        }

        // Mark active sport as selected
        if (sport.id === activeSportId) {
            option.selected = true;
        }

        sportDropdown.appendChild(option);
    });

    // If no active sport is set but sports exist, select the first available (not coming soon) one
    if (!activeSportId && sports.length > 0) {
        const firstAvailableSport = sports.find(s => !comingSoonSports.includes(s.name.toLowerCase()));
        if (firstAvailableSport) {
            sportDropdown.value = firstAvailableSport.id;
            // Automatically set the first available sport as active (without page reload)
            await setActiveSportSilent(firstAvailableSport.id, firstAvailableSport.display_name || firstAvailableSport.name);
        }
    }
}

/**
 * Handle sport dropdown change event
 * Checks if user has stats for this sport, prompts for confirmation if new
 */
async function handleSportChange(event) {
    const selectedSportId = event.target.value;
    const selectedOption = event.target.options[event.target.selectedIndex];
    const selectedSportName = selectedOption.textContent;

    if (!selectedSportId) return;

    // Check if user already has stats for this sport
    const { data: existingStats } = await supabase
        .from('user_sport_stats')
        .select('id, matches_played')
        .eq('user_id', currentUser.id)
        .eq('sport_id', selectedSportId)
        .maybeSingle();

    if (existingStats) {
        // User already has this sport - just switch and show club status
        await setActiveSportAndShowClubStatus(selectedSportId, selectedSportName);
    } else {
        // New sport - ask for confirmation
        const confirmed = confirm(
            `Möchtest du ${selectedSportName} hinzufügen?\n\n` +
            `Du startest mit:\n` +
            `• ELO: 1000\n` +
            `• XP: 0\n` +
            `• Punkte: 0\n\n` +
            `Du erscheinst in der Rangliste nach deinem ersten Spiel.`
        );

        if (confirmed) {
            // Create stats record for new sport
            const { error: createError } = await supabase
                .from('user_sport_stats')
                .insert({
                    user_id: currentUser.id,
                    sport_id: selectedSportId
                });

            if (createError) {
                console.error('Error creating sport stats:', createError);
                // Still allow switching even if insert fails (table might not exist yet)
            }

            await setActiveSportAndShowClubStatus(selectedSportId, selectedSportName);
        } else {
            // User cancelled - revert dropdown to previous value
            sportDropdown.value = currentUserData?.activeSportId || '';
        }
    }
}

/**
 * Set active sport and show club status for that sport
 */
async function setActiveSportAndShowClubStatus(sportId, sportName) {
    console.log('[Settings] Setting active sport:', { sportId, sportName, userId: currentUser.id });

    // Update the active sport in the database
    const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({ active_sport_id: sportId })
        .eq('id', currentUser.id)
        .select();

    console.log('[Settings] Update result:', { updateData, updateError });

    if (updateError) {
        console.error('Error setting active sport:', updateError);
        if (sportFeedback) {
            sportFeedback.innerHTML = `
                <span class="text-red-600">
                    <i class="fas fa-exclamation-circle mr-1"></i>
                    Fehler beim Wechseln der Sportart: ${updateError.message}
                </span>
            `;
        }
        return;
    }

    if (!updateData || updateData.length === 0) {
        console.error('[Settings] No data returned from update - might be RLS issue');
        if (sportFeedback) {
            sportFeedback.innerHTML = `
                <span class="text-red-600">
                    <i class="fas fa-exclamation-circle mr-1"></i>
                    Sportart konnte nicht gespeichert werden (RLS Problem?)
                </span>
            `;
        }
        return;
    }

    console.log('[Settings] Active sport updated successfully');

    // Ensure user has a profile_club_sports entry for this sport
    // This is needed for leaderboards and opponent search to work
    const { data: existingEntry } = await supabase
        .from('profile_club_sports')
        .select('id')
        .eq('user_id', currentUser.id)
        .eq('sport_id', sportId)
        .maybeSingle();

    if (!existingEntry) {
        console.log('[Settings] Creating profile_club_sports entry for sport');
        const { error: insertError } = await supabase
            .from('profile_club_sports')
            .insert({
                user_id: currentUser.id,
                sport_id: sportId,
                club_id: null, // No club yet
                role: 'player'
            });

        if (insertError) {
            console.error('[Settings] Error creating sport entry:', insertError);
        } else {
            console.log('[Settings] Sport entry created successfully');
        }
    }

    // Update local data
    if (currentUserData) {
        currentUserData.activeSportId = sportId;
    }

    // Reload sport context to refresh cache
    console.log('[Settings] Reloading sport context...');
    const newContext = await reloadSportContext(currentUser.id);
    console.log('[Settings] Sport context reloaded:', newContext);

    // Show success message
    if (sportFeedback) {
        sportFeedback.innerHTML = `
            <span class="text-green-600">
                <i class="fas fa-check-circle mr-1"></i>
                ${sportName} ist jetzt aktiv.
            </span>
        `;
    }

    // Show club status for this sport
    await updateSportClubStatus(sportId, sportName);
}

/**
 * Update the club status display for a specific sport
 */
async function updateSportClubStatus(sportId, sportName) {
    if (!sportClubStatus || !sportClubInfo) return;

    // Check if user is in a club for this sport
    const { data: clubMembership } = await supabase
        .from('profile_club_sports')
        .select(`
            club_id,
            role,
            clubs(name)
        `)
        .eq('user_id', currentUser.id)
        .eq('sport_id', sportId)
        .maybeSingle();

    sportClubStatus.classList.remove('hidden');

    if (clubMembership) {
        // User is in a club for this sport
        const clubName = clubMembership.clubs?.name || 'Unbekannt';
        const roleText = clubMembership.role === 'coach' ? 'Spartenleiter' :
                        clubMembership.role === 'head_coach' ? 'Spartenleiter' : 'Spieler';

        sportClubInfo.innerHTML = `
            <div class="bg-green-50 border border-green-200 p-3 rounded-lg">
                <p class="text-sm text-green-800">
                    <i class="fas fa-check-circle mr-2"></i>
                    <strong>Verein für ${sportName}:</strong> ${clubName}
                    <span class="text-green-600 ml-2">(${roleText})</span>
                </p>
            </div>
        `;

        // Hide club search
        if (sportClubSearch) sportClubSearch.classList.add('hidden');
    } else {
        // User is NOT in a club for this sport - check for pending request
        const { data: pendingRequest } = await supabase
            .from('club_requests')
            .select('id, club_id, clubs(name)')
            .eq('player_id', currentUser.id)
            .eq('sport_id', sportId)
            .eq('status', 'pending')
            .maybeSingle();

        if (pendingRequest) {
            // User has a pending request for this sport
            const clubName = pendingRequest.clubs?.name || 'Unbekannt';
            sportClubInfo.innerHTML = `
                <div class="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                    <div class="flex items-start justify-between">
                        <div>
                            <p class="text-sm text-yellow-800">
                                <i class="fas fa-clock mr-2"></i>
                                <strong>Ausstehende Anfrage für ${sportName}:</strong> ${clubName}
                            </p>
                            <p class="text-xs text-yellow-600 mt-1">
                                Warte auf Bestätigung durch einen Spartenleiter.
                            </p>
                        </div>
                        <button
                            onclick="withdrawSportClubRequest('${pendingRequest.id}', '${sportId}', '${sportName}')"
                            class="text-red-600 hover:text-red-800 text-sm ml-2"
                            title="Anfrage zurückziehen"
                        >
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            `;
            if (sportClubSearch) sportClubSearch.classList.add('hidden');
        } else {
            // User is not in a club and has no pending request - show info (club is optional)
            sportClubInfo.innerHTML = `
                <div class="bg-blue-50 border border-blue-200 p-3 rounded-lg">
                    <p class="text-sm text-blue-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        Du bist für <strong>${sportName}</strong> keinem Verein zugeordnet.
                    </p>
                    <p class="text-xs text-blue-600 mt-1">
                        Du kannst die App auch ohne Verein nutzen. Falls du einem Verein beitreten möchtest, findest du unten passende Vereine.
                    </p>
                </div>
            `;

            // Load and show clubs for this sport (optional)
            await loadClubsForSport(sportId, sportName);
        }
    }
}

/**
 * Load clubs that have coaches for a specific sport
 */
async function loadClubsForSport(sportId, sportName) {
    if (!sportClubSearch || !sportClubList) return;

    sportClubSearch.classList.remove('hidden');
    sportClubList.innerHTML = '<p class="text-sm text-gray-500">Lade Vereine...</p>';

    try {
        // Find clubs that have at least one coach for this sport
        const { data: clubsWithSport, error } = await supabase
            .from('profile_club_sports')
            .select(`
                club_id,
                clubs!inner(id, name, is_test_club)
            `)
            .eq('sport_id', sportId)
            .in('role', ['coach', 'head_coach']);

        if (error) throw error;

        // Get unique clubs
        const uniqueClubs = [];
        const seenClubIds = new Set();

        for (const row of clubsWithSport || []) {
            if (!row.clubs || row.clubs.is_test_club) continue;
            if (seenClubIds.has(row.club_id)) continue;
            seenClubIds.add(row.club_id);
            uniqueClubs.push({
                id: row.club_id,
                name: row.clubs.name
            });
        }

        // Sort by name
        uniqueClubs.sort((a, b) => a.name.localeCompare(b.name));

        if (uniqueClubs.length === 0) {
            sportClubList.innerHTML = `
                <p class="text-sm text-gray-500">
                    <i class="fas fa-info-circle mr-1"></i>
                    Aktuell gibt es keine Vereine mit Spartenleiter für ${sportName}.
                </p>
            `;
            return;
        }

        // Get member counts for each club
        const clubHtml = [];
        for (const club of uniqueClubs) {
            const { count: memberCount } = await supabase
                .from('profile_club_sports')
                .select('*', { count: 'exact', head: true })
                .eq('club_id', club.id)
                .eq('sport_id', sportId);

            clubHtml.push(`
                <div class="bg-gray-50 border border-gray-200 p-3 rounded-lg flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-gray-900">${club.name}</p>
                        <p class="text-xs text-gray-600">${memberCount || 0} Mitglieder in ${sportName}</p>
                    </div>
                    <button
                        onclick="sendSportClubRequest('${club.id}', '${club.name}', '${sportId}', '${sportName}')"
                        class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-1 px-3 rounded transition"
                    >
                        <i class="fas fa-paper-plane mr-1"></i>
                        Anfrage
                    </button>
                </div>
            `);
        }

        sportClubList.innerHTML = clubHtml.join('');

    } catch (error) {
        console.error('Error loading clubs for sport:', error);
        sportClubList.innerHTML = `
            <p class="text-sm text-red-600">
                <i class="fas fa-exclamation-circle mr-1"></i>
                Fehler beim Laden der Vereine.
            </p>
        `;
    }
}

/**
 * Send a club request for a specific sport
 */
window.sendSportClubRequest = async function(clubId, clubName, sportId, sportName) {
    if (!confirm(`Möchtest du eine Beitrittsanfrage an "${clubName}" für ${sportName} senden?`)) {
        return;
    }

    try {
        if (sportClubFeedback) {
            sportClubFeedback.innerHTML = `
                <span class="text-gray-600">
                    <i class="fas fa-spinner fa-spin mr-1"></i>
                    Sende Anfrage...
                </span>
            `;
        }

        // Create club request with sport_id
        const { error } = await supabase.from('club_requests').insert({
            player_id: currentUser.id,
            club_id: clubId,
            sport_id: sportId,
            status: 'pending'
        });

        if (error) throw error;

        if (sportClubFeedback) {
            sportClubFeedback.innerHTML = `
                <span class="text-green-600">
                    <i class="fas fa-check-circle mr-1"></i>
                    Anfrage an "${clubName}" gesendet!
                </span>
            `;
        }

        // Refresh the club status display
        await updateSportClubStatus(sportId, sportName);

    } catch (error) {
        console.error('Error sending club request:', error);
        if (sportClubFeedback) {
            sportClubFeedback.innerHTML = `
                <span class="text-red-600">
                    <i class="fas fa-exclamation-circle mr-1"></i>
                    Fehler: ${error.message}
                </span>
            `;
        }
    }
};

/**
 * Withdraw a pending club request for a sport
 */
window.withdrawSportClubRequest = async function(requestId, sportId, sportName) {
    if (!confirm('Möchtest du deine Beitrittsanfrage wirklich zurückziehen?')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('club_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        // Refresh the club status display
        await updateSportClubStatus(sportId, sportName);

    } catch (error) {
        console.error('Error withdrawing club request:', error);
        alert('Fehler beim Zurückziehen der Anfrage: ' + error.message);
    }
};

/**
 * Set active sport silently (without page reload)
 * Used during initialization when no sport is set yet
 */
async function setActiveSportSilent(sportId, sportName) {
    if (!currentUser || !sportId) return;

    try {
        console.log('[Settings] Setting initial active sport:', sportId);

        // Update profile directly
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ active_sport_id: sportId })
            .eq('id', currentUser.id);

        if (updateError) {
            console.error('Error setting initial active sport:', updateError);
            return;
        }

        // Update local data
        if (currentUserData) {
            currentUserData.activeSportId = sportId;
        }

        console.log('[Settings] Initial active sport set to:', sportName);

        // Show feedback without reload
        if (sportFeedback) {
            sportFeedback.innerHTML = `
                <span class="text-green-600">
                    <i class="fas fa-check-circle mr-1"></i>
                    ${sportName} ist jetzt aktiv.
                </span>
            `;
        }
    } catch (error) {
        console.error('Error setting initial active sport:', error);
    }
}

