// Settings Support Page - Supabase Version

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
                role: profile.role || 'player',
                tutorialCompleted: profile.tutorial_completed || {},
            };

            // Update tutorial status
            updateTutorialStatus(currentUserData);
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
 * Tutorial-Status anzeigen
 */
function updateTutorialStatus(userData) {
    const role = userData?.role;
    const tutorialSection = document.getElementById('tutorial-section');
    if (!tutorialSection) return;

    tutorialSection.style.display = 'block';

    // Player Tutorial Status
    const playerTutorialCompleted = userData?.tutorialCompleted?.player || false;
    const playerBadge = document.getElementById('tutorial-badge-player');
    const playerButton = document.getElementById('start-player-tutorial-btn');
    const playerCard = document.getElementById('player-tutorial-card');

    if (playerBadge) {
        if (playerTutorialCompleted) {
            playerBadge.className = 'tutorial-badge tutorial-badge-completed';
            playerBadge.innerHTML = '<i class="fas fa-check mr-1"></i> Abgeschlossen';
        } else {
            playerBadge.className = 'tutorial-badge tutorial-badge-pending';
            playerBadge.textContent = 'Ausstehend';
        }
    }

    if (playerButton && playerCard) {
        if (role === 'player' || role === 'admin') {
            playerCard.style.display = 'block';
            if (playerTutorialCompleted) {
                playerButton.innerHTML = '<i class="fas fa-redo mr-2"></i> Tutorial wiederholen';
            } else {
                playerButton.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Tutorial starten';
            }
        } else {
            playerCard.style.display = 'none';
        }
    }
}

/**
 * Player-Tutorial starten
 */
document.getElementById('start-player-tutorial-btn')?.addEventListener('click', () => {
    // Zur Dashboard-Seite navigieren und Tutorial starten
    if (window.location.pathname.includes('dashboard.html')) {
        // Bereits auf der Dashboard-Seite
        if (typeof window.startPlayerTutorial === 'function') {
            window.startPlayerTutorial();
        }
    } else {
        // Zur Dashboard-Seite navigieren und Tutorial-Flag setzen
        sessionStorage.setItem('startTutorial', 'player');
        window.location.href = '/dashboard.html';
    }
});
