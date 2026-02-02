// Support-Einstellungen - Supabase-Version

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');

let currentUser = null;
let currentUserData = null;

// Auth-Status beim Laden prüfen
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        // Benutzerprofil von Supabase abrufen
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (!error && profile) {
            currentUserData = {
                id: currentUser.id,
                role: profile.role || 'player',
            };
        }

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
        if (window.hideSplash) window.hideSplash();
    } else {
        window.location.href = '/index.html';
    }
}

// Bei DOMContentLoaded initialisieren oder sofort falls bereits geladen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Auth-Status-Änderungen beobachten - nur bei explizitem Logout weiterleiten
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

