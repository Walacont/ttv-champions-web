// Settings - Children Management (Supabase Version)

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');
const childrenList = document.getElementById('children-list');
const noChildrenState = document.getElementById('no-children');

// Login code modal elements
const loginCodeModal = document.getElementById('login-code-modal');
const loginCodeChildName = document.getElementById('login-code-child-name');
const loginCodeLoading = document.getElementById('login-code-loading');
const loginCodeDisplay = document.getElementById('login-code-display');
const loginCodeValue = document.getElementById('login-code-value');
const loginCodeValidity = document.getElementById('login-code-validity');
const loginCodeError = document.getElementById('login-code-error');
const loginCodeErrorText = document.getElementById('login-code-error-text');
const copyLoginCodeBtn = document.getElementById('copy-login-code');
const closeLoginCodeModal = document.getElementById('close-login-code-modal');

// Invite guardian modal elements
const inviteGuardianModal = document.getElementById('invite-guardian-modal');
const inviteGuardianChildName = document.getElementById('invite-guardian-child-name');
const inviteGuardianLoading = document.getElementById('invite-guardian-loading');
const inviteGuardianDisplay = document.getElementById('invite-guardian-display');
const inviteGuardianCode = document.getElementById('invite-guardian-code');
const inviteGuardianValidity = document.getElementById('invite-guardian-validity');
const inviteGuardianError = document.getElementById('invite-guardian-error');
const inviteGuardianErrorText = document.getElementById('invite-guardian-error-text');
const copyInviteCodeBtn = document.getElementById('copy-invite-code');
const closeInviteGuardianModal = document.getElementById('close-invite-guardian-modal');

// Child upgrade modal elements
const childUpgradeModal = document.getElementById('child-upgrade-modal');
const upgradeChildNameEl = document.getElementById('upgrade-child-name');
const childUpgradeForm = document.getElementById('child-upgrade-form');
const upgradeEmail = document.getElementById('upgrade-email');
const upgradeError = document.getElementById('upgrade-error');
const upgradeErrorText = document.getElementById('upgrade-error-text');
const upgradeSuccess = document.getElementById('upgrade-success');
const upgradeSuccessText = document.getElementById('upgrade-success-text');
const upgradeSubmitBtn = document.getElementById('upgrade-submit-btn');
const closeUpgradeModal = document.getElementById('close-upgrade-modal');

// Credentials modal elements (Username + PIN)
const credentialsModal = document.getElementById('credentials-modal');
const credentialsChildName = document.getElementById('credentials-child-name');
const credentialsForm = document.getElementById('credentials-form');
const credentialsUsername = document.getElementById('credentials-username');
const credentialsPin = document.getElementById('credentials-pin');
const credentialsPinConfirm = document.getElementById('credentials-pin-confirm');
const credentialsError = document.getElementById('credentials-error');
const credentialsErrorText = document.getElementById('credentials-error-text');
const credentialsSuccess = document.getElementById('credentials-success');
const credentialsSuccessText = document.getElementById('credentials-success-text');
const credentialsSubmitBtn = document.getElementById('credentials-submit-btn');
const closeCredentialsModal = document.getElementById('close-credentials-modal');
const usernameCheckStatus = document.getElementById('username-check-status');
const usernameHint = document.getElementById('username-hint');

// Add child modal elements
const addChildModal = document.getElementById('add-child-modal');
const addChildBtn = document.getElementById('add-child-btn');
const addChildModalTitle = document.getElementById('add-child-modal-title');
const addChildModalSubtitle = document.getElementById('add-child-modal-subtitle');
const addChildStepChoice = document.getElementById('add-child-step-choice');
const btnWithCode = document.getElementById('btn-with-code');
const btnManual = document.getElementById('btn-manual');
const invitationCodeInput = document.getElementById('invitation-code-input');
const validateCodeBtn = document.getElementById('validate-code-btn');
const addChildCodeError = document.getElementById('add-child-code-error');
const addChildCodeErrorText = document.getElementById('add-child-code-error-text');
const addChildStepCode = document.getElementById('add-child-step-code');
const addChildStepConfirm = document.getElementById('add-child-step-confirm');
const addChildStepSuccess = document.getElementById('add-child-step-success');
const addChildStepManual = document.getElementById('add-child-step-manual');
const childPreviewInitial = document.getElementById('child-preview-initial');
const childPreviewName = document.getElementById('child-preview-name');
const childPreviewAge = document.getElementById('child-preview-age');
const backToCodeBtn = document.getElementById('back-to-code-btn');
const backToChoiceBtn = document.getElementById('back-to-choice-btn');
const confirmLinkBtn = document.getElementById('confirm-link-btn');
const addChildConfirmError = document.getElementById('add-child-confirm-error');
const addChildConfirmErrorText = document.getElementById('add-child-confirm-error-text');
const addChildSuccessName = document.getElementById('add-child-success-name');
const addChildDoneBtn = document.getElementById('add-child-done-btn');
const closeAddChildModal = document.getElementById('close-add-child-modal');
// Manual form elements
const manualChildForm = document.getElementById('manual-child-form');
const manualFirstName = document.getElementById('manual-first-name');
const manualLastName = document.getElementById('manual-last-name');
const manualBirthdate = document.getElementById('manual-birthdate');
const manualGender = document.getElementById('manual-gender');
const manualSport = document.getElementById('manual-sport');
const manualChildError = document.getElementById('manual-child-error');
const manualChildErrorText = document.getElementById('manual-child-error-text');

// Sports data cache
let sportsData = [];

let currentUser = null;
let childrenData = [];
let upgradeChildId = null;
let credentialsChildId = null; // For credentials modal
let validatedCodeData = null; // Stores validated code information
let usernameCheckTimeout = null; // For debouncing username checks

// Initialize authentication
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;
        await loadChildren();
        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Initialize on DOMContentLoaded or immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Auth state change listener
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

/**
 * Load children from database
 */
async function loadChildren() {
    try {
        const { data, error } = await supabase.rpc('get_my_children');

        if (error) {
            console.error('Error loading children:', error);
            showNoChildren();
            return;
        }

        if (!data?.success || !data.children || data.children.length === 0) {
            showNoChildren();
            return;
        }

        childrenData = data.children;
        renderChildren(childrenData);
    } catch (error) {
        console.error('Error in loadChildren:', error);
        showNoChildren();
    }
}

/**
 * Show empty state
 */
function showNoChildren() {
    childrenList.innerHTML = '';
    noChildrenState?.classList.remove('hidden');
}

// Subtle default avatar SVG (similar to profile.html)
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

/**
 * Render children cards
 */
function renderChildren(children) {
    noChildrenState?.classList.add('hidden');

    childrenList.innerHTML = children.map(child => {
        const age = calculateAge(child.birthdate);
        const ageMode = age < 14 ? 'kids' : (age < 16 ? 'teen' : 'full');
        const ageModeLabel = ageMode === 'kids' ? 'Kind (<14)' : (ageMode === 'teen' ? 'Teen (14-15)' : 'Erwachsen');
        const ageModeColor = ageMode === 'kids' ? 'pink' : (ageMode === 'teen' ? 'purple' : 'green');
        const childId = child.id || child.child_id; // Support both formats
        const avatarUrl = child.avatar_url || DEFAULT_AVATAR;

        return `
            <div class="child-card bg-white rounded-xl shadow-md p-5 border border-gray-200">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-4">
                        <img
                            src="${avatarUrl}"
                            alt="${child.first_name}"
                            class="w-14 h-14 rounded-full object-cover border-2 border-white shadow-md bg-gray-100"
                            onerror="this.src='${DEFAULT_AVATAR}'"
                        />
                        <div>
                            <h3 class="font-semibold text-gray-900 text-lg">${child.first_name} ${child.last_name}</h3>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-sm text-gray-500">${age} Jahre</span>
                                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${ageModeColor}-100 text-${ageModeColor}-800">
                                    ${ageModeLabel}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                ${child.club_name ? `
                    <div class="mb-4 p-3 bg-gray-50 rounded-lg">
                        <div class="flex items-center text-sm text-gray-600">
                            <i class="fas fa-users text-gray-400 mr-2"></i>
                            <span>${child.club_name}</span>
                        </div>
                    </div>
                ` : ''}

                <!-- Credentials Status -->
                <div class="mb-4 p-3 ${child.username && child.has_pin ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'} rounded-lg">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center text-sm ${child.username && child.has_pin ? 'text-green-700' : 'text-yellow-700'}">
                            <i class="fas ${child.username && child.has_pin ? 'fa-check-circle' : 'fa-exclamation-triangle'} mr-2"></i>
                            ${child.username && child.has_pin
                                ? `<span>Benutzername: <strong>${child.username}</strong></span>`
                                : '<span>Zugangsdaten nicht eingerichtet</span>'
                            }
                        </div>
                        <button
                            class="setup-credentials-btn text-xs font-medium ${child.username && child.has_pin ? 'text-green-600 hover:text-green-800' : 'text-yellow-600 hover:text-yellow-800'}"
                            data-child-id="${childId}"
                            data-child-name="${child.first_name} ${child.last_name}"
                            data-child-username="${child.username || ''}"
                        >
                            <i class="fas fa-${child.username && child.has_pin ? 'edit' : 'plus'} mr-1"></i>
                            ${child.username && child.has_pin ? 'Ändern' : 'Einrichten'}
                        </button>
                    </div>
                </div>

                <div class="flex flex-wrap gap-2">
                    <button
                        class="setup-credentials-btn flex-1 bg-blue-600 text-white text-sm font-semibold py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors"
                        data-child-id="${childId}"
                        data-child-name="${child.first_name} ${child.last_name}"
                        data-child-username="${child.username || ''}"
                    >
                        <i class="fas fa-user-lock mr-1"></i>
                        Zugangsdaten
                    </button>
                    <button
                        class="generate-login-code-btn flex-1 bg-green-600 text-white text-sm font-semibold py-2 px-3 rounded-lg hover:bg-green-700 transition-colors"
                        data-child-id="${childId}"
                        data-child-name="${child.first_name}"
                    >
                        <i class="fas fa-key mr-1"></i>
                        Einmal-Code
                    </button>
                </div>

                <div class="mt-2">
                    <button
                        class="invite-guardian-btn w-full bg-purple-100 text-purple-700 text-sm font-semibold py-2 px-3 rounded-lg hover:bg-purple-200 transition-colors"
                        data-child-id="${childId}"
                        data-child-name="${child.first_name} ${child.last_name}"
                    >
                        <i class="fas fa-user-plus mr-1"></i>
                        Weiteren Vormund einladen
                    </button>
                </div>

                ${age >= 16 ? `
                    <div class="mt-3 pt-3 border-t border-gray-200">
                        <button
                            class="upgrade-child-btn w-full bg-gradient-to-r from-green-500 to-teal-500 text-white text-sm font-semibold py-2 px-3 rounded-lg hover:from-green-600 hover:to-teal-600 transition-colors"
                            data-child-id="${childId}"
                            data-child-name="${child.first_name} ${child.last_name}"
                        >
                            <i class="fas fa-graduation-cap mr-2"></i>
                            Eigenen Account erstellen (16+)
                        </button>
                    </div>
                ` : ''}

                ${child.other_guardians && child.other_guardians.length > 0 ? `
                    <div class="mt-4 pt-4 border-t border-gray-200">
                        <p class="text-xs text-gray-500 mb-2">
                            <i class="fas fa-user-shield mr-1"></i>
                            Weitere Vormünder:
                        </p>
                        <div class="flex flex-wrap gap-2">
                            ${child.other_guardians.map(g => `
                                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                                    ${g.first_name} ${g.last_name}
                                </span>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add event listeners
    document.querySelectorAll('.generate-login-code-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const childId = e.currentTarget.dataset.childId;
            const childName = e.currentTarget.dataset.childName;
            showLoginCodeModal(childId, childName);
        });
    });

    document.querySelectorAll('.invite-guardian-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const childId = e.currentTarget.dataset.childId;
            const childName = e.currentTarget.dataset.childName;
            showInviteGuardianModal(childId, childName);
        });
    });

    document.querySelectorAll('.upgrade-child-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const childId = e.currentTarget.dataset.childId;
            const childName = e.currentTarget.dataset.childName;
            showUpgradeModal(childId, childName);
        });
    });

    document.querySelectorAll('.setup-credentials-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const childId = e.currentTarget.dataset.childId;
            const childName = e.currentTarget.dataset.childName;
            const existingUsername = e.currentTarget.dataset.childUsername;
            showCredentialsModal(childId, childName, existingUsername);
        });
    });
}

/**
 * Calculate age from birthdate
 */
function calculateAge(birthdate) {
    if (!birthdate) return 0;
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// =====================================================
// Login Code Modal
// =====================================================

/**
 * Show login code modal and generate code
 */
async function showLoginCodeModal(childId, childName) {
    loginCodeChildName.textContent = `für ${childName}`;
    loginCodeLoading?.classList.remove('hidden');
    loginCodeDisplay?.classList.add('hidden');
    loginCodeError?.classList.add('hidden');
    loginCodeModal?.classList.remove('hidden');

    try {
        // Generate login code via RPC (validity 1440 minutes = 24 hours)
        const { data, error } = await supabase.rpc('generate_child_login_code', {
            p_child_id: childId,
            p_validity_minutes: 1440
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Generieren des Codes');
        }

        loginCodeValue.textContent = data.code;
        loginCodeValidity.textContent = '24 Stunden';
        loginCodeLoading?.classList.add('hidden');
        loginCodeDisplay?.classList.remove('hidden');

    } catch (error) {
        console.error('Error generating login code:', error);
        loginCodeLoading?.classList.add('hidden');
        loginCodeErrorText.textContent = error.message || 'Fehler beim Generieren des Codes';
        loginCodeError?.classList.remove('hidden');
    }
}

// Close login code modal
closeLoginCodeModal?.addEventListener('click', () => {
    loginCodeModal?.classList.add('hidden');
});

// Copy login code
copyLoginCodeBtn?.addEventListener('click', async () => {
    const code = loginCodeValue?.textContent;
    if (code) {
        try {
            await navigator.clipboard.writeText(code);
            copyLoginCodeBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
            setTimeout(() => {
                copyLoginCodeBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Code kopieren';
            }, 2000);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }
});

// =====================================================
// Invite Guardian Modal
// =====================================================

/**
 * Show invite guardian modal and generate invite code
 */
async function showInviteGuardianModal(childId, childName) {
    inviteGuardianChildName.textContent = `für ${childName}`;
    inviteGuardianLoading?.classList.remove('hidden');
    inviteGuardianDisplay?.classList.add('hidden');
    inviteGuardianError?.classList.add('hidden');
    inviteGuardianModal?.classList.remove('hidden');

    try {
        // Generate guardian invite code via RPC
        const { data, error } = await supabase.rpc('generate_guardian_invite_code', {
            p_child_id: childId,
            p_validity_minutes: 2880 // 48 hours
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Generieren des Codes');
        }

        inviteGuardianCode.textContent = data.code;
        inviteGuardianValidity.textContent = '48 Stunden';
        inviteGuardianLoading?.classList.add('hidden');
        inviteGuardianDisplay?.classList.remove('hidden');

    } catch (error) {
        console.error('Error generating guardian invite code:', error);
        inviteGuardianLoading?.classList.add('hidden');
        inviteGuardianErrorText.textContent = error.message || 'Fehler beim Generieren des Codes';
        inviteGuardianError?.classList.remove('hidden');
    }
}

// Close invite guardian modal
closeInviteGuardianModal?.addEventListener('click', () => {
    inviteGuardianModal?.classList.add('hidden');
});

// Copy invite code
copyInviteCodeBtn?.addEventListener('click', async () => {
    const code = inviteGuardianCode?.textContent;
    if (code) {
        try {
            await navigator.clipboard.writeText(code);
            copyInviteCodeBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Kopiert!';
            setTimeout(() => {
                copyInviteCodeBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Code kopieren';
            }, 2000);
        } catch (error) {
            console.error('Copy failed:', error);
        }
    }
});

// Close modals on backdrop click
loginCodeModal?.addEventListener('click', (e) => {
    if (e.target === loginCodeModal) {
        loginCodeModal.classList.add('hidden');
    }
});

inviteGuardianModal?.addEventListener('click', (e) => {
    if (e.target === inviteGuardianModal) {
        inviteGuardianModal.classList.add('hidden');
    }
});

// =====================================================
// Child Upgrade Modal (for children 16+)
// =====================================================

/**
 * Show upgrade modal
 */
function showUpgradeModal(childId, childName) {
    upgradeChildId = childId;
    if (upgradeChildNameEl) upgradeChildNameEl.textContent = `für ${childName}`;

    // Reset form
    if (upgradeEmail) upgradeEmail.value = '';
    upgradeError?.classList.add('hidden');
    upgradeSuccess?.classList.add('hidden');
    if (upgradeSubmitBtn) {
        upgradeSubmitBtn.disabled = false;
        upgradeSubmitBtn.innerHTML = '<i class="fas fa-arrow-up mr-2"></i>Upgrade starten';
    }

    childUpgradeModal?.classList.remove('hidden');
}

// Close upgrade modal
closeUpgradeModal?.addEventListener('click', () => {
    childUpgradeModal?.classList.add('hidden');
    upgradeChildId = null;
});

childUpgradeModal?.addEventListener('click', (e) => {
    if (e.target === childUpgradeModal) {
        childUpgradeModal.classList.add('hidden');
        upgradeChildId = null;
    }
});

// Handle upgrade form submission
childUpgradeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = upgradeEmail?.value?.trim();

    if (!email) {
        showUpgradeError('Bitte gib eine E-Mail-Adresse ein.');
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showUpgradeError('Bitte gib eine gültige E-Mail-Adresse ein.');
        return;
    }

    if (!upgradeChildId) {
        showUpgradeError('Kein Kind ausgewählt.');
        return;
    }

    // Disable button and show loading state
    if (upgradeSubmitBtn) {
        upgradeSubmitBtn.disabled = true;
        upgradeSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird verarbeitet...';
    }

    try {
        // Call the upgrade RPC function
        const { data, error } = await supabase.rpc('upgrade_child_account', {
            p_child_id: upgradeChildId,
            p_email: email,
            p_guardian_approval: true
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Upgrade');
        }

        // Show success message
        upgradeError?.classList.add('hidden');
        if (upgradeSuccessText) {
            upgradeSuccessText.textContent = 'Das Profil wurde für das Upgrade vorbereitet. Eine Einladungs-E-Mail wird gesendet.';
        }
        upgradeSuccess?.classList.remove('hidden');

        // Now we need to send a password reset / invite email
        // This uses Supabase's built-in invite functionality
        const { error: inviteError } = await supabase.auth.admin?.inviteUserByEmail?.(email) ||
            await supabase.auth.signInWithOtp({
                email: email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: `${window.location.origin}/complete-upgrade.html?child_id=${upgradeChildId}`
                }
            });

        if (inviteError) {
            console.warn('Could not send invite email:', inviteError);
            // Still show success as the profile was prepared
            if (upgradeSuccessText) {
                upgradeSuccessText.textContent = 'Profil vorbereitet! Bitte lass das Kind sich mit dieser E-Mail registrieren.';
            }
        }

        // Refresh children list after a short delay
        setTimeout(async () => {
            await loadChildren();
        }, 2000);

    } catch (error) {
        console.error('Upgrade error:', error);
        showUpgradeError(error.message || 'Fehler beim Upgrade. Bitte versuche es erneut.');
        if (upgradeSubmitBtn) {
            upgradeSubmitBtn.disabled = false;
            upgradeSubmitBtn.innerHTML = '<i class="fas fa-arrow-up mr-2"></i>Upgrade starten';
        }
    }
});

function showUpgradeError(message) {
    if (upgradeErrorText) upgradeErrorText.textContent = message;
    upgradeError?.classList.remove('hidden');
    upgradeSuccess?.classList.add('hidden');
}

// =====================================================
// Add Child Modal (via Invitation Code)
// =====================================================

/**
 * Show add child modal
 */
function showAddChildModal() {
    // Reset to choice step
    addChildStepChoice?.classList.remove('hidden');
    addChildStepCode?.classList.add('hidden');
    addChildStepConfirm?.classList.add('hidden');
    addChildStepSuccess?.classList.add('hidden');
    addChildStepManual?.classList.add('hidden');
    addChildCodeError?.classList.add('hidden');
    addChildConfirmError?.classList.add('hidden');
    manualChildError?.classList.add('hidden');
    if (invitationCodeInput) invitationCodeInput.value = '';
    if (manualChildForm) manualChildForm.reset();
    validatedCodeData = null;

    // Reset title
    if (addChildModalTitle) addChildModalTitle.textContent = 'Kind hinzufügen';
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Wie möchtest du das Kind hinzufügen?';

    addChildModal?.classList.remove('hidden');
}

/**
 * Show code entry step
 */
function showCodeStep() {
    addChildStepChoice?.classList.add('hidden');
    addChildStepCode?.classList.remove('hidden');
    addChildCodeError?.classList.add('hidden');
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Gib den Einladungscode vom Trainer ein';
    invitationCodeInput?.focus();
}

/**
 * Show manual entry step
 */
async function showManualStep() {
    addChildStepChoice?.classList.add('hidden');
    addChildStepManual?.classList.remove('hidden');
    manualChildError?.classList.add('hidden');
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Gib die Daten deines Kindes ein';

    // Load sports if not already loaded
    if (sportsData.length === 0) {
        await loadSports();
    }

    manualFirstName?.focus();
}

/**
 * Load available sports
 */
async function loadSports() {
    try {
        const { data: sports, error } = await supabase
            .from('sports')
            .select('id, name, display_name')
            .order('display_name', { ascending: true });

        if (error) throw error;

        sportsData = sports || [];

        // Populate sport dropdown
        if (manualSport && sports) {
            manualSport.innerHTML = '<option value="">Bitte wählen...</option>';
            sports.forEach(sport => {
                const option = document.createElement('option');
                option.value = sport.id;
                option.textContent = sport.display_name || sport.name;
                manualSport.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading sports:', error);
    }
}

/**
 * Back to choice step
 */
function backToChoice() {
    addChildStepCode?.classList.add('hidden');
    addChildStepManual?.classList.add('hidden');
    addChildStepConfirm?.classList.add('hidden');
    addChildStepChoice?.classList.remove('hidden');
    if (addChildModalSubtitle) addChildModalSubtitle.textContent = 'Wie möchtest du das Kind hinzufügen?';
}

/**
 * Validate invitation code
 */
async function validateInvitationCode() {
    const code = invitationCodeInput?.value?.trim().toUpperCase();

    if (!code) {
        showAddChildCodeError('Bitte gib einen Code ein.');
        return;
    }

    // Basic format validation (TTV-XXX-YYY)
    if (!/^TTV-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) {
        showAddChildCodeError('Ungültiges Code-Format. Erwartet: TTV-XXX-YYY');
        return;
    }

    // Show loading state
    if (validateCodeBtn) {
        validateCodeBtn.disabled = true;
        validateCodeBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Prüfe...';
    }

    try {
        const { data, error } = await supabase.rpc('validate_guardian_invitation_code', {
            p_code: code
        });

        if (error) {
            throw error;
        }

        if (!data?.valid) {
            showAddChildCodeError(data?.error || 'Ungültiger Code');
            return;
        }

        // Store validated data
        validatedCodeData = {
            code: code,
            child: data.child,
            code_id: data.code_id,
            needs_profile: data.needs_profile || false
        };

        // Show child preview
        showChildPreview(data.child);

    } catch (error) {
        console.error('Error validating code:', error);
        showAddChildCodeError(error.message || 'Fehler beim Prüfen des Codes');
    } finally {
        if (validateCodeBtn) {
            validateCodeBtn.disabled = false;
            validateCodeBtn.innerHTML = '<i class="fas fa-search mr-2"></i>Code prüfen';
        }
    }
}

/**
 * Show child preview (step 2)
 */
function showChildPreview(child) {
    if (childPreviewInitial) {
        childPreviewInitial.textContent = (child.first_name?.[0] || '?').toUpperCase();
    }
    if (childPreviewName) {
        childPreviewName.textContent = `${child.first_name || ''} ${child.last_name || ''}`.trim() || 'Unbekannt';
    }
    if (childPreviewAge) {
        if (child.birthdate) {
            const age = calculateAge(child.birthdate);
            childPreviewAge.textContent = `${age} Jahre`;
        } else {
            childPreviewAge.textContent = 'Alter unbekannt';
        }
    }

    // Switch to confirm step
    addChildStepCode?.classList.add('hidden');
    addChildStepConfirm?.classList.remove('hidden');
    addChildConfirmError?.classList.add('hidden');
}

/**
 * Confirm and link child
 */
async function confirmLinkChild() {
    if (!validatedCodeData) {
        showAddChildConfirmError('Kein gültiger Code. Bitte versuche es erneut.');
        return;
    }

    // Show loading state
    if (confirmLinkBtn) {
        confirmLinkBtn.disabled = true;
        confirmLinkBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verknüpfe...';
    }

    try {
        const { data, error } = await supabase.rpc('link_guardian_via_invitation_code', {
            p_code: validatedCodeData.code
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            showAddChildConfirmError(data?.error || 'Fehler beim Verknüpfen');
            return;
        }

        // Show success
        showAddChildSuccess(validatedCodeData.child);

    } catch (error) {
        console.error('Error linking child:', error);
        showAddChildConfirmError(error.message || 'Fehler beim Verknüpfen des Kindes');
    } finally {
        if (confirmLinkBtn) {
            confirmLinkBtn.disabled = false;
            confirmLinkBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Verknüpfen';
        }
    }
}

/**
 * Show success state (step 3)
 */
function showAddChildSuccess(child) {
    const name = `${child.first_name || ''} ${child.last_name || ''}`.trim() || 'Das Kind';
    if (addChildSuccessName) {
        addChildSuccessName.textContent = `${name} wurde mit deinem Account verknüpft.`;
    }

    addChildStepConfirm?.classList.add('hidden');
    addChildStepSuccess?.classList.remove('hidden');

    // Also update the profile to mark as guardian if not already
    updateGuardianStatus();
}

/**
 * Update user's guardian status
 */
async function updateGuardianStatus() {
    try {
        await supabase
            .from('profiles')
            .update({ is_guardian: true })
            .eq('id', currentUser.id);
    } catch (error) {
        console.error('Error updating guardian status:', error);
    }
}

/**
 * Show code error
 */
function showAddChildCodeError(message) {
    if (addChildCodeErrorText) addChildCodeErrorText.textContent = message;
    addChildCodeError?.classList.remove('hidden');
}

/**
 * Show confirm error
 */
function showAddChildConfirmError(message) {
    if (addChildConfirmErrorText) addChildConfirmErrorText.textContent = message;
    addChildConfirmError?.classList.remove('hidden');
}

/**
 * Close add child modal and refresh list
 */
function closeAddChildModalAndRefresh() {
    addChildModal?.classList.add('hidden');
    validatedCodeData = null;
    loadChildren();
}

// Add child modal event listeners
addChildBtn?.addEventListener('click', showAddChildModal);

closeAddChildModal?.addEventListener('click', () => {
    addChildModal?.classList.add('hidden');
});

addChildModal?.addEventListener('click', (e) => {
    if (e.target === addChildModal) {
        addChildModal.classList.add('hidden');
    }
});

validateCodeBtn?.addEventListener('click', validateInvitationCode);

// Allow Enter key to validate code
invitationCodeInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        validateInvitationCode();
    }
});

// Auto-format code input (add dashes)
invitationCodeInput?.addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Format as TTV-XXX-YYY
    if (value.length > 3) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    }
    if (value.length > 7) {
        value = value.slice(0, 7) + '-' + value.slice(7);
    }

    e.target.value = value.slice(0, 11);
});

backToCodeBtn?.addEventListener('click', () => {
    addChildStepConfirm?.classList.add('hidden');
    addChildStepCode?.classList.remove('hidden');
    addChildCodeError?.classList.add('hidden');
});

confirmLinkBtn?.addEventListener('click', confirmLinkChild);

addChildDoneBtn?.addEventListener('click', closeAddChildModalAndRefresh);

// Choice step buttons
btnWithCode?.addEventListener('click', showCodeStep);
btnManual?.addEventListener('click', showManualStep);
backToChoiceBtn?.addEventListener('click', backToChoice);

// Manual form submission
manualChildForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitManualChild();
});

/**
 * Submit manually entered child
 */
async function submitManualChild() {
    const firstName = manualFirstName?.value?.trim();
    const lastName = manualLastName?.value?.trim();
    const birthdate = manualBirthdate?.value;
    const gender = manualGender?.value || null;
    const sportId = manualSport?.value || null;

    // Validation
    if (!firstName || !lastName) {
        showManualChildError('Bitte gib Vor- und Nachname ein.');
        return;
    }

    if (!birthdate) {
        showManualChildError('Bitte gib das Geburtsdatum ein.');
        return;
    }

    if (!sportId) {
        showManualChildError('Bitte wähle eine Sportart aus.');
        return;
    }

    // Check age - must be under 18
    const age = calculateAge(birthdate);
    if (age >= 18) {
        showManualChildError('Das Kind muss unter 18 Jahre alt sein.');
        return;
    }

    // Show loading
    const submitBtn = document.getElementById('submit-manual-child-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird hinzugefügt...';
    }

    try {
        // Create child profile using RPC
        const { data, error } = await supabase.rpc('create_child_profile', {
            p_first_name: firstName,
            p_last_name: lastName,
            p_birthdate: birthdate,
            p_gender: gender,
            p_sport_id: sportId
        });

        if (error) {
            throw error;
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Erstellen des Profils');
        }

        // Show success
        if (addChildSuccessName) {
            addChildSuccessName.textContent = `${firstName} ${lastName} wurde hinzugefügt.`;
        }
        addChildStepManual?.classList.add('hidden');
        addChildStepSuccess?.classList.remove('hidden');

        // Update guardian status
        await updateGuardianStatus();

    } catch (error) {
        console.error('Error creating child profile:', error);
        showManualChildError(error.message || 'Fehler beim Hinzufügen des Kindes');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Hinzufügen';
        }
    }
}

/**
 * Show manual form error
 */
function showManualChildError(message) {
    if (manualChildErrorText) manualChildErrorText.textContent = message;
    manualChildError?.classList.remove('hidden');
}

// =====================================================
// Credentials Modal (Username + PIN)
// =====================================================

/**
 * Show credentials modal
 */
async function showCredentialsModal(childId, childName, existingUsername = '') {
    credentialsChildId = childId;
    if (credentialsChildName) credentialsChildName.textContent = `für ${childName}`;

    // Reset form
    if (credentialsUsername) {
        credentialsUsername.value = existingUsername || '';
    }
    if (credentialsPin) credentialsPin.value = '';
    if (credentialsPinConfirm) credentialsPinConfirm.value = '';
    credentialsError?.classList.add('hidden');
    credentialsSuccess?.classList.add('hidden');
    if (usernameCheckStatus) usernameCheckStatus.innerHTML = '';
    if (usernameHint) {
        usernameHint.textContent = '3-30 Zeichen, nur Kleinbuchstaben, Zahlen, Punkte und Unterstriche';
        usernameHint.classList.remove('text-red-500', 'text-green-500');
        usernameHint.classList.add('text-gray-500');
    }

    if (credentialsSubmitBtn) {
        credentialsSubmitBtn.disabled = false;
        credentialsSubmitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Zugangsdaten speichern';
    }

    // If no existing username, get suggestions
    if (!existingUsername) {
        const child = childrenData.find(c => (c.id || c.child_id) === childId);
        if (child?.first_name) {
            const birthYear = child.birthdate ? new Date(child.birthdate).getFullYear() : null;
            try {
                const { data } = await supabase.rpc('suggest_username', {
                    p_first_name: child.first_name,
                    p_birth_year: birthYear
                });
                if (data?.suggestions?.length > 0) {
                    if (credentialsUsername) {
                        credentialsUsername.value = data.suggestions[0];
                        credentialsUsername.placeholder = `z.B. ${data.suggestions.slice(0, 3).join(', ')}`;
                    }
                }
            } catch (e) {
                console.log('Could not get username suggestions:', e);
            }
        }
    }

    credentialsModal?.classList.remove('hidden');
    credentialsUsername?.focus();
}

// Close credentials modal
closeCredentialsModal?.addEventListener('click', () => {
    credentialsModal?.classList.add('hidden');
    credentialsChildId = null;
});

credentialsModal?.addEventListener('click', (e) => {
    if (e.target === credentialsModal) {
        credentialsModal.classList.add('hidden');
        credentialsChildId = null;
    }
});

// Real-time username validation
credentialsUsername?.addEventListener('input', (e) => {
    // Normalize to lowercase
    e.target.value = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');

    // Debounce the availability check
    if (usernameCheckTimeout) clearTimeout(usernameCheckTimeout);

    if (usernameCheckStatus) usernameCheckStatus.innerHTML = '';

    const username = e.target.value;
    if (username.length < 3) {
        if (usernameHint) {
            usernameHint.textContent = 'Mindestens 3 Zeichen erforderlich';
            usernameHint.classList.remove('text-green-500', 'text-gray-500');
            usernameHint.classList.add('text-red-500');
        }
        return;
    }

    if (usernameHint) {
        usernameHint.textContent = 'Prüfe Verfügbarkeit...';
        usernameHint.classList.remove('text-red-500', 'text-green-500');
        usernameHint.classList.add('text-gray-500');
    }
    if (usernameCheckStatus) {
        usernameCheckStatus.innerHTML = '<i class="fas fa-spinner fa-spin text-gray-400"></i>';
    }

    usernameCheckTimeout = setTimeout(async () => {
        try {
            const { data } = await supabase.rpc('check_username_available', {
                p_username: username,
                p_child_id: credentialsChildId
            });

            if (data?.available) {
                if (usernameHint) {
                    usernameHint.textContent = `"${data.normalized}" ist verfügbar`;
                    usernameHint.classList.remove('text-red-500', 'text-gray-500');
                    usernameHint.classList.add('text-green-500');
                }
                if (usernameCheckStatus) {
                    usernameCheckStatus.innerHTML = '<i class="fas fa-check text-green-500"></i>';
                }
            } else {
                if (usernameHint) {
                    usernameHint.textContent = data?.reason || 'Benutzername nicht verfügbar';
                    usernameHint.classList.remove('text-green-500', 'text-gray-500');
                    usernameHint.classList.add('text-red-500');
                }
                if (usernameCheckStatus) {
                    usernameCheckStatus.innerHTML = '<i class="fas fa-times text-red-500"></i>';
                }
            }
        } catch (error) {
            console.error('Username check error:', error);
        }
    }, 500);
});

// Handle credentials form submission
credentialsForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCredentials();
});

/**
 * Save child credentials
 */
async function saveCredentials() {
    const username = credentialsUsername?.value?.trim().toLowerCase();
    const pin = credentialsPin?.value?.trim();
    const pinConfirm = credentialsPinConfirm?.value?.trim();

    // Validation
    if (!username || username.length < 3) {
        showCredentialsError('Benutzername muss mindestens 3 Zeichen haben.');
        return;
    }

    if (!pin || pin.length < 4 || pin.length > 6) {
        showCredentialsError('PIN muss 4-6 Ziffern haben.');
        return;
    }

    if (!/^[0-9]+$/.test(pin)) {
        showCredentialsError('PIN darf nur Ziffern enthalten.');
        return;
    }

    if (pin !== pinConfirm) {
        showCredentialsError('Die PINs stimmen nicht überein.');
        return;
    }

    if (!credentialsChildId) {
        showCredentialsError('Kein Kind ausgewählt.');
        return;
    }

    // Disable button and show loading
    if (credentialsSubmitBtn) {
        credentialsSubmitBtn.disabled = true;
        credentialsSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Speichere...';
    }

    try {
        const { data, error } = await supabase.rpc('set_child_credentials', {
            p_child_id: credentialsChildId,
            p_username: username,
            p_pin: pin
        });

        if (error) throw error;

        if (!data?.success) {
            throw new Error(data?.error || 'Fehler beim Speichern der Zugangsdaten');
        }

        // Show success
        credentialsError?.classList.add('hidden');
        if (credentialsSuccessText) {
            credentialsSuccessText.textContent = `Zugangsdaten gespeichert! Benutzername: ${data.username}`;
        }
        credentialsSuccess?.classList.remove('hidden');

        // Refresh children list after a short delay
        setTimeout(async () => {
            await loadChildren();
            credentialsModal?.classList.add('hidden');
            credentialsChildId = null;
        }, 2000);

    } catch (error) {
        console.error('Credentials save error:', error);
        showCredentialsError(error.message || 'Fehler beim Speichern. Bitte versuche es erneut.');

        if (credentialsSubmitBtn) {
            credentialsSubmitBtn.disabled = false;
            credentialsSubmitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Zugangsdaten speichern';
        }
    }
}

/**
 * Show credentials error
 */
function showCredentialsError(message) {
    if (credentialsErrorText) credentialsErrorText.textContent = message;
    credentialsError?.classList.remove('hidden');
    credentialsSuccess?.classList.add('hidden');
}
