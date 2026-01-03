/** Ranglisten-Einstellungen (Supabase-Version) */

const DEFAULT_PREFERENCES = {
    effort: true,
    season: true,
    skill: true,
    ranks: true,
    doubles: true,
};

const DEFAULT_PREFERENCES_NO_CLUB = {
    effort: false,    // Für Spieler ohne Verein versteckt
    season: false,    // Für Spieler ohne Verein versteckt
    skill: true,      // Sichtbar (globales Skill-Ranking)
    ranks: false,     // Für Spieler ohne Verein versteckt
    doubles: true,    // Sichtbar (globales Doppel-Ranking)
};

let supabaseClient = null;

function getDefaultPreferences(userData) {
    const hasClub = userData.clubId !== null && userData.clubId !== undefined;
    return hasClub ? DEFAULT_PREFERENCES : DEFAULT_PREFERENCES_NO_CLUB;
}

/** Initialisiert die Ranglisten-Einstellungen */
export function initializeLeaderboardPreferences(userData, supabase) {
    supabaseClient = supabase;
    const hasClub = userData.clubId !== null && userData.clubId !== undefined;

    if (!hasClub) {
        const clubOnlyCheckboxes = ['pref-effort', 'pref-season', 'pref-ranks'];
        clubOnlyCheckboxes.forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.disabled = true;
                checkbox.checked = false;
                const label = checkbox.closest('label');
                if (label) {
                    label.classList.add('opacity-50', 'cursor-not-allowed');
                    label.title = 'Nur für Vereinsmitglieder verfügbar';
                }
            }
        });
    }

    loadPreferences(userData);

    const checkboxes = document.querySelectorAll('.leaderboard-pref-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
            await savePreferences(userData, supabase);
            applyPreferences();
        });
    });

    applyPreferences();
}

function loadPreferences(userData) {
    const defaultPrefs = getDefaultPreferences(userData);
    const prefs = userData.leaderboardPreferences || defaultPrefs;

    document.getElementById('pref-effort').checked = prefs.effort !== false;
    document.getElementById('pref-season').checked = prefs.season !== false;
    document.getElementById('pref-skill').checked = prefs.skill !== false;
    document.getElementById('pref-ranks').checked = prefs.ranks !== false;
    document.getElementById('pref-doubles').checked = prefs.doubles !== false;
}

async function savePreferences(userData, supabase) {
    const prefs = {
        effort: document.getElementById('pref-effort').checked,
        season: document.getElementById('pref-season').checked,
        skill: document.getElementById('pref-skill').checked,
        ranks: document.getElementById('pref-ranks').checked,
        doubles: document.getElementById('pref-doubles').checked,
    };

    try {
        const { error } = await supabase
            .from('profiles')
            .update({
                leaderboard_preferences: prefs
            })
            .eq('id', userData.id);

        if (error) throw error;
        console.log('Leaderboard preferences saved:', prefs);
    } catch (error) {
        console.error('Error saving leaderboard preferences:', error);
    }
}

/** Wendet die Einstellungen auf die Ranglisten-Tabs an */
export function applyPreferences() {
    const prefs = {
        effort: document.getElementById('pref-effort')?.checked ?? true,
        season: document.getElementById('pref-season')?.checked ?? true,
        skill: document.getElementById('pref-skill')?.checked ?? true,
        ranks: document.getElementById('pref-ranks')?.checked ?? true,
        doubles: document.getElementById('pref-doubles')?.checked ?? true,
    };

    const tabButtons = {
        effort: document.getElementById('tab-effort'),
        season: document.getElementById('tab-season'),
        skill: document.getElementById('tab-skill'),
        ranks: document.getElementById('tab-ranks'),
        doubles: document.getElementById('tab-doubles'),
    };

    const tabContents = {
        effort: document.getElementById('content-effort'),
        season: document.getElementById('content-season'),
        skill: document.getElementById('content-skill'),
        ranks: document.getElementById('content-ranks'),
        doubles: document.getElementById('content-doubles'),
    };

    Object.keys(tabButtons).forEach(key => {
        const button = tabButtons[key];
        const content = tabContents[key];

        if (prefs[key]) {
            if (button) button.classList.remove('hidden');
            if (content) content.classList.remove('hidden');
        } else {
            if (button) button.classList.add('hidden');
            if (content) content.classList.add('hidden');
        }
    });

    ensureValidActiveTab(prefs);
}

function ensureValidActiveTab(prefs) {
    const tabButtons = document.querySelectorAll('.leaderboard-tab-btn');
    let hasActiveVisibleTab = false;

    tabButtons.forEach(button => {
        if (
            button.classList.contains('border-indigo-600') &&
            !button.classList.contains('hidden')
        ) {
            hasActiveVisibleTab = true;
        }
    });

    if (!hasActiveVisibleTab) {
        const firstVisibleButton = Array.from(tabButtons).find(
            btn => !btn.classList.contains('hidden')
        );
        if (firstVisibleButton) {
            firstVisibleButton.click();
        }
    }
}

/** Gibt die aktuellen Einstellungen zurück */
export function getCurrentPreferences() {
    return {
        effort: document.getElementById('pref-effort')?.checked ?? true,
        season: document.getElementById('pref-season')?.checked ?? true,
        skill: document.getElementById('pref-skill')?.checked ?? true,
        ranks: document.getElementById('pref-ranks')?.checked ?? true,
        doubles: document.getElementById('pref-doubles')?.checked ?? true,
    };
}
