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
 * Initializes Supabase client
 * @returns {Object} Supabase client
 */
export function initSupabase() {
    if (supabaseInstance) {
        return supabaseInstance;
    }

    console.log('[Supabase] Initializing...');
    console.log('[Supabase] Is Capacitor native:', isCapacitorNative());

    supabaseInstance = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            // Für Capacitor: localStorage verwenden
            storage: window.localStorage
        }
    });

    console.log('[Supabase] Initialization complete');
    return supabaseInstance;
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
