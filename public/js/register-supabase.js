// SC Champions - Registration Page (Supabase Version)
// Ersetzt register.js für die Supabase-Migration

import { getSupabase } from './supabase-init.js';

console.log('[REGISTER-SUPABASE] Script starting...');

const supabase = getSupabase();

// ===== UI ELEMENTE =====
const loader = document.getElementById('loader');
const registrationFormContainer = document.getElementById('registration-form-container');
const registrationForm = document.getElementById('registration-form');
const errorMessage = document.getElementById('error-message');
const formSubtitle = document.getElementById('form-subtitle');
const submitButton = document.getElementById('submit-button');
const tokenRequiredMessageContainer = document.getElementById('token-required-message');

let invitationCode = null;
let invitationCodeData = null;
let registrationType = null; // 'code' or 'no-code'

// ===== INITIALISIERUNG =====
async function initializeRegistration() {
    const urlParams = new URLSearchParams(window.location.search);
    invitationCode = urlParams.get('code');

    if (!invitationCode) {
        // Kein Code - zeige Standard-Nachricht
        return;
    }

    // Code gefunden - verstecke Standard-Nachricht
    if (tokenRequiredMessageContainer) {
        tokenRequiredMessageContainer.classList.add('hidden');
    }
    loader.classList.remove('hidden');

    try {
        invitationCode = invitationCode.trim().toUpperCase();

        // Validiere Format
        const codeRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
        if (!codeRegex.test(invitationCode)) {
            return displayError('Ungültiges Code-Format.');
        }

        // Suche Code in Supabase
        const { data: codeData, error } = await supabase
            .from('invitation_codes')
            .select('*')
            .eq('code', invitationCode)
            .single();

        if (error || !codeData) {
            return displayError('Dieser Code existiert nicht.');
        }

        invitationCodeData = codeData;
        console.log('[REGISTER] Invitation code data:', {
            code: codeData.code,
            club_id: codeData.club_id,
            sport_id: codeData.sport_id,
            role: codeData.role
        });

        // Prüfe ob Code aktiv ist
        if (!codeData.is_active) {
            return displayError('Dieser Code ist nicht mehr aktiv.');
        }

        // Prüfe ob Code abgelaufen ist
        if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
            return displayError('Dieser Code ist abgelaufen.');
        }

        // Prüfe max uses
        if (codeData.max_uses && codeData.use_count >= codeData.max_uses) {
            return displayError('Dieser Code wurde bereits zu oft verwendet.');
        }

        // Code gültig - Zeige Formular
        registrationType = 'code';
        formSubtitle.textContent = 'Willkommen! Vervollständige deine Registrierung.';
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

    } catch (error) {
        console.error('[REGISTER-SUPABASE] Init error:', error);
        displayError('Fehler beim Überprüfen der Einladung.');
    }
}

// Initialize on load
initializeRegistration();

// ===== REGISTRIERUNG OHNE CODE =====
const registerWithoutCodeBtn = document.getElementById('register-without-code-btn');
if (registerWithoutCodeBtn) {
    registerWithoutCodeBtn.addEventListener('click', () => {
        registrationType = 'no-code';

        tokenRequiredMessageContainer?.classList.add('hidden');
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

        // Zeige Name-Felder
        const nameFields = document.getElementById('name-fields');
        if (nameFields) {
            nameFields.classList.remove('hidden');
            document.getElementById('first-name').required = true;
            document.getElementById('last-name').required = true;
        }

        formSubtitle.textContent = 'Erstelle deinen Account und trete später einem Verein bei.';
    });
}

// ===== REGISTRIERUNG =====
registrationForm?.addEventListener('submit', async e => {
    e.preventDefault();
    errorMessage.textContent = '';

    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password-confirm').value;

    const consentStudy = document.getElementById('consent-study')?.checked;
    const consentPrivacy = document.getElementById('consent-privacy')?.checked;

    // Validierungen
    if (password !== passwordConfirm) {
        errorMessage.textContent = 'Die Passwörter stimmen nicht überein.';
        return;
    }

    if (!consentStudy || !consentPrivacy) {
        errorMessage.textContent = 'Du musst der Studie und der Datenschutzerklärung zustimmen.';
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Registriere...';

    try {
        console.log('[REGISTER-SUPABASE] Creating user...');

        // Get name for user_metadata (used in email templates)
        let firstName = '';
        let lastName = '';

        if (registrationType === 'code' && invitationCodeData) {
            firstName = invitationCodeData.first_name || '';
            lastName = invitationCodeData.last_name || '';
        } else if (registrationType === 'no-code') {
            firstName = document.getElementById('first-name')?.value?.trim() || '';
            lastName = document.getElementById('last-name')?.value?.trim() || '';
        }

        // 1. User in Supabase Auth erstellen
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/onboarding.html`,
                data: {
                    first_name: firstName,
                    last_name: lastName
                }
            }
        });

        if (authError) {
            throw authError;
        }

        const user = authData.user;
        console.log('[REGISTER-SUPABASE] User created:', user.email);

        // Warte bis das Profil vom Trigger erstellt wurde (mit Polling)
        let profileExists = false;
        let attempts = 0;
        const maxAttempts = 10;

        while (!profileExists && attempts < maxAttempts) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 500));

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('id', user.id)
                .maybeSingle();

            if (profile) {
                profileExists = true;
                console.log('[REGISTER] Profile found after', attempts, 'attempts');
            }
        }

        if (!profileExists) {
            console.error('[REGISTER] Profile was not created by trigger after', maxAttempts, 'attempts');
        }

        // 2. Profil updaten (Trigger hat es bereits erstellt)
        let profileUpdates = {};

        // Bei Code-Registrierung: Club-ID und Role aus Code übernehmen
        if (registrationType === 'code' && invitationCodeData) {
            profileUpdates.club_id = invitationCodeData.club_id;

            // Role aus dem Invitation Code übernehmen (z.B. 'coach' oder 'player')
            if (invitationCodeData.role) {
                profileUpdates.role = invitationCodeData.role;
            }

            // Sport aus dem Invitation Code übernehmen
            if (invitationCodeData.sport_id) {
                profileUpdates.active_sport_id = invitationCodeData.sport_id;
                console.log('[REGISTER] Setting active_sport_id from invitation code:', invitationCodeData.sport_id);
            } else {
                console.warn('[REGISTER] Invitation code has no sport_id!');
            }

            // Optional: Name aus Code übernehmen falls vorhanden
            if (invitationCodeData.first_name) {
                profileUpdates.first_name = invitationCodeData.first_name;
            }
            if (invitationCodeData.last_name) {
                profileUpdates.last_name = invitationCodeData.last_name;
            }

            // Check if this code is for an existing offline player
            if (invitationCodeData.player_id) {
                // Get the offline player's is_match_ready setting
                const { data: offlinePlayer } = await supabase
                    .from('profiles')
                    .select('is_match_ready, grundlagen_completed')
                    .eq('id', invitationCodeData.player_id)
                    .single();

                if (offlinePlayer) {
                    if (offlinePlayer.is_match_ready) {
                        // Coach set player as match-ready
                        profileUpdates.is_match_ready = true;
                        profileUpdates.elo_rating = 800;
                        profileUpdates.highest_elo = 800;
                        profileUpdates.grundlagen_completed = 5;
                    } else {
                        // Coach did NOT set player as match-ready
                        profileUpdates.is_match_ready = false;
                        profileUpdates.grundlagen_completed = offlinePlayer.grundlagen_completed || 0;
                    }
                }
            } else {
                // Code without player_id - new player via code, set defaults
                profileUpdates.is_match_ready = true;
                profileUpdates.elo_rating = 800;
                profileUpdates.highest_elo = 800;
                profileUpdates.grundlagen_completed = 5;
            }
        }

        // Bei No-Code (Selbst-Registrierung): Automatisch wettkampfsbereit
        if (registrationType === 'no-code') {
            const firstName = document.getElementById('first-name')?.value?.trim() || '';
            const lastName = document.getElementById('last-name')?.value?.trim() || '';
            profileUpdates.first_name = firstName;
            profileUpdates.last_name = lastName;
            profileUpdates.display_name = `${firstName} ${lastName}`.trim();
            // Selbst-Registrierung: automatisch wettkampfsbereit
            profileUpdates.is_match_ready = true;
            profileUpdates.elo_rating = 800;
            profileUpdates.highest_elo = 800;
            profileUpdates.grundlagen_completed = 5;
        }

        // Update Profil falls nötig
        if (Object.keys(profileUpdates).length > 0) {
            console.log('[REGISTER] Updating profile with:', profileUpdates);

            // Use .select() to verify the update worked and get the updated row
            const { data: updatedProfile, error: updateError } = await supabase
                .from('profiles')
                .update(profileUpdates)
                .eq('id', user.id)
                .select('id, role, active_sport_id, club_id')
                .single();

            if (updateError) {
                console.error('[REGISTER-SUPABASE] Profile update error:', updateError);
                // Nicht kritisch - weiter zum Onboarding
            } else if (updatedProfile) {
                console.log('[REGISTER] Profile updated successfully:', updatedProfile);

                // Verify the role was set correctly
                if (profileUpdates.role && updatedProfile.role !== profileUpdates.role) {
                    console.error('[REGISTER] Role mismatch! Expected:', profileUpdates.role, 'Got:', updatedProfile.role);
                }
                if (profileUpdates.active_sport_id && updatedProfile.active_sport_id !== profileUpdates.active_sport_id) {
                    console.error('[REGISTER] Sport mismatch! Expected:', profileUpdates.active_sport_id, 'Got:', updatedProfile.active_sport_id);
                }
            } else {
                console.error('[REGISTER] Profile update returned no data - profile might not exist');
            }
        }

        // 3. Profile_club_sports Eintrag für Coach/Spieler erstellen
        if (registrationType === 'code' && invitationCodeData && invitationCodeData.club_id && invitationCodeData.sport_id) {
            const pcsRole = invitationCodeData.role === 'coach' || invitationCodeData.role === 'head_coach'
                ? invitationCodeData.role
                : 'player';

            const { error: pcsError } = await supabase
                .from('profile_club_sports')
                .insert({
                    user_id: user.id,
                    club_id: invitationCodeData.club_id,
                    sport_id: invitationCodeData.sport_id,
                    role: pcsRole
                });

            if (pcsError) {
                console.warn('[REGISTER-SUPABASE] Could not create profile_club_sports:', pcsError);
                // Nicht kritisch - weiter zum Onboarding
            } else {
                console.log('[REGISTER-SUPABASE] Created profile_club_sports entry for', pcsRole);
            }
        }

        // 4. Invitation Code aktualisieren (use_count erhöhen)
        if (registrationType === 'code' && invitationCodeData) {
            await supabase
                .from('invitation_codes')
                .update({ use_count: (invitationCodeData.use_count || 0) + 1 })
                .eq('id', invitationCodeData.id);
        }

        console.log('[REGISTER-SUPABASE] Registration complete, redirecting...');

        // 4. Weiterleitung zum Onboarding
        window.location.href = '/onboarding.html';

    } catch (error) {
        console.error('[REGISTER-SUPABASE] Error:', error);

        let displayMsg = error.message;
        if (error.message.includes('already registered')) {
            displayMsg = 'Diese E-Mail-Adresse wird bereits verwendet.';
        } else if (error.message.includes('invalid')) {
            displayMsg = 'Ungültige E-Mail-Adresse.';
        } else if (error.message.includes('weak') || error.message.includes('password')) {
            displayMsg = 'Das Passwort muss mindestens 6 Zeichen haben.';
        }

        errorMessage.textContent = 'Fehler bei der Registrierung: ' + displayMsg;
        submitButton.disabled = false;
        submitButton.textContent = 'Registrieren';
    }
});

// ===== FEHLERANZEIGE =====
function displayError(message) {
    loader.classList.add('hidden');
    registrationFormContainer.classList.add('hidden');

    if (tokenRequiredMessageContainer) {
        const icon = tokenRequiredMessageContainer.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-exclamation-triangle text-4xl text-red-600';
        }

        const title = tokenRequiredMessageContainer.querySelector('h1');
        if (title) {
            title.textContent = 'Ein Fehler ist aufgetreten';
            title.classList.remove('text-gray-900');
            title.classList.add('text-red-600');
        }

        const paragraphs = tokenRequiredMessageContainer.querySelectorAll('p');
        if (paragraphs[0]) {
            paragraphs[0].textContent = message;
            paragraphs[0].classList.remove('text-gray-600');
            paragraphs[0].classList.add('text-gray-800', 'font-medium');
        }

        if (paragraphs[1]) paragraphs[1].classList.add('hidden');
        const divider = tokenRequiredMessageContainer.querySelector('div.border-t');
        if (divider) divider.classList.add('hidden');

        tokenRequiredMessageContainer.classList.remove('hidden');
    }
}

console.log('[REGISTER-SUPABASE] Setup complete');
