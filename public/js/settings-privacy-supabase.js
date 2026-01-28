// Datenschutz-Einstellungen - Supabase-Version

import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { getBlockedUsers, unblockUser } from './block-report-manager.js';

const supabase = getSupabase();

// Check for child_id parameter (guardian editing child's privacy settings)
const urlParams = new URLSearchParams(window.location.search);
const childId = urlParams.get('child_id');
let isChildMode = false;
let targetProfileId = null; // The profile ID being edited (user's own or child's)

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');

// Profile Visibility
const profileGlobal = document.getElementById('profile-global');
const profileClubOnly = document.getElementById('profile-club-only');
const profileFollowersOnly = document.getElementById('profile-followers-only');

// Suchbar (Spielersuche)
const searchableGlobal = document.getElementById('searchable-global');
const searchableClubOnly = document.getElementById('searchable-club-only');
const searchableFollowersOnly = document.getElementById('searchable-followers-only');
const searchableNone = document.getElementById('searchable-none');
const noClubWarning = document.getElementById('no-club-warning');

// Leaderboard Visibility
const leaderboardGlobal = document.getElementById('leaderboard-global');
const leaderboardClubOnly = document.getElementById('leaderboard-club-only');
const leaderboardFollowersOnly = document.getElementById('leaderboard-followers-only');
const leaderboardNone = document.getElementById('leaderboard-none');

// Matches Visibility
const matchesGlobal = document.getElementById('matches-global');
const matchesClubOnly = document.getElementById('matches-club-only');
const matchesFollowersOnly = document.getElementById('matches-followers-only');
const matchesNone = document.getElementById('matches-none');

// Speichern-Button
const savePrivacySettingsBtn = document.getElementById('save-privacy-settings-btn');
const privacyFeedback = document.getElementById('privacy-feedback');

let currentUser = null;
let currentUserData = null;

// Verify guardian has permission to edit this child's privacy settings
async function verifyGuardianAccess() {
    if (!childId) return true;

    const { data: guardianLink, error } = await supabase
        .from('guardian_links')
        .select('id, permissions')
        .eq('guardian_id', currentUser.id)
        .eq('child_id', childId)
        .single();

    if (error || !guardianLink) {
        console.error('Guardian access denied:', error);
        alert('Kein Zugriff auf die Privatsphäre-Einstellungen dieses Kindes.');
        window.location.href = '/guardian-dashboard.html';
        return false;
    }

    return true;
}

// Setup child mode UI
function setupChildModeUI(childProfile) {
    isChildMode = true;
    targetProfileId = childId;

    // Update page title
    const titleElement = document.querySelector('h1');
    if (titleElement) {
        titleElement.textContent = `Privatsphäre für ${childProfile.first_name}`;
    }
    document.title = `Privatsphäre für ${childProfile.first_name} - SC Champions`;

    // Update back link to include child_id
    const backLink = document.querySelector('a[href="/settings.html"]');
    if (backLink) {
        backLink.href = `/settings.html?child_id=${childId}`;
    }
}

// Auth-Status beim Laden prüfen
async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        // If editing child's privacy settings, verify access first
        if (childId) {
            const hasAccess = await verifyGuardianAccess();
            if (!hasAccess) return;

            // Load child's profile
            const { data: childProfile, error: childError } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', childId)
                .single();

            if (childError || !childProfile) {
                console.error('Child profile not found:', childError);
                window.location.href = '/guardian-dashboard.html';
                return;
            }

            // Setup child mode UI
            setupChildModeUI(childProfile);

            currentUserData = {
                id: childId,
                clubId: childProfile.club_id || null,
                privacySettings: childProfile.privacy_settings || {},
            };

            // Datenschutz-Einstellungen laden
            loadPrivacySettings(currentUserData);

            // Hide blocked users section for child mode (parents don't manage child's blocks)
            const blockedUsersSection = document.getElementById('blocked-users-list')?.closest('.bg-white');
            if (blockedUsersSection) {
                blockedUsersSection.style.display = 'none';
            }
        } else {
            // Normal mode - editing own privacy settings
            targetProfileId = currentUser.id;

            // Benutzerprofil aus Supabase abrufen
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

                // Datenschutz-Einstellungen laden
                loadPrivacySettings(currentUserData);

                // Load blocked users (only for own settings, not child's)
                loadBlockedUsersList();
            }
        }

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Bei DOMContentLoaded initialisieren oder sofort wenn bereits geladen (für SPA-Navigation)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

// Auf Auth-Status-Änderungen hören - nur bei explizitem Logout weiterleiten
onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

/**
 * Load privacy settings from user data
 */
function loadPrivacySettings(userData) {
    if (!userData) return;

    // Profilsichtbarkeits-Einstellung laden (Standard: 'global')
    const profileVisibility = userData.privacySettings?.profile_visibility || 'global';
    if (profileGlobal && profileClubOnly && profileFollowersOnly) {
        if (profileVisibility === 'global') {
            profileGlobal.checked = true;
        } else if (profileVisibility === 'club_only') {
            profileClubOnly.checked = true;
        } else if (profileVisibility === 'followers_only') {
            profileFollowersOnly.checked = true;
        } else {
            profileGlobal.checked = true;
        }
    }

    // Suchbar-Einstellung laden (Standard: 'global')
    const searchable = userData.privacySettings?.searchable || 'global';
    if (searchableGlobal && searchableClubOnly && searchableFollowersOnly && searchableNone) {
        if (searchable === 'global') {
            searchableGlobal.checked = true;
        } else if (searchable === 'club_only') {
            searchableClubOnly.checked = true;
        } else if (searchable === 'followers_only') {
            searchableFollowersOnly.checked = true;
        } else if (searchable === 'none') {
            searchableNone.checked = true;
        } else {
            searchableGlobal.checked = true;
        }
    }

    // Ranglisten-Sichtbarkeits-Einstellung laden (Standard: 'global')
    const leaderboardVisibility = userData.privacySettings?.leaderboard_visibility || 'global';
    if (leaderboardGlobal && leaderboardClubOnly && leaderboardFollowersOnly && leaderboardNone) {
        if (leaderboardVisibility === 'global') {
            leaderboardGlobal.checked = true;
        } else if (leaderboardVisibility === 'club_only') {
            leaderboardClubOnly.checked = true;
        } else if (leaderboardVisibility === 'followers_only') {
            leaderboardFollowersOnly.checked = true;
        } else if (leaderboardVisibility === 'none') {
            leaderboardNone.checked = true;
        } else {
            leaderboardGlobal.checked = true;
        }
    }

    // Match-Sichtbarkeits-Einstellung laden (Standard: 'global')
    const matchesVisibility = userData.privacySettings?.matches_visibility || 'global';
    if (matchesGlobal && matchesClubOnly && matchesFollowersOnly && matchesNone) {
        if (matchesVisibility === 'global') {
            matchesGlobal.checked = true;
        } else if (matchesVisibility === 'club_only') {
            matchesClubOnly.checked = true;
        } else if (matchesVisibility === 'followers_only') {
            matchesFollowersOnly.checked = true;
        } else if (matchesVisibility === 'none') {
            matchesNone.checked = true;
        } else {
            matchesGlobal.checked = true;
        }
    }

    // Warnung zeigen falls Benutzer keinen Verein hat und club_only wählt
    updateNoClubWarning(userData.clubId);

    // Listener zu Radio-Buttons hinzufügen um Warnung ein-/auszublenden
    if (searchableGlobal) searchableGlobal.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    if (searchableClubOnly) searchableClubOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    if (searchableFollowersOnly) searchableFollowersOnly.addEventListener('change', () => updateNoClubWarning(userData.clubId));
    if (searchableNone) searchableNone.addEventListener('change', () => updateNoClubWarning(userData.clubId));
}

/**
 * Show/hide warning if user has no club
 */
function updateNoClubWarning(clubId) {
    if (!noClubWarning) return;
    if (!clubId && searchableClubOnly?.checked) {
        noClubWarning.classList.remove('hidden');
    } else {
        noClubWarning.classList.add('hidden');
    }
}

/**
 * Load and display blocked users list
 */
async function loadBlockedUsersList() {
    const container = document.getElementById('blocked-users-list');
    if (!container) return;

    try {
        const blockedUsers = await getBlockedUsers();

        if (!blockedUsers || blockedUsers.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-gray-500">
                    <i class="fas fa-check-circle text-green-500 mr-2"></i>
                    Du hast keine Nutzer blockiert.
                </div>
            `;
            return;
        }

        const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

        container.innerHTML = blockedUsers.map(user => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg" data-blocked-user-id="${user.blocked_id}">
                <div class="flex items-center gap-3">
                    <img
                        src="${user.blocked_avatar_url || DEFAULT_AVATAR}"
                        alt="${user.blocked_first_name}"
                        class="w-10 h-10 rounded-full object-cover"
                        onerror="this.src='${DEFAULT_AVATAR}'"
                    />
                    <div>
                        <p class="font-medium text-gray-900">${escapeHtml(user.blocked_first_name || '')} ${escapeHtml(user.blocked_last_name || '')}</p>
                        <p class="text-xs text-gray-500">Blockiert am ${new Date(user.blocked_at).toLocaleDateString('de-DE')}</p>
                    </div>
                </div>
                <button
                    onclick="window.handleUnblockUser('${user.blocked_id}')"
                    class="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
                >
                    Aufheben
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error('[Privacy Settings] Error loading blocked users:', err);
        container.innerHTML = `
            <div class="text-center py-4 text-red-500">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                Fehler beim Laden der blockierten Nutzer.
            </div>
        `;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global function to handle unblock
window.handleUnblockUser = async function(userId) {
    if (!confirm('Möchtest du die Blockierung dieses Nutzers wirklich aufheben?')) {
        return;
    }

    const result = await unblockUser(userId);
    if (result.success) {
        // Remove the user from the list with animation
        const userElement = document.querySelector(`[data-blocked-user-id="${userId}"]`);
        if (userElement) {
            userElement.style.opacity = '0';
            userElement.style.transform = 'translateX(20px)';
            userElement.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                userElement.remove();
                // Check if list is now empty
                const container = document.getElementById('blocked-users-list');
                if (container && container.children.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-4 text-gray-500">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Du hast keine Nutzer blockiert.
                        </div>
                    `;
                }
            }, 300);
        }
    }
};

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

        // Profilsichtbarkeit abrufen
        let profileVisibility = 'global';
        if (profileGlobal?.checked) {
            profileVisibility = 'global';
        } else if (profileClubOnly?.checked) {
            profileVisibility = 'club_only';
        } else if (profileFollowersOnly?.checked) {
            profileVisibility = 'followers_only';
        }

        // Ausgewählte Werte abrufen
        let searchable = 'global';
        if (searchableGlobal?.checked) {
            searchable = 'global';
        } else if (searchableClubOnly?.checked) {
            searchable = 'club_only';
        } else if (searchableFollowersOnly?.checked) {
            searchable = 'followers_only';
        } else if (searchableNone?.checked) {
            searchable = 'none';
        }

        let leaderboardVisibility = 'global';
        if (leaderboardGlobal?.checked) {
            leaderboardVisibility = 'global';
        } else if (leaderboardClubOnly?.checked) {
            leaderboardVisibility = 'club_only';
        } else if (leaderboardFollowersOnly?.checked) {
            leaderboardVisibility = 'followers_only';
        } else if (leaderboardNone?.checked) {
            leaderboardVisibility = 'none';
        }

        let matchesVisibility = 'global';
        if (matchesGlobal?.checked) {
            matchesVisibility = 'global';
        } else if (matchesClubOnly?.checked) {
            matchesVisibility = 'club_only';
        } else if (matchesFollowersOnly?.checked) {
            matchesVisibility = 'followers_only';
        } else if (matchesNone?.checked) {
            matchesVisibility = 'none';
        }

        // Supabase profiles-Tabelle aktualisieren
        const newPrivacySettings = {
            ...currentUserData.privacySettings,
            profile_visibility: profileVisibility,
            searchable: searchable,
            leaderboard_visibility: leaderboardVisibility,
            matches_visibility: matchesVisibility,
        };

        console.log('[Privacy Settings] Saving privacy settings:', JSON.stringify(newPrivacySettings));

        const { error } = await supabase
            .from('profiles')
            .update({ privacy_settings: newPrivacySettings })
            .eq('id', targetProfileId || currentUser.id);

        if (error) throw error;

        console.log('[Privacy Settings] Saved successfully!');

        // Lokale Daten aktualisieren
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
