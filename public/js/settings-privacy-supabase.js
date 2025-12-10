// Settings Privacy Page - Supabase Version

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');

// Searchable (Player Search)
const searchableGlobal = document.getElementById('searchable-global');
const searchableClubOnly = document.getElementById('searchable-club-only');
const searchableFriendsOnly = document.getElementById('searchable-friends-only');
const searchableNone = document.getElementById('searchable-none');
const noClubWarning = document.getElementById('no-club-warning');

// Leaderboard Visibility
const leaderboardGlobal = document.getElementById('leaderboard-global');
const leaderboardClubOnly = document.getElementById('leaderboard-club-only');
const leaderboardFriendsOnly = document.getElementById('leaderboard-friends-only');
const leaderboardNone = document.getElementById('leaderboard-none');

// Matches Visibility
const matchesGlobal = document.getElementById('matches-global');
const matchesClubOnly = document.getElementById('matches-club-only');
const matchesFriendsOnly = document.getElementById('matches-friends-only');
const matchesNone = document.getElementById('matches-none');

// Save button
const savePrivacySettingsBtn = document.getElementById('save-privacy-settings-btn');
const privacyFeedback = document.getElementById('privacy-feedback');

let currentUser = null;
let currentUserData = null;

// Check auth state on load
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        // Get user profile from Supabase
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (!error && profile) {
            currentUserData = {
                id: currentUser.id,
                clubId: profile.club_id || null,
                privacySettings: profile.privacy_settings || {},
            };

            // Load privacy settings
            loadPrivacySettings(currentUserData);
        }

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Initialize on DOMContentLoaded or immediately if already loaded (for SPA navigation)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Listen for auth state changes
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        window.location.href = '/index.html';
    }
});

/**
 * Load privacy settings from user data
 */
function loadPrivacySettings(userData) {
    if (!userData) return;

    // Load searchable setting (default: 'global')
    const searchable = userData.privacySettings?.searchable || 'global';
    if (searchable === 'global') {
        searchableGlobal.checked = true;
    } else if (searchable === 'club_only') {
        searchableClubOnly.checked = true;
    } else if (searchable === 'friends_only') {
        searchableFriendsOnly.checked = true;
    } else if (searchable === 'none') {
        searchableNone.checked = true;
    } else {
        searchableGlobal.checked = true;
    }

    // Load leaderboard visibility setting (default: 'global')
    const leaderboardVisibility = userData.privacySettings?.leaderboard_visibility || 'global';
    if (leaderboardVisibility === 'global') {
        leaderboardGlobal.checked = true;
    } else if (leaderboardVisibility === 'club_only') {
        leaderboardClubOnly.checked = true;
    } else if (leaderboardVisibility === 'friends_only') {
        leaderboardFriendsOnly.checked = true;
    } else if (leaderboardVisibility === 'none') {
        leaderboardNone.checked = true;
    } else {
        leaderboardGlobal.checked = true;
    }

    // Load matches visibility setting (default: 'global')
    const matchesVisibility = userData.privacySettings?.matches_visibility || 'global';
    if (matchesVisibility === 'global') {
        matchesGlobal.checked = true;
    } else if (matchesVisibility === 'club_only') {
        matchesClubOnly.checked = true;
    } else if (matchesVisibility === 'friends_only') {
        matchesFriendsOnly.checked = true;
    } else if (matchesVisibility === 'none') {
        matchesNone.checked = true;
    } else {
        matchesGlobal.checked = true;
    }

    // Show warning if user has no club and selects club_only
    updateNoClubWarning(userData.clubId);

    // Add listeners to radio buttons to show/hide warning
    searchableGlobal.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableClubOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableFriendsOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    searchableNone.addEventListener('change', () => updateNoClubWarning(userData.clubId));
}

/**
 * Show/hide warning if user has no club
 */
function updateNoClubWarning(clubId) {
    if (!clubId && searchableClubOnly.checked) {
        noClubWarning.classList.remove('hidden');
    } else {
        noClubWarning.classList.add('hidden');
    }
}

/**
 * Save privacy settings
 */
savePrivacySettingsBtn?.addEventListener('click', async () => {
    if (!currentUser || !currentUserData) {
        privacyFeedback.textContent = 'Fehler: Nicht angemeldet';
        privacyFeedback.className = 'text-sm mt-3 text-center text-red-600';
        return;
    }

    try {
        savePrivacySettingsBtn.disabled = true;
        savePrivacySettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Speichere...';
        privacyFeedback.textContent = '';

        // Get selected values
        let searchable = 'global';
        if (searchableGlobal.checked) {
            searchable = 'global';
        } else if (searchableClubOnly.checked) {
            searchable = 'club_only';
        } else if (searchableFriendsOnly.checked) {
            searchable = 'friends_only';
        } else if (searchableNone.checked) {
            searchable = 'none';
        }

        let leaderboardVisibility = 'global';
        if (leaderboardGlobal.checked) {
            leaderboardVisibility = 'global';
        } else if (leaderboardClubOnly.checked) {
            leaderboardVisibility = 'club_only';
        } else if (leaderboardFriendsOnly.checked) {
            leaderboardVisibility = 'friends_only';
        } else if (leaderboardNone.checked) {
            leaderboardVisibility = 'none';
        }

        let matchesVisibility = 'global';
        if (matchesGlobal.checked) {
            matchesVisibility = 'global';
        } else if (matchesClubOnly.checked) {
            matchesVisibility = 'club_only';
        } else if (matchesFriendsOnly.checked) {
            matchesVisibility = 'friends_only';
        } else if (matchesNone.checked) {
            matchesVisibility = 'none';
        }

        // Update Supabase profiles table
        const newPrivacySettings = {
            ...currentUserData.privacySettings,
            searchable: searchable,
            leaderboard_visibility: leaderboardVisibility,
            matches_visibility: matchesVisibility,
        };

        console.log('[Privacy Settings] Saving privacy settings:', JSON.stringify(newPrivacySettings));

        const { error } = await supabase
            .from('profiles')
            .update({ privacy_settings: newPrivacySettings })
            .eq('id', currentUser.id);

        if (error) throw error;

        console.log('[Privacy Settings] Saved successfully!');

        // Update local data
        currentUserData.privacySettings = newPrivacySettings;

        privacyFeedback.textContent = '✓ Einstellungen erfolgreich gespeichert';
        privacyFeedback.className = 'text-sm mt-3 text-center text-green-600';

        savePrivacySettingsBtn.disabled = false;
        savePrivacySettingsBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Einstellungen speichern';
    } catch (error) {
        console.error('Error saving privacy settings:', error);
        privacyFeedback.textContent = `Fehler beim Speichern: ${error.message}`;
        privacyFeedback.className = 'text-sm mt-3 text-center text-red-600';

        savePrivacySettingsBtn.disabled = false;
        savePrivacySettingsBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Einstellungen speichern';
    }
});
