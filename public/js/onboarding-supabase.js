// SC Champions - Onboarding Page (Supabase Version)
// Ersetzt onboarding.js für die Supabase-Migration

import { getSupabase, onAuthStateChange } from './supabase-init.js';

console.log('[ONBOARDING-SUPABASE] Script starting...');

const supabase = getSupabase();

const onboardingForm = document.getElementById('onboarding-form');
const submitButton = document.getElementById('submit-button');
const errorMessage = document.getElementById('error-message');
const photoUpload = document.getElementById('photo-upload');
const profileImagePreview = document.getElementById('profile-image-preview');

let currentUser = null;
let currentUserData = null;
let selectedFile = null;

// Initialize date select fields
function initializeDateSelects() {
    const daySelect = document.getElementById('birthdate-day');
    const monthSelect = document.getElementById('birthdate-month');
    const yearSelect = document.getElementById('birthdate-year');

    if (!daySelect || !monthSelect || !yearSelect) return;

    // Fill days (1-31)
    for (let i = 1; i <= 31; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        daySelect.appendChild(option);
    }

    // Fill months (1-12)
    for (let i = 1; i <= 12; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        monthSelect.appendChild(option);
    }

    // Fill years (1900 to current year)
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= 1900; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }
}

// Initialize the date selects when the page loads
initializeDateSelects();

// Check auth state on load
async function checkAuthState() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.log('[ONBOARDING-SUPABASE] No session, redirecting to login');
        window.location.href = '/index.html';
        return;
    }

    currentUser = session.user;
    console.log('[ONBOARDING-SUPABASE] User:', currentUser.email);

    // Get user profile from database
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
    console.log('[ONBOARDING-SUPABASE] Profile:', { role: profile.role, onboarding: profile.onboarding_complete });

    // If onboarding already complete, redirect to dashboard
    if (profile.onboarding_complete) {
        console.log('[ONBOARDING-SUPABASE] Onboarding already complete, redirecting');
        redirectToDashboard(profile.role);
        return;
    }

    // Fill form with existing data
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');

    if (firstNameInput) firstNameInput.value = profile.first_name || '';
    if (lastNameInput) lastNameInput.value = profile.last_name || '';

    // Fill birthdate selects if data exists
    if (profile.birthdate) {
        const dateParts = profile.birthdate.split('-');
        if (dateParts.length === 3) {
            const yearSelect = document.getElementById('birthdate-year');
            const monthSelect = document.getElementById('birthdate-month');
            const daySelect = document.getElementById('birthdate-day');
            if (yearSelect) yearSelect.value = dateParts[0];
            if (monthSelect) monthSelect.value = parseInt(dateParts[1], 10);
            if (daySelect) daySelect.value = parseInt(dateParts[2], 10);
        }
    }
}

checkAuthState();

// Listen for auth state changes
onAuthStateChange((event, session) => {
    console.log('[ONBOARDING-SUPABASE] Auth state changed:', event);

    if (event === 'SIGNED_OUT' || !session) {
        window.location.href = '/index.html';
    }
});

// Photo upload preview
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

// Form submission
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

        // Upload photo to Supabase Storage if selected
        if (selectedFile) {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${currentUser.id}/profile.${fileExt}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('profile-pictures')
                .upload(fileName, selectedFile, { upsert: true });

            if (uploadError) {
                console.error('Upload error:', uploadError);
                // Continue without photo if upload fails
            } else {
                const { data: urlData } = supabase.storage
                    .from('profile-pictures')
                    .getPublicUrl(fileName);
                photoURL = urlData.publicUrl;
            }
        }

        // Combine the three date select values into YYYY-MM-DD format
        const day = document.getElementById('birthdate-day')?.value || '01';
        const month = document.getElementById('birthdate-month')?.value || '01';
        const year = document.getElementById('birthdate-year')?.value || '2000';

        const paddedDay = day.toString().padStart(2, '0');
        const paddedMonth = month.toString().padStart(2, '0');
        const birthdate = `${year}-${paddedMonth}-${paddedDay}`;

        // Get QTTR points (optional)
        const qttrPointsInput = document.getElementById('qttr-points')?.value;
        const qttrPoints = qttrPointsInput ? parseInt(qttrPointsInput, 10) : null;

        const dataToUpdate = {
            first_name: document.getElementById('firstName')?.value || '',
            last_name: document.getElementById('lastName')?.value || '',
            display_name: `${document.getElementById('firstName')?.value || ''} ${document.getElementById('lastName')?.value || ''}`.trim(),
            birthdate: birthdate,
            gender: document.getElementById('gender')?.value || null,
            avatar_url: photoURL,
            onboarding_complete: true,
            is_offline: false,
            updated_at: new Date().toISOString()
        };

        // Add QTTR points if provided and calculate Elo
        if (qttrPoints !== null && qttrPoints > 0) {
            dataToUpdate.qttr_points = qttrPoints;
            const calculatedElo = Math.max(800, Math.round(qttrPoints * 0.9));
            dataToUpdate.elo_rating = calculatedElo;
            dataToUpdate.highest_elo = calculatedElo;
        }

        // Update profile
        const { error: updateError } = await supabase
            .from('profiles')
            .update(dataToUpdate)
            .eq('id', currentUser.id);

        if (updateError) {
            throw new Error('Profil konnte nicht gespeichert werden: ' + updateError.message);
        }

        console.log('[ONBOARDING-SUPABASE] Profile updated successfully');

        // Redirect to dashboard
        redirectToDashboard(currentUserData.role);

    } catch (error) {
        console.error('[ONBOARDING-SUPABASE] Error:', error);
        errorMessage.textContent = 'Fehler: ' + error.message;
        submitButton.disabled = false;
        submitButton.textContent = 'Profil speichern';
    }
});

// ===== CLUB SELECTION DIALOG =====
const clubSelectionDialog = document.getElementById('club-selection-dialog');
const hasClubBtn = document.getElementById('has-club-btn');
const noClubBtn = document.getElementById('no-club-btn');
const clubDropdownContainer = document.getElementById('club-dropdown-container');
const clubSelect = document.getElementById('club-select');
const requestClubBtn = document.getElementById('request-club-btn');
const backToChoiceBtn = document.getElementById('back-to-choice-btn');
const clubErrorMessage = document.getElementById('club-error-message');

// Load all clubs
async function loadClubs() {
    try {
        const { data: clubs, error } = await supabase
            .from('clubs')
            .select('id, name')
            .eq('is_test_club', false)
            .order('name');

        if (error) throw error;

        // Populate dropdown
        if (clubSelect) {
            clubSelect.innerHTML = '<option value="">-- Verein auswählen --</option>';
            clubs?.forEach(club => {
                const option = document.createElement('option');
                option.value = club.id;
                option.textContent = club.name;
                clubSelect.appendChild(option);
            });
        }

        return clubs || [];
    } catch (error) {
        console.error('Error loading clubs:', error);
        if (clubErrorMessage) clubErrorMessage.textContent = 'Fehler beim Laden der Vereine.';
        return [];
    }
}

// "Ja, ich bin in einem Verein"
hasClubBtn?.addEventListener('click', async () => {
    hasClubBtn.disabled = true;
    noClubBtn.disabled = true;
    if (clubErrorMessage) clubErrorMessage.textContent = '';

    await loadClubs();

    hasClubBtn.parentElement.classList.add('hidden');
    clubDropdownContainer?.classList.remove('hidden');

    hasClubBtn.disabled = false;
    noClubBtn.disabled = false;
});

// "Nein, noch nicht"
noClubBtn?.addEventListener('click', () => {
    clubSelectionDialog?.classList.add('hidden');
    redirectToDashboard(currentUserData?.role);
});

// Enable/disable request button
clubSelect?.addEventListener('change', () => {
    if (requestClubBtn) requestClubBtn.disabled = !clubSelect.value;
});

// "Beitrittsanfrage senden"
requestClubBtn?.addEventListener('click', async () => {
    const selectedClubId = clubSelect?.value;
    if (!selectedClubId) return;

    requestClubBtn.disabled = true;
    requestClubBtn.textContent = 'Sende Anfrage...';
    if (clubErrorMessage) clubErrorMessage.textContent = '';

    try {
        // Create club request
        const { error: requestError } = await supabase
            .from('club_requests')
            .insert({
                player_id: currentUser.id,
                club_id: selectedClubId,
                status: 'pending',
                player_name: `${currentUserData?.first_name || ''} ${currentUserData?.last_name || ''}`.trim(),
                player_email: currentUser.email || ''
            });

        if (requestError) throw requestError;

        // Update user's club request status
        await supabase
            .from('profiles')
            .update({
                club_request_status: 'pending',
                club_request_id: selectedClubId
            })
            .eq('id', currentUser.id);

        alert('Deine Beitrittsanfrage wurde gesendet! Ein Coach muss diese noch genehmigen.');
        clubSelectionDialog?.classList.add('hidden');
        redirectToDashboard(currentUserData?.role);

    } catch (error) {
        console.error('Error creating club request:', error);
        if (clubErrorMessage) clubErrorMessage.textContent = 'Fehler beim Senden der Anfrage.';
        requestClubBtn.disabled = false;
        requestClubBtn.textContent = 'Beitrittsanfrage senden';
    }
});

// "Zurück" button
backToChoiceBtn?.addEventListener('click', () => {
    clubDropdownContainer?.classList.add('hidden');
    hasClubBtn?.parentElement.classList.remove('hidden');
    if (clubErrorMessage) clubErrorMessage.textContent = '';
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

    console.log('[ONBOARDING-SUPABASE] Onboarding complete, redirecting to:', targetUrl);
    window.location.href = targetUrl;
}

console.log('[ONBOARDING-SUPABASE] Setup complete');
