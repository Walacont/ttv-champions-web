// Registrierungsseite (Supabase-Version)

import { getSupabase } from './supabase-init.js';
import { calculateAge, validateRegistrationAge, validateGuardianAge, parseBirthdate } from './age-utils.js';

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
let registrationType = null; // 'code', 'no-code', 'guardian', 'guardian-link'
let isAgeBlocked = false;
let linkedPlayerId = null; // ID of offline player to link (for guardian registration)
let linkedPlayerBirthdate = null; // Birthdate of offline player for verification
let linkedPlayerData = null; // Full data of linked offline player (for prefilling form)

// Role selection modal elements
const roleSelectionModal = document.getElementById('role-selection-modal');
const roleSelectPlayer = document.getElementById('role-select-player');
const roleSelectGuardian = document.getElementById('role-select-guardian');
const roleAgeBlock = document.getElementById('role-age-block');

// Guardian verification modal elements
const guardianVerifyModal = document.getElementById('guardian-verify-modal');
const verifyBirthdateBtn = document.getElementById('verify-birthdate-btn');
const verifyBackBtn = document.getElementById('verify-back-btn');
const verifyError = document.getElementById('verify-error');
const verifyErrorText = document.getElementById('verify-error-text');

// Initialize birthdate dropdowns
function initBirthdateDropdowns() {
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');

    if (!daySelect || !monthSelect || !yearSelect) return;

    populateBirthdateDropdown(daySelect, monthSelect, yearSelect);

    // Add change listeners for real-time age validation
    [daySelect, monthSelect, yearSelect].forEach(select => {
        select.addEventListener('change', validateAgeOnChange);
    });
}

// Initialize verify birthdate dropdowns (for guardian verification modal)
function initVerifyBirthdateDropdowns() {
    const daySelect = document.getElementById('verify-birthdate-day');
    const monthSelect = document.getElementById('verify-birthdate-month');
    const yearSelect = document.getElementById('verify-birthdate-year');

    if (!daySelect || !monthSelect || !yearSelect) return;

    populateBirthdateDropdown(daySelect, monthSelect, yearSelect);
}

// Populate birthdate dropdown elements
function populateBirthdateDropdown(daySelect, monthSelect, yearSelect) {
    // Days (1-31)
    for (let i = 1; i <= 31; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        daySelect.appendChild(option);
    }

    // Months (1-12)
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = monthNames[i - 1];
        monthSelect.appendChild(option);
    }

    // Years (current year down to 1920)
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 1920; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }
}

// Validate age when birthdate changes
function validateAgeOnChange() {
    const day = document.getElementById('birthdate-day')?.value;
    const month = document.getElementById('birthdate-month')?.value;
    const year = document.getElementById('birthdate-year')?.value;

    if (!day || !month || !year) {
        hideAgeBlockMessage();
        return;
    }

    const birthdate = parseBirthdate(day, month, year);
    if (!birthdate) {
        hideAgeBlockMessage();
        return;
    }

    let validation;
    if (registrationType === 'guardian' || registrationType === 'guardian-link') {
        // Guardian must be at least 18
        validation = validateGuardianAge(birthdate);
    } else {
        // Regular player registration - must be 16+
        const hasCode = !!invitationCode;
        validation = validateRegistrationAge(birthdate, hasCode);
    }

    if (!validation.allowed) {
        showAgeBlockMessage(validation.reason, validation.ageMode);
        isAgeBlocked = true;
    } else {
        hideAgeBlockMessage();
        isAgeBlocked = false;
    }
}

function showAgeBlockMessage(message, ageMode) {
    const container = document.getElementById('age-block-message');
    const text = document.getElementById('age-block-text');
    const submitBtn = document.getElementById('submit-button');
    const switchToGuardianBtn = document.getElementById('switch-to-guardian-btn');

    if (container && text) {
        text.textContent = message;
        container.classList.remove('hidden');
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    // Hide "Register as guardian instead" button if already registering as guardian
    if (switchToGuardianBtn) {
        if (registrationType === 'guardian' || registrationType === 'guardian-link') {
            switchToGuardianBtn.classList.add('hidden');
        } else {
            switchToGuardianBtn.classList.remove('hidden');
        }
    }
}

function hideAgeBlockMessage() {
    const container = document.getElementById('age-block-message');
    const submitBtn = document.getElementById('submit-button');

    if (container) {
        container.classList.add('hidden');
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

// Helper function to hide birthdate fields and remove required attribute
function hideBirthdateFields() {
    const birthdateFields = document.getElementById('birthdate-fields');
    if (birthdateFields) {
        birthdateFields.classList.add('hidden');
    }
    // Remove required attribute to prevent browser validation errors on hidden fields
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');
    if (daySelect) daySelect.removeAttribute('required');
    if (monthSelect) monthSelect.removeAttribute('required');
    if (yearSelect) yearSelect.removeAttribute('required');
}

// Helper function to show birthdate fields and add required attribute
function showBirthdateFields() {
    const birthdateFields = document.getElementById('birthdate-fields');
    if (birthdateFields) {
        birthdateFields.classList.remove('hidden');
    }
    // Add required attribute back
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');
    if (daySelect) daySelect.setAttribute('required', '');
    if (monthSelect) monthSelect.setAttribute('required', '');
    if (yearSelect) yearSelect.setAttribute('required', '');
}

// Helper function to show profile fields (photo at top, gender after birthdate)
function showProfileFields() {
    const photoSection = document.getElementById('profile-photo-section');
    const genderSection = document.getElementById('gender-section');
    if (photoSection) {
        photoSection.classList.remove('hidden');
    }
    if (genderSection) {
        genderSection.classList.remove('hidden');
    }
}

// Helper function to hide profile fields
function hideProfileFields() {
    const photoSection = document.getElementById('profile-photo-section');
    const genderSection = document.getElementById('gender-section');
    if (photoSection) {
        photoSection.classList.add('hidden');
    }
    if (genderSection) {
        genderSection.classList.add('hidden');
    }
}

// Helper function to show/hide sport selection
function showSportSection() {
    const sportSection = document.getElementById('sport-section');
    const sportSelect = document.getElementById('sport-select');
    if (sportSection) {
        sportSection.classList.remove('hidden');
    }
    // Add required attribute when visible
    if (sportSelect) {
        sportSelect.setAttribute('required', '');
    }
}

function hideSportSection() {
    const sportSection = document.getElementById('sport-section');
    const sportSelect = document.getElementById('sport-select');
    if (sportSection) {
        sportSection.classList.add('hidden');
    }
    // Remove required attribute to prevent browser validation errors on hidden fields
    if (sportSelect) {
        sportSelect.removeAttribute('required');
    }
}

// Load sports into dropdown
async function loadSports(preAssignedSportId = null) {
    const sportSelect = document.getElementById('sport-select');
    if (!sportSelect) return [];

    try {
        const { data: sports, error } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (error) throw error;

        if (preAssignedSportId) {
            const assignedSport = sports?.find(s => s.id === preAssignedSportId);
            if (assignedSport) {
                sportSelect.innerHTML = '';
                const option = document.createElement('option');
                option.value = assignedSport.id;
                option.textContent = assignedSport.display_name || assignedSport.name;
                option.selected = true;
                sportSelect.appendChild(option);
                sportSelect.disabled = true;
                console.log('[REGISTER] Sport pre-assigned:', assignedSport.display_name);
                return sports;
            }
        }

        sportSelect.innerHTML = '<option value="">Sportart wählen...</option>';
        sports?.forEach(sport => {
            const option = document.createElement('option');
            option.value = sport.id;
            option.textContent = sport.display_name || sport.name;
            sportSelect.appendChild(option);
        });

        // Auto-select if only one sport exists
        if (sports?.length === 1) {
            sportSelect.value = sports[0].id;
        }

        return sports || [];
    } catch (error) {
        console.error('[REGISTER] Error loading sports:', error);
        return [];
    }
}

// Prefill form with existing player data (for offline player migration)
function prefillFormWithPlayerData() {
    // Use linkedPlayerData if available, otherwise fall back to invitationCodeData
    const data = linkedPlayerData || invitationCodeData;
    if (!data) return;

    console.log('[REGISTER] Prefilling form with player data:', data);

    // Prefill birthdate if available
    if (data.birthdate) {
        const dateParts = data.birthdate.split('-');
        if (dateParts.length === 3) {
            const yearSelect = document.getElementById('birthdate-year');
            const monthSelect = document.getElementById('birthdate-month');
            const daySelect = document.getElementById('birthdate-day');
            if (yearSelect) yearSelect.value = dateParts[0];
            if (monthSelect) monthSelect.value = parseInt(dateParts[1], 10);
            if (daySelect) daySelect.value = parseInt(dateParts[2], 10);
        }
    }

    // Prefill gender if available
    if (data.gender) {
        const genderSelect = document.getElementById('gender-select');
        if (genderSelect) genderSelect.value = data.gender;
    }
}

// Profile photo preview
const profilePhotoUpload = document.getElementById('profile-photo-upload');
const profilePhotoPreview = document.getElementById('profile-photo-preview');
let selectedProfilePhoto = null;

if (profilePhotoUpload && profilePhotoPreview) {
    profilePhotoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedProfilePhoto = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                profilePhotoPreview.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

// Initialize on page load
initBirthdateDropdowns();
initVerifyBirthdateDropdowns();

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

        // Check if this code is linked to an offline player
        console.log('[REGISTER] Code data:', JSON.stringify(codeData, null, 2));
        console.log('[REGISTER] player_id in code:', codeData.player_id);

        if (codeData.player_id) {
            // Fetch the player's data (use maybeSingle to handle missing player)
            const { data: playerData, error: playerError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, birthdate, gender')
                .eq('id', codeData.player_id)
                .maybeSingle();

            console.log('[REGISTER] Player data from DB:', JSON.stringify(playerData, null, 2));

            if (playerError) {
                console.error('[REGISTER] Error fetching linked player:', playerError);
            } else if (playerData) {
                linkedPlayerId = playerData.id;
                linkedPlayerBirthdate = playerData.birthdate || null;
                linkedPlayerData = playerData; // Store full player data for prefilling

                const age = playerData.birthdate ? calculateAge(playerData.birthdate) : null;
                console.log('[REGISTER] Calculated age:', age, 'from birthdate:', playerData.birthdate);
                console.log('[REGISTER] Age check: age !== null =', age !== null, ', age < 16 =', age < 16);

                loader.classList.add('hidden');

                // If player is under 16, go DIRECTLY to guardian registration (skip role selection)
                if (age !== null && age < 16) {
                    console.log('[REGISTER] ✅ Player is under 16 - going directly to guardian registration');
                    registrationType = 'guardian-link';

                    // Show name fields for guardian
                    const nameFields = document.getElementById('name-fields');
                    if (nameFields) {
                        nameFields.classList.remove('hidden');
                        document.getElementById('first-name').required = true;
                        document.getElementById('last-name').required = true;
                    }

                    // Show birthdate fields - guardian must be at least 18
                    showBirthdateFields();
                    // Show profile fields (photo, gender)
                    showProfileFields();

                    formSubtitle.textContent = `${playerData.first_name} ist ${age} Jahre alt. Erstelle deinen Vormund-Account (mind. 18 Jahre).`;
                    registrationFormContainer.classList.remove('hidden');
                    return;
                }

                // If player is 16+ OR age unknown, show role selection modal
                console.log('[REGISTER] ⚠️ Player is 16+ or age unknown - showing role selection modal');
                showRoleSelectionModal(age, playerData.first_name);
                return;
            } else {
                console.warn('[REGISTER] Linked player not found (may have been deleted):', codeData.player_id);
                // Player profile doesn't exist, but code has all the data to create one
                // Use the birthdate from the code to check age
                if (codeData.birthdate) {
                    const age = calculateAge(codeData.birthdate);
                    console.log('[REGISTER] Using birthdate from code:', codeData.birthdate, 'age:', age);

                    if (age !== null && age < 16) {
                        console.log('[REGISTER] ✅ Player is under 16 (from code) - going directly to guardian registration');
                        // Store the code's player_id - we'll create the child profile during registration
                        linkedPlayerId = codeData.player_id;
                        linkedPlayerBirthdate = codeData.birthdate;
                        registrationType = 'guardian-link';

                        // Show name fields for guardian
                        const nameFields = document.getElementById('name-fields');
                        if (nameFields) {
                            nameFields.classList.remove('hidden');
                            document.getElementById('first-name').required = true;
                            document.getElementById('last-name').required = true;
                        }

                        // Show birthdate fields - guardian must be at least 18
                        showBirthdateFields();
                        // Show guardian profile fields (photo, gender)
                        showProfileFields();

                        loader.classList.add('hidden');
                        formSubtitle.textContent = `${codeData.first_name} ist ${age} Jahre alt. Erstelle deinen Vormund-Account (mind. 18 Jahre).`;
                        registrationFormContainer.classList.remove('hidden');
                        return;
                    }
                }
            }
        }

        // Normal flow - no linked player (general club invitation code)
        registrationType = 'code';
        formSubtitle.textContent = 'Willkommen! Vervollständige deine Registrierung.';
        loader.classList.add('hidden');
        // Show birthdate fields for age verification
        showBirthdateFields();
        // Show profile fields (photo, gender) - sport comes from invitation code
        showProfileFields();
        // Prefill form with data from invitation code (if available)
        prefillFormWithPlayerData();
        registrationFormContainer.classList.remove('hidden');

    } catch (error) {
        console.error('[REGISTER-SUPABASE] Init error:', error);
        displayError('Fehler beim Überprüfen der Einladung.');
    }
}

initializeRegistration();

const registerWithoutCodeBtn = document.getElementById('register-without-code-btn');
if (registerWithoutCodeBtn) {
    registerWithoutCodeBtn.addEventListener('click', async () => {
        registrationType = 'no-code';

        tokenRequiredMessageContainer?.classList.add('hidden');
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

        // Show name fields
        const nameFields = document.getElementById('name-fields');
        if (nameFields) {
            nameFields.classList.remove('hidden');
            document.getElementById('first-name').required = true;
            document.getElementById('last-name').required = true;
        }

        // Show birthdate fields (required for age verification)
        showBirthdateFields();

        // Show profile fields (photo, gender) and sport selection for no-code registration
        showProfileFields();
        showSportSection();
        await loadSports();

        formSubtitle.textContent = 'Erstelle deinen Account und trete später einem Verein bei.';
    });
}

// Guardian registration button
const registerAsGuardianBtn = document.getElementById('register-as-guardian-btn');
if (registerAsGuardianBtn) {
    registerAsGuardianBtn.addEventListener('click', async () => {
        registrationType = 'guardian';

        tokenRequiredMessageContainer?.classList.add('hidden');
        loader.classList.add('hidden');
        registrationFormContainer.classList.remove('hidden');

        // Show name fields
        const nameFields = document.getElementById('name-fields');
        if (nameFields) {
            nameFields.classList.remove('hidden');
            document.getElementById('first-name').required = true;
            document.getElementById('last-name').required = true;
        }

        // Show birthdate fields - guardian must be at least 18
        showBirthdateFields();
        // Show profile fields (photo, gender)
        showProfileFields();

        // Hide age block message if visible
        hideAgeBlockMessage();

        formSubtitle.textContent = 'Erstelle deinen Vormund-Account. Du musst mindestens 18 Jahre alt sein.';
    });
}

// Switch to guardian button (from age block message)
const switchToGuardianBtn = document.getElementById('switch-to-guardian-btn');
if (switchToGuardianBtn) {
    switchToGuardianBtn.addEventListener('click', () => {
        // Reset and switch to guardian mode
        registrationType = 'guardian';

        // Show birthdate fields - guardian must be at least 18
        showBirthdateFields();
        // Show guardian profile fields (photo, gender)
        showProfileFields();

        // Hide age block message
        hideAgeBlockMessage();

        formSubtitle.textContent = 'Erstelle deinen Vormund-Account. Du musst mindestens 18 Jahre alt sein.';
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

    // Get birthdate if visible
    let birthdate = null;
    const birthdateFields = document.getElementById('birthdate-fields');
    if (birthdateFields && !birthdateFields.classList.contains('hidden')) {
        const day = document.getElementById('birthdate-day')?.value;
        const month = document.getElementById('birthdate-month')?.value;
        const year = document.getElementById('birthdate-year')?.value;

        // Birthdate is required when fields are visible
        if (!day || !month || !year) {
            errorMessage.textContent = 'Bitte gib dein vollständiges Geburtsdatum ein.';
            return;
        }

        birthdate = parseBirthdate(day, month, year);

        // Validate age based on registration type
        if (birthdate) {
            if (registrationType === 'guardian' || registrationType === 'guardian-link') {
                // Guardian must be at least 18 years old
                const validation = validateGuardianAge(birthdate);
                if (!validation.allowed) {
                    errorMessage.textContent = validation.reason;
                    return;
                }
            } else {
                // Regular player registration - must be 16+
                const hasCode = !!invitationCode;
                const validation = validateRegistrationAge(birthdate, hasCode);
                if (!validation.allowed) {
                    errorMessage.textContent = validation.reason;
                    return;
                }
            }
        }
    }

    if (password !== passwordConfirm) {
        errorMessage.textContent = 'Die Passwörter stimmen nicht überein.';
        return;
    }

    if (!consentStudy || !consentPrivacy) {
        errorMessage.textContent = 'Du musst der Studie und der Datenschutzerklärung zustimmen.';
        return;
    }

    // Block if age validation failed
    if (isAgeBlocked) {
        errorMessage.textContent = 'Bitte korrigiere dein Geburtsdatum oder registriere dich als Vormund.';
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
            // Normal code registration: use child's data from invitation code
            firstName = invitationCodeData.first_name || '';
            lastName = invitationCodeData.last_name || '';
        } else if (registrationType === 'no-code' || registrationType === 'guardian' || registrationType === 'guardian-link') {
            // No-code, guardian, and guardian-link: use data from form fields
            firstName = document.getElementById('first-name')?.value?.trim() || '';
            lastName = document.getElementById('last-name')?.value?.trim() || '';
        }

        // 1. User in Supabase Auth erstellen
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/dashboard.html`,
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
            profileUpdates.is_player = true; // This is a player registration

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
                    // But always set is_player for code registrations
                    profileUpdates.is_player = true;
                    profileUpdates.onboarding_complete = true; // Skip onboarding
                    // And if user entered birthdate (because offline player had none), save it
                    if (birthdate) {
                        profileUpdates.birthdate = birthdate;
                    }
                    // Add gender from form if selected
                    const migratedGender = document.getElementById('gender-select')?.value;
                    if (migratedGender) {
                        profileUpdates.gender = migratedGender;
                    }
                } else {
                    console.warn('[REGISTER] Unexpected migration result:', migrationResult);
                }
            } else {
                // User-entered birthdate takes priority over invitation code birthdate
                if (birthdate) {
                    profileUpdates.birthdate = birthdate;
                } else if (invitationCodeData.birthdate) {
                    profileUpdates.birthdate = invitationCodeData.birthdate;
                }
                // User-selected gender takes priority over invitation code gender
                const formGender = document.getElementById('gender-select')?.value;
                if (formGender) {
                    profileUpdates.gender = formGender;
                } else if (invitationCodeData.gender) {
                    profileUpdates.gender = invitationCodeData.gender;
                }
                // Neuer Spieler via Code (inkl. head_coach) - setze Standard-Werte
                profileUpdates.is_match_ready = true;
                profileUpdates.elo_rating = 800;
                profileUpdates.highest_elo = 800;
                profileUpdates.grundlagen_completed = 5;
                profileUpdates.onboarding_complete = true; // Skip onboarding
                profileUpdates.xp = 50; // Grant XP for completing registration
                // Default privacy settings
                profileUpdates.privacy_settings = {
                    profile_visibility: 'global',
                    searchable: 'global',
                    leaderboard_visibility: 'global',
                    matches_visibility: 'global',
                    showElo: true,
                    showInLeaderboards: true
                };
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
            profileUpdates.is_player = true; // This is a player
            profileUpdates.is_match_ready = true;
            profileUpdates.elo_rating = 800;
            profileUpdates.highest_elo = 800;
            profileUpdates.grundlagen_completed = 5;
            profileUpdates.account_type = 'standard';
            profileUpdates.onboarding_complete = true; // Skip onboarding

            // Add birthdate if provided
            if (birthdate) {
                profileUpdates.birthdate = birthdate;
                // age_mode will be calculated by trigger
            }

            // Add gender if selected
            const selectedGender = document.getElementById('gender-select')?.value;
            if (selectedGender) {
                profileUpdates.gender = selectedGender;
            }

            // Add sport if selected
            const selectedSportId = document.getElementById('sport-select')?.value;
            if (selectedSportId) {
                profileUpdates.active_sport_id = selectedSportId;
            }

            // Default privacy settings (globally visible)
            profileUpdates.privacy_settings = {
                profile_visibility: 'global',
                searchable: 'global',
                leaderboard_visibility: 'global',
                matches_visibility: 'global',
                showElo: true,
                showInLeaderboards: true
            };

            // Grant 50 XP for completing registration
            profileUpdates.xp = 50;

            console.log('[REGISTER] Setting is_match_ready=true for self-registration (no-code)');
        }

        // Guardian-Registrierung (ohne Code)
        // Pure guardians are NOT players by default - they only see guardian-dashboard
        if (registrationType === 'guardian') {
            const firstName = document.getElementById('first-name')?.value?.trim() || '';
            const lastName = document.getElementById('last-name')?.value?.trim() || '';
            profileUpdates.first_name = firstName;
            profileUpdates.last_name = lastName;
            profileUpdates.display_name = `${firstName} ${lastName}`.trim();
            profileUpdates.account_type = 'guardian';
            profileUpdates.is_guardian = true;
            profileUpdates.is_player = false; // Pure guardian - not a player
            profileUpdates.role = 'player';
            profileUpdates.is_match_ready = false; // Not a player yet
            profileUpdates.elo_rating = 800;
            profileUpdates.highest_elo = 800;

            // Add guardian's birthdate
            if (birthdate) {
                profileUpdates.birthdate = birthdate;
            }

            // Add gender
            const selectedGender = document.getElementById('gender-select')?.value;
            if (selectedGender) {
                profileUpdates.gender = selectedGender;
            }

            console.log('[REGISTER] Registering as guardian (no code)');
        }

        // Guardian-Link Registrierung (Vormund verknüpft mit bestehendem Kind via Code)
        // Pure guardians are NOT players by default - they only see guardian-dashboard
        if (registrationType === 'guardian-link') {
            const firstName = document.getElementById('first-name')?.value?.trim() || '';
            const lastName = document.getElementById('last-name')?.value?.trim() || '';
            profileUpdates.first_name = firstName;
            profileUpdates.last_name = lastName;
            profileUpdates.display_name = `${firstName} ${lastName}`.trim();
            profileUpdates.account_type = 'guardian';
            profileUpdates.is_guardian = true;
            profileUpdates.is_player = false; // Pure guardian - not a player
            profileUpdates.role = 'player';
            profileUpdates.is_match_ready = false; // Not a player yet
            profileUpdates.elo_rating = 800;
            profileUpdates.highest_elo = 800;

            // Add guardian's birthdate
            if (birthdate) {
                profileUpdates.birthdate = birthdate;
            }

            // Add gender
            const selectedGender = document.getElementById('gender-select')?.value;
            if (selectedGender) {
                profileUpdates.gender = selectedGender;
            }

            // Join the same club as the child
            if (invitationCodeData?.club_id) {
                profileUpdates.club_id = invitationCodeData.club_id;
            }
            if (invitationCodeData?.sport_id) {
                profileUpdates.active_sport_id = invitationCodeData.sport_id;
            }

            // Mark onboarding as complete since we collected all data during registration
            profileUpdates.onboarding_complete = true;

            console.log('[REGISTER] Registering as guardian linked to child:', linkedPlayerId);
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
        if ((registrationType === 'code' || registrationType === 'guardian-link') && invitationCodeData) {
            await supabase
                .from('invitation_codes')
                .update({ use_count: (invitationCodeData.use_count || 0) + 1 })
                .eq('id', invitationCodeData.id);

            // No longer needed - onboarding is skipped, all data collected during registration
        }

        // 4. Guardian-Link erstellen (wenn Vormund sich für bestehendes Kind registriert)
        if (registrationType === 'guardian-link' && linkedPlayerId && invitationCodeData) {
            console.log('[REGISTER] Setting up guardian link for child:', linkedPlayerId);

            // Check if child profile exists (offline player)
            const { data: existingChild, error: checkError } = await supabase
                .from('profiles')
                .select('id, is_offline, account_type')
                .eq('id', linkedPlayerId)
                .maybeSingle();

            console.log('[REGISTER] Existing child check:', existingChild, 'error:', checkError);

            if (existingChild) {
                // Child profile exists - update it to mark as non-offline and set account_type
                console.log('[REGISTER] Child profile exists, updating to account_type=child, is_offline=false');

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        account_type: 'child',
                        is_offline: false
                    })
                    .eq('id', linkedPlayerId);

                if (updateError) {
                    console.error('[REGISTER] Failed to update child profile:', updateError);
                } else {
                    console.log('[REGISTER] Child profile updated successfully');
                }
            } else {
                // Child profile doesn't exist - create it using data from invitation code
                console.log('[REGISTER] Child profile does not exist, creating it...');

                const childProfileData = {
                    id: linkedPlayerId,
                    first_name: invitationCodeData.first_name,
                    last_name: invitationCodeData.last_name,
                    display_name: `${invitationCodeData.first_name} ${invitationCodeData.last_name}`.trim(),
                    birthdate: invitationCodeData.birthdate,
                    gender: invitationCodeData.gender,
                    club_id: invitationCodeData.club_id,
                    active_sport_id: invitationCodeData.sport_id,
                    account_type: 'child',
                    role: 'player',
                    is_offline: false,
                    elo_rating: 800,
                    highest_elo: 800,
                    xp: 0,
                    points: 0
                };

                const { error: createError } = await supabase
                    .from('profiles')
                    .insert(childProfileData);

                if (createError) {
                    console.error('[REGISTER] Failed to create child profile:', createError);
                } else {
                    console.log('[REGISTER] Child profile created successfully');
                }
            }

            // Now create the guardian link
            const { data: linkResult, error: linkError } = await supabase.rpc('link_guardian_to_child', {
                p_child_id: linkedPlayerId,
                p_child_birthdate: linkedPlayerBirthdate
            });

            if (linkError) {
                console.error('[REGISTER] Failed to create guardian link:', linkError);
                // Non-critical - continue anyway, link can be created later
            } else if (linkResult && linkResult.success) {
                console.log('[REGISTER] Guardian link created successfully');
            } else {
                console.warn('[REGISTER] Guardian link result:', linkResult);
            }
        }

        // Upload profile photo if selected (for all registration types)
        if (selectedProfilePhoto && user) {
            try {
                console.log('[REGISTER] Uploading profile photo...');
                const fileExt = selectedProfilePhoto.name.split('.').pop();
                const fileName = `${user.id}/profile.${fileExt}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('profile-pictures')
                    .upload(fileName, selectedProfilePhoto, { upsert: true });

                if (uploadError) {
                    console.error('[REGISTER] Photo upload error:', uploadError);
                } else {
                    // Get public URL and update profile
                    const { data: urlData } = supabase.storage
                        .from('profile-pictures')
                        .getPublicUrl(fileName);

                    if (urlData?.publicUrl) {
                        await supabase
                            .from('profiles')
                            .update({ avatar_url: urlData.publicUrl })
                            .eq('id', user.id);
                        console.log('[REGISTER] Profile photo uploaded successfully');
                    }
                }
            } catch (photoError) {
                console.error('[REGISTER] Photo upload failed:', photoError);
                // Non-critical - continue with redirect
            }
        }

        console.log('[REGISTER-SUPABASE] Registration complete, redirecting...');

        // Redirect based on registration type and role
        if (registrationType === 'guardian') {
            // Guardians (no code) go to guardian onboarding to create child profile
            window.location.href = '/guardian-onboarding.html';
        } else if (registrationType === 'guardian-link') {
            // Guardian-link: all data collected, go directly to guardian dashboard (pure guardian)
            window.location.href = '/guardian-dashboard.html';
        } else {
            // Both no-code and code registrations: all data collected, go to appropriate dashboard
            const role = invitationCodeData?.role || 'player';
            if (role === 'admin') {
                window.location.href = '/admin.html';
            } else if (role === 'coach' || role === 'head_coach') {
                window.location.href = '/coach.html';
            } else {
                window.location.href = '/dashboard.html';
            }
        }

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

// =====================================================
// Role Selection Modal Functions (for minor players)
// =====================================================

// Show role selection modal for offline player codes
function showRoleSelectionModal(age, playerName) {
    const infoText = document.getElementById('role-selection-info');

    // Make sure registration form is hidden when showing modal
    registrationFormContainer?.classList.add('hidden');
    tokenRequiredMessageContainer?.classList.add('hidden');

    // Under 16: Only guardian can register - hide player option completely
    if (age !== null && age < 16) {
        if (infoText) {
            infoText.textContent = `${playerName} ist ${age} Jahre alt. Da ${playerName} unter 16 ist, muss sich ein Elternteil oder Vormund registrieren.`;
        }
        // Hide the "I am the player" option completely
        roleSelectPlayer?.classList.add('hidden');
        roleAgeBlock?.classList.remove('hidden');
    } else if (age === null) {
        // Age unknown - show both options but will validate during registration
        if (infoText) {
            infoText.textContent = `Der Einladungscode ist für ${playerName}.`;
        }
        roleSelectPlayer?.classList.remove('hidden', 'opacity-50', 'cursor-not-allowed');
        roleAgeBlock?.classList.add('hidden');
    } else {
        // 16+ - player can register themselves
        if (infoText) {
            infoText.textContent = `Der Einladungscode ist für ${playerName} (${age} Jahre).`;
        }
        roleSelectPlayer?.classList.remove('hidden', 'opacity-50', 'cursor-not-allowed');
        roleAgeBlock?.classList.add('hidden');
    }

    roleSelectionModal?.classList.remove('hidden');
}

// Hide role selection modal
function hideRoleSelectionModal() {
    roleSelectionModal?.classList.add('hidden');
}

// Role selection: Player selected themselves (only possible for 16+)
roleSelectPlayer?.addEventListener('click', () => {
    // Double-check age - block if under 16 (button should already be hidden)
    if (linkedPlayerBirthdate) {
        const age = calculateAge(linkedPlayerBirthdate);
        if (age < 16) {
            // Can't self-register under 16 - need guardian
            return;
        }
        // Age is 16+ and known - proceed with registration
        hideRoleSelectionModal();
        registrationType = 'code';
        formSubtitle.textContent = 'Willkommen! Vervollständige deine Registrierung.';
        hideBirthdateFields();
        showProfileFields();
        prefillFormWithPlayerData();
        registrationFormContainer.classList.remove('hidden');
    } else {
        // Birthdate unknown - need to ask and validate
        hideRoleSelectionModal();
        registrationType = 'code';
        formSubtitle.textContent = 'Bitte gib dein Geburtsdatum an, um fortzufahren.';
        showBirthdateFields();
        showProfileFields();
        prefillFormWithPlayerData();
        registrationFormContainer.classList.remove('hidden');
    }
});

/// Role selection: Guardian selected
roleSelectGuardian?.addEventListener('click', () => {
    // Hide role modal, show guardian verification modal
    hideRoleSelectionModal();
    showGuardianVerifyModal();
});

// =====================================================
// Guardian Verification Modal Functions
// =====================================================

// Show guardian birthdate verification modal
function showGuardianVerifyModal() {
    // Reset the form
    document.getElementById('verify-birthdate-day').value = '';
    document.getElementById('verify-birthdate-month').value = '';
    document.getElementById('verify-birthdate-year').value = '';
    verifyError?.classList.add('hidden');

    guardianVerifyModal?.classList.remove('hidden');
}

// Hide guardian verification modal
function hideGuardianVerifyModal() {
    guardianVerifyModal?.classList.add('hidden');
}

// Back button in verification modal
verifyBackBtn?.addEventListener('click', () => {
    hideGuardianVerifyModal();
    // Re-show role selection if we came from there
    if (linkedPlayerId) {
        const age = calculateAge(linkedPlayerBirthdate);
        const playerName = invitationCodeData?.first_name || 'das Kind';
        showRoleSelectionModal(age, playerName);
    }
});

// Verify birthdate button
verifyBirthdateBtn?.addEventListener('click', () => {
    const day = document.getElementById('verify-birthdate-day')?.value;
    const month = document.getElementById('verify-birthdate-month')?.value;
    const year = document.getElementById('verify-birthdate-year')?.value;

    // Validate inputs
    if (!day || !month || !year) {
        showVerifyError('Bitte gib das vollständige Geburtsdatum ein.');
        return;
    }

    // Parse entered birthdate
    const enteredBirthdate = parseBirthdate(day, month, year);
    if (!enteredBirthdate) {
        showVerifyError('Ungültiges Datum.');
        return;
    }

    // Compare with stored birthdate
    const storedDate = new Date(linkedPlayerBirthdate);
    const enteredDate = new Date(enteredBirthdate);

    // Compare dates (ignoring time)
    const storedDateStr = storedDate.toISOString().split('T')[0];
    const enteredDateStr = enteredDate.toISOString().split('T')[0];

    console.log('[REGISTER] Comparing birthdates:', enteredDateStr, 'vs', storedDateStr);

    if (enteredDateStr !== storedDateStr) {
        showVerifyError('Das Geburtsdatum stimmt nicht mit den Daten des Kindes überein.');
        return;
    }

    // Birthdate matches! Proceed with guardian registration
    console.log('[REGISTER] Birthdate verified! Proceeding with guardian registration.');
    hideGuardianVerifyModal();

    // Set registration type to guardian-link (guardian linking to existing child)
    registrationType = 'guardian-link';

    // Show registration form with guardian settings
    const nameFields = document.getElementById('name-fields');
    if (nameFields) {
        nameFields.classList.remove('hidden');
        document.getElementById('first-name').required = true;
        document.getElementById('last-name').required = true;
    }

    // Show birthdate fields - guardian must be at least 18
    showBirthdateFields();
    // Show guardian profile fields (photo, gender)
    showProfileFields();

    formSubtitle.textContent = `Erstelle deinen Vormund-Account für ${invitationCodeData?.first_name || 'dein Kind'}. Du musst mindestens 18 Jahre alt sein.`;
    registrationFormContainer.classList.remove('hidden');
});

// Show error in verification modal
function showVerifyError(message) {
    if (verifyErrorText) verifyErrorText.textContent = message;
    verifyError?.classList.remove('hidden');
}

// Hide error in verification modal
function hideVerifyError() {
    verifyError?.classList.add('hidden');
}

console.log('[REGISTER-SUPABASE] Setup complete');
