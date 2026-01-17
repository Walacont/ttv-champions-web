// Dashboard (Supabase-Version) - Multi-Sport-Unterstützung

import { getSupabase, onAuthStateChange } from './supabase-init.js';
import { RANK_ORDER, groupPlayersByRank, calculateRank, getRankProgress } from './ranks.js';
import { loadDoublesLeaderboard } from './doubles-matches-supabase.js';
import { initializeDoublesPlayerUI, initializeDoublesPlayerSearch } from './doubles-player-ui-supabase.js';
import { initializeLeaderboardPreferences, applyPreferences } from './leaderboard-preferences-supabase.js';
import { initializeWidgetSystem } from './dashboard-widgets-supabase.js';
import { AGE_GROUPS } from './ui-utils-supabase.js';
import { showHeadToHeadModal } from './head-to-head-supabase.js';
import { getSportContext, isCoachInSport } from './sport-context-supabase.js';
import { setLeaderboardSportFilter } from './leaderboard-supabase.js';
import { createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';
import { escapeHtml } from './utils/security.js';
import { suppressConsoleLogs } from './utils/logger.js';
import { initFriends } from './friends-supabase.js';
import { initCommunity } from './community-supabase.js';
import { initActivityFeedModule, loadActivityFeed } from './activity-feed-supabase.js';
import { initPlayerEvents } from './player-events-supabase.js';
import { initComments } from './activity-comments.js';

import { initMatchMedia } from './match-media.js';
import { initI18n, translatePage } from './i18n.js';
import { loadAllPendingConfirmations, showMatchConfirmationBottomSheet } from './matches-supabase.js';

import {
    initMatchFormModule,
    setupMatchForm,
    createSetScoreInput,
    clearOpponentSelection
} from './dashboard-match-form-supabase.js';
import {
    initMatchHistoryModule,
    loadMatchHistory,
    showMatchDetails,
    formatRelativeDate,
    formatSetsDisplay,
    deleteMatchRequest
} from './dashboard-match-history-supabase.js';

suppressConsoleLogs();

let notificationsModule = null;

console.log('[DASHBOARD-SUPABASE] Script starting...');

const supabase = getSupabase();

// --- State ---
let currentUser = null;
let currentUserData = null;
let currentClubData = null;
let currentSportContext = null;
let realtimeSubscriptions = [];
let isReconnecting = false;
let reconnectTimeout = null;
let currentSubgroupFilter = 'global';
let currentGenderFilter = 'all';
let currentAgeGroupFilter = 'all';

let testClubIdsCache = null;
let followingIdsCache = null;

/** Lädt Test-Verein-IDs für Filterung (mit Caching) */
async function loadTestClubIds() {
    if (testClubIdsCache !== null) return testClubIdsCache;

    try {
        const { data: clubs } = await supabase
            .from('clubs')
            .select('id, is_test_club');

        testClubIdsCache = (clubs || [])
            .filter(c => c.is_test_club === true)
            .map(c => c.id);
    } catch (error) {
        console.error('Error loading test club IDs:', error);
        testClubIdsCache = [];
    }

    return testClubIdsCache;
}

/**
 * Load following IDs for leaderboard filtering (with caching)
 */
async function loadFollowingIds() {
    if (followingIdsCache !== null) return followingIdsCache;

    try {
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');

        followingIdsCache = (following || []).map(f => f.addressee_id);
    } catch (error) {
        console.error('Error loading following IDs:', error);
        followingIdsCache = [];
    }

    return followingIdsCache;
}

/**
 * Helper function to create a notification for a user
 */
async function createNotification(userId, type, title, message, data = {}) {
    try {
        const { error } = await supabase
            .from('notifications')
            .insert({
                user_id: userId,
                type: type,
                title: title,
                message: message,
                data: data,
                is_read: false
            });

        if (error) {
            console.error('[Dashboard] Error creating notification:', error);
        } else {
            console.log(`[Dashboard] Notification sent to ${userId}: ${type}`);
        }
    } catch (error) {
        console.error('[Dashboard] Error creating notification:', error);
    }
}

/**
 * Helper function to notify all coaches in a club
 */
async function notifyClubCoaches(clubId, type, title, message, data = {}) {
    try {
        const { data: coaches, error: coachError } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', clubId)
            .in('role', ['coach', 'head_coach']);

        if (coachError) {
            console.error('[Dashboard] Error finding coaches:', coachError);
            return;
        }

        if (!coaches || coaches.length === 0) {
            console.log('[Dashboard] No coaches found in club to notify');
            return;
        }

        const notifications = coaches.map(coach => ({
            user_id: coach.id,
            type: type,
            title: title,
            message: message,
            data: data,
            is_read: false
        }));

        const { error } = await supabase.from('notifications').insert(notifications);

        if (error) {
            console.error('[Dashboard] Error creating coach notifications:', error);
        } else {
            console.log(`[Dashboard] Notified ${coaches.length} coach(es) about ${type}`);
        }
    } catch (error) {
        console.error('[Dashboard] Error notifying coaches:', error);
    }
}

// --- Constants ---
const RANKS = [
    { name: 'Rekrut', minXP: 0, icon: '🔰' },
    { name: 'Lehrling', minXP: 100, icon: '📘' },
    { name: 'Geselle', minXP: 300, icon: '⚒️' },
    { name: 'Adept', minXP: 600, icon: '🎯' },
    { name: 'Veteran', minXP: 1000, icon: '⚔️' },
    { name: 'Experte', minXP: 1500, icon: '🛡️' },
    { name: 'Meister', minXP: 2500, icon: '👑' },
    { name: 'Großmeister', minXP: 4000, icon: '🏆' },
    { name: 'Champion', minXP: 6000, icon: '💎' },
];

// --- Main Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[DASHBOARD-SUPABASE] DOM loaded, checking session...');

    const { data: { session } } = await supabase.auth.getSession();

    if (!session || !session.user) {
        console.log('[DASHBOARD-SUPABASE] No session, redirecting to login');
        window.location.replace('/index.html');
        return;
    }

    currentUser = session.user;
    console.log('[DASHBOARD-SUPABASE] User:', currentUser.email);

    // Benutzerprofil laden
    await loadUserProfile();

    // Benachrichtigungen initialisieren (dynamisch geladen, nicht blockierend)
    try {
        notificationsModule = await import('./notifications-supabase.js');
        if (notificationsModule.initNotifications) {
            notificationsModule.initNotifications(currentUser.id);
        }
    } catch (e) {
        console.warn('Notifications not available:', e);
    }

    // Push-Benachrichtigungen initialisieren (dynamisch geladen, nicht blockierend)
    try {
        const pushModule = await import('./push-notifications-manager.js');
        if (pushModule.initPushNotifications) {
            pushModule.initPushNotifications(currentUser.id);
        }

        // Push-Berechtigungsdialog nach kurzer Verzögerung anzeigen (nur wenn noch nicht aktiviert)
        setTimeout(async () => {
            if (pushModule.shouldShowPushPrompt && await pushModule.shouldShowPushPrompt()) {
                await pushModule.showPushPermissionPrompt();
            }
        }, 3000);
    } catch (e) {
        console.warn('Push notifications not available:', e);
    }

    // Auth-Änderungen beobachten - nur bei explizitem Logout weiterleiten
    onAuthStateChange((event, session) => {
        console.log('[DASHBOARD-SUPABASE] Auth state changed:', event);
        if (event === 'SIGNED_OUT') {
            cleanupSubscriptions();
            window.location.replace('/index.html');
        }
    });
});

// --- Cleanup ---
function cleanupSubscriptions() {
    // Benachrichtigungs-Subscriptions aufräumen (falls verfügbar)
    if (notificationsModule && notificationsModule.cleanupNotifications) {
        notificationsModule.cleanupNotifications();
    }

    realtimeSubscriptions.forEach(sub => {
        if (sub && typeof sub.unsubscribe === 'function') {
            sub.unsubscribe();
        }
    });
    realtimeSubscriptions = [];
}

// --- Load User Profile ---
async function loadUserProfile() {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select(`
                *,
                club:clubs(id, name)
            `)
            .eq('id', currentUser.id)
            .maybeSingle(); // maybeSingle verwenden um Fehler bei keinen Zeilen zu vermeiden

        if (error) throw error;

        if (!profile) {
            console.error('[DASHBOARD-SUPABASE] No profile found for user:', currentUser.id);
            // Basis-Profil erstellen oder zum Onboarding weiterleiten
            window.location.href = '/onboarding.html';
            return;
        }

        // Onboarding prüfen
        if (!profile.onboarding_complete) {
            console.log('[DASHBOARD-SUPABASE] Onboarding not complete');
            window.location.href = '/onboarding.html';
            return;
        }

        // Rolle prüfen - Admins weiterleiten
        if (profile.role === 'admin') {
            window.location.href = '/admin.html';
            return;
        }

        currentUserData = profile;
        currentClubData = profile.club;

        console.log('[DASHBOARD-SUPABASE] Profile loaded:', {
            name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
            role: profile.role,
            club: currentClubData?.name
        });

        // Dashboard initialisieren
        initializeDashboard();

    } catch (error) {
        console.error('[DASHBOARD-SUPABASE] Error loading profile:', error);
        showError('Profil konnte nicht geladen werden: ' + error.message);
    }
}

// --- Initialize Dashboard ---
async function initializeDashboard() {
    const pageLoader = document.getElementById('page-loader');
    const mainContent = document.getElementById('main-content');

    // Lader ausblenden, Inhalt anzeigen
    if (pageLoader) pageLoader.style.display = 'none';
    if (mainContent) mainContent.style.display = 'block';

    // Sport-Kontext für Multi-Sport-Filterung laden
    // Bestimmt aktive Sportart, Verein und Rolle
    currentSportContext = await getSportContext(currentUser.id);
    console.log('[DASHBOARD-SUPABASE] Sport context loaded:', currentSportContext);

    // Ranglisten-Sport-Filter für Multi-Sport-Unterstützung setzen
    if (currentSportContext?.sportId) {
        setLeaderboardSportFilter(currentSportContext.sportId);
    }

    // UI einrichten
    setupHeader();
    setupTabs();
    setupLogout();
    setupProfileLink();
    setupCoachIndicator();
    setupSearchButton();
    setupModalHandlers();

    // Ranglisten-Einstellungen initialisieren (muss nach Tab-Setup sein)
    // Verein aus Sport-Kontext verwenden (Benutzer kann in verschiedenen Vereinen für verschiedene Sportarten sein)
    const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;
    const userData = {
        id: currentUser.id,
        clubId: effectiveClubId,
        leaderboardPreferences: currentUserData.leaderboard_preferences
    };
    initializeLeaderboardPreferences(userData, supabase);

    // Daten laden
    updateStatsDisplay();
    updateRankDisplay();
    loadRivalData();
    await loadLeaderboards();
    setupFilters(); // Filter nach Ranglisten-HTML-Rendering einrichten
    loadPointsHistory();
    loadChallenges();
    loadExercises();
    loadMatchRequests();
    loadPendingRequests();
    loadCalendar();
    // Saison-Countdown initialisieren (effizient: lädt einmal, aktualisiert Anzeige jede Sekunde)
    initSeasonCountdown();

    // Match-Module mit aktuellen Benutzerdaten initialisieren (MUSS vor loadMatchHistory und setupMatchForm sein)
    initMatchFormModule(currentUser, currentUserData, currentSportContext);
    initMatchHistoryModule(currentUser, currentUserData);

    // Aktivitäts-Feed-Modul initialisieren
    initActivityFeedModule(currentUser, currentUserData);

    // Spieler-Events-Modul initialisieren
    initPlayerEvents(currentUser.id);

    // Kommentare-Modul initialisieren
    initComments(currentUserData);

    // Match-Medien-Modul initialisieren
    initMatchMedia(currentUserData);

    // Match-Verlauf laden (nach Modul-Initialisierung)
    loadMatchHistory();

    // Aktivitäts-Feed laden (zeigt Matches von Verein + gefolgten Benutzern)
    loadActivityFeed();

    // Ausstehende Match-Bestätigungen prüfen und Bottom-Sheet anzeigen
    checkPendingMatchConfirmations(currentUser.id);

    // Match-Formular einrichten (aus extrahiertem Modul)
    setupMatchForm({
        onSuccess: () => {
            loadMatchRequests();
            loadPendingRequests();
        }
    });

    // Einklappbare Bereiche einrichten (Match-Vorschläge und Ranglisten-Einstellungen)
    setupMatchSuggestions();
    setupLeaderboardPreferences();

    // Widget-System initialisieren (anpassbares Dashboard)
    initializeWidgetSystem(supabase, currentUser.id, currentUserData);

    // Spieler-Untergruppen-Filter mit Altersgruppen befüllen
    await populatePlayerSubgroupFilter(currentUserData);

    // Prüfen ob Benutzer Trainer ohne Verein ist - dann zu Spieler herabstufen
    const isCoachInActiveSport = currentSportContext?.role === 'coach' || currentSportContext?.role === 'head_coach';
    const effectiveClub = currentSportContext?.clubId || currentUserData.club_id;

    if (isCoachInActiveSport && !effectiveClub) {
        // Trainer ohne Verein - Rolle zu Spieler herabstufen
        console.warn('[DASHBOARD] Coach without club detected, downgrading to player');
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ role: 'player' })
            .eq('id', currentUser.id);

        if (updateError) {
            console.error('[DASHBOARD] Failed to downgrade role:', updateError);
        } else {
            console.log('[DASHBOARD] Role successfully downgraded to player');
            // Lokale Daten aktualisieren
            currentUserData.role = 'player';
        }
    }

    // Kein-Verein-Info anzeigen falls nötig (verwendet effectiveClub von oben)
    if (!effectiveClub) {
        const noClubBox = document.getElementById('no-club-info-box');
        if (noClubBox && localStorage.getItem('noClubInfoDismissed') !== 'true') {
            noClubBox.classList.remove('hidden');
        }
    }

    // Echtzeit-Subscriptions einrichten
    setupRealtimeSubscriptions();

    // Seite übersetzen nachdem alle Inhalte geladen sind
    // Stellt sicher dass dynamisch hinzugefügte Elemente mit data-i18n übersetzt werden
    // Hinweis: i18n wird durch das inline-Skript von dashboard.html initialisiert
    // translatePage() will safely skip if not ready yet
    translatePage();
}

// --- Setup Header ---
// Standard-Avatar als Data-URL (einfacher grauer Kreis mit Benutzer-Icon)
const DEFAULT_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iMzUiIHI9IjE1IiBmaWxsPSIjOTRhM2I4Ii8+PHBhdGggZD0iTTIwIDg1YzAtMjAgMTMtMzAgMzAtMzBzMzAgMTAgMzAgMzAiIGZpbGw9IiM5NGEzYjgiLz48L3N2Zz4=';

function setupHeader() {
    // Profilbild - avatar_url verwenden (von Einstellungen gespeichert oder Legacy)
    const headerPic = document.getElementById('header-profile-pic');
    if (headerPic) {
        headerPic.src = currentUserData.avatar_url || currentUserData.avatar_url || DEFAULT_AVATAR;
        headerPic.onerror = () => { headerPic.src = DEFAULT_AVATAR; };
    }

    // Vereinsname - Sport-Kontext-Verein verwenden falls verfügbar (Multi-Sport)
    // A user might be in different clubs for different sports
    const clubName = document.getElementById('header-club-name');
    if (clubName) {
        const effectiveClubName = currentSportContext?.clubName || currentClubData?.name;
        clubName.textContent = effectiveClubName || 'Kein Verein';
    }
}

// --- Setup Tabs ---
function setupTabs() {
    // requestAnimationFrame verwenden um sicherzustellen dass DOM vollständig gerendert ist
    requestAnimationFrame(() => {
        initializeTabSystem();
    });
}

function initializeTabSystem() {
    const tabContents = document.querySelectorAll('.tab-content');
    const headerTitle = document.getElementById('header-title');
    const bottomNav = document.getElementById('bottom-nav');

    console.log('[TABS] Initializing tab system, bottomNav:', bottomNav ? 'found' : 'NOT FOUND');

    // Hilfsfunktion zum Tab-Wechsel - global für Aufruf von überall
    window.switchToTab = (tabId, tabTitle) => {
        console.log('[TABS] Switching to tab:', tabId);

        // Aktiv-Status auf ALLEN Tab-Buttons aktualisieren
        const allTabButtons = document.querySelectorAll('.tab-button, .bottom-tab-button');
        allTabButtons.forEach(btn => {
            btn.classList.remove('tab-active', 'text-indigo-600');
            btn.classList.add('text-gray-400');
            if (btn.dataset.tab === tabId) {
                btn.classList.add('tab-active', 'text-indigo-600');
                btn.classList.remove('text-gray-400');
            }
        });

        // Header-Titel dynamisch aktualisieren
        if (headerTitle) {
            headerTitle.textContent = tabTitle;
        }

        // Tab-Inhalte ein-/ausblenden
        tabContents.forEach(content => {
            content.classList.add('hidden');
            if (content.id === `tab-content-${tabId}`) {
                content.classList.remove('hidden');
            }
        });

        // Community-Tab bei Aktivierung initialisieren
        if (tabId === 'community') {
            initFriends().catch(err => console.error('Error initializing friends:', err));
            initCommunity().catch(err => console.error('Error initializing community:', err));
        }
    };

    // Untere Navigation einrichten
    if (bottomNav) {
        const buttons = bottomNav.querySelectorAll('.bottom-tab-button');
        console.log('[TABS] Found', buttons.length, 'bottom tab buttons');

        buttons.forEach(button => {
            // Bestehende Listener durch Klonen entfernen
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            // Klick-Handler hinzufügen
            newButton.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                const tabId = this.dataset.tab;
                const tabTitle = this.dataset.title || 'Dashboard';
                console.log('[TABS] Button clicked:', tabId);
                window.switchToTab(tabId, tabTitle);
            });
        });

        // URL-Parameter für Tab und scrollTo prüfen (von Push-Benachrichtigungen)
        const urlParams = new URLSearchParams(window.location.search);
        const requestedTab = urlParams.get('tab');
        const scrollToId = urlParams.get('scrollTo');

        if (requestedTab) {
            // Button für angeforderten Tab finden
            const targetButton = bottomNav.querySelector(`.bottom-tab-button[data-tab="${requestedTab}"]`);
            if (targetButton) {
                const tabTitle = targetButton.dataset.title || requestedTab;
                console.log('[TABS] Switching to requested tab from URL:', requestedTab);
                window.switchToTab(requestedTab, tabTitle);

                // URL-Parameter nach Verarbeitung bereinigen
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl);

                // Nach Verzögerung zum Element scrollen um sicherzustellen dass Inhalt geladen ist
                if (scrollToId) {
                    setTimeout(() => {
                        const scrollTarget = document.getElementById(scrollToId);
                        if (scrollTarget) {
                            console.log('[TABS] Scrolling to element:', scrollToId);
                            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Element kurz hervorheben
                            scrollTarget.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
                            setTimeout(() => {
                                scrollTarget.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2');
                            }, 2000);
                        }
                    }, 500);
                }
            } else {
                // Fallback zum ersten Tab wenn angeforderter Tab nicht gefunden
                const firstButton = bottomNav.querySelector('.bottom-tab-button');
                if (firstButton) {
                    window.switchToTab(firstButton.dataset.tab, firstButton.dataset.title || 'Start');
                }
            }
        } else {
            // Kein Tab-Parameter, ersten Tab aktivieren
            const firstButton = bottomNav.querySelector('.bottom-tab-button');
            if (firstButton) {
                const tabId = firstButton.dataset.tab;
                const tabTitle = firstButton.dataset.title || 'Start';
                window.switchToTab(tabId, tabTitle);
            }
        }
    } else {
        console.error('[TABS] Bottom nav not found! Retrying in 100ms...');
        // Nach kurzer Verzögerung erneut versuchen
        setTimeout(initializeTabSystem, 100);
        return;
    }

    // Auch Handler zu Inline-Tab-Buttons hinzufügen (für Abwärtskompatibilität)
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            const tabTitle = button.dataset.title || button.textContent.trim();
            window.switchToTab(tabId, tabTitle);
        });
    });
}

// --- Setup Search Button (opens Community fullscreen page) ---
function setupSearchButton() {
    const searchBtn = document.getElementById('open-community-btn');
    const closeBtn = document.getElementById('close-community-btn');
    const communityFullscreen = document.getElementById('community-fullscreen');

    if (searchBtn && communityFullscreen) {
        searchBtn.addEventListener('click', async () => {
            // Vollbild-Community-Seite anzeigen
            communityFullscreen.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // Hintergrund-Scrollen verhindern

            // Community-Module initialisieren
            try {
                await initFriends();
                await initCommunity();
            } catch (error) {
                console.error('Error initializing community modules:', error);
            }

            // Sucheingabe nach kurzer Verzögerung fokussieren
            setTimeout(() => {
                const searchInput = document.getElementById('player-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }, 100);
        });
    }

    // Schließen-Button-Handler
    if (closeBtn && communityFullscreen) {
        closeBtn.addEventListener('click', () => {
            communityFullscreen.classList.add('hidden');
            document.body.style.overflow = ''; // Scrollen wiederherstellen
        });
    }

    // Bei Escape-Taste schließen
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && communityFullscreen && !communityFullscreen.classList.contains('hidden')) {
            communityFullscreen.classList.add('hidden');
            document.body.style.overflow = '';
        }
    });
}

// --- Setup Profile Link ---
function setupProfileLink() {
    const profileLink = document.getElementById('header-profile-link');
    if (profileLink && currentUser) {
        profileLink.href = `/profile.html?id=${currentUser.id}`;
    }
}

// --- Setup Coach Indicator ---
function setupCoachIndicator() {
    const indicator = document.getElementById('coach-player-indicator');
    if (!indicator || !currentUserData) return;

    // Indikator anzeigen wenn Benutzer Trainer ist
    const isCoach = currentUserData.role === 'coach' || currentUserData.role === 'head_coach';
    if (isCoach) {
        indicator.classList.remove('hidden');
    }
}

// --- Setup Logout ---
function setupLogout() {
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                cleanupSubscriptions();
                await supabase.auth.signOut();
                if (window.spaEnhancer) window.spaEnhancer.clearCache();
                window.location.replace('/index.html');
            } catch (error) {
                console.error('Logout error:', error);
            }
        });
    }

    // Kein-Verein-Info schließen
    const closeNoClubBtn = document.getElementById('close-no-club-info');
    if (closeNoClubBtn) {
        closeNoClubBtn.addEventListener('click', () => {
            document.getElementById('no-club-info-box')?.classList.add('hidden');
            localStorage.setItem('noClubInfoDismissed', 'true');
        });
    }
}

// --- Setup Filters ---
function setupFilters() {
    const subgroupFilter = document.getElementById('player-subgroup-filter');
    const genderFilter = document.getElementById('player-gender-filter');
    const ageGroupFilter = document.getElementById('player-age-group-filter');

    if (subgroupFilter) {
        // Hinweis: Untergruppen werden durch populatePlayerSubgroupFilter() in initializeDashboard() geladen
        // Do NOT call loadSubgroupsForFilter here - it causes duplicates

        subgroupFilter.addEventListener('change', async () => {
            currentSubgroupFilter = subgroupFilter.value;

            // Ranglisten-Bereich basierend auf Filter-Auswahl aktualisieren
            if (currentSubgroupFilter === 'global') {
                currentLeaderboardScope = 'global';
            } else if (currentSubgroupFilter === 'club') {
                // Vereins-Filter - Vereins-Bereich verwenden (nur für Benutzer mit Verein)
                currentLeaderboardScope = currentUserData?.club_id ? 'club' : 'global';
            } else if (currentSubgroupFilter === 'following') {
                // Gefolgten-Filter - globalen Bereich verwenden um alle Spieler zu suchen
                currentLeaderboardScope = 'global';
                // Abonnenten-IDs vorladen
                await loadFollowingIds();
            } else if (currentSubgroupFilter.startsWith('subgroup:')) {
                // Benutzerdefinierte Untergruppen - Vereins-Bereich verwenden
                currentLeaderboardScope = currentUserData?.club_id ? 'club' : 'global';
            }
            updateLeaderboardScope();

            // Rangliste mit neuem Filter neu rendern
            updateLeaderboardContent();
            loadRivalData(); // Rivalen aktualisieren wenn Filter sich ändert
        });
    }

    if (genderFilter) {
        genderFilter.addEventListener('change', () => {
            currentGenderFilter = genderFilter.value;
            // Rangliste mit neuem Filter neu rendern
            updateLeaderboardContent();
        });
    }

    if (ageGroupFilter) {
        // Altersgruppen befüllen - vollständige Liste wie Original
        ageGroupFilter.innerHTML = `
            <option value="all">Alle Altersgruppen</option>
            <optgroup label="Jugend (nach Alter)">
                <option value="u11">U11</option>
                <option value="u13">U13</option>
                <option value="u15">U15</option>
                <option value="u17">U17</option>
                <option value="u19">U19</option>
            </optgroup>
            <optgroup label="Erwachsene">
                <option value="adult">Erwachsene (18-39)</option>
            </optgroup>
            <optgroup label="Senioren (nach Alter)">
                <option value="o40">Ü40</option>
                <option value="o45">Ü45</option>
                <option value="o50">Ü50</option>
                <option value="o55">Ü55</option>
                <option value="o60">Ü60</option>
                <option value="o65">Ü65</option>
                <option value="o70">Ü70</option>
                <option value="o75">Ü75</option>
                <option value="o80">Ü80</option>
                <option value="o85">Ü85</option>
            </optgroup>
        `;

        ageGroupFilter.addEventListener('change', () => {
            currentAgeGroupFilter = ageGroupFilter.value;
            // Rangliste mit neuem Filter neu rendern
            updateLeaderboardContent();
        });
    }
}

// --- Calculate Age from Birthdate ---
function calculateAge(birthdate) {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

// --- Check if player matches age group filter ---
function matchesAgeGroup(birthdate, ageGroupFilter) {
    if (ageGroupFilter === 'all') return true;
    const age = calculateAge(birthdate);
    if (age === null) return false; // Spieler ohne Geburtsdatum ausschließen wenn Filter aktiv

    // Jugendgruppen (unter X Jahren) - stichtag-basiert wie Tischtennis-Regeln
    // U11 means player turns 11 or younger in current year
    switch (ageGroupFilter) {
        // Jugendgruppen
        case 'u11': return age <= 10;
        case 'u13': return age <= 12;
        case 'u15': return age <= 14;
        case 'u17': return age <= 16;
        case 'u19': return age <= 18;
        // Adults
        case 'adult': return age >= 18 && age <= 39;
        // Seniors
        case 'o40': return age >= 40;
        case 'o45': return age >= 45;
        case 'o50': return age >= 50;
        case 'o55': return age >= 55;
        case 'o60': return age >= 60;
        case 'o65': return age >= 65;
        case 'o70': return age >= 70;
        case 'o75': return age >= 75;
        case 'o80': return age >= 80;
        case 'o85': return age >= 85;
        default: return true;
    }
}

// --- Update Stats Display ---
// Verwendet sport-spezifische Stats aus user_sport_stats falls verfügbar
async function updateStatsDisplay() {
    const xpEl = document.getElementById('player-xp');
    const eloEl = document.getElementById('player-elo');
    const pointsEl = document.getElementById('player-points');

    // Standardwerte aus Profil
    let xp = currentUserData.xp || 0;
    let elo = currentUserData.elo_rating || 1000;
    let points = currentUserData.points || 0;

    // Sport-spezifische Stats versuchen abzurufen
    const activeSportId = currentSportContext?.sportId || currentUserData.active_sport_id;
    if (activeSportId && currentUser?.id) {
        try {
            const { data: sportStats, error } = await supabase
                .from('user_sport_stats')
                .select('elo_rating, xp, points, wins, losses, matches_played')
                .eq('user_id', currentUser.id)
                .eq('sport_id', activeSportId)
                .maybeSingle();

            if (!error && sportStats) {
                xp = sportStats.xp || 0;
                elo = sportStats.elo_rating || 1000;
                points = sportStats.points || 0;
                console.log('[DASHBOARD] Using sport-specific stats:', { xp, elo, points });
            }
        } catch (err) {
            // Tabelle existiert möglicherweise noch nicht, Profil-Standardwerte verwenden
            console.log('[DASHBOARD] user_sport_stats not available, using profile stats');
        }
    }

    // Versteckte Elemente aktualisieren (für Kompatibilität mit anderen Modulen)
    if (xpEl) xpEl.textContent = xp;
    if (eloEl) eloEl.textContent = elo;
    if (pointsEl) pointsEl.textContent = points;
}

// --- Update Rank Display ---
function updateRankDisplay() {
    const rankInfo = document.getElementById('rank-info');
    if (!rankInfo) return;

    const grundlagenCount = currentUserData.grundlagen_completed || 0;
    const progress = getRankProgress(currentUserData.elo_rating, currentUserData.xp, grundlagenCount);
    const { currentRank, nextRank, eloProgress, xpProgress, grundlagenProgress, eloNeeded, xpNeeded, grundlagenNeeded, isMaxRank } = progress;

    let html = `
        <div class="flex items-center justify-center space-x-2 mb-2">
            <span class="text-4xl">${currentRank.emoji}</span>
            <div>
                <p class="font-bold text-xl" style="color: ${currentRank.color};">${currentRank.name}</p>
                <p class="text-xs text-gray-500">${currentRank.description}</p>
            </div>
        </div>
    `;

    if (!isMaxRank && nextRank) {
        html += `
            <div class="mt-3 text-sm">
                <p class="text-gray-600 font-medium mb-2">Fortschritt zu ${nextRank.emoji} ${nextRank.name}:</p>

                <!-- ELO Progress -->
                ${nextRank.minElo > 0 ? `
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Elo: ${currentUserData.elo_rating || 0}/${nextRank.minElo}</span>
                        <span>${eloProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-blue-600 h-2 rounded-full transition-all" style="width: ${eloProgress}%"></div>
                    </div>
                    ${eloNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${eloNeeded} Elo benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ Elo-Anforderung erfüllt</p>`}
                </div>
                ` : ''}

                <!-- XP Progress -->
                <div class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>XP: ${currentUserData.xp || 0}/${nextRank.minXP}</span>
                        <span>${xpProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-purple-600 h-2 rounded-full transition-all" style="width: ${xpProgress}%"></div>
                    </div>
                    ${xpNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${xpNeeded} XP benötigt</p>` : `<p class="text-xs text-green-600 mt-1">✓ XP-Anforderung erfüllt</p>`}
                </div>

                <!-- Grundlagen Progress -->
                ${nextRank.requiresGrundlagen ? `
                <div>
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Grundlagen-Übungen: ${grundlagenCount}/${nextRank.grundlagenRequired || 5}</span>
                        <span>${grundlagenProgress}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                        <div class="bg-green-600 h-2 rounded-full transition-all" style="width: ${grundlagenProgress}%"></div>
                    </div>
                    ${grundlagenNeeded > 0 ? `<p class="text-xs text-gray-500 mt-1">Noch ${grundlagenNeeded} Übung${grundlagenNeeded > 1 ? 'en' : ''} bis du Wettkämpfe spielen kannst</p>` : `<p class="text-xs text-green-600 mt-1">✓ Grundlagen abgeschlossen - du kannst Wettkämpfe spielen!</p>`}
                </div>
                ` : ''}
            </div>
        `;
    } else {
        html += `<p class="text-sm text-green-600 font-medium mt-2">🏆 Höchster Rang erreicht!</p>`;
    }

    rankInfo.innerHTML = html;
}

// --- Load Rival Data ---
let rivalSubscription = null;

async function loadRivalData() {
    const rivalSkillEl = document.getElementById('rival-skill-info');
    const rivalEffortEl = document.getElementById('rival-effort-info');

    if (!rivalSkillEl && !rivalEffortEl) return;

    // Von vorheriger Subscription abmelden
    if (rivalSubscription) {
        rivalSubscription.unsubscribe();
        rivalSubscription = null;
    }

    try {
        const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;
        const sportId = currentSportContext?.sportId;

        // Query erstellen (Einzelsport-Modell - direkt auf Profilen filtern)
        let query = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, elo_rating, xp, club_id')
            .in('role', ['player', 'coach', 'head_coach']);

        // Sportfilter anwenden
        if (sportId) {
            query = query.eq('active_sport_id', sportId);
            console.log('[DASHBOARD] Rival filter: filtering by sport:', sportId);
        }

        // Vereins-/Untergruppenfilter anwenden
        if (currentSubgroupFilter === 'club' && effectiveClubId) {
            query = query.eq('club_id', effectiveClubId);
        } else if (currentSubgroupFilter && currentSubgroupFilter.startsWith('subgroup:')) {
            // Benutzerdefinierter Untergruppenfilter - nach subgroup_ids Array filtern
            const subgroupId = currentSubgroupFilter.replace('subgroup:', '');
            if (effectiveClubId) {
                query = query.eq('club_id', effectiveClubId);
            }
            query = query.contains('subgroup_ids', [subgroupId]);
        } else if (currentSubgroupFilter !== 'club' && currentSubgroupFilter !== 'global') {
            // Altersgruppen-Filter - Vereinsfilter anwenden, Altersfilterung später
            if (effectiveClubId) {
                query = query.eq('club_id', effectiveClubId);
            }
        }
        // Für 'global' wird nur Sportfilter angewandt

        const { data: players, error } = await query;
        if (error) throw error;

        updateRivalDisplay(players || [], rivalSkillEl, rivalEffortEl);

        // Echtzeit-Subscription für Rivalen-Updates einrichten
        const channel = supabase
            .channel('rival-updates')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles'
            }, () => {
                // Rivalen-Daten bei jeder Profiländerung neu laden
                loadRivalData();
            })
            .subscribe();

        rivalSubscription = channel;

    } catch (error) {
        console.error('Error loading rival data:', error);
        if (rivalSkillEl) rivalSkillEl.innerHTML = '<p class="text-gray-500">Rivalen konnten nicht geladen werden</p>';
        if (rivalEffortEl) rivalEffortEl.innerHTML = '<p class="text-gray-500">Rivalen konnten nicht geladen werden</p>';
    }
}

function updateRivalDisplay(players, rivalSkillEl, rivalEffortEl) {
    // Skill-Ranking (sortiert nach Elo)
    const skillRanking = [...players].sort((a, b) => (b.elo_rating || 0) - (a.elo_rating || 0));
    const mySkillIndex = skillRanking.findIndex(p => p.id === currentUser.id);

    displayRivalInfo('Skill', skillRanking, mySkillIndex, rivalSkillEl, currentUserData.elo_rating || 0, 'Elo');

    // Effort-Ranking (sortiert nach XP)
    const effortRanking = [...players].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const myEffortIndex = effortRanking.findIndex(p => p.id === currentUser.id);

    displayRivalInfo('Fleiß', effortRanking, myEffortIndex, rivalEffortEl, currentUserData.xp || 0, 'XP');
}

function displayRivalInfo(metric, ranking, myRankIndex, el, myValue, unit) {
    if (!el) return;

    if (myRankIndex === 0) {
        el.innerHTML = `
            <p class="text-lg text-green-600 font-semibold">🎉 Glückwunsch!</p>
            <p class="text-sm">Du bist auf dem 1. Platz in ${metric}!</p>
        `;
    } else if (myRankIndex > 0) {
        const rival = ranking[myRankIndex - 1];
        const rivalValue = unit === 'Elo' ? (rival.elo_rating || 0) : (rival.xp || 0);
        const diff = rivalValue - myValue;
        const displayName = `${rival.first_name || ''} ${rival.last_name || ''}`.trim() || 'Spieler';

        el.innerHTML = `
            <div class="flex items-center space-x-3">
                <img src="${rival.avatar_url || DEFAULT_AVATAR}" alt="Rivale"
                     class="h-12 w-12 rounded-full object-cover border-2 border-orange-400"
                     onerror="this.src='${DEFAULT_AVATAR}'">
                <div>
                    <p class="font-semibold text-orange-600">${displayName}</p>
                    <p class="text-sm text-gray-600">${rivalValue} ${unit}</p>
                    <p class="text-xs text-gray-500">Nur noch ${diff} ${unit} zum Überholen!</p>
                </div>
            </div>
        `;
    } else {
        el.innerHTML = `<p class="text-gray-500">Keine Rivalen gefunden</p>`;
    }
}

// --- Leaderboard State ---
let currentLeaderboardTab = 'xp'; // 'xp', 'elo', 'points'
let currentLeaderboardScope = 'club'; // 'club', 'global'
let leaderboardCache = { club: null, global: null };

// --- Load Leaderboards ---
async function loadLeaderboards() {
    const container = document.getElementById('leaderboard-content-wrapper');
    if (!container) return;

    // Standard-Bereich auf 'global' setzen wenn Benutzer keinen Verein hat
    if (!currentUserData.club_id) {
        currentLeaderboardScope = 'global';
    }

    // Ranglisten-Struktur rendern
    container.innerHTML = `
        <div class="bg-white p-6 rounded-xl shadow-md max-w-2xl mx-auto">
            <h2 class="text-2xl font-bold text-gray-900 text-center mb-4">Rangliste</h2>

            <!-- Tabs -->
            <div class="overflow-x-auto border-b border-gray-200 mb-4 -mx-6 px-6">
                <div class="flex justify-center min-w-max">
                    <button id="tab-effort" data-tab="effort" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Fleiß</div>
                        <div class="text-xs text-gray-500 font-normal">(XP)</div>
                    </button>
                    <button id="tab-season" data-tab="season" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Season</div>
                        <div class="text-xs text-gray-500 font-normal">(Punkte)</div>
                    </button>
                    <button id="tab-skill" data-tab="skill" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Skill</div>
                        <div class="text-xs text-gray-500 font-normal">(Elo)</div>
                    </button>
                    <button id="tab-ranks" data-tab="ranks" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Ränge</div>
                        <div class="text-xs text-gray-500 font-normal">(Level)</div>
                    </button>
                    <button id="tab-doubles" data-tab="doubles" class="leaderboard-tab-btn lb-tab-btn flex-shrink-0 px-6 py-3 text-sm font-semibold border-b-2 border-transparent hover:border-gray-300 transition-colors">
                        <div>Doppel</div>
                        <div class="text-xs text-gray-500 font-normal">(Teams)</div>
                    </button>
                </div>
            </div>

            <!-- Filter Row -->
            <div id="player-subgroup-filter-container" class="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                <div class="flex items-center gap-2 flex-1 min-w-0">
                    <label for="player-subgroup-filter" class="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Ansicht:
                    </label>
                    <select id="player-subgroup-filter" class="flex-1 min-w-0 px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm bg-white">
                        <option value="club">Mein Verein</option>
                        <option value="following">Abonniert</option>
                        <option value="global">Global</option>
                    </select>
                </div>
                <div class="flex items-center gap-2 flex-1 sm:flex-none">
                    <label for="player-age-group-filter" class="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Alter:
                    </label>
                    <select id="player-age-group-filter" class="flex-1 sm:flex-none px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm bg-white">
                        <option value="all">Alle</option>
                    </select>
                </div>
                <div class="flex items-center gap-2 flex-1 sm:flex-none">
                    <label for="player-gender-filter" class="text-sm font-medium text-gray-700 whitespace-nowrap">
                        Geschlecht:
                    </label>
                    <select id="player-gender-filter" class="flex-1 sm:flex-none px-3 py-2 text-sm border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-md shadow-sm bg-white">
                        <option value="all">Alle</option>
                        <option value="male">Jungen/Herren</option>
                        <option value="female">Mädchen/Damen</option>
                    </select>
                </div>
            </div>

            <!-- Effort/Fleiß Content -->
            <div id="content-effort" class="leaderboard-tab-content mt-4 space-y-2 hidden">
                <div id="leaderboard-list-effort" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Fleiß-Rangliste...</p>
                </div>
            </div>

            <!-- Season Content -->
            <div id="content-season" class="leaderboard-tab-content mt-4 space-y-2 hidden">
                <div id="leaderboard-list-season" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Season-Rangliste...</p>
                </div>
            </div>

            <!-- Skill/Elo Content -->
            <div id="content-skill" class="leaderboard-tab-content mt-4 space-y-2 hidden">
                <div id="leaderboard-list-skill" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Skill-Rangliste...</p>
                </div>
            </div>

            <!-- Ranks Content -->
            <div id="content-ranks" class="leaderboard-tab-content mt-4 space-y-4 hidden">
                <div id="ranks-list" class="space-y-4">
                    <p class="text-center text-gray-500 py-8">Lade Ränge...</p>
                </div>
            </div>

            <!-- Doubles Content -->
            <div id="content-doubles" class="leaderboard-tab-content mt-4 hidden">
                <div id="doubles-list" class="space-y-2">
                    <p class="text-center text-gray-500 py-8">Lade Doppel-Rangliste...</p>
                </div>
            </div>

        </div>
    `;

    // Tab-Listener einrichten
    document.querySelectorAll('.lb-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Alte (lb-tab-*) und neue (tab-*) ID-Formate unterstützen
            const tab = btn.getAttribute('data-tab') || btn.id.replace('lb-tab-', '').replace('tab-', '');
            currentLeaderboardTab = tab;
            updateLeaderboardTabs();
            updateLeaderboardContent();
        });
    });

    // Scope-Listener einrichten
    document.querySelectorAll('.lb-scope-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const scope = btn.id.replace('lb-scope-', '');
            currentLeaderboardScope = scope;
            updateLeaderboardScope();
            updateLeaderboardContent();
        });
    });

    // Initialzustand
    updateLeaderboardTabs();
    updateLeaderboardScope();

    // Daten laden
    await fetchLeaderboardData();
    updateLeaderboardContent();

    // Doppel-Rangliste laden
    loadDoublesLeaderboardTab();

    // Ranglisten-Einstellungen anwenden (Tabs je nach Einstellungen ein-/ausblenden)
    applyPreferences();
}

function updateLeaderboardTabs() {
    document.querySelectorAll('.lb-tab-btn').forEach(btn => {
        // Alte (lb-tab-*) und neue (tab-*) ID-Formate unterstützen
        const tab = btn.getAttribute('data-tab') || btn.id.replace('lb-tab-', '').replace('tab-', '');
        if (tab === currentLeaderboardTab) {
            btn.classList.add('border-indigo-500', 'text-indigo-600');
            btn.classList.remove('border-transparent');
        } else {
            btn.classList.remove('border-indigo-500', 'text-indigo-600');
            btn.classList.add('border-transparent');
        }
    });
}

function updateLeaderboardScope() {
    document.querySelectorAll('.lb-scope-btn').forEach(btn => {
        const scope = btn.id.replace('lb-scope-', '');
        if (scope === currentLeaderboardScope) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
            btn.classList.remove('text-gray-600');
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
            btn.classList.add('text-gray-600');
        }
    });
}

// Zwischen verschiedenen Ranglisten-Inhaltsansichten wechseln
function updateLeaderboardContent() {
    const scopeToggle = document.getElementById('lb-scope-club')?.parentElement;

    // Alle Tab-Inhalte ausblenden
    document.querySelectorAll('.leaderboard-tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Scope-Toggle je nach Tab ein-/ausblenden
    if (scopeToggle) {
        if (currentLeaderboardTab === 'skill' || currentLeaderboardTab === 'elo' || currentLeaderboardTab === 'doubles') {
            scopeToggle.classList.remove('hidden');
        } else {
            scopeToggle.classList.add('hidden');
        }
    }

    // Passenden Inhalt je nach aktuellem Tab anzeigen
    const contentMap = {
        'xp': 'content-effort',
        'effort': 'content-effort',
        'points': 'content-season',
        'season': 'content-season',
        'elo': 'content-skill',
        'skill': 'content-skill',
        'ranks': 'content-ranks',
        'doubles': 'content-doubles'
    };

    const contentId = contentMap[currentLeaderboardTab];
    if (contentId) {
        const content = document.getElementById(contentId);
        if (content) content.classList.remove('hidden');
    }

    // Fallback: Passenden Legacy-Inhalt anzeigen
    if (currentLeaderboardTab === 'ranks') {
        const ranksList = document.getElementById('ranks-list');
        if (ranksList) ranksList.classList.remove('hidden');
        renderRanksList();
    } else if (currentLeaderboardTab === 'doubles') {
        const doublesList = document.getElementById('doubles-list');
        if (doublesList) doublesList.classList.remove('hidden');
        // Doppel-Rangliste mit aktuellem Scope neu laden
        loadDoublesLeaderboardTab();
    } else {
        // Ranglisten-Inhalt rendern (Fleiß, Saison, Skill)
        renderLeaderboardList();
    }
}

// Doppel-Rangliste laden tab
async function loadDoublesLeaderboardTab() {
    const container = document.getElementById('doubles-list');
    if (!container) return;

    try {
        // Prüfen ob doubles_pairings Tabelle existiert
        const { error } = await supabase
            .from('doubles_pairings')
            .select('id')
            .limit(1);

        if (error && error.message.includes('does not exist')) {
            // Tabelle existiert nicht - hilfreiche Nachricht anzeigen
            container.innerHTML = `
                <div class="text-center py-8">
                    <p class="text-4xl mb-2">🏓</p>
                    <p class="text-gray-600 font-medium">Doppel-Rangliste</p>
                    <p class="text-sm text-gray-500 mt-2">Die Doppel-Rangliste wird basierend auf gespielten Doppel-Matches erstellt.</p>
                    <p class="text-xs text-gray-400 mt-4">Spiele Doppel-Matches um in der Rangliste zu erscheinen!</p>
                </div>
            `;
            return;
        }

        // Tabelle existiert, importierte Funktion verwenden
        const clubId = currentUserData.club_id;
        const isGlobal = currentLeaderboardScope === 'global' || !clubId;
        const sportId = currentSportContext?.sportId || currentUserData.active_sport_id;

        loadDoublesLeaderboard(
            isGlobal ? null : clubId,
            supabase,
            container,
            realtimeSubscriptions,
            currentUser.id,
            isGlobal,
            sportId
        );
    } catch (err) {
        console.error('Error loading doubles leaderboard:', err);
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p>Doppel-Rangliste konnte nicht geladen werden</p>
            </div>
        `;
    }
}

// Ränge gruppiert nach Stufe rendern
function renderRanksList() {
    const container = document.getElementById('ranks-list');
    if (!container) return;

    let players = leaderboardCache[currentLeaderboardScope] || leaderboardCache.global || [];

    // Folge-Filter anwenden falls ausgewählt (inkl. aktueller Benutzer)
    if (currentSubgroupFilter === 'following') {
        if (followingIdsCache && followingIdsCache.length > 0) {
            players = players.filter(p => followingIdsCache.includes(p.id) || p.id === currentUser.id);
        } else {
            // Keine gefolgten Benutzer - nur aktuellen Benutzer anzeigen
            players = players.filter(p => p.id === currentUser.id);
        }
    }

    // Altersgruppen-Filter anwenden (Spieler ohne Geburtsdatum ausschließen wenn Filter aktiv)
    if (currentAgeGroupFilter !== 'all') {
        players = players.filter(p => matchesAgeGroup(p.birthdate, currentAgeGroupFilter));
    }

    // Geschlechter-Filter anwenden (Spieler ohne Geschlecht ausschließen wenn Filter aktiv)
    if (currentGenderFilter !== 'all') {
        players = players.filter(p => p.gender && p.gender === currentGenderFilter);
    }

    if (players.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
        return;
    }

    // Spieler nach Rang gruppieren mit importierter Funktion
    const grouped = groupPlayersByRank(players.map(p => ({
        ...p,
        eloRating: p.elo_rating,
        xp: p.xp,
        grundlagenCompleted: p.grundlagen_completed || 0
    })));

    let html = '';

    // Ränge von höchstem zu niedrigstem anzeigen
    for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
        const rank = RANK_ORDER[i];
        const playersInRank = grouped[rank.id] || [];

        if (playersInRank.length === 0) continue;

        // Nach XP innerhalb des Rangs sortieren
        playersInRank.sort((a, b) => (b.xp || 0) - (a.xp || 0));

        html += `
            <div class="rank-section">
                <div class="flex items-center justify-between p-3 rounded-lg" style="background-color: ${rank.color}20; border-left: 4px solid ${rank.color};">
                    <div class="flex items-center space-x-2">
                        <span class="text-2xl">${rank.emoji}</span>
                        <span class="font-bold text-lg" style="color: ${rank.color};">${rank.name}</span>
                    </div>
                    <span class="text-sm text-gray-600">${playersInRank.length} Spieler</span>
                </div>
                <div class="mt-2 space-y-1 pl-4">
                    ${playersInRank.map(player => {
                        const isCurrentUser = player.id === currentUser.id;
                        const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unbekannt';
                        return `
                        <div class="flex items-center p-2 rounded ${isCurrentUser ? 'bg-indigo-100 font-bold' : 'bg-gray-50'}">
                            <img src="${player.avatar_url || DEFAULT_AVATAR}" alt="Avatar" class="h-8 w-8 rounded-full object-cover mr-3" onerror="this.src='${DEFAULT_AVATAR}'">
                            <div class="flex-grow">
                                <p class="text-sm">${playerName}</p>
                            </div>
                            <div class="text-xs text-gray-600">
                                ${player.elo_rating || 0} Elo | ${player.xp || 0} XP
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html || '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
}

async function fetchLeaderboardData() {
    try {
        // Test-Vereins-IDs für Filterung laden (für renderLeaderboardList cachen)
        await loadTestClubIds();

        // Benutzer der aktuellen Sportart für Multi-Sport-Filter abrufen
        const effectiveClubId = currentSportContext?.clubId || currentUserData.club_id;
        // Sport aus Kontext verwenden, Fallback auf active_sport_id des Profils
        const sportId = currentSportContext?.sportId || currentUserData.active_sport_id;
        console.log('[Leaderboard] Using sport ID:', sportId, '(from context:', !!currentSportContext?.sportId, ', from profile:', !!currentUserData.active_sport_id, ')');

        // Vereinsdaten abrufen - Spieler in gleichem Sport UND Verein
        if (effectiveClubId) {
            let clubQuery = supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url, xp, elo_rating, points, role, birthdate, gender, subgroup_ids, club_id, grundlagen_completed, clubs:club_id(name), privacy_settings')
                .in('role', ['player', 'coach', 'head_coach']);

            // Nach Sport filtern
            if (sportId) {
                clubQuery = clubQuery.eq('active_sport_id', sportId);
                console.log('[Leaderboard] Sport filter active:', sportId);
            }

            // Nach Verein filtern
            clubQuery = clubQuery.eq('club_id', effectiveClubId);

            const { data: clubPlayers, error: clubError } = await clubQuery;

            if (clubError) {
                console.error('[Leaderboard] Error fetching club data:', clubError);
            }

            leaderboardCache.club = (clubPlayers || []).map(p => ({
                ...p,
                club_name: p.clubs?.name || null
            }));
        } else {
            leaderboardCache.club = [];
        }

        // Globale Daten abrufen - ALLE Spieler im Sport (für Rangberechnung, aber nur Top 100 anzeigen)
        let globalQuery = supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, xp, elo_rating, points, role, birthdate, gender, subgroup_ids, club_id, grundlagen_completed, clubs:club_id(name), privacy_settings')
            .in('role', ['player', 'coach', 'head_coach']);

        // Nach Sport filtern for global leaderboard
        if (sportId) {
            globalQuery = globalQuery.eq('active_sport_id', sportId);
        }

        const { data: globalPlayers, error: globalError } = await globalQuery;

        if (globalError) {
            console.error('[Leaderboard] Error fetching global data:', globalError);
        }

        leaderboardCache.global = (globalPlayers || []).map(p => ({
            ...p,
            club_name: p.clubs?.name || null
        }));
    } catch (error) {
        console.error('Error fetching leaderboard data:', error);
    }
}

function renderLeaderboardList() {
    // Tab-Namen zu Container-IDs mappen
    const containerMap = {
        'xp': 'leaderboard-list-effort',
        'effort': 'leaderboard-list-effort',
        'points': 'leaderboard-list-season',
        'season': 'leaderboard-list-season',
        'elo': 'leaderboard-list-skill',
        'skill': 'leaderboard-list-skill'
    };

    const containerId = containerMap[currentLeaderboardTab];
    if (!containerId) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    let players = leaderboardCache[currentLeaderboardScope] || [];

    // Scope-/Untergruppenfilter vom Ansicht-Dropdown anwenden
    // Werte können sein: 'club', 'global', 'following', oder 'subgroup:xxx'
    if (currentSubgroupFilter && currentSubgroupFilter.startsWith('subgroup:')) {
        // Benutzerdefinierten Untergruppenfilter anwenden
        const subgroupId = currentSubgroupFilter.replace('subgroup:', '');
        players = players.filter(p => p.subgroup_ids && p.subgroup_ids.includes(subgroupId));
    } else if (currentSubgroupFilter === 'following') {
        // Folge-Filter anwenden - gefolgten Spielern UND sich selbst anzeigen
        if (followingIdsCache && followingIdsCache.length > 0) {
            players = players.filter(p => followingIdsCache.includes(p.id) || p.id === currentUser.id);
        } else {
            // Keine gefolgten Benutzer - nur aktuellen Benutzer anzeigen
            players = players.filter(p => p.id === currentUser.id);
        }
    }
    // 'club' and 'global' don't filter - they just set the scope (which is handled by leaderboardCache[currentLeaderboardScope])

    // Altersgruppen-Filter anwenden (Spieler ohne Geburtsdatum ausschließen wenn Filter aktiv)
    if (currentAgeGroupFilter !== 'all') {
        players = players.filter(p => matchesAgeGroup(p.birthdate, currentAgeGroupFilter));
    }

    // Geschlechter-Filter anwenden (Spieler ohne Geschlecht ausschließen wenn Filter aktiv)
    if (currentGenderFilter !== 'all') {
        players = players.filter(p => p.gender && p.gender === currentGenderFilter);
    }

    // Spieler aus Test-Vereinen ausfiltern (außer Benutzer ist aus Test-Verein)
    if (testClubIdsCache && testClubIdsCache.length > 0) {
        const isCurrentUserInTestClub = currentUserData?.club_id && testClubIdsCache.includes(currentUserData.club_id);

        players = players.filter(player => {
            // Wenn Spieler nicht in Test-Verein ist, anzeigen
            if (!player.club_id || !testClubIdsCache.includes(player.club_id)) {
                return true;
            }

            // Spieler ist in Test-Verein - nur anzeigen wenn Benutzer aus demselben Test-Verein
            if (isCurrentUserInTestClub && currentUserData.club_id === player.club_id) {
                return true;
            }

            // Test-Verein-Spieler für alle anderen ausblenden
            return false;
        });
    }

    // Nach Datenschutz-Einstellungen filtern (gilt für alle inkl. Trainer)
    let currentUserHidden = false;
    players = players.filter(player => {
        const privacySettings = player.privacy_settings || {};
        const showInLeaderboards = privacySettings.showInLeaderboards !== false; // Standard: true
        const searchable = privacySettings.searchable || 'global'; // Standard: global

        const isCurrentUser = player.id === currentUser.id;
        const isSameClub = currentUserData?.club_id && player.club_id === currentUserData.club_id;

        // Wenn Spieler Ranglisten-Sichtbarkeit deaktiviert hat
        if (!showInLeaderboards) {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true; // Aktuellen Benutzer immer sich selbst anzeigen
            }
            return false; // Von anderen verbergen
        }

        // Wenn Spieler nur für Vereinsmitglieder sichtbar
        if (searchable === 'club_only') {
            if (isCurrentUser) {
                currentUserHidden = true;
                return true; // Aktuellen Benutzer immer sich selbst anzeigen
            }
            // Nur anzeigen wenn Betrachter im selben Verein
            if (isSameClub) {
                return true;
            }
            return false; // Von Nicht-Vereinsmitgliedern verbergen
        }

        return true; // Globale Sichtbarkeit
    });

    // Nach aktuellem Tab sortieren - Tab-Namen zu Feldnamen
    const fieldMap = {
        'xp': 'xp',
        'effort': 'xp',
        'elo': 'elo_rating',
        'skill': 'elo_rating',
        'points': 'points',
        'season': 'points'
    };
    const field = fieldMap[currentLeaderboardTab];
    const sorted = [...players].sort((a, b) => (b[field] || 0) - (a[field] || 0));

    // Club view: show all players, Global view: show top 100
    const isGlobalView = currentLeaderboardScope === 'global';
    const displayLimit = isGlobalView ? 100 : sorted.length;
    const displayPlayers = sorted.slice(0, displayLimit);

    const currentUserRank = sorted.findIndex(p => p.id === currentUser.id) + 1;
    const currentPlayerData = sorted.find(p => p.id === currentUser.id);
    const isCurrentUserInDisplayList = currentUserRank > 0 && currentUserRank <= displayLimit;

    if (sorted.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-8">Keine Spieler gefunden</p>';
        return;
    }

    let html = '';

    // Datenschutz-Hinweis anzeigen wenn Benutzer vor anderen verborgen
    if (currentUserHidden) {
        html += `
            <div class="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4 rounded-r-lg">
                <div class="flex items-start">
                    <i class="fas fa-eye-slash text-amber-500 mt-0.5 mr-2"></i>
                    <div class="text-sm text-amber-700">
                        <strong>Du bist für andere nicht sichtbar.</strong><br>
                        Deine Datenschutz-Einstellungen verbergen dich in der Rangliste für andere Spieler.
                        <a href="/settings.html" class="text-amber-800 underline hover:text-amber-900">Einstellungen ändern</a>
                    </div>
                </div>
            </div>
        `;
    }

    // Prüfen ob Vereinsnamen angezeigt werden sollen (globaler Bereich + Skill/Elo-Tab)
    const showClubName = currentLeaderboardScope === 'global' &&
        (currentLeaderboardTab === 'skill' || currentLeaderboardTab === 'elo');

    // Prüfen ob Head-to-Head verfügbar ist (nur Skill/Elo-Tab)
    const isH2HEnabled = currentLeaderboardTab === 'skill' || currentLeaderboardTab === 'elo';

    displayPlayers.forEach((player, index) => {
        const isCurrentUser = player.id === currentUser.id;
        const rank = index + 1;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
        const value = player[field] || 0;
        const playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unbekannt';
        const clubNameHtml = showClubName && player.club_name
            ? `<div class="text-xs text-gray-500">${player.club_name}</div>`
            : '';

        // Zeile für Head-to-Head klickbar machen (nicht für aktuellen Benutzer)
        const isClickable = isH2HEnabled && !isCurrentUser;
        const clickableClass = isClickable ? 'cursor-pointer' : '';
        const dataAttr = isClickable ? `data-player-id="${player.id}"` : '';

        html += `
            <div class="flex items-center justify-between p-3 rounded-lg ${isCurrentUser ? 'bg-indigo-50 border-2 border-indigo-300' : 'bg-gray-50 hover:bg-gray-100'} transition-colors ${clickableClass}" ${dataAttr}>
                <div class="flex items-center gap-3">
                    <span class="w-8 text-center font-bold ${rank <= 3 ? 'text-lg' : 'text-gray-500'}">${medal}</span>
                    <img src="${player.avatar_url || DEFAULT_AVATAR}"
                         class="w-10 h-10 rounded-full object-cover border-2 ${isCurrentUser ? 'border-indigo-400' : 'border-gray-200'}"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <div class="flex items-center">
                            <span class="${isCurrentUser ? 'font-bold text-indigo-700' : 'font-medium'}">${playerName}</span>
                            ${isCurrentUser ? '<span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>' : ''}
                        </div>
                        ${clubNameHtml}
                    </div>
                </div>
                <span class="font-bold text-lg ${currentLeaderboardTab === 'xp' ? 'text-purple-600' : currentLeaderboardTab === 'elo' ? 'text-blue-600' : 'text-yellow-600'}">${value}</span>
            </div>
        `;
    });

    // Aktuellen Benutzer anzeigen wenn nicht in Liste (für globale Ansicht mit Top 100)
    if (!isCurrentUserInDisplayList && currentPlayerData && currentUserRank > 0) {
        const currentPlayerName = `${currentPlayerData.first_name || ''} ${currentPlayerData.last_name || ''}`.trim() || 'Du';
        const currentUserClubHtml = showClubName && currentPlayerData.club_name
            ? `<div class="text-xs text-gray-500">${currentPlayerData.club_name}</div>`
            : '';
        html += `
            <div class="border-t-2 border-dashed border-gray-300 mt-4 pt-4">
                <div class="flex items-center justify-between p-3 rounded-lg bg-indigo-50 border-2 border-indigo-300">
                    <div class="flex items-center gap-3">
                        <span class="w-8 text-center font-bold text-gray-500">${currentUserRank}.</span>
                        <img src="${currentPlayerData.avatar_url || DEFAULT_AVATAR}"
                             class="w-10 h-10 rounded-full object-cover border-2 border-indigo-400"
                             onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <div class="flex items-center">
                                <span class="font-bold text-indigo-700">${currentPlayerName}</span>
                                <span class="ml-2 text-xs bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full">Du</span>
                            </div>
                            ${currentUserClubHtml}
                        </div>
                    </div>
                    <span class="font-bold text-lg ${currentLeaderboardTab === 'xp' ? 'text-purple-600' : currentLeaderboardTab === 'elo' ? 'text-blue-600' : 'text-yellow-600'}">${currentPlayerData[field] || 0}</span>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Klick-Handler hinzufügens for head-to-head modal (skill/elo tab only)
    if (isH2HEnabled) {
        container.querySelectorAll('[data-player-id]').forEach(el => {
            el.addEventListener('click', () => {
                const opponentId = el.getAttribute('data-player-id');
                showHeadToHeadModal(supabase, currentUser.id, opponentId);
            });
        });
    }
}

// --- Load Points History ---
async function loadPointsHistory() {
    const container = document.getElementById('points-history');
    if (!container) return;

    try {
        const { data: history, error } = await supabase
            .from('points_history')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!history || history.length === 0) {
            container.innerHTML = '<li class="text-gray-500 text-center">Noch keine Punkte-Historie</li>';
            return;
        }

        container.innerHTML = history.map(entry => {
            const points = entry.points || 0;
            const xp = entry.xp || 0;
            const eloChange = entry.elo_change || 0;
            const reason = entry.description || entry.reason || 'Punkte';
            const date = formatDate(entry.timestamp || entry.created_at);

            // Punkte-Anzeige erstellen
            const pointsClass = points > 0 ? 'text-green-600' : points < 0 ? 'text-red-600' : 'text-gray-600';
            const pointsSign = points > 0 ? '+' : points < 0 ? '' : '±';

            // Details erstellen (XP und Elo)
            const details = [];
            if (xp !== 0) {
                const xpSign = xp > 0 ? '+' : '';
                const xpClass = xp > 0 ? 'text-green-600' : xp < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${xpClass}">${xpSign}${xp} XP</span>`);
            }
            if (eloChange !== 0) {
                const eloSign = eloChange > 0 ? '+' : '';
                const eloClass = eloChange > 0 ? 'text-blue-600' : eloChange < 0 ? 'text-red-600' : 'text-gray-600';
                // Prüfen ob Doppel-Match um "Doppel-Elo" anzuzeigen
                const isDoubles = reason.toLowerCase().includes('doppel');
                const eloLabel = isDoubles ? 'Doppel-Elo' : 'Elo';
                details.push(`<span class="${eloClass}">${eloSign}${eloChange} ${eloLabel}</span>`);
            }

            const detailsHtml = details.length > 0
                ? `<span class="text-xs text-gray-500 block mt-1">${details.join(' • ')}</span>`
                : '';

            // Partner-Badge
            let partnerBadge = '';
            if (entry.is_active_player) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">Aktiv</span>';
            } else if (entry.is_partner) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">Partner</span>';
            }

            return `
                <li class="flex justify-between items-start text-sm p-2 bg-gray-50 rounded">
                    <div>
                        <p class="font-medium">${reason}${partnerBadge}</p>
                        <p class="text-xs text-gray-500">${date}</p>
                    </div>
                    <div class="text-right">
                        <span class="font-bold ${pointsClass}">${pointsSign}${points} Pkt</span>
                        ${detailsHtml}
                    </div>
                </li>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading points history:', error);
        container.innerHTML = '<li class="text-red-500">Fehler beim Laden</li>';
    }
}

// --- Load Challenges ---
async function loadChallenges() {
    const container = document.getElementById('challenges-list');
    if (!container) return;

    // Überspringen wenn Benutzer keinen Verein hat
    if (!currentUserData.club_id) {
        container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Tritt einem Verein bei um Challenges zu sehen</p>';
        return;
    }

    try {
        const { data: challenges, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('club_id', currentUserData.club_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!challenges || challenges.length === 0) {
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Keine aktiven Challenges</p>';
            return;
        }

        container.innerHTML = challenges.map(challenge => `
            <div class="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-lg border border-purple-200 cursor-pointer hover:shadow-md transition"
                 onclick="openChallengeModal('${challenge.id}')">
                <h4 class="font-semibold text-purple-800">${challenge.name}</h4>
                <p class="text-sm text-gray-600 mt-1 line-clamp-2">${challenge.description || ''}</p>
                <div class="flex justify-between items-center mt-3">
                    <span class="text-xs text-purple-600">${challenge.xp_reward || 0} XP</span>
                    <span class="text-xs text-gray-400">${formatDate(challenge.expires_at)}</span>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading challenges:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden der Challenges</p>';
    }
}

// --- Load Exercises ---
async function loadExercises() {
    const container = document.getElementById('exercises-list');
    if (!container) return;

    try {
        // Abfrage mit optionalem Sport-Filter erstellen
        let query = supabase
            .from('exercises')
            .select('*')
            .order('name');

        // Nach aktiver Sportart des Benutzers filtern falls gesetzt
        const activeSportId = currentUserData?.active_sport_id;
        if (activeSportId) {
            // Übungen anzeigen die zur Sportart passen ODER keine Sportart haben (globale Übungen)
            query = query.or(`sport_id.eq.${activeSportId},sport_id.is.null`);
        }

        const { data: exercises, error } = await query;

        if (error) throw error;

        if (!exercises || exercises.length === 0) {
            container.innerHTML = '<p class="text-gray-500 col-span-full text-center">Keine Übungen verfügbar</p>';
            return;
        }

        // Tags sammeln und Übungskarten mit Tag-Daten erstellen
        const allTags = new Set();
        const exerciseCards = [];

        container.innerHTML = '';

        exercises.forEach(exercise => {
            const exerciseTags = exercise.tags || [];
            exerciseTags.forEach(tag => allTags.add(tag));

            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg border hover:shadow-md transition cursor-pointer';
            card.dataset.tags = JSON.stringify(exerciseTags);
            card.onclick = () => openExerciseModal(exercise.id);
            card.innerHTML = `
                <div class="aspect-video bg-gray-100 rounded mb-3 overflow-hidden">
                    <img src="${exercise.image_url || ''}"
                         alt="${exercise.name}"
                         class="w-full h-full object-cover"
                         onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-4xl\\'>🏓</div>'">
                </div>
                <h4 class="font-semibold">${exercise.name}</h4>
                <p class="text-sm text-gray-600 mt-1 line-clamp-2">${exercise.description || ''}</p>
                <div class="flex justify-between items-center mt-2">
                    <span class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">${exercise.xp_reward || 0} XP</span>
                </div>
            `;

            container.appendChild(card);
            exerciseCards.push({ card, tags: exerciseTags });
        });

        // Tag-Filter Setup
        setupExerciseTagFilter(allTags, exerciseCards);

    } catch (error) {
        console.error('Error loading exercises:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden der Übungen</p>';
    }
}

/**
 * Richtet Tag-Filter für Übungen ein
 */
function setupExerciseTagFilter(allTags, exerciseCards) {
    const filterContainer = document.getElementById('tags-filter-container');
    const toggleButton = document.getElementById('toggle-tags-filter-player');
    const filterSection = document.getElementById('tags-filter-section-player');

    if (!filterContainer || !toggleButton || !filterSection) return;

    // Toggle Button
    toggleButton.onclick = () => {
        filterSection.classList.toggle('hidden');
    };

    // Filter Buttons erstellen
    filterContainer.innerHTML = '';

    const allButton = document.createElement('button');
    allButton.className = 'tag-filter-btn active-filter bg-indigo-600 text-white px-3 py-1 text-sm font-semibold rounded-full';
    allButton.textContent = 'Alle';
    allButton.dataset.tag = 'all';
    filterContainer.appendChild(allButton);

    allTags.forEach(tag => {
        const button = document.createElement('button');
        button.className = 'tag-filter-btn bg-gray-200 text-gray-700 px-3 py-1 text-sm font-semibold rounded-full hover:bg-gray-300';
        button.textContent = tag;
        button.dataset.tag = tag;
        filterContainer.appendChild(button);
    });

    // Filter Click Handler
    filterContainer.onclick = (e) => {
        if (!e.target.classList.contains('tag-filter-btn')) return;

        const selectedTag = e.target.dataset.tag;

        // Button-Styles aktualisieren
        filterContainer.querySelectorAll('.tag-filter-btn').forEach(btn => {
            btn.classList.remove('active-filter', 'bg-indigo-600', 'text-white');
            btn.classList.add('bg-gray-200', 'text-gray-700');
        });
        e.target.classList.add('active-filter', 'bg-indigo-600', 'text-white');
        e.target.classList.remove('bg-gray-200', 'text-gray-700');

        // Übungen filtern
        exerciseCards.forEach(({ card, tags }) => {
            if (selectedTag === 'all' || tags.includes(selectedTag)) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    };
}

// --- Load Match Requests ---
// NOTE: Match requests show ALL sports (not filtered by active sport)
// Absichtlich - Benutzer soll alle ausstehenden Anfragen sehen unabhängig von Sportart
async function loadMatchRequests() {
    const container = document.getElementById('overview-match-requests');
    if (!container) return;

    try {
        // Ausstehende EINZEL-Anfragen abrufen wo Benutzer beteiligt
        const { data: singlesRequests, error: singlesError } = await supabase
            .from('match_requests')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(10);

        if (singlesError) throw singlesError;

        // Ausstehende DOPPEL-Anfragen abrufen wo Benutzer beteiligt
        // Alle ausstehenden Doppel-Anfragen abrufen und in JS filtern
        const { data: allDoublesRequests, error: doublesError } = await supabase
            .from('doubles_match_requests')
            .select('*')
            .in('status', ['pending_opponent', 'pending_coach'])
            .order('created_at', { ascending: false })
            .limit(50);

        if (doublesError) throw doublesError;

        // Debug: Empfangene Doppel-Anfragen loggen
        console.log('[Doubles] All doubles requests fetched:', allDoublesRequests?.length || 0, allDoublesRequests);

        // Doppel-Anfragen filtern wo aktueller Benutzer beteiligt ist (JSONB-Struktur)
        const doublesRequests = (allDoublesRequests || []).filter(r => {
            const teamA = r.team_a || {};
            const teamB = r.team_b || {};
            const isInvolved = teamA.player1_id === currentUser.id ||
                   teamA.player2_id === currentUser.id ||
                   teamB.player1_id === currentUser.id ||
                   teamB.player2_id === currentUser.id;
            console.log('[Doubles] Request:', r.id, 'teamA:', teamA, 'teamB:', teamB, 'currentUser:', currentUser.id, 'isInvolved:', isInvolved);
            return isInvolved;
        }).slice(0, 10);

        // Jeden Anfrage-Typ markieren
        const singles = (singlesRequests || []).map(r => ({ ...r, _type: 'singles' }));
        const doubles = (doublesRequests || []).map(r => ({ ...r, _type: 'doubles' }));

        // Kombinieren und nach created_at sortieren
        const allRequests = [...singles, ...doubles].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        ).slice(0, 10);

        if (allRequests.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-4">Keine ausstehenden Anfragen</p>';
            return;
        }

        // Eindeutige Benutzer-IDs abrufen um Profile mit Vereinsinfo zu laden
        const userIds = [...new Set(allRequests.flatMap(r => {
            if (r._type === 'singles') {
                return [r.player_a_id, r.player_b_id];
            } else {
                // JSONB-Struktur für Doppel verwenden
                const teamA = r.team_a || {};
                const teamB = r.team_b || {};
                return [teamA.player1_id, teamA.player2_id, teamB.player1_id, teamB.player2_id].filter(id => id);
            }
        }))];

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, club_id')
            .in('id', userIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Vereinsnamen abrufen
        const clubIds = [...new Set((profiles || []).map(p => p.club_id).filter(Boolean))];
        const { data: clubs } = clubIds.length > 0
            ? await supabase.from('clubs').select('id, name').in('id', clubIds)
            : { data: [] };
        const clubMap = {};
        (clubs || []).forEach(c => { clubMap[c.id] = c.name; });

        container.innerHTML = allRequests.map(req => {
            if (req._type === 'singles') {
                return renderSinglesRequestCard(req, profileMap, clubMap);
            } else {
                return renderDoublesRequestCard(req, profileMap);
            }
        }).join('');

        // Badge aktualisieren (alle ausstehenden Anfragen für aktuellen Benutzer zählen)
        const badge = document.getElementById('match-request-badge');
        if (badge) {
            const singlesPending = singles.filter(r => r.player_b_id === currentUser.id && r.status === 'pending_player').length;
            const doublesPending = doubles.filter(r => {
                // JSONB-Struktur für Doppel verwenden
                const teamB = r.team_b || {};
                const isTeamB = teamB.player1_id === currentUser.id || teamB.player2_id === currentUser.id;
                return isTeamB && r.status === 'pending_opponent';
            }).length;
            const pendingCount = singlesPending + doublesPending;

            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

    } catch (error) {
        console.error('Error loading match requests:', error);
        container.innerHTML = '<p class="text-red-500">Fehler beim Laden</p>';
    }
}

// Hilfsfunktion zum Rendern von Einzel-Anfrage-Karten
function renderSinglesRequestCard(req, profileMap, clubMap) {
    const isPlayerA = req.player_a_id === currentUser.id;
    const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
    const otherPlayer = profileMap[otherPlayerId];
    const otherPlayerName = otherPlayer ? `${otherPlayer.first_name || ''} ${otherPlayer.last_name || ''}`.trim() || 'Unbekannt' : 'Unbekannt';

    // Vereins-Info - nur anzeigen wenn anderer Verein
    const otherPlayerClubId = otherPlayer?.club_id;
    const myClubId = currentUserData?.club_id;
    const isDifferentClub = otherPlayerClubId && myClubId && otherPlayerClubId !== myClubId;
    const otherClubName = isDifferentClub ? clubMap[otherPlayerClubId] : null;

    // Match-Ergebnis
    const setsDisplay = formatSetsDisplay(req.sets);
    const playerAProfile = profileMap[req.player_a_id];
    const playerBProfile = profileMap[req.player_b_id];
    const playerAName = playerAProfile ? `${playerAProfile.first_name || ''} ${playerAProfile.last_name || ''}`.trim() : 'Spieler A';
    const playerBName = playerBProfile ? `${playerBProfile.first_name || ''} ${playerBProfile.last_name || ''}`.trim() : 'Spieler B';
    const winnerName = req.winner_id === req.player_a_id ? playerAName : playerBName;
    const handicapText = req.handicap_used ? ' (mit Handicap)' : '';

    const statusText = req.status === 'pending_player' ? 'Warte auf Bestätigung' : 'Warte auf Coach';

    return `
        <div id="match-request-${req.id}" class="p-3 bg-white rounded-lg border mb-2 transition-all duration-300">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}"
                         class="w-10 h-10 rounded-full object-cover"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayerName}</p>
                        ${otherClubName ? `<p class="text-xs text-blue-600">${otherClubName}</p>` : ''}
                    </div>
                </div>
                <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">${statusText}</span>
            </div>
            <div class="bg-gray-50 rounded p-2 mb-2 text-sm">
                <p class="text-gray-700">Ergebnis: ${setsDisplay}</p>
                <p class="text-green-700">Gewinner: ${winnerName}${handicapText}</p>
            </div>
            ${!isPlayerA && req.status === 'pending_player' ? `
                <div class="flex gap-2" id="match-request-buttons-${req.id}">
                    <button onclick="respondToMatchRequest('${req.id}', true)"
                            class="flex-1 px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        Annehmen
                    </button>
                    <button onclick="respondToMatchRequest('${req.id}', false)"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        Ablehnen
                    </button>
                </div>
            ` : isPlayerA ? `
                <div class="flex gap-2">
                    <button onclick="deleteMatchRequest('${req.id}')"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                        Zurückziehen
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// Hilfsfunktion zum Rendern von Doppel-Anfrage-Karten
function renderDoublesRequestCard(req, profileMap) {
    // JSONB-Struktur für Team-Daten verwenden
    const teamA = req.team_a || {};
    const teamB = req.team_b || {};

    // Bestimmen in welchem Team der aktuelle Benutzer ist
    const isTeamA = teamA.player1_id === currentUser.id || teamA.player2_id === currentUser.id;

    // Spielernamen abrufen
    const teamAPlayer1 = profileMap[teamA.player1_id];
    const teamAPlayer2 = profileMap[teamA.player2_id];
    const teamBPlayer1 = profileMap[teamB.player1_id];
    const teamBPlayer2 = profileMap[teamB.player2_id];

    const teamAName1 = teamAPlayer1?.first_name || 'Spieler';
    const teamAName2 = teamAPlayer2?.first_name || 'Spieler';
    const teamBName1 = teamBPlayer1?.first_name || 'Spieler';
    const teamBName2 = teamBPlayer2?.first_name || 'Spieler';

    // Gewinner-Teamnamen bestimmen
    const winnerTeamName = req.winning_team === 'A'
        ? `${teamAName1} & ${teamAName2}`
        : `${teamBName1} & ${teamBName2}`;

    // Satzanzeige für Doppel formatieren
    const setsDisplay = (req.sets || []).map(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ') || '-';

    const handicapText = req.handicap_used ? ' (mit Handicap)' : '';
    const statusText = req.status === 'pending_opponent' ? 'Warte auf Gegner' : 'Warte auf Coach';

    // Anfrage-Richtungstext
    let directionText;
    if (isTeamA) {
        directionText = `Doppel-Anfrage an ${teamBName1} & ${teamBName2}`;
    } else {
        directionText = `Doppel-Anfrage von ${teamAName1} & ${teamAName2}`;
    }

    return `
        <div id="doubles-request-${req.id}" class="p-3 bg-white rounded-lg border border-purple-200 mb-2 transition-all duration-300">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                        <i class="fas fa-users text-purple-600"></i>
                    </div>
                    <div>
                        <p class="font-medium">${directionText}</p>
                        <p class="text-xs text-purple-600">Doppel-Match</p>
                    </div>
                </div>
                <span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">${statusText}</span>
            </div>
            <div class="bg-gray-50 rounded p-2 mb-2 text-sm">
                <p class="text-gray-700 mb-1">
                    <span class="text-indigo-600">${teamAName1} & ${teamAName2}</span>
                    <span class="text-gray-500 mx-1">vs</span>
                    <span class="text-indigo-600">${teamBName1} & ${teamBName2}</span>
                </p>
                <p class="text-gray-700">Ergebnis: ${setsDisplay}</p>
                <p class="text-green-700">Gewinner: ${winnerTeamName}${handicapText}</p>
            </div>
            ${!isTeamA && req.status === 'pending_opponent' ? `
                <div class="flex gap-2" id="doubles-request-buttons-${req.id}">
                    <button onclick="respondToDoublesMatchRequest('${req.id}', true)"
                            class="flex-1 px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        Annehmen
                    </button>
                    <button onclick="respondToDoublesMatchRequest('${req.id}', false)"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
                        Ablehnen
                    </button>
                </div>
            ` : isTeamA ? `
                <div class="flex gap-2">
                    <button onclick="deleteDoublesMatchRequest('${req.id}')"
                            class="flex-1 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                        Zurückziehen
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// --- Load Calendar ---
async function loadCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYearEl = document.getElementById('calendar-month-year');
    if (!grid) return;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Monatsanzeige aktualisieren
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    if (monthYearEl) monthYearEl.textContent = `${monthNames[month]} ${year}`;

    // Ersten und letzten Tag des Monats abrufen
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Anwesenheit für diesen Monat laden
    let attendanceDates = [];
    if (currentUserData.club_id) {
        try {
            const { data } = await supabase
                .from('attendance')
                .select('date')
                .eq('user_id', currentUser.id)
                .eq('present', true)
                .gte('date', firstDay.toISOString().split('T')[0])
                .lte('date', lastDay.toISOString().split('T')[0]);

            attendanceDates = (data || []).map(a => a.date);
        } catch (error) {
            console.error('Error loading attendance:', error);
        }
    }

    // Kalender-Raster erstellen
    let html = '';

    // Leere Zellen für Tage vor Monatsersten
    const startDay = (firstDay.getDay() + 6) % 7; // Monday = 0
    for (let i = 0; i < startDay; i++) {
        html += '<div></div>';
    }

    // Tage des Monats
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isPresent = attendanceDates.includes(dateStr);
        const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();

        html += `
            <div class="aspect-square flex items-center justify-center text-sm rounded-lg border
                        ${isPresent ? 'calendar-day-present' : 'bg-white'}
                        ${isToday ? 'ring-2 ring-indigo-500' : ''}">
                ${day}
            </div>
        `;
    }

    grid.innerHTML = html;

    // Statistiken aktualisieren
    const trainingDaysEl = document.getElementById('stats-training-days');
    if (trainingDaysEl) trainingDaysEl.textContent = attendanceDates.length;

    const statsMonthEl = document.getElementById('stats-month-name');
    if (statsMonthEl) statsMonthEl.textContent = monthNames[month];
}

// --- Season Countdown ---
// Cache für Saison-Konfiguration
let cachedSeasonEnd = null;
let cachedSeasonName = null;
let cachedUserSportId = null;
let lastSeasonFetchTime = null;
const SEASON_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

async function fetchSeasonEndDate() {
    try {
        // Zuerst Cache prüfen
        if (cachedSeasonEnd && lastSeasonFetchTime && Date.now() - lastSeasonFetchTime < SEASON_CACHE_DURATION) {
            return cachedSeasonEnd;
        }

        // Aktive Sportart des Benutzers aus Profil abrufen (Single-Sport-Modell)
        let userSportId = cachedUserSportId;
        if (!userSportId && currentUserData?.active_sport_id) {
            userSportId = currentUserData.active_sport_id;
            cachedUserSportId = userSportId;
        } else if (!userSportId && currentUser) {
            // Fallback: Sport aus Profil abrufen
            const { data: profile } = await supabase
                .from('profiles')
                .select('active_sport_id')
                .eq('id', currentUser.id)
                .single();

            if (profile?.active_sport_id) {
                userSportId = profile.active_sport_id;
                cachedUserSportId = userSportId;
            }
        }

        // Aktive Saison für Benutzer-Sport abrufen
        let query = supabase
            .from('seasons')
            .select('id, name, start_date, end_date, sport_id')
            .eq('is_active', true);

        // Nach Benutzer-Sport filtern falls verfügbar
        if (userSportId) {
            query = query.eq('sport_id', userSportId);
        }

        const { data: activeSeasons, error } = await query
            .order('created_at', { ascending: false })
            .limit(1);

        if (!error && activeSeasons && activeSeasons.length > 0) {
            const activeSeason = activeSeasons[0];
            const seasonEnd = new Date(activeSeason.end_date);

            // Ergebnis cachen
            cachedSeasonEnd = seasonEnd;
            cachedSeasonName = activeSeason.name;
            lastSeasonFetchTime = Date.now();

            console.log('📅 Season end date loaded from seasons table:', seasonEnd.toLocaleString('de-DE'), `(${activeSeason.name})`);
            return seasonEnd;
        }

        // Keine aktive Saison gefunden - null zurückgeben für Saisonpause
        console.log('📅 No active season found for sport:', userSportId || 'all');
        cachedSeasonEnd = null;
        cachedSeasonName = null;
        lastSeasonFetchTime = Date.now();

        return null;

    } catch (error) {
        console.error('Error fetching season end date:', error);
        return null;
    }
}

// Gespeichertes Saison-Enddatum für effizienten Countdown
let seasonEndDate = null;

// Initiales Laden des Saison-Enddatums (einmal aufgerufen)
async function initSeasonCountdown() {
    seasonEndDate = await fetchSeasonEndDate();
    updateSeasonCountdownDisplay();
    // Anzeige jede Sekunde aktualisieren (effizient - keine async Aufrufe)
    setInterval(updateSeasonCountdownDisplay, 1000);
    // Saison-Daten alle 5 Minuten aktualisieren falls sie sich ändern
    setInterval(async () => {
        seasonEndDate = await fetchSeasonEndDate();
    }, 5 * 60 * 1000);
}

// Effizienter Countdown-Update (synchron, keine DB-Aufrufe)
function updateSeasonCountdownDisplay() {
    const countdownEl = document.getElementById('season-countdown');
    if (!countdownEl) return;

    // Keine aktive Saison - Pausenmeldung anzeigen
    if (!seasonEndDate) {
        countdownEl.textContent = 'Saisonpause';
        countdownEl.title = 'Aktuell ist keine Saison aktiv für diese Sportart';
        return;
    }

    const now = new Date();
    const diff = seasonEndDate - now;

    if (diff <= 0) {
        countdownEl.textContent = 'Saison beendet!';
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    countdownEl.textContent = `${days}T ${hours}h ${minutes}m ${seconds}s`;
    countdownEl.title = cachedSeasonName ? `Saison: ${cachedSeasonName}` : '';
}

// Legacy-Funktion für Kompatibilität
async function updateSeasonCountdown() {
    if (!seasonEndDate) {
        seasonEndDate = await fetchSeasonEndDate();
    }
    updateSeasonCountdownDisplay();
}

// --- Season Modal Management ---

let currentSeasonData = null;

/**
 * Öffnet das Saison-Modal
 */
window.openSeasonModal = async function() {
    // Aktuelle Saison-Daten laden
    const clubId = currentUserData?.clubId || currentUserData?.club_id;
    const sportId = currentUserData?.active_sport_id;
    const userRole = currentUserData?.role;

    if (!clubId) {
        alert('Kein Verein gefunden');
        return;
    }

    // Aktive Saison für diesen Club/Sport laden
    let query = supabase
        .from('seasons')
        .select('*')
        .eq('is_active', true);

    // Nach Club filtern (falls club_id existiert)
    if (clubId) {
        query = query.or(`club_id.eq.${clubId},club_id.is.null`);
    }

    if (sportId) {
        query = query.eq('sport_id', sportId);
    }

    const { data: seasons, error } = await query
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error loading season:', error);
    }

    currentSeasonData = seasons?.[0] || null;

    // Modal HTML erstellen (nur Anzeige, keine Bearbeitung)
    const modalHtml = `
        <div id="season-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div class="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
                <div class="p-6">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-gray-800">Saison-Info</h2>
                        <button onclick="closeSeasonModal()" class="text-gray-500 hover:text-gray-700">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>

                    ${currentSeasonData ? `
                        <!-- Aktive Saison anzeigen -->
                        <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
                                <span class="font-semibold text-green-800">Aktive Saison</span>
                            </div>
                            <h3 class="text-lg font-bold text-gray-800">${currentSeasonData.name || 'Unbenannte Saison'}</h3>
                            <div class="mt-2 text-sm text-gray-600">
                                <p><strong>Start:</strong> ${new Date(currentSeasonData.start_date).toLocaleDateString('de-DE')}</p>
                                <p><strong>Ende:</strong> ${new Date(currentSeasonData.end_date).toLocaleDateString('de-DE')}</p>
                            </div>
                            <div class="mt-3 text-sm">
                                <span class="font-medium">Verbleibend:</span>
                                <span id="modal-season-countdown" class="font-bold text-yellow-700"></span>
                            </div>
                        </div>
                        <p class="text-sm text-gray-500 text-center">Die Saison-Verwaltung erfolgt über die Trainer-Seite.</p>
                    ` : `
                        <!-- Keine aktive Saison -->
                        <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-center">
                            <p class="text-gray-600 mb-2">Keine aktive Saison</p>
                            <p class="text-sm text-gray-500">Es läuft aktuell keine Saison für diesen Verein/Sportart.</p>
                        </div>
                        <p class="text-sm text-gray-500 text-center">Der Head-Coach kann auf der Trainer-Seite eine neue Saison starten.</p>
                    `}
                </div>
            </div>
        </div>
    `;

    // Altes Modal entfernen falls vorhanden
    document.getElementById('season-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Countdown im Modal aktualisieren
    if (currentSeasonData) {
        updateModalCountdown();
    }
};

/**
 * Schließt das Saison-Modal
 */
window.closeSeasonModal = function() {
    document.getElementById('season-modal')?.remove();
};

/**
 * Aktualisiert den Countdown im Modal
 */
function updateModalCountdown() {
    const el = document.getElementById('modal-season-countdown');
    if (!el || !currentSeasonData) return;

    const now = new Date();
    const end = new Date(currentSeasonData.end_date);
    const diff = end - now;

    if (diff <= 0) {
        el.textContent = 'Saison beendet!';
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    el.textContent = `${days}T ${hours}h ${minutes}m`;
}

// --- Realtime Subscriptions ---

/**
 * Handle realtime subscription status changes
 * Auto-reconnect on CHANNEL_ERROR
 */
function handleSubscriptionStatus(channelName, status) {
    console.log(`[Realtime] ${channelName} subscription status:`, status);

    if (status === 'CHANNEL_ERROR' && !isReconnecting) {
        console.warn(`[Realtime] ${channelName} got CHANNEL_ERROR, scheduling reconnect...`);
        scheduleReconnect();
    }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
    if (isReconnecting || reconnectTimeout) return;

    console.log('[Realtime] Scheduling reconnect in 3 seconds...');
    reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        reconnectRealtime();
    }, 3000);
}

/**
 * Reconnect all realtime subscriptions
 */
async function reconnectRealtime() {
    if (isReconnecting) return;
    isReconnecting = true;

    console.log('[Realtime] Reconnecting...');

    try {
        // Alle bestehenden Subscriptions abmelden
        for (const sub of realtimeSubscriptions) {
            try {
                await supabase.removeChannel(sub);
            } catch (e) {
                console.warn('[Realtime] Error removing channel:', e);
            }
        }
        realtimeSubscriptions = [];

        // Kurz warten vor Wiederverbindung
        await new Promise(resolve => setTimeout(resolve, 500));

        // Subscriptions neu einrichten
        setupRealtimeSubscriptions();
        console.log('[Realtime] Reconnection complete');
    } catch (e) {
        console.error('[Realtime] Reconnection failed:', e);
    } finally {
        isReconnecting = false;
    }
}

/**
 * Setup visibility change handler for reconnection
 */
function setupVisibilityChangeHandler() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && currentUser) {
            console.log('[Realtime] App became visible, checking connections...');
            // Prüfen ob Subscriptions im Fehlerzustand sind
            const hasError = realtimeSubscriptions.some(sub =>
                sub.state === 'errored' || sub.state === 'closed'
            );
            if (hasError || realtimeSubscriptions.length === 0) {
                console.log('[Realtime] Detected disconnected state, reconnecting...');
                reconnectRealtime();
            }
        }
    });

    // Auch Online/Offline-Events behandeln
    window.addEventListener('online', () => {
        console.log('[Realtime] Network came online, reconnecting...');
        setTimeout(() => reconnectRealtime(), 1000);
    });
}

// Sichtbarkeits-Handler einmal initialisieren
let visibilityHandlerInitialized = false;

function setupRealtimeSubscriptions() {
    console.log('[Realtime] Setting up realtime subscriptions...');

    // Sichtbarkeits-Änderungs-Handler einrichten (nur einmal)
    if (!visibilityHandlerInitialized) {
        setupVisibilityChangeHandler();
        visibilityHandlerInitialized = true;
    }

    // Auf benutzerdefinierte matchRequestUpdated-Events hören (von Benachrichtigungen, etc.)
    window.addEventListener('matchRequestUpdated', (event) => {
        console.log('[Realtime] matchRequestUpdated event received:', event.detail);
        loadMatchRequests();
        loadPendingRequests();
    });

    // Profiländerungen für aktuellen Benutzer abonnieren
    const profileSub = supabase
        .channel('profile_changes')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${currentUser.id}`
        }, payload => {
            console.log('[Realtime] Profile updated:', payload.new);
            currentUserData = { ...currentUserData, ...payload.new };
            updateStatsDisplay();
            updateRankDisplay();
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Profile', status);
        });

    realtimeSubscriptions.push(profileSub);

    // Match-Anfragen abonnieren (als player_a - gesendete Anfragen)
    const matchRequestSubA = supabase
        .channel('match_request_player_a')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'match_requests',
            filter: `player_a_id=eq.${currentUser.id}`
        }, (payload) => {
            console.log('[Realtime] Match request update (player_a):', payload.eventType);
            loadMatchRequests();
            loadPendingRequests();
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Match request (player_a)', status);
        });

    realtimeSubscriptions.push(matchRequestSubA);

    // Match-Anfragen abonnieren (als player_b - empfangene Anfragen)
    const matchRequestSubB = supabase
        .channel('match_request_player_b')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'match_requests',
            filter: `player_b_id=eq.${currentUser.id}`
        }, async (payload) => {
            console.log('[Realtime] Match request update (player_b):', payload.eventType);
            loadMatchRequests();
            loadPendingRequests();
            // Benachrichtigung für neue eingehende Anfragen anzeigen
            if (payload.eventType === 'INSERT') {
                showNewRequestNotification();

                // Bottom-Sheet für pending_player Bestätigungen in Echtzeit anzeigen
                if (payload.new && payload.new.status === 'pending_player') {
                    console.log('[Realtime] New pending_player confirmation - showing bottom sheet');
                    // Alle ausstehenden Bestätigungen laden (Einzel + Doppel) und Bottom-Sheet anzeigen
                    const pendingConfirmations = await loadAllPendingConfirmations(currentUser.id);
                    if (pendingConfirmations && pendingConfirmations.length > 0) {
                        showMatchConfirmationBottomSheet(pendingConfirmations);
                    }
                }
            }
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Match request (player_b)', status);
        });

    realtimeSubscriptions.push(matchRequestSubB);

    // ALLE match_requests DELETE-Events abonnieren (ohne Filter)
    // Zeilenfilter funktionieren nicht für DELETE-Events in Supabase
    // so we listen to all deletes and refresh the lists
    const matchRequestDeleteSub = supabase
        .channel('match_request_deletes')
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'match_requests'
        }, (payload) => {
            console.log('[Realtime] Match request deleted:', payload.old);
            // Listen aktualisieren - die gelöschte Anfrage könnte aktuellen Benutzer betroffen haben
            loadMatchRequests();
            loadPendingRequests();
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Match request DELETE', status);
        });

    realtimeSubscriptions.push(matchRequestDeleteSub);

    // Doppel-Match-Anfragen abonnieren - alle Events für jede Anfrage
    // Da wir sowieso clientseitig filtern, alle Änderungen abonnieren
    const doublesRequestSub = supabase
        .channel('doubles_match_requests_updates')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'doubles_match_requests'
        }, async (payload) => {
            console.log('[Realtime] Doubles match request update:', payload.eventType, payload);
            // Match-Anfragen für alle Doppel-Anfrage-Änderungen neu laden
            loadMatchRequests();
            loadPendingRequests();
            // Benachrichtigung für neue eingehende Anfragen anzeigen
            if (payload.eventType === 'INSERT') {
                // Prüfen ob aktueller Benutzer in team_b ist (Gegner)
                const teamB = payload.new?.team_b || {};
                if (teamB.player1_id === currentUser.id || teamB.player2_id === currentUser.id) {
                    showNewRequestNotification();

                    // Bottom-Sheet für pending_opponent Bestätigungen in Echtzeit anzeigen
                    if (payload.new && payload.new.status === 'pending_opponent') {
                        console.log('[Realtime] New pending_opponent doubles confirmation - showing bottom sheet');
                        // Alle ausstehenden Bestätigungen laden (Einzel + Doppel) und Bottom-Sheet anzeigen
                        const pendingConfirmations = await loadAllPendingConfirmations(currentUser.id);
                        if (pendingConfirmations && pendingConfirmations.length > 0) {
                            showMatchConfirmationBottomSheet(pendingConfirmations);
                        }
                    }
                }
            }
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Doubles match requests', status);
        });

    realtimeSubscriptions.push(doublesRequestSub);

    // ALLE doubles_match_requests DELETE-Events abonnieren (ohne Filter)
    // Zeilenfilter funktionieren nicht für DELETE-Events in Supabase
    const doublesRequestDeleteSub = supabase
        .channel('doubles_match_request_deletes')
        .on('postgres_changes', {
            event: 'DELETE',
            schema: 'public',
            table: 'doubles_match_requests'
        }, (payload) => {
            console.log('[Realtime] Doubles match request deleted:', payload.old);
            // Listen aktualisieren - die gelöschte Anfrage könnte aktuellen Benutzer betroffen haben
            loadMatchRequests();
            loadPendingRequests();
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Doubles match request DELETE', status);
        });

    realtimeSubscriptions.push(doublesRequestDeleteSub);

    // Matches-Tabelle für Verlauf-Updates abonnieren (Einzel)
    const matchesSub = supabase
        .channel('matches_updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'matches'
        }, (payload) => {
            // Prüfen ob aktueller Benutzer an diesem Match beteiligt ist
            if (payload.new.player_a_id === currentUser.id ||
                payload.new.player_b_id === currentUser.id ||
                payload.new.winner_id === currentUser.id ||
                payload.new.loser_id === currentUser.id) {
                console.log('[Realtime] New singles match created, updating history');
                loadMatchHistory();
                loadPointsHistory();
                // Auch Match-Anfragen aktualisieren da Anfrage gelöscht sein könnte
                loadMatchRequests();
                loadPendingRequests();
                // Match-Vorschläge aktualisieren (letzte Spieldaten geändert)
                const suggestionsContent = document.getElementById('match-suggestions-content');
                if (suggestionsContent && !suggestionsContent.classList.contains('hidden')) {
                    loadMatchSuggestions();
                }
            }
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Matches', status);
        });

    realtimeSubscriptions.push(matchesSub);

    // Doppel-Matches für Verlauf-Updates abonnieren
    const doublesMatchesSub = supabase
        .channel('doubles_matches_updates')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'doubles_matches'
        }, (payload) => {
            // Prüfen ob aktueller Benutzer an diesem Doppel-Match beteiligt ist
            if (payload.new.team_a_player1_id === currentUser.id ||
                payload.new.team_a_player2_id === currentUser.id ||
                payload.new.team_b_player1_id === currentUser.id ||
                payload.new.team_b_player2_id === currentUser.id) {
                console.log('[Realtime] New doubles match created, updating history');
                loadMatchHistory();
                loadPointsHistory();
                // Auch Match-Anfragen aktualisieren da Anfrage gelöscht sein könnte
                loadMatchRequests();
                loadPendingRequests();
            }
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Doubles matches', status);
        });

    realtimeSubscriptions.push(doublesMatchesSub);

    // ALLE Profil-Elo-Änderungen für Ranglisten-Updates abonnieren
    const leaderboardSub = supabase
        .channel('leaderboard_updates')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles'
        }, (payload) => {
            // Nur neu laden wenn Elo geändert (um unnötige Reloads zu vermeiden)
            if (payload.old?.elo_rating !== payload.new?.elo_rating) {
                console.log('[Realtime] Elo rating changed, updating leaderboard');
                loadLeaderboards();
                // Auch eigene Ranganzeige aktualisieren falls sie sich geändert haben könnte
                updateRankDisplay();
            }
        })
        .subscribe((status) => {
            handleSubscriptionStatus('Leaderboard', status);
        });

    realtimeSubscriptions.push(leaderboardSub);

    console.log('[Realtime] All subscriptions set up');

    // Auf App-Resume-Events hören (Android/iOS native Apps)
    // WebSocket connections may be suspended when app is backgrounded
    window.addEventListener('app-resumed', () => {
        console.log('[Realtime] App resumed - refreshing match data');
        // Alle Match-bezogenen Daten aktualisieren wenn App in Vordergrund kommt
        loadMatchRequests();
        loadPendingRequests();
        loadMatchHistory();
    });

    // Auch auf Seitensichtbarkeits-Änderung hören (funktioniert auf Web und Native)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            console.log('[Realtime] Page became visible - refreshing match data');
            // Alle Match-bezogenen Daten aktualisieren wenn Seite sichtbar wird
            loadMatchRequests();
            loadPendingRequests();
            loadMatchHistory();
        }
    });
}

// --- Show notification for new incoming match request ---
function showNewRequestNotification() {
    // Visuelle Benachrichtigung
    const requestsSection = document.querySelector('[data-section="match-requests"]');
    if (requestsSection) {
        requestsSection.classList.add('animate-pulse');
        setTimeout(() => requestsSection.classList.remove('animate-pulse'), 2000);
    }

    // Browser-Benachrichtigung nur wenn bereits erlaubt
    // Hinweis: requestPermission() kann nur durch Benutzerinteraktion aufgerufen werden
    if (Notification.permission === 'granted') {
        try {
            new Notification('Neue Spielanfrage!', {
                body: 'Du hast eine neue Wettkampfanfrage erhalten.',
                icon: '/img/logo.png'
            });
        } catch (e) {
            console.warn('Could not show notification:', e);
        }
    }

    // Toast-Benachrichtigung
    showToast('Neue Spielanfrage erhalten!', 'info');
}

// --- Toast notification helper ---
function showToast(message, type = 'info') {
    const colors = {
        info: 'bg-indigo-600',
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600'
    };

    const toast = document.createElement('div');
    toast.className = `fixed bottom-20 right-4 ${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-fade-in`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('opacity-0', 'transition-opacity');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Helper Functions ---
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showError(message) {
    const pageLoader = document.getElementById('page-loader');
    if (pageLoader) {
        pageLoader.innerHTML = `
            <div class="text-center">
                <p class="text-red-500 text-xl mb-4">❌</p>
                <p class="text-red-600">${message}</p>
                <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-indigo-600 text-white rounded">
                    Neu laden
                </button>
            </div>
        `;
    }
}

// --- Helper: Render Table for Display ---
function renderTableForDisplay(tableData) {
    if (!tableData || !tableData.headers || !tableData.rows) {
        return '';
    }

    let html = '<table class="exercise-display-table border-collapse w-full my-3">';

    // Headers
    html += '<thead><tr>';
    tableData.headers.forEach(header => {
        html += `<th class="border border-gray-400 bg-gray-100 px-3 py-2 font-semibold text-left">${escapeHtml(header)}</th>`;
    });
    html += '</tr></thead>';

    // Rows
    html += '<tbody>';
    tableData.rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td class="border border-gray-300 px-3 py-2">${escapeHtml(cell)}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';

    return html;
}

// --- Setup Modal Handlers ---
function setupModalHandlers() {
    // Übungs-Modal schließen
    const closeExerciseModal = document.getElementById('close-exercise-modal');
    if (closeExerciseModal) {
        closeExerciseModal.addEventListener('click', () => {
            document.getElementById('exercise-modal')?.classList.add('hidden');
        });
    }

    // Challenge-Modal schließen
    const closeChallengeModal = document.getElementById('close-challenge-modal');
    if (closeChallengeModal) {
        closeChallengeModal.addEventListener('click', () => {
            document.getElementById('challenge-modal')?.classList.add('hidden');
        });
    }

    // Modals bei Hintergrund-Klick schließen
    document.getElementById('exercise-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'exercise-modal') {
            e.target.classList.add('hidden');
        }
    });

    document.getElementById('challenge-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'challenge-modal') {
            e.target.classList.add('hidden');
        }
    });

    // Abkürzungen-Toggle
    const toggleAbbreviations = document.getElementById('toggle-abbreviations');
    const abbreviationsContent = document.getElementById('abbreviations-content');
    const abbreviationsIcon = document.getElementById('abbreviations-icon');

    if (toggleAbbreviations && abbreviationsContent) {
        toggleAbbreviations.addEventListener('click', () => {
            abbreviationsContent.classList.toggle('hidden');
            if (abbreviationsIcon) {
                abbreviationsIcon.style.transform = abbreviationsContent.classList.contains('hidden')
                    ? 'rotate(0deg)'
                    : 'rotate(180deg)';
            }
        });
    }
}

// --- Global Functions for onclick handlers ---
window.openExerciseModal = async (exerciseId) => {
    const modal = document.getElementById('exercise-modal');
    if (!modal) return;

    try {
        // Übungsdaten abrufen
        const { data: exercise, error } = await supabase
            .from('exercises')
            .select('*')
            .eq('id', exerciseId)
            .single();

        if (error || !exercise) {
            console.error('Error loading exercise:', error);
            alert('Übung konnte nicht geladen werden');
            return;
        }

        // Titel setzen
        const titleEl = document.getElementById('modal-exercise-title');
        if (titleEl) titleEl.textContent = exercise.name || exercise.title || '';

        // Bild verarbeiten
        const imageEl = document.getElementById('modal-exercise-image');
        if (imageEl) {
            if (exercise.image_url) {
                imageEl.src = exercise.image_url;
                imageEl.alt = exercise.name || exercise.title || '';
                imageEl.style.display = 'block';
                imageEl.onerror = () => { imageEl.style.display = 'none'; };
            } else {
                imageEl.style.display = 'none';
            }
        }

        // Beschreibungsinhalt verarbeiten (kann Text oder Tabelle sein)
        const descriptionEl = document.getElementById('modal-exercise-description');
        if (descriptionEl) {
            let descriptionContent = exercise.description_content || exercise.descriptionContent || exercise.description;

            // Versuchen als JSON zu parsen (für Tabelle oder strukturierten Inhalt)
            let descriptionData = null;
            try {
                if (typeof descriptionContent === 'string') {
                    descriptionData = JSON.parse(descriptionContent);
                } else {
                    descriptionData = descriptionContent;
                }
            } catch (e) {
                // Kein JSON, als Klartext behandeln
                descriptionData = { type: 'text', text: descriptionContent || '' };
            }

            if (descriptionData && descriptionData.type === 'table') {
                const tableHtml = renderTableForDisplay(descriptionData.tableData);
                const additionalText = descriptionData.additionalText || '';
                descriptionEl.innerHTML =
                    tableHtml +
                    (additionalText
                        ? `<p class="mt-3 whitespace-pre-wrap">${escapeHtml(additionalText)}</p>`
                        : '');
            } else {
                descriptionEl.textContent = descriptionData?.text || exercise.description || '';
                descriptionEl.style.whiteSpace = 'pre-wrap';
            }
        }

        // Tags verarbeiten
        const tagsContainer = document.getElementById('modal-exercise-tags');
        if (tagsContainer) {
            const tags = exercise.tags || [];
            if (tags.length > 0) {
                tagsContainer.innerHTML = tags
                    .map(tag =>
                        `<span class="inline-block bg-indigo-100 text-indigo-800 rounded-full px-3 py-1 text-sm font-semibold mr-2 mb-2">${escapeHtml(tag)}</span>`
                    )
                    .join('');
            } else {
                tagsContainer.innerHTML = '';
            }
        }

        // Punkte und Meilensteine verarbeiten
        const pointsEl = document.getElementById('modal-exercise-points');
        const milestonesContainer = document.getElementById('modal-exercise-milestones');

        // tieredPoints parsen falls es ein String ist
        let tieredPointsData = exercise.tiered_points || exercise.tieredPoints;
        if (typeof tieredPointsData === 'string') {
            try {
                tieredPointsData = JSON.parse(tieredPointsData);
            } catch (e) {
                tieredPointsData = null;
            }
        }

        const hasTieredPoints = tieredPointsData?.enabled && tieredPointsData?.milestones?.length > 0;
        const points = exercise.xp_reward || exercise.points || 0;

        // Spielerfortschritt laden falls Meilensteine existieren
        let playerProgress = null;
        if (hasTieredPoints && currentUser) {
            const { data: progressData } = await supabase
                .from('exercise_milestones')
                .select('*')
                .eq('user_id', currentUser.id)
                .eq('exercise_id', exerciseId)
                .maybeSingle();
            playerProgress = progressData;
        }

        const currentCount = playerProgress?.current_count || 0;

        if (hasTieredPoints) {
            if (pointsEl) pointsEl.textContent = `Bis zu ${points} P.`;

            if (milestonesContainer) {
                // Spielerfortschritt-Bereich
                let progressHtml = '';
                const nextMilestone = tieredPointsData.milestones.find(m => m.count > currentCount);
                const remaining = nextMilestone ? nextMilestone.count - currentCount : 0;

                progressHtml = `
                    <div class="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="font-bold text-gray-800">Deine beste Leistung</span>
                        </div>
                        <p class="text-base text-gray-700 mb-2">
                            Persönlicher Rekord: <span class="font-bold text-blue-600">${currentCount} ${exercise.unit || 'Wiederholungen'}</span>
                        </p>
                        ${nextMilestone
                            ? `<p class="text-sm text-gray-600">
                                Noch <span class="font-semibold text-orange-600">${remaining} ${exercise.unit || 'Wiederholungen'}</span> bis zum nächsten Meilenstein
                            </p>`
                            : `<p class="text-sm text-green-600 font-semibold">
                                Alle Meilensteine erreicht!
                            </p>`
                        }
                    </div>
                `;

                // Meilensteine-Liste
                const sortedMilestones = tieredPointsData.milestones.sort((a, b) => a.count - b.count);

                // Kumulative Summe berechnen
                let cumulativePoints = 0;
                const milestonesHtml = sortedMilestones
                    .map((milestone, index) => {
                        cumulativePoints += milestone.points;
                        const isFirst = index === 0;
                        const displayPoints = isFirst
                            ? milestone.points
                            : `+${milestone.points}`;

                        let bgColor, borderColor, iconColor, textColor;
                        if (currentCount >= milestone.count) {
                            bgColor = 'bg-gradient-to-r from-green-50 to-emerald-50';
                            borderColor = 'border-green-300';
                            iconColor = 'text-green-600';
                            textColor = 'text-green-700';
                        } else if (index === 0 || currentCount >= sortedMilestones[index - 1].count) {
                            bgColor = 'bg-gradient-to-r from-orange-50 to-amber-50';
                            borderColor = 'border-orange-300';
                            iconColor = 'text-orange-600';
                            textColor = 'text-orange-700';
                        } else {
                            bgColor = 'bg-gradient-to-r from-gray-50 to-slate-50';
                            borderColor = 'border-gray-300';
                            iconColor = 'text-gray-500';
                            textColor = 'text-gray-600';
                        }

                        return `<div class="flex justify-between items-center py-3 px-4 ${bgColor} rounded-lg mb-2 border ${borderColor}">
                            <div class="flex items-center gap-3">
                                <span class="text-base font-semibold ${textColor}">${milestone.count} ${exercise.unit || 'Wiederholungen'}</span>
                            </div>
                            <div class="text-right">
                                <div class="text-xl font-bold ${iconColor}">${displayPoints} P.</div>
                                <div class="text-xs text-gray-500 font-medium">Gesamt: ${cumulativePoints} P.</div>
                            </div>
                        </div>`;
                    })
                    .join('');

                milestonesContainer.innerHTML = `
                    <div class="mt-4 mb-3 border-t-2 border-indigo-200 pt-4">
                        <h4 class="text-lg font-bold text-gray-800 mb-3">Meilensteine</h4>
                        ${progressHtml}
                        ${milestonesHtml}
                    </div>`;
                milestonesContainer.classList.remove('hidden');
            }
        } else {
            if (pointsEl) pointsEl.textContent = `+${points} XP`;
            if (milestonesContainer) {
                milestonesContainer.innerHTML = '';
                milestonesContainer.classList.add('hidden');
            }
        }

        // Modal anzeigen
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('Error opening exercise modal:', error);
        alert('Fehler beim Laden der Übung');
    }
};

window.openChallengeModal = async (challengeId) => {
    const modal = document.getElementById('challenge-modal');
    if (!modal) return;

    try {
        // Challenge-Daten abrufen
        const { data: challenge, error } = await supabase
            .from('challenges')
            .select('*')
            .eq('id', challengeId)
            .single();

        if (error || !challenge) {
            console.error('Error loading challenge:', error);
            alert('Challenge konnte nicht geladen werden');
            return;
        }

        // Titel setzen
        const titleEl = document.getElementById('modal-challenge-title');
        if (titleEl) titleEl.textContent = challenge.name || '';

        // Beschreibung setzen
        const descriptionEl = document.getElementById('modal-challenge-description');
        if (descriptionEl) descriptionEl.textContent = challenge.description || '';

        // Punkte setzen
        const pointsEl = document.getElementById('modal-challenge-points');
        if (pointsEl) pointsEl.textContent = `+${challenge.xp_reward || 0} XP`;

        // Modal anzeigen
        modal.classList.remove('hidden');

    } catch (error) {
        console.error('Error opening challenge modal:', error);
        alert('Fehler beim Laden der Challenge');
    }
};

// Laufende Anfragen verfolgen um Doppelklicks zu verhindern
const processingRequests = new Set();

// Hilfsfunktion um Anfrage-Karte optimistisch aus UI zu entfernen
// Karten können an mehreren Stellen erscheinen (Übersicht und Matches-Tab), daher alle möglichen IDs prüfen
function removeRequestCardOptimistically(requestId, type = 'singles') {
    // Mögliche Karten-IDs für Einzel: match-request-X (Übersicht) und pending-match-request-X (Matches-Tab)
    // Mögliche Karten-IDs für Doppel: doubles-request-X (Übersicht) und pending-doubles-request-X (Matches-Tab)
    const cardIds = type === 'doubles'
        ? [`doubles-request-${requestId}`, `pending-doubles-request-${requestId}`]
        : [`match-request-${requestId}`, `pending-match-request-${requestId}`];

    cardIds.forEach(cardId => {
        const card = document.getElementById(cardId);
        if (card) {
            // Fade-Out-Animation hinzufügen
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
            // Alle Buttons in der Karte deaktivieren
            card.querySelectorAll('button').forEach(btn => {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            });
            // Nach Animation entfernen
            setTimeout(() => {
                card.style.height = card.offsetHeight + 'px';
                card.style.overflow = 'hidden';
                setTimeout(() => {
                    card.style.height = '0';
                    card.style.padding = '0';
                    card.style.margin = '0';
                    card.style.border = 'none';
                    setTimeout(() => card.remove(), 300);
                }, 50);
            }, 200);
        }
    });
}

window.respondToMatchRequest = async (requestId, accept) => {
    // DOUBLE-CLICK PROTECTION
    if (processingRequests.has(requestId)) {
        console.warn('[Match] Request already being processed:', requestId);
        return;
    }
    processingRequests.add(requestId);

    // Optimistisches UI-Update - Karte sofort ausblenden
    removeRequestCardOptimistically(requestId, 'singles');

    try {
        if (!accept) {
            // Abgelehnt - einfaches Update
            // Zuerst Spieler A Info für Benachrichtigung abrufen
            const { data: request } = await supabase
                .from('match_requests')
                .select('player_a_id, status')
                .eq('id', requestId)
                .single();

            // Prüfen ob bereits verarbeitet
            if (request?.status === 'approved' || request?.status === 'rejected') {
                console.warn('[Match] Request already processed:', request.status);
                processingRequests.delete(requestId);
                loadMatchRequests();
                return;
            }

            const { error } = await supabase
                .from('match_requests')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            if (error) throw error;

            // Spieler A benachrichtigen dass Spieler B das Match abgelehnt hat
            if (request?.player_a_id) {
                const playerBName = `${currentUserData.first_name || ''} ${currentUserData.last_name || ''}`.trim() || 'Der Gegner';
                await createNotification(
                    request.player_a_id,
                    'match_rejected',
                    'Spielanfrage abgelehnt',
                    `${playerBName} hat deine Spielanfrage abgelehnt.`
                );
            }

            // Verzögertes Neuladen damit optimistisches UI-Update abgeschlossen ist
            setTimeout(() => {
                loadMatchRequests();
                loadPendingRequests();
            }, 800);
            processingRequests.delete(requestId);
            return;
        }

        // Angenommen - Match-Anfrage-Details abrufen
        const { data: request, error: fetchError } = await supabase
            .from('match_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError) throw fetchError;

        // Prüfen ob bereits genehmigt (doppelte Verarbeitung verhindern)
        if (request.status === 'approved') {
            console.warn('[Match] Request already approved, skipping');
            processingRequests.delete(requestId);
            loadMatchRequests();
            alert('Match wurde bereits bestätigt!');
            return;
        }

        // Automatisch genehmigen wenn Spieler B bestätigt (keine Trainer-Genehmigung nötig)
        let newStatus = 'approved';
        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }
        approvals.player_b = true;

        console.log('[Match] Auto-approved: Player B confirmed');

        // Anfrage aktualisieren
        const { error: updateError } = await supabase
            .from('match_requests')
            .update({
                status: newStatus,
                approvals: approvals
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Das eigentliche Match erstellen (jetzt immer auto-genehmigt)
        await createMatchFromRequest(request);

        // loadMatchRequests() nicht sofort aufrufen - optimistisches UI-Update bereits
        // removed the card, and calling loadMatchRequests() too soon can cause a race
        // condition where the card reappears briefly before the animation completes.
        // Die Echtzeit-Subscription behandelt weitere Updates.
        // Verzögertes Neuladen als Sicherheitsnetz für verpasste Echtzeit-Events
        setTimeout(() => {
            loadMatchRequests();
            loadPendingRequests();
        }, 800);

        // Feedback anzeigen
        alert('Match bestätigt!');

    } catch (error) {
        console.error('Error responding to match request:', error);
        alert('Fehler beim Verarbeiten der Anfrage');
    } finally {
        processingRequests.delete(requestId);
    }
};

// --- Doubles Match Request Handlers ---
window.respondToDoublesMatchRequest = async (requestId, accept) => {
    // DOUBLE-CLICK PROTECTION (reuse the same set as singles)
    if (processingRequests.has(`doubles-${requestId}`)) {
        console.warn('[Doubles] Request already being processed:', requestId);
        return;
    }
    processingRequests.add(`doubles-${requestId}`);

    // Optimistisches UI-Update - Karte sofort ausblenden
    removeRequestCardOptimistically(requestId, 'doubles');

    try {
        // Zuerst prüfen ob Anfrage noch existiert und nicht bereits verarbeitet
        const { data: request, error: fetchError } = await supabase
            .from('doubles_match_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (fetchError) {
            console.warn('[Doubles] Request not found or already deleted:', fetchError);
            processingRequests.delete(`doubles-${requestId}`);
            // Verzögertes Neuladen damit optimistisches UI-Update abgeschlossen ist
            setTimeout(() => {
                loadMatchRequests();
                loadPendingRequests();
            }, 800);
            return;
        }

        // Prüfen ob bereits verarbeitet
        if (request.status === 'approved' || request.status === 'rejected') {
            console.warn('[Doubles] Request already processed:', request.status);
            processingRequests.delete(`doubles-${requestId}`);
            // Verzögertes Neuladen damit optimistisches UI-Update abgeschlossen ist
            setTimeout(() => {
                loadMatchRequests();
                loadPendingRequests();
            }, 800);
            if (request.status === 'approved') {
                alert('Dieses Doppel-Match wurde bereits bestätigt!');
            }
            return;
        }

        if (!accept) {
            // Rejected
            const { error } = await supabase
                .from('doubles_match_requests')
                .update({ status: 'rejected', updated_at: new Date().toISOString() })
                .eq('id', requestId);

            if (error) throw error;
            // Verzögertes Neuladen damit optimistisches UI-Update abgeschlossen ist
            setTimeout(() => {
                loadMatchRequests();
                loadPendingRequests();
            }, 800);
            processingRequests.delete(`doubles-${requestId}`);
            return;
        }

        // Angenommen - Genehmigungen aktualisieren und genehmigen
        // Genehmigungen parsen
        let approvals = request.approvals || {};
        if (typeof approvals === 'string') {
            approvals = JSON.parse(approvals);
        }

        // Genehmigung des aktuellen Benutzers markieren
        approvals[currentUser.id] = true;

        // Bei Doppel automatisch genehmigen wenn ein Gegner bestätigt
        const newStatus = 'approved';

        const { error: updateError } = await supabase
            .from('doubles_match_requests')
            .update({
                status: newStatus,
                approvals: approvals,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (updateError) throw updateError;

        // Verzögertes Neuladen damit optimistisches UI-Update abgeschlossen ist
        setTimeout(() => {
            loadMatchRequests();
            loadPendingRequests();
        }, 800);
        alert('Doppel-Match bestätigt!');

    } catch (error) {
        console.error('Error responding to doubles match request:', error);
        alert('Fehler beim Verarbeiten der Doppel-Anfrage');
    } finally {
        processingRequests.delete(`doubles-${requestId}`);
    }
};

window.deleteDoublesMatchRequest = async (requestId) => {
    if (!confirm('Möchtest du diese Doppel-Anfrage wirklich zurückziehen?')) return;

    try {
        // Zuerst Anfrage abrufen um Team B Spieler für Benachrichtigungslöschung zu finden
        const { data: request } = await supabase
            .from('doubles_match_requests')
            .select('team_b')
            .eq('id', requestId)
            .single();

        const { error } = await supabase
            .from('doubles_match_requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;

        // Benachrichtigungen für Team B Spieler löschen
        if (request?.team_b) {
            const teamB = request.team_b;
            const teamBPlayerIds = [teamB.player1_id, teamB.player2_id].filter(Boolean);

            for (const playerId of teamBPlayerIds) {
                // Benachrichtigungen mit dieser request_id finden und löschen
                const { data: notifications } = await supabase
                    .from('notifications')
                    .select('id, data')
                    .eq('user_id', playerId)
                    .eq('type', 'doubles_match_request');

                for (const notif of (notifications || [])) {
                    if (notif.data?.request_id === requestId) {
                        await supabase.from('notifications').delete().eq('id', notif.id);
                    }
                }
            }
        }

        // Listen sofort für Team A aktualisieren
        loadMatchRequests();
        loadPendingRequests();
    } catch (error) {
        console.error('Error deleting doubles match request:', error);
        alert('Fehler beim Löschen der Doppel-Anfrage');
    }
};

// loadMatchRequests und loadPendingRequests für modulübergreifenden Zugriff freigeben
window.loadMatchRequests = loadMatchRequests;
window.loadPendingRequests = loadPendingRequests;

/**
 * Create actual match from approved request
 * Includes duplicate protection to prevent double-creation
 */
async function createMatchFromRequest(request) {
    try {
        // DUPLICATE PROTECTION: Check if a match with same players was created in last 60 seconds
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const { data: existingMatches, error: checkError } = await supabase
            .from('matches')
            .select('id, created_at')
            .or(`and(player_a_id.eq.${request.player_a_id},player_b_id.eq.${request.player_b_id}),and(player_a_id.eq.${request.player_b_id},player_b_id.eq.${request.player_a_id})`)
            .gte('created_at', oneMinuteAgo);

        if (checkError) {
            console.warn('[Match] Error checking for duplicates:', checkError);
        } else if (existingMatches && existingMatches.length > 0) {
            console.warn('[Match] DUPLICATE PREVENTED: Match already exists from last 60 seconds', existingMatches);
            return; // Kein Duplikat erstellen
        }

        // club_id aus Anfrage abrufen, oder aus Profil des Benutzers falls verfügbar
        let clubId = request.club_id || null;
        if (!clubId) {
            // Versuchen aus Spielerprofilen zu holen (optional - Spieler haben evtl. keinen Verein)
            const { data: playerA } = await supabase
                .from('profiles')
                .select('club_id')
                .eq('id', request.player_a_id)
                .single();
            clubId = playerA?.club_id || null;
        }

        // Match-Daten erstellen - club_id ist optional
        const matchData = {
            player_a_id: request.player_a_id,
            player_b_id: request.player_b_id,
            sport_id: request.sport_id,
            winner_id: request.winner_id,
            loser_id: request.loser_id,
            sets: request.sets,
            handicap_used: request.handicap_used || false,
            handicap: request.handicap || null,
            match_mode: request.match_mode || 'best-of-5',
            played_at: request.created_at || new Date().toISOString()
        };

        // club_id nur hinzufügen wenn vorhanden
        if (clubId) {
            matchData.club_id = clubId;
        }

        const { error } = await supabase
            .from('matches')
            .insert(matchData);

        if (error) throw error;
        console.log('[Match] Created match from request:', request.id);

    } catch (error) {
        console.error('Error creating match from request:', error);
        throw error;
    }
}

// --- Load Pending Requests (Singles + Doubles) ---
async function loadPendingRequests() {
    const container = document.getElementById('pending-result-requests-list');
    if (!container) return;

    try {
        // Einzel-Anfragen laden
        const { data: singlesRequests, error: singlesError } = await supabase
            .from('match_requests')
            .select('*')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .in('status', ['pending_player', 'pending_coach'])
            .order('created_at', { ascending: false });

        if (singlesError) throw singlesError;

        // Doppel-Anfragen laden
        const { data: allDoublesRequests, error: doublesError } = await supabase
            .from('doubles_match_requests')
            .select('*')
            .in('status', ['pending_opponent', 'pending_coach'])
            .order('created_at', { ascending: false });

        if (doublesError) throw doublesError;

        // Doppel filtern wo aktueller Benutzer beteiligt ist
        const doublesRequests = (allDoublesRequests || []).filter(r => {
            const teamA = r.team_a || {};
            const teamB = r.team_b || {};
            return teamA.player1_id === currentUser.id ||
                   teamA.player2_id === currentUser.id ||
                   teamB.player1_id === currentUser.id ||
                   teamB.player2_id === currentUser.id;
        });

        // Typen markieren und kombinieren
        const singles = (singlesRequests || []).map(r => ({ ...r, _type: 'singles' }));
        const doubles = doublesRequests.map(r => ({ ...r, _type: 'doubles' }));
        const allRequests = [...singles, ...doubles].sort((a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        );

        if (allRequests.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Keine ausstehenden Anfragen</p>';
            return;
        }

        // Alle Benutzer-IDs für Profile abrufen
        const userIds = [...new Set(allRequests.flatMap(r => {
            if (r._type === 'singles') {
                return [r.player_a_id, r.player_b_id];
            } else {
                const teamA = r.team_a || {};
                const teamB = r.team_b || {};
                return [teamA.player1_id, teamA.player2_id, teamB.player1_id, teamB.player2_id].filter(Boolean);
            }
        }))];

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, display_name, avatar_url, club_id')
            .in('id', userIds);
        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        // Vereinsnamen abrufen
        const clubIds = [...new Set((profiles || []).map(p => p.club_id).filter(Boolean))];
        const { data: clubs } = clubIds.length > 0
            ? await supabase.from('clubs').select('id, name').in('id', clubIds)
            : { data: [] };
        const clubMap = {};
        (clubs || []).forEach(c => { clubMap[c.id] = c.name; });

        container.innerHTML = allRequests.map(req => {
            if (req._type === 'singles') {
                return renderPendingSinglesCard(req, profileMap, clubMap);
            } else {
                return renderPendingDoublesCard(req, profileMap);
            }
        }).join('');

    } catch (error) {
        console.error('Error loading pending requests:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-4 text-sm">Fehler beim Laden</p>';
    }
}

/**
 * Check for pending match confirmations and show bottom sheet
 */
async function checkPendingMatchConfirmations(userId) {
    try {
        const pendingConfirmations = await loadAllPendingConfirmations(userId);
        if (pendingConfirmations && pendingConfirmations.length > 0) {
            // Kurze Verzögerung um sicherzustellen dass Seite vollständig geladen
            setTimeout(() => {
                showMatchConfirmationBottomSheet(pendingConfirmations);
            }, 1000);
        }
    } catch (error) {
        console.error('[Dashboard] Error checking pending confirmations:', error);
    }
}

// Hilfsfunktion zum Rendern von ausstehenden Einzel-Anfrage-Karten
function renderPendingSinglesCard(req, profileMap, clubMap) {
    const isPlayerA = req.player_a_id === currentUser.id;
    const otherPlayerId = isPlayerA ? req.player_b_id : req.player_a_id;
    const otherPlayer = profileMap[otherPlayerId];
    const otherPlayerName = otherPlayer?.display_name ||
        `${otherPlayer?.first_name || ''} ${otherPlayer?.last_name || ''}`.trim() || 'Unbekannt';

    // Vereins-Info
    const otherPlayerClubId = otherPlayer?.club_id;
    const myClubId = currentUserData?.club_id;
    const isDifferentClub = otherPlayerClubId && myClubId && otherPlayerClubId !== myClubId;
    const otherClubName = isDifferentClub ? clubMap[otherPlayerClubId] : null;

    // Match-Ergebnis
    const setsDisplay = formatSetsDisplay(req.sets);
    const playerAProfile = profileMap[req.player_a_id];
    const playerBProfile = profileMap[req.player_b_id];
    const playerAName = playerAProfile?.display_name ||
        `${playerAProfile?.first_name || ''} ${playerAProfile?.last_name || ''}`.trim() || 'Spieler A';
    const playerBName = playerBProfile?.display_name ||
        `${playerBProfile?.first_name || ''} ${playerBProfile?.last_name || ''}`.trim() || 'Spieler B';
    const winnerName = req.winner_id === req.player_a_id ? playerAName : playerBName;
    const handicapText = req.handicap_used ? ' (mit Handicap)' : '';

    const statusText = req.status === 'pending_player' ? 'Wartet auf Bestätigung' : 'Wartet auf Coach';
    const needsResponse = !isPlayerA && req.status === 'pending_player';

    return `
        <div id="pending-match-request-${req.id}" class="bg-white border ${needsResponse ? 'border-indigo-300' : 'border-gray-200'} rounded-lg p-4 shadow-sm mb-3 transition-all duration-300">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-3">
                    <img src="${otherPlayer?.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                    <div>
                        <p class="font-medium">${isPlayerA ? 'Anfrage an' : 'Anfrage von'} ${otherPlayerName}</p>
                        ${otherClubName ? `<p class="text-xs text-blue-600">${otherClubName}</p>` : ''}
                    </div>
                </div>
                <span class="text-xs ${req.status === 'pending_coach' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'} px-2 py-1 rounded-full">${statusText}</span>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 mb-3">
                <p class="text-sm font-medium text-gray-700 mb-1">Ergebnis: ${setsDisplay}</p>
                <p class="text-sm text-green-700">Gewinner: ${winnerName}${handicapText}</p>
            </div>
            ${needsResponse ? `
                <div class="flex gap-2">
                    <button onclick="respondToMatchRequest('${req.id}', true)" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md">
                        Akzeptieren
                    </button>
                    <button onclick="respondToMatchRequest('${req.id}', false)" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                        Ablehnen
                    </button>
                </div>
            ` : isPlayerA ? `
                <div class="flex gap-2">
                    <button onclick="deleteMatchRequest('${req.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                        Zurückziehen
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// Hilfsfunktion zum Rendern von ausstehenden Doppel-Anfrage-Karten
function renderPendingDoublesCard(req, profileMap) {
    const teamA = req.team_a || {};
    const teamB = req.team_b || {};

    // Prüfen ob aktueller Benutzer in Team A ist (Initiator-Seite)
    const isTeamA = teamA.player1_id === currentUser.id || teamA.player2_id === currentUser.id;
    const isInitiator = teamA.player1_id === currentUser.id;

    // Spielernamen abrufen
    const teamAPlayer1 = profileMap[teamA.player1_id];
    const teamAPlayer2 = profileMap[teamA.player2_id];
    const teamBPlayer1 = profileMap[teamB.player1_id];
    const teamBPlayer2 = profileMap[teamB.player2_id];

    const teamAName1 = teamAPlayer1?.first_name || 'Spieler';
    const teamAName2 = teamAPlayer2?.first_name || 'Spieler';
    const teamBName1 = teamBPlayer1?.first_name || 'Spieler';
    const teamBName2 = teamBPlayer2?.first_name || 'Spieler';

    const winnerTeamName = req.winning_team === 'A'
        ? `${teamAName1} & ${teamAName2}`
        : `${teamBName1} & ${teamBName2}`;

    const setsDisplay = (req.sets || []).map(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        return `${scoreA}:${scoreB}`;
    }).join(', ') || '-';

    const handicapText = req.handicap_used ? ' (mit Handicap)' : '';
    const statusText = req.status === 'pending_opponent' ? 'Wartet auf Gegner' : 'Wartet auf Coach';

    // Richtungstext
    let directionText;
    if (isTeamA) {
        directionText = `Doppel-Anfrage an ${teamBName1} & ${teamBName2}`;
    } else {
        directionText = `Doppel-Anfrage von ${teamAName1} & ${teamAName2}`;
    }

    const needsResponse = !isTeamA && req.status === 'pending_opponent';

    return `
        <div id="pending-doubles-request-${req.id}" class="bg-white border ${needsResponse ? 'border-purple-300' : 'border-purple-200'} rounded-lg p-4 shadow-sm mb-3 transition-all duration-300">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                        <i class="fas fa-users text-purple-600"></i>
                    </div>
                    <div>
                        <p class="font-medium">${directionText}</p>
                        <p class="text-xs text-purple-600">Doppel-Match</p>
                    </div>
                </div>
                <span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">${statusText}</span>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 mb-3">
                <p class="text-sm text-gray-700 mb-1">
                    <span class="text-indigo-600 font-medium">${teamAName1} & ${teamAName2}</span>
                    <span class="text-gray-500 mx-1">vs</span>
                    <span class="text-indigo-600 font-medium">${teamBName1} & ${teamBName2}</span>
                </p>
                <p class="text-sm font-medium text-gray-700">Ergebnis: ${setsDisplay}</p>
                <p class="text-sm text-green-700">Gewinner: ${winnerTeamName}${handicapText}</p>
            </div>
            ${needsResponse ? `
                <div class="flex gap-2">
                    <button onclick="respondToDoublesMatchRequest('${req.id}', true)" class="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm py-2 px-3 rounded-md">
                        Akzeptieren
                    </button>
                    <button onclick="respondToDoublesMatchRequest('${req.id}', false)" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                        Ablehnen
                    </button>
                </div>
            ` : isTeamA ? `
                <div class="flex gap-2">
                    <button onclick="deleteDoublesMatchRequest('${req.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-md">
                        Zurückziehen
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// --- Setup Match Suggestions ---
function setupMatchSuggestions() {
    const toggleBtn = document.getElementById('toggle-match-suggestions');
    const content = document.getElementById('match-suggestions-content');
    const chevron = document.getElementById('suggestions-chevron');

    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            content.classList.toggle('hidden');
            if (chevron) {
                chevron.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
            if (!content.classList.contains('hidden')) {
                loadMatchSuggestions();
            }
        });
    }
}

// --- Load Match Suggestions ---
// Zeigt 5 Spieler aus dem Verein:
// 1. Players never played against (priority)
// 2. Players not played against for a long time
// Includes: last match date, Elo handicap, H2H handicap
async function loadMatchSuggestions() {
    const container = document.getElementById('match-suggestions-list');
    if (!container) return;

    // Vorschläge auch ohne Verein erlauben (alle Spieler anzeigen)
    const hasClub = !!currentUserData.club_id;

    container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Lade Vorschläge...</p>';

    try {
        // Potenzielle Gegner abrufen
        let query = supabase
            .from('profiles')
            .select('id, display_name, first_name, avatar_url, elo_rating')
            .neq('id', currentUser.id)
            .in('role', ['player', 'coach', 'head_coach']);

        if (hasClub) {
            query = query.eq('club_id', currentUserData.club_id);
        }

        const { data: clubMembers, error } = await query.limit(50);

        if (error) throw error;

        if (!clubMembers || clubMembers.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Keine Spieler gefunden</p>';
            return;
        }

        // ALLE Matches mit aktuellem Benutzer abrufen für letztes Spieldatum
        const { data: allMatches } = await supabase
            .from('matches')
            .select('player_a_id, player_b_id, created_at')
            .or(`player_a_id.eq.${currentUser.id},player_b_id.eq.${currentUser.id}`)
            .order('created_at', { ascending: false });

        // Map von Gegner -> letztes Spieldatum erstellen
        const lastMatchMap = {};
        (allMatches || []).forEach(m => {
            const opponentId = m.player_a_id === currentUser.id ? m.player_b_id : m.player_a_id;
            if (!lastMatchMap[opponentId]) {
                lastMatchMap[opponentId] = new Date(m.created_at);
            }
        });

        // H2H-Daten für alle potentiellen Gegner abrufen
        const h2hPromises = clubMembers.map(async (player) => {
            try {
                const { data } = await supabase.rpc('get_h2h_handicap', {
                    p1_id: currentUser.id,
                    p2_id: player.id
                });
                return { playerId: player.id, h2h: data?.[0] || null };
            } catch {
                return { playerId: player.id, h2h: null };
            }
        });

        const h2hResults = await Promise.all(h2hPromises);
        const h2hMap = {};
        h2hResults.forEach(r => { h2hMap[r.playerId] = r.h2h; });

        // Vorschlags-Daten für jeden Spieler berechnen
        const myElo = currentUserData.elo_rating || 1000;
        const sportName = currentSportContext?.sportName?.toLowerCase();
        const isTennisOrPadel = sportName && ['tennis', 'padel'].includes(sportName);
        const threshold = isTennisOrPadel ? 150 : 40;
        const maxHandicap = isTennisOrPadel ? 3 : 7;
        const unitText = isTennisOrPadel ? 'Games' : 'Pkt';

        const suggestions = clubMembers.map(player => {
            const lastMatch = lastMatchMap[player.id];
            const neverPlayed = !lastMatch;
            const daysSinceLastMatch = lastMatch
                ? Math.floor((Date.now() - lastMatch.getTime()) / (1000 * 60 * 60 * 24))
                : Infinity;

            // Elo-Handicap
            const playerElo = player.elo_rating || 1000;
            const eloDiff = Math.abs(myElo - playerElo);
            let eloHandicap = 0;
            let eloHandicapFor = null;
            if (eloDiff >= threshold) {
                eloHandicap = Math.min(Math.floor(eloDiff / threshold), maxHandicap);
                eloHandicapFor = myElo > playerElo ? player.display_name : 'Du';
            }

            // H2H handicap
            const h2h = h2hMap[player.id];
            let h2hHandicap = 0;
            let h2hHandicapFor = null;
            if (h2h && h2h.suggested_handicap > 0 && h2h.streak_winner_id) {
                h2hHandicap = h2h.suggested_handicap;
                h2hHandicapFor = h2h.streak_winner_id === currentUser.id ? player.display_name : 'Du';
            }

            return {
                ...player,
                lastMatch,
                neverPlayed,
                daysSinceLastMatch,
                eloHandicap,
                eloHandicapFor,
                h2hHandicap,
                h2hHandicapFor,
                eloDiff
            };
        });

        // Sortieren: nie gespielt zuerst, dann nach Tagen seit letztem Match (absteigend)
        suggestions.sort((a, b) => {
            if (a.neverPlayed && !b.neverPlayed) return -1;
            if (!a.neverPlayed && b.neverPlayed) return 1;
            return b.daysSinceLastMatch - a.daysSinceLastMatch;
        });

        // Top 5 nehmen
        const top5 = suggestions.slice(0, 5);

        if (top5.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-2 text-sm">Keine Vorschläge</p>';
            return;
        }

        container.innerHTML = top5.map(player => {
            // Letztes Spieldatum formatieren
            let lastMatchText;
            if (player.neverPlayed) {
                lastMatchText = '<span class="text-green-600 font-medium">Noch nie gespielt</span>';
            } else if (player.daysSinceLastMatch === 0) {
                lastMatchText = 'Heute gespielt';
            } else if (player.daysSinceLastMatch === 1) {
                lastMatchText = 'Gestern gespielt';
            } else if (player.daysSinceLastMatch < 7) {
                lastMatchText = `Vor ${player.daysSinceLastMatch} Tagen`;
            } else if (player.daysSinceLastMatch < 30) {
                const weeks = Math.floor(player.daysSinceLastMatch / 7);
                lastMatchText = `Vor ${weeks} Woche${weeks > 1 ? 'n' : ''}`;
            } else {
                const months = Math.floor(player.daysSinceLastMatch / 30);
                lastMatchText = `<span class="text-orange-600">Vor ${months} Monat${months > 1 ? 'en' : ''}</span>`;
            }

            // Handicap-Info
            let handicapHtml = '';
            if (player.eloHandicap > 0 || player.h2hHandicap > 0) {
                const parts = [];
                if (player.eloHandicap > 0) {
                    parts.push(`Elo: ${player.eloHandicapFor} +${player.eloHandicap}`);
                }
                if (player.h2hHandicap > 0) {
                    parts.push(`H2H: ${player.h2hHandicapFor} +${player.h2hHandicap}`);
                }
                handicapHtml = `<p class="text-xs text-blue-600">${parts.join(' | ')}</p>`;
            }

            return `
                <div class="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-200 mb-2 hover:border-indigo-300 transition-colors">
                    <div class="flex items-center gap-3">
                        <img src="${player.avatar_url || DEFAULT_AVATAR}" class="w-10 h-10 rounded-full object-cover" onerror="this.src='${DEFAULT_AVATAR}'">
                        <div>
                            <p class="font-medium text-sm">${player.display_name || player.first_name}</p>
                            <p class="text-xs text-gray-500">${player.elo_rating || 800} Elo ${player.eloDiff > 0 ? `(${myElo > player.elo_rating ? '+' : ''}${myElo - (player.elo_rating || 800)})` : ''}</p>
                            ${handicapHtml}
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xs text-gray-500">${lastMatchText}</p>
                        <button onclick="quickSelectOpponent('${player.id}', '${(player.display_name || player.first_name).replace(/'/g, "\\'")}', ${player.elo_rating || 1000})"
                            class="text-xs text-indigo-600 hover:text-indigo-800 font-medium mt-1">
                            Herausfordern
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading match suggestions:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-2 text-sm">Fehler beim Laden</p>';
    }
}

// Gegner schnell aus Vorschlägen auswählen
window.quickSelectOpponent = function(playerId, playerName, playerElo) {
    // Gegner im Match-Anfrage-Formular setzen
    selectedOpponent = { id: playerId, name: playerName, elo: playerElo };
    document.getElementById('selected-opponent-id').value = playerId;
    document.getElementById('selected-opponent-elo').value = playerElo;
    document.getElementById('opponent-search-input').value = playerName;
    document.getElementById('opponent-search-results').innerHTML = '';

    // Ausgewählten Gegner anzeigen
    const display = document.getElementById('selected-opponent-display');
    if (display) {
        display.innerHTML = `
            <div class="flex items-center justify-between bg-indigo-50 p-3 rounded-lg">
                <div>
                    <p class="font-medium">${playerName}</p>
                    <p class="text-sm text-gray-500">${playerElo} Elo</p>
                </div>
                <button onclick="clearOpponentSelection()" class="text-red-500 hover:text-red-700">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
    }

    // Handicap prüfen
    checkHandicap();

    // Zum Match-Formular scrollen
    document.getElementById('match-request-section')?.scrollIntoView({ behavior: 'smooth' });
};

// --- Setup Leaderboard Preferences ---
function setupLeaderboardPreferences() {
    const toggleBtn = document.getElementById('toggle-leaderboard-preferences');
    const content = document.getElementById('leaderboard-preferences-content');
    const chevron = document.getElementById('preferences-chevron');

    if (toggleBtn && content) {
        toggleBtn.addEventListener('click', () => {
            content.classList.toggle('hidden');
            if (chevron) {
                chevron.style.transform = content.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        });
    }
}

// ========================================================================
// ===== WIDGET SETTINGS =====
// ========================================================================
// Widget-System wird jetzt von dashboard-widgets-supabase.js Modul behandelt

// ========================================================================
// ===== PLAYER SUBGROUP FILTER =====
// ========================================================================

/**
 * Populate player subgroup filter dropdown with scope options and custom subgroups
 * Age groups are now in a separate dropdown (player-age-group-filter)
 * @param {Object} userData - Aktuelle Benutzerdaten
 */
async function populatePlayerSubgroupFilter(userData) {
    const dropdown = document.getElementById('player-subgroup-filter');
    if (!dropdown) return;

    const hasClub = userData.club_id !== null && userData.club_id !== undefined;
    const subgroupIDs = userData.subgroup_ids || [];

    // Aktuelle Auswahl speichern
    const currentSelection = dropdown.value;

    // Dropdown-Optionen erstellen
    dropdown.innerHTML = '';

    // Vereins-Option nur hinzufügen wenn Benutzer einen Verein hat
    if (hasClub) {
        dropdown.appendChild(createOption('club', 'Mein Verein'));
    }

    // Folge-Option hinzufügen (immer verfügbar)
    dropdown.appendChild(createOption('following', 'Abonniert'));

    // Globale Option immer verfügbar
    dropdown.appendChild(createOption('global', 'Global'));

    // Benutzerdefinierte Untergruppen laden und hinzufügen (nur für Vereinsmitglieder)
    if (hasClub && subgroupIDs.length > 0) {
        try {
            const { data: subgroups, error } = await supabase
                .from('subgroups')
                .select('id, name')
                .eq('club_id', userData.club_id)
                .in('id', subgroupIDs)
                .order('created_at', { ascending: true });

            if (!error && subgroups && subgroups.length > 0) {
                const customGroup = document.createElement('optgroup');
                customGroup.label = 'Meine Untergruppen im Verein';
                subgroups.forEach(subgroup => {
                    const option = createOption(`subgroup:${subgroup.id}`, subgroup.name);
                    customGroup.appendChild(option);
                });
                dropdown.appendChild(customGroup);
            }
        } catch (error) {
            console.error('[Dashboard] Error loading subgroups:', error);
        }
    }

    // Auswahl wiederherstellen falls noch gültig
    const validValues = Array.from(dropdown.options).map(opt => opt.value);
    if (validValues.includes(currentSelection)) {
        dropdown.value = currentSelection;
    } else {
        // Standard: Verein falls verfügbar, sonst global
        dropdown.value = hasClub ? 'club' : 'global';
    }

    // currentSubgroupFilter mit Dropdown-Wert synchronisieren
    currentSubgroupFilter = dropdown.value;

    // Auch Ranglisten-Scope synchronisieren
    if (currentSubgroupFilter === 'global') {
        currentLeaderboardScope = 'global';
    } else if (currentSubgroupFilter === 'club') {
        currentLeaderboardScope = hasClub ? 'club' : 'global';
    } else {
        // Altersgruppen und Untergruppen - global nutzen wenn kein Verein
        currentLeaderboardScope = hasClub ? 'club' : 'global';
    }
}

/**
 * Helper function to create option elements
 */
function createOption(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

console.log('[DASHBOARD-SUPABASE] Script loaded');
