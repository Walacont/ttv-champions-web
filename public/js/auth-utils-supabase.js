// Auth-Hilfsfunktionen für Supabase
// SC Champions - Supabase Version

import { getSupabase, signOut as supabaseSignOut, onAuthStateChange } from './supabase-init.js';

/**
 * Meldet Benutzer ab und bereinigt den SPA-Cache
 * @returns {Promise<void>}
 */
export async function handleLogout() {
    try {
        await supabaseSignOut();

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
 * Validiert Authentifizierung und Rollenzugriff
 * @param {string[]} allowedRoles - Array erlaubter Rollen (z.B. ['player', 'coach'])
 * @returns {Promise<{user: Object, userData: Object}>} Authentifizierter Benutzer und dessen Daten
 * @throws {Error} Wenn Benutzer nicht authentifiziert ist oder keine erforderliche Rolle hat
 */
export function requireRole(allowedRoles = []) {
    return new Promise((resolve, reject) => {
        const supabase = getSupabase();

        supabase.auth.getSession().then(async ({ data: { session } }) => {
            try {
                if (!session || !session.user) {
                    window.location.replace('/index.html');
                    reject(new Error('Not authenticated'));
                    return;
                }

                const user = session.user;

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
 * Richtet Event-Handler für Logout-Button ein
 * @param {string} buttonId - ID des Logout-Button-Elements
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
 * Prüft ob Benutzer authentifiziert ist
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
    const supabase = getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
}

/**
 * Gibt aktuellen Benutzer mit Profildaten zurück
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
 * Leitet zum rollenbasierten Dashboard weiter
 * @param {string} role - Benutzerrolle
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
