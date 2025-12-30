// Auth-Utilities (Firebase-Version)

import {
    signOut,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js';

export async function handleLogout(auth) {
    try {
        await signOut(auth);
        if (window.spaEnhancer) {
            window.spaEnhancer.clearCache();
        }
        window.location.replace('/index.html');
    } catch (error) {
        console.error('Logout Fehler:', error);
        throw error;
    }
}

export function requireRole(auth, db, allowedRoles = []) {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, async user => {
            try {
                if (!user) {
                    window.location.replace('/index.html');
                    reject(new Error('Nicht authentifiziert'));
                    return;
                }

                const userDocRef = doc(db, 'users', user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (!userDocSnap.exists()) {
                    console.error('Benutzer-Dokument nicht gefunden');
                    window.location.replace('/index.html');
                    reject(new Error('Benutzer-Dokument nicht gefunden'));
                    return;
                }

                const userData = userDocSnap.data();

                if (allowedRoles.length === 0 || allowedRoles.includes(userData.role)) {
                    resolve({ user, userData });
                } else {
                    console.error(
                        `Zugriff verweigert. Erforderliche Rollen: ${allowedRoles.join(', ')}, Benutzerrolle: ${userData.role}`
                    );

                    // Weiterleitung basierend auf der tatsächlichen Rolle
                    if (userData.role === 'coach') {
                        window.location.replace('/coach.html');
                    } else if (userData.role === 'admin') {
                        window.location.replace('/admin.html');
                    } else {
                        window.location.replace('/dashboard.html');
                    }

                    reject(new Error(`Rolle ${userData.role} nicht autorisiert`));
                }
            } catch (error) {
                console.error('Fehler in requireRole:', error);
                reject(error);
            } finally {
                unsubscribe();
            }
        });
    });
}

export function setupLogoutButton(buttonId, auth) {
    const logoutButton = document.getElementById(buttonId);
    if (logoutButton) {
        logoutButton.addEventListener('click', async () => {
            await handleLogout(auth);
        });
    }
}
