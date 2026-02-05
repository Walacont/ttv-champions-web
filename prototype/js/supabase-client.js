/**
 * Supabase Client für TTV Champions Prototyp
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Supabase Konfiguration
const SUPABASE_URL = 'https://lsbjrxmzcgtedgtbhprk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzYmpyeG16Y2d0ZWRndGJocHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTUyNTIsImV4cCI6MjA4NTg3MTI1Mn0.8TdnVEzEYOCfIUWRvaObIwdcfaFu3b9xJN-sAStqWyw';

// Supabase Client erstellen
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Aktueller Benutzer (wird nach Login gesetzt)
let currentUser = null;
let currentProfile = null;

/**
 * Initialisiert den Auth-Status
 */
export async function initAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
        currentUser = session.user;
        await loadCurrentProfile();
    }

    // Auth-Status-Änderungen überwachen
    supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
            currentUser = session.user;
            await loadCurrentProfile();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentProfile = null;
        }
    });

    return { user: currentUser, profile: currentProfile };
}

/**
 * Lädt das Profil des aktuellen Benutzers
 */
async function loadCurrentProfile() {
    if (!currentUser) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select(`
            *,
            club:clubs(id, name)
        `)
        .eq('id', currentUser.id)
        .single();

    if (!error && data) {
        currentProfile = data;
    }

    return currentProfile;
}

/**
 * Gibt den aktuellen Benutzer zurück
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Gibt das aktuelle Profil zurück
 */
export function getCurrentProfile() {
    return currentProfile;
}

/**
 * Prüft, ob der Benutzer eingeloggt ist
 */
export function isLoggedIn() {
    return currentUser !== null;
}

/**
 * Prüft, ob der Benutzer ein Coach ist
 */
export function isCoach() {
    return currentProfile?.role === 'coach';
}

/**
 * Prüft, ob der Benutzer einem Verein angehört
 */
export function hasClub() {
    return currentProfile?.club_id !== null;
}

/**
 * Login mit E-Mail und Passwort
 */
export async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        return { success: false, error: error.message };
    }

    currentUser = data.user;
    await loadCurrentProfile();

    return { success: true, user: data.user, profile: currentProfile };
}

/**
 * Registrierung mit E-Mail und Passwort
 */
export async function register(email, password, firstName, lastName) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password
    });

    if (error) {
        return { success: false, error: error.message };
    }

    // Profil erstellen
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            id: data.user.id,
            email,
            first_name: firstName,
            last_name: lastName
        });

    if (profileError) {
        return { success: false, error: profileError.message };
    }

    currentUser = data.user;
    await loadCurrentProfile();

    return { success: true, user: data.user };
}

/**
 * Logout
 */
export async function logout() {
    const { error } = await supabase.auth.signOut();

    if (!error) {
        currentUser = null;
        currentProfile = null;
    }

    return { success: !error, error: error?.message };
}

/**
 * Profil aktualisieren
 */
export async function updateProfile(updates) {
    if (!currentUser) {
        return { success: false, error: 'Nicht eingeloggt' };
    }

    const { data, error } = await supabase
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', currentUser.id)
        .select()
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    currentProfile = data;
    return { success: true, profile: data };
}

/**
 * Realtime-Subscription für Profil-Änderungen
 */
export function subscribeToProfileChanges(callback) {
    if (!currentUser) return null;

    return supabase
        .channel('profile-changes')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'profiles',
                filter: `id=eq.${currentUser.id}`
            },
            (payload) => {
                currentProfile = payload.new;
                callback(payload.new);
            }
        )
        .subscribe();
}

/**
 * Realtime-Subscription für neue Benachrichtigungen
 */
export function subscribeToNotifications(callback) {
    if (!currentUser) return null;

    return supabase
        .channel('notifications')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${currentUser.id}`
            },
            (payload) => {
                callback(payload.new);
            }
        )
        .subscribe();
}
