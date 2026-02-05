/**
 * Haupt-App-Modul für TTV Champions Prototyp
 * PWA mit Hybrid-SPA-Ansatz
 *
 * Features:
 * - Service Worker für Caching
 * - SPA-artiges Routing (Links werden abgefangen, Inhalt per AJAX nachgeladen)
 * - Ladebalken für flüssige Übergänge
 */

import { supabase, initAuth, getCurrentProfile, isLoggedIn, isCoach, isHeadCoach, isAdmin, logout, getRole } from './supabase-client.js';
import { calculateRank, getRankProgress, createRankBadge, createRankProgressDisplay } from './ranks.js';
import { updateNotificationBadge, initNotificationListener, getNotifications, createNotificationDropdown } from './notifications.js';
import { getFeed, renderFeedEntry, createEmptyFeed, createFeedFilters, FEED_FILTERS } from './feed.js';
import {
    getSkillLeaderboard, getEffortLeaderboard, getSeasonLeaderboard,
    getRanksOverview, getDoublesLeaderboard,
    findEloRival, findXpRival,
    createLeaderboardTabs, createLeaderboardRow, createRanksOverviewDisplay, createDoublesLeaderboardDisplay, createRivalsDisplay,
    LEADERBOARD_TYPES
} from './leaderboards.js';

// ============================================
// APP STATE
// ============================================

let app = {
    profile: null,
    isInitialized: false,
    currentPage: null,
    isNavigating: false
};

// ============================================
// SPA ROUTER (Hybrid-Ansatz)
// ============================================

/**
 * Initialisiert den SPA-Router
 * Fängt Link-Clicks ab und lädt Inhalte per AJAX nach
 */
function initSpaRouter() {
    // Alle internen Links abfangen
    document.addEventListener('click', handleLinkClick);

    // Browser-Navigation (Zurück/Vor) behandeln
    window.addEventListener('popstate', handlePopState);

    console.log('[SPA] Router initialized');
}

/**
 * Behandelt Klicks auf Links
 */
function handleLinkClick(event) {
    const link = event.target.closest('a');

    if (!link) return;

    const href = link.getAttribute('href');

    // Nur interne HTML-Links behandeln
    if (!href ||
        href.startsWith('http') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        !href.endsWith('.html')) {
        return;
    }

    // Login-Seite normal laden (hat eigene Scripts)
    if (href.includes('login.html')) {
        return;
    }

    event.preventDefault();
    navigateTo(href);
}

/**
 * Behandelt Browser-Navigation (Zurück/Vor-Buttons)
 */
function handlePopState(event) {
    if (event.state?.page) {
        navigateTo(event.state.page, false);
    }
}

/**
 * Navigiert zu einer neuen Seite (SPA-artig)
 *
 * @param {string} url - Ziel-URL
 * @param {boolean} pushState - History-Eintrag erstellen?
 */
async function navigateTo(url, pushState = true) {
    if (app.isNavigating) return;
    app.isNavigating = true;

    // Ladebalken anzeigen
    showPageLoader();

    try {
        // Seite per fetch laden
        const response = await fetch(url);
        if (!response.ok) throw new Error('Seite nicht gefunden');

        const html = await response.text();

        // Nur den main-Inhalt extrahieren
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newMain = doc.querySelector('#app-main');
        const newTitle = doc.querySelector('title')?.textContent;

        if (newMain) {
            // Inhalt ersetzen
            const currentMain = document.getElementById('app-main');
            currentMain.innerHTML = newMain.innerHTML;

            // Titel aktualisieren
            if (newTitle) {
                document.title = newTitle;
            }

            // History aktualisieren
            if (pushState) {
                history.pushState({ page: url }, newTitle || '', url);
            }

            // Aktiven Nav-Item aktualisieren
            updateActiveNavItem(url);

            // Seiten-spezifische Initialisierung
            app.currentPage = url;
            await initPageContent(url);
        }
    } catch (error) {
        console.error('[SPA] Navigation failed:', error);
        // Fallback: Normale Navigation
        window.location.href = url;
    } finally {
        hidePageLoader();
        app.isNavigating = false;
    }
}

/**
 * Zeigt den Ladebalken an
 */
function showPageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        loader.classList.remove('hidden');
        const bar = loader.querySelector('div');
        if (bar) {
            bar.style.width = '30%';
            setTimeout(() => bar.style.width = '70%', 100);
        }
    }
}

/**
 * Versteckt den Ladebalken
 */
function hidePageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        const bar = loader.querySelector('div');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => {
                loader.classList.add('hidden');
                bar.style.width = '0%';
            }, 200);
        }
    }
}

/**
 * Aktualisiert den aktiven Navigation-Item
 */
function updateActiveNavItem(url) {
    const nav = document.getElementById('app-nav');
    if (!nav) return;

    nav.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href');
        if (href && url.includes(href.replace('./', ''))) {
            item.classList.remove('text-gray-600');
            item.classList.add('text-blue-600');
        } else {
            item.classList.remove('text-blue-600');
            item.classList.add('text-gray-600');
        }
    });
}

/**
 * Initialisiert Seiten-spezifischen Content nach SPA-Navigation
 */
async function initPageContent(url) {
    if (url.includes('index.html') || url === '/' || url === '') {
        await initDashboard();
    } else if (url.includes('profile.html')) {
        await initProfile();
    } else if (url.includes('leaderboards.html')) {
        await initLeaderboards();
    } else if (url.includes('matches.html')) {
        await initMatches();
    } else if (url.includes('training.html')) {
        await initTraining();
    } else if (url.includes('coach.html')) {
        await initCoachDashboard();
    }
}

// ============================================
// ROLLENBASIERTE WEITERLEITUNG
// ============================================

/**
 * Gibt die Ziel-URL basierend auf der Benutzerrolle zurück
 * (Analog zur Logik im Main Branch)
 */
function getRoleBasedRedirectUrl() {
    const role = getRole();

    switch (role) {
        case 'admin':
            // Admin geht zum Coach Dashboard (kein separates Admin-Dashboard im Prototyp)
            return 'coach.html';
        case 'head_coach':
            return 'coach.html';
        case 'coach':
            return 'coach.html';
        case 'player':
        default:
            return 'index.html';
    }
}

// ============================================
// APP INITIALISIERUNG
// ============================================

/**
 * Initialisiert die App
 */
export async function initApp() {
    if (app.isInitialized) return;

    // Auth initialisieren
    const { profile } = await initAuth();
    app.profile = profile;

    // Prüfen ob eingeloggt
    if (!isLoggedIn()) {
        // Auf Login-Seite umleiten (außer wir sind schon dort)
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
            return;
        }
    } else {
        // Rollenbasierte Weiterleitung wenn auf Login-Seite (wie im Main Branch)
        if (window.location.pathname.includes('login.html')) {
            const targetUrl = getRoleBasedRedirectUrl();
            window.location.href = targetUrl;
            return;
        }
    }

    // Header und Navigation rendern
    renderHeader();
    renderNavigation();

    // Benachrichtigungen initialisieren
    if (isLoggedIn()) {
        await updateNotificationBadge();
        initNotificationListener(() => updateNotificationBadge());
    }

    app.isInitialized = true;

    // SPA Router initialisieren
    initSpaRouter();

    // Seiten-spezifische Initialisierung
    initPage();
}

/**
 * Initialisiert die aktuelle Seite
 */
function initPage() {
    const path = window.location.pathname;

    if (path.includes('index.html') || path.endsWith('/')) {
        initDashboard();
    } else if (path.includes('profile.html')) {
        initProfile();
    } else if (path.includes('leaderboards.html')) {
        initLeaderboards();
    } else if (path.includes('matches.html')) {
        initMatches();
    } else if (path.includes('training.html')) {
        initTraining();
    } else if (path.includes('coach.html')) {
        initCoachDashboard();
    }
}

// ============================================
// HEADER & NAVIGATION
// ============================================

function renderHeader() {
    const header = document.getElementById('app-header');
    if (!header) return;

    const profile = getCurrentProfile();

    header.innerHTML = `
        <div class="bg-white shadow-sm border-b border-gray-200">
            <div class="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                <a href="index.html" class="flex items-center gap-2">
                    <span class="text-2xl">🏓</span>
                    <span class="font-bold text-xl text-gray-900">TTV Champions</span>
                </a>

                <div class="flex items-center gap-4">
                    ${profile ? `
                        <!-- Benachrichtigungen -->
                        <div class="relative" id="notification-container">
                            <button id="notification-btn" class="relative p-2 text-gray-600 hover:text-gray-900">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                <span id="notification-badge"
                                      class="hidden absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                </span>
                            </button>
                        </div>

                        <!-- Profil -->
                        <a href="profile.html" class="flex items-center gap-2 text-gray-700 hover:text-gray-900">
                            <div class="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                ${profile.first_name?.charAt(0) || '?'}
                            </div>
                        </a>
                    ` : `
                        <a href="login.html" class="text-blue-600 hover:text-blue-800">Anmelden</a>
                    `}
                </div>
            </div>
        </div>
    `;

    // Event-Listener für Benachrichtigungen
    const notificationBtn = document.getElementById('notification-btn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', toggleNotificationDropdown);
    }
}

async function toggleNotificationDropdown() {
    const container = document.getElementById('notification-container');
    let dropdown = document.getElementById('notification-dropdown');

    if (dropdown) {
        dropdown.remove();
        return;
    }

    const notifications = await getNotifications({ limit: 10 });
    container.insertAdjacentHTML('beforeend', createNotificationDropdown(notifications));

    // Click außerhalb schließt Dropdown
    setTimeout(() => {
        document.addEventListener('click', closeNotificationDropdown);
    }, 100);
}

function closeNotificationDropdown(e) {
    const dropdown = document.getElementById('notification-dropdown');
    const container = document.getElementById('notification-container');

    if (dropdown && !container.contains(e.target)) {
        dropdown.remove();
        document.removeEventListener('click', closeNotificationDropdown);
    }
}

function renderNavigation() {
    const nav = document.getElementById('app-nav');
    if (!nav || !isLoggedIn()) return;

    const profile = getCurrentProfile();
    const showCoach = isCoach();

    nav.innerHTML = `
        <div class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
            <div class="max-w-4xl mx-auto px-4">
                <div class="flex justify-around py-2">
                    <a href="index.html" class="nav-item flex flex-col items-center py-2 px-3 text-gray-600 hover:text-blue-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span class="text-xs mt-1">Start</span>
                    </a>

                    <a href="leaderboards.html" class="nav-item flex flex-col items-center py-2 px-3 text-gray-600 hover:text-blue-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span class="text-xs mt-1">Ranglisten</span>
                    </a>

                    <a href="matches.html" class="nav-item flex flex-col items-center py-2 px-3 text-gray-600 hover:text-blue-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        <span class="text-xs mt-1">Spiel</span>
                    </a>

                    ${showCoach ? `
                        <a href="coach.html" class="nav-item flex flex-col items-center py-2 px-3 text-gray-600 hover:text-blue-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            <span class="text-xs mt-1">Coach</span>
                        </a>
                    ` : `
                        <a href="training.html" class="nav-item flex flex-col items-center py-2 px-3 text-gray-600 hover:text-blue-600">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span class="text-xs mt-1">Training</span>
                        </a>
                    `}

                    <a href="profile.html" class="nav-item flex flex-col items-center py-2 px-3 text-gray-600 hover:text-blue-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span class="text-xs mt-1">Profil</span>
                    </a>
                </div>
            </div>
        </div>
    `;

    // Aktiven Nav-Item markieren
    const currentPath = window.location.pathname;
    nav.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('href') && currentPath.includes(item.getAttribute('href'))) {
            item.classList.remove('text-gray-600');
            item.classList.add('text-blue-600');
        }
    });
}

// ============================================
// DASHBOARD
// ============================================

async function initDashboard() {
    const profile = getCurrentProfile();
    if (!profile) return;

    const main = document.getElementById('app-main');
    if (!main) return;

    // Rang berechnen
    const rank = calculateRank(profile.elo_rating, profile.xp, profile.grundlagen_completed || 0);
    const progress = getRankProgress(profile.elo_rating, profile.xp, profile.grundlagen_completed || 0);

    // Rivalen finden
    const eloRival = profile.club_id ? await findEloRival(profile.club_id, profile.id) : null;
    const xpRival = profile.club_id ? await findXpRival(profile.club_id, profile.id) : null;

    // Feed laden
    const feed = profile.club_id ? await getFeed({ clubId: profile.club_id, limit: 10 }) : [];

    main.innerHTML = `
        <div class="max-w-4xl mx-auto px-4 py-6 pb-24">
            <!-- Begrüßung -->
            <div class="mb-6">
                <h1 class="text-2xl font-bold text-gray-900">Hallo, ${profile.first_name}! 👋</h1>
                <p class="text-gray-600">Willkommen zurück bei TTV Champions</p>
            </div>

            <!-- Rang-Karte -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                <div class="p-4 border-b border-gray-100">
                    <h2 class="font-semibold text-gray-900">Dein Fortschritt</h2>
                </div>
                ${createRankProgressDisplay(progress)}
            </div>

            <!-- Statistiken -->
            <div class="grid grid-cols-3 gap-4 mb-6">
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
                    <div class="text-2xl font-bold text-blue-600">${profile.elo_rating}</div>
                    <div class="text-xs text-gray-500">Elo</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
                    <div class="text-2xl font-bold text-purple-600">${profile.xp}</div>
                    <div class="text-xs text-gray-500">XP</div>
                </div>
                <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
                    <div class="text-2xl font-bold text-green-600">${profile.season_points}</div>
                    <div class="text-xs text-gray-500">Saison</div>
                </div>
            </div>

            <!-- Rivalen -->
            ${(eloRival || xpRival) ? `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
                    <div class="p-4 border-b border-gray-100">
                        <h2 class="font-semibold text-gray-900">Deine Rivalen</h2>
                    </div>
                    <div class="p-4">
                        ${createRivalsDisplay(eloRival, xpRival)}
                    </div>
                </div>
            ` : ''}

            <!-- Aktivitätsfeed -->
            <div class="bg-white rounded-xl shadow-sm border border-gray-200">
                <div class="p-4 border-b border-gray-100">
                    <h2 class="font-semibold text-gray-900">Aktivitäten</h2>
                </div>
                <div class="p-4">
                    ${feed.length > 0
                        ? `<div class="space-y-4">${feed.map(entry => renderFeedEntry(entry)).join('')}</div>`
                        : createEmptyFeed()
                    }
                </div>
            </div>
        </div>
    `;
}

// ============================================
// LEADERBOARDS
// ============================================

async function initLeaderboards() {
    const profile = getCurrentProfile();
    if (!profile?.club_id) {
        showNoClubMessage();
        return;
    }

    const main = document.getElementById('app-main');
    if (!main) return;

    main.innerHTML = `
        <div class="max-w-4xl mx-auto px-4 py-6 pb-24">
            <h1 class="text-2xl font-bold text-gray-900 mb-6">Ranglisten</h1>

            <div class="bg-white rounded-xl shadow-sm border border-gray-200">
                <div class="p-4" id="leaderboard-tabs">
                    ${createLeaderboardTabs(LEADERBOARD_TYPES.SKILL)}
                </div>
                <div id="leaderboard-content" class="divide-y divide-gray-100">
                    <div class="p-8 text-center text-gray-500">Lade...</div>
                </div>
            </div>
        </div>
    `;

    // Tab-Click-Handler
    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
        tab.addEventListener('click', () => loadLeaderboard(tab.dataset.tab));
    });

    // Initial Skill-Rangliste laden
    await loadLeaderboard(LEADERBOARD_TYPES.SKILL);
}

async function loadLeaderboard(type) {
    const profile = getCurrentProfile();
    const content = document.getElementById('leaderboard-content');
    if (!content) return;

    // Tabs aktualisieren
    document.querySelectorAll('.leaderboard-tab').forEach(tab => {
        if (tab.dataset.tab === type) {
            tab.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');
            tab.classList.remove('text-gray-500');
        } else {
            tab.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');
            tab.classList.add('text-gray-500');
        }
    });

    content.innerHTML = '<div class="p-8 text-center text-gray-500">Lade...</div>';

    let html = '';

    switch (type) {
        case LEADERBOARD_TYPES.SKILL:
            const skillData = await getSkillLeaderboard(profile.club_id);
            html = skillData.map((player, i) =>
                createLeaderboardRow(player, i + 1, type, player.id === profile.id)
            ).join('');
            break;

        case LEADERBOARD_TYPES.EFFORT:
            const effortData = await getEffortLeaderboard(profile.club_id);
            html = effortData.map((player, i) =>
                createLeaderboardRow(player, i + 1, type, player.id === profile.id)
            ).join('');
            break;

        case LEADERBOARD_TYPES.SEASON:
            const seasonData = await getSeasonLeaderboard(profile.club_id);
            html = seasonData.map((player, i) =>
                createLeaderboardRow(player, i + 1, type, player.id === profile.id)
            ).join('');
            break;

        case LEADERBOARD_TYPES.RANKS:
            const ranksData = await getRanksOverview(profile.club_id);
            html = `<div class="p-4">${createRanksOverviewDisplay(ranksData)}</div>`;
            break;

        case LEADERBOARD_TYPES.DOUBLES:
            const doublesData = await getDoublesLeaderboard(profile.club_id);
            html = createDoublesLeaderboardDisplay(doublesData);
            break;
    }

    content.innerHTML = html || '<div class="p-8 text-center text-gray-500">Keine Daten</div>';
}

// ============================================
// HILFSFUNKTIONEN
// ============================================

function showNoClubMessage() {
    const main = document.getElementById('app-main');
    if (!main) return;

    main.innerHTML = `
        <div class="max-w-4xl mx-auto px-4 py-6 pb-24">
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <div class="text-4xl mb-4">🏸</div>
                <h2 class="text-lg font-semibold text-yellow-800 mb-2">Kein Verein</h2>
                <p class="text-yellow-700">Du bist noch keinem Verein zugeordnet. Bitte kontaktiere deinen Trainer.</p>
            </div>
        </div>
    `;
}

// Placeholder-Funktionen für andere Seiten
function initProfile() {
    console.log('Profile page initialized');
}

function initMatches() {
    console.log('Matches page initialized');
}

function initTraining() {
    console.log('Training page initialized');
}

function initCoachDashboard() {
    console.log('Coach dashboard initialized');
}

// ============================================
// APP STARTEN
// ============================================

// Auto-Init wenn DOM geladen
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Globale Exports für HTML onclick etc.
window.app = {
    logout: async () => {
        await logout();
        window.location.href = 'login.html';
    }
};
