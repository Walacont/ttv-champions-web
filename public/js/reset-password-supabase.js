// SC Champions - Password Reset Page (Supabase Version)
// Handles the password reset flow after user clicks the email link

import { getSupabase } from './supabase-init.js';

console.log('[RESET-PASSWORD] Script starting...');

const supabase = getSupabase();

// DOM Elements
const loader = document.getElementById('loader');
const resetFormContainer = document.getElementById('reset-form-container');
const successContainer = document.getElementById('success-container');
const errorContainer = document.getElementById('error-container');
const errorDescription = document.getElementById('error-description');
const newPasswordForm = document.getElementById('new-password-form');
const errorMessage = document.getElementById('error-message');
const submitButton = document.getElementById('submit-button');

// Resend form elements
const resendForm = document.getElementById('resend-form');
const resendButton = document.getElementById('resend-button');
const resendButtonText = document.getElementById('resend-button-text');
const resendMessage = document.getElementById('resend-message');
const resendEmail = document.getElementById('resend-email');

// Countdown state
let countdownInterval = null;
let canResend = true;

// Initialize page
async function initializePage() {
    console.log('[RESET-PASSWORD] Initializing...');

    try {
        // Check if we have a valid session from the recovery link
        // Supabase automatically handles the token exchange when the page loads
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        console.log('[RESET-PASSWORD] Session check:', {
            hasSession: !!session,
            error: sessionError?.message
        });

        // Also listen for auth state changes (Supabase may still be processing the token)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('[RESET-PASSWORD] Auth event:', event);

            if (event === 'PASSWORD_RECOVERY') {
                // User clicked the recovery link - show the form
                showResetForm();
            } else if (event === 'SIGNED_IN' && session) {
                // Session established - show the form
                showResetForm();
            }
        });

        // Wait a bit for Supabase to process the URL tokens
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check session again after waiting
        const { data: { session: currentSession } } = await supabase.auth.getSession();

        if (currentSession) {
            showResetForm();
        } else {
            // Check URL for error or if it's a valid recovery link
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const urlParams = new URLSearchParams(window.location.search);

            const error = hashParams.get('error') || urlParams.get('error');
            const errorDesc = hashParams.get('error_description') || urlParams.get('error_description');

            if (error) {
                console.log('[RESET-PASSWORD] Error in URL:', error, errorDesc);
                showError(errorDesc || 'Der Link ist ungültig oder abgelaufen.');
            } else {
                // No session and no error - might still be processing
                // Wait a bit more and check again
                await new Promise(resolve => setTimeout(resolve, 1000));

                const { data: { session: finalSession } } = await supabase.auth.getSession();

                if (finalSession) {
                    showResetForm();
                } else {
                    showError('Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.');
                }
            }
        }

    } catch (error) {
        console.error('[RESET-PASSWORD] Init error:', error);
        showError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
    }
}

function showResetForm() {
    loader.classList.add('hidden');
    resetFormContainer.classList.remove('hidden');
    successContainer.classList.add('hidden');
    errorContainer.classList.add('hidden');
}

function showSuccess() {
    loader.classList.add('hidden');
    resetFormContainer.classList.add('hidden');
    successContainer.classList.remove('hidden');
    errorContainer.classList.add('hidden');
}

function showError(message) {
    loader.classList.add('hidden');
    resetFormContainer.classList.add('hidden');
    successContainer.classList.add('hidden');
    errorContainer.classList.remove('hidden');
    if (errorDescription && message) {
        errorDescription.textContent = message;
    }
}

// Handle form submission
newPasswordForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    // Clear previous errors
    errorMessage.textContent = '';

    // Validate passwords match
    if (newPassword !== confirmPassword) {
        errorMessage.textContent = 'Die Passwörter stimmen nicht überein.';
        return;
    }

    // Validate password length
    if (newPassword.length < 6) {
        errorMessage.textContent = 'Das Passwort muss mindestens 6 Zeichen haben.';
        return;
    }

    // Disable button and show loading state
    submitButton.disabled = true;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird gespeichert...';

    try {
        console.log('[RESET-PASSWORD] Updating password...');

        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });

        if (error) {
            throw error;
        }

        console.log('[RESET-PASSWORD] Password updated successfully');

        // Sign out the user so they can log in with the new password
        await supabase.auth.signOut();

        showSuccess();

    } catch (error) {
        console.error('[RESET-PASSWORD] Update error:', error);

        let displayMessage = 'Fehler beim Speichern des Passworts.';

        if (error.message.includes('weak') || error.message.includes('password')) {
            displayMessage = 'Das Passwort ist zu schwach. Bitte wähle ein stärkeres Passwort.';
        } else if (error.message.includes('session') || error.message.includes('expired')) {
            displayMessage = 'Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Link an.';
        }

        errorMessage.textContent = displayMessage;
        submitButton.disabled = false;
        submitButton.innerHTML = '<i class="fas fa-save mr-2"></i>Passwort speichern';
    }
});

// Handle resend form submission
resendForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!canResend) return;

    const email = resendEmail.value.trim();
    if (!email) return;

    // Disable button and start countdown
    canResend = false;
    resendButton.disabled = true;
    resendMessage.textContent = '';
    resendMessage.className = 'mt-3 text-center text-sm';

    try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password.html`
        });

        if (error) throw error;

        // Show success message
        resendMessage.textContent = 'Ein neuer Link wurde gesendet!';
        resendMessage.classList.add('text-green-600');

        // Start 60 second countdown
        startCountdown(60);

    } catch (error) {
        console.error('[RESET-PASSWORD] Resend error:', error);
        resendMessage.textContent = 'Fehler beim Senden. Bitte versuche es erneut.';
        resendMessage.classList.add('text-red-600');

        // Re-enable button after error
        canResend = true;
        resendButton.disabled = false;
        resendButtonText.textContent = 'Neuen Link senden';
    }
});

// Countdown function
function startCountdown(seconds) {
    let remaining = seconds;

    updateCountdownDisplay(remaining);

    countdownInterval = setInterval(() => {
        remaining--;

        if (remaining <= 0) {
            clearInterval(countdownInterval);
            canResend = true;
            resendButton.disabled = false;
            resendButtonText.textContent = 'Neuen Link senden';
        } else {
            updateCountdownDisplay(remaining);
        }
    }, 1000);
}

function updateCountdownDisplay(seconds) {
    resendButtonText.textContent = `Warten (${seconds}s)`;
}

// Start initialization
initializePage();

console.log('[RESET-PASSWORD] Setup complete');
