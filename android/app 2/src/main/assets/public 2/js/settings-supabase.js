// Settings Page - Supabase Version
// 1:1 Migration von settings.js - Firebase → Supabase

import { getSupabase, onAuthStateChange } from './supabase-init.js';

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
const searchableFriendsOnly = document.getElementById('searchable-friends-only');
const searchableNone = document.getElementById('searchable-none');
const showInLeaderboards = document.getElementById('show-in-leaderboards');
const savePrivacySettingsBtn = document.getElementById('save-privacy-settings-btn');
const privacyFeedback = document.getElementById('privacy-feedback');
const noClubWarning = document.getElementById('no-club-warning');

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
            // Map Supabase profile to expected format (single sport model)
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
                eloRating: profile.elo_rating || 800,
                highestElo: profile.highest_elo || 800,
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

// Setup logout button
const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            logoutButton.disabled = true;
            logoutButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Abmelden...';

            // Clear SPA cache to prevent back-button access to authenticated pages
            if (window.spaEnhancer) {
                window.spaEnhancer.clearCache();
            }

            await supabase.auth.signOut();
            // Use replace() to clear history and prevent back navigation
            window.location.replace('/index.html');
        } catch (error) {
            console.error('Logout error:', error);
            // If session is already missing, just redirect to login
            if (error.message?.includes('Auth session missing') || error.message?.includes('session_not_found')) {
                window.location.replace('/index.html');
                return;
            }
            logoutButton.disabled = false;
            logoutButton.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Abmelden';
        }
    });
}

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
        if (role === 'coach' || role === 'head_coach' || role === 'admin') {
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
        } else if ((userData?.role === 'coach' || userData?.role === 'head_coach') && userData?.club_id) {
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
    } else if (searchable === 'club_only') {
        searchableClubOnly.checked = true;
    } else if (searchable === 'friends_only') {
        searchableFriendsOnly.checked = true;
    } else if (searchable === 'none') {
        searchableNone.checked = true;
    } else {
        // Fallback for old boolean values
        searchableGlobal.checked = true;
    }

    // Load showInLeaderboards setting (default: true)
    const showInLeaderboardsSetting = userData.privacySettings?.showInLeaderboards !== false;
    showInLeaderboards.checked = showInLeaderboardsSetting;

    // Show warning if user has no club and selects club_only
    updateNoClubWarning(userData.clubId);

    // Add listeners to radio buttons to show/hide warning
    searchableGlobal.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableClubOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableFriendsOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableNone.addEventListener('change', () => updateNoClubWarning(userData.clubId));
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
        let searchable = 'global'; // default
        if (searchableGlobal.checked) {
            searchable = 'global';
        } else if (searchableClubOnly.checked) {
            searchable = 'club_only';
        } else if (searchableFriendsOnly.checked) {
            searchable = 'friends_only';
        } else if (searchableNone.checked) {
            searchable = 'none';
        }
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
        currentUserData.clubId = profile.club_id || null;
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

        // Get user's active sport
        const userSportId = currentUserData.activeSportId;

        // Get all clubs matching search term that support the user's sport
        let clubsData = [];

        if (userSportId) {
            // Find clubs that have the user's sport in club_sports
            const { data: clubSportsData, error: csError } = await supabase
                .from('club_sports')
                .select('club_id')
                .eq('sport_id', userSportId)
                .eq('is_active', true);

            if (csError) throw csError;

            const clubIdsWithSport = (clubSportsData || []).map(cs => cs.club_id);

            if (clubIdsWithSport.length > 0) {
                const { data, error } = await supabase
                    .from('clubs')
                    .select('*')
                    .ilike('name', `%${searchTerm}%`)
                    .eq('is_test_club', false)
                    .in('id', clubIdsWithSport);

                if (error) throw error;
                clubsData = data || [];
            }
        } else {
            // No sport filter - show all clubs (fallback)
            const { data, error } = await supabase
                .from('clubs')
                .select('*')
                .ilike('name', `%${searchTerm}%`)
                .eq('is_test_club', false);

            if (error) throw error;
            clubsData = data || [];
        }

        let clubs = clubsData;

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
                    Keine Vereine mit deiner Sportart gefunden.
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
 * Notify all coaches in a club about a join/leave request
 */
async function notifyClubCoaches(clubId, type, playerName) {
    try {
        // Find all coaches and head_coaches in this club
        const { data: coaches, error: coachError } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', clubId)
            .in('role', ['coach', 'head_coach']);

        if (coachError) {
            console.error('Error finding coaches:', coachError);
            return;
        }

        if (!coaches || coaches.length === 0) {
            console.log('[Settings] No coaches found in club to notify');
            return;
        }

        // Create notifications for all coaches
        // Include player_id in data so the player can delete the notification if they withdraw
        const notifications = coaches.map(coach => ({
            user_id: coach.id,
            type: type === 'join' ? 'club_join_request' : 'club_leave_request',
            title: type === 'join' ? 'Neue Beitrittsanfrage' : 'Neue Austrittsanfrage',
            message: type === 'join'
                ? `${playerName} möchte dem Verein beitreten.`
                : `${playerName} möchte den Verein verlassen.`,
            data: { player_name: playerName, player_id: currentUser.id },
            is_read: false
        }));

        const { error: notifyError } = await supabase
            .from('notifications')
            .insert(notifications);

        if (notifyError) {
            console.error('Error creating coach notifications:', notifyError);
        } else {
            console.log(`[Settings] Notified ${coaches.length} coach(es) about ${type} request`);
        }
    } catch (error) {
        console.error('Error notifying coaches:', error);
    }
}

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

        // Notify coaches about the new request
        const playerName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.email;
        await notifyClubCoaches(clubId, 'join', playerName);

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

    // Special warning for coaches - they will lose their coach role
    const isCoach = currentUserData.role === 'coach' || currentUserData.role === 'head_coach';
    let confirmMessage = `Möchtest du wirklich eine Austrittsanfrage für "${clubName}" senden?`;

    if (isCoach) {
        confirmMessage = `⚠️ ACHTUNG: Du bist ${currentUserData.role === 'head_coach' ? 'Haupttrainer' : 'Spartenleiter'}!\n\n` +
            `Wenn du den Verein "${clubName}" verlässt, verlierst du deine Trainer-Rechte und wirst zu einem normalen Spieler herabgestuft.\n\n` +
            `Möchtest du trotzdem eine Austrittsanfrage senden?`;
    }

    if (!confirm(confirmMessage)) {
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

        // Notify coaches about the leave request
        const playerName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.email;
        await notifyClubCoaches(currentUserData.clubId, 'leave', playerName);

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
 * Remove notifications created by this player for a specific type
 */
async function removePlayerNotifications(playerId, notificationType) {
    try {
        // Delete notifications where data->player_id matches and type matches
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('type', notificationType)
            .filter('data->>player_id', 'eq', playerId);

        if (error) {
            console.error('Error removing notifications:', error);
        } else {
            console.log(`[Settings] Removed ${notificationType} notifications for player ${playerId}`);
        }
    } catch (error) {
        console.error('Error removing notifications:', error);
    }
}

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

        // Also remove the notifications sent to coaches
        await removePlayerNotifications(currentUser.id, 'club_join_request');

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

        // Also remove the notifications sent to coaches
        await removePlayerNotifications(currentUser.id, 'club_leave_request');

        clubManagementFeedback.textContent = '✓ Austrittsanfrage zurückgezogen';
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error withdrawing leave request:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

