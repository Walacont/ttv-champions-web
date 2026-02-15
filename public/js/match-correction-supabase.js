// Match Correction Module (Supabase-Version)
// Handles correction request UI, submission, and acceptance flow.

import { getSupabase } from './supabase-init.js';
import { getSportContext } from './sport-context-supabase.js';
import { createSetScoreInput } from './dashboard-match-form-supabase.js';
import { createTennisScoreInput, createBadmintonScoreInput } from './player-matches-supabase.js';
import { escapeHtml } from './utils/security.js';
import { t } from './i18n.js';

const supabase = getSupabase();

let correctionScoreHandler = null;
let currentUser = null;
let currentUserData = null;
let currentSportContext = null;

/** Initialize module with user data */
export function initMatchCorrectionModule(user, userData, sportContext) {
    currentUser = user;
    currentUserData = userData;
    currentSportContext = sportContext;
}

/**
 * Check if a match is eligible for correction
 * @param {Object} match - The match object
 * @param {Object} currentSeason - The current active season (or null)
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function isCorrectionEligible(match, currentSeason) {
    // Tournament matches excluded
    if (match.tournament_match_id) {
        return { eligible: false, reason: 'tournament' };
    }

    // Already corrected
    if (match.is_corrected) {
        return { eligible: false, reason: 'already_corrected' };
    }

    // Must be a participant
    const userId = currentUser?.id;
    if (userId && match.player_a_id !== userId && match.player_b_id !== userId) {
        return { eligible: false, reason: 'not_participant' };
    }

    // Must be within current season
    if (currentSeason) {
        const matchDate = new Date(match.played_at || match.created_at);
        const seasonStart = new Date(currentSeason.start_date);
        if (matchDate < seasonStart) {
            return { eligible: false, reason: 'old_season' };
        }
    }

    return { eligible: true };
}

/**
 * Open the correction request modal for a given match
 * @param {Object} match - The match to correct
 * @param {Object} profileMap - Map of player profiles
 */
export async function openCorrectionModal(match, profileMap) {
    const modal = document.getElementById('match-correction-modal');
    if (!modal) return;

    const playerA = profileMap[match.player_a_id] || {};
    const playerB = profileMap[match.player_b_id] || {};
    const playerAName = escapeHtml(
        playerA.display_name ||
            `${playerA.first_name || ''} ${playerA.last_name || ''}`.trim() ||
            'Spieler A'
    );
    const playerBName = escapeHtml(
        playerB.display_name ||
            `${playerB.first_name || ''} ${playerB.last_name || ''}`.trim() ||
            'Spieler B'
    );

    // Show original result using safe DOM methods
    const originalResultEl = document.getElementById('correction-original-result');
    if (originalResultEl) {
        const sets = match.sets || [];
        const setsDisplay = sets
            .map(s => `${parseInt(s.playerA) || 0}:${parseInt(s.playerB) || 0}`)
            .join(', ');
        const winnerName = match.winner_id === match.player_a_id ? playerAName : playerBName;

        // Clear and rebuild with safe methods
        originalResultEl.textContent = '';

        const pPlayers = document.createElement('p');
        pPlayers.className = 'text-sm font-medium text-gray-700 mb-1';
        pPlayers.textContent = `${playerAName} vs ${playerBName}`;
        originalResultEl.appendChild(pPlayers);

        const pSets = document.createElement('p');
        pSets.className = 'text-sm text-gray-600';
        pSets.textContent = setsDisplay;
        originalResultEl.appendChild(pSets);

        const pWinner = document.createElement('p');
        pWinner.className = 'text-sm text-green-700';
        pWinner.textContent = `${t('common.winner')}: ${winnerName}`;
        originalResultEl.appendChild(pWinner);
    }

    // Set player labels
    const playerALabel = document.getElementById('correction-player-a-label');
    const playerBLabel = document.getElementById('correction-player-b-label');
    if (playerALabel) playerALabel.textContent = playerAName;
    if (playerBLabel) playerBLabel.textContent = playerBName;

    // Initialize score input based on sport
    const scoreContainer = document.getElementById('correction-score-container');
    if (scoreContainer) {
        const sportName = currentSportContext?.sportName;
        const matchMode = match.match_mode || 'best-of-5';

        if (sportName && ['tennis', 'padel'].includes(sportName)) {
            correctionScoreHandler = createTennisScoreInput(scoreContainer, [], {
                mode: matchMode,
            });
        } else if (sportName === 'badminton') {
            correctionScoreHandler = createBadmintonScoreInput(scoreContainer, [], matchMode);
        } else {
            correctionScoreHandler = createSetScoreInput(scoreContainer, [], matchMode);
        }
    }

    // Clear reason
    const reasonEl = document.getElementById('correction-reason');
    if (reasonEl) reasonEl.value = '';

    // Clear feedback
    const feedbackEl = document.getElementById('correction-feedback');
    if (feedbackEl) feedbackEl.classList.add('hidden');

    // Store match data
    modal.dataset.matchId = match.id;
    modal.dataset.playerAId = match.player_a_id;
    modal.dataset.playerBId = match.player_b_id;
    modal.dataset.sportId = match.sport_id || '';
    modal.dataset.clubId = match.club_id || '';
    modal.dataset.matchMode = match.match_mode || 'best-of-5';
    modal.dataset.handicapUsed = match.handicap_used ? 'true' : 'false';

    // Show modal
    modal.classList.remove('hidden');
}

/** Close the correction modal */
export function closeCorrectionModal() {
    const modal = document.getElementById('match-correction-modal');
    if (modal) {
        modal.classList.add('hidden');
        correctionScoreHandler = null;
    }
}

/** Submit correction request */
export async function submitCorrectionRequest() {
    const modal = document.getElementById('match-correction-modal');
    const feedbackEl = document.getElementById('correction-feedback');
    if (!modal || !correctionScoreHandler) return;

    const matchId = modal.dataset.matchId;
    const playerAId = modal.dataset.playerAId;
    const playerBId = modal.dataset.playerBId;
    const sportId = modal.dataset.sportId || null;
    const clubId = modal.dataset.clubId || null;
    const matchMode = modal.dataset.matchMode || 'best-of-5';
    const handicapUsed = modal.dataset.handicapUsed === 'true';
    const reason = document.getElementById('correction-reason')?.value?.trim() || '';

    if (!reason) {
        showCorrectionFeedback(feedbackEl, t('dashboard.correctionReason') + ' fehlt', 'error');
        return;
    }

    // Validate score
    const validation = correctionScoreHandler.validate();
    if (!validation.valid) {
        showCorrectionFeedback(feedbackEl, validation.error, 'error');
        return;
    }

    const sets = correctionScoreHandler.getSets();
    const winnerId = validation.winnerId === 'A' ? playerAId : playerBId;
    const loserId = validation.winnerId === 'A' ? playerBId : playerAId;

    // Requester is always player_a in the correction request
    const requestPlayerBId = currentUser.id === playerAId ? playerBId : playerAId;

    try {
        const { error } = await supabase.from('match_requests').insert({
            player_a_id: currentUser.id,
            player_b_id: requestPlayerBId,
            club_id: clubId || null,
            sport_id: sportId || null,
            sets: sets,
            match_mode: matchMode,
            handicap_used: handicapUsed,
            winner_id: winnerId,
            loser_id: loserId,
            status: 'pending_player',
            corrects_match_id: matchId,
            correction_reason: reason,
            approvals: JSON.stringify({
                player_a: true,
                player_b: false,
                coach_a: null,
                coach_b: null,
            }),
            created_at: new Date().toISOString(),
        });

        if (error) throw error;

        showCorrectionFeedback(feedbackEl, t('dashboard.correctionSuccess'), 'success');

        setTimeout(() => {
            closeCorrectionModal();
            // Refresh pending requests
            if (window.loadMatchRequests) window.loadMatchRequests();
            if (window.loadPendingRequests) window.loadPendingRequests();
        }, 1500);
    } catch (error) {
        console.error('Error submitting correction request:', error);
        if (error.message?.includes('idx_one_pending_correction')) {
            showCorrectionFeedback(feedbackEl, t('dashboard.correctionAlreadyPending'), 'error');
        } else {
            showCorrectionFeedback(
                feedbackEl,
                t('dashboard.correctionError') + ': ' + error.message,
                'error'
            );
        }
    }
}

/**
 * Handle correction acceptance: reverse old match, create new match
 * @param {Object} request - The match request with corrects_match_id
 * @returns {Promise<{success: boolean, newMatchId?: string, error?: string}>}
 */
export async function acceptCorrection(request) {
    try {
        // 1. Reverse old match effects
        const { data: result, error: rpcError } = await supabase.rpc('reverse_match_effects', {
            p_match_id: request.corrects_match_id,
        });

        if (rpcError) throw rpcError;

        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        if (!parsed?.success) {
            return { success: false, error: parsed?.error || 'Reversal failed' };
        }

        // 2. Create new match (trigger handles Elo processing)
        const matchData = {
            player_a_id: request.player_a_id,
            player_b_id: request.player_b_id,
            sport_id: request.sport_id,
            winner_id: request.winner_id,
            loser_id: request.loser_id,
            sets: request.sets,
            player_a_sets_won: request.player_a_sets_won || 0,
            player_b_sets_won: request.player_b_sets_won || 0,
            handicap_used: request.handicap_used || false,
            match_mode: request.match_mode || 'best-of-5',
            played_at: request.created_at || new Date().toISOString(),
        };

        if (request.club_id) {
            matchData.club_id = request.club_id;
        }

        const { data: newMatch, error: matchError } = await supabase
            .from('matches')
            .insert(matchData)
            .select('id')
            .single();

        if (matchError) throw matchError;

        // 3. Link old match to new match
        if (newMatch?.id) {
            await supabase
                .from('matches')
                .update({ corrected_by_match_id: newMatch.id })
                .eq('id', request.corrects_match_id);
        }

        return { success: true, newMatchId: newMatch?.id };
    } catch (error) {
        console.error('Error accepting correction:', error);
        return { success: false, error: error.message };
    }
}

function showCorrectionFeedback(element, message, type) {
    if (!element) return;

    element.className = `mt-3 p-3 rounded-lg text-sm font-medium ${
        type === 'success'
            ? 'bg-green-100 text-green-800'
            : type === 'error'
              ? 'bg-red-100 text-red-800'
              : 'bg-blue-100 text-blue-800'
    }`;
    element.textContent = message;
    element.classList.remove('hidden');

    if (type === 'success') {
        setTimeout(() => element.classList.add('hidden'), 3000);
    }
}
