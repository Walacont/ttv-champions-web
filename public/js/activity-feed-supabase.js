/**
 * Aktivitäts-Feed-Modul (Supabase-Version)
 * Zeigt aktuelle Matches von Vereinsmitgliedern und gefolgten Nutzern
 */

import { getSupabase } from './supabase-init.js';
import { formatRelativeDate } from './dashboard-match-history-supabase.js';
import { t } from './i18n.js';
import { loadMatchMedia } from './match-media.js';
import { initComments, openComments } from './activity-comments.js';
import { escapeHtml } from './utils/security.js';
import { isTrainingSummary, renderTrainingSummaryCard, parseTrainingSummaryContent } from './training-summary-supabase.js';
import { getChildSession, getSessionToken } from './child-login-supabase.js';
import { showReportDialog, CONTENT_TYPES } from './block-report-manager.js';

const supabase = getSupabase();
const DEFAULT_AVATAR = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ccircle cx=%2250%22 cy=%2250%22 r=%2250%22 fill=%22%23e5e7eb%22/%3E%3Ccircle cx=%2250%22 cy=%2240%22 r=%2220%22 fill=%22%239ca3af%22/%3E%3Cellipse cx=%2250%22 cy=%2285%22 rx=%2235%22 ry=%2225%22 fill=%22%239ca3af%22/%3E%3C/svg%3E';

let currentUser = null;
let currentUserData = null;
let isChildMode = false;
let childSessionData = null;
let activityOffset = 0;
let likesDataCache = {};
let isLoadingMore = false;
let hasMoreActivities = true;
let infiniteScrollObserver = null;
let followingIdsCache = null;
let followedClubsCache = null;
let currentFilter = 'all'; // 'all', 'following', 'my-activities', or club id
const ACTIVITIES_PER_PAGE = 8;

let pendingActivitiesCache = [];
let typeOffsets = {
    singles: 0,
    doubles: 0,
    events: 0,
    posts: 0,
    polls: 0
};

let pullToRefreshStartY = 0;
let pullToRefreshEnabled = false;
let isPulling = false;
let isRefreshing = false;
const PULL_THRESHOLD = 80; // pixels to pull before triggering refresh

/** Aktualisiert Karussell-Zähler beim Scrollen */
window.updateCarouselCounter = function(carousel, matchType, matchId, totalItems) {
    const counter = document.getElementById(`counter-${matchType}-${matchId}`);
    if (!counter || totalItems <= 1) return;

    const itemWidth = carousel.scrollWidth / totalItems;
    const currentIndex = Math.round(carousel.scrollLeft / itemWidth) + 1;
    counter.textContent = `${currentIndex}/${totalItems}`;
};

/** Öffnet die Media-Galerie mit Aktivitätskontext */
window.openMediaGalleryWithContext = function(matchId, matchType, startIndex) {
    // Aktivitätskontext aus dem DOM und Cache sammeln
    const activityType = matchType === 'singles' ? 'singles_match' : 'doubles_match';
    const key = `${activityType}-${matchId}`;

    // Like-Daten aus Cache holen
    const likeData = likesDataCache[key] || { likeCount: 0, isLiked: false };

    // Kommentar-Anzahl aus DOM holen
    const commentCountEl = document.querySelector(`[data-comment-count="${activityType}-${matchId}"]`);
    const commentCount = commentCountEl ? parseInt(commentCountEl.textContent) || 0 : 0;

    // Beschreibung/Titel aus der Aktivitätskarte holen
    const mediaContainer = document.getElementById(`media-${matchType}-${matchId}`);
    let description = '';
    if (mediaContainer) {
        const card = mediaContainer.closest('.bg-white');
        if (card) {
            // Spielergebnis als Beschreibung nehmen
            const scoreEl = card.querySelector('.text-2xl.font-bold, .text-xl.font-bold');
            const playersEl = card.querySelector('.font-semibold');
            if (scoreEl && playersEl) {
                description = `${playersEl.textContent?.trim() || ''} - ${scoreEl.textContent?.trim() || ''}`;
            }
        }
    }

    const activityContext = {
        description: description,
        likeCount: likeData.likeCount,
        isLiked: likeData.isLiked,
        commentCount: commentCount
    };

    // openMediaGallery mit Kontext aufrufen
    if (window.openMediaGallery) {
        window.openMediaGallery(matchId, matchType, startIndex, activityContext);
    }
};

/** Öffnet die Vollbild-Galerie für Post-Bilder */
window.openPostImageGallery = function(postId, imageUrls, startIndex = 0) {
    // Like-Daten aus Cache holen
    const key = `post-${postId}`;
    const likeData = likesDataCache[key] || { likeCount: 0, isLiked: false };

    // Kommentar-Anzahl aus DOM holen
    const commentCountEl = document.querySelector(`[data-comment-count="post-${postId}"]`);
    const commentCount = commentCountEl ? parseInt(commentCountEl.textContent) || 0 : 0;

    // Beschreibung aus dem Post-Inhalt holen
    const card = document.querySelector(`[data-post-id="${postId}"]`);
    let description = '';
    if (card) {
        const contentEl = card.querySelector('.text-gray-800.whitespace-pre-wrap');
        if (contentEl) {
            description = contentEl.textContent?.trim() || '';
        }
    }

    const activityContext = {
        description: description,
        likeCount: likeData.likeCount,
        isLiked: likeData.isLiked,
        commentCount: commentCount,
        activityType: 'post',
        activityId: postId
    };

    // Galerie-Modal für Post-Bilder öffnen
    if (window.openPostGallery) {
        window.openPostGallery(imageUrls, startIndex, activityContext);
    }
};

/** Löscht Match-Medien (Foto/Video) */
window.deleteMatchMedia = async function(mediaId, filePath, matchId, matchType) {
    if (!confirm('Möchtest du dieses Foto/Video wirklich löschen?')) {
        return;
    }

    try {
        const { error: dbError } = await supabase
            .from('match_media')
            .delete()
            .eq('id', mediaId);

        if (dbError) {
            console.error('Error deleting media from database:', dbError);
            alert('Fehler beim Löschen');
            return;
        }

        const { error: storageError } = await supabase.storage
            .from('match-media')
            .remove([filePath]);

        if (storageError) {
            console.error('Error deleting file from storage:', storageError);
        }

        await injectMatchMedia(matchId, matchType);

    } catch (error) {
        console.error('Error deleting media:', error);
        alert('Fehler beim Löschen');
    }
};

/** Initialisiert das Aktivitäts-Feed-Modul */
export function initActivityFeedModule(user, userData) {
    currentUser = user;
    currentUserData = userData;
    activityOffset = 0;

    // Check for child session
    childSessionData = getChildSession();
    isChildMode = !!childSessionData || (user && user.isChild);
    console.log('[ActivityFeed] isChildMode:', isChildMode, 'childSessionData:', !!childSessionData);

    if (!document.getElementById('activity-feed-styles')) {
        const style = document.createElement('style');
        style.id = 'activity-feed-styles';
        style.textContent = `
            .scrollbar-hide {
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
            .scrollbar-hide::-webkit-scrollbar {
                display: none;
            }
            #pull-to-refresh {
                position: fixed;
                top: 70px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 1000;
                background: white;
                border-radius: 9999px;
                padding: 8px 16px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease-out;
            }
            #pull-to-refresh.visible {
                opacity: 1;
            }
            #pull-to-refresh.ready #pull-to-refresh-icon {
                transform: rotate(180deg);
            }
            #pull-to-refresh.refreshing #pull-to-refresh-icon {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    likesDataCache = {};
    isLoadingMore = false;
    hasMoreActivities = true;
    followingIdsCache = null;
    followedClubsCache = null;
    currentFilter = 'all';
    pendingActivitiesCache = [];
    typeOffsets = { singles: 0, doubles: 0, events: 0, posts: 0, polls: 0 };

    window.toggleActivityLike = toggleActivityLike;

    initComments(userData);
    window.openComments = openComments;

    setupLikesModal();
    window.showLikesModal = showLikesModal;

    setupInfiniteScroll();
    setupPullToRefresh();
    setupFilterDropdown();
    loadUserClub();

    if (window.activityFeedLanguageListener) {
        window.removeEventListener('languageChanged', window.activityFeedLanguageListener);
    }

    window.activityFeedLanguageListener = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        loadActivityFeed();
    };
    window.addEventListener('languageChanged', window.activityFeedLanguageListener);
}

/**
 * Prüft ob ein Match für den aktuellen Benutzer basierend auf Datenschutzeinstellungen sichtbar ist.
 * ALLE Spieler müssen Sichtbarkeit erlauben - die strengste Einstellung gewinnt.
 *
 * @param {Object} match - Das Match-Objekt (Einzel oder Doppel)
 * @param {string} matchType - 'singles' oder 'doubles'
 * @param {Object} privacyMap - Map von userId -> privacy_settings
 * @param {string} viewerId - ID des aktuellen Benutzers
 * @param {string|null} viewerClubId - Vereins-ID des aktuellen Benutzers
 * @param {Set} viewerFollowingIds - Set von Benutzer-IDs denen der Betrachter folgt
 * @returns {boolean} - Ob das Match sichtbar ist
 */
function canViewMatch(match, matchType, privacyMap, viewerId, viewerClubId, viewerFollowingIds) {
    // Alle Spieler-IDs aus dem Match abrufen
    let playerIds = [];
    if (matchType === 'singles') {
        playerIds = [match.player_a_id, match.player_b_id].filter(Boolean);
    } else if (matchType === 'doubles') {
        playerIds = [
            match.team_a_player1_id,
            match.team_a_player2_id,
            match.team_b_player1_id,
            match.team_b_player2_id
        ].filter(Boolean);
    }

    // Falls Betrachter ein Spieler in diesem Match ist, immer sichtbar
    if (playerIds.includes(viewerId)) {
        return true;
    }

    // Prüfen ob ALLE Spieler Sichtbarkeit basierend auf ihren Datenschutzeinstellungen erlauben
    // Die strengste Einstellung gewinnt - wenn ein Spieler blockiert, ist das Match versteckt
    for (const playerId of playerIds) {
        const privacy = privacyMap[playerId]?.privacy_settings || {};
        const visibility = privacy.matches_visibility || 'global';
        const playerClubId = privacyMap[playerId]?.club_id;

        // Prüfen ob dieser Spieler Sichtbarkeit erlaubt
        let playerAllows = false;

        if (visibility === 'global') {
            playerAllows = true;
        } else if (visibility === 'club_only') {
            // Betrachter muss im selben Verein wie dieser Spieler sein
            playerAllows = viewerClubId && playerClubId && viewerClubId === playerClubId;
        } else if (visibility === 'followers_only') {
            // Betrachter muss diesem Spieler folgen
            playerAllows = viewerFollowingIds.has(playerId);
        } else if (visibility === 'none') {
            // Nur Spieler selbst können sehen - Betrachter ist kein Spieler (oben geprüft)
            playerAllows = false;
        }

        // Falls ein Spieler blockiert, ist das Match nicht sichtbar
        if (!playerAllows) {
            return false;
        }
    }

    // Alle Spieler erlauben Sichtbarkeit
    return true;
}

/** Richtet Likes-Modal ein */
function setupLikesModal() {
    if (document.getElementById('likes-modal')) return;

    const modalHTML = `
        <div id="likes-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 hidden flex items-center justify-center p-4">
            <div class="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] flex flex-col">
                <!-- Modal Header -->
                <div class="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 class="text-lg font-semibold text-gray-900">
                        <i class="fas fa-thumbs-up mr-2 text-blue-500"></i>
                        <span>Likes</span>
                    </h3>
                    <button onclick="window.closeLikesModal()" class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Likes List -->
                <div id="likes-list" class="flex-1 overflow-y-auto p-4">
                    <div class="text-center text-gray-400 py-8">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                        <p class="text-sm">Lädt...</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    document.getElementById('likes-modal').addEventListener('click', (e) => {
        if (e.target.id === 'likes-modal') {
            window.closeLikesModal();
        }
    });
}

/** Zeigt Likes-Modal mit Liste der Nutzer */
async function showLikesModal(activityId, activityType) {
    const modal = document.getElementById('likes-modal');
    const likesList = document.getElementById('likes-list');

    if (!modal) return;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    likesList.innerHTML = `
        <div class="text-center text-gray-400 py-8">
            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p class="text-sm">Lädt...</p>
        </div>
    `;

    try {
        const { data: likes, error } = await supabase
            .from('activity_likes')
            .select('user_id, created_at')
            .eq('activity_id', activityId)
            .eq('activity_type', activityType)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!likes || likes.length === 0) {
            likesList.innerHTML = `
                <div class="text-center text-gray-400 py-8">
                    <i class="far fa-heart text-3xl mb-2"></i>
                    <p class="text-sm">Noch keine Likes</p>
                </div>
            `;
            return;
        }

        const userIds = likes.map(l => l.user_id);
        let profiles = [];

        if (isChildMode) {
            // Child mode: use RPC
            const sessionToken = getSessionToken();
            if (sessionToken) {
                const { data } = await supabase.rpc('get_profiles_for_child_session', {
                    p_session_token: sessionToken,
                    p_profile_ids: userIds
                });
                if (data?.success) {
                    profiles = data.profiles || [];
                }
            }
        } else {
            const { data, error: profileError } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, display_name, avatar_url')
                .in('id', userIds);
            if (profileError) throw profileError;
            profiles = data || [];
        }

        const profileMap = {};
        (profiles || []).forEach(p => {
            profileMap[p.id] = p;
        });

        likesList.innerHTML = likes.map(like => {
            const profile = profileMap[like.user_id];
            if (!profile) return '';

            const displayName = profile.display_name || `${profile.first_name} ${profile.last_name?.charAt(0) || ''}.`;
            const avatarUrl = profile.avatar_url || DEFAULT_AVATAR;
            const likedDate = new Date(like.created_at);
            const timeAgo = getTimeAgo(likedDate);

            return `
                <a href="/profile.html?id=${like.user_id}" class="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="flex-1 min-w-0">
                        <p class="font-semibold text-gray-900 truncate">${displayName}</p>
                        <p class="text-xs text-gray-500">${timeAgo}</p>
                    </div>
                    <i class="fas fa-thumbs-up text-blue-500"></i>
                </a>
            `;
        }).join('');

    } catch (error) {
        console.error('Error loading likes:', error);
        likesList.innerHTML = `
            <div class="text-center text-gray-400 py-8">
                <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                <p class="text-sm">Fehler beim Laden</p>
            </div>
        `;
    }
}

/** Schließt Likes-Modal */
window.closeLikesModal = function() {
    const modal = document.getElementById('likes-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
};

/** Gibt relative Zeitangabe zurück */
function getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'gerade eben';
    if (seconds < 3600) return `vor ${Math.floor(seconds / 60)} Min.`;
    if (seconds < 86400) return `vor ${Math.floor(seconds / 3600)} Std.`;
    if (seconds < 604800) return `vor ${Math.floor(seconds / 86400)} Tag(en)`;

    return date.toLocaleDateString('de-DE');
}

/** Prüft ob Aktivität dem aktuellen Nutzer gehört */
function isOwnActivity(activity, activityType) {
    if (!currentUser?.id) return false;

    if (activityType === 'singles' || activityType === 'singles_match') {
        return activity.player_a_id === currentUser.id || activity.player_b_id === currentUser.id;
    } else if (activityType === 'doubles' || activityType === 'doubles_match') {
        return [
            activity.team_a_player1_id,
            activity.team_a_player2_id,
            activity.team_b_player1_id,
            activity.team_b_player2_id
        ].includes(currentUser.id);
    } else if (activityType === 'post' || activityType === 'poll') {
        return activity.user_id === currentUser.id || activity.created_by === currentUser.id;
    } else if (activityType === 'rank_up' || activityType === 'club_join' || activityType === 'event') {
        return activity.user_id === currentUser.id;
    }

    return false;
}

/** Richtet Filter-Dropdown ein */
function setupFilterDropdown() {
    const filterBtn = document.getElementById('activity-filter-btn');
    const filterDropdown = document.getElementById('activity-filter-dropdown');

    if (!filterBtn || !filterDropdown) return;

    filterBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        filterDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
        filterDropdown.classList.add('hidden');
    });

    filterDropdown.addEventListener('click', (e) => {
        const option = e.target.closest('.activity-filter-option');
        if (!option) return;

        e.stopPropagation();
        const filter = option.dataset.filter;
        const label = option.querySelector('span').textContent;

        selectFilter(filter, label);
        filterDropdown.classList.add('hidden');
    });
}

/**
 * Select a filter and reload feed
 */
function selectFilter(filter, label) {
    currentFilter = filter;

    // Label aktualisieren
    const labelEl = document.getElementById('activity-filter-label');
    if (labelEl) labelEl.textContent = label;

    document.querySelectorAll('.activity-filter-option .filter-check').forEach(check => {
        const option = check.closest('.activity-filter-option');
        if (option.dataset.filter === filter) {
            check.classList.remove('hidden');
        } else {
            check.classList.add('hidden');
        }
    });

    loadActivityFeed();
}

/** Lädt den Verein des Nutzers für Filter-Optionen */
async function loadUserClub() {
    try {
        if (!currentUserData.club_id) {
            followedClubsCache = [];
            renderClubFilters();
            return;
        }

        const { data: club, error } = await supabase
            .from('clubs')
            .select('id, name')
            .eq('id', currentUserData.club_id)
            .single();

        if (error || !club) {
            followedClubsCache = [];
            renderClubFilters();
            return;
        }

        followedClubsCache = [club];
        renderClubFilters();

    } catch (error) {
        console.error('[ActivityFeed] Error loading user club:', error);
        followedClubsCache = [];
    }
}

/** Rendert Vereins-Filteroptionen im Dropdown */
function renderClubFilters() {
    const container = document.getElementById('activity-filter-clubs');
    if (!container || !followedClubsCache) return;

    if (followedClubsCache.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = followedClubsCache.map(club => `
        <button
            class="activity-filter-option w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center justify-between"
            data-filter="club-${club.id}"
        >
            <span>${club.name}</span>
            <i class="fas fa-check text-indigo-600 filter-check hidden"></i>
        </button>
    `).join('');
}

/** Richtet Infinite-Scroll mit Intersection Observer ein */
function setupInfiniteScroll() {
    if (infiniteScrollObserver) {
        infiniteScrollObserver.disconnect();
    }

    const sentinel = document.getElementById('activity-feed-sentinel');
    if (!sentinel) return;

    infiniteScrollObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoadingMore && hasMoreActivities) {
                    loadMoreActivities();
                }
            });
        },
        {
            root: null,
            rootMargin: '100px',
            threshold: 0.1
        }
    );

    infiniteScrollObserver.observe(sentinel);
}

/**
 * Setup pull-to-refresh functionality for touch devices
 */
function setupPullToRefresh() {
    const feedContainer = document.getElementById('activity-feed');
    const ptrIndicator = document.getElementById('pull-to-refresh-indicator');
    const ptrIcon = document.getElementById('ptr-icon');
    const ptrText = document.getElementById('ptr-text');

    if (!feedContainer || !ptrIndicator) return;

    let startY = 0;
    let currentY = 0;
    let isPulling = false;
    // Modul-Level isRefreshing Variable verwenden (am Dateianfang deklariert)
    const pullThreshold = 80; // px needed to trigger refresh
    const maxPull = 120; // max pull distance

    // Scrollbares Eltern-Element abrufen
    function getScrollTop() {
        const tabContent = feedContainer.closest('.tab-content');
        if (tabContent) {
            return tabContent.scrollTop;
        }
        return window.scrollY || document.documentElement.scrollTop;
    }

    // Touch-Start
    feedContainer.addEventListener('touchstart', (e) => {
        if (isRefreshing) return;
        if (getScrollTop() > 5) return; // Nur oben auslösen

        startY = e.touches[0].clientY;
        isPulling = true;
    }, { passive: true });

    // Touch move
    feedContainer.addEventListener('touchmove', (e) => {
        if (!isPulling || isRefreshing) return;
        if (getScrollTop() > 5) {
            isPulling = false;
            return;
        }

        currentY = e.touches[0].clientY;
        const pullDistance = Math.min(currentY - startY, maxPull);

        if (pullDistance > 0) {
            // Indikator aktualisieren
            const progress = Math.min(pullDistance / pullThreshold, 1);
            ptrIndicator.style.height = `${pullDistance}px`;
            ptrIndicator.style.opacity = progress;

            // Pfeil-Icon basierend auf Fortschritt rotieren
            if (pullDistance >= pullThreshold) {
                ptrIcon.style.transform = 'rotate(180deg)';
                ptrIcon.className = 'fas fa-arrow-up text-indigo-600 text-lg mb-1 transition-transform duration-200';
                ptrText.textContent = 'Loslassen zum Aktualisieren';
            } else {
                ptrIcon.style.transform = 'rotate(0deg)';
                ptrIcon.className = 'fas fa-arrow-down text-indigo-500 text-lg mb-1 transition-transform duration-200';
                ptrText.textContent = 'Nach unten ziehen zum Aktualisieren';
            }
        }
    }, { passive: true });

    // Touch end
    feedContainer.addEventListener('touchend', async () => {
        if (!isPulling || isRefreshing) return;

        const pullDistance = currentY - startY;

        if (pullDistance >= pullThreshold) {
            // Aktualisierung auslösen
            isRefreshing = true;

            // Ladezustand anzeigen
            ptrIcon.className = 'fas fa-spinner fa-spin text-indigo-600 text-lg mb-1';
            ptrText.textContent = 'Aktualisiere...';
            ptrIndicator.style.height = '60px';

            try {
                // Aktivitäts-Feed neu laden
                await loadActivityFeed();
            } finally {
                // Indikator ausblenden
                isRefreshing = false;
                ptrIndicator.style.height = '0';
                ptrIndicator.style.opacity = '0';

                // Icon zurücksetzen
                setTimeout(() => {
                    ptrIcon.className = 'fas fa-arrow-down text-indigo-500 text-lg mb-1 transition-transform duration-200';
                    ptrIcon.style.transform = 'rotate(0deg)';
                    ptrText.textContent = 'Nach unten ziehen zum Aktualisieren';
                }, 300);
            }
        } else {
            // Abbrechen - Indikator ausblenden
            ptrIndicator.style.height = '0';
            ptrIndicator.style.opacity = '0';
        }

        isPulling = false;
        startY = 0;
        currentY = 0;
    }, { passive: true });

    // Touch-Abbruch
    feedContainer.addEventListener('touchcancel', () => {
        isPulling = false;
        isRefreshing = false;
        startY = 0;
        currentY = 0;
        ptrIndicator.style.height = '0';
        ptrIndicator.style.opacity = '0';
    }, { passive: true });
}

/**
 * Load match media for all match activities
 */
async function loadMatchMediaForActivities(activities) {
    // Einmal prüfen ob Funktionen verfügbar sind
    if (!matchMediaFunctionsChecked) {
        await checkMatchMediaAvailability();
    }

    // Überspringen wenn Funktionen nicht verfügbar
    if (!matchMediaFunctionsAvailable) {
        return;
    }

    activities.forEach(activity => {
        if (activity.activityType === 'singles' || activity.matchType === 'singles') {
            injectMatchMedia(activity.id, 'singles');
        } else if (activity.activityType === 'doubles' || activity.matchType === 'doubles') {
            injectMatchMedia(activity.id, 'doubles');
        }
    });
}

/**
 * Load activity feed based on current filter
 */
export async function loadActivityFeed() {
    const container = document.getElementById('activity-feed');
    if (!container) return;

    // Zustand für neuen Ladevorgang zurücksetzen
    activityOffset = 0;
    hasMoreActivities = false;  // Infinite-Scroll während Laden deaktivieren
    followingIdsCache = null;   // Alten Cache löschen
    pendingActivitiesCache = []; // Gecachte Aktivitäten löschen
    typeOffsets = { singles: 0, doubles: 0, events: 0, posts: 0, polls: 0 }; // Typ-spezifische Offsets zurücksetzen

    // Ladeindikator nur anzeigen wenn NICHT durch Pull-to-Refresh ausgelöst
    // (pull-to-refresh has its own indicator)
    if (!isRefreshing) {
        container.innerHTML = `
            <div class="p-6 text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
                <p class="text-sm">${t('dashboard.activityFeed.loading')}</p>
            </div>
        `;
    }

    try {
        // Benutzer-IDs basierend auf Filter abrufen
        const userIds = await getUserIdsForFilter();

        if (userIds.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-sm p-8 text-center">
                    <i class="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">${t('dashboard.activityFeed.noActivity')}</p>
                    <p class="text-gray-400 text-sm mt-1">${getEmptyMessage()}</p>
                </div>
            `;
            hasMoreActivities = false;
            return;
        }

        // Cache für Paginierung
        followingIdsCache = userIds;

        // Ersten Batch laden
        const activities = await fetchActivities(userIds);

        if (activities.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl shadow-sm p-8 text-center">
                    <i class="fas fa-table-tennis-paddle-ball text-4xl text-gray-300 mb-3"></i>
                    <p class="text-gray-500 font-medium">${t('dashboard.activityFeed.noActivity')}</p>
                    <p class="text-gray-400 text-sm mt-1">${getEmptyMessage()}</p>
                </div>
            `;
            hasMoreActivities = false;
            return;
        }

        // Initiale Aktivitäten rendern
        container.innerHTML = activities.map(activity => renderActivityCard(activity)).join('');

        // Match-Medien für alle gerenderten Matches laden
        loadMatchMediaForActivities(activities);

        // Kommentar-Anzahlen für Matches laden (nach Rendering)
        loadCommentCountsForMatches(activities);

        // Prüfen ob mehr Aktivitäten vorhanden sind
        hasMoreActivities = pendingActivitiesCache.length > 0 || activities.length >= ACTIVITIES_PER_PAGE;

    } catch (error) {
        console.error('[ActivityFeed] Error loading activities:', error);
        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm p-6 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                <p class="text-sm">Fehler beim Laden der Aktivitäten</p>
            </div>
        `;
    }
}

/**
 * Get user IDs based on current filter
 */
async function getUserIdsForFilter() {
    // Child mode: use RPC to get club member IDs (no following support for children)
    if (isChildMode) {
        console.log('[ActivityFeed] Child mode: getting club members via RPC');
        const sessionToken = getSessionToken();

        if (!sessionToken) {
            console.error('[ActivityFeed] No session token for child');
            return [currentUser.id];
        }

        try {
            const { data, error } = await supabase.rpc('get_club_member_ids_for_child_session', {
                p_session_token: sessionToken
            });

            if (error) {
                console.error('[ActivityFeed] RPC error:', error);
                return [currentUser.id];
            }

            if (!data?.success) {
                console.error('[ActivityFeed] RPC failed:', data?.error);
                return [currentUser.id];
            }

            // For children, always return club members (or just self if no club)
            const memberIds = data.member_ids || [];
            console.log('[ActivityFeed] Got', memberIds.length, 'club members for child');

            // Ensure child's own ID is included
            if (!memberIds.includes(currentUser.id)) {
                memberIds.push(currentUser.id);
            }

            return memberIds;
        } catch (err) {
            console.error('[ActivityFeed] Error getting club members for child:', err);
            return [currentUser.id];
        }
    }

    // Normal mode below
    if (currentFilter === 'my-activities') {
        return [currentUser.id];
    }

    if (currentFilter === 'following') {
        // Gefolgte Benutzer + eigenen Benutzer abrufen
        const userIds = new Set([currentUser.id]);

        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');

        (following || []).forEach(f => userIds.add(f.addressee_id));

        return [...userIds];
    }

    if (currentFilter === 'all') {
        // Combine: own activities + followed users + club members
        const userIds = new Set([currentUser.id]);

        // Gefolgte Benutzer abrufen
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');

        (following || []).forEach(f => userIds.add(f.addressee_id));

        // Vereinsmitglieder abrufen falls Benutzer in Verein
        if (currentUserData.club_id) {
            const { data: clubMembers } = await supabase
                .from('profiles')
                .select('id')
                .eq('club_id', currentUserData.club_id);

            (clubMembers || []).forEach(m => userIds.add(m.id));
        }

        return [...userIds];
    }

    if (currentFilter.startsWith('club-')) {
        // Nach spezifischem Verein filtern
        const clubId = currentFilter.replace('club-', '');

        const { data: clubMembers } = await supabase
            .from('profiles')
            .select('id')
            .eq('club_id', clubId);

        return (clubMembers || []).map(m => m.id);
    }

    return [];
}

/**
 * Get empty message based on filter
 */
function getEmptyMessage() {
    if (currentFilter === 'my-activities') {
        return t('dashboard.activityFeed.emptyMyActivities');
    }
    if (currentFilter === 'following') {
        return t('dashboard.activityFeed.emptyFollowing');
    }
    if (currentFilter === 'all') {
        return t('dashboard.activityFeed.emptyAll');
    }
    return t('dashboard.activityFeed.emptyClub');
}

/**
 * Fetch activities for child mode using RPC
 * Direct Supabase queries don't work for child sessions (no auth.uid())
 * Returns raw activities that need to be enriched with profileMap/followingIds
 */
async function fetchActivitiesForChildRaw() {
    const sessionToken = getSessionToken();

    if (!sessionToken) {
        console.error('[ActivityFeed] No session token for child activities');
        return { activities: [], memberIds: [] };
    }

    console.log('[ActivityFeed] Child mode: fetching activities via RPC, offset:', typeOffsets.singles);

    try {
        const { data, error } = await supabase.rpc('get_club_activities_for_child_session', {
            p_session_token: sessionToken,
            p_limit: ACTIVITIES_PER_PAGE * 3,
            p_offset: typeOffsets.singles
        });

        if (error) {
            console.error('[ActivityFeed] Child RPC error:', error);
            return { activities: [], memberIds: [] };
        }

        if (!data?.success) {
            console.error('[ActivityFeed] Child RPC failed:', data?.error);
            return { activities: [], memberIds: [] };
        }

        const singlesCount = (data.matches || []).length;
        const doublesCount = (data.doubles_matches || []).length;
        const eventsCount = (data.activity_events || []).length;
        const postsCount = (data.community_posts || []).length;
        const pollsCount = (data.community_polls || []).length;

        console.log('[ActivityFeed] Child mode: got', singlesCount, 'singles,', doublesCount, 'doubles,', eventsCount, 'events,', postsCount, 'posts,', pollsCount, 'polls');

        // Transform all activity types to unified format
        const activities = [];

        // 1. Add singles matches
        (data.matches || []).forEach(match => {
            activities.push({
                ...match,
                activityType: 'singles'
            });
        });

        // 2. Add doubles matches
        (data.doubles_matches || []).forEach(match => {
            activities.push({
                ...match,
                activityType: 'doubles'
            });
        });

        // 3. Add activity events (club_join, club_leave, rank_up, ranking changes)
        (data.activity_events || []).forEach(event => {
            activities.push({
                ...event,
                activityType: event.event_type // e.g., 'club_join', 'rank_up', 'club_ranking_change', etc.
            });
        });

        // 4. Add community posts
        (data.community_posts || []).forEach(post => {
            activities.push({
                ...post,
                activityType: 'post'
            });
        });

        // 5. Add community polls
        (data.community_polls || []).forEach(poll => {
            activities.push({
                ...poll,
                activityType: 'poll'
            });
        });

        // Sort by created_at descending
        activities.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        // Update offset for pagination
        typeOffsets.singles += singlesCount;
        typeOffsets.doubles += doublesCount;
        typeOffsets.events += eventsCount;
        typeOffsets.posts += postsCount;
        typeOffsets.polls += pollsCount;

        return { activities, memberIds: data.member_ids || [] };

    } catch (err) {
        console.error('[ActivityFeed] Error fetching child activities:', err);
        return { activities: [], memberIds: [] };
    }
}

/**
 * Fetch activities with separate offsets per type
 * This prevents losing activities when different types have different densities
 */
async function fetchActivities(userIds) {
    if (!userIds || userIds.length === 0) {
        return [];
    }

    console.log('[ActivityFeed] Fetching activities for filter:', currentFilter);
    console.log('[ActivityFeed] UserIds count:', userIds.length);
    console.log('[ActivityFeed] Type offsets:', JSON.stringify(typeOffsets));
    console.log('[ActivityFeed] Pending cache size:', pendingActivitiesCache.length);

    // Mit gecachten Aktivitäten starten
    let allActivities = [...pendingActivitiesCache];
    pendingActivitiesCache = []; // Cache leeren

    // Nur mehr abrufen wenn mehr Aktivitäten benötigt
    const needToFetch = allActivities.length < ACTIVITIES_PER_PAGE * 2;

    // Child mode: use RPC to fetch activities (direct queries don't work without auth.uid())
    if (isChildMode && needToFetch) {
        const { activities: childActivities } = await fetchActivitiesForChildRaw();
        allActivities = [...allActivities, ...childActivities];
        console.log('[ActivityFeed] Child mode: loaded', childActivities.length, 'activities via RPC');
        // Skip normal fetching, go directly to enrichment below
    } else if (needToFetch) {
        // Alle Queries parallel ausführen für schnellere Ladezeiten
        const [singlesResult, doublesResult, eventsResult, postsResult, summariesResult, pollsResult] = await Promise.all([
            // Einzel-Matches
            supabase
                .from('matches')
                .select('id, player_a_id, player_b_id, winner_id, loser_id, sets, player_a_sets_won, player_b_sets_won, elo_change, season_points_awarded, created_at, sport_id, club_id, match_mode, handicap_used')
                .or(`player_a_id.in.(${userIds.join(',')}),player_b_id.in.(${userIds.join(',')})`)
                .order('created_at', { ascending: false })
                .range(typeOffsets.singles, typeOffsets.singles + ACTIVITIES_PER_PAGE * 2 - 1),
            // Doppel-Matches
            supabase
                .from('doubles_matches')
                .select('id, team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id, winning_team, sets, team_a_sets_won, team_b_sets_won, season_points_awarded, created_at, sport_id, club_id, match_mode, handicap_used')
                .or(`team_a_player1_id.in.(${userIds.join(',')}),team_a_player2_id.in.(${userIds.join(',')}),team_b_player1_id.in.(${userIds.join(',')}),team_b_player2_id.in.(${userIds.join(',')})`)
                .order('created_at', { ascending: false })
                .range(typeOffsets.doubles, typeOffsets.doubles + ACTIVITIES_PER_PAGE - 1),
            // Aktivitäts-Events
            supabase
                .from('activity_events')
                .select('id, user_id, event_type, event_data, created_at')
                .in('user_id', userIds)
                .order('created_at', { ascending: false })
                .range(typeOffsets.events, typeOffsets.events + ACTIVITIES_PER_PAGE - 1),
            // Community-Posts (ohne Training-Zusammenfassungen)
            supabase
                .from('community_posts')
                .select('id, user_id, content, created_at, deleted_at, visibility, image_url, image_urls, likes_count, comments_count')
                .is('deleted_at', null)
                .in('user_id', userIds)
                .not('content', 'ilike', 'TRAINING_SUMMARY|%')
                .order('created_at', { ascending: false })
                .range(typeOffsets.posts, typeOffsets.posts + ACTIVITIES_PER_PAGE - 1),
            // Training-Zusammenfassungen
            currentUser
                ? supabase
                    .from('community_posts')
                    .select('id, user_id, content, created_at, deleted_at, visibility')
                    .eq('user_id', currentUser.id)
                    .ilike('content', 'TRAINING_SUMMARY|%')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false })
                    .limit(10)
                : Promise.resolve({ data: null, error: null }),
            // Community-Umfragen
            supabase
                .from('community_polls')
                .select('id, user_id, question, options, created_at, deleted_at, visibility, is_anonymous, allow_multiple, ends_at, total_votes')
                .is('deleted_at', null)
                .in('user_id', userIds)
                .order('created_at', { ascending: false })
                .range(typeOffsets.polls, typeOffsets.polls + ACTIVITIES_PER_PAGE - 1)
        ]);

        const { data: singlesMatches, error: singlesError } = singlesResult;
        const { data: doublesMatches, error: doublesError } = doublesResult;
        const { data: activityEvents, error: eventsError } = eventsResult;
        const { data: communityPosts, error: postsError } = postsResult;
        const { data: summaries, error: summariesError } = summariesResult;
        const { data: communityPolls, error: pollsError } = pollsResult;

        if (singlesError) throw singlesError;
        console.log('[ActivityFeed] Singles matches found:', singlesMatches?.length || 0);
        if (doublesError) console.warn('Error fetching doubles:', doublesError);
        console.log('[ActivityFeed] Doubles matches found:', doublesMatches?.length || 0);
        if (eventsError) console.warn('Error fetching activity events:', eventsError);
        if (postsError) console.warn('Error fetching community posts:', postsError);
        if (summariesError) console.warn('Error fetching training summaries:', summariesError);
        if (pollsError) console.warn('Error fetching community polls:', pollsError);

        // Training-Zusammenfassungen verarbeiten
        let trainingSummaries = [];
        if (summaries) {
            trainingSummaries = summaries.map(s => {
                const summaryData = parseTrainingSummaryContent(s.content);
                const sortDate = summaryData?.event_date
                    ? new Date(summaryData.event_date + 'T12:00:00').toISOString()
                    : s.created_at;
                return { ...s, activityType: 'training_summary', sort_date: sortDate };
            });
        }

        // Typ-Offsets basierend auf geladenen Daten aktualisieren
        typeOffsets.singles += (singlesMatches || []).length;
        typeOffsets.doubles += (doublesMatches || []).length;
        typeOffsets.events += (activityEvents || []).length;
        typeOffsets.posts += (communityPosts || []).length;
        typeOffsets.polls += (communityPolls || []).length;

        // Neue Aktivitäten mit gecachten kombinieren
        allActivities = [
            ...allActivities,
            ...(singlesMatches || []).map(m => ({ ...m, activityType: 'singles' })),
            ...(doublesMatches || []).map(m => ({ ...m, activityType: 'doubles' })),
            ...(activityEvents || []).map(e => ({ ...e, activityType: e.event_type })),
            ...(communityPosts || []).map(p => ({ ...p, activityType: 'post' })),
            ...(communityPolls || []).map(p => ({ ...p, activityType: 'poll' })),
            ...trainingSummaries
        ];

        // === PRIVACY FILTERING FOR MATCHES ===
        // Alle eindeutigen Spieler-IDs aus Einzel- und Doppel-Matches für Datenschutzprüfung sammeln
        const matchPlayerIds = new Set();
        allActivities.forEach(activity => {
            if (activity.activityType === 'singles') {
                if (activity.player_a_id) matchPlayerIds.add(activity.player_a_id);
                if (activity.player_b_id) matchPlayerIds.add(activity.player_b_id);
            } else if (activity.activityType === 'doubles') {
                if (activity.team_a_player1_id) matchPlayerIds.add(activity.team_a_player1_id);
                if (activity.team_a_player2_id) matchPlayerIds.add(activity.team_a_player2_id);
                if (activity.team_b_player1_id) matchPlayerIds.add(activity.team_b_player1_id);
                if (activity.team_b_player2_id) matchPlayerIds.add(activity.team_b_player2_id);
            }
        });

        // Datenschutzeinstellungen für alle an Matches beteiligten Spieler laden
        let privacyMap = {};
        if (matchPlayerIds.size > 0) {
            const { data: privacyProfiles } = await supabase
                .from('profiles')
                .select('id, privacy_settings, club_id')
                .in('id', [...matchPlayerIds]);

            (privacyProfiles || []).forEach(p => {
                privacyMap[p.id] = p;
            });
        }

        // Abonnenten-Liste des Betrachters für Datenschutzprüfungen abrufen
        let viewerFollowingIds = new Set();
        if (currentUser) {
            const { data: following } = await supabase
                .from('friendships')
                .select('addressee_id')
                .eq('requester_id', currentUser.id)
                .eq('status', 'accepted');

            (following || []).forEach(f => viewerFollowingIds.add(f.addressee_id));
        }

        // Matches basierend auf Datenschutzeinstellungen filtern
        const viewerId = currentUser?.id;
        const viewerClubId = currentUserData?.club_id;
        const viewerSubgroupIds = currentUserData?.subgroup_ids || [];

        allActivities = allActivities.filter(activity => {
            // Nur Einzel- und Doppel-Matches filtern
            if (activity.activityType === 'singles' || activity.activityType === 'doubles') {
                return canViewMatch(activity, activity.activityType, privacyMap, viewerId, viewerClubId, viewerFollowingIds);
            }

            // Untergruppen-Sichtbarkeit für Posts und Umfragen prüfen
            if (activity.activityType === 'post' || activity.activityType === 'poll') {
                if (activity.visibility === 'subgroup' && activity.target_subgroup_ids?.length > 0) {
                    // Prüfen ob Benutzer in einer der Ziel-Untergruppen ist
                    const isInSubgroup = activity.target_subgroup_ids.some(sgId => viewerSubgroupIds.includes(sgId));
                    // Auch Coach/Head-Coach sehen alle Untergruppen-Posts ihres Vereins
                    const isCoach = currentUserData?.role === 'coach' || currentUserData?.role === 'head_coach';
                    const sameClub = viewerClubId && activity.club_id === viewerClubId;
                    return isInSubgroup || (isCoach && sameClub) || activity.user_id === viewerId;
                }
            }

            // Andere Aktivitätstypen (öffentliche Posts, Events) durchlassen
            return true;
        });

        console.log('[ActivityFeed] Activities after privacy filter:', allActivities.length);
    }

    // Nach Datum absteigend sortieren (sort_date für Training Summaries, sonst created_at)
    allActivities.sort((a, b) => {
        const dateA = new Date(a.sort_date || a.created_at);
        const dateB = new Date(b.sort_date || b.created_at);
        return dateB - dateA;
    });

    // Nach ID deduplizieren um gleiche Aktivität nicht zweimal anzuzeigen
    const seenIds = new Set();
    allActivities = allActivities.filter(activity => {
        const key = `${activity.activityType}-${activity.id}`;
        if (seenIds.has(key)) {
            return false;
        }
        seenIds.add(key);
        return true;
    });

    // Doppel-Ranking-Events deduplizieren (ein Event pro Paarung, nicht pro Spieler)
    const seenPairingEvents = new Set();
    const deduplicatedActivities = allActivities.filter(activity => {
        if (activity.activityType === 'global_doubles_ranking_change' ||
            activity.activityType === 'club_doubles_ranking_change') {
            const pairingId = activity.event_data?.pairing_id;
            const eventType = activity.activityType;
            const key = `${eventType}-${pairingId}-${activity.event_data?.new_position}`;
            if (seenPairingEvents.has(key)) {
                return false; // Duplikat überspringen
            }
            seenPairingEvents.add(key);
        }
        return true;
    });

    console.log('[ActivityFeed] Total activities after combine:', deduplicatedActivities.length);

    // Seitengröße für Anzeige nehmen
    const activities = deduplicatedActivities.slice(0, ACTIVITIES_PER_PAGE);

    // Verbleibende Aktivitäten für nächstes Laden cachen (verhindert Aktivitätsverlust)
    pendingActivitiesCache = deduplicatedActivities.slice(ACTIVITIES_PER_PAGE);
    console.log('[ActivityFeed] Cached for next load:', pendingActivitiesCache.length);

    if (activities.length === 0) {
        return [];
    }

    // Alle Spieler-IDs aus Matches sammeln (nicht aus Events, die haben eingebettete Daten)
    const playerIds = new Set();
    activities.forEach(m => {
        if (m.activityType === 'singles') {
            playerIds.add(m.player_a_id);
            playerIds.add(m.player_b_id);
        } else if (m.activityType === 'doubles') {
            playerIds.add(m.team_a_player1_id);
            playerIds.add(m.team_a_player2_id);
            playerIds.add(m.team_b_player1_id);
            playerIds.add(m.team_b_player2_id);
        } else if (m.activityType === 'post' || m.activityType === 'poll') {
            // Posts und Umfragen benötigen Benutzerprofil-Daten
            playerIds.add(m.user_id);
        }
        // Für Events (club_join, rank_up) sind Benutzerdaten in event_data
    });

    // Spielerprofile abrufen
    let profiles = [];
    const filteredPlayerIds = [...playerIds].filter(Boolean);

    if (filteredPlayerIds.length > 0) {
        if (isChildMode) {
            // Child mode: use RPC to bypass RLS
            const sessionToken = getSessionToken();
            if (sessionToken) {
                try {
                    const { data, error } = await supabase.rpc('get_profiles_for_child_session', {
                        p_session_token: sessionToken,
                        p_profile_ids: filteredPlayerIds
                    });

                    if (error) {
                        console.error('[ActivityFeed] RPC error loading profiles:', error);
                    } else if (data?.success) {
                        profiles = data.profiles || [];
                        console.log('[ActivityFeed] Child mode: loaded', profiles.length, 'profiles via RPC');
                    } else {
                        console.error('[ActivityFeed] RPC failed:', data?.error);
                    }
                } catch (err) {
                    console.error('[ActivityFeed] Error loading profiles for child:', err);
                }
            }
        } else {
            // Normal mode: direct query
            const { data } = await supabase
                .from('profiles')
                .select('id, display_name, first_name, last_name, avatar_url, elo_rating, club_id')
                .in('id', filteredPlayerIds);
            profiles = data || [];
        }
    }

    const profileMap = {};
    (profiles || []).forEach(p => {
        profileMap[p.id] = p;
    });

    // Benutzer-Abstimmungen für Umfragen laden
    const pollActivities = activities.filter(a => a.activityType === 'poll');
    if (pollActivities.length > 0 && currentUser) {
        const pollIds = pollActivities.map(p => p.id);
        const { data: userVotes } = await supabase
            .from('poll_votes')
            .select('poll_id, option_id')
            .in('poll_id', pollIds)
            .eq('user_id', currentUser.id);

        // Benutzer-Stimmen an jede Umfrage anhängen (als Array für Mehrfachauswahl-Unterstützung)
        const voteMap = {};
        (userVotes || []).forEach(v => {
            if (!voteMap[v.poll_id]) {
                voteMap[v.poll_id] = [];
            }
            voteMap[v.poll_id].push(v.option_id);
        });

        pollActivities.forEach(poll => {
            poll.userVotedOptionIds = voteMap[poll.id] || [];
        });

        // Für nicht-anonyme Umfragen alle Wähler mit Profilen laden
        const nonAnonymousPolls = pollActivities.filter(p => p.is_anonymous === false);
        if (nonAnonymousPolls.length > 0) {
            const nonAnonPollIds = nonAnonymousPolls.map(p => p.id);
            const { data: allVotes } = await supabase
                .from('poll_votes')
                .select('poll_id, option_id, user_id')
                .in('poll_id', nonAnonPollIds);

            // Eindeutige Wähler-IDs abrufen
            const voterIds = [...new Set((allVotes || []).map(v => v.user_id))];

            // Wählerprofile laden
            let voterProfiles = {};
            if (voterIds.length > 0) {
                let voterProfilesData = [];

                if (isChildMode) {
                    // Child mode: use RPC
                    const sessionToken = getSessionToken();
                    if (sessionToken) {
                        const { data } = await supabase.rpc('get_profiles_for_child_session', {
                            p_session_token: sessionToken,
                            p_profile_ids: voterIds
                        });
                        if (data?.success) {
                            voterProfilesData = data.profiles || [];
                        }
                    }
                } else {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, first_name, last_name, avatar_url')
                        .in('id', voterIds);
                    voterProfilesData = profiles || [];
                }

                voterProfilesData.forEach(p => {
                    voterProfiles[p.id] = p;
                });
            }

            // Wähler-Map pro Umfrage und Option erstellen
            const votersMap = {};
            (allVotes || []).forEach(v => {
                if (!votersMap[v.poll_id]) {
                    votersMap[v.poll_id] = {};
                }
                if (!votersMap[v.poll_id][v.option_id]) {
                    votersMap[v.poll_id][v.option_id] = [];
                }
                const profile = voterProfiles[v.user_id];
                if (profile) {
                    votersMap[v.poll_id][v.option_id].push({
                        id: v.user_id,
                        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unbekannt',
                        avatar_url: profile.avatar_url
                    });
                }
            });

            // Wähler an nicht-anonyme Umfragen anhängen
            nonAnonymousPolls.forEach(poll => {
                poll.voters = votersMap[poll.id] || {};
            });
        }
    }

    // Likes-Daten laden
    await loadLikesForActivities(activities);

    // Gefolgte-IDs für Kontext-Icons abrufen
    let followingIds = [];
    if (currentFilter !== 'my-activities') {
        const { data: following } = await supabase
            .from('friendships')
            .select('addressee_id')
            .eq('requester_id', currentUser.id)
            .eq('status', 'accepted');
        followingIds = (following || []).map(f => f.addressee_id);
    }

    return activities.map(activity => ({
        ...activity,
        profileMap,
        followingIds
    }));
}

/**
 * Load more activities (infinite scroll)
 */
async function loadMoreActivities() {
    if (isLoadingMore || !hasMoreActivities || !followingIdsCache) return;

    isLoadingMore = true;
    const loader = document.getElementById('activity-feed-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        const activities = await fetchActivities(followingIdsCache);

        if (activities.length === 0) {
            hasMoreActivities = false;
            if (loader) loader.classList.add('hidden');
            isLoadingMore = false;
            return;
        }

        const container = document.getElementById('activity-feed');
        if (container) {
            const newHtml = activities.map(activity => renderActivityCard(activity)).join('');
            container.insertAdjacentHTML('beforeend', newHtml);

            // Match-Medien für neu gerenderte Matches laden
            loadMatchMediaForActivities(activities);

            // Kommentar-Anzahlen für Matches laden
            loadCommentCountsForMatches(activities);
        }

        // Prüfen ob mehr Aktivitäten vorhanden sind
        // Wir haben mehr falls Cache Elemente hat ODER eine volle Seite zurückgegeben wurde (DB könnte mehr haben)
        hasMoreActivities = pendingActivitiesCache.length > 0 || activities.length >= ACTIVITIES_PER_PAGE;

    } catch (error) {
        console.error('[ActivityFeed] Error loading more activities:', error);
    } finally {
        if (loader) loader.classList.add('hidden');
        isLoadingMore = false;
    }
}

/**
 * Render a single activity card
 */
function renderActivityCard(activity) {
    if (activity.activityType === 'doubles') {
        return renderDoublesActivityCard(activity, activity.profileMap, activity.followingIds);
    } else if (activity.activityType === 'singles') {
        return renderSinglesActivityCard(activity, activity.profileMap, activity.followingIds);
    } else if (activity.activityType === 'club_join') {
        return renderClubJoinCard(activity);
    } else if (activity.activityType === 'club_leave') {
        return renderClubLeaveCard(activity);
    } else if (activity.activityType === 'rank_up') {
        return renderRankUpCard(activity);
    } else if (activity.activityType === 'club_ranking_change') {
        return renderClubRankingChangeCard(activity);
    } else if (activity.activityType === 'global_ranking_change') {
        return renderGlobalRankingChangeCard(activity);
    } else if (activity.activityType === 'club_doubles_ranking_change') {
        return renderClubDoublesRankingChangeCard(activity);
    } else if (activity.activityType === 'global_doubles_ranking_change') {
        return renderGlobalDoublesRankingChangeCard(activity);
    } else if (activity.activityType === 'post') {
        return renderPostCard(activity, activity.profileMap);
    } else if (activity.activityType === 'poll') {
        return renderPollCard(activity, activity.profileMap);
    } else if (activity.activityType === 'training_summary') {
        return renderTrainingSummaryCard(activity, activity.profileMap);
    }
    return ''; // Unbekannter Aktivitätstyp
}

/**
 * Load likes data for a batch of activities
 */
async function loadLikesForActivities(activities) {
    if (!activities || activities.length === 0) return;

    try {
        const activityIds = activities.map(a => a.id);
        const activityTypes = activities.map(a => {
            // Match-Typen zu Aktivitätstypen für neues Schema konvertieren
            const type = a.activityType || a.matchType;
            if (type === 'singles') return 'singles_match';
            if (type === 'doubles') return 'doubles_match';
            // Für andere Typen direkt verwenden
            return type || 'post';
        });

        const { data, error } = await supabase.rpc('get_activity_likes_batch', {
            p_activity_ids: activityIds,
            p_activity_types: activityTypes
        });

        if (error) {
            console.warn('[ActivityFeed] Batch likes function not available:', error.message);
            await loadLikesFallback(activities);
            return;
        }

        (data || []).forEach(like => {
            const key = `${like.activity_type}-${like.activity_id}`;
            likesDataCache[key] = {
                likeCount: like.like_count || 0,
                isLiked: like.is_liked_by_me || false,
                recentLikers: like.recent_likers || []
            };

            // UI sofort aktualisieren
            const countEl = document.querySelector(`[data-like-count="${key}"]`);
            const likeBtn = document.querySelector(`[data-like-btn="${key}"]`);
            if (countEl) {
                countEl.textContent = like.like_count > 0 ? like.like_count : '';
            }
            if (likeBtn && like.is_liked_by_me) {
                const icon = likeBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                }
                likeBtn.classList.remove('text-gray-400');
                likeBtn.classList.add('text-blue-500');
            }
        });

    } catch (error) {
        console.error('[ActivityFeed] Error loading likes:', error);
        await loadLikesFallback(activities);
    }
}

/**
 * Fallback method to load likes individually
 */
async function loadLikesFallback(activities) {
    for (const activity of activities) {
        // Match-Typen zu Aktivitätstypen für neues Schema konvertieren
        let activityType = activity.activityType || activity.matchType;
        if (activityType === 'singles') activityType = 'singles_match';
        if (activityType === 'doubles') activityType = 'doubles_match';

        const key = `${activityType}-${activity.id}`;

        try {
            const { count } = await supabase
                .from('activity_likes')
                .select('id', { count: 'exact', head: true })
                .eq('activity_id', activity.id)
                .eq('activity_type', activityType);

            const { data: userLike } = await supabase
                .from('activity_likes')
                .select('id')
                .eq('activity_id', activity.id)
                .eq('activity_type', activityType)
                .eq('user_id', currentUser.id)
                .maybeSingle();

            likesDataCache[key] = {
                likeCount: count || 0,
                isLiked: !!userLike,
                recentLikers: []
            };

            // UI sofort aktualisieren
            const countEl = document.querySelector(`[data-like-count="${key}"]`);
            const likeBtn = document.querySelector(`[data-like-btn="${key}"]`);
            if (countEl) {
                countEl.textContent = count > 0 ? count : '';
            }
            if (likeBtn && userLike) {
                const icon = likeBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                }
                likeBtn.classList.remove('text-gray-400');
                likeBtn.classList.add('text-blue-500');
            }
        } catch (e) {
            likesDataCache[key] = { likeCount: 0, isLiked: false, recentLikers: [] };
        }
    }
}

/**
 * Load comment counts for match activities
 * Matches don't have a comments_count column so we need to fetch it separately
 */
async function loadCommentCountsForMatches(activities) {
    if (!activities || activities.length === 0) return;

    // Nur Match-Aktivitäten filtern
    const matchActivities = activities.filter(a =>
        a.activityType === 'singles' || a.activityType === 'doubles' ||
        a.matchType === 'singles' || a.matchType === 'doubles'
    );

    if (matchActivities.length === 0) return;

    try {
        // Abfragen für jeden Match-Typ erstellen
        const singlesIds = matchActivities
            .filter(a => a.activityType === 'singles' || a.matchType === 'singles')
            .map(a => a.id);
        const doublesIds = matchActivities
            .filter(a => a.activityType === 'doubles' || a.matchType === 'doubles')
            .map(a => a.id);

        // Zuerst Batch-Funktion versuchen
        const { data, error } = await supabase.rpc('get_activity_comment_counts_batch', {
            p_activity_ids: matchActivities.map(a => a.id),
            p_activity_types: matchActivities.map(a => {
                if (a.activityType === 'singles' || a.matchType === 'singles') return 'singles_match';
                return 'doubles_match';
            })
        });

        if (!error && data) {
            data.forEach(item => {
                const key = `${item.activity_type}-${item.activity_id}`;
                const countEl = document.querySelector(`[data-comment-count="${key}"]`);
                if (countEl) {
                    countEl.textContent = item.comment_count || 0;
                }
            });
            return;
        }

        // Fallback: Zähler einzeln laden
        for (const match of matchActivities) {
            const activityType = match.activityType === 'singles' || match.matchType === 'singles'
                ? 'singles_match' : 'doubles_match';
            const key = `${activityType}-${match.id}`;

            const { count } = await supabase
                .from('activity_comments')
                .select('id', { count: 'exact', head: true })
                .eq('activity_id', match.id)
                .eq('activity_type', activityType);

            const countEl = document.querySelector(`[data-comment-count="${key}"]`);
            if (countEl) {
                countEl.textContent = count || 0;
            }
        }
    } catch (error) {
        console.error('[ActivityFeed] Error loading comment counts:', error);
    }
}

/**
 * Toggle like on an activity
 */
async function toggleActivityLike(activityId, activityType) {
    // Legacy-Match-Typen zu neuem Schema konvertieren
    if (activityType === 'singles') activityType = 'singles_match';
    if (activityType === 'doubles') activityType = 'doubles_match';

    const key = `${activityType}-${activityId}`;
    const likeBtn = document.querySelector(`[data-like-btn="${key}"]`);
    const countEl = document.querySelector(`[data-like-count="${key}"]`);

    if (!likeBtn) return;

    const currentData = likesDataCache[key] || { likeCount: 0, isLiked: false };
    const newIsLiked = !currentData.isLiked;
    const newCount = newIsLiked ? currentData.likeCount + 1 : Math.max(0, currentData.likeCount - 1);

    updateLikeUI(likeBtn, countEl, newIsLiked, newCount);
    likesDataCache[key] = { ...currentData, isLiked: newIsLiked, likeCount: newCount };

    try {
        const { data, error } = await supabase.rpc('toggle_activity_like', {
            p_activity_id: activityId,
            p_activity_type: activityType
        });

        if (error) {
            // Prüfen ob Benutzer eigene Aktivität liken wollte
            if (error.message && error.message.includes('cannot like your own activity')) {
                // UI-Änderungen rückgängig machen
                updateLikeUI(likeBtn, countEl, currentData.isLiked, currentData.likeCount);
                likesDataCache[key] = currentData;
                // Benutzerfreundliche Nachricht anzeigen
                const activityName = activityType === 'singles_match' ? 'dein Spiel' :
                                   activityType === 'doubles_match' ? 'dein Doppel' :
                                   activityType === 'post' ? 'deinen Beitrag' :
                                   activityType === 'poll' ? 'deine Umfrage' :
                                   'deine Aktivität';
                alert(`Du kannst ${activityName} nicht selbst liken.`);
                return;
            }
            console.warn('[ActivityFeed] Toggle RPC not available:', error.message);
            await toggleLikeFallback(activityId, activityType, newIsLiked, key);
        } else if (data) {
            likesDataCache[key] = {
                ...currentData,
                isLiked: data.is_liked,
                likeCount: data.like_count
            };
            updateLikeUI(likeBtn, countEl, data.is_liked, data.like_count);
        }

    } catch (error) {
        console.error('[ActivityFeed] Error toggling like:', error);
        // Prüfen ob es der "eigene Aktivität"-Fehler ist
        if (error.message && error.message.includes('cannot like your own activity')) {
            updateLikeUI(likeBtn, countEl, currentData.isLiked, currentData.likeCount);
            likesDataCache[key] = currentData;
            const activityName = activityType === 'singles_match' ? 'dein Spiel' :
                               activityType === 'doubles_match' ? 'dein Doppel' :
                               activityType === 'post' ? 'deinen Beitrag' :
                               activityType === 'poll' ? 'deine Umfrage' :
                               'deine Aktivität';
            alert(`Du kannst ${activityName} nicht selbst liken.`);
        } else {
            updateLikeUI(likeBtn, countEl, currentData.isLiked, currentData.likeCount);
            likesDataCache[key] = currentData;
        }
    }
}

/**
 * Fallback method to toggle like directly
 */
async function toggleLikeFallback(activityId, activityType, shouldLike, key) {
    try {
        if (shouldLike) {
            await supabase
                .from('activity_likes')
                .insert({
                    activity_id: activityId,
                    activity_type: activityType,
                    user_id: currentUser.id
                });
        } else {
            await supabase
                .from('activity_likes')
                .delete()
                .eq('activity_id', activityId)
                .eq('activity_type', activityType)
                .eq('user_id', currentUser.id);
        }
    } catch (e) {
        console.error('[ActivityFeed] Fallback toggle failed:', e);
    }
}

/**
 * Update the like button UI
 */
function updateLikeUI(likeBtn, countEl, isLiked, count) {
    if (likeBtn) {
        const icon = likeBtn.querySelector('i');
        if (isLiked) {
            likeBtn.classList.add('text-blue-500');
            likeBtn.classList.remove('text-gray-400', 'hover:text-blue-500');
            if (icon) {
                icon.classList.remove('far');
                icon.classList.add('fas');
            }
        } else {
            likeBtn.classList.remove('text-blue-500');
            likeBtn.classList.add('text-gray-400', 'hover:text-blue-500');
            if (icon) {
                icon.classList.remove('fas');
                icon.classList.add('far');
            }
        }
    }

    if (countEl) {
        countEl.textContent = count > 0 ? count : '';
    }
}

/**
 * Get like data for a specific activity
 */
function getLikeData(matchId, matchType) {
    // Match-Typ zu Aktivitätstyp für neues Schema konvertieren
    const activityType = matchType === 'singles' ? 'singles_match' : 'doubles_match';
    const key = `${activityType}-${matchId}`;
    return likesDataCache[key] || { likeCount: 0, isLiked: false, recentLikers: [] };
}

/**
 * Render the like button HTML (for matches)
 */
function renderLikeButton(matchId, matchType, activity = null) {
    // Match-Typ zu Aktivitätstyp für neues Schema konvertieren
    const activityType = matchType === 'singles' ? 'singles_match' : 'doubles_match';
    const key = `${activityType}-${matchId}`;
    const likeData = getLikeData(matchId, matchType);
    const isLiked = likeData.isLiked;
    const count = likeData.likeCount;

    // Prüfen ob dies eigene Aktivität des Benutzers ist
    const isOwn = activity ? isOwnActivity(activity, matchType) : false;

    if (isOwn) {
        // "Likes anzeigen"-Button für eigene Aktivitäten rendern
        return `
            <button
                data-like-btn="${key}"
                onclick="event.stopPropagation(); showLikesModal('${matchId}', '${activityType}')"
                class="flex items-center gap-1 text-gray-600 hover:text-blue-500 transition-colors"
                title="Likes anzeigen"
            >
                <i class="far fa-thumbs-up"></i>
                <span data-like-count="${key}" class="text-xs font-medium">${count || 0}</span>
            </button>
        `;
    }

    // Normaler Like-Button für Aktivitäten anderer Benutzer
    const iconClass = isLiked ? 'fas' : 'far';
    const colorClass = isLiked ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500';

    return `
        <button
            data-like-btn="${key}"
            onclick="event.stopPropagation(); toggleActivityLike('${matchId}', '${matchType}')"
            class="flex items-center gap-1 ${colorClass} transition-colors"
            title="${t('dashboard.activityFeed.giveKudos')}"
        >
            <i class="${iconClass} fa-thumbs-up"></i>
            <span data-like-count="${key}" class="text-xs font-medium">${count || 0}</span>
        </button>
    `;
}

/**
 * Render generic like button for posts/polls/events
 */
function renderGenericLikeButton(activityId, activityType, activity, count = 0) {
    const key = `${activityType}-${activityId}`;

    // Anzahl aus Cache abrufen falls verfügbar
    const cachedData = likesDataCache[key];
    const displayCount = cachedData ? cachedData.likeCount : count;
    const isLiked = cachedData ? cachedData.isLiked : false;

    // Prüfen ob dies eigene Aktivität des Benutzers ist
    const isOwn = activity ? isOwnActivity(activity, activityType) : false;

    if (isOwn) {
        // "Likes anzeigen"-Button für eigene Aktivitäten rendern
        return `
            <button
                onclick="showLikesModal('${activityId}', '${activityType}')"
                class="flex items-center gap-2 text-gray-600 hover:text-blue-500 transition"
                data-like-btn="${key}"
                title="Likes anzeigen"
            >
                <i class="${isLiked ? 'fas' : 'far'} fa-thumbs-up"></i>
                <span class="text-sm" data-like-count="${key}">${displayCount || 0}</span>
            </button>
        `;
    }

    // Normaler Like-Button für Aktivitäten anderer Benutzer
    return `
        <button
            onclick="toggleActivityLike('${activityId}', '${activityType}')"
            class="flex items-center gap-2 ${isLiked ? 'text-blue-500' : 'text-gray-600'} hover:text-blue-500 transition"
            data-like-btn="${key}"
            title="${t('dashboard.activityFeed.giveKudos')}"
        >
            <i class="${isLiked ? 'fas' : 'far'} fa-thumbs-up"></i>
            <span class="text-sm" data-like-count="${key}">${displayCount || 0}</span>
        </button>
    `;
}

/**
 * Render match media section placeholder
 * Will be populated asynchronously
 */
function renderMatchMediaPlaceholder(matchId, matchType) {
    return `<div id="media-${matchType}-${matchId}" class="mt-3" data-match-id="${matchId}" data-match-type="${matchType}"></div>`;
}

/**
 * Load and inject match media into the DOM - Strava style horizontal carousel
 */
async function injectMatchMedia(matchId, matchType) {
    const container = document.getElementById(`media-${matchType}-${matchId}`);
    if (!container) return;

    try {
        const media = await loadMatchMedia(matchId, matchType);

        if (!media || media.length === 0) {
            // Keine Medien - nichts oder Upload-Button für Teilnehmer anzeigen
            const isParticipant = await checkIfParticipant(matchId, matchType);
            if (isParticipant) {
                container.innerHTML = `
                    <div class="px-4 py-2">
                        <button
                            onclick="openMediaUpload('${matchId}', '${matchType}')"
                            class="text-sm text-gray-500 hover:text-indigo-600 transition flex items-center gap-1"
                        >
                            <i class="fas fa-camera"></i>
                            Foto/Video hinzufügen
                        </button>
                    </div>
                `;
            }
            return;
        }

        const isParticipant = await checkIfParticipant(matchId, matchType);

        // Horizontale Karussell-Elemente erstellen
        let carouselItems = '';

        media.forEach((item, index) => {
            const { data: { publicUrl } } = supabase.storage
                .from('match-media')
                .getPublicUrl(item.file_path);

            // Löschen-Button für Teilnehmer
            const deleteButton = isParticipant ? `
                <button
                    onclick="event.stopPropagation(); deleteMatchMedia('${item.id}', '${item.file_path}', '${matchId}', '${matchType}')"
                    class="absolute top-2 right-2 w-8 h-8 bg-black/60 hover:bg-red-600 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Löschen"
                >
                    <i class="fas fa-trash text-sm"></i>
                </button>
            ` : '';

            if (item.file_type === 'video') {
                // Video-Element mit Play-Button-Overlay, öffnet Vollbild-Galerie bei Klick
                carouselItems += `
                    <div class="flex-shrink-0 ${media.length === 1 ? 'w-full' : 'w-[85%] max-w-[400px]'} snap-start group">
                        <div class="relative bg-black rounded-lg overflow-hidden aspect-[4/3] cursor-pointer" onclick="openMediaGalleryWithContext('${matchId}', '${matchType}', ${index})">
                            ${deleteButton}
                            <video
                                id="video-${matchId}-${index}"
                                class="w-full h-full object-contain pointer-events-none"
                                playsinline
                                preload="metadata"
                                muted
                            >
                                <source src="${publicUrl}#t=0.5" type="${item.mime_type || 'video/mp4'}">
                            </video>
                            <div class="play-overlay absolute inset-0 flex items-center justify-center bg-black/30">
                                <div class="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                                    <i class="fas fa-play text-gray-800 text-xl ml-1"></i>
                                </div>
                            </div>
                            <div class="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-white text-xs">
                                <i class="fas fa-video mr-1"></i>Video
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Foto-Element - klickbar zum Öffnen der Galerie
                carouselItems += `
                    <div class="flex-shrink-0 ${media.length === 1 ? 'w-full' : 'w-[85%] max-w-[400px]'} snap-start group">
                        <div class="relative bg-gray-100 rounded-lg overflow-hidden aspect-[4/3] cursor-pointer" onclick="openMediaGalleryWithContext('${matchId}', '${matchType}', ${index})">
                            ${deleteButton}
                            <img src="${publicUrl}" alt="Match Foto" class="w-full h-full object-cover">
                        </div>
                    </div>
                `;
            }
        });

        // Zähler-Anzeige für mehrere Elemente
        const counterHTML = media.length > 1 ? `
            <div class="absolute top-3 right-3 px-2 py-1 bg-black/70 rounded-full text-white text-xs font-medium">
                1/${media.length}
            </div>
        ` : '';

        container.innerHTML = `
            <div class="relative">
                <!-- Horizontal Scroll Container -->
                <div class="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 ${media.length === 1 ? '' : 'px-4'}"
                     id="carousel-${matchType}-${matchId}"
                     onscroll="updateCarouselCounter(this, '${matchType}', '${matchId}', ${media.length})">
                    ${carouselItems}
                </div>

                ${counterHTML ? `<div id="counter-${matchType}-${matchId}" class="absolute top-3 right-3 px-2 py-1 bg-black/70 rounded-full text-white text-xs font-medium">1/${media.length}</div>` : ''}

                ${isParticipant && media.length < 5 ? `
                    <button
                        onclick="openMediaUpload('${matchId}', '${matchType}')"
                        class="absolute bottom-4 right-4 w-8 h-8 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center text-gray-700 hover:text-indigo-600 transition"
                        title="Mehr hinzufügen"
                    >
                        <i class="fas fa-plus text-sm"></i>
                    </button>
                ` : ''}
            </div>
        `;

    } catch (error) {
        // Stillschweigend fehlschlagen - Match-Media-Funktionen evtl. noch nicht eingerichtet
    }
}

// Cache für Match-Media-Funktionsverfügbarkeit
let matchMediaFunctionsChecked = false;
let matchMediaFunctionsAvailable = false;

/**
 * Reset match media cache (called after successful upload)
 */
function resetMatchMediaCache() {
    matchMediaFunctionsChecked = false;
    matchMediaFunctionsAvailable = false;
}
window.resetMatchMediaCache = resetMatchMediaCache;

/**
 * Check if match media SQL functions are available (one-time check)
 */
async function checkMatchMediaAvailability() {
    if (matchMediaFunctionsChecked) return matchMediaFunctionsAvailable;

    try {
        // Prüfen ob Tabelle existiert durch Abfrage
        const { error } = await supabase
            .from('match_media')
            .select('id')
            .limit(1);

        matchMediaFunctionsChecked = true;
        matchMediaFunctionsAvailable = !error;
        return matchMediaFunctionsAvailable;
    } catch {
        matchMediaFunctionsChecked = true;
        matchMediaFunctionsAvailable = false;
        return false;
    }
}

/**
 * Check if current user is a participant in the match
 * Works with or without the RPC function - falls back to direct table query
 */
async function checkIfParticipant(matchId, matchType) {
    if (!currentUser?.id) return false;

    try {
        // Zuerst RPC versuchen falls verfügbar
        if (!matchMediaFunctionsChecked || matchMediaFunctionsAvailable) {
            const { data, error } = await supabase.rpc('can_upload_match_media', {
                p_match_id: String(matchId),
                p_match_type: matchType
            });

            if (!error) {
                matchMediaFunctionsChecked = true;
                matchMediaFunctionsAvailable = true;
                return data === true;
            }
        }

        // Fallback: Direkt gegen Match-Tabellen prüfen
        if (matchType === 'singles') {
            const { data: match } = await supabase
                .from('matches')
                .select('player_a_id, player_b_id')
                .eq('id', matchId)
                .single();

            if (match) {
                return match.player_a_id === currentUser.id || match.player_b_id === currentUser.id;
            }
        } else if (matchType === 'doubles') {
            const { data: match } = await supabase
                .from('doubles_matches')
                .select('team_a_player1_id, team_a_player2_id, team_b_player1_id, team_b_player2_id')
                .eq('id', matchId)
                .single();

            if (match) {
                return [
                    match.team_a_player1_id,
                    match.team_a_player2_id,
                    match.team_b_player1_id,
                    match.team_b_player2_id
                ].includes(currentUser.id);
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking participant status:', error);
        return false;
    }
}

/**
 * Render a singles match activity card - Strava style
 */
function renderSinglesActivityCard(match, profileMap, followingIds) {
    // Gelöschte Spieler erkennen (NULL-IDs)
    const playerADeleted = match.player_a_id === null;
    const playerBDeleted = match.player_b_id === null;
    const playerA = playerADeleted ? {} : (profileMap[match.player_a_id] || {});
    const playerB = playerBDeleted ? {} : (profileMap[match.player_b_id] || {});

    const isWinnerA = match.winner_id === match.player_a_id;
    const winnerProfile = isWinnerA ? playerA : playerB;
    const loserProfile = isWinnerA ? playerB : playerA;
    const winnerDeleted = isWinnerA ? playerADeleted : playerBDeleted;
    const loserDeleted = isWinnerA ? playerBDeleted : playerADeleted;

    const winnerName = getDisplayName(winnerProfile, winnerDeleted);
    const loserName = getDisplayName(loserProfile, loserDeleted);

    const winnerAvatar = winnerProfile.avatar_url || DEFAULT_AVATAR;
    const loserAvatar = loserProfile.avatar_url || DEFAULT_AVATAR;

    // Satzstand berechnen
    let winnerSets = 0;
    let loserSets = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.playerA ?? set.teamA ?? 0;
        const scoreB = set.playerB ?? set.teamB ?? 0;
        if (match.winner_id === match.player_a_id) {
            if (scoreA > scoreB) winnerSets++;
            else if (scoreB > scoreA) loserSets++;
        } else {
            if (scoreB > scoreA) winnerSets++;
            else if (scoreA > scoreB) loserSets++;
        }
    });

    const setScore = `${winnerSets}:${loserSets}`;

    // Zeit formatieren
    const matchDate = new Date(match.played_at || match.created_at);
    const dateStr = formatRelativeDate(matchDate);
    const timeStr = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const loserId = match.winner_id === match.player_a_id ? match.player_b_id : match.player_a_id;

    // Elo changes
    const winnerEloChange = Math.abs(match.winner_elo_change || 0);
    const loserEloChange = Math.abs(match.loser_elo_change || 0);

    // Mode labels
    const modeLabels = {
        'single-set': '1 Satz',
        'best-of-3': 'Best of 3',
        'best-of-5': 'Best of 5',
        'best-of-7': 'Best of 7',
        'pro-set': 'Pro-Set',
        'timed': 'Zeit',
        'fast4': 'Fast4'
    };
    const modeDisplay = modeLabels[match.match_mode] || match.match_mode || '';

    // Match-Daten für Details-Modal speichern
    storeMatchForDetails(match, 'singles', profileMap);

    return `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition">
            <!-- Header: Avatar, Name, Time, Menu -->
            <div class="p-4 pb-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <a href="/profile.html?id=${match.winner_id}" class="flex-shrink-0">
                            <img src="${winnerAvatar}" alt="${winnerName}"
                                 class="w-10 h-10 rounded-full object-cover"
                                 onerror="this.src='${DEFAULT_AVATAR}'">
                        </a>
                        <div>
                            <a href="/profile.html?id=${match.winner_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition text-sm">
                                ${winnerName}
                            </a>
                            <p class="text-xs text-gray-500">${dateStr} um ${timeStr}</p>
                        </div>
                    </div>
                    <button onclick="showMatchDetails('${match.id}', 'singles')" class="text-gray-400 hover:text-gray-600 p-1">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Match Title - Clickable -->
            <div class="px-4 pb-3 cursor-pointer" onclick="showMatchDetails('${match.id}', 'singles')">
                <h3 class="font-bold text-gray-900 text-lg">
                    ${winnerName} vs ${loserName}
                </h3>
                <p class="text-sm text-gray-600 mt-1">
                    <span class="font-semibold text-green-600">${winnerName}</span> gewinnt ${setScore}
                    ${match.handicap_used ? `<span class="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Handicap${match.handicap?.points ? ` +${match.handicap.points}` : ''}</span>` : ''}
                </p>
            </div>

            <!-- Stats Row - simplified, details in modal -->
            <div class="px-4 pb-3 flex items-center gap-6">
                <div>
                    <p class="text-xs text-gray-500">Ergebnis</p>
                    <p class="font-bold text-gray-900">${setScore}</p>
                </div>
                ${modeDisplay ? `
                <div>
                    <p class="text-xs text-gray-500">Modus</p>
                    <p class="font-semibold text-gray-700 text-sm">${modeDisplay}</p>
                </div>
                ` : ''}
            </div>

            <!-- Media Carousel -->
            ${renderMatchMediaPlaceholder(match.id, 'singles')}

            <!-- Elo Changes -->
            <div class="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-sm">
                <div class="flex items-center gap-1">
                    <img src="${winnerAvatar}" class="w-5 h-5 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                    <span class="text-green-600 font-medium">+${winnerEloChange}</span>
                </div>
                <div class="flex items-center gap-1">
                    <img src="${loserAvatar}" class="w-5 h-5 rounded-full" onerror="this.src='${DEFAULT_AVATAR}'">
                    <span class="text-red-600 font-medium">-${loserEloChange}</span>
                </div>
            </div>

            <!-- Actions: Like, Comment, Details -->
            <div class="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    ${renderLikeButton(match.id, 'singles', match)}
                    <button
                        onclick="openComments('${match.id}', 'singles_match')"
                        class="flex items-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        title="Kommentieren"
                    >
                        <i class="far fa-comment"></i>
                        <span data-comment-count="singles_match-${match.id}" class="text-xs font-medium">0</span>
                    </button>
                </div>
                <button onclick="showMatchDetails('${match.id}', 'singles')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
                    <i class="fas fa-chart-bar"></i>
                    Details
                </button>
            </div>
        </div>
    `;
}

/**
 * Store match data for details modal access
 */
function storeMatchForDetails(match, matchType, profileMap) {
    if (!window.matchHistoryData) {
        window.matchHistoryData = { matches: [], doublesMatches: [], profileMap: {} };
    }

    if (matchType === 'singles') {
        const existing = window.matchHistoryData.matches.find(m => m.id === match.id);
        if (!existing) {
            window.matchHistoryData.matches.push(match);
        }
    } else {
        const existing = window.matchHistoryData.doublesMatches.find(m => m.id === match.id);
        if (!existing) {
            window.matchHistoryData.doublesMatches.push(match);
        }
    }

    // Profil-Maps zusammenführen
    Object.assign(window.matchHistoryData.profileMap, profileMap);
}

/**
 * Render a doubles match activity card - Strava style
 */
function renderDoublesActivityCard(match, profileMap, followingIds) {
    // Gelöschte Spieler erkennen (NULL-IDs)
    const teamAP1Deleted = match.team_a_player1_id === null;
    const teamAP2Deleted = match.team_a_player2_id === null;
    const teamBP1Deleted = match.team_b_player1_id === null;
    const teamBP2Deleted = match.team_b_player2_id === null;

    const teamAPlayer1 = teamAP1Deleted ? {} : (profileMap[match.team_a_player1_id] || {});
    const teamAPlayer2 = teamAP2Deleted ? {} : (profileMap[match.team_a_player2_id] || {});
    const teamBPlayer1 = teamBP1Deleted ? {} : (profileMap[match.team_b_player1_id] || {});
    const teamBPlayer2 = teamBP2Deleted ? {} : (profileMap[match.team_b_player2_id] || {});

    const isTeamAWinner = match.winning_team === 'A';
    const winnerTeam = isTeamAWinner ? [teamAPlayer1, teamAPlayer2] : [teamBPlayer1, teamBPlayer2];
    const loserTeam = isTeamAWinner ? [teamBPlayer1, teamBPlayer2] : [teamAPlayer1, teamAPlayer2];
    const winnerDeleted = isTeamAWinner ? [teamAP1Deleted, teamAP2Deleted] : [teamBP1Deleted, teamBP2Deleted];
    const loserDeleted = isTeamAWinner ? [teamBP1Deleted, teamBP2Deleted] : [teamAP1Deleted, teamAP2Deleted];

    const winnerNames = winnerTeam.map((p, i) => getDisplayName(p, winnerDeleted[i])).join(' & ');
    const loserNames = loserTeam.map((p, i) => getDisplayName(p, loserDeleted[i])).join(' & ');

    // Satzstand berechnen
    let winnerSets = 0;
    let loserSets = 0;
    const sets = match.sets || [];
    sets.forEach(set => {
        const scoreA = set.teamA ?? set.playerA ?? 0;
        const scoreB = set.teamB ?? set.playerB ?? 0;
        if (isTeamAWinner) {
            if (scoreA > scoreB) winnerSets++;
            else if (scoreB > scoreA) loserSets++;
        } else {
            if (scoreB > scoreA) winnerSets++;
            else if (scoreA > scoreB) loserSets++;
        }
    });

    const setScore = `${winnerSets}:${loserSets}`;

    const matchDate = new Date(match.played_at || match.created_at);
    const dateStr = formatRelativeDate(matchDate);
    const timeStr = matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Mode labels
    const modeLabels = {
        'single-set': '1 Satz',
        'best-of-3': 'Best of 3',
        'best-of-5': 'Best of 5',
        'best-of-7': 'Best of 7',
        'pro-set': 'Pro-Set',
        'timed': 'Zeit',
        'fast4': 'Fast4'
    };
    const modeDisplay = modeLabels[match.match_mode] || match.match_mode || '';

    // Match-Daten für Details-Modal speichern
    storeMatchForDetails(match, 'doubles', profileMap);

    return `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition">
            <!-- Header: Team Avatars, Time, Menu -->
            <div class="p-4 pb-2">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="flex -space-x-2">
                            <img src="${winnerTeam[0]?.avatar_url || DEFAULT_AVATAR}" alt=""
                                 class="w-9 h-9 rounded-full object-cover border-2 border-white"
                                 onerror="this.src='${DEFAULT_AVATAR}'">
                            <img src="${winnerTeam[1]?.avatar_url || DEFAULT_AVATAR}" alt=""
                                 class="w-9 h-9 rounded-full object-cover border-2 border-white"
                                 onerror="this.src='${DEFAULT_AVATAR}'">
                        </div>
                        <div>
                            <p class="font-semibold text-gray-900 text-sm">${winnerNames}</p>
                            <p class="text-xs text-gray-500">${dateStr} um ${timeStr}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                            <i class="fas fa-users mr-1"></i>Doppel
                        </span>
                        <button onclick="showMatchDetails('${match.id}', 'doubles')" class="text-gray-400 hover:text-gray-600 p-1">
                            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Match Title - Clickable -->
            <div class="px-4 pb-3 cursor-pointer" onclick="showMatchDetails('${match.id}', 'doubles')">
                <h3 class="font-bold text-gray-900 text-lg">
                    Doppel: ${winnerNames} vs ${loserNames}
                </h3>
                <p class="text-sm text-gray-600 mt-1">
                    <span class="font-semibold text-green-600">${winnerNames}</span> gewinnen ${setScore}
                    ${match.handicap_used ? `<span class="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Handicap${match.handicap?.points ? ` +${match.handicap.points}` : ''}</span>` : ''}
                </p>
            </div>

            <!-- Stats Row - simplified, details in modal -->
            <div class="px-4 pb-3 flex items-center gap-6">
                <div>
                    <p class="text-xs text-gray-500">Ergebnis</p>
                    <p class="font-bold text-gray-900">${setScore}</p>
                </div>
                ${modeDisplay ? `
                <div>
                    <p class="text-xs text-gray-500">Modus</p>
                    <p class="font-semibold text-gray-700 text-sm">${modeDisplay}</p>
                </div>
                ` : ''}
            </div>

            <!-- Media Carousel -->
            ${renderMatchMediaPlaceholder(match.id, 'doubles')}

            <!-- Teams Summary -->
            <div class="px-4 py-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-sm">
                <div class="flex items-center gap-2">
                    <div class="flex -space-x-1">
                        <img src="${winnerTeam[0]?.avatar_url || DEFAULT_AVATAR}" class="w-5 h-5 rounded-full border border-white" onerror="this.src='${DEFAULT_AVATAR}'">
                        <img src="${winnerTeam[1]?.avatar_url || DEFAULT_AVATAR}" class="w-5 h-5 rounded-full border border-white" onerror="this.src='${DEFAULT_AVATAR}'">
                    </div>
                    <span class="text-green-600 font-medium">Gewinner</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-red-600 font-medium">Verlierer</span>
                    <div class="flex -space-x-1">
                        <img src="${loserTeam[0]?.avatar_url || DEFAULT_AVATAR}" class="w-5 h-5 rounded-full border border-white opacity-75" onerror="this.src='${DEFAULT_AVATAR}'">
                        <img src="${loserTeam[1]?.avatar_url || DEFAULT_AVATAR}" class="w-5 h-5 rounded-full border border-white opacity-75" onerror="this.src='${DEFAULT_AVATAR}'">
                    </div>
                </div>
            </div>

            <!-- Actions: Like, Comment, Details -->
            <div class="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    ${renderLikeButton(match.id, 'doubles', match)}
                    <button
                        onclick="openComments('${match.id}', 'doubles_match')"
                        class="flex items-center gap-1 text-gray-600 hover:text-indigo-600 transition-colors"
                        title="Kommentieren"
                    >
                        <i class="far fa-comment"></i>
                        <span data-comment-count="doubles_match-${match.id}" class="text-xs font-medium">0</span>
                    </button>
                </div>
                <button onclick="showMatchDetails('${match.id}', 'doubles')" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1">
                    <i class="fas fa-chart-bar"></i>
                    Details
                </button>
            </div>
        </div>
    `;
}

/**
 * Get display name for a player
 */
function getDisplayName(profile, isDeleted = false) {
    if (isDeleted) return 'Gelöschter Spieler';
    if (!profile) return 'Unbekannt';
    if (profile.display_name) return profile.display_name;
    if (profile.first_name && profile.last_name) {
        return `${profile.first_name} ${profile.last_name.charAt(0)}.`;
    }
    if (profile.first_name) return profile.first_name;
    return 'Spieler';
}

/**
 * Render a club join activity card
 */
function renderClubJoinCard(activity) {
    const eventData = activity.event_data || {};
    const displayName = escapeHtml(eventData.display_name || 'Spieler');
    const clubName = escapeHtml(eventData.club_name || 'Unbekannt');
    const avatarUrl = escapeHtml(eventData.avatar_url || DEFAULT_AVATAR);
    const rankName = escapeHtml(eventData.rank_name || 'Rekrut');
    const safeUserId = encodeURIComponent(activity.user_id);

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-blue-100">
            <div class="flex items-start gap-3">
                <a href="/profile.html?id=${safeUserId}" class="flex-shrink-0">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-blue-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <i class="fas fa-building text-blue-600"></i>
                        <a href="/profile.html?id=${safeUserId}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        <span class="text-gray-600 text-sm">ist dem Verein beigetreten</span>
                        <span class="font-semibold text-blue-700">${clubName}</span>
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            ${rankName}
                        </span>
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                    </div>

                    <div class="mt-2 text-sm text-gray-600">
                        <i class="fas fa-handshake text-blue-500 mr-1"></i>
                        Willkommen im Team!
                    </div>

                    <!-- Event Actions -->
                    <div class="flex items-center gap-6 mt-3 pt-3 border-t border-blue-100">
                        ${renderGenericLikeButton(activity.id, 'club_join', activity, activity.likes_count || 0)}
                        <button
                            onclick="openComments('${activity.id}', 'club_join')"
                            class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                        >
                            <i class="far fa-comment"></i>
                            <span class="text-sm" data-comment-count="club_join-${activity.id}">${activity.comments_count || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render a club leave activity card
 */
function renderClubLeaveCard(activity) {
    const eventData = activity.event_data || {};
    const displayName = escapeHtml(eventData.display_name || 'Spieler');
    const clubName = escapeHtml(eventData.club_name || 'Unbekannt');
    const avatarUrl = escapeHtml(eventData.avatar_url || DEFAULT_AVATAR);
    const safeUserId = encodeURIComponent(activity.user_id);

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    return `
        <div class="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-gray-200">
            <div class="flex items-start gap-3">
                <a href="/profile.html?id=${safeUserId}" class="flex-shrink-0">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-gray-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <i class="fas fa-door-open text-gray-500"></i>
                        <a href="/profile.html?id=${safeUserId}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        <span class="text-gray-600 text-sm">hat den Verein verlassen</span>
                        <span class="font-semibold text-gray-700">${clubName}</span>
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render a rank up activity card
 */
function renderRankUpCard(activity) {
    const eventData = activity.event_data || {};
    const displayName = escapeHtml(eventData.display_name || 'Spieler');
    const rankName = escapeHtml(eventData.rank_name || 'Unbekannt');
    const avatarUrl = escapeHtml(eventData.avatar_url || DEFAULT_AVATAR);
    const eloRating = eventData.elo_rating || 0;
    const xp = eventData.xp || 0;
    const safeUserId = encodeURIComponent(activity.user_id);

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Rang-Farbe basierend auf Rang-Namen abrufen
    const rawRankName = eventData.rank_name || 'Unbekannt';
    const rankColors = {
        'Rekrut': 'gray',
        'Bronze': 'amber',
        'Silber': 'gray',
        'Gold': 'yellow',
        'Platin': 'cyan',
        'Champion': 'purple'
    };
    const colorScheme = rankColors[rawRankName] || 'indigo';

    return `
        <div class="bg-gradient-to-r from-${colorScheme}-50 to-${colorScheme}-100 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-${colorScheme}-200">
            <div class="flex items-start gap-3">
                <a href="/profile.html?id=${safeUserId}" class="flex-shrink-0 relative">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-${colorScheme}-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="absolute -bottom-1 -right-1 bg-${colorScheme}-500 rounded-full p-1">
                        <i class="fas fa-arrow-up text-white text-xs"></i>
                    </div>
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                        <i class="fas fa-trophy text-${colorScheme}-600"></i>
                        <a href="/profile.html?id=${safeUserId}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        <span class="text-gray-600 text-sm">erreichte</span>
                        <span class="font-bold text-${colorScheme}-700">${rankName}</span>
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${colorScheme}-200 text-${colorScheme}-800">
                            <i class="fas fa-star mr-1"></i>${rankName}
                        </span>
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                    </div>

                    <div class="mt-2 flex items-center gap-4 text-sm text-gray-600">
                        <span><i class="fas fa-chart-line text-${colorScheme}-500 mr-1"></i>${Math.round(eloRating)} Elo</span>
                        <span><i class="fas fa-star text-${colorScheme}-500 mr-1"></i>${xp} XP</span>
                    </div>

                    <div class="mt-2 text-sm text-gray-600 italic">
                        <i class="fas fa-fire text-orange-500 mr-1"></i>
                        Glückwunsch zum Rangaufstieg!
                    </div>

                    <!-- Event Actions -->
                    <div class="flex items-center gap-6 mt-3 pt-3 border-t border-${colorScheme}-200">
                        ${renderGenericLikeButton(activity.id, 'rank_up', activity, activity.likes_count || 0)}
                        <button
                            onclick="openComments('${activity.id}', 'rank_up')"
                            class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                        >
                            <i class="far fa-comment"></i>
                            <span class="text-sm" data-comment-count="rank_up-${activity.id}">${activity.comments_count || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Hilfsfunktion für Ranking-Übersetzungen mit Fallbacks
// Stellt sicher dass Text angezeigt wird auch wenn i18n noch nicht geladen
function getRankingText(key, params = {}) {
    const fallbacks = {
        // Club ranking
        'clubRanking.enteredTop10': 'ist in die Top 10 aufgestiegen!',
        'clubRanking.enteredPodium': 'ist auf das Podium aufgestiegen!',
        'clubRanking.leftTop10': 'hat die Top 10 verlassen',
        'clubRanking.leftPodium': 'hat das Podium verlassen',
        'clubRanking.movedUp': 'steigt auf',
        'clubRanking.movedDown': 'fällt auf',
        'clubRanking.position': `Platz ${params.position || ''}`,
        'clubRanking.previousHolder': `vorher: ${params.name || ''} (${params.elo || ''} Elo)`,
        // Globales Ranking
        'globalRanking.title': 'Globale Rangliste',
        'globalRanking.position': `Platz ${params.position || ''}`,
        'globalRanking.positionsSingular': '1 Platz',
        'globalRanking.positionsPlural': `${params.count || ''} Plätze`,
        'globalRanking.risen': 'gestiegen',
        'globalRanking.fallen': 'gefallen',
        // Vereins-Doppel-Rangliste
        'clubDoublesRanking.title': 'Doppel-Rangliste',
        'clubDoublesRanking.enteredTop10': 'ist in die Doppel-Top 10 aufgestiegen!',
        'clubDoublesRanking.enteredPodium': 'ist auf das Doppel-Podium aufgestiegen!',
        'clubDoublesRanking.leftTop10': 'hat die Doppel-Top 10 verlassen',
        'clubDoublesRanking.leftPodium': 'hat das Doppel-Podium verlassen',
        'clubDoublesRanking.movedUp': 'steigt auf',
        'clubDoublesRanking.movedDown': 'fällt auf',
        'clubDoublesRanking.position': `Platz ${params.position || ''}`,
        'clubDoublesRanking.previousHolder': `vorher: ${params.name || ''} (${params.elo || ''} Elo)`,
        // Globale Doppel-Rangliste
        'globalDoublesRanking.title': 'Globale Doppel-Rangliste',
        'globalDoublesRanking.position': `Platz ${params.position || ''}`,
        'globalDoublesRanking.positionsSingular': '1 Platz',
        'globalDoublesRanking.positionsPlural': `${params.count || ''} Plätze`,
        'globalDoublesRanking.risen': 'gestiegen',
        'globalDoublesRanking.fallen': 'gefallen'
    };

    const fullKey = `dashboard.activityFeed.events.${key}`;
    const translated = t(fullKey, params);

    // Falls Übersetzung den Schlüssel selbst zurückgibt, Fallback verwenden
    if (translated === fullKey || translated.startsWith('dashboard.activityFeed.events.')) {
        return fallbacks[key] || translated;
    }
    return translated;
}

/**
 * Render a club ranking change activity card (top 10 in club)
 * Only visible to club members
 */
function renderClubRankingChangeCard(activity) {
    const eventData = activity.event_data || {};
    const displayName = eventData.display_name || 'Spieler';
    const avatarUrl = eventData.avatar_url || DEFAULT_AVATAR;
    const newPosition = eventData.new_position || 0;
    const oldPosition = eventData.old_position || 0;
    const eloRating = eventData.elo_rating || 0;
    const direction = eventData.direction || 'same';
    const positionMedal = eventData.position_medal || '';
    const previousHolderName = eventData.previous_holder_name;
    const previousHolderElo = eventData.previous_holder_elo;

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Farbschema basierend auf Position (Gold, Silber, Bronze für Top 3, Blau für 4-10)
    const positionColors = {
        1: { bg: 'yellow', border: 'yellow', text: 'yellow' },
        2: { bg: 'gray', border: 'gray', text: 'gray' },
        3: { bg: 'amber', border: 'amber', text: 'amber' }
    };
    const colors = positionColors[newPosition] || { bg: 'blue', border: 'blue', text: 'blue' };

    // Nachricht basierend auf Bewegung generieren
    let messageHtml = '';
    if (direction === 'up') {
        if (oldPosition > 10) {
            messageHtml = `<span class="text-gray-600 text-sm">${getRankingText('clubRanking.enteredTop10')}</span>`;
        } else if (oldPosition > 3 && newPosition <= 3) {
            messageHtml = `<span class="text-gray-600 text-sm">${getRankingText('clubRanking.enteredPodium')}</span>`;
        } else {
            messageHtml = `<span class="text-gray-600 text-sm">${getRankingText('clubRanking.movedUp')}</span> <span class="font-bold text-${colors.text}-700">${getRankingText('clubRanking.position', { position: newPosition })}</span>`;
        }
    } else if (direction === 'down') {
        if (newPosition > 10) {
            messageHtml = `<span class="text-gray-600 text-sm">${getRankingText('clubRanking.leftTop10')}</span>`;
        } else if (oldPosition <= 3 && newPosition > 3) {
            messageHtml = `<span class="text-gray-600 text-sm">${getRankingText('clubRanking.leftPodium')}</span>`;
        } else {
            messageHtml = `<span class="text-gray-600 text-sm">${getRankingText('clubRanking.movedDown')}</span> <span class="font-bold text-${colors.text}-700">${getRankingText('clubRanking.position', { position: newPosition })}</span>`;
        }
    }

    // Vorheriger Halter-Info (nur für Aufstieg innerhalb Top 10)
    let previousHolderHtml = '';
    if (previousHolderName && direction === 'up' && newPosition <= 10) {
        previousHolderHtml = `
            <div class="mt-2 text-sm text-gray-500 flex items-center gap-1">
                <i class="fas fa-exchange-alt text-${colors.text}-400"></i>
                <span>${getRankingText('clubRanking.previousHolder', { name: previousHolderName, elo: previousHolderElo })}</span>
            </div>
        `;
    }

    // Positions-Badge
    let positionBadge;
    if (newPosition <= 3 && positionMedal) {
        positionBadge = `<span class="text-2xl mr-2">${positionMedal}</span>`;
    } else if (newPosition <= 10) {
        positionBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-${colors.bg}-100 text-${colors.text}-700 font-bold text-sm mr-2">#${newPosition}</span>`;
    } else {
        positionBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold text-sm mr-2">#${newPosition}</span>`;
    }

    return `
        <div class="bg-gradient-to-r from-${colors.bg}-50 to-${colors.bg}-100 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-${colors.border}-200">
            <div class="flex items-start gap-3">
                <a href="/profile.html?id=${activity.user_id}" class="flex-shrink-0 relative">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-${colors.border}-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="absolute -bottom-1 -right-1 bg-${direction === 'up' ? 'green' : 'red'}-500 rounded-full p-1">
                        <i class="fas fa-${direction === 'up' ? 'arrow-up' : 'arrow-down'} text-white text-xs"></i>
                    </div>
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 flex-wrap">
                        <i class="fas fa-building text-${colors.text}-500 mr-1"></i>
                        ${positionBadge}
                        <a href="/profile.html?id=${activity.user_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        ${messageHtml}
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${colors.bg}-200 text-${colors.text}-800">
                            <i class="fas fa-chart-line mr-1"></i>${Math.round(eloRating)} Elo
                        </span>
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                    </div>

                    ${previousHolderHtml}

                    <!-- Event Actions -->
                    <div class="flex items-center gap-6 mt-3 pt-3 border-t border-${colors.border}-200">
                        ${renderGenericLikeButton(activity.id, 'club_ranking_change', activity, activity.likes_count || 0)}
                        <button
                            onclick="openComments('${activity.id}', 'club_ranking_change')"
                            class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                        >
                            <i class="far fa-comment"></i>
                            <span class="text-sm" data-comment-count="club_ranking_change-${activity.id}">${activity.comments_count || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render a global ranking change activity card
 * Only visible to the player themselves and their followers (NOT in club feed)
 */
function renderGlobalRankingChangeCard(activity) {
    const eventData = activity.event_data || {};
    const displayName = eventData.display_name || 'Spieler';
    const avatarUrl = eventData.avatar_url || DEFAULT_AVATAR;
    const newPosition = eventData.new_position || 0;
    const oldPosition = eventData.old_position || 0;
    const eloRating = eventData.elo_rating || 0;
    const direction = eventData.direction || 'same';
    const positionMedal = eventData.position_medal || '';
    const positionsChanged = eventData.positions_changed || Math.abs(newPosition - oldPosition);

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Farbschema - Lila für globales Ranking (zur Unterscheidung vom Verein)
    const colors = { bg: 'purple', border: 'purple', text: 'purple' };

    // Nachricht basierend auf Bewegung generieren
    let messageHtml = '';
    const changeText = positionsChanged > 1
        ? getRankingText('globalRanking.positionsPlural', { count: positionsChanged })
        : getRankingText('globalRanking.positionsSingular');
    if (direction === 'up') {
        messageHtml = `<span class="text-green-600 text-sm"><i class="fas fa-arrow-up mr-1"></i>${changeText} ${getRankingText('globalRanking.risen')}</span>`;
    } else {
        messageHtml = `<span class="text-red-600 text-sm"><i class="fas fa-arrow-down mr-1"></i>${changeText} ${getRankingText('globalRanking.fallen')}</span>`;
    }

    // Positions-Badge
    let positionBadge;
    if (newPosition <= 3 && positionMedal) {
        positionBadge = `<span class="text-2xl mr-2">${positionMedal}</span>`;
    } else {
        positionBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold text-sm mr-2">#${newPosition}</span>`;
    }

    return `
        <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-purple-200">
            <div class="flex items-start gap-3">
                <a href="/profile.html?id=${activity.user_id}" class="flex-shrink-0 relative">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-purple-400"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                    <div class="absolute -bottom-1 -right-1 bg-${direction === 'up' ? 'green' : 'red'}-500 rounded-full p-1">
                        <i class="fas fa-${direction === 'up' ? 'arrow-up' : 'arrow-down'} text-white text-xs"></i>
                    </div>
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 flex-wrap">
                        <i class="fas fa-globe text-purple-500 mr-1"></i>
                        ${positionBadge}
                        <a href="/profile.html?id=${activity.user_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        ${messageHtml}
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            <i class="fas fa-globe mr-1"></i>${getRankingText('globalRanking.title')}
                        </span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <i class="fas fa-chart-line mr-1"></i>${Math.round(eloRating)} Elo
                        </span>
                    </div>

                    <div class="mt-2 text-sm text-gray-500">
                        <span>${getRankingText('globalRanking.position', { position: oldPosition })}</span>
                        <i class="fas fa-arrow-right mx-2 text-gray-400"></i>
                        <span class="font-semibold text-purple-700">${getRankingText('globalRanking.position', { position: newPosition })}</span>
                    </div>

                    <div class="text-xs text-gray-400 mt-1">${dateStr}, ${timeStr}</div>

                    <!-- Event Actions -->
                    <div class="flex items-center gap-6 mt-3 pt-3 border-t border-purple-200">
                        ${renderGenericLikeButton(activity.id, 'global_ranking_change', activity, activity.likes_count || 0)}
                        <button
                            onclick="openComments('${activity.id}', 'global_ranking_change')"
                            class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                        >
                            <i class="far fa-comment"></i>
                            <span class="text-sm" data-comment-count="global_ranking_change-${activity.id}">${activity.comments_count || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render a club doubles ranking change activity card (top 10 in club)
 * Shows PAIRING ranking - both players' names
 * Only visible to club members
 */
function renderClubDoublesRankingChangeCard(activity) {
    const eventData = activity.event_data || {};
    const player1Name = eventData.player1_name || 'Spieler 1';
    const player2Name = eventData.player2_name || 'Spieler 2';
    const player1Id = eventData.player1_id;
    const player2Id = eventData.player2_id;
    const displayName = eventData.display_name || `${player1Name} & ${player2Name}`;
    const newPosition = eventData.new_position || 0;
    const oldPosition = eventData.old_position || 0;
    const eloRating = eventData.elo_rating || 0;
    const direction = eventData.direction || 'same';
    const positionMedal = eventData.position_medal || '';
    const previousHolderName = eventData.previous_holder_name;
    const previousHolderElo = eventData.previous_holder_elo;

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Farbschema basierend auf Position (Gold, Silber, Bronze für Top 3, Türkis für 4-10)
    const positionColors = {
        1: { bg: 'yellow', border: 'yellow', text: 'yellow' },
        2: { bg: 'gray', border: 'gray', text: 'gray' },
        3: { bg: 'amber', border: 'amber', text: 'amber' }
    };
    const colors = positionColors[newPosition] || { bg: 'teal', border: 'teal', text: 'teal' };

    // Nachricht basierend auf Bewegung generieren (Plural für Paarungen: "steigen" statt "steigt")
    let messageHtml = '';
    if (direction === 'up') {
        if (oldPosition > 10) {
            messageHtml = `<span class="text-gray-600 text-sm">sind in die Top 10 aufgestiegen!</span>`;
        } else if (oldPosition > 3 && newPosition <= 3) {
            messageHtml = `<span class="text-gray-600 text-sm">sind auf das Podium aufgestiegen!</span>`;
        } else {
            messageHtml = `<span class="text-gray-600 text-sm">steigen auf</span> <span class="font-bold text-${colors.text}-700">Platz ${newPosition}</span>`;
        }
    } else if (direction === 'down') {
        if (newPosition > 10) {
            messageHtml = `<span class="text-gray-600 text-sm">haben die Top 10 verlassen</span>`;
        } else if (oldPosition <= 3 && newPosition > 3) {
            messageHtml = `<span class="text-gray-600 text-sm">haben das Podium verlassen</span>`;
        } else {
            messageHtml = `<span class="text-gray-600 text-sm">fallen auf</span> <span class="font-bold text-${colors.text}-700">Platz ${newPosition}</span>`;
        }
    }

    // Vorheriger Halter-Info (nur für Aufstieg innerhalb Top 10)
    let previousHolderHtml = '';
    if (previousHolderName && direction === 'up' && newPosition <= 10) {
        previousHolderHtml = `
            <div class="mt-2 text-sm text-gray-500 flex items-center gap-1">
                <i class="fas fa-exchange-alt text-${colors.text}-400"></i>
                <span>vorher: ${previousHolderName} (${previousHolderElo} Elo)</span>
            </div>
        `;
    }

    // Positions-Badge
    let positionBadge;
    if (newPosition <= 3 && positionMedal) {
        positionBadge = `<span class="text-2xl mr-2">${positionMedal}</span>`;
    } else if (newPosition <= 10) {
        positionBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-${colors.bg}-100 text-${colors.text}-700 font-bold text-sm mr-2">#${newPosition}</span>`;
    } else {
        positionBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 font-bold text-sm mr-2">#${newPosition}</span>`;
    }

    return `
        <div class="bg-gradient-to-r from-${colors.bg}-50 to-${colors.bg}-100 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-${colors.border}-200">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 relative">
                    <div class="w-12 h-12 rounded-full bg-${colors.bg}-200 flex items-center justify-center border-2 border-${colors.border}-400">
                        <i class="fas fa-user-friends text-${colors.text}-600 text-lg"></i>
                    </div>
                    <div class="absolute -bottom-1 -right-1 bg-${direction === 'up' ? 'green' : 'red'}-500 rounded-full p-1">
                        <i class="fas fa-${direction === 'up' ? 'arrow-up' : 'arrow-down'} text-white text-xs"></i>
                    </div>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 flex-wrap">
                        <i class="fas fa-users text-${colors.text}-500 mr-1"></i>
                        ${positionBadge}
                        <span class="font-semibold text-gray-900">
                            <a href="/profile.html?id=${player1Id}" class="hover:text-indigo-600 transition">${player1Name}</a>
                            <span class="text-gray-500">&</span>
                            <a href="/profile.html?id=${player2Id}" class="hover:text-indigo-600 transition">${player2Name}</a>
                        </span>
                        ${messageHtml}
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-${colors.bg}-200 text-${colors.text}-800">
                            <i class="fas fa-chart-line mr-1"></i>${Math.round(eloRating)} Elo
                        </span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                            <i class="fas fa-users mr-1"></i>Doppel-Rangliste
                        </span>
                        <span class="text-xs text-gray-400">${dateStr}, ${timeStr}</span>
                    </div>

                    ${previousHolderHtml}

                    <!-- Event Actions -->
                    <div class="flex items-center gap-6 mt-3 pt-3 border-t border-${colors.border}-200">
                        ${renderGenericLikeButton(activity.id, 'club_doubles_ranking_change', activity, activity.likes_count || 0)}
                        <button
                            onclick="openComments('${activity.id}', 'club_doubles_ranking_change')"
                            class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                        >
                            <i class="far fa-comment"></i>
                            <span class="text-sm" data-comment-count="club_doubles_ranking_change-${activity.id}">${activity.comments_count || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render a global doubles ranking change activity card
 * Shows PAIRING ranking - both players' names
 * Only visible to both players and their followers
 */
function renderGlobalDoublesRankingChangeCard(activity) {
    const eventData = activity.event_data || {};
    const player1Name = eventData.player1_name || 'Spieler 1';
    const player2Name = eventData.player2_name || 'Spieler 2';
    const player1Id = eventData.player1_id;
    const player2Id = eventData.player2_id;
    const displayName = eventData.display_name || `${player1Name} & ${player2Name}`;
    const newPosition = eventData.new_position || 0;
    const oldPosition = eventData.old_position || 0;
    const eloRating = eventData.elo_rating || 0;
    const direction = eventData.direction || 'same';
    const positionMedal = eventData.position_medal || '';
    const positionsChanged = eventData.positions_changed || Math.abs(newPosition - oldPosition);

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Farbschema - Türkis für globales Doppel-Ranking
    const colors = { bg: 'teal', border: 'teal', text: 'teal' };

    // Nachricht basierend auf Bewegung generieren (Plural für Paarungen)
    let messageHtml = '';
    const changeText = positionsChanged > 1 ? `${positionsChanged} Plätze` : '1 Platz';
    if (direction === 'up') {
        messageHtml = `<span class="text-green-600 text-sm"><i class="fas fa-arrow-up mr-1"></i>${changeText} gestiegen</span>`;
    } else {
        messageHtml = `<span class="text-red-600 text-sm"><i class="fas fa-arrow-down mr-1"></i>${changeText} gefallen</span>`;
    }

    // Positions-Badge
    let positionBadge;
    if (newPosition <= 3 && positionMedal) {
        positionBadge = `<span class="text-2xl mr-2">${positionMedal}</span>`;
    } else {
        positionBadge = `<span class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 font-bold text-sm mr-2">#${newPosition}</span>`;
    }

    return `
        <div class="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-teal-200">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 relative">
                    <div class="w-12 h-12 rounded-full bg-teal-200 flex items-center justify-center border-2 border-teal-400">
                        <i class="fas fa-user-friends text-teal-600 text-lg"></i>
                    </div>
                    <div class="absolute -bottom-1 -right-1 bg-${direction === 'up' ? 'green' : 'red'}-500 rounded-full p-1">
                        <i class="fas fa-${direction === 'up' ? 'arrow-up' : 'arrow-down'} text-white text-xs"></i>
                    </div>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1 flex-wrap">
                        <i class="fas fa-globe text-teal-500 mr-1"></i>
                        ${positionBadge}
                        <span class="font-semibold text-gray-900">
                            <a href="/profile.html?id=${player1Id}" class="hover:text-indigo-600 transition">${player1Name}</a>
                            <span class="text-gray-500">&</span>
                            <a href="/profile.html?id=${player2Id}" class="hover:text-indigo-600 transition">${player2Name}</a>
                        </span>
                        ${messageHtml}
                    </div>

                    <div class="flex items-center gap-3 mt-1">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                            <i class="fas fa-globe mr-1"></i>Globale Doppel-Rangliste
                        </span>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <i class="fas fa-chart-line mr-1"></i>${Math.round(eloRating)} Elo
                        </span>
                    </div>

                    <div class="mt-2 text-sm text-gray-500">
                        <span>Platz ${oldPosition}</span>
                        <i class="fas fa-arrow-right mx-2 text-gray-400"></i>
                        <span class="font-semibold text-teal-700">Platz ${newPosition}</span>
                    </div>

                    <div class="text-xs text-gray-400 mt-1">${dateStr}, ${timeStr}</div>

                    <!-- Event Actions -->
                    <div class="flex items-center gap-6 mt-3 pt-3 border-t border-teal-200">
                        ${renderGenericLikeButton(activity.id, 'global_doubles_ranking_change', activity, activity.likes_count || 0)}
                        <button
                            onclick="openComments('${activity.id}', 'global_doubles_ranking_change')"
                            class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                        >
                            <i class="far fa-comment"></i>
                            <span class="text-sm" data-comment-count="global_doubles_ranking_change-${activity.id}">${activity.comments_count || 0}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Erkennt Saison-Posts und rendert einen farbigen Banner
 */
function renderSeasonBanner(content) {
    if (!content) return '';

    const isSeasonStart = content.startsWith('Neue Saison gestartet');
    const isSeasonEnd = content.startsWith('Saison beendet');

    if (isSeasonStart) {
        return `
            <div class="px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
                <div class="flex items-center gap-2">
                    <i class="fas fa-flag-checkered text-lg"></i>
                    <span class="font-bold text-lg">Neue Saison gestartet!</span>
                </div>
            </div>
        `;
    }

    if (isSeasonEnd) {
        return `
            <div class="px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white">
                <div class="flex items-center gap-2">
                    <i class="fas fa-trophy text-lg"></i>
                    <span class="font-bold text-lg">Saison beendet!</span>
                </div>
            </div>
        `;
    }

    return '';
}

/**
 * Entfernt die erste Zeile bei Saison-Posts (da sie im Banner angezeigt wird)
 */
function formatSeasonContent(content) {
    if (!content) return '';

    const isSeasonPost = content.startsWith('Neue Saison gestartet') || content.startsWith('Saison beendet');

    if (isSeasonPost) {
        // Erste Zeile entfernen (wird im Banner angezeigt)
        const lines = content.split('\n');
        return lines.slice(1).join('\n').trim();
    }

    return content;
}

/**
 * Render a community post card
 */
function renderPostCard(activity, profileMap) {
    const profile = profileMap[activity.user_id];
    const displayName = getDisplayName(profile);
    const avatarUrl = profile?.avatar_url || DEFAULT_AVATAR;

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    // Alte Einzelbild- und neue Mehrfachbild-Formate unterstützen
    const imageUrls = activity.image_urls || (activity.image_url ? [activity.image_url] : []);
    const hasImages = imageUrls.length > 0;
    const likesCount = activity.likes_count || 0;
    const commentsCount = activity.comments_count || 0;

    const postId = activity.id;
    const carouselId = `carousel-${postId}`;

    // Prüfen ob es ein Saison-Post ist
    const isSeasonPost = activity.content && (
        activity.content.startsWith('Neue Saison gestartet') ||
        activity.content.startsWith('Saison beendet')
    );
    const seasonBanner = renderSeasonBanner(activity.content);
    const displayContent = formatSeasonContent(activity.content);

    // Bilder-Array für onclick als JSON-String (escaped für HTML-Attribut)
    const imageUrlsJson = JSON.stringify(imageUrls).replace(/"/g, '&quot;');

    return `
        <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition border border-gray-100 overflow-hidden" data-post-id="${postId}">
            ${seasonBanner}
            <div class="p-4">
            <!-- Post Header -->
            <div class="flex items-start gap-3 mb-3">
                <a href="/profile.html?id=${activity.user_id}" class="flex-shrink-0">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <a href="/profile.html?id=${activity.user_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        <span class="text-gray-400">•</span>
                        <span class="text-xs text-gray-500">${dateStr}, ${timeStr}</span>
                    </div>
                    <div class="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <i class="fas fa-${activity.visibility === 'public' ? 'globe' : activity.visibility === 'club' ? 'building' : activity.visibility === 'subgroup' ? 'users' : 'user-friends'} text-xs"></i>
                        <span>${activity.visibility === 'public' ? t('dashboard.activityFeed.visibility.public') : activity.visibility === 'club' ? t('dashboard.activityFeed.visibility.club') : activity.visibility === 'subgroup' ? 'Untergruppe' : t('dashboard.activityFeed.visibility.followers')}</span>
                    </div>
                </div>

                ${currentUser && activity.user_id !== currentUser.id ? `
                <!-- Report Menu -->
                <div class="relative flex-shrink-0">
                    <button onclick="toggleFeedActionMenu('post-menu-${postId}')" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="post-menu-${postId}" class="hidden absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
                        <button onclick="reportFeedContent('post', '${postId}'); toggleFeedActionMenu('post-menu-${postId}')"
                                class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                            <i class="fas fa-flag"></i> Beitrag melden
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Post Content -->
            <div class="mb-3">
                <p class="text-gray-800 whitespace-pre-wrap break-words">${displayContent}</p>
            </div>

            ${hasImages ? `
            <!-- Post Images Carousel -->
            <div class="mb-3 relative">
                <div id="${carouselId}" class="bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center relative" style="max-height: 600px;">
                    <div class="carousel-container relative w-full" style="max-height: 600px;">
                        <div class="carousel-track flex transition-transform duration-300" data-current-index="0">
                            ${imageUrls.map((url, index) => `
                                <div class="carousel-slide flex-shrink-0 w-full flex items-center justify-center">
                                    <img src="${url}" alt="Post image ${index + 1}"
                                         class="w-full h-auto object-contain cursor-pointer hover:opacity-95 transition"
                                         style="max-height: 600px;"
                                         onclick="openPostImageGallery('${postId}', ${imageUrlsJson}, ${index})">
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    ${imageUrls.length > 1 ? `
                    <!-- Navigation Arrows -->
                    <button class="carousel-prev absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-2 transition"
                            onclick="carouselPrev('${carouselId}')">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button class="carousel-next absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full p-2 transition"
                            onclick="carouselNext('${carouselId}')">
                        <i class="fas fa-chevron-right"></i>
                    </button>

                    <!-- Dot Indicators -->
                    <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                        ${imageUrls.map((_, index) => `
                            <button class="carousel-dot w-2 h-2 rounded-full transition ${index === 0 ? 'bg-white' : 'bg-white bg-opacity-50'}"
                                    onclick="carouselGoTo('${carouselId}', ${index})"></button>
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
            </div>
            ` : ''}

            <!-- Post Actions -->
            <div class="flex items-center gap-6 pt-3 border-t border-gray-100">
                ${renderGenericLikeButton(postId, 'post', activity, likesCount)}
                <button
                    onclick="openComments('${postId}', 'post')"
                    class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                >
                    <i class="far fa-comment"></i>
                    <span class="text-sm" data-comment-count="post-${postId}">${commentsCount}</span>
                </button>
            </div>
            </div>
        </div>
    `;
}

/**
 * Render a community poll card
 */
function renderPollCard(activity, profileMap) {
    const profile = profileMap[activity.user_id];
    const displayName = getDisplayName(profile);
    const avatarUrl = profile?.avatar_url || DEFAULT_AVATAR;

    const eventDate = new Date(activity.created_at);
    const dateStr = formatRelativeDate(eventDate);
    const timeStr = eventDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    const endsAt = new Date(activity.ends_at);
    const isActive = endsAt > new Date();
    const totalVotes = activity.total_votes || 0;
    const userVotedOptionIds = activity.userVotedOptionIds || [];
    const allowMultiple = activity.allow_multiple || false;
    const isAnonymous = activity.is_anonymous !== false; // Standard ist true
    const voters = activity.voters || {};

    const options = activity.options || [];

    // Prozentsätze berechnen und Benutzer-Stimmen markieren
    const optionsWithPercent = options.map(opt => ({
        ...opt,
        percentage: totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0,
        isUserVote: userVotedOptionIds.includes(opt.id),
        voters: voters[opt.id] || []
    }));

    return `
        <div class="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl shadow-sm p-4 hover:shadow-md transition border border-purple-100">
            <!-- Poll Header -->
            <div class="flex items-start gap-3 mb-3">
                <a href="/profile.html?id=${activity.user_id}" class="flex-shrink-0">
                    <img src="${avatarUrl}" alt="${displayName}"
                         class="w-12 h-12 rounded-full object-cover border-2 border-purple-300"
                         onerror="this.src='${DEFAULT_AVATAR}'">
                </a>

                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-poll text-purple-600"></i>
                        <a href="/profile.html?id=${activity.user_id}" class="font-semibold text-gray-900 hover:text-indigo-600 transition">
                            ${displayName}
                        </a>
                        <span class="text-gray-400">•</span>
                        <span class="text-xs text-gray-500">${dateStr}, ${timeStr}</span>
                    </div>
                    <div class="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <i class="fas fa-${activity.visibility === 'public' ? 'globe' : activity.visibility === 'club' ? 'building' : activity.visibility === 'subgroup' ? 'users' : 'user-friends'} text-xs"></i>
                        <span>${activity.visibility === 'public' ? t('dashboard.activityFeed.visibility.public') : activity.visibility === 'club' ? t('dashboard.activityFeed.visibility.club') : activity.visibility === 'subgroup' ? 'Untergruppe' : t('dashboard.activityFeed.visibility.followers')}</span>
                    </div>
                </div>

                ${currentUser && activity.user_id !== currentUser.id ? `
                <!-- Report Menu -->
                <div class="relative flex-shrink-0">
                    <button onclick="toggleFeedActionMenu('poll-menu-${activity.id}')" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="poll-menu-${activity.id}" class="hidden absolute right-0 top-8 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
                        <button onclick="reportFeedContent('poll', '${activity.id}'); toggleFeedActionMenu('poll-menu-${activity.id}')"
                                class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                            <i class="fas fa-flag"></i> Umfrage melden
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>

            <!-- Poll Question -->
            <div class="mb-4">
                <h3 class="text-lg font-semibold text-gray-900">${activity.question}</h3>
                <div class="flex flex-wrap items-center gap-3 mt-1">
                    ${userVotedOptionIds.length > 0 ? '<p class="text-xs text-purple-600"><i class="fas fa-check-circle mr-1"></i>Du hast bereits abgestimmt</p>' : ''}
                    ${allowMultiple ? '<p class="text-xs text-indigo-600"><i class="fas fa-check-double mr-1"></i>Mehrfachauswahl möglich</p>' : ''}
                    ${!isAnonymous ? '<p class="text-xs text-orange-600"><i class="fas fa-eye mr-1"></i>Stimmen sichtbar</p>' : '<p class="text-xs text-gray-500"><i class="fas fa-user-secret mr-1"></i>Anonym</p>'}
                </div>
            </div>

            <!-- Poll Options -->
            <div class="space-y-2 mb-3" data-poll-id="${activity.id}" data-allow-multiple="${allowMultiple}" data-is-anonymous="${isAnonymous}">
                ${optionsWithPercent.map((option, index) => `
                    <div class="poll-option ${isActive ? 'cursor-pointer hover:bg-purple-100' : ''} ${option.isUserVote ? 'ring-2 ring-purple-500 bg-purple-50' : 'bg-white'} rounded-lg p-3 border border-purple-200 transition"
                         onclick="${isActive ? `votePoll('${activity.id}', '${option.id}', ${allowMultiple})` : ''}"
                    >
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-medium text-gray-800 flex items-center gap-2">
                                ${allowMultiple ? `<i class="far ${option.isUserVote ? 'fa-check-square text-purple-600' : 'fa-square text-gray-400'}"></i>` : ''}
                                ${option.text}
                                ${!allowMultiple && option.isUserVote ? '<i class="fas fa-check-circle text-purple-600"></i>' : ''}
                            </span>
                            <span class="text-sm font-semibold text-purple-600">${option.percentage}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div class="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                                 style="width: ${option.percentage}%"></div>
                        </div>
                        <div class="flex items-center justify-between mt-1">
                            <span class="text-xs text-gray-500">${option.votes || 0} ${t('dashboard.activityFeed.votes')}</span>
                            ${!isAnonymous && option.voters.length > 0 ? `
                                <div class="flex items-center -space-x-2">
                                    ${option.voters.slice(0, 5).map(voter => `
                                        <a href="/profile.html?id=${voter.id}" title="${voter.name}" class="block">
                                            <img src="${voter.avatar_url || DEFAULT_AVATAR}" alt="${voter.name}"
                                                 class="w-6 h-6 rounded-full border-2 border-white object-cover"
                                                 onerror="this.src='${DEFAULT_AVATAR}'">
                                        </a>
                                    `).join('')}
                                    ${option.voters.length > 5 ? `<span class="text-xs text-gray-500 ml-2">+${option.voters.length - 5}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Poll Footer -->
            <div class="flex flex-col gap-2 pt-3 border-t border-purple-100">
                <div class="flex items-center justify-between text-xs text-gray-600">
                    <div class="flex items-center gap-1">
                        <i class="fas fa-users"></i>
                        <span>${totalVotes} ${totalVotes === 1 ? t('dashboard.activityFeed.vote') : t('dashboard.activityFeed.votes')}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <i class="fas fa-clock"></i>
                        <span>${isActive ? `${t('dashboard.activityFeed.endsAt')} ${formatRelativeDate(endsAt)}` : t('dashboard.activityFeed.ended')}</span>
                    </div>
                </div>

                <!-- Poll Actions -->
                <div class="flex items-center gap-6">
                    ${renderGenericLikeButton(activity.id, 'poll', activity, activity.likes_count || 0)}
                    <button
                        onclick="openComments('${activity.id}', 'poll')"
                        class="flex items-center gap-2 text-gray-600 hover:text-indigo-600 transition"
                    >
                        <i class="far fa-comment"></i>
                        <span class="text-sm" data-comment-count="poll-${activity.id}">${activity.comments_count || 0}</span>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// FEED ACTION MENU FUNCTIONS (Report)
// ============================================

/**
 * Toggle a feed action menu (three-dots dropdown)
 */
window.toggleFeedActionMenu = function(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;

    // Close all other open menus first
    document.querySelectorAll('[id^="post-menu-"], [id^="poll-menu-"]').forEach(m => {
        if (m.id !== menuId) m.classList.add('hidden');
    });

    menu.classList.toggle('hidden');
};

/**
 * Report content from the activity feed
 */
window.reportFeedContent = function(contentType, contentId) {
    showReportDialog(contentType, contentId);
};

// Close feed action menus when clicking outside
document.addEventListener('click', function(e) {
    if (!e.target.closest('[id^="post-menu-"]') && !e.target.closest('[id^="poll-menu-"]') && !e.target.closest('.fa-ellipsis-v') && !e.target.closest('button[onclick*="toggleFeedActionMenu"]')) {
        document.querySelectorAll('[id^="post-menu-"], [id^="poll-menu-"]').forEach(m => {
            m.classList.add('hidden');
        });
    }
});

// ============================================
// CAROUSEL FUNCTIONS
// ============================================

/**
 * Navigate carousel to previous image
 */
window.carouselPrev = function(carouselId) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const currentIndex = parseInt(track.dataset.currentIndex);
    const slides = track.querySelectorAll('.carousel-slide');
    const totalSlides = slides.length;

    if (totalSlides <= 1) return;

    const newIndex = currentIndex === 0 ? totalSlides - 1 : currentIndex - 1;
    updateCarousel(carousel, newIndex);
};

/**
 * Navigate carousel to next image
 */
window.carouselNext = function(carouselId) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const currentIndex = parseInt(track.dataset.currentIndex);
    const slides = track.querySelectorAll('.carousel-slide');
    const totalSlides = slides.length;

    if (totalSlides <= 1) return;

    const newIndex = currentIndex === totalSlides - 1 ? 0 : currentIndex + 1;
    updateCarousel(carousel, newIndex);
};

/**
 * Navigate carousel to specific index
 */
window.carouselGoTo = function(carouselId, index) {
    const carousel = document.getElementById(carouselId);
    if (!carousel) return;

    updateCarousel(carousel, index);
};

/**
 * Vote on a poll
 * @param {string} pollId - Umfrage-ID
 * @param {string} optionId - Ausgewählte Options-ID
 * @param {boolean} allowMultiple - Ob Mehrfachauswahl erlaubt ist
 */
window.votePoll = async function(pollId, optionId, allowMultiple = false) {
    if (!currentUser) {
        alert('Bitte melde dich an, um abzustimmen.');
        return;
    }

    try {
        // Prüfen ob Umfrage noch aktiv ist
        const { data: poll, error: pollError } = await supabase
            .from('community_polls')
            .select('ends_at, options, total_votes, user_id, allow_multiple')
            .eq('id', pollId)
            .single();

        if (pollError) throw pollError;

        if (new Date(poll.ends_at) <= new Date()) {
            alert('Diese Umfrage ist bereits beendet.');
            return;
        }

        // Umfrage-Einstellung allow_multiple verwenden falls nicht angegeben
        const isMultipleChoice = poll.allow_multiple || allowMultiple;

        if (isMultipleChoice) {
            // Mehrfachauswahl-Abstimmungslogik
            // Prüfen ob Benutzer bereits für diese Option gestimmt hat
            const { data: existingVoteForOption, error: checkError } = await supabase
                .from('poll_votes')
                .select('id')
                .eq('poll_id', pollId)
                .eq('user_id', currentUser.id)
                .eq('option_id', optionId)
                .maybeSingle();

            if (checkError) {
                console.warn('[ActivityFeed] Error checking existing vote:', checkError);
            }

            if (existingVoteForOption) {
                // Benutzer klickte gleiche Option - Stimme entfernen (umschalten)
                const { error: deleteError } = await supabase
                    .from('poll_votes')
                    .delete()
                    .eq('id', existingVoteForOption.id);

                if (deleteError) {
                    console.error('[ActivityFeed] Error removing vote:', deleteError);
                    throw deleteError;
                }
            } else {
                // Stimme für diese Option hinzufügen
                const { error: insertError } = await supabase
                    .from('poll_votes')
                    .insert({
                        poll_id: pollId,
                        user_id: currentUser.id,
                        option_id: optionId
                    });

                if (insertError) {
                    console.error('[ActivityFeed] Error inserting vote:', insertError);
                    throw insertError;
                }
            }
        } else {
            // Einfachauswahl-Abstimmungslogik (ursprüngliches Verhalten)
            // Prüfen ob Benutzer bereits gestimmt hat
            const { data: existingVote, error: checkError } = await supabase
                .from('poll_votes')
                .select('id, option_id')
                .eq('poll_id', pollId)
                .eq('user_id', currentUser.id)
                .maybeSingle();

            if (checkError) {
                console.warn('[ActivityFeed] Error checking existing vote:', checkError);
            }

            if (existingVote) {
                if (existingVote.option_id === optionId) {
                    // Benutzer klickte gleiche Option - zeigen dass bereits abgestimmt
                    alert('Du hast bereits für diese Option gestimmt.');
                    return;
                }

                // Benutzer möchte Stimme ändern - alte löschen und neue einfügen
                const { error: deleteError } = await supabase
                    .from('poll_votes')
                    .delete()
                    .eq('id', existingVote.id);

                if (deleteError) {
                    console.error('[ActivityFeed] Error deleting old vote:', deleteError);
                    throw deleteError;
                }

                // Neue Stimme einfügen
                const { error: insertError } = await supabase
                    .from('poll_votes')
                    .insert({
                        poll_id: pollId,
                        user_id: currentUser.id,
                        option_id: optionId
                    });

                if (insertError) {
                    console.error('[ActivityFeed] Error inserting new vote:', insertError);
                    throw insertError;
                }
            } else {
                // Neue Stimme
                const { error: voteError } = await supabase
                    .from('poll_votes')
                    .insert({
                        poll_id: pollId,
                        user_id: currentUser.id,
                        option_id: optionId
                    });

                if (voteError) {
                    console.error('[ActivityFeed] Error inserting vote:', voteError);
                    if (voteError.code === '23505') {
                        alert('Du hast bereits abgestimmt.');
                        return;
                    }
                    throw voteError;
                }
            }
        }

        // Umfrage-Karte aktualisieren um neue Ergebnisse anzuzeigen
        await refreshPollCard(pollId);

    } catch (error) {
        console.error('[ActivityFeed] Error voting on poll:', error);
        alert('Fehler beim Abstimmen: ' + error.message);
    }
};

/**
 * Refresh a single poll card after voting
 */
async function refreshPollCard(pollId) {
    try {
        // Umfrage-Daten neu laden
        const { data: poll, error } = await supabase
            .from('community_polls')
            .select('id, user_id, question, options, created_at, deleted_at, visibility, is_anonymous, allow_multiple, ends_at, total_votes')
            .eq('id', pollId)
            .single();

        if (error) throw error;

        // Benutzer-Stimmen abrufen (können mehrere bei Mehrfachauswahl sein)
        const { data: userVotes } = await supabase
            .from('poll_votes')
            .select('option_id')
            .eq('poll_id', pollId)
            .eq('user_id', currentUser.id);

        const userVotedOptionIds = (userVotes || []).map(v => v.option_id);
        const totalVotes = poll.total_votes || 0;
        const options = poll.options || [];
        const allowMultiple = poll.allow_multiple || false;
        const isAnonymous = poll.is_anonymous !== false;

        // Für nicht-anonyme Umfragen alle Wähler mit Profilen laden
        let votersMap = {};
        if (!isAnonymous) {
            const { data: allVotes } = await supabase
                .from('poll_votes')
                .select('option_id, user_id')
                .eq('poll_id', pollId);

            const voterIds = [...new Set((allVotes || []).map(v => v.user_id))];
            let voterProfiles = {};

            if (voterIds.length > 0) {
                let profilesData = [];

                if (isChildMode) {
                    // Child mode: use RPC
                    const sessionToken = getSessionToken();
                    if (sessionToken) {
                        const { data } = await supabase.rpc('get_profiles_for_child_session', {
                            p_session_token: sessionToken,
                            p_profile_ids: voterIds
                        });
                        if (data?.success) {
                            profilesData = data.profiles || [];
                        }
                    }
                } else {
                    const { data: profiles } = await supabase
                        .from('profiles')
                        .select('id, first_name, last_name, avatar_url')
                        .in('id', voterIds);
                    profilesData = profiles || [];
                }

                profilesData.forEach(p => {
                    voterProfiles[p.id] = p;
                });
            }

            (allVotes || []).forEach(v => {
                if (!votersMap[v.option_id]) {
                    votersMap[v.option_id] = [];
                }
                const profile = voterProfiles[v.user_id];
                if (profile) {
                    votersMap[v.option_id].push({
                        id: v.user_id,
                        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unbekannt',
                        avatar_url: profile.avatar_url
                    });
                }
            });
        }

        // Prozentsätze berechnen
        const optionsWithPercent = options.map(opt => ({
            ...opt,
            percentage: totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0,
            isUserVote: userVotedOptionIds.includes(opt.id),
            voters: votersMap[opt.id] || []
        }));

        const endsAt = new Date(poll.ends_at);
        const isActive = endsAt > new Date();

        // Umfrage-Optionen im DOM finden und aktualisieren
        const pollCard = document.querySelector(`[onclick*="votePoll('${pollId}'"]`)?.closest('.bg-gradient-to-r');
        if (pollCard) {
            const optionsContainer = pollCard.querySelector('.space-y-2.mb-3');
            if (optionsContainer) {
                optionsContainer.innerHTML = optionsWithPercent.map(option => `
                    <div class="poll-option ${isActive ? 'cursor-pointer hover:bg-purple-100' : ''} ${option.isUserVote ? 'ring-2 ring-purple-500 bg-purple-50' : 'bg-white'} rounded-lg p-3 border border-purple-200 transition"
                         onclick="${isActive ? `votePoll('${pollId}', '${option.id}', ${allowMultiple})` : ''}"
                    >
                        <div class="flex items-center justify-between mb-1">
                            <span class="font-medium text-gray-800 flex items-center gap-2">
                                ${allowMultiple ? `<i class="far ${option.isUserVote ? 'fa-check-square text-purple-600' : 'fa-square text-gray-400'}"></i>` : ''}
                                ${option.text}
                                ${!allowMultiple && option.isUserVote ? '<i class="fas fa-check-circle text-purple-600"></i>' : ''}
                            </span>
                            <span class="text-sm font-semibold text-purple-600">${option.percentage}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div class="bg-gradient-to-r from-purple-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                                 style="width: ${option.percentage}%"></div>
                        </div>
                        <div class="flex items-center justify-between mt-1">
                            <span class="text-xs text-gray-500">${option.votes || 0} ${t('dashboard.activityFeed.votes')}</span>
                            ${!isAnonymous && option.voters.length > 0 ? `
                                <div class="flex items-center -space-x-2">
                                    ${option.voters.slice(0, 5).map(voter => `
                                        <a href="/profile.html?id=${voter.id}" title="${voter.name}" class="block">
                                            <img src="${voter.avatar_url || DEFAULT_AVATAR}" alt="${voter.name}"
                                                 class="w-6 h-6 rounded-full border-2 border-white object-cover"
                                                 onerror="this.src='${DEFAULT_AVATAR}'">
                                        </a>
                                    `).join('')}
                                    ${option.voters.length > 5 ? `<span class="text-xs text-gray-500 ml-2">+${option.voters.length - 5}</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('');
            }

            // Gesamtstimmen-Anzeige aktualisieren
            const votesDisplay = pollCard.querySelector('.fa-users')?.parentElement;
            if (votesDisplay) {
                votesDisplay.innerHTML = `
                    <i class="fas fa-users"></i>
                    <span>${totalVotes} ${totalVotes === 1 ? t('dashboard.activityFeed.vote') : t('dashboard.activityFeed.votes')}</span>
                `;
            }

            // "Du hast bereits abgestimmt"-Text aktualisieren
            const questionDiv = pollCard.querySelector('.mb-4');
            if (questionDiv) {
                const statusDiv = questionDiv.querySelector('.flex.flex-wrap');
                if (statusDiv) {
                    statusDiv.innerHTML = `
                        ${userVotedOptionIds.length > 0 ? '<p class="text-xs text-purple-600"><i class="fas fa-check-circle mr-1"></i>Du hast bereits abgestimmt</p>' : ''}
                        ${allowMultiple ? '<p class="text-xs text-indigo-600"><i class="fas fa-check-double mr-1"></i>Mehrfachauswahl möglich</p>' : ''}
                        ${!isAnonymous ? '<p class="text-xs text-orange-600"><i class="fas fa-eye mr-1"></i>Stimmen sichtbar</p>' : '<p class="text-xs text-gray-500"><i class="fas fa-user-secret mr-1"></i>Anonym</p>'}
                    `;
                }
            }
        }

    } catch (error) {
        console.error('[ActivityFeed] Error refreshing poll card:', error);
    }
}

/**
 * Update carousel position and indicators
 */
function updateCarousel(carousel, newIndex) {
    const track = carousel.querySelector('.carousel-track');
    const slides = track.querySelectorAll('.carousel-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');

    if (!track || slides.length === 0) return;

    // Track-Position aktualisieren
    track.style.transform = `translateX(-${newIndex * 100}%)`;
    track.dataset.currentIndex = newIndex;

    // Punkte aktualisieren
    dots.forEach((dot, index) => {
        if (index === newIndex) {
            dot.classList.remove('bg-opacity-50');
            dot.classList.add('bg-white');
        } else {
            dot.classList.add('bg-opacity-50');
            dot.classList.remove('bg-white');
        }
    });
}

/**
 * Initialize swipe gestures for all carousels
 */
function initCarouselSwipe() {
    document.addEventListener('DOMContentLoaded', () => {
        // Touch-Event-Listener für alle Karussell-Container hinzufügen
        const observer = new MutationObserver(() => {
            document.querySelectorAll('[id^="carousel-"]').forEach(carousel => {
                if (carousel.dataset.swipeInit) return;
                carousel.dataset.swipeInit = 'true';

                let touchStartX = 0;
                let touchEndX = 0;
                let touchStartY = 0;
                let touchEndY = 0;

                carousel.addEventListener('touchstart', (e) => {
                    touchStartX = e.changedTouches[0].screenX;
                    touchStartY = e.changedTouches[0].screenY;
                }, { passive: true });

                carousel.addEventListener('touchend', (e) => {
                    touchEndX = e.changedTouches[0].screenX;
                    touchEndY = e.changedTouches[0].screenY;

                    const deltaX = touchEndX - touchStartX;
                    const deltaY = touchEndY - touchStartY;

                    // Nur auslösen wenn horizontaler Swipe dominiert
                    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                        if (deltaX > 0) {
                            // Nach rechts wischen - vorheriges
                            window.carouselPrev(carousel.id);
                        } else {
                            // Nach links wischen - nächstes
                            window.carouselNext(carousel.id);
                        }
                    }
                }, { passive: true });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// Swipe-Funktionalität initialisieren
initCarouselSwipe();
