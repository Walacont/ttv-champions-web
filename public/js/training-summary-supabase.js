/**
 * Training-Summary Modul
 * Erstellt und aktualisiert Training-Zusammenfassungen für Spieler im Activity Feed
 * Diese sind nur für den jeweiligen Spieler sichtbar
 */

import { getSupabase } from './supabase-init.js';

const supabase = getSupabase();

// Prefix für Training-Zusammenfassungen im Content
const TRAINING_SUMMARY_PREFIX = 'TRAINING_SUMMARY|';

/**
 * Erstellt oder aktualisiert eine Training-Zusammenfassung für einen Spieler
 * @param {string} playerId - ID des Spielers
 * @param {string} clubId - Club-ID
 * @param {string} eventId - Event-ID
 * @param {string} eventDate - Datum des Events (YYYY-MM-DD)
 * @param {string} eventTitle - Titel des Events
 * @param {boolean} attended - Ob der Spieler anwesend war
 */
export async function createOrUpdateTrainingSummary(playerId, clubId, eventId, eventDate, eventTitle, attended = true) {
    console.log('[TrainingSummary] createOrUpdateTrainingSummary called:', { playerId, clubId, eventId, eventDate, eventTitle, attended });

    try {
        // Prüfen ob bereits eine Zusammenfassung für diesen Spieler/Event/Datum existiert
        const existingSummary = await findTrainingSummary(playerId, eventId, eventDate);
        console.log('[TrainingSummary] Existing summary:', existingSummary);

        const summaryData = {
            event_id: eventId,
            event_date: eventDate,
            event_title: eventTitle,
            attended: attended,
            points: [],
            total_points: 0,
            updated_at: new Date().toISOString()
        };

        if (existingSummary) {
            // Bestehende Zusammenfassung aktualisieren (Punkte beibehalten)
            const existingData = parseTrainingSummaryContent(existingSummary.content);
            summaryData.points = existingData.points || [];
            summaryData.total_points = existingData.total_points || 0;

            const { error } = await supabase
                .from('community_posts')
                .update({
                    content: TRAINING_SUMMARY_PREFIX + JSON.stringify(summaryData),
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingSummary.id);

            if (error) throw error;
            console.log('[TrainingSummary] Updated existing summary for player', playerId);
        } else {
            // Neue Zusammenfassung erstellen via RPC (umgeht RLS, prüft Coach-Berechtigung)
            const content = TRAINING_SUMMARY_PREFIX + JSON.stringify(summaryData);
            console.log('[TrainingSummary] Creating via RPC for player', playerId);

            const { data, error } = await supabase
                .rpc('create_training_summary', {
                    p_user_id: playerId,
                    p_club_id: clubId,
                    p_content: content
                });

            console.log('[TrainingSummary] RPC result - data:', data, 'error:', error);

            if (error) throw error;
            console.log('[TrainingSummary] Created new summary for player', playerId);
        }

        return true;
    } catch (error) {
        console.error('[TrainingSummary] Error creating/updating summary:', error);
        return false;
    }
}

/**
 * Fügt Punkte zu einer Training-Zusammenfassung hinzu
 * @param {string} playerId - ID des Spielers
 * @param {string} eventDate - Datum des Trainings (YYYY-MM-DD)
 * @param {object} pointEntry - Punkteeintrag {amount, reason, type, exercise_name?}
 */
export async function addPointsToTrainingSummary(playerId, eventDate, pointEntry) {
    try {
        // Finde Training-Zusammenfassung für heute
        const summary = await findTrainingSummaryByDate(playerId, eventDate);

        if (!summary) {
            console.log('[TrainingSummary] No training summary found for date', eventDate);
            return false;
        }

        const summaryData = parseTrainingSummaryContent(summary.content);

        // Punkt hinzufügen
        summaryData.points.push({
            ...pointEntry,
            added_at: new Date().toISOString()
        });

        // Gesamtpunkte aktualisieren
        summaryData.total_points = summaryData.points.reduce((sum, p) => sum + (p.amount || 0), 0);
        summaryData.updated_at = new Date().toISOString();

        const { error } = await supabase
            .from('community_posts')
            .update({
                content: TRAINING_SUMMARY_PREFIX + JSON.stringify(summaryData),
                updated_at: new Date().toISOString()
            })
            .eq('id', summary.id);

        if (error) throw error;
        console.log('[TrainingSummary] Added points to summary for player', playerId);
        return true;
    } catch (error) {
        console.error('[TrainingSummary] Error adding points:', error);
        return false;
    }
}

/**
 * Findet eine Training-Zusammenfassung für einen Spieler/Event/Datum
 */
async function findTrainingSummary(playerId, eventId, eventDate) {
    console.log('[TrainingSummary] findTrainingSummary:', { playerId, eventId, eventDate });
    const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('user_id', playerId)
        .ilike('content', `${TRAINING_SUMMARY_PREFIX}%`)
        .is('deleted_at', null);

    console.log('[TrainingSummary] findTrainingSummary result - data:', data?.length, 'error:', error);
    if (error || !data) return null;

    // Finde den Eintrag mit passendem Event und Datum
    return data.find(post => {
        const summaryData = parseTrainingSummaryContent(post.content);
        return summaryData.event_id === eventId && summaryData.event_date === eventDate;
    });
}

/**
 * Findet eine Training-Zusammenfassung für einen Spieler an einem bestimmten Datum
 */
async function findTrainingSummaryByDate(playerId, eventDate) {
    const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('user_id', playerId)
        .ilike('content', `${TRAINING_SUMMARY_PREFIX}%`)
        .is('deleted_at', null);

    if (error || !data) return null;

    // Finde den Eintrag mit passendem Datum
    return data.find(post => {
        const summaryData = parseTrainingSummaryContent(post.content);
        return summaryData.event_date === eventDate;
    });
}

/**
 * Parsed den Content einer Training-Zusammenfassung
 */
export function parseTrainingSummaryContent(content) {
    if (!content || !content.startsWith(TRAINING_SUMMARY_PREFIX)) {
        return null;
    }
    try {
        return JSON.parse(content.substring(TRAINING_SUMMARY_PREFIX.length));
    } catch (e) {
        console.error('[TrainingSummary] Error parsing content:', e);
        return null;
    }
}

/**
 * Prüft ob ein Post eine Training-Zusammenfassung ist
 */
export function isTrainingSummary(content) {
    return content && content.startsWith(TRAINING_SUMMARY_PREFIX);
}

/**
 * Rendert eine Training-Zusammenfassung für das Activity Feed
 */
export function renderTrainingSummaryCard(activity, profileMap) {
    const summaryData = parseTrainingSummaryContent(activity.content);
    if (!summaryData) return '';

    const profile = profileMap ? profileMap[activity.user_id] : null;
    const eventDate = new Date(summaryData.event_date + 'T12:00:00');
    const dateStr = eventDate.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    const pointsHtml = summaryData.points.length > 0 ? `
        <div class="mt-3 space-y-1">
            <p class="text-sm font-medium text-gray-700">Punkte erhalten:</p>
            ${summaryData.points.map(p => {
                const sign = p.amount >= 0 ? '+' : '';
                const colorClass = p.amount >= 0 ? 'text-green-600' : 'text-red-600';
                const reasonText = p.exercise_name || p.reason || 'Punkte';
                return `<div class="flex items-center gap-2 text-sm">
                    <span class="${colorClass} font-semibold">${sign}${p.amount}</span>
                    <span class="text-gray-600">${reasonText}</span>
                </div>`;
            }).join('')}
        </div>
        <div class="mt-3 pt-3 border-t border-gray-100">
            <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-700">Gesamt:</span>
                <span class="text-lg font-bold ${summaryData.total_points >= 0 ? 'text-green-600' : 'text-red-600'}">
                    ${summaryData.total_points >= 0 ? '+' : ''}${summaryData.total_points} Punkte
                </span>
            </div>
        </div>
    ` : '';

    return `
        <div class="bg-white rounded-xl shadow-sm hover:shadow-md transition border border-gray-100 overflow-hidden">
            <!-- Training Summary Banner -->
            <div class="px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    </svg>
                    <span class="font-bold">Training am ${dateStr}</span>
                </div>
            </div>

            <div class="p-4">
                <!-- Event Info -->
                <div class="flex items-center gap-3 mb-3">
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                        <svg class="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                    </div>
                    <div>
                        <h4 class="font-semibold text-gray-900">${summaryData.event_title || 'Training'}</h4>
                        <p class="text-sm text-gray-500">
                            ${summaryData.attended ?
                                '<span class="text-green-600"><i class="fas fa-check-circle mr-1"></i>Du warst anwesend</span>' :
                                '<span class="text-gray-500">Nicht anwesend</span>'
                            }
                        </p>
                    </div>
                </div>

                ${pointsHtml}
            </div>
        </div>
    `;
}

/**
 * Erstellt Training-Zusammenfassungen für alle anwesenden Spieler
 * @param {string} clubId - Club-ID
 * @param {string} eventId - Event-ID
 * @param {string} eventDate - Datum des Events
 * @param {string} eventTitle - Titel des Events
 * @param {string[]} presentPlayerIds - IDs der anwesenden Spieler
 */
export async function createTrainingSummariesForAttendees(clubId, eventId, eventDate, eventTitle, presentPlayerIds) {
    if (!presentPlayerIds || presentPlayerIds.length === 0) return;

    console.log(`[TrainingSummary] Creating summaries for ${presentPlayerIds.length} attendees`);

    for (const playerId of presentPlayerIds) {
        await createOrUpdateTrainingSummary(playerId, clubId, eventId, eventDate, eventTitle, true);
    }
}
