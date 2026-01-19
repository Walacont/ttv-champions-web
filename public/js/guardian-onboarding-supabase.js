/**
 * Guardian Onboarding - Add child profile
 * Two flows:
 * 1. With trainer code: Link to existing offline player
 * 2. Without code: Create new child profile manually
 */

import { getSupabase } from './supabase-init.js';
import { calculateAge, parseBirthdate } from './age-utils.js';

console.log('[GUARDIAN-ONBOARDING] Script starting...');

const supabase = getSupabase();

// State
let currentStep = 'code-question';
let validatedChild = null; // Child data from trainer code
let createdChildId = null;
let childName = '';

// DOM Elements
const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');

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

        // Check if user is a guardian
        const { data: profile } = await supabase
            .from('profiles')
            .select('account_type, is_guardian')
            .eq('id', user.id)
            .single();

        if (profile && !profile.is_guardian && profile.account_type !== 'guardian' && profile.account_type !== 'standard') {
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

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Init error:', err);
        pageLoader.innerHTML = `
            <div class="text-center text-red-600 p-6">
                <p>Fehler beim Laden. Bitte versuche es erneut.</p>
                <a href="/guardian-dashboard.html" class="text-indigo-600 underline mt-2 block">Zurück</a>
            </div>
        `;
    }
}

// Initialize birthdate dropdowns
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

// Update age display
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

    // Validate age (must be under 16)
    if (age >= 16) {
        ageError?.classList.remove('hidden');
        if (ageErrorText) {
            ageErrorText.textContent = 'Kinder ab 16 Jahren können sich selbst registrieren.';
        }
    } else {
        ageError?.classList.add('hidden');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Step 1: Code question buttons
    document.getElementById('btn-has-code')?.addEventListener('click', () => {
        goToStep('enter-code');
    });

    document.getElementById('btn-no-code')?.addEventListener('click', () => {
        goToStep('child-data');
    });

    // Step: Enter code
    document.getElementById('btn-code-back')?.addEventListener('click', () => {
        goToStep('code-question');
        resetCodeInput();
    });

    document.getElementById('btn-link-child')?.addEventListener('click', handleLinkChild);

    // Trainer code input - validate on input
    const trainerCodeInput = document.getElementById('trainer-code');
    trainerCodeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (e.target.value.length === 6) {
            validateTrainerCode(e.target.value);
        } else {
            resetCodeValidation();
        }
    });

    // Step: Child data form
    document.getElementById('btn-data-back')?.addEventListener('click', () => {
        goToStep('code-question');
    });

    document.getElementById('child-data-form')?.addEventListener('submit', handleCreateChild);

    // Step: Success
    document.getElementById('copy-login-code')?.addEventListener('click', copyLoginCode);
    document.getElementById('generate-new-code')?.addEventListener('click', generateNewCode);
    document.getElementById('add-another-child')?.addEventListener('click', resetForm);
}

// Validate trainer code (child_login_codes)
async function validateTrainerCode(code) {
    const messageEl = document.getElementById('trainer-code-message');
    const previewEl = document.getElementById('child-preview');
    const linkBtn = document.getElementById('btn-link-child');

    showMessage(messageEl, 'Überprüfe Code...', 'text-gray-500');

    try {
        // Use the validate_child_login_code RPC function
        const { data, error } = await supabase.rpc('validate_child_login_code', {
            p_code: code
        });

        if (error) {
            throw error;
        }

        if (!data.valid) {
            showMessage(messageEl, data.error || 'Ungültiger Code', 'text-red-600');
            previewEl?.classList.add('hidden');
            linkBtn.disabled = true;
            validatedChild = null;
            return;
        }

        // Code is valid - show child preview
        validatedChild = data.child;
        showMessage(messageEl, 'Code gültig!', 'text-green-600');

        // Update preview
        const avatarEl = document.getElementById('preview-avatar');
        const nameEl = document.getElementById('preview-name');
        const infoEl = document.getElementById('preview-info');

        if (avatarEl) {
            avatarEl.textContent = (validatedChild.first_name || '?')[0].toUpperCase();
        }
        if (nameEl) {
            nameEl.textContent = `${validatedChild.first_name || ''} ${validatedChild.last_name || ''}`.trim();
        }
        if (infoEl) {
            const age = validatedChild.birthdate ? calculateAge(validatedChild.birthdate) : '?';
            infoEl.textContent = `${age} Jahre`;
        }

        previewEl?.classList.remove('hidden');
        linkBtn.disabled = false;

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Code validation error:', err);
        showMessage(messageEl, 'Fehler bei der Überprüfung', 'text-red-600');
        previewEl?.classList.add('hidden');
        linkBtn.disabled = true;
        validatedChild = null;
    }
}

function resetCodeValidation() {
    const messageEl = document.getElementById('trainer-code-message');
    const previewEl = document.getElementById('child-preview');
    const linkBtn = document.getElementById('btn-link-child');

    messageEl?.classList.add('hidden');
    previewEl?.classList.add('hidden');
    linkBtn.disabled = true;
    validatedChild = null;
}

function resetCodeInput() {
    const codeInput = document.getElementById('trainer-code');
    if (codeInput) codeInput.value = '';
    resetCodeValidation();
}

// Handle linking child via trainer code
async function handleLinkChild() {
    if (!validatedChild) return;

    const linkBtn = document.getElementById('btn-link-child');
    linkBtn.disabled = true;
    linkBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Verknüpfe...';

    try {
        const code = document.getElementById('trainer-code')?.value?.trim();

        // Use the RPC to link guardian to child using the code
        const { data, error } = await supabase.rpc('link_guardian_via_code', {
            p_code: code
        });

        if (error) {
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error || 'Fehler beim Verknüpfen');
        }

        // Success!
        createdChildId = data.child_id;
        childName = `${validatedChild.first_name || ''} ${validatedChild.last_name || ''}`.trim();

        // Generate login code for the child
        await generateLoginCode();

        // Update success screen
        document.getElementById('created-child-name').textContent = childName;

        goToStep('success');

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Link error:', err);
        alert('Fehler beim Verknüpfen: ' + err.message);
    } finally {
        linkBtn.disabled = false;
        linkBtn.innerHTML = 'Kind verknüpfen <i class="fas fa-link ml-1"></i>';
    }
}

// Handle creating child manually
async function handleCreateChild(e) {
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

    const createBtn = document.getElementById('btn-create-child');
    createBtn.disabled = true;
    createBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Erstelle...';

    try {
        // Call create_child_profile RPC
        const { data, error } = await supabase.rpc('create_child_profile', {
            p_first_name: firstName,
            p_last_name: lastName,
            p_birthdate: birthdate,
            p_gender: gender,
            p_club_id: null,
            p_sport_id: null,
            p_subgroup_ids: []
        });

        if (error) {
            throw error;
        }

        if (!data.success) {
            throw new Error(data.error || 'Fehler beim Erstellen');
        }

        // Success!
        createdChildId = data.child_id;
        childName = `${firstName} ${lastName}`;

        // Generate login code
        await generateLoginCode();

        // Update success screen
        document.getElementById('created-child-name').textContent = childName;

        goToStep('success');

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Create error:', err);
        alert('Fehler beim Erstellen: ' + err.message);
    } finally {
        createBtn.disabled = false;
        createBtn.innerHTML = 'Kind erstellen <i class="fas fa-check ml-1"></i>';
    }
}

// Generate login code for child
async function generateLoginCode() {
    if (!createdChildId) return;

    try {
        const { data, error } = await supabase.rpc('generate_child_login_code', {
            p_child_id: createdChildId,
            p_validity_minutes: 15
        });

        if (error) throw error;

        if (!data.success) throw new Error(data.error);

        const codeEl = document.getElementById('child-login-code');
        if (codeEl) {
            codeEl.textContent = data.code;
        }

    } catch (err) {
        console.error('[GUARDIAN-ONBOARDING] Error generating code:', err);
        const codeEl = document.getElementById('child-login-code');
        if (codeEl) codeEl.textContent = 'Fehler';
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
        btn.innerHTML = '<i class="fas fa-redo mr-1"></i>Neuer Code';
    }
}

// Copy login code
async function copyLoginCode() {
    const code = document.getElementById('child-login-code')?.textContent;
    if (!code || code === '------' || code === 'Fehler') return;

    try {
        await navigator.clipboard.writeText(code);

        const btn = document.getElementById('copy-login-code');
        if (btn) {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check mr-1"></i>Kopiert!';
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
}

// Reset form to add another child
function resetForm() {
    validatedChild = null;
    createdChildId = null;
    childName = '';

    // Reset code input
    resetCodeInput();

    // Reset form fields
    const firstName = document.getElementById('child-first-name');
    const lastName = document.getElementById('child-last-name');
    const day = document.getElementById('child-birthdate-day');
    const month = document.getElementById('child-birthdate-month');
    const year = document.getElementById('child-birthdate-year');
    const gender = document.getElementById('child-gender');

    if (firstName) firstName.value = '';
    if (lastName) lastName.value = '';
    if (day) day.value = '';
    if (month) month.value = '';
    if (year) year.value = '';
    if (gender) gender.value = '';

    document.getElementById('child-age-display')?.classList.add('hidden');
    document.getElementById('age-error')?.classList.add('hidden');

    goToStep('code-question');
}

// Helper: Show message
function showMessage(el, message, colorClass) {
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden', 'text-green-600', 'text-red-600', 'text-gray-500');
    el.classList.add(colorClass);
}

// Initialize on page load
initialize();
