// Settings Legal Page - Supabase Version

import { getSupabase, onAuthStateChange } from './supabase-init.js';

const supabase = getSupabase();

const pageLoader = document.getElementById('page-loader');
const mainContent = document.getElementById('main-content');

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
                first_name: profile.first_name || '',
                last_name: profile.last_name || '',
                email: profile.email || currentUser.email,
                role: profile.role || 'player',
                club_id: profile.club_id || null,
            };
        }

        pageLoader.style.display = 'none';
        mainContent.style.display = 'block';
    } else {
        window.location.href = '/index.html';
    }
}

// Initialize on DOMContentLoaded or immediately if already loaded
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
 * Export all user data as JSON file (GDPR Art. 20)
 */
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

        // Get user data from profiles
        const { data: userData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (profileError) throw profileError;

        // Get all matches (singles)
        const { data: matches, error: matchesError } = await supabase
            .from('matches')
            .select('*')
            .contains('player_ids', [currentUser.id]);

        if (matchesError) console.error('Error fetching matches:', matchesError);

        // Get all doubles matches
        let doublesMatches = [];
        if (userData?.club_id) {
            const { data: doublesData, error: doublesError } = await supabase
                .from('doubles_matches')
                .select('*')
                .eq('club_id', userData.club_id)
                .contains('player_ids', [currentUser.id]);

            if (!doublesError) doublesMatches = doublesData || [];
        }

        // Get attendance records
        let attendance = [];
        if (userData?.role === 'player') {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .contains('present_player_ids', [currentUser.id]);

            if (!attendanceError) attendance = attendanceData || [];
        } else if ((userData?.role === 'coach' || userData?.role === 'head_coach') && userData?.club_id) {
            const { data: attendanceData, error: attendanceError } = await supabase
                .from('attendance')
                .select('*')
                .eq('club_id', userData.club_id);

            if (!attendanceError) attendance = attendanceData || [];
        }

        // Compile all data
        const exportData = {
            exportDate: new Date().toISOString(),
            profile: {
                userId: currentUser.id,
                email: currentUser.email,
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

        // Create and download JSON file
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sc-champions-datenexport-${new Date().toISOString().split('T')[0]}.json`;
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

/**
 * Delete account with anonymization
 */
document.getElementById('delete-account-btn')?.addEventListener('click', async () => {
    if (!currentUser) {
        alert('Fehler: Nicht angemeldet');
        return;
    }

    // Show confirmation dialog
    const confirmed = confirm(
        '⚠️ WARNUNG: Account-Löschung\n\n' +
        'Bist du sicher, dass du deinen Account löschen möchtest?\n\n' +
        'Was passiert:\n' +
        '• Dein Account wird deaktiviert\n' +
        '• Persönliche Daten werden gelöscht\n' +
        '• Dein Name wird durch "Gelöschter Nutzer" ersetzt\n' +
        '• Match-Historie bleibt anonymisiert erhalten\n' +
        '• Diese Aktion kann NICHT rückgängig gemacht werden!\n\n' +
        'Empfehlung: Lade zuerst deine Daten herunter.\n\n' +
        'Fortfahren?'
    );

    if (!confirmed) return;

    // Second confirmation
    const doubleConfirm = prompt(
        'Bitte tippe "LÖSCHEN" ein, um die Account-Löschung zu bestätigen:'
    );

    if (doubleConfirm !== 'LÖSCHEN') {
        alert('Account-Löschung abgebrochen.');
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');

    try {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Lösche Account...';

        // Call Supabase RPC function to anonymize account
        const { data, error } = await supabase.rpc('anonymize_account', {
            p_user_id: currentUser.id
        });

        if (error) throw error;

        alert(
            'Dein Account wurde erfolgreich anonymisiert.\n\n' +
            'Du wirst jetzt abgemeldet.'
        );

        // Sign out user
        await supabase.auth.signOut();
        window.location.href = '/index.html';
    } catch (error) {
        console.error('Error deleting account:', error);
        alert(`Fehler beim Löschen des Accounts: ${error.message}`);
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="fas fa-trash-alt mr-2"></i>Account unwiderruflich löschen';
    }
});
