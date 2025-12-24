// Auth Utilities for Supabase
// SC Champions - Supabase Version

import { getSupabase, signOut as supabaseSignOut, onAuthStateChange } from './supabase-init.js';

/**
 * Handles user logout with proper cleanup
 * @returns {Promise<void>}
 */
export async function handleLogout() {
    try {
        await supabaseSignOut();

        // Clear SPA cache if available
        if (window.spaEnhancer) {
            window.spaEnhancer.clearCache();
        }

        window.location.replace('/index.html');
    } catch (error) {
        console.error('Logout error:', error);
        throw error;
    }
}

/**
 * Requires user authentication and validates role access
 * @param {string[]} allowedRoles - Array of allowed role names (e.g., ['player', 'coach'])
 * @returns {Promise<{user: Object, userData: Object}>} Authenticated user and their data
 * @throws {Error} If user is not authenticated or doesn't have required role
 */
export function requireRole(allowedRoles = []) {
    return new Promise((resolve, reject) => {
        const supabase = getSupabase();

        // Check current session first
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            try {
                if (!session || !session.user) {
                    window.location.replace('/index.html');
                    reject(new Error('Not authenticated'));
                    return;
                }

                const user = session.user;

                // Get user profile from profiles table
                const { data: userData, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single();

                if (error || !userData) {
                    console.error('User profile not found');
                    window.location.replace('/index.html');
                    reject(new Error('User profile not found'));
                    return;
                }

                if (allowedRoles.length === 0 || allowedRoles.includes(userData.role)) {
                    resolve({ user, userData });
                } else {
                    console.error(
                        `Access denied. Required roles: ${allowedRoles.join(', ')}, user role: ${userData.role}`
                    );

                    // Redirect based on user's actual role
                    if (userData.role === 'coach' || userData.role === 'head_coach') {
                        window.location.replace('/coach.html');
                    } else if (userData.role === 'admin') {
                        window.location.replace('/admin.html');
                    } else {
                        window.location.replace('/dashboard.html');
                    }

                    reject(new Error(`Role ${userData.role} not authorized`));
                }
            } catch (error) {
                console.error('Error in requireRole:', error);
                reject(error);
            }
        });
    });
}

/**
 * Sets up logout button handler
 * @param {string} buttonId - ID of the logout button element
 */
export function setupLogoutButton(buttonId) {
    const logoutButton = document.getElementById(buttonId);
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await handleLogout();
        });
    }
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
}

/**
 * Get current user with profile data
 * @returns {Promise<{user: Object, profile: Object}|null>}
 */
export async function getCurrentUserWithProfile() {
    const supabase = getSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) {
        return null;
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return { user: session.user, profile: null };
    }

    return { user: session.user, profile };
}

/**
 * Redirect to appropriate dashboard based on role
 * @param {string} role - User role
 */
export function redirectToDashboard(role) {
    switch (role) {
        case 'admin':
            window.location.replace('/admin.html');
            break;
        case 'coach':
            window.location.replace('/coach.html');
            break;
        default:
            window.location.replace('/dashboard.html');
    }
}
