// Login-Seite (Supabase-Version)
// Ersetzt index.js für die Supabase-Migration

import {
    initSupabase,
    signIn,
    onAuthStateChange,
    resetPassword,
    getSupabase
} from './supabase-init.js';
import { saveChildSession, getChildSession } from './child-login-supabase.js';

console.log('[INDEX-SUPABASE] Script starting...');

const supabase = initSupabase();
console.log('[INDEX-SUPABASE] Supabase initialized');

const loginForm = document.getElementById('login-form');
const resetForm = document.getElementById('reset-form');
const childForm = document.getElementById('child-form');
const codeForm = document.getElementById('code-form');
const feedbackMessage = document.getElementById('feedback-message');
const formTitle = document.getElementById('form-title');

// Tab buttons
const emailLoginTab = document.getElementById('email-login-tab');
const childLoginTab = document.getElementById('child-login-tab');
const codeLoginTab = document.getElementById('code-login-tab');
const forgotPasswordButton = document.getElementById('forgot-password-button');
const backToLoginButton = document.getElementById('back-to-login-button');

// Code login elements (for trainers/offline players 16+)
const invitationCodeInput = document.getElementById('invitation-code');
const codeLoginBtn = document.getElementById('code-login-btn');

// Child login elements
const childPinLogin = document.getElementById('child-pin-login');
const childUsernameInput = document.getElementById('child-username');
const childPinInput = document.getElementById('child-pin');
const childLoginBtn = document.getElementById('child-login-btn');

console.log('[INDEX-SUPABASE] DOM elements:', {
    loginForm: !!loginForm,
    resetForm: !!resetForm,
    childForm: !!childForm,
    codeForm: !!codeForm,
    emailLoginTab: !!emailLoginTab,
    childLoginTab: !!childLoginTab,
    codeLoginTab: !!codeLoginTab,
    childPinLogin: !!childPinLogin
});

// URL-Parameter prüfen für Direktlinks (z.B. aus WhatsApp)
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');
if (codeFromUrl) {
    // Invitation codes are in format XXX-XXX-XXX
    switchToCodeTab();
    if (invitationCodeInput) invitationCodeInput.value = codeFromUrl;
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.classList.remove('hidden');
}

// Tab event listeners
if (emailLoginTab) emailLoginTab.addEventListener('click', switchToEmailTab);
if (childLoginTab) childLoginTab.addEventListener('click', switchToChildTab);
if (codeLoginTab) codeLoginTab.addEventListener('click', switchToCodeTab);

// Helper to reset all tabs to inactive state
function resetAllTabs() {
    [emailLoginTab, childLoginTab, codeLoginTab].forEach(tab => {
        if (tab) {
            tab.classList.add('text-gray-600', 'border-transparent');
            tab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
            tab.classList.remove('text-pink-600', 'border-pink-600', 'bg-pink-50');
        }
    });
}

// Helper to hide all forms
function hideAllForms() {
    [loginForm, childForm, codeForm, resetForm].forEach(form => {
        if (form) form.classList.add('hidden');
    });
}

function switchToEmailTab() {
    resetAllTabs();
    emailLoginTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
    emailLoginTab.classList.remove('text-gray-600', 'border-transparent');

    hideAllForms();
    loginForm.classList.remove('hidden');
    formTitle.textContent = 'Anmelden';
    feedbackMessage.textContent = '';
}

function switchToChildTab() {
    resetAllTabs();
    childLoginTab.classList.add('text-pink-600', 'border-pink-600', 'bg-pink-50');
    childLoginTab.classList.remove('text-gray-600', 'border-transparent');

    hideAllForms();
    childForm.classList.remove('hidden');
    formTitle.textContent = 'Kinder-Login';
    feedbackMessage.textContent = '';
}

function switchToCodeTab() {
    resetAllTabs();
    codeLoginTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
    codeLoginTab.classList.remove('text-gray-600', 'border-transparent');

    hideAllForms();
    codeForm.classList.remove('hidden');
    formTitle.textContent = 'Code-Login';
    feedbackMessage.textContent = '';
}

// Auto-Formatierung des Einladungscodes (TTV-XXX-YYY)
invitationCodeInput?.addEventListener('input', e => {
    let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    // Always format as XXX-XXX-XXX for invitation codes
    if (value.length > 3) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    }
    if (value.length > 7) {
        value = value.slice(0, 7) + '-' + value.slice(7, 10);
    }
    e.target.value = value;
});

onAuthStateChange(async (event, session) => {
    console.log('[INDEX-SUPABASE] Auth state changed:', event, session?.user?.email);

    // Nach Sign-Out auf Login-Seite bleiben (nicht umleiten)
    if (event === 'SIGNED_OUT') {
        console.log('[INDEX-SUPABASE] User signed out, staying on index');
        return;
    }

    // Bei SIGNED_IN oder INITIAL_SESSION mit gültiger Session umleiten
    if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') {
        console.log('[INDEX-SUPABASE] Ignoring event:', event);
        return;
    }

    if (session?.user) {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*, is_player, is_guardian')
                .eq('id', session.user.id)
                .single();

            if (error) {
                console.error('[INDEX-SUPABASE] Error fetching profile:', error);
                return;
            }

            if (profile) {
                console.log('[INDEX-SUPABASE] User profile:', { role: profile.role, onboarding: profile.onboarding_complete });

                let targetUrl;
                if (profile.role === 'admin') targetUrl = '/admin.html';
                else if (profile.role === 'labeler') targetUrl = '/label.html';
                else if (profile.role === 'coach' || profile.role === 'head_coach') targetUrl = '/coach.html';
                // Pure guardians (is_guardian but NOT is_player) go to guardian dashboard
                else if ((profile.is_guardian || profile.account_type === 'guardian') && !profile.is_player) {
                    targetUrl = '/guardian-dashboard.html';
                }
                else targetUrl = '/dashboard.html';

                console.log('[INDEX-SUPABASE] Redirecting to:', targetUrl);
                window.location.href = targetUrl;
            }
        } catch (error) {
            console.error('[INDEX-SUPABASE] Error in auth state change:', error);
        }
    }
});

if (loginForm) {
    console.log('[INDEX-SUPABASE] Setting up login form handler');

    loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        console.log('[INDEX-SUPABASE] Login form submitted');

        const email = document.getElementById('email-address').value;
        const password = document.getElementById('password').value;
        const submitButton = document.getElementById('login-submit-button');

        feedbackMessage.textContent = '';
        feedbackMessage.className = 'mt-2 text-center text-sm';
        submitButton.disabled = true;

        try {
            console.log('[INDEX-SUPABASE] Attempting login for:', email);
            const data = await signIn(email, password);
            console.log('[INDEX-SUPABASE] Login successful!', data.user.email);
            // Weiterleitung erfolgt automatisch durch onAuthStateChange Handler
        } catch (error) {
            console.error('[INDEX-SUPABASE] Login error:', error);

            if (error.message.includes('Invalid login credentials')) {
                feedbackMessage.textContent = 'E-Mail oder Passwort ist falsch.';
            } else if (error.message.includes('Email not confirmed')) {
                feedbackMessage.textContent = 'Bitte bestätige zuerst deine E-Mail-Adresse.';
            } else {
                feedbackMessage.textContent = 'Fehler beim Anmelden. Bitte versuche es erneut.';
            }
            feedbackMessage.classList.add('text-red-600');
            submitButton.disabled = false;
        }
    });
}

forgotPasswordButton?.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    resetForm.classList.remove('hidden');
    formTitle.textContent = 'Passwort zurücksetzen';
    feedbackMessage.textContent = '';
});

backToLoginButton?.addEventListener('click', () => {
    resetForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    formTitle.textContent = 'Anmelden';
    feedbackMessage.textContent = '';
});

resetForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('reset-email-address').value;
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    try {
        await resetPassword(email);
        feedbackMessage.textContent = 'Ein Link zum Zurücksetzen wurde an deine E-Mail gesendet.';
        feedbackMessage.classList.add('text-green-600');
    } catch (error) {
        console.error('[INDEX-SUPABASE] Password reset error:', error);
        feedbackMessage.textContent = 'Fehler beim Senden. Bitte überprüfe die E-Mail-Adresse.';
        feedbackMessage.classList.add('text-red-600');
    }
});

// Handle child form submission (Username + PIN)
childForm?.addEventListener('submit', async e => {
    e.preventDefault();
    await handleChildPinLogin();
});

// Username + PIN Login Handler
async function handleChildPinLogin() {
    const username = childUsernameInput?.value?.trim().toLowerCase();
    const pin = childPinInput?.value?.trim();

    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    // Validation
    if (!username || username.length < 3) {
        feedbackMessage.textContent = 'Bitte gib deinen Benutzernamen ein (min. 3 Zeichen).';
        feedbackMessage.classList.add('text-red-600');
        childUsernameInput?.focus();
        return;
    }

    if (!pin || pin.length < 4) {
        feedbackMessage.textContent = 'Bitte gib deinen PIN ein (4-6 Ziffern).';
        feedbackMessage.classList.add('text-red-600');
        childPinInput?.focus();
        return;
    }

    // Disable button during request
    if (childLoginBtn) {
        childLoginBtn.disabled = true;
        childLoginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Anmelden...';
    }

    try {
        console.log('[INDEX-SUPABASE] Attempting child PIN login for:', username);
        feedbackMessage.textContent = 'Anmeldung läuft...';
        feedbackMessage.classList.add('text-gray-600');

        const { data, error } = await supabase.rpc('validate_child_pin_login', {
            p_username: username,
            p_pin: pin
        });

        if (error) throw error;

        if (!data?.success) {
            const errorMsg = data?.error || 'Anmeldung fehlgeschlagen';
            feedbackMessage.textContent = errorMsg;
            feedbackMessage.classList.remove('text-gray-600');
            feedbackMessage.classList.add('text-red-600');

            // Re-enable button
            if (childLoginBtn) {
                childLoginBtn.disabled = false;
                childLoginBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Anmelden';
            }
            return;
        }

        // Create child session with secure server token
        const childSession = {
            sessionToken: data.session_token, // Server-side token for security
            childId: data.child_id,
            firstName: data.first_name,
            lastName: data.last_name,
            ageMode: data.age_mode,
            clubId: data.club_id,
            guardianId: data.guardian_id,
            loginAt: new Date().toISOString(),
            expiresAt: data.expires_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        saveChildSession(childSession);
        console.log('[INDEX-SUPABASE] Child session saved with token');

        feedbackMessage.textContent = `Willkommen, ${data.first_name}! Weiterleitung...`;
        feedbackMessage.classList.remove('text-gray-600');
        feedbackMessage.classList.add('text-green-600');

        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 1000);

    } catch (error) {
        console.error('[INDEX-SUPABASE] Child PIN login error:', error);
        feedbackMessage.textContent = 'Fehler bei der Anmeldung. Bitte versuche es erneut.';
        feedbackMessage.classList.remove('text-gray-600');
        feedbackMessage.classList.add('text-red-600');

        // Re-enable button
        if (childLoginBtn) {
            childLoginBtn.disabled = false;
            childLoginBtn.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Anmelden';
        }
    }
}

// Invitation Code Login Handler (for trainers and offline players 16+)
codeLoginBtn?.addEventListener('click', async () => {
    const rawCode = invitationCodeInput?.value?.trim().toUpperCase();

    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    if (!rawCode) {
        feedbackMessage.textContent = 'Bitte gib einen Einladungscode ein.';
        feedbackMessage.classList.add('text-red-600');
        return;
    }

    // Validate invitation code format (XXX-XXX-XXX)
    const invitationCodeRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
    if (!invitationCodeRegex.test(rawCode)) {
        feedbackMessage.textContent = 'Ungültiges Code-Format. Einladungscode: TTV-XXX-YYY';
        feedbackMessage.classList.add('text-red-600');
        return;
    }

    // Disable button
    if (codeLoginBtn) {
        codeLoginBtn.disabled = true;
        codeLoginBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Prüfe...';
    }

    try {
        console.log('[INDEX-SUPABASE] Validating invitation code...');

        const { data: codeData, error } = await supabase
            .from('invitation_codes')
            .select('*')
            .eq('code', rawCode)
            .single();

        if (error || !codeData) {
            feedbackMessage.textContent = 'Dieser Code existiert nicht.';
            feedbackMessage.classList.add('text-red-600');

            if (codeLoginBtn) {
                codeLoginBtn.disabled = false;
                codeLoginBtn.innerHTML = '<i class="fas fa-arrow-right mr-2"></i>Weiter zur Registrierung';
            }
            return;
        }

        if (!codeData.is_active) {
            feedbackMessage.textContent = 'Dieser Code ist nicht mehr aktiv.';
            feedbackMessage.classList.add('text-red-600');

            if (codeLoginBtn) {
                codeLoginBtn.disabled = false;
                codeLoginBtn.innerHTML = '<i class="fas fa-arrow-right mr-2"></i>Weiter zur Registrierung';
            }
            return;
        }

        if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
            feedbackMessage.textContent = 'Dieser Code ist abgelaufen.';
            feedbackMessage.classList.add('text-red-600');

            if (codeLoginBtn) {
                codeLoginBtn.disabled = false;
                codeLoginBtn.innerHTML = '<i class="fas fa-arrow-right mr-2"></i>Weiter zur Registrierung';
            }
            return;
        }

        if (codeData.max_uses && codeData.use_count >= codeData.max_uses) {
            feedbackMessage.textContent = 'Dieser Code wurde bereits zu oft verwendet.';
            feedbackMessage.classList.add('text-red-600');

            if (codeLoginBtn) {
                codeLoginBtn.disabled = false;
                codeLoginBtn.innerHTML = '<i class="fas fa-arrow-right mr-2"></i>Weiter zur Registrierung';
            }
            return;
        }

        feedbackMessage.textContent = 'Code gültig! Weiterleitung zur Registrierung...';
        feedbackMessage.classList.add('text-green-600');

        setTimeout(() => {
            window.location.href = `/register.html?code=${rawCode}`;
        }, 1000);

    } catch (error) {
        console.error('[INDEX-SUPABASE] Code validation error:', error);
        feedbackMessage.textContent = 'Fehler beim Überprüfen des Codes.';
        feedbackMessage.classList.add('text-red-600');

        if (codeLoginBtn) {
            codeLoginBtn.disabled = false;
            codeLoginBtn.innerHTML = '<i class="fas fa-arrow-right mr-2"></i>Weiter zur Registrierung';
        }
    }
});

const loginModal = document.getElementById('login-modal');
const openLoginBtn = document.getElementById('open-login-modal');
const closeLoginBtn = document.getElementById('close-login-modal');

if (loginModal && openLoginBtn && closeLoginBtn) {
    openLoginBtn.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });

    closeLoginBtn.addEventListener('click', () => {
        loginModal.classList.add('hidden');
    });

    loginModal.addEventListener('click', e => {
        if (e.target === loginModal) {
            loginModal.classList.add('hidden');
        }
    });
}

console.log('[INDEX-SUPABASE] Setup complete');
