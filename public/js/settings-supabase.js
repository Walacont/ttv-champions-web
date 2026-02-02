// Einstellungsseite - Supabase-Version

import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { uploadToR2 } from './r2-storage.js';

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

async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id, email, first_name, last_name, display_name, role, club_id, xp, points, elo_rating, highest_elo, gender, birthdate, avatar_url, onboarding_complete, privacy_settings, active_sport_id')
            .eq('id', currentUser.id)
            .single();

        if (!error && profile) {
            // Mapping zu einheitlichem Format für Single-Sport-Modell
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
                currentUserData.photoURL || avatarPlaceholder(initials);
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

            updateTutorialStatus(currentUserData);
            loadPrivacySettings(currentUserData);
            initializeClubManagement();

            // Vereinsseite-Karte nur für Coaches/Head-Coaches anzeigen
            const clubPageCard = document.getElementById('club-page-card');
            if (clubPageCard && (currentUserData.role === 'coach' || currentUserData.role === 'head_coach') && currentUserData.clubId) {
                clubPageCard.classList.remove('hidden');
            }
        }

        currentEmailDisplay.textContent = currentUser.email || 'Keine Email hinterlegt';
        // Supabase verwendet ein anderes Verifizierungssystem als Firebase
        updateEmailVerificationStatus(currentUser.email_confirmed_at != null);

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Bei SPA-Navigation ist das Dokument bereits geladen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

onAuthStateChange((event, session) => {
    // Nur bei explizitem Sign-Out umleiten, nicht bei Token-Refresh
    // SIGNED_OUT ist der einzige zuverlässige Indikator für bewusstes Ausloggen
    if (event === 'SIGNED_OUT') {
        console.log('[Settings] User signed out, redirecting to login');
        window.location.href = '/index.html';
    }
    if (event === 'TOKEN_REFRESHED' && session) {
        console.log('[Settings] Token refreshed, session still valid');
    }
});

const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
        try {
            logoutButton.disabled = true;
            logoutButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Abmelden...';

            // Cache leeren um Zurück-Navigation zu authentifizierten Seiten zu verhindern
            if (window.spaEnhancer) {
                window.spaEnhancer.clearCache();
            }

            await supabase.auth.signOut();
            // replace() löscht History und verhindert Zurück-Navigation
            window.location.replace('/index.html');
        } catch (error) {
            console.error('Logout error:', error);
            // Bei fehlender Session trotzdem umleiten
            if (error.message?.includes('Auth session missing') || error.message?.includes('session_not_found')) {
                window.location.replace('/index.html');
                return;
            }
            logoutButton.disabled = false;
            logoutButton.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Abmelden';
        }
    });
}

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

        document
            .getElementById('send-verification-btn')
            ?.addEventListener('click', sendVerificationEmail);
    }
}

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
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `profile.${fileExt}`;

        // Upload zu R2 (mit Fallback zu Supabase)
        const uploadResult = await uploadToR2('profile-pictures', selectedFile, {
            subfolder: currentUser.id,
            filename: fileName
        });

        const photoURL = uploadResult.url;

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

updateEmailForm.addEventListener('submit', async e => {
    e.preventDefault();
    const newEmail = newEmailInput.value.trim();
    const password = currentPasswordInput.value;

    emailFeedback.textContent = '';
    emailFeedback.className = 'text-sm';

    if (newEmail === currentUser.email) {
        emailFeedback.textContent = 'Die neue Email-Adresse ist identisch mit der aktuellen.';
        emailFeedback.className = 'text-sm text-amber-600';
        return;
    }

    try {
        // Schritt 1: Re-Authentication
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: password
        });

        if (signInError) throw signInError;

        // Schritt 2: Email-Update (Supabase sendet automatisch Verifizierung)
        const { error: updateError } = await supabase.auth.updateUser({
            email: newEmail
        });

        if (updateError) throw updateError;

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

        newEmailInput.value = '';
        currentPasswordInput.value = '';
    } catch (error) {
        console.error('Fehler beim Ändern der Email:', error);

        let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.';

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

// ===== TUTORIAL FUNKTIONEN =====

function updateTutorialStatus(userData) {
    const role = userData?.role;
    const tutorialSection = document.getElementById('tutorial-section');
    if (!tutorialSection) return;

    tutorialSection.style.display = 'block';

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

document.getElementById('start-coach-tutorial-btn')?.addEventListener('click', () => {
    if (window.location.pathname.includes('coach.html')) {
        if (typeof window.startCoachTutorial === 'function') {
            window.startCoachTutorial();
        }
    } else {
        sessionStorage.setItem('startTutorial', 'coach');
        window.location.href = '/coach.html';
    }
});

document.getElementById('start-player-tutorial-btn')?.addEventListener('click', () => {
    if (window.location.pathname.includes('dashboard.html')) {
        if (typeof window.startPlayerTutorial === 'function') {
            window.startPlayerTutorial();
        }
    } else {
        sessionStorage.setItem('startTutorial', 'player');
        window.location.href = '/dashboard.html';
    }
});

/**
 * ===============================================
 * GDPR DATENEXPORT & ACCOUNT-LÖSCHUNG
 * ===============================================
 */

/** Exportiert alle Benutzerdaten als JSON (GDPR Art. 20) */
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

        const { data: userData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (profileError) throw profileError;

        const { data: matches, error: matchesError } = await supabase
            .from('matches')
            .select('*')
            .contains('player_ids', [currentUser.id]);

        if (matchesError) console.error('Error fetching matches:', matchesError);

        let doublesMatches = [];
        if (userData?.club_id) {
            const { data: doublesData, error: doublesError } = await supabase
                .from('doubles_matches')
                .select('*')
                .eq('club_id', userData.club_id)
                .contains('player_ids', [currentUser.id]);

            if (!doublesError) doublesMatches = doublesData || [];
        }

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

/** Löscht den Account komplett aus der Datenbank (Hard Delete) */
document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
    if (!currentUser) {
        alert('Fehler: Nicht angemeldet');
        return;
    }

    const confirmed = confirm(
        '⚠️ WARNUNG: Vollständige Account-Löschung\n\n' +
        'Bist du sicher, dass du deinen Account KOMPLETT löschen möchtest?\n\n' +
        'Was passiert:\n' +
        '• ALLE deine Daten werden vollständig gelöscht\n' +
        '• Alle Spiele und Match-Historie werden entfernt\n' +
        '• Alle Statistiken werden gelöscht\n' +
        '• Alle Aktivitäten und Beiträge werden entfernt\n' +
        '• Diese Aktion kann NICHT rückgängig gemacht werden!\n\n' +
        'Empfehlung: Lade zuerst deine Daten herunter.\n\n' +
        'Fortfahren?'
    );

    if (!confirmed) return;

    const doubleConfirm = prompt(
        'Bitte tippe "LÖSCHEN" ein, um die vollständige Löschung zu bestätigen:'
    );

    if (doubleConfirm !== 'LÖSCHEN') {
        alert('Account-Löschung abgebrochen.');
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');

    try {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Lösche alle Daten...';

        // Use hard_delete_account for complete deletion
        const { data, error } = await supabase.rpc('hard_delete_account', {
            p_user_id: currentUser.id
        });

        if (error) throw error;

        // Check if the function returned an error
        if (data && data.success === false) {
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        alert(
            'Dein Account und alle Daten wurden vollständig gelöscht.\n\n' +
            'Du wirst jetzt abgemeldet.'
        );

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
 * PRIVACY EINSTELLUNGEN
 * ===============================================
 */

function loadPrivacySettings(userData) {
    if (!userData) return;

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
        // Fallback für alte Boolean-Werte
        searchableGlobal.checked = true;
    }

    const showInLeaderboardsSetting = userData.privacySettings?.showInLeaderboards !== false;
    showInLeaderboards.checked = showInLeaderboardsSetting;

    // Warnung anzeigen wenn Nutzer keinen Verein hat aber "club_only" wählt
    updateNoClubWarning(userData.clubId);

    searchableGlobal.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableClubOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableFriendsOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableNone.addEventListener('change', () => updateNoClubWarning(userData.clubId));
}

function updateNoClubWarning(clubId) {
    if (!clubId && searchableClubOnly.checked) {
        noClubWarning.classList.remove('hidden');
    } else {
        noClubWarning.classList.add('hidden');
    }
}

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

        let searchable = 'global';
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
 * VEREINSVERWALTUNG
 * ===============================================
 */

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

async function initializeClubManagement() {
    if (!currentUser || !currentUserData) return;

    listenToClubRequests();
    listenToLeaveRequests();
    await updateClubManagementUI();
}

async function showRejectionNotification(type, requestData) {
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

    // Abgelehnte Anfrage nach Benachrichtigung löschen
    try {
        const tableName = type === 'join' ? 'club_requests' : 'leave_club_requests';
        await supabase.from(tableName).delete().eq('id', requestData.id);
    } catch (error) {
        console.error('Error deleting rejected request:', error);
    }
}

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
            if (payload.new?.status === 'rejected') {
                await showRejectionNotification('join', payload.new);
            }
            await updateClubManagementUI();
        })
        .subscribe();
}

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
            if (payload.new?.status === 'rejected') {
                await showRejectionNotification('leave', payload.new);
            }
            await updateClubManagementUI();
        })
        .subscribe();
}

async function updateClubManagementUI() {
    if (!currentUser || !currentUserData) return;

    const { data: profile } = await supabase
        .from('profiles')
        .select('club_id')
        .eq('id', currentUser.id)
        .single();

    if (profile) {
        currentUserData.clubId = profile.club_id || null;
    }

    const { data: joinRequests } = await supabase
        .from('club_requests')
        .select('id')
        .eq('player_id', currentUser.id)
        .eq('status', 'pending');

    const hasPendingJoinRequest = joinRequests && joinRequests.length > 0;

    const { data: leaveRequests } = await supabase
        .from('leave_club_requests')
        .select('id')
        .eq('player_id', currentUser.id)
        .eq('status', 'pending');

    const hasPendingLeaveRequest = leaveRequests && leaveRequests.length > 0;

    if (currentUserData.clubId) {
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

    if (hasPendingJoinRequest) {
        const joinRequestData = joinRequests[0];

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

        document.querySelector('.withdraw-join-request-btn').addEventListener('click', async (e) => {
            const requestId = e.target.closest('button').dataset.requestId;
            await withdrawJoinRequest(requestId);
        });
    } else if (hasPendingLeaveRequest) {
        const leaveRequestData = leaveRequests[0];

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

        document.querySelector('.withdraw-leave-request-btn').addEventListener('click', async (e) => {
            const requestId = e.target.closest('button').dataset.requestId;
            await withdrawLeaveRequest(requestId);
        });
    } else {
        pendingRequestStatus.innerHTML = '';
    }

    if (!currentUserData.clubId && !hasPendingJoinRequest) {
        clubSearchSection.classList.remove('hidden');
    } else {
        clubSearchSection.classList.add('hidden');
    }

    if (currentUserData.clubId && !hasPendingLeaveRequest) {
        leaveClubSection.classList.remove('hidden');
    } else {
        leaveClubSection.classList.add('hidden');
    }
}

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

        const userSportId = currentUserData.activeSportId;

        let clubsData = [];

        if (userSportId) {
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
                    .select('id, name')
                    .ilike('name', `%${searchTerm}%`)
                    .eq('is_test_club', false)
                    .in('id', clubIdsWithSport);

                if (error) throw error;
                clubsData = data || [];
            }
        } else {
            // Kein Sportarten-Filter vorhanden
            const { data, error } = await supabase
                .from('clubs')
                .select('id, name')
                .ilike('name', `%${searchTerm}%`)
                .eq('is_test_club', false);

            if (error) throw error;
            clubsData = data || [];
        }

        let clubs = clubsData;

        // Mitgliederzahl ermitteln (inklusive Offline-Spieler und Trainer)
        for (const club of clubs) {
            const { count } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
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

/** Benachrichtigt alle Trainer über Beitritts-/Austrittsanfragen */
async function notifyClubCoaches(clubId, type, playerName) {
    try {
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

        // player_id in Daten speichern damit Spieler die Benachrichtigung beim Zurückziehen löschen kann
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

async function requestToJoinClub(clubId, clubName) {
    if (!confirm(`Möchtest du wirklich eine Beitrittsanfrage an "${clubName}" senden?`)) {
        return;
    }

    try {
        clubManagementFeedback.textContent = 'Sende Anfrage...';
        clubManagementFeedback.className = 'text-sm mt-3 text-gray-600';

        const { error } = await supabase.from('club_requests').insert({
            player_id: currentUser.id,
            club_id: clubId,
            status: 'pending'
        });

        if (error) throw error;

        const playerName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.email;
        await notifyClubCoaches(clubId, 'join', playerName);

        clubManagementFeedback.textContent = `✓ Beitrittsanfrage an "${clubName}" gesendet!`;
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

        clubSearchInput.value = '';
        clubSearchResults.innerHTML = '';

        await updateClubManagementUI();
    } catch (error) {
        console.error('Error requesting to join club:', error);
        clubManagementFeedback.textContent = `Fehler: ${error.message}`;
        clubManagementFeedback.className = 'text-sm mt-3 text-red-600';
    }
}

leaveClubBtn?.addEventListener('click', async () => {
    if (!currentUserData.clubId) {
        alert('Du bist aktuell keinem Verein zugeordnet.');
        return;
    }

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

    // Warnung für Trainer - sie verlieren ihre Trainer-Rechte
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

        const { error } = await supabase.from('leave_club_requests').insert({
            player_id: currentUser.id,
            club_id: currentUserData.clubId,
            status: 'pending'
        });

        if (error) throw error;

        const playerName = `${currentUserData.firstName || ''} ${currentUserData.lastName || ''}`.trim() || currentUserData.email;
        await notifyClubCoaches(currentUserData.clubId, 'leave', playerName);

        clubManagementFeedback.textContent = `✓ Austrittsanfrage gesendet!`;
        clubManagementFeedback.className = 'text-sm mt-3 text-green-600';

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

/** Entfernt Benachrichtigungen die dieser Spieler erstellt hat */
async function removePlayerNotifications(playerId, notificationType) {
    try {
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

        // Benachrichtigungen an Trainer ebenfalls entfernen
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

        // Benachrichtigungen an Trainer ebenfalls entfernen
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
