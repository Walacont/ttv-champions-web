/**
 * Child Login - Login with 6-digit code from parents
 * No authentication required - uses special child session
 */

import { getSupabase } from './supabase-init.js';

console.log('[CHILD-LOGIN] Script starting...');

const supabase = getSupabase();

// DOM Elements
const loginForm = document.getElementById('child-login-form');
const codeInput = document.getElementById('login-code');
const submitBtn = document.getElementById('submit-btn');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const loginFormContainer = document.getElementById('login-form-container');
const successContainer = document.getElementById('success-container');
const childNameEl = document.getElementById('child-name');

// Initialize
function initialize() {
    // Check if already logged in as child
    const childSession = getChildSession();
    if (childSession) {
        console.log('[CHILD-LOGIN] Existing child session found, redirecting...');
        window.location.href = '/dashboard.html';
        return;
    }

    // Auto-uppercase input
    codeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

        // Hide error when typing
        hideError();

        // Auto-submit when 6 characters entered
        if (e.target.value.length === 6) {
            // Small delay for UX
            setTimeout(() => {
                loginForm?.dispatchEvent(new Event('submit', { cancelable: true }));
            }, 300);
        }
    });

    // Form submission
    loginForm?.addEventListener('submit', handleLogin);

    // Focus input on load
    codeInput?.focus();
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const code = codeInput?.value?.trim()?.toUpperCase();

    if (!code || code.length !== 6) {
        showError('Bitte gib einen 6-stelligen Code ein');
        shakeInput();
        return;
    }

    // Show loading state
    setLoading(true);

    try {
        // Validate code via RPC
        const { data, error } = await supabase.rpc('validate_child_login_code', {
            p_code: code
        });

        if (error) {
            throw error;
        }

        // Support both response formats: {success, child_id, ...} and {valid, child: {...}}
        const isValid = data?.success || data?.valid;
        if (!data || !isValid) {
            const errorMsg = data?.error || 'Ungültiger Code';
            showError(errorMsg);
            shakeInput();
            return;
        }

        console.log('[CHILD-LOGIN] Code validated:', data);

        // Extract child data from either format
        const child = data.child || data;
        const childSession = {
            childId: child.child_id || child.id,
            firstName: child.first_name,
            lastName: child.last_name,
            ageMode: child.age_mode,
            clubId: child.club_id,
            guardianId: data.guardian_id,
            loginAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        };

        // Store session
        saveChildSession(childSession);

        // Show success
        showSuccess(child.first_name);

        // Redirect after delay
        setTimeout(() => {
            window.location.href = '/dashboard.html';
        }, 2000);

    } catch (err) {
        console.error('[CHILD-LOGIN] Error:', err);
        showError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
        shakeInput();
    } finally {
        setLoading(false);
    }
}

// Show error message
function showError(message) {
    if (errorText) errorText.textContent = message;
    errorMessage?.classList.remove('hidden');
}

// Hide error message
function hideError() {
    errorMessage?.classList.add('hidden');
}

// Show success state
function showSuccess(firstName) {
    loginFormContainer?.classList.add('hidden');
    successContainer?.classList.remove('hidden');
    if (childNameEl) childNameEl.textContent = firstName;
}

// Shake input animation
function shakeInput() {
    codeInput?.classList.add('wiggle');
    setTimeout(() => {
        codeInput?.classList.remove('wiggle');
    }, 500);
}

// Set loading state
function setLoading(loading) {
    if (submitBtn) {
        submitBtn.disabled = loading;
        if (loading) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Prüfe...';
        } else {
            submitBtn.innerHTML = '<span>Los geht\'s!</span><i class="fas fa-arrow-right ml-3"></i>';
        }
    }
    if (codeInput) {
        codeInput.disabled = loading;
    }
}

// Child session management
function saveChildSession(session) {
    try {
        localStorage.setItem('child_session', JSON.stringify(session));
        // Also set a flag for quick checks
        sessionStorage.setItem('is_child_login', 'true');
    } catch (err) {
        console.error('[CHILD-LOGIN] Error saving session:', err);
    }
}

function getChildSession() {
    try {
        const sessionStr = localStorage.getItem('child_session');
        if (!sessionStr) return null;

        const session = JSON.parse(sessionStr);

        // Check if expired
        if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
            clearChildSession();
            return null;
        }

        return session;
    } catch (err) {
        console.error('[CHILD-LOGIN] Error reading session:', err);
        return null;
    }
}

function clearChildSession() {
    localStorage.removeItem('child_session');
    sessionStorage.removeItem('is_child_login');
}

// Export for use in other modules
export { getChildSession, clearChildSession, saveChildSession };

// Initialize only on child-login page (check if form exists)
if (document.getElementById('child-login-form')) {
    initialize();
}
