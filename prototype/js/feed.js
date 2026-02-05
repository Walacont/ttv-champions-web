/**
 * Aktivitätsfeed für TTV Champions Prototyp
 * Zeigt Spielergebnisse, Saisonstarts, Rangänderungen
 */

import { supabase, getCurrentProfile } from './supabase-client.js';
import { createRankBadge } from './ranks.js';
import { formatEloChange } from './elo.js';

// Feed-Event-Typen
export const FEED_TYPES = {
    MATCH_RESULT: 'match_result',
    SEASON_START: 'season_start',
    SEASON_END: 'season_end',
    RANK_CHANGE: 'rank_change',
    PODIUM_CHANGE: 'podium_change',
    CHALLENGE_COMPLETED: 'challenge_completed',
    STREAK_MILESTONE: 'streak_milestone'
};

// Filter-Optionen
export const FEED_FILTERS = {
    ALL: 'all',
    FOLLOWING: 'following',
    OWN: 'own',
    CLUB: 'club'
};

// ============================================
// FEED LADEN
// ============================================

/**
 * Lädt den Aktivitätsfeed
 *
 * @param {Object} options - Optionen
 * @param {string} options.clubId - Verein-ID
 * @param {string} options.filter - Filter (all, following, own, club)
 * @param {number} options.limit - Limit
 * @param {number} options.offset - Offset für Pagination
 * @returns {Promise<Array>} Feed-Einträge
 */
export async function getFeed(options = {}) {
    const profile = getCurrentProfile();
    const { clubId, filter = FEED_FILTERS.ALL, limit = 20, offset = 0 } = options;

    let query = supabase
        .from('activity_feed')
        .select(`
            *,
            user:user_id(id, first_name, last_name)
        `)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    // Filter anwenden
    switch (filter) {
        case FEED_FILTERS.OWN:
            if (profile) {
                query = query.eq('user_id', profile.id);
            }
            break;

        case FEED_FILTERS.CLUB:
            if (clubId) {
                query = query.eq('club_id', clubId);
            }
            break;

        case FEED_FILTERS.FOLLOWING:
            // Würde Freundschafts-Logik erfordern
            // Für Prototyp: Zeige Club-Feed
            if (clubId) {
                query = query.eq('club_id', clubId);
            }
            break;

        case FEED_FILTERS.ALL:
        default:
            // Alle öffentlichen oder Club-Einträge
            if (clubId) {
                query = query.eq('club_id', clubId);
            }
            break;
    }

    const { data, error } = await query;

    if (error) {
        console.error('Fehler beim Laden des Feeds:', error);
        return [];
    }

    return data;
}

/**
 * Lädt den persönlichen Feed eines Spielers
 *
 * @param {string} userId - Spieler-ID
 * @param {number} limit - Limit
 * @returns {Promise<Array>} Feed-Einträge
 */
export async function getUserFeed(userId, limit = 10) {
    const { data, error } = await supabase
        .from('activity_feed')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Fehler beim Laden des Benutzer-Feeds:', error);
        return [];
    }

    return data;
}

// ============================================
// FEED-EINTRÄGE ERSTELLEN
// ============================================

/**
 * Erstellt einen Feed-Eintrag
 *
 * @param {string} type - Event-Typ
 * @param {Object} data - Event-Daten
 * @param {string} userId - Benutzer-ID
 * @param {string} clubId - Verein-ID
 * @returns {Promise<Object>} Ergebnis
 */
export async function createFeedEntry(type, data, userId = null, clubId = null) {
    const profile = getCurrentProfile();

    try {
        const { data: entry, error } = await supabase
            .from('activity_feed')
            .insert({
                type,
                data,
                user_id: userId || profile?.id,
                club_id: clubId || profile?.club_id
            })
            .select()
            .single();

        if (error) throw error;

        return { success: true, entry };
    } catch (error) {
        console.error('Fehler beim Erstellen des Feed-Eintrags:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// REALTIME SUBSCRIPTION
// ============================================

/**
 * Abonniert neue Feed-Einträge
 *
 * @param {string} clubId - Verein-ID
 * @param {Function} callback - Callback bei neuem Eintrag
 * @returns {Object} Subscription
 */
export function subscribeToFeed(clubId, callback) {
    return supabase
        .channel('feed-changes')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'activity_feed',
                filter: `club_id=eq.${clubId}`
            },
            (payload) => {
                callback(payload.new);
            }
        )
        .subscribe();
}

// ============================================
// HTML RENDERING
// ============================================

/**
 * Erstellt HTML für Feed-Filter-Buttons
 *
 * @param {string} activeFilter - Aktiver Filter
 * @returns {string} HTML
 */
export function createFeedFilters(activeFilter = FEED_FILTERS.ALL) {
    const filters = [
        { id: FEED_FILTERS.ALL, label: 'Alle' },
        { id: FEED_FILTERS.CLUB, label: 'Verein' },
        { id: FEED_FILTERS.OWN, label: 'Meine' }
    ];

    return `
        <div class="flex gap-2 mb-4">
            ${filters.map(f => `
                <button class="feed-filter px-3 py-1 text-sm rounded-full transition-colors
                               ${f.id === activeFilter
                                   ? 'bg-blue-600 text-white'
                                   : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
                        data-filter="${f.id}">
                    ${f.label}
                </button>
            `).join('')}
        </div>
    `;
}

/**
 * Erstellt HTML für einen Feed-Eintrag
 *
 * @param {Object} entry - Feed-Eintrag
 * @returns {string} HTML
 */
export function renderFeedEntry(entry) {
    const timeAgo = formatTimeAgo(entry.created_at);

    let content;
    let icon;

    switch (entry.type) {
        case FEED_TYPES.MATCH_RESULT:
            content = renderMatchResult(entry);
            icon = '🏓';
            break;

        case FEED_TYPES.SEASON_START:
            content = renderSeasonStart(entry);
            icon = '🚀';
            break;

        case FEED_TYPES.SEASON_END:
            content = renderSeasonEnd(entry);
            icon = '🏁';
            break;

        case FEED_TYPES.RANK_CHANGE:
            content = renderRankChange(entry);
            icon = '⬆️';
            break;

        case FEED_TYPES.PODIUM_CHANGE:
            content = renderPodiumChange(entry);
            icon = '🏆';
            break;

        case FEED_TYPES.CHALLENGE_COMPLETED:
            content = renderChallengeCompleted(entry);
            icon = '✅';
            break;

        case FEED_TYPES.STREAK_MILESTONE:
            content = renderStreakMilestone(entry);
            icon = '🔥';
            break;

        default:
            content = `<p class="text-gray-600">${JSON.stringify(entry.data)}</p>`;
            icon = '📢';
    }

    return `
        <div class="bg-white rounded-lg shadow p-4 border border-gray-100">
            <div class="flex items-start gap-3">
                <div class="text-2xl">${icon}</div>
                <div class="flex-1">
                    ${content}
                    <p class="text-xs text-gray-400 mt-2">${timeAgo}</p>
                </div>
            </div>
        </div>
    `;
}

// Render-Funktionen für verschiedene Event-Typen

function renderMatchResult(entry) {
    const { data } = entry;
    const userName = entry.user?.first_name || 'Spieler';

    return `
        <p class="font-medium">${userName} hat ein Spiel gewonnen!</p>
        <p class="text-sm text-gray-600">
            Ergebnis: ${data.player_a_sets || 0}:${data.player_b_sets || 0}
            ${data.elo_change ? `• ${formatEloChange(data.elo_change)}` : ''}
        </p>
    `;
}

function renderSeasonStart(entry) {
    const { data } = entry;

    return `
        <p class="font-medium">Neue Saison gestartet! 🎉</p>
        <p class="text-sm text-gray-600">"${data.season_name || 'Neue Saison'}" hat begonnen.</p>
        <p class="text-sm text-gray-500">Alle Saisonpunkte wurden zurückgesetzt.</p>
    `;
}

function renderSeasonEnd(entry) {
    const { data } = entry;

    return `
        <p class="font-medium">Saison beendet! 🏁</p>
        <p class="text-sm text-gray-600">"${data.season_name || 'Saison'}" ist zu Ende.</p>
    `;
}

function renderRankChange(entry) {
    const { data } = entry;
    const userName = entry.user?.first_name || 'Spieler';

    return `
        <p class="font-medium">${userName} ist aufgestiegen!</p>
        <p class="text-sm text-gray-600">
            Neuer Rang: ${data.new_rank || 'Unbekannt'}
        </p>
    `;
}

function renderPodiumChange(entry) {
    const { data } = entry;
    const userName = entry.user?.first_name || 'Spieler';

    return `
        <p class="font-medium">${userName} ist jetzt auf Platz ${data.position}!</p>
        <p class="text-sm text-gray-600">
            ${data.leaderboard === 'skill' ? 'Skill-Rangliste' : data.leaderboard === 'effort' ? 'Fleiß-Rangliste' : 'Rangliste'}
        </p>
    `;
}

function renderChallengeCompleted(entry) {
    const { data } = entry;
    const userName = entry.user?.first_name || 'Spieler';

    return `
        <p class="font-medium">${userName} hat eine Challenge abgeschlossen!</p>
        <p class="text-sm text-gray-600">"${data.challenge_title || 'Challenge'}"</p>
        <p class="text-sm text-purple-600">+${data.xp_awarded || 0} XP</p>
    `;
}

function renderStreakMilestone(entry) {
    const { data } = entry;
    const userName = entry.user?.first_name || 'Spieler';

    return `
        <p class="font-medium">${userName} hat einen Streak-Meilenstein erreicht!</p>
        <p class="text-sm text-gray-600">${data.streak_count || 0} Trainings in Folge! 🔥</p>
    `;
}

/**
 * Formatiert einen Zeitstempel als "vor X Minuten/Stunden/Tagen"
 *
 * @param {string} timestamp - ISO Timestamp
 * @returns {string} Formatierte Zeitangabe
 */
function formatTimeAgo(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Gerade eben';
    if (diffMins < 60) return `vor ${diffMins} Minute${diffMins !== 1 ? 'n' : ''}`;
    if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
    if (diffDays < 7) return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;

    return date.toLocaleDateString('de-DE');
}

/**
 * Erstellt HTML für leeren Feed
 *
 * @returns {string} HTML
 */
export function createEmptyFeed() {
    return `
        <div class="text-center py-8 text-gray-500">
            <div class="text-4xl mb-2">📭</div>
            <p>Noch keine Aktivitäten</p>
            <p class="text-sm">Spiele Matches oder schließe Challenges ab!</p>
        </div>
    `;
}
