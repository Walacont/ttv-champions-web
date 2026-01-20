// Einstellungen - Rechtliches (Supabase-Version)
// DSGVO-Datenexport und Account-Löschung

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

// Check for child_id parameter (guardian managing child's legal settings)
const urlParams = new URLSearchParams(window.location.search);
const childId = urlParams.get('child_id');
let isChildMode = false;
let targetProfileId = null; // The profile ID being managed (user's own or child's)

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');

let currentUser = null;
let currentUserData = null;

// Verify guardian has permission to manage this child's legal settings
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
        alert('Kein Zugriff auf die Rechtsinformationen dieses Kindes.');
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
        titleElement.textContent = `Rechtsinformationen für ${childProfile.first_name}`;
    }
    document.title = `Rechtsinformationen für ${childProfile.first_name} - SC Champions`;

    // Update back link to include child_id
    const backLink = document.querySelector('a[href="/settings.html"]');
    if (backLink) {
        backLink.href = `/settings.html?child_id=${childId}`;
    }

    // Update warning text for child account deletion
    const deleteWarning = document.querySelector('#delete-section p');
    if (deleteWarning) {
        deleteWarning.textContent = `Hier kannst du das Profil von ${childProfile.first_name} unwiderruflich löschen.`;
    }
}

async function initializeAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (session && session.user) {
        currentUser = session.user;

        // If managing child's legal settings, verify access first
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
                first_name: childProfile.first_name || '',
                last_name: childProfile.last_name || '',
                email: childProfile.email || '',
                role: childProfile.role || 'player',
                club_id: childProfile.club_id || null,
            };
        } else {
            // Normal mode - managing own legal settings
            targetProfileId = currentUser.id;

            const { data: profile, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single();

            if (!error && profile) {
                currentUserData = {
                    id: currentUser.id,
                    first_name: profile.first_name || '',
                    last_name: profile.last_name || '',
                    email: profile.email || currentUser.email,
                    role: profile.role || 'player',
                    club_id: profile.club_id || null,
                };
            }
        }

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}

onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
        window.location.href = '/index.html';
    }
});

/** Exportiert alle Nutzerdaten als JSON (DSGVO Art. 20) */
document.getElementById('export-data-btn')?.addEventListener('click', async () => {
    const exportBtn = document.getElementById('export-data-btn');
    const feedbackEl = document.getElementById('export-feedback');

    if (!currentUser) {
        feedbackEl.textContent = 'Fehler: Nicht angemeldet';
        feedbackEl.className = 'text-sm mt-2 text-red-600';
        return;
    }

    try {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Exportiere Daten...';
        feedbackEl.textContent = '';

        const profileId = targetProfileId || currentUser.id;

        const { data: userData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', profileId)
            .single();

        if (profileError) throw profileError;

        const { data: matches, error: matchesError } = await supabase
            .from('matches')
            .select('*')
            .contains('player_ids', [profileId]);

        if (matchesError) console.error('Error fetching matches:', matchesError);

        let doublesMatches = [];
        if (userData?.club_id) {
            const { data: doublesData, error: doublesError } = await supabase
                .from('doubles_matches')
                .select('*')
                .eq('club_id', userData.club_id)
                .contains('player_ids', [profileId]);

            if (!doublesError) doublesMatches = doublesData || [];
        }

        let attendance = [];
        if (userData?.role === 'player') {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .contains('present_player_ids', [profileId]);

            if (!attendanceError) attendance = attendanceData || [];
        } else if ((userData?.role === 'coach' || userData?.role === 'head_coach') && userData?.club_id) {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .eq('club_id', userData.club_id);

            if (!attendanceError) attendance = attendanceData || [];
        }

        const exportData = {
            exportDate: new Date().toISOString(),
            profile: {
                userId: profileId,
                email: userData?.email || (isChildMode ? '' : currentUser.email),
                firstName: userData?.first_name,
                lastName: userData?.last_name,
                birthdate: userData?.birthdate,
                gender: userData?.gender,
                photoURL: userData?.avatar_url,
                eloRating: userData?.elo_rating,
                xp: userData?.xp,
                rankName: userData?.rank_name,
                clubId: userData?.club_id,
                role: userData?.role,
                createdAt: userData?.created_at,
            },
            statistics: {
                totalMatches: (matches?.length || 0) + doublesMatches.length,
                singlesMatches: matches?.length || 0,
                doublesMatches: doublesMatches.length,
                trainingAttendance: attendance.length,
            },
            matches: matches || [],
            doublesMatches: doublesMatches,
            attendance: attendance,
        };

        const fileName = isChildMode
            ? `sc-champions-datenexport-${userData?.first_name || 'kind'}-${new Date().toISOString().split('T')[0]}.json`
            : `sc-champions-datenexport-${new Date().toISOString().split('T')[0]}.json`;

        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);

        feedbackEl.textContent = '✓ Daten erfolgreich heruntergeladen';
        feedbackEl.className = 'text-sm mt-2 text-green-600';
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="fas fa-file-download mr-2"></i>Daten herunterladen';
    } catch (error) {
        console.error('Error exporting data:', error);
        feedbackEl.textContent = `Fehler beim Export: ${error.message}`;
        feedbackEl.className = 'text-sm mt-2 text-red-600';
        exportBtn.disabled = false;
        exportBtn.innerHTML = '<i class="fas fa-file-download mr-2"></i>Daten herunterladen';
    }
});

/** Löscht den Account komplett aus der Datenbank (Hard Delete) */
document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
    if (!currentUser) {
        alert('Fehler: Nicht angemeldet');
        return;
    }

    const profileId = targetProfileId || currentUser.id;
    const isChild = isChildMode;
    const childName = isChild ? `${currentUserData?.first_name || ''} ${currentUserData?.last_name || ''}`.trim() : '';

    const confirmMessage = isChild
        ? `⚠️ WARNUNG: Vollständige Profil-Löschung\n\n` +
          `Bist du sicher, dass du das Profil von ${childName} KOMPLETT löschen möchtest?\n\n` +
          `Was passiert:\n` +
          `• ALLE Daten werden vollständig gelöscht\n` +
          `• Alle Spiele und Match-Historie werden entfernt\n` +
          `• Alle Statistiken werden gelöscht\n` +
          `• Alle Aktivitäten und Beiträge werden entfernt\n` +
          `• Diese Aktion kann NICHT rückgängig gemacht werden!\n\n` +
          `Empfehlung: Lade zuerst die Daten herunter.\n\n` +
          `Fortfahren?`
        : `⚠️ WARNUNG: Vollständige Account-Löschung\n\n` +
          `Bist du sicher, dass du deinen Account KOMPLETT löschen möchtest?\n\n` +
          `Was passiert:\n` +
          `• ALLE deine Daten werden vollständig gelöscht\n` +
          `• Alle Spiele und Match-Historie werden entfernt\n` +
          `• Alle Statistiken werden gelöscht\n` +
          `• Alle Aktivitäten und Beiträge werden entfernt\n` +
          `• Diese Aktion kann NICHT rückgängig gemacht werden!\n\n` +
          `Empfehlung: Lade zuerst deine Daten herunter.\n\n` +
          `Fortfahren?`;

    const confirmed = confirm(confirmMessage);

    if (!confirmed) return;

    const doubleConfirm = prompt(
        'Bitte tippe "LÖSCHEN" ein, um die vollständige Löschung zu bestätigen:'
    );

    if (doubleConfirm !== 'LÖSCHEN') {
        alert('Löschung abgebrochen.');
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');

    try {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Lösche alle Daten...';

        // Use hard_delete_account for complete deletion
        const { data, error } = await supabase.rpc('hard_delete_account', {
            p_user_id: profileId
        });

        if (error) throw error;

        // Check if the function returned an error
        if (data && data.success === false) {
            throw new Error(data.error || 'Unbekannter Fehler');
        }

        if (isChild) {
            // For child accounts, redirect back to guardian dashboard
            alert(
                `Das Profil von ${childName} wurde vollständig gelöscht.\n\n` +
                'Du wirst zum Vormund-Dashboard weitergeleitet.'
            );
            window.location.href = '/guardian-dashboard.html';
        } else {
            // For own account, sign out
            alert(
                'Dein Account und alle Daten wurden vollständig gelöscht.\n\n' +
                'Du wirst jetzt abgemeldet.'
            );
            await supabase.auth.signOut();
            window.location.href = '/index.html';
        }
    } catch (error) {
        console.error('Error deleting account:', error);
        alert(`Fehler beim Löschen: ${error.message}`);
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt mr-2"></i>Account unwiderruflich löschen';
    }
});
