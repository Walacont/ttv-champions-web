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
const sportSelect = document.getElementById('sport-select');

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

// Load available sports for dropdown
// If preAssignedSportId is set, the sport was assigned by invitation code and cannot be changed
async function loadSports(preAssignedSportId = null) {
    try {
        const { data: sports, error } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (error) throw error;

        if (sportSelect && sports) {
            // Check if sport was pre-assigned by invitation code
            if (preAssignedSportId) {
                const assignedSport = sports.find(s => s.id === preAssignedSportId);
                if (assignedSport) {
                    // Sport was assigned - show only this option and disable dropdown
                    sportSelect.innerHTML = '';
                    const option = document.createElement('option');
                    option.value = assignedSport.id;
                    option.textContent = assignedSport.display_name || assignedSport.name;
                    option.selected = true;
                    sportSelect.appendChild(option);
                    sportSelect.disabled = true;

                    // Add info message below dropdown
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

            // Normal case - allow sport selection
            sportSelect.innerHTML = '<option value="">Sportart wählen...</option>';
            sports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = sport.display_name || sport.name;
                sportSelect.appendChild(option);
            });

            // Auto-select first sport if only one exists
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

    // Check for pending invitation data from registration
    let invitationData = null;
    try {
        const storedData = localStorage.getItem('pendingInvitationData');
        if (storedData) {
            invitationData = JSON.parse(storedData);
            console.log('[ONBOARDING-SUPABASE] Found invitation data:', invitationData);
            // Clear it after reading (one-time use)
            localStorage.removeItem('pendingInvitationData');
        }
    } catch (e) {
        console.warn('[ONBOARDING-SUPABASE] Error reading invitation data:', e);
    }

    // Fill form with existing data - prioritize invitation data over profile data
    const firstNameInput = document.getElementById('firstName');
    const lastNameInput = document.getElementById('lastName');

    // Use invitation data first, then profile data, then empty
    const firstName = invitationData?.firstName || profile.first_name || '';
    const lastName = invitationData?.lastName || profile.last_name || '';

    if (firstNameInput) firstNameInput.value = firstName;
    if (lastNameInput) lastNameInput.value = lastName;

    // Fill birthdate selects - prioritize invitation data
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

    // Fill gender select - prioritize invitation data
    const gender = invitationData?.gender || profile.gender;
    if (gender) {
        const genderSelect = document.getElementById('gender');
        if (genderSelect) genderSelect.value = gender;
    }

    // Load sports dropdown and check if sport is pre-assigned
    // Use invitation sportId first, then profile active_sport_id
    const sportId = invitationData?.sportId || profile.active_sport_id;
    await loadSports(sportId);
}

checkAuthState();

// Listen for auth state changes - only redirect on explicit sign out
onAuthStateChange((event, session) => {
    console.log('[ONBOARDING-SUPABASE] Auth state changed:', event);

    if (event === 'SIGNED_OUT') {
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

        // Get selected sport
        const selectedSportId = sportSelect?.value;
        if (!selectedSportId) {
            throw new Error('Bitte wähle eine Sportart aus.');
        }

        // Default privacy settings - all global so users are findable immediately
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

        // Check if we need to grant 50 XP for completing onboarding
        // This applies to:
        // 1. Self-registration (no code) - is_match_ready should be true
        // 2. head_coach registration with admin code - is_match_ready should be true
        // 3. Offline player migration where coach set them as match-ready
        const currentXP = currentUserData.xp || 0;
        const isMatchReady = currentUserData.is_match_ready === true;
        const shouldGrantXP = isMatchReady && currentXP === 0;

        console.log('[ONBOARDING-SUPABASE] XP check:', { isMatchReady, currentXP, shouldGrantXP, role: currentUserData.role });

        if (shouldGrantXP) {
            dataToUpdate.xp = 50;
            console.log('[ONBOARDING-SUPABASE] Granting 50 XP for completing onboarding');
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

        // Create user_sport_stats record for the selected sport
        const { error: statsError } = await supabase
            .from('user_sport_stats')
            .insert({
                user_id: currentUser.id,
                sport_id: selectedSportId
            });

        if (statsError) {
            // Log but don't fail - stats table might not exist yet
            console.warn('[ONBOARDING-SUPABASE] Could not create sport stats:', statsError);
        }

        console.log('[ONBOARDING-SUPABASE] Sport stats created for:', selectedSportId);

        // Redirect directly to dashboard
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
    } else if (role === 'coach' || role === 'head_coach') {
        targetUrl = '/coach.html';
    } else {
        targetUrl = '/dashboard.html';
    }

    console.log('[ONBOARDING-SUPABASE] Onboarding complete, redirecting to:', targetUrl);
    window.location.href = targetUrl;
}

console.log('[ONBOARDING-SUPABASE] Setup complete');
