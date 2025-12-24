// Supabase Client Initialization
// SC Champions - Migration von Firebase zu Supabase

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseConfig } from './supabase-config.js';

/**
 * Singleton instance of Supabase client
 * @type {Object|null}
 */
let supabaseInstance = null;

/**
 * Check if running in Capacitor native app
 */
function isCapacitorNative() {
    return typeof window !== 'undefined' &&
        typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform();
}

/**
 * Custom storage adapter for Capacitor apps
 * Uses Capacitor Preferences (secure native storage) for better session persistence
 * Falls back to localStorage for web
 */
class CapacitorStorageAdapter {
    constructor() {
        this.isNative = isCapacitorNative();
        this.preferencesModule = null;
        this.cache = new Map(); // In-memory cache for sync access
        this.initialized = false;
        this.initPromise = this.init();
    }

    async init() {
        if (this.isNative) {
            try {
                const module = await import('@capacitor/preferences');
                this.preferencesModule = module.Preferences;
                // Load existing auth data into cache
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

        // Load common Supabase auth keys
        const keys = [
            'sb-' + new URL(supabaseConfig.url).hostname.split('.')[0] + '-auth-token'
        ];

        for (const key of keys) {
            try {
                const { value } = await this.preferencesModule.get({ key });
                if (value) {
                    this.cache.set(key, value);
                }
            } catch (e) {
                // Key doesn't exist yet
            }
        }
    }

    getItem(key) {
        // First check cache (for sync access that Supabase needs)
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        // Fall back to localStorage
        return localStorage.getItem(key);
    }

    setItem(key, value) {
        // Update cache immediately
        this.cache.set(key, value);
        // Update localStorage as backup
        localStorage.setItem(key, value);

        // Persist to native storage asynchronously
        if (this.isNative && this.preferencesModule) {
            this.preferencesModule.set({ key, value }).catch(e => {
                console.error('[Storage] Error saving to Preferences:', e);
            });
        }
    }

    removeItem(key) {
        // Remove from cache
        this.cache.delete(key);
        // Remove from localStorage
        localStorage.removeItem(key);

        // Remove from native storage asynchronously
        if (this.isNative && this.preferencesModule) {
            this.preferencesModule.remove({ key }).catch(e => {
                console.error('[Storage] Error removing from Preferences:', e);
            });
        }
    }
}

// Global storage adapter instance
let storageAdapter = null;

/**
 * Get or create storage adapter
 */
function getStorageAdapter() {
    if (!storageAdapter) {
        storageAdapter = new CapacitorStorageAdapter();
    }
    return storageAdapter;
}

/**
 * Initializes Supabase client
 * @returns {Object} Supabase client
 */
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
            detectSessionInUrl: !isCapacitorNative(), // Disable URL detection in native apps
            storage: storage
        }
    });

    // Set up session refresh on app resume for native apps
    if (isCapacitorNative()) {
        setupAppStateListener();
    }

    console.log('[Supabase] Initialization complete');
    return supabaseInstance;
}

/**
 * Setup listener to refresh session when app resumes from background
 */
async function setupAppStateListener() {
    try {
        const { App } = await import('@capacitor/app');

        App.addListener('appStateChange', async ({ isActive }) => {
            if (isActive && supabaseInstance) {
                console.log('[Supabase] App resumed, checking session...');
                try {
                    // Refresh the session when app comes to foreground
                    const { data, error } = await supabaseInstance.auth.getSession();
                    if (data?.session) {
                        console.log('[Supabase] Session valid, refreshing token...');
                        await supabaseInstance.auth.refreshSession();
                    } else if (error) {
                        console.log('[Supabase] Session error:', error.message);
                    }
                } catch (e) {
                    console.error('[Supabase] Error refreshing session:', e);
                }
            }
        });

        console.log('[Supabase] App state listener set up');
    } catch (e) {
        console.log('[Supabase] Could not set up app state listener:', e.message);
    }
}

/**
 * Gets the existing Supabase instance or initializes if not yet created
 * @returns {Object} Supabase client
 */
export function getSupabase() {
    return supabaseInstance || initSupabase();
}

// ============================================
// AUTH HELPER FUNCTIONS
// ============================================

/**
 * Sign up with email and password
 */
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

/**
 * Sign in with email and password
 */
export async function signIn(email, password) {
    const supabase = getSupabase();

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) throw error;
    return data;
}

/**
 * Sign out
 */
export async function signOut() {
    const supabase = getSupabase();

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
    const supabase = getSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Get current session
 */
export async function getSession() {
    const supabase = getSupabase();

    const { data: { session } } = await supabase.auth.getSession();
    return session;
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback) {
    const supabase = getSupabase();

    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
    const supabase = getSupabase();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password.html`
    });

    if (error) throw error;
}

// ============================================
// DATABASE HELPER FUNCTIONS
// ============================================

/**
 * Get user profile from profiles table
 */
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

/**
 * Update user profile
 */
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

/**
 * Get all clubs
 */
export async function getClubs() {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .order('name');

    if (error) throw error;
    return data;
}

/**
 * Get players in a club
 */
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

/**
 * Get matches for a club
 */
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

/**
 * Get leaderboard for a club
 */
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

/**
 * Get all sports
 */
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

/**
 * Subscribe to realtime changes
 */
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

/**
 * Unsubscribe from realtime changes
 */
export function unsubscribe(channel) {
    const supabase = getSupabase();
    supabase.removeChannel(channel);
}
