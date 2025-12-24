import {
    signOut,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

/**
 * Handles user logout with proper cleanup
 * @param {Object} auth - Firebase Auth instance
 * @returns {Promise<void>}
 */
export async function handleLogout(auth) {
    try {
        await signOut(auth);

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
 * @param {Object} auth - Firebase Auth instance
 * @param {Object} db - Firestore instance
 * @param {string[]} allowedRoles - Array of allowed role names (e.g., ['player', 'coach'])
 * @returns {Promise<{user: Object, userData: Object}>} Authenticated user and their data
 * @throws {Error} If user is not authenticated or doesn't have required role
 */
export function requireRole(auth, db, allowedRoles = []) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async user => {
            try {
                if (!user) {
                    window.location.replace('/index.html');
                    reject(new Error('Not authenticated'));
                    return;
                }

                const userDocRef = doc(db, 'users', user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                    console.error('User document not found');
                    window.location.replace('/index.html');
                    reject(new Error('User document not found'));
                    return;
                }

                const userData = userDocSnap.data();

                if (allowedRoles.length === 0 || allowedRoles.includes(userData.role)) {
                    resolve({ user, userData });
                } else {
                    console.error(
                        `Access denied. Required roles: ${allowedRoles.join(', ')}, user role: ${userData.role}`
                    );

                    // Redirect based on user's actual role
                    if (userData.role === 'coach') {
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
            } finally {
                unsubscribe();
            }
        });
    });
}

/**
 * Sets up logout button handler
 * @param {string} buttonId - ID of the logout button element
 * @param {Object} auth - Firebase Auth instance
 */
export function setupLogoutButton(buttonId, auth) {
    const logoutButton = document.getElementById(buttonId);
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await handleLogout(auth);
        });
    }
}
