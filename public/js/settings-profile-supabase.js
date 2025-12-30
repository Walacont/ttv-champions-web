// Einstellungs-Seite für Benutzerprofil - Supabase Version

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

const updatePersonalDataForm = document.getElementById('update-personal-data-form');
const genderInput = document.getElementById('gender');
const birthdateInput = document.getElementById('birthdate');
const personalDataFeedback = document.getElementById('personal-data-feedback');

const updatePasswordForm = document.getElementById('update-password-form');
const oldPasswordInput = document.getElementById('old-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const passwordFeedback = document.getElementById('password-feedback');

let currentUser = null;
let currentUserData = null;
let selectedFile = null;
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (!error && profile) {
            currentUserData = {
                id: currentUser.id,
                email: profile.email || currentUser.email,
                firstName: profile.first_name || '',
                lastName: profile.last_name || '',
                gender: profile.gender || null,
                birthdate: profile.birthdate || null,
                photoURL: profile.avatar_url || null,
            };

            const initials = (currentUserData.firstName?.[0] || '') + (currentUserData.lastName?.[0] || '');
            profileImagePreview.src =
                currentUserData.photoURL || `https://placehold.co/96x96/e2e8f0/64748b?text=${initials}`;
            firstNameInput.value = currentUserData.firstName || '';
            lastNameInput.value = currentUserData.lastName || '';

            genderInput.value = currentUserData.gender || '';
            birthdateInput.value = currentUserData.birthdate || '';
        }

        currentEmailDisplay.textContent = currentUser.email || 'Keine Email hinterlegt';
        updateEmailVerificationStatus(currentUser.email_confirmed_at != null);

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Initialisierung sofort oder bei DOMContentLoaded für SPA-Navigation
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Redirect nur bei explizitem Sign-Out, nicht bei anderen Auth-Änderungen
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

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
        const fileName = `${currentUser.id}/profile.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('profile-pictures')
            .upload(fileName, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
            .from('profile-pictures')
            .getPublicUrl(fileName);

        const photoURL = urlData.publicUrl;

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
        // Re-Authentication zur Sicherheit vor sensiblen Änderungen
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: password
        });

        if (signInError) throw signInError;

        // Supabase sendet automatisch eine Verifizierungs-Email an die neue Adresse
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

updatePersonalDataForm.addEventListener('submit', async e => {
    e.preventDefault();
    const gender = genderInput.value;
    const birthdate = birthdateInput.value;
    personalDataFeedback.textContent = '';

    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                gender: gender || null,
                birthdate: birthdate || null,
            })
            .eq('id', currentUser.id);

        if (error) throw error;

        personalDataFeedback.textContent = 'Persönliche Daten erfolgreich gespeichert!';
        personalDataFeedback.className = 'mt-2 text-sm text-green-600';
    } catch (error) {
        console.error('Fehler beim Speichern der persönlichen Daten:', error);
        personalDataFeedback.textContent = 'Fehler beim Speichern der persönlichen Daten.';
        personalDataFeedback.className = 'mt-2 text-sm text-red-600';
    }
});

updatePasswordForm.addEventListener('submit', async e => {
    e.preventDefault();
    const oldPassword = oldPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    passwordFeedback.textContent = '';
    passwordFeedback.className = 'mt-2 text-sm';

    if (newPassword !== confirmPassword) {
        passwordFeedback.textContent = 'Die neuen Passwörter stimmen nicht überein.';
        passwordFeedback.classList.add('text-red-600');
        return;
    }

    if (newPassword.length < 8) {
        passwordFeedback.textContent = 'Das neue Passwort muss mindestens 8 Zeichen lang sein.';
        passwordFeedback.classList.add('text-red-600');
        return;
    }

    try {
        // Re-Authentication zur Sicherheit vor sensiblen Änderungen
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: oldPassword
        });

        if (signInError) throw signInError;

        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) throw updateError;

        passwordFeedback.textContent = '✓ Passwort erfolgreich geändert!';
        passwordFeedback.classList.add('text-green-600');

        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
    } catch (error) {
        console.error('Fehler beim Ändern des Passworts:', error);

        let errorMessage = 'Ein unbekannter Fehler ist aufgetreten.';

        if (error.message?.includes('Invalid login credentials')) {
            errorMessage = 'Das aktuelle Passwort ist falsch.';
        } else if (error.message) {
            errorMessage = error.message;
        }

        passwordFeedback.textContent = `Fehler: ${errorMessage}`;
        passwordFeedback.classList.add('text-red-600');
    }
});
