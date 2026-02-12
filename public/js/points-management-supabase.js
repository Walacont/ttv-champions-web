// Punkteverwaltung (Supabase-Version)

import { getSupabase } from './supabase-init.js';
import { formatDate } from './ui-utils-supabase.js';

let notificationsModule = null;
let notificationsLoaded = false;

async function getNotificationsModule() {
    if (notificationsLoaded) return notificationsModule;
    notificationsLoaded = true;
    try {
        notificationsModule = await import('./notifications-supabase.js');
        return notificationsModule;
    } catch (e) {
        console.warn('Notifications module not available:', e);
        return null;
    }
}

/** Holt den aktuellen Saison-Schlüssel */
async function getCurrentSeasonKey(supabase) {
    try {
        const { data, error } = await supabase
            .from('config')
            .select('value')
            .eq('key', 'seasonReset')
            .single();

        if (error) throw error;

        if (data && data.value && data.value.lastResetDate) {
            const lastResetDate = new Date(data.value.lastResetDate);
            return `${lastResetDate.getMonth() + 1}-${lastResetDate.getFullYear()}`;
        } else {
            const now = new Date();
            return `${now.getMonth() + 1}-${now.getFullYear()}`;
        }
    } catch (error) {
        console.error('Error getting season key:', error);
        const now = new Date();
        return `${now.getMonth() + 1}-${now.getFullYear()}`;
    }
}

/** Lädt die Punktehistorie eines Spielers (Dashboard-Ansicht) */
export function loadPointsHistory(userData, db, unsubscribes) {
    const pointsHistoryEl = document.getElementById('points-history');
    if (!pointsHistoryEl) return;

    loadHistory();

    const subscription = db
        .channel('points-history-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'points_history',
            filter: `user_id=eq.${userData.id}`
        }, () => {
            loadHistory();
        })
        .subscribe();

    unsubscribes.push(() => subscription.unsubscribe());

    async function loadHistory() {
        const { data: historyData, error } = await db
            .from('points_history')
            .select('*')
            .eq('user_id', userData.id)
            .order('timestamp', { ascending: false });

        if (error) {
            console.error('Error loading points history:', error);
            pointsHistoryEl.innerHTML = `<li><p class="text-gray-400">Fehler beim Laden der Historie.</p></li>`;
            return;
        }

        if (!historyData || historyData.length === 0) {
            pointsHistoryEl.innerHTML = `<li><p class="text-gray-400">Noch keine Punkte erhalten.</p></li>`;
            return;
        }

        pointsHistoryEl.innerHTML = '';

        historyData.forEach(entry => {
            const pointsClass = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-gray-600';
            const sign = entry.points > 0 ? '+' : entry.points < 0 ? '' : '±';
            const date = formatDate(entry.timestamp) || '...';

            const xpChange = entry.xp !== undefined ? entry.xp : entry.points;
            const eloChange = entry.elo_change !== undefined ? entry.elo_change : 0;

            let detailsHTML = `<span class="font-bold ${pointsClass}">${sign}${entry.points} Pkt</span>`;

            const details = [];
            if (xpChange !== 0) {
                const xpSign = xpChange > 0 ? '+' : xpChange < 0 ? '' : '±';
                const xpClass = xpChange > 0 ? 'text-green-600' : xpChange < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${xpClass}">${xpSign}${xpChange} XP</span>`);
            }
            if (eloChange !== 0) {
                const eloSign = eloChange > 0 ? '+' : eloChange < 0 ? '' : '±';
                const eloClass = eloChange > 0 ? 'text-blue-600' : eloChange < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${eloClass}">${eloSign}${eloChange} Elo</span>`);
            }

            if (details.length > 0) {
                detailsHTML += `<span class="text-xs text-gray-500 block mt-1">${details.join(' • ')}</span>`;
            }

            let partnerBadge = '';
            if (entry.is_active_player) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">💪 Aktiv</span>';
            } else if (entry.is_partner) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">🤝 Partner</span>';
            }

            const li = document.createElement('li');
            li.className = 'flex justify-between items-start text-sm';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}${partnerBadge}</p>
                    <p class="text-xs text-gray-500">${date}</p>
                </div>
                <div class="text-right">${detailsHTML}</div>
            `;
            pointsHistoryEl.appendChild(li);
        });
    }
}

/** Lädt Punktehistorie für einen bestimmten Spieler (Trainer-Ansicht) */
export function loadPointsHistoryForCoach(playerId, db, setUnsubscribe) {
    const historyListEl = document.getElementById('coach-points-history-list');
    if (!historyListEl) return;

    if (!playerId) {
        historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Bitte einen Spieler auswählen, um die Historie anzuzeigen.</li>';
        return;
    }

    historyListEl.innerHTML = '<li class="text-center text-gray-500 py-4">Lade Historie...</li>';

    loadHistory();

    const subscription = db
        .channel(`coach-points-history-${playerId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'points_history',
            filter: `user_id=eq.${playerId}`
        }, () => {
            loadHistory();
        })
        .subscribe();

    setUnsubscribe(() => subscription.unsubscribe());

    async function loadHistory() {
        const { data: historyData, error } = await db
            .from('points_history')
            .select('*')
            .eq('user_id', playerId)
            .order('timestamp', { ascending: false });

        if (error || !historyData || historyData.length === 0) {
            historyListEl.innerHTML = `<li><p class="text-center text-gray-400 py-4">Für diesen Spieler gibt es noch keine Einträge.</p></li>`;
            return;
        }

        historyListEl.innerHTML = '';

        historyData.forEach(entry => {
            const pointsClass = entry.points > 0 ? 'text-green-600' : entry.points < 0 ? 'text-red-600' : 'text-gray-600';
            const sign = entry.points > 0 ? '+' : entry.points < 0 ? '' : '±';
            const date = formatDate(entry.timestamp) || '...';

            const xpChange = entry.xp !== undefined ? entry.xp : entry.points;
            const eloChange = entry.elo_change !== undefined ? entry.elo_change : 0;

            let detailsHTML = `<span class="font-bold ${pointsClass}">${sign}${entry.points} Pkt</span>`;

            const details = [];
            if (xpChange !== 0) {
                const xpSign = xpChange > 0 ? '+' : xpChange < 0 ? '' : '±';
                const xpClass = xpChange > 0 ? 'text-green-600' : xpChange < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${xpClass}">${xpSign}${xpChange} XP</span>`);
            }
            if (eloChange !== 0) {
                const eloSign = eloChange > 0 ? '+' : eloChange < 0 ? '' : '±';
                const eloClass = eloChange > 0 ? 'text-blue-600' : eloChange < 0 ? 'text-red-600' : 'text-gray-600';
                details.push(`<span class="${eloClass}">${eloSign}${eloChange} Elo</span>`);
            }

            if (details.length > 0) {
                detailsHTML += `<span class="text-xs text-gray-500 block mt-1">${details.join(' • ')}</span>`;
            }

            let partnerBadge = '';
            if (entry.is_active_player) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 ml-2">💪 Aktiv</span>';
            } else if (entry.is_partner) {
                partnerBadge = '<span class="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 ml-2">🤝 Partner</span>';
            }

            const li = document.createElement('li');
            li.className = 'flex justify-between items-start text-sm bg-gray-50 p-2 rounded-md';
            li.innerHTML = `
                <div>
                    <p class="font-medium">${entry.reason}${partnerBadge}</p>
                    <p class="text-xs text-gray-500">${date} - ${entry.awarded_by || 'Unbekannt'}</p>
                </div>
                <div class="text-right">${detailsHTML}</div>
            `;
            historyListEl.appendChild(li);
        });
    }
}

/** Befüllt das Spieler-Dropdown für die Punkte-Historie */
export function populateHistoryFilterDropdown(clubPlayers) {
    const select = document.getElementById('history-player-filter');
    if (!select) return;

    select.innerHTML = '<option value="">Bitte Spieler wählen...</option>';
    clubPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = `${player.firstName} ${player.lastName}`;
        select.appendChild(option);
    });
}

/** Verarbeitet das Punkteformular (Trainer vergibt Punkte) — unterstützt Mehrfachauswahl */
export async function handlePointsFormSubmit(e, db, currentUserData, handleReasonChangeCallback) {
    e.preventDefault();
    const feedbackEl = document.getElementById('points-feedback');
    const reasonType = document.getElementById('reason-select').value;
    feedbackEl.textContent = '';

    // Mehrfachauswahl: Spieler-IDs aus Checkboxen lesen
    let { getSelectedPointsPlayerIds } = await import('./player-management-supabase.js');
    let playerIds = getSelectedPointsPlayerIds();

    // Fallback auf alte Einzelauswahl
    if (playerIds.length === 0) {
        const singleId = document.getElementById('player-select').value;
        if (singleId) playerIds = [singleId];
    }

    if (playerIds.length === 0 || !reasonType) {
        feedbackEl.textContent = 'Bitte mindestens einen Spieler und einen Grund auswählen.';
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
        return;
    }

    // Bei mehreren Spielern: Batch-Modus
    if (playerIds.length > 1) {
        await handleBatchPointsSubmit(playerIds, reasonType, db, currentUserData, feedbackEl, handleReasonChangeCallback);
        return;
    }

    // Einzelspieler: bestehende Logik
    const playerId = playerIds[0];

    let points = 0;
    let xpChange = 0;
    let reason = '';
    let challengeId = null;
    let exerciseId = null;
    let challengeSubgroupId = null;

    try {
        switch (reasonType) {
            case 'challenge':
                const cSelect = document.getElementById('challenge-select');
                const cOption = cSelect.options[cSelect.selectedIndex];
                if (!cOption || !cOption.value) throw new Error('Bitte eine Challenge auswählen.');

                const challengeHasMilestones = cOption.dataset.hasMilestones === 'true';
                if (challengeHasMilestones) {
                    const milestoneCountInput = document.getElementById('milestone-count-input');
                    const enteredCount = parseInt(milestoneCountInput?.value);
                    const cUnit = cOption.dataset.unit || 'Wiederholungen';

                    if (!enteredCount || enteredCount <= 0) {
                        throw new Error(`Bitte gib die Anzahl der ${cUnit} ein.`);
                    }

                    const milestones = JSON.parse(cOption.dataset.milestones || '[]');
                    const achievedMilestones = milestones.filter(m => enteredCount >= m.count);

                    if (achievedMilestones.length === 0) {
                        throw new Error('Die eingegebene Anzahl erreicht keinen Meilenstein.');
                    }

                    points = achievedMilestones.reduce((sum, m) => sum + m.points, 0);
                    xpChange = points;
                    reason = `Challenge: ${cOption.dataset.title} (${enteredCount}×)`;
                } else {
                    points = parseInt(cOption.dataset.points);
                    xpChange = points;
                    reason = `Challenge: ${cOption.dataset.title}`;
                }

                challengeId = cOption.value;
                challengeSubgroupId = cOption.dataset.subgroupId || 'all';
                break;

            case 'exercise':
                const eSelect = document.getElementById('exercise-select');
                const eOption = eSelect.options[eSelect.selectedIndex];
                if (!eOption || !eOption.value) throw new Error('Bitte eine Übung auswählen.');

                const exerciseHasMilestones = eOption.dataset.hasMilestones === 'true';
                if (exerciseHasMilestones) {
                    const milestoneCountInput = document.getElementById('milestone-count-input');
                    const enteredCount = parseInt(milestoneCountInput?.value);
                    const eUnit = eOption.dataset.unit || 'Wiederholungen';

                    if (!enteredCount || enteredCount <= 0) {
                        throw new Error(`Bitte gib die Anzahl der ${eUnit} ein.`);
                    }

                    const milestones = JSON.parse(eOption.dataset.milestones || '[]');
                    const achievedMilestones = milestones.filter(m => enteredCount >= m.count);

                    if (achievedMilestones.length === 0) {
                        throw new Error('Die eingegebene Anzahl erreicht keinen Meilenstein.');
                    }

                    points = achievedMilestones.reduce((sum, m) => sum + m.points, 0);
                    xpChange = points;
                    reason = `Übung: ${eOption.dataset.title} (${enteredCount}×)`;
                } else {
                    points = parseInt(eOption.dataset.points);
                    xpChange = points;
                    reason = `Übung: ${eOption.dataset.title}`;
                }

                exerciseId = eOption.value;
                break;

            case 'manual':
                points = parseInt(document.getElementById('manual-points').value);
                xpChange = points;
                reason = document.getElementById('manual-reason').value;
                if (!reason || isNaN(points)) throw new Error('Grund und gültige Punkte müssen angegeben werden.');
                break;
        }

        let partnerId = null;
        let partnerPercentage = 0;
        let hasPartnerSystem = false;

        if (reasonType === 'exercise' || reasonType === 'challenge') {
            const selectElement = document.getElementById(`${reasonType}-select`);
            const selectedOption = selectElement?.options[selectElement.selectedIndex];
            hasPartnerSystem = selectedOption?.dataset.hasPartnerSystem === 'true';

            if (hasPartnerSystem) {
                partnerPercentage = parseInt(selectedOption.dataset.partnerPercentage) || 50;
                partnerId = document.getElementById('partner-select')?.value;

                if (partnerId && partnerId === playerId) {
                    throw new Error('Der Partner kann nicht der gleiche Spieler sein.');
                }
            }
        } else if (reasonType === 'manual') {
            const manualToggle = document.getElementById('manual-partner-toggle');
            hasPartnerSystem = manualToggle?.checked || false;

            if (hasPartnerSystem) {
                partnerPercentage = parseInt(document.getElementById('manual-partner-percentage')?.value) || 50;
                partnerId = document.getElementById('manual-partner-select')?.value;

                if (partnerId && partnerId === playerId) {
                    throw new Error('Der Partner kann nicht der gleiche Spieler sein.');
                }
            }
        }

        const { data: playerData, error: playerError } = await db
            .from('profiles')
            .select('*')
            .eq('id', playerId)
            .single();

        if (playerError || !playerData) {
            throw new Error('Spieler nicht gefunden.');
        }

        if (challengeId && challengeSubgroupId && challengeSubgroupId !== 'all') {
            const playerSubgroups = playerData.subgroup_ids || [];

            if (!playerSubgroups.includes(challengeSubgroupId)) {
                const { data: subgroupData } = await db
                    .from('subgroups')
                    .select('name')
                    .eq('id', challengeSubgroupId)
                    .single();

                const subgroupName = subgroupData?.name || 'dieser Untergruppe';
                const playerName = `${playerData.first_name} ${playerData.last_name}`;
                throw new Error(
                    `${playerName} gehört nicht der Untergruppe an, für die diese Challenge erstellt wurde. ` +
                    `Bitte füge die Person in die Untergruppe "${subgroupName}" ein, um ihr diese Challenge zuzuweisen.`
                );
            }
        }

        if (challengeId) {
            const { data: challengeData } = await db
                .from('challenges')
                .select('*')
                .eq('id', challengeId)
                .single();

            if (challengeData) {
                const isRepeatable = challengeData.is_repeatable !== false;
                const lastReactivatedAt = challengeData.last_reactivated_at || challengeData.created_at;

                if (!isRepeatable) {
                    const { data: completedData } = await db
                        .from('completed_challenges')
                        .select('*')
                        .eq('user_id', playerId)
                        .eq('challenge_id', challengeId)
                        .single();

                    if (completedData) {
                        const completedAt = new Date(completedData.completed_at);
                        const reactivatedAt = new Date(lastReactivatedAt);

                        if (completedAt > reactivatedAt) {
                            const playerName = `${playerData.first_name} ${playerData.last_name}`;
                            throw new Error(
                                `${playerName} hat diese Challenge bereits abgeschlossen. ` +
                                `Diese Challenge ist nur einmalig einlösbar.`
                            );
                        }
                    }
                }
            }
        }

        let grundlagenMessage = '';
        let grundlagenCount = playerData.grundlagen_completed || 0;
        let isGrundlagenExercise = false;

        if (exerciseId) {
            const { data: exerciseData } = await db
                .from('exercises')
                .select('category')
                .eq('id', exerciseId)
                .single();

            if (exerciseData) {
                const category = exerciseData.category || '';
                isGrundlagenExercise = category.toLowerCase().includes('grundlage');
            }
        } else if (reasonType === 'manual') {
            const lowerReason = reason.toLowerCase();
            isGrundlagenExercise = lowerReason.includes('grundlage') || lowerReason.includes('grundlagen');
        }

        const currentPoints = playerData.points || 0;
        const currentXP = playerData.xp || 0;
        const actualPointsChange = Math.max(-currentPoints, points);
        const actualXPChange = Math.max(-currentXP, xpChange);

        const updateData = {
            points: currentPoints + actualPointsChange,
            xp: currentXP + actualXPChange,
            last_xp_update: new Date().toISOString(),
        };

        if (isGrundlagenExercise && grundlagenCount < 5) {
            grundlagenCount++;
            updateData.grundlagen_completed = grundlagenCount;

            const remaining = 5 - grundlagenCount;
            if (grundlagenCount >= 5) {
                updateData.is_match_ready = true;
                grundlagenMessage = ' 🎉 Grundlagen abgeschlossen - Wettkämpfe freigeschaltet!';
            } else {
                grundlagenMessage = ` (${grundlagenCount}/5 Grundlagen - noch ${remaining} bis Wettkämpfe)`;
            }
        }

        await db.from('profiles').update(updateData).eq('id', playerId);

        const historyEntry = {
            user_id: playerId,
            points: actualPointsChange,
            xp: actualXPChange,
            elo_change: 0,
            reason,
            timestamp: new Date().toISOString(),
            awarded_by: `${currentUserData.firstName} ${currentUserData.lastName}`,
        };

        const currentSeasonKey = await getCurrentSeasonKey(db);

        if (exerciseId) {
            await db.from('completed_exercises').upsert({
                user_id: playerId,
                exercise_id: exerciseId,
                completed_at: new Date().toISOString(),
                season_key: currentSeasonKey,
            });

            const eOption = document.getElementById('exercise-select').options[document.getElementById('exercise-select').selectedIndex];
            if (eOption?.dataset.hasMilestones === 'true') {
                const milestoneCountInput = document.getElementById('milestone-count-input');
                const enteredCount = parseInt(milestoneCountInput?.value);

                if (enteredCount) {
                    await db.from('exercise_milestones').upsert({
                        user_id: playerId,
                        exercise_id: exerciseId,
                        current_count: enteredCount,
                        last_updated: new Date().toISOString(),
                        last_season_updated: currentSeasonKey,
                    });

                    const { data: exerciseData } = await db
                        .from('exercises')
                        .select('record_count, record_holder_name')
                        .eq('id', exerciseId)
                        .single();

                    if (exerciseData && enteredCount > (exerciseData.record_count || 0)) {
                        const playerName = `${playerData.first_name} ${playerData.last_name}`;

                        let clubName = null;
                        if (playerData.club_id) {
                            const { data: clubData } = await db
                                .from('clubs')
                                .select('name')
                                .eq('id', playerData.club_id)
                                .single();
                            clubName = clubData?.name;
                        }

                        await db.from('exercises').update({
                            record_count: enteredCount,
                            record_holder_name: playerName,
                            record_holder_club: clubName,
                            record_holder_id: playerId,
                            record_updated_at: new Date().toISOString(),
                        }).eq('id', exerciseId);
                    }
                }
            }
        }

        if (challengeId) {
            await db.from('completed_challenges').upsert({
                user_id: playerId,
                challenge_id: challengeId,
                completed_at: new Date().toISOString(),
                season_key: currentSeasonKey,
            });

            const cOption = document.getElementById('challenge-select').options[document.getElementById('challenge-select').selectedIndex];
            if (cOption?.dataset.hasMilestones === 'true') {
                const milestoneCountInput = document.getElementById('milestone-count-input');
                const enteredCount = parseInt(milestoneCountInput?.value);

                if (enteredCount) {
                    await db.from('challenge_milestones').upsert({
                        user_id: playerId,
                        challenge_id: challengeId,
                        current_count: enteredCount,
                        last_updated: new Date().toISOString(),
                        last_season_updated: currentSeasonKey,
                    });
                }
            }
        }

        let partnerName = '';
        let actualPartnerPointsChange = 0;
        let actualPartnerXPChange = 0;

        if (hasPartnerSystem && partnerId) {
            const { data: partnerData } = await db
                .from('profiles')
                .select('*')
                .eq('id', partnerId)
                .single();

            if (partnerData) {
                const partnerPoints = Math.round(actualPointsChange * (partnerPercentage / 100));
                const partnerXP = Math.round(actualXPChange * (partnerPercentage / 100));

                const currentPartnerPoints = partnerData.points || 0;
                const currentPartnerXP = partnerData.xp || 0;

                actualPartnerPointsChange = Math.max(-currentPartnerPoints, partnerPoints);
                actualPartnerXPChange = Math.max(-currentPartnerXP, partnerXP);
                partnerName = `${partnerData.first_name} ${partnerData.last_name}`;

                await db.from('profiles').update({
                    points: currentPartnerPoints + actualPartnerPointsChange,
                    xp: currentPartnerXP + actualPartnerXPChange,
                    last_xp_update: new Date().toISOString(),
                }).eq('id', partnerId);

                const activePlayerName = `${playerData.first_name} ${playerData.last_name}`;
                const partnerReason = `🤝 Partner: ${reason} (mit ${activePlayerName})`;

                await db.from('points_history').insert({
                    user_id: partnerId,
                    points: actualPartnerPointsChange,
                    xp: actualPartnerXPChange,
                    elo_change: 0,
                    reason: partnerReason,
                    timestamp: new Date().toISOString(),
                    awarded_by: `${currentUserData.firstName} ${currentUserData.lastName}`,
                    is_partner: true,
                    partner_id: playerId,
                });

                historyEntry.reason = `💪 ${reason} (Partner: ${partnerName})`;
                historyEntry.is_active_player = true;
                historyEntry.partner_id = partnerId;
            }
        }

        await db.from('points_history').insert(historyEntry);

        // Manuelle Punkte werden nicht zur Training-Summary hinzugefügt
        // (keine Event-ID verfügbar)

        const notifMod = await getNotificationsModule();
        if (notifMod && notifMod.createPointsNotification) {
            try {
                await notifMod.createPointsNotification(
                    playerId,
                    actualPointsChange,
                    actualXPChange,
                    0,
                    reason,
                    `${currentUserData.firstName} ${currentUserData.lastName}`
                );

                if (hasPartnerSystem && partnerId && partnerName) {
                    const partnerReason = `Partner: ${reason} (mit ${playerData.first_name} ${playerData.last_name})`;
                    await notifMod.createPointsNotification(
                        partnerId,
                        actualPartnerPointsChange,
                        actualPartnerXPChange,
                        0,
                        partnerReason,
                        `${currentUserData.firstName} ${currentUserData.lastName}`
                    );
                }
            } catch (notifError) {
                console.warn('Could not create notification:', notifError);
            }
        }

        const sign = actualPointsChange >= 0 ? '+' : '';
        let feedbackText = `Erfolgreich ${sign}${actualPointsChange} Punkte vergeben!`;

        if (actualXPChange !== actualPointsChange) {
            const xpSign = actualXPChange >= 0 ? '+' : '';
            feedbackText += ` (${xpSign}${actualXPChange} XP)`;
        }

        if (hasPartnerSystem && partnerId && partnerName) {
            const partnerSign = actualPartnerPointsChange >= 0 ? '+' : '';
            feedbackText += ` | Partner ${partnerName}: ${partnerSign}${actualPartnerPointsChange} Punkte`;
            if (actualPartnerXPChange !== actualPartnerPointsChange) {
                const partnerXpSign = actualPartnerXPChange >= 0 ? '+' : '';
                feedbackText += ` (${partnerXpSign}${actualPartnerXPChange} XP)`;
            }
        }

        feedbackText += grundlagenMessage;

        feedbackEl.textContent = feedbackText;
        feedbackEl.className = actualPointsChange >= 0
            ? 'mt-3 text-sm font-medium text-center text-green-600'
            : 'mt-3 text-sm font-medium text-center text-orange-600';
        e.target.reset();

        // Reset checkboxes
        document.querySelectorAll('.points-player-checkbox:checked').forEach(cb => { cb.checked = false; });
        const countEl = document.getElementById('points-player-count');
        if (countEl) countEl.textContent = '0 ausgewählt';

        const manualToggle = document.getElementById('manual-partner-toggle');
        const manualContainer = document.getElementById('manual-partner-container');
        const manualPercentage = document.getElementById('manual-partner-percentage');
        if (manualToggle) manualToggle.checked = false;
        if (manualContainer) manualContainer.classList.add('hidden');
        if (manualPercentage) manualPercentage.value = 50;

        handleReasonChangeCallback();
    } catch (error) {
        console.error('Fehler bei der Punktevergabe:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }

    setTimeout(() => {
        feedbackEl.textContent = '';
    }, 4000);
}

/**
 * Batch-Punktevergabe für mehrere Spieler gleichzeitig.
 * Berechnet Punkte einmal und wendet sie auf alle ausgewählten Spieler an.
 * Partner-System wird bei Mehrfachauswahl nicht unterstützt.
 */
async function handleBatchPointsSubmit(playerIds, reasonType, db, currentUserData, feedbackEl, handleReasonChangeCallback) {
    let points = 0;
    let xpChange = 0;
    let reason = '';
    let challengeId = null;
    let exerciseId = null;

    try {
        // Punkte und Grund einmal berechnen (gleich für alle Spieler)
        switch (reasonType) {
            case 'challenge': {
                const cSelect = document.getElementById('challenge-select');
                const cOption = cSelect.options[cSelect.selectedIndex];
                if (!cOption || !cOption.value) throw new Error('Bitte eine Challenge auswählen.');

                if (cOption.dataset.hasMilestones === 'true') {
                    const enteredCount = parseInt(document.getElementById('milestone-count-input')?.value);
                    if (!enteredCount || enteredCount <= 0) throw new Error('Bitte Anzahl eingeben.');
                    const milestones = JSON.parse(cOption.dataset.milestones || '[]');
                    const achieved = milestones.filter(m => enteredCount >= m.count);
                    if (achieved.length === 0) throw new Error('Kein Meilenstein erreicht.');
                    points = achieved.reduce((sum, m) => sum + m.points, 0);
                    reason = `Challenge: ${cOption.dataset.title} (${enteredCount}×)`;
                } else {
                    points = parseInt(cOption.dataset.points);
                    reason = `Challenge: ${cOption.dataset.title}`;
                }
                xpChange = points;
                challengeId = cOption.value;
                break;
            }
            case 'exercise': {
                const eSelect = document.getElementById('exercise-select');
                const eOption = eSelect.options[eSelect.selectedIndex];
                if (!eOption || !eOption.value) throw new Error('Bitte eine Übung auswählen.');

                if (eOption.dataset.hasMilestones === 'true') {
                    const enteredCount = parseInt(document.getElementById('milestone-count-input')?.value);
                    if (!enteredCount || enteredCount <= 0) throw new Error('Bitte Anzahl eingeben.');
                    const milestones = JSON.parse(eOption.dataset.milestones || '[]');
                    const achieved = milestones.filter(m => enteredCount >= m.count);
                    if (achieved.length === 0) throw new Error('Kein Meilenstein erreicht.');
                    points = achieved.reduce((sum, m) => sum + m.points, 0);
                    reason = `Übung: ${eOption.dataset.title} (${enteredCount}×)`;
                } else {
                    points = parseInt(eOption.dataset.points);
                    reason = `Übung: ${eOption.dataset.title}`;
                }
                xpChange = points;
                exerciseId = eOption.value;
                break;
            }
            case 'manual': {
                points = parseInt(document.getElementById('manual-points').value);
                xpChange = points;
                reason = document.getElementById('manual-reason').value;
                if (!reason || isNaN(points)) throw new Error('Grund und gültige Punkte angeben.');
                break;
            }
        }

        // Fortschrittsanzeige
        feedbackEl.textContent = `Vergebe Punkte an ${playerIds.length} Spieler...`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-indigo-600';

        const currentSeasonKey = await getCurrentSeasonKey(db);
        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        const notifMod = await getNotificationsModule();

        for (const playerId of playerIds) {
            try {
                const { data: playerData, error: playerError } = await db
                    .from('profiles')
                    .select('*')
                    .eq('id', playerId)
                    .single();

                if (playerError || !playerData) {
                    errors.push('Spieler nicht gefunden');
                    errorCount++;
                    continue;
                }

                const currentPoints = playerData.points || 0;
                const currentXP = playerData.xp || 0;
                const actualPointsChange = Math.max(-currentPoints, points);
                const actualXPChange = Math.max(-currentXP, xpChange);

                const updateData = {
                    points: currentPoints + actualPointsChange,
                    xp: currentXP + actualXPChange,
                    last_xp_update: new Date().toISOString(),
                };

                // Grundlagen-Tracking
                if (exerciseId) {
                    const { data: exData } = await db.from('exercises').select('category').eq('id', exerciseId).single();
                    if (exData && (exData.category || '').toLowerCase().includes('grundlage')) {
                        let gc = playerData.grundlagen_completed || 0;
                        if (gc < 5) {
                            gc++;
                            updateData.grundlagen_completed = gc;
                            if (gc >= 5) updateData.is_match_ready = true;
                        }
                    }
                }

                await db.from('profiles').update(updateData).eq('id', playerId);

                // Points history
                await db.from('points_history').insert({
                    user_id: playerId,
                    points: actualPointsChange,
                    xp: actualXPChange,
                    elo_change: 0,
                    reason,
                    timestamp: new Date().toISOString(),
                    awarded_by: `${currentUserData.firstName} ${currentUserData.lastName}`,
                });

                // Completed exercises/challenges
                if (exerciseId) {
                    await db.from('completed_exercises').upsert({
                        user_id: playerId, exercise_id: exerciseId,
                        completed_at: new Date().toISOString(), season_key: currentSeasonKey,
                    });
                }
                if (challengeId) {
                    await db.from('completed_challenges').upsert({
                        user_id: playerId, challenge_id: challengeId,
                        completed_at: new Date().toISOString(), season_key: currentSeasonKey,
                    });
                }

                // Notification
                if (notifMod && notifMod.createPointsNotification) {
                    try {
                        await notifMod.createPointsNotification(
                            playerId, actualPointsChange, actualXPChange, 0, reason,
                            `${currentUserData.firstName} ${currentUserData.lastName}`
                        );
                    } catch (_) { /* silent */ }
                }

                successCount++;
                feedbackEl.textContent = `${successCount}/${playerIds.length} Spieler verarbeitet...`;
            } catch (err) {
                errorCount++;
                errors.push(err.message);
            }
        }

        // Ergebnis anzeigen
        const sign = points >= 0 ? '+' : '';
        if (errorCount === 0) {
            feedbackEl.textContent = `${sign}${points} Punkte an ${successCount} Spieler vergeben!`;
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-green-600';
        } else {
            feedbackEl.textContent = `${successCount} erfolgreich, ${errorCount} Fehler. ${errors[0] || ''}`;
            feedbackEl.className = 'mt-3 text-sm font-medium text-center text-orange-600';
        }

        // Form reset
        const form = document.getElementById('points-form');
        if (form) form.reset();
        // Checkboxen deselektieren
        document.querySelectorAll('.points-player-checkbox:checked').forEach(cb => { cb.checked = false; });
        const countEl = document.getElementById('points-player-count');
        if (countEl) countEl.textContent = '0 ausgewählt';

        handleReasonChangeCallback();
    } catch (error) {
        console.error('Batch Punktevergabe Fehler:', error);
        feedbackEl.textContent = `Fehler: ${error.message}`;
        feedbackEl.className = 'mt-3 text-sm font-medium text-center text-red-600';
    }

    setTimeout(() => { feedbackEl.textContent = ''; }, 5000);
}

/** Verarbeitet Änderungen der Grundauswahl im Punkteformular */
export function handleReasonChange() {
    const value = document.getElementById('reason-select').value;
    const challengeContainer = document.getElementById('challenge-select-container');
    const exerciseContainer = document.getElementById('exercise-select-container');
    const manualContainer = document.getElementById('manual-points-container');
    const milestoneContainer = document.getElementById('milestone-select-container');

    const challengeSelect = document.getElementById('challenge-select');
    const exerciseSelect = document.getElementById('exercise-select');

    if (challengeContainer) challengeContainer.classList.toggle('hidden', value !== 'challenge');
    if (exerciseContainer) exerciseContainer.classList.toggle('hidden', value !== 'exercise');
    if (manualContainer) manualContainer.classList.toggle('hidden', value !== 'manual');
    if (milestoneContainer) milestoneContainer.classList.add('hidden');

    if (challengeSelect) {
        if (value === 'challenge') {
            challengeSelect.setAttribute('required', 'required');
        } else {
            challengeSelect.removeAttribute('required');
        }
    }

    if (exerciseSelect) {
        if (value === 'exercise') {
            exerciseSelect.setAttribute('required', 'required');
        } else {
            exerciseSelect.removeAttribute('required');
        }
    }
}

/** Initialisiert die Meilenstein-Auswahl-Logik */
export function setupMilestoneSelectors(db) {
    const exerciseSelect = document.getElementById('exercise-select');
    const challengeSelect = document.getElementById('challenge-select');
    const playerSelect = document.getElementById('player-select');
    const partnerSelect = document.getElementById('partner-select');

    if (exerciseSelect) {
        exerciseSelect.addEventListener('change', () => {
            handleExerciseChallengeChange(db, 'exercise');
        });
    }

    if (challengeSelect) {
        challengeSelect.addEventListener('change', () => {
            handleExerciseChallengeChange(db, 'challenge');
        });
    }

    if (playerSelect) {
        playerSelect.addEventListener('change', () => {
            const reasonType = document.getElementById('reason-select').value;

            const activePlayerName = document.getElementById('active-player-name');
            if (activePlayerName) {
                activePlayerName.textContent = playerSelect.value
                    ? playerSelect.options[playerSelect.selectedIndex].text
                    : '-';
            }

            if (reasonType === 'exercise' || reasonType === 'challenge') {
                handleExerciseChallengeChange(db, reasonType);
            }
        });
    }

    if (partnerSelect) {
        partnerSelect.addEventListener('change', () => {
            const passivePlayerName = document.getElementById('passive-player-name');
            if (passivePlayerName) {
                passivePlayerName.textContent = partnerSelect.value
                    ? partnerSelect.options[partnerSelect.selectedIndex].text
                    : '-';
            }
        });
    }
}

/** Verarbeitet Übungs-/Challenge-Auswahl und zeigt Meilensteine */
async function handleExerciseChallengeChange(db, type) {
    const select = document.getElementById(`${type}-select`);
    const milestoneContainer = document.getElementById('milestone-select-container');
    const milestoneCountInput = document.getElementById('milestone-count-input');
    const playerSelect = document.getElementById('player-select');

    if (!select || !milestoneContainer || !milestoneCountInput) return;

    const selectedOption = select.options[select.selectedIndex];
    const hasMilestones = selectedOption?.dataset.hasMilestones === 'true';

    if (!hasMilestones || !selectedOption.value) {
        milestoneContainer.classList.add('hidden');

        if (selectedOption.value) {
            await showCompletionStatus(db, type, selectedOption.value, playerSelect?.value);
        } else {
            hideCompletionStatus();
        }
    } else {
        hideCompletionStatus();
        milestoneContainer.classList.remove('hidden');

        // Label mit korrekter Einheit aktualisieren
        const unit = selectedOption.dataset.unit || 'Wiederholungen';
        const milestoneLabel = document.querySelector('label[for="milestone-count-input"]');
        if (milestoneLabel) {
            milestoneLabel.textContent = `🎯 Wie viele ${unit} wurden geschafft?`;
        }

        const milestones = JSON.parse(selectedOption.dataset.milestones || '[]');
        const itemId = selectedOption.value;
        const playerId = playerSelect?.value;

        let playerProgress = { currentCount: 0 };
        if (playerId) {
            const collectionName = type === 'exercise' ? 'exercise_milestones' : 'challenge_milestones';
            playerProgress = await getMilestoneProgress(db, playerId, collectionName, itemId, type);
        }

        milestoneCountInput.value = '';
        milestoneCountInput.dataset.milestones = JSON.stringify(milestones);

        const currentSeasonKey = await getCurrentSeasonKey(db);
        const progressSeasonKey = playerProgress.lastSeasonUpdated || '';
        const isCurrentSeason = progressSeasonKey === currentSeasonKey;
        const currentCount = isCurrentSeason ? playerProgress.currentCount || 0 : 0;

        milestoneCountInput.dataset.currentCount = currentCount;

        await updateMilestoneProgressDisplay(playerProgress, milestones, db);
        setupMilestoneCountInputListener(milestones, currentCount);
    }

    const partnerContainer = document.getElementById('partner-select-container');
    if (!partnerContainer) return;

    const hasPartnerSystem = selectedOption?.dataset.hasPartnerSystem === 'true';
    const partnerPercentage = parseInt(selectedOption?.dataset.partnerPercentage) || 50;

    if (!hasPartnerSystem || !selectedOption.value) {
        partnerContainer.classList.add('hidden');
        return;
    }

    partnerContainer.classList.remove('hidden');

    const percentageDisplay = document.getElementById('partner-percentage');
    if (percentageDisplay) {
        percentageDisplay.textContent = partnerPercentage;
    }

    const playerId = playerSelect?.value;
    const activePlayerName = document.getElementById('active-player-name');
    if (activePlayerName) {
        activePlayerName.textContent = playerId
            ? playerSelect.options[playerSelect.selectedIndex].text
            : '-';
    }

    await populatePartnerDropdown(db, playerId);
}

/** Lädt den Meilenstein-Fortschritt eines Spielers */
async function getMilestoneProgress(db, playerId, tableName, itemId, type) {
    try {
        const idColumn = type === 'exercise' ? 'exercise_id' : 'challenge_id';
        const { data } = await db
            .from(tableName)
            .select('*')
            .eq('user_id', playerId)
            .eq(idColumn, itemId)
            .single();

        if (data) {
            return {
                currentCount: data.current_count || 0,
                completedMilestones: data.completed_milestones || [],
                lastSeasonUpdated: data.last_season_updated || '',
            };
        }
    } catch (error) {
        console.error('Error loading milestone progress:', error);
    }

    return { currentCount: 0, completedMilestones: [], lastSeasonUpdated: '' };
}

/** Initialisiert den Meilenstein-Eingabe-Listener */
function setupMilestoneCountInputListener(milestones, currentCount) {
    const milestoneCountInput = document.getElementById('milestone-count-input');
    const progressText = document.getElementById('milestone-progress-text');
    const pointsText = document.getElementById('milestone-points-text');

    if (!milestoneCountInput) return;

    const newInput = milestoneCountInput.cloneNode(true);
    milestoneCountInput.parentNode.replaceChild(newInput, milestoneCountInput);

    newInput.addEventListener('input', () => {
        const enteredCount = parseInt(newInput.value) || 0;

        if (enteredCount === 0 || !newInput.value) {
            if (progressText) progressText.textContent = '-';
            if (pointsText) pointsText.textContent = '0 P.';
            return;
        }

        const achievedMilestones = milestones.filter(m => enteredCount >= m.count);
        let totalPoints = achievedMilestones.reduce((sum, m) => sum + m.points, 0);

        if (achievedMilestones.length > 0) {
            const milestoneTexts = achievedMilestones.map(m => `${m.count}× (${m.points}P)`).join(', ');
            if (progressText) {
                progressText.textContent = `${enteredCount}× → Erreicht: ${milestoneTexts}`;
            }
            if (pointsText) {
                pointsText.textContent = `${totalPoints} P.`;
            }
        } else {
            if (progressText) {
                progressText.textContent = `${enteredCount}× (kein Meilenstein erreicht)`;
            }
            if (pointsText) {
                pointsText.textContent = '0 P.';
            }
        }
    });
}

/** Aktualisiert die Meilenstein-Fortschrittsanzeige */
async function updateMilestoneProgressDisplay(progress, milestones, db) {
    const progressText = document.getElementById('milestone-progress-text');

    if (progressText) {
        const currentSeasonKey = await getCurrentSeasonKey(db);
        const progressSeasonKey = progress.lastSeasonUpdated || '';

        const isCurrentSeason = progressSeasonKey === currentSeasonKey;
        const currentCount = isCurrentSeason ? progress.currentCount || 0 : 0;

        const nextMilestone = milestones.find(m => m.count > currentCount);

        if (!isCurrentSeason && progress.currentCount > 0) {
            progressText.textContent = `Fortschritt: 0×`;
        } else if (nextMilestone) {
            progressText.textContent = `${currentCount}/${nextMilestone.count} (noch ${nextMilestone.count - currentCount}× bis nächster Meilenstein)`;
        } else if (currentCount >= milestones[milestones.length - 1]?.count) {
            progressText.textContent = `${currentCount}× - Alle Meilensteine erreicht! 🎉`;
        } else {
            progressText.textContent = `${currentCount}× erreicht`;
        }
    }
}

/** Befüllt das Partner-Dropdown */
async function populatePartnerDropdown(db, activePlayerId) {
    const partnerSelect = document.getElementById('partner-select');
    if (!partnerSelect) return;

    partnerSelect.innerHTML = '<option value="">Kein Partner (Spieler trainiert alleine oder mit Trainer)</option>';

    if (!activePlayerId) return;

    try {
        const { data: activePlayerData } = await db
            .from('profiles')
            .select('club_id')
            .eq('id', activePlayerId)
            .single();

        if (!activePlayerData) return;

        const clubId = activePlayerData.club_id;

        const { data: playersData } = await db
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach', 'head_coach'])
            .neq('id', activePlayerId);

        if (playersData) {
            playersData.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.first_name} ${player.last_name}`;
                partnerSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error populating partner dropdown:', error);
    }
}

/** Befüllt das manuelle Partner-Dropdown */
async function populateManualPartnerDropdown(db, activePlayerId) {
    const partnerSelect = document.getElementById('manual-partner-select');
    if (!partnerSelect) return;

    partnerSelect.innerHTML = '<option value="">Kein Partner (Spieler trainiert alleine oder mit Trainer)</option>';

    if (!activePlayerId) return;

    try {
        const { data: activePlayerData } = await db
            .from('profiles')
            .select('club_id')
            .eq('id', activePlayerId)
            .single();

        if (!activePlayerData) return;

        const clubId = activePlayerData.club_id;

        const { data: playersData } = await db
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('club_id', clubId)
            .in('role', ['player', 'coach', 'head_coach'])
            .neq('id', activePlayerId);

        if (playersData) {
            playersData.forEach(player => {
                const option = document.createElement('option');
                option.value = player.id;
                option.textContent = `${player.first_name} ${player.last_name}`;
                partnerSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error populating manual partner dropdown:', error);
    }
}

/** Initialisiert das manuelle Partner-System */
export function setupManualPartnerSystem(db) {
    const toggle = document.getElementById('manual-partner-toggle');
    const container = document.getElementById('manual-partner-container');
    const playerSelect = document.getElementById('player-select');

    if (!toggle || !container) return;

    toggle.addEventListener('change', () => {
        if (toggle.checked) {
            container.classList.remove('hidden');
            const playerId = playerSelect?.value;
            if (playerId) {
                populateManualPartnerDropdown(db, playerId);
            }
        } else {
            container.classList.add('hidden');
        }
    });

    if (playerSelect) {
        playerSelect.addEventListener('change', () => {
            if (toggle.checked) {
                populateManualPartnerDropdown(db, playerSelect.value);
            }
        });
    }
}

/** Zeigt Abschlussstatus für Übungen/Challenges ohne Meilensteine */
async function showCompletionStatus(db, type, itemId, playerId) {
    const container = document.getElementById('completion-status-container');
    const statusText = document.getElementById('completion-status-text');

    if (!container || !statusText) return;

    if (!playerId) {
        container.classList.add('hidden');
        return;
    }

    try {
        const tableName = type === 'exercise' ? 'completed_exercises' : 'completed_challenges';
        const idColumn = type === 'exercise' ? 'exercise_id' : 'challenge_id';

        const { data: completionData } = await db
            .from(tableName)
            .select('*')
            .eq('user_id', playerId)
            .eq(idColumn, itemId)
            .single();

        const currentSeasonKey = await getCurrentSeasonKey(db);

        if (completionData) {
            const completedSeasonKey = completionData.season_key || '';
            const isCurrentSeason = completedSeasonKey === currentSeasonKey;

            if (isCurrentSeason) {
                const completedDate = formatDate(completionData.completed_at) || '(unbekannt)';
                statusText.innerHTML = `
                    <div class="flex items-start gap-2">
                        <span class="text-xl">✅</span>
                        <div class="flex-1">
                            <div class="font-semibold text-blue-900">Abgeschlossen am ${completedDate}</div>
                        </div>
                    </div>
                `;
            } else {
                statusText.innerHTML = `
                    <div class="flex items-start gap-2">
                        <span class="text-xl">🆕</span>
                        <div class="flex-1">
                            <div class="font-semibold text-blue-900">Wieder verfügbar!</div>
                        </div>
                    </div>
                `;
            }
        } else {
            statusText.innerHTML = `
                <div class="flex items-start gap-2">
                    <span class="text-xl">⭕</span>
                    <div class="flex-1">
                        <div class="font-semibold text-blue-900">Noch nicht abgeschlossen</div>
                    </div>
                </div>
            `;
        }

        container.classList.remove('hidden');
    } catch (error) {
        console.error('Error loading completion status:', error);
        container.classList.add('hidden');
    }
}

/** Versteckt den Abschlussstatus-Container */
function hideCompletionStatus() {
    const container = document.getElementById('completion-status-container');
    if (container) {
        container.classList.add('hidden');
    }
}
