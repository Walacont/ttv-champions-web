/**
 * Guardian Onboarding - Create child profile
 * Handles the flow for parents to create and manage their children's profiles
 */

import { getSupabase } from './supabase-init.js';
import { calculateAge, parseBirthdate, isMinor } from './age-utils.js';

console.log('[GUARDIAN-ONBOARDING] Script starting...');

const supabase = getSupabase();

// State
let currentStep = 1;
let childData = {
    firstName: '',
    lastName: '',
    birthdate: null,
    gender: null,
    clubId: null,
    sportId: null
};
let createdChildId = null;

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const kidsInfoBox = document.getElementById('kids-mode-info');

// Initialize
async function initialize() {
    try {
        // Check if user is logged in
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
            console.log('[GUARDIAN-ONBOARDING] Not logged in, redirecting...');
            window.location.href = '/register.html';
            return;
        }

        // Check if user is a guardian (or will become one)
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, first_name')
            .eq('id', user.id)
            .single();

        if (profile && profile.account_type !== 'guardian' && profile.account_type !== 'standard') {
            console.log('[GUARDIAN-ONBOARDING] User is not a guardian');
            window.location.href = '/dashboard.html';
            return;
        }

        // Initialize UI
        initBirthdateDropdowns();
        setupEventListeners();

        // Show main content
        pageLoader.classList.add('hidden');
        mainContent.classList.remove('hidden');

        // Update greeting if we have name
        if (profile?.first_name) {
            const header = document.querySelector('h1');
            if (header) {
                header.textContent = `Willkommen, ${profile.first_name}!`;
            }
        }

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Init error:', err);
        pageLoader.innerHTML = `
            <div class="text-center text-red-600">
                <p>Fehler beim Laden. Bitte versuche es erneut.</p>
                <a href="/register.html" class="text-indigo-600 underline mt-2 block">Zur Registrierung</a>
            </div>
        `;
    }
}

// Initialize birthdate dropdowns for child
function initBirthdateDropdowns() {
    const daySelect = document.getElementById('child-birthdate-day');
    const monthSelect = document.getElementById('child-birthdate-month');
    const yearSelect = document.getElementById('child-birthdate-year');

    if (!daySelect || !monthSelect || !yearSelect) return;

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

    // Years (current year down to current year - 20)
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 20; i--) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }

    // Add change listeners
    [daySelect, monthSelect, yearSelect].forEach(select => {
        select.addEventListener('change', updateAgeDisplay);
    });
}

// Update age display when birthdate changes
function updateAgeDisplay() {
    const day = document.getElementById('child-birthdate-day')?.value;
    const month = document.getElementById('child-birthdate-month')?.value;
    const year = document.getElementById('child-birthdate-year')?.value;

    const ageDisplay = document.getElementById('child-age-display');
    const ageValue = document.getElementById('child-age-value');
    const ageError = document.getElementById('age-error');
    const ageErrorText = document.getElementById('age-error-text');

    if (!day || !month || !year) {
        ageDisplay?.classList.add('hidden');
        ageError?.classList.add('hidden');
        return;
    }

    const birthdate = parseBirthdate(day, month, year);
    if (!birthdate) {
        ageDisplay?.classList.add('hidden');
        return;
    }

    const age = calculateAge(birthdate);

    if (ageDisplay && ageValue) {
        ageValue.textContent = age;
        ageDisplay.classList.remove('hidden');
    }

    // Validate age (must be under 16 for child profile)
    if (age >= 16) {
        ageError?.classList.remove('hidden');
        if (ageErrorText) {
            ageErrorText.textContent = 'Kinder ab 16 Jahren können sich selbst registrieren. Kinder-Profile sind nur für unter 16-Jährige.';
        }
    } else {
        ageError?.classList.add('hidden');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Step 1: Child data form
    const childDataForm = document.getElementById('child-data-form');
    childDataForm?.addEventListener('submit', handleStep1Submit);

    // Step 2: Club selection
    const hasCodeOption = document.getElementById('has-code-option');
    const noClubOption = document.getElementById('no-club-option');
    const codeInputContainer = document.getElementById('code-input-container');

    document.querySelectorAll('input[name="club-option"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'code') {
                codeInputContainer?.classList.remove('hidden');
            } else {
                codeInputContainer?.classList.add('hidden');
            }
        });
    });

    document.getElementById('step-2-back')?.addEventListener('click', () => goToStep(1));
    document.getElementById('step-2-next')?.addEventListener('click', handleStep2Submit);

    // Step 3: Success actions
    document.getElementById('copy-login-code')?.addEventListener('click', copyLoginCode);
    document.getElementById('generate-new-code')?.addEventListener('click', generateNewCode);
    document.getElementById('add-another-child')?.addEventListener('click', resetForm);

    // Club code validation
    const clubCodeInput = document.getElementById('club-code');
    clubCodeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
    clubCodeInput?.addEventListener('blur', validateClubCode);
}

// Handle Step 1 submission
async function handleStep1Submit(e) {
    e.preventDefault();

    const firstName = document.getElementById('child-first-name')?.value?.trim();
    const lastName = document.getElementById('child-last-name')?.value?.trim();
    const day = document.getElementById('child-birthdate-day')?.value;
    const month = document.getElementById('child-birthdate-month')?.value;
    const year = document.getElementById('child-birthdate-year')?.value;
    const gender = document.getElementById('child-gender')?.value || null;

    // Validate
    if (!firstName || !lastName) {
        alert('Bitte gib Vor- und Nachname ein.');
        return;
    }

    if (!day || !month || !year) {
        alert('Bitte gib das Geburtsdatum ein.');
        return;
    }

    const birthdate = parseBirthdate(day, month, year);
    const age = calculateAge(birthdate);

    if (age >= 16) {
        alert('Kinder ab 16 Jahren können sich selbst registrieren.');
        return;
    }

    // Store data
    childData = {
        ...childData,
        firstName,
        lastName,
        birthdate,
        gender
    };

    // Go to step 2
    goToStep(2);
}

// Handle Step 2 submission (create child profile)
async function handleStep2Submit() {
    const clubOption = document.querySelector('input[name="club-option"]:checked')?.value;
    const clubCode = document.getElementById('club-code')?.value?.trim();

    const submitBtn = document.getElementById('step-2-next');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Erstelle Profil...';
    }

    try {
        let clubId = null;
        let sportId = null;

        // If using invitation code, validate and get club/sport
        if (clubOption === 'code' && clubCode) {
            const validation = await validateClubCode();
            if (!validation.valid) {
                throw new Error(validation.error || 'Ungültiger Code');
            }
            clubId = validation.clubId;
            sportId = validation.sportId;
        }

        // Call create_child_profile RPC
        const { data, error } = await supabase.rpc('create_child_profile', {
            p_first_name: childData.firstName,
            p_last_name: childData.lastName,
            p_birthdate: childData.birthdate,
            p_gender: childData.gender,
            p_club_id: clubId,
            p_sport_id: sportId,
            p_subgroup_ids: []
        });

        if (error) {
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error || 'Fehler beim Erstellen des Profils');
        }

        console.log('[GUARDIAN-ONBOARDING] Child profile created:', data);

        createdChildId = data.child_id;

        // Generate login code for child
        await generateLoginCode();

        // Update UI
        document.getElementById('created-child-name').textContent = `${childData.firstName} ${childData.lastName}`;

        // Go to success step
        goToStep(3);

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Error creating child:', err);
        alert('Fehler beim Erstellen des Profils: ' + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Kind erstellen <i class="fas fa-check ml-2"></i>';
        }
    }
}

// Validate club code
async function validateClubCode() {
    const codeInput = document.getElementById('club-code');
    const code = codeInput?.value?.trim()?.toUpperCase();
    const messageEl = document.getElementById('code-validation-message');

    if (!code) {
        return { valid: false, error: 'Bitte gib einen Code ein' };
    }

    try {
        const { data, error } = await supabase
            .from('invitation_codes')
            .select('id, club_id, sport_id, is_active, expires_at, max_uses, use_count')
            .eq('code', code)
            .single();

        if (error || !data) {
            showCodeMessage(messageEl, 'Code nicht gefunden', false);
            return { valid: false, error: 'Code nicht gefunden' };
        }

        if (!data.is_active) {
            showCodeMessage(messageEl, 'Code ist nicht mehr aktiv', false);
            return { valid: false, error: 'Code ist nicht mehr aktiv' };
        }

        if (data.expires_at && new Date(data.expires_at) < new Date()) {
            showCodeMessage(messageEl, 'Code ist abgelaufen', false);
            return { valid: false, error: 'Code ist abgelaufen' };
        }

        if (data.max_uses && data.use_count >= data.max_uses) {
            showCodeMessage(messageEl, 'Code wurde bereits verwendet', false);
            return { valid: false, error: 'Code wurde bereits verwendet' };
        }

        showCodeMessage(messageEl, 'Code gültig ✓', true);
        return {
            valid: true,
            clubId: data.club_id,
            sportId: data.sport_id
        };

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Code validation error:', err);
        showCodeMessage(messageEl, 'Fehler bei der Überprüfung', false);
        return { valid: false, error: 'Fehler bei der Überprüfung' };
    }
}

function showCodeMessage(el, message, isValid) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden', 'text-green-600', 'text-red-600');
    el.classList.add(isValid ? 'text-green-600' : 'text-red-600');
}

// Generate login code for child
async function generateLoginCode() {
    if (!createdChildId) return;

    try {
        const { data, error } = await supabase.rpc('generate_child_login_code', {
            p_child_id: createdChildId,
            p_validity_minutes: 15
        });

        if (error) {
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error);
        }

        // Display code
        const codeEl = document.getElementById('child-login-code');
        if (codeEl) {
            codeEl.textContent = data.code;
        }

        console.log('[GUARDIAN-ONBOARDING] Login code generated:', data.code);

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Error generating login code:', err);
        const codeEl = document.getElementById('child-login-code');
        if (codeEl) {
            codeEl.textContent = 'Fehler';
        }
    }
}

async function generateNewCode() {
    const btn = document.getElementById('generate-new-code');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    await generateLoginCode();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-redo mr-2"></i>Neuer Code';
    }
}

// Copy login code to clipboard
async function copyLoginCode() {
    const code = document.getElementById('child-login-code')?.textContent;
    if (!code || code === '------' || code === 'Fehler') return;

    try {
        await navigator.clipboard.writeText(code);

        const btn = document.getElementById('copy-login-code');
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
            btn.classList.add('bg-green-600');

            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('bg-green-600');
            }, 2000);
        }
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

// Navigate between steps
function goToStep(step) {
    currentStep = step;

    // Hide all steps
    document.querySelectorAll('.step-content').forEach(el => el.classList.add('hidden'));

    // Show current step
    document.getElementById(`step-${step}`)?.classList.remove('hidden');

    // Update indicators
    for (let i = 1; i <= 3; i++) {
        const indicator = document.getElementById(`step-${i}-indicator`);
        if (!indicator) continue;

        indicator.classList.remove('active', 'completed', 'bg-gray-200', 'text-gray-500');

        if (i < step) {
            indicator.classList.add('completed');
            indicator.innerHTML = '<i class="fas fa-check"></i>';
        } else if (i === step) {
            indicator.classList.add('active');
            indicator.textContent = i;
        } else {
            indicator.classList.add('bg-gray-200', 'text-gray-500');
            indicator.textContent = i;
        }
    }

    // Show info box on step 3
    if (step === 3) {
        kidsInfoBox?.classList.remove('hidden');
    } else {
        kidsInfoBox?.classList.add('hidden');
    }
}

// Reset form to add another child
function resetForm() {
    childData = {
        firstName: '',
        lastName: '',
        birthdate: null,
        gender: null,
        clubId: null,
        sportId: null
    };
    createdChildId = null;

    // Reset form fields
    document.getElementById('child-first-name').value = '';
    document.getElementById('child-last-name').value = '';
    document.getElementById('child-birthdate-day').value = '';
    document.getElementById('child-birthdate-month').value = '';
    document.getElementById('child-birthdate-year').value = '';
    document.getElementById('child-gender').value = '';
    document.getElementById('club-code').value = '';
    document.getElementById('child-age-display')?.classList.add('hidden');
    document.getElementById('age-error')?.classList.add('hidden');

    // Reset club option
    document.querySelector('input[name="club-option"][value="none"]').checked = true;
    document.getElementById('code-input-container')?.classList.add('hidden');

    goToStep(1);
}

// Initialize on page load
initialize();
