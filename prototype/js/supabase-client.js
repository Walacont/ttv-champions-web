/**
 * Supabase Client für SC Champions Prototyp
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
    // Zuerst prüfen ob Code-Login existiert
    if (checkCodeLogin()) {
        return { user: null, profile: currentProfile, loginType: 'code' };
    }

    // Dann normales Supabase-Auth prüfen
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
    return currentUser !== null || currentProfile !== null;
}

/**
 * Prüft, ob der Benutzer ein Coach ist (inkl. Head Coach)
 */
export function isCoach() {
    return currentProfile?.role === 'coach' || currentProfile?.role === 'head_coach' || currentProfile?.role === 'admin';
}

/**
 * Prüft, ob der Benutzer ein Head Coach ist
 */
export function isHeadCoach() {
    return currentProfile?.role === 'head_coach' || currentProfile?.role === 'admin';
}

/**
 * Prüft, ob der Benutzer ein Admin ist
 */
export function isAdmin() {
    return currentProfile?.role === 'admin';
}

/**
 * Gibt die Rolle des Benutzers zurück
 */
export function getRole() {
    return currentProfile?.role || 'player';
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
 * Login mit Einladungs-Code (Format: XXX-XXX-XXX)
 * Code wird vom Coach/Admin erstellt und an Spieler verteilt
 * Verwendet invitation_codes Tabelle wie im Main Branch
 */
export async function loginWithCode(code) {
    // Bindestriche entfernen und uppercase
    const cleanCode = code.replace(/-/g, '').toUpperCase();

    // Code in der invitation_codes Tabelle suchen
    const { data: invitationCode, error: codeError } = await supabase
        .from('invitation_codes')
        .select('*')
        .eq('code', cleanCode)
        .eq('is_active', true)
        .single();

    if (codeError || !invitationCode) {
        return { success: false, error: 'Ungültiger Code' };
    }

    // Prüfen ob Code abgelaufen ist
    if (invitationCode.expires_at && new Date(invitationCode.expires_at) < new Date()) {
        return { success: false, error: 'Code ist abgelaufen' };
    }

    // Prüfen ob Code bereits verwendet wurde (max_uses erreicht)
    if (invitationCode.max_uses && invitationCode.use_count >= invitationCode.max_uses) {
        return { success: false, error: 'Code wurde bereits verwendet' };
    }

    // Profil laden (entweder über player_id oder Profil erstellen)
    let profile = null;

    if (invitationCode.player_id) {
        // Code ist mit bestehendem Offline-Spieler verknüpft
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                *,
                club:clubs(id, name)
            `)
            .eq('id', invitationCode.player_id)
            .single();

        if (error || !data) {
            return { success: false, error: 'Profil nicht gefunden' };
        }
        profile = data;
    } else {
        return { success: false, error: 'Kein Spieler mit diesem Code verknüpft' };
    }

    // Code als verwendet markieren
    await supabase
        .from('invitation_codes')
        .update({
            use_count: (invitationCode.use_count || 0) + 1,
            used: true,
            used_at: new Date().toISOString()
        })
        .eq('id', invitationCode.id);

    // Für Code-Login: Wir speichern das Profil im localStorage
    currentProfile = profile;
    localStorage.setItem('ttv_code_login_profile', JSON.stringify(profile));

    return { success: true, profile: currentProfile, loginType: 'code' };
}

/**
 * Prüft ob ein Code-Login existiert (beim App-Start)
 */
export function checkCodeLogin() {
    const stored = localStorage.getItem('ttv_code_login_profile');
    if (stored) {
        try {
            currentProfile = JSON.parse(stored);
            return true;
        } catch {
            localStorage.removeItem('ttv_code_login_profile');
        }
    }
    return false;
}

/**
 * Logout für Code-Login
 */
export function logoutCodeLogin() {
    localStorage.removeItem('ttv_code_login_profile');
    currentProfile = null;
}

/**
 * Einladungs-Code erstellen (nur für Coach/Admin)
 * Verwendet invitation_codes Tabelle wie im Main Branch
 */
export async function createInvitationCode(playerId, clubId, options = {}) {
    const code = generateCode();

    // Code-Ablaufdatum (Standard: 30 Tage)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (options.expiryDays || 30));

    const { data, error } = await supabase
        .from('invitation_codes')
        .insert({
            code: code,
            club_id: clubId,
            player_id: playerId,
            first_name: options.firstName || null,
            last_name: options.lastName || null,
            birthdate: options.birthdate || null,
            gender: options.gender || null,
            max_uses: 1,
            expires_at: expiresAt.toISOString(),
            created_by: currentProfile?.id || null
        })
        .select()
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, code: code };
}

// Alias für Rückwärtskompatibilität
export async function createLoginCode(userId) {
    // Hole club_id vom Spieler
    const { data: player } = await supabase
        .from('profiles')
        .select('club_id, first_name, last_name')
        .eq('id', userId)
        .single();

    if (!player?.club_id) {
        return { success: false, error: 'Spieler hat keinen Verein' };
    }

    return createInvitationCode(userId, player.club_id, {
        firstName: player.first_name,
        lastName: player.last_name
    });
}

/**
 * Generiert einen 9-stelligen alphanumerischen Code (ohne Bindestriche gespeichert)
 * Anzeige-Format: XXX-XXX-XXX
 */
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Ohne 0, O, 1, I
    let code = '';
    for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Formatiert einen Code für die Anzeige (XXX-XXX-XXX)
 */
export function formatCodeForDisplay(code) {
    if (!code || code.length !== 9) return code;
    return `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6, 9)}`;
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
    // Code-Login Logout
    logoutCodeLogin();

    // Supabase Auth Logout
    const { error } = await supabase.auth.signOut();

    currentUser = null;
    currentProfile = null;

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
