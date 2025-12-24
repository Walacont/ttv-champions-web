// SC Champions - Login Page (Supabase Version)
// Ersetzt index.js für die Supabase-Migration

import {
    initSupabase,
    signIn,
    onAuthStateChange,
    resetPassword,
    getSupabase
} from './supabase-init.js';

console.log('[INDEX-SUPABASE] Script starting...');

// Initialize Supabase
const supabase = initSupabase();
console.log('[INDEX-SUPABASE] Supabase initialized');

// DOM Elements
const loginForm = document.getElementById('login-form');
const resetForm = document.getElementById('reset-form');
const codeForm = document.getElementById('code-form');
const feedbackMessage = document.getElementById('feedback-message');
const formTitle = document.getElementById('form-title');

const emailLoginTab = document.getElementById('email-login-tab');
const codeLoginTab = document.getElementById('code-login-tab');
const forgotPasswordButton = document.getElementById('forgot-password-button');
const backToLoginButton = document.getElementById('back-to-login-button');
const invitationCodeInput = document.getElementById('invitation-code');

console.log('[INDEX-SUPABASE] DOM elements:', {
    loginForm: !!loginForm,
    resetForm: !!resetForm,
    codeForm: !!codeForm,
    emailLoginTab: !!emailLoginTab,
    codeLoginTab: !!codeLoginTab
});

// Check URL for code parameter (direct link from WhatsApp/etc)
const urlParams = new URLSearchParams(window.location.search);
const codeFromUrl = urlParams.get('code');
if (codeFromUrl) {
    switchToCodeTab();
    if (invitationCodeInput) invitationCodeInput.value = codeFromUrl;
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.classList.remove('hidden');
}

// Tab Switching
if (emailLoginTab) emailLoginTab.addEventListener('click', switchToEmailTab);
if (codeLoginTab) codeLoginTab.addEventListener('click', switchToCodeTab);

function switchToEmailTab() {
    emailLoginTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
    emailLoginTab.classList.remove('text-gray-600', 'border-transparent');
    codeLoginTab.classList.add('text-gray-600', 'border-transparent');
    codeLoginTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');

    loginForm.classList.remove('hidden');
    codeForm.classList.add('hidden');
    resetForm.classList.add('hidden');
    formTitle.textContent = 'Anmelden';
    feedbackMessage.textContent = '';
}

function switchToCodeTab() {
    codeLoginTab.classList.add('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');
    codeLoginTab.classList.remove('text-gray-600', 'border-transparent');
    emailLoginTab.classList.add('text-gray-600', 'border-transparent');
    emailLoginTab.classList.remove('text-indigo-600', 'border-indigo-600', 'bg-indigo-50');

    codeForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    resetForm.classList.add('hidden');
    formTitle.textContent = 'Mit Code anmelden';
    feedbackMessage.textContent = '';
}

// Auto-format code input (add dashes)
invitationCodeInput?.addEventListener('input', e => {
    let value = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (value.length > 3 && value.length <= 6) {
        value = value.slice(0, 3) + '-' + value.slice(3);
    } else if (value.length > 6) {
        value = value.slice(0, 3) + '-' + value.slice(3, 6) + '-' + value.slice(6, 9);
    }
    e.target.value = value;
});

// Auth State Change Listener
onAuthStateChange(async (event, session) => {
    console.log('[INDEX-SUPABASE] Auth state changed:', event, session?.user?.email);

    // Don't redirect after sign out or on initial load without explicit sign in
    if (event === 'SIGNED_OUT') {
        console.log('[INDEX-SUPABASE] User signed out, staying on index');
        return;
    }

    // Only redirect on explicit sign in, not on initial session check
    if (event !== 'SIGNED_IN') {
        console.log('[INDEX-SUPABASE] Ignoring event:', event);
        return;
    }

    if (session?.user) {
        try {
            // Get user profile from database
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (error) {
                console.error('[INDEX-SUPABASE] Error fetching profile:', error);
                return;
            }

            if (profile) {
                console.log('[INDEX-SUPABASE] User profile:', { role: profile.role, onboarding: profile.onboarding_complete });

                // Auto-fix coach/head_coach defaults if not set
                if ((profile.role === 'coach' || profile.role === 'head_coach') &&
                    (profile.grundlagen_completed < 5 || !profile.is_match_ready)) {
                    console.log('[INDEX-SUPABASE] Fixing coach defaults: grundlagen_completed=5, is_match_ready=true');
                    await supabase
                        .from('profiles')
                        .update({
                            grundlagen_completed: 5,
                            is_match_ready: true
                        })
                        .eq('id', session.user.id);
                }

                // Check onboarding
                if (!profile.onboarding_complete) {
                    console.log('[INDEX-SUPABASE] Redirecting to onboarding');
                    window.location.href = '/onboarding.html';
                    return;
                }

                // Redirect based on role
                let targetUrl;
                if (profile.role === 'admin') targetUrl = '/admin.html';
                else if (profile.role === 'coach' || profile.role === 'head_coach') targetUrl = '/coach.html';
                else targetUrl = '/dashboard.html';

                console.log('[INDEX-SUPABASE] Redirecting to:', targetUrl);
                window.location.href = targetUrl;
            }
        } catch (error) {
            console.error('[INDEX-SUPABASE] Error in auth state change:', error);
        }
    }
});

// Login Form Handler
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
            // Redirect wird vom onAuthStateChange Handler übernommen
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

// Forgot Password Handler
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

// Password Reset Handler
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

// Code Form Handler
codeForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const code = invitationCodeInput.value.trim().toUpperCase();
    feedbackMessage.textContent = '';
    feedbackMessage.className = 'mt-2 text-center text-sm';

    // Validate format
    const codeRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
    if (!codeRegex.test(code)) {
        feedbackMessage.textContent = 'Ungültiges Code-Format. Format: TTV-XXX-YYY';
        feedbackMessage.classList.add('text-red-600');
        return;
    }

    try {
        // Search code in Supabase
        const { data: codeData, error } = await supabase
            .from('invitation_codes')
            .select('*')
            .eq('code', code)
            .single();

        if (error || !codeData) {
            feedbackMessage.textContent = 'Dieser Code existiert nicht.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        // Check if code is active
        if (!codeData.is_active) {
            feedbackMessage.textContent = 'Dieser Code ist nicht mehr aktiv.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        // Check if code is expired
        if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
            feedbackMessage.textContent = 'Dieser Code ist abgelaufen.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        // Check max uses
        if (codeData.max_uses && codeData.use_count >= codeData.max_uses) {
            feedbackMessage.textContent = 'Dieser Code wurde bereits zu oft verwendet.';
            feedbackMessage.classList.add('text-red-600');
            return;
        }

        // Code is valid!
        feedbackMessage.textContent = 'Code gültig! Weiterleitung zur Registrierung...';
        feedbackMessage.classList.add('text-green-600');

        setTimeout(() => {
            window.location.href = `/register.html?code=${code}`;
        }, 1000);

    } catch (error) {
        console.error('[INDEX-SUPABASE] Code validation error:', error);
        feedbackMessage.textContent = 'Fehler beim Überprüfen des Codes.';
        feedbackMessage.classList.add('text-red-600');
    }
});

// Modal Controls
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
