// SC Champions - Registrierungsseite (Supabase-Version)
// Ersetzt register.js für die Supabase-Migration

import { getSupabase } from './supabase-init.js';

console.log('[REGISTER-SUPABASE] Script starting...');

const supabase = getSupabase();

const loader = document.getElementById('loader');
const registrationFormContainer = document.getElementById('registration-form-container');
const registrationForm = document.getElementById('registration-form');
const errorMessage = document.getElementById('error-message');
const formSubtitle = document.getElementById('form-subtitle');
const submitButton = document.getElementById('submit-button');
const tokenRequiredMessageContainer = document.getElementById('token-required-message');

let invitationCode = null;
let invitationCodeData = null;
let registrationType = null;

async function initializeRegistration() {
    const urlParams = new URLSearchParams(window.location.search);
    invitationCode = urlParams.get('code');

    if (!invitationCode) {
        return;
    }

    if (tokenRequiredMessageContainer) {
        tokenRequiredMessageContainer.classList.add('hidden');
    }
    loader.classList.remove('hidden');

    try {
        invitationCode = invitationCode.trim().toUpperCase();

        const codeRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
        if (!codeRegex.test(invitationCode)) {
            return displayError('Ungültiges Code-Format.');
        }

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

        if (!codeData.is_active) {
            return displayError('Dieser Code ist nicht mehr aktiv.');
        }

        if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
            return displayError('Dieser Code ist abgelaufen.');
        }

        if (codeData.max_uses && codeData.use_count >= codeData.max_uses) {
            return displayError('Dieser Code wurde bereits zu oft verwendet.');
        }

        registrationType = 'code';
        formSubtitle.textContent = 'Willkommen! Vervollständige deine Registrierung.';
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

    } catch (error) {
        console.error('[REGISTER-SUPABASE] Init error:', error);
        displayError('Fehler beim Überprüfen der Einladung.');
    }
}

initializeRegistration();

const registerWithoutCodeBtn = document.getElementById('register-without-code-btn');
if (registerWithoutCodeBtn) {
    registerWithoutCodeBtn.addEventListener('click', () => {
        registrationType = 'no-code';

        tokenRequiredMessageContainer?.classList.add('hidden');
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

        const nameFields = document.getElementById('name-fields');
        if (nameFields) {
            nameFields.classList.remove('hidden');
            document.getElementById('first-name').required = true;
            document.getElementById('last-name').required = true;
        }

        formSubtitle.textContent = 'Erstelle deinen Account und trete später einem Verein bei.';
    });
}

registrationForm?.addEventListener('submit', async e => {
    e.preventDefault();
    errorMessage.textContent = '';

    const email = document.getElementById('email-address').value;
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('password-confirm').value;

    const consentStudy = document.getElementById('consent-study')?.checked;
    const consentPrivacy = document.getElementById('consent-privacy')?.checked;

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

        // Name wird in user_metadata gespeichert für E-Mail-Templates
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

        if (registrationType === 'code' && invitationCodeData) {
            profileUpdates.club_id = invitationCodeData.club_id;

            if (invitationCodeData.role) {
                profileUpdates.role = invitationCodeData.role;
            }

            if (invitationCodeData.sport_id) {
                profileUpdates.active_sport_id = invitationCodeData.sport_id;
                console.log('[REGISTER] Setting active_sport_id from invitation code:', invitationCodeData.sport_id);
            } else {
                console.warn('[REGISTER] Invitation code has no sport_id!');
            }

            if (invitationCodeData.first_name) {
                profileUpdates.first_name = invitationCodeData.first_name;
            }
            if (invitationCodeData.last_name) {
                profileUpdates.last_name = invitationCodeData.last_name;
            }

            // Prüfe ob dieser Code für einen existierenden Offline-Spieler ist
            if (invitationCodeData.player_id) {
                // Vollständige Migration: Übertrage ALLE Daten vom Offline-Spieler via RPC
                console.log('[REGISTER] Migrating offline player:', invitationCodeData.player_id, '-> new user:', user.id);

                const { data: migrationResult, error: migrationError } = await supabase.rpc('migrate_offline_player', {
                    p_new_user_id: user.id,
                    p_offline_player_id: invitationCodeData.player_id
                });

                console.log('[REGISTER] Migration RPC result:', migrationResult, 'error:', migrationError);

                const migrationFailed = migrationError || (migrationResult && migrationResult.success === false);

                if (migrationFailed) {
                    const errorMsg = migrationError?.message || migrationResult?.error || 'Unknown error';
                    console.error('[REGISTER] Migration error:', errorMsg);
                    // Fallback: Zumindest Basis-Daten setzen
                    const { data: offlinePlayer } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', invitationCodeData.player_id)
                        .single();

                    if (offlinePlayer) {
                        profileUpdates.xp = offlinePlayer.xp || 0;
                        profileUpdates.points = offlinePlayer.points || 0;
                        profileUpdates.elo_rating = offlinePlayer.elo_rating || 800;
                        profileUpdates.highest_elo = offlinePlayer.highest_elo || 800;
                        profileUpdates.is_match_ready = offlinePlayer.is_match_ready || false;
                        profileUpdates.grundlagen_completed = offlinePlayer.grundlagen_completed || 0;
                        if (offlinePlayer.birthdate) profileUpdates.birthdate = offlinePlayer.birthdate;
                        if (offlinePlayer.gender) profileUpdates.gender = offlinePlayer.gender;
                        if (offlinePlayer.subgroup_ids) profileUpdates.subgroup_ids = offlinePlayer.subgroup_ids;

                        // RPC wird verwendet da direktes Löschen durch RLS blockiert ist
                        console.log('[REGISTER] Deleting old offline player profile via RPC:', invitationCodeData.player_id);
                        const { data: deleteResult, error: deleteError } = await supabase.rpc('delete_offline_player', {
                            p_offline_player_id: invitationCodeData.player_id
                        });

                        if (deleteError) {
                            console.error('[REGISTER] Failed to delete offline player (RPC error):', deleteError);
                        } else if (deleteResult && deleteResult.success) {
                            console.log('[REGISTER] Old offline player profile deleted successfully via RPC');
                        } else {
                            console.warn('[REGISTER] Delete RPC returned:', deleteResult);
                        }
                    }
                } else if (migrationResult && migrationResult.success === true) {
                    console.log('[REGISTER] Migration successful:', migrationResult);
                    console.log('[REGISTER] Migrated elo_rating:', migrationResult.elo_rating);
                    console.log('[REGISTER] Old profile deleted:', migrationResult.old_profile_deleted);
                    console.log('[REGISTER] Deleted count:', migrationResult.deleted_count);

                    if (migrationResult.old_profile_deleted === false) {
                        console.warn('[REGISTER] Migration succeeded but delete failed! Trying fallback delete...');
                        const { data: deleteResult, error: deleteError } = await supabase.rpc('delete_offline_player', {
                            p_offline_player_id: invitationCodeData.player_id
                        });

                        if (deleteError) {
                            console.error('[REGISTER] Fallback delete failed (RPC error):', deleteError);
                        } else if (deleteResult && deleteResult.success) {
                            console.log('[REGISTER] Fallback delete succeeded!');
                        } else {
                            console.error('[REGISTER] Fallback delete also failed:', deleteResult);
                        }
                    }

                    // Migration RPC hat alles erledigt - manuelles Profil-Update nicht nötig
                    profileUpdates = {};
                } else {
                    console.warn('[REGISTER] Unexpected migration result:', migrationResult);
                }
            } else {
                if (invitationCodeData.birthdate) {
                    profileUpdates.birthdate = invitationCodeData.birthdate;
                }
                if (invitationCodeData.gender) {
                    profileUpdates.gender = invitationCodeData.gender;
                }
                // Neuer Spieler via Code (inkl. head_coach) - setze Standard-Werte
                profileUpdates.is_match_ready = true;
                profileUpdates.elo_rating = 800;
                profileUpdates.highest_elo = 800;
                profileUpdates.grundlagen_completed = 5;
                console.log('[REGISTER] Setting is_match_ready=true for new code registration (role:', invitationCodeData.role, ')');
            }
        }

        // Bei No-Code-Registrierung: Automatisch wettkampfsbereit
        if (registrationType === 'no-code') {
            const firstName = document.getElementById('first-name')?.value?.trim() || '';
            const lastName = document.getElementById('last-name')?.value?.trim() || '';
            profileUpdates.first_name = firstName;
            profileUpdates.last_name = lastName;
            profileUpdates.display_name = `${firstName} ${lastName}`.trim();
            profileUpdates.is_match_ready = true;
            profileUpdates.elo_rating = 800;
            profileUpdates.highest_elo = 800;
            profileUpdates.grundlagen_completed = 5;
            console.log('[REGISTER] Setting is_match_ready=true for self-registration (no-code)');
        }

        if (Object.keys(profileUpdates).length > 0) {
            console.log('[REGISTER] Updating profile with:', profileUpdates);

            // .select() wird verwendet um das Update zu verifizieren
            const { data: updatedProfile, error: updateError } = await supabase
                .from('profiles')
                .update(profileUpdates)
                .eq('id', user.id)
                .select('id, role, active_sport_id, club_id, is_match_ready, grundlagen_completed')
                .single();

            if (updateError) {
                console.error('[REGISTER-SUPABASE] Profile update error:', updateError);
                // Nicht kritisch - weiter zum Onboarding
            } else if (updatedProfile) {
                console.log('[REGISTER] Profile updated successfully:', updatedProfile);

                if (profileUpdates.role && updatedProfile.role !== profileUpdates.role) {
                    console.error('[REGISTER] Role mismatch! Expected:', profileUpdates.role, 'Got:', updatedProfile.role);
                }
                if (profileUpdates.active_sport_id && updatedProfile.active_sport_id !== profileUpdates.active_sport_id) {
                    console.error('[REGISTER] Sport mismatch! Expected:', profileUpdates.active_sport_id, 'Got:', updatedProfile.active_sport_id);
                }
                if (profileUpdates.is_match_ready !== undefined && updatedProfile.is_match_ready !== profileUpdates.is_match_ready) {
                    console.error('[REGISTER] is_match_ready mismatch! Expected:', profileUpdates.is_match_ready, 'Got:', updatedProfile.is_match_ready);
                } else {
                    console.log('[REGISTER] is_match_ready verified:', updatedProfile.is_match_ready);
                }
            } else {
                console.error('[REGISTER] Profile update returned no data - profile might not exist');
            }
        }

        // 3. Invitation Code aktualisieren (use_count erhöhen)
        if (registrationType === 'code' && invitationCodeData) {
            await supabase
                .from('invitation_codes')
                .update({ use_count: (invitationCodeData.use_count || 0) + 1 })
                .eq('id', invitationCodeData.id);

            // Speichern für Vorausfüllung im Onboarding
            localStorage.setItem('pendingInvitationData', JSON.stringify({
                firstName: invitationCodeData.first_name || '',
                lastName: invitationCodeData.last_name || '',
                birthdate: invitationCodeData.birthdate || null,
                gender: invitationCodeData.gender || null,
                sportId: invitationCodeData.sport_id || null,
                clubId: invitationCodeData.club_id || null
            }));
        }

        console.log('[REGISTER-SUPABASE] Registration complete, redirecting...');

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
