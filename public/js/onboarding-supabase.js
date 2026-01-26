// Onboarding-Seite (Supabase-Version)
// Ersetzt onboarding.js für die Supabase-Migration

import { getSupabase, onAuthStateChange } from './supabase-init.js';

console.log('[ONBOARDING-SUPABASE] Script starting...');

const supabase = getSupabase();

const onboardingForm = document.getElementById('onboarding-form');
const submitButton = document.getElementById('submit-button');
const errorMessage = document.getElementById('error-message');
const photoUpload = document.getElementById('photo-upload');
const profileImagePreview = document.getElementById('profile-image-preview');
const sportSelect = document.getElementById('sport-select');

let currentUser = null;
let currentUserData = null;
let selectedFile = null;

function initializeDateSelects() {
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');

    if (!daySelect || !monthSelect || !yearSelect) return;

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

/**
 * Lädt verfügbare Sportarten ins Dropdown
 * @param {string|null} preAssignedSportId - Falls gesetzt: Sportart wurde per Einladungscode zugewiesen und kann nicht geändert werden
 */
async function loadSports(preAssignedSportId = null) {
    try {
        const { data: sports, error } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (error) throw error;

        if (sportSelect && sports) {
            if (preAssignedSportId) {
                const assignedSport = sports.find(s => s.id === preAssignedSportId);
                if (assignedSport) {
                    sportSelect.innerHTML = '';
                    const option = document.createElement('option');
                    option.value = assignedSport.id;
                    option.textContent = assignedSport.display_name || assignedSport.name;
                    option.selected = true;
                    sportSelect.appendChild(option);
                    sportSelect.disabled = true;

                    const sportLabel = document.querySelector('label[for="sport-select"]');
                    if (sportLabel) {
                        const infoText = document.createElement('p');
                        infoText.className = 'text-xs text-indigo-600 mt-1';
                        infoText.innerHTML = '<i class="fas fa-info-circle mr-1"></i>Diese Sportart wurde dir vom Administrator zugewiesen.';
                        sportLabel.parentNode.insertBefore(infoText, sportSelect.nextSibling);
                    }

                    console.log('[ONBOARDING-SUPABASE] Sport pre-assigned:', assignedSport.display_name);
                    return sports;
                }
            }

            sportSelect.innerHTML = '<option value="">Sportart wählen...</option>';
            sports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = sport.display_name || sport.name;
                sportSelect.appendChild(option);
            });

            // Automatisch auswählen wenn nur eine Sportart existiert
            if (sports.length === 1) {
                sportSelect.value = sports[0].id;
            }
        }

        return sports || [];
    } catch (error) {
        console.error('[ONBOARDING-SUPABASE] Error loading sports:', error);
        return [];
    }
}

async function checkAuthState() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.log('[ONBOARDING-SUPABASE] No session, redirecting to login');
        window.location.href = '/index.html';
        return;
    }

    currentUser = session.user;
    console.log('[ONBOARDING-SUPABASE] User:', currentUser.email);

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (error || !profile) {
        errorMessage.textContent = 'Fehler: Dein Profil konnte nicht gefunden werden.';
        submitButton.disabled = true;
        return;
    }

    currentUserData = profile;
    console.log('[ONBOARDING-SUPABASE] Profile:', { role: profile.role, onboarding: profile.onboarding_complete, is_guardian: profile.is_guardian });

    // Wenn Onboarding bereits abgeschlossen, direkt zum Dashboard weiterleiten
    if (profile.onboarding_complete) {
        console.log('[ONBOARDING-SUPABASE] Onboarding already complete, redirecting');
        redirectToDashboard(profile.role);
        return;
    }

    // Titel anpassen für Vormünder
    if (profile.is_guardian) {
        const title = document.querySelector('h2[data-i18n="onboarding.title"]');
        const subtitle = document.querySelector('p[data-i18n="onboarding.subtitle"]');
        if (title) title.textContent = 'Dein Vormund-Profil';
        if (subtitle) subtitle.textContent = 'Vervollständige dein eigenes Profil als Vormund.';
    }

    // Prüfe auf Einladungsdaten aus der Registrierung
    let invitationData = null;
    try {
        const storedData = localStorage.getItem('pendingInvitationData');
        if (storedData) {
            invitationData = JSON.parse(storedData);
            console.log('[ONBOARDING-SUPABASE] Found invitation data:', invitationData);
            // Nach dem Lesen entfernen (einmalige Verwendung)
            localStorage.removeItem('pendingInvitationData');
        }
    } catch (e) {
        console.warn('[ONBOARDING-SUPABASE] Error reading invitation data:', e);
    }

    // Formular mit existierenden Daten füllen - Einladungsdaten haben Priorität über Profildaten
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');

    const firstName = invitationData?.firstName || profile.first_name || '';
    const lastName = invitationData?.lastName || profile.last_name || '';

    if (firstNameInput) firstNameInput.value = firstName;
    if (lastNameInput) lastNameInput.value = lastName;

    // Geburtsdatum-Selects füllen - Einladungsdaten haben Priorität
    const birthdate = invitationData?.birthdate || profile.birthdate;
    if (birthdate) {
        const dateParts = birthdate.split('-');
        if (dateParts.length === 3) {
            const yearSelect = document.getElementById('birthdate-year');
            const monthSelect = document.getElementById('birthdate-month');
            const daySelect = document.getElementById('birthdate-day');
            if (yearSelect) yearSelect.value = dateParts[0];
            if (monthSelect) monthSelect.value = parseInt(dateParts[1], 10);
            if (daySelect) daySelect.value = parseInt(dateParts[2], 10);
        }
    }

    // Geschlecht-Select füllen - Einladungsdaten haben Priorität
    const gender = invitationData?.gender || profile.gender;
    if (gender) {
        const genderSelect = document.getElementById('gender');
        if (genderSelect) genderSelect.value = gender;
    }

    // Sportart laden - zuerst Einladungs-sportId, dann active_sport_id aus Profil
    const sportId = invitationData?.sportId || profile.active_sport_id;
    await loadSports(sportId);
}

checkAuthState();

// Nur bei explizitem Logout weiterleiten, nicht bei anderen Auth-Events
onAuthStateChange((event, session) => {
    console.log('[ONBOARDING-SUPABASE] Auth state changed:', event);

    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

photoUpload?.addEventListener('change', e => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = event => {
            profileImagePreview.src = event.target.result;
        };
        reader.readAsDataURL(selectedFile);
    }
});

onboardingForm?.addEventListener('submit', async e => {
    e.preventDefault();
    submitButton.disabled = true;
    submitButton.textContent = 'Speichern...';
    errorMessage.textContent = '';

    try {
        if (!currentUser || !currentUserData) {
            throw new Error('Benutzerdaten nicht geladen. Bitte Seite neu laden.');
        }

        let photoURL = currentUserData.avatar_url || null;

        if (selectedFile) {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${currentUser.id}/profile.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('profile-pictures')
                .upload(fileName, selectedFile, { upsert: true });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                // Ohne Foto fortfahren falls Upload fehlschlägt
            } else {
                const { data: urlData } = supabase.storage
                    .from('profile-pictures')
                    .getPublicUrl(fileName);
                photoURL = urlData.publicUrl;
            }
        }

        const day = document.getElementById('birthdate-day')?.value || '01';
        const month = document.getElementById('birthdate-month')?.value || '01';
        const year = document.getElementById('birthdate-year')?.value || '2000';

        const paddedDay = day.toString().padStart(2, '0');
        const paddedMonth = month.toString().padStart(2, '0');
        const birthdate = `${year}-${paddedMonth}-${paddedDay}`;

        const selectedSportId = sportSelect?.value;
        if (!selectedSportId) {
            throw new Error('Bitte wähle eine Sportart aus.');
        }

        // Standardmäßig global sichtbar, damit Benutzer sofort auffindbar sind
        const defaultPrivacySettings = {
            profile_visibility: 'global',
            searchable: 'global',
            leaderboard_visibility: 'global',
            matches_visibility: 'global',
            showElo: true,
            showInLeaderboards: true
        };

        const dataToUpdate = {
            first_name: document.getElementById('firstName')?.value || '',
            last_name: document.getElementById('lastName')?.value || '',
            display_name: `${document.getElementById('firstName')?.value || ''} ${document.getElementById('lastName')?.value || ''}`.trim(),
            birthdate: birthdate,
            gender: document.getElementById('gender')?.value || null,
            avatar_url: photoURL,
            active_sport_id: selectedSportId,
            privacy_settings: defaultPrivacySettings,
            onboarding_complete: true,
            is_offline: false,
            updated_at: new Date().toISOString()
        };

        // 50 XP für Onboarding-Abschluss vergeben wenn:
        // 1. Selbstregistrierung (ohne Code) - is_match_ready sollte true sein
        // 2. head_coach Registrierung mit Admin-Code - is_match_ready sollte true sein
        // 3. Offline-Spieler-Migration wo Coach sie als match-ready gesetzt hat
        const currentXP = currentUserData.xp || 0;
        const isMatchReady = currentUserData.is_match_ready === true;
        const shouldGrantXP = isMatchReady && currentXP === 0;

        console.log('[ONBOARDING-SUPABASE] XP check:', { isMatchReady, currentXP, shouldGrantXP, role: currentUserData.role });

        if (shouldGrantXP) {
            dataToUpdate.xp = 50;
            console.log('[ONBOARDING-SUPABASE] Granting 50 XP for completing onboarding');
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update(dataToUpdate)
            .eq('id', currentUser.id);

        if (updateError) {
            throw new Error('Profil konnte nicht gespeichert werden: ' + updateError.message);
        }

        console.log('[ONBOARDING-SUPABASE] Profile updated successfully');

        const { error: statsError } = await supabase
            .from('user_sport_stats')
            .insert({
                user_id: currentUser.id,
                sport_id: selectedSportId
            });

        if (statsError) {
            // Nur loggen, nicht fehlschlagen - Stats-Tabelle existiert möglicherweise noch nicht
            console.warn('[ONBOARDING-SUPABASE] Could not create sport stats:', statsError);
        }

        console.log('[ONBOARDING-SUPABASE] Sport stats created for:', selectedSportId);

        redirectToDashboard(currentUserData.role);

    } catch (error) {
        console.error('[ONBOARDING-SUPABASE] Error:', error);
        errorMessage.textContent = 'Fehler: ' + error.message;
        submitButton.disabled = false;
        submitButton.textContent = 'Profil speichern';
    }
});

function redirectToDashboard(role) {
    let targetUrl;
    if (role === 'admin') {
        targetUrl = '/admin.html';
    } else if (role === 'labeler') {
        targetUrl = '/label.html';
    } else if (role === 'coach' || role === 'head_coach') {
        targetUrl = '/coach.html';
    } else {
        targetUrl = '/dashboard.html';
    }

    console.log('[ONBOARDING-SUPABASE] Onboarding complete, redirecting to:', targetUrl);
    window.location.href = targetUrl;
}

console.log('[ONBOARDING-SUPABASE] Setup complete');
