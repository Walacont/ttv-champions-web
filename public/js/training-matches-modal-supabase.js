// Training Matches Modal - Trainingswettkämpfe nach Anwesenheit
// Ermöglicht schnelle Wettkampf-Eingabe für anwesende Spieler

import { getSupabase } from './supabase-init.js';
import { escapeHtml } from './utils/security.js';

const supabase = getSupabase();

let tmPlayerAId = null;
let tmPlayerBId = null;
let tmPresentPlayers = []; // Only present players
let tmUserData = null;
let tmEventDate = null;
let tmSessionId = null;
let tmEnteredMatches = []; // Track entered matches

// Callbacks for flow transitions
let onDoneCallback = null; // Called when "Fertig" is clicked
let onPointsCallback = null; // Called when "Punkte vergeben" is chosen

export function initTrainingMatchesModal() {
    document.getElementById('close-training-matches-modal')?.addEventListener('click', closeTrainingMatchesModal);
    document.getElementById('tm-done-btn')?.addEventListener('click', handleDone);
    document.getElementById('tm-save-next-btn')?.addEventListener('click', handleSaveAndNext);
    document.getElementById('tm-swap-players')?.addEventListener('click', swapPlayers);

    // Score inputs
    document.getElementById('tm-sets-a')?.addEventListener('input', updateWinnerDisplay);
    document.getElementById('tm-sets-b')?.addEventListener('input', updateWinnerDisplay);
    document.getElementById('tm-match-mode')?.addEventListener('change', updateMaxSets);

    // Search
    setupSearch();
}

export function openTrainingMatchesModal(presentPlayerIds, clubPlayers, userData, eventDate, sessionId, callbacks = {}) {
    const modal = document.getElementById('training-matches-modal');
    if (!modal) return;

    tmUserData = userData;
    tmEventDate = eventDate || new Date().toISOString().split('T')[0];
    tmSessionId = sessionId;
    tmEnteredMatches = [];
    onDoneCallback = callbacks.onDone || null;
    onPointsCallback = callbacks.onPoints || null;

    // Filter to only present players
    tmPresentPlayers = clubPlayers.filter(p => presentPlayerIds.includes(p.id));

    resetSelection();
    renderPlayerChips();
    renderMatchesList();
    updateSaveButton();
    updateMaxSets();

    // Update done button text based on available callbacks
    const doneBtn = document.getElementById('tm-done-btn');
    if (doneBtn) {
        doneBtn.textContent = 'Fertig';
    }

    // Clear feedback
    const feedback = document.getElementById('tm-feedback');
    if (feedback) {
        feedback.textContent = '';
        feedback.className = 'text-sm font-medium text-center';
    }

    modal.classList.remove('hidden');
}

export function closeTrainingMatchesModal() {
    const modal = document.getElementById('training-matches-modal');
    if (modal) modal.classList.add('hidden');
    resetSelection();
}

// ---- Player Chips ----

function renderPlayerChips() {
    const container = document.getElementById('tm-player-chips');
    if (!container) return;
    container.innerHTML = '';

    tmPresentPlayers.forEach(player => {
        const firstName = player.firstName || player.first_name || '';
        const lastName = player.lastName || player.last_name || '';
        const elo = Math.round(player.eloRating || player.elo_rating || 0);

        const chip = document.createElement('button');
        chip.type = 'button';
        chip.dataset.playerId = player.id;
        chip.dataset.playerName = `${firstName} ${lastName}`.toLowerCase();
        chip.className = 'px-3 py-1.5 text-sm font-medium rounded-full border transition-all cursor-pointer select-none bg-white border-gray-300 text-gray-700 hover:bg-gray-100';
        chip.innerHTML = `${escapeHtml(firstName)} ${escapeHtml(lastName)} <span class="text-xs opacity-70">${elo}</span>`;
        chip.addEventListener('click', () => handleChipClick(player.id));
        container.appendChild(chip);
    });
}

function handleChipClick(playerId) {
    if (tmPlayerAId === playerId) {
        tmPlayerAId = null;
    } else if (tmPlayerBId === playerId) {
        tmPlayerBId = null;
    } else if (!tmPlayerAId) {
        tmPlayerAId = playerId;
    } else if (!tmPlayerBId) {
        tmPlayerBId = playerId;
    } else {
        tmPlayerBId = playerId;
    }

    updateChipStates();
    updateSelectedDisplay();
    updateSaveButton();
    updateWinnerDisplay();
}

function updateChipStates() {
    const container = document.getElementById('tm-player-chips');
    if (!container) return;

    container.querySelectorAll('[data-player-id]').forEach(chip => {
        const pid = chip.dataset.playerId;
        chip.classList.remove(
            'bg-blue-500', 'text-white', 'border-blue-600', 'ring-2', 'ring-blue-300',
            'bg-red-500', 'border-red-600', 'ring-red-300',
            'bg-white', 'border-gray-300', 'text-gray-700', 'hover:bg-gray-100'
        );

        if (pid === tmPlayerAId) {
            chip.classList.add('bg-blue-500', 'text-white', 'border-blue-600', 'ring-2', 'ring-blue-300');
        } else if (pid === tmPlayerBId) {
            chip.classList.add('bg-red-500', 'text-white', 'border-red-600', 'ring-2', 'ring-red-300');
        } else {
            chip.classList.add('bg-white', 'border-gray-300', 'text-gray-700', 'hover:bg-gray-100');
        }
    });
}

function updateSelectedDisplay() {
    const nameA = document.getElementById('tm-player-a-name');
    const nameB = document.getElementById('tm-player-b-name');
    if (!nameA || !nameB) return;

    if (tmPlayerAId) {
        const p = tmPresentPlayers.find(pl => pl.id === tmPlayerAId);
        nameA.textContent = p ? `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() : '?';
    } else {
        nameA.textContent = '-- antippen --';
    }

    if (tmPlayerBId) {
        const p = tmPresentPlayers.find(pl => pl.id === tmPlayerBId);
        nameB.textContent = p ? `${p.firstName || p.first_name || ''} ${p.lastName || p.last_name || ''}`.trim() : '?';
    } else {
        nameB.textContent = '-- antippen --';
    }
}

function swapPlayers() {
    const tmp = tmPlayerAId;
    tmPlayerAId = tmPlayerBId;
    tmPlayerBId = tmp;
    updateChipStates();
    updateSelectedDisplay();
    updateWinnerDisplay();
}

function resetSelection() {
    tmPlayerAId = null;
    tmPlayerBId = null;

    const setsA = document.getElementById('tm-sets-a');
    const setsB = document.getElementById('tm-sets-b');
    if (setsA) setsA.value = '';
    if (setsB) setsB.value = '';

    updateChipStates();
    updateSelectedDisplay();
    updateSaveButton();

    const winnerInfo = document.getElementById('tm-winner-info');
    if (winnerInfo) winnerInfo.classList.add('hidden');
}

// ---- Score / Winner ----

function getSetsToWin() {
    const mode = document.getElementById('tm-match-mode')?.value || 'best-of-5';
    if (mode === 'single-set') return 1;
    if (mode === 'best-of-3') return 2;
    if (mode === 'best-of-5') return 3;
    if (mode === 'best-of-7') return 4;
    return 3;
}

function updateMaxSets() {
    const max = getSetsToWin();
    const setsA = document.getElementById('tm-sets-a');
    const setsB = document.getElementById('tm-sets-b');
    if (setsA) setsA.max = max;
    if (setsB) setsB.max = max;
}

function updateWinnerDisplay() {
    const setsA = parseInt(document.getElementById('tm-sets-a')?.value) || 0;
    const setsB = parseInt(document.getElementById('tm-sets-b')?.value) || 0;
    const winnerInfo = document.getElementById('tm-winner-info');
    const winnerName = document.getElementById('tm-winner-name');

    if (!winnerInfo || !winnerName) return;

    const setsToWin = getSetsToWin();

    if ((setsA >= setsToWin || setsB >= setsToWin) && setsA !== setsB && tmPlayerAId && tmPlayerBId) {
        const winnerId = setsA > setsB ? tmPlayerAId : tmPlayerBId;
        const winner = tmPresentPlayers.find(p => p.id === winnerId);
        if (winner) {
            winnerName.textContent = `${winner.firstName || winner.first_name || ''} ${winner.lastName || winner.last_name || ''}`.trim();
            winnerInfo.classList.remove('hidden');
        }
    } else {
        winnerInfo.classList.add('hidden');
    }

    updateSaveButton();
}

function updateSaveButton() {
    const btn = document.getElementById('tm-save-next-btn');
    if (!btn) return;

    const setsA = parseInt(document.getElementById('tm-sets-a')?.value) || 0;
    const setsB = parseInt(document.getElementById('tm-sets-b')?.value) || 0;
    const setsToWin = getSetsToWin();

    const valid = tmPlayerAId && tmPlayerBId && tmPlayerAId !== tmPlayerBId
        && (setsA >= setsToWin || setsB >= setsToWin)
        && setsA !== setsB
        && setsA <= setsToWin && setsB <= setsToWin;

    btn.disabled = !valid;
}

// ---- Search ----

function setupSearch() {
    const searchInput = document.getElementById('tm-player-search');
    const searchClear = document.getElementById('tm-player-search-clear');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        if (searchClear) searchClear.classList.toggle('hidden', !query);

        const container = document.getElementById('tm-player-chips');
        if (!container) return;
        container.querySelectorAll('[data-player-id]').forEach(chip => {
            const name = chip.dataset.playerName || '';
            chip.style.display = name.includes(query) ? '' : 'none';
        });
    });

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input'));
            searchInput.focus();
        });
    }
}

// ---- Save Match ----

async function handleSaveAndNext() {
    const btn = document.getElementById('tm-save-next-btn');
    const feedback = document.getElementById('tm-feedback');

    if (!tmPlayerAId || !tmPlayerBId) return;

    const setsA = parseInt(document.getElementById('tm-sets-a')?.value) || 0;
    const setsB = parseInt(document.getElementById('tm-sets-b')?.value) || 0;
    const setsToWin = getSetsToWin();
    const matchMode = document.getElementById('tm-match-mode')?.value || 'best-of-5';

    // Validation
    if (setsA < setsToWin && setsB < setsToWin) {
        if (feedback) feedback.textContent = `Ein Spieler muss ${setsToWin} Sätze gewinnen.`;
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Speichere...';

    const winnerId = setsA > setsB ? tmPlayerAId : tmPlayerBId;
    const loserId = winnerId === tmPlayerAId ? tmPlayerBId : tmPlayerAId;

    const playerA = tmPresentPlayers.find(p => p.id === tmPlayerAId);
    const playerB = tmPresentPlayers.find(p => p.id === tmPlayerBId);

    try {
        const matchData = {
            player_a_id: tmPlayerAId,
            player_b_id: tmPlayerBId,
            winner_id: winnerId,
            loser_id: loserId,
            player_a_sets_won: setsA,
            player_b_sets_won: setsB,
            sets: [],
            club_id: tmUserData.clubId || tmUserData.club_id,
            created_by: tmUserData.id,
            sport_id: tmUserData.activeSportId || tmUserData.active_sport_id || null,
            match_mode: matchMode,
            handicap_used: false,
            played_at: tmEventDate ? new Date(tmEventDate + 'T12:00:00').toISOString() : new Date().toISOString()
        };

        const { data: match, error: matchError } = await supabase
            .from('matches')
            .insert(matchData)
            .select()
            .single();

        if (matchError) throw matchError;

        // Track entered match
        const playerAName = playerA ? `${playerA.firstName || playerA.first_name || ''} ${playerA.lastName || playerA.last_name || ''}`.trim() : '?';
        const playerBName = playerB ? `${playerB.firstName || playerB.first_name || ''} ${playerB.lastName || playerB.last_name || ''}`.trim() : '?';
        const winnerIsA = winnerId === tmPlayerAId;

        tmEnteredMatches.push({
            playerAName,
            playerBName,
            setsA,
            setsB,
            winnerName: winnerIsA ? playerAName : playerBName
        });

        // Points history entries
        try {
            const winnerPoints = 3;
            const loserPoints = 1;

            await supabase.from('points_history').insert([
                {
                    user_id: winnerId,
                    points: winnerPoints,
                    xp: winnerPoints,
                    reason: `Sieg im Training gegen ${winnerIsA ? playerBName : playerAName} (${setsA}:${setsB})`,
                    timestamp: matchData.played_at,
                    awarded_by: 'System (Trainingswettkampf)'
                },
                {
                    user_id: loserId,
                    points: loserPoints,
                    xp: loserPoints,
                    reason: `Niederlage im Training gegen ${winnerIsA ? playerAName : playerBName} (${setsA}:${setsB})`,
                    timestamp: matchData.played_at,
                    awarded_by: 'System (Trainingswettkampf)'
                }
            ]);

            // Update profiles
            await Promise.all([
                supabase.rpc('increment_points', { user_id: winnerId, amount: winnerPoints }),
                supabase.rpc('increment_points', { user_id: loserId, amount: loserPoints })
            ]).catch(() => {
                // Fallback: direct update if RPC doesn't exist
                console.log('[TrainingMatches] RPC increment not available, points tracked in history');
            });
        } catch (pointsErr) {
            console.warn('[TrainingMatches] Points history error:', pointsErr);
        }

        // Success
        if (feedback) {
            feedback.textContent = `Match gespeichert! (${playerAName} ${setsA}:${setsB} ${playerBName})`;
            feedback.className = 'text-sm font-medium text-center text-green-600';
        }

        renderMatchesList();

        // Reset for next match (keep match mode)
        resetSelection();
        renderPlayerChips();

        // Brief flash on chips
        const chipsContainer = document.getElementById('tm-player-chips');
        if (chipsContainer) {
            chipsContainer.classList.add('ring-2', 'ring-green-400', 'rounded-lg');
            setTimeout(() => chipsContainer.classList.remove('ring-2', 'ring-green-400', 'rounded-lg'), 1000);
        }

        setTimeout(() => {
            if (feedback) {
                feedback.textContent = '';
                feedback.className = 'text-sm font-medium text-center';
            }
        }, 2000);

    } catch (error) {
        console.error('[TrainingMatches] Save error:', error);
        if (feedback) {
            feedback.textContent = `Fehler: ${error.message}`;
            feedback.className = 'text-sm font-medium text-center text-red-600';
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Speichern & Weiter';
        updateSaveButton();
    }
}

function handleDone() {
    const matchCount = tmEnteredMatches.length;
    closeTrainingMatchesModal();

    // Show transition choice if there's a points callback
    if (onPointsCallback) {
        showPostMatchesChoice(matchCount);
    }
}

function showPostMatchesChoice(matchCount) {
    const modal = document.getElementById('post-attendance-choice-modal');
    if (!modal) return;

    const title = modal.querySelector('h3');
    const subtitle = modal.querySelector('p.text-sm');
    const iconContainer = modal.querySelector('.w-12.h-12');
    const iconEl = iconContainer?.querySelector('i');

    if (title) title.textContent = matchCount > 0 ? `${matchCount} Match${matchCount > 1 ? 'es' : ''} gespeichert!` : 'Wettkämpfe fertig!';
    if (subtitle) subtitle.textContent = 'Möchtest du noch Punkte vergeben?';
    if (iconEl) {
        iconEl.className = 'fas fa-table-tennis-paddle-ball text-green-600 text-xl';
    }
    if (iconContainer) {
        iconContainer.className = 'w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3';
    }

    // Show Points button, hide Matches button
    const pointsBtn = document.getElementById('post-attendance-points-btn');
    const matchesBtn = document.getElementById('post-attendance-matches-btn');
    if (pointsBtn) pointsBtn.classList.remove('hidden');
    if (matchesBtn) matchesBtn.classList.add('hidden');

    modal.classList.remove('hidden');
}

// ---- Matches List ----

function renderMatchesList() {
    const container = document.getElementById('tm-matches-list-container');
    const list = document.getElementById('tm-matches-list');
    const count = document.getElementById('tm-matches-count');
    if (!container || !list || !count) return;

    if (tmEnteredMatches.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    count.textContent = tmEnteredMatches.length;
    list.innerHTML = '';

    tmEnteredMatches.forEach((m, i) => {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xs text-gray-400 font-mono">#${i + 1}</span>
                <span class="font-medium">${escapeHtml(m.playerAName)}</span>
                <span class="font-bold text-indigo-600">${m.setsA}:${m.setsB}</span>
                <span class="font-medium">${escapeHtml(m.playerBName)}</span>
            </div>
            <span class="text-xs text-green-600 font-medium"><i class="fas fa-trophy text-yellow-500"></i> ${escapeHtml(m.winnerName)}</span>
        `;
        list.appendChild(div);
    });

    // Scroll to bottom
    list.scrollTop = list.scrollHeight;
}
