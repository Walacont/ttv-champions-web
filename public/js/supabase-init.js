// Supabase Client Initialization

import { createClient } from '/vendor/supabase.js';
import { supabaseConfig } from './supabase-config.js';

let supabaseInstance = null;

function isCapacitorNative() {
    return typeof window !== 'undefined' &&
        typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform();
}

// Nutzt Capacitor Preferences (sicherer nativer Speicher) für bessere Session-Persistenz
// Fallback auf localStorage für Web
class CapacitorStorageAdapter {
    constructor() {
        this.isNative = isCapacitorNative();
        this.preferencesModule = null;
        this.cache = new Map(); // Für synchronen Zugriff, den Supabase benötigt
        this.initialized = false;
        this.initPromise = null;

        // Sofort aus localStorage laden, damit synchroner Zugriff funktioniert bevor async init abgeschlossen ist
        this._preloadFromLocalStorage();
    }

    _preloadFromLocalStorage() {
        const authKey = 'sb-' + new URL(supabaseConfig.url).hostname.split('.')[0] + '-auth-token';
        const value = localStorage.getItem(authKey);
        if (value) {
            this.cache.set(authKey, value);
            console.log('[Storage] Pre-loaded auth token from localStorage');
        }
    }

    async init() {
        if (this.initialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = this._doInit();
        return this.initPromise;
    }

    async _doInit() {
        if (this.isNative) {
            try {
                const module = await import('@capacitor/preferences');
                this.preferencesModule = module.Preferences;
                await this.loadCacheFromNative();
                console.log('[Storage] Capacitor Preferences initialized');
            } catch (e) {
                console.log('[Storage] Falling back to localStorage:', e.message);
                this.isNative = false;
            }
        }
        this.initialized = true;
    }

    async loadCacheFromNative() {
        if (!this.preferencesModule) return;

        const authKey = 'sb-' + new URL(supabaseConfig.url).hostname.split('.')[0] + '-auth-token';

        try {
            const { value } = await this.preferencesModule.get({ key: authKey });
            if (value) {
                this.cache.set(authKey, value);
                // Zusätzlich in localStorage synchronisieren als Backup
                localStorage.setItem(authKey, value);
                console.log('[Storage] Loaded auth token from native storage');
            }
        } catch (e) {
            console.log('[Storage] No existing auth token in native storage');
        }
    }

    getItem(key) {
        // Zuerst Cache prüfen (für synchronen Zugriff, den Supabase benötigt)
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        const value = localStorage.getItem(key);
        if (value) {
            // In Cache aufnehmen für zukünftigen synchronen Zugriff
            this.cache.set(key, value);
        }
        return value;
    }

    setItem(key, value) {
        this.cache.set(key, value);
        // Immer in localStorage schreiben für Persistenz
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.error('[Storage] localStorage setItem failed:', e);
        }

        if (this.isNative && this.preferencesModule) {
            this.preferencesModule.set({ key, value }).catch(e => {
                console.error('[Storage] Error saving to Preferences:', e);
            });
        }
    }

    removeItem(key) {
        this.cache.delete(key);
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('[Storage] localStorage removeItem failed:', e);
        }

        if (this.isNative && this.preferencesModule) {
            this.preferencesModule.remove({ key }).catch(e => {
                console.error('[Storage] Error removing from Preferences:', e);
            });
        }
    }
}

let storageAdapter = null;

function getStorageAdapter() {
    if (!storageAdapter) {
        storageAdapter = new CapacitorStorageAdapter();
    }
    return storageAdapter;
}

export function initSupabase() {
    if (supabaseInstance) {
        return supabaseInstance;
    }

    console.log('[Supabase] Initializing...');
    console.log('[Supabase] Is Capacitor native:', isCapacitorNative());

    const storage = getStorageAdapter();

    supabaseInstance = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: !isCapacitorNative(), // URL-Erkennung in nativen Apps deaktivieren
            storage: storage,
            // Längere Storage-Key-Retention für Android
            storageKey: 'sb-' + new URL(supabaseConfig.url).hostname.split('.')[0] + '-auth-token'
        }
    });

    if (isCapacitorNative()) {
        setupAppStateListener();
        // Storage async initialisieren - nicht blockieren, aber früh starten
        storage.init().then(() => {
            console.log('[Supabase] Storage fully initialized');
        });
    }

    console.log('[Supabase] Initialization complete');
    return supabaseInstance;
}

// Früh im App-Start aufrufen für beste Ergebnisse
export async function initSupabaseAsync() {
    const storage = getStorageAdapter();
    await storage.init();
    return initSupabase();
}

async function setupAppStateListener() {
    try {
        const { App } = await import('@capacitor/app');

        App.addListener('appStateChange', async ({ isActive }) => {
            if (isActive && supabaseInstance) {
                console.log('[Supabase] App resumed, checking session...');
                try {
                    const storage = getStorageAdapter();
                    if (storage.isNative && storage.preferencesModule) {
                        await storage.loadCacheFromNative();
                    }

                    const { data, error } = await supabaseInstance.auth.getSession();

                    if (data?.session) {
                        // Prüfen ob Token bald abläuft (innerhalb von 5 Minuten)
                        const expiresAt = data.session.expires_at;
                        const now = Math.floor(Date.now() / 1000);
                        const fiveMinutes = 5 * 60;

                        if (expiresAt && (expiresAt - now) < fiveMinutes) {
                            console.log('[Supabase] Token expiring soon, refreshing...');
                            const { data: refreshData, error: refreshError } = await supabaseInstance.auth.refreshSession();
                            if (refreshError) {
                                console.error('[Supabase] Token refresh failed:', refreshError.message);
                            } else if (refreshData?.session) {
                                console.log('[Supabase] Token refreshed successfully');
                            }
                        } else {
                            console.log('[Supabase] Session still valid');
                        }
                    } else if (error) {
                        console.log('[Supabase] Session error on resume:', error.message);
                        // Nicht automatisch ausloggen - App soll selbst entscheiden
                    } else {
                        console.log('[Supabase] No session found on resume');
                    }
                } catch (e) {
                    console.error('[Supabase] Error checking session on resume:', e);
                    // Nicht werfen - nur loggen
                }
            }
        });

        // Zusätzlich auf Sichtbarkeitswechsel hören als Backup
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && supabaseInstance) {
                console.log('[Supabase] Page became visible, checking session...');
                try {
                    const { data } = await supabaseInstance.auth.getSession();
                    if (data?.session) {
                        // Proaktiv aktualisieren wenn Session vorhanden
                        const expiresAt = data.session.expires_at;
                        const now = Math.floor(Date.now() / 1000);
                        if (expiresAt && (expiresAt - now) < 300) {
                            await supabaseInstance.auth.refreshSession();
                        }
                    }
                } catch (e) {
                    console.log('[Supabase] Visibility check error:', e.message);
                }
            }
        });

        console.log('[Supabase] App state listener set up');
    } catch (e) {
        console.log('[Supabase] Could not set up app state listener:', e.message);
    }
}

export function getSupabase() {
    return supabaseInstance || initSupabase();
}

export async function signUp(email, password, displayName) {
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                display_name: displayName
            }
        }
    });

    if (error) throw error;
    return data;
}

export async function signIn(email, password) {
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

export async function signOut() {
    const supabase = getSupabase();

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentUser() {
    const supabase = getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

export async function getSession() {
    const supabase = getSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

export function onAuthStateChange(callback) {
    const supabase = getSupabase();

    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

export async function resetPassword(email) {
    const supabase = getSupabase();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password.html`
    });

    if (error) throw error;
}

export async function getUserProfile(userId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error) throw error;
    return data;
}

export async function updateUserProfile(userId, updates) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getClubs() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .order('name');

    if (error) throw error;
    return data;
}

export async function getClubPlayers(clubId) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('club_id', clubId)
        .order('display_name');

    if (error) throw error;
    return data;
}

export async function getClubMatches(clubId, limit = 50) {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('matches')
        .select(`
            *,
            player_a:profiles!matches_player_a_id_fkey(id, display_name, elo_rating),
            player_b:profiles!matches_player_b_id_fkey(id, display_name, elo_rating)
        `)
        .eq('club_id', clubId)
        .order('played_at', { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data;
}

export async function getLeaderboard(clubId, orderBy = 'elo_rating') {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, elo_rating, xp, points, role')
        .eq('club_id', clubId)
        .order(orderBy, { ascending: false });

    if (error) throw error;
    return data;
}

export async function getSports() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('sports')
        .select('*')
        .eq('is_active', true)
        .order('display_name');

    if (error) throw error;
    return data;
}

export function subscribeToTable(table, callback, filter = null) {
    const supabase = getSupabase();

    let channel = supabase
        .channel(`${table}_changes`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: table,
                ...(filter && { filter })
            },
            callback
        )
        .subscribe();

    return channel;
}

export function unsubscribe(channel) {
    const supabase = getSupabase();
    supabase.removeChannel(channel);
}
